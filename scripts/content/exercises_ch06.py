"""Задания главы 6 — по мотивам заданий книги, данные свои. Ответы expect считаются здесь, на Python."""

from gen_ch06 import head, label, x_find, x_substitute, x_trim, x_value

EXERCISES = []


def ex(number, eid, title, task, explain, mistake, sheet, cells_f, fills, expect):
    solution = {"cells": {addr: {"f": f} for addr, f in cells_f.items()}}
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


def last_space(s):
    """Позиция последнего пробела (как FIND("*";SUBSTITUTE(…;"*";число_пробелов)))."""
    return s.rfind(" ") + 1


# 1. Имя и адрес из одной строки
ROWS = [
    "Асель Нурланова, Алматы, пр. Абая 15",
    "Данияр Ахметов, Астана, ул. Кенесары 40",
    "Ольга Пак, Караганда, ул. Ерубаева 3",
    "Ержан Тулеуов, Шымкент, ул. Байтурсынова 7",
]
cells = {"A1": head("Запись из анкеты"), "B1": head("Имя"), "C1": head("Адрес")}
expect = {}
for i, r in enumerate(ROWS, start=2):
    cells[f"A{i}"] = r
    comma = x_find(",", r)
    expect[f"B{i}"] = r[: comma - 1]
    expect[f"C{i}"] = x_trim(r[comma : comma + 200])
ex(
    1,
    "name-address",
    "Имя и адрес из одной строки",
    "В анкетах имя и адрес записаны в одну ячейку через запятую. Разложите их: имя — в столбец B, адрес — в "
    "столбец C (без пробела в начале).",
    'Граница — первая запятая: <code>{f:=FIND(",",A2)}</code>. Имя — всё до неё: '
    '<code>{f:=LEFT(A2,FIND(",",A2)-1)}</code>. Адрес — всё после, без пробела: '
    '<code>{f:=TRIM(MID(A2,FIND(",",A2)+1,200))}</code>. Протяните вниз.',
    "Забыть «−1» в {fn:LEFT} — в имя попадёт запятая; забыть {fn:TRIM} — адрес начнётся с пробела.",
    {"file": "Анкеты.xlsx", "name": "Анкеты", "columns": {"A": 330, "B": 150, "C": 250}, "cells": cells},
    {"B2": '=LEFT(A2,FIND(",",A2)-1)', "C2": '=TRIM(MID(A2,FIND(",",A2)+1,200))'},
    [("B2", "B2:B5"), ("C2", "C2:C5")],
    expect,
)

# 2. Артикул и цена разной длины
ROWS = ["АРТ-1024 15990", "Б-7 450", "ПРЕМ-55821 1250000", "К-310 8990", "ТВ-4K-55 289000"]
cells = {"A1": head("Строка прайса"), "B1": head("Артикул"), "C1": head("Цена, ₸")}
expect = {}
for i, r in enumerate(ROWS, start=2):
    cells[f"A{i}"] = r
    cells[f"C{i}"] = {"fmt": "kzt"}
    sp = x_find(" ", r)
    expect[f"B{i}"] = r[: sp - 1]
    expect[f"C{i}"] = x_value(r[sp : sp + 20])
ex(
    2,
    "sku-price",
    "Артикул и цена разной длины",
    "В прайсе артикул и цена — в одной ячейке через пробел, длина артикула разная. Извлеките артикул в B и цену "
    "<b>числом</b> в C. Затем попробуйте то же <b>Данные → Текст по столбцам</b> (разделитель — пробел).",
    'Граница — пробел: <code>{f:=LEFT(A2,FIND(" ",A2)-1)}</code> — артикул, '
    '<code>{f:=VALUE(MID(A2,FIND(" ",A2)+1,20))}</code> — цена.',
    "Взять «первые 5 символов» — у артикулов разная длина. И без {fn:VALUE} цена останется текстом.",
    {"file": "Прайс_строкой.xlsx", "name": "Прайс", "columns": {"A": 200, "B": 140, "C": 130}, "cells": cells},
    {"B2": '=LEFT(A2,FIND(" ",A2)-1)', "C2": '=VALUE(MID(A2,FIND(" ",A2)+1,20))'},
    [("B2", "B2:B6"), ("C2", "C2:C6")],
    expect,
)

