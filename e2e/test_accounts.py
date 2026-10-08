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


def test_signup_from_lesson_returns_to_lesson_logged_in(page: Page):
    page.goto(f"{page.base_url}/lessons/sum-and-autofill/")
    page.get_by_role("link", name="Регистрация").click()
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
