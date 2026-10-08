import { fillRange, selectRange } from "../lesson/state";
import { cellName, parseRange, type RangePos } from "../sheet/address";
import type { Action } from "./types";

/** Ячейка на пути от start к end при прогрессе t (0…1) — для протягивания мышью. */
function along({ start, end }: RangePos, t: number): string {
  const steps = Math.max(end.row - start.row, end.col - start.col);
  const k = Math.round(t * steps) / (steps || 1);
  return cellName({
    row: start.row + Math.round((end.row - start.row) * k),
    col: start.col + Math.round((end.col - start.col) * k),
  });
}

function dragMs(range: RangePos): number {
  return 260 * Math.max(range.end.row - range.start.row, range.end.col - range.start.col) + 500;
}

/** Выделение диапазона протягиванием мыши. */
export function dragSelect(range: string): Action {
  const pos = parseRange(range);
  const from = cellName(pos.start);
  return {
    kind: "dragSelect",
    apply: (state) => selectRange(state, range),
    async animate({ state, stage }) {
      const { cursor } = stage;
      cursor.setShape("arrow");
      await cursor.moveTo(stage.cellPoint(from), 700);
      await cursor.press();
      selectRange(state, from);
      stage.render(state);
      await cursor.moveTo(stage.cellPoint(cellName(pos.end)), dragMs(pos), (t) => {
        selectRange(state, `${from}:${along(pos, t)}`);
        stage.render(state);
      });
      cursor.release();
      selectRange(state, range);
      stage.render(state);
    },
  };
}

const FILL_STAGGER_MS = 150;

/** Маркер заполнения: тянем квадратик в углу первой ячейки до конца диапазона. */
export function fill(range: string): Action {
  const pos = parseRange(range);
  const from = cellName(pos.start);
  return {
    kind: "fill",
    apply: (state) => void fillRange(state, range),
    async animate({ state, stage, clock }) {
      const { cursor, overlays } = stage;
      selectRange(state, from);
      stage.render(state);
      await cursor.moveTo(stage.cellPoint(from, "handle"), 500);
      cursor.setShape("plus");
      await clock.wait(500);
      await cursor.press();
      await cursor.moveTo(stage.cellPoint(cellName(pos.end), "handle"), dragMs(pos), (t) => {
        overlays.showFill(`${from}:${along(pos, t)}`);
      });
      cursor.release();
      overlays.showFill(null);
      const filled = fillRange(state, range);
      stage.render(state);
      for (const cell of filled) {
        stage.flash(cell);
        await clock.wait(FILL_STAGGER_MS);
      }
      cursor.setShape("arrow");
    },
  };
}
