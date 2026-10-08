"""Yandex SpeechKit, REST API v1: POST tts:synthesize (форма), ответ — аудио целиком.

Документация: https://yandex.cloud/ru/docs/speechkit/tts/request
Нужен API-ключ сервисного аккаунта с ролью ai.speechkit-tts.user (TTS_API_KEY) и, если ключ
не сервисного аккаунта, идентификатор каталога (TTS_FOLDER_ID). Провайдеру уходит только текст уроков.
"""

import time

import httpx
from django.conf import settings

from .base import Audio, ProviderError

URL = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize"
#: Ограничение API на длину текста одного запроса
MAX_CHARS = 5000
RETRY_STATUSES = {429, 500, 502, 503, 504}


class YandexProvider:
    name = "yandex"

    def __init__(
        self,
        api_key: str,
        folder_id: str = "",
        *,
        client: httpx.Client | None = None,
        attempts: int = 3,
        backoff: float = 1.0,
    ):
        if not api_key:
            raise ProviderError("Для Yandex SpeechKit нужен TTS_API_KEY в .env (или используйте --provider silent)")
        self.api_key = api_key
        self.folder_id = folder_id
        self.client = client or httpx.Client(timeout=30)
        self.attempts = attempts
        self.backoff = backoff

    @classmethod
    def from_settings(cls) -> "YandexProvider":
        return cls(settings.TTS_API_KEY, settings.TTS_FOLDER_ID)

    def synthesize(self, text: str, *, voice: str, lang: str) -> Audio:
        if len(text) > MAX_CHARS:
            raise ProviderError(f"Текст длиннее {MAX_CHARS} символов — разбейте шаг: {text[:60]}…")
        data = {"text": text, "lang": lang, "voice": voice, "format": "mp3"}
        if self.folder_id:
            data["folderId"] = self.folder_id
        headers = {"Authorization": f"Api-Key {self.api_key}"}

        for attempt in range(1, self.attempts + 1):
            try:
                response = self.client.post(URL, data=data, headers=headers)
            except httpx.TransportError as exc:
                if attempt == self.attempts:
                    raise ProviderError(f"Yandex SpeechKit недоступен: {exc}") from exc
            else:
                if response.status_code == 200:
                    return Audio(response.content, "mp3")
                if response.status_code in (401, 403):
                    raise ProviderError(
                        f"Yandex SpeechKit отклонил ключ ({response.status_code}): проверьте TTS_API_KEY, "
                        "роль ai.speechkit-tts.user и TTS_FOLDER_ID"
                    )
                if response.status_code not in RETRY_STATUSES or attempt == self.attempts:
                    raise ProviderError(f"Yandex SpeechKit: {response.status_code} {response.text[:200]}")
            time.sleep(self.backoff * 2 ** (attempt - 1))
        raise ProviderError("Yandex SpeechKit: исчерпаны попытки")  # недостижимо, для типизации
