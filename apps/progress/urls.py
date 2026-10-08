from django.urls import path

from . import views

app_name = "progress"

urlpatterns = [
    path("merge/", views.merge, name="merge"),  # до <slug>: иначе «merge» приняли бы за id урока
    path("<slug:lesson_id>/", views.save_progress, name="save"),
]
