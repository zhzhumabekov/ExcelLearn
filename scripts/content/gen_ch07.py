"""Генератор главы 7 «Даты и функции работы с датами»: уроки и задания.

Ответы expect считаются здесь, на Python (datetime), независимо от движка плеера: lessons:verify и
exercises:verify сверяют их с ним. Запуск из корня проекта: uv run python scripts/content/gen_ch07.py
"""

import datetime as dt
from pathlib import Path

import yaml

ROOT = Path("content")
EPOCH = dt.date(1899, 12, 30)
TODAY = dt.date(2026, 10, 12)  # «сегодня» уроков с СЕГОДНЯ() и Ctrl+; (понедельник)


def head(v):
    return {"v": v, "style": "head"}


def label(v):
    return {"v": v, "style": "label"}


def date_cell(d=None):
    """Ячейка с датой (или пустая ячейка с форматом даты — туда придёт формула)."""
    return {"v": d.isoformat(), "fmt": "date"} if d else {"fmt": "date"}


# ---------- Независимые реализации функций Excel (для ответов) ----------


def serial(d):
    """Номер даты в Excel (для дат после 01.03.1900)."""
    return (d - EPOCH).days


def ru(d):
    return d.strftime("%d.%m.%Y")


def two_digit_year(yy):
    """Как Excel: 00–29 — XXI век, 30–99 — XX век."""
    return 2000 + yy if yy < 30 else 1900 + yy


# Выходные дни недели по isoweekday (1 — пн … 7 — вс)
SAT_SUN = {6, 7}
WEEKEND_CODES = {1: {6, 7}, 2: {7, 1}, 3: {1, 2}, 4: {2, 3}, 5: {3, 4}, 6: {4, 5}, 7: {5, 6}}
WEEKEND_CODES |= {10 + i: {(i + 5) % 7 + 1} for i in range(1, 8)}  # 11 — только вс, 12 — только пн …


def weekend_of(code):
    if isinstance(code, str):  # «0000011»: пн … вс, 1 — выходной
        return {i + 1 for i, c in enumerate(code) if c == "1"}
    return WEEKEND_CODES[code]


def is_workday(d, weekend=SAT_SUN, holidays=()):
    return d.isoweekday() not in weekend and d not in holidays


def x_workday(start, days, weekend=SAT_SUN, holidays=()):
    d, step = start, 1 if days > 0 else -1
    left = abs(days)
    while left:
        d += dt.timedelta(days=step)
        if is_workday(d, weekend, holidays):
            left -= 1
    return d


def x_networkdays(start, end, weekend=SAT_SUN, holidays=()):
    lo, hi = min(start, end), max(start, end)
    n = sum(is_workday(lo + dt.timedelta(days=i), weekend, holidays) for i in range((hi - lo).days + 1))
    return n if start <= end else -n


