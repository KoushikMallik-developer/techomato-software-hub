// Pure helpers used by the Sheets app (no React).
import { MAX_COLS, MAX_ROWS, colName, keyOf } from '../../lib/sheet/addr.js';
import { Draft, Axis, DEFAULT_COLW, DEFAULT_ROWH, newBook, setCellInput, styleIndexAt } from '../../lib/sheet/model.js';
import { formatValue } from '../../lib/sheet/numfmt.js';
import { SErr } from '../../lib/sheet/values.js';
import { quoteSheet } from '../../lib/sheet/parser.js';
import { rangeText } from '../../lib/sheet/addr.js';
import { measureText, fontString, wrapLines } from './measure.js';

export const rangeLabel = (g) => (g.r1 === g.r2 && g.c1 === g.c2 ? `${colName(g.c1)}${g.r1 + 1}` : rangeText(g));
export const fullSheetRange = { r1: 0, c1: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 };
export const isWholeCols = (g) => g.r1 === 0 && g.r2 >= MAX_ROWS - 1;
export const isWholeRows = (g) => g.c1 === 0 && g.c2 >= MAX_COLS - 1;

/* clamp a (possibly whole-row/col) range to the used extent of the sheet */
export function clampToUsed(g, ext) {
  return { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(ext.r, g.r1)), c2: Math.min(g.c2, Math.max(ext.c, g.c1)) };
}

/* the block of non-empty cells around (r,c) */
export function contiguousRegion(ev, si, r, c) {
  const ext = ev.usedExtent(si);
  const has = (rr, cc) => rr >= 0 && cc >= 0 && rr <= ext.r && cc <= ext.c && ev.value(si, rr, cc) !== null && ev.value(si, rr, cc) !== '';
  let seed = null;
  for (const [dr, dc] of [[0, 0], [0, -1], [-1, 0], [0, 1], [1, 0]]) if (has(r + dr, c + dc)) { seed = { r: r + dr, c: c + dc }; break; }
  if (!seed) return { r1: r, c1: c, r2: r, c2: c };
  let g = { r1: seed.r, c1: seed.c, r2: seed.r, c2: seed.c };
  let grew = true; let guard = 0;
  while (grew && guard++ < 400) {
    grew = false;
    const rowHas = (rr) => { for (let cc = g.c1 - 1; cc <= g.c2 + 1; cc++) if (has(rr, cc)) return true; return false; };
    const colHas = (cc) => { for (let rr = g.r1 - 1; rr <= g.r2 + 1; rr++) if (has(rr, cc)) return true; return false; };
    if (g.r1 > 0 && rowHas(g.r1 - 1)) { g.r1--; grew = true; }
    if (g.r2 < ext.r && rowHas(g.r2 + 1)) { g.r2++; grew = true; }
    if (g.c1 > 0 && colHas(g.c1 - 1)) { g.c1--; grew = true; }
    if (g.c2 < ext.c && colHas(g.c2 + 1)) { g.c2++; grew = true; }
  }
  return g;
}

/* ---------- filter ---------- */
export function cellText(ev, book, sh, si, r, c) {
  const v = ev.value(si, r, c);
  const st = book.styles[styleIndexAt(sh, r, c)] || {};
  return formatValue(v instanceof SErr ? v : v, st.fmt).text;
}
export function passesCond(cond, v, text) {
  if (!cond) return true;
  const empty = v === null || v === '';
  const num = (x) => (typeof x === 'number' ? x : Number(x));
  const a = cond.v; const t = String(text).toLowerCase(); const q = String(a ?? '').toLowerCase();
  switch (cond.op) {
    case 'blank': return empty;
    case 'notBlank': return !empty;
    case 'contains': return t.includes(q);
    case 'notContains': return !t.includes(q);
    case 'begins': return t.startsWith(q);
    case 'ends': return t.endsWith(q);
    case 'eq': return typeof v === 'number' && a !== '' && !Number.isNaN(num(a)) ? v === num(a) : t === q;
    case 'ne': return typeof v === 'number' && a !== '' && !Number.isNaN(num(a)) ? v !== num(a) : t !== q;
    case 'gt': return typeof v === 'number' && v > num(a);
    case 'ge': return typeof v === 'number' && v >= num(a);
    case 'lt': return typeof v === 'number' && v < num(a);
    case 'le': return typeof v === 'number' && v <= num(a);
    case 'between': return typeof v === 'number' && v >= num(a) && v <= num(cond.v2);
    default: return true;
  }
}
export function computeFiltered(book, sh, ev, si) {
  const f = sh.filter;
  if (!f || !f.ref || !f.cols) return null;
  const active = Object.keys(f.cols).filter((c) => { const x = f.cols[c]; return x && ((x.hide && x.hide.length) || x.cond); });
  if (!active.length) return null;
  const out = {};
  for (let r = f.ref.r1 + 1; r <= f.ref.r2; r++) {
    for (const ck of active) {
      const c = Number(ck); const x = f.cols[ck];
      const v = ev.value(si, r, c); const text = cellText(ev, book, sh, si, r, c);
      if (x.hide && x.hide.includes(text)) { out[r] = true; break; }
      if (x.cond && !passesCond(x.cond, v, text)) { out[r] = true; break; }
    }
  }
  return out;
}

