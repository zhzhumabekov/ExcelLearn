"""Кнопка «Записать в YAML»: действующая правка из базы переносится в файл урока (и в text_edits.yaml генератора).

Работает на копии проекта с git (локально): на сервере файлы урока — часть Docker-образа, запись в них пропадёт
при деплое. Включается настройкой TEXTS_WRITE_YAML. Коммит — вручную, как у любой правки контента.
"""

import copy
import json
import re
from dataclasses import dataclass
from pathlib import Path

import yaml
from django.conf import settings

from lessons.registry import get_registry
from lessons.schema import Lesson

from .models import LessonText
from .services import ACTIVE, edit_status

DUMP = {"allow_unicode": True, "sort_keys": False, "width": 118}  # как dump() в scripts/content/gen_*.py
WIDTH = 118


class WriteError(Exception):
    pass


@dataclass
class Written:
    path: Path
    fields: list[str]
    generator: str | None


def text_edits_path() -> Path:
    return Path(settings.TEXT_EDITS_PATH)


def lesson_path(lesson_id: str) -> Path:
    for path in sorted((Path(settings.CONTENT_DIR) / "lessons").glob("*.yaml")):
        if re.search(rf"^id: {re.escape(lesson_id)}\s*$", path.read_text(encoding="utf-8"), re.M):
            return path
    raise WriteError(f"Не найден YAML урока {lesson_id}")


def generator_for(lesson: Lesson) -> str | None:
    """Генератор, который пересобирает этот YAML (тогда правку нужно сохранить и для него)."""
    scripts = Path(settings.BASE_DIR) / "scripts" / "content"
    name = "gen_intros.py" if lesson.order == 0 else f"gen_{lesson.chapter}.py"
    return name if (scripts / name).exists() else None


def _locate(data: dict, field: str) -> tuple[dict, str]:
    if field == "title":
        return data, "title"
    _, index, part = field.split(".")
    return data["steps"][int(index)], part


def _scalar_node(root: yaml.MappingNode, field: str) -> yaml.ScalarNode:
    def value(node: yaml.MappingNode, key: str):
        return next(v for k, v in node.value if k.value == key)

    if field == "title":
        return value(root, "title")
    _, index, part = field.split(".")
    return value(value(root, "steps").value[int(index)], part)


def _render_scalar(span: str, node: yaml.ScalarNode, text: str, column: int) -> str:
    """Новый текст в том же стиле, что был в файле: сложенный блок >- с переносом строк, иначе одной строкой."""
    tail = span[len(span.rstrip()) :]
    words = text.split(" ")
    if node.style == ">" and "\n" not in text and "" not in words:
        indent = re.match(r"[^\n]*\n( +)", span)
        pad = indent.group(1) if indent else " " * (column + 2)
        lines, line = [], ""
        for word in words:
            if line and len(pad) + len(line) + 1 + len(word) > WIDTH:
                lines.append(line)
                line = word
            else:
                line = f"{line} {word}" if line else word
        lines.append(line)
        header = span.split("\n", 1)[0]
        return header + "".join(f"\n{pad}{line}" for line in lines) + tail
    if node.style is None and _plain_ok(text):
        return text + tail
    return json.dumps(text, ensure_ascii=False) + tail


def _plain_ok(text: str) -> bool:
    """Можно ли записать без кавычек: «Копирование: Ctrl+C» — нельзя, «Формула =B2*C2» — можно."""
    try:
        return "\n" not in text and yaml.safe_load(f"k: {text}") == {"k": text}
    except yaml.YAMLError:
        return False


def _rewrite_in_place(source: str, changes: dict[str, str]) -> str:
    """Меняет только нужные значения в тексте файла — комментарии и оформление ручного YAML остаются."""
    root = yaml.compose(source)
    spans = []
    for field, text in changes.items():
        node = _scalar_node(root, field)
        start, end = node.start_mark.index, node.end_mark.index
        spans.append((start, end, _render_scalar(source[start:end], node, text, node.start_mark.column)))
    for start, end, new in sorted(spans, reverse=True):
        source = source[:start] + new + source[end:]
    return source


def _rewrite(source: str, changes: dict[str, str]) -> str:
    data = yaml.safe_load(source)
    expected = copy.deepcopy(data)
    for field, text in changes.items():
        place, key = _locate(expected, field)
        place[key] = text

    # Файл генератора — ровно yaml.safe_dump (после строк-комментариев): пересобираем так же, как генератор
    header = re.match(r"(?:#[^\n]*\n)*", source).group(0)
    if yaml.safe_dump(data, **DUMP) == source[len(header) :]:
        result = header + yaml.safe_dump(expected, **DUMP)
    else:
        result = _rewrite_in_place(source, changes)

    if yaml.safe_load(result) != expected:
        raise WriteError("после записи YAML читается не так, как ожидалось — файл не изменён")
    Lesson.model_validate(expected)
    return result


def _record_for_generator(lesson_id: str, edits: list[LessonText]) -> None:
    path = text_edits_path()
    data = (yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else None) or {}
    fields = data.setdefault(lesson_id, {})
    for edit in edits:
        # original — то, что выдаёт генератор; если правку этого поля уже переносили, он остаётся прежним
        original = fields.get(edit.field, {}).get("original", edit.original)
        fields[edit.field] = {"original": original, "text": edit.text}
    path.write_text(
        "# Правки текстов из админки для уроков, которые собирают генераторы (см. text_edits.py).\n"
        + yaml.safe_dump(data, **DUMP),
        encoding="utf-8",
        newline="\n",
    )


def write_to_yaml(lesson_id: str) -> Written | None:
    """Записывает действующие правки урока в его YAML и удаляет их из базы. None — записывать нечего."""
    lesson = get_registry().get(lesson_id)
    if lesson is None:
        raise WriteError(f"Нет урока {lesson_id}")
    edits = [e for e in LessonText.objects.filter(lesson_id=lesson_id) if edit_status(e, lesson) == ACTIVE]
    if not edits:
        return None
    path = lesson_path(lesson_id)
    source = path.read_text(encoding="utf-8")
    result = _rewrite(source, {e.field: e.text for e in edits})

    generator = generator_for(lesson)
    if generator:
        _record_for_generator(lesson_id, edits)
    path.write_text(result, encoding="utf-8", newline="\n")
    LessonText.objects.filter(pk__in=[e.pk for e in edits]).delete()
    get_registry.cache_clear()  # YAML изменился: этот процесс перечитает уроки
    return Written(path, [e.field for e in edits], generator)