def x_datedif(a, b, unit):
    if a > b:
        return "#NUM!"
    months = (b.year - a.year) * 12 + b.month - a.month - (1 if b.day < a.day else 0)
    return {"y": months // 12, "m": months, "d": (b - a).days, "ym": months % 12}[unit]


def x_weekday(d, kind=1):
    iso = d.isoweekday()  # 1 — пн
    return {1: iso % 7 + 1, 2: iso, 3: iso - 1}[kind]


def x_date(y, m, d):
    """ДАТА с переносом месяцев и дней (ДАТА(2027;13;1), день 0 — последний день прошлого месяца)."""
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return dt.date(y, m, 1) + dt.timedelta(days=d - 1)


# ---------- Урок: сборка ----------


def step(title, text, actions):
    return {"title": title, "text": text, "actions": actions}


def enter():
    return {"keys": ["Enter"]}


def ctrl1():
    return {"keys": ["Ctrl", "1"]}


def lesson(order, lid, title, source, sheet, expect, steps, today=None):
    d = {"id": lid, "chapter": "ch07", "order": order, "title": title, "source": source, "sheet": sheet}
    if today:
        d["today"] = today.isoformat()
    d["expect"] = expect
    d["steps"] = steps
    return d


LESSONS = []

# ---------- 07-01: даты — это числа ----------
PAYMENTS = [dt.date(2026, 1, 5), dt.date(2026, 1, 19), dt.date(2026, 2, 2), dt.date(2026, 2, 16), dt.date(2026, 3, 2)]
TEXT_DATE = dt.date(2026, 1, 15)
cells = {"A1": head("Дата из выгрузки"), "B1": head("Как дата")}
for i, d in enumerate(PAYMENTS, start=2):
    cells[f"A{i}"] = serial(d)
    cells[f"B{i}"] = {"f": f"=A{i}"}
cells |= {
    "A8": label("Набираем дату"),
    "A9": "Год «29»",
    "A10": "Год «30»",
    "A12": head("Дата текстом"),
    "B12": head("ДАТАЗНАЧ"),
    "A13": ru(TEXT_DATE),  # строка в YAML остаётся текстом, как дата из 1С, выгруженная текстом
}
ex = {f"B{i}": serial(d) for i, d in enumerate(PAYMENTS, start=2)}
ex |= {
    "B8": serial(dt.date(2003, 1, 4)),
    "B9": serial(dt.date(two_digit_year(29), 1, 1)),
    "B10": serial(dt.date(two_digit_year(30), 1, 1)),
    "B13": serial(TEXT_DATE),
}
LESSONS.append(
    lesson(
        1,
        "serial-dates",
        "Дата — это число: формат «Дата» и «Общий»",
        "Dates.xlsx, лист serial format (рис. 7.1–7.2)",
        {
            "file": "Платежи_из_банка.xlsx",
            "name": "Платежи",
            "columns": {"A": 200, "B": 170},
            "rows": 14,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                f"Банк-клиент выгрузил платежи, а вместо дат в столбце A — числа: <b>{serial(PAYMENTS[0])}</b>, "
                f"<b>{serial(PAYMENTS[1])}</b>… Это не сбой. Так Excel хранит любую дату: как <b>номер дня</b>. "
                "Первый день — 01.01.1900, второй — 02.01.1900 и так далее.",
                [{"wait": 3000}],
            ),
            step(
                "Номер дня",
                f"В <code>B2</code> то же число: <code>{{f:=A2}}</code>. {serial(PAYMENTS[0])} — это "
                f"{serial(PAYMENTS[0])}-й день, считая 1 января 1900 года первым. Чтобы увидеть дату, менять "
                "число не нужно: достаточно поменять <b>формат</b> ячейки.",
                [{"click": "B2"}, {"wait": 1500}],
            ),
            step(
                "Формат ячеек → Дата",
                "Выделите <code>B2:B6</code>, щёлкните по выделению <b>правой кнопкой</b> и выберите <b>Формат "
                "ячеек…</b>. В списке «Числовые форматы» — <b>Дата</b>, тип <b>14.03.2012</b>, затем OK. В ячейках "
                "те же числа, только показаны как даты. Это же окно открывает <kbd>Ctrl</kbd>+<kbd>1</kbd>.",
                [
                    {"select": "B2:B6"},
                    {"contextMenu": "formatCells"},
                    {"dialogPick": "Дата"},
                    {"dialogPick": "*14.03.2012"},
                    {"dialogButton": "OK"},
                ],
            ),
            step(
                "Длинный тип даты",
                "Ещё раз <kbd>Ctrl</kbd>+<kbd>1</kbd> → тип <b>14 марта 2012 г.</b> → OK: "
                f"<b>{PAYMENTS[0].day} января 2026 г.</b> Такой вид удобен в письмах и приказах. Типы со звёздочкой "
                "берутся из настроек Windows: в английском Excel тот же тип покажет «Monday, January 5, 2026».",
                [
                    {"select": "B2:B6"},
                    ctrl1(),
                    {"dialogPick": "*14 марта 2012 г."},
                    {"dialogButton": "OK"},
                ],
            ),
            step(
                "Набираем дату",
                "Наберите в <code>B8</code> <b>04.01.2003</b> и нажмите Enter. Excel узнал дату и сам поставил "
                "формат «Дата». Теперь <kbd>Ctrl</kbd>+<kbd>1</kbd> → <b>Общий</b> → OK: в ячейке "
                f"<b>{ex['B8']}</b>. Это номер 4 января 2003 года. Excel понимает и «4.1.2003», и «4 янв 2003».",
                [
                    {"click": "B8"},
                    {"type": "04.01.2003"},
                    enter(),
                    {"click": "B8"},
                    ctrl1(),
                    {"dialogPick": "Общий"},
                    {"dialogButton": "OK"},
                ],
            ),
            step(
                "Год двумя цифрами",
                "Если набрать год двумя цифрами, Excel решает век сам: от 00 до 29 — XXI век, от 30 до 99 — XX. "
                "<b>1.1.29</b> станет 01.01.2029, а <b>1.1.30</b> — 01.01.1930. С датами рождения и "
                "договоров это опасно. Набирайте год четырьмя цифрами.",
                [
                    {"click": "B9"},
                    {"type": "1.1.29"},
                    enter(),
                    {"type": "1.1.30"},
                    enter(),
                ],
            ),
            step(
                "Частая ошибка: дата текстом",
                "Числа и даты Excel прижимает к правому краю, текст — к левому. «15.01.2026» в <code>A13</code> "
                "прижата влево: это <b>текст</b>, и считать с ним нельзя. {fn:DATEVALUE} делает из текста дату: "
                f"<code>{{f:=DATEVALUE(A13)}}</code> → <b>{ex['B13']}</b>. Осталось дать ячейке формат «Дата». "
                'Текст можно написать и прямо в формуле: <code>{f:=DATEVALUE("04.01.2003")}</code>.',
                [
                    {"click": "B13"},
                    {"type": "=DATEVALUE("},
                    {"clickRef": "A13"},
                    {"type": ")"},
                    enter(),
                    {"click": "B13"},
                    ctrl1(),
                    {"dialogPick": "Дата"},
                    {"dialogButton": "OK"},
                ],
            ),
            step(
                "Что запомнить",
                "Дата в Excel — номер дня, считая 01.01.1900 первым. Формат «Дата» показывает номер как дату, "
                "«Общий» — как число. Окно формата открывают правой кнопкой (<b>Формат ячеек…</b>) или "
                "<kbd>Ctrl</kbd>+<kbd>1</kbd>. <b>На работе пригодится</b> для выгрузок из банка и 1С, где даты "
                "приходят числами или текстом.",
                [{"click": "B2"}],
            ),
        ],
    )
)

