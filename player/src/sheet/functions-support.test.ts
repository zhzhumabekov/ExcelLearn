import { describe, expect, it } from "vitest";

import { SheetModel } from "./sheet-model";

// Функции ближайших глав книги: если обновление библиотеки что-то сломает, тест покажет, что именно.
describe("поддержка функций книги", () => {
  const sheet = new SheetModel({
    cells: { A1: "Kim", B1: 10, A2: "Luka", B2: 20, A3: "Matt", B3: 30, D1: 0.25 },
  });

  it.each([
    ["=VLOOKUP(\"Luka\",A1:B3,2,FALSE)", 20], // гл. 3
    ["=HLOOKUP(10,B1:B3,2,FALSE)", 20],
    ["=INDEX(B1:B3,3)", 30], // гл. 4
    ["=IF(B2>15,\"да\",\"нет\")", "да"],
    ["=ROUND(D1*3.14159,2)", 0.79],
    ["=COUNTIF(B1:B3,\">15\")", 2],
    ["=SUMPRODUCT(B1:B3,B1:B3)", 1400],
    ["=LEFT(A2,2)&RIGHT(A3,1)", "Lut"],
  ])("%s → %j", (formula, expected) => {
    sheet.setInput("Z1", formula);
    const value = sheet.value("Z1");

    if (typeof expected === "number") expect(value).toBeCloseTo(expected, 6);
    else expect(value).toBe(expected);
  });


  // Раньше были пробелами fast-formula-parser 1.0.19 — теперь их считает formulajs (formulajs-bridge.ts).
  it.each([
    ["=MATCH(\"Matt\",A1:A3,0)", 3], // гл. 5
    ["=MAX(B1:B3)-MIN(B1:B3)", 20],
    ["=UPPER(A1)", "KIM"],
    ["=PMT(0.1/12,12,-1000)", 87.91588723], // финансовые главы
    ["=NPV(0.1,100,100)", 173.553719],
    ["=DATE(2026,10,9)", 46304], // даты — серийные числа Excel
    ["=DATE(2026,10,9)-DATE(2026,1,1)", 281],
    ["=BETA.DIST(0.5,2,3,TRUE)", 0.6875], // вложенные имена formulajs
    ["=SUM(B1:B3,,5)", 65], // пропущенный аргумент
    ["=ISERROR(1/0)", true],
    ["=IFNA(MATCH(\"Nobody\",A1:A3,0),\"нет\")", "нет"],
  ])("formulajs: %s → %j", (formula, expected) => {
    sheet.setInput("Z1", formula);
    const value = sheet.value("Z1");

    if (typeof expected === "number") expect(value).toBeCloseTo(expected, 6);
    else expect(value).toBe(expected);
  });


  // Функции с контекстом или ссылками считает сам парсер (их formulajs не перекрывает).
  it.each([
    ["=IF(B1>5,1,2)", 1],
    ["=ISBLANK(C9)", true],
    ["=ROW(B3)", 3],
    ["=SUMIF(B1:B3,\">15\")", 50],
    ["=INDEX(A1:B3,2,2)", 20],
  ])("парсер: %s → %j", (formula, expected) => {
    sheet.setInput("Z1", formula);

    expect(sheet.value("Z1")).toBe(expected);
  });
});
