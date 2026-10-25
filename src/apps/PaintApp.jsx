import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, Modal, useToast, useAsk } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { pickFile, safeName } from '../lib/download.js';
import { Doc, mk, cloneCanvas, ctx2, SHAPES, BRUSHES, shapePath, drawShape, strokeSeg, dot, floodFill, pixelFilter, applyAdjust, supportsFilter, cssFilter, hexToRgb, rgbToHex } from './paint/engine.js';
import '../styles/paint.css';

const PALETTE = ['#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4', '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7'];
const FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Comic Sans MS'];
const SIZES = [1, 2, 3, 5, 8, 12, 16, 24, 32, 48, 64];
const ZOOMS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten']];
const PRESETS = [['Square 512', 512, 512], ['HD 1280 × 720', 1280, 720], ['Full HD 1920 × 1080', 1920, 1080], ['Social 1080 × 1080', 1080, 1080], ['A4 150 dpi', 1240, 1754], ['Small 640 × 480', 640, 480]];
const LS = 'techomato:paint-doc';
const blankPrefs = () => ({ tool: 'brush', c1: '#000000', c2: '#ffffff', size: 6, opacity: 100, brush: 'brush', shape: 'rect', outline: true, fill: false, tol: 24, font: 'Segoe UI', fsize: 32, bold: false, italic: false, underline: false, tbg: false, custom: [], tab: 'home', layers: true, selMode: 'rect', zoom: 1 });
const TOOLS = [['select', 'select', 'Select'], ['pencil', 'pencil', 'Pencil'], ['fill', 'bucket', 'Fill with colour'], ['text', 'textT', 'Text'], ['eraser', 'eraser', 'Eraser'], ['picker', 'pipette', 'Colour picker'], ['magnify', 'magnify', 'Magnifier'], ['brush', 'brush', 'Brushes'], ['shape', 'square', 'Shapes']];

function ShapeThumb({ kind, size = 26 }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current; const x = c.getContext('2d'); x.clearRect(0, 0, size, size); x.strokeStyle = getComputedStyle(c).color; x.lineWidth = 1.6; x.lineJoin = 'round'; x.lineCap = 'round'; if (kind === 'line' || kind === 'arrow') { drawShape(x, kind, [4, size - 4], [size - 4, 4], { stroke: x.strokeStyle, fill: 'none', width: 1.6, outline: true }); } else x.stroke(shapePath(kind, 3, 3, size - 6, size - 6)); }, [kind, size]);
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} aria-hidden="true" />;
}
const Rb = ({ icon, label, on, onClick, disabled, children, big }) => <button className={'pnt-rb' + (on ? ' on' : '') + (big ? ' big' : '')} aria-label={label} title={label} aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{icon && <Icon name={icon} size={big ? 22 : 17} />}{children}</button>;