# ---------- 07-02: СЕГОДНЯ и Ctrl+; ----------
DUE = [dt.date(2026, 10, 20), dt.date(2026, 10, 5), dt.date(2026, 10, 12), dt.date(2026, 11, 2), dt.date(2026, 9, 30)]
cells = {
    "A1": label("Отчёт на дату"),
    "B1": date_cell(),
    "A2": label("Файл создан"),
    "A4": head("Счёт"),
    "B4": head("Срок оплаты"),
    "C4": head("Дней до срока"),
}
for i, d in enumerate(DUE, start=5):
    cells[f"A{i}"] = f"№ {96 + i}"
    cells[f"B{i}"] = date_cell(d)
    cells[f"C{i}"] = date_cell()  # ловушка: столбец с форматом даты
ex = {"B1": serial(TODAY), "B2": serial(TODAY)}
ex |= {f"C{i}": (d - TODAY).days for i, d in enumerate(DUE, start=5)}
LESSONS.append(
    lesson(
        2,
        "today",
        "СЕГОДНЯ и Ctrl+;: дата, которая меняется, и дата, которая нет",
        "Dates.xlsx, лист date format (рис. 7.3), Staticdate.xls (рис. 7.6)",
        {
            "file": "Счета_к_оплате.xlsx",
            "name": "Счета",
            "columns": {"A": 150, "B": 130, "C": 140},
            "rows": 10,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "Бухгалтер ТОО ведёт реестр счетов. Каждое утро нужно видеть, сколько дней осталось до оплаты. "
                "Дата отчёта должна обновляться сама, а дата создания файла — нет.",
                [{"wait": 3000}],
            ),
            step(
                "{fn:TODAY}: дата на сегодня",
                "В <code>B1</code>: <code>{f:=TODAY()}</code>. Скобки пустые — у функции нет аргументов. "
                f"В плеере «сегодня» — <b>{ru(TODAY)}</b>, в вашем Excel будет ваша дата. Excel пересчитывает "
                "{fn:TODAY} при каждом открытии файла, поэтому завтра в <code>B1</code> будет завтрашняя дата.",
                [{"click": "B1"}, {"type": "=TODAY()"}, enter()],
            ),
            step(
                "Ctrl+; — дата, которая не меняется",
                "В <code>B2</code> нажмите <kbd>Ctrl</kbd>+<kbd>;</kbd> (в русской раскладке это клавиша «Ж») и "
                "Enter. Excel вписал сегодняшнюю дату как обычное значение, а не формулу. Через месяц там "
                f"останется {ru(TODAY)} — день, когда создали файл.",
                [{"click": "B2"}, {"keys": ["Ctrl", ";"]}, enter()],
            ),
            step(
                "Дней до срока",
                "Срок минус сегодня — число дней: <code>{f:=B5-$B$1}</code>. <kbd>F4</kbd> закрепляет "
                "<code>$B$1</code>, чтобы при протягивании все строки вычитали одну дату. Протяните до "
                "<code>C9</code>… Вместо чисел — даты и решётки!",
                [
                    {"click": "C5"},
                    {"type": "="},
                    {"clickRef": "B5"},
                    {"type": "-"},
                    {"clickRef": "B1"},
                    {"keys": ["F4"]},
                    enter(),
                    {"click": "C5"},
                    {"fill": "C5:C9"},
                ],
            ),
            step(
                "Частая ошибка: дата вместо числа",
                "У столбца C был формат даты, и разность Excel показал датой: 8 дней — «08.01.1900», 0 — "
                "«00.01.1900». Отрицательной даты не бывает, поэтому там решётки. Числа верные, неверен "
                "формат. Выделите <code>C5:C9</code> → правая кнопка → <b>Формат ячеек…</b> → <b>Общий</b>. "
                "Минус — счёт просрочен.",
                [
                    {"select": "C5:C9"},
                    {"contextMenu": "formatCells"},
                    {"dialogPick": "Общий"},
                    {"dialogButton": "OK"},
                ],
            ),
            step(
                "Что запомнить",
                "<code>{f:=TODAY()}</code> — дата, которая каждый день новая: для отчётов «на сегодня» и сроков. "
                "<kbd>Ctrl</kbd>+<kbd>;</kbd> — дата, которая уже не изменится: когда создан файл или принят "
                "документ. <b>На работе пригодится</b> для реестров счетов, договоров и задач со сроками.",
                [{"click": "C5"}],
            ),
        ],
        today=TODAY,
    )
)

