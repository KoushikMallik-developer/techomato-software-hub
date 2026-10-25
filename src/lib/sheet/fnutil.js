// Value helpers shared by the engine and the function library.
import { ERR, SErr, isErr } from './values.js';

export class RangeRef {
  constructor(si, r1, c1, r2, c2) { this.si = si; this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2; }
  get rows() { return this.r2 - this.r1 + 1; }
  get cols() { return this.c2 - this.c1 + 1; }
  get single() { return this.r1 === this.r2 && this.c1 === this.c2; }
}
export const isRef = (v) => v instanceof RangeRef;
export class Lambda { constructor(params, body, env, ctx) { this.params = params; this.body = body; this.env = env; this.ctx = ctx; } }
export const isLambda = (v) => v instanceof Lambda;

/* A cell value as stored: number | string | boolean | SErr | null */
export const isNum = (v) => typeof v === 'number';
export const isStr = (v) => typeof v === 'string';

const NUM_TEXT = /^\s*[-+]?\s*\$?\s*(\d[\d,]*\.?\d*|\.\d+)(e[-+]?\d+)?\s*%?\s*$/i;
export function parseNumberText(s) {
  const t = s.trim();
  if (t === '') return null;
  if (!NUM_TEXT.test(t)) {
    const m = /^\(\s*\$?\s*([\d,]*\.?\d+)\s*\)$/.exec(t);
    if (m) return -parseFloat(m[1].replace(/,/g, ''));
    return null;
  }
  const pct = t.endsWith('%');
  const neg = /^\s*-/.test(t);
  const body = t.replace(/[%$,\s+-]/g, (ch) => (ch === 'e' ? ch : ''));
  const n = parseFloat(t.replace(/[%$,\s]/g, ''));
  if (Number.isNaN(n)) return null;
  return pct ? n / 100 : (neg && n > 0 ? -n : n);
}

/* Throw-based coercions (errors are thrown as SErr and caught at the cell level) */
export function num(v) {
  if (v instanceof SErr) throw v;
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = parseNumberText(v);
    if (n === null) {
      const d = dateTextToNumber(v);
      if (d !== null) return d;
      throw ERR.VALUE;
    }
    return n;
  }
  throw ERR.VALUE;
}
let dateParser = null;
export const setDateParser = (f) => { dateParser = f; };
const dateTextToNumber = (s) => (dateParser ? dateParser(s) : null);

export function str(v) {
  if (v instanceof SErr) throw v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return numToStr(v);
  return String(v);
}
export function numToStr(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  let s = String(+n.toPrecision(15));
  if (s.includes('e')) s = n.toExponential().replace('e+', 'E+').replace('e-', 'E-');
  return s;
}
export function bool(v) {
  if (v instanceof SErr) throw v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'string') {
    const u = v.toUpperCase();
    if (u === 'TRUE') return true;
    if (u === 'FALSE') return false;
  }
  throw ERR.VALUE;
}

/* Excel ordering: numbers < text < logicals; blanks equal 0 / "" */
export function compare(a, b) {
  if (a instanceof SErr) throw a;
  if (b instanceof SErr) throw b;
  const ta = typeOrder(a, b); const tb = typeOrder(b, a);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (typeof a === 'string' && typeof b === 'string') {
    const x = a.toLowerCase(); const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = a === null ? (typeof b === 'string' ? 0 : typeof b === 'boolean' ? 0 : 0) : Number(a);
  const y = b === null ? 0 : Number(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
function typeOrder(v, other) {
  if (v === null || v === undefined) return typeof other === 'string' ? 1 : typeof other === 'boolean' ? 2 : 0;
  if (typeof v === 'number') return 0;
  if (typeof v === 'string') return 1;
  return 2;
}

export const isMat = (v) => Array.isArray(v);
export const matDims = (m) => [m.length, m.length ? m[0].length : 0];
export const mapMat = (m, f) => m.map((row) => row.map(f));
export const transposeMat = (m) => (m.length ? m[0].map((_, c) => m.map((row) => row[c])) : []);

/* Create a matrix filled by f(r,c) */
export const makeMat = (rows, cols, f) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => f(r, c)));

export function broadcast(a, b, f) {
  const [ra, ca] = matDims(a); const [rb, cb] = matDims(b);
  const R = Math.max(ra, rb); const C = Math.max(ca, cb);
  const out = [];
  for (let r = 0; r < R; r++) {
    const row = [];
    for (let c = 0; c < C; c++) {
      const ar = ra === 1 ? 0 : r; const ac = ca === 1 ? 0 : c;
      const br = rb === 1 ? 0 : r; const bc = cb === 1 ? 0 : c;
      if ((ra !== 1 && r >= ra) || (ca !== 1 && c >= ca) || (rb !== 1 && r >= rb) || (cb !== 1 && c >= cb)) { row.push(ERR.NA); continue; }
      try { row.push(f(a[ar][ac], b[br][bc])); } catch (e) { if (e instanceof SErr) row.push(e); else throw e; }
    }
    out.push(row);
  }
  return out;
}

export { ERR, SErr, isErr };
