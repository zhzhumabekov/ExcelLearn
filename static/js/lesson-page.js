// Страница урока: монтирует плеер и сохраняет прогресс. Плеер о сайте не знает —
// связь только через колбэки onStepChange / onComplete.
(() => {
  const json = (id) => JSON.parse(document.getElementById(id).textContent);
  const page = json("lesson-page"); // { progressUrl, csrfToken, startStep }
  const next = document.getElementById("next-lesson");

  function save(step, completed) {
    if (!page.progressUrl) return; // гость — сохранение в браузере появится в T25
    fetch(page.progressUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": page.csrfToken },
      body: JSON.stringify({ step, completed }),
      credentials: "same-origin",
      keepalive: true, // долетит, даже если ученик сразу ушёл со страницы
    }).catch(() => {
      // нет сети — прогресс сохранится при следующем шаге
    });
  }

  let current = page.startStep ?? 0;
  let mounted = false; // первый onStepChange — это открытие урока, а не просмотр
  window.lessonPlayer = ExcelLearnPlayer.mount(document.getElementById("player"), {
    lesson: json("lesson-data"),
    narration: json("narration-data"),
    startStep: page.startStep ?? 0,
    onStepChange: (step) => {
      current = step;
      if (mounted) save(step, false);
    },
    onComplete: () => {
      save(current, true);
      next?.classList.add("border-brand-600", "bg-brand-50", "ring-2", "ring-brand-600/30", "dark:bg-stone-800");
    },
  });
  mounted = true;
})();
