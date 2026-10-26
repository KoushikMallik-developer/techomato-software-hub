/* Flowchart model: shapes, routing, auto-layout, Mermaid import/export, SVG/PNG */
import { measure, wrapText } from '../board/model.js';
export const uid = () => Math.random().toString(36).slice(2, 9);
export const SHAPES = [
  ['process', 'Process'], ['terminator', 'Start / End'], ['decision', 'Decision'], ['data', 'Input / Output'], ['document', 'Document'], ['subprocess', 'Sub-process'], ['database', 'Database'], ['circle', 'Connector'], ['hexagon', 'Preparation'], ['text', 'Text'],
];
export const FILLS = ['#ffffff', '#dbeafe', '#dcfce7', '#fef9c3', '#fee2e2', '#ede9fe', '#fce7f3', '#e5e7eb'];
export const STROKES = ['#374151', '#1d4ed8', '#15803d', '#a16207', '#b91c1c', '#6d28d9', '#be185d', '#111827'];
export const DEFSIZE = { process: [150, 64], terminator: [150, 54], decision: [160, 90], data: [160, 64], document: [150, 70], subprocess: [160, 64], database: [120, 80], circle: [56, 56], hexagon: [160, 64], text: [120, 36] };
export const newNode = (shape, x, y, text) => { const [w, h] = DEFSIZE[shape] || [150, 64]; return { id: uid(), shape, x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h, text: text ?? (shape === 'text' ? 'Text' : shape === 'terminator' ? 'Start' : shape === 'decision' ? 'Decision?' : SHAPES.find((s) => s[0] === shape)[1]), fill: shape === 'text' ? 'none' : '#ffffff', stroke: '#374151', fs: 14 }; };
export const blankDiagram = (name = 'Untitled flowchart') => ({ id: uid(), name, nodes: [], edges: [], view: null });
const FONT = 'Inter,Segoe UI,system-ui,sans-serif';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function shapePath(n) {
  const { x, y, w, h } = n; const r = (a) => Math.round(a * 100) / 100;
  switch (n.shape) {
    case 'terminator': return `M${x + h / 2} ${y}H${x + w - h / 2}A${h / 2} ${h / 2} 0 0 1 ${x + w - h / 2} ${y + h}H${x + h / 2}A${h / 2} ${h / 2} 0 0 1 ${x + h / 2} ${y}Z`;
    case 'decision': return `M${x + w / 2} ${y}L${x + w} ${y + h / 2}L${x + w / 2} ${y + h}L${x} ${y + h / 2}Z`;
    case 'data': { const s = Math.min(24, w * 0.15); return `M${x + s} ${y}H${x + w}L${x + w - s} ${y + h}H${x}Z`; }
    case 'document': return `M${x} ${y}H${x + w}V${y + h - 10}C${x + w * 0.75} ${y + h - 22} ${x + w * 0.65} ${y + h + 4} ${x + w / 2} ${y + h - 8}C${x + w * 0.3} ${y + h - 20} ${x + w * 0.2} ${y + h + 2} ${x} ${y + h - 10}Z`;
    case 'database': { const e = Math.min(14, h * 0.18); return `M${x} ${y + e}A${w / 2} ${e} 0 0 1 ${x + w} ${y + e}V${y + h - e}A${w / 2} ${e} 0 0 1 ${x} ${y + h - e}ZM${x} ${y + e}A${w / 2} ${e} 0 0 0 ${x + w} ${y + e}`; }
    case 'circle': return `M${x} ${y + h / 2}A${w / 2} ${h / 2} 0 1 0 ${x + w} ${y + h / 2}A${w / 2} ${h / 2} 0 1 0 ${x} ${y + h / 2}Z`;
    case 'hexagon': { const s = Math.min(26, w * 0.18); return `M${x + s} ${y}H${x + w - s}L${x + w} ${y + h / 2}L${x + w - s} ${y + h}H${x + s}L${x} ${y + h / 2}Z`; }
    case 'subprocess': return `M${x} ${y}H${x + w}V${y + h}H${x}ZM${x + 12} ${y}V${y + h}M${x + w - 12} ${y}V${y + h}`;
    default: return `M${x + 6} ${y}H${x + w - 6}Q${x + w} ${y} ${x + w} ${y + 6}V${y + h - 6}Q${x + w} ${y + h} ${x + w - 6} ${y + h}H${x + 6}Q${x} ${y + h} ${x} ${y + h - 6}V${y + 6}Q${x} ${y} ${x + 6} ${y}Z`;
  }
}
const inset = (n) => (n.shape === 'decision' ? 0.28 : n.shape === 'circle' ? 0.16 : n.shape === 'hexagon' || n.shape === 'data' ? 0.14 : n.shape === 'terminator' ? 0.1 : n.shape === 'subprocess' ? 0.1 : 0.05);
export function textLines(n) { const maxW = Math.max(20, n.w * (1 - inset(n) * 2) - 8); return wrapText(n.text || '', maxW, n.fs, 'Sans', false); }
/* fit the node to its text (grows only) */
export function fitNode(n) { const lines = wrapText(n.text || '', Math.max(20, n.w * (1 - inset(n) * 2) - 8), n.fs, 'Sans', false); const need = lines.length * n.fs * 1.3 + 16; const k = n.shape === 'decision' ? 1.7 : n.shape === 'circle' ? 1.35 : 1; return need * k > n.h ? { ...n, h: Math.ceil(need * k) } : n; }
export function nodeSvg(n, sel) {
  const lines = textLines(n); const lh = n.fs * 1.3; const cy = n.y + n.h / 2 - ((lines.length - 1) * lh) / 2;
  const body = n.shape === 'text' ? '' : `<path d="${shapePath(n)}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="1.8" stroke-linejoin="round"/>`;
  const txt = lines.map((l, i) => `<text x="${n.x + n.w / 2}" y="${cy + i * lh + n.fs * 0.35}" text-anchor="middle" font-family="${FONT}" font-size="${n.fs}" fill="#111827">${esc(l)}</text>`).join('');
  return body + txt;
}
export const portPt = (n, side) => (side === 'r' ? { x: n.x + n.w, y: n.y + n.h / 2 } : side === 'l' ? { x: n.x, y: n.y + n.h / 2 } : side === 't' ? { x: n.x + n.w / 2, y: n.y } : { x: n.x + n.w / 2, y: n.y + n.h });
const OUT = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] };
export function autoSides(a, b) { const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2; const dx = bx - ax, dy = by - ay; if (Math.abs(dx) * 0.7 > Math.abs(dy) || (Math.abs(dx) > a.w / 2 + b.w / 2 && Math.abs(dy) < 40)) return dx >= 0 ? ['r', 'l'] : ['l', 'r']; return dy >= 0 ? ['b', 't'] : ['t', 'b']; }
/* route -> {pts, d, mid, angle} */
export function route(e, a, b) {
  let [fs, ts] = autoSides(a, b); if (e.fs) fs = e.fs; if (e.ts) ts = e.ts; const p1 = portPt(a, fs), p2 = portPt(b, ts); let pts;
  if (e.route === 'straight') pts = [p1, p2];
  else {
    const o1 = OUT[fs], o2 = OUT[ts]; const g = 24; const s1 = { x: p1.x + o1[0] * g, y: p1.y + o1[1] * g }, s2 = { x: p2.x + o2[0] * g, y: p2.y + o2[1] * g };
    if (fs === ts && (fs === 'r' || fs === 'l')) { const mx = fs === 'r' ? Math.max(p1.x, p2.x) + 36 : Math.min(p1.x, p2.x) - 36; pts = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2]; }
    else if (fs === ts) { const my = fs === 'b' ? Math.max(p1.y, p2.y) + 36 : Math.min(p1.y, p2.y) - 36; pts = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2]; }
    else if (fs === 'r' || fs === 'l') {
      if (ts === 'l' || ts === 'r') { if (o1[0] * (p2.x - p1.x) > g * 2 && o1[0] === -o2[0]) { const mx = (p1.x + p2.x) / 2; pts = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2]; } else { const my = a.y + a.h / 2 < b.y + b.h / 2 ? Math.max(a.y + a.h, b.y + b.h) + 28 : Math.min(a.y, b.y) - 28; pts = [p1, s1, { x: s1.x, y: my }, { x: s2.x, y: my }, s2, p2]; } }
      else { pts = [p1, { x: p2.x, y: p1.y }, p2]; if (o1[0] * (p2.x - p1.x) < 0) pts = [p1, s1, { x: s1.x, y: s2.y }, s2, p2]; }
    } else if (ts === 't' || ts === 'b') { if (o1[1] * (p2.y - p1.y) > g * 2 && o1[1] === -o2[1]) { const my = (p1.y + p2.y) / 2; pts = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2]; } else { const mx = a.x + a.w / 2 < b.x + b.w / 2 ? Math.max(a.x + a.w, b.x + b.w) + 28 : Math.min(a.x, b.x) - 28; pts = [p1, s1, { x: mx, y: s1.y }, { x: mx, y: s2.y }, s2, p2]; } }
    else { pts = [p1, { x: p1.x, y: p2.y }, p2]; if (o1[1] * (p2.y - p1.y) < 0) pts = [p1, s1, { x: s2.x, y: s1.y }, s2, p2]; }
  }
  pts = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) > 0.5);
  let d = `M${pts[0].x} ${pts[0].y}`; if (e.route === 'curve') { const [q, r] = [pts[0], pts[pts.length - 1]]; const m = Math.max(40, Math.hypot(r.x - q.x, r.y - q.y) * 0.4); const c1 = { x: q.x + OUT[fs][0] * m, y: q.y + OUT[fs][1] * m }, c2 = { x: r.x + OUT[ts][0] * m, y: r.y + OUT[ts][1] * m }; d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${r.x} ${r.y}`; pts = [q, c1, c2, r]; }
  else { const R = 10; for (let i = 1; i < pts.length - 1; i++) { const p0 = pts[i - 1], p = pts[i], p2 = pts[i + 1]; const l1 = Math.hypot(p.x - p0.x, p.y - p0.y), l2 = Math.hypot(p2.x - p.x, p2.y - p.y); const r = Math.min(R, l1 / 2, l2 / 2); const a1 = { x: p.x + ((p0.x - p.x) / l1) * r, y: p.y + ((p0.y - p.y) / l1) * r }, a2 = { x: p.x + ((p2.x - p.x) / l2) * r, y: p.y + ((p2.y - p.y) / l2) * r }; d += `L${a1.x} ${a1.y}Q${p.x} ${p.y} ${a2.x} ${a2.y}`; } d += `L${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`; }
  // label position: middle of the polyline by length
  const P = e.route === 'curve' ? [pts[0], { x: (pts[0].x + pts[3].x) / 2, y: (pts[0].y + pts[3].y) / 2 }, pts[3]] : pts; let tot = 0; for (let i = 1; i < P.length; i++) tot += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); let acc = 0, mid = P[0]; for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); if (acc + l >= tot / 2) { const t = (tot / 2 - acc) / (l || 1); mid = { x: P[i - 1].x + (P[i].x - P[i - 1].x) * t, y: P[i - 1].y + (P[i].y - P[i - 1].y) * t }; break; } acc += l; }
  const last = e.route === 'curve' ? { x: pts[3].x - pts[2].x, y: pts[3].y - pts[2].y } : { x: P[P.length - 1].x - P[P.length - 2].x, y: P[P.length - 1].y - P[P.length - 2].y };
  return { d, pts: P, p1, p2, mid, angle: Math.atan2(last.y, last.x) };
}
export function edgeSvg(e, a, b, sel) {
  const g = route(e, a, b); const col = e.color || '#374151'; const sw = e.style === 'thick' ? 3.2 : 1.8; const dash = e.style === 'dashed' ? ' stroke-dasharray="7 5"' : ''; const parts = [`<path d="${g.d}" fill="none" stroke="${col}" stroke-width="${sw}"${dash} stroke-linecap="round"/>`];
  const head = (p, ang) => { const L = 11 + sw, W = 5 + sw * 0.5; const c = Math.cos(ang), s = Math.sin(ang); return `<path d="M${p.x} ${p.y}L${p.x - c * L - s * W} ${p.y - s * L + c * W}L${p.x - c * L + s * W} ${p.y - s * L - c * W}Z" fill="${col}"/>`; };
  if (e.arrow !== 'none') parts.push(head(g.p2, g.angle)); if (e.arrow === 'both') { const f = g.pts[0], n2 = g.pts[1]; parts.push(head(f, Math.atan2(f.y - n2.y, f.x - n2.x))); }
  if (e.label) { const w = measure(e.label, 12.5, 'Sans', false) + 12; parts.push(`<rect x="${g.mid.x - w / 2}" y="${g.mid.y - 10}" width="${w}" height="20" rx="4" fill="#ffffff" stroke="#e5e7eb"/><text x="${g.mid.x}" y="${g.mid.y + 4.5}" text-anchor="middle" font-family="${FONT}" font-size="12.5" fill="#111827">${esc(e.label)}</text>`); }
  return { svg: parts.join(''), geom: g };
}
export function bbox(d) { if (!d.nodes.length) return { x: 0, y: 0, w: 0, h: 0 }; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; d.nodes.forEach((n) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h); }); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
export function toSvg(d, pad = 40, bg = '#ffffff') {
  const b = bbox(d); const X = b.x - pad, Y = b.y - pad, W = b.w + pad * 2, H = b.h + pad * 2; const m = new Map(d.nodes.map((n) => [n.id, n])); const p = [];
  d.edges.forEach((e) => { const a = m.get(e.from), c = m.get(e.to); if (a && c) p.push(edgeSvg(e, a, c).svg); }); d.nodes.forEach((n) => p.push(nodeSvg(n)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H)}" viewBox="${X} ${Y} ${W} ${H}">${bg ? `<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="${bg}"/>` : ''}${p.join('')}</svg>`;
}
export async function toPng(d, scale = 2) { const svg = toSvg(d); const m = /width="(\d+)" height="(\d+)"/.exec(svg); const w = +m[1], h = +m[2]; const k = Math.min(scale, 8000 / Math.max(w, h)); const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('render failed')); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return new Promise((r) => c.toBlob(r, 'image/png')); }

