import { type CellPos, parseCell } from "./address";
import { type CellSource, type CellValue, createEvaluator, realToday } from "./evaluator";
import type { TextLocale } from "./text-functions";
import { expandNames, type NameDef, nameProblem, sameName } from "./names";
import type { SheetModel, SheetSnapshot } from "./sheet-model";

export interface WorkbookSnapshot {
  sheets: ReadonlyMap<string, SheetSnapshot>;
  names: readonly NameDef[];
  iteration: IterationSettings;
}

/** Файл → Параметры → Формулы → «Включить итеративные вычисления» (глава 11). */
export interface IterationSettings {
  enabled: boolean;
  /** «Предельное число итераций» (по умолчанию 100). */
  maxIterations: number;
  /** «Относительная погрешность» (по умолчанию 0,001): итерации останавливаются, когда изменения меньше. */
  maxChange: number;
}

export const DEFAULT_ITERATION: IterationSettings = { enabled: false, maxIterations: 100, maxChange: 0.001 };

/** Ошибка определения имени — текст как в окне Excel («Введено недопустимое имя.»). */
export class NameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NameError";
  }
}

const copyName = (def: NameDef): NameDef => ({
  ...def,
  areas: def.areas.map((a) => ({ ...a })),
  base: def.base ? { ...def.base } : undefined,
});

/**
 * Книга: листы и имена диапазонов. Формулы вычисляются здесь, потому что ссылаются на другие листы
 * (=СУММ(Астана!выручка)) и на имена книги. Значения считаются лениво, с защитой от циклов.
 */
export class Workbook {
  readonly sheets: SheetModel[] = [];
  private nameDefs: NameDef[] = [];
  private computed = new Map<string, CellValue>();
  /** Ячейки, которые считаются сейчас (стек): повтор адреса в стеке — циклическая ссылка. */
  private stack: string[] = [];
  /** Ячейки петли циклической ссылки (Лист!A1). */
  private cycle = new Set<string>();
  /** Без итераций ячейки петли показывают 0, как в Excel. */
  private zeroed = new Set<string>();
  /** С итерациями: значения прошлого прохода — их берёт ссылка, замыкающая петлю. */
  private previous = new Map<string, CellValue>();
  private lastInput: string | null = null;
  private iterationSettings: IterationSettings = { ...DEFAULT_ITERATION };
  private readonly evaluate: (formula: string, at: CellPos & { sheet: string }) => CellValue;
  private textLocale: TextLocale = "ru";
  private todaySerial = realToday();

  constructor() {
    const source: CellSource = {
      value: (addr, sheet) => this.sheetOrNull(sheet)?.value(addr) ?? null,
      formula: (addr, sheet) => this.sheetOrNull(sheet)?.formula(addr) ?? null,
      extent: (sheet) => this.sheetOrNull(sheet)?.extent() ?? { rows: 1, cols: 1 },
      locale: () => this.textLocale,
      today: () => this.todaySerial,
    };
    this.evaluate = createEvaluator(source);
  }

  /** Язык Excel ученика: от него зависит результат ТЕКСТ («Октябрь» / «October», «1,5» / «1.5»). */
  get locale(): TextLocale {
    return this.textLocale;
  }

  setLocale(locale: TextLocale): void {
    if (locale === this.textLocale) return;
    this.textLocale = locale;
    this.recalc();
  }

  /** «Сегодня» книги — для СЕГОДНЯ() и Ctrl+;. У урока оно постоянное: анимация и перемотка совпадают. */
  get today(): number {
    return this.todaySerial;
  }

  setToday(serial: number): void {
    if (serial === this.todaySerial) return;
    this.todaySerial = serial;
    this.recalc();
  }

  /** Подключить лист (вызывает конструктор SheetModel). */
  attach(sheet: SheetModel): void {
    if (this.sheets.some((s) => s.name === sheet.name)) throw new Error(`Лист «${sheet.name}» уже есть в книге`);
    this.sheets.push(sheet);
  }

  sheet(name: string): SheetModel {
    const found = this.sheetOrNull(name);
    if (!found) throw new Error(`Нет листа «${name}»`);
    return found;
  }

  sheetOrNull(name: string | undefined): SheetModel | null {
    if (name === undefined) return this.sheets[0] ?? null;
    return this.sheets.find((s) => s.name === name) ?? null;
  }

  // ---------- Имена ----------

  get names(): readonly NameDef[] {
    return this.nameDefs;
  }

  /** Имя, видимое с листа: сначала имя этого листа, потом имя книги. qualifier — Лист2!jam. */
  resolveName(name: string, fromSheet: string, qualifier: string | null = null): NameDef | null {
    const scoped = qualifier ?? fromSheet;
    return (
      this.nameDefs.find((d) => d.scope === scoped && sameName(d.name, name)) ??
      (qualifier === null || this.sheetOrNull(qualifier) === null
        ? (this.nameDefs.find((d) => d.scope === null && sameName(d.name, name)) ?? null)
        : null)
    );
  }

