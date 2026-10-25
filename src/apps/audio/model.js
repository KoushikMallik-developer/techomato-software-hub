import { defaultFx } from './engine.js';
import { uid } from '../../components/studio.jsx';

export const TRACK_COLORS = ['#2fd1b0', '#4aa3ff', '#ff8a5c', '#c77dff', '#ffd23f', '#ff5d8f', '#7bd88f', '#5ee0e8'];
export const mkTrack = (n, color) => ({ id: uid(), name: `Track ${n}`, color: color || TRACK_COLORS[(n - 1) % TRACK_COLORS.length], vol: 1, pan: 0, mute: false, solo: false, arm: false, fx: defaultFx(), clips: [] });
export const mkClip = (src, name, start, dur, off = 0) => ({ id: uid(), src, name, start, off, dur, gain: 1, fi: 0, fo: 0, rev: false });
export const blankProject = () => ({ name: 'Untitled session', tracks: [mkTrack(1), mkTrack(2)], markers: [], loop: { on: false, a: 0, b: 8 }, snap: true });
export const findClip = (p, id) => { for (const t of p.tracks) { const c = t.clips.find((x) => x.id === id); if (c) return { t, c }; } return null; };
export const mapClips = (p, fn) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.flatMap((c) => { const r = fn(c, t); return r === undefined ? [c] : r === null ? [] : Array.isArray(r) ? r : [r]; }) })) });
export const trimL = (c, d) => ({ ...c, start: c.start + d, dur: c.dur - d, off: c.rev ? c.off : c.off + d, fi: Math.min(c.fi, c.dur - d) });
export const trimR = (c, d) => ({ ...c, dur: c.dur - d, off: c.rev ? c.off + d : c.off, fo: Math.min(c.fo, c.dur - d) });
export function splitClip(c, t) {
  const l = t - c.start, r = c.dur - l; if (l <= 0.005 || r <= 0.005) return null;
  const left = { ...c, dur: l, fo: 0, off: c.rev ? c.off + r : c.off }, right = { ...c, id: uid(), start: t, dur: r, fi: 0, off: c.rev ? c.off : c.off + l };
  return [left, right];
}
export const fmtClock = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), sec = s - m * 60; return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`; };
export const niceStep = (pps) => { const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]; return steps.find((s) => s * pps >= 80) || 600; };