/* ---------- autofit ---------- */
export function autofitCols(book, sh, si, ev, idxs, ext) {
  const out = {};
  idxs.forEach((c) => {
    let w = 0;
    for (let r = 0; r <= Math.min(ext.r, 5000); r++) {
      const cell = sh.cells[keyOf(r, c)];
      if (!cell) continue;
      const v = ev.value(si, r, c);
      if (v === null || v === '') continue;
      const st = book.styles[styleIndexAt(sh, r, c)] || {};
      if (st.wrap === 'wrap') continue;
      const merged = sh.merges.some((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2 && m.c2 > m.c1);
      if (merged) continue;
      const t = typeof v === 'object' && !(v instanceof SErr) ? '' : formatValue(v, st.fmt).text;
      const filterPad = sh.filter && sh.filter.ref && r === sh.filter.ref.r1 && c >= sh.filter.ref.c1 && c <= sh.filter.ref.c2 ? 20 : 0;
      w = Math.max(w, measureText(t, fontString(st, 1)) + 14 + (st.ind || 0) * 9 + filterPad);
    }
    out[c] = Math.max(24, Math.min(600, Math.ceil(w || DEFAULT_COLW)));
  });
  return out;
}
export function autofitRows(book, sh, si, ev, idxs, ext) {
  const out = {};
  idxs.forEach((r) => {
    let h = DEFAULT_ROWH;
    for (let c = 0; c <= ext.c; c++) {
      const cell = sh.cells[keyOf(r, c)];
      if (!cell) continue;
      const st = book.styles[styleIndexAt(sh, r, c)] || {};
      const fs = ((st.fs || 11) * 96) / 72;
      let lines = 1;
      if (st.wrap === 'wrap') {
        const v = ev.value(si, r, c); if (v === null || v === '') continue;
        const t = formatValue(v, st.fmt).text;
        const colW = sh.colW[c] || DEFAULT_COLW;
        lines = wrapLines(t, fontString(st, 1), Math.max(10, colW - 8));
      } else {
        const v = ev.value(si, r, c); if (typeof v === 'string' && v.includes('\n')) lines = v.split('\n').length;
      }
      h = Math.max(h, Math.ceil(lines * fs * 1.25 + 8));
    }
    out[r] = h;
  });
  return out;
}

/* ---------- stats for status bar ---------- */
export function selectionStats(ev, si, sel, ext) {
  let count = 0; let nums = 0; let sum = 0; let min = Infinity; let max = -Infinity;
  const seen = new Set();
  sel.ranges.forEach((g0) => {
    const g = clampToUsed(g0, ext);
    if (g0.r1 > ext.r || g0.c1 > ext.c) return;
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const k = r * 100000 + c; if (seen.has(k)) continue; seen.add(k);
      const v = ev.value(si, r, c);
      if (v === null || v === '') continue;
      count++;
      if (typeof v === 'number') { nums++; sum += v; if (v < min) min = v; if (v > max) max = v; }
    }
  });
  return { count, nums, sum, avg: nums ? sum / nums : 0, min: nums ? min : 0, max: nums ? max : 0 };
}

/* ---------- import helpers ---------- */
export function bookFromRows(rows, name = 'Sheet1') {
  const b = newBook();
  b.sheets[0].name = name;
  const d = new Draft(b);
  const sh = d.sheet(0);
  let maxC = 0;
  rows.forEach((row, r) => {
    row.forEach((t, c) => { if (t !== '' && t !== null && t !== undefined) setCellInput(d, 0, r, c, typeof t === 'string' ? t : String(t)); });
    maxC = Math.max(maxC, row.length);
  });
  sh.rows = Math.max(1000, rows.length + 100); sh.cols = Math.max(26, maxC + 5);
  const out = d.done();
  out.active = out.sheets[0].id;
  return out;
}
export function rowsFromJson(data) {
  if (!Array.isArray(data)) {
    if (data && typeof data === 'object') {
      const arr = Object.values(data).find((v) => Array.isArray(v));
      if (arr) return rowsFromJson(arr);
    }
    return null;
  }
  if (!data.length) return [];
  if (data.every((x) => Array.isArray(x))) return data.map((r) => r.map((v) => (v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))));
  if (data.every((x) => x && typeof x === 'object')) {
    const keys = []; data.forEach((o) => Object.keys(o).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
    return [keys, ...data.map((o) => keys.map((k) => { const v = o[k]; return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); }))];
  }
  return data.map((v) => [String(v)]);
}

