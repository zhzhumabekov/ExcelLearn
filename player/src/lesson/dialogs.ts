// Окна Excel для имён диапазонов (глава 2) — состояние и что делают их кнопки. Отрисовка — render/dialog.ts.
// Здесь только операции над LessonState: из них собираются apply() и animate() действий dialog*.

import functionsRu from "../locale/functions-ru.json";
import { cellName, cellsInRange, parseRange, rangeName } from "../sheet/address";
import {
  absoluteRef,
  applyNames,
  type NameArea,
  type NameDef,
  nameFromLabel,
  nameProblem,
  refersToText,
  sameName,
} from "../sheet/names";
import { parseRefersTo } from "./book";
import {
  bookOf,
  ensureEditor,
  type LessonState,
  rememberForUndo,
  selectionAreas,
  selectRange,
  switchSheet,
  typeChars,
} from "./state";
import {
  DELIMITERS,
  type Delimiter,
  FORMAT_CATEGORIES,
  type FindReplaceDialog,
  type FormatCellsDialog,
  finishTextToColumns,
  replaceAll,
  SPLIT_MODES,
  type SplitMode,
  type TextToColumnsDialog,
} from "./text-tools";

export const CREATE_CHECKS = ["в строке выше", "в столбце слева", "в строке ниже", "в столбце справа"] as const;
export type CreateCheck = (typeof CREATE_CHECKS)[number];

export const BOOK_SCOPE = "Книга";

export interface AlertDialog {
  kind: "alert";
  text: string;
  /** Что сделать по OK (подтверждение удаления имён). */
  confirm?: { deleteNames: string[] };
}

export interface CreateFromSelectionDialog {
  kind: "createFromSelection";
  areas: string[];
  checks: Record<CreateCheck, boolean>;
}

/** «Создание имени» / «Изменение имени». Поля — как подписи в окне Excel. */
export interface NameDialog {
  kind: "name";
  original: { name: string; scope: string | null } | null;
  fields: { Имя: string; Область: string; Примечание: string; Диапазон: string };
  focus: keyof NameDialog["fields"] | null;
  /** Активная ячейка при открытии окна — от неё считаются относительные ссылки («предыдущий_год»). */
  base: { sheet: string; cell: string };
}

export interface NameManagerDialog {
  kind: "nameManager";
  selected: string[];
}

export interface PasteNameDialog {
  kind: "pasteName";
  selected: string | null;
}

export interface ApplyNamesDialog {
  kind: "applyNames";
  selected: string[];
}

export type Dialog =
  | AlertDialog
  | CreateFromSelectionDialog
  | NameDialog
  | NameManagerDialog
  | PasteNameDialog
  | ApplyNamesDialog
  | FindReplaceDialog
  | TextToColumnsDialog
  | FormatCellsDialog;

export const DIALOG_TITLES: Record<Dialog["kind"], string> = {
  alert: "Microsoft Excel",
  createFromSelection: "Создание имён из выделенного диапазона",
  name: "Создание имени",
  nameManager: "Диспетчер имён",
  pasteName: "Вставка имени",
  applyNames: "Применение имён",
  findReplace: "Найти и заменить",
  textToColumns: "Мастер распределения текста по столбцам",
  formatCells: "Формат ячеек",
};

// ---------- Имена: ключи строк и что видно с листа ----------

/** Строка списка имён: «jam» или «jam (Лист2)» — если имя с областью «лист». */
export function nameKey(def: NameDef): string {
  return def.scope ? `${def.name} (${def.scope})` : def.name;
}

function findByKey(state: LessonState, key: string): NameDef {
  const def = bookOf(state).names.find((d) => sameName(nameKey(d), key));
  if (!def) throw new Error(`Нет имени «${key}» в книге`);
  return def;
}

/** Имена, видимые с активного листа: имена книги и имена этого листа (список поля «Имя», «Вставка имени»). */
export function visibleNames(state: LessonState): NameDef[] {
  return bookOf(state).names.filter((d) => d.scope === null || d.scope === state.sheet.name);
}

export function topDialog(state: LessonState): Dialog {
  const dialog = state.dialogs.at(-1);
  if (!dialog) throw new Error("Нет открытого окна");
  return dialog;
}

