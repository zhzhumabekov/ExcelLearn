// Даты Excel (глава 7): серийный номер ↔ день, набранные даты, функции дат.
// formulajs расходится с Excel там, где глава строит объяснения: не знает 29.02.1900 (ошибку Lotus,
// которую Excel повторяет), РАБДЕНЬ.МЕЖД не принимает строку выходных «0000011», ЧИСТРАБДНИ при
// обратном порядке дат считает неверно, ДАТАЗНАЧ не понимает «04.01.2003». Поэтому функции дат — свои.

import FormulaParser, { type FunctionArg } from "fast-formula-parser";

const { FormulaError } = FormulaParser;

type ParserError = InstanceType<typeof FormulaError>;
type ParserFn = (...args: FunctionArg[]) => unknown;

const DAY_MS = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);

export interface Ymd {
  year: number;
  month: number;
  day: number;
}

/**
 * Серийный номер → год, месяц, день, как в Excel. 1 — 01.01.1900; Excel считает 1900 год високосным,
 * поэтому 60 — несуществующее 29.02.1900, а номера до 60 сдвинуты на день относительно календаря.
 */
export function serialToYmd(serial: number): Ymd {
  const n = Math.floor(serial);
  if (n === 60) return { year: 1900, month: 2, day: 29 };
  const d = new Date(EPOCH + (n < 60 ? n + 1 : n) * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** ДАТА(год; месяц; день): лишние месяцы и дни переносятся (ДАТА(2005;13;1) = 01.01.2006, день 0 — последний
 *  день прошлого месяца); год 0–1899 — это 1900–3799, как в Excel. null — дата вне диапазона Excel. */
export function ymdToSerial(year: number, month: number, day: number): number | null {
  let y = Math.trunc(year);
  if (y < 0 || y >= 10000) return null;
  if (y < 1900) y += 1900;
  const date = new Date(Date.UTC(y, 0, 1));
  date.setUTCMonth(Math.trunc(month) - 1);
  date.setUTCDate(Math.trunc(day));
  let serial = Math.round((date.getTime() - EPOCH) / DAY_MS);
  if (serial < 61) serial -= 1; // до 01.03.1900 — сдвиг из-за «29.02.1900»
  if (serial < 0 || serial > 2_958_465) return null;
  return serial;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Дата «2025-05-01» → серийный номер. */
export function isoToSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? ymdToSerial(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/** День недели: 1 — воскресенье … 7 — суббота (ДЕНЬНЕД с типом 1). Excel считает его по номеру даты. */
function weekdaySunday1(serial: number): number {
  return ((((Math.floor(serial) + 6) % 7) + 7) % 7) + 1;
}

/** Понедельник = 0 … воскресенье = 6. */
function mondayIndex(serial: number): number {
  return (weekdaySunday1(serial) + 5) % 7;
}

// ---------- Набранная дата ----------

const RU_MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const EN_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Двузначный год, как в Excel: 00–29 — XXI век, 30–99 — XX век. */
export function fullYear(text: string): number {
  const y = Number(text);
  if (text.length > 2) return y;
  return y < 30 ? 2000 + y : 1900 + y;
}

function monthByName(name: string): number | null {
  const lower = name.toLocaleLowerCase("ru");
  const i = RU_MONTHS_SHORT.findIndex((m) => lower.startsWith(m));
  if (i >= 0) return i + 1;
  const j = EN_MONTHS_SHORT.findIndex((m) => lower.startsWith(m.toLowerCase()));
  return j >= 0 ? j + 1 : null;
}

function validSerial(year: number, month: number | null, day: number): number | null {
  if (month === null || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return ymdToSerial(year, month, day);
}

const DOTTED_RE = /^ *(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4}) *$/;
const NAMED_RE = /^ *(\d{1,2})([ -])(\p{L}{3,})\.?\2(\d{2}|\d{4}) *$/u;
const ISO_RE = /^ *(\d{4})-(\d{1,2})-(\d{1,2}) *$/;
const SLASH_RE = /^ *(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}) *$/;

/**
 * Текст, который Excel поймёт как дату, → серийный номер (иначе null). Набор в уроке — в русской записи:
 * «04.01.2003», «4.1.03», «4 янв 2004», «4-янв-2004» (и ГГГГ-ММ-ДД). Английская запись «1/4/2003» (месяц
 * первым) понимается, только если en — язык Excel ученика: в русском Excel «1/4/2003» — 1 апреля.
 */
export function parseDateText(text: string, locale: "ru" | "en" = "ru"): number | null {
  let m = DOTTED_RE.exec(text);
  if (m) return validSerial(fullYear(m[3] as string), Number(m[2]), Number(m[1]));
  m = NAMED_RE.exec(text);
  if (m) return validSerial(fullYear(m[4] as string), monthByName(m[3] as string), Number(m[1]));
  m = ISO_RE.exec(text);
  if (m) return validSerial(Number(m[1]), Number(m[2]), Number(m[3]));
  m = SLASH_RE.exec(text);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return locale === "en" ? validSerial(fullYear(m[3] as string), a, b) : validSerial(fullYear(m[3] as string), b, a);
  }
  return null;
}

/**
 * Набранная дата на языке Excel ученика. В уроке она записана по-русски («04.01.2003», «4 янв 2004»);
 * в английском Excel ту же дату набирают «1/4/2003», «4 Jan 2004». Не дата — без изменений.
 */
export function localizeDateText(text: string, locale: "ru" | "en"): string {
  if (locale === "ru") return text;
  const dotted = DOTTED_RE.exec(text);
  if (dotted) return `${Number(dotted[2])}/${Number(dotted[1])}/${dotted[3]}`;
  const named = NAMED_RE.exec(text);
  if (named) {
    const month = monthByName(named[3] as string);
    if (month !== null) return `${named[1]}${named[2]}${EN_MONTHS_SHORT[month - 1]}${named[2]}${named[4]}`;
  }
  return text;
}

// ---------- Функции дат ----------

type Value = number | string | boolean | null;

function arg(a: FunctionArg | undefined): Value | ParserError {
  if (!a || a.omitted) return null;
  let v = a.value as unknown;
  while (Array.isArray(v)) v = v[0];
  if (v instanceof FormulaError) return v;
  return v === undefined ? null : (v as Value);
}

const isError = (v: unknown): v is ParserError => v instanceof FormulaError;

/** Аргумент-дата или число: текст-дата («04.01.2003») тоже годится, как в Excel. */
function num(a: FunctionArg | undefined, locale: "ru" | "en"): number | ParserError {
  const v = arg(a);
  if (isError(v)) return v;
  if (typeof v === "number") return v;
  if (v === null) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = /^ *[+-]?\d+(\.\d+)? *$/.test(v) ? Number(v) : parseDateText(v, locale);
  return n ?? FormulaError.VALUE;
}

function dateArg(a: FunctionArg | undefined, locale: "ru" | "en"): number | ParserError {
  const n = num(a, locale);
  if (isError(n)) return n;
  return n < 0 ? FormulaError.NUM : Math.floor(n);
}

/** Праздники: диапазон, массив или одно значение; пустые ячейки пропускаются, текст — #ЗНАЧ!. */
function holidays(a: FunctionArg | undefined): Set<number> | ParserError {
  const out = new Set<number>();
  if (!a || a.omitted) return out;
  const flat = Array.isArray(a.value) ? (a.value as unknown[]).flat(2) : [a.value];
  for (const v of flat) {
    if (v === null || v === undefined || v === "") continue;
    if (v instanceof FormulaError) return v;
    if (typeof v !== "number") return FormulaError.VALUE;
    out.add(Math.floor(v));
  }
  return out;
}

/** Выходные РАБДЕНЬ.МЕЖД: код 1–7 (два дня), 11–17 (один день) или строка «0000011» (пн … вс). */
export function weekendMask(a: FunctionArg | undefined): boolean[] | ParserError {
  const v = arg(a);
  if (isError(v)) return v;
  if (v === null) return weekendMask({ value: 1 } as FunctionArg);
  if (typeof v === "string") {
    if (!/^[01]{7}$/.test(v) || v === "1111111") return FormulaError.VALUE;
    return [...v].map((c) => c === "1");
  }
  const code = Number(v);
  const mask = Array<boolean>(7).fill(false);
  if (code >= 1 && code <= 7 && Number.isInteger(code)) {
    // 1 — сб и вс, 2 — вс и пн, …, 7 — пт и сб (индекс 0 — понедельник)
    mask[(code + 4) % 7] = true;
    mask[(code + 5) % 7] = true;
    return mask;
  }
  if (code >= 11 && code <= 17 && Number.isInteger(code)) {
    mask[(code - 5) % 7] = true; // 11 — только воскресенье, 12 — только понедельник, …
    return mask;
  }
  return FormulaError.NUM;
}

function workday(start: number, days: number, weekend: boolean[], off: Set<number>): number {
  let d = start;
  let left = Math.trunc(days);
  const step = left < 0 ? -1 : 1;
  while (left !== 0) {
    d += step;
    if (!weekend[mondayIndex(d)] && !off.has(d)) left -= step;
  }
  return d;
}

function networkdays(start: number, end: number, weekend: boolean[], off: Set<number>): number {
  const [from, to] = start <= end ? [start, end] : [end, start];
  let count = 0;
  for (let d = from; d <= to; d++) if (!weekend[mondayIndex(d)] && !off.has(d)) count++;
  return start <= end ? count : -count;
}

/** РАЗНДАТ: полные годы, месяцы, дни ("y", "m", "d") и остатки ("ym", "md", "yd"). */
export function datedif(start: number, end: number, unit: string): number | ParserError {
  if (start > end) return FormulaError.NUM;
  const a = serialToYmd(start);
  const b = serialToYmd(end);
  const months = (b.year - a.year) * 12 + (b.month - a.month) - (b.day < a.day ? 1 : 0);
  switch (unit.toUpperCase()) {
    case "Y":
      return Math.floor(months / 12);
    case "M":
      return months;
    case "D":
      return end - start;
    case "YM":
      return months % 12;
    case "MD":
      return b.day >= a.day ? b.day - a.day : end - (ymdToSerial(b.year, b.month - 1, a.day) ?? end);
    case "YD": {
      let shifted = ymdToSerial(b.year, a.month, a.day) ?? start;
      if (shifted > end) shifted = ymdToSerial(b.year - 1, a.month, a.day) ?? start;
      return end - shifted;
    }
    default:
      return FormulaError.NUM;
  }
}

function weekday(serial: number, type: number): number | ParserError {
  const sunday1 = weekdaySunday1(serial);
  const monday0 = mondayIndex(serial);
  if (type === 1 || type === 17) return sunday1;
  if (type === 2 || type === 11) return monday0 + 1;
  if (type === 3) return monday0;
  if (type >= 12 && type <= 16) return ((monday0 - (type - 11) + 7) % 7) + 1; // 12 — неделя со вторника …
  return FormulaError.NUM;
}

/** Функции дат. today — серийный номер «сегодня» (у урока он постоянный, чтобы перемотка совпадала). */
export function dateFunctions(today: () => number, locale: () => "ru" | "en"): Record<string, ParserFn> {
  const date = (a?: FunctionArg) => dateArg(a, locale());
  const number = (a?: FunctionArg) => num(a, locale());
  const part = (pick: (d: Ymd) => number) => (a: FunctionArg) => {
    const d = date(a);
    return isError(d) ? d : pick(serialToYmd(d));
  };
  return {
    TODAY: () => today(),
    DATE: (y, m, d) => {
      const [year, month, day] = [number(y), number(m), number(d)];
      for (const v of [year, month, day]) if (isError(v)) return v;
      return ymdToSerial(year as number, month as number, day as number) ?? FormulaError.NUM;
    },
    DATEVALUE: (a) => {
      const v = arg(a);
      if (isError(v)) return v;
      if (typeof v !== "string") return FormulaError.VALUE;
      return parseDateText(v, locale()) ?? FormulaError.VALUE;
    },
    YEAR: part((d) => d.year),
    MONTH: part((d) => d.month),
    DAY: part((d) => d.day),
    WEEKDAY: (a, t) => {
      const d = date(a);
      const type = t ? number(t) : 1;
      if (isError(d)) return d;
      if (isError(type)) return type;
      return weekday(d, Math.trunc(type));
    },
    EOMONTH: (a, m) => {
      const d = date(a);
      const months = number(m);
      if (isError(d)) return d;
      if (isError(months)) return months;
      const { year, month } = serialToYmd(d);
      return ymdToSerial(year, month + Math.trunc(months) + 1, 0) ?? FormulaError.NUM;
    },
    EDATE: (a, m) => {
      const d = date(a);
      const months = number(m);
      if (isError(d)) return d;
      if (isError(months)) return months;
      const { year, month, day } = serialToYmd(d);
      const target = new Date(Date.UTC(year, month - 1 + Math.trunc(months), 1));
      const [ty, tm] = [target.getUTCFullYear(), target.getUTCMonth() + 1];
      return ymdToSerial(ty, tm, Math.min(day, daysInMonth(ty, tm))) ?? FormulaError.NUM;
    },
    WORKDAY: (s, n, h) => workdayFn(s, n, null, h),
    "WORKDAY.INTL": (s, n, w, h) => workdayFn(s, n, w, h),
    NETWORKDAYS: (s, e, h) => networkdaysFn(s, e, null, h),
    "NETWORKDAYS.INTL": (s, e, w, h) => networkdaysFn(s, e, w, h),
    DATEDIF: (s, e, u) => {
      const [start, end, unit] = [date(s), date(e), arg(u)];
      if (isError(start)) return start;
      if (isError(end)) return end;
      if (isError(unit)) return unit;
      return datedif(start, end, String(unit ?? ""));
    },
  };

  function workdayFn(s: FunctionArg, n: FunctionArg, w: FunctionArg | null, h?: FunctionArg) {
    const [start, days, mask, off] = [date(s), number(n), weekendMask(w ?? undefined), holidays(h)];
    for (const v of [start, days, mask, off]) if (isError(v)) return v;
    return workday(start as number, days as number, mask as boolean[], off as Set<number>);
  }

  function networkdaysFn(s: FunctionArg, e: FunctionArg, w: FunctionArg | null, h?: FunctionArg) {
    const [start, end, mask, off] = [date(s), date(e), weekendMask(w ?? undefined), holidays(h)];
    for (const v of [start, end, mask, off]) if (isError(v)) return v;
    return networkdays(start as number, end as number, mask as boolean[], off as Set<number>);
  }
}
