/* Techomato Motion Studio – composition engine (pure canvas 2D, no dependencies) */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
let _n = 0;
export const uid = () => Math.random().toString(36).slice(2, 8) + (++_n).toString(36);

/* ---------- easing ---------- */
export const EASE_PRESETS = [['Linear', 'linear'], ['Easy ease', [0.333, 0, 0.667, 1]], ['Ease in', [0.42, 0, 1, 1]], ['Ease out', [0, 0, 0.58, 1]], ['Overshoot', [0.34, 1.56, 0.64, 1]], ['Anticipate', [0.36, -0.56, 0.64, 1]], ['Hold', 'hold']];
export function ease(u, e) {
  if (e === 'hold') return u >= 1 ? 1 : 0; if (!e || e === 'linear') return u;
  const [x1, y1, x2, y2] = e; let lo = 0, hi = 1, t = u;
  for (let i = 0; i < 22; i++) { t = (lo + hi) / 2; const s = 1 - t; const x = 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t; if (x < u) lo = t; else hi = t; }
  const s = 1 - t; return 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t;
}
export const easeName = (e) => { if (e === 'hold') return 'Hold'; if (!e || e === 'linear') return 'Linear'; const f = EASE_PRESETS.find(([, v]) => Array.isArray(v) && v.every((n, i) => Math.abs(n - e[i]) < 0.01)); return f ? f[0] : 'Custom'; };

/* ---------- animatable properties: {v, k:[{id,t,v,e}], ex} ---------- */
export const P0 = (v) => ({ v, k: [] });
export function baseVal(p, t) {
  const k = p.k; if (!k || !k.length) return p.v; if (t <= k[0].t) return k[0].v; const n = k.length; if (t >= k[n - 1].t) return k[n - 1].v;
  let i = 0; while (i < n - 2 && t >= k[i + 1].t) i++; const a = k[i], b = k[i + 1]; const u = (t - a.t) / (b.t - a.t || 1); return a.v + (b.v - a.v) * ease(u, a.e);
}
const noise = (x, seed) => { const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); }; const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h(i) * (1 - u) + h(i + 1) * u; };
const exprCache = new Map();
function compile(code) {
  if (exprCache.has(code)) return exprCache.get(code); let fn = null;
  try { const body = /\breturn\b/.test(code) ? code : `return (${code});`; fn = new Function('time', 'value', 'index', 'wiggle', 'loopOut', 'linear', 'smooth', 'rnd', 'sin', 'cos', 'abs', 'floor', 'round', 'min', 'max', 'sqrt', 'pow', 'PI', `"use strict";${body}`); } catch { fn = null; }
  exprCache.set(code, fn); return fn;
}
export function exprError(code) { try { new Function(/\breturn\b/.test(code) ? code : `return (${code});`); return null; } catch (e) { return e.message; } }
export function getProp(p, t, idx = 0) {
  const base = baseVal(p, t); if (!p.ex) return base; const fn = compile(p.ex); if (!fn) return base;
  const wiggle = (f, a) => base + (noise(t * f, idx + 1) * 2 - 1) * a + (noise(t * f * 2.7, idx + 9) * 2 - 1) * a * 0.3;
  const loopOut = (type = 'cycle') => { const k = p.k; if (!k || k.length < 2) return base; const t0 = k[0].t, t1 = k[k.length - 1].t, d = t1 - t0; if (t <= t1 || d <= 0) return base; if (type === 'pingpong') { const m = ((t - t0) / d) % 2; return baseVal(p, t0 + (m <= 1 ? m : 2 - m) * d); } return baseVal(p, t0 + ((t - t0) % d)); };
  const linear = (x, a, b, c, d) => { const u = clamp((x - a) / (b - a || 1), 0, 1); return c + (d - c) * u; };
  const smooth = (x, a, b, c, d) => { const u = clamp((x - a) / (b - a || 1), 0, 1); return c + (d - c) * u * u * (3 - 2 * u); };
  const rnd = (a = 0, b = 1) => a + noise(t * 13.7, idx + 3) * (b - a);
  try { const r = fn(t, base, idx, wiggle, loopOut, linear, smooth, rnd, Math.sin, Math.cos, Math.abs, Math.floor, Math.round, Math.min, Math.max, Math.sqrt, Math.pow, Math.PI); return Number.isFinite(r) ? r : base; } catch { return base; }
}
export const hasKeys = (p) => p.k && p.k.length > 0;
export function setPropAt(p, t, v, fps = 30) { // value edit honouring keyframes (auto-key when animated)
  if (!hasKeys(p)) return { ...p, v }; const eps = 0.5 / fps; const k = p.k.map((x) => ({ ...x })); const i = k.findIndex((x) => Math.abs(x.t - t) < eps);
  if (i >= 0) k[i].v = v; else { k.push({ id: uid(), t, v, e: 'linear' }); k.sort((a, b) => a.t - b.t); } return { ...p, k };
}
export function toggleKey(p, t, cur, fps = 30) {
  const eps = 0.5 / fps; const i = (p.k || []).findIndex((x) => Math.abs(x.t - t) < eps); const k = [...(p.k || [])];
  if (i >= 0) { k.splice(i, 1); return { ...p, k, v: k.length ? p.v : cur }; } k.push({ id: uid(), t, v: cur, e: 'linear' }); k.sort((a, b) => a.t - b.t); return { ...p, k };
}

