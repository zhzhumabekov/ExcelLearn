"""Правовые документы из docs/legal/*.md: версия из заголовка-комментария и простая разметка в HTML.

Разметка — только то, что есть в документах: заголовки #/##, абзацы, нумерованные и маркированные
списки (вложенные — отступом 3 пробела), **жирный**, разделитель ---. Текст экранируется.
"""

import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from django.conf import settings
from django.utils.html import escape
from django.utils.safestring import SafeString, mark_safe

CONSENT_PATH = Path(settings.BASE_DIR) / "docs" / "legal" / "consent-ru.md"


@dataclass(frozen=True)
class Document:
    version: str
    title: str
    html: SafeString


def _inline(text: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escape(text))


def render_markdown(source: str) -> tuple[str, str]:
    """→ (заголовок первого уровня, HTML тела без него)."""
    html: list[str] = []
    title = ""
    stack: list[tuple[str, int]] = []  # открытые списки: (тег, отступ)
    paragraph: list[str] = []

    def close_paragraph():
        if paragraph:
            html.append(f"<p>{_inline(' '.join(paragraph))}</p>")
            paragraph.clear()

    def close_lists(indent: int = -1):
        while stack and stack[-1][1] > indent:
            html.append(f"</li></{stack.pop()[0]}>")

    for line in source.splitlines():
        item = re.match(r"^(\s*)(\d+\.|-)\s+(.*)$", line)
        if item:
            close_paragraph()
            indent, marker, text = len(item.group(1)), item.group(2), item.group(3)
            tag = "ol" if marker[0].isdigit() else "ul"
            close_lists(indent)
            if stack and stack[-1][1] == indent:
                html.append("</li>")
            else:
                html.append(f"<{tag}>")
                stack.append((tag, indent))
            html.append(f"<li>{_inline(text)}")
            continue
        close_lists()
        if not line.strip():
            close_paragraph()
        elif line.startswith("# "):
            close_paragraph()
            title = line[2:].strip()
        elif line.startswith("## "):
            close_paragraph()
            html.append(f"<h2>{_inline(line[3:].strip())}</h2>")
        elif line.strip() == "---":
            close_paragraph()
            html.append("<hr>")
        else:
            paragraph.append(line.strip())
    close_paragraph()
    close_lists()
    return title, "\n".join(html)


@cache
def consent() -> Document:
    source = CONSENT_PATH.read_text(encoding="utf-8")
    header = re.match(r"\s*<!--(.*?)-->", source, re.S)
    version = re.search(r"^version:\s*(\S+)", header.group(1), re.M) if header else None
    if not version:
        raise ValueError(f"{CONSENT_PATH.name}: нет «version:» в комментарии в начале файла")
    body = source[header.end() :] if header else source
    title, html = render_markdown(body)
    # mark_safe: весь текст экранирован в _inline, разметку добавляет только render_markdown
    return Document(version=version.group(1), title=title, html=mark_safe(html))
