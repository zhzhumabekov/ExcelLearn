from pathlib import Path

import pytest
from django.conf import settings
from django.urls import reverse


@pytest.fixture
def home(client):
    return client.get(reverse("catalog:home")).content.decode()


def test_base_sets_theme_before_first_paint(home):
    head = home.split("</head>")[0]

    assert 'localStorage.getItem("theme")' in head
    assert head.index("dataset.theme") < head.index("css/site.css")


@pytest.mark.parametrize("asset", ["css/site.css", "js/theme.js", "vendor/htmx.min.js", "vendor/alpine.min.js"])
def test_base_loads_local_assets_without_cdn(home, asset):
    assert f"/static/{asset}" in home
    assert "cdn." not in home and "unpkg" not in home


@pytest.mark.parametrize("asset", ["js/theme.js", "vendor/htmx.min.js", "vendor/alpine.min.js", "../assets/site.css"])
def test_committed_assets_exist(asset):
    assert (Path(settings.BASE_DIR) / "static" / asset).exists()


def test_header_and_footer(home):
    assert 'aria-label="Тема оформления"' in home
    assert "ExcelLearn" in home
    assert "Уинстона" in home
