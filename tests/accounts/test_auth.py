import re

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse

from apps.accounts import throttle

User = get_user_model()
pytestmark = pytest.mark.django_db

LOGIN = reverse("accounts:login")
PASSWORD = "Excel-learn-2026"


@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()


@pytest.fixture
def user():
    return User.objects.create_user(
        email="luka@example.kz", password=PASSWORD, first_name="Лука", last_name="Абрус", phone="+77011234567"
    )


def login(client, email="luka@example.kz", password=PASSWORD, **extra):
    return client.post(LOGIN, {"username": email, "password": password, **extra})


def form_errors(response) -> str:
    return " ".join(response.context["form"].non_field_errors())


def test_login_by_email_and_return_to_next(client, user):
    response = login(client, next="/course/")

    assert response.status_code == 302 and response.url == "/course/"
    assert client.get("/").context["user"] == user


def test_wrong_password_message(client, user):
    response = login(client, password="wrong")

    assert form_errors(response) == "Неверный email или пароль."


def test_lockout_after_failures_even_with_right_password(client, user):
    for _ in range(throttle.MAX_FAILURES):
        login(client, password="wrong")

    response = login(client)

    assert "Слишком много неудачных попыток" in form_errors(response)
    assert "_auth_user_id" not in client.session


def test_lockout_is_per_ip_and_email(client, user):
    for _ in range(throttle.MAX_FAILURES):
        login(client, password="wrong")

    other_ip = client.post(LOGIN, {"username": "luka@example.kz", "password": PASSWORD}, REMOTE_ADDR="10.0.0.2")
    assert other_ip.status_code == 302


def test_success_resets_failures(client, user):
    for _ in range(throttle.MAX_FAILURES - 1):
        login(client, password="wrong")
    login(client)
    client.logout()

    for _ in range(throttle.MAX_FAILURES - 1):
        login(client, password="wrong")
    assert login(client).status_code == 302


def test_logout_requires_post(client, user):
    client.force_login(user)

    assert client.get(reverse("accounts:logout")).status_code == 405
    assert client.post(reverse("accounts:logout")).status_code == 302
    assert "_auth_user_id" not in client.session


def test_header_shows_login_or_logout(client, user):
    anonymous = client.get("/").content.decode()
    assert reverse("accounts:login") in anonymous and "Выйти" not in anonymous

    client.force_login(user)
    logged_in = client.get("/").content.decode()
    assert "Выйти" in logged_in and "Лука" in logged_in


@override_settings(EMAIL_HOST="", SUPPORT_EMAIL="admin@excellearn.kz")
def test_password_reset_without_mail_points_to_admin(client, user):
    html = client.get(reverse("accounts:password_reset")).content.decode()

    assert "Напишите администратору" in html
    assert "mailto:admin@excellearn.kz" in html


@override_settings(EMAIL_HOST="smtp.example.kz")
def test_password_reset_by_email_end_to_end(client, user):
    response = client.post(reverse("accounts:password_reset"), {"email": "LUKA@example.kz"})
    assert response.url == reverse("accounts:password_reset_done")
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.subject == "Восстановление пароля на ExcelLearn"
    assert message.to == ["luka@example.kz"]

    link = re.search(r"http://testserver(/accounts/reset/\S+/)", message.body).group(1)
    form_page = client.get(link, follow=True)
    assert form_page.context["validlink"]
    new = "Another-pass-2026"
    done = client.post(form_page.redirect_chain[-1][0], {"new_password1": new, "new_password2": new})
    assert done.url == reverse("accounts:password_reset_complete")

    client.logout()
    assert login(client, password=new).status_code == 302


@override_settings(EMAIL_HOST="smtp.example.kz")
def test_password_reset_for_unknown_email_sends_nothing_but_looks_the_same(client, user):
    response = client.post(reverse("accounts:password_reset"), {"email": "nobody@example.kz"})

    assert response.url == reverse("accounts:password_reset_done")
    assert mail.outbox == []


def test_invalid_reset_link(client, user):
    html = client.get(reverse("accounts:password_reset_confirm", args=["xx", "bad-token"])).content.decode()

    assert "Ссылка недействительна" in html
