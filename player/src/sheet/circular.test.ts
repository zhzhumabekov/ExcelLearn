import { describe, expect, it } from "vitest";

import { SheetModel } from "./sheet-model";
import { DEFAULT_ITERATION } from "./workbook";

// Глава 11: благотворительность 10% от прибыли после налогов (Circular.xlsx, рис. 11.2–11.4).
// Петля D6 → D7 → D8 → D6: пожертвование = 0,1 × после налогов; до налогов = доход − издержки − пожертвование;
// после налогов = (1 − ставка) × до налогов. Решение: пожертвование = 30 / 1,06 = 28,30.
function charity(): SheetModel {
  const sheet = new SheetModel({ cells: { D3: 1500, D4: 0.4, D5: 1000 } });
  sheet.setInput("D6", "=0.1*D8");
  sheet.setInput("D7", "=D3-D5-D6");
  sheet.setInput("D8", "=(1-D4)*D7");
  return sheet;
}

const DONATION = 30 / 1.06;

describe("циклические ссылки", () => {
  it("без итераций: ячейки петли — 0, в строке состояния — последняя введённая ячейка", () => {
    const sheet = charity();
    const book = sheet.book;

    expect(book.circularCells.sort()).toEqual(["Лист1!D6", "Лист1!D7", "Лист1!D8"]);
    expect(book.circularRef).toBe("Лист1!D8");
    expect(sheet.value("D6")).toBe(0);
    expect(sheet.value("D7")).toBe(0);
    expect(sheet.value("D8")).toBe(0);
    expect(book.isCircular("Лист1", "D3")).toBe(false);
  });

  it("итеративные вычисления решают петлю: пожертвование 28,30", () => {
    const sheet = charity();
    sheet.book.setIteration({ ...DEFAULT_ITERATION, enabled: true });

    expect(sheet.value("D6")).toBeCloseTo(DONATION, 3);
    expect(sheet.value("D7")).toBeCloseTo(500 - DONATION, 3);
    expect(sheet.value("D8")).toBeCloseTo(0.6 * (500 - DONATION), 3);
    expect(sheet.book.circularRef).toBeNull(); // с итерациями Excel о петле не сообщает
  });

  it("меньшая погрешность — точнее; одна итерация — ещё не ответ", () => {
    const sheet = charity();
    sheet.book.setIteration({ enabled: true, maxIterations: 100, maxChange: 0.000001 });
    expect(Math.abs((sheet.value("D6") as number) - DONATION)).toBeLessThan(1e-6);

    sheet.book.setIteration({ enabled: true, maxIterations: 1, maxChange: 0.001 });
    expect(Math.abs((sheet.value("D6") as number) - DONATION)).toBeGreaterThan(0.01);
  });

  it("петля разорвана — ссылки больше нет", () => {
    const sheet = charity();
    sheet.setInput("D6", "=0.1*300");

    expect(sheet.book.circularCells).toEqual([]);
    expect(sheet.book.circularRef).toBeNull();
    expect(sheet.value("D8")).toBeCloseTo(0.6 * 470, 6);
  });

  it("=СРЗНАЧ(B:B) внутри столбца B: с итерациями — среднее остальных чисел", () => {
    const sheet = new SheetModel({ cells: { B1: 10, B2: 20, B3: 30 } });
    sheet.setInput("B5", "=AVERAGE(B:B)");
    expect(sheet.book.circularRef).toBe("Лист1!B5");

    sheet.book.setIteration({ enabled: true, maxIterations: 100, maxChange: 0.000001 });
    expect(sheet.value("B5")).toBeCloseTo(20, 4);
  });

  it("снимок книги хранит настройки итераций (перемотка ≡ анимация)", () => {
    const sheet = charity();
    const before = sheet.book.snapshot();
    sheet.book.setIteration({ ...DEFAULT_ITERATION, enabled: true });
    expect(sheet.value("D6")).toBeCloseTo(DONATION, 3);

    sheet.book.restore(before);

    expect(sheet.book.iteration.enabled).toBe(false);
    expect(sheet.value("D6")).toBe(0);
  });
});
