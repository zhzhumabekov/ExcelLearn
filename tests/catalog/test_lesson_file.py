from io import BytesIO
from urllib.parse import quote

import openpyxl
import pytest
from django.urls import reverse

from lessons.registry import get_registry
from lessons.schema import Sheet
from lessons.xlsx_export import build_workbook, column_width_chars

LESSON_IDS = [lesson.id for lesson in get_registry().lessons]


def download(client, lesson_id):
    return client.get(reverse("catalog:lesson-file", args=[lesson_id]))


@pytest.mark.parametrize("lesson_id", LESSON_IDS)
def test_every_lesson_has_a_downloadable_xlsx(client, lesson_id):
    lesson = get_registry().get(lesson_id)

    response = download(client, lesson_id)

    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/vnd.openxmlformats")
    assert quote(lesson.sheet.file) in response["Content-Disposition"]  # кириллица — через filename*
    ws = openpyxl.load_workbook(BytesIO(response.content)).active
    assert ws.title == lesson.sheet.name


def test_file_has_lesson_data_formats_and_widths(client):
    ws = openpyxl.load_workbook(BytesIO(download(client, "wages-weekly-salary").content)).active

    assert ws["B4"].value == "Айгерим Сапарова"
    assert ws["C4"].value == 49
    assert ws["D4"].value == 1800
    assert ws["D4"].number_format == '#,##0 "₸"'
    assert ws["E4"].value is None  # результат ученик посчитает сам
    assert ws["E4"].number_format == '#,##0 "₸"'  # но формат уже стоит, как в уроке
    assert ws["B3"].font.bold and ws["B3"].fill.fgColor.rgb.endswith("E8F3EC")
    assert ws.column_dimensions["B"].width == column_width_chars(150)


def test_link_under_player(client):
    html = client.get(reverse("catalog:lesson", args=["wages-weekly-salary"])).content.decode()

    assert 'href="/lessons/wages-weekly-salary/file.xlsx"' in html
    assert "Скачать Табель_кафе.xlsx" in html
    assert html.index('id="player"') < html.index("Скачать Табель_кафе.xlsx")


def test_unknown_lesson_file_is_404(client):
    assert download(client, "nope").status_code == 404


def test_formulas_percent_and_text_like_formula():
    sheet = Sheet.model_validate(
        {
            "cells": {
                "A1": {"f": "=SUM(B1:B2)"},
                "A2": {"v": 0.3, "fmt": "percent"},
                "A3": {"fmt": "percent"},
                "A4": {"v": "=C4*D4"},  # текст из FORMULATEXT в шаблоне — не формула
                "A5": {"v": "Итого", "style": "total"},
            }
        }
    )

    ws = build_workbook(sheet).active

    assert ws["A1"].value == "=SUM(B1:B2)" and ws["A1"].data_type == "f"
    assert ws["A2"].number_format == "0%"
    assert ws["A3"].number_format == "0.00%"
    assert ws["A4"].data_type == "s"
    assert ws["A5"].border.top.style == "double"
    assert ws.title == "Лист1"
