# syntax=docker/dockerfile:1

# ---------- 1. Ассеты: плеер (esbuild) и CSS сайта (Tailwind) ----------
FROM node:24-slim AS assets
RUN npm install -g pnpm@10
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY player/package.json player/pnpm-lock.yaml player/
RUN pnpm install --frozen-lockfile && pnpm --dir player install --frozen-lockfile

COPY player/ player/
COPY assets/ assets/
COPY static/ static/
COPY apps/ apps/
RUN pnpm --dir player build && pnpm css


# ---------- 2. Приложение: Django + Gunicorn ----------
FROM python:3.12-slim AS app
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app

# Зависимости отдельным слоем — пересобираются только при изменении lock-файла
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
COPY --from=assets /app/static/player/ static/player/
COPY --from=assets /app/static/css/site.css static/css/site.css

# Статика собирается при сборке образа (ключ — только для этого шага)
RUN DJANGO_SECRET_KEY=build-only PRODUCTION=true python manage.py collectstatic --noinput -v 0

RUN useradd --create-home --uid 1000 app \
    && mkdir -p var/cache \
    && chown -R app:app var
USER app

EXPOSE 8000
ENTRYPOINT ["sh", "deploy/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
