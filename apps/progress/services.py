from django.utils import timezone

from .models import LessonProgress


def record_progress(user, lesson_id: str, step: int, completed: bool, step_count: int) -> LessonProgress:
    """Сохранить, где ученик в уроке. Шаг ограничивается уроком; пройденный урок остаётся пройденным,
    а его последний шаг не уменьшается при пересмотре."""
    step = max(0, min(step, step_count - 1))
    progress, _ = LessonProgress.objects.get_or_create(user=user, lesson_id=lesson_id)
    if completed and progress.completed_at is None:
        progress.completed_at = timezone.now()
    progress.last_step = max(progress.last_step, step) if progress.completed else step
    progress.save()
    return progress


def merge_guest_progress(user, guest: dict, step_counts: dict[str, int]) -> int:
    """Перенести прогресс гостя (из браузера) в аккаунт: по каждому уроку — лучшее из двух
    (дальний шаг, «пройден», если пройден где-то). Неизвестные уроки пропускаются. → сколько уроков перенесено."""
    merged = 0
    for lesson_id, item in guest.items():
        if lesson_id not in step_counts or not isinstance(item, dict):
            continue
        step, completed = item.get("step", 0), item.get("completed", False)
        if not isinstance(step, int) or isinstance(step, bool) or not isinstance(completed, bool):
            continue
        step = max(0, min(step, step_counts[lesson_id] - 1))
        progress, _ = LessonProgress.objects.get_or_create(user=user, lesson_id=lesson_id)
        if completed and progress.completed_at is None:
            progress.completed_at = timezone.now()
        progress.last_step = max(progress.last_step, step)
        progress.save()
        merged += 1
    return merged


def progress_by_lesson(user) -> dict[str, LessonProgress]:
    if not user.is_authenticated:
        return {}
    return {p.lesson_id: p for p in LessonProgress.objects.filter(user=user)}


def start_step(user, lesson_id: str) -> int:
    """С какого шага открыть урок: последний шаг незавершённого урока, иначе с начала."""
    progress = progress_by_lesson(user).get(lesson_id)
    return progress.last_step if progress and not progress.completed else 0
