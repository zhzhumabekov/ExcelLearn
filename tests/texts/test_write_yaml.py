"""Кнопка «Записать в YAML»: правка из базы переносится в файл урока (и для генератора — в text_edits.yaml)."""

import importlib.util
import shutil
from pathlib import Path

import pytest
import yaml
from django.conf import settings as django_settings
from django.urls import reverse

from apps.texts.models import LessonText
from apps.texts.services import lesson_texts
from lessons.registry import get_registry

HAND_ID, HAND_FILE = "wages-weekly-salary", "01-01-wages.yaml"  # глава 1: YAML написан вручную
GEN_ID, GEN_FILE = "serial-dates", "07-01-serial-dates.yaml"  # глава 7: YAML собирает gen_ch07.py


def load_text_edits_module():
    path = Path(django_settings.BASE_DIR) / "scripts" / "content" / "text_edits.py"
    spec = importlib.util.spec_from_file_location("text_edits", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def content(tmp_path, settings):
    """Копия content/ — тесты пишут в неё, а не в файлы курса."""
    shutil.copytree(settings.CONTENT_DIR, tmp_path / "content")
    settings.CONTENT_DIR = tmp_path / "content"
    settings.TEXT_EDITS_PATH = tmp_path / "text_edits.yaml"
    settings.TEXTS_WRITE_YAML = True
    get_registry.cache_clear()
    yield tmp_path
    get_registry.cache_clear()


@pytest.fixture
def admin(client, django_user_model):
    user = django_user_model.objects.create_superuser(
        email="admin@example.kz", password="x", first_name="А", last_name="Б", phone="+77010000009", full_access=True
    )
    client.force_login(user)
    return client


def make_edit(lesson_id, field, text):
    original = lesson_texts(get_registry().get(lesson_id))[field]
    return LessonText.objects.create(lesson_id=lesson_id, field=field, original=original, text=text)


def write(client, lesson_id):
    return client.post(reverse("admin:texts_lesson_write_yaml", kwargs={"lesson_id": lesson_id}), follow=True)


def test_handwritten_lesson_keeps_comments_and_layout(content, admin):
    path = content / "content" / "lessons" / HAND_FILE
    before = path.read_text(encoding="utf-8")
    make_edit(HAND_ID, "steps.0.text", "Новая <b>ситуация</b> в кафе.")
    make_edit(HAND_ID, "steps.2.title", "Копирование: Ctrl+C и вставка")

    response = write(admin, HAND_ID)

    assert "записано полей — 2 в 01-01-wages.yaml" in response.content.decode()
    after = path.read_text(encoding="utf-8")
    assert after.splitlines()[0] == before.splitlines()[0]  # комментарий-шапка на месте
    assert len(after.splitlines()) <= len(before.splitlines())
    lesson = get_registry().get(HAND_ID)
    assert lesson.steps[0].text == "Новая <b>ситуация</b> в кафе."
    assert lesson.steps[2].title == "Копирование: Ctrl+C и вставка"
    assert not LessonText.objects.exists()
    assert not (content / "text_edits.yaml").exists()  # генератора у главы 1 нет


def test_generated_lesson_records_edit_for_generator(content, admin):
    original = get_registry().get(GEN_ID).steps[0].text
    make_edit(GEN_ID, "steps.0.text", "Банк-клиент выгрузил платежи с числами вместо дат.")

    write(admin, GEN_ID)

    data = yaml.safe_load((content / "content" / "lessons" / GEN_FILE).read_text(encoding="utf-8"))
    assert data["steps"][0]["text"] == "Банк-клиент выгрузил платежи с числами вместо дат."
    edits = yaml.safe_load((content / "text_edits.yaml").read_text(encoding="utf-8"))
    assert edits == {
        GEN_ID: {"steps.0.text": {"original": original, "text": "Банк-клиент выгрузил платежи с числами вместо дат."}}
    }


def test_second_edit_keeps_generator_original(content, admin):
    original = get_registry().get(GEN_ID).title
    make_edit(GEN_ID, "title", "Первая правка")
    write(admin, GEN_ID)
    make_edit(GEN_ID, "title", "Вторая правка")  # original теперь — «Первая правка» из YAML

    write(admin, GEN_ID)

    edits = yaml.safe_load((content / "text_edits.yaml").read_text(encoding="utf-8"))
    assert edits[GEN_ID]["title"] == {"original": original, "text": "Вторая правка"}


def test_stale_edit_is_not_written(content, admin):
    LessonText.objects.create(lesson_id=HAND_ID, field="steps.0.text", original="старый", text="правка")
    path = content / "content" / "lessons" / HAND_FILE
    before = path.read_text(encoding="utf-8")

    response = write(admin, HAND_ID)

    assert "действующих правок нет" in response.content.decode()
    assert path.read_text(encoding="utf-8") == before
    assert LessonText.objects.count() == 1


def test_write_disabled_on_server(content, admin, settings):
    settings.TEXTS_WRITE_YAML = False
    make_edit(HAND_ID, "title", "Новое название")
    before = (content / "content" / "lessons" / HAND_FILE).read_text(encoding="utf-8")

    response = write(admin, HAND_ID)

    assert "Запись в YAML выключена" in response.content.decode()
    assert (content / "content" / "lessons" / HAND_FILE).read_text(encoding="utf-8") == before
    assert LessonText.objects.count() == 1
    page = admin.get(reverse("admin:texts_lesson_edit", kwargs={"lesson_id": HAND_ID})).content.decode()
    assert "manage.py lesson_texts" in page


def test_admin_action_writes_selected_lessons(content, admin):
    edit = make_edit(HAND_ID, "title", "Новое название")

    admin.post(
        reverse("admin:texts_lessontext_changelist"),
        {"action": "write_selected_to_yaml", "_selected_action": [edit.pk]},
    )

    assert get_registry().get(HAND_ID).title == "Новое название"


def test_generator_applies_edits(tmp_path, capsys):
    text_edits = load_text_edits_module()
    path = tmp_path / "text_edits.yaml"
    path.write_text(
        yaml.safe_dump(
            {"x": {"title": {"original": "Было", "text": "Стало"}, "steps.0.text": {"original": "а", "text": "б"}}}
        ),
        encoding="utf-8",
    )

    lesson = text_edits.apply_text_edits({"id": "x", "title": "Было", "steps": [{"text": "в генераторе другое"}]}, path)

    assert lesson["title"] == "Стало"
    assert lesson["steps"][0]["text"] == "в генераторе другое"
    assert "steps.0.text: текст в генераторе изменился" in capsys.readouterr().err


def test_text_edits_file_matches_course_yaml():
    """Каждая правка из text_edits.yaml уже стоит в YAML урока: генератор и файлы курса не разошлись."""
    edits = load_text_edits_module().load_text_edits(Path(django_settings.TEXT_EDITS_PATH))
    registry = get_registry()
    mismatched = []
    for lesson_id, fields in edits.items():
        lesson = registry.get(lesson_id)
        for field, edit in fields.items():
            if lesson_texts(lesson).get(field) != edit["text"]:
                mismatched.append(f"{lesson_id} {field}")
    assert mismatched == []
