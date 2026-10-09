import { describe, expect, it } from "vitest";

import { ExcelError } from "../sheet/evaluator";
import { errorCode, formatValue, functionName, localizeFormula, renderPlaceholders } from "./format";

describe("localizeFormula", () => {
  it.each([
    ["=SUM(C4:C11)", "=СУММ(C4:C11)"],
    ["=AVERAGE(E4:E11)", "=СРЗНАЧ(E4:E11)"],
    ["=FORMULATEXT(E4)", "=Ф.ТЕКСТ(E4)"],
    ["=C4*D4", "=C4*D4"], // без функций — без изменений
    ["=((E4-D4)/D4)^0.5", "=((E4-D4)/D4)^0,5"], // десятичная запятая
    ["=ROUND(A1,2)", "=ОКРУГЛ(A1;2)"], // разделитель аргументов
    ["=IF(A1>0.5,SUM(B1:B3),0)", "=ЕСЛИ(A1>0,5;СУММ(B1:B3);0)"], // вложенные
    ["=sum(a1:a3)", "=СУММ(a1:a3)"], // регистр имени функции
    ["=NORM.DIST(1,0,1,TRUE)", "=НОРМ.РАСП(1;0;1;ИСТИНА)"], // имя с точкой, логическая константа
    ['=IF(A1="x, y.5",1,2)', '=ЕСЛИ(A1="x, y.5";1;2)'], // текст в кавычках не трогаем
    ["='Sheet 1.2'!A1+1.5", "='Sheet 1.2'!A1+1,5"], // имя листа не трогаем
    ["=ABS(-1)", "=ABS(-1)"], // нет перевода — как есть
    ["=E$12*E14", "=E$12*E14"],
    ["=#REF!+1", "=#ССЫЛКА!+1"],
    ["=1E-3*2", "=1E-3*2"],
  ])("%s → %s", (formula, ru) => {
    expect(localizeFormula(formula, "ru")).toBe(ru);
    expect(localizeFormula(formula, "en")).toBe(formula);
  });
});

describe("имена и ошибки", () => {
  it("переводит имена функций", () => {
    expect(functionName("sum", "ru")).toBe("СУММ");
    expect(functionName("sum", "en")).toBe("SUM");
    expect(functionName("LN", "ru")).toBe("LN");
  });

  it("переводит коды ошибок", () => {
    expect(errorCode("#DIV/0!", "ru")).toBe("#ДЕЛ/0!");
    expect(errorCode("#N/A", "en")).toBe("#N/A");
  });
});

describe("formatValue", () => {
  it.each([
    [490, "usd", "en", { text: "490.00", align: "right", currency: "$" }],
    [449.625, "usd", "ru", { text: "449,63", align: "right", currency: "$" }],
    [1320, "usd", "en", { text: "1,320.00", align: "right", currency: "$" }],
    [Math.sqrt(0.5), "general", "en", { text: "0.7071067812", align: "right" }],
    [Math.sqrt(0.5), "general", "ru", { text: "0,7071067812", align: "right" }],
    [320, "general", "ru", { text: "320", align: "right" }],
    [0.1 + 0.2, "general", "en", { text: "0.3", align: "right" }], // без хвоста 0.30000000000000004
    [2450.6, "kzt", "en", { text: "2,451 ₸", align: "right" }], // тенге без тиынов
    [0.25, "percent", "ru", { text: "25%", align: "right" }],
    [0.125, "percent", "ru", { text: "12,50%", align: "right" }],
    [3.14159, "number", "en", { text: "3.14", align: "right" }],
    ["Luka Abrus", "general", "ru", { text: "Luka Abrus", align: "left" }],
    ["=SUM(C4:C11)", "general", "ru", { text: "=СУММ(C4:C11)", align: "left" }], // FORMULATEXT
    [true, "general", "ru", { text: "ИСТИНА", align: "center" }],
    [null, "usd", "ru", { text: "", align: "left" }],
  ] as const)("%j (%s, %s)", (value, fmt, locale, expected) => {
    expect(formatValue(value, fmt, locale)).toEqual(expected);
  });

  it("группирует разряды по-русски", () => {
    expect(formatValue(1320, "usd", "ru").text).toMatch(/^1\s320,00$/u);
    expect(formatValue(174720, "kzt", "ru").text).toMatch(/^174\s720 ₸$/u);
  });

  it("показывает ошибки на языке ученика", () => {
    expect(formatValue(new ExcelError("#DIV/0!"), "usd", "ru")).toEqual({ text: "#ДЕЛ/0!", align: "center" });
  });
});

describe("renderPlaceholders", () => {
  it("подставляет функции и формулы", () => {
    const text = "Функция <code>{fn:SUM}</code>: <code>{f:=SUM(B3:D3)}</code>";

    expect(renderPlaceholders(text, "ru")).toBe("Функция <code>СУММ</code>: <code>=СУММ(B3:D3)</code>");
    expect(renderPlaceholders(text, "en")).toBe("Функция <code>SUM</code>: <code>=SUM(B3:D3)</code>");
  });

  it("экранирует формулу для HTML", () => {
    expect(renderPlaceholders("{f:=IF(A1<5,1,2)}", "ru")).toBe("=ЕСЛИ(A1&lt;5;1;2)");
  });

  it("оставляет остальной текст как есть", () => {
    expect(renderPlaceholders("Нажмите <kbd>Enter</kbd>", "ru")).toBe("Нажмите <kbd>Enter</kbd>");
  });
});

describe("число не влезает в ячейку — как в Excel", () => {
  // Для теста: помещается не больше n символов (в плеере решает измерение шрифтом)
  const upTo = (n: number) => (d: { text: string; currency?: string }) => d.text.length + (d.currency ? 2 : 0) <= n;

  it("финансовый формат: решётки вместо числа", () => {
    expect(formatValue(105560, "usd", "ru", upTo(8))).toEqual({ text: "########", align: "right" });
    expect(formatValue(490, "usd", "ru", upTo(8)).text).toBe("490,00");
  });

  it("общий формат: сокращается дробная часть", () => {
    expect(formatValue(18.637547374804686, "general", "ru", upTo(9)).text).toBe("18,637547");
    expect(formatValue(Math.sqrt(0.5), "general", "en", upTo(5)).text).toBe("0.707");
  });

  it("целое, не влезающее даже без дробей, — решётки", () => {
    expect(formatValue(123456789, "general", "ru", upTo(5)).text).toBe("#####");
  });

  it("без проверки ширины и для текста — как есть", () => {
    expect(formatValue(105560, "usd", "ru").text).toMatch(/^105\s560,00$/u);
    expect(formatValue("Square Root of Improvement", "general", "en", upTo(5)).text).toBe("Square Root of Improvement");
  });
});

describe("даты", () => {
  it("серийный номер Excel → дата на языке ученика", () => {
    expect(formatValue(45778, "date", "ru").text).toBe("01.05.2025");
    expect(formatValue(45778, "date", "en").text).toBe("5/1/2025");
    expect(formatValue(45658, "date", "ru").text).toBe("01.01.2025");
  });
});
