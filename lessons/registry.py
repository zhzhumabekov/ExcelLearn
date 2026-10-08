from dataclasses import dataclass
from functools import cache
from pathlib import Path

from django.conf import settings

from .loader import ContentError, load_course, load_lessons
from .schema import Chapter, Course, Lesson


@dataclass(frozen=True)
class ChapterEntry:
    chapter: Chapter
    lessons: tuple[Lesson, ...]


class Registry:
    """Курс, главы и уроки в порядке книги. Строится один раз и не меняется."""

    def __init__(self, course: Course, lessons: list[tuple[Path, Lesson]]):
        self.course = course
        self._check(course, lessons)

        by_chapter: dict[str, list[Lesson]] = {c.id: [] for c in course.chapters}
        for _, lesson in lessons:
            by_chapter[lesson.chapter].append(lesson)

        chapters = sorted(course.chapters, key=lambda c: c.number)
        self.chapters = tuple(
            ChapterEntry(c, tuple(sorted(by_chapter[c.id], key=lambda lesson: lesson.order))) for c in chapters
        )
        self.lessons = tuple(lesson for entry in self.chapters for lesson in entry.lessons)
        self._index = {lesson.id: i for i, lesson in enumerate(self.lessons)}

    @staticmethod
    def _check(course: Course, lessons: list[tuple[Path, Lesson]]) -> None:
        errors = []
        chapter_ids = {c.id for c in course.chapters}
        seen_ids: dict[str, Path] = {}
        seen_order: dict[tuple[str, int], Path] = {}
        for path, lesson in lessons:
            if lesson.chapter not in chapter_ids:
                errors.append(f"{path.name}: chapter: главы «{lesson.chapter}» нет в course.yaml")
            if lesson.id in seen_ids:
                errors.append(f"{path.name}: id: «{lesson.id}» уже используется в {seen_ids[lesson.id].name}")
            seen_ids.setdefault(lesson.id, path)
            key = (lesson.chapter, lesson.order)
            if key in seen_order:
                errors.append(
                    f"{path.name}: order: {lesson.order} уже занят в главе {lesson.chapter} ({seen_order[key].name})"
                )
            seen_order.setdefault(key, path)
        if errors:
            raise ContentError(errors)

    def get(self, lesson_id: str) -> Lesson | None:
        index = self._index.get(lesson_id)
        return None if index is None else self.lessons[index]

    def neighbors(self, lesson_id: str) -> tuple[Lesson | None, Lesson | None]:
        """Предыдущий и следующий урок по всему курсу, через границы глав."""
        index = self._index[lesson_id]
        prev = self.lessons[index - 1] if index > 0 else None
        next_ = self.lessons[index + 1] if index + 1 < len(self.lessons) else None
        return prev, next_


def build_registry(content_dir: Path) -> Registry:
    return Registry(load_course(content_dir), load_lessons(content_dir))


@cache
def get_registry() -> Registry:
    return build_registry(Path(settings.CONTENT_DIR))
