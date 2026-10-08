import { Clock } from "../anim/clock";
import { CursorView } from "../anim/cursor";
import { KeysView } from "../anim/keys";
import type { FunctionLocale } from "../locale/format";
import type { SheetModel } from "../sheet/sheet-model";
import { aimPoint, type Point, relativeRect } from "./geometry";
import { Overlays } from "./overlays";
import { type RibbonButton, WindowView } from "./window";

/** Сцена урока: окно Excel, рамки поверх сетки, курсор и клавиши — всё, что видит ученик. */
export class Stage {
  readonly el: HTMLElement;
  readonly window: WindowView;
  readonly overlays: Overlays;
  readonly cursor: CursorView;
  readonly keys: KeysView;

  constructor(
    readonly sheet: SheetModel,
    locale: FunctionLocale,
    readonly clock: Clock = new Clock(),
  ) {
    this.el = document.createElement("div");
    this.el.className = "xl-stage";
    this.window = new WindowView(sheet, locale);
    this.el.append(this.window.el);
    this.overlays = new Overlays(this.window.gridWrap, this.window.grid);
    this.cursor = new CursorView(this.el, clock);
    this.keys = new KeysView(this.el, clock);
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
