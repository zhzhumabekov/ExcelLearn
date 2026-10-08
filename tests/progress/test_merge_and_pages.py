import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from apps.progress.models import LessonProgress
from apps.progress.services import record_progress

User = get_user_model()
pytestmark = pytest.mark.django_db

MERGE = reverse("progress:merge")
WAGES, SUM = "wages-weekly-salary", "sum-and-autofill"  # 10 и 9 шагов


@pytest.fixture
def user():
    return User.objects.create_user(
        email="g@example.kz", password="x", first_name="Гость", last_name="Г", phone="+77010000003"
    )


def merge(client, payload):
    return client.post(MERGE, json.dumps(payload), content_type="application/json")


def progress(user, lesson_id):
    return LessonProgress.objects.get(user=user, lesson_id=lesson_id)


def test_merge_takes_best_of_guest_and_account(client, user):
    client.force_login(user)
    record_progress(user, WAGES, 6, False, 10)

    response = merge(
        client,
        {
            WAGES: {"step": 3, "completed": False},  # в аккаунте дальше — остаётся 6
            SUM: {"step": 8, "completed": True},
            "no-such-lesson": {"step": 1, "completed": True},
            "broken": "x",
        },
    )

    assert response.json() == {"merged": 2}
    assert progress(user, WAGES).last_step == 6 and not progress(user, WAGES).completed
    assert progress(user, SUM).completed
    assert not LessonProgress.objects.filter(lesson_id="no-such-lesson").exists()


def test_merge_never_uncompletes(client, user):
    client.force_login(user)
    record_progress(user, SUM, 8, True, 9)

    merge(client, {SUM: {"step": 2, "completed": False}})

    assert progress(user, SUM).completed and progress(user, SUM).last_step == 8


@pytest.mark.parametrize("payload", [[1, 2], "text", 5])
def test_merge_bad_payload(client, user, payload):
    client.force_login(user)

    assert merge(client, payload).status_code == 400


def test_merge_requires_login_and_csrf(client, user):
    assert merge(client, {SUM: {"step": 1, "completed": False}}).status_code == 401

    strict = Client(enforce_csrf_checks=True)
    strict.force_login(user)
    assert merge(strict, {}).status_code == 403


def test_merge_route_is_not_taken_for_a_lesson_id(client, user):
    client.force_login(user)

    assert merge(client, {}).json() == {"merged": 0}


def test_course_page_shows_statuses_and_chapter_percent(client, user):
    client.force_login(user)
    record_progress(user, SUM, 8, True, 9)
    record_progress(user, WAGES, 4, False, 10)

    html = client.get(reverse("catalog:course")).content.decode()

    assert "✓ Пройден" in html
    assert "Шаг 5 из 10" in html
    assert "пройдено 100%" in html  # глава 0: один урок, пройден
    assert "пройдено 0%" in html  # глава 1: урок в процессе


def test_guest_course_page_leaves_statuses_to_browser(client):
    html = client.get(reverse("catalog:course")).content.decode()

    assert 'data-guest="1"' in html
    assert "пройдено" not in html
    assert "js/course-page.js" in html


def lesson_start_step(client, lesson_id):
    html = client.get(reverse("catalog:lesson", args=[lesson_id])).content.decode()
    config = html.split('<script id="lesson-page" type="application/json">')[1].split("</script>")[0]
    return json.loads(config)["startStep"]


def test_lesson_opens_from_last_step_unless_completed(client, user):
    client.force_login(user)
    assert lesson_start_step(client, WAGES) == 0

    record_progress(user, WAGES, 6, False, 10)
    assert lesson_start_step(client, WAGES) == 6

    record_progress(user, WAGES, 9, True, 10)
    assert lesson_start_step(client, WAGES) == 0  # пройденный урок — с начала


def test_merge_script_only_for_logged_in(client, user):
    assert "merge-progress.js" not in client.get("/").content.decode()
    client.force_login(user)
    assert "merge-progress.js" in client.get("/").content.decode()
