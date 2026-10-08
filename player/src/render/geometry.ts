import { parseRange, cellName } from "../sheet/address";
import type { GridView } from "./grid";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Прямоугольник элемента в координатах контейнера (с учётом его прокрутки). */
export function relativeRect(el: Element, container: HTMLElement): Rect {
  const a = el.getBoundingClientRect();
  const b = container.getBoundingClientRect();
  return { x: a.left - b.left + container.scrollLeft, y: a.top - b.top + container.scrollTop, w: a.width, h: a.height };
}

/** Прямоугольник диапазона ячеек — объединение левой верхней и правой нижней ячеек. */
export function rangeRect(grid: GridView, range: string, container: HTMLElement): Rect {
  const { start, end } = parseRange(range);
  const a = relativeRect(grid.cell(cellName(start)), container);
  const b = relativeRect(grid.cell(cellName(end)), container);
  return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
}

/** Точка, куда «целится» курсор: центр ячейки (чуть правее и ниже — как рукой) или маркер заполнения. */
export function aimPoint(rect: Rect, where: "center" | "handle"): Point {
  return where === "handle"
    ? { x: rect.x + rect.w - 1, y: rect.y + rect.h - 1 }
    : { x: rect.x + rect.w * 0.55, y: rect.y + rect.h * 0.6 };
}

export function place(el: HTMLElement, rect: Rect): void {
  // -1/+1: рамка ложится на линии сетки, а не внутрь ячейки
  Object.assign(el.style, {
    left: `${rect.x - 1}px`,
    top: `${rect.y - 1}px`,
    width: `${rect.w + 1}px`,
    height: `${rect.h + 1}px`,
    display: "block",
  });
}
