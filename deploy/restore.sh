#!/bin/sh
# Восстановление базы из бэкапа: заменяет ВСЕ данные сайта содержимым дампа.
#   sh deploy/restore.sh backups/excellearn-2026-10-09_2200.dump
# Сайт на время восстановления останавливается.
set -eu

DUMP="${1:?укажите файл дампа: sh deploy/restore.sh backups/excellearn-ГГГГ-ММ-ДД_ЧЧММ.dump}"
[ -f "$DUMP" ] || { echo "Нет файла $DUMP"; exit 1; }
DC="docker compose --env-file .env.production"

printf 'Заменить все данные сайта содержимым %s? Введите «да»: ' "$DUMP"
read -r answer
[ "$answer" = "да" ] || { echo "Отменено"; exit 1; }

$DC stop web
$DC exec -T db pg_restore --clean --if-exists --no-owner -U excellearn -d excellearn < "$DUMP"
$DC start web
echo "Готово: база восстановлена из $DUMP"
