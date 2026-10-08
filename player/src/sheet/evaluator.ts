import FormulaParser, { type CellRef, type FunctionArg, type RangeRef } from "fast-formula-parser";

import { cellName } from "./address";

/** Ошибка Excel (#DIV/0!, #REF!, #NAME? …) — отдельный тип, чтобы не путать с текстом. */
export class ExcelError {
  constructor(readonly code: string) {}

  toString(): string {
    return this.code;
  }
}

export type CellValue = number | string | boolean | null | ExcelError;

export interface CellSource {
  /** Значение ячейки (для формул — уже вычисленное). */
  value(addr: string): CellValue;
  /** Текст формулы ячейки или null. */
  formula(addr: string): string | null;
}

// Функции, которым нужна ссылка, а не значение аргумента. В fast-formula-parser нет публичной настройки
// для этого — дописываем в funsPreserveRef (проверено на 1.0.19, версия закреплена; см. evaluator.test.ts).
const PRESERVE_REF = ["FORMULATEXT"];

const { FormulaError } = FormulaParser;
const PARSER_ERRORS = new Map(
  [FormulaError.DIV0, FormulaError.NA, FormulaError.NAME, FormulaError.NULL, FormulaError.NUM, FormulaError.REF, FormulaError.VALUE].map(
    (e) => [e.error, e],
  ),
);

// Ошибка в ячейке должна распространяться дальше (=A1+1 при A1 = #DIV/0! → #DIV/0!), а не читаться как текст.
function toParserValue(value: CellValue): unknown {
  if (value instanceof ExcelError) return PARSER_ERRORS.get(value.code) ?? FormulaError.VALUE;
  return value;
}

function fromParserResult(result: unknown): CellValue {
  if (Array.isArray(result)) return fromParserResult(result[0]?.[0] ?? null);
  if (result === undefined || result === null) return 0;
  if (result instanceof ExcelError) return result;
  if (typeof result === "object" && "error" in result) return new ExcelError(String(result.error));
  if (typeof result === "number" || typeof result === "string" || typeof result === "boolean") return result;
  return new ExcelError("#VALUE!");
}

export function createEvaluator(source: CellSource) {
  const parser = new FormulaParser({
    onCell: (ref: CellRef) => toParserValue(source.value(cellName(ref))),
    onRange: (ref: RangeRef) => {
      const rows: unknown[][] = [];
      for (let row = ref.from.row; row <= ref.to.row; row++) {
        const line: unknown[] = [];
        for (let col = ref.from.col; col <= ref.to.col; col++) line.push(toParserValue(source.value(cellName({ row, col }))));
        rows.push(line);
      }
      return rows;
    },
    functions: {
      // Ошибку из функции возвращаем в виде FormulaError парсера: прочие объекты он превращает в #VALUE!
      FORMULATEXT: (arg: FunctionArg) => {
        const ref = arg.ref;
        if (!ref || !("row" in ref)) return FormulaError.NA;
        return source.formula(cellName(ref)) ?? FormulaError.NA;
      },
    },
  });
  parser.funsPreserveRef.push(...PRESERVE_REF);

  /** formula — с ведущим «=»; at — адрес ячейки, где стоит формула (нужен ROW(), COLUMN()). */
  return function evaluate(formula: string, at: { row: number; col: number }): CellValue {
    try {
      const result = parser.parse(formula.replace(/^=/, ""), { sheet: "Sheet1", ...at });
      return fromParserResult(result);
    } catch (e) {
      if (e && typeof e === "object" && "error" in e) return new ExcelError(String(e.error));
      throw e;
    }
  };
}
