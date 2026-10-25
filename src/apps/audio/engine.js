/* Techomato Audio Studio: audio engine (Web Audio graph building, offline rendering, DSP helpers). */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => (g > 1e-6 ? 20 * Math.log10(g) : -120);

/* ---------- effects ---------- */
export const defaultFx = () => ({
  filter: { on: false, hp: 80, lp: 12000 },
  eq: { on: false, low: 0, mid: 0, high: 0, midFreq: 1000 },
  dist: { on: false, amount: 30 },
  comp: { on: false, thresh: -24, ratio: 4, attack: 10, release: 200, makeup: 0 },
  delay: { on: false, time: 320, fb: 35, mix: 30 },
  reverb: { on: false, decay: 2.2, mix: 25 },
});
export const FX_NAMES = { filter: 'Filter (high / low cut)', eq: '3-band equaliser', dist: 'Distortion', comp: 'Compressor', delay: 'Echo / delay', reverb: 'Reverb' };
export const fxActive = (fx) => fx && Object.values(fx).some((v) => v && v.on);

const irCache = new Map();
export function impulse(ctx, decay, sr = ctx.sampleRate) {
  const key = `${sr}|${decay}`; if (irCache.has(key)) { const c = irCache.get(key); const b = ctx.createBuffer(2, c[0].length, sr); b.copyToChannel(c[0], 0); b.copyToChannel(c[1], 1); return b; }
  const n = Math.max(1, Math.floor(decay * sr)); const ch = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) { const t = i / n; ch[c][i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < sr * 0.012 ? i / (sr * 0.012) : 1); }
  if (irCache.size > 12) irCache.clear(); irCache.set(key, ch); const b = ctx.createBuffer(2, n, sr); b.copyToChannel(ch[0], 0); b.copyToChannel(ch[1], 1); return b;
}
function distCurve(amount) { const k = amount * 2.2 + 1, n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); } return c; }

/* Builds the effect chain; returns {input, output} (output === input when nothing is active). */
export function buildFx(ctx, fx) {
  if (!fxActive(fx)) { const g = ctx.createGain(); return { input: g, output: g }; }
  const input = ctx.createGain(); let tail = input; const link = (n) => { tail.connect(n); tail = n; };
  if (fx.filter.on) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = clamp(fx.filter.hp, 10, 20000); hp.Q.value = 0.7; link(hp); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(fx.filter.lp, 100, 20000); lp.Q.value = 0.7; link(lp); }
  if (fx.eq.on) { const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 200; lo.gain.value = fx.eq.low; link(lo); const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = fx.eq.midFreq || 1000; mid.Q.value = 0.9; mid.gain.value = fx.eq.mid; link(mid); const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 4500; hi.gain.value = fx.eq.high; link(hi); }
  if (fx.dist.on) { const ws = ctx.createWaveShaper(); ws.curve = distCurve(fx.dist.amount); ws.oversample = '4x'; link(ws); const tr = ctx.createGain(); tr.gain.value = 1 / (1 + fx.dist.amount / 40); link(tr); }
  if (fx.comp.on) { const c = ctx.createDynamicsCompressor(); c.threshold.value = fx.comp.thresh; c.ratio.value = fx.comp.ratio; c.attack.value = fx.comp.attack / 1000; c.release.value = fx.comp.release / 1000; c.knee.value = 6; link(c); if (fx.comp.makeup) { const m = ctx.createGain(); m.gain.value = dbToGain(fx.comp.makeup); link(m); } }
  const sendSum = (build) => { const sum = ctx.createGain(); tail.connect(sum); const wet = build(tail); wet.connect(sum); tail = sum; };
  if (fx.delay.on) sendSum((src) => { const d = ctx.createDelay(2); d.delayTime.value = clamp(fx.delay.time, 10, 1900) / 1000; const fb = ctx.createGain(); fb.gain.value = clamp(fx.delay.fb, 0, 90) / 100; const w = ctx.createGain(); w.gain.value = fx.delay.mix / 100; src.connect(d); d.connect(fb); fb.connect(d); d.connect(w); return w; });
  if (fx.reverb.on) sendSum((src) => { const cv = ctx.createConvolver(); cv.buffer = impulse(ctx, clamp(fx.reverb.decay, 0.2, 8)); const w = ctx.createGain(); w.gain.value = fx.reverb.mix / 100 * 1.4; src.connect(cv); cv.connect(w); return w; });
  return { input, output: tail };
}

