import { describe, expect, it } from "vitest";

import { KEYS_SHOW_MS } from "../anim/keys";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock } from "../test/fake-clock";
import { Stage } from "./stage";

function stage() {
  const { clock, advance } = fakeClock();
  const sheet = new SheetModel({ cells: { C4: 49, D4: 10 }, rows: 12 });
  return { stage: new Stage(sheet, "ru", clock), advance };
}

const visible = (el: Element | null) => (el as HTMLElement | null)?.style.display === "block";

describe("Overlays", () => {
  it("показывает и прячет выделение, ссылки, заполнение и бегущую рамку", () => {
    const { stage: s } = stage();
    const wrap = s.window.gridWrap;

    s.overlays.showSelection("E4");
    s.overlays.showRefs(["C4", "D4"]);
    s.overlays.showFill("E4:E11");
    s.overlays.showAnts("E4");

    expect(visible(wrap.querySelector(".xl-sel"))).toBe(true);
    expect(wrap.querySelector(".xl-sel")?.classList.contains("xl-range")).toBe(false);
    expect([...wrap.querySelectorAll(".xl-refbox")].map(visible)).toEqual([true, true, false, false]);
    expect(visible(wrap.querySelector(".xl-fillbox"))).toBe(true);
    expect(visible(wrap.querySelector(".xl-ants"))).toBe(true);
    expect(s.overlays.current).toEqual({ selection: "E4", areas: [], refs: ["C4", "D4"], fill: "E4:E11", ants: "E4" });

    s.overlays.showRefs([]);
    s.overlays.showAnts(null);
    expect([...wrap.querySelectorAll(".xl-refbox")].some(visible)).toBe(false);
    expect(visible(wrap.querySelector(".xl-ants"))).toBe(false);
  });

  it("выделение диапазона закрашивается", () => {
    const { stage: s } = stage();

    s.overlays.showSelection("E5:E11");

    expect(s.window.gridWrap.querySelector(".xl-sel")?.classList.contains("xl-range")).toBe(true);
  });
});

describe("CursorView", () => {
  it("jump ставит остриё стрелки и центр перекрестья в точку", () => {
    const { stage: s } = stage();

    s.cursor.jump({ x: 100, y: 50 });
    expect(s.cursor.el.style.transform).toBe("translate(98px, 48px)");

    s.cursor.setShape("plus");
    expect(s.cursor.el.classList.contains("xl-is-plus")).toBe(true);
    expect(s.cursor.el.style.transform).toBe("translate(91px, 41px)");
  });

  it("moveTo плавно приходит в цель и сообщает прогресс", async () => {
    const { stage: s, advance } = stage();
    s.cursor.jump({ x: 0, y: 0 });
    const progress: number[] = [];

    const done = s.cursor.moveTo({ x: 200, y: 100 }, 300, (t) => progress.push(t));
    await advance(320);
    await done;

    expect(s.cursor.at).toEqual({ x: 200, y: 100 });
    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBeGreaterThan(5);
  });

  it("click нажимает, оставляет круг и отпускает", async () => {
    const { stage: s, advance } = stage();

    const done = s.cursor.click();
    expect(s.cursor.el.classList.contains("xl-down")).toBe(true);
    expect(s.el.querySelector(".xl-ripple")).not.toBeNull();
    await advance(300);
    await done;

    expect(s.cursor.el.classList.contains("xl-down")).toBe(false);
  });
});

describe("KeysView", () => {
  it("показывает сочетание клавиш на заданное время", async () => {
    const { stage: s, advance } = stage();

    const done = s.keys.show(["Ctrl", "C"], 500);
    expect(s.keys.el.textContent).toBe("Ctrl+C");
    expect(s.keys.el.classList.contains("xl-show")).toBe(true);
    await advance(520);
    await done;

    expect(s.keys.el.classList.contains("xl-show")).toBe(false);
  });

  it("по умолчанию держит подсказку KEYS_SHOW_MS — дольше секунды, чтобы успеть прочитать", async () => {
    const { stage: s, advance } = stage();

    const done = s.keys.show(["Enter"]);
    await advance(KEYS_SHOW_MS - 200);
    expect(s.keys.el.classList.contains("xl-show")).toBe(true);
    await advance(220);
    await done;

    expect(KEYS_SHOW_MS).toBeGreaterThan(1000);
    expect(s.keys.el.classList.contains("xl-show")).toBe(false);
  });

  it("прячет клавиши, если анимацию прервали", async () => {
    const { stage: s, advance } = stage();

    const done = s.keys.show(["Enter"]);
    s.clock.cancel();
    await advance(32);

    await expect(done).rejects.toThrow("прервана");
    expect(s.keys.el.classList.contains("xl-show")).toBe(false);
  });
});

describe("Stage", () => {
  it("собирает окно, курсор и клавиши в одну сцену", () => {
    const { stage: s } = stage();

    expect(s.el.className).toBe("xl-stage");
    expect(s.el.querySelector(".xl-window")).not.toBeNull();
    expect(s.el.querySelector(".xl-cursor")).not.toBeNull();
    expect(s.el.querySelector(".xl-keys")).not.toBeNull();
    expect(s.cellPoint("E4", "handle")).toEqual({ x: -1, y: -1 }); // в jsdom размеры нулевые
  });
});
