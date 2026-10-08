import { cellName, colToLetters, lettersToCol, parseCell, parseRange } from "../sheet/address";
import { type CellState, isFormula, type SheetModel } from "../sheet/sheet-model";
import { type FunctionLocale, formatGeneral, formatValue, localizeFormula } from "../locale/format";

export const DEFAULT_COLUMN_WIDTH = 64;
export const ROW_HEADER_WIDTH = 40;

/** Размер видимой сетки: колонки из урока и все заполненные ячейки плюс одна про запас. */
export function gridSize(sheet: SheetModel): { cols: number; rows: number } {
  let cols = Math.max(0, ...Object.keys(sheet.columns).map(lettersToCol));
  let rows = 0;
  for (const addr of sheet.addresses()) {
    const { col, row } = parseCell(addr);
    cols = Math.max(cols, col);
    rows = Math.max(rows, row);
  }
  return { cols: cols + 1, rows: sheet.rows ?? rows + 2 };
}

/** Что показывает строка формул для ячейки: формула или введённое значение на языке ученика. */
export function formulaBarText(cell: Readonly<CellState>, locale: FunctionLocale): string {
  const { input } = cell;
  if (input === null) return "";
  if (isFormula(input)) return localizeFormula(input, locale);
  if (typeof input === "number") return formatGeneral(input, locale);
  return input;
}

/** Таблица-сетка листа. Знает только про отрисовку ячеек; выделение и анимация — поверх неё. */
export class GridView {
  readonly table: HTMLTableElement;
  readonly cols: number;
  readonly rows: number;
  private cells = new Map<string, HTMLTableCellElement>();
  private headers = new Map<string, HTMLTableCellElement>();

  constructor(
    private readonly sheet: SheetModel,
    private locale: FunctionLocale,
  ) {
    ({ cols: this.cols, rows: this.rows } = gridSize(sheet));
    this.table = document.createElement("table");
    this.table.className = "xl-grid";
    this.build();
    this.renderAll();
  }

  cell(addr: string): HTMLTableCellElement {
    const td = this.cells.get(addr);
    if (!td) throw new Error(`Ячейка ${addr} вне видимой сетки`);
    return td;
  }

  setLocale(locale: FunctionLocale): void {
    this.locale = locale;
    this.renderAll();
  }

  renderAll(): void {
    for (const addr of this.cells.keys()) this.renderCell(addr);
  }

  renderCell(addr: string): void {
    const td = this.cell(addr);
    const state = this.sheet.get(addr);
    const display = formatValue(state.value, state.fmt, this.locale);

    td.className = ["xl-cell", `xl-${display.align}`, state.style ? `xl-${state.style}` : ""].filter(Boolean).join(" ");
    if (display.currency) {
      td.replaceChildren(span("xl-acc", [span("", display.currency), span("", display.text)]));
    } else {
      td.textContent = display.text;
    }
  }

  /** Подсветка заголовков строк и столбцов выделенного диапазона, как в Excel. */
  highlightHeaders(range: string | null): void {
    for (const th of this.headers.values()) th.classList.remove("xl-hl");
    if (!range) return;
    const { start, end } = parseRange(range);
    for (let col = start.col; col <= end.col; col++) this.headers.get(colToLetters(col))?.classList.add("xl-hl");
    for (let row = start.row; row <= end.row; row++) this.headers.get(String(row))?.classList.add("xl-hl");
  }

  private build(): void {
    const colgroup = document.createElement("colgroup");
    colgroup.append(colWidth(ROW_HEADER_WIDTH));
    for (let col = 1; col <= this.cols; col++) {
      colgroup.append(colWidth(this.sheet.columns[colToLetters(col)] ?? DEFAULT_COLUMN_WIDTH));
    }

    const head = document.createElement("tr");
    head.append(document.createElement("th"));
    for (let col = 1; col <= this.cols; col++) {
      const letters = colToLetters(col);
      head.append(this.header(letters, "xl-colh"));
    }

    const body = document.createElement("tbody");
    body.append(head);
    for (let row = 1; row <= this.rows; row++) {
      const tr = document.createElement("tr");
      tr.append(this.header(String(row), "xl-rowh"));
      for (let col = 1; col <= this.cols; col++) {
        const addr = cellName({ col, row });
        const td = document.createElement("td");
        td.dataset.addr = addr;
        this.cells.set(addr, td);
        tr.append(td);
      }
      body.append(tr);
    }
    this.table.replaceChildren(colgroup, body);
  }

  private header(label: string, className: string): HTMLTableCellElement {
    const th = document.createElement("th");
    th.className = className;
    th.textContent = label;
    this.headers.set(label, th);
    return th;
  }
}

function colWidth(px: number): HTMLTableColElement {
  const col = document.createElement("col");
  col.style.width = `${px}px`;
  return col;
}

function span(className: string, content: string | Node[]): HTMLSpanElement {
  const el = document.createElement("span");
  if (className) el.className = className;
  if (typeof content === "string") el.textContent = content;
  else el.append(...content);
  return el;
}
