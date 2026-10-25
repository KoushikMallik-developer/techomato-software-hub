import { def } from './registry.js';
import { ERR, SErr, bool, flatten, num, S } from './fnhelp.js';
import { ymdFromSerial } from './dates.js';

const N = (a) => num(a ?? 0);
const L = (min, max) => ({ min, max, lift: true });
const pmt = (r, n, pv, fv, t) => { if (r === 0) return -(pv + fv) / n; const f = Math.pow(1 + r, n); return -(r * (pv * f + fv)) / ((1 + r * t) * (f - 1)); };
const fv = (r, n, p, pv, t) => (r === 0 ? -(pv + p * n) : -(pv * Math.pow(1 + r, n) + (p * (1 + r * t) * (Math.pow(1 + r, n) - 1)) / r));
const pv = (r, n, p, f, t) => (r === 0 ? -(f + p * n) : -(f + (p * (1 + r * t) * (Math.pow(1 + r, n) - 1)) / r) / Math.pow(1 + r, n));
def('PMT', ([r, n, p, f, t]) => pmt(num(r), num(n), num(p), N(f), N(t) ? 1 : 0), L(3, 5));
def('FV', ([r, n, p, v, t]) => fv(num(r), num(n), num(p), N(v), N(t) ? 1 : 0), L(3, 5));
def('PV', ([r, n, p, f, t]) => pv(num(r), num(n), num(p), N(f), N(t) ? 1 : 0), L(3, 5));
def('NPER', ([r, p, pvv, f, t]) => {
  const R = num(r); const P = num(p); const PV = num(pvv); const F = N(f); const T = N(t) ? 1 : 0;
  if (R === 0) { if (P === 0) throw ERR.NUM; return -(PV + F) / P; }
  const a = P * (1 + R * T) - F * R; const b = P * (1 + R * T) + PV * R;
  if (a / b <= 0) throw ERR.NUM; return Math.log(a / b) / Math.log(1 + R);
}, L(3, 5));
def('IPMT', ([r, per, n, p, f, t]) => { const R = num(r); const k = num(per); const T = N(t) ? 1 : 0; if (k < 1 || k > num(n)) throw ERR.NUM; const pay = pmt(R, num(n), num(p), N(f), T); if (T === 1) return k === 1 ? 0 : fv(R, k - 2, pay, num(p), 1) * R; return fv(R, k - 1, pay, num(p), 0) * R; }, L(4, 6));
def('PPMT', ([r, per, n, p, f, t]) => { const R = num(r); const k = num(per); const T = N(t) ? 1 : 0; const nn = num(n); if (k < 1 || k > nn) throw ERR.NUM; const pay = pmt(R, nn, num(p), N(f), T); const ip = T === 1 ? (k === 1 ? 0 : fv(R, k - 2, pay, num(p), 1) * R) : fv(R, k - 1, pay, num(p), 0) * R; return pay - ip; }, L(4, 6));
def('CUMIPMT', ([r, n, p, s, e, t], ctx) => { const R = num(r); const nn = num(n); const P = num(p); const T = num(t) ? 1 : 0; const pay = pmt(R, nn, P, 0, T); let tot = 0; for (let k = Math.trunc(num(s)); k <= Math.trunc(num(e)); k++) tot += T === 1 ? (k === 1 ? 0 : fv(R, k - 2, pay, P, 1) * R) : fv(R, k - 1, pay, P, 0) * R; return tot; }, L(6, 6));
def('CUMPRINC', ([r, n, p, s, e, t]) => { const R = num(r); const nn = num(n); const P = num(p); const T = num(t) ? 1 : 0; const pay = pmt(R, nn, P, 0, T); let tot = 0; for (let k = Math.trunc(num(s)); k <= Math.trunc(num(e)); k++) tot += pay - (T === 1 ? (k === 1 ? 0 : fv(R, k - 2, pay, P, 1) * R) : fv(R, k - 1, pay, P, 0) * R); return tot; }, L(6, 6));
def('ISPMT', ([r, per, n, p]) => -num(p) * num(r) * (1 - num(per) / num(n)), L(4, 4));
def('RATE', ([n, p, pvv, f, t, g]) => {
  const nn = num(n); const P = num(p); const PV = num(pvv); const F = N(f); const T = N(t) ? 1 : 0; let r = g === undefined ? 0.1 : num(g);
  const fn = (x) => (x === 0 ? PV + P * nn + F : PV * Math.pow(1 + x, nn) + (P * (1 + x * T) * (Math.pow(1 + x, nn) - 1)) / x + F);
  for (let i = 0; i < 100; i++) { const y = fn(r); const h = 1e-7; const d = (fn(r + h) - y) / h; if (d === 0) break; const nr = r - y / d; if (Math.abs(nr - r) < 1e-12) return nr; r = nr; }
  if (Math.abs(fn(r)) < 1e-6) return r; throw ERR.NUM;
}, L(3, 6));
const cashflows = (ctx, a) => flatten(ctx, [a]).map((v) => { if (v instanceof SErr) throw v; return typeof v === 'number' ? v : null; }).filter((v) => v !== null);
def('NPV', ([r, ...vals], ctx) => { const R = num(S(ctx, r)); return flatten(ctx, vals).filter((v) => typeof v === 'number').reduce((s, v, i) => s + v / Math.pow(1 + R, i + 1), 0); }, { min: 2 });
def('IRR', ([vals, g], ctx) => {
  const cf = cashflows(ctx, vals); if (!cf.some((v) => v > 0) || !cf.some((v) => v < 0)) throw ERR.NUM;
  const f = (r) => cf.reduce((s, v, i) => s + v / Math.pow(1 + r, i), 0);
  let r = g === undefined ? 0.1 : num(S(ctx, g));
  for (let i = 0; i < 200; i++) { const y = f(r); const h = 1e-7; const d = (f(r + h) - y) / h; if (!d) break; const nr = r - y / d; if (nr <= -1) { r = (r - 1) / 2; continue; } if (Math.abs(nr - r) < 1e-12) return nr; r = nr; }
  if (Math.abs(f(r)) < 1e-6) return r; throw ERR.NUM;
}, { min: 1, max: 2 });
def('MIRR', ([vals, fr, rr], ctx) => {
  const cf = cashflows(ctx, vals); const F = num(S(ctx, fr)); const R = num(S(ctx, rr)); const n = cf.length;
  const pos = cf.reduce((s, v, i) => s + (v > 0 ? v * Math.pow(1 + R, n - 1 - i) : 0), 0); const neg = cf.reduce((s, v, i) => s + (v < 0 ? v / Math.pow(1 + F, i) : 0), 0);
  if (!pos || !neg) throw ERR.DIV0; return Math.pow(pos / -neg, 1 / (n - 1)) - 1;
}, { min: 3, max: 3 });
const xcf = (ctx, vals, dates) => { const v = flatten(ctx, [vals]).map(num); const d = flatten(ctx, [dates]).map((x) => Math.floor(num(x))); if (v.length !== d.length) throw ERR.NUM; return [v, d]; };
def('XNPV', ([r, vals, dates], ctx) => { const R = num(S(ctx, r)); const [v, d] = xcf(ctx, vals, dates); return v.reduce((s, x, i) => s + x / Math.pow(1 + R, (d[i] - d[0]) / 365), 0); }, { min: 3, max: 3 });
def('XIRR', ([vals, dates, g], ctx) => {
  const [v, d] = xcf(ctx, vals, dates); if (!v.some((x) => x > 0) || !v.some((x) => x < 0)) throw ERR.NUM;
  const f = (r) => v.reduce((s, x, i) => s + x / Math.pow(1 + r, (d[i] - d[0]) / 365), 0);
  let r = g === undefined ? 0.1 : num(S(ctx, g));
  for (let i = 0; i < 200; i++) { const y = f(r); const h = 1e-7; const dd = (f(r + h) - y) / h; if (!dd) break; let nr = r - y / dd; if (nr <= -1) nr = (r - 1) / 2; if (Math.abs(nr - r) < 1e-12) return nr; r = nr; }
  if (Math.abs(f(r)) < 1e-5) return r; throw ERR.NUM;
}, { min: 2, max: 3 });
def('SLN', ([c, s, l]) => { const life = num(l); if (life === 0) throw ERR.DIV0; return (num(c) - num(s)) / life; }, L(3, 3));
def('SYD', ([c, s, l, p]) => { const life = num(l); const per = num(p); return ((num(c) - num(s)) * (life - per + 1) * 2) / (life * (life + 1)); }, L(4, 4));
def('DB', ([c, s, l, p, m]) => {
  const cost = num(c); const salv = num(s); const life = num(l); const per = Math.trunc(num(p)); const mo = m === undefined ? 12 : num(m);
  const rate = Math.round((1 - Math.pow(salv / cost, 1 / life)) * 1000) / 1000; let total = 0; let dep = 0;
  for (let i = 1; i <= per; i++) { dep = i === 1 ? (cost * rate * mo) / 12 : i === life + 1 ? ((cost - total) * rate * (12 - mo)) / 12 : (cost - total) * rate; total += dep; }
  return dep;
}, L(4, 5));
def('DDB', ([c, s, l, p, f]) => {
  const cost = num(c); const salv = num(s); const life = num(l); const per = num(p); const factor = f === undefined ? 2 : num(f); let book = cost; let dep = 0;
  for (let i = 1; i <= per; i++) { dep = Math.min((book * factor) / life, Math.max(0, book - salv)); book -= dep; }
  return dep;
}, L(4, 5));
def('EFFECT', ([r, n]) => Math.pow(1 + num(r) / Math.trunc(num(n)), Math.trunc(num(n))) - 1, L(2, 2));
def('NOMINAL', ([r, n]) => { const k = Math.trunc(num(n)); return k * (Math.pow(1 + num(r), 1 / k) - 1); }, L(2, 2));
def('RRI', ([n, p, f]) => Math.pow(num(f) / num(p), 1 / num(n)) - 1, L(3, 3));
def('PDURATION', ([r, p, f]) => Math.log(num(f) / num(p)) / Math.log(1 + num(r)), L(3, 3));
def('FVSCHEDULE', ([p, sch], ctx) => flatten(ctx, [sch]).reduce((a, r) => a * (1 + num(r)), num(S(ctx, p))), { min: 2, max: 2 });
def('DOLLARDE', ([d, f]) => { const fr = Math.trunc(num(f)); const v = num(d); const i = Math.trunc(v); return i + ((v - i) * 100) / fr; }, L(2, 2));
def('DOLLARFR', ([d, f]) => { const fr = Math.trunc(num(f)); const v = num(d); const i = Math.trunc(v); return i + ((v - i) * fr) / 100; }, L(2, 2));
