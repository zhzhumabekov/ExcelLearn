from django.urls import path

from . import views

app_name = "preferences"

urlpatterns = [
    path("settings/", views.settings_page, name="page"),
    path("api/settings/", views.update, name="update"),
    path("api/settings/merge/", views.merge, name="merge"),
]