function topOf<K extends Dialog["kind"]>(state: LessonState, kind: K): Extract<Dialog, { kind: K }> {
  const dialog = topDialog(state);
  if (dialog.kind !== kind) throw new Error(`Открыто окно «${DIALOG_TITLES[dialog.kind]}», а не «${DIALOG_TITLES[kind]}»`);
  return dialog as Extract<Dialog, { kind: K }>;
}

function alert(state: LessonState, text: string): void {
  state.dialogs.push({ kind: "alert", text });
}

// ---------- Поле «Имя» ----------

const REF_LIKE_RE = /^\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?$/i;

/** Выделить диапазон имени: Excel переходит на его лист; несмежное имя выделяется всеми частями. */
export function selectName(state: LessonState, def: NameDef): void {
  const [first] = def.areas;
  if (!first) return;
  if (first.sheet !== state.sheet.name) switchSheet(state, first.sheet);
  const refs = def.areas.filter((a) => a.sheet === first.sheet).map((a) => a.ref.replaceAll("$", ""));
  selectRange(state, refs.at(-1) ?? "A1");
  state.areas = refs.slice(0, -1);
}

/**
 * Набрали текст в поле «Имя» и нажали Enter. Адрес (B7) — переход к ячейке; существующее имя — выделение
 * его диапазона; новое имя — имя выделенному (в т. ч. несмежному) диапазону с областью «книга».
 */
export function nameBoxEnter(state: LessonState, text: string): void {
  state.nameListOpen = false;
  if (REF_LIKE_RE.test(text)) {
    selectRange(state, text.toUpperCase().replaceAll("$", ""));
    return;
  }
  const existing = visibleNames(state).find((d) => sameName(d.name, text));
  if (existing) {
    selectName(state, existing);
    return;
  }
  const problem = nameProblem(text);
  if (problem) {
    alert(state, problem);
    return;
  }
  rememberForUndo(state);
  bookOf(state).defineName({
    name: text,
    areas: selectionAreas(state).map((ref) => ({ sheet: state.sheet.name, ref: absoluteRef(ref) })),
    scope: null,
  });
}

/** Список поля «Имя»: щелчок по имени. */
export function pickFromNameList(state: LessonState, name: string): void {
  const def = visibleNames(state).find((d) => sameName(d.name, name));
  if (!def) throw new Error(`В списке поля «Имя» нет «${name}»`);
  state.nameListOpen = false;
  selectName(state, def);
}

// ---------- Открытие окон ----------

function isText(state: LessonState, row: number, col: number): boolean {
  return typeof state.sheet.value(cellName({ row, col })) === "string";
}

/** «Создать из выделенного»: Excel сам ставит флажки, где видит подписи — текст в первой строке / столбце. */
export function openCreateFromSelection(state: LessonState): void {
  const { start, end } = parseRange(state.selection);
  const all = (from: number, to: number, test: (i: number) => boolean) => {
    for (let i = from; i <= to; i++) if (!test(i)) return false;
    return true;
  };
  // Подписи сверху: текст во всех ячейках первой строки (кроме угла); слева — во всех ячейках первого столбца
  const top = end.row > start.row && all(start.col + 1, end.col, (col) => isText(state, start.row, col));
  const left = end.col > start.col && all(start.row + (top ? 1 : 0), end.row, (row) => isText(state, row, start.col));
  state.dialogs.push({
    kind: "createFromSelection",
    areas: selectionAreas(state),
    checks: { "в строке выше": top, "в столбце слева": left, "в строке ниже": false, "в столбце справа": false },
  });
}

function selectionRefersTo(state: LessonState): string {
  return refersToText({
    name: "",
    scope: null,
    areas: selectionAreas(state).map((ref) => ({ sheet: state.sheet.name, ref: absoluteRef(ref) })),
  });
}

/** «Присвоить имя» (или «Создать…» в диспетчере): поле «Диапазон» — выделенный диапазон. */
export function openNewName(state: LessonState): void {
  state.dialogs.push({
    kind: "name",
    original: null,
    fields: { Имя: "", Область: BOOK_SCOPE, Примечание: "", Диапазон: selectionRefersTo(state) },
    focus: "Имя",
    base: { sheet: state.sheet.name, cell: state.active },
  });
}

