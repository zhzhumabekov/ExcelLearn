import json

from django.http import Http404, JsonResponse
from django.views.decorators.http import require_POST

from lessons.registry import get_registry

from .services import merge_guest_progress, record_progress


@require_POST
def save_progress(request, lesson_id: str):
    """POST /api/progress/<lesson_id>/  {"step": 3, "completed": false} — от страницы урока (CSRF обязателен)."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Нужно войти"}, status=401)
    lesson = get_registry().get(lesson_id)
    if lesson is None:
        raise Http404(f"Нет урока {lesson_id}")
    try:
        payload = json.loads(request.body)
        step = payload["step"]
        completed = payload.get("completed", False)
        if not isinstance(step, int) or isinstance(step, bool) or not isinstance(completed, bool):
            raise ValueError
    except (ValueError, KeyError, TypeError):
        return JsonResponse({"error": 'Ожидается {"step": число, "completed": true|false}'}, status=400)

    progress = record_progress(request.user, lesson_id, step, completed, step_count=len(lesson.steps))
    return JsonResponse({"last_step": progress.last_step, "completed": progress.completed})


@require_POST
def merge(request):
    """POST /api/progress/merge/  {"<lesson_id>": {"step": 4, "completed": false}, …} — прогресс гостя после входа."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Нужно войти"}, status=401)
    try:
        guest = json.loads(request.body)
        if not isinstance(guest, dict):
            raise ValueError
    except ValueError:
        return JsonResponse({"error": "Ожидается объект {lesson_id: {step, completed}}"}, status=400)
    step_counts = {lesson.id: len(lesson.steps) for lesson in get_registry().lessons}
    return JsonResponse({"merged": merge_guest_progress(request.user, guest, step_counts)})
