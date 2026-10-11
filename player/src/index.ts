import "./styles/player.css";

import type { Lesson } from "./generated/lesson";
import { type PlayMode, Timeline, type TimelineStatus } from "./lesson/timeline";
import type { FunctionLocale } from "./locale/format";
import { PanelView } from "./render/panel";
import { Stage } from "./render/stage";
import { createBook } from "./lesson/book";

export type { FunctionLocale, Lesson, PlayMode, TimelineStatus };

export interface PlayerSettings {
  speed: number;
  functionLocale: FunctionLocale;
  /** auto — шаги подряд; step — пауза после каждого шага, дальше по кнопке. */
  playMode: PlayMode;
}

export interface MountOptions {
  lesson: Lesson;
  settings?: Partial<PlayerSettings>;
  /** С какого шага открыть урок (продолжение после перерыва). */
  startStep?: number;
  onStepChange?: (step: number) => void;
  onComplete?: () => void;
  /** Ученик выбрал режим просмотра на панели — сайт сохраняет его в настройках. */
  onModeChange?: (mode: PlayMode) => void;
}

export interface PlayerHandle {
  /** Воспроизвести с текущего шага; Promise завершается в конце урока (или при перемотке). */
  play(): Promise<void>;
  pause(): void;
  seek(step: number): void;
  setMode(mode: PlayMode): void;
  readonly mode: PlayMode;
  readonly step: number;
  readonly status: TimelineStatus;
  destroy(): void;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  speed: 1,
  functionLocale: "ru",
  playMode: "auto",
};

export function mount(el: HTMLElement, options: MountOptions): PlayerHandle {
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const { lesson } = options;

  const root = document.createElement("div");
  root.className = "xl-player";
  root.dataset.locale = settings.functionLocale;
  const layout = document.createElement("div");
  layout.className = "xl-layout";

  const stage = new Stage(createBook(lesson), settings.functionLocale);
  stage.clock.setSpeed(settings.speed);

  // Стартовый экран поверх окна: урок начинается по клику
  const start = document.createElement("div");
  start.className = "xl-start";
  const startTitle = document.createElement("h2");
  startTitle.textContent = lesson.title;
  const go = document.createElement("button");
  go.type = "button";
  go.className = "xl-big";
  start.append(startTitle, go);
  stage.el.append(start);

  // Обработчики панели и таймлайна вызываются только после создания обоих — ссылки вперёд безопасны
  const panel = new PanelView(
    lesson,
    settings.functionLocale,
    {
      onPlayPause: () => (timeline.status === "playing" ? timeline.pause() : void handle.play()),
      onRestart: () => {
        timeline.seek(0);
        void handle.play();
      },
      onSpeed: (speed) => {
        stage.clock.setSpeed(speed);
        panel.setSpeed(speed);
      },
      onSeek: (step) => timeline.seek(step),
      onMode: (mode) => {
        setMode(mode);
        options.onModeChange?.(mode);
      },
      onNext: () => void handle.play(),
    },
    settings.speed,
    settings.playMode,
  );

  layout.append(stage.el, panel.el);
  root.append(layout);
  // Сначала на страницу, потом таймлайн: координаты рамок и курсора — по реальной раскладке
  el.replaceChildren(root);

  const timeline: Timeline = new Timeline(
    lesson,
    stage,
    {
      onStepChange: (step) => {
        panel.showStep(step, timeline.status);
        options.onStepChange?.(step);
      },
      onStatusChange: (status) => {
        panel.showStatus(status);
        panel.showStep(timeline.step, status);
        // Стартовый экран — только до первого запуска: в конце урока он закрыл бы итоговую таблицу
        if (status === "playing") start.hidden = true;
      },
      onStepProgress: (step, progress) => panel.showStepProgress(step, progress),
      onWaitNext: (progress, nextStep) => panel.showWaitNext(progress, nextStep),
      onComplete: () => options.onComplete?.(),
    },
    settings.playMode,
  );

  function setMode(mode: PlayMode): void {
    panel.setMode(mode);
    timeline.setMode(mode);
  }
  const firstStep = options.startStep ?? 0;
  timeline.seek(firstStep);
  go.textContent = firstStep > 0 ? `▶ Продолжить с шага ${firstStep + 1}` : "▶ Начать урок";
  go.addEventListener("click", () => void handle.play());

  const onKey = (e: KeyboardEvent) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (e.code !== "Space" || target?.closest("input, textarea, select, [contenteditable]")) return;
    if (target && target !== document.body && !root.contains(target)) return;
    e.preventDefault();
    if (timeline.status === "playing") timeline.pause();
    else void handle.play();
  };
  document.addEventListener("keydown", onKey);

  const handle: PlayerHandle = {
    play: () => timeline.play(),
    pause: () => timeline.pause(),
    seek: (step) => timeline.seek(step),
    setMode,
    get mode() {
      return timeline.mode;
    },
    get step() {
      return timeline.step;
    },
    get status() {
      return timeline.status;
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
      timeline.stop();
      root.remove();
    },
  };
  return handle;
}
