from playwright.sync_api import Page, expect


def test_home_to_course_to_lesson_and_next(page: Page):
    page.goto(f"{page.base_url}/")
    page.get_by_role("link", name="Оглавление").click()
    expect(page.get_by_role("heading", level=1)).to_have_text("Анализ данных в Excel")

    page.get_by_role("link", name="Функция СУММ и автозаполнение").click()
    expect(page.get_by_role("heading", level=1)).to_have_text("Функция СУММ и автозаполнение")
    expect(page.locator(".xl-player .xl-window")).to_be_visible()
    expect(page.locator(".xl-start button")).to_have_text("▶ Начать урок")

    page.get_by_role("link", name="Следующий → Расчёт недельной платёжной ведомости").click()
    expect(page.locator(".xl-title")).to_contain_text("Табель_кафе.xlsx")
    expect(page.get_by_role("link", name="← Предыдущий Функция СУММ и автозаполнение")).to_be_visible()
    assert page.errors == []


def test_lesson_page_plays(page: Page):
    page.goto(f"{page.base_url}/lessons/sum-and-autofill/")

    page.click(".xl-start button")
    expect(page.locator(".xl-primary")).to_have_attribute("title", "Пауза")
    # Шаги ждут озвучку (если собрана) — набор формулы начинается позже
    expect(page.locator(".xl-editor")).to_contain_text("=СУММ(", timeout=60_000)
    assert page.errors == []


def test_lesson_file_downloads(page: Page):
    page.goto(f"{page.base_url}/lessons/wages-weekly-salary/")

    with page.expect_download() as download:
        page.get_by_test_id("lesson-file").click()

    assert download.value.suggested_filename == "Табель_кафе.xlsx"
    assert page.errors == []
