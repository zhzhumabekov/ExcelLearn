from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from lessons.loader import ContentError, load_course, load_lessons
from lessons.registry import Registry
from lessons.schema import Lesson

from ..utf8 import force_utf8_stdout


def warnings_for(path: Path, lesson: Lesson) -> list[str]:
    return [
        f"{path.name}: steps.{i}: нет say — шаг не будет озвучен" for i, step in enumerate(lesson.steps) if not step.say
    ]


class Command(BaseCommand):
    help = "Проверяет course.yaml и все уроки в content/lessons: схема, адреса, уникальность id и порядка."

    def handle(self, *args, **options):
        force_utf8_stdout()
        content_dir = Path(settings.CONTENT_DIR)
        try:
            course = load_course(content_dir)
            lessons = load_lessons(content_dir)
            registry = Registry(course, lessons)
        except ContentError as exc:
            for line in exc.errors:
                self.stderr.write(self.style.ERROR(line))
            raise CommandError(f"Ошибок: {len(exc.errors)}") from exc

        for path, lesson in lessons:
            for line in warnings_for(path, lesson):
                self.stdout.write(self.style.WARNING(line))

        self.stdout.write(self.style.SUCCESS(f"OK: уроков — {len(registry.lessons)}, глав — {len(registry.chapters)}"))
