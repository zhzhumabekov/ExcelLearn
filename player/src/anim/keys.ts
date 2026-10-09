import type { Clock } from "./clock";

/** Показ нажатых клавиш внизу сцены: «Ctrl + C», «Enter». */
export class KeysView {
  readonly el: HTMLElement;

  constructor(
    stage: HTMLElement,
    private readonly clock: Clock,
  ) {
    this.el = document.createElement("div");
    this.el.className = "xl-keys";
    stage.append(this.el);
  }

  /** Клавиши, которые держат нажатыми, пока идёт другое действие (Ctrl при выделении). Снять — hide(). */
  hold(keys: readonly string[]): void {
    this.el.replaceChildren(...this.parts(keys));
    this.el.classList.add("xl-show");
  }

  async show(keys: readonly string[], ms = 1000): Promise<void> {
    const parts = this.parts(keys);
    this.el.replaceChildren(...parts);
    // Перезапуск CSS-анимации нажатия при повторном показе
    this.el.classList.remove("xl-show");
    void this.el.offsetWidth;
    this.el.classList.add("xl-show");
    try {
      await this.clock.wait(ms);
    } finally {
      this.hide();
    }
  }

  private parts(keys: readonly string[]): Node[] {
    const parts: Node[] = [];
    keys.forEach((key, i) => {
      if (i > 0) parts.push(Object.assign(document.createElement("span"), { className: "xl-plus-sign", textContent: "+" }));
      parts.push(Object.assign(document.createElement("span"), { className: "xl-kbd", textContent: key }));
    });
    return parts;
  }

  hide(): void {
    this.el.classList.remove("xl-show");
  }
}
