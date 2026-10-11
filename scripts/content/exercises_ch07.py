"""Задания главы 7 — по мотивам заданий книги, данные свои. Ответы expect считаются здесь, на Python.

СЕГОДНЯ() в файлах заданий нет: ответ зависел бы от дня, когда файл открыли. «Сегодня» — дата в ячейке,
в подсказке сказано, где на работе поставить {fn:TODAY}.
"""

import datetime as dt

from gen_ch07 import (
    date_cell,
    head,
    label,
    ru,
    serial,
    weekend_of,
    x_date,
    x_datedif,
    x_networkdays,
    x_weekday,
    x_workday,
)

EXERCISES = []


def ex(number, eid, title, task, explain, mistake, sheet, cells_f, fills, expect, dates=()):
    """dates — ячейки ответа в формате даты (в решении у них формат «Дата»)."""
    cells = {}
    for addr, f in cells_f.items():
        cells[addr] = {"f": f, "fmt": "date"} if addr in dates else {"f": f}
    solution = {"cells": cells}
    if fills:
        solution["fill"] = [{"source": s, "to": t} for s, t in fills]
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


def column(letter, first, last):
    return [f"{letter}{i}" for i in range(first, last + 1)]


# 1. Номер даты и дата по номеру
DATES = [dt.date(1991, 12, 16), dt.date(2006, 1, 25), dt.date(1950, 2, 14)]
NUMBERS = [4526, 45000, 46000]
cells = {"A1": head("Дата"), "B1": head("Номер"), "A5": head("Номер"), "B5": head("Дата")}
expect = {}
for i, d in enumerate(DATES, start=2):
    cells[f"A{i}"] = date_cell(d)
    expect[f"B{i}"] = serial(d)
for i, n in enumerate(NUMBERS, start=6):
    cells[f"A{i}"] = n
    expect[f"B{i}"] = n
ex(
    1,
    "serial-numbers",
    "Номер даты и дата по номеру",
    "В <code>A2:A4</code> — даты. Покажите в <code>B2:B4</code> их номера в Excel. В <code>A6:A8</code> — номера; "
    "покажите в <code>B6:B8</code> даты, которые за ними стоят. Какой номер у 16 декабря 1991 года?",
    "Значение то же — меняется формат. <code>{f:=A2}</code> и <b>Формат ячеек → Общий</b> покажут номер; "
    "<code>{f:=A6}</code> и <b>Формат ячеек → Дата</b> — дату. Окно — правой кнопкой или "
    "<kbd>Ctrl</kbd>+<kbd>1</kbd>.",
    "Excel часто сам ставит формуле формат ячейки, на которую она ссылается: <code>{f:=A2}</code> покажет дату. "
    "Это не ошибка формулы — поменяйте формат.",
    {"file": "Номера_дат.xlsx", "name": "Даты", "columns": {"A": 110, "B": 110}, "cells": cells},
    {"B2": "=A2", "B6": "=A6"},
    [("B2", "B2:B4"), ("B6", "B6:B8")],
    expect,
    dates={"B6"},
)

# 2. Срок через 74 рабочих дня
START2 = dt.date(2026, 11, 2)
HOL2 = [dt.date(2026, 12, 16), dt.date(2027, 1, 1), dt.date(2027, 1, 7)]
cells = {
    "A1": label("Сегодня"),
    "B1": date_cell(START2),
    "A2": label("Через 74 раб. дня"),
    "A3": label("С праздниками"),
    "D1": head("Праздники"),
}
for i, d in enumerate(HOL2, start=2):
    cells[f"D{i}"] = date_cell(d)
