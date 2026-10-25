import { def } from './registry.js';
import { ERR, SErr, bool, flatten, isMat, isRef, num, S, str } from './fnhelp.js';
import { RangeRef, compare, matDims, makeMat, transposeMat } from './fnutil.js';
import { colName } from './addr.js';
import { parseFormula, quoteSheet } from './parser.js';

const mx = (ctx, a) => ctx.api.toMatrix(a);
const wildRe = (pat) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i');
const sameType = (a, b) => (typeof a === typeof b) && a !== null && b !== null;
function eq(a, b, wildcard) {
  if (a instanceof SErr || b instanceof SErr) return false;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'string') { if (wildcard && /[*?~]/.test(b)) return wildRe(b).test(a); return a.toLowerCase() === b.toLowerCase(); }
  return a === b;
}
/* find index in list per match mode: 0 exact, 1 next larger, -1 next smaller, 2 wildcard */
function findIn(list, v, mode, rev) {
  const n = list.length; const idxs = rev ? Array.from({ length: n }, (_, i) => n - 1 - i) : Array.from({ length: n }, (_, i) => i);
  if (v instanceof SErr) throw v;
  for (const i of idxs) if (eq(list[i], v, mode === 2)) return i;
  if (mode === 1 || mode === -1) {
    let best = -1;
    for (const i of idxs) {
      const x = list[i]; if (!sameType(x, v)) continue;
      const c = compare(x, v);
      if (mode === -1 && c < 0 && (best < 0 || compare(x, list[best]) > 0)) best = i;
      if (mode === 1 && c > 0 && (best < 0 || compare(x, list[best]) < 0)) best = i;
    }
    return best;
  }
  return -1;
}
/* approximate (sorted ascending): last element <= v */
function approx(list, v) {
  let best = -1;
  for (let i = 0; i < list.length; i++) { const x = list[i]; if (!sameType(x, v)) continue; if (compare(x, v) <= 0) best = i; else break; }
  return best;
}
const flat1 = (m) => m.flat();

def('VLOOKUP', ([v, tbl, col, rng], ctx) => {
  const t = mx(ctx, tbl); const c = Math.trunc(num(S(ctx, col)));
  if (c < 1) throw ERR.VALUE; if (!t.length || c > t[0].length) throw ERR.REF;
  const keys = t.map((r) => r[0]); const exact = rng !== undefined && !bool(S(ctx, rng));
  const i = exact ? findIn(keys, v, 2, false) : approx(keys, v);
  if (i < 0) throw ERR.NA; return t[i][c - 1];
}, { min: 3, max: 4, lift: [0] });
def('HLOOKUP', ([v, tbl, row, rng], ctx) => {
  const t = mx(ctx, tbl); const r = Math.trunc(num(S(ctx, row)));
  if (r < 1) throw ERR.VALUE; if (r > t.length) throw ERR.REF;
  const keys = t[0]; const exact = rng !== undefined && !bool(S(ctx, rng));
  const i = exact ? findIn(keys, v, 2, false) : approx(keys, v);
  if (i < 0) throw ERR.NA; return t[r - 1][i];
}, { min: 3, max: 4, lift: [0] });
def('LOOKUP', ([v, lv, rv], ctx) => {
  const L = mx(ctx, lv); const horizontal = L.length === 1 && L[0].length > 1; const keys = flat1(L);
  const res = rv === undefined ? keys : flat1(mx(ctx, rv));
  const i = approx(keys, v); if (i < 0) throw ERR.NA; return res[i] ?? ERR.NA;
}, { min: 2, max: 3, lift: [0] });
def('MATCH', ([v, arr, type], ctx) => {
  const keys = flat1(mx(ctx, arr)); const t = type === undefined ? 1 : Math.sign(num(S(ctx, type)));
  let i;
  if (t === 0) i = findIn(keys, v, 2, false);
  else if (t === 1) i = approx(keys, v);
  else { i = -1; for (let k = 0; k < keys.length; k++) if (sameType(keys[k], v) && compare(keys[k], v) >= 0) i = k; else if (sameType(keys[k], v)) break; }
  if (i < 0) throw ERR.NA; return i + 1;
}, { min: 2, max: 3, lift: [0] });
def('XMATCH', ([v, arr, mm, sm], ctx) => {
  const keys = flat1(mx(ctx, arr)); const mode = mm === undefined ? 0 : Math.trunc(num(S(ctx, mm))); const s = sm === undefined ? 1 : Math.trunc(num(S(ctx, sm)));
  const i = findIn(keys, v, mode, s === -1); if (i < 0) throw ERR.NA; return i + 1;
}, { min: 2, max: 4, lift: [0] });
def('XLOOKUP', ([v, la, ra, nf, mm, sm], ctx) => {
  const L = mx(ctx, la); const R = mx(ctx, ra);
  const keys = flat1(L); const mode = mm === undefined ? 0 : Math.trunc(num(S(ctx, mm))); const s = sm === undefined ? 1 : Math.trunc(num(S(ctx, sm)));
  const one = (val) => {
    const i = findIn(keys, val, mode, s === -1 || s === -2);
    if (i < 0) { if (nf !== undefined) return ctx.api.deref(nf); throw ERR.NA; }
    if (L[0].length === 1 && L.length > 1 || L.length === 1 && L[0].length === 1) { if (i >= R.length) throw ERR.REF; return [R[i]]; }
    if (R.length && i >= R[0].length) throw ERR.REF; return R.map((r) => [r[i]]);
  };
  const vals = ctx.api.deref(v);
  if (isMat(vals)) return vals.map((row) => row.map((x) => { try { const o = one(x); return isMat(o) ? o[0][0] : o; } catch (e) { if (e instanceof SErr) return e; throw e; } }));
  return one(vals);
}, { min: 3, max: 6 });

