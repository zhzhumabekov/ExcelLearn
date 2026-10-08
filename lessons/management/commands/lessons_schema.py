import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from pydantic.json_schema import GenerateJsonSchema

from lessons.schema import Lesson

from ..utf8 import force_utf8_stdout

DEFAULT_OUTPUT = Path(settings.BASE_DIR) / "player" / "schema" / "lesson.schema.json"


class WithoutFieldTitles(GenerateJsonSchema):
    # json2ts превращает заголовки полей в шумные алиасы (Title1, Click1…); заголовки моделей остаются.
    def field_title_should_be_set(self, schema) -> bool:
        return False


def render_schema() -> str:
    schema = Lesson.model_json_schema(schema_generator=WithoutFieldTitles)
    return json.dumps(schema, ensure_ascii=False, indent=2) + "\n"


class Command(BaseCommand):
    help = "Выгружает JSON Schema урока для плеера (из неё pnpm gen:types делает TS-типы)."

    def add_arguments(self, parser):
        parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
        parser.add_argument("--check", action="store_true", help="Не писать файл, а упасть, если он устарел")

    def handle(self, *args, output: Path, check: bool, **options):
        force_utf8_stdout()
        schema = render_schema()
        current = output.read_text(encoding="utf-8") if output.exists() else None

        if check:
            if current != schema:
                raise CommandError(
                    f"{output} устарел: выполните manage.py lessons_schema и pnpm --dir player gen:types"
                )
            self.stdout.write(self.style.SUCCESS(f"{output.name} актуален"))
            return

        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(schema, encoding="utf-8", newline="\n")
        self.stdout.write(self.style.SUCCESS(f"Записано: {output}"))
