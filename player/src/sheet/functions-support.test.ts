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

// Глава 8: ЧПС и ЧИСТНЗ. Эталоны — из книги (NPV.xlsx, XNPV.xlsx) и пересчёт на Python.
describe("гл. 8: ЧПС, ЧИСТНЗ, КОРЕНЬ", () => {
  const sheet = new SheetModel({
    cells: {
      // Проект 1: −10 000 сегодня, +24 000 через год, −14 000 через два
      A1: -10000,
      B1: 24000,
      C1: -14000,
      // ЧИСТНЗ: даты (серийные номера Excel) и потоки, ставка 10%
      A3: 42102,
      A4: 42231,
      A5: 42384,
      A6: 42546,
      A7: 42554,
      B3: -900,
      B4: 300,
      B5: 400,
      B6: 200,
      B7: 100,
      // Пустая ячейка между потоками: E1, D1 и F1 заполнены
      D1: 100,
      F1: 100,
    },
  });

  it.each([
    ["=NPV(0.2,A1:C1)", 231.4814815], // поток каждого года — в конце года
    ["=A1+NPV(0.2,B1:C1)", 277.7777778], // первый поток — сегодня
    ["=(1+0.2)*NPV(0.2,A1:C1)", 277.7777778], // потоки в начале года
    ["=SQRT(1+0.2)*NPV(0.2,A1:C1)", 253.5752523], // потоки в середине года
    ["=XNPV(0.1,B3:B7,A3:A7)", 28.6394], // в деньгах первой даты
    ["=NPV(0.1,D1:F1)", 100 / 1.1 + 100 / 1.21], // пустую ячейку ЧПС пропускает вместе с периодом
  ])("%s → %j", (formula, expected) => {
    sheet.setInput("Z1", formula);
    expect(sheet.value("Z1")).toBeCloseTo(expected as number, 3);
  });

  it("ЧИСТНЗ с пустым потоком — #ЧИСЛО!", () => {
    sheet.setInput("Z1", "=XNPV(0.1,B3:B8,A3:A8)");
    expect(String(sheet.value("Z1"))).toMatch(/#NUM!|#ЧИСЛО!/);
  });
});

// Глава 9: ВСД, ЧИСТВНДОХ, МВСД. Эталоны — из книги (IRR.xlsx) и пересчёт на Python.
describe("гл. 9: ВСД, ЧИСТВНДОХ, МВСД", () => {
  const sheet = new SheetModel({
    cells: {
      // МВСД (рис. 9.6): заём 120 000 и потоки 5 лет
      A1: -120000,
      B1: 39000,
      C1: 30000,
      D1: 21000,
      E1: 37000,
      F1: 46000,
      // Два корня (рис. 9.2): −20, 82, −60, 2
      A2: -20,
      B2: 82,
      C2: -60,
      D2: 2,
      // Нет корня (рис. 9.3): +, −, +
      A3: 10,
      B3: -30,
      C3: 25,
      // ЧИСТВНДОХ: даты и потоки
      A5: 46000,
      A6: 46100,
      A7: 46400,
      B5: -1000,
      B6: 400,
      B7: 800,
    },
  });
  const value = (formula: string) => {
    sheet.setInput("Z1", formula);
    return sheet.value("Z1");
  };

  it("ВСД и МВСД примера книги: 13,07% и 12,61%", () => {
    expect(value("=IRR(A1:F1)")).toBeCloseTo(0.130736, 5);
    expect(value("=MIRR(A1:F1,10%,12%)")).toBeCloseTo(0.126094, 5);
  });

  it.each([
    [-0.9, -0.0959],
    [-0.1, -0.0959],
    [0.1, -0.0959],
    [0.3, -0.0959],
    [0.5, 2.1609],
    [0.9, 2.1609],
  ])("два корня: предположение %f → %f (как в таблице книги)", (guess, root) => {
    expect(value(`=IRR(A2:D2,${guess})`)).toBeCloseTo(root, 3);
  });

  it("без корня — #ЧИСЛО! при любом предположении", () => {
    for (const guess of [-0.9, -0.5, 0, 0.5, 0.9]) expect(String(value(`=IRR(A3:C3,${guess})`))).toMatch(/#NUM!/);
  });

  it("ЧИСТВНДОХ: при найденной ставке ЧИСТНЗ = 0", () => {
    const rate = value("=XIRR(B5:B7,A5:A7)") as number;
    expect(typeof rate).toBe("number");
    expect(value(`=XNPV(${rate},B5:B7,A5:A7)`)).toBeCloseTo(0, 6);
  });
});
