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
