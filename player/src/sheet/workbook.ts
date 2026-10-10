import { type CellPos, parseCell } from "./address";
import { type CellSource, type CellValue, createEvaluator } from "./evaluator";
import type { TextLocale } from "./text-functions";
import { expandNames, type NameDef, nameProblem, sameName } from "./names";
import type { SheetModel, SheetSnapshot } from "./sheet-model";

export interface WorkbookSnapshot {
  sheets: ReadonlyMap<string, SheetSnapshot>;
  names: readonly NameDef[];
}

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
  private inProgress = new Set<string>();
  private readonly evaluate: (formula: string, at: CellPos & { sheet: string }) => CellValue;
  private textLocale: TextLocale = "ru";

  constructor() {
    const source: CellSource = {
      value: (addr, sheet) => this.sheetOrNull(sheet)?.value(addr) ?? null,
      formula: (addr, sheet) => this.sheetOrNull(sheet)?.formula(addr) ?? null,
      extent: (sheet) => this.sheetOrNull(sheet)?.extent() ?? { rows: 1, cols: 1 },
      locale: () => this.textLocale,
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

  // ---------- Вычисление ----------

  recalc(): void {
    this.computed.clear();
    for (const sheet of this.sheets) sheet.refreshValues();
  }

  /** Значение ячейки с формулой: имена подставляются ссылками, затем разбор. */
  computeFormula(sheet: string, addr: string, formula: string): CellValue {
    const key = `${sheet}!${addr}`;
    const cached = this.computed.get(key);
    if (cached !== undefined) return cached;
    if (this.inProgress.has(key)) return 0; // циклическая ссылка: Excel показывает 0 и предупреждение
    this.inProgress.add(key);
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
      this.inProgress.delete(key);
    }
  }

  snapshot(): WorkbookSnapshot {
    return {
      sheets: new Map(this.sheets.map((s) => [s.name, s.snapshot()])),
      names: this.nameDefs.map(copyName),
    };
  }

  restore(snapshot: WorkbookSnapshot): void {
    this.nameDefs = snapshot.names.map(copyName);
    for (const sheet of this.sheets) {
      const cells = snapshot.sheets.get(sheet.name);
      if (cells) sheet.restoreCells(cells);
    }
    this.recalc();
  }
}
