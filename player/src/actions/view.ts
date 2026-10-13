import type { LessonState } from "../lesson/state";
import { gridSize } from "../render/grid";
import type { MenuItem } from "../render/window";
import { parseCell } from "../sheet/address";
import { clickAt, ensureTab } from "./ribbon";
import type { Action, ActionSpec } from "./types";

// Глава 12: Вид → Окно → «Закрепить области ▾» и прокрутка листа колёсиком мыши.

export type FreezeKind = Extract<ActionSpec, { freezePanes: unknown }>["freezePanes"];

const FREEZE_ITEMS: Record<FreezeKind, MenuItem> = {
  panes: "freezePanes",
  topRow: "freezeTopRow",
  firstColumn: "freezeFirstColumn",
  unfreeze: "unfreezePanes",
};

/** Закрепить области: строки выше и столбцы левее активной ячейки; верхнюю строку; первый столбец; снять. */
export function applyFreeze(state: LessonState, kind: FreezeKind): void {
  const name = state.sheet.name;
  state.scrolled[name] = 0;
  if (kind === "unfreeze") {
    state.frozen[name] = null;
    return;
  }
  const at = parseCell(state.active);
  state.frozen[name] =
    kind === "panes" ? { row: at.row, col: at.col } : kind === "topRow" ? { row: 2, col: 1 } : { row: 1, col: 2 };
}

/** Сколько строк можно прокрутить: прокручиваемая часть листа минус то, что помещается в окне. */
function maxScroll(state: LessonState): number {
  const top = state.frozen[state.sheet.name]?.row ?? 1;
  const total = gridSize(state.sheet).rows;
  const visible = state.sheet.visibleRows ?? total;
  return Math.max(0, total - top + 1 - Math.max(1, visible - (top - 1)));
}

function scrollTo(state: LessonState, rows: number): void {
  state.scrolled[state.sheet.name] = Math.max(0, Math.min(rows, maxScroll(state)));
}

export function freezePanes(kind: FreezeKind): Action {
  return {
    kind: "freezePanes",
    apply: (state) => {
      state.ribbonTab = "view";
      state.menu = null;
      applyFreeze(state, kind);
    },
    async animate(ctx) {
      const { state, stage } = ctx;
      await ensureTab(ctx, "view");
      await clickAt(stage, stage.ribbonPoint("freezePanes"), stage.window.ribbonButton("freezePanes"));
      state.menu = "freeze";
      stage.render(state);
      const item = FREEZE_ITEMS[kind];
      await clickAt(stage, stage.menuPoint(item), stage.window.menuItem(item), 600);
      state.menu = null;
      applyFreeze(state, kind);
      stage.render(state);
    },
  };
}

/** Колёсико мыши: лист сдвигается строка за строкой; закреплённые строки остаются на месте. */
export function scroll(rows: number): Action {
  return {
    kind: "scroll",
    apply: (state) => scrollTo(state, (state.scrolled[state.sheet.name] ?? 0) + rows),
    async animate({ state, stage, clock }) {
      await stage.cursor.moveTo(stage.gridPoint(), 600);
      const from = state.scrolled[state.sheet.name] ?? 0;
      const to = Math.max(0, Math.min(from + rows, maxScroll(state)));
      const step = to > from ? 1 : -1;
      for (let r = from; r !== to; r += step) {
        scrollTo(state, r + step);
        stage.render(state);
        await clock.wait(70);
      }
    },
  };
}