function openEditName(state: LessonState, def: NameDef): void {
  state.dialogs.push({
    kind: "name",
    original: { name: def.name, scope: def.scope },
    fields: {
      Имя: def.name,
      Область: def.scope ?? BOOK_SCOPE,
      Примечание: def.comment ?? "",
      Диапазон: refersToText(def),
    },
    focus: "Имя",
    base: def.base ?? { sheet: state.sheet.name, cell: state.active },
  });
}

export function openNameManager(state: LessonState): void {
  state.dialogs.push({ kind: "nameManager", selected: [] });
}

export function openPasteName(state: LessonState): void {
  const first = visibleNames(state)[0];
  state.dialogs.push({ kind: "pasteName", selected: first ? first.name : null });
}

/** «Применить имена…»: все имена листа выбраны, как в Excel. */
export function openApplyNames(state: LessonState): void {
  state.menu = null;
  state.dialogs.push({ kind: "applyNames", selected: visibleNames(state).map((d) => d.name) });
}

// ---------- Поля, флажки, списки ----------

export function dialogFieldText(state: LessonState, field: string, text: string): void {
  const top = topDialog(state);
  if (top.kind === "findReplace") {
    if (field !== "Найти" && field !== "Заменить на") throw new Error(`В окне «Найти и заменить» нет поля «${field}»`);
    top.fields[field] = text;
    top.focus = field;
    return;
  }
  if (top.kind === "textToColumns") {
    if (field === "другой" && top.step === 2) {
      // Набор символа в поле «другой» отмечает и сам флажок, как в Excel
      top.other = text;
      top.delimiters.другой = text !== "" || top.delimiters.другой;
    } else if (field === "Поместить в" && top.step === 3) top.destination = text;
    else throw new Error(`На шаге ${top.step} мастера нет поля «${field}»`);
    top.focus = field;
    return;
  }
  const dialog = topOf(state, "name");
  if (!(field in dialog.fields)) throw new Error(`В окне «${DIALOG_TITLES.name}» нет поля «${field}»`);
  const key = field as keyof NameDialog["fields"];
  dialog.fields[key] = text;
  dialog.focus = key;
}

/** Диапазон, выделенный мышью при активном поле ссылки: Excel вписывает абсолютную ссылку с листом. */
export function dialogFieldRange(state: LessonState, field: string, range: string): void {
  dialogFieldText(state, field, `=${refersToText({ name: "", scope: null, areas: [{ sheet: state.sheet.name, ref: absoluteRef(range) }] }).slice(1)}`);
}

export function dialogToggle(state: LessonState, label: string): void {
  const top = topDialog(state);
  if (top.kind === "textToColumns") {
    if (top.step === 1 && SPLIT_MODES.includes(label as SplitMode)) top.mode = label as SplitMode;
    else if (top.step === 2 && DELIMITERS.includes(label as Delimiter)) {
      top.delimiters[label as Delimiter] = !top.delimiters[label as Delimiter];
    } else throw new Error(`На шаге ${top.step} мастера нет флажка «${label}»`);
    return;
  }
  const dialog = topOf(state, "createFromSelection");
  if (!CREATE_CHECKS.includes(label as CreateCheck)) throw new Error(`Нет флажка «${label}»`);
  dialog.checks[label as CreateCheck] = !dialog.checks[label as CreateCheck];
}

/** Варианты раскрывающегося списка «Область»: книга и листы. */
export function scopeOptions(state: LessonState): string[] {
  return [BOOK_SCOPE, ...bookOf(state).sheets.map((s) => s.name)];
}

export function dialogChooseOption(state: LessonState, field: string, option: string): void {
  const dialog = topOf(state, "name");
  if (field !== "Область") throw new Error(`Раскрывающийся список есть только у поля «Область», не «${field}»`);
  if (!scopeOptions(state).includes(option)) throw new Error(`В списке «Область» нет «${option}»`);
  dialog.fields.Область = option;
  dialog.focus = "Область";
}

