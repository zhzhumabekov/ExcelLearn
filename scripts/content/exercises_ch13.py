"""Задания главы 13 — по мотивам заданий книги, данные свои. Время — доля суток, ответы считаются здесь."""

import datetime as dt

from gen_ch08 import head, label, r4, serial

DAY = 86_400
EXERCISES = []


def t(h, m=0, s=0):
    return (h * 3600 + m * 60 + s) / DAY


def r9(x):
    return round(x, 9)


def cell(v, fmt):
    return {"v": v, "fmt": fmt}


def ex(number, eid, title, task, explain, mistake, sheet, cells_f, fills, expect):
    """cells_f: адрес → формула или (формула, формат)."""
    cells = {}
    for addr, f in cells_f.items():
        formula, fmt = f if isinstance(f, tuple) else (f, None)
        cells[addr] = {"f": formula, "fmt": fmt} if fmt else {"f": formula}
    solution = {"cells": cells}
    if fills:
        solution["fill"] = [{"source": s, "to": f"{s}:{e}"} for s, e in fills]
    EXERCISES.append(
        {
            "id": eid,
            "number": number,
            "title": title,
            "task": task,
            "explain": explain,
            "mistake": mistake,
            "sheet": sheet,
            "solution": solution,
            "expect": expect,
        }
    )


# 1. Через 18 часов
START1 = serial(dt.date(2026, 10, 13)) + t(14, 12)
ex(
    1,
    "plus-18-hours",
    "Через 18 часов",
    "Груз отправили из Алматы 13.10.2026 в 14:12 (<code>B1</code>), в пути он будет <b>18 часов</b>. Когда он "
    "прибудет (<code>B2</code>)?",
    "18 часов — это 18/24 суток: <code>{f:=B1+18/24}</code>. То же даёт <code>{f:=B1+TIME(18,0,0)}</code>. Excel "
    "сам перейдёт на следующий день.",
    "Прибавить 18: к дате прибавятся 18 суток, а не часов.",
    {
        "file": "Через_18_часов.xlsx",
        "name": "Груз",
        "columns": {"A": 160, "B": 170},
        "rows": 3,
        "cells": {
            "A1": label("Отправлен"),
            "B1": cell(r9(START1), "datetime"),
            "A2": label("Прибудет"),
            "B2": {"fmt": "datetime"},
        },
    },
    {"B2": ("=B1+18/24", "datetime")},
    [],
    {"B2": r9(START1 + 18 / 24)},
)

# 2. Марафон
RUNNERS = [("Алибек", t(2, 41, 15)), ("Жанна", t(3, 5, 40)), ("Сергей", t(2, 58, 2)), ("Мадина", t(3, 22, 30))]
cells = {"A1": head("Бегун"), "B1": head("Время"), "C1": head("Минут"), "D1": head("Секунд")}
expect = {}
for i, (n, v) in enumerate(RUNNERS, start=2):
    cells |= {f"A{i}": n, f"B{i}": cell(r9(v), "timeSec"), f"C{i}": {"fmt": "number"}, f"D{i}": {}}
    expect |= {f"C{i}": r4(v * 1440), f"D{i}": round(v * DAY)}
cells |= {
    "A7": label("Среднее время"),
    "B7": {"fmt": "timeSec"},
    "A8": label("Алибек опередил Жанну на"),
    "B8": {"fmt": "timeSec"},
}
expect |= {"B7": r9(sum(v for _, v in RUNNERS) / 4), "B8": r9(RUNNERS[1][1] - RUNNERS[0][1])}
ex(
    2,
    "marathon",
    "Алматы марафон",
    "Четыре бегуна пробежали Алматы марафон. Найдите среднее время (<code>B7</code>), на сколько Алибек опередил "
    "Жанну (<code>B8</code>) и сколько минут (<code>C2:C5</code>) и секунд (<code>D2:D5</code>) бежал каждый.",
    "Время — доля суток, поэтому {fn:AVERAGE} и вычитание работают как с числами: <code>{f:=AVERAGE(B2:B5)}</code>, "
    "<code>{f:=B3-B2}</code>. В сутках 1 440 минут и 86 400 секунд: <code>{f:=B2*1440}</code>, "
    "<code>{f:=B2*86400}</code>.",
    "Умножить на 60: получатся не минуты, а доля суток × 60 — бессмысленное число.",
    {
        "file": "Марафон.xlsx",
        "name": "Марафон",
        "columns": {"A": 220, "B": 110, "C": 100, "D": 100},
        "rows": 9,
        "cells": cells,
    },
    {
        "B7": ("=AVERAGE(B2:B5)", "timeSec"),
        "B8": ("=B3-B2", "timeSec"),
        "C2": ("=B2*1440", "number"),
        "D2": "=B2*86400",
    },
    [("C2", "C5"), ("D2", "D5")],
    expect,
)

