# Задачи ExcelLearn v1

План и граф зависимостей: [plan.md](plan.md). Требования: [SPEC.md](../SPEC.md).

**Definition of Done для каждой задачи:** критерии приёмки выполнены; `uv run ruff check .`, `uv run pytest`, `pnpm --dir player lint typecheck test` зелёные (в рамках того, что уже существует); нет новых предупреждений; изменения закоммичены.

---

## Phase 0 — Каркас

- [x] **T1. Django-каркас, инструменты, git** · M
  - Acceptance:
    - `uv` проект (Python 3.12), Django 5.2, `config/` с настройками из `.env` (`django-environ`), SQLite по умолчанию, `DATABASE_URL` для Postgres
    - ruff, pytest-django; `.gitignore` (в т.ч. `.env`, `media/`, `Practice Files/`, `Solution Files/`, `Templates/`); `.env.example`
    - (прототипы уже в `prototypes/`, git-репозиторий создан)
    - **`migrate` не запускается и миграции не создаются** (ждём T2)
  - Verify: `uv run python manage.py check`; `uv run pytest` (smoke-тест главной на заглушке)
  - Files: `pyproject.toml`, `manage.py`, `config/settings.py`, `config/urls.py`, `.gitignore`, `.env.example`
  - Deps: —

- [x] **T2. Своя модель User** · S
  - Acceptance:
    - `apps/accounts`: `User(AbstractUser)` без `username`, `email` уникальный и логин, `phone`, `consent_at`, `consent_version`; менеджер `create_user/create_superuser` по email
    - `AUTH_USER_MODEL = "accounts.User"`; первая миграция; модель зарегистрирована в админке
  - Verify: `uv run python manage.py migrate && uv run python manage.py createsuperuser`; pytest: создание пользователя, уникальность email
  - Files: `apps/accounts/models.py`, `managers.py`, `admin.py`, `migrations/0001_initial.py`, `tests/accounts/test_models.py`
  - Deps: T1

- [x] **T3. Каркас TS-плеера** · S
  - Acceptance:
    - `player/`: pnpm, TypeScript strict, esbuild (`dev` с watch, `build`) → `static/player/player.js` + `player.css`; Vitest + jsdom; ESLint
    - экспорт-заглушка `ExcelLearnPlayer.mount(el, opts)`; dev-страница `/dev/player/` (только при `DEBUG`) подключает бандл
  - Verify: `pnpm --dir player build typecheck test lint`; страница `/dev/player/` открывается без ошибок в консоли
  - Files: `player/package.json`, `tsconfig.json`, `esbuild.config.mjs`, `src/index.ts`, `apps/core/templates/dev/player.html`
  - Deps: T1

### ✅ Checkpoint A
- [ ] `manage.py check`, `pytest`, сборка и тесты плеера проходят
- [ ] Миграция User применена, суперпользователь создаётся

---

## Phase 1 — Формат урока

- [x] **T4. Схема урока, загрузчик, реестр** · M
  - Acceptance:
    - `lessons/schema.py`: `Course`, `Chapter`, `Lesson`, `Sheet`, `Cell` (значение | `{v, fmt, style}`), `Step` (`title`, `text`, `say?`), действия — дискриминированный union по ключу (`click`, `select`, `type`, `clickRef`, `dragRef`, `dragSelect`, `fill`, `keys`, `showRefs`, `wait`)
    - адреса и диапазоны валидируются (`A1`, `A1:B5`); `id` — kebab-case
    - `loader.py` читает `content/course.yaml` и `content/lessons/*.yaml`; `registry.py` — кэшированный реестр глав и уроков с порядком и соседями (пред./след.)
  - Verify: pytest — валидный урок загружается; битые адреса, дубли `id` и неизвестная глава дают понятные ошибки с именем файла
  - Files: `lessons/schema.py`, `loader.py`, `registry.py`, `content/course.yaml`, `tests/lessons/test_schema.py`
  - Deps: T1

