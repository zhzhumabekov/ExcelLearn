# Развёртывание ExcelLearn на сервере во внутренней сети

Сайт работает в Docker: **PostgreSQL** (база), **web** (Django + Gunicorn), **Caddy** (HTTPS), **backup** (ежедневный бэкап базы). Всё описано в [docker-compose.yml](../docker-compose.yml). Сайт доступен только из локальной сети компании по внутреннему DNS-имени. Обновления ставятся сами после слияния PR в `main` (раздел 6).

> Персональные данные учеников (ФИО, email, телефон) по Закону РК № 94-V хранятся в Казахстане: сервер и бэкапы — в РК. Копируйте бэкапы только на носители и серверы, которые тоже находятся в РК.

## 1. Что нужно

**Виртуальная машина**

| Параметр | Минимум | Рекомендуется | Зачем |
|---|---|---|---|
| ОС | Ubuntu 24.04 LTS (server, без графики) | то же | |
| vCPU | 2 | 4 | образ собирается на этой же машине (Node + Python); сайт во время сборки не тормозит |
| RAM | 2 ГБ + 2 ГБ swap | 4 ГБ | PostgreSQL, Gunicorn (3 процесса), Caddy и сборка образа одновременно |
| Диск | 40 ГБ | 60 ГБ SSD | образы и кэш Docker (5–10 ГБ), база, бэкапы за 14 дней |
| IP | статический адрес в локальной сети | | на него указывает внутреннее DNS-имя |

**Сеть**

| | |
|---|---|
| Внутренний DNS | Запись **A**: имя сайта (например, `excellearn.company.kz`) → IP сервера. Не используйте зону `.local`: она конфликтует с mDNS |
| Входящие (из локальной сети) | 80, 443 — сайт; 22 — администратор |
| Исходящие (в интернет, HTTPS 443) | `github.com`, `*.githubusercontent.com`, `*.actions.githubusercontent.com` — код и агент GitHub Actions; `registry-1.docker.io`, `*.docker.io`, `ghcr.io` — образы Docker; `pypi.org`, `files.pythonhosted.org`, `registry.npmjs.org` — пакеты при сборке |
| Входящие из интернета | **не нужны**: агент GitHub Actions сам подключается к GitHub |
| Время | Синхронизация NTP включена (иначе не сходятся сертификаты) |

**Доступ к репозиторию**: приватный GitHub, deploy key (только чтение) — для `git fetch` на сервере.

## 2. Подготовка сервера (один раз)

```bash
# Docker и Compose — официальный скрипт
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # затем выйти и зайти по SSH заново

# Брандмауэр: только SSH и веб
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

Если в интернет выходят через прокси — пропишите его для Docker (`/etc/systemd/system/docker.service.d/http-proxy.conf`, переменные `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`), для git (`git config --global http.proxy …`) и для агента Actions (файл `.env` в папке агента, раздел 6).

Код (ключ — deploy key репозитория):

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
| `SITE_DOMAIN` | Внутреннее имя сайта, например `excellearn.company.kz` |
| `CADDY_TLS` | Сертификат HTTPS — раздел 4 |
| `SECURE_HSTS_SECONDS` | `0`, пока корневой сертификат не установлен на все компьютеры (раздел 4) |
| `DJANGO_SECRET_KEY` | Секретный ключ: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `POSTGRES_PASSWORD` | Пароль базы (сгенерируйте так же) |
| `SUPPORT_EMAIL` | Контакт администратора для учеников, забывших пароль (пока нет почты) |
| `EMAIL_*` | SMTP — корпоративный почтовый сервер, когда будет доступ; тогда сброс пароля пойдёт письмом |

`.env.production` не попадает в git — храните его копию в надёжном месте.

## 4. Сертификат HTTPS

Let's Encrypt во внутренней сети недоступен: ему нужен доступ к сайту из интернета. Два варианта — `CADDY_TLS` в `.env.production`:

**А. Корпоративный центр сертификации (лучше, если он есть).** Компьютеры уже доверяют ему, раздавать ничего не нужно. Попросите у ИТ сертификат на `SITE_DOMAIN` и положите на сервер:

```bash
mkdir -p deploy/certs
# site.crt — сертификат вместе с промежуточными (цепочка), site.key — ключ без пароля
chmod 600 deploy/certs/site.key
```

```ini
CADDY_TLS=/certs/site.crt /certs/site.key
```

Срок сертификата отслеживает ИТ; новый — заменить файлы и `dc restart caddy`. Папка `deploy/certs/` в git не попадает.

**Б. Свой центр сертификации Caddy** (`CADDY_TLS=internal`, по умолчанию). Caddy сам выпускает и продлевает сертификат, но браузеры доверяют ему, только если корневой сертификат Caddy установлен на компьютер. После первого запуска (раздел 5):

```bash
dc cp caddy:/data/caddy/pki/authorities/local/root.crt ./excellearn-root.crt
```

Файл `excellearn-root.crt` ИТ раздаёт на компьютеры групповой политикой: «Доверенные корневые центры сертификации» (Computer Configuration → Policies → Windows Settings → Security Settings → Public Key Policies → Trusted Root Certification Authorities). Firefox берёт сертификаты Windows, если включено `security.enterprise_roots.enabled` (по умолчанию включено).

Когда сертификат стоит на всех компьютерах — удалите строку `SECURE_HSTS_SECONDS=0` из `.env.production` и выполните `dc up -d`. До этого HSTS не включать: с ним браузер не даст открыть сайт с недоверенным сертификатом даже через «Всё равно перейти».

## 5. Первый запуск

```bash
docker compose --env-file .env.production up -d --build
```

При старте контейнер `web` сам применяет миграции базы и проверяет уроки. Первый запуск — 3–5 минут (сборка образа).

Чтобы не писать `--env-file` каждый раз:

```bash
echo "alias dc='docker compose --env-file .env.production'" >> ~/.bashrc && source ~/.bashrc
```

Дальше в инструкции — `dc`.

Администратор сайта:

```bash
dc exec web python manage.py createsuperuser
```

Проверка: откройте `https://<имя сайта>/` с рабочего компьютера — главная; `https://<имя сайта>/admin/` — вход администратора.

