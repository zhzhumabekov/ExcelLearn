from playwright.sync_api import Page, expect

from apps.progress.models import LessonProgress

PASSWORD = "Excel-learn-2026"


def log_in(page: Page, django_user_model):
    user = django_user_model.objects.create_user(
        email="amy@example.kz", password=PASSWORD, first_name="Эми", last_name="Альбертс", phone="+77010000002"
    )
    page.goto(f"{page.base_url}/accounts/login/")
    page.get_by_label("Email", exact=True).fill(user.email)
    page.get_by_label("Пароль", exact=True).fill(PASSWORD)
    page.get_by_role("button", name="Войти").click()
    expect(page.get_by_test_id("user-name")).to_have_text("Эми")
    return user


def test_opening_lesson_is_not_progress_but_watching_is(page: Page, django_user_model):
    user = log_in(page, django_user_model)

    page.goto(f"{page.base_url}/lessons/wages-weekly-salary/")
    expect(page.locator(".xl-player")).to_be_visible()
    page.wait_for_timeout(500)
    assert not LessonProgress.objects.filter(user=user).exists()

    with page.expect_response("**/api/progress/wages-weekly-salary/") as response:
        page.click(".xl-seg >> nth=4")  # перемотка к шагу 5
    assert response.value.json() == {"last_step": 4, "completed": False}

    progress = LessonProgress.objects.get(user=user, lesson_id="wages-weekly-salary")
    assert progress.last_step == 4 and not progress.completed
    assert page.errors == []


def test_guest_progress_continue_and_transfer_on_signup(page: Page, django_user_model):
    lesson = f"{page.base_url}/lessons/wages-weekly-salary/"
    page.goto(lesson)
    page.click(".xl-seg >> nth=4")  # гость дошёл до шага 5
    page.wait_for_function("localStorage.getItem('excellearn:progress') !== null")

    page.goto(f"{page.base_url}/course/")
    row = page.locator('[data-lesson="wages-weekly-salary"]')
    expect(row.locator("[data-status]")).to_have_text("Шаг 5 из 10")

    page.goto(lesson)
    expect(page.locator(".xl-start button")).to_have_text("▶ Продолжить с шага 5")

    page.get_by_role("link", name="Регистрация").click()
    for label, value in {
        "Имя": "Ким",
        "Фамилия": "Акерс",
        "Email": "kim.guest@example.kz",
        "Телефон": "+7 701 000 00 09",
        "Пароль": "Excel-learn-2026",
        "Пароль ещё раз": "Excel-learn-2026",
    }.items():
        page.get_by_label(label, exact=True).fill(value)
    page.get_by_role("checkbox").check()
    with page.expect_response("**/api/progress/merge/") as merged:
        page.get_by_role("button", name="Зарегистрироваться").click()
    assert merged.value.json() == {"merged": 1}

    expect(page.locator(".xl-start button")).to_have_text("▶ Продолжить с шага 5")
    user = django_user_model.objects.get(email="kim.guest@example.kz")
    assert LessonProgress.objects.get(user=user, lesson_id="wages-weekly-salary").last_step == 4
    assert page.evaluate("localStorage.getItem('excellearn:progress')") is None

    page.goto(f"{page.base_url}/course/")
    expect(row.locator("[data-status]")).to_have_text("Шаг 5 из 10")
    expect(page.locator("#ch01 [data-chapter-percent]")).to_have_text("пройдено 0%")
    assert page.errors == []
