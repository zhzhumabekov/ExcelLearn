import * as formulajs from "@formulajs/formulajs";
import FormulaParser, { type FunctionArg } from "fast-formula-parser";

const { FormulaError } = FormulaParser;

export const PARSER_ERRORS = new Map(
  [
    FormulaError.DIV0,
    FormulaError.NA,
    FormulaError.NAME,
    FormulaError.NULL,
    FormulaError.NUM,
    FormulaError.REF,
    FormulaError.VALUE,
  ].map((e) => [e.error, e]),
);

type Fn = (...args: unknown[]) => unknown;

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/** formulajs возвращает даты как Date (локальное время); в Excel дата — серийное число. */
function dateToSerial(date: Date): number {
  const utc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
  return (utc - EXCEL_EPOCH) / DAY_MS;
}

// ISERROR/IFERROR в formulajs сравнивают аргумент с её собственными объектами ошибок по ссылке,
// поэтому ошибки парсера (и внутри диапазонов) подменяются на них перед вызовом.
const FORMULAJS_ERRORS = new Map(Object.values(formulajs.utils.errors).map((e: Error) => [e.message, e]));

function toFormulajs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toFormulajs);
  if (value instanceof FormulaError) return FORMULAJS_ERRORS.get(value.error) ?? value;
  return value;
}

function toParser(result: unknown): unknown {
  if (result instanceof FormulaError) return result;
  if (result instanceof Error) return PARSER_ERRORS.get(result.message) ?? FormulaError.VALUE;
  if (result instanceof Date) return dateToSerial(result);
  return result;
}

/** Все функции formulajs, включая вложенные (BETA.DIST, CHISQ.TEST …), по имени Excel. */
export function formulajsFunctions(): Map<string, Fn> {
  const functions = new Map<string, Fn>();
  for (const [name, value] of Object.entries(formulajs)) {
    if (typeof value === "function") functions.set(name, value as Fn);
    else if (value && typeof value === "object") {
      for (const [sub, fn] of Object.entries(value)) {
        if (typeof fn === "function") functions.set(`${name}.${sub}`, fn as Fn);
      }
    }
  }
  return functions;
}

/**
 * Подключает formulajs к парсеру: парсер разбирает формулы и ссылки, а функции считает formulajs —
 * у fast-formula-parser 1.0.19 нет MAX, MATCH, PMT, NPV и др., а SUM пропускает ошибки в диапазоне.
 * Функции, которым парсер передаёт контекст или ссылки (IF, INDEX, ROW, SUMIF, ISBLANK …), и
 * перечисленные в keep остаются родными.
 */
export function installFormulajs(parser: FormulaParser, keep: readonly string[]): void {
  const native = new Set([
    ...parser.funsNeedContext,
    ...parser.funsNeedContextAndNoDataRetrieve,
    ...parser.funsPreserveRef,
    ...keep,
  ]);
  for (const [name, fn] of formulajsFunctions()) {
    if (native.has(name)) continue;
    parser.functions[name] = (...args: FunctionArg[]) =>
      toParser(fn(...args.map((a) => (a.omitted ? undefined : toFormulajs(a.value)))));
  }
}
