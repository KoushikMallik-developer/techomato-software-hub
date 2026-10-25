/* Techomato Video Studio: compositing engine (pure canvas rendering from a project description). */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);

export const TRANSITIONS = [['none', 'None'], ['fade', 'Fade'], ['slideL', 'Slide from left'], ['slideR', 'Slide from right'], ['slideU', 'Slide from top'], ['slideD', 'Slide from bottom'], ['wipeL', 'Wipe from left'], ['wipeR', 'Wipe from right'], ['zoom', 'Zoom'], ['spin', 'Spin'], ['blur', 'Blur']];
export const LOOKS = {
  none: { label: 'None', fx: {} },
  cinematic: { label: 'Cinematic', fx: { contrast: 115, sat: 85, bright: 96, temp: -15, vignette: 40 } },
  warm: { label: 'Warm', fx: { sat: 110, temp: 35, bright: 104 } },
  cool: { label: 'Cool', fx: { sat: 95, temp: -35 } },
  vivid: { label: 'Vivid', fx: { contrast: 112, sat: 150 } },
  vintage: { label: 'Vintage', fx: { sepia: 55, contrast: 92, sat: 85, vignette: 55 } },
  bw: { label: 'Black & white', fx: { gray: 100, contrast: 112 } },
  noir: { label: 'Noir', fx: { gray: 100, contrast: 150, bright: 88, vignette: 60 } },
  faded: { label: 'Faded', fx: { contrast: 82, bright: 110, sat: 80 } },
};
export const defaultFx = () => ({ bright: 100, contrast: 100, sat: 100, hue: 0, blur: 0, gray: 0, sepia: 0, invert: 0, temp: 0, vignette: 0 });
export const defaultText = () => ({ str: 'Your title', font: 'Inter, Arial, sans-serif', size: 96, color: '#ffffff', bg: '', align: 'center', bold: true, italic: false, ypos: 50, shadow: true, outline: 0 });

/* keyframes: clip.kf = { prop: [[t, v], ...] } with t seconds from clip start */
export function kfValue(kf, t, base) { if (!kf || !kf.length) return base; if (t <= kf[0][0]) return kf[0][1]; const last = kf[kf.length - 1]; if (t >= last[0]) return last[1]; for (let i = 1; i < kf.length; i++) if (t <= kf[i][0]) { const [t0, v0] = kf[i - 1], [t1, v1] = kf[i]; return lerp(v0, v1, ease((t - t0) / (t1 - t0 || 1))); } return base; }
export const prop = (c, p, lt) => kfValue(c.kf && c.kf[p], lt, c[p]);

