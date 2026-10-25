import { memo, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast, useAsk } from '../components/fxui.jsx';
import { StudioMenu, ToolBtn, Num, Row, ColorField, useHotkeys, useRaf, clamp } from '../components/studio.jsx';
import { useStore } from '../lib/useStore.js';
import { idbGet, idbSet } from '../lib/idb.js';
import { downloadFile, pickFile, safeName, readAsText } from '../lib/download.js';
import { PDoc, mk, ctxOf, cloneCanvas, textBox, defaultStyle } from './photo/doc.js';
import { ADJUSTMENTS, ADJ_ORDER, adjDefaults, autoLevels, hexRgb } from './photo/adjust.js';
import { FILTERS, FILTER_GROUPS } from './photo/filters.js';
import { makeTip, strokeSeg, rectSel, polySel, magicWand, colorRange, edgeCanvas, gradientFill, blurredCopy, sharpenedCopy, toneCopy, paintFrom, pickColor, drawTransformed, transformCorners } from './photo/engine.js';
import { LayersPanel, PropertiesPanel, HistoryPanel, ColorPanel, NavigatorPanel, HistogramPanel } from './photo/Panels.jsx';
import { NewDocDialog, ExportDialog, ImageSizeDialog, CanvasSizeDialog, EffectDialog, StyleDialog, ShortcutsDialog } from './photo/Dialogs.jsx';
import '../styles/photo.css';

const TOOLS = [
  ['move', 'move', 'Move', 'V'], ['marquee', 'rectSel', 'Marquee', 'M'], ['lasso', 'lasso', 'Lasso', 'L'], ['wand', 'wand', 'Magic wand', 'W'], ['crop', 'crop', 'Crop', 'C'], ['eyedropper', 'pipette', 'Eyedropper', 'I'], null,
  ['brush', 'brush', 'Brush', 'B'], ['eraser', 'eraser', 'Eraser', 'E'], ['clone', 'stamp', 'Clone stamp', 'S'], ['retouch', 'blurDrop', 'Blur / sharpen / smudge', 'R'], ['tone', 'sunDim', 'Dodge / burn', 'O'], ['gradient', 'gradient', 'Gradient', 'G'], ['bucket', 'bucket', 'Paint bucket', 'K'], null,
  ['text', 'textT', 'Type', 'T'], ['shape', 'shapesIco', 'Shape', 'U'], null, ['hand', 'hand', 'Hand', 'H'], ['zoom', 'magnify', 'Zoom', 'Z'],
];
const KEYMAP = Object.fromEntries(TOOLS.filter(Boolean).map((t) => [t[3].toLowerCase(), t[0]]));
const defaults = () => ({ tool: 'brush', fg: '#000000', bg: '#ffffff', size: 40, hardness: 70, opacity: 100, spacing: 20, tol: 32, contiguous: true, sampleAll: false, feather: 0, marq: 'rect', lassoMode: 'free', selMode: 'new', retouch: 'blur', tone: 'dodge', strength: 50, gradKind: 'linear', gradTrans: false, gradRev: false, shape: 'rect', shapeSw: 0, fontSize: 72, aligned: true, grid: false });
const lum = (hex) => { const [r, g, b] = hexRgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b; };
const MLayers = memo(LayersPanel, (a, b) => a.doc === b.doc && a.ver === b.ver);
const MHistory = memo(HistoryPanel, (a, b) => a.doc === b.doc && a.ver === b.ver);
const MProps = memo(PropertiesPanel, (a, b) => a.doc === b.doc && a.ver === b.ver);

function sampleCanvas(w = 1200, h = 800) {
  const c = mk(w, h), g = c.getContext('2d'); const sky = g.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, '#2b5fa8'); sky.addColorStop(0.55, '#f2a65a'); sky.addColorStop(1, '#ffe2a8'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.68, h * 0.52, 0, w * 0.68, h * 0.52, h * 0.3); sun.addColorStop(0, '#fff8d8'); sun.addColorStop(0.25, '#ffe27a'); sun.addColorStop(1, 'rgba(255,200,100,0)'); g.fillStyle = sun; g.fillRect(0, 0, w, h);
  const hill = (col, y, amp, ph) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / w * 5 + ph) * amp + Math.sin(x / w * 13 + ph) * amp * 0.25); g.lineTo(w, h); g.closePath(); g.fill(); };
  hill('#7d5a6e', h * 0.62, 36, 0.4); hill('#4d3b5c', h * 0.72, 44, 1.7); hill('#25233f', h * 0.84, 38, 3.1);
  g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 70; i++) { g.globalAlpha = Math.random() * 0.8; g.beginPath(); g.arc(Math.random() * w, Math.random() * h * 0.35, Math.random() * 1.6 + 0.4, 0, 7); g.fill(); } g.globalAlpha = 1;
  return c;
}

