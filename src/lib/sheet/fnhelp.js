// Helpers for writing spreadsheet functions.
import { ERR, SErr, RangeRef, bool, compare, isMat, isRef, num, str } from './fnutil.js';

export const T = (ctx) => ctx.api;

/* Collect numbers from args the way SUM/AVERAGE do */
export function collectNums(ctx, args, { countBool = false, textAsZero = false } = {}) {
  const out = [];
  const api = ctx.api;
  for (const a of args) {
    if (isRef(a) || isMat(a)) {
      for (const row of api.toMatrix(a)) {
        for (const v of row) {
          if (v instanceof SErr) throw v;
          if (typeof v === 'number') out.push(v);
          else if (countBool && typeof v === 'boolean') out.push(v ? 1 : 0);
          else if (textAsZero && typeof v === 'string') out.push(0);
        }
      }
    } else if (a === null || a === undefined) {
      continue;
    } else out.push(num(a));
  }
  return out;
}

/* All values (blanks included as null) from args, flattened row-major */
export function flatten(ctx, args) {
  const out = [];
  for (const a of args) {
    if (isRef(a) || isMat(a)) ctx.api.toMatrix(a).forEach((row) => row.forEach((v) => out.push(v)));
    else out.push(a);
  }
  return out;
}

export const matrix = (ctx, a) => ctx.api.toMatrix(a);
export const scalar = (ctx, a) => ctx.api.scalar(a);
export const first = (ctx, a) => ctx.api.scalar(a);

/* Criteria used by COUNTIF / SUMIF families */
export function makeCriteria(crit) {
  if (crit instanceof SErr) throw crit;
  if (typeof crit === 'number' || typeof crit === 'boolean') return (v) => (typeof crit === 'boolean' ? v === crit : typeof v === 'number' && v === crit);
  if (crit === null || crit === undefined) return (v) => v === null || v === '' || v === 0 && false;
  const s = String(crit);
  const m = /^(<=|>=|<>|=|<|>)(.*)$/.exec(s);
  let op = '=';
  let rest = s;
  if (m) { op = m[1]; rest = m[2]; }
  const numeric = rest.trim() !== '' && !Number.isNaN(Number(rest)) ? Number(rest) : null;
  const pctNum = /^\s*-?[\d.]+%\s*$/.test(rest) ? parseFloat(rest) / 100 : null;
  const target = numeric !== null ? numeric : pctNum;
  const wildcard = /[*?~]/.test(rest);
  const re = wildcard ? new RegExp('^' + rest.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i') : null;
  return (v) => {
    if (v instanceof SErr) return op === '=' && rest.toUpperCase() === v.code;
    if (rest === '' && (op === '=' || op === '<>')) {
      const blank = v === null || v === '';
      return op === '=' ? blank : !blank;
    }
    if (target !== null) {
      if (typeof v === 'number') return cmpOp(op, v - target);
      if (typeof v === 'string' && !wildcard && op !== '=' && op !== '<>') return false;
      if (op === '<>') return !(typeof v === 'number' && v === target) && true;
      return false;
    }
    if (typeof v === 'string' || (op === '<>' && v !== null)) {
      const sv = typeof v === 'string' ? v : str(v);
      if (re) { const hit = re.test(sv); return op === '<>' ? !hit : op === '=' ? hit : false; }
      const c = sv.toLowerCase().localeCompare(rest.toLowerCase());
      if (op === '=') return sv.toLowerCase() === rest.toLowerCase();
      if (op === '<>') return sv.toLowerCase() !== rest.toLowerCase();
      return cmpOp(op, c);
    }
    if (typeof v === 'boolean' && /^(true|false)$/i.test(rest)) { const b = rest.toLowerCase() === 'true'; return op === '<>' ? v !== b : v === b; }
    return op === '<>' ? true : false;
  };
}
const cmpOp = (op, d) => (op === '=' ? d === 0 : op === '<>' ? d !== 0 : op === '<' ? d < 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : d >= 0);

/* Round half away from zero without binary noise */
export function roundTo(x, d = 0) {
  if (!Number.isFinite(x)) return x;
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = Number(a + 'e' + d);
  if (Number.isNaN(t) || String(a).includes('e')) { const m = Math.pow(10, d); return (s * Math.round(a * m)) / m; }
  return s * Number(Math.round(t) + 'e' + -d);
}

export const argOr = (args, i, d) => (args[i] === undefined || args[i] === null ? d : args[i]);
export const need = (cond, err = ERR.VALUE) => { if (!cond) throw err; };
export { ERR, SErr, RangeRef, bool, compare, isMat, isRef, num, str };

/* scalar argument: top-left of a range, errors thrown */
export const S = (ctx, a) => { const v = ctx.api.scalar(a); if (v instanceof SErr) throw v; return v; };
/* read a ref/matrix as an R x C matrix starting at its origin (pads with null) */
export function shaped(ctx, a, R, C) {
  const api = ctx.api;
  if (isRef(a)) {
    const out = [];
    for (let i = 0; i < R; i++) {
      const row = [];
      for (let j = 0; j < C; j++) {
        const r = a.r1 + i; const c = a.c1 + j;
        row.push(r > a.r2 || c > a.c2 ? null : api.value(a.si, r, c));
      }
      out.push(row);
    }
    return out;
  }
  const m = api.toMatrix(a);
  return Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => (m[i] && m[i][j] !== undefined ? m[i][j] : null)));
}
export const hiddenRow = (ctx, si, r) => { const h = ctx.api.sheets[si].hidden; return !!(h && h.rows && h.rows[r]) || !!(ctx.api.sheets[si].filtered && ctx.api.sheets[si].filtered[r]); };
