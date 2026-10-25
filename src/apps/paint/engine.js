/* Techomato Paint engine: shapes, brushes, flood fill, filters, document model with history. */
import { uid } from '../../lib/useStore.js';

export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
export const cloneCanvas = (c) => { const n = mk(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
export const ctx2 = (c) => c.getContext('2d', { willReadFrequently: true });
export const hexToRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h) || /^#?([0-9a-f]{3})$/i.exec(h); if (!m) return [0, 0, 0]; let s = m[1]; if (s.length === 3) s = s.split('').map((x) => x + x).join(''); const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/* ---------- shapes ---------- */
export const SHAPES = [
  ['line', 'Line'], ['arrow', 'Arrow line'], ['rect', 'Rectangle'], ['round', 'Rounded rectangle'], ['ellipse', 'Oval'], ['triangle', 'Triangle'], ['rtriangle', 'Right triangle'], ['diamond', 'Diamond'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'],
  ['star4', '4-point star'], ['star5', '5-point star'], ['star6', '6-point star'], ['arrowR', 'Right arrow'], ['arrowL', 'Left arrow'], ['arrowU', 'Up arrow'], ['arrowD', 'Down arrow'], ['heart', 'Heart'], ['callout', 'Speech bubble'], ['bolt', 'Lightning'],
];
const poly = (pts, x, y, w, h) => { const p = new Path2D(); pts.forEach(([a, b], i) => { const px = x + a * w; const py = y + b * h; if (i) p.lineTo(px, py); else p.moveTo(px, py); }); p.closePath(); return p; };
const regular = (n, x, y, w, h, inner) => { const pts = []; const k = inner ? n * 2 : n; for (let i = 0; i < k; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / k; const r = inner && i % 2 ? inner : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]); const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys); return poly(pts.map(([a, b]) => [(a - x0) / (x1 - x0), (b - y0) / (y1 - y0)]), x, y, w, h); };
export function shapePath(kind, x, y, w, h) {
  const p = new Path2D();
  switch (kind) {
    case 'rect': p.rect(x, y, w, h); return p;
    case 'round': { const r = Math.min(w, h) * 0.2; p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); return p; }
    case 'ellipse': p.ellipse(x + w / 2, y + h / 2, Math.max(0.01, w / 2), Math.max(0.01, h / 2), 0, 0, Math.PI * 2); return p;
    case 'triangle': return poly([[0.5, 0], [1, 1], [0, 1]], x, y, w, h);
    case 'rtriangle': return poly([[0, 0], [0, 1], [1, 1]], x, y, w, h);
    case 'diamond': return poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], x, y, w, h);
    case 'pentagon': return regular(5, x, y, w, h);
    case 'hexagon': return regular(6, x, y, w, h);
    case 'star4': return regular(4, x, y, w, h, 0.4);
    case 'star5': return regular(5, x, y, w, h, 0.382);
    case 'star6': return regular(6, x, y, w, h, 0.55);
    case 'arrowR': return poly([[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]], x, y, w, h);
    case 'arrowL': return poly([[1, 0.3], [0.4, 0.3], [0.4, 0], [0, 0.5], [0.4, 1], [0.4, 0.7], [1, 0.7]], x, y, w, h);
    case 'arrowU': return poly([[0.3, 1], [0.3, 0.4], [0, 0.4], [0.5, 0], [1, 0.4], [0.7, 0.4], [0.7, 1]], x, y, w, h);
    case 'arrowD': return poly([[0.3, 0], [0.3, 0.6], [0, 0.6], [0.5, 1], [1, 0.6], [0.7, 0.6], [0.7, 0]], x, y, w, h);
    case 'callout': return poly([[0, 0], [1, 0], [1, 0.75], [0.45, 0.75], [0.2, 1], [0.28, 0.75], [0, 0.75]], x, y, w, h);
    case 'bolt': return poly([[0.55, 0], [0.15, 0.55], [0.45, 0.55], [0.35, 1], [0.85, 0.4], [0.55, 0.4], [0.7, 0]], x, y, w, h);
    case 'heart': { const X = (a) => x + a * w; const Y = (b) => y + b * h; p.moveTo(X(0.5), Y(0.95)); p.bezierCurveTo(X(0.1), Y(0.65), X(0), Y(0.4), X(0), Y(0.28)); p.bezierCurveTo(X(0), Y(0.1), X(0.15), Y(0), X(0.3), Y(0)); p.bezierCurveTo(X(0.4), Y(0), X(0.47), Y(0.06), X(0.5), Y(0.14)); p.bezierCurveTo(X(0.53), Y(0.06), X(0.6), Y(0), X(0.7), Y(0)); p.bezierCurveTo(X(0.85), Y(0), X(1), Y(0.1), X(1), Y(0.28)); p.bezierCurveTo(X(1), Y(0.4), X(0.9), Y(0.65), X(0.5), Y(0.95)); p.closePath(); return p; }
    default: return p;
  }
}
export function drawShape(ctx, kind, a, b, o) {
  let [x0, y0] = a; let [x1, y1] = b; const { stroke, fill, width, outline, constrain } = o;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.fillStyle = fill;
  if (kind === 'line' || kind === 'arrow') {
    if (constrain) { const dx = x1 - x0; const dy = y1 - y0; const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(dx, dy); x1 = x0 + Math.cos(ang) * len; y1 = y0 + Math.sin(ang) * len; }
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (kind === 'arrow') { const ang = Math.atan2(y1 - y0, x1 - x0); const L = Math.max(10, width * 4); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - L * Math.cos(ang - 0.45), y1 - L * Math.sin(ang - 0.45)); ctx.moveTo(x1, y1); ctx.lineTo(x1 - L * Math.cos(ang + 0.45), y1 - L * Math.sin(ang + 0.45)); ctx.stroke(); }
    ctx.restore(); return;
  }
  let w = x1 - x0; let h = y1 - y0; if (constrain) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
  const x = Math.min(x0, x0 + w); const y = Math.min(y0, y0 + h); const path = shapePath(kind, x, y, Math.abs(w), Math.abs(h));
  if (fill !== 'none' && o.useFill) ctx.fill(path);
  if (outline) ctx.stroke(path);
  ctx.restore();
}

