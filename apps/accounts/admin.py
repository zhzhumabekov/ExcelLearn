from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["email"]
    list_display = ["email", "first_name", "last_name", "phone", "date_joined", "is_staff"]
    search_fields = ["email", "first_name", "last_name", "phone"]
    readonly_fields = ["consent_at", "consent_version", "last_login", "date_joined"]

    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Профиль", {"fields": ["first_name", "last_name", "phone"]}),
        ("Согласие на обработку ПДн", {"fields": ["consent_at", "consent_version"]}),
        ("Права", {"fields": ["is_active", "is_staff", "is_superuser", "groups", "user_permissions"]}),
        ("Даты", {"fields": ["last_login", "date_joined"]}),
    ]
    add_fieldsets = [
        (
            None,
            {
                "classes": ["wide"],
                "fields": ["email", "first_name", "last_name", "phone", "password1", "password2"],
            },
        ),
    ]