# 3. Квартальные данные: год, квартал, значение
DATA = [
    ("2023", 1, 28450),
    ("2023", 2, 31720),
    ("2023", 3, 35980),
    ("2023", 4, 38110),
    ("2024", 1, 30260),
    ("2024", 2, 34410),
]
cells = {"A1": head("Запись"), "B1": head("Год"), "C1": head("Квартал"), "D1": head("Выпуск, млрд ₸")}
expect = {}
for i, (year, q, value) in enumerate(DATA, start=2):
    text = f"{year}-К{q} {value}"
    cells[f"A{i}"] = text
    expect[f"B{i}"] = int(text[:4])
    expect[f"C{i}"] = int(text[6:7])
    expect[f"D{i}"] = x_value(text[8:28])
ex(
    3,
    "quarter-split",
    "Год, квартал и выпуск из одной строки",
    "Статистика выгружена строками вида «2023-К1 28450» (условный выпуск, млрд ₸). Разложите в три столбца "
    "<b>числами</b>: год, номер квартала и выпуск.",
    "Части стоят на одних и тех же местах: год — <code>{f:=VALUE(LEFT(A2,4))}</code>, квартал — 7-й символ "
    "<code>{f:=VALUE(MID(A2,7,1))}</code>, выпуск — с 9-го: <code>{f:=VALUE(MID(A2,9,20))}</code>.",
    "Считать позиции «на глаз»: «2023-К1» — это 7 символов, выпуск начинается с 9-го (после пробела).",
    {
        "file": "Выпуск_кварталы.xlsx",
        "name": "Кварталы",
        "columns": {"A": 160, "B": 80, "C": 90, "D": 140},
        "cells": cells,
    },
    {"B2": "=VALUE(LEFT(A2,4))", "C2": "=VALUE(MID(A2,7,1))", "D2": "=VALUE(MID(A2,9,20))"},
    [("B2", "B2:B7"), ("C2", "C2:C7"), ("D2", "D2:D7")],
    expect,
)

# 4. Модель, цвет и размер одежды
CODES = ["Модель:100-65-L", "Модель:7-120-XL", "Модель:2510-3-M", "Модель:48-17-XXL", "Модель:333-9-S"]
cells = {"A1": head("Код товара"), "B1": head("Модель"), "C1": head("Цвет"), "D1": head("Размер")}
expect = {}
for i, code in enumerate(CODES, start=2):
    cells[f"A{i}"] = code
    colon = x_find(":", code)
    d1 = x_find("-", code)
    d2 = x_find("-", code, d1 + 1)
    expect[f"B{i}"] = x_value(code[colon : d1 - 1])
    expect[f"C{i}"] = x_value(code[d1 : d2 - 1])
    expect[f"D{i}"] = code[d2 : d2 + 10]
ex(
    4,
    "clothing-code",
    "Модель, цвет и размер из кода товара",
    "Код одежды «Модель:100-65-L»: номер модели — между двоеточием и первым дефисом, цвет — между дефисами, "
    "размер — после второго дефиса. Длина частей разная. Извлеките модель и цвет <b>числами</b>, размер — текстом.",
    'Найдите позиции: двоеточие {fn:FIND}, первый дефис, второй — <code>{f:=FIND("-",A2,FIND("-",A2)+1)}</code>. '
    'Модель: <code>{f:=VALUE(MID(A2,FIND(":",A2)+1,FIND("-",A2)-FIND(":",A2)-1))}</code>; цвет и размер — '
    "так же, между найденными позициями.",
    "Искать второй дефис без третьего аргумента {fn:FIND} — она снова найдёт первый.",
    {"file": "Коды_одежды.xlsx", "name": "Коды", "columns": {"A": 170, "B": 90, "C": 80, "D": 90}, "cells": cells},
    {
        "B2": '=VALUE(MID(A2,FIND(":",A2)+1,FIND("-",A2)-FIND(":",A2)-1))',
        "C2": '=VALUE(MID(A2,FIND("-",A2)+1,FIND("-",A2,FIND("-",A2)+1)-FIND("-",A2)-1))',
        "D2": '=MID(A2,FIND("-",A2,FIND("-",A2)+1)+1,10)',
    },
    [("B2", "B2:B6"), ("C2", "C2:C6"), ("D2", "D2:D6")],
    expect,
)

