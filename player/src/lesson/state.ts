import {
  type CellPos,
  cellName,
  cellsInRange,
  colToLetters,
  formulaRefs,
  offsetCell,
  parseCell,
  parseRange,
  rangeName,
  shiftFormula,
} from "../sheet/address";
import { type CellState, isFormula, type SheetModel } from "../sheet/sheet-model";
import type { Workbook, WorkbookSnapshot } from "../sheet/workbook";
import type { Dialog } from "./dialogs";

/** Кусок текста в редакторе формулы: обычный текст или ссылка, вставленная мышью (цветная). */
export interface EditorPart {
  text: string;
  /** Номер цвета ссылки (0 — синий, 1 — красный…); у обычного текста нет. */
  ref?: number;
}

export interface EditorState {
  cell: string;
  parts: EditorPart[];
}

/**
 * Состояние урока, которое меняют действия. Всё, что видит ученик, рисуется из него, поэтому
 * перемотка (apply всех действий подряд) даёт ту же картинку, что и анимация.
 */
export type RibbonTabId = "home" | "formulas" | "data" | "view";

export interface LessonState {
  /** Активный лист (ярлык которого выбран). Книга — sheet.book. */
  sheet: SheetModel;
  /** Активная ячейка — в поле «Имя»; selection — выделенный диапазон (может совпадать). */
  active: string;
  selection: string;
  /** Части выделения, добавленные с Ctrl (несмежный диапазон), кроме selection. */
  areas: string[];
  editor: EditorState | null;
  /** Ссылки формулы, подсвеченные действием showRefs (без редактора). */
  shownRefs: string[];
  /** Скопированный диапазон (Ctrl+C) — вокруг него «бегущая» рамка. */
  clipboard: string | null;
  /** Снимки книги (ячейки всех листов и имена) до каждого изменения — для Ctrl+Z. */
  undo: WorkbookSnapshot[];
  ribbonTab: RibbonTabId;
  /** Открытое меню кнопки ленты: «Присвоить имя ▾», «Формат ▾» (и подменю «Скрыть или отобразить»),
   *  «Найти и выделить ▾». */
  menu: "defineName" | "format" | "format-hide" | "find" | "freeze" | null;
  /** Скрытые столбцы по листам (буквы). */
  hiddenColumns: Record<string, string[]>;
  /** Закреплённые области по листам: левая верхняя ячейка прокручиваемой части (C9 — строки 1–8 и столбцы A:B). */
  frozen: Record<string, { row: number; col: number } | null>;
  /** Сколько строк прокручено (ушло за верх окна под закреплённой частью) — по листам. */
  scrolled: Record<string, number>;
  /** Раскрыт список поля «Имя». */
  nameListOpen: boolean;
  /** Открытые окна: последнее — сверху (из «Диспетчера имён» открывается «Создание имени»). */
  dialogs: Dialog[];
  /** Контекстное меню (правая кнопка) открыто у этой ячейки. */
  contextMenu: string | null;
  /** Открыта вкладка «Файл» (меню слева: «Сведения», …, «Параметры»). */
  backstage: boolean;
}

export function createState(sheet: SheetModel): LessonState {
  return {
    sheet,
    active: "A1",
    selection: "A1",
    areas: [],
    editor: null,
    shownRefs: [],
    clipboard: null,
    undo: [],
    ribbonTab: "home",
    menu: null,
    hiddenColumns: {},
    frozen: {},
    scrolled: {},
    nameListOpen: false,
    dialogs: [],
    contextMenu: null,
    backstage: false,
  };
}

export function bookOf(state: LessonState): Workbook {
  return state.sheet.book;
}

/** Все части выделения: основная и добавленные с Ctrl (в порядке выделения). */
export function selectionAreas(state: LessonState): string[] {
  return [...state.areas, state.selection];
}

/** Перейти на другой лист (щелчок по ярлыку): выделение — A1, как при первом открытии листа. */
export function switchSheet(state: LessonState, name: string): void {
  if (state.editor) commitEditor(state);
  state.sheet = bookOf(state).sheet(name);
  selectRange(state, "A1");
  state.clipboard = null;
}

export function editorText(editor: EditorState): string {
  return editor.parts.map((p) => p.text).join("");
}

