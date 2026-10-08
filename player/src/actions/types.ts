import type { Clock } from "../anim/clock";
import type { Lesson } from "../generated/lesson";
import type { LessonState } from "../lesson/state";
import type { Stage } from "../render/stage";

/** Действие урока в том виде, как оно записано в YAML: `{ click: "E4" }`, `{ keys: ["Enter"] }`… */
export type ActionSpec = Lesson["steps"][number]["actions"][number];

export interface ActionContext {
  state: LessonState;
  stage: Stage;
  clock: Clock;
}

/**
 * Действие урока. Правило детерминизма: animate() меняет состояние только теми же операциями,
 * что и apply(), и приходит к тому же состоянию — поэтому перемотка (apply подряд) не расходится
 * с просмотром. Проверяется тестом для каждого действия.
 */
export interface Action {
  readonly kind: string;
  apply(state: LessonState): void;
  animate(ctx: ActionContext): Promise<void>;
}

export class UnsupportedAction extends Error {
  constructor(spec: ActionSpec) {
    super(`Действие пока не поддерживается плеером: ${JSON.stringify(spec)}`);
    this.name = "UnsupportedAction";
  }
}
