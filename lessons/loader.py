from pathlib import Path

import yaml
from pydantic import ValidationError

from .schema import Course, Lesson


class ContentError(Exception):
    """Ошибки в контенте курса; каждая строка начинается с имени файла."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("\n".join(errors))


def _format_validation_error(path: Path, exc: ValidationError) -> list[str]:
    lines = []
    for err in exc.errors():
        # Тег дискриминатора повторяет имя поля действия: steps.0.actions.1.fill.fill → ….fill
        parts = [str(p) for i, p in enumerate(err["loc"]) if i == 0 or p != err["loc"][i - 1]]
        msg = err["msg"].removeprefix("Value error, ")
        lines.append(f"{path.name}: {'.'.join(parts)}: {msg}")
    return lines


def _read_yaml(path: Path) -> object:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ContentError([f"{path.name}: некорректный YAML: {exc}"]) from exc


def load_course(content_dir: Path) -> Course:
    path = content_dir / "course.yaml"
    try:
        return Course.model_validate(_read_yaml(path))
    except ValidationError as exc:
        raise ContentError(_format_validation_error(path, exc)) from exc


def load_lessons(content_dir: Path) -> list[tuple[Path, Lesson]]:
    """Загружает все уроки и собирает ошибки по всем файлам сразу, а не до первой."""
    lessons: list[tuple[Path, Lesson]] = []
    errors: list[str] = []
    for path in sorted((content_dir / "lessons").glob("*.yaml")):
        try:
            lessons.append((path, Lesson.model_validate(_read_yaml(path))))
        except ValidationError as exc:
            errors.extend(_format_validation_error(path, exc))
        except ContentError as exc:
            errors.extend(exc.errors)
    if errors:
        raise ContentError(errors)
    return lessons
