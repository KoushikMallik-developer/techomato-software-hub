import { def } from './registry.js';
import { ERR, SErr, bool, flatten, isMat, isRef, num, S, str } from './fnhelp.js';
import { formatValue } from './numfmt.js';
import { parseNumberText, numToStr } from './fnutil.js';
import { parseDateTime } from './dates.js';

const L1 = { min: 1, max: 1, lift: true };
const cnt = (v, d) => { const n = Math.trunc(num(v ?? d)); if (n < 0) throw ERR.VALUE; return n; };
def('LEN', ([t]) => str(t).length, L1);
def('LENB', ([t]) => new TextEncoder().encode(str(t)).length, L1);
def('LEFT', ([t, n]) => str(t).slice(0, cnt(n, 1)), { min: 1, max: 2, lift: true });
def('RIGHT', ([t, n]) => { const s = str(t); const k = cnt(n, 1); return k === 0 ? '' : s.slice(-k); }, { min: 1, max: 2, lift: true });
def('MID', ([t, st, n]) => { const s = str(t); const a = Math.trunc(num(st)); const k = cnt(n); if (a < 1) throw ERR.VALUE; return s.substr(a - 1, k); }, { min: 3, max: 3, lift: true });
def('UPPER', ([t]) => str(t).toUpperCase(), L1);
def('LOWER', ([t]) => str(t).toLowerCase(), L1);
def('PROPER', ([t]) => str(t).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()), L1);
def('TRIM', ([t]) => str(t).replace(/ +/g, ' ').replace(/^ | $/g, ''), L1);
def('CLEAN', ([t]) => str(t).replace(/[\u0000-\u001f]/g, ''), L1);
def('CHAR', ([n]) => { const k = Math.trunc(num(n)); if (k < 1 || k > 255) throw ERR.VALUE; return String.fromCharCode(k); }, L1);
def('UNICHAR', ([n]) => { const k = Math.trunc(num(n)); if (k < 1) throw ERR.VALUE; return String.fromCodePoint(k); }, L1);
def('CODE', ([t]) => { const s = str(t); if (!s) throw ERR.VALUE; return s.charCodeAt(0); }, L1);
def('UNICODE', ([t]) => { const s = str(t); if (!s) throw ERR.VALUE; return s.codePointAt(0); }, L1);
def('REPT', ([t, n]) => { const k = cnt(n); const s = str(t); if (s.length * k > 32767) throw ERR.VALUE; return s.repeat(k); }, { min: 2, max: 2, lift: true });
def('EXACT', ([a, b]) => str(a) === str(b), { min: 2, max: 2, lift: true });
def('T', ([v]) => (typeof v === 'string' ? v : ''), L1);
def('VALUE', ([t]) => {
  if (typeof t === 'number') return t;
  const s = str(t); const n = parseNumberText(s); if (n !== null) return n;
  const d = parseDateTime(s); if (d !== null) return d; throw ERR.VALUE;
}, L1);
def('NUMBERVALUE', ([t, dec, grp]) => {
  let s = str(t).replace(/\s/g, ''); const d = dec === undefined ? '.' : str(dec); const g = grp === undefined ? ',' : str(grp);
  s = s.split(g).join('').replace(d, '.'); let pct = 0; while (s.endsWith('%')) { s = s.slice(0, -1); pct++; }
  if (s === '') return 0; const n = Number(s); if (Number.isNaN(n)) throw ERR.VALUE; return n / Math.pow(100, pct);
}, { min: 1, max: 3, lift: true });
def('TEXT', ([v, f]) => formatValue(typeof v === 'string' && parseNumberText(v) !== null ? parseNumberText(v) : v, str(f)).text, { min: 2, max: 2, lift: true });
def('FIXED', ([x, d, nc]) => { const k = d === undefined ? 2 : Math.trunc(num(d)); const v = num(x); const m = Math.pow(10, k); const r = Math.round(Math.abs(v) * m) / m * Math.sign(v); const noc = nc !== undefined && bool(nc); return noc ? r.toFixed(Math.max(0, k)) : r.toLocaleString('en-US', { minimumFractionDigits: Math.max(0, k), maximumFractionDigits: Math.max(0, k) }); }, { min: 1, max: 3, lift: true });
def('DOLLAR', ([x, d]) => { const k = d === undefined ? 2 : Math.trunc(num(d)); const v = num(x); const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: Math.max(0, k), maximumFractionDigits: Math.max(0, k) }); return v < 0 ? `($${s})` : `$${s}`; }, { min: 1, max: 2, lift: true });

