from django.contrib.auth import login
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme

from .forms import SignupForm


def next_url(request) -> str:
    """Куда вернуть после входа/регистрации: только на свой сайт, иначе — на главную."""
    target = request.POST.get("next") or request.GET.get("next") or ""
    if url_has_allowed_host_and_scheme(target, allowed_hosts={request.get_host()}, require_https=request.is_secure()):
        return target
    return "/"


def signup(request):
    if request.user.is_authenticated:
        return redirect(next_url(request))
    form = SignupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return redirect(next_url(request))
    return render(request, "registration/signup.html", {"form": form, "next": next_url(request)})
