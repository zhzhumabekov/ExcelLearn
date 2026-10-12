#!/bin/sh
# Обновление сайта на сервере: бэкап базы → сборка и перезапуск → проверка, что сайт отвечает.
# Код уже должен быть нужной версии (git pull). Запускает .github/workflows/deploy.yml; вручную:
#   cd ~/excellearn && git pull && sh deploy/update.sh
set -eu

DC="docker compose --env-file .env.production"
DOMAIN="$(grep -E '^SITE_DOMAIN=' .env.production | tail -1 | cut -d= -f2- | tr -d '"\r ')"
DOMAIN="${DOMAIN:-localhost}"

echo "== Версия: $(git log -1 --format='%h %s')"

# Бэкап перед миграциями; при первом запуске сервиса backup ещё нет
if [ -n "$($DC ps --status running -q backup)" ]; then
	echo "== Бэкап базы"
	$DC exec -T backup sh /backup.sh
else
	echo "== Бэкап пропущен: сервис backup не запущен"
fi

echo "== Сборка и перезапуск"
$DC up -d --build --remove-orphans

# web при старте применяет миграции и проверяет уроки (deploy/entrypoint.sh) — ждём до 3 минут.
# -k: сертификат внутреннего ЦС на самом сервере может быть не установлен
echo "== Проверка https://$DOMAIN/"
i=0
until curl -fs -k -o /dev/null --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/"; do
	i=$((i + 1))
	if [ "$i" -ge 90 ]; then
		echo "Сайт не отвечает. Последние строки журнала web:"
		$DC logs --tail 60 web
		exit 1
	fi
	sleep 2
done
echo "Сайт отвечает"

# Старые образы после пересборки — иначе диск постепенно заполняется
docker image prune -f >/dev/null
echo "== Готово"
