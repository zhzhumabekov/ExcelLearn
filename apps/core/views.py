from django.conf import settings
from django.http import Http404
from django.shortcuts import render


def dev_player(request):
    """Песочница плеера для разработки; в проде (DEBUG=False) недоступна."""
    if not settings.DEBUG:
        raise Http404
    return render(request, "dev/player.html")
