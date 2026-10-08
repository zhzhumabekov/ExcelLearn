#!/bin/sh
# Бэкап базы: сжатый дамп в /backups (на VPS — папка backups/ рядом с docker-compose.yml),
# копии старше BACKUP_KEEP_DAYS дней удаляются. Запускается по расписанию сервисом backup;
# вручную: docker compose --env-file .env.production exec backup /backup.sh
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
FILE="/backups/excellearn-$(date -u +%Y-%m-%d_%H%M).dump"

pg_dump --format=custom --no-owner --file="$FILE.tmp"
mv "$FILE.tmp" "$FILE"  # неполный дамп никогда не выглядит как готовый
echo "$(date -u '+%F %T') бэкап: $FILE ($(du -h "$FILE" | cut -f1))"

find /backups -name 'excellearn-*.dump' -mtime "+$KEEP_DAYS" -print -delete
