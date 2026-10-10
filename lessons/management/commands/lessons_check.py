from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from lessons.exercises import load_exercises
from lessons.layout import layout_errors
from lessons.loader import ContentError, load_course, load_lessons
from lessons.registry import Registry
from lessons.schema import Lesson

from ..utf8 import force_utf8_stdout


def warnings_for(path: Path, lesson: Lesson) -> list[str]:
    return [
        f"{path.name}: steps.{i}: нет say — шаг не будет озвучен" for i, step in enumerate(lesson.steps) if not step.say
    ]


class Command(BaseCommand):
    help = "Проверяет course.yaml, уроки (content/lessons) и задания (content/exercises): схема, адреса, id."

    def handle(self, *args, **options):
        force_utf8_stdout()
        content_dir = Path(settings.CONTENT_DIR)
        try:
            course = load_course(content_dir)
            lessons = load_lessons(content_dir)
            exercise_sets = load_exercises(content_dir)
            registry = Registry(course, lessons, exercise_sets)
            # Таблица — с A1: пустые строки и столбцы по краям раздувают окно Excel в плеере
            if errors := layout_errors(lessons, exercise_sets):
                raise ContentError(errors)
        except ContentError as exc:
            for line in exc.errors:
                self.stderr.write(self.style.ERROR(line))
            raise CommandError(f"Ошибок: {len(exc.errors)}") from exc

        for path, lesson in lessons:
            for line in warnings_for(path, lesson):
                self.stdout.write(self.style.WARNING(line))

        exercises = sum(len(items) for items in registry.exercises.values())
        self.stdout.write(
            self.style.SUCCESS(
                f"OK: уроков — {len(registry.lessons)}, заданий — {exercises}, глав — {len(registry.chapters)}"
            )
        )
