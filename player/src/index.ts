import "./styles/player.css";

export type FunctionLocale = "ru" | "en";

export interface PlayerSettings {
  speed: number;
  functionLocale: FunctionLocale;
  narrationOn: boolean;
  narrationVolume: number;
}

export interface MountOptions {
  // Тип урока появится в T5 — генерируется из Pydantic-схемы.
  lesson: unknown;
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
  root.textContent = "Плеер ExcelLearn: каркас готов, движок появится в задачах T8–T14.";
  el.replaceChildren(root);

  return {
    destroy() {
      root.remove();
    },
  };
}
