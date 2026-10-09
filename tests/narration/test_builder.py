import io
import json
import wave
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import CommandError, call_command

from lessons.schema import Lesson
from narration.builder import build, load_manifest, narration_urls, render_say
from narration.providers import Audio, ProviderError, get_provider
from narration.providers.silent import SilentProvider, estimated_seconds


class CountingProvider:
    name = "counting"

    def __init__(self):
        self.calls: list[str] = []

    def synthesize(self, text: str, *, voice: str, lang: str) -> Audio:
        self.calls.append(text)
        return Audio(text.encode(), "mp3")


def lesson(**say) -> Lesson:
    steps = [
        {"title": "Первый", "text": "t", "say": say.get("first", "Вводим функцию {fn:SUM}."), "actions": [{"wait": 1}]},
        {"title": "Без озвучки", "text": "t", "actions": [{"wait": 1}]},
        {"title": "Третий", "text": "t", "say": say.get("third", "Нажимаем Enter."), "actions": [{"wait": 1}]},
    ]
    return Lesson.model_validate(
        {"id": "demo", "chapter": "ch01", "order": 1, "title": "Демо", "sheet": {}, "steps": steps}
    )


@pytest.mark.parametrize(
    ("locale", "spoken"),
    [("ru", "Функция СУММ, затем эс-эр-знач, ВПР → вэ-пэ-эр"), ("en", "Функция SUM, затем AVERAGE, VLOOKUP → VLOOKUP")],
)
def test_render_say_uses_function_names_of_locale(locale, spoken):
    say = (
        "Функция {fn:SUM}, затем {fn:AVERAGE}, ВПР → {fn:VLOOKUP}"
        if locale == "ru"
        else "Функция {fn:SUM}, затем {fn:AVERAGE}, VLOOKUP → {fn:VLOOKUP}"
    )
    assert render_say(say, locale) == spoken


def test_build_writes_audio_per_locale_and_manifest(tmp_path: Path):
    provider = CountingProvider()

    report = build([lesson()], provider, voice="alena", out_dir=tmp_path)

    manifest = json.loads((tmp_path / "demo.json").read_text(encoding="utf-8"))
    assert list(manifest["steps"]) == ["0", "2"]  # шаг без say не озвучивается
    assert manifest["steps"]["0"]["ru"] != manifest["steps"]["0"]["en"]  # СУММ / SUM
    assert manifest["steps"]["2"]["ru"] == manifest["steps"]["2"]["en"]  # текст без функций — один файл
    for path in manifest["steps"]["0"].values():
        assert (tmp_path.parent / path).exists()
    assert sorted(provider.calls) == sorted(["Вводим функцию СУММ.", "Вводим функцию SUM.", "Нажимаем Enter."])
    assert (report.synthesized, report.cached) == (3, 1)
    assert load_manifest("demo", tmp_path) == manifest


def test_rebuild_uses_cache_and_resynthesizes_only_changed_steps(tmp_path: Path):
    build([lesson()], CountingProvider(), voice="alena", out_dir=tmp_path)
    again = CountingProvider()

    report = build([lesson()], again, voice="alena", out_dir=tmp_path)
    assert again.calls == []
    assert report.synthesized == 0

    changed = CountingProvider()
    build([lesson(third="Нажимаем Enter ещё раз.")], changed, voice="alena", out_dir=tmp_path)
    assert changed.calls == ["Нажимаем Enter ещё раз."]


def test_other_voice_is_other_file(tmp_path: Path):
    build([lesson()], CountingProvider(), voice="alena", out_dir=tmp_path)
    other = CountingProvider()

    build([lesson()], other, voice="filipp", out_dir=tmp_path)

    assert len(other.calls) == 3


def test_load_manifest_missing_is_none(tmp_path: Path):
    assert load_manifest("nope", tmp_path) is None


def test_silent_provider_makes_valid_wav_of_estimated_length():
    text = "Выделяем ячейку Е четыре и ставим знак равно"
    audio = SilentProvider().synthesize(text, voice="alena", lang="ru-RU")

    with wave.open(io.BytesIO(audio.data)) as wav:
        seconds = wav.getnframes() / wav.getframerate()
    assert audio.ext == "wav"
    assert seconds == pytest.approx(estimated_seconds(text), abs=0.01)
    assert estimated_seconds("Да") == 1.0  # не короче секунды


def test_unknown_provider():
    with pytest.raises(ProviderError, match="Неизвестный провайдер"):
        get_provider("nope")


def test_command_builds_real_lessons_with_silent_provider(settings, tmp_path: Path):
    settings.NARRATION_DIR = tmp_path / "narration"
    out = StringIO()

    call_command("narration_build", "--provider", "silent", "--lesson", "sum-and-autofill", stdout=out)

    assert "Озвучка (silent)" in out.getvalue()
    assert (settings.NARRATION_DIR / "sum-and-autofill.json").exists()
    assert not (settings.NARRATION_DIR / "wages-weekly-salary.json").exists()


def test_command_rejects_unknown_lesson(settings, tmp_path: Path):
    settings.NARRATION_DIR = tmp_path

    with pytest.raises(CommandError, match="Нет таких уроков: nope"):
        call_command("narration_build", "--provider", "silent", "--lesson", "nope", stdout=StringIO())


def test_narration_urls_empty_while_narration_disabled(settings, tmp_path: Path):
    settings.NARRATION_DIR = tmp_path / "narration"
    call_command("narration_build", "--provider", "silent", "--lesson", "sum-and-autofill", stdout=StringIO())

    settings.NARRATION_ENABLED = False
    assert narration_urls("sum-and-autofill") == {}  # плеер без кнопки звука

    settings.NARRATION_ENABLED = True
    assert narration_urls("sum-and-autofill")["0"]["ru"].endswith(".wav")
