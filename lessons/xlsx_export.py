"""Файл урока для ученика: лист в том виде, в каком урок начинается, — чтобы повторить шаги в своём Excel.

Обратная операция к xlsx_import: значения, формулы шаблона, форматы чисел, стили заголовков и ширина колонок.
"""

from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Border, Font, PatternFill, Side

from .schema import CellSpec, Lesson, Sheet

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

NUMBER_FORMATS = {
    "usd": '"$"#,##0.00',
    "kzt": '#,##0 "₸"',
    "number": "0.00",
}
HEAD_FILL = PatternFill("solid", fgColor="E8F3EC")  # --xl-green-soft плеера
TOTAL_BORDER = Border(top=Side(style="double", color="999999"))


def column_width_chars(px: int) -> float:
    # Обратно к xlsx_import.column_width_px: px = ширина * 8 + 12
    return max(round((px - 12) / 8, 2), 1.0)


def percent_format(value: object) -> str:
    # Как в плеере: целые проценты — «30%», остальные — с двумя знаками
    if isinstance(value, int | float) and float(round(value * 100, 6)).is_integer():
        return "0%"
    return "0.00%"


def lesson_filename(lesson: Lesson) -> str:
    return lesson.sheet.file or f"{lesson.id}.xlsx"


def build_workbook(sheet: Sheet) -> Workbook:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet.name[:31]  # предел Excel на длину имени листа

    for letter, px in sheet.columns.items():
        ws.column_dimensions[letter].width = column_width_chars(px)

    for addr, raw in sheet.cells.items():
        spec = raw if isinstance(raw, CellSpec) else CellSpec(v=raw)
        cell = ws[addr]
        if spec.f is not None:
            cell.value = spec.f
        elif spec.v is not None:
            cell.value = spec.v
            if isinstance(spec.v, str) and spec.v.startswith("="):
                cell.data_type = "s"  # текст, похожий на формулу, остаётся текстом

        if spec.fmt == "percent":
            cell.number_format = percent_format(spec.v)
        elif spec.fmt in NUMBER_FORMATS:
            cell.number_format = NUMBER_FORMATS[spec.fmt]

        if spec.style in ("head", "label", "total"):
            cell.font = Font(bold=True)
        if spec.style == "head":
            cell.fill = HEAD_FILL
        if spec.style == "total":
            cell.border = TOTAL_BORDER

    # Курсор в A1, как при открытии урока
    ws.sheet_view.selection[0].activeCell = "A1"
    ws.sheet_view.selection[0].sqref = "A1"
    return wb


def lesson_xlsx(lesson: Lesson) -> bytes:
    buffer = BytesIO()
    build_workbook(lesson.sheet).save(buffer)
    return buffer.getvalue()