/* ---------- buffers ---------- */
export function reversedBuffer(ctx, b) { const r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate); for (let c = 0; c < b.numberOfChannels; c++) { const s = b.getChannelData(c), d = r.getChannelData(c); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; } return r; }
export const mkBuffer = (ch, sr) => { const b = new AudioBuffer({ length: ch[0].length, numberOfChannels: ch.length, sampleRate: sr }); ch.forEach((d, i) => b.copyToChannel(d, i)); return b; };
export const bufferChannels = (b) => Array.from({ length: b.numberOfChannels }, (_, i) => new Float32Array(b.getChannelData(i)));
export function peakOf(b, off = 0, dur = b.duration) { let m = 0; const s = Math.floor(off * b.sampleRate), e = Math.min(b.length, Math.floor((off + dur) * b.sampleRate)); for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = s; i < e; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } } return m; }
export function rmsOf(b, off = 0, dur = b.duration) { let sum = 0, n = 0; const s = Math.floor(off * b.sampleRate), e = Math.min(b.length, Math.floor((off + dur) * b.sampleRate)); for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = s; i < e; i++) { sum += d[i] * d[i]; n++; } } return n ? Math.sqrt(sum / n) : 0; }
/* min/max columns for drawing: returns Float32Array [min0,max0,min1,max1,...] */
export function peaks(b, off, dur, cols) {
  const out = new Float32Array(cols * 2); const sr = b.sampleRate; const s0 = off * sr, per = (dur * sr) / cols; const chs = []; for (let c = 0; c < b.numberOfChannels; c++) chs.push(b.getChannelData(c));
  for (let x = 0; x < cols; x++) { const a = Math.floor(s0 + x * per), z = Math.min(b.length, Math.max(a + 1, Math.floor(s0 + (x + 1) * per))); let mn = 0, mx = 0; const step = Math.max(1, Math.floor((z - a) / 64)); for (const d of chs) for (let i = a; i < z; i += step) { const v = d[i] || 0; if (v < mn) mn = v; if (v > mx) mx = v; } out[x * 2] = mn; out[x * 2 + 1] = mx; }
  return out;
}
export function generate(kind, sr, dur, o = {}) {
  const n = Math.max(1, Math.floor(sr * dur)), d = new Float32Array(n), amp = o.amp ?? 0.5;
  if (kind === 'sine' || kind === 'square' || kind === 'saw' || kind === 'triangle') { const f = o.freq || 440; for (let i = 0; i < n; i++) { const ph = (i * f / sr) % 1; d[i] = amp * (kind === 'sine' ? Math.sin(ph * 2 * Math.PI) : kind === 'square' ? (ph < 0.5 ? 1 : -1) : kind === 'saw' ? ph * 2 - 1 : 1 - 4 * Math.abs(ph - 0.5)); } }
  else if (kind === 'white') for (let i = 0; i < n; i++) d[i] = amp * (Math.random() * 2 - 1);
  else if (kind === 'pink') { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = amp * 0.11 * (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362); b6 = w * 0.115926; } }
  else if (kind === 'sweep') { const f0 = o.freq || 100, f1 = o.freq2 || 8000; let ph = 0; for (let i = 0; i < n; i++) { const t = i / n; const f = f0 * Math.pow(f1 / f0, t); ph += (2 * Math.PI * f) / sr; d[i] = amp * Math.sin(ph); } }
  return d;
}
export const resample = (src, ratio) => { const n = Math.max(1, Math.floor(src.length / ratio)); const o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * ratio, a = Math.floor(p), f = p - a; o[i] = (src[a] || 0) * (1 - f) + (src[a + 1] || 0) * f; } return o; };

/* ---------- WAV ---------- */
export function encodeWav(b, bits = 16) {
  const nc = b.numberOfChannels, n = b.length, sr = b.sampleRate; const bps = bits / 8; const dataLen = n * nc * bps; const buf = new ArrayBuffer(44 + dataLen); const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true); v.setUint32(28, sr * nc * bps, true); v.setUint16(32, nc * bps, true); v.setUint16(34, bits, true); w(36, 'data'); v.setUint32(40, dataLen, true);
  const chs = []; for (let c = 0; c < nc; c++) chs.push(b.getChannelData(c)); let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { let s = chs[c][i]; if (bits === 32) { v.setFloat32(o, s, true); o += 4; continue; } s = clamp(s, -1, 1); if (bits === 16) { v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; } else { const q = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff); v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setUint8(o + 2, (q >> 16) & 255); o += 3; } }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ---------- scheduling ---------- */
