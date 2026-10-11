"""Задания главы 9 — по мотивам заданий книги, данные свои. Ответы expect считаются здесь, на Python."""

import datetime as dt

from gen_ch08 import date_cell, head, kzt, label, pct, r4
from gen_ch09 import GUESSES, checked_irr, excel_irr, mirr, npv0

EXERCISES = []


def ex(number, eid, title, task, explain, mistake, sheet, cells_f, fills, expect):
    """cells_f: адрес → формула или (формула, формат)."""
    cells = {}
    for addr, f in cells_f.items():
        formula, fmt = f if isinstance(f, tuple) else (f, None)
        cells[addr] = {"f": formula, "fmt": fmt} if fmt else {"f": formula}
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


def years_row(cells, flows, row_years=1, row_flows=2, first_col="B", start=0):
    for t, v in enumerate(flows):
        c = chr(ord(first_col) + t)
        cells[f"{c}{row_years}"] = head(t + start)
        cells[f"{c}{row_flows}"] = v


def guess_table(cells, first_row):
    """Столбец предположений −90%…90% (шаг 20%) в A и пустые ячейки ответа в B."""
    for i, g in enumerate(GUESSES, start=first_row):
        cells[f"A{i}"] = pct(g)
        cells[f"B{i}"] = {"fmt": "percent"}


def guess_expect(flows, first_row):
    out = {}
    for i, g in enumerate(GUESSES, start=first_row):
        root = excel_irr(flows, g)
        out[f"B{i}"] = "#NUM!" if root is None else r4(root)
    return out


# 1. Все ВСД: две
FLOWS1 = [-10, 8, 1.5, 1.5, 1.5, 1.5, -1.5]
cells = {"A1": head("Год"), "A2": "Поток, млн ₸", "A4": head("Предположение"), "B4": head("ВСД")}
years_row(cells, FLOWS1)
guess_table(cells, 5)
exp1 = guess_expect(FLOWS1, 5)
roots1 = sorted({v for v in exp1.values()})
ex(
    1,
    "all-irr",
    "Все ВСД проекта",
    "Потоки проекта — в строке 2 (год 0 — сегодня). Знак меняется дважды: −, +, … , −. Найдите <b>все</b> ВСД: в "
    "<code>B5:B14</code> посчитайте ВСД с предположениями из столбца A.",
    "<code>{f:=IRR($B$2:$H$2,A5)}</code> и протяните вниз: потоки закреплены, предположение — из своей строки. "
    f"Разные ответы ({', '.join(f'{x * 100:.2f}%'.replace('.', ',') for x in roots1)}) — это разные ВСД.",
    "Ограничиться одной формулой <code>{f:=IRR(B2:H2)}</code>: она покажет только одну ВСД, ту, что ближе к 10%.",
    {
        "file": "Все_ВСД.xlsx",
        "name": "Проект",
        "columns": {"A": 160, "B": 90, "C": 60, "D": 60, "E": 60, "F": 60, "G": 60, "H": 60},
        "rows": 15,
        "cells": cells,
    },
    {"B5": ("=IRR($B$2:$H$2,A5)", "percent")},
    [("B5", "B5:B14")],
    exp1,
)

# 2. Браться ли за проект
FLOWS2 = [-4, 2, 4]
cells = {
    "A1": label("Стоимость капитала"),
    "B1": pct(0.2),
    "A3": head("Год"),
    "A4": "Поток, млн ₸",
    "A6": "ВСД",
    "A7": "Решение",
}
years_row(cells, FLOWS2, 3, 4)
irr2 = checked_irr(FLOWS2, 0, 1)
ex(
    2,
    "take-project",
    "Браться ли за проект",
    "Потоки — в строке 4, стоимость капитала — 20%. В <code>B6</code> найдите ВСД, в <code>B7</code> формулой "
    "{fn:IF} напишите «берём» или «отказываемся».",
    "<code>{f:=IRR(B4:D4)}</code>; проект выгоден, если ВСД выше стоимости капитала: "
    '<code>{f:=IF(B6>B1,"берём","отказываемся")}</code>. Знак меняется один раз — ВСД одна.',
    "Сравнить ВСД с нулём: проект с ВСД 5% при капитале под 20% уменьшает стоимость компании.",
    {
        "file": "Проект.xlsx",
        "name": "Проект",
        "columns": {"A": 170, "B": 100, "C": 100, "D": 100},
        "rows": 8,
        "cells": cells,
    },
    {"B6": ("=IRR(B4:D4)", "percent"), "B7": '=IF(B6>B1,"берём","отказываемся")'},
    [],
    {"B6": r4(irr2), "B7": "берём" if irr2 > 0.2 else "отказываемся"},
)

