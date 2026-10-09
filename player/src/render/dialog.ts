// Окна Excel поверх листа: «Создать из выделенного», «Создание имени», «Диспетчер имён», «Вставка имени»,
// «Применение имён», сообщения. Рисуются из LessonState.dialogs; элементы помечены data-атрибутами —
// по ним курсор находит, куда «щёлкать» (поле, флажок, строку списка, кнопку).

import {
  CREATE_CHECKS,
  type Dialog,
  DIALOG_TITLES,
  dialogButtons,
  dialogItems,
  nameKey,
  scopeOptions,
} from "../lesson/dialogs";
import { bookOf, type LessonState } from "../lesson/state";
import { type FunctionLocale, formatValue, localizeFormula } from "../locale/format";
import { cellsInRange, parseRange } from "../sheet/address";
import { type NameDef, refersToText } from "../sheet/names";
import type { Workbook } from "../sheet/workbook";
import { escapeHtml } from "./editor";

const attr = (value: string) => escapeHtml(value).replaceAll('"', "&quot;");

/** «Значение» в диспетчере имён: {"1";"2";"4"} для диапазона, само значение — для ячейки. */
function nameValue(book: Workbook, def: NameDef, locale: FunctionLocale): string {
  if (def.base) return "";
  const values: string[] = [];
  for (const area of def.areas) {
    const sheet = book.sheetOrNull(area.sheet);
    if (!sheet) return "#ССЫЛКА!";
    const { start, end } = parseRange(area.ref);
    const extent = sheet.extent();
    const last = { row: Math.min(end.row, extent.rows), col: Math.min(end.col, extent.cols) };
    for (const addr of cellsInRange({ start, end: last })) {
      const value = sheet.value(addr);
      values.push(typeof value === "string" ? `"${value}"` : formatValue(value, "general", locale).text);
      if (values.length > 6) return `{${values.join(locale === "ru" ? ";" : ",")};…}`;
    }
  }
  return values.length === 1 ? (values[0] ?? "") : `{${values.join(locale === "ru" ? ";" : ",")}}`;
}

function buttonsHtml(dialog: Dialog): string {
  return dialogButtons(dialog)
    .map((label) => `<button type="button" class="xl-dbtn" data-button="${attr(label)}">${escapeHtml(label)}</button>`)
    .join("");
}

export class DialogView {
  readonly el: HTMLElement;
  /** Раскрытый список «Область» — только во время анимации выбора. */
  private openSelect: string | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "xl-dialogs";
    container.append(this.el);
  }

  setOpenSelect(field: string | null): void {
    this.openSelect = field;
  }

  render(state: LessonState, locale: FunctionLocale): void {
    this.el.replaceChildren(
      ...state.dialogs.map((dialog, i) => {
        const box = document.createElement("div");
        box.className = `xl-dialog xl-dialog-${dialog.kind}`;
        box.style.setProperty("--depth", String(i));
        box.innerHTML = `<div class="xl-dtitle">${escapeHtml(this.title(dialog))}<span>✕</span></div>
          <div class="xl-dbody">${this.body(state, dialog, locale, i === state.dialogs.length - 1)}</div>
          <div class="xl-dbtns">${buttonsHtml(dialog)}</div>`;
        return box;
      }),
    );
    this.el.hidden = state.dialogs.length === 0;
  }

  /** Элемент верхнего окна по селектору ([data-field="Имя"], [data-button="OK"]…). */
  target(selector: string): HTMLElement {
    const top = this.el.lastElementChild;
    const found = top?.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`В окне нет элемента ${selector}`);
    return found;
  }

  private title(dialog: Dialog): string {
    if (dialog.kind === "name" && dialog.original) return "Изменение имени";
    return DIALOG_TITLES[dialog.kind];
  }

  private body(state: LessonState, dialog: Dialog, locale: FunctionLocale, isTop: boolean): string {
    const book = bookOf(state);
    const sep = locale === "ru" ? ";" : ",";
    switch (dialog.kind) {
      case "alert":
        return `<p class="xl-dalert"><span class="xl-dicon">${dialog.confirm ? "?" : "!"}</span>${escapeHtml(dialog.text)}</p>`;
      case "createFromSelection":
        return `<p>Создать имена из значений:</p>${CREATE_CHECKS.map(
          (label) =>
            `<label class="xl-dcheck" data-check="${attr(label)}"><span class="xl-box-check${dialog.checks[label] ? " xl-on" : ""}"></span>${escapeHtml(label)}</label>`,
        ).join("")}`;
      case "name": {
        const field = (label: string, value: string, extra = "") =>
          `<label class="xl-dfield${dialog.focus === label && isTop ? " xl-focus" : ""}"><span>${escapeHtml(label)}:</span>
            <span class="xl-dinput${extra}" data-field="${attr(label)}">${escapeHtml(value)}</span></label>`;
        const options =
          this.openSelect === "Область" && isTop
            ? `<div class="xl-doptions">${scopeOptions(state)
                .map((o) => `<div data-option="${attr(o)}">${escapeHtml(o)}</div>`)
                .join("")}</div>`
            : "";
        return [
          field("Имя", dialog.fields.Имя),
          `<label class="xl-dfield"><span>Область:</span><span class="xl-dinput xl-dselect" data-field="Область">${escapeHtml(dialog.fields.Область)}<b>▾</b></span>${options}</label>`,
          field("Примечание", dialog.fields.Примечание, " xl-dmemo"),
          field("Диапазон", localizeFormula(dialog.fields.Диапазон, locale)),
        ].join("");
      }
      case "nameManager": {
        const rows = book.names
          .map((def) => {
            const key = nameKey(def);
            const on = dialog.selected.includes(key) ? " class=\"xl-on\"" : "";
            return `<tr data-item="${attr(key)}"${on}><td>${escapeHtml(def.name)}</td><td>${escapeHtml(nameValue(book, def, locale))}</td>
              <td>${escapeHtml(localizeFormula(refersToText(def, sep), locale))}</td><td>${escapeHtml(def.scope ?? "Книга")}</td>
              <td>${escapeHtml(def.comment ?? "")}</td></tr>`;
          })
          .join("");
        return `<table class="xl-dtable"><tr><th>Имя</th><th>Значение</th><th>Диапазон</th><th>Область</th><th>Примечание</th></tr>${rows}</table>`;
      }
      case "pasteName":
      case "applyNames": {
        const selected = dialog.kind === "pasteName" ? [dialog.selected] : dialog.selected;
        const items = dialogItems(state, dialog)
          .map((item) => `<div data-item="${attr(item)}"${selected.includes(item) ? ' class="xl-on"' : ""}>${escapeHtml(item)}</div>`)
          .join("");
        const caption = dialog.kind === "pasteName" ? "Вставить имя:" : "Применить имена:";
        return `<p>${caption}</p><div class="xl-dlist">${items}</div>`;
      }
    }
  }
}
