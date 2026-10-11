import { describe, expect, it } from "vitest";

import { formatDate, formatLongDate, localizeFormula } from "../locale/format";
import { localizeDateText, parseDateText, serialToYmd, ymdToSerial } from "./dates";
import { SheetModel } from "./sheet-model";

// Глава 7: значения — из книги (Dates.xlsx, Datedif.xlsx) и посчитаны отдельно на Python.

describe("серийный номер даты", () => {
  it.each([
    [1, "01.01.1900"],
    [3, "03.01.1900"], // книга: 3 января 1900 г. — число 3
    [59, "28.02.1900"],
    [60, "29.02.1900"], // ошибка Lotus: Excel считает 1900 год високосным
    [61, "01.03.1900"],
    [4526, "22.05.1912"],
    [37625, "04.01.2003"],
    [45000, "15.03.2023"],
  ])("%i → %s", (serial, text) => {
    expect(formatDate(serial, "ru")).toBe(text);
  });

  it("ДАТА переносит лишние месяцы и дни, год 0–1899 — с 1900", () => {
    expect(ymdToSerial(2005, 13, 1)).toBe(38718); // 01.01.2006 — подсказка книги
    expect(ymdToSerial(2020, 1, 0)).toBe(43830); // 31.12.2019
    expect(ymdToSerial(1900, 1, 1)).toBe(1);
    expect(ymdToSerial(103, 1, 4)).toBe(37625); // ДАТА(103;1;4) = 04.01.2003
    expect(serialToYmd(60)).toEqual({ year: 1900, month: 2, day: 29 });
  });

  it("длинный формат даты — системный формат Windows", () => {
    expect(formatLongDate(37625, "ru")).toBe("4 января 2003 г.");
    expect(formatLongDate(37625, "en")).toBe("Saturday, January 4, 2003");
  });
});

describe("набранная дата", () => {
  it.each([
    ["04.01.2003", 37625],
    ["4.1.2003", 37625],
    ["4.1.03", 37625],
    ["4 янв 2004", 37990],
    ["4-янв-2004", 37990],
    ["2003-01-04", 37625],
    ["1.1.29", 47119], // 00–29 — XXI век: 2029 год
    ["1.1.30", 10959], // 30–99 — XX век: 1930 год
  ])("%s → %i", (text, serial) => {
    expect(parseDateText(text)).toBe(serial);
  });

  it("не дата — null: дробь, 31 февраля, текст", () => {
    expect(parseDateText("1.5")).toBeNull();
    expect(parseDateText("31.02.2003")).toBeNull();
    expect(parseDateText("Астана")).toBeNull();
  });

  it("в русском Excel «1/4/2003» — 1 апреля, в английском — 4 января", () => {
    expect(parseDateText("1/4/2003", "ru")).toBe(37712);
    expect(parseDateText("1/4/2003", "en")).toBe(37625);
  });

  it("на языке ученика: набор и аргумент ДАТАЗНАЧ", () => {
    expect(localizeDateText("04.01.2003", "en")).toBe("1/4/2003");
    expect(localizeDateText("4 янв 2004", "en")).toBe("4 Jan 2004");
    expect(localizeFormula("04.01.2003", "ru")).toBe("04.01.2003");
    expect(localizeFormula('=DATEVALUE("04.01.2003")', "en")).toBe('=DATEVALUE("1/4/2003")');
    expect(localizeFormula('=DATEVALUE("04.01.2003")', "ru")).toBe('=ДАТАЗНАЧ("04.01.2003")');
    expect(localizeFormula("1.5", "ru")).toBe("1,5");
  });

  it("набранная дата становится числом с форматом даты", () => {
    const sheet = new SheetModel({ cells: {} });
    sheet.setInput("A1", "04.01.2003");
    expect(sheet.get("A1")).toMatchObject({ input: 37625, value: 37625, fmt: "date" });
    sheet.setInput("A2", "1.5");
    expect(sheet.get("A2")).toMatchObject({ value: 1.5, fmt: "general" });
  });
});