/** Ссылки набранной формулы по порядку появления (и вставленные мышью, и набранные) — для цветных рамок. */
export function editorRefs(editor: EditorState): string[] {
  // Ссылки бывают только в формуле: набранное время «8:30» — не строки 8:30
  const text = editorText(editor);
  return text.startsWith("=") ? formulaRefs(text) : [];
}

// ---------- Операции над состоянием: из них собираются apply() и animate() действий ----------

export function selectRange(state: LessonState, range: string): void {
  const { start } = parseRange(range);
  state.selection = rangeName(parseRange(range));
  state.active = rangeName({ start, end: start });
  state.areas = [];
  state.shownRefs = [];
}

/** Главная → Формат → Скрыть или отобразить → Скрыть столбцы: столбцы выделения скрываются. */
export function hideColumns(state: LessonState, range: string): void {
  const { start, end } = parseRange(range);
  const hidden = new Set(state.hiddenColumns[state.sheet.name] ?? []);
  for (let col = start.col; col <= end.col; col++) hidden.add(colToLetters(col));
  state.hiddenColumns = { ...state.hiddenColumns, [state.sheet.name]: [...hidden].sort() };
}

/** С нажатым Ctrl выделить ещё диапазон: прежнее выделение остаётся частью несмежного диапазона. */
export function addArea(state: LessonState, range: string): void {
  const areas = [...state.areas, state.selection];
  selectRange(state, range);
  state.areas = areas;
}

/** Начать ввод в активную ячейку, если он ещё не начат (как при наборе первого символа в Excel). */
export function ensureEditor(state: LessonState): EditorState {
  if (!state.editor) {
    state.editor = { cell: state.active, parts: [] };
    state.clipboard = null; // как в Excel: начало ввода убирает «бегущую» рамку
  }
  state.shownRefs = [];
  return state.editor;
}

export function typeChars(state: LessonState, text: string): void {
  const editor = ensureEditor(state);
  const last = editor.parts.at(-1);
  if (last && last.ref === undefined) last.text += text;
  else editor.parts.push({ text });
}

/** Ссылка, вставленная щелчком или протягиванием мыши во время ввода формулы. */
export function addRef(state: LessonState, range: string): EditorPart {
  const editor = state.editor;
  if (!editor) throw new Error("Ссылку можно вставить только во время ввода формулы: сначала type: \"=\"");
  const part: EditorPart = { text: rangeName(parseRange(range)), ref: editorRefs(editor).length };
  editor.parts.push(part);
  return part;
}

export function setRef(part: EditorPart, range: string): void {
  part.text = rangeName(parseRange(range));
}

/** Текст окна Excel о циклической ссылке (глава 11). */
export const CIRCULAR_WARNING =
  "Обнаружена одна или несколько циклических ссылок, где формула прямо или косвенно ссылается на свою " +
  "ячейку. Это может привести к неправильным вычислениям. Попробуйте удалить или изменить эти ссылки либо " +
  "переместить формулы в другие ячейки.";

/** Записать ввод в ячейку; если формула замкнула петлю, а итерации выключены, — предупреждение Excel. */
function writeInput(state: LessonState, cell: string, text: string): void {
  state.sheet.setInput(cell, text);
  const book = bookOf(state);
  if (book.isCircular(state.sheet.name, cell) && !book.iteration.enabled) {
    state.dialogs.push({ kind: "alert", text: CIRCULAR_WARNING });
  }
}

/** Tab: записать введённое и перейти на ячейку правее. → ячейка, получившая значение (или null). */
export function commitEditorRight(state: LessonState): string | null {
  const editor = state.editor;
  if (editor) {
    rememberForUndo(state);
    writeInput(state, editor.cell, editorText(editor));
    state.editor = null;
  }
  selectRange(state, offsetCell(state.active, 0, 1));
  return editor?.cell ?? null;
}

/** F2: правка активной ячейки — в редакторе её содержимое (формула или текст), курсор в конце. */
export function editActiveCell(state: LessonState): void {
  if (state.editor) return;
  const { input } = state.sheet.get(state.active);
  state.editor = { cell: state.active, parts: input === null ? [] : [{ text: String(input) }] };
  state.clipboard = null;
}

/** Enter: записать введённое в ячейку и перейти на строку ниже. */
export function commitEditor(state: LessonState): void {
  const editor = state.editor;
  if (editor) {
    rememberForUndo(state);
    writeInput(state, editor.cell, editorText(editor));
    state.editor = null;
  }
  selectRange(state, offsetCell(state.active, 1, 0));
}

