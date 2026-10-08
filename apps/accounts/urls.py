from django.contrib.auth import views as auth
from django.urls import path, reverse_lazy

from . import auth_views, views

app_name = "accounts"

# Шаблоны — в accounts/, а не registration/: иначе подхватились бы одноимённые шаблоны админки
urlpatterns = [
    path("signup/", views.signup, name="signup"),
    path("login/", auth_views.LoginView.as_view(template_name="accounts/login.html"), name="login"),
    path("logout/", auth.LogoutView.as_view(), name="logout"),  # только POST (Django 5)
    path("password-reset/", auth_views.password_reset, name="password_reset"),
    path(
        "password-reset/sent/",
        auth.PasswordResetDoneView.as_view(template_name="accounts/password_reset_done.html"),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        auth.PasswordResetConfirmView.as_view(
            template_name="accounts/password_reset_confirm.html",
            success_url=reverse_lazy("accounts:password_reset_complete"),
        ),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        auth.PasswordResetCompleteView.as_view(template_name="accounts/password_reset_complete.html"),
        name="password_reset_complete",
    ),
]
