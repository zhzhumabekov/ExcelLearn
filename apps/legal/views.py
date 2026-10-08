from django.shortcuts import render

from .documents import consent as consent_document


def consent(request):
    return render(request, "legal/document.html", {"document": consent_document()})
