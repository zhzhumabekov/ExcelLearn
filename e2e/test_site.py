from playwright.sync_api import Page, expect


def test_theme_toggle_cycles_and_survives_reload(page: Page):
    page.emulate_media(color_scheme="light")
    page.goto(f"{page.base_url}/")
    html = page.locator("html")
    toggle = page.get_by_label("Тема оформления")
    expect(html).to_have_attribute("data-theme", "light")  # системная тема = светлая

    toggle.click()  # → светлая
    toggle.click()  # → тёмная
    expect(html).to_have_attribute("data-theme", "dark")
    expect(toggle).to_have_attribute("title", "Тема: тёмная")

    page.reload()
    expect(html).to_have_attribute("data-theme", "dark")
    assert page.errors == []


def test_system_theme_follows_os(page: Page):
    page.emulate_media(color_scheme="dark")
    page.goto(f"{page.base_url}/")

    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    assert page.errors == []
