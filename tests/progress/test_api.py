import json

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import Client
from django.urls import reverse

from apps.progress.models import LessonProgress

User = get_user_model()
pytestmark = pytest.mark.django_db

LESSON = "wages-weekly-salary"  # 10 шагов
URL = reverse("progress:save", args=[LESSON])


@pytest.fixture
def user():
    return User.objects.create_user(
        email="u@example.kz", password="x", first_name="U", last_name="U", phone="+77010000000"
    )


@pytest.fixture
def api(client, user):
    client.force_login(user)

    def post(payload, url=URL):
        return client.post(url, json.dumps(payload), content_type="application/json")

    return post


def test_saves_step_and_completion(api, user):
    assert api({"step": 3}).json() == {"last_step": 3, "completed": False}
    assert api({"step": 9, "completed": True}).json() == {"last_step": 9, "completed": True}

    progress = LessonProgress.objects.get(user=user, lesson_id=LESSON)
    assert progress.completed_at is not None


def test_is_idempotent(api, user):
    api({"step": 4})
    api({"step": 4})

    assert LessonProgress.objects.filter(user=user).count() == 1


def test_step_moves_back_while_in_progress_but_not_after_completion(api):
    api({"step": 5})
    assert api({"step": 2}).json()["last_step"] == 2  # перемотал назад — продолжит отсюда

    api({"step": 9, "completed": True})
    assert api({"step": 1}).json() == {"last_step": 9, "completed": True}  # пересмотр не «распроходит» урок


def test_step_is_clamped_to_lesson(api):
    assert api({"step": 999}).json()["last_step"] == 9
    assert api({"step": -5}).json()["last_step"] == 0


def test_anonymous_gets_401(client):
    response = client.post(URL, json.dumps({"step": 1}), content_type="application/json")

    assert response.status_code == 401
    assert not LessonProgress.objects.exists()


def test_unknown_lesson_404(api):
    assert api({"step": 1}, url=reverse("progress:save", args=["no-such-lesson"])).status_code == 404


@pytest.mark.parametrize("payload", [{}, {"step": "3"}, {"step": True}, {"step": 1, "completed": "yes"}, [1]])
def test_bad_payload_400(api, payload):
    assert api(payload).status_code == 400


def test_get_not_allowed(client, user):
    client.force_login(user)

    assert client.get(URL).status_code == 405


def test_csrf_is_required(user):
    client = Client(enforce_csrf_checks=True)
    client.force_login(user)

    response = client.post(URL, json.dumps({"step": 1}), content_type="application/json")

    assert response.status_code == 403


def test_one_record_per_user_and_lesson(user):
    LessonProgress.objects.create(user=user, lesson_id=LESSON)

    with pytest.raises(IntegrityError):
        LessonProgress.objects.create(user=user, lesson_id=LESSON)


def test_lesson_page_config_for_user(client, user):
    client.force_login(user)
    html = client.get(reverse("catalog:lesson", args=[LESSON])).content.decode()
    config = json.loads(html.split('<script id="lesson-page" type="application/json">')[1].split("</script>")[0])

    assert config["progressUrl"] == URL
    assert config["csrfToken"]
