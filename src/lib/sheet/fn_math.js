import { def, FUNCS } from './registry.js';
import { ERR, SErr, bool, collectNums, flatten, isMat, isRef, makeCriteria, num, roundTo, S, shaped, str, hiddenRow } from './fnhelp.js';
import { matDims, makeMat, transposeMat } from './fnutil.js';

const u1 = (names, f) => def(names, ([x]) => f(num(x)), { min: 1, max: 1, lift: true });
const chk = (v) => { if (!Number.isFinite(v)) throw ERR.NUM; return v; };

u1('ABS', Math.abs);
u1('SIGN', Math.sign);
u1('SQRT', (x) => { if (x < 0) throw ERR.NUM; return Math.sqrt(x); });
u1('SQRTPI', (x) => { if (x < 0) throw ERR.NUM; return Math.sqrt(x * Math.PI); });
u1('EXP', (x) => chk(Math.exp(x)));
u1('LN', (x) => { if (x <= 0) throw ERR.NUM; return Math.log(x); });
u1('LOG10', (x) => { if (x <= 0) throw ERR.NUM; return Math.log10(x); });
u1('INT', Math.floor);
u1('SIN', Math.sin); u1('COS', Math.cos); u1('TAN', Math.tan);
u1('ASIN', (x) => { if (Math.abs(x) > 1) throw ERR.NUM; return Math.asin(x); });
u1('ACOS', (x) => { if (Math.abs(x) > 1) throw ERR.NUM; return Math.acos(x); });
u1('ATAN', Math.atan); u1('SINH', Math.sinh); u1('COSH', Math.cosh); u1('TANH', Math.tanh);
u1('ASINH', Math.asinh);
u1('ACOSH', (x) => { if (x < 1) throw ERR.NUM; return Math.acosh(x); });
u1('ATANH', (x) => { if (Math.abs(x) >= 1) throw ERR.NUM; return Math.atanh(x); });
u1('SEC', (x) => 1 / Math.cos(x)); u1('CSC', (x) => 1 / Math.sin(x)); u1('COT', (x) => { if (x === 0) throw ERR.DIV0; return 1 / Math.tan(x); });
u1('DEGREES', (x) => (x * 180) / Math.PI);
u1('RADIANS', (x) => (x * Math.PI) / 180);
u1('EVEN', (x) => { const s = x < 0 ? -1 : 1; return s * 2 * Math.ceil(Math.abs(x) / 2); });
u1('ODD', (x) => { const s = x < 0 ? -1 : 1; const a = Math.ceil(Math.abs(x)); return s * (a % 2 === 0 ? a + 1 : a); });
u1('ISEVEN', (x) => Math.floor(Math.abs(x)) % 2 === 0);
u1('ISODD', (x) => Math.floor(Math.abs(x)) % 2 === 1);
const fact = (n) => { n = Math.floor(n); if (n < 0) throw ERR.NUM; if (n > 170) throw ERR.NUM; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
u1('FACT', fact);
u1('FACTDOUBLE', (n) => { n = Math.floor(n); if (n < -1) throw ERR.NUM; let r = 1; for (let i = n; i > 1; i -= 2) r *= i; return r; });
def('PI', () => Math.PI, { max: 0 });
def('LOG', ([x, b]) => { const X = num(x); const B = b === undefined ? 10 : num(b); if (X <= 0 || B <= 0 || B === 1) throw ERR.NUM; return Math.log(X) / Math.log(B); }, { min: 1, max: 2, lift: true });
def('POWER', ([a, b]) => { const x = num(a); const y = num(b); if (x === 0 && y === 0) throw ERR.NUM; return chk(Math.pow(x, y)); }, { min: 2, max: 2, lift: true });
def('ATAN2', ([a, b]) => { const x = num(a); const y = num(b); if (x === 0 && y === 0) throw ERR.DIV0; return Math.atan2(y, x); }, { min: 2, max: 2, lift: true });
def('MOD', ([a, b]) => { const x = num(a); const d = num(b); if (d === 0) throw ERR.DIV0; return x - d * Math.floor(x / d); }, { min: 2, max: 2, lift: true });
def('QUOTIENT', ([a, b]) => { const d = num(b); if (d === 0) throw ERR.DIV0; return Math.trunc(num(a) / d); }, { min: 2, max: 2, lift: true });
def('TRUNC', ([x, d]) => { const k = d === undefined ? 0 : Math.trunc(num(d)); const m = Math.pow(10, k); return Math.trunc(roundTo(num(x) * m, 8)) / m; }, { min: 1, max: 2, lift: true });
def('ROUND', ([x, d]) => roundTo(num(x), Math.trunc(d === undefined ? 0 : num(d))), { min: 1, max: 2, lift: true });
def('ROUNDUP', ([x, d]) => { const k = Math.trunc(num(d ?? 0)); const m = Math.pow(10, k); const v = num(x); return (Math.sign(v) * Math.ceil(roundTo(Math.abs(v) * m, 9))) / m; }, { min: 1, max: 2, lift: true });
def('ROUNDDOWN', ([x, d]) => { const k = Math.trunc(num(d ?? 0)); const m = Math.pow(10, k); const v = num(x); return (Math.sign(v) * Math.floor(roundTo(Math.abs(v) * m, 9))) / m; }, { min: 1, max: 2, lift: true });
def('MROUND', ([x, m]) => { const v = num(x); const k = num(m); if (k === 0) return 0; if (v * k < 0) throw ERR.NUM; return roundTo(v / k, 0) * k; }, { min: 2, max: 2, lift: true });
def(['CEILING', 'CEILING.PRECISE', 'ISO.CEILING'], ([x, s]) => { const v = num(x); let k = s === undefined ? 1 : Math.abs(num(s)); if (k === 0) return 0; return Math.ceil(roundTo(v / k, 9)) * k; }, { min: 1, max: 2, lift: true });
def('CEILING.MATH', ([x, s, mode]) => { const v = num(x); const k = s === undefined || num(s) === 0 ? 1 : Math.abs(num(s)); if (v < 0 && mode !== undefined && num(mode) !== 0) return -Math.ceil(roundTo(-v / k, 9)) * k; return Math.ceil(roundTo(v / k, 9)) * k; }, { min: 1, max: 3, lift: true });
def(['FLOOR', 'FLOOR.PRECISE'], ([x, s]) => { const v = num(x); const k = s === undefined ? 1 : Math.abs(num(s)); if (k === 0) throw ERR.DIV0; return Math.floor(roundTo(v / k, 9)) * k; }, { min: 1, max: 2, lift: true });
def('FLOOR.MATH', ([x, s, mode]) => { const v = num(x); const k = s === undefined || num(s) === 0 ? 1 : Math.abs(num(s)); if (v < 0 && mode !== undefined && num(mode) !== 0) return -Math.floor(roundTo(-v / k, 9)) * k; return Math.floor(roundTo(v / k, 9)) * k; }, { min: 1, max: 3, lift: true });
def('COMBIN', ([n, k]) => { const N = Math.floor(num(n)); const K = Math.floor(num(k)); if (N < 0 || K < 0 || K > N) throw ERR.NUM; let r = 1; for (let i = 1; i <= Math.min(K, N - K); i++) r = (r * (N - i + 1)) / i; return Math.round(r); }, { min: 2, max: 2, lift: true });
def('COMBINA', ([n, k]) => { const N = Math.floor(num(n)); const K = Math.floor(num(k)); if (N < 0 || K < 0) throw ERR.NUM; const a = N + K - 1; const b = K; let r = 1; for (let i = 1; i <= Math.min(b, a - b); i++) r = (r * (a - i + 1)) / i; return Math.round(r); }, { min: 2, max: 2, lift: true });
def('PERMUT', ([n, k]) => { const N = Math.floor(num(n)); const K = Math.floor(num(k)); if (N < 0 || K < 0 || K > N) throw ERR.NUM; let r = 1; for (let i = 0; i < K; i++) r *= N - i; return r; }, { min: 2, max: 2, lift: true });
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
def('GCD', (args, ctx) => collectNums(ctx, args).reduce((a, b) => { if (b < 0) throw ERR.NUM; return gcd(a, Math.floor(b)); }, 0), { min: 1 });
def('LCM', (args, ctx) => collectNums(ctx, args).reduce((a, b) => { if (b < 0) throw ERR.NUM; b = Math.floor(b); return a === 0 || b === 0 ? 0 : (a * b) / gcd(a, b); }, 1), { min: 1 });
def('MULTINOMIAL', (args, ctx) => { const n = collectNums(ctx, args); const tot = n.reduce((a, b) => a + b, 0); return fact(tot) / n.reduce((a, b) => a * fact(b), 1); }, { min: 1 });
def('N', ([x], ctx) => { const v = S(ctx, x); return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; }, { min: 1, max: 1 });

/* ---- aggregates ---- */
def('SUM', (args, ctx) => collectNums(ctx, args).reduce((a, b) => a + b, 0), { min: 1 });
def('PRODUCT', (args, ctx) => collectNums(ctx, args).reduce((a, b) => a * b, 1), { min: 1 });
def('SUMSQ', (args, ctx) => collectNums(ctx, args).reduce((a, b) => a + b * b, 0), { min: 1 });
const pairs = (ctx, a, b) => {
  const A = ctx.api.toMatrix(a); const [R, C] = matDims(A); const B = shaped(ctx, b, R, C);
  if (isMat(b) || isRef(b)) { const [br, bc] = matDims(ctx.api.toMatrix(b)); if (br !== R || bc !== C) throw ERR.VALUE; }
  const out = [];
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { if (A[i][j] instanceof SErr) throw A[i][j]; if (B[i][j] instanceof SErr) throw B[i][j]; out.push([A[i][j], B[i][j]]); }
  return out;
};
const numOr0 = (v) => (typeof v === 'number' ? v : 0);
def('SUMX2MY2', ([a, b], ctx) => pairs(ctx, a, b).reduce((s, [x, y]) => s + numOr0(x) ** 2 - numOr0(y) ** 2, 0), { min: 2, max: 2 });
def('SUMX2PY2', ([a, b], ctx) => pairs(ctx, a, b).reduce((s, [x, y]) => s + numOr0(x) ** 2 + numOr0(y) ** 2, 0), { min: 2, max: 2 });
def('SUMXMY2', ([a, b], ctx) => pairs(ctx, a, b).reduce((s, [x, y]) => s + (numOr0(x) - numOr0(y)) ** 2, 0), { min: 2, max: 2 });
def('SUMPRODUCT', (args, ctx) => {
  const ms = args.map((a) => ctx.api.toMatrix(ctx.api.deref(a) instanceof Array || isRef(a) ? a : [[a]]));
  const [R, C] = matDims(ms[0]);
  for (const m of ms) { const [r, c] = matDims(m); if (r !== R || c !== C) throw ERR.VALUE; }
  let s = 0;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
    let p = 1;
    for (const m of ms) { const v = m[i][j]; if (v instanceof SErr) throw v; p *= typeof v === 'number' ? v : typeof v === 'boolean' ? 0 : 0; }
    s += p;
  }
  return s;
}, { min: 1 });

