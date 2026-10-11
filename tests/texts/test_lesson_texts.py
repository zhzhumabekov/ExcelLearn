"""Правки текстов уроков из админки: сохраняются в базе поверх YAML и видны на сайте."""

import json
import re

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.urls import reverse

from apps.texts.models import LessonText
from apps.texts.services import ACTIVE, IN_YAML, STALE, edit_status, lesson_texts, validate_text
from lessons.registry import get_registry

LESSON_ID = "wages-weekly-salary"


def lesson_json(html: str) -> dict:
    match = re.search(r'<script id="lesson-data" type="application/json">(.*?)</script>', html, re.S)
    assert match, "на странице нет данных урока"
    return json.loads(match.group(1))


@pytest.fixture
def admin(client, django_user_model):
    user = django_user_model.objects.create_superuser(
        email="admin@example.kz",
        password="x",
        first_name="А",
        last_name="Б",
        phone="+77010000009",
        full_access=True,
    )
    client.force_login(user)
    return client


def edit_url(lesson_id=LESSON_ID):
    return reverse("admin:texts_lesson_edit", kwargs={"lesson_id": lesson_id})


def post_texts(client, **changes):
    """Отправить форму урока: все поля как сейчас, кроме changes (ключи steps_0_text → steps.0.text)."""
    texts = lesson_texts(get_registry().get(LESSON_ID))
    for edit in LessonText.objects.filter(lesson_id=LESSON_ID):
        if texts.get(edit.field) == edit.original:
            texts[edit.field] = edit.text
    texts.update({key.replace("_", "."): value for key, value in changes.items()})
    return client.post(edit_url(), texts)


def test_all_yaml_texts_pass_admin_validation():
    """Админка проверяет тексты теми же правилами, что и YAML: любой текст из курса можно сохранить как есть."""
    bad = []
    for lesson in get_registry().lessons:
        for field, value in lesson_texts(lesson).items():
            try:
                validate_text(value)
            except ValidationError as exc:
                bad.append(f"{lesson.id} {field}: {exc.messages}")
    assert bad == []


@pytest.mark.parametrize(
    "value",
    ["", "   ", "Сумма {B2}", "<script>alert(1)</script>", "<b>жирный", "лишний </b>", '<b class="x">a</b>'],
)
def test_invalid_text_is_rejected(value):
    with pytest.raises(ValidationError):
        validate_text(value)


def test_formula_with_less_than_is_not_a_tag():
    validate_text("Формула {f:=IF(A2<B2,1,0)} и <kbd>Enter</kbd><br>дальше")


def test_edit_changes_step_text_on_lesson_page(admin):
    response = post_texts(admin, steps_0_text="Новый текст <b>ситуации</b>.")

    assert response.status_code == 302
    edit = LessonText.objects.get(lesson_id=LESSON_ID, field="steps.0.text")
    assert edit.original == get_registry().get(LESSON_ID).steps[0].text
    assert edit.updated_by.email == "admin@example.kz"
    data = lesson_json(admin.get(reverse("catalog:lesson", args=[LESSON_ID])).content.decode())
    assert data["steps"][0]["text"] == "Новый текст <b>ситуации</b>."
    assert data["steps"][1]["text"] == get_registry().get(LESSON_ID).steps[1].text


def test_edit_changes_lesson_title_in_course(admin):
    post_texts(admin, title="Недельная ведомость кафе")

    assert "Недельная ведомость кафе" in admin.get(reverse("catalog:course")).content.decode()
    assert get_registry().get(LESSON_ID).title != "Недельная ведомость кафе"  # YAML не тронут


def test_only_changed_fields_are_saved(admin):
    post_texts(admin, steps_1_title="Другой заголовок")

    assert list(LessonText.objects.values_list("field", flat=True)) == ["steps.1.title"]


def test_returning_yaml_text_deletes_edit(admin):
    post_texts(admin, steps_0_text="Временно")
    yaml_text = get_registry().get(LESSON_ID).steps[0].text

    post_texts(admin, steps_0_text=yaml_text.replace("\n", "\r\n"))  # браузер шлёт переводы строк как \r\n

    assert not LessonText.objects.exists()


def test_invalid_text_is_not_saved(admin):
    response = post_texts(admin, steps_0_text="Сумма {B2}")

    assert response.status_code == 200
    assert "фигурные скобки" in response.content.decode()
    assert not LessonText.objects.exists()


@pytest.mark.django_db
def test_stale_edit_is_not_applied():
    """Генератор изменил текст в YAML после правки — правка не применяется (шаги могли сдвинуться)."""
    lesson = get_registry().get(LESSON_ID)
    stale = LessonText.objects.create(lesson_id=LESSON_ID, field="steps.0.text", original="старый", text="правка")
    active = LessonText(lesson_id=LESSON_ID, field="title", original=lesson.title, text="Новое")
    ported = LessonText(lesson_id=LESSON_ID, field="steps.1.title", original="было", text=lesson.steps[1].title)

    assert edit_status(stale, lesson) == STALE
    assert edit_status(active, lesson) == ACTIVE
    assert edit_status(ported, lesson) == IN_YAML
    assert edit_status(stale, None) == STALE


def test_stale_edit_is_kept_when_field_untouched(admin):
    LessonText.objects.create(lesson_id=LESSON_ID, field="steps.0.text", original="старый", text="правка")

    post_texts(admin, steps_1_title="Другой заголовок")

    assert LessonText.objects.filter(field="steps.0.text").exists()
    data = lesson_json(admin.get(reverse("catalog:lesson", args=[LESSON_ID])).content.decode())
    assert data["steps"][0]["text"] == get_registry().get(LESSON_ID).steps[0].text


def test_admin_pages_render(admin):
    LessonText.objects.create(lesson_id=LESSON_ID, field="title", original="старый", text="правка")

    assert admin.get(reverse("admin:texts_lessontext_changelist")).status_code == 200
    lessons = admin.get(reverse("admin:texts_lesson_list")).content.decode()
    assert edit_url() in lessons
    page = admin.get(edit_url()).content.decode()
    assert "Шаг 1" in page
    assert "правка устарела" in page
    assert admin.get(edit_url("no-such-lesson")).status_code == 404


def test_guest_cannot_open_text_editor(client):
    response = client.get(edit_url())

    assert response.status_code == 302
    assert reverse("admin:login") in response.url


@pytest.mark.django_db
def test_command_lists_edits(capsys):
    lesson = get_registry().get(LESSON_ID)
    LessonText.objects.create(lesson_id=LESSON_ID, field="title", original=lesson.title, text="Новое название")

    call_command("lesson_texts")

    out = capsys.readouterr().out
    assert f"{LESSON_ID} · Название урока [title] · {ACTIVE}" in out
    assert "+ Новое название" in out