ex(
    2,
    "deadline-74",
    "Срок через 74 рабочих дня",
    "Тендерная комиссия ответит через 74 рабочих дня. Найдите дату ответа без учёта праздников "
    "(<code>B2</code>) и с праздниками из <code>D2:D4</code> (<code>B3</code>).",
    "<code>{f:=WORKDAY(B1,74)}</code> и <code>{f:=WORKDAY(B1,74,D2:D4)}</code>. На работе вместо <code>B1</code> "
    "можно поставить <code>{f:=TODAY()}</code> — срок будет считаться от сегодняшней даты.",
    "Посчитать <code>{f:=B1+74}</code> — это календарные дни, ответ выйдет на месяц раньше.",
    {"file": "Срок_ответа.xlsx", "name": "Срок", "columns": {"A": 150, "B": 110, "C": 30, "D": 100}, "cells": cells},
    {"B2": "=WORKDAY(B1,74)", "B3": "=WORKDAY(B1,74,D2:D4)"},
    [],
    {"B2": serial(x_workday(START2, 74)), "B3": serial(x_workday(START2, 74, holidays=HOL2))},
    dates={"B2", "B3"},
)

# 3. Рабочие дни между датами
A3, B3 = dt.date(2026, 7, 10), dt.date(2027, 8, 15)
HOL3 = [dt.date(2026, 12, 16), dt.date(2027, 1, 1), dt.date(2027, 1, 7), dt.date(2027, 3, 8), dt.date(2027, 7, 6)]
cells = {
    "A1": label("Начало"),
    "B1": date_cell(A3),
    "A2": label("Конец"),
    "B2": date_cell(B3),
    "A3": label("Рабочих дней"),
    "A4": label("Без праздников"),
    "D1": head("Праздники"),
}
for i, d in enumerate(HOL3, start=2):
    cells[f"D{i}"] = date_cell(d)
ex(
    3,
    "workdays-between",
    "Рабочие дни между датами",
    f"Проект идёт с {ru(A3)} по {ru(B3)}. Сколько в нём рабочих дней (пн–пт, <code>B3</code>) и сколько, если "
    "не считать праздники из столбца D (<code>B4</code>)?",
    "<code>{f:=NETWORKDAYS(B1,B2)}</code> и <code>{f:=NETWORKDAYS(B1,B2,D2:D6)}</code>. Обе даты входят в счёт.",
    "Поставить даты в другом порядке: функция вернёт то же число, но с минусом.",
    {"file": "Рабочие_дни.xlsx", "name": "Проект", "columns": {"A": 130, "B": 110, "C": 30, "D": 100}, "cells": cells},
    {"B3": "=NETWORKDAYS(B1,B2)", "B4": "=NETWORKDAYS(B1,B2,D2:D6)"},
    [],
    {"B3": x_networkdays(A3, B3), "B4": x_networkdays(A3, B3, holidays=HOL3)},
)

# 4. Части даты
SALES = [dt.date(2026, 1, 3), dt.date(2026, 3, 22), dt.date(2026, 6, 6), dt.date(2026, 8, 30), dt.date(2026, 10, 25)]
cells = {
    "A1": head("Дата продажи"),
    "B1": head("Год"),
    "C1": head("Месяц"),
    "D1": head("День"),
    "E1": head("День недели"),
    "F1": head("Номер"),
}
expect = {}
for i, d in enumerate(SALES, start=2):
    cells[f"A{i}"] = date_cell(d)
    expect |= {f"B{i}": d.year, f"C{i}": d.month, f"D{i}": d.day, f"E{i}": x_weekday(d, 2), f"F{i}": serial(d)}
ex(
    4,
    "date-parts",
    "Год, месяц, день и день недели",
    "Для каждой даты продажи найдите год, номер месяца, число месяца, день недели (понедельник — 1) и номер "
    "даты в Excel.",
    "<code>{f:=YEAR(A2)}</code>, <code>{f:=MONTH(A2)}</code>, <code>{f:=DAY(A2)}</code>, "
    "<code>{f:=WEEKDAY(A2,2)}</code>, а номер — <code>{f:=A2}</code> в формате «Общий». Протяните вниз.",
    "{fn:WEEKDAY} без второго аргумента начинает неделю с воскресенья: понедельник будет 2.",
    {
        "file": "Продажи_даты.xlsx",
        "name": "Продажи",
        "columns": {"A": 120, "B": 60, "C": 70, "D": 60, "E": 110, "F": 80},
        "cells": cells,
    },
    {"B2": "=YEAR(A2)", "C2": "=MONTH(A2)", "D2": "=DAY(A2)", "E2": "=WEEKDAY(A2,2)", "F2": "=A2"},
    [(c + "2", f"{c}2:{c}6") for c in "BCDEF"],
    expect,
)

