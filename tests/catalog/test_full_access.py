"""Введение и главы 1–5 открыты всем зарегистрированным, остальные — с полным доступом от администратора."""

import json

import pytest
from django.urls import reverse

LOCKED = [
    reverse("catalog:lesson", args=["text-cut"]),
    reverse("catalog:lesson-file", args=["text-cut"]),
    reverse("catalog:theory", args=["ch06"]),
    reverse("catalog:exercises", args=["ch06"]),
    reverse("catalog:exercise-task", args=["ch06", "name-address"]),
    reverse("catalog:exercise-solution", args=["ch06", "name-address"]),
]


@pytest.fixture(autouse=True)
def free_member(client, django_user_model):
    """Обычный зарегистрированный ученик — без полного доступа."""
    django_user_model.objects.update(full_access=False)


FREE = [
    reverse("catalog:lesson", args=["wages-weekly-salary"]),
    reverse("catalog:theory", args=["ch05"]),
]


@pytest.mark.parametrize("url", LOCKED)
def test_member_without_full_access_sees_locked_page(client, url):
    response = client.get(url)

    assert response.status_code == 403
    assert 'data-testid="locked"' in response.content.decode()


@pytest.mark.parametrize("url", FREE)
def test_free_chapters_are_open_to_member(client, url):
    assert client.get(url).status_code == 200


@pytest.mark.parametrize("url", LOCKED)
def test_full_access_opens_all_chapters(client, django_user_model, url):
    django_user_model.objects.update(full_access=True)

    assert client.get(url).status_code == 200


@pytest.mark.parametrize("url", LOCKED)
def test_staff_opens_all_chapters(client, django_user_model, url):
    django_user_model.objects.update(is_staff=True)

    assert client.get(url).status_code == 200


def test_guest_still_goes_to_signup(guest):
    assert guest.get(LOCKED[0]).status_code == 302


def test_course_marks_locked_chapters_until_full_access(client, django_user_model):
    html = client.get(reverse("catalog:course")).content.decode()
    assert 'data-testid="free-chapters"' in html
    assert 'id="ch06"' in html and "data-locked" in html.split('id="ch06"')[1].split("</li>")[0]
    assert "data-locked" not in html.split('id="ch05"')[1].split("</li>")[0]

    django_user_model.objects.update(full_access=True)
    html = client.get(reverse("catalog:course")).content.decode()
    assert 'data-testid="free-chapters"' not in html and "data-locked" not in html


def test_progress_of_locked_lesson_is_not_saved(client, django_user_model):
    url = reverse("progress:save", args=["text-cut"])
    payload = json.dumps({"step": 1})

    assert client.post(url, payload, content_type="application/json").status_code == 403

    django_user_model.objects.update(full_access=True)
    assert client.post(url, payload, content_type="application/json").status_code == 200


def test_admin_action_grants_full_access(client, django_user_model):
    admin = django_user_model.objects.create_superuser(
        email="admin@example.kz", password="x", first_name="А", last_name="Б", phone="+77010000009"
    )
    student = django_user_model.objects.get(email="student@example.kz")
    client.force_login(admin)

    client.post(
        reverse("admin:accounts_user_changelist"),
        {"action": "grant_full_access", "_selected_action": [student.pk]},
    )

    student.refresh_from_db()
    assert student.full_access
