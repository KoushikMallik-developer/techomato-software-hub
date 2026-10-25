// Conditional formatting and data validation evaluation.
import { SErr } from './values.js';
import { keyOf, parseRange } from './addr.js';
import { compare } from './fnutil.js';
import { parseDateTime } from './dates.js';

const inR = (g, r, c) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
export const ICON_SETS = {
  arrows3: ['🔴▼', '🟡▶', '🟢▲'], traffic3: ['🔴', '🟡', '🟢'], flags3: ['🚩', '🏳️', '🏁'], stars3: ['☆', '★½', '★'], check3: ['✖', '❗', '✔'],
  arrows4: ['▼', '↘', '↗', '▲'], rating5: ['○', '◔', '◑', '◕', '●'],
};
export const ICON_COLORS = { arrows3: ['#d93025', '#f9ab00', '#188038'], traffic3: ['#d93025', '#f9ab00', '#188038'], flags3: ['#d93025', '#f9ab00', '#188038'], stars3: ['#999', '#f9ab00', '#f9ab00'], check3: ['#d93025', '#f9ab00', '#188038'], arrows4: ['#d93025', '#f9ab00', '#8bc34a', '#188038'], rating5: ['#666', '#666', '#666', '#666', '#666'] };

const numArg = (s) => { if (typeof s === 'number') return s; const n = Number(String(s).trim()); return String(s).trim() !== '' && !Number.isNaN(n) ? n : null; };

function cmpTest(rule, v, ev, r, c) {
  const arg = (x) => {
    if (typeof x === 'string' && x.startsWith('=')) { const out = ev.evalText(rule.si, r, c, x); return out instanceof SErr ? null : out; }
    const n = numArg(x); if (n !== null) return n;
    const d = typeof x === 'string' ? parseDateTime(x) : null;
    return d !== null && /[-/:]/.test(x) ? d : x;
  };
  const a = arg(rule.v1); const b = rule.v2 !== undefined ? arg(rule.v2) : null;
  if (v === null || v === undefined || v === '') return rule.op === 'ne' ? true : false;
  if (v instanceof SErr) return false;
  const cmp = (x, y) => { try { return compare(x, y); } catch { return NaN; } };
  switch (rule.op) {
    case 'gt': return cmp(v, a) > 0; case 'lt': return cmp(v, a) < 0; case 'ge': return cmp(v, a) >= 0; case 'le': return cmp(v, a) <= 0;
    case 'eq': return typeof v === typeof a ? cmp(v, a) === 0 : String(v).toLowerCase() === String(a).toLowerCase();
    case 'ne': return typeof v === typeof a ? cmp(v, a) !== 0 : String(v).toLowerCase() !== String(a).toLowerCase();
    case 'between': return cmp(v, a) >= 0 && cmp(v, b) <= 0;
    case 'notBetween': return cmp(v, a) < 0 || cmp(v, b) > 0;
    default: return false;
  }
}

function lerp(c1, c2, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(c1); const b = p(c2);
  return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join('');
}

