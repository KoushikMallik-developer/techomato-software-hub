import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast, useAsk, useContextMenu } from '../components/fxui.jsx';
import { StudioMenu, Num, Row, PanelBox, ColorField, useHotkeys, useRaf, useHistory } from '../components/studio.jsx';
import { idbGet, idbSet } from '../lib/idb.js';
import { pickFiles, pickFile, readAsText, readAsDataURL, safeName, downloadFile } from '../lib/download.js';
import { renderComp, mkLayer, mkEffect, EFFECTS, BLENDS, FONTS, PRESETS, EASE_PRESETS, ease, easeName, applyPreset, sampleComp, compDefaults, defaultShape, measureText, values, worldM, quadOf, hitLayer, parentLinear, inv, apply, getProp, setPropAt, toggleKey, hasKeys, propsOf, exprError, makeZip, fmtTC, clamp, uid, P0 } from './motion/engine.js';
import '../styles/motion.css';

const HEAD = 330, RULER = 26, ROW_L = 30, ROW_P = 25;
const KIND_ICON = { solid: 'square', shape: 'shapesIco', text: 'textT', image: 'image', null: 'circleDot' };
const KIND_COLOR = { solid: '#e15b5b', shape: '#e0a43a', text: '#5b8fe1', image: '#46b07a', null: '#9a9ea6' };
const SIZE_PRESETS = [['HD 1280 × 720', 1280, 720], ['Full HD 1920 × 1080', 1920, 1080], ['Vertical 1080 × 1920', 1080, 1920], ['Square 1080 × 1080', 1080, 1080], ['Small 640 × 360', 640, 360]];
const mapProps = (comp, fn) => ({ ...comp, layers: comp.layers.map((L) => ({ ...L, p: Object.fromEntries(Object.entries(L.p).map(([k, p]) => [k, fn(p)])), fx: L.fx.map((f) => ({ ...f, p: Object.fromEntries(Object.entries(f.p).map(([k, p]) => [k, fn(p)])) })) })) });
const refOf = (L, path) => (path.k === 'p' ? L.p[path.n] : L.fx[path.i] && L.fx[path.i].p[path.n]);
const withProp = (L, path, fn) => (path.k === 'p' ? { ...L, p: { ...L.p, [path.n]: fn(L.p[path.n]) } } : { ...L, fx: L.fx.map((f, i) => (i === path.i ? { ...f, p: { ...f.p, [path.n]: fn(f.p[path.n]) } } : f)) });
const pathKey = (path) => (path.k === 'p' ? path.n : `fx${path.i}.${path.n}`);
function Foot({ onClose, onOk, ok = 'OK', disabled }) { return <><span className="spacer" /><button type="button" className="fb" onClick={onClose}>Cancel</button><button type="button" className="fb pri" disabled={disabled} onClick={onOk}>{ok}</button></>; }

