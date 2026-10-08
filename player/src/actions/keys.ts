import { commitEditor } from "../lesson/state";
import type { Key } from "./key-types";
import { type Action, type ActionSpec, UnsupportedAction } from "./types";

type KeyHandler = Pick<Action, "apply"> & { after?: Action["animate"] };

/** Сочетания клавиш, которые понимает плеер. Ключ — клавиши через «+», как в YAML. */
const HANDLERS: Record<string, KeyHandler> = {
  Enter: {
    apply: (state) => commitEditor(state),
  },
};

export function keys(combo: readonly Key[], spec: ActionSpec): Action {
  const handler = HANDLERS[combo.join("+")];
  if (!handler) throw new UnsupportedAction(spec);
  return {
    kind: "keys",
    apply: handler.apply,
    async animate(ctx) {
      const { state, stage } = ctx;
      const editing = state.editor?.cell;
      await stage.keys.show(combo);
      handler.apply(state);
      stage.render(state);
      if (editing) stage.flash(editing);
      await handler.after?.(ctx);
    },
  };
}
