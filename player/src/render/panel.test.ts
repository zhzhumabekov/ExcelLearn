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
  const handlers = {
    onPlayPause: vi.fn(),
    onRestart: vi.fn(),
    onSpeed: vi.fn(),
    onSeek: vi.fn(),
    onMode: vi.fn(),
    onNext: vi.fn(),
  };

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

  it("шкала и план: пройденные, текущий, клик — перемотка", () => {
    const panel = new PanelView(lesson, "ru", handlers, 1);

    panel.showStep(1, "playing");
    const segments = [...panel.el.querySelectorAll<HTMLButtonElement>(".xl-seg")];
    expect(segments.map((s) => s.className)).toEqual(["xl-seg xl-done", "xl-seg xl-active"]);
    expect(segments[0]?.title).toBe("1. Функция СУММ");
    segments[1]?.click();
    expect(handlers.onSeek).toHaveBeenCalledWith(1);

    const items = [...panel.el.querySelectorAll(".xl-steps li")];
    expect(items.map((li) => li.className)).toEqual(["xl-done", "xl-active"]);
    items[0]?.querySelector("button")?.click();
    expect(handlers.onSeek).toHaveBeenCalledWith(0);
  });

  it("текущий отрезок шкалы заливается по прогрессу шага и «дышит», пока урок играет", () => {
    const panel = new PanelView(lesson, "ru", handlers, 1);
    const progress = panel.el.querySelector(".xl-progress");
    const segment = panel.el.querySelectorAll<HTMLElement>(".xl-seg")[1];

    panel.showStepProgress(1, 0.5);
    expect(segment?.style.getPropertyValue("--p")).toBe("0.500");

    panel.showStatus("playing");
    expect(progress?.classList.contains("xl-playing")).toBe(true);
    panel.showStatus("paused");
    expect(progress?.classList.contains("xl-playing")).toBe(false);
  });

  it("план урока свёрнут, кнопка «План» его раскрывает", () => {
    const panel = new PanelView(lesson, "ru", handlers, 1);
    const plan = panel.el.querySelector<HTMLElement>(".xl-plan");
    expect(plan?.hidden).toBe(true);

    [...panel.el.querySelectorAll("button")].find((b) => b.textContent === "☰ План")?.click();

    expect(plan?.hidden).toBe(false);
  });

  it("кнопка воспроизведения и скорость", () => {
    const panel = new PanelView(lesson, "ru", handlers, 1.5);

    const play = panel.el.querySelector<HTMLButtonElement>(".xl-primary");
    panel.showStatus("playing");
    expect([play?.textContent, play?.title]).toEqual(["⏸", "Пауза"]);
    panel.showStatus("done");
    expect([play?.textContent, play?.title]).toEqual(["↻", "Ещё раз"]);
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

describe("пауза между шагами", () => {
  it("показывает кольцо и следующий шаг, null — скрывает", () => {
    const panel = new PanelView(lesson, "ru", { onPlayPause() {}, onRestart() {}, onSpeed() {}, onSeek() {}, onMode() {}, onNext() {} }, 1);
    const next = panel.el.querySelector<HTMLElement>(".xl-next");
    expect(next?.hidden).toBe(true);

    panel.showWaitNext(0.4, 1);
    expect(next?.hidden).toBe(false);
    expect(next?.textContent).toBe("Дальше: Второй");
    expect(next?.querySelector<HTMLElement>(".xl-ring")?.style.getPropertyValue("--p")).toBe("0.400");

    panel.showWaitNext(null, 1);
    expect(next?.hidden).toBe(true);
  });
});

describe("PanelView: режим просмотра", () => {
  const handlers = () => ({
    onPlayPause: vi.fn(),
    onRestart: vi.fn(),
    onSpeed: vi.fn(),
    onSeek: vi.fn(),
    onMode: vi.fn(),
    onNext: vi.fn(),
  });
  const modeButton = (panel: PanelView, mode: string) =>
    panel.el.querySelector<HTMLButtonElement>(`.xl-mode [data-mode="${mode}"]`);

  it("две кнопки режима: выбранная подсвечена, клик сообщает режим", () => {
    const h = handlers();
    const panel = new PanelView(lesson, "ru", h, 1, "step");

    expect(modeButton(panel, "step")?.textContent).toBe("Пошагово");
    expect(modeButton(panel, "step")?.classList.contains("xl-on")).toBe(true);
    expect(modeButton(panel, "auto")?.textContent).toBe("Авто");
    expect(modeButton(panel, "auto")?.getAttribute("aria-pressed")).toBe("false");

    modeButton(panel, "auto")?.click();
    expect(h.onMode).toHaveBeenCalledWith("auto");
    panel.setMode("auto");
    expect(modeButton(panel, "auto")?.classList.contains("xl-on")).toBe(true);
    expect(modeButton(panel, "step")?.classList.contains("xl-on")).toBe(false);
  });

  it("в ожидании — кнопка «Дальше» со следующим шагом; клик — onNext", () => {
    const h = handlers();
    const panel = new PanelView(lesson, "ru", h, 1, "step");
    const next = () => panel.el.querySelector<HTMLButtonElement>(".xl-next-btn");

    panel.showStep(0, "playing");
    expect(next()?.hidden).toBe(true);

    panel.showStep(0, "waiting");
    panel.showStatus("waiting");
    expect(next()?.hidden).toBe(false);
    expect(next()?.textContent).toBe("Дальше: 2. Второй →");
    expect(panel.el.querySelector<HTMLButtonElement>(".xl-primary")?.title).toBe("Следующий шаг");

    next()?.click();
    expect(h.onNext).toHaveBeenCalledOnce();
  });
});
