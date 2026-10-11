"""Генератор главы 9 «Внутренняя ставка доходности»: уроки и задания.

Ответы expect считаются здесь, на Python, независимо от движка плеера: lessons:verify и exercises:verify
сверяют их с ним. Суммы — в млн ₸, если не сказано иное. Запуск: uv run python scripts/content/gen_ch09.py
"""

import datetime as dt
from pathlib import Path

import yaml
from gen_ch08 import date_cell, dec, head, kzt, label, pct, r4, ru
from text_edits import apply_text_edits

ROOT = Path("content")

# ---------- Независимые расчёты (для ответов) ----------


def npv0(rate, flows):
    """ЧПС с первым потоком сегодня (период 0)."""
    return sum(v / (1 + rate) ** t for t, v in enumerate(flows))


def bisect(f, lo, hi):
    """Корень f на [lo, hi], где f меняет знак, — для проверки ответов независимо от метода Ньютона."""
    flo = f(lo)
    for _ in range(200):
        mid = (lo + hi) / 2
        if (f(mid) > 0) == (flo > 0):
            lo, flo = mid, f(mid)
        else:
            hi = mid
    return (lo + hi) / 2


def excel_irr(flows, guess=0.1, years=None):
    """Какой корень вернёт Excel при этом предположении: Ньютон, 20 попыток, точность 1e-7; шаг за −100%
    укорачивается вдвое (так получается таблица рис. 9.2 книги). None — #ЧИСЛО!."""
    ts = years if years is not None else list(range(len(flows)))
    if not (any(v > 0 for v in flows) and any(v < 0 for v in flows)):
        return None
    r = guess
    for _ in range(20):
        f = sum(v / (1 + r) ** t for v, t in zip(flows, ts, strict=True))
        df = sum(-t * v / (1 + r) ** (t + 1) for v, t in zip(flows, ts, strict=True))
        if df == 0:
            return None
        step = f / df
        nxt = r - step
        k = 0
        while nxt <= -1 and k < 60:
            step /= 2
            nxt = r - step
            k += 1
        if nxt <= -1:
            return None
        if abs(nxt - r) < 1e-7:
            return nxt
        r = nxt
    return None


def checked_irr(flows, lo, hi, guess=0.1, years=None):
    """ВСД по Ньютону (как Excel) и проверка делением отрезка пополам — два независимых расчёта."""
    ts = years if years is not None else list(range(len(flows)))
    newton = excel_irr(flows, guess, years)
    root = bisect(lambda r: sum(v / (1 + r) ** t for v, t in zip(flows, ts, strict=True)), lo, hi)
    assert newton is not None and abs(newton - root) < 1e-6, (flows, newton, root)
    return root


def mirr(flows, finance, reinvest):
    n = len(flows)
    pv = sum(v / (1 + finance) ** t for t, v in enumerate(flows) if v < 0)
    fv = sum(v * (1 + reinvest) ** (n - 1 - t) for t, v in enumerate(flows) if v > 0)
    return (fv / -pv) ** (1 / (n - 1)) - 1


def pc(x):
    """«20,96%»."""
    return dec(x * 100) + "%"


GUESSES = [g / 100 for g in range(-90, 91, 20)]  # −90%, −70%, …, 90% — как в таблице книги

# ---------- Урок: сборка ----------


def step(title, text, actions):
    return {"title": title, "text": text, "actions": actions}


def enter():
    return {"keys": ["Enter"]}


def lesson(order, lid, title, source, sheet, expect, steps, names=None):
    d = {"id": lid, "chapter": "ch09", "order": order, "title": title, "source": source, "sheet": sheet}
    if names:
        d["names"] = names
    d["expect"] = expect
    d["steps"] = steps
    return d


LESSONS = []

# ---------- 09-01: ВСД и проверка единственности ----------
SKLAD = [-40, 8, 12, 14, 15, 15, 14]
COST = 0.15
cols = "BCDEFGH"
cells = {
    "A1": label("Стоимость капитала"),
    "B1": pct(COST),
    "A3": head("Год"),
    "A4": "Поток, млн ₸",
    "A6": "ВСД",
    "B6": {"fmt": "percent"},
    "A7": "ЧПС при 15%, млн ₸",
    "B7": {"fmt": "number"},
    "A8": "Решение",
    "A10": head("Предположение"),
    "B10": head("ВСД"),
}
for t, c in enumerate(cols):
    cells[f"{c}3"] = head(t)
    cells[f"{c}4"] = SKLAD[t]
