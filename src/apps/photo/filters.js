/* Pixel filters for Techomato Photo Studio. Each works on { data: RGBA Uint8ClampedArray, width, height } and returns new RGBA data. */
const S = (key, label, min, max, step = 1, def = 0) => ({ key, label, min, max, step, def });
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function toPremul(d) { const f = new Float32Array(d.length); for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; f[i] = d[i] * a; f[i + 1] = d[i + 1] * a; f[i + 2] = d[i + 2] * a; f[i + 3] = d[i + 3]; } return f; }
export function fromPremul(f) { const o = new Uint8ClampedArray(f.length); for (let i = 0; i < f.length; i += 4) { const a = f[i + 3]; if (a > 0.5) { const k = 255 / a; o[i] = f[i] * k; o[i + 1] = f[i + 1] * k; o[i + 2] = f[i + 2] * k; } o[i + 3] = a; } return o; }

function boxH(src, dst, w, h, r) {
  const n = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0; for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k)) * 4 + c];
      for (let x = 0; x < w; x++) { dst[row + x * 4 + c] = sum / n; sum += src[row + Math.min(w - 1, x + r + 1) * 4 + c] - src[row + Math.max(0, x - r) * 4 + c]; }
    }
  }
}
function boxV(src, dst, w, h, r) {
  const n = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0; for (let k = -r; k <= r; k++) sum += src[Math.min(h - 1, Math.max(0, k)) * w * 4 + x * 4 + c];
      for (let y = 0; y < h; y++) { dst[y * w * 4 + x * 4 + c] = sum / n; sum += src[Math.min(h - 1, y + r + 1) * w * 4 + x * 4 + c] - src[Math.max(0, y - r) * w * 4 + x * 4 + c]; }
    }
  }
}
export function blurPremul(f, w, h, radius) {
  if (radius < 0.5) return f;
  const sigma = Math.max(0.5, radius / 2); const wi = Math.sqrt((12 * sigma * sigma) / 3 + 1); let wl = Math.floor(wi); if (wl % 2 === 0) wl--; const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4)); const sizes = [0, 1, 2].map((i) => (i < m ? wl : wu));
  let a = f, b = new Float32Array(f.length);
  for (const s of sizes) { const r = Math.max(1, (s - 1) / 2); boxH(a, b, w, h, r); boxV(b, a === f ? (a = new Float32Array(f.length)) : a, w, h, r); }
  return a;
}
export const gaussian = (img, radius) => fromPremul(blurPremul(toPremul(img.data), img.width, img.height, radius));

function sample(d, w, h, x, y, out) { // bilinear, clamp
  x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(h - 1.001, y)); const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0; const i = (y0 * w + x0) * 4;
  for (let c = 0; c < 4; c++) out[c] = d[i + c] * (1 - fx) * (1 - fy) + d[i + 4 + c] * fx * (1 - fy) + d[i + w * 4 + c] * (1 - fx) * fy + d[i + w * 4 + 4 + c] * fx * fy;
}
function warp(img, fn) {
  const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data.length); const t = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = fn(x, y); if (!r) { const i = (y * w + x) * 4; o[i] = data[i]; o[i + 1] = data[i + 1]; o[i + 2] = data[i + 2]; o[i + 3] = data[i + 3]; continue; } sample(data, w, h, r[0], r[1], t); const i = (y * w + x) * 4; o[i] = t[0]; o[i + 1] = t[1]; o[i + 2] = t[2]; o[i + 3] = t[3]; }
  return o;
}
function convolve(img, k, div = 1, bias = 0) {
  const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)), yy = Math.min(h - 1, Math.max(0, y + j)); const p = (yy * w + xx) * 4, kk = k[(j + 1) * 3 + i + 1]; r += data[p] * kk; g += data[p + 1] * kk; b += data[p + 2] * kk; }
    const q = (y * w + x) * 4; o[q] = r / div + bias; o[q + 1] = g / div + bias; o[q + 2] = b / div + bias; o[q + 3] = data[q + 3];
  }
  return o;
}
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; const h = (a, b) => { let n = (a * 374761393 + b * 668265263 + s * 1274126177) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v; }