- [x] **T5. `lessons_check`, `lessons_schema`, TS-типы** · M
  - Acceptance:
    - `manage.py lessons_check`: все уроки, ненулевой код выхода при ошибках, предупреждение о шагах без `say`
    - `manage.py lessons_schema` → `player/schema/lesson.schema.json`; `pnpm gen:types` → `player/src/generated/lesson.ts`
    - тест падает, если сгенерированные типы устарели
  - Verify: обе команды на тестовом наборе; `pnpm --dir player typecheck` с новыми типами
  - Files: `lessons/management/commands/lessons_check.py`, `lessons_schema.py`, `player/package.json`, `tests/lessons/test_commands.py`
  - Deps: T4, T3

- [x] **T6. Уроки 0-01 и 1-01 в YAML** · S
  - Acceptance:
    - `content/lessons/00-01-sum.yaml` и `01-01-wages.yaml` повторяют сценарии прототипов шаг в шаг; `expect` заполнен (`E4: 490`, `C12: 320`, `E14: 449.63` …)
    - `course.yaml`: глава 0 «Введение», глава 1 по книге
  - Verify: `lessons_check` без ошибок
  - Files: `content/course.yaml`, `content/lessons/00-01-sum.yaml`, `content/lessons/01-01-wages.yaml`
  - Deps: T5

- [ ] **T7. `lesson_import` из файлов книги** · S · *новая зависимость `openpyxl` (dev)*
  - Acceptance:
    - `manage.py lesson_import "Templates/Chapter 1 Templates/wagestemp.xlsx" --final "Practice Files/Chapter 1 Practice Files/wagesfinal.xlsx" --range B3:F15` печатает YAML-заготовку: `sheet.cells` (значения, денежный формат, ширины колонок) и `expect` из кэшированных значений решения
  - Verify: pytest на маленьком сгенерированном xlsx; ручной прогон на `wagestemp.xlsx` совпадает с T6
  - Files: `lessons/management/commands/lesson_import.py`, `lessons/xlsx_import.py`, `tests/lessons/test_import.py`
  - Deps: T4

### ✅ Checkpoint B
- [ ] `lessons_check` зелёный, типы сгенерированы, импорт даёт те же данные, что ручной YAML

---

## Phase 2 — Плеер

- [ ] **T8. SheetModel и формулы** · M
  - Acceptance:
    - адреса и диапазоны, `SheetModel` (значения, формулы, формат, стиль), пересчёт зависимых ячеек
    - вычисление через `fast-formula-parser`; кастомные функции, которых нет в библиотеке (минимум `FORMULATEXT`)
    - сдвиг относительных ссылок при копировании (`=C4*D4` → `=C5*D5`), `$` — абсолютные
  - Verify: Vitest — `SUM`, `AVERAGE`, `*`, `FORMULATEXT`, сдвиг ссылок, пересчёт
  - Files: `player/src/sheet/address.ts`, `sheet-model.ts`, `evaluator.ts`, `*.test.ts`
  - Deps: T5

- [ ] **T9. Локализация формул** · S
  - Acceptance: `toDisplay(formula, 'ru')` → `=СУММ(C4:C11)`, `;` между аргументами, `449,63`; `'en'` — без изменений; словарь функций расширяется одной строкой
  - Verify: Vitest — таблица случаев, включая вложенные функции и строки в кавычках
  - Files: `player/src/locale/functions.ts`, `format.ts`, `*.test.ts`
  - Deps: T8

- [ ] **T10. Статический рендер окна Excel** · M
  - Acceptance: заголовок, лента, поле «Имя», строка формул, сетка с заголовками, ярлык листа; отрисовка из `SheetModel` (`usd`, `head`, ширины колонок); стили изолированы (префикс `.xl-player`)
  - Verify: `/dev/player/?lesson=wages-weekly-salary` визуально совпадает с исходным состоянием прототипа 2
  - Files: `player/src/render/window.ts`, `grid.ts`, `player/src/styles/player.css`, `grid.test.ts`
  - Deps: T8, T9

- [ ] **T11. Анимационное ядро** · M
  - Acceptance: `Clock` (tween/wait с паузой, скоростью и отменой), курсор (стрелка/перекрестье, клик, рябь), оверлеи (выделение, цветные ссылки, рамка заполнения, «бегущая» рамка), показ клавиш
  - Verify: Vitest для `Clock` (пауза останавливает время, отмена прерывает); ручная проверка оверлеев на dev-странице
  - Files: `player/src/anim/clock.ts`, `cursor.ts`, `overlays.ts`, `keys.ts`, `clock.test.ts`
  - Deps: T10