sklad_irr = checked_irr(SKLAD, 0, 1)
sklad_npv = npv0(COST, SKLAD)
ex = {"B6": r4(sklad_irr), "B7": r4(sklad_npv), "B8": "берём"}
for i, g in enumerate(GUESSES, start=11):
    cells[f"A{i}"] = pct(g)
    cells[f"B{i}"] = {"fmt": "percent"}
    root = excel_irr(SKLAD, g)
    assert root is not None and abs(root - sklad_irr) < 1e-6
    ex[f"B{i}"] = r4(root)
LESSONS.append(
    lesson(
        1,
        "irr-basics",
        "ВСД: при какой ставке проект «в ноль»",
        "IRR.xlsx, лист IRR (рис. 9.1)",
        {
            "file": "Склад.xlsx",
            "name": "Склад",
            "columns": {"A": 190, "B": 80, "C": 70, "D": 70, "E": 70, "F": 70, "G": 70, "H": 70},
            "rows": 21,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "ТОО строит склад в Алматы: <b>40 млн ₸</b> сегодня, потом 6 лет аренды приносят 8–15 млн ₸ в год. "
                "Деньги на стройку стоят компании 15% в год. ЧПС отвечает «сколько проект добавит», а руководство "
                "спрашивает проще: «сколько процентов в год он приносит?». Это и есть <b>внутренняя ставка "
                "доходности</b> — ВСД.",
                [{"wait": 3000}],
            ),
            step(
                "{fn:IRR}: ставка, при которой ЧПС = 0",
                "В <code>B6</code>: <code>{f:=IRR(B4:H4)}</code>. {fn:IRR} подбирает ставку, при которой ЧПС всех "
                "потоков равна нулю. В отличие от {fn:NPV}, первый поток {fn:IRR} считает сегодняшним, поэтому "
                f"передаём все потоки, вместе с −40 млн. Ответ — <b>{pc(sklad_irr)}</b>: вложенные деньги приносят "
                f"{pc(sklad_irr)} в год.",
                [{"click": "B6"}, {"type": "=IRR("}, {"dragRef": "B4:H4"}, {"type": ")"}, enter()],
            ),
            step(
                "ВСД и ЧПС говорят одно и то же",
                "В <code>B7</code> — ЧПС при стоимости капитала: <code>{f:=B4+NPV(B1,C4:H4)}</code> — "
                f"<b>{dec(sklad_npv)}</b> млн ₸, больше нуля. Так и должно быть: ВСД ({pc(sklad_irr)}) выше 15%, "
                "а при ставке ниже ВСД ЧПС такого проекта положительна. Ставка, равная ВСД, дала бы ровно ноль.",
                [
                    {"click": "B7"},
                    {"type": "="},
                    {"clickRef": "B4"},
                    {"type": "+NPV("},
                    {"clickRef": "B1"},
                    {"type": ","},
                    {"dragRef": "C4:H4"},
                    {"type": ")"},
                    enter(),
                ],
            ),
            step(
                "Решение: ВСД больше стоимости капитала",
                '<code>{f:=IF(B6>B1,"берём","отказываемся")}</code> в <code>B8</code> — <b>берём</b>. Правило '
                "простое: проект увеличивает стоимость компании, если его ВСД выше ставки, под которую компания "
                "берёт деньги. Здесь 20,96% против 15%.",
                [{"click": "B8"}, {"type": '=IF(B6>B1,"берём","отказываемся")'}, enter()],
            ),
            step(
                "Единственная ли ВСД: второй аргумент",
                "{fn:IRR} ищет ответ шагами, начиная с <b>предположения</b> — второго аргумента, по умолчанию 10%. "
                "Если ВСД у проекта несколько, от предположения зависит, какую найдёт Excel. Проверим: в "
                "<code>B11</code> <code>{f:=IRR($B$4:$H$4,A11)}</code> — потоки закреплены, предположение берётся "
                "из своей строки. Протяните до <code>B20</code>: от −90% до 90% ответ один — ВСД единственная.",
                [
                    {"click": "B11"},
                    {"type": "=IRR($B$4:$H$4,"},
                    {"clickRef": "A11"},
                    {"type": ")"},
                    enter(),
                    {"click": "B11"},
                    {"fill": "B11:B20"},
                ],
            ),
            step(
                "Частая ошибка: без сегодняшнего потока",
                "Передать в {fn:IRR} только доходы, без −40 млн, «как в {fn:NPV}»: все потоки положительные, ЧПС "
                "не станет нулём ни при какой ставке, и {fn:IRR} вернёт <code>#ЧИСЛО!</code>. В {fn:IRR} — все "
                "потоки, начиная с сегодняшнего.",
                [{"click": "B6"}, {"showRefs": "B6"}, {"wait": 2500}],
            ),
            step(
                "Что запомнить",
                "<code>{f:=IRR(потоки)}</code> — ставка, при которой ЧПС = 0; первый поток — сегодняшний. ВСД выше "
                "стоимости капитала — проект выгоден. Предположение (второй аргумент) помогает проверить, одна ли "
                "ВСД. <b>На работе пригодится</b>, чтобы ответить «сколько процентов в год даёт проект».",
                [{"click": "B6"}],
            ),
        ],
    )
)

