// Функции главы 12, где formulajs расходится с Excel: ВЫБОР (возвращал #ERROR!, а внутри СУММ должен отдавать
// выбранный диапазон) и АГРЕГАТ (с параметром 6 не пропускал ошибки — а ради этого функция и нужна).

import FormulaParser, { type FunctionArg } from "fast-formula-parser";

const { FormulaError } = FormulaParser;

type ParserError = InstanceType<typeof FormulaError>;
type ParserFn = (...args: FunctionArg[]) => unknown;

const isError = (v: unknown): v is ParserError => v instanceof FormulaError;

function scalar(a: FunctionArg | undefined): unknown {
  let v = a?.value as unknown;
  while (Array.isArray(v)) v = v[0];
  return v;
}

function toNumber(v: unknown): number | ParserError {
  if (isError(v)) return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : FormulaError.VALUE;
}

/** ВЫБОР(номер; значение1; …): значение (или диапазон) с этим номером; номер отбрасывает дробную часть. */
export function choose(index: FunctionArg, ...values: FunctionArg[]): unknown {
  const n = toNumber(scalar(index));
  if (isError(n)) return n;
  const k = Math.trunc(n);
  const chosen = values[k - 1];
  if (k < 1 || !chosen || chosen.omitted) return FormulaError.VALUE;
  return chosen.value;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** Функции АГРЕГАТ по номерам 1–13 (14–19 берут ещё аргумент k). */
const AGGREGATES: Record<number, (xs: number[], all: unknown[], k?: number) => number | ParserError> = {
  1: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : FormulaError.DIV0),
  2: (xs) => xs.length,
  3: (_, all) => all.filter((v) => v !== null && v !== undefined && v !== "").length,
  4: (xs) => (xs.length ? Math.max(...xs) : 0),
  5: (xs) => (xs.length ? Math.min(...xs) : 0),
  6: (xs) => xs.reduce((a, b) => a * b, 1),
  9: (xs) => xs.reduce((a, b) => a + b, 0),
  12: (xs) => (xs.length ? median(xs) : FormulaError.NUM),
  14: (xs, _, k) => {
    const s = [...xs].sort((a, b) => b - a);
    return k && k >= 1 && k <= s.length ? (s[k - 1] as number) : FormulaError.NUM;
  },
  15: (xs, _, k) => {
    const s = [...xs].sort((a, b) => a - b);
    return k && k >= 1 && k <= s.length ? (s[k - 1] as number) : FormulaError.NUM;
  },
};

/**
 * АГРЕГАТ(номер_функции; параметры; массив; [k]): 1 — СРЗНАЧ, 2 — СЧЁТ, 3 — СЧЁТЗ, 4 — МАКС, 5 — МИН,
 * 6 — ПРОИЗВЕД, 9 — СУММ, 12 — МЕДИАНА, 14 — НАИБОЛЬШИЙ, 15 — НАИМЕНЬШИЙ. Параметры 2, 3, 6, 7 — ошибки в
 * массиве пропускаются; иначе первая ошибка — ответ. Скрытые строки плеер не скрывает — параметры про них
 * на ответ не влияют.
 */
export function aggregate(fn: FunctionArg, options: FunctionArg, array: FunctionArg, k?: FunctionArg): unknown {
  const code = toNumber(scalar(fn));
  if (isError(code)) return code;
  const opt = toNumber(scalar(options));
  if (isError(opt)) return opt;
  const run = AGGREGATES[Math.trunc(code)];
  if (!run || opt < 0 || opt > 7) return FormulaError.VALUE;
  const skipErrors = [2, 3, 6, 7].includes(Math.trunc(opt));
  const all = Array.isArray(array?.value) ? (array.value as unknown[]).flat(2) : [array?.value];
  const numbers: number[] = [];
  const kept: unknown[] = [];
  for (const v of all) {
    if (isError(v)) {
      if (skipErrors) continue;
      return v;
    }
    kept.push(v);
    if (typeof v === "number") numbers.push(v);
  }
  const kk = k && !k.omitted ? toNumber(scalar(k)) : undefined;
  if (isError(kk)) return kk;
  return run(numbers, kept, kk);
}

export const LOGIC_FUNCTIONS: Record<string, ParserFn> = {
  // Парсер передаёт ВЫБОР первым аргументом контекст вычисления (funsNeedContext) — он не нужен
  CHOOSE: (_context, index, ...values) => choose(index as FunctionArg, ...(values as FunctionArg[])),
  AGGREGATE: (fn, options, array, k) =>
    aggregate(fn as FunctionArg, options as FunctionArg, array as FunctionArg, k as FunctionArg | undefined),
};
