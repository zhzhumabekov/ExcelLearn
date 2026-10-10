from playwright.sync_api import Page, expect


def test_home_to_course_to_lesson_and_next(page: Page):
    page.goto(f"{page.base_url}/")
    page.get_by_role("link", name="Оглавление").click()
    expect(page.get_by_role("heading", level=1)).to_have_text("Анализ данных в Excel")

    page.get_by_role("link", name="Функция СУММ и автозаполнение").click()
    expect(page.get_by_role("heading", level=1)).to_have_text("Функция СУММ и автозаполнение")
    expect(page.locator(".xl-player .xl-window")).to_be_visible()
    expect(page.locator(".xl-start button")).to_have_text("▶ Начать урок")

    page.get_by_role("link", name="Следующий → Модель в Excel: входы, формулы, выходы").click()
    expect(page.locator(".xl-title")).to_contain_text("Автомойка_модель.xlsx")
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


def test_chapter_exercises_from_course_with_task_and_solution(page: Page):
    page.goto(f"{page.base_url}/course/")
    expect(page.locator("#ch01 [data-exercises]")).to_be_hidden()  # глава свёрнута
    page.locator("#ch01 summary").click()
    page.locator("#ch01 [data-exercises]").click()
    expect(page.get_by_role("heading", level=1)).to_have_text("Задания к главе 1")

    exercise = page.locator('[data-exercise="fish-quota"]')
    exercise.get_by_text("Как решать — подсказка").click()
    expect(exercise.get_by_text("Частая ошибка.")).to_be_visible()

    with page.expect_download() as task:
        exercise.get_by_test_id("exercise-task").click()
    with page.expect_download() as solution:
        exercise.get_by_test_id("exercise-solution").click()
    assert task.value.suggested_filename == "Рыба_Алаколь_задание.xlsx"
    assert solution.value.suggested_filename == "Рыба_Алаколь_решение.xlsx"
    assert page.errors == []


def test_course_opens_first_chapter_and_chapter_from_link(page: Page):
    page.goto(f"{page.base_url}/course/")
    expect(page.locator("#ch00 details")).to_have_attribute("open", "")  # гость без прогресса — первая глава
    expect(page.locator("#ch04 details")).not_to_have_attribute("open", "")

    page.goto(f"{page.base_url}/course/#ch04")  # так ведут хлебные крошки урока
    expect(page.get_by_role("link", name="ИНДЕКС с нулём: вся строка или весь столбец")).to_be_visible()
    assert page.errors == []


def test_course_search_finds_lessons_and_chapters(page: Page):
    page.goto(f"{page.base_url}/course/")
    search = page.get_by_placeholder("Найти главу или урок")

    search.fill("гпр")  # урок главы 3: глава раскрывается, видны только совпавшие уроки
    expect(page.get_by_role("link", name="ГПР: цена на дату продажи")).to_be_visible()
    expect(page.get_by_role("link", name="ВПР по шкале: премия от суммы продаж")).to_be_hidden()
    expect(page.locator("#ch01")).to_be_hidden()

    search.fill("имена диапазонов")  # название главы: видна вся глава
    expect(page.locator("#ch02")).to_be_visible()
    expect(page.locator("#ch03")).to_be_hidden()

    search.fill("сводные таблицы олимпиады")
    expect(page.get_by_text("Ничего не нашлось")).to_be_visible()

    search.fill("")
    expect(page.locator("#ch03")).to_be_visible()
    expect(page.locator("#ch03 details")).not_to_have_attribute("open", "")  # раскрытие до поиска вернулось
    assert page.errors == []


def test_course_to_theory_with_frames_and_on_to_first_lesson(page: Page):
    page.goto(f"{page.base_url}/course/")
    page.locator("#ch01 summary").click()  # глава свёрнута: раскрыта первая непройденная
    page.locator("#ch01 [data-theory]").click()
    expect(page.get_by_role("heading", level=1)).to_have_text("Как Excel считает: ячейки, формулы и ссылки")

    images = page.locator("[data-figure] img")
    expect(images.first).to_be_visible()
    for i in range(images.count()):
        images.nth(i).scroll_into_view_if_needed()
        assert images.nth(i).evaluate("img => img.complete && img.naturalWidth > 0")

    page.locator("[data-question] summary").first.click()
    expect(page.locator("[data-question]").first).to_have_attribute("open", "")

    page.get_by_test_id("theory-next").click()
    expect(page.locator(".xl-title")).to_contain_text("Автомойка_модель.xlsx")
    expect(page.get_by_test_id("chapter-theory")).to_be_visible()
    assert page.errors == []
