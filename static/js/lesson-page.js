// Страница урока: монтирует плеер с настройками ученика, сохраняет прогресс — на сервер (вошедший)
// или в браузер (гость), делает автопереход к следующему уроку.
// Плеер о сайте не знает — связь только через колбэки onStepChange / onComplete.
(() => {
  const json = (id) => JSON.parse(document.getElementById(id).textContent);
  const page = json("lesson-page"); // { progressUrl, csrfToken, startStep, settings }
  const lesson = json("lesson-data");
  const next = document.getElementById("next-lesson");
  const guest = !page.progressUrl;
  const settings = page.settings ?? window.guestSettings.toPlayer(window.guestSettings.load());
  const AUTOPLAY_DELAY_S = 5;

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

  function goNext() {
    if (!next) return;
    next.classList.add("border-brand-600", "bg-brand-50", "ring-2", "ring-brand-600/30");
    if (!settings.autoplayNext) return;
    const label = document.createElement("span");
    label.className = "mt-1 block text-xs text-brand-700";
    label.dataset.autoplayCountdown = "";
    next.append(label);
    let left = AUTOPLAY_DELAY_S;
    const tick = () => {
      if (left === 0) {
        location.href = `${next.href}?autoplay=1`;
        return;
      }
      label.textContent = `Откроется через ${left} с`;
      left--;
      timer = setTimeout(tick, 1000);
    };
    let timer = setTimeout(tick, 0);
    // Любое действие с плеером (например, «Ещё раз») отменяет автопереход
    document.getElementById("player").addEventListener(
      "click",
      () => {
        clearTimeout(timer);
        label.remove();
      },
      { once: true },
    );
  }

  // Сразу после входа прогресс гостя ещё не перенесён (merge-guest.js выполняется позже, defer) —
  // берём дальний шаг из двух
  const guestStep = window.guestProgress.startStep(lesson.id);
  const startStep = guest ? guestStep : Math.max(page.startStep, guestStep);
  let current = startStep;
  let mounted = false; // первый onStepChange — это открытие урока, а не просмотр
  const player = ExcelLearnPlayer.mount(document.getElementById("player"), {
    lesson,
    settings,
    startStep,
    onStepChange: (step) => {
      current = step;
      if (mounted) save(step, false);
    },
    onComplete: () => {
      save(current, true);
      goNext();
    },
  });
  mounted = true;
  window.lessonPlayer = player;

  // Пришли автопереходом с прошлого урока — сразу запускаем
  if (new URLSearchParams(location.search).get("autoplay") === "1") void player.play();
})();
