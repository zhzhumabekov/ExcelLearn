// Страница настроек. У вошедшего сохраняет htmx (hx-post на форме),
// у гостя — этот скрипт, в браузер.
(() => {
  const form = document.getElementById("settings-form");
  const status = document.getElementById("settings-status");
  const guest = form.dataset.guest === "1";

  if (guest) {
    // Заполнить форму сохранённым в браузере
    const saved = window.guestSettings.load();
    for (const [name, value] of Object.entries(saved)) {
      for (const input of form.querySelectorAll(`[name="${name}"]`)) {
        if (input.type === "radio") input.checked = Number(input.value) === Number(value) || input.value === value;
        else if (input.type === "checkbox") input.checked = Boolean(value);
        else input.value = value;
      }
    }
  }

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (!guest) return; // вошедший: сохраняет htmx
    const value =
      input.type === "checkbox" ? input.checked : input.name === "speed" || input.type === "range" ? Number(input.value) : input.value;
    window.guestSettings.save({ [input.name]: value });
    status.textContent = "Сохранено в этом браузере ✓";
  });
})();