/* ---------- brushes ---------- */
export const BRUSHES = [['brush', 'Brush'], ['pencil', 'Pencil'], ['calli1', 'Calligraphy brush 1'], ['calli2', 'Calligraphy brush 2'], ['airbrush', 'Airbrush'], ['oil', 'Oil brush'], ['crayon', 'Crayon'], ['marker', 'Marker'], ['natural', 'Natural pencil'], ['watercolor', 'Watercolour brush']];
const rnd = (a) => (Math.random() - 0.5) * 2 * a;
function stamps(a, b, spacing, fn) { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.floor(d / spacing)); for (let i = 1; i <= n; i++) { const t = i / n; fn(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); } }
export function strokeSeg(ctx, kind, prev, mid, last, cur, size, color, pressure = 1) {
  const s = Math.max(1, size * (0.35 + 0.65 * pressure)); ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const smooth = () => { ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.quadraticCurveTo(last[0], last[1], mid[0], mid[1]); ctx.stroke(); };
  switch (kind) {
    case 'pencil': ctx.lineWidth = Math.max(1, s * 0.6); smooth(); break;
    case 'marker': ctx.lineCap = 'square'; ctx.lineWidth = s * 1.4; ctx.globalAlpha = 0.9; smooth(); break;
    case 'calli1': case 'calli2': { const ang = kind === 'calli1' ? -Math.PI / 4 : Math.PI / 4; const dx = Math.cos(ang) * s / 2; const dy = Math.sin(ang) * s / 2; stamps(prev, mid, 0.7, (x, y) => { ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.lineWidth = 2; ctx.stroke(); }); break; }
    case 'airbrush': { const n = Math.ceil(s * 0.8); stamps(prev, mid, Math.max(1, s * 0.2), (x, y) => { for (let i = 0; i < n; i++) { const r = Math.sqrt(Math.random()) * s * 0.9; const a = Math.random() * 6.283; ctx.globalAlpha = 0.35; ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.1, 1.1); } }); break; }
    case 'oil': { const k = Math.max(3, Math.round(s / 3)); for (let i = 0; i < k; i++) { const o = (i / (k - 1) - 0.5) * s; ctx.globalAlpha = 0.5 + Math.random() * 0.35; ctx.lineWidth = Math.max(1, s / k * 1.6); ctx.beginPath(); ctx.moveTo(prev[0] + o * 0.7, prev[1] + o * 0.7 + rnd(0.6)); ctx.lineTo(mid[0] + o * 0.7, mid[1] + o * 0.7 + rnd(0.6)); ctx.stroke(); } break; }
    case 'crayon': { const n = Math.ceil(s * 1.2); stamps(prev, mid, Math.max(1, s * 0.25), (x, y) => { for (let i = 0; i < n; i++) { const r = Math.sqrt(Math.random()) * s * 0.6; const a = Math.random() * 6.283; if (Math.random() < 0.6) { ctx.globalAlpha = 0.5 + Math.random() * 0.5; ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.6, 1.6); } } }); break; }
    case 'natural': { const n = Math.ceil(s * 1.2); stamps(prev, mid, Math.max(1, s * 0.2), (x, y) => { for (let i = 0; i < n; i++) { const r = Math.sqrt(Math.random()) * s * 0.35; const a = Math.random() * 6.283; ctx.globalAlpha = 0.25 + Math.random() * 0.5; ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1); } }); break; }
    case 'watercolor': { const R = s * 0.9; stamps(prev, mid, Math.max(1, R * 0.12), (x, y) => { const g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, color); g.addColorStop(1, color + '00'); ctx.globalAlpha = 0.07; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.fill(); }); break; }
    default: ctx.lineWidth = s; smooth();
  }
  ctx.restore();
}
export function dot(ctx, kind, p, size, color, pressure = 1) { strokeSeg(ctx, kind, p, [p[0] + 0.01, p[1]], p, p, size, color, pressure); if (kind === 'brush' || kind === 'pencil' || kind === 'marker') { ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.5, (kind === 'pencil' ? size * 0.3 : kind === 'marker' ? size * 0.7 : size / 2)), 0, 6.283); ctx.fill(); ctx.restore(); } }

