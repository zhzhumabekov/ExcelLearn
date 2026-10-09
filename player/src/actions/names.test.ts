import { describe, expect, it } from "vitest";

import { createBook } from "../lesson/book";
import { createState, type LessonState } from "../lesson/state";
import { Stage } from "../render/stage";
import { ExcelError } from "../sheet/evaluator";
import { fakeClock, finish } from "../test/fake-clock";
import { type ActionSpec, createAction } from "./index";

const LESSON = {
  sheet: {
    name: "Лист1",
    rows: 24,
    cells: {
      A1: 1, B1: 2, A2: 3, B2: 4, A3: 5, B3: 6, A4: 7, B4: 8,
      E6: 10, F6: 20, G6: 30, E7: 40, F7: 50, G7: 60,
      A12: "Цена", B12: 1500,
      A13: "Количество", B13: 8,
      A14: "Северо-Казахстанская обл", B14: 5,
      C12: "=B12*B13",
    },
  },
  sheets: [{ name: "Лист2", cells: { E4: 3, E5: 4, E6: 5 } }],
};

const book = () => createBook(LESSON);

function applyAll(specs: ActionSpec[]): LessonState {
  const state = createState(book());
  for (const spec of specs) createAction(spec).apply(state);
  return state;
}

async function animateAll(specs: ActionSpec[]) {
  const { clock, advance } = fakeClock();
  const sheet = book();
  const stage = new Stage(sheet, "ru", clock);
  document.body.append(stage.el);
  const state = createState(sheet);
  stage.render(state);
  for (const spec of specs) await finish(createAction(spec).animate({ state, stage, clock }), advance);
  stage.el.remove();
  return { state, stage };
}

const comparable = (state: LessonState) => ({
  book: state.sheet.book.snapshot(),
  sheet: state.sheet.name,
  active: state.active,
  selection: state.selection,
  areas: state.areas,
  editor: state.editor,
  dialogs: state.dialogs,
  ribbonTab: state.ribbonTab,
  menu: state.menu,
  nameListOpen: state.nameListOpen,
});

const SCENARIO: ActionSpec[] = [
  // Поле «Имя»: диапазон и несмежный диапазон (Ctrl)
  { dragSelect: "A1:B4" },
  { nameBox: "данные" },
  { dragSelect: "A1:A2" },
  { addSelect: "E6:G7" },
  { nameBox: "выборка" },
  { nameList: "данные" },
  // Недопустимое имя — сообщение Excel
  { click: "D1" },
  { nameBox: "3Q" },
  { dialogButton: "OK" },
  // Формулы с именами: набор, автозавершение, F3 → «Вставка имени»
  { type: "=AVERAGE(дан" },
  { autocomplete: "данные" },
  { type: ")" },
  { keys: ["Enter"] },
  { type: "=AVERAGE(" },
  { keys: ["F3"] },
  { dialogPick: "выборка" },
  { dialogButton: "OK" },
  { type: ")" },
  { keys: ["Enter"] },
  // Создать из выделенного (в столбце слева)
  { ribbonTab: "formulas" },
  { dragSelect: "A12:B14" },
  { clickRibbon: "createFromSelection" },
  { dialogButton: "OK" },
  // Применить имена к формуле C12
  { selectAll: true },
  { clickRibbon: "applyNames" },
  { dialogButton: "OK" },
  // Присвоить имя с областью «лист» и диапазоном мышью
  { sheetTab: "Лист2" },
  { clickRibbon: "defineName" },
  { dialogType: { field: "Имя", text: "jam" } },
  { dialogChoose: { field: "Область", option: "Лист2" } },
  { dialogRange: { field: "Диапазон", range: "E4:E6" } },
  { dialogButton: "OK" },
  { click: "A1" },
  { type: "=SUM(jam)" },
  { keys: ["Enter"] },
  // Диспетчер имён: выбрать два имени и удалить
  { sheetTab: "Лист1" },
  { clickRibbon: "nameManager" },
  { dialogPick: "Количество" },
  { dialogPick: { item: "Северо_Казахстанская_обл", add: "ctrl" } },
  { dialogButton: "Удалить" },
  { dialogButton: "OK" },
  { dialogButton: "Закрыть" },
  // Имя целой строки и «Все имена» на лист
  { selectRow: 12 },
  { nameBox: "строка_цен" },
  { selectColumn: "B" },
  { click: "A17" },
  { keys: ["F3"] },
  { dialogButton: "Все имена" },
];

describe("действия с именами: просмотр ≡ перемотка", () => {
  it("весь сценарий: анимация приходит к тому же состоянию, что apply", async () => {
    const { state } = await animateAll(SCENARIO);
    expect(comparable(state)).toEqual(comparable(applyAll(SCENARIO)));
  }, 30_000);

  it("каждый префикс сценария тоже совпадает (перемотка к любому шагу)", async () => {
    for (const n of [2, 5, 9, 13, 21, 30, 40]) {
      const prefix = SCENARIO.slice(0, n);
      const { state } = await animateAll(prefix);
      expect(comparable(state), `после ${n} действий`).toEqual(comparable(applyAll(prefix)));
    }
  }, 60_000);
});

describe("результат сценария", () => {
  const state = applyAll(SCENARIO);
  const book1 = state.sheet.book;
  const s1 = book1.sheet("Лист1");
  const s2 = book1.sheet("Лист2");

  it("имена созданы, удалённые — исчезли", () => {
    expect(book1.names.map((d) => (d.scope ? `${d.name}@${d.scope}` : d.name))).toEqual([
      "выборка",
      "данные",
      "строка_цен",
      "Цена",
      "jam@Лист2",
    ]);
  });

  it("формулы с именами считаются; C12 после «Применить имена» — с именем", () => {
    expect(s1.value("D1")).toBe(4.5); // среднее A1:B4
    expect(s1.value("D2")).toBe(26.75); // среднее A1:A2 и E6:G7: (1+3+10+20+30+40+50+60)/8
    expect(s1.formula("D1")).toBe("=AVERAGE(данные)");
    expect(s1.formula("C12")).toBe("=Цена*Количество"); // имена применены до того, как «Количество» удалили
    expect(s2.value("A1")).toBe(12);
  });

  it("после удаления имени формула с ним даёт #ИМЯ?", () => {
    s1.setInput("J1", "=Количество*2");
    expect(s1.value("J1")).toEqual(new ExcelError("#NAME?"));
  });

  it("«Все имена»: список имён листа и их ссылки, начиная с активной ячейки", () => {
    expect(s1.value("A17")).toBe("выборка");
    expect(s1.value("B17")).toBe("=Лист1!$A$1:$A$2,Лист1!$E$6:$G$7");
    expect(s1.value("A20")).toBe("Цена");
  });
});