/* criteria aggregation helpers (shared with stats) */
export function criteriaRows(ctx, pairsArgs) {
  // pairsArgs: [range, crit, range, crit ...]; returns {R,C,ok: Boolean[][]}
  let R = 0; let C = 0; const mats = []; const tests = [];
  for (let i = 0; i < pairsArgs.length; i += 2) {
    const m = ctx.api.toMatrix(pairsArgs[i]);
    const [r, c] = matDims(m);
    if (i === 0) { R = r; C = c; } else if (r !== R || c !== C) {
      // ranges must match in size; allow clamped ranges by padding
      const ref = pairsArgs[i];
      if (isRef(ref)) { mats.push(shaped(ctx, ref, R, C)); tests.push(makeCrit(ctx, pairsArgs[i + 1])); continue; }
      throw ERR.VALUE;
    }
    mats.push(m);
    tests.push(makeCrit(ctx, pairsArgs[i + 1]));
  }
  const ok = makeMat(R, C, (r, c) => mats.every((m, k) => tests[k](m[r][c])));
  return { R, C, ok };
}
const makeCrit = (ctx, c) => makeCriteria(ctx.api.scalar(c));
const sumRange = (ctx, ref, R, C) => shaped(ctx, ref, R, C);
def('SUMIF', ([rng, crit, sr], ctx) => {
  const { R, C, ok } = criteriaRows(ctx, [rng, crit]);
  const vals = sr === undefined ? ctx.api.toMatrix(rng) : sumRange(ctx, sr, R, C);
  let s = 0;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (ok[i][j]) { const v = vals[i][j]; if (v instanceof SErr) throw v; if (typeof v === 'number') s += v; }
  return s;
}, { min: 2, max: 3 });
def('SUMIFS', ([sr, ...rest], ctx) => {
  if (rest.length < 2 || rest.length % 2) throw ERR.VALUE;
  const { R, C, ok } = criteriaRows(ctx, rest);
  const vals = sumRange(ctx, sr, R, C);
  let s = 0;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (ok[i][j]) { const v = vals[i][j]; if (v instanceof SErr) throw v; if (typeof v === 'number') s += v; }
  return s;
}, { min: 3 });
def('COUNTIF', ([rng, crit], ctx) => {
  const { R, C, ok } = criteriaRows(ctx, [rng, crit]);
  let n = 0; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (ok[i][j]) n++;
  return n;
}, { min: 2, max: 2 });
def('COUNTIFS', (args, ctx) => {
  if (args.length % 2) throw ERR.VALUE;
  const { R, C, ok } = criteriaRows(ctx, args);
  let n = 0; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (ok[i][j]) n++;
  return n;
}, { min: 2 });