/* ---------- auto layout (layered) ---------- */
export function autoLayout(d, dir = 'TB') {
  const nodes = d.nodes; if (!nodes.length) return d; const ids = nodes.map((n) => n.id); const out = new Map(ids.map((i) => [i, []])); const inn = new Map(ids.map((i) => [i, []]));
  d.edges.forEach((e) => { if (out.has(e.from) && out.has(e.to) && e.from !== e.to) { out.get(e.from).push(e.to); inn.get(e.to).push(e.from); } });
  // break cycles with DFS: ignore back edges
  const state = {}; const back = new Set(); const dfs = (u) => { state[u] = 1; out.get(u).forEach((v) => { if (state[v] === 1) back.add(u + '>' + v); else if (!state[v]) dfs(v); }); state[u] = 2; };
  const starts = ids.filter((i) => !inn.get(i).length); (starts.length ? starts : [ids[0]]).forEach((s) => { if (!state[s]) dfs(s); }); ids.forEach((i) => { if (!state[i]) dfs(i); });
  const succ = new Map(ids.map((i) => [i, out.get(i).filter((v) => !back.has(i + '>' + v))])); const pred = new Map(ids.map((i) => [i, []])); succ.forEach((vs, u) => vs.forEach((v) => pred.get(v).push(u)));
  const layer = {}; const lay = (u) => { if (layer[u] !== undefined) return layer[u]; layer[u] = 0; layer[u] = pred.get(u).length ? Math.max(...pred.get(u).map(lay)) + 1 : 0; return layer[u]; }; ids.forEach(lay);
  const L = []; ids.forEach((i) => { (L[layer[i]] ||= []).push(i); });
  const pos = {}; const idx = () => L.forEach((l) => l.forEach((id, i) => { pos[id] = i; })); idx();
  for (let pass = 0; pass < 6; pass++) { const down = pass % 2 === 0; const order = down ? L.map((_, i) => i).slice(1) : L.map((_, i) => i).slice(0, -1).reverse(); order.forEach((li) => { const nb = down ? pred : succ; const bc = (id) => { const ns = nb.get(id).filter((x) => layer[x] === li + (down ? -1 : 1)); return ns.length ? ns.reduce((a, x) => a + pos[x], 0) / ns.length : pos[id]; }; L[li].sort((a, b) => bc(a) - bc(b)); L[li].forEach((id, i) => { pos[id] = i; }); }); }
  const m = new Map(nodes.map((n) => [n.id, n])); const horiz = dir === 'LR'; const GAP = horiz ? 90 : 70, GAP2 = horiz ? 36 : 50;
  const lsize = L.map((l) => Math.max(...l.map((id) => (horiz ? m.get(id).w : m.get(id).h)))); const lextent = L.map((l) => l.reduce((a, id) => a + (horiz ? m.get(id).h : m.get(id).w), 0) + (l.length - 1) * GAP2); const maxExt = Math.max(...lextent);
  const np = {}; let off = 0; L.forEach((l, li) => { let c = (maxExt - lextent[li]) / 2; l.forEach((id) => { const n = m.get(id); const along = horiz ? n.h : n.w; const thick = horiz ? n.w : n.h; const cross = off + (lsize[li] - thick) / 2; np[id] = horiz ? { x: cross, y: c } : { x: c, y: cross }; c += along + GAP2; }); off += lsize[li] + GAP; });
  return { ...d, nodes: nodes.map((n) => ({ ...n, x: Math.round(np[n.id].x), y: Math.round(np[n.id].y) })), edges: d.edges.map((e) => (back.has(e.from + '>' + e.to) ? { ...e, fs: horiz ? 'b' : 'r', ts: horiz ? 'b' : 'r' } : { ...e, fs: undefined, ts: undefined })) };
}

