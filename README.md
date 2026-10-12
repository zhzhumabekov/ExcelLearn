# ExcelLearn

Анимированный курс Excel для сотрудников компаний Казахстана. В каждом уроке — окно Excel, в котором курсор сам
щёлкает по ячейкам, набирает формулы, открывает меню и окна, а рядом идёт объяснение шага. Программа курса — по
книге У. Уинстона «Microsoft Excel: анализ данных и бизнес-моделирование», примеры свои: тенге, города и филиалы
Казахстана. К урокам и заданиям можно скачать файлы Excel (задание и решение для проверки).

Сайт — Django; плеер уроков — TypeScript; уроки и задания — YAML-файлы в `content/`.

## Установка

Нужны только **git**, интернет и доступ к репозиторию (он приватный). Всё остальное (Python 3.12 через uv, Node.js 24, pnpm 10, зависимости, сборка)
ставит скрипт установки. Его можно запускать повторно: уже установленное пропускается, `.env` и база
`db.sqlite3` не перезаписываются.

### Windows 10/11

В PowerShell:

```powershell
git clone https://github.com/zhzhumabekov/ExcelLearn.git
cd ExcelLearn
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -Admin
```

Node.js ставится через `winget` (есть в Windows 10/11; если нет — поставьте Node.js 24 LTS с
[nodejs.org](https://nodejs.org) и запустите скрипт снова). После установки откройте **новое** окно терминала,
чтобы команды `uv` и `pnpm` находились без полного пути.

### Linux и macOS

Нужен `curl` (Ubuntu/Debian: `sudo apt install curl git`). В терминале:

```bash
git clone https://github.com/zhzhumabekov/ExcelLearn.git
cd ExcelLearn
bash scripts/setup.sh --admin
```

Всё ставится в домашнюю папку, `sudo` не нужен: uv — в `~/.local/bin`, Node.js — через nvm (если подходящего ещё
нет), pnpm — в `~/.local`. Проверено на чистой Ubuntu 24.04.

### Параметры скрипта

| Windows | Linux / macOS | Что делает |
|---|---|---|
| `-Admin` | `--admin` | создать администратора сайта (спросит email и пароль) |
| `-E2E` | `--e2e` | подготовить браузер для e2e-тестов (Windows — установленный Edge, Linux — Chromium) |

### Что делает скрипт

1. Ставит **uv** (он же скачает Python 3.12), **Node.js 24+** и **pnpm 10**, если их нет.
2. Ставит зависимости: `uv sync`, `pnpm install` (сайт и плеер).
3. Собирает плеер (`static/player/`) и стили сайта (`static/css/site.css`).
4. Создаёт `.env` из `.env.example` со случайным `DJANGO_SECRET_KEY` — если `.env` ещё нет.
5. Применяет миграции базы и проверяет уроки (`lessons_check`).

## Запуск

```bash
uv run python manage.py runserver
```

Откройте <http://127.0.0.1:8000/>. Админка — <http://127.0.0.1:8000/admin/>; администратора можно создать
позже: `uv run python manage.py createsuperuser`.

Если меняли код плеера или стили — пересоберите:

```bash
pnpm --dir player build     # плеер (или pnpm --dir player dev — пересборка на лету)
pnpm css                    # стили сайта (или pnpm css:watch)
```

## Проверки

```bash
uv run python manage.py lessons_check                                    # схема уроков и заданий
pnpm --dir player lessons:verify                                         # числа в уроках
uv run python manage.py exercises_dump | pnpm --dir player exercises:verify  # ответы заданий
pnpm --dir player typecheck && pnpm --dir player lint && pnpm --dir player test
uv run ruff check . && uv run pytest
uv run pytest e2e        # в браузере; на Linux: E2E_BROWSER_CHANNEL=chromium uv run pytest e2e
```

## Сервер

Развёртывание на сервере во внутренней сети (Docker Compose: Django, PostgreSQL, Caddy с HTTPS, ежедневные бэкапы, автообновление после слияния в main) —
[docs/deploy.md](docs/deploy.md).

## Где что лежит

| Путь | Что там |
|---|---|
| `content/course.yaml` | главы курса |
| `content/lessons/` | уроки (YAML): лист, шаги, действия, ответы |
| `content/exercises/` | задания к главам и их решения |
| `content/sources/` | разбор каждой главы: что взято из книги, что своё, что проверено |
| `player/` | плеер уроков (TypeScript): модель листа, формулы, анимация |
| `apps/` | Django: каталог, аккаунты, прогресс, настройки, юридические страницы |
| `lessons/` | схема уроков, загрузка, файлы Excel для скачивания |
| `SPEC.md` | спецификация и принятые решения |
| `CLAUDE.md` | правила работы над курсом |
