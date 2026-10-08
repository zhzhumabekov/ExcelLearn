from django.urls import path

from . import views

app_name = "legal"

urlpatterns = [
    path("consent/", views.consent, name="consent"),
]
