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
            "theme": forms.RadioSelect,
            "narration_volume": forms.NumberInput(attrs={"type": "range", "min": 0, "max": 100, "step": 5}),
        }


def partial_form(instance: Preferences, data: dict) -> PreferencesForm:
    """Форма для частичного обновления (например, только тема из шапки): остальные поля — текущие."""
    current = {name: getattr(instance, name) for name in FIELDS}
    merged = {**current, **{k: v for k, v in data.items() if k in FIELDS}}
    # Скорость из браузера приходит числом (2) — в форме варианты с одним знаком («2.0»)
    try:
        merged["speed"] = f"{Decimal(str(merged['speed'])):.1f}"
    except (InvalidOperation, ValueError):
        pass  # пусть форма сообщит о неверном значении
    # Флажки в форме — «on» или отсутствие ключа
    for flag in ("narration_on", "autoplay_next"):
        merged[flag] = "on" if merged.get(flag) in (True, "on", "true", "1") else ""
    return PreferencesForm({k: v for k, v in merged.items() if v != ""}, instance=instance)
