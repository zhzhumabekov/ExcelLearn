# Развёртывание ExcelLearn на сервере во внутренней сети

Пошаговая установка с чистой виртуальной машины до сайта, который сам обновляется после слияния PR в `main`. Команды выполняются по порядку; всё, что в `<угловых скобках>`, заменить своим.

Сайт работает в Docker: **PostgreSQL** (база), **web** (Django + Gunicorn), **Caddy** (HTTPS), **backup** (ежедневный бэкап базы) — [docker-compose.yml](../docker-compose.yml). Сайт доступен только из локальной сети компании по внутреннему DNS-имени. Обновления ставит агент GitHub Actions на самом сервере (шаг 10).

> Персональные данные учеников (ФИО, email, телефон) по Закону РК № 94-V хранятся в Казахстане: сервер и бэкапы — в РК. Копируйте бэкапы только на носители и серверы, которые тоже находятся в РК.

## 0. Что подготовить заранее

**Виртуальная машина**

| Параметр | Минимум | Рекомендуется | Зачем |
|---|---|---|---|
| ОС | Ubuntu 24.04 LTS (server, без графики) | то же | |
| vCPU | 2 | 4 | образ собирается на этой же машине (Node + Python); сайт во время сборки не тормозит |
| RAM | 2 ГБ + 2 ГБ swap | 4 ГБ | PostgreSQL, Gunicorn (3 процесса), Caddy и сборка образа одновременно |
| Диск | 40 ГБ | 60 ГБ SSD | образы и кэш Docker (5–10 ГБ), база, бэкапы за 14 дней |
| IP | статический адрес в локальной сети | | на него указывает внутреннее DNS-имя |

**Сеть** (попросить у ИТ)

| | |
|---|---|
| Внутренний DNS | Запись **A**: имя сайта (например, `excellearn.company.kz`) → IP сервера. Не используйте зону `.local`: она конфликтует с mDNS |
| Входящие (из локальной сети) | 80, 443 — сайт; 22 — администратор |
| Исходящие (в интернет, HTTPS 443) | `github.com`, `*.githubusercontent.com`, `*.actions.githubusercontent.com` — код и агент GitHub Actions; `registry-1.docker.io`, `*.docker.io`, `ghcr.io` — образы Docker; `download.docker.com` — установка Docker; `pypi.org`, `files.pythonhosted.org`, `registry.npmjs.org` — пакеты при сборке |
| Исходящий SSH | `github.com:22` — для `git fetch`; если закрыт, подойдёт `ssh.github.com:443` (шаг 5) |
| Входящие из интернета | **не нужны** |
| Прокси | Если выход в интернет только через прокси — узнать адрес (шаг 3) |

**Сертификат HTTPS** — решить заранее (подробно — шаг 7): сертификат от корпоративного центра сертификации (ЦС) на имя сайта или собственный ЦС Caddy, корневой сертификат которого ИТ раздаст на компьютеры.

**GitHub**: права администратора репозитория `zhzhumabekov/ExcelLearn` (для deploy key, агента и окружения).

## 1. Пользователь и базовая настройка

Зайти на сервер по SSH пользователем, которого создали при установке Ubuntu, и завести отдельного пользователя для сайта:

```bash
sudo adduser excellearn              # задать пароль
sudo usermod -aG sudo excellearn     # права администратора — для установки
sudo su - excellearn                 # дальше всё — от него
```

Обновление системы, часовой пояс, время:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl nano
sudo timedatectl set-timezone Asia/Almaty
timedatectl                          # «System clock synchronized: yes»
```

Если время не синхронизировано и в сети свой NTP-сервер: в `/etc/systemd/timesyncd.conf` строка `NTP=<адрес NTP>`, затем `sudo systemctl restart systemd-timesyncd`.

Swap 2 ГБ — нужен, если RAM меньше 4 ГБ (без него сборка образа может упасть по нехватке памяти):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                              # строка Swap: 2.0Gi
```

