import json

from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from .forms import PreferencesForm, partial_form
from .services import get_preferences, has_saved_preferences


def settings_page(request):
    """Страница настроек. У вошедшего — сохранение в базу при каждом изменении (htmx, без кнопки);
    у гостя та же форма работает через браузер (static/js/settings-page.js)."""
    preferences = get_preferences(request.user)
    if request.method == "POST":
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Нужно войти"}, status=401)
        form = PreferencesForm(request.POST, instance=preferences)
        saved = form.is_valid()
        if saved:
            form.save()
        if request.htmx:
            return render(request, "preferences/_status.html", {"saved": saved, "form": form})
        return redirect("preferences:page")
    return render(request, "preferences/settings.html", {"form": PreferencesForm(instance=preferences)})


def _json(request) -> dict | None:
    try:
        data = json.loads(request.body)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


@require_POST
def update(request):
    """POST /api/settings/ {"function_locale": "en"} — частичное обновление настроек."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Нужно войти"}, status=401)
    data = _json(request)
    if data is None:
        return JsonResponse({"error": "Ожидается объект с настройками"}, status=400)
    form = partial_form(get_preferences(request.user), data)
    if not form.is_valid():
        return JsonResponse({"errors": form.errors}, status=400)
    form.save()
    return JsonResponse({"ok": True})


@require_POST
def merge(request):
    """POST /api/settings/merge/ — настройки гостя после входа. Переносятся, только если в аккаунте
    ещё ничего не настроено: выбор, сделанный в аккаунте, важнее браузерного."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Нужно войти"}, status=401)
    data = _json(request)
    if data is None:
        return JsonResponse({"error": "Ожидается объект с настройками"}, status=400)
    if has_saved_preferences(request.user):
        return JsonResponse({"merged": False})
    form = partial_form(get_preferences(request.user), data)
    if not form.is_valid():
        return JsonResponse({"errors": form.errors}, status=400)
    form.save()
    return JsonResponse({"merged": True})