def('INDEX', ([a, r, c, area], ctx) => {
  const ri = r === undefined ? 0 : Math.trunc(num(S(ctx, r))); let ci = c === undefined ? 0 : Math.trunc(num(S(ctx, c)));
  if (isRef(a)) {
    const R = a.rows; const C = a.cols;
    let rr = ri; let cc = ci;
    if (c === undefined && R === 1 && C > 1) { cc = ri; rr = 1; }
    if (rr < 0 || cc < 0 || rr > R || cc > C) throw ERR.REF;
    const r1 = rr === 0 ? a.r1 : a.r1 + rr - 1; const r2 = rr === 0 ? a.r2 : r1;
    const c1 = cc === 0 ? a.c1 : a.c1 + cc - 1; const c2 = cc === 0 ? a.c2 : c1;
    return new RangeRef(a.si, r1, c1, r2, c2);
  }
  const m = mx(ctx, a); const [R, C] = matDims(m);
  let rr = ri; let cc = ci;
  if (c === undefined && R === 1 && C > 1) { cc = ri; rr = 1; }
  if (rr < 0 || cc < 0 || rr > R || cc > C) throw ERR.REF;
  if (rr === 0 && cc === 0) return m;
  if (rr === 0) return m.map((row) => [row[cc - 1]]);
  if (cc === 0) return [m[rr - 1]];
  return m[rr - 1][cc - 1];
}, { min: 2, max: 4 });
def('OFFSET', ([a, r, c, h, w], ctx) => {
  if (!isRef(a)) throw ERR.VALUE;
  const dr = Math.trunc(num(S(ctx, r))); const dc = Math.trunc(num(S(ctx, c)));
  const H = h === undefined ? a.rows : Math.trunc(num(S(ctx, h))); const W = w === undefined ? a.cols : Math.trunc(num(S(ctx, w)));
  if (H < 1 || W < 1) throw ERR.REF;
  const r1 = a.r1 + dr; const c1 = a.c1 + dc;
  if (r1 < 0 || c1 < 0) throw ERR.REF;
  return new RangeRef(a.si, r1, c1, r1 + H - 1, c1 + W - 1);
}, { min: 3, max: 5 });
def('INDIRECT', ([t], ctx) => {
  const s = str(S(ctx, t)).trim(); if (!s) throw ERR.REF;
  let ast; try { ast = parseFormula('=' + s); } catch { throw ERR.REF; }
  if (ast.t !== 'ref' && ast.t !== 'name') throw ERR.REF;
  return ctx.api.evalNode(ast, { si: ctx.si, r: ctx.r, c: ctx.c, env: null });
}, { min: 1, max: 2 });
def('ROW', ([a], ctx) => {
  if (a === undefined) return ctx.r + 1;
  if (!isRef(a)) throw ERR.VALUE;
  return a.single ? a.r1 + 1 : makeMat(a.rows, 1, (i) => a.r1 + i + 1);
}, { min: 0, max: 1 });
def('COLUMN', ([a], ctx) => {
  if (a === undefined) return ctx.c + 1;
  if (!isRef(a)) throw ERR.VALUE;
  return a.single ? a.c1 + 1 : makeMat(1, a.cols, (_, j) => a.c1 + j + 1);
}, { min: 0, max: 1 });
def('ROWS', ([a], ctx) => (isRef(a) ? a.rows : matDims(mx(ctx, a))[0]), { min: 1, max: 1 });
def('COLUMNS', ([a], ctx) => (isRef(a) ? a.cols : matDims(mx(ctx, a))[1]), { min: 1, max: 1 });
def('AREAS', () => 1, { min: 1, max: 1 });
def('ADDRESS', ([r, c, abs, a1, sh], ctx) => {
  const R = Math.trunc(num(S(ctx, r))); const C = Math.trunc(num(S(ctx, c))); const m = abs === undefined ? 1 : Math.trunc(num(S(ctx, abs)));
  if (R < 1 || C < 1) throw ERR.VALUE;
  const rel = a1 !== undefined && !bool(S(ctx, a1));
  let t;
  if (rel) t = `R${m === 1 || m === 2 ? R : `[${R}]`}C${m === 1 || m === 3 ? C : `[${C}]`}`;
  else t = `${m === 1 || m === 3 ? '$' : ''}${colName(C - 1)}${m === 1 || m === 2 ? '$' : ''}${R}`;
  return sh === undefined ? t : `${quoteSheet(str(S(ctx, sh)))}!${t}`;
}, { min: 2, max: 5 });
def('HYPERLINK', ([u, n], ctx) => (n === undefined ? str(S(ctx, u)) : S(ctx, n)), { min: 1, max: 2 });

