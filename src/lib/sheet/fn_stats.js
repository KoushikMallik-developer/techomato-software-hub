import { def } from './registry.js';
import { ERR, SErr, collectNums, flatten, isMat, isRef, makeCriteria, num, S, shaped, str } from './fnhelp.js';
import { matDims, makeMat } from './fnutil.js';
import { criteriaRows } from './fn_math.js';

/* ---------- counting ---------- */
def('COUNT', (args, ctx) => {
  let n = 0;
  for (const a of args) {
    if (isRef(a) || isMat(a)) ctx.api.toMatrix(a).forEach((r) => r.forEach((v) => { if (typeof v === 'number') n++; }));
    else if (a !== null && a !== undefined) { try { num(a); if (typeof a !== 'object') n++; } catch { /* not numeric */ } }
  }
  return n;
}, { min: 1 });
def('COUNTA', (args, ctx) => {
  let n = 0;
  for (const a of args) {
    if (isRef(a) || isMat(a)) ctx.api.toMatrix(a).forEach((r) => r.forEach((v) => { if (v !== null && v !== undefined && v !== '') n++; }));
    else n++;
  }
  return n;
}, { min: 1 });
def('COUNTBLANK', ([a], ctx) => { let n = 0; ctx.api.toMatrix(a).forEach((r) => r.forEach((v) => { if (v === null || v === '') n++; })); if (isRef(a)) { const tot = a.rows * a.cols; const got = ctx.api.toMatrix(a).reduce((s, r) => s + r.length, 0); n += tot - got; } return n; }, { min: 1, max: 1 });