# 3. Нет ВСД
FLOWS3 = [100, -300, 250]
cells = {"A1": head("Год"), "A2": "Поток, тыс. ₸", "A4": head("Предположение"), "B4": head("ВСД")}
years_row(cells, FLOWS3)
guess_table(cells, 5)
exp3 = guess_expect(FLOWS3, 5)
assert set(exp3.values()) == {"#NUM!"}
ex(
    3,
    "no-irr",
    "Найдите все ВСД: а если их нет?",
    "Потоки — в строке 2: +100, −300, +250 тыс. ₸. В <code>B5:B14</code> посчитайте ВСД с предположениями из "
    "столбца A. Сколько ВСД у проекта?",
    "<code>{f:=IRR($B$2:$D$2,A5)}</code> и вниз — везде <code>#ЧИСЛО!</code>. ЧПС этого проекта положительна при "
    "любой ставке, и ставки, где она равна нулю, нет: ВСД у проекта нет.",
    "Решить, что формула написана неверно: <code>#ЧИСЛО!</code> здесь — правильный ответ «ВСД не существует».",
    {
        "file": "Нет_ВСД.xlsx",
        "name": "Проект",
        "columns": {"A": 170, "B": 100, "C": 90, "D": 90},
        "rows": 15,
        "cells": cells,
    },
    {"B5": ("=IRR($B$2:$D$2,A5)", "percent")},
    [("B5", "B5:B14")],
    exp3,
)

# 4. ЧИСТВНДОХ с предположениями
DATES4 = [
    dt.date(2026, 1, 10),
    dt.date(2026, 7, 10),
    dt.date(2027, 5, 25),
    dt.date(2027, 7, 18),
    dt.date(2028, 3, 20),
    dt.date(2028, 4, 1),
    dt.date(2029, 1, 10),
]
FLOWS4 = [-1_000_000, 900_000, 800_000, -700_000, 500_000, -500_000, 350_000]
years4 = [(d - DATES4[0]).days / 365 for d in DATES4]
cells = {"A1": head("Дата"), "B1": head("Поток"), "D1": head("Предположение"), "E1": head("ЧИСТВНДОХ")}
for i, (d, v) in enumerate(zip(DATES4, FLOWS4, strict=True), start=2):
    cells[f"A{i}"] = date_cell(d)
    cells[f"B{i}"] = kzt(v)
exp4 = {}
for i, g in enumerate(GUESSES, start=2):
    cells[f"D{i}"] = pct(g)
    cells[f"E{i}"] = {"fmt": "percent"}
    root = excel_irr(FLOWS4, g, years4)
    exp4[f"E{i}"] = "#NUM!" if root is None else r4(root)
xirr4 = checked_irr(FLOWS4, 0, 1, years=years4)
assert set(exp4.values()) == {r4(xirr4)}
ex(
    4,
    "xirr-guesses",
    "ЧИСТВНДОХ: все ВСД потоков с датами",
    "Потоки с датами — в <code>A2:B8</code>, знак меняется несколько раз. В <code>E2:E11</code> посчитайте "
    "ЧИСТВНДОХ с предположениями из столбца D. Сколько ВСД у этих потоков?",
    f"<code>{{f:=XIRR($B$2:$B$8,$A$2:$A$8,D2)}}</code> и вниз. Ответ везде один — {xirr4 * 100:.2f}%".replace(".", ",")
    + ": несколько смен знака не обязательно дают несколько ВСД.",
    "Взять {fn:IRR}: она считает, что потоки идут ровно через год, а даты здесь неравные.",
    {
        "file": "ВСД_по_датам.xlsx",
        "name": "Потоки",
        "columns": {"A": 120, "B": 130, "C": 30, "D": 140, "E": 130},
        "rows": 11,
        "cells": cells,
    },
    {"E2": ("=XIRR($B$2:$B$8,$A$2:$A$8,D2)", "percent")},
    [("E2", "E2:E11")],
    exp4,
)

