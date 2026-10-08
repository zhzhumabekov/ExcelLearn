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

/** Дождаться конца анимации, прокручивая время порциями. */
export async function finish<T>(promise: Promise<T>, advance: (ms: number) => Promise<void>): Promise<T> {
  let done = false;
  let result: { value: T } | { error: unknown } | undefined;
  promise.then(
    (value) => ((done = true), (result = { value })),
    (error: unknown) => ((done = true), (result = { error })),
  );
  for (let i = 0; i < 2000 && !done; i++) await advance(100);
  if (!result) throw new Error("Анимация не закончилась за 200 секунд урочного времени");
  if ("error" in result) throw result.error;
  return result.value;
}
