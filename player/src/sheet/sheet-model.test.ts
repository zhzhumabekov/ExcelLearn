import { describe, expect, it } from "vitest";

import { ExcelError } from "./evaluator";
import { parseInput, SheetModel } from "./sheet-model";

function wages(): SheetModel {
  return new SheetModel({
    name: "Wages",
    cells: {
      B3: { v: "Employee", style: "head" },
      C4: 49,
      D4: { v: 10, fmt: "usd" },
      C5: 36,
      D5: { v: 13, fmt: "usd" },
      E4: { fmt: "usd" },
    },
  });
}

describe("parseInput", () => {
  it.each([
    ["=C4*D4", "=C4*D4"],
    ["42", 42],
    [" 3.5 ", 3.5],
    ["Luka", "Luka"],
    ["", null],
  ])("%j → %j", (raw, parsed) => {
    expect(parseInput(raw)).toEqual(parsed);
  });
});

describe("SheetModel", () => {
  it("загружает ячейки урока с форматом и стилем", () => {
    const sheet = wages();

    expect(sheet.name).toBe("Wages");
    expect(sheet.get("B3")).toMatchObject({ value: "Employee", style: "head" });
    expect(sheet.get("D4")).toMatchObject({ value: 10, fmt: "usd" });
    expect(sheet.get("Z99")).toMatchObject({ input: null, value: null, fmt: "general" });
  });

  it("вычисляет формулу и сохраняет формат ячейки", () => {
    const sheet = wages();

    sheet.setInput("E4", "=C4*D4");

    expect(sheet.get("E4")).toMatchObject({ input: "=C4*D4", value: 490, fmt: "usd" });
    expect(sheet.formula("E4")).toBe("=C4*D4");
  });

  it("пересчитывает зависимые ячейки при изменении данных", () => {
    const sheet = wages();
    sheet.setInput("E4", "=C4*D4");
    sheet.setInput("E6", "=E4*2");

    sheet.setInput("C4", 50);

    expect(sheet.value("E4")).toBe(500);
    expect(sheet.value("E6")).toBe(1000);
  });

  it.each([
    ["=SUM(C4:C5)", 85],
    ["=AVERAGE(D4:D5)", 11.5],
    ["=3+6*(5+4)/3-7", 14], // порядок операций, глава 1
    ["=((150-100)/100)^0.5", Math.sqrt(0.5)], // PEMDAS, рис. 1.6
    ["=(150-100)/100^0.5", 5],
    ["=(100-15*4)*(4-1.5)", 100], // кофейня, рис. 1.7
  ])("%s = %d", (formula, expected) => {
    const sheet = wages();

    sheet.setInput("H1", formula);

    expect(sheet.value("H1")).toBeCloseTo(expected, 10);
  });

  it("FORMULATEXT возвращает текст формулы, а для значения — #N/A", () => {
    const sheet = wages();
    sheet.setInput("E4", "=C4*D4");

    sheet.setInput("F4", "=FORMULATEXT(E4)");
    sheet.setInput("F5", "=FORMULATEXT(C4)");

    expect(sheet.value("F4")).toBe("=C4*D4");
    expect(sheet.value("F5")).toEqual(new ExcelError("#N/A"));
  });

  it("ошибки Excel — значения типа ExcelError", () => {
    const sheet = wages();

    sheet.setInput("H1", "=C4/0");
    sheet.setInput("H2", "=NOSUCHFUNCTION(1)");

    expect(sheet.value("H1")).toEqual(new ExcelError("#DIV/0!"));
    expect(sheet.value("H2")).toBeInstanceOf(ExcelError);
  });

  it("ошибка распространяется на зависимые формулы", () => {
    const sheet = wages();

    sheet.setInput("H1", "=C4/0");
    sheet.setInput("H2", "=H1+1");

    expect(sheet.value("H2")).toEqual(new ExcelError("#DIV/0!"));
  });

  // Пробел fast-formula-parser 1.0.19: SUM/AVERAGE по диапазону пропускают ошибки, Excel вернул бы #DIV/0!
  it.fails("ошибка в диапазоне распространяется через SUM", () => {
    const sheet = wages();

    sheet.setInput("H1", "=C4/0");
    sheet.setInput("H3", "=SUM(H1:H2)");

    expect(sheet.value("H3")).toEqual(new ExcelError("#DIV/0!"));
  });

  it("циклическая ссылка не зависает и даёт 0, как в Excel", () => {
    const sheet = wages();

    sheet.setInput("H1", "=H2+1");
    sheet.setInput("H2", "=H1+1");

    expect(typeof sheet.value("H1")).toBe("number");
  });

  it("snapshot/restore возвращает лист в прежнее состояние", () => {
    const sheet = wages();
    const before = sheet.snapshot();

    sheet.setInput("E4", "=C4*D4");
    sheet.clear("C4");
    sheet.restore(before);

    expect(sheet.get("E4")).toMatchObject({ input: null, value: null, fmt: "usd" });
    expect(sheet.value("C4")).toBe(49);
  });

  it("формула из шаблона (поле f) вычисляется при загрузке", () => {
    const sheet = new SheetModel({ cells: { A1: 2, A2: { f: "=A1*3", v: 999 } } });

    expect(sheet.value("A2")).toBe(6);
  });
});
