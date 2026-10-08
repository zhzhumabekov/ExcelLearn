from .models import Preferences

# Поля, которые можно менять из браузера (страница настроек, переключатель темы, перенос от гостя)
FIELDS = ["speed", "function_locale", "narration_on", "narration_volume", "autoplay_next", "theme"]


def get_preferences(user) -> Preferences:
    """Настройки пользователя; у гостя и у того, кто ничего не менял, — значения по умолчанию (не сохранены)."""
    if user.is_authenticated:
        try:
            return user.preferences
        except Preferences.DoesNotExist:
            return Preferences(user=user)
    return Preferences()


def has_saved_preferences(user) -> bool:
    return Preferences.objects.filter(user=user).exists()
