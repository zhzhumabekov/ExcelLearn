"""Курс — только после регистрации: уроки, теория, задания и файлы закрыты, главная и оглавление открыты."""

from urllib.parse import quote

import pytest
from django.urls import reverse

CLOSED = [
    reverse("catalog:lesson", args=["wages-weekly-salary"]),
    reverse("catalog:lesson-file", args=["wages-weekly-salary"]),
    reverse("catalog:theory", args=["ch01"]),
    reverse("catalog:exercises", args=["ch01"]),
    reverse("catalog:exercise-task", args=["ch01", "final-grade"]),
    reverse("catalog:exercise-solution", args=["ch01", "final-grade"]),
]


@pytest.mark.parametrize("url", CLOSED)
def test_guest_is_sent_to_signup_and_back(guest, url):
    response = guest.get(url)

    assert response.status_code == 302
    assert response.url == f"{reverse('accounts:signup')}?next={quote(url)}"


@pytest.mark.parametrize("url", CLOSED)
def test_member_opens_course_pages(client, url):
    assert client.get(url).status_code == 200


def test_guest_sees_home_and_course_outline_with_invitation(guest):
    assert guest.get(reverse("catalog:home")).status_code == 200

    html = guest.get(reverse("catalog:course")).content.decode()
    assert 'data-testid="members-only"' in html
    assert "Функция СУММ и автозаполнение" in html  # оглавление видно целиком


def test_member_course_has_no_invitation(client):
    assert 'data-testid="members-only"' not in client.get(reverse("catalog:course")).content.decode()


def test_signup_after_closed_page_returns_there_and_offers_login(guest):
    lesson = reverse("catalog:lesson", args=["wages-weekly-salary"])
    html = guest.get(f"{reverse('accounts:signup')}?next={quote(lesson)}").content.decode()

    assert "открываются после регистрации" in html
    assert f'href="{reverse("accounts:login")}?next={quote(lesson)}"' in html

    response = guest.post(
        reverse("accounts:signup"),
        {
            "email": "new@example.kz",
            "first_name": "Ерлан",
            "last_name": "Б",
            "phone": "+77010000002",
            "password1": "Сложный-пароль-2026",
            "password2": "Сложный-пароль-2026",
            "consent": "on",
            "next": lesson,
        },
    )
    assert response.status_code == 302 and response.url == lesson
    assert guest.get(lesson).status_code == 200
