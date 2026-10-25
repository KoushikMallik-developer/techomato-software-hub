import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast, useAsk, useContextMenu } from '../components/fxui.jsx';
import { StudioMenu, Num, Row, PanelBox, ColorField, useHotkeys, useRaf, useHistory, uid, clamp } from '../components/studio.jsx';
import { idbGet, idbSet } from '../lib/idb.js';
import { pickFiles, safeName } from '../lib/download.js';
import { renderFrame, TRANSITIONS, LOOKS, defaultFx, defaultText, clipFx, prop, kfValue, srcTime, projectDuration, fmtTC, fmtDur } from './video/engine.js';
import '../styles/video.css';

const HEAD_W = 128, RULER_H = 26, V_H = 56, A_H = 46;
const blankProject = () => ({ name: 'Untitled project', w: 1280, h: 720, fps: 30, bg: '#000000', tracks: [{ id: 'v1', type: 'video', name: 'V1' }, { id: 'v2', type: 'video', name: 'V2' }, { id: 'v3', type: 'video', name: 'V3' }, { id: 'a1', type: 'audio', name: 'A1' }, { id: 'a2', type: 'audio', name: 'A2' }], clips: [], markers: [], range: null });
const baseClip = (o) => ({ id: uid(), name: 'Clip', kind: 'video', track: 'v1', src: null, start: 0, in: 0, dur: 5, speed: 1, vol: 100, afi: 0, afo: 0, opacity: 100, x: 0, y: 0, scale: 100, rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 }, fx: {}, tIn: { type: 'none', dur: 0.6 }, tOut: { type: 'none', dur: 0.6 }, kf: {}, ...o });
const PROJECT_PRESETS = [['HD 1080p (1920×1080)', 1920, 1080], ['HD 720p (1280×720)', 1280, 720], ['Vertical 9:16 (1080×1920)', 1080, 1920], ['Square (1080×1080)', 1080, 1080], ['4K UHD (3840×2160)', 3840, 2160], ['SD 480p (854×480)', 854, 480]];
const TITLE_PRESETS = [['Centered title', { str: 'Your title', size: 110, ypos: 50, align: 'center', bg: '' }], ['Lower third', { str: 'Name Surname\nRole or place', size: 54, ypos: 82, align: 'left', bg: 'rgba(0,0,0,.55)', bold: true }], ['Subtitle', { str: 'Subtitle text goes here', size: 46, ypos: 90, align: 'center', bg: 'rgba(0,0,0,.45)', bold: false }], ['Big caption', { str: 'BIG\nCAPTION', size: 180, ypos: 50, align: 'center', bg: '', bold: true, outline: 4 }]];
const FONTS = ['Inter, Arial, sans-serif', 'Georgia, serif', '"Courier New", monospace', 'Impact, sans-serif', '"Trebuchet MS", sans-serif', '"Comic Sans MS", cursive', 'Verdana, sans-serif'];
const KFP = [['opacity', 'Opacity', 0, 100, 1, '%'], ['x', 'Position X', -3000, 3000, 1, 'px'], ['y', 'Position Y', -3000, 3000, 1, 'px'], ['scale', 'Scale', 5, 600, 1, '%'], ['rot', 'Rotation', -360, 360, 1, '°']];
const trackH = (t) => (t.type === 'video' ? V_H : A_H);
const kindIcon = { video: 'film', image: 'image', audio: 'waveform', title: 'textT', color: 'palette' };

const applyGhost = (P, g) => (g ? { ...P, clips: P.clips.map((c) => (g[c.id] ? { ...c, ...g[c.id] } : c)) } : P);

function Foot({ onClose, onOk, ok = 'OK', disabled }) { return <><span className="spacer" /><button type="button" className="fb" onClick={onClose}>Cancel</button><button type="button" className="fb pri" disabled={disabled} onClick={onOk}>{ok}</button></>; }

function Peaks({ peaks, off, dur, w, h }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current; if (!c || !peaks) return; const cw = Math.max(1, Math.min(4000, Math.round(w))); c.width = cw; c.height = h; const g = c.getContext('2d'); g.clearRect(0, 0, cw, h); g.fillStyle = 'rgba(255,255,255,.75)'; const n = peaks.length; const total = peaks.dur; for (let x = 0; x < cw; x++) { const t = off + (x / cw) * dur; const i = clamp(Math.floor((t / total) * n), 0, n - 1); const v = peaks[i] * h * 0.9; g.fillRect(x, (h - v) / 2, 1, Math.max(1, v)); } }, [peaks, off, dur, w, h]);
  return <canvas ref={ref} className="vid-peaks" style={{ width: w, height: h }} aria-hidden="true" />;
}

