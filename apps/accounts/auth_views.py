from django import forms
from django.conf import settings
from django.contrib.auth import views as auth
from django.contrib.auth.forms import AuthenticationForm
from django.shortcuts import render
from django.urls import reverse_lazy

from . import throttle


class EmailAuthenticationForm(AuthenticationForm):
    """Вход по email (USERNAME_FIELD модели) с блокировкой после серии неудачных попыток."""

    error_messages = {
        **AuthenticationForm.error_messages,
        "invalid_login": "Неверный email или пароль.",
        "locked": f"Слишком много неудачных попыток. Попробуйте через {throttle.LOCK_MINUTES} минут "
        "или восстановите пароль.",
    }

    def __init__(self, request=None, *args, **kwargs):
        super().__init__(request, *args, **kwargs)
        self.fields["username"].label = "Email"
        self.fields["username"].widget = forms.EmailInput(attrs={"autocomplete": "email", "autofocus": True})
        self.fields["password"].label = "Пароль"

    def clean(self):
        email = self.cleaned_data.get("username") or ""
        if email and throttle.is_locked(self.request, email):
            raise forms.ValidationError(self.error_messages["locked"], code="locked")
        try:
            cleaned = super().clean()
        except forms.ValidationError:
            if email:
                throttle.register_failure(self.request, email)
            raise
        throttle.reset(self.request, email)
        return cleaned


class LoginView(auth.LoginView):
    form_class = EmailAuthenticationForm
    redirect_authenticated_user = True


def password_reset(request):
    """Сброс по email, если настроена почта (EMAIL_HOST); иначе — подсказка обратиться к администратору."""
    if not settings.EMAIL_HOST:
        return render(request, "accounts/password_reset_admin.html", {"contact": settings.SUPPORT_EMAIL})
    return auth.PasswordResetView.as_view(
        template_name="accounts/password_reset_form.html",
        success_url=reverse_lazy("accounts:password_reset_done"),
        email_template_name="accounts/password_reset_email.txt",
        subject_template_name="accounts/password_reset_subject.txt",
    )(request)
