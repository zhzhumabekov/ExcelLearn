from dataclasses import dataclass
from functools import cache
from pathlib import Path

from django.conf import settings

from .exercises import load_exercises
from .loader import ContentError, load_course, load_lessons
from .schema import Chapter, Course, Exercise, ExerciseSet, Lesson, Theory
from .theory import load_theory


@dataclass(frozen=True)
class ChapterEntry:
    chapter: Chapter
    lessons: tuple[Lesson, ...]


class Registry:
    """Курс, главы и уроки в порядке книги. Строится один раз и не меняется."""

    def __init__(
        self,
        course: Course,
        lessons: list[tuple[Path, Lesson]],
        exercise_sets: list[tuple[Path, ExerciseSet]] = (),  # type: ignore[assignment]
        theory_sets: list[tuple[Path, Theory]] = (),  # type: ignore[assignment]
    ):
        self.course = course
        self._check(course, lessons)
        self._check_exercises(course, exercise_sets)
        self._check_theory(course, theory_sets)
        # Теория к главе: читают перед уроками
        self.theory: dict[str, Theory] = {t.chapter: t for _, t in theory_sets}
        # Задания по главам, по номеру
        self.exercises: dict[str, tuple[Exercise, ...]] = {
            s.chapter: tuple(sorted(s.exercises, key=lambda e: e.number)) for _, s in exercise_sets
        }

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

    @staticmethod
    def _check_exercises(course: Course, exercise_sets) -> None:
        errors = []
        chapter_ids = {c.id for c in course.chapters}
        seen: dict[str, Path] = {}
        for path, exercise_set in exercise_sets:
            if exercise_set.chapter not in chapter_ids:
                errors.append(f"{path.name}: chapter: главы «{exercise_set.chapter}» нет в course.yaml")
            if exercise_set.chapter in seen:
                errors.append(
                    f"{path.name}: задания главы {exercise_set.chapter} уже в {seen[exercise_set.chapter].name}"
                )
            seen.setdefault(exercise_set.chapter, path)
        if errors:
            raise ContentError(errors)

    @staticmethod
    def _check_theory(course: Course, theory_sets) -> None:
        errors = []
        chapter_ids = {c.id for c in course.chapters}
        seen: dict[str, Path] = {}
        for path, theory in theory_sets:
            if theory.chapter not in chapter_ids:
                errors.append(f"{path.name}: chapter: главы «{theory.chapter}» нет в course.yaml")
            if theory.chapter in seen:
                errors.append(f"{path.name}: теория главы {theory.chapter} уже в {seen[theory.chapter].name}")
            seen.setdefault(theory.chapter, path)
        if errors:
            raise ContentError(errors)

    def chapter(self, chapter_id: str) -> Chapter | None:
        return next((entry.chapter for entry in self.chapters if entry.chapter.id == chapter_id), None)

    def exercise(self, chapter_id: str, exercise_id: str) -> Exercise | None:
        return next((e for e in self.exercises.get(chapter_id, ()) if e.id == exercise_id), None)

    def get(self, lesson_id: str) -> Lesson | None:
        index = self._index.get(lesson_id)
        return None if index is None else self.lessons[index]

    def with_lessons(self, replaced: dict[str, Lesson]) -> "Registry":
        """Копия реестра, где часть уроков заменена (тот же id, порядок и шаги — меняются только тексты)."""
        if not replaced:
            return self
        copy = object.__new__(Registry)
        copy.__dict__.update(self.__dict__)
        copy.chapters = tuple(
            ChapterEntry(entry.chapter, tuple(replaced.get(lesson.id, lesson) for lesson in entry.lessons))
            for entry in self.chapters
        )
        copy.lessons = tuple(lesson for entry in copy.chapters for lesson in entry.lessons)
        return copy

    def neighbors(self, lesson_id: str) -> tuple[Lesson | None, Lesson | None]:
        """Предыдущий и следующий урок по всему курсу, через границы глав."""
        index = self._index[lesson_id]
        prev = self.lessons[index - 1] if index > 0 else None
        next_ = self.lessons[index + 1] if index + 1 < len(self.lessons) else None
        return prev, next_


def build_registry(content_dir: Path) -> Registry:
    return Registry(
        load_course(content_dir), load_lessons(content_dir), load_exercises(content_dir), load_theory(content_dir)
    )


@cache
def get_registry() -> Registry:
    return build_registry(Path(settings.CONTENT_DIR))
