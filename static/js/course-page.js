// Оглавление у гостя: статусы уроков и процент по главам из прогресса в браузере.
// У вошедшего всё уже отрисовано сервером (data-guest="0").
(() => {
  const course = document.querySelector("[data-course]");
  if (!course || course.dataset.guest !== "1") return;
  const progress = window.guestProgress.all();

  const status = (html) => {
    const span = document.createElement("span");
    span.innerHTML = html;
    return span.firstElementChild;
  };

  for (const chapter of course.querySelectorAll("[data-chapter]")) {
    const lessons = chapter.querySelectorAll("[data-lesson]");
    let done = 0;
    for (const li of lessons) {
      const item = progress[li.dataset.lesson];
      if (!item) continue;
      const cell = li.querySelector("[data-status]");
      if (item.completed) {
        done++;
        cell.replaceChildren(status('<span class="rounded-full bg-mint px-2.5 py-1 font-semibold text-mint-ink">✓ Пройден</span>'));
      } else {
        const text = `Шаг ${item.step + 1} из ${li.dataset.steps}`;
        const span = status('<span class="rounded-full bg-butter px-2.5 py-1 font-semibold text-butter-ink"></span>');
        span.textContent = text;
        cell.replaceChildren(span);
      }
    }
    const percent = chapter.querySelector("[data-chapter-percent]");
    if (percent && lessons.length && Object.keys(progress).length) {
      percent.textContent = `пройдено ${Math.round((100 * done) / lessons.length)}%`;
    }
  }
})();
