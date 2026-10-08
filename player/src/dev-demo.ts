import { type ActionSpec, createAction, UnsupportedAction } from "./actions";
import type { Lesson } from "./generated/lesson";
import type { LessonState } from "./lesson/state";
import type { Stage } from "./render/stage";

/**
 * Песочница /dev/player/?demo=1: проигрывает действия урока подряд, пока не встретит действие,
 * которое плеер ещё не умеет. Заменится настоящим таймлайном с панелью шагов в T14.
 */
export async function runDemo(stage: Stage, state: LessonState, lesson: Lesson): Promise<void> {
  stage.cursor.jump(stage.restPoint());
  for (const [i, step] of lesson.steps.entries()) {
    console.info(`Шаг ${i + 1}: ${step.title}`);
    for (const spec of step.actions as ActionSpec[]) {
      try {
        await createAction(spec).animate({ state, stage, clock: stage.clock });
      } catch (e) {
        if (e instanceof UnsupportedAction) {
          console.warn(`Демо остановлено на шаге ${i + 1}: ${e.message}`);
          return;
        }
        throw e;
      }
    }
  }
}
