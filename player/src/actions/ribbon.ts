import type { Point } from "../render/geometry";
import {
  openApplyNames,
  openCreateFromSelection,
  openNameManager,
  openNewName,
} from "../lesson/dialogs";
import { type LessonState, pasteClipboard, ribbonAutosum, type RibbonTabId } from "../lesson/state";
import type { Stage } from "../render/stage";
import type { RibbonButton } from "../render/window";
import type { Action, ActionContext, ActionSpec } from "./types";

export type RibbonCommand = Extract<ActionSpec, { clickRibbon: unknown }>["clickRibbon"];

interface Command {
  tab: RibbonTabId;
  /** Меняет состояние; возвращает ячейки с новыми значениями (для вспышки). */
  apply(state: LessonState): string[];
}

const COMMANDS: Record<RibbonCommand, Command> = {
  autosum: { tab: "home", apply: ribbonAutosum },
  copy: {
    tab: "home",
    apply(state) {
      state.clipboard = state.selection;
      return [];
    },
  },
  paste: { tab: "home", apply: (state) => pasteClipboard(state, true) },
  nameManager: { tab: "formulas", apply: (state) => (openNameManager(state), []) },
  defineName: { tab: "formulas", apply: (state) => (openNewName(state), []) },
  createFromSelection: { tab: "formulas", apply: (state) => (openCreateFromSelection(state), []) },
  applyNames: { tab: "formulas", apply: (state) => (openApplyNames(state), []) },
};

const FLASH_STAGGER_MS = 140;

/** Подвести курсор и щёлкнуть, подсветив элемент на время нажатия. */
export async function clickAt(stage: Stage, point: Point, el?: HTMLElement, ms = 800): Promise<void> {
  stage.cursor.setShape("arrow");
  await stage.cursor.moveTo(point, ms);
  el?.classList.add("xl-glow");
  try {
    await stage.cursor.click();
  } finally {
    el?.classList.remove("xl-glow");
  }
}

/** Если нужная вкладка ленты не открыта — сначала щёлкнуть по ней. */
export async function ensureTab({ state, stage }: ActionContext, tab: RibbonTabId): Promise<void> {
  if (state.ribbonTab === tab) return;
  await clickAt(stage, stage.tabPoint(tab), undefined, 700);
  state.ribbonTab = tab;
  stage.render(state);
}

/** Щелчок по вкладке ленты («Формулы»). */
export function ribbonTab(tab: RibbonTabId): Action {
  return {
    kind: "ribbonTab",
    apply: (state) => {
      state.ribbonTab = tab;
      state.menu = null;
    },
    async animate(ctx) {
      await clickAt(ctx.stage, ctx.stage.tabPoint(tab), undefined, 700);
      ctx.state.ribbonTab = tab;
      ctx.state.menu = null;
      ctx.stage.render(ctx.state);
    },
  };
}

/**
 * Щелчок по кнопке ленты: «Σ Автосумма», «Копировать», «Вставить», «Диспетчер имён», «Присвоить имя»,
 * «Создать из выделенного», «Применить имена…» (через меню «Присвоить имя ▾»). Нужная вкладка
 * открывается сама, если урок не сделал этого раньше.
 */
export function clickRibbon(command: RibbonCommand): Action {
  const { tab, apply } = COMMANDS[command];
  return {
    kind: "clickRibbon",
    apply: (state) => {
      state.ribbonTab = tab;
      apply(state);
    },
    async animate(ctx) {
      const { state, stage, clock } = ctx;
      await ensureTab(ctx, tab);
      if (command === "applyNames") {
        await clickAt(stage, stage.ribbonPoint("defineNameMenu"), stage.window.ribbonButton("defineNameMenu"));
        state.menu = "defineName";
        stage.render(state);
        await clickAt(stage, stage.menuPoint("applyNames"), stage.window.menuItem("applyNames"), 500);
      } else {
        const button = command as RibbonButton;
        await clickAt(stage, stage.ribbonPoint(button), stage.window.ribbonButton(button));
      }
      const filled = apply(state);
      stage.render(state);
      for (const cell of filled) {
        stage.flash(cell);
        await clock.wait(FLASH_STAGGER_MS);
      }
    },
  };
}