- [ ] **T12. Действия-1** · M
  - Acceptance: `click`, `select`, `type`, `clickRef`, `dragRef`, `keys: [Enter]`, редактор ячейки с цветными ссылками и подсказкой синтаксиса; у каждого действия есть `animate()` и `apply()`, `animate` меняет модель только через `apply`
  - Verify: Vitest — `apply()` каждого действия на `SheetModel`; шаг 1 урока 1-01 анимируется на dev-странице
  - Files: `player/src/actions/{click,select,type,ref,keys}.ts`, `player/src/render/editor.ts`, `actions.test.ts`
  - Deps: T11

- [ ] **T13. Действия-2** · M
  - Acceptance: `keys: [Ctrl, C]` (бегущая рамка), вставка `Enter`/`Ctrl+V` в выделенный диапазон, `Ctrl+Z` (отмена последнего действия), `dragSelect`, `fill` (маркер заполнения, сдвиг ссылок), `Alt+=` (автосумма с угадыванием диапазона)
  - Verify: Vitest — `apply()` для каждого; шаги 2–4 урока 1-01 и шаг 7 урока 0-01 на dev-странице
  - Files: `player/src/actions/{clipboard,fill,select-range,autosum}.ts`, `actions2.test.ts`
  - Deps: T12

- [ ] **T13a. Действия для главы 1** · M · *новые типы действий — согласовано 2026-10-08*
  - Acceptance:
    - `fill` с двумерной целью: протянуть строку `E23:G23` до `E28` (в схеме: `fill: {from: E23:G23, to: E28}`, короткая форма `fill: E4:E11` остаётся)
    - `select` нескольких диапазонов с Ctrl (`select: [H23:H28, E29:G29]`) и `clickRibbon: autosum` — автосумма заполняет все выделенные ячейки
    - `keys: [F4]` в редакторе циклически меняет ссылку `E12 → $E$12 → E$12 → $E12 → E12`
    - оператор `^`, формат чисел с заданным числом знаков (`fmt: {number: 3}`), подсветка ячейки фоном (`style: highlight`)
  - Verify: Vitest для `apply()`; `lessons:verify` на уроках 01-02 … 01-06 после их написания
  - Files: `lessons/schema.py`, `player/src/actions/{fill,select-range,ribbon,abs-ref}.ts`, тесты
  - Deps: T13; список уроков и расхождения с книгой — `content/sources/ch01.md`

- [ ] **T14. Timeline, панель, контролы** · M
  - Acceptance:
    - `Timeline`: play/pause/restart, скорость 0.5–2×, `seek(n)` = сброс → `apply()` шагов 0..n−1 → анимация шага n; события `onStepChange`, `onComplete`
    - панель: номер шага, прогресс, заголовок, текст (санитизированный HTML), список шагов (клик — переход), пробел — пауза
    - `ExcelLearnPlayer.mount()` реализует контракт из SPEC
  - Verify: Vitest — для каждого урока `seek(n)` даёт то же состояние, что полный прогон до n, и укладывается в 200 мс; ручная проверка контролов
  - Files: `player/src/timeline/timeline.ts`, `player/src/render/panel.ts`, `player/src/index.ts`, `timeline.test.ts`
  - Deps: T13

- [ ] **T15. `lessons:verify`** · S
  - Acceptance: Node-скрипт загружает все YAML, прогоняет `apply()` всех шагов и сверяет с `expect` (допуск 0.005); выводит расхождения по урокам и ячейкам; ненулевой код выхода при ошибке
  - Verify: `pnpm --dir player lessons:verify` зелёный; намеренно испорченный `expect` в фикстуре даёт ошибку
  - Files: `player/scripts/verify.ts`, `player/package.json`, `verify.test.ts`
  - Deps: T14

- [ ] **T16. Паритет с прототипами + e2e** · M
  - Acceptance: уроки 0-01 и 1-01 в новом плеере визуально и по поведению соответствуют прототипам; Playwright проигрывает каждый урок на 16× до конца без ошибок в консоли
  - Verify: `uv run pytest e2e`; ручной просмотр рядом с прототипами
  - Files: `e2e/conftest.py`, `e2e/test_lessons_play.py`, правки стилей плеера
  - Deps: T15

