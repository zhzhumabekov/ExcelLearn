from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["email"]
    list_display = ["email", "first_name", "last_name", "phone", "date_joined", "full_access", "is_staff"]
    list_filter = ["full_access", "is_staff", "is_superuser", "is_active"]
    list_editable = ["full_access"]
    actions = ["grant_full_access", "revoke_full_access"]
    search_fields = ["email", "first_name", "last_name", "phone"]
    readonly_fields = ["consent_at", "consent_version", "last_login", "date_joined"]

    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Профиль", {"fields": ["first_name", "last_name", "phone"]}),
        ("Согласие на обработку ПДн", {"fields": ["consent_at", "consent_version"]}),
        ("Доступ к курсу", {"fields": ["full_access"]}),
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

    @admin.action(description="Открыть полный доступ")
    def grant_full_access(self, request, queryset):
        count = queryset.update(full_access=True)
        self.message_user(request, f"Полный доступ открыт: {count}")

    @admin.action(description="Закрыть полный доступ")
    def revoke_full_access(self, request, queryset):
        count = queryset.update(full_access=False)
        self.message_user(request, f"Полный доступ закрыт: {count}")
