/* Non-destructive adjustment definitions for Techomato Photo Studio.
   Each adjustment: { label, defaults, controls, make(params) -> (data:Uint8ClampedArray) => void } working in place on RGBA. */
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lutApply = (d, lr, lg, lb) => { for (let i = 0; i < d.length; i += 4) { d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]]; } };
const mkLut = (f) => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = f(i); return l; };
export const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [0, 0, 0]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

export function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
const h2c = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
export function hsl2rgb(h, s, l) { if (s === 0) { const v = l * 255; return [v, v, v]; } const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [h2c(p, q, h + 1 / 3) * 255, h2c(p, q, h) * 255, h2c(p, q, h - 1 / 3) * 255]; }

/* monotone cubic interpolation through control points -> 256-entry LUT */
export function curveLut(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0]); const n = p.length; const out = new Uint8ClampedArray(256);
  if (n < 2) { for (let i = 0; i < 256; i++) out[i] = i; return out; }
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); const dx = [], m = [], c1 = [];
  for (let i = 0; i < n - 1; i++) { dx.push(xs[i + 1] - xs[i] || 1e-6); m.push((ys[i + 1] - ys[i]) / dx[i]); }
  c1.push(m[0]); for (let i = 0; i < n - 2; i++) { if (m[i] * m[i + 1] <= 0) c1.push(0); else { const c = dx[i] + dx[i + 1]; c1.push(3 * c / ((c + dx[i + 1]) / m[i] + (c + dx[i]) / m[i + 1])); } } c1.push(m[n - 2]);
  for (let x = 0; x < 256; x++) {
    let v; if (x <= xs[0]) v = ys[0]; else if (x >= xs[n - 1]) v = ys[n - 1]; else { let i = 0; while (xs[i + 1] < x) i++; const h = dx[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t; v = ys[i] * (2 * t3 - 3 * t2 + 1) + h * c1[i] * (t3 - 2 * t2 + t) + ys[i + 1] * (-2 * t3 + 3 * t2) + h * c1[i + 1] * (t3 - t2); }
    out[x] = cl(Math.round(v));
  }
  return out;
}

const S = (key, label, min, max, step = 1, def = 0) => ({ key, label, min, max, step, def });

