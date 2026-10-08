import { pasteClipboard, ribbonAutosum } from "../lesson/state";
import type { RibbonButton } from "../render/window";
import type { Action } from "./types";

const APPLY: Record<RibbonButton, (state: Parameters<Action["apply"]>[0]) => string[]> = {
  autosum: ribbonAutosum,
  copy: (state) => {
    state.clipboard = state.selection;
    return [];
  },
  paste: (state) => pasteClipboard(state, true),
};

const FLASH_STAGGER_MS = 140;

/** Щелчок по кнопке ленты (Σ Автосумма, Копировать, Вставить). */
export function clickRibbon(button: RibbonButton): Action {
  return {
    kind: "clickRibbon",
    apply: (state) => void APPLY[button](state),
    async animate({ state, stage, clock }) {
      const el = stage.window.ribbonButton(button);
      stage.cursor.setShape("arrow");
      await stage.cursor.moveTo(stage.ribbonPoint(button), 800);
      el.classList.add("xl-glow");
      try {
        await stage.cursor.click();
      } finally {
        el.classList.remove("xl-glow");
      }
      const filled = APPLY[button](state);
      stage.render(state);
      for (const cell of filled) {
        stage.flash(cell);
        await clock.wait(FLASH_STAGGER_MS);
      }
    },
  };
}
