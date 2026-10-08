import "./styles/player.css";

import type { Lesson } from "./generated/lesson";
import { Timeline, type TimelineStatus } from "./lesson/timeline";
import type { FunctionLocale } from "./locale/format";
import { PanelView } from "./render/panel";
import { Stage } from "./render/stage";
import { SheetModel } from "./sheet/sheet-model";

export type { FunctionLocale, Lesson, TimelineStatus };

export interface PlayerSettings {
  speed: number;
  functionLocale: FunctionLocale;
  narrationOn: boolean;
  narrationVolume: number;
}

export interface MountOptions {
  lesson: Lesson;
  settings?: Partial<PlayerSettings>;
  /** С какого шага открыть урок (продолжение после перерыва). */
  startStep?: number;
  onStepChange?: (step: number) => void;
  onComplete?: () => void;
}

export interface PlayerHandle {
  /** Воспроизвести с текущего шага; Promise завершается в конце урока (или при перемотке). */
  play(): Promise<void>;
  pause(): void;
  seek(step: number): void;
  readonly step: number;
  readonly status: TimelineStatus;
  destroy(): void;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  speed: 1,
  functionLocale: "ru",
  narrationOn: true,
  narrationVolume: 80,
};

export function mount(el: HTMLElement, options: MountOptions): PlayerHandle {
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const { lesson } = options;

  const root = document.createElement("div");
  root.className = "xl-player";
  root.dataset.locale = settings.functionLocale;
  const layout = document.createElement("div");
  layout.className = "xl-layout";

  const stage = new Stage(new SheetModel(lesson.sheet), settings.functionLocale);
  stage.clock.setSpeed(settings.speed);

  // Стартовый экран поверх окна: первый запуск — по клику (браузеры разрешают звук только так)
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
    },
    settings.speed,
  );

  layout.append(stage.el, panel.el);
  root.append(layout);
  // Сначала на страницу, потом таймлайн: координаты рамок и курсора — по реальной раскладке
  el.replaceChildren(root);

  const timeline: Timeline = new Timeline(lesson, stage, {
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
    onComplete: () => options.onComplete?.(),
  });
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
    get step() {
      return timeline.step;
    },
    get status() {
      return timeline.status;
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
      stage.clock.cancel();
      root.remove();
    },
  };
  return handle;
}