export const ADJUSTMENTS = {
  brightness: {
    label: 'Brightness/Contrast', icon: 'sunDim',
    controls: [S('b', 'Brightness', -100, 100), S('c', 'Contrast', -100, 100)],
    make: (p) => { const c = p.c * 2.55, f = (259 * (c + 255)) / (255 * (259 - c)), b = p.b * 1.275; const l = mkLut((v) => f * (v + b - 128) + 128); return (d) => lutApply(d, l, l, l); },
  },
  exposure: {
    label: 'Exposure', icon: 'sunDim',
    controls: [S('exposure', 'Exposure', -3, 3, 0.05), S('offset', 'Offset', -0.5, 0.5, 0.005), S('gamma', 'Gamma', 0.2, 3, 0.01, 1)],
    make: (p) => { const k = Math.pow(2, p.exposure), g = 1 / (p.gamma || 1); const l = mkLut((v) => 255 * Math.pow(Math.max(0, (v / 255) * k + p.offset), g)); return (d) => lutApply(d, l, l, l); },
  },
  levels: {
    label: 'Levels', icon: 'sliders',
    controls: [S('inB', 'Input black', 0, 254, 1, 0), S('gamma', 'Midtones', 0.1, 5, 0.01, 1), S('inW', 'Input white', 1, 255, 1, 255), S('outB', 'Output black', 0, 255, 1, 0), S('outW', 'Output white', 0, 255, 1, 255)],
    channels: true,
    make: (p) => {
      const f = (v) => { let t = (v - p.inB) / Math.max(1, p.inW - p.inB); t = Math.min(1, Math.max(0, t)); t = Math.pow(t, 1 / (p.gamma || 1)); return p.outB + t * (p.outW - p.outB); };
      const id = mkLut((v) => v), l = mkLut(f); const ch = p.channel || 'rgb';
      return (d) => lutApply(d, ch === 'rgb' || ch === 'r' ? l : id, ch === 'rgb' || ch === 'g' ? l : id, ch === 'rgb' || ch === 'b' ? l : id);
    },
  },
  curves: {
    label: 'Curves', icon: 'spark', curves: true,
    controls: [],
    make: (p) => { const c = p.points || {}; const base = curveLut(c.rgb || [[0, 0], [255, 255]]); const lr = curveLut(c.r || [[0, 0], [255, 255]]), lg = curveLut(c.g || [[0, 0], [255, 255]]), lb = curveLut(c.b || [[0, 0], [255, 255]]); return (d) => lutApply(d, mkLut((v) => lr[base[v]]), mkLut((v) => lg[base[v]]), mkLut((v) => lb[base[v]])); },
  },
  hueSat: {
    label: 'Hue/Saturation', icon: 'palette',
    controls: [S('hue', 'Hue', -180, 180), S('sat', 'Saturation', -100, 100), S('light', 'Lightness', -100, 100)],
    make: (p) => (d) => {
      for (let i = 0; i < d.length; i += 4) {
        let [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]); h = (h + p.hue / 360 + 1) % 1; s = p.sat >= 0 ? Math.min(1, s * (1 + p.sat / 100)) : s * (1 + p.sat / 100);
        l = p.light >= 0 ? l + (1 - l) * (p.light / 100) : l * (1 + p.light / 100); const [r, g, b] = hsl2rgb(h, s, l); d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    },
  },
  vibrance: {
    label: 'Vibrance', icon: 'palette',
    controls: [S('vibrance', 'Vibrance', -100, 100), S('sat', 'Saturation', -100, 100)],
    make: (p) => (d) => {
      const v = p.vibrance / 100, sa = 1 + p.sat / 100;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0; const amt = 1 + v * (1 - sat) * (v > 0 ? 1 : 0.5) * (v > 0 ? 1 : 1) ; const avg = (r + g + b) / 3;
        const k = amt * sa; d[i] = avg + (r - avg) * k; d[i + 1] = avg + (g - avg) * k; d[i + 2] = avg + (b - avg) * k;
      }
    },
  },
  colorBalance: {
    label: 'Color Balance', icon: 'palette', sections: ['Shadows', 'Midtones', 'Highlights'],
    controls: [S('sr', 'Cyan - Red', -100, 100), S('sg', 'Magenta - Green', -100, 100), S('sb', 'Yellow - Blue', -100, 100), S('mr', 'Cyan - Red', -100, 100), S('mg', 'Magenta - Green', -100, 100), S('mb', 'Yellow - Blue', -100, 100), S('hr', 'Cyan - Red', -100, 100), S('hg', 'Magenta - Green', -100, 100), S('hb', 'Yellow - Blue', -100, 100)],
    make: (p) => (d) => {
      for (let i = 0; i < d.length; i += 4) {
        const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; const sh = (1 - L) * (1 - L), mi = 4 * L * (1 - L), hi = L * L;
        d[i] += (p.sr * sh + p.mr * mi + p.hr * hi) * 0.6; d[i + 1] += (p.sg * sh + p.mg * mi + p.hg * hi) * 0.6; d[i + 2] += (p.sb * sh + p.mb * mi + p.hb * hi) * 0.6;
      }
    },
  },
  temperature: {
    label: 'Temperature/Tint', icon: 'sun',
    controls: [S('temp', 'Temperature', -100, 100), S('tint', 'Tint', -100, 100)],
    make: (p) => (d) => { const t = p.temp * 0.35, n = p.tint * 0.25; for (let i = 0; i < d.length; i += 4) { d[i] += t + n * 0.3; d[i + 1] -= n; d[i + 2] -= t - n * 0.3; } },
  },
  blackWhite: {
    label: 'Black & White', icon: 'adjust',
    controls: [S('reds', 'Reds', -100, 200, 1, 40), S('yellows', 'Yellows', -100, 200, 1, 60), S('greens', 'Greens', -100, 200, 1, 40), S('cyans', 'Cyans', -100, 200, 1, 60), S('blues', 'Blues', -100, 200, 1, 20), S('magentas', 'Magentas', -100, 200, 1, 80)],
    make: (p) => {
      const w = [p.reds, p.yellows, p.greens, p.cyans, p.blues, p.magentas]; const tint = p.tint ? hexRgb(p.tintColor || '#d8b070') : null; const ta = (p.tintAmt ?? 40) / 100;
      return (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2]; const [h, s] = rgb2hsl(r, g, b); const pos = h * 6; const i0 = Math.floor(pos) % 6, i1 = (i0 + 1) % 6, f = pos - Math.floor(pos); const m = w[i0] * (1 - f) + w[i1] * f; const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          let v = gray * (1 + ((m - 50) / 100) * s * 2); v = cl(v);
          if (tint) { const L = v / 255; d[i] = v * (1 - ta) + tint[0] * L * ta; d[i + 1] = v * (1 - ta) + tint[1] * L * ta; d[i + 2] = v * (1 - ta) + tint[2] * L * ta; } else { d[i] = d[i + 1] = d[i + 2] = v; }
        }
      };
    },
  },
  photoFilter: {
    label: 'Photo Filter', icon: 'palette',
    controls: [S('density', 'Density', 0, 100, 1, 25)], color: true,
    make: (p) => { const [fr, fg, fb] = hexRgb(p.color || '#ec8a00'); const k = (p.density ?? 25) / 100; return (d) => { for (let i = 0; i < d.length; i += 4) { const L0 = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; let r = d[i] * (1 - k) + fr * k, g = d[i + 1] * (1 - k) + fg * k, b = d[i + 2] * (1 - k) + fb * k; if (p.keepLum !== false) { const L1 = 0.299 * r + 0.587 * g + 0.114 * b || 1; const q = L0 / L1; r *= q; g *= q; b *= q; } d[i] = r; d[i + 1] = g; d[i + 2] = b; } }; },
  },
  shadowsHighlights: {
    label: 'Shadows/Highlights', icon: 'sunDim',
    controls: [S('shadows', 'Shadows', 0, 100, 1, 35), S('highlights', 'Highlights', 0, 100, 1, 25)],
    make: (p) => (d) => { for (let i = 0; i < d.length; i += 4) { const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; const a = p.shadows * 1.1 * Math.pow(1 - L, 3), b = -p.highlights * 1.1 * Math.pow(L, 3); d[i] += a + b; d[i + 1] += a + b; d[i + 2] += a + b; } },
  },
  threshold: { label: 'Threshold', icon: 'adjust', controls: [S('t', 'Level', 1, 255, 1, 128)], make: (p) => (d) => { for (let i = 0; i < d.length; i += 4) { const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= p.t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } } },
  posterize: { label: 'Posterize', icon: 'layers', controls: [S('levels', 'Levels', 2, 32, 1, 4)], make: (p) => { const l = mkLut((v) => Math.round(Math.floor((v / 256) * p.levels) * (255 / (p.levels - 1)))); return (d) => lutApply(d, l, l, l); } },
  invert: { label: 'Invert', icon: 'circleDot', controls: [], make: () => { const l = mkLut((v) => 255 - v); return (d) => lutApply(d, l, l, l); } },
  gradientMap: {
    label: 'Gradient Map', icon: 'gradient', controls: [], colors: ['from', 'to'],
    make: (p) => { const a = hexRgb(p.from || '#101030'), b = hexRgb(p.to || '#ffe9b0'); return (d) => { for (let i = 0; i < d.length; i += 4) { const t = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; d[i] = a[0] + (b[0] - a[0]) * t; d[i + 1] = a[1] + (b[1] - a[1]) * t; d[i + 2] = a[2] + (b[2] - a[2]) * t; } }; },
  },
};
export const ADJ_ORDER = ['brightness', 'exposure', 'levels', 'curves', 'hueSat', 'vibrance', 'colorBalance', 'temperature', 'blackWhite', 'photoFilter', 'shadowsHighlights', 'threshold', 'posterize', 'invert', 'gradientMap'];

