import { type Action, type ActionSpec, createAction } from "../actions";
import { Aborted } from "../anim/clock";
import type { Lesson } from "../generated/lesson";
import type { Stage } from "../render/stage";
import type { SheetSnapshot } from "../sheet/sheet-model";
import { createState, type LessonState } from "./state";

export type TimelineStatus = "ready" | "playing" | "paused" | "done";

export interface TimelineEvents {
  /** Начался шаг (при воспроизведении или после перемотки). */
  onStepChange?: (step: number) => void;
  onStatusChange?: (status: TimelineStatus) => void;
  onComplete?: () => void;
}

const BETWEEN_STEPS_MS = 700;

/**
 * Воспроизведение урока по шагам. Перемотка к шагу N: лист в исходное состояние, apply() всех
 * действий шагов 0…N−1 (мгновенно), затем анимация с шага N. Действия создаются один раз —
 * ошибки в уроке (неизвестное действие) видны сразу при загрузке.
 */
export class Timeline {
  state: LessonState;
  private readonly steps: Action[][];
  private readonly initial: SheetSnapshot;
  private stepIndex = 0;
  private currentStatus: TimelineStatus = "ready";
  private run = 0;

  constructor(
    readonly lesson: Lesson,
    private readonly stage: Stage,
    private readonly events: TimelineEvents = {},
  ) {
    this.steps = lesson.steps.map((step) => step.actions.map((spec) => createAction(spec as ActionSpec)));
    this.initial = stage.sheet.snapshot();
    this.state = createState(stage.sheet);
    stage.render(this.state);
  }

  get step(): number {
    return this.stepIndex;
  }

  get status(): TimelineStatus {
    return this.currentStatus;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  /**
   * Воспроизводить с текущего шага до конца. Promise завершается в конце урока или при перемотке;
   * после паузы play() просто снимает её.
   */
  async play(): Promise<void> {
    if (this.currentStatus === "playing") return;
    if (this.currentStatus === "paused") return this.resume();
    if (this.currentStatus === "done") this.seek(0);
    const run = ++this.run;
    this.setStatus("playing");
    try {
      for (let i = this.stepIndex; i < this.steps.length; i++) {
        this.enterStep(i);
        for (const action of this.steps[i] ?? []) {
          await action.animate({ state: this.state, stage: this.stage, clock: this.stage.clock });
          if (run !== this.run) return;
        }
        if (i < this.steps.length - 1) await this.stage.clock.wait(BETWEEN_STEPS_MS);
        if (run !== this.run) return;
      }
      if (run !== this.run) return;
      await this.stage.cursor.moveTo(this.stage.restPoint(), 900);
      this.setStatus("done");
      this.events.onComplete?.();
    } catch (e) {
      if (e instanceof Aborted && run !== this.run) return; // перемотка или перезапуск
      throw e;
    }
  }

  pause(): void {
    if (this.currentStatus !== "playing") return;
    this.stage.clock.pause();
    this.setStatus("paused");
  }

  resume(): Promise<void> {
    if (this.currentStatus === "paused") {
      this.stage.clock.resume();
      this.setStatus("playing");
    }
    return Promise.resolve();
  }

  /** Перейти к началу шага n. Если урок играл — продолжает играть с него. */
  seek(n: number): void {
    const target = Math.max(0, Math.min(n, this.steps.length - 1));
    const wasPlaying = this.currentStatus === "playing" || this.currentStatus === "paused";
    this.run++;
    const { clock, cursor, keys, overlays } = this.stage;
    clock.cancel();
    clock.resume();
    keys.hide();
    overlays.showFill(null);
    cursor.release();
    cursor.setShape("arrow");

    this.stage.sheet.restore(this.initial);
    this.state = createState(this.stage.sheet);
    for (const actions of this.steps.slice(0, target)) for (const action of actions) action.apply(this.state);
    this.stage.render(this.state);
    cursor.jump(this.stage.restPoint());

    this.enterStep(target);
    this.setStatus("ready");
    if (wasPlaying) void this.play();
  }

  private enterStep(i: number): void {
    this.stepIndex = i;
    this.events.onStepChange?.(i);
  }

  private setStatus(status: TimelineStatus): void {
    this.currentStatus = status;
    this.events.onStatusChange?.(status);
  }
}
