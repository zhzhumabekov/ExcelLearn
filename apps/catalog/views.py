from django.http import Http404, HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.urls import reverse
from django.utils.http import content_disposition_header

from apps.preferences.services import get_preferences
from apps.progress.services import progress_by_lesson, start_step
from lessons.registry import get_registry
from lessons.xlsx_export import XLSX_CONTENT_TYPE, exercise_filename, exercise_xlsx, lesson_filename, lesson_xlsx
from narration.builder import narration_urls

# Главная, блок «Больше, чем формулы»: методы, которые осваивают в курсе
HOME_TOPICS = [
    "Статистические методы",
    "Прогнозирование",
    "Модели оптимизации",
    "Моделирование",
    "Управление запасами",
    "Теория очередей",
    "Реальные опционы",
    "Потребительская ценность",
    "Модели ценообразования",
]

# Главная, «Как проходить уроки»
HOME_STUDY_STEPS = [
    ("Вникните в ситуацию", "Прочитайте условие: какая задача стоит перед бизнесом и что нужно посчитать."),
    ("Посмотрите анимацию", "Следите за каждым шагом в окне Excel. Ставьте паузу и пересматривайте непонятное."),
    ("Скачайте таблицу", "Под уроком — файл Excel в том виде, в каком урок начинается."),
    ("Повторите сами", "Выполните шаги в своём Excel, а потом решите задания к главе и сверьтесь с решением."),
]


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
            "exercise_count": sum(len(items) for items in registry.exercises.values()),
            "topics": HOME_TOPICS,
            "study_steps": HOME_STUDY_STEPS,
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
        chapters.append(
            {
                "chapter": entry.chapter,
                "lessons": lessons,
                "done": done,
                "percent": percent,
                "exercise_count": len(registry.exercises.get(entry.chapter.id, ())),
            }
        )
    # Сразу раскрыты главы с начатыми уроками; если таких нет — первая глава, где есть что проходить
    started = {
        entry["chapter"].id
        for entry in chapters
        if any(item["progress"] and not item["progress"].completed for item in entry["lessons"])
    }
    if not started:
        first = next((e["chapter"].id for e in chapters if e["lessons"] and e["done"] < len(e["lessons"])), None)
        started = {first} if first else set()
    for entry in chapters:
        entry["open"] = entry["chapter"].id in started
    return render(
        request,
        "catalog/course.html",
        {
            "course": registry.course,
            "chapters": chapters,
            "lesson_count": sum(len(entry["lessons"]) for entry in chapters),
            "exercise_count": sum(entry["exercise_count"] for entry in chapters),
            "empty_count": sum(1 for entry in chapters if not entry["lessons"]),
        },
    )


def lesson(request, lesson_id: str):
    registry = get_registry()
    current = registry.get(lesson_id)
    if current is None:
        raise Http404(f"Нет урока {lesson_id}")
    prev_lesson, next_lesson = registry.neighbors(lesson_id)
    entry = next(entry for entry in registry.chapters if entry.chapter.id == current.chapter)
    chapter = entry.chapter
    # После последнего урока главы — приглашение к заданиям
    show_exercises = entry.lessons[-1].id == current.id and bool(registry.exercises.get(chapter.id))
    return render(
        request,
        "catalog/lesson.html",
        {
            "lesson": current,
            "lesson_data": current.model_dump(mode="json"),
            "lesson_file_name": lesson_filename(current),
            "narration": narration_urls(current.id),
            "page_config": {
                "progressUrl": reverse("progress:save", args=[current.id]) if request.user.is_authenticated else None,
                "csrfToken": get_token(request),
                "startStep": start_step(request.user, current.id),
                # У гостя настройки — в браузере (guest-settings.js)
                "settings": get_preferences(request.user).player_settings() if request.user.is_authenticated else None,
            },
            "chapter": chapter,
            "show_exercises": show_exercises,
            "prev_lesson": prev_lesson,
            "next_lesson": next_lesson,
        },
    )


def lesson_file(request, lesson_id: str):
    """Файл урока: лист в начальном состоянии — открыть в своём Excel и повторить шаги."""
    current = get_registry().get(lesson_id)
    if current is None:
        raise Http404(f"Нет урока {lesson_id}")
    return xlsx_response(lesson_xlsx(current), lesson_filename(current))


def xlsx_response(content: bytes, filename: str) -> HttpResponse:
    response = HttpResponse(content, content_type=XLSX_CONTENT_TYPE)
    response["Content-Disposition"] = content_disposition_header(as_attachment=True, filename=filename)
    return response


def exercises(request, chapter_id: str):
    registry = get_registry()
    chapter = registry.chapter(chapter_id)
    items = registry.exercises.get(chapter_id)
    if chapter is None or not items:
        raise Http404(f"Нет заданий к главе {chapter_id}")
    entry = next(e for e in registry.chapters if e.chapter.id == chapter_id)
    return render(
        request,
        "catalog/exercises.html",
        {
            "chapter": chapter,
            "exercises": [
                {
                    "exercise": exercise,
                    "task_name": exercise_filename(exercise, "task"),
                    "solution_name": exercise_filename(exercise, "solution"),
                }
                for exercise in items
            ],
            "last_lesson": entry.lessons[-1] if entry.lessons else None,
        },
    )


def exercise_file(request, chapter_id: str, exercise_id: str, kind: str):
    exercise = get_registry().exercise(chapter_id, exercise_id)
    if exercise is None:
        raise Http404(f"Нет задания {chapter_id}/{exercise_id}")
    return xlsx_response(exercise_xlsx(exercise, kind), exercise_filename(exercise, kind))  # type: ignore[arg-type]