# 5. Этапы проекта
START5 = dt.date(2026, 12, 4)
PHASES = [45, 60, 30]
cells = {
    "A1": label("Старт"),
    "B1": date_cell(START5),
    "A3": head("Этап"),
    "B3": head("Дней"),
    "C3": head("Начало"),
    "D3": head("Конец"),
    "E3": head("Месяц"),
    "F3": head("Год"),
}
expect = {}
begin = START5
for i, days in enumerate(PHASES, start=4):
    end = begin + dt.timedelta(days=days - 1)
    cells |= {f"A{i}": f"Этап {i - 3}", f"B{i}": days}
    expect |= {f"C{i}": serial(begin), f"D{i}": serial(end), f"E{i}": end.month, f"F{i}": end.year}
    begin = end + dt.timedelta(days=1)
ex(
    5,
    "project-phases",
    "Когда закончится каждый этап",
    "Проект стартует в день из <code>B1</code> и состоит из трёх этапов; длительность в календарных днях — в "
    "столбце B. Этап начинается на следующий день после конца предыдущего, первый — в день старта; день "
    "начала входит в длительность. Найдите начало и конец каждого этапа, месяц и год окончания.",
    "Конец = начало + дни − 1: <code>{f:=C4+B4-1}</code>. Начало следующего — <code>{f:=D4+1}</code>, первого — "
    "<code>{f:=B1}</code>. Месяц и год — {fn:MONTH} и {fn:YEAR}. Поменяйте длительность — все даты пересчитаются.",
    "Забыть «−1»: каждый этап выйдет на день длиннее.",
    {
        "file": "Этапы_проекта.xlsx",
        "name": "Этапы",
        "columns": {"A": 80, "B": 110, "C": 100, "D": 100, "E": 70, "F": 60},
        "cells": cells,
    },
    {
        "C4": "=B1",
        "D4": "=C4+B4-1",
        "C5": "=D4+1",
        "E4": "=MONTH(D4)",
        "F4": "=YEAR(D4)",
    },
    [("D4", "D4:D6"), ("C5", "C5:C6"), ("E4", "E4:E6"), ("F4", "F4:F6")],
    expect,
    dates={"C4", "D4", "C5"},
)

# 6. Торговые дни биржи
BOUGHT = dt.date(2026, 12, 1)
HOL6 = [dt.date(2026, 12, 16), dt.date(2027, 1, 1), dt.date(2027, 1, 7)]
N6 = 20
cells = {"A1": label("Куплены"), "B1": date_cell(BOUGHT), "A3": head("Торговый день"), "D1": head("Биржа закрыта")}
for i, d in enumerate(HOL6, start=2):
    cells[f"D{i}"] = date_cell(d)
expect = {}
d = BOUGHT
for i in range(4, 4 + N6):
    d = x_workday(d, 1, holidays=HOL6)
    expect[f"A{i}"] = serial(d)
ex(
    6,
    "trading-days",
    "Торговые дни после покупки акций",
    f"Акции куплены {ru(BOUGHT)}. Составьте список первых {N6} торговых дней после покупки "
    f"(<code>A4:A{3 + N6}</code>). Биржа не работает в субботу, воскресенье и в дни из столбца D.",
    "Первый торговый день — <code>{f:=WORKDAY(B1,1,$D$2:$D$4)}</code>, каждый следующий — "
    "<code>{f:=WORKDAY(A4,1,$D$2:$D$4)}</code>: «следующий рабочий день после предыдущего». Протяните вниз.",
    "Без $ диапазон праздников съедет при протягивании, и 16 декабря станет «торговым».",
    {"file": "Торговые_дни.xlsx", "name": "Биржа", "columns": {"A": 130, "B": 110, "C": 30, "D": 120}, "cells": cells},
    {"A4": "=WORKDAY(B1,1,$D$2:$D$4)", "A5": "=WORKDAY(A4,1,$D$2:$D$4)"},
    [("A5", f"A5:A{3 + N6}")],
    expect,
    dates={"A4", "A5"},
)

