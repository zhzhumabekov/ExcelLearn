import "./styles/player.css";

import type { Lesson } from "./generated/lesson";
import type { FunctionLocale } from "./locale/format";
import { runDemo } from "./dev-demo";
import { createState } from "./lesson/state";
import { Stage } from "./render/stage";
import { SheetModel } from "./sheet/sheet-model";

export type { FunctionLocale, Lesson };

export interface PlayerSettings {
  speed: number;
  functionLocale: FunctionLocale;
  narrationOn: boolean;
  narrationVolume: number;
}

export interface MountOptions {
  lesson: Lesson;
  settings?: Partial<PlayerSettings>;
  startStep?: number;
  onStepChange?: (step: number) => void;
  onComplete?: () => void;
}

export interface PlayerHandle {
  destroy(): void;
  /** Только для песочницы /dev/player/?demo=1 — проиграть действия урока подряд. */
  demo(): Promise<void>;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  speed: 1,
  functionLocale: "ru",
  narrationOn: true,
  narrationVolume: 80,
};

export function mount(el: HTMLElement, options: MountOptions): PlayerHandle {
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };

  const root = document.createElement("div");
  root.className = "xl-player";
  root.dataset.locale = settings.functionLocale;

  const sheet = new SheetModel(options.lesson.sheet);
  const stage = new Stage(sheet, settings.functionLocale);
  stage.clock.setSpeed(settings.speed);
  root.append(stage.el);
  // Сначала на страницу, потом рамки и курсор: координаты считаются по реальной раскладке
  el.replaceChildren(root);
  const state = createState(sheet);
  stage.render(state);
  stage.cursor.jump(stage.restPoint());

  return {
    destroy() {
      stage.clock.cancel();
      root.remove();
    },
    demo: () => runDemo(stage, state, options.lesson),
  };
}