/* Returns cfFor(r,c,value) -> { style, bar, icon } | null for one sheet */
export function buildCF(sheet, si, ev) {
  const rules = (sheet.cf || []).filter((x) => x && x.ranges && x.ranges.length);
  if (!rules.length) return null;
  const cache = rules.map(() => null);
  const ext = ev.usedExtent(si);

  const valuesOf = (rule) => {
    const out = [];
    rule.ranges.forEach((g) => {
      for (let r = g.r1; r <= Math.min(g.r2, ext.r); r++) for (let c = g.c1; c <= Math.min(g.c2, ext.c); c++) out.push(ev.value(si, r, c));
    });
    return out;
  };
  const stats = (i, rule) => {
    if (cache[i]) return cache[i];
    const vals = valuesOf(rule);
    const nums = vals.filter((v) => typeof v === 'number');
    const st = { nums };
    if (nums.length) { st.min = Math.min(...nums); st.max = Math.max(...nums); st.avg = nums.reduce((a, b) => a + b, 0) / nums.length; st.sorted = [...nums].sort((a, b) => a - b); }
    if (rule.type === 'dup' || rule.type === 'unique') { st.counts = new Map(); vals.forEach((v) => { if (v === null || v === '' || v instanceof SErr) return; const k = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + v; st.counts.set(k, (st.counts.get(k) || 0) + 1); }); }
    if ((rule.type === 'top' || rule.type === 'bottom') && nums.length) {
      const n = rule.pct ? Math.max(1, Math.round((nums.length * rule.n) / 100)) : Math.min(rule.n || 10, nums.length);
      st.thresh = rule.type === 'top' ? st.sorted[st.sorted.length - n] : st.sorted[n - 1];
    }
    cache[i] = st;
    return st;
  };
  const stopVal = (stp, st) => {
    switch (stp.type) {
      case 'min': return st.min; case 'max': return st.max;
      case 'num': return Number(stp.v);
      case 'pct': return st.min + ((st.max - st.min) * Number(stp.v)) / 100;
      case 'percentile': { const s = st.sorted; const idx = (Number(stp.v) / 100) * (s.length - 1); const lo = Math.floor(idx); const hi = Math.ceil(idx); return s[lo] + (s[hi] - s[lo]) * (idx - lo); }
      default: return st.min;
    }
  };

  return (r, c, v) => {
    let res = null;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule.ranges.some((g) => inR(g, r, c))) continue;
      let hit = false; let extra = null;
      const empty = v === null || v === undefined || v === '';
      switch (rule.type) {
        case 'cell': hit = cmpTest({ ...rule, si }, v, ev, r, c); break;
        case 'text': {
          if (empty) { hit = rule.op === 'notContains'; break; }
          const s = String(v).toLowerCase(); const t = String(rule.text || '').toLowerCase();
          hit = rule.op === 'contains' ? s.includes(t) : rule.op === 'notContains' ? !s.includes(t) : rule.op === 'begins' ? s.startsWith(t) : s.endsWith(t);
          break;
        }
        case 'blank': hit = empty; break;
        case 'notBlank': hit = !empty; break;
        case 'error': hit = v instanceof SErr; break;
        case 'noError': hit = !(v instanceof SErr); break;
        case 'dup': case 'unique': {
          if (empty || v instanceof SErr) break;
          const st = stats(i, rule); const k = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + v; const n = st.counts.get(k) || 0;
          hit = rule.type === 'dup' ? n > 1 : n === 1; break;
        }
        case 'top': case 'bottom': { if (typeof v !== 'number') break; const st = stats(i, rule); hit = st.thresh !== undefined && (rule.type === 'top' ? v >= st.thresh : v <= st.thresh); break; }
        case 'avg': {
          if (typeof v !== 'number') break; const st = stats(i, rule);
          hit = rule.op === 'above' ? v > st.avg : rule.op === 'below' ? v < st.avg : rule.op === 'aboveEq' ? v >= st.avg : v <= st.avg; break;
        }
        case 'formula': {
          const g0 = rule.ranges[0];
          const out = ev.evalText(si, r, c, shiftRel(rule.f, r - g0.r1, c - g0.c1));
          hit = out === true || (typeof out === 'number' && out !== 0); break;
        }
        case 'date': {
          if (typeof v !== 'number') break; const today = Math.floor(ev.now / 86400000 + 25569 - (new Date(ev.now).getTimezoneOffset() / 1440));
          const d = Math.floor(v);
          hit = rule.op === 'today' ? d === today : rule.op === 'yesterday' ? d === today - 1 : rule.op === 'tomorrow' ? d === today + 1 : rule.op === 'last7' ? d >= today - 6 && d <= today : rule.op === 'future' ? d > today : rule.op === 'past' ? d < today : false;
          break;
        }
        case 'scale': {
          if (typeof v !== 'number') break; const st = stats(i, rule); if (!st.nums.length) break;
          const stops = rule.stops.map((s) => ({ v: stopVal(s, st), color: s.color }));
          let color;
          if (v <= stops[0].v) color = stops[0].color; else if (v >= stops[stops.length - 1].v) color = stops[stops.length - 1].color;
          else { for (let k = 0; k < stops.length - 1; k++) if (v >= stops[k].v && v <= stops[k + 1].v) { const span = stops[k + 1].v - stops[k].v; color = lerp(stops[k].color, stops[k + 1].color, span ? (v - stops[k].v) / span : 0); break; } }
          res = { ...(res || {}), style: { ...((res && res.style) || {}), bg: color } };
          continue;
        }
        case 'bar': {
          if (typeof v !== 'number') break; const st = stats(i, rule); if (!st.nums.length) break;
          const lo = Math.min(0, st.min); const hi = Math.max(0, st.max); const span = hi - lo || 1;
          extra = { bar: { from: (Math.min(0, v) - lo) / span, to: (Math.max(0, v) - lo) / span, color: v < 0 ? rule.negColor || '#e06666' : rule.color || '#638ec6' } };
          res = { ...(res || {}), ...extra };
          continue;
        }
        case 'icons': {
          if (typeof v !== 'number') break; const st = stats(i, rule); if (!st.nums.length) break;
          const set = ICON_SETS[rule.set] || ICON_SETS.arrows3; const n = set.length;
          const frac = st.max === st.min ? 1 : (v - st.min) / (st.max - st.min);
          let idx = Math.min(n - 1, Math.floor(frac * n)); if (frac >= 1) idx = n - 1;
          if (rule.reverse) idx = n - 1 - idx;
          res = { ...(res || {}), icon: { text: set[idx].replace(/^.*?([▼▶▲↘↗○◔◑◕●✖❗✔☆★🚩🏳️🏁🔴🟡🟢]+.*)$/u, '$1'), color: (ICON_COLORS[rule.set] || [])[idx], onlyIcon: !!rule.iconOnly } };
          continue;
        }
        default: break;
      }
      if (hit) {
        res = { ...(res || {}), style: { ...((res && res.style) || {}), ...rule.style } };
        if (rule.stop) break;
      }
    }
    return res;
  };
}

