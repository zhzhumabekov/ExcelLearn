// Переключатель темы в шапке: системная → светлая → тёмная. Выбор — в localStorage (в профиль — T26).
document.addEventListener("alpine:init", () => {
  const ORDER = ["system", "light", "dark"];
  const LABELS = { system: ["◐", "Тема: как в системе"], light: ["☀", "Тема: светлая"], dark: ["☾", "Тема: тёмная"] };
  const media = matchMedia("(prefers-color-scheme: dark)");

  function apply(choice) {
    const dark = choice === "dark" || (choice === "system" && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.themeChoice = choice;
  }

  window.Alpine.data("themeToggle", () => ({
    choice: document.documentElement.dataset.themeChoice || "system",
    get icon() {
      return LABELS[this.choice][0];
    },
    get title() {
      return LABELS[this.choice][1];
    },
    init() {
      media.addEventListener("change", () => apply(this.choice));
    },
    next() {
      this.choice = ORDER[(ORDER.indexOf(this.choice) + 1) % ORDER.length];
      try {
        localStorage.setItem("theme", this.choice);
      } catch {
        // приватный режим: тема действует до перезагрузки
      }
      apply(this.choice);
    },
  }));
});