### ✅ Checkpoint C — ревью с вами
- [ ] Вы смотрите уроки 0-01 и 1-01 в новом плеере и подтверждаете качество
- [ ] Все тесты плеера, `lessons:verify`, e2e зелёные

---

## Phase 3 — Каталог

- [ ] **T17. Базовый шаблон, Tailwind, тема** · S
  - Acceptance: `base.html` (шапка, навигация, футер со ссылкой на согласие), Tailwind standalone CLI, светлая/тёмная/системная тема, htmx и Alpine подключены локально (без CDN)
  - Verify: страницы рендерятся; переключение темы; pytest smoke
  - Files: `apps/core/templates/base.html`, `static/css/input.css`, `tailwind.config.js`, `package.json` скрипт `css`
  - Deps: T1

- [ ] **T18. Главная, оглавление, страница урока** · M
  - Acceptance: `/` — главная; `/course/` — главы и уроки по порядку; `/lessons/<id>/` — плеер с данными через `json_script`, кнопки пред./след.; 404 для неизвестного урока
  - Verify: pytest — статусы, порядок, соседи, 404; e2e переходит с главной в урок и дальше
  - Files: `apps/catalog/views.py`, `urls.py`, `apps/catalog/templates/catalog/{home,course,lesson}.html`, `tests/catalog/test_views.py`
  - Deps: T16, T17

### ✅ Checkpoint D
- [ ] Сайт без аккаунтов работает от главной до конца урока 1-01

---

## Phase 4 — Озвучка

- [ ] **T19. `TTSProvider`, builder, `narration_build`** · M
  - Acceptance: интерфейс провайдера; `silent` (тишина расчётной длины); builder — плейсхолдеры `{fn:…}` → RU/EN, хэш (текст, голос, язык) → `media/narration/<hash>.mp3`, манифест урока `{step: {ru, en}}`; повторный запуск без изменений не вызывает провайдера
  - Verify: pytest с `silent` и счётчиком вызовов
  - Files: `narration/providers/{base,silent}.py`, `narration/builder.py`, `management/commands/narration_build.py`, `tests/narration/test_builder.py`
  - Deps: T6

- [ ] **T20. Провайдер Yandex SpeechKit** · S
  - Acceptance: `httpx`-клиент, ключ и голос из `.env`, ретраи на 429/5xx, понятная ошибка без ключа
  - Verify: pytest с замоканным HTTP; ручной прогон на одном шаге при наличии ключа
  - Files: `narration/providers/yandex.py`, `tests/narration/test_yandex.py`
  - Deps: T19

- [ ] **T21. `NarrationTrack` + тексты `say`** · M
  - Acceptance: аудио шага стартует вместе с анимацией, шаг ждёт оба; пауза, перемотка, скорость (`playbackRate` + `preservesPitch`), громкость, выключение; без аудио урок идёт по анимации; `say` написан для всех шагов уроков 0-01 и 1-01; страница урока передаёт манифест
  - Verify: Vitest с фейковым `HTMLAudioElement`; ручное прослушивание
  - Files: `player/src/narration/track.ts`, `player/src/timeline/timeline.ts`, `apps/catalog/templates/catalog/lesson.html`, `content/lessons/*.yaml`, `track.test.ts`
  - Deps: T14, T19

### ✅ Checkpoint E
- [ ] Уроки озвучены, звук синхронен с шагами при паузе, перемотке и 2×

---

## Phase 5 — Аккаунты

- [ ] **T22. Регистрация с согласием** · M
  - Acceptance: форма — имя, фамилия, email, телефон (+7…, нормализация в E.164), пароль ×2, обязательная галочка согласия со ссылкой на `/legal/consent/` (рендер `docs/legal/consent-ru.md`); сохраняются `consent_at` и `consent_version`; после регистрации — автоматический вход
  - Verify: pytest — без согласия нельзя, неверный телефон, дубль email, версия сохраняется
  - Files: `apps/accounts/forms.py`, `views.py`, `apps/accounts/templates/registration/signup.html`, `apps/legal/views.py`, `tests/accounts/test_signup.py`
  - Deps: T2, T17

