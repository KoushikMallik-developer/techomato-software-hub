/* PDF engine for Techomato PDF Toolkit: pdfjs-dist renders pages, pdf-lib builds the output. */
let libs = null;
export async function loadLibs() {
  if (libs) return libs;
  const [pdfjs, PL] = await Promise.all([import('pdfjs-dist/build/pdf.min.mjs'), import('pdf-lib')]);
  await import('pdfjs-dist/build/pdf.worker.min.mjs'); // registers globalThis.pdfjsWorker -> runs without a separate worker file
  libs = { pdfjs, PL };
  return libs;
}
export const uid = () => Math.random().toString(36).slice(2, 9);
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || '') || ['', '000000']; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/* "1-3, 5, 8-" -> [0,1,2,4,7,...]  (zero-based, in order, no duplicates unless dup) */
export function parseRanges(text, n) {
  const out = []; const parts = String(text || '').split(/[,;\s]+/).filter(Boolean);
  for (const p of parts) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(p);
    if (m) { const a = m[1] ? +m[1] : 1; const b = m[2] ? +m[2] : n; if (a < 1 || b < 1 || a > n) return null; const lo = Math.min(a, b), hi = Math.min(n, Math.max(a, b)); if (a <= b) for (let i = lo; i <= hi; i++) out.push(i - 1); else for (let i = Math.min(n, a); i >= b; i--) out.push(i - 1); } else if (/^\d+$/.test(p)) { const v = +p; if (v < 1 || v > n) return null; out.push(v - 1); } else return null;
  }
  return out;
}

/* ---------- opening files ---------- */
export async function openPdf(bytes, name, password) {
  const { pdfjs, PL } = await loadLibs();
  const task = pdfjs.getDocument({ data: bytes.slice(0), password, useSystemFonts: true, isEvalSupported: false });
  const doc = await task.promise;
  const info = [];
  for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const v = p.view; info.push({ view: v, w: v[2] - v[0], h: v[3] - v[1], rot: p.rotate || 0 }); }
  let editable = true; try { await PL.PDFDocument.load(bytes, { updateMetadata: false }); } catch { editable = false; }
  let meta = {}; try { const m = await doc.getMetadata(); meta = { title: (m.info && m.info.Title) || '', author: (m.info && m.info.Author) || '', subject: (m.info && m.info.Subject) || '', keywords: (m.info && m.info.Keywords) || '' }; } catch { /* ignore */ }
  return { id: uid(), name, bytes, doc, info, n: doc.numPages, editable, meta };
}

export const PAGE_SIZES = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008], A3: [841.89, 1190.55], A5: [419.53, 595.28] };

async function imgToPngBytes(file) {
  const url = URL.createObjectURL(file);
  try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Cannot read image ' + file.name)); i.src = url; }); const c = document.createElement('canvas'); c.width = im.naturalWidth || 800; c.height = im.naturalHeight || 600; c.getContext('2d').drawImage(im, 0, 0); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); return new Uint8Array(await blob.arrayBuffer()); } finally { URL.revokeObjectURL(url); }
}
/* One image -> single-page PDF bytes. opts: {size:'fit'|'A4'|'Letter', margin} */
export async function imageToPdf(file, opts = {}) {
  const { PL } = await loadLibs(); const doc = await PL.PDFDocument.create();
  let bytes = new Uint8Array(await file.arrayBuffer()); let img;
  if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) img = await doc.embedJpg(bytes);
  else { if (!(file.type === 'image/png' || /\.png$/i.test(file.name))) bytes = await imgToPngBytes(file); img = await doc.embedPng(bytes); }
  const margin = opts.margin || 0; let pw, ph; const iw = img.width, ih = img.height;
  if (!opts.size || opts.size === 'fit') { const k = Math.min(1, 1000 / Math.max(iw, ih)); pw = iw * k + margin * 2; ph = ih * k + margin * 2; } else { const s = PAGE_SIZES[opts.size] || PAGE_SIZES.A4; [pw, ph] = iw > ih ? [s[1], s[0]] : s; }
  const page = doc.addPage([pw, ph]); const k = Math.min((pw - margin * 2) / iw, (ph - margin * 2) / ih); const w = iw * k, h = ih * k;
  page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  return doc.save();
}

