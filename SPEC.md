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
3. Как ученик, я настраиваю плеер: скорость по умолчанию, язык функций (СУММ / SUM), автопереход к следующему уроку.
4. Как автор, я присылаю сценарий, и через одну итерацию урок появляется в каталоге. Числа в таблице вычисляет движок и сверяет их с исходником.

**Вне рамок v1:** практика в интерактивной таблице, тесты и квизы, редактор уроков, кабинет преподавателя, озвучка (голос за кадром), экспорт в видео, SCORM, оплата.

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
10. **Озвучки нет (2026-10-11).** Голос за кадром удалён целиком: приложение `narration` (синтез речи, `narration_build`), `NarrationTrack` в плеере, поле `say` в уроках, настройки «озвучка» и «громкость» (миграция `preferences/0003_remove_narration`), том `media/` и раздача `/media/` в Caddy. Объясняет анимация и текст шага.
11. **Примеры свои, казахстанские (2026-10-09).** Из книги берётся только программа (навыки и порядок); сюжеты, данные и тексты уроков свои: тенге, города и филиалы РК, ТОО/ИП. Аудитория — сотрудники компаний.
12. **Задания к главам (2026-10-09)** — `content/exercises/chNN.yaml`: условие, подсказка, частая ошибка, лист задания и формулы решения. На сайте — страница «Задания к главе» (ссылка в оглавлении и после последнего урока главы); к скачиванию два файла: «…_задание.xlsx» (жёлтые ячейки для ответов) и «…_решение.xlsx» (те же ячейки с формулами), на втором листе — текст условия.
13. **Только светлая тема (2026-10-10).** Тёмная тема удалена: нет переключателя в шапке, пункта в настройках и поля `Preferences.theme` (миграция `0002_remove_theme`). Классы `dark:` в шаблонах не пишем.
14. **Вводный урок и теория к главе (2026-10-11).** Каждая глава 1–6 начинается с анимированного вводного урока (`order: 0`, в оглавлении «N.0») и текстовой «Теории к главе» без плеера — её читают перед уроками (`content/theory/chNN.yaml`, страница `/course/<глава>/theory/`, первая строка главы в оглавлении). Картинки теории — кадры окна Excel, снятые плеером из мини-уроков (`manage.py theory_frames` → `static/theory/`, PNG в git, русский и английский язык функций); `lessons_check` ловит неснятые и устаревшие кадры.
15. **Курс — только после регистрации (2026-10-11).** Уроки, теория, задания и файлы Excel открываются вошедшим; гостя ведёт на регистрацию (`login_required`, `login_url=accounts:signup`) и после неё возвращает на ту же страницу. Главная и оглавление открыты всем, в оглавлении у гостя — приглашение зарегистрироваться. Песочница `/dev/player/` (только DEBUG) не закрыта. Прогресс гостя в localStorage и его перенос в аккаунт больше не используются.
16. **Полный доступ (2026-10-11).** Введение и главы 1–5 (`FREE_CHAPTER_MAX` в `apps/catalog/access.py`) открыты всем зарегистрированным. Остальные главы — только с галочкой «полный доступ» у пользователя (`User.full_access`), её ставит администратор в админке (поле, колонка в списке, действия «Открыть/Закрыть полный доступ»); сотрудникам (`is_staff`) открыто всё. Без доступа уроки, теория, задания и файлы главы отдают страницу «Глава в полном доступе» (403), прогресс не сохраняется; в оглавлении у таких глав — значок «Полный доступ».

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
| Почта | Django SMTP backend, настройки из окружения; без `EMAIL_HOST` — console backend | SMTP подключается позже без правок кода |
| Тесты | pytest + pytest-django, Vitest (+ jsdom), Playwright (Python) | |
| Прод | Gunicorn + WhiteNoise за Caddy (автоматический HTTPS), Docker Compose; боевые настройки — флаг `PRODUCTION=true` | Один сервис вместо Nginx + certbot + cron продления |

Python-зависимости: `django`, `django-htmx`, `django-environ`, `pydantic`, `pyyaml`, `psycopg[binary]`, `whitenoise`, `gunicorn`.

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
   │ SheetModel + formula evaluator                                        │
   │ Renderer: grid, overlays, cursor, keys, ribbon, caption panel         │
   └──────── события onStepChange / onComplete ──► fetch → progress API ───┘
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

## Capability Map

| Module id | Ответственность | Зависит от |
|---|---|---|
| `lesson-format` | Pydantic-схема урока, загрузка YAML, реестр глав и уроков, `manage.py lessons_check`, генерация JSON Schema и TS-типов | — |
| `player` | Движок: модель листа, формулы, действия, таймлайн с перемоткой, отрисовка, контролы; `lessons:verify` | `lesson-format` |
| `catalog` | Главная, оглавление курса по главам, страница урока, навигация «пред./след.», базовый шаблон | `lesson-format`, `player` |
| `accounts` | Своя модель User (email, имя, фамилия, телефон), регистрация с согласием на обработку ПДн (версия + дата), вход, выход, сброс пароля по email (если есть SMTP) или через админку | — |
| `progress` | Статус урока и последний шаг; API; перенос из localStorage; отметки в каталоге | `accounts`, `catalog` |
| `preferences` | Настройки плеера и сайта: форма (HTMX), хранение (гость — localStorage, пользователь — БД) | `accounts`, `player` |

