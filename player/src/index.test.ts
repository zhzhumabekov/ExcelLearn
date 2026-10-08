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

  it("removes the player on destroy", () => {
    const el = document.createElement("div");

    mount(el, { lesson }).destroy();

    expect(el.querySelector(".xl-player")).toBeNull();
  });
});