# 3. Цех: время окончания работ
JOBS = [
    ("Раскрой", dt.date(2026, 11, 2), 8, 0, 5.5),
    ("Сварка", dt.date(2026, 11, 2), 13, 30, 14),
    ("Покраска", dt.date(2026, 11, 3), 9, 15, 30),
    ("Сборка", dt.date(2026, 11, 4), 22, 0, 7.25),
]
cells = {"A1": head("Работа"), "B1": head("Начало"), "C1": head("Часов"), "D1": head("Окончание")}
expect = {}
for i, (n, d, h, m, dur) in enumerate(JOBS, start=2):
    start = serial(d) + t(h, m)
    cells |= {f"A{i}": n, f"B{i}": cell(r9(start), "datetime"), f"C{i}": dur, f"D{i}": {"fmt": "datetime"}}
    expect[f"D{i}"] = r9(start + dur / 24)
ex(
    3,
    "job-shop",
    "Когда закончится работа",
    "В цеху в Усть-Каменогорске известны дата и время начала каждой работы и сколько часов она займёт. Найдите "
    "дату и время окончания (<code>D2:D5</code>).",
    "Часы переводим в сутки делением на 24 и прибавляем к началу: <code>{f:=B2+C2/24}</code>. Покраска на 30 часов "
    "закончится на следующий день.",
    "Прибавить <code>{f:=TIME(C2,0,0)}</code>: {fn:TIME} не даёт больше суток, 30 часов превратятся в 6.",
    {
        "file": "Цех.xlsx",
        "name": "Работы",
        "columns": {"A": 120, "B": 150, "C": 80, "D": 150},
        "rows": 6,
        "cells": cells,
    },
    {"D2": ("=B2+C2/24", "datetime")},
    [("D2", "D5")],
    expect,
)

# 4. ВРЕМЯ из часов и минут
DEPS = [("Алматы — Астана", 7, 5), ("Астана — Шымкент", 13, 40), ("Шымкент — Актау", 18, 55), ("Актау — Атырау", 6, 0)]
cells = {"A1": head("Рейс"), "B1": head("Час"), "C1": head("Минуты"), "D1": head("Вылет")}
expect = {}
for i, (n, h, m) in enumerate(DEPS, start=2):
    cells |= {f"A{i}": n, f"B{i}": h, f"C{i}": m, f"D{i}": {"fmt": "time"}}
    expect[f"D{i}"] = r9(t(h, m))
ex(
    4,
    "time-from-parts",
    "Время вылета из часов и минут",
    "В выгрузке из системы бронирования час и минуты вылета — в разных столбцах. Соберите время вылета "
    "(<code>D2:D5</code>).",
    "<code>{f:=TIME(B2,C2,0)}</code> — часы, минуты и 0 секунд.",
    'Склеить <code>{f:=B2&":"&C2}</code>: получится текст «7:5», с ним нельзя считать.',
    {
        "file": "Рейсы.xlsx",
        "name": "Вылеты",
        "columns": {"A": 190, "B": 70, "C": 90, "D": 100},
        "rows": 6,
        "cells": cells,
    },
    {"D2": ("=TIME(B2,C2,0)", "time")},
    [("D2", "D5")],
    expect,
)

# 5. Опоздания
ARRIVALS = [("Асель", t(8, 52)), ("Данияр", t(9, 7)), ("Олжас", t(9, 0)), ("Марина", t(9, 31))]
cells = {"A1": head("Сотрудник"), "B1": head("Пришёл"), "C1": head("Отметка"), "D1": head("Опоздал, мин")}
expect = {}
for i, (n, v) in enumerate(ARRIVALS, start=2):
    cells |= {f"A{i}": n, f"B{i}": cell(r9(v), "time")}
    late = v > t(9) + 1e-12
    expect |= {f"C{i}": "опоздал" if late else "вовремя", f"D{i}": round((v - t(9)) * 1440) if late else 0}
F5C = '=IF(B2>TIME(9,0,0),"опоздал","вовремя")'
F5D = "=IF(B2>TIME(9,0,0),(B2-TIME(9,0,0))*1440,0)"
ex(
    5,
    "late",
    "Кто опоздал",
    "Рабочий день начинается в 9:00. Отметьте опоздавших (<code>C2:C5</code>) и посчитайте, на сколько минут они "
    "опоздали (<code>D2:D5</code>).",
    "<code>{f:" + F5C + "}</code>; минуты опоздания — разница × 1 440: <code>{f:" + F5D + "}</code>.",
    "Сравнивать с числом 9: время 9:07 — это 0,38 суток, оно всегда меньше 9.",
    {
        "file": "Опоздания.xlsx",
        "name": "Табель",
        "columns": {"A": 130, "B": 90, "C": 110, "D": 130},
        "rows": 6,
        "cells": cells,
    },
    {"C2": F5C, "D2": F5D},
    [("C2", "C5"), ("D2", "D5")],
    expect,
)