export const projectEnd = (p) => p.tracks.reduce((m, t) => t.clips.reduce((mm, c) => Math.max(mm, c.start + c.dur), m), 0);
const anySolo = (p) => p.tracks.some((t) => t.solo);
/* Build the whole graph in `ctx`. Returns { master, tracks:{id:{gain,pan,analyser}}, stop() } */
export function schedule(ctx, project, getBuf, { from = 0, to = Infinity, when = ctx.currentTime + 0.05, dest = ctx.destination, masterVol = 1, meters = true } = {}) {
  const master = ctx.createGain(); master.gain.value = masterVol; const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08; master.connect(lim); lim.connect(dest);
  const masterAn = meters ? ctx.createAnalyser() : null; if (masterAn) { masterAn.fftSize = 2048; masterAn.smoothingTimeConstant = 0.7; lim.connect(masterAn); }
  const solo = anySolo(project); const nodes = {}; const started = []; const revCache = new Map();
  for (const t of project.tracks) {
    const gain = ctx.createGain(); gain.gain.value = t.mute || (solo && !t.solo) ? 0 : t.vol; const fx = buildFx(ctx, t.fx); const pan = ctx.createStereoPanner(); pan.pan.value = t.pan; const an = meters ? ctx.createAnalyser() : null; if (an) an.fftSize = 1024;
    gain.connect(fx.input); fx.output.connect(pan); if (an) pan.connect(an); pan.connect(master); nodes[t.id] = { gain, pan, analyser: an, track: t };
    for (const c of t.clips) {
      const end = c.start + c.dur; if (end <= from || c.start >= to) continue; let buf = getBuf(c.src); if (!buf) continue;
      if (c.rev) { if (!revCache.has(c.src)) revCache.set(c.src, reversedBuffer(ctx, buf)); buf = revCache.get(c.src); }
      const srcOff = c.rev ? buf.duration - (c.off + c.dur) : c.off; const startAt = Math.max(c.start, from); const skip = startAt - c.start; const playDur = Math.min(end, to) - startAt; if (playDur <= 0) continue;
      const s = ctx.createBufferSource(); s.buffer = buf; const cg = ctx.createGain(); s.connect(cg); cg.connect(gain);
      const t0 = when + (startAt - from); const base = c.gain; const fi = Math.min(c.fi || 0, c.dur / 2), fo = Math.min(c.fo || 0, c.dur / 2);
      const envAt = (tt) => { let g = base; if (fi > 0 && tt < fi) g *= tt / fi; if (fo > 0 && tt > c.dur - fo) g *= (c.dur - tt) / fo; return g; };
      cg.gain.setValueAtTime(Math.max(0.0001, envAt(skip)), t0); const pts = []; if (fi > 0 && skip < fi) pts.push(fi); if (fo > 0) pts.push(Math.max(skip, c.dur - fo)); pts.push(c.dur); for (const p of pts) { if (p > skip && p - skip <= playDur + 1e-6) cg.gain.linearRampToValueAtTime(Math.max(0.0001, envAt(p)), t0 + (p - skip)); }
      s.start(t0, Math.max(0, srcOff + skip), playDur); started.push(s);
    }
  }
  return { master, nodes, masterAn, stop() { for (const s of started) { try { s.stop(); } catch { /* ended */ } } try { master.disconnect(); } catch { /* ignore */ } } };
}
export async function renderMix(project, getBuf, { sr = 44100, from = 0, to, channels = 2 } = {}) {
  const end = to ?? projectEnd(project) + 0.6; const len = Math.max(1, Math.ceil((end - from) * sr)); const ctx = new OfflineAudioContext(channels, len, sr);
  schedule(ctx, project, getBuf, { from, to: end, when: 0, meters: false }); return ctx.startRendering();
}
/* Run a buffer through an effect preset / custom processor offline; returns new AudioBuffer */
export async function renderThrough(buf, fx, extraTail = 0) {
  const sr = buf.sampleRate; const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length + Math.ceil(extraTail * sr), sr); const s = ctx.createBufferSource(); s.buffer = buf; const f = buildFx(ctx, fx); s.connect(f.input); f.output.connect(ctx.destination); s.start(); return ctx.startRendering();
}

/* ---------- spectrum / spectrogram ---------- */
export function fft(re, im) {
  const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j]; const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
/* returns {w,h,data:Uint8ClampedArray RGBA} spectrogram image of mono mix */
export function spectrogram(b, off, dur, w, h, size = 1024) {
  const sr = b.sampleRate, mono = new Float32Array(Math.floor(dur * sr)); const s0 = Math.floor(off * sr); for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < mono.length; i++) mono[i] += (d[s0 + i] || 0) / b.numberOfChannels; }
  const img = new Uint8ClampedArray(w * h * 4); const re = new Float32Array(size), im = new Float32Array(size); const win = new Float32Array(size); for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)); const maxF = Math.min(sr / 2, 12000), bins = Math.floor((maxF / (sr / 2)) * (size / 2));
  for (let x = 0; x < w; x++) {
    const p = Math.floor((x / w) * Math.max(1, mono.length - size)); for (let i = 0; i < size; i++) { re[i] = (mono[p + i] || 0) * win[i]; im[i] = 0; } fft(re, im);
    for (let y = 0; y < h; y++) { const bi = Math.min(bins - 1, Math.floor(Math.pow(1 - y / h, 1.6) * bins)); const mag = Math.hypot(re[bi], im[bi]) / (size / 4); const db = 20 * Math.log10(mag + 1e-9); const t = clamp((db + 95) / 85, 0, 1); const o = (y * w + x) * 4; const [r, g, bl] = heat(t); img[o] = r; img[o + 1] = g; img[o + 2] = bl; img[o + 3] = 255; }
  }
  return { w, h, data: img, maxF };
}
function heat(t) { const s = [[0, [6, 6, 24]], [0.25, [60, 20, 120]], [0.5, [200, 40, 120]], [0.75, [255, 160, 40]], [1, [255, 250, 200]]]; for (let i = 1; i < s.length; i++) if (t <= s[i][0]) { const [a, ca] = s[i - 1], [b, cb] = s[i]; const k = (t - a) / (b - a); return ca.map((v, j) => v + (cb[j] - v) * k); } return [255, 250, 200]; }
