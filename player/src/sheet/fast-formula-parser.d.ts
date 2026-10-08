// Минимальные типы для fast-formula-parser 1.0.19 (у пакета своих нет). Только то, что использует evaluator.ts.
declare module "fast-formula-parser" {
  export interface CellRef {
    sheet?: string;
    row: number;
    col: number;
  }

  export interface RangeRef {
    sheet?: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
  }

  export interface FunctionArg {
    value: unknown;
    isArray: boolean;
    omitted?: boolean;
    ref?: CellRef | RangeRef;
  }

  export class FormulaError extends Error {
    readonly error: string;
    static readonly DIV0: FormulaError;
    static readonly NA: FormulaError;
    static readonly NAME: FormulaError;
    static readonly NULL: FormulaError;
    static readonly NUM: FormulaError;
    static readonly REF: FormulaError;
    static readonly VALUE: FormulaError;
  }

  export interface ParserConfig {
    onCell: (ref: CellRef) => unknown;
    onRange: (ref: RangeRef) => unknown[][];
    functions?: Record<string, (...args: FunctionArg[]) => unknown>;
  }

  export default class FormulaParser {
    static readonly FormulaError: typeof FormulaError;
    constructor(config: ParserConfig);
    functions: Record<string, (...args: FunctionArg[]) => unknown>;
    funsPreserveRef: string[];
    funsNeedContext: string[];
    funsNeedContextAndNoDataRetrieve: string[];
    parse(formula: string, position: CellRef): unknown;
  }
}
