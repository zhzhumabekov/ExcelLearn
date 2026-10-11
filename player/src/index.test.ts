import { describe, expect, it } from "vitest";

import { type Lesson, mount } from "./index";

const lesson: Lesson = {
  id: "demo",
  chapter: "ch00",
  order: 1,
  title: "Демо",
  sheet: {},
  steps: [{ title: "Шаг", text: "Текст", actions: [{ click: "A1" }] }],
};

describe("mount", () => {
  it("renders the player into the element with default settings", () => {
    const el = document.createElement("div");

    mount(el, { lesson });

    const root = el.querySelector<HTMLElement>(".xl-player");
    expect(root).not.toBeNull();
    expect(root?.dataset.locale).toBe("ru");
  });

  it("applies settings overrides", () => {
    const el = document.createElement("div");

    mount(el, { lesson, settings: { functionLocale: "en" } });

    expect(el.querySelector<HTMLElement>(".xl-player")?.dataset.locale).toBe("en");
  });

  it("по умолчанию — пошаговый просмотр; режим можно задать и сменить", () => {
    const el = document.createElement("div");

    const byDefault = mount(el, { lesson });
    expect(byDefault.mode).toBe("step");
    expect(el.querySelector('.xl-mode [data-mode="step"]')?.classList.contains("xl-on")).toBe(true);
    byDefault.destroy();

    const auto = mount(el, { lesson, settings: { playMode: "auto" } });
    expect(auto.mode).toBe("auto");
    auto.setMode("step");
    expect(auto.mode).toBe("step");
    expect(el.querySelector('.xl-mode [data-mode="step"]')?.classList.contains("xl-on")).toBe(true);
  });

  it("removes the player on destroy", () => {
    const el = document.createElement("div");

    mount(el, { lesson }).destroy();

    expect(el.querySelector(".xl-player")).toBeNull();
  });
});