/* ---------- layers ---------- */
export const BLENDS = [['normal', 'Normal', 'source-over'], ['add', 'Add', 'lighter'], ['multiply', 'Multiply', 'multiply'], ['screen', 'Screen', 'screen'], ['overlay', 'Overlay', 'overlay'], ['softlight', 'Soft light', 'soft-light'], ['hardlight', 'Hard light', 'hard-light'], ['lighten', 'Lighten', 'lighten'], ['darken', 'Darken', 'darken'], ['dodge', 'Colour dodge', 'color-dodge'], ['difference', 'Difference', 'difference'], ['exclusion', 'Exclusion', 'exclusion']];
export const FONTS = [['Inter', 'Inter, Arial, sans-serif'], ['Georgia', 'Georgia, serif'], ['Courier', '"Courier New", monospace'], ['Impact', 'Impact, sans-serif'], ['Trebuchet', '"Trebuchet MS", sans-serif'], ['Verdana', 'Verdana, sans-serif'], ['Comic', '"Comic Sans MS", cursive']];
export const EFFECTS = {
  blur: { label: 'Gaussian blur', params: [['radius', 'Blur', 0, 120, 12, 'px']] },
  glow: { label: 'Glow', params: [['radius', 'Radius', 0, 120, 24, 'px'], ['intensity', 'Intensity', 0, 300, 100, '%']] },
  shadow: { label: 'Drop shadow', color: '#000000', params: [['dx', 'Offset X', -300, 300, 10, 'px'], ['dy', 'Offset Y', -300, 300, 14, 'px'], ['blur', 'Softness', 0, 120, 14, 'px'], ['op', 'Opacity', 0, 100, 60, '%']] },
  tint: { label: 'Tint', color: '#ff3b30', params: [['amount', 'Amount', 0, 100, 60, '%']] },
  adjust: { label: 'Colour adjust', params: [['bright', 'Brightness', 0, 300, 100, '%'], ['contrast', 'Contrast', 0, 300, 100, '%'], ['sat', 'Saturation', 0, 400, 100, '%'], ['hue', 'Hue', -180, 180, 0, '°']] },
  pixelate: { label: 'Pixelate', params: [['size', 'Block size', 1, 120, 12, 'px']] },
  invert: { label: 'Invert', params: [['amount', 'Amount', 0, 100, 100, '%']] },
};
export const mkEffect = (type) => { const d = EFFECTS[type]; return { id: uid(), type, on: true, c: d.color, p: Object.fromEntries(d.params.map(([k, , , , def]) => [k, P0(def)])) }; };
const measureCv = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
export const fontStr = (T) => `${T.italic ? 'italic ' : ''}${T.bold ? '700 ' : '400 '}${T.size}px ${T.font}`;
export function measureText(T) { const g = measureCv; g.font = fontStr(T); const lines = T.str.split('\n'); const w = Math.max(10, ...lines.map((l) => g.measureText(l).width)) + 8; return { w: Math.ceil(w), h: Math.ceil(lines.length * T.size * 1.2 + 8), lines }; }
export function defaultShape(kind = 'rect') { return { kind, fill: '#ff5a36', stroke: '#ffffff', sw: 0, radius: 0, points: kind === 'star' ? 5 : 6, inner: 0.45, hasFill: true }; }
export function defaultText() { return { str: 'Your text', size: 96, font: FONTS[0][1], bold: true, italic: false, color: '#ffffff', align: 'center' }; }
export function mkLayer(type, comp, o = {}) {
  const base = { id: uid(), name: type[0].toUpperCase() + type.slice(1), type, w: 400, h: 300, color: '#3b82f6', shape: null, text: null, img: null, in: 0, out: comp.dur, parent: null, blend: 'normal', vis: true, solo: false, lock: false, fx: [], ...o };
  if (type === 'shape' && !base.shape) base.shape = defaultShape('rect'); if (type === 'text' && !base.text) { base.text = defaultText(); const m = measureText(base.text); base.w = m.w; base.h = m.h; }
  if (type === 'solid' && !o.w) { base.w = comp.w; base.h = comp.h; } if (type === 'null') { base.w = 100; base.h = 100; }
  base.p = { x: P0(comp.w / 2), y: P0(comp.h / 2), ax: P0(base.w / 2), ay: P0(base.h / 2), sx: P0(100), sy: P0(100), rot: P0(0), op: P0(100), reveal: P0(100), ...(o.p || {}) }; return base;
}
export const PROPS = [['x', 'Position X', -5000, 5000, 'px'], ['y', 'Position Y', -5000, 5000, 'px'], ['ax', 'Anchor X', -5000, 5000, 'px'], ['ay', 'Anchor Y', -5000, 5000, 'px'], ['sx', 'Scale X', -1000, 1000, '%'], ['sy', 'Scale Y', -1000, 1000, '%'], ['rot', 'Rotation', -3600, 3600, '°'], ['op', 'Opacity', 0, 100, '%']];
export const propsOf = (L) => (L.type === 'text' ? [...PROPS, ['reveal', 'Reveal', 0, 100, '%']] : PROPS);
export function compDefaults() { return { name: 'Comp 1', w: 1280, h: 720, fps: 30, dur: 6, bg: '#16171a', layers: [] }; }

