"""Схема урока и курса — единственный источник истины для YAML, Python и (через JSON Schema) TS-плеера."""

import re
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Discriminator,
    Field,
    StringConstraints,
    Tag,
    field_validator,
    model_validator,
)

CELL_RE = r"[A-Z]{1,3}[1-9][0-9]*"

CellAddr = Annotated[str, StringConstraints(pattern=rf"^{CELL_RE}$")]
RangeAddr = Annotated[str, StringConstraints(pattern=rf"^{CELL_RE}(:{CELL_RE})?$")]
ColumnLetter = Annotated[str, StringConstraints(pattern=r"^[A-Z]{1,3}$")]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]

Scalar = str | int | float


class Model(BaseModel):
    # Опечатка в ключе YAML должна быть ошибкой, а не молча проигнорированным полем.
    model_config = ConfigDict(extra="forbid", frozen=True)


# ---------- Лист ----------


class CellSpec(Model):
    v: Scalar | None = None
    f: str | None = Field(default=None, pattern=r"^=", description="Формула, уже записанная в ячейке шаблона")
    fmt: Literal["general", "number", "usd", "kzt", "percent"] = "general"
    style: Literal["head", "label", "total"] | None = None


Cell = Scalar | CellSpec


class Sheet(Model):
    file: str | None = Field(default=None, description="Имя файла в окне Excel, например Wagestemp.xlsx")
    name: str = "Лист1"
    columns: dict[ColumnLetter, int] = Field(default_factory=dict, description="Ширина колонок в пикселях")
    rows: int | None = Field(default=None, ge=1, le=200, description="Сколько строк показывать")
    cells: dict[CellAddr, Cell] = Field(default_factory=dict)


# ---------- Действия ----------
# В YAML действие — словарь с одним ключом: `- click: E4`. Ключ и есть тип действия.


def split_range(addr: str) -> tuple[str, str]:
    start, _, end = addr.partition(":")
    return start, end or start


def _column(addr: str) -> str:
    return re.sub(r"[0-9]+", "", addr)


def _row(addr: str) -> int:
    return int(re.sub(r"[A-Z]+", "", addr))


class Click(Model):
    click: CellAddr


class Select(Model):
    select: RangeAddr


class Type(Model):
    type: str = Field(min_length=1)


class ClickRef(Model):
    clickRef: CellAddr  # camelCase: имя поля = ключ в YAML


class DragRef(Model):
    dragRef: RangeAddr


class DragSelect(Model):
    dragSelect: RangeAddr


class Fill(Model):
    fill: RangeAddr

    @field_validator("fill")
    @classmethod
    def must_be_one_dimensional(cls, value: str) -> str:
        start, end = split_range(value)
        if _column(start) != _column(end) and _row(start) != _row(end):
            raise ValueError("маркер заполнения тянется только по строке или по столбцу")
        return value


Key = Literal["Enter", "Escape", "Tab", "Delete", "F2", "F4", "Ctrl", "Alt", "Shift", "C", "V", "X", "Z", "="]


class Keys(Model):
    keys: list[Key] = Field(min_length=1)


class ShowRefs(Model):
    showRefs: CellAddr


class Wait(Model):
    wait: int = Field(ge=0, le=10_000, description="Пауза в миллисекундах")


class ClickRibbon(Model):
    """Щелчок по кнопке ленты: «Σ Автосумма» (на выделенный диапазон), «Копировать», «Вставить»."""

    clickRibbon: Literal["autosum", "copy", "paste"]


ACTION_MODELS: dict[str, type[Model]] = {
    "click": Click,
    "select": Select,
    "type": Type,
    "clickRef": ClickRef,
    "dragRef": DragRef,
    "dragSelect": DragSelect,
    "fill": Fill,
    "keys": Keys,
    "showRefs": ShowRefs,
    "wait": Wait,
    "clickRibbon": ClickRibbon,
}


def _action_kind(value: Any) -> str | None:
    if isinstance(value, dict) and len(value) == 1:
        return next(iter(value))
    if isinstance(value, BaseModel):
        return next(iter(type(value).model_fields))
    return None


Action = Annotated[
    Annotated[Click, Tag("click")]
    | Annotated[Select, Tag("select")]
    | Annotated[Type, Tag("type")]
    | Annotated[ClickRef, Tag("clickRef")]
    | Annotated[DragRef, Tag("dragRef")]
    | Annotated[DragSelect, Tag("dragSelect")]
    | Annotated[Fill, Tag("fill")]
    | Annotated[Keys, Tag("keys")]
    | Annotated[ShowRefs, Tag("showRefs")]
    | Annotated[Wait, Tag("wait")]
    | Annotated[ClickRibbon, Tag("clickRibbon")],
    Discriminator(
        _action_kind,
        custom_error_type="unknown_action",
        custom_error_message=f"действие — словарь с одним ключом из: {', '.join(ACTION_MODELS)}",
    ),
]


