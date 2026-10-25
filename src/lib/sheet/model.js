// Workbook data model: pure functions that return new immutable-ish book objects.
import { MAX_COLS, MAX_ROWS, colIndex, colName, keyOf, parseCell, parseRange, rangeText } from './addr.js';
import { rewriteRefs, shiftFormula, quoteSheet } from './parser.js';
import { parseNumberText } from './fnutil.js';
import { parseDateTime, MONTHS, DAYS } from './dates.js';

export const DEFAULT_COLW = 100;
export const DEFAULT_ROWH = 24;
export const GRID_ROWS = 1000;
export const GRID_COLS = 26;

let counter = 0;
export const nid = (p = 'id') => p + Math.random().toString(36).slice(2, 8) + (counter++).toString(36);

export function newSheet(name) {
  return {
    id: nid('sh'), name, cells: {}, colW: {}, rowH: {}, hidden: { rows: {}, cols: {} }, freeze: { r: 0, c: 0 }, merges: [], cf: [], dv: [], charts: [], notes: {},
    filter: null, grid: true, tab: null, rows: GRID_ROWS, cols: GRID_COLS, colS: {}, rowS: {},
  };
}
export const newBook = () => ({ v: 2, sheets: [newSheet('Sheet1')], active: null, names: {}, styles: [{}] });

/* ---------- cell key helpers ---------- */
const KEY_RE = /^([A-Z]+)(\d+)$/;
export function splitKey(k) {
  const m = KEY_RE.exec(k);
  return { r: +m[2] - 1, c: colIndex(m[1]) };
}
export const activeIndex = (book) => {
  const i = book.sheets.findIndex((s) => s.id === book.active);
  return i < 0 ? 0 : i;
};

/* ---------- styles ---------- */
const BOOL_KEYS = ['b', 'i', 'u', 'st'];
export function normStyle(o) {
  const out = {};
  Object.keys(o).sort().forEach((k) => {
    let v = o[k];
    if (v === undefined || v === null || v === '' || v === false) return;
    if (BOOL_KEYS.includes(k) && v !== true) return;
    if (k === 'fmt' && v === 'General') return;
    if (k === 'bd') {
      const bd = {};
      ['t', 'r', 'b', 'l'].forEach((s) => { if (v[s]) bd[s] = v[s]; });
      if (!Object.keys(bd).length) return;
      v = bd;
    }
    if ((k === 'ind' || k === 'rot') && !v) return;
    out[k] = v;
  });
  return out;
}

export class Draft {
  constructor(book) {
    this.book = { ...book, sheets: [...book.sheets] };
    this.own = new Set();
    this.smap = null;
    this.stylesOwn = false;
  }

  sheet(si) {
    const sh = this.book.sheets[si];
    if (!this.own.has(sh.id)) {
      const copy = { ...sh, cells: { ...sh.cells } };
      this.book.sheets[si] = copy;
      this.own.add(sh.id);
      return copy;
    }
    return sh;
  }

  /* replace a sheet wholesale (fn gets the owned copy) */
  patch(si, patch) { Object.assign(this.sheet(si), patch); }

  style(obj) {
    const n = normStyle(obj);
    const key = JSON.stringify(n);
    if (!this.smap) { this.smap = new Map(); this.book.styles.forEach((s, i) => { const k = JSON.stringify(s); if (!this.smap.has(k)) this.smap.set(k, i); }); }
    let i = this.smap.get(key);
    if (i === undefined) {
      if (!this.stylesOwn) { this.book.styles = [...this.book.styles]; this.stylesOwn = true; }
      i = this.book.styles.length;
      this.book.styles.push(n);
      this.smap.set(key, i);
    }
    return i;
  }

  styleOf(idx) { return (idx !== undefined && this.book.styles[idx]) || {}; }
  done() { return this.book; }
}

export function styleIndexAt(sh, r, c) {
  const cell = sh.cells[keyOf(r, c)];
  if (cell && cell.s !== undefined) return cell.s;
  const rs = sh.rowS && sh.rowS[r];
  if (rs !== undefined) return rs;
  const cs = sh.colS && sh.colS[c];
  return cs !== undefined ? cs : 0;
}
export const styleAt = (book, sh, r, c) => book.styles[styleIndexAt(sh, r, c)] || {};

