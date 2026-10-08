from django.conf import settings
from django.http import Http404
from django.shortcuts import render

from lessons.registry import get_registry


def dev_player(request):
    """Песочница плеера для разработки; в проде (DEBUG=False) недоступна.

    ?lesson=<id> — какой урок (по умолчанию первый), ?locale=ru|en — язык функций,
    ?demo=1 — сразу запустить урок (для проверок в браузере), ?speed=16 — скорость (e2e-тесты).
    """
    if not settings.DEBUG:
        raise Http404

    registry = get_registry()
    lesson_id = request.GET.get("lesson") or (registry.lessons[0].id if registry.lessons else None)
    lesson = registry.get(lesson_id) if lesson_id else None
    if lesson_id and lesson is None:
        raise Http404(f"Нет урока {lesson_id}")
    locale = "en" if request.GET.get("locale") == "en" else "ru"
    try:
        speed = min(max(float(request.GET.get("speed", 1)), 0.25), 32)
    except ValueError:
        speed = 1

    return render(
        request,
        "dev/player.html",
        {
            "lessons": registry.lessons,
            "lesson": lesson,
            "lesson_data": lesson.model_dump(mode="json") if lesson else None,
            "locale": locale,
            "demo": request.GET.get("demo") == "1",
            "speed": speed,
        },
    )
