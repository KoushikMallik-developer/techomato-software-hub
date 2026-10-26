/* Whiteboard model: object geometry, text wrapping, connectors, SVG export */
export const uid = () => Math.random().toString(36).slice(2, 9);
export const STICKY = ['#fff2a8', '#ffd1dc', '#cdeccf', '#c9e4ff', '#e3d5ff', '#ffd9b3', '#d5f5f0', '#f1f1f1'];
export const PALETTE = ['#1f2937', '#d13438', '#e8590c', '#f2b01e', '#2f9e44', '#1971c2', '#7048e8', '#ffffff'];
export const FILLS = ['', '#ffffff', '#fff2a8', '#ffd1dc', '#cdeccf', '#c9e4ff', '#e3d5ff', '#1f2937'];
export const FONTS = { Sans: 'Inter, "Segoe UI", system-ui, sans-serif', Serif: 'Georgia, "Times New Roman", serif', Mono: 'ui-monospace, Consolas, monospace', Hand: '"Segoe Print", "Comic Sans MS", cursive' };
const cx = document.createElement('canvas').getContext('2d');
export function measure(text, fs, font = 'Sans', bold) { cx.font = `${bold ? '700 ' : ''}${fs}px ${FONTS[font] || FONTS.Sans}`; return cx.measureText(text).width; }
export function wrapText(text, maxW, fs, font, bold) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    if (maxW == null) { out.push(para); continue; }
    let line = ''; for (const word of para.split(/(\s+)/)) { const t = line + word; if (measure(t, fs, font, bold) > maxW && line.trim()) { out.push(line.trimEnd()); line = word.trimStart(); } else line = t; }
    out.push(line.trimEnd());
  }
  return out;
}
export const textSize = (o) => { const lines = wrapText(o.text, null, o.fs, o.font, o.bold); return { w: Math.max(20, ...lines.map((l) => measure(l, o.fs, o.font, o.bold))), h: Math.max(1, lines.length) * o.fs * 1.25 }; };

export const mk = (type, p = {}) => ({ id: uid(), type, color: '#1f2937', fill: '', sw: 3, dash: 0, op: 1, ...p });
export function bbox(o, objs) {
  if (o.type === 'pen') { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of o.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
  if (o.type === 'line' || o.type === 'arrow') { const [a, b] = ends(o, objs); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) }; }
  if (o.type === 'text') { const s = textSize(o); return { x: o.x, y: o.y, w: s.w, h: s.h }; }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}
