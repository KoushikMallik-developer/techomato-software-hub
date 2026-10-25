// Slides data model: themes, layouts, shapes, element factories, text helpers.
import { uid } from '../../lib/useLibrary.js';

export const SW = 960;
export const SH = 540;

/* ---------- themes ---------- */
export const THEMES = [
  { id: 'office', name: 'Office', bg: '#ffffff', text: '#1f2937', muted: '#6b7280', panel: '#f3f4f6', a: ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#0891b2', '#ca8a04'], head: 'Calibri', body: 'Calibri', deco: 'bar' },
  { id: 'dark', name: 'Midnight', bg: '#0f172a', text: '#f8fafc', muted: '#94a3b8', panel: '#1e293b', a: ['#38bdf8', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa', '#fb7185'], head: 'Segoe UI', body: 'Segoe UI', deco: 'band' },
  { id: 'ocean', name: 'Ocean', bg: '#f0f9ff', text: '#0c4a6e', muted: '#475569', panel: '#e0f2fe', a: ['#0284c7', '#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#14b8a6'], head: 'Trebuchet MS', body: 'Calibri', deco: 'corner' },
  { id: 'forest', name: 'Forest', bg: '#f7faf5', text: '#1b3a2a', muted: '#5b6b60', panel: '#e6f0e3', a: ['#2f855a', '#b7791f', '#2b6cb0', '#c05621', '#6b46c1', '#718096'], head: 'Georgia', body: 'Calibri', deco: 'frame' },
  { id: 'sunset', name: 'Sunset', bg: '#fff7ed', text: '#431407', muted: '#78716c', panel: '#ffedd5', a: ['#ea580c', '#db2777', '#ca8a04', '#7c3aed', '#0891b2', '#dc2626'], head: 'Georgia', body: 'Arial', deco: 'band' },
  { id: 'mono', name: 'Monochrome', bg: '#ffffff', text: '#111111', muted: '#666666', panel: '#f0f0f0', a: ['#111111', '#444444', '#777777', '#999999', '#bbbbbb', '#dd0000'], head: 'Arial', body: 'Arial', deco: 'none' },
  { id: 'bold', name: 'Bold', bg: '#111111', text: '#ffffff', muted: '#a3a3a3', panel: '#262626', a: ['#facc15', '#f97316', '#22d3ee', '#a3e635', '#f472b6', '#c084fc'], head: 'Arial', body: 'Arial', deco: 'bar' },
  { id: 'paper', name: 'Paper', bg: '#fbf7ef', text: '#2d2a26', muted: '#7a7266', panel: '#f1eadb', a: ['#9a3412', '#365314', '#1e3a8a', '#7e22ce', '#0f766e', '#a16207'], head: 'Times New Roman', body: 'Georgia', deco: 'frame' },
  { id: 'pastel', name: 'Pastel', bg: '#fdf2f8', text: '#4a044e', muted: '#86198f', panel: '#fce7f3', a: ['#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e'], head: 'Verdana', body: 'Verdana', deco: 'corner' },
  { id: 'navy', name: 'Navy', bg: '#1e3a8a', text: '#ffffff', muted: '#bfdbfe', panel: '#1e40af', a: ['#fbbf24', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#a78bfa'], head: 'Calibri', body: 'Calibri', deco: 'bar' },
];
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const FONTS = ['Calibri', 'Arial', 'Segoe UI', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Georgia', 'Times New Roman', 'Palatino Linotype', 'Garamond', 'Courier New', 'Consolas', 'Impact', 'Comic Sans MS'];
const STACKS = {
  Calibri: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif', Arial: 'Arial, "Liberation Sans", Helvetica, sans-serif', 'Segoe UI': '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  Verdana: 'Verdana, "DejaVu Sans", sans-serif', 'Trebuchet MS': '"Trebuchet MS", "Lucida Grande", Arial, sans-serif', Tahoma: 'Tahoma, Geneva, Verdana, sans-serif',
  Georgia: 'Georgia, "DejaVu Serif", serif', 'Times New Roman': '"Times New Roman", "Liberation Serif", Times, serif', 'Palatino Linotype': '"Palatino Linotype", Palatino, "Book Antiqua", serif',
  Garamond: 'Garamond, "EB Garamond", Georgia, serif', 'Courier New': '"Courier New", "Liberation Mono", monospace', Consolas: 'Consolas, "DejaVu Sans Mono", monospace', Impact: 'Impact, "Arial Black", sans-serif', 'Comic Sans MS': '"Comic Sans MS", "Comic Sans", cursive',
};
export const fontStack = (f) => STACKS[f] || (f ? `"${f}", Arial, sans-serif` : STACKS.Calibri);

/* colour tokens: '@bg' '@text' '@muted' '@panel' '@a1'..'@a6' */
export const TOKENS = [['@text', 'Text'], ['@bg', 'Background'], ['@muted', 'Muted'], ['@panel', 'Panel'], ['@a1', 'Accent 1'], ['@a2', 'Accent 2'], ['@a3', 'Accent 3'], ['@a4', 'Accent 4'], ['@a5', 'Accent 5'], ['@a6', 'Accent 6']];
export function rc(c, th) {
  if (!c) return c;
  if (c[0] !== '@') return c;
  if (c === '@bg') return th.bg; if (c === '@text') return th.text; if (c === '@muted') return th.muted; if (c === '@panel') return th.panel;
  const m = /^@a(\d)$/.exec(c); if (m) return th.a[Number(m[1]) - 1] || th.a[0];
  return '#000000';
}
export const rf = (f, th) => (f === '@head' ? th.head : f === '@body' ? th.body : f || th.body);
export const hex6 = (c) => { const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || ''); if (!m) return '000000'; const x = m[1].length === 3 ? m[1].split('').map((d) => d + d).join('') : m[1]; return x.toUpperCase(); };
export const isDark = (c) => { const h = hex6(c); const r = parseInt(h.slice(0, 2), 16); const g = parseInt(h.slice(2, 4), 16); const b = parseInt(h.slice(4, 6), 16); return (r * 299 + g * 587 + b * 114) / 1000 < 140; };
export function mixHex(a, b, t) {
  const A = hex6(a); const B = hex6(b); let o = '#';
  for (let i = 0; i < 3; i++) { const x = parseInt(A.slice(i * 2, i * 2 + 2), 16); const y = parseInt(B.slice(i * 2, i * 2 + 2), 16); o += Math.round(x + (y - x) * t).toString(16).padStart(2, '0'); }
  return o;
}

/* decorative theme shapes drawn behind every slide */
export function decoShapes(th) {
  const d = th.deco;
  const S = (shape, x, y, w, h, fill, extra = {}) => ({ type: 'shape', shape, x, y, w, h, fill: { t: 'solid', c: fill }, stroke: null, ...extra });
  if (d === 'bar') return [S('rect', 0, 0, 14, SH, '@a1')];
  if (d === 'band') return [S('rect', 0, SH - 18, SW, 18, '@a1')];
  if (d === 'corner') return [S('rtTriangle', SW - 150, SH - 150, 150, 150, '@a1', { _corner: true })];
  if (d === 'frame') return [{ type: 'shape', shape: 'rect', x: 20, y: 20, w: SW - 40, h: SH - 40, fill: null, stroke: { c: '@a1', w: 2, dash: 'solid' } }];
  return [];
}

/* ---------- layouts ---------- */
const ph = (role, x, y, w, h, tx, extra = {}) => ({ role, x, y, w, h, tx, ...extra });
const TITLE = { sz: 38, b: true, f: '@head', va: 'mid', c: '@text' };
export const LAYOUTS = [
  { id: 'title', name: 'Title slide', ph: [ph('title', 80, 160, 800, 130, { sz: 56, b: true, f: '@head', va: 'bot', c: '@text' }, { prompt: 'Click to add title' }), ph('sub', 80, 306, 800, 70, { sz: 26, c: '@muted', va: 'top', f: '@body' }, { prompt: 'Click to add subtitle' })] },
  { id: 'content', name: 'Title and content', ph: [ph('title', 64, 36, 832, 84, TITLE, { prompt: 'Click to add title' }), ph('body', 64, 140, 832, 350, { sz: 24, va: 'top', f: '@body', c: '@text' }, { bul: true, prompt: 'Click to add text' })] },
  { id: 'section', name: 'Section header', ph: [ph('title', 80, 190, 800, 110, { sz: 48, b: true, f: '@head', va: 'bot', c: '@a1' }, { prompt: 'Click to add section title' }), ph('sub', 80, 312, 800, 60, { sz: 24, c: '@muted', va: 'top', f: '@body' }, { prompt: 'Click to add text' })] },
  { id: 'two', name: 'Two content', ph: [ph('title', 64, 36, 832, 84, TITLE, { prompt: 'Click to add title' }), ph('body', 64, 140, 400, 350, { sz: 22, va: 'top', f: '@body', c: '@text' }, { bul: true, prompt: 'Click to add text' }), ph('body2', 496, 140, 400, 350, { sz: 22, va: 'top', f: '@body', c: '@text' }, { bul: true, prompt: 'Click to add text' })] },
  { id: 'compare', name: 'Comparison', ph: [ph('title', 64, 36, 832, 84, TITLE, { prompt: 'Click to add title' }), ph('head1', 64, 136, 400, 52, { sz: 26, b: true, f: '@head', va: 'mid', c: '@a1' }, { prompt: 'Heading' }), ph('body', 64, 192, 400, 300, { sz: 20, va: 'top', f: '@body', c: '@text' }, { bul: true, prompt: 'Click to add text' }), ph('head2', 496, 136, 400, 52, { sz: 26, b: true, f: '@head', va: 'mid', c: '@a2' }, { prompt: 'Heading' }), ph('body2', 496, 192, 400, 300, { sz: 20, va: 'top', f: '@body', c: '@text' }, { bul: true, prompt: 'Click to add text' })] },
  { id: 'titleOnly', name: 'Title only', ph: [ph('title', 64, 36, 832, 84, TITLE, { prompt: 'Click to add title' })] },
  { id: 'caption', name: 'Big statement', ph: [ph('title', 100, 150, 760, 240, { sz: 54, b: true, f: '@head', va: 'mid', c: '@text', al: 'center' }, { prompt: 'Click to add statement' })] },
  { id: 'blank', name: 'Blank', ph: [] },
];
export const layoutById = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[LAYOUTS.length - 1];

/* ---------- shapes ---------- */
const poly = (pts) => 'M' + pts.map((p) => p.join(',')).join(' L') + 'Z';
const star = (w, h, n, inner) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n; const r = i % 2 ? inner : 1; pts.push([w / 2 + (Math.cos(a) * r * w) / 2, h / 2 + (Math.sin(a) * r * h) / 2]); } return poly(pts); };
const ngon = (w, h, n, rot = -Math.PI / 2) => poly(Array.from({ length: n }, (_, i) => { const a = rot + (i * 2 * Math.PI) / n; return [w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2]; }));
export const SHAPES = {
  rect: { label: 'Rectangle', prst: 'rect', d: (w, h) => `M0,0 H${w} V${h} H0Z` },
  roundRect: { label: 'Rounded rectangle', prst: 'roundRect', d: (w, h, r = 0.18) => { const k = Math.min(w, h) * r; return `M${k},0 H${w - k} Q${w},0 ${w},${k} V${h - k} Q${w},${h} ${w - k},${h} H${k} Q0,${h} 0,${h - k} V${k} Q0,0 ${k},0Z`; } },
  ellipse: { label: 'Ellipse', prst: 'ellipse', d: (w, h) => `M0,${h / 2} A${w / 2},${h / 2} 0 1 1 ${w},${h / 2} A${w / 2},${h / 2} 0 1 1 0,${h / 2}Z` },
  triangle: { label: 'Triangle', prst: 'triangle', d: (w, h) => poly([[w / 2, 0], [w, h], [0, h]]) },
  rtTriangle: { label: 'Right triangle', prst: 'rtTriangle', d: (w, h) => poly([[0, 0], [w, h], [0, h]]) },
  diamond: { label: 'Diamond', prst: 'diamond', d: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) },
  parallelogram: { label: 'Parallelogram', prst: 'parallelogram', d: (w, h) => poly([[w * 0.2, 0], [w, 0], [w * 0.8, h], [0, h]]) },
  trapezoid: { label: 'Trapezoid', prst: 'trapezoid', d: (w, h) => poly([[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]]) },
  pentagon: { label: 'Pentagon', prst: 'pentagon', d: (w, h) => ngon(w, h, 5) },
  hexagon: { label: 'Hexagon', prst: 'hexagon', d: (w, h) => poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]) },
  octagon: { label: 'Octagon', prst: 'octagon', d: (w, h) => { const a = 0.29; return poly([[w * a, 0], [w * (1 - a), 0], [w, h * a], [w, h * (1 - a)], [w * (1 - a), h], [w * a, h], [0, h * (1 - a)], [0, h * a]]); } },
  star4: { label: '4-point star', prst: 'star4', d: (w, h) => star(w, h, 4, 0.4) },
  star5: { label: '5-point star', prst: 'star5', d: (w, h) => star(w, h, 5, 0.4) },
  star6: { label: '6-point star', prst: 'star6', d: (w, h) => star(w, h, 6, 0.55) },
  arrowRight: { label: 'Right arrow', prst: 'rightArrow', d: (w, h) => poly([[0, h * 0.3], [w * 0.6, h * 0.3], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.7], [0, h * 0.7]]) },
  arrowLeft: { label: 'Left arrow', prst: 'leftArrow', d: (w, h) => poly([[w, h * 0.3], [w * 0.4, h * 0.3], [w * 0.4, 0], [0, h / 2], [w * 0.4, h], [w * 0.4, h * 0.7], [w, h * 0.7]]) },
  arrowUp: { label: 'Up arrow', prst: 'upArrow', d: (w, h) => poly([[w * 0.3, h], [w * 0.3, h * 0.4], [0, h * 0.4], [w / 2, 0], [w, h * 0.4], [w * 0.7, h * 0.4], [w * 0.7, h]]) },
  arrowDown: { label: 'Down arrow', prst: 'downArrow', d: (w, h) => poly([[w * 0.3, 0], [w * 0.3, h * 0.6], [0, h * 0.6], [w / 2, h], [w, h * 0.6], [w * 0.7, h * 0.6], [w * 0.7, 0]]) },
  chevron: { label: 'Chevron', prst: 'chevron', d: (w, h) => poly([[0, 0], [w * 0.7, 0], [w, h / 2], [w * 0.7, h], [0, h], [w * 0.3, h / 2]]) },
  homePlate: { label: 'Pentagon arrow', prst: 'homePlate', d: (w, h) => poly([[0, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [0, h]]) },
  plus: { label: 'Plus', prst: 'mathPlus', d: (w, h) => poly([[w * 0.35, 0], [w * 0.65, 0], [w * 0.65, h * 0.35], [w, h * 0.35], [w, h * 0.65], [w * 0.65, h * 0.65], [w * 0.65, h], [w * 0.35, h], [w * 0.35, h * 0.65], [0, h * 0.65], [0, h * 0.35], [w * 0.35, h * 0.35]]) },
  heart: { label: 'Heart', prst: 'heart', d: (w, h) => `M${w / 2},${h} C${-w * 0.25},${h * 0.45} ${w * 0.15},${-h * 0.15} ${w / 2},${h * 0.28} C${w * 0.85},${-h * 0.15} ${w * 1.25},${h * 0.45} ${w / 2},${h}Z` },
  cloud: { label: 'Cloud', prst: 'cloud', d: (w, h) => `M${w * 0.25},${h * 0.8} C${-w * 0.05},${h * 0.8} ${-w * 0.02},${h * 0.42} ${w * 0.22},${h * 0.42} C${w * 0.2},${h * 0.1} ${w * 0.55},${h * 0.0} ${w * 0.62},${h * 0.28} C${w * 0.8},${h * 0.1} ${w * 1.02},${h * 0.35} ${w * 0.85},${h * 0.55} C${w * 1.05},${h * 0.65} ${w * 0.95},${h * 0.9} ${w * 0.75},${h * 0.8}Z` },
  callout: { label: 'Speech bubble', prst: 'wedgeRoundRectCallout', d: (w, h) => { const k = Math.min(w, h) * 0.12; const bh = h * 0.8; return `M${k},0 H${w - k} Q${w},0 ${w},${k} V${bh - k} Q${w},${bh} ${w - k},${bh} H${w * 0.45} L${w * 0.25},${h} L${w * 0.3},${bh} H${k} Q0,${bh} 0,${bh - k} V${k} Q0,0 ${k},0Z`; } },
  donut: { label: 'Donut', prst: 'donut', d: (w, h) => { const a = w / 2; const b = h / 2; const i = 0.25; return `M0,${b} A${a},${b} 0 1 1 ${w},${b} A${a},${b} 0 1 1 0,${b}Z M${w * i},${b} A${a * (1 - 2 * i)},${b * (1 - 2 * i)} 0 1 0 ${w * (1 - i)},${b} A${a * (1 - 2 * i)},${b * (1 - 2 * i)} 0 1 0 ${w * i},${b}Z`; } },
  cylinder: { label: 'Cylinder', prst: 'can', d: (w, h) => { const e = h * 0.14; return `M0,${e} A${w / 2},${e} 0 0 1 ${w},${e} V${h - e} A${w / 2},${e} 0 0 1 0,${h - e}Z M0,${e} A${w / 2},${e} 0 0 0 ${w},${e}`; } },
};
export const SHAPE_ORDER = Object.keys(SHAPES);
export const shapeD = (id, w, h, r) => (SHAPES[id] || SHAPES.rect).d(Math.max(1, w), Math.max(1, h), r);

