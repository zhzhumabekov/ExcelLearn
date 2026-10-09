import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from lessons.exercises import solution_sheet
from lessons.registry import build_registry

from ..utf8 import force_utf8_stdout


class Command(BaseCommand):
    help = (
        "Листы решений заданий (как в файлах «…_решение.xlsx») и ответы expect в JSON — "
        "для сверки движком плеера: manage.py exercises_dump | pnpm --dir player exercises:verify"
    )

    def handle(self, *args, **options):
        force_utf8_stdout()
        registry = build_registry(Path(settings.CONTENT_DIR))
        dump = [
            {
                "name": f"{chapter}/{exercise.number} {exercise.id}",
                "sheet": solution_sheet(exercise).model_dump(mode="json", exclude_none=True),
                "names": [n.model_dump(mode="json", exclude_none=True) for n in exercise.solution.names],
                "expect": exercise.expect,
            }
            for chapter, exercises in registry.exercises.items()
            for exercise in exercises
        ]
        self.stdout.write(json.dumps(dump, ensure_ascii=False))
