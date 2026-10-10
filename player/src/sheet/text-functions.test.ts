import { describe, expect, it } from "vitest";

import { localizeFormula } from "../locale/format";
import { parseInput, SheetModel } from "./sheet-model";
import { formatText, proper } from "./text-functions";

// Глава 6: текстовые функции ведут себя как в Excel, а не как в formulajs
describe("текстовые функции", () => {
  const sheet = new SheetModel({
    cells: {
      A1: "Reggie   Miller",
      A2: "\n33", // перевод строки СИМВОЛ(10) перед числом
      A3: " 33", // неразрывный пробел СИМВОЛ(160)
      A4: " 33 ",
      B1: "a",
      D1: "c",
      E1: 32430, // 14.10.1988, пятница
    },
  });
  const value = (formula: string) => {
    sheet.setInput("Z1", formula);
    const v = sheet.value("Z1");
    return v !== null && typeof v === "object" ? v.code : v;
  };

  it.each([
    ["=LEFT(A1,4)", "Regg"],
    ["=RIGHT(A1,4)", "ller"],
    ["=MID(A1,2,5)", "eggie"],
    ["=TRIM(A1)", "Reggie Miller"],
    ["=LEN(A1)-LEN(TRIM(A1))", 2],
    ['=FIND("r",A1)', 15], // регистр учитывается
    ['=SEARCH("r",A1)', 1], // не учитывается
    ['=SEARCH("m*r",A1)', 10], // подстановочный знак
    ['=SEARCH("z",A1)', "#VALUE!"],
    ['=LEFT("abc",-1)', "#VALUE!"],
    ['=REPLACE(A1,3,2,"nn")', "Rennie   Miller"],
    ['=REPT("|",3)', "|||"],
    ['=TEXTJOIN(" ",TRUE,B1:D1)', "a c"],
    ['=TEXTJOIN(" ",FALSE,B1:D1)', "a  c"],
    ['=SUBSTITUTE("I LOVE EXCEL 2019!"," ","*",3)', "I LOVE EXCEL*2019!"],
  ])("%s → %j", (formula, expected) => {
    expect(value(formula)).toBe(expected);
  });

  it("ЗНАЧЕН не принимает невидимые символы, ПЕЧСИМВ убирает СИМВОЛ(10), но не СИМВОЛ(160)", () => {
    expect(value("=VALUE(A4)")).toBe(33); // обычные пробелы по краям — можно
    expect(value("=VALUE(A2)")).toBe("#VALUE!");
    expect(value("=VALUE(CLEAN(A2))")).toBe(33);
    expect(value("=VALUE(A3)")).toBe("#VALUE!");
    expect(value("=VALUE(CLEAN(A3))")).toBe("#VALUE!");
    expect(value("=FIND(CHAR(160),A3)")).toBe(1);
    expect(value('=VALUE(SUBSTITUTE(A3,CHAR(160),""))')).toBe(33);
    expect(value("=TRIM(A3)")).toBe(" 33"); // СЖПРОБЕЛЫ не трогает неразрывный пробел
  });

  it("ПРОПНАЧ: заглавная после любой не-буквы, в том числе в кириллице", () => {
    expect(proper("иван петров-водкин")).toBe("Иван Петров-Водкин");
    expect(proper("o'neil 2nd")).toBe("O'Neil 2Nd");
    expect(proper("ҚАЗАҚСТАН")).toBe("Қазақстан");
  });

  it("ТЕКСТ: даты и числа на языке книги", () => {
    expect(formatText(32430, "dd.mm.yyyy", "ru")).toBe("14.10.1988");
    expect(formatText(32430, "mm/dd/yyyy", "en")).toBe("10/14/1988");
    expect([formatText(32430, "mmmm", "ru"), formatText(32430, "mmm", "ru")]).toEqual(["Октябрь", "окт"]);
    expect([formatText(32430, "dddd", "ru"), formatText(32430, "ddd", "en")]).toEqual(["пятница", "Fri"]);
    expect(formatText(1234567.891, "#,##0", "ru")).toBe("1 234 568");
    expect(formatText(1234567.891, "#,##0.00", "en")).toBe("1,234,567.89");
    expect(formatText(328.214, "0.00", "ru")).toBe("328,21");
    expect(formatText(0.256, "0%", "ru")).toBe("26%");
    expect(formatText(5, '0 "₸"', "ru")).toBe("5 ₸");
    expect(formatText("abc", "0", "ru")).toBe("abc");
  });

  it("ТЕКСТ зависит от языка книги", () => {
    sheet.setInput("Z2", '=TEXT(E1,"mmmm")');
    expect(sheet.value("Z2")).toBe("Октябрь");
    sheet.book.setLocale("en");
    expect(sheet.value("Z2")).toBe("October");
    sheet.book.setLocale("ru");
  });

  it("набранное число с невидимым символом или апострофом остаётся текстом", () => {
    expect(parseInput(" 33 ")).toBe(33);
    expect(parseInput(" 33")).toBe(" 33");
    expect(parseInput("\n33")).toBe("\n33");
    expect(parseInput("50+200+400")).toBe("50+200+400");
    sheet.setInput("Z3", "'31");
    expect(sheet.value("Z3")).toBe("31");
  });

  it("код формата ТЕКСТ показывается на языке Excel", () => {
    expect(localizeFormula('=TEXT(E1,"dd.mm.yyyy")', "ru")).toBe('=ТЕКСТ(E1;"ДД.ММ.ГГГГ")');
    expect(localizeFormula('=A1&" — "&TEXT(B1,"#,##0.00")', "ru")).toBe('=A1&" — "&ТЕКСТ(B1;"# ##0,00")');
    expect(localizeFormula('=TEXT(B1,"0.00")&"."', "ru")).toBe('=ТЕКСТ(B1;"0,00")&"."'); // другие строки — как есть
    expect(localizeFormula("=CLEAN(CHAR(160))&UNICHAR(1178)", "ru")).toBe("=ПЕЧСИМВ(СИМВОЛ(160))&ЮНИСИМВ(1178)");
  });
});
