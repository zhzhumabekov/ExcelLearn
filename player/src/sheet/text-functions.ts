// Текстовые функции, в которых formulajs расходится с Excel (глава 6), и ТЕКСТ с кодами формата.
// ЗНАЧЕН не принимает невидимые символы (перевод строки, неразрывный пробел СИМВОЛ(160)) — на этом
// построен разбор ПЕЧСИМВ и ПОДСТАВИТЬ; СЖПРОБЕЛЫ убирает только обычный пробел; ПРОПНАЧ делает
// заглавной любую букву после не-буквы (O'Neil, Петров-Водкин); ПОИСК понимает * и ?.

import FormulaParser, { type FunctionArg } from "fast-formula-parser";

const { FormulaError } = FormulaParser;

export type TextLocale = "ru" | "en";

type Value = number | string | boolean | null;

/** Значение аргумента: из диапазона — первая ячейка; ошибка — как есть. */
function arg(a: FunctionArg | undefined): Value | InstanceType<typeof FormulaError> {
  if (!a || a.omitted) return null;
  let v = a.value as unknown;
  while (Array.isArray(v)) v = v[0];
  if (v instanceof FormulaError) return v;
  if (v === undefined) return null;
  return v as Value;
}

function asText(v: Value): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

function asNumber(v: Value): number | null {
  if (typeof v === "number") return v;
  if (v === null) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  return parseNumberText(v);
}

/** Число из текста, как ЗНАЧЕН: только обычные пробелы по краям; «12%» → 0,12. Иначе null. */
export function parseNumberText(text: string): number | null {
  const m = /^ *([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?) *(%?) *$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] ? n / 100 : n;
}

const isError = (v: unknown): v is InstanceType<typeof FormulaError> => v instanceof FormulaError;

/** Excel ПРОПНАЧ: заглавная — первая буква и любая буква после не-буквы, остальные строчные. */
export function proper(text: string): string {
  let out = "";
  let afterLetter = false;
  for (const ch of text) {
    const letter = /\p{L}/u.test(ch);
    out += letter ? (afterLetter ? ch.toLocaleLowerCase("ru") : ch.toLocaleUpperCase("ru")) : ch;
    afterLetter = letter;
  }
  return out;
}

/** Шаблон ПОИСК: * — любые символы, ? — один, ~ экранирует. */
function searchPattern(find: string): RegExp {
  const source = find.replace(/~([*?~])|([*?])|([.+^${}()|[\]\\])/g, (_m, escaped, wild, special) =>
    escaped ? `\\${escaped}` : wild ? (wild === "*" ? "[\\s\\S]*?" : "[\\s\\S]") : `\\${special}`,
  );
  return new RegExp(source, "iu");
}

// ---------- ТЕКСТ ----------

const MONTHS: Record<TextLocale, { full: string[]; short: string[] }> = {
  ru: {
    full: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
    short: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  },
  en: {
    full: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
};

const DAYS: Record<TextLocale, { full: string[]; short: string[] }> = {
  ru: {
    full: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
    short: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  },
  en: {
    full: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
};

/** Части кода формата: литералы ("…", \x) отдельно от кодов. */
function splitFormat(fmt: string): { code: string; literal: boolean }[] {
  const parts: { code: string; literal: boolean }[] = [];
  const re = /"([^"]*)"|\\(.)|([^"\\]+)/g;
  for (const m of fmt.matchAll(re)) {
    if (m[1] !== undefined) parts.push({ code: m[1], literal: true });
    else if (m[2] !== undefined) parts.push({ code: m[2], literal: true });
    else if (m[3] !== undefined) parts.push({ code: m[3], literal: false });
  }
  return parts;
}

const DATE_CODE_RE = /[dmy]/i;

function formatDatePart(code: string, serial: number, locale: TextLocale): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  return code.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d/gi, (token) => {
    switch (token.toLowerCase()) {
      case "yyyy":
        return String(year);
      case "yy":
        return String(year % 100).padStart(2, "0");
      case "mmmm":
        return MONTHS[locale].full[month] ?? "";
      case "mmm":
        return MONTHS[locale].short[month] ?? "";
      case "mm":
        return String(month + 1).padStart(2, "0");
      case "m":
        return String(month + 1);
      case "dddd":
        return DAYS[locale].full[d.getUTCDay()] ?? "";
      case "ddd":
        return DAYS[locale].short[d.getUTCDay()] ?? "";
      case "dd":
        return String(day).padStart(2, "0");
      default:
        return String(day);
    }
  });
}