**Порядок сборки:** `lesson-format` → `player` → `catalog` (на этом этапе есть работающий сайт с перенесёнными уроками 1–2) → `accounts` → `progress`, `preferences`.

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
```

Статус урока выводится из данных: нет записи — «не начат», `completed_at` пусто — «в процессе», иначе «пройден».

## Формат урока (пример)

Каталог описан в `content/course.yaml`: название курса и список глав (`id`, номер, название) по порядку книги. Урок ссылается на главу и задаёт свой порядок внутри неё.

**Плейсхолдеры в `title` и `text`:** `{fn:SUM}` → имя функции на языке ученика, `{f:=SUM(B3:D3)}` → формула целиком с разделителями языка (`=СУММ(B3:D3)`). Другие фигурные скобки — ошибка `lessons_check`.

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
uv run python manage.py exercises_dump | pnpm --dir player exercises:verify  # задания: листы «…_решение.xlsx» vs expect

uv run ruff check . && uv run ruff format --check .
pnpm --dir player lint && pnpm --dir player typecheck
uv run pytest                             # бэкенд
pnpm --dir player test                    # Vitest
pnpm --dir player build && uv run pytest e2e   # Playwright в установленном Edge: каждый урок до конца (RU/EN, 16×)
                                          # без Edge (CI): E2E_BROWSER_CHANNEL=chromium после uv run playwright install chromium
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
  src/locale/              →   словарь функций RU/EN, разделители, формат чисел
  src/generated/           →   TS-типы из JSON Schema (не править руками)
  schema/                  →   lesson.schema.json (генерируется)
  scripts/verify.ts        →   lessons:verify
apps/core/templates/       → base.html, общие partials. Корневой папки templates/ нет: на Windows она совпадает с папкой книги Templates/
static/                    → css, alpine, htmx; static/player/ — сборка плеера
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
| Юнит (плеер) | Адреса и диапазоны, evaluator, локализация формул, `apply()` каждого действия, Timeline: seek даёт то же состояние, что полный прогон | Vitest + jsdom |
| Юнит (бэкенд) | Загрузка и валидация YAML, реестр, модели, progress API (права доступа, merge), формы настроек, регистрация (согласие обязательно, формат телефона), сброс пароля с SMTP и без него | pytest-django |
| Контент | Каждый урок: схема, адреса, уникальные id (`lessons_check`); числа совпадают с `expect` (`lessons:verify`); TS-типы актуальны | management command, Node-скрипт, CI-diff |
| E2E | Каждый урок проигрывается до конца на 16× без ошибок в консоли; регистрация → просмотр → прогресс на другом «устройстве»; настройки применяются | Playwright |

Покрытие: `player/src` и `lessons/` не ниже 80%, для остального процент не задаётся.

## Boundaries

- **Always:** перед сдачей нового урока запускать `lessons_check`, `lessons:verify` (для заданий — `exercises:verify`) и тесты; заполнять `expect` значениями из исходника; указывать автору расхождения сценария с формулами (как с «почасовой оплатой» в уроке 2); после изменения схемы перегенерировать типы.
- **Ask first:** изменение текста согласия (новая версия); новый тип действия в плеере; новые зависимости; изменения моделей и миграции; переименование `id` урока или главы; изменения контракта `ExcelLearnPlayer.mount`.
- **Never:** хардкодить вычисленные значения в уроке; править `player/src/generated/` руками; коммитить секреты (`.env`); передавать персональные данные за пределы РК или в сторонние сервисы (кроме email получателя в SMTP); удалять или ослаблять тесты ради зелёного прогона; хранить контент уроков в БД (в v1).

## Success Criteria

1. Уроки 1 и 2 перенесены в YAML и визуально и по поведению соответствуют прототипам.
2. Новый урок, использующий существующие действия, добавляется **одним YAML-файлом** без изменений кода.
3. Переход к любому шагу урока занимает < 200 мс, и состояние листа совпадает с полным прогоном (покрыто тестом).
4. Залогиненный пользователь видит статус каждого урока в каталоге и продолжает с последнего шага на другом устройстве.
5. Прогресс гостя переносится в аккаунт при регистрации или входе.
6. Настройки (скорость, язык функций, автопереход) применяются сразу и сохраняются.
7. Все команды из раздела Commands (lint, typecheck, тесты, `lessons_check`, `lessons:verify`, e2e) проходят.
8. Прод на VPS запускается одной командой `docker compose --env-file .env.production up -d --build` с HTTPS; ежедневный бэкап БД (`pg_dump`).
9. Формулы показываются по-русски по умолчанию (`=СУММ(C4:C11)`, `449,63`) и переключаются на английский в настройках.
10. Регистрация без отметки согласия невозможна; в БД сохраняются дата и версия согласия.
11. Без SMTP сброс пароля работает через админку и `changepassword`; после заполнения `EMAIL_*` в `.env` и перезапуска работает сброс по email, без правок кода.

## Open Questions

1. **Реквизиты оператора ПДн** для текста согласия: наименование (ИП/ТОО), БИН/ИИН, адрес, контактный email. В шаблоне сейчас плейсхолдеры.
2. **Домен** сайта (в примерах `excellearn.kz`).
