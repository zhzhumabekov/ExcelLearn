// Имена диапазонов Excel (глава 2): правила допустимых имён, подстановка имён в формулу перед вычислением,
// «Применить имена» (ссылки → имена). Парсер формул понимает имена только латиницей, поэтому имена
// (=СРЗНАЧ(Акции), =цена*спрос) заменяются ссылками до разбора: так работают и кириллица, и относительные
// имена, и имена целых строк с неявным пересечением, и несмежные диапазоны.

import { type CellPos, colToLetters, lettersToCol, MAX_COL, MAX_ROW, shiftFormula } from "./address";

/** Область диапазона имени: лист и ссылка ($B$6, $B$2:$B$89, $12:$12, $A:$A или относительная B6). */
export interface NameArea {
  sheet: string;
  ref: string;
}

export interface NameDef {
  name: string;
  areas: NameArea[];
  /** null — область «Книга», иначе имя листа. */
  scope: string | null;
  comment?: string;
  /** Для относительных ссылок — ячейка, в которой стоял курсор при создании имени (B7 для «предыдущий_год»). */
  base?: { sheet: string; cell: string };
}

// ---------- Допустимые имена ----------

const CELL_LIKE_RE = /^([A-Za-z]{1,3})([0-9]+)$/;
const NAME_RE = /^[\p{L}_\\][\p{L}\p{N}_.\\?]*$/u;

/** Похоже на адрес ячейки (A4, CAT1, xfd100) — такое имя Excel не примет. */
function looksLikeCell(name: string): boolean {
  const m = CELL_LIKE_RE.exec(name);
  if (!m) return false;
  const [, letters = "", digits = ""] = m;
  return lettersToCol(letters.toUpperCase()) <= MAX_COL && Number(digits) >= 1 && Number(digits) <= MAX_ROW;
}

/** Почему имя недопустимо (текст как в Excel) или null, если имя годится. */
export function nameProblem(name: string): string | null {
  if (name.length === 0 || name.length > 255) return "Введено недопустимое имя.";
  if (/^[rcRC]$/.test(name)) return "Введено недопустимое имя.";
  if (!NAME_RE.test(name) || looksLikeCell(name)) return "Введено недопустимое имя.";
  return null;
}

/**
 * Имя из подписи для «Создать из выделенного»: пробелы и недопустимые символы → «_», в начале цифра → «_» спереди,
 * похоже на ячейку → «_» в конце. «Product 1» → «Product_1», «Северо-Казахстанская» → «Северо_Казахстанская».
 */
export function nameFromLabel(label: string): string | null {
  let name = label.trim().replace(/[^\p{L}\p{N}_.\\]/gu, "_");
  if (!name) return null;
  if (/^[\p{N}.]/u.test(name)) name = `_${name}`;
  if (looksLikeCell(name) || /^[rcRC]$/.test(name)) name = `${name}_`;
  return nameProblem(name) ? null : name;
}

export const sameName = (a: string, b: string) => a.toLocaleLowerCase("ru") === b.toLocaleLowerCase("ru");

// ---------- Ссылки ----------

/** Имя листа в формуле: в апострофах, если есть пробел или знаки. */
export function quoteSheet(sheet: string): string {
  return /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(sheet) ? sheet : `'${sheet.replaceAll("'", "''")}'`;
}

export function areaText(area: NameArea): string {
  return `${quoteSheet(area.sheet)}!${area.ref}`;
}

/** «=Лист1!$B$3:$C$4;Лист1!$E$6:$G$7» — как в поле «Диапазон» диспетчера имён (разделитель — по языку). */
export function refersToText(def: NameDef, separator = ","): string {
  return `=${def.areas.map(areaText).join(separator)}`;
}

/** Абсолютная ссылка для имени: B6 → $B$6, B2:B89 → $B$2:$B$89, 12:12 → $12:$12, A:A → $A:$A. */
export function absoluteRef(ref: string): string {
  return ref
    .split(":")
    .map((part) => {
      const clean = part.replaceAll("$", "");
      if (/^[0-9]+$/.test(clean)) return `$${clean}`;
      if (/^[A-Z]{1,3}$/.test(clean)) return `$${clean}`;
      const m = /^([A-Z]{1,3})([0-9]+)$/.exec(clean);
      return m ? `$${m[1]}$${m[2]}` : part;
    })
    .join(":");
}

/** Ссылка имени, применённая в ячейке at: у относительных частей — сдвиг от базовой ячейки. */
function placedArea(def: NameDef, area: NameArea, at: CellPos): NameArea {
  if (!def.base) return area;
  const base = /^([A-Z]{1,3})([0-9]+)$/.exec(def.base.cell);
  if (!base) return area;
  const dRow = at.row - Number(base[2]);
  const dCol = at.col - lettersToCol(base[1] ?? "A");
  return { ...area, ref: shiftFormula(area.ref, dRow, dCol) };
}

interface AreaBounds {
  r1: number | null;
  c1: number | null;
  r2: number | null;
  c2: number | null;
}

function bounds(ref: string): AreaBounds {
  const [a = "", b = a] = ref.replaceAll("$", "").split(":");
  const part = (p: string) => {
    const m = /^([A-Z]{1,3})?([0-9]+)?$/.exec(p);
    return { col: m?.[1] ? lettersToCol(m[1]) : null, row: m?.[2] ? Number(m[2]) : null };
  };
  const p = part(a);
  const q = part(b);
  return { r1: p.row, c1: p.col, r2: q.row, c2: q.col };
}

/**
 * Неявное пересечение (Excel 2019): имя строки в ячейке F14 даёт ячейку этой строки в столбце F,
 * имя столбца — ячейку этого столбца в строке формулы. Остальное — как есть.
 */
