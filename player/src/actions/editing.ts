import { addRef, ensureEditor, setRef, typeChars } from "../lesson/state";
import { editorLength } from "../render/editor";
import { cellName, parseRange } from "../sheet/address";
import type { Action } from "./types";

const CHAR_MS = 140;

/** Набор текста в активной ячейке. На экране печатается уже локализованный текст (=СУММ(). */
export function type(text: string): Action {
  return {
    kind: "type",
    apply: (state) => typeChars(state, text),
    async animate({ state, stage, clock }) {
      const locale = stage.locale;
      const before = state.editor ? editorLength(state.editor, locale) : 0;
      typeChars(state, text);
      const after = editorLength(ensureEditor(state), locale);
      // Если перевод изменил уже набранное (SUM → СУММ после «(»), печатаем только хвост
      for (let shown = Math.min(before, after) + 1; shown <= after; shown++) {
        stage.render(state, shown);
        await clock.wait(CHAR_MS);
      }
      stage.render(state);
    },
  };
}

/** Щелчок по ячейке во время ввода формулы — в формулу вставляется цветная ссылка. */
export function clickRef(addr: string): Action {
  return {
    kind: "clickRef",
    apply: (state) => void addRef(state, addr),
    async animate({ state, stage }) {
      await stage.cursor.moveTo(stage.cellPoint(addr), 600);
      await stage.cursor.click();
      addRef(state, addr);
      stage.render(state);
    },
  };
}

/** Протягивание мышью по диапазону во время ввода формулы: ссылка растёт вместе с курсором. */
export function dragRef(range: string): Action {
  const { start, end } = parseRange(range);
  const from = cellName(start);
  const to = cellName(end);
  return {
    kind: "dragRef",
    apply: (state) => void addRef(state, range),
    async animate({ state, stage }) {
      const { cursor } = stage;
      await cursor.moveTo(stage.cellPoint(from), 700);
      await cursor.press();
      const part = addRef(state, from);
      stage.render(state);
      const rows = end.row - start.row;
      const cols = end.col - start.col;
      const steps = Math.max(rows, cols);
      await cursor.moveTo(stage.cellPoint(to), 260 * steps + 500, (t) => {
        const k = Math.round(t * steps);
        const current = cellName({
          row: start.row + Math.round((rows * k) / (steps || 1)),
          col: start.col + Math.round((cols * k) / (steps || 1)),
        });
        setRef(part, `${from}:${current}`);
        stage.render(state);
      });
      cursor.release();
      setRef(part, range);
      stage.render(state);
    },
  };
}
