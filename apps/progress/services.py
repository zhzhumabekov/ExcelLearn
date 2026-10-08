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
