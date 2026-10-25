// Cell value types shared by the engine, formatter and UI.
export class SErr {
  constructor(code) { this.code = code; }
  toString() { return this.code; }
}
const cache = {};
export const E = (code) => cache[code] || (cache[code] = new SErr(code));
export const ERR = { NA: E('#N/A'), REF: E('#REF!'), VALUE: E('#VALUE!'), DIV0: E('#DIV/0!'), NAME: E('#NAME?'), NUM: E('#NUM!'), NULL: E('#NULL!'), SPILL: E('#SPILL!'), CIRC: E('#CIRC!'), CALC: E('#CALC!') };
export const isErr = (v) => v instanceof SErr;
export const errFromCode = (c) => E(c.toUpperCase());