# ---------- 09-02: несколько ВСД и ни одной ----------
QUARRY = [-20, 82, -60, 2]  # рис. 9.2: вложение, добыча, рекультивация, остаток
PREPAY = [10, -30, 25]  # рис. 9.3: + − +
cells = {
    "A1": head("Год"),
    "A2": "Карьер, млн ₸",
    "A3": "Предоплата, млн ₸",
    "A5": head("Предположение"),
    "B5": head("ВСД карьера"),
    "C5": head("ВСД предоплаты"),
}
for t, c in enumerate("BCDE"):
    cells[f"{c}1"] = head(t)
    cells[f"{c}2"] = QUARRY[t]
for t, c in enumerate("BCD"):
    cells[f"{c}3"] = PREPAY[t]
low_root = checked_irr(QUARRY, -0.5, 0.5, guess=-0.1)
high_root = checked_irr(QUARRY, 1, 3, guess=0.9)
ex = {}
for i, g in enumerate(GUESSES, start=6):
    cells[f"A{i}"] = pct(g)
    cells[f"B{i}"] = {"fmt": "percent"}
    cells[f"C{i}"] = {"fmt": "percent"}
    root = excel_irr(QUARRY, g)
    assert root is not None and min(abs(root - low_root), abs(root - high_root)) < 1e-6
    ex[f"B{i}"] = r4(root)
    assert excel_irr(PREPAY, g) is None
    ex[f"C{i}"] = "#NUM!"