/* ---- random ---- */
def('RAND', () => Math.random(), { max: 0 });
def('RANDBETWEEN', ([a, b]) => { const lo = Math.ceil(num(a)); const hi = Math.floor(num(b)); if (lo > hi) throw ERR.NUM; return lo + Math.floor(Math.random() * (hi - lo + 1)); }, { min: 2, max: 2, lift: true });

/* ---- number systems ---- */
const ROMANS = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
def('ROMAN', ([n]) => { let v = Math.floor(num(n)); if (v < 0 || v > 3999) throw ERR.VALUE; if (v === 0) return ''; let s = ''; for (const [k, r] of ROMANS) while (v >= k) { s += r; v -= k; } return s; }, { min: 1, max: 2, lift: true });
def('ARABIC', ([t]) => { const s = str(t).toUpperCase().trim(); if (!/^[MDCLXVI]*$/.test(s)) throw ERR.VALUE; let tot = 0; const val = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 }; for (let i = 0; i < s.length; i++) { const a = val[s[i]]; const b = val[s[i + 1]] || 0; tot += a < b ? -a : a; } return tot; }, { min: 1, max: 1, lift: true });
def('BASE', ([n, r, m]) => { const v = Math.floor(num(n)); const radix = Math.floor(num(r)); if (v < 0 || radix < 2 || radix > 36) throw ERR.NUM; let s = v.toString(radix).toUpperCase(); if (m !== undefined) s = s.padStart(num(m), '0'); return s; }, { min: 2, max: 3, lift: true });
def('DECIMAL', ([t, r]) => { const radix = Math.floor(num(r)); const s = str(t).trim(); if (radix < 2 || radix > 36) throw ERR.NUM; const v = parseInt(s, radix); if (Number.isNaN(v) || s.toLowerCase().split('').some((ch) => parseInt(ch, 36) >= radix)) throw ERR.NUM; return v; }, { min: 2, max: 2, lift: true });
const radixConv = (name, from, to, bits) => def(name, ([x, places]) => {
  const s = str(x).trim().toUpperCase();
  if (from === 2 && !/^[01]{1,10}$/.test(s) || from === 8 && !/^[0-7]{1,10}$/.test(s) || from === 16 && !/^[0-9A-F]{1,10}$/.test(s)) throw ERR.NUM;
  let v = parseInt(s, from);
  const full = Math.pow(2, bits);
  if (v >= full / 2 && s.length === 10) v -= full;
  if (to === 10) return v;
  let out = (v < 0 ? v + full : v).toString(to).toUpperCase();
  if (places !== undefined && v >= 0) out = out.padStart(num(places), '0');
  return out;
}, { min: 1, max: places2(name), lift: true });
function places2(n) { return /2DEC|8DEC|HEX2DEC/.test(n) || /^(BIN|OCT|HEX)2DEC$/.test(n) ? 1 : 2; }
radixConv('BIN2DEC', 2, 10, 10); radixConv('OCT2DEC', 8, 10, 30); radixConv('HEX2DEC', 16, 10, 40);
radixConv('DEC2BIN', 10, 2, 10); radixConv('DEC2HEX', 10, 16, 40); radixConv('DEC2OCT', 10, 8, 30);
radixConv('BIN2HEX', 2, 16, 10); radixConv('BIN2OCT', 2, 8, 10); radixConv('HEX2BIN', 16, 2, 40); radixConv('HEX2OCT', 16, 8, 40); radixConv('OCT2BIN', 8, 2, 30); radixConv('OCT2HEX', 8, 16, 30);
// DEC2* take decimal numbers rather than text
for (const [nm, radix] of [['DEC2BIN', 2], ['DEC2HEX', 16], ['DEC2OCT', 8]]) {
  def(nm, ([x, places]) => { const v = Math.trunc(num(x)); if (v < -512 * (radix === 2 ? 1 : 1e9) ) throw ERR.NUM; let out = (v < 0 ? v + Math.pow(2, radix === 2 ? 10 : radix === 16 ? 40 : 30) : v).toString(radix).toUpperCase(); if (places !== undefined && v >= 0) out = out.padStart(num(places), '0'); return out; }, { min: 1, max: 2, lift: true });
}
def('BITAND', ([a, b]) => Number(BigInt(Math.trunc(num(a))) & BigInt(Math.trunc(num(b)))), { min: 2, max: 2, lift: true });
def('BITOR', ([a, b]) => Number(BigInt(Math.trunc(num(a))) | BigInt(Math.trunc(num(b)))), { min: 2, max: 2, lift: true });
def('BITXOR', ([a, b]) => Number(BigInt(Math.trunc(num(a))) ^ BigInt(Math.trunc(num(b)))), { min: 2, max: 2, lift: true });
def('BITLSHIFT', ([a, b]) => Math.trunc(num(a)) * Math.pow(2, Math.trunc(num(b))), { min: 2, max: 2, lift: true });
def('BITRSHIFT', ([a, b]) => Math.floor(Math.trunc(num(a)) / Math.pow(2, Math.trunc(num(b)))), { min: 2, max: 2, lift: true });

