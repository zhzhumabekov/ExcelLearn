from django.contrib import admin

from .models import Preferences


@admin.register(Preferences)
class PreferencesAdmin(admin.ModelAdmin):
    list_display = ["user", "speed", "function_locale", "narration_on", "autoplay_next", "theme", "updated_at"]
    list_filter = ["function_locale", "theme", "narration_on"]
    search_fields = ["user__email"]
    list_select_related = ["user"]
