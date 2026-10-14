// Показ формул и значений на языке ученика. В уроке и модели листа всё хранится в каноническом
// английском виде (=SUM(C4:C11), 449.63); русский вид — только при отображении.

import type { Fmt } from "../sheet/sheet-model";
import { localizeDateText, parseDateText, serialToYmd } from "../sheet/dates";
import { type CellValue, ExcelError } from "../sheet/evaluator";
import { formatHours, formatTime, localizeDateTimeText, parseDateTimeText, splitTime } from "../sheet/times";
import dictionary from "./functions-ru.json";

export type FunctionLocale = "ru" | "en";

const RU_FUNCTIONS: Readonly<Record<string, string>> = dictionary.functions;
const RU_ERRORS: Readonly<Record<string, string>> = dictionary.errors;

export function functionName(name: string, locale: FunctionLocale): string {
  const upper = name.toUpperCase();
  return locale === "ru" ? (RU_FUNCTIONS[upper] ?? upper) : upper;
}

export function errorCode(code: string, locale: FunctionLocale): string {
  return locale === "ru" ? (RU_ERRORS[code] ?? code) : code;
}

// Строка в кавычках | имя листа в апострофах | ошибка (#REF!) | идентификатор (функция, ссылка, TRUE) | число | символ
const TOKEN_RE =
  /"(?:[^"]|"")*"|'(?:[^']|'')*'|#(?:DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!)|[A-Za-z_][A-Za-z0-9_.]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+|[\s\S]/g;

/**
 * Код формата ТЕКСТ на языке русского Excel: даты — Д, М, Г («dd.mm.yyyy» → «ДД.ММ.ГГГГ»), в числах
 * «.» → «,» и «,» (разряды) → пробел. Текст в кавычках внутри кода и символы после \ не меняются.
 */
export function localizeFormatCode(code: string): string {
  const isDate = /[dmy]/i.test(code.replace(/"[^"]*"|\\./g, ""));
  return code
    .split(/("[^"]*"|\\.)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      if (isDate) return part.replace(/[dmyhs]/gi, (ch) => ({ d: "Д", m: "М", y: "Г", h: "Ч", s: "С" })[ch.toLowerCase()] ?? ch);
      return part.replace(/[.,]/g, (ch) => (ch === "." ? "," : " "));
    })
    .join("");
}

/** Строка в кавычках — второй аргумент ТЕКСТ? Тогда это код формата и его тоже переводим. */
function isTextFormatArg(tokens: readonly string[], i: number): boolean {
  let depth = 0;
  let commas = 0;
  for (let k = i - 1; k >= 0; k--) {
    const t = tokens[k];
    if (t === ")") depth++;
    else if (t === "(") {
      if (depth === 0) return commas === 1 && (tokens[k - 1] ?? "").toUpperCase() === "TEXT";
      depth--;
    } else if (t === "," && depth === 0) commas++;
  }
  return false;
}

/** Строка в кавычках — аргумент ДАТАЗНАЧ? Тогда это дата и её пишут на языке Excel ученика. */
function isDateValueArg(tokens: readonly string[], i: number): boolean {
  return tokens[i - 1] === "(" && (tokens[i - 2] ?? "").toUpperCase() === "DATEVALUE";
}

/**
 * =SUM(B2:D2,1.5) → =СУММ(B2:D2;1,5) для ru. Даты в уроке записаны по-русски («04.01.2003») — и набранные
 * в ячейку, и в ДАТАЗНАЧ; для en они становятся «1/4/2003», остальное для en без изменений.
 */
export function localizeFormula(formula: string, locale: FunctionLocale): string {
  if (!formula.startsWith("=") && parseDateText(formula) !== null) return localizeDateText(formula, locale);
  if (!formula.startsWith("=") && parseDateTimeText(formula) !== null) return localizeDateTimeText(formula, locale);
  if (locale === "en") {
    const tokens = formula.match(TOKEN_RE) ?? [];
    return tokens
      .map((t, i) => (t.startsWith('"') && isDateValueArg(tokens, i) ? `"${localizeDateText(t.slice(1, -1), locale)}"` : t))
      .join("");
  }
  const tokens = formula.match(TOKEN_RE) ?? [];
  return tokens
    .map((token, i) => {
      const first = token.charAt(0);
      if (first === '"' && isTextFormatArg(tokens, i)) return `"${localizeFormatCode(token.slice(1, -1))}"`;
      if (first === '"' || first === "'") return token;
      if (/^[A-Za-z_]/.test(token)) {
        const isCall = tokens[i + 1] === "(";
        if (isCall) return functionName(token, locale);
        const upper = token.toUpperCase();
        return upper === "TRUE" || upper === "FALSE" ? functionName(upper, locale) : token;
      }
      if (/^\.?\d/.test(token)) return token.replace(".", ",");
      if (token === ",") return ";";
      if (token.length > 1 && first === "#") return errorCode(token, locale);
      return token;
    })
    .join("");
}

// ---------- Значения ячеек ----------

export interface DisplayValue {
  text: string;
  align: "left" | "right" | "center";
  /** Знак валюты, прижатый к левому краю ячейки (финансовый формат Excel). */
  currency?: string;
}

const NUMBER_FORMATS: Record<FunctionLocale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ru: new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

const KZT_FORMATS: Record<FunctionLocale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
  ru: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }),
};

function decimalComma(text: string, locale: FunctionLocale): string {
  return locale === "ru" ? text.replace(".", ",") : text;
}

/** Серийный номер Excel → «01.05.2025» (ru) или «5/1/2025» (en). */
export function formatDate(serial: number, locale: FunctionLocale): string {
  if (Math.floor(serial) === 0) return locale === "ru" ? "00.01.1900" : "1/0/1900"; // нулевой день Excel
  const { day, month, year } = serialToYmd(serial);
  return locale === "ru" ? `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}` : `${month}/${day}/${year}`;
}

