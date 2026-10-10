// Оглавление: статусы гостя из браузера, раскрытие глав, поиск и фильтры.
// У вошедшего статусы и раскрытые главы уже отрисованы сервером (data-guest="0").
(() => {
  const course = document.querySelector("[data-course]");
  if (!course) return;
  const chapters = [...course.querySelectorAll("[data-chapter]")];
  const details = (chapter) => chapter.querySelector("details");

  // ---------- Статусы гостя ----------
  if (course.dataset.guest === "1") {
    const progress = window.guestProgress.all();
    const status = (html) => {
      const span = document.createElement("span");
      span.innerHTML = html;
      return span.firstElementChild;
    };
    const started = [];
    for (const chapter of chapters) {
      const lessons = chapter.querySelectorAll("[data-lesson]");
      let done = 0;
      for (const li of lessons) {
        const item = progress[li.dataset.lesson];
        if (!item) continue;
        const cell = li.querySelector("[data-status]");
        if (item.completed) {
          done++;
          cell.replaceChildren(status('<span class="rounded-full bg-mint px-2 py-0.5 font-semibold text-mint-ink">✓ Пройден</span>'));
        } else {
          const span = status('<span class="rounded-full bg-butter px-2 py-0.5 font-semibold text-butter-ink"></span>');
          span.textContent = `Шаг ${item.step + 1} из ${li.dataset.steps}`;
          cell.replaceChildren(span);
          started.push(chapter);
        }
      }
      const percent = chapter.querySelector("[data-chapter-percent]");
      if (percent && lessons.length && Object.keys(progress).length) {
        const value = Math.round((100 * done) / lessons.length);
        percent.textContent = `пройдено ${value}%`;
        chapter.querySelector("[data-chapter-bar]").style.width = `${value}%`;
      }
    }
    // Раскрыть главы с начатыми уроками (сервер у гостя раскрывает первую главу)
    if (started.length) for (const chapter of chapters) if (details(chapter)) details(chapter).open = started.includes(chapter);
  }

  // ---------- Переход по ссылке #chNN (хлебные крошки урока): раскрыть главу ----------
  const openFromHash = () => {
    const id = location.hash.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (target?.matches("[data-chapter]") && details(target)) {
      details(target).open = true;
      target.scrollIntoView({ block: "start" });
    }
  };
  openFromHash();
  window.addEventListener("hashchange", openFromHash);

  // ---------- Развернуть / свернуть всё ----------
  for (const button of document.querySelectorAll("[data-course-expand]")) {
    button.addEventListener("click", () => {
      for (const chapter of chapters) if (details(chapter) && !chapter.hidden) details(chapter).open = button.dataset.courseExpand === "1";
    });
  }

  // ---------- Поиск и «Скрыть главы без уроков» ----------
  const search = document.querySelector("[data-course-search]");
  const hideEmpty = document.querySelector("[data-course-hide-empty]");
  const nothing = document.querySelector("[data-course-nothing]");
  const norm = (text) => text.toLowerCase().replaceAll("ё", "е").trim();
  const opened = new Map(); // раскрытие до поиска — вернуть, когда строку очистят

  const apply = () => {
    const query = norm(search?.value ?? "");
    if (query && !opened.size) for (const chapter of chapters) if (details(chapter)) opened.set(chapter, details(chapter).open);
    let shown = 0;
    for (const chapter of chapters) {
      const lessons = [...chapter.querySelectorAll("[data-lesson]")];
      let visible = !(hideEmpty?.checked && chapter.hasAttribute("data-empty"));
      if (query) {
        const byChapter = norm(chapter.dataset.search).includes(query) || chapter.dataset.number === query;
        const hits = lessons.filter((li) => norm(li.dataset.search).includes(query));
        // Совпала глава — видны все её уроки; совпали уроки — только они, глава раскрыта
        for (const li of lessons) li.hidden = !byChapter && !hits.includes(li);
        visible &&= byChapter || hits.length > 0;
        if (details(chapter) && hits.length) details(chapter).open = true;
      } else {
        for (const li of lessons) li.hidden = false;
      }
      chapter.hidden = !visible;
      if (visible) shown++;
    }
    if (!query && opened.size) {
      for (const [chapter, open] of opened) details(chapter).open = open;
      opened.clear();
    }
    nothing.classList.toggle("hidden", shown > 0);
  };
  search?.addEventListener("input", apply);
  hideEmpty?.addEventListener("change", apply);
})();