## 2. Брандмауэр

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
sudo ufw status                      # 22, 80, 443 — ALLOW
```

## 3. Прокси (только если выход в интернет через прокси)

Пропустить, если интернет прямой. Адрес — `http://proxy.company.kz:3128` для примера.

```bash
PROXY=http://<прокси>:<порт>
NOPROXY=localhost,127.0.0.1,.company.kz

# Для текущей сессии и всех будущих (curl, git по HTTPS)
echo "http_proxy=$PROXY
https_proxy=$PROXY
no_proxy=$NOPROXY
HTTP_PROXY=$PROXY
HTTPS_PROXY=$PROXY
NO_PROXY=$NOPROXY" | sudo tee -a /etc/environment
export http_proxy=$PROXY https_proxy=$PROXY no_proxy=$NOPROXY

# apt
echo "Acquire::http::Proxy \"$PROXY\";
Acquire::https::Proxy \"$PROXY\";" | sudo tee /etc/apt/apt.conf.d/95proxy
```

Прокси для Docker настраивается после его установки (конец шага 4).

## 4. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker excellearn
exit                                 # выйти и зайти снова, чтобы группа docker применилась
sudo su - excellearn
docker run --rm hello-world          # «Hello from Docker!»
docker compose version               # v2.x
```

С прокси — Docker тоже должен о нём знать (скачивание образов и пакеты при сборке):

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
echo "[Service]
Environment=\"HTTP_PROXY=$PROXY\" \"HTTPS_PROXY=$PROXY\" \"NO_PROXY=$NOPROXY\"" \
  | sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf
sudo systemctl daemon-reload && sudo systemctl restart docker

# прокси внутри сборки образа (pip, npm)
mkdir -p ~/.docker
echo "{\"proxies\": {\"default\": {\"httpProxy\": \"$PROXY\", \"httpsProxy\": \"$PROXY\", \"noProxy\": \"$NOPROXY\"}}}" \
  > ~/.docker/config.json
docker run --rm hello-world
```

## 5. Код с GitHub (deploy key)

Ключ, по которому сервер читает приватный репозиторий (только чтение):

```bash
ssh-keygen -t ed25519 -C "excellearn-server" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

GitHub → репозиторий → **Settings → Deploy keys → Add deploy key**: Title `excellearn-server`, Key — вывод `cat` выше, **Allow write access — не ставить**.

Проверка:

```bash
ssh -T git@github.com
# «Hi zhzhumabekov/ExcelLearn! You've successfully authenticated…» — ответить yes на вопрос об отпечатке
```

Если зависает — порт 22 наружу закрыт; SSH к GitHub идёт через 443:

```bash
printf 'Host github.com\n  Hostname ssh.github.com\n  Port 443\n  User git\n' >> ~/.ssh/config
ssh -T git@github.com
```

> Если наружу открыт только HTTP-прокси и SSH не проходит никак: GitHub → Settings (профиля) → Developer settings → Fine-grained tokens — токен только на этот репозиторий, Contents: Read-only. Клонировать `https://github.com/zhzhumabekov/ExcelLearn.git`, после `git config --global credential.helper store` при первом запросе ввести логин и токен вместо пароля.

Клонирование:

```bash
git clone git@github.com:zhzhumabekov/ExcelLearn.git ~/excellearn
cd ~/excellearn
```

## 6. Настройки сайта

```bash
cd ~/excellearn
cp deploy/.env.production.example .env.production
chmod 600 .env.production

# сгенерировать два секрета — скопировать в файл
python3 -c "import secrets; print('DJANGO_SECRET_KEY=' + secrets.token_urlsafe(50))"
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(32))"

nano .env.production                 # сохранить: Ctrl+O, Enter; выйти: Ctrl+X
```

