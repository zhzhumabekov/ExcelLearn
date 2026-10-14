import { describe, expect, it } from "vitest";

import { type ActionSpec, createAction } from "../actions/index";
import { createState } from "../lesson/state";
import { chosenFormat } from "../lesson/text-tools";
import { formatValue } from "../locale/format";
import { Stage } from "../render/stage";
import { fakeClock, finish } from "../test/fake-clock";
import { createBook } from "../lesson/book";
import { SheetModel } from "./sheet-model";
import { parseDateTimeText, parseTimeText } from "./times";

// Глава 13: время — доля суток. Числа из книги: 3:00 = 0,125; 01.01.2007 6:00 = 39083,25.
describe("гл. 13: ввод и показ времени", () => {
  it("набранное время и дата со временем — числа, ячейка получает формат времени", () => {
    const sheet = new SheetModel({ cells: {} });
    sheet.setInput("A1", "3:00");
    sheet.setInput("A2", "20:30");
    sheet.setInput("A3", "01.01.2007 6:00");
    sheet.setInput("A4", "15:10:30");
    sheet.setInput("A5", "38:48");
    expect(sheet.value("A1")).toBe(0.125);
    expect(sheet.value("A2")).toBeCloseTo(20.5 / 24, 12);
    expect(sheet.value("A3")).toBe(39083.25);
    expect([1, 2, 3, 4, 5].map((r) => sheet.get(`A${r}`).fmt)).toEqual([
      "time",
      "time",
      "datetime",
      "timeSec",
      "hours",
    ]);
  });

  it("форматы: 8:30, 15:10:30, [ч]:мм:сс, дата со временем; отрицательное время — решётки", () => {
    const t = 8.5 / 24;
    expect(formatValue(t, "time", "ru").text).toBe("8:30");
    expect(formatValue(20.5 / 24, "time", "en").text).toBe("8:30 PM");
    expect(formatValue((15 * 3600 + 10 * 60 + 30) / 86400, "timeSec", "ru").text).toBe("15:10:30");
    expect(formatValue(38.8 / 24, "hours", "ru").text).toBe("38:48:00");
    expect(formatValue(38.8 / 24, "time", "ru").text).toBe("14:48"); // больше суток часы обнуляются
    expect(formatValue(39083 + 5 / 24 + 35 / 1440, "datetime", "ru").text).toBe("01.01.2007 5:35");
    expect(formatValue(-0.5, "time", "ru").text).toMatch(/^#+$/);
  });

  it("разбор текста: AM/PM, неверное время — не время", () => {
    expect(parseTimeText("8:30 PM")?.value).toBeCloseTo(20.5 / 24, 12);
    expect(parseTimeText("12:00 AM")?.value).toBe(0);
    expect(parseTimeText("8:75")).toBeNull();
    expect(parseDateTimeText("1/1/2007 6:00", "en")).toBe(39083.25);
  });
});

describe("гл. 13: функции времени", () => {
  const sheet = new SheetModel({ cells: { A4: { f: "=TIME(15,10,30)" }, B1: 8.5 / 24, B2: 20.5 / 24 } });

  it.each([
    ["=TIME(8,30,0)", 8.5 / 24],
    ["=TIME(25,10,30)", (3600 + 630) / 86400], // 25 часов → 1:10:30
    ['=TIMEVALUE("8:30")', 0.3541666667],
    ['=TIMEVALUE("01.01.2007 8:30")', 0.3541666667], // дата отбрасывается
    ["=HOUR(A4)", 15],
    ["=MINUTE(A4)", 10],
    ["=SECOND(A4)", 30],
    ["=B2-B1", 0.5],
    ["=24*(B2-B1)", 12],
    ["=IF(B1>B2,24*(B1-B2),24+24*(B1-B2))", 12],
    ['=HOUR("20:30")', 20],
  ])("%s → %j", (formula, expected) => {
    sheet.setInput("Z1", formula);
    expect(sheet.value("Z1") as number).toBeCloseTo(expected, 9);
  });

  it("ТДАТА и СЕГОДНЯ — «сейчас» урока: ТДАТА()-СЕГОДНЯ() = доля суток", () => {
    const book = createBook({ sheet: { cells: {} }, today: "2026-10-13", now: "14:12" });
    book.setInput("A1", "=NOW()");
    book.setInput("A2", "=NOW()-TODAY()");
    expect(book.value("A1") as number).toBeCloseTo(46308 + 14.2 / 24, 9);
    expect(book.value("A2") as number).toBeCloseTo(14.2 / 24, 9);
  });
});

describe("гл. 13: действия", () => {
  it("Ctrl+Shift+; — статичное время урока", () => {
    const state = createState(createBook({ sheet: { cells: {} }, today: "2026-10-13", now: "7:10" }));
    const specs: ActionSpec[] = [{ click: "B2" }, { keys: ["Ctrl", "Shift", ";"] }, { keys: ["Enter"] }];
    for (const spec of specs) createAction(spec).apply(state);
    expect(state.sheet.value("B2") as number).toBeCloseTo(7 / 24 + 10 / 1440, 12);
    expect(state.sheet.get("B2").fmt).toBe("time");
  });

  it("автозаполнение рядом: 8:00, 8:20 → … 17:00; дни недели по кругу", () => {
    const sheet = new SheetModel({
      cells: {
        A1: { v: 8 / 24, fmt: "time" },
        A2: { v: 8 / 24 + 20 / 1440, fmt: "time" },
        C1: "Понедельник",
        C2: "Вторник",
      },
    });
    const state = createState(sheet);
    createAction({ fillSeries: "A1:A28" }).apply(state);
    createAction({ fillSeries: "C1:C9" }).apply(state);
    expect(state.sheet.value("A28")).toBe(17 / 24);
    expect(formatValue(state.sheet.value("A28"), state.sheet.get("A28").fmt, "ru").text).toBe("17:00");
    expect(state.sheet.value("C7")).toBe("Воскресенье");
    expect(state.sheet.value("C8")).toBe("Понедельник");
  });

  it("Формат ячеек → Время: типы списка дают форматы времени", () => {
    expect(chosenFormat({ kind: "formatCells", cell: "A1", category: "Время", dateType: "37:30:55" })).toBe("hours");
    expect(chosenFormat({ kind: "formatCells", cell: "A1", category: "Время" })).toBe("time");
    const state = createState(new SheetModel({ cells: { A1: { v: 0.5, fmt: "time" } } }));
    const specs: ActionSpec[] = [
      { click: "A1" },
      { keys: ["Ctrl", "1"] },
      { dialogPick: "Время" },
      { dialogPick: "13:30:55" },
      { dialogButton: "OK" },
    ];
    for (const spec of specs) createAction(spec).apply(state);
    expect(state.sheet.get("A1").fmt).toBe("timeSec");
  });
});

describe("гл. 13: анимация ≡ перемотка", () => {
  it("автозаполнение рядом и Ctrl+Shift+;", async () => {
    const lesson = {
      sheet: {
        rows: 12,
        columns: { A: 80, B: 80, C: 80 },
        cells: { A1: { v: 8 / 24, fmt: "time" as const }, A2: { v: 8 / 24 + 1 / 72, fmt: "time" as const } },
      },
      today: "2026-10-13",
      now: "7:10",
    };
    const specs: ActionSpec[] = [
      { fillSeries: "A1:A10" },
      { click: "C1" },
      { keys: ["Ctrl", "Shift", ";"] },
      { keys: ["Enter"] },
    ];
    const applied = createState(createBook(lesson));
    for (const spec of specs) createAction(spec).apply(applied);

    const { clock, advance } = fakeClock();
    const sheet = createBook(lesson);
    const stage = new Stage(sheet, "ru", clock);
    const state = createState(sheet);
    for (const spec of specs) await finish(createAction(spec).animate({ state, stage, clock }), advance);

    for (const addr of ["A10", "C1"]) expect(state.sheet.value(addr)).toBe(applied.sheet.value(addr));
    expect(state.selection).toBe(applied.selection);
  });
});