export default function VideoApp() {
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const h = useHistory(blankProject()); const P = h.state;
  const media = useRef(new Map()); const [mver, setMver] = useState(0); const mlist = useMemo(() => [...media.current.values()], [mver]); // eslint-disable-line
  const [sel, setSel] = useState([]); const [selMedia, setSelMedia] = useState(null); const [pps, setPps] = useState(42); const [ghost, setGhost] = useState(null); const [dlg, setDlg] = useState(null); const [leftTab, setLeftTab] = useState('media'); const [rightTab, setRightTab] = useState('clip'); const [save, setSave] = useState(''); const [playing, setPlaying] = useState(false); const [exp, setExp] = useState(null); const [applyTo, setApplyTo] = useState('both'); const [tick, setTick] = useState(0);
  const pos = useRef(0); const E = useRef({ playing: false, t0: 0, w0: 0, els: new Map(), imgs: new Map(), actx: null, master: null, dest: null, gains: new Map(), dirty: true, exporting: null }); const prev = useRef(null); const scroll = useRef(null); const phRef = useRef(null); const tcRef = useRef(null); const tc2Ref = useRef(null); const frame = useRef(null); const live = useRef(null); const clipboard = useRef([]);
  const Pr = h.ref; const L = useRef({}); L.current = { P, sel, pps, playing };
  const view = useMemo(() => applyGhost(P, ghost), [P, ghost]);
  const dur = projectDuration(view); const laneW = Math.max(dur + 15, 30) * pps;
  const upd = useCallback((fn) => { h.set(fn); E.current.dirty = true; }, [h]);
  const liveSet = (fn) => { if (!live.current) live.current = h.ref.current; h.set(fn, { record: false }); E.current.dirty = true; };
  const liveEnd = () => { if (live.current) { if (live.current !== h.ref.current) h.mark(live.current); live.current = null; } };
  const selClips = view.clips.filter((c) => sel.includes(c.id)); const selClip = selClips.length === 1 ? selClips[0] : null;
  const rows = useMemo(() => [...view.tracks.filter((t) => t.type === 'video')].reverse().concat(view.tracks.filter((t) => t.type === 'audio')), [view.tracks]);
  useEffect(() => { E.current.dirty = true; }, [P, sel, mver, tick]);

  /* ---------- media ---------- */
  const ensureActx = () => { const e = E.current; if (!e.actx) { e.actx = new (window.AudioContext || window.webkitAudioContext)(); e.master = e.actx.createGain(); e.dest = e.actx.createMediaStreamDestination(); e.master.connect(e.actx.destination); e.master.connect(e.dest); } return e.actx; };
  const getEl = useCallback((c) => {
    const e = E.current; const m = media.current.get(c.src); if (!m) return null;
    if (c.kind === 'image') { let im = e.imgs.get(m.id); if (!im) { im = new Image(); im.onload = () => { e.dirty = true; }; im.src = m.url; e.imgs.set(m.id, im); } return im.complete ? im : null; }
    if (c.kind !== 'video' && c.kind !== 'audio') return null;
    let el = e.els.get(c.id); if (!el) {
      el = document.createElement(c.kind === 'video' ? 'video' : 'audio'); el.preload = 'auto'; el.playsInline = true; el.src = m.url; el.addEventListener('seeked', () => { e.dirty = true; }); el.addEventListener('loadeddata', () => { e.dirty = true; });
      try { const ctx = ensureActx(); const src = ctx.createMediaElementSource(el); const g = ctx.createGain(); src.connect(g); g.connect(e.master); e.gains.set(c.id, g); } catch { /* audio graph unavailable */ }
      e.els.set(c.id, el);
    }
    return el;
  }, []);
  const readMeta = (file) => new Promise((res) => {
    const url = URL.createObjectURL(file); const isV = file.type.startsWith('video/'), isA = file.type.startsWith('audio/'), isI = file.type.startsWith('image/'); const m = { id: uid(), name: file.name, kind: isV ? 'video' : isA ? 'audio' : 'image', url, blob: file, duration: 5, w: 0, h: 0, thumb: '', peaks: null };
    if (isI) { const im = new Image(); im.onload = () => { m.w = im.naturalWidth; m.h = im.naturalHeight; m.thumb = thumbOf(im, im.naturalWidth, im.naturalHeight); res(m); }; im.onerror = () => res(null); im.src = url; return; }
    if (!isV && !isA) { res(null); return; }
    const el = document.createElement(isV ? 'video' : 'audio'); el.preload = 'metadata'; el.muted = true;
    el.onloadedmetadata = () => { m.duration = isFinite(el.duration) ? el.duration : 10; m.w = el.videoWidth || 0; m.h = el.videoHeight || 0; if (isV) { el.currentTime = Math.min(0.5, m.duration / 2); } else res(m); };
    el.onseeked = () => { m.thumb = thumbOf(el, el.videoWidth, el.videoHeight); res(m); }; el.onerror = () => res(null); el.src = url; setTimeout(() => res(m), 6000);
  });
  const thumbOf = (src, w, hh) => { try { const c = document.createElement('canvas'); c.width = 160; c.height = Math.round((160 * hh) / w) || 90; c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); } catch { return ''; } };
  const decodePeaks = async (m) => { if (m.kind === 'image' || m.blob.size > 70e6) return; try { const ctx = ensureActx(); const buf = await ctx.decodeAudioData(await m.blob.arrayBuffer()); const n = Math.min(4000, Math.max(200, Math.floor(buf.duration * 40))); const pk = new Float32Array(n); const d = buf.getChannelData(0); const per = d.length / n; for (let i = 0; i < n; i++) { let mx = 0; const a = Math.floor(i * per), z = Math.floor((i + 1) * per); for (let k = a; k < z; k += Math.max(1, Math.floor(per / 24))) mx = Math.max(mx, Math.abs(d[k])); pk[i] = mx; } pk.dur = buf.duration; m.peaks = pk; setMver((v) => v + 1); } catch { /* no audio track */ } };
  const importFiles = async (files) => {
    let n = 0; for (const f of files) { const m = await readMeta(f); if (!m) { toast(`${f.name} is not a supported media file`); continue; } media.current.set(m.id, m); n++; decodePeaks(m); setSelMedia(m.id); }
    setMver((v) => v + 1); if (n) toast(`Imported ${n} file${n > 1 ? 's' : ''}`);
  };
  const importDialog = async () => { const fs = await pickFiles('video/*,audio/*,image/*'); if (fs.length) importFiles(fs); };

  /* ---------- editing ---------- */
  const freeTrack = (type, start, d) => { const ts = P.tracks.filter((t) => t.type === type); for (const t of ts) if (!P.clips.some((c) => c.track === t.id && start < c.start + c.dur && start + d > c.start)) return t.id; return ts[0].id; };
  const addMedia = (id, at = pos.current, trackId) => {
    const m = media.current.get(id); if (!m) return; const type = m.kind === 'audio' ? 'audio' : 'video'; const d = m.kind === 'image' ? 5 : m.duration;
    const c = baseClip({ name: m.name.replace(/\.[^.]+$/, ''), kind: m.kind, src: id, start: at, dur: d, track: trackId || freeTrack(type, at, d) }); upd((p) => ({ ...p, clips: [...p.clips, c] })); setSel([c.id]); setRightTab('clip');
    if (P.clips.length === 0 && m.w && m.kind === 'video' && (m.w !== P.w || m.h !== P.h) && m.w <= 3840) setTimeout(() => toast(`Tip: set the project size to ${m.w}×${m.h} in Project settings to match this clip`), 300);
  };
  const addTitle = (preset = TITLE_PRESETS[0]) => { const c = baseClip({ name: preset[0], kind: 'title', track: freeTrack('video', pos.current, 4), start: pos.current, dur: 4, text: { ...defaultText(), ...preset[1] }, tIn: { type: 'fade', dur: 0.5 }, tOut: { type: 'fade', dur: 0.5 } }); upd((p) => ({ ...p, clips: [...p.clips, c] })); setSel([c.id]); setRightTab('text'); };
  const addColor = async () => { const c = baseClip({ name: 'Colour matte', kind: 'color', color: '#1d4ed8', track: freeTrack('video', pos.current, 5), start: pos.current, dur: 5 }); upd((p) => ({ ...p, clips: [...p.clips, c] })); setSel([c.id]); setRightTab('clip'); };
  const patch = (ids, f) => { const s = new Set(ids); upd((p) => ({ ...p, clips: p.clips.map((c) => (s.has(c.id) ? { ...c, ...(typeof f === 'function' ? f(c) : f) } : c)) })); };
  const livePatch = (f) => { const s = new Set(sel); liveSet((p) => ({ ...p, clips: p.clips.map((c) => (s.has(c.id) ? { ...c, ...(typeof f === 'function' ? f(c) : f) } : c)) })); };
  const noSel = () => { toast('Select a clip first'); return false; };
  const split = (t = pos.current) => { const ids = sel.length ? new Set(sel) : null; upd((p) => ({ ...p, clips: p.clips.flatMap((c) => { if ((ids && !ids.has(c.id)) || t <= c.start + 0.03 || t >= c.start + c.dur - 0.03) return [c]; const l = t - c.start; const r = c.dur - l; const left = { ...c, dur: l, tOut: { type: 'none', dur: 0.6 } }; const right = { ...c, id: uid(), start: t, in: c.in + l * (c.speed || 1), dur: r, tIn: { type: 'none', dur: 0.6 }, kf: shiftKf(c.kf, l) }; return [left, right]; }) })); };
  const shiftKf = (kf, d) => Object.fromEntries(Object.entries(kf || {}).map(([k, a]) => [k, a.map(([t, v]) => [t - d, v])]));
  const del = (ripple) => { if (!sel.length) return noSel(); const s = new Set(sel); upd((p) => { let clips = p.clips.filter((c) => !s.has(c.id)); if (ripple) { for (const gone of p.clips.filter((c) => s.has(c.id))) clips = clips.map((c) => (c.track === gone.track && c.start >= gone.start + gone.dur - 1e-6 ? { ...c, start: Math.max(0, c.start - gone.dur) } : c)); } return { ...p, clips }; }); setSel([]); };
  const dup = () => { if (!sel.length) return noSel(); const ns = []; upd((p) => ({ ...p, clips: [...p.clips, ...p.clips.filter((c) => sel.includes(c.id)).map((c) => { const n = { ...c, id: uid(), start: c.start + c.dur }; ns.push(n.id); return n; })] })); setTimeout(() => setSel(ns), 0); };
  const copy = (cut) => { const cs = P.clips.filter((c) => sel.includes(c.id)); if (!cs.length) return noSel(); const t0 = Math.min(...cs.map((c) => c.start)); clipboard.current = cs.map((c) => ({ ...c, rel: c.start - t0 })); if (cut) del(false); else toast('Copied'); };
  const paste = () => { if (!clipboard.current.length) return toast('Nothing to paste'); const ns = []; upd((p) => ({ ...p, clips: [...p.clips, ...clipboard.current.map((c) => { const n = { ...c, id: uid(), start: pos.current + c.rel }; delete n.rel; ns.push(n.id); return n; })] })); setTimeout(() => setSel(ns), 0); };
  const setRange = (a, b) => upd((p) => ({ ...p, range: a == null ? null : { a, b } }));
  const addMarker = () => upd((p) => ({ ...p, markers: [...p.markers, { id: uid(), t: pos.current, name: `Marker ${p.markers.length + 1}` }] }));
  const addTrack = (type) => upd((p) => { const n = p.tracks.filter((t) => t.type === type).length + 1; const t = { id: uid(), type, name: (type === 'video' ? 'V' : 'A') + n }; const tracks = type === 'video' ? [...p.tracks.filter((x) => x.type === 'video'), t, ...p.tracks.filter((x) => x.type === 'audio')] : [...p.tracks, t]; return { ...p, tracks }; });
  const patchTrack = (id, o) => upd((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...o } : t)) }));
  const setKf = (propName, on) => { const c = selClip; if (!c) return; const lt = pos.current - c.start; if (lt < -0.001 || lt > c.dur + 0.001) { toast('Move the playhead over the clip to set a keyframe'); return; } const cur = prop(c, propName, lt); const eps = 0.5 / P.fps; patch([c.id], (x) => { const arr = [...(x.kf[propName] || [])]; const i = arr.findIndex(([t]) => Math.abs(t - lt) < eps); if (i >= 0) arr.splice(i, 1); else arr.push([clamp(lt, 0, c.dur), cur]); arr.sort((a, b) => a[0] - b[0]); const kf = { ...x.kf }; if (arr.length) kf[propName] = arr; else delete kf[propName]; return { kf }; }); void on; };
  const setPropValue = (c, propName, v, isLive = true) => { const lt = pos.current - c.start; const hasKf = c.kf && c.kf[propName] && c.kf[propName].length; const fn = (x) => { if (!hasKf) return { [propName]: v }; const arr = [...x.kf[propName]]; const eps = 0.5 / P.fps; const i = arr.findIndex(([t]) => Math.abs(t - lt) < eps); if (i >= 0) arr[i] = [arr[i][0], v]; else arr.push([clamp(lt, 0, x.dur), v]); arr.sort((a, b) => a[0] - b[0]); return { kf: { ...x.kf, [propName]: arr } }; }; if (isLive) livePatch(fn); else patch([c.id], fn); };

  /* ---------- playback & sync ---------- */
  const syncMedia = (t, playingNow) => {
    const e = E.current; const solo = null; void solo;
    for (const c of P.clips) {
      if (c.kind !== 'video' && c.kind !== 'audio') continue; const near = t >= c.start - 0.8 && t < c.start + c.dur; if (!near) { const el0 = e.els.get(c.id); if (el0 && !el0.paused) el0.pause(); continue; }
      const el = getEl(c); if (!el) continue; const active = t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6; const tk = P.tracks.find((x) => x.id === c.track); const lt = t - c.start; const m = media.current.get(c.src);
      const target = clamp(srcTime(c, Math.max(0, lt)), 0, (m && m.duration) || 1e9);
      const g = e.gains.get(c.id); if (g) { let v = (c.vol / 100) * (tk && tk.muted ? 0 : 1); if (c.afi > 0 && lt < c.afi) v *= lt / c.afi; if (c.afo > 0 && lt > c.dur - c.afo) v *= (c.dur - lt) / c.afo; g.gain.value = active ? Math.max(0, v) : 0; }
      el.playbackRate = clamp(c.speed || 1, 0.0625, 16);
      if (active && playingNow) { if (el.paused) { el.currentTime = target; el.play().catch(() => {}); } else if (Math.abs(el.currentTime - target) > 0.35) el.currentTime = target; }
      else { if (!el.paused) el.pause(); if (active || near) { if (Math.abs(el.currentTime - target) > 0.04 && !el.seeking) el.currentTime = target; } }
    }
  };
  const play = () => { const e = E.current; if (e.playing) return; const ctx = ensureActx(); ctx.resume().catch(() => {}); let t = pos.current; const end = e.endAt ?? projectDuration(Pr.current); if (t >= end - 0.05) t = P.range && e.exporting ? P.range.a : 0; pos.current = t; e.t0 = t; e.w0 = performance.now(); e.playing = true; setPlaying(true); };
  const pause = () => { const e = E.current; if (!e.playing) return; e.playing = false; setPlaying(false); for (const el of e.els.values()) if (!el.paused) el.pause(); setTick((x) => x + 1); };
  const seek = (t) => { const e = E.current; t = Math.max(0, t); pos.current = t; if (e.playing) { e.t0 = t; e.w0 = performance.now(); } e.dirty = true; syncMedia(t, e.playing); };
  const togglePlay = () => (E.current.playing ? pause() : play());
  const stepFrame = (n) => { pause(); seek(pos.current + n / P.fps); setTick((x) => x + 1); };

  useRaf(() => {
    const e = E.current; const Pn = Pr.current; const cv = prev.current; if (!cv) return;
    if (e.playing) {
      const t = e.t0 + (performance.now() - e.w0) / 1000; const end = e.endAt ?? projectDuration(Pn); pos.current = t;
      if (t >= end) { pos.current = end; if (e.exporting) finishExport(); else { pause(); } }
      syncMedia(pos.current, true); e.dirty = true;
    }
    if (e.dirty || e.playing) {
      e.dirty = false; const W = cv.width, H = cv.height; const g = cv.getContext('2d'); renderFrame(g, W, H, Pn, pos.current, getEl);
      if (e.exporting && e.exporting.canvas) renderFrame(e.exporting.canvas.getContext('2d'), e.exporting.canvas.width, e.exporting.canvas.height, Pn, pos.current, getEl);
    }
    const t = pos.current; if (phRef.current) phRef.current.style.transform = `translateX(${t * L.current.pps}px)`; const s = fmtTC(t, Pn.fps); if (tcRef.current && tcRef.current.textContent !== s) tcRef.current.textContent = s; if (tc2Ref.current) tc2Ref.current.textContent = fmtTC(projectDuration(Pn), Pn.fps);
    if (e.playing && scroll.current) { const sc = scroll.current; const x = t * L.current.pps + HEAD_W; if (x > sc.scrollLeft + sc.clientWidth - 30 || x < sc.scrollLeft + HEAD_W) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.3); }
  }, true);
  useEffect(() => { const e = E.current; return () => { e.playing = false; for (const el of e.els.values()) { el.pause(); el.removeAttribute('src'); } try { e.actx && e.actx.close(); } catch { /* ignore */ } for (const m of media.current.values()) URL.revokeObjectURL(m.url); }; }, []);
  useEffect(() => { for (const id of [...E.current.els.keys()]) if (!P.clips.some((c) => c.id === id)) { const el = E.current.els.get(id); el.pause(); E.current.els.delete(id); } if (!E.current.playing) syncMedia(pos.current, false); }, [P.clips]); // eslint-disable-line

  /* ---------- export ---------- */
  const mimeOptions = () => { const c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']; return c.filter((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)); };
  const startExport = async (o) => {
    setDlg(null); pause(); const e = E.current; const ctx = ensureActx(); await ctx.resume(); const Pn = Pr.current; const from = o.scope === 'range' && Pn.range ? Pn.range.a : 0; const to = o.scope === 'range' && Pn.range ? Pn.range.b : projectDuration(Pn); if (to <= from) { toast('There is nothing to export'); return; }
    const ar = Pn.w / Pn.h; const H2 = o.height; const W2 = Math.round((H2 * ar) / 2) * 2; const canvas = document.createElement('canvas'); canvas.width = W2; canvas.height = H2;
    const stream = canvas.captureStream(o.fps); e.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    let mr; try { mr = new MediaRecorder(stream, { mimeType: o.mime, videoBitsPerSecond: o.mbps * 1e6, audioBitsPerSecond: 160000 }); } catch (err) { toast('Could not start the encoder: ' + err.message); return; }
    const chunks = []; mr.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    e.exporting = { canvas, mr, chunks, from, to, mime: o.mime, name: o.name, cancelled: false }; e.endAt = to; setExp({ pct: 0, name: o.name }); renderFrame(canvas.getContext('2d'), W2, H2, Pn, from, getEl); mr.start(250); pos.current = from; e.playing = false; play(); e.expTimer = setInterval(() => setExp((x) => (x ? { ...x, pct: clamp((pos.current - from) / (to - from), 0, 1) } : x)), 200);
  };
  const finishExport = () => {
    const e = E.current; const x = e.exporting; if (!x) return; clearInterval(e.expTimer); e.exporting = null; e.endAt = null; pause(); x.mr.onstop = () => {
      if (!x.cancelled) { const ext = x.mime.includes('mp4') ? 'mp4' : 'webm'; const blob = new Blob(x.chunks, { type: x.mime.split(';')[0] }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safeName(x.name)}.${ext}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast(`Exported ${a.download} (${(blob.size / 1e6).toFixed(1)} MB)`); } setExp(null);
    }; try { x.mr.stop(); } catch { setExp(null); }
  };
  const cancelExport = () => { const x = E.current.exporting; if (x) { x.cancelled = true; finishExport(); toast('Export cancelled'); } };

  /* ---------- autosave ---------- */
  const restored = useRef(false); const saveT = useRef(0);
  useEffect(() => { (async () => { try { const r = await idbGet('video-project'); if (r && r.project && r.project.clips) { for (const m of r.media || []) media.current.set(m.id, { ...m, url: URL.createObjectURL(m.blob), peaks: null }); h.reset(r.project); setMver((v) => v + 1); for (const m of media.current.values()) decodePeaks(m); toast('Restored your last project'); } } catch { /* ignore */ } restored.current = true; })(); }, []); // eslint-disable-line
  useEffect(() => { if (!restored.current) return undefined; clearTimeout(saveT.current); setSave('Unsaved changes'); saveT.current = setTimeout(async () => { const used = new Set(P.clips.map((c) => c.src)); const ms = [...media.current.values()].filter((m) => used.has(m.id)).map((m) => ({ id: m.id, name: m.name, kind: m.kind, duration: m.duration, w: m.w, h: m.h, thumb: m.thumb, blob: m.blob })); const ok = await idbSet('video-project', { project: P, media: ms }); setSave(ok ? 'Autosaved' : 'Autosave unavailable'); }, 2500); return () => clearTimeout(saveT.current); }, [P]);

  /* ---------- timeline interaction ---------- */
  const snapT = (t, ignore = []) => { const step = 1 / P.fps; let best = Math.round(t / step) * step; let bd = Infinity; const cands = [0, pos.current, ...P.clips.filter((c) => !ignore.includes(c.id)).flatMap((c) => [c.start, c.start + c.dur]), ...P.markers.map((m) => m.t)]; for (const c of cands) { const d = Math.abs(c - t) * pps; if (d < 9 && d < bd) { best = c; bd = d; } } return Math.max(0, best); };
  const rowIndexAt = (clientY) => { const top = scroll.current.querySelector('.vid-rows').getBoundingClientRect().top; let y = clientY - top; for (let i = 0; i < rows.length; i++) { y -= trackH(rows[i]); if (y < 0) return i; } return rows.length - 1; };
  const clipDown = (e, c) => {
    if (e.button !== 0) return; e.stopPropagation(); const el = e.currentTarget; const r = el.getBoundingClientRect(); const x = e.clientX - r.left; const edge = 7; const ids = sel.includes(c.id) ? sel : e.shiftKey ? [...sel, c.id] : [c.id]; setSel(ids); setRightTab(c.kind === 'title' ? 'text' : rightTab === 'text' ? 'clip' : rightTab);
    const mode = x < edge ? 'trimL' : x > r.width - edge ? 'trimR' : 'move'; const orig = Object.fromEntries(P.clips.filter((k) => ids.includes(k.id)).map((k) => [k.id, k])); const x0 = e.clientX, rowIdx0 = rowIndexAt(e.clientY); let moved = false; el.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return; moved = true; const g = {}; const m = media.current.get(c.src);
      if (mode === 'move') { const first = orig[c.id]; let ns = snapT(first.start + dx / pps, ids); const d = ns - first.start; const minS = Math.min(...ids.map((id) => orig[id].start + d)); const dd = minS < 0 ? d - minS : d; const dRow = rowIndexAt(ev.clientY) - rowIdx0; for (const id of ids) { const o = orig[id]; const ri = rows.findIndex((t) => t.id === o.track); let tr = o.track; if (dRow) { const nr = rows[clamp(ri + dRow, 0, rows.length - 1)]; const isAud = o.kind === 'audio'; if (nr && ((nr.type === 'audio') === isAud)) tr = nr.id; } g[id] = { start: o.start + dd, track: tr }; } }
      else if (mode === 'trimL') { const o = orig[c.id]; const ns = snapT(o.start + dx / pps, [c.id]); let d = ns - o.start; const sp = o.speed || 1; if (o.kind === 'video' || o.kind === 'audio') d = Math.max(d, -o.in / sp); d = clamp(d, -o.start, o.dur - 0.1); g[c.id] = { start: o.start + d, dur: o.dur - d, in: o.in + d * sp }; }
      else { const o = orig[c.id]; const ne = snapT(o.start + o.dur + dx / pps, [c.id]); let nd = Math.max(0.1, ne - o.start); if ((o.kind === 'video' || o.kind === 'audio') && m) nd = Math.min(nd, (m.duration - o.in) / (o.speed || 1)); g[c.id] = { dur: nd }; }
      setGhost(g);
    };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); setGhost((g) => { if (g) { const gg = g; setTimeout(() => upd((p) => applyGhost(p, gg)), 0); } return null; }); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const laneDown = (e) => {
    if (e.button !== 0) return; if (!e.shiftKey) setSel([]); const lane = e.currentTarget; const r = lane.getBoundingClientRect(); const go = (ev) => seek(Math.max(0, (ev.clientX - r.left) / pps)); go(e); lane.setPointerCapture(e.pointerId);
    const mv = (ev) => go(ev); const up = () => { lane.removeEventListener('pointermove', mv); lane.removeEventListener('pointerup', up); }; lane.addEventListener('pointermove', mv); lane.addEventListener('pointerup', up);
  };
  const rulerDown = (e) => { if (e.button !== 0) return; const el = e.currentTarget; const r = el.getBoundingClientRect(); el.setPointerCapture(e.pointerId); const go = (ev) => seek(Math.max(0, (ev.clientX - r.left) / pps)); go(e); const mv = (ev) => go(ev); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); };
  const laneDrop = (e, tk) => { e.preventDefault(); const id = e.dataTransfer.getData('text/x-media'); if (!id) { if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]); return; } const m = media.current.get(id); if (!m) return; const r = e.currentTarget.getBoundingClientRect(); const t = snapT(Math.max(0, (e.clientX - r.left) / pps)); const ok = (m.kind === 'audio') === (tk.type === 'audio'); addMedia(id, t, ok ? tk.id : undefined); };
  const zoomBy = (f) => { const np = clamp(pps * f, 4, 400); setPps(np); };
  const fitZoom = () => { const sc = scroll.current; setPps(clamp((sc.clientWidth - HEAD_W - 40) / Math.max(dur, 3), 4, 400)); sc.scrollLeft = 0; };
  const clipMenu = (e, c) => { if (!sel.includes(c.id)) setSel([c.id]); showCtx(e, [{ label: 'Split at playhead', icon: 'scissorsV', onClick: () => split() }, { label: 'Duplicate', icon: 'copy', onClick: dup }, { label: 'Copy', onClick: () => copy(false) }, { label: 'Cut', icon: 'scissors', onClick: () => copy(true) }, { sep: true }, { label: 'Fade in + out', onClick: () => patch(sel, { tIn: { type: 'fade', dur: 0.6 }, tOut: { type: 'fade', dur: 0.6 } }) }, { label: 'Reset transform and effects', onClick: () => patch(sel, { x: 0, y: 0, scale: 100, rot: 0, opacity: 100, fx: {}, crop: { l: 0, t: 0, r: 0, b: 0 }, kf: {} }) }, { sep: true }, { label: 'Delete', icon: 'trash', onClick: () => del(false) }, { label: 'Ripple delete', onClick: () => del(true) }]); };

  /* preview direct manipulation */
  const boxOf = (c) => { const m = media.current.get(c.src); const W = P.w, H = P.h; let bw = W, bh = H; if ((c.kind === 'video' || c.kind === 'image') && m && m.w) { const fit = Math.min(W / m.w, H / m.h); bw = m.w * fit; bh = m.h * fit; } const lt = clamp(pos.current - c.start, 0, c.dur); const sc = prop(c, 'scale', lt) / 100; return { cx: W / 2 + prop(c, 'x', lt), cy: H / 2 + prop(c, 'y', lt), w: bw * sc, h: bh * sc, rot: prop(c, 'rot', lt) }; };
  const overlayDown = (e, mode) => {
    const c = selClip; if (!c || e.button !== 0) return; e.stopPropagation(); e.preventDefault(); const box = e.currentTarget.closest('.vid-ov').parentElement.getBoundingClientRect(); const k = P.w / box.width; const start = { x: e.clientX, y: e.clientY, cx: prop(c, 'x', pos.current - c.start), cy: prop(c, 'y', pos.current - c.start), sc: prop(c, 'scale', pos.current - c.start), b: boxOf(c) }; e.currentTarget.setPointerCapture(e.pointerId);
    const mv = (ev) => { if (mode === 'move') { setPropValue(c, 'x', Math.round(start.cx + (ev.clientX - start.x) * k)); setPropValue(c, 'y', Math.round(start.cy + (ev.clientY - start.y) * k)); } else { const ccx = box.left + (start.b.cx / P.w) * box.width, ccy = box.top + (start.b.cy / P.h) * box.height; const d0 = Math.hypot(start.x - ccx, start.y - ccy) || 1; const d1 = Math.hypot(ev.clientX - ccx, ev.clientY - ccy); setPropValue(c, 'scale', clamp(Math.round(start.sc * (d1 / d0)), 5, 600)); } };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); liveEnd(); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  useHotkeys({
    space: () => togglePlay(), home: () => seek(0), end: () => seek(dur), s: () => split(), delete: () => del(false), backspace: () => del(false), 'shift+delete': () => del(true), 'ctrl+a': () => setSel(P.clips.map((c) => c.id)), 'ctrl+d': () => dup(), 'ctrl+c': () => copy(false), 'ctrl+x': () => copy(true), 'ctrl+v': () => paste(),
    'ctrl+z': () => h.undo(), 'ctrl+shift+z': () => h.redo(), 'ctrl+y': () => h.redo(), 'ctrl+i': () => importDialog(), 'ctrl+e': () => setDlg({ k: 'export' }), m: () => addMarker(), i: () => setRange(pos.current, P.range ? Math.max(P.range.b, pos.current + 0.1) : dur || pos.current + 1), o: () => setRange(P.range ? Math.min(P.range.a, pos.current - 0.1) : 0, pos.current), '=': () => zoomBy(1.4), '-': () => zoomBy(1 / 1.4), '+': () => zoomBy(1.4),
    arrowleft: () => stepFrame(-1), arrowright: () => stepFrame(1), 'shift+arrowleft': () => stepFrame(-P.fps), 'shift+arrowright': () => stepFrame(P.fps), j: () => seek(pos.current - 5), l: () => seek(pos.current + 5), k: () => pause(),
  });

  const menus = [
    { label: 'File', items: [{ label: 'New project', icon: 'newPage', onClick: async () => { if (!(await ask({ title: 'New project', message: 'Start an empty project? Unsaved changes are lost.', okText: 'Start new' }))) return; pause(); for (const el of E.current.els.values()) el.pause(); E.current.els.clear(); media.current = new Map(); h.reset(blankProject()); setSel([]); setMver((v) => v + 1); seek(0); } }, { label: 'Import media…', icon: 'upload', kbd: 'Ctrl+I', onClick: importDialog }, { sep: true }, { label: 'Export video…', icon: 'film', kbd: 'Ctrl+E', onClick: () => setDlg({ k: 'export' }) }, { label: 'Export current frame (PNG)', onClick: () => { const cv = document.createElement('canvas'); cv.width = P.w; cv.height = P.h; renderFrame(cv.getContext('2d'), P.w, P.h, P, pos.current, getEl); cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${safeName(P.name)}-frame.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }); } }] },
    { label: 'Edit', items: [{ label: 'Undo', icon: 'undo', kbd: 'Ctrl+Z', onClick: h.undo, disabled: !h.canUndo }, { label: 'Redo', icon: 'redo', kbd: 'Ctrl+Shift+Z', onClick: h.redo, disabled: !h.canRedo }, { sep: true }, { label: 'Cut', kbd: 'Ctrl+X', onClick: () => copy(true) }, { label: 'Copy', kbd: 'Ctrl+C', onClick: () => copy(false) }, { label: 'Paste at playhead', kbd: 'Ctrl+V', onClick: paste }, { label: 'Duplicate', kbd: 'Ctrl+D', onClick: dup }, { label: 'Delete', kbd: 'Del', onClick: () => del(false) }, { label: 'Ripple delete', kbd: 'Shift+Del', onClick: () => del(true) }, { sep: true }, { label: 'Split at playhead', icon: 'scissorsV', kbd: 'S', onClick: () => split() }, { label: 'Select all', kbd: 'Ctrl+A', onClick: () => setSel(P.clips.map((c) => c.id)) }] },
    { label: 'Clip', items: [{ label: 'Speed 50%', onClick: () => patch(sel, (c) => ({ speed: 0.5, dur: (c.dur * (c.speed || 1)) / 0.5 })) }, { label: 'Speed 100%', onClick: () => patch(sel, (c) => ({ speed: 1, dur: (c.dur * (c.speed || 1)) / 1 })) }, { label: 'Speed 200%', onClick: () => patch(sel, (c) => ({ speed: 2, dur: (c.dur * (c.speed || 1)) / 2 })) }, { sep: true }, { label: 'Fade in and out', onClick: () => patch(sel, { tIn: { type: 'fade', dur: 0.6 }, tOut: { type: 'fade', dur: 0.6 } }) }, { label: 'Remove transitions', onClick: () => patch(sel, { tIn: { type: 'none', dur: 0.6 }, tOut: { type: 'none', dur: 0.6 } }) }, { label: 'Reset transform', onClick: () => patch(sel, { x: 0, y: 0, scale: 100, rot: 0, opacity: 100, kf: {} }) }, { label: 'Reset colour', onClick: () => patch(sel, { fx: {} }) }] },
    { label: 'Title', items: [...TITLE_PRESETS.map((p) => ({ label: p[0], icon: 'textT', onClick: () => addTitle(p) })), { sep: true }, { label: 'Colour matte', icon: 'palette', onClick: addColor }] },
    { label: 'Sequence', items: [{ label: 'Add video track', onClick: () => addTrack('video') }, { label: 'Add audio track', onClick: () => addTrack('audio') }, { sep: true }, { label: 'Set in point (I)', onClick: () => setRange(pos.current, P.range ? Math.max(P.range.b, pos.current + 0.1) : dur || pos.current + 1) }, { label: 'Set out point (O)', onClick: () => setRange(P.range ? Math.min(P.range.a, pos.current - 0.1) : 0, pos.current) }, { label: 'Clear in / out', onClick: () => setRange(null) }, { label: 'Add marker', kbd: 'M', onClick: addMarker }] },
    { label: 'View', items: [{ label: 'Zoom timeline in', icon: 'zoomIn', kbd: '=', onClick: () => zoomBy(1.4) }, { label: 'Zoom timeline out', icon: 'zoomOut', kbd: '-', onClick: () => zoomBy(1 / 1.4) }, { label: 'Fit timeline', onClick: fitZoom }] },
    { label: 'Help', items: [{ label: 'Keyboard shortcuts', icon: 'keyboard', onClick: () => setDlg({ k: 'keys' }) }] },
  ];
  const ticks = []; { const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]; const step = steps.find((s) => s * pps >= 70) || 600; for (let t = 0; t <= laneW / pps; t += step) ticks.push([t, step]); }
  const k = (propName) => (selClip && selClip.kf && selClip.kf[propName]) || null;
  const hasKfNow = (propName) => { const a = k(propName); return !!(a && selClip && a.some(([t]) => Math.abs(t - (pos.current - selClip.start)) < 0.5 / P.fps)); };
  void kfValue; void fmtDur;
  const previewAspect = P.w / P.h; const prevW = Math.min(960, P.w); const prevH = Math.round(prevW / previewAspect);
  const ob = selClip && !playing ? boxOf(selClip) : null;

  return (
    <div className="fx stu video" style={{ '--brand': '#9a6bff', '--brand-ink': '#fff' }} data-app="video">
      <AppBar id="video" name="Techomato Video Studio" right={<><input className="vid-name" aria-label="Project name" value={P.name} onChange={(e) => upd((p) => ({ ...p, name: e.target.value }))} /><span className="stu-hint" aria-live="polite">{save}</span><button type="button" className="fb pri" onClick={() => setDlg({ k: 'export' })}><Icon name="upload" size={14} />Export</button></>} />
      <StudioMenu menus={menus} />
      <div className="stu-body vid-body">
        <aside className="stu-side vid-left" aria-label="Project panels">
          <div className="stu-tabs" role="tablist">{[['media', 'Media'], ['effects', 'Effects']].map(([kk, l]) => <button key={kk} type="button" role="tab" aria-selected={leftTab === kk} className={'stu-tab' + (leftTab === kk ? ' on' : '')} onClick={() => setLeftTab(kk)}>{l}</button>)}</div>
          {leftTab === 'media' && <div className="vid-bin" onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } }}>
            <div className="vid-binbtns"><button type="button" className="stu-btn pri" onClick={importDialog}><Icon name="plus" size={13} />Import media</button><button type="button" className="stu-btn" onClick={() => addTitle()}><Icon name="textT" size={13} />Title</button><button type="button" className="stu-btn" onClick={addColor}>Matte</button></div>
            {mlist.length === 0 && <div className="stu-empty"><Icon name="film" size={30} /><h3>No media yet</h3><p className="stu-hint">Import video, audio or images — or drop files here. Then double-click or drag them onto the timeline.</p></div>}
            <ul className="vid-media" aria-label="Media">{mlist.map((m) => <li key={m.id} className={'vid-m' + (selMedia === m.id ? ' on' : '')} draggable onDragStart={(e) => e.dataTransfer.setData('text/x-media', m.id)} onClick={() => setSelMedia(m.id)} onDoubleClick={() => addMedia(m.id)} role="option" aria-selected={selMedia === m.id}><span className="vid-th">{m.thumb ? <img src={m.thumb} alt="" /> : <Icon name={kindIcon[m.kind]} size={20} />}</span><span className="grow"><b className="ellip">{m.name}</b><small>{m.kind}{m.kind !== 'image' ? ` · ${fmtDur(m.duration)}` : ''}{m.w ? ` · ${m.w}×${m.h}` : ''}</small></span><button type="button" className="stu-ib" aria-label={`Add ${m.name} to timeline`} title="Add to timeline at playhead" onClick={(e) => { e.stopPropagation(); addMedia(m.id); }}><Icon name="plus" size={14} /></button></li>)}</ul>
          </div>}
          {leftTab === 'effects' && <div className="vid-fxlist">
            <PanelBox title="Colour looks"><div className="vid-looks">{Object.entries(LOOKS).map(([kk, l]) => <button key={kk} type="button" className="vid-look" aria-label={`Look ${l.label}`} onClick={() => (selClips.length ? patch(sel, { fx: { ...l.fx } }) : noSel())}>{l.label}</button>)}</div></PanelBox>
            <PanelBox title="Transitions"><Row label="Apply to"><select className="stu-sel" aria-label="Apply transition to" value={applyTo} onChange={(e) => setApplyTo(e.target.value)}><option value="both">Start and end</option><option value="in">Start only</option><option value="out">End only</option></select></Row>
              <div className="vid-looks">{TRANSITIONS.map(([kk, l]) => <button key={kk} type="button" className="vid-look" aria-label={`Transition ${l}`} onClick={() => { if (!selClips.length) return noSel(); patch(sel, (c) => ({ ...(applyTo !== 'out' ? { tIn: { type: kk, dur: c.tIn.dur || 0.6 } } : {}), ...(applyTo !== 'in' ? { tOut: { type: kk, dur: c.tOut.dur || 0.6 } } : {}) })); }}>{l}</button>)}</div></PanelBox>
          </div>}
        </aside>
        <div className="stu-center vid-center">
          <div className="vid-previewwrap">
            <div className="vid-stage"><div className="vid-screen" style={{ aspectRatio: `${P.w} / ${P.h}`, "--ar": P.w / P.h }}>
              <canvas ref={prev} width={prevW} height={prevH} className="vid-canvas" aria-label="Preview" />
              {ob && selClip && <div className="vid-ov" aria-hidden="false"><div className="vid-box" style={{ left: `${(ob.cx / P.w) * 100}%`, top: `${(ob.cy / P.h) * 100}%`, width: `${(ob.w / P.w) * 100}%`, height: `${(ob.h / P.h) * 100}%`, transform: `translate(-50%,-50%) rotate(${ob.rot}deg)` }} onPointerDown={(e) => overlayDown(e, 'move')}>{['tl', 'tr', 'bl', 'br'].map((p) => <i key={p} className={'vid-hd ' + p} onPointerDown={(e) => overlayDown(e, 'scale')} />)}</div></div>}
            </div></div>
            <div className="vid-transport" role="toolbar" aria-label="Transport">
              <span className="vid-tc" role="timer" aria-label="Playhead timecode"><span ref={tcRef}>00:00:00:00</span></span>
              <button type="button" className="stu-ib big" aria-label="Previous frame" onClick={() => stepFrame(-1)}><Icon name="skipBack" size={17} /></button>
              <button type="button" className={'stu-ib big' + (playing ? ' on' : '')} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={20} /></button>
              <button type="button" className="stu-ib big" aria-label="Next frame" onClick={() => stepFrame(1)}><Icon name="skipFwd" size={17} /></button>
              <button type="button" className="stu-ib big" aria-label="Go to start" title="Go to start" onClick={() => seek(0)}><Icon name="stop" size={16} /></button>
              <span className="stu-hint vid-total">Total <span ref={tc2Ref}>00:00:00:00</span> · {P.w}×{P.h} · {P.fps} fps</span>
            </div>
          </div>
          <div className="vid-tl">
            <div className="vid-tltools" role="toolbar" aria-label="Timeline tools">
              <button type="button" className="stu-btn" onClick={() => split()}><Icon name="scissorsV" size={13} />Split</button><button type="button" className="stu-btn" onClick={() => del(false)}><Icon name="trash" size={13} />Delete</button><button type="button" className="stu-btn" onClick={addMarker}>Marker</button>
              <span className="stu-sep" /><button type="button" className="stu-ib" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}><Icon name="zoomOut" size={15} /></button><button type="button" className="stu-ib" aria-label="Zoom in" onClick={() => zoomBy(1.4)}><Icon name="zoomIn" size={15} /></button><button type="button" className="stu-btn" onClick={fitZoom}>Fit</button>
              <span className="spacer" /><span className="stu-hint">{P.range ? `In/Out ${fmtDur(P.range.a)} – ${fmtDur(P.range.b)}` : 'Press I / O to set in and out points'}</span>
            </div>
            <div className="vid-scroll" ref={scroll}>
              <div className="vid-content" style={{ width: HEAD_W + laneW }}>
                <div className="vid-ruler-row" style={{ height: RULER_H }}><div className="vid-corner" style={{ width: HEAD_W }} /><div className="vid-ruler" style={{ width: laneW }} onPointerDown={rulerDown} role="slider" aria-label="Timeline ruler">
                  {P.range && <div className="vid-rangebar" style={{ left: P.range.a * pps, width: (P.range.b - P.range.a) * pps }} />}
                  {ticks.map(([t, step], i) => <i key={i} style={{ left: t * pps }}><span>{step < 1 ? t.toFixed(1) + 's' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`}</span></i>)}
                  {P.markers.map((m) => <b key={m.id} className="vid-marker" style={{ left: m.t * pps }} title={`${m.name} (double-click to remove)`} onDoubleClick={() => upd((p) => ({ ...p, markers: p.markers.filter((x) => x.id !== m.id) }))} />)}
                </div></div>
                <div className="vid-rows">
                  {rows.map((tk) => (
                    <div className={'vid-trk ' + tk.type} key={tk.id} style={{ height: trackH(tk) }}>
                      <div className="vid-th" style={{ width: HEAD_W }}><b>{tk.name}</b><span className="spacer" />{tk.type === 'video' ? <button type="button" className={'stu-ib sm' + (tk.hidden ? '' : ' on')} aria-label={`${tk.hidden ? 'Show' : 'Hide'} ${tk.name}`} aria-pressed={!tk.hidden} onClick={() => patchTrack(tk.id, { hidden: !tk.hidden })}><Icon name={tk.hidden ? 'eyeOff' : 'eye'} size={13} /></button> : <button type="button" className={'stu-ib sm' + (tk.muted ? ' on' : '')} aria-label={`${tk.muted ? 'Unmute' : 'Mute'} ${tk.name}`} aria-pressed={!!tk.muted} onClick={() => patchTrack(tk.id, { muted: !tk.muted })}><Icon name={tk.muted ? 'volumeX' : 'volume'} size={13} /></button>}</div>
                      <div className="vid-lane" style={{ width: laneW }} onPointerDown={laneDown} onDragOver={(e) => e.preventDefault()} onDrop={(e) => laneDrop(e, tk)}>
                        {view.clips.filter((c) => c.track === tk.id).map((c) => {
                          const m = media.current.get(c.src); const w = c.dur * pps; const on = sel.includes(c.id);
                          return (
                            <div key={c.id} className={'vid-clip k-' + c.kind + (on ? ' on' : '') + (ghost && ghost[c.id] ? ' drag' : '')} style={{ left: c.start * pps, width: Math.max(3, w), backgroundImage: m && m.thumb && c.kind !== 'audio' ? `linear-gradient(90deg, rgba(0,0,0,.15), rgba(0,0,0,.15)), url(${m.thumb})` : undefined, ...(c.kind === 'color' ? { background: c.color } : {}) }} role="button" tabIndex={0} aria-label={`Clip ${c.name}`} aria-pressed={on} onPointerDown={(e) => clipDown(e, c)} onContextMenu={(e) => clipMenu(e, c)}>
                              {m && m.peaks && c.kind !== 'image' && <Peaks peaks={m.peaks} off={c.in} dur={c.dur * (c.speed || 1)} w={Math.max(2, w)} h={c.kind === 'audio' ? A_H - 8 : 16} />}
                              <span className="vid-clip-n ellip"><Icon name={kindIcon[c.kind]} size={11} />{c.name}{c.speed !== 1 ? ` · ${Math.round(c.speed * 100)}%` : ''}</span>
                              {c.tIn.type !== 'none' && <i className="vid-tin" style={{ width: Math.min(w / 2, c.tIn.dur * pps) }} />}{c.tOut.type !== 'none' && <i className="vid-tout" style={{ width: Math.min(w / 2, c.tOut.dur * pps) }} />}
                              {c.kf && Object.keys(c.kf).length > 0 && <i className="vid-kfdot" title="Has keyframes" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="vid-ph" ref={phRef} style={{ left: HEAD_W }}><i /></div>
              </div>
            </div>
          </div>
        </div>
        <aside className="stu-side wide vid-right" aria-label="Inspector">
          <div className="stu-tabs" role="tablist">{[['clip', 'Clip'], ['color', 'Colour'], ['text', 'Text'], ['project', 'Project']].map(([kk, l]) => <button key={kk} type="button" role="tab" aria-selected={rightTab === kk} className={'stu-tab' + (rightTab === kk ? ' on' : '')} onClick={() => setRightTab(kk)}>{l}</button>)}</div>
          {rightTab === 'clip' && (selClip ? <>
            <PanelBox title={`Clip · ${selClip.name}`}>
              <Row label="Name"><input className="fi vid-fi" aria-label="Clip name" value={selClip.name} onChange={(e) => livePatch({ name: e.target.value })} onBlur={liveEnd} /></Row>
              <div className="stu-grid2"><Num label="Start" value={+selClip.start.toFixed(2)} min={0} max={36000} step={0.01} slider={false} unit="s" onChange={(v) => livePatch({ start: v })} onCommit={liveEnd} /><Num label="Length" value={+selClip.dur.toFixed(2)} min={0.1} max={36000} step={0.01} slider={false} unit="s" onChange={(v) => livePatch({ dur: v })} onCommit={liveEnd} /></div>
              {(selClip.kind === 'video' || selClip.kind === 'audio') && <><Num label="Speed" value={Math.round(selClip.speed * 100)} min={25} max={400} unit="%" onChange={(v) => livePatch((c) => ({ speed: v / 100, dur: (c.dur * (c.speed || 1)) / (v / 100) }))} onCommit={liveEnd} /><Num label="Volume" value={selClip.vol} min={0} max={200} unit="%" onChange={(v) => livePatch({ vol: v })} onCommit={liveEnd} /><div className="stu-grid2"><Num label="Fade in" value={+selClip.afi.toFixed(1)} min={0} max={10} step={0.1} slider={false} unit="s" onChange={(v) => livePatch({ afi: v })} onCommit={liveEnd} /><Num label="Fade out" value={+selClip.afo.toFixed(1)} min={0} max={10} step={0.1} slider={false} unit="s" onChange={(v) => livePatch({ afo: v })} onCommit={liveEnd} /></div></>}
              {selClip.kind === 'color' && <Row label="Colour"><ColorField label="Matte colour" value={selClip.color} onChange={(v) => livePatch({ color: v })} /></Row>}
            </PanelBox>
            {selClip.kind !== 'audio' && <PanelBox title="Transform & opacity">
              {KFP.map(([p, label, min, max, step, unit]) => { const lt = clamp(pos.current - selClip.start, 0, selClip.dur); const val = Math.round(prop(selClip, p, lt) * 100) / 100; return <div className="vid-kfrow" key={p}><button type="button" className={'vid-kf' + (hasKfNow(p) ? ' on' : k(p) ? ' has' : '')} aria-label={`Keyframe ${label}`} aria-pressed={hasKfNow(p)} title="Add / remove keyframe at playhead" onClick={() => setKf(p)}><Icon name={hasKfNow(p) ? 'keyframe' : 'keyframeO'} size={13} /></button><Num label={label} value={val} min={min} max={max} step={step} unit={unit} onChange={(v) => setPropValue(selClip, p, v)} onCommit={liveEnd} /></div>; })}
              <div className="aud-btns"><button type="button" className="stu-btn" onClick={() => patch([selClip.id], { x: 0, y: 0, scale: 100, rot: 0, opacity: 100, kf: {} })}>Reset</button>{selClip.kf && Object.keys(selClip.kf).length > 0 && <button type="button" className="stu-btn" onClick={() => patch([selClip.id], { kf: {} })}>Clear keyframes</button>}</div>
            </PanelBox>}
            {selClip.kind !== 'audio' && <PanelBox title="Crop" open={false}>{[['l', 'Left'], ['t', 'Top'], ['r', 'Right'], ['b', 'Bottom']].map(([kk, l]) => <Num key={kk} label={l} value={selClip.crop[kk]} min={0} max={90} unit="%" onChange={(v) => livePatch((c) => ({ crop: { ...c.crop, [kk]: v } }))} onCommit={liveEnd} />)}</PanelBox>}
            <PanelBox title="Transitions" open={false}>{[['tIn', 'In'], ['tOut', 'Out']].map(([key, l]) => <div className="vid-tr" key={key}><Row label={l}><select className="stu-sel" aria-label={`${l} transition`} value={selClip[key].type} onChange={(e) => patch([selClip.id], { [key]: { ...selClip[key], type: e.target.value } })}>{TRANSITIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Row>{selClip[key].type !== 'none' && <Num label="Duration" value={selClip[key].dur} min={0.1} max={Math.max(0.2, selClip.dur / 2)} step={0.1} unit="s" onChange={(v) => livePatch({ [key]: { ...selClip[key], dur: v } })} onCommit={liveEnd} />}</div>)}</PanelBox>
          </> : <PanelBox title="Clip"><p className="stu-hint">{selClips.length > 1 ? `${selClips.length} clips selected. Use the Clip menu to change them together.` : 'Select a clip on the timeline to edit its transform, speed, volume and transitions.'}</p></PanelBox>)}
          {rightTab === 'color' && (selClip && selClip.kind !== 'audio' ? <PanelBox title="Colour correction">
            <div className="vid-looks sm">{Object.entries(LOOKS).map(([kk, l]) => <button key={kk} type="button" className="vid-look" onClick={() => patch([selClip.id], { fx: { ...l.fx } })}>{l.label}</button>)}</div>
            {[['bright', 'Brightness', 0, 200, '%'], ['contrast', 'Contrast', 0, 200, '%'], ['sat', 'Saturation', 0, 300, '%'], ['hue', 'Hue', -180, 180, '°'], ['temp', 'Temperature', -100, 100, ''], ['blur', 'Blur', 0, 40, 'px'], ['gray', 'Grayscale', 0, 100, '%'], ['sepia', 'Sepia', 0, 100, '%'], ['invert', 'Invert', 0, 100, '%'], ['vignette', 'Vignette', 0, 100, '%']].map(([p, l, min, max, u]) => <Num key={p} label={l} value={clipFx(selClip)[p]} min={min} max={max} unit={u} onChange={(v) => livePatch((c) => ({ fx: { ...c.fx, [p]: v } }))} onCommit={liveEnd} />)}
            <button type="button" className="stu-btn" onClick={() => patch([selClip.id], { fx: {} })}>Reset colour</button>
          </PanelBox> : <PanelBox title="Colour"><p className="stu-hint">Select a video, image, title or matte clip to adjust its colour.</p></PanelBox>)}
          {rightTab === 'text' && (selClip && selClip.kind === 'title' ? <PanelBox title="Title">
            <textarea className="pho-ta vid-ta" aria-label="Title text" rows={3} value={selClip.text.str} onChange={(e) => livePatch((c) => ({ text: { ...c.text, str: e.target.value } }))} onBlur={liveEnd} />
            <Row label="Font"><select className="stu-sel" aria-label="Font" value={selClip.text.font} onChange={(e) => patch([selClip.id], (c) => ({ text: { ...c.text, font: e.target.value } }))}>{FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}</select></Row>
            <Num label="Size" value={selClip.text.size} min={12} max={400} unit="px" onChange={(v) => livePatch((c) => ({ text: { ...c.text, size: v } }))} onCommit={liveEnd} /><Num label="Vertical" value={selClip.text.ypos} min={0} max={100} unit="%" onChange={(v) => livePatch((c) => ({ text: { ...c.text, ypos: v } }))} onCommit={liveEnd} /><Num label="Outline" value={selClip.text.outline} min={0} max={20} onChange={(v) => livePatch((c) => ({ text: { ...c.text, outline: v } }))} onCommit={liveEnd} />
            <Row label="Colours"><ColorField label="Text colour" value={selClip.text.color} onChange={(v) => livePatch((c) => ({ text: { ...c.text, color: v } }))} /><label className="stu-chk"><input type="checkbox" checked={!!selClip.text.bg} onChange={(e) => patch([selClip.id], (c) => ({ text: { ...c.text, bg: e.target.checked ? 'rgba(0,0,0,.55)' : '' } }))} />Background box</label></Row>
            <Row label="Style">{['left', 'center', 'right'].map((a) => <button key={a} type="button" className={'stu-ib' + (selClip.text.align === a ? ' on' : '')} aria-label={`Align ${a}`} aria-pressed={selClip.text.align === a} onClick={() => patch([selClip.id], (c) => ({ text: { ...c.text, align: a } }))}><Icon name={'align' + a[0].toUpperCase() + a.slice(1)} size={14} /></button>)}<button type="button" className={'stu-ib' + (selClip.text.bold ? ' on' : '')} aria-label="Bold" aria-pressed={selClip.text.bold} onClick={() => patch([selClip.id], (c) => ({ text: { ...c.text, bold: !c.text.bold } }))}><Icon name="bold" size={14} /></button><button type="button" className={'stu-ib' + (selClip.text.italic ? ' on' : '')} aria-label="Italic" aria-pressed={selClip.text.italic} onClick={() => patch([selClip.id], (c) => ({ text: { ...c.text, italic: !c.text.italic } }))}><Icon name="italic" size={14} /></button></Row>
            <label className="stu-chk"><input type="checkbox" checked={selClip.text.shadow} onChange={(e) => patch([selClip.id], (c) => ({ text: { ...c.text, shadow: e.target.checked } }))} />Drop shadow</label>
          </PanelBox> : <PanelBox title="Text"><p className="stu-hint">Add a title from the Title menu, then edit it here.</p><div className="aud-btns">{TITLE_PRESETS.map((p) => <button key={p[0]} type="button" className="stu-btn" onClick={() => addTitle(p)}>{p[0]}</button>)}</div></PanelBox>)}
          {rightTab === 'project' && <PanelBox title="Project settings">
            <Row label="Preset"><select className="stu-sel" aria-label="Frame size preset" value="" onChange={(e) => { const p = PROJECT_PRESETS[+e.target.value]; if (p) upd((x) => ({ ...x, w: p[1], h: p[2] })); }}><option value="" disabled>Choose…</option>{PROJECT_PRESETS.map((p, i) => <option key={p[0]} value={i}>{p[0]}</option>)}</select></Row>
            <div className="stu-grid2"><Num label="Width" value={P.w} min={64} max={7680} slider={false} unit="px" onChange={(v) => liveSet((x) => ({ ...x, w: Math.round(v / 2) * 2 }))} onCommit={liveEnd} /><Num label="Height" value={P.h} min={64} max={4320} slider={false} unit="px" onChange={(v) => liveSet((x) => ({ ...x, h: Math.round(v / 2) * 2 }))} onCommit={liveEnd} /></div>
            <Row label="Frame rate"><select className="stu-sel" aria-label="Frame rate" value={P.fps} onChange={(e) => upd((x) => ({ ...x, fps: +e.target.value }))}>{[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></Row>
            <Row label="Background"><ColorField label="Background colour" value={P.bg} onChange={(v) => liveSet((x) => ({ ...x, bg: v }))} /></Row>
            <p className="stu-hint">Clips are fitted inside the frame. Scale and position are relative to the project size.</p>
          </PanelBox>}
        </aside>
      </div>
      {dlg?.k === 'export' && <ExportDialog P={P} mimes={mimeOptions()} onClose={() => setDlg(null)} onOk={startExport} />}
      {dlg?.k === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setDlg(null)} width={520} footer={<Foot onClose={() => setDlg(null)} ok="Close" onOk={() => setDlg(null)} />}><div className="aud-keys">{[['Space', 'Play / pause'], ['← →', 'Step one frame (Shift: one second)'], ['J / L', 'Back / forward 5 seconds'], ['Home / End', 'Start / end'], ['S', 'Split at playhead'], ['Delete', 'Delete (Shift: ripple)'], ['I / O', 'In / out points'], ['M', 'Marker'], ['Ctrl+C / X / V / D', 'Copy / cut / paste / duplicate'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['= / -', 'Zoom timeline'], ['Ctrl+I', 'Import media'], ['Ctrl+E', 'Export']].map(([kk, d]) => <div key={kk}><kbd>{kk}</kbd><span>{d}</span></div>)}</div></Modal>}
      {exp && <Modal title={`Exporting ${exp.name}`} onClose={() => {}} width={420} footer={<><span className="spacer" /><button type="button" className="fb" onClick={cancelExport}>Cancel</button></>}><div className="vid-prog" role="progressbar" aria-valuenow={Math.round(exp.pct * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${exp.pct * 100}%` }} /></div><p className="stu-hint">{Math.round(exp.pct * 100)}% — the browser records the timeline in real time, so keep this tab open.</p></Modal>}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}

