from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command
from playwright.sync_api import Page, expect

# Запоминаем, какие аудиофайлы запускает плеер (тишина от провайдера silent — проигрывается и в headless)
RECORD_AUDIO = """
  window.__narration = [];
  const NativeAudio = window.Audio;
  window.Audio = function (...args) {
    const audio = new NativeAudio(...args);
    const play = audio.play.bind(audio);
    audio.play = () => { window.__narration.push({ src: audio.src, rate: audio.playbackRate }); return play(); };
    return audio;
  };
"""


@pytest.fixture
def narration(settings, tmp_path: Path):
    settings.NARRATION_ENABLED = True  # по умолчанию озвучка выключена
    settings.MEDIA_ROOT = tmp_path
    settings.NARRATION_DIR = tmp_path / "narration"
    call_command("narration_build", "--provider", "silent", stdout=StringIO())


def test_lesson_plays_step_narration_in_locale(page: Page, member, narration):
    page.add_init_script(RECORD_AUDIO)
    page.goto(f"{page.base_url}/lessons/sum-and-autofill/")
    expect(page.locator(".xl-controls").get_by_title("Выключить озвучку")).to_be_visible()

    page.click(".xl-start button")
    page.wait_for_function("window.__narration.length >= 1", timeout=10_000)

    played = page.evaluate("window.__narration")
    assert "/media/narration/" in played[0]["src"]
    response = page.request.get(played[0]["src"])
    assert response.status == 200 and response.headers["content-type"].startswith("audio/")
    assert page.errors == []


def test_sound_toggle_turns_narration_off(page: Page, member, narration):
    page.add_init_script(RECORD_AUDIO)
    page.goto(f"{page.base_url}/lessons/sum-and-autofill/")

    page.locator(".xl-controls").get_by_title("Выключить озвучку").click()
    expect(page.locator(".xl-controls").get_by_title("Включить озвучку")).to_have_text("🔇")
    page.click(".xl-start button")
    page.wait_for_timeout(1500)

    assert page.evaluate("window.__narration") == []
    assert page.errors == []


def test_lesson_without_narration_has_no_sound_button(page: Page, member, settings, tmp_path: Path):
    settings.NARRATION_DIR = tmp_path / "empty"
    page.goto(f"{page.base_url}/lessons/sum-and-autofill/")

    expect(page.locator(".xl-controls")).to_be_visible()
    expect(page.locator(".xl-controls").get_by_title("Выключить озвучку")).to_have_count(0)
