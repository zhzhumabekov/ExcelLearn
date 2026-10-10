import { describe, expect, it } from "vitest";

import { createState, type LessonState } from "../lesson/state";
import { learnFlashFill } from "../lesson/text-tools";
import { Stage } from "../render/stage";
import type { Sheet } from "../generated/lesson";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock, finish } from "../test/fake-clock";
import { type ActionSpec, createAction } from "./index";

// Глава 6: «Найти и заменить», «Текст по столбцам», «Мгновенное заполнение», «Формат ячеек»

function applyAll(sheet: Sheet, specs: ActionSpec[]): LessonState {
  const state = createState(new SheetModel(sheet));
  for (const spec of specs) createAction(spec).apply(state);
  return state;
}

async function animateAll(sheet: Sheet, specs: ActionSpec[]) {
  const { clock, advance } = fakeClock();
  const model = new SheetModel(sheet);
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
});

/** Анимация и мгновенное применение дают одно и то же — на этом держится перемотка. */
async function expectSame(sheet: Sheet, specs: ActionSpec[]): Promise<LessonState> {
  const applied = applyAll(sheet, specs);
  const { state } = await animateAll(sheet, specs);
  expect(comparable(state)).toEqual(comparable(applied));
  return applied;
}

// Продажи по регионам формулами: =50+200+400 (сумма) — как в Salesstripping
const SALES: Sheet = {
  cells: {
    A1: { v: "Продажи", style: "head" },
    A2: { f: "=50+200+400" },
    A3: { f: "=5+124+1025" },
    A4: { f: "=310+45+12" },
  },
};

describe("Найти и заменить", () => {
  const replaceEq: ActionSpec[] = [
    { select: "A2:A4" },
    { clickRibbon: "findReplace" },
    { dialogType: { field: "Найти", text: "=" } },
    { dialogType: { field: "Заменить на", text: " " } },
    { dialogButton: "Заменить все" },
  ];

  it("заменяет «=» в формулах — формулы становятся текстом; сообщение с числом замен", async () => {
    const state = await expectSame(SALES, replaceEq);

    expect(state.sheet.value("A2")).toBe(" 50+200+400");
    expect(state.sheet.formula("A2")).toBeNull();
    expect(state.dialogs.at(-1)).toEqual({ kind: "alert", text: "Все готово. Выполнено замен: 3." });
  });

  it("OK и «Закрыть» убирают окна", async () => {
    const state = await expectSame(SALES, [...replaceEq, { dialogButton: "OK" }, { dialogButton: "Закрыть" }]);
    expect(state.dialogs).toEqual([]);
  });
});

describe("Текст по столбцам", () => {
  const sheet: Sheet = { columns: { A: 120, B: 64, C: 64, D: 64, E: 64 }, cells: { A1: "50+200+400", A2: "5+124+1025" } };
  const wizard: ActionSpec[] = [
    { select: "A1:A2" },
    { clickRibbon: "textToColumns" },
    { dialogCheck: "с разделителями" },
    { dialogButton: "Далее >" },
    { dialogCheck: "знак табуляции" },
    { dialogType: { field: "другой", text: "+" } },
    { dialogButton: "Далее >" },
    { dialogType: { field: "Поместить в", text: "$C$1" } },
    { dialogButton: "Готово" },
  ];

  it("делит текст по «+» в ячейки справа от «Поместить в», числа становятся числами", async () => {
    const state = await expectSame(sheet, wizard);

    expect(["C1", "D1", "E1", "C2", "D2", "E2"].map((a) => state.sheet.value(a))).toEqual([50, 200, 400, 5, 124, 1025]);
    expect(state.ribbonTab).toBe("data");
  });

  it("набор в поле «другой» отмечает флажок; на шаге 1 нет флажков разделителей", () => {
    const state = applyAll(sheet, wizard.slice(0, 6));
    const dialog = state.dialogs.at(-1);
    expect(dialog?.kind === "textToColumns" && dialog.delimiters.другой).toBe(true);
    expect(() => applyAll(sheet, [...wizard.slice(0, 3), { dialogCheck: "запятая" }])).toThrow("нет флажка");
  });
});