describe("функции дат", () => {
  // Лист как date format в Dates.xlsx: 03.01.2003, 04.08.2003, праздники 20.01.2003 и 04.07.2003
  const sheet = new SheetModel({
    cells: {
      A1: { v: "2003-01-03", fmt: "date" },
      A2: { v: "2003-08-04", fmt: "date" },
      A3: { v: "2011-03-14", fmt: "date" },
      A4: { v: "2012-08-16", fmt: "date" },
      A5: { v: "2016-10-15", fmt: "date" },
      A6: { v: "2018-04-10", fmt: "date" },
      A7: "04.01.2003",
      F1: { v: "2003-01-20", fmt: "date" },
      F2: { v: "2003-07-04", fmt: "date" },
    },
  });
  sheet.book.setToday(46307); // 12.10.2026

  it.each([
    ["=WORKDAY(A1,50)", 37694], // 14.03.2003
    ["=WORKDAY(A1,50,F1:F2)", 37697], // 17.03.2003
    ["=WORKDAY(A1,-5)", 37617],
    ["=NETWORKDAYS(A1,A2)", 152],
    ["=NETWORKDAYS(A1,A2,F1:F2)", 150],
    ["=NETWORKDAYS(A2,A1)", -152],
    ["=WORKDAY.INTL(A3,100,2)", 40754],
    ["=WORKDAY.INTL(A3,100,\"1000001\")", 40754],
    ["=WORKDAY.INTL(A3,100,11)", 40732],
    ["=WORKDAY.INTL(A3,100,\"0000001\")", 40732],
    ["=NETWORKDAYS.INTL(A3,A4,2)", 373],
    ["=NETWORKDAYS.INTL(A3,A4,\"1000001\")", 373],
    ["=DATEDIF(A5,A6,\"y\")", 1],
    ["=DATEDIF(A5,A6,\"m\")", 17],
    ["=DATEDIF(A5,A6,\"d\")", 542],
    ["=DATEDIF(A5,A6,\"ym\")", 5],
    ["=DATEDIF(A5,A6,\"md\")", 26],
    ["=YEAR(A7)", 2003], // текст-дата годится как аргумент
    ["=MONTH(A1)+DAY(A1)", 4],
    ["=WEEKDAY(A1)", 6], // пятница: 1 — воскресенье
    ["=WEEKDAY(A1,2)", 5], // 1 — понедельник
    ["=WEEKDAY(A1,3)", 4], // 0 — понедельник
    ["=DATE(2005,13,1)", 38718],
    ["=DATEVALUE(\"04.01.2003\")", 37625],
    ["=DATEVALUE(\"2003-01-04\")", 37625],
    ["=EOMONTH(A1,0)", 37652],
    ["=EDATE(DATE(2003,1,31),1)", 37680], // 28.02.2003
    ["=TODAY()", 46307],
    ["=DAY(60)", 29],
  ])("%s → %j", (formula, expected) => {
    sheet.setInput("Z1", formula);
    expect(sheet.value("Z1")).toBe(expected);
  });

  it.each([
    ["=DATEDIF(A6,A5,\"y\")", "#NUM!"], // начальная дата позже конечной
    ["=WORKDAY.INTL(A3,1,\"1111111\")", "#VALUE!"], // нет ни одного рабочего дня
    ["=WORKDAY.INTL(A3,1,8)", "#NUM!"],
    ["=DATEVALUE(\"Астана\")", "#VALUE!"],
  ])("%s → %s", (formula, code) => {
    sheet.setInput("Z1", formula);
    expect(String(sheet.value("Z1"))).toBe(code);
  });
});

describe("показ даты", () => {
  it("ноль — «00.01.1900», отрицательная дата — решётки во всю ячейку", async () => {
    const { formatValue } = await import("../locale/format");
    expect(formatValue(0, "date", "ru").text).toBe("00.01.1900");
    expect(formatValue(-7, "date", "ru").text).toMatch(/^#+$/);
    const narrow = formatValue(-7, "date", "ru", (d) => d.text.length <= 6);
    expect(narrow.text).toBe("######");
  });
});