# 6. Ночные смены и оплата
SHIFTS = [("Пн", t(21), t(6)), ("Вт", t(8), t(17, 30)), ("Ср", t(23, 30), t(8)), ("Чт", t(19, 15), t(3, 45))]
RATE6 = 3000
cells = {
    "A1": label("Ставка, ₸ в час"),
    "B1": RATE6,
    "A3": head("День"),
    "B3": head("Начало"),
    "C3": head("Конец"),
    "D3": head("Часов"),
    "E3": head("Оплата"),
}
expect = {}
for i, (d, a, b) in enumerate(SHIFTS, start=4):
    cells |= {
        f"A{i}": d,
        f"B{i}": cell(r9(a), "time"),
        f"C{i}": cell(r9(b), "time"),
        f"D{i}": {"fmt": "number"},
        f"E{i}": {"fmt": "kzt"},
    }
    hours = 24 * (b - a) if b > a else 24 + 24 * (b - a)
    expect |= {f"D{i}": r4(hours), f"E{i}": r4(hours * RATE6)}
F6 = "=IF(C4>B4,24*(C4-B4),24+24*(C4-B4))"
ex(
    6,
    "night-pay",
    "Оплата ночных смен",
    "Медсестра работает посменно, иногда через полночь. Посчитайте часы каждой смены (<code>D4:D7</code>) и оплату "
    "по 3 000 ₸ в час (<code>E4:E7</code>).",
    "<code>{f:" + F6 + "}</code> — если конец меньше начала, смена закончилась завтра, добавляем 24 часа. Оплата: "
    "<code>{f:=D4*$B$1}</code>.",
    "Без {fn:IF}: смена с 21:00 до 6:00 даст −15 часов и отрицательную оплату.",
    {
        "file": "Ночные_смены.xlsx",
        "name": "Смены",
        "columns": {"A": 160, "B": 90, "C": 90, "D": 90, "E": 120},
        "rows": 8,
        "cells": cells,
    },
    {"D4": (F6, "number"), "E4": ("=D4*$B$1", "kzt")},
    [("D4", "D7"), ("E4", "E7")],
    expect,
)

# 7. Часы за неделю больше суток
WEEK7 = [t(9, 20), t(10, 5), t(8, 45), t(11, 30), t(9, 50), t(4, 15)]
DAYS7 = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
cells = {"A1": head("День"), "B1": head("Работал")}
for i, (d, v) in enumerate(zip(DAYS7, WEEK7, strict=True), start=2):
    cells |= {f"A{i}": d, f"B{i}": cell(r9(v), "time")}
total7 = sum(WEEK7)
cells |= {"A8": label("За неделю"), "B8": {"fmt": "hours"}, "A9": label("Часов числом"), "B9": {"fmt": "number"}}
ex(
    7,
    "week-hours",
    "Сколько часов за неделю",
    "Таксист записывает время работы по дням. Посчитайте время за неделю так, чтобы было видно больше 24 часов "
    "(<code>B8</code>), и то же — числом часов (<code>B9</code>).",
    "<code>{f:=SUM(B2:B7)}</code> в формате <b>[ч]:мм:сс</b> (Время → 37:30:55). Часы числом: "
    "<code>{f:=B8*24}</code> в формате Числовой.",
    "Оставить формат ч:мм: сумма 53:45 покажется как 5:45 — Excel отбросит двое суток.",
    {"file": "Неделя_таксиста.xlsx", "name": "Неделя", "columns": {"A": 160, "B": 130}, "rows": 10, "cells": cells},
    {"B8": ("=SUM(B2:B7)", "hours"), "B9": ("=B8*24", "number")},
    [],
    {"B8": r9(total7), "B9": r4(total7 * 24)},
)

