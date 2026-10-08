#!/bin/sh
# Запуск контейнера web: миграции базы, затем команда (по умолчанию — Gunicorn).
set -e

python manage.py migrate --noinput
python manage.py lessons_check

exec "$@"
