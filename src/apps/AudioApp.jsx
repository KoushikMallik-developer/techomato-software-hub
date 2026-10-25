import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast, useAsk, useContextMenu } from '../components/fxui.jsx';
import { StudioMenu, Num, Row, PanelBox, ColorField, useHotkeys, useRaf, useHistory, uid, clamp } from '../components/studio.jsx';
import { idbGet, idbSet } from '../lib/idb.js';
import { downloadFile, pickFile, pickFiles, safeName, readAsText } from '../lib/download.js';
import { schedule, renderMix, renderThrough, encodeWav, generate, mkBuffer, bufferChannels, peaks, peakOf, rmsOf, resample, spectrogram, projectEnd, defaultFx, FX_NAMES, dbToGain, gainToDb } from './audio/engine.js';
import { blankProject, mkTrack, mkClip, findClip, mapClips, trimL, trimR, splitClip, fmtClock, niceStep, TRACK_COLORS } from './audio/model.js';
import '../styles/audio.css';

const LANE_H = 92, HEAD_W = 214, RULER_H = 28;
const fxPresets = {
  echo: { fx: { delay: { on: true, time: 350, fb: 45, mix: 45 } }, tail: 2.5 }, reverb: { fx: { reverb: { on: true, decay: 2.4, mix: 40 } }, tail: 2.5 }, distortion: { fx: { dist: { on: true, amount: 55 } }, tail: 0 },
  lowpass: { fx: { filter: { on: true, hp: 10, lp: 2200 } }, tail: 0 }, highpass: { fx: { filter: { on: true, hp: 500, lp: 20000 } }, tail: 0 }, bass: { fx: { eq: { on: true, low: 9, mid: 0, high: 0, midFreq: 1000 } }, tail: 0 }, treble: { fx: { eq: { on: true, low: 0, mid: 0, high: 9, midFreq: 1000 } }, tail: 0 },
  telephone: { fx: { filter: { on: true, hp: 400, lp: 3400 }, dist: { on: true, amount: 12 } }, tail: 0 }, vocal: { fx: { eq: { on: true, low: -3, mid: 4, high: 3, midFreq: 3000 }, comp: { on: true, thresh: -26, ratio: 3, attack: 8, release: 180, makeup: 3 } }, tail: 0 }, compress: { fx: { comp: { on: true, thresh: -28, ratio: 6, attack: 6, release: 160, makeup: 6 } }, tail: 0 },
};
const slice = (buf, off, dur) => { const s = Math.floor(off * buf.sampleRate), n = Math.max(1, Math.floor(dur * buf.sampleRate)); const ch = []; for (let c = 0; c < buf.numberOfChannels; c++) { const d = new Float32Array(n); d.set(buf.getChannelData(c).subarray(s, s + n)); ch.push(d); } return mkBuffer(ch, buf.sampleRate); };
const applyGhost = (P, g) => {
  if (!g) return P; const ids = new Set(Object.keys(g)); let moved = []; const base = mapClips(P, (c) => { if (ids.has(c.id)) { moved.push(c); return null; } return undefined; });
  return { ...base, tracks: base.tracks.map((t, i) => ({ ...t, clips: [...t.clips, ...moved.filter((c) => clamp(g[c.id].track ?? 0, 0, base.tracks.length - 1) === i).map((c) => ({ ...c, ...g[c.id], track: undefined }))] })) };
};

function Wave({ buf, off, dur, rev, w, h, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c || !buf) return; const cw = Math.max(1, Math.min(6000, Math.round(w))); c.width = cw; c.height = h; const g = c.getContext('2d'); g.clearRect(0, 0, cw, h);
    const pk = peaks(buf, off, dur, cw); const mid = h / 2; g.fillStyle = color; for (let x = 0; x < cw; x++) { const mn = pk[x * 2], mx = pk[x * 2 + 1]; const y0 = mid - mx * mid * 0.95, y1 = mid - mn * mid * 0.95; g.fillRect(x, y0, 1, Math.max(1, y1 - y0)); }
  }, [buf, off, dur, w, h, color]);
  return <canvas ref={ref} className="aud-wave" style={{ width: w, height: h, transform: rev ? 'scaleX(-1)' : undefined }} aria-hidden="true" />;
}

function FxRack({ fx, onChange, onEnd }) {
  const set = (k, patch) => onChange({ ...fx, [k]: { ...fx[k], ...patch } });
  const box = (k, body) => <div className={'aud-fx' + (fx[k].on ? ' on' : '')} key={k}><label className="stu-chk aud-fxh"><input type="checkbox" aria-label={`Enable ${FX_NAMES[k]}`} checked={fx[k].on} onChange={(e) => { set(k, { on: e.target.checked }); onEnd(); }} />{FX_NAMES[k]}</label>{fx[k].on && <div className="aud-fxb">{body}</div>}</div>;
  const N = (k, key, label, min, max, step = 1, unit = '') => <Num label={label} value={fx[k][key]} min={min} max={max} step={step} unit={unit} onChange={(v) => set(k, { [key]: v })} onCommit={onEnd} />;
  return <div className="aud-rack">
    {box('filter', <>{N('filter', 'hp', 'High-pass', 20, 2000, 1, 'Hz')}{N('filter', 'lp', 'Low-pass', 500, 20000, 10, 'Hz')}</>)}
    {box('eq', <>{N('eq', 'low', 'Low', -18, 18, 0.5, 'dB')}{N('eq', 'mid', 'Mid', -18, 18, 0.5, 'dB')}{N('eq', 'midFreq', 'Mid freq', 200, 6000, 10, 'Hz')}{N('eq', 'high', 'High', -18, 18, 0.5, 'dB')}</>)}
    {box('dist', N('dist', 'amount', 'Drive', 0, 100))}
    {box('comp', <>{N('comp', 'thresh', 'Threshold', -60, 0, 1, 'dB')}{N('comp', 'ratio', 'Ratio', 1, 20, 0.5, ':1')}{N('comp', 'attack', 'Attack', 1, 200, 1, 'ms')}{N('comp', 'release', 'Release', 20, 1000, 5, 'ms')}{N('comp', 'makeup', 'Make-up', 0, 24, 0.5, 'dB')}</>)}
    {box('delay', <>{N('delay', 'time', 'Time', 20, 1500, 5, 'ms')}{N('delay', 'fb', 'Feedback', 0, 90, 1, '%')}{N('delay', 'mix', 'Mix', 0, 100, 1, '%')}</>)}
    {box('reverb', <>{N('reverb', 'decay', 'Decay', 0.3, 7, 0.1, 's')}{N('reverb', 'mix', 'Mix', 0, 100, 1, '%')}</>)}
  </div>;
}

function Foot({ onClose, onOk, ok = 'OK', disabled }) { return <><span className="spacer" /><button type="button" className="fb" onClick={onClose}>Cancel</button><button type="button" className="fb pri" disabled={disabled} onClick={onOk}>{ok}</button></>; }

