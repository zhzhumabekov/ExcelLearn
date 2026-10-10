import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import type { Lesson } from "../generated/lesson";
import { verifyLesson } from "./verify";

function lesson(expect: Lesson["expect"], actions: Lesson["steps"][number]["actions"] = [{ wait: 1 }]): Lesson {
  return {
    id: "fixture",
    chapter: "ch01",
    order: 1,
    title: "Фикстура",
    sheet: { cells: { C4: 49, D4: 10, A1: "текст" } },
    expect,
    steps: [
      { title: "Формула", text: "t", actions: [{ click: "E4" }, { type: "=C4*D4" }, { keys: ["Enter"] }] },
      { title: "Ещё", text: "t", actions },
    ],
  };
}

describe("verifyLesson", () => {
  it("совпадающие значения — без проблем", () => {
    expect(verifyLesson(lesson({ E4: 490, A1: "текст" }))).toEqual({ checked: 2, problems: [] });
  });

  it("числа сверяются с допуском 0.005 (книга округляет до центов)", () => {
    const fixture = lesson({ E4: 490.004 });

    expect(verifyLesson(fixture).problems).toEqual([]);
    expect(verifyLesson(lesson({ E4: 490.01 })).problems).toEqual(["E4: ожидалось 490.01, получено 490 (=C4*D4)"]);
  });

  it("сообщает о каждом расхождении с формулой ячейки", () => {
    const { problems } = verifyLesson(lesson({ E4: 500, F9: 1, A1: "другой" }));

    expect(problems).toEqual([
      "E4: ожидалось 500, получено 490 (=C4*D4)",
      "F9: ожидалось 1, получено пусто",
      'A1: ожидалось "другой", получено "текст"',
    ]);
  });

  it("ошибка Excel в ячейке — расхождение", () => {
    const { problems } = verifyLesson(lesson({ F1: 1 }, [{ click: "F1" }, { type: "=1/0" }, { keys: ["Enter"] }]));

    expect(problems).toEqual(["F1: ожидалось 1, получено #DIV/0! (=1/0)"]);
  });

  it("неподдерживаемое или невозможное действие — ошибка с номером шага", () => {
    const unsupported = verifyLesson(lesson({ E4: 490 }, [{ keys: ["Delete"] }]));
    expect(unsupported.problems[0]).toMatch(/^шаг 2 «Ещё», действие 1 \{"keys":\["Delete"\]\}: Действие пока не поддерживается/);

    const impossible = verifyLesson(lesson({ E4: 490 }, [{ clickRef: "C4" }]));
    expect(impossible.problems[0]).toContain('сначала type: "="');
  });

  it("урок без expect — предупреждение", () => {
    expect(verifyLesson(lesson({})).problems).toEqual(["нет блока expect — значения не с чем сверить"]);
  });
});

const LESSONS_DIR = join(__dirname, "../../../content/lessons");
const lessons = readdirSync(LESSONS_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => [f, parse(readFileSync(join(LESSONS_DIR, f), "utf8")) as Lesson] as const);

describe("уроки из content/lessons", () => {
  it.each(lessons)("%s: все значения совпадают с expect", (_file, data) => {
    const { checked, problems } = verifyLesson(data);

    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });
});

describe("ожидаемая ошибка в expect", () => {
  it("записывается кодом ошибки и сверяется", () => {
    const lesson = {
      id: "e",
      chapter: "ch06",
      order: 1,
      title: "t",
      sheet: { cells: { A1: " 33", B1: { f: "=VALUE(A1)" } } },
      expect: { B1: "#VALUE!" },
      steps: [{ title: "t", text: "t", actions: [{ wait: 1 }] }],
    };
    expect(verifyLesson(lesson as never).problems).toEqual([]);
    expect(verifyLesson({ ...lesson, expect: { B1: 33 } } as never).problems).not.toEqual([]);
  });
});
