from urllib.parse import parse_qs

import httpx
import pytest

from narration.providers import ProviderError, get_provider
from narration.providers.yandex import URL, YandexProvider


def provider(handler, **kwargs) -> YandexProvider:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return YandexProvider("secret-key", "folder-1", client=client, backoff=0, **kwargs)


def test_sends_form_with_api_key_and_returns_mp3():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        seen["form"] = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        return httpx.Response(200, content=b"ID3-mp3-bytes")

    audio = provider(handler).synthesize("Вводим функцию СУММ.", voice="alena", lang="ru-RU")

    assert audio.data == b"ID3-mp3-bytes" and audio.ext == "mp3"
    assert seen["url"] == URL
    assert seen["auth"] == "Api-Key secret-key"
    assert seen["form"] == {
        "text": "Вводим функцию СУММ.",
        "lang": "ru-RU",
        "voice": "alena",
        "format": "mp3",
        "folderId": "folder-1",
    }


def test_retries_on_429_and_5xx():
    statuses = iter([429, 503, 200])

    def handler(request):
        return httpx.Response(next(statuses), content=b"ok")

    assert provider(handler).synthesize("текст", voice="alena", lang="ru-RU").data == b"ok"


def test_gives_up_after_attempts():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(500, text="internal")

    with pytest.raises(ProviderError, match="500 internal"):
        provider(handler, attempts=2).synthesize("текст", voice="alena", lang="ru-RU")
    assert len(calls) == 2


@pytest.mark.parametrize("status", [401, 403])
def test_bad_key_is_explained_without_retries(status):
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(status)

    with pytest.raises(ProviderError, match="проверьте TTS_API_KEY"):
        provider(handler).synthesize("текст", voice="alena", lang="ru-RU")
    assert len(calls) == 1


def test_network_error_after_retries():
    def handler(request):
        raise httpx.ConnectError("нет сети")

    with pytest.raises(ProviderError, match="недоступен"):
        provider(handler).synthesize("текст", voice="alena", lang="ru-RU")


def test_too_long_text():
    with pytest.raises(ProviderError, match="длиннее 5000"):
        provider(lambda r: httpx.Response(200)).synthesize("а" * 5001, voice="alena", lang="ru-RU")


def test_missing_key_is_explained(settings):
    settings.TTS_API_KEY = ""

    with pytest.raises(ProviderError, match="нужен TTS_API_KEY"):
        get_provider("yandex")


def test_get_provider_reads_settings(settings):
    settings.TTS_API_KEY, settings.TTS_FOLDER_ID = "k", "f"

    yandex = get_provider("yandex")

    assert isinstance(yandex, YandexProvider)
    assert (yandex.api_key, yandex.folder_id) == ("k", "f")