# 5. Адреса почты
NAMES = ["Aigerim Saparova", "Daniyar Akhmetov", "Olga Pak", "Yerzhan Tuleuov", "Madina Zhumatova", "Timur Kim"]
cells = {"A1": head("Сотрудник"), "B1": head("Почта")}
expect = {}
for i, n in enumerate(NAMES, start=2):
    cells[f"A{i}"] = n
    sp = x_find(" ", n)
    expect[f"B{i}"] = (n[0] + n[sp : sp + 100]).lower() + "@company.kz"
ex(
    5,
    "email-login",
    "Почта: первая буква имени и фамилия",
    "Новым сотрудникам нужна почта: первая буква имени, фамилия и <b>@company.kz</b>, всё строчными. Например, "
    "Aigerim Saparova → asaparova@company.kz.",
    "Буква имени — <code>{f:=LEFT(A2,1)}</code>, фамилия — всё после пробела: "
    '<code>{f:=MID(A2,FIND(" ",A2)+1,100)}</code>. Склейте, сделайте строчными и добавьте домен: '
    '<code>{f:=LOWER(LEFT(A2,1)&MID(A2,FIND(" ",A2)+1,100))&"@company.kz"}</code>.',
    "Забыть {fn:LOWER}: почта не чувствительна к регистру, но в списке рассылки появятся «разные» адреса.",
    {"file": "Почта_сотрудников.xlsx", "name": "Почта", "columns": {"A": 190, "B": 240}, "cells": cells},
    {"B2": '=LOWER(LEFT(A2,1)&MID(A2,FIND(" ",A2)+1,100))&"@company.kz"'},
    [("B2", "B2:B7")],
    expect,
)

# 6. Фамилия, Имя Отчество
FIO = ["Асель Маратовна Нурланова", "Тимур Ким", "Данияр Серикович Ахметов", "Ольга Пак", "Мадина Ерлановна Жуматова"]
cells = {"A1": head("Как в анкете"), "B1": head("Последний пробел"), "C1": head("Для списка")}
expect = {}
for i, n in enumerate(FIO, start=2):
    cells[f"A{i}"] = n
    ls = last_space(n)
    expect[f"B{i}"] = ls
    expect[f"C{i}"] = n[ls : ls + 100] + ", " + n[: ls - 1]
LAST = 'FIND("*",SUBSTITUTE(A2," ","*",LEN(A2)-LEN(SUBSTITUTE(A2," ",""))))'
ex(
    6,
    "surname-first",
    "«Фамилия, Имя Отчество»",
    "В анкетах ФИО записаны «Имя Отчество Фамилия» (у некоторых без отчества). Для списка нужна форма "
    "«Фамилия, Имя Отчество». В B найдите позицию <b>последнего</b> пробела, в C соберите строку.",
    'Сколько пробелов: <code>{f:=LEN(A2)-LEN(SUBSTITUTE(A2," ",""))}</code>. Заменим последний пробел '
    'звёздочкой и найдём её: <code>{f:=FIND("*",SUBSTITUTE(A2," ","*",LEN(A2)-LEN(SUBSTITUTE(A2," ",""))))}'
    "</code>. Фамилия — <code>{f:=MID(A2,B2+1,100)}</code>, остальное — <code>{f:=LEFT(A2,B2-1)}</code>.",
    "Искать первый пробел: у ФИО с отчеством фамилией окажется «Маратовна Нурланова».",
    {"file": "Список_ФИО.xlsx", "name": "ФИО", "columns": {"A": 230, "B": 140, "C": 250}, "cells": cells},
    {"B2": "=" + LAST, "C2": '=MID(A2,B2+1,100)&", "&LEFT(A2,B2-1)'},
    [("B2", "B2:B6"), ("C2", "C2:C6")],
    expect,
)

