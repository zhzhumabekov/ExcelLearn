// @vitest-environment node
import { readFile } from "node:fs/promises";

import { expect, it } from "vitest";

// @ts-expect-error — .mjs-скрипт без деклараций типов
import { generateTypes, TYPES_PATH } from "../scripts/gen-types.mjs";

it("сгенерированные TS-типы совпадают с JSON Schema (иначе: pnpm gen:types)", async () => {
  const committed = await readFile(TYPES_PATH, "utf8");

  expect(committed).toBe(await generateTypes());
});
