from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Audio:
    data: bytes
    #: Расширение файла: mp3, wav, ogg — по нему браузер узнаёт формат
    ext: str


class TTSProvider(Protocol):
    #: Короткое имя провайдера — входит в ключ кэша: другой провайдер → другие файлы
    name: str

    def synthesize(self, text: str, *, voice: str, lang: str) -> Audio:
        """Озвучить текст. lang — язык речи (ru-RU); voice — голос провайдера."""
        ...


class ProviderError(Exception):
    """Провайдер не настроен или вернул ошибку — сообщение для автора урока."""
