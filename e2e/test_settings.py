from decimal import Decimal
from pathlib import Path

from playwright.sync_api import Page, expect

from apps.preferences.models import Preferences

PASSWORD = "Excel-learn-2026"


def log_in(page: Page, django_user_model, email="set@example.kz"):
    user = django_user_model.objects.create_user(
        email=email, password=PASSWORD, first_name="Нурлан", last_name="Н", phone="+77010000005"
    )
    page.goto(f"{page.base_url}/accounts/login/")
    page.get_by_label("Email", exact=True).fill(email)
    page.get_by_label("Пароль", exact=True).fill(PASSWORD)
    page.get_by_role("button", name="Войти").click()
    expect(page.get_by_test_id("user-name")).to_be_visible()
    return user


def test_logged_in_settings_save_instantly_and_apply_to_lesson(page: Page, django_user_model):
    user = log_in(page, django_user_model)
    page.goto(f"{page.base_url}/settings/")

    # Каждое изменение сохраняется отдельным запросом (htmx, с задержкой 300 мс) — дожидаемся ответа
    with page.expect_response(lambda r: r.url.endswith("/settings/") and r.request.method == "POST"):
        page.get_by_label("Английский Excel").check()
    expect(page.locator("#settings-status")).to_have_text("Сохранено ✓")
    expect(page.get_by_text("Тема оформления")).to_have_count(0)

    assert Preferences.objects.get(user=user).function_locale == "en"

    page.goto(f"{page.base_url}/lessons/wages-weekly-salary/")
    page.click(".xl-seg >> nth=7")
    expect(page.locator(".xl-step-title")).to_have_text("Сумма часов: SUM")
    assert page.errors == []


def test_guest_settings_live_in_browser(page: Page):
    page.goto(f"{page.base_url}/settings/")
    expect(page.locator("#settings-status")).to_contain_text("Сохраняются в этом браузере")

    page.get_by_label("Английский Excel").check()
    expect(page.locator("#settings-status")).to_have_text("Сохранено в этом браузере ✓")

    page.reload()  # уроки гостю закрыты — проверяем, что выбор сохранился в браузере
    expect(page.get_by_label("Английский Excel")).to_be_checked()
    assert page.errors == []


def test_autoplay_opens_and_starts_next_lesson(page: Page, django_user_model, settings, tmp_path: Path):
    settings.NARRATION_DIR = tmp_path  # без озвучки: последний шаг проходит быстро
    user = log_in(page, django_user_model, email="auto@example.kz")
    Preferences.objects.create(user=user, autoplay_next=True, speed=Decimal("2.0"))

    page.goto(f"{page.base_url}/lessons/sum-and-autofill/")
    page.click(".xl-seg >> nth=-1")  # к последнему шагу
    page.click(".xl-primary")
    expect(page.locator("[data-autoplay-countdown]")).to_contain_text("Откроется через", timeout=20_000)

    page.wait_for_url("**/lessons/intro-model/?autoplay=1", timeout=15_000)
    expect(page.locator(".xl-primary")).to_have_attribute("title", "Пауза")  # урок запустился сам
    assert page.errors == []