/* ---------- text model ---------- */
// paras: [{ runs:[{t,b,i,u,s,c,sz,f,hl,sup,link}], al, bul:'dot'|'num'|undefined, lvl, ls, sb }]
export const P = (text, o = {}) => String(text ?? '').split('\n').map((t) => ({ runs: t ? [{ t, ...(o.run || {}) }] : [], ...(o.para || {}) }));
export const plain = (paras) => (paras || []).map((p) => p.runs.map((r) => r.t).join('')).join('\n');
export const isEmptyParas = (paras) => !paras || paras.every((p) => p.runs.every((r) => !r.t));
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const textBase = (el) => ({ f: '@body', sz: 24, c: '@text', b: false, i: false, al: 'left', va: 'top', pad: 8, ls: 1.15, ...(el.tx || {}) });

function runHtml(r, th, base) {
  const st = [];
  if (r.b !== undefined && !!r.b !== !!base.b) st.push(`font-weight:${r.b ? 700 : 400}`);
  if (r.i !== undefined && !!r.i !== !!base.i) st.push(`font-style:${r.i ? 'italic' : 'normal'}`);
  const dec = [r.u ? 'underline' : '', r.s ? 'line-through' : ''].filter(Boolean).join(' ');
  if (dec) st.push(`text-decoration:${dec}`);
  if (r.c) st.push(`color:${rc(r.c, th)}`);
  if (r.sz) st.push(`font-size:${r.sz}px`);
  if (r.f) st.push(`font-family:${fontStack(rf(r.f, th))}`);
  if (r.hl) st.push(`background-color:${rc(r.hl, th)}`);
  if (r.sup) st.push('vertical-align:super;font-size:0.7em');
  if (r.sub) st.push('vertical-align:sub;font-size:0.7em');
  const body = esc(r.t).replace(/\n/g, '<br>');
  const inner = st.length ? `<span style="${st.join(';')}">${body}</span>` : body;
  if (r.link) return r.link.slide !== undefined ? `<a data-slide="${r.link.slide}" href="#">${inner}</a>` : `<a href="${esc(r.link.url)}" data-url="${esc(r.link.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  return inner;
}
export function parasToHtml(paras, th, base) {
  return (paras && paras.length ? paras : [{ runs: [] }]).map((p) => {
    const at = [];
    if (p.al) at.push(`text-align:${p.al === 'just' ? 'justify' : p.al}`);
    if (p.ls) at.push(`line-height:${p.ls}`);
    if (p.sb) at.push(`margin-top:${p.sb}px`);
    const lvl = p.lvl || 0;
    if (p.bul) at.push(`padding-left:${(lvl + 1) * 0.9}em`);
    else if (lvl) at.push(`padding-left:${lvl * 0.9}em`);
    const inner = p.runs.length ? p.runs.map((r) => runHtml(r, th, base)).join('') : '<br>';
    return `<div${p.bul ? ` data-bul="${p.bul}"` : ''} data-lvl="${lvl}"${at.length ? ` style="${at.join(';')}"` : ''}>${inner}</div>`;
  }).join('');
}

/* DOM (contentEditable) -> paras */
const toHex = (c) => {
  if (!c) return null;
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(c.trim());
  if (m) { if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join(''); }
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((d) => d + d).join('');
  return null;
};
export function htmlToParas(root, th, base) {
  const paras = []; let cur = null;
  const baseC = rc(base.c, th); const baseF = fontStack(rf(base.f, th));
  const newPara = (el) => {
    const ds = el && el.dataset ? el.dataset : {};
    const st = el && el.style ? el.style : {};
    cur = { runs: [] };
    if (st.textAlign && st.textAlign !== 'start') cur.al = st.textAlign === 'justify' ? 'just' : st.textAlign;
    if (ds.bul) cur.bul = ds.bul; if (ds.lvl && Number(ds.lvl)) cur.lvl = Number(ds.lvl);
    if (st.lineHeight && !Number.isNaN(Number(st.lineHeight))) cur.ls = Number(st.lineHeight);
    const mt = parseFloat(st.marginTop); if (mt) cur.sb = mt;
    paras.push(cur);
  };
  const push = (t, s) => {
    if (!t) return; if (!cur) newPara(null);
    const run = { t }; for (const k of ['b', 'i', 'u', 's', 'c', 'sz', 'f', 'hl', 'sup', 'sub', 'link']) if (s[k]) run[k] = s[k];
    const last = cur.runs[cur.runs.length - 1];
    if (last && ['b', 'i', 'u', 's', 'c', 'sz', 'f', 'hl', 'sup', 'sub'].every((k) => last[k] === run[k]) && JSON.stringify(last.link) === JSON.stringify(run.link)) last.t += t; else cur.runs.push(run);
  };
  const styleOf = (el, s) => {
    const n = { ...s }; const st = el.style || {}; const tag = el.localName;
    if (tag === 'b' || tag === 'strong') n.b = true; if (tag === 'i' || tag === 'em') n.i = true; if (tag === 'u') n.u = true; if (tag === 's' || tag === 'strike' || tag === 'del') n.s = true;
    if (tag === 'sup') n.sup = true; if (tag === 'sub') n.sub = true;
    if (st.fontWeight) { const w = st.fontWeight; n.b = w === 'bold' || w === 'bolder' || Number(w) >= 600; if (!n.b) delete n.b; }
    if (st.fontStyle === 'italic') n.i = true;
    const dec = st.textDecorationLine || st.textDecoration || ''; if (/underline/.test(dec)) n.u = true; if (/line-through/.test(dec)) n.s = true;
    if (st.color) { const h = toHex(st.color); if (h && h !== baseC.toLowerCase()) n.c = h; }
    if (st.fontSize && /px$/.test(st.fontSize)) { const v = Math.round(parseFloat(st.fontSize) * 10) / 10; if (v && v !== base.sz && !/em$/.test(st.fontSize)) n.sz = v; }
    if (st.fontFamily) { const fam = st.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (fam && fontStack(rf(base.f, th)).indexOf(fam) < 0) n.f = FONTS.find((f) => f.toLowerCase() === fam.toLowerCase()) || fam; }
    if (st.backgroundColor) { const h = toHex(st.backgroundColor); if (h) n.hl = h; }
    if (tag === 'font') { if (el.getAttribute('color')) { const h = toHex(el.getAttribute('color')); if (h) n.c = h; } }
    if (tag === 'a') { if (el.dataset.slide !== undefined && el.dataset.slide !== '') n.link = { slide: Number(el.dataset.slide) }; else if (el.getAttribute('data-url') || el.getAttribute('href')) n.link = { url: el.getAttribute('data-url') || el.getAttribute('href') }; }
    if (/super/.test(st.verticalAlign || '')) n.sup = true; if (/sub/.test(st.verticalAlign || '') && !/super/.test(st.verticalAlign)) n.sub = true;
    return n;
  };
  const BLOCK = new Set(['div', 'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']);
  const walk = (node, s) => {
    for (const ch of Array.from(node.childNodes)) {
      if (ch.nodeType === 3) { push(ch.nodeValue.replace(/​/g, ''), s); continue; }
      if (ch.nodeType !== 1) continue;
      const tag = ch.localName;
      if (tag === 'br') { if (!cur) newPara(null); else if (cur.runs.length && ch.nextSibling) push('\n', s); continue; }
      if (BLOCK.has(tag)) { newPara(ch); walk(ch, styleOf(ch, s)); cur = null; continue; }
      walk(ch, styleOf(ch, s));
    }
  };
  walk(root, {});
  if (!paras.length) paras.push({ runs: [] });
  // trailing soft breaks
  paras.forEach((p) => { const l = p.runs[p.runs.length - 1]; if (l && /\n$/.test(l.t)) { l.t = l.t.replace(/\n+$/, ''); if (!l.t) p.runs.pop(); } });
  void baseF;
  return paras;
}

/* ---------- element factories ---------- */
export const newEl = (type, o = {}) => ({ id: uid(), type, x: 100, y: 100, w: 300, h: 100, rot: 0, ...o });
export const newText = (o = {}) => newEl('text', { w: 400, h: 60, fill: null, stroke: null, shape: 'rect', paras: P('Text'), tx: { sz: 28, va: 'top', pad: 8 }, ...o });
export const newShape = (shape = 'rect', o = {}) => newEl('shape', { shape, w: 220, h: 140, fill: { t: 'solid', c: '@a1' }, stroke: null, paras: [{ runs: [] }], tx: { sz: 24, al: 'center', va: 'mid', c: '#ffffff', pad: 10 }, ...o });
export const newLine = (o = {}) => newEl('line', { w: 300, h: 0, stroke: { c: '@text', w: 3, dash: 'solid' }, head: 'none', tail: 'arrow', ...o });
export const newImage = (src, w, h, o = {}) => newEl('image', { src, w, h, fit: 'fill', stroke: null, r: 0, ...o });
export function newTable(rows, cols, o = {}) {
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ({ t: r === 0 ? `Header ${c + 1}` : '' })));
  return newEl('table', { w: 720, h: rows * 44, cells, colW: Array(cols).fill(1 / cols), rowH: Array(rows).fill(44), hdr: true, band: true, tx: { sz: 18, f: '@body', c: '@text' }, tstyle: '@a1', border: { c: '#d1d5db', w: 1 }, ...o });
}
export const CHART_SAMPLE = { cats: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Revenue', values: [12, 19, 15, 24] }, { name: 'Costs', values: [8, 11, 10, 14] }] };
export function newChart(type = 'column', o = {}) {
  return newEl('chart', { w: 560, h: 340, chart: { type, title: '', legend: 'bottom', labels: false, stacked: false, colors: ['@a1', '@a2', '@a3', '@a4', '@a5', '@a6'] }, data: JSON.parse(JSON.stringify(CHART_SAMPLE)), ...o });
}

export const newSlide = (layoutId = 'content', theme = THEMES[0], o = {}) => {
  const s = { id: uid(), layout: layoutId, bg: null, notes: '', trans: { type: 'none', dur: 0.5 }, hidden: false, els: [], ...o };
  s.els = layoutById(layoutId).ph.map((p) => placeholderEl(p));
  return s;
};
export function placeholderEl(p, text) {
  const tx = { f: '@body', sz: 24, c: '@text', va: 'top', pad: 8, ...p.tx };
  const paras = text ? P(text, p.bul ? { para: { bul: 'dot' } } : {}) : [p.bul ? { runs: [], bul: 'dot' } : { runs: [] }];
  return newEl('text', { ph: p.role, prompt: p.prompt, x: p.x, y: p.y, w: p.w, h: p.h, fill: null, stroke: null, shape: 'rect', paras, tx });
}

export function applyLayout(slide, layoutId) {
  const L = layoutById(layoutId); const used = new Set(); const els = [];
  const keep = [];
  for (const e of slide.els) {
    const spec = e.ph && L.ph.find((p) => p.role === e.ph && !used.has(p.role));
    if (spec) { used.add(spec.role); els.push({ ...e, x: spec.x, y: spec.y, w: spec.w, h: spec.h, tx: { ...e.tx, ...spec.tx, ...(e.tx && e.tx.__user ? e.tx : {}) }, prompt: spec.prompt, rot: 0 }); } else keep.push(e);
  }
  const rest = keep.filter((e) => !(e.ph && isEmptyParas(e.paras)));
  const demoted = rest.map((e) => (e.ph ? { ...e, ph: null } : e));
  const missing = L.ph.filter((p) => !used.has(p.role)).map((p) => placeholderEl(p));
  // placeholders first (behind free objects)
  const phEls = [...els, ...missing].sort((a, b) => L.ph.findIndex((p) => p.role === a.ph) - L.ph.findIndex((p) => p.role === b.ph));
  return { ...slide, layout: layoutId, els: [...phEls, ...demoted] };
}

/* ---------- geometry ---------- */
export const rad = (d) => (d * Math.PI) / 180;
export function corners(e) {
  const cx = e.x + e.w / 2; const cy = e.y + e.h / 2; const a = rad(e.rot || 0); const c = Math.cos(a); const s = Math.sin(a);
  return [[-e.w / 2, -e.h / 2], [e.w / 2, -e.h / 2], [e.w / 2, e.h / 2], [-e.w / 2, e.h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
export function aabb(e) { const cs = corners(e); const xs = cs.map((p) => p[0]); const ys = cs.map((p) => p[1]); return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }; }
export function bounds(els) {
  if (!els.length) return null;
  const bs = els.map(aabb); const b = { x1: Math.min(...bs.map((q) => q.x1)), y1: Math.min(...bs.map((q) => q.y1)), x2: Math.max(...bs.map((q) => q.x2)), y2: Math.max(...bs.map((q) => q.y2)) };
  return { ...b, w: b.x2 - b.x1, h: b.y2 - b.y1 };
}
export function alignEls(els, how) {
  const b = bounds(els); if (!b) return {};
  const out = {};
  for (const e of els) {
    const q = aabb(e); let dx = 0; let dy = 0;
    if (how === 'left') dx = b.x1 - q.x1; if (how === 'right') dx = b.x2 - q.x2; if (how === 'center') dx = (b.x1 + b.x2) / 2 - (q.x1 + q.x2) / 2;
    if (how === 'top') dy = b.y1 - q.y1; if (how === 'bottom') dy = b.y2 - q.y2; if (how === 'middle') dy = (b.y1 + b.y2) / 2 - (q.y1 + q.y2) / 2;
    out[e.id] = { x: e.x + dx, y: e.y + dy };
  }
  return out;
}
export function distributeEls(els, axis) {
  if (els.length < 3) return {};
  const items = els.map((e) => ({ e, q: aabb(e) })).sort((a, b) => (axis === 'h' ? a.q.x1 - b.q.x1 : a.q.y1 - b.q.y1));
  const first = axis === 'h' ? items[0].q.x1 : items[0].q.y1; const last = axis === 'h' ? items[items.length - 1].q.x2 : items[items.length - 1].q.y2;
  const total = items.reduce((s, i) => s + (axis === 'h' ? i.q.x2 - i.q.x1 : i.q.y2 - i.q.y1), 0);
  const gap = (last - first - total) / (items.length - 1); let pos = first; const out = {};
  for (const { e, q } of items) { const size = axis === 'h' ? q.x2 - q.x1 : q.y2 - q.y1; const d = pos - (axis === 'h' ? q.x1 : q.y1); out[e.id] = axis === 'h' ? { x: e.x + d } : { y: e.y + d }; pos += size + gap; }
  return out;
}

/* expand a selection to whole groups */
export const withGroups = (els, ids) => { const g = new Set(els.filter((e) => ids.includes(e.id) && e.gid).map((e) => e.gid)); return els.filter((e) => ids.includes(e.id) || (e.gid && g.has(e.gid))).map((e) => e.id); };

export const cloneEl = (e, dx = 0, dy = 0, gmap = {}) => {
  const c = JSON.parse(JSON.stringify(e)); c.id = uid(); c.x += dx; c.y += dy;
  if (c.gid) { gmap[c.gid] = gmap[c.gid] || uid(); c.gid = gmap[c.gid]; }
  return c;
};

/* ---------- decks ---------- */
export function blankDeck(themeId = 'office') {
  const th = themeById(themeId);
  const s1 = newSlide('title', th);
  s1.els[0].paras = P('Presentation title'); s1.els[1].paras = P('Subtitle or your name');
  return { v: 2, w: SW, h: SH, theme: { ...th }, footer: { num: false, text: '' }, slides: [s1] };
}

/* v1 decks ({slides:[{id,bg,elements}]}) -> v2 */
export function migrateDeck(d) {
  if (d && d.v === 2) return d;
  const th = themeById('office');
  const slides = ((d && d.slides) || []).map((s) => ({
    id: s.id || uid(), layout: 'blank', bg: s.bg && s.bg !== '#ffffff' ? { type: 'solid', color: s.bg } : null, notes: '', trans: { type: 'none', dur: 0.5 }, hidden: false,
    els: (s.elements || []).map((e) => {
      if (e.type === 'text') return newEl('text', { id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, shape: 'rect', fill: null, stroke: null, paras: P(e.text || ''), tx: { sz: e.size || 28, c: e.color || '#1a202c', b: !!e.bold, i: !!e.italic, al: e.align || 'left', va: 'top', pad: 0, f: 'Arial' } });
      if (e.type === 'image') return newImage(e.src, e.w, e.h, { id: e.id, x: e.x, y: e.y, fit: 'contain' });
      return newEl('shape', { id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, shape: e.type === 'ellipse' ? 'ellipse' : 'rect', fill: { t: 'solid', c: e.fill || '#3182ce' }, stroke: null, paras: [{ runs: [] }], tx: { sz: 24, al: 'center', va: 'mid', c: '#ffffff' } });
    }),
  }));
  return { v: 2, w: SW, h: SH, theme: { ...th }, footer: { num: false, text: '' }, slides: slides.length ? slides : blankDeck().slides };
}

/* elements to draw for a slide: theme decoration + slide elements */
export const slideBg = (slide, th) => {
  const b = slide.bg;
  if (b && b.type === 'solid') return { t: 'solid', c: b.color };
  if (b && b.type === 'grad') return { t: 'grad', c1: b.c1, c2: b.c2, ang: b.ang ?? 135 };
  if (b && b.type === 'image') return { t: 'image', src: b.src };
  return { t: 'solid', c: th.bg };
};
export const bgCss = (bg, th) => {
  if (bg.t === 'solid') return { background: rc(bg.c, th) };
  if (bg.t === 'grad') return { background: `linear-gradient(${bg.ang}deg, ${rc(bg.c1, th)}, ${rc(bg.c2, th)})` };
  return { background: `center / cover no-repeat url("${bg.src}")` };
};
export const fillCss = (f, th) => (!f ? 'none' : f.t === 'grad' ? null : rc(f.c, th));
