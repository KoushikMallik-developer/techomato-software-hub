/* Image Converter engine: decode, transform, encode (all in the browser, via canvas) */
export const FORMATS = [
  { id: 'jpeg', label: 'JPG', mime: 'image/jpeg', ext: 'jpg', lossy: true },
  { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png' },
  { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp', lossy: true },
  { id: 'avif', label: 'AVIF', mime: 'image/avif', ext: 'avif', lossy: true },
  { id: 'bmp', label: 'BMP', mime: 'image/bmp', ext: 'bmp' },
  { id: 'ico', label: 'ICO (icon)', mime: 'image/x-icon', ext: 'ico' },
];
export const fmtOf = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];
export const fmtBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
export const stem = (n) => n.replace(/\.[^./\\]+$/, '');
export const RATIOS = [['Original', 0], ['1:1 square', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16]];

/* Decode any image the browser understands (JPG, PNG, GIF first frame, WebP, AVIF, BMP, SVG, ICO). */
export async function decode(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Unsupported image')); i.src = url; });
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) { w = 1024; h = 1024; }
    // rasterise now so SVGs and large photos are drawn once and reused
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    return { canvas: c, w, h };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}

export function outSize(w, h, o) {
  let cw = w, ch = h;
  const r = o.crop || 0;
  if (r) { if (w / h > r) cw = Math.round(h * r); else ch = Math.round(w / r); }
  if (o.rot === 90 || o.rot === 270) [cw, ch] = [ch, cw];
  let tw = cw, th = ch;
  const m = o.mode;
  if (m === 'percent') { tw = Math.max(1, Math.round(cw * o.pct / 100)); th = Math.max(1, Math.round(ch * o.pct / 100)); }
  else if (m === 'width' && o.w) { tw = o.w; th = Math.max(1, Math.round(ch * o.w / cw)); }
  else if (m === 'height' && o.h) { th = o.h; tw = Math.max(1, Math.round(cw * o.h / ch)); }
  else if (m === 'fit' && o.w && o.h) { const s = Math.min(o.w / cw, o.h / ch); tw = Math.max(1, Math.round(cw * s)); th = Math.max(1, Math.round(ch * s)); }
  else if (m === 'exact' && o.w && o.h) { tw = o.w; th = o.h; }
  if (o.noUp && m !== 'exact' && (tw > cw || th > ch)) { tw = cw; th = ch; }
  return { cw, ch, tw, th };
}

export function render(src, o) {
  const { cw, ch, tw, th } = outSize(src.w, src.h, o);
  // 1. crop (centre) + rotate/flip into an intermediate canvas at crop size
  const r = o.crop || 0; let sw = src.w, sh = src.h, sx = 0, sy = 0;
  if (r) { if (src.w / src.h > r) { sw = Math.round(src.h * r); sx = Math.round((src.w - sw) / 2); } else { sh = Math.round(src.w / r); sy = Math.round((src.h - sh) / 2); } }
  const a = document.createElement('canvas'); a.width = cw; a.height = ch; const g = a.getContext('2d');
  g.save(); g.translate(cw / 2, ch / 2); g.rotate((o.rot || 0) * Math.PI / 180); g.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  g.drawImage(src.canvas, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh); g.restore();
  // 2. resize in halving steps for good quality
  let cur = a;
  if (tw !== cw || th !== ch) {
    let w = cw, h = ch;
    while (w / 2 >= tw && h / 2 >= th) { w = Math.round(w / 2); h = Math.round(h / 2); const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(cur, 0, 0, w, h); cur = t; }
    const t = document.createElement('canvas'); t.width = tw; t.height = th; const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(cur, 0, 0, tw, th); cur = t;
  }
  // 3. background (needed for JPG/BMP) and grayscale
  const out = document.createElement('canvas'); out.width = cur.width; out.height = cur.height; const og = out.getContext('2d');
  if (o.bg) { og.fillStyle = o.bg; og.fillRect(0, 0, out.width, out.height); }
  if (o.gray) og.filter = 'grayscale(1)';
  og.drawImage(cur, 0, 0);
  return out;
}

const toBlob = (c, mime, q) => new Promise((res) => c.toBlob(res, mime, q));
function encodeBmp(c) {
  const w = c.width, h = c.height; const d = c.getContext('2d').getImageData(0, 0, w, h).data; const row = w * 4; const size = 54 + row * h; const buf = new ArrayBuffer(size); const v = new DataView(buf);
  v.setUint16(0, 0x4d42, true); v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 32, true); v.setUint32(34, row * h, true); v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  let p = 54; for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; v.setUint8(p++, d[i + 2]); v.setUint8(p++, d[i + 1]); v.setUint8(p++, d[i]); v.setUint8(p++, d[i + 3]); }
  return new Blob([buf], { type: 'image/bmp' });
}
async function encodeIco(c, sizes) {
  const list = []; for (const s of sizes) { const t = document.createElement('canvas'); t.width = t.height = s; const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; const k = Math.min(s / c.width, s / c.height); const dw = c.width * k, dh = c.height * k; g.drawImage(c, (s - dw) / 2, (s - dh) / 2, dw, dh); const b = new Uint8Array(await (await toBlob(t, 'image/png')).arrayBuffer()); list.push({ s, b }); }
  const head = 6 + list.length * 16; const total = head + list.reduce((n, x) => n + x.b.length, 0); const buf = new ArrayBuffer(total); const v = new DataView(buf); const u8 = new Uint8Array(buf);
  v.setUint16(2, 1, true); v.setUint16(4, list.length, true); let off = head;
  list.forEach((x, i) => { const p = 6 + i * 16; v.setUint8(p, x.s >= 256 ? 0 : x.s); v.setUint8(p + 1, x.s >= 256 ? 0 : x.s); v.setUint16(p + 4, 1, true); v.setUint16(p + 6, 32, true); v.setUint32(p + 8, x.b.length, true); v.setUint32(p + 12, off, true); u8.set(x.b, off); off += x.b.length; });
  return new Blob([buf], { type: 'image/x-icon' });
}

/* Encode a canvas. opts: {format, quality (0-100), targetKB, icoSizes} -> {blob, quality?} */
export async function encode(c, o) {
  const f = fmtOf(o.format);
  if (f.id === 'bmp') return { blob: encodeBmp(c) };
  if (f.id === 'ico') return { blob: await encodeIco(c, o.icoSizes && o.icoSizes.length ? o.icoSizes : [16, 32, 48, 64, 128, 256]) };
  if (f.id === 'png') return { blob: await toBlob(c, 'image/png') };
  let q = o.quality / 100; let blob = await toBlob(c, f.mime, q);
  if (!blob || blob.type !== f.mime) throw new Error(f.label + ' is not supported by this browser');
  if (o.targetKB) {
    const target = o.targetKB * 1024;
    if (blob.size > target) { let lo = 0.02, hi = q, best = null; for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; const b = await toBlob(c, f.mime, mid); if (b.size <= target) { best = b; q = mid; lo = mid; } else hi = mid; } blob = best || (await toBlob(c, f.mime, 0.02)); }
  }
  return { blob, quality: q };
}

export async function formatSupport() {
  const c = document.createElement('canvas'); c.width = c.height = 2; const r = {};
  for (const f of FORMATS) { if (['png', 'bmp', 'ico'].includes(f.id)) { r[f.id] = true; continue; } const b = await toBlob(c, f.mime, 0.8); r[f.id] = !!b && b.type === f.mime; }
  return r;
}
