// Тема: системная → светлая → тёмная (переключатель в шапке и страница настроек).
// Гость — в браузере; вошедший — в профиле (POST /api/settings/), чтобы тема была на всех устройствах.
(() => {
  const ORDER = ["system", "light", "dark"];
  const LABELS = { system: ["◐", "Тема: как в системе"], light: ["☀", "Тема: светлая"], dark: ["☾", "Тема: тёмная"] };
  const html = document.documentElement;
  const media = matchMedia("(prefers-color-scheme: dark)");

  function paint(choice) {
    const dark = choice === "dark" || (choice === "system" && media.matches);
    html.dataset.theme = dark ? "dark" : "light";
    html.dataset.themeChoice = choice;
    document.dispatchEvent(new CustomEvent("theme:change", { detail: choice }));
  }

  /** Применить тему; persist — сохранить выбор (в браузер или в профиль вошедшего). */
  window.applyTheme = (choice, { persist = true } = {}) => {
    paint(choice);
    if (!persist) return;
    try {
      localStorage.setItem("theme", choice);
    } catch {
      // приватный режим: тема действует до перезагрузки
    }
    if (html.dataset.settingsApi) {
      fetch(html.dataset.settingsApi, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": html.dataset.csrf },
        body: JSON.stringify({ theme: choice }),
        credentials: "same-origin",
      }).catch(() => {
        // нет сети — тема сохранится в следующий раз
      });
    }
  };

  media.addEventListener("change", () => paint(html.dataset.themeChoice || "system"));

  document.addEventListener("alpine:init", () => {
    window.Alpine.data("themeToggle", () => ({
      choice: html.dataset.themeChoice || "system",
      get icon() {
        return LABELS[this.choice][0];
      },
      get title() {
        return LABELS[this.choice][1];
      },
      init() {
        document.addEventListener("theme:change", (e) => (this.choice = e.detail));
      },
      next() {
        window.applyTheme(ORDER[(ORDER.indexOf(this.choice) + 1) % ORDER.length]);
      },
    }));
  });
})();
