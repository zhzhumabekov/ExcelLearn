// Инструменты главы 6: «Найти и заменить», мастер «Текст по столбцам», «Мгновенное заполнение» (Ctrl+E)
// и окно «Формат ячеек» (Ctrl+1). Состояние окон и что делают их кнопки; отрисовка — render/dialog.ts.

import { cellName, cellsInRange, parseCell, parseRange } from "../sheet/address";
import type { Fmt } from "../sheet/sheet-model";
import { type LessonState, rememberForUndo, selectRange } from "./state";

// ---------- Найти и заменить ----------

export interface FindReplaceDialog {
  kind: "findReplace";
  fields: { Найти: string; "Заменить на": string };
  focus: "Найти" | "Заменить на" | null;
}

export function openFindReplace(state: LessonState): void {
  state.menu = null;
  state.dialogs.push({ kind: "findReplace", fields: { Найти: "", "Заменить на": "" }, focus: "Найти" });
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * «Заменить все» в выделении (одна выделенная ячейка — весь лист). Ищется во вводе ячеек — в тексте
 * формул тоже, без учёта регистра, как по умолчанию в Excel. → изменённые ячейки и число замен.
 */
export function replaceAll(state: LessonState, find: string, replacement: string): { cells: string[]; count: number } {
  if (!find) throw new Error("«Заменить все»: пустое поле «Найти»");
  const sheet = state.sheet;
  const single = !state.selection.includes(":");
  const extent = sheet.extent();
  const ranges = single ? [`A1:${cellName({ row: extent.rows, col: extent.cols })}`] : [state.selection, ...state.areas];
  const re = new RegExp(escapeRe(find), "giu");
  const cells: string[] = [];
  let count = 0;
  rememberForUndo(state);
  for (const range of ranges) {
    for (const addr of cellsInRange(parseRange(range))) {
      const input = sheet.get(addr).input;
      if (input === null) continue;
      const text = String(input);
      const hits = text.match(re)?.length ?? 0;
      if (!hits) continue;
      sheet.setInput(addr, text.replace(re, replacement));
      cells.push(addr);
      count += hits;
    }
  }
  return { cells, count };
}

// ---------- Текст по столбцам ----------

export const DELIMITERS = ["знак табуляции", "точка с запятой", "запятая", "пробел", "другой"] as const;
export type Delimiter = (typeof DELIMITERS)[number];
export const SPLIT_MODES = ["с разделителями", "фиксированной ширины"] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export interface TextToColumnsDialog {
  kind: "textToColumns";
  step: 1 | 2 | 3;
  source: string;
  mode: SplitMode;
  delimiters: Record<Delimiter, boolean>;
  other: string;
  /** «Поместить в» — левая верхняя ячейка результата. */
  destination: string;
  focus: "другой" | "Поместить в" | null;
}

export function openTextToColumns(state: LessonState): void {
  const { start, end } = parseRange(state.selection);
  if (start.col !== end.col) throw new Error("«Текст по столбцам»: выделите ячейки одного столбца");
  state.dialogs.push({
    kind: "textToColumns",
    step: 1,
    source: state.selection,
    mode: "с разделителями",
    delimiters: { "знак табуляции": true, "точка с запятой": false, запятая: false, пробел: false, другой: false },
    other: "",
    destination: `$${cellName(start).replace(/(\d+)$/, "$$$1")}`,
    focus: null,
  });
}

function delimiterPattern(dialog: TextToColumnsDialog): RegExp | null {
  const chars: string[] = [];
  const d = dialog.delimiters;
  if (d["знак табуляции"]) chars.push("\t");
  if (d["точка с запятой"]) chars.push(";");
  if (d.запятая) chars.push(",");
  if (d.пробел) chars.push(" ");
  if (d.другой && dialog.other) chars.push(dialog.other.charAt(0));
  return chars.length ? new RegExp(`[${chars.map(escapeRe).join("")}]`) : null;
}

/** Части строки по разделителям мастера (для образца в окне и для «Готово»). */
export function splitText(dialog: TextToColumnsDialog, text: string): string[] {
  const re = delimiterPattern(dialog);
  return re ? text.split(re) : [text];
}

/** Строки источника — то, что делит мастер. */
export function sourceTexts(state: LessonState, dialog: TextToColumnsDialog): { addr: string; text: string }[] {
  return cellsInRange(parseRange(dialog.source)).map((addr) => {
    const value = state.sheet.value(addr);
    return { addr, text: value === null ? "" : String(value) };
  });
}

/** «Готово»: части каждой строки — в ячейки справа от «Поместить в»; числа становятся числами. */
export function finishTextToColumns(state: LessonState, dialog: TextToColumnsDialog): string[] {
  const dest = parseCell(dialog.destination.replaceAll("$", "").replace(/^.*!/, ""));
  const filled: string[] = [];
  rememberForUndo(state);
  sourceTexts(state, dialog).forEach(({ text }, i) => {
    splitText(dialog, text).forEach((part, j) => {
      const addr = cellName({ row: dest.row + i, col: dest.col + j });
      state.sheet.setInput(addr, part === "" ? null : part);
      filled.push(addr);
    });
  });
  return filled;
}

// ---------- Мгновенное заполнение ----------

type Case = "same" | "lower" | "upper" | "proper";
type TokenKind = "whole" | "word" | "number";

/** Кусок исходной ячейки: вся ячейка, n-е слово или n-е число (index < 0 — с конца) в нужном регистре. */
interface Atom {
  col: number;
  kind: TokenKind;
  index: number;
  case: Case;
}

type Piece = { atom: Atom } | { literal: string };

function tokens(text: string, kind: TokenKind): string[] {
  if (kind === "whole") return [text];
  const re = kind === "word" ? /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu : /\d+/g;
  return text.match(re) ?? [];
}

function applyCase(text: string, c: Case): string {
  if (c === "lower") return text.toLocaleLowerCase("ru");
  if (c === "upper") return text.toLocaleUpperCase("ru");
  if (c === "proper") return text.replace(/[\p{L}]+/gu, (w) => w.charAt(0).toLocaleUpperCase("ru") + w.slice(1).toLocaleLowerCase("ru"));
  return text;
}

function atomValue(atom: Atom, sources: readonly string[]): string | null {
  const list = tokens(sources[atom.col] ?? "", atom.kind);
  const token = atom.index >= 0 ? list[atom.index] : list[list.length + atom.index];
  return token === undefined ? null : applyCase(token, atom.case);
}

function run(program: readonly Piece[], sources: readonly string[]): string | null {
  let out = "";
  for (const piece of program) {
    if ("literal" in piece) out += piece.literal;
    else {
      const value = atomValue(piece.atom, sources);
      if (value === null) return null;
      out += value;
    }
  }
  return out;
}

/** Все куски исходных ячеек, дающие ровно этот текст (варианты отсчёта с начала и с конца, регистры). */
function atomsFor(text: string, sources: readonly string[]): Atom[] {
  const found: Atom[] = [];
  sources.forEach((source, col) => {
    for (const kind of ["whole", "word", "number"] as const) {
      const list = tokens(source, kind);
      list.forEach((token, i) => {
        for (const c of ["same", "lower", "upper", "proper"] as const) {
          if (applyCase(token, c) !== text) continue;
          // Первое слово — с начала, последнее — с конца (имя и фамилия при отчестве в середине)
          const fromEnd = { col, kind, index: i - list.length, case: c };
          const fromStart = { col, kind, index: i, case: c };
          found.push(...(i === list.length - 1 && i > 0 ? [fromEnd, fromStart] : [fromStart, fromEnd]));
          break;
        }
      });
    }
  });
  return found;
}

/** Разбиения примера на куски и постоянный текст: меньше постоянного текста — лучше. */
function candidatePrograms(example: string, sources: readonly string[], limit = 400): Piece[][] {
  const results: { program: Piece[]; cost: number }[] = [];
  const walk = (pos: number, program: Piece[], cost: number) => {
    if (results.length >= limit) return;
    if (pos === example.length) {
      results.push({ program: [...program], cost });
      return;
    }
    for (let end = example.length; end > pos; end--) {
      for (const atom of atomsFor(example.slice(pos, end), sources)) {
        walk(end, [...program, { atom }], cost + 1);
      }
    }
    // Постоянный символ: склеиваем с предыдущим постоянным куском
    const last = program.at(-1);
    const ch = example.charAt(pos);
    const next = last && "literal" in last ? [...program.slice(0, -1), { literal: last.literal + ch }] : [...program, { literal: ch }];
    walk(pos + 1, next, cost + 10);
  };
  walk(0, [], 0);
  return results.sort((a, b) => a.cost - b.cost).map((r) => r.program);
}

/** Программа, которая даёт все примеры, или null («Мгновенное заполнение» не нашло закономерности). */
export function learnFlashFill(examples: readonly { sources: string[]; output: string }[]): Piece[] | null {
  const [first, ...rest] = examples;
  if (!first) return null;
  for (const program of candidatePrograms(first.output, first.sources)) {
    // Только постоянный текст — это не закономерность (Excel в таком случае ничего не заполняет)
    if (!program.some((piece) => "atom" in piece)) continue;
    if (rest.every((e) => run(program, e.sources) === e.output)) return program;
  }
  return null;
}

const textOf = (state: LessonState, addr: string) => {
  const v = state.sheet.value(addr);
  return v === null ? "" : String(v);
};

/**
 * Ctrl+E в столбце рядом с данными. Примеры — заполненные ячейки над активной (до заголовка или пустой
 * ячейки); источники — заполненные ячейки слева в той же строке (одиночный пустой столбец не обрывает
 * область данных, два подряд — обрывают). Заполняются пустые ячейки вниз, пока слева есть данные.
 * → заполненные ячейки.
 */
export function flashFill(state: LessonState): string[] {
  const sheet = state.sheet;
  const { row: activeRow, col } = parseCell(state.active);
  const sourceCols = (row: number) => {
    const cols: number[] = [];
    let gap = 0;
    for (let c = col - 1; c >= 1 && gap < 2; c--) {
      if (sheet.get(cellName({ row, col: c })).input === null) gap++;
      else {
        gap = 0;
        cols.unshift(c);
      }
    }
    return cols;
  };
  const cols = sourceCols(activeRow);
  if (!cols.length) throw new Error("Мгновенное заполнение: слева от активной ячейки нет данных");
  const sources = (row: number) => cols.map((c) => textOf(state, cellName({ row, col: c })));

  const examples: { sources: string[]; output: string }[] = [];
  for (let row = activeRow - 1; row >= 1; row--) {
    const cell = sheet.get(cellName({ row, col }));
    if (cell.input === null || cell.style === "head" || sources(row).every((s) => s === "")) break;
    examples.unshift({ sources: sources(row), output: textOf(state, cellName({ row, col })) });
  }
  const program = learnFlashFill(examples);
  if (!program) throw new Error("Мгновенное заполнение: по примерам не удалось найти закономерность");

  const filled: string[] = [];
  rememberForUndo(state);
  for (let row = activeRow; sources(row).some((s) => s !== ""); row++) {
    const addr = cellName({ row, col });
    if (sheet.get(addr).input !== null) continue;
    const result = run(program, sources(row));
    if (result === null) continue;
    sheet.setInput(addr, result);
    filled.push(addr);
  }
  if (filled.length) selectRange(state, `${filled[0]}:${filled.at(-1)}`);
  return filled;
}

// ---------- Формат ячеек ----------

export const FORMAT_CATEGORIES = [
  "Общий",
  "Числовой",
  "Денежный",
  "Финансовый",
  "Дата",
  "Время",
  "Процентный",
  "Дробный",
  "Экспоненциальный",
  "Текстовый",
  "Дополнительный",
  "(все форматы)",
] as const;

export interface FormatCellsDialog {
  kind: "formatCells";
  cell: string;
  category: string;
}

const CATEGORY_OF: Record<Fmt, (typeof FORMAT_CATEGORIES)[number]> = {
  general: "Общий",
  number: "Числовой",
  usd: "Денежный",
  kzt: "(все форматы)",
  percent: "Процентный",
  date: "Дата",
};

/** Код формата ячейки в каноническом (английском) виде — его подставляют в ТЕКСТ. */
export function formatCode(fmt: Fmt, locale: "ru" | "en"): string {
  switch (fmt) {
    case "number":
      return "#,##0.00";
    case "usd":
      return '"$"#,##0.00';
    case "kzt":
      return '#,##0 "₸"';
    case "percent":
      return "0%";
    case "date":
      return locale === "ru" ? "dd.mm.yyyy" : "m/d/yyyy";
    default:
      return "General";
  }
}

export function openFormatCells(state: LessonState): void {
  state.dialogs.push({ kind: "formatCells", cell: state.active, category: CATEGORY_OF[state.sheet.get(state.active).fmt] });
}