  /** Создать или заменить имя. Недопустимое имя — NameError с текстом Excel. */
  defineName(def: NameDef): void {
    const problem = nameProblem(def.name);
    if (problem) throw new NameError(problem);
    this.nameDefs = this.nameDefs.filter((d) => !(d.scope === def.scope && sameName(d.name, def.name)));
    this.nameDefs.push(copyName(def));
    this.nameDefs.sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base" }));
    this.recalc();
  }

  deleteName(name: string, scope: string | null): void {
    this.nameDefs = this.nameDefs.filter((d) => !(d.scope === scope && sameName(d.name, name)));
    this.recalc();
  }

  // ---------- Циклические ссылки и итерации ----------

  get iteration(): IterationSettings {
    return { ...this.iterationSettings };
  }

  setIteration(settings: IterationSettings): void {
    this.iterationSettings = { ...settings };
    this.recalc();
  }

  /** Ячейки петли циклической ссылки — пусто, если петли нет. */
  get circularCells(): string[] {
    return [...this.cycle];
  }

  /**
   * Ячейка для строки состояния «Циклические ссылки: D8»: последняя введённая, если она в петле, иначе
   * первая найденная. null — петли нет или включены итерации (тогда Excel ссылку не показывает).
   */
  get circularRef(): string | null {
    if (this.cycle.size === 0 || this.iterationSettings.enabled) return null;
    return this.lastInput && this.cycle.has(this.lastInput) ? this.lastInput : ([...this.cycle][0] ?? null);
  }

  /** Ячейка, в которую только что ввели значение (для строки состояния и предупреждения). */
  noteInput(sheet: string, addr: string): void {
    this.lastInput = `${sheet}!${addr}`;
  }

  isCircular(sheet: string, addr: string): boolean {
    return this.cycle.has(`${sheet}!${addr}`);
  }

  // ---------- Вычисление ----------

  /**
   * Пересчёт книги. Первый проход находит петли. Без итераций ячейки петли получают 0 (как Excel после
   * предупреждения), и книга пересчитывается от них. С итерациями — проходы, пока изменения всех значений не
   * станут меньше «относительной погрешности», но не больше «предельного числа итераций»: ссылка, замыкающая
   * петлю, берёт значение прошлого прохода.
   */
  recalc(): void {
    this.cycle.clear();
    this.zeroed.clear();
    this.previous.clear();
    this.sweep();
    if (this.cycle.size === 0) return;
    if (!this.iterationSettings.enabled) {
      this.zeroed = new Set(this.cycle);
      this.sweep();
      return;
    }
    for (let i = 1; i < this.iterationSettings.maxIterations; i++) {
      const before = new Map(this.computed);
      this.previous = before;
      this.sweep();
      let change = 0;
      for (const [key, value] of this.computed) {
        const old = before.get(key);
        if (typeof value === "number" && typeof old === "number") change = Math.max(change, Math.abs(value - old));
        else if (value !== old) change = Infinity;
      }
      if (change < this.iterationSettings.maxChange) break;
    }
  }

  private sweep(): void {
    this.computed.clear();
    for (const sheet of this.sheets) sheet.refreshValues();
  }

  /** Значение ячейки с формулой: имена подставляются ссылками, затем разбор. */
  computeFormula(sheet: string, addr: string, formula: string): CellValue {
    const key = `${sheet}!${addr}`;
    const cached = this.computed.get(key);
    if (cached !== undefined) return cached;
    if (this.zeroed.has(key)) return 0;
    const loop = this.stack.indexOf(key);
    if (loop >= 0) {
      for (const k of this.stack.slice(loop)) this.cycle.add(k);
      return this.iterationSettings.enabled ? (this.previous.get(key) ?? 0) : 0;
    }
    this.stack.push(key);
    try {
      const at = parseCell(addr);
      const expanded = expandNames(formula, {
        sheet,
        at,
        resolve: (name, qualifier) => this.resolveName(name, sheet, qualifier),
      });
      const value = this.evaluate(expanded, { ...at, sheet });
      this.computed.set(key, value);
      return value;
    } finally {
      this.stack.pop();
    }
  }

  snapshot(): WorkbookSnapshot {
    return {
      sheets: new Map(this.sheets.map((s) => [s.name, s.snapshot()])),
      names: this.nameDefs.map(copyName),
      iteration: { ...this.iterationSettings },
    };
  }

  restore(snapshot: WorkbookSnapshot): void {
    this.nameDefs = snapshot.names.map(copyName);
    this.iterationSettings = { ...snapshot.iteration };
    for (const sheet of this.sheets) {
      const cells = snapshot.sheets.get(sheet.name);
      if (cells) sheet.restoreCells(cells);
    }
    this.recalc();
  }
}
