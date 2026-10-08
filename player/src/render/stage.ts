import { Clock } from "../anim/clock";
import { CursorView } from "../anim/cursor";
import { KeysView } from "../anim/keys";
import { editorRefs, type LessonState } from "../lesson/state";
import type { FunctionLocale } from "../locale/format";
import type { SheetModel } from "../sheet/sheet-model";
import { coloredFormulaHtml, EditorView, escapeHtml } from "./editor";
import { aimPoint, type Point, relativeRect } from "./geometry";
import { formulaBarText } from "./grid";
import { Overlays } from "./overlays";
import { type RibbonButton, WindowView } from "./window";

/** Сцена урока: окно Excel, рамки поверх сетки, курсор и клавиши — всё, что видит ученик. */
export class Stage {
  readonly el: HTMLElement;
  readonly window: WindowView;
  readonly overlays: Overlays;
  readonly cursor: CursorView;
  readonly keys: KeysView;
  readonly editor: EditorView;

  constructor(
    readonly sheet: SheetModel,
    private currentLocale: FunctionLocale,
    readonly clock: Clock = new Clock(),
  ) {
    this.el = document.createElement("div");
    this.el.className = "xl-stage";
    this.window = new WindowView(sheet, currentLocale);
    this.el.append(this.window.el);
    this.overlays = new Overlays(this.window.gridWrap, this.window.grid);
    this.editor = new EditorView(this.window.gridWrap, this.window.grid);
    this.cursor = new CursorView(this.el, clock);
    this.keys = new KeysView(this.el, clock);
  }

  get locale(): FunctionLocale {
    return this.currentLocale;
  }

  setLocale(locale: FunctionLocale): void {
    this.currentLocale = locale;
    this.window.setLocale(locale);
  }

  /**
   * Нарисовать состояние урока целиком: сетку, рамки, редактор, поле «Имя» и строку формул.
   * editorChars — сколько символов редактора видно (анимация набора текста).
   */
  render(state: LessonState, editorChars = Infinity): void {
    const { window, overlays, locale } = this;
    const editing = state.editor;
    window.grid.renderAll();

    overlays.showSelection(editing ? null : state.selection);
    overlays.showRefs(editing ? editorRefs(editing) : state.shownRefs);
    overlays.showAnts(state.clipboard);
    const editorHtml = this.editor.render(editing, locale, editorChars);

    window.nameBox.textContent = editing?.cell ?? state.active;
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
  }

  /** Короткая вспышка ячейки после ввода значения. */
  flash(addr: string): void {
    const td = this.window.grid.cell(addr);
    td.classList.remove("xl-flash");
    void td.offsetWidth;
    td.classList.add("xl-flash");
  }

  /** Куда наводить курсор на ячейке: в центр или на маркер заполнения в правом нижнем углу. */
  cellPoint(addr: string, where: "center" | "handle" = "center"): Point {
    return aimPoint(relativeRect(this.window.grid.cell(addr), this.el), where);
  }

  ribbonPoint(id: RibbonButton): Point {
    return aimPoint(relativeRect(this.window.ribbonButton(id), this.el), "center");
  }

  /** Где курсор «отдыхает» между уроками — справа внизу, вне таблицы. */
  restPoint(): Point {
    const { width, height } = this.el.getBoundingClientRect();
    return { x: width * 0.88, y: height * 0.82 };
  }
}

