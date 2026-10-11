import { cellName, colToLetters, lettersToCol, parseCell, parseRange } from "../sheet/address";
import { type CellState, isFormula, type SheetModel } from "../sheet/sheet-model";
import { type Fits, type FunctionLocale, formatDate, formatGeneral, formatValue, localizeFormula } from "../locale/format";

export const DEFAULT_COLUMN_WIDTH = 64;
export const ROW_HEADER_WIDTH = 40;
const CELL_FONT = '14px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
const CELL_PADDING_PX = 16; // 7px слева и справа + граница
const CURRENCY_GAP_PX = 6;

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Ширина текста шрифтом ячейки; null — измерить нечем (тестовая среда без canvas). */
function textWidth(text: string): number | null {
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement("canvas").getContext("2d");
    } catch {
      measureContext = null; // jsdom без пакета canvas
    }
    if (measureContext) measureContext.font = CELL_FONT;
  }
  return measureContext ? measureContext.measureText(text).width : null;
}

/** Помещается ли число в колонку шириной widthPx — как решает Excel, показывать ли «#####». */
export function fitsIn(widthPx: number): Fits {
  return (display) => {
    const text = textWidth(display.text);
    if (text === null) return true;
    const currency = display.currency ? (textWidth(display.currency) ?? 0) + CURRENCY_GAP_PX : 0;
    return text + currency + CELL_PADDING_PX <= widthPx;
  };
}

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
  if (typeof input === "number") return cell.fmt === "date" || cell.fmt === "dateLong" ? formatDate(input, locale) : formatGeneral(input, locale);
  return input;
}

/** Таблица-сетка листа. Знает только про отрисовку ячеек; выделение и анимация — поверх неё. */
export class GridView {
  readonly table: HTMLTableElement;
  readonly cols: number;
  readonly rows: number;
  private cells = new Map<string, HTMLTableCellElement>();
  private headers = new Map<string, HTMLTableCellElement>();
  private readonly colEls: HTMLTableColElement[] = [];
  private hidden = new Set<string>();

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
    const width = this.sheet.columns[colToLetters(parseCell(addr).col)] ?? DEFAULT_COLUMN_WIDTH;
    const display = formatValue(state.value, state.fmt, this.locale, fitsIn(width));

    // Длинный текст Excel выводит поверх пустых соседей справа, а у непустого соседа обрезает
    const { row, col } = parseCell(addr);
    const neighbor = this.sheet.get(cellName({ row, col: col + 1 })).input;
    td.className = [
      "xl-cell",
      `xl-${display.align}`,
      state.style ? `xl-${state.style}` : "",
      this.hidden.has(colToLetters(col)) ? "xl-colhidden" : "",
      display.align === "left" && neighbor !== null ? "xl-clip" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (display.currency && !display.text.startsWith("#")) {
      td.replaceChildren(span("xl-acc", [span("", display.currency), span("", display.text)]));
    } else {
      // Перевод строки (СИМВОЛ(10)) без «Переносить текст» в ячейке не виден
      td.textContent = display.text.replace(/[\r\n]/g, "");
    }
  }

  /** Подсветка заголовков строк и столбцов выделенного диапазона, как в Excel. */
  highlightHeaders(range: string | null): void {
    for (const th of this.headers.values()) th.classList.remove("xl-hl");
    if (!range) return;
    const { start, end } = parseRange(range);
    for (let col = start.col; col <= Math.min(end.col, this.cols); col++) {
      this.headers.get(colToLetters(col))?.classList.add("xl-hl");
    }
    for (let row = start.row; row <= Math.min(end.row, this.rows); row++) this.headers.get(String(row))?.classList.add("xl-hl");
  }

  /** Заголовок строки («12») или столбца («A») — по нему щёлкают, чтобы выделить строку целиком. */
  header(label: string): HTMLTableCellElement {
    const th = this.headers.get(label);
    if (!th) throw new Error(`Нет заголовка «${label}» в видимой сетке`);
    return th;
  }

  /** Кнопка «Выделить всё» — угол на пересечении заголовков. */
  get corner(): HTMLTableCellElement {
    return this.table.querySelector("th") as HTMLTableCellElement;
  }

  /** Скрытые столбцы (Главная → Формат → Скрыть столбцы): ширина 0, содержимое не видно. */
  setHidden(letters: readonly string[]): void {
    const hidden = new Set(letters);
    if ([...hidden].join() === [...this.hidden].join()) return;
    this.hidden = hidden;
    let width = ROW_HEADER_WIDTH;
    for (let col = 1; col <= this.cols; col++) {
      const letter = colToLetters(col);
      const px = hidden.has(letter) ? 0 : this.columnWidth(letter);
      const el = this.colEls[col - 1];
      if (el) el.style.width = `${px}px`;
      width += px;
      this.headers.get(letter)?.classList.toggle("xl-colhidden", hidden.has(letter));
      for (let row = 1; row <= this.rows; row++) {
        this.cells.get(cellName({ col, row }))?.classList.toggle("xl-colhidden", hidden.has(letter));
      }
    }
    this.table.style.width = `${width}px`;
  }

  private columnWidth(letter: string): number {
    return this.sheet.columns[letter] ?? DEFAULT_COLUMN_WIDTH;
  }

  private build(): void {
    const colgroup = document.createElement("colgroup");
    colgroup.append(colWidth(ROW_HEADER_WIDTH));
    let width = ROW_HEADER_WIDTH;
    for (let col = 1; col <= this.cols; col++) {
      const px = this.columnWidth(colToLetters(col));
      const el = colWidth(px);
      this.colEls.push(el);
      colgroup.append(el);
      width += px;
    }
    // Явная ширина: длинный текст (=СУММ(C4:C11)) выходит на соседние ячейки, как в Excel,
    // а не раздвигает колонку
    this.table.style.width = `${width}px`;

    const head = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "xl-corner"; // кнопка «Выделить всё»
    head.append(corner);
    for (let col = 1; col <= this.cols; col++) {
      const letters = colToLetters(col);
      head.append(this.makeHeader(letters, "xl-colh"));
    }

    const body = document.createElement("tbody");
    body.append(head);
    for (let row = 1; row <= this.rows; row++) {
      const tr = document.createElement("tr");
      tr.append(this.makeHeader(String(row), "xl-rowh"));
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

  private makeHeader(label: string, className: string): HTMLTableCellElement {
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
