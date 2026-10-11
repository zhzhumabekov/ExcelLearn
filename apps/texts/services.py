"""Правки текстов уроков из админки поверх YAML: заголовок урока, заголовки и тексты шагов."""

from html.parser import HTMLParser

from django.core.exceptions import ValidationError
from django.db.models import Count, Max

from lessons.placeholders import PLACEHOLDER_RE
from lessons.registry import Registry, get_registry
from lessons.schema import Lesson, _check_placeholders

from .models import LessonText

# Теги, которые встречаются в текстах уроков; остальное плеер всё равно вырежет (sanitize.ts)
ALLOWED_TAGS = {"b", "i", "code", "kbd", "br"}
VOID_TAGS = {"br"}

ACTIVE = "действует"
IN_YAML = "уже в YAML"
STALE = "устарела"


def lesson_texts(lesson: Lesson) -> dict[str, str]:
    """Тексты урока по полям в порядке показа: title, steps.0.title, steps.0.text, …"""
    texts = {"title": lesson.title}
    for i, step in enumerate(lesson.steps):
        texts[f"steps.{i}.title"] = step.title
        texts[f"steps.{i}.text"] = step.text
    return texts


def field_label(field: str) -> str:
    if field == "title":
        return "Название урока"
    _, index, part = field.split(".")
    return f"Шаг {int(index) + 1} — {'заголовок' if part == 'title' else 'текст'}"


def edit_status(edit: LessonText, lesson: Lesson | None) -> str:
    current = lesson_texts(lesson).get(edit.field) if lesson else None
    if current == edit.text:
        return IN_YAML
    if current == edit.original:
        return ACTIVE
    return STALE


def apply_edits(lesson: Lesson, edits: list[LessonText]) -> Lesson:
    """Урок с действующими правками; правка, чей original разошёлся с YAML, пропускается."""
    current = lesson_texts(lesson)
    active = {e.field: e.text for e in edits if current.get(e.field) == e.original}
    if not active:
        return lesson
    steps = [
        step.model_copy(
            update={part: active[key] for part in ("title", "text") if (key := f"steps.{i}.{part}") in active}
        )
        for i, step in enumerate(lesson.steps)
    ]
    update: dict = {"steps": steps}
    if "title" in active:
        update["title"] = active["title"]
    return lesson.model_copy(update=update)


# Реестр с правками в каждом процессе Gunicorn; пересобирается, когда в базе меняются правки
_site: dict = {}


def get_site_registry() -> Registry:
    """Реестр для страниц сайта: YAML + действующие правки из админки."""
    base = get_registry()
    stamp = LessonText.objects.aggregate(count=Count("id"), last=Max("updated_at"))
    key = (stamp["count"], stamp["last"])
    if _site.get("base") is not base or _site.get("key") != key:  # YAML перечитан или правки изменились
        by_lesson: dict[str, list[LessonText]] = {}
        for edit in LessonText.objects.all():
            by_lesson.setdefault(edit.lesson_id, []).append(edit)
        replaced = {
            lesson_id: apply_edits(lesson, edits)
            for lesson_id, edits in by_lesson.items()
            if (lesson := base.get(lesson_id)) is not None
        }
        _site.update(base=base, key=key, registry=base.with_lessons(replaced))
    return _site["registry"]


class _TagChecker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.errors: list[str] = []
        self.stack: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in ALLOWED_TAGS:
            self.errors.append(f"тег <{tag}> не разрешён")
        elif attrs:
            self.errors.append(f"у тега <{tag}> не должно быть атрибутов")
        elif tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f"лишний или не на месте </{tag}>")
        else:
            self.stack.pop()


def validate_text(value: str) -> None:
    """Те же правила, что у YAML урока: не пусто, фигурные скобки — только плейсхолдеры, теги — b, i, code, kbd, br."""
    if not value.strip():
        raise ValidationError("Текст не может быть пустым")
    errors = []
    try:
        _check_placeholders(value)
    except ValueError as exc:
        errors.append(str(exc))
    checker = _TagChecker()
    checker.feed(PLACEHOLDER_RE.sub("", value))  # «<» в формуле {f:=ЕСЛИ(A2<B2;…)} — не тег
    checker.close()
    errors += checker.errors
    errors += [f"не закрыт тег <{tag}>" for tag in checker.stack]
    if errors:
        raise ValidationError(errors)
