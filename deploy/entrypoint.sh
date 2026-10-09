#!/bin/sh
# Запуск контейнера web: миграции, проверка уроков, озвучка (только новые и изменённые шаги),
# затем команда (по умолчанию — Gunicorn).
set -e

python manage.py migrate --noinput
python manage.py lessons_check

# Озвучка пока выключена (NARRATION_ENABLED=false) — не собираем.
# Без ключа Yandex или без сети сайт всё равно запускается — уроки идут без голоса
if [ "$NARRATION_ENABLED" = "true" ]; then
  python manage.py narration_build || echo "ВНИМАНИЕ: озвучка не собрана (см. сообщение выше) — уроки без голоса"
fi

exec "$@"