# ---------- 07-03: год, месяц, день, день недели ----------
ORDERS = [dt.date(2026, 1, 5), dt.date(2026, 2, 14), dt.date(2026, 3, 22), dt.date(2026, 5, 1), dt.date(2026, 12, 16)]
cells = {
    "A1": head("Дата заказа"),
    "B1": head("Год"),
    "C1": head("Месяц"),
    "D1": head("День"),
    "E1": head("День недели"),
    "F1": head("Из частей"),
    "G1": head("Без типа"),
}
ex = {}
for i, d in enumerate(ORDERS, start=2):
    cells[f"A{i}"] = date_cell(d)
    cells[f"F{i}"] = date_cell()
    ex |= {
        f"B{i}": d.year,
        f"C{i}": d.month,
        f"D{i}": d.day,
        f"E{i}": x_weekday(d, 2),
        f"F{i}": serial(x_date(d.year, d.month, d.day)),
        f"G{i}": x_weekday(d, 1),
    }
LESSONS.append(
    lesson(
        3,
        "date-parts",
        "ГОД, МЕСЯЦ, ДЕНЬ, ДЕНЬНЕД и ДАТА",
        "Dates.xlsx, лист date format (рис. 7.3)",
        {
            "file": "Заказы_по_датам.xlsx",
            "name": "Заказы",
            "columns": {"A": 110, "B": 60, "C": 70, "D": 60, "E": 110, "F": 110, "G": 90},
            "rows": 7,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "Интернет-магазин в Шымкенте хочет понять, в какие месяцы и дни недели заказывают больше. "
                "Для сводки по месяцам и дням недели из даты нужно достать её части.",
                [{"wait": 3000}],
            ),
            step(
                "{fn:YEAR}, {fn:MONTH}, {fn:DAY}",
                "<code>{f:=YEAR(A2)}</code> — год, <code>{f:=MONTH(A2)}</code> — номер месяца (1 — январь), "
                "<code>{f:=DAY(A2)}</code> — число месяца. <kbd>Tab</kbd> переходит в соседнюю ячейку справа. "
                "Протяните все три формулы вниз.",
                [
                    {"click": "B2"},
                    {"type": "=YEAR("},
                    {"clickRef": "A2"},
                    {"type": ")"},
                    {"keys": ["Tab"]},
                    {"type": "=MONTH("},
                    {"clickRef": "A2"},
                    {"type": ")"},
                    {"keys": ["Tab"]},
                    {"type": "=DAY("},
                    {"clickRef": "A2"},
                    {"type": ")"},
                    enter(),
                    {"click": "B2"},
                    {"fill": "B2:B6"},
                    {"click": "C2"},
                    {"fill": "C2:C6"},
                    {"click": "D2"},
                    {"fill": "D2:D6"},
                ],
            ),
            step(
                "{fn:WEEKDAY}: день недели числом",
                "<code>{f:=WEEKDAY(A2,2)}</code> — номер дня недели. Второй аргумент 2 — неделя с "
                "понедельника: пн — 1, …, вс — 7. Понедельник 05.01.2026 дал 1, суббота 14.02 — 6. "
                "По числу легко отобрать выходные (6 и 7) или посчитать заказы по дням недели.",
                [
                    {"click": "E2"},
                    {"type": "=WEEKDAY("},
                    {"clickRef": "A2"},
                    {"type": ",2)"},
                    enter(),
                    {"click": "E2"},
                    {"fill": "E2:E6"},
                ],
            ),
            step(
                "{fn:DATE}: собрать дату из частей",
                "Обратная задача: год, месяц и день лежат в разных ячейках. <code>{f:=DATE(B2,C2,D2)}</code> "
                "собирает из них дату. Столбец F заранее в формате «Дата». {fn:DATE} понимает и «лишние» числа: "
                "<code>{f:=DATE(2026,13,1)}</code> — это 01.01.2027.",
                [
                    {"click": "F2"},
                    {"type": "=DATE("},
                    {"clickRef": "B2"},
                    {"type": ","},
                    {"clickRef": "C2"},
                    {"type": ","},
                    {"clickRef": "D2"},
                    {"type": ")"},
                    enter(),
                    {"click": "F2"},
                    {"fill": "F2:F6"},
                ],
            ),
            step(
                "Частая ошибка: {fn:WEEKDAY} без типа",
                "<code>{f:=WEEKDAY(A2)}</code> без второго аргумента считает неделю с <b>воскресенья</b>: вс — 1, "
                "пн — 2, …, сб — 7. Понедельник получил 2, а воскресенье 22.03 — 1. Сравните со столбцом E. "
                "Указывайте тип явно: 2 — пн = 1, 3 — пн = 0.",
                [
                    {"click": "G2"},
                    {"type": "=WEEKDAY("},
                    {"clickRef": "A2"},
                    {"type": ")"},
                    enter(),
                    {"click": "G2"},
                    {"fill": "G2:G6"},
                ],
            ),
            step(
                "Что запомнить",
                "{fn:YEAR}, {fn:MONTH}, {fn:DAY} разбирают дату, {fn:DATE} собирает. "
                "<code>{f:=WEEKDAY(A2,2)}</code> — день недели с понедельника. <b>На работе пригодится</b> для "
                "сводок продаж по месяцам и дням недели и для проверки, не выпал ли срок на выходной.",
                [{"click": "E2"}],
            ),
        ],
    )
)