/* ---------- input parsing ---------- */
const DATE_FMTS = { iso: 'yyyy-mm-dd', us: 'm/d/yyyy', word: 'mmm d, yyyy', dmy: 'd-mmm-yy' };
export function parseInput(text, curFmt) {
  if (text === '' || text === null || text === undefined) return { t: 'empty' };
  if (typeof text !== 'string') return { t: typeof text === 'number' ? 'number' : 'text', v: text };
  if (text[0] === '=' && text.length > 1) return { t: 'formula', f: text };
  if (text[0] === "'") return { t: 'text', v: text.slice(1) };
  if (curFmt === '@') return { t: 'text', v: text };
  const s = text.trim();
  if (s === '') return { t: 'text', v: text };
  const low = s.toLowerCase();
  if (low === 'true') return { t: 'bool', v: true };
  if (low === 'false') return { t: 'bool', v: false };
  const n = parseNumberText(s);
  if (n !== null) {
    let fmt;
    if (/%\s*$/.test(s)) { const dec = /\.(\d+)\s*%/.exec(s); fmt = dec ? '0.' + '0'.repeat(dec[1].length) + '%' : '0%'; }
    else if (/^\(?-?\s*\$/.test(s) || /^\$/.test(s.replace(/^[-+(]\s*/, ''))) { const dec = /\.(\d+)/.exec(s); fmt = '$#,##0' + (dec ? '.' + '0'.repeat(dec[1].length) : '.00'); }
    else if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) { const dec = /\.(\d+)/.exec(s); fmt = '#,##0' + (dec ? '.' + '0'.repeat(dec[1].length) : ''); }
    return { t: 'number', v: n, fmt };
  }
  const d = parseDateTime(s);
  if (d !== null && /[\d]/.test(s) && !/^\d+$/.test(s)) {
    const hasDate = Math.floor(d) !== d || /[-/]|\b[A-Za-z]{3}/.test(s);
    const timeOnly = /^\d{1,2}:\d{2}/.test(s) && !/[-/]/.test(s);
    let fmt;
    if (timeOnly) fmt = /am|pm/i.test(s) ? (/:\d{2}:\d{2}/.test(s) ? 'h:mm:ss AM/PM' : 'h:mm AM/PM') : /:\d{2}:\d{2}/.test(s) ? 'h:mm:ss' : 'h:mm';
    else {
      const base = /^\d{4}[-/]/.test(s) ? DATE_FMTS.iso : /[A-Za-z]/.test(s) ? DATE_FMTS.word : DATE_FMTS.us;
      fmt = /\d:\d/.test(s) ? base + ' h:mm' + (/:\d{2}:\d{2}/.test(s) ? ':ss' : '') : base;
    }
    void hasDate;
    return { t: 'number', v: d, fmt };
  }
  return { t: 'text', v: text };
}

const DATE_FUNCS = /^=\s*(TODAY|NOW|DATE|EDATE|EOMONTH|DATEVALUE|WORKDAY)\(/i;
export function formulaFmtHint(f) {
  const m = DATE_FUNCS.exec(f);
  if (!m) return null;
  const n = m[1].toUpperCase();
  return n === 'NOW' ? 'm/d/yyyy h:mm' : 'm/d/yyyy';
}

/* write one cell from typed text */
export function setCellInput(d, si, r, c, text) {
  const sh = d.sheet(si);
  const k = keyOf(r, c);
  const old = sh.cells[k];
  const sidx = styleIndexAt(sh, r, c);
  const st = d.styleOf(sidx);
  const p = parseInput(text, st.fmt);
  if (p.t === 'empty') {
    if (old && old.s !== undefined) sh.cells[k] = { s: old.s }; else delete sh.cells[k];
    return;
  }
  let s = old && old.s !== undefined ? old.s : (sh.cells[k] ? undefined : (sidx || undefined));
  if (old && old.s === undefined && sidx) s = sidx;
  const hint = p.t === 'formula' ? formulaFmtHint(p.f) : p.fmt;
  if (hint && (!st.fmt || st.fmt === 'General')) s = d.style({ ...st, fmt: hint });
  const cell = p.t === 'formula' ? { f: p.f } : { v: p.v };
  if (s) cell.s = s;
  sh.cells[k] = cell;
}

/* raw text shown in the editor for a cell */
export function cellEditText(cell, value) {
  if (!cell) return '';
  if (cell.f) return cell.f;
  const v = cell.v;
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/* ---------- ranges ---------- */
export const normRange = (g) => ({ r1: Math.min(g.r1, g.r2), c1: Math.min(g.c1, g.c2), r2: Math.max(g.r1, g.r2), c2: Math.max(g.c1, g.c2) });
export const isFullCol = (g) => g.r1 === 0 && g.r2 >= MAX_ROWS - 1;
export const isFullRow = (g) => g.c1 === 0 && g.c2 >= MAX_COLS - 1;

export function usedBounds(sh) {
  let mr = -1; let mc = -1;
  for (const k in sh.cells) {
    const cell = sh.cells[k];
    if (cell.v === undefined && !cell.f && cell.s === undefined) continue;
    const { r, c } = splitKey(k);
    if (r > mr) mr = r; if (c > mc) mc = c;
  }
  return { r: mr, c: mc };
}
export function contentBounds(sh) {
  let mr = -1; let mc = -1;
  for (const k in sh.cells) {
    const cell = sh.cells[k];
    if (cell.v === undefined && !cell.f) continue;
    const { r, c } = splitKey(k);
    if (r > mr) mr = r; if (c > mc) mc = c;
  }
  return { r: mr, c: mc };
}

/* clamp a possibly-infinite range to the used area (or the grid for formatting) */
export function clampRange(g, bound) {
  return { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, bound.r), c2: Math.min(g.c2, bound.c) };
}

/* ---------- style application ---------- */
function mergeBorders(cur, patch) {
  const out = { ...(cur || {}) };
  Object.keys(patch).forEach((s) => { if (patch[s] === null) delete out[s]; else out[s] = patch[s]; });
  return out;
}
export function applyStyleToRanges(d, si, ranges, patchOrFn) {
  const sh0 = d.sheet(si);
  const mk = (cur) => {
    const p = typeof patchOrFn === 'function' ? patchOrFn(cur) : patchOrFn;
    const next = { ...cur };
    Object.keys(p).forEach((k) => {
      if (k === 'bd') next.bd = mergeBorders(cur.bd, p.bd);
      else next[k] = p[k];
    });
    return next;
  };
  const colS = { ...(sh0.colS || {}) }; const rowS = { ...(sh0.rowS || {}) };
  let colChanged = false; let rowChanged = false;
  const bound = { r: Math.max(sh0.rows, 1) - 1, c: Math.max(sh0.cols, 1) - 1 };
  const fullCols = []; const fullRows = [];
  ranges.forEach((g0) => {
    const g = normRange(g0);
    if (isFullCol(g)) { for (let c = g.c1; c <= Math.min(g.c2, bound.c); c++) fullCols.push(c); return; }
    if (isFullRow(g)) { for (let r = g.r1; r <= Math.min(g.r2, bound.r); r++) fullRows.push(r); return; }
    const cg = clampRange(g, bound);
    const cache = new Map();
    for (let r = cg.r1; r <= cg.r2; r++) {
      for (let c = cg.c1; c <= cg.c2; c++) {
        const k = keyOf(r, c);
        const cell = sh0.cells[k];
        const idx = styleIndexAt(sh0, r, c);
        let ni = cache.get(idx);
        if (ni === undefined) { ni = d.style(mk(d.styleOf(idx))); cache.set(idx, ni); }
        if (ni === idx && !cell) continue;
        sh0.cells[k] = cell ? { ...cell, s: ni } : { s: ni };
      }
    }
  });
  const touchedCols = new Set(fullCols); const touchedRows = new Set(fullRows);
  fullCols.forEach((c) => { colS[c] = d.style(mk(d.styleOf(colS[c]))); colChanged = true; });
  fullRows.forEach((r) => { rowS[r] = d.style(mk(d.styleOf(rowS[r]))); rowChanged = true; });
  if (touchedCols.size || touchedRows.size) {
    const cache = new Map();
    for (const k in sh0.cells) {
      const { r, c } = splitKey(k);
      if (!touchedCols.has(c) && !touchedRows.has(r)) continue;
      const cell = sh0.cells[k];
      const idx = styleIndexAt(sh0, r, c);
      let ni = cache.get(idx);
      if (ni === undefined) { ni = d.style(mk(d.styleOf(idx))); cache.set(idx, ni); }
      sh0.cells[k] = { ...cell, s: ni };
    }
    // cells in a touched row/col without explicit cells inherit via rowS/colS
  }
  if (colChanged) sh0.colS = colS;
  if (rowChanged) sh0.rowS = rowS;
}

export function clearRanges(d, si, ranges, what = 'contents') {
  const sh = d.sheet(si);
  ranges.forEach((g0) => {
    const g = normRange(g0);
    const full = isFullCol(g) || isFullRow(g) || (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > 20000;
    const keys = full ? Object.keys(sh.cells) : null;
    const visit = (k, r, c) => {
      const cell = sh.cells[k];
      if (!cell) return;
      if (what === 'formats') { const n = { ...cell }; delete n.s; if (n.v === undefined && !n.f) delete sh.cells[k]; else sh.cells[k] = n; }
      else if (what === 'all') delete sh.cells[k];
      else if (cell.s !== undefined) sh.cells[k] = { s: cell.s };
      else delete sh.cells[k];
    };
    if (full) { keys.forEach((k) => { const { r, c } = splitKey(k); if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) visit(k, r, c); }); }
    else for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) visit(keyOf(r, c), r, c);
    if (what === 'formats' || what === 'all') {
      if (isFullCol(g) && sh.colS) { const n = { ...sh.colS }; for (let c = g.c1; c <= g.c2; c++) delete n[c]; sh.colS = n; }
      if (isFullRow(g) && sh.rowS) { const n = { ...sh.rowS }; for (let r = g.r1; r <= g.r2; r++) delete n[r]; sh.rowS = n; }
    }
    if (what === 'all') {
      sh.merges = sh.merges.filter((m) => !(m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2));
      const notes = { ...sh.notes }; for (const k in notes) { const { r, c } = splitKey(k); if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) delete notes[k]; } sh.notes = notes;
    }
  });
}

