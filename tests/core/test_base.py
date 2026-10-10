from pathlib import Path

import pytest
from django.conf import settings
from django.urls import reverse


@pytest.fixture
def home(client):
    return client.get(reverse("catalog:home")).content.decode()


def test_no_theme_switching(home):
    """Тёмной темы нет: ни скрипта темы, ни атрибутов на <html>, ни переключателя."""
    assert "data-theme" not in home and "theme.js" not in home
    assert "Тема оформления" not in home


@pytest.mark.parametrize("asset", ["css/site.css", "vendor/htmx.min.js", "vendor/alpine.min.js"])
def test_base_loads_local_assets_without_cdn(home, asset):
    assert f"/static/{asset}" in home
    assert "cdn." not in home and "unpkg" not in home


@pytest.mark.parametrize("asset", ["vendor/htmx.min.js", "vendor/alpine.min.js", "../assets/site.css"])
def test_committed_assets_exist(asset):
    assert (Path(settings.BASE_DIR) / "static" / asset).exists()


def test_header_and_footer(home):
    assert 'aria-label="Основная навигация"' in home
    assert "ExcelLearn" in home
    assert "Уинстон" not in home  # книгу на сайте не упоминаем