export function transitionAt(c, lt) {
  const st = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0, wipe: null };
  const apply = (type, p, isIn) => { // p: 0 (hidden) .. 1 (shown)
    if (!type || type === 'none') return; const e = ease(clamp(p, 0, 1));
    if (type === 'fade') st.alpha *= e;
    else if (type === 'slideL') st.dx -= 1 - e; else if (type === 'slideR') st.dx += 1 - e; else if (type === 'slideU') st.dy -= 1 - e; else if (type === 'slideD') st.dy += 1 - e;
    else if (type === 'wipeL') st.wipe = { dir: 'l', p: e }; else if (type === 'wipeR') st.wipe = { dir: 'r', p: e };
    else if (type === 'zoom') { st.scale *= lerp(isIn ? 0.4 : 1.8, 1, e); st.alpha *= e; }
    else if (type === 'spin') { st.rot += (1 - e) * (isIn ? -180 : 180); st.scale *= lerp(0.3, 1, e); st.alpha *= e; }
    else if (type === 'blur') { st.blur += (1 - e) * 24; st.alpha *= lerp(0.2, 1, e); }
  };
  if (c.tIn && c.tIn.type !== 'none' && lt < c.tIn.dur) apply(c.tIn.type, lt / c.tIn.dur, true);
  if (c.tOut && c.tOut.type !== 'none' && lt > c.dur - c.tOut.dur) apply(c.tOut.type, (c.dur - lt) / c.tOut.dur, false);
  return st;
}
export function fxFilter(fx, extraBlur = 0, scale = 1) {
  const f = []; if (fx.bright !== 100) f.push(`brightness(${fx.bright}%)`); if (fx.contrast !== 100) f.push(`contrast(${fx.contrast}%)`); if (fx.sat !== 100) f.push(`saturate(${fx.sat}%)`); if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
  if (fx.gray) f.push(`grayscale(${fx.gray}%)`); if (fx.sepia) f.push(`sepia(${fx.sepia}%)`); if (fx.invert) f.push(`invert(${fx.invert}%)`); const b = (fx.blur + extraBlur) * scale; if (b > 0.05) f.push(`blur(${b.toFixed(2)}px)`);
  return f.length ? f.join(' ') : 'none';
}
export const clipFx = (c) => ({ ...defaultFx(), ...(c.fx || {}) });
export const activeAt = (project, t) => project.clips.filter((c) => t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6);
export const trackOf = (project, id) => project.tracks.find((x) => x.id === id);
export const srcTime = (c, lt) => (c.in || 0) + lt * (c.speed || 1);
export const projectDuration = (p) => p.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);

function wrapText(g, str, maxW) { const out = []; for (const para of String(str).split('\n')) { const words = para.split(' '); let line = ''; for (const w of words) { const test = line ? `${line} ${w}` : w; if (g.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test; } out.push(line); } return out; }
function drawTitle(g, W, H, c, sc) {
  const t = { ...defaultText(), ...(c.text || {}) }; const size = t.size * sc; g.font = `${t.italic ? 'italic ' : ''}${t.bold ? '800 ' : '400 '}${size}px ${t.font}`; g.textBaseline = 'middle'; g.textAlign = t.align;
  const lines = wrapText(g, t.str, W * 0.9); const lh = size * 1.18; const cy = (t.ypos / 100) * H - ((lines.length - 1) * lh) / 2; const x = t.align === 'center' ? W / 2 : t.align === 'left' ? W * 0.06 : W * 0.94;
  if (t.bg) { const w = Math.max(...lines.map((l) => g.measureText(l).width)) + size * 0.8; const h = lines.length * lh + size * 0.4; const bx = t.align === 'center' ? x - w / 2 : t.align === 'left' ? x - size * 0.4 : x - w + size * 0.4; g.fillStyle = t.bg; g.beginPath(); if (g.roundRect) g.roundRect(bx, cy - lh / 2 - size * 0.2, w, h, size * 0.2); else g.rect(bx, cy - lh / 2 - size * 0.2, w, h); g.fill(); }
  if (t.shadow) { g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = size * 0.18; g.shadowOffsetY = size * 0.05; }
  lines.forEach((l, i) => { const y = cy + i * lh; if (t.outline > 0) { g.lineWidth = t.outline * sc * 2; g.strokeStyle = '#000'; g.lineJoin = 'round'; g.strokeText(l, x, y); } g.fillStyle = t.color; g.fillText(l, x, y); });
  g.shadowColor = 'transparent';
}
export function drawVignette(g, W, H, amt) { const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${(amt / 100) * 0.85})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }

