import sys


def force_utf8_stdout() -> None:
    """Кириллица в выводе команд при перенаправлении в pipe/файл на Windows (иначе cp1251)."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
