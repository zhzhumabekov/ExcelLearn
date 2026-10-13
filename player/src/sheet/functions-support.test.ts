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

// Глава 10: аннуитеты, кредиты, амортизация. Эталоны — цифры книги (Excelfinfunctions.xlsx, Depreciationexamples.xlsx).
describe("гл. 10: ПС, БС, ПЛТ, ОСПЛТ, ПРПЛТ, ОБЩПЛАТ, ОБЩДОХОД, СТАВКА, КПЕР, АПЛ, АСЧ, ДДОБ", () => {
  const sheet = new SheetModel({ cells: {} });
  const value = (formula: string) => {
    sheet.setInput("Z1", formula);
    return sheet.value("Z1");
  };

  it.each([
    ["=PV(0.12,5,-3000,0,0)", 10814.33],
    ["=PV(0.12,5,-3000)", 10814.33],
    ["=PV(0.12,5,-3000,0,1)", 12112.05],
    ["=PV(0.12,5,-3000,-500,0)", 11098.04],
    ["=PV(0.12,5,-3000,0,TRUE)", 12112.05], // ИСТИНА вместо 1
    ["=FV(0.08,40,-2000)", 518113.04],
    ["=FV(0.08,40,-2000,0,1)", 559562.08],
    ["=FV(0.08,40,-2000,-30000,0)", 1169848.68],
    ["=-PMT(0.08/12,10,10000,0,0)", 1037.03],
    ["=-PMT(0.08/12,10,10000,0,1)", 1030.16],
    ["=-PMT(0.08/12,10,10000,-1000,0)", 940.0],
    ["=-PPMT(0.08/12,1,10,10000,0,0)", 970.37],
    ["=-IPMT(0.08/12,1,10,10000,0,0)", 66.67],
    ["=-IPMT(0.08/12,3,10,10000,0,0)", 53.69],
    ["=CUMIPMT(0.08/12,10,10000,2,4,0)", -161.01],
    ["=CUMPRINC(0.08/12,10,10000,2,4,0)", -2950.08],
    ["=PV(0.007241,120,-1000,0,0)", 80000.08],
    ["=NPER(0.08,-10000,100000,0,0)", 20.91],
    ["=NPER(0.08,-10000,100000,-40000,0)", 15.9],
    ["=PV(0.08,20,-10000)", 98181.47],
    ["=PV(0.08,21,-10000)", 100168.03],
    ["=SLN(15000,3000,5)", 2400],
    ["=SYD(15000,3000,5,1)", 4000],
    ["=SYD(15000,3000,5,5)", 800],
    ["=DDB(15000,3000,5,1)", 6000],
    ["=DDB(15000,3000,5,2)", 3600],
    ["=DDB(15000,3000,5,3)", 2160],
    ["=DDB(15000,3000,5,4)", 240],
    ["=DDB(15000,3000,5,5)", 0],
  ])("%s → %f", (formula, expected) => {
    expect(value(formula)).toBeCloseTo(expected, 2);
  });

  it("СТАВКА: 0,7241% и 0,818% в месяц", () => {
    expect(value("=RATE(120,-1000,80000,0,0)")).toBeCloseTo(0.007241, 6);
    expect(value("=RATE(120,-1000,80000,-10000,0)")).toBeCloseTo(0.00818, 5);
  });
});

// Глава 12: ЕСЛИ, И, ИЛИ, ЕСЛИОШИБКА, АГРЕГАТ, СТРОКА, ОСТАТ, ЕСЛИМН, ВЫБОР, ПЕРЕКЛЮЧ и ошибки Excel.
describe("гл. 12: логические функции и ошибки", () => {
  const sheet = new SheetModel({
    cells: {
      A1: 1200,
      // ВЫБОР по диапазонам (рис. 12.15): кварталы в столбцах M:P
      M6: 10,
      M7: 20,
      M8: 30,
      N6: 5,
      N7: 5,
      N8: 5,
      O6: 30,
      O7: 40,
      O8: 50,
      P6: 1,
      P7: 1,
      P8: 1,
      // АГРЕГАТ (рис. 12.8): зарплаты с ошибками #Н/Д
      E11: 80,
      E12: 70,
      E15: 74,
      C3: 0,
      B3: 5,
      B6: 3,
      C6: "jack",
    },
  });
  const value = (formula: string) => {
    sheet.setInput("Z1", formula);
    return sheet.value("Z1");
  };

  it.each([
    ["=IF(A1<=500,3*A1,IF(A1<=1200,2.7*A1,IF(A1<=2000,2.3*A1,2*A1)))", 3240],
    ['=IF(OR(7=2,7=3,7=12),"проигрыш",IF(OR(7=7,7=11),"выигрыш","продолжать"))', "выигрыш"],
    ['=IF(AND(1=1,5>3),"Да","Нет")', "Да"],
    ['=IFERROR(1/0," ")', " "],
    ["=IFERROR(5,0)", 5],
    ['=IFS(A1<=500,3,A1<=1200,2.7,A1<=2000,2.3,TRUE,2)', 2.7],
    ["=CHOOSE(3,-1,1,1,1,1,1,1,0,-1,-1)", 1],
    ["=SUM(CHOOSE(3,M6:M8,N6:N8,O6:O8,P6:P8))", 120],
    ['=SWITCH("L","XL","Очень большой","L","Большой","Неправильный код")', "Большой"],
    ['=SWITCH("Q","XL","Очень большой","L","Большой","Неправильный код")', "Неправильный код"],
    ["=ROW(A6)", 6],
    ["=MOD(9,4)", 1],
    ["=MOD(6,3)", 0],
    ["=AGGREGATE(1,6,E11:E15)", 74.66667],
  ])("%s → %j", (formula, expected) => {
    const v = value(formula);
    if (typeof expected === "number") expect(v).toBeCloseTo(expected, 4);
    else expect(v).toBe(expected);
  });

  it("ЕСЛИОШИБКА с ВПР и АГРЕГАТ пропускают #Н/Д", () => {
    sheet.setInput("E13", '=VLOOKUP("JR",M6:N8,2,FALSE)');
    sheet.setInput("E14", '=VLOOKUP("Josh",M6:N8,2,FALSE)');
    expect(String(value("=AVERAGE(E11:E15)"))).toMatch(/#N\/A/);
    expect(value("=AGGREGATE(1,6,E11:E15)")).toBeCloseTo(74.66667, 4);
  });

  it.each([
    ["=C3/B3", 0],
    ["=B3/C3", "#DIV/0!"],
    ["=B6+C6", "#VALUE!"],
    ["=SUM(sales)", "#NAME?"],
    ["=SQRT(-1)", "#NUM!"],
  ])("ошибка: %s → %s", (formula, code) => {
    const v = value(formula);
    if (typeof code === "number") expect(v).toBe(code);
    else expect(String(v)).toContain(code);
  });

  it("СТРОКА() без аргумента — строка самой формулы", () => {
    sheet.setInput("Z7", "=ROW()");
    expect(sheet.value("Z7")).toBe(7);
    sheet.setInput("Z6", '=IF(MOD(ROW(),4)=2,"год","")');
    expect(sheet.value("Z6")).toBe("год");
  });
});
