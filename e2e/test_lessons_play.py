import pytest
from playwright.sync_api import Page, expect

from lessons.registry import get_registry

LESSON_IDS = [lesson.id for lesson in get_registry().lessons]


def open_lesson(page: Page, lesson_id: str, **params: str) -> None:
    query = "&".join(f"{k}={v}" for k, v in {"lesson": lesson_id, **params}.items())
    page.goto(f"{page.base_url}/dev/player/?{query}")
    expect(page.locator(".xl-player")).to_be_visible()


@pytest.mark.parametrize("lesson_id", LESSON_IDS)
@pytest.mark.parametrize("locale", ["ru", "en"])
def test_lesson_plays_to_the_end_without_errors(page: Page, lesson_id: str, locale: str):
    open_lesson(page, lesson_id, locale=locale, speed="16", demo="1")

    page.wait_for_function("window.demoDone === true", timeout=60_000)

    steps = len(get_registry().get(lesson_id).steps)
    expect(page.locator(".xl-seg.xl-done")).to_have_count(steps)
    expect(page.locator(".xl-primary")).to_have_attribute("title", "Ещё раз")
    expect(page.locator(".xl-start")).to_be_hidden()
    assert page.errors == []


def test_wages_final_sheet_matches_figure_1_1(page: Page):
    open_lesson(page, "wages-weekly-salary", locale="ru", speed="16", demo="1")
    page.wait_for_function("window.demoDone === true", timeout=60_000)

    cell = lambda addr: page.locator(f'td[data-addr="{addr}"]')  # noqa: E731
    expect(cell("E4")).to_have_text("$490,00")
    expect(cell("C12")).to_have_text("320")
    expect(cell("E14")).to_have_text("$449,63")
    expect(cell("C13")).to_have_text("=СУММ(C4:C11)")  # FORMULATEXT в русском Excel
    expect(cell("F11")).to_have_text("=C11*D11")
    assert page.errors == []


def test_start_seek_and_pause(page: Page):
    open_lesson(page, "wages-weekly-salary")
    expect(page.locator(".xl-start button")).to_have_text("▶ Начать урок")

    page.click(".xl-start button")
    expect(page.locator(".xl-start")).to_be_hidden()
    expect(page.locator(".xl-primary")).to_have_attribute("title", "Пауза")

    page.click(".xl-seg >> nth=7")  # перемотка к шагу 8
    expect(page.locator(".xl-meta")).to_have_text("Шаг 8 из 10")
    # До шага 8 столбец F уже заполнен FORMULATEXT (шаг 7)
    expect(page.locator('td[data-addr="F11"]')).to_have_text("=C11*D11")

    page.keyboard.press("Space")
    expect(page.locator(".xl-primary")).to_have_attribute("title", "Продолжить")
    assert page.errors == []


def test_plan_toggles_and_seeks(page: Page):
    open_lesson(page, "sum-and-autofill")
    plan = page.locator(".xl-plan")
    expect(plan).to_be_hidden()

    page.click("text=☰ План")
    expect(plan).to_be_visible()
    plan.locator("li >> nth=4").click()  # шаг 5 «Нажмите Enter»: показано состояние ДО него
    expect(page.locator(".xl-meta")).to_have_text("Шаг 5 из 9")
    expect(page.locator('td[data-addr="E2"]')).to_have_text("")

    plan.locator("li >> nth=5").click()  # шаг 6: Enter уже нажат
    expect(page.locator(".xl-meta")).to_have_text("Шаг 6 из 9")
    expect(page.locator('td[data-addr="E2"]')).to_have_text("400")
    assert page.errors == []
