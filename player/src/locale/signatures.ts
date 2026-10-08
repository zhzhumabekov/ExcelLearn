import { type FunctionLocale, functionName } from "./format";

// Подсказка синтаксиса, которую Excel показывает под ячейкой при вводе функции.
// Параметры: [английское имя, русское имя]; необязательные — в квадратных скобках.
const SIGNATURES: Record<string, [string, string][]> = {
  SUM: [["number1", "число1"], ["[number2]", "[число2]"], ["…", "…"]],
  AVERAGE: [["number1", "число1"], ["[number2]", "[число2]"], ["…", "…"]],
  MAX: [["number1", "число1"], ["[number2]", "[число2]"], ["…", "…"]],
  MIN: [["number1", "число1"], ["[number2]", "[число2]"], ["…", "…"]],
  COUNT: [["value1", "значение1"], ["[value2]", "[значение2]"], ["…", "…"]],
  FORMULATEXT: [["reference", "ссылка"]],
  IF: [["logical_test", "лог_выражение"], ["[value_if_true]", "[значение_если_истина]"], ["[value_if_false]", "[значение_если_ложь]"]],
  ROUND: [["number", "число"], ["num_digits", "число_разрядов"]],
  VLOOKUP: [["lookup_value", "искомое_значение"], ["table_array", "таблица"], ["col_index_num", "номер_столбца"], ["[range_lookup]", "[интервальный_просмотр]"]],
  MATCH: [["lookup_value", "искомое_значение"], ["lookup_array", "просматриваемый_массив"], ["[match_type]", "[тип_сопоставления]"]],
  INDEX: [["array", "массив"], ["row_num", "номер_строки"], ["[column_num]", "[номер_столбца]"]],
  SUMPRODUCT: [["array1", "массив1"], ["[array2]", "[массив2]"], ["…", "…"]],
  PMT: [["rate", "ставка"], ["nper", "кпер"], ["pv", "пс"], ["[fv]", "[бс]"], ["[type]", "[тип]"]],
  NPV: [["rate", "ставка"], ["value1", "значение1"], ["[value2]", "[значение2]"], ["…", "…"]],
};

export interface Signature {
  name: string;
  params: string[];
  /** Номер параметра, который сейчас вводится (выделяется жирным). */
  current: number;
}

/**
 * Какую подсказку показать для набранного текста формулы: функция, внутри скобок которой стоит
 * курсор (в конце текста), и номер текущего аргумента. Текст — канонический (английский).
 */
export function signatureAt(text: string, locale: FunctionLocale): Signature | null {
  const stack: { name: string; args: number }[] = [];
  let inString = false;
  let name = "";
  for (const ch of text) {
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (/[A-Za-z0-9_.]/.test(ch)) {
      name += ch;
      continue;
    }
    if (ch === "(") stack.push({ name: name.toUpperCase(), args: 0 });
    else if (ch === ")") stack.pop();
    else if (ch === ",") {
      const top = stack.at(-1);
      if (top) top.args++;
    }
    name = "";
  }
  const call = stack.at(-1);
  const params = call && SIGNATURES[call.name];
  if (!call || !params) return null;
  const column = locale === "ru" ? 1 : 0;
  return {
    name: functionName(call.name, locale),
    params: params.map((p) => p[column]),
    current: Math.min(call.args, params.length - 1),
  };
}
