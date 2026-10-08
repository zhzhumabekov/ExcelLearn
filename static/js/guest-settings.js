// Настройки гостя — в браузере. Те же поля и значения по умолчанию, что у модели Preferences.
// После входа переносятся в аккаунт (merge-guest.js), если там ещё ничего не настроено.
window.guestSettings = (() => {
  const KEY = "excellearn:settings";
  const DEFAULTS = {
    speed: 1,
    function_locale: "ru",
    narration_on: true,
    narration_volume: 80,
    autoplay_next: false,
  };

  function stored() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "null");
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

  return {
    /** Сохранённое гостем (без значений по умолчанию) или null. */
    stored,
    load: () => ({ ...DEFAULTS, ...stored() }),
    save(changes) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...stored(), ...changes }));
      } catch {
        // нет доступа к хранилищу — настройки действуют до перезагрузки
      }
    },
    clear() {
      try {
        localStorage.removeItem(KEY);
      } catch {
        // нечего удалять
      }
    },
    /** В формат плеера (PlayerSettings) и страницы урока. */
    toPlayer(s) {
      return {
        speed: Number(s.speed),
        functionLocale: s.function_locale,
        narrationOn: Boolean(s.narration_on),
        narrationVolume: Number(s.narration_volume),
        autoplayNext: Boolean(s.autoplay_next),
      };
    },
  };
})();
