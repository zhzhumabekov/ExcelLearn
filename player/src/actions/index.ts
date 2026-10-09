import { click, select, showRefs, wait } from "./basic";
import { clickRef, dragRef, type } from "./editing";
import { keys } from "./keys";
import { dragSelect, fill } from "./mouse";
import { dialogButton, dialogCheck, dialogChoose, dialogPick, dialogRange, dialogType } from "./dialogs";
import {
  addSelect,
  autocomplete,
  hideColumnsAction,
  nameBox,
  nameList,
  selectAll,
  selectColumn,
  selectRow,
  sheetTab,
} from "./names";
import { clickRibbon, ribbonTab } from "./ribbon";
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
  if ("ribbonTab" in spec) return ribbonTab(spec.ribbonTab);
  if ("nameBox" in spec) return nameBox(spec.nameBox);
  if ("nameList" in spec) return nameList(spec.nameList);
  if ("sheetTab" in spec) return sheetTab(spec.sheetTab);
  if ("addSelect" in spec) return addSelect(spec.addSelect);
  if ("selectRow" in spec) return selectRow(spec.selectRow);
  if ("selectColumn" in spec) return selectColumn(spec.selectColumn);
  if ("selectAll" in spec) return selectAll();
  if ("hideColumns" in spec) return hideColumnsAction(spec.hideColumns);
  if ("autocomplete" in spec) return autocomplete(spec.autocomplete);
  if ("dialogType" in spec) return dialogType(spec.dialogType.field, spec.dialogType.text);
  if ("dialogRange" in spec) return dialogRange(spec.dialogRange.field, spec.dialogRange.range);
  if ("dialogCheck" in spec) return dialogCheck(spec.dialogCheck);
  if ("dialogChoose" in spec) return dialogChoose(spec.dialogChoose.field, spec.dialogChoose.option);
  if ("dialogPick" in spec) {
    const pick = spec.dialogPick;
    return typeof pick === "string" ? dialogPick(pick) : dialogPick(pick.item, pick.add ?? null);
  }
  if ("dialogButton" in spec) return dialogButton(spec.dialogButton);
  throw new UnsupportedAction(spec);
}
