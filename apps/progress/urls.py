from django.urls import path

from . import views

app_name = "progress"

urlpatterns = [
    path("<slug:lesson_id>/", views.save_progress, name="save"),
]