| Переменная | Что вписать |
|---|---|
| `SITE_DOMAIN` | Внутреннее имя сайта, например `excellearn.company.kz` (то же, что в DNS) |
| `CADDY_TLS` | `internal` или путь к сертификату — шаг 7 |
| `SECURE_HSTS_SECONDS` | Оставить `0`, пока сайт не открывается без предупреждений на всех компьютерах (шаг 9) |
| `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD` | Сгенерированные выше. **Пароль базы после первого запуска не менять** — база создаётся с ним |
| `SUPPORT_EMAIL` | Контакт администратора для учеников, забывших пароль |
| `EMAIL_*` | SMTP корпоративной почты — когда будет доступ; тогда сброс пароля пойдёт письмом |

Копию `.env.production` сохранить в надёжном месте (в git он не попадает).

Проверка, что DNS уже работает (с сервера и с рабочего компьютера):

```bash
getent hosts <имя сайта>             # IP этого сервера
```

## 7. Сертификат HTTPS

Let's Encrypt во внутренней сети недоступен: ему нужен доступ к сайту из интернета. Выбрать один вариант.

**А. Сертификат корпоративного ЦС** — лучше, если ЦС есть: компьютеры уже ему доверяют. Попросить у ИТ сертификат на имя сайта: файл сертификата **с цепочкой** (сам сертификат + промежуточные, PEM) и ключ **без пароля**.

```bash
mkdir -p ~/excellearn/deploy/certs
# скопировать файлы с рабочего компьютера (PowerShell):
#   scp site.crt site.key excellearn@<IP сервера>:~/excellearn/deploy/certs/
chmod 600 ~/excellearn/deploy/certs/site.key
```

В `.env.production`:

```ini
CADDY_TLS=/certs/site.crt /certs/site.key
```

Срок сертификата отслеживает ИТ; новый — заменить файлы и `dc restart caddy`. Папка `deploy/certs/` в git не попадает.

**Б. Собственный ЦС Caddy** — `CADDY_TLS=internal` (по умолчанию). Caddy сам выпускает и продлевает сертификат; корневой сертификат после первого запуска раздаётся на компьютеры (шаг 9).

## 8. Первый запуск

```bash
cd ~/excellearn
docker compose --env-file .env.production up -d --build     # 3–5 минут: сборка образа

# короткая команда вместо «docker compose --env-file .env.production»
echo "alias dc='docker compose --env-file .env.production'" >> ~/.bashrc && source ~/.bashrc

dc ps                                # db, web, caddy, backup — Up (db — healthy)
dc logs --tail 30 web                # миграции, проверка уроков, «Booting worker»
```

При старте `web` сам применяет миграции базы и проверяет уроки.

Проверка с сервера (`-k` — сертификат на самом сервере может быть ещё не доверенным):

```bash
curl -k -o /dev/null -w '%{http_code}\n' https://<имя сайта>/   # 200
```

Администратор сайта:

```bash
dc exec web python manage.py createsuperuser
```

## 9. Сертификат на компьютерах (только вариант Б)

Достать корневой сертификат Caddy:

```bash
cd ~/excellearn
dc cp caddy:/data/caddy/pki/authorities/local/root.crt ./excellearn-root.crt
```

Забрать его на свой компьютер (PowerShell): `scp excellearn@<IP сервера>:~/excellearn/excellearn-root.crt .`

- **Проверить на одном компьютере**: PowerShell от администратора — `certutil -addstore -f Root excellearn-root.crt`, перезапустить браузер, открыть `https://<имя сайта>/` — без предупреждений.
- **На все компьютеры** — ИТ через групповую политику: Computer Configuration → Policies → Windows Settings → Security Settings → Public Key Policies → **Trusted Root Certification Authorities** → Import → `excellearn-root.crt`. Chrome и Edge берут сертификаты Windows; Firefox тоже (`security.enterprise_roots.enabled`, включено по умолчанию).

Корневой сертификат действует 10 лет и хранится в томе `caddy_data`. Не удаляйте тома (`dc down -v`): иначе Caddy создаст новый ЦС и сертификат придётся раздавать заново.

