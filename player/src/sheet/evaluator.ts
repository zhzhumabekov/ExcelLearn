import FormulaParser, { type CellRef, type FunctionArg, type RangeRef } from "fast-formula-parser";

import { cellName, MAX_COL, MAX_ROW } from "./address";
import { dateFunctions } from "./dates";
import { FINANCE_FUNCTIONS } from "./finance";
import { LOGIC_FUNCTIONS } from "./logic";
import { installFormulajs, PARSER_ERRORS } from "./formulajs-bridge";
import { LOOKUP_FUNCTIONS } from "./lookup";
import { type TextLocale, textFunctions } from "./text-functions";
import { timeFunctions } from "./times";

/** Ошибка Excel (#DIV/0!, #REF!, #NAME? …) — отдельный тип, чтобы не путать с текстом. */
export class ExcelError {
  constructor(readonly code: string) {}

  toString(): string {
    return this.code;
  }
}

export type CellValue = number | string | boolean | null | ExcelError;

export interface CellSource {
  /** Значение ячейки (для формул — уже вычисленное). sheet — лист ссылки (Астана!E4), иначе текущий. */
  value(addr: string, sheet?: string): CellValue;
  /** Текст формулы ячейки или null. */
  formula(addr: string, sheet?: string): string | null;
  /** Заполненная часть листа — граница для ссылок на целые строки и столбцы (A:A, 12:12). */
  extent?(sheet?: string): { rows: number; cols: number };
  /** Язык книги — для ТЕКСТ (названия месяцев, разделители). По умолчанию русский. */
  locale?(): TextLocale;
  /** «Сегодня» для СЕГОДНЯ() — серийный номер даты. По умолчанию — настоящая дата. */
  today?(): number;
  /** «Сейчас» для ТДАТА() — серийный номер с долей суток. По умолчанию — настоящие дата и время. */
  now?(): number;
}

// Функции, которым нужна ссылка, а не значение аргумента. В fast-formula-parser нет публичной настройки
// для этого — дописываем в funsPreserveRef (проверено на 1.0.19, версия закреплена; см. sheet-model.test.ts).
const PRESERVE_REF = ["FORMULATEXT"];

const { FormulaError } = FormulaParser;

interface CellRefLike {
  row: number;
  col: number;
}

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

