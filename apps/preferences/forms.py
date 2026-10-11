from decimal import Decimal, InvalidOperation

from django import forms

from .models import Preferences
from .services import FIELDS


class PreferencesForm(forms.ModelForm):
    class Meta:
        model = Preferences
        fields = FIELDS
        widgets = {
            "speed": forms.RadioSelect,
            "function_locale": forms.RadioSelect,
            "play_mode": forms.RadioSelect,
        }


def partial_form(instance: Preferences, data: dict) -> PreferencesForm:
    """Форма для частичного обновления (например, только язык функций): остальные поля — текущие."""
    current = {name: getattr(instance, name) for name in FIELDS}
    merged = {**current, **{k: v for k, v in data.items() if k in FIELDS}}
    # Скорость из браузера приходит числом (2) — в форме варианты с одним знаком («2.0»)
    try:
        merged["speed"] = f"{Decimal(str(merged['speed'])):.1f}"
    except (InvalidOperation, ValueError):
        pass  # пусть форма сообщит о неверном значении
    # Флажок в форме — «on» или отсутствие ключа
    merged["autoplay_next"] = "on" if merged.get("autoplay_next") in (True, "on", "true", "1") else ""
    return PreferencesForm({k: v for k, v in merged.items() if v != ""}, instance=instance)
