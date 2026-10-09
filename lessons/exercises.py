"""Задания к главам: загрузка content/exercises/*.yaml и лист решения для файла «…_решение.xlsx».

Лист решения = лист задания + формулы ответа, протянутые по fill. Сдвиг ссылок делает Translator из openpyxl —
тот же, что пишет формулы в файл, поэтому сверка (exercises_dump → pnpm exercises:verify) проверяет ровно то,
что скачает ученик.
"""

from pathlib import Path

from openpyxl.formula.translate import Translator
from openpyxl.utils import range_boundaries
from openpyxl.utils.cell import get_column_letter
from pydantic import ValidationError

from .loader import ContentError, _format_validation_error, _read_yaml
from .schema import CellSpec, Exercise, ExerciseSet, Sheet


def load_exercises(content_dir: Path) -> list[tuple[Path, ExerciseSet]]:
    sets: list[tuple[Path, ExerciseSet]] = []
    errors: list[str] = []
    for path in sorted((content_dir / "exercises").glob("*.yaml")):
        try:
            sets.append((path, ExerciseSet.model_validate(_read_yaml(path))))
        except ValidationError as exc:
            errors.extend(_format_validation_error(path, exc))
        except ContentError as exc:
            errors.extend(exc.errors)
    if errors:
        raise ContentError(errors)
    return sets


def _cells_in(range_addr: str) -> list[str]:
    min_col, min_row, max_col, max_row = range_boundaries(range_addr)
    return [f"{get_column_letter(c)}{r}" for r in range(min_row, max_row + 1) for c in range(min_col, max_col + 1)]


def solution_cells(exercise: Exercise) -> dict[str, CellSpec]:
    """Все ячейки ответа: формулы из solution.cells и их копии по fill (со сдвигом ссылок и тем же форматом)."""
    cells = {addr: _as_spec(cell) for addr, cell in exercise.solution.cells.items()}
    for item in exercise.solution.fill:
        source = cells[item.source]
        assert source.f is not None  # проверено схемой
        for addr in _cells_in(item.to):
            if addr != item.source:
                formula = Translator(source.f, origin=item.source).translate_formula(addr)
                cells[addr] = source.model_copy(update={"f": formula})
    return cells


def _as_spec(cell: object) -> CellSpec:
    return cell if isinstance(cell, CellSpec) else CellSpec(v=cell)  # type: ignore[arg-type]


def solution_sheet(exercise: Exercise) -> Sheet:
    """Лист задания с ответами. Формат и стиль ячейки задания сохраняются, если ответ их не задаёт."""
    merged: dict[str, CellSpec | object] = dict(exercise.sheet.cells)
    for addr, answer in solution_cells(exercise).items():
        base = _as_spec(merged[addr]) if addr in merged else CellSpec()
        own = {name: getattr(answer, name) for name in answer.model_fields_set if name != "f"}
        merged[addr] = base.model_copy(update={**own, "f": answer.f, "v": None})
    return exercise.sheet.model_copy(update={"cells": merged})


def answer_addresses(exercise: Exercise) -> set[str]:
    """Ячейки, которые заполняет ученик, — в файлах они подсвечены."""
    return set(solution_cells(exercise))
