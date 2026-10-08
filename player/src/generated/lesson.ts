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
   * Значения из исходника для сверки
   */
  expect?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[A-Z]{1,3}[1-9][0-9]*$".
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
  fmt?: "general" | "number" | "usd" | "percent";
  style?: ("head" | "label" | "total") | null;
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
    Click | Select | Type | ClickRef | DragRef | DragSelect | Fill | Keys | ShowRefs | Wait,
    ...(Click | Select | Type | ClickRef | DragRef | DragSelect | Fill | Keys | ShowRefs | Wait)[]
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
    "Enter" | "Escape" | "Tab" | "Delete" | "F2" | "F4" | "Ctrl" | "Alt" | "Shift" | "C" | "V" | "X" | "Z" | "=",
    ...("Enter" | "Escape" | "Tab" | "Delete" | "F2" | "F4" | "Ctrl" | "Alt" | "Shift" | "C" | "V" | "X" | "Z" | "=")[]
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