/* shift unanchored refs in a CF formula written for the top-left cell */
import { shiftFormula } from './parser.js';
function shiftRel(f, dr, dc) { const s = f.startsWith('=') ? f : '=' + f; return shiftFormula(s, dr, dc); }

/* ---------- data validation ---------- */
export function dvRuleAt(sheet, r, c) {
  const list = sheet.dv || [];
  for (let i = list.length - 1; i >= 0; i--) { const d = list[i]; if (d.ranges && d.ranges.some((g) => inR(g, r, c))) return d; }
  return null;
}
export function dvItems(rule, ev, si) {
  if (rule.type === 'list') return rule.items || [];
  if (rule.type === 'listRange') {
    const g = parseRange((rule.range || '').replace(/^.*!/, ''));
    if (!g) return [];
    const out = []; const ext = ev.usedExtent(si);
    for (let r = g.r1; r <= Math.min(g.r2, ext.r); r++) for (let c = g.c1; c <= Math.min(g.c2, ext.c); c++) { const v = ev.value(si, r, c); if (v !== null && v !== '' && !(v instanceof SErr)) out.push(v); }
    return out;
  }
  return [];
}
export function dvCheck(rule, v, ev, si, r, c) {
  const fail = (msg) => ({ ok: false, msg: rule.message || msg });
  if (v === null || v === undefined || v === '') return rule.allowBlank === false ? fail('A value is required.') : { ok: true };
  const n = typeof v === 'number' ? v : null;
  const arg = (x) => { if (typeof x === 'string' && x.startsWith('=')) { const o = ev.evalText(si, r, c, x); return o; } const k = numArg(x); if (k !== null) return k; const d = parseDateTime(String(x)); return d !== null ? d : x; };
  const cmpOK = (x) => {
    const a = arg(rule.v1); const b = arg(rule.v2);
    switch (rule.op || 'between') {
      case 'between': return x >= a && x <= b; case 'notBetween': return x < a || x > b; case 'eq': return x === a; case 'ne': return x !== a;
      case 'gt': return x > a; case 'ge': return x >= a; case 'lt': return x < a; case 'le': return x <= a; default: return true;
    }
  };
  switch (rule.type) {
    case 'list': case 'listRange': {
      const items = dvItems(rule, ev, si).map((x) => String(x).toLowerCase());
      return items.includes(String(v).toLowerCase()) ? { ok: true } : fail('Pick a value from the list.');
    }
    case 'number': case 'decimal': return n !== null && cmpOK(n) ? { ok: true } : fail('Enter a number that meets the rule.');
    case 'whole': return n !== null && Number.isInteger(n) && cmpOK(n) ? { ok: true } : fail('Enter a whole number that meets the rule.');
    case 'date': return n !== null && cmpOK(n) ? { ok: true } : fail('Enter a valid date.');
    case 'textLen': return cmpOK(String(v).length) ? { ok: true } : fail('The text length is not allowed.');
    case 'custom': { const o = ev.evalText(si, r, c, rule.f || '=TRUE'); return o === true || (typeof o === 'number' && o !== 0) ? { ok: true } : fail('The value does not meet the rule.'); }
    case 'checkbox': return typeof v === 'boolean' ? { ok: true } : fail('Use the checkbox.');
    default: return { ok: true };
  }
}
