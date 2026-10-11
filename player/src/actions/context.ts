import { openFormatCells } from "../lesson/text-tools";
import type { ContextMenu } from "../generated/lesson";
import { clickAt } from "./ribbon";
import type { Action } from "./types";

type ContextCommand = ContextMenu["contextMenu"];

/**
 * Правая кнопка мыши по выделению → пункт контекстного меню. Выделение не меняется (щелчок правой
 * кнопкой внутри выделенного диапазона его сохраняет), меню открывается у активной ячейки.
 */
export function contextMenu(command: ContextCommand): Action {
  const apply = (state: Parameters<Action["apply"]>[0]) => {
    state.contextMenu = null;
    if (command === "formatCells") openFormatCells(state);
  };
  return {
    kind: "contextMenu",
    apply,
    async animate({ state, stage }) {
      await clickAt(stage, stage.cellPoint(state.active));
      state.contextMenu = state.active;
      stage.render(state);
      await clickAt(stage, stage.contextItemPoint(command), stage.window.contextItem(command), 600);
      apply(state);
      stage.render(state);
    },
  };
}
