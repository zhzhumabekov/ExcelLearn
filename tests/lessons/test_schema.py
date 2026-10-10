from pathlib import Path
from textwrap import dedent

import pytest
from pydantic import ValidationError

from lessons.loader import ContentError
from lessons.registry import build_registry
from lessons.schema import Fill, Keys, Lesson, Step

COURSE = """
id: test-course
title: Тестовый курс
chapters:
  - {id: ch00, number: 0, title: Введение}
  - {id: ch01, number: 1, title: Глава 1}
"""


def lesson_yaml(lesson_id="wages", chapter="ch01", order=1, actions="- click: E4"):
    return dedent(f"""
        id: {lesson_id}
        chapter: {chapter}
        order: {order}
        title: Платёжная ведомость
        sheet:
          file: Wagestemp.xlsx
          columns: {{B: 140, C: 80}}
          cells:
            B3: {{v: Employee, style: head}}
            C4: 49
            D4: {{v: 10, fmt: usd}}
        expect:
          E4: 490
        steps:
          - title: Формула
            text: Выделите <code>E4</code>
            actions:
    """) + "\n".join(f"      {line}" for line in dedent(actions).strip().splitlines())


@pytest.fixture
def content(tmp_path: Path):
    (tmp_path / "lessons").mkdir()
    (tmp_path / "course.yaml").write_text(COURSE, encoding="utf-8")

    def write(name: str, text: str) -> Path:
        path = tmp_path / "lessons" / name
        path.write_text(text, encoding="utf-8")
        return path

    write.dir = tmp_path
    return write


def test_valid_lesson_loads_with_typed_actions(content):
    content(
        "01-01-wages.yaml",
        lesson_yaml(
            actions="""
            - click: E4
            - type: "="
            - clickRef: C4
            - dragRef: C4:C11
            - fill: E4:E11
            - keys: [Ctrl, C]
            - wait: 500
            """
        ),
    )

    registry = build_registry(content.dir)
    lesson = registry.get("wages")

    assert lesson.sheet.cells["D4"].fmt == "usd"
    assert lesson.expect == {"E4": 490}
    kinds = [type(a).__name__ for a in lesson.steps[0].actions]
    assert kinds == ["Click", "Type", "ClickRef", "DragRef", "Fill", "Keys", "Wait"]


@pytest.mark.parametrize(
    ("actions", "fragment"),
    [
        ("- click: e4", "click"),  # строчная буква
        ("- click: E0", "click"),  # строк с нулевым номером нет
        ("- dragRef: C4-C11", "dragRef"),
        ("- clik: E4", "действие — словарь с одним ключом"),
        ("- {click: E4, type: x}", "действие — словарь с одним ключом"),
        ("- keys: [Win]", "keys"),
        ("- fill: E4:F11", "только по строке или по столбцу"),
    ],
)
def test_invalid_actions_are_reported_with_file_name(content, actions, fragment):
    content("bad.yaml", lesson_yaml(actions=actions))

    with pytest.raises(ContentError) as exc:
        build_registry(content.dir)

    message = str(exc.value)
    assert message.startswith("bad.yaml: steps.0.actions.0")
    assert fragment in message


def test_error_location_is_readable(content):
    content("bad.yaml", lesson_yaml(actions="- fill: E4:F11"))

    with pytest.raises(ContentError) as exc:
        build_registry(content.dir)

    assert exc.value.errors == [
        "bad.yaml: steps.0.actions.0.fill: маркер заполнения тянется только по строке или по столбцу"
    ]


def test_unknown_field_is_an_error(content):
    content("typo.yaml", lesson_yaml() + "\ntitel: опечатка\n")

    with pytest.raises(ContentError, match=r"typo\.yaml: titel"):
        build_registry(content.dir)


def test_errors_from_all_files_are_collected(content):
    content("a.yaml", lesson_yaml(lesson_id="a", actions="- click: bad"))
    content("b.yaml", "id: [не закрыто")

    with pytest.raises(ContentError) as exc:
        build_registry(content.dir)

    assert len(exc.value.errors) == 2
    assert "некорректный YAML" in exc.value.errors[1]


def test_duplicate_lesson_id(content):
    content("01-01.yaml", lesson_yaml(lesson_id="same", order=1))
    content("01-02.yaml", lesson_yaml(lesson_id="same", order=2))

    with pytest.raises(ContentError, match="«same» уже используется в 01-01.yaml"):
        build_registry(content.dir)


def test_unknown_chapter(content):
    content("x.yaml", lesson_yaml(chapter="ch99"))

    with pytest.raises(ContentError, match="главы «ch99» нет в course.yaml"):
        build_registry(content.dir)


