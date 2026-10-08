import { commitEditor, selectRange } from "../lesson/state";
import { formulaRefs, parseRange, rangeName } from "../sheet/address";
import type { Action, ActionContext } from "./types";

const firstCell = (range: string) => {
  const { start } = parseRange(range);
  return rangeName({ start, end: start });
};

/** Щелчок по ячейке. Если шёл ввод — он завершается, как при щелчке мышью в Excel вне формулы. */
export function click(addr: string): Action {
  const apply = (state: ActionContext["state"]) => {
    if (state.editor) commitEditor(state);
    selectRange(state, addr);
  };
  return {
    kind: "click",
    apply,
    async animate({ state, stage }) {
      stage.cursor.setShape("arrow");
      await stage.cursor.moveTo(stage.cellPoint(addr));
      await stage.cursor.click();
      apply(state);
      stage.render(state);
    },
  };
}

/** Выделение ячейки или диапазона без анимации движения (например, после программного шага). */
export function select(range: string): Action {
  return {
    kind: "select",
    apply: (state) => selectRange(state, range),
    async animate({ state, stage }) {
      await stage.cursor.moveTo(stage.cellPoint(firstCell(range)), 600);
      selectRange(state, range);
      stage.render(state);
    },
  };
}

/** Подсветить ссылки формулы ячейки — как Excel при входе в формулу. */
export function showRefs(addr: string): Action {
  const apply = (state: ActionContext["state"]) => {
    selectRange(state, addr);
    const formula = state.sheet.formula(addr);
    state.shownRefs = formula ? formulaRefs(formula) : [];
  };
  return {
    kind: "showRefs",
    apply,
    async animate({ state, stage, clock }) {
      apply(state);
      stage.render(state);
      await clock.wait(1500);
    },
  };
}

export function wait(ms: number): Action {
  return {
    kind: "wait",
    apply: () => {},
    animate: ({ clock }) => clock.wait(ms),
  };
}
