# Spec: ExcelLearn — платформа анимированных уроков Excel

Статус: **утверждено** (2026-10-08) · Дата: 2026-10-08 · Стек: Django + HTMX + Alpine.js + TS-плеер

## Objective

Веб-сайт с каталогом анимированных уроков Excel. В каждом уроке симуляция окна Excel: виртуальный курсор кликает по ячейкам, вводит формулы, протягивает маркер заполнения, а рядом идут пошаговые пояснения. Прототипы: [`prototypes/lesson-01-sum.html`](prototypes/lesson-01-sum.html), [`prototypes/lesson-02-wages.html`](prototypes/lesson-02-wages.html).

**Пользователи**
- **Ученик** смотрит уроки (без практики), управляет воспроизведением, видит свой прогресс, настраивает плеер.
- **Автор** (владелец проекта) присылает сценарий урока текстом. Claude генерирует YAML-файл урока, проверяет его и добавляет в каталог.

**User stories**
1. Как ученик, я открываю каталог, открываю главу и урок и смотрю анимацию с паузой, скоростью и переходом к любому шагу.
2. Как ученик, я регистрируюсь, и сайт запоминает, какие уроки я прошёл и на каком шаге остановился.
3. Как ученик, я настраиваю плеер: скорость по умолчанию, язык функций (СУММ / SUM), озвучка вкл./выкл. и громкость, автопереход к следующему уроку, тема.
4. Как ученик, я слышу голос за кадром, который объясняет каждый шаг синхронно с анимацией.
5. Как автор, я присылаю сценарий, и через одну итерацию урок появляется в каталоге вместе с озвучкой. Числа в таблице вычисляет движок и сверяет их с исходником.

**Вне рамок v1:** практика в интерактивной таблице, тесты и квизы, редактор уроков, кабинет преподавателя, синхронизация озвучки по словам, живой диктор, экспорт в видео, SCORM, оплата.

