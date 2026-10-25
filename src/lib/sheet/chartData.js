// Turn a chart definition + engine into plotting data.
import { SErr } from './values.js';
import { parseRange } from './addr.js';
import { unquoteSheet } from './parser.js';

export function parseChartRange(book, text, defSheet) {
  let t = (text || '').trim(); let si = defSheet;
  const m = /^(.*)!([^!]+)$/.exec(t);
  if (m) { const nm = m[1].startsWith("'") ? m[1].slice(1, -1).replace(/''/g, "'") : m[1]; const i = book.sheets.findIndex((s) => s.name.toLowerCase() === nm.toLowerCase()); if (i >= 0) si = i; t = m[2]; }
  const g = parseRange(t);
  return g ? { si, ...g } : null;
}
const isNum = (v) => typeof v === 'number';

/* returns { cats: string[], catVals: any[], series: [{name, values:number[], color?}], xNumeric, error } */
export function chartData(chart, book, ev, defSheet) {
  const g = parseChartRange(book, chart.range, defSheet);
  if (!g) return { cats: [], series: [], error: 'Choose a data range' };
  const ext = ev.usedExtent(g.si);
  const r2 = Math.min(g.r2, Math.max(ext.r, g.r1)); const c2 = Math.min(g.c2, Math.max(ext.c, g.c1));
  let rows = [];
  for (let r = g.r1; r <= r2; r++) { const row = []; for (let c = g.c1; c <= c2; c++) { const v = ev.value(g.si, r, c); row.push(v instanceof SErr ? null : v); } rows.push(row); }
  if (!rows.length || !rows[0].length) return { cats: [], series: [], error: 'No data' };
  if (chart.byRows) rows = rows[0].map((_, j) => rows.map((r) => r[j]));
  let hasHeader = chart.headerRow; let hasLabels = chart.headerCol;
  if (hasHeader === undefined || hasHeader === 'auto') hasHeader = rows.length > 1 && rows[0].slice(1).every((v) => typeof v === 'string' || v === null) && rows[1].slice(1).some(isNum);
  if (hasLabels === undefined || hasLabels === 'auto') hasLabels = rows.length > 1 && rows[0].length > 1 && rows.slice(hasHeader ? 1 : 0).every((r) => !isNum(r[0]) || chart.type === 'scatterX') && !!rows.slice(hasHeader ? 1 : 0).some((r) => r[0] !== null);
  const body = hasHeader ? rows.slice(1) : rows;
  const startCol = hasLabels ? 1 : 0;
  const catRaw = body.map((r, i) => (hasLabels ? r[0] : i + 1));
  const series = [];
  for (let j = startCol; j < rows[0].length; j++) {
    const name = hasHeader && rows[0][j] !== null ? String(rows[0][j]) : `Series ${series.length + 1}`;
    series.push({ name, values: body.map((r) => (isNum(r[j]) ? r[j] : (r[j] === null || r[j] === '' ? null : (typeof r[j] === 'string' && !Number.isNaN(Number(r[j])) ? Number(r[j]) : null)))) });
  }
  const xNumeric = chart.type === 'scatter' && !hasLabels ? false : catRaw.every(isNum);
  return { cats: catRaw.map((v) => (v === null ? '' : String(v))), catVals: catRaw, series: series.filter((s) => s.values.some((v) => v !== null)), xNumeric, hasLabels, hasHeader };
}

/* "nice" axis ticks */
export function niceTicks(min, max, count = 5) {
  if (min === max) { if (min === 0) { max = 1; } else { const d = Math.abs(min) * 0.1; min -= d; max += d; } }
  const span = max - min; const raw = span / count; const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag; const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step; const hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return { ticks, min: lo, max: hi, step };
}
