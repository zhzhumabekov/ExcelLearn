from django.http import Http404
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.urls import reverse

from lessons.registry import get_registry
from narration.builder import narration_urls


def home(request):
    registry = get_registry()
    return render(
        request,
        "catalog/home.html",
        {
            "course": registry.course,
            "chapters": registry.chapters,
            "first_lesson": registry.lessons[0] if registry.lessons else None,
            "lesson_count": len(registry.lessons),
        },
    )


def course(request):
    registry = get_registry()
    return render(request, "catalog/course.html", {"course": registry.course, "chapters": registry.chapters})


def lesson(request, lesson_id: str):
    registry = get_registry()
    current = registry.get(lesson_id)
    if current is None:
        raise Http404(f"Нет урока {lesson_id}")
    prev_lesson, next_lesson = registry.neighbors(lesson_id)
    chapter = next(entry.chapter for entry in registry.chapters if entry.chapter.id == current.chapter)
    return render(
        request,
        "catalog/lesson.html",
        {
            "lesson": current,
            "lesson_data": current.model_dump(mode="json"),
            "narration": narration_urls(current.id),
            "page_config": {
                "progressUrl": reverse("progress:save", args=[current.id]) if request.user.is_authenticated else None,
                "csrfToken": get_token(request),
                "startStep": 0,
            },
            "chapter": chapter,
            "prev_lesson": prev_lesson,
            "next_lesson": next_lesson,
        },
    )