/* ---------- merges ---------- */
export function mergeRanges(d, si, g0, mode = 'all') {
  const g = normRange(g0);
  const sh = d.sheet(si);
  let parts = [g];
  if (mode === 'h') parts = Array.from({ length: g.r2 - g.r1 + 1 }, (_, i) => ({ r1: g.r1 + i, r2: g.r1 + i, c1: g.c1, c2: g.c2 }));
  if (mode === 'v') parts = Array.from({ length: g.c2 - g.c1 + 1 }, (_, i) => ({ r1: g.r1, r2: g.r2, c1: g.c1 + i, c2: g.c1 + i }));
  parts = parts.filter((p) => p.r2 > p.r1 || p.c2 > p.c1);
  const inter = (a, b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
  let merges = sh.merges.filter((m) => !parts.some((p) => inter(m, p)));
  parts.forEach((p) => {
    // keep first non-empty value in top-left
    const tl = keyOf(p.r1, p.c1);
    let keep = sh.cells[tl];
    if (!keep || (keep.v === undefined && !keep.f)) {
      outer: for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) { const x = sh.cells[keyOf(r, c)]; if (x && (x.f || (x.v !== undefined && x.v !== ''))) { keep = { ...x, s: keep ? keep.s : x.s }; break outer; } }
    }
    for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) {
      const k = keyOf(r, c); if (k === tl) continue;
      const x = sh.cells[k]; if (x && x.s !== undefined) sh.cells[k] = { s: x.s }; else delete sh.cells[k];
    }
    if (keep) sh.cells[tl] = keep;
    merges.push(p);
  });
  sh.merges = merges;
}
export function unmergeRanges(d, si, g0) {
  const g = normRange(g0);
  const sh = d.sheet(si);
  sh.merges = sh.merges.filter((m) => !(m.r1 <= g.r2 && g.r1 <= m.r2 && m.c1 <= g.c2 && g.c1 <= m.c2));
}
export const mergeAt = (sh, r, c) => sh.merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);