# 7. Гистограмма зарплат
BANDS = [("до 200", 4), ("200–300", 11), ("300–400", 18), ("400–500", 13), ("500–700", 7), ("700 и выше", 3)]
cells = {"A1": head("Зарплата, тыс. ₸"), "B1": head("Выпускников"), "C1": head("График")}
expect = {}
for i, (band, n) in enumerate(BANDS, start=2):
    cells[f"A{i}"] = band
    cells[f"B{i}"] = n
    expect[f"C{i}"] = "■" * n
ex(
    7,
    "salary-chart",
    "Стартовые зарплаты выпускников: график символами",
    "Вуз опросил выпускников о стартовой зарплате. Постройте в столбце C график: столько символов «■», сколько "
    "выпускников в группе.",
    '<code>{f:=REPT("■",B2)}</code> и протянуть вниз.',
    "Взять ссылку на текст подписи вместо числа: {fn:REPT} нужен номер, сколько раз повторить.",
    {
        "file": "Зарплаты_выпускников.xlsx",
        "name": "Зарплаты",
        "columns": {"A": 150, "B": 110, "C": 200},
        "cells": cells,
    },
    {"C2": '=REPT("■",B2)'},
    [("C2", "C2:C7")],
    expect,
)

# 8. Алфавит формулой
cells = {"C1": label("Буквы A–Z одной формулой")}
expect = {f"A{i}": chr(64 + i) for i in range(1, 27)}
ex(
    8,
    "alphabet",
    "Латинский алфавит одной формулой",
    "{fn:CHAR}(65) — буква A, {fn:CHAR}(66) — B и так далее. Заполните <code>A1:A26</code> буквами от A до Z одной "
    "формулой, протянутой вниз.",
    "Номер строки даёт {fn:ROW}: <code>{f:=CHAR(64+ROW())}</code> — в первой строке 65 (A), во второй 66 (B)…",
    "Брать русские буквы через {fn:CHAR}: в русском Excel {fn:CHAR} берёт кодовую страницу Windows — для кириллицы "
    "и казахских букв надёжнее {fn:UNICHAR}.",
    {"file": "Алфавит.xlsx", "name": "Алфавит", "columns": {"A": 70, "B": 30, "C": 220}, "cells": cells},
    {"A1": "=CHAR(64+ROW())"},
    [("A1", "A1:A26")],
    expect,
)

# 9. Заглавная буква в начале фразы
PHRASES = ["бизнес любит цифры", "клиент всегда прав", "время — деньги", "семь раз отмерь, один раз отрежь"]
cells = {"A1": head("Фраза"), "B1": head("С заглавной")}
expect = {}
for i, p in enumerate(PHRASES, start=2):
    cells[f"A{i}"] = p
    expect[f"B{i}"] = p[0].upper() + p[1:1000]
ex(
    9,
    "capital-first",
    "Заглавная буква в начале фразы",
    "Слоганы для презентации записаны строчными. Сделайте заглавной <b>только первую</b> букву каждой фразы.",
    "Первая буква заглавная плюс остальное как есть: <code>{f:=UPPER(LEFT(A2,1))&MID(A2,2,1000)}</code>.",
    "Взять {fn:PROPER}: он сделает заглавной первую букву <b>каждого</b> слова — «Клиент Всегда Прав».",
    {"file": "Слоганы.xlsx", "name": "Слоганы", "columns": {"A": 280, "B": 280}, "cells": cells},
    {"B2": "=UPPER(LEFT(A2,1))&MID(A2,2,1000)"},
    [("B2", "B2:B5")],
    expect,
)

