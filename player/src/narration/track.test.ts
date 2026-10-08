import { describe, expect, it } from "vitest";

import type { Lesson } from "../generated/lesson";
import { Timeline } from "../lesson/timeline";
import { Stage } from "../render/stage";
import { SheetModel } from "../sheet/sheet-model";
import { fakeClock } from "../test/fake-clock";
import { type AudioLike, NarrationTrack } from "./track";

class FakeAudio implements AudioLike {
  src = "";
  volume = 1;
  playbackRate = 1;
  preservesPitch = false;
  playing = false;
  played = 0;
  private listeners = new Map<string, Set<() => void>>();

  constructor(private readonly rejectPlay = false) {}

  play(): Promise<void> {
    this.played++;
    if (this.rejectPlay) return Promise.reject(new DOMException("NotAllowed", "NotAllowedError"));
    this.playing = true;
    return Promise.resolve();
  }
  pause(): void {
    this.playing = false;
  }
  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: "ended" | "error"): void {
    this.playing = false;
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

const MANIFEST = { "0": { ru: "/media/narration/a.wav", en: "/media/narration/b.wav" }, "2": { ru: "/media/narration/c.wav" } };

function track(options: Partial<{ enabled: boolean; volume: number; rejectPlay: boolean; locale: "ru" | "en" }> = {}) {
  const audios: FakeAudio[] = [];
  const t = new NarrationTrack(
    MANIFEST,
    options.locale ?? "ru",
    { enabled: options.enabled ?? true, volume: options.volume ?? 80 },
    () => {
      const audio = new FakeAudio(options.rejectPlay);
      audios.push(audio);
      return audio;
    },
  );
  return { t, audios };
}

function state(promise: Promise<void>) {
  const s = { done: false };
  void promise.then(() => (s.done = true));
  return s;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("NarrationTrack", () => {
  it("играет файл шага на языке ученика и завершается по окончании", async () => {
    const { t, audios } = track({ locale: "en", volume: 60 });

    const s = state(t.start(0));
    await tick();
    expect(audios[0]).toMatchObject({ src: "/media/narration/b.wav", volume: 0.6, preservesPitch: true, playing: true });
    expect(s.done).toBe(false);

    audios[0]?.emit("ended");
    await tick();
    expect(s.done).toBe(true);
  });

  it("без аудио, с выключенным звуком или на скорости больше 2× — сразу готово", async () => {
    const plain = track();
    expect(plain.t.hasAudio(1)).toBe(false);
    expect(state(plain.t.start(1)).done).toBe(false);
    await tick();
    expect(plain.audios).toHaveLength(0);

    const muted = track({ enabled: false });
    const ready = state(muted.t.start(0));
    await tick();
    expect([ready.done, muted.audios.length]).toEqual([true, 0]);

    const fast = track();
    fast.t.setRate(4);
    const skipped = state(fast.t.start(0));
    await tick();
    expect([skipped.done, fast.audios.length]).toEqual([true, 0]);
  });

  it("пауза и продолжение управляют аудио, скорость меняет playbackRate", async () => {
    const { t, audios } = track();
    void t.start(0);
    await tick();

    t.pause();
    expect(audios[0]?.playing).toBe(false);
    t.resume();
    expect(audios[0]?.playing).toBe(true);
    t.setRate(1.5);
    expect(audios[0]?.playbackRate).toBe(1.5);
    t.setVolume(30);
    expect(audios[0]?.volume).toBe(0.3);
  });

  it("stop (перемотка) и выключение звука сразу завершают ожидание", async () => {
    const { t } = track();
    const first = state(t.start(0));
    t.stop();
    await tick();
    expect(first.done).toBe(true);

    const second = state(t.start(0));
    t.setEnabled(false);
    await tick();
    expect(second.done).toBe(true);
  });

  it("если браузер запретил звук или файл не загрузился — урок идёт без голоса", async () => {
    const blocked = track({ rejectPlay: true });
    const s = state(blocked.t.start(0));
    await tick();
    expect(s.done).toBe(true);

    const broken = track();
    const e = state(broken.t.start(0));
    await tick();
    broken.audios[0]?.emit("error");
    await tick();
    expect(e.done).toBe(true);
  });
});

describe("Timeline + озвучка", () => {
  const lesson: Lesson = {
    id: "demo",
    chapter: "ch00",
    order: 1,
    title: "Демо",
    sheet: {},
    steps: [
      { title: "Первый", text: "t", say: "Раз", actions: [{ wait: 100 }] },
      { title: "Второй", text: "t", actions: [{ wait: 100 }] },
    ],
  };

  it("следующий шаг начинается, только когда доиграл голос", async () => {
    const { clock, advance } = fakeClock();
    const stage = new Stage(new SheetModel(lesson.sheet), "ru", clock);
    const { t, audios } = track();
    const timeline = new Timeline(lesson, stage, {}, t);

    void timeline.play();
    await advance(10_000); // анимация шага 1 давно кончилась, а голос ещё звучит
    expect(timeline.step).toBe(0);

    audios[0]?.emit("ended");
    await tick();
    await advance(4000);
    expect(timeline.step).toBe(1);
  });

  it("пауза урока ставит на паузу и голос", async () => {
    const { clock, advance } = fakeClock();
    const stage = new Stage(new SheetModel(lesson.sheet), "ru", clock);
    const { t, audios } = track();
    const timeline = new Timeline(lesson, stage, {}, t);
    void timeline.play();
    await advance(50);

    timeline.pause();
    expect(audios[0]?.playing).toBe(false);
    void timeline.play();
    expect(audios[0]?.playing).toBe(true);
  });
});