/* ---------- structural changes ---------- */
const pointIns = (at, n) => (p) => (p >= at ? p + n : p);
const rangeIns = (at, n) => (a, b) => [a >= at ? a + n : a, b >= at ? b + n : b];
const pointDel = (at, n) => (p) => (p < at ? p : p < at + n ? null : p - n);
const rangeDel = (at, n) => (a, b) => {
  if (a >= at + n) return [a - n, b - n];
  if (b < at) return [a, b];
  const na = a < at ? a : at;
  const nb = b >= at + n ? b - n : at - 1;
  return nb < na ? null : [na, nb];
};

function rewriteForAxis(formula, ownerSheetName, targetName, axis, pMap, rMap) {
  const tl = targetName.toLowerCase();
  const own = (ownerSheetName || '').toLowerCase();
  return rewriteRefs(formula, (tok) => {
    const sn = (tok.sheet === null ? own : tok.sheet.toLowerCase());
    if (sn !== tl) return null;
    if (tok.kind === 'col' && axis === 'r') return null;
    if (tok.kind === 'row' && axis === 'c') return null;
    const key = axis;
    if (!tok.b) {
      const np = pMap(tok.a[key]);
      if (np === null) return '#REF!';
      return { ...tok, a: { ...tok.a, [key]: np } };
    }
    const res = rMap(Math.min(tok.a[key], tok.b[key]), Math.max(tok.a[key], tok.b[key]));
    if (res === null) return '#REF!';
    const flipped = tok.a[key] > tok.b[key];
    return { ...tok, a: { ...tok.a, [key]: res[flipped ? 1 : 0] }, b: { ...tok.b, [key]: res[flipped ? 0 : 1] } };
  });
}

function rewriteAllFormulas(d, fn) {
  d.book.sheets.forEach((s0, sj) => {
    let owned = null;
    for (const k in s0.cells) {
      const cell = s0.cells[k];
      if (!cell.f) continue;
      const nf = fn(cell.f, s0.name);
      if (nf !== cell.f) { if (!owned) owned = d.sheet(sj); owned.cells[k] = { ...cell, f: nf }; }
    }
    if (s0.charts && s0.charts.length) {
      const sh = d.sheet(sj);
      sh.charts = sh.charts.map((ch) => {
        if (!ch.range) return ch;
        const nf = fn('=' + ch.range, sh.name);
        return nf === '=' + ch.range ? ch : { ...ch, range: nf.slice(1) };
      });
    }
  });
  const names = {};
  let changed = false;
  Object.entries(d.book.names || {}).forEach(([k, v]) => { const nf = fn(v.startsWith('=') ? v : '=' + v, ''); if (nf !== (v.startsWith('=') ? v : '=' + v)) changed = true; names[k] = nf; });
  if (changed) d.book.names = names;
}

const remapKeyed = (obj, fn) => {
  const out = {};
  Object.keys(obj || {}).forEach((i) => { const ni = fn(+i); if (ni !== null) out[ni] = obj[i]; });
  return out;
};

function remapRangeList(list, axis, rMap) {
  const out = [];
  list.forEach((item) => {
    const src = item.ranges || [item];
    const nr = [];
    src.forEach((g) => {
      const a = axis === 'r' ? [g.r1, g.r2] : [g.c1, g.c2];
      const res = rMap(a[0], a[1]);
      if (res) nr.push(axis === 'r' ? { ...g, r1: res[0], r2: res[1] } : { ...g, c1: res[0], c2: res[1] });
    });
    if (!nr.length) return;
    out.push(item.ranges ? { ...item, ranges: nr } : nr[0]);
  });
  return out;
}