# ---------- 07-04: РАБДЕНЬ ----------
HOLIDAYS_WINTER = [dt.date(2026, 12, 16), dt.date(2027, 1, 1), dt.date(2027, 1, 2), dt.date(2027, 1, 7)]
CONTRACTS = [
    ("№ 17", dt.date(2026, 11, 23), 20),
    ("№ 18", dt.date(2026, 12, 1), 15),
    ("№ 19", dt.date(2026, 12, 7), 30),
    ("№ 20", dt.date(2026, 12, 21), 10),
]
cells = {
    "A1": head("Договор"),
    "B1": head("Подписан"),
    "C1": head("Раб. дней"),
    "D1": head("Поставка"),
    "E1": head("С праздниками"),
    "G1": head("Праздники"),
}
ex = {}
for i, (num, signed, days) in enumerate(CONTRACTS, start=2):
    cells |= {f"A{i}": num, f"B{i}": date_cell(signed), f"C{i}": days, f"D{i}": date_cell(), f"E{i}": date_cell()}
    ex[f"D{i}"] = serial(x_workday(signed, days))
    ex[f"E{i}"] = serial(x_workday(signed, days, holidays=HOLIDAYS_WINTER))
for i, d in enumerate(HOLIDAYS_WINTER, start=2):
    cells[f"G{i}"] = date_cell(d)
moved = [CONTRACTS[i - 2][0] for i in range(2, 6) if ex[f"D{i}"] != ex[f"E{i}"]]
LESSONS.append(
    lesson(
        4,
        "workday",
        "РАБДЕНЬ: дата через N рабочих дней",
        "Dates.xlsx, лист date format (рис. 7.3)",
        {
            "file": "Сроки_поставки.xlsx",
            "name": "Договоры",
            "columns": {"A": 80, "B": 100, "C": 90, "D": 110, "E": 130, "F": 20, "G": 100},
            "rows": 7,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "Поставщик обещает привезти оборудование «через N рабочих дней после подписания договора». "
                "Считать по календарю долго, и легко забыть про выходные и праздники. Дату поставки посчитает "
                "{fn:WORKDAY}.",
                [{"wait": 3000}],
            ),
            step(
                "{fn:WORKDAY}: дата через N рабочих дней",
                "<code>{f:=WORKDAY(B2,C2)}</code>: начальная дата и сколько рабочих дней отсчитать. Суббота и "
                "воскресенье пропускаются, сам день подписания не считается. Столбец D заранее в формате «Дата».",
                [
                    {"click": "D2"},
                    {"type": "=WORKDAY("},
                    {"clickRef": "B2"},
                    {"type": ","},
                    {"clickRef": "C2"},
                    {"type": ")"},
                    enter(),
                    {"click": "D2"},
                    {"fill": "D2:D5"},
                ],
            ),
            step(
                "Праздники — третьим аргументом",
                "Третий аргумент — диапазон с праздниками: <code>{f:=WORKDAY(B2,C2,$G$2:$G$5)}</code>. "
                "<kbd>F4</kbd> закрепляет диапазон, иначе при протягивании он съедет вниз. У договоров "
                f"{', '.join(moved)} срок проходит через 16 декабря и Новый год, и поставка сдвинулась.",
                [
                    {"click": "E2"},
                    {"type": "=WORKDAY("},
                    {"clickRef": "B2"},
                    {"type": ","},
                    {"clickRef": "C2"},
                    {"type": ","},
                    {"dragRef": "G2:G5"},
                    {"keys": ["F4"]},
                    {"type": ")"},
                    enter(),
                    {"click": "E2"},
                    {"fill": "E2:E5"},
                ],
            ),
            step(
                "Частая ошибка: праздник в выходной",
                "02.01.2027 — суббота: {fn:WORKDAY} её и так пропускает, на ответ она не влияет. Если по закону "
                "выходной переносится на рабочий день, впишите в список <b>перенесённый</b> день. Иначе функция "
                "посчитает его рабочим. Праздники и переносы на год берите из производственного календаря.",
                [{"click": "G4"}, {"wait": 2500}],
            ),
            step(
                "Что запомнить",
                "<code>{f:=WORKDAY(начало,дней,праздники)}</code> — дата через N рабочих дней. С минусом "
                "отсчитывает назад: <code>{f:=WORKDAY(B2,-5)}</code> — за 5 рабочих дней до. "
                "<b>На работе пригодится</b> для сроков поставок, ответов на письма и госзакупок.",
                [{"click": "E2"}],
            ),
        ],
    )
)