# 7. Стаж сотрудников
CALC = dt.date(2026, 12, 31)
STAFF = [
    ("Ахметова А.", dt.date(2015, 3, 2)),
    ("Ким О.", dt.date(2021, 9, 15)),
    ("Сапаров Д.", dt.date(2024, 12, 31)),
    ("Нурланова С.", dt.date(2026, 2, 10)),
]
cells = {"A1": label("Дата расчёта"), "B1": date_cell(CALC), "A3": head("Сотрудник"), "B3": head("Принят")}
cells |= {"C3": head("Полных лет"), "D3": head("Месяцев сверх")}
expect = {}
for i, (name, hired) in enumerate(STAFF, start=4):
    cells |= {f"A{i}": name, f"B{i}": date_cell(hired)}
    expect |= {f"C{i}": x_datedif(hired, CALC, "y"), f"D{i}": x_datedif(hired, CALC, "ym")}
ex(
    7,
    "experience",
    "Стаж: полные годы и месяцы",
    "Для надбавки за стаж найдите, сколько полных лет и сколько месяцев сверх них проработал каждый сотрудник "
    "на дату расчёта <code>B1</code>.",
    '<code>{f:=DATEDIF(B4,$B$1,"y")}</code> — полные годы, <code>{f:=DATEDIF(B4,$B$1,"ym")}</code> — месяцы '
    "сверх полных лет. Excel не подсказывает {fn:DATEDIF}: набирайте имя целиком. На работе вместо "
    "<code>$B$1</code> — <code>{f:=TODAY()}</code>.",
    '"m" вместо "ym" даст все месяцы стажа (у Ахметовой — больше сотни), а не остаток после лет.',
    {"file": "Стаж.xlsx", "name": "Стаж", "columns": {"A": 130, "B": 110, "C": 100, "D": 120}, "cells": cells},
    {"C4": '=DATEDIF(B4,$B$1,"y")', "D4": '=DATEDIF(B4,$B$1,"ym")'},
    [("C4", "C4:C7"), ("D4", "D4:D7")],
    expect,
)

# 8. День недели первого числа месяца
ANY = [dt.date(2026, 10, 12), dt.date(2026, 2, 27), dt.date(2027, 5, 9), dt.date(2027, 8, 31)]
cells = {"A1": head("Дата"), "B1": head("1-е число"), "C1": head("День недели 1-го")}
expect = {}
for i, d in enumerate(ANY, start=2):
    first = d.replace(day=1)
    cells[f"A{i}"] = date_cell(d)
    expect |= {f"B{i}": serial(first), f"C{i}": x_weekday(first, 2)}
ex(
    8,
    "first-weekday",
    "С какого дня недели начинается месяц",
    "Для каждой даты найдите первое число её месяца (<code>B</code>) и день недели этого числа, понедельник — 1 "
    "(<code>C</code>).",
    "Первое число — <code>{f:=DATE(YEAR(A2),MONTH(A2),1)}</code>, день недели — <code>{f:=WEEKDAY(B2,2)}</code>.",
    "Взять {fn:DAY}(A2) вместо 1 — получится сама дата, а не начало месяца.",
    {"file": "Начало_месяца.xlsx", "name": "Месяцы", "columns": {"A": 110, "B": 110, "C": 150}, "cells": cells},
    {"B2": "=DATE(YEAR(A2),MONTH(A2),1)", "C2": "=WEEKDAY(B2,2)"},
    [("B2", "B2:B5"), ("C2", "C2:C5")],
    expect,
    dates={"B2"},
)

# 9. Последний день месяца
cells = {"A1": head("Дата"), "B1": head("Последний день"), "C1": head("Дней в месяце")}
expect = {}
for i, d in enumerate(ANY, start=2):
    last = x_date(d.year, d.month + 1, 0)
    cells[f"A{i}"] = date_cell(d)
    expect |= {f"B{i}": serial(last), f"C{i}": last.day}