const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Длинный формат даты Windows: «4 января 2003 г.» (ru), «Saturday, January 4, 2003» (en). */
export function formatLongDate(serial: number, locale: FunctionLocale): string {
  const { day, month, year } = serialToYmd(serial);
  if (locale === "ru") return `${day} ${MONTHS_GENITIVE[month - 1]} ${year} г.`;
  const weekday = WEEKDAYS_EN[(((Math.floor(serial) + 6) % 7) + 7) % 7];
  return `${weekday}, ${MONTHS_EN[month - 1]} ${day}, ${year}`;
}

/** «Общий» формат Excel: целые как есть, дробные — до precision значащих цифр без хвостовых нулей. */
export function formatGeneral(n: number, locale: FunctionLocale, precision = 10): string {
  if (Number.isInteger(n)) return String(n);
  const text = Number(n.toPrecision(precision)).toString();
  return decimalComma(text, locale);
}

/**
 * Число, не влезающее в ширину ячейки, Excel не выпускает на соседние ячейки (в отличие от текста):
 * в «общем» формате он сокращает дробную часть, а если не помогает или формат фиксированный — «#####».
 */
function fitNumber(value: number, display: DisplayValue, fmt: Fmt, locale: FunctionLocale, fits: Fits): DisplayValue {
  if (fits(display) && !display.text.startsWith("#")) return display; // решётки отрицательной даты — во всю ширину
  if (fmt === "general" && !Number.isInteger(value)) {
    for (let precision = 9; precision >= 1; precision--) {
      const shorter = { ...display, text: formatGeneral(value, locale, precision) };
      if (fits(shorter)) return shorter;
    }
  }
  let hashes = "#";
  // Предел — на случай, когда ширину не измерить (тесты без раскладки): там «помещается» всё
  while (hashes.length < 40 && fits({ text: hashes + "#", align: display.align })) hashes += "#";
  return { text: hashes, align: display.align };
}

function formatTimeValue(value: number, fmt: "time" | "timeSec" | "hours" | "datetime", locale: FunctionLocale): string {
  if (fmt === "hours") return formatHours(value);
  if (fmt !== "datetime") return formatTime(value, locale, fmt === "timeSec");
  const { day, seconds } = splitTime(value);
  return `${formatDate(day, locale)} ${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
}

/** Помещается ли текст в ячейку (решает отрисовка — она знает шрифт и ширину колонки). */
export type Fits = (display: DisplayValue) => boolean;

/** fits — помещается ли число в ячейку; если нет — меньше знаков или «#####», как в Excel. */
export function formatValue(value: CellValue, fmt: Fmt, locale: FunctionLocale, fits?: Fits): DisplayValue {
  const display = formatPlain(value, fmt, locale);
  return typeof value === "number" && fits ? fitNumber(value, display, fmt, locale, fits) : display;
}

function formatPlain(value: CellValue, fmt: Fmt, locale: FunctionLocale): DisplayValue {
  if (value === null) return { text: "", align: "left" };
  if (value instanceof ExcelError) return { text: errorCode(value.code, locale), align: "center" };
  if (typeof value === "boolean") return { text: functionName(value ? "TRUE" : "FALSE", locale), align: "center" };
  if (typeof value === "string") {
    // Текст формулы (результат FORMULATEXT) показываем так, как его вернул бы Excel на этом языке
    const text = value.startsWith("=") ? localizeFormula(value, locale) : value;
    return { text, align: "left" };
  }
  switch (fmt) {
    case "usd":
      return { text: NUMBER_FORMATS[locale].format(value), align: "right", currency: "$" };
    case "kzt":
      // Денежный формат Казахстана: «174 720 ₸» — тенге без тиынов, знак после числа
      return { text: `${KZT_FORMATS[locale].format(value)} ₸`, align: "right" };
    case "date":
    case "dateLong":
      // Отрицательной даты не бывает: Excel заполняет ячейку решётками при любой ширине
      if (value < 0) return { text: "#".repeat(12), align: "right" };
      return { text: fmt === "date" ? formatDate(value, locale) : formatLongDate(value, locale), align: "right" };
    case "time":
    case "timeSec":
    case "hours":
    case "datetime":
      // Отрицательного времени нет: Excel заполняет ячейку решётками, как у отрицательной даты
      if (value < 0) return { text: "#".repeat(12), align: "right" };
      return { text: formatTimeValue(value, fmt, locale), align: "right" };
    case "number":
      return { text: NUMBER_FORMATS[locale].format(value), align: "right" };
    case "percent": {
      const pct = value * 100;
      const text = Number.isInteger(Number(pct.toFixed(6))) ? pct.toFixed(0) : pct.toFixed(2);
      return { text: decimalComma(text, locale) + "%", align: "right" };
    }
    default:
      return { text: formatGeneral(value, locale), align: "right" };
  }
}

// ---------- Плейсхолдеры в текстах шагов ----------

const PLACEHOLDER_RE = /\{fn:([A-Z][A-Z0-9.]*)\}|\{f:(=[^{}]+)\}/g;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** {fn:SUM} → СУММ/SUM, {f:=SUM(B3:D3)} → формула языка ученика (экранирована для вставки в HTML). */
export function renderPlaceholders(text: string, locale: FunctionLocale): string {
  return text.replace(PLACEHOLDER_RE, (_m, fn: string | undefined, formula: string | undefined) =>
    escapeHtml(fn ? functionName(fn, locale) : localizeFormula(formula ?? "", locale)),
  );
}