# 5. Два проекта: ВСД и ЧПС
P1, P2 = [-40, 13, 19, 26], [-80, 36, 36, 36]
cells = {
    "A1": label("Стоимость капитала"),
    "B1": pct(0.15),
    "A3": head("Год"),
    "F3": head("ВСД"),
    "G3": head("ЧПС"),
    "A4": "Проект 1, млн ₸",
    "A5": "Проект 2, млн ₸",
    "A7": "Выбираем",
}
for t in range(4):
    c = "BCDE"[t]
    cells[f"{c}3"] = head(t)
    cells[f"{c}4"] = P1[t]
    cells[f"{c}5"] = P2[t]
irr51, irr52 = checked_irr(P1, 0, 1), checked_irr(P2, 0, 1)
npv51, npv52 = npv0(0.15, P1), npv0(0.15, P2)
ex(
    5,
    "two-projects",
    "Два проекта: ВСД и ЧПС",
    "Стоимость капитала — 15%. Для каждого проекта найдите ВСД (<code>F4:F5</code>) и ЧПС (<code>G4:G5</code>). "
    "Какие проекты увеличат стоимость компании? Если можно взять только один — какой? Ответ — в <code>B7</code> "
    "формулой.",
    "<code>{f:=IRR(B4:E4)}</code> и <code>{f:=B4+NPV($B$1,C4:E4)}</code>, протяните на проект 2. Оба выгодны: ВСД "
    "выше 15%, ЧПС больше нуля. Один — по большей ЧПС: <code>{f:=IF(G4>G5,A4,A5)}</code>.",
    "Выбрать по ВСД: она не учитывает масштаб. Здесь выбор совпал, но так бывает не всегда.",
    {
        "file": "Два_проекта.xlsx",
        "name": "Проекты",
        "columns": {"A": 170, "B": 70, "C": 70, "D": 70, "E": 70, "F": 100, "G": 100},
        "rows": 8,
        "cells": cells,
    },
    {"F4": ("=IRR(B4:E4)", "percent"), "G4": ("=B4+NPV($B$1,C4:E4)", "number"), "B7": "=IF(G4>G5,A4,A5)"},
    [("F4", "F4:F5"), ("G4", "G4:G5")],
    {
        "F4": r4(irr51),
        "F5": r4(irr52),
        "G4": r4(npv51),
        "G5": r4(npv52),
        "B7": "Проект 1, млн ₸" if npv51 > npv52 else "Проект 2, млн ₸",
    },
)

# 6. Пенсионные накопления
CONTRIB, YEARS6 = 1_000_000, 40
rates6 = [0.15] * 30 + [0.05] * 10
cells = {
    "A1": label("Взнос в начале года"),
    "B1": kzt(CONTRIB),
    "A3": head("Год"),
    "B3": head("Доходность"),
    "C3": head("На счёте в конце года"),
    "D3": head("Поток"),
    "A4": 0,
    "C4": kzt(0),
}
balance = 0.0
for k in range(1, YEARS6 + 1):
    cells[f"A{k + 4}"] = k
    cells[f"B{k + 4}"] = pct(rates6[k - 1])
    cells[f"C{k + 4}"] = kzt()
    balance = (balance + CONTRIB) * (1 + rates6[k - 1])
for r in range(5, YEARS6 + 6):
    cells[f"D{r}"] = kzt()
