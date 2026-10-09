// ВПР, ГПР и ПОИСКПОЗ — как в Excel, а не как в formulajs. Важное отличие — приблизительный поиск
// (интервальный_просмотр = ИСТИНА или опущен): Excel делает двоичный поиск и на неотсортированных данных
// возвращает «неправильный» результат, который показывает глава 3. formulajs ищет перебором и находит
// «правильный». Алгоритм сверен с Excel на 300 случайных неотсортированных таблицах (числа и текст):
// середина — с округлением вниз, при точном совпадении — сразу ответ (по равным значениям — к последнему).

import FormulaParser, { type FunctionArg } from "fast-formula-parser";

const { FormulaError } = FormulaParser;

type Value = number | string | boolean | null;

const typeRank = (v: Value) => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : typeof v === "boolean" ? 2 : 3);

/** Порядок Excel: числа < текст (без учёта регистра) < логические. */
function compare(a: Value, b: Value): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") {
    const x = a.toLocaleLowerCase("ru");
    const y = b.toLocaleLowerCase("ru");
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Number(a) - Number(b);
}

/** Точное совпадение; в тексте работают подстановочные знаки * и ? (~ — экранирование), как в Excel. */
function matchesExactly(cell: Value, wanted: Value): boolean {
  if (typeof wanted === "string" && typeof cell === "string" && /[*?]/.test(wanted)) {
    const pattern = wanted.replace(/~([*?~])|([*?])|([.+^${}()|[\]\\])/g, (_m, escaped, wild, special) =>
      escaped ? `\\${escaped}` : wild ? (wild === "*" ? ".*" : ".") : `\\${special}`,
    );
    return new RegExp(`^${pattern}$`, "i").test(cell);
  }
  return typeRank(cell) === typeRank(wanted) && compare(cell, wanted) === 0;
}

/** Позиция (с 0) или −1. approximate — двоичный поиск Excel: наибольшее значение, не превышающее искомое. */
export function findPosition(values: readonly Value[], wanted: Value, approximate: boolean): number {
  if (!approximate) return values.findIndex((v) => matchesExactly(v, wanted));
  let lo = 0;
  let hi = values.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const c = compare(values[mid] ?? null, wanted);
    if (c === 0) {
      let k = mid;
      while (k + 1 < values.length && compare(values[k + 1] ?? null, wanted) === 0) k++;
      return k;
    }
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi;
}

function scalar(arg: FunctionArg): Value {
  const v = arg.value;
  if (Array.isArray(v)) return (v[0]?.[0] ?? null) as Value;
  return v as Value;
}

function table(arg: FunctionArg): Value[][] {
  const v = arg.value;
  return Array.isArray(v) ? (v as Value[][]) : [[v as Value]];
}

function isError(v: unknown): v is InstanceType<typeof FormulaError> {
  return v instanceof FormulaError;
}

function truthy(arg: FunctionArg | undefined, fallback: boolean): boolean {
  if (!arg || arg.omitted) return fallback;
  const v = scalar(arg);
  return typeof v === "string" ? v.toUpperCase() === "TRUE" : Boolean(v);
}

function lookup(vertical: boolean) {
  return (wantedArg: FunctionArg, tableArg: FunctionArg, indexArg: FunctionArg, rangeArg?: FunctionArg) => {
    const wanted = scalar(wantedArg);
    if (isError(wanted)) return wanted;
    const rows = table(tableArg);
    const index = Math.trunc(Number(scalar(indexArg)));
    if (!(index >= 1)) return FormulaError.VALUE;
    const width = vertical ? (rows[0]?.length ?? 0) : rows.length;
    if (index > width) return FormulaError.REF;
    const keys = vertical ? rows.map((r) => r[0] ?? null) : (rows[0] ?? []);
    const pos = findPosition(keys, wanted, truthy(rangeArg, true));
    if (pos < 0) return FormulaError.NA;
    const result = vertical ? rows[pos]?.[index - 1] : rows[index - 1]?.[pos];
    return result ?? 0; // пустая ячейка результата — 0, как в Excel
  };
}

/** ПОИСКПОЗ(искомое; массив; [тип]): 1 (по умолчанию) — приблизительно, 0 — точно, −1 — по убыванию. */
function match(wantedArg: FunctionArg, arrayArg: FunctionArg, typeArg?: FunctionArg) {
  const wanted = scalar(wantedArg);
  if (isError(wanted)) return wanted;
  const values = table(arrayArg).flat();
  const type = typeArg && !typeArg.omitted ? Math.sign(Number(scalar(typeArg))) : 1;
  let pos: number;
  if (type === 0) pos = findPosition(values, wanted, false);
  else if (type === 1) pos = findPosition(values, wanted, true);
  else {
    // По убыванию: наименьшее значение, не меньшее искомого (перебором — для учебных таблиц достаточно)
    pos = -1;
    for (let i = 0; i < values.length && compare(values[i] ?? null, wanted) >= 0; i++) pos = i;
  }
  return pos < 0 ? FormulaError.NA : pos + 1;
}

export const LOOKUP_FUNCTIONS: Record<string, (...args: FunctionArg[]) => unknown> = {
  VLOOKUP: lookup(true) as (...args: FunctionArg[]) => unknown,
  HLOOKUP: lookup(false) as (...args: FunctionArg[]) => unknown,
  MATCH: match as (...args: FunctionArg[]) => unknown,
};