- [ ] **T23. Вход, выход, сброс пароля** · M
  - Acceptance: вход по email; выход (POST); если `EMAIL_HOST` задан — стандартный сброс по email, иначе страница «Обратитесь к администратору» с контактом; админка — поиск пользователей и смена пароля; защита от перебора (ограничение попыток входа)
  - Verify: pytest — оба режима сброса (`override_settings`), вход/выход, ограничение попыток
  - Files: `apps/accounts/views.py`, `urls.py`, `apps/accounts/templates/registration/*.html`, `config/settings.py`, `tests/accounts/test_auth.py`
  - Deps: T22

---

## Phase 6 — Прогресс и настройки

- [ ] **T24. Модель и API прогресса** · M
  - Acceptance: `LessonProgress`; `POST /api/progress/<lesson_id>/` (`step`, `completed`) — только для авторизованных, CSRF, `last_step` не уменьшается при завершённом уроке; плеер отправляет события через `fetch`
  - Verify: pytest — права доступа, неизвестный урок → 404, идемпотентность; e2e — после просмотра запись в БД
  - Files: `apps/progress/models.py`, `views.py`, `urls.py`, `player/src/integrations/progress.ts`, `tests/progress/test_api.py`
  - Deps: T23, T18

- [ ] **T25. Прогресс в каталоге, «продолжить», гость → аккаунт** · M
  - Acceptance: оглавление показывает статусы уроков и процент по главам; урок открывается с последнего шага («Продолжить с шага N» / «Сначала»); гость хранит прогресс в localStorage, при входе — `POST /api/progress/merge` (берётся максимум)
  - Verify: pytest для merge; e2e — гость смотрит урок → регистрируется → прогресс на месте; другой «браузер» продолжает с того же шага
  - Files: `apps/progress/services.py`, `apps/catalog/templates/catalog/course.html`, `apps/catalog/templates/catalog/lesson.html`, `player/src/integrations/progress.ts`, `e2e/test_progress.py`
  - Deps: T24

- [ ] **T26. Настройки** · M
  - Acceptance: `Preferences` (скорость, язык функций — по умолчанию RU, озвучка, громкость, автопереход, тема); страница `/settings/` с HTMX-сохранением; плеер применяет настройки сразу; гость — localStorage, перенос при входе; автопереход открывает следующий урок
  - Verify: pytest — форма и значения по умолчанию; e2e — смена языка показывает `SUM` вместо `СУММ`
  - Files: `apps/preferences/models.py`, `forms.py`, `views.py`, `apps/preferences/templates/preferences/settings.html`, `tests/preferences/test_views.py`
  - Deps: T23, T21

### ✅ Checkpoint F
- [ ] Все пользовательские сценарии из SPEC работают локально; полный набор тестов и e2e зелёный

---

## Phase 7 — Прод

- [ ] **T27. Docker Compose для VPS** · M
  - Acceptance: `Dockerfile` (multi-stage: сборка плеера и CSS → Python-образ), `docker-compose.yml` (web/Gunicorn, db/Postgres 16, nginx, certbot), прод-настройки (`DEBUG=False`, HSTS, secure cookies, `CSRF_TRUSTED_ORIGINS`), WhiteNoise, тома для БД и `media/`
  - Verify: `docker compose up -d` локально → сайт на https (самоподписанный сертификат), `manage.py check --deploy` без предупреждений
  - Files: `Dockerfile`, `docker-compose.yml`, `deploy/nginx.conf`, `config/settings.py`
  - Deps: T26

- [ ] **T28. Бэкапы, озвучка при деплое, инструкция** · S
  - Acceptance: ежедневный `pg_dump` с хранением 14 дней на том же VPS (РК); при деплое — `migrate`, `collectstatic`, `narration_build`; `docs/deploy.md` — пошаговый деплой и восстановление из бэкапа
  - Verify: восстановление бэкапа на чистой БД локально
  - Files: `deploy/backup.sh`, `deploy/entrypoint.sh`, `docs/deploy.md`
  - Deps: T27

### ✅ Checkpoint G
- [ ] Все Success Criteria из SPEC.md выполнены
- [ ] Текст согласия заполнен реквизитами и согласован с юристом