/* draw one clip. el: video/img element or null (title/color) with natural size info */
export function drawClip(g, W, H, project, c, el, lt, sc) {
  const kind = c.kind; const tr = transitionAt(c, lt); const fx = clipFx(c); const op = clamp(prop(c, 'opacity', lt), 0, 100) / 100 * tr.alpha; if (op <= 0.001) return;
  g.save(); g.globalAlpha = op;
  const px = prop(c, 'x', lt) * sc, py = prop(c, 'y', lt) * sc, scl = prop(c, 'scale', lt) / 100 * tr.scale, rot = prop(c, 'rot', lt) + tr.rot;
  g.translate(W / 2 + px + tr.dx * W, H / 2 + py + tr.dy * H); if (rot) g.rotate((rot * Math.PI) / 180); g.scale(scl, scl);
  const filter = fxFilter(fx, tr.blur, sc); const crop = c.crop || { l: 0, t: 0, r: 0, b: 0 };
  if (kind === 'title') { g.translate(-W / 2, -H / 2); if (tr.wipe) clipWipe(g, 0, 0, W, H, tr.wipe); g.filter = filter; drawTitle(g, W, H, c, sc); }
  else if (kind === 'color') { const bw = W, bh = H; g.filter = filter; if (tr.wipe) clipWipe(g, -bw / 2, -bh / 2, bw, bh, tr.wipe); g.fillStyle = c.color || '#2a2a2a'; g.fillRect(-bw / 2, -bh / 2, bw, bh); }
  else if (el) {
    const vw = el.videoWidth || el.naturalWidth || el.width, vh = el.videoHeight || el.naturalHeight || el.height; if (!vw || !vh) { g.restore(); return; }
    const fit = Math.min(W / vw, H / vh); const dw = vw * fit, dh = vh * fit; const sx = vw * (crop.l / 100), sy = vh * (crop.t / 100), sw = vw * (1 - (crop.l + crop.r) / 100), sh = vh * (1 - (crop.t + crop.b) / 100); if (sw <= 1 || sh <= 1) { g.restore(); return; }
    const ox = -dw / 2 + dw * (crop.l / 100), oy = -dh / 2 + dh * (crop.t / 100), cw = dw * (sw / vw), ch = dh * (sh / vh);
    if (tr.wipe) clipWipe(g, ox, oy, cw, ch, tr.wipe); g.filter = filter; try { g.drawImage(el, sx, sy, sw, sh, ox, oy, cw, ch); } catch { /* not ready */ }
    g.filter = 'none';
    if (fx.temp) { g.globalCompositeOperation = 'soft-light'; g.globalAlpha = op * Math.min(1, Math.abs(fx.temp) / 60); g.fillStyle = fx.temp > 0 ? '#ff9a2e' : '#2e8fff'; g.fillRect(ox, oy, cw, ch); g.globalCompositeOperation = 'source-over'; g.globalAlpha = op; }
    if (fx.vignette) { g.save(); g.beginPath(); g.rect(ox, oy, cw, ch); g.clip(); g.translate(ox, oy); drawVignette(g, cw, ch, fx.vignette); g.restore(); }
  }
  g.restore();
}
function clipWipe(g, x, y, w, h, wp) { g.beginPath(); if (wp.dir === 'l') g.rect(x, y, w * wp.p, h); else g.rect(x + w * (1 - wp.p), y, w * wp.p, h); g.clip(); }

/* Render the whole frame at time t onto g (size W x H). getEl(clip) -> element|null */
export function renderFrame(g, W, H, project, t, getEl) {
  const sc = W / project.w; g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.fillStyle = project.bg || '#000'; g.fillRect(0, 0, W, H);
  const vt = project.tracks.filter((x) => x.type === 'video'); // index 0 = bottom
  for (const tk of vt) { if (tk.hidden) continue; for (const c of project.clips) { if (c.track !== tk.id || c.kind === 'audio') continue; if (t < c.start - 1e-6 || t >= c.start + c.dur - 1e-6) continue; drawClip(g, W, H, project, c, getEl(c), t - c.start, sc); } }
  g.restore();
}
export const fmtTC = (s, fps = 30) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), f = Math.floor((s % 1) * fps + 1e-6); const p = (n) => String(n).padStart(2, '0'); return `${p(h)}:${p(m)}:${p(sec)}:${p(f)}`; };
export const fmtDur = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), sec = s - m * 60; return `${m}:${sec.toFixed(1).padStart(4, '0')}`; };
