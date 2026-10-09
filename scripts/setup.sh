#!/usr/bin/env bash
# Установка ExcelLearn для разработки — Linux и macOS.
#
#   bash scripts/setup.sh            # всё необходимое для запуска сайта
#   bash scripts/setup.sh --admin    # + создать администратора (спросит email и пароль)
#   bash scripts/setup.sh --e2e      # + браузер Chromium для e2e-тестов
#
# Повторный запуск безопасен: уже установленное пропускается, .env и db.sqlite3 не перезаписываются.
set -euo pipefail

cd "$(dirname "$0")/.."

WITH_ADMIN=0
WITH_E2E=0
for arg in "$@"; do
  case "$arg" in
    --admin) WITH_ADMIN=1 ;;
    --e2e) WITH_E2E=1 ;;
    -h | --help)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Неизвестный параметр: $arg (см. --help)" >&2
      exit 1
      ;;
  esac
done

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }
major() { "$1" --version 2>/dev/null | sed -E 's/[^0-9]*([0-9]+).*/\1/' | head -n1; }

if ! has curl; then
  echo "Нужен curl. Установите его (Ubuntu/Debian: sudo apt install curl) и запустите скрипт снова." >&2
  exit 1
fi

# ---------- 1. uv (менеджер Python; сам скачает Python 3.12) ----------
step "uv и Python"
export PATH="$HOME/.local/bin:$PATH"
if has uv; then
  note "uv уже есть: $(uv --version)"
else
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# ---------- 2. Node.js 24+ ----------
step "Node.js 24+"
if has node && [ "$(major node)" -ge 24 ]; then
  note "Node.js уже есть: $(node --version)"
else
  # nvm ставит Node в домашнюю папку — без sudo
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 24
  nvm use 24 >/dev/null
  note "Node.js: $(node --version) (через nvm; в новом терминале он подключится автоматически)"
fi

# ---------- 3. pnpm 10 ----------
step "pnpm 10"
if has pnpm && [ "$(major pnpm)" -eq 10 ]; then
  note "pnpm уже есть: $(pnpm --version)"
else
  # В домашнюю папку — без sudo
  npm install -g pnpm@10 --prefix "$HOME/.local"
  export PATH="$HOME/.local/bin:$PATH"
  note "pnpm: $(pnpm --version)"
fi

# ---------- 4. Зависимости ----------
step "Зависимости Python (uv sync)"
uv sync

step "Зависимости сайта и плеера (pnpm install)"
pnpm install --frozen-lockfile
pnpm --dir player install --frozen-lockfile

# ---------- 5. Сборка ----------
step "Сборка плеера и стилей сайта"
pnpm --dir player build
pnpm css

# ---------- 6. Настройки ----------
step "Файл настроек .env"
if [ -f .env ]; then
  note ".env уже есть — не трогаю"
else
  uv run python - <<'PY'
import secrets
from pathlib import Path

text = Path(".env.example").read_text(encoding="utf-8")
text = text.replace("DJANGO_SECRET_KEY=change-me", f"DJANGO_SECRET_KEY={secrets.token_urlsafe(50)}")
Path(".env").write_text(text, encoding="utf-8")
PY
  note "создан из .env.example со случайным секретным ключом"
fi

# ---------- 7. База и проверка контента ----------
step "База данных (миграции) и проверка уроков"
uv run python manage.py migrate --noinput
uv run python manage.py lessons_check

# ---------- 8. По желанию ----------
if [ "$WITH_E2E" -eq 1 ]; then
  step "Браузер для e2e-тестов (Playwright Chromium)"
  uv run playwright install chromium
  note "Системные библиотеки браузера, если тесты на них ругаются: sudo \"\$(command -v uv)\" run playwright install-deps chromium"
  note "Запуск e2e на Linux: E2E_BROWSER_CHANNEL=chromium uv run pytest e2e"
fi

if [ "$WITH_ADMIN" -eq 1 ]; then
  step "Администратор сайта"
  uv run python manage.py createsuperuser
fi

step "Готово"
cat <<'TXT'
    Запуск сайта:
      uv run python manage.py runserver
    Откройте http://127.0.0.1:8000/

    Администратор (если ещё нет): uv run python manage.py createsuperuser
    Админка: http://127.0.0.1:8000/admin/
TXT