low_until = max(g for g in GUESSES if abs(excel_irr(QUARRY, g) - low_root) < 1e-6)
LESSONS.append(
    lesson(
        2,
        "multiple-irr",
        "Две ВСД и ни одной: когда ВСД теряет смысл",
        "IRR.xlsx, листы Multiple IRR и No IRR (рис. 9.2–9.3)",
        {
            "file": "Карьер.xlsx",
            "name": "Карьер",
            "columns": {"A": 190, "B": 130, "C": 150, "D": 80, "E": 80},
            "rows": 16,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "Карьер щебня: <b>20 млн ₸</b> на вскрышу сегодня, <b>82 млн ₸</b> от добычи через год, потом "
                "<b>60 млн ₸</b> на рекультивацию земли (это требует закон) и <b>2 млн ₸</b> от продажи техники. "
                "Знак потока меняется трижды: −, +, −, +. Посмотрим, что при этом происходит с ВСД.",
                [{"wait": 3000}],
            ),
            step(
                "Таблица предположений",
                "В <code>B6</code>: <code>{f:=IRR($B$2:$E$2,A6)}</code>, протяните до <code>B15</code>. Ответов "
                f"<b>два</b>: при предположениях до {round(low_until * 100)}% — <b>{pc(low_root)}</b>, от "
                f"{round(low_until * 100) + 20}% — <b>{pc(high_root)}</b>. Обе ставки верные: при каждой ЧПС "
                "карьера равна нулю. {fn:IRR} просто находит ту, что ближе к начальному предположению.",
                [
                    {"click": "B6"},
                    {"type": "=IRR($B$2:$E$2,"},
                    {"clickRef": "A6"},
                    {"type": ")"},
                    enter(),
                    {"click": "B6"},
                    {"fill": "B6:B15"},
                ],
            ),
            step(
                "Что значат две ВСД",
                f"Сказать «карьер приносит {pc(low_root)} в год» или «{pc(high_root)} в год» нельзя: обе фразы "
                "неверны. Когда ВСД несколько, у неё нет смысла «процентов в год». Решайте по ЧПС при стоимости "
                "капитала — она всегда одна.",
                [{"click": "B15"}, {"showRefs": "B15"}, {"wait": 2500}],
            ),
            step(
                "Проект без ВСД",
                "Предоплата: клиент платит <b>10 млн ₸</b> вперёд, мы тратим <b>30 млн ₸</b>, затем получаем "
                "<b>25 млн ₸</b>. В <code>C6</code>: <code>{f:=IRR($B$3:$D$3,A6)}</code>, протяните до "
                "<code>C15</code> — везде <code>#ЧИСЛО!</code>. ЧПС этого проекта положительна при любой ставке и "
                "нулём не становится, поэтому ставки, где ЧПС = 0, просто нет.",
                [
                    {"click": "C6"},
                    {"type": "=IRR($B$3:$D$3,"},
                    {"clickRef": "A6"},
                    {"type": ")"},
                    enter(),
                    {"click": "C6"},
                    {"fill": "C6:C15"},
                ],
            ),
            step(
                "Правило знаков",
                "Сколько раз знак потока меняется, столько ВСД может быть, но не больше. У карьера − + − + — три "
                "смены, у предоплаты + − + — две: одна ВСД не гарантирована. У обычного проекта сначала расход, "
                "потом только доходы: − + + + — одна смена, и ВСД ровно одна.",
                [{"wait": 3000}],
            ),
            step(
                "Что запомнить",
                "Знак потока меняется один раз — ВСД одна. Больше раз — ВСД может быть несколько или ни одной; "
                "проверьте таблицей предположений и решайте по ЧПС. <b>На работе пригодится</b> для проектов с "
                "большими расходами в конце: рекультивация, демонтаж, ремонт.",
                [{"click": "B6"}],
            ),
        ],
    )
)

# ---------- 09-03: ВСД против ЧПС ----------
BIG, SMALL = [-100, 140], [-10, 15]
cells = {
    "A1": label("Стоимость капитала"),
    "B1": pct(COST),
    "A3": head("Проект, млн ₸"),
    "B3": head(0),
    "C3": head(1),
    "D3": head("ВСД"),
    "E3": head("ЧПС"),
    "A4": "Логистический центр",
    "B4": BIG[0],
    "C4": BIG[1],
    "A5": "Кофейня",
    "B5": SMALL[0],
    "C5": SMALL[1],
    "A7": "Выбираем",
}
for r in (4, 5):
    cells[f"D{r}"] = {"fmt": "percent"}
    cells[f"E{r}"] = {"fmt": "number"}