function ExportDialog({ P, mimes, onClose, onOk }) {
  const [mime, setMime] = useState(mimes[0] || ''); const [height, setHeight] = useState(Math.min(P.h, 720)); const [fps, setFps] = useState(Math.min(P.fps, 30)); const [mbps, setMbps] = useState(5); const [scope, setScope] = useState('all'); const [name, setName] = useState(P.name);
  const heights = [...new Set([P.h, 2160, 1440, 1080, 720, 480, 360].filter((x) => x <= P.h))].sort((a, b) => b - a);
  return <Modal title="Export video" onClose={onClose} width={440} footer={<Foot onClose={onClose} ok="Start export" disabled={!mime} onOk={() => onOk({ mime, height, fps, mbps, scope, name })} />}>
    <div className="aud-dlg">
      <Row label="File name"><input className="fi vid-fi" aria-label="File name" value={name} onChange={(e) => setName(e.target.value)} /></Row>
      <Row label="Format"><select className="stu-sel" aria-label="Format" value={mime} onChange={(e) => setMime(e.target.value)}>{mimes.map((m) => <option key={m} value={m}>{m.includes('mp4') ? 'MP4 (H.264)' : m.includes('vp9') ? 'WebM (VP9 + Opus)' : m.includes('vp8') ? 'WebM (VP8 + Opus)' : 'WebM'}</option>)}</select></Row>
      {!mimes.length && <p className="stu-hint">This browser can’t record video. Try Chrome, Edge or Firefox.</p>}
      <Row label="Resolution"><select className="stu-sel" aria-label="Resolution" value={height} onChange={(e) => setHeight(+e.target.value)}>{heights.map((x) => <option key={x} value={x}>{Math.round((x * P.w) / P.h / 2) * 2} × {x}</option>)}</select></Row>
      <Row label="Frame rate"><select className="stu-sel" aria-label="Export frame rate" value={fps} onChange={(e) => setFps(+e.target.value)}>{[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></Row>
      <Num label="Bitrate" value={mbps} min={1} max={40} step={0.5} unit="Mbps" onChange={setMbps} />
      <Row label="Range"><select className="stu-sel" aria-label="Range" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">Whole timeline</option><option value="range" disabled={!P.range}>In to out points</option></select></Row>
      <p className="stu-hint">Exports play the timeline in real time while the browser records it, so a 1-minute video takes about a minute.</p>
    </div>
  </Modal>;
}
