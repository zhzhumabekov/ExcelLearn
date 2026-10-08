from django.urls import path

from . import views

app_name = "catalog"

urlpatterns = [
    path("", views.home, name="home"),
    path("course/", views.course, name="course"),
    path("lessons/<slug:lesson_id>/", views.lesson, name="lesson"),
]