/* ---------- rendering ---------- */
export async function renderPageTo(file, idx, rot, canvas, maxDim, scaleOverride) {
  const page = await file.doc.getPage(idx + 1); const total = ((page.rotate || 0) + (rot || 0)) % 360;
  const base = page.getViewport({ scale: 1, rotation: total }); const scale = scaleOverride || Math.min(maxDim / base.width, maxDim / base.height);
  const vp = page.getViewport({ scale: scale * (window.devicePixelRatio > 1 ? 1.5 : 1), rotation: total }); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
  return { w: base.width, h: base.height };
}
export const displaySize = (info, rot) => { const t = (info.rot + (rot || 0)) % 360; return t % 180 === 0 ? [info.w, info.h] : [info.h, info.w]; };

/* ---------- drawing overlay operations onto a pdf-lib page ---------- */
const FONTS = { Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], Times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'], Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] };
export const winAnsi = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x09\x0a\x20-\x7e\xa0-\xff€]/g, '?');
async function getFont(ctx, name = 'Helvetica', bold, italic) { const k = `${name}${bold ? 'B' : ''}${italic ? 'I' : ''}`; if (!ctx.fonts[k]) { const set = FONTS[name] || FONTS.Helvetica; ctx.fonts[k] = await ctx.doc.embedFont(ctx.PL.StandardFonts[set[(bold ? 1 : 0) + (italic ? 2 : 0)]]); } return ctx.fonts[k]; }
async function drawOps(ctx, page, ops, geo) {
  const { PL } = ctx; const { rgb, degrees } = PL; const { x0, y0, H } = geo; const col = (c) => { const [r, g, b] = hexRgb(c); return rgb(r / 255, g / 255, b / 255); };
  const X = (x) => x0 + x, Y = (y) => y0 + H - y;
  for (const o of ops) {
    const op = o.opacity == null ? 1 : o.opacity;
    if (o.type === 'text') {
      const font = await getFont(ctx, o.font, o.bold, o.italic); const lines = winAnsi(o.text || '').split('\n'); const size = o.size || 14; const lh = size * 1.2;
      lines.forEach((ln, i) => {
        if (!ln) return; const w = font.widthOfTextAtSize(ln, size); let dx = 0; if (o.align === 'center') dx = -w / 2; else if (o.align === 'right') dx = -w;
        if (o.rotate) { const th = (o.rotate * Math.PI) / 180; const bx = dx, by = -(size * 0.3) - i * lh; /* anchor = vertical middle of first line */ page.drawText(ln, { x: X(o.x) + bx * Math.cos(th) - by * Math.sin(th), y: Y(o.y) + bx * Math.sin(th) + by * Math.cos(th), size, font, color: col(o.color), opacity: op, rotate: degrees(o.rotate) }); } else page.drawText(ln, { x: X(o.x) + dx, y: Y(o.y) - size * 0.95 - i * lh, size, font, color: col(o.color), opacity: op });
      });
    } else if (o.type === 'rect' || o.type === 'highlight') {
      const opt = { x: X(o.x), y: Y(o.y + o.h), width: o.w, height: o.h, opacity: o.type === 'highlight' ? 0.35 : (o.fill ? op : 0), borderOpacity: o.type === 'highlight' ? 0 : op };
      if (o.type === 'highlight') { opt.color = col(o.color); opt.blendMode = PL.BlendMode.Multiply; } else { if (o.fill) opt.color = col(o.fill); if (o.stroke !== false) { opt.borderColor = col(o.color); opt.borderWidth = o.sw || 2; } }
      page.drawRectangle(opt);
    } else if (o.type === 'ellipse') {
      const opt = { x: X(o.x + o.w / 2), y: Y(o.y + o.h / 2), xScale: Math.abs(o.w / 2), yScale: Math.abs(o.h / 2), opacity: o.fill ? op : 0, borderOpacity: op }; if (o.fill) opt.color = col(o.fill); if (o.stroke !== false) { opt.borderColor = col(o.color); opt.borderWidth = o.sw || 2; } page.drawEllipse(opt);
    } else if (o.type === 'line') {
      const a = { x: X(o.x1), y: Y(o.y1) }, b = { x: X(o.x2), y: Y(o.y2) }; page.drawLine({ start: a, end: b, thickness: o.sw || 2, color: col(o.color), opacity: op, lineCap: PL.LineCapStyle.Round });
      if (o.arrow) { const ang = Math.atan2(b.y - a.y, b.x - a.x); const L = 10 + (o.sw || 2) * 2; for (const s of [-1, 1]) page.drawLine({ start: b, end: { x: b.x - L * Math.cos(ang + s * 0.45), y: b.y - L * Math.sin(ang + s * 0.45) }, thickness: o.sw || 2, color: col(o.color), opacity: op, lineCap: PL.LineCapStyle.Round }); }
    } else if (o.type === 'path') {
      for (let i = 1; i < o.pts.length; i++) page.drawLine({ start: { x: X(o.pts[i - 1][0]), y: Y(o.pts[i - 1][1]) }, end: { x: X(o.pts[i][0]), y: Y(o.pts[i][1]) }, thickness: o.sw || 2, color: col(o.color), opacity: op, lineCap: PL.LineCapStyle.Round });
    } else if (o.type === 'image') {
      const key = o.src; if (!ctx.imgs[key]) { const bin = atob(o.src.split(',')[1]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); ctx.imgs[key] = /image\/jpeg/.test(o.src) ? await ctx.doc.embedJpg(u) : await ctx.doc.embedPng(u); }
      page.drawImage(ctx.imgs[key], { x: X(o.x), y: Y(o.y + o.h), width: o.w, height: o.h, opacity: op });
    }
  }
}

