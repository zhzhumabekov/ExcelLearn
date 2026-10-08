import io
import re
import wave

from .base import Audio

#: Темп речи для оценки длительности: ~150 слов в минуту
WORDS_PER_SECOND = 2.5
SAMPLE_RATE = 8000


def estimated_seconds(text: str) -> float:
    words = len(re.findall(r"\w+", text))
    return max(1.0, round(words / WORDS_PER_SECOND, 2))


class SilentProvider:
    """Тишина примерной длины произнесения — для разработки и тестов, без сети и ключа."""

    name = "silent"

    def synthesize(self, text: str, *, voice: str, lang: str) -> Audio:
        frames = int(estimated_seconds(text) * SAMPLE_RATE)
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(1)  # 8 бит: тишина = 128
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(b"\x80" * frames)
        return Audio(buffer.getvalue(), "wav")
