import io
import sys
import wave

import pytest

from narration.providers import get_provider

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="голос Windows есть только в Windows")


def test_windows_voice_speaks_russian_text():
    short = get_provider("windows").synthesize("Да.", voice="alena", lang="ru-RU")
    long = get_provider("windows").synthesize(
        "Выделяем ячейку Е четыре, ставим знак «равно» и щёлкаем Цэ четыре.", voice="alena", lang="ru-RU"
    )

    def seconds(data: bytes) -> float:
        with wave.open(io.BytesIO(data)) as wav:
            return wav.getnframes() / wav.getframerate()

    assert long.ext == "wav"
    # Кириллица дошла до синтезатора целиком: длинная фраза звучит заметно дольше короткой
    assert seconds(long.data) > 3 * seconds(short.data) > 0
