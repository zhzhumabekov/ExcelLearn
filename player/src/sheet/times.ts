// Время в Excel (глава 13): доля суток после полуночи — 3:00 = 0,125, 12:00 = 0,5; дата со временем —
// серийный номер дня плюс эта доля. Набранное время, форматы времени и функции ВРЕМЯ, ВРЕМЗНАЧ, ЧАС,
// МИНУТЫ, СЕКУНДЫ и ТДАТА — свои: formulajs работает с часовым поясом браузера и путает доли суток.

import FormulaParser, { type FunctionArg } from "fast-formula-parser";

import { parseDateText } from "./dates";

const { FormulaError } = FormulaParser;

type ParserError = InstanceType<typeof FormulaError>;
type ParserFn = (...args: FunctionArg[]) => unknown;

const DAY_SECONDS = 86_400;

const TIME_RE = /^ *(\d{1,4}):(\d{1,2})(?::(\d{1,2}))? *([AaPp][Mm])? *$/;
const DATE_TIME_RE = /^ *(\S+) +(\d{1,2}:\d{1,2}(?::\d{1,2})? *(?:[AaPp][Mm])?) *$/;

export interface TimeText {
  /** Доля суток (или больше суток: «38:48» — продолжительность). */
  value: number;
  hasSeconds: boolean;
}

/** «8:30», «20:30:15», «8:30 PM», «38:48» → доля суток; иначе null. */
export function parseTimeText(text: string): TimeText | null {
  const m = TIME_RE.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = m[3] === undefined ? 0 : Number(m[3]);
  if (minutes > 59 || seconds > 59) return null;
  const ampm = m[4]?.toUpperCase();
  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (ampm === "PM" ? 12 : 0);
  }
  return { value: (hours * 3600 + minutes * 60 + seconds) / DAY_SECONDS, hasSeconds: m[3] !== undefined };
}

/** «01.01.2026 5:35» → серийный номер с долей суток; иначе null. */
export function parseDateTimeText(text: string, locale: "ru" | "en" = "ru"): number | null {
  const m = DATE_TIME_RE.exec(text);
  if (!m) return null;
  const date = parseDateText(m[1] as string, locale);
  const time = parseTimeText(m[2] as string);
  if (date === null || time === null || time.value >= 1) return null;
  return date + time.value;
}

/** Формат, который Excel сам ставит ячейке, когда в неё набрали время или дату со временем. */
export function typedTimeFormat(text: string): "time" | "timeSec" | "hours" | "datetime" | null {
  if (parseDateTimeText(text) !== null) return "datetime";
  const t = parseTimeText(text);
  if (!t) return null;
  if (t.value >= 1) return "hours";
  return t.hasSeconds ? "timeSec" : "time";
}

/** Набранная дата со временем на языке ученика: «01.01.2026 5:35» → «1/1/2026 5:35». */
export function localizeDateTimeText(text: string, locale: "ru" | "en"): string {
  if (locale === "ru") return text;
  const m = DATE_TIME_RE.exec(text);
  const d = m && /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(m[1] as string);
  if (!m || !d) return text;
  return `${Number(d[2])}/${Number(d[1])}/${d[3]} ${m[2]}`;
}

/** Секунды от полуночи (с округлением до секунды, как Excel) и номер дня. */
export function splitTime(value: number): { day: number; seconds: number } {
  const total = Math.round(value * DAY_SECONDS);
  const day = Math.floor(total / DAY_SECONDS);
  return { day, seconds: total - day * DAY_SECONDS };
}

const two = (n: number) => String(n).padStart(2, "0");

/** «8:30» / «8:30 AM»; с секундами — «15:10:30» / «3:10:30 PM». */
export function formatTime(value: number, locale: "ru" | "en", withSeconds: boolean): string {
  const { seconds } = splitTime(value);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const tail = withSeconds ? `:${two(m)}:${two(s)}` : `:${two(m)}`;
  if (locale === "ru") return `${h}${tail}`;
  return `${h % 12 === 0 ? 12 : h % 12}${tail} ${h < 12 ? "AM" : "PM"}`;
}

/** [ч]:мм:сс — часы больше суток не обнуляются: «38:48:00». */
export function formatHours(value: number): string {
  const total = Math.round(value * DAY_SECONDS);
  return `${Math.floor(total / 3600)}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

function arg(a: FunctionArg | undefined): unknown {
  let v = a?.value as unknown;
  while (Array.isArray(v)) v = v[0];
  return v ?? null;
}

const isError = (v: unknown): v is ParserError => v instanceof FormulaError;

/** Число из аргумента: время текстом («8:30») тоже число, как в Excel. */
function timeNumber(a: FunctionArg | undefined, locale: "ru" | "en"): number | ParserError {
  const v = arg(a);
  if (isError(v)) return v;
  if (typeof v === "number") return v;
  if (v === null) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const text = String(v);
  if (/^ *[+-]?\d+(\.\d+)? *$/.test(text)) return Number(text);
  return parseDateTimeText(text, locale) ?? parseTimeText(text)?.value ?? parseDateText(text, locale) ?? FormulaError.VALUE;
}

/** Функции времени. now — «сейчас» книги (у урока постоянное, чтобы перемотка совпадала). */
export function timeFunctions(now: () => number, locale: () => "ru" | "en"): Record<string, ParserFn> {
  const part = (pick: (seconds: number) => number) => (a: FunctionArg) => {
    const v = timeNumber(a, locale());
    if (isError(v)) return v;
    if (v < 0) return FormulaError.NUM;
    return pick(splitTime(v).seconds);
  };
  return {
    NOW: () => now(),
    // ВРЕМЯ(часы; минуты; секунды): всё в секундах, остаток от суток — ВРЕМЯ(25;10;30) = 1:10:30
    TIME: (h, m, s) => {
      const parts = [h, m, s].map((a) => timeNumber(a, locale()));
      for (const v of parts) if (isError(v)) return v;
      const [hours, minutes, seconds] = parts.map((v) => Math.trunc(v as number)) as [number, number, number];
      const total = hours * 3600 + minutes * 60 + seconds;
      if (total < 0 || hours > 32767 || minutes > 32767 || seconds > 32767) return FormulaError.NUM;
      return (total % DAY_SECONDS) / DAY_SECONDS;
    },
    // ВРЕМЗНАЧ("8:30") = 0,354…: только время, дата в строке отбрасывается
    TIMEVALUE: (a) => {
      const v = arg(a);
      if (isError(v)) return v;
      if (typeof v !== "string") return FormulaError.VALUE;
      const dt = parseDateTimeText(v, locale());
      if (dt !== null) return dt - Math.floor(dt);
      const t = parseTimeText(v);
      return t ? t.value - Math.floor(t.value) : FormulaError.VALUE;
    },
    HOUR: part((s) => Math.floor(s / 3600)),
    MINUTE: part((s) => Math.floor((s % 3600) / 60)),
    SECOND: part((s) => s % 60),
  };
}