/** Числовой код: 0, #, «,» — разряды, «.» — дробная часть, % — проценты (в каноническом виде, как в en). */
function formatNumberCode(code: string, value: number, locale: TextLocale): string {
  const first = code.search(/[0#]/);
  if (first < 0) return code;
  let last = first;
  for (let i = first; i < code.length; i++) if (/[0#.,]/.test(code[i] ?? "")) last = i;
  const prefix = code.slice(0, first);
  const suffix = code.slice(last + 1);
  const body = code.slice(first, last + 1);
  const [intPart = "", fracPart = ""] = body.split(".");
  const decimals = fracPart.replace(/[^0#]/g, "").length;
  const minInt = intPart.replace(/[^0]/g, "").length;
  const grouping = intPart.includes(",");
  const scaled = (code.includes("%") ? value * 100 : value) / (intPart.endsWith(",") ? 1000 : 1);
  const fixed = Math.abs(scaled).toFixed(decimals);
  let [whole = "0", frac = ""] = fixed.split(".");
  if (whole === "0" && minInt === 0) whole = "";
  whole = whole.padStart(minInt, "0");
  if (grouping) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "ru" ? "\u00a0" : ",");
  // # в дробной части — необязательные знаки: хвостовые нули убираются
  const optional = fracPart.replace(/[^0#]/g, "").replace(/^0*/, "").length;
  if (optional) frac = frac.replace(new RegExp(`0{1,${optional}}$`), "");
  const number = frac ? `${whole}${locale === "ru" ? "," : "."}${frac}` : whole;
  return `${prefix}${number}${suffix}`;
}

/** ТЕКСТ(значение; формат): формат — в каноническом (английском) виде, результат — на языке книги. */
export function formatText(value: Value, fmt: string, locale: TextLocale): string {
  const n = asNumber(value);
  if (n === null) return asText(value); // текст не меняется: ТЕКСТ("abc";"0") = abc
  const sections = fmt.split(";");
  const section = (n < 0 && sections[1] !== undefined ? sections[1] : sections[0]) ?? "";
  if (/^general$/i.test(section.trim())) return asText(n);
  const parts = splitFormat(section);
  const isDate = parts.some((p) => !p.literal && DATE_CODE_RE.test(p.code));
  const sign = n < 0 && sections[1] === undefined ? "-" : "";
  const body = parts
    .map((p) => {
      if (p.literal) return p.code;
      return isDate ? formatDatePart(p.code, n, locale) : p.code;
    })
    .join("");
  if (isDate) return body;
  // Числовой код: литералы («₸», \x) прячем за метками, чтобы их символы не считались кодами
  const literals: string[] = [];
  // Метка — символ из области частного использования (U+E000 + номер): без цифр, которые читаются как код
  const code = parts.map((p) => (p.literal ? String.fromCharCode(0xe000 + literals.push(p.code) - 1) : p.code)).join("");
  const formatted = formatNumberCode(code, Math.abs(n), locale);
  return sign + formatted.replace(/[-]/g, (m) => literals[m.charCodeAt(0) - 0xe000] ?? "");
}

// ---------- Функции для парсера ----------

type ParserFn = (...args: FunctionArg[]) => unknown;

export function textFunctions(locale: () => TextLocale): Record<string, ParserFn> {
  return {
    VALUE: (a) => {
      const v = arg(a);
      if (isError(v)) return v;
      if (typeof v === "number") return v;
      if (typeof v !== "string") return FormulaError.VALUE;
      return parseNumberText(v) ?? FormulaError.VALUE;
    },
    TRIM: (a) => {
      const v = arg(a);
      if (isError(v)) return v;
      return asText(v).replace(/ +/g, " ").replace(/^ | $/g, "");
    },
    PROPER: (a) => {
      const v = arg(a);
      return isError(v) ? v : proper(asText(v));
    },
    LEFT: (a, b) => {
      const v = arg(a);
      const n = b ? arg(b) : 1;
      if (isError(v)) return v;
      if (isError(n)) return n;
      const count = asNumber(n);
      if (count === null || count < 0) return FormulaError.VALUE;
      return [...asText(v)].slice(0, Math.floor(count)).join("");
    },
    RIGHT: (a, b) => {
      const v = arg(a);
      const n = b ? arg(b) : 1;
      if (isError(v)) return v;
      if (isError(n)) return n;
      const count = asNumber(n);
      if (count === null || count < 0) return FormulaError.VALUE;
      const chars = [...asText(v)];
      return Math.floor(count) === 0 ? "" : chars.slice(-Math.floor(count)).join("");
    },
    SEARCH: (a, b, c) => {
      const find = arg(a);
      const within = arg(b);
      const start = c ? arg(c) : 1;
      if (isError(find)) return find;
      if (isError(within)) return within;
      if (isError(start)) return start;
      const text = asText(within);
      const from = asNumber(start);
      if (from === null || from < 1 || from > text.length + 1) return FormulaError.VALUE;
      const found = searchPattern(asText(find)).exec(text.slice(Math.floor(from) - 1));
      return found ? found.index + Math.floor(from) : FormulaError.VALUE;
    },
    TEXT: (a, b) => {
      const v = arg(a);
      const fmt = arg(b);
      if (isError(v)) return v;
      if (isError(fmt)) return fmt;
      return formatText(v, asText(fmt), locale());
    },
  };
}
