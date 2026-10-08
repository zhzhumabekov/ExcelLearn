from django import forms
from django.contrib.auth import password_validation
from django.urls import reverse
from django.utils import timezone
from django.utils.safestring import mark_safe

from apps.legal.documents import consent

from .models import User, phone_validator
from .phone import normalize_phone


class SignupForm(forms.ModelForm):
    password1 = forms.CharField(
        label="Пароль", strip=False, widget=forms.PasswordInput(attrs={"autocomplete": "new-password"})
    )
    password2 = forms.CharField(
        label="Пароль ещё раз", strip=False, widget=forms.PasswordInput(attrs={"autocomplete": "new-password"})
    )
    consent = forms.BooleanField(
        required=True,
        error_messages={"required": "Без согласия на обработку персональных данных регистрация невозможна."},
    )

    class Meta:
        model = User
        fields = ["first_name", "last_name", "email", "phone"]
        labels = {"first_name": "Имя", "last_name": "Фамилия", "email": "Email", "phone": "Телефон"}
        widgets = {
            "first_name": forms.TextInput(attrs={"autocomplete": "given-name"}),
            "last_name": forms.TextInput(attrs={"autocomplete": "family-name"}),
            "email": forms.EmailInput(attrs={"autocomplete": "email"}),
            "phone": forms.TextInput(
                attrs={"autocomplete": "tel", "placeholder": "+7 701 123 45 67", "inputmode": "tel"}
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name in ("first_name", "last_name"):
            self.fields[name].required = True
        url = reverse("legal:consent")
        # Ссылка своя, текст статичный — разметка безопасна
        self.fields["consent"].label = mark_safe(
            f'Я даю <a href="{url}" target="_blank" rel="noopener">согласие на сбор и обработку персональных данных</a>'
        )

    def clean_email(self) -> str:
        email = User.objects.normalize_email(self.cleaned_data["email"]).strip()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Пользователь с таким email уже зарегистрирован.")
        return email

    def clean_phone(self) -> str:
        phone = normalize_phone(self.cleaned_data["phone"])
        phone_validator(phone)
        return phone

    def clean(self):
        cleaned = super().clean()
        p1, p2 = cleaned.get("password1"), cleaned.get("password2")
        if p1 and p2 and p1 != p2:
            self.add_error("password2", "Пароли не совпадают.")
        return cleaned

    def _post_clean(self):
        super()._post_clean()
        # Сложность пароля — с учётом имени и email (UserAttributeSimilarityValidator)
        password = self.cleaned_data.get("password2")
        if password and "password2" not in self.errors:
            try:
                password_validation.validate_password(password, self.instance)
            except forms.ValidationError as error:
                self.add_error("password2", error)

    def save(self, commit: bool = True) -> User:
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        user.consent_at = timezone.now()
        user.consent_version = consent().version
        if commit:
            user.save()
        return user
