from pathlib import Path

import yaml
from django.core.management.base import BaseCommand, CommandError

from ..utf8 import force_utf8_stdout


def _flow(value) -> str:
    text = yaml.safe_dump(value, default_flow_style=True, allow_unicode=True, sort_keys=False, width=1000)
    # У одиночного скаляра PyYAML дописывает маркер конца документа «...»
    return text.removesuffix("...\n").strip()


def render_yaml(source: str, sheet: dict, expect: dict) -> str:
    """Блоки sheet и expect для вставки в урок; ячейки — по одной на строку, в flow-стиле."""
    lines = [f"# lesson_import: {source}", "sheet:"]
    for key in ("file", "name", "columns", "rows"):
        lines.append(f"  {key}: {_flow(sheet[key])}")
    lines.append("  cells:")
    lines += [f"    {addr}: {_flow(value)}" for addr, value in sheet["cells"].items()]
    if expect:
        lines.append("")
        lines.append("expect:")
        lines += [f"  {addr}: {_flow(value)}" for addr, value in expect.items()]
    return "\n".join(lines) + "\n"


class Command(BaseCommand):
    help = "Заготовка урока из файлов книги: sheet — из шаблона, expect — из файла решения."

    def add_arguments(self, parser):
        parser.add_argument("template", type=Path, help="Шаблон, например Templates/Chapter 1 Templates/wagestemp.xlsx")
        parser.add_argument("--final", type=Path, help="Решение — значения формул для expect")
        parser.add_argument("--range", dest="cell_range", help="Диапазон листа, например B3:F15 (по умолчанию — весь)")
        parser.add_argument("--sheet", help="Имя листа (по умолчанию — активный)")
        parser.add_argument("--output", type=Path, help="Записать в файл вместо вывода в консоль")

    def handle(self, *args, template: Path, final: Path | None, cell_range, sheet, output: Path | None, **options):
        force_utf8_stdout()
        from lessons.xlsx_import import import_workbook  # openpyxl есть только в dev-окружении

        for path in filter(None, (template, final)):
            if not path.exists():
                raise CommandError(f"Файл не найден: {path}")

        result = import_workbook(template, final, cell_range, sheet)
        source = template.name + (f" + {final.name}" if final else "")
        text = render_yaml(source, result.sheet, result.expect)

        for warning in result.warnings:
            self.stderr.write(self.style.WARNING(warning))
        if output:
            output.write_text(text, encoding="utf-8", newline="\n")
            self.stderr.write(self.style.SUCCESS(f"Записано: {output}"))
        else:
            self.stdout.write(text, ending="")
