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
  /** Есть только у уроков с озвучкой. */
  onToggleSound?(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className: string, text: string, onClick: () => void, title = ""): HTMLButtonElement {
  const b = el("button", className, text);
  b.type = "button";
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

/** Текст шага: плейсхолдеры {fn:…}/{f:…} на языке ученика, затем безопасный HTML. */
export function stepHtml(text: string, locale: FunctionLocale): DocumentFragment {
  return sanitizeHtml(renderPlaceholders(text, locale));
}

const plainText = (fragment: DocumentFragment) => fragment.textContent ?? "";

/**
 * Всё, что под окном Excel, — как у видеоплеера: субтитры шага (сразу под таблицей, чтобы читать,
 * не отводя глаз от анимации), панель управления со шкалой шагов и сворачиваемый план урока.
 */
export class PanelView {
  readonly el: HTMLElement;
  private readonly counter = el("span", "xl-meta");
  private readonly title = el("span", "xl-step-title");
  private readonly text = el("p", "xl-step-text");
  private readonly next = el("div", "xl-next");
  private readonly nextRing = el("span", "xl-ring");
  private readonly nextLabel = el("span");
  private readonly playButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement | null;
  private readonly progress = el("div", "xl-progress");
  private readonly segments: HTMLButtonElement[];
  private readonly speedButtons: HTMLButtonElement[];
  private readonly plan: HTMLElement;
  private readonly items: HTMLLIElement[];

  constructor(
    private readonly lesson: Lesson,
    private readonly locale: FunctionLocale,
    handlers: PanelHandlers,
    speed: number,
  ) {
    this.el = el("div", "xl-panel");

    // Субтитры
    const caption = el("div", "xl-caption");
    const head = el("div", "xl-caption-head");
    head.append(this.counter, this.title);
    this.next.hidden = true;
    this.next.append(this.nextRing, this.nextLabel);
    caption.append(head, this.text, this.next);

    // Управление
    this.playButton = button("xl-ctl xl-primary", "", () => handlers.onPlayPause());
    const restart = button("xl-ctl", "⟲", () => handlers.onRestart(), "Сначала");
    this.segments = lesson.steps.map((step, i) =>
      button("xl-seg", "", () => handlers.onSeek(i), `${i + 1}. ${plainText(stepHtml(step.title, locale))}`),
    );
    this.progress.append(...this.segments);
    const speeds = el("div", "xl-speed");
    this.speedButtons = SPEEDS.map((s) => {
      const b = button("", `${String(s).replace(".", ",")}×`, () => handlers.onSpeed(s), "Скорость");
      b.dataset.speed = String(s);
      return b;
    });
    speeds.append(...this.speedButtons);
    const planToggle = button("xl-ctl", "☰ План", () => this.togglePlan());
    const onToggleSound = handlers.onToggleSound;
    this.soundButton = onToggleSound ? button("xl-ctl", "", () => onToggleSound()) : null;
    const controls = el("div", "xl-controls");
    controls.append(this.playButton, restart, this.progress, ...(this.soundButton ? [this.soundButton] : []), speeds, planToggle);

    // План урока (свёрнут)
    this.plan = el("div", "xl-plan");
    this.plan.hidden = true;
    const list = el("ol", "xl-steps");
    this.items = lesson.steps.map((step, i) => {
      const li = el("li");
      const go = button("", "", () => handlers.onSeek(i));
      go.append(el("span", "xl-n", String(i + 1)), stepHtml(step.title, locale));
      li.append(go);
      return li;
    });
    list.append(...this.items);
    this.plan.append(list);

    // Обёртка «прилипает» к верху экрана: пояснение и кнопки видны, пока прокручивают длинную таблицу
    const body = el("div", "xl-panel-body");
    body.append(caption, controls, this.plan);
    this.el.append(body);
    this.setSpeed(speed);
  }

  showStep(i: number, status: TimelineStatus): void {
    const step = this.lesson.steps[i];
    if (!step) return;
    const finished = status === "done";
    this.counter.textContent = `Шаг ${i + 1} из ${this.lesson.steps.length}`;
    this.title.replaceChildren(stepHtml(step.title, this.locale));
    this.text.replaceChildren(stepHtml(step.text, this.locale));
    const mark = (node: Element, k: number) => {
      node.classList.toggle("xl-done", k < i || finished);
      node.classList.toggle("xl-active", k === i && !finished);
    };
    this.segments.forEach(mark);
    this.items.forEach(mark);
  }

  showStatus(status: TimelineStatus): void {
    const [icon, label] =
      status === "playing"
        ? ["⏸", "Пауза"]
        : status === "paused"
          ? ["▶", "Продолжить"]
          : status === "done"
            ? ["↻", "Ещё раз"]
            : ["▶", "Смотреть"];
    this.playButton.textContent = icon;
    this.playButton.title = label;
    // Текущий отрезок шкалы «дышит», пока урок играет
    this.progress.classList.toggle("xl-playing", status === "playing");
  }

  /** Заливка текущего отрезка шкалы: доля выполненных действий шага (0…1). */
  showStepProgress(i: number, progress: number): void {
    this.segments[i]?.style.setProperty("--p", progress.toFixed(3));
  }

  /** Пауза перед следующим шагом: кольцо заполняется, подпись — какой шаг дальше. null — скрыть. */
  showWaitNext(progress: number | null, nextStep: number): void {
    const step = this.lesson.steps[nextStep];
    if (progress === null || !step) {
      this.next.hidden = true;
      return;
    }
    if (this.next.hidden) {
      this.nextLabel.replaceChildren("Дальше: ", stepHtml(step.title, this.locale));
      this.next.hidden = false;
    }
    this.nextRing.style.setProperty("--p", progress.toFixed(3));
  }

  setSpeed(speed: number): void {
    for (const b of this.speedButtons) b.classList.toggle("xl-on", Number(b.dataset.speed) === speed);
  }

  showSound(on: boolean): void {
    if (!this.soundButton) return;
    this.soundButton.textContent = on ? "🔊" : "🔇";
    this.soundButton.title = on ? "Выключить озвучку" : "Включить озвучку";
  }

  togglePlan(): void {
    this.plan.hidden = !this.plan.hidden;
  }
}
