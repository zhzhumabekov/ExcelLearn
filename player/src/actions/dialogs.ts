// Действия в открытом окне Excel: набрать в поле, выделить диапазон для поля ссылки, щёлкнуть флажок,
// выбрать вариант раскрывающегося списка, строку списка (с Ctrl/Shift), нажать кнопку.

import {
  dialogChooseOption,
  dialogFieldRange,
  dialogFieldText,
  dialogPickItem,
  dialogToggle,
  pressDialogButton,
  topDialog,
} from "../lesson/dialogs";
import { cellName, parseRange } from "../sheet/address";
import { along, dragMs } from "./mouse";
import { clickAt } from "./ribbon";
import type { Action } from "./types";

const CHAR_MS = 110;
const FLASH_STAGGER_MS = 140;
const css = (value: string) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

/** Щелчок в поле окна и набор текста (прежний текст заменяется). */
export function dialogType(field: string, text: string): Action {
  const selector = `[data-field="${css(field)}"]`;
  return {
    kind: "dialogType",
    apply: (state) => dialogFieldText(state, field, text),
    async animate({ state, stage, clock }) {
      await clickAt(stage, stage.dialogPoint(selector), undefined, 700);
      for (let i = 0; i <= text.length; i++) {
        dialogFieldText(state, field, text.slice(0, i));
        stage.render(state);
        if (i < text.length) await clock.wait(CHAR_MS);
      }
    },
  };
}

/** Поле ссылки активно — выделяем диапазон мышью на листе; Excel вписывает =Лист1!$A$2:$B$7. */
export function dialogRange(field: string, range: string): Action {
  const selector = `[data-field="${css(field)}"]`;
  const pos = parseRange(range);
  const from = cellName(pos.start);
  return {
    kind: "dialogRange",
    apply: (state) => dialogFieldRange(state, field, range),
    async animate({ state, stage }) {
      await clickAt(stage, stage.dialogPoint(selector), undefined, 700);
      const { cursor } = stage;
      await cursor.moveTo(stage.cellPoint(from), 700);
      await cursor.press();
      await cursor.moveTo(stage.cellPoint(cellName(pos.end)), dragMs(pos), (t) => {
        const part = `${from}:${along(pos, t)}`;
        dialogFieldRange(state, field, part);
        stage.overlays.showAnts(part);
        stage.render(state);
        stage.overlays.showAnts(part);
      });
      cursor.release();
      dialogFieldRange(state, field, range);
      stage.render(state);
    },
  };
}

/** Флажок в окне. */
export function dialogCheck(label: string): Action {
  const selector = `[data-check="${css(label)}"]`;
  return {
    kind: "dialogCheck",
    apply: (state) => dialogToggle(state, label),
    async animate({ state, stage }) {
      await clickAt(stage, stage.dialogPoint(selector), undefined, 700);
      dialogToggle(state, label);
      stage.render(state);
    },
  };
}

/** Раскрывающийся список: щелчок — варианты — щелчок по варианту. */
export function dialogChoose(field: string, option: string): Action {
  return {
    kind: "dialogChoose",
    apply: (state) => dialogChooseOption(state, field, option),
    async animate({ state, stage, clock }) {
      await clickAt(stage, stage.dialogPoint(`[data-field="${css(field)}"]`), undefined, 700);
      stage.dialogs.setOpenSelect(field);
      stage.render(state);
      try {
        await clock.wait(400);
        await clickAt(stage, stage.dialogPoint(`[data-option="${css(option)}"]`), undefined, 600);
      } finally {
        stage.dialogs.setOpenSelect(null);
      }
      dialogChooseOption(state, field, option);
      stage.render(state);
    },
  };
}

/** Строка списка окна; add — с нажатым Ctrl или Shift. */
export function dialogPick(item: string, add: "ctrl" | "shift" | null = null): Action {
  const selector = `[data-item="${css(item)}"]`;
  return {
    kind: "dialogPick",
    apply: (state) => dialogPickItem(state, item, add),
    async animate({ state, stage }) {
      const point = stage.dialogPoint(selector);
      if (add) stage.keys.hold([add === "ctrl" ? "Ctrl" : "Shift"]);
      try {
        await clickAt(stage, point, undefined, 650);
      } finally {
        if (add) stage.keys.hide();
      }
      dialogPickItem(state, item, add);
      stage.render(state);
    },
  };
}

/** Кнопка окна («OK», «Удалить», «Все имена»…). */
export function dialogButton(label: string): Action {
  const selector = `[data-button="${css(label)}"]`;
  return {
    kind: "dialogButton",
    apply: (state) => void pressDialogButton(state, label),
    async animate({ state, stage, clock }) {
      topDialog(state); // окно должно быть открыто — ошибка урока видна сразу
      await clickAt(stage, stage.dialogPoint(selector), stage.dialogs.target(selector), 700);
      const changed = pressDialogButton(state, label);
      stage.render(state);
      for (const cell of changed) {
        stage.flash(cell);
        await clock.wait(FLASH_STAGGER_MS);
      }
    },
  };
}