/** Настоящая сегодняшняя дата — серийный номер Excel. */
/** Настоящие дата и время: серийный номер с долей суток. */
export function realNow(): number {
  const now = new Date();
  return realToday() + (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86_400;
}

export function realToday(): number {
  const now = new Date();
  return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function createParser(source: CellSource): FormulaParser {
  const parser = new FormulaParser({
    onCell: (ref: CellRef) => toParserValue(source.value(cellName(ref), ref.sheet)),
    onRange: (ref: RangeRef) => {
      // Целый столбец (A:A) или строка (12:12) парсер разворачивает до 1 048 576 строк / 16 384 столбцов —
      // читаем только заполненную часть листа: за её краем пусто, а на результат пустые ячейки не влияют
      const extent = source.extent?.(ref.sheet) ?? { rows: 1, cols: 1 };
      const lastRow = ref.to.row === null || ref.to.row >= MAX_ROW ? extent.rows : ref.to.row;
      const lastCol = ref.to.col === null || ref.to.col >= MAX_COL ? extent.cols : ref.to.col;
      const rows: unknown[][] = [];
      for (let row = ref.from.row ?? 1; row <= lastRow; row++) {
        const line: unknown[] = [];
        for (let col = ref.from.col ?? 1; col <= lastCol; col++) {
          line.push(toParserValue(source.value(cellName({ row, col }), ref.sheet)));
        }
        rows.push(line);
      }
      return rows;
    },
    functions: {
      // Ошибку из функции возвращаем в виде FormulaError парсера: прочие объекты он превращает в #VALUE!
      FORMULATEXT: (arg: FunctionArg) => {
        const ref = arg.ref;
        if (!ref || !("row" in ref)) return FormulaError.NA;
        return source.formula(cellName(ref), ref.sheet) ?? FormulaError.NA;
      },
    },
  });
  parser.funsPreserveRef.push(...PRESERVE_REF);
  // ИНДЕКС по одной строке (B3:D3) с одним номером: в Excel это номер столбца, а у парсера — номер строки
  // (#ССЫЛКА!). Остальное — родная реализация: она возвращает ссылку, поэтому работает СУММ(ИНДЕКС(…;0;2)).
  const nativeIndex = parser.functions.INDEX;
  if (nativeIndex) {
    parser.functions.INDEX = (context: unknown, ranges: unknown, rowNum: unknown, colNum?: unknown, area?: unknown) => {
      const ref = (ranges as { ref?: { from?: CellRefLike; to?: CellRefLike } } | null)?.ref;
      const oneRow = ref?.from && ref.to && ref.from.row === ref.to.row && ref.from.col !== ref.to.col;
      return colNum == null && oneRow
        ? nativeIndex(context as never, ranges as never, 1 as never, rowNum as never)
        : nativeIndex(context as never, ranges as never, rowNum as never, colNum as never, area as never);
    };
  }
  // ВПР/ГПР/ПОИСКПОЗ — свои, с двоичным поиском Excel (см. lookup.ts); formulajs их не перекрывает
  Object.assign(parser.functions, LOOKUP_FUNCTIONS);
  installFormulajs(parser, [...PRESERVE_REF, ...Object.keys(LOOKUP_FUNCTIONS)]);
  // Текстовые функции, где formulajs расходится с Excel, и ТЕКСТ — свои (text-functions.ts)
  Object.assign(parser.functions, textFunctions(() => source.locale?.() ?? "ru"));
  // ЧПС и ЧИСТНЗ — свои (finance.ts): пустые ячейки — как в Excel
  Object.assign(parser.functions, FINANCE_FUNCTIONS);
  // ВЫБОР и АГРЕГАТ — свои (logic.ts): ВЫБОР отдаёт диапазон в СУММ, АГРЕГАТ пропускает ошибки
  Object.assign(parser.functions, LOGIC_FUNCTIONS);
  // Даты — свои (dates.ts): 29.02.1900, строка выходных РАБДЕНЬ.МЕЖД, «04.01.2003» в ДАТАЗНАЧ
  Object.assign(
    parser.functions,
    dateFunctions(
      () => source.today?.() ?? realToday(),
      () => source.locale?.() ?? "ru",
    ),
  );
  // Время — своё (times.ts): ВРЕМЯ, ВРЕМЗНАЧ, ЧАС, МИНУТЫ, СЕКУНДЫ, ТДАТА без часового пояса браузера
  Object.assign(
    parser.functions,
    timeFunctions(
      () => source.now?.() ?? realNow(),
      () => source.locale?.() ?? "ru",
    ),
  );
  return parser;
}

// fast-formula-parser 1.0.19 не разбирает $13:$13 и считает $A:$A с неверным номером столбца.
// Для целых строк и столбцов $ ничего не меняет при вычислении — убираем его перед разбором (вне строк в кавычках).
const WHOLE_COLS_RE = /(?<![\p{L}\p{N}_$])\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})(?![\p{L}\p{N}_(])/gu;
const WHOLE_ROWS_RE = /(?<![\p{L}\p{N}_.$:])\$?([0-9]+):\$?([0-9]+)(?![\p{L}\p{N}_.])/gu;

export function withoutDollarInWholeRanges(formula: string): string {
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(WHOLE_COLS_RE, "$1:$2").replace(WHOLE_ROWS_RE, "$1:$2")))
    .join("");
}

export function createEvaluator(source: CellSource) {
  // fast-formula-parser не допускает повторного входа: если при разборе формулы нужно значение
  // другой формулы (onCell → вычисление), вложенный разбор на том же экземпляре даёт #ERROR!.
  // Поэтому на каждый уровень вложенности — свой экземпляр парсера.
  const parsers: FormulaParser[] = [];
  let depth = 0;

  /** formula — с ведущим «=»; at — ячейка формулы (нужна ROW(), COLUMN()) и её лист. */
  return function evaluate(formula: string, at: { row: number; col: number; sheet?: string }): CellValue {
    const parser = (parsers[depth] ??= createParser(source));
    depth++;
    try {
      const text = withoutDollarInWholeRanges(formula.replace(/^=/, ""));
      const result = parser.parse(text, { ...at, sheet: at.sheet ?? "Sheet1" });
      return fromParserResult(result);
    } catch (e) {
      if (e && typeof e === "object" && "error" in e) return new ExcelError(String(e.error));
      throw e;
    } finally {
      depth--;
    }
  };
}
