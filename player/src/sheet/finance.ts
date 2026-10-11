// Финансовые функции глав 8–9 (ЧПС, ЧИСТНЗ, ВСД, ЧИСТВНДОХ, МВСД). formulajs расходится с Excel на пустых
// ячейках: ЧПС считает пустую ячейку диапазона нулём (а Excel пропускает её вместе с периодом), ЧИСТНЗ на
// пустом потоке даёт #ЗНАЧ! (а Excel — #ЧИСЛО!). ВСД с разными предположениями глава 9 сравнивает с таблицей
// книги (два корня у одного проекта) — поиск корня свой, как в Excel. Поэтому функции — свои.

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

/** Числа из ссылок и массивов (пустые, текст, логические пропускаются); ошибка в данных — сразу она. */
function numbers(a: FunctionArg | undefined): number[] | ParserError {
  if (!a || a.omitted) return FormulaError.VALUE;
  const out: number[] = [];
  for (const v of flat(a)) {
    if (isError(v)) return v;
    if (typeof v === "number") out.push(v);
  }
  return out;
}

/** Поиск корня, как у Excel: метод Ньютона от предположения, точность 0,00001%, до 20 попыток. */
const MAX_TRIES = 20;
const ACCURACY = 1e-7;

/**
 * Если шаг уводит ставку за −100% (где ЧПС не определена), шаг укорачивается вдвое, пока ставка не станет
 * больше −100%. Так ВСД проекта −20, 82, −60, 2 с предположениями −90%…90% (шаг 20%) даёт −9,6% до 30%
 * включительно и 216,1% от 50% — как в таблице книги (рис. 9.2).
 */
function newton(f: (r: number) => [number, number], guess: number): number | ParserError {
  let r = guess;
  for (let i = 0; i < MAX_TRIES; i++) {
    const [value, slope] = f(r);
    if (!Number.isFinite(value) || !Number.isFinite(slope) || slope === 0) return FormulaError.NUM;
    let step = value / slope;
    let next = r - step;
    for (let k = 0; next <= -1 && k < 60; k++) {
      step /= 2;
      next = r - step;
    }
    if (next <= -1) return FormulaError.NUM;
    if (Math.abs(next - r) < ACCURACY) return next;
    r = next;
  }
  return FormulaError.NUM;
}

/** Нужен хотя бы один положительный и один отрицательный поток — иначе ставки, где ЧПС = 0, нет. */
const hasBothSigns = (flows: number[]) => flows.some((v) => v > 0) && flows.some((v) => v < 0);

/**
 * ВСД(значения; [предположение]): ставка, при которой ЧПС потоков равна 0. Первый поток — сегодня (период 0),
 * каждый следующий — через период. Пустые ячейки, текст и логические значения пропускаются.
 */
export function irr(values: FunctionArg, guess?: FunctionArg): number | ParserError {
  const flows = numbers(values);
  if (isError(flows)) return flows;
  const g = guess && !guess.omitted ? rateArg(guess) : 0.1;
  if (isError(g)) return g;
  if (!hasBothSigns(flows)) return FormulaError.NUM;
  return newton((r) => {
    let value = 0;
    let slope = 0;
    for (const [t, v] of flows.entries()) {
      value += v / (1 + r) ** t;
      slope -= (t * v) / (1 + r) ** (t + 1);
    }
    return [value, slope];
  }, g);
}

/** ЧИСТВНДОХ(значения; даты; [предположение]): ставка, при которой ЧИСТНЗ = 0. Правила дат — как у ЧИСТНЗ. */
export function xirr(values: FunctionArg, dates: FunctionArg, guess?: FunctionArg): number | ParserError {
  if (!values || !dates || values.omitted || dates.omitted) return FormulaError.VALUE;
  const vs = flat(values);
  const ds = flat(dates);
  if (vs.length !== ds.length) return FormulaError.NUM;
  const flows: number[] = [];
  const years: number[] = [];
  for (const [i, v] of vs.entries()) {
    const d = ds[i];
    if (isError(v)) return v;
    if (isError(d)) return d;
    if (isBlank(v) || isBlank(d)) return FormulaError.NUM;
    if (typeof v !== "number" || typeof d !== "number") return FormulaError.VALUE;
    flows.push(v);
    years.push(Math.floor(d));
  }
  const first = years[0];
  if (first === undefined || years.some((d) => d < first)) return FormulaError.NUM;
  const t = years.map((d) => (d - first) / 365);
  const g = guess && !guess.omitted ? rateArg(guess) : 0.1;
  if (isError(g)) return g;
  if (!hasBothSigns(flows)) return FormulaError.NUM;
  return newton((r) => {
    let value = 0;
    let slope = 0;
    for (const [i, v] of flows.entries()) {
      const ti = t[i] ?? 0;
      value += v / (1 + r) ** ti;
      slope -= (ti * v) / (1 + r) ** (ti + 1);
    }
    return [value, slope];
  }, g);
}

/**
 * МВСД(значения; ставка_финансирования; ставка_реинвестирования): отрицательные потоки дисконтируются к
 * периоду 0 по ставке финансирования, положительные наращиваются к последнему периоду по ставке
 * реинвестирования; МВСД = (будущее / −настоящее)^(1/(n−1)) − 1. Нет потоков одного знака — #ДЕЛ/0!.
 */
export function mirr(values: FunctionArg, finance: FunctionArg, reinvest: FunctionArg): number | ParserError {
  const flows = numbers(values);
  if (isError(flows)) return flows;
  const f = rateArg(finance);
  if (isError(f)) return f;
  const re = rateArg(reinvest);
  if (isError(re)) return re;
  const n = flows.length;
  let pv = 0;
  let fv = 0;
  for (const [t, v] of flows.entries()) {
    if (v < 0) pv += v / (1 + f) ** t;
    else fv += v * (1 + re) ** (n - 1 - t);
  }
  if (pv === 0 || fv === 0 || n < 2) return FormulaError.DIV0;
  return (fv / -pv) ** (1 / (n - 1)) - 1;
}

export const FINANCE_FUNCTIONS: Record<string, ParserFn> = {
  NPV: (rate, ...values) => npv(rate as FunctionArg, ...(values as FunctionArg[])),
  XNPV: (rate, values, dates) => xnpv(rate as FunctionArg, values as FunctionArg, dates as FunctionArg),
  IRR: (values, guess) => irr(values as FunctionArg, guess as FunctionArg | undefined),
  XIRR: (values, dates, guess) => xirr(values as FunctionArg, dates as FunctionArg, guess as FunctionArg | undefined),
  MIRR: (values, finance, reinvest) => mirr(values as FunctionArg, finance as FunctionArg, reinvest as FunctionArg),
};
