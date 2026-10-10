# Все проверки проекта (см. CLAUDE.md) с кратким выводом: «OK <шаг>» или хвост вывода упавшего шага.
# Запуск из корня репозитория:
#   powershell -File scripts/check.ps1              # всё, включая полный e2e (~5 мин)
#   powershell -File scripts/check.ps1 -NoE2E       # без e2e
#   powershell -File scripts/check.ps1 -E2E 06-03   # e2e только уроков, подходящих под -k
param(
    [switch]$NoE2E,
    [string]$E2E = "",
    [int]$Tail = 40
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$e2eCmd = "uv run pytest e2e -q"
if ($E2E) { $e2eCmd = "uv run pytest e2e/test_lessons_play.py -q -k `"$E2E`"" }

# Команды выполняет cmd.exe: конвейер dump | verify передаёт байты как есть (PowerShell 5.1 перекодировал бы UTF-8)
$steps = @(
    @("ruff check", "uv run ruff check ."),
    @("ruff format", "uv run ruff format --check ."),
    @("lessons_check", "uv run python manage.py lessons_check"),
    @("lessons:verify", "pnpm --dir player lessons:verify"),
    @("exercises:verify", "uv run python manage.py exercises_dump | pnpm --dir player exercises:verify"),
    @("theory:verify", "uv run python manage.py theory_dump | pnpm --dir player theory:verify"),
    @("typecheck", "pnpm --dir player typecheck"),
    @("lint", "pnpm --dir player lint"),
    @("vitest", "pnpm --dir player test"),
    @("pytest", "uv run pytest -q")
)
if (-not $NoE2E) {
    $steps += , @("build", "pnpm --dir player build")
    $steps += , @("e2e", $e2eCmd)
}

$log = Join-Path $env:TEMP "excellearn-check.log"
$failed = @()
foreach ($step in $steps) {
    $name, $cmd = $step
    $start = Get-Date
    cmd /c "$cmd > `"$log`" 2>&1"
    $code = $LASTEXITCODE
    $secs = [int]((Get-Date) - $start).TotalSeconds
    if ($code -eq 0) {
        Write-Output "OK   $name (${secs}s)"
    } else {
        $failed += $name
        Write-Output "FAIL $name (${secs}s, код $code): $cmd"
        Get-Content $log -Encoding UTF8 -Tail $Tail | ForEach-Object { "     $_" }
    }
}

if ($failed.Count) {
    Write-Output "Упало: $($failed -join ', ')"
    exit 1
}
Write-Output "Все проверки прошли"
