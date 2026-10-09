import { describe, expect, it } from "vitest";

import { colToLetters } from "./address";
import { ExcelError } from "./evaluator";
import cases from "./fixtures/lookup-excel.json";
import { SheetModel } from "./sheet-model";

const NA = new ExcelError("#N/A");

describe("ВПР с приблизительным поиском — как в Excel", () => {
  it("300 случайных неотсортированных таблиц: та же позиция, что вернул настоящий Excel", () => {
    const mismatches: string[] = [];
    cases.forEach((c, i) => {
      const cells: Record<string, string | number> = { D1: c.x };
      c.col.forEach((v, r) => {
        cells[`A${r + 1}`] = v;
        cells[`B${r + 1}`] = r + 1;
      });
      const n = c.col.length;
      cells.E1 = `=IFERROR(VLOOKUP(D1,A1:B${n},2,TRUE),0)`;
      cells.F1 = `=IFERROR(MATCH(D1,A1:A${n},1),0)`;
      const sheet = new SheetModel({ cells });
      if (sheet.value("E1") !== c.excel || sheet.value("F1") !== c.excel) {
        mismatches.push(`#${i}: Excel ${c.excel}, плеер ${String(sheet.value("E1"))}/${String(sheet.value("F1"))}`);
      }
    });
    expect(mismatches).toEqual([]);
  }, 30_000);

  it("неотсортированные коды без ЛОЖЬ — «неправильная» цена, с ЛОЖЬ — правильная (глава 3)", () => {
    const sheet = new SheetModel({
      cells: {
        A1: "Z-210", B1: 5.2,
        A2: "A-105", B2: 3.5,
        A3: "K-020", B3: 2.9,
        A4: "M-777", B4: 7.4,
        A5: "B-300", B5: 4.1,
        D1: "=VLOOKUP(\"Z-210\",A1:B5,2)",
        D2: "=VLOOKUP(\"Z-210\",A1:B5,2,FALSE)",
      },
    });
    expect(sheet.value("D1")).toBe(4.1); // двоичный поиск Excel уходит вправо и берёт последнюю строку
    expect(sheet.value("D2")).toBe(5.2);
  });
});

describe("шкала (налоговая ставка по доходу)", () => {
  const sheet = new SheetModel({
    cells: {
      D6: 0, E6: 0.15,
      D7: 10000, E7: 0.3,
      D8: 30000, E8: 0.34,
      D9: 100000, E9: 0.4,
      ...Object.fromEntries(
        [-1000, 30000, 29000, 98000, 104000].flatMap((income, i) => [
          [`D${13 + i}`, income],
          [`E${13 + i}`, `=VLOOKUP(D${13 + i},$D$6:$E$9,2,TRUE)`],
          [`F${13 + i}`, `=VLOOKUP(D${13 + i},$D$6:$E$9,2,FALSE)`],
        ]),
      ),
    },
  });

  it("ИСТИНА: наибольшее значение, не превышающее доход; ниже первого — #Н/Д", () => {
    expect([13, 14, 15, 16, 17].map((r) => sheet.value(`E${r}`))).toEqual([NA, 0.34, 0.3, 0.34, 0.4]);
  });

  it("ЛОЖЬ: только точное совпадение", () => {
    expect([13, 14, 15, 16, 17].map((r) => sheet.value(`F${r}`))).toEqual([NA, 0.34, NA, NA, NA]);
  });
});

describe("ГПР, ПОИСКПОЗ, ошибки аргументов", () => {
  it("ГПР по датам (серийные номера): цена периода, в котором дата", () => {
    const jan = 45658; // 01.01.2025
    const may = 45778; // 01.05.2025
    const aug = 45870; // 01.08.2025
    const sheet = new SheetModel({
      cells: {
        B2: jan, C2: may, D2: aug,
        B3: 98, C3: 105, D3: 112,
        A1: `=HLOOKUP(${jan + 10},B2:D3,2,TRUE)`,
        A2: `=HLOOKUP(${may},B2:D3,2)`,
        A3: `=HLOOKUP(${aug + 100},B2:D3,2)`,
      },
    });
    expect(["A1", "A2", "A3"].map((a) => sheet.value(a))).toEqual([98, 105, 112]);
  });

  it("номер столбца вне таблицы — #ССЫЛКА!, меньше 1 — #ЗНАЧ!; текст без учёта регистра и с * ?", () => {
    const sheet = new SheetModel({
      cells: {
        A1: "Алматы", B1: 1,
        A2: "Астана", B2: 2,
        D1: "=VLOOKUP(\"алматы\",A1:B2,3,FALSE)",
        D2: "=VLOOKUP(\"Алматы\",A1:B2,0,FALSE)",
        D3: "=VLOOKUP(\"аст*\",A1:B2,2,FALSE)",
        D4: "=VLOOKUP(\"Аст?на\",A1:B2,2,FALSE)",
        D5: "=MATCH(\"АСТАНА\",A1:A2,0)",
      },
    });
    expect(sheet.value("D1")).toEqual(new ExcelError("#REF!"));
    expect(sheet.value("D2")).toEqual(new ExcelError("#VALUE!"));
    expect([sheet.value("D3"), sheet.value("D4"), sheet.value("D5")]).toEqual([2, 2, 2]);
  });

  it("ВПР по имени таблицы и номер столбца из ячейки", () => {
    const sheet = new SheetModel({
      cells: { A1: "x", B1: 10, C1: 20, E1: 3, F1: "=VLOOKUP(\"x\",таблица,E1,FALSE)" },
    });
    sheet.book.defineName({ name: "таблица", areas: [{ sheet: sheet.name, ref: "$A$1:$C$1" }], scope: null });
    expect(sheet.value("F1")).toBe(20);
    expect(colToLetters(3)).toBe("C");
  });
});
