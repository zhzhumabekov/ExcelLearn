// manage.py exercises_dump | pnpm --dir player exercises:verify — считает листы решений заданий движком плеера
// и сверяет с ответами. Листы приходят из Django уже с протянутыми формулами — те же, что в «…_решение.xlsx».
import { readFileSync } from "node:fs";

import type { Sheet } from "../src/generated/lesson";
import { verifySolutionSheet } from "../src/lesson/verify";

interface DumpedExercise {
  name: string;
  sheet: Sheet;
  expect: Record<string, string | number>;
}

const exercises = JSON.parse(readFileSync(0, "utf8")) as DumpedExercise[];

let failed = 0;
for (const exercise of exercises) {
  const { checked, problems } = verifySolutionSheet(exercise.sheet, exercise.expect);
  if (problems.length === 0) {
    console.log(`✓ ${exercise.name}: значений сверено — ${checked}`);
  } else {
    failed++;
    console.log(`✗ ${exercise.name}:`);
    for (const problem of problems) console.log(`    ${problem}`);
  }
}

if (exercises.length === 0) console.log("Заданий нет");
console.log(failed ? `\nЗаданий с ошибками: ${failed} из ${exercises.length}` : `\nВсе задания верны: ${exercises.length}`);
process.exit(failed || exercises.length === 0 ? 1 : 0);