## 6. Обновление

### Автоматически (CD)

После слияния PR в `main` и зелёного CI (`checks`, `e2e`) GitHub запускает [.github/workflows/deploy.yml](../.github/workflows/deploy.yml). Сервер из интернета не виден, поэтому задание выполняет **агент GitHub Actions на самом сервере** (self-hosted runner): он сам держит исходящее соединение с GitHub и забирает задания. Агент переводит `~/excellearn` ровно на проверенный коммит и запускает [deploy/update.sh](../deploy/update.sh): бэкап базы → пересборка и перезапуск → проверка, что сайт отвечает (до 3 минут; иначе задание падает с журналом `web`) → удаление старых образов. Простой сайта — несколько секунд при перезапуске `web`.

Настройка (один раз):

1. **Окружение на GitHub.** Репозиторий → Settings → Environments → New environment `production`:
   - Deployment branches and tags → Selected branches → `main`;
   - по желанию **Required reviewers** — тогда каждое обновление ждёт кнопки «Approve» во вкладке Actions;
   - если код на сервере не в `~/excellearn` — переменная окружения `DEPLOY_DIR` с полным путём.
2. **Агент на сервере** — под тем же пользователем, у которого `~/excellearn` и который в группе `docker`. Репозиторий → Settings → Actions → Runners → New self-hosted runner → Linux x64: GitHub покажет команды с токеном. Выполните их, добавив метку и имя:

   ```bash
   mkdir ~/actions-runner && cd ~/actions-runner
   # curl … && tar xzf …   — скачать агента (команды со страницы GitHub)
   ./config.sh --url https://github.com/zhzhumabekov/ExcelLearn --token <токен> \
     --labels excellearn --name excellearn-prod --unattended
   sudo ./svc.sh install $USER   # служба: агент стартует вместе с сервером
   sudo ./svc.sh start
   ```

   На странице Runners агент должен быть **Idle**. Прокси для агента — строки `https_proxy=…` и `no_proxy=…` в `~/actions-runner/.env`, затем `sudo ./svc.sh stop && sudo ./svc.sh start`.
3. **Проверка.** Actions → Deploy → Run workflow (ветка `main`) — обновление вручную, без нового PR.

Агент берёт задания только этого репозитория, а workflow запускает деплой лишь для проверенных коммитов `main` (не для PR).

### Вручную

```bash
cd ~/excellearn
git pull
sh deploy/update.sh
```

## 7. Бэкапы

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

Бэкапы лежат на том же диске, что и база: если откажет диск ВМ, пропадёт и то и другое. Настройте снимки ВМ средствами гипервизора или копирование папки `backups/` на другой сервер в локальной сети. Не удаляйте тома командой `dc down -v`: в томе `caddy_data` лежит корневой сертификат Caddy (раздел 4), без него сертификат придётся заново раздавать на все компьютеры.

## 8. Повседневные задачи

| Задача | Команда |
|---|---|
| Логи сайта | `dc logs -f web` |
| Логи HTTPS / Caddy | `dc logs -f caddy` |
| Состояние сервисов | `dc ps` |
| Сброс пароля ученику (без почты) | Админка → Пользователи → ученик → «изменить пароль», или `dc exec web python manage.py changepassword email@ученика` |
| Прогресс учеников | Админка → «Прогресс уроков» (фильтры по уроку и завершённости) |
| Перезапуск | `dc restart web` |

## 9. Если что-то пошло не так

| Симптом | Что проверить |
|---|---|
| Браузер ругается на сертификат | Корневой сертификат установлен на этот компьютер (раздел 4)? Имя в адресной строке совпадает с `SITE_DOMAIN`? `dc logs caddy` |
| Сайт не открывается по имени | Запись во внутреннем DNS указывает на сервер (`nslookup <имя>`)? Порты 80/443 открыты? |
| Деплой висит в «Waiting for a runner» | Агент на сервере запущен? `sudo ~/actions-runner/svc.sh status`; на GitHub: Settings → Actions → Runners — статус Idle |
| Деплой упал на «Проверка https://…» | В выводе задания — последние строки журнала `web`; дальше как при ошибке 502 |
| Ошибка 502 | `dc logs web` — обычно ошибка в `.env.production` или в уроке (`lessons_check` в логе) |
| Сайт открывается, но «Bad Request (400)» | `SITE_DOMAIN` в `.env.production` совпадает с адресом в браузере? |

## 10. Проверка локально (Windows, Docker Desktop)

Тот же набор сервисов на своём компьютере, с адресом `https://localhost` и сертификатом Caddy:

```powershell
# .env.production с SITE_DOMAIN=localhost
docker compose --env-file .env.production up -d --build
# в Git Bash перед командами docker с путями вида /backups: export MSYS_NO_PATHCONV=1
docker compose --env-file .env.production down   # остановить (данные сохраняются в томах)
```