export const FILTERS = {
  gaussian: { label: 'Gaussian Blur', group: 'Blur', controls: [S('radius', 'Radius', 0.5, 100, 0.5, 5)], run: (img, p) => gaussian(img, p.radius) },
  motion: {
    label: 'Motion Blur', group: 'Blur', controls: [S('angle', 'Angle', -90, 90, 1, 0), S('distance', 'Distance', 1, 200, 1, 20)],
    run: (img, p) => {
      const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data.length); const a = (p.angle * Math.PI) / 180, dx = Math.cos(a), dy = -Math.sin(a); const n = Math.max(2, Math.min(60, Math.round(p.distance))); const t = [0, 0, 0, 0];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0, al = 0; for (let k = 0; k < n; k++) { const s = (k / (n - 1) - 0.5) * p.distance; sample(data, w, h, x + dx * s, y + dy * s, t); const aa = t[3] / 255; r += t[0] * aa; g += t[1] * aa; b += t[2] * aa; al += t[3]; } const i = (y * w + x) * 4; al /= n; if (al > 0.5) { const k = 255 / al; o[i] = r / n * k * 1; o[i + 1] = g / n * k; o[i + 2] = b / n * k; } o[i + 3] = al; }
      return o;
    },
  },
  zoomBlur: {
    label: 'Radial (Zoom) Blur', group: 'Blur', controls: [S('amount', 'Amount', 1, 100, 1, 20), S('cx', 'Centre X %', 0, 100, 1, 50), S('cy', 'Centre Y %', 0, 100, 1, 50)],
    run: (img, p) => {
      const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data.length); const cx = (p.cx / 100) * w, cy = (p.cy / 100) * h; const n = 14; const t = [0, 0, 0, 0];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0, al = 0; for (let k = 0; k < n; k++) { const s = 1 - (k / n) * (p.amount / 100) * 0.5; sample(data, w, h, cx + (x - cx) * s, cy + (y - cy) * s, t); r += t[0]; g += t[1]; b += t[2]; al += t[3]; } const i = (y * w + x) * 4; o[i] = r / n; o[i + 1] = g / n; o[i + 2] = b / n; o[i + 3] = al / n; }
      return o;
    },
  },
  sharpen: { label: 'Sharpen', group: 'Sharpen', controls: [], run: (img) => convolve(img, [0, -1, 0, -1, 5, -1, 0, -1, 0]) },
  unsharp: {
    label: 'Unsharp Mask', group: 'Sharpen', controls: [S('amount', 'Amount %', 1, 500, 1, 100), S('radius', 'Radius', 0.5, 50, 0.5, 2), S('threshold', 'Threshold', 0, 255, 1, 0)],
    run: (img, p) => { const b = gaussian(img, p.radius), d = img.data, o = new Uint8ClampedArray(d.length), k = p.amount / 100; for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) { const df = d[i + c] - b[i + c]; o[i + c] = Math.abs(df) >= p.threshold ? d[i + c] + df * k : d[i + c]; } o[i + 3] = d[i + 3]; } return o; },
  },
  noise: {
    label: 'Add Noise', group: 'Noise', controls: [S('amount', 'Amount %', 0.1, 100, 0.1, 12)], flags: [['mono', 'Monochromatic', true], ['gaussian', 'Gaussian', true]],
    run: (img, p) => { seed = 7; const d = img.data, o = new Uint8ClampedArray(d), k = p.amount * 2.55 * (p.gaussian ? 0.45 : 1); for (let i = 0; i < d.length; i += 4) { const nr = p.gaussian ? gauss() : rnd() * 2 - 1; const ng = p.mono ? nr : (p.gaussian ? gauss() : rnd() * 2 - 1), nb = p.mono ? nr : (p.gaussian ? gauss() : rnd() * 2 - 1); o[i] = d[i] + nr * k; o[i + 1] = d[i + 1] + ng * k; o[i + 2] = d[i + 2] + nb * k; } return o; },
  },
  median: {
    label: 'Median (reduce noise)', group: 'Noise', controls: [S('radius', 'Radius', 1, 2, 1, 1)],
    run: (img, p) => {
      const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data.length); const r = p.radius; const buf = [[], [], []];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { buf[0].length = buf[1].length = buf[2].length = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const q = (Math.min(h - 1, Math.max(0, y + j)) * w + Math.min(w - 1, Math.max(0, x + i))) * 4; buf[0].push(data[q]); buf[1].push(data[q + 1]); buf[2].push(data[q + 2]); } const m = buf[0].length >> 1; const i = (y * w + x) * 4; o[i] = buf[0].sort((a, b) => a - b)[m]; o[i + 1] = buf[1].sort((a, b) => a - b)[m]; o[i + 2] = buf[2].sort((a, b) => a - b)[m]; o[i + 3] = data[i + 3]; }
      return o;
    },
  },
  pixelate: {
    label: 'Pixelate (Mosaic)', group: 'Stylize', controls: [S('size', 'Cell size', 2, 100, 1, 10)],
    run: (img, p) => { const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data.length), s = p.size; for (let by = 0; by < h; by += s) for (let bx = 0; bx < w; bx += s) { let r = 0, g = 0, b = 0, a = 0, n = 0; const ex = Math.min(w, bx + s), ey = Math.min(h, by + s); for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++; } for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * w + x) * 4; o[i] = r / n; o[i + 1] = g / n; o[i + 2] = b / n; o[i + 3] = a / n; } } return o; },
  },
  emboss: { label: 'Emboss', group: 'Stylize', controls: [S('strength', 'Strength', 1, 5, 0.5, 1)], run: (img, p) => convolve(img, [-2 * p.strength, -p.strength, 0, -p.strength, 1, p.strength, 0, p.strength, 2 * p.strength], 1, 0) },
  edges: {
    label: 'Find Edges', group: 'Stylize', controls: [],
    run: (img) => { const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data.length); const g = (x, y, c) => data[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4 + c]; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) { const gx = -g(x - 1, y - 1, c) - 2 * g(x - 1, y, c) - g(x - 1, y + 1, c) + g(x + 1, y - 1, c) + 2 * g(x + 1, y, c) + g(x + 1, y + 1, c); const gy = -g(x - 1, y - 1, c) - 2 * g(x, y - 1, c) - g(x + 1, y - 1, c) + g(x - 1, y + 1, c) + 2 * g(x, y + 1, c) + g(x + 1, y + 1, c); o[i + c] = 255 - Math.sqrt(gx * gx + gy * gy); } o[i + 3] = data[i + 3]; } return o; },
  },
  oil: {
    label: 'Oil Paint', group: 'Stylize', controls: [S('radius', 'Brush size', 1, 6, 1, 3), S('levels', 'Detail', 4, 40, 1, 20)],
    run: (img, p) => {
      const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data.length); const R = p.radius, L = p.levels; const cnt = new Int32Array(L), sr = new Int32Array(L), sg = new Int32Array(L), sb = new Int32Array(L);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { cnt.fill(0); sr.fill(0); sg.fill(0); sb.fill(0); for (let j = -R; j <= R; j++) { const yy = Math.min(h - 1, Math.max(0, y + j)); for (let i = -R; i <= R; i++) { const q = (yy * w + Math.min(w - 1, Math.max(0, x + i))) * 4; const lv = Math.min(L - 1, ((data[q] + data[q + 1] + data[q + 2]) / 3 * L / 256) | 0); cnt[lv]++; sr[lv] += data[q]; sg[lv] += data[q + 1]; sb[lv] += data[q + 2]; } } let best = 0; for (let k = 1; k < L; k++) if (cnt[k] > cnt[best]) best = k; const i = (y * w + x) * 4; o[i] = sr[best] / cnt[best]; o[i + 1] = sg[best] / cnt[best]; o[i + 2] = sb[best] / cnt[best]; o[i + 3] = data[i + 3]; }
      return o;
    },
  },
  spherize: {
    label: 'Spherize', group: 'Distort', controls: [S('amount', 'Amount %', -100, 100, 1, 60)],
    run: (img, p) => { const { width: w, height: h } = img; const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2; const k = p.amount / 100; return warp(img, (x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d >= R || d === 0) return null; const t = d / R; const s = k >= 0 ? Math.pow(t, 1 + k) / t : Math.pow(t, 1 / (1 - k)) / t; return [cx + dx * s, cy + dy * s]; }); },
  },
  twirl: {
    label: 'Twirl', group: 'Distort', controls: [S('angle', 'Angle', -720, 720, 1, 120)],
    run: (img, p) => { const { width: w, height: h } = img; const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2; const A = (p.angle * Math.PI) / 180; return warp(img, (x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d >= R) return null; const a = A * (1 - d / R) * (1 - d / R) * -1 + Math.atan2(dy, dx); return [cx + Math.cos(a) * d, cy + Math.sin(a) * d]; }); },
  },
  ripple: {
    label: 'Ripple', group: 'Distort', controls: [S('amount', 'Amount', 1, 60, 1, 10), S('size', 'Wavelength', 5, 200, 1, 40)],
    run: (img, p) => warp(img, (x, y) => [x + Math.sin((y / p.size) * Math.PI * 2) * p.amount, y + Math.sin((x / p.size) * Math.PI * 2) * p.amount * 0.6]),
  },
  vignette: {
    label: 'Vignette', group: 'Render', controls: [S('amount', 'Amount %', 0, 100, 1, 50), S('size', 'Size %', 10, 150, 1, 70), S('feather', 'Feather %', 1, 100, 1, 60)],
    run: (img, p) => { const { data, width: w, height: h } = img; const o = new Uint8ClampedArray(data); const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy) * (p.size / 100); const f = Math.max(0.01, p.feather / 100); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - cx, y - cy) / R; let t = (d - (1 - f)) / f; t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t); const m = 1 - (p.amount / 100) * t; const i = (y * w + x) * 4; o[i] *= m; o[i + 1] *= m; o[i + 2] *= m; } return o; },
  },
  clouds: {
    label: 'Clouds', group: 'Render', controls: [S('scale', 'Scale', 10, 400, 1, 120), S('seed', 'Seed', 1, 999, 1, 7)], render: true,
    run: (img, p) => { const { width: w, height: h } = img; const o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0, a = 0.5, f = 1 / p.scale; for (let k = 0; k < 6; k++) { v += a * vnoise(x * f, y * f, p.seed + k); f *= 2; a *= 0.5; } const g = Math.max(0, Math.min(255, (v - 0.2) * 1.6 * 255)); const i = (y * w + x) * 4; o[i] = o[i + 1] = o[i + 2] = g; o[i + 3] = 255; } return o; },
  },
  tiltShift: {
    label: 'Tilt-Shift Blur', group: 'Blur', controls: [S('blur', 'Blur', 1, 60, 1, 14), S('focus', 'Focus position %', 0, 100, 1, 50), S('band', 'Focus band %', 2, 80, 1, 24)],
    run: (img, p) => { const b = gaussian(img, p.blur), d = img.data, o = new Uint8ClampedArray(d.length); const { width: w, height: h } = img; for (let y = 0; y < h; y++) { const dist = Math.abs(y / h * 100 - p.focus); const t = Math.max(0, Math.min(1, (dist - p.band / 2) / Math.max(1, p.band))); for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; for (let c = 0; c < 4; c++) o[i + c] = d[i + c] * (1 - t) + b[i + c] * t; } } return o; },
  },
};
export const FILTER_GROUPS = ['Blur', 'Sharpen', 'Noise', 'Stylize', 'Distort', 'Render'];
export function filterDefaults(kind) { const f = FILTERS[kind], p = {}; for (const c of f.controls) p[c.key] = c.def; for (const [k, , d] of f.flags || []) p[k] = d; return p; }
export { clamp8 };