export function rememberForUndo(state: LessonState): void {
  state.undo.push(bookOf(state).snapshot());
}

/** Ctrl+Z: вернуть лист к состоянию до последнего изменения. Выделение остаётся. */
export function undo(state: LessonState): void {
  const snapshot = state.undo.pop();
  if (snapshot) bookOf(state).restore(snapshot);
}

/** Скопировать ячейку целиком (ввод + формат), сдвинув относительные ссылки формулы. */
function copyCell(state: LessonState, from: CellPos, to: CellPos): void {
  const source = state.sheet.get(cellName(from));
  const input = isFormula(source.input) ? shiftFormula(source.input, to.row - from.row, to.col - from.col) : source.input;
  state.sheet.setCell(cellName(to), { input, fmt: source.fmt, style: source.style });
}

/**
 * Вставка буфера в выделение (Enter или Ctrl+V). Источник повторяется по выделению, как в Excel;
 * если выделена одна ячейка — вставляется блок размера источника. Enter очищает буфер.
 */
export function pasteClipboard(state: LessonState, keepClipboard: boolean): string[] {
  if (!state.clipboard) return [];
  const source = parseRange(state.clipboard);
  const h = source.end.row - source.start.row + 1;
  const w = source.end.col - source.start.col + 1;
  let target = parseRange(state.selection);
  if (target.start.row === target.end.row && target.start.col === target.end.col) {
    target = { start: target.start, end: { row: target.start.row + h - 1, col: target.start.col + w - 1 } };
  }

  rememberForUndo(state);
  const cells = cellsInRange(target);
  state.sheet.book.batch(() => {
    for (const addr of cells) {
      const to = parseCell(addr);
      const from = {
        row: source.start.row + ((to.row - target.start.row) % h),
        col: source.start.col + ((to.col - target.start.col) % w),
      };
      copyCell(state, from, to);
    }
  });
  state.selection = rangeName(target);
  if (!keepClipboard) state.clipboard = null;
  return cells;
}

/** Маркер заполнения: первая ячейка диапазона копируется в остальные. Возвращает заполненные. */
export function fillRange(state: LessonState, range: string): string[] {
  const { start } = parseRange(range);
  const cells = cellsInRange(range).filter((addr) => addr !== cellName(start));
  rememberForUndo(state);
  state.sheet.book.batch(() => {
    for (const addr of cells) copyCell(state, start, parseCell(addr));
  });
  selectRange(state, range);
  return cells;
}

// Списки автозаполнения Excel: «Понедельник, Вторник…» и месяцы идут по кругу
const AUTOFILL_LISTS = [
  ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"],
  ["пн", "вт", "ср", "чт", "пт", "сб", "вс"],
  ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
];

/** Значение k-го члена ряда по двум первым ячейкам (k = 0, 1, 2…); null — ряд не продолжить. */
function seriesValue(first: CellState["input"], second: CellState["input"], k: number): string | number | null {
  if (typeof first === "number" && typeof second === "number") {
    // Хвосты двоичных дробей убираем: 8:00 + 27 × 20 мин должно дать ровно 17:00 (целые секунды суток)
    const value = first + (second - first) * k;
    const seconds = value * 86_400;
    return Math.abs(seconds - Math.round(seconds)) < 1e-6 ? Math.round(seconds) / 86_400 : Number(value.toPrecision(15));
  }
  if (typeof first === "string" && typeof second === "string" && !first.startsWith("=")) {
    for (const list of AUTOFILL_LISTS) {
      const a = list.indexOf(first.toLowerCase());
      const b = list.indexOf(second.toLowerCase());
      if (a < 0 || b < 0) continue;
      const word = list[(((a + (b - a) * k) % list.length) + list.length) % list.length] as string;
      // Регистр — как у первой ячейки: «Понедельник» → «Вторник»
      return first[0] === first[0]?.toUpperCase() ? word[0]?.toUpperCase() + word.slice(1) : word;
    }
  }
  return null;
}

/**
 * Автозаполнение рядом: выделены две первые ячейки диапазона, маркер тянут до конца. Числа, даты и время
 * продолжаются с тем же шагом, дни недели и месяцы — по кругу; иначе две ячейки повторяются. Формат — от первых.
 */