/** Строки списка открытого окна — то, по чему можно щёлкнуть. */
export function dialogItems(state: LessonState, dialog: Dialog): string[] {
  if (dialog.kind === "nameManager") return bookOf(state).names.map(nameKey);
  if (dialog.kind === "pasteName" || dialog.kind === "applyNames") return visibleNames(state).map((d) => d.name);
  if (dialog.kind === "formatCells") return [...FORMAT_CATEGORIES];
  return [];
}

/** Щелчок по строке списка; с Ctrl — добавить/убрать, с Shift — до строки (как в Excel). */
export function dialogPickItem(state: LessonState, item: string, add: "ctrl" | "shift" | null = null): void {
  const dialog = topDialog(state);
  const items = dialogItems(state, dialog);
  const found = items.find((i) => sameName(i, item));
  if (!found) throw new Error(`В списке окна нет «${item}»`);
  if (dialog.kind === "pasteName") {
    dialog.selected = found;
    return;
  }
  if (dialog.kind === "formatCells") {
    dialog.category = found;
    return;
  }
  if (dialog.kind !== "nameManager" && dialog.kind !== "applyNames") throw new Error("В этом окне нет списка");
  if (add === "ctrl" || (dialog.kind === "applyNames" && add === null)) {
    // В «Применении имён» щелчок переключает строку (множественный выбор без клавиш)
    dialog.selected = dialog.selected.includes(found)
      ? dialog.selected.filter((s) => s !== found)
      : [...dialog.selected, found];
  } else if (add === "shift" && dialog.selected.length) {
    const from = items.indexOf(dialog.selected[0] as string);
    const to = items.indexOf(found);
    dialog.selected = items.slice(Math.min(from, to), Math.max(from, to) + 1);
  } else {
    dialog.selected = [found];
  }
}

// ---------- Кнопки ----------

function createFromSelection(state: LessonState, dialog: CreateFromSelectionDialog): void {
  const sheet = state.sheet.name;
  const label = (row: number, col: number) => {
    const value = state.sheet.value(cellName({ row, col }));
    return value === null ? null : nameFromLabel(String(value));
  };
  const area = (from: { row: number; col: number }, to: { row: number; col: number }): NameArea => ({
    sheet,
    ref: absoluteRef(rangeName({ start: from, end: to })),
  });
  const book = bookOf(state);
  rememberForUndo(state);
  for (const range of dialog.areas) {
    const { start, end } = parseRange(range);
    const c = dialog.checks;
    const r1 = start.row + (c["в строке выше"] ? 1 : 0);
    const r2 = end.row - (c["в строке ниже"] ? 1 : 0);
    const c1 = start.col + (c["в столбце слева"] ? 1 : 0);
    const c2 = end.col - (c["в столбце справа"] ? 1 : 0);
    const define = (name: string | null, a: NameArea) => {
      if (name) book.defineName({ name, areas: [a], scope: null });
    };
    for (let col = c1; col <= c2; col++) {
      if (c["в строке выше"]) define(label(start.row, col), area({ row: r1, col }, { row: r2, col }));
      if (c["в строке ниже"]) define(label(end.row, col), area({ row: r1, col }, { row: r2, col }));
    }
    for (let row = r1; row <= r2; row++) {
      if (c["в столбце слева"]) define(label(row, start.col), area({ row, col: c1 }, { row, col: c2 }));
      if (c["в столбце справа"]) define(label(row, end.col), area({ row, col: c1 }, { row, col: c2 }));
    }
  }
}

/** Есть ли в ссылке относительные части (B6, B$6, $B6 — без $ перед буквой или номером): тогда имя
 *  «запоминает» ячейку, где его создали, и сдвигается вместе с формулой («предыдущий_год»). */
function hasRelativePart(areas: NameArea[]): boolean {
  return areas.some((a) => /(^|:)[A-Z]|[A-Z][0-9]|(^|:)[0-9]/.test(a.ref));
}

function saveName(state: LessonState, dialog: NameDialog): boolean {
  const { Имя: name, Область: scopeText, Примечание: comment, Диапазон: refersTo } = dialog.fields;
  const problem = nameProblem(name);
  if (problem) {
    alert(state, problem);
    return false;
  }
  const scope = scopeText === BOOK_SCOPE ? null : scopeText;
  const areas = parseRefersTo(refersTo, dialog.base.sheet);
  const book = bookOf(state);
  rememberForUndo(state);
  if (dialog.original) book.deleteName(dialog.original.name, dialog.original.scope);
  book.defineName({
    name,
    areas,
    scope,
    comment: comment || undefined,
    base: hasRelativePart(areas) ? { ...dialog.base } : undefined,
  });
  return true;
}

