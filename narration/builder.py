"""Сборка озвучки: аудио для каждого шага с полем say, на двух языках функций (СУММ / SUM).

Файл называется по хэшу (провайдер, голос, текст), поэтому повторная сборка вызывает синтез только
для новых и изменённых шагов. Для каждого урока пишется манифест <lesson_id>.json:
{"lesson": id, "steps": {"0": {"ru": "narration/ab12….wav", "en": "…"}}} — его читает плеер.
"""

import hashlib
import json
import re
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

from django.conf import settings

from lessons.schema import Lesson

from .providers import TTSProvider

LOCALES = ("ru", "en")
FN_RE = re.compile(r"\{fn:([A-Z][A-Z0-9.]*)\}")


@cache
def ru_function_names() -> dict[str, str]:
    """Тот же словарь, что у плеера (player/src/locale/functions-ru.json) — один источник."""
    path = Path(settings.BASE_DIR) / "player" / "src" / "locale" / "functions-ru.json"
    return json.loads(path.read_text(encoding="utf-8"))["functions"]


#: Как диктору произносить русские имена, которые синтезатор читает невнятно (на экране — как в Excel)
SPOKEN_RU = {
    "AVERAGE": "эс-эр-знач",
    "FORMULATEXT": "эф-текст",
    "VLOOKUP": "вэ-пэ-эр",
    "HLOOKUP": "гэ-пэ-эр",
    "COUNTIF": "счёт-если",
    "SUMIF": "сумм-если",
}


def render_say(say: str, locale: str) -> str:
    """{fn:SUM} → «СУММ» (ru) или «SUM» (en): диктор называет функцию так, как она видна на экране."""
    if locale == "ru":
        names = {**ru_function_names(), **SPOKEN_RU}
        return FN_RE.sub(lambda m: names.get(m.group(1), m.group(1)), say)
    return FN_RE.sub(lambda m: m.group(1), say)


def cache_key(provider: str, voice: str, text: str) -> str:
    return hashlib.sha256(f"{provider}\n{voice}\n{text}".encode()).hexdigest()[:20]


@dataclass
class BuildReport:
    synthesized: int = 0
    cached: int = 0
    manifests: list[Path] = field(default_factory=list)


def build_lesson(lesson: Lesson, provider: TTSProvider, *, voice: str, out_dir: Path, report: BuildReport) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    steps: dict[str, dict[str, str]] = {}
    for index, step in enumerate(lesson.steps):
        if not step.say:
            continue
        files: dict[str, str] = {}
        for locale in LOCALES:
            text = render_say(step.say, locale)
            key = cache_key(provider.name, voice, text)
            existing = next(out_dir.glob(f"{key}.*"), None)
            if existing:
                report.cached += 1
                path = existing
            else:
                audio = provider.synthesize(text, voice=voice, lang="ru-RU")
                path = out_dir / f"{key}.{audio.ext}"
                path.write_bytes(audio.data)
                report.synthesized += 1
            files[locale] = f"{out_dir.name}/{path.name}"
        steps[str(index)] = files

    manifest = out_dir / f"{lesson.id}.json"
    manifest.write_text(
        json.dumps({"lesson": lesson.id, "steps": steps}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report.manifests.append(manifest)
    return manifest


def build(lessons: list[Lesson], provider: TTSProvider, *, voice: str, out_dir: Path) -> BuildReport:
    report = BuildReport()
    for lesson in lessons:
        build_lesson(lesson, provider, voice=voice, out_dir=out_dir, report=report)
    return report


def load_manifest(lesson_id: str, out_dir: Path | None = None) -> dict | None:
    """Манифест озвучки урока для страницы урока; None — если озвучку ещё не собирали."""
    path = (out_dir or Path(settings.NARRATION_DIR)) / f"{lesson_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def narration_urls(lesson_id: str) -> dict[str, dict[str, str]]:
    """Манифест урока с полными URL аудио — то, что получает плеер. Пусто, если озвучки нет."""
    manifest = load_manifest(lesson_id)
    if not manifest:
        return {}
    return {
        step: {locale: f"{settings.MEDIA_URL}{path}" for locale, path in files.items()}
        for step, files in manifest["steps"].items()
    }