/* ---------- flood fill ---------- */
export function floodFill(canvas, sx, sy, color, tol) {
  const w = canvas.width; const h = canvas.height; sx = Math.floor(sx); sy = Math.floor(sy); if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const c = ctx2(canvas); const img = c.getImageData(0, 0, w, h); const d = img.data; const [fr, fg, fb] = hexToRgb(color); const i0 = (sy * w + sx) * 4; const tr = d[i0]; const tg = d[i0 + 1]; const tb = d[i0 + 2]; const ta = d[i0 + 3];
  const T = (tol / 100) * 255 * 2; const match = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) + Math.abs(d[i + 3] - ta) <= T * 2;
  if (!tol && tr === fr && tg === fg && tb === fb && ta === 255) return null;
  const seen = new Uint8Array(w * h); const stack = [sx, sy]; let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
  while (stack.length) {
    let y = stack.pop(); const x0 = stack.pop(); let x = x0;
    while (x >= 0 && !seen[y * w + x] && match((y * w + x) * 4)) x--; x++;
    let up = false; let dn = false;
    for (; x < w && !seen[y * w + x] && match((y * w + x) * 4); x++) {
      seen[y * w + x] = 1; const i = (y * w + x) * 4; d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (y > 0) { const m = !seen[(y - 1) * w + x] && match(((y - 1) * w + x) * 4); if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false; }
      if (y < h - 1) { const m = !seen[(y + 1) * w + x] && match(((y + 1) * w + x) * 4); if (m && !dn) { stack.push(x, y + 1); dn = true; } else if (!m) dn = false; }
    }
  }
  // soften the edge: grow the filled region by 1px into anti-aliased neighbours
  for (let y = Math.max(0, minY - 1); y <= Math.min(h - 1, maxY + 1); y++) for (let x = Math.max(0, minX - 1); x <= Math.min(w - 1, maxX + 1); x++) { const k = y * w + x; if (seen[k]) continue; const n = (x > 0 && seen[k - 1]) || (x < w - 1 && seen[k + 1]) || (y > 0 && seen[k - w]) || (y < h - 1 && seen[k + w]); if (n && ta !== 0 && match(k * 4) === false) { const i = k * 4; if (Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) < 160) { d[i] = (d[i] + fr) >> 1; d[i + 1] = (d[i + 1] + fg) >> 1; d[i + 2] = (d[i + 2] + fb) >> 1; } } }
  c.putImageData(img, 0, 0); return { x: Math.max(0, minX - 1), y: Math.max(0, minY - 1), w: Math.min(w, maxX + 2) - Math.max(0, minX - 1), h: Math.min(h, maxY + 2) - Math.max(0, minY - 1) };
}

