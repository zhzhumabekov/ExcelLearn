import { type ActionSpec, createAction } from "../actions";
import type { Lesson, NameSpec, Sheet } from "../generated/lesson";
import { type CellValue, ExcelError } from "../sheet/evaluator";
import { SheetModel } from "../sheet/sheet-model";
import { DEFAULT_ITERATION } from "../sheet/workbook";
import { createBook } from "./book";
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
  // Ожидаемая ошибка записывается её кодом: «#VALUE!»
  if (actual instanceof ExcelError) return actual.code === expected;
  if (typeof expected === "number") return typeof actual === "number" && Math.abs(actual - expected) <= TOLERANCE;
  return actual === expected;
}

/**
 * Проигрывает урок без анимации (apply всех действий) и сверяет ячейки с блоком expect.
 * Значения сравниваются в каноническом английском виде — как их хранит модель листа.
 */
export function verifyLesson(lesson: Lesson): VerifyResult {
  const problems: string[] = [];
  const state = createState(createBook(lesson));

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

  // Адреса без листа — на первом листе, даже если урок закончился на другом
  return checkExpect(state.sheet.book.sheets[0] ?? state.sheet, lesson.expect ?? {});
}

/** «Астана!E7» → лист «Астана» той же книги и E7; просто «E7» — первый лист. */
function splitAddress(key: string, sheet: SheetModel): [SheetModel, string] {
  const bang = key.lastIndexOf("!");
  if (bang < 0) return [sheet, key];
  return [sheet.book.sheet(key.slice(0, bang)), key.slice(bang + 1)];
}

/** Сверяет значения листа с ожидаемыми. Общая часть для уроков и заданий. */
export function checkExpect(sheet: SheetModel, expected: Record<string, string | number>): VerifyResult {
  const problems: string[] = [];
  const entries = Object.entries(expected);
  for (const [key, value] of entries) {
    const [where, addr] = splitAddress(key, sheet);
    const actual = where.value(addr);
    if (!matches(actual, value)) {
      const formula = where.formula(addr);
      problems.push(`${key}: ожидалось ${show(value)}, получено ${show(actual)}${formula ? ` (${formula})` : ""}`);
    }
  }
  if (entries.length === 0) problems.push("нет блока expect — значения не с чем сверить");
  return { checked: entries.length, problems };
}

/** Задание: лист решения уже содержит формулы ответа и имена — достаточно посчитать его и сверить. */
export function verifySolutionSheet(
  sheet: Sheet,
  expected: Record<string, string | number>,
  names: NameSpec[] = [],
  sheets: Sheet[] = [],
  iterative = false,
): VerifyResult {
  const first = createBook({ sheet, sheets, names });
  if (iterative) first.book.setIteration({ ...DEFAULT_ITERATION, enabled: true });
  return checkExpect(first, expected);
}
