import { describe, expect, it } from "vitest";

import { createState, cycleAbsolute, editorText, type LessonState } from "../lesson/state";
import { editorHtml } from "../render/editor";
import { Stage } from "../render/stage";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock, finish } from "../test/fake-clock";
import { type ActionSpec, createAction } from "./index";

// Пекарня с одинаковыми ценами (рис. 1.4): цены в строке 12, количества в 14:19
const SHEET = {
  rows: 30,
  cells: {
    E12: 0.4,
    F12: 1.2,
    G12: 0.12,
    E13: "Sugar",
    E14: 364,
    F14: 391,
    G14: 220,
    E15: 387,
    F15: 245,
    G15: 314,
  },
};

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

const comparable = (state: LessonState) => ({
  cells: [...state.sheet.snapshot()],
  active: state.active,
  selection: state.selection,
  editor: state.editor,
  clipboard: state.clipboard,
});

const E23_ABSOLUTE: ActionSpec[] = [
  { click: "E23" },
  { type: "=" },
  { clickRef: "E12" },
  { keys: ["F4"] },
  { keys: ["F4"] },
  { type: "*" },
  { clickRef: "E14" },
  { keys: ["Enter"] },
];

describe("F4 — тип ссылки", () => {
  it.each([
    ["E12", "$E$12"],
    ["$E$12", "E$12"],
    ["E$12", "$E12"],
    ["$E12", "E12"],
    ["C4:C11", "$C$4:$C$11"],
  ])("%s → %s", (ref, next) => {
    expect(cycleAbsolute(ref)).toBe(next);
  });

  it("меняет ссылку, вставленную щелчком, — формула пекарни E$12*E14", () => {
    const state = applyAll(E23_ABSOLUTE);

    expect(state.sheet.formula("E23")).toBe("=E$12*E14");
    expect(state.sheet.value("E23")).toBeCloseTo(145.6);
  });

  it("с абсолютной строкой копирование даёт верные суммы, с относительной — ошибку", () => {
    const copy: ActionSpec[] = [{ click: "E23" }, { keys: ["Ctrl", "C"] }, { dragSelect: "E23:G24" }, { keys: ["Enter"] }];

    const right = applyAll([...E23_ABSOLUTE, ...copy]);
    expect(right.sheet.formula("F24")).toBe("=F$12*F15");
    expect(right.sheet.value("F24")).toBeCloseTo(294);

    const wrong = applyAll([{ click: "E23" }, { type: "=E12*E14" }, { keys: ["Enter"] }, ...copy]);
    expect(wrong.sheet.formula("E24")).toBe("=E13*E15"); // строка 12 «уехала» на 13 — там текст
    expect(String(wrong.sheet.value("E24"))).toBe("#VALUE!");
  });

  it("меняет последнюю набранную ссылку", () => {
    const state = applyAll([{ click: "A1" }, { type: "=C3+C4" }, { keys: ["F4"] }]);

    expect(state.editor && editorText(state.editor)).toBe("=C3+$C$4");
  });

  it("без ввода формулы или без ссылки — понятная ошибка", () => {
    expect(() => applyAll([{ click: "A1" }, { keys: ["F4"] }])).toThrow("во время ввода формулы");
    expect(() => applyAll([{ click: "A1" }, { type: "=1+" }, { keys: ["F4"] }])).toThrow("ещё нет ссылки");
  });
});

describe("лента", () => {
  it("Σ на диапазон: в каждую пустую ячейку — сумма блока над ней", () => {
    const state = applyAll([{ dragSelect: "E16:G16" }, { clickRibbon: "autosum" }]);

    expect(state.sheet.formula("E16")).toBe("=SUM(E14:E15)");
    expect(state.sheet.value("G16")).toBe(534);
    expect(state.editor).toBeNull();
  });

  it("Σ на одну ячейку — как Alt+=: формула открыта для проверки", () => {
    const state = applyAll([{ click: "E16" }, { clickRibbon: "autosum" }]);

    expect(state.editor && editorText(state.editor)).toBe("=SUM(E14:E15)");
  });

  it("Копировать и Вставить на ленте", () => {
    const state = applyAll([{ click: "E14" }, { clickRibbon: "copy" }, { click: "H20" }, { clickRibbon: "paste" }]);

    expect(state.sheet.value("H20")).toBe(364);
    expect(state.clipboard).toBe("E14");
  });

  it("Ctrl+Z отменяет автосумму диапазона целиком", () => {
    const state = applyAll([{ dragSelect: "E16:G16" }, { clickRibbon: "autosum" }, { keys: ["Ctrl", "Z"] }]);

    expect(state.sheet.value("E16")).toBeNull();
  });
});

describe("набранные ссылки окрашиваются, как в Excel", () => {
  it("цвет по порядку появления, повтор — тем же цветом", () => {
    const state = applyAll([{ click: "F10" }, { type: "=($B$5-$B$4*F$9)*(F$9-$E10)" }]);
    const html = state.editor ? editorHtml(state.editor, "ru") : "";

    expect(html).toBe(
      '=(<span class="xl-reftext xl-ref0">$B$5</span>-<span class="xl-reftext xl-ref1">$B$4</span>*' +
        '<span class="xl-reftext xl-ref2">F$9</span>)*(<span class="xl-reftext xl-ref2">F$9</span>-' +
        '<span class="xl-reftext xl-ref3">$E10</span>)',
    );
  });
});

describe("animate ≡ apply", () => {
  it.each([
    ["F4 + копирование", [...E23_ABSOLUTE, { click: "E23" }, { keys: ["Ctrl", "C"] }, { dragSelect: "E23:G24" }, { keys: ["Enter"] }]],
    ["Σ на ленте", [{ dragSelect: "E16:G16" }, { clickRibbon: "autosum" }]],
  ] as [string, ActionSpec[]][])("%s", async (_name, specs) => {
    const { state } = await animateAll(specs);

    expect(comparable(state)).toEqual(comparable(applyAll(specs)));
  });
});
