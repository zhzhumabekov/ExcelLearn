import type { Lesson } from "../generated/lesson";
import type { TimelineStatus } from "../lesson/timeline";
import { type FunctionLocale, renderPlaceholders } from "../locale/format";
import { sanitizeHtml } from "./sanitize";

export const SPEEDS = [0.5, 1, 1.5, 2] as const;

export interface PanelHandlers {
  onPlayPause(): void;
  onRestart(): void;
  onSpeed(speed: number): void;
  onSeek(step: number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", className, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** Текст шага: плейсхолдеры {fn:…}/{f:…} на языке ученика, затем безопасный HTML. */
export function stepHtml(text: string, locale: FunctionLocale): DocumentFragment {
  return sanitizeHtml(renderPlaceholders(text, locale));
}

/** Панель урока: номер и прогресс, заголовок и пояснение шага, управление, план шагов. */
export class PanelView {
  readonly el: HTMLElement;
  private readonly counter = el("span");
  private readonly bar = el("i");
  private readonly title = el("h2", "xl-step-title");
  private readonly text = el("p", "xl-step-text");
  private readonly playButton: HTMLButtonElement;
  private readonly speedButtons: HTMLButtonElement[];
  private readonly items: HTMLLIElement[];

  constructor(
    private readonly lesson: Lesson,
    private readonly locale: FunctionLocale,
    handlers: PanelHandlers,
    speed: number,
  ) {
    this.el = el("aside", "xl-panel");

    const card = el("div", "xl-card");
    const meta = el("div", "xl-meta");
    meta.append(this.counter, el("span", "", lesson.source ?? ""));
    const progress = el("div", "xl-bar");
    progress.append(this.bar);

    this.playButton = button("xl-btn xl-primary", "", () => handlers.onPlayPause());
    const restart = button("xl-btn", "⟲ Сначала", () => handlers.onRestart());
    const speeds = el("div", "xl-speed");
    this.speedButtons = SPEEDS.map((s) => {
      const b = button("", `${String(s).replace(".", ",")}×`, () => handlers.onSpeed(s));
      b.dataset.speed = String(s);
      return b;
    });
    speeds.append(...this.speedButtons);
    const controls = el("div", "xl-controls");
    controls.append(this.playButton, restart, speeds);
    card.append(meta, progress, this.title, this.text, controls);

    const plan = el("div", "xl-card");
    const list = el("ol", "xl-steps");
    this.items = lesson.steps.map((step, i) => {
      const li = el("li");
      const go = button("", "", () => handlers.onSeek(i));
      go.append(el("span", "xl-n", String(i + 1)), stepHtml(step.title, locale));
      li.append(go);
      return li;
    });
    list.append(...this.items);
    plan.append(el("h3", "", "План урока"), list);

    this.el.append(card, plan);
    this.setSpeed(speed);
  }

  showStep(i: number, status: TimelineStatus): void {
    const step = this.lesson.steps[i];
    if (!step) return;
    const total = this.lesson.steps.length;
    const finished = status === "done";
    this.counter.textContent = `Шаг ${i + 1} из ${total}`;
    this.bar.style.width = `${((finished ? total : i + 1) / total) * 100}%`;
    this.title.replaceChildren(stepHtml(step.title, this.locale));
    this.text.replaceChildren(stepHtml(step.text, this.locale));
    this.items.forEach((li, k) => {
      li.classList.toggle("xl-done", k < i || finished);
      li.classList.toggle("xl-active", k === i && !finished);
    });
  }

  showStatus(status: TimelineStatus): void {
    this.playButton.textContent =
      status === "playing" ? "⏸ Пауза" : status === "paused" ? "▶ Продолжить" : status === "done" ? "↻ Ещё раз" : "▶ Смотреть";
  }

  setSpeed(speed: number): void {
    for (const b of this.speedButtons) b.classList.toggle("xl-on", Number(b.dataset.speed) === speed);
  }
}