**HSTS** — когда сайт открывается без предупреждений на всех компьютерах (вариант Б) или сразу (вариант А): удалить строку `SECURE_HSTS_SECONDS=0` из `.env.production`, затем `dc up -d`. Раньше не включать: с HSTS браузер не даст открыть сайт с недоверенным сертификатом даже через «Всё равно перейти».

## 10. Агент GitHub Actions (автообновление)

После слияния PR в `main` и зелёного CI (`checks`, `e2e`) GitHub запускает [.github/workflows/deploy.yml](../.github/workflows/deploy.yml). Сервер из интернета не виден, поэтому задание выполняет **агент на самом сервере** (self-hosted runner): он сам держит исходящее соединение с GitHub и забирает задания. Агент переводит `~/excellearn` ровно на проверенный коммит и запускает [deploy/update.sh](../deploy/update.sh): бэкап базы → пересборка и перезапуск → проверка, что сайт отвечает (до 3 минут; иначе задание падает с журналом `web`) → удаление старых образов. Простой сайта — несколько секунд.

**10.1. Токен.** GitHub → репозиторий → **Settings → Actions → Runners → New self-hosted runner** → Linux, x64. Страница покажет команды с точной версией агента и одноразовым токеном (действует час).

**10.2. Установка** — от пользователя `excellearn` (не root):

```bash
mkdir ~/actions-runner && cd ~/actions-runner

# две команды со страницы GitHub — скачать и распаковать (версия там актуальная):
#   curl -o actions-runner-linux-x64-<версия>.tar.gz -L https://github.com/actions/runner/releases/download/...
#   tar xzf ./actions-runner-linux-x64-<версия>.tar.gz

sudo ./bin/installdependencies.sh

# метка excellearn обязательна — по ней deploy.yml находит этот сервер
./config.sh --url https://github.com/zhzhumabekov/ExcelLearn --token <токен со страницы> \
  --name excellearn-prod --labels excellearn --unattended
```

С прокси — агенту нужен свой файл настроек:

```bash
printf 'https_proxy=%s\nhttp_proxy=%s\nno_proxy=%s\n' "$PROXY" "$PROXY" "$NOPROXY" > ~/actions-runner/.env
```

**10.3. Служба** — агент работает постоянно и стартует вместе с сервером (`./run.sh` со страницы GitHub не нужен: он живёт, пока открыт SSH):

```bash
cd ~/actions-runner
sudo ./svc.sh install excellearn
sudo ./svc.sh start
sudo ./svc.sh status                 # active (running)
```

GitHub → Settings → Actions → Runners: `excellearn-prod` — **Idle**, метки `self-hosted`, `Linux`, `X64`, `excellearn`.

**10.4. Окружение `production`.** GitHub → **Settings → Environments → New environment** → `production`:

- **Deployment branches and tags** → Selected branches and tags → Add rule → `main`;
- по желанию **Required reviewers** (себя) — тогда каждое обновление ждёт кнопки «Approve» во вкладке Actions;
- если код на сервере не в `/home/excellearn/excellearn` — **Environment variables** → `DEPLOY_DIR` = полный путь.

**10.5. Проверка.** GitHub → **Actions → Deploy → Run workflow** (ветка `main`). Задание должно пройти зелёным; в выводе — `Бэкап базы`, `Сборка и перезапуск`, `Сайт отвечает`, `Готово`. Дальше обновления идут сами после каждого слияния в `main`.

Агент берёт задания только этого репозитория, а workflow запускает деплой лишь для проверенных коммитов `main` (не для PR). Обновлять агент не нужно — он обновляется сам.

| Агент | Команда |
|---|---|
| Состояние | `sudo ~/actions-runner/svc.sh status` |
| Журнал | `journalctl -u 'actions.runner.*' -f` |
| Перезапуск (например, после правки `.env`) | `cd ~/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh start` |
| Удалить | `cd ~/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall && ./config.sh remove --token <токен>` (токен — GitHub → Runners → агент → Remove) |

**Обновление вручную** (без GitHub Actions):

