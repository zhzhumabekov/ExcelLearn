import type { CellSpec, Sheet } from "../generated/lesson";

import { parseCell } from "./address";
import { type CellValue, createEvaluator } from "./evaluator";

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

export function isFormula(input: CellState["input"]): input is string {
  return typeof input === "string" && input.startsWith("=");
}

/**
 * Модель листа: ввод ячеек, форматы и вычисленные значения. Не знает об отрисовке и анимации —
 * действия урока меняют лист только через этот класс, поэтому перемотка детерминирована.
 */
export class SheetModel {
  readonly name: string;
  readonly file: string | null;
  readonly columns: Readonly<Record<string, number>>;
  readonly rows: number | null;
  private cells = new Map<string, CellState>();
  private readonly evaluate = createEvaluator({
    value: (addr) => this.computeValue(addr),
    formula: (addr) => {
      const input = this.cells.get(addr)?.input ?? null;
      return isFormula(input) ? input : null;
    },
  });
  // Пересчёт: значения формул вычисляются лениво, с защитой от циклов.
  private computed = new Map<string, CellValue>();
  private inProgress = new Set<string>();

  constructor(sheet: Sheet) {
    this.name = sheet.name ?? "Лист1";
    this.file = sheet.file ?? null;
    this.columns = sheet.columns ?? {};
    this.rows = sheet.rows ?? null;
    for (const [addr, cell] of Object.entries(sheet.cells ?? {})) {
      const spec: CellSpec = typeof cell === "object" ? cell : { v: cell };
      this.cells.set(addr, {
        input: spec.f ?? spec.v ?? null,
        value: null,
        fmt: spec.fmt ?? "general",
        style: spec.style ?? null,
      });
    }
    this.recalc();
  }

  get(addr: string): Readonly<CellState> {
    return this.cells.get(addr) ?? EMPTY;
  }

  value(addr: string): CellValue {
    return this.get(addr).value;
  }

  formula(addr: string): string | null {
    const { input } = this.get(addr);
    return isFormula(input) ? input : null;
  }

  /** Адреса непустых ячеек (с вводом или форматом). */
  addresses(): string[] {
    return [...this.cells.keys()];
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
    this.cells = new Map([...snapshot].map(([addr, cell]) => [addr, { ...cell }]));
    this.recalc();
  }

  recalc(): void {
    this.computed.clear();
    for (const [addr, cell] of this.cells) cell.value = this.computeValue(addr);
  }

  private computeValue(addr: string): CellValue {
    const input = this.cells.get(addr)?.input ?? null;
    if (!isFormula(input)) return input;
    const cached = this.computed.get(addr);
    if (cached !== undefined) return cached;
    if (this.inProgress.has(addr)) return 0; // циклическая ссылка: Excel показывает 0 и предупреждение
    this.inProgress.add(addr);
    try {
      const value = this.evaluate(input, parseCell(addr));
      this.computed.set(addr, value);
      return value;
    } finally {
      this.inProgress.delete(addr);
    }
  }
}