export function fillSeriesRange(state: LessonState, range: string): string[] {
  const cells = cellsInRange(range);
  const [a, b] = cells.map((addr) => state.sheet.get(addr));
  if (!a || !b) throw new Error(`Автозаполнение: в ${range} меньше двух ячеек`);
  rememberForUndo(state);
  const filled = cells.slice(2);
  state.sheet.book.batch(() => {
    filled.forEach((addr, i) => {
      const k = i + 2;
      const source = k % 2 === 0 ? a : b;
      const value = seriesValue(a.input, b.input, k);
      if (value === null) copyCell(state, parseCell(cells[k % 2] as string), parseCell(addr));
      else state.sheet.setCell(addr, { input: value, fmt: source.fmt, style: source.style });
    });
  });
  selectRange(state, range);
  return filled;
}

/**
 * Какой диапазон предложит автосумма (Alt+=) для ячейки: сплошной блок чисел над ней,
 * а если сверху чисел нет — слева. null, если суммировать нечего.
 */
export function autosumRange(sheet: SheetModel, addr: string): string | null {
  const at = parseCell(addr);
  const isNumber = (row: number, col: number) => row >= 1 && col >= 1 && typeof sheet.value(cellName({ row, col })) === "number";
  for (const [dRow, dCol] of [
    [-1, 0],
    [0, -1],
  ] as const) {
    let row = at.row + dRow;
    let col = at.col + dCol;
    if (!isNumber(row, col)) continue;
    const end = { row, col };
    while (isNumber(row + dRow, col + dCol)) {
      row += dRow;
      col += dCol;
    }
    return rangeName(parseRange(`${cellName({ row, col })}:${cellName(end)}`));
  }
  return null;
}

// ---------- F4: тип ссылки ----------

const CELL_REF_RE = /^(\$?)([A-Z]{1,3})(\$?)([1-9][0-9]*)$/;

/** Следующий тип ссылки, как по F4 в Excel: A1 → $A$1 → A$1 → $A1 → A1 (у диапазона — обе части). */
export function cycleAbsolute(ref: string): string {
  return ref
    .split(":")
    .map((cell) => {
      const [, colAbs, col, rowAbs, row] = CELL_REF_RE.exec(cell) ?? [];
      if (!col || !row) return cell;
      const [nextCol, nextRow] = colAbs && rowAbs ? ["", "$"] : rowAbs ? ["$", ""] : colAbs ? ["", ""] : ["$", "$"];
      return `${nextCol}${col}${nextRow}${row}`;
    })
    .join(":");
}

const REF_IN_TEXT_RE = /\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?/g;

/** F4 во время ввода формулы: меняет тип последней ссылки (той, у которой стоит курсор ввода). */
export function toggleLastRef(state: LessonState): void {
  const editor = state.editor;
  if (!editor) throw new Error("F4 меняет ссылку только во время ввода формулы");
  for (let i = editor.parts.length - 1; i >= 0; i--) {
    const part = editor.parts[i];
    const match = part && [...part.text.matchAll(REF_IN_TEXT_RE)].at(-1);
    if (part && match) {
      const end = match.index + match[0].length;
      part.text = part.text.slice(0, match.index) + cycleAbsolute(match[0]) + part.text.slice(end);
      return;
    }
  }
  throw new Error("F4: в формуле ещё нет ссылки");
}

// ---------- Кнопка «Σ Автосумма» на ленте ----------

/**
 * Автосумма с ленты. Одна ячейка — как Alt+= (формула открывается для проверки). Диапазон — Excel сразу
 * вписывает =SUM(…) в каждую пустую ячейку: сумма блока чисел над ней (или слева). → заполненные ячейки.
 */
export function ribbonAutosum(state: LessonState): string[] {
  const cells = cellsInRange(state.selection);
  if (cells.length === 1) {
    const range = autosumRange(state.sheet, state.active);
    ensureEditor(state);
    typeChars(state, "=SUM(");
    if (range) addRef(state, range);
    typeChars(state, ")");
    return [];
  }
  rememberForUndo(state);
  const filled: string[] = [];
  for (const addr of cells) {
    if (state.sheet.get(addr).input !== null) continue;
    const range = autosumRange(state.sheet, addr);
    if (!range) continue;
    state.sheet.setInput(addr, `=SUM(${range})`);
    filled.push(addr);
  }
  return filled;
}