/* ---------- export helpers ---------- */
export function sheetRows(book, ev, si, formatted = true) {
  const sh = book.sheets[si];
  const ext = ev.usedExtent(si);
  const rows = [];
  for (let r = 0; r <= ext.r; r++) {
    if ((sh.hidden.rows && sh.hidden.rows[r])) continue;
    const row = [];
    for (let c = 0; c <= ext.c; c++) {
      if (sh.hidden.cols && sh.hidden.cols[c]) continue;
      const v = ev.value(si, r, c);
      if (v === null) { row.push(''); continue; }
      if (v instanceof SErr) { row.push(v.code); continue; }
      if (typeof v === 'object') { row.push(''); continue; }
      if (formatted) { const st = book.styles[styleIndexAt(sh, r, c)] || {}; row.push(formatValue(v, st.fmt).text); } else row.push(typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v);
    }
    rows.push(row);
  }
  return rows;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function sheetToHtmlTable(book, ev, si, opts = {}) {
  const sh = book.sheets[si];
  const ext = ev.usedExtent(si);
  const colsShown = []; for (let c = 0; c <= ext.c; c++) if (!(sh.hidden.cols && sh.hidden.cols[c])) colsShown.push(c);
  const covered = new Set(); const mergeAtTL = new Map();
  sh.merges.forEach((m) => { mergeAtTL.set(keyOf(m.r1, m.c1), m); for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(keyOf(r, c)); });
  let html = `<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt"${opts.grid ? '' : ''}>`;
  if (opts.colgroup !== false) html += '<colgroup>' + colsShown.map((c) => `<col style="width:${sh.colW[c] || DEFAULT_COLW}px">`).join('') + '</colgroup>';
  for (let r = 0; r <= ext.r; r++) {
    if ((sh.hidden.rows && sh.hidden.rows[r]) || (opts.filtered && opts.filtered[r])) continue;
    html += `<tr style="height:${sh.rowH[r] || DEFAULT_ROWH}px">`;
    for (const c of colsShown) {
      const k = keyOf(r, c);
      if (covered.has(k)) continue;
      const st = book.styles[styleIndexAt(sh, r, c)] || {};
      const v = ev.value(si, r, c);
      const text = v === null ? '' : typeof v === 'object' && !(v instanceof SErr) ? '' : formatValue(v, st.fmt).text;
      const m = mergeAtTL.get(k);
      const css = [];
      if (st.b) css.push('font-weight:700'); if (st.i) css.push('font-style:italic');
      const deco = [st.u ? 'underline' : '', st.st ? 'line-through' : ''].filter(Boolean).join(' '); if (deco) css.push('text-decoration:' + deco);
      if (st.fs) css.push(`font-size:${st.fs}pt`); if (st.ff) css.push(`font-family:'${st.ff}'`);
      if (st.fc) css.push('color:' + st.fc); if (st.bg) css.push('background:' + st.bg);
      const ha = st.ha || (typeof v === 'number' ? 'right' : v === true || v === false || v instanceof SErr ? 'center' : 'left'); css.push('text-align:' + ha);
      css.push('vertical-align:' + (st.va === 'top' ? 'top' : st.va === 'middle' ? 'middle' : 'bottom'));
      if (st.wrap === 'wrap') css.push('white-space:pre-wrap'); else css.push('white-space:nowrap');
      const hasBd = !!st.bd;
      css.push(opts.grid && !hasBd ? 'border:1px solid #d0d4da' : 'border:1px solid transparent');
      if (st.bd) { const W = { thin: 1, medium: 2, thick: 3, dashed: 1, dotted: 1, double: 3 }; ['t:top', 'r:right', 'b:bottom', 'l:left'].forEach((p) => { const [s, nm] = p.split(':'); const b = st.bd[s]; if (b) css.push(`border-${nm}:${W[b[0]] || 1}px ${b[0] === 'dashed' ? 'dashed' : b[0] === 'dotted' ? 'dotted' : b[0] === 'double' ? 'double' : 'solid'} ${b[1] || '#000'}`); }); }
      css.push('padding:2px 4px');
      html += `<td${m ? ` colspan="${m.c2 - m.c1 + 1}" rowspan="${m.r2 - m.r1 + 1}"` : ''} style="${css.join(';')}">${esc(text).replace(/\n/g, '<br>')}</td>`;
    }
    html += '</tr>';
  }
  return html + '</table>';
}

/* chart placement: just right of the data */
export function chartSpot(sh, g, w = 480, h = 300) {
  const ax = new Axis(DEFAULT_COLW, sh.colW, Math.max(sh.cols, g.c2 + 2));
  const ay = new Axis(DEFAULT_ROWH, sh.rowH, Math.max(sh.rows, g.r2 + 2));
  return { x: Math.round(ax.offset(g.c2 + 1) + 24), y: Math.round(ay.offset(g.r1)), w, h };
}
export const chartRangeText = (book, si, g) => {
  const name = book.sheets[si].name;
  return `${quoteSheet(name)}!${rangeText(g)}`;
};
