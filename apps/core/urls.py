from django.urls import path

from . import views

app_name = "core"

urlpatterns = [
    path("dev/player/", views.dev_player, name="dev-player"),
]
