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
  LARGE: [["array", "массив"], ["k", "k"]],
  SMALL: [["array", "массив"], ["k", "k"]],
  SUMPRODUCT: [["array1", "массив1"], ["[array2]", "[массив2]"], ["…", "…"]],
  PMT: [["rate", "ставка"], ["nper", "кпер"], ["pv", "пс"], ["[fv]", "[бс]"], ["[type]", "[тип]"]],
  NPV: [["rate", "ставка"], ["value1", "значение1"], ["[value2]", "[значение2]"], ["…", "…"]],
  XNPV: [["rate", "ставка"], ["values", "значения"], ["dates", "даты"]],
  AND: [["logical1", "логическое_значение1"], ["[logical2]", "[логическое_значение2]"], ["…", "…"]],
  OR: [["logical1", "логическое_значение1"], ["[logical2]", "[логическое_значение2]"], ["…", "…"]],
  IFERROR: [["value", "значение"], ["value_if_error", "значение_если_ошибка"]],
  AGGREGATE: [["function_num", "номер_функции"], ["options", "параметры"], ["array", "массив"], ["[k]", "[k]"]],
  ROW: [["[reference]", "[ссылка]"]],
  MOD: [["number", "число"], ["divisor", "делитель"]],
  IFS: [["logical_test1", "лог_выражение1"], ["value_if_true1", "значение_если_истина1"], ["…", "…"]],
  CHOOSE: [["index_num", "номер_индекса"], ["value1", "значение1"], ["[value2]", "[значение2]"], ["…", "…"]],
  SWITCH: [["expression", "выражение"], ["value1", "значение1"], ["result1", "результат1"], ["[default]", "[по_умолчанию]"], ["…", "…"]],
  PV: [["rate", "ставка"], ["nper", "кпер"], ["pmt", "плт"], ["[fv]", "[бс]"], ["[type]", "[тип]"]],
  FV: [["rate", "ставка"], ["nper", "кпер"], ["pmt", "плт"], ["[pv]", "[пс]"], ["[type]", "[тип]"]],
  PPMT: [["rate", "ставка"], ["per", "период"], ["nper", "кпер"], ["pv", "пс"], ["[fv]", "[бс]"], ["[type]", "[тип]"]],
  IPMT: [["rate", "ставка"], ["per", "период"], ["nper", "кпер"], ["pv", "пс"], ["[fv]", "[бс]"], ["[type]", "[тип]"]],
  CUMPRINC: [["rate", "ставка"], ["nper", "кол_пер"], ["pv", "нз"], ["start_period", "нач_период"], ["end_period", "кон_период"], ["type", "тип"]],
  CUMIPMT: [["rate", "ставка"], ["nper", "кол_пер"], ["pv", "нз"], ["start_period", "нач_период"], ["end_period", "кон_период"], ["type", "тип"]],
  RATE: [["nper", "кпер"], ["pmt", "плт"], ["pv", "пс"], ["[fv]", "[бс]"], ["[type]", "[тип]"], ["[guess]", "[прогноз]"]],
  NPER: [["rate", "ставка"], ["pmt", "плт"], ["pv", "пс"], ["[fv]", "[бс]"], ["[type]", "[тип]"]],
  SLN: [["cost", "нач_стоимость"], ["salvage", "ост_стоимость"], ["life", "время_эксплуатации"]],
  SYD: [["cost", "нач_стоимость"], ["salvage", "ост_стоимость"], ["life", "время_эксплуатации"], ["per", "период"]],
  DDB: [["cost", "нач_стоимость"], ["salvage", "ост_стоимость"], ["life", "время_эксплуатации"], ["period", "период"], ["[factor]", "[коэффициент]"]],
  SQRT: [["number", "число"]],
  IRR: [["values", "значения"], ["[guess]", "[предположение]"]],
  XIRR: [["values", "значения"], ["dates", "даты"], ["[guess]", "[предп]"]],
  MIRR: [["values", "значения"], ["finance_rate", "ставка_финанс"], ["reinvest_rate", "ставка_реинвест"]],
  // Глава 7. РАЗНДАТ подсказки нет — её нет и в Excel
  TODAY: [],
  DATE: [["year", "год"], ["month", "месяц"], ["day", "день"]],
  DATEVALUE: [["date_text", "дата_как_текст"]],
  YEAR: [["serial_number", "дата_в_числовом_формате"]],
  MONTH: [["serial_number", "дата_в_числовом_формате"]],
  DAY: [["serial_number", "дата_в_числовом_формате"]],
  WEEKDAY: [["serial_number", "дата_в_числовом_формате"], ["[return_type]", "[тип]"]],
  WORKDAY: [["start_date", "нач_дата"], ["days", "число_дней"], ["[holidays]", "[праздники]"]],
  "WORKDAY.INTL": [["start_date", "нач_дата"], ["days", "число_дней"], ["[weekend]", "[выходной]"], ["[holidays]", "[праздники]"]],
  NETWORKDAYS: [["start_date", "нач_дата"], ["end_date", "кон_дата"], ["[holidays]", "[праздники]"]],
  "NETWORKDAYS.INTL": [["start_date", "нач_дата"], ["end_date", "кон_дата"], ["[weekend]", "[выходные]"], ["[holidays]", "[праздники]"]],
  EOMONTH: [["start_date", "нач_дата"], ["months", "число_месяцев"]],
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
