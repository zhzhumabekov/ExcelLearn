// Показ формул и значений на языке ученика. В уроке и модели листа всё хранится в каноническом
// английском виде (=SUM(C4:C11), 449.63); русский вид — только при отображении.

import type { Fmt } from "../sheet/sheet-model";
import { type CellValue, ExcelError } from "../sheet/evaluator";
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

/** =SUM(B2:D2,1.5) → =СУММ(B2:D2;1,5) для ru; для en — без изменений. */
export function localizeFormula(formula: string, locale: FunctionLocale): string {
  if (locale === "en") return formula;
  const tokens = formula.match(TOKEN_RE) ?? [];
  return tokens
    .map((token, i) => {
      const first = token.charAt(0);
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

function decimalComma(text: string, locale: FunctionLocale): string {
  return locale === "ru" ? text.replace(".", ",") : text;
}

/** «Общий» формат Excel: целые как есть, дробные — до 10 значащих цифр без хвостовых нулей. */
export function formatGeneral(n: number, locale: FunctionLocale): string {
  if (Number.isInteger(n)) return String(n);
  const text = Number(n.toPrecision(10)).toString();
  return decimalComma(text, locale);
}

export function formatValue(value: CellValue, fmt: Fmt, locale: FunctionLocale): DisplayValue {
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
