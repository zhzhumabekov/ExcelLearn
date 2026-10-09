// Действия главы 2: поле «Имя» и его список, ярлыки листов, выделение с Ctrl, щелчок по заголовкам
// строк и столбцов, «Выделить всё», автозавершение формулы.

import { acceptSuggestion, nameBoxEnter, pickFromNameList } from "../lesson/dialogs";
import { addArea, commitEditor, hideColumns, type LessonState, selectRange, switchSheet } from "../lesson/state";
import { cellName, colToLetters, lettersToCol, parseRange, rangeName } from "../sheet/address";
import { along, dragMs } from "./mouse";
import { clickAt, ensureTab } from "./ribbon";
import type { Action } from "./types";

const CHAR_MS = 140;

/** Щелчок в поле «Имя», набор текста, Enter: имя выделенному диапазону (или переход к имени/адресу). */
export function nameBox(text: string): Action {
  return {
    kind: "nameBox",
    apply: (state) => nameBoxEnter(state, text),
    async animate({ state, stage, clock }) {
      const box = stage.window.nameBox;
      await clickAt(stage, stage.nameBoxPoint(), undefined, 800);
      box.classList.add("xl-editing");
      try {
        for (let i = 1; i <= text.length; i++) {
          box.textContent = text.slice(0, i);
          await clock.wait(CHAR_MS);
        }
        await stage.keys.show(["Enter"]);
      } finally {
        box.classList.remove("xl-editing");
      }
      nameBoxEnter(state, text);
      stage.render(state);
      await clock.wait(400);
    },
  };
}

/** Стрелка поля «Имя» → список имён → щелчок по имени: Excel выделяет его диапазон. */
export function nameList(name: string): Action {
  return {
    kind: "nameList",
    apply: (state) => pickFromNameList(state, name),
    async animate({ state, stage, clock }) {
      await clickAt(stage, stage.nameListArrowPoint(), undefined, 800);
      state.nameListOpen = true;
      stage.render(state);
      await clock.wait(500);
      await clickAt(stage, stage.nameListItemPoint(name), stage.window.nameListItem(name), 600);
      pickFromNameList(state, name);
      stage.render(state);
      await clock.wait(600);
    },
  };
}

/** Щелчок по ярлыку листа. */
export function sheetTab(name: string): Action {
  return {
    kind: "sheetTab",
    apply: (state) => switchSheet(state, name),
    async animate({ state, stage }) {
      await clickAt(stage, stage.sheetTabPoint(name), undefined, 800);
      switchSheet(state, name);
      stage.render(state);
    },
  };
}

/** С нажатым Ctrl протянуть ещё один диапазон: выделение из нескольких частей. */
export function addSelect(range: string): Action {
  const pos = parseRange(range);
  const from = cellName(pos.start);
  return {
    kind: "addSelect",
    apply: (state) => addArea(state, range),
    async animate({ state, stage }) {
      const { cursor } = stage;
      cursor.setShape("arrow");
      await cursor.moveTo(stage.cellPoint(from), 700);
      stage.keys.hold(["Ctrl"]);
      try {
        await cursor.press();
        addArea(state, from);
        stage.render(state);
        await cursor.moveTo(stage.cellPoint(cellName(pos.end)), dragMs(pos), (t) => {
          state.selection = `${from}:${along(pos, t)}`;
          stage.render(state);
        });
        cursor.release();
      } finally {
        stage.keys.hide();
      }
      state.selection = rangeName(parseRange(range));
      stage.render(state);
    },
  };
}

function selectByHeader(kind: string, range: string, label: string | null): Action {
  const apply = (state: LessonState) => {
    if (state.editor) commitEditor(state);
    selectRange(state, range);
  };
  return {
    kind,
    apply,
    async animate({ state, stage }) {
      const point = label === null ? stage.cornerPoint() : stage.headerPoint(label);
      await clickAt(stage, point, undefined, 800);
      apply(state);
      stage.render(state);
    },
  };
}

/** Щелчок по номеру строки — выделена вся строка (12:12). */
export const selectRow = (row: number): Action => selectByHeader("selectRow", `${row}:${row}`, String(row));

/** Щелчок по букве столбца — выделен весь столбец (A:A). */
export const selectColumn = (col: string): Action => selectByHeader("selectColumn", `${col}:${col}`, col);

/** Кнопка «Выделить всё» на пересечении заголовков. */
export const selectAll = (): Action => selectByHeader("selectAll", "1:1048576", null);

/** Двойной щелчок по строке списка автозавершения: имя (функции или диапазона) дописывается в формулу. */
export function autocomplete(label: string): Action {
  return {
    kind: "autocomplete",
    apply: (state) => acceptSuggestion(state, label, "ru"),
    async animate({ state, stage, clock }) {
      await clickAt(stage, stage.suggestionPoint(label), stage.editor.suggestion(label), 700);
      await stage.cursor.click();
      acceptSuggestion(state, label, "ru");
      stage.render(state);
      await clock.wait(300);
    },
  };
}

/**
 * Скрыть столбцы: протянуть по их заголовкам, затем Главная → Формат ▾ → Скрыть или отобразить ▸ →
 * Скрыть столбцы.
 */
export function hideColumnsAction(range: string): Action {
  const [first = "A", last = first] = range.split(":");
  const columns = `${first}:${last}`;
  const apply = (state: LessonState) => {
    if (state.editor) commitEditor(state);
    selectRange(state, columns);
    hideColumns(state, columns);
    state.ribbonTab = "home";
    state.menu = null;
  };
  return {
    kind: "hideColumns",
    apply,
    async animate(ctx) {
      const { state, stage, clock } = ctx;
      if (state.editor) commitEditor(state);
      const { cursor } = stage;
      cursor.setShape("arrow");
      await cursor.moveTo(stage.headerPoint(first), 700);
      await cursor.press();
      selectRange(state, `${first}:${first}`);
      stage.render(state);
      const from = lettersToCol(first);
      const steps = lettersToCol(last) - from;
      await cursor.moveTo(stage.headerPoint(last), 260 * steps + 500, (t) => {
        selectRange(state, `${first}:${colToLetters(from + Math.round(t * steps))}`);
        stage.render(state);
      });
      cursor.release();
      selectRange(state, columns);
      await ensureTab(ctx, "home");
      await clickAt(stage, stage.ribbonPoint("format"), stage.window.ribbonButton("format"));
      state.menu = "format";
      stage.render(state);
      await clock.wait(300);
      await clickAt(stage, stage.menuPoint("hideUnhide"), stage.window.menuItem("hideUnhide"), 500);
      state.menu = "format-hide";
      stage.render(state);
      await clock.wait(300);
      await clickAt(stage, stage.menuPoint("hideColumns"), stage.window.menuItem("hideColumns"), 500);
      apply(state);
      stage.render(state);
    },
  };
}
