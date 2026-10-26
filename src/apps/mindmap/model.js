/* Mind map model: tree helpers, auto layout, import / export */
import { measure, wrapText } from '../board/model.js';
export const uid = () => Math.random().toString(36).slice(2, 9);
export const BRANCH = ['#e5484d', '#f2a93b', '#3aa676', '#2f8fdd', '#8e5ad7', '#e0568f', '#18a2a2', '#7b8a3a'];
export const THEMES = { light: { bg: '#ffffff', ink: '#1b1f24', root: '#2b3441', rootInk: '#ffffff', leaf: '#ffffff' }, soft: { bg: '#f3f5f8', ink: '#1b1f24', root: '#2b3441', rootInk: '#ffffff', leaf: '#ffffff' }, dark: { bg: '#15181d', ink: '#e8eaed', root: '#e8eaed', rootInk: '#15181d', leaf: '#232830' } };
export const LAYOUTS = [['map', 'Mind map (both sides)'], ['right', 'Right'], ['left', 'Left'], ['down', 'Org chart (down)']];
export const blankMap = (name = 'Untitled map') => { const r = uid(); return { id: uid(), name, layout: 'map', theme: 'light', nodes: [{ id: r, p: null, t: 'Central idea' }], sel: r, view: null }; };
export const kids = (nodes, id) => nodes.filter((n) => n.p === id);
export const root = (nodes) => nodes.find((n) => n.p === null) || nodes[0];
export const subtreeIds = (nodes, id) => { const out = [id]; for (let i = 0; i < out.length; i++) kids(nodes, out[i]).forEach((k) => out.push(k.id)); return out; };
export const depthOf = (nodes, id) => { let d = 0, n = nodes.find((x) => x.id === id); while (n && n.p) { n = nodes.find((x) => x.id === n.p); d++; } return d; };

const FS = (d) => (d === 0 ? 20 : d === 1 ? 16 : 14);
const MAXW = 240;
function box(n, d) {
  const fs = FS(d), bold = d < 2; const lines = wrapText(n.t || ' ', MAXW, fs, 'Sans', bold); const tw = Math.max(24, ...lines.map((l) => measure(l, fs, 'Sans', bold)));
  const lh = fs * 1.3; const extra = (n.note ? 16 : 0) + (n.done !== undefined ? 22 : 0);
  return { fs, bold, lines, lh, w: Math.ceil(tw + (d === 0 ? 40 : 28) + extra), h: Math.ceil(lines.length * lh + (d === 0 ? 24 : 16)), extra };
}

