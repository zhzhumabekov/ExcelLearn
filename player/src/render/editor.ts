import { partialName, type Suggestion } from "../lesson/dialogs";
import { editorRefs, editorText, type EditorState } from "../lesson/state";
import { type FunctionLocale, localizeFormula } from "../locale/format";
import { signatureAt } from "../locale/signatures";
import { relativeRect, type Rect } from "./geometry";
import type { GridView } from "./grid";

// Ссылка в тексте формулы: A1, $B$2:D9, целый столбец C:C или строка 1:1
const REF_RE =
  /(?<![\p{L}\p{N}_.!$:])(?:\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?[1-9][0-9]*:\$?[1-9][0-9]*)(?![\p{L}\p{N}_(:])/gu;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Подсветить ссылки в (уже локализованном) тексте формулы цветами по порядку refs — как в Excel. */
function colorRefsHtml(text: string, refs: readonly string[]): string {
  let html = "";
  let last = 0;
  for (const m of text.matchAll(REF_RE)) {
    const index = refs.indexOf(m[0].replaceAll("$", ""));
    html += escapeHtml(text.slice(last, m.index));
    html += index < 0 ? escapeHtml(m[0]) : `<span class="xl-reftext xl-ref${index % 4}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

/** Набранный текст на языке ученика (=СУММ(B2:D2) при вводе =SUM(B2:D2). */
export function editorDisplayText(editor: EditorState, locale: FunctionLocale): string {
  return editor.parts.map((p) => (p.ref === undefined ? localizeFormula(p.text, locale) : p.text)).join("");
}

export function editorLength(editor: EditorState, locale: FunctionLocale): number {
  return editorDisplayText(editor, locale).length;
}

/**
 * HTML редактора: видимые limit символов (анимация набора) с цветными ссылками. Ссылки окрашиваются
 * и вставленные мышью, и набранные с клавиатуры — цвет по порядку появления, как в Excel.
 */
export function editorHtml(editor: EditorState, locale: FunctionLocale, limit = Infinity): string {
  return colorRefsHtml(editorDisplayText(editor, locale).slice(0, limit), editorRefs(editor));
}

/** Формула с подсвеченными ссылками (по порядку refs), как в строке формул Excel при выделении. */
export function coloredFormulaHtml(formula: string, refs: readonly string[], locale: FunctionLocale): string {
  return colorRefsHtml(localizeFormula(formula, locale), refs);
}

/**
 * Редактор ячейки поверх сетки (как при вводе в Excel), подсказка синтаксиса функции под ним и список
 * автозавершения: пока набирается имя (=СРЗНАЧ(В), Excel предлагает функции и имена диапазонов.
 */
export class EditorView {
  readonly el: HTMLElement;
  readonly hint: HTMLElement;
  readonly list: HTMLElement;

  constructor(
    private readonly container: HTMLElement,
    private readonly view: { readonly grid: GridView },
  ) {
    this.el = document.createElement("div");
    this.el.className = "xl-editor";
    this.el.style.display = "none";
    this.hint = document.createElement("div");
    this.hint.className = "xl-hint";
    this.hint.style.display = "none";
    this.list = document.createElement("div");
    this.list.className = "xl-autocomplete";
    this.list.style.display = "none";
    container.append(this.el, this.hint, this.list);
  }

  /** Строка списка автозавершения (для наведения курсора). */
  suggestion(label: string): HTMLElement {
    const item = [...this.list.querySelectorAll<HTMLElement>("[data-suggestion]")].find(
      (i) => i.dataset.suggestion?.toLocaleLowerCase("ru") === label.toLocaleLowerCase("ru"),
    );
    if (!item) throw new Error(`В списке автозавершения нет «${label}»`);
    return item;
  }

  /** Возвращает HTML набранного текста — его же показывает строка формул. */
  render(
    editor: EditorState | null,
    locale: FunctionLocale,
    limit = Infinity,
    suggest?: (partial: string) => Suggestion[],
  ): string {
    this.list.style.display = "none";
    if (!editor) {
      this.el.style.display = "none";
      this.hint.style.display = "none";
      return "";
    }
    const html = editorHtml(editor, locale, limit);
    this.el.innerHTML = `${html}<span class="xl-caret"></span>`;

    const rect = relativeRect(this.view.grid.cell(editor.cell), this.container);
    Object.assign(this.el.style, {
      display: "flex",
      left: `${rect.x - 1}px`,
      top: `${rect.y - 1}px`,
      minWidth: `${rect.w + 1}px`,
      height: `${rect.h + 1}px`,
    });
    this.renderHint(limit === Infinity ? editorText(editor) : "", locale, rect);
    if (limit === Infinity && suggest) this.renderList(editorText(editor), suggest, rect);
    return html;
  }

  private renderList(text: string, suggest: (partial: string) => Suggestion[], cell: Rect): void {
    const partial = partialName(text);
    const items = partial ? suggest(partial) : [];
    if (!items.length) return;
    this.list.innerHTML = items
      .map(
        (s) =>
          `<div data-suggestion="${escapeHtml(s.label).replaceAll('"', "&quot;")}"><i class="xl-ac-${s.kind}"></i>${escapeHtml(s.label)}</div>`,
      )
      .join("");
    this.hint.style.display = "none"; // список заменяет подсказку синтаксиса, как в Excel
    Object.assign(this.list.style, { display: "block", left: `${cell.x}px`, top: `${cell.y + cell.h + 3}px` });
  }

  private renderHint(text: string, locale: FunctionLocale, cell: Rect): void {
    const signature = text ? signatureAt(text, locale) : null;
    if (!signature) {
      this.hint.style.display = "none";
      return;
    }
    const sep = locale === "ru" ? "; " : ", ";
    const params = signature.params.map((p, i) => (i === signature.current ? `<b>${escapeHtml(p)}</b>` : escapeHtml(p)));
    this.hint.innerHTML = `${escapeHtml(signature.name)}(${params.join(sep)})`;
    Object.assign(this.hint.style, { display: "block", left: `${cell.x}px`, top: `${cell.y + cell.h + 3}px` });
  }
}
