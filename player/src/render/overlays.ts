import { place, rangeRect } from "./geometry";
import type { GridView } from "./grid";

export interface OverlayState {
  selection: string | null;
  /** Части выделения, добавленные с Ctrl. */
  areas: string[];
  refs: string[];
  fill: string | null;
  ants: string | null;
}

const REF_COLORS = 4; // цвета ссылок в формуле, как в Excel: синий, красный, фиолетовый, зелёный

function box(className: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `xl-box ${className}`;
  el.style.display = "none";
  return el;
}

/**
 * Рамки поверх сетки: выделение с маркером заполнения, цветные ссылки формулы, пунктир протягивания,
 * «бегущая» рамка буфера обмена. Состояние хранится, чтобы перерисовать после изменения раскладки.
 */
export class Overlays {
  private readonly selection = box("xl-sel");
  private readonly fill = box("xl-fillbox");
  private readonly ants = box("xl-ants");
  private readonly refs: HTMLElement[] = [];
  private readonly areaBoxes: HTMLElement[] = [];
  private state: OverlayState = {
    selection: null,
    areas: [],
    refs: [],
    fill: null,
    ants: null,
  };

  constructor(
    private readonly container: HTMLElement,
    /** Откуда брать сетку: при переключении листа она меняется. */
    private readonly view: { readonly grid: GridView },
  ) {
    const handle = document.createElement("div");
    handle.className = "xl-handle";
    this.selection.append(handle);
    for (let i = 0; i < REF_COLORS; i++) this.refs.push(box(`xl-refbox xl-ref${i}`));
    container.append(...this.refs, this.selection, this.fill, this.ants);
  }

  get current(): Readonly<OverlayState> {
    return this.state;
  }

  showSelection(range: string | null): void {
    this.state.selection = range;
    this.selection.classList.toggle("xl-range", range !== null && range.includes(":"));
    this.draw(this.selection, range);
  }

  /** Несмежное выделение (Ctrl): каждая часть — серая заливка в рамке, как в Excel. */
  showAreas(ranges: readonly string[]): void {
    this.state.areas = [...ranges];
    while (this.areaBoxes.length < ranges.length) {
      const el = box("xl-areabox");
      this.areaBoxes.push(el);
      this.container.append(el);
    }
    this.areaBoxes.forEach((el, i) => this.draw(el, ranges[i] ?? null));
  }

  /** Ссылки формулы по порядку: первая — синяя, вторая — красная… */
  showRefs(ranges: readonly string[]): void {
    this.state.refs = [...ranges];
    this.refs.forEach((el, i) => this.draw(el, ranges[i] ?? null));
  }

  showFill(range: string | null): void {
    this.state.fill = range;
    this.draw(this.fill, range);
  }

  showAnts(range: string | null): void {
    this.state.ants = range;
    this.draw(this.ants, range);
  }

  /** Перерисовать всё, например после смены языка (ширина текста) или размера окна. */
  refresh(): void {
    const { selection, areas, refs, fill, ants } = this.state;
    this.showSelection(selection);
    this.showAreas(areas);
    this.showRefs(refs);
    this.showFill(fill);
    this.showAnts(ants);
  }

  private draw(el: HTMLElement, range: string | null): void {
    if (range === null) el.style.display = "none";
    else place(el, rangeRect(this.view.grid, range, this.container));
  }
}
