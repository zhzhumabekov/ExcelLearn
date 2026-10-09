import type { RibbonTabId } from "../lesson/state";
import type { FunctionLocale } from "../locale/format";
import type { SheetModel } from "../sheet/sheet-model";
import type { Workbook } from "../sheet/workbook";
import { formulaBarText, GridView } from "./grid";

/** Кнопки ленты, на которые могут ссылаться шаги урока (подсветка, клик курсором). */
export type RibbonButton =
  | "paste"
  | "copy"
  | "autosum"
  | "nameManager"
  | "defineName"
  | "defineNameMenu"
  | "createFromSelection";

/** Пункты меню «Присвоить имя ▾». */
export type MenuItem = "defineName" | "applyNames";

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

const TABS: [string, RibbonTabId | null][] = [
  ["Файл", null],
  ["Главная", "home"],
  ["Вставка", null],
  ["Формулы", "formulas"],
  ["Данные", null],
  ["Вид", null],
];

/** Окно Excel: заголовок, вкладки и лента, поле «Имя», строка формул, сетка листа и ярлыки листов. */
export class WindowView {
  readonly el: HTMLElement;
  /** Контейнер сетки — система координат для выделения, рамок и редактора (T11). */
  readonly gridWrap: HTMLElement;
  readonly nameBox: HTMLElement;
  readonly nameField: HTMLElement;
  readonly nameList: HTMLElement;
  readonly formulaText: HTMLElement;
  private readonly grids = new Map<string, GridView>();
  private readonly ribbons = new Map<RibbonTabId, HTMLElement>();
  private readonly tabs = new Map<RibbonTabId, HTMLElement>();
  private readonly sheetTabs = new Map<string, HTMLElement>();
  private readonly menu: HTMLElement;
  private current: GridView;

  constructor(
    private readonly book: Workbook,
    private locale: FunctionLocale,
  ) {
    const first = book.sheets[0];
    if (!first) throw new Error("В книге нет листов");
    this.el = el("div", "xl-window");

    const title = el("div", "xl-title");
    title.append(el("span", "", `${first.file ?? "Книга1.xlsx"} — Excel`), el("span", "xl-dots"));

    const tabs = el("div", "xl-tabs");
    for (const [label, id] of TABS) {
      const tab = el("span", "", label);
      if (id) {
        tab.dataset.tab = id;
        this.tabs.set(id, tab);
      }
      tabs.append(tab);
    }

    const home = el("div", "xl-ribbon");
    home.append(
      ribbonGroup("Буфер обмена", ribbonButton("paste", "📋", "Вставить"), ribbonButton("copy", "⧉", "Копировать")),
      ribbonGroup("Шрифт", el("span", "xl-font", "Calibri"), el("span", "xl-font", "11"), ribbonButton(null, "Ж", "")),
      ribbonGroup("Редактирование", ribbonButton("autosum", "Σ", "Автосумма")),
    );

    // «Присвоить имя ▾»: основная часть открывает окно, стрелка — меню («Применить имена…»)
    const define = el("span", "xl-split");
    define.append(ribbonButton("defineName", "🏷", "Присвоить имя"), ribbonButton("defineNameMenu", "▾", ""));
    this.menu = el("div", "xl-menu");
    this.menu.hidden = true;
    for (const [id, label] of [
      ["defineName", "Присвоить имя…"],
      ["applyNames", "Применить имена…"],
    ] as const) {
      const item = el("div", "xl-menu-item", label);
      item.dataset.menu = id;
      this.menu.append(item);
    }
    define.append(this.menu);
    const formulas = el("div", "xl-ribbon");
    formulas.append(
      ribbonGroup(
        "Библиотека функций",
        ribbonButton(null, "fx", "Вставить функцию"),
        ribbonButton(null, "Σ", "Автосумма"),
        ribbonButton(null, "📒", "Финансовые"),
        ribbonButton(null, "?", "Логические"),
      ),
      ribbonGroup(
        "Определённые имена",
        ribbonButton("nameManager", "📇", "Диспетчер имён"),
        define,
        ribbonButton(null, "ƒ", "Использовать в формуле"),
        ribbonButton("createFromSelection", "▦", "Создать из выделенного"),
      ),
    );
    this.ribbons.set("home", home);
    this.ribbons.set("formulas", formulas);

    const formulaBar = el("div", "xl-fbar");
    // Поле «Имя» — отдельное поле со стрелкой списка, как в Excel, а не просто подпись
    this.nameField = el("div", "xl-namebox");
    this.nameField.title = "Поле «Имя»: адрес активной ячейки";
    this.nameBox = el("span", "xl-name");
    const arrow = el("span", "xl-name-arrow", "▾");
    arrow.dataset.namelist = "";
    this.nameField.append(this.nameBox, arrow);
    this.nameList = el("div", "xl-namelist");
    this.nameList.hidden = true;
    this.nameField.append(this.nameList);
    this.formulaText = el("div", "xl-ftext");
    formulaBar.append(this.nameField, el("div", "xl-fx", "fx"), this.formulaText);

    for (const sheet of book.sheets) this.grids.set(sheet.name, new GridView(sheet, locale));
    this.current = this.grids.get(first.name) as GridView;
    this.gridWrap = el("div", "xl-grid-wrap");
    this.gridWrap.append(this.current.table);

    const sheets = el("div", "xl-sheets");
    for (const sheet of book.sheets) {
      const tab = el("span", "", sheet.name);
      tab.dataset.sheet = sheet.name;
      this.sheetTabs.set(sheet.name, tab);
      sheets.append(tab);
    }
    sheets.append(el("span", "", "+"));

    this.el.append(title, tabs, home, formulas, formulaBar, this.gridWrap, sheets);
    this.showTab("home");
    this.showSheet(first.name);
  }

