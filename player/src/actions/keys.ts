import {
  addRef,
  autosumRange,
  commitEditor,
  ensureEditor,
  type LessonState,
  pasteClipboard,
  toggleLastRef,
  typeChars,
  undo,
} from "../lesson/state";
import { openPasteName } from "../lesson/dialogs";
import type { RibbonButton } from "../render/window";
import type { Key } from "./key-types";
import { type Action, type ActionSpec, UnsupportedAction } from "./types";

interface KeyHandler {
  /** Меняет состояние; возвращает ячейки, получившие новые значения (для вспышки). */
  apply(state: LessonState): string[] | undefined;
  /** Кнопка ленты с тем же действием — подсвечивается при нажатии клавиш. */
  ribbon?: RibbonButton;
}

/** Сочетания клавиш, которые понимает плеер. Ключ — клавиши через «+», как в YAML. */
const HANDLERS: Record<string, KeyHandler> = {
  Enter: {
    // В Excel Enter: завершает ввод; без ввода — вставляет скопированное (и очищает буфер); иначе вниз
    apply(state) {
      if (state.editor) {
        const cell = state.editor.cell;
        commitEditor(state);
        return [cell];
      }
      if (state.clipboard) return pasteClipboard(state, false);
      commitEditor(state);
      return undefined;
    },
  },
  "Ctrl+C": {
    ribbon: "copy",
    apply(state) {
      state.clipboard = state.selection;
      return undefined;
    },
  },
  "Ctrl+V": {
    ribbon: "paste",
    apply: (state) => pasteClipboard(state, true),
  },
  "Ctrl+Z": {
    apply(state) {
      undo(state);
      return undefined;
    },
  },
  F3: {
    apply(state) {
      openPasteName(state);
      return undefined;
    },
  },
  F4: {
    apply(state) {
      toggleLastRef(state);
      return undefined;
    },
  },
  Escape: {
    apply(state) {
      if (state.editor) state.editor = null;
      else state.clipboard = null;
      return undefined;
    },
  },
  "Alt+=": {
    ribbon: "autosum",
    apply(state) {
      const range = autosumRange(state.sheet, state.active);
      ensureEditor(state);
      typeChars(state, "=SUM(");
      if (range) addRef(state, range);
      typeChars(state, ")");
      return undefined;
    },
  },
};

const FLASH_STAGGER_MS = 140;

export function keys(combo: readonly Key[], spec: ActionSpec): Action {
  const handler = HANDLERS[combo.join("+")];
  if (!handler) throw new UnsupportedAction(spec);
  return {
    kind: "keys",
    apply: (state) => void handler.apply(state),
    async animate({ state, stage, clock }) {
      const button = handler.ribbon && stage.window.ribbonButton(handler.ribbon);
      button?.classList.add("xl-glow");
      try {
        await stage.keys.show(combo);
      } finally {
        button?.classList.remove("xl-glow");
      }
      const changed = handler.apply(state) ?? [];
      stage.render(state);
      for (const cell of changed) {
        stage.flash(cell);
        if (changed.length > 1) await clock.wait(FLASH_STAGGER_MS);
      }
    },
  };
}
