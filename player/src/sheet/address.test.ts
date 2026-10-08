import { describe, expect, it } from "vitest";

import {
  cellName,
  cellsInRange,
  colToLetters,
  lettersToCol,
  offsetCell,
  parseCell,
  parseRange,
  rangeName,
  shiftFormula,
} from "./address";

describe("адреса", () => {
  it.each([
    ["A", 1],
    ["Z", 26],
    ["AA", 27],
    ["AZ", 52],
    ["XFD", 16384],
  ])("%s ↔ %i", (letters, col) => {
    expect(lettersToCol(letters)).toBe(col);
    expect(colToLetters(col)).toBe(letters);
  });

  it("разбирает и собирает адрес ячейки", () => {
    expect(parseCell("E14")).toEqual({ col: 5, row: 14 });
    expect(cellName({ col: 5, row: 14 })).toBe("E14");
    expect(() => parseCell("e4")).toThrow("Некорректный адрес");
  });

  it("нормализует диапазон и перечисляет ячейки построчно", () => {
    expect(rangeName(parseRange("D3:B2"))).toBe("B2:D3");
    expect(rangeName(parseRange("C5"))).toBe("C5");
    expect(cellsInRange("B2:C3")).toEqual(["B2", "C2", "B3", "C3"]);
  });

  it("сдвигает адрес ячейки", () => {
    expect(offsetCell("E4", 7, 0)).toBe("E11");
  });
});

describe("shiftFormula", () => {
  it.each([
    // формула, dRow, dCol, результат
    ["=C4*D4", 1, 0, "=C5*D5"],
    ["=SUM(B2:D2)", 3, 0, "=SUM(B5:D5)"],
    ["=SUM(B6:B9)", 0, 3, "=SUM(E6:E9)"],
    ["=E$12*E14", 5, 2, "=G$12*G19"], // строка 12 заблокирована (книга, рис. 1.4)
    ["=$C$4*C8", 9, 0, "=$C$4*C17"],
    ["=($B$5-$B$4*F$9)*(F$9-$E10)", 3, 6, "=($B$5-$B$4*L$9)*(L$9-$E13)"], // кофейня, рис. 1.7
    ["=LOG10(A1)", 1, 0, "=LOG10(A2)"], // LOG10 — функция, а не ячейка
    ['="A1"&A1', 1, 0, '="A1"&A2'], // текст в кавычках не трогаем
    ["=A1", -1, 0, "=#REF!"],
    ["=FORMULATEXT(E4)", 7, 1, "=FORMULATEXT(F11)"],
  ])("%s сдвиг (%i, %i) → %s", (formula, dRow, dCol, expected) => {
    expect(shiftFormula(formula, dRow, dCol)).toBe(expected);
  });
});
