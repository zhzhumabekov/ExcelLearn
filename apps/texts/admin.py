from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.shortcuts import redirect, render
from django.urls import path

from lessons.registry import get_registry

from .models import LessonText
from .services import ACTIVE, STALE, edit_status, field_label, lesson_texts, validate_text


class LessonTextForm(forms.ModelForm):
    class Meta:
        model = LessonText
        fields = ["text"]

    def clean_text(self):
        value = self.cleaned_data["text"].replace("\r\n", "\n")
        validate_text(value)
        return value


class LessonEditForm(forms.Form):
    """Все тексты урока на одной странице: название, заголовок и текст каждого шага."""

    def __init__(self, *args, texts: dict[str, str], **kwargs):
        super().__init__(*args, **kwargs)
        for field, value in texts.items():
            if field.endswith(".text"):
                widget = forms.Textarea(attrs={"rows": 5, "class": "vLargeTextField", "style": "width: 100%"})
            else:
                widget = forms.TextInput(attrs={"class": "vTextField", "style": "width: 100%"})
            self.fields[field] = forms.CharField(
                label=field_label(field), initial=value, widget=widget, strip=False, validators=[validate_text]
            )

    def changed_texts(self) -> dict[str, str]:
        return {
            field: self.cleaned_data[field].replace("\r\n", "\n")
            for field in self.fields
            if self.cleaned_data[field].replace("\r\n", "\n") != self.fields[field].initial
        }


@admin.register(LessonText)
class LessonTextAdmin(admin.ModelAdmin):
    form = LessonTextForm
    list_display = ["lesson_id", "field_name", "status", "short_text", "updated_at", "updated_by"]
    list_filter = ["lesson_id"]
    search_fields = ["lesson_id", "text", "original"]
    fields = ["lesson_id", "field", "original", "text", "updated_at", "updated_by"]
    readonly_fields = ["lesson_id", "field", "original", "updated_at", "updated_by"]
    list_select_related = ["updated_by"]

    def has_add_permission(self, request):
        return False  # правки создаёт страница урока: «Исправить тексты урока»

    @admin.display(description="поле", ordering="field")
    def field_name(self, obj):
        return field_label(obj.field)

    @admin.display(description="статус")
    def status(self, obj):
        return edit_status(obj, get_registry().get(obj.lesson_id))

    @admin.display(description="текст")
    def short_text(self, obj):
        return obj.text if len(obj.text) <= 80 else obj.text[:80] + "…"

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)

    def get_urls(self):
        own = [
            path("lessons/", self.admin_site.admin_view(self.lesson_list_view), name="texts_lesson_list"),
            path(
                "lessons/<slug:lesson_id>/",
                self.admin_site.admin_view(self.lesson_edit_view),
                name="texts_lesson_edit",
            ),
        ]
        return own + super().get_urls()

    def _context(self, request, title):
        return {**self.admin_site.each_context(request), "opts": self.opts, "title": title}

    def lesson_list_view(self, request):
        if not self.has_change_permission(request):
            raise PermissionDenied
        edits: dict[str, list[LessonText]] = {}
        for edit in LessonText.objects.all():
            edits.setdefault(edit.lesson_id, []).append(edit)
        registry = get_registry()
        chapters = [
            {
                "chapter": entry.chapter,
                "lessons": [
                    {
                        "lesson": lesson,
                        "active": sum(edit_status(e, lesson) == ACTIVE for e in edits.get(lesson.id, [])),
                        "stale": sum(edit_status(e, lesson) == STALE for e in edits.get(lesson.id, [])),
                    }
                    for lesson in entry.lessons
                ],
            }
            for entry in registry.chapters
        ]
        context = {**self._context(request, "Исправить тексты урока"), "chapters": chapters}
        return render(request, "admin/texts/lesson_list.html", context)

    def lesson_edit_view(self, request, lesson_id: str):
        if not self.has_change_permission(request):
            raise PermissionDenied
        lesson = get_registry().get(lesson_id)
        if lesson is None:
            raise Http404(f"Нет урока {lesson_id}")
        yaml_texts = lesson_texts(lesson)
        edits = {e.field: e for e in LessonText.objects.filter(lesson_id=lesson_id).select_related("updated_by")}
        statuses = {field: edit_status(edit, lesson) for field, edit in edits.items()}
        # В форме — то, что сейчас видит ученик: действующая правка или текст из YAML
        shown = {
            field: edits[field].text if statuses.get(field) == ACTIVE else value for field, value in yaml_texts.items()
        }

        form = LessonEditForm(request.POST or None, texts=shown)
        if request.method == "POST" and form.is_valid():
            changed = form.changed_texts()
            for field, value in changed.items():
                if value == yaml_texts[field]:
                    LessonText.objects.filter(lesson_id=lesson_id, field=field).delete()  # вернули текст YAML
                else:
                    LessonText.objects.update_or_create(
                        lesson_id=lesson_id,
                        field=field,
                        defaults={"original": yaml_texts[field], "text": value, "updated_by": request.user},
                    )
            messages.success(request, f"Сохранено полей: {len(changed)}" if changed else "Изменений нет")
            return redirect("admin:texts_lesson_edit", lesson_id=lesson_id)

        rows = [
            {
                "field": form[field],
                "yaml": yaml_texts[field],
                "edit": edits.get(field),
                "status": statuses.get(field),
            }
            for field in yaml_texts
        ]
        context = {
            **self._context(request, f"Тексты урока «{lesson.title}»"),
            "lesson": lesson,
            "form": form,
            "title_row": rows[0],
            "steps": [rows[i : i + 2] for i in range(1, len(rows), 2)],
        }
        return render(request, "admin/texts/lesson_edit.html", context)
