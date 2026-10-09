import type { Lesson } from "../generated/lesson";
import type { NameArea } from "../sheet/names";
import { SheetModel } from "../sheet/sheet-model";
import { Workbook } from "../sheet/workbook";

// Часть ссылки: (лист!)диапазон. Лист — в апострофах или без них.
const AREA_RE = /^(?:'((?:[^']|'')+)'!|([^!'=,;]+)!)?(\$?[A-Z]{0,3}\$?[0-9]*(?::\$?[A-Z]{0,3}\$?[0-9]*)?)$/;

/**
 * Текст ссылки имени → части: «=Лист1!$A$2:$B$7», «B6:B55», «Лист2!E4:E6», «$B$3:$C$4,$E$6:$G$7».
 * Части разделяются «,» (английский Excel) или «;» (русский). Лист по умолчанию — defaultSheet.
 */
export function parseRefersTo(text: string, defaultSheet: string): NameArea[] {
  const body = text.trim().replace(/^=/, "");
  const parts = body.split(/[,;](?=(?:[^']*'[^']*')*[^']*$)/);
  return parts.map((part) => {
    const m = AREA_RE.exec(part.trim());
    const ref = m?.[3];
    if (!m || !ref || !/[A-Z0-9]/.test(ref)) throw new Error(`Некорректная ссылка имени: ${part}`);
    const sheet = m[1]?.replaceAll("''", "'") ?? m[2]?.trim() ?? defaultSheet;
    return { sheet, ref };
  });
}

/** Книга урока: первый лист, остальные листы и имена, определённые к началу. Возвращает первый лист. */
export function createBook(lesson: Pick<Lesson, "sheet" | "sheets" | "names">): SheetModel {
  const book = new Workbook();
  const first = new SheetModel(lesson.sheet, book);
  for (const sheet of lesson.sheets ?? []) new SheetModel(sheet, book);
  for (const spec of lesson.names ?? []) {
    const defaultSheet = spec.scope ?? first.name;
    book.defineName({
      name: spec.name,
      areas: parseRefersTo(spec.ref, defaultSheet),
      scope: spec.scope ?? null,
      comment: spec.comment ?? undefined,
      base: spec.relativeTo ? { sheet: defaultSheet, cell: spec.relativeTo } : undefined,
    });
  }
  return first;
}
