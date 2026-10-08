from django.http import Http404
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.urls import reverse

from apps.progress.services import progress_by_lesson, start_step
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
    progress = progress_by_lesson(request.user)
    chapters = []
    for entry in registry.chapters:
        lessons = [{"lesson": lesson, "progress": progress.get(lesson.id)} for lesson in entry.lessons]
        done = sum(1 for item in lessons if item["progress"] and item["progress"].completed)
        percent = round(100 * done / len(lessons)) if lessons else 0
        chapters.append({"chapter": entry.chapter, "lessons": lessons, "done": done, "percent": percent})
    return render(request, "catalog/course.html", {"course": registry.course, "chapters": chapters})


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
                "startStep": start_step(request.user, current.id),
            },
            "chapter": chapter,
            "prev_lesson": prev_lesson,
            "next_lesson": next_lesson,
        },
    )
