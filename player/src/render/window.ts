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
  | "createFromSelection"
  | "format"
  | "find"
  | "textToColumns"
  | "flashFill";

/** Пункты меню «Присвоить имя ▾» и «Формат ▾» (с подменю «Скрыть или отобразить»). */
export type MenuItem =
  | "defineName"
  | "applyNames"
  | "hideUnhide"
  | "hideRows"
  | "hideColumns"
  | "unhideRows"
  | "unhideColumns"
  | "findItem"
  | "replace";

export type MenuState = "defineName" | "format" | "format-hide" | "find" | null;

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

/** Выпадающее меню ленты; caption — серый заголовок раздела («Видимость»). */
function menu(items: [MenuItem, string][], caption?: string): HTMLElement {
  const box = el("div", "xl-menu");
  box.hidden = true;
  if (caption) box.append(el("div", "xl-menu-caption", caption));
  for (const [id, label] of items) {
    const item = el("div", "xl-menu-item", label);
    item.dataset.menu = id;
    box.append(item);
  }
  return box;
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
  ["Данные", "data"],
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
  private readonly formatMenu: HTMLElement;
  private readonly hideMenu: HTMLElement;
  private readonly findMenu: HTMLElement;
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

    // «Формат ▾» → «Скрыть или отобразить ▸» → «Скрыть столбцы» (Главная → Ячейки)
    const format = el("span", "xl-split");
    format.append(ribbonButton("format", "▤", "Формат ▾"));
    this.formatMenu = menu([["hideUnhide", "Скрыть или отобразить ▸"]], "Видимость");
    this.hideMenu = menu([
      ["hideRows", "Скрыть строки"],
      ["hideColumns", "Скрыть столбцы"],
      ["unhideRows", "Отобразить строки"],
      ["unhideColumns", "Отобразить столбцы"],
    ]);
    this.hideMenu.classList.add("xl-submenu");
    this.formatMenu.append(this.hideMenu);
    format.append(this.formatMenu);
    // «Найти и выделить ▾» → «Заменить…» (Главная → Редактирование)
    const find = el("span", "xl-split");
    find.append(ribbonButton("find", "🔍", "Найти и выделить ▾"));
    this.findMenu = menu([
      ["findItem", "Найти…"],
      ["replace", "Заменить…"],
    ]);
    find.append(this.findMenu);
    const editing = el("div", "xl-rstack");
    editing.append(ribbonButton("autosum", "Σ", "Автосумма"), find);
    const home = el("div", "xl-ribbon");
    home.append(
      ribbonGroup("Буфер обмена", ribbonButton("paste", "📋", "Вставить"), ribbonButton("copy", "⧉", "Копировать")),
      ribbonGroup("Шрифт", el("span", "xl-font", "Calibri"), el("span", "xl-font", "11"), ribbonButton(null, "Ж", "")),
      ribbonGroup("Ячейки", format),
      ribbonGroup("Редактирование", editing),
    );

    // «Присвоить имя ▾»: основная часть открывает окно, стрелка — меню («Применить имена…»)
    const define = el("span", "xl-split");
    define.append(ribbonButton("defineName", "🏷", "Присвоить имя"), ribbonButton("defineNameMenu", "▾", ""));
    this.menu = menu([
      ["defineName", "Присвоить имя…"],
      ["applyNames", "Применить имена…"],
    ]);
    define.append(this.menu);
    // Как в Excel: большая кнопка «Диспетчер имён» и столбик из трёх маленьких
    const manager = ribbonButton("nameManager", "📇", "Диспетчер имён");
    manager.classList.add("xl-rbig");
    const stack = el("div", "xl-rstack");
    stack.append(define, ribbonButton(null, "ƒ", "Использовать в формуле ▾"), ribbonButton("createFromSelection", "▦", "Создать из выделенного"));
    const insertFunction = ribbonButton(null, "fx", "Вставить функцию");
    insertFunction.classList.add("xl-rbig");
    const formulas = el("div", "xl-ribbon");
    formulas.append(ribbonGroup("Библиотека функций", insertFunction), ribbonGroup("Определённые имена", manager, stack));
    // Данные → Работа с данными: «Текст по столбцам», «Мгновенное заполнение»
    const data = el("div", "xl-ribbon");
    const toColumns = ribbonButton("textToColumns", "⫼", "Текст по столбцам");
    toColumns.classList.add("xl-rbig");
    data.append(
      ribbonGroup("Сортировка и фильтр", ribbonButton(null, "⇅", "Сортировка"), ribbonButton(null, "⏷", "Фильтр")),
      ribbonGroup("Работа с данными", toColumns, ribbonButton("flashFill", "⚡", "Мгновенное заполнение")),
    );
    this.ribbons.set("home", home);
    this.ribbons.set("formulas", formulas);
    this.ribbons.set("data", data);

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

    this.el.append(title, tabs, home, formulas, data, formulaBar, this.gridWrap, sheets);
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
    const item = this.el.querySelector<HTMLElement>(`[data-menu="${id}"]`);
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

  showMenu(open: MenuState): void {
    this.menu.hidden = open !== "defineName";
    this.formatMenu.hidden = open !== "format" && open !== "format-hide";
    this.hideMenu.hidden = open !== "format-hide";
    this.findMenu.hidden = open !== "find";
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