/* ---------- transforms ---------- */
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const inv = (m) => { const d = m[0] * m[3] - m[1] * m[2] || 1e-9; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export function values(comp, L, t) { const i = comp.layers.indexOf(L); const o = {}; for (const k in L.p) o[k] = getProp(L.p[k], t, i); return o; }
function localM(v) { const r = (v.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); const sx = v.sx / 100, sy = v.sy / 100; return mul([1, 0, 0, 1, v.x, v.y], mul([c * sx, s * sx, -s * sy, c * sy, 0, 0], [1, 0, 0, 1, -v.ax, -v.ay])); }
export function worldM(comp, L, t, depth = 0) { const m = localM(values(comp, L, t)); if (L.parent && depth < 12) { const par = comp.layers.find((x) => x.id === L.parent); if (par && par !== L) return mul(worldM(comp, par, t, depth + 1), m); } return m; }
export const isActive = (L, t) => t >= L.in - 1e-6 && t < L.out - 1e-6;
export const quadOf = (comp, L, t) => { const m = worldM(comp, L, t); return [[0, 0], [L.w, 0], [L.w, L.h], [0, L.h]].map(([x, y]) => apply(m, x, y)); };
export function hitLayer(comp, t, x, y) { for (const L of comp.layers) { if (!L.vis || L.lock || !isActive(L, t)) continue; const [lx, ly] = apply(inv(worldM(comp, L, t)), x, y); if (lx >= 0 && ly >= 0 && lx <= L.w && ly <= L.h) return L; } return null; }
export function parentLinear(comp, L, t) { const par = L.parent && comp.layers.find((x) => x.id === L.parent); return par ? worldM(comp, par, t) : [1, 0, 0, 1, 0, 0]; }

/* ---------- drawing ---------- */
function shapePath(g, S, w, h) {
  g.beginPath();
  if (S.kind === 'ellipse') g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (S.kind === 'star' || S.kind === 'poly') { const n = Math.max(3, Math.round(S.points)); const star = S.kind === 'star'; const cnt = star ? n * 2 : n; for (let i = 0; i < cnt; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / cnt; const r = star && i % 2 ? S.inner : 1; const x = w / 2 + Math.cos(a) * (w / 2) * r, y = h / 2 + Math.sin(a) * (h / 2) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }
  else { const r = Math.min(S.radius, w / 2, h / 2); if (r > 0) { g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath(); } else g.rect(0, 0, w, h); }
}
function drawContent(g, L, v, imgs, sc) {
  if (L.type === 'solid') { g.fillStyle = L.color; g.fillRect(0, 0, L.w, L.h); }
  else if (L.type === 'shape') { const S = L.shape; shapePath(g, S, L.w, L.h); if (S.hasFill) { g.fillStyle = S.fill; g.fill(); } if (S.sw > 0) { g.lineWidth = S.sw; g.strokeStyle = S.stroke; g.lineJoin = 'round'; g.stroke(); } }
  else if (L.type === 'text') { const T = L.text; const lines = T.str.split('\n'); const total = lines.join('').length; let left = Math.round((total * clamp(v.reveal, 0, 100)) / 100); g.font = fontStr(T); g.fillStyle = T.color; g.textBaseline = 'middle'; g.textAlign = T.align; const x = T.align === 'left' ? 4 : T.align === 'right' ? L.w - 4 : L.w / 2;
    lines.forEach((ln, i) => { const n = Math.min(ln.length, left); left -= n; if (n > 0) g.fillText(ln.slice(0, n), x, 4 + T.size * 0.6 + i * T.size * 1.2); }); }
  else if (L.type === 'image') { const im = imgs.get(L.img); if (im && im.complete && im.naturalWidth) g.drawImage(im, 0, 0, L.w, L.h); else { g.fillStyle = '#444'; g.fillRect(0, 0, L.w, L.h); } }
  void sc;
}
const pools = new Map();
function slot(W, H, i) { const key = `${W}x${H}`; let a = pools.get(key); if (!a) { a = []; pools.set(key, a); if (pools.size > 4) pools.delete(pools.keys().next().value); } let c = a[i]; if (!c) { c = a[i] = document.createElement('canvas'); c.width = W; c.height = H; c._g = c.getContext('2d'); } const g = c._g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.imageSmoothingEnabled = true; g.clearRect(0, 0, W, H); return c; }
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function runFx(W, H, sc, L, t, idx) {
  let cur = 0;
  for (const fx of L.fx) {
    if (!fx.on) continue; const v = (k) => getProp(fx.p[k], t, idx); const nxt = cur === 1 ? 2 : 1; const o = slot(W, H, nxt); const og = o._g; const cv = slot_get(W, H, cur);
    if (fx.type === 'blur') { og.filter = `blur(${v('radius') * sc}px)`; og.drawImage(cv, 0, 0); }
    else if (fx.type === 'adjust') { og.filter = `brightness(${v('bright')}%) contrast(${v('contrast')}%) saturate(${v('sat')}%) hue-rotate(${v('hue')}deg)`; og.drawImage(cv, 0, 0); }
    else if (fx.type === 'invert') { og.filter = `invert(${v('amount')}%)`; og.drawImage(cv, 0, 0); }
    else if (fx.type === 'shadow') { og.filter = `drop-shadow(${v('dx') * sc}px ${v('dy') * sc}px ${v('blur') * sc}px ${rgba(fx.c || '#000000', v('op') / 100)})`; og.drawImage(cv, 0, 0); }
    else if (fx.type === 'tint') { og.drawImage(cv, 0, 0); og.globalCompositeOperation = 'source-atop'; og.globalAlpha = v('amount') / 100; og.fillStyle = fx.c; og.fillRect(0, 0, W, H); }
    else if (fx.type === 'glow') { og.drawImage(cv, 0, 0); og.globalCompositeOperation = 'lighter'; og.globalAlpha = clamp(v('intensity') / 100, 0, 1); og.filter = `blur(${v('radius') * sc}px) brightness(1.5)`; og.drawImage(cv, 0, 0); if (v('intensity') > 100) { og.globalAlpha = clamp(v('intensity') / 100 - 1, 0, 1); og.drawImage(cv, 0, 0); } }
    else if (fx.type === 'pixelate') { const s = Math.max(1, v('size') * sc); const sw = Math.max(1, Math.ceil(W / s)), sh = Math.max(1, Math.ceil(H / s)); const sm = slot(sw, sh, 9); sm._g.drawImage(cv, 0, 0, sw, sh); og.imageSmoothingEnabled = false; og.drawImage(sm, 0, 0, sw * s, sh * s); }
    cur = nxt;
  }
  return slot_get(W, H, cur);
}
const slot_get = (W, H, i) => pools.get(`${W}x${H}`)[i];

export function renderComp(g, W, H, comp, t, imgs, opts = {}) {
  const sc = W / comp.w; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  if (opts.transparent) g.clearRect(0, 0, W, H); else { g.fillStyle = comp.bg; g.fillRect(0, 0, W, H); }
  const anySolo = comp.layers.some((l) => l.solo);
  for (let i = comp.layers.length - 1; i >= 0; i--) {
    const L = comp.layers[i]; if (!L.vis || (anySolo && !L.solo) || !isActive(L, t) || L.type === 'null') continue;
    const v = values(comp, L, t); if (v.op <= 0) continue; const m = worldM(comp, L, t); const blend = (BLENDS.find((b) => b[0] === L.blend) || BLENDS[0])[2];
    const hasFx = L.fx.some((f) => f.on);
    if (!hasFx) { g.save(); g.setTransform(m[0] * sc, m[1] * sc, m[2] * sc, m[3] * sc, m[4] * sc, m[5] * sc); g.globalAlpha = clamp(v.op / 100, 0, 1); g.globalCompositeOperation = blend; drawContent(g, L, v, imgs, sc); g.restore(); }
    else { const base = slot(W, H, 0); const bg = base._g; bg.setTransform(m[0] * sc, m[1] * sc, m[2] * sc, m[3] * sc, m[4] * sc, m[5] * sc); drawContent(bg, L, v, imgs, sc); bg.setTransform(1, 0, 0, 1, 0, 0); const out = runFx(W, H, sc, L, t, i); g.save(); g.globalAlpha = clamp(v.op / 100, 0, 1); g.globalCompositeOperation = blend; g.drawImage(out, 0, 0); g.restore(); }
  }
}

/* ---------- presets ---------- */
const kf = (t, v, e = 'linear') => ({ id: uid(), t, v, e });
const EO = [0, 0, 0.58, 1], EASY = [0.333, 0, 0.667, 1], OVER = [0.34, 1.56, 0.64, 1];
export const PRESETS = [
  ['fadeIn', 'Fade in', 'Opacity 0→100 over 0.6 s'], ['fadeOut', 'Fade out', 'Fades to 0 at the end of the layer'], ['slideL', 'Slide in from left', 'Eases in from off-screen'], ['slideB', 'Slide up from bottom', 'Eases in from below'], ['pop', 'Pop in', 'Scale overshoot'], ['spin', 'Spin', 'One full rotation over the layer'], ['float', 'Float (expression)', 'Gentle sine bob'], ['pulse', 'Pulse (expression)', 'Scale breathes'], ['wiggle', 'Wiggle position', 'Random shake'], ['type', 'Typewriter', 'Reveals the text'], ['bounce', 'Bounce drop', 'Falls and bounces'], ['clear', 'Clear all animation', 'Removes keyframes and expressions'],
];
export function applyPreset(id, L, comp, t0) {
  const p = Object.fromEntries(Object.entries(L.p).map(([k, v]) => [k, { ...v, k: v.k.map((x) => ({ ...x })) }])); const d = 0.6; const a = Math.max(L.in, Math.min(t0, L.out - d)); const v = values(comp, L, a);
  const key = (prop, arr) => { const keep = p[prop].k.filter((x) => x.t < arr[0].t - 1e-4 || x.t > arr[arr.length - 1].t + 1e-4); p[prop] = { ...p[prop], k: [...keep, ...arr].sort((m, n) => m.t - n.t) }; };
  if (id === 'fadeIn') key('op', [kf(a, 0, EO), kf(a + d, 100)]);
  else if (id === 'fadeOut') key('op', [kf(L.out - d, v.op, EO), kf(L.out - 0.001, 0)]);
  else if (id === 'slideL') { const x1 = v.x; key('x', [kf(a, x1 - comp.w * 0.7, EO), kf(a + 0.8, x1)]); }
  else if (id === 'slideB') { const y1 = v.y; key('y', [kf(a, y1 + comp.h * 0.8, EO), kf(a + 0.8, y1)]); }
  else if (id === 'pop') { key('sx', [kf(a, 0, OVER), kf(a + 0.55, v.sx)]); key('sy', [kf(a, 0, OVER), kf(a + 0.55, v.sy)]); key('op', [kf(a, 0), kf(a + 0.12, v.op)]); }
  else if (id === 'spin') key('rot', [kf(L.in, 0, EASY), kf(L.out - 0.001, 360)]);
  else if (id === 'float') p.y = { ...p.y, ex: 'value + sin(time * 2.2) * 18' };
  else if (id === 'pulse') { p.sx = { ...p.sx, ex: 'value * (1 + sin(time * 5) * 0.06)' }; p.sy = { ...p.sy, ex: 'value * (1 + sin(time * 5) * 0.06)' }; }
  else if (id === 'wiggle') { p.x = { ...p.x, ex: 'wiggle(4, 14)' }; p.y = { ...p.y, ex: 'wiggle(4, 14)' }; }
  else if (id === 'type' && p.reveal) key('reveal', [kf(a, 0), kf(a + Math.min(2.5, Math.max(0.5, (L.text ? L.text.str.length : 10) * 0.07)), 100)]);
  else if (id === 'bounce') { const y1 = v.y; const H = comp.h * 0.5; p.y = { ...p.y, k: [kf(a, y1 - H, [0.5, 0, 1, 1]), kf(a + 0.5, y1, [0, 0, 0.5, 1]), kf(a + 0.8, y1 - H * 0.25, [0.5, 0, 1, 1]), kf(a + 1.05, y1, [0, 0, 0.5, 1]), kf(a + 1.25, y1 - H * 0.07, [0.5, 0, 1, 1]), kf(a + 1.4, y1)] }; }
  else if (id === 'clear') { for (const k in p) p[k] = { v: baseVal(p[k], a), k: [] }; }
  return p;
}

/* ---------- sample composition ---------- */
export function sampleComp() {
  const c = compDefaults(); c.name = 'Title animation'; c.bg = '#101114';
  const bg = mkLayer('solid', c, { name: 'Background', color: '#1d2b64' }); bg.fx = [];
  bg.p.op = { v: 100, k: [kf(0, 0), kf(0.8, 100)] };
  const ring = mkLayer('shape', c, { name: 'Ring', w: 420, h: 420, shape: { ...defaultShape('ellipse'), hasFill: false, stroke: '#ff7a59', sw: 10 } }); ring.p.sx = { v: 100, k: [kf(0.2, 0, OVER), kf(1.2, 100)] }; ring.p.sy = { v: 100, k: [kf(0.2, 0, OVER), kf(1.2, 100)] }; ring.p.rot = { v: 0, k: [kf(0, 0), kf(6, 180)] }; ring.fx = [{ ...mkEffect('glow') }];
  const star = mkLayer('shape', c, { name: 'Star', w: 150, h: 150, shape: { ...defaultShape('star'), fill: '#ffd23f' } }); star.p.x = { v: 640, k: [kf(0.6, 640 - 520, EO), kf(1.5, 640)] }; star.p.y = P0(250); star.p.rot = { v: 0, k: [kf(0.6, 0), kf(6, 720)] }; star.fx = [mkEffect('shadow')];
  const title = mkLayer('text', c, { name: 'Techomato Motion', text: { ...defaultText(), str: 'Techomato Motion', size: 110 } }); title.p.y = P0(360); title.p.sx = { v: 100, k: [kf(0.9, 0, OVER), kf(1.5, 100)] }; title.p.sy = { v: 100, k: [kf(0.9, 0, OVER), kf(1.5, 100)] }; title.p.op = { v: 100, k: [kf(0.9, 0), kf(1.1, 100)] };
  const sub = mkLayer('text', c, { name: 'Subtitle', text: { ...defaultText(), str: 'Keyframes · easing · effects · export', size: 38, bold: false, color: '#c7d2fe' } }); sub.p.y = P0(470); sub.p.reveal = { v: 100, k: [kf(1.6, 0), kf(3.2, 100)] };
  const m = mkLayer('shape', c, { name: 'Bar', w: 360, h: 6, shape: { ...defaultShape('rect'), fill: '#ff7a59' } }); m.p.y = P0(540); m.p.sx = { v: 100, k: [kf(1.4, 0, EO), kf(2.2, 100)] };
  c.layers = [sub, title, star, ring, m, bg]; return c;
}

/* ---------- store-only ZIP (PNG sequence) ---------- */
let crcT = null;
const crc32 = (u8) => { if (!crcT) { crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } } let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files) {
  const enc = new TextEncoder(); const parts = []; const cen = []; let off = 0;
  for (const f of files) { const name = enc.encode(f.name); const crc = crc32(f.data); const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true); parts.push(lh.buffer, name, f.data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true); cen.push(ch.buffer, name); off += 30 + name.length + f.data.length; }
  const csize = cen.reduce((s, b) => s + (b.byteLength || b.length), 0); const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, end.buffer], { type: 'application/zip' });
}
export const fmtTC = (s, fps) => { s = Math.max(0, s); const m = Math.floor(s / 60), sec = Math.floor(s % 60), f = Math.floor(Math.round((s % 1) * fps * 1000) / 1000); return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(f % fps).padStart(2, '0')}`; };