function GenerateDialog({ onClose, onOk }) {
  const [kind, setKind] = useState('sine'), [freq, setFreq] = useState(440), [freq2, setFreq2] = useState(8000), [dur, setDur] = useState(3), [amp, setAmp] = useState(50);
  return <Modal title="Generate audio" onClose={onClose} width={420} footer={<Foot onClose={onClose} ok="Generate" onOk={() => onOk({ kind, freq, freq2, dur, amp: amp / 100 })} />}>
    <div className="aud-dlg">
      <Row label="Type"><select className="stu-sel" aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>{[['sine', 'Sine tone'], ['square', 'Square tone'], ['saw', 'Sawtooth tone'], ['triangle', 'Triangle tone'], ['sweep', 'Frequency sweep'], ['white', 'White noise'], ['pink', 'Pink noise'], ['silence', 'Silence']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
      {['sine', 'square', 'saw', 'triangle', 'sweep'].includes(kind) && <Num label={kind === 'sweep' ? 'From' : 'Frequency'} value={freq} min={20} max={20000} unit="Hz" onChange={setFreq} />}
      {kind === 'sweep' && <Num label="To" value={freq2} min={20} max={20000} unit="Hz" onChange={setFreq2} />}
      <Num label="Duration" value={dur} min={0.1} max={120} step={0.1} unit="s" onChange={setDur} />
      {kind !== 'silence' && <Num label="Level" value={amp} min={1} max={100} unit="%" onChange={setAmp} />}
    </div>
  </Modal>;
}
function ExportDialog({ P, range, onClose, onOk }) {
  const [bits, setBits] = useState(16), [sr, setSr] = useState(44100), [scope, setScope] = useState('all'), [mono, setMono] = useState(false), [name, setName] = useState(P.name);
  return <Modal title="Export mix" onClose={onClose} width={420} footer={<Foot onClose={onClose} ok="Export WAV" onOk={() => onOk({ bits, sr, scope, mono, name })} />}>
    <div className="aud-dlg">
      <Row label="File name"><input className="fi" aria-label="File name" value={name} onChange={(e) => setName(e.target.value)} /></Row>
      <Row label="Format"><span>WAV</span><select className="stu-sel" aria-label="Bit depth" value={bits} onChange={(e) => setBits(+e.target.value)}><option value={16}>16-bit PCM</option><option value={24}>24-bit PCM</option><option value={32}>32-bit float</option></select></Row>
      <Row label="Sample rate"><select className="stu-sel" aria-label="Sample rate" value={sr} onChange={(e) => setSr(+e.target.value)}>{[22050, 32000, 44100, 48000, 96000].map((v) => <option key={v} value={v}>{v} Hz</option>)}</select></Row>
      <Row label="Range"><select className="stu-sel" aria-label="Range" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">Whole session</option><option value="range" disabled={!range}>Selected range</option><option value="loop" disabled={!P.loop.on}>Loop region</option></select></Row>
      <label className="stu-chk"><input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />Mix down to mono</label>
    </div>
  </Modal>;
}
function SpeedDialog({ onClose, onOk }) {
  const [pct, setPct] = useState(100);
  return <Modal title="Change speed (and pitch)" onClose={onClose} width={380} footer={<Foot onClose={onClose} ok="Apply" onOk={() => onOk(pct / 100)} />}><div className="aud-dlg"><Num label="Speed" value={pct} min={25} max={400} unit="%" onChange={setPct} /><p className="stu-hint">Speeding up raises the pitch, slowing down lowers it, like a tape machine. Semitone shift: {(12 * Math.log2(pct / 100)).toFixed(2)}.</p></div></Modal>;
}

function Meter({ id }) { return <span className="aud-meter" data-meter={id}><i /><b /></span>; }

export default function AudioApp() {
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const h = useHistory(blankProject()); const P = h.state; const Pr = h.ref;
  const srcs = useRef(new Map()); const getBuf = useCallback((id) => srcs.current.get(id)?.buf, []);
  const [sel, setSel] = useState([]); const [selTrack, setSelTrack] = useState(P.tracks[0].id); const [range, setRange] = useState(null); const [pps, setPps] = useState(70); const [ghost, setGhost] = useState(null);
  const [playing, setPlaying] = useState(false); const [recording, setRecording] = useState(false); const [masterVol, setMasterVol] = useState(0.9); const [tab, setTab] = useState('props'); const [dlg, setDlg] = useState(null); const [save, setSave] = useState(''); const [posS, setPosS] = useState(0);
  const pos = useRef(0); const eng = useRef({ playing: false, from: 0, t0: 0, ctx: null, run: null }); const clipRef = useRef([]); const rec = useRef(null); const scroll = useRef(null); const phRef = useRef(null); const timeRef = useRef(null); const mTimeRef = useRef(null); const root = useRef(null); const spec = useRef(null); const lvl = useRef({}); const specCv = useRef(null); const mmeter = useRef(null);
  const live = useRef(null); const L = useRef({}); L.current = { P, sel, selTrack, range, pps, masterVol, playing, recording };
  const view = useMemo(() => applyGhost(P, ghost), [P, ghost]);
  const upd = useCallback((fn) => h.set(fn), [h]);
  const liveSet = (fn) => { if (!live.current) live.current = h.ref.current; h.set(fn, { record: false }); };
  const liveEnd = () => { if (live.current) { if (live.current !== h.ref.current) h.mark(live.current); live.current = null; } };
  const endT = Math.max(projectEnd(view), 8); const laneW = Math.max(endT + 12, 20) * pps;
  const track = P.tracks.find((t) => t.id === selTrack) || P.tracks[0]; const selClip = sel.length === 1 ? findClip(P, sel[0]) : null;

  /* ---------- transport ---------- */
  const ensureCtx = () => { const e = eng.current; if (!e.ctx) e.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (e.ctx.state === 'suspended') e.ctx.resume().catch(() => {}); return e.ctx; };
  const curPos = () => { const e = eng.current; return e.playing ? Math.max(e.from, e.from + e.ctx.currentTime - e.t0) : pos.current; };
  const stopGraph = () => { const e = eng.current; if (e.run) { e.run.stop(); e.run = null; } };
  const startPlay = useCallback((from) => {
    const e = eng.current; const ctx = ensureCtx(); stopGraph(); const p = Pr.current; const to = p.loop.on && from < p.loop.b ? p.loop.b : Infinity; const when = ctx.currentTime + 0.04;
    e.run = schedule(ctx, p, getBuf, { from, to, when, masterVol: L.current.masterVol }); e.t0 = when; e.from = from; e.playing = true; setPlaying(true); e.key = structKey(p);
  }, [getBuf, Pr]);
  const pause = useCallback(() => { const e = eng.current; if (!e.playing) return; pos.current = curPos(); stopGraph(); e.playing = false; setPlaying(false); setPosS(pos.current); }, []);
  const seek = useCallback((t) => { t = Math.max(0, t); pos.current = t; setPosS(t); if (eng.current.playing) startPlay(t); else draw(t); }, [startPlay]); // eslint-disable-line
  const draw = (t) => { const p = t ?? curPos(); if (phRef.current) phRef.current.style.transform = `translateX(${p * L.current.pps}px)`; const s = fmtClock(p); if (timeRef.current) timeRef.current.textContent = s; };
  const structKey = (p) => JSON.stringify(p.tracks.map((t) => [t.clips, t.fx])) + p.tracks.length + JSON.stringify(p.loop);
  const togglePlay = () => { if (L.current.recording) return stopRecord(); if (eng.current.playing) pause(); else startPlay(pos.current); };
  const stop = () => { if (L.current.recording) return stopRecord(); pause(); seek(range ? range.a : 0); };

  /* react to project edits during playback */
  useEffect(() => {
    const e = eng.current; if (!e.playing) return; const k = structKey(P);
    if (k !== e.key) { startPlay(curPos()); return; }
    if (e.run) { const solo = P.tracks.some((t) => t.solo); for (const t of P.tracks) { const n = e.run.nodes[t.id]; if (!n) continue; n.gain.gain.value = t.mute || (solo && !t.solo) ? 0 : t.vol; n.pan.pan.value = t.pan; } }
  }, [P, startPlay]);
  useEffect(() => { const e = eng.current; if (e.run) e.run.master.gain.value = masterVol; }, [masterVol]);

  /* animation: playhead, meters, spectrum */
  useRaf(() => {
    const e = eng.current; const p = curPos();
    if (e.playing) {
      pos.current = p; draw(p); const P0 = Pr.current;
      if (P0.loop.on && p >= P0.loop.b - 0.005) { startPlay(P0.loop.a); }
      else if (!P0.loop.on && !L.current.recording && p > projectEnd(P0) + 0.4) { pos.current = projectEnd(P0); pause(); draw(pos.current); }
      const sc = scroll.current; if (sc) { const x = p * L.current.pps + HEAD_W; if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft + HEAD_W) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.4); }
    }
    const run = e.run; const els = root.current ? root.current.querySelectorAll('[data-meter]') : [];
    const buf = lvl.current.buf || (lvl.current.buf = new Float32Array(1024));
    els.forEach((el) => {
      const id = el.dataset.meter; let an = null; if (id === 'master') an = run && run.masterAn; else an = run && run.nodes[id] && run.nodes[id].analyser; let v = 0;
      if (an && e.playing) { an.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; } v = clamp((20 * Math.log10(m + 1e-6) + 60) / 60, 0, 1); }
      const prev = lvl.current[id] || 0; const nv = v > prev ? v : prev - 0.025; lvl.current[id] = Math.max(0, nv); const hold = lvl.current[id + 'h'] = Math.max(v, (lvl.current[id + 'h'] || 0) - 0.006);
      const i = el.firstChild, b = el.lastChild; const vert = el.classList.contains('v'); if (vert) { i.style.height = `${lvl.current[id] * 100}%`; b.style.bottom = `${hold * 100}%`; } else { i.style.width = `${lvl.current[id] * 100}%`; b.style.left = `${hold * 100}%`; }
    });
    const sc = specCv.current; if (sc && run && run.masterAn && e.playing) {
      const g = sc.getContext('2d'); const an = run.masterAn; const bins = an.frequencyBinCount; const d = spec.current || (spec.current = new Uint8Array(bins)); an.getByteFrequencyData(d); g.clearRect(0, 0, sc.width, sc.height); const n = 96; const sr = an.context.sampleRate;
      for (let i = 0; i < n; i++) { const f0 = 30 * Math.pow(18000 / 30, i / n), f1 = 30 * Math.pow(18000 / 30, (i + 1) / n); const a = Math.floor((f0 / (sr / 2)) * bins), z = Math.max(a + 1, Math.floor((f1 / (sr / 2)) * bins)); let m = 0; for (let k = a; k < z; k++) m = Math.max(m, d[k]); const hh = (m / 255) * sc.height; g.fillStyle = `hsl(${170 - (m / 255) * 150} 80% ${40 + (m / 255) * 20}%)`; g.fillRect((i * sc.width) / n + 1, sc.height - hh, sc.width / n - 2, hh); }
    } else if (sc && !e.playing && spec.current) { spec.current = null; sc.getContext('2d').clearRect(0, 0, sc.width, sc.height); }
  }, true);
  useEffect(() => { draw(pos.current); }, [pps, view]); // eslint-disable-line
  useEffect(() => () => { stopGraph(); try { eng.current.ctx && eng.current.ctx.close(); } catch { /* ignore */ } }, []);

  /* ---------- sources ---------- */
  const addSource = (name, buf) => { const id = uid(); srcs.current.set(id, { name, buf }); return id; };
  const placeClip = (srcId, name, buf, atT, trackId, newTrack) => {
    upd((p) => {
      let tracks = p.tracks; let tid = trackId || selTrack; let ti = tracks.findIndex((t) => t.id === tid); if (ti < 0) ti = 0;
      const overlap = tracks[ti].clips.some((c) => atT < c.start + c.dur && atT + buf.duration > c.start);
      if (newTrack || overlap) { const nt = mkTrack(tracks.length + 1); nt.name = name.slice(0, 22); tracks = [...tracks, nt]; ti = tracks.length - 1; }
      const clip = mkClip(srcId, name, atT, buf.duration); tracks = tracks.map((t, i) => (i === ti ? { ...t, clips: [...t.clips, clip] } : t)); setTimeout(() => { setSel([clip.id]); setSelTrack(tracks[ti].id); }, 0); return { ...p, tracks };
    });
  };
  const importFiles = async (files) => {
    const ctx = ensureCtx(); let t = pos.current; let n = 0;
    for (const f of files) {
      try { const ab = await f.arrayBuffer(); const buf = await ctx.decodeAudioData(ab); const id = addSource(f.name, buf); placeClip(id, f.name.replace(/\.[^.]+$/, ''), buf, t, null, false); n++; }
      catch { toast(`Could not decode ${f.name}`); }
    }
    if (n) toast(`Imported ${n} file${n > 1 ? 's' : ''}`);
  };
  const importDialog = async () => { const fs = await pickFiles('audio/*,video/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.webm,.json'); if (!fs.length) return; const j = fs.find((f) => /\.json$/i.test(f.name)); if (j) return openProject(j); importFiles(fs); };
  const doGenerate = (o) => { const sr = ensureCtx().sampleRate; const d = o.kind === 'silence' ? new Float32Array(Math.floor(sr * o.dur)) : generate(o.kind, sr, o.dur, o); const buf = mkBuffer([d, new Float32Array(d)], sr); const nm = { sine: 'Sine ', square: 'Square ', saw: 'Saw ', triangle: 'Triangle ', sweep: 'Sweep', white: 'White noise', pink: 'Pink noise', silence: 'Silence' }[o.kind] + (['sine', 'square', 'saw', 'triangle'].includes(o.kind) ? `${o.freq} Hz` : ''); placeClip(addSource(nm, buf), nm, buf, pos.current, null, false); setDlg(null); };

  /* ---------- recording ---------- */
  const startRecord = async () => {
    if (rec.current || L.current.recording) return;
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); } catch { toast('Microphone access was blocked or no microphone was found'); return; }
    const mr = new MediaRecorder(stream); const chunks = []; mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const startAt = pos.current; const tr = P.tracks.find((t) => t.arm) || track; rec.current = { mr, stream, chunks, startAt, trackId: tr.id, done: null };
    rec.current.done = new Promise((res) => { mr.onstop = res; }); mr.start(); setRecording(true); startPlay(startAt); toast('Recording…');
  };
  const stopRecord = async () => {
    const r = rec.current; if (!r) return; rec.current = null; setRecording(false); pause(); r.mr.stop(); r.stream.getTracks().forEach((t) => t.stop()); await r.done;
    try { const blob = new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' }); const buf = await ensureCtx().decodeAudioData(await blob.arrayBuffer()); const nm = `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`; placeClip(addSource(nm, buf), nm, buf, r.startAt, r.trackId, false); } catch { toast('The recording could not be decoded'); }
    seek(r.startAt);
  };

  /* ---------- editing ---------- */
  const noSel = () => { toast('Select a clip first'); return false; };
  const selectedClips = () => sel.map((id) => findClip(P, id)).filter(Boolean);
  const split = (t = pos.current) => { upd((p) => { const ids = new Set(sel); const target = (c) => (ids.size ? ids.has(c.id) : true); return mapClips(p, (c) => (target(c) && t > c.start + 0.005 && t < c.start + c.dur - 0.005 ? splitClip(c, t) : undefined)); }); };
  const del = () => { if (!sel.length) return noSel(); const s = new Set(sel); upd((p) => mapClips(p, (c) => (s.has(c.id) ? null : undefined))); setSel([]); };
  const dup = () => { if (!sel.length) return noSel(); const s = new Set(sel); const ns = []; upd((p) => mapClips(p, (c, t) => { if (!s.has(c.id)) return undefined; const n = { ...c, id: uid(), start: c.start + c.dur }; ns.push(n.id); return [c, n]; })); setTimeout(() => setSel(ns), 0); };
  const copy = (cut) => { const cs = selectedClips(); if (!cs.length) return noSel(); const t0 = Math.min(...cs.map((x) => x.c.start)); clipRef.current = cs.map(({ c, t }) => ({ c, ti: P.tracks.indexOf(t), dt: c.start - t0 })); if (cut) del(); else toast('Copied'); };
  const paste = () => { if (!clipRef.current.length) return toast('Nothing to paste'); const ns = []; const base = pos.current; upd((p) => { const tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] })); const ti0 = Math.max(0, tracks.findIndex((t) => t.id === selTrack)); const minTi = Math.min(...clipRef.current.map((x) => x.ti)); for (const x of clipRef.current) { const ti = clamp(ti0 + x.ti - minTi, 0, tracks.length - 1); const n = { ...x.c, id: uid(), start: base + x.dt }; ns.push(n.id); tracks[ti].clips.push(n); } return { ...p, tracks }; }); setTimeout(() => setSel(ns), 0); };
  const cutRange = () => { if (!range) return toast('Drag in the timeline to select a time range'); const { a, b } = range; upd((p) => mapClips(p, (c) => { let parts = [c]; for (const t of [a, b]) parts = parts.flatMap((x) => (t > x.start + 0.005 && t < x.start + x.dur - 0.005 ? splitClip(x, t) : [x])); return parts.filter((x) => !(x.start >= a - 1e-6 && x.start + x.dur <= b + 1e-6)); })); setRange(null); };
  const patchClips = (patch, label) => { const s = new Set(sel.length ? sel : []); if (!s.size) return noSel(); upd((p) => mapClips(p, (c) => (s.has(c.id) ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : undefined))); void label; };
  const patchTrack = (id, patch) => upd((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const liveTrack = (id, patch) => liveSet((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)) }));
  const liveClip = (patch) => { const s = new Set(sel); liveSet((p) => mapClips(p, (c) => (s.has(c.id) ? { ...c, ...patch } : undefined))); };
  const addTrack = () => { const n = P.tracks.length + 1; const t = mkTrack(n); upd((p) => ({ ...p, tracks: [...p.tracks, t] })); setSelTrack(t.id); };
  const removeTrack = async (id = selTrack) => { if (P.tracks.length <= 1) return toast('A session needs at least one track'); const t = P.tracks.find((x) => x.id === id); if (t.clips.length && !(await ask({ title: 'Delete track?', message: `"${t.name}" and its ${t.clips.length} clip(s) will be removed.`, okText: 'Delete', danger: true }))) return; upd((p) => ({ ...p, tracks: p.tracks.filter((x) => x.id !== id) })); setSelTrack(P.tracks.find((x) => x.id !== id).id); };
  const moveTrack = (id, d) => upd((p) => { const i = p.tracks.findIndex((t) => t.id === id), j = i + d; if (j < 0 || j >= p.tracks.length) return p; const tr = [...p.tracks]; [tr[i], tr[j]] = [tr[j], tr[i]]; return { ...p, tracks: tr }; });
  const renameTrack = async (t) => { const v = await ask({ kind: 'prompt', title: 'Rename track', value: t.name }); if (v && v.trim()) patchTrack(t.id, { name: v.trim() }); };
  const addMarker = () => upd((p) => ({ ...p, markers: [...p.markers, { id: uid(), t: pos.current, name: `Marker ${p.markers.length + 1}` }] }));
  const zoomBy = (f, anchor) => { const sc = scroll.current; const old = L.current.pps; const np = clamp(old * f, 4, 1200); if (sc) { const ax = anchor ?? (pos.current * old + HEAD_W - sc.scrollLeft); const tAt = (sc.scrollLeft + ax - HEAD_W) / old; setPps(np); requestAnimationFrame(() => { sc.scrollLeft = Math.max(0, tAt * np + HEAD_W - ax); }); } else setPps(np); };
  const fitZoom = () => { const sc = scroll.current; const d = Math.max(projectEnd(P), 2); setPps(clamp((sc.clientWidth - HEAD_W - 40) / d, 4, 1200)); sc.scrollLeft = 0; };

  /* destructive effects: produce new sources */
  const processSel = async (name, fn, { tail = 0 } = {}) => {
    const cs = selectedClips(); if (!cs.length) return noSel(); toast(`Applying ${name}…`);
    const out = []; for (const { c } of cs) { const src = getBuf(c.src); if (!src) continue; const part = slice(src, c.off, c.dur); const nb = await fn(part, c); const id = addSource(`${c.name} (${name})`, nb); out.push([c.id, { src: id, off: 0, dur: nb.duration, tailAdded: tail }]); }
    const m = new Map(out); upd((p) => mapClips(p, (c) => (m.has(c.id) ? { ...c, ...m.get(c.id), tailAdded: undefined } : undefined))); toast(`${name} applied`);
  };
  const chOp = (fn) => async (buf) => { const ch = bufferChannels(buf); fn(ch, buf); return mkBuffer(ch, buf.sampleRate); };
  const fxEffect = (key, label) => processSel(label, (b) => renderThrough(b, { ...defaultFx(), ...fxPresets[key].fx }, fxPresets[key].tail), { tail: fxPresets[key].tail });
  const amplify = async () => { const v = await ask({ kind: 'prompt', title: 'Amplify', message: 'Gain in dB (negative reduces)', value: '6' }); if (v == null || isNaN(+v)) return; const g = dbToGain(+v); processSel('Amplify', chOp((ch) => ch.forEach((d) => { for (let i = 0; i < d.length; i++) d[i] *= g; }))); };
  const normalize = async () => { const v = await ask({ kind: 'prompt', title: 'Normalize', message: 'Peak level (dBFS)', value: '-1' }); if (v == null || isNaN(+v)) return; processSel('Normalize', chOp((ch, b) => { let m = 0; ch.forEach((d) => { for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); }); const g = m ? dbToGain(+v) / m : 1; ch.forEach((d) => { for (let i = 0; i < d.length; i++) d[i] *= g; }); void b; })); };
  const invert = () => processSel('Invert', chOp((ch) => ch.forEach((d) => { for (let i = 0; i < d.length; i++) d[i] = -d[i]; })));
  const silenceOp = () => processSel('Silence', chOp((ch) => ch.forEach((d) => d.fill(0))));
  const dcOp = () => processSel('Remove DC', chOp((ch) => ch.forEach((d) => { let s = 0; for (let i = 0; i < d.length; i++) s += d[i]; s /= d.length || 1; for (let i = 0; i < d.length; i++) d[i] -= s; })));
  const gateOp = async () => { const v = await ask({ kind: 'prompt', title: 'Noise gate', message: 'Gate threshold (dBFS)', value: '-45' }); if (v == null || isNaN(+v)) return; const th = dbToGain(+v); processSel('Noise gate', chOp((ch, b) => { const w = Math.floor(b.sampleRate * 0.01); const n = ch[0].length; const env = new Float32Array(n); for (const d of ch) for (let i = 0; i < n; i++) env[i] = Math.max(env[i], Math.abs(d[i])); let open = 0; const rel = 1 / (b.sampleRate * 0.08); for (let i = 0; i < n; i++) { let mx = 0; for (let k = 0; k < w && i + k < n; k += 8) mx = Math.max(mx, env[i + k]); open = mx > th ? 1 : Math.max(0, open - rel); for (const d of ch) d[i] *= open; } })); };
  const speedOp = (ratio) => { processSel('Speed', async (b) => mkBuffer(bufferChannels(b).map((d) => resample(d, ratio)), b.sampleRate)); setDlg(null); };
  const fadePreset = (which) => patchClips((c) => (which === 'in' ? { fi: Math.min(1, c.dur / 2) } : which === 'out' ? { fo: Math.min(1, c.dur / 2) } : { fi: 0, fo: 0 }));
  const normGain = () => { const cs = selectedClips(); if (!cs.length) return noSel(); const m = new Map(cs.map(({ c }) => { const pk = peakOf(getBuf(c.src), c.off, c.dur); return [c.id, pk ? Math.min(8, 0.97 / pk) : 1]; })); upd((p) => mapClips(p, (c) => (m.has(c.id) ? { ...c, gain: m.get(c.id) } : undefined))); };

  /* ---------- export / project ---------- */
  const exportMix = async (o) => {
    setDlg(null); toast('Rendering mix…'); try {
      const p = Pr.current; let from = 0, to; if (o.scope === 'range' && range) { from = range.a; to = range.b; } else if (o.scope === 'loop') { from = p.loop.a; to = p.loop.b; }
      let buf = await renderMix(p, getBuf, { sr: o.sr, from, to }); if (o.mono) { const m = new Float32Array(buf.length); for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < m.length; i++) m[i] += d[i] / buf.numberOfChannels; } buf = mkBuffer([m], buf.sampleRate); }
      if (peakOf(buf) === 0) toast('The mix is silent'); const blob = encodeWav(buf, o.bits); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safeName(o.name)}.wav`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(`Exported ${a.download}`);
    } catch (e) { toast('Export failed: ' + e.message); }
  };
  const blobB64 = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  const saveProject = async () => { const used = new Set(P.tracks.flatMap((t) => t.clips.map((c) => c.src))); const sources = []; for (const id of used) { const s = srcs.current.get(id); if (s) sources.push({ id, name: s.name, wav: await blobB64(encodeWav(s.buf, 32)) }); } downloadFile(`${safeName(P.name)}.audio.json`, JSON.stringify({ kind: 'techomato-audio', v: 1, project: P, sources }), 'application/json'); toast('Session saved'); };
  const openProject = async (f) => {
    try { const o = JSON.parse(await readAsText(f)); if (o.kind !== 'techomato-audio') throw new Error('x'); const ctx = ensureCtx(); srcs.current = new Map(); for (const s of o.sources) { const ab = Uint8Array.from(atob(s.wav), (c) => c.charCodeAt(0)).buffer; srcs.current.set(s.id, { name: s.name, buf: await ctx.decodeAudioData(ab) }); } pause(); h.reset(o.project); setSel([]); setSelTrack(o.project.tracks[0].id); seek(0); toast('Session opened'); } catch { toast('That is not a Techomato Audio session'); }
  };
  const newSession = async () => { if (!(await ask({ title: 'New session', message: 'Start an empty session? Unsaved changes will be lost.', okText: 'Start new' }))) return; pause(); srcs.current = new Map(); const b = blankProject(); h.reset(b); setSel([]); setSelTrack(b.tracks[0].id); seek(0); };

  /* autosave */
  const restored = useRef(false); const saveT = useRef(0);
  useEffect(() => { (async () => { try { const r = await idbGet('audio-project'); if (r && r.project && r.sources) { const ctx = ensureCtx(); for (const s of r.sources) srcs.current.set(s.id, { name: s.name, buf: mkBuffer(s.ch, s.sr) }); void ctx; h.reset(r.project); setSelTrack(r.project.tracks[0].id); toast('Restored your last session'); } } catch { /* ignore */ } restored.current = true; })(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!restored.current) return undefined; clearTimeout(saveT.current); setSave('Unsaved changes');
    saveT.current = setTimeout(async () => { const used = new Set(P.tracks.flatMap((t) => t.clips.map((c) => c.src))); const sources = []; for (const id of used) { const s = srcs.current.get(id); if (s) sources.push({ id, name: s.name, sr: s.buf.sampleRate, ch: bufferChannels(s.buf) }); } const ok = await idbSet('audio-project', { project: P, sources }); setSave(ok ? 'Autosaved' : 'Autosave unavailable'); }, 2500);
    return () => clearTimeout(saveT.current);
  }, [P]);

  /* ---------- timeline pointer handling ---------- */
  const snapT = (t, ignore = []) => {
    if (!P.snap) return Math.max(0, t); const step = niceStep(pps) / (niceStep(pps) >= 1 ? 2 : 1); let best = Math.round(t / step) * step; let bd = Math.abs(best - t) * pps; const cands = [pos.current, ...P.tracks.flatMap((tr) => tr.clips.filter((c) => !ignore.includes(c.id)).flatMap((c) => [c.start, c.start + c.dur]))];
    for (const c of cands) { const d = Math.abs(c - t) * pps; if (d < 9 && d < bd + 4) { best = c; bd = d; } } return Math.max(0, best);
  };
  const lanesTop = () => scroll.current.querySelector('.aud-lanes').getBoundingClientRect().top;
  const clipDown = (e, c, ti) => {
    if (e.button !== 0) return; e.stopPropagation(); const el = e.currentTarget; const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const edge = 7;
    let ids = sel.includes(c.id) ? sel : e.shiftKey ? [...sel, c.id] : [c.id]; setSel(ids); setSelTrack(P.tracks[ti].id);
    const mode = x < edge ? 'trimL' : x > r.width - edge ? 'trimR' : y < 16 && x < 26 ? 'fi' : y < 16 && x > r.width - 26 ? 'fo' : 'move';
    const orig = Object.fromEntries(ids.map((id) => { const f = findClip(P, id); return [id, { c: f.c, ti: P.tracks.indexOf(f.t) }]; })); const x0 = e.clientX, y0 = e.clientY; let moved = false; el.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0; if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return; moved = true; const dt = dx / pps; const g = {};
      if (mode === 'move') { let d = dt; const first = orig[c.id].c; const ns = snapT(first.start + d, ids); d = ns - first.start; const dTr = Math.round(dy / LANE_H); for (const id of ids) { const o = orig[id]; g[id] = { start: Math.max(0, o.c.start + d), track: clamp(o.ti + dTr, 0, P.tracks.length - 1) }; if (o.c.start + d < 0) { /* clamp whole group below */ } } const minS = Math.min(...ids.map((id) => orig[id].c.start + d)); if (minS < 0) for (const id of ids) g[id].start = orig[id].c.start + d - minS; }
      else if (mode === 'trimL') { const o = orig[c.id].c; const ns = snapT(o.start + dt, [c.id]); let d = clamp(ns - o.start, -(o.rev ? 1e9 : o.off), o.dur - 0.02); if (o.rev) d = Math.max(d, -o.start); if (o.start + d < 0) d = -o.start; const n = trimL(o, d); g[c.id] = { start: n.start, dur: n.dur, off: n.off, fi: n.fi, track: orig[c.id].ti }; }
      else if (mode === 'trimR') { const o = orig[c.id].c; const src = getBuf(o.src); const ne = snapT(o.start + o.dur + dt, [c.id]); const maxExt = src ? (o.rev ? o.off : src.duration - (o.off + o.dur)) : 0; const d = clamp(o.start + o.dur - ne, -maxExt, o.dur - 0.02); const n = trimR(o, d); g[c.id] = { dur: n.dur, off: n.off, fo: n.fo, track: orig[c.id].ti }; }
      else if (mode === 'fi') { const o = orig[c.id].c; g[c.id] = { fi: clamp(o.fi + dt, 0, o.dur - o.fo), track: orig[c.id].ti }; }
      else if (mode === 'fo') { const o = orig[c.id].c; g[c.id] = { fo: clamp(o.fo - dt, 0, o.dur - o.fi), track: orig[c.id].ti }; }
      setGhost(g);
    };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); setGhost((g) => { if (g) { const gg = g; setTimeout(() => upd((p) => applyGhost(p, gg)), 0); } return null; }); if (!moved && !e.shiftKey) { const t = (e.clientX - r.left) / pps + c.start; void t; } };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const laneDown = (e, t) => {
    if (e.button !== 0) return; const lane = e.currentTarget; const r = lane.getBoundingClientRect(); const t0 = Math.max(0, (e.clientX - r.left) / pps); let dragged = false; setSelTrack(t.id); if (!e.shiftKey) setSel([]); lane.setPointerCapture(e.pointerId);
    const mv = (ev) => { const t1 = Math.max(0, (ev.clientX - r.left) / pps); if (Math.abs(t1 - t0) * pps > 4) { dragged = true; setRange({ a: snapT(Math.min(t0, t1)), b: snapT(Math.max(t0, t1)) }); } };
    const up = () => { lane.removeEventListener('pointermove', mv); lane.removeEventListener('pointerup', up); if (!dragged) { setRange(null); seek(snapT(t0)); } else seek(Math.min(...[L.current.range?.a ?? t0])); };
    lane.addEventListener('pointermove', mv); lane.addEventListener('pointerup', up);
  };
  const rulerDown = (e) => {
    if (e.button !== 0) return; const el = e.currentTarget; const r = el.getBoundingClientRect(); el.setPointerCapture(e.pointerId); const go = (ev) => seek(Math.max(0, (ev.clientX - r.left) / pps)); go(e);
    const mv = (ev) => go(ev); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  };
  const clipMenu = (e, c) => { if (!sel.includes(c.id)) setSel([c.id]); showCtx(e, [{ label: 'Split at playhead', icon: 'scissorsV', onClick: () => split() }, { label: 'Duplicate', icon: 'copy', onClick: dup }, { label: 'Copy', onClick: () => copy(false) }, { label: 'Cut', icon: 'scissors', onClick: () => copy(true) }, { sep: true }, { label: c.rev ? 'Un-reverse' : 'Reverse', onClick: () => patchClips((x) => ({ rev: !x.rev })) }, { label: 'Normalize clip gain', onClick: normGain }, { label: 'Fade in / out (1 s)', onClick: () => { fadePreset('in'); setTimeout(() => fadePreset('out'), 0); } }, { sep: true }, { label: 'Delete', icon: 'trash', onClick: del }]); };

  /* ---------- keyboard ---------- */
  useHotkeys({
    space: () => togglePlay(), home: () => seek(0), end: () => seek(projectEnd(P)), s: () => split(), delete: () => del(), backspace: () => del(), 'ctrl+a': () => setSel(P.tracks.flatMap((t) => t.clips.map((c) => c.id))), 'ctrl+d': () => dup(), 'ctrl+c': () => copy(false), 'ctrl+x': () => copy(true), 'ctrl+v': () => paste(),
    'ctrl+z': () => h.undo(), 'ctrl+shift+z': () => h.redo(), 'ctrl+y': () => h.redo(), 'ctrl+i': () => importDialog(), 'ctrl+e': () => setDlg({ k: 'export' }), 'ctrl+s': () => saveProject(), m: () => addMarker(), l: () => upd((p) => ({ ...p, loop: { ...p.loop, on: !p.loop.on, ...(range && !p.loop.on ? { a: range.a, b: range.b } : {}) } })), r: () => (recording ? stopRecord() : startRecord()), '=': () => zoomBy(1.4), '-': () => zoomBy(1 / 1.4), '+': () => zoomBy(1.4), 'ctrl+0': () => fitZoom(),
    arrowleft: () => seek(pos.current - (1 / Math.max(1, pps / 40))), arrowright: () => seek(pos.current + (1 / Math.max(1, pps / 40))),
  });
  useEffect(() => { const el = scroll.current; const wh = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); const r = el.getBoundingClientRect(); zoomBy(Math.exp(-e.deltaY * 0.003), e.clientX - r.left); } }; el.addEventListener('wheel', wh, { passive: false }); return () => el.removeEventListener('wheel', wh); }); // eslint-disable-line
  const [dropOn, setDropOn] = useState(false);

  /* ---------- menus ---------- */
  const menus = [
    { label: 'File', items: [{ label: 'New session', icon: 'newPage', onClick: newSession }, { label: 'Import audio…', icon: 'upload', kbd: 'Ctrl+I', onClick: importDialog }, { label: 'Open session file…', icon: 'folder', onClick: async () => { const f = await pickFile('.json'); if (f) openProject(f); } }, { label: 'Save session file', icon: 'download', kbd: 'Ctrl+S', onClick: saveProject }, { sep: true }, { label: 'Export mix as WAV…', icon: 'waveform', kbd: 'Ctrl+E', onClick: () => setDlg({ k: 'export' }) }] },
    { label: 'Edit', items: [{ label: 'Undo', icon: 'undo', kbd: 'Ctrl+Z', onClick: h.undo, disabled: !h.canUndo }, { label: 'Redo', icon: 'redo', kbd: 'Ctrl+Shift+Z', onClick: h.redo, disabled: !h.canRedo }, { sep: true }, { label: 'Cut', kbd: 'Ctrl+X', onClick: () => copy(true) }, { label: 'Copy', kbd: 'Ctrl+C', onClick: () => copy(false) }, { label: 'Paste at playhead', kbd: 'Ctrl+V', onClick: paste }, { label: 'Duplicate', kbd: 'Ctrl+D', onClick: dup }, { label: 'Delete', kbd: 'Del', onClick: del }, { sep: true }, { label: 'Split at playhead', icon: 'scissorsV', kbd: 'S', onClick: () => split() }, { label: 'Delete selected time range', onClick: cutRange }, { label: 'Select all clips', kbd: 'Ctrl+A', onClick: () => setSel(P.tracks.flatMap((t) => t.clips.map((c) => c.id))) }, { sep: true }, { label: 'Snap to grid and clips', checked: P.snap, onClick: () => upd((p) => ({ ...p, snap: !p.snap })) }, { label: 'Add marker at playhead', kbd: 'M', onClick: addMarker }] },
    { label: 'Track', items: [{ label: 'Add track', icon: 'plus', onClick: addTrack }, { label: 'Rename track…', onClick: () => renameTrack(track) }, { label: 'Move track up', onClick: () => moveTrack(track.id, -1) }, { label: 'Move track down', onClick: () => moveTrack(track.id, 1) }, { label: 'Delete track', icon: 'trash', onClick: () => removeTrack() }, { sep: true }, { label: 'Arm for recording', checked: track.arm, onClick: () => upd((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, arm: t.id === track.id ? !t.arm : false })) })) }] },
    { label: 'Clip', items: [{ label: 'Reverse', onClick: () => patchClips((c) => ({ rev: !c.rev })) }, { label: 'Normalize clip gain', onClick: normGain }, { label: 'Reset gain and fades', onClick: () => patchClips({ gain: 1, fi: 0, fo: 0 }) }, { sep: true }, { label: 'Fade in (1 s)', onClick: () => fadePreset('in') }, { label: 'Fade out (1 s)', onClick: () => fadePreset('out') }, { label: 'Remove fades', onClick: () => fadePreset('none') }] },
    { label: 'Effects', items: [{ head: 'Amplitude' }, { label: 'Amplify…', onClick: amplify }, { label: 'Normalize…', onClick: normalize }, { label: 'Invert polarity', onClick: invert }, { label: 'Silence', onClick: silenceOp }, { label: 'Remove DC offset', onClick: dcOp }, { label: 'Noise gate…', onClick: gateOp }, { label: 'Compress', onClick: () => fxEffect('compress', 'Compress') }, { head: 'Time and pitch' }, { label: 'Change speed…', onClick: () => setDlg({ k: 'speed' }) }, { head: 'Tone' }, { label: 'Bass boost', onClick: () => fxEffect('bass', 'Bass boost') }, { label: 'Treble boost', onClick: () => fxEffect('treble', 'Treble boost') }, { label: 'Low-pass 2.2 kHz', onClick: () => fxEffect('lowpass', 'Low-pass') }, { label: 'High-pass 500 Hz', onClick: () => fxEffect('highpass', 'High-pass') }, { label: 'Telephone', onClick: () => fxEffect('telephone', 'Telephone') }, { label: 'Vocal clarity', onClick: () => fxEffect('vocal', 'Vocal clarity') }, { head: 'Space and colour' }, { label: 'Echo', onClick: () => fxEffect('echo', 'Echo') }, { label: 'Reverb', onClick: () => fxEffect('reverb', 'Reverb') }, { label: 'Distortion', onClick: () => fxEffect('distortion', 'Distortion') }] },
    { label: 'Generate', items: [{ label: 'Tone, noise or silence…', icon: 'waveform', onClick: () => setDlg({ k: 'gen' }) }] },
    { label: 'View', items: [{ label: 'Zoom in', icon: 'zoomIn', kbd: '=', onClick: () => zoomBy(1.4) }, { label: 'Zoom out', icon: 'zoomOut', kbd: '-', onClick: () => zoomBy(1 / 1.4) }, { label: 'Fit session', kbd: 'Ctrl+0', onClick: fitZoom }, { sep: true }, { label: 'Loop playback', icon: 'loopIco', kbd: 'L', checked: P.loop.on, onClick: () => upd((p) => ({ ...p, loop: { ...p.loop, on: !p.loop.on, ...(range && !p.loop.on ? { a: range.a, b: range.b } : {}) } })) }] },
    { label: 'Help', items: [{ label: 'Keyboard shortcuts', icon: 'keyboard', onClick: () => setDlg({ k: 'keys' }) }] },
  ];

  const ticks = []; { const step = niceStep(pps); const sub = step >= 1 ? 5 : 2; for (let t = 0; t <= laneW / pps; t += step / sub) { const major = Math.abs(Math.round(t / step) * step - t) < 1e-6; ticks.push([t, major]); } }
  const trackIndexOf = (id) => P.tracks.findIndex((t) => t.id === id);
  void trackIndexOf; void posS; void gainToDb; void rmsOf; void spectrogram; void uid;

  return (
    <div className="fx stu audio" style={{ '--brand': '#2fd1b0', '--brand-ink': '#032b24' }} data-app="audio" ref={root}>
      <AppBar id="audio" name="Techomato Audio Studio" right={<><input className="aud-name" aria-label="Session name" value={P.name} onChange={(e) => upd((p) => ({ ...p, name: e.target.value }))} /><span className="stu-hint" aria-live="polite">{save}</span><button type="button" className="fb pri" onClick={() => setDlg({ k: 'export' })}><Icon name="upload" size={14} />Export</button></>} />
      <StudioMenu menus={menus} />
      <div className="stu-opts aud-transport" role="toolbar" aria-label="Transport">
        <button type="button" className="stu-ib big" aria-label="Go to start" title="Go to start (Home)" onClick={() => seek(0)}><Icon name="skipBack" size={18} /></button>
        <button type="button" className={'stu-ib big' + (playing && !recording ? ' on' : '')} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (Space)" onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={20} /></button>
        <button type="button" className="stu-ib big" aria-label="Stop" title="Stop" onClick={stop}><Icon name="stop" size={17} /></button>
        <button type="button" className={'stu-ib big rec' + (recording ? ' on' : '')} aria-label={recording ? 'Stop recording' : 'Record'} title="Record (R)" onClick={() => (recording ? stopRecord() : startRecord())}><Icon name="record" size={18} /></button>
        <button type="button" className={'stu-ib big' + (P.loop.on ? ' on' : '')} aria-label="Loop" aria-pressed={P.loop.on} title="Loop (L)" onClick={() => upd((p) => ({ ...p, loop: { ...p.loop, on: !p.loop.on, ...(range && !p.loop.on ? { a: range.a, b: range.b } : {}) } }))}><Icon name="loopIco" size={18} /></button>
        <div className="aud-clock" aria-label="Playhead time" role="timer"><span ref={timeRef}>00:00.00</span></div>
        <span className="stu-sep" />
        <label className="stu-chk"><input type="checkbox" checked={P.snap} onChange={(e) => upd((p) => ({ ...p, snap: e.target.checked }))} />Snap</label>
        <button type="button" className="stu-ib" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}><Icon name="zoomOut" size={16} /></button><button type="button" className="stu-ib" aria-label="Zoom in" onClick={() => zoomBy(1.4)}><Icon name="zoomIn" size={16} /></button><button type="button" className="stu-btn" onClick={fitZoom}>Fit</button>
        <span className="spacer" />
        <Icon name="volume" size={16} /><input type="range" className="aud-mvol" aria-label="Master volume" min={0} max={1.5} step={0.01} value={masterVol} onChange={(e) => setMasterVol(+e.target.value)} /><Meter id="master" />
      </div>
      <div className="stu-body">
        <div className="stu-center" onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDropOn(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDropOn(false); }} onDrop={(e) => { e.preventDefault(); setDropOn(false); importFiles([...e.dataTransfer.files]); }}>
          <div className="aud-scroll" ref={scroll}>
            <div className="aud-content" style={{ width: HEAD_W + laneW }}>
              <div className="aud-ruler-row" style={{ height: RULER_H }}>
                <div className="aud-corner" style={{ width: HEAD_W }}><button type="button" className="stu-btn" onClick={addTrack}><Icon name="plus" size={13} />Track</button></div>
                <div className="aud-ruler" style={{ width: laneW }} onPointerDown={rulerDown} role="slider" aria-label="Timeline ruler" aria-valuenow={Math.round(pos.current * 100) / 100}>
                  {P.loop.on && <div className="aud-loopbar" style={{ left: P.loop.a * pps, width: (P.loop.b - P.loop.a) * pps }} />}
                  {ticks.map(([t, major], i) => <i key={i} className={major ? 'maj' : ''} style={{ left: t * pps }}>{major && <span>{fmtClock(t).replace(/^00:/, '')}</span>}</i>)}
                  {P.markers.map((m) => <b key={m.id} className="aud-marker" style={{ left: m.t * pps }} title={m.name} onDoubleClick={() => upd((p) => ({ ...p, markers: p.markers.filter((x) => x.id !== m.id) }))}>{m.name}</b>)}
                </div>
              </div>
              <div className="aud-lanes">
                {view.tracks.map((t, ti) => (
                  <div className={'aud-trk' + (t.id === selTrack ? ' sel' : '')} key={t.id} style={{ height: LANE_H, '--tc': t.color }}>
                    <div className="aud-th" style={{ width: HEAD_W }} onPointerDown={() => setSelTrack(t.id)}>
                      <div className="aud-th1"><ColorField label={`${t.name} colour`} value={t.color} size={12} onChange={(v) => patchTrack(t.id, { color: v })} /><span className="aud-tn ellip" title="Double-click to rename" onDoubleClick={() => renameTrack(t)}>{t.name}</span>
                        <button type="button" className={'aud-tb' + (t.mute ? ' on m' : '')} aria-label={`Mute ${t.name}`} aria-pressed={t.mute} onClick={() => patchTrack(t.id, { mute: !t.mute })}>M</button>
                        <button type="button" className={'aud-tb' + (t.solo ? ' on s' : '')} aria-label={`Solo ${t.name}`} aria-pressed={t.solo} onClick={() => patchTrack(t.id, { solo: !t.solo })}>S</button>
                        <button type="button" className={'aud-tb' + (t.arm ? ' on r' : '')} aria-label={`Arm ${t.name} for recording`} aria-pressed={t.arm} onClick={() => upd((p) => ({ ...p, tracks: p.tracks.map((x) => ({ ...x, arm: x.id === t.id ? !x.arm : false })) }))}>R</button></div>
                      <div className="aud-th2"><Icon name="volume" size={12} /><input type="range" aria-label={`Volume ${t.name}`} min={0} max={1.5} step={0.01} value={t.vol} onPointerDown={() => (live.current = h.ref.current)} onChange={(e) => liveTrack(t.id, { vol: +e.target.value })} onPointerUp={liveEnd} onKeyUp={liveEnd} /><span className="aud-db">{gainToDb(t.vol).toFixed(1)}</span></div>
                      <div className="aud-th2"><span className="aud-pl">Pan</span><input type="range" aria-label={`Pan ${t.name}`} min={-1} max={1} step={0.01} value={t.pan} onPointerDown={() => (live.current = h.ref.current)} onChange={(e) => liveTrack(t.id, { pan: +e.target.value })} onPointerUp={liveEnd} onKeyUp={liveEnd} onDoubleClick={() => patchTrack(t.id, { pan: 0 })} /><Meter id={t.id} /></div>
                    </div>
                    <div className="aud-lane" style={{ width: laneW }} onPointerDown={(e) => laneDown(e, t)}>
                      {t.clips.map((c) => {
                        const buf = getBuf(c.src); const w = c.dur * pps; const on = sel.includes(c.id);
                        return (
                          <div key={c.id} className={'aud-clip' + (on ? ' on' : '') + (ghost && ghost[c.id] ? ' drag' : '')} style={{ left: c.start * pps, width: Math.max(2, w) }} role="button" tabIndex={0} aria-label={`Clip ${c.name}`} aria-pressed={on} onPointerDown={(e) => clipDown(e, c, ti)} onContextMenu={(e) => clipMenu(e, c)} onDoubleClick={() => setTab('props')}>
                            <div className="aud-clip-h ellip">{c.rev ? '◀ ' : ''}{c.name}{c.gain !== 1 ? ` · ${gainToDb(c.gain).toFixed(1)} dB` : ''}</div>
                            {buf ? <Wave buf={buf} off={c.off} dur={c.dur} rev={c.rev} w={Math.max(2, w - 2)} h={LANE_H - 22} color="rgba(255,255,255,.88)" /> : <span className="stu-hint">missing audio</span>}
                            {c.fi > 0 && <svg className="aud-fade in" width={c.fi * pps} height={LANE_H - 22} preserveAspectRatio="none" viewBox="0 0 10 10"><path d="M0 10 L10 0 L10 10 Z" /></svg>}
                            {c.fo > 0 && <svg className="aud-fade out" width={c.fo * pps} height={LANE_H - 22} preserveAspectRatio="none" viewBox="0 0 10 10"><path d="M0 0 L10 10 L0 10 Z" /></svg>}
                            {on && <><i className="aud-fh l" style={{ left: c.fi * pps }} title="Fade in" /><i className="aud-fh r" style={{ right: c.fo * pps }} title="Fade out" /></>}
                          </div>
                        );
                      })}
                      {!t.clips.length && <span className="aud-hint">Drop audio here, press R to record, or use Generate</span>}
                    </div>
                  </div>
                ))}
                {range && <div className="aud-range" style={{ left: HEAD_W + range.a * pps, width: (range.b - range.a) * pps }} aria-label="Selected range" />}
              </div>
              <div className="aud-ph" ref={phRef} style={{ left: HEAD_W }}><i /></div>
            </div>
          </div>
          <div className="stu-status" role="status"><span>{P.tracks.length} tracks</span><span>{P.tracks.reduce((n, t) => n + t.clips.length, 0)} clips</span><span>Length {fmtClock(projectEnd(P))}</span>{range && <span>Range {fmtClock(range.a)} – {fmtClock(range.b)} ({(range.b - range.a).toFixed(2)} s)</span>}{sel.length > 0 && <span>{sel.length} selected</span>}<span className="spacer" /><span>{Math.round(pps)} px/s</span>{eng.current.ctx && <span>{eng.current.ctx.sampleRate / 1000} kHz</span>}</div>
          {dropOn && <div className="stu-drop">Drop audio files to import</div>}
        </div>
        <aside className="stu-side wide" aria-label="Panels">
          <div className="stu-tabs" role="tablist">{[['props', 'Properties'], ['fx', 'Effects rack'], ['analyze', 'Analyze'], ['mixer', 'Mixer']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={'stu-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
          {tab === 'props' && <>
            {selClip ? (
              <PanelBox title={`Clip · ${selClip.c.name}`} id="aud-clip">
                <Row label="Name"><input className="fi aud-fi" aria-label="Clip name" value={selClip.c.name} onChange={(e) => liveClip({ name: e.target.value })} onBlur={liveEnd} /></Row>
                <Num label="Gain" value={+gainToDb(selClip.c.gain).toFixed(1)} min={-40} max={18} step={0.1} unit="dB" onChange={(v) => liveClip({ gain: dbToGain(v) })} onCommit={liveEnd} />
                <Num label="Fade in" value={+selClip.c.fi.toFixed(2)} min={0} max={Math.max(0.01, selClip.c.dur)} step={0.01} unit="s" onChange={(v) => liveClip({ fi: v })} onCommit={liveEnd} />
                <Num label="Fade out" value={+selClip.c.fo.toFixed(2)} min={0} max={Math.max(0.01, selClip.c.dur)} step={0.01} unit="s" onChange={(v) => liveClip({ fo: v })} onCommit={liveEnd} />
                <Num label="Start" value={+selClip.c.start.toFixed(3)} min={0} max={3600} step={0.01} unit="s" slider={false} onChange={(v) => liveClip({ start: v })} onCommit={liveEnd} />
                <label className="stu-chk"><input type="checkbox" checked={selClip.c.rev} onChange={(e) => patchClips({ rev: e.target.checked })} />Reverse</label>
                <div className="aud-stats"><span>Length {selClip.c.dur.toFixed(2)} s</span><span>Peak {gainToDb(peakOf(getBuf(selClip.c.src), selClip.c.off, selClip.c.dur) * selClip.c.gain).toFixed(1)} dB</span><span>RMS {gainToDb(rmsOf(getBuf(selClip.c.src), selClip.c.off, selClip.c.dur) * selClip.c.gain).toFixed(1)} dB</span></div>
                <div className="aud-btns"><button type="button" className="stu-btn" onClick={() => split()}>Split at playhead</button><button type="button" className="stu-btn" onClick={normGain}>Normalize</button><button type="button" className="stu-btn" onClick={dup}>Duplicate</button><button type="button" className="stu-btn" onClick={del}>Delete</button></div>
              </PanelBox>
            ) : <PanelBox title={sel.length > 1 ? `${sel.length} clips selected` : 'Clip'}><p className="stu-hint">{sel.length > 1 ? 'Use the Clip menu or toolbar to edit them together.' : 'Select a clip in the timeline to edit its gain, fades and direction.'}</p></PanelBox>}
            <PanelBox title={`Track · ${track.name}`} id="aud-track">
              <Num label="Volume" value={+gainToDb(track.vol).toFixed(1)} min={-60} max={3.5} step={0.1} unit="dB" onChange={(v) => liveTrack(track.id, { vol: dbToGain(v) })} onCommit={liveEnd} />
              <Num label="Pan" value={track.pan} min={-1} max={1} step={0.01} onChange={(v) => liveTrack(track.id, { pan: v })} onCommit={liveEnd} />
              <div className="aud-btns"><button type="button" className="stu-btn" onClick={() => renameTrack(track)}>Rename</button><button type="button" className="stu-btn" onClick={() => moveTrack(track.id, -1)}>Move up</button><button type="button" className="stu-btn" onClick={() => moveTrack(track.id, 1)}>Move down</button><button type="button" className="stu-btn" onClick={() => removeTrack()}>Delete</button></div>
            </PanelBox>
            <PanelBox title="Markers" open={P.markers.length > 0}><ul className="stu-list">{P.markers.map((m) => <li key={m.id} className="stu-li" onClick={() => seek(m.t)}><span className="grow">{m.name}</span><span>{fmtClock(m.t)}</span><button type="button" className="stu-ib" aria-label={`Delete ${m.name}`} onClick={(e) => { e.stopPropagation(); upd((p) => ({ ...p, markers: p.markers.filter((x) => x.id !== m.id) })); }}><Icon name="x" size={12} /></button></li>)}</ul></PanelBox>
          </>}
          {tab === 'fx' && <PanelBox title={`Effects · ${track.name}`} id="aud-fx"><FxRack fx={track.fx} onChange={(fx) => liveTrack(track.id, { fx })} onEnd={liveEnd} /><p className="stu-hint">Real-time track effects, heard instantly and included in the exported mix. Use the Effects menu to bake an effect into a clip.</p></PanelBox>}
          {tab === 'analyze' && <>
            <PanelBox title="Live spectrum" id="aud-spec"><canvas ref={specCv} className="aud-spec" width={300} height={110} aria-label="Spectrum analyzer" /><p className="stu-hint">Shows the master output while playing (30 Hz – 18 kHz).</p></PanelBox>
            <PanelBox title="Spectrogram" id="aud-sg"><SpectroPanel clip={selClip && selClip.c} getBuf={getBuf} /></PanelBox>
          </>}
          {tab === 'mixer' && <PanelBox title="Mixer" id="aud-mix"><div className="aud-mixer">{P.tracks.map((t) => <div className="aud-strip" key={t.id} style={{ '--tc': t.color }}><span className="aud-sn ellip">{t.name}</span><div className="aud-faders"><input type="range" className="aud-vf" aria-label={`Fader ${t.name}`} min={0} max={1.5} step={0.01} value={t.vol} onPointerDown={() => (live.current = h.ref.current)} onChange={(e) => liveTrack(t.id, { vol: +e.target.value })} onPointerUp={liveEnd} /><span className="aud-meter v" data-meter={t.id}><i /><b /></span></div><input type="range" aria-label={`Pan ${t.name} (mixer)`} min={-1} max={1} step={0.01} value={t.pan} onPointerDown={() => (live.current = h.ref.current)} onChange={(e) => liveTrack(t.id, { pan: +e.target.value })} onPointerUp={liveEnd} /><div className="aud-btns"><button type="button" className={'aud-tb' + (t.mute ? ' on m' : '')} aria-label={`Mute ${t.name} (mixer)`} onClick={() => patchTrack(t.id, { mute: !t.mute })}>M</button><button type="button" className={'aud-tb' + (t.solo ? ' on s' : '')} aria-label={`Solo ${t.name} (mixer)`} onClick={() => patchTrack(t.id, { solo: !t.solo })}>S</button></div><span className="aud-db">{gainToDb(t.vol).toFixed(1)} dB</span></div>)}
            <div className="aud-strip master"><span className="aud-sn">Master</span><div className="aud-faders"><input type="range" className="aud-vf" aria-label="Master fader" min={0} max={1.5} step={0.01} value={masterVol} onChange={(e) => setMasterVol(+e.target.value)} /><span className="aud-meter v" data-meter="master" ref={mmeter}><i /><b /></span></div><span className="aud-db">{gainToDb(masterVol).toFixed(1)} dB</span></div></div></PanelBox>}
        </aside>
      </div>
      {dlg?.k === 'gen' && <GenerateDialog onClose={() => setDlg(null)} onOk={doGenerate} />}
      {dlg?.k === 'export' && <ExportDialog P={P} range={range} onClose={() => setDlg(null)} onOk={exportMix} />}
      {dlg?.k === 'speed' && <SpeedDialog onClose={() => setDlg(null)} onOk={speedOp} />}
      {dlg?.k === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setDlg(null)} width={520} footer={<Foot onClose={() => setDlg(null)} ok="Close" onOk={() => setDlg(null)} />}><div className="aud-keys">{[['Space', 'Play / pause'], ['Home / End', 'Go to start / end'], ['S', 'Split clips at the playhead'], ['Delete', 'Delete selected clips'], ['Ctrl+C / X / V', 'Copy / cut / paste'], ['Ctrl+D', 'Duplicate'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['R', 'Record'], ['L', 'Loop'], ['M', 'Add marker'], ['= / -', 'Zoom in / out'], ['Ctrl+wheel', 'Zoom at pointer'], ['Ctrl+I', 'Import audio'], ['Ctrl+E', 'Export mix']].map(([k, d]) => <div key={k}><kbd>{k}</kbd><span>{d}</span></div>)}</div></Modal>}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}

function SpectroPanel({ clip, getBuf }) {
  const ref = useRef(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = ref.current; if (!c) return; const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); if (!clip) return; const buf = getBuf(clip.src); if (!buf) return; setBusy(true);
    const t = setTimeout(() => { const w = 300, hh = 150; const sg = spectrogram(buf, clip.off, clip.dur, w, hh); c.width = w; c.height = hh; g.putImageData(new ImageData(sg.data, w, hh), 0, 0); setBusy(false); }, 30); return () => clearTimeout(t);
  }, [clip && clip.id, clip && clip.src, clip && clip.off, clip && clip.dur]); // eslint-disable-line
  return <><canvas ref={ref} className="aud-spec" width={300} height={150} aria-label="Spectrogram" />{!clip && <p className="stu-hint">Select a clip to see its frequency content over time (0 – 12 kHz).</p>}{busy && <p className="stu-hint">Analysing…</p>}</>;
}
