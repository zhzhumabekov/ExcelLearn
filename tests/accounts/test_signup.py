import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.accounts.phone import normalize_phone
from apps.legal.documents import consent, render_markdown

User = get_user_model()
pytestmark = pytest.mark.django_db

URL = reverse("accounts:signup")


def form(**overrides) -> dict:
    data = {
        "first_name": "Луқа",
        "last_name": "Абрус",
        "email": "Luka@Example.KZ",
        "phone": "8 (701) 123-45-67",
        "password1": "Excel-learn-2026",
        "password2": "Excel-learn-2026",
        "consent": "on",
    }
    return {**data, **overrides}


def errors(response) -> dict:
    return response.context["form"].errors


def test_signup_creates_user_with_consent_and_logs_in(client):
    response = client.post(URL, form(next="/course/"))

    assert response.status_code == 302 and response.url == "/course/"
    user = User.objects.get()
    assert user.email == "Luka@example.kz"
    assert user.phone == "+77011234567"
    assert user.check_password("Excel-learn-2026")
    assert user.consent_at is not None
    assert user.consent_version == consent().version == "1.0"
    assert client.get(reverse("catalog:home")).context["user"] == user


def test_without_consent_registration_is_impossible(client):
    response = client.post(URL, form(consent=""))

    assert response.status_code == 200
    assert "Без согласия" in errors(response)["consent"][0]
    assert not User.objects.exists()


@pytest.mark.parametrize("phone", ["123", "phone", "+1"])
def test_bad_phone(client, phone):
    assert "phone" in errors(client.post(URL, form(phone=phone)))


def test_duplicate_email_is_case_insensitive(client):
    client.post(URL, form())
    client.logout()

    response = client.post(URL, form(email="luka@example.kz", phone="+77010000000"))

    assert "уже зарегистрирован" in errors(response)["email"][0]


def test_passwords_must_match_and_be_strong(client):
    assert "Пароли не совпадают" in errors(client.post(URL, form(password2="other-pass-2026")))["password2"][0]
    weak = errors(client.post(URL, form(password1="12345678", password2="12345678")))
    assert "password2" in weak


def test_names_are_required(client):
    response = client.post(URL, form(first_name="", last_name=""))

    assert {"first_name", "last_name"} <= set(errors(response))


def test_external_next_is_ignored(client):
    response = client.post(URL, form(next="https://evil.example/"))

    assert response.url == "/"


def test_signup_page_links_consent_and_hides_passwords(client):
    html = client.get(URL).content.decode()

    assert reverse("legal:consent") in html
    assert 'autocomplete="new-password"' in html


def test_authenticated_user_is_redirected(client):
    client.post(URL, form())

    assert client.get(URL).status_code == 302


@pytest.mark.parametrize(
    ("raw", "normalized"),
    [
        ("8 701 123 45 67", "+77011234567"),
        ("+7 (701) 123-45-67", "+77011234567"),
        ("7011234567", "+77011234567"),
        ("77011234567", "+77011234567"),
        ("+998 90 123 45 67", "+998901234567"),
        ("", ""),
    ],
)
def test_normalize_phone(raw, normalized):
    assert normalize_phone(raw) == normalized


def test_consent_page_renders_document(client):
    html = client.get(reverse("legal:consent")).content.decode()

    assert "Согласие на сбор и обработку персональных данных" in html
    assert "Версия 1.0" in html
    assert "<h2>2. Цели обработки</h2>" in html
    assert "№ 94-V" in html


def test_render_markdown_subset_and_escaping():
    title, html = render_markdown(
        "# Заголовок\n\nТекст **жирный** <script>x</script>\n\n## Раздел\n\n1. Один\n2. Два\n   - вложенный\n\n---\n"
    )

    assert title == "Заголовок"
    assert html == (
        "<p>Текст <strong>жирный</strong> &lt;script&gt;x&lt;/script&gt;</p>\n<h2>Раздел</h2>\n"
        "<ol>\n<li>Один\n</li>\n<li>Два\n<ul>\n<li>вложенный\n</li></ul>\n</li></ol>\n<hr>"
    )
