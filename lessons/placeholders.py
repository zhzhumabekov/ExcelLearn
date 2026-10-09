"""Плейсхолдеры текстов на сервере — как в плеере (player/src/locale/format.ts): {fn:VLOOKUP} → «ВПР»,
{f:=SUM(A1,1.5)} → «=СУММ(A1;1,5)». Нужны страницам и файлам заданий: их тексты не проходят через плеер.
Словарь имён функций — общий с плеером (player/src/locale/functions-ru.json)."""

import json
import re
from functools import cache
from html import escape
from pathlib import Path

from django.conf import settings

PLACEHOLDER_RE = re.compile(r"\{fn:([A-Z][A-Z0-9.]*)\}|\{f:(=[^{}]+)\}")
# Строка в кавычках | имя листа в апострофах | идентификатор | число | любой символ — как TOKEN_RE в format.ts
TOKEN_RE = re.compile(
    r"\"(?:[^\"]|\"\")*\"|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_.]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+|[\s\S]"
)


@cache
def _dictionary() -> dict:
    path = Path(settings.BASE_DIR) / "player" / "src" / "locale" / "functions-ru.json"
    return json.loads(path.read_text(encoding="utf-8"))


def function_name(name: str, locale: str = "ru") -> str:
    upper = name.upper()
    return _dictionary()["functions"].get(upper, upper) if locale == "ru" else upper


def localize_formula(formula: str, locale: str = "ru") -> str:
    if locale != "ru":
        return formula
    tokens = TOKEN_RE.findall(formula)
    out = []
    for i, token in enumerate(tokens):
        first = token[0]
        if first in "\"'":
            out.append(token)
        elif re.match(r"[A-Za-z_]", token):
            is_call = i + 1 < len(tokens) and tokens[i + 1] == "("
            upper = token.upper()
            out.append(function_name(token) if is_call or upper in ("TRUE", "FALSE") else token)
        elif re.match(r"\.?\d", token):
            out.append(token.replace(".", ","))
        elif token == ",":
            out.append(";")
        else:
            out.append(token)
    return "".join(out)


def render_placeholders(text: str, locale: str = "ru") -> str:
    """HTML с плейсхолдерами → HTML на языке ученика (формула экранируется)."""

    def replace(m: re.Match) -> str:
        fn, formula = m.groups()
        return escape(function_name(fn, locale) if fn else localize_formula(formula, locale), quote=False)

    return PLACEHOLDER_RE.sub(replace, text)
