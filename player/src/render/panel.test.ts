import { describe, expect, it, vi } from "vitest";

import type { Lesson } from "../generated/lesson";
import { mount } from "../index";
import { PanelView, stepHtml } from "./panel";
import { sanitizeHtml } from "./sanitize";

const lesson: Lesson = {
  id: "demo",
  chapter: "ch00",
  order: 1,
  title: "Демо",
  source: "Рис. 1.1",
  sheet: { cells: { A1: 1 } },
  steps: [
    { title: "Функция {fn:SUM}", text: "Введите <code>{f:=SUM(A1:A3)}</code>, нажмите <kbd>Enter</kbd>", actions: [{ click: "A1" }] },
    { title: "Второй", text: "<b>Готово</b>", actions: [{ wait: 100 }] },
  ],
};

const html = (fragment: DocumentFragment) => {
  const div = document.createElement("div");
  div.append(fragment);
  return div.innerHTML;
};

describe("sanitizeHtml", () => {
  it("оставляет разметку пояснений без атрибутов", () => {
    expect(html(sanitizeHtml('<b class="x">жирный</b> <code onclick="alert(1)">A1</code> <kbd>Enter</kbd>'))).toBe(
      "<b>жирный</b> <code>A1</code> <kbd>Enter</kbd>",
    );
  });

  it("убирает скрипты, ссылки и обработчики, оставляя текст", () => {
    const result = html(sanitizeHtml('<script>alert(1)</script><a href="javascript:x">ссылка</a><img src=x onerror=alert(1)>'));

    expect(result).toBe("ссылка");
  });
});

describe("PanelView", () => {
  const handlers = { onPlayPause: vi.fn(), onRestart: vi.fn(), onSpeed: vi.fn(), onSeek: vi.fn() };

  it("показывает шаг на языке ученика", () => {
    const panel = new PanelView(lesson, "ru", handlers, 1);

    panel.showStep(0, "ready");

    expect(panel.el.querySelector(".xl-step-title")?.textContent).toBe("Функция СУММ");
    expect(panel.el.querySelector(".xl-step-text")?.innerHTML).toBe(
      "Введите <code>=СУММ(A1:A3)</code>, нажмите <kbd>Enter</kbd>",
    );
    expect(panel.el.querySelector(".xl-meta")?.textContent).toContain("Шаг 1 из 2");
    expect(html(stepHtml("Функция {fn:SUM}", "en"))).toBe("Функция SUM");
  });

  it("план шагов: пройденные, текущий, клик — перемотка", () => {
    const panel = new PanelView(lesson, "ru", handlers, 1);

    panel.showStep(1, "playing");
    const items = [...panel.el.querySelectorAll(".xl-steps li")];
    expect(items.map((li) => li.className)).toEqual(["xl-done", "xl-active"]);

    items[0]?.querySelector("button")?.click();
    expect(handlers.onSeek).toHaveBeenCalledWith(0);
  });

  it("кнопка воспроизведения и скорость", () => {
    const panel = new PanelView(lesson, "ru", handlers, 1.5);

    panel.showStatus("playing");
    expect(panel.el.querySelector(".xl-primary")?.textContent).toBe("⏸ Пауза");
    panel.showStatus("done");
    expect(panel.el.querySelector(".xl-primary")?.textContent).toBe("↻ Ещё раз");
    expect(panel.el.querySelector(".xl-speed .xl-on")?.textContent).toBe("1,5×");
  });
});

describe("mount", () => {
  it("рисует сцену, панель и стартовую кнопку; startStep — продолжение", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const onStepChange = vi.fn();

    const player = mount(el, { lesson, startStep: 1, onStepChange });

    expect(el.querySelector(".xl-stage .xl-window")).not.toBeNull();
    expect(el.querySelector(".xl-panel")).not.toBeNull();
    expect(el.querySelector(".xl-start button")?.textContent).toBe("▶ Продолжить с шага 2");
    expect(player.step).toBe(1);
    expect(onStepChange).toHaveBeenCalledWith(1);
    player.destroy();
  });

  it("стартовый экран исчезает после запуска и не возвращается после перемотки и конца", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const player = mount(el, { lesson });
    const start = el.querySelector<HTMLElement>(".xl-start");
    expect(start?.hidden).toBe(false);

    void player.play();
    expect(start?.hidden).toBe(true);
    player.pause();
    player.seek(0);
    expect(start?.hidden).toBe(true);
    player.destroy();
    expect(el.querySelector(".xl-player")).toBeNull();
  });
});
