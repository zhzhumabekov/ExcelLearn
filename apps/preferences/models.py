from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models

# Значения с одним знаком после запятой — как их возвращает база (decimal_places=1), иначе форма не узнает выбор
SPEED_CHOICES = [(Decimal("0.5"), "0,5×"), (Decimal("1.0"), "1×"), (Decimal("1.5"), "1,5×"), (Decimal("2.0"), "2×")]
LOCALE_CHOICES = [("ru", "Русский Excel"), ("en", "Английский Excel")]
THEME_CHOICES = [("system", "Как в системе"), ("light", "Светлая"), ("dark", "Тёмная")]


class Preferences(models.Model):
    """Настройки ученика. Пока пользователь ничего не менял, записи нет — действуют значения по умолчанию."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="preferences")
    speed = models.DecimalField(
        "скорость по умолчанию", max_digits=3, decimal_places=1, choices=SPEED_CHOICES, default=Decimal("1.0")
    )
    function_locale = models.CharField("язык функций", max_length=2, choices=LOCALE_CHOICES, default="ru")
    narration_on = models.BooleanField("озвучка", default=True)
    narration_volume = models.PositiveSmallIntegerField("громкость", default=80, validators=[MaxValueValidator(100)])
    autoplay_next = models.BooleanField("автопереход к следующему уроку", default=False)
    theme = models.CharField("тема", max_length=10, choices=THEME_CHOICES, default="system")
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
            "narrationOn": self.narration_on,
            "narrationVolume": self.narration_volume,
            "autoplayNext": self.autoplay_next,
        }
