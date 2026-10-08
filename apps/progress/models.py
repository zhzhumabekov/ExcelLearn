from django.conf import settings
from django.db import models


class LessonProgress(models.Model):
    """Где ученик остановился в уроке. Статус выводится из данных: нет записи — не начат,
    completed_at пусто — в процессе, иначе — пройден."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="progress")
    lesson_id = models.CharField("урок", max_length=100)  # стабильный id из YAML
    last_step = models.PositiveSmallIntegerField("последний шаг", default=0)  # с нуля
    completed_at = models.DateTimeField("пройден", null=True, blank=True)
    updated_at = models.DateTimeField("обновлён", auto_now=True)

    class Meta:
        verbose_name = "прогресс урока"
        verbose_name_plural = "прогресс уроков"
        constraints = [models.UniqueConstraint(fields=["user", "lesson_id"], name="uniq_user_lesson")]

    def __str__(self):
        return f"{self.user} — {self.lesson_id}"

    @property
    def completed(self) -> bool:
        return self.completed_at is not None
