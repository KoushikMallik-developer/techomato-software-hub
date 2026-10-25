import { ADJUSTMENTS, adjDefaults, hexRgb } from './adjust.js';
import { FILTERS } from './filters.js';

export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
export const ctxOf = (c) => c.getContext('2d', { willReadFrequently: true });
export const cloneCanvas = (c) => { const n = mk(c.width, c.height); ctxOf(n).drawImage(c, 0, 0); return n; };
export const BLENDS = [['normal', 'Normal'], ['darken', 'Darken'], ['multiply', 'Multiply'], ['color-burn', 'Color Burn'], ['lighten', 'Lighten'], ['screen', 'Screen'], ['color-dodge', 'Color Dodge'], ['overlay', 'Overlay'], ['soft-light', 'Soft Light'], ['hard-light', 'Hard Light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];
const blendOp = (b) => (b === 'normal' ? 'source-over' : b);

let LN = 0;
export const lid = () => `L${++LN}${Math.random().toString(36).slice(2, 6)}`;
export const defaultStyle = () => ({
  shadow: { on: false, color: '#000000', opacity: 60, angle: 120, dist: 8, blur: 8 },
  glow: { on: false, color: '#ffe066', opacity: 70, size: 12 },
  stroke: { on: false, color: '#000000', size: 3 },
  overlay: { on: false, color: '#ff0000', opacity: 100 },
});
export const hasStyle = (s) => !!s && (s.shadow.on || s.glow.on || s.stroke.on || s.overlay.on);
export const defaultText = (o = {}) => ({ str: 'Text', font: 'Inter, Arial, sans-serif', size: 64, color: '#ffffff', bold: false, italic: false, align: 'left', track: 0, lineH: 1.2, x: 40, y: 40, ...o });
export const defaultShape = (o = {}) => ({ kind: 'rect', x: 40, y: 40, w: 200, h: 140, fill: '#ff5a36', stroke: '#000000', sw: 0, radius: 0, sides: 5, hasFill: true, ...o });

export function renderText(t, w, h) {
  const c = mk(w, h), g = c.getContext('2d'); g.fillStyle = t.color; g.textBaseline = 'top'; g.textAlign = t.align;
  g.font = `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${t.size}px ${t.font}`; if ('letterSpacing' in g) g.letterSpacing = `${t.track}px`;
  const lines = String(t.str).split('\n'); lines.forEach((ln, i) => g.fillText(ln, t.x, t.y + i * t.size * t.lineH));
  return c;
}
export function textBox(t) {
  const g = mk(4, 4).getContext('2d'); g.font = `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${t.size}px ${t.font}`; if ('letterSpacing' in g) g.letterSpacing = `${t.track}px`;
  const lines = String(t.str).split('\n'); const wd = Math.max(...lines.map((l) => g.measureText(l).width), 10); const h = lines.length * t.size * t.lineH;
  const x = t.align === 'center' ? t.x - wd / 2 : t.align === 'right' ? t.x - wd : t.x; return { x, y: t.y, w: wd, h };
}
export function shapePath(g, s) {
  g.beginPath();
  if (s.kind === 'rect') { if (s.radius > 0 && g.roundRect) g.roundRect(s.x, s.y, s.w, s.h, s.radius); else g.rect(s.x, s.y, s.w, s.h); }
  else if (s.kind === 'ellipse') g.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
  else if (s.kind === 'line') { g.moveTo(s.x, s.y); g.lineTo(s.x + s.w, s.y + s.h); }
  else if (s.kind === 'polygon' || s.kind === 'star') {
    const n = Math.max(3, s.sides | 0), cx = s.x + s.w / 2, cy = s.y + s.h / 2, rx = Math.abs(s.w / 2), ry = Math.abs(s.h / 2); const pts = s.kind === 'star' ? n * 2 : n;
    for (let i = 0; i < pts; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / pts; const k = s.kind === 'star' && i % 2 ? 0.45 : 1; const px = cx + Math.cos(a) * rx * k, py = cy + Math.sin(a) * ry * k; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath();
  }
}
export function renderShape(s, w, h) {
  const c = mk(w, h), g = c.getContext('2d'); shapePath(g, s);
  if (s.kind !== 'line' && s.hasFill !== false) { g.fillStyle = s.fill; g.fill(); }
  if (s.sw > 0 || s.kind === 'line') { g.lineWidth = Math.max(1, s.sw || 4); g.strokeStyle = s.kind === 'line' ? (s.stroke || s.fill) : s.stroke; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
  return c;
}

/* silhouette of a sprite filled with one colour */
function silhouette(sprite, color) { const c = mk(sprite.width, sprite.height), g = c.getContext('2d'); g.drawImage(sprite, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); return c; }
const supportsFilter = (() => { try { return typeof mk(2, 2).getContext('2d').filter === 'string'; } catch { return false; } })();
function applyStyle(sprite, st) {
  const out = mk(sprite.width, sprite.height), g = out.getContext('2d');
  if (st.shadow.on) { const s = st.shadow, a = (s.angle * Math.PI) / 180; const sil = silhouette(sprite, s.color); g.save(); g.globalAlpha = s.opacity / 100; if (supportsFilter) g.filter = `blur(${s.blur}px)`; g.drawImage(sil, Math.cos(a) * s.dist, Math.sin(a) * s.dist); g.restore(); }
  if (st.glow.on) { const s = st.glow; const sil = silhouette(sprite, s.color); g.save(); g.globalAlpha = s.opacity / 100; if (supportsFilter) g.filter = `blur(${s.size}px)`; g.drawImage(sil, 0, 0); g.drawImage(sil, 0, 0); g.restore(); }
  if (st.stroke.on) { const s = st.stroke; const sil = silhouette(sprite, s.color); const r = s.size; const n = Math.max(12, Math.round(r * 4)); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); } }
  if (st.overlay.on) { const c2 = cloneCanvas(sprite); const gg = c2.getContext('2d'); gg.globalCompositeOperation = 'source-atop'; gg.globalAlpha = st.overlay.opacity / 100; gg.fillStyle = st.overlay.color; gg.fillRect(0, 0, c2.width, c2.height); g.drawImage(c2, 0, 0); } else g.drawImage(sprite, 0, 0);
  return out;
}

const META_KEYS = ['name', 'type', 'visible', 'locked', 'opacity', 'blend', 'maskOn', 'clip', 'canvas', 'mask', 'ox'];
const DEEP_KEYS = ['adj', 'text', 'shape', 'style'];

let DOCN = 0;
export class PDoc {
  constructor(w = 1200, h = 800, bg = '#ffffff') {
    this.uid = ++DOCN;     this.w = w; this.h = h; this.layers = []; this.activeId = null; this.sel = null; this.selVer = 0; this.hist = []; this.hi = 0; this.maxHist = 60; this.ver = 0; this.dirty = false; this.maskEdit = false; this.guides = [];
    const L = this.makeLayer({ name: bg === 'transparent' ? 'Layer 1' : 'Background' }); if (bg !== 'transparent') { const g = ctxOf(L.canvas); g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    this.layers.push(L); this.activeId = L.id;
  }
  makeLayer(o = {}) { return { id: lid(), name: 'Layer', type: 'raster', visible: true, locked: false, opacity: 100, blend: 'normal', canvas: o.type === 'adjust' ? null : mk(this.w, this.h), mask: null, maskOn: true, clip: false, adj: null, text: null, shape: null, style: defaultStyle(), ox: 0, ...o }; }
  get active() { return this.layers.find((l) => l.id === this.activeId) || this.layers[this.layers.length - 1]; }
  indexOf(id) { return this.layers.findIndex((l) => l.id === id); }
  touch() { this.ver++; this.dirty = true; if (this.onTouch) this.onTouch(); }
  /* ---------- history ---------- */
  push(label, undo, redo) { this.hist.length = this.hi; this.hist.push({ label, undo, redo }); if (this.hist.length > this.maxHist) this.hist.shift(); this.hi = this.hist.length; this.touch(); }
  undo() { if (this.hi > 0) { this.hist[--this.hi].undo(); this.touch(); return true; } return false; }
  redo() { if (this.hi < this.hist.length) { this.hist[this.hi++].redo(); this.touch(); return true; } return false; }
  jump(i) { while (this.hi > i) this.undo(); while (this.hi < i) this.redo(); }
  snapMeta() {
    const list = this.layers.map((L) => { const p = {}; for (const k of META_KEYS) p[k] = L[k]; for (const k of DEEP_KEYS) p[k] = L[k] ? JSON.parse(JSON.stringify(L[k])) : L[k]; return { L, p }; });
    return { w: this.w, h: this.h, list, active: this.activeId, sel: this.sel };
  }
  restoreMeta(s) {
    this.w = s.w; this.h = s.h; this.layers = s.list.map(({ L, p }) => { for (const k of META_KEYS) L[k] = p[k]; for (const k of DEEP_KEYS) L[k] = p[k] ? JSON.parse(JSON.stringify(p[k])) : p[k]; delete L._cache; return L; });
    this.activeId = this.layers.find((l) => l.id === s.active) ? s.active : (this.layers[this.layers.length - 1] || {}).id; this.sel = s.sel; this.selVer++;
  }
  command(label, fn) { const a = this.snapMeta(); const r = fn(); const b = this.snapMeta(); this.push(label, () => this.restoreMeta(a), () => this.restoreMeta(b)); return r; }
  liveSet(fn) { if (!this._pend) this._pend = this.snapMeta(); fn(); this.touch(); }
  liveEnd(label = 'Edit layer') { if (!this._pend) return; const a = this._pend, b = this.snapMeta(); this._pend = null; this.push(label, () => this.restoreMeta(a), () => this.restoreMeta(b)); }
  /* pixel edit on a layer canvas / mask; bounding rect keeps history small */
  beginPx(layer, which = 'canvas') { const target = layer[which]; return { layer, which, target, pre: cloneCanvas(target) }; }
  endPx(tok, label, rect, extra) {
    const t = tok.target, r = rect ? { x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)), w: 0, h: 0 } : { x: 0, y: 0, w: t.width, h: t.height };
    if (rect) { r.w = Math.min(t.width, Math.ceil(rect.x + rect.w)) - r.x; r.h = Math.min(t.height, Math.ceil(rect.y + rect.h)) - r.y; if (r.w <= 0 || r.h <= 0) return; }
    const crop = (src) => { const c = mk(r.w, r.h); c.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); return c; };
    const before = crop(tok.pre), after = crop(t); const put = (img) => { const g = t.getContext('2d'); g.save(); g.globalCompositeOperation = 'copy'; g.drawImage(img, r.x, r.y); g.restore(); }; if (rect) { /* 'copy' clears whole canvas; use clearRect instead */ }
    const apply = (img) => { const g = t.getContext('2d'); g.save(); g.globalCompositeOperation = 'source-over'; g.clearRect(r.x, r.y, r.w, r.h); g.drawImage(img, r.x, r.y); g.restore(); void put; };
    this.push(label, () => { apply(before); extra && extra.undo && extra.undo(); }, () => { apply(after); extra && extra.redo && extra.redo(); });
  }
  /* ---------- layer surface and compositing ---------- */
  surface(L) {
    if (L.type === 'text') { const key = JSON.stringify(L.text) + this.w + this.h; if (!L._cache || L._cache.key !== key) L._cache = { key, c: renderText(L.text, this.w, this.h) }; return L._cache.c; }
    if (L.type === 'shape') { const key = JSON.stringify(L.shape) + this.w + this.h; if (!L._cache || L._cache.key !== key) L._cache = { key, c: renderShape(L.shape, this.w, this.h) }; return L._cache.c; }
    return L.canvas;
  }
  sprite(L, extra) {
    let src = this.surface(L); const useMask = L.mask && L.maskOn; const st = hasStyle(L.style);
    if (!useMask && !st && !extra) return src;
    let sp = cloneCanvas(src); const g = sp.getContext('2d');
    if (extra) { g.save(); g.globalAlpha = extra.alpha ?? 1; g.globalCompositeOperation = extra.op || 'source-over'; g.drawImage(extra.canvas, extra.dx || 0, extra.dy || 0); g.restore(); }
    if (useMask) { g.globalCompositeOperation = 'destination-in'; g.drawImage(L.mask, 0, 0); g.globalCompositeOperation = 'source-over'; }
    if (st) sp = applyStyle(sp, L.style);
    return sp;
  }
  composite(opts = {}) {
    const out = mk(this.w, this.h), g = ctxOf(out); let base = null;
    for (const L of this.layers) {
      if (!L.visible || (opts.skip && opts.skip.has(L.id))) { if (!L.clip) base = null; continue; }
      if (L.type === 'adjust') {
        if (!L.adj) continue; const img = g.getImageData(0, 0, this.w, this.h); ADJUSTMENTS[L.adj.kind].make(L.adj.params)(img.data);
        const adj = mk(this.w, this.h), ag = ctxOf(adj); ag.putImageData(img, 0, 0);
        if (L.mask && L.maskOn) { ag.globalCompositeOperation = 'destination-in'; ag.drawImage(L.mask, 0, 0); ag.globalCompositeOperation = 'source-over'; }
        if (L.clip && base) { ag.globalCompositeOperation = 'destination-in'; ag.drawImage(base, 0, 0); ag.globalCompositeOperation = 'source-over'; }
        g.save(); g.globalAlpha = L.opacity / 100; g.drawImage(adj, 0, 0); g.restore(); continue;
      }
      const extra = opts.floating && opts.floating.layerId === L.id ? opts.floating : null;
      let sp = this.sprite(L, extra);
      if (L.clip && base) { if (sp === L.canvas || sp === L._cache?.c) sp = cloneCanvas(sp); const sg = sp.getContext('2d'); sg.globalCompositeOperation = 'destination-in'; sg.drawImage(base, 0, 0); sg.globalCompositeOperation = 'source-over'; }
      else base = sp;
      g.save(); g.globalAlpha = L.opacity / 100; g.globalCompositeOperation = blendOp(L.blend); g.drawImage(sp, (L.ox || 0), 0); g.restore();
    }
    return out;
  }
  /* ---------- layer commands ---------- */
  addLayer(o = {}) {
    return this.command('New layer', () => { const L = this.makeLayer(o); const i = this.indexOf(this.activeId); this.layers.splice(i + 1, 0, L); this.activeId = L.id; return L; });
  }
  addAdjustment(kind) {
    const a = ADJUSTMENTS[kind];
    return this.command(`New ${a.label} layer`, () => { const L = this.makeLayer({ type: 'adjust', name: a.label, adj: { kind, params: adjDefaults(kind) } }); { const m = mk(this.w, this.h); const mg = ctxOf(m); mg.fillStyle = '#fff'; mg.fillRect(0, 0, this.w, this.h); L.mask = m; } const i = this.indexOf(this.activeId); this.layers.splice(i + 1, 0, L); this.activeId = L.id; return L; });
  }
  addText(o = {}) { return this.command('Text layer', () => { const t = defaultText(o); const L = this.makeLayer({ type: 'text', name: t.str.slice(0, 20), text: t }); const i = this.indexOf(this.activeId); this.layers.splice(i + 1, 0, L); this.activeId = L.id; return L; }); }
  addShape(o = {}) { return this.command('Shape layer', () => { const s = defaultShape(o); const L = this.makeLayer({ type: 'shape', name: s.kind === 'rect' ? 'Rectangle' : s.kind === 'ellipse' ? 'Ellipse' : s.kind === 'line' ? 'Line' : s.kind === 'star' ? 'Star' : 'Polygon', shape: s }); const i = this.indexOf(this.activeId); this.layers.splice(i + 1, 0, L); this.activeId = L.id; return L; }); }
  addFromCanvas(c, name = 'Pasted', x = 0, y = 0) { return this.command('Paste', () => { const L = this.makeLayer({ name }); ctxOf(L.canvas).drawImage(c, x, y); const i = this.indexOf(this.activeId); this.layers.splice(i + 1, 0, L); this.activeId = L.id; return L; }); }
  duplicate(L = this.active) { return this.command('Duplicate layer', () => { const n = this.makeLayer({ ...L, id: undefined }); n.id = lid(); n.name = L.name + ' copy'; if (L.canvas) n.canvas = cloneCanvas(L.canvas); if (L.mask) n.mask = cloneCanvas(L.mask); for (const k of DEEP_KEYS) if (L[k]) n[k] = JSON.parse(JSON.stringify(L[k])); delete n._cache; this.layers.splice(this.indexOf(L.id) + 1, 0, n); this.activeId = n.id; return n; }); }
  remove(L = this.active) { if (this.layers.length <= 1) return false; this.command('Delete layer', () => { const i = this.indexOf(L.id); this.layers.splice(i, 1); this.activeId = this.layers[Math.min(i, this.layers.length - 1)].id; }); return true; }
  reorder(L, dir) { const i = this.indexOf(L.id), j = i + dir; if (j < 0 || j >= this.layers.length) return; this.command('Reorder layers', () => { const a = this.layers; [a[i], a[j]] = [a[j], a[i]]; }); }
  moveTo(L, toIndex) { const i = this.indexOf(L.id); if (i === toIndex || toIndex < 0 || toIndex >= this.layers.length) return; this.command('Reorder layers', () => { this.layers.splice(i, 1); this.layers.splice(toIndex, 0, L); }); }
  setProps(L, patch, label = 'Layer properties') { this.command(label, () => { for (const k in patch) { if (typeof patch[k] === 'object' && patch[k] && !Array.isArray(patch[k]) && L[k] && typeof L[k] === 'object') L[k] = { ...L[k], ...patch[k] }; else L[k] = patch[k]; } delete L._cache; }); }
  setLive(L, patch) { for (const k in patch) { if (typeof patch[k] === 'object' && patch[k] && !Array.isArray(patch[k]) && L[k] && typeof L[k] === 'object') L[k] = { ...L[k], ...patch[k] }; else L[k] = patch[k]; } this.touch(); }
  mergeDown(L = this.active) {
    const i = this.indexOf(L.id); if (i <= 0) return false;
    this.command('Merge down', () => { const below = this.layers[i - 1]; const tmp = new PDoc(this.w, this.h, 'transparent'); tmp.layers = [Object.assign({}, below, { visible: true, opacity: below.opacity }), Object.assign({}, L, { visible: true })]; const m = tmp.composite(); const nl = this.makeLayer({ name: below.name }); ctxOf(nl.canvas).drawImage(m, 0, 0); nl.opacity = 100; this.layers.splice(i - 1, 2, nl); this.activeId = nl.id; });
    return true;
  }
  mergeVisible() { this.command('Merge visible', () => { const m = this.composite(); const L = this.makeLayer({ name: 'Merged' }); ctxOf(L.canvas).drawImage(m, 0, 0); this.layers = [...this.layers.filter((l) => !l.visible), L]; this.activeId = L.id; }); }
  flatten() { this.command('Flatten image', () => { const m = this.composite(); const L = this.makeLayer({ name: 'Background' }); const g = ctxOf(L.canvas); g.fillStyle = '#ffffff'; g.fillRect(0, 0, this.w, this.h); g.drawImage(m, 0, 0); this.layers = [L]; this.activeId = L.id; }); }
  rasterize(L = this.active) { if (L.type === 'raster' || L.type === 'adjust') return; this.command('Rasterize layer', () => { const c = cloneCanvas(this.surface(L)); L.canvas = c; L.type = 'raster'; L.text = null; L.shape = null; delete L._cache; }); }
  /* ---------- masks ---------- */
  addMask(L = this.active, mode = 'reveal') {
    if (L.mask) return; this.command('Add layer mask', () => {
      const m = mk(this.w, this.h), g = ctxOf(m);
      if (mode === 'selection' && this.sel) g.drawImage(this.sel, 0, 0); else if (mode === 'hide') { /* empty = everything hidden */ } else { g.fillStyle = '#fff'; g.fillRect(0, 0, this.w, this.h); }
      L.mask = m; L.maskOn = true;
    });
    this.maskEdit = true;
  }
  deleteMask(L = this.active, apply = false) {
    if (!L.mask) return; this.command(apply ? 'Apply mask' : 'Delete mask', () => { if (apply && L.canvas) { const c = cloneCanvas(this.surface(L)); const g = c.getContext('2d'); g.globalCompositeOperation = 'destination-in'; g.drawImage(L.mask, 0, 0); L.canvas = c; if (L.type !== 'adjust') { L.type = 'raster'; L.text = null; L.shape = null; } } L.mask = null; });
    this.maskEdit = false;
  }
  invertMask(L = this.active) { if (!L.mask) return; this.command('Invert mask', () => { const n = mk(this.w, this.h), g = ctxOf(n); g.fillStyle = '#fff'; g.fillRect(0, 0, this.w, this.h); g.globalCompositeOperation = 'destination-out'; g.drawImage(L.mask, 0, 0); L.mask = n; }); }
  /* ---------- selection ---------- */
  setSelection(canvas, mode = 'new', label = 'Select') {
    let next = canvas;
    if (canvas && this.sel && mode !== 'new') {
      next = mk(this.w, this.h); const g = ctxOf(next);
      if (mode === 'add') { g.drawImage(this.sel, 0, 0); g.drawImage(canvas, 0, 0); }
      else if (mode === 'sub') { g.drawImage(this.sel, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(canvas, 0, 0); }
      else { g.drawImage(this.sel, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(canvas, 0, 0); }
    }
    if (next && this.isEmpty(next)) next = null;
    const prev = this.sel; this.sel = next; this.selVer++; this.push(label, () => { this.sel = prev; this.selVer++; }, () => { this.sel = next; this.selVer++; });
  }
  isEmpty(c) { const d = ctxOf(c).getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return false; return true; }
  selectAll() { const c = mk(this.w, this.h), g = ctxOf(c); g.fillStyle = '#fff'; g.fillRect(0, 0, this.w, this.h); this.setSelection(c, 'new', 'Select all'); }
  deselect() { if (this.sel) this.setSelection(null, 'new', 'Deselect'); }
  invertSelection() { const c = mk(this.w, this.h), g = ctxOf(c); g.fillStyle = '#fff'; g.fillRect(0, 0, this.w, this.h); if (this.sel) { g.globalCompositeOperation = 'destination-out'; g.drawImage(this.sel, 0, 0); } this.setSelection(c, 'new', 'Invert selection'); }
  featherSelection(r) { if (!this.sel) return; const c = mk(this.w, this.h), g = ctxOf(c); g.filter = `blur(${r}px)`; g.drawImage(this.sel, 0, 0); this.setSelection(c, 'new', 'Feather selection'); }
  growSelection(px) { // grow (px>0) or shrink (px<0) using blur+threshold
    if (!this.sel) return; const r = Math.abs(px); const img = ctxOf(this.sel).getImageData(0, 0, this.w, this.h); const d = img.data; const w = this.w, h = this.h; const src = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    const pass = (a, grow) => { const o = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = grow ? 0 : 1; const i = y * w + x; for (let k = -1; k <= 1 && (grow ? !v : v); k++) for (let j = -1; j <= 1; j++) { const xx = x + j, yy = y + k; const q = xx < 0 || yy < 0 || xx >= w || yy >= h ? (grow ? 0 : 1) : a[yy * w + xx]; if (grow ? q : !q) { v = grow ? 1 : 0; break; } } o[i] = v; } return o; };
    let cur = src; for (let k = 0; k < Math.min(r, 40); k++) cur = pass(cur, px > 0);
    const out = mk(w, h), og = ctxOf(out); const id = og.createImageData(w, h); for (let i = 0; i < w * h; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = cur[i] ? 255 : 0; } og.putImageData(id, 0, 0); this.setSelection(out, 'new', px > 0 ? 'Expand selection' : 'Contract selection');
  }
  selectionBounds(c = this.sel) {
    if (!c) return null; const w = c.width, h = c.height; const d = ctxOf(c).getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  /* run an op on the active layer's pixels through the selection: fn(srcCanvasClone) -> resultCanvas */
  editLayer(label, fn, L = this.active) {
    const which = (this.maskEdit || L.type === 'adjust') && L.mask ? 'mask' : 'canvas'; const tok = this.beginPx(L, which); const target = L[which];
    const res = fn(cloneCanvas(target)); if (!res) return;
    const g = ctxOf(target);
    if (this.sel) {
      const orig = tok.pre; const keep = cloneCanvas(orig), kg = keep.getContext('2d'); kg.globalCompositeOperation = 'destination-out'; kg.drawImage(this.sel, 0, 0);
      const part = cloneCanvas(res), pg = part.getContext('2d'); pg.globalCompositeOperation = 'destination-in'; pg.drawImage(this.sel, 0, 0);
      g.clearRect(0, 0, target.width, target.height); g.drawImage(keep, 0, 0); g.drawImage(part, 0, 0);
    } else { g.clearRect(0, 0, target.width, target.height); g.drawImage(res, 0, 0); }
    this.endPx(tok, label);
  }
  applyFilter(kind, params, L = this.active) {
    const f = FILTERS[kind]; if (!f) return; if (L.type !== 'raster') this.rasterize(L);
    this.editLayer(f.label, (src) => { const g = ctxOf(src); const img = g.getImageData(0, 0, src.width, src.height); const o = f.run({ data: img.data, width: src.width, height: src.height }, params); const out = mk(src.width, src.height); const og = ctxOf(out); og.putImageData(new ImageData(new Uint8ClampedArray(o.buffer ? o : o), src.width, src.height), 0, 0); return out; }, L);
  }
  bakeAdjustment(kind, params, L = this.active) {
    if (L.type !== 'raster') this.rasterize(L); const a = ADJUSTMENTS[kind];
    this.editLayer(a.label, (src) => { const g = ctxOf(src); const img = g.getImageData(0, 0, src.width, src.height); a.make(params)(img.data); g.putImageData(img, 0, 0); return src; }, L);
  }
  fillSelection(color, L = this.active) { if (L.type !== 'raster') this.rasterize(L); this.editLayer('Fill', (src) => { const g = ctxOf(src); g.fillStyle = color; g.fillRect(0, 0, src.width, src.height); return src; }, L); }
  clearSelection(L = this.active) { if (L.type !== 'raster') this.rasterize(L); this.editLayer('Clear', (src) => { const g = ctxOf(src); g.clearRect(0, 0, src.width, src.height); return src; }, L); }
  copySel(merged = false) {
    const L = this.active; const src = merged || L.type === 'adjust' ? this.composite() : cloneCanvas(this.surface(L)); const b = this.sel ? this.selectionBounds() : { x: 0, y: 0, w: this.w, h: this.h }; if (!b) return null;
    const c = mk(b.w, b.h), g = c.getContext('2d'); g.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    if (this.sel) { g.globalCompositeOperation = 'destination-in'; g.drawImage(this.sel, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); }
    return { canvas: c, x: b.x, y: b.y };
  }
  /* ---------- whole-image transforms ---------- */
  mapAll(label, w, h, draw) {
    this.command(label, () => {
      const nw = w, nh = h; for (const L of this.layers) { if (L.canvas) { const n = mk(nw, nh); draw(n.getContext('2d'), L.type === 'raster' ? L.canvas : this.surface(L), nw, nh); L.canvas = n; if (L.type !== 'raster' && L.type !== 'adjust') { L.type = 'raster'; L.text = null; L.shape = null; } } if (L.mask) { const n = mk(nw, nh); draw(n.getContext('2d'), L.mask, nw, nh); L.mask = n; } delete L._cache; }
      if (this.sel) { const n = mk(nw, nh); draw(n.getContext('2d'), this.sel, nw, nh); this.sel = n; this.selVer++; } this.w = nw; this.h = nh;
    });
  }
  resizeImage(w, h) { const ow = this.w, oh = this.h; this.mapAll('Image size', w, h, (g, src, nw, nh) => { g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, ow, oh, 0, 0, nw, nh); }); }
  resizeCanvas(w, h, ax = 0.5, ay = 0.5) { const ow = this.w, oh = this.h; const dx = Math.round((w - ow) * ax), dy = Math.round((h - oh) * ay); this.mapAll('Canvas size', w, h, (g, src) => { g.drawImage(src, dx, dy); }); }
  crop(r) { r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }; if (r.w < 1 || r.h < 1) return; this.mapAll('Crop', r.w, r.h, (g, src) => { g.drawImage(src, -r.x, -r.y); }); }
  rotate(deg) { const ow = this.w, oh = this.h; const sw = deg === 180 ? ow : oh, sh = deg === 180 ? oh : ow; this.mapAll(`Rotate ${deg}`, sw, sh, (g, src) => { g.translate(sw / 2, sh / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(src, -ow / 2, -oh / 2); }); }
  flip(horizontal) { const w = this.w, h = this.h; this.mapAll(horizontal ? 'Flip horizontal' : 'Flip vertical', w, h, (g, src) => { g.translate(horizontal ? w : 0, horizontal ? 0 : h); g.scale(horizontal ? -1 : 1, horizontal ? 1 : -1); g.drawImage(src, 0, 0); }); }
  /* ---------- statistics ---------- */
  histogram(canvas = this.composite()) { const d = ctxOf(canvas).getImageData(0, 0, canvas.width, canvas.height).data; const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256); const step = Math.max(1, Math.floor(d.length / 4 / 200000)) * 4; for (let i = 0; i < d.length; i += step) { if (d[i + 3] < 8) continue; r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++; l[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++; } return { r, g, b, l }; }
  /* ---------- save / load ---------- */
  async toJSON() {
    const png = (c) => c.toDataURL('image/png');
    return { kind: 'techomato-photo', v: 1, w: this.w, h: this.h, active: this.activeId, layers: this.layers.map((L) => ({ id: L.id, name: L.name, type: L.type, visible: L.visible, locked: L.locked, opacity: L.opacity, blend: L.blend, maskOn: L.maskOn, clip: L.clip, adj: L.adj, text: L.text, shape: L.shape, style: L.style, canvas: L.type === 'raster' ? png(L.canvas) : null, mask: L.mask ? png(L.mask) : null })) };
  }
  static async fromJSON(o) {
    const load = (u) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
    const d = new PDoc(o.w, o.h, 'transparent'); d.layers = [];
    for (const l of o.layers) {
      const L = d.makeLayer({ type: l.type }); Object.assign(L, { id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, blend: l.blend, maskOn: l.maskOn, clip: l.clip, adj: l.adj, text: l.text, shape: l.shape, style: l.style || defaultStyle() });
      if (l.type === 'adjust') L.canvas = null; else if (l.canvas) { const im = await load(l.canvas); ctxOf(L.canvas).drawImage(im, 0, 0); }
      if (l.mask) { const m = mk(o.w, o.h); ctxOf(m).drawImage(await load(l.mask), 0, 0); L.mask = m; }
      d.layers.push(L);
    }
    d.activeId = o.active && d.layers.find((l) => l.id === o.active) ? o.active : d.layers[d.layers.length - 1].id; d.dirty = false; return d;
  }
  static fromImage(img, name = 'Image') { const d = new PDoc(img.naturalWidth || img.width, img.naturalHeight || img.height, 'transparent'); ctxOf(d.layers[0].canvas).drawImage(img, 0, 0); d.layers[0].name = name; return d; }
}
export { hexRgb };
