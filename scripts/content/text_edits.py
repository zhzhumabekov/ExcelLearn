"""Правки текстов из админки для уроков, которые собирают генераторы (кнопка «Записать в YAML»).

Админка пишет правку в YAML урока и сюда, в text_edits.yaml: иначе следующий запуск генератора её сотрёт.
Генератор вызывает apply_text_edits(lesson) перед записью YAML. Формат файла:

    <id урока>:
      <поле>:            # title | steps.<N>.title | steps.<N>.text, N с нуля
        original: <текст, который выдавал генератор>
        text: <исправленный текст>

Правка применяется, только если генератор выдаёт тот же original; если текст в генераторе изменили —
правка пропускается с предупреждением (шаги могли сдвинуться). Перенесли правку в сам генератор — удалите её отсюда.
"""

import sys
from pathlib import Path

import yaml

PATH = Path(__file__).with_name("text_edits.yaml")


def load_text_edits(path: Path = PATH) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _locate(lesson: dict, field: str) -> tuple[dict, str] | None:
    if field == "title":
        return lesson, "title"
    _, index, part = field.split(".")
    steps = lesson.get("steps", [])
    return (steps[int(index)], part) if int(index) < len(steps) else None


def apply_text_edits(lesson: dict, path: Path = PATH) -> dict:
    for field, edit in load_text_edits(path).get(lesson.get("id"), {}).items():
        place = _locate(lesson, field)
        current = place[0].get(place[1]) if place else None
        if current == edit["original"]:
            place[0][place[1]] = edit["text"]
        elif current != edit["text"]:
            print(
                f"text_edits.yaml: {lesson['id']} {field}: текст в генераторе изменился — правка не применена",
                file=sys.stderr,
            )
    return lesson