/** Список имён на лист (F3 → «Все имена»): имя и ссылка, начиная с активной ячейки. → заполненные ячейки. */
function pasteList(state: LessonState): string[] {
  const { row, col } = parseRange(state.active).start;
  const filled: string[] = [];
  rememberForUndo(state);
  visibleNames(state).forEach((def, i) => {
    const nameCell = cellName({ row: row + i, col });
    const refCell = cellName({ row: row + i, col: col + 1 });
    state.sheet.setInput(nameCell, def.name);
    state.sheet.setInput(refCell, `'${refersToText(def)}`);
    filled.push(nameCell, refCell);
  });
  return filled;
}

function applyNamesToSelection(state: LessonState, dialog: ApplyNamesDialog): string[] {
  const names = visibleNames(state).filter((d) => dialog.selected.includes(d.name));
  const changed: string[] = [];
  rememberForUndo(state);
  for (const range of selectionAreas(state)) {
    const { start, end } = parseRange(range);
    const extent = state.sheet.extent();
    const area = { start, end: { row: Math.min(end.row, extent.rows), col: Math.min(end.col, extent.cols) } };
    for (const addr of cellsInRange(area)) {
      const formula = state.sheet.formula(addr);
      if (!formula) continue;
      const next = applyNames(formula, state.sheet.name, names);
      if (next !== formula) {
        state.sheet.setInput(addr, next);
        changed.push(addr);
      }
    }
  }
  return changed;
}

const closeTop = (state: LessonState) => void state.dialogs.pop();

/** Кнопка окна. → ячейки, получившие новые значения (для вспышки). */
export function pressDialogButton(state: LessonState, label: string): string[] {
  const dialog = topDialog(state);
  if (label === "Отмена" || (label === "Закрыть" && dialog.kind === "nameManager")) {
    closeTop(state);
    return [];
  }
  switch (dialog.kind) {
    case "alert":
      if (label !== "OK") break;
      closeTop(state);
      if (dialog.confirm) {
        rememberForUndo(state);
        for (const key of dialog.confirm.deleteNames) {
          const def = findByKey(state, key);
          bookOf(state).deleteName(def.name, def.scope);
        }
        const manager = state.dialogs.at(-1);
        if (manager?.kind === "nameManager") manager.selected = [];
      }
      return [];
    case "createFromSelection":
      if (label !== "OK") break;
      closeTop(state);
      createFromSelection(state, dialog);
      return [];
    case "name":
      if (label !== "OK") break;
      if (saveName(state, dialog)) state.dialogs.splice(state.dialogs.indexOf(dialog), 1);
      return [];
    case "nameManager":
      if (label === "Создать…") {
        openNewName(state);
        return [];
      }
      if (label === "Изменить…") {
        const [key] = dialog.selected;
        if (!key) throw new Error("«Изменить…»: в диспетчере не выбрано имя");
        openEditName(state, findByKey(state, key));
        return [];
      }
      if (label === "Удалить") {
        if (!dialog.selected.length) throw new Error("«Удалить»: в диспетчере не выбраны имена");
        const what = dialog.selected.length === 1 ? `имя ${dialog.selected[0]}` : "выбранные имена";
        state.dialogs.push({
          kind: "alert",
          text: `Вы действительно хотите удалить ${what}?`,
          confirm: { deleteNames: [...dialog.selected] },
        });
        return [];
      }
      break;
    case "pasteName":
      if (label === "Все имена") {
        closeTop(state);
        return pasteList(state);
      }
      if (label === "OK") {
        closeTop(state);
        if (!dialog.selected) return [];
        const editor = ensureEditor(state);
        if (editor.parts.length === 0) typeChars(state, "=");
        typeChars(state, dialog.selected);
        return [];
      }
      break;
    case "applyNames":
      if (label !== "OK") break;
      closeTop(state);
      return applyNamesToSelection(state, dialog);
    case "findReplace": {
      if (label === "Закрыть") {
        closeTop(state);
        return [];
      }
      if (label !== "Заменить все") break;
      const { cells, count } = replaceAll(state, dialog.fields.Найти, dialog.fields["Заменить на"]);
      alert(state, `Все готово. Выполнено замен: ${count}.`);
      return cells;
    }
    case "textToColumns":
      if (label === "Далее >" && dialog.step < 3) {
        dialog.step = (dialog.step + 1) as 2 | 3;
        return [];
      }
      if (label === "< Назад" && dialog.step > 1) {
        dialog.step = (dialog.step - 1) as 1 | 2;
        return [];
      }
      if (label === "Готово") {
        closeTop(state);
        return finishTextToColumns(state, dialog);
      }
      break;
    case "formatCells":
      if (label !== "OK") break;
      closeTop(state);
      return [];
  }
  throw new Error(`В окне «${DIALOG_TITLES[dialog.kind]}» нет кнопки «${label}»`);
}

