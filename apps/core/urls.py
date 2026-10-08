from django.urls import path

from . import views

app_name = "core"

urlpatterns = [
    path("dev/player/", views.dev_player, name="dev-player"),
    path("media/<path:path>", views.dev_media, name="dev-media"),
]