export default function PhotoApp() {
  const [prefs, setPrefs] = useStore('photo-prefs', defaults, (v) => ({ ...defaults(), ...v }));
  const o = prefs; const setO = useCallback((patch) => setPrefs((s) => ({ ...s, ...patch })), [setPrefs]);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk();
  const [doc, setDoc] = useState(() => new PDoc(1200, 800, '#ffffff')); const [name, setName] = useState('Untitled');
  const [, bump] = useReducer((x) => x + 1, 0);
  const wrap = useRef(null); const cv = useRef(null); const [vp, setVp] = useState({ w: 800, h: 600 });
  const [view, setViewS] = useState({ x: 40, y: 40, z: 1 }); const V = useRef(view); const setView = useCallback((v) => { V.current = v; setViewS(v); dirty.current = true; }, []);
  const S = useRef({ fv: 0 }); const dirty = useRef(true); const hover = useRef(null); const spaceDown = useRef(false); const clip = useRef(null); const compRef = useRef({ key: '', c: null }); const ants = useRef({ key: '', edge: null }); const lastBrush = useRef(null); const cloneSrc = useRef(null); const checker = useRef(null); const stripe = useRef(null);
  const [dlg, setDlg] = useState(null); const [cropOn, setCropOn] = useState(false); const [xfOn, setXfOn] = useState(false); const [pos, setPos] = useState(null); const [fileDrop, setFileDrop] = useState(false); const [save, setSave] = useState('');
  const [welcome, setWelcome] = useState(true);
  const L0 = useRef({}); L0.current = { o, doc, toast, view, vp, name };

  /* ---------- doc wiring ---------- */
  const raf1 = useRef(0);
  useEffect(() => { doc.onTouch = () => { dirty.current = true; if (!raf1.current) raf1.current = requestAnimationFrame(() => { raf1.current = 0; bump(); }); }; return () => { doc.onTouch = null; }; }, [doc]);
  const fit = useCallback((d = L0.current.doc, v = L0.current.vp) => { const z = Math.min((v.w - 60) / d.w, (v.h - 60) / d.h, 1); const zz = z > 0 ? z : 1; setView({ z: zz, x: (v.w - d.w * zz) / 2, y: (v.h - d.h * zz) / 2 }); }, [setView]);
  useEffect(() => { const el = wrap.current; const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setVp({ w: Math.round(r.width), h: Math.round(r.height) }); dirty.current = true; }); ro.observe(el); return () => ro.disconnect(); }, []);
  const firstFit = useRef(false);
  useEffect(() => { if (!firstFit.current && vp.w > 100) { firstFit.current = true; fit(doc, vp); } }, [vp, doc, fit]);
  const loadDoc = useCallback((d, nm) => { S.current = { fv: 0 }; setCropOn(false); setXfOn(false); lastBrush.current = null; setDoc(d); if (nm) setName(nm); setWelcome(false); setTimeout(() => fit(d, L0.current.vp), 0); }, [fit]);

  /* ---------- autosave (IndexedDB) ---------- */
  const saveTimer = useRef(0); const restored = useRef(false);
  useEffect(() => {
    if (!restored.current) return undefined; if (!doc.dirty) return undefined; clearTimeout(saveTimer.current); setSave('Unsaved changes');
    saveTimer.current = setTimeout(async () => { try { setSave('Saving…'); const json = await doc.toJSON(); const ok = await idbSet('photo-project', { name: L0.current.name, json }); setSave(ok ? 'Autosaved' : 'Autosave unavailable'); } catch { setSave('Autosave failed'); } }, 2000);
    return () => clearTimeout(saveTimer.current);
  }, [doc, doc.ver]); // eslint-disable-line
  useEffect(() => { (async () => { try { const r = await idbGet('photo-project'); if (r && r.json && r.json.layers && r.json.layers.length) { const d = await PDoc.fromJSON(r.json); loadDoc(d, r.name || 'Untitled'); toast('Restored your last project'); setWelcome(false); } } catch { /* ignore */ } restored.current = true; })(); }, []); // eslint-disable-line

  /* ---------- helpers ---------- */
  const askConfirm = async (title, message, okText = 'Continue') => ask({ title, message, okText });
  const guardDirty = async () => (!doc.dirty || doc.hi === 0 ? true : askConfirm('Discard changes?', 'The current document has unsaved edits. Replace it?', 'Replace'));
  const newDoc = async (spec) => { const d = new PDoc(spec.w, spec.h, spec.bg); loadDoc(d, spec.name || 'Untitled'); setDlg(null); };
  const fromImageFile = (f) => new Promise((res, rej) => { const url = URL.createObjectURL(f); const im = new Image(); im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(url), 5000); }; im.onerror = () => rej(new Error('bad image')); im.src = url; });
  const openFile = async (f, asLayer) => {
    try {
      if (/\.json$/i.test(f.name) || f.type === 'application/json') { const o2 = JSON.parse(await readAsText(f)); if (o2.kind !== 'techomato-photo') throw new Error('x'); const d = await PDoc.fromJSON(o2); loadDoc(d, f.name.replace(/\.(photo\.)?json$/i, '')); return; }
      const im = await fromImageFile(f);
      if (asLayer && !welcome) { const c = mk(im.naturalWidth, im.naturalHeight); ctxOf(c).drawImage(im, 0, 0); const k = Math.min(1, doc.w / c.width, doc.h / c.height); const cc = k < 1 ? mk(Math.round(c.width * k), Math.round(c.height * k)) : c; if (k < 1) ctxOf(cc).drawImage(c, 0, 0, cc.width, cc.height); doc.addFromCanvas(cc, safeName(f.name.replace(/\.[^.]+$/, '')), Math.round((doc.w - cc.width) / 2), Math.round((doc.h - cc.height) / 2)); toast('Placed image as a new layer'); }
      else { const d = PDoc.fromImage(im, safeName(f.name.replace(/\.[^.]+$/, ''))); d.layers[0].name = 'Background'; loadDoc(d, safeName(f.name.replace(/\.[^.]+$/, ''))); }
    } catch { toast('That file could not be opened'); }
  };
  const openDialog = async () => { if (!(await guardDirty())) return; const f = await pickFile('image/*,.json'); if (f) openFile(f, false); };
  const placeDialog = async () => { const f = await pickFile('image/*'); if (f) openFile(f, true); };
  const saveProject = async () => { const json = await doc.toJSON(); downloadFile(`${safeName(name)}.photo.json`, JSON.stringify(json), 'application/json'); doc.dirty = false; toast('Project saved'); };
  const exportImage = async ({ fmt, q, scale, matte }) => {
    const c = doc.composite(); let out = c; if (scale !== 1 || fmt === 'jpeg') { out = mk(Math.round(doc.w * scale), Math.round(doc.h * scale)); const g = ctxOf(out); if (fmt === 'jpeg') { g.fillStyle = matte; g.fillRect(0, 0, out.width, out.height); } g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, out.width, out.height); }
    const blob = await new Promise((r) => out.toBlob(r, `image/${fmt}`, q)); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safeName(name)}.${fmt === 'jpeg' ? 'jpg' : fmt}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); setDlg(null); toast(`Exported ${a.download}`);
  };
  const lockedMsg = () => { toast('This layer is locked'); return null; };
  /* the canvas a pixel tool should edit: {L, which, canvas} */
  const target = () => {
    const L = doc.active; if (!L) return null; if (L.locked) return lockedMsg();
    if (L.mask && (doc.maskEdit || L.type === 'adjust')) return { L, which: 'mask', canvas: L.mask };
    if (L.type === 'adjust') { toast('Adjustment layers can only be painted through their mask'); return null; }
    if (L.type !== 'raster') { doc.rasterize(L); toast('Layer rasterized'); }
    return { L, which: 'canvas', canvas: L.canvas };
  };
  const sampleSource = () => (o.sampleAll || doc.active.type === 'adjust' ? compRef.current.c || doc.composite() : doc.surface(doc.active));
  const selMode = (e) => (e.shiftKey && e.altKey ? 'int' : e.shiftKey ? 'add' : e.altKey ? 'sub' : o.selMode);
  const clipToSel = (tok) => { if (!doc.sel) return; const t = tok.target, g = ctxOf(t); const cur = cloneCanvas(t); const keep = cloneCanvas(tok.pre); const kg = keep.getContext('2d'); kg.globalCompositeOperation = 'destination-out'; kg.drawImage(doc.sel, 0, 0); const cg = cur.getContext('2d'); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(doc.sel, 0, 0); g.clearRect(0, 0, t.width, t.height); g.drawImage(keep, 0, 0); g.drawImage(cur, 0, 0); };
  const pt = (e) => { const r = cv.current.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; const v = V.current; return { sx, sy, x: (sx - v.x) / v.z, y: (sy - v.y) / v.z }; };
  const zoomAt = useCallback((f, sx, sy) => { const v = V.current; const z = clamp(v.z * f, 0.02, 32); const k = z / v.z; const cx = sx ?? L0.current.vp.w / 2, cy = sy ?? L0.current.vp.h / 2; setView({ z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }); }, [setView]);
  const zoomTo = (z) => zoomAt(z / V.current.z);

  /* ---------- free transform / move ---------- */
  const xfBegin = (auto) => {
    const tg = target(); if (!tg) return false; if (tg.which === 'mask') { toast('Transforming a mask is not supported — select the layer, not its mask'); return false; }
    const L = tg.L, src = L.canvas; const selB = doc.sel ? doc.selectionBounds() : null; const part = cloneCanvas(src);
    if (doc.sel) { const g = part.getContext('2d'); g.globalCompositeOperation = 'destination-in'; g.drawImage(doc.sel, 0, 0); }
    const b = selB || doc.selectionBounds(part); if (!b) { toast('Nothing to transform on this layer'); return false; }
    const crop = (c) => { const n = mk(b.w, b.h); n.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); return n; };
    const rest = cloneCanvas(src); if (doc.sel) { const g = rest.getContext('2d'); g.globalCompositeOperation = 'destination-out'; g.drawImage(doc.sel, 0, 0); } else ctxOf(rest).clearRect(0, 0, rest.width, rest.height);
    S.current.xf = { L, tok: doc.beginPx(L, 'canvas'), rest, moving: crop(part), selMoving: doc.sel ? crop(doc.sel) : null, T: { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, sx: 1, sy: 1, rot: 0 }, auto, drag: null, hasSel: !!doc.sel };
    doc.busy = true; setXfOn(!auto); return true;
  };
  const xfRender = () => { const x = S.current.xf; const g = ctxOf(x.L.canvas); g.clearRect(0, 0, x.L.canvas.width, x.L.canvas.height); g.drawImage(x.rest, 0, 0); drawTransformed(g, x.moving, x.T); S.current.fv++; dirty.current = true; };
  const xfCommit = (label = 'Free transform') => {
    const x = S.current.xf; if (!x) return; xfRender(); const oldSel = doc.sel; let newSel = oldSel;
    if (x.selMoving) { newSel = mk(doc.w, doc.h); drawTransformed(ctxOf(newSel), x.selMoving, x.T); doc.sel = newSel; doc.selVer++; }
    doc.endPx(x.tok, label, null, { undo: () => { doc.sel = oldSel; doc.selVer++; }, redo: () => { doc.sel = newSel; doc.selVer++; } }); S.current.xf = null; doc.busy = false; setXfOn(false); doc.touch();
  };
  const xfCancel = () => { const x = S.current.xf; if (!x) return; const g = ctxOf(x.L.canvas); g.clearRect(0, 0, x.L.canvas.width, x.L.canvas.height); g.drawImage(x.tok.pre, 0, 0); S.current.xf = null; S.current.fv++; doc.busy = false; setXfOn(false); doc.touch(); };
  const startTransform = () => { if (S.current.xf) return; const L = doc.active; if (L && (L.type === 'text' || L.type === 'shape')) { if (L.locked) return lockedMsg(); doc.rasterize(L); } if (xfBegin(false)) { dirty.current = true; bump(); } };
  const xfPatch = (patch) => { const x = S.current.xf; if (!x) return; Object.assign(x.T, patch); xfRender(); bump(); };
  const local = (T, p) => { const c = Math.cos(-T.rot), s = Math.sin(-T.rot); const dx = p.x - T.cx, dy = p.y - T.cy; return { x: dx * c - dy * s, y: dx * s + dy * c }; };
  const HDIR = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const xfDown = (p, e) => {
    const x = S.current.xf, T = x.T; const hs = transformCorners(T); const v = V.current; let hi = -1;
    hs.forEach((h, i) => { if (Math.hypot(h.x * v.z + v.x - p.sx, h.y * v.z + v.y - p.sy) < 9) hi = i; });
    const lp = local(T, p); const hw = (T.w * T.sx) / 2, hh = (T.h * T.sy) / 2;
    if (hi >= 0) x.drag = { type: 'scale', hi, T0: { ...T }, shift: e.shiftKey };
    else if (Math.abs(lp.x) <= hw && Math.abs(lp.y) <= hh) x.drag = { type: 'move', p0: p, T0: { ...T } };
    else x.drag = { type: 'rot', a0: Math.atan2(p.y - T.cy, p.x - T.cx), T0: { ...T } };
  };
  const xfMove = (p, e) => {
    const x = S.current.xf, d = x.drag; if (!d) return; const T = x.T;
    if (d.type === 'move') { T.cx = d.T0.cx + (p.x - d.p0.x); T.cy = d.T0.cy + (p.y - d.p0.y); }
    else if (d.type === 'rot') { let r = d.T0.rot + (Math.atan2(p.y - T.cy, p.x - T.cx) - d.a0); if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12); T.rot = r; }
    else {
      const [hx, hy] = HDIR[d.hi], T0 = d.T0; const lp = local(T0, p); const hw0 = (T0.w * T0.sx) / 2, hh0 = (T0.h * T0.sy) / 2; const alt = e.altKey;
      let nsx = T0.sx, nsy = T0.sy, ox = 0, oy = 0;
      if (hx) { const w2 = alt ? Math.abs(lp.x) * 2 : (lp.x - -hx * hw0) * hx; nsx = Math.max(0.02, w2 / T0.w); ox = alt ? 0 : (-hx * hw0 + lp.x) / 2; }
      if (hy) { const h2 = alt ? Math.abs(lp.y) * 2 : (lp.y - -hy * hh0) * hy; nsy = Math.max(0.02, h2 / T0.h); oy = alt ? 0 : (-hy * hh0 + lp.y) / 2; }
      if ((e.shiftKey || d.shift) && hx && hy) { const k = Math.max(nsx / T0.sx, nsy / T0.sy); nsx = T0.sx * k; nsy = T0.sy * k; const wN = (nsx * T0.w) / 2, hN = (nsy * T0.h) / 2; ox = alt ? 0 : -hx * hw0 + hx * wN; oy = alt ? 0 : -hy * hh0 + hy * hN; }
      T.sx = nsx; T.sy = nsy; const c = Math.cos(T0.rot), s = Math.sin(T0.rot); T.cx = T0.cx + ox * c - oy * s; T.cy = T0.cy + ox * s + oy * c;
    }
    xfRender();
  };

  /* ---------- tools ---------- */
  const strokeBegin = (p, e) => {
    const tool = o.tool; const tg = target(); if (!tg) return; const { L, which, canvas } = tg; const tok = doc.beginPx(L, which);
    const mask = which === 'mask'; const sz = Math.max(1, o.size); const col = mask ? '#ffffff' : o.fg; const tip = makeTip(sz, tool === 'retouch' || tool === 'tone' || tool === 'clone' ? Math.min(o.hardness, 60) : o.hardness, col);
    const st = { tool, tg, tok, mask, tip, spacing: Math.max(1, (sz * o.spacing) / 100), carry: 0, last: p, bbox: { x0: p.x, y0: p.y, x1: p.x, y1: p.y }, direct: mask || !['brush', 'eraser'].includes(tool) };
    const erase = tool === 'eraser' || (mask && tool === 'brush' && lum(o.fg) < 128);
    st.erase = erase; st.alpha = o.opacity / 100;
    if (tool === 'brush' && e.shiftKey && lastBrush.current && !mask) st.last = lastBrush.current;
    if (!st.direct) { st.sc = mk(doc.w, doc.h); st.scg = ctxOf(st.sc); st.scg.drawImage(tok.pre, 0, 0, 0, 0); }
    if (tool === 'retouch') { st.mode = o.retouch; st.src = o.retouch === 'blur' ? blurredCopy(tok.pre, 3 + sz / 25) : o.retouch === 'sharpen' ? sharpenedCopy(tok.pre, 1.6, 1.4) : null; }
    if (tool === 'tone') st.src = toneCopy(tok.pre, o.tone === 'dodge' ? 0.7 : -0.7);
    if (tool === 'clone') { if (!cloneSrc.current) { toast('Alt-click to choose the source area first'); return; } st.src = o.sampleAll ? cloneCanvas(compRef.current.c) : cloneCanvas(tok.pre); st.off = st.aligned = null; const cs = cloneSrc.current; if (o.aligned && cs.off) st.off = cs.off; else { st.off = { x: cs.x - p.x, y: cs.y - p.y }; cs.off = st.off; } }
    S.current.stroke = st; doc.busy = true; strokeMove(p, true); return st;
  };
  const strokeMove = (p, first) => {
    const st = S.current.stroke; if (!st) return; const g = ctxOf(st.tg.canvas); const a = first ? st.last : st.last; const b = p;
    const bb = st.bbox; bb.x0 = Math.min(bb.x0, b.x); bb.y0 = Math.min(bb.y0, b.y); bb.x1 = Math.max(bb.x1, b.x); bb.y1 = Math.max(bb.y1, b.y);
    const flow = st.alpha;
    if (!st.direct) { st.carry = strokeSeg(st.scg, st.tip, a, b, st.spacing, st.carry); st.last = b; const fl = { layerId: st.tg.L.id, canvas: st.sc, alpha: st.alpha, op: st.erase ? 'destination-out' : 'source-over' }; if (doc.sel) { const c2 = cloneCanvas(st.sc); const cg = c2.getContext('2d'); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(doc.sel, 0, 0); fl.canvas = c2; } S.current.float = fl; S.current.fv++; dirty.current = true; return; }
    const tipN = st.tip.width;
    const each = (x, y) => {
      if (st.tool === 'brush' || st.tool === 'eraser') { g.save(); g.globalAlpha = flow * (st.mask ? 0.6 : 1); g.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over'; g.drawImage(st.tip, x - tipN / 2, y - tipN / 2); g.restore(); }
      else if (st.tool === 'retouch' && st.mode === 'smudge') { const n = tipN; const t = mk(n, n), tg2 = t.getContext('2d'); tg2.drawImage(g.canvas, st.last.x - n / 2, st.last.y - n / 2, n, n, 0, 0, n, n); tg2.globalCompositeOperation = 'destination-in'; tg2.drawImage(st.tip, 0, 0); g.save(); g.globalAlpha = Math.min(1, (o.strength / 100) * 0.9); g.drawImage(t, x - n / 2, y - n / 2); g.restore(); }
      else if (st.tool === 'retouch' || st.tool === 'tone') paintFrom(g, st.src, st.tip, x, y, Math.min(1, (o.strength / 100) * 0.5));
      else if (st.tool === 'clone') paintFrom(g, st.src, st.tip, x, y, flow, st.off.x, st.off.y);
    };
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); let d = st.carry; while (d <= len) { const t = len ? d / len : 0; each(a.x + dx * t, a.y + dy * t); if (st.tool === 'retouch' && st.mode === 'smudge') st.last = { x: a.x + dx * t, y: a.y + dy * t }; d += st.spacing; } st.carry = d - len; if (!(st.tool === 'retouch' && st.mode === 'smudge')) st.last = b; else st.last = st.last || b;
    S.current.fv++; dirty.current = true;
  };
  const strokeEnd = () => {
    const st = S.current.stroke; if (!st) return; S.current.stroke = null; S.current.float = null; const pad = st.tip.width + 2; const bb = st.bbox; const rect = { x: bb.x0 - pad, y: bb.y0 - pad, w: bb.x1 - bb.x0 + pad * 2, h: bb.y1 - bb.y0 + pad * 2 };
    if (!st.direct) {
      const g = ctxOf(st.tg.canvas); let sc = st.sc; if (doc.sel) { sc = cloneCanvas(sc); const cg = sc.getContext('2d'); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(doc.sel, 0, 0); }
      g.save(); g.globalAlpha = st.alpha; g.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over'; g.drawImage(sc, 0, 0); g.restore();
    } else clipToSel(st.tok);
    doc.endPx(st.tok, { brush: 'Brush', eraser: 'Eraser', clone: 'Clone stamp', retouch: o.retouch[0].toUpperCase() + o.retouch.slice(1), tone: o.tone[0].toUpperCase() + o.tone.slice(1) }[st.tool] || 'Paint', rect);
    if (st.tool === 'brush') lastBrush.current = st.last; doc.busy = false; doc.touch();
  };
  const fillThrough = (m, color, label) => {
    const tg = target(); if (!tg) return; const mask = tg.which === 'mask'; const hex = color; const rev = mask && lum(hex) < 128;
    doc.editLayer(label, (src) => { const sg = ctxOf(src); const f = cloneCanvas(m); const fg = f.getContext('2d'); fg.globalCompositeOperation = 'source-in'; fg.fillStyle = mask ? '#fff' : hex; fg.fillRect(0, 0, f.width, f.height); sg.save(); sg.globalCompositeOperation = rev ? 'destination-out' : 'source-over'; sg.drawImage(f, 0, 0); sg.restore(); return src; }, tg.L);
  };
  const applyGradient = (a, b) => {
    const tg = target(); if (!tg) return; if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return; const mask = tg.which === 'mask';
    let gr = gradientFill(doc.w, doc.h, a, b, o.gradKind, o.fg, o.bg, { transparent: o.gradTrans && !mask, reverse: o.gradRev });
    if (mask) { const g = ctxOf(gr); const id = g.getImageData(0, 0, gr.width, gr.height); const d = id.data; for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = l; } g.putImageData(id, 0, 0); }
    doc.editLayer('Gradient', (src) => { const sg = ctxOf(src); if (mask) { sg.clearRect(0, 0, src.width, src.height); } sg.drawImage(gr, 0, 0); return src; }, tg.L);
  };
  const wandAt = (p, e) => { const src = o.sampleAll || doc.active.type === 'adjust' ? compRef.current.c : (doc.active.mask && doc.maskEdit ? doc.active.mask : doc.surface(doc.active)); const m = magicWand(src, p.x, p.y, o.tol, o.contiguous); if (!m) return; let mm = m; if (o.feather) { mm = mk(doc.w, doc.h); const g = ctxOf(mm); g.filter = `blur(${o.feather}px)`; g.drawImage(m, 0, 0); } doc.setSelection(mm, selMode(e), 'Magic wand'); };
  const hitText = (p) => { for (let i = doc.layers.length - 1; i >= 0; i--) { const L = doc.layers[i]; if (L.type === 'text' && L.visible) { const b = textBox(L.text); if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return L; } } return null; };
  const focusText = () => setTimeout(() => { const t = document.querySelector('textarea[aria-label="Text content"]'); if (t) { t.focus(); t.select(); } }, 60);

  const onDown = (e) => {
    const el = cv.current; if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    el.setPointerCapture(e.pointerId); const p = pt(e); const s = S.current; hover.current = p; s.p0 = p; s.dragging = true; setWelcome(false);
    if (e.button === 1 || spaceDown.current || o.tool === 'hand') { s.pan = { x: e.clientX, y: e.clientY, vx: V.current.x, vy: V.current.y }; return; }
    if (e.button !== 0) return;
    if (s.xf && !s.xf.auto) { xfDown(p, e); return; }
    if (cropOn) { cropDown(p); return; }
    const t = o.tool;
    if (t === 'move') {
      const L = doc.active; if (L.locked) return lockedMsg();
      if (L.type === 'text' || L.type === 'shape') { s.mv = { p0: p, orig: JSON.parse(JSON.stringify(L.text || L.shape)), L }; return; }
      if (xfBegin(true)) s.xf.drag = { type: 'move', p0: p, T0: { ...s.xf.T } };
    } else if (t === 'marquee') s.sel = { p0: p, mode: selMode(e), p1: p };
    else if (t === 'lasso') {
      if (o.lassoMode === 'poly') { if (!s.poly) s.poly = { pts: [[p.x, p.y]], mode: selMode(e) }; else { const f = s.poly.pts[0]; if (Math.hypot(f[0] - p.x, f[1] - p.y) * V.current.z < 8 && s.poly.pts.length > 2) polyDone(); else s.poly.pts.push([p.x, p.y]); } dirty.current = true; }
      else s.sel = { pts: [[p.x, p.y]], mode: selMode(e), lasso: true };
    } else if (t === 'wand') wandAt(p, e);
    else if (t === 'crop') { s.crop = { x: p.x, y: p.y, w: 0, h: 0, fresh: true }; setCropOn(true); cropDown(p); }
    else if (t === 'eyedropper') { const c = pickColor(sampleSource(), p.x, p.y); if (c) setO(e.altKey ? { bg: c } : { fg: c }); s.pick = true; }
    else if (t === 'brush' || t === 'eraser' || t === 'retouch' || t === 'tone') strokeBegin(p, e);
    else if (t === 'clone') { if (e.altKey) { cloneSrc.current = { x: p.x, y: p.y, off: null }; toast('Clone source set'); dirty.current = true; } else strokeBegin(p, e); }
    else if (t === 'gradient') s.grad = { a: p, b: p };
    else if (t === 'bucket') { const tg = target(); if (!tg) return; const src = o.sampleAll ? compRef.current.c : tg.canvas; let m = magicWand(src, p.x, p.y, o.tol, o.contiguous); if (!m) return; fillThrough(m, o.fg, 'Paint bucket'); }
    else if (t === 'text') {
      const hit = hitText(p); if (hit) { doc.activeId = hit.id; doc.touch(); focusText(); } else { doc.addText({ x: Math.round(p.x), y: Math.round(p.y), size: o.fontSize, color: o.fg, str: 'Text' }); focusText(); }
    } else if (t === 'shape') s.shape = { p0: p, p1: p };
    else if (t === 'zoom') { zoomAt(e.altKey ? 1 / 1.6 : 1.6, p.sx, p.sy); }
  };
  const polyDone = () => { const s = S.current; if (!s.poly) return; if (s.poly.pts.length > 2) doc.setSelection(polySel(doc.w, doc.h, s.poly.pts, o.feather), s.poly.mode, 'Lasso'); s.poly = null; dirty.current = true; };
  const onMove = (e) => {
    const p = pt(e); const s = S.current; hover.current = p; dirty.current = true; setPos(p);
    if (s.pan) { setView({ ...V.current, x: s.pan.vx + e.clientX - s.pan.x, y: s.pan.vy + e.clientY - s.pan.y }); return; }
    if (!s.dragging) return;
    if (s.xf && s.xf.drag) { xfMove(p, e); return; }
    if (s.cropDrag) { cropMove(p, e); return; }
    if (s.mv) { const L = s.mv.L; const dx = p.x - s.mv.p0.x, dy = p.y - s.mv.p0.y; doc.liveSet(() => { if (L.text) L.text = { ...L.text, x: s.mv.orig.x + dx, y: s.mv.orig.y + dy }; else L.shape = { ...L.shape, x: s.mv.orig.x + dx, y: s.mv.orig.y + dy }; }); return; }
    if (s.sel) { if (s.sel.lasso) s.sel.pts.push([p.x, p.y]); else { s.sel.p1 = p; s.sel.shift = e.shiftKey; s.sel.altc = false; } return; }
    if (s.stroke) { strokeMove(p); return; }
    if (s.grad) { s.grad.b = e.shiftKey ? snapAngle(s.grad.a, p) : p; return; }
    if (s.shape) { s.shape.p1 = p; s.shape.shift = e.shiftKey; return; }
    if (s.pick && o.tool === 'eyedropper') { const c = pickColor(sampleSource(), p.x, p.y); if (c) setO(e.altKey ? { bg: c } : { fg: c }); }
  };
  const snapAngle = (a, p) => { const dx = p.x - a.x, dy = p.y - a.y, r = Math.hypot(dx, dy); const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); return { x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r }; };
  const onUp = (e) => {
    const s = S.current; const p = pt(e); s.dragging = false; s.pan = null; s.pick = false;
    try { cv.current.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (s.xf && s.xf.drag) { s.xf.drag = null; if (s.xf.auto) xfCommit('Move'); else bump(); }
    if (s.cropDrag) { s.cropDrag = null; bump(); }
    if (s.mv) { doc.liveEnd('Move layer'); s.mv = null; }
    if (s.sel) {
      const q = s.sel; s.sel = null;
      if (q.lasso) { if (q.pts.length > 2) doc.setSelection(polySel(doc.w, doc.h, q.pts, o.feather), q.mode, 'Lasso'); }
      else { let x0 = q.p0.x, y0 = q.p0.y, x1 = q.p1.x, y1 = q.p1.y; if (Math.abs(x1 - x0) < 2 && Math.abs(y1 - y0) < 2) { if (doc.sel && q.mode === 'new') doc.deselect(); } else { if (q.shift) { const m = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * m; y1 = y0 + Math.sign(y1 - y0 || 1) * m; } doc.setSelection(rectSel(doc.w, doc.h, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), o.marq === 'ellipse', o.feather), q.mode, o.marq === 'ellipse' ? 'Elliptical marquee' : 'Rectangular marquee'); } }
    }
    if (s.stroke) strokeEnd();
    if (s.grad) { const g = s.grad; s.grad = null; applyGradient(g.a, g.b); }
    if (s.shape) {
      const q = s.shape; s.shape = null; let w = q.p1.x - q.p0.x, h = q.p1.y - q.p0.y;
      if (Math.abs(w) < 3 && Math.abs(h) < 3) { w = 200; h = o.shape === 'line' ? 0 : 140; q.p0 = { x: q.p0.x - 100, y: q.p0.y - 70 }; if (o.shape === 'line') w = 240; }
      if (q.shift && o.shape !== 'line') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      const sp = { kind: o.shape, fill: o.fg, stroke: o.shape === 'line' ? o.fg : o.bg, sw: o.shape === 'line' ? Math.max(2, o.shapeSw || 6) : o.shapeSw, hasFill: true };
      if (o.shape === 'line') doc.addShape({ ...sp, x: q.p0.x, y: q.p0.y, w, h }); else doc.addShape({ ...sp, x: Math.min(q.p0.x, q.p0.x + w), y: Math.min(q.p0.y, q.p0.y + h), w: Math.abs(w), h: Math.abs(h) });
    }
    void p;
  };
  const onDbl = () => { if (S.current.poly) polyDone(); };

  /* crop */
  const cropHandles = () => { const c = S.current.crop; if (!c) return []; const xs = [c.x, c.x + c.w / 2, c.x + c.w], ys = [c.y, c.y + c.h / 2, c.y + c.h]; return [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]].map(([a, b]) => ({ x: xs[a], y: ys[b], a, b })); };
  const cropDown = (p) => {
    const s = S.current, c = s.crop, v = V.current;
    if (c && !c.fresh) { const h = cropHandles().find((q) => Math.hypot(q.x * v.z + v.x - p.sx, q.y * v.z + v.y - p.sy) < 9); if (h) { s.cropDrag = { type: 'h', h, c0: { ...c } }; return; } if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) { s.cropDrag = { type: 'move', p0: p, c0: { ...c } }; return; } }
    s.crop = { x: p.x, y: p.y, w: 0, h: 0 }; s.cropDrag = { type: 'new', p0: p };
  };
  const cropMove = (p, e) => {
    const s = S.current, d = s.cropDrag, c = s.crop;
    if (d.type === 'new') { c.x = Math.min(d.p0.x, p.x); c.y = Math.min(d.p0.y, p.y); c.w = Math.abs(p.x - d.p0.x); c.h = Math.abs(p.y - d.p0.y); if (e.shiftKey) { const m = Math.max(c.w, c.h); c.w = c.h = m; } }
    else if (d.type === 'move') { c.x = d.c0.x + p.x - d.p0.x; c.y = d.c0.y + p.y - d.p0.y; }
    else { const c0 = d.c0; let x0 = c0.x, y0 = c0.y, x1 = c0.x + c0.w, y1 = c0.y + c0.h; if (d.h.a === 0) x0 = p.x; if (d.h.a === 2) x1 = p.x; if (d.h.b === 0) y0 = p.y; if (d.h.b === 2) y1 = p.y; c.x = Math.min(x0, x1); c.y = Math.min(y0, y1); c.w = Math.abs(x1 - x0); c.h = Math.abs(y1 - y0); }
  };
  const cropApply = () => { const c = S.current.crop; S.current.crop = null; setCropOn(false); if (c && c.w >= 2 && c.h >= 2) { const r = { x: Math.max(0, c.x), y: Math.max(0, c.y), w: Math.min(doc.w, c.x + c.w) - Math.max(0, c.x), h: Math.min(doc.h, c.y + c.h) - Math.max(0, c.y) }; doc.crop(r); setTimeout(() => fit(doc, L0.current.vp), 0); } };
  const cropCancel = () => { S.current.crop = null; setCropOn(false); dirty.current = true; };

  /* ---------- clipboard ---------- */
  const doCopy = (merged) => { const r = doc.copySel(merged); if (!r) return toast('Nothing to copy'); clip.current = r; try { r.canvas.toBlob((b) => { if (b && navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).catch(() => {}); }); } catch { /* ignore */ } toast('Copied'); };
  const doCut = () => { if (!doc.sel) return toast('Make a selection first'); const L = doc.active; if (L.locked) return lockedMsg(); doCopy(false); if (L.type !== 'raster') doc.rasterize(L); doc.clearSelection(L); };
  const doPaste = (inPlace) => { const c = clip.current; if (!c) return toast('Clipboard is empty'); const x = inPlace ? c.x : Math.round((doc.w - c.canvas.width) / 2), y = inPlace ? c.y : Math.round((doc.h - c.canvas.height) / 2); doc.addFromCanvas(c.canvas, 'Pasted layer', x, y); };
  useEffect(() => {
    const onPaste = (e) => { if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return; const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); openFile(f, true); } else if (clip.current) { e.preventDefault(); doPaste(false); } };
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  }); // eslint-disable-line

  /* ---------- wheel / drop / keys ---------- */
  useEffect(() => {
    const el = cv.current; const wh = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top); else { const v = V.current; setView({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }); } };
    el.addEventListener('wheel', wh, { passive: false }); return () => el.removeEventListener('wheel', wh);
  }, [zoomAt, setView]);
  useEffect(() => {
    const kd = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName || '') && !document.querySelector('.fx-modal')) { spaceDown.current = true; e.preventDefault(); } };
    const ku = (e) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);
  const hk = {
    'ctrl+z': () => doc.undo(), 'ctrl+shift+z': () => doc.redo(), 'ctrl+y': () => doc.redo(), 'ctrl+a': () => doc.selectAll(), 'ctrl+d': () => doc.deselect(), 'ctrl+shift+i': () => doc.invertSelection(),
    'ctrl+j': () => doc.duplicate(), 'ctrl+shift+n': () => doc.addLayer({ name: `Layer ${doc.layers.length + 1}` }), 'ctrl+e': () => doc.mergeDown(), 'ctrl+t': () => startTransform(), 'ctrl+c': () => doCopy(false), 'ctrl+shift+c': () => doCopy(true), 'ctrl+x': () => doCut(),
    'ctrl+s': () => saveProject(), 'ctrl+o': () => openDialog(), 'ctrl+shift+s': () => setDlg({ k: 'export' }), 'ctrl+0': () => fit(), 'ctrl+1': () => zoomTo(1), 'ctrl+=': () => zoomAt(1.25), 'ctrl+-': () => zoomAt(0.8), 'ctrl+shift+e': () => doc.mergeVisible(),
    x: () => setO({ fg: o.bg, bg: o.fg }), d: () => setO({ fg: '#000000', bg: '#ffffff' }), '[': () => setO({ size: Math.max(1, Math.round(o.size * 0.85 - 1)) }), ']': () => setO({ size: Math.min(500, Math.round(o.size * 1.18 + 1)) }),
    delete: () => { if (!doc.sel && !doc.active) return false; const L = doc.active; if (L.locked) return lockedMsg(); if (doc.sel) { if (L.type !== 'raster' && L.type !== 'adjust') doc.rasterize(L); doc.clearSelection(L); } else if (doc.layers.length > 1) doc.remove(); }, backspace: () => { if (doc.sel) { const L = doc.active; if (L.type !== 'raster') doc.rasterize(L); doc.clearSelection(L); } },
    'alt+backspace': () => { if (doc.active.locked) return lockedMsg(); if (doc.active.type !== 'raster') doc.rasterize(); doc.fillSelection(o.fg); }, 'ctrl+backspace': () => { if (doc.active.type !== 'raster') doc.rasterize(); doc.fillSelection(o.bg); },
    enter: () => { if (S.current.xf) xfCommit(); else if (cropOn) cropApply(); else if (S.current.poly) polyDone(); else return false; }, escape: () => { if (S.current.xf) xfCancel(); else if (cropOn) cropCancel(); else if (S.current.poly) { S.current.poly = null; dirty.current = true; } else if (doc.sel) doc.deselect(); else return false; },
    arrowleft: (e) => nudge(e, -1, 0), arrowright: (e) => nudge(e, 1, 0), arrowup: (e) => nudge(e, 0, -1), arrowdown: (e) => nudge(e, 0, 1),
    '\\': () => { if (doc.active.mask) { doc.maskEdit = !doc.maskEdit; doc.touch(); } },
  };
  const nudge = (e, dx, dy) => { const st = e.shiftKey ? 10 : 1; const s = S.current; if (s.xf) { s.xf.T.cx += dx * st; s.xf.T.cy += dy * st; xfRender(); bump(); return; } const L = doc.active; if (L.type === 'text' || L.type === 'shape') { if (L.locked) return; doc.liveSet(() => { const k = L.text ? 'text' : 'shape'; L[k] = { ...L[k], x: L[k].x + dx * st, y: L[k].y + dy * st }; }); clearTimeout(s.nudgeT); s.nudgeT = setTimeout(() => doc.liveEnd('Nudge'), 400); return; } return false; };
  Object.entries(KEYMAP).forEach(([k, t]) => { hk[k] = () => { if (S.current.xf && !S.current.xf.auto) xfCommit(); if (cropOn && t !== 'crop') cropCancel(); setO({ tool: t }); }; });
  useHotkeys(hk);

  /* ---------- render ---------- */
  const draw = (_dt, t) => {
    const c = cv.current; if (!c) return; const s = S.current; const hasSel = !!doc.sel; const animate = (hasSel || s.poly || cloneSrc.current) && Math.floor(t / 130) !== s.antT;
    if (!dirty.current && !animate) return; if (animate) s.antT = Math.floor(t / 130); dirty.current = false;
    const dpr = Math.min(2, window.devicePixelRatio || 1); const W = vp.w, H = vp.h; if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const v = V.current;
    const key = `${doc.uid}|${doc.ver}|${s.fv}|${doc.w}x${doc.h}`; if (compRef.current.key !== key || !compRef.current.c) compRef.current = { key, c: doc.composite({ floating: s.float }) };
    if (!checker.current) { const cc = mk(16, 16), cg = cc.getContext('2d'); cg.fillStyle = '#ffffff'; cg.fillRect(0, 0, 16, 16); cg.fillStyle = '#cfcfd6'; cg.fillRect(0, 0, 8, 8); cg.fillRect(8, 8, 8, 8); checker.current = g.createPattern(cc, 'repeat'); }
    g.save(); g.translate(v.x, v.y); g.scale(v.z, v.z);
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 22; g.fillStyle = '#fff'; g.fillRect(0, 0, doc.w, doc.h); g.shadowColor = 'transparent'; g.shadowBlur = 0;
    g.save(); g.beginPath(); g.rect(0, 0, doc.w, doc.h); g.clip(); g.save(); g.scale(1 / v.z, 1 / v.z); g.fillStyle = checker.current; g.fillRect(0, 0, doc.w * v.z, doc.h * v.z); g.restore();
    g.imageSmoothingEnabled = v.z < 2; g.imageSmoothingQuality = 'high'; g.drawImage(compRef.current.c, 0, 0);
    if (o.grid) { g.lineWidth = 1 / v.z; g.strokeStyle = 'rgba(120,120,140,.5)'; const step = v.z >= 6 ? 1 : v.z >= 2 ? 10 : 50; g.beginPath(); for (let x = 0; x <= doc.w; x += step) { g.moveTo(x, 0); g.lineTo(x, doc.h); } for (let y = 0; y <= doc.h; y += step) { g.moveTo(0, y); g.lineTo(doc.w, y); } g.stroke(); }
    g.restore(); g.restore();
    const toS = (x, y) => [x * v.z + v.x, y * v.z + v.y];
    /* selection ants */
    if (hasSel) {
      const k = `${doc.selVer}|${v.x.toFixed(1)}|${v.y.toFixed(1)}|${v.z.toFixed(3)}|${W}|${H}`;
      if (ants.current.key !== k) { const tmp = mk(W, H), tg = tmp.getContext('2d'); tg.translate(v.x, v.y); tg.scale(v.z, v.z); tg.imageSmoothingEnabled = v.z < 1; tg.drawImage(doc.sel, 0, 0); ants.current = { key: k, edge: edgeCanvas(tmp), tmp: mk(W, H) }; }
      if (!stripe.current) { const sc = mk(8, 8), sg = sc.getContext('2d'); sg.fillStyle = '#fff'; sg.fillRect(0, 0, 8, 8); sg.fillStyle = '#000'; sg.beginPath(); sg.moveTo(0, 0); sg.lineTo(4, 0); sg.lineTo(0, 4); sg.fill(); sg.beginPath(); sg.moveTo(8, 4); sg.lineTo(4, 8); sg.lineTo(8, 8); sg.fill(); sg.beginPath(); sg.moveTo(4, 0); sg.lineTo(8, 0); sg.lineTo(0, 8); sg.lineTo(0, 4); sg.fill(); stripe.current = sc; }
      const a = ants.current, ag = a.tmp.getContext('2d'); ag.clearRect(0, 0, W, H); ag.globalCompositeOperation = 'source-over'; ag.drawImage(a.edge, 0, 0); ag.globalCompositeOperation = 'source-in'; const off = ((t / 90) | 0) % 8; ag.fillStyle = ag.createPattern(stripe.current, 'repeat'); ag.save(); ag.translate(off, 0); ag.fillRect(-8, 0, W + 8, H); ag.restore(); g.drawImage(a.tmp, 0, 0, W, H);
    }
    g.lineWidth = 1;
    const dash = (fn) => { g.setLineDash([5, 4]); g.strokeStyle = '#fff'; g.lineDashOffset = 0; fn(); g.strokeStyle = '#000'; g.lineDashOffset = 4.5; fn(); g.setLineDash([]); };
    if (s.sel && !s.sel.lasso && s.sel.p1) { const q = s.sel; let x0 = q.p0.x, y0 = q.p0.y, x1 = q.p1.x, y1 = q.p1.y; if (q.shift) { const m = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * m; y1 = y0 + Math.sign(y1 - y0 || 1) * m; } const [a0, b0] = toS(Math.min(x0, x1), Math.min(y0, y1)), [a1, b1] = toS(Math.max(x0, x1), Math.max(y0, y1)); dash(() => { g.beginPath(); if (o.marq === 'ellipse') g.ellipse((a0 + a1) / 2, (b0 + b1) / 2, (a1 - a0) / 2, (b1 - b0) / 2, 0, 0, 7); else g.rect(a0, b0, a1 - a0, b1 - b0); g.stroke(); }); }
    const poly = (pts, close) => { g.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = toS(x, y); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); if (close) g.closePath(); g.stroke(); };
    if (s.sel && s.sel.lasso) dash(() => poly(s.sel.pts, false));
    if (s.poly) { const pts = [...s.poly.pts]; if (hover.current) pts.push([hover.current.x, hover.current.y]); dash(() => poly(pts, false)); }
    if (s.shape) { const q = s.shape; let w = q.p1.x - q.p0.x, h = q.p1.y - q.p0.y; if (q.shift && o.shape !== 'line') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; } g.strokeStyle = '#31a8ff'; g.lineWidth = 1.5; const [a, b] = toS(q.p0.x, q.p0.y); g.beginPath(); if (o.shape === 'line') { g.moveTo(a, b); g.lineTo(a + w * v.z, b + h * v.z); } else if (o.shape === 'ellipse') g.ellipse(a + (w * v.z) / 2, b + (h * v.z) / 2, Math.abs((w * v.z) / 2), Math.abs((h * v.z) / 2), 0, 0, 7); else g.rect(a, b, w * v.z, h * v.z); g.stroke(); }
    if (s.grad) { const [a0, b0] = toS(s.grad.a.x, s.grad.a.y), [a1, b1] = toS(s.grad.b.x, s.grad.b.y); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(a0, b0); g.lineTo(a1, b1); g.stroke(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); g.fillStyle = o.fg; g.beginPath(); g.arc(a0, b0, 5, 0, 7); g.fill(); g.stroke(); g.fillStyle = o.bg; g.beginPath(); g.arc(a1, b1, 5, 0, 7); g.fill(); g.stroke(); }
    if (s.crop) { const cr = s.crop; const [a0, b0] = toS(cr.x, cr.y), [a1, b1] = toS(cr.x + cr.w, cr.y + cr.h); const [D0, E0] = toS(0, 0), [D1, E1] = toS(doc.w, doc.h); g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.rect(D0, E0, D1 - D0, E1 - E0); g.rect(a0, b0, a1 - a0, b1 - b0); g.fill('evenodd'); g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(a0, b0, a1 - a0, b1 - b0); g.strokeStyle = 'rgba(255,255,255,.4)'; g.beginPath(); for (let i = 1; i < 3; i++) { g.moveTo(a0 + ((a1 - a0) * i) / 3, b0); g.lineTo(a0 + ((a1 - a0) * i) / 3, b1); g.moveTo(a0, b0 + ((b1 - b0) * i) / 3); g.lineTo(a1, b0 + ((b1 - b0) * i) / 3); } g.stroke(); g.fillStyle = '#fff'; g.strokeStyle = '#000'; cropHandles().forEach((h) => { const [x, y] = toS(h.x, h.y); g.fillRect(x - 4, y - 4, 8, 8); g.strokeRect(x - 4.5, y - 4.5, 9, 9); }); }
    if (s.xf) { const T = s.xf.T; const hs = transformCorners(T); g.strokeStyle = '#31a8ff'; g.lineWidth = 1.2; g.beginPath(); [0, 2, 4, 6].forEach((i, k) => { const [x, y] = toS(hs[i].x, hs[i].y); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke(); if (!s.xf.auto) { g.fillStyle = '#fff'; hs.forEach((h) => { const [x, y] = toS(h.x, h.y); g.fillRect(x - 4, y - 4, 8, 8); g.strokeRect(x - 4, y - 4, 8, 8); }); } }
    if (cloneSrc.current) { const [x, y] = toS(cloneSrc.current.x, cloneSrc.current.y); g.strokeStyle = '#ff3b6b'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 8, 0, 7); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y + 12); g.stroke(); }
    const h = hover.current; if (h && ['brush', 'eraser', 'clone', 'retouch', 'tone'].includes(o.tool) && !s.pan && !spaceDown.current) { const r = (o.size / 2) * v.z; const [x, y] = toS(h.x, h.y); g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.8)'; g.beginPath(); g.arc(x, y, Math.max(1, r), 0, 7); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x, y, Math.max(1, r) + 1, 0, 7); g.stroke(); }
  };
  useRaf(draw, true);
  useEffect(() => { dirty.current = true; }, [vp, o.grid, o.tool, cropOn, xfOn, doc, view]);

  /* ---------- menus ---------- */
  const disAdj = doc.active.type === 'adjust';
  const act = {
    onAction: (k, arg) => { if (k === 'addAdjust') doc.addAdjustment(arg); },
    fx: (L) => setDlg({ k: 'style', L }),
  };
  const effect = (kind, isFilter) => { const L = doc.active; if (L.locked) return lockedMsg(); if (L.type === 'adjust') return toast('Choose a pixel layer to apply this to'); if (L.mask && doc.maskEdit) return toast('Select the layer (not its mask) to apply this'); setDlg({ k: 'effect', kind, isFilter }); };
  const quickAdj = (kind, extra) => { const L = doc.active; if (L.locked) return lockedMsg(); doc.bakeAdjustment(kind, { ...adjDefaults(kind), ...extra }, L); };
  const menus = [
    { label: 'File', items: [
      { label: 'New…', icon: 'newPage', kbd: 'Ctrl+N', onClick: async () => { if (await guardDirty()) setDlg({ k: 'new' }); } }, { label: 'Open image or project…', icon: 'folder', kbd: 'Ctrl+O', onClick: openDialog }, { label: 'Place image as layer…', icon: 'image', onClick: placeDialog }, { sep: true },
      { label: 'Save project (.photo.json)', icon: 'download', kbd: 'Ctrl+S', onClick: saveProject }, { label: 'Export as…', icon: 'upload', kbd: 'Ctrl+Shift+S', onClick: () => setDlg({ k: 'export' }) }, { label: 'Quick export PNG', onClick: () => exportImage({ fmt: 'png', q: 1, scale: 1, matte: '#fff' }) }, { sep: true },
      { label: 'Try a sample photo', icon: 'sparkles', onClick: async () => { if (!(await guardDirty())) return; const d = new PDoc(1200, 800, 'transparent'); ctxOf(d.layers[0].canvas).drawImage(sampleCanvas(), 0, 0); d.layers[0].name = 'Sunset'; loadDoc(d, 'Sunset sample'); } },
    ] },
    { label: 'Edit', items: [
      { label: 'Undo', icon: 'undo', kbd: 'Ctrl+Z', onClick: () => doc.undo(), disabled: doc.hi === 0 }, { label: 'Redo', icon: 'redo', kbd: 'Ctrl+Shift+Z', onClick: () => doc.redo(), disabled: doc.hi >= doc.hist.length }, { sep: true },
      { label: 'Cut', icon: 'scissors', kbd: 'Ctrl+X', onClick: doCut }, { label: 'Copy', icon: 'copy', kbd: 'Ctrl+C', onClick: () => doCopy(false) }, { label: 'Copy merged', kbd: 'Ctrl+Shift+C', onClick: () => doCopy(true) }, { label: 'Paste', icon: 'paste', kbd: 'Ctrl+V', onClick: () => doPaste(false) }, { label: 'Paste in place', onClick: () => doPaste(true) }, { sep: true },
      { label: 'Fill with foreground', kbd: 'Alt+Backspace', onClick: () => { if (doc.active.type !== 'raster' && doc.active.type !== 'adjust') doc.rasterize(); doc.fillSelection(o.fg); } }, { label: 'Fill with background', kbd: 'Ctrl+Backspace', onClick: () => { if (doc.active.type !== 'raster' && doc.active.type !== 'adjust') doc.rasterize(); doc.fillSelection(o.bg); } }, { label: 'Clear', kbd: 'Delete', onClick: () => { if (doc.active.type !== 'raster') doc.rasterize(); doc.clearSelection(); } }, { sep: true },
      { label: 'Free transform', icon: 'scale3', kbd: 'Ctrl+T', onClick: startTransform },
      { label: 'Flip layer horizontal', icon: 'flipH', onClick: () => layerFlip(true) }, { label: 'Flip layer vertical', icon: 'flipV', onClick: () => layerFlip(false) }, { label: 'Rotate layer 90° clockwise', icon: 'rotate', onClick: () => layerRot(Math.PI / 2) },
    ] },
    { label: 'Image', items: [
      { label: 'Image size…', onClick: () => setDlg({ k: 'size' }) }, { label: 'Canvas size…', onClick: () => setDlg({ k: 'canvas' }) }, { label: 'Crop to selection', icon: 'crop', disabled: !doc.sel, onClick: () => { const b = doc.selectionBounds(); if (b) { doc.crop(b); setTimeout(() => fit(), 0); } } }, { sep: true },
      { label: 'Rotate 90° clockwise', onClick: () => { doc.rotate(90); setTimeout(() => fit(), 0); } }, { label: 'Rotate 90° counter-clockwise', onClick: () => { doc.rotate(270); setTimeout(() => fit(), 0); } }, { label: 'Rotate 180°', onClick: () => doc.rotate(180) }, { label: 'Flip canvas horizontal', onClick: () => doc.flip(true) }, { label: 'Flip canvas vertical', onClick: () => doc.flip(false) }, { sep: true },
      { head: 'Auto' }, { label: 'Auto tone', onClick: () => { const h = doc.histogram(doc.composite()); quickAdj('levels', autoLevels(Array.from(h.l))); } }, { label: 'Desaturate', onClick: () => quickAdj('blackWhite') }, { label: 'Invert colours', onClick: () => quickAdj('invert') }, { head: 'Adjustments' },
      ...ADJ_ORDER.filter((k) => ADJUSTMENTS[k].controls.length || ADJUSTMENTS[k].curves || ADJUSTMENTS[k].colors || ADJUSTMENTS[k].color).map((k) => ({ label: ADJUSTMENTS[k].label + '…', onClick: () => effect(k, false) })),
    ] },
    { label: 'Layer', items: [
      { label: 'New layer', icon: 'plus', kbd: 'Ctrl+Shift+N', onClick: () => doc.addLayer({ name: `Layer ${doc.layers.length + 1}` }) }, { label: 'Duplicate layer', icon: 'copy', kbd: 'Ctrl+J', onClick: () => doc.duplicate() }, { label: 'Delete layer', icon: 'trash', disabled: doc.layers.length <= 1, onClick: () => doc.remove() }, { sep: true },
      { head: 'New adjustment layer' }, ...ADJ_ORDER.map((k) => ({ label: ADJUSTMENTS[k].label, icon: ADJUSTMENTS[k].icon, onClick: () => doc.addAdjustment(k) })), { sep: true },
      { label: 'Add mask (reveal all)', icon: 'mask', disabled: !!doc.active.mask, onClick: () => doc.addMask(doc.active, 'reveal') }, { label: 'Add mask (hide all)', disabled: !!doc.active.mask, onClick: () => doc.addMask(doc.active, 'hide') }, { label: 'Add mask from selection', disabled: !!doc.active.mask || !doc.sel, onClick: () => doc.addMask(doc.active, 'selection') }, { label: 'Invert mask', disabled: !doc.active.mask, onClick: () => doc.invertMask() }, { label: 'Apply mask', disabled: !doc.active.mask, onClick: () => doc.deleteMask(doc.active, true) }, { label: 'Delete mask', disabled: !doc.active.mask, onClick: () => doc.deleteMask() }, { sep: true },
      { label: 'Layer style…', icon: 'fxIco', disabled: disAdj, onClick: () => setDlg({ k: 'style', L: doc.active }) }, { label: 'Clipping mask', onClick: () => doc.setProps(doc.active, { clip: !doc.active.clip }, 'Clipping mask') }, { label: 'Rasterize layer', disabled: doc.active.type === 'raster' || disAdj, onClick: () => doc.rasterize() }, { sep: true },
      { label: 'Bring forward', onClick: () => doc.reorder(doc.active, 1) }, { label: 'Send backward', onClick: () => doc.reorder(doc.active, -1) }, { label: 'Bring to front', onClick: () => doc.moveTo(doc.active, doc.layers.length - 1) }, { label: 'Send to back', onClick: () => doc.moveTo(doc.active, 0) }, { sep: true },
      { label: 'Merge down', icon: 'merge', kbd: 'Ctrl+E', onClick: () => doc.mergeDown() }, { label: 'Merge visible', kbd: 'Ctrl+Shift+E', onClick: () => doc.mergeVisible() }, { label: 'Flatten image', onClick: () => doc.flatten() },
    ] },
    { label: 'Select', items: [
      { label: 'All', kbd: 'Ctrl+A', onClick: () => doc.selectAll() }, { label: 'Deselect', kbd: 'Ctrl+D', onClick: () => doc.deselect() }, { label: 'Inverse', kbd: 'Ctrl+Shift+I', onClick: () => doc.invertSelection() }, { sep: true },
      { label: 'Feather…', disabled: !doc.sel, onClick: async () => { const v = await ask({ kind: 'prompt', title: 'Feather selection', message: 'Feather radius (px)', value: '8', okText: 'OK' }); if (v != null && +v > 0) doc.featherSelection(+v); } },
      { label: 'Expand…', disabled: !doc.sel, onClick: async () => { const v = await ask({ kind: 'prompt', title: 'Expand selection', message: 'Expand by (px, up to 40)', value: '4' }); if (v != null && +v > 0) doc.growSelection(+v); } },
      { label: 'Contract…', disabled: !doc.sel, onClick: async () => { const v = await ask({ kind: 'prompt', title: 'Contract selection', message: 'Contract by (px, up to 40)', value: '4' }); if (v != null && +v > 0) doc.growSelection(-v); } },
      { sep: true }, { label: 'Layer transparency', onClick: () => { if (disAdj) return; const m = cloneCanvas(doc.surface(doc.active)); doc.setSelection(m, 'new', 'Load layer selection'); }, disabled: disAdj },
      { label: 'Colour range (foreground colour)…', onClick: async () => { const v = await ask({ kind: 'prompt', title: 'Colour range', message: 'Fuzziness (0–255)', value: '60' }); if (v != null) { const m = colorRange(o.sampleAll ? doc.composite() : doc.surface(doc.active), hexRgb(o.fg), +v || 60); doc.setSelection(m, 'new', 'Colour range'); } } },
    ] },
    { label: 'Filter', items: FILTER_GROUPS.flatMap((gname) => [{ head: gname }, ...Object.entries(FILTERS).filter(([, f]) => f.group === gname).map(([k, f]) => ({ label: f.label + '…', onClick: () => effect(k, true) }))]) },
    { label: 'View', items: [
      { label: 'Zoom in', icon: 'zoomIn', kbd: 'Ctrl+=', onClick: () => zoomAt(1.25) }, { label: 'Zoom out', icon: 'zoomOut', kbd: 'Ctrl+-', onClick: () => zoomAt(0.8) }, { label: 'Fit on screen', kbd: 'Ctrl+0', onClick: () => fit() }, { label: 'Actual pixels (100%)', kbd: 'Ctrl+1', onClick: () => zoomTo(1) }, { sep: true },
      { label: 'Show grid', checked: !!o.grid, onClick: () => setO({ grid: !o.grid }) }, { label: 'Toggle mask editing', kbd: '\\', disabled: !doc.active.mask, onClick: () => { doc.maskEdit = !doc.maskEdit; doc.touch(); } },
    ] },
    { label: 'Help', items: [{ label: 'Keyboard shortcuts', icon: 'keyboard', onClick: () => setDlg({ k: 'keys' }) }] },
  ];
  const layerFlip = (h) => { const L = doc.active; if (L.locked) return lockedMsg(); if (!startTransform()) { /* started */ } const x = S.current.xf; if (!x) return; x.T[h ? 'sx' : 'sy'] *= -1; xfCommit(h ? 'Flip layer horizontal' : 'Flip layer vertical'); };
  const layerRot = (a) => { startTransform(); const x = S.current.xf; if (!x) return; x.T.rot += a; xfCommit('Rotate layer'); };

  /* ---------- options bar ---------- */
  const modeBtns = <div className="stu-opt" role="group" aria-label="Selection mode">{[['new', 'New'], ['add', 'Add'], ['sub', 'Subtract'], ['int', 'Intersect']].map(([v, l]) => <button key={v} type="button" className={'stu-btn' + (o.selMode === v ? ' on' : '')} aria-pressed={o.selMode === v} onClick={() => setO({ selMode: v })}>{l}</button>)}</div>;
  const brushOpts = <><Num label="Size" value={o.size} min={1} max={500} onChange={(v) => setO({ size: v })} /><Num label="Hardness" value={o.hardness} min={0} max={100} onChange={(v) => setO({ hardness: v })} />{o.tool !== 'retouch' && o.tool !== 'tone' && <Num label="Opacity" value={o.opacity} min={1} max={100} onChange={(v) => setO({ opacity: v })} />}</>;
  const optBar = xfOn ? (
    <><b className="stu-opt">Free transform</b><Num label="W %" value={Math.round(Math.abs(S.current.xf?.T.sx || 1) * 100)} min={1} max={800} slider={false} onChange={(v) => xfPatch({ sx: (v / 100) * Math.sign(S.current.xf.T.sx || 1) })} /><Num label="H %" value={Math.round(Math.abs(S.current.xf?.T.sy || 1) * 100)} min={1} max={800} slider={false} onChange={(v) => xfPatch({ sy: (v / 100) * Math.sign(S.current.xf.T.sy || 1) })} /><Num label="Angle" value={Math.round(((S.current.xf?.T.rot || 0) * 180) / Math.PI)} min={-360} max={360} slider={false} unit="°" onChange={(v) => xfPatch({ rot: (v * Math.PI) / 180 })} />
      <button type="button" className="stu-btn" onClick={() => xfPatch({ sx: -S.current.xf.T.sx })}>Flip H</button><button type="button" className="stu-btn" onClick={() => xfPatch({ sy: -S.current.xf.T.sy })}>Flip V</button><span className="spacer" /><button type="button" className="stu-btn" onClick={xfCancel}>Cancel</button><button type="button" className="stu-btn pri" onClick={() => xfCommit()}>Apply</button></>
  ) : cropOn ? (
    <><b className="stu-opt">Crop</b><span className="stu-hint">Drag to choose the area, then press Enter.</span><span className="spacer" /><button type="button" className="stu-btn" onClick={cropCancel}>Cancel</button><button type="button" className="stu-btn pri" onClick={cropApply}>Apply crop</button></>
  ) : ({
    move: <><span className="stu-hint">Drag to move the active layer (or selected pixels). Ctrl+T for free transform.</span><button type="button" className="stu-btn" onClick={startTransform}>Free transform</button></>,
    marquee: <><div className="stu-opt" role="group" aria-label="Marquee shape">{[['rect', 'Rectangle'], ['ellipse', 'Ellipse']].map(([v, l]) => <button key={v} type="button" className={'stu-btn' + (o.marq === v ? ' on' : '')} aria-pressed={o.marq === v} onClick={() => setO({ marq: v })}>{l}</button>)}</div>{modeBtns}<Num label="Feather" value={o.feather} min={0} max={100} slider={false} unit="px" onChange={(v) => setO({ feather: v })} /></>,
    lasso: <><div className="stu-opt" role="group" aria-label="Lasso type">{[['free', 'Freehand'], ['poly', 'Polygonal']].map(([v, l]) => <button key={v} type="button" className={'stu-btn' + (o.lassoMode === v ? ' on' : '')} aria-pressed={o.lassoMode === v} onClick={() => setO({ lassoMode: v })}>{l}</button>)}</div>{modeBtns}<Num label="Feather" value={o.feather} min={0} max={100} slider={false} unit="px" onChange={(v) => setO({ feather: v })} />{o.lassoMode === 'poly' && <span className="stu-hint">Click points; double-click or click the start to finish.</span>}</>,
    wand: <>{modeBtns}<Num label="Tolerance" value={o.tol} min={0} max={128} onChange={(v) => setO({ tol: v })} /><label className="stu-chk"><input type="checkbox" checked={o.contiguous} onChange={(e) => setO({ contiguous: e.target.checked })} />Contiguous</label><label className="stu-chk"><input type="checkbox" checked={o.sampleAll} onChange={(e) => setO({ sampleAll: e.target.checked })} />Sample all layers</label></>,
    crop: <span className="stu-hint">Drag on the canvas to draw a crop area.</span>,
    eyedropper: <><label className="stu-chk"><input type="checkbox" checked={o.sampleAll} onChange={(e) => setO({ sampleAll: e.target.checked })} />Sample all layers</label><span className="stu-hint">Alt-click sets the background colour.</span></>,
    brush: brushOpts, eraser: brushOpts,
    clone: <>{brushOpts}<label className="stu-chk"><input type="checkbox" checked={o.aligned} onChange={(e) => setO({ aligned: e.target.checked })} />Aligned</label><label className="stu-chk"><input type="checkbox" checked={o.sampleAll} onChange={(e) => setO({ sampleAll: e.target.checked })} />Sample all layers</label><span className="stu-hint">Alt-click to set the source.</span></>,
    retouch: <><div className="stu-opt" role="group" aria-label="Retouch mode">{['blur', 'sharpen', 'smudge'].map((v) => <button key={v} type="button" className={'stu-btn' + (o.retouch === v ? ' on' : '')} aria-pressed={o.retouch === v} onClick={() => setO({ retouch: v })}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>{brushOpts}<Num label="Strength" value={o.strength} min={1} max={100} onChange={(v) => setO({ strength: v })} /></>,
    tone: <><div className="stu-opt" role="group" aria-label="Tone mode">{['dodge', 'burn'].map((v) => <button key={v} type="button" className={'stu-btn' + (o.tone === v ? ' on' : '')} aria-pressed={o.tone === v} onClick={() => setO({ tone: v })}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>{brushOpts}<Num label="Exposure" value={o.strength} min={1} max={100} onChange={(v) => setO({ strength: v })} /></>,
    gradient: <><select className="stu-sel" aria-label="Gradient type" value={o.gradKind} onChange={(e) => setO({ gradKind: e.target.value })}>{['linear', 'radial', 'angle', 'reflected', 'diamond'].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</select><label className="stu-chk"><input type="checkbox" checked={o.gradTrans} onChange={(e) => setO({ gradTrans: e.target.checked })} />Fade to transparent</label><label className="stu-chk"><input type="checkbox" checked={o.gradRev} onChange={(e) => setO({ gradRev: e.target.checked })} />Reverse</label><span className="stu-hint">Drag from start to end. Shift snaps the angle.</span></>,
    bucket: <><Num label="Tolerance" value={o.tol} min={0} max={128} onChange={(v) => setO({ tol: v })} /><label className="stu-chk"><input type="checkbox" checked={o.contiguous} onChange={(e) => setO({ contiguous: e.target.checked })} />Contiguous</label><label className="stu-chk"><input type="checkbox" checked={o.sampleAll} onChange={(e) => setO({ sampleAll: e.target.checked })} />Sample all layers</label></>,
    text: <><Num label="Size" value={o.fontSize} min={6} max={600} slider={false} unit="px" onChange={(v) => setO({ fontSize: v })} /><span className="stu-hint">Click to add text, then type in the Properties panel. Colour = foreground.</span></>,
    shape: <><select className="stu-sel" aria-label="Shape type" value={o.shape} onChange={(e) => setO({ shape: e.target.value })}>{['rect', 'ellipse', 'polygon', 'star', 'line'].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</select><Num label="Stroke" value={o.shapeSw} min={0} max={60} slider={false} unit="px" onChange={(v) => setO({ shapeSw: v })} /><span className="stu-hint">Fill = foreground, stroke = background. Shift keeps it square.</span></>,
    hand: <span className="stu-hint">Drag to pan. Hold Space with any tool to pan.</span>,
    zoom: <><button type="button" className="stu-btn" onClick={() => zoomAt(1.5)}>Zoom in</button><button type="button" className="stu-btn" onClick={() => zoomAt(1 / 1.5)}>Zoom out</button><button type="button" className="stu-btn" onClick={() => fit()}>Fit</button><button type="button" className="stu-btn" onClick={() => zoomTo(1)}>100%</button></>,
  }[o.tool] || null);

  const comp = compRef.current.c; const A = doc.active; const selB = doc.sel ? doc.selectionBounds() : null;
  const pristine = welcome && doc.hi === 0 && !doc.dirty;
  const cursor = spaceDown.current || o.tool === 'hand' ? 'grab' : ['brush', 'eraser', 'clone', 'retouch', 'tone'].includes(o.tool) ? 'none' : o.tool === 'move' ? 'move' : o.tool === 'text' ? 'text' : o.tool === 'zoom' ? 'zoom-in' : o.tool === 'eyedropper' ? 'copy' : 'crosshair';

  return (
    <div className="fx stu photo" style={{ '--brand': '#31a8ff', '--brand-ink': '#04223d' }} data-app="photo">
      <AppBar id="photo" name="Techomato Photo Studio" right={<><input className="pho-name" aria-label="Document name" value={name} onChange={(e) => setName(e.target.value)} /><span className="stu-hint" aria-live="polite">{save}</span><button type="button" className="fb pri" onClick={() => setDlg({ k: 'export' })}><Icon name="upload" size={14} />Export</button></>} />
      <StudioMenu menus={menus} />
      <div className="stu-opts" role="toolbar" aria-label="Tool options"><div className="pho-tname"><Icon name={(TOOLS.find((t) => t && t[0] === o.tool) || [])[1] || 'brush'} size={16} />{(TOOLS.find((t) => t && t[0] === o.tool) || [])[2]}</div><span className="stu-sep" />{optBar}</div>
      <div className="stu-body"
        onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setFileDrop(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setFileDrop(false); }}
        onDrop={(e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; setFileDrop(false); if (f) { e.preventDefault(); openFile(f, true); } }}>
        <div className="stu-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical">
          {TOOLS.map((t, i) => (t ? <ToolBtn key={t[0]} icon={t[1]} label={t[2]} kbd={t[3]} on={o.tool === t[0]} onClick={() => { if (S.current.xf && !S.current.xf.auto) xfCommit(); if (cropOn && t[0] !== 'crop') cropCancel(); setO({ tool: t[0] }); }} /> : <div key={i} className="stu-tsep" />))}
          <div className="pho-fgbg-mini"><button type="button" className="bg" style={{ background: o.bg }} aria-label="Background colour" onClick={() => setO({ fg: o.bg, bg: o.fg })} /><button type="button" className="fg" style={{ background: o.fg }} aria-label="Foreground colour" onClick={() => setO({ fg: o.bg, bg: o.fg })} /></div>
        </div>
        <div className="stu-center">
          <div className="pho-vp" ref={wrap} style={{ cursor }}>
            <canvas ref={cv} className="pho-cv" role="img" aria-label="Canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { hover.current = null; setPos(null); dirty.current = true; }} onDoubleClick={onDbl} onContextMenu={(e) => e.preventDefault()} />
            {pristine && (
              <div className="pho-welcome">
                <h2>Techomato Photo Studio</h2><p>Layers, masks, selections, brushes, filters and adjustment layers — in your browser.</p>
                <div className="pho-wbtns"><button type="button" className="fb pri" onClick={openDialog}><Icon name="image" size={15} />Open an image</button><button type="button" className="fb" onClick={() => setDlg({ k: 'new' })}><Icon name="newPage" size={15} />New document</button><button type="button" className="fb" onClick={() => { const d = new PDoc(1200, 800, 'transparent'); ctxOf(d.layers[0].canvas).drawImage(sampleCanvas(), 0, 0); d.layers[0].name = 'Sunset'; loadDoc(d, 'Sunset sample'); }}><Icon name="sparkles" size={15} />Try a sample photo</button></div>
                <p className="stu-hint">Tip: drop an image onto the window, or press <kbd>?</kbd> for shortcuts.</p>
              </div>
            )}
            {fileDrop && <div className="stu-drop">Drop an image to place it as a layer</div>}
          </div>
          <div className="stu-status" role="status">
            <span>{Math.round(view.z * 100)}%</span><span>{doc.w} × {doc.h} px</span><span>{pos ? `${Math.floor(pos.x)}, ${Math.floor(pos.y)}` : '—'}</span><span>{A.name}{A.mask && doc.maskEdit ? ' (mask)' : ''}</span>{selB && <span>Selection {selB.w} × {selB.h}</span>}<span className="spacer" /><span>{doc.layers.length} layer{doc.layers.length === 1 ? '' : 's'}</span><span>{TOOLS.find((t) => t && t[0] === o.tool)?.[2]}</span>
          </div>
        </div>
        <aside className="stu-side" aria-label="Panels">
          <NavigatorPanel doc={doc} comp={comp} ver={doc.ver + S.current.fv} view={view} setView={setView} vp={vp} />
          <ColorPanel fg={o.fg} bg={o.bg} setFg={(v) => setO({ fg: v })} setBg={(v) => setO({ bg: v })} swap={() => setO({ fg: o.bg, bg: o.fg })} reset={() => setO({ fg: '#000000', bg: '#ffffff' })} />
          <MProps doc={doc} ver={doc.ver} />
          <MLayers doc={doc} ver={doc.ver} onAction={act.onAction} onFx={act.fx} />
          <MHistory doc={doc} ver={doc.ver} />
          <HistogramPanel doc={doc} comp={comp} ver={doc.ver} />
        </aside>
      </div>
      {dlg?.k === 'new' && <NewDocDialog def={{ w: doc.w, h: doc.h }} onClose={() => setDlg(null)} onCreate={newDoc} />}
      {dlg?.k === 'export' && <ExportDialog doc={doc} onClose={() => setDlg(null)} onExport={exportImage} />}
      {dlg?.k === 'size' && <ImageSizeDialog doc={doc} onClose={() => setDlg(null)} onApply={(w, h) => { doc.resizeImage(w, h); setDlg(null); setTimeout(() => fit(), 0); }} />}
      {dlg?.k === 'canvas' && <CanvasSizeDialog doc={doc} onClose={() => setDlg(null)} onApply={(w, h, ax, ay) => { doc.resizeCanvas(w, h, ax, ay); setDlg(null); setTimeout(() => fit(), 0); }} />}
      {dlg?.k === 'effect' && <EffectDialog doc={doc} kind={dlg.kind} isFilter={dlg.isFilter} onClose={() => setDlg(null)} onApply={(p) => { if (dlg.isFilter) doc.applyFilter(dlg.kind, p); else doc.bakeAdjustment(dlg.kind, p); setDlg(null); }} />}
      {dlg?.k === 'style' && <StyleDialog layer={dlg.L} onClose={() => setDlg(null)} onApply={(st) => { doc.setProps(dlg.L, { style: st }, 'Layer style'); setDlg(null); }} />}
      {dlg?.k === 'keys' && <ShortcutsDialog onClose={() => setDlg(null)} />}
      {toastNode}{askNode}
    </div>
  );
}
void defaultStyle;