export function structural(d, si, axis, at, n, kind /* 'insert' | 'delete' */) {
  const target = d.book.sheets[si].name;
  const ins = kind === 'insert';
  const pMap = ins ? pointIns(at, n) : pointDel(at, n);
  const rMap = ins ? rangeIns(at, n) : rangeDel(at, n);
  rewriteAllFormulas(d, (f, owner) => rewriteForAxis(f, owner, target, axis, pMap, rMap));
  const sh = d.sheet(si);
  const cells = {};
  for (const k in sh.cells) {
    const { r, c } = splitKey(k);
    const v = axis === 'r' ? r : c;
    const nv = pMap(v);
    if (nv === null) continue;
    cells[axis === 'r' ? keyOf(nv, c) : keyOf(r, nv)] = sh.cells[k];
  }
  sh.cells = cells;
  const mapIdx = (i) => pMap(i);
  if (axis === 'r') {
    sh.rowH = remapKeyed(sh.rowH, mapIdx); sh.rowS = remapKeyed(sh.rowS, mapIdx);
    sh.hidden = { ...sh.hidden, rows: remapKeyed(sh.hidden.rows, mapIdx) };
    sh.rows = Math.min(MAX_ROWS, Math.max(GRID_ROWS, sh.rows + (ins ? n : -n)));
  } else {
    sh.colW = remapKeyed(sh.colW, mapIdx); sh.colS = remapKeyed(sh.colS, mapIdx);
    sh.hidden = { ...sh.hidden, cols: remapKeyed(sh.hidden.cols, mapIdx) };
    sh.cols = Math.min(MAX_COLS, Math.max(GRID_COLS, sh.cols + (ins ? n : -n)));
  }
  sh.merges = remapRangeList(sh.merges, axis, rMap);
  sh.cf = remapRangeList(sh.cf, axis, rMap);
  sh.dv = remapRangeList(sh.dv, axis, rMap);
  const notes = {};
  for (const k in sh.notes) { const { r, c } = splitKey(k); const v = axis === 'r' ? r : c; const nv = pMap(v); if (nv !== null) notes[axis === 'r' ? keyOf(nv, c) : keyOf(r, nv)] = sh.notes[k]; }
  sh.notes = notes;
  if (sh.filter && sh.filter.ref) {
    const g = sh.filter.ref; const res = rMap(axis === 'r' ? g.r1 : g.c1, axis === 'r' ? g.r2 : g.c2);
    sh.filter = res ? { ...sh.filter, ref: axis === 'r' ? { ...g, r1: res[0], r2: res[1] } : { ...g, c1: res[0], c2: res[1] } } : null;
  }
  const fz = sh.freeze || { r: 0, c: 0 };
  if (axis === 'r' && fz.r > 0) sh.freeze = { ...fz, r: Math.max(0, ins ? (at < fz.r ? fz.r + n : fz.r) : fz.r - Math.max(0, Math.min(fz.r, at + n) - at)) };
  if (axis === 'c' && fz.c > 0) sh.freeze = { ...fz, c: Math.max(0, ins ? (at < fz.c ? fz.c + n : fz.c) : fz.c - Math.max(0, Math.min(fz.c, at + n) - at)) };
}

