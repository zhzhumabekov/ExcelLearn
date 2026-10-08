// JSON Schema урока (manage.py lessons_schema) → TS-типы плеера.
// Опции общие с проверкой в src/schema-sync.test.ts.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { compile } from "json-schema-to-typescript";

export const SCHEMA_PATH = fileURLToPath(new URL("../schema/lesson.schema.json", import.meta.url));
export const TYPES_PATH = fileURLToPath(new URL("../src/generated/lesson.ts", import.meta.url));

export async function generateTypes() {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  return compile(schema, "Lesson", {
    additionalProperties: false,
    bannerComment:
      "/* Сгенерировано из lessons/schema.py (manage.py lessons_schema + pnpm gen:types). Не править вручную. */",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(TYPES_PATH, await generateTypes(), "utf8");
  console.log("Записано: src/generated/lesson.ts");
}