flows6 = [-CONTRIB] * YEARS6 + [balance]
irr6 = checked_irr(flows6, 0, 1)
ex(
    6,
    "pension",
    "Пенсионные накопления: доходность за 40 лет",
    "Айгерим 25 лет. В начале каждого года она кладёт на пенсионный счёт <b>1 000 000 ₸</b>, 40 лет подряд. "
    "Первые 30 лет счёт приносит 15% в год, последние 10 — 5% (доходность — в столбце B). В <code>C5:C44</code> "
    "посчитайте сумму на счёте в конце каждого года. В <code>D5:D45</code> соберите потоки: взносы со знаком "
    "минус (сегодня и в начале каждого года) и итоговую сумму в конце 40-го года. В <code>F1</code> найдите ВСД.",
    "Счёт в конце года: (прошлый остаток + взнос) × (1 + доходность): <code>{f:=(C4+$B$1)*(1+B5)}</code>, вниз до "
    "<code>C44</code>. Поток: <code>{f:=-$B$1}</code> в <code>D5:D44</code> (взнос в начале года k — это период "
    "k − 1), в <code>D45</code> — <code>{f:=C44}</code>. ВСД — <code>{f:=IRR(D5:D45)}</code>: знак меняется "
    "один раз, ВСД одна — средняя доходность всех взносов.",
    "Сложить взносы и итог без учёта времени: так видно, во сколько раз выросли деньги, но не годовую доходность.",
    {
        "file": "Пенсия.xlsx",
        "name": "Пенсия",
        "columns": {"A": 160, "B": 110, "C": 170, "D": 140, "E": 30, "F": 110},
        "rows": 45,
        "cells": cells,
    },
    {
        "C5": ("=(C4+$B$1)*(1+B5)", "kzt"),
        "D5": ("=-$B$1", "kzt"),
        "D45": ("=C44", "kzt"),
        "F1": ("=IRR(D5:D45)", "percent"),
    },
    [("C5", "C5:C44"), ("D5", "D5:D44")],
    {"C44": r4(balance), "D45": r4(balance), "F1": r4(irr6)},
)

# 7. Почему у кофейни ВСД 50%
ex(
    7,
    "why-fifty",
    "Почему ВСД кофейни — ровно 50%",
    "Кофейня из урока 9.3: <b>−10 млн ₸</b> сегодня и <b>+15 млн ₸</b> через год. Проверьте, что ВСД — 50%: в "
    "<code>B4</code> посчитайте ЧПС при ставке 50%, в <code>B5</code> — ВСД.",
    "При ставке 50% 15 млн через год стоят сегодня 15 ÷ 1,5 = 10 млн — ровно вложение, ЧПС = 0: "
    "<code>{f:=B2+C2/(1+50%)}</code>. ВСД — <code>{f:=IRR(B2:C2)}</code>. Вложили 10, вернули 15 — это и есть "
    "+50% за год.",
    "Посчитать (15 − 10) / 15 = 33%: доходность считают от вложенного, а не от полученного.",
    {
        "file": "Кофейня.xlsx",
        "name": "Кофейня",
        "columns": {"A": 190, "B": 100, "C": 100},
        "rows": 6,
        "cells": {
            "A1": head("Год"),
            "B1": head(0),
            "C1": head(1),
            "A2": "Поток, млн ₸",
            "B2": -10,
            "C2": 15,
            "A4": "ЧПС при 50%",
            "A5": "ВСД",
        },
    },
    {"B4": ("=B2+C2/(1+50%)", "number"), "B5": ("=IRR(B2:C2)", "percent")},
    [],
    {"B4": 0, "B5": r4(checked_irr([-10, 15], 0, 1))},
)

# 8. Отрицательная ВСД
FLOWS8 = [-70, 12, 15]
cells = {"A1": head("Год"), "A2": "Поток, млн ₸", "A4": "ВСД", "A5": "Вернули из вложенного"}
years_row(cells, FLOWS8)
irr8 = checked_irr(FLOWS8, -0.9, 0, guess=0.1)
ex(
    8,
    "negative-irr",
    "Отрицательная ВСД",
    "Проект: <b>−70 млн ₸</b> сегодня, <b>12</b> и <b>15 млн ₸</b> в следующие два года. Найдите ВСД в "
    "<code>B4</code> и долю вложенного, которая вернётся, в <code>B5</code>. Как понимать отрицательную ВСД?",
    "<code>{f:=IRR(B2:D2)}</code> — около −44%. Вернётся <code>{f:=(C2+D2)/-B2}</code> — меньше 40% вложенного. "
    "Отрицательная ВСД значит, что проект не возвращает даже вложенные деньги. Знак меняется один раз — ВСД одна.",
    "Решить, что отрицательная ВСД — ошибка Excel: это правильный ответ для убыточного проекта.",
    {
        "file": "Убыточный.xlsx",
        "name": "Проект",
        "columns": {"A": 210, "B": 100, "C": 80, "D": 80},
        "rows": 6,
        "cells": cells,
    },
    {"B4": ("=IRR(B2:D2)", "percent"), "B5": ("=(C2+D2)/-B2", "percent")},
    [],
    {"B4": r4(irr8), "B5": r4((12 + 15) / 70)},
)