def test_duplicate_order_within_chapter(content):
    content("a.yaml", lesson_yaml(lesson_id="a", order=1))
    content("b.yaml", lesson_yaml(lesson_id="b", order=1))

    with pytest.raises(ContentError, match="order: 1 уже занят в главе ch01"):
        build_registry(content.dir)


def test_lessons_are_ordered_by_chapter_then_order_with_neighbors(content):
    content("z.yaml", lesson_yaml(lesson_id="ch1-second", chapter="ch01", order=2))
    content("y.yaml", lesson_yaml(lesson_id="ch1-first", chapter="ch01", order=1))
    content("x.yaml", lesson_yaml(lesson_id="intro", chapter="ch00", order=1))

    registry = build_registry(content.dir)

    assert [lesson.id for lesson in registry.lessons] == ["intro", "ch1-first", "ch1-second"]
    assert [len(entry.lessons) for entry in registry.chapters] == [1, 2]
    prev, next_ = registry.neighbors("ch1-first")
    assert (prev.id, next_.id) == ("intro", "ch1-second")
    assert registry.neighbors("intro")[0] is None
    assert registry.neighbors("ch1-second")[1] is None
    assert registry.get("missing") is None


def test_chapter_intro_lesson_has_order_zero_and_comes_first(content):
    content("y.yaml", lesson_yaml(lesson_id="ch1-first", chapter="ch01", order=1))
    content("x.yaml", lesson_yaml(lesson_id="ch1-intro", chapter="ch01", order=0))

    assert [lesson.id for lesson in build_registry(content.dir).lessons] == ["ch1-intro", "ch1-first"]


def test_negative_order_is_rejected(content):
    content("x.yaml", lesson_yaml(order=-1))

    with pytest.raises(ContentError, match="order"):
        build_registry(content.dir)


def test_duplicate_chapter_ids_in_course(content):
    (content.dir / "course.yaml").write_text(
        COURSE + "  - {id: ch01, number: 2, title: Дубль}\n",
        encoding="utf-8",
    )

    with pytest.raises(ContentError, match="повторяются id глав: ch01"):
        build_registry(content.dir)


def test_models_are_immutable():
    with pytest.raises(ValidationError):
        Keys(keys=["Enter"]).keys = ["Tab"]


def test_fill_accepts_row_and_column():
    assert Fill(fill="E4:E11").fill == "E4:E11"
    assert Fill(fill="B6:E6").fill == "B6:E6"


def test_json_schema_is_generated():
    schema = Lesson.model_json_schema()

    assert schema["title"] == "Lesson"
    assert "Click" in schema["$defs"]


@pytest.mark.parametrize(
    "text",
    ["Функция {fn:SUM}", "Формула <code>{f:=SUM(B2:D2)}</code>", "{fn:FORMULATEXT} и {fn:AVERAGE}"],
)
def test_text_placeholders_are_allowed(text):
    Step(title="t", text=text, actions=[{"click": "A1"}])


@pytest.mark.parametrize(
    ("field", "value", "fragment"),
    [
        ("text", "{SUM}", "только плейсхолдеры"),
        ("text", "{fn:sum}", "только плейсхолдеры"),
        ("text", "незакрытая {fn:SUM", "только плейсхолдеры"),
        ("title", "{f:SUM}", "только плейсхолдеры"),
    ],
)
def test_bad_placeholders_are_rejected(field, value, fragment):
    fields = {"title": "t", "text": "ok", "actions": [{"click": "A1"}], field: value}

    with pytest.raises(ValidationError, match=fragment):
        Step(**fields)


def test_layout_origin_counts_cells_expect_and_actions():
    from lessons.layout import exercise_origin, lesson_origin
    from lessons.schema import Exercise, Lesson

    lesson = Lesson.model_validate(
        {
            "id": "x",
            "chapter": "ch01",
            "order": 1,
            "title": "t",
            "sheet": {"cells": {"C3": 1}},
            "expect": {"D5": 1},
            "steps": [{"title": "t", "text": "t", "actions": [{"selectColumn": "B"}, {"selectRow": 2}]}],
        }
    )
    assert lesson_origin(lesson) == "B2"

    exercise = Exercise.model_validate(
        {
            "id": "e",
            "number": 1,
            "title": "t",
            "task": "t",
            "explain": "t",
            "sheet": {"cells": {"B2": 1}},
            "solution": {"cells": {"A4": {"f": "=B2"}}},
            "expect": {"A4": 1},
        }
    )
    assert exercise_origin(exercise) == "A2"
