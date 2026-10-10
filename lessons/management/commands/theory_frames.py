import json
import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from lessons.theory import FRAMES_DIR, LOCALES, MANIFEST, figure_hash, figure_lesson, frame_path, load_theory

from ..utf8 import force_utf8_stdout

PAGE = '<!doctype html><html><body style="margin:0;background:#fff"><div id="player" style="width:1300px"></div>'
# Плеер проигрывает кадр без анимации курсора и озвучки; на снимке — только окно Excel
MOUNT = """async ([lesson, locale]) => {
  const player = ExcelLearnPlayer.mount(document.getElementById("player"), {
    lesson, settings: { functionLocale: locale, speed: 32, narrationOn: false },
  });
  await player.play();
}"""
HIDE = ".xl-cursor, .xl-start, .xl-keys { display: none !important; }"
# Рамка снимка: окно Excel и открытые окна-диалоги (они рисуются поверх сцены, а не внутри окна)
BOUNDS = """() => {
  const els = [document.querySelector(".xl-window"), ...document.querySelectorAll(".xl-dialogs *")];
  const rects = els.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  const x = Math.min(...rects.map((r) => r.left)), y = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right)), bottom = Math.max(...rects.map((r) => r.bottom));
  return { x: x - 6, y: y - 6, width: right - x + 12, height: bottom - y + 12 };
}"""


class Command(BaseCommand):
    help = (
        "Снимает кадры теории (content/theory) плеером: static/theory/<глава>/<кадр>-<ru|en>.png. "
        "Нужен собранный плеер (pnpm --dir player build) и браузер Edge (E2E_BROWSER_CHANNEL — как в e2e)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true", help="Переснять все кадры, а не только изменённые")

    def handle(self, *args, all: bool = False, **options):
        from playwright.sync_api import sync_playwright  # только для разработки

        force_utf8_stdout()
        static_dir = Path(settings.STATICFILES_DIRS[0])
        player_js, player_css = static_dir / "player/player.js", static_dir / "player/player.css"
        if not player_js.exists():
            raise CommandError("Нет static/player/player.js — сначала pnpm --dir player build")

        manifest_path = static_dir / FRAMES_DIR / MANIFEST
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
        jobs = []
        for _, theory in load_theory(Path(settings.CONTENT_DIR)):
            for figure in theory.figures:
                key, digest = f"{theory.chapter}/{figure.id}", figure_hash(figure)
                paths = {loc: static_dir / frame_path(theory.chapter, figure.id, loc) for loc in LOCALES}
                if all or manifest.get(key) != digest or not all_exist(paths.values()):
                    jobs.append((key, digest, figure_lesson(theory.chapter, figure), paths))

        channel = os.environ.get("E2E_BROWSER_CHANNEL", "msedge")
        with sync_playwright() as p:
            browser = p.chromium.launch(channel=None if channel == "chromium" else channel, headless=True)
            page = browser.new_page(viewport={"width": 1400, "height": 1600}, device_scale_factor=2)
            errors: list[str] = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
            for key, digest, lesson, paths in jobs:
                for locale, path in paths.items():
                    page.set_content(PAGE)
                    page.add_style_tag(path=player_css)
                    page.add_style_tag(content=HIDE)
                    page.add_script_tag(path=player_js)
                    page.evaluate(MOUNT, [lesson.model_dump(mode="json", exclude_none=True), locale])
                    if errors:
                        raise CommandError(f"{key} ({locale}): {'; '.join(errors)}")
                    path.parent.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=path, clip=page.evaluate(BOUNDS), animations="disabled")
                manifest[key] = digest
                self.stdout.write(f"✓ {key}")
            browser.close()

        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(dict(sorted(manifest.items())), indent=2) + "\n", encoding="utf-8", newline="\n"
        )
        self.stdout.write(self.style.SUCCESS(f"Снято кадров: {len(jobs)}"))


def all_exist(paths) -> bool:
    return all(p.exists() for p in paths)
