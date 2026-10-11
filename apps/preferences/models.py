from decimal import Decimal

from django.conf import settings
from django.db import models

# Значения с одним знаком после запятой — как их возвращает база (decimal_places=1), иначе форма не узнает выбор
SPEED_CHOICES = [(Decimal("0.5"), "0,5×"), (Decimal("1.0"), "1×"), (Decimal("1.5"), "1,5×"), (Decimal("2.0"), "2×")]
LOCALE_CHOICES = [("ru", "Русский Excel"), ("en", "Английский Excel")]
PLAY_MODE_CHOICES = [("step", "Пошаговый просмотр"), ("auto", "Автоматическое воспроизведение")]


class Preferences(models.Model):
    """Настройки ученика. Пока пользователь ничего не менял, записи нет — действуют значения по умолчанию."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="preferences")
    speed = models.DecimalField(
        "скорость по умолчанию", max_digits=3, decimal_places=1, choices=SPEED_CHOICES, default=Decimal("1.0")
    )
    function_locale = models.CharField("язык функций", max_length=2, choices=LOCALE_CHOICES, default="ru")
    autoplay_next = models.BooleanField("автопереход к следующему уроку", default=False)
    play_mode = models.CharField("режим просмотра", max_length=4, choices=PLAY_MODE_CHOICES, default="step")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "настройки"
        verbose_name_plural = "настройки"

    def __str__(self):
        return f"Настройки {self.user}"

    def player_settings(self) -> dict:
        """То, что получает плеер (PlayerSettings в player/src/index.ts) и страница урока."""
        return {
            "speed": float(self.speed),
            "functionLocale": self.function_locale,
            "autoplayNext": self.autoplay_next,
            "playMode": self.play_mode,
        }
