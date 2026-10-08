import json
import re

import pytest
from django.test import override_settings
from django.urls import reverse


def lesson_json(response) -> dict:
    match = re.search(
        r'<script id="lesson-data" type="application/json">(.*?)</script>', response.content.decode(), re.S
    )
    assert match, "на странице нет данных урока"
    return json.loads(match.group(1))


@override_settings(DEBUG=True)
def test_dev_player_loads_first_lesson_by_default(client):
    response = client.get(reverse("core:dev-player"))

    assert response.status_code == 200
    assert "player/player.js" in response.content.decode()
    assert lesson_json(response)["id"] == "sum-and-autofill"
    assert 'functionLocale: "ru"' in response.content.decode()


@override_settings(DEBUG=True)
def test_dev_player_selects_lesson_and_locale(client):
    response = client.get(reverse("core:dev-player"), {"lesson": "wages-weekly-salary", "locale": "en"})

    data = lesson_json(response)
    assert data["sheet"]["cells"]["D4"] == {"v": 10, "f": None, "fmt": "usd", "style": None}
    assert 'functionLocale: "en"' in response.content.decode()


@pytest.mark.parametrize(("speed", "rendered"), [("16", "speed: 16"), ("1000", "speed: 32"), ("abc", "speed: 1")])
@override_settings(DEBUG=True)
def test_dev_player_speed_is_clamped(client, speed, rendered):
    response = client.get(reverse("core:dev-player"), {"speed": speed})

    assert rendered in response.content.decode()


@override_settings(DEBUG=True)
def test_dev_player_unknown_lesson_is_404(client):
    assert client.get(reverse("core:dev-player"), {"lesson": "nope"}).status_code == 404


@pytest.mark.parametrize("locale", ["<script>", "de"])
@override_settings(DEBUG=True)
def test_dev_player_locale_is_whitelisted(client, locale):
    response = client.get(reverse("core:dev-player"), {"locale": locale})

    assert 'functionLocale: "ru"' in response.content.decode()


@override_settings(DEBUG=False)
def test_dev_player_page_is_hidden_in_production(client):
    response = client.get(reverse("core:dev-player"))

    assert response.status_code == 404
