from playwright.sync_api import Page, expect


def test_site_stays_light_with_dark_os_theme(page: Page):
    """Тёмной темы нет: при тёмной теме Windows сайт такой же светлый и без переключателя."""
    background = "getComputedStyle(document.body).backgroundColor"
    page.emulate_media(color_scheme="light")
    page.goto(f"{page.base_url}/")
    light = page.evaluate(background)

    page.emulate_media(color_scheme="dark")
    page.reload()

    expect(page.locator("html")).not_to_have_attribute("data-theme", "dark")
    expect(page.get_by_label("Тема оформления")).to_have_count(0)
    assert page.evaluate(background) == light
    assert page.errors == []
