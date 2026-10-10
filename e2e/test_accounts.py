from playwright.sync_api import Page, expect


def fill_signup(page: Page, **overrides: str) -> None:
    data = {
        "Имя": "Лука",
        "Фамилия": "Абрус",
        "Email": "luka@example.kz",
        "Телефон": "8 701 123 45 67",
        "Пароль": "Excel-learn-2026",
        "Пароль ещё раз": "Excel-learn-2026",
        **overrides,
    }
    for label, value in data.items():
        page.get_by_label(label, exact=True).fill(value)


def test_guest_lesson_leads_to_signup_and_back_logged_in(page: Page):
    page.goto(f"{page.base_url}/course/")
    expect(page.get_by_test_id("members-only")).to_be_visible()  # оглавление открыто, уроки — после регистрации
    page.locator('[data-lesson="sum-and-autofill"] a').click()  # глава 0 раскрыта
    expect(page.get_by_role("heading", name="Регистрация")).to_be_visible()

    fill_signup(page)
    page.get_by_role("checkbox").check()
    page.get_by_role("button", name="Зарегистрироваться").click()

    expect(page).to_have_url(f"{page.base_url}/lessons/sum-and-autofill/")
    expect(page.get_by_test_id("user-name")).to_have_text("Лука")
    assert page.errors == []


def test_signup_without_consent_shows_error(page: Page):
    page.goto(f"{page.base_url}/accounts/signup/")

    fill_signup(page)
    page.get_by_role("button", name="Зарегистрироваться").click()

    expect(page.get_by_text("Без согласия на обработку персональных данных регистрация невозможна.")).to_be_visible()
    # Введённое сохраняется, кроме паролей
    expect(page.get_by_label("Email", exact=True)).to_have_value("luka@example.kz")
    expect(page.get_by_label("Пароль", exact=True)).to_have_value("")
    assert page.errors == []


def test_consent_link_opens_document(page: Page):
    page.goto(f"{page.base_url}/accounts/signup/")

    with page.expect_popup() as popup:
        page.get_by_role("link", name="согласие на сбор и обработку персональных данных").click()

    expect(popup.value.get_by_role("heading", level=1)).to_have_text("Согласие на сбор и обработку персональных данных")


def test_login_logout_and_forgot_password(page: Page, django_user_model):
    django_user_model.objects.create_user(
        email="kim@example.kz", password="Excel-learn-2026", first_name="Ким", last_name="Акерс", phone="+77010000001"
    )
    page.goto(f"{page.base_url}/course/")

    page.get_by_test_id("members-only").get_by_role("link", name="Войти").click()
    page.get_by_label("Email", exact=True).fill("kim@example.kz")
    page.get_by_label("Пароль", exact=True).fill("wrong-password")
    page.get_by_role("button", name="Войти").click()
    expect(page.get_by_role("alert")).to_have_text("Неверный email или пароль.")

    page.get_by_label("Пароль", exact=True).fill("Excel-learn-2026")
    page.get_by_role("button", name="Войти").click()
    expect(page).to_have_url(f"{page.base_url}/course/")
    expect(page.get_by_test_id("user-name")).to_have_text("Ким")

    page.get_by_role("button", name="Выйти").click()
    expect(page.get_by_role("link", name="Войти")).to_be_visible()

    page.get_by_role("link", name="Войти").click()
    page.get_by_role("link", name="Забыли пароль?").click()
    expect(page.get_by_role("heading", name="Восстановление пароля")).to_be_visible()
    assert page.errors == []
