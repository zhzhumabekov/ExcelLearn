import { Clock, type Scheduler } from "../anim/clock";

/** Часы с ручным временем для тестов анимации: advance(ms) прокручивает кадры. */
export function fakeClock() {
  let time = 0;
  let queue: ((now: number) => void)[] = [];
  const scheduler: Scheduler = {
    now: () => time,
    frame: (cb) => void queue.push(cb),
  };
  const advance = async (ms: number, step = 16) => {
    for (let passed = 0; passed < ms; passed += step) {
      time += step;
      const callbacks = queue;
      queue = [];
      callbacks.forEach((cb) => cb(time));
      await Promise.resolve();
    }
  };
  return { clock: new Clock(scheduler), advance };
}