export default function PaintApp() {
  const [prefs, setPrefs] = useStore('paint-prefs', blankPrefs, (v) => ({ ...blankPrefs(), ...v }));
  const P = prefs; const setP = (patch) => setPrefs((s) => ({ ...s, ...patch }));
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk();
  const docRef = useRef(null); if (!docRef.current) docRef.current = new Doc(1024, 640, '#ffffff'); const doc = docRef.current;
  const [, bump] = useReducer((x) => x + 1, 0);
  const cv = useRef(null); const ov = useRef(null); const sheet = useRef(null); const viewport = useRef(null); const strokeCv = useRef(null); const taRef = useRef(null);
  const st = useRef({}); // transient interaction state
  const sel = useRef(null); const clip = useRef(null); const hover = useRef(null); const raf = useRef(0); const preview = useRef(null);
  const [zoom, setZoomS] = useState(P.zoom || 1); const [pos, setPos] = useState(null); const [text, setText] = useState(null); const [modal, setModal] = useState(null); const [saveState, setSaveState] = useState('');
  const [selInfo, setSelInfo] = useState(null); const prevTool = useRef('brush'); const spaceDown = useRef(false);
  const live = useRef({}); live.current = { P, zoom, text };

  /* ---------- painting ---------- */
  const paint = useCallback(() => {
    raf.current = 0; const c = cv.current; const o = ov.current; if (!c) return; const { P: p, zoom: z } = live.current;
    if (c.width !== doc.w || c.height !== doc.h) { c.width = doc.w; c.height = doc.h; }
    const ctx = c.getContext('2d'); const s = st.current;
    doc.draw(ctx, {
      preview: preview.current,
      extras: (x) => {
        const sl = sel.current; if (sl && sl.floating) { x.drawImage(sl.floating, sl.x, sl.y, sl.w, sl.h); }
        if (s.drag && s.drag.type === 'stroke' && s.drag.tool !== 'eraser') { x.globalAlpha = s.drag.alpha; x.drawImage(strokeCv.current, 0, 0); x.globalAlpha = 1; }
        if (s.drag && s.drag.type === 'shape') { const d = s.drag; drawShape(x, p.shape, d.a, d.b, { stroke: d.color, fill: d.fill, useFill: p.fill, width: p.size, outline: p.outline, constrain: d.shift }); }
      },
    });
    // overlay at screen resolution
    const ow = Math.min(Math.round(doc.w * z), 4096); const oh = Math.min(Math.round(doc.h * z), 4096); if (o.width !== ow || o.height !== oh) { o.width = ow; o.height = oh; }
    const k = ow / doc.w; const x = o.getContext('2d'); x.clearRect(0, 0, ow, oh); x.save(); x.scale(k, k);
    if (z >= 8 && p.showGrid !== false) { x.strokeStyle = 'rgba(128,128,128,.35)'; x.lineWidth = 1 / k; x.beginPath(); for (let i = 0; i <= doc.w; i++) { x.moveTo(i, 0); x.lineTo(i, doc.h); } for (let j = 0; j <= doc.h; j++) { x.moveTo(0, j); x.lineTo(doc.w, j); } x.stroke(); }
    const sl = sel.current;
    if (sl) {
      x.lineWidth = 1 / k; x.setLineDash([4 / k, 3 / k]); x.strokeStyle = '#fff'; x.beginPath(); x.rect(sl.x, sl.y, sl.w, sl.h); x.stroke(); x.lineDashOffset = 4 / k; x.strokeStyle = '#000'; x.stroke(); x.setLineDash([]);
      if (sl.lasso && sl.pts && !sl.floating) { x.strokeStyle = '#000'; x.beginPath(); sl.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); }
      if (!sl.drawing) { x.fillStyle = '#fff'; x.strokeStyle = '#000'; for (const [hx, hy] of handles(sl)) { const r = 4 / k; x.beginPath(); x.rect(hx - r, hy - r, r * 2, r * 2); x.fill(); x.stroke(); } }
    }
    const hv = hover.current; if (hv && ['brush', 'pencil', 'eraser'].includes(p.tool) && !s.pan) { const r = Math.max(0.5, (p.tool === 'pencil' ? p.size * 0.3 : p.size / 2)); x.strokeStyle = '#000'; x.lineWidth = 1 / k; x.beginPath(); if (p.tool === 'eraser') x.rect(hv[0] - p.size / 2, hv[1] - p.size / 2, p.size, p.size); else x.arc(hv[0], hv[1], r, 0, 6.283); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 0.6 / k; x.stroke(); }
    x.restore();
  }, [doc]);
  const schedule = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(paint); }, [paint]);
  const handles = (sl) => { const { x, y, w, h } = sl; return [[x, y], [x + w / 2, y], [x + w, y], [x, y + h / 2], [x + w, y + h / 2], [x, y + h], [x + w / 2, y + h], [x + w, y + h]]; };

  useEffect(() => {
    if (!strokeCv.current) strokeCv.current = mk(doc.w, doc.h);
    const f = (structural) => { if (structural) { if (strokeCv.current.width !== doc.w || strokeCv.current.height !== doc.h) { strokeCv.current.width = doc.w; strokeCv.current.height = doc.h; } bump(); } schedule(); queueSave(); };
    doc.subs.add(f); schedule(); return () => doc.subs.delete(f);
  }, [doc, schedule]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { schedule(); }, [zoom, P.tool, P.size, P.fill, P.outline, P.shape, schedule]);

  /* ---------- autosave / load ---------- */
  const saveT = useRef(0);
  const queueSave = () => { clearTimeout(saveT.current); saveT.current = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(doc.serialize())); setSaveState('Autosaved in this browser'); } catch { setSaveState('Autosave off: image too large for browser storage. Use File › Save.'); } }, 1500); };
  useEffect(() => { (async () => { try { const raw = localStorage.getItem(LS); if (raw) { await doc.load(JSON.parse(raw)); setSaveState('Restored your last drawing'); } } catch { /* ignore */ } fit(true); })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- zoom ---------- */
  const setZoom = (z, anchor) => { const vp = viewport.current; const nz = Math.max(0.05, Math.min(32, z)); const old = live.current.zoom; if (vp && anchor) { const fx = (vp.scrollLeft + anchor[0]) / old; const fy = (vp.scrollTop + anchor[1]) / old; setZoomS(nz); setP({ zoom: nz }); requestAnimationFrame(() => { vp.scrollLeft = fx * nz - anchor[0]; vp.scrollTop = fy * nz - anchor[1]; }); } else { setZoomS(nz); setP({ zoom: nz }); } };
  const fit = (silent) => { const vp = viewport.current; if (!vp) return; const z = Math.min((vp.clientWidth - 40) / doc.w, (vp.clientHeight - 40) / doc.h, 1); setZoomS(Math.max(0.1, +z.toFixed(2))); if (!silent) setP({ zoom: Math.max(0.1, +z.toFixed(2)) }); };
  const stepZoom = (dir, anchor) => { const z = live.current.zoom; const next = dir > 0 ? ZOOMS.find((q) => q > z + 1e-6) || 32 : [...ZOOMS].reverse().find((q) => q < z - 1e-6) || 0.05; setZoom(next, anchor); };
  useEffect(() => { const vp = viewport.current; const w = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); const r = vp.getBoundingClientRect(); stepZoom(e.deltaY < 0 ? 1 : -1, [e.clientX - r.left, e.clientY - r.top]); } }; vp.addEventListener('wheel', w, { passive: false }); return () => vp.removeEventListener('wheel', w); }); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- helpers ---------- */
  const toImg = (e) => { const r = sheet.current.getBoundingClientRect(); return [(e.clientX - r.left) / live.current.zoom, (e.clientY - r.top) / live.current.zoom]; };
  const layerCtx = () => ctx2(doc.cur.canvas);
  const clampRect = (r) => { const x = Math.max(0, Math.floor(r.x)); const y = Math.max(0, Math.floor(r.y)); return { x, y, w: Math.min(doc.w, Math.ceil(r.x + r.w)) - x, h: Math.min(doc.h, Math.ceil(r.y + r.h)) - y }; };
  const union = (a, b) => { if (!a) return b; if (!b) return a; const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
  const eraseRegion = (ctx, layer, rect, path) => { if (layer.isBg) { ctx.save(); ctx.fillStyle = live.current.P.c2; if (path) ctx.fill(path); else ctx.fillRect(rect.x, rect.y, rect.w, rect.h); ctx.restore(); } else { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; if (path) ctx.fill(path); else ctx.fillRect(rect.x, rect.y, rect.w, rect.h); ctx.restore(); } };

  /* ---------- selection ---------- */
  const syncSelInfo = () => setSelInfo(sel.current ? { w: Math.round(sel.current.w), h: Math.round(sel.current.h) } : null);
  const commitSel = useCallback(() => {
    const sl = sel.current; if (!sl) return;
    if (sl.floating) { const ctx = layerCtx(); ctx.drawImage(sl.floating, sl.x, sl.y, sl.w, sl.h); const r = clampRect(union(sl.opRect, { x: sl.x, y: sl.y, w: sl.w, h: sl.h })); doc.endPx(r); }
    sel.current = null; setSelInfo(null); schedule();
  }, [doc, schedule]); // eslint-disable-line react-hooks/exhaustive-deps
  const lift = () => {
    const sl = sel.current; if (!sl || sl.floating) return; const L = doc.cur; doc.beginPx(L);
    const f = mk(sl.w, sl.h); const fx = f.getContext('2d'); let path = null;
    if (sl.lasso && sl.pts) { path = new Path2D(); sl.pts.forEach(([a, b], i) => (i ? path.lineTo(a, b) : path.moveTo(a, b))); path.closePath(); fx.save(); const rel = new Path2D(); sl.pts.forEach(([a, b], i) => (i ? rel.lineTo(a - sl.x, b - sl.y) : rel.moveTo(a - sl.x, b - sl.y))); rel.closePath(); fx.clip(rel); }
    fx.drawImage(L.canvas, sl.x, sl.y, sl.w, sl.h, 0, 0, sl.w, sl.h); if (path) fx.restore();
    eraseRegion(ctx2(L.canvas), L, { x: sl.x, y: sl.y, w: sl.w, h: sl.h }, path);
    sl.floating = f; sl.orig = f; sl.opRect = { x: sl.x, y: sl.y, w: sl.w, h: sl.h }; sl.pts = null; sl.lasso = false; schedule();
  };
  const dropFloating = (img) => { // paste
    commitSel(); const vp = viewport.current; const z = live.current.zoom; const x = Math.max(0, Math.min(doc.w - 1, Math.floor(vp.scrollLeft / z))); const y = Math.max(0, Math.min(doc.h - 1, Math.floor(vp.scrollTop / z)));
    const c = mk(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); doc.beginPx(doc.cur);
    if (c.width > doc.w || c.height > doc.h) { /* keep size; user can crop or canvas-size */ }
    sel.current = { x, y, w: c.width, h: c.height, floating: c, orig: c, opRect: { x, y, w: c.width, h: c.height } }; setP({ tool: 'select' }); syncSelInfo(); schedule();
  };
  const copySel = async (cut) => {
    const sl = sel.current; if (!sl) { toast('Select something first'); return; }
    let c; if (sl.floating) c = cloneCanvas(sl.floating); else { c = mk(sl.w, sl.h); c.getContext('2d').drawImage(doc.cur.canvas, sl.x, sl.y, sl.w, sl.h, 0, 0, sl.w, sl.h); }
    clip.current = c;
    try { const blob = await new Promise((r) => c.toBlob(r, 'image/png')); if (navigator.clipboard && window.ClipboardItem) await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]); } catch { /* internal clipboard still works */ }
    if (cut) deleteSel(); else toast('Copied');
  };
  const deleteSel = () => {
    const sl = sel.current; if (!sl) return;
    if (sl.floating) { doc.endPx(clampRect(sl.opRect)); sel.current = null; } else { const L = doc.cur; doc.beginPx(L); eraseRegion(ctx2(L.canvas), L, { x: sl.x, y: sl.y, w: sl.w, h: sl.h }, null); doc.endPx(clampRect(sl)); sel.current = null; }
    setSelInfo(null); schedule();
  };
  const pasteFromClipboard = async () => {
    if (clip.current) { dropFloating(clip.current); return; }
    try { const items = await navigator.clipboard.read(); for (const it of items) { const t = it.types.find((x) => x.startsWith('image/')); if (t) { const bmp = await createImageBitmap(await it.getType(t)); dropFloating(bmp); return; } } toast('There is no image on the clipboard'); } catch { toast('Press Ctrl+V to paste an image from the clipboard'); }
  };
  const transformSel = (kind) => {
    const sl = sel.current; if (!sl) return; if (!sl.floating) lift(); const f = sl.floating; const sw = sl.w; const shh = sl.h; let n;
    if (kind === 'flipH' || kind === 'flipV') { n = mk(sw, shh); const x = n.getContext('2d'); x.translate(kind === 'flipH' ? sw : 0, kind === 'flipV' ? shh : 0); x.scale(kind === 'flipH' ? -1 : 1, kind === 'flipV' ? -1 : 1); x.drawImage(f, 0, 0, sw, shh); }
    else { n = mk(shh, sw); const x = n.getContext('2d'); if (kind === 'cw') { x.translate(shh, 0); x.rotate(Math.PI / 2); } else { x.translate(0, sw); x.rotate(-Math.PI / 2); } x.drawImage(f, 0, 0, sw, shh); sl.w = shh; sl.h = sw; }
    sl.floating = n; sl.orig = n; schedule(); syncSelInfo();
  };
  const cropToSel = () => { const sl0 = sel.current; if (!sl0) { toast('Select an area to crop to'); return; } commitSelKeep(); };
  const commitSelKeep = () => { const sl = sel.current; const r = { x: Math.max(0, Math.round(sl.x)), y: Math.max(0, Math.round(sl.y)), w: Math.round(sl.w), h: Math.round(sl.h) }; commitSel(); r.w = Math.min(r.w, doc.w - r.x); r.h = Math.min(r.h, doc.h - r.y); if (r.w < 1 || r.h < 1) return; doc.docOp(() => { doc.layers.forEach((L) => { const t = cloneCanvas(L.canvas); L.canvas.width = r.w; L.canvas.height = r.h; L.canvas.getContext('2d').drawImage(t, -r.x, -r.y); }); doc.w = r.w; doc.h = r.h; }); requestAnimationFrame(() => fit()); };

  /* ---------- pointer ---------- */
  const startStroke = (pt, e, color) => {
    const p = live.current.P; const tool = p.tool; const L = doc.cur; if (!L.visible) { toast('The active layer is hidden'); return false; }
    commitSel(); commitText(); doc.beginPx(L);
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 1;
    const d = { type: 'stroke', tool, pts: [pt], prev: pt, mid: pt, last: pt, rect: { x: pt[0], y: pt[1], w: 0, h: 0 }, color, alpha: tool === 'eraser' ? 1 : p.opacity / 100, pressure };
    st.current.drag = d; const sc = strokeCv.current; sc.getContext('2d').clearRect(0, 0, sc.width, sc.height);
    if (tool === 'eraser') { eraseDot(pt); } else { dot(sc.getContext('2d'), p.brush === undefined || tool === 'pencil' ? 'pencil' : p.brush, pt, p.size, color, pressure); if (p.brush === 'airbrush' && tool === 'brush') { d.timer = setInterval(() => { strokeSeg(sc.getContext('2d'), 'airbrush', d.last, d.last, d.last, d.last, p.size, color, 1); grow(d, d.last, p.size); schedule(); }, 30); } }
    grow(d, pt, p.size); schedule(); return true;
  };
  const grow = (d, pt, size) => { const r = size * 1.6 + 4; const x0 = Math.min(d.rect.x, pt[0] - r); const y0 = Math.min(d.rect.y, pt[1] - r); const x1 = Math.max(d.rect.x + d.rect.w, pt[0] + r); const y1 = Math.max(d.rect.y + d.rect.h, pt[1] + r); d.rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  const eraseDot = (pt) => { const p = live.current.P; const L = doc.cur; const x = layerCtx(); x.save(); if (L.isBg) x.fillStyle = p.c2; else x.globalCompositeOperation = 'destination-out'; x.fillRect(pt[0] - p.size / 2, pt[1] - p.size / 2, p.size, p.size); x.restore(); };
  const moveStroke = (pt, e) => {
    const d = st.current.drag; const p = live.current.P; const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 1;
    if (d.tool === 'eraser') { const a = d.last; const n = Math.max(1, Math.ceil(Math.hypot(pt[0] - a[0], pt[1] - a[1]) / Math.max(1, p.size / 4))); for (let i = 1; i <= n; i++) eraseDot([a[0] + ((pt[0] - a[0]) * i) / n, a[1] + ((pt[1] - a[1]) * i) / n]); d.last = pt; grow(d, pt, p.size); schedule(); return; }
    const mid = [(d.last[0] + pt[0]) / 2, (d.last[1] + pt[1]) / 2]; const kind = d.tool === 'pencil' ? 'pencil' : p.brush;
    strokeSeg(strokeCv.current.getContext('2d'), kind, d.mid, mid, d.last, pt, p.size, d.color, pressure); d.mid = mid; d.last = pt; grow(d, pt, p.size); schedule();
  };
  const endStroke = () => {
    const d = st.current.drag; clearInterval(d.timer); const L = doc.cur;
    if (d.tool !== 'eraser') { const x = ctx2(L.canvas); const r = clampRect(d.rect); if (r.w > 0 && r.h > 0) { x.save(); x.globalAlpha = d.alpha; x.drawImage(strokeCv.current, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h); x.restore(); } strokeCv.current.getContext('2d').clearRect(0, 0, doc.w, doc.h); }
    st.current.drag = null; doc.endPx(clampRect(d.rect)); schedule();
  };
  const startText = (pt) => { commitSel(); commitText(); setText({ x: pt[0], y: pt[1], v: '' }); setTimeout(() => taRef.current && taRef.current.focus(), 0); };
  function commitText() {
    const t = live.current.text; if (!t) return; setText(null); if (!t.v.trim()) return;
    const p = live.current.P; const L = doc.cur; const ctx = ctx2(L.canvas); doc.beginPx(L);
    const font = `${p.italic ? 'italic ' : ''}${p.bold ? 'bold ' : ''}${p.fsize}px "${p.font}", sans-serif`; ctx.save(); ctx.font = font; ctx.textBaseline = 'top'; const lines = t.v.split('\n'); const lh = Math.round(p.fsize * 1.25); const wmax = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (p.tbg) { ctx.fillStyle = p.c2; ctx.fillRect(t.x, t.y, wmax + 4, lh * lines.length); }
    ctx.fillStyle = p.c1; lines.forEach((l, i) => { ctx.fillText(l, t.x + 2, t.y + i * lh); if (p.underline) { const w = ctx.measureText(l).width; ctx.fillRect(t.x + 2, t.y + i * lh + p.fsize * 1.05, w, Math.max(1, p.fsize / 16)); } });
    ctx.restore(); doc.endPx(clampRect({ x: t.x - 2, y: t.y - 2, w: wmax + 12, h: lh * lines.length + 8 })); schedule();
  }
  const pickColor = (pt, right) => { const c = cv.current.getContext('2d', { willReadFrequently: true }); const d = c.getImageData(Math.max(0, Math.min(doc.w - 1, Math.floor(pt[0]))), Math.max(0, Math.min(doc.h - 1, Math.floor(pt[1]))), 1, 1).data; const hex = d[3] === 0 ? '#ffffff' : rgbToHex(d[0], d[1], d[2]); setP(right ? { c2: hex } : { c1: hex }); setP({ tool: prevTool.current === 'picker' ? 'brush' : prevTool.current }); };
  const inSel = (pt) => { const s = sel.current; return s && pt[0] >= s.x && pt[0] <= s.x + s.w && pt[1] >= s.y && pt[1] <= s.y + s.h; };
  const hitHandle = (pt) => { const s = sel.current; if (!s) return -1; const r = 7 / live.current.zoom; return handles(s).findIndex(([hx, hy]) => Math.abs(pt[0] - hx) <= r && Math.abs(pt[1] - hy) <= r); };

  const onDown = (e) => {
    if (e.button === 1 || spaceDown.current) { e.preventDefault(); const vp = viewport.current; st.current.pan = { x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop }; sheet.current.setPointerCapture(e.pointerId); return; }
    if (e.button > 2) return; const p = live.current.P; const pt = toImg(e); const right = e.button === 2; const color = right ? p.c2 : p.c1; sheet.current.setPointerCapture(e.pointerId);
    if (live.current.text && p.tool !== 'text') commitText();
    switch (p.tool) {
      case 'brush': case 'pencil': case 'eraser': startStroke(pt, e, color); break;
      case 'fill': { const L = doc.cur; if (!L.visible) { toast('The active layer is hidden'); break; } commitSel(); commitText(); doc.beginPx(L); const r = floodFill(L.canvas, pt[0], pt[1], color, p.tol); doc.endPx(r); schedule(); break; }
      case 'picker': pickColor(pt, right); break;
      case 'magnify': { const r = viewport.current.getBoundingClientRect(); stepZoom(right ? -1 : 1, [e.clientX - r.left, e.clientY - r.top]); break; }
      case 'text': startText(pt); break;
      case 'shape': commitSel(); commitText(); doc.beginPx(doc.cur); st.current.drag = { type: 'shape', a: pt, b: pt, color: p.c1 === undefined ? '#000' : (right ? p.c2 : p.c1), fill: right ? p.c1 : p.c2, shift: e.shiftKey }; break;
      case 'select': {
        const h = sel.current ? hitHandle(pt) : -1;
        if (h >= 0) { if (!sel.current.floating) lift(); const s = sel.current; st.current.drag = { type: 'resize', h, ox: s.x, oy: s.y, ow: s.w, oh: s.h, src: s.orig || s.floating }; break; }
        if (inSel(pt)) { st.current.drag = { type: 'move', start: pt, sx: sel.current.x, sy: sel.current.y, moved: false }; break; }
        commitSel(); sel.current = { x: pt[0], y: pt[1], w: 0, h: 0, drawing: true, lasso: p.selMode === 'free', pts: [pt] }; st.current.drag = { type: 'marquee', a: pt }; break;
      }
      default: break;
    }
  };
  const onMove = (e) => {
    const pt = toImg(e); setPos([Math.floor(pt[0]), Math.floor(pt[1])]); hover.current = pt;
    const s = st.current; if (s.pan) { const vp = viewport.current; vp.scrollLeft = s.pan.sl - (e.clientX - s.pan.x); vp.scrollTop = s.pan.st - (e.clientY - s.pan.y); return; }
    const d = s.drag; const p = live.current.P;
    if (!d) { if (p.tool === 'select' && sel.current) { const h = hitHandle(pt); sheet.current.style.cursor = h >= 0 ? ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'ew-resize', 'nesw-resize', 'ns-resize', 'nwse-resize'][h] : inSel(pt) ? 'move' : 'crosshair'; } schedule(); return; }
    if (d.type === 'stroke') { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; (evs.length ? evs : [e]).forEach((ev) => moveStroke(toImg(ev), ev)); }
    else if (d.type === 'shape') { d.b = pt; d.shift = e.shiftKey; schedule(); }
    else if (d.type === 'marquee') { const sl = sel.current; sl.x = Math.max(0, Math.min(d.a[0], pt[0])); sl.y = Math.max(0, Math.min(d.a[1], pt[1])); sl.w = Math.min(doc.w, Math.max(d.a[0], pt[0])) - sl.x; sl.h = Math.min(doc.h, Math.max(d.a[1], pt[1])) - sl.y; if (sl.lasso) { sl.pts.push([Math.max(0, Math.min(doc.w, pt[0])), Math.max(0, Math.min(doc.h, pt[1]))]); const xs = sl.pts.map((q) => q[0]); const ys = sl.pts.map((q) => q[1]); sl.x = Math.min(...xs); sl.y = Math.min(...ys); sl.w = Math.max(...xs) - sl.x; sl.h = Math.max(...ys) - sl.y; } setSelInfo({ w: Math.round(sl.w), h: Math.round(sl.h) }); schedule(); }
    else if (d.type === 'move') { if (!d.moved && Math.hypot(pt[0] - d.start[0], pt[1] - d.start[1]) * live.current.zoom < 3) return; if (!d.moved) { d.moved = true; if (!sel.current.floating) lift(); } const sl = sel.current; sl.x = d.sx + (pt[0] - d.start[0]); sl.y = d.sy + (pt[1] - d.start[1]); schedule(); }
    else if (d.type === 'resize') { const sl = sel.current; let { ox: x0, oy: y0 } = d; let x1 = d.ox + d.ow; let y1 = d.oy + d.oh; const hh = d.h; if ([0, 3, 5].includes(hh)) x0 = Math.min(pt[0], x1 - 1); if ([2, 4, 7].includes(hh)) x1 = Math.max(pt[0], x0 + 1); if ([0, 1, 2].includes(hh)) y0 = Math.min(pt[1], y1 - 1); if ([5, 6, 7].includes(hh)) y1 = Math.max(pt[1], y0 + 1); sl.x = x0; sl.y = y0; sl.w = x1 - x0; sl.h = y1 - y0; schedule(); syncSelInfo(); }
  };
  const onUp = (e) => {
    const s = st.current; if (s.pan) { s.pan = null; return; } const d = s.drag; if (!d) return; s.drag = null; const p = live.current.P;
    if (d.type === 'stroke') { s.drag = d; endStroke(); }
    else if (d.type === 'shape') { const L = doc.cur; const x = ctx2(L.canvas); const pt = toImg(e); if (Math.hypot(pt[0] - d.a[0], pt[1] - d.a[1]) < 1) { doc.endPx(null); doc._b = null; schedule(); return; } drawShape(x, p.shape, d.a, pt, { stroke: d.color, fill: d.fill, useFill: p.fill, width: p.size, outline: p.outline, constrain: e.shiftKey }); const pad = p.size + 6; doc.endPx(clampRect({ x: Math.min(d.a[0], pt[0]) - pad, y: Math.min(d.a[1], pt[1]) - pad, w: Math.abs(pt[0] - d.a[0]) + pad * 2, h: Math.abs(pt[1] - d.a[1]) + pad * 2 })); schedule(); }
    else if (d.type === 'marquee') { const sl = sel.current; sl.drawing = false; if (sl.w < 2 || sl.h < 2) { sel.current = null; setSelInfo(null); } else { sl.x = Math.round(sl.x); sl.y = Math.round(sl.y); sl.w = Math.round(sl.w); sl.h = Math.round(sl.h); if (sl.lasso && sl.pts) sl.pts = sl.pts.map(([a, b]) => [Math.round(a), Math.round(b)]); syncSelInfo(); } schedule(); }
    else if (d.type === 'resize') { const sl = sel.current; const n = mk(Math.max(1, Math.round(sl.w)), Math.max(1, Math.round(sl.h))); const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(d.src, 0, 0, n.width, n.height); sl.floating = n; sl.orig = n; sl.w = n.width; sl.h = n.height; sl.opRect = union(sl.opRect, { x: sl.x, y: sl.y, w: sl.w, h: sl.h }); schedule(); }
    else if (d.type === 'move') { const sl = sel.current; if (sl.floating) sl.opRect = union(sl.opRect, { x: sl.x, y: sl.y, w: sl.w, h: sl.h }); }
  };

  /* ---------- keyboard / paste / drop ---------- */
  useEffect(() => {
    const kd = (e) => {
      const tag = e.target.tagName; const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'; const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      if (e.key === ' ' && !typing) { spaceDown.current = true; e.preventDefault(); return; }
      if (e.key === 'Escape') { if (live.current.text) { setText(null); return; } if (sel.current) { commitSel(); return; } }
      if (typing || (e.target.closest && e.target.closest('.fx-modal'))) { if (mod && k === 'enter' && live.current.text) commitText(); return; }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); commitSel(); doc.undo(); }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); doc.redo(); }
      else if (mod && k === 'c') { if (sel.current) { e.preventDefault(); copySel(false); } }
      else if (mod && k === 'x') { if (sel.current) { e.preventDefault(); copySel(true); } }
      else if (mod && k === 'a') { e.preventDefault(); commitSel(); sel.current = { x: 0, y: 0, w: doc.w, h: doc.h }; setP({ tool: 'select' }); syncSelInfo(); schedule(); }
      else if (mod && k === 's') { e.preventDefault(); setModal({ kind: 'save' }); }
      else if (mod && k === 'n') { e.preventDefault(); newDoc(); }
      else if (mod && k === 'o') { e.preventDefault(); openFile(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.current) { e.preventDefault(); deleteSel(); } }
      else if (e.key === 'Enter' && sel.current) { commitSel(); }
      else if (!mod && e.key === '[') setP({ size: Math.max(1, live.current.P.size - 1) });
      else if (!mod && e.key === ']') setP({ size: Math.min(100, live.current.P.size + 1) });
      else if (!mod && (e.key === '+' || e.key === '=')) stepZoom(1);
      else if (!mod && e.key === '-') stepZoom(-1);
      else if (sel.current && e.key.startsWith('Arrow')) { e.preventDefault(); if (!sel.current.floating) lift(); const n = e.shiftKey ? 10 : 1; sel.current.x += e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0; sel.current.y += e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0; sel.current.opRect = union(sel.current.opRect, { x: sel.current.x, y: sel.current.y, w: sel.current.w, h: sel.current.h }); schedule(); }
    };
    const ku = (e) => { if (e.key === ' ') spaceDown.current = false; };
    const paste = async (e) => { const t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return; const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); dropFloating(await createImageBitmap(f)); } else if (clip.current) { e.preventDefault(); dropFloating(clip.current); } };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('paste', paste);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('paste', paste); };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (P.tool !== 'select') commitSel(); if (P.tool !== 'text') commitText(); }, [P.tool]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- file ---------- */
  const confirmDiscard = async () => (!doc.dirty || doc.undoS.length === 0 ? true : ask({ title: 'Start over?', message: 'Your current drawing has changes. It is autosaved in this browser, but opening or creating something new replaces it. Save a copy first if you want to keep it.', okText: 'Continue', danger: true }));
  const newDoc = async (w, h, bg) => { if (w === undefined) { setModal({ kind: 'new' }); return; } commitPendingAll(); if (!(await confirmDiscard())) return; doc.reset(w, h, bg); sel.current = null; setSelInfo(null); setText(null); requestAnimationFrame(() => fit()); setModal(null); };
  const commitPendingAll = () => { commitText(); commitSel(); };
  const loadFile = async (f) => {
    try {
      if (/\.json$|\.tpaint$/i.test(f.name) || f.type === 'application/json') { const o = JSON.parse(await f.text()); if (o.kind !== 'techomato-paint' || !o.doc) throw new Error('bad'); if (!(await confirmDiscard())) return; await doc.load(o.doc); }
      else { if (!(await confirmDiscard())) return; const url = URL.createObjectURL(f); const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); if (img.naturalWidth > 8000 || img.naturalHeight > 8000) { URL.revokeObjectURL(url); toast('That image is too large (max 8000 px per side)'); return; } await doc.loadImage(img, f.name); URL.revokeObjectURL(url); }
      sel.current = null; setSelInfo(null); requestAnimationFrame(() => fit()); toast(`Opened ${f.name}`);
    } catch { toast('Could not open that file'); }
  };
  const openFile = async () => { commitPendingAll(); const f = await pickFile('image/*,.json,.tpaint'); if (f) loadFile(f); };
  const exportImage = async (name, fmt, quality) => {
    commitPendingAll(); const flat = doc.flatten(fmt === 'png' ? null : '#ffffff'); const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
    const blob = await new Promise((r) => flat.toBlob(r, mime, quality / 100)); if (!blob) { toast('This browser cannot save that format'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safeName(name)}.${fmt === 'jpeg' ? 'jpg' : fmt}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); doc.name = name; doc.dirty = false; toast(`Saved ${a.download} (${Math.round(blob.size / 1024)} KB)`); setModal(null);
  };
  const saveProject = () => { commitPendingAll(); const blob = new Blob([JSON.stringify({ kind: 'techomato-paint', doc: doc.serialize() })], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safeName(doc.name)}.tpaint.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); doc.dirty = false; toast('Project saved with all layers'); setModal(null); };
  const copyImage = async () => { commitPendingAll(); try { const blob = await new Promise((r) => doc.flatten(null).toBlob(r, 'image/png')); await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]); toast('Image copied to clipboard'); } catch { toast('This browser blocked clipboard access'); } };
  const printIt = () => { commitPendingAll(); const url = doc.flatten('#ffffff').toDataURL('image/png'); const img = document.createElement('img'); img.src = url; img.className = 'pnt-print'; document.body.appendChild(img); document.body.classList.add('pnt-printing'); setTimeout(() => { window.print(); setTimeout(() => { img.remove(); document.body.classList.remove('pnt-printing'); }, 500); }, 100); };

  /* ---------- image ops ---------- */
  const transformAll = (fn, nw, nh) => { commitPendingAll(); doc.docOp(() => { doc.layers.forEach((L) => { const t = cloneCanvas(L.canvas); L.canvas.width = nw(doc.w, doc.h); L.canvas.height = nh(doc.w, doc.h); const x = L.canvas.getContext('2d'); x.save(); fn(x, t, doc.w, doc.h); x.restore(); }); const w = nw(doc.w, doc.h); const h = nh(doc.w, doc.h); doc.w = w; doc.h = h; }); requestAnimationFrame(() => fit()); };
  const rotate = (kind) => { if (kind === 'cw') transformAll((x, t, w, h) => { x.translate(h, 0); x.rotate(Math.PI / 2); x.drawImage(t, 0, 0); }, (w, h) => h, (w) => w); else if (kind === 'ccw') transformAll((x, t, w, h) => { x.translate(0, w); x.rotate(-Math.PI / 2); x.drawImage(t, 0, 0); }, (w, h) => h, (w) => w); else transformAll((x, t, w, h) => { x.translate(w, h); x.rotate(Math.PI); x.drawImage(t, 0, 0); }, (w) => w, (w, h) => h); };
  const flip = (axis) => transformAll((x, t, w, h) => { x.translate(axis === 'h' ? w : 0, axis === 'v' ? h : 0); x.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1); x.drawImage(t, 0, 0); }, (w) => w, (w, h) => h);
  const resizeImage = (nw, nh) => transformAll((x, t) => { x.imageSmoothingQuality = 'high'; x.drawImage(t, 0, 0, nw, nh); }, () => nw, () => nh);
  const canvasSize = (nw, nh) => { commitPendingAll(); doc.docOp(() => { doc.layers.forEach((L) => { const t = cloneCanvas(L.canvas); L.canvas.width = nw; L.canvas.height = nh; const x = L.canvas.getContext('2d'); if (L.isBg) { x.fillStyle = P.c2; x.fillRect(0, 0, nw, nh); } x.drawImage(t, 0, 0); }); doc.w = nw; doc.h = nh; }); requestAnimationFrame(() => fit()); };
  const filterLayer = (kind) => { commitPendingAll(); const L = doc.cur; doc.beginPx(L); pixelFilter(L.canvas, kind); doc.endPx({ x: 0, y: 0, w: doc.w, h: doc.h }); };
  const applyAdjustments = (a) => { commitPendingAll(); const L = doc.cur; doc.beginPx(L); applyAdjust(L.canvas, a); doc.endPx({ x: 0, y: 0, w: doc.w, h: doc.h }); preview.current = null; schedule(); };

  /* ---------- layers ---------- */
  const addLayer = () => { commitPendingAll(); doc.docOp(() => { const L = doc.makeLayer(`Layer ${doc.layers.length + 1}`); const i = doc.layers.findIndex((l) => l.id === doc.active); doc.layers.splice(i + 1, 0, L); doc.active = L.id; }); };
  const dupLayer = () => { commitPendingAll(); doc.docOp(() => { const c = doc.cur; const L = doc.makeLayer(c.name + ' copy'); L.canvas.getContext('2d').drawImage(c.canvas, 0, 0); L.opacity = c.opacity; L.blend = c.blend; const i = doc.layers.indexOf(c); doc.layers.splice(i + 1, 0, L); doc.active = L.id; }); };
  const delLayer = () => { if (doc.layers.length <= 1) { toast('An image needs at least one layer'); return; } commitPendingAll(); doc.docOp(() => { const i = doc.layers.indexOf(doc.cur); doc.layers.splice(i, 1); doc.active = doc.layers[Math.max(0, i - 1)].id; }); };
  const mergeDown = () => { const i = doc.layers.indexOf(doc.cur); if (i <= 0) { toast('There is no layer below to merge into'); return; } commitPendingAll(); doc.docOp(() => { const top = doc.layers[i]; const bot = doc.layers[i - 1]; const x = bot.canvas.getContext('2d'); x.save(); x.globalAlpha = top.opacity; x.globalCompositeOperation = top.blend; x.drawImage(top.canvas, 0, 0); x.restore(); doc.layers.splice(i, 1); doc.active = bot.id; }); };
  const moveLayer = (dir) => { const i = doc.layers.indexOf(doc.cur); const j = i + dir; if (j < 0 || j >= doc.layers.length) return; commitPendingAll(); doc.docOp(() => { const [L] = doc.layers.splice(i, 1); doc.layers.splice(j, 0, L); }); };
  const flattenAll = () => { if (doc.layers.length <= 1) return; commitPendingAll(); doc.docOp(() => { const flat = doc.flatten(null); const bg = doc.layers[0]; bg.canvas.getContext('2d').clearRect(0, 0, doc.w, doc.h); bg.canvas.getContext('2d').drawImage(flat, 0, 0); bg.opacity = 1; bg.blend = 'source-over'; bg.visible = true; doc.layers = [bg]; doc.active = bg.id; }); };
  const setLayer = (L, patch, finish, before) => { const prev = before || Object.fromEntries(Object.keys(patch).map((k) => [k, L[k]])); Object.assign(L, patch); if (finish) { const next = { ...patch }; doc.push({ undo: () => Object.assign(L, prev), redo: () => Object.assign(L, next) }); } else { doc.touch(false); schedule(); bump(); } };
  const propBefore = useRef(null);

  /* ---------- render ---------- */
  const tool = P.tool; const L = doc.cur; const can = { u: doc.canUndo(), r: doc.canRedo() };
  const toolBtn = (id, ic, label) => <Rb key={id} icon={ic} label={label} on={tool === id} onClick={() => { if (id !== 'picker') prevTool.current = tool; setP({ tool: id }); }} />;
  const sizeOpts = (
    <div className="pnt-opts" role="group" aria-label="Tool options">
      {['brush', 'pencil', 'eraser', 'shape'].includes(tool) && <label className="pnt-opt">Size<input type="range" min="1" max="100" value={P.size} aria-label="Size" onChange={(e) => setP({ size: +e.target.value })} /><b>{P.size}px</b></label>}
      {['brush', 'pencil'].includes(tool) && <label className="pnt-opt">Opacity<input type="range" min="5" max="100" value={P.opacity} aria-label="Opacity" onChange={(e) => setP({ opacity: +e.target.value })} /><b>{P.opacity}%</b></label>}
      {tool === 'brush' && <Pop trigger={({ toggle }) => <button className="fb sm" onClick={toggle}>{BRUSHES.find((b) => b[0] === P.brush)[1]}<Icon name="chevronDown" size={12} /></button>} width={220}>{({ close }) => <div>{BRUSHES.map(([k, n]) => <button key={k} className="fx-row" onClick={() => { setP({ brush: k }); close(); }}>{P.brush === k ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{n}</button>)}</div>}</Pop>}
      {tool === 'fill' && <label className="pnt-opt">Tolerance<input type="range" min="0" max="100" value={P.tol} aria-label="Fill tolerance" onChange={(e) => setP({ tol: +e.target.value })} /><b>{P.tol}%</b></label>}
      {tool === 'shape' && <><label className="chk"><input type="checkbox" checked={P.outline} onChange={(e) => setP({ outline: e.target.checked })} />Outline</label><label className="chk"><input type="checkbox" checked={P.fill} onChange={(e) => setP({ fill: e.target.checked })} />Fill (colour 2)</label><span className="muted" style={{ fontSize: 12 }}>Hold Shift for squares, circles and 45° lines</span></>}
      {tool === 'text' && <><select className="fi pnt-sm" aria-label="Font" value={P.font} onChange={(e) => setP({ font: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select><input type="number" min="6" max="300" className="fi pnt-sm" style={{ width: 64 }} aria-label="Font size" value={P.fsize} onChange={(e) => setP({ fsize: Math.max(6, +e.target.value || 6) })} /><Rb icon="bold" label="Bold" on={P.bold} onClick={() => setP({ bold: !P.bold })} /><Rb icon="italic" label="Italic" on={P.italic} onClick={() => setP({ italic: !P.italic })} /><Rb icon="underline" label="Underline" on={P.underline} onClick={() => setP({ underline: !P.underline })} /><label className="chk"><input type="checkbox" checked={P.tbg} onChange={(e) => setP({ tbg: e.target.checked })} />Opaque (colour 2)</label></>}
      {tool === 'select' && <><div className="fx-seg"><button className={P.selMode === 'rect' ? 'on' : ''} onClick={() => setP({ selMode: 'rect' })}>Rectangle</button><button className={P.selMode === 'free' ? 'on' : ''} onClick={() => setP({ selMode: 'free' })}>Free-form</button></div>
        <button className="fb sm" onClick={() => { commitSel(); sel.current = { x: 0, y: 0, w: doc.w, h: doc.h }; syncSelInfo(); schedule(); }}>Select all</button>
        <button className="fb sm" disabled={!selInfo} onClick={cropToSel}><Icon name="crop" size={14} />Crop</button>
        <button className="fb sm" disabled={!selInfo} onClick={() => transformSel('cw')}><Icon name="rotate" size={14} />Rotate</button><button className="fb sm" disabled={!selInfo} onClick={() => transformSel('flipH')}><Icon name="flipH" size={14} />Flip H</button><button className="fb sm" disabled={!selInfo} onClick={() => transformSel('flipV')}><Icon name="flipV" size={14} />Flip V</button>
        <button className="fb sm danger" disabled={!selInfo} onClick={deleteSel}><Icon name="trash" size={14} />Delete</button></>}
    </div>
  );
  const hasSel = !!selInfo;
  return (
    <div className="fx pnt" style={{ '--brand': '#0f7b6c' }}>
      <AppBar id="paint" name="Techomato Paint" status={saveState.startsWith('Autosave off') ? 'error' : undefined} backup={{ name: 'paint', get: () => ({ kind: 'techomato-paint', doc: doc.serialize() }), set: async (v) => { try { await doc.load(v.doc); requestAnimationFrame(() => fit()); } catch { toast('Could not restore that backup'); } }, blank: () => ({ kind: 'techomato-paint', doc: (() => { const d = new Doc(1024, 640, '#fff'); return d.serialize(); })() }) }}
        extraMenu={[{ label: 'New...', onClick: () => newDoc() }, { label: 'Open image or project...', onClick: openFile }, { label: 'Save as image...', onClick: () => setModal({ kind: 'save' }) }, { label: 'Save project with layers (.json)', onClick: saveProject }, { label: 'Copy image to clipboard', onClick: copyImage }, { label: 'Print', onClick: printIt }]} />
      <div className="pnt-tabs" role="tablist">
        {['home', 'view'].map((t) => <button key={t} role="tab" aria-selected={P.tab === t} className={P.tab === t ? 'on' : ''} onClick={() => setP({ tab: t })}>{t === 'home' ? 'Home' : 'View'}</button>)}
        <span className="spacer" /><div className="pnt-fileq"><Rb icon="newPage" label="New (Ctrl+N)" onClick={() => newDoc()} /><Rb icon="upload" label="Open (Ctrl+O)" onClick={openFile} /><Rb icon="download" label="Save as image (Ctrl+S)" onClick={() => setModal({ kind: 'save' })} /><Rb icon="undo" label="Undo (Ctrl+Z)" disabled={!can.u} onClick={() => { commitSel(); doc.undo(); }} /><Rb icon="redo" label="Redo (Ctrl+Y)" disabled={!can.r} onClick={() => doc.redo()} /></div>
      </div>
      {P.tab === 'home' ? (
        <div className="pnt-ribbon" role="toolbar" aria-label="Home">
          <div className="pnt-g"><div className="pnt-gb"><Rb big icon="paste" label="Paste" onClick={pasteFromClipboard}><span>Paste</span></Rb><div className="pnt-col"><Rb icon="scissors" label="Cut (Ctrl+X)" disabled={!hasSel} onClick={() => copySel(true)} /><Rb icon="copy" label="Copy (Ctrl+C)" disabled={!hasSel} onClick={() => copySel(false)} /></div></div><div className="pnt-gl">Clipboard</div></div>
          <div className="pnt-g"><div className="pnt-gb"><Rb big icon="select" label="Select" on={tool === 'select'} onClick={() => setP({ tool: 'select' })}><span>Select</span></Rb>
            <div className="pnt-col"><Rb icon="crop" label="Crop to selection" disabled={!hasSel} onClick={cropToSel} /><Rb icon="sliders" label="Resize and canvas size" onClick={() => setModal({ kind: 'resize' })} /></div>
            <Pop trigger={({ toggle }) => <Rb big icon="rotate" label="Rotate and flip" onClick={toggle}><span>Rotate <Icon name="chevronDown" size={10} /></span></Rb>} width={210}>{({ close }) => <div>{[['Rotate right 90°', () => rotate('cw'), 'rotate'], ['Rotate left 90°', () => rotate('ccw'), 'rotate'], ['Rotate 180°', () => rotate('180'), 'rotate'], ['Flip vertical', () => flip('v'), 'flipV'], ['Flip horizontal', () => flip('h'), 'flipH']].map(([n, f, ic]) => <button key={n} className="fx-row" onClick={() => { f(); close(); }}><Icon name={ic} size={15} />{n}</button>)}</div>}</Pop>
            <Pop trigger={({ toggle }) => <Rb big icon="sparkles" label="Effects" onClick={toggle}><span>Effects <Icon name="chevronDown" size={10} /></span></Rb>} width={220}>{({ close }) => <div><button className="fx-row" onClick={() => { setModal({ kind: 'adjust' }); close(); }}><Icon name="sliders" size={15} />Adjust (brightness, blur…)</button>{[['invert', 'Invert colours'], ['gray', 'Black and white'], ['sepia', 'Sepia']].map(([k, n]) => <button key={k} className="fx-row" onClick={() => { filterLayer(k); close(); }}><Icon name="palette" size={15} />{n}</button>)}</div>}</Pop></div><div className="pnt-gl">Image</div></div>
          <div className="pnt-g"><div className="pnt-gb pnt-tools">{TOOLS.filter((t) => !['select', 'brush', 'shape'].includes(t[0])).map(([id, ic, n]) => toolBtn(id, ic, n))}</div><div className="pnt-gl">Tools</div></div>
          <div className="pnt-g"><div className="pnt-gb">{toolBtn('brush', 'brush', 'Brushes')}<Pop trigger={({ toggle }) => <Rb big icon="brush" label="Brush type" on={tool === 'brush'} onClick={toggle}><span>{BRUSHES.find((b) => b[0] === P.brush)[1].split(' ')[0]} <Icon name="chevronDown" size={10} /></span></Rb>} width={230}>{({ close }) => <div>{BRUSHES.map(([k, n]) => <button key={k} className="fx-row" onClick={() => { setP({ brush: k, tool: 'brush' }); close(); }}>{P.brush === k && tool === 'brush' ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{n}</button>)}</div>}</Pop></div><div className="pnt-gl">Brushes</div></div>
          <div className="pnt-g"><div className="pnt-gb pnt-shapes" role="group" aria-label="Shapes">{SHAPES.map(([k, n]) => <button key={k} className={'pnt-sh' + (tool === 'shape' && P.shape === k ? ' on' : '')} title={n} aria-label={n} onMouseDown={(e) => e.preventDefault()} onClick={() => setP({ tool: 'shape', shape: k })}><ShapeThumb kind={k} /></button>)}</div><div className="pnt-gl">Shapes</div></div>
          <div className="pnt-g"><div className="pnt-gb">
            <Pop trigger={({ toggle }) => <Rb big icon="sliders" label="Size" onClick={toggle}><span>Size <Icon name="chevronDown" size={10} /></span></Rb>} width={170}>{({ close }) => <div>{SIZES.map((s) => <button key={s} className="fx-row" onClick={() => { setP({ size: s }); close(); }}><span className="pnt-szbar" style={{ height: Math.min(s, 14) }} />{s}px{P.size === s && <Icon name="check" size={13} />}</button>)}</div>}</Pop></div><div className="pnt-gl">Size</div></div>
          <div className="pnt-g wide"><div className="pnt-gb">
            <div className="pnt-cols"><Pop trigger={({ toggle }) => <button className="pnt-cc" onClick={toggle} aria-label="Colour 1" title="Colour 1 (left click)"><i style={{ background: P.c1 }} /><span>Colour 1</span></button>} width={236}>{({ close }) => <ColorEditor value={P.c1} onChange={(c) => setP({ c1: c })} custom={P.custom} onAdd={(c) => setP({ custom: [c, ...P.custom.filter((x) => x !== c)].slice(0, 10) })} close={close} />}</Pop>
              <Pop trigger={({ toggle }) => <button className="pnt-cc" onClick={toggle} aria-label="Colour 2" title="Colour 2 (right click)"><i style={{ background: P.c2 }} /><span>Colour 2</span></button>} width={236}>{({ close }) => <ColorEditor value={P.c2} onChange={(c) => setP({ c2: c })} custom={P.custom} onAdd={(c) => setP({ custom: [c, ...P.custom.filter((x) => x !== c)].slice(0, 10) })} close={close} />}</Pop>
              <button className="pnt-swap" aria-label="Swap colours" title="Swap colours" onClick={() => setP({ c1: P.c2, c2: P.c1 })}><Icon name="swap" size={14} /></button></div>
            <div className="pnt-pal" role="group" aria-label="Colour palette">{[...PALETTE, ...P.custom].map((c, i) => <button key={c + i} className={'pnt-sw' + (c === P.c1 ? ' c1' : '')} style={{ background: c }} aria-label={`Colour ${c}`} title={c} onMouseDown={(e) => e.preventDefault()} onClick={() => setP({ c1: c })} onContextMenu={(e) => { e.preventDefault(); setP({ c2: c }); }} />)}</div>
          </div><div className="pnt-gl">Colours</div></div>
        </div>
      ) : (
        <div className="pnt-ribbon" role="toolbar" aria-label="View">
          <div className="pnt-g"><div className="pnt-gb"><Rb big icon="zoomIn" label="Zoom in" onClick={() => stepZoom(1)}><span>Zoom in</span></Rb><Rb big icon="zoomOut" label="Zoom out" onClick={() => stepZoom(-1)}><span>Zoom out</span></Rb><Rb big icon="fullscreen" label="Fit to window" onClick={() => fit()}><span>Fit</span></Rb><Rb big icon="image" label="Actual size" onClick={() => setZoom(1)}><span>100%</span></Rb></div><div className="pnt-gl">Zoom</div></div>
          <div className="pnt-g"><div className="pnt-gb" style={{ alignItems: 'center' }}><label className="chk"><input type="checkbox" checked={P.showGrid !== false} onChange={(e) => setP({ showGrid: e.target.checked })} />Pixel grid (zoom 800%+)</label><label className="chk"><input type="checkbox" checked={P.layers} onChange={(e) => setP({ layers: e.target.checked })} />Layers panel</label></div><div className="pnt-gl">Show</div></div>
          <div className="pnt-g"><div className="pnt-gb"><Rb big icon="trash" label="Clear the active layer" onClick={() => { commitPendingAll(); const C = doc.cur; doc.beginPx(C); eraseRegion(ctx2(C.canvas), C, { x: 0, y: 0, w: doc.w, h: doc.h }); doc.endPx({ x: 0, y: 0, w: doc.w, h: doc.h }); }}><span>Clear layer</span></Rb></div><div className="pnt-gl">Layer</div></div>
        </div>
      )}
      <div className="pnt-optbar">{sizeOpts}</div>
      <div className="pnt-main">
        <div className="pnt-viewport" ref={viewport} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}>
          <div className="pnt-pad" style={{ width: Math.max(doc.w * zoom + 40, 0), height: doc.h * zoom + 40 }}>
            <div className="pnt-sheet" ref={sheet} style={{ width: doc.w * zoom, height: doc.h * zoom, cursor: tool === 'magnify' ? 'zoom-in' : tool === 'picker' ? 'copy' : tool === 'text' ? 'text' : 'crosshair' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { hover.current = null; setPos(null); schedule(); }} onContextMenu={(e) => e.preventDefault()}>
              <canvas ref={cv} className="pnt-cv" width={doc.w} height={doc.h} style={{ imageRendering: zoom >= 2 ? 'pixelated' : 'auto' }} />
              <canvas ref={ov} className="pnt-ov" />
              {text && <textarea ref={taRef} className="pnt-text" aria-label="Text" value={text.v} placeholder="Type here" onChange={(e) => setText({ ...text, v: e.target.value })} style={{ left: text.x * zoom, top: text.y * zoom, fontSize: P.fsize * zoom, fontFamily: `"${P.font}", sans-serif`, fontWeight: P.bold ? 700 : 400, fontStyle: P.italic ? 'italic' : 'normal', textDecoration: P.underline ? 'underline' : 'none', color: P.c1, background: P.tbg ? P.c2 : 'transparent', lineHeight: 1.25 }} rows={Math.max(1, text.v.split('\n').length)} onPointerDown={(e) => e.stopPropagation()} />}
            </div>
          </div>
        </div>
        {P.layers && (
          <aside className="pnt-layers" aria-label="Layers">
            <div className="pnt-lh"><b>Layers</b><span className="spacer" /><button className="fb sub ico sm" aria-label="Add layer" title="Add layer" onClick={addLayer}><Icon name="plus" size={15} /></button><button className="fb sub ico sm" aria-label="Duplicate layer" title="Duplicate layer" onClick={dupLayer}><Icon name="copy" size={15} /></button><button className="fb sub ico sm" aria-label="Delete layer" title="Delete layer" onClick={delLayer}><Icon name="trash" size={15} /></button></div>
            <div className="pnt-ll">{[...doc.layers].reverse().map((l) => <LayerRow key={l.id} l={l} active={l.id === doc.active} onSelect={() => { commitPendingAll(); doc.active = l.id; doc.touch(false); bump(); }} onToggle={() => setLayer(l, { visible: !l.visible }, true)} onRename={async () => { const n = await ask({ kind: 'prompt', title: 'Rename layer', value: l.name }); if (n && n.trim()) setLayer(l, { name: n.trim().slice(0, 40) }, true); }} ver={doc.ver} />)}</div>
            <div className="pnt-lp">
              <label>Opacity <b>{Math.round(L.opacity * 100)}%</b></label>
              <input type="range" min="0" max="100" value={Math.round(L.opacity * 100)} aria-label="Layer opacity" onPointerDown={() => { propBefore.current = { opacity: L.opacity }; }} onChange={(e) => { const v = +e.target.value / 100; if (propBefore.current) setLayer(L, { opacity: v }); else setLayer(L, { opacity: v }, true); }} onPointerUp={() => { if (propBefore.current) { const b = propBefore.current; propBefore.current = null; setLayer(L, { opacity: L.opacity }, true, b); } }} />
              <label>Blend mode</label>
              <select className="fi" value={L.blend} aria-label="Blend mode" onChange={(e) => setLayer(L, { blend: e.target.value }, true)}>{BLENDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
              <div className="pnt-lbtns"><button className="fb sm" onClick={() => moveLayer(1)}><Icon name="arrowUp" size={13} />Up</button><button className="fb sm" onClick={() => moveLayer(-1)}><Icon name="arrowDown" size={13} />Down</button><button className="fb sm" onClick={mergeDown}>Merge down</button><button className="fb sm" onClick={flattenAll}>Flatten</button></div>
            </div>
          </aside>
        )}
      </div>
      <div className="pnt-status">
        <span>{pos ? `${pos[0]}, ${pos[1]} px` : ' '}</span><span>{selInfo ? `Selection ${selInfo.w} × ${selInfo.h}` : ''}</span><span>{doc.w} × {doc.h} px</span><span className="spacer" /><span className="muted pnt-ss">{saveState}</span>
        <button className="fb sub ico sm" aria-label="Zoom out" onClick={() => stepZoom(-1)}><Icon name="minus" size={13} /></button>
        <input type="range" min="-100" max="100" value={Math.round(Math.log(zoom) / Math.log(32) * 100)} aria-label="Zoom" style={{ width: 110 }} onChange={(e) => setZoom(Math.exp((+e.target.value / 100) * Math.log(32)))} />
        <button className="fb sub ico sm" aria-label="Zoom in" onClick={() => stepZoom(1)}><Icon name="plus" size={13} /></button><b className="pnt-zl">{Math.round(zoom * 100)}%</b>
      </div>
      {modal && modal.kind === 'new' && <NewDialog onClose={() => setModal(null)} onOk={(w, h, bg) => newDoc(w, h, bg)} c2={P.c2} />}
      {modal && modal.kind === 'save' && <SaveDialog name={doc.name} layers={doc.layers.length} onClose={() => setModal(null)} onSave={exportImage} onProject={saveProject} onCopy={copyImage} />}
      {modal && modal.kind === 'resize' && <ResizeDialog w={doc.w} h={doc.h} onClose={() => setModal(null)} onResize={(w, h) => { resizeImage(w, h); setModal(null); }} onCanvas={(w, h) => { canvasSize(w, h); setModal(null); }} />}
      {modal && modal.kind === 'adjust' && <AdjustDialog onClose={() => { preview.current = null; schedule(); setModal(null); }} onPreview={(a) => { preview.current = a ? cssFilter(a) : null; schedule(); }} onOk={(a) => { applyAdjustments(a); setModal(null); }} />}
      {toastNode}{askNode}
    </div>
  );
}

function LayerRow({ l, active, onSelect, onToggle, onRename, ver }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current; const x = c.getContext('2d'); x.clearRect(0, 0, 40, 30); const k = Math.min(40 / l.canvas.width, 30 / l.canvas.height); const w = l.canvas.width * k; const h = l.canvas.height * k; x.drawImage(l.canvas, (40 - w) / 2, (30 - h) / 2, w, h); }, [ver, l]);
  return (
    <div className={'pnt-lr' + (active ? ' on' : '')} onClick={onSelect} role="button" tabIndex={0} aria-label={`Layer ${l.name}`} aria-pressed={active} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }} onDoubleClick={onRename}>
      <button className="fb sub ico sm" aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} onClick={(e) => { e.stopPropagation(); onToggle(); }}><Icon name={l.visible ? 'eye' : 'eyeOff'} size={15} /></button>
      <canvas ref={ref} width="40" height="30" className="pnt-lt" />
      <span className="ellip grow">{l.name}</span>
    </div>
  );
}
function ColorEditor({ value, onChange, custom, onAdd, close }) {
  const [hex, setHex] = useState(value); const [r, g, b] = hexToRgb(hex);
  const apply = (h) => { setHex(h); if (/^#[0-9a-f]{6}$/i.test(h)) onChange(h); };
  return (
    <div className="pnt-ce">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'} aria-label="Colour picker" onChange={(e) => apply(e.target.value)} className="pnt-cpick" />
      <div className="fx-kv" style={{ gridTemplateColumns: '38px 1fr' }}><label>Hex</label><input className="fi" value={hex} aria-label="Hex colour" onChange={(e) => apply(e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value)} maxLength={7} />
        {[['R', r, 0], ['G', g, 1], ['B', b, 2]].map(([n, v, i]) => [<label key={n}>{n}</label>, <input key={n + 'i'} type="range" min="0" max="255" value={v} aria-label={`${n} channel`} onChange={(e) => { const c = [r, g, b]; c[i] = +e.target.value; apply(rgbToHex(...c)); }} />])}</div>
      <div className="pnt-ce-f"><button className="fb sm" onClick={() => { if (/^#[0-9a-f]{6}$/i.test(hex)) onAdd(hex); }}>Add to custom colours</button><button className="fb pri sm" onClick={close}>Done</button></div>
    </div>
  );
}
function NewDialog({ onClose, onOk, c2 }) {
  const [w, setW] = useState(1024); const [h, setH] = useState(640); const [bg, setBg] = useState('white');
  return (
    <Modal title="New image" onClose={onClose} width={440} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!(w >= 1 && h >= 1 && w <= 8000 && h <= 8000)} onClick={() => onOk(w, h, bg === 'white' ? '#ffffff' : bg === 'c2' ? c2 : null)}>Create</button></>}>
      <div className="pnt-presets">{PRESETS.map(([n, pw, ph]) => <button key={n} className={'fx-chip' + (w === pw && h === ph ? ' on' : '')} onClick={() => { setW(pw); setH(ph); }}>{n}</button>)}</div>
      <div className="fx-kv" style={{ marginTop: 12 }}><label>Width</label><input type="number" className="fi" min="1" max="8000" value={w} aria-label="Width" onChange={(e) => setW(+e.target.value | 0)} /><label>Height</label><input type="number" className="fi" min="1" max="8000" value={h} aria-label="Height" onChange={(e) => setH(+e.target.value | 0)} />
        <label>Background</label><select className="fi" value={bg} aria-label="Background" onChange={(e) => setBg(e.target.value)}><option value="white">White</option><option value="c2">Colour 2</option><option value="none">Transparent</option></select></div>
    </Modal>
  );
}
function SaveDialog({ name, layers, onClose, onSave, onProject, onCopy }) {
  const [n, setN] = useState(name); const [fmt, setFmt] = useState('png'); const [q, setQ] = useState(92);
  return (
    <Modal title="Save" onClose={onClose} width={440} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onSave(n || 'Untitled', fmt, q)}>Save image</button></>}>
      <div className="fx-kv"><label>File name</label><input className="fi" autoFocus value={n} aria-label="File name" onChange={(e) => setN(e.target.value)} />
        <label>Format</label><select className="fi" value={fmt} aria-label="Format" onChange={(e) => setFmt(e.target.value)}><option value="png">PNG (keeps transparency)</option><option value="jpeg">JPEG (smaller, white background)</option><option value="webp">WebP (small, transparency)</option></select>
        {fmt !== 'png' && <><label>Quality</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="range" min="30" max="100" value={q} aria-label="Quality" onChange={(e) => setQ(+e.target.value)} style={{ flex: 1 }} /><b>{q}%</b></div></>}</div>
      <div className="fx-sep" style={{ margin: '14px 0' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="fb" onClick={onProject}>Save project with {layers} layer{layers === 1 ? '' : 's'} (.json)</button><button className="fb" onClick={onCopy}>Copy to clipboard</button></div>
    </Modal>
  );
}
function ResizeDialog({ w, h, onClose, onResize, onCanvas }) {
  const [mode, setMode] = useState('scale'); const [nw, setNw] = useState(w); const [nh, setNh] = useState(h); const [lock, setLock] = useState(true); const [pct, setPct] = useState(100);
  const ratio = w / h;
  return (
    <Modal title="Resize and canvas size" onClose={onClose} width={440} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!(nw >= 1 && nh >= 1 && nw <= 8000 && nh <= 8000)} onClick={() => (mode === 'scale' ? onResize(nw, nh) : onCanvas(nw, nh))}>OK</button></>}>
      <div className="fx-seg" style={{ width: 'fit-content', marginBottom: 12 }}><button className={mode === 'scale' ? 'on' : ''} onClick={() => setMode('scale')}>Resize (scale picture)</button><button className={mode === 'canvas' ? 'on' : ''} onClick={() => setMode('canvas')}>Canvas size (crop or extend)</button></div>
      {mode === 'scale' && <div className="fx-kv" style={{ marginBottom: 8 }}><label>Percent</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="number" className="fi" style={{ width: 90 }} min="1" max="800" value={pct} aria-label="Percent" onChange={(e) => { const p = +e.target.value || 1; setPct(p); setNw(Math.round((w * p) / 100)); setNh(Math.round((h * p) / 100)); }} />%</div></div>}
      <div className="fx-kv"><label>Width</label><input type="number" className="fi" value={nw} min="1" max="8000" aria-label="New width" onChange={(e) => { const v = +e.target.value | 0; setNw(v); if (lock && mode === 'scale') setNh(Math.max(1, Math.round(v / ratio))); }} /><label>Height</label><input type="number" className="fi" value={nh} min="1" max="8000" aria-label="New height" onChange={(e) => { const v = +e.target.value | 0; setNh(v); if (lock && mode === 'scale') setNw(Math.max(1, Math.round(v * ratio))); }} /></div>
      {mode === 'scale' && <label className="chk" style={{ marginTop: 8 }}><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />Maintain aspect ratio</label>}
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{mode === 'scale' ? `Currently ${w} × ${h} px. Every layer is scaled.` : 'The picture stays where it is. A bigger canvas adds space on the right and bottom; a smaller one crops.'}</p>
    </Modal>
  );
}
function AdjustDialog({ onClose, onPreview, onOk }) {
  const [a, setA] = useState({ brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0 });
  useEffect(() => { if (supportsFilter) onPreview(a); }, [a]); // eslint-disable-line react-hooks/exhaustive-deps
  const row = (k, label, min, max, unit = '') => <><label>{label}</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="range" min={min} max={max} value={a[k]} aria-label={label} onChange={(e) => setA({ ...a, [k]: +e.target.value })} style={{ flex: 1 }} /><b style={{ minWidth: 48, textAlign: 'right' }}>{a[k]}{unit}</b></div></>;
  return (
    <Modal title="Adjust active layer" onClose={onClose} width={420} footer={<><button className="fb" style={{ marginRight: 'auto' }} onClick={() => setA({ brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0 })}>Reset</button><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!supportsFilter} onClick={() => onOk(a)}>Apply</button></>}>
      {!supportsFilter && <div className="fx-note">This browser doesn't support live image filters. Invert, black and white and sepia still work from the Effects menu.</div>}
      <div className="fx-kv" style={{ gridTemplateColumns: '100px 1fr' }}>{row('brightness', 'Brightness', 0, 200, '%')}{row('contrast', 'Contrast', 0, 200, '%')}{row('saturate', 'Saturation', 0, 300, '%')}{row('hue', 'Hue', -180, 180, '°')}{row('blur', 'Blur', 0, 20, 'px')}</div>
    </Modal>
  );
}
