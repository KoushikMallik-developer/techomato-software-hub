import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast, useAsk } from '../components/fxui.jsx';
import { useStore, uid } from '../lib/useStore.js';
import { idbGet, idbSet, idbDel } from '../lib/idb.js';
import { safeName } from '../lib/download.js';
import '../styles/recorder.css';

const MODES = [
  { id: 'screen', label: 'Screen', desc: 'A window, a tab or your whole screen', icon: 'fullscreen', video: true },
  { id: 'both', label: 'Screen + camera', desc: 'Your screen with a camera bubble', icon: 'image', video: true },
  { id: 'camera', label: 'Camera', desc: 'Record yourself with the webcam', icon: 'image', video: true },
  { id: 'voice', label: 'Voice only', desc: 'Microphone audio recording', icon: 'note', video: false },
];
const DEF = { mode: 'screen', mic: true, sys: true, res: 1080, fps: 30, mbps: 5, fmt: 'webm', corner: 'br', bsize: 'm', shape: 'circle', mirror: true, countdown: 3, camId: '', micId: '' };
const blank = () => ({ items: [], s: DEF });
const migrate = (d) => ({ items: Array.isArray(d && d.items) ? d.items : [], s: { ...DEF, ...((d && d.s) || {}) } });
const fmtT = (t) => { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const fmtB = (n) => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const MIMES = { webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], mp4: ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'] };
const AMIMES = { webm: ['audio/webm;codecs=opus', 'audio/webm'], mp4: ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'] };
const pickMime = (fmt, video) => { const l = (video ? MIMES : AMIMES)[fmt] || []; return l.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''; };
const extOf = (mime) => (/mp4/.test(mime) ? 'mp4' : 'webm');

/* give a recorded blob a real duration/seek bar (MediaRecorder output has none) */
function fixDuration(v) { const f = () => { if (v.duration === Infinity || isNaN(v.duration)) { v.currentTime = 1e101; v.addEventListener('timeupdate', function h() { v.removeEventListener('timeupdate', h); v.currentTime = 0; }); } }; v.addEventListener('loadedmetadata', f, { once: true }); }

export default function RecorderApp() {
  const [data, setData, meta] = useStore('recorder', blank, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk();
  const s = data.s; const set = (p) => setData((d) => ({ ...d, s: { ...d.s, ...p } }));
  const [tab, setTab] = useState('record'); const [state, setState] = useState('idle'); const [count, setCount] = useState(0); const [secs, setSecs] = useState(0); const [level, setLevel] = useState(0); const [err, setErr] = useState('');
  const [play, setPlay] = useState(null); const [devs, setDevs] = useState({ cams: [], mics: [] }); const [camOn, setCamOn] = useState(false);
  const stage = useRef(null); const R = useRef({}); const support = useMemo(() => ({ mp4: !!pickMime('mp4', true), webm: !!pickMime('webm', true), display: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia), rec: !!window.MediaRecorder }), []);
  const mode = MODES.find((m) => m.id === s.mode);

  /* drop library entries whose data vanished (for example after restoring a backup on another browser) */
  useEffect(() => { (async () => { const gone = []; for (const it of data.items) { if (!(await idbGet('rec:' + it.id))) gone.push(it.id); } if (gone.length) setData((d) => ({ ...d, items: d.items.filter((x) => !gone.includes(x.id)) })); })(); /* eslint-disable-next-line */ }, []);

  const stopAll = useCallback(() => { const r = R.current; (r.streams || []).forEach((st) => st.getTracks().forEach((t) => t.stop())); r.streams = []; cancelAnimationFrame(r.raf); clearInterval(r.timer); if (r.actx) { try { r.actx.close(); } catch { /* ignore */ } } r.actx = null; r.analyser = null; setLevel(0); const v = stage.current; if (v) v.srcObject = null; }, []);
  useEffect(() => () => { stopAll(); }, [stopAll]);
  const refreshDevs = useCallback(async () => { try { const l = await navigator.mediaDevices.enumerateDevices(); setDevs({ cams: l.filter((d) => d.kind === 'videoinput'), mics: l.filter((d) => d.kind === 'audioinput') }); } catch { /* ignore */ } }, []);
  useEffect(() => { refreshDevs(); }, [refreshDevs]);

  /* mic level meter */
  const meter = useCallback((actx, node) => { const an = actx.createAnalyser(); an.fftSize = 512; node.connect(an); const buf = new Uint8Array(an.fftSize); R.current.analyser = an; const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i] - 128)); setLevel(Math.min(1, m / 90)); R.current.raf = requestAnimationFrame(tick); }; tick(); }, []);

  /* acquire media for the chosen mode; returns {stream (to record), preview (to show)} */
  const acquire = useCallback(async () => {
    const r = R.current; r.streams = []; const audioConstraint = s.mic ? (s.micId ? { deviceId: { exact: s.micId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true }) : false;
    const camC = { width: { ideal: 1280 }, height: { ideal: 720 }, ...(s.camId ? { deviceId: { exact: s.camId } } : {}) };
    let screen = null, cam = null, mic = null;
    if (s.mode === 'screen' || s.mode === 'both') { screen = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: s.res * 16 / 9 }, height: { ideal: s.res }, frameRate: { ideal: s.fps } }, audio: s.sys }); r.streams.push(screen); }
    if (s.mode === 'camera' || s.mode === 'both') { cam = await navigator.mediaDevices.getUserMedia({ video: camC }); r.streams.push(cam); }
    if (audioConstraint) { try { mic = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint }); r.streams.push(mic); } catch (e) { if (s.mode === 'voice') throw e; toast('Microphone unavailable. Recording without it.'); } }
    refreshDevs();
    // audio graph: mix mic + system audio into one track
    const audios = [mic, screen].filter((x) => x && x.getAudioTracks().length);
    let audioTrack = null;
    if (audios.length) { const actx = new (window.AudioContext || window.webkitAudioContext)(); r.actx = actx; const dest = actx.createMediaStreamDestination(); const mix = actx.createGain(); mix.connect(dest); audios.forEach((a) => actx.createMediaStreamSource(new MediaStream(a.getAudioTracks())).connect(mix)); audioTrack = dest.stream.getAudioTracks()[0]; meter(actx, mix); }
    let videoTrack = null, preview;
    if (s.mode === 'both') {
      const sv = document.createElement('video'); sv.muted = true; sv.srcObject = new MediaStream(screen.getVideoTracks()); const cv = document.createElement('video'); cv.muted = true; cv.srcObject = new MediaStream(cam.getVideoTracks()); await Promise.all([sv.play(), cv.play()]);
      const c = document.createElement('canvas'); const st = screen.getVideoTracks()[0].getSettings(); c.width = st.width || sv.videoWidth || 1280; c.height = st.height || sv.videoHeight || 720; const g = c.getContext('2d'); const draw = () => {
        g.drawImage(sv, 0, 0, c.width, c.height); if (cv.videoWidth) { const sz = Math.round(c.height * ({ s: 0.18, m: 0.26, l: 0.36 }[s.bsize])); const pad = Math.round(c.height * 0.03); const x = s.corner.includes('r') ? c.width - sz - pad : pad, y = s.corner.includes('b') ? c.height - sz - pad : pad; g.save(); g.beginPath(); if (s.shape === 'circle') g.arc(x + sz / 2, y + sz / 2, sz / 2, 0, 7); else g.roundRect(x, y, sz, sz, sz * 0.12); g.clip(); const k = Math.max(sz / cv.videoWidth, sz / cv.videoHeight); const dw = cv.videoWidth * k, dh = cv.videoHeight * k; if (s.mirror) { g.translate(x + sz, 0); g.scale(-1, 1); g.drawImage(cv, (sz - dw) / 2, y + (sz - dh) / 2, dw, dh); } else g.drawImage(cv, x + (sz - dw) / 2, y + (sz - dh) / 2, dw, dh); g.restore(); g.lineWidth = Math.max(2, sz * 0.015); g.strokeStyle = '#fff'; g.beginPath(); if (s.shape === 'circle') g.arc(x + sz / 2, y + sz / 2, sz / 2, 0, 7); else g.roundRect(x, y, sz, sz, sz * 0.12); g.stroke(); }
      };
      const loop = setInterval(draw, 1000 / s.fps); r.timer2 = loop; r.streams.push({ getTracks: () => [{ stop: () => clearInterval(loop) }] }); draw();
      const out = c.captureStream(s.fps); videoTrack = out.getVideoTracks()[0]; preview = out; r.canvas = c;
    } else if (screen) { videoTrack = screen.getVideoTracks()[0]; preview = new MediaStream([videoTrack]); }
    else if (cam) { videoTrack = cam.getVideoTracks()[0]; preview = new MediaStream([videoTrack]); }
    const rec = new MediaStream([...(videoTrack ? [videoTrack] : []), ...(audioTrack ? [audioTrack] : [])]);
    if (screen) screen.getVideoTracks()[0].addEventListener('ended', () => R.current.onEnded && R.current.onEnded());
    return { rec, preview };
  }, [s, meter, refreshDevs, toast]);

  const attachPreview = (p) => { const v = stage.current; if (!v) return; v.srcObject = p; v.muted = true; v.play().catch(() => {}); };

  const begin = async () => {
    setErr(''); if (!support.rec) { setErr('This browser cannot record. Try a recent Chrome, Edge or Firefox.'); return; }
    if ((s.mode === 'screen' || s.mode === 'both') && !support.display) { setErr('Screen capture is not available in this browser (it is usually missing on phones and tablets).'); return; }
    let media;
    try { media = await acquire(); } catch (e) { stopAll(); setErr(e && e.name === 'NotAllowedError' ? 'Permission was denied. Allow access in the browser prompt or in the address bar settings, then try again.' : e && e.name === 'NotFoundError' ? 'No camera or microphone was found.' : 'Could not start: ' + (e && e.message ? e.message : e)); return; }
    attachPreview(media.preview); R.current.media = media;
    if (s.countdown > 0) { setState('countdown'); for (let i = s.countdown; i > 0; i--) { setCount(i); await new Promise((r) => setTimeout(r, 1000)); if (R.current.cancel) { R.current.cancel = false; stopAll(); setState('idle'); return; } } }
    startRec(media.rec);
  };
  const startRec = (stream) => {
    const video = mode.video; const mime = pickMime(s.fmt === 'mp4' && support.mp4 ? 'mp4' : 'webm', video); const r = R.current; r.chunks = [];
    let mr; try { mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), ...(video ? { videoBitsPerSecond: s.mbps * 1000000 } : {}), audioBitsPerSecond: 128000 }); } catch (e) { stopAll(); setState('idle'); setErr('Could not start the recorder: ' + e.message); return; }
    r.mr = mr; r.mime = mr.mimeType || mime || (video ? 'video/webm' : 'audio/webm'); r.t0 = Date.now(); r.acc = 0; r.paused = false; r.thumb = null;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = () => finish();
    r.onEnded = () => stop();
    mr.start(1000); setSecs(0); setState('recording');
    r.timer = setInterval(() => { const t = r.acc + (r.paused ? 0 : (Date.now() - r.t0) / 1000); setSecs(t); }, 250);
    if (video) setTimeout(() => grabThumb(), 700);
  };
  const grabThumb = () => { const v = stage.current; if (!v || !v.videoWidth) return; const c = document.createElement('canvas'); const k = 240 / v.videoWidth; c.width = 240; c.height = Math.round(v.videoHeight * k); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); R.current.thumb = c.toDataURL('image/jpeg', 0.6); };
  const pause = () => { const r = R.current; if (!r.mr) return; if (r.mr.state === 'recording') { r.mr.pause(); r.acc += (Date.now() - r.t0) / 1000; r.paused = true; setState('paused'); } else if (r.mr.state === 'paused') { r.mr.resume(); r.t0 = Date.now(); r.paused = false; setState('recording'); } };
  const stop = () => { const r = R.current; if (r.mr && r.mr.state !== 'inactive') { if (!r.paused) r.acc += (Date.now() - r.t0) / 1000; r.dur = r.acc; r.mr.stop(); setState('saving'); } };
  const cancel = () => { const r = R.current; if (state === 'countdown') { r.cancel = true; return; } if (r.mr && r.mr.state !== 'inactive') { r.discard = true; r.mr.stop(); } };
  const finish = async () => {
    const r = R.current; const discard = r.discard; r.discard = false; stopAll();
    if (discard) { setState('idle'); toast('Recording discarded'); return; }
    const blob = new Blob(r.chunks, { type: r.mime.split(';')[0] }); r.chunks = [];
    if (!blob.size) { setState('idle'); setErr('Nothing was recorded.'); return; }
    const id = uid(); const ok = await idbSet('rec:' + id, blob);
    if (!ok) { setState('idle'); setErr('Your browser could not store the recording (storage may be full or blocked). It was not saved.'); return; }
    const d = new Date(); const name = `${mode.label} recording ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    setData((x) => ({ ...x, items: [{ id, name, kind: s.mode, mime: blob.type, size: blob.size, dur: r.dur || 0, created: Date.now(), thumb: r.thumb || null }, ...x.items] }));
    setState('idle'); setTab('library'); toast('Recording saved');
  };
  useEffect(() => { if (state !== 'recording' && state !== 'paused') return undefined; const h = (e) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [state]);

  /* camera preview before recording */
  const togglePreview = async () => { if (camOn) { stopAll(); setCamOn(false); return; } try { const st = await navigator.mediaDevices.getUserMedia({ video: s.camId ? { deviceId: { exact: s.camId } } : true, audio: s.mic ? (s.micId ? { deviceId: { exact: s.micId } } : true) : false }); R.current.streams = [st]; attachPreview(new MediaStream(st.getVideoTracks())); if (st.getAudioTracks().length) { const actx = new (window.AudioContext || window.webkitAudioContext)(); R.current.actx = actx; meter(actx, actx.createMediaStreamSource(st)); } setCamOn(true); refreshDevs(); } catch (e) { setErr('Could not open the camera or microphone: ' + (e.name === 'NotAllowedError' ? 'permission denied.' : e.message)); } };
  useEffect(() => { if (state === 'idle' && camOn && !['camera', 'both', 'voice'].includes(s.mode)) { stopAll(); setCamOn(false); } }, [s.mode, camOn, state, stopAll]);

  /* library */
  const rename = async (it) => { const n = await ask({ kind: 'prompt', title: 'Rename recording', value: it.name, okText: 'Rename' }); if (n && n.trim()) setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, name: n.trim() } : x)) })); };
  const del = async (it) => { if (!(await ask({ kind: 'confirm', title: 'Delete recording', message: `Delete "${it.name}"? This cannot be undone.`, okText: 'Delete', danger: true }))) return; await idbDel('rec:' + it.id); setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) })); if (play && play.it.id === it.id) setPlay(null); };
  const open = async (it) => { const b = await idbGet('rec:' + it.id); if (!b) { toast('That recording is no longer stored'); return; } setPlay({ it, url: URL.createObjectURL(b), blob: b }); };
  const closePlay = () => { if (play) URL.revokeObjectURL(play.url); setPlay(null); };
  const save = async (it, blobIn) => { const b = blobIn || (await idbGet('rec:' + it.id)); if (!b) { toast('That recording is no longer stored'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = safeName(it.name) + '.' + extOf(it.mime); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const total = data.items.reduce((a, x) => a + x.size, 0);
  const busy = state !== 'idle';

  return (
    <div className="fx rc" style={{ '--brand': '#d13438', '--brand-h': '#b02a2e', '--brand-soft': '#fdecec' }} data-app="recorder">
      <AppBar id="recorder" name="Techomato Recorder" status={meta.status === 'error' ? 'error' : undefined}
        backup={{ name: 'recorder', get: () => data, set: (d) => meta.replace(migrate(d)), blank }} extraMenu={[{ label: 'Note: backups cover settings and the list, not the videos' , onClick: () => toast('Download each recording from the Library to keep it.') }]} />
      <div className="fx-tabs rc-tabs" role="tablist"><button role="tab" aria-selected={tab === 'record'} className={tab === 'record' ? 'on' : ''} onClick={() => setTab('record')}>Record</button><button role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>Library{data.items.length ? ` (${data.items.length})` : ''}</button></div>
      {tab === 'record' && (
        <div className="rc-main">
          <aside className="rc-side" aria-label="Recording setup">
            <div className="fx-head">What to record</div>
            <div className="rc-modes" role="radiogroup" aria-label="Source">{MODES.map((m) => <button key={m.id} role="radio" aria-checked={s.mode === m.id} className={'rc-mode' + (s.mode === m.id ? ' on' : '')} disabled={busy} onClick={() => set({ mode: m.id })}><b>{m.label}</b><span>{m.desc}</span></button>)}</div>
            <div className="fx-head">Audio</div>
            <label className="rc-chk"><input type="checkbox" checked={s.mic} disabled={busy} onChange={(e) => set({ mic: e.target.checked })} /> Microphone</label>
            {s.mic && devs.mics.length > 1 && <select className="fi" aria-label="Microphone" disabled={busy} value={s.micId} onChange={(e) => set({ micId: e.target.value })}><option value="">Default microphone</option>{devs.mics.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || 'Microphone ' + (i + 1)}</option>)}</select>}
            {(s.mode === 'screen' || s.mode === 'both') && <label className="rc-chk"><input type="checkbox" checked={s.sys} disabled={busy} onChange={(e) => set({ sys: e.target.checked })} /> Share tab or system audio <small>(when the browser offers it)</small></label>}
            {(s.mode === 'camera' || s.mode === 'both') && devs.cams.length > 1 && <><div className="fx-head">Camera</div><select className="fi" aria-label="Camera" disabled={busy} value={s.camId} onChange={(e) => set({ camId: e.target.value })}><option value="">Default camera</option>{devs.cams.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || 'Camera ' + (i + 1)}</option>)}</select></>}
            {s.mode === 'both' && <><div className="fx-head">Camera bubble</div>
              <div className="rc-row"><label className="rc-lbl">Corner<select className="fi" aria-label="Corner" disabled={busy} value={s.corner} onChange={(e) => set({ corner: e.target.value })}><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option></select></label><label className="rc-lbl">Size<select className="fi" aria-label="Bubble size" disabled={busy} value={s.bsize} onChange={(e) => set({ bsize: e.target.value })}><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option></select></label></div>
              <div className="rc-row"><label className="rc-lbl">Shape<select className="fi" aria-label="Bubble shape" disabled={busy} value={s.shape} onChange={(e) => set({ shape: e.target.value })}><option value="circle">Circle</option><option value="square">Rounded square</option></select></label><label className="rc-chk" style={{ alignSelf: 'end', height: 32 }}><input type="checkbox" checked={s.mirror} disabled={busy} onChange={(e) => set({ mirror: e.target.checked })} /> Mirror</label></div></>}
            {mode.video && <><div className="fx-head">Quality</div>
              <div className="rc-row">{(s.mode === 'screen' || s.mode === 'both') && <label className="rc-lbl">Resolution<select className="fi" aria-label="Resolution" disabled={busy} value={s.res} onChange={(e) => set({ res: +e.target.value })}><option value={720}>720p</option><option value={1080}>1080p</option><option value={1440}>1440p</option></select></label>}<label className="rc-lbl">Frame rate<select className="fi" aria-label="Frame rate" disabled={busy} value={s.fps} onChange={(e) => set({ fps: +e.target.value })}><option value={15}>15 fps</option><option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label></div>
              <label className="rc-lbl">Bitrate <b>{s.mbps} Mbps</b><input type="range" min="1" max="16" value={s.mbps} disabled={busy} onChange={(e) => set({ mbps: +e.target.value })} aria-label="Bitrate" /></label></>}
            <label className="rc-lbl">File type<select className="fi" aria-label="File type" disabled={busy} value={s.fmt} onChange={(e) => set({ fmt: e.target.value })}><option value="webm">WebM (works everywhere in browsers)</option><option value="mp4" disabled={!support.mp4}>MP4{support.mp4 ? '' : ' (not supported here)'}</option></select></label>
            <label className="rc-lbl">Countdown<select className="fi" aria-label="Countdown" disabled={busy} value={s.countdown} onChange={(e) => set({ countdown: +e.target.value })}><option value={0}>None</option><option value={3}>3 seconds</option><option value={5}>5 seconds</option></select></label>
            <div className="rc-note">Everything is recorded and stored in this browser only. Nothing is uploaded.</div>
          </aside>
          <section className="rc-stagewrap">
            {err && <div className="rc-err" role="alert">{err}<button className="fb sub sm" onClick={() => setErr('')}>Dismiss</button></div>}
            <div className={'rc-stage' + (mode.video ? '' : ' audio') + (s.mirror && s.mode === 'camera' ? ' mirror' : '')}>
              <video ref={stage} playsInline muted aria-label="Live preview" style={{ display: busy || camOn ? 'block' : 'none' }} />
              {!busy && !camOn && <div className="rc-idle"><div className="rc-big"><Icon name={mode.icon} size={40} /></div><h2>{mode.label}</h2><p>{mode.id === 'screen' ? 'Press Start recording, then choose what to share.' : mode.id === 'both' ? 'Choose what to share. Your camera appears as a bubble in the corner.' : mode.id === 'camera' ? 'Check your framing, then start.' : 'Press Start recording to capture audio from your microphone.'}</p></div>}
              {state === 'countdown' && <div className="rc-count" aria-live="assertive">{count}</div>}
              {(state === 'recording' || state === 'paused') && <div className="rc-hud"><span className={'rc-dot' + (state === 'paused' ? ' paused' : '')} />{state === 'paused' ? 'Paused' : 'Recording'} · {fmtT(secs)}</div>}
              {!mode.video && busy && <div className="rc-wave"><i style={{ transform: `scaleX(${0.03 + level})` }} /></div>}
            </div>
            <div className="rc-controls" role="toolbar" aria-label="Recording controls">
              {state === 'idle' && <><button className="fb pri lg rc-go" onClick={begin}><span className="rc-rec" /> Start recording</button>{['camera', 'both', 'voice'].includes(s.mode) && <button className="fb lg" onClick={togglePreview}>{camOn ? 'Stop preview' : s.mode === 'voice' ? 'Test microphone' : 'Preview camera'}</button>}</>}
              {state === 'countdown' && <button className="fb lg" onClick={cancel}>Cancel</button>}
              {(state === 'recording' || state === 'paused') && <><button className="fb pri lg" onClick={stop}><span className="rc-sq" /> Stop and save</button><button className="fb lg" onClick={pause}>{state === 'paused' ? 'Resume' : 'Pause'}</button><button className="fb sub lg" onClick={cancel}>Discard</button></>}
              {state === 'saving' && <span className="rc-saving">Saving…</span>}
              {(s.mic && (camOn || busy)) && <div className="rc-meter" title="Microphone level" aria-label="Microphone level"><i style={{ width: Math.round(level * 100) + '%' }} /></div>}
            </div>
          </section>
        </div>
      )}
      {tab === 'library' && (
        <div className="rc-lib">
          {!data.items.length ? <div className="fx-empty rc-empty"><div className="rc-big"><Icon name="note" size={36} /></div><h2>No recordings yet</h2><p>Finished recordings are saved here, in this browser.</p><button className="fb pri" onClick={() => setTab('record')}>Make a recording</button></div> : <>
            <div className="rc-libhead"><span>{data.items.length} recording{data.items.length > 1 ? 's' : ''} · {fmtB(total)}</span><span className="muted">Download what you want to keep. Clearing browser data deletes recordings.</span></div>
            <div className="rc-grid">{data.items.map((it) => (
              <article key={it.id} className="rc-card">
                <button className="rc-th" onClick={() => open(it)} aria-label={'Play ' + it.name}>{it.thumb ? <img src={it.thumb} alt="" /> : <span className="rc-athumb"><Icon name="note" size={32} /></span>}<span className="rc-play">▶</span><span className="rc-dur">{fmtT(it.dur)}</span></button>
                <div className="rc-cinfo"><div className="rc-cname ellip" title={it.name}>{it.name}</div><div className="rc-cmeta">{new Date(it.created).toLocaleDateString()} · {fmtB(it.size)} · {extOf(it.mime).toUpperCase()}</div></div>
                <div className="rc-cact"><button className="fb sub sm" onClick={() => save(it)} aria-label={'Download ' + it.name}><Icon name="download" size={14} /></button><button className="fb sub sm" onClick={() => rename(it)} aria-label={'Rename ' + it.name}><Icon name="edit" size={14} /></button><button className="fb sub sm" onClick={() => del(it)} aria-label={'Delete ' + it.name}><Icon name="trash" size={14} /></button></div>
              </article>))}</div></>}
        </div>
      )}
      {play && <Modal title={play.it.name} onClose={closePlay} width={860} footer={<><button className="fb" onClick={() => save(play.it, play.blob)}><Icon name="download" size={14} /> Download</button><button className="fb pri" onClick={closePlay}>Close</button></>}>
        {play.it.kind === 'voice' ? <audio className="rc-audio" controls autoPlay src={play.url} ref={(a) => a && fixDuration(a)} /> : <video className="rc-video" controls autoPlay src={play.url} ref={(v) => v && fixDuration(v)} />}
      </Modal>}
      {toastNode}{askNode}
    </div>
  );
}