# ---------- 07-05: ЧИСТРАБДНИ ----------
HOLIDAYS_Q1 = [
    dt.date(2027, 1, 1),
    dt.date(2027, 1, 7),
    dt.date(2027, 3, 8),
    dt.date(2027, 3, 22),
    dt.date(2027, 3, 23),
]
PERIODS = [
    ("Январь 2027", dt.date(2027, 1, 1), dt.date(2027, 1, 31)),
    ("Февраль 2027", dt.date(2027, 2, 1), dt.date(2027, 2, 28)),
    ("Март 2027", dt.date(2027, 3, 1), dt.date(2027, 3, 31)),
    ("I квартал", dt.date(2027, 1, 1), dt.date(2027, 3, 31)),
    ("Командировка", dt.date(2027, 2, 1), dt.date(2027, 2, 5)),
]
cells = {
    "A1": head("Период"),
    "B1": head("Начало"),
    "C1": head("Конец"),
    "D1": head("Будни"),
    "E1": head("С праздниками"),
    "G1": head("Праздники"),
}
ex = {}
for i, (name, start, end) in enumerate(PERIODS, start=2):
    cells |= {f"A{i}": name, f"B{i}": date_cell(start), f"C{i}": date_cell(end)}
    ex[f"D{i}"] = x_networkdays(start, end)
    ex[f"E{i}"] = x_networkdays(start, end, holidays=HOLIDAYS_Q1)
for i, d in enumerate(HOLIDAYS_Q1, start=2):
    cells[f"G{i}"] = date_cell(d)
LESSONS.append(
    lesson(
        5,
        "networkdays",
        "ЧИСТРАБДНИ: сколько рабочих дней между датами",
        "Dates.xlsx, лист date format (рис. 7.3)",
        {
            "file": "Норма_рабочих_дней.xlsx",
            "name": "Норма",
            "columns": {"A": 130, "B": 100, "C": 100, "D": 80, "E": 130, "F": 20, "G": 100},
            "rows": 7,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "Для табеля и зарплаты бухгалтеру нужна норма рабочих дней по месяцам первого квартала. "
                "Праздники-будни этого периода выписаны в столбец G. Пересчитывать по календарю не будем: "
                "есть {fn:NETWORKDAYS}.",
                [{"wait": 3000}],
            ),
            step(
                "{fn:NETWORKDAYS}: будни между датами",
                "<code>{f:=NETWORKDAYS(B2,C2)}</code> — число рабочих дней от начала до конца периода, без "
                f"суббот и воскресений. В январе 2027 года будних дней <b>{ex['D2']}</b>, в квартале — "
                f"<b>{ex['D5']}</b>.",
                [
                    {"click": "D2"},
                    {"type": "=NETWORKDAYS("},
                    {"clickRef": "B2"},
                    {"type": ","},
                    {"clickRef": "C2"},
                    {"type": ")"},
                    enter(),
                    {"click": "D2"},
                    {"fill": "D2:D6"},
                ],
            ),
            step(
                "Минус праздники",
                "Третий аргумент — праздники: <code>{f:=NETWORKDAYS(B2,C2,$G$2:$G$6)}</code>. В январе "
                f"остаётся <b>{ex['E2']}</b> рабочих дней, в марте — <b>{ex['E4']}</b>. Список праздников "
                "здесь — пример. Настоящий берите из производственного календаря на год, вместе с переносами "
                "выходных.",
                [
                    {"click": "E2"},
                    {"type": "=NETWORKDAYS("},
                    {"clickRef": "B2"},
                    {"type": ","},
                    {"clickRef": "C2"},
                    {"type": ","},
                    {"dragRef": "G2:G6"},
                    {"keys": ["F4"]},
                    {"type": ")"},
                    enter(),
                    {"click": "E2"},
                    {"fill": "E2:E6"},
                ],
            ),
            step(
                "Частая ошибка: обе даты считаются",
                "Командировка с понедельника 01.02 по пятницу 05.02 — <b>5</b> рабочих дней, а не 4. "
                "{fn:NETWORKDAYS} считает и первый, и последний день. Простое вычитание <code>C6-B6</code> "
                "дало бы 4: оно считает промежутки между датами, а не сами дни.",
                [{"click": "E6"}, {"wait": 2500}],
            ),
            step(
                "Что запомнить",
                "<code>{f:=NETWORKDAYS(начало,конец,праздники)}</code> — сколько рабочих дней в периоде, включая "
                "обе даты. {fn:WORKDAY} отвечает на обратный вопрос: какая дата будет через N рабочих дней. "
                "<b>На работе пригодится</b> для табеля, нормы часов, оплаты по рабочим дням.",
                [{"click": "E5"}],
            ),
        ],
    )
)

# ---------- 07-06: РАБДЕНЬ.МЕЖД и ЧИСТРАБДНИ.МЕЖД ----------
START = dt.date(2027, 1, 4)
SCHEDULES = [
    ("Пятидневка (сб, вс)", 1),
    ("Шестидневка (вс)", 11),
    ("Выходные вс и пн", 2),
    ("Строкой: только вс", "0000001"),
    ("Строкой: пн и вт", "1100000"),
]
cells = {
    "A1": label("Старт проекта"),
    "B1": date_cell(START),
    "A3": head("График"),
    "B3": head("Выходные"),
    "C3": head("100-й рабочий день"),
    "D3": head("Раб. дней в 2027"),
}
ex = {}
for i, (name, code) in enumerate(SCHEDULES, start=4):
    cells |= {f"A{i}": name, f"B{i}": code, f"C{i}": date_cell()}
    ex[f"C{i}"] = serial(x_workday(START, 100, weekend_of(code)))
    ex[f"D{i}"] = x_networkdays(dt.date(2027, 1, 1), dt.date(2027, 12, 31), weekend_of(code))
