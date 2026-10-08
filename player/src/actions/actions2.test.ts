import { describe, expect, it } from "vitest";

import { autosumRange, createState, type LessonState } from "../lesson/state";
import { Stage } from "../render/stage";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock, finish } from "../test/fake-clock";
import { type ActionSpec, createAction } from "./index";

const SHEET = {
  rows: 16,
  cells: {
    B1: "Январь",
    B2: 120,
    B3: 80,
    B4: 60,
    B5: 140,
    C4: 49,
    D4: { v: 10, fmt: "usd" as const },
    C5: 36,
    D5: { v: 13, fmt: "usd" as const },
    C6: 43,
    D6: { v: 14, fmt: "usd" as const },
    E4: { fmt: "usd" as const },
  },
};

const E4_FORMULA: ActionSpec[] = [
  { click: "E4" },
  { type: "=" },
  { clickRef: "C4" },
  { type: "*" },
  { clickRef: "D4" },
  { keys: ["Enter"] },
];

function applyAll(specs: ActionSpec[], sheet = new SheetModel(SHEET)): LessonState {
  const state = createState(sheet);
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

const comparable = (state: LessonState) => ({
  cells: [...state.sheet.snapshot()],
  active: state.active,
  selection: state.selection,
  editor: state.editor,
  clipboard: state.clipboard,
  undo: state.undo.length,
});

describe("копирование и вставка", () => {
  it("Ctrl+C запоминает выделение, Enter вставляет в диапазон со сдвигом ссылок и очищает буфер", () => {
    const state = applyAll([...E4_FORMULA, { click: "E4" }, { keys: ["Ctrl", "C"] }, { dragSelect: "E5:E6" }, { keys: ["Enter"] }]);

    expect(state.sheet.formula("E5")).toBe("=C5*D5");
    expect(state.sheet.value("E6")).toBe(602);
    expect(state.sheet.get("E6").fmt).toBe("usd"); // формат копируется вместе с формулой
    expect(state.clipboard).toBeNull();
    expect(state.selection).toBe("E5:E6");
  });

  it("Ctrl+V оставляет буфер, а одна целевая ячейка получает блок размера источника", () => {
    const state = applyAll([{ select: "C4:D5" }, { keys: ["Ctrl", "C"] }, { click: "G10" }, { keys: ["Ctrl", "V"] }]);

    expect(state.sheet.value("G10")).toBe(49);
    expect(state.sheet.value("H11")).toBe(13);
    expect(state.selection).toBe("G10:H11");
    expect(state.clipboard).toBe("C4:D5");
  });

  it("начало ввода убирает «бегущую» рамку", () => {
    const state = applyAll([{ click: "C4" }, { keys: ["Ctrl", "C"] }, { click: "A1" }, { type: "x" }]);

    expect(state.clipboard).toBeNull();
  });

  it("Escape отменяет ввод, а без ввода — снимает рамку копирования", () => {
    expect(applyAll([{ click: "A1" }, { type: "=1" }, { keys: ["Escape"] }]).editor).toBeNull();
    expect(applyAll([{ click: "A1" }, { keys: ["Ctrl", "C"] }, { keys: ["Escape"] }]).clipboard).toBeNull();
  });
});

describe("отмена", () => {
  it("Ctrl+Z отменяет вставку, затем ввод формулы", () => {
    const pasted: ActionSpec[] = [...E4_FORMULA, { click: "E4" }, { keys: ["Ctrl", "C"] }, { dragSelect: "E5:E6" }, { keys: ["Enter"] }];

    const once = applyAll([...pasted, { keys: ["Ctrl", "Z"] }]);
    expect(once.sheet.value("E5")).toBeNull();
    expect(once.sheet.value("E4")).toBe(490);

    const twice = applyAll([...pasted, { keys: ["Ctrl", "Z"] }, { keys: ["Ctrl", "Z"] }]);
    expect(twice.sheet.value("E4")).toBeNull();
  });

  it("Ctrl+Z без истории ничего не ломает", () => {
    expect(applyAll([{ keys: ["Ctrl", "Z"] }]).sheet.value("C4")).toBe(49);
  });
});

describe("маркер заполнения", () => {
  it("вниз: формула копируется со сдвигом, выделение — весь диапазон", () => {
    const state = applyAll([...E4_FORMULA, { click: "E4" }, { fill: "E4:E6" }]);

    expect(state.sheet.formula("E6")).toBe("=C6*D6");
    expect(state.sheet.value("E5")).toBe(468);
    expect(state.selection).toBe("E4:E6");
  });

  it("вправо: =SUM(B2:B5) → =SUM(C2:C5)", () => {
    const state = applyAll([{ click: "B6" }, { type: "=SUM(B2:B5)" }, { keys: ["Enter"] }, { fill: "B6:D6" }]);

    expect(state.sheet.formula("D6")).toBe("=SUM(D2:D5)");
  });

  it("FORMULATEXT протягивается и показывает сдвинутые формулы", () => {
    const state = applyAll([
      ...E4_FORMULA,
      { click: "E4" },
      { fill: "E4:E6" },
      { click: "F4" },
      { type: "=FORMULATEXT(" },
      { clickRef: "E4" },
      { type: ")" },
      { keys: ["Enter"] },
      { fill: "F4:F6" },
    ]);

    expect(state.sheet.value("F6")).toBe("=C6*D6");
  });
});

describe("автосумма Alt+=", () => {
  it("подбирает сплошной блок чисел над ячейкой", () => {
    const state = applyAll([{ click: "B6" }, { keys: ["Alt", "="] }]);

    expect(state.editor?.parts).toEqual([{ text: "=SUM(" }, { text: "B2:B5", ref: 0 }, { text: ")" }]);
    expect(applyAll([{ click: "B6" }, { keys: ["Alt", "="] }, { keys: ["Enter"] }]).sheet.value("B6")).toBe(400);
  });

  it("если сверху чисел нет — берёт слева; если нигде — пустая СУММ", () => {
    const sheet = new SheetModel(SHEET);
    expect(autosumRange(sheet, "E5")).toBe("B5:D5");
    expect(autosumRange(sheet, "A1")).toBeNull();
    expect(applyAll([{ click: "A1" }, { keys: ["Alt", "="] }]).editor?.parts).toEqual([{ text: "=SUM()" }]);
  });
});

describe("animate ≡ apply", () => {
  it.each([
    ["копирование + вставка Enter", [...E4_FORMULA, { click: "E4" }, { keys: ["Ctrl", "C"] }, { dragSelect: "E5:E6" }, { keys: ["Enter"] }]],
    ["отмена + маркер", [...E4_FORMULA, { keys: ["Ctrl", "Z"] }, { click: "E4" }, { fill: "E4:E6" }]],
    ["автосумма + вправо", [{ click: "B6" }, { keys: ["Alt", "="] }, { keys: ["Enter"] }, { click: "B6" }, { fill: "B6:D6" }]],
  ] as [string, ActionSpec[]][])("%s", async (_name, specs) => {
    const { state } = await animateAll(specs);

    expect(comparable(state)).toEqual(comparable(applyAll(specs)));
  });

  it("рамки: бегущая вокруг скопированного, пунктир заполнения убран после протягивания", async () => {
    const { stage } = await animateAll([...E4_FORMULA, { click: "E4" }, { keys: ["Ctrl", "C"] }]);
    expect(stage.overlays.current.ants).toBe("E4");

    const filled = await animateAll([...E4_FORMULA, { click: "E4" }, { fill: "E4:E6" }]);
    expect(filled.stage.overlays.current.fill).toBeNull();
    expect(filled.stage.overlays.current.selection).toBe("E4:E6");
  });
});

// Сквозная проверка настоящих уроков — в lesson/verify.test.ts (та же логика, что у pnpm lessons:verify)