def('SERIESSUM', ([x, n, m, coef], ctx) => { const X = num(x); const N = num(n); const M = num(m); return flatten(ctx, [coef]).reduce((s, c, i) => s + num(c) * Math.pow(X, N + i * M), 0); }, { min: 4, max: 4 });

/* ---- SUBTOTAL / AGGREGATE ---- */
const SUBT = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV.S', 8: 'STDEV.P', 9: 'SUM', 10: 'VAR.S', 11: 'VAR.P' };
function visibleArgs(ctx, args, skipHidden) {
  if (!skipHidden) return args;
  return args.map((a) => {
    if (!isRef(a)) return a;
    const rows = [];
    for (let r = a.r1; r <= a.r2; r++) {
      if (hiddenRow(ctx, a.si, r)) continue;
      const row = [];
      for (let c = a.c1; c <= a.c2; c++) row.push(ctx.api.value(a.si, r, c));
      rows.push(row);
    }
    return rows.length ? rows : [[null]];
  });
}
def('SUBTOTAL', ([fnum, ...refs], ctx) => {
  const code = Math.trunc(num(S(ctx, fnum)));
  const base = code > 100 ? code - 100 : code;
  const name = SUBT[base];
  if (!name || code < 1 || code > 111) throw ERR.VALUE;
  return FUNCS[name].fn(visibleArgs(ctx, refs, code > 100 || true), ctx);
}, { min: 2 });
const AGG = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV.S', 8: 'STDEV.P', 9: 'SUM', 10: 'VAR.S', 11: 'VAR.P', 12: 'MEDIAN', 13: 'MODE.SNGL', 14: 'LARGE', 15: 'SMALL', 16: 'PERCENTILE.INC', 17: 'QUARTILE.INC', 18: 'PERCENTILE.EXC', 19: 'QUARTILE.EXC' };
def('AGGREGATE', ([fnum, opt, ...rest], ctx) => {
  const f = AGG[Math.trunc(num(S(ctx, fnum)))];
  if (!f) throw ERR.VALUE;
  const o = Math.trunc(num(S(ctx, opt)));
  const ignoreErr = o === 2 || o === 3 || o === 6 || o === 7;
  const ignoreHidden = o === 1 || o === 3 || o === 5 || o === 7;
  const clean = (a) => {
    const m = ctx.api.toMatrix(a);
    return ignoreErr ? m.map((row) => row.map((v) => (v instanceof SErr ? null : v))) : m;
  };
  const rr = visibleArgs(ctx, rest, ignoreHidden).map((a) => (isRef(a) || isMat(a) ? clean(a) : a));
  return FUNCS[f].fn(rr, ctx);
}, { min: 3 });

