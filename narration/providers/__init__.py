from django.conf import settings

from .base import Audio, ProviderError, TTSProvider
from .silent import SilentProvider

__all__ = ["Audio", "ProviderError", "TTSProvider", "get_provider"]


def get_provider(name: str | None = None) -> TTSProvider:
    name = name or settings.TTS_PROVIDER
    if name == "silent":
        return SilentProvider()
    if name == "windows":
        from .windows import WindowsProvider

        return WindowsProvider()
    if name == "yandex":
        from .yandex import YandexProvider  # импорт здесь: httpx и ключ нужны только ему

        return YandexProvider.from_settings()
    raise ProviderError(f"Неизвестный провайдер озвучки: {name!r} (доступны: silent, windows, yandex)")
