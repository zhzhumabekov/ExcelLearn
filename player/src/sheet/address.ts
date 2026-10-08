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
const MAX_COL = 16384; // XFD
const MAX_ROW = 1048576;

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

/** "B2:D2" или "B2". Углы нормализуются: start — левый верхний, end — правый нижний. */
export function parseRange(range: string): RangePos {
  const [a, b = a] = range.split(":") as [string, string?];
  const p = parseCell(a);
  const q = parseCell(b);
  return {
    start: { col: Math.min(p.col, q.col), row: Math.min(p.row, q.row) },
    end: { col: Math.max(p.col, q.col), row: Math.max(p.row, q.row) },
  };
}

export function rangeName({ start, end }: RangePos): string {
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