/* ---------- filters (per-layer, pixel based so they work everywhere) ---------- */
export function pixelFilter(canvas, kind) {
  const c = ctx2(canvas); const img = c.getImageData(0, 0, canvas.width, canvas.height); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (kind === 'invert') { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
    else if (kind === 'gray') { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = g; }
    else if (kind === 'sepia') { const r = d[i]; const g = d[i + 1]; const b = d[i + 2]; d[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189); d[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168); d[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131); }
  }
  c.putImageData(img, 0, 0);
}
export const cssFilter = (a) => `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) hue-rotate(${a.hue}deg)${a.blur ? ` blur(${a.blur}px)` : ''}`;
export const supportsFilter = (() => { try { const c = mk(2, 2).getContext('2d'); return typeof c.filter === 'string'; } catch { return false; } })();
export function applyAdjust(canvas, a) { const t = cloneCanvas(canvas); const c = canvas.getContext('2d'); c.save(); c.clearRect(0, 0, canvas.width, canvas.height); c.filter = cssFilter(a); c.drawImage(t, 0, 0); c.restore(); }

/* ---------- document ---------- */
export class Doc {
  constructor(w = 1024, h = 640, bg = '#ffffff') { this.subs = new Set(); this.registry = new Map(); this.reset(w, h, bg); }
  reset(w, h, bg) {
    this.w = w; this.h = h; this.layers = []; this.undoS = []; this.redoS = []; this.name = 'Untitled'; this.dirty = false;
    const L = this.makeLayer('Background'); if (bg) { const c = L.canvas.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, w, h); } L.isBg = true; this.layers.push(L); this.active = L.id; this.touch(true);
  }
  makeLayer(name) { const L = { id: uid(), name, visible: true, opacity: 1, blend: 'source-over', canvas: mk(this.w, this.h) }; this.registry.set(L.id, L); return L; }
  touch(structural) { this.ver = (this.ver || 0) + 1; this.subs.forEach((f) => f(structural)); }
  get cur() { return this.layers.find((l) => l.id === this.active) || this.layers[this.layers.length - 1]; }
  push(e) { this.undoS.push(e); if (this.undoS.length > 60) this.undoS.shift(); this.redoS = []; this.dirty = true; this.touch(true); }
  canUndo() { return this.undoS.length > 0; } canRedo() { return this.redoS.length > 0; }
  undo() { const e = this.undoS.pop(); if (!e) return; e.undo(); this.redoS.push(e); this.dirty = true; this.touch(true); }
  redo() { const e = this.redoS.pop(); if (!e) return; e.redo(); this.undoS.push(e); this.dirty = true; this.touch(true); }
  /* pixel ops */
  beginPx(layer) { this._l = layer; this._b = cloneCanvas(layer.canvas); }
  endPx(rect) {
    const L = this._l; const b = this._b; this._l = null; this._b = null; if (!L || !rect) return;
    const x = Math.max(0, Math.floor(rect.x)); const y = Math.max(0, Math.floor(rect.y)); const w = Math.min(this.w, Math.ceil(rect.x + rect.w)) - x; const h = Math.min(this.h, Math.ceil(rect.y + rect.h)) - y; if (w <= 0 || h <= 0) return;
    const bef = ctx2(b).getImageData(x, y, w, h); const aft = ctx2(L.canvas).getImageData(x, y, w, h);
    this.push({ undo: () => ctx2(L.canvas).putImageData(bef, x, y), redo: () => ctx2(L.canvas).putImageData(aft, x, y) });
  }
  snap() { return { w: this.w, h: this.h, active: this.active, layers: this.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, isBg: l.isBg, canvas: cloneCanvas(l.canvas) })) }; }
  restore(s) {
    this.w = s.w; this.h = s.h; this.active = s.active;
    this.layers = s.layers.map((sl) => { let L = this.registry.get(sl.id); if (!L) { L = { id: sl.id, canvas: mk(s.w, s.h) }; this.registry.set(sl.id, L); } Object.assign(L, { name: sl.name, visible: sl.visible, opacity: sl.opacity, blend: sl.blend, isBg: sl.isBg }); L.canvas.width = s.w; L.canvas.height = s.h; L.canvas.getContext('2d').drawImage(sl.canvas, 0, 0); return L; });
  }
  docOp(fn) { const before = this.snap(); fn(); const after = this.snap(); this.push({ undo: () => this.restore(before), redo: () => this.restore(after) }); }
  /* drawing / export */
  draw(ctx, { extras, preview, bg } = {}) {
    ctx.clearRect(0, 0, this.w, this.h); if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, this.w, this.h); }
    for (const L of this.layers) {
      if (L.visible) { ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = L.blend; if (preview && L.id === this.active) ctx.filter = preview; ctx.drawImage(L.canvas, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      if (extras && L.id === this.active) extras(ctx);
    }
  }
  flatten(bg) { const c = mk(this.w, this.h); this.draw(c.getContext('2d'), { bg }); return c; }
  serialize() { return { v: 1, w: this.w, h: this.h, name: this.name, active: this.active, layers: this.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, isBg: !!l.isBg, png: l.canvas.toDataURL('image/png') })) }; }
  async load(o) {
    const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const w = Math.min(8000, Math.max(1, +o.w | 0)); const h = Math.min(8000, Math.max(1, +o.h | 0)); const layers = [];
    for (const sl of o.layers.slice(0, 40)) { if (typeof sl.png !== 'string' || !/^data:image\/png;base64,/.test(sl.png)) continue; const img = await loadImg(sl.png); const L = { id: String(sl.id || uid()).slice(0, 24), name: String(sl.name || 'Layer').slice(0, 60), visible: sl.visible !== false, opacity: Math.max(0, Math.min(1, +sl.opacity || 1)), blend: ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].includes(sl.blend) ? sl.blend : 'source-over', isBg: !!sl.isBg, canvas: mk(w, h) }; L.canvas.getContext('2d').drawImage(img, 0, 0); layers.push(L); this.registry.set(L.id, L); }
    if (!layers.length) throw new Error('empty');
    this.w = w; this.h = h; this.layers = layers; this.active = layers.find((l) => l.id === o.active) ? o.active : layers[layers.length - 1].id; this.undoS = []; this.redoS = []; this.name = String(o.name || 'Untitled').slice(0, 80); this.dirty = false; this.touch(true);
  }
  async loadImage(img, name) { this.reset(img.width || img.naturalWidth, img.height || img.naturalHeight, null); const L = this.layers[0]; L.canvas.getContext('2d').drawImage(img, 0, 0); this.name = (name || 'Image').replace(/\.[^.]+$/, ''); this.dirty = false; this.touch(true); }
}
