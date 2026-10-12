import { describe, expect, it } from "vitest";

import { CIRCULAR_WARNING, createState, type LessonState } from "../lesson/state";
import { Stage } from "../render/stage";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock, finish } from "../test/fake-clock";
import { type ActionSpec, createAction } from "./index";

// Глава 11: благотворительность 10% от прибыли после налогов. Ячейки D3:D5 — доход, ставка, издержки.
const SHEET = { rows: 10, cells: { D3: 1500, D4: 0.4, D5: 1000 } };
const DONATION = 30 / 1.06;

const enter = (cell: string, formula: string): ActionSpec[] => [{ click: cell }, { type: formula }, { keys: ["Enter"] }];
const LOOP: ActionSpec[] = [...enter("D6", "=0.1*D8"), ...enter("D7", "=D3-D5-D6"), ...enter("D8", "=(1-D4)*D7")];
const ITERATE: ActionSpec[] = [
  { fileMenu: "options" },
  { dialogPick: "Формулы" },
  { dialogCheck: "Включить итеративные вычисления" },
  { dialogButton: "OK" },
];

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

describe("циклическая ссылка в уроке", () => {
  it("формула, замкнувшая петлю, — окно предупреждения; OK закрывает его", () => {
    const state = applyAll(LOOP);
    expect(state.dialogs).toEqual([{ kind: "alert", text: CIRCULAR_WARNING }]);
    expect(state.sheet.value("D6")).toBe(0);

    createAction({ dialogButton: "OK" }).apply(state);
    expect(state.dialogs).toEqual([]);
  });

  it("Файл → Параметры → Формулы → итеративные вычисления: петля решена", () => {
    const state = applyAll([...LOOP, { dialogButton: "OK" }, ...ITERATE]);

    expect(state.dialogs).toEqual([]);
    expect(state.sheet.book.iteration.enabled).toBe(true);
    expect(state.sheet.value("D6")).toBeCloseTo(DONATION, 3);
  });

  it("погрешность из поля окна: «0,000001» — с запятой, как в русском Excel", () => {
    const state = applyAll([
      ...LOOP,
      { dialogButton: "OK" },
      { fileMenu: "options" },
      { dialogPick: "Формулы" },
      { dialogCheck: "Включить итеративные вычисления" },
      { dialogType: { field: "Относительная погрешность", text: "0,000001" } },
      { dialogButton: "OK" },
    ]);

    expect(state.sheet.book.iteration.maxChange).toBe(0.000001);
    expect(Math.abs((state.sheet.value("D6") as number) - DONATION)).toBeLessThan(1e-6);
  });

  it("флажок — только в разделе «Формулы»", () => {
    const state = applyAll([...LOOP, { dialogButton: "OK" }, { fileMenu: "options" }]);
    expect(() => createAction({ dialogCheck: "Включить итеративные вычисления" }).apply(state)).toThrow(/Формулы/);
  });

  it("анимация ≡ перемотка: строка состояния, меню «Файл», окно и итог", async () => {
    const specs = [...LOOP, { dialogButton: "OK" }, ...ITERATE];
    const { state, stage } = await animateAll(LOOP);
    expect(stage.el.querySelector(".xl-status")?.textContent).toBe("Циклические ссылки: D8");
    expect(stage.el.querySelector(".xl-dialog-alert")).not.toBeNull();

    const { state: done, stage: doneStage } = await animateAll(specs);
    expect(done.sheet.value("D6")).toBeCloseTo(applyAll(specs).sheet.value("D6") as number, 9);
    expect(done.backstage).toBe(false);
    expect((doneStage.el.querySelector(".xl-status") as HTMLElement).hidden).toBe(true);
    expect(state.sheet.book.circularRef).toBe("Лист1!D8");
  });
});