# 10. Поиск по двум столбцам
CARS = [
    ("Toyota Camry", 2019, 13500000),
    ("Toyota Camry", 2021, 16200000),
    ("Hyundai Tucson", 2019, 11900000),
    ("Hyundai Tucson", 2022, 15400000),
    ("Kia Rio", 2021, 7300000),
    ("Kia Rio", 2023, 8900000),
    ("Lada Granta", 2022, 4600000),
    ("Toyota Camry", 2023, 19800000),
]
cells = {
    "A1": head("Модель"),
    "B1": head("Год"),
    "C1": head("Цена, ₸"),
    "D1": head("Ключ"),
    "F1": label("Модель"),
    "G1": "Hyundai Tucson",
    "F2": label("Год"),
    "G2": 2022,
    "F3": label("Цена"),
    "G3": {"fmt": "kzt"},
}
expect = {}
for i, (model, year, price) in enumerate(CARS, start=2):
    cells[f"A{i}"] = model
    cells[f"B{i}"] = year
    cells[f"C{i}"] = {"v": price, "fmt": "kzt"}
    expect[f"D{i}"] = f"{model}{year}"
expect["G3"] = next(p for m, y, p in CARS if m == "Hyundai Tucson" and y == 2022)
ex(
    10,
    "two-key-lookup",
    "Цена по модели и году",
    "В автосалоне цена зависит от модели и года выпуска. Напишите формулу в <code>G3</code>: по модели в "
    "<code>G1</code> и году в <code>G2</code> — цена.",
    "Склейте два признака в один ключ: в D <code>{f:=A2&B2}</code> («Hyundai Tucson2022»), протяните. Дальше — "
    "поиск по ключу: <code>{f:=INDEX(C2:C9,MATCH(G1&G2,D2:D9,0))}</code>.",
    "Искать только по модели: {fn:MATCH} найдёт первую строку с этой моделью, а год окажется любой.",
    {
        "file": "Цены_авто.xlsx",
        "name": "Авто",
        "columns": {"A": 150, "B": 60, "C": 120, "D": 170, "E": 20, "F": 70, "G": 140},
        "cells": cells,
    },
    {"D2": "=A2&B2", "G3": "=INDEX(C2:C9,MATCH(G1&G2,D2:D9,0))"},
    [("D2", "D2:D9")],
    expect,
)

# 11. Фильм и проданные копии
MOVIES = ["Келин 340", "Қыз Жібек 1200", "Брат 2 1250", "Аманат 870", "Бауыржан Момышұлы 515", "Номад 2 Кочевник 95"]
cells = {"A1": head("Фильм и копии"), "B1": head("Последний пробел"), "C1": head("Фильм"), "D1": head("Копий")}
expect = {}
for i, m in enumerate(MOVIES, start=2):
    cells[f"A{i}"] = m
    ls = last_space(m)
    expect[f"B{i}"] = ls
    expect[f"C{i}"] = m[: ls - 1]
    expect[f"D{i}"] = x_value(m[ls : ls + 10])
ex(
    11,
    "movie-copies",
    "Название фильма и число копий",
    "Кинопрокатчик прислал строки «название и число проданных копий». В названии бывают цифры и несколько слов. "
    "Найдите позицию последнего пробела, затем разделите название и число копий (числом).",
    "Последний пробел — как в задании 6: <code>{f:=" + LAST + "}</code>. Название — "
    "<code>{f:=LEFT(A2,B2-1)}</code>, копии — <code>{f:=VALUE(MID(A2,B2+1,10))}</code>.",
    "Искать первый пробел: «Брат 2 1250» разрежется на «Брат» и «2 1250».",
    {"file": "Прокат.xlsx", "name": "Прокат", "columns": {"A": 230, "B": 140, "C": 180, "D": 80}, "cells": cells},
    {"B2": "=" + LAST, "C2": "=LEFT(A2,B2-1)", "D2": "=VALUE(MID(A2,B2+1,10))"},
    [("B2", "B2:B7"), ("C2", "C2:C7"), ("D2", "D2:D7")],
    expect,
)