export function adjDefaults(kind) {
  const a = ADJUSTMENTS[kind]; const p = {};
  for (const c of a.controls) p[c.key] = c.def;
  if (kind === 'curves') p.points = { rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] };
  if (kind === 'levels') p.channel = 'rgb';
  if (kind === 'photoFilter') { p.color = '#ec8a00'; p.keepLum = true; }
  if (kind === 'gradientMap') { p.from = '#101030'; p.to = '#ffe9b0'; }
  if (kind === 'blackWhite') { p.tint = false; p.tintColor = '#d8b070'; p.tintAmt = 40; }
  return p;
}

/* apply an adjustment to an ImageData-like RGBA array in place */
export function runAdjust(kind, params, data) { ADJUSTMENTS[kind].make(params)(data); }

/* quick auto-tone: set levels from the histogram clipping 0.5% on each side */
export function autoLevels(hist) {
  const total = hist.reduce((a, b) => a + b, 0); let lo = 0, hi = 255, s = 0;
  for (let i = 0; i < 256; i++) { s += hist[i]; if (s > total * 0.005) { lo = i; break; } }
  s = 0; for (let i = 255; i >= 0; i--) { s += hist[i]; if (s > total * 0.005) { hi = i; break; } }
  if (hi <= lo) { lo = 0; hi = 255; } return { inB: lo, inW: hi };
}
