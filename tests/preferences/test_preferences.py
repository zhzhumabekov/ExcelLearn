import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from apps.preferences.models import Preferences
from apps.preferences.services import get_preferences

User = get_user_model()
pytestmark = pytest.mark.django_db

PAGE = reverse("preferences:page")
UPDATE = reverse("preferences:update")
MERGE = reverse("preferences:merge")


@pytest.fixture
def user():
    return User.objects.create_user(
        email="s@example.kz", password="x", first_name="Сауле", last_name="С", phone="+77010000004"
    )


@pytest.fixture
def logged(client, user):
    client.force_login(user)
    return client


FORM = {
    "speed": "1.5",
    "function_locale": "en",
    "autoplay_next": "on",
    "play_mode": "step",
}


def post_json(client, url, data):
    return client.post(url, json.dumps(data), content_type="application/json")


def test_defaults_without_saved_row(user):
    prefs = get_preferences(user)

    assert prefs.pk is None
    assert prefs.player_settings() == {
        "speed": 1.0,
        "functionLocale": "ru",
        "autoplayNext": False,
        "playMode": "auto",
    }


def test_htmx_save_returns_status_and_persists(logged, user):
    response = logged.post(PAGE, FORM, HTTP_HX_REQUEST="true")

    assert "Сохранено ✓" in response.content.decode()
    prefs = Preferences.objects.get(user=user)
    assert (prefs.speed, prefs.function_locale, prefs.autoplay_next) == (Decimal("1.5"), "en", True)


def test_unchecked_flags_turn_off(logged, user):
    logged.post(PAGE, FORM, HTTP_HX_REQUEST="true")
    logged.post(PAGE, {**FORM, "autoplay_next": ""}, HTTP_HX_REQUEST="true")

    assert not Preferences.objects.get(user=user).autoplay_next


def test_invalid_value_is_reported(logged, user):
    response = logged.post(PAGE, {**FORM, "speed": "7"}, HTTP_HX_REQUEST="true")

    assert "Не сохранено" in response.content.decode()
    assert not Preferences.objects.filter(user=user).exists()


def test_page_shows_saved_values(logged):
    logged.post(PAGE, FORM, HTTP_HX_REQUEST="true")

    response = logged.get(PAGE)

    form = response.context["form"]
    assert str(form["speed"].value()) == "1.5" and form["function_locale"].value() == "en"
    assert 'hx-post="/settings/"' in response.content.decode()


def test_guest_page_has_no_htmx_and_cannot_post(client):
    html = client.get(PAGE).content.decode()

    assert 'data-guest="1"' in html and "hx-post" not in html
    assert client.post(PAGE, FORM).status_code == 401


def test_partial_update_changes_only_given_field(logged, user):
    logged.post(PAGE, FORM, HTTP_HX_REQUEST="true")

    assert post_json(logged, UPDATE, {"function_locale": "ru"}).json() == {"ok": True}

    prefs = Preferences.objects.get(user=user)
    assert prefs.function_locale == "ru" and prefs.speed == Decimal("1.5") and prefs.autoplay_next


def test_play_mode_from_player_panel_is_saved(logged, user):
    """Страница урока сохраняет режим, выбранный кнопками «Пошагово» / «Авто» на панели плеера."""
    assert post_json(logged, UPDATE, {"play_mode": "step"}).json() == {"ok": True}

    assert get_preferences(user).player_settings()["playMode"] == "step"


@pytest.mark.parametrize("data", [{"function_locale": "de"}, {"speed": "7"}, {"play_mode": "slow"}])
def test_partial_update_validates(logged, data):
    assert post_json(logged, UPDATE, data).status_code == 400


def test_merge_only_when_account_has_no_settings(logged, user):
    guest = {"speed": 2, "function_locale": "en", "autoplay_next": True}

    assert post_json(logged, MERGE, guest).json() == {"merged": True}
    prefs = Preferences.objects.get(user=user)
    assert (prefs.speed, prefs.function_locale, prefs.autoplay_next) == (Decimal("2.0"), "en", True)

    assert post_json(logged, MERGE, {"function_locale": "ru"}).json() == {"merged": False}
    assert Preferences.objects.get(user=user).function_locale == "en"


def test_endpoints_require_login_and_csrf(client, user):
    assert post_json(client, UPDATE, {"function_locale": "en"}).status_code == 401
    assert post_json(client, MERGE, {}).status_code == 401

    strict = Client(enforce_csrf_checks=True)
    strict.force_login(user)
    assert post_json(strict, UPDATE, {"function_locale": "en"}).status_code == 403


def test_settings_page_has_no_theme(logged):
    html = logged.get(PAGE).content.decode()

    assert "Тема оформления" not in html and 'name="theme"' not in html


def test_lesson_page_passes_player_settings(logged):
    logged.post(PAGE, FORM, HTTP_HX_REQUEST="true")

    html = logged.get(reverse("catalog:lesson", args=["sum-and-autofill"])).content.decode()
    config = json.loads(html.split('<script id="lesson-page" type="application/json">')[1].split("</script>")[0])

    assert config["settings"] == {
        "speed": 1.5,
        "functionLocale": "en",
        "autoplayNext": True,
        "playMode": "step",
    }
    assert config["settingsUrl"] == UPDATE


def test_settings_page_has_no_narration(logged):
    html = logged.get(PAGE).content.decode()

    assert "Озвучка" not in html and "narration" not in html