# 12. Сумма с неразрывными пробелами
AMOUNTS = [1250, 880, 2310, 4075]
cells = {
    "A1": head("С сайта"),
    "B1": head("Число"),
    "A6": {"f": "=SUM(A2:A5)", "style": "total"},
    "B6": {"style": "total"},
}
expect = {}
for i, a in enumerate(AMOUNTS, start=2):
    raw = " " + str(a)
    cells[f"A{i}"] = raw
    expect[f"B{i}"] = x_value(x_substitute(raw, " ", ""))
expect["B6"] = sum(AMOUNTS)
ex(
    12,
    "nbsp-sum",
    "Почему СУММ даёт ноль",
    "Суммы скопированы с сайта поставщика, и <code>{f:=SUM(A2:A5)}</code> даёт 0. Перед каждым числом спрятан "
    "невидимый символ. Найдите его и получите в B числа, а в <code>B6</code> — правильную сумму.",
    "Проверьте: <code>{f:=FIND(CHAR(160),A2)}</code> = 1 — это неразрывный пробел. Уберите его: "
    '<code>{f:=VALUE(SUBSTITUTE(A2,CHAR(160),""))}</code>, протяните, и <code>{f:=SUM(B2:B5)}</code>.',
    "Взять {fn:TRIM} или {fn:CLEAN}: ни одна из них не убирает символ 160.",
    {"file": "Суммы_с_сайта.xlsx", "name": "Суммы", "columns": {"A": 130, "B": 130}, "cells": cells},
    {"B2": '=VALUE(SUBSTITUTE(A2,CHAR(160),""))', "B6": "=SUM(B2:B5)"},
    [("B2", "B2:B5")],
    expect,
)

# 13. Фраза с долей рынка (ТЕКСТ)
SHARES = [
    ("Kaspi", 0.312),
    ("Halyk", 0.218),
    ("Freedom", 0.123),
    ("Forte", 0.087),
    ("Jusan", 0.064),
    ("Bereke", 0.041),
]
cells = {
    "A1": head("Место"),
    "B1": head("Компания"),
    "C1": head("Доля рынка"),
    "E1": label("Место"),
    "F1": 3,
    "E2": label("Фраза"),
}
for i, (name, share) in enumerate(SHARES, start=2):
    cells[f"A{i}"] = i - 1
    cells[f"B{i}"] = name
    cells[f"C{i}"] = {"v": share, "fmt": "percent"}
rank = 3
name, share = SHARES[rank - 1]
pct = int(share * 100 + 0.5)
expect = {"F2": f"Компания № {rank} — {name}, доля рынка {pct}%"}
ex(
    13,
    "share-phrase",
    "Фраза с долей рынка: ТЕКСТ",
    "Для отчёта нужна фраза по месту компании (условные данные): в <code>F1</code> — место, в <code>F2</code> — "
    "«Компания № 3 — Freedom, доля рынка 12%». Доля должна выглядеть процентом, а не «0,123».",
    'Название — <code>{f:=INDEX(B2:B7,F1)}</code>, доля — <code>{f:=TEXT(INDEX(C2:C7,F1),"0%")}</code>. Всё вместе: '
    '<code>{f:="Компания № "&F1&" — "&INDEX(B2:B7,F1)&", доля рынка "&TEXT(INDEX(C2:C7,F1),"0%")}</code>.',
    "Склеить без {fn:TEXT}: формат процента потеряется, и во фразе будет «0,123».",
    {
        "file": "Доли_рынка.xlsx",
        "name": "Рынок",
        "columns": {"A": 70, "B": 110, "C": 110, "D": 20, "E": 70, "F": 330},
        "cells": cells,
    },
    {"F2": '="Компания № "&F1&" — "&INDEX(B2:B7,F1)&", доля рынка "&TEXT(INDEX(C2:C7,F1),"0%")'},
    [],
    expect,
)


def main(root, dump):
    data = {"chapter": "ch06", "exercises": EXERCISES}
    dump(root / "exercises" / "ch06.yaml", data)
