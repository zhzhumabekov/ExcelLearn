from io import BytesIO
from pathlib import Path
from urllib.parse import unquote

import openpyxl
import pytest
from django.urls import reverse
from pydantic import ValidationError

from lessons.exercises import solution_sheet
from lessons.loader import ContentError
from lessons.registry import Registry, get_registry
from lessons.schema import ExerciseSet
from lessons.xlsx_export import ANSWER_FILL, plain_text

EXERCISES = get_registry().exercises["ch01"]


def workbook(client, exercise_id, kind):
    response = client.get(reverse(f"catalog:exercise-{kind}", args=["ch01", exercise_id]))
    assert response.status_code == 200
    return response, openpyxl.load_workbook(BytesIO(response.content))


def test_page_lists_exercises_with_both_downloads(client):
    html = client.get(reverse("catalog:exercises", args=["ch01"])).content.decode()

    assert html.count("data-exercise=") == len(EXERCISES) == 6
    assert "Квота вылова на озере Алаколь" in html
    assert 'href="/course/ch01/exercises/final-grade/task.xlsx"' in html
    assert 'href="/course/ch01/exercises/final-grade/solution.xlsx"' in html
    assert "Частая ошибка." in html


def test_unknown_chapter_or_exercise_is_404(client):
    assert client.get(reverse("catalog:exercises", args=["ch00"])).status_code == 404  # у главы 0 заданий нет
    assert client.get(reverse("catalog:exercise-task", args=["ch01", "nope"])).status_code == 404


@pytest.mark.parametrize("exercise", EXERCISES, ids=lambda e: e.id)
def test_every_exercise_has_task_and_solution_files(client, exercise):
    for kind, suffix in (("task", "_задание.xlsx"), ("solution", "_решение.xlsx")):
        response, wb = workbook(client, exercise.id, kind)
        assert wb.sheetnames == [exercise.sheet.name, "Условие"]
        filename = unquote(response["Content-Disposition"].split("filename*=utf-8''")[1])
        assert filename == exercise.sheet.file.removesuffix(".xlsx") + suffix


def test_task_file_has_empty_yellow_answer_cells_and_solution_has_formulas(client):
    _, task = workbook(client, "final-grade", "task")
    _, solution = workbook(client, "final-grade", "solution")
    task_ws, solution_ws = task["Оценки"], solution["Оценки"]

    assert task_ws["L11"].value is None
    assert task_ws["L11"].fill.fgColor.rgb == ANSWER_FILL.fgColor.rgb
    # Формула протянута со сдвигом ссылок, $ сохранены
    assert solution_ws["L11"].value == "=$B$2*K11+$B$3*J11"
    assert solution_ws["J11"].value == "=SUM(B11:F11)/SUM(B$6:F$6)"
    assert solution_ws["L11"].number_format == "0.00%"
    assert solution_ws["B3"].value == "=1-B2"
    assert solution_ws["B3"].number_format == "0.00%"  # формат ячейки задания (процент) сохранился
    assert "Это решение" in solution["Условие"]["A2"].value


def test_info_sheet_has_plain_text_task():
    assert (
        plain_text("Формула <code>=C5/(B5/100)^2</code>.<br>Дальше &lt;b&gt;") == "Формула =C5/(B5/100)^2.\nДальше <b>"
    )


def test_solution_sheet_keeps_task_style():
    gini = next(e for e in EXERCISES if e.id == "gini-coefficient")
    cell = solution_sheet(gini).cells["B11"]

    assert (cell.f, cell.fmt, cell.style) == ("=SUM(D5:D9)/($B$2*SUM(B5:B9))", "number", "total")


def test_fill_source_must_be_a_formula():
    with pytest.raises(ValidationError, match="нет формулы C5"):
        ExerciseSet.model_validate(
            {
                "chapter": "ch01",
                "exercises": [
                    {
                        "id": "x",
                        "number": 1,
                        "title": "X",
                        "task": "t",
                        "explain": "e",
                        "sheet": {},
                        "solution": {"cells": {"C5": 1}, "fill": [{"source": "C5", "to": "C5:C9"}]},
                        "expect": {"C5": 1},
                    }
                ],
            }
        )


def test_exercises_of_unknown_chapter_are_rejected():
    registry = get_registry()
    exercise_set = ExerciseSet(chapter="ch99", exercises=list(EXERCISES))

    with pytest.raises(ContentError, match="главы «ch99» нет"):
        Registry(registry.course, [], [(Path("ch99.yaml"), exercise_set)])


def test_course_page_links_exercises_and_last_lesson_invites(client):
    course = client.get(reverse("catalog:course")).content.decode()
    assert 'href="/course/ch01/exercises/"' in course
    assert "6 заданий · файлы Excel" in course

    last = client.get(reverse("catalog:lesson", args=["coffee-price-cost"])).content.decode()
    first = client.get(reverse("catalog:lesson", args=["wages-weekly-salary"])).content.decode()
    assert 'data-testid="chapter-exercises"' in last
    assert 'data-testid="chapter-exercises"' not in first