describe("Мгновенное заполнение", () => {
  const names: Sheet = {
    cells: {
      A1: { v: "Сотрудник", style: "head" },
      B1: { v: "Имя", style: "head" },
      C1: { v: "Фамилия", style: "head" },
      D1: { v: "Почта", style: "head" },
      A2: "Айгерим Сапарова",
      A3: "Данияр Ахметов",
      A4: "Ольга Николаевна Пак",
      A5: "Ержан Тулеуов",
    },
  };

  it("имя и фамилия по одному примеру (Ctrl+E); отчество в середине не мешает", async () => {
    const state = await expectSame(names, [
      { click: "B2" },
      { type: "Айгерим" },
      { keys: ["Enter"] },
      { keys: ["Ctrl", "E"] },
      { click: "C2" },
      { type: "Сапарова" },
      { keys: ["Enter"] },
      { keys: ["Ctrl", "E"] },
    ]);

    expect(["B3", "B4", "B5"].map((a) => state.sheet.value(a))).toEqual(["Данияр", "Ольга", "Ержан"]);
    expect(["C3", "C4", "C5"].map((a) => state.sheet.value(a))).toEqual(["Ахметов", "Пак", "Тулеуов"]);
    expect(state.selection).toBe("C3:C5");
  });

  it("постоянный текст и регистр: фамилия строчными + домен; кнопка ленты", async () => {
    const state = await expectSame(names, [
      { click: "B2" },
      { type: "сапарова@kaspi.kz" },
      { keys: ["Enter"] },
      { clickRibbon: "flashFill" },
    ]);
    expect(state.sheet.value("B4")).toBe("пак@kaspi.kz");
  });

  it("числа из текста и фраза вокруг числа", () => {
    expect(learnFlashFill([{ sources: ["4 120,50 ₸"], output: "4120" }])).not.toBeNull();
    const program = learnFlashFill([
      { sources: ["Терминал 2 Астана"], output: "Номер в названии: 2" },
      { sources: ["Корпус 15, Алматы"], output: "Номер в названии: 15" },
    ]);
    expect(program).not.toBeNull();
  });

  it("без закономерности — понятная ошибка урока", () => {
    expect(() =>
      applyAll(names, [{ click: "B2" }, { type: "xyz" }, { keys: ["Enter"] }, { keys: ["Ctrl", "E"] }]),
    ).toThrow("не удалось найти закономерность");
  });
});

describe("Формат ячеек (Ctrl+1)", () => {
  const sheet: Sheet = { cells: { A1: { v: "1988-10-14", fmt: "date" } } };

  it("«(все форматы)» показывает код формата ячейки — его вставляют в ТЕКСТ", async () => {
    const specs: ActionSpec[] = [{ click: "A1" }, { keys: ["Ctrl", "1"] }, { dialogPick: "(все форматы)" }];
    const state = await expectSame(sheet, specs);
    expect(state.dialogs.at(-1)).toEqual({ kind: "formatCells", cell: "A1", category: "(все форматы)" });

    const { stage } = await animateAll(sheet, specs);
    expect(stage.dialogs.target('[data-field="Тип"]').textContent).toBe("ДД.ММ.ГГГГ");
  });
});

describe("Tab, F2 и ожидаемые ошибки в expect", () => {
  const sheet: Sheet = { columns: { A: 200, B: 64, C: 64 }, cells: { A1: "Артикул цена  " } };

  it("Tab вводит и переходит вправо, F2 открывает ячейку с её содержимым, Escape — без изменений", async () => {
    const state = await expectSame(sheet, [
      { click: "B1" },
      { type: "=LEN(A1)" },
      { keys: ["Tab"] },
      { click: "A1" },
      { keys: ["F2"] },
      { keys: ["Escape"] },
    ]);
    expect(state.sheet.value("B1")).toBe(14);
    expect(state.sheet.value("A1")).toBe("Артикул цена  ");

    const editing = applyAll(sheet, [{ click: "A1" }, { keys: ["F2"] }]);
    expect(editing.editor).toEqual({ cell: "A1", parts: [{ text: "Артикул цена  " }] });
    expect(applyAll(sheet, [{ click: "B1" }, { type: "1" }, { keys: ["Tab"] }]).active).toBe("C1");
  });
});
