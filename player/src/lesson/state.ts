import { offsetCell, parseRange, rangeName } from "../sheet/address";
import type { SheetModel } from "../sheet/sheet-model";

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
export interface LessonState {
  sheet: SheetModel;
  /** Активная ячейка — в поле «Имя»; selection — выделенный диапазон (может совпадать). */
  active: string;
  selection: string;
  editor: EditorState | null;
  /** Ссылки формулы, подсвеченные действием showRefs (без редактора). */
  shownRefs: string[];
}

export function createState(sheet: SheetModel): LessonState {
  return { sheet, active: "A1", selection: "A1", editor: null, shownRefs: [] };
}

export function editorText(editor: EditorState): string {
  return editor.parts.map((p) => p.text).join("");
}

export function editorRefs(editor: EditorState): string[] {
  return editor.parts.filter((p) => p.ref !== undefined).map((p) => p.text);
}

// ---------- Операции над состоянием: из них собираются apply() и animate() действий ----------

export function selectRange(state: LessonState, range: string): void {
  const { start } = parseRange(range);
  state.selection = rangeName(parseRange(range));
  state.active = rangeName({ start, end: start });
  state.shownRefs = [];
}

/** Начать ввод в активную ячейку, если он ещё не начат (как при наборе первого символа в Excel). */
export function ensureEditor(state: LessonState): EditorState {
  state.editor ??= { cell: state.active, parts: [] };
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

/** Enter: записать введённое в ячейку и перейти на строку ниже. */
export function commitEditor(state: LessonState): void {
  const editor = state.editor;
  if (editor) {
    state.sheet.setInput(editor.cell, editorText(editor));
    state.editor = null;
  }
  selectRange(state, offsetCell(state.active, 1, 0));
}
