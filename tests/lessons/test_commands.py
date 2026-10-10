from io import StringIO
from pathlib import Path

import pytest
from django.core.management import CommandError, call_command

from lessons.management.commands.lessons_schema import DEFAULT_OUTPUT, render_schema

COURSE = "id: c\ntitle: Курс\nchapters:\n  - {id: ch01, number: 1, title: Глава}\n"

LESSON = """
id: wages
chapter: ch01
order: 1
title: Ведомость
sheet: {}
steps:
  - title: Первый
    text: t
    actions: [{click: A1}]
  - title: Второй
    text: t
    actions: [{click: A2}]
"""


@pytest.fixture
def content_dir(tmp_path: Path, settings):
    (tmp_path / "lessons").mkdir()
    (tmp_path / "course.yaml").write_text(COURSE, encoding="utf-8")
    settings.CONTENT_DIR = tmp_path
    return tmp_path


def run(*args) -> tuple[str, str]:
    out, err = StringIO(), StringIO()
    call_command(*args, stdout=out, stderr=err)
    return out.getvalue(), err.getvalue()


def test_lessons_check_reports_summary(content_dir):
    (content_dir / "lessons" / "01-01-wages.yaml").write_text(LESSON, encoding="utf-8")

    out, _ = run("lessons_check")

    assert "OK: уроков — 1, заданий — 0, теорий — 0, глав — 1" in out


def test_lessons_check_fails_with_file_names(content_dir):
    bad = LESSON.replace("click: A1", "click: a1")
    (content_dir / "lessons" / "bad.yaml").write_text(bad, encoding="utf-8")

    with pytest.raises(CommandError, match="Ошибок: 1"):
        call_command("lessons_check", stdout=StringIO(), stderr=(err := StringIO()))
    assert "bad.yaml: steps.0.actions.0.click" in err.getvalue()


def test_lessons_check_requires_table_from_a1(content_dir):
    shifted = LESSON.replace("click: A1", "click: C3").replace("click: A2", "click: D4")
    (content_dir / "lessons" / "01-01-wages.yaml").write_text(shifted, encoding="utf-8")

    with pytest.raises(CommandError, match="Ошибок: 1"):
        call_command("lessons_check", stdout=StringIO(), stderr=(err := StringIO()))
    assert "01-01-wages.yaml: таблица начинается с C3, а не с A1" in err.getvalue()


def test_lessons_check_passes_on_real_content():
    out, _ = run("lessons_check")

    assert "OK:" in out


def test_lessons_schema_writes_and_checks(tmp_path: Path):
    output = tmp_path / "lesson.schema.json"

    run("lessons_schema", "--output", str(output))
    assert output.read_text(encoding="utf-8") == render_schema()
    run("lessons_schema", "--output", str(output), "--check")

    output.write_text("{}", encoding="utf-8")
    with pytest.raises(CommandError, match="устарел"):
        run("lessons_schema", "--output", str(output), "--check")


def test_committed_schema_is_up_to_date():
    """Если упал — схема в Python поменялась: перегенерируйте JSON Schema и TS-типы."""
    assert DEFAULT_OUTPUT.read_text(encoding="utf-8") == render_schema()