/* ---------- central tendency ---------- */
const nums = (ctx, args) => collectNums(ctx, args);
const avg = (a) => { if (!a.length) throw ERR.DIV0; return a.reduce((x, y) => x + y, 0) / a.length; };
def('AVERAGE', (args, ctx) => avg(nums(ctx, args)), { min: 1 });
def('AVERAGEA', (args, ctx) => avg(collectNums(ctx, args, { countBool: true, textAsZero: true })), { min: 1 });
def('MAX', (args, ctx) => { const a = nums(ctx, args); return a.length ? a.reduce((x, y) => (y > x ? y : x), -Infinity) : 0; }, { min: 1 });
def('MIN', (args, ctx) => { const a = nums(ctx, args); return a.length ? a.reduce((x, y) => (y < x ? y : x), Infinity) : 0; }, { min: 1 });
def('MAXA', (args, ctx) => { const a = collectNums(ctx, args, { countBool: true, textAsZero: true }); return a.length ? Math.max(...a) : 0; }, { min: 1 });
def('MINA', (args, ctx) => { const a = collectNums(ctx, args, { countBool: true, textAsZero: true }); return a.length ? Math.min(...a) : 0; }, { min: 1 });
const sorted = (a) => [...a].sort((x, y) => x - y);
const median = (a) => { if (!a.length) throw ERR.NUM; const s = sorted(a); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
def('MEDIAN', (args, ctx) => median(nums(ctx, args)), { min: 1 });
def(['MODE', 'MODE.SNGL'], (args, ctx) => {
  const a = nums(ctx, args); const cnt = new Map(); let best = null; let bc = 1;
  a.forEach((v) => cnt.set(v, (cnt.get(v) || 0) + 1));
  for (const v of a) { const c = cnt.get(v); if (c > bc) { bc = c; best = v; } }
  if (best === null) throw ERR.NA; return best;
}, { min: 1 });
def('MODE.MULT', (args, ctx) => {
  const a = nums(ctx, args); const cnt = new Map(); a.forEach((v) => cnt.set(v, (cnt.get(v) || 0) + 1));
  const mx = Math.max(0, ...cnt.values()); if (mx < 2) throw ERR.NA;
  return [...cnt.entries()].filter(([, c]) => c === mx).map(([v]) => [v]);
}, { min: 1 });
def('GEOMEAN', (args, ctx) => { const a = nums(ctx, args); if (!a.length || a.some((v) => v <= 0)) throw ERR.NUM; return Math.exp(a.reduce((s, v) => s + Math.log(v), 0) / a.length); }, { min: 1 });
def('HARMEAN', (args, ctx) => { const a = nums(ctx, args); if (!a.length || a.some((v) => v <= 0)) throw ERR.NUM; return a.length / a.reduce((s, v) => s + 1 / v, 0); }, { min: 1 });
def('TRIMMEAN', ([arr, p], ctx) => { const a = sorted(nums(ctx, [arr])); const pc = num(S(ctx, p)); if (pc < 0 || pc >= 1) throw ERR.NUM; const k = Math.floor((a.length * pc) / 2); return avg(a.slice(k, a.length - k)); }, { min: 2, max: 2 });

/* ---------- conditional aggregates ---------- */
const condAgg = (name, reducer, empty = 0) => def(name, ([avgR, ...rest], ctx) => {
  if (rest.length < 2 || rest.length % 2) throw ERR.VALUE;
  const { R, C, ok } = criteriaRows(ctx, rest);
  const vals = shaped(ctx, avgR, R, C); const sel = [];
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (ok[i][j]) { const v = vals[i][j]; if (v instanceof SErr) throw v; if (typeof v === 'number') sel.push(v); }
  return sel.length ? reducer(sel) : empty;
}, { min: 3 });
condAgg('AVERAGEIFS', (a) => avg(a), ERR.DIV0);
condAgg('MAXIFS', (a) => Math.max(...a)); condAgg('MINIFS', (a) => Math.min(...a));
def('AVERAGEIF', ([rng, crit, avgR], ctx) => {
  const { R, C, ok } = criteriaRows(ctx, [rng, crit]);
  const vals = avgR === undefined ? ctx.api.toMatrix(rng) : shaped(ctx, avgR, R, C); const sel = [];
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (ok[i][j]) { const v = vals[i][j]; if (v instanceof SErr) throw v; if (typeof v === 'number') sel.push(v); }
  return avg(sel);
}, { min: 2, max: 3 });
// criteria-aware empty results should throw DIV0 for AVERAGEIFS
const origAvgIfs = def; void origAvgIfs;

/* ---------- order stats ---------- */
const kth = (name, big) => def(name, ([arr, k], ctx) => {
  const a = sorted(nums(ctx, [arr])); const kk = Math.ceil(num(S(ctx, k)));
  if (kk < 1 || kk > a.length) throw ERR.NUM;
  return big ? a[a.length - kk] : a[kk - 1];
}, { min: 2, max: 2 });
kth('LARGE', true); kth('SMALL', false);
const pctInc = (s, p) => { const idx = p * (s.length - 1); const lo = Math.floor(idx); const hi = Math.ceil(idx); return s[lo] + (s[hi] - s[lo]) * (idx - lo); };
const pctExc = (s, p) => { const idx = p * (s.length + 1) - 1; if (idx < 0 || idx > s.length - 1) throw ERR.NUM; const lo = Math.floor(idx); const hi = Math.ceil(idx); return s[lo] + (s[hi] - s[lo]) * (idx - lo); };
def(['PERCENTILE', 'PERCENTILE.INC'], ([arr, p], ctx) => { const s = sorted(nums(ctx, [arr])); const pp = num(S(ctx, p)); if (!s.length || pp < 0 || pp > 1) throw ERR.NUM; return pctInc(s, pp); }, { min: 2, max: 2 });
def('PERCENTILE.EXC', ([arr, p], ctx) => { const s = sorted(nums(ctx, [arr])); return pctExc(s, num(S(ctx, p))); }, { min: 2, max: 2 });
def(['QUARTILE', 'QUARTILE.INC'], ([arr, q], ctx) => { const s = sorted(nums(ctx, [arr])); const qq = Math.trunc(num(S(ctx, q))); if (!s.length || qq < 0 || qq > 4) throw ERR.NUM; return pctInc(s, qq / 4); }, { min: 2, max: 2 });
def('QUARTILE.EXC', ([arr, q], ctx) => { const s = sorted(nums(ctx, [arr])); const qq = Math.trunc(num(S(ctx, q))); if (qq < 1 || qq > 3) throw ERR.NUM; return pctExc(s, qq / 4); }, { min: 2, max: 2 });
def(['PERCENTRANK', 'PERCENTRANK.INC'], ([arr, x, sig], ctx) => {
  const s = sorted(nums(ctx, [arr])); const X = num(S(ctx, x)); const d = sig === undefined ? 3 : Math.trunc(num(S(ctx, sig)));
  if (!s.length || X < s[0] || X > s[s.length - 1]) throw ERR.NA;
  let i = s.findIndex((v) => v >= X); let r;
  if (s[i] === X) r = i / (s.length - 1); else r = (i - 1 + (X - s[i - 1]) / (s[i] - s[i - 1])) / (s.length - 1);
  const m = Math.pow(10, d); return Math.floor(r * m) / m;
}, { min: 2, max: 3 });
const rankFn = (name, mode) => def(name, ([x, arr, order], ctx) => {
  const X = num(S(ctx, x)); const a = nums(ctx, [arr]); const asc = order !== undefined && num(S(ctx, order)) !== 0;
  if (!a.includes(X)) throw ERR.NA;
  const better = a.filter((v) => (asc ? v < X : v > X)).length; const same = a.filter((v) => v === X).length;
  return mode === 'avg' ? better + 1 + (same - 1) / 2 : better + 1;
}, { min: 2, max: 3 });
rankFn('RANK', 'eq'); rankFn('RANK.EQ', 'eq'); rankFn('RANK.AVG', 'avg');

/* ---------- dispersion ---------- */
const varS = (a) => { if (a.length < 2) throw ERR.DIV0; const m = avg(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
const varP = (a) => { if (!a.length) throw ERR.DIV0; const m = avg(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; };
def(['VAR', 'VAR.S'], (args, ctx) => varS(nums(ctx, args)), { min: 1 });
def(['VARP', 'VAR.P'], (args, ctx) => varP(nums(ctx, args)), { min: 1 });
def(['STDEV', 'STDEV.S'], (args, ctx) => Math.sqrt(varS(nums(ctx, args))), { min: 1 });
def(['STDEVP', 'STDEV.P'], (args, ctx) => Math.sqrt(varP(nums(ctx, args))), { min: 1 });
def('STDEVA', (args, ctx) => Math.sqrt(varS(collectNums(ctx, args, { countBool: true, textAsZero: true }))), { min: 1 });
def('VARA', (args, ctx) => varS(collectNums(ctx, args, { countBool: true, textAsZero: true })), { min: 1 });
def('DEVSQ', (args, ctx) => { const a = nums(ctx, args); const m = avg(a); return a.reduce((s, v) => s + (v - m) ** 2, 0); }, { min: 1 });
def('AVEDEV', (args, ctx) => { const a = nums(ctx, args); const m = avg(a); return a.reduce((s, v) => s + Math.abs(v - m), 0) / a.length; }, { min: 1 });
def('SKEW', (args, ctx) => { const a = nums(ctx, args); const n = a.length; if (n < 3) throw ERR.DIV0; const m = avg(a); const s = Math.sqrt(varS(a)); if (s === 0) throw ERR.DIV0; return (n / ((n - 1) * (n - 2))) * a.reduce((t, v) => t + ((v - m) / s) ** 3, 0); }, { min: 1 });
def('KURT', (args, ctx) => { const a = nums(ctx, args); const n = a.length; if (n < 4) throw ERR.DIV0; const m = avg(a); const s = Math.sqrt(varS(a)); if (s === 0) throw ERR.DIV0; return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * a.reduce((t, v) => t + ((v - m) / s) ** 4, 0) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)); }, { min: 1 });

/* ---------- regression / correlation ---------- */
function xyPairs(ctx, a, b) {
  const A = flatten(ctx, [a]); const B = flatten(ctx, [b]);
  if (A.length !== B.length) throw ERR.NA;
  const xs = []; const ys = [];
  A.forEach((x, i) => { const y = B[i]; if (x instanceof SErr) throw x; if (y instanceof SErr) throw y; if (typeof x === 'number' && typeof y === 'number') { xs.push(x); ys.push(y); } });
  if (!xs.length) throw ERR.DIV0;
  return [xs, ys];
}
const stats2 = (xs, ys) => {
  const n = xs.length; const mx = avg(xs); const my = avg(ys);
  let sxx = 0; let syy = 0; let sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  return { n, mx, my, sxx, syy, sxy };
};
def('CORREL', ([a, b], ctx) => { const s = stats2(...xyPairs(ctx, a, b)); if (!s.sxx || !s.syy) throw ERR.DIV0; return s.sxy / Math.sqrt(s.sxx * s.syy); }, { min: 2, max: 2 });
def('PEARSON', ([a, b], ctx) => { const s = stats2(...xyPairs(ctx, a, b)); if (!s.sxx || !s.syy) throw ERR.DIV0; return s.sxy / Math.sqrt(s.sxx * s.syy); }, { min: 2, max: 2 });
def('RSQ', ([a, b], ctx) => { const s = stats2(...xyPairs(ctx, b, a)); if (!s.sxx || !s.syy) throw ERR.DIV0; return (s.sxy * s.sxy) / (s.sxx * s.syy); }, { min: 2, max: 2 });
def(['COVAR', 'COVARIANCE.P'], ([a, b], ctx) => { const s = stats2(...xyPairs(ctx, a, b)); return s.sxy / s.n; }, { min: 2, max: 2 });
def('COVARIANCE.S', ([a, b], ctx) => { const s = stats2(...xyPairs(ctx, a, b)); if (s.n < 2) throw ERR.DIV0; return s.sxy / (s.n - 1); }, { min: 2, max: 2 });
def('SLOPE', ([y, x], ctx) => { const s = stats2(...xyPairs(ctx, x, y)); if (!s.sxx) throw ERR.DIV0; return s.sxy / s.sxx; }, { min: 2, max: 2 });
def('INTERCEPT', ([y, x], ctx) => { const s = stats2(...xyPairs(ctx, x, y)); if (!s.sxx) throw ERR.DIV0; return s.my - (s.sxy / s.sxx) * s.mx; }, { min: 2, max: 2 });
def('STEYX', ([y, x], ctx) => { const s = stats2(...xyPairs(ctx, x, y)); if (s.n < 3) throw ERR.DIV0; return Math.sqrt((s.syy - (s.sxy * s.sxy) / s.sxx) / (s.n - 2)); }, { min: 2, max: 2 });
def(['FORECAST', 'FORECAST.LINEAR'], ([x, y, kx], ctx) => {
  const s = stats2(...xyPairs(ctx, kx, y)); if (!s.sxx) throw ERR.DIV0;
  const b = s.sxy / s.sxx; const a = s.my - b * s.mx; return a + b * num(S(ctx, x));
}, { min: 3, max: 3, lift: [0] });
def('TREND', ([y, x, nx], ctx) => {
  const ys = flatten(ctx, [y]).map(num);
  const xs = x === undefined ? ys.map((_, i) => i + 1) : flatten(ctx, [x]).map(num);
  const s = stats2(xs, ys); const b = s.sxy / s.sxx; const a = s.my - b * s.mx;
  const pts = nx === undefined ? xs : flatten(ctx, [nx]).map(num);
  return pts.map((v) => [a + b * v]);
}, { min: 1, max: 4 });
def('LINEST', ([y, x, constArg, st], ctx) => {
  const ys = flatten(ctx, [y]).map(num);
  const xs = x === undefined ? ys.map((_, i) => i + 1) : flatten(ctx, [x]).map(num);
  const s = stats2(xs, ys); const b = s.sxy / s.sxx; const a = s.my - b * s.mx;
  const row1 = [b, a];
  if (st !== undefined && num(S(ctx, st))) {
    const se = Math.sqrt((s.syy - b * s.sxy) / (s.n - 2));
    return [row1, [se / Math.sqrt(s.sxx), se * Math.sqrt(1 / s.n + (s.mx * s.mx) / s.sxx)], [(b * s.sxy) / s.syy, se], [(b * s.sxy) / (s.syy - b * s.sxy) * (s.n - 2), s.n - 2], [b * s.sxy, s.syy - b * s.sxy]];
  }
  return [row1];
}, { min: 1, max: 4 });
def('GROWTH', ([y, x, nx], ctx) => {
  const ys = flatten(ctx, [y]).map((v) => Math.log(num(v)));
  const xs = x === undefined ? ys.map((_, i) => i + 1) : flatten(ctx, [x]).map(num);
  const s = stats2(xs, ys); const b = s.sxy / s.sxx; const a = s.my - b * s.mx;
  const pts = nx === undefined ? xs : flatten(ctx, [nx]).map(num);
  return pts.map((v) => [Math.exp(a + b * v)]);
}, { min: 1, max: 4 });
def('FREQUENCY', ([data, bins], ctx) => {
  const d = nums(ctx, [data]); const b = sorted(nums(ctx, [bins]));
  const out = Array(b.length + 1).fill(0);
  d.forEach((v) => { let i = b.findIndex((x) => v <= x); if (i < 0) i = b.length; out[i]++; });
  return out.map((v) => [v]);
}, { min: 2, max: 2 });

/* ---------- distributions ---------- */
export function erf(x) {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : -y;
}
function erfAcc(x) {
  const ax = Math.abs(x);
  if (ax < 3) { let sum = ax; let term = ax; for (let n = 1; n < 100; n++) { term *= (-ax * ax) / n; const d = term / (2 * n + 1); sum += d; if (Math.abs(d) < 1e-17) break; } const r = (2 / Math.sqrt(Math.PI)) * sum; return x < 0 ? -r : r; }
  let f = 0; for (let k = 60; k >= 1; k--) f = k / 2 / (ax + f);
  const erfc = Math.exp(-ax * ax) / Math.sqrt(Math.PI) / (ax + f);
  return x < 0 ? -(1 - erfc) : 1 - erfc;
}
export const normCdf = (z) => 0.5 * (1 + erfAcc(z / Math.SQRT2));
export const normPdf = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
export function normInv(p) {
  if (p <= 0 || p >= 1) throw ERR.NUM;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5; const r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  for (let i = 0; i < 2; i++) { const e = normCdf(x) - p; x -= e / normPdf(x); } // Newton polish
  return x;
}
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  x -= 1;
  const g = 7; const co = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let a = co[0]; const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += co[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function gammaP(a, x) { // regularized lower incomplete gamma
  if (x <= 0) return 0;
  if (x < a + 1) { let sum = 1 / a; let del = sum; for (let n = 1; n < 500; n++) { del *= x / (a + n); sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; } return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a)); }
  let b = x + 1 - a; let c = 1e300; let d = 1 / b; let h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}
function betaI(x, a, b) { // regularized incomplete beta
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (xx, aa, bb) => { let c = 1; let d = 1 - ((aa + bb) * xx) / (aa + 1); if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d; for (let m = 1; m < 300; m++) { const m2 = 2 * m; let an = (m * (bb - m) * xx) / ((aa + m2 - 1) * (aa + m2)); d = 1 + an * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c; an = (-(aa + m) * (aa + bb + m) * xx) / ((aa + m2) * (aa + m2 + 1)); d = 1 + an * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; } return h; };
  return x < (a + 1) / (a + b + 2) ? (bt * cf(x, a, b)) / a : 1 - (bt * cf(1 - x, b, a)) / b;
}
export const tCdf = (t, df) => { const x = df / (df + t * t); const p = 0.5 * betaI(x, df / 2, 0.5); return t > 0 ? 1 - p : p; };
function bisect(f, lo, hi, target) { for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(mid) < target) lo = mid; else hi = mid; } return (lo + hi) / 2; }
const N3 = (f, min, max = min) => (args, ctx) => f(args.map((a) => S(ctx, a)));
const L = { min: 1, max: 255, lift: true };
def('NORM.S.DIST', ([z, cum]) => (cum === undefined || bool1(cum) ? normCdf(num(z)) : normPdf(num(z))), { min: 1, max: 2, lift: true });
def('NORMSDIST', ([z]) => normCdf(num(z)), { min: 1, max: 1, lift: true });
def(['NORM.DIST', 'NORMDIST'], ([x, m, s, cum]) => { const sd = num(s); if (sd <= 0) throw ERR.NUM; const z = (num(x) - num(m)) / sd; return bool1(cum) ? normCdf(z) : normPdf(z) / sd; }, { min: 4, max: 4, lift: true });
def(['NORM.INV', 'NORMINV'], ([p, m, s]) => { const sd = num(s); if (sd <= 0) throw ERR.NUM; return num(m) + sd * normInv(num(p)); }, { min: 3, max: 3, lift: true });
def(['NORM.S.INV', 'NORMSINV'], ([p]) => normInv(num(p)), { min: 1, max: 1, lift: true });
def('STANDARDIZE', ([x, m, s]) => { const sd = num(s); if (sd <= 0) throw ERR.NUM; return (num(x) - num(m)) / sd; }, { min: 3, max: 3, lift: true });
def('GAUSS', ([z]) => normCdf(num(z)) - 0.5, { min: 1, max: 1, lift: true });
def('PHI', ([z]) => normPdf(num(z)), { min: 1, max: 1, lift: true });
def(['CONFIDENCE.NORM', 'CONFIDENCE'], ([a, s, n]) => { const al = num(a); const sd = num(s); const N = num(n); if (al <= 0 || al >= 1 || sd <= 0 || N < 1) throw ERR.NUM; return (-normInv(al / 2) * sd) / Math.sqrt(N); }, { min: 3, max: 3, lift: true });
function bool1(v) { if (typeof v === 'boolean') return v; return num(v) !== 0; }
def('T.DIST', ([x, df, cum]) => { const d = Math.floor(num(df)); if (d < 1) throw ERR.NUM; const t = num(x); if (bool1(cum)) return tCdf(t, d); return Math.exp(lnGamma((d + 1) / 2) - lnGamma(d / 2)) / Math.sqrt(d * Math.PI) * Math.pow(1 + (t * t) / d, -(d + 1) / 2); }, { min: 3, max: 3, lift: true });
def('T.DIST.RT', ([x, df]) => 1 - tCdf(num(x), Math.floor(num(df))), { min: 2, max: 2, lift: true });
def('T.DIST.2T', ([x, df]) => { const t = num(x); if (t < 0) throw ERR.NUM; return 2 * (1 - tCdf(t, Math.floor(num(df)))); }, { min: 2, max: 2, lift: true });
def(['T.INV', 'TINV_LEFT'], ([p, df]) => { const pp = num(p); const d = Math.floor(num(df)); if (pp <= 0 || pp >= 1 || d < 1) throw ERR.NUM; return bisect((x) => tCdf(x, d), -1e4, 1e4, pp); }, { min: 2, max: 2, lift: true });
def(['T.INV.2T', 'TINV'], ([p, df]) => { const pp = num(p); const d = Math.floor(num(df)); if (pp <= 0 || pp > 1 || d < 1) throw ERR.NUM; return bisect((x) => tCdf(x, d), 0, 1e4, 1 - pp / 2); }, { min: 2, max: 2, lift: true });
def('CHISQ.DIST', ([x, df, cum]) => { const v = num(x); const d = Math.floor(num(df)); if (v < 0 || d < 1) throw ERR.NUM; if (bool1(cum)) return gammaP(d / 2, v / 2); return Math.exp((d / 2 - 1) * Math.log(v) - v / 2 - (d / 2) * Math.log(2) - lnGamma(d / 2)); }, { min: 3, max: 3, lift: true });
def(['CHISQ.DIST.RT', 'CHIDIST'], ([x, df]) => 1 - gammaP(Math.floor(num(df)) / 2, num(x) / 2), { min: 2, max: 2, lift: true });
def(['CHISQ.INV', 'CHISQ.INV.RT', 'CHIINV'], ([p, df], ctx) => { const pp = num(p); const d = Math.floor(num(df)); if (pp <= 0 || pp >= 1 || d < 1) throw ERR.NUM; return bisect((x) => gammaP(d / 2, x / 2), 0, 1e4, 1 - pp); }, { min: 2, max: 2, lift: true });
def('F.DIST', ([x, d1, d2, cum]) => { const v = num(x); const a = num(d1); const b = num(d2); if (v < 0) throw ERR.NUM; if (!bool1(cum)) { return Math.exp(lnGamma((a + b) / 2) - lnGamma(a / 2) - lnGamma(b / 2) + (a / 2) * Math.log(a / b) + (a / 2 - 1) * Math.log(v) - ((a + b) / 2) * Math.log(1 + (a * v) / b)); } return betaI((a * v) / (a * v + b), a / 2, b / 2); }, { min: 4, max: 4, lift: true });
def(['F.DIST.RT', 'FDIST'], ([x, d1, d2]) => { const v = num(x); const a = num(d1); const b = num(d2); return 1 - betaI((a * v) / (a * v + b), a / 2, b / 2); }, { min: 3, max: 3, lift: true });
def('GAMMALN', ([x]) => { const v = num(x); if (v <= 0) throw ERR.NUM; return lnGamma(v); }, { min: 1, max: 1, lift: true });
def('GAMMA', ([x]) => { const v = num(x); if (v <= 0 && Number.isInteger(v)) throw ERR.NUM; return Math.exp(lnGamma(v)) * (v < 0 && Math.floor(-v) % 2 === 0 ? -1 : 1) * (v < 0.5 ? 1 : 1); }, { min: 1, max: 1, lift: true });
def('GAMMA.DIST', ([x, a, b, cum]) => { const v = num(x); const al = num(a); const be = num(b); if (bool1(cum)) return gammaP(al, v / be); return Math.exp((al - 1) * Math.log(v) - v / be - al * Math.log(be) - lnGamma(al)); }, { min: 4, max: 4, lift: true });
def('BINOM.DIST', ([k, n, p, cum]) => {
  const K = Math.floor(num(k)); const N = Math.floor(num(n)); const P = num(p);
  if (K < 0 || K > N || P < 0 || P > 1) throw ERR.NUM;
  const pm = (i) => Math.exp(lnGamma(N + 1) - lnGamma(i + 1) - lnGamma(N - i + 1) + (P === 0 ? (i === 0 ? 0 : -Infinity) : i * Math.log(P)) + (P === 1 ? (i === N ? 0 : -Infinity) : (N - i) * Math.log(1 - P)));
  if (!bool1(cum)) return pm(K);
  let s = 0; for (let i = 0; i <= K; i++) s += pm(i); return Math.min(1, s);
}, { min: 4, max: 4, lift: true });
def('BINOM.INV', ([n, p, a]) => { const N = Math.floor(num(n)); const P = num(p); const A = num(a); let s = 0; for (let i = 0; i <= N; i++) { s += Math.exp(lnGamma(N + 1) - lnGamma(i + 1) - lnGamma(N - i + 1) + i * Math.log(P) + (N - i) * Math.log(1 - P)); if (s >= A) return i; } return N; }, { min: 3, max: 3, lift: true });
def('POISSON.DIST', ([k, m, cum]) => { const K = Math.floor(num(k)); const M = num(m); if (K < 0 || M < 0) throw ERR.NUM; const pm = (i) => Math.exp(-M + i * Math.log(M || 1) - lnGamma(i + 1)); if (!bool1(cum)) return M === 0 ? (K === 0 ? 1 : 0) : pm(K); let s = 0; for (let i = 0; i <= K; i++) s += M === 0 ? (i === 0 ? 1 : 0) : pm(i); return Math.min(1, s); }, { min: 3, max: 3, lift: true });
def(['EXPON.DIST'], ([x, l, cum]) => { const v = num(x); const la = num(l); if (v < 0 || la <= 0) throw ERR.NUM; return bool1(cum) ? 1 - Math.exp(-la * v) : la * Math.exp(-la * v); }, { min: 3, max: 3, lift: true });
def('LOGNORM.DIST', ([x, m, s, cum]) => { const v = num(x); const sd = num(s); if (v <= 0 || sd <= 0) throw ERR.NUM; const z = (Math.log(v) - num(m)) / sd; return bool1(cum) ? normCdf(z) : normPdf(z) / (v * sd); }, { min: 4, max: 4, lift: true });
def('WEIBULL.DIST', ([x, a, b, cum]) => { const v = num(x); const al = num(a); const be = num(b); return bool1(cum) ? 1 - Math.exp(-Math.pow(v / be, al)) : (al / be) * Math.pow(v / be, al - 1) * Math.exp(-Math.pow(v / be, al)); }, { min: 4, max: 4, lift: true });
def('FISHER', ([x]) => { const v = num(x); if (Math.abs(v) >= 1) throw ERR.NUM; return Math.atanh(v); }, { min: 1, max: 1, lift: true });
def('FISHERINV', ([x]) => Math.tanh(num(x)), { min: 1, max: 1, lift: true });
def('ERF', ([a, b]) => (b === undefined ? erfAcc(num(a)) : erfAcc(num(b)) - erfAcc(num(a))), { min: 1, max: 2, lift: true });
def('ERFC', ([a]) => 1 - erfAcc(num(a)), { min: 1, max: 1, lift: true });
def('Z.TEST', ([arr, x, sg], ctx) => { const a = nums(ctx, [arr]); const X = num(S(ctx, x)); const sd = sg === undefined ? Math.sqrt(varS(a)) : num(S(ctx, sg)); return 1 - normCdf((avg(a) - X) / (sd / Math.sqrt(a.length))); }, { min: 2, max: 3 });
def('T.TEST', ([a, b, tails, type], ctx) => {
  const A = nums(ctx, [a]); const B = nums(ctx, [b]); const tl = num(S(ctx, tails)); const ty = num(S(ctx, type));
  let t; let df;
  if (ty === 1) { if (A.length !== B.length) throw ERR.NA; const d = A.map((v, i) => v - B[i]); t = avg(d) / Math.sqrt(varS(d) / d.length); df = d.length - 1; }
  else if (ty === 2) { df = A.length + B.length - 2; const sp = ((A.length - 1) * varS(A) + (B.length - 1) * varS(B)) / df; t = (avg(A) - avg(B)) / Math.sqrt(sp * (1 / A.length + 1 / B.length)); }
  else { const va = varS(A) / A.length; const vb = varS(B) / B.length; t = (avg(A) - avg(B)) / Math.sqrt(va + vb); df = (va + vb) ** 2 / (va ** 2 / (A.length - 1) + vb ** 2 / (B.length - 1)); }
  const p = 1 - tCdf(Math.abs(t), df); return tl === 1 ? p : 2 * p;
}, { min: 4, max: 4 });
def('PROB', ([xr, pr, lo, hi], ctx) => { const x = flatten(ctx, [xr]).map(num); const p = flatten(ctx, [pr]).map(num); const l = num(S(ctx, lo)); const h = hi === undefined ? l : num(S(ctx, hi)); return x.reduce((s, v, i) => s + (v >= l && v <= h ? p[i] : 0), 0); }, { min: 3, max: 4 });