# 8. Парковка: каждый начатый час
CARS = [("123ABC02", t(8, 10), t(9, 5)), ("456KZA01", t(10, 0), t(12, 0)), ("789BAA05", t(13, 45), t(17, 20))]
PRICE8 = 300
cells = {"A1": head("Номер"), "B1": head("Въезд"), "C1": head("Выезд"), "D1": head("Оплата")}
expect = {}
for i, (n, a, b) in enumerate(CARS, start=2):
    cells |= {f"A{i}": n, f"B{i}": cell(r9(a), "time"), f"C{i}": cell(r9(b), "time"), f"D{i}": {"fmt": "kzt"}}
    hours = -(-round((b - a) * 1440) // 60)  # начатый час — целиком
    expect[f"D{i}"] = hours * PRICE8
ex(
    8,
    "parking",
    "Парковка: каждый начатый час",
    "Парковка ТРЦ берёт 300 ₸ за каждый начатый час: 55 минут — 1 час, 2 часа ровно — 2 часа. Посчитайте оплату "
    "(<code>D2:D4</code>).",
    "Часы стоянки — <code>(C2-B2)*24</code>; {fn:ROUNDUP}(…; 0) округляет вверх до целого: "
    "<code>{f:=ROUNDUP((C2-B2)*24,0)*300}</code>.",
    "{fn:ROUND} вместо {fn:ROUNDUP}: 3 часа 35 минут округлятся до 4, а 3 часа 20 минут — до 3, хотя четвёртый час "
    "начат.",
    {
        "file": "Парковка.xlsx",
        "name": "Стоянка",
        "columns": {"A": 130, "B": 90, "C": 90, "D": 110},
        "rows": 5,
        "cells": cells,
    },
    {"D2": ("=ROUNDUP((C2-B2)*24,0)*300", "kzt")},
    [("D2", "D4")],
    expect,
)

# 9. Звонки по часам
CALLS = [t(9, 14, 5), t(9, 48, 30), t(10, 2, 11), t(11, 55, 40), t(11, 7, 3)]
cells = {"A1": head("Звонок"), "B1": head("Час"), "C1": head("Минута")}
expect = {}
for i, v in enumerate(CALLS, start=2):
    cells[f"A{i}"] = cell(r9(v), "timeSec")
    s = round(v * DAY)
    expect |= {f"B{i}": s // 3600, f"C{i}": s % 3600 // 60}
ex(
    9,
    "calls-hour",
    "В каком часу звонили",
    "Колл-центр банка анализирует нагрузку. Для каждого звонка выделите час (<code>B2:B6</code>) и минуту "
    "(<code>C2:C6</code>).",
    "<code>{f:=HOUR(A2)}</code> и <code>{f:=MINUTE(A2)}</code> возвращают целые числа — их удобно считать "
    "{fn:COUNTIF}: сколько звонков в 11-м часу.",
    "Считать час как <code>{f:=A2*24}</code>: получится 9,23, а не 9 — дробная часть мешает группировке.",
    {"file": "Звонки.xlsx", "name": "Звонки", "columns": {"A": 110, "B": 80, "C": 90}, "rows": 7, "cells": cells},
    {"B2": "=HOUR(A2)", "C2": "=MINUTE(A2)"},
    [("B2", "B6"), ("C2", "C6")],
    expect,
)

# 10. Время в пути с часовыми поясами
FLIGHTS = [
    ("Алматы — Москва", t(8, 0), t(10, 30), -2),
    ("Астана — Стамбул", t(14, 20), t(17, 5), -2),
    ("Алматы — Дубай", t(23, 40), t(2, 40), -1),
]
cells = {
    "A1": head("Рейс"),
    "B1": head("Вылет"),
    "C1": head("Прилёт"),
    "D1": head("Разница поясов"),
    "E1": head("В пути"),
}
expect = {}
for i, (n, a, b, z) in enumerate(FLIGHTS, start=2):
    cells |= {
        f"A{i}": n,
        f"B{i}": cell(r9(a), "time"),
        f"C{i}": cell(r9(b), "time"),
        f"D{i}": z,
        f"E{i}": {"fmt": "time"},
    }
    d = b - a - z / 24
    expect[f"E{i}"] = r9(d if d > 0 else d + 1)
F10 = "=MOD(C2-B2-D2/24,1)"
ex(
    10,
    "time-zones",
    "Время в пути с часовыми поясами",
    "Вылет — по местному времени города вылета, прилёт — по местному времени прибытия. В столбце D — на сколько "
    "часов время в городе прилёта отличается от Казахстана (Москва −2). Посчитайте время в пути (<code>E2:E4</code>).",
    "Переводим прилёт на время вылета: <code>C2-D2/24</code>. Рейс в Дубай прилетает после полуночи — {fn:MOD}(…; 1) "
    "отбрасывает целые сутки и убирает минус: <code>{f:" + F10 + "}</code>.",
    "Забыть пояс: Алматы — Москва покажет 2:30 вместо 4:30.",
    {
        "file": "Перелёты.xlsx",
        "name": "Рейсы",
        "columns": {"A": 180, "B": 80, "C": 80, "D": 140, "E": 90},
        "rows": 5,
        "cells": cells,
    },
    {"E2": (F10, "time")},
    [("E2", "E4")],
    expect,
)


def main(root, dump):
    dump(root / "exercises" / "ch13.yaml", {"chapter": "ch13", "exercises": EXERCISES})