/* geometry: {items:[{id,x,y,w,h,d,color,lines,...}], edges:[{id,d,color,sw}], bbox} */
export function layout(map) {
  const nodes = map.nodes; const r = root(nodes); const items = new Map(); const GX = 56, GY = 12, GYV = 56, GXV = 18;
  const col = {}; kids(nodes, r.id).forEach((k, i) => { col[k.id] = k.col || BRANCH[i % BRANCH.length]; });
  const colorOf = (id) => { let n = nodes.find((x) => x.id === id); const own = []; while (n) { if (n.col) own.push(n.col); if (col[n.id]) return n.col || col[n.id]; n = nodes.find((x) => x.id === n.p); } return own[0] || '#7a8594'; };
  const vis = (n) => (n.c ? [] : kids(nodes, n.id));
  const mk = (n, d) => { const b = box(n, d); const it = { id: n.id, n, d, ...b, x: 0, y: 0, color: d === 0 ? null : colorOf(n.id), hidden: n.c ? kids(nodes, n.id).length : 0, hasKids: kids(nodes, n.id).length > 0 }; items.set(n.id, it); return it; };
  mk(r, 0);
  const build = (n, d) => { vis(n).forEach((k) => { mk(k, d + 1); build(k, d + 1); }); };
  build(r, 0);
  const H = new Map(); // subtree extent along the cross axis
  const horizontal = map.layout !== 'down';
  const ext = (id) => { if (H.has(id)) return H.get(id); const it = items.get(id); const n = it.n; const ks = vis(n); const self = horizontal ? it.h : it.w; const gap = horizontal ? GY : GXV; const sum = ks.reduce((a, k) => a + ext(k.id), 0) + Math.max(0, ks.length - 1) * gap; const v = Math.max(self, sum); H.set(id, v); return v; };
  const place = (id, dir, cross0) => { // cross0 = start of this subtree's band
    const it = items.get(id); const ks = vis(it.n); const band = ext(id);
    if (horizontal) { it.y = cross0 + band / 2 - it.h / 2; } else { it.x = cross0 + band / 2 - it.w / 2; }
    let c = cross0 + (band - (ks.reduce((a, k) => a + ext(k.id), 0) + Math.max(0, ks.length - 1) * (horizontal ? GY : GXV))) / 2;
    ks.forEach((k) => { const ki = items.get(k.id); if (horizontal) { ki.x = dir > 0 ? it.x + it.w + GX : it.x - GX - ki.w; } else { ki.y = it.y + it.h + GYV; } ki.dir = dir; place(k.id, dir, c); c += ext(k.id) + (horizontal ? GY : GXV); });
  };
  const ri = items.get(r.id); ri.dir = 0;
  if (map.layout === 'down') { ri.y = 0; place(r.id, 1, -ext(r.id) / 2); }
  else if (map.layout === 'right' || map.layout === 'left') { const dir = map.layout === 'right' ? 1 : -1; ri.x = 0; place(r.id, dir, -ext(r.id) / 2); }
  else { // both sides
    const first = vis(r); const R = [], L = []; let hr = 0, hl = 0; first.forEach((k) => { const side = k.side || (hr <= hl ? 'r' : 'l'); (side === 'r' ? R : L).push(k); if (side === 'r') hr += ext(k.id) + GY; else hl += ext(k.id) + GY; });
    ri.x = -ri.w / 2; ri.y = -ri.h / 2;
    const side = (list, dir) => { const total = list.reduce((a, k) => a + ext(k.id), 0) + Math.max(0, list.length - 1) * GY; let c = -total / 2; list.forEach((k) => { const ki = items.get(k.id); ki.x = dir > 0 ? ri.x + ri.w + GX + 8 : ri.x - GX - 8 - ki.w; ki.dir = dir; ki.side = dir > 0 ? 'r' : 'l'; place(k.id, dir, c); c += ext(k.id) + GY; }); };
    side(R, 1); side(L, -1);
  }
  if (map.layout !== 'map') { /* root is centred on its band for horizontal layouts */ if (horizontal) ri.y = -ri.h / 2 + (0); }
  // edges
  const edges = [];
  items.forEach((it) => { vis(it.n).forEach((k) => { const c = items.get(k.id); let d;
    if (horizontal) { const dir = c.dir || 1; const x1 = dir > 0 ? it.x + it.w : it.x, y1 = it.y + it.h / 2, x2 = dir > 0 ? c.x : c.x + c.w, y2 = c.y + c.h / 2; const m = Math.abs(x2 - x1) * 0.55; d = `M${x1} ${y1}C${x1 + dir * m} ${y1} ${x2 - dir * m} ${y2} ${x2} ${y2}`; }
    else { const x1 = it.x + it.w / 2, y1 = it.y + it.h, x2 = c.x + c.w / 2, y2 = c.y; const m = (y2 - y1) * 0.5; d = `M${x1} ${y1}C${x1} ${y1 + m} ${x2} ${y2 - m} ${x2} ${y2}`; }
    edges.push({ id: k.id, d, color: c.color, sw: c.d === 1 ? 4 : c.d === 2 ? 3 : 2 }); }); });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; items.forEach((i) => { x0 = Math.min(x0, i.x); y0 = Math.min(y0, i.y); x1 = Math.max(x1, i.x + i.w + (i.hidden ? 26 : 0)); y1 = Math.max(y1, i.y + i.h); });
  return { items: [...items.values()], map: items, edges, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const nodeFill = (it, th) => (it.d === 0 ? th.root : it.d === 1 ? it.color : th.leaf);
export const nodeInk = (it, th) => (it.d === 0 ? th.rootInk : it.d === 1 ? '#ffffff' : th.ink);
export function toSvg(map, pad = 40) {
  const g = layout(map); const th = THEMES[map.theme] || THEMES.light; const { x, y, w, h } = g.bbox; const X = x - pad, Y = y - pad, W = w + pad * 2, H = h + pad * 2; const p = [];
  g.edges.forEach((e) => p.push(`<path d="${e.d}" fill="none" stroke="${e.color}" stroke-width="${e.sw}" stroke-linecap="round"/>`));
  g.items.forEach((it) => { const fill = nodeFill(it, th), ink = nodeInk(it, th); const rx = it.d === 0 ? it.h / 2.4 : 10; p.push(`<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="${rx}" fill="${fill}" ${it.d >= 2 ? `stroke="${it.color}" stroke-width="1.6"` : ''}/>`);
    const tx = it.x + (it.d === 0 ? 20 : 14) + (it.n.done !== undefined ? 22 : 0); it.lines.forEach((l, i) => p.push(`<text x="${tx}" y="${it.y + (it.d === 0 ? 12 : 8) + it.lh * i + it.fs * 0.98}" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="${it.fs}" ${it.bold ? 'font-weight="700"' : ''} fill="${ink}" ${it.n.done ? 'text-decoration="line-through" opacity=".6"' : ''}>${esc(l)}</text>`));
    if (it.n.done !== undefined) p.push(`<rect x="${it.x + 10}" y="${it.y + it.h / 2 - 7}" width="14" height="14" rx="3" fill="none" stroke="${ink}" stroke-width="1.6"/>${it.n.done ? `<path d="M${it.x + 13} ${it.y + it.h / 2}l3 3 5-6" fill="none" stroke="${ink}" stroke-width="2"/>` : ''}`);
    if (it.n.note) p.push(`<circle cx="${it.x + it.w - 14}" cy="${it.y + it.h / 2}" r="4" fill="${ink}" opacity=".55"/>`);
    if (it.hidden) { const cx = it.dir < 0 ? it.x - 14 : it.x + it.w + 14, cy = it.y + it.h / 2; p.push(`<circle cx="${cx}" cy="${cy}" r="10" fill="${th.bg}" stroke="${it.color || '#7a8594'}" stroke-width="1.6"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="700" fill="${th.ink}">${it.hidden}</text>`); } });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H)}" viewBox="${X} ${Y} ${W} ${H}"><rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="${th.bg}"/>${p.join('')}</svg>`;
}
export async function toPng(map, scale = 2) {
  const svg = toSvg(map); const m = /width="(\d+)" height="(\d+)"/.exec(svg); const w = +m[1], h = +m[2]; const k = Math.min(scale, 8000 / Math.max(w, h));
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('render failed')); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
export function toOutline(map) { const nodes = map.nodes; const out = []; const rec = (id, d) => { const n = nodes.find((x) => x.id === id); const t = (n.t || '').replace(/\n/g, ' '); out.push('  '.repeat(d) + '- ' + (n.done !== undefined ? (n.done ? '[x] ' : '[ ] ') : '') + t); if (n.note) n.note.split('\n').forEach((l) => out.push('  '.repeat(d + 1) + '> ' + l)); kids(nodes, id).forEach((k) => rec(k.id, d + 1)); }; rec(root(nodes).id, 0); return out.join('\n') + '\n'; }
export function toOpml(map) { const nodes = map.nodes; const rec = (id, d) => { const n = nodes.find((x) => x.id === id); const ks = kids(nodes, id); const pad = '  '.repeat(d + 2); const a = `text="${esc(n.t || '')}"${n.note ? ` _note="${esc(n.note)}"` : ''}`; return ks.length ? `${pad}<outline ${a}>\n${ks.map((k) => rec(k.id, d + 1)).join('\n')}\n${pad}</outline>` : `${pad}<outline ${a}/>`; }; return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${esc(map.name)}</title></head>\n  <body>\n${rec(root(nodes).id, 0)}\n  </body>\n</opml>\n`; }

/* parse an indented / bulleted / heading outline into nodes */
export function fromOutline(text, name = 'Imported map') {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim()); const nodes = []; const stack = []; const noteFor = (n, l) => { n.note = (n.note ? n.note + '\n' : '') + l; };
  for (const raw of lines) {
    const hm = /^(#{1,6})\s+(.*)$/.exec(raw); let level, t;
    if (hm) { level = hm[1].length - 1; t = hm[2]; } else { const ws = /^[ \t]*/.exec(raw)[0].replace(/\t/g, '    ').length; level = Math.floor(ws / 2); t = raw.trim().replace(/^([-*+]|\d+[.)])\s+/, ''); if (t.startsWith('>') && nodes.length) { noteFor(nodes[nodes.length - 1], t.replace(/^>\s?/, '')); continue; } }
    const done = /^\[( |x|X)\]\s+/.exec(t); const n = { id: uid(), p: null, t: t.replace(/^\[( |x|X)\]\s+/, '') }; if (done) n.done = done[1].toLowerCase() === 'x';
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (!nodes.length) { n.p = null; } else n.p = stack.length ? stack[stack.length - 1].id : nodes[0].id;
    if (nodes.length && !stack.length && level === 0) n.p = nodes[0].id;
    nodes.push(n); stack.push({ id: n.id, level });
  }
  if (!nodes.length) return null;
  if (nodes.filter((n) => n.p === null).length > 1) { /* never happens: only first has null */ }
  return { ...blankMap(name), nodes, sel: nodes[0].id };
}
export function fromOpml(xml, name) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'); const body = doc.querySelector('body'); if (!body) return null; const nodes = [];
  const rec = (el, p) => { const n = { id: uid(), p, t: el.getAttribute('text') || '' }; const note = el.getAttribute('_note'); if (note) n.note = note; nodes.push(n); [...el.children].filter((c) => c.tagName === 'outline').forEach((c) => rec(c, n.id)); };
  const tops = [...body.children].filter((c) => c.tagName === 'outline'); if (!tops.length) return null;
  if (tops.length === 1) rec(tops[0], null); else { const r = { id: uid(), p: null, t: (doc.querySelector('title') || {}).textContent || name || 'Imported map' }; nodes.push(r); tops.forEach((t) => rec(t, r.id)); }
  return { ...blankMap(name || (doc.querySelector('title') || {}).textContent || 'Imported map'), nodes, sel: nodes[0].id };
}