/* ---------- build the output ---------- */
/* files: Map id->file, pages: [{fid, idx, rot, blank?:{w,h}, ann:[]}], settings: {watermark, numbers, header, footer, crop, meta}  -> Uint8Array */
export async function buildPdf(files, pages, settings = {}, onProgress) {
  const { PL } = await loadLibs(); const { PDFDocument, degrees } = PL; const out = await PDFDocument.create(); const srcs = new Map();
  const ctx = { PL, doc: out, fonts: {}, imgs: {} };
  const total = pages.length; const crop = settings.crop || null;
  for (let pi = 0; pi < total; pi++) {
    const pg = pages[pi]; let page; let info;
    if (pg.blank) { page = out.addPage([pg.blank.w, pg.blank.h]); info = { view: [0, 0, pg.blank.w, pg.blank.h], w: pg.blank.w, h: pg.blank.h, rot: 0 }; } else {
      const f = files.get(pg.fid); if (!srcs.has(pg.fid)) srcs.set(pg.fid, await PDFDocument.load(f.bytes, { updateMetadata: false })); const [cp] = await out.copyPages(srcs.get(pg.fid), [pg.idx]); page = out.addPage(cp); info = f.info[pg.idx];
      const v = info.view; page.setMediaBox(v[0], v[1], v[2] - v[0], v[3] - v[1]); page.setCropBox(v[0], v[1], v[2] - v[0], v[3] - v[1]);
    }
    let R = ((info.rot + (pg.rot || 0)) % 360 + 360) % 360; const dispW = R % 180 === 0 ? info.w : info.h, dispH = R % 180 === 0 ? info.h : info.w;
    /* collect overlay operations in displayed coordinates */
    const ops = [...(pg.ann || [])];
    const pn = pi + 1; const numTok = (s) => String(s).replace(/\{n\}/g, pn).replace(/\{total\}/g, total).replace(/\{file\}/g, pg.blank ? '' : (files.get(pg.fid).name || '').replace(/\.pdf$/i, ''));
    const wm = settings.watermark; if (wm && wm.on && wm.text) { if (wm.pages !== 'odd' || pn % 2 === 1) if (wm.pages !== 'even' || pn % 2 === 0) { const th = ((wm.angle || 0) * Math.PI) / 180; ops.push({ type: 'text', text: wm.text, x: dispW / 2 - 0, y: dispH / 2 - 0, size: wm.size || 72, color: wm.color || '#999999', opacity: wm.opacity == null ? 0.25 : wm.opacity, rotate: wm.angle || 0, align: 'center', font: 'Helvetica', bold: true }); void th; } }
    const nm = settings.numbers; if (nm && nm.on && pn >= (nm.start || 1) && (nm.skipFirst ? pn > 1 : true)) { const txt = numTok(nm.format || 'Page {n} of {total}'); const m = nm.margin == null ? 28 : nm.margin; const al = nm.align || 'center'; const x = al === 'left' ? m : al === 'right' ? dispW - m : dispW / 2; const y = nm.pos === 'top' ? m - (nm.size || 11) : dispH - m - (nm.size || 11) * 0.2; ops.push({ type: 'text', text: txt, x, y: nm.pos === 'top' ? m : dispH - m - (nm.size || 11), size: nm.size || 11, color: nm.color || '#444444', align: al, font: nm.font || 'Helvetica' }); void y; }
    for (const [key, top] of [['header', true], ['footer', false]]) { const hf = settings[key]; if (!hf || !hf.on) continue; const m = hf.margin == null ? 24 : hf.margin; const size = hf.size || 10; for (const [al, txt] of [['left', hf.left], ['center', hf.center], ['right', hf.right]]) if (txt) ops.push({ type: 'text', text: numTok(txt), x: al === 'left' ? m + 6 : al === 'right' ? dispW - m - 6 : dispW / 2, y: top ? m : dispH - m - size, size, color: hf.color || '#444444', align: al, font: hf.font || 'Helvetica' }); }
    if (ops.length && R !== 0) {
      /* bake rotation into a fresh upright page so overlay coordinates are simple */
      const emb = await out.embedPage(page); const idx = out.getPageCount() - 1; const np = out.insertPage(idx, [dispW, dispH]);
      const tf = { 90: { x: 0, y: info.w, r: -90 }, 180: { x: info.w, y: info.h, r: 180 }, 270: { x: info.h, y: 0, r: 90 } }[R];
      np.drawPage(emb, { x: tf.x, y: tf.y, rotate: degrees(tf.r), xScale: 1, yScale: 1 });
      out.removePage(idx + 1); page = np; R = 0; await drawOps(ctx, page, ops, { x0: 0, y0: 0, H: dispH });
    } else {
      if (R !== 0) page.setRotation(degrees(R)); else page.setRotation(degrees(0));
      if (ops.length) { const mb = page.getMediaBox(); await drawOps(ctx, page, ops, { x0: mb.x, y0: mb.y, H: dispH }); }
    }
    if (crop && (crop.t || crop.r || crop.b || crop.l) && page) { const mb = page.getMediaBox(); const rr = page.getRotation().angle; /* margins are given for the displayed page */ let [t, r, b, l] = [crop.t || 0, crop.r || 0, crop.b || 0, crop.l || 0]; if (rr === 90) [t, r, b, l] = [l, t, r, b]; else if (rr === 180) [t, r, b, l] = [b, l, t, r]; else if (rr === 270) [t, r, b, l] = [r, b, l, t]; const nw = mb.width - l - r, nh = mb.height - t - b; if (nw > 10 && nh > 10) page.setCropBox(mb.x + l, mb.y + b, nw, nh); }
    if (onProgress) onProgress((pi + 1) / total);
  }
  const m = settings.meta; if (m) { out.setTitle(m.title || ''); out.setAuthor(m.author || ''); out.setSubject(m.subject || ''); out.setKeywords((m.keywords || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)); out.setProducer('Techomato PDF Toolkit'); out.setCreator('Techomato PDF Toolkit'); } else { out.setProducer('Techomato PDF Toolkit'); }
  return out.save();
}

