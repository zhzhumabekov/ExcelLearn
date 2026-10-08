from .services import get_preferences


def preferences(request):
    """Настройки в каждом шаблоне: тема вошедшего ставится на <html> ещё до первой отрисовки."""
    return {"preferences": get_preferences(request.user)}
