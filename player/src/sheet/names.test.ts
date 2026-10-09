import { describe, expect, it } from "vitest";

import { ExcelError } from "./evaluator";
import { absoluteRef, applyNames, type NameDef, nameFromLabel, nameProblem, refersToText } from "./names";
import { SheetModel } from "./sheet-model";
import { NameError, Workbook } from "./workbook";

const def = (name: string, ref: string, extra: Partial<NameDef> = {}): NameDef => ({
  name,
  areas: ref.split(",").map((r) => ({ sheet: "Лист1", ref: r })),
  scope: null,
  ...extra,
});

function book(...sheets: { name?: string; cells: Record<string, string | number> }[]) {
  const wb = new Workbook();
  const models = sheets.map((s) => new SheetModel({ name: s.name ?? "Лист1", cells: s.cells }, wb));
  return { wb, sheet: models[0] as SheetModel, models };
}

describe("допустимые имена (замечания главы 2)", () => {
  it.each(["A4", "CAT1", "xfd10", "3Q", "r", "C", "с пробелом", "минус-знак", ""])("%s — недопустимо", (name) => {
    expect(nameProblem(name)).toBe("Введено недопустимое имя.");
  });

  it.each(["cat1_", "Акции", "предыдущий_год", "data.2025", "_2024", "AZ", "range1"])("%s — можно", (name) => {
    expect(nameProblem(name)).toBeNull();
  });

  it("Создать из выделенного: пробелы и знаки → «_», цифра в начале → «_», похоже на ячейку → «_» в конце", () => {
    expect(nameFromLabel("Product 1")).toBe("Product_1");
    expect(nameFromLabel("Северо-Казахстанская область")).toBe("Северо_Казахстанская_область");
    expect(nameFromLabel("2024")).toBe("_2024");
    expect(nameFromLabel("A4")).toBe("A4_");
    expect(nameFromLabel("  ")).toBeNull();
  });

  it("абсолютные ссылки и текст «Диапазон»", () => {
    expect(["B6", "B2:B89", "12:12", "A:A", "$C$4"].map(absoluteRef)).toEqual([
      "$B$6",
      "$B$2:$B$89",
      "$12:$12",
      "$A:$A",
      "$C$4",
    ]);
    expect(refersToText(def("выборка", "$B$3:$C$4,$E$6:$G$7"), ";")).toBe("=Лист1!$B$3:$C$4;Лист1!$E$6:$G$7");
    expect(refersToText({ ...def("x", "$A$1"), areas: [{ sheet: "Запас рыбы", ref: "$A$1" }] })).toBe(
      "='Запас рыбы'!$A$1",
    );
  });
});