# ---------- Урок ----------


# {fn:SUM} → «СУММ» / «SUM»; {f:=SUM(B2:D2)} → формула с разделителями языка (только в text).
PLACEHOLDER_RE = re.compile(r"\{(fn:[A-Z][A-Z0-9.]*|f:=[^{}]+)\}")


def _check_placeholders(value: str, allow_formula: bool) -> str:
    rest = PLACEHOLDER_RE.sub("", value)
    if "{" in rest or "}" in rest:
        raise ValueError("фигурные скобки — только плейсхолдеры {fn:SUM} и {f:=SUM(A1:A3)}")
    if not allow_formula and "{f:" in value:
        raise ValueError("{f:…} нельзя в say: диктору нужны слова, а не формула")
    return value


class Step(Model):
    title: str = Field(min_length=1, description="Заголовок шага; плейсхолдеры как в text")
    text: str = Field(
        min_length=1,
        description="Пояснение на экране; разрешены <b>, <code>, <kbd>, плейсхолдеры {fn:SUM} и {f:=SUM(A1:A3)}",
    )
    say: str | None = Field(default=None, description="Текст для диктора; {fn:SUM} подставляется по языку")
    actions: list[Action] = Field(min_length=1)

    @field_validator("title", "text")
    @classmethod
    def text_placeholders(cls, value: str) -> str:
        return _check_placeholders(value, allow_formula=True)

    @field_validator("say")
    @classmethod
    def say_placeholders(cls, value: str | None) -> str | None:
        return value if value is None else _check_placeholders(value, allow_formula=False)


class Lesson(Model):
    id: Slug = Field(description="Стабильный id: хранится в БД прогресса, не переименовывать")
    chapter: Slug
    order: int = Field(ge=1, description="Порядок внутри главы")
    title: str = Field(min_length=1)
    source: str | None = Field(default=None, description="Откуда сценарий, например «Рис. 1.1»")
    sheet: Sheet
    expect: dict[CellAddr, Scalar] = Field(default_factory=dict, description="Значения из исходника для сверки")
    steps: list[Step] = Field(min_length=1)


# ---------- Задания к главе ----------
# Ученик решает их сам в своём Excel: на сайте — условие и объяснение, к скачиванию — файл задания
# (лист без ответов) и файл решения (тот же лист с формулами).


class SolutionFill(Model):
    """Протянуть формулу ячейки source на диапазон to — ссылки сдвигаются, как маркером заполнения."""

    source: CellAddr
    to: RangeAddr


class Solution(Model):
    cells: dict[CellAddr, Cell] = Field(default_factory=dict, description="Формулы ответа (и их форматы)")
    fill: list[SolutionFill] = Field(default_factory=list)

    @model_validator(mode="after")
    def fill_sources_are_formulas(self) -> "Solution":
        for item in self.fill:
            cell = self.cells.get(item.source)
            if not (isinstance(cell, CellSpec) and cell.f):
                raise ValueError(f"fill: в solution.cells нет формулы {item.source}")
        return self


class Exercise(Model):
    id: Slug
    number: int = Field(ge=1)
    title: str = Field(min_length=1)
    task: str = Field(min_length=1, description="Условие (HTML: <b>, <code>, <i>, <br>)")
    explain: str = Field(min_length=1, description="Как решать: нужный навык, подсказки")
    mistake: str | None = Field(default=None, description="Частая ошибка")
    sheet: Sheet
    solution: Solution
    expect: dict[CellAddr, Scalar] = Field(min_length=1, description="Ответы для сверки решения")


class ExerciseSet(Model):
    chapter: Slug
    exercises: list[Exercise] = Field(min_length=1)

    @field_validator("exercises")
    @classmethod
    def ids_and_numbers_are_unique(cls, exercises: list[Exercise]) -> list[Exercise]:
        for attr in ("id", "number"):
            values = [getattr(e, attr) for e in exercises]
            duplicates = sorted({str(v) for v in values if values.count(v) > 1})
            if duplicates:
                raise ValueError(f"повторяются {attr} заданий: {', '.join(duplicates)}")
        return exercises


# ---------- Курс ----------


class Chapter(Model):
    id: Slug
    number: int = Field(ge=0)
    title: str = Field(min_length=1)


class Course(Model):
    id: Slug
    title: str = Field(min_length=1)
    source: str | None = None
    chapters: list[Chapter] = Field(min_length=1)

    @field_validator("chapters")
    @classmethod
    def chapter_ids_are_unique(cls, chapters: list[Chapter]) -> list[Chapter]:
        ids = [c.id for c in chapters]
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        if duplicates:
            raise ValueError(f"повторяются id глав: {', '.join(duplicates)}")
        return chapters
