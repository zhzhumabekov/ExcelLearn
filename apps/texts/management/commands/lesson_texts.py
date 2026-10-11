from django.core.management.base import BaseCommand

from apps.texts.models import LessonText
from apps.texts.services import edit_status, field_label
from lessons.management.utf8 import force_utf8_stdout
from lessons.registry import get_registry


class Command(BaseCommand):
    help = (
        "Правки текстов уроков из админки: что перенести в генератор главы (scripts/content/genNN.py), "
        "чтобы правка попала в YAML. Перенесённые правки получают статус «уже в YAML» — их можно удалить в админке."
    )

    def add_arguments(self, parser):
        parser.add_argument("lesson_id", nargs="?", help="Только этот урок")

    def handle(self, *args, lesson_id=None, **options):
        force_utf8_stdout()
        registry = get_registry()
        edits = LessonText.objects.select_related("updated_by")
        if lesson_id:
            edits = edits.filter(lesson_id=lesson_id)
        if not edits:
            self.stdout.write("Правок нет")
            return
        for edit in edits:
            status = edit_status(edit, registry.get(edit.lesson_id))
            self.stdout.write(f"== {edit.lesson_id} · {field_label(edit.field)} [{edit.field}] · {status}")
            self.stdout.write(f"- {edit.original}")
            self.stdout.write(f"+ {edit.text}\n")