  /** Сетка активного листа. */
  get grid(): GridView {
    return this.current;
  }

  ribbonButton(id: RibbonButton): HTMLElement {
    const button = this.el.querySelector<HTMLElement>(`[data-ribbon="${id}"]`);
    if (!button) throw new Error(`Нет кнопки ленты ${id}`);
    return button;
  }

  tab(id: RibbonTabId): HTMLElement {
    const tab = this.tabs.get(id);
    if (!tab) throw new Error(`Нет вкладки ${id}`);
    return tab;
  }

  menuItem(id: MenuItem): HTMLElement {
    const item = this.menu.querySelector<HTMLElement>(`[data-menu="${id}"]`);
    if (!item) throw new Error(`Нет пункта меню ${id}`);
    return item;
  }

  sheetTab(name: string): HTMLElement {
    const tab = this.sheetTabs.get(name);
    if (!tab) throw new Error(`Нет ярлыка листа «${name}»`);
    return tab;
  }

  nameListArrow(): HTMLElement {
    return this.nameField.querySelector<HTMLElement>("[data-namelist]") as HTMLElement;
  }

  nameListItem(name: string): HTMLElement {
    const item = [...this.nameList.querySelectorAll<HTMLElement>("[data-name]")].find(
      (i) => i.dataset.name?.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"),
    );
    if (!item) throw new Error(`В списке поля «Имя» нет «${name}»`);
    return item;
  }

  showTab(id: RibbonTabId): void {
    for (const [key, ribbon] of this.ribbons) ribbon.hidden = key !== id;
    for (const [key, tab] of this.tabs) tab.classList.toggle("xl-on", key === id);
  }

  showMenu(open: boolean): void {
    this.menu.hidden = !open;
  }

  showNameList(names: readonly string[] | null): void {
    this.nameList.hidden = names === null;
    if (names === null) return;
    this.nameList.replaceChildren(
      ...names.map((name) => {
        const item = el("div", "xl-namelist-item", name);
        item.dataset.name = name;
        return item;
      }),
    );
  }

  /** Переключить лист: сетка этого листа и выбранный ярлык. */
  showSheet(name: string): void {
    const grid = this.grids.get(name);
    if (!grid) throw new Error(`Нет листа «${name}»`);
    if (grid !== this.current) {
      this.current.table.replaceWith(grid.table);
      this.current = grid;
    }
    for (const [key, tab] of this.sheetTabs) tab.classList.toggle("xl-on", key === name);
  }

  setLocale(locale: FunctionLocale): void {
    this.locale = locale;
    for (const grid of this.grids.values()) grid.setLocale(locale);
  }

  /** Показать активную ячейку (или диапазон) в поле «Имя», строке формул и заголовках. */
  showActive(sheet: SheetModel, addr: string, range: string = addr): void {
    this.nameBox.textContent = addr;
    this.formulaText.textContent = formulaBarText(sheet.get(addr), this.locale);
    this.current.highlightHeaders(range);
  }

  get workbook(): Workbook {
    return this.book;
  }
}
