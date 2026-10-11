import { type Action, type ActionSpec, createAction } from "../actions";
import { Aborted } from "../anim/clock";
import type { Lesson } from "../generated/lesson";
import type { Stage } from "../render/stage";
import type { WorkbookSnapshot } from "../sheet/workbook";
import { createState, type LessonState } from "./state";

/** «waiting» — пошаговый просмотр: шаг показан, следующий начнётся по кнопке (play()). */
export type TimelineStatus = "ready" | "playing" | "paused" | "waiting" | "done";

/** step (по умолчанию на сайте) — остановка после каждого шага; auto — шаги подряд с паузой BETWEEN_STEPS_MS. */
export type PlayMode = "auto" | "step";

export interface TimelineEvents {
  /** Начался шаг (при воспроизведении или после перемотки). */
  onStepChange?: (step: number) => void;
  onStatusChange?: (status: TimelineStatus) => void;
  /**
   * Прогресс шага 0…1 для шкалы: 0 при входе, действия заполняют долю ACTIONS_SHARE (у последнего
   * шага — всё), остаток плавно заполняется паузой перед следующим шагом.
   */
  onStepProgress?: (step: number, progress: number) => void;
  /** Пауза перед следующим шагом: progress 0…1, null — пауза закончилась или прервана. */
  onWaitNext?: (progress: number | null, nextStep: number) => void;
  onComplete?: () => void;
}

/** Пауза между шагами — дочитать пояснение; идёт по часам урока (замирает на паузе, ускоряется). */
export const BETWEEN_STEPS_MS = 2500;

/** Какую часть шкалы шага заполняют действия, если за шагом следует пауза. */
export const ACTIONS_SHARE = 0.8;

/**
 * Воспроизведение урока по шагам. Перемотка к шагу N: лист в исходное состояние, apply() всех
 * действий шагов 0…N−1 (мгновенно), затем анимация с шага N. Действия создаются один раз —
 * ошибки в уроке (неизвестное действие) видны сразу при загрузке.
 */
export class Timeline {
  state: LessonState;
  private readonly steps: Action[][];
  private readonly initial: WorkbookSnapshot;
  private stepIndex = 0;
  private currentStatus: TimelineStatus = "ready";
  private run = 0;

  constructor(
    readonly lesson: Lesson,
    private readonly stage: Stage,
    private readonly events: TimelineEvents = {},
    private playMode: PlayMode = "auto",
  ) {
    this.steps = lesson.steps.map((step) => step.actions.map((spec) => createAction(spec as ActionSpec)));
    this.initial = stage.sheet.book.snapshot();
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

  get mode(): PlayMode {
    return this.playMode;
  }

  /** Сменить режим. Переход на «auto», пока урок ждёт кнопку, — сразу продолжает воспроизведение. */
  setMode(mode: PlayMode): void {
    this.playMode = mode;
    if (mode === "auto" && this.currentStatus === "waiting") void this.play();
  }

  /**
   * Воспроизводить с текущего шага до конца (в пошаговом режиме — до конца шага). Promise завершается
   * в конце урока, в конце шага (пошагово) или при перемотке; после паузы play() просто снимает её,
   * в ожидании кнопки — начинает следующий шаг.
   */
  async play(): Promise<void> {
    if (this.currentStatus === "playing") return;
    if (this.currentStatus === "paused") return this.resume();
    if (this.currentStatus === "done") this.seek(0);
    const from = this.currentStatus === "waiting" ? this.stepIndex + 1 : this.stepIndex;
    const run = ++this.run;
    this.setStatus("playing");
    try {
      for (let i = from; i < this.steps.length; i++) {
        this.enterStep(i);
        const actions = this.steps[i] ?? [];
        const last = i === this.steps.length - 1;
        const share = last || this.playMode === "step" ? 1 : ACTIONS_SHARE;
        for (const [k, action] of actions.entries()) {
          await action.animate({ state: this.state, stage: this.stage, clock: this.stage.clock });
          if (run !== this.run) return;
          this.events.onStepProgress?.(i, (share * (k + 1)) / actions.length);
        }
        if (!last && this.playMode === "step") {
          // Режим могли сменить посреди шага: шкала шага — до конца, дальше — по кнопке
          this.events.onStepProgress?.(i, 1);
          this.setStatus("waiting");
          return;
        }
        if (!last) {
          try {
            await this.stage.clock.tween(BETWEEN_STEPS_MS, (t) => {
              this.events.onWaitNext?.(t, i + 1);
              this.events.onStepProgress?.(i, share + (1 - share) * t);
            });
          } finally {
            this.events.onWaitNext?.(null, i + 1);
          }
        }
        if (run !== this.run) return;
        // Переключили на пошаговый во время паузы между шагами — следующий шаг тоже по кнопке
        if (!last && this.playMode === "step") {
          this.setStatus("waiting");
          return;
        }
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

  /** Остановить всё навсегда (плеер убирают со страницы): текущий play() завершается тихо. */
  stop(): void {
    this.run++;
    this.stage.clock.cancel();
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
    // В ожидании кнопки урок тоже «идёт»: после перемотки показываем выбранный шаг
    const wasPlaying = ["playing", "paused", "waiting"].includes(this.currentStatus);
    this.run++;
    const { clock, cursor, keys, overlays } = this.stage;
    clock.cancel();
    clock.resume();
    keys.hide();
    overlays.showFill(null);
    cursor.release();
    cursor.setShape("arrow");

    this.stage.sheet.book.restore(this.initial);
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
    this.events.onStepProgress?.(i, 0);
  }

  private setStatus(status: TimelineStatus): void {
    this.currentStatus = status;
    this.events.onStatusChange?.(status);
  }
}
