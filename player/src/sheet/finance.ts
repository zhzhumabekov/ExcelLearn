// Финансовые функции главы 8 (ЧПС, ЧИСТНЗ). formulajs расходится с Excel на пустых ячейках: ЧПС считает
// пустую ячейку диапазона нулём (а Excel пропускает её вместе с периодом), ЧИСТНЗ на пустом потоке даёт
// #ЗНАЧ! (а Excel — #ЧИСЛО!). Глава прямо об этом говорит, поэтому функции — свои.

import FormulaParser, { type FunctionArg } from "fast-formula-parser";

const { FormulaError } = FormulaParser;

type ParserError = InstanceType<typeof FormulaError>;
type ParserFn = (...args: FunctionArg[]) => unknown;

const isError = (v: unknown): v is ParserError => v instanceof FormulaError;
const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/** Аргумент — ссылка или массив (тогда в нём считаются только числа). */
const isRef = (a: FunctionArg) =>
  Array.isArray(a.value) ||
  Boolean((a as { isRangeRef?: boolean; isCellRef?: boolean }).isRangeRef) ||
  Boolean((a as { isCellRef?: boolean }).isCellRef);

const flat = (a: FunctionArg): unknown[] => (Array.isArray(a.value) ? (a.value as unknown[]).flat(2) : [a.value]);

/** Ставка: число, логическое или текст-число; иначе #ЗНАЧ!. */
function rateArg(a: FunctionArg | undefined): number | ParserError {
  if (!a || a.omitted) return 0;
  let v = a.value as unknown;
  while (Array.isArray(v)) v = v[0];
  if (isError(v)) return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (isBlank(v)) return 0;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : FormulaError.VALUE;
}

/**
 * ЧПС(ставка; значение1; …): первый поток — через один период, каждый следующий — ещё через период.
 * В ссылках и массивах считаются только числа: пустые ячейки, текст и логические значения пропускаются
 * вместе со своим периодом. Число, логическое и текст-число, записанные прямо в аргументе, считаются.
 */
export function npv(rate: FunctionArg, ...values: FunctionArg[]): number | ParserError {
  const r = rateArg(rate);
  if (isError(r)) return r;
  if (r === -1) return FormulaError.DIV0;
  const flows: number[] = [];
  for (const a of values) {
    if (a.omitted) continue;
    if (isRef(a)) {
      for (const v of flat(a)) {
        if (isError(v)) return v;
        if (typeof v === "number") flows.push(v);
      }
    } else {
      const v = a.value as unknown;
      if (isError(v)) return v;
      if (typeof v === "number") flows.push(v);
      else if (typeof v === "boolean") flows.push(v ? 1 : 0);
      else {
        const n = Number(String(v).trim());
        if (!Number.isFinite(n) || isBlank(v)) return FormulaError.VALUE;
        flows.push(n);
      }
    }
  }
  return flows.reduce((sum, v, i) => sum + v / (1 + r) ** (i + 1), 0);
}

/**
 * ЧИСТНЗ(ставка; значения; даты): ЧПС в деньгах первой даты. Каждый поток дисконтируется на
 * (дата − первая дата) / 365 лет. Пустой поток или разная длина списков — #ЧИСЛО!, текст — #ЗНАЧ!,
 * дата раньше первой — #ЧИСЛО!. Даты отбрасывают дробную часть, как в Excel.
 */
export function xnpv(rate: FunctionArg, values: FunctionArg, dates: FunctionArg): number | ParserError {
  const r = rateArg(rate);
  if (isError(r)) return r;
  if (!values || !dates || values.omitted || dates.omitted) return FormulaError.VALUE;
  const vs = flat(values);
  const ds = flat(dates);
  if (vs.length !== ds.length) return FormulaError.NUM;
  const flows: number[] = [];
  const days: number[] = [];
  for (const [i, v] of vs.entries()) {
    const d = ds[i];
    if (isError(v)) return v;
    if (isError(d)) return d;
    if (isBlank(v) || isBlank(d)) return FormulaError.NUM;
    if (typeof v !== "number" || typeof d !== "number") return FormulaError.VALUE;
    flows.push(v);
    days.push(Math.floor(d));
  }
  const first = days[0];
  if (first === undefined) return FormulaError.NUM;
  if (days.some((d) => d < first)) return FormulaError.NUM;
  return flows.reduce((sum, v, i) => sum + v / (1 + r) ** (((days[i] ?? first) - first) / 365), 0);
}

export const FINANCE_FUNCTIONS: Record<string, ParserFn> = {
  NPV: (rate, ...values) => npv(rate as FunctionArg, ...(values as FunctionArg[])),
  XNPV: (rate, values, dates) => xnpv(rate as FunctionArg, values as FunctionArg, dates as FunctionArg),
};
