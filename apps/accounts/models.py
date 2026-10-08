from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models

from .managers import UserManager

phone_validator = RegexValidator(
    regex=r"^\+\d{10,15}$",
    message="Телефон в международном формате, например +77011234567",
)


class User(AbstractUser):
    username = None
    email = models.EmailField("email", unique=True)
    phone = models.CharField("телефон", max_length=20, validators=[phone_validator])
    # Пусто только у пользователей, созданных администратором (createsuperuser, админка):
    # при самостоятельной регистрации согласие обязательно (T22).
    consent_at = models.DateTimeField("согласие на обработку ПДн", null=True, blank=True)
    consent_version = models.CharField("версия согласия", max_length=20, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name", "phone"]

    objects = UserManager()

    class Meta:
        verbose_name = "пользователь"
        verbose_name_plural = "пользователи"

    def __str__(self):
        return self.email
