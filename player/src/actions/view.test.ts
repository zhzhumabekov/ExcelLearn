import { describe, expect, it } from "vitest";

import { createState, type LessonState } from "../lesson/state";
import { Stage } from "../render/stage";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock, finish } from "../test/fake-clock";
import { type ActionSpec, createAction } from "./index";

// Глава 12: длинный лист (40 строк данных, видно 12) — «Закрепить области» и прокрутка колёсиком.
const cells: Record<string, string | number> = { A1: "Индекс KASE", A8: "Месяц", B8: "Значение" };
for (let r = 9; r <= 40; r++) {
  cells[`A${r}`] = `М${r - 8}`;
  cells[`B${r}`] = 3000 + r;
}
const SHEET = { rows: 40, visibleRows: 12, cells };

function applyAll(specs: ActionSpec[]): LessonState {
  const state = createState(new SheetModel(SHEET));
  for (const spec of specs) createAction(spec).apply(state);
  return state;
}

async function animateAll(specs: ActionSpec[]) {
  const { clock, advance } = fakeClock();
  const sheet = new SheetModel(SHEET);
  const stage = new Stage(sheet, "ru", clock);
  const state = createState(sheet);
  for (const spec of specs) await finish(createAction(spec).animate({ state, stage, clock }), advance);
  return { state, stage };
}

/** Номера видимых строк листа (первая строка таблицы — заголовки столбцов A, B, C…). */
const visibleRows = (stage: Stage) =>
  [...stage.el.querySelectorAll<HTMLTableRowElement>(".xl-grid tr")]
    .slice(1)
    .map((tr, i) => (tr.hidden ? null : i + 1))
    .filter((r): r is number => r !== null);

describe("закрепление областей и прокрутка", () => {
  it("без закрепления прокрутка уводит заголовки за верх окна", async () => {
    const { stage } = await animateAll([{ scroll: 10 }]);

    const rows = visibleRows(stage);
    expect(rows[0]).toBe(11);
    expect(rows).toHaveLength(12);
  });

  it("закрепить по C9: строки 1–8 видны всегда, прокручивается только данные", async () => {
    const { state, stage } = await animateAll([{ click: "C9" }, { freezePanes: "panes" }, { scroll: 10 }]);

    expect(state.frozen["Лист1"]).toEqual({ row: 9, col: 3 });
    const rows = visibleRows(stage);
    expect(rows.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows[8]).toBe(19); // строки 9–18 ушли за верх
    expect(rows).toHaveLength(12);
    expect(stage.el.querySelector('td[data-addr="B8"]')?.classList.contains("xl-frz-b")).toBe(true);
    expect(stage.el.querySelector('td[data-addr="B20"]')?.classList.contains("xl-frz-r")).toBe(true);
  });

  it("прокрутка не уходит дальше конца листа и назад дальше начала", () => {
    const down = applyAll([{ click: "C9" }, { freezePanes: "panes" }, { scroll: 200 }]);
    expect(down.scrolled["Лист1"]).toBe(40 - 8 - 4); // 32 строки данных, видно 4
    const up = applyAll([{ scroll: 5 }, { scroll: -20 }]);
    expect(up.scrolled["Лист1"]).toBe(0);
  });

  it("верхняя строка, первый столбец и снять закрепление", () => {
    expect(applyAll([{ freezePanes: "topRow" }]).frozen["Лист1"]).toEqual({ row: 2, col: 1 });
    expect(applyAll([{ freezePanes: "firstColumn" }]).frozen["Лист1"]).toEqual({ row: 1, col: 2 });
    const off = applyAll([{ click: "C9" }, { freezePanes: "panes" }, { scroll: 3 }, { freezePanes: "unfreeze" }]);
    expect(off.frozen["Лист1"]).toBeNull();
    expect(off.scrolled["Лист1"]).toBe(0);
  });

  it("анимация ≡ перемотка", async () => {
    const specs: ActionSpec[] = [{ click: "C9" }, { freezePanes: "panes" }, { scroll: 7 }, { scroll: -2 }];
    const { state } = await animateAll(specs);
    const applied = applyAll(specs);

    expect(state.frozen).toEqual(applied.frozen);
    expect(state.scrolled).toEqual(applied.scrolled);
    expect(state.menu).toBeNull();
    expect(state.ribbonTab).toBe("view");
  });

  it("двойной щелчок по маркеру: формула — вниз до конца данных соседнего столбца", async () => {
    const specs: ActionSpec[] = [{ click: "C24" }, { type: "=AVERAGE(B9:B23)" }, { keys: ["Enter"] }, { fillDown: "C24" }];
    const applied = applyAll(specs);
    expect(applied.sheet.formula("C40")).toBe("=AVERAGE(B25:B39)");
    expect(applied.sheet.formula("C41")).toBeNull();

    const { state } = await animateAll(specs);
    expect(state.sheet.value("C40")).toBeCloseTo(applied.sheet.value("C40") as number, 9);
  });
});
