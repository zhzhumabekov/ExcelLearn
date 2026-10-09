// Адреса ячеек и диапазонов Excel. Строки и столбцы — с 1, как в Excel (A1 = {col: 1, row: 1}).

export interface CellPos {
  col: number;
  row: number;
}

export interface RangePos {
  start: CellPos;
  end: CellPos;
}

const CELL_RE = /^([A-Z]{1,3})([1-9][0-9]*)$/;
export const MAX_COL = 16384; // XFD
export const MAX_ROW = 1048576;

export function lettersToCol(letters: string): number {
  let col = 0;
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
  return col;
}

export function colToLetters(col: number): string {
  let letters = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

export function parseCell(addr: string): CellPos {
  const [, letters, digits] = CELL_RE.exec(addr) ?? [];
  if (!letters || !digits) throw new Error(`Некорректный адрес ячейки: ${addr}`);
  return { col: lettersToCol(letters), row: Number(digits) };
}

export function cellName({ col, row }: CellPos): string {
  return colToLetters(col) + row;
}

/** Часть диапазона: ячейка B2, номер строки 12 (вся строка) или буквы столбца A (весь столбец). */
function parsePart(part: string, edge: "start" | "end"): CellPos {
  if (/^[1-9][0-9]*$/.test(part)) return { col: edge === "start" ? 1 : MAX_COL, row: Number(part) };
  if (/^[A-Z]{1,3}$/.test(part)) return { col: lettersToCol(part), row: edge === "start" ? 1 : MAX_ROW };
  return parseCell(part);
}

/**
 * "B2:D2", "B2", целые строки "12:12" и столбцы "A:A". Углы нормализуются: start — левый верхний,
 * end — правый нижний.
 */
export function parseRange(range: string): RangePos {
  const [a, b = a] = range.replaceAll("$", "").split(":") as [string, string?];
  const p = parsePart(a, "start");
  const q = parsePart(b, "end");
  const p2 = parsePart(b, "start");
  const q2 = parsePart(a, "end");
  return {
    start: { col: Math.min(p.col, p2.col), row: Math.min(p.row, p2.row) },
    end: { col: Math.max(q.col, q2.col), row: Math.max(q.row, q2.row) },
  };
}

/** Обратно к тексту: целые строки — "12:12", целые столбцы — "A:A", иначе "B2:D2" / "B2". */
export function rangeName({ start, end }: RangePos): string {
  if (start.col === 1 && end.col === MAX_COL) return `${start.row}:${end.row}`;
  if (start.row === 1 && end.row === MAX_ROW) return `${colToLetters(start.col)}:${colToLetters(end.col)}`;
  const a = cellName(start);
  const b = cellName(end);
  return a === b ? a : `${a}:${b}`;
}

/** Ячейки диапазона построчно, слева направо. */
export function cellsInRange(range: string | RangePos): string[] {
  const { start, end } = typeof range === "string" ? parseRange(range) : range;
  const cells: string[] = [];
  for (let row = start.row; row <= end.row; row++) {
    for (let col = start.col; col <= end.col; col++) cells.push(cellName({ col, row }));
  }
  return cells;
}

export function offsetCell(addr: string, dRow: number, dCol: number): string {
  const { col, row } = parseCell(addr);
  return cellName({ col: col + dCol, row: row + dRow });
}

// Ссылка вида $A$1 / A$1 / $A1 / A1, не являющаяся частью имени функции (LOG10() или идентификатора.
const REF_RE = /(?<![A-Za-z0-9_.])(\$?)([A-Z]{1,3})(\$?)([1-9][0-9]*)(?![A-Za-z0-9_(])/g;

/**
 * Сдвигает относительные ссылки формулы, как при копировании ячейки на dRow строк и dCol столбцов.
 * Части со знаком $ не меняются; строки в кавычках не трогаются; уход за край листа даёт #REF!.
 */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(REF_RE, (_m, colAbs: string, letters: string, rowAbs: string, digits: string) => {
            const col = colAbs ? lettersToCol(letters) : lettersToCol(letters) + dCol;
            const row = rowAbs ? Number(digits) : Number(digits) + dRow;
            if (col < 1 || row < 1 || col > MAX_COL || row > MAX_ROW) return "#REF!";
            return `${colAbs}${colToLetters(col)}${rowAbs}${row}`;
          }),
    )
    .join("");
}

// Ссылка или диапазон в формуле: $A$1, B2:D2, $C$4 (части $ не важны для подсветки)
const REF_OR_RANGE_RE =
  /(?<![A-Za-z0-9_.])\$?([A-Z]{1,3})\$?([1-9][0-9]*)(?::\$?([A-Z]{1,3})\$?([1-9][0-9]*))?(?![A-Za-z0-9_(])/g;

/** Ссылки формулы по порядку появления, без $ и без повторов: «=C4*D4» → ["C4", "D4"]. */
export function formulaRefs(formula: string): string[] {
  const refs: string[] = [];
  const outsideStrings = formula.split(/"(?:[^"]|"")*"/).join(" ");
  for (const m of outsideStrings.matchAll(REF_OR_RANGE_RE)) {
    const [, c1, r1, c2, r2] = m;
    const ref = c2 && r2 ? `${c1}${r1}:${c2}${r2}` : `${c1}${r1}`;
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}
