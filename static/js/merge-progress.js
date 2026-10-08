// После входа или регистрации: прогресс, накопленный гостем в браузере, переносится в аккаунт
// (сервер берёт лучшее из двух), затем браузерная копия удаляется. Подключается только для вошедших.
(() => {
  const script = document.currentScript;
  const progress = window.guestProgress.all();
  if (!Object.keys(progress).length) return;

  fetch(script.dataset.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": script.dataset.csrf },
    body: JSON.stringify(progress),
    credentials: "same-origin",
  })
    .then((response) => {
      if (!response.ok) return;
      window.guestProgress.clear();
      // На оглавлении статусы рисует сервер — перерисуем с перенесённым прогрессом
      if (document.querySelector("[data-course]")) location.reload();
    })
    .catch(() => {
      // нет сети — попробуем на следующей странице
    });
})();
