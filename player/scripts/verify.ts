// pnpm lessons:verify [папка] — проигрывает каждый урок без анимации и сверяет значения с expect.
// Собирается esbuild-ом (см. package.json), потому что тянет модули плеера с импортом JSON.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parse } from "yaml";

import type { Lesson } from "../src/generated/lesson";
import { verifyLesson } from "../src/lesson/verify";

const dir = resolve(process.argv[2] ?? join(import.meta.dirname, "../../content/lessons"));
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

let failed = 0;
for (const file of files) {
  const lesson = parse(readFileSync(join(dir, file), "utf8")) as Lesson;
  const { checked, problems } = verifyLesson(lesson);
  if (problems.length === 0) {
    console.log(`✓ ${file}: значений сверено — ${checked}`);
  } else {
    failed++;
    console.log(`✗ ${file}:`);
    for (const problem of problems) console.log(`    ${problem}`);
  }
}

console.log(failed ? `\nУроков с ошибками: ${failed} из ${files.length}` : `\nВсе уроки верны: ${files.length}`);
process.exit(failed ? 1 : 0);
