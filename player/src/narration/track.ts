import type { FunctionLocale } from "../locale/format";

/** Аудио шагов урока: номер шага → файл для каждого языка функций (из манифеста narration_build). */
export type NarrationManifest = Record<string, Partial<Record<FunctionLocale, string>>>;

/** Минимум от HTMLAudioElement, который нужен дорожке — подменяется в тестах. */
export interface AudioLike {
  src: string;
  volume: number;
  playbackRate: number;
  preservesPitch: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended" | "error", listener: () => void): void;
  removeEventListener(type: "ended" | "error", listener: () => void): void;
}

/** Выше 2× речь неразборчива: на большой скорости шаги идут без озвучки (и без ожидания её). */
export const MAX_NARRATION_SPEED = 2;

/**
 * Озвучка урока по шагам. start(step) запускает аудио шага и возвращает Promise, который
 * завершается, когда аудио доиграло, — таймлайн ждёт и анимацию, и голос. stop() прерывает
 * (перемотка), pause()/resume() — вместе с паузой урока.
 */
export class NarrationTrack {
  private audio: AudioLike | null = null;
  private finish: (() => void) | null = null;
  private enabled: boolean;
  private volume: number;
  private rate = 1;

  constructor(
    private readonly manifest: NarrationManifest,
    private readonly locale: FunctionLocale,
    options: { enabled: boolean; volume: number },
    private readonly createAudio: () => AudioLike = () => new Audio(),
  ) {
    this.enabled = options.enabled;
    this.volume = options.volume;
  }

  hasAudio(step: number): boolean {
    return Boolean(this.manifest[String(step)]?.[this.locale]);
  }

  /** Начать аудио шага. Без аудио, с выключенным звуком или на скорости > 2× — сразу готово. */
  start(step: number): Promise<void> {
    this.stop();
    const url = this.manifest[String(step)]?.[this.locale];
    if (!url || !this.enabled || this.rate > MAX_NARRATION_SPEED) return Promise.resolve();

    const audio = this.createAudio();
    audio.src = url;
    audio.volume = this.volume / 100;
    audio.playbackRate = this.rate;
    audio.preservesPitch = true;
    this.audio = audio;

    return new Promise<void>((resolve) => {
      const done = () => {
        audio.removeEventListener("ended", done);
        audio.removeEventListener("error", done);
        if (this.audio === audio) this.audio = null;
        this.finish = null;
        resolve();
      };
      this.finish = done;
      audio.addEventListener("ended", done);
      audio.addEventListener("error", done); // файл не загрузился — урок идёт без голоса
      audio.play().catch(() => {
        // Браузер запретил звук (не было клика) — продолжаем без озвучки
        done();
      });
    });
  }

  pause(): void {
    this.audio?.pause();
  }

  resume(): void {
    void this.audio?.play().catch(() => this.finish?.());
  }

  /** Прервать текущее аудио: ожидающий start() завершается сразу. */
  stop(): void {
    this.audio?.pause();
    this.finish?.();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (rate > MAX_NARRATION_SPEED) this.stop();
    else if (this.audio) this.audio.playbackRate = rate;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.audio) this.audio.volume = volume / 100;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}
