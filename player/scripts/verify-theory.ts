// manage.py theory_dump | pnpm --dir player theory:verify — проигрывает кадры теории (мини-уроки) без анимации
// и сверяет значения на кадре с expect.
import { readFileSync } from "node:fs";

import type { Lesson } from "../src/generated/lesson";
import { verifyLesson } from "../src/lesson/verify";

const figures = JSON.parse(readFileSync(0, "utf8")) as Lesson[];

let failed = 0;
for (const figure of figures) {
  // Кадр без формул (выделение, окно-диалог) сверять не с чем; его действия проверяет manage.py theory_frames
  if (Object.keys(figure.expect ?? {}).length === 0) {
    console.log(`· ${figure.id}: без значений`);
    continue;
  }
  const { checked, problems } = verifyLesson(figure);
  if (problems.length === 0) {
    console.log(`✓ ${figure.id}: значений сверено — ${checked}`);
  } else {
    failed++;
    console.log(`✗ ${figure.id}:`);
    for (const problem of problems) console.log(`    ${problem}`);
  }
}

if (figures.length === 0) console.log("Кадров нет");
console.log(failed ? `\nКадров с ошибками: ${failed} из ${figures.length}` : `\nВсе кадры верны: ${figures.length}`);
process.exit(failed ? 1 : 0);
