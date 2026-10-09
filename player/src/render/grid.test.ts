import { describe, expect, it } from "vitest";

import { SheetModel } from "../sheet/sheet-model";
import { formulaBarText, gridSize, GridView } from "./grid";
import { WindowView } from "./window";

function wages(): SheetModel {
  return new SheetModel({
    file: "Wagestemp.xlsx",
    name: "Wages",
    columns: { A: 30, B: 140 },
    rows: 6,
    cells: {
      B3: { v: "Employee", style: "head" },
      B4: "Luka Abrus",
      C4: 49,
      D4: { v: 10, fmt: "usd" },
      E4: { f: "=C4*D4", fmt: "usd" },
      F4: { f: "=FORMULATEXT(E4)" },
      C5: { f: "=SUM(C4:C4)" },
    },
  });
}

const texts = (els: Iterable<Element>) => [...els].map((e) => e.textContent);

describe("gridSize", () => {
  it("берёт число строк из урока, а колонки — по данным плюс одна", () => {
    expect(gridSize(wages())).toEqual({ cols: 7, rows: 6 });
  });

  it("без rows показывает заполненные строки плюс две", () => {
    expect(gridSize(new SheetModel({ cells: { C9: 1 } }))).toEqual({ cols: 4, rows: 11 });
  });
});

describe("GridView", () => {
  it("строит заголовки и ширины колонок", () => {
    const grid = new GridView(wages(), "ru");

    expect(texts(grid.table.querySelectorAll("th.xl-colh"))).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(grid.table.querySelectorAll("th.xl-rowh")).toHaveLength(6);
    const widths = [...grid.table.querySelectorAll("col")].map((c) => c.style.width);
    expect(widths.slice(0, 4)).toEqual(["40px", "30px", "140px", "64px"]);
    expect(grid.table.style.width).toBe(`${40 + 30 + 140 + 64 * 5}px`); // длинный текст не раздвигает колонки
  });

  it("отрисовывает значения, формат, стиль и выравнивание", () => {
    const grid = new GridView(wages(), "ru");

    expect(grid.cell("B3").className).toBe("xl-cell xl-left xl-head");
    expect(grid.cell("C4").textContent).toBe("49");
    expect(grid.cell("C4").classList).toContain("xl-right");
    expect(texts(grid.cell("E4").querySelectorAll(".xl-acc > span"))).toEqual(["$", "490,00"]);
    expect(grid.cell("F4").textContent).toBe("=C4*D4");
  });

  it("перерисовывает ячейку после изменения модели и при смене языка", () => {
    const sheet = wages();
    const grid = new GridView(sheet, "ru");

    sheet.setInput("F5", "=FORMULATEXT(C5)");
    grid.renderCell("F5");
    expect(grid.cell("F5").textContent).toBe("=СУММ(C4:C4)");

    grid.setLocale("en");
    expect(grid.cell("F5").textContent).toBe("=SUM(C4:C4)");
    expect(texts(grid.cell("E4").querySelectorAll(".xl-acc > span"))).toEqual(["$", "490.00"]);
  });

  it("подсвечивает заголовки выделенного диапазона", () => {
    const grid = new GridView(wages(), "ru");

    grid.highlightHeaders("C4:D5");

    expect(texts(grid.table.querySelectorAll("th.xl-hl"))).toEqual(["C", "D", "4", "5"]);
    grid.highlightHeaders(null);
    expect(grid.table.querySelectorAll("th.xl-hl")).toHaveLength(0);
  });

  it("сообщает об ячейке вне сетки", () => {
    expect(() => new GridView(wages(), "ru").cell("Z99")).toThrow("вне видимой сетки");
  });
});

describe("строка формул", () => {
  it.each([
    ["E4", "ru", "=C4*D4"],
    ["C5", "ru", "=СУММ(C4:C4)"],
    ["C5", "en", "=SUM(C4:C4)"],
    ["B4", "ru", "Luka Abrus"],
    ["A1", "ru", ""],
  ] as const)("%s (%s) → %s", (addr, locale, text) => {
    expect(formulaBarText(wages().get(addr), locale)).toBe(text);
  });

  it("показывает дробное число с запятой", () => {
    const sheet = new SheetModel({ cells: { A1: 449.625 } });
    expect(formulaBarText(sheet.get("A1"), "ru")).toBe("449,625");
  });
});

describe("WindowView", () => {
  it("собирает окно: файл, лист, поле «Имя», строка формул", () => {
    const sheet = wages();
    const view = new WindowView(sheet.book, "ru");

    view.showActive(sheet, "C5");

    expect(view.el.querySelector(".xl-title")?.textContent).toContain("Wagestemp.xlsx — Excel");
    expect(view.el.querySelector(".xl-sheets .xl-on")?.textContent).toBe("Wages");
    expect(view.nameBox.textContent).toBe("C5");
    expect(view.formulaText.textContent).toBe("=СУММ(C4:C4)");
    expect(view.ribbonButton("autosum").textContent).toContain("Автосумма");
  });
});
