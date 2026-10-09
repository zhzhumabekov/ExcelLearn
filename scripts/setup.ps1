# Установка ExcelLearn для разработки — Windows 10/11.
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1          # всё для запуска сайта
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -Admin   # + создать администратора
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -E2E     # + проверить браузер для e2e-тестов
#
# Повторный запуск безопасен: уже установленное пропускается, .env и db.sqlite3 не перезаписываются.
param(
    [switch]$Admin,
    [switch]$E2E
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Green }
function Note($text) { Write-Host "    $text" }
function Has($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function Major($name) {
    $v = & $name --version 2>$null
    if ($v -match "(\d+)") { [int]$Matches[1] } else { 0 }
}
function Refresh-Path {
    # После установки программ новый PATH виден только новым окнам — подхватываем его здесь
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user;$env:USERPROFILE\.local\bin;$env:APPDATA\npm"
}
function Run($exe) {
    # Внешняя программа: при ошибке — остановить установку
    & $exe @args
    if ($LASTEXITCODE -ne 0) { throw "Команда завершилась с ошибкой: $exe $args" }
}

Refresh-Path

# ---------- 1. uv (менеджер Python; сам скачает Python 3.12) ----------
Step "uv и Python"
if (Has "uv") {
    Note "uv уже есть: $(uv --version)"
} else {
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    Refresh-Path
}

# ---------- 2. Node.js 24+ ----------
Step "Node.js 24+"
if ((Has "node") -and ((Major "node") -ge 24)) {
    Note "Node.js уже есть: $(node --version)"
} else {
    if (-not (Has "winget")) {
        throw "Нет winget. Установите Node.js 24 LTS вручную с https://nodejs.org и запустите скрипт снова."
    }
    Run winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    Refresh-Path
    if ((Major "node") -lt 24) { throw "Нужен Node.js 24 или новее, установлен $(node --version)." }
    Note "Node.js: $(node --version)"
}

# ---------- 3. pnpm 10 ----------
Step "pnpm 10"
if ((Has "pnpm") -and ((Major "pnpm") -eq 10)) {
    Note "pnpm уже есть: $(pnpm --version)"
} else {
    Run npm install -g pnpm@10
    Refresh-Path
    Note "pnpm: $(pnpm --version)"
}

# ---------- 4. Зависимости ----------
Step "Зависимости Python (uv sync)"
Run uv sync

Step "Зависимости сайта и плеера (pnpm install)"
Run pnpm install --frozen-lockfile
Run pnpm --dir player install --frozen-lockfile

# ---------- 5. Сборка ----------
Step "Сборка плеера и стилей сайта"
Run pnpm --dir player build
Run pnpm css

# ---------- 6. Настройки ----------
Step "Файл настроек .env"
if (Test-Path .env) {
    Note ".env уже есть — не трогаю"
} else {
    $code = @'
import secrets
from pathlib import Path

text = Path(".env.example").read_text(encoding="utf-8")
text = text.replace("DJANGO_SECRET_KEY=change-me", f"DJANGO_SECRET_KEY={secrets.token_urlsafe(50)}")
Path(".env").write_text(text, encoding="utf-8")
'@
    Run uv run python -c $code
    Note "создан из .env.example со случайным секретным ключом"
}

# ---------- 7. База и проверка контента ----------
Step "База данных (миграции) и проверка уроков"
Run uv run python manage.py migrate --noinput
Run uv run python manage.py lessons_check

# ---------- 8. По желанию ----------
if ($E2E) {
    Step "Браузер для e2e-тестов"
    $edge = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($edge) {
        Note "e2e-тесты используют установленный Microsoft Edge: $edge"
    } else {
        Run uv run playwright install chromium
        Note "Edge не найден — установлен Chromium. Запуск: `$env:E2E_BROWSER_CHANNEL='chromium'; uv run pytest e2e"
    }
}

if ($Admin) {
    Step "Администратор сайта"
    Run uv run python manage.py createsuperuser
}

Step "Готово"
Note "Запуск сайта:"
Note "  uv run python manage.py runserver"
Note "Откройте http://127.0.0.1:8000/"
Note ""
Note "Администратор (если ещё нет): uv run python manage.py createsuperuser"
Note "Админка: http://127.0.0.1:8000/admin/"
Note "Если команда uv не находится — откройте новое окно терминала (PATH обновится)."
