"""E2E: настоящий браузер против живого сервера Django.

Запуск: uv run pytest e2e. Браузер — установленный Edge (E2E_BROWSER_CHANNEL=msedge по умолчанию);
в CI без Edge: E2E_BROWSER_CHANNEL=chromium после `uv run playwright install chromium`.
Плеер должен быть собран: pnpm --dir player build.
"""

import os
from pathlib import Path

import pytest
from django.conf import settings
from playwright.sync_api import Browser, Page, sync_playwright

# Playwright (sync API) держит цикл событий в главном потоке, а фикстуры pytest-django ходят в БД
# оттуда же — без этого флага Django считает это асинхронным контекстом.
os.environ.setdefault("DJANGO_ALLOW_ASYNC_UNSAFE", "true")

PLAYER_BUNDLE = Path(settings.BASE_DIR) / "static" / "player" / "player.js"


@pytest.fixture(scope="session")
def browser() -> Browser:
    if not PLAYER_BUNDLE.exists():
        pytest.fail("Плеер не собран: выполните pnpm --dir player build")
    channel = os.environ.get("E2E_BROWSER_CHANNEL", "msedge")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=None if channel == "chromium" else channel, headless=True)
        yield browser
        browser.close()


class PageErrors(list):
    """Ошибки JavaScript и консоли за время теста (404 на favicon не считаем)."""


@pytest.fixture
def page(browser: Browser, live_server, settings) -> Page:
    settings.DEBUG = True  # песочница /dev/player/ доступна только в режиме разработки
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    errors = PageErrors()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    def on_console(message) -> None:
        # Ошибки консоли, кроме 404 на favicon, и предупреждения плеера («курсор за краем сцены»)
        if message.type == "error" and "favicon" not in message.location.get("url", ""):
            errors.append(message.text)
        elif message.type == "warning" and message.text.startswith("ExcelLearn:"):
            errors.append(message.text)

    page.on("console", on_console)
    page.errors = errors
    page.base_url = live_server.url
    yield page
    context.close()


@pytest.fixture
def member(page: Page, django_user_model):
    """Вошедший ученик: уроки, теория и задания открыты только после регистрации.
    Вход — сессионной cookie, без формы (форму входа проверяют тесты аккаунтов)."""
    from django.test import Client

    user = django_user_model.objects.create_user(
        email="member@example.kz",
        password="Excel-learn-2026",
        first_name="Айгерим",
        last_name="С",
        phone="+77010000011",
        full_access=True,  # e2e проигрывает уроки всех глав
    )
    client = Client()
    client.force_login(user)
    cookie = client.cookies[settings.SESSION_COOKIE_NAME]
    page.context.add_cookies([{"name": cookie.key, "value": cookie.value, "url": page.base_url}])
    return user
