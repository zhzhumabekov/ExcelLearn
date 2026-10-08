import { describe, expect, it } from "vitest";

import { fakeClock } from "../test/fake-clock";
import { Aborted, Clock, easeInOutCubic } from "./clock";

function track(promise: Promise<void>) {
  const state = { done: false, error: null as unknown };
  promise.then(
    () => (state.done = true),
    (e: unknown) => (state.error = e),
  );
  return state;
}

describe("Clock", () => {
  it("wait завершается через заданное время", async () => {
    const { clock, advance } = fakeClock();
    const state = track(clock.wait(100));

    await advance(80);
    expect(state.done).toBe(false);
    await advance(40);
    expect(state.done).toBe(true);
  });

  it("tween передаёт прогресс от 0 до 1", async () => {
    const { clock, advance } = fakeClock();
    const progress: number[] = [];

    track(clock.tween(64, (t) => progress.push(t)));
    await advance(100);

    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("пауза останавливает время, resume продолжает", async () => {
    const { clock, advance } = fakeClock();
    const state = track(clock.wait(100));

    await advance(48);
    clock.pause();
    await advance(500);
    expect(state.done).toBe(false);

    clock.resume();
    await advance(70);
    expect(state.done).toBe(true);
  });

  it("скорость 2× укорачивает ожидание вдвое", async () => {
    const { clock, advance } = fakeClock();
    clock.setSpeed(2);
    const state = track(clock.wait(200));

    await advance(112);

    expect(state.done).toBe(true);
  });

  it("cancel прерывает ожидающие анимации исключением Aborted, но не новые", async () => {
    const { clock, advance } = fakeClock();
    const first = track(clock.wait(100));

    clock.cancel();
    const second = track(clock.wait(50));
    await advance(100);

    expect(first.error).toBeInstanceOf(Aborted);
    expect(second.done).toBe(true);
  });

  it("отклоняет неположительную скорость", () => {
    expect(() => new Clock().setSpeed(0)).toThrow("больше 0");
  });

  it("ease: 0 → 0, 0.5 → 0.5, 1 → 1", () => {
    expect([0, 0.5, 1].map(easeInOutCubic)).toEqual([0, 0.5, 1]);
  });
});
