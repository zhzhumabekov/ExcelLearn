import { describe, expect, it } from "vitest";

import { createBook } from "../lesson/book";
import { createState, type LessonState } from "../lesson/state";
import { Stage } from "../render/stage";
import type { Lesson, Sheet } from "../generated/lesson";
import { fakeClock, finish } from "../test/fake-clock";
import { type ActionSpec, createAction } from "./index";

// Глава 7: набор даты, «Формат ячеек» (правая кнопка и Ctrl+1) → «Дата» / «Общий», Ctrl+; и СЕГОДНЯ().

const TODAY = "2026-10-12"; // серийный номер 46307

const lesson = (sheet: Sheet): Pick<Lesson, "sheet"> & { today: string } => ({ sheet, today: TODAY });

function applyAll(sheet: Sheet, specs: ActionSpec[]): LessonState {
  const state = createState(createBook(lesson(sheet)));
  for (const spec of specs) createAction(spec).apply(state);
  return state;
}

async function animateAll(sheet: Sheet, specs: ActionSpec[]) {
  const { clock, advance } = fakeClock();
  const model = createBook(lesson(sheet));
  const stage = new Stage(model, "ru", clock);
  document.body.append(stage.el);
  const state = createState(model);
  try {
    for (const spec of specs) await finish(createAction(spec).animate({ state, stage, clock }), advance);
  } finally {
    stage.el.remove();
  }
  return { state, stage };
}

const comparable = (state: LessonState) => ({
  cells: [...state.sheet.snapshot()],
  active: state.active,
  selection: state.selection,
  dialogs: state.dialogs,
  contextMenu: state.contextMenu,
});

async function expectSame(sheet: Sheet, specs: ActionSpec[]): Promise<LessonState> {
  const applied = applyAll(sheet, specs);
  const { state } = await animateAll(sheet, specs);
  expect(comparable(state)).toEqual(comparable(applied));
  return applied;
}

// Выгрузка из учётной программы: даты пришли числами
const EXPORT: Sheet = {
  cells: {
    A1: { v: "Дата", style: "head" },
    A2: 46023,
    A3: 46054,
    A4: "Итого",
  },
};

describe("Формат ячеек → Дата", () => {
  const toDate: ActionSpec[] = [
    { select: "A2:A3" },
    { contextMenu: "formatCells" },
    { dialogPick: "Дата" },
    { dialogPick: "*14 марта 2012 г." },
    { dialogButton: "OK" },
  ];

  it("правая кнопка → «Формат ячеек…» → «Дата» → тип → OK: формат у всего выделения", async () => {
    const state = await expectSame(EXPORT, toDate);
    expect(state.sheet.get("A2").fmt).toBe("dateLong");
    expect(state.sheet.get("A3").fmt).toBe("dateLong");
    expect(state.sheet.value("A2")).toBe(46023); // значение то же — меняется только вид
    expect(state.sheet.get("A1").fmt).toBe("general");
    expect(state.dialogs).toEqual([]);
    expect(state.contextMenu).toBeNull();
  });

  it("в окне — образец выбранного формата; в ячейке — длинная дата", async () => {
    const { stage } = await animateAll(EXPORT, toDate.slice(0, 4));
    expect(stage.el.querySelector(".xl-dsample")?.textContent).toBe("1 января 2026 г.");
    const done = await animateAll(EXPORT, toDate);
    expect(done.stage.window.grid.cell("A2").textContent).toBe("1 января 2026 г.");
  });

  it("категория «Дата» сразу выбирает первый тип; «Общий» возвращает число; Отмена ничего не меняет", async () => {
    const state = await expectSame(EXPORT, [
      { select: "A2:A3" },
      { keys: ["Ctrl", "1"] },
      { dialogPick: "Дата" },
      { dialogButton: "OK" },
      { click: "A2" },
      { keys: ["Ctrl", "1"] },
      { dialogPick: "Общий" },
      { dialogButton: "OK" },
      { click: "A3" },
      { keys: ["Ctrl", "1"] },
      { dialogPick: "Общий" },
      { dialogButton: "Отмена" },
    ]);
    expect(state.sheet.get("A2").fmt).toBe("general");
    expect(state.sheet.get("A3").fmt).toBe("date");
  });

  it("тип даты — только в категории «Дата»", () => {
    expect(() =>
      applyAll(EXPORT, [{ click: "A2" }, { keys: ["Ctrl", "1"] }, { dialogPick: "*14.03.2012" }]),
    ).toThrow("нет «*14.03.2012»");
  });
});

describe("набор даты, СЕГОДНЯ() и Ctrl+;", () => {
  const sheet: Sheet = { cells: { A1: "Отчёт сформирован", C1: "Создан" } };

  it("набранная дата — число с форматом даты; Ctrl+; — дата урока, которая уже не меняется", async () => {
    const state = await expectSame(sheet, [
      { click: "B2" },
      { type: "04.01.2003" },
      { keys: ["Enter"] },
      { click: "B1" },
      { type: "=TODAY()" },
      { keys: ["Enter"] },
      { click: "D1" },
      { keys: ["Ctrl", ";"] },
      { keys: ["Enter"] },
    ]);
    expect(state.sheet.get("B2")).toMatchObject({ value: 37625, fmt: "date" });
    expect(state.sheet.value("B1")).toBe(46307);
    expect(state.sheet.get("D1")).toMatchObject({ input: 46307, fmt: "date" });
  });

  it("Ctrl+; набирает дату в редакторе, как текст", () => {
    const state = applyAll(sheet, [{ click: "D1" }, { keys: ["Ctrl", ";"] }]);
    expect(state.editor).toEqual({ cell: "D1", parts: [{ text: "12.10.2026" }] });
  });

  it("РАЗНДАТ нет в списке автозавершения — как в Excel", async () => {
    const { stage } = await animateAll(sheet, [{ click: "B3" }, { type: "=РАЗН" }]);
    expect(stage.el.querySelector("[data-suggestion]")).toBeNull();
  });
});
