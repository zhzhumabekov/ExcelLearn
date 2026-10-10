import json
from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from pydantic import ValidationError

from apps.preferences.models import Preferences
from lessons.loader import ContentError
from lessons.registry import Registry, get_registry
from lessons.schema import Theory
from lessons.theory import MANIFEST, figure_hash, figure_lesson, frame_errors, load_theory, png_size

STATIC = Path(settings.STATICFILES_DIRS[0])
CH01 = get_registry().theory["ch01"]


def page(client, chapter="ch01"):
    return client.get(reverse("catalog:theory", args=[chapter]))


def figure_spec(fid="table", **extra):
    return {"id": fid, "caption": "Подпись", "sheet": {"cells": {"A1": 1}}, **extra}


def theory_spec(**extra):
    return {
        "chapter": "ch01",
        "title": "Теория",
        "minutes": 5,
        "intro": "Зачем",
        "sections": [{"title": "Раздел", "text": "<p>Текст</p>", "figure": figure_spec()}],
        **extra,
    }


# ---------- Страница ----------


def test_theory_page_has_sections_figures_terms_and_questions(client):
    response = page(client)

    assert response.status_code == 200
    html = response.content.decode()
    assert CH01.title in html
    assert all(section.title in html for section in CH01.sections)
    assert html.count("data-figure=") == len(CH01.figures) >= 3
    assert html.count("data-question") == len(CH01.questions)
    assert "Словарик" in html
    # Формулы в тексте — на языке ученика (гость — русский)
    assert "=СУММ(D2:D4)" in html
    # Первая ссылка «дальше» — на первый урок главы
    first = get_registry().chapters[1].lessons[0]
    assert reverse("catalog:lesson", args=[first.id]) in html


def test_figures_are_shown_at_half_of_double_density_size(client):
    html = page(client).content.decode()

    width, height = png_size(STATIC / "theory/ch01/window-ru.png")
    assert width > 0
    assert 'src="/static/theory/ch01/window-ru.png"' in html
    assert f'width="{width // 2}" height="{height // 2}"' in html


@pytest.mark.django_db
def test_english_functions_user_sees_english_frames_and_formulas(client):
    user = get_user_model().objects.create_user(
        email="en@example.kz", password="x", first_name="А", last_name="Б", phone="+77010000009"
    )
    Preferences.objects.create(user=user, function_locale="en")
    client.force_login(user)

    html = page(client).content.decode()

    assert "/static/theory/ch01/window-en.png" in html
    assert "=SUM(D2:D4)" in html


def test_theory_for_chapter_without_it_is_404(client):
    assert page(client, "ch00").status_code == 404
    assert page(client, "no-such-chapter").status_code == 404


def test_course_links_to_theory_before_lessons(client):
    html = client.get(reverse("catalog:course")).content.decode()

    for chapter_id in get_registry().theory:
        url = reverse("catalog:theory", args=[chapter_id])
        first_lesson = next(e for e in get_registry().chapters if e.chapter.id == chapter_id).lessons[0]
        assert html.index(url) < html.index(reverse("catalog:lesson", args=[first_lesson.id]))


def test_only_first_lesson_of_chapter_invites_to_theory(client):
    lessons = next(e for e in get_registry().chapters if e.chapter.id == "ch01").lessons

    first = client.get(reverse("catalog:lesson", args=[lessons[0].id])).content.decode()
    second = client.get(reverse("catalog:lesson", args=[lessons[1].id])).content.decode()

    assert 'data-testid="chapter-theory"' in first
    assert 'data-testid="chapter-theory"' not in second


# ---------- Контент и кадры ----------


def test_frames_of_course_theory_are_up_to_date():
    """Правили YAML теории — пересняли кадры: manage.py theory_frames."""
    assert frame_errors(load_theory(Path(settings.CONTENT_DIR)), STATIC) == []


def test_frame_errors_report_missing_and_stale_frames(tmp_path):
    theory = Theory.model_validate(theory_spec())
    path = Path("ch01.yaml")

    assert frame_errors([(path, theory)], tmp_path) == [
        "ch01.yaml: кадр table не снят или устарел — manage.py theory_frames"
    ]

    for locale in ("ru", "en"):
        frame = tmp_path / f"theory/ch01/table-{locale}.png"
        frame.parent.mkdir(parents=True, exist_ok=True)
        frame.write_bytes(b"")
    (tmp_path / "theory" / MANIFEST).write_text(json.dumps({"ch01/table": figure_hash(theory.figures[0])}))
    assert frame_errors([(path, theory)], tmp_path) == []

    changed = Theory.model_validate(theory_spec(sections=[{"title": "Р", "text": "Т", "figure": figure_spec(
        sheet={"cells": {"A1": 2}})}]))  # fmt: skip
    assert len(frame_errors([(path, changed)], tmp_path)) == 1


def test_caption_change_does_not_require_new_frames():
    a = Theory.model_validate(theory_spec()).figures[0]
    b = Theory.model_validate(theory_spec(sections=[{"title": "Р", "text": "Т", "figure": figure_spec(
        caption="Другая подпись")}])).figures[0]  # fmt: skip
    assert figure_hash(a) == figure_hash(b)


def test_figure_becomes_one_step_lesson_with_its_actions():
    figure = Theory.model_validate(
        theory_spec(sections=[{"title": "Р", "text": "Т", "figure": figure_spec(actions=[{"click": "A1"}])}])
    ).figures[0]

    lesson = figure_lesson("ch01", figure)

    assert lesson.id == "ch01-table" and len(lesson.steps) == 1
    assert lesson.steps[0].actions[0].model_dump() == {"click": "A1"}


def test_duplicate_figure_ids_are_rejected():
    section = {"title": "Р", "text": "Т", "figure": figure_spec()}
    with pytest.raises(ValidationError, match="повторяются id кадров: table"):
        Theory.model_validate(theory_spec(sections=[section, section]))


def test_bad_figure_action_is_reported_with_file_name(tmp_path):
    (tmp_path / "theory").mkdir()
    bad = theory_spec(sections=[{"title": "Р", "text": "Т", "figure": figure_spec(actions=[{"fill": "A1:B2"}])}])
    (tmp_path / "theory" / "ch01.yaml").write_text(json.dumps(bad, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(ContentError, match="ch01.yaml"):
        load_theory(tmp_path)


def test_registry_rejects_theory_for_unknown_or_repeated_chapter():
    registry = get_registry()
    theory = Theory.model_validate(theory_spec())
    other = Theory.model_validate(theory_spec(chapter="ch99"))

    with pytest.raises(ContentError, match="уже в a.yaml"):
        Registry(registry.course, [], [], [(Path("a.yaml"), theory), (Path("b.yaml"), theory)])
    with pytest.raises(ContentError, match="главы «ch99» нет"):
        Registry(registry.course, [], [], [(Path("c.yaml"), other)])
