/* Сгенерировано из lessons/schema.py (manage.py lessons_schema + pnpm gen:types). Не править вручную. */

export interface Lesson {
  /**
   * Стабильный id: хранится в БД прогресса, не переименовывать
   */
  id: string;
  chapter: string;
  /**
   * Порядок внутри главы
   */
  order: number;
  title: string;
  /**
   * Откуда сценарий, например «Рис. 1.1»
   */
  source?: string | null;
  sheet: Sheet;
  /**
   * Другие листы книги (ярлыки справа от первого)
   */
  sheets?: Sheet[];
  /**
   * Имена, определённые к началу урока
   */
  names?: NameSpec[];
  /**
   * Значения из исходника для сверки
   */
  expect?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^(?:[^!]+!)?[A-Z]{1,3}[1-9][0-9]*$".
     */
    [k: string]: string | number;
  };
  /**
   * @minItems 1
   */
  steps: [Step, ...Step[]];
}
export interface Sheet {
  /**
   * Имя файла в окне Excel, например Wagestemp.xlsx
   */
  file?: string | null;
  name?: string;
  /**
   * Ширина колонок в пикселях
   */
  columns?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[A-Z]{1,3}$".
     */
    [k: string]: number;
  };
  /**
   * Сколько строк показывать
   */
  rows?: number | null;
  cells?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[A-Z]{1,3}[1-9][0-9]*$".
     */
    [k: string]: string | number | CellSpec;
  };
}
export interface CellSpec {
  v?: string | number | null;
  /**
   * Формула, уже записанная в ячейке шаблона
   */
  f?: string | null;
  fmt?: "general" | "number" | "usd" | "kzt" | "percent";
  style?: ("head" | "label" | "total") | null;
}
/**
 * Имя, уже определённое в книге к началу урока.
 */
export interface NameSpec {
  name: string;
  /**
   * Диапазон: B6, B6:B55, 12:12, A:A, Лист2!E4:E6; несколько частей — через запятую
   */
  ref: string;
  /**
   * Лист для области «лист»; по умолчанию — книга
   */
  scope?: string | null;
  comment?: string | null;
  /**
   * Ячейка, от которой отсчитана относительная ссылка (B7 для «предыдущий_год» = B6)
   */
  relativeTo?: string | null;
}
export interface Step {
  /**
   * Заголовок шага; плейсхолдеры как в text
   */
  title: string;
  /**
   * Пояснение на экране; разрешены <b>, <code>, <kbd>, плейсхолдеры {fn:SUM} и {f:=SUM(A1:A3)}
   */
  text: string;
  /**
   * Текст для диктора; {fn:SUM} подставляется по языку
   */
  say?: string | null;
  /**
   * @minItems 1
   */
  actions: [
    (
      | Click
      | Select
      | Type
      | ClickRef
      | DragRef
      | DragSelect
      | Fill
      | Keys
      | ShowRefs
      | Wait
      | ClickRibbon
      | RibbonTab
      | NameBox
      | NameList
      | SheetTab
      | AddSelect
      | SelectRow
      | SelectColumn
      | SelectAll
      | Autocomplete
      | DialogType
      | DialogRange
      | DialogCheck
      | DialogChoose
      | DialogPick
      | DialogButton
    ),
    ...(
      | Click
      | Select
      | Type
      | ClickRef
      | DragRef
      | DragSelect
      | Fill
      | Keys
      | ShowRefs
      | Wait
      | ClickRibbon
      | RibbonTab
      | NameBox
      | NameList
      | SheetTab
      | AddSelect
      | SelectRow
      | SelectColumn
      | SelectAll
      | Autocomplete
      | DialogType
      | DialogRange
      | DialogCheck
      | DialogChoose
      | DialogPick
      | DialogButton
    )[]
  ];
}
export interface Click {
  click: string;
}
export interface Select {
  select: string;
}
export interface Type {
  type: string;
}
export interface ClickRef {
  clickRef: string;
}
export interface DragRef {
  dragRef: string;
}
export interface DragSelect {
  dragSelect: string;
}
export interface Fill {
  fill: string;
}
export interface Keys {
  /**
   * @minItems 1
   */
  keys: [
    "Enter" | "Escape" | "Tab" | "Delete" | "F2" | "F3" | "F4" | "Ctrl" | "Alt" | "Shift" | "C" | "V" | "X" | "Z" | "=",
    ...(
      | "Enter"
      | "Escape"
      | "Tab"
      | "Delete"
      | "F2"
      | "F3"
      | "F4"
      | "Ctrl"
      | "Alt"
      | "Shift"
      | "C"
      | "V"
      | "X"
      | "Z"
      | "="
    )[]
  ];
}
export interface ShowRefs {
  showRefs: string;
}
export interface Wait {
  /**
   * Пауза в миллисекундах
   */
  wait: number;
}
/**
 * Щелчок по кнопке ленты. Главная: «Σ Автосумма», «Копировать», «Вставить». Формулы → Определённые имена:
 * «Диспетчер имён», «Присвоить имя», «Создать из выделенного», «Применить имена…» (из меню «Присвоить имя»).
 */
