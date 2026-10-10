"""Теория к главам: загрузка content/theory/*.yaml, кадры окна Excel для картинок.

Кадр описан как мини-урок (лист + действия). manage.py theory_frames проигрывает его плеером и снимает окно
Excel в static/theory/<глава>/<кадр>-<ru|en>.png; рядом — frames.json с хэшем описания кадра, по нему
lessons_check находит кадры, которые не пересняли после правки YAML.
"""

import hashlib
import json
from pathlib import Path

from pydantic import ValidationError

from .loader import ContentError, _format_validation_error, _read_yaml
from .schema import Figure, Lesson, Theory

LOCALES = ("ru", "en")
FRAMES_DIR = Path("theory")  # внутри static/
MANIFEST = "frames.json"


def load_theory(content_dir: Path) -> list[tuple[Path, Theory]]:
    items: list[tuple[Path, Theory]] = []
    errors: list[str] = []
    for path in sorted((content_dir / "theory").glob("*.yaml")):
        try:
            theory = Theory.model_validate(_read_yaml(path))
            for figure in theory.figures:
                figure_lesson(theory.chapter, figure)  # адреса и действия — по правилам урока
            items.append((path, theory))
        except ValidationError as exc:
            errors.extend(_format_validation_error(path, exc))
        except ContentError as exc:
            errors.extend(exc.errors)
    if errors:
        raise ContentError(errors)
    return items


def figure_lesson(chapter: str, figure: Figure) -> Lesson:
    """Кадр как урок из одного шага: плеер выполняет действия, и на экране — нужное состояние листа."""
    return Lesson.model_validate(
        {
            "id": f"{chapter}-{figure.id}",
            "chapter": chapter,
            "order": 1,
            "title": figure.id,
            "sheet": figure.sheet.model_dump(exclude_none=True),
            "sheets": [s.model_dump(exclude_none=True) for s in figure.sheets],
            "names": [n.model_dump(exclude_none=True) for n in figure.names],
            "expect": figure.expect,
            "steps": [
                {
                    "title": "Кадр",
                    "text": "Кадр для теории",
                    "actions": [a.model_dump() for a in figure.actions] or [{"wait": 0}],
                }
            ],
        }
    )


def figure_hash(figure: Figure) -> str:
    data = json.dumps(figure.model_dump(mode="json", exclude={"caption"}), ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(data.encode()).hexdigest()[:16]


def frame_path(chapter: str, figure_id: str, locale: str) -> str:
    """Путь кадра относительно static/ (для {% static %})."""
    return (FRAMES_DIR / chapter / f"{figure_id}-{locale}.png").as_posix()


def frame_errors(theory_sets: list[tuple[Path, Theory]], static_dir: Path) -> list[str]:
    """Кадры, которых нет или которые сняты со старого описания: нужно manage.py theory_frames."""
    manifest_path = static_dir / FRAMES_DIR / MANIFEST
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    errors = []
    for path, theory in theory_sets:
        for figure in theory.figures:
            key = f"{theory.chapter}/{figure.id}"
            missing = [loc for loc in LOCALES if not (static_dir / frame_path(theory.chapter, figure.id, loc)).exists()]
            if missing or manifest.get(key) != figure_hash(figure):
                errors.append(f"{path.name}: кадр {figure.id} не снят или устарел — manage.py theory_frames")
    return errors


def png_size(path: Path) -> tuple[int, int]:
    """Ширина и высота PNG из заголовка; (0, 0), если кадра нет."""
    try:
        with path.open("rb") as f:
            header = f.read(24)
    except FileNotFoundError:
        return 0, 0
    return int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")