/* ---------- Mermaid ---------- */
const SH = [[/^\[\[(.+)\]\]$/s, 'subprocess'], [/^\[\((.+)\)\]$/s, 'database'], [/^\(\[(.+)\]\)$/s, 'terminator'], [/^\(\((.+)\)\)$/s, 'circle'], [/^\{\{(.+)\}\}$/s, 'hexagon'], [/^\[\/(.+)\/\]$/s, 'data'], [/^\[\\(.+)\\\]$/s, 'data'], [/^\{(.+)\}$/s, 'decision'], [/^\((.+)\)$/s, 'terminator'], [/^\[(.+)\]$/s, 'process'], [/^>(.+)\]$/s, 'document']];
function readNode(s, i) { const m = /^[A-Za-z0-9_À-￿]+/.exec(s.slice(i)); if (!m) return null; const id = m[0]; let j = i + id.length; let shape = null, text = null; const rest = s.slice(j); const open = rest[0]; if ('[({>'.includes(open || '')) { const close = { '[': ']', '(': ')', '{': '}', '>': ']' }[open]; let depth = 0, k = 0, q = false; for (; k < rest.length; k++) { const c = rest[k]; if (c === '"') q = !q; if (q) continue; if ('[({'.includes(c)) depth++; else if (')]}'.includes(c)) { depth--; if (depth <= 0 && c === close) { k++; break; } } } const tok = rest.slice(0, k); for (const [re, sh] of SH) { const mm = re.exec(tok); if (mm) { shape = sh; text = mm[1].trim().replace(/^"(.*)"$/s, '$1').replace(/<br\s*\/?>/gi, '\n'); break; } } if (shape) j += k; } return { id, shape, text, end: j }; }
export function fromMermaid(src, name = 'Imported flowchart') {
  const lines = src.replace(/\r/g, '').split(/\n|;/).map((l) => l.replace(/%%.*$/, '').trim()).filter(Boolean); let dir = 'TB'; const nodes = new Map(); const edges = [];
  const ensure = (r) => { let n = nodes.get(r.id); if (!n) { n = { id: r.id, shape: r.shape || 'process', text: r.text ?? r.id }; nodes.set(r.id, n); } else { if (r.shape) n.shape = r.shape; if (r.text != null) n.text = r.text; } return n; };
  const EDGE = [/^(<?-\.+-?>?)(?:\|([^|]*)\|)?/, /^(<?={2,}>?)(?:\|([^|]*)\|)?/, /^(<?-{2,}>?)(?:\|([^|]*)\|)?/, /^--\s*([^>-][^]*?)\s*(-->|---)/, /^-\.\s*([^]*?)\s*\.->/, /^==\s*([^]*?)\s*==>/];
  for (const line of lines) {
    const h = /^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)/i.exec(line); if (h) { dir = /LR|RL/i.test(h[1]) ? 'LR' : 'TB'; continue; } if (/^(subgraph|end|classDef|class|style|linkStyle|click|direction)\b/i.test(line)) continue;
    let i = 0; let prev = readNode(line, i); if (!prev) continue; ensure(prev); i = prev.end;
    while (i < line.length) { while (line[i] === ' ') i++; if (i >= line.length) break; const rest = line.slice(i); let label = '', len = 0, style = 'solid', arrow = 'end', ok = false;
      const t1 = /^--\s+([^>\-][^]*?)\s+(-->|---)/.exec(rest) || /^-\.\s+([^]*?)\s+\.->/.exec(rest) || /^==\s+([^]*?)\s+==>/.exec(rest);
      if (t1) { label = t1[1].trim(); len = t1[0].length; const tail = t1[2] || (rest.startsWith('-.') ? '-.->' : '==>'); style = rest.startsWith('-.') ? 'dashed' : rest.startsWith('==') ? 'thick' : 'solid'; arrow = tail.endsWith('>') ? 'end' : 'none'; ok = true; }
      else { for (const re of EDGE.slice(0, 3)) { const m = re.exec(rest); if (m) { len = m[0].length; const tok = m[1]; label = (m[2] || '').trim(); style = tok.includes('.') ? 'dashed' : tok.includes('=') ? 'thick' : 'solid'; arrow = tok.startsWith('<') && tok.endsWith('>') ? 'both' : tok.endsWith('>') ? 'end' : 'none'; ok = true; break; } } }
      if (!ok) break; i += len; while (line[i] === ' ') i++; const lm = /^\|([^|]*)\|/.exec(line.slice(i)); if (lm) { label = lm[1].trim(); i += lm[0].length; } while (line[i] === ' ') i++;
      const nx = readNode(line, i); if (!nx) break; ensure(nx); edges.push({ id: uid(), from: prev.id, to: nx.id, label: label.replace(/^"(.*)"$/, '$1'), style, arrow }); prev = nx; i = nx.end; }
  }
  if (!nodes.size) return null;
  const list = [...nodes.values()].map((n) => { const base = newNode(n.shape, 0, 0, n.text); const lines = wrapText(n.text, 200, 14, 'Sans', false); const tw = Math.max(...lines.map((l) => measure(l, 14, 'Sans', false))); const w = Math.max(base.w, Math.ceil((tw + 28) / (1 - inset(base) * 2))); return fitNode({ ...base, id: n.id, w: Math.min(w, 260) }); });
  const d = { ...blankDiagram(name), nodes: list, edges };
  return autoLayout(d, dir);
}
export function toMermaid(d) {
  const idm = new Map(d.nodes.map((n, i) => [n.id, 'N' + (i + 1)])); const q = (t) => '"' + String(t || '').replace(/"/g, "'").replace(/\n/g, '<br/>') + '"';
  const br = { process: ['[', ']'], terminator: ['([', '])'], decision: ['{', '}'], data: ['[/', '/]'], document: ['>', ']'], subprocess: ['[[', ']]'], database: ['[(', ')]'], circle: ['((', '))'], hexagon: ['{{', '}}'], text: ['[', ']'] };
  const out = ['flowchart TD']; d.nodes.forEach((n) => { const [a, b] = br[n.shape] || br.process; out.push(`  ${idm.get(n.id)}${a}${q(n.text)}${b}`); });
  d.edges.forEach((e) => { if (!idm.has(e.from) || !idm.has(e.to)) return; const op = e.style === 'dashed' ? (e.arrow === 'none' ? '-.-' : '-.->') : e.style === 'thick' ? (e.arrow === 'none' ? '===' : '==>') : (e.arrow === 'none' ? '---' : e.arrow === 'both' ? '<-->' : '-->'); out.push(`  ${idm.get(e.from)} ${op}${e.label ? `|${e.label}|` : ''} ${idm.get(e.to)}`); });
  return out.join('\n') + '\n';
}

export const TEMPLATES = [
  ['Login flow', `flowchart TD\n  A([Start]) --> B[/Enter email and password/]\n  B --> C{Credentials valid?}\n  C -->|Yes| D[Create session]\n  C -->|No| E{Attempts left?}\n  E -->|Yes| B\n  E -->|No| F[Lock account]\n  D --> G([Dashboard])\n  F --> H([End])`],
  ['Approval process', `flowchart LR\n  A([Request submitted]) --> B[Manager review]\n  B --> C{Approved?}\n  C -->|Yes| D[Finance check]\n  C -->|No| E[Return to requester]\n  D --> F{Within budget?}\n  F -->|Yes| G([Approved])\n  F -->|No| B\n  E --> A`],
  ['Decision tree', `flowchart TD\n  A{Is it urgent?} -->|Yes| B{Is it important?}\n  A -->|No| C{Is it important?}\n  B -->|Yes| D[Do it now]\n  B -->|No| E[Delegate]\n  C -->|Yes| F[Schedule it]\n  C -->|No| G[Drop it]`],
  ['Data pipeline', `flowchart LR\n  A[(Source DB)] --> B[Extract]\n  B --> C[[Clean and validate]]\n  C --> D{Valid?}\n  D -->|Yes| E[Transform]\n  D -->|No| F[Error log]\n  E --> G[(Warehouse)]`],
];