/* ---------- sheet-level operations ---------- */
export function uniqueSheetName(book, base) {
  const names = new Set(book.sheets.map((s) => s.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let i = 2; while (names.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}
export function addSheet(d, name, at) {
  const sh = newSheet(uniqueSheetName(d.book, name || `Sheet${d.book.sheets.length + 1}`));
  const arr = [...d.book.sheets];
  arr.splice(at === undefined ? arr.length : at, 0, sh);
  d.book.sheets = arr;
  d.book.active = sh.id;
  return sh;
}
export function renameSheet(d, si, newName) {
  const old = d.book.sheets[si].name;
  if (old === newName) return;
  rewriteAllFormulas(d, (f) => rewriteRefs(f, (tok) => (tok.sheet && tok.sheet.toLowerCase() === old.toLowerCase() ? { ...tok, sheet: newName } : null)));
  d.patch(si, { name: newName });
}
export function deleteSheet(d, si) {
  const old = d.book.sheets[si];
  if (d.book.sheets.length < 2) return false;
  rewriteAllFormulas(d, (f, owner) => rewriteRefs(f, (tok) => ((tok.sheet || owner || '').toLowerCase() === old.name.toLowerCase() && owner.toLowerCase() !== old.name.toLowerCase() ? '#REF!' : null)));
  const arr = d.book.sheets.filter((_, i) => i !== si);
  d.book.sheets = arr;
  if (d.book.active === old.id) d.book.active = arr[Math.min(si, arr.length - 1)].id;
  return true;
}
export function duplicateSheet(d, si) {
  const src = d.book.sheets[si];
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = nid('sh');
  copy.name = uniqueSheetName(d.book, src.name + ' copy');
  copy.charts = (copy.charts || []).map((c) => ({ ...c, id: nid('ch') }));
  const arr = [...d.book.sheets]; arr.splice(si + 1, 0, copy);
  d.book.sheets = arr; d.book.active = copy.id;
}
export function moveSheet(d, si, to) {
  const arr = [...d.book.sheets]; const [s] = arr.splice(si, 1); arr.splice(Math.max(0, Math.min(arr.length, to)), 0, s);
  d.book.sheets = arr;
}

/* ---------- moving a block (cut & paste / drag) ---------- */
export function moveBlock(d, si, src0, dr, dc, destSi = si) {
  const src = normRange(src0);
  const from = d.book.sheets[si]; const fromName = from.name;
  const toName = d.book.sheets[destSi].name;
  // references pointing into the block follow it
  rewriteAllFormulas(d, (f, owner) => rewriteRefs(f, (tok) => {
    const sn = (tok.sheet === null ? owner : tok.sheet).toLowerCase();
    if (sn !== fromName.toLowerCase() || tok.kind === 'col' || tok.kind === 'row') return null;
    const a = tok.a; const b = tok.b || tok.a;
    const r1 = Math.min(a.r, b.r); const r2 = Math.max(a.r, b.r); const c1 = Math.min(a.c, b.c); const c2 = Math.max(a.c, b.c);
    if (r1 < src.r1 || r2 > src.r2 || c1 < src.c1 || c2 > src.c2) return null;
    const mv = (x) => ({ ...x, r: x.r + dr, c: x.c + dc });
    const nt = { ...tok, a: mv(tok.a), b: tok.b ? mv(tok.b) : null };
    if (destSi !== si) nt.sheet = toName;
    return nt;
  }));
  const sh = d.sheet(si);
  const dest = destSi === si ? sh : d.sheet(destSi);
  const moved = [];
  for (let r = src.r1; r <= src.r2; r++) for (let c = src.c1; c <= src.c2; c++) {
    const k = keyOf(r, c); const cell = sh.cells[k];
    if (cell) { moved.push([r + dr, c + dc, cell]); delete sh.cells[k]; }
  }
  // clear destination area first
  for (let r = src.r1 + dr; r <= src.r2 + dr; r++) for (let c = src.c1 + dc; c <= src.c2 + dc; c++) delete dest.cells[keyOf(r, c)];
  moved.forEach(([r, c, cell]) => { if (r >= 0 && c >= 0 && r < MAX_ROWS && c < MAX_COLS) dest.cells[keyOf(r, c)] = cell; });
}

/* ---------- clipboard ---------- */
export function copyBlock(book, sh, g0, getValue) {
  const g = normRange(g0);
  const cells = [];
  for (let r = g.r1; r <= g.r2; r++) {
    const row = [];
    for (let c = g.c1; c <= g.c2; c++) {
      const cell = sh.cells[keyOf(r, c)];
      const sidx = styleIndexAt(sh, r, c);
      const val = getValue ? getValue(r, c) : (cell ? cell.v : null);
      row.push({ f: cell ? cell.f : undefined, v: cell ? cell.v : undefined, val, st: sidx ? book.styles[sidx] : null, note: sh.notes[keyOf(r, c)] });
    }
    cells.push(row);
  }
  return { h: cells.length, w: cells[0].length, cells, src: g, merges: sh.merges.filter((m) => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2).map((m) => ({ r1: m.r1 - g.r1, r2: m.r2 - g.r1, c1: m.c1 - g.c1, c2: m.c2 - g.c1 })) };
}

export function pasteBlock(d, si, r0, c0, clip, mode = 'all', opts = {}) {
  const sh = d.sheet(si);
  const tr = mode === 'transpose';
  const H = tr ? clip.w : clip.h; const W = tr ? clip.h : clip.w;
  const dr = r0 - clip.src.r1; const dc = c0 - clip.src.c1;
  for (let i = 0; i < H; i++) {
    for (let j = 0; j < W; j++) {
      const r = r0 + i; const c = c0 + j;
      if (r >= MAX_ROWS || c >= MAX_COLS) continue;
      const src = tr ? clip.cells[j][i] : clip.cells[i][j];
      const k = keyOf(r, c);
      const old = sh.cells[k];
      const cell = {};
      if (mode === 'formats') {
        if (old && old.f) cell.f = old.f; else if (old && old.v !== undefined) cell.v = old.v;
      } else if (mode === 'values') {
        const v = src.val;
        if (v !== null && v !== undefined && typeof v !== 'object') cell.v = v;
        else if (src.f === undefined && src.v !== undefined) cell.v = src.v;
      } else if (src.f !== undefined) {
        cell.f = tr || opts.noShift ? src.f : shiftFormula(src.f, dr, dc);
      } else if (src.v !== undefined) cell.v = src.v;
      if (mode === 'all' || mode === 'formats' || mode === 'transpose') {
        if (src.st) cell.s = d.style(src.st); else if (mode !== 'all' || true) { /* no style */ }
      } else if (old && old.s !== undefined) cell.s = old.s;
      if (mode === 'formulas' && old && old.s !== undefined) cell.s = old.s;
      if (mode === 'all' && !src.st && old && old.s !== undefined && opts.keepStyle) cell.s = old.s;
      if (cell.f === undefined && cell.v === undefined && cell.s === undefined) { delete sh.cells[k]; continue; }
      sh.cells[k] = cell;
      if (mode !== 'values' && mode !== 'formulas' && src.note) { sh.notes = { ...sh.notes, [k]: src.note }; }
    }
  }
  if (mode === 'all' && clip.merges.length && !tr) {
    const inter = (a, b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
    const nm = clip.merges.map((m) => ({ r1: m.r1 + r0, r2: m.r2 + r0, c1: m.c1 + c0, c2: m.c2 + c0 }));
    sh.merges = [...sh.merges.filter((m) => !nm.some((x) => inter(m, x))), ...nm];
  }
}

/* ---------- TSV / text conversions ---------- */
export function clipToTSV(clip) {
  return clip.cells.map((row) => row.map((x) => {
    const v = x.val;
    const s = v === null || v === undefined ? '' : typeof v === 'object' && v.code ? v.code : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
    return /[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join('\t')).join('\n');
}
export function parseTSV(text) {
  const rows = []; let row = []; let cur = ''; let q = false; let i = 0;
  text = text.replace(/\r\n?/g, '\n');
  for (; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"' && cur === '') q = true;
    else if (ch === '\t') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/* paste plain text (TSV) as typed input */
export function pasteText(d, si, r0, c0, text) {
  const rows = parseTSV(text);
  rows.forEach((row, i) => row.forEach((t, j) => {
    if (r0 + i < MAX_ROWS && c0 + j < MAX_COLS) setCellInput(d, si, r0 + i, c0 + j, t);
  }));
  return { h: rows.length, w: rows.reduce((m, r) => Math.max(m, r.length), 0) };
}

/* ---------- sorting ---------- */
const emptyV = (v) => v === null || v === undefined || v === '';
export function cmpSort(a, b, desc) {
  const ea = emptyV(a); const eb = emptyV(b);
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
  const ra = rank(a); const rb = rank(b);
  let c;
  if (ra !== rb) c = ra - rb;
  else if (ra === 1) c = a.toLowerCase().localeCompare(b.toLowerCase(), undefined, { numeric: false });
  else if (ra === 0 || ra === 2) c = Number(a) - Number(b);
  else c = 0;
  return desc ? -c : c;
}
export function sortBlock(d, si, g0, keys, hasHeader, getValue) {
  const g = normRange(g0);
  const sh = d.sheet(si);
  const r1 = hasHeader ? g.r1 + 1 : g.r1;
  if (r1 >= g.r2) return;
  const rows = [];
  for (let r = r1; r <= g.r2; r++) {
    const cells = [];
    for (let c = g.c1; c <= g.c2; c++) cells.push(sh.cells[keyOf(r, c)]);
    rows.push({ r, cells, keys: keys.map((k) => getValue(r, k.col)) });
  }
  rows.sort((a, b) => {
    for (let i = 0; i < keys.length; i++) { const x = cmpSort(a.keys[i], b.keys[i], keys[i].desc); if (x) return x; }
    return a.r - b.r;
  });
  rows.forEach((row, i) => {
    const nr = r1 + i;
    row.cells.forEach((cell, j) => {
      const k = keyOf(nr, g.c1 + j);
      if (!cell) { delete sh.cells[k]; return; }
      sh.cells[k] = cell.f ? { ...cell, f: shiftFormula(cell.f, nr - row.r, 0) } : cell;
    });
  });
}

/* ---------- fill / series ---------- */
const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3)); const DAY_ABBR = DAYS.map((m) => m.slice(0, 3));
const LISTS = [MONTHS, MONTH_ABBR, DAYS, DAY_ABBR];
function listMatch(s) {
  const t = s.trim().toLowerCase();
  for (const L of LISTS) { const i = L.findIndex((x) => x.toLowerCase() === t); if (i >= 0) return { L, i, caps: s === s.toUpperCase() ? 'upper' : s === s.toLowerCase() ? 'lower' : 'title' }; }
  return null;
}
const applyCaps = (s, caps) => (caps === 'upper' ? s.toUpperCase() : caps === 'lower' ? s.toLowerCase() : s);
const trailingNum = (s) => { const m = /^(.*?)(-?\d+)$/.exec(s); return m && m[1] !== undefined && !/^-?\d+$/.test(s) ? { pre: m[1], n: parseInt(m[2], 10), w: m[2].replace('-', '').length, pad: /^0\d/.test(m[2]) } : null; };

/* produce a generator f(k) for k = 1.. giving the k-th value after the source list */
export function makeSeries(vals, isDateFmt, forward = true) {
  const n = vals.length;
  const nums = vals.every((v) => typeof v === 'number');
  if (nums) {
    if (n === 1) { const step = isDateFmt ? 1 : 0; return (k) => vals[0] + (forward ? 1 : -1) * k * step; }
    const diffs = vals.slice(1).map((v, i) => v - vals[i]);
    let step = diffs.every((x) => Math.abs(x - diffs[0]) < 1e-9) ? diffs[0] : (() => { // least-squares trend
      const xm = (n - 1) / 2; const ym = vals.reduce((a, b) => a + b, 0) / n; let sxy = 0; let sxx = 0; vals.forEach((v, i) => { sxy += (i - xm) * (v - ym); sxx += (i - xm) ** 2; }); return sxy / sxx; })();
    if (forward) return (k) => vals[n - 1] + step * k;
    return (k) => vals[0] - step * k;
  }
  if (vals.every((v) => typeof v === 'string')) {
    const lm = vals.map(listMatch);
    if (lm.every(Boolean) && lm.every((x) => x.L === lm[0].L)) {
      const L = lm[0].L; const step = n > 1 ? ((lm[1].i - lm[0].i + L.length) % L.length) || 1 : 1;
      return (k) => applyCaps(L[(((forward ? lm[n - 1].i + step * k : lm[0].i - step * k) % L.length) + L.length) % L.length], lm[0].caps);
    }
    const tn = vals.map(trailingNum);
    if (tn.every(Boolean) && tn.every((x) => x.pre === tn[0].pre)) {
      const step = n > 1 ? tn[1].n - tn[0].n : 1;
      const fmtN = (x) => { const s = String(Math.abs(x)); return (x < 0 ? '-' : '') + (tn[0].pad ? s.padStart(tn[0].w, '0') : s); };
      return (k) => tn[0].pre + fmtN(forward ? tn[n - 1].n + step * k : tn[0].n - step * k);
    }
  }
  return null; // plain repeat
}

/* fill dst from src along an axis. dir: 'down'|'up'|'right'|'left' */
export function fillBlock(d, si, src0, dst0, dir, getValue, opts = {}) {
  const src = normRange(src0); const dst = normRange(dst0);
  const sh = d.sheet(si);
  const vertical = dir === 'down' || dir === 'up'; const forward = dir === 'down' || dir === 'right';
  const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1;
  const len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
  const total = vertical ? dst.r2 - dst.r1 + 1 : dst.c2 - dst.c1 + 1;
  for (let ln = 0; ln < lines; ln++) {
    const at = (idx) => (vertical ? [src.r1 + idx, src.c1 + ln] : [src.r1 + ln, src.c1 + idx]);
    const srcCells = []; const srcVals = [];
    for (let i = 0; i < len; i++) { const [r, c] = at(i); srcCells.push(sh.cells[keyOf(r, c)]); srcVals.push(getValue(r, c)); }
    const allConst = srcCells.every((x) => x && x.f === undefined && x.v !== undefined);
    const dateFmt = opts.isDate ? opts.isDate(...at(0)) : false;
    const gen = allConst && !opts.copyOnly ? makeSeries(srcVals, dateFmt, forward) : null;
    for (let k = 1; k <= total; k++) {
      // position of k-th target cell
      const off = forward ? len - 1 + k : -k;
      const tr = vertical ? (forward ? src.r1 + off : src.r1 + off) : src.r1 + ln;
      const tc = vertical ? src.c1 + ln : src.c1 + off;
      if (tr < 0 || tc < 0 || tr >= MAX_ROWS || tc >= MAX_COLS) continue;
      const cyc = (((forward ? k - 1 : k - 1) % len) + len) % len;
      const si2 = forward ? cyc : len - 1 - cyc;
      const sc = srcCells[si2];
      const [sr, scc] = at(si2);
      const key = keyOf(tr, tc);
      if (!sc) { delete sh.cells[key]; continue; }
      const cell = {};
      if (sc.s !== undefined) cell.s = sc.s;
      if (sc.f !== undefined && !opts.copyOnly) cell.f = shiftFormula(sc.f, tr - sr, tc - scc);
      else if (sc.f !== undefined) cell.f = shiftFormula(sc.f, tr - sr, tc - scc);
      else if (gen) cell.v = gen(k);
      else if (sc.v !== undefined) cell.v = sc.v;
      sh.cells[key] = cell;
    }
  }
}

/* ---------- find & replace ---------- */
export function buildMatcher(q, o) {
  if (!q) return null;
  let src = o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (o.whole) src = `^(?:${src})$`;
  try { return new RegExp(src, 'g' + (o.matchCase ? '' : 'i')); } catch { return null; }
}
export function findCells(book, getText, q, o = {}) {
  const re = buildMatcher(q, o);
  if (!re) return [];
  const out = [];
  book.sheets.forEach((sh, si) => {
    if (o.sheetOnly !== undefined && o.sheetOnly !== si) return;
    for (const k in sh.cells) {
      const cell = sh.cells[k];
      if (cell.v === undefined && !cell.f) continue;
      const { r, c } = splitKey(k);
      if (o.range && !(r >= o.range.r1 && r <= o.range.r2 && c >= o.range.c1 && c <= o.range.c2)) continue;
      const t = getText(si, r, c, o.inFormulas);
      re.lastIndex = 0;
      if (t !== null && re.test(t)) out.push({ si, r, c });
    }
  });
  out.sort((a, b) => a.si - b.si || a.r - b.r || a.c - b.c);
  return out;
}

/* ---------- misc data tools ---------- */
export function removeDuplicates(d, si, g0, cols, hasHeader, getValue) {
  const g = normRange(g0); const sh = d.sheet(si);
  const seen = new Set(); const keep = []; let removed = 0;
  for (let r = g.r1; r <= g.r2; r++) {
    if (hasHeader && r === g.r1) { keep.push(r); continue; }
    const key = cols.map((c) => { const v = getValue(r, c); return typeof v === 'string' ? v.toLowerCase() : String(v); }).join('\u0001');
    if (seen.has(key)) { removed++; continue; }
    seen.add(key); keep.push(r);
  }
  const rowsData = keep.map((r) => { const arr = []; for (let c = g.c1; c <= g.c2; c++) arr.push(sh.cells[keyOf(r, c)]); return arr; });
  for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) delete sh.cells[keyOf(r, c)];
  rowsData.forEach((arr, i) => arr.forEach((cell, j) => { if (cell) sh.cells[keyOf(g.r1 + i, g.c1 + j)] = cell; }));
  return removed;
}
export function textToColumns(d, si, g0, delim, getValue) {
  const g = normRange(g0);
  for (let r = g.r1; r <= g.r2; r++) {
    const v = getValue(r, g.c1);
    if (v === null || v === undefined || v === '') continue;
    const parts = String(v).split(delim);
    parts.forEach((p, j) => setCellInput(d, si, r, g.c1 + j, p.trim()));
  }
}

/* ---------- names ---------- */
export const sheetRangeRef = (book, si, g) => `${quoteSheet(book.sheets[si].name)}!${rangeText(g).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}`;

/* ---------- axis helper for the grid ---------- */
export class Axis {
  constructor(def, over, count) {
    this.def = def; this.count = count;
    const idx = Object.keys(over || {}).map(Number).filter((i) => i < count).sort((a, b) => a - b);
    this.idx = idx; this.sz = idx.map((i) => over[i]);
    this.cum = [0]; // cumulative (size-def) before k-th override
    idx.forEach((i, k) => this.cum.push(this.cum[k] + (this.sz[k] - def)));
  }
  size(i) { const k = bs(this.idx, i); return k >= 0 ? this.sz[k] : this.def; }
  offset(i) {
    // number of overrides with idx < i
    let lo = 0; let hi = this.idx.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.idx[m] < i) lo = m + 1; else hi = m; }
    return i * this.def + this.cum[lo];
  }
  total() { return this.offset(this.count); }
  at(px) {
    if (px <= 0) return 0;
    let lo = 0; let hi = this.count - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.offset(m) <= px) lo = m; else hi = m - 1; }
    return lo;
  }
}
function bs(arr, v) { let lo = 0; let hi = arr.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] === v) return m; if (arr[m] < v) lo = m + 1; else hi = m - 1; } return -1; }

export { keyOf, colName, parseCell, parseRange, rangeText };
