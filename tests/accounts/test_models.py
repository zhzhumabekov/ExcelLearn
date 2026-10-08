import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError

User = get_user_model()

pytestmark = pytest.mark.django_db


def make_user(email="luka@example.kz", **extra):
    fields = {"first_name": "Luka", "last_name": "Abrus", "phone": "+77011234567", **extra}
    return User.objects.create_user(email=email, password="s3cret-pass", **fields)


def test_create_user_logs_in_by_email():
    user = make_user()

    assert User.USERNAME_FIELD == "email"
    assert user.check_password("s3cret-pass")
    assert not user.is_staff
    assert not user.is_superuser


def test_email_domain_is_normalized():
    user = make_user(email="Luka@EXAMPLE.KZ")

    assert user.email == "Luka@example.kz"


def test_email_is_unique():
    make_user()

    with pytest.raises(IntegrityError):
        make_user()


def test_email_is_required():
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password="x")


def test_create_superuser():
    admin = User.objects.create_superuser(
        email="admin@example.kz", password="x", first_name="A", last_name="B", phone="+77010000000"
    )

    assert admin.is_staff
    assert admin.is_superuser
    assert admin.consent_at is None


@pytest.mark.parametrize("phone", ["87011234567", "+7 701 123 45 67", "+7701", "phone"])
def test_invalid_phone_is_rejected(phone):
    user = make_user(phone=phone)

    with pytest.raises(ValidationError) as exc:
        user.full_clean()
    assert "phone" in exc.value.message_dict


def test_valid_phone_passes_validation():
    make_user(phone="+77011234567").full_clean()
