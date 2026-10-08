import "./styles/player.css";

import type { Lesson } from "./generated/lesson";
import type { FunctionLocale } from "./locale/format";
import { WindowView } from "./render/window";
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
  const view = new WindowView(sheet, settings.functionLocale);
  view.showActive("A1");
  root.append(view.el);
  el.replaceChildren(root);

  return {
    destroy() {
      root.remove();
    },
  };
}
