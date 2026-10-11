from django.conf import settings
from django.db import models


class LessonText(models.Model):
    """Правка текста урока из админки поверх YAML. Действует, пока текст в YAML равен original:
    если генератор главы изменил текст (или сдвинул шаги), правка не применяется и помечается в админке."""

    lesson_id = models.CharField("урок", max_length=100)  # стабильный id из YAML
    field = models.CharField("поле", max_length=40)  # title | steps.<N>.title | steps.<N>.text, N с нуля
    original = models.TextField("текст в YAML")
    text = models.TextField("исправленный текст")
    updated_at = models.DateTimeField("изменён", auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="кто изменил"
    )

    class Meta:
        verbose_name = "правка текста урока"
        verbose_name_plural = "правки текстов уроков"
        ordering = ["lesson_id", "field"]
        constraints = [models.UniqueConstraint(fields=["lesson_id", "field"], name="uniq_lesson_text_field")]

    def __str__(self):
        return f"{self.lesson_id} — {self.field}"
