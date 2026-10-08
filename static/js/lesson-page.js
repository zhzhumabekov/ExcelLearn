// Страница урока: монтирует плеер и сохраняет прогресс — на сервер (вошедший) или в браузер (гость).
// Плеер о сайте не знает — связь только через колбэки onStepChange / onComplete.
(() => {
  const json = (id) => JSON.parse(document.getElementById(id).textContent);
  const page = json("lesson-page"); // { progressUrl, csrfToken, startStep }
  const lesson = json("lesson-data");
  const next = document.getElementById("next-lesson");
  const guest = !page.progressUrl;

  function save(step, completed) {
    if (guest) {
      window.guestProgress.save(lesson.id, step, completed, lesson.steps.length);
      return;
    }
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

  // Сразу после входа прогресс гостя ещё не перенесён (merge-progress.js выполняется позже, defer) —
  // берём дальний шаг из двух
  const guestStep = window.guestProgress.startStep(lesson.id);
  const startStep = guest ? guestStep : Math.max(page.startStep, guestStep);
  let current = startStep;
  let mounted = false; // первый onStepChange — это открытие урока, а не просмотр
  window.lessonPlayer = ExcelLearnPlayer.mount(document.getElementById("player"), {
    lesson,
    narration: json("narration-data"),
    startStep,
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
