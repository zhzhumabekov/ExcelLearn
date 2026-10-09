import type { Point } from "../render/geometry";
import { type Clock, easeInOutCubic } from "./clock";

export type CursorShape = "arrow" | "plus";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(className: string, size: [number, number], path: string, attrs: Record<string, string>): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("class", className);
  el.setAttribute("width", String(size[0]));
  el.setAttribute("height", String(size[1]));
  el.setAttribute("viewBox", `0 0 ${size[0]} ${size[1]}`);
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", path);
  for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
  el.append(p);
  return el;
}

/** Виртуальный курсор поверх окна Excel. Координаты — в системе «сцены» (stage). */
export class CursorView {
  readonly el: HTMLElement;
  private position: Point = { x: 0, y: 0 };
  private shape: CursorShape = "arrow";

  constructor(
    private readonly stage: HTMLElement,
    private readonly clock: Clock,
  ) {
    this.el = document.createElement("div");
    this.el.className = "xl-cursor";
    this.el.append(
      svg("xl-arrow", [22, 26], "M2 2 L2 21 L7 16.5 L10.5 24 L13.5 22.7 L10 15.3 L16.8 15.3 Z", {
        fill: "#fff",
        stroke: "#111",
        "stroke-width": "1.6",
        "stroke-linejoin": "round",
      }),
      svg("xl-plus", [18, 18], "M9 1 V17 M1 9 H17", { stroke: "#111", "stroke-width": "2.2" }),
    );
    stage.append(this.el);
  }

  get at(): Point {
    return { ...this.position };
  }

  setShape(shape: CursorShape): void {
    this.shape = shape;
    this.el.classList.toggle("xl-is-plus", shape === "plus");
    this.jump(this.position);
  }

  /** Мгновенно поставить курсор (начало урока, перемотка). */
  jump(point: Point): void {
    this.position = { ...point };
    // Остриё стрелки — в точке; центр перекрестья — в точке
    const offset = this.shape === "plus" ? -9 : -2;
    this.el.style.transform = `translate(${point.x + offset}px, ${point.y + offset}px)`;
  }

  /** Плавно переместить курсор; onT(t) — прогресс пути (для протягивания выделения). */
  async moveTo(target: Point, ms = 750, onT?: (t: number) => void): Promise<void> {
    this.warnIfHidden(target);
    const from = this.position;
    await this.clock.tween(ms, (t) => {
      const e = easeInOutCubic(t);
      this.jump({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e });
      onT?.(e);
    });
  }

  /**
   * Курсор не должен целиться туда, чего ученик не видит (кнопка за краем окна, ячейка вне сцены).
   * В браузере это предупреждение в консоли — его ловят e2e-тесты всех уроков.
   */
  private warnIfHidden(target: Point): void {
    const { clientWidth, clientHeight } = this.stage;
    if (clientWidth === 0) return; // тестовая среда без раскладки
    if (target.x < 0 || target.y < 0 || target.x > clientWidth || target.y > clientHeight) {
      console.warn(`ExcelLearn: курсор за краем сцены (${Math.round(target.x)}, ${Math.round(target.y)})`);
    }
  }

  async press(): Promise<void> {
    this.el.classList.add("xl-down");
    this.ripple();
    await this.clock.wait(150);
  }

  release(): void {
    this.el.classList.remove("xl-down");
  }

  async click(): Promise<void> {
    await this.press();
    this.release();
    await this.clock.wait(120);
  }

  private ripple(): void {
    const ring = document.createElement("div");
    ring.className = "xl-ripple";
    ring.style.left = `${this.position.x}px`;
    ring.style.top = `${this.position.y}px`;
    ring.addEventListener("animationend", () => ring.remove());
    this.stage.append(ring);
  }
}
