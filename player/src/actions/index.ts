import { click, select, showRefs, wait } from "./basic";
import { clickRef, dragRef, type } from "./editing";
import { keys } from "./keys";
import { dragSelect, fill } from "./mouse";
import { clickRibbon } from "./ribbon";
import { type Action, type ActionSpec, UnsupportedAction } from "./types";

export { type Action, type ActionContext, type ActionSpec, UnsupportedAction } from "./types";

/** Действие плеера по записи из YAML. Неизвестные (пока) действия — UnsupportedAction. */
export function createAction(spec: ActionSpec): Action {
  if ("click" in spec) return click(spec.click);
  if ("select" in spec) return select(spec.select);
  if ("type" in spec) return type(spec.type);
  if ("clickRef" in spec) return clickRef(spec.clickRef);
  if ("dragRef" in spec) return dragRef(spec.dragRef);
  if ("dragSelect" in spec) return dragSelect(spec.dragSelect);
  if ("fill" in spec) return fill(spec.fill);
  if ("keys" in spec) return keys(spec.keys, spec);
  if ("showRefs" in spec) return showRefs(spec.showRefs);
  if ("wait" in spec) return wait(spec.wait);
  if ("clickRibbon" in spec) return clickRibbon(spec.clickRibbon);
  throw new UnsupportedAction(spec);
}
