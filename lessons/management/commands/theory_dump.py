import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from lessons.theory import figure_lesson, load_theory

from ..utf8 import force_utf8_stdout


class Command(BaseCommand):
    help = (
        "Кадры теории как мини-уроки в JSON — для сверки значений движком плеера: "
        "manage.py theory_dump | pnpm --dir player theory:verify"
    )

    def handle(self, *args, **options):
        force_utf8_stdout()
        dump = [
            figure_lesson(theory.chapter, figure).model_dump(mode="json", exclude_none=True)
            for _, theory in load_theory(Path(settings.CONTENT_DIR))
            for figure in theory.figures
        ]
        self.stdout.write(json.dumps(dump, ensure_ascii=False))