/* ---- matrices ---- */
const toNumMat = (ctx, a) => ctx.api.toMatrix(a).map((r) => r.map((v) => num(v)));
def('MMULT', ([a, b], ctx) => {
  const A = toNumMat(ctx, a); const B = toNumMat(ctx, b);
  if (!A.length || A[0].length !== B.length) throw ERR.VALUE;
  return A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
}, { min: 2, max: 2 });
const det = (M) => {
  const n = M.length; const a = M.map((r) => [...r]); let d = 1;
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    if (Math.abs(a[p][i]) < 1e-14) return 0;
    if (p !== i) { [a[p], a[i]] = [a[i], a[p]]; d = -d; }
    d *= a[i][i];
    for (let r = i + 1; r < n; r++) { const f = a[r][i] / a[i][i]; for (let c = i; c < n; c++) a[r][c] -= f * a[i][c]; }
  }
  return d;
};
def('MDETERM', ([a], ctx) => { const M = toNumMat(ctx, a); if (!M.length || M.length !== M[0].length) throw ERR.VALUE; return det(M); }, { min: 1, max: 1 });
export function invert(M) {
  const n = M.length; const a = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    if (Math.abs(a[p][i]) < 1e-12) throw ERR.NUM;
    [a[p], a[i]] = [a[i], a[p]];
    const d = a[i][i]; for (let c = 0; c < 2 * n; c++) a[i][c] /= d;
    for (let r = 0; r < n; r++) if (r !== i) { const f = a[r][i]; if (f) for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[i][c]; }
  }
  return a.map((r) => r.slice(n));
}
def('MINVERSE', ([a], ctx) => { const M = toNumMat(ctx, a); if (!M.length || M.length !== M[0].length) throw ERR.VALUE; return invert(M); }, { min: 1, max: 1 });
def('MUNIT', ([n]) => { const k = Math.trunc(num(n)); if (k < 1) throw ERR.VALUE; return makeMat(k, k, (r, c) => (r === c ? 1 : 0)); }, { min: 1, max: 1 });
def('TRANSPOSE', ([a], ctx) => transposeMat(ctx.api.toMatrix(a)), { min: 1, max: 1 });
