import { Clock } from "../anim/clock";
import { CursorView } from "../anim/cursor";
import { KeysView } from "../anim/keys";
import { suggestions, visibleNames } from "../lesson/dialogs";
import { editorRefs, type LessonState, type RibbonTabId } from "../lesson/state";
import type { FunctionLocale } from "../locale/format";
import { rangeName, parseRange } from "../sheet/address";
import type { SheetModel } from "../sheet/sheet-model";
import { DialogView } from "./dialog";
import { coloredFormulaHtml, EditorView, escapeHtml } from "./editor";
import { aimPoint, type Point, relativeRect } from "./geometry";
import { formulaBarText } from "./grid";
import { Overlays } from "./overlays";
import { type MenuItem, type RibbonButton, WindowView } from "./window";

/** Сцена урока: окно Excel, рамки поверх сетки, окна, курсор и клавиши — всё, что видит ученик. */
export class Stage {
  readonly el: HTMLElement;
  readonly window: WindowView;
  readonly overlays: Overlays;
  readonly cursor: CursorView;
  readonly keys: KeysView;
  readonly editor: EditorView;
  readonly dialogs: DialogView;

  constructor(
    /** Первый лист книги урока; остальные листы и имена — в sheet.book. */
    readonly sheet: SheetModel,
    private currentLocale: FunctionLocale,
    readonly clock: Clock = new Clock(),
  ) {
    this.el = document.createElement("div");
    this.el.className = "xl-stage";
    sheet.book.setLocale(currentLocale);
    this.window = new WindowView(sheet.book, currentLocale);
    this.el.append(this.window.el);
    this.overlays = new Overlays(this.window.gridWrap, this.window);
    this.editor = new EditorView(this.window.gridWrap, this.window);
    this.dialogs = new DialogView(this.el);
    this.cursor = new CursorView(this.el, clock);
    this.keys = new KeysView(this.el, clock);
  }

  get locale(): FunctionLocale {
    return this.currentLocale;
  }

  setLocale(locale: FunctionLocale): void {
    this.currentLocale = locale;
    this.sheet.book.setLocale(locale);
    this.window.setLocale(locale);
  }

  /**
   * Нарисовать состояние урока целиком: лист, ленту, рамки, редактор, поле «Имя», строку формул и окна.
   * editorChars — сколько символов редактора видно (анимация набора текста).
   */
  render(state: LessonState, editorChars = Infinity): void {
    const { window, overlays, locale } = this;
    const editing = state.editor;
    window.showSheet(state.sheet.name);
    window.showTab(state.ribbonTab);
    window.showMenu(state.menu);
    window.showContextMenu(state.contextMenu);
    window.grid.setHidden(state.hiddenColumns[state.sheet.name] ?? []);
    window.showNameList(state.nameListOpen ? visibleNames(state).map((d) => d.name) : null);
    window.grid.renderAll();

    overlays.showSelection(editing ? null : state.selection);
    overlays.showAreas(editing ? [] : state.areas);
    overlays.showRefs(editing ? editorRefs(editing) : state.shownRefs);
    overlays.showAnts(state.clipboard);
    const editorHtml = this.editor.render(editing, locale, editorChars, (partial) =>
      suggestions(state, partial, locale),
    );

    window.nameBox.textContent = editing?.cell ?? this.nameBoxText(state);
    if (editing) {
      window.formulaText.innerHTML = editorHtml;
    } else {
      const cell = state.sheet.get(state.active);
      const formula = state.sheet.formula(state.active);
      window.formulaText.innerHTML =
        formula && state.shownRefs.length
          ? coloredFormulaHtml(formula, state.shownRefs, locale)
          : escapeHtml(formulaBarText(cell, locale));
    }
    window.grid.highlightHeaders(editing ? editing.cell : state.selection);
    this.dialogs.render(state, locale);
  }

  /** Поле «Имя»: если выделен ровно диапазон имени — Excel показывает имя, иначе адрес активной ячейки. */
  private nameBoxText(state: LessonState): string {
    const selected = [...state.areas, state.selection].map((r) => rangeName(parseRange(r)));
    const named = visibleNames(state).find(
      (d) =>
        d.areas.length === selected.length &&
        d.areas.every((a, i) => a.sheet === state.sheet.name && rangeName(parseRange(a.ref)) === selected[i]),
    );
    return named ? named.name : state.active;
  }

  /** Короткая вспышка ячейки после ввода значения. */
  flash(addr: string): void {
    const td = this.window.grid.cell(addr);
    td.classList.remove("xl-flash");
    void td.offsetWidth;
    td.classList.add("xl-flash");
  }

  private point(el: Element, where: "center" | "handle" = "center"): Point {
    return aimPoint(relativeRect(el, this.el), where);
  }

  /** Куда наводить курсор на ячейке: в центр или на маркер заполнения в правом нижнем углу. */
  cellPoint(addr: string, where: "center" | "handle" = "center"): Point {
    return this.point(this.window.grid.cell(addr), where);
  }

  ribbonPoint(id: RibbonButton): Point {
    return this.point(this.window.ribbonButton(id));
  }

  tabPoint(id: RibbonTabId): Point {
    return this.point(this.window.tab(id));
  }

  menuPoint(id: MenuItem): Point {
    return this.point(this.window.menuItem(id));
  }

  contextItemPoint(id: string): Point {
    return this.point(this.window.contextItem(id));
  }

  sheetTabPoint(name: string): Point {
    return this.point(this.window.sheetTab(name));
  }

  /** Заголовок строки («12») или столбца («A»). */
  headerPoint(label: string): Point {
    return this.point(this.window.grid.header(label));
  }

  cornerPoint(): Point {
    return this.point(this.window.grid.corner);
  }

  nameBoxPoint(): Point {
    return this.point(this.window.nameBox);
  }

  nameListArrowPoint(): Point {
    return this.point(this.window.nameListArrow());
  }

  nameListItemPoint(name: string): Point {
    return this.point(this.window.nameListItem(name));
  }

  /** Элемент верхнего окна: [data-field="Имя"], [data-check=…], [data-item=…], [data-button="OK"]. */
  dialogPoint(selector: string): Point {
    return this.point(this.dialogs.target(selector));
  }

  suggestionPoint(label: string): Point {
    return this.point(this.editor.suggestion(label));
  }

  /** Где курсор «отдыхает» между уроками — справа внизу, вне таблицы. */
  restPoint(): Point {
    const { width, height } = this.el.getBoundingClientRect();
    return { x: width * 0.88, y: height * 0.82 };
  }
}
