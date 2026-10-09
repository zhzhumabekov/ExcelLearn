import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it, vi } from "vitest";

import { type ActionSpec, createAction } from "../actions";
import type { Lesson } from "../generated/lesson";
import { Stage } from "../render/stage";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock, finish } from "../test/fake-clock";
import { createState, type LessonState } from "./state";
import { Timeline } from "./timeline";

const LESSONS_DIR = join(__dirname, "../../../content/lessons");
const lessons = readdirSync(LESSONS_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => parse(readFileSync(join(LESSONS_DIR, f), "utf8")) as Lesson);
const sumLesson = lessons.find((l) => l.id === "sum-and-autofill");
if (!sumLesson) throw new Error("нет урока sum-and-autofill");

function setup(lesson: Lesson, events = {}) {
  const { clock, advance } = fakeClock();
  const stage = new Stage(new SheetModel(lesson.sheet), "ru", clock);
  return { timeline: new Timeline(lesson, stage, events), advance };
}

/** Эталон: состояние после мгновенного применения шагов 0…n−1. */
function appliedUpTo(lesson: Lesson, n: number): LessonState {
  const state = createState(new SheetModel(lesson.sheet));
  for (const step of lesson.steps.slice(0, n)) for (const spec of step.actions) createAction(spec as ActionSpec).apply(state);
  return state;
}

const comparable = (state: LessonState) => ({
  cells: [...state.sheet.snapshot()],
  active: state.active,
  selection: state.selection,
  editor: state.editor,
  clipboard: state.clipboard,
});

describe("перемотка", () => {
  it.each(lessons.flatMap((lesson) => lesson.steps.map((_, n) => [lesson.id, n, lesson] as const)))(
    "%s: seek(%i) ≡ apply шагов до него, быстрее 200 мс",
    (_id, n, lesson) => {
      const { timeline } = setup(lesson);
      timeline.seek(lesson.steps.length - 1); // перемотка вперёд, затем назад — состояние не «протекает»

      const started = performance.now();
      timeline.seek(n);
      const elapsed = performance.now() - started;

      expect(timeline.step).toBe(n);
      expect(comparable(timeline.state)).toEqual(comparable(appliedUpTo(lesson, n)));
      expect(elapsed).toBeLessThan(200);
    },
  );

  it("номер шага ограничивается границами урока", () => {
    const { timeline } = setup(sumLesson);

    timeline.seek(999);
    expect(timeline.step).toBe(sumLesson.steps.length - 1);
    timeline.seek(-5);
    expect(timeline.step).toBe(0);
  });
});

describe("воспроизведение", () => {
  it("проходит все шаги до конца: события шагов, onComplete, итоговое состояние", async () => {
    const onStepChange = vi.fn();
    const onComplete = vi.fn();
    const { timeline, advance } = setup(sumLesson, { onStepChange, onComplete });

    await finish(timeline.play(), advance);

    expect(timeline.status).toBe("done");
    expect(onComplete).toHaveBeenCalledOnce();
    const steps = onStepChange.mock.calls.map(([s]) => s as number);
    expect(steps.slice(-sumLesson.steps.length)).toEqual(sumLesson.steps.map((_, i) => i));
    expect(comparable(timeline.state)).toEqual(comparable(appliedUpTo(sumLesson, sumLesson.steps.length)));
  });

  it("пауза останавливает урок, play продолжает", async () => {
    const { timeline, advance } = setup(sumLesson);
    void timeline.play();
    await advance(2000);

    timeline.pause();
    const step = timeline.step;
    await advance(60_000);
    expect(timeline.status).toBe("paused");
    expect(timeline.step).toBe(step);

    void timeline.play();
    expect(timeline.status).toBe("playing");
  });

  it("stop() во время воспроизведения завершает play() тихо (плеер убрали со страницы)", async () => {
    const { timeline, advance } = setup(sumLesson);
    const run = timeline.play();
    await advance(2000);

    timeline.stop();

    await finish(run, advance); // без Aborted наружу
  });

  it("перемотка во время воспроизведения продолжает играть с нового шага", async () => {
    const onComplete = vi.fn();
    const { timeline, advance } = setup(sumLesson, { onComplete });
    const firstRun = timeline.play();
    await advance(3000);

    timeline.seek(sumLesson.steps.length - 1);
    expect(timeline.status).toBe("playing");
    await finish(firstRun, advance); // прежний запуск завершается тихо, без ошибки
    for (let i = 0; i < 300 && timeline.status !== "done"; i++) await advance(100);

    expect(timeline.status).toBe("done");
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("между шагами — пауза с прогрессом 0…1, затем null", async () => {
    const waits: (number | null)[] = [];
    const { timeline, advance } = setup(sumLesson, { onWaitNext: (p: number | null, next: number) => next === 1 && waits.push(p) });

    await finish(timeline.play(), advance);

    expect(waits[0]).toBe(0);
    expect(waits.at(-2)).toBe(1);
    expect(waits.at(-1)).toBeNull();
  });

  it("после конца play начинает урок заново", async () => {
    const { timeline, advance } = setup(sumLesson);
    await finish(timeline.play(), advance);

    void timeline.play();

    expect(timeline.status).toBe("playing");
    expect(timeline.step).toBe(0);
  });
});