/* Re-open generated bytes with pdfjs (used for preview / compress / images) */
export async function openBytes(bytes) { const { pdfjs } = await loadLibs(); const doc = await pdfjs.getDocument({ data: bytes.slice(0), useSystemFonts: true, isEvalSupported: false }).promise; return doc; }
export async function rasterize(doc, scale, mime, quality, onProgress) {
  const res = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i); const vp = p.getViewport({ scale }); const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise; const blob = await new Promise((r) => c.toBlob(r, mime, quality)); res.push({ blob, w: c.width, h: c.height, ptW: p.getViewport({ scale: 1 }).width, ptH: p.getViewport({ scale: 1 }).height }); if (onProgress) onProgress(i / doc.numPages);
  }
  return res;
}
export async function imagesToPdfBytes(images, onProgress) {
  const { PL } = await loadLibs(); const out = await PL.PDFDocument.create();
  for (let i = 0; i < images.length; i++) { const im = images[i]; const bytes = new Uint8Array(await im.blob.arrayBuffer()); const e = im.blob.type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes); const p = out.addPage([im.ptW, im.ptH]); p.drawImage(e, { x: 0, y: 0, width: im.ptW, height: im.ptH }); if (onProgress) onProgress((i + 1) / images.length); }
  out.setProducer('Techomato PDF Toolkit'); return out.save();
}
export async function extractText(file, idxs) {
  const parts = []; for (const i of idxs) { const p = await file.doc.getPage(i + 1); const tc = await p.getTextContent(); let line = ''; let lastY = null; const lines = []; for (const it of tc.items) { if (!('str' in it)) continue; const y = Math.round(it.transform[5]); if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; } line += it.str + (it.hasEOL ? '' : ''); lastY = y; } lines.push(line); parts.push(lines.join('\n')); }
  return parts;
}

/* ---------- misc helpers ---------- */
export const saveBlob = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
export const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const stem = (name) => String(name || 'document').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'document';
export async function makeZip(entries) { const JSZip = (await import('jszip')).default; const z = new JSZip(); for (const [n, d] of entries) z.file(n, d); return z.generateAsync({ type: 'blob', compression: 'STORE' }); }
