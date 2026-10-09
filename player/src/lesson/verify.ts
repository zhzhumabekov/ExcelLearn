import { type ActionSpec, createAction } from "../actions";
import type { Lesson, Sheet } from "../generated/lesson";
import { type CellValue, ExcelError } from "../sheet/evaluator";
import { SheetModel } from "../sheet/sheet-model";
import { createState } from "./state";

/** Допуск для чисел: в книге значения округлены до центов (449.63 при 449.625). */
export const TOLERANCE = 0.005;

export interface VerifyResult {
  checked: number;
  /** Расхождения и ошибки, по строке на каждое: «E6: ожидалось 1320, получено 1310». */
  problems: string[];
}

function show(value: CellValue | string | number): string {
  if (value instanceof ExcelError) return value.code;
  if (value === null) return "пусто";
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function matches(actual: CellValue, expected: string | number): boolean {
  if (actual instanceof ExcelError) return false;
  if (typeof expected === "number") return typeof actual === "number" && Math.abs(actual - expected) <= TOLERANCE;
  return actual === expected;
}

/**
 * Проигрывает урок без анимации (apply всех действий) и сверяет ячейки с блоком expect.
 * Значения сравниваются в каноническом английском виде — как их хранит модель листа.
 */
export function verifyLesson(lesson: Lesson): VerifyResult {
  const problems: string[] = [];
  const state = createState(new SheetModel(lesson.sheet));

  for (const [i, step] of lesson.steps.entries()) {
    for (const [j, spec] of step.actions.entries()) {
      try {
        createAction(spec as ActionSpec).apply(state);
      } catch (e) {
        problems.push(`шаг ${i + 1} «${step.title}», действие ${j + 1} ${JSON.stringify(spec)}: ${(e as Error).message}`);
        return { checked: 0, problems };
      }
    }
  }

  return checkExpect(state.sheet, lesson.expect ?? {});
}

/** Сверяет значения листа с ожидаемыми. Общая часть для уроков и заданий. */
export function checkExpect(sheet: SheetModel, expected: Record<string, string | number>): VerifyResult {
  const problems: string[] = [];
  const entries = Object.entries(expected);
  for (const [addr, value] of entries) {
    const actual = sheet.value(addr);
    if (!matches(actual, value)) {
      const formula = sheet.formula(addr);
      problems.push(`${addr}: ожидалось ${show(value)}, получено ${show(actual)}${formula ? ` (${formula})` : ""}`);
    }
  }
  if (entries.length === 0) problems.push("нет блока expect — значения не с чем сверить");
  return { checked: entries.length, problems };
}

/** Задание: лист решения уже содержит формулы ответа — достаточно посчитать его и сверить. */
export function verifySolutionSheet(sheet: Sheet, expected: Record<string, string | number>): VerifyResult {
  return checkExpect(new SheetModel(sheet), expected);
}