/** Кнопки окна по порядку — для отрисовки и наведения курсора. */
export function dialogButtons(dialog: Dialog): string[] {
  switch (dialog.kind) {
    case "alert":
      return dialog.confirm ? ["OK", "Отмена"] : ["OK"];
    case "nameManager":
      return ["Создать…", "Изменить…", "Удалить", "Закрыть"];
    case "pasteName":
      return ["Все имена", "OK", "Отмена"];
    case "findReplace":
      return ["Заменить все", "Закрыть"];
    case "textToColumns":
      return ["Отмена", "< Назад", "Далее >", "Готово"];
    default:
      return ["OK", "Отмена"];
  }
}

// ---------- Автозавершение формулы ----------

const PARTIAL_RE = /(?:^=|[=(,;+\-*/^&<> ])([\p{L}_][\p{L}\p{N}_.]*)$/u;

/** Набираемое имя в конце формулы (=СРЗНАЧ(В → «В») или null. */
export function partialName(text: string): string | null {
  return PARTIAL_RE.exec(text)?.[1] ?? null;
}

const RU_FUNCTIONS: Readonly<Record<string, string>> = functionsRu.functions;

export interface Suggestion {
  /** Как показано в списке (на языке ученика). */
  label: string;
  /** Что вставить в формулу (функции — английское имя и «(»). */
  insert: string;
  kind: "function" | "name";
}

/** Список автозавершения: функции и имена, начинающиеся с набранного (как в Excel 2019). */
export function suggestions(state: LessonState, partial: string, locale: "ru" | "en"): Suggestion[] {
  const lower = partial.toLocaleLowerCase("ru");
  const functions = Object.entries(RU_FUNCTIONS)
    .map(([en, ru]) => ({ label: locale === "ru" ? ru : en, insert: `${en}(`, kind: "function" as const }))
    .filter((s) => s.label.toLocaleLowerCase("ru").startsWith(lower));
  const names = visibleNames(state)
    .filter((d) => d.name.toLocaleLowerCase("ru").startsWith(lower))
    .map((d) => ({ label: d.name, insert: d.name, kind: "name" as const }));
  return [...names, ...functions].sort((a, b) => a.label.localeCompare(b.label, "ru")).slice(0, 10);
}

/** Двойной щелчок по строке списка автозавершения: набранное начало заменяется полным именем. */
export function acceptSuggestion(state: LessonState, label: string, locale: "ru" | "en"): void {
  const editor = state.editor;
  const last = editor?.parts.at(-1);
  const text = editor ? editor.parts.map((p) => p.text).join("") : "";
  const partial = partialName(text);
  if (!editor || !last || last.ref !== undefined || partial === null || !last.text.endsWith(partial)) {
    throw new Error("Автозавершение: в формуле не набрано начало имени");
  }
  // Имя функции ищем на обоих языках: урок пишет «СРЗНАЧ» или «AVERAGE», а вставка одна и та же
  const other = locale === "ru" ? "en" : "ru";
  const found = [...suggestions(state, partial, locale), ...suggestions(state, partial, other)].find((s) =>
    sameName(s.label, label),
  );
  if (!found) throw new Error(`В списке автозавершения для «${partial}» нет «${label}»`);
  last.text = last.text.slice(0, -partial.length) + found.insert;
}