ex(
    9,
    "month-end",
    "Последний день месяца",
    "Счета выставляют последним днём месяца. Для каждой даты найдите последний день её месяца и сколько дней в "
    "этом месяце.",
    "{fn:DATE} понимает «нулевой» день: <code>{f:=DATE(2026,11,0)}</code> — 31.10.2026, последний день "
    "октября. Значит, <code>{f:=DATE(YEAR(A2),MONTH(A2)+1,0)}</code> — конец месяца, а "
    "<code>{f:=DAY(B2)}</code> — число дней в нём. То же делает <code>{f:=EOMONTH(A2,0)}</code>.",
    "Прибавить 30 дней: в феврале и в месяцах на 31 день ответ будет неверным.",
    {"file": "Конец_месяца.xlsx", "name": "Месяцы", "columns": {"A": 110, "B": 140, "C": 130}, "cells": cells},
    {"B2": "=DATE(YEAR(A2),MONTH(A2)+1,0)", "C2": "=DAY(B2)"},
    [("B2", "B2:B5"), ("C2", "C2:C5")],
    expect,
    dates={"B2"},
)

# 10. Номер дня в году
cells = {"A1": head("Дата"), "B1": head("День года")}
expect = {}
YEAR_DAYS = [dt.date(2026, 1, 1), dt.date(2026, 4, 15), dt.date(2028, 12, 31), dt.date(2027, 3, 22)]
for i, d in enumerate(YEAR_DAYS, start=2):
    cells[f"A{i}"] = date_cell(d)
    expect[f"B{i}"] = (d - x_date(d.year, 1, 0)).days
ex(
    10,
    "day-of-year",
    "Какой по счёту день года",
    "Найдите, каким по счёту днём своего года является каждая дата (1 января — 1-й день).",
    "<code>{f:=DATE(YEAR(A2),1,0)}</code> — «нулевое января», то есть 31 декабря прошлого года. Разность с "
    "датой — номер дня: <code>{f:=A2-DATE(YEAR(A2),1,0)}</code>.",
    "Если вместо числа ячейка показала дату вида «15.04.1900», поставьте формат «Общий»: Excel взял формат "
    "у ячейки с датой.",
    {"file": "День_года.xlsx", "name": "Даты", "columns": {"A": 110, "B": 110}, "cells": cells},
    {"B2": "=A2-DATE(YEAR(A2),1,0)"},
    [("B2", "B2:B5")],
    expect,
)

# 11. Выходные вторник и среда
START11 = dt.date(2027, 5, 3)
cells = {
    "A1": label("Открытие"),
    "B1": date_cell(START11),
    "A2": label("200-й рабочий день"),
    "A3": label("То же строкой"),
}
answer = serial(x_workday(START11, 200, weekend_of(4)))
ex(
    11,
    "weekend-tue-wed",
    "Выходные во вторник и среду",
    "Аквапарк открыт в субботу и воскресенье, а закрыт по вторникам и средам. Какой день будет "
    "200-м рабочим днём после открытия? Найдите ответ кодом выходных (<code>B2</code>) и строкой "
    "(<code>B3</code>).",
    "<code>{f:=WORKDAY.INTL(B1,200,4)}</code> — код 4: вторник и среда. Строкой: "
    '<code>{f:=WORKDAY.INTL(B1,200,"0110000")}</code> — семь знаков с понедельника, 1 — выходной.',
    "{fn:WORKDAY} без .МЕЖД считает выходными субботу и воскресенье — ответ будет другим.",
    {"file": "Аквапарк.xlsx", "name": "График", "columns": {"A": 180, "B": 110}, "cells": cells},
    {"B2": "=WORKDAY.INTL(B1,200,4)", "B3": '=WORKDAY.INTL(B1,200,"0110000")'},
    [],
    {"B2": answer, "B3": answer},
    dates={"B2", "B3"},
)

# 12. Партнёр с выходными в пятницу и субботу
A12, B12 = dt.date(2026, 1, 10), dt.date(2027, 5, 31)
HOL12 = [dt.date(2026, 2, 22), dt.date(2026, 9, 23), dt.date(2027, 2, 22)]
cells = {
    "A1": label("Начало"),
    "B1": date_cell(A12),
    "A2": label("Конец"),
    "B2": date_cell(B12),
    "A3": label("Рабочих дней"),
    "D1": head("Праздники"),
}
for i, d in enumerate(HOL12, start=2):
    cells[f"D{i}"] = date_cell(d)
