from django.contrib import admin

from .models import Preferences


@admin.register(Preferences)
class PreferencesAdmin(admin.ModelAdmin):
    list_display = ["user", "speed", "function_locale", "play_mode", "autoplay_next", "updated_at"]
    list_filter = ["function_locale", "play_mode"]
    search_fields = ["user__email"]
    list_select_related = ["user"]
