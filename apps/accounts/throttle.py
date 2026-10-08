"""Защита входа от подбора пароля: после MAX_FAILURES неудач для пары (IP, email) — блокировка на LOCK_MINUTES.

Счётчик в кэше Django (в проде — файловый кэш, общий для всех процессов Gunicorn).
"""

import hashlib

from django.core.cache import cache

MAX_FAILURES = 5
LOCK_MINUTES = 15


def client_ip(request) -> str:
    # За Nginx реальный адрес — в X-Real-IP (его ставит наш прокси, клиент подменить не может)
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR", "")


def _key(request, email: str) -> str:
    raw = f"{client_ip(request)}|{email.strip().lower()}"
    return "login-fail:" + hashlib.sha256(raw.encode()).hexdigest()


def is_locked(request, email: str) -> bool:
    return cache.get(_key(request, email), 0) >= MAX_FAILURES


def register_failure(request, email: str) -> None:
    key = _key(request, email)
    cache.add(key, 0, timeout=LOCK_MINUTES * 60)
    try:
        cache.incr(key)
    except ValueError:  # ключ истёк между add и incr
        cache.set(key, 1, timeout=LOCK_MINUTES * 60)


def reset(request, email: str) -> None:
    cache.delete(_key(request, email))
