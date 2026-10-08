import { describe, expect, it } from "vitest";

import { createState, editorText, type LessonState } from "../lesson/state";
import { Stage } from "../render/stage";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock, finish } from "../test/fake-clock";
import { type ActionSpec, createAction, UnsupportedAction } from "./index";

const SHEET = {
  rows: 16,
  cells: { B4: "Luka", C4: 49, D4: { v: 10, fmt: "usd" as const }, C5: 36, D5: { v: 13, fmt: "usd" as const } },
};

function applyAll(specs: ActionSpec[]): LessonState {
  const state = createState(new SheetModel(SHEET));
  for (const spec of specs) createAction(spec).apply(state);
  return state;
}

async function animateAll(specs: ActionSpec[]): Promise<{ state: LessonState; stage: Stage }> {
  const { clock, advance } = fakeClock();
  const sheet = new SheetModel(SHEET);
  const stage = new Stage(sheet, "ru", clock);
  const state = createState(sheet);
  for (const spec of specs) await finish(createAction(spec).animate({ state, stage, clock }), advance);
  return { state, stage };
}

/** Сравнимое представление состояния: лист + выделение + редактор. */
function snapshot(state: LessonState) {
  return {
    cells: [...state.sheet.snapshot()],
    active: state.active,
    selection: state.selection,
    editor: state.editor && { cell: state.editor.cell, parts: state.editor.parts },
    shownRefs: state.shownRefs,
  };
}

const FORMULA_STEP: ActionSpec[] = [
  { click: "E4" },
  { type: "=" },
  { clickRef: "C4" },
  { type: "*" },
  { clickRef: "D4" },
  { keys: ["Enter"] },
];

describe("apply", () => {
  it("click выделяет ячейку", () => {
    const state = applyAll([{ click: "E4" }]);

    expect([state.active, state.selection]).toEqual(["E4", "E4"]);
  });

  it("select выделяет диапазон, активная — левая верхняя", () => {
    const state = applyAll([{ select: "E11:E5" }]);

    expect([state.active, state.selection]).toEqual(["E5", "E5:E11"]);
  });

  it("type начинает ввод в активной ячейке и дописывает текст", () => {
    const state = applyAll([{ click: "E4" }, { type: "=SUM(" }, { type: "C4" }]);

    expect(state.editor).toEqual({ cell: "E4", parts: [{ text: "=SUM(C4" }] });
  });

  it("clickRef и dragRef вставляют цветные ссылки по порядку", () => {
    const state = applyAll([{ click: "E4" }, { type: "=" }, { clickRef: "C4" }, { type: "+SUM(" }, { dragRef: "D5:D4" }]);

    expect(state.editor?.parts).toEqual([
      { text: "=" },
      { text: "C4", ref: 0 },
      { text: "+SUM(" },
      { text: "D4:D5", ref: 1 },
    ]);
  });

  it("шаг «=C4*D4» + Enter: формула записана, курсор ниже", () => {
    const state = applyAll(FORMULA_STEP);

    expect(state.sheet.formula("E4")).toBe("=C4*D4");
    expect(state.sheet.value("E4")).toBe(490);
    expect(state.editor).toBeNull();
    expect(state.active).toBe("E5");
  });

  it("Enter без ввода — переход на строку ниже", () => {
    expect(applyAll([{ click: "C4" }, { keys: ["Enter"] }]).active).toBe("C5");
  });

  it("click во время ввода завершает его", () => {
    const state = applyAll([{ click: "F1" }, { type: "42" }, { click: "A1" }]);

    expect(state.sheet.value("F1")).toBe(42);
    expect(state.editor).toBeNull();
  });

  it("showRefs подсвечивает ссылки формулы ячейки", () => {
    const state = applyAll([...FORMULA_STEP, { showRefs: "E4" }]);

    expect(state.shownRefs).toEqual(["C4", "D4"]);
    expect(state.active).toBe("E4");
    expect(applyAll([...FORMULA_STEP, { showRefs: "E4" }, { click: "A1" }]).shownRefs).toEqual([]);
  });

  it("clickRef без ввода формулы — понятная ошибка", () => {
    expect(() => applyAll([{ click: "E4" }, { clickRef: "C4" }])).toThrow('сначала type: "="');
  });

  it("неподдерживаемые пока действия — UnsupportedAction", () => {
    expect(() => createAction({ fill: "E4:E11" })).toThrow(UnsupportedAction);
    expect(() => createAction({ keys: ["Ctrl", "C"] })).toThrow(UnsupportedAction);
  });
});

describe("animate ≡ apply (детерминизм перемотки)", () => {
  it.each([
    ["шаг «=C4*D4»", FORMULA_STEP],
    ["SUM с протягиванием", [{ click: "C12" }, { type: "=SUM(" }, { dragRef: "C4:C5" }, { type: ")" }, { keys: ["Enter"] }]],
    ["выделение, ожидание, подсветка", [...FORMULA_STEP, { select: "C4:D5" }, { wait: 300 }, { showRefs: "E4" }]],
  ] as [string, ActionSpec[]][])("%s", async (_name, specs) => {
    const { state } = await animateAll(specs);

    expect(snapshot(state)).toEqual(snapshot(applyAll(specs)));
  });
});

describe("отрисовка во время ввода", () => {
  it("редактор показывает формулу по-русски с цветными ссылками, строка формул — то же", async () => {
    const { stage, state } = await animateAll([{ click: "C12" }, { type: "=SUM(" }, { dragRef: "C4:C5" }]);

    expect(state.editor && editorText(state.editor)).toBe("=SUM(C4:C5");
    const editor = stage.editor.el;
    expect(editor.style.display).toBe("flex");
    expect(editor.textContent).toBe("=СУММ(C4:C5");
    expect(editor.querySelector(".xl-reftext.xl-ref0")?.textContent).toBe("C4:C5");
    expect(stage.window.formulaText.textContent).toBe("=СУММ(C4:C5");
    expect(stage.window.nameBox.textContent).toBe("C12");
    expect(stage.editor.hint.textContent).toBe("СУММ(число1; [число2]; …)");
  });

  it("после Enter редактор скрыт, в ячейке результат, строка формул — формула активной ячейки", async () => {
    const { stage } = await animateAll([...FORMULA_STEP, { click: "E4" }]);

    expect(stage.editor.el.style.display).toBe("none");
    expect(stage.window.grid.cell("E4").textContent).toBe("490");
    expect(stage.window.formulaText.textContent).toBe("=C4*D4");
  });
});
