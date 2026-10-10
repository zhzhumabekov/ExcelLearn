import pytest


@pytest.fixture
def client(client, django_user_model):
    """Уроки, теория и задания — только после регистрации: в тестах каталога клиент по умолчанию вошёл.
    Гостя проверяют отдельно (guest). Полный доступ — чтобы открывались все главы; без него — test_full_access."""
    user = django_user_model.objects.create_user(
        email="student@example.kz",
        password="x",
        first_name="Айгерим",
        last_name="С",
        phone="+77010000001",
        full_access=True,
    )
    client.force_login(user)
    return client


@pytest.fixture
def guest(db):
    from django.test import Client

    return Client()
