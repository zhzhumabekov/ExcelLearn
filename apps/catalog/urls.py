from django.urls import path

from . import views

app_name = "catalog"

urlpatterns = [
    path("", views.home, name="home"),
    path("course/", views.course, name="course"),
    path("lessons/<slug:lesson_id>/", views.lesson, name="lesson"),
    path("lessons/<slug:lesson_id>/file.xlsx", views.lesson_file, name="lesson-file"),
    path("course/<slug:chapter_id>/theory/", views.theory, name="theory"),
    path("course/<slug:chapter_id>/exercises/", views.exercises, name="exercises"),
    path(
        "course/<slug:chapter_id>/exercises/<slug:exercise_id>/task.xlsx",
        views.exercise_file,
        {"kind": "task"},
        name="exercise-task",
    ),
    path(
        "course/<slug:chapter_id>/exercises/<slug:exercise_id>/solution.xlsx",
        views.exercise_file,
        {"kind": "solution"},
        name="exercise-solution",
    ),
]