```bash
cd ~/excellearn
git pull
sh deploy/update.sh
```

## 11. Бэкапы

- **Автоматически** каждый день в 03:00 по Алматы — в `~/excellearn/backups/`. Хранятся 14 дней, старые удаляются сами. Перед каждым автообновлением — ещё один бэкап.
- **Вручную**:

  ```bash
  dc exec backup sh /backup.sh
  ls -lh backups/
  ```

- **Восстановление** (заменяет все данные сайта содержимым дампа; спросит подтверждение):

  ```bash
  sh deploy/restore.sh backups/excellearn-2026-10-09_2200.dump
  ```

Бэкап и восстановление проверены: данные, изменённые после бэкапа, возвращаются к сохранённым значениям.

**Копия на другой машине.** Бэкапы лежат на том же диске, что и база: если откажет диск ВМ, пропадёт и то и другое. Нужно хотя бы одно: снимки ВМ средствами гипервизора (попросить ИТ) или копирование на другой сервер в локальной сети:

```bash
# ключ ~/.ssh/id_ed25519.pub добавить в authorized_keys пользователя на сервере бэкапов, затем:
(crontab -l 2>/dev/null; echo '30 3 * * * rsync -a ~/excellearn/backups/ <пользователь>@<сервер бэкапов>:/srv/excellearn-backups/') | crontab -
```

Сохраните отдельно и `.env.production`: без `POSTGRES_PASSWORD` и `DJANGO_SECRET_KEY` восстановленная база на новом сервере не заработает как прежде.

## 12. Повседневные задачи

| Задача | Команда |
|---|---|
| Логи сайта | `dc logs -f web` |
| Логи HTTPS / Caddy | `dc logs -f caddy` |
| Состояние сервисов | `dc ps` |
| Сброс пароля ученику (без почты) | Админка → Пользователи → ученик → «изменить пароль», или `dc exec web python manage.py changepassword email@ученика` |
| Прогресс учеников | Админка → «Прогресс уроков» (фильтры по уроку и завершённости) |
| Перезапуск | `dc restart web` |
| Место на диске | `df -h /` и `docker system df` |

## 13. Если что-то пошло не так

| Симптом | Что проверить |
|---|---|
| Браузер ругается на сертификат | Корневой сертификат установлен на этот компьютер (шаг 9)? Имя в адресной строке совпадает с `SITE_DOMAIN`? `dc logs caddy` |
| Сайт не открывается по имени | `nslookup <имя сайта>` с компьютера — IP сервера? Порты 80/443 открыты (`sudo ufw status`)? |
| Ошибка 502 | `dc logs web` — обычно ошибка в `.env.production` или в уроке (`lessons_check` в логе) |
| Сайт открывается, но «Bad Request (400)» | `SITE_DOMAIN` в `.env.production` совпадает с адресом в браузере? |
| Сборка падает на скачивании пакетов | Исходящий доступ к адресам из шага 0; прокси для Docker (шаг 4) |
| `git fetch` / `ssh -T git@github.com` зависает | SSH через 443 (шаг 5) |
| Деплой висит в «Waiting for a runner» | `sudo ~/actions-runner/svc.sh status`; на GitHub: Settings → Actions → Runners — Idle? |
| Деплой ждёт «Review deployments» | Включены Required reviewers (шаг 10.4) — нажать Approve во вкладке Actions |
| Деплой упал на «Проверка https://…» | В выводе задания — последние строки журнала `web`; дальше как при ошибке 502 |

## 14. Проверка локально (Windows, Docker Desktop)

Тот же набор сервисов на своём компьютере, с адресом `https://localhost` и сертификатом Caddy:

```powershell
# .env.production с SITE_DOMAIN=localhost
docker compose --env-file .env.production up -d --build
# в Git Bash перед командами docker с путями вида /backups: export MSYS_NO_PATHCONV=1
docker compose --env-file .env.production down   # остановить (данные сохраняются в томах)
```