describe("имена в формулах", () => {
  it("имя ячейки вместо адреса, без учёта регистра: =Алматы+Астана", () => {
    const { wb, sheet } = book({ cells: { F3: 420, F4: 380, A1: "=Алматы+астана" } });
    wb.defineName(def("Алматы", "$F$3"));
    wb.defineName(def("Астана", "$F$4"));
    expect(sheet.value("A1")).toBe(800);
  });

  it("имя диапазона в функции: =СРЗНАЧ(данные)", () => {
    const { wb, sheet } = book({ cells: { A1: 1, A2: 2, B1: 3, B2: 6, D1: "=AVERAGE(данные)" } });
    wb.defineName(def("данные", "$A$1:$B$2"));
    expect(sheet.value("D1")).toBe(3);
  });

  it("несмежный диапазон (выделение с Ctrl): СРЗНАЧ по всем частям", () => {
    const { wb, sheet } = book({
      cells: { B3: 1, C3: 2, B4: 3, C4: 4, E6: 5, F6: 6, G6: 7, E7: 8, F7: 9, G7: 10, E11: "=AVERAGE(выборка)" },
    });
    wb.defineName(def("выборка", "$B3:$C$4,$E$6:$G$7"));
    expect(sheet.value("E11")).toBe(5.5);
  });

  it("неизвестное имя — #ИМЯ?", () => {
    const { sheet } = book({ cells: { A1: "=SUM(нет_такого)", A2: "=прибыль*2" } });
    expect(sheet.value("A1")).toEqual(new ExcelError("#NAME?"));
    expect(sheet.value("A2")).toEqual(new ExcelError("#NAME?"));
  });

  it("имена строк и неявное пересечение: =почасовая_оплата*часы в каждом столбце", () => {
    const { wb, sheet } = book({
      cells: { F12: 1500, G12: 1500, H12: 2000, F13: 8, G13: 6, H13: 10, F14: "=почасовая_оплата*часы", H14: "=почасовая_оплата*часы" },
    });
    wb.defineName(def("почасовая_оплата", "$12:$12"));
    wb.defineName(def("часы", "$13:$13"));
    expect([sheet.value("F14"), sheet.value("H14")]).toEqual([12000, 20000]);
  });

  it("имя целой строки в функции — вся строка: =SUM(часы)", () => {
    const { wb, sheet } = book({ cells: { F13: 8, G13: 6, A20: "=SUM(часы)" } });
    wb.defineName(def("часы", "$13:$13"));
    expect(sheet.value("A20")).toBe(14);
  });

  it("относительное имя «предыдущий_год» — всегда ячейка строкой выше", () => {
    const { wb, sheet } = book({
      cells: { B3: 0.1, B6: 300, B7: "=предыдущий_год*(1+прирост)", B8: "=предыдущий_год*(1+прирост)" },
    });
    wb.defineName(def("прирост", "$B$3"));
    wb.defineName({ ...def("предыдущий_год", "B6"), base: { sheet: "Лист1", cell: "B7" } });
    expect(sheet.value("B7")).toBeCloseTo(330);
    expect(sheet.value("B8")).toBeCloseTo(363);
  });

  it("целый столбец: =СРЗНАЧ(A:A) — все числа столбца, текст пропускается", () => {
    const { sheet } = book({
      cells: { A1: "Продажи", A2: 10, A3: 20, A4: 60, B2: 30, C1: "=AVERAGE(A:A)", C6: "=AVERAGE(2:2)", C7: "=SUM($A:$A)" },
    });
    expect(sheet.value("C1")).toBe(30);
    expect(sheet.value("C6")).toBe(20); // строка 2: A2 и B2
    expect(sheet.value("C7")).toBe(90); // $ у целого столбца не мешает
  });

  it("область «книга» и «лист»; Лист2!jam с другого листа; на листе без имени — #ИМЯ?", () => {
    const { wb, models } = book(
      { name: "Лист1", cells: { E4: 4, E5: 5, E6: 6, A1: "=SUM(jam)" } },
      { name: "Лист2", cells: { E4: 3, E5: 4, E6: 5, A1: "=SUM(jam)" } },
      { name: "Лист3", cells: { E4: 1, E5: 2, E6: 4, A1: "=SUM(jam)", A2: "=SUM(Лист2!jam)", A3: "=SUM(sales)" } },
    );
    const [s1, s2, s3] = models as [SheetModel, SheetModel, SheetModel];
    wb.defineName({ name: "sales", areas: [{ sheet: "Лист3", ref: "$E$4:$E$6" }], scope: null });
    wb.defineName({ name: "jam", areas: [{ sheet: "Лист1", ref: "$E$4:$E$6" }], scope: "Лист1" });
    wb.defineName({ name: "jam", areas: [{ sheet: "Лист2", ref: "$E$4:$E$6" }], scope: "Лист2" });

    expect([s1.value("A1"), s2.value("A1")]).toEqual([15, 12]);
    expect(s3.value("A1")).toEqual(new ExcelError("#NAME?"));
    expect(s3.value("A2")).toBe(12);
    expect(s3.value("A3")).toBe(7);
    s1.setInput("A2", "=SUM(sales)");
    expect(s1.value("A2")).toBe(7); // имя книги видно с любого листа
  });

  it("ссылка на другой лист по адресу: =Астана!B2*2", () => {
    const { models } = book({ name: "Свод", cells: { A1: "=Астана!B2*2" } }, { name: "Астана", cells: { B2: 21 } });
    expect(models[0]?.value("A1")).toBe(42);
  });

  it("недопустимое имя не создаётся — NameError с текстом Excel", () => {
    const { wb } = book({ cells: {} });
    expect(() => wb.defineName(def("A4", "$B$1"))).toThrow(NameError);
    expect(() => wb.defineName(def("A4", "$B$1"))).toThrow("Введено недопустимое имя.");
    expect(wb.names).toEqual([]);
  });

  it("повторное имя заменяет прежнее; удаление; снимок и откат", () => {
    const { wb, sheet } = book({ cells: { A1: 5, A2: 7, B1: "=x*2" } });
    wb.defineName(def("x", "$A$1"));
    const snapshot = wb.snapshot();
    wb.defineName(def("X", "$A$2"));
    expect(wb.names.map((n) => n.name)).toEqual(["X"]);
    expect(sheet.value("B1")).toBe(14);
    wb.deleteName("x", null);
    expect(sheet.value("B1")).toEqual(new ExcelError("#NAME?"));
    wb.restore(snapshot);
    expect(sheet.value("B1")).toBe(10);
  });
});

describe("Применить имена", () => {
  const names = [def("цена", "$F$3"), def("потребность", "$F$4"), def("себестоимость", "$F$5"), def("затраты", "$F$6")];

  it("ссылки, совпадающие с именами, заменяются (с $ и без)", () => {
    expect(applyNames("=10000-300*F3", "Лист1", names)).toBe("=10000-300*цена");
    expect(applyNames("=F4*($F$3-F5)-F6", "Лист1", names)).toBe("=потребность*(цена-себестоимость)-затраты");
  });

  it("другие ссылки, строки и чужие листы не трогает", () => {
    expect(applyNames('=F30+"F3"+Лист2!F3', "Лист1", names)).toBe('=F30+"F3"+Лист2!F3');
  });
});