# 9. МВСД для задания 1
cells = {
    "A1": label("Ставка кредита"),
    "B1": pct(0.12),
    "A2": label("Ставка вклада"),
    "B2": pct(0.15),
    "A4": head("Год"),
    "A5": "Поток, млн ₸",
    "A7": "МВСД",
}
years_row(cells, FLOWS1, 4, 5)
ex(
    9,
    "mirr-exercise",
    "МВСД вместо двух ВСД",
    "Потоки из задания 1 (у них две ВСД). Деньги можно взять в кредит под 12%, а свободные — положить под 15%. "
    "Посчитайте МВСД в <code>B7</code>.",
    "<code>{f:=MIRR(B5:H5,B1,B2)}</code>: расходы дисконтируются под ставку кредита, доходы растут под ставку "
    "вклада. У МВСД ответ всегда один.",
    "Перепутать ставки местами: вторым аргументом идёт ставка, под которую берут деньги, третьим — под которую "
    "вкладывают.",
    {
        "file": "МВСД.xlsx",
        "name": "Проект",
        "columns": {"A": 160, "B": 90, "C": 60, "D": 60, "E": 60, "F": 60, "G": 60, "H": 60},
        "rows": 8,
        "cells": cells,
    },
    {"B7": ("=MIRR(B5:H5,B1,B2)", "percent")},
    [],
    {"B7": r4(mirr(FLOWS1, 0.12, 0.15))},
)

# 10. Доходность облигации
PRICE, COUPON, FACE, YEARS10 = 950_000, 50_000, 1_000_000, 30
cells = {
    "A1": label("Цена покупки"),
    "B1": kzt(PRICE),
    "A2": label("Купон в год"),
    "B2": kzt(COUPON),
    "A3": label("Номинал"),
    "B3": kzt(FACE),
    "D1": label("Доходность (ВСД)"),
    "A5": head("Год"),
    "B5": head("Поток"),
}
for y in range(0, YEARS10 + 1):
    cells[f"A{y + 6}"] = y
    cells[f"B{y + 6}"] = kzt()
flows10 = [-PRICE] + [COUPON] * (YEARS10 - 1) + [COUPON + FACE]
irr10 = checked_irr(flows10, 0, 1)
ex(
    10,
    "bond-yield",
    "Доходность облигации",
    "Облигацию из задания 8 главы 8 (купон 50 000 ₸ в год 30 лет и номинал 1 000 000 ₸ в конце 30-го года) "
    "купили сегодня за <b>950 000 ₸</b>. В <code>B6:B36</code> постройте потоки, в <code>E1</code> найдите ВСД — "
    "<b>доходность к погашению</b>.",
    "Год 0 — <code>{f:=-B1}</code>, годы 1–29 — <code>{f:=$B$2}</code>, год 30 — <code>{f:=$B$2+$B$3}</code>. "
    "Доходность — <code>{f:=IRR(B6:B36)}</code>. Купили дешевле номинала — доходность выше купона 5%.",
    "Забыть цену покупки в году 0: все потоки положительные, и {fn:IRR} вернёт <code>#ЧИСЛО!</code>.",
    {
        "file": "Облигация.xlsx",
        "name": "Облигация",
        "columns": {"A": 150, "B": 140, "C": 30, "D": 150, "E": 110},
        "rows": 36,
        "cells": cells,
    },
    {"B6": ("=-B1", "kzt"), "B7": ("=$B$2", "kzt"), "B36": ("=$B$2+$B$3", "kzt"), "E1": ("=IRR(B6:B36)", "percent")},
    [("B7", "B7:B35")],
    {"B6": -PRICE, "B35": COUPON, "B36": COUPON + FACE, "E1": r4(irr10)},
)


def main(root, dump):
    dump(root / "exercises" / "ch09.yaml", {"chapter": "ch09", "exercises": EXERCISES})
