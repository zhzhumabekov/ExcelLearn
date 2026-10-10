"""Доступ к главам: первые главы открыты всем зарегистрированным, остальные — с полным доступом.

Полный доступ открывает администратор: галочка «полный доступ» у пользователя в админке.
Сотрудникам (is_staff) открыто всё.
"""

from lessons.schema import Chapter

# Бесплатно — главы с номером до этого включительно (0 — «Введение», 1–5 — первые пять глав)
FREE_CHAPTER_MAX = 5


def is_free(chapter: Chapter) -> bool:
    return chapter.number <= FREE_CHAPTER_MAX


def has_full_access(user) -> bool:
    return user.is_authenticated and (user.is_staff or getattr(user, "full_access", False))


def can_open(user, chapter: Chapter) -> bool:
    return is_free(chapter) or has_full_access(user)
