import re

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


def test_wages_final_sheet(page: Page):
    open_lesson(page, "wages-weekly-salary", locale="ru", speed="16", demo="1")
    page.wait_for_function("window.demoDone === true", timeout=60_000)

    cell = lambda addr: page.locator(f'td[data-addr="{addr}"]')  # noqa: E731
    expect(cell("D2")).to_have_text(re.compile(r"^88\s200 ₸$"))
    expect(cell("B10")).to_have_text("320")
    expect(cell("D12")).to_have_text(re.compile(r"^80\s463 ₸$"))
    expect(cell("B11")).to_have_text("=СУММ(B2:B9)")  # FORMULATEXT в русском Excel
    expect(cell("E9")).to_have_text("=B9*C9")
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
    expect(page.locator('td[data-addr="E9"]')).to_have_text("=B9*C9")

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
    expect(page.locator('td[data-addr="E2"]')).to_have_text("15410")
    assert page.errors == []


def test_step_mode_waits_for_next_button(page: Page):
    open_lesson(page, "wages-weekly-salary", speed="16")
    page.click(".xl-mode >> text=Пошагово")
    expect(page.locator('.xl-mode [data-mode="step"]')).to_have_class(re.compile("xl-on"))

    page.click(".xl-start button")
    next_button = page.locator(".xl-next-btn")
    expect(next_button).to_be_visible(timeout=20_000)
    expect(next_button).to_contain_text("Дальше: 2.")
    expect(page.locator(".xl-meta")).to_have_text("Шаг 1 из 10")
    expect(page.locator(".xl-primary")).to_have_attribute("title", "Следующий шаг")
    page.wait_for_timeout(1500)  # сам дальше не идёт
    expect(page.locator(".xl-meta")).to_have_text("Шаг 1 из 10")

    next_button.click()
    expect(page.locator(".xl-meta")).to_have_text("Шаг 2 из 10")
    expect(next_button).to_contain_text("Дальше: 3.", timeout=20_000)

    page.keyboard.press("Space")  # пробел — тоже «Дальше»
    expect(page.locator(".xl-meta")).to_have_text("Шаг 3 из 10")

    page.click(".xl-mode >> text=Авто")  # дальше — без остановок до конца
    expect(page.locator(".xl-primary")).to_have_attribute("title", "Ещё раз", timeout=60_000)
    expect(page.locator('td[data-addr="D12"]')).to_have_text(re.compile(r"^80\s463 ₸$"))
    assert page.errors == []
