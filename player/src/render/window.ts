import type { FunctionLocale } from "../locale/format";
import type { SheetModel } from "../sheet/sheet-model";
import { formulaBarText, GridView } from "./grid";

/** Кнопки ленты, на которые могут ссылаться шаги урока (подсветка, клик курсором). */
export type RibbonButton = "paste" | "copy" | "autosum";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function ribbonGroup(label: string, ...items: HTMLElement[]): HTMLElement {
  const group = el("div", "xl-rgroup");
  const buttons = el("div", "xl-rbtns");
  buttons.append(...items);
  group.append(buttons, el("div", "xl-rlabel", label));
  return group;
}

function ribbonButton(id: RibbonButton | null, icon: string, label: string): HTMLElement {
  const button = el("span", "xl-rbtn");
  if (id) button.dataset.ribbon = id;
  button.append(el("b", "", icon), document.createTextNode(label));
  return button;
}

/** Окно Excel: заголовок, лента, поле «Имя», строка формул, сетка и ярлык листа. */
export class WindowView {
  readonly el: HTMLElement;
  readonly grid: GridView;
  /** Контейнер сетки — система координат для выделения, рамок и редактора (T11). */
  readonly gridWrap: HTMLElement;
  readonly nameBox: HTMLElement;
  readonly formulaText: HTMLElement;

  constructor(
    private readonly sheet: SheetModel,
    private locale: FunctionLocale,
  ) {
    this.el = el("div", "xl-window");

    const title = el("div", "xl-title");
    title.append(el("span", "", `${sheet.file ?? "Книга1.xlsx"} — Excel`), el("span", "xl-dots"));

    const tabs = el("div", "xl-tabs");
    for (const name of ["Файл", "Главная", "Вставка", "Формулы", "Данные", "Вид"]) {
      tabs.append(el("span", name === "Главная" ? "xl-on" : "", name));
    }

    const ribbon = el("div", "xl-ribbon");
    ribbon.append(
      ribbonGroup("Буфер обмена", ribbonButton("paste", "📋", "Вставить"), ribbonButton("copy", "⧉", "Копировать")),
      ribbonGroup("Шрифт", el("span", "xl-font", "Calibri"), el("span", "xl-font", "11"), ribbonButton(null, "Ж", "")),
      ribbonGroup("Редактирование", ribbonButton("autosum", "Σ", "Автосумма")),
    );

    const formulaBar = el("div", "xl-fbar");
    this.nameBox = el("div", "xl-namebox");
    this.formulaText = el("div", "xl-ftext");
    formulaBar.append(this.nameBox, el("div", "xl-fx", "fx"), this.formulaText);

    this.grid = new GridView(sheet, locale);
    this.gridWrap = el("div", "xl-grid-wrap");
    this.gridWrap.append(this.grid.table);

    const sheets = el("div", "xl-sheets");
    sheets.append(el("span", "xl-on", sheet.name), el("span", "", "+"));

    this.el.append(title, tabs, ribbon, formulaBar, this.gridWrap, sheets);
  }

  ribbonButton(id: RibbonButton): HTMLElement {
    const button = this.el.querySelector<HTMLElement>(`[data-ribbon="${id}"]`);
    if (!button) throw new Error(`Нет кнопки ленты ${id}`);
    return button;
  }

  setLocale(locale: FunctionLocale): void {
    this.locale = locale;
    this.grid.setLocale(locale);
  }

  /** Показать активную ячейку (или диапазон) в поле «Имя», строке формул и заголовках. */
  showActive(addr: string, range: string = addr): void {
    this.nameBox.textContent = addr;
    this.formulaText.textContent = formulaBarText(this.sheet.get(addr), this.locale);
    this.grid.highlightHeaders(range);
  }
}
