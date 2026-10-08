// После входа или регистрации: то, что гость накопил в браузере, переносится в аккаунт —
// прогресс (сервер берёт лучшее из двух) и настройки (если в аккаунте ещё ничего не настроено).
// Браузерные копии затем удаляются. Подключается только для вошедших.
(() => {
  const script = document.currentScript;
  const post = (url, body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": script.dataset.csrf },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });

  const progress = window.guestProgress.all();
  if (Object.keys(progress).length) {
    post(script.dataset.progressUrl, progress)
      .then((response) => {
        if (!response.ok) return;
        window.guestProgress.clear();
        // На оглавлении статусы рисует сервер — перерисуем с перенесённым прогрессом
        if (document.querySelector("[data-course]")) location.reload();
      })
      .catch(() => {}); // нет сети — попробуем на следующей странице
  }

  const settings = window.guestSettings.stored();
  if (settings) {
    post(script.dataset.settingsUrl, settings)
      .then((response) => response.ok && window.guestSettings.clear())
      .catch(() => {});
  }
})();