function intersect(area: NameArea, at: CellPos): string | null {
  const { r1, c1, r2, c2 } = bounds(area.ref);
  const oneRow = r1 !== null && r1 === r2;
  const oneCol = c1 !== null && c1 === c2;
  if (oneRow && oneCol) return area.ref;
  if (oneRow) {
    const inside = c1 === null || (at.col >= c1 && at.col <= (c2 ?? c1));
    return inside ? `${colToLetters(at.col)}${r1}` : null;
  }
  if (oneCol) {
    const inside = r1 === null || (at.row >= r1 && at.row <= (r2 ?? r1));
    return inside ? `${colToLetters(c1 ?? 1)}${at.row}` : null;
  }
  return area.ref;
}

// ---------- Подстановка имён в формулу ----------

export interface NameContext {
  sheet: string;
  at: CellPos;
  /** Найти имя: qualifier — лист перед «!» (Лист2!jam) или null. */
  resolve(name: string, qualifier: string | null): NameDef | null;
}

// Строка | (лист!)ссылка или диапазон строк/столбцов | (лист!)идентификатор | число | любой символ
const TOKEN_RE =
  /("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[\p{L}\p{N}_.]+)!)?(\$?[A-Za-z]{1,3}\$?[0-9]+(?::\$?[A-Za-z]{1,3}\$?[0-9]+)?(?![\p{L}\p{N}_(])|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}(?![\p{L}\p{N}_(])|\$?[0-9]+:\$?[0-9]+(?![\p{L}\p{N}_(]))|((?:'(?:[^']|'')+'|[\p{L}\p{N}_.]+)!)?([\p{L}_\\][\p{L}\p{N}_.?\\]*)|([0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)|([\s\S])/gu;

interface Token {
  text: string;
  kind: "string" | "ref" | "ident" | "number" | "char";
  qualifier?: string;
  ident?: string;
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  for (const m of formula.matchAll(TOKEN_RE)) {
    const [text, str, refQ, ref, idQ, ident, num] = m;
    if (str !== undefined) tokens.push({ text, kind: "string" });
    else if (ref !== undefined) tokens.push({ text, kind: "ref", qualifier: refQ });
    else if (ident !== undefined) tokens.push({ text, kind: "ident", qualifier: idQ, ident });
    else if (num !== undefined) tokens.push({ text, kind: "number" });
    else tokens.push({ text, kind: "char" });
  }
  return tokens;
}

const unquote = (q: string) => q.slice(0, -1).replace(/^'(.*)'$/, "$1").replaceAll("''", "'");
const significant = (t: Token | undefined) => t !== undefined && !(t.kind === "char" && /\s/.test(t.text));

function lastSignificant(tokens: readonly Token[], before: number): Token | undefined {
  for (let i = before - 1; i >= 0; i--) if (significant(tokens[i])) return tokens[i];
  return undefined;
}

/** Формула с именами → формула со ссылками (для вычисления). Неизвестное имя → #NAME?. */
export function expandNames(formula: string, ctx: NameContext): string {
  const tokens = tokenize(formula);
  const calls: boolean[] = []; // стек скобок: true — скобка вызова функции
  let out = "";
  tokens.forEach((token, i) => {
    if (token.kind === "char" && token.text === "(") {
      const prev = lastSignificant(tokens, i);
      calls.push(prev?.kind === "ident" && !prev.qualifier);
    }
    if (token.kind === "char" && token.text === ")") calls.pop();
    if (token.kind !== "ident" || !token.ident) {
      out += token.text;
      return;
    }
    const next = tokens.slice(i + 1).find(significant);
    const upper = token.ident.toUpperCase();
    if (next?.text === "(" || ((upper === "TRUE" || upper === "FALSE") && !token.qualifier)) {
      out += token.text;
      return;
    }
    const def = ctx.resolve(token.ident, token.qualifier ? unquote(token.qualifier) : null);
    if (!def) {
      out += "#NAME?";
      return;
    }
    const prev = lastSignificant(tokens, i);
    const wholeArgument =
      calls.at(-1) === true && (prev?.text === "(" || prev?.text === ",") && (next?.text === ")" || next?.text === ",");
    const areas = def.areas.map((area) => placedArea(def, area, ctx.at));
    if (wholeArgument) {
      out += areas.map(areaText).join(",");
    } else if (areas.length !== 1) {
      out += "#VALUE!";
    } else {
      const area = areas[0] as NameArea;
      const ref = intersect(area, ctx.at);
      out += ref === null ? "#VALUE!" : areaText({ sheet: area.sheet, ref });
    }
  });
  return out;
}

// ---------- Применить имена ----------

/**
 * «Применить имена»: ссылки формулы, совпадающие с диапазоном имени (без учёта $), заменяются именем.
 * =F4*(F3-F5)-F6 → =потребность*(цена-себестоимость)-затраты. Только имена с одной областью на этом листе.
 */
export function applyNames(formula: string, sheet: string, names: readonly NameDef[]): string {
  const byRef = new Map<string, string>();
  for (const def of names) {
    const [area] = def.areas;
    if (def.areas.length === 1 && area && area.sheet === sheet && !def.base) {
      byRef.set(area.ref.replaceAll("$", ""), def.name);
    }
  }
  return tokenize(formula)
    .map((token) => {
      if (token.kind !== "ref") return token.text;
      const qualifier = token.qualifier ? unquote(token.qualifier) : null;
      if (qualifier !== null && qualifier !== sheet) return token.text;
      const ref = token.text.slice(token.qualifier?.length ?? 0).replaceAll("$", "");
      return byRef.get(ref) ?? token.text;
    })
    .join("");
}