const sides = (b) => [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]];
/* connector endpoints: bound ends snap to the side of the shape nearest the other end */
export function ends(o, objs) {
  let a = [o.x1, o.y1], b = [o.x2, o.y2]; const A = o.a && objs.find((x) => x.id === o.a), B = o.b && objs.find((x) => x.id === o.b);
  const pick = (shape, toward) => { const bb = shape.type === 'text' ? bbox(shape, objs) : { x: shape.x, y: shape.y, w: shape.w, h: shape.h }; let best = null, bd = 1e12; for (const s of sides(bb)) { const d = (s[0] - toward[0]) ** 2 + (s[1] - toward[1]) ** 2; if (d < bd) { bd = d; best = s; } } return best; };
  if (A && B) { const ca = [A.x + (A.w || 0) / 2, A.y + (A.h || 0) / 2], cb = [B.x + (B.w || 0) / 2, B.y + (B.h || 0) / 2]; a = pick(A, cb); b = pick(B, cb === null ? a : ca); a = pick(A, b); b = pick(B, a); } else if (A) a = pick(A, b); else if (B) b = pick(B, a);
  return [a, b];
}
export function move(o, dx, dy) {
  if (o.type === 'pen') return { ...o, pts: o.pts.map((p) => [p[0] + dx, p[1] + dy]) };
  if (o.type === 'line' || o.type === 'arrow') return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
  return { ...o, x: o.x + dx, y: o.y + dy };
}
/* scale object relative to origin (ox,oy) */
export function scale(o, sx, sy, ox, oy) {
  const X = (x) => ox + (x - ox) * sx, Y = (y) => oy + (y - oy) * sy;
  if (o.type === 'pen') return { ...o, pts: o.pts.map((p) => [X(p[0]), Y(p[1])]) };
  if (o.type === 'line' || o.type === 'arrow') return { ...o, x1: X(o.x1), y1: Y(o.y1), x2: X(o.x2), y2: Y(o.y2) };
  if (o.type === 'text') return { ...o, x: X(o.x), y: Y(o.y), fs: Math.max(6, o.fs * Math.max(Math.abs(sx), Math.abs(sy))) };
  const x1 = X(o.x), x2 = X(o.x + o.w), y1 = Y(o.y), y2 = Y(o.y + o.h);
  return { ...o, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(8, Math.abs(x2 - x1)), h: Math.max(8, Math.abs(y2 - y1)) };
}
export const union = (list, objs) => { if (!list.length) return null; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const o of list) { const b = bbox(o, objs); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
export const hits = (b, r) => !(b.x > r.x + r.w || b.x + b.w < r.x || b.y > r.y + r.h || b.y + b.h < r.y);

/* smooth freehand path through points */
export function penPath(pts) {
  if (!pts.length) return ''; if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]} l0.01,0`; if (pts.length === 2) return `M${pts[0]} L${pts[1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`; for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += ` Q${pts[i][0]},${pts[i][1]} ${mx},${my}`; } const l = pts[pts.length - 1]; return d + ` L${l[0]},${l[1]}`;
}
export function simplify(pts, tol = 0.8) {
  if (pts.length < 3) return pts; const out = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const p = out[out.length - 1]; if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) >= tol) out.push(pts[i]); } out.push(pts[pts.length - 1]); return out;
}
export const dashArr = (o) => (o.dash === 1 ? `${o.sw * 3} ${o.sw * 2}` : o.dash === 2 ? `${o.sw * 0.1} ${o.sw * 2.2}` : undefined);
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const shapeLabelBox = (o) => ({ x: o.x + 8, y: o.y + 8, w: Math.max(10, o.w - 16), h: Math.max(10, o.h - 16) });
/* Lines of text laid out for sticky/shape/text objects: {lines, x, y, anchor, fs, ...} */
export function layoutText(o) {
  if (o.type === 'text') { const lines = wrapText(o.text, null, o.fs, o.font, o.bold); return { lines, x: o.x, y: o.y, anchor: 'start', lh: o.fs * 1.25 }; }
  const pad = o.type === 'sticky' ? 14 : 10; const lines = wrapText(o.text, Math.max(20, o.w - pad * 2), o.fs, o.font, o.bold); const lh = o.fs * 1.25; const th = lines.length * lh; const al = o.align || (o.type === 'sticky' ? 'left' : 'center');
  return { lines, x: al === 'center' ? o.x + o.w / 2 : al === 'right' ? o.x + o.w - pad : o.x + pad, y: o.type === 'sticky' ? o.y + pad : o.y + (o.h - th) / 2, anchor: al === 'center' ? 'middle' : al === 'right' ? 'end' : 'start', lh };
}
export function shapePath(o) {
  const { x, y, w, h } = o;
  if (o.type === 'tri') return `M${x + w / 2},${y} L${x + w},${y + h} L${x},${y + h} Z`;
  if (o.type === 'diamond') return `M${x + w / 2},${y} L${x + w},${y + h / 2} L${x + w / 2},${y + h} L${x},${y + h / 2} Z`;
  if (o.type === 'star') { const c = [x + w / 2, y + h / 2]; let d = ''; for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.42 : 1; const a = (-90 + i * 36) * Math.PI / 180; d += `${i ? 'L' : 'M'}${c[0] + Math.cos(a) * r * w / 2},${c[1] + Math.sin(a) * r * h / 2} `; } return d + 'Z'; }
  if (o.type === 'hex') return `M${x + w * 0.25},${y} L${x + w * 0.75},${y} L${x + w},${y + h / 2} L${x + w * 0.75},${y + h} L${x + w * 0.25},${y + h} L${x},${y + h / 2} Z`;
  if (o.type === 'cloud') return `M${x + w * 0.25},${y + h * 0.85} a${w * 0.2},${h * 0.25} 0 0 1 -${w * 0.02},-${h * 0.5} a${w * 0.22},${h * 0.3} 0 0 1 ${w * 0.35},-${h * 0.25} a${w * 0.2},${h * 0.25} 0 0 1 ${w * 0.38},${h * 0.1} a${w * 0.18},${h * 0.25} 0 0 1 ${w * 0.04},${h * 0.65} Z`;
  return '';
}
export const SHAPES = [['rect', 'Rectangle'], ['round', 'Rounded'], ['ellipse', 'Ellipse'], ['tri', 'Triangle'], ['diamond', 'Diamond'], ['hex', 'Hexagon'], ['star', 'Star'], ['cloud', 'Cloud']];
export const isBoxy = (t) => ['rect', 'round', 'ellipse', 'tri', 'diamond', 'hex', 'star', 'cloud', 'sticky', 'image', 'frame'].includes(t);

function arrowHead(a, b, sw) { const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const L = 12 + sw * 2.5; return [-1, 1].map((s) => [b[0] - L * Math.cos(ang + s * 0.42), b[1] - L * Math.sin(ang + s * 0.42)]); }
export { arrowHead };

/* Serialise the board to a standalone SVG string */
export function toSvg(objs, bg, pad = 40) {
  const b = union(objs, objs) || { x: 0, y: 0, w: 400, h: 300 }; const x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2; const parts = [];
  const stroke = (o) => `stroke="${o.color}" stroke-width="${o.sw}" ${dashArr(o) ? `stroke-dasharray="${dashArr(o)}"` : ''} stroke-linecap="round" stroke-linejoin="round"`;
  const text = (o) => { const t = layoutText(o); const col = o.type === 'sticky' ? '#1f2937' : (o.fill === '#1f2937' && o.type !== 'text' ? '#fff' : o.type === 'text' ? o.color : o.color); return `<text font-family="${esc(FONTS[o.font] || FONTS.Sans)}" font-size="${o.fs}" ${o.bold ? 'font-weight="700"' : ''} ${o.italic ? 'font-style="italic"' : ''} fill="${col}" text-anchor="${t.anchor}">${t.lines.map((l, i) => `<tspan x="${t.x}" y="${t.y + o.fs * 0.95 + i * t.lh}" xml:space="preserve">${esc(l)}</tspan>`).join('')}</text>`; };
  for (const o of objs) {
    const op = o.op == null ? 1 : o.op; let s = '';
    if (o.type === 'pen') s = `<path d="${penPath(o.pts)}" fill="none" ${stroke(o)} ${o.hl ? 'stroke-opacity="0.4"' : ''}/>`;
    else if (o.type === 'line' || o.type === 'arrow') { const [p, q] = ends(o, objs); s = `<path d="${o.curve ? `M${p} Q${(p[0] + q[0]) / 2},${p[1]} ${q}` : `M${p} L${q}`}" fill="none" ${stroke(o)}/>`; if (o.type === 'arrow') { const h = arrowHead(p, q, o.sw); s += `<path d="M${h[0]} L${q} L${h[1]}" fill="none" ${stroke({ ...o, dash: 0 })}/>`; } }
    else if (o.type === 'text') s = text(o);
    else if (o.type === 'sticky') s = `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="3" fill="${o.fill}"/>${text(o)}`;
    else if (o.type === 'image') s = `<image href="${o.src}" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" preserveAspectRatio="none"/>`;
    else if (o.type === 'frame') s = `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.fill || 'none'}" ${stroke(o)}/><text x="${o.x}" y="${o.y - 8}" font-size="14" font-family="${esc(FONTS.Sans)}" fill="${o.color}">${esc(o.text || '')}</text>`;
    else { const f = o.fill || 'none'; if (o.type === 'rect' || o.type === 'round') s = `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.type === 'round' ? Math.min(o.w, o.h) * 0.2 : 0}" fill="${f}" ${stroke(o)}/>`; else if (o.type === 'ellipse') s = `<ellipse cx="${o.x + o.w / 2}" cy="${o.y + o.h / 2}" rx="${o.w / 2}" ry="${o.h / 2}" fill="${f}" ${stroke(o)}/>`; else s = `<path d="${shapePath(o)}" fill="${f}" ${stroke(o)}/>`; if (o.text) s += text(o); }
    parts.push(`<g opacity="${op}">${s}</g>`);
  }
  const bgc = bg && bg.startsWith('#') ? bg : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="${x} ${y} ${w} ${h}">${bgc ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bgc}"/>` : ''}${parts.join('')}</svg>`;
}
export async function toPng(objs, bg, scale = 2) {
  const svg = toSvg(objs, bg); const m = /width="(\d+)" height="(\d+)"/.exec(svg); const w = +m[1], h = +m[2]; const k = Math.min(scale, 8000 / Math.max(w, h));
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('render failed')); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); const g = c.getContext('2d'); if (bg && bg.startsWith('#')) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); } g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