SIX_DAY_100 = x_workday(START, 100, weekend_of(11))
WEEKS_EARLIER = (x_workday(START, 100) - SIX_DAY_100).days // 7
LESSONS.append(
    lesson(
        6,
        "workday-intl",
        "РАБДЕНЬ.МЕЖД и ЧИСТРАБДНИ.МЕЖД: свои выходные",
        "Dates.xlsx, лист date format (рис. 7.4)",
        {
            "file": "Графики_работы.xlsx",
            "name": "Графики",
            "columns": {"A": 180, "B": 100, "C": 160, "D": 150},
            "rows": 9,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "Офис работает пять дней в неделю, магазин стройматериалов — шесть, ресторан отдыхает в "
                "воскресенье и понедельник. Срок «100 рабочих дней» у каждого свой. {fn:WORKDAY} знает только "
                "выходные в субботу и воскресенье, а {fn:WORKDAY.INTL} — любые.",
                [{"wait": 3000}],
            ),
            step(
                "Код выходных",
                "<code>{f:=WORKDAY.INTL($B$1,100,B4)}</code>: третий аргумент — код выходных. 1 — сб и вс, "
                "2 — вс и пн, 3 — пн и вт, …, 7 — пт и сб; 11 — только вс, 12 — только пн, …, 17 — только сб. "
                f"У шестидневки сотый рабочий день — <b>{ru(SIX_DAY_100)}</b>, на {WEEKS_EARLIER} недели раньше, "
                "чем у офиса.",
                [
                    {"click": "C4"},
                    {"type": "=WORKDAY.INTL("},
                    {"clickRef": "B1"},
                    {"keys": ["F4"]},
                    {"type": ",100,"},
                    {"clickRef": "B4"},
                    {"type": ")"},
                    enter(),
                    {"click": "C4"},
                    {"fill": "C4:C8"},
                ],
            ),
            step(
                "Выходные строкой",
                "Вместо кода можно задать строку из семи знаков. Знаки — дни с понедельника по воскресенье: "
                "1 — выходной, 0 — рабочий. «0000001» — только воскресенье, ответ тот же, что у кода 11 "
                "(сравните <code>C5</code> и <code>C7</code>). Строкой задают любой график, даже три выходных.",
                [{"click": "C7"}, {"showRefs": "C7"}, {"wait": 2500}],
            ),
            step(
                "{fn:NETWORKDAYS.INTL}",
                "Сколько рабочих дней в году при каждом графике: "
                "<code>{f:=NETWORKDAYS.INTL(DATE(2027,1,1),DATE(2027,12,31),B4)}</code>. Коды и строки те же. "
                f"Пятидневка — <b>{ex['D4']}</b> дней, шестидневка — <b>{ex['D5']}</b> (без учёта праздников; их "
                "добавляют четвёртым аргументом).",
                [
                    {"click": "D4"},
                    {"type": "=NETWORKDAYS.INTL(DATE(2027,1,1),DATE(2027,12,31),"},
                    {"clickRef": "B4"},
                    {"type": ")"},
                    enter(),
                    {"click": "D4"},
                    {"fill": "D4:D8"},
                ],
            ),
            step(
                "Частая ошибка: строка стала числом",
                "Строку выходных набирают с апострофом (<b>'0000001</b>) или прямо в формуле в кавычках: "
                '<code>{f:=WORKDAY.INTL($B$1,100,"0000001")}</code>. Без апострофа Excel превратит 0000001 в '
                "число 1, и выходными станут суббота и воскресенье. В <code>B7</code> строка прижата влево — "
                "это текст, значит, всё верно.",
                [{"click": "B7"}, {"wait": 2500}],
            ),
            step(
                "Что запомнить",
                "{fn:WORKDAY.INTL} и {fn:NETWORKDAYS.INTL} — то же, что {fn:WORKDAY} и {fn:NETWORKDAYS}, но "
                "выходные задаются кодом (1–7, 11–17) или строкой «0000011». <b>На работе пригодится</b> для "
                "магазинов, ресторанов, сменных графиков и партнёров из стран с другими выходными.",
                [{"click": "C4"}],
            ),
        ],
    )
)

# ---------- 07-07: РАЗНДАТ ----------
CARS = [
    ("Toyota Camry", dt.date(2024, 10, 15), dt.date(2026, 4, 10)),
    ("Hyundai Tucson", dt.date(2025, 2, 3), dt.date(2026, 2, 28)),
    ("Lada Vesta", dt.date(2025, 6, 20), dt.date(2026, 6, 19)),
    ("Kia Rio", dt.date(2026, 1, 31), dt.date(2026, 3, 1)),
    ("Chevrolet Cobalt", dt.date(2026, 5, 12), dt.date(2025, 11, 5)),  # даты перепутаны при вводе
]
cells = {
    "A1": head("Автомобиль"),
    "B1": head("Поступил"),
    "C1": head("Продан"),
    "D1": head("Лет"),
    "E1": head("Месяцев"),
    "F1": head("Дней"),
    "G1": head("Лет и месяцев"),
}
ex = {}
for i, (car, a, b) in enumerate(CARS, start=2):
    cells |= {f"A{i}": car, f"B{i}": date_cell(a), f"C{i}": date_cell(b)}
    y, m, d = x_datedif(a, b, "y"), x_datedif(a, b, "m"), x_datedif(a, b, "d")
    ex |= {f"D{i}": y, f"E{i}": m, f"F{i}": d}
    ex[f"G{i}"] = "#NUM!" if y == "#NUM!" else f"{y} г. {x_datedif(a, b, 'ym')} мес."