big_irr, small_irr = checked_irr(BIG, 0, 1), checked_irr(SMALL, 0, 1)
big_npv, small_npv = npv0(COST, BIG), npv0(COST, SMALL)
LESSONS.append(
    lesson(
        3,
        "irr-vs-npv",
        "ВСД или ЧПС: какой проект выбрать",
        "IRR.xlsx, лист Which Project (рис. 9.4)",
        {
            "file": "Выбор_проекта.xlsx",
            "name": "Выбор",
            "columns": {"A": 200, "B": 80, "C": 80, "D": 110, "E": 110},
            "rows": 8,
            "cells": cells,
        },
        {
            "D4": r4(big_irr),
            "D5": r4(small_irr),
            "E4": r4(big_npv),
            "E5": r4(small_npv),
            "B7": "Логистический центр",
        },
        [
            step(
                "Ситуация",
                "Компания может взять только один проект. Логистический центр: <b>100 млн ₸</b> сегодня, "
                "<b>140 млн ₸</b> через год. Кофейня: <b>10 млн ₸</b> и <b>15 млн ₸</b>. Стоимость капитала — 15%. "
                "У обоих проектов знак меняется один раз, значит, ВСД у каждого одна.",
                [{"wait": 3000}],
            ),
            step(
                "ВСД обоих проектов",
                "В <code>D4</code>: <code>{f:=IRR(B4:C4)}</code>, протяните до <code>D5</code>. Логистический "
                f"центр — <b>{pc(big_irr)}</b>, кофейня — <b>{pc(small_irr)}</b>. Оба выше 15%, оба выгодны. "
                "Хочется выбрать кофейню: у неё ВСД выше.",
                [
                    {"click": "D4"},
                    {"type": "=IRR("},
                    {"dragRef": "B4:C4"},
                    {"type": ")"},
                    enter(),
                    {"click": "D4"},
                    {"fill": "D4:D5"},
                ],
            ),
            step(
                "ЧПС обоих проектов",
                "В <code>E4</code>: <code>{f:=B4+NPV($B$1,C4)}</code>, протяните до <code>E5</code>. Ставка "
                f"закреплена знаками <code>$</code>. Логистический центр добавит компании <b>{dec(big_npv)}</b> млн ₸, "
                f"кофейня — <b>{dec(small_npv)}</b> млн ₸. Каждый тенге в кофейне работает лучше, но тенге в ней "
                "в десять раз меньше.",
                [
                    {"click": "E4"},
                    {"type": "="},
                    {"clickRef": "B4"},
                    {"type": "+NPV($B$1,"},
                    {"clickRef": "C4"},
                    {"type": ")"},
                    enter(),
                    {"click": "E4"},
                    {"fill": "E4:E5"},
                ],
            ),
            step(
                "Выбираем по ЧПС",
                "В <code>B7</code>: <code>{f:=IF(E4>E5,A4,A5)}</code> — <b>Логистический центр</b>. {fn:IF} "
                "сравнивает ЧПС и возвращает название проекта из столбца A. ЧПС показывает, сколько денег проект "
                "добавит компании, — именно это нужно, когда выбрать можно только один.",
                [{"click": "B7"}, {"type": "=IF(E4>E5,A4,A5)"}, enter()],
            ),
            step(
                "Частая ошибка: ранжировать по ВСД",
                "ВСД не видит <b>масштаб</b> проекта: 50% от 10 млн — это 5 млн ₸, а 40% от 100 млн — 40 млн ₸. "
                "Выбрав проект с большей ВСД, компания заработает меньше. ВСД годится для вопроса «выгоден ли "
                "проект», а для выбора из нескольких — ЧПС.",
                [{"click": "E4"}, {"showRefs": "E4"}, {"wait": 2500}],
            ),
            step(
                "Что запомнить",
                "Проект выгоден, если ВСД выше стоимости капитала (и ЧПС больше нуля). Если выбрать можно только "
                "один — берите больший ЧПС, а не большую ВСД. <b>На работе пригодится</b> при распределении "
                "бюджета между проектами и филиалами.",
                [{"click": "B7"}],
            ),
        ],
    )
)

# ---------- 09-04: ЧИСТВНДОХ ----------
X_DATES = [dt.date(2027, 1, 15), dt.date(2027, 5, 20), dt.date(2027, 11, 10), dt.date(2028, 6, 5)]
X_FLOWS = [-2_000_000, 600_000, 700_000, 900_000]
cells = {
    "A1": head("Дата"),
    "B1": head("Поток"),
    "A7": "ЧИСТВНДОХ",
    "B7": {"fmt": "percent"},
    "A8": "ВСД (как будто через год)",
    "B8": {"fmt": "percent"},
}
for i, (d, v) in enumerate(zip(X_DATES, X_FLOWS, strict=True), start=2):
    cells[f"A{i}"] = date_cell(d)
    cells[f"B{i}"] = kzt(v)