## Принятые решения
1. Веб-приложение для современных браузеров, desktop-first. На мобильных урок масштабируется, но это не основной сценарий.
2. Интерфейс сайта на русском. Симуляция Excel **по умолчанию русская** (`СУММ`, `;` между аргументами, `,` в дробях), английский вариант (`SUM`, `,`, `.`) включается в настройках.
3. Уроки хранятся **в репозитории как YAML-файлы** (content-as-code), а не в БД. В БД хранятся только пользователи, прогресс и настройки.
4. Новый урок добавляется одним YAML-файлом без правок кода, если хватает существующих действий.
5. Каталог — **один курс с главами, повторяющий книгу** (У. Уинстон, «Microsoft Excel: анализ данных и бизнес-моделирование»). Демо-урок про СУММ идёт отдельной вводной главой 0.
6. Хостинг — **VPS в Казахстане** (Docker Compose: Caddy + Gunicorn + PostgreSQL; Caddy сам выпускает и продлевает сертификат Let's Encrypt — заменил Nginx + certbot в T27 ради простоты сопровождения). Персональные данные и их бэкапы хранятся только на территории РК (Закон РК от 21.05.2013 № 94-V «О персональных данных и их защите», ст. 12). Внешним сервисам (синтез речи, SMTP) персональные данные не передаются, кроме email получателя письма при сбросе пароля.
7. Вход — **email + пароль**, без подтверждения email и без соцсетей. Профиль: имя, фамилия, email, телефон. При регистрации обязательна отметка согласия на обработку ПДн; текст согласия — [docs/legal/consent-ru.md](docs/legal/consent-ru.md), хранится с версией, в БД фиксируются дата и версия согласия.
8. **Сброс пароля двумя способами.** (а) По email, если в окружении задан SMTP (`EMAIL_HOST` и др.); без SMTP ссылка «Забыли пароль?» показывает «Обратитесь к администратору». (б) Администратор задаёт новый пароль в Django-админке. SMTP подключается позже только переменными окружения, без правок кода.
9. Кабинет преподавателя — позже. В v1 прогресс учеников смотрим в Django-админке.
10. **Озвучка в v1.** Голос генерируется синтезом речи при сборке (не в браузере), по аудиофайлу на шаг; синхронизация по шагам. Текст для диктора (`say`) отделён от текста на экране и генерируется вместе с уроком.

## Tech Stack

| Слой | Выбор | Почему |
|---|---|---|
| Бэкенд | Python 3.12, Django 5.2 LTS | Встроенные аутентификация, ORM, миграции и админка; бэкенд — классический сайт с аккаунтами |
| Шаблоны / интерактив | Django Templates, `django-htmx`, Alpine.js 3 | Каталог и настройки без SPA; Alpine закрывает мелкий интерактив |
| Стили | Tailwind CSS 4 (`@tailwindcss/cli` в корневом `package.json`, версии закреплены) для сайта; отдельный CSS плеера | Плеер изолирован от стилей сайта; одинаковая сборка на Windows и в Linux-контейнере |
| Плеер | TypeScript 6.0 (strict; 7.x пока не поддерживается typescript-eslint), чистый DOM, без фреймворка, сборка esbuild | Развитие прототипов; анимация на rAF |
| Формулы | `fast-formula-parser` 1.0.19 (MIT) — разбор формул и ссылок; `@formulajs/formulajs` 4.6.1 (MIT) — реализации ~400 функций Excel. Обе версии закреплены | Единственный вычислитель формул в проекте, значения не вписываются руками. У парсера нет MAX, MATCH, PMT, NPV и др. — их считает formulajs |
| Формат урока | YAML → Pydantic 2 → JSON Schema → TS-типы (`json-schema-to-typescript`) | Одна схема-источник для Python и TS |
| БД | PostgreSQL 16 (прод), SQLite (локальная разработка) | Старт без Docker, прод на надёжной БД |
| Зависимости | `uv` (Python), `pnpm` + Node 24 LTS (плеер) | |
| Озвучка | Синтез речи через интерфейс `TTSProvider`; основной провайдер — Yandex SpeechKit (лучшее качество русской речи), для разработки и тестов — `silent` (тишина расчётной длительности, без сети), для предпросмотра на Windows — `windows` (встроенный голос «Microsoft Irina», бесплатно, качество ниже) | Провайдер меняется одной настройкой |
| Почта | Django SMTP backend, настройки из окружения; без `EMAIL_HOST` — console backend | SMTP подключается позже без правок кода |
| Тесты | pytest + pytest-django, Vitest (+ jsdom), Playwright (Python) | |
| Прод | Gunicorn + WhiteNoise за Caddy (автоматический HTTPS), Docker Compose; боевые настройки — флаг `PRODUCTION=true` | Один сервис вместо Nginx + certbot + cron продления |

Python-зависимости: `django`, `django-htmx`, `django-environ`, `pydantic`, `pyyaml`, `psycopg[binary]`, `whitenoise`, `gunicorn`, `httpx` (вызов TTS API).

**Переменные окружения (`.env`, пример в `.env.example`):**

```ini
DJANGO_SECRET_KEY=...
DATABASE_URL=postgres://excellearn:***@db:5432/excellearn
ALLOWED_HOSTS=excellearn.kz

# Почта — пусто = сброс пароля только через администратора
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=true
DEFAULT_FROM_EMAIL=ExcelLearn <no-reply@excellearn.kz>

# Озвучка
TTS_PROVIDER=yandex            # yandex | silent
TTS_API_KEY=
TTS_FOLDER_ID=
TTS_VOICE=alena
```

## Архитектура

```
content/lessons/*.yaml ──► lessons (Pydantic: валидация, реестр, кэш)
                                   │
            ┌──────────────────────┼─────────────────────────┐
            ▼                      ▼                         ▼
     catalog (views +       accounts (django.auth)    progress / preferences
     templates, HTMX)                                  (модели + JSON-эндпоинты)
            │
            │  {{ lesson|json_script }} + настройки + стартовый шаг
            ▼
   ┌──────────── player (TypeScript, static/player/player.js) ─────────────┐
   │ Timeline (play/pause/seek/speed) ─ Steps ─ Actions(animate | apply)   │
   │ SheetModel + formula evaluator          NarrationTrack (<audio>/шаг)  │
   │ Renderer: grid, overlays, cursor, keys, ribbon, caption panel         │
   └──────── события onStepChange / onComplete ──► fetch → progress API ───┘
                                   ▲
   content/lessons/*.yaml ─► manage.py narration_build ─► TTS ─► media/narration/<hash>.mp3
                                                      (кэш по хэшу текста, голоса и языка)
```

**Ключевые решения**

1. **Урок — это данные.** YAML-файл описывает таблицу и шаги из типизированных *действий* (`click`, `type`, `clickRef`, `dragRef`, `fill`, `keys`…). Такой формат удобно генерировать, проверять и в будущем редактировать визуально.
2. **Одна схема на два языка.** Pydantic-модель урока — источник истины. Из неё генерируется JSON Schema, а из неё TS-типы плеера (`pnpm gen:types`). Расхождение схем ловит CI.
3. **Один вычислитель формул.** Формулы считает только плеер (TS). Python проверяет структуру урока: адреса, ссылки, схему. Корректность чисел проверяет `pnpm lessons:verify`: прогоняет каждый урок без анимации и сверяет значения с блоком `expect` из исходника (например, `E14: 449.63` с рисунка).
4. **Перемотка по шагам.** У каждого действия два режима: `animate()` и `apply()` (мгновенно применить к модели листа). Переход к шагу N работает так: сброс, затем `apply()` всех действий шагов 0..N−1, затем анимация шага N.
5. **Плеер не знает о Django.** Контракт:
   ```ts
   ExcelLearnPlayer.mount(el, { lesson, settings, startStep, onStepChange, onComplete })
   ```
   Шаблон страницы урока передаёт данные через `json_script`, а события отправляются через `fetch` в progress API.
6. **Гость и пользователь.** Прогресс и настройки гостя хранятся в localStorage и переносятся в аккаунт при входе (`POST /api/progress/merge`).
7. **Озвучка по шагам.** Шаг начинается одновременно с анимацией и аудио и заканчивается, когда завершились оба. Скорость задаёт `playbackRate` с `preservesPitch` (до 2×), пауза и перемотка останавливают и переключают аудио текущего шага. Если аудио нет или звук выключен, шаг идёт по таймингу анимации.
8. **Аудио не в git.** `narration_build` генерирует MP3 при деплое в постоянный том `media/narration/`; имя файла — хэш (текст `say`, голос, язык функций), так что API вызывается только для изменённых шагов. Озвучка генерируется в двух вариантах — с русскими и с английскими названиями функций.

## Capability Map

| Module id | Ответственность | Зависит от |
|---|---|---|
| `lesson-format` | Pydantic-схема урока, загрузка YAML, реестр глав и уроков, `manage.py lessons_check`, генерация JSON Schema и TS-типов | — |
| `player` | Движок: модель листа, формулы, действия, таймлайн с перемоткой, отрисовка, контролы; `lessons:verify` | `lesson-format` |
| `catalog` | Главная, оглавление курса по главам, страница урока, навигация «пред./след.», базовый шаблон | `lesson-format`, `player` |
| `narration` | Интерфейс `TTSProvider` (yandex, silent), `manage.py narration_build` с кэшем, манифест аудио урока, `NarrationTrack` в плеере | `lesson-format`, `player` |
| `accounts` | Своя модель User (email, имя, фамилия, телефон), регистрация с согласием на обработку ПДн (версия + дата), вход, выход, сброс пароля по email (если есть SMTP) или через админку | — |
| `progress` | Статус урока и последний шаг; API; перенос из localStorage; отметки в каталоге | `accounts`, `catalog` |
| `preferences` | Настройки плеера и сайта: форма (HTMX), хранение (гость — localStorage, пользователь — БД) | `accounts`, `player` |

**Порядок сборки:** `lesson-format` → `player` → `catalog` (на этом этапе есть работающий сайт с перенесёнными уроками 1–2) → `narration` → `accounts` → `progress`, `preferences`.

На каждый модуль пишется отдельная спецификация `SPEC-<module-id>.md` перед его реализацией.

## Модель данных

Собственная модель пользователя создаётся **до первой миграции**, потому что поменять её потом в Django очень дорого:

```python
class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)               # логин
    phone = models.CharField(max_length=20)              # E.164, валидация формата (+7…)
    consent_at = models.DateTimeField(null=True)         # когда дано согласие; пусто только у созданных админом
    consent_version = models.CharField(max_length=20, blank=True)  # версия текста docs/legal/consent-ru.md

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name", "phone"]


class LessonProgress(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="progress")
    lesson_id = models.CharField(max_length=100)       # стабильный id из YAML
    last_step = models.PositiveSmallIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "lesson_id"], name="uniq_user_lesson")]


class Preferences(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="preferences")
    speed = models.DecimalField(max_digits=3, decimal_places=2, default=1)
    function_locale = models.CharField(max_length=2, choices=[("ru", "RU"), ("en", "EN")], default="ru")
    autoplay_next = models.BooleanField(default=False)
    narration_on = models.BooleanField(default=True)
    narration_volume = models.PositiveSmallIntegerField(default=80)   # 0–100
    theme = models.CharField(max_length=10, choices=[("light", "Светлая"), ("dark", "Тёмная"), ("system", "Системная")], default="system")
```

Статус урока выводится из данных: нет записи — «не начат», `completed_at` пусто — «в процессе», иначе «пройден».

## Формат урока (пример)

Каталог описан в `content/course.yaml`: название курса и список глав (`id`, номер, название) по порядку книги. Урок ссылается на главу и задаёт свой порядок внутри неё.

**Озвучка:** у каждого шага есть поле `say` — текст для диктора. Адреса ячеек и знаки в нём записаны словами, чтобы синтезатор читал их правильно. Названия функций задаются плейсхолдером `{fn:SUM}`: он подставляется по языку, отдельно для русской и английской версии аудио. Если `say` не указан, шаг не озвучивается (`lessons_check` выдаёт предупреждение). Русские имена, которые синтезатор читает невнятно (`СРЗНАЧ`, `Ф.ТЕКСТ`, `ВПР`…), диктор произносит по словарю `SPOKEN_RU` в `narration/builder.py` («эс-эр-знач»); на экране они остаются как в Excel.

**Плейсхолдеры в `title` и `text`:** `{fn:SUM}` → имя функции на языке ученика, `{f:=SUM(B3:D3)}` → формула целиком с разделителями языка (`=СУММ(B3:D3)`). В `say` разрешён только `{fn:…}`. Другие фигурные скобки — ошибка `lessons_check`.

**Формулы в уроке пишутся в каноническом английском виде** (`=SUM(C4:C11)`, `449.63`). Плеер сам локализует их при показе: имена функций по словарю (`SUM→СУММ`, `AVERAGE→СРЗНАЧ`, `FORMULATEXT→Ф.ТЕКСТ`, …), разделители аргументов (`,`→`;`) и дробей (`.`→`,`). Поэтому один урок работает в обоих режимах.

```yaml
# content/lessons/01-01-wages.yaml
id: wages-weekly-salary          # стабильный, хранится в БД прогресса — не переименовывать
chapter: ch01                    # глава из content/course.yaml
order: 1                         # порядок внутри главы
title: Расчёт недельной платёжной ведомости
source: Рис. 1.1, Wagestemp.xlsx

sheet:
  file: Wagestemp.xlsx
  name: Wages
  columns: { A: 30, B: 140, C: 80, D: 120, E: 130, F: 140 }
  cells:
    B3: { v: Employee, style: head }
    C3: { v: Hours, style: head }
    B4: Luka Abrus
    C4: 49
    D4: { v: 10, fmt: usd }
    # ...

expect:                          # значения из исходника — сверяются в lessons:verify
  E4: 490
  C12: 320
  E14: 449.63

steps:
  - title: Формула =C4*D4
    text: Зарплата Luka — это часы × ставка. Выделите <code>E4</code>…
    say: >-                        # текст для диктора: адреса и знаки словами
      Зарплата Луки — это часы, умноженные на ставку. Выделяем ячейку Е четыре,
      ставим знак «равно», щёлкаем Си четыре, ставим звёздочку — знак умножения — и щёлкаем Дэ четыре.
    actions:
      - click: E4
      - type: "="
      - clickRef: C4
      - type: "*"
      - clickRef: D4
      - keys: [Enter]

  - title: Маркер заполнения
    text: Наведите курсор на квадратик в правом нижнем углу…
    actions:
      - select: E4
      - fill: E4:E11

  - title: "Сумма часов: SUM"
    text: В <code>C12</code> считаем общее число часов…
    say: В ячейке Си двенадцать считаем общее число часов функцией {fn:SUM}.   # {fn:…} → «СУММ» или «SUM» по языку
    actions:
      - click: C12
      - type: "=SUM("
      - dragRef: C4:C11
      - type: ")"
      - keys: [Enter]
```

## Commands

```
uv sync                                   # Python-зависимости
pnpm --dir player install                 # зависимости плеера
uv run python manage.py migrate           # миграции (SQLite локально)
uv run python manage.py runserver         # http://localhost:8000
pnpm install && pnpm css                  # Tailwind → static/css/site.css (при разработке: pnpm css:watch)
pnpm vendor                               # htmx и Alpine из node_modules → static/vendor/ (после обновления версий)
pnpm --dir player dev                     # esbuild --watch → static/player/
pnpm --dir player build                   # прод-сборка плеера

uv run python manage.py lessons_check     # схема YAML, адреса, уникальность id
uv run python manage.py lessons_schema    # Pydantic → player/schema/lesson.schema.json
pnpm --dir player gen:types               # JSON Schema → player/src/generated/lesson.ts
pnpm --dir player lessons:verify          # прогон уроков без анимации, сверка с expect

uv run ruff check . && uv run ruff format --check .
pnpm --dir player lint && pnpm --dir player typecheck
uv run pytest                             # бэкенд
pnpm --dir player test                    # Vitest
pnpm --dir player build && uv run pytest e2e   # Playwright в установленном Edge: каждый урок до конца (RU/EN, 16×)
                                          # без Edge (CI): E2E_BROWSER_CHANNEL=chromium после uv run playwright install chromium
uv run python manage.py narration_build   # озвучка: генерирует только новые/изменённые шаги (TTS_PROVIDER)
uv run python manage.py narration_build --provider silent   # без сети, для разработки и тестов
uv run python manage.py changepassword user@mail.kz          # сброс пароля администратором из консоли
docker compose --env-file .env.production up -d --build   # прод: Postgres + Gunicorn + Caddy (пример настроек — deploy/.env.production.example)
```

## Project Structure

```
config/                    → settings.py, urls.py, wsgi.py
apps/
  catalog/                 → views, urls, templates/catalog/ (главная, курс, урок)
  accounts/                → регистрация, вход, сброс пароля; templates/registration/
  progress/                → models, api views (JSON), merge из localStorage
  preferences/             → models, forms, HTMX-views
lessons/                   → Django-app без моделей: schema.py (Pydantic), loader.py, registry.py,
                             management/commands/lessons_check.py, lessons_schema.py
narration/                 → Django-app без моделей: providers/ (base, yandex, silent), builder.py (кэш, манифест),
                             management/commands/narration_build.py
docs/legal/                → consent-ru.md (согласие на обработку ПДн), privacy-ru.md (политика, позже)
content/
  course.yaml              → курс и главы по порядку книги
  lessons/CC-NN-slug.yaml  → один файл = один урок (CC — глава, NN — порядок)
  sources/                 → исходные сценарии и рисунки (для истории)
player/                    → TypeScript-проект плеера
  src/sheet/               →   SheetModel, адреса, evaluator
  src/actions/             →   по файлу на действие: animate() + apply()
  src/timeline/            →   Timeline: play/pause/seek/speed
  src/render/              →   grid, overlays, cursor, keys, ribbon, panel
  src/narration/           →   NarrationTrack: аудио шага, скорость, пауза, громкость
  src/locale/              →   словарь функций RU/EN, разделители, формат чисел
  src/generated/           →   TS-типы из JSON Schema (не править руками)
  schema/                  →   lesson.schema.json (генерируется)
  scripts/verify.ts        →   lessons:verify
apps/core/templates/       → base.html, общие partials. Корневой папки templates/ нет: на Windows она совпадает с папкой книги Templates/
static/                    → css, alpine, htmx; static/player/ — сборка плеера
media/narration/           → сгенерированные MP3 (не в git; постоянный том на VPS)
tests/                     → pytest (по папке на app)
e2e/                       → Playwright
prototypes/                → lesson-01-sum.html, lesson-02-wages.html (эталон поведения)
```

## Code Style

- **Python:** ruff (lint + format), type hints везде, Django-идиомы: тонкие views, логика в моделях или сервисах. Функции и переменные в snake_case, классы в PascalCase.
- **TypeScript:** strict, без `any`, именованные экспорты, файлы в kebab-case.
- **Шаблоны:** только внутри приложений — `apps/<app>/templates/<app>/…`, HTMX-партиалы в `apps/<app>/templates/<app>/partials/_name.html`.
- **Тексты шагов:** ограниченный HTML (`<b>`, `<code>`, `<kbd>`), санитизируется в плеере.
- Комментарии только там, где неочевидно «почему».

Действие плеера:

```ts
export const clickRef = (cell: CellAddr): Action => ({
  kind: 'clickRef',
  async animate(ctx) {
    await ctx.cursor.moveTo(cell);
    await ctx.cursor.click();
    this.apply(ctx.sheet);
  },
  apply(sheet) {
    sheet.editor.addRef(cell);
  },
});
```

Схема урока (фрагмент):

```python
class Step(BaseModel):
    title: str
    text: str
    say: str | None = None
    actions: list[Action] = Field(min_length=1)


class Lesson(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9-]+$")
    chapter: str
    order: int
    title: str
    sheet: Sheet
    expect: dict[CellAddr, float | str] = {}
    steps: list[Step] = Field(min_length=1)
```

## Testing Strategy

| Уровень | Что проверяем | Инструмент |
|---|---|---|
| Юнит (плеер) | Адреса и диапазоны, evaluator, локализация формул, `apply()` каждого действия, Timeline: seek даёт то же состояние, что полный прогон; шаг ждёт и анимацию, и аудио | Vitest + jsdom |
| Юнит (бэкенд) | Загрузка и валидация YAML, реестр, модели, progress API (права доступа, merge), формы настроек, регистрация (согласие обязательно, формат телефона), сброс пароля с SMTP и без него, `narration_build` (кэш, плейсхолдеры `{fn:…}`) с провайдером `silent` | pytest-django |
| Контент | Каждый урок: схема, адреса, уникальные id (`lessons_check`); числа совпадают с `expect` (`lessons:verify`); TS-типы актуальны | management command, Node-скрипт, CI-diff |
| E2E | Каждый урок проигрывается до конца на 16× без ошибок в консоли; регистрация → просмотр → прогресс на другом «устройстве»; настройки применяются | Playwright |

Покрытие: `player/src` и `lessons/` не ниже 80%, для остального процент не задаётся.

## Boundaries

- **Always:** перед сдачей нового урока запускать `lessons_check`, `lessons:verify` и тесты; заполнять `expect` значениями из исходника; указывать автору расхождения сценария с формулами (как с «почасовой оплатой» в уроке 2); после изменения схемы перегенерировать типы.
- **Ask first:** смена TTS-провайдера или голоса (перегенерирует всю озвучку); изменение текста согласия (новая версия); новый тип действия в плеере; новые зависимости; изменения моделей и миграции; переименование `id` урока или главы; изменения контракта `ExcelLearnPlayer.mount`.
- **Never:** хардкодить вычисленные значения в уроке; править `player/src/generated/` руками; коммитить секреты (`.env`) и сгенерированное аудио; передавать персональные данные за пределы РК или в сторонние сервисы (кроме email получателя в SMTP); удалять или ослаблять тесты ради зелёного прогона; хранить контент уроков в БД (в v1).

## Success Criteria

1. Уроки 1 и 2 перенесены в YAML и визуально и по поведению соответствуют прототипам.
2. Новый урок, использующий существующие действия, добавляется **одним YAML-файлом** без изменений кода.
3. Переход к любому шагу урока занимает < 200 мс, и состояние листа совпадает с полным прогоном (покрыто тестом).
4. Залогиненный пользователь видит статус каждого урока в каталоге и продолжает с последнего шага на другом устройстве.
5. Прогресс гостя переносится в аккаунт при регистрации или входе.
6. Настройки (скорость, язык функций, озвучка и громкость, автопереход, тема) применяются сразу и сохраняются.
7. Все команды из раздела Commands (lint, typecheck, тесты, `lessons_check`, `lessons:verify`, e2e) проходят.
8. Прод на VPS запускается одной командой `docker compose --env-file .env.production up -d --build` с HTTPS; ежедневный бэкап БД (`pg_dump`).
9. Формулы показываются по-русски по умолчанию (`=СУММ(C4:C11)`, `449,63`) и переключаются на английский в настройках.
10. У каждого шага уроков 1–2 есть озвучка; аудио совпадает с шагом при паузе, перемотке и скорости до 2×; при повторной сборке без изменений API синтеза не вызывается.
11. Регистрация без отметки согласия невозможна; в БД сохраняются дата и версия согласия.
12. Без SMTP сброс пароля работает через админку и `changepassword`; после заполнения `EMAIL_*` в `.env` и перезапуска работает сброс по email, без правок кода.

## Open Questions

1. **TTS-провайдер:** по умолчанию Yandex SpeechKit (нужны аккаунт Yandex Cloud, API-ключ и folder id). Подойдёт или есть предпочтения (голос, другой сервис)? Провайдеру передаётся только текст уроков, без персональных данных.
2. **Реквизиты оператора ПДн** для текста согласия: наименование (ИП/ТОО), БИН/ИИН, адрес, контактный email. В шаблоне сейчас плейсхолдеры.
3. **Домен** сайта (в примерах `excellearn.kz`).
