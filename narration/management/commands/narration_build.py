from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from lessons.management.utf8 import force_utf8_stdout
from lessons.registry import get_registry
from narration.builder import build
from narration.providers import ProviderError, get_provider


class Command(BaseCommand):
    help = "Озвучка уроков: аудио для шагов с say (RU и EN названия функций), только новые и изменённые."

    def add_arguments(self, parser):
        parser.add_argument("--provider", help="silent | windows | yandex (по умолчанию TTS_PROVIDER из .env)")
        parser.add_argument("--lesson", action="append", help="Только этот урок (можно несколько раз)")

    def handle(self, *args, provider: str | None, lesson: list[str] | None, **options):
        force_utf8_stdout()
        registry = get_registry()
        lessons = list(registry.lessons)
        if lesson:
            unknown = sorted(set(lesson) - {item.id for item in lessons})
            if unknown:
                raise CommandError(f"Нет таких уроков: {', '.join(unknown)}")
            lessons = [item for item in lessons if item.id in lesson]

        try:
            tts = get_provider(provider)
            report = build(lessons, tts, voice=settings.TTS_VOICE, out_dir=settings.NARRATION_DIR)
        except ProviderError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Озвучка ({tts.name}): синтезировано {report.synthesized}, из кэша {report.cached}, "
                f"уроков {len(report.manifests)} → {settings.NARRATION_DIR}"
            )
        )