x_years = [(d - X_DATES[0]).days / 365 for d in X_DATES]
x_rate = checked_irr(X_FLOWS, 0, 1, years=x_years)
wrong = checked_irr(X_FLOWS, 0, 1)
LESSONS.append(
    lesson(
        4,
        "xirr",
        "ЧИСТВНДОХ: ВСД для потоков с датами",
        "IRR.xlsx, лист XIRR (рис. 9.5)",
        {
            "file": "Заём_ИП.xlsx",
            "name": "Заём",
            "columns": {"A": 220, "B": 150},
            "rows": 9,
            "cells": cells,
        },
        {"B7": r4(x_rate), "B8": r4(wrong)},
        [
            step(
                "Ситуация",
                f"ТОО дало знакомому ИП заём <b>2 000 000 ₸</b> {ru(X_DATES[0])}, а он возвращает деньги частями — "
                "когда получается (строки 3–5). Под какой процент в год фактически работали деньги? Даты "
                "неравные, поэтому нужна {fn:XIRR}.",
                [{"wait": 3000}],
            ),
            step(
                "{fn:XIRR}: потоки и даты",
                "В <code>B7</code>: <code>{f:=XIRR(B2:B5,A2:A5)}</code> — потоки, затем их даты. {fn:XIRR} ищет "
                "ставку, при которой {fn:XNPV} этих потоков равна нулю: каждый поток дисконтируется на (дата − первая "
                f"дата) / 365 лет. Ответ — <b>{pc(x_rate)}</b> годовых. Первая дата должна быть самой ранней.",
                [
                    {"click": "B7"},
                    {"type": "=XIRR("},
                    {"dragRef": "B2:B5"},
                    {"type": ","},
                    {"dragRef": "A2:A5"},
                    {"type": ")"},
                    enter(),
                ],
            ),
            step(
                "Частая ошибка: {fn:IRR} для потоков с датами",
                "В <code>B8</code>: <code>{f:=IRR(B2:B5)}</code>. {fn:IRR} не знает дат и считает, что потоки идут "
                f"ровно через год: возврат растянулся бы на три года. Ответ — <b>{pc(wrong)}</b>, намного меньше "
                "правды: на самом деле деньги вернулись за полтора года. Если даты неравные — только {fn:XIRR}.",
                [{"click": "B8"}, {"type": "=IRR("}, {"dragRef": "B2:B5"}, {"type": ")"}, enter()],
            ),
            step(
                "Что запомнить",
                "<code>{f:=XIRR(потоки,даты)}</code> — ВСД для потоков в любые даты, в процентах годовых. Третий "
                "аргумент — предположение, как у {fn:IRR}. <b>На работе пригодится</b> для займов, рассрочек и "
                "инвестиций с нерегулярными платежами.",
                [{"click": "B7"}],
            ),
        ],
    )
)

# ---------- 09-05: МВСД ----------
LOAN = [-120, 39, 30, 21, 37, 46]  # рис. 9.6, млн ₸
FIN, REINV = 0.10, 0.12
cells = {
    "A1": label("Ставка займа"),
    "B1": pct(FIN),
    "A2": label("Ставка реинвестирования"),
    "B2": pct(REINV),
    "A4": head("Год"),
    "A5": "Поток, млн ₸",
    "A6": "К 5-му году под 12%",
    "A8": "ВСД",
    "B8": {"fmt": "percent"},
    "A9": "МВСД",
    "B9": {"fmt": "percent"},
    "A11": "Расходы сегодня",
    "B11": {"fmt": "number"},
    "A12": "Доходы к 5-му году",
    "B12": {"fmt": "number"},
    "A13": "МВСД вручную",
    "B13": {"fmt": "percent"},
}
for t, c in enumerate("BCDEFG"):
    cells[f"{c}4"] = head(t)
    cells[f"{c}5"] = LOAN[t]
    if t:
        cells[f"{c}6"] = {"fmt": "number"}
n_last = len(LOAN) - 1
grown = [LOAN[t] * (1 + REINV) ** (n_last - t) for t in range(1, len(LOAN))]
loan_irr = checked_irr(LOAN, 0, 1)
loan_mirr = mirr(LOAN, FIN, REINV)
manual = (sum(grown) / -LOAN[0]) ** (1 / n_last) - 1
assert abs(manual - loan_mirr) < 1e-12
ex = {"B8": r4(loan_irr), "B9": r4(loan_mirr), "B11": 120, "B12": r4(sum(grown)), "B13": r4(manual)}
for t, c in enumerate("CDEFG", start=1):
    ex[f"{c}6"] = r4(grown[t - 1])
