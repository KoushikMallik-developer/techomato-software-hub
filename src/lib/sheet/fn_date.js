import { def } from './registry.js';
import { ERR, SErr, bool, collectNums, flatten, num, S, str } from './fnhelp.js';
import { MONTHS, parseDateTime, serialFromDate, serialFromYMD, timeParts, ymdFromSerial } from './dates.js';
import { setDateParser } from './fnutil.js';

setDateParser(parseDateTime);
const L = (min, max) => ({ min, max, lift: true });
const dt = (v) => { const n = num(v); if (n < 0) throw ERR.NUM; return n; };
def('TODAY', (_, ctx) => Math.floor(serialFromDate(new Date(ctx.api.now))), { max: 0 });
def('NOW', (_, ctx) => serialFromDate(new Date(ctx.api.now)), { max: 0 });
def('DATE', ([y, m, d]) => {
  let Y = Math.trunc(num(y)); const M = Math.trunc(num(m)); const D = Math.trunc(num(d));
  if (Y < 0 || Y > 9999) throw ERR.NUM; if (Y < 1900) Y += 1900;
  const s = serialFromYMD(Y, M, D); if (s < 0) throw ERR.NUM; return s;
}, L(3, 3));
def('TIME', ([h, m, s]) => { const t = (Math.trunc(num(h)) * 3600 + Math.trunc(num(m)) * 60 + Math.trunc(num(s))); if (t < 0) throw ERR.NUM; return (t % 86400) / 86400; }, L(3, 3));
def('YEAR', ([v]) => ymdFromSerial(dt(v)).y, L(1, 1));
def('MONTH', ([v]) => ymdFromSerial(dt(v)).m, L(1, 1));
def('DAY', ([v]) => ymdFromSerial(dt(v)).d, L(1, 1));
def('HOUR', ([v]) => timeParts(dt(v)).h, L(1, 1));
def('MINUTE', ([v]) => timeParts(dt(v)).mi, L(1, 1));
def('SECOND', ([v]) => timeParts(dt(v)).s, L(1, 1));
def('DATEVALUE', ([t]) => { const d = parseDateTime(str(t)); if (d === null) throw ERR.VALUE; return Math.floor(d); }, L(1, 1));
def('TIMEVALUE', ([t]) => { const d = parseDateTime(str(t)); if (d === null) throw ERR.VALUE; return d - Math.floor(d); }, L(1, 1));
const wd = (s, type) => {
  const w = ymdFromSerial(s).wd; // 0=Sun
  switch (type) { case 1: return w + 1; case 2: return ((w + 6) % 7) + 1; case 3: return (w + 6) % 7; case 11: case 12: case 13: case 14: case 15: case 16: case 17: return ((w - (type - 10) % 7 + 7 + 0) % 7) + 1; default: throw ERR.NUM; }
};
def('WEEKDAY', ([v, t]) => { const ty = t === undefined ? 1 : Math.trunc(num(t)); const s = dt(v); if (ty === 1 || ty === 2 || ty === 3) return wd(s, ty); if (ty >= 11 && ty <= 17) { const w = ymdFromSerial(s).wd; const startDay = ty === 17 ? 0 : ty - 10 === 7 ? 0 : ty - 10; return ((w - startDay + 7) % 7) + 1; } throw ERR.NUM; }, L(1, 2));
const isoWeek = (s) => {
  const { y, m, d } = ymdFromSerial(s); const date = new Date(Date.UTC(y, m - 1, d)); const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3); const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((date - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
};
def('ISOWEEKNUM', ([v]) => isoWeek(dt(v)), L(1, 1));
def('WEEKNUM', ([v, t]) => {
  const s = dt(v); const ty = t === undefined ? 1 : Math.trunc(num(t));
  if (ty === 21) return isoWeek(s);
  const { y } = ymdFromSerial(s); const jan1 = serialFromYMD(y, 1, 1); const start = ty === 2 || ty === 11 ? 1 : ty >= 12 && ty <= 17 ? ty - 10 : 0;
  const w1 = ymdFromSerial(jan1).wd; const off = (w1 - start + 7) % 7;
  return Math.floor((s - jan1 + off) / 7) + 1;
}, L(1, 2));
const addMonths = (s, n) => { const { y, m, d } = ymdFromSerial(s); const tot = y * 12 + (m - 1) + n; const ny = Math.floor(tot / 12); const nm = (tot % 12 + 12) % 12 + 1; const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate(); return serialFromYMD(ny, nm, Math.min(d, dim)); };
def('EDATE', ([s, n]) => addMonths(Math.floor(dt(s)), Math.trunc(num(n))), L(2, 2));
def('EOMONTH', ([s, n]) => { const t = addMonths(Math.floor(dt(s)), Math.trunc(num(n))); const { y, m } = ymdFromSerial(t); return serialFromYMD(y, m + 1, 0); }, L(2, 2));
def('DAYS', ([e, s]) => Math.floor(num(e)) - Math.floor(num(s)), L(2, 2));
def('DAYS360', ([a, b, m]) => {
  const x = ymdFromSerial(Math.floor(num(a))); const y = ymdFromSerial(Math.floor(num(b))); const eu = m !== undefined && bool(m);
  let d1 = x.d; let d2 = y.d;
  if (eu) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; } else { if (d1 === 31) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; }
  return (y.y - x.y) * 360 + (y.m - x.m) * 30 + (d2 - d1);
}, L(2, 3));
def('DATEDIF', ([a, b, u]) => {
  const s = Math.floor(num(a)); const e = Math.floor(num(b)); if (s > e) throw ERR.NUM;
  const x = ymdFromSerial(s); const y = ymdFromSerial(e); const unit = str(u).toUpperCase();
  let months = (y.y - x.y) * 12 + (y.m - x.m) - (y.d < x.d ? 1 : 0);
  switch (unit) {
    case 'Y': return Math.floor(months / 12);
    case 'M': return months;
    case 'D': return e - s;
    case 'MD': { let d = y.d - x.d; if (d < 0) { const pm = ymdFromSerial(serialFromYMD(y.y, y.m, 0)); d += pm.d; } return d; }
    case 'YM': return ((months % 12) + 12) % 12;
    case 'YD': { let ty = serialFromYMD(y.y, x.m, x.d); if (ty > e) ty = serialFromYMD(y.y - 1, x.m, x.d); return e - ty; }
    default: throw ERR.NUM;
  }
}, L(3, 3));
const weekendSet = (spec) => {
  if (spec === undefined) return [0, 6];
  if (typeof spec === 'string' && /^[01]{7}$/.test(spec)) return [...spec].map((c, i) => (c === '1' ? (i + 1) % 7 : -1)).filter((x) => x >= 0);
  const n = Math.trunc(num(spec));
  if (n >= 1 && n <= 7) return [[6, 0], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]][n - 1].map((x) => x);
  if (n >= 11 && n <= 17) return [n - 11];
  throw ERR.NUM;
};
const holidays = (ctx, h) => new Set(h === undefined ? [] : flatten(ctx, [h]).filter((v) => v !== null && v !== '').map((v) => Math.floor(num(v))));
const netDays = (s, e, wk, hol) => {
  const sign = s <= e ? 1 : -1; const a = Math.min(s, e); const b = Math.max(s, e); let n = 0;
  for (let d = a; d <= b; d++) { if (!wk.includes(ymdFromSerial(d).wd) && !hol.has(d)) n++; }
  return sign * n;
};
def('NETWORKDAYS', ([s, e, h], ctx) => netDays(Math.floor(num(s)), Math.floor(num(e)), [0, 6], holidays(ctx, h)), { min: 2, max: 3 });
def('NETWORKDAYS.INTL', ([s, e, w, h], ctx) => netDays(Math.floor(num(s)), Math.floor(num(e)), weekendSet(w), holidays(ctx, h)), { min: 2, max: 4 });
const workday = (s, n, wk, hol) => { let d = s; let left = Math.abs(n); const step = n < 0 ? -1 : 1; while (left > 0) { d += step; if (!wk.includes(ymdFromSerial(d).wd) && !hol.has(d)) left--; } return d; };
def('WORKDAY', ([s, n, h], ctx) => workday(Math.floor(num(s)), Math.trunc(num(n)), [0, 6], holidays(ctx, h)), { min: 2, max: 3 });
def('WORKDAY.INTL', ([s, n, w, h], ctx) => workday(Math.floor(num(s)), Math.trunc(num(n)), weekendSet(w), holidays(ctx, h)), { min: 2, max: 4 });
def('YEARFRAC', ([a, b, bs]) => {
  let s = Math.floor(num(a)); let e = Math.floor(num(b)); if (s > e) [s, e] = [e, s]; const basis = bs === undefined ? 0 : Math.trunc(num(bs));
  const x = ymdFromSerial(s); const y = ymdFromSerial(e);
  switch (basis) {
    case 0: { let d1 = x.d; let d2 = y.d; if (d1 === 31) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; return ((y.y - x.y) * 360 + (y.m - x.m) * 30 + d2 - d1) / 360; }
    case 1: { const yrs = y.y - x.y + 1; let tot = 0; for (let i = x.y; i <= y.y; i++) tot += (i % 4 === 0 && (i % 100 !== 0 || i % 400 === 0)) ? 366 : 365; return (e - s) / (tot / yrs); }
    case 2: return (e - s) / 360;
    case 3: return (e - s) / 365;
    case 4: { let d1 = Math.min(x.d, 30); let d2 = Math.min(y.d, 30); return ((y.y - x.y) * 360 + (y.m - x.m) * 30 + d2 - d1) / 360; }
    default: throw ERR.NUM;
  }
}, L(2, 3));