export interface ClickRibbon {
  clickRibbon: "autosum" | "copy" | "paste" | "nameManager" | "defineName" | "createFromSelection" | "applyNames";
}
/**
 * Переключить вкладку ленты.
 */
export interface RibbonTab {
  ribbonTab: "home" | "formulas";
}
/**
 * Щелчок в поле «Имя», набор имени и Enter: имя выделенному диапазону (или переход к существующему).
 */
export interface NameBox {
  nameBox: string;
}
/**
 * Стрелка поля «Имя» → список имён → щелчок по имени: Excel выделяет его диапазон.
 */
export interface NameList {
  nameList: string;
}
/**
 * Щелчок по ярлыку листа.
 */
export interface SheetTab {
  sheetTab: string;
}
/**
 * С нажатым Ctrl протянуть ещё один диапазон — выделение из нескольких частей.
 */
export interface AddSelect {
  addSelect: string;
}
/**
 * Щелчок по номеру строки — выделение всей строки.
 */
export interface SelectRow {
  selectRow: number;
}
/**
 * Щелчок по букве столбца — выделение всего столбца.
 */
export interface SelectColumn {
  selectColumn: string;
}
/**
 * Кнопка «Выделить всё» на пересечении заголовков.
 */
export interface SelectAll {
  selectAll: true;
}
/**
 * Двойной щелчок по имени (функции или диапазона) в списке автозавершения формулы.
 */
export interface Autocomplete {
  autocomplete: string;
}
/**
 * Набор текста в поле открытого окна (поле очищается).
 */
export interface DialogType {
  dialogType: DialogTypeSpec;
}
export interface DialogTypeSpec {
  /**
   * Подпись поля окна: «Имя», «Диапазон», «Примечание»
   */
  field: string;
  text: string;
}
/**
 * Выделить диапазон мышью на листе, пока в окне активно поле ссылки (=Лист1!$A$2:$B$7).
 */
export interface DialogRange {
  dialogRange: DialogRangeSpec;
}
export interface DialogRangeSpec {
  field: string;
  range: string;
}
/**
 * Флажок в окне («в столбце слева»): щелчок меняет его состояние.
 */
export interface DialogCheck {
  dialogCheck: string;
}
/**
 * Раскрывающийся список в окне («Область» → «Лист1»).
 */
export interface DialogChoose {
  dialogChoose: DialogChooseSpec;
}
export interface DialogChooseSpec {
  field: string;
  option: string;
}
/**
 * Щелчок по строке списка в окне (имя в диспетчере, в «Вставке имени», в «Применении имён»).
 */
export interface DialogPick {
  dialogPick: string | DialogPickSpec;
}
export interface DialogPickSpec {
  item: string;
  /**
   * Добавить к выбору с Ctrl или Shift
   */
  add?: ("ctrl" | "shift") | null;
}
/**
 * Кнопка окна: «OK», «Отмена», «Закрыть», «Создать…», «Изменить…», «Удалить», «Все имена».
 */
export interface DialogButton {
  dialogButton: string;
}
