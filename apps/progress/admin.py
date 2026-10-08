from django.contrib import admin

from .models import LessonProgress


@admin.register(LessonProgress)
class LessonProgressAdmin(admin.ModelAdmin):
    list_display = ["user", "lesson_id", "last_step", "completed_at", "updated_at"]
    list_filter = ["lesson_id", ("completed_at", admin.EmptyFieldListFilter)]
    search_fields = ["user__email", "user__last_name", "lesson_id"]
    list_select_related = ["user"]
    readonly_fields = ["updated_at"]
