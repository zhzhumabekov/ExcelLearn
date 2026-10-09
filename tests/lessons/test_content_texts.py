"""Тексты уроков и заданий: формулы в плейсхолдерах {f:…} не повреждены (например, заменой запятых на пробелы)."""

import re
from pathlib import Path

import pytest
from django.conf import settings

FILES = sorted((Path(settings.CONTENT_DIR)).glob("*/*.yaml"))
FORMULA_RE = re.compile(r"\{f:(=[^{}]+)\}")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_formula_placeholders_have_no_spaces_outside_quotes(path):
    broken = []
    for formula in FORMULA_RE.findall(path.read_text(encoding="utf-8")):
        outside_quotes = re.sub(r'"(?:[^"]|"")*"', "", formula)
        if " " in outside_quotes:
            broken.append(formula)
    assert broken == []
