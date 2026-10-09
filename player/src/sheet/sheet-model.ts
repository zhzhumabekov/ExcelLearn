import type { CellSpec, Sheet } from "../generated/lesson";

import { parseCell } from "./address";
import type { CellValue } from "./evaluator";
import { Workbook } from "./workbook";

export type Fmt = NonNullable<CellSpec["fmt"]>;
export type Style = NonNullable<CellSpec["style"]>;

export interface CellState {
  /** Что «введено» в ячейку: число, текст или формула (строка с «=»). */
  input: number | string | null;
  value: CellValue;
  fmt: Fmt;
  style: Style | null;
}

export type SheetSnapshot = ReadonlyMap<string, Readonly<CellState>>;

const EMPTY: Readonly<CellState> = Object.freeze({ input: null, value: null, fmt: "general", style: null });

/** Текст, набранный в ячейке, → значение ввода: формула, число или строка. */
export function parseInput(raw: string | number | null): number | string | null {
  if (raw === null || typeof raw === "number") return raw;
  if (raw.startsWith("=")) return raw;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : raw;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Дата «2025-05-01» → серийный номер Excel (45778); числа и прочее — как есть. */
export function dateInput(v: CellSpec["v"]): number | string | null {
  if (typeof v !== "string") return v ?? null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - EXCEL_EPOCH) / 86_400_000);
}

export function isFormula(input: CellState["input"]): input is string {
  return typeof input === "string" && input.startsWith("=");
}

/**
 * Модель листа: ввод ячеек, форматы и вычисленные значения. Не знает об отрисовке и анимации —
 * действия урока меняют лист только через этот класс, поэтому перемотка детерминирована.
 * Формулы вычисляет книга (Workbook): ссылки на другие листы и имена диапазонов — её забота.
 * Лист без книги (уроки на одном листе) получает свою книгу из одного листа.
 */
export class SheetModel {
  readonly name: string;
  readonly file: string | null;
  readonly columns: Readonly<Record<string, number>>;
  readonly rows: number | null;
  readonly book: Workbook;
  private cells = new Map<string, CellState>();

  constructor(sheet: Sheet, book?: Workbook) {
    this.book = book ?? new Workbook();
    this.name = sheet.name ?? "Лист1";
    this.file = sheet.file ?? null;
    this.columns = sheet.columns ?? {};
    this.rows = sheet.rows ?? null;
    for (const [addr, cell] of Object.entries(sheet.cells ?? {})) {
      const spec: CellSpec = typeof cell === "object" ? cell : { v: cell };
      this.cells.set(addr, {
        input: spec.f ?? (spec.fmt === "date" ? dateInput(spec.v) : spec.v) ?? null,
        value: null,
        fmt: spec.fmt ?? "general",
        style: spec.style ?? null,
      });
    }
    this.book.attach(this);
    this.recalc();
  }

  get(addr: string): Readonly<CellState> {
    return this.cells.get(addr) ?? EMPTY;
  }

  /** Значение ячейки; у формулы — вычисленное книгой (с кэшем до следующего изменения). */
  value(addr: string): CellValue {
    const input = this.cells.get(addr)?.input ?? null;
    if (typeof input === "string" && input.startsWith("'")) return input.slice(1); // текст, набранный с апострофом
    if (isFormula(input)) return this.book.computeFormula(this.name, addr, input);
    return input;
  }

  formula(addr: string): string | null {
    const { input } = this.get(addr);
    return isFormula(input) ? input : null;
  }

  /** Адреса непустых ячеек (с вводом или форматом). */
  addresses(): string[] {
    return [...this.cells.keys()];
  }

  /** Заполненная часть листа: последняя строка и столбец с вводом — граница для A:A и 12:12. */
  extent(): { rows: number; cols: number } {
    let rows = 1;
    let cols = 1;
    for (const [addr, cell] of this.cells) {
      if (cell.input === null) continue;
      const { row, col } = parseCell(addr);
      rows = Math.max(rows, row);
      cols = Math.max(cols, col);
    }
    return { rows, cols };
  }

  /** Ввод в ячейку (как набор текста + Enter). Формат и стиль ячейки сохраняются. */
  setInput(addr: string, raw: string | number | null): void {
    const current = this.get(addr);
    this.cells.set(addr, { ...current, input: parseInput(raw) });
    this.recalc();
  }

  /** Копирование ячейки целиком (ввод + формат), как при вставке из буфера. */
  setCell(addr: string, cell: Pick<CellState, "input" | "fmt" | "style">): void {
    this.cells.set(addr, { input: cell.input, value: null, fmt: cell.fmt, style: cell.style });
    this.recalc();
  }

  clear(addr: string): void {
    const current = this.get(addr);
    this.cells.set(addr, { ...current, input: null });
    this.recalc();
  }

  snapshot(): SheetSnapshot {
    return new Map([...this.cells].map(([addr, cell]) => [addr, { ...cell }]));
  }

  restore(snapshot: SheetSnapshot): void {
    this.restoreCells(snapshot);
    this.recalc();
  }

  /** Вернуть ячейки без пересчёта — книга восстанавливает все листы и пересчитывает один раз. */
  restoreCells(snapshot: SheetSnapshot): void {
    this.cells = new Map([...snapshot].map(([addr, cell]) => [addr, { ...cell }]));
  }

  /** Пересчёт всей книги: формулы могут ссылаться на этот лист с других листов. */
  recalc(): void {
    this.book.recalc();
  }

  /** Обновить сохранённые значения ячеек (вызывает книга после пересчёта). */
  refreshValues(): void {
    for (const [addr, cell] of this.cells) cell.value = this.value(addr);
  }
}