LESSONS.append(
    lesson(
        5,
        "mirr",
        "МВСД: когда деньги берут под одну ставку, а кладут под другую",
        "IRR.xlsx, лист MIRR; MIRR.xlsx (рис. 9.6–9.7)",
        {
            "file": "МВСД.xlsx",
            "name": "Заём",
            "columns": {"A": 220, "B": 80, "C": 80, "D": 80, "E": 80, "F": 80, "G": 80},
            "rows": 14,
            "cells": cells,
        },
        ex,
        [
            step(
                "Ситуация",
                "Предприниматель взял <b>120 млн ₸</b> в банке под 10% и 5 лет получает от бизнеса 21–46 млн ₸ в "
                "год. Свободные деньги он сразу кладёт на депозит под 12%. Какая у проекта доходность? ВСД неявно "
                "считает, что и занимают, и вкладывают под одну ставку — саму ВСД. Здесь ставки разные.",
                [{"wait": 3000}],
            ),
            step(
                "ВСД",
                f"В <code>B8</code>: <code>{{f:=IRR(B5:G5)}}</code> — <b>{pc(loan_irr)}</b>. Но в этом ответе "
                f"заложено, что каждый полученный миллион снова приносит {pc(loan_irr)} в год. А депозит даёт только "
                "12%.",
                [{"click": "B8"}, {"type": "=IRR("}, {"dragRef": "B5:G5"}, {"type": ")"}, enter()],
            ),
            step(
                "{fn:MIRR}: ставка займа и реинвестирования",
                "В <code>B9</code>: <code>{f:=MIRR(B5:G5,B1,B2)}</code> — потоки, ставка, под которую берут деньги, "
                f"и ставка, под которую вкладывают доходы. <b>{pc(loan_mirr)}</b> — ниже ВСД: доходы растут только "
                "под 12%. У {fn:MIRR} ответ всегда один, сколько бы раз ни менялся знак потока.",
                [{"click": "B9"}, {"type": "=MIRR("}, {"dragRef": "B5:G5"}, {"type": ",B1,B2)"}, enter()],
            ),
            step(
                "Как считает МВСД: доходы к последнему году",
                "Повторим расчёт вручную (рис. 9.7). Каждый доход кладём на депозит до 5-го года: в "
                "<code>C6</code> <code>{f:=C5*(1+$B$2)^($G$4-C4)}</code> — доход 1-го года растёт 4 года под 12%. "
                f"Протяните до <code>G6</code>. Вместе к 5-му году набирается <b>{dec(sum(grown))}</b> млн ₸ "
                "(<code>B12</code>), а сегодня потрачено 120 млн ₸ (<code>B11</code>).",
                [
                    {"click": "C6"},
                    {"type": "="},
                    {"clickRef": "C5"},
                    {"type": "*(1+$B$2)^($G$4-"},
                    {"clickRef": "C4"},
                    {"type": ")"},
                    enter(),
                    {"click": "C6"},
                    {"fill": "C6:G6"},
                    {"click": "B11"},
                    {"type": "=-B5"},
                    enter(),
                    {"type": "=SUM(C6:G6)"},
                    enter(),
                ],
            ),
            step(
                "Простая доходность: (итог / вложено)^(1/лет) − 1",
                f"Теперь проект простой: 120 млн сегодня → {dec(sum(grown))} млн через 5 лет. Доходность такого "
                "вложения — <code>{f:=(B12/B11)^(1/5)-1}</code>: во сколько раз выросли деньги, корень пятой "
                f"степени — рост за год. <b>{pc(manual)}</b> — ровно "
                "МВСД. Если бы расходы были и позже, их сначала привели бы к сегодняшнему дню по ставке займа.",
                [{"click": "B13"}, {"type": "=(B12/B11)^(1/5)-1"}, enter()],
            ),
            step(
                "Что запомнить",
                "<code>{f:=MIRR(потоки,ставка_займа,ставка_реинвестирования)}</code> — доходность с реальными "
                "ставками: расходы дисконтируются под ставку займа, доходы растут под ставку депозита. Ответ всегда "
                "один. <b>На работе пригодится</b>, когда кредит и депозит в банке под разные проценты.",
                [{"click": "B9"}],
            ),
        ],
    )
)


def dump(path, data):
    text = yaml.safe_dump(apply_text_edits(data), allow_unicode=True, sort_keys=False, width=118)
    path.write_text(
        f"# Глава 9 (ВСД). Собрано генератором; ответы expect посчитаны независимо.\n{text}",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    slugs = {1: "irr-basics", 2: "multiple-irr", 3: "irr-vs-npv", 4: "xirr", 5: "mirr"}
    for les in LESSONS:
        dump(ROOT / "lessons" / f"09-{les['order']:02d}-{slugs[les['order']]}.yaml", les)
    import exercises_ch09  # noqa: E402  задания — в отдельном файле

    exercises_ch09.main(ROOT, dump)
    print("ok:", len(LESSONS), "уроков")
