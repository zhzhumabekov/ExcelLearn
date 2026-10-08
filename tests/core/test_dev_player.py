from django.test import override_settings
from django.urls import reverse


@override_settings(DEBUG=True)
def test_dev_player_page_loads_bundle_in_debug(client):
    response = client.get(reverse("core:dev-player"))

    assert response.status_code == 200
    assert "player/player.js" in response.content.decode()


@override_settings(DEBUG=False)
def test_dev_player_page_is_hidden_in_production(client):
    response = client.get(reverse("core:dev-player"))

    assert response.status_code == 404