def('CONCATENATE', (args, ctx) => args.map((a) => str(S(ctx, a))).join(''), { min: 1 });
def('CONCAT', (args, ctx) => flatten(ctx, args).map(str).join(''), { min: 1 });
def('TEXTJOIN', ([d, ign, ...rest], ctx) => {
  const delim = str(S(ctx, d)); const skip = bool(S(ctx, ign));
  let items = flatten(ctx, rest).map((v) => { if (v instanceof SErr) throw v; return v === null ? '' : str(v); });
  if (skip) items = items.filter((x) => x !== '');
  return items.join(delim);
}, { min: 3 });
def('JOIN', ([d, ...rest], ctx) => flatten(ctx, rest).filter((v) => v !== null && v !== '').map(str).join(str(S(ctx, d))), { min: 2 });

const wild = (pat) => new RegExp(pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?'), 'i');
def('FIND', ([f, t, st]) => { const s = str(t); const a = st === undefined ? 1 : Math.trunc(num(st)); if (a < 1 || a > s.length + 1) throw ERR.VALUE; const i = s.indexOf(str(f), a - 1); if (i < 0) throw ERR.VALUE; return i + 1; }, { min: 2, max: 3, lift: true });
def('SEARCH', ([f, t, st]) => { const s = str(t); const a = st === undefined ? 1 : Math.trunc(num(st)); if (a < 1 || a > s.length + 1) throw ERR.VALUE; const re = wild(str(f)); const m = re.exec(s.slice(a - 1)); if (!m) throw ERR.VALUE; return m.index + a; }, { min: 2, max: 3, lift: true });
def('SUBSTITUTE', ([t, o, n, inst]) => {
  const s = str(t); const old = str(o); const nw = str(n);
  if (old === '') return s;
  if (inst === undefined) return s.split(old).join(nw);
  const k = Math.trunc(num(inst)); if (k < 1) throw ERR.VALUE;
  let idx = -1; for (let i = 0; i < k; i++) { idx = s.indexOf(old, idx + 1); if (idx < 0) return s; }
  return s.slice(0, idx) + nw + s.slice(idx + old.length);
}, { min: 3, max: 4, lift: true });
def('REPLACE', ([t, st, n, nw]) => { const s = str(t); const a = Math.trunc(num(st)); const k = cnt(n); if (a < 1) throw ERR.VALUE; return s.slice(0, a - 1) + str(nw) + s.slice(a - 1 + k); }, { min: 4, max: 4, lift: true });

/* ---- TEXTBEFORE / TEXTAFTER / TEXTSPLIT ---- */
function findDelim(s, delims, inst, ci, fromEnd) {
  const ds = delims.filter((d) => d !== '');
  const hay = ci ? s.toLowerCase() : s;
  const hits = [];
  for (const d0 of ds) {
    const d = ci ? d0.toLowerCase() : d0; let i = 0;
    while ((i = hay.indexOf(d, i)) >= 0) { hits.push([i, d0.length]); i += d0.length || 1; }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const clean = []; let end = -1;
  for (const h of hits) if (h[0] >= end) { clean.push(h); end = h[0] + h[1]; }
  if (!clean.length) return null;
  const k = Math.abs(inst);
  if (k === 0 || k > clean.length) return null;
  return inst > 0 && !fromEnd ? clean[k - 1] : clean[clean.length - k];
}
const splitFn = (before) => ([t, d, inst, mm, me, nf], ctx) => {
  const s = str(S(ctx, t)); const dm = ctx.api.toMatrix(d).flat().map((x) => str(x));
  const k = inst === undefined ? 1 : Math.trunc(num(S(ctx, inst))); const ci = mm !== undefined && num(S(ctx, mm)) === 1;
  const matchEnd = me !== undefined && num(S(ctx, me)) === 1;
  if (k === 0) throw ERR.VALUE;
  let h = findDelim(s, dm, k, ci, false);
  if (!h && matchEnd) h = k > 0 ? [s.length, 0] : [0, 0];
  if (!h) { if (nf !== undefined) return ctx.api.deref(nf); throw ERR.NA; }
  return before ? s.slice(0, h[0]) : s.slice(h[0] + h[1]);
};
def('TEXTBEFORE', splitFn(true), { min: 2, max: 6 });
def('TEXTAFTER', splitFn(false), { min: 2, max: 6 });
def('TEXTSPLIT', ([t, cd, rd, ign, mm, pad], ctx) => {
  const s = str(S(ctx, t)); const ci = mm !== undefined && num(S(ctx, mm)) === 1; const ig = ign !== undefined && bool(S(ctx, ign));
  const cds = cd === undefined || cd === null ? [] : ctx.api.toMatrix(cd).flat().map((x) => str(x)).filter(Boolean);
  const rds = rd === undefined || rd === null ? [] : ctx.api.toMatrix(rd).flat().map((x) => str(x)).filter(Boolean);
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const splitBy = (x, ds) => (ds.length ? x.split(new RegExp(ds.map(esc).join('|'), ci ? 'i' : '')) : [x]);
  let rows = splitBy(s, rds).map((r) => splitBy(r, cds));
  if (ig) rows = rows.map((r) => r.filter((x) => x !== '')).filter((r) => r.length);
  const C = Math.max(...rows.map((r) => r.length));
  const pv = pad === undefined ? ERR.NA : ctx.api.deref(pad);
  return rows.map((r) => Array.from({ length: C }, (_, i) => (i < r.length ? r[i] : pv)));
}, { min: 2, max: 6 });
def('SPLIT', ([t, d, byEach], ctx) => {
  const s = str(S(ctx, t)); const ds = str(S(ctx, d)); const each = byEach === undefined || bool(S(ctx, byEach));
  const parts = each ? s.split(new RegExp('[' + ds.replace(/[\]\\^-]/g, '\\$&') + ']')) : s.split(ds);
  return [parts.filter((x) => x !== '')];
}, { min: 2, max: 3 });

/* ---- regex (Google-style) ---- */
const rx = (p) => { try { return new RegExp(str(p)); } catch { throw ERR.VALUE; } };
def('REGEXMATCH', ([t, p]) => rx(p).test(str(t)), { min: 2, max: 2, lift: true });
def('REGEXEXTRACT', ([t, p]) => { const m = rx(p).exec(str(t)); if (!m) throw ERR.NA; return m.length > 1 ? [m.slice(1).map((x) => x ?? '')] : m[0]; }, { min: 2, max: 2 , lift: false});
def('REGEXREPLACE', ([t, p, r]) => str(t).replace(new RegExp(str(p), 'g'), str(r).replace(/\$(\d)/g, '$$$1')), { min: 3, max: 3, lift: true });
def('ARRAYTOTEXT', ([a], ctx) => ctx.api.toMatrix(a).flat().map((v) => (v === null ? '' : str(v))).join(', '), { min: 1, max: 2 });
def('VALUETOTEXT', ([v]) => str(v), { min: 1, max: 2, lift: [0] });
def('TEXTLENGTH', ([t]) => str(t).length, L1);

/* ---- helpers shared with info module ---- */
export { numToStr };