LESSONS.append(
    lesson(
        7,
        "datedif",
        "РАЗНДАТ: сколько полных лет, месяцев и дней",
        "Datedif.xlsx (рис. 7.5)",
        {
            "file": "Стоянка_авто.xlsx",
            "name": "Стоянка",
            "columns": {"A": 140, "B": 100, "C": 100, "D": 60, "E": 80, "F": 70, "G": 120},
            "rows": 7,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "Автосалон с пробегом в Караганде даёт скидку на машины, которые долго стоят на площадке. Нужно "
                "знать, сколько <b>полных</b> месяцев каждая машина простояла от поступления до продажи.",
                [{"wait": 3000}],
            ),
            step(
                "{fn:DATEDIF}: полные годы",
                '<code>{f:=DATEDIF(B2,C2,"y")}</code>: начало, конец и единица в кавычках. "y" — полные годы. '
                "Excel <b>не подсказывает</b> эту функцию: её нет ни в списке при наборе, ни в мастере функций. "
                "Набирайте имя целиком.",
                [
                    {"click": "D2"},
                    {"type": "=DATEDIF("},
                    {"clickRef": "B2"},
                    {"type": ","},
                    {"clickRef": "C2"},
                    {"type": ',"y")'},
                    {"keys": ["Tab"]},
                ],
            ),
            step(
                "Месяцы и дни",
                '"m" — полные месяцы, "d" — дни. Camry простояла <b>'
                f"{ex['E2']}</b> полных месяцев, или {ex['F2']} дней. Lada — {ex['F4']} дней, почти год, но "
                f"полных лет <b>{ex['D4']}</b>: до годовщины не хватило дня. Протяните формулы до 6-й строки.",
                [
                    {"type": "=DATEDIF("},
                    {"clickRef": "B2"},
                    {"type": ","},
                    {"clickRef": "C2"},
                    {"type": ',"m")'},
                    {"keys": ["Tab"]},
                    {"type": "=DATEDIF("},
                    {"clickRef": "B2"},
                    {"type": ","},
                    {"clickRef": "C2"},
                    {"type": ',"d")'},
                    enter(),
                    {"click": "D2"},
                    {"fill": "D2:D6"},
                    {"click": "E2"},
                    {"fill": "E2:E6"},
                    {"click": "F2"},
                    {"fill": "F2:F6"},
                ],
            ),
            step(
                "Годы и месяцы в одной ячейке",
                '"ym" — месяцы сверх полных лет. Подпись «1 г. 5 мес.» собирают знаком &: '
                '<code>{f:=DATEDIF(B2,C2,"y")&" г. "&DATEDIF(B2,C2,"ym")&" мес."}</code>.',
                [
                    {"click": "G2"},
                    {"type": '=DATEDIF(B2,C2,"y")&" г. "&DATEDIF(B2,C2,"ym")&" мес."'},
                    enter(),
                    {"click": "G2"},
                    {"fill": "G2:G6"},
                ],
            ),
            step(
                "Частая ошибка: #ЧИСЛО!",
                "У Chevrolet в 6-й строке дата продажи <b>раньше</b> даты поступления — при вводе перепутали. "
                "{fn:DATEDIF} тогда возвращает <code>#ЧИСЛО!</code>. Начальная дата всегда первая.",
                [{"click": "D6"}, {"wait": 2500}],
            ),
            step(
                "Что запомнить",
                '<code>{f:=DATEDIF(начало,конец,"m")}</code> — полные месяцы; "y" — годы, "d" — дни, '
                '"ym" — месяцы сверх лет. Функции нет в подсказках Excel, но она работает. <b>На работе '
                "пригодится</b> для стажа, возраста, сроков хранения и аренды.",
                [{"click": "E2"}],
            ),
        ],
    )
)


def dump(path, data):
    text = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=118)
    path.write_text(
        f"# Глава 7 (даты). Собрано генератором; ответы expect посчитаны независимо.\n{text}",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    slugs = {
        1: "serial-dates",
        2: "today",
        3: "date-parts",
        4: "workday",
        5: "networkdays",
        6: "workday-intl",
        7: "datedif",
    }
    for les in LESSONS:
        dump(ROOT / "lessons" / f"07-{les['order']:02d}-{slugs[les['order']]}.yaml", les)
    import exercises_ch07  # noqa: E402  задания — в отдельном файле

    exercises_ch07.main(ROOT, dump)
    print("ok:", len(LESSONS), "уроков")
