# Развёртывание ExcelLearn на VPS

Сайт работает в Docker: **PostgreSQL** (база), **web** (Django + Gunicorn), **Caddy** (HTTPS: сертификат Let's Encrypt выпускается и продлевается сам), **backup** (ежедневный бэкап базы). Всё описано в [docker-compose.yml](../docker-compose.yml).

> Персональные данные учеников (ФИО, email, телефон) по Закону РК № 94-V хранятся в Казахстане: сервер и бэкапы — на VPS в РК. Копируйте бэкапы только на носители и серверы, которые тоже находятся в РК.

## 1. Что нужно

| | |
|---|---|
| VPS в Казахстане | Ubuntu 24.04, 2 ГБ RAM, 20 ГБ диска, публичный IPv4 |
| Домен | DNS-запись **A**: `excellearn.kz` → IP сервера (до запуска — иначе Caddy не получит сертификат) |
| Открытые порты | 80 и 443 (22 — для SSH) |
| Доступ к репозиторию | Приватный GitHub: deploy key (только чтение) или токен |

## 2. Подготовка сервера (один раз)

```bash
# Docker и Compose — официальный скрипт
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # затем выйти и зайти по SSH заново

# Брандмауэр: только SSH и веб
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

Код:

```bash
git clone git@github.com:zhzhumabekov/ExcelLearn.git ~/excellearn
cd ~/excellearn
```

## 3. Настройки

```bash
cp deploy/.env.production.example .env.production
nano .env.production
```

Обязательно заполнить:

| Переменная | Что это |
|---|---|
| `SITE_DOMAIN` | Домен сайта, например `excellearn.kz` |
| `DJANGO_SECRET_KEY` | Секретный ключ: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `POSTGRES_PASSWORD` | Пароль базы (сгенерируйте так же) |
| `SUPPORT_EMAIL` | Контакт администратора для учеников, забывших пароль (пока нет почты) |
| `NARRATION_ENABLED` | Озвучка: пока `false` (выключена до решения, нужна ли она) |
| `TTS_API_KEY`, `TTS_FOLDER_ID` | Ключ Yandex SpeechKit — нужен, только если `NARRATION_ENABLED=true` |
| `EMAIL_*` | SMTP — когда появится почта; тогда сброс пароля пойдёт письмом |

`.env.production` не попадает в git — храните его копию в надёжном месте.

## 4. Запуск

```bash
docker compose --env-file .env.production up -d --build
```

При старте контейнер `web` сам применяет миграции базы, проверяет уроки и, если `NARRATION_ENABLED=true`, собирает озвучку (только новые и изменённые шаги). Первый запуск — 3–5 минут (сборка образа, сертификат).

Чтобы не писать `--env-file` каждый раз:

```bash
echo "alias dc='docker compose --env-file .env.production'" >> ~/.bashrc && source ~/.bashrc
```

Дальше в инструкции — `dc`.

Администратор сайта:

```bash
dc exec web python manage.py createsuperuser
```

Проверка: откройте `https://<домен>/` — главная; `https://<домен>/admin/` — вход администратора.

## 5. Обновление (новые уроки, исправления)

```bash
cd ~/excellearn
git pull
dc up -d --build
```

Миграции, проверка уроков и (при включённой озвучке) озвучка новых шагов выполняются автоматически. Простой сайта — несколько секунд при перезапуске `web`.

## 6. Бэкапы

- **Автоматически** каждый день в 03:00 по Алматы — в папку `backups/` рядом с `docker-compose.yml`. Хранятся 14 дней, старые удаляются сами.
- **Вручную** (например, перед обновлением):

  ```bash
  dc exec backup sh /backup.sh
  ls -lh backups/
  ```

- **Восстановление** (заменяет все данные сайта содержимым дампа; спросит подтверждение):

  ```bash
  sh deploy/restore.sh backups/excellearn-2026-10-09_2200.dump
  ```

Бэкап и восстановление проверены: данные, изменённые после бэкапа, возвращаются к сохранённым значениям.

## 7. Повседневные задачи

| Задача | Команда |
|---|---|
| Логи сайта | `dc logs -f web` |
| Логи HTTPS / Caddy | `dc logs -f caddy` |
| Состояние сервисов | `dc ps` |
| Сброс пароля ученику (без почты) | Админка → Пользователи → ученик → «изменить пароль», или `dc exec web python manage.py changepassword email@ученика` |
| Пересобрать озвучку (после смены ключа или голоса) | `dc exec web python manage.py narration_build` |
| Прогресс учеников | Админка → «Прогресс уроков» (фильтры по уроку и завершённости) |
| Перезапуск | `dc restart web` |

## 8. Если что-то пошло не так

| Симптом | Что проверить |
|---|---|
| Браузер ругается на сертификат | DNS домена указывает на этот сервер? Порты 80/443 открыты? `dc logs caddy` |
| Ошибка 502 | `dc logs web` — обычно ошибка в `.env.production` или в уроке (`lessons_check` в логе) |
| Уроки без голоса | В логе `web` строка «ВНИМАНИЕ: озвучка не собрана» и причина; проверьте `TTS_API_KEY` |
| Сайт открывается, но «Bad Request (400)» | `SITE_DOMAIN` в `.env.production` совпадает с адресом в браузере? |

## 9. Проверка локально (Windows, Docker Desktop)

Тот же набор сервисов на своём компьютере, с адресом `https://localhost` и сертификатом Caddy:

```powershell
# .env.production с SITE_DOMAIN=localhost и TTS_PROVIDER=silent
docker compose --env-file .env.production up -d --build
# в Git Bash перед командами docker с путями вида /backups: export MSYS_NO_PATHCONV=1
docker compose --env-file .env.production down   # остановить (данные сохраняются в томах)
```
