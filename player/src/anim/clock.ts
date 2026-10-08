/** Анимация прервана (перемотка, перезапуск, destroy) — ожидающие шаги должны остановиться. */
export class Aborted extends Error {
  constructor() {
    super("Анимация прервана");
    this.name = "Aborted";
  }
}

export interface Scheduler {
  now(): number;
  frame(callback: (now: number) => void): void;
}

const browserScheduler: Scheduler = {
  now: () => performance.now(),
  frame: (callback) => requestAnimationFrame(callback),
};

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Время анимации урока. Все задержки и движения идут через tween/wait, поэтому пауза и скорость
 * действуют на всё сразу, а cancel() прерывает всё, что ждёт, исключением Aborted.
 */
export class Clock {
  speed = 1;
  private paused = false;
  private generation = 0;

  constructor(private readonly scheduler: Scheduler = browserScheduler) {}

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setSpeed(speed: number): void {
    if (!(speed > 0)) throw new Error(`Скорость должна быть больше 0: ${speed}`);
    this.speed = speed;
  }

  /** Прерывает все текущие tween/wait. Новые после вызова работают как обычно. */
  cancel(): void {
    this.generation++;
  }

  /** Анимация длиной ms (в «урочном» времени): fn(t) вызывается каждый кадр, t от 0 до 1. */
  tween(ms: number, fn?: (t: number) => void): Promise<void> {
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      let elapsed = 0;
      let last = this.scheduler.now();
      const tick = (now: number) => {
        if (generation !== this.generation) return reject(new Aborted());
        if (!this.paused) elapsed += (now - last) * this.speed;
        last = now;
        const t = ms <= 0 ? 1 : Math.min(1, elapsed / ms);
        fn?.(t);
        if (t >= 1) resolve();
        else this.scheduler.frame(tick);
      };
      fn?.(0); // начальное положение — сразу, не дожидаясь первого кадра
      this.scheduler.frame(tick);
    });
  }

  wait(ms: number): Promise<void> {
    return this.tween(ms);
  }
}