export default function MotionApp() {
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const h = useHistory(compDefaults()); const comp = h.state;
  const [selId, setSelId] = useState(null); const [selKeys, setSelKeys] = useState([]); const [selProp, setSelProp] = useState(null); const [open, setOpen] = useState({}); const [pps, setPps] = useState(120); const [zoom, setZoom] = useState('fit'); const [res, setRes] = useState(1); const [bottom, setBottom] = useState('timeline'); const [rtab, setRtab] = useState('layer'); const [playing, setPlaying] = useState(false); const [loop, setLoop] = useState(true); const [dlg, setDlg] = useState(null); const [save, setSave] = useState(''); const [prog, setProg] = useState(null); const [tick, setTick] = useState(0); const [box, setBox] = useState({ w: 600, h: 340 }); const [exprDraft, setExprDraft] = useState('');
  const imgs = useRef(new Map()); const imgData = useRef(new Map()); const pos = useRef(0); const E = useRef({ playing: false, t0: 0, w0: 0, dirty: true, exporting: null }); const cv = useRef(null); const stage = useRef(null); const scroll = useRef(null); const phRef = useRef(null); const tcRef = useRef(null); const live = useRef(null); const clip = useRef(null);
  const L = comp.layers.find((l) => l.id === selId) || null;
  const upd = useCallback((fn) => { h.set(fn); E.current.dirty = true; }, [h]);
  const liveSet = useCallback((fn) => { if (!live.current) live.current = h.ref.current; h.set(fn, { record: false }); E.current.dirty = true; }, [h]);
  const liveEnd = useCallback(() => { if (live.current) { if (live.current !== h.ref.current) h.mark(live.current); live.current = null; } }, [h]);
  const updLayer = (id, fn, isLive) => (isLive ? liveSet : upd)((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? (typeof fn === 'function' ? fn(l) : { ...l, ...fn }) : l)) }));
  useEffect(() => { E.current.dirty = true; }, [comp, selId, selKeys, tick, res, zoom]);
  useEffect(() => { const el = stage.current; if (!el || typeof ResizeObserver === 'undefined') return undefined; const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);

  /* ---------- value access ---------- */
  const cur = (Ly, path, t = pos.current) => { const p = refOf(Ly, path); return p ? getProp(p, t, comp.layers.indexOf(Ly)) : 0; };
  const setVal = (id, path, v, isLive = true) => updLayer(id, (l) => withProp(l, path, (p) => setPropAt(p, pos.current, v, comp.fps)), isLive);
  const stopwatch = (Ly, path) => { const p = refOf(Ly, path); if (hasKeys(p)) updLayer(Ly.id, (l) => withProp(l, path, (q) => ({ ...q, v: getProp(q, pos.current), k: [] }))); else updLayer(Ly.id, (l) => withProp(l, path, (q) => toggleKey(q, pos.current, q.v, comp.fps))); };
  const keyHere = (Ly, path) => { const p = refOf(Ly, path); return hasKeys(p) && p.k.some((k) => Math.abs(k.t - pos.current) < 0.5 / comp.fps); };
  const addKeyHere = (Ly, path) => updLayer(Ly.id, (l) => withProp(l, path, (q) => toggleKey(q, pos.current, getProp(q, pos.current), comp.fps)));
  const jumpKey = (Ly, path, dir) => { const p = refOf(Ly, path); const ks = p.k.map((k) => k.t); const t = pos.current; const n = dir > 0 ? ks.find((x) => x > t + 1e-3) : [...ks].reverse().find((x) => x < t - 1e-3); if (n != null) seek(n); };

  /* ---------- transport ---------- */
  const seek = (t) => { t = clamp(t, 0, comp.dur); pos.current = t; if (E.current.playing) { E.current.t0 = t; E.current.w0 = performance.now(); } E.current.dirty = true; };
  const play = () => { const e = E.current; if (e.playing) return; if (pos.current >= comp.dur - 0.02) pos.current = 0; e.t0 = pos.current; e.w0 = performance.now(); e.playing = true; setPlaying(true); };
  const pause = () => { E.current.playing = false; setPlaying(false); setTick((x) => x + 1); };
  const togglePlay = () => (E.current.playing ? pause() : play());
  const step = (n) => { pause(); seek(pos.current + n / comp.fps); setTick((x) => x + 1); };
  const outScale = () => (res === 1 ? 1 : res); const cw = Math.max(16, Math.round(comp.w * outScale())); const chh = Math.max(16, Math.round(comp.h * outScale()));
  useRaf(() => {
    const e = E.current; const c = h.ref.current;
    if (e.playing) { const t = e.t0 + (performance.now() - e.w0) / 1000; const end = e.endAt ?? c.dur; pos.current = t; if (t >= end) { if (e.exporting) { finishExport(); } else if (loop) { pos.current = 0; e.t0 = 0; e.w0 = performance.now(); } else { pos.current = end; pause(); } } e.dirty = true; }
    const cnv = cv.current; if (cnv && (e.dirty || e.playing)) { e.dirty = false; renderComp(cnv.getContext('2d'), cnv.width, cnv.height, c, pos.current, imgs.current); if (e.exporting) renderComp(e.exporting.canvas.getContext('2d'), e.exporting.canvas.width, e.exporting.canvas.height, c, pos.current, imgs.current); }
    if (phRef.current) phRef.current.style.transform = `translateX(${pos.current * pps}px)`; const s = fmtTC(pos.current, c.fps); if (tcRef.current && tcRef.current.textContent !== s) { tcRef.current.textContent = s; if (!e.playing || Math.random() < 0.2) setTick((x) => x + 1); }
    if (e.playing && scroll.current) { const sc = scroll.current; const x = pos.current * pps + HEAD; if (x > sc.scrollLeft + sc.clientWidth - 30 || x < sc.scrollLeft + HEAD) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.3); }
  }, true);

  /* ---------- layer ops ---------- */
  const addLayer = (type, o = {}) => { const l = mkLayer(type, comp, { ...o, in: Math.min(pos.current, comp.dur - 0.5), out: comp.dur }); if (type === 'shape' || type === 'solid' || type === 'text') l.name = o.name || l.name; upd((c) => ({ ...c, layers: [l, ...c.layers] })); setSelId(l.id); setRtab('layer'); setOpen((x) => ({ ...x, [l.id]: true })); return l; };
  const addShape = (kind) => { const sz = kind === 'rect' ? [400, 260] : [260, 260]; return addLayer('shape', { name: { rect: 'Rectangle', ellipse: 'Ellipse', star: 'Star', poly: 'Polygon' }[kind], w: sz[0], h: sz[1], shape: defaultShape(kind) }); };
  const addImage = async () => { const f = await pickFiles('image/*'); for (const file of f) { const data = await readAsDataURL(file); await loadImage(data, file.name); } };
  const loadImage = (data, name, id = uid()) => new Promise((res2) => { const im = new Image(); im.onload = () => { imgs.current.set(id, im); imgData.current.set(id, { name, data }); if (!arguments_restoring.current) { const k = Math.min(1, (comp.w * 0.8) / im.naturalWidth, (comp.h * 0.8) / im.naturalHeight); addLayer('image', { name: name.replace(/\.[^.]+$/, ''), img: id, w: Math.round(im.naturalWidth * k), h: Math.round(im.naturalHeight * k) }); } E.current.dirty = true; res2(id); }; im.onerror = () => { toast('Could not read ' + name); res2(null); }; im.src = data; });
  const arguments_restoring = useRef(false);
  const removeSel = () => { if (selKeys.length) { deleteKeys(); return; } if (!L) return toast('Select a layer first'); upd((c) => ({ ...c, layers: c.layers.filter((l) => l.id !== L.id).map((l) => (l.parent === L.id ? { ...l, parent: null } : l)) })); setSelId(null); };
  const dupLayer = () => { if (!L) return; const n = JSON.parse(JSON.stringify(L)); n.id = uid(); n.name = L.name + ' copy'; mapKeysIds(n); upd((c) => { const i = c.layers.findIndex((l) => l.id === L.id); const a = [...c.layers]; a.splice(i, 0, n); return { ...c, layers: a }; }); setSelId(n.id); };
  const mapKeysIds = (n) => { for (const p of Object.values(n.p)) p.k.forEach((k) => { k.id = uid(); }); n.fx.forEach((f) => { f.id = uid(); for (const p of Object.values(f.p)) p.k.forEach((k) => { k.id = uid(); }); }); };
  const splitLayer = () => { if (!L) return; const t = pos.current; if (t <= L.in + 0.03 || t >= L.out - 0.03) return toast('Move the playhead inside the layer first'); const n = JSON.parse(JSON.stringify(L)); n.id = uid(); mapKeysIds(n); n.in = t; upd((c) => { const i = c.layers.findIndex((l) => l.id === L.id); const a = [...c.layers]; a[i] = { ...a[i], out: t }; a.splice(i, 0, n); return { ...c, layers: a }; }); setSelId(n.id); };
  const reorder = (d) => { if (!L) return; upd((c) => { const a = [...c.layers]; const i = a.findIndex((l) => l.id === L.id); const j = clamp(i + d, 0, a.length - 1); if (i === j) return c; [a[i], a[j]] = [a[j], a[i]]; return { ...c, layers: a }; }); };
  const setInOut = (which) => { if (!L) return; updLayer(L.id, which === 'in' ? { in: Math.min(pos.current, L.out - 0.1) } : { out: Math.max(pos.current, L.in + 0.1) }); };
  const renameLayer = async (l) => { const v = await ask({ kind: 'prompt', title: 'Rename layer', value: l.name, okText: 'Rename' }); if (v) updLayer(l.id, { name: v }); };
  const newComp = async () => { if (!(await ask({ title: 'New composition', message: 'Start an empty composition? Unsaved work is lost.', okText: 'Start new' }))) return; pause(); h.reset(compDefaults()); imgs.current.clear(); imgData.current.clear(); setSelId(null); setSelKeys([]); seek(0); };
  const loadSample = () => { pause(); h.reset(sampleComp()); setSelId(null); seek(0); setOpen({}); setTimeout(() => { play(); }, 100); };
  const setText = (patchT, isLive = true) => { if (!L) return; updLayer(L.id, (l) => { const T = { ...l.text, ...patchT }; const m = measureText(T); const centered = !hasKeys(l.p.ax) && !hasKeys(l.p.ay) && Math.abs(l.p.ax.v - l.w / 2) < 1 && Math.abs(l.p.ay.v - l.h / 2) < 1; return { ...l, text: T, w: m.w, h: m.h, name: patchT.str != null && /^(Text|Your text)/.test(l.name) ? T.str.split('\n')[0].slice(0, 28) : l.name, p: centered ? { ...l.p, ax: { ...l.p.ax, v: m.w / 2 }, ay: { ...l.p.ay, v: m.h / 2 } } : l.p }; }, isLive); };

  /* ---------- keyframes ---------- */
  const deleteKeys = () => { const ids = new Set(selKeys); upd((c) => mapProps(c, (p) => (p.k.some((k) => ids.has(k.id)) ? { ...p, v: p.k.length === 1 ? p.k[0].v : p.v, k: p.k.filter((k) => !ids.has(k.id)) } : p))); setSelKeys([]); };
  const setEase = (e) => { const ids = new Set(selKeys); if (!ids.size) return toast('Select keyframes in the timeline first'); upd((c) => mapProps(c, (p) => (p.k.some((k) => ids.has(k.id)) ? { ...p, k: p.k.map((k) => (ids.has(k.id) ? { ...k, e } : k)) } : p))); };
  const easyAll = () => { if (selKeys.length) setEase([0.333, 0, 0.667, 1]); else if (L) { upd((c) => ({ ...c, layers: c.layers.map((l) => (l.id === L.id ? { ...l, p: Object.fromEntries(Object.entries(l.p).map(([k, p]) => [k, { ...p, k: p.k.map((x) => ({ ...x, e: [0.333, 0, 0.667, 1] })) }])) } : l)) })); } };
  const selKeyObj = useMemo(() => { for (const l of comp.layers) { for (const p of [...Object.values(l.p), ...l.fx.flatMap((f) => Object.values(f.p))]) { const k = p.k.find((x) => selKeys.includes(x.id)); if (k) return k; } } return null; }, [comp, selKeys]);
  const applyExpr = (code) => { if (!selProp) return; const Lp = comp.layers.find((l) => l.id === selProp.id); if (!Lp) return; updLayer(Lp.id, (l) => withProp(l, selProp.path, (p) => ({ ...p, ex: code.trim() || undefined }))); };
  const preset = (id) => { if (!L) return toast('Select a layer first'); const p = applyPreset(id, L, comp, pos.current); updLayer(L.id, (l) => ({ ...l, p })); if (id !== 'clear') setOpen((x) => ({ ...x, [L.id]: true })); };

  /* ---------- project io ---------- */
  const projectJSON = () => JSON.stringify({ kind: 'techomato-motion', comp, images: [...imgData.current.entries()].map(([id, v]) => ({ id, ...v })) });
  const openProject = async () => { const f = await pickFile('.json,application/json'); if (!f) return; try { const d = JSON.parse(await readAsText(f)); if (d.kind !== 'techomato-motion') throw new Error('not a Motion Studio project'); await restore(d); toast('Project opened'); } catch (e) { toast('Could not open: ' + e.message); } };
  const restore = async (d) => { pause(); imgs.current.clear(); imgData.current.clear(); arguments_restoring.current = true; for (const im of d.images || []) await loadImage(im.data, im.name, im.id); arguments_restoring.current = false; h.reset(d.comp); setSelId(null); setSelKeys([]); seek(0); };
  const restored = useRef(false); const saveT = useRef(0);
  useEffect(() => { (async () => { try { const r = await idbGet('motion-project'); if (r && r.comp && r.comp.layers && r.comp.layers.length) { await restore(r); toast('Restored your last composition'); } } catch { /* ignore */ } restored.current = true; })(); }, []); // eslint-disable-line
  useEffect(() => { if (!restored.current) return undefined; clearTimeout(saveT.current); setSave('Unsaved changes'); saveT.current = setTimeout(async () => { const ok = await idbSet('motion-project', { kind: 'techomato-motion', comp, images: [...imgData.current.entries()].map(([id, v]) => ({ id, ...v })) }); setSave(ok ? 'Autosaved' : 'Autosave unavailable'); }, 2000); return () => clearTimeout(saveT.current); }, [comp]);

  /* ---------- export ---------- */
  const mimes = () => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'].filter((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  const startVideo = (o) => {
    setDlg(null); pause(); const e = E.current; const c = h.ref.current; const W = Math.round((c.w * o.scale) / 2) * 2, H = Math.round((c.h * o.scale) / 2) * 2; const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const stream = canvas.captureStream(o.fps); let mr; try { mr = new MediaRecorder(stream, { mimeType: o.mime, videoBitsPerSecond: o.mbps * 1e6 }); } catch (err) { toast('Could not start the encoder: ' + err.message); return; }
    const chunks = []; mr.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data); e.exporting = { canvas, mr, chunks, mime: o.mime, name: o.name, cancelled: false }; e.endAt = c.dur; renderComp(canvas.getContext('2d'), W, H, c, 0, imgs.current); mr.start(250); pos.current = 0; e.playing = false; const lp = loop; setLoop(false); e.loopWas = lp; play(); e.timer = setInterval(() => setProg({ pct: pos.current / c.dur, name: o.name, label: 'Recording in real time…' }), 200);
  };
  const finishExport = () => { const e = E.current; const x = e.exporting; if (!x) return; clearInterval(e.timer); e.exporting = null; e.endAt = null; pause(); setLoop(!!e.loopWas); x.mr.onstop = () => { if (!x.cancelled) { const blob = new Blob(x.chunks, { type: x.mime.split(';')[0] }); const ext = x.mime.includes('mp4') ? 'mp4' : 'webm'; downloadBlob(blob, `${safeName(x.name)}.${ext}`); toast(`Exported ${safeName(x.name)}.${ext} (${(blob.size / 1e6).toFixed(1)} MB)`); } setProg(null); }; try { x.mr.stop(); } catch { setProg(null); } };
  const cancelExport = () => { const e = E.current; if (e.exporting) { e.exporting.cancelled = true; finishExport(); toast('Export cancelled'); } else e.cancelSeq = true; };
  const downloadBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const startSeq = async (o) => {
    setDlg(null); pause(); const e = E.current; e.cancelSeq = false; const c = h.ref.current; const W = Math.round(c.w * o.scale), H = Math.round(c.h * o.scale); const n = Math.max(1, Math.round(c.dur * c.fps)); const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const g = canvas.getContext('2d'); const files = [];
    for (let i = 0; i < n; i++) { if (e.cancelSeq) { setProg(null); toast('Export cancelled'); return; } renderComp(g, W, H, c, i / c.fps, imgs.current, { transparent: o.alpha }); const blob = await new Promise((r) => canvas.toBlob(r, 'image/png')); files.push({ name: `${safeName(o.name)}_${String(i).padStart(4, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) }); if (i % 3 === 0) { setProg({ pct: i / n, name: o.name, label: `Rendering frame ${i + 1} of ${n}…` }); await new Promise((r) => setTimeout(r, 0)); } }
    downloadBlob(makeZip(files), `${safeName(o.name)}-frames.zip`); setProg(null); toast(`Exported ${n} PNG frames`);
  };
  const exportFrame = () => { const c = document.createElement('canvas'); c.width = comp.w; c.height = comp.h; renderComp(c.getContext('2d'), comp.w, comp.h, comp, pos.current, imgs.current); c.toBlob((b) => downloadBlob(b, `${safeName(comp.name)}-frame.png`)); };

  /* ---------- timeline interaction ---------- */
  const laneW = Math.max(comp.dur + 2, 6) * pps;
  const secOf = (clientX) => { const r = scroll.current.getBoundingClientRect(); return (clientX - r.left + scroll.current.scrollLeft - HEAD) / pps; };
  const rulerDown = (e) => { if (e.button !== 0) return; pause(); const el = e.currentTarget; el.setPointerCapture(e.pointerId); const go = (ev) => { const t = Math.round(secOf(ev.clientX) * comp.fps) / comp.fps; seek(t); setTick((x) => x + 1); }; go(e); const up = () => { el.removeEventListener('pointermove', go); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', go); el.addEventListener('pointerup', up); };
  const dragWith = (e, fn, onDone) => { e.stopPropagation(); const x0 = e.clientX; const snap = h.ref.current; const el = e.currentTarget; el.setPointerCapture(e.pointerId); let moved = false; const mv = (ev) => { const dt = (ev.clientX - x0) / pps; if (!moved && Math.abs(ev.clientX - x0) < 3) return; moved = true; liveSet(() => fn(snap, dt)); }; const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); if (moved) liveEnd(); else live.current = null; onDone && onDone(moved); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); };
  const keyDown = (e, kid) => { if (e.button !== 0) return; const ids = selKeys.includes(kid) ? selKeys : e.shiftKey ? [...selKeys, kid] : [kid]; setSelKeys(ids); const set = new Set(ids); dragWith(e, (snap, dt) => mapProps(snap, (p) => (p.k.some((k) => set.has(k.id)) ? { ...p, k: p.k.map((k) => (set.has(k.id) ? { ...k, t: clamp(Math.round((k.t + dt) * comp.fps) / comp.fps, 0, comp.dur) } : k)).sort((a, b) => a.t - b.t) } : p))); };
  const barDown = (e, l, mode) => { if (e.button !== 0) return; setSelId(l.id); setSelKeys([]); dragWith(e, (snap, dt) => ({ ...snap, layers: snap.layers.map((x) => { if (x.id !== l.id) return x; const q = (v) => Math.round(v * comp.fps) / comp.fps; if (mode === 'move') { const d = clamp(q(dt), -x.in, comp.dur * 4); return { ...x, in: x.in + d, out: x.out + d }; } if (mode === 'in') return { ...x, in: clamp(q(x.in + dt), 0, x.out - 0.1) }; return { ...x, out: clamp(q(x.out + dt), x.in + 0.1, comp.dur * 4) }; }) })); };
  const fitZoomT = () => { const sc = scroll.current; setPps(clamp((sc.clientWidth - HEAD - 30) / comp.dur, 20, 600)); sc.scrollLeft = 0; };

  /* ---------- viewer overlay interaction ---------- */
  const disp = useMemo(() => { const fit = Math.min((box.w - 24) / comp.w, (box.h - 24) / comp.h); const z = zoom === 'fit' ? Math.max(0.05, fit) : zoom; return z; }, [box, comp.w, comp.h, zoom]);
  const svgPt = (e) => { const r = e.currentTarget.ownerSVGElement ? e.currentTarget.ownerSVGElement.getBoundingClientRect() : e.currentTarget.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * comp.w, ((e.clientY - r.top) / r.height) * comp.h]; };
  const dragSvg = (e, onMove) => { e.stopPropagation(); e.preventDefault(); const el = e.currentTarget; el.setPointerCapture(e.pointerId); const start = svgPt(e); const mv = (ev) => onMove(svgPt({ currentTarget: el, clientX: ev.clientX, clientY: ev.clientY }), start, ev); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); liveEnd(); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); };
  const canvasDown = (e) => {
    if (e.button !== 0) return; const t = pos.current; const c = h.ref.current; const [x, y] = svgPt(e); const hit = hitLayer(c, t, x, y); setSelKeys([]);
    if (!hit) { setSelId(null); return; } setSelId(hit.id); if (hit.lock) return; startMove(e, hit);
  };
  const startMove = (e, Ly) => {
    const t = pos.current; const c0 = h.ref.current; const base = values(c0, Ly, t); const pl = parentLinear(c0, Ly, t); const pi = inv([pl[0], pl[1], pl[2], pl[3], 0, 0]);
    dragSvg(e, (p, s) => { const dx = p[0] - s[0], dy = p[1] - s[1]; const lx = pi[0] * dx + pi[2] * dy, ly = pi[1] * dx + pi[3] * dy; setVal(Ly.id, { k: 'p', n: 'x' }, Math.round((base.x + lx) * 10) / 10); setVal(Ly.id, { k: 'p', n: 'y' }, Math.round((base.y + ly) * 10) / 10); });
  };
  const handleScale = (e) => {
    if (!L) return; const t = pos.current; const c0 = h.ref.current; const base = values(c0, L, t); const m = worldM(c0, L, t); const a = apply(m, base.ax, base.ay); const [sx0, sy0] = svgPt(e); const d0 = Math.hypot(sx0 - a[0], sy0 - a[1]) || 1;
    dragSvg(e, (p, _s, ev) => { const k = Math.hypot(p[0] - a[0], p[1] - a[1]) / d0; const nx = Math.round(base.sx * k), ny = ev.shiftKey ? base.sy : Math.round(base.sy * k); setVal(L.id, { k: 'p', n: 'sx' }, ev.shiftKey ? base.sx * k : nx); setVal(L.id, { k: 'p', n: 'sy' }, ny); });
  };
  const handleRot = (e) => { if (!L) return; const t = pos.current; const c0 = h.ref.current; const base = values(c0, L, t); const m = worldM(c0, L, t); const a = apply(m, base.ax, base.ay); const [x0, y0] = svgPt(e); const a0 = Math.atan2(y0 - a[1], x0 - a[0]); dragSvg(e, (p, _s, ev) => { let d = ((Math.atan2(p[1] - a[1], p[0] - a[0]) - a0) * 180) / Math.PI; if (ev.shiftKey) d = Math.round(d / 15) * 15; setVal(L.id, { k: 'p', n: 'rot' }, Math.round((base.rot + d) * 10) / 10); }); };
  const handleAnchor = (e) => { if (!L) return; const t = pos.current; const c0 = h.ref.current; const base = values(c0, L, t); const m = worldM(c0, L, t); const im = inv(m); const r = (base.rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r); const sx = base.sx / 100, sy = base.sy / 100; const pl = parentLinear(c0, L, t); const pi = inv([pl[0], pl[1], pl[2], pl[3], 0, 0]); void im;
    dragSvg(e, (p, s) => { const w0 = apply(m, base.ax, base.ay); const ww = [w0[0] + (p[0] - s[0]), w0[1] + (p[1] - s[1])]; const loc = apply(inv(m), ww[0], ww[1]); const nax = loc[0], nay = loc[1]; const dax = nax - base.ax, day = nay - base.ay; const dl = [cs * sx * dax - sn * sy * day, sn * sx * dax + cs * sy * day]; void pi; setVal(L.id, { k: 'p', n: 'ax' }, Math.round(nax)); setVal(L.id, { k: 'p', n: 'ay' }, Math.round(nay)); setVal(L.id, { k: 'p', n: 'x' }, base.x + dl[0]); setVal(L.id, { k: 'p', n: 'y' }, base.y + dl[1]); });
  };

  useHotkeys({
    space: togglePlay, home: () => { seek(0); setTick((x) => x + 1); }, end: () => { seek(comp.dur); setTick((x) => x + 1); }, delete: removeSel, backspace: removeSel, 'ctrl+d': dupLayer, 'ctrl+shift+d': splitLayer, 'ctrl+z': h.undo, 'ctrl+shift+z': h.redo, 'ctrl+y': h.redo, '[': () => setInOut('in'), ']': () => setInOut('out'), 'ctrl+]': () => reorder(-1), 'ctrl+[': () => reorder(1), f9: easyAll, arrowleft: () => step(-1), arrowright: () => step(1), 'shift+arrowleft': () => step(-10), 'shift+arrowright': () => step(10), 'ctrl+i': addImage, 'ctrl+e': () => setDlg({ k: 'video' }), '=': () => setPps((p) => clamp(p * 1.4, 20, 600)), '-': () => setPps((p) => clamp(p / 1.4, 20, 600)), 'ctrl+a': () => setSelKeys(comp.layers.flatMap((l) => [...Object.values(l.p), ...l.fx.flatMap((f) => Object.values(f.p))].flatMap((p) => p.k.map((k) => k.id)))), escape: () => { setSelKeys([]); setSelId(null); },
  });

  const menus = [
    { label: 'File', items: [{ label: 'New composition', icon: 'newPage', onClick: newComp }, { label: 'Open project…', icon: 'folder', onClick: openProject }, { label: 'Save project', icon: 'download', onClick: () => downloadFile(`${safeName(comp.name)}.motion.json`, projectJSON(), 'application/json') }, { sep: true }, { label: 'Import image…', icon: 'image', kbd: 'Ctrl+I', onClick: addImage }, { sep: true }, { label: 'Export video…', icon: 'film', kbd: 'Ctrl+E', onClick: () => setDlg({ k: 'video' }) }, { label: 'Export PNG sequence (.zip)…', onClick: () => setDlg({ k: 'seq' }) }, { label: 'Export current frame (PNG)', onClick: exportFrame }, { sep: true }, { label: 'Load sample composition', icon: 'play', onClick: loadSample }] },
    { label: 'Edit', items: [{ label: 'Undo', icon: 'undo', kbd: 'Ctrl+Z', onClick: h.undo, disabled: !h.canUndo }, { label: 'Redo', icon: 'redo', kbd: 'Ctrl+Shift+Z', onClick: h.redo, disabled: !h.canRedo }, { sep: true }, { label: 'Duplicate layer', kbd: 'Ctrl+D', onClick: dupLayer }, { label: 'Delete', kbd: 'Del', onClick: removeSel }, { label: 'Select all keyframes', kbd: 'Ctrl+A', onClick: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })) }] },
    { label: 'Layer', items: [{ head: 'New' }, { label: 'Text', icon: 'textT', onClick: () => addLayer('text') }, { label: 'Solid', icon: 'square', onClick: () => addLayer('solid', { name: 'Solid', color: '#3b82f6' }) }, { label: 'Rectangle', icon: 'rectSel', onClick: () => addShape('rect') }, { label: 'Ellipse', icon: 'ellipseSel', onClick: () => addShape('ellipse') }, { label: 'Star', icon: 'star', onClick: () => addShape('star') }, { label: 'Polygon', onClick: () => addShape('poly') }, { label: 'Null object', icon: 'circleDot', onClick: () => addLayer('null', { name: 'Null' }) }, { sep: true }, { label: 'Split at playhead', icon: 'scissorsV', kbd: 'Ctrl+Shift+D', onClick: splitLayer }, { label: 'Set layer in point', kbd: '[', onClick: () => setInOut('in') }, { label: 'Set layer out point', kbd: ']', onClick: () => setInOut('out') }, { sep: true }, { label: 'Bring forward', kbd: 'Ctrl+]', onClick: () => reorder(-1) }, { label: 'Send backward', kbd: 'Ctrl+[', onClick: () => reorder(1) }] },
    { label: 'Animation', items: [...PRESETS.map(([id, label]) => ({ label, onClick: () => preset(id) })), { sep: true }, { label: 'Easy ease selected keys', kbd: 'F9', onClick: easyAll }, ...EASE_PRESETS.map(([label, e]) => ({ label: `Key ease: ${label}`, onClick: () => setEase(e) }))] },
    { label: 'Effect', items: Object.entries(EFFECTS).map(([k, d]) => ({ label: d.label, icon: 'fxIco', onClick: () => addEffect(k) })) },
    { label: 'View', items: [{ label: 'Fit in window', onClick: () => setZoom('fit') }, { label: '50%', onClick: () => setZoom(0.5) }, { label: '100%', onClick: () => setZoom(1) }, { label: '200%', onClick: () => setZoom(2) }, { sep: true }, { label: 'Timeline zoom in', kbd: '=', onClick: () => setPps((p) => clamp(p * 1.4, 20, 600)) }, { label: 'Timeline zoom out', kbd: '-', onClick: () => setPps((p) => clamp(p / 1.4, 20, 600)) }, { label: 'Fit timeline', onClick: fitZoomT }, { sep: true }, { label: 'Graph editor', onClick: () => setBottom(bottom === 'graph' ? 'timeline' : 'graph') }] },
    { label: 'Help', items: [{ label: 'Keyboard shortcuts', icon: 'keyboard', onClick: () => setDlg({ k: 'keys' }) }, { label: 'Expression help', icon: 'bulb', onClick: () => setDlg({ k: 'expr' }) }] },
  ];
  function addEffect(type) { if (!L) return toast('Select a layer first'); updLayer(L.id, (l) => ({ ...l, fx: [...l.fx, mkEffect(type)] })); setRtab('effects'); }

  /* ---------- timeline rows ---------- */
  const rows = []; for (const l of comp.layers) { rows.push({ k: 'layer', l }); if (open[l.id]) { for (const [n, label, min, max, unit] of propsOf(l)) rows.push({ k: 'prop', l, path: { k: 'p', n }, label, min, max, unit }); l.fx.forEach((f, i) => { rows.push({ k: 'fx', l, f, i }); for (const [n, label, min, max, , unit] of EFFECTS[f.type].params) rows.push({ k: 'prop', l, path: { k: 'fx', i, n }, label: `${EFFECTS[f.type].label} · ${label}`, min, max, unit }); }); } }
  const ticks = []; { const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30]; const st = steps.find((s) => s * pps >= 70) || 60; for (let t = 0; t <= laneW / pps; t += st) ticks.push([t, st]); }
  const total = rows.reduce((s, r) => s + (r.k === 'layer' ? ROW_L : ROW_P), 0);
  const parentOpts = (l) => comp.layers.filter((x) => x.id !== l.id);
  const toggleOpen = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const selectProp = (l, path) => { setSelId(l.id); setSelProp({ id: l.id, path }); const p = refOf(l, path); setExprDraft((p && p.ex) || ''); };

  const nameOf = (id) => { const l = comp.layers.find((x) => x.id === id); return l ? l.name : '—'; };
  const selPropObj = selProp && (() => { const Lp = comp.layers.find((x) => x.id === selProp.id); return Lp ? { L: Lp, p: refOf(Lp, selProp.path) } : null; })();
  useEffect(() => { if (selProp && !selPropObj) setSelProp(null); }, [comp]); // eslint-disable-line
  const quad = L && L.vis && !playing ? quadOf(comp, L, pos.current) : null; const lv = L ? values(comp, L, pos.current) : null; const anchorPt = L ? apply(worldM(comp, L, pos.current), lv.ax, lv.ay) : null;
  const rotPt = quad ? (() => { const mx = (quad[0][0] + quad[1][0]) / 2, my = (quad[0][1] + quad[1][1]) / 2; const dx = quad[1][0] - quad[0][0], dy = quad[1][1] - quad[0][1]; const len = Math.hypot(dx, dy) || 1; const nx = dy / len, ny = -dx / len; const k = 34 / disp; return [mx + nx * k, my + ny * k]; })() : null;
  const hs = 6 / disp;

  return (
    <div className="fx stu motion" style={{ '--brand': '#f06bd0', '--brand-ink': '#2a0a22' }} data-app="motion">
      <AppBar id="motion" name="Techomato Motion Studio" right={<><input className="mot-name" aria-label="Composition name" value={comp.name} onChange={(e) => upd((c) => ({ ...c, name: e.target.value }))} /><span className="stu-hint" aria-live="polite">{save}</span><button type="button" className="fb pri" onClick={() => setDlg({ k: 'video' })}><Icon name="upload" size={14} />Export</button></>} />
      <StudioMenu menus={menus} />
      <div className="stu-body mot-body">
        <div className="stu-center mot-center">
          <div className="mot-viewbar" role="toolbar" aria-label="Viewer tools">
            <button type="button" className="stu-btn" onClick={() => addLayer('text')}><Icon name="textT" size={13} />Text</button>
            <button type="button" className="stu-btn" onClick={() => addShape('rect')}><Icon name="rectSel" size={13} />Rectangle</button>
            <button type="button" className="stu-btn" onClick={() => addShape('ellipse')}><Icon name="ellipseSel" size={13} />Ellipse</button>
            <button type="button" className="stu-btn" onClick={() => addShape('star')}><Icon name="star" size={13} />Star</button>
            <button type="button" className="stu-btn" onClick={() => addLayer('solid', { name: 'Solid', color: '#3b82f6' })}><Icon name="square" size={13} />Solid</button>
            <button type="button" className="stu-btn" onClick={() => addLayer('null', { name: 'Null' })}><Icon name="circleDot" size={13} />Null</button>
            <button type="button" className="stu-btn" onClick={addImage}><Icon name="image" size={13} />Image</button>
            <span className="spacer" />
            <label className="mot-sel">Zoom<select className="stu-sel" aria-label="Viewer zoom" value={zoom} onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : +e.target.value)}><option value="fit">Fit</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="1">100%</option><option value="2">200%</option></select></label>
            <label className="mot-sel">Quality<select className="stu-sel" aria-label="Preview quality" value={res} onChange={(e) => setRes(+e.target.value)}><option value="1">Full</option><option value="0.5">Half</option><option value="0.25">Quarter</option></select></label>
          </div>
          <div className="mot-stage" ref={stage}>
            <div className="mot-comp" style={{ width: comp.w * disp, height: comp.h * disp }}>
              <canvas ref={cv} width={cw} height={chh} className="mot-canvas" aria-label="Composition viewer" />
              <svg className="mot-ov" viewBox={`0 0 ${comp.w} ${comp.h}`} onPointerDown={canvasDown} aria-label="Selection overlay">
                {quad && <polygon className="mot-quad" points={quad.map((p) => p.join(',')).join(' ')} strokeWidth={1.5 / disp} />}
                {quad && L.type === 'null' && <rect x="0" y="0" width="0" height="0" />}
                {quad && !L.lock && <>{quad.map((p, i) => <rect key={i} className="mot-h" x={p[0] - hs} y={p[1] - hs} width={hs * 2} height={hs * 2} strokeWidth={1.5 / disp} onPointerDown={handleScale} />)}
                  {rotPt && <><line className="mot-rl" x1={(quad[0][0] + quad[1][0]) / 2} y1={(quad[0][1] + quad[1][1]) / 2} x2={rotPt[0]} y2={rotPt[1]} strokeWidth={1.2 / disp} /><circle className="mot-h rot" cx={rotPt[0]} cy={rotPt[1]} r={hs * 1.15} strokeWidth={1.5 / disp} onPointerDown={handleRot} aria-label="Rotate handle" /></>}
                  {anchorPt && <g className="mot-anchor" onPointerDown={handleAnchor} aria-label="Anchor point"><circle cx={anchorPt[0]} cy={anchorPt[1]} r={hs * 1.2} strokeWidth={1.5 / disp} /><path d={`M${anchorPt[0] - hs * 2},${anchorPt[1]}H${anchorPt[0] + hs * 2}M${anchorPt[0]},${anchorPt[1] - hs * 2}V${anchorPt[1] + hs * 2}`} strokeWidth={1.5 / disp} /></g>}</>}
              </svg>
              {comp.layers.length === 0 && <div className="mot-welcome"><h2>Create something that moves</h2><p>Add layers from the toolbar, set keyframes with the stopwatch, ease them, add effects and export a video.</p><div><button type="button" className="stu-btn pri" onClick={loadSample}>Load sample animation</button><button type="button" className="stu-btn" onClick={() => addLayer('text')}>Add text</button><button type="button" className="stu-btn" onClick={() => addShape('star')}>Add a star</button></div></div>}
            </div>
          </div>
          <div className="mot-transport" role="toolbar" aria-label="Transport">
            <span className="mot-tc" role="timer" aria-label="Current time"><span ref={tcRef}>00:00:00</span></span>
            <button type="button" className="stu-ib big" aria-label="Go to start" onClick={() => { seek(0); setTick((x) => x + 1); }}><Icon name="skipBack" size={17} /></button>
            <button type="button" className="stu-ib big" aria-label="Previous frame" title="Previous frame" onClick={() => step(-1)}><Icon name="chevronLeft" size={17} /></button>
            <button type="button" className={'stu-ib big' + (playing ? ' on' : '')} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={20} /></button>
            <button type="button" className="stu-ib big" aria-label="Next frame" title="Next frame" onClick={() => step(1)}><Icon name="chevronRight" size={17} /></button>
            <button type="button" className="stu-ib big" aria-label="Go to end" onClick={() => { seek(comp.dur); setTick((x) => x + 1); }}><Icon name="skipFwd" size={17} /></button>
            <button type="button" className={'stu-ib big' + (loop ? ' on' : '')} aria-label="Loop playback" aria-pressed={loop} onClick={() => setLoop(!loop)}><Icon name="loopIco" size={17} /></button>
            <span className="stu-hint mot-total">{comp.w}×{comp.h} · {comp.fps} fps · {comp.dur}s</span>
          </div>
          <div className="mot-tl">
            <div className="mot-tabs"><div className="stu-tabs" role="tablist">{[['timeline', 'Timeline'], ['graph', 'Graph editor']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={bottom === k} className={'stu-tab' + (bottom === k ? ' on' : '')} onClick={() => setBottom(k)}>{l}</button>)}</div>
              <span className="spacer" /><button type="button" className="stu-ib" aria-label="Zoom timeline out" onClick={() => setPps((p) => clamp(p / 1.4, 20, 600))}><Icon name="zoomOut" size={15} /></button><button type="button" className="stu-ib" aria-label="Zoom timeline in" onClick={() => setPps((p) => clamp(p * 1.4, 20, 600))}><Icon name="zoomIn" size={15} /></button><button type="button" className="stu-btn" onClick={fitZoomT}>Fit</button></div>
            {bottom === 'timeline' && <div className="mot-scroll" ref={scroll}>
              <div className="mot-content" style={{ width: HEAD + laneW, height: RULER + total + 20 }}>
                <div className="mot-ruler-row" style={{ height: RULER }}><div className="mot-corner" style={{ width: HEAD }}><span className="stu-hint">{comp.layers.length} layer{comp.layers.length === 1 ? '' : 's'}</span></div><div className="mot-ruler" style={{ width: laneW }} onPointerDown={rulerDown} role="slider" aria-label="Timeline ruler" aria-valuenow={pos.current}>
                  <div className="mot-endmark" style={{ left: comp.dur * pps }} />
                  {ticks.map(([t, st], i) => <i key={i} style={{ left: t * pps }}><span>{st < 1 ? t.toFixed(1) : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`}</span></i>)}</div></div>
                <div className="mot-rows">
                  {rows.map((r, ri) => {
                    if (r.k === 'layer') { const l = r.l; const on = l.id === selId; return (
                      <div className={'mot-row layer' + (on ? ' sel' : '')} key={'L' + l.id} style={{ height: ROW_L }} onContextMenu={(e) => { setSelId(l.id); showCtx(e, [{ label: 'Rename', onClick: () => renameLayer(l) }, { label: 'Duplicate', onClick: dupLayer }, { label: 'Split at playhead', onClick: splitLayer }, { sep: true }, { label: 'Bring forward', onClick: () => reorder(-1) }, { label: 'Send backward', onClick: () => reorder(1) }, { sep: true }, { label: 'Delete', icon: 'trash', onClick: removeSel }]); }}>
                        <div className="mot-hd" style={{ width: HEAD }} onClick={() => { setSelId(l.id); setSelKeys([]); }}>
                          <button type="button" className="stu-ib sm" aria-label={`${open[l.id] ? 'Collapse' : 'Expand'} ${l.name}`} aria-expanded={!!open[l.id]} onClick={(e) => { e.stopPropagation(); toggleOpen(l.id); }}><Icon name={open[l.id] ? 'chevronDown' : 'chevronRight'} size={12} /></button>
                          <button type="button" className={'stu-ib sm' + (l.vis ? ' on' : '')} aria-label={`${l.vis ? 'Hide' : 'Show'} ${l.name}`} aria-pressed={l.vis} onClick={(e) => { e.stopPropagation(); updLayer(l.id, { vis: !l.vis }); }}><Icon name={l.vis ? 'eye' : 'eyeOff'} size={13} /></button>
                          <button type="button" className={'stu-ib sm' + (l.solo ? ' on' : '')} aria-label={`Solo ${l.name}`} aria-pressed={l.solo} title="Solo" onClick={(e) => { e.stopPropagation(); updLayer(l.id, { solo: !l.solo }); }}><Icon name="circleDot" size={12} /></button>
                          <button type="button" className={'stu-ib sm' + (l.lock ? ' on' : '')} aria-label={`${l.lock ? 'Unlock' : 'Lock'} ${l.name}`} aria-pressed={l.lock} onClick={(e) => { e.stopPropagation(); updLayer(l.id, { lock: !l.lock }); }}><Icon name={l.lock ? 'lock' : 'unlock'} size={12} /></button>
                          <i className="mot-tag" style={{ background: KIND_COLOR[l.type] }} />
                          <span className="mot-ln ellip" onDoubleClick={() => renameLayer(l)} title="Double-click to rename"><Icon name={KIND_ICON[l.type]} size={12} /> {l.name}</span>
                          <select className="mot-par" aria-label={`Parent of ${l.name}`} value={l.parent || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updLayer(l.id, { parent: e.target.value || null })}><option value="">No parent</option>{parentOpts(l).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                        </div>
                        <div className="mot-lane" style={{ width: laneW }} onPointerDown={(e) => { if (e.target === e.currentTarget) { setSelId(l.id); setSelKeys([]); } }}>
                          <div className={'mot-bar t-' + l.type + (on ? ' on' : '') + (l.vis ? '' : ' off')} style={{ left: l.in * pps, width: Math.max(4, (l.out - l.in) * pps) }} onPointerDown={(e) => barDown(e, l, 'move')} role="button" aria-label={`Layer bar ${l.name}`}><i className="hl" onPointerDown={(e) => barDown(e, l, 'in')} /><span className="ellip">{l.name}</span><i className="hr" onPointerDown={(e) => barDown(e, l, 'out')} /></div>
                        </div>
                      </div>); }
                    if (r.k === 'fx') return <div className="mot-row fxh" key={`F${r.f.id}`} style={{ height: ROW_P }}><div className="mot-hd sub" style={{ width: HEAD }}><span className="ind" /><Icon name="fxIco" size={12} /><b className="ellip">{EFFECTS[r.f.type].label}</b></div><div className="mot-lane" style={{ width: laneW }} /></div>;
                    const p = refOf(r.l, r.path); const key = pathKey(r.path); const sel = selProp && selProp.id === r.l.id && pathKey(selProp.path) === key; const val = Math.round(getProp(p, pos.current, comp.layers.indexOf(r.l)) * 100) / 100;
                    return (
                      <div className={'mot-row prop' + (sel ? ' sel' : '')} key={`${r.l.id}.${key}`} style={{ height: ROW_P }}>
                        <div className="mot-hd sub" style={{ width: HEAD }}><span className="ind" />
                          <button type="button" className={'mot-sw' + (hasKeys(p) ? ' on' : '')} aria-label={`Stopwatch ${r.label}`} aria-pressed={hasKeys(p)} title="Stopwatch: toggle animation" onClick={() => stopwatch(r.l, r.path)}><Icon name="clockIco" size={12} /></button>
                          <button type="button" className="mot-pn ellip" onClick={() => selectProp(r.l, r.path)} title="Select property">{r.label}{p.ex ? ' ƒ' : ''}</button>
                          {hasKeys(p) && <><button type="button" className="stu-ib sm" aria-label={`Previous keyframe of ${r.label}`} onClick={() => jumpKey(r.l, r.path, -1)}><Icon name="chevronLeft" size={11} /></button><button type="button" className={'stu-ib sm' + (keyHere(r.l, r.path) ? ' on' : '')} aria-label={`Toggle keyframe of ${r.label}`} onClick={() => addKeyHere(r.l, r.path)}><Icon name={keyHere(r.l, r.path) ? 'keyframe' : 'keyframeO'} size={11} /></button><button type="button" className="stu-ib sm" aria-label={`Next keyframe of ${r.label}`} onClick={() => jumpKey(r.l, r.path, 1)}><Icon name="chevronRight" size={11} /></button></>}
                          <span className="spacer" />
                          <input className="mot-val" aria-label={`${r.label} value`} defaultValue={val} key={val + '|' + (selId === r.l.id)} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} onBlur={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n) && n !== val) setVal(r.l.id, r.path, clamp(n, r.min, r.max), false); }} />
                        </div>
                        <div className="mot-lane" style={{ width: laneW }}>{p.k.map((k) => <i key={k.id} className={'mot-kf' + (selKeys.includes(k.id) ? ' on' : '') + (k.e === 'hold' ? ' hold' : Array.isArray(k.e) ? ' ez' : '')} style={{ left: k.t * pps }} role="button" aria-label={`Keyframe ${r.label} at ${k.t.toFixed(2)}s`} onPointerDown={(e) => keyDown(e, k.id)} onContextMenu={(e) => { setSelKeys([k.id]); showCtx(e, [...EASE_PRESETS.map(([label, ev]) => ({ label, onClick: () => { setEase(ev); } })), { sep: true }, { label: 'Delete keyframe', icon: 'trash', onClick: () => { setSelKeys([k.id]); setTimeout(deleteKeys, 0); } }]); }} />)}</div>
                      </div>);
                  })}
                  {comp.layers.length === 0 && <div className="mot-empty stu-hint">No layers yet — add text, a shape or an image from the toolbar above.</div>}
                </div>
                <div className="mot-ph" ref={phRef} style={{ left: HEAD }}><i /></div>
              </div>
            </div>}
            {bottom === 'graph' && <GraphEditor comp={comp} sel={selPropObj} selKeys={selKeys} setSelKeys={setSelKeys} pos={pos} seek={seek} liveSet={liveSet} liveEnd={liveEnd} fps={comp.fps} />}
          </div>
        </div>
        <aside className="stu-side wide mot-right" aria-label="Inspector">
          <div className="stu-tabs" role="tablist">{[['layer', 'Layer'], ['effects', 'Effects'], ['animate', 'Animate'], ['comp', 'Comp']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={rtab === k} className={'stu-tab' + (rtab === k ? ' on' : '')} onClick={() => setRtab(k)}>{l}</button>)}</div>
          {rtab === 'layer' && (L ? <>
            <PanelBox title={`Layer · ${L.name}`}>
              <Row label="Name"><input className="fi mot-fi" aria-label="Layer name" value={L.name} onChange={(e) => updLayer(L.id, { name: e.target.value }, true)} onBlur={liveEnd} /></Row>
              <Row label="Blend"><select className="stu-sel" aria-label="Blend mode" value={L.blend} onChange={(e) => updLayer(L.id, { blend: e.target.value })}>{BLENDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>
              <Row label="Parent"><select className="stu-sel" aria-label="Parent layer" value={L.parent || ''} onChange={(e) => updLayer(L.id, { parent: e.target.value || null })}><option value="">None</option>{parentOpts(L).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Row>
              <div className="stu-grid2"><Num label="In" value={+L.in.toFixed(2)} min={0} max={comp.dur * 4} step={0.05} slider={false} unit="s" onChange={(v) => updLayer(L.id, { in: Math.min(v, L.out - 0.05) }, true)} onCommit={liveEnd} /><Num label="Out" value={+L.out.toFixed(2)} min={0.1} max={comp.dur * 4} step={0.05} slider={false} unit="s" onChange={(v) => updLayer(L.id, { out: Math.max(v, L.in + 0.05) }, true)} onCommit={liveEnd} /></div>
              {nameOf(L.parent) && L.parent && <p className="stu-hint">Child of “{nameOf(L.parent)}” — it follows that layer’s position, scale and rotation.</p>}
            </PanelBox>
            {L.type === 'solid' && <PanelBox title="Solid"><Row label="Colour"><ColorField label="Solid colour" value={L.color} onChange={(v) => updLayer(L.id, { color: v }, true)} /></Row><div className="stu-grid2"><Num label="Width" value={L.w} min={1} max={8000} slider={false} unit="px" onChange={(v) => updLayer(L.id, { w: v }, true)} onCommit={liveEnd} /><Num label="Height" value={L.h} min={1} max={8000} slider={false} unit="px" onChange={(v) => updLayer(L.id, { h: v }, true)} onCommit={liveEnd} /></div></PanelBox>}
            {L.type === 'shape' && <PanelBox title="Shape">
              <Row label="Kind"><select className="stu-sel" aria-label="Shape kind" value={L.shape.kind} onChange={(e) => updLayer(L.id, (l) => ({ ...l, shape: { ...l.shape, kind: e.target.value } }))}><option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="star">Star</option><option value="poly">Polygon</option></select></Row>
              <div className="stu-grid2"><Num label="Width" value={L.w} min={1} max={8000} slider={false} unit="px" onChange={(v) => updLayer(L.id, { w: v }, true)} onCommit={liveEnd} /><Num label="Height" value={L.h} min={1} max={8000} slider={false} unit="px" onChange={(v) => updLayer(L.id, { h: v }, true)} onCommit={liveEnd} /></div>
              <Row label="Fill"><ColorField label="Fill colour" value={L.shape.fill} onChange={(v) => updLayer(L.id, (l) => ({ ...l, shape: { ...l.shape, fill: v } }), true)} /><label className="stu-chk"><input type="checkbox" checked={L.shape.hasFill} onChange={(e) => updLayer(L.id, (l) => ({ ...l, shape: { ...l.shape, hasFill: e.target.checked } }))} />Fill</label></Row>
              <Row label="Stroke"><ColorField label="Stroke colour" value={L.shape.stroke} onChange={(v) => updLayer(L.id, (l) => ({ ...l, shape: { ...l.shape, stroke: v } }), true)} /></Row>
              <Num label="Stroke width" value={L.shape.sw} min={0} max={80} unit="px" onChange={(v) => updLayer(L.id, (l) => ({ ...l, shape: { ...l.shape, sw: v } }), true)} onCommit={liveEnd} />
              {L.shape.kind === 'rect' && <Num label="Roundness" value={L.shape.radius} min={0} max={300} unit="px" onChange={(v) => updLayer(L.id, (l) => ({ ...l, shape: { ...l.shape, radius: v } }), true)} onCommit={liveEnd} />}
              {(L.shape.kind === 'star' || L.shape.kind === 'poly') && <Num label="Points" value={L.shape.points} min={3} max={24} onChange={(v) => updLayer(L.id, (l) => ({ ...l, shape: { ...l.shape, points: v } }), true)} onCommit={liveEnd} />}
              {L.shape.kind === 'star' && <Num label="Inner radius" value={L.shape.inner} min={0.1} max={0.95} step={0.05} onChange={(v) => updLayer(L.id, (l) => ({ ...l, shape: { ...l.shape, inner: v } }), true)} onCommit={liveEnd} />}
            </PanelBox>}
            {L.type === 'text' && <PanelBox title="Text">
              <textarea className="pho-ta mot-ta" aria-label="Text content" rows={3} value={L.text.str} onChange={(e) => setText({ str: e.target.value })} onBlur={liveEnd} />
              <Row label="Font"><select className="stu-sel" aria-label="Font" value={L.text.font} onChange={(e) => setText({ font: e.target.value }, false)}>{FONTS.map(([n, f]) => <option key={n} value={f}>{n}</option>)}</select></Row>
              <Num label="Size" value={L.text.size} min={8} max={600} unit="px" onChange={(v) => setText({ size: v })} onCommit={liveEnd} />
              <Row label="Colour"><ColorField label="Text colour" value={L.text.color} onChange={(v) => setText({ color: v })} /></Row>
              <Row label="Style">{['left', 'center', 'right'].map((a) => <button key={a} type="button" className={'stu-ib' + (L.text.align === a ? ' on' : '')} aria-label={`Align ${a}`} aria-pressed={L.text.align === a} onClick={() => setText({ align: a }, false)}><Icon name={'align' + a[0].toUpperCase() + a.slice(1)} size={14} /></button>)}<button type="button" className={'stu-ib' + (L.text.bold ? ' on' : '')} aria-label="Bold" aria-pressed={L.text.bold} onClick={() => setText({ bold: !L.text.bold }, false)}><Icon name="bold" size={14} /></button><button type="button" className={'stu-ib' + (L.text.italic ? ' on' : '')} aria-label="Italic" aria-pressed={L.text.italic} onClick={() => setText({ italic: !L.text.italic }, false)}><Icon name="italic" size={14} /></button></Row>
            </PanelBox>}
            {L.type === 'image' && <PanelBox title="Image"><div className="stu-grid2"><Num label="Width" value={L.w} min={1} max={8000} slider={false} unit="px" onChange={(v) => updLayer(L.id, { w: v }, true)} onCommit={liveEnd} /><Num label="Height" value={L.h} min={1} max={8000} slider={false} unit="px" onChange={(v) => updLayer(L.id, { h: v }, true)} onCommit={liveEnd} /></div></PanelBox>}
            <PanelBox title="Transform">{propsOf(L).map(([n, label, min, max, unit]) => { const path = { k: 'p', n }; const p = L.p[n]; const val = Math.round(cur(L, path) * 100) / 100; return <div className="mot-pf" key={n}><button type="button" className={'mot-sw' + (hasKeys(p) ? ' on' : '')} aria-label={`Panel stopwatch ${label}`} onClick={() => stopwatch(L, path)}><Icon name="clockIco" size={12} /></button><Num label={label} value={val} min={min} max={max} step={unit === '%' || unit === '°' ? 1 : 1} unit={unit} slider={false} onChange={(v) => setVal(L.id, path, v)} onCommit={liveEnd} /></div>; })}</PanelBox>
          </> : <PanelBox title="Layer"><p className="stu-hint">Select a layer in the timeline or click it in the viewer to edit it.</p></PanelBox>)}
          {rtab === 'effects' && (L ? <>
            <PanelBox title={`Effects · ${L.name}`} actions={<select className="stu-sel mot-add" aria-label="Add effect" value="" onChange={(e) => e.target.value && addEffect(e.target.value)}><option value="">Add…</option>{Object.entries(EFFECTS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}</select>}>
              {L.fx.length === 0 && <p className="stu-hint">No effects yet. Choose one with “Add…”. Effects can be keyframed with the stopwatch.</p>}
            </PanelBox>
            {L.fx.map((f, i) => <PanelBox key={f.id} title={EFFECTS[f.type].label} actions={<><label className="stu-chk"><input type="checkbox" aria-label={`Enable ${EFFECTS[f.type].label}`} checked={f.on} onChange={(e) => updLayer(L.id, (l) => ({ ...l, fx: l.fx.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) }))} /></label><button type="button" className="stu-ib sm" aria-label={`Remove ${EFFECTS[f.type].label}`} onClick={() => updLayer(L.id, (l) => ({ ...l, fx: l.fx.filter((_, j) => j !== i) }))}><Icon name="trash" size={12} /></button></>}>
              {EFFECTS[f.type].params.map(([n, label, min, max, , unit]) => { const path = { k: 'fx', i, n }; const p = f.p[n]; return <div className="mot-pf" key={n}><button type="button" className={'mot-sw' + (hasKeys(p) ? ' on' : '')} aria-label={`Effect stopwatch ${label}`} onClick={() => stopwatch(L, path)}><Icon name="clockIco" size={12} /></button><Num label={label} value={Math.round(cur(L, path) * 100) / 100} min={min} max={max} unit={unit} onChange={(v) => setVal(L.id, path, v)} onCommit={liveEnd} /></div>; })}
              {EFFECTS[f.type].color && <Row label="Colour"><ColorField label="Effect colour" value={f.c} onChange={(v) => updLayer(L.id, (l) => ({ ...l, fx: l.fx.map((x, j) => (j === i ? { ...x, c: v } : x)) }), true)} /></Row>}
            </PanelBox>)}
          </> : <PanelBox title="Effects"><p className="stu-hint">Select a layer to add effects such as blur, glow, drop shadow, tint and pixelate.</p></PanelBox>)}
          {rtab === 'animate' && <>
            <PanelBox title="Animation presets"><div className="mot-presets">{PRESETS.map(([id, label, d]) => <button key={id} type="button" className="stu-btn" title={d} onClick={() => preset(id)}>{label}</button>)}</div><p className="stu-hint">Presets are applied to the selected layer starting at the playhead.</p></PanelBox>
            <PanelBox title="Keyframe easing">
              {selKeyObj ? <><EaseEditor e={selKeyObj.e} onChange={setEase} onLive={(e) => setEase(e)} /><p className="stu-hint">{selKeys.length} keyframe{selKeys.length > 1 ? 's' : ''} selected · outgoing ease: {easeName(selKeyObj.e)}</p></> : <p className="stu-hint">Select keyframes in the timeline (click, or Shift-click for several). The ease shapes how the value travels to the <i>next</i> keyframe.</p>}
              <div className="mot-presets">{EASE_PRESETS.map(([label, e]) => <button key={label} type="button" className="stu-btn" onClick={() => setEase(e)}>{label}</button>)}</div>
            </PanelBox>
            <PanelBox title="Expression">
              {selPropObj ? <><p className="stu-hint">{selPropObj.L.name} › {selProp.path.n}</p><textarea className="pho-ta mot-ta mono" aria-label="Expression code" rows={4} spellCheck="false" placeholder="e.g. value + sin(time * 3) * 20" value={exprDraft} onChange={(e) => setExprDraft(e.target.value)} />{exprDraft && exprError(exprDraft) && <p className="mot-err" role="alert">{exprError(exprDraft)}</p>}<div className="aud-btns"><button type="button" className="stu-btn pri" onClick={() => applyExpr(exprDraft)}>Apply expression</button><button type="button" className="stu-btn" onClick={() => { setExprDraft(''); applyExpr(''); }}>Remove</button><button type="button" className="stu-btn" onClick={() => setDlg({ k: 'expr' })}>Help</button></div></> : <p className="stu-hint">Click a property name in the timeline (e.g. “Position Y”), then write an expression for it.</p>}
            </PanelBox>
          </>}
          {rtab === 'comp' && <PanelBox title="Composition settings">
            <Row label="Name"><input className="fi mot-fi" aria-label="Comp name" value={comp.name} onChange={(e) => liveSet((c) => ({ ...c, name: e.target.value }))} onBlur={liveEnd} /></Row>
            <Row label="Preset"><select className="stu-sel" aria-label="Size preset" value="" onChange={(e) => { const s = SIZE_PRESETS[+e.target.value]; if (s) upd((c) => ({ ...c, w: s[1], h: s[2] })); }}><option value="" disabled>Choose…</option>{SIZE_PRESETS.map((s, i) => <option key={s[0]} value={i}>{s[0]}</option>)}</select></Row>
            <div className="stu-grid2"><Num label="Width" value={comp.w} min={64} max={7680} slider={false} unit="px" onChange={(v) => liveSet((c) => ({ ...c, w: Math.round(v / 2) * 2 }))} onCommit={liveEnd} /><Num label="Height" value={comp.h} min={64} max={4320} slider={false} unit="px" onChange={(v) => liveSet((c) => ({ ...c, h: Math.round(v / 2) * 2 }))} onCommit={liveEnd} /></div>
            <Row label="Frame rate"><select className="stu-sel" aria-label="Frame rate" value={comp.fps} onChange={(e) => upd((c) => ({ ...c, fps: +e.target.value }))}>{[12, 24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></Row>
            <Num label="Duration" value={comp.dur} min={1} max={600} step={0.5} unit="s" onChange={(v) => liveSet((c) => ({ ...c, dur: v }))} onCommit={liveEnd} />
            <Row label="Background"><ColorField label="Background colour" value={comp.bg} onChange={(v) => liveSet((c) => ({ ...c, bg: v }))} /></Row>
          </PanelBox>}
        </aside>
      </div>
      {dlg?.k === 'video' && <ExportDialog comp={comp} mimes={mimes()} onClose={() => setDlg(null)} onOk={startVideo} onSeq={() => setDlg({ k: 'seq' })} />}
      {dlg?.k === 'seq' && <SeqDialog comp={comp} onClose={() => setDlg(null)} onOk={startSeq} />}
      {dlg?.k === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setDlg(null)} width={520} footer={<Foot onClose={() => setDlg(null)} ok="Close" onOk={() => setDlg(null)} />}><div className="aud-keys">{[['Space', 'Play / pause'], ['← →', 'Step one frame (Shift: 10)'], ['Home / End', 'Start / end'], ['[ / ]', 'Layer in / out at playhead'], ['Ctrl+D', 'Duplicate layer'], ['Ctrl+Shift+D', 'Split layer'], ['Ctrl+] / [', 'Bring forward / send backward'], ['Delete', 'Delete layer or selected keys'], ['F9', 'Easy ease keyframes'], ['Ctrl+A', 'Select all keyframes'], ['= / -', 'Zoom timeline'], ['Shift-drag corner', 'Scale non-uniformly'], ['Shift-drag rotate', 'Snap rotation to 15°'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo']].map(([k, d]) => <div key={k}><kbd>{k}</kbd><span>{d}</span></div>)}</div></Modal>}
      {dlg?.k === 'expr' && <Modal title="Expressions" onClose={() => setDlg(null)} width={560} footer={<Foot onClose={() => setDlg(null)} ok="Close" onOk={() => setDlg(null)} />}><div className="mot-help"><p>An expression is JavaScript that returns the value of one property at every frame. Available names:</p><ul><li><code>time</code> – seconds · <code>value</code> – the property’s keyframed value · <code>index</code> – layer number</li><li><code>wiggle(freq, amp)</code> – smooth random offset around <code>value</code></li><li><code>loopOut('cycle')</code> / <code>loopOut('pingpong')</code> – repeat the keyframes</li><li><code>linear(t, t1, t2, v1, v2)</code> · <code>smooth(t, t1, t2, v1, v2)</code> – remap a range</li><li><code>sin cos abs floor round min max sqrt pow PI rnd(a,b)</code></li></ul><p>Examples: <code>value + sin(time*3)*20</code> · <code>wiggle(5, 12)</code> · <code>loopOut('pingpong')</code> · <code>linear(time, 0, 2, 0, 360)</code></p></div></Modal>}
      {prog && <Modal title={`Exporting ${prog.name}`} onClose={() => {}} width={420} footer={<><span className="spacer" /><button type="button" className="fb" onClick={cancelExport}>Cancel</button></>}><div className="vid-prog" role="progressbar" aria-valuenow={Math.round(prog.pct * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${prog.pct * 100}%` }} /></div><p className="stu-hint">{prog.label} {Math.round(prog.pct * 100)}%</p></Modal>}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}

function EaseEditor({ e, onChange }) {
  const [drag, setDrag] = useState(null); const arr = Array.isArray(e) ? e : e === 'hold' ? [0, 0, 0, 0] : [0.25, 0.25, 0.75, 0.75]; const S = 150, pad = 18; const X = (v) => pad + v * (S - pad * 2), Y = (v) => S - pad - v * (S - pad * 2);
  const pts = []; for (let i = 0; i <= 40; i++) pts.push(`${X(i / 40)},${Y(e === 'hold' ? (i / 40 >= 1 ? 1 : 0) : ease(i / 40, e || 'linear'))}`);
  const move = (ev, which) => { const r = ev.currentTarget.getBoundingClientRect(); const x = clamp((ev.clientX - r.left - pad) / (S - pad * 2), 0, 1); const y = clamp(1 - (ev.clientY - r.top - pad) / (S - pad * 2), -0.6, 1.8); const n = [...arr]; if (which === 1) { n[0] = x; n[1] = y; } else { n[2] = x; n[3] = y; } onChange(n.map((v) => Math.round(v * 100) / 100)); };
  return (
    <svg className="mot-ease" width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-label="Ease curve editor" onPointerMove={(ev) => drag && move(ev, drag)} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
      <rect x={pad} y={pad} width={S - pad * 2} height={S - pad * 2} className="g" /><polyline points={pts.join(' ')} className="c" />
      {Array.isArray(e) && <><line x1={X(0)} y1={Y(0)} x2={X(arr[0])} y2={Y(arr[1])} className="hl" /><line x1={X(1)} y1={Y(1)} x2={X(arr[2])} y2={Y(arr[3])} className="hl" /><circle cx={X(arr[0])} cy={Y(arr[1])} r="6" className="hd" onPointerDown={(ev) => { ev.currentTarget.ownerSVGElement.setPointerCapture(ev.pointerId); setDrag(1); }} aria-label="Ease handle out" /><circle cx={X(arr[2])} cy={Y(arr[3])} r="6" className="hd" onPointerDown={(ev) => { ev.currentTarget.ownerSVGElement.setPointerCapture(ev.pointerId); setDrag(2); }} aria-label="Ease handle in" /></>}
    </svg>
  );
}

function GraphEditor({ comp, sel, selKeys, setSelKeys, pos, seek, liveSet, liveEnd, fps }) {
  const ref = useRef(null); const [size, setSize] = useState({ w: 600, h: 160 });
  useEffect(() => { const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return undefined; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);
  const { w, h } = size; const padL = 52, padR = 12, padT = 12, padB = 22; const iw = Math.max(10, w - padL - padR), ih = Math.max(10, h - padT - padB);
  if (!sel) return <div className="mot-graph" ref={ref}><p className="stu-hint mot-gh">Click a property name in the timeline to see its value graph here. Animated properties show draggable keyframes.</p></div>;
  const { L: Ly, p } = sel; const idx = comp.layers.indexOf(Ly); const N = Math.min(300, iw); const ys = []; for (let i = 0; i <= N; i++) ys.push(getProp(p, (i / N) * comp.dur, idx)); p.k.forEach((k) => ys.push(k.v));
  let lo = Math.min(...ys), hi = Math.max(...ys); if (hi - lo < 1e-6) { lo -= 1; hi += 1; } const m = (hi - lo) * 0.12; lo -= m; hi += m;
  const X = (t) => padL + (t / comp.dur) * iw, Y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih; const path = ys.slice(0, N + 1).map((v, i) => `${i ? 'L' : 'M'}${X((i / N) * comp.dur)},${Y(v)}`).join('');
  const down = (ev, k) => { ev.stopPropagation(); const ids = selKeys.includes(k.id) ? selKeys : [k.id]; setSelKeys(ids); const svg = ev.currentTarget.ownerSVGElement; svg.setPointerCapture(ev.pointerId); const r = svg.getBoundingClientRect(); const mv = (e2) => { const t = clamp(Math.round(((e2.clientX - r.left - padL) / iw) * comp.dur * fps) / fps, 0, comp.dur); const v = lo + (1 - (e2.clientY - r.top - padT) / ih) * (hi - lo); liveSet((c) => ({ ...c, layers: c.layers.map((l) => (l.id !== Ly.id ? l : { ...l, ...(() => { const patchP = (q) => ({ ...q, k: q.k.map((kk) => (kk.id === k.id ? { ...kk, t, v: Math.round(v * 100) / 100 } : kk)).sort((a, b) => a.t - b.t) }); const key = Object.entries(l.p).find(([, q]) => q.k.some((kk) => kk.id === k.id)); if (key) return { p: { ...l.p, [key[0]]: patchP(key[1]) } }; return { fx: l.fx.map((f) => { const kk = Object.entries(f.p).find(([, q]) => q.k.some((x) => x.id === k.id)); return kk ? { ...f, p: { ...f.p, [kk[0]]: patchP(kk[1]) } } : f; }) }; })() })) })); }; const up = () => { svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); liveEnd(); }; svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); };
  const grid = []; for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; grid.push(<g key={i}><line x1={padL} x2={padL + iw} y1={Y(v)} y2={Y(v)} className="gl" /><text x={padL - 6} y={Y(v) + 3} className="gt" textAnchor="end">{Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}</text></g>); }
  return (
    <div className="mot-graph" ref={ref}><svg width={w} height={h} role="img" aria-label={`Value graph of ${Ly.name} ${sel.p ? '' : ''}`} onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(clamp(((e.clientX - r.left - padL) / iw) * comp.dur, 0, comp.dur)); }}>
      {grid}<text x={padL} y={h - 6} className="gt">0s</text><text x={padL + iw} y={h - 6} className="gt" textAnchor="end">{comp.dur}s</text>
      <path d={path} className="gc" fill="none" />
      <line x1={X(pos.current)} x2={X(pos.current)} y1={padT} y2={padT + ih} className="gp" />
      {p.k.map((k) => <circle key={k.id} cx={X(k.t)} cy={Y(k.v)} r="5.5" className={'gk' + (selKeys.includes(k.id) ? ' on' : '')} onPointerDown={(e) => down(e, k)} aria-label={`Graph keyframe ${k.t.toFixed(2)}s`} />)}
    </svg></div>
  );
}

function ExportDialog({ comp, mimes, onClose, onOk, onSeq }) {
  const [mime, setMime] = useState(mimes[0] || ''); const [scale, setScale] = useState(1); const [fps, setFps] = useState(Math.min(comp.fps, 30)); const [mbps, setMbps] = useState(6); const [name, setName] = useState(comp.name);
  return <Modal title="Export video" onClose={onClose} width={440} footer={<><button type="button" className="fb" onClick={onSeq}>PNG sequence…</button><span className="spacer" /><button type="button" className="fb" onClick={onClose}>Cancel</button><button type="button" className="fb pri" disabled={!mime} onClick={() => onOk({ mime, scale, fps, mbps, name })}>Start export</button></>}>
    <div className="aud-dlg">
      <Row label="File name"><input className="fi mot-fi" aria-label="File name" value={name} onChange={(e) => setName(e.target.value)} /></Row>
      <Row label="Format"><select className="stu-sel" aria-label="Format" value={mime} onChange={(e) => setMime(e.target.value)}>{mimes.map((m) => <option key={m} value={m}>{m.includes('mp4') ? 'MP4 (H.264)' : m.includes('vp9') ? 'WebM (VP9)' : m.includes('vp8') ? 'WebM (VP8)' : 'WebM'}</option>)}</select></Row>
      <Row label="Size"><select className="stu-sel" aria-label="Output size" value={scale} onChange={(e) => setScale(+e.target.value)}>{[1, 0.75, 0.5, 0.25].map((s) => <option key={s} value={s}>{Math.round((comp.w * s) / 2) * 2} × {Math.round((comp.h * s) / 2) * 2} ({s * 100}%)</option>)}</select></Row>
      <Row label="Frame rate"><select className="stu-sel" aria-label="Export frame rate" value={fps} onChange={(e) => setFps(+e.target.value)}>{[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></Row>
      <Num label="Bitrate" value={mbps} min={1} max={40} step={0.5} unit="Mbps" onChange={setMbps} />
      <p className="stu-hint">The browser records the composition in real time, so a 6-second animation takes about 6 seconds. For frame-exact output use “PNG sequence”.</p>
    </div></Modal>;
}
function SeqDialog({ comp, onClose, onOk }) {
  const [scale, setScale] = useState(1); const [alpha, setAlpha] = useState(false); const [name, setName] = useState(comp.name); const n = Math.round(comp.dur * comp.fps);
  return <Modal title="Export PNG sequence" onClose={onClose} width={420} footer={<Foot onClose={onClose} ok="Render frames" onOk={() => onOk({ scale, alpha, name })} />}>
    <div className="aud-dlg"><Row label="Base name"><input className="fi mot-fi" aria-label="Base name" value={name} onChange={(e) => setName(e.target.value)} /></Row>
      <Row label="Size"><select className="stu-sel" aria-label="Sequence size" value={scale} onChange={(e) => setScale(+e.target.value)}>{[1, 0.5, 0.25].map((s) => <option key={s} value={s}>{Math.round(comp.w * s)} × {Math.round(comp.h * s)}</option>)}</select></Row>
      <label className="stu-chk"><input type="checkbox" checked={alpha} onChange={(e) => setAlpha(e.target.checked)} />Transparent background</label>
      <p className="stu-hint">{n} frames are rendered one by one and downloaded as a single .zip of numbered PNG files.</p></div></Modal>;
}
