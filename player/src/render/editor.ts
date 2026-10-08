import { editorRefs, editorText, type EditorState } from "../lesson/state";
import { type FunctionLocale, localizeFormula } from "../locale/format";
import { signatureAt } from "../locale/signatures";
import { relativeRect, type Rect } from "./geometry";
import type { GridView } from "./grid";

const REF_RE =
  /(?<![A-Za-z0-9_.Ѐ-ӿ])\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?(?![A-Za-z0-9_(Ѐ-ӿ])/g;

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

/** Редактор ячейки поверх сетки (как при вводе в Excel) и подсказка синтаксиса функции под ним. */
export class EditorView {
  readonly el: HTMLElement;
  readonly hint: HTMLElement;

  constructor(
    private readonly container: HTMLElement,
    private readonly grid: GridView,
  ) {
    this.el = document.createElement("div");
    this.el.className = "xl-editor";
    this.el.style.display = "none";
    this.hint = document.createElement("div");
    this.hint.className = "xl-hint";
    this.hint.style.display = "none";
    container.append(this.el, this.hint);
  }

  /** Возвращает HTML набранного текста — его же показывает строка формул. */
  render(editor: EditorState | null, locale: FunctionLocale, limit = Infinity): string {
    if (!editor) {
      this.el.style.display = "none";
      this.hint.style.display = "none";
      return "";
    }
    const html = editorHtml(editor, locale, limit);
    this.el.innerHTML = `${html}<span class="xl-caret"></span>`;

    const rect = relativeRect(this.grid.cell(editor.cell), this.container);
    Object.assign(this.el.style, {
      display: "flex",
      left: `${rect.x - 1}px`,
      top: `${rect.y - 1}px`,
      minWidth: `${rect.w + 1}px`,
      height: `${rect.h + 1}px`,
    });
    this.renderHint(limit === Infinity ? editorText(editor) : "", locale, rect);
    return html;
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
