import type { Stage } from "./render/stage";

/**
 * Демонстрация анимационного ядра для песочницы /dev/player/?demo=1 (T11): курсор, рамки, клавиши.
 * Заменится настоящими шагами урока в T12–T14.
 */
export async function runDemo(stage: Stage): Promise<void> {
  const { cursor, overlays, keys, window } = stage;
  const show = (addr: string) => {
    overlays.showSelection(addr);
    window.showActive(addr);
  };

  cursor.jump(stage.restPoint());
  await cursor.moveTo(stage.cellPoint("E4"));
  await cursor.click();
  show("E4");
  await cursor.moveTo(stage.cellPoint("C4"), 500);
  await cursor.click();
  overlays.showRefs(["C4"]);
  await cursor.moveTo(stage.cellPoint("D4"), 400);
  await cursor.click();
  overlays.showRefs(["C4", "D4"]);
  await keys.show(["Ctrl", "C"]);
  overlays.showAnts("E4");

  await cursor.moveTo(stage.cellPoint("E4", "handle"), 500);
  cursor.setShape("plus");
  await cursor.press();
  await cursor.moveTo(stage.cellPoint("E11", "handle"), 1200, (t) => {
    const row = 4 + Math.round(t * 7);
    overlays.showFill(`E4:E${row}`);
  });
  cursor.release();
}
