import { mk, ctxOf, cloneCanvas } from './doc.js';
import { hexRgb } from './adjust.js';
import { gaussian } from './filters.js';

/* ---------- brush tips ---------- */
const tipCache = new Map();
export function makeTip(size, hardness, color) {
  const s = Math.max(1, Math.round(size)); const key = `${s}|${Math.round(hardness)}|${color}`;
  if (tipCache.has(key)) return tipCache.get(key);
  const pad = 1, n = s + pad * 2, c = mk(n, n), g = c.getContext('2d'); const [r, gg, b] = hexRgb(color); const rad = s / 2, h = hardness / 100;
  if (s <= 2) { g.fillStyle = color; g.beginPath(); g.arc(n / 2, n / 2, Math.max(0.5, rad), 0, 7); g.fill(); }
  else { const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, rad); const k = Math.min(0.98, h); gr.addColorStop(0, `rgba(${r},${gg},${b},1)`); gr.addColorStop(k, `rgba(${r},${gg},${b},1)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); g.fillStyle = gr; g.fillRect(0, 0, n, n); }
  if (tipCache.size > 80) tipCache.clear(); tipCache.set(key, c); return c;
}
/* stamp along a segment, returns leftover distance */
export function strokeSeg(g, tip, a, b, spacing, carry, alpha = 1, op = 'source-over', pressure) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); let d = carry; const step = Math.max(1, spacing);
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = op; const half = tip.width / 2;
  while (d <= len) { const t = len ? d / len : 0; const x = a.x + dx * t, y = a.y + dy * t; if (pressure) { const p = pressure(t); const sz = tip.width * p; g.drawImage(tip, x - sz / 2, y - sz / 2, sz, sz); } else g.drawImage(tip, x - half, y - half); d += step; }
  g.restore(); return d - len;
}

/* ---------- selection builders ---------- */
export function rectSel(w, h, x, y, rw, rh, ellipse = false, feather = 0) {
  const c = mk(w, h), g = c.getContext('2d'); g.fillStyle = '#fff'; if (feather) g.filter = `blur(${feather}px)`; g.beginPath();
  if (ellipse) g.ellipse(x + rw / 2, y + rh / 2, Math.abs(rw / 2), Math.abs(rh / 2), 0, 0, Math.PI * 2); else g.rect(x, y, rw, rh); g.fill(); return c;
}
export function polySel(w, h, pts, feather = 0) { const c = mk(w, h), g = c.getContext('2d'); g.fillStyle = '#fff'; if (feather) g.filter = `blur(${feather}px)`; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); return c; }
export function magicWand(src, x, y, tol, contiguous = true) {
  const w = src.width, h = src.height; x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const d = ctxOf(src).getImageData(0, 0, w, h).data; const i0 = (y * w + x) * 4; const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3]; const T = tol * tol * 4 * 1.0;
  const match = (i) => { const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0, da = d[i + 3] - a0; return dr * dr + dg * dg + db * db + da * da <= T * 1.5 + 0.5; };
  const out = new Uint8Array(w * h);
  if (!contiguous) { for (let p = 0; p < w * h; p++) if (match(p * 4)) out[p] = 1; }
  else { const stack = [y * w + x]; out[y * w + x] = 1; while (stack.length) { const p = stack.pop(); const px = p % w, py = (p / w) | 0; if (px > 0 && !out[p - 1] && match((p - 1) * 4)) { out[p - 1] = 1; stack.push(p - 1); } if (px < w - 1 && !out[p + 1] && match((p + 1) * 4)) { out[p + 1] = 1; stack.push(p + 1); } if (py > 0 && !out[p - w] && match((p - w) * 4)) { out[p - w] = 1; stack.push(p - w); } if (py < h - 1 && !out[p + w] && match((p + w) * 4)) { out[p + w] = 1; stack.push(p + w); } } }
  const c = mk(w, h), g = ctxOf(c), id = g.createImageData(w, h); for (let p = 0; p < w * h; p++) if (out[p]) { id.data[p * 4] = id.data[p * 4 + 1] = id.data[p * 4 + 2] = 255; id.data[p * 4 + 3] = 255; } g.putImageData(id, 0, 0); return c;
}
export function colorRange(src, rgb, fuzz) { const w = src.width, h = src.height, d = ctxOf(src).getImageData(0, 0, w, h).data; const c = mk(w, h), g = ctxOf(c), id = g.createImageData(w, h); for (let p = 0; p < w * h; p++) { const i = p * 4; const dist = Math.hypot(d[i] - rgb[0], d[i + 1] - rgb[1], d[i + 2] - rgb[2]); const m = dist <= fuzz ? 1 : dist <= fuzz * 1.4 ? 1 - (dist - fuzz) / (fuzz * 0.4) : 0; if (m > 0 && d[i + 3] > 0) { id.data[i] = id.data[i + 1] = id.data[i + 2] = 255; id.data[i + 3] = Math.round(255 * m); } } g.putImageData(id, 0, 0); return c; }

/* marching-ants edge layer: white edge pixels of a selection (alpha > 127) at selection resolution */
export function edgeCanvas(sel) {
  const w = sel.width, h = sel.height; const d = ctxOf(sel).getImageData(0, 0, w, h).data; const c = mk(w, h), g = ctxOf(c), id = g.createImageData(w, h); const on = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3] > 127 ? 1 : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (on(x, y) && !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1))) { const i = (y * w + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = 255; id.data[i + 3] = 255; } } g.putImageData(id, 0, 0); return c;
}

/* ---------- gradient ---------- */
export function gradientFill(w, h, a, b, kind, c1, c2, { transparent = false, reverse = false } = {}) {
  const c = mk(w, h), g = ctxOf(c), id = g.createImageData(w, h), d = id.data; const [r1, g1, b1] = hexRgb(reverse ? c2 : c1), [r2, g2, b2] = hexRgb(reverse ? c1 : c2);
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let t; const px = x - a.x, py = y - a.y;
    if (kind === 'radial') t = Math.hypot(px, py) / L; else if (kind === 'angle') { t = (Math.atan2(py, px) - Math.atan2(dy, dx)) / (Math.PI * 2); t = ((t % 1) + 1) % 1; }
    else if (kind === 'reflected') t = Math.abs((px * dx + py * dy) / L2); else if (kind === 'diamond') t = (Math.abs(px * dx + py * dy) + Math.abs(px * -dy + py * dx)) / L2; else t = (px * dx + py * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t; const i = (y * w + x) * 4;
    d[i] = r1 + (r2 - r1) * t; d[i + 1] = g1 + (g2 - g1) * t; d[i + 2] = b1 + (b2 - b1) * t; d[i + 3] = transparent ? Math.round(255 * (reverse ? t : 1 - t)) : 255;
  }
  g.putImageData(id, 0, 0); return c;
}

/* ---------- retouch helpers ---------- */
export function blurredCopy(src, radius) { const g = ctxOf(src); const img = g.getImageData(0, 0, src.width, src.height); const o = gaussian(img, radius); const c = mk(src.width, src.height); ctxOf(c).putImageData(new ImageData(o, src.width, src.height), 0, 0); return c; }
export function sharpenedCopy(src, amount = 1.2, radius = 1.2) { const g = ctxOf(src); const img = g.getImageData(0, 0, src.width, src.height); const bl = gaussian(img, radius); const o = new Uint8ClampedArray(img.data.length); for (let i = 0; i < o.length; i += 4) { for (let k = 0; k < 3; k++) o[i + k] = img.data[i + k] + (img.data[i + k] - bl[i + k]) * amount; o[i + 3] = img.data[i + 3]; } const c = mk(src.width, src.height); ctxOf(c).putImageData(new ImageData(o, src.width, src.height), 0, 0); return c; }
export function toneCopy(src, amt) { const g = ctxOf(src); const img = g.getImageData(0, 0, src.width, src.height); const d = img.data; const k = Math.pow(2, amt); for (let i = 0; i < d.length; i += 4) { d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } const c = mk(src.width, src.height); ctxOf(c).putImageData(img, 0, 0); return c; }
/* paint `source` through brush tip `tip` at (x,y) onto g with strength alpha */
export function paintFrom(g, source, tip, x, y, alpha, ox = 0, oy = 0) {
  const n = tip.width, t = mk(n, n), tg = t.getContext('2d'); tg.drawImage(source, x - n / 2 + ox, y - n / 2 + oy, n, n, 0, 0, n, n); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(tip, 0, 0);
  g.save(); g.globalAlpha = alpha; g.drawImage(t, x - n / 2, y - n / 2); g.restore();
}
export function pickColor(c, x, y) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null; const d = ctxOf(c).getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); }

/* ---------- transform of a floating canvas about its centre ---------- */
export function drawTransformed(g, img, T) { g.save(); g.translate(T.cx, T.cy); g.rotate(T.rot); g.scale(T.sx, T.sy); g.imageSmoothingQuality = 'high'; g.drawImage(img, -T.w / 2, -T.h / 2, T.w, T.h); g.restore(); }
export function transformCorners(T) { const c = Math.cos(T.rot), s = Math.sin(T.rot); const hw = (T.w * T.sx) / 2, hh = (T.h * T.sy) / 2; return [[-hw, -hh], [0, -hh], [hw, -hh], [hw, 0], [hw, hh], [0, hh], [-hw, hh], [-hw, 0]].map(([x, y]) => ({ x: T.cx + x * c - y * s, y: T.cy + x * s + y * c })); }

/* ---------- misc ---------- */
export function canvasToBlob(c, type, q) { return new Promise((res) => c.toBlob(res, type, q)); }
export function fitScale(vw, vh, w, h, pad = 40) { return Math.min((vw - pad) / w, (vh - pad) / h, 1) || 1; }
export { cloneCanvas };
