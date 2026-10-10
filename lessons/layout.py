"""Раскладка листа: таблица урока и задания начинается с A1 — без пустых строк сверху и столбцов слева.

Пустые поля делают окно Excel в плеере выше и шире, чем нужно (лишние строки и столбцы на экране).
Проверяет lessons_check; правило — в CLAUDE.md.
"""

from openpyxl.utils import column_index_from_string, get_column_letter

from .schema import (
    AddSelect,
    Click,
    ClickRef,
    DialogRange,
    DragRef,
    DragSelect,
    Exercise,
    Fill,
    HideColumns,
    Lesson,
    Select,
    SelectColumn,
    SelectRow,
    ShowRefs,
    split_range,
)


def _corner(addr: str) -> tuple[int, int]:
    """(строка, столбец) левого верхнего угла адреса: E4, B3:D9, Лист2!A1."""
    addr = addr.rsplit("!", 1)[-1]
    rows, cols = [], []
    for part in split_range(addr):
        letters = part.rstrip("0123456789")
        rows.append(int(part[len(letters) :]))
        cols.append(column_index_from_string(letters))
    return min(rows), min(cols)


def _lesson_addresses(lesson: Lesson) -> tuple[list[str], list[int], list[int]]:
    """Адреса ячеек, а также отдельно строки и столбцы (выделение целых строк и столбцов)."""
    addrs = [a for sheet in (lesson.sheet, *lesson.sheets) for a in sheet.cells]
    addrs += list(lesson.expect)
    rows: list[int] = []
    cols: list[int] = []
    for step in lesson.steps:
        for action in step.actions:
            match action:
                case Click(click=a) | ClickRef(clickRef=a) | ShowRefs(showRefs=a):
                    addrs.append(a)
                case Select(select=a) | DragRef(dragRef=a) | DragSelect(dragSelect=a) | Fill(fill=a):
                    addrs.append(a)
                case AddSelect(addSelect=a):
                    addrs.append(a)
                case DialogRange(dialogRange=spec):
                    addrs.append(spec.range)
                case SelectRow(selectRow=row):
                    rows.append(row)
                case SelectColumn(selectColumn=col):
                    cols.append(column_index_from_string(col))
                case HideColumns(hideColumns=span):
                    cols += [column_index_from_string(c) for c in span.split(":")]
    return addrs, rows, cols


def _origin(addrs: list[str], rows: list[int], cols: list[int]) -> str | None:
    corners = [_corner(a) for a in addrs]
    all_rows = [r for r, _ in corners] + rows
    all_cols = [c for _, c in corners] + cols
    if not all_rows or not all_cols:
        return None
    return f"{get_column_letter(min(all_cols))}{min(all_rows)}"


def lesson_origin(lesson: Lesson) -> str | None:
    """Левая верхняя используемая ячейка урока (по листам, expect и действиям); None — лист пуст."""
    return _origin(*_lesson_addresses(lesson))


def exercise_origin(exercise: Exercise) -> str | None:
    """Левая верхняя используемая ячейка задания (лист, решение, expect)."""
    addrs = [a for sheet in (exercise.sheet, *exercise.sheets) for a in sheet.cells]
    addrs += list(exercise.solution.cells) + list(exercise.expect)
    addrs += [item.to for item in exercise.solution.fill]
    return _origin(addrs, [], [])


def layout_errors(lessons, exercise_sets) -> list[str]:
    """Уроки и задания, таблица которых начинается не с A1."""
    errors = []
    for path, lesson in lessons:
        origin = lesson_origin(lesson)
        if origin not in (None, "A1"):
            errors.append(f"{path.name}: таблица начинается с {origin}, а не с A1 — сдвиньте лист к A1")
    for path, exercise_set in exercise_sets:
        for exercise in exercise_set.exercises:
            origin = exercise_origin(exercise)
            if origin not in (None, "A1"):
                errors.append(
                    f"{path.name}: задание {exercise.id}: таблица начинается с {origin}, а не с A1 — сдвиньте лист к A1"
                )
    return errors
