// Прогресс гостя — в браузере (localStorage), по тем же правилам, что и на сервере
// (apps/progress/services.py): шаг ограничен уроком, пройденный урок остаётся пройденным.
// После входа или регистрации base.html переносит его в аккаунт (POST /api/progress/merge/).
window.guestProgress = (() => {
  const KEY = "excellearn:progress";

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "{}");
      return data && typeof data === "object" ? data : {};
    } catch {
      return {}; // приватный режим или повреждённые данные
    }
  }

  function store(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // нет доступа к хранилищу — прогресс гостя не сохраняется
    }
  }

  return {
    all: load,
    get: (lessonId) => load()[lessonId] || null,
    save(lessonId, step, completed, stepCount) {
      const data = load();
      const previous = data[lessonId] || { step: 0, completed: false };
      const clamped = Math.max(0, Math.min(step, stepCount - 1));
      const done = previous.completed || completed;
      data[lessonId] = { step: done ? Math.max(previous.step, clamped) : clamped, completed: done };
      store(data);
    },
    /** С какого шага открыть урок: последний шаг незавершённого, иначе с начала. */
    startStep(lessonId) {
      const item = load()[lessonId];
      return item && !item.completed ? item.step : 0;
    },
    clear() {
      try {
        localStorage.removeItem(KEY);
      } catch {
        // нечего удалять
      }
    },
  };
})();
