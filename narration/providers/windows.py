"""Голос Windows (System.Speech, «Microsoft Irina» для ru-RU) — бесплатный предпросмотр озвучки на компьютере
разработчика: послушать тексты say и синхронизацию до подключения Yandex. Только Windows, качество ниже.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from .base import Audio, ProviderError

# Текст — через stdin в UTF-8 (без экранирования в командной строке), результат — WAV во временный файл
SCRIPT = (
    "[Console]::InputEncoding = [Text.Encoding]::UTF8;"
    "Add-Type -AssemblyName System.Speech;"
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
    "$s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet, "
    "[System.Speech.Synthesis.VoiceAge]::NotSet, 0, [Globalization.CultureInfo]$env:TTS_LANG);"
    "$s.SetOutputToWaveFile($env:TTS_OUT);"
    "$s.Speak([Console]::In.ReadToEnd());"
    "$s.Dispose()"
)


class WindowsProvider:
    name = "windows"

    def synthesize(self, text: str, *, voice: str, lang: str) -> Audio:
        if sys.platform != "win32":
            raise ProviderError("Провайдер windows работает только на Windows — используйте silent или yandex")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "speech.wav"
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", SCRIPT],
                input=text.encode("utf-8"),
                env={**os.environ, "TTS_OUT": str(out), "TTS_LANG": lang},
                capture_output=True,
                check=False,
            )
            if result.returncode != 0 or not out.exists():
                error = result.stderr.decode("cp866", errors="replace").strip()[:300]
                raise ProviderError(f"Голос Windows не сработал: {error or 'нет файла'}")
            return Audio(out.read_bytes(), "wav")