/* ---------- dynamic arrays ---------- */
const truthy = (v) => { if (v instanceof SErr) throw v; return typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : false; };
def('FILTER', ([arr, inc, ifEmpty], ctx) => {
  const A = mx(ctx, arr); const I = mx(ctx, inc);
  const [R, C] = matDims(A);
  let out;
  if (I.length === R && I[0].length === 1) out = A.filter((_, i) => truthy(I[i][0]));
  else if (I.length === 1 && I[0].length === C) { const keep = I[0].map(truthy); out = A.map((row) => row.filter((_, j) => keep[j])); if (out[0] && !out[0].length) out = []; }
  else throw ERR.VALUE;
  if (!out.length) { if (ifEmpty !== undefined) return ctx.api.deref(ifEmpty); throw ERR.CALC; }
  return out;
}, { min: 2, max: 3 });
const cmpKey = (a, b, desc) => {
  const ea = a === null || a === ''; const eb = b === null || b === '';
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1; // blanks last
  if (a instanceof SErr || b instanceof SErr) return a instanceof SErr ? (b instanceof SErr ? 0 : 1) : -1;
  const c = compare(a, b); return desc ? -c : c;
};
def('SORT', ([arr, idx, ord, byCol], ctx) => {
  let A = mx(ctx, arr); const bc = byCol !== undefined && bool(S(ctx, byCol));
  if (bc) A = transposeMat(A);
  const k = idx === undefined ? 1 : Math.trunc(num(S(ctx, idx))); const desc = ord !== undefined && (num(S(ctx, ord)) === -1 || ord === false);
  if (k < 1 || k > (A[0] ? A[0].length : 0)) throw ERR.VALUE;
  const out = A.map((r, i) => [r, i]).sort((x, y) => cmpKey(x[0][k - 1], y[0][k - 1], desc) || x[1] - y[1]).map((x) => x[0]);
  return bc ? transposeMat(out) : out;
}, { min: 1, max: 4 });
def('SORTBY', ([arr, ...rest], ctx) => {
  const A = mx(ctx, arr); const keys = [];
  for (let i = 0; i < rest.length; i += 2) {
    const k = flat1(mx(ctx, rest[i])); if (k.length !== A.length) throw ERR.VALUE;
    keys.push([k, rest[i + 1] !== undefined && num(S(ctx, rest[i + 1])) === -1]);
  }
  return A.map((r, i) => [r, i]).sort((x, y) => { for (const [k, d] of keys) { const c = cmpKey(k[x[1]], k[y[1]], d); if (c) return c; } return x[1] - y[1]; }).map((x) => x[0]);
}, { min: 2 });
def('SORTN', ([arr, n], ctx) => mx(ctx, arr).slice(0, n === undefined ? 1 : Math.trunc(num(S(ctx, n)))), { min: 1, max: 4 });
const keyOfV = (v) => (v === null ? '\u0000b' : typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + String(v));
def('UNIQUE', ([arr, byCol, once], ctx) => {
  let A = mx(ctx, arr); const bc = byCol !== undefined && bool(S(ctx, byCol)); const ex = once !== undefined && bool(S(ctx, once));
  if (bc) A = transposeMat(A);
  const seen = new Map(); A.forEach((r, i) => { const k = r.map(keyOfV).join('\u0001'); const e = seen.get(k); if (e) e.n++; else seen.set(k, { n: 1, i }); });
  let out = [...seen.values()].filter((e) => !ex || e.n === 1).sort((a, b) => a.i - b.i).map((e) => A[e.i]);
  if (!out.length) throw ERR.CALC;
  return bc ? transposeMat(out) : out;
}, { min: 1, max: 3 });
def('COUNTUNIQUE', (args, ctx) => new Set(flatten(ctx, args).filter((v) => v !== null && v !== '').map(keyOfV)).size, { min: 1 });
def('SEQUENCE', ([r, c, s, st], ctx) => {
  const R = Math.trunc(num(S(ctx, r))); const C = c === undefined ? 1 : Math.trunc(num(S(ctx, c))); const a = s === undefined ? 1 : num(S(ctx, s)); const d = st === undefined ? 1 : num(S(ctx, st));
  if (R < 1 || C < 1) throw ERR.CALC; if (R * C > 1e6) throw ERR.NUM;
  return makeMat(R, C, (i, j) => a + (i * C + j) * d);
}, { min: 1, max: 4 });
def('RANDARRAY', ([r, c, lo, hi, int], ctx) => {
  const R = r === undefined ? 1 : Math.trunc(num(S(ctx, r))); const C = c === undefined ? 1 : Math.trunc(num(S(ctx, c)));
  const a = lo === undefined ? 0 : num(S(ctx, lo)); const b = hi === undefined ? 1 : num(S(ctx, hi)); const I = int !== undefined && bool(S(ctx, int));
  return makeMat(R, C, () => (I ? Math.floor(a) + Math.floor(Math.random() * (Math.floor(b) - Math.ceil(a) + 1)) : a + Math.random() * (b - a)));
}, { min: 0, max: 5 });
def('VSTACK', (args, ctx) => {
  const ms = args.map((a) => mx(ctx, a)); const C = Math.max(...ms.map((m) => (m[0] ? m[0].length : 0)));
  return ms.flatMap((m) => m.map((r) => Array.from({ length: C }, (_, j) => (j < r.length ? r[j] : ERR.NA))));
}, { min: 1 });
def('HSTACK', (args, ctx) => {
  const ms = args.map((a) => mx(ctx, a)); const R = Math.max(...ms.map((m) => m.length));
  return Array.from({ length: R }, (_, i) => ms.flatMap((m) => (i < m.length ? m[i] : Array(m[0].length).fill(ERR.NA))));
}, { min: 1 });
const ignoreOpt = (v, ctx) => (v === undefined ? 0 : Math.trunc(num(S(ctx, v))));
const toVec = (A, ign, byCol) => {
  const out = [];
  const R = A.length; const C = R ? A[0].length : 0;
  const push = (v) => { if ((ign === 1 || ign === 3) && (v === null || v === '')) return; if ((ign === 2 || ign === 3) && v instanceof SErr) return; out.push(v); };
  if (byCol) for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) push(A[i][j]); else for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) push(A[i][j]);
  if (!out.length) throw ERR.CALC; return out;
};
def(['TOCOL', 'FLATTEN'], ([a, ign, sc], ctx) => toVec(mx(ctx, a), ignoreOpt(ign, ctx), sc !== undefined && bool(S(ctx, sc))).map((v) => [v]), { min: 1, max: 3 });
def('TOROW', ([a, ign, sc], ctx) => [toVec(mx(ctx, a), ignoreOpt(ign, ctx), sc !== undefined && bool(S(ctx, sc)))], { min: 1, max: 3 });
def('CHOOSECOLS', ([a, ...cs], ctx) => { const A = mx(ctx, a); const idx = flatten(ctx, cs).map((x) => Math.trunc(num(x))); return A.map((r) => idx.map((k) => { const j = k < 0 ? r.length + k : k - 1; if (j < 0 || j >= r.length) throw ERR.VALUE; return r[j]; })); }, { min: 2 });
def('CHOOSEROWS', ([a, ...rs], ctx) => { const A = mx(ctx, a); return flatten(ctx, rs).map((x) => { const k = Math.trunc(num(x)); const i = k < 0 ? A.length + k : k - 1; if (i < 0 || i >= A.length) throw ERR.VALUE; return A[i]; }); }, { min: 2 });
def('TAKE', ([a, r, c], ctx) => {
  let A = mx(ctx, a); const R = r === undefined || r === null ? null : Math.trunc(num(S(ctx, r))); const C = c === undefined || c === null ? null : Math.trunc(num(S(ctx, c)));
  if (R !== null) A = R >= 0 ? A.slice(0, R) : A.slice(R);
  if (C !== null) A = A.map((row) => (C >= 0 ? row.slice(0, C) : row.slice(C)));
  if (!A.length || !A[0].length) throw ERR.CALC; return A;
}, { min: 2, max: 3 });
def('DROP', ([a, r, c], ctx) => {
  let A = mx(ctx, a); const R = r === undefined || r === null ? 0 : Math.trunc(num(S(ctx, r))); const C = c === undefined || c === null ? 0 : Math.trunc(num(S(ctx, c)));
  A = R >= 0 ? A.slice(R) : A.slice(0, A.length + R);
  A = A.map((row) => (C >= 0 ? row.slice(C) : row.slice(0, row.length + C)));
  if (!A.length || !A[0].length) throw ERR.CALC; return A;
}, { min: 2, max: 3 });
def('EXPAND', ([a, r, c, pad], ctx) => {
  const A = mx(ctx, a); const [R0, C0] = matDims(A); const R = r === undefined || r === null ? R0 : Math.trunc(num(S(ctx, r))); const C = c === undefined || c === null ? C0 : Math.trunc(num(S(ctx, c)));
  if (R < R0 || C < C0) throw ERR.VALUE; const pv = pad === undefined ? ERR.NA : ctx.api.deref(pad);
  return makeMat(R, C, (i, j) => (i < R0 && j < C0 ? A[i][j] : pv));
}, { min: 2, max: 4 });
const wrap = (byRow) => ([a, n, pad], ctx) => {
  const v = flatten(ctx, [a]); const k = Math.trunc(num(S(ctx, n))); if (k < 1) throw ERR.VALUE; const pv = pad === undefined ? ERR.NA : ctx.api.deref(pad);
  const groups = Math.ceil(v.length / k);
  const g = (i) => Array.from({ length: k }, (_, j) => (i * k + j < v.length ? v[i * k + j] : pv));
  return byRow ? Array.from({ length: groups }, (_, i) => g(i)) : transposeMat(Array.from({ length: groups }, (_, i) => g(i)));
};
def('WRAPROWS', wrap(true), { min: 2, max: 3 }); def('WRAPCOLS', wrap(false), { min: 2, max: 3 });