ex(
    12,
    "weekend-fri-sat",
    "Рабочие дни партнёра: выходные пятница и суббота",
    f"Партнёр из Саудовской Аравии работает с воскресенья по четверг; выходные — пятница и суббота. Сколько у "
    f"него рабочих дней с {ru(A12)} по {ru(B12)}, если не считать праздники из столбца D (для примера взяты "
    "только праздники с постоянной датой)?",
    "<code>{f:=NETWORKDAYS.INTL(B1,B2,7,D2:D4)}</code>: код 7 — пятница и суббота, четвёртый аргумент — праздники.",
    "Праздник, выпавший на пятницу или субботу, функция и так не считает — вычитать его отдельно не нужно.",
    {"file": "Партнёр.xlsx", "name": "Партнёр", "columns": {"A": 130, "B": 110, "C": 30, "D": 100}, "cells": cells},
    {"B3": "=NETWORKDAYS.INTL(B1,B2,7,D2:D4)"},
    [],
    {"B3": x_networkdays(A12, B12, weekend_of(7), HOL12)},
)

# 13. Кварталы
QDATES = [dt.date(2026, 2, 14), dt.date(2026, 6, 30), dt.date(2026, 7, 1), dt.date(2026, 11, 20)]
cells = {"A1": head("Дата"), "B1": head("Начало квартала"), "C1": head("Конец прошлого")}
expect = {}
for i, d in enumerate(QDATES, start=2):
    q_start = dt.date(d.year, (d.month - 1) // 3 * 3 + 1, 1)
    cells[f"A{i}"] = date_cell(d)
    expect |= {f"B{i}": serial(q_start), f"C{i}": serial(q_start - dt.timedelta(days=1))}
ex(
    13,
    "quarter",
    "Начало квартала и конец предыдущего",
    "Квартал — три месяца: январь–март, апрель–июнь и так далее. Для каждой даты найдите первый день её квартала "
    "(<code>B</code>) и последний день предыдущего квартала (<code>C</code>) — на эту дату сдают отчёт.",
    "Первый месяц квартала — <code>{f:=INT((MONTH(A2)-1)/3)*3+1}</code>: 1, 4, 7 или 10. Начало квартала — "
    "<code>{f:=DATE(YEAR(A2),INT((MONTH(A2)-1)/3)*3+1,1)}</code>, конец прошлого — на день раньше: "
    "<code>{f:=B2-1}</code>.",
    "Без «−1» внутри {fn:INT} март попадёт во второй квартал, а июнь — в третий.",
    {"file": "Кварталы.xlsx", "name": "Кварталы", "columns": {"A": 110, "B": 140, "C": 140}, "cells": cells},
    {"B2": "=DATE(YEAR(A2),INT((MONTH(A2)-1)/3)*3+1,1)", "C2": "=B2-1"},
    [("B2", "B2:B5"), ("C2", "C2:C5")],
    expect,
    dates={"B2", "C2"},
)

# 14. Возраст по дате рождения
CALC14 = dt.date(2026, 10, 12)
BIRTHS = [dt.date(1990, 10, 12), dt.date(1990, 10, 13), dt.date(2004, 2, 29), dt.date(1975, 1, 1)]
cells = {"A1": label("На дату"), "B1": date_cell(CALC14), "A3": head("Дата рождения"), "B3": head("Возраст")}
expect = {}
for i, d in enumerate(BIRTHS, start=4):
    cells[f"A{i}"] = date_cell(d)
    expect[f"B{i}"] = x_datedif(d, CALC14, "y")
ex(
    14,
    "age",
    "Возраст по дате рождения",
    "Найдите полный возраст каждого человека на дату <code>B1</code>. Обратите внимание на тех, кто родился "
    "12 и 13 октября 1990 года.",
    '<code>{f:=DATEDIF(A4,$B$1,"y")}</code> — полные годы. На работе вместо <code>$B$1</code> — '
    "<code>{f:=TODAY()}</code>.",
    "Делить разность дат на 365: високосные годы накапливают ошибку, и в день рождения возраст выйдет на год "
    "меньше или больше.",
    {"file": "Возраст.xlsx", "name": "Возраст", "columns": {"A": 130, "B": 110}, "cells": cells},
    {"B4": '=DATEDIF(A4,$B$1,"y")'},
    [("B4", "B4:B7")],
    expect,
)

# 15. Последний понедельник месяца
MONTHS15 = [(2026, 5), (2026, 11), (2027, 2), (2027, 5)]
cells = {"A1": head("Год"), "B1": head("Месяц"), "C1": head("Последний пн")}
expect = {}
for i, (y, m) in enumerate(MONTHS15, start=2):
    last = x_date(y, m + 1, 0)
    cells |= {f"A{i}": y, f"B{i}": m}
    expect[f"C{i}"] = serial(last - dt.timedelta(days=x_weekday(last, 3)))
ex(
    15,
    "last-monday",
    "Последний понедельник месяца",
    "Инвентаризация на складе — в последний понедельник месяца. Найдите её дату для каждого года и месяца.",
    "Последний день месяца — <code>{f:=DATE(A2,B2+1,0)}</code>. <code>{f:=WEEKDAY(дата,3)}</code> даёт 0 для "
    "понедельника, 1 для вторника… — столько дней и надо отступить назад: "
    "<code>{f:=DATE(A2,B2+1,0)-WEEKDAY(DATE(A2,B2+1,0),3)}</code>.",
    "Тип 2 вместо 3 сдвинет ответ на день: у типа 2 понедельник — 1, а не 0.",
    {"file": "Инвентаризация.xlsx", "name": "Даты", "columns": {"A": 70, "B": 80, "C": 130}, "cells": cells},
    {"C2": "=DATE(A2,B2+1,0)-WEEKDAY(DATE(A2,B2+1,0),3)"},
    [("C2", "C2:C5")],
    expect,
    dates={"C2"},
)

# 16. Рабочие дни при четырёхдневке
MONTH16 = dt.date(2027, 1, 1)
HOL16 = [dt.date(2027, 1, 1), dt.date(2027, 1, 7)]
FOUR_DAY = "0000111"  # выходные пт, сб, вс
days16 = []
d = MONTH16 - dt.timedelta(days=1)
while True:
    d = x_workday(d, 1, weekend_of(FOUR_DAY), HOL16)
    if d.month != 1:
        break
    days16.append(d)
cells = {"A1": label("Месяц с"), "B1": date_cell(MONTH16), "A3": head("Рабочий день"), "D1": head("Праздники")}
for i, h in enumerate(HOL16, start=2):
    cells[f"D{i}"] = date_cell(h)
last16 = 3 + len(days16)
ex(
    16,
    "four-day-week",
    "Рабочие дни при четырёхдневке",
    f"Сотрудник работает с понедельника по четверг; пятница, суббота и воскресенье — выходные. Составьте список "
    f"его рабочих дней в январе 2027 года с учётом праздников из столбца D (<code>A4:A{last16}</code>).",
    'Первый рабочий день — <code>{f:=WORKDAY.INTL(B1-1,1,"0000111",$D$2:$D$3)}</code>: «следующий рабочий '
    'день после 31 декабря». Дальше — <code>{f:=WORKDAY.INTL(A4,1,"0000111",$D$2:$D$3)}</code>, протянуть вниз.',
    "Начать с <code>B1</code>, а не с <code>B1-1</code>: функция ищет день <b>после</b> даты, и первый рабочий "
    "день месяца пропадёт, если он — 1-е число.",
    {
        "file": "Четырёхдневка.xlsx",
        "name": "Январь",
        "columns": {"A": 130, "B": 110, "C": 30, "D": 100},
        "cells": cells,
    },
    {"A4": '=WORKDAY.INTL(B1-1,1,"0000111",$D$2:$D$3)', "A5": '=WORKDAY.INTL(A4,1,"0000111",$D$2:$D$3)'},
    [("A5", f"A5:A{last16}")],
    {f"A{i}": serial(day) for i, day in enumerate(days16, start=4)},
    dates={"A4", "A5"},
)


def main(root, dump):
    data = {"chapter": "ch07", "exercises": EXERCISES}
    dump(root / "exercises" / "ch07.yaml", data)
