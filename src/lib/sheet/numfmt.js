// Excel-style number format engine.
import { DAYS, MONTHS, timeParts, ymdFromSerial } from './dates.js';
import { isErr } from './values.js';

const cache = new Map();
const COLORS = { black: '#000000', blue: '#0000ff', cyan: '#00aaaa', green: '#008000', magenta: '#cc00cc', red: '#d00000', white: '#ffffff', yellow: '#b8a000' };

function splitSections(fmt) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === '"') q = !q;
    if (ch === '\\' && !q) { cur += ch + (fmt[++i] || ''); continue; }
    if (ch === ';' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const DATE_CH = /[ymdhs]/i;

function parseSection(src) {
  const sec = { tokens: [], color: null, cond: null, isDate: false, isText: false, pct: 0, sci: null, thousands: false, scale: 0, intTokens: [], fracTokens: [], hasDot: false, ampm: false, general: false, fraction: null };
  let i = 0;
  const toks = sec.tokens;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '"') {
      let j = i + 1; let s = '';
      while (j < n && src[j] !== '"') s += src[j++];
      toks.push({ k: 'lit', v: s }); i = j + 1; continue;
    }
    if (ch === '\\') { toks.push({ k: 'lit', v: src[i + 1] || '' }); i += 2; continue; }
    if (ch === '_') { toks.push({ k: 'lit', v: ' ' }); i += 2; continue; }
    if (ch === '*') { i += 2; continue; }
    if (ch === '[') {
      const j = src.indexOf(']', i);
      const body = src.slice(i + 1, j < 0 ? n : j);
      i = j < 0 ? n : j + 1;
      const lb = body.toLowerCase();
      if (COLORS[lb]) { sec.color = COLORS[lb]; continue; }
      if (/^color\s*\d+$/i.test(body)) { sec.color = '#444444'; continue; }
      const cm = /^([<>=]+)\s*(-?[\d.]+)$/.exec(body);
      if (cm) { sec.cond = { op: cm[1], v: parseFloat(cm[2]) }; continue; }
      if (/^\$/.test(body)) { toks.push({ k: 'lit', v: body.slice(1).split('-')[0] }); continue; }
      if (/^(h+|m+|s+)$/i.test(body)) { toks.push({ k: 'elapsed', v: body[0].toLowerCase(), len: body.length }); sec.isDate = true; continue; }
      continue;
    }
    if (/^general/i.test(src.slice(i, i + 7))) { toks.push({ k: 'general' }); sec.general = true; i += 7; continue; }
    if (/^(AM\/PM|A\/P)/i.test(src.slice(i, i + 5))) { const m = /^(AM\/PM|A\/P)/i.exec(src.slice(i)); toks.push({ k: 'ampm', v: m[1] }); sec.ampm = true; sec.isDate = true; i += m[1].length; continue; }
    if (ch === '@') { toks.push({ k: 'text' }); sec.isText = true; i++; continue; }
    if (/[eE]/.test(ch) && /[+-]/.test(src[i + 1] || '') && /[0#?]/.test(src[i + 2] || '')) {
      let j = i + 2; while (/[0#?]/.test(src[j] || '')) j++;
      toks.push({ k: 'sci', plus: src[i + 1] === '+', digits: j - (i + 2) }); sec.sci = true; i = j; continue;
    }
    if (/[ymdhs]/i.test(ch)) {
      let j = i; while (src[j] && src[j].toLowerCase() === ch.toLowerCase()) j++;
      toks.push({ k: 'date', v: ch.toLowerCase(), len: j - i }); sec.isDate = true; i = j;
      if (src[i] === '.' && /0/.test(src[i + 1] || '') && ch.toLowerCase() === 's') { let z = i + 1; while (src[z] === '0') z++; toks.push({ k: 'subsec', len: z - i - 1 }); i = z; }
      continue;
    }
    if (/[0#?]/.test(ch)) { toks.push({ k: 'ph', v: ch }); i++; continue; }
    if (ch === '.') { toks.push({ k: 'dot' }); i++; continue; }
    if (ch === ',') { toks.push({ k: 'comma' }); i++; continue; }
    if (ch === '%') { toks.push({ k: 'pct' }); sec.pct++; i++; continue; }
    if (ch === '/') { toks.push({ k: 'slash' }); i++; continue; }
    toks.push({ k: 'lit', v: ch }); i++;
  }
  // m after h / before s means minutes
  if (sec.isDate) {
    for (let t = 0; t < toks.length; t++) {
      if (toks[t].k === 'date' && toks[t].v === 'm') {
        let prev = null; for (let u = t - 1; u >= 0; u--) { if (toks[u].k === 'date' || toks[u].k === 'elapsed') { prev = toks[u]; break; } if (toks[u].k !== 'lit') break; }
        let next = null; for (let u = t + 1; u < toks.length; u++) { if (toks[u].k === 'date' || toks[u].k === 'elapsed') { next = toks[u]; break; } if (toks[u].k !== 'lit') break; }
        if ((prev && (prev.v === 'h')) || (next && next.v === 's')) toks[t].k = 'min';
      }
    }
    toks.forEach((t) => {
      if (t.k === 'slash') { t.k = 'lit'; t.v = '/'; } else if (t.k === 'comma') { t.k = 'lit'; t.v = ','; } else if (t.k === 'dot') { t.k = 'lit'; t.v = '.'; } else if (t.k === 'pct') { t.k = 'lit'; t.v = '%'; }
    });
    return sec;
  }
  // fractions: "# ?/?" or "?/?"
  const slash = toks.findIndex((x) => x.k === 'slash');
  if (slash > 0 && toks.slice(0, slash).some((x) => x.k === 'ph') && toks.slice(slash + 1).some((x) => x.k === 'ph' || x.k === 'lit')) {
    const den = toks.slice(slash + 1).filter((x) => x.k === 'ph').length;
    const hasWhole = toks.slice(0, slash).filter((x) => x.k === 'ph').length > 1 || toks.slice(0, slash).some((x) => x.k === 'lit' && x.v === ' ');
    sec.fraction = { den, hasWhole, slash };
    return sec;
  }
  // numeric: split at dot, find thousands + scaling commas
  const dot = toks.findIndex((x) => x.k === 'dot');
  sec.hasDot = dot >= 0;
  sec.intTokens = dot >= 0 ? toks.slice(0, dot) : toks.slice();
  sec.fracTokens = dot >= 0 ? toks.slice(dot + 1) : [];
  const lastPh = (arr) => { for (let k = arr.length - 1; k >= 0; k--) if (arr[k].k === 'ph') return k; return -1; };
  const firstPh = (arr) => arr.findIndex((x) => x.k === 'ph');
  const lp = lastPh(sec.intTokens); const fp = firstPh(sec.intTokens);
  // commas after the last digit placeholder (before dot) scale by 1000; commas between placeholders = thousands
  sec.intTokens = sec.intTokens.filter((x, idx) => {
    if (x.k !== 'comma') return true;
    if (lp >= 0 && idx > lp) { sec.scale++; return false; }
    if (fp >= 0 && idx > fp && idx < lp) { sec.thousands = true; return false; }
    return true;
  });
  if (sec.hasDot) {
    let k = sec.fracTokens.length - 1; // commas at the end of the fraction scale as well
    while (k >= 0 && sec.fracTokens[k].k === 'comma') { sec.scale++; sec.fracTokens.pop(); k--; }
  }
  return sec;
}

function parseFormat(fmt) {
  let p = cache.get(fmt);
  if (p) return p;
  const secs = splitSections(fmt).map(parseSection);
  p = { secs, isDate: secs[0].isDate, general: secs.length === 1 && secs[0].general };
  cache.set(fmt, p);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return p;
}

export const isDateFormat = (fmt) => !!fmt && parseFormat(fmt).isDate;

function generalNumber(v) {
  if (Number.isInteger(v) && Math.abs(v) < 1e11) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e11 || a < 1e-9)) {
    let s = v.toExponential(5).replace(/\.?0+e/, 'e');
    s = s.replace('e+', 'E+').replace('e-', 'E-');
    return s.replace(/E([+-])(\d)$/, 'E$10$2');
  }
  let s = v.toPrecision(10);
  if (s.includes('e')) s = String(v);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  if (s.length > 12) s = String(+v.toPrecision(Math.max(1, 11 - (a >= 1 ? Math.floor(Math.log10(a)) + 1 : 1))));
  return s;
}

const groupDigits = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function fmtNumber(sec, value, neg) {
  let v = Math.abs(value);
  if (sec.pct) v *= Math.pow(100, sec.pct);
  if (sec.scale) v /= Math.pow(1000, sec.scale);
  const phCount = (arr) => arr.filter((x) => x.k === 'ph').length;
  const fracCount = phCount(sec.fracTokens);
  // scientific
  if (sec.sci) {
    const si = sec.tokens.findIndex((x) => x.k === 'sci');
    const mant = sec.tokens.slice(0, si);
    const dot = mant.findIndex((x) => x.k === 'dot');
    const intPh = mant.slice(0, dot < 0 ? mant.length : dot).filter((x) => x.k === 'ph').length || 1;
    const fr = dot < 0 ? 0 : mant.slice(dot + 1).filter((x) => x.k === 'ph').length;
    let exp = v === 0 ? 0 : Math.floor(Math.log10(v));
    exp -= (exp % intPh + intPh) % intPh;
    let m = v / Math.pow(10, exp);
    m = +m.toFixed(fr);
    if (m >= Math.pow(10, intPh)) { m /= 10; exp += 1; }
    const e = sec.tokens[si];
    const es = String(Math.abs(exp)).padStart(e.digits, '0');
    let txt = m.toFixed(fr);
    const lead = sec.tokens.filter((x, idx) => idx < si && x.k === 'lit').map((x) => x.v).join('');
    return (neg ? '-' : '') + lead + txt + 'E' + (exp < 0 ? '-' : e.plus ? '+' : '') + es;
  }
  if (sec.fraction) return fmtFraction(sec, v, neg);
  const rounded = +v.toFixed(Math.min(fracCount, 15));
  let [ip, fp = ''] = rounded.toFixed(Math.min(fracCount, 15)).split('.');
  if (ip === '0' && phCount(sec.intTokens) === 0) ip = '';
  // integer part: right-to-left over tokens
  let digits = ip === '0' ? (sec.intTokens.some((x) => x.k === 'ph' && x.v === '0') ? '0' : '') : ip;
  if (sec.intTokens.some((x) => x.k === 'ph') && ip === '0' && !sec.intTokens.some((x) => x.k === 'ph' && x.v !== '#')) digits = '';
  if (ip === '0' && sec.intTokens.some((x) => x.k === 'ph' && (x.v === '0' || x.v === '?'))) digits = '0';
  let out = '';
  let dpos = digits.length;
  const phs = sec.intTokens.map((x, i) => (x.k === 'ph' ? i : -1)).filter((i) => i >= 0);
  const firstPhIdx = phs[0];
  for (let t = sec.intTokens.length - 1; t >= 0; t--) {
    const tk = sec.intTokens[t];
    if (tk.k === 'ph') {
      if (t === firstPhIdx) {
        const rest = digits.slice(0, dpos);
        let part = rest;
        const need = tk.v === '0' ? 1 : 0;
        if (part.length < need) part = '0'.repeat(need - part.length) + part;
        out = (sec.thousands ? groupDigits(part + out.replace(/[^\d]/g, '').slice(0, 0)) : part) + out;
        dpos = 0;
      } else if (dpos > 0) { out = digits[--dpos] + out; }
      else out = (tk.v === '0' ? '0' : tk.v === '?' ? ' ' : '') + out;
    } else out = (tk.k === 'lit' ? tk.v : tk.k === 'pct' ? '%' : tk.k === 'general' ? '' : tk.k === 'comma' ? ',' : '') + out;
  }
  if (phs.length === 0) { out = sec.intTokens.map((x) => (x.k === 'lit' ? x.v : x.k === 'pct' ? '%' : '')).join(''); }
  else if (sec.thousands) {
    // insert grouping into the digit run only (leave literals alone)
    out = out.replace(/\d[\d,]*/, (m) => groupDigits(m.replace(/,/g, '')));
  }
  if (sec.hasDot) {
    let f = '';
    let fi = 0;
    // trim trailing zeros where the placeholder is '#', pad with spaces for '?'
    const fts = sec.fracTokens;
    let digitsLeft = fp;
    const phIdx = fts.map((x, i) => (x.k === 'ph' ? i : -1)).filter((i) => i >= 0);
    let lastNeeded = -1;
    phIdx.forEach((ti, k) => { if (fts[ti].v === '0' || (digitsLeft[k] && digitsLeft[k] !== '0')) lastNeeded = k; });
    let k = 0;
    for (const tk of fts) {
      if (tk.k === 'ph') {
        const d = digitsLeft[k];
        if (k <= lastNeeded) f += d ?? '0';
        else if (tk.v === '?') f += ' ';
        k++;
      } else f += tk.k === 'lit' ? tk.v : tk.k === 'pct' ? '%' : '';
    }
    const hasDigits = /\d/.test(f);
    out += (hasDigits || /[0?]/.test(fts.map((x) => x.v || '').join('')) ? '.' : '') + f;
    if (!hasDigits && !/[0?]/.test(fts.map((x) => x.v || '').join(''))) out = out.replace(/\.$/, '');
  }
  return (neg ? '-' : '') + out;
}

function fmtFraction(sec, v, neg) {
  const maxDen = Math.pow(10, sec.fraction.den) - 1;
  const whole = Math.floor(v);
  const frac = v - whole;
  let bn = 0; let bd = 1; let best = Infinity;
  const target = sec.fraction.hasWhole ? frac : v;
  for (let d = 1; d <= maxDen; d++) {
    const nn = Math.round(target * d);
    const err = Math.abs(target - nn / d);
    if (err < best - 1e-12) { best = err; bn = nn; bd = d; }
    if (err < 1e-10) break;
  }
  let w = sec.fraction.hasWhole ? whole : 0;
  if (sec.fraction.hasWhole && bn === bd) { w += 1; bn = 0; }
  const s = bn === 0 && sec.fraction.hasWhole ? String(w) : (sec.fraction.hasWhole && w ? w + ' ' : '') + bn + '/' + bd;
  return (neg ? '-' : '') + s;
}

function fmtDate(sec, serial) {
  const { y, m, d, wd } = ymdFromSerial(serial);
  const t = timeParts(serial);
  const ampm = sec.ampm;
  const hr12 = t.h % 12 === 0 ? 12 : t.h % 12;
  let out = '';
  for (const tk of sec.tokens) {
    switch (tk.k) {
      case 'lit': out += tk.v; break;
      case 'date':
        if (tk.v === 'y') out += tk.len <= 2 ? String(y % 100).padStart(2, '0') : String(y).padStart(4, '0');
        else if (tk.v === 'm') out += tk.len === 1 ? m : tk.len === 2 ? String(m).padStart(2, '0') : tk.len === 3 ? MONTHS[m - 1].slice(0, 3) : tk.len === 4 ? MONTHS[m - 1] : MONTHS[m - 1][0];
        else if (tk.v === 'd') out += tk.len === 1 ? d : tk.len === 2 ? String(d).padStart(2, '0') : tk.len === 3 ? DAYS[wd].slice(0, 3) : DAYS[wd];
        else if (tk.v === 'h') out += tk.len === 1 ? (ampm ? hr12 : t.h) : String(ampm ? hr12 : t.h).padStart(2, '0');
        else if (tk.v === 's') out += tk.len === 1 ? t.s : String(t.s).padStart(2, '0');
        break;
      case 'min': out += tk.len === 1 ? t.mi : String(t.mi).padStart(2, '0'); break;
      case 'subsec': out += '.' + String(Math.round(t.frac * Math.pow(10, tk.len))).padStart(tk.len, '0'); break;
      case 'ampm': out += tk.v.length === 5 ? (t.h < 12 ? 'AM' : 'PM') : (t.h < 12 ? 'A' : 'P'); break;
      case 'elapsed': {
        const totalMin = Math.floor(serial * 1440 + 1e-6);
        const val = tk.v === 'h' ? Math.floor(serial * 24 + 1e-9) : tk.v === 'm' ? totalMin : Math.floor(serial * 86400 + 1e-6);
        out += String(val).padStart(tk.len, '0');
        break;
      }
      default: break;
    }
  }
  return out;
}

function chooseSection(parsed, value) {
  const secs = parsed.secs;
  if (secs.some((s) => s.cond)) {
    for (const s of secs) {
      if (!s.cond) continue;
      const { op, v } = s.cond;
      if ((op === '>' && value > v) || (op === '<' && value < v) || (op === '>=' && value >= v) || (op === '<=' && value <= v) || (op === '=' && value === v) || (op === '<>' && value !== v)) return [s, false];
    }
    const last = secs.find((s) => !s.cond);
    return [last || secs[0], false];
  }
  if (value < 0 && secs.length > 1) return [secs[1], true];
  if (value === 0 && secs.length > 2) return [secs[2], false];
  return [secs[0], false];
}

/* Returns { text, color } */
export function formatValue(v, fmt) {
  if (v === null || v === undefined || v === '') return { text: '' };
  if (isErr(v)) return { text: v.code };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE' };
  const f = fmt || 'General';
  if (typeof v === 'string') {
    const parsed = parseFormat(f);
    const textSec = parsed.secs[3] || (parsed.secs.length === 1 && parsed.secs[0].isText ? parsed.secs[0] : null);
    if (!textSec) return { text: v };
    return { text: textSec.tokens.map((t) => (t.k === 'text' ? v : t.k === 'lit' ? t.v : '')).join(''), color: textSec.color };
  }
  if (!Number.isFinite(v)) return { text: '#NUM!' };
  if (f === 'General') return { text: generalNumber(v) };
  const parsed = parseFormat(f);
  if (parsed.general) return { text: generalNumber(v) };
  const [sec, usedNeg] = chooseSection(parsed, v);
  let text;
  try {
    if (sec.isDate) {
      if (v < 0) return { text: '########', color: sec.color };
      text = fmtDate(sec, v);
    } else if (sec.general) text = (v < 0 && !usedNeg ? '-' : '') + sec.tokens.map((t) => (t.k === 'general' ? generalNumber(Math.abs(v)) : t.k === 'lit' ? t.v : '')).join('');
    else if (sec.isText && !sec.tokens.some((t) => t.k === 'ph')) text = sec.tokens.map((t) => (t.k === 'text' ? generalNumber(v) : t.k === 'lit' ? t.v : '')).join('');
    else text = fmtNumber(sec, v, v < 0 && (!usedNeg || secsNeedSign(parsed)) && !usedNeg);
  } catch {
    text = generalNumber(v);
  }
  return { text, color: sec.color };
}
const secsNeedSign = () => false;

/* ---------- presets for the UI ---------- */
export const FORMAT_PRESETS = [
  { label: 'Automatic', fmt: 'General', sample: 1234.5 },
  { label: 'Plain text', fmt: '@', sample: 'abc' },
  { sep: true },
  { label: 'Number', fmt: '#,##0.00', sample: 1234.5 },
  { label: 'Integer', fmt: '0', sample: 1234.5 },
  { label: 'Thousands separator', fmt: '#,##0', sample: 1234.5 },
  { label: 'Percent', fmt: '0.00%', sample: 0.1234 },
  { label: 'Percent (whole)', fmt: '0%', sample: 0.1234 },
  { label: 'Scientific', fmt: '0.00E+00', sample: 12345.678 },
  { label: 'Accounting', fmt: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)', sample: 1234.5 },
  { label: 'Financial', fmt: '#,##0.00;(#,##0.00)', sample: -1234.5 },
  { label: 'Currency', fmt: '$#,##0.00', sample: 1234.5 },
  { label: 'Currency (rounded)', fmt: '$#,##0', sample: 1234.5 },
  { label: 'Euro', fmt: '[$€]#,##0.00', sample: 1234.5 },
  { label: 'Pound', fmt: '[$£]#,##0.00', sample: 1234.5 },
  { label: 'Rupee', fmt: '[$₹]#,##0.00', sample: 1234.5 },
  { label: 'Yen', fmt: '[$¥]#,##0', sample: 1234.5 },
  { sep: true },
  { label: 'Date', fmt: 'm/d/yyyy', sample: 45678 },
  { label: 'Date (ISO)', fmt: 'yyyy-mm-dd', sample: 45678 },
  { label: 'Date (long)', fmt: 'mmmm d, yyyy', sample: 45678 },
  { label: 'Date (weekday)', fmt: 'dddd, mmmm d, yyyy', sample: 45678 },
  { label: 'Date (short)', fmt: 'd-mmm-yy', sample: 45678 },
  { label: 'Time', fmt: 'h:mm AM/PM', sample: 0.5625 },
  { label: 'Time (24 h)', fmt: 'hh:mm:ss', sample: 0.5625 },
  { label: 'Date and time', fmt: 'm/d/yyyy h:mm', sample: 45678.5625 },
  { label: 'Duration', fmt: '[h]:mm:ss', sample: 1.5 },
  { sep: true },
  { label: 'Fraction', fmt: '# ?/?', sample: 3.75 },
  { label: 'Phone-like', fmt: '000-000-0000', sample: 5551234567 },
  { label: 'Positive/negative colours', fmt: '[Color10]#,##0;[Red]-#,##0', sample: -42 },
];
