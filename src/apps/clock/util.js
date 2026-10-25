/* sounds, time zones and formatting for Techomato Clock */
let ctx;
const ac = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch { return null; } };
export const SOUNDS = [['chimes', 'Chimes'], ['beep', 'Classic beep'], ['bells', 'Bells'], ['digital', 'Digital'], ['rise', 'Rise']];
const note = (c, f, t, d, type = 'sine', vol = 0.2) => { const o = c.createOscillator(); const g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.start(t); o.stop(t + d + 0.05); return o; };
export function playSound(kind = 'chimes', volume = 0.7) {
  const c = ac(); if (!c) return; const t = c.currentTime + 0.02; const v = Math.max(0.05, Math.min(1, volume)) * 0.35;
  if (kind === 'beep') [0, 0.25, 0.5].forEach((d) => note(c, 880, t + d, 0.18, 'square', v * 0.6));
  else if (kind === 'bells') [[784, 0], [988, 0.35], [1175, 0.7], [1568, 1.05]].forEach(([f, d]) => { note(c, f, t + d, 1.2, 'sine', v); note(c, f * 2.01, t + d, 0.6, 'sine', v * 0.3); });
  else if (kind === 'digital') [0, 0.12, 0.24, 0.36, 0.6, 0.72].forEach((d, i) => note(c, i % 2 ? 1400 : 1000, t + d, 0.09, 'square', v * 0.5));
  else if (kind === 'rise') { const o = note(c, 400, t, 0.9, 'triangle', v); o.frequency.exponentialRampToValueAtTime(1600, t + 0.8); }
  else [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, f, t + i * 0.18, 0.9, 'sine', v));
}
export async function askNotify() { try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* ignore */ } }
export function notify(title, body) { try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch { /* ignore */ } }

export const pad2 = (n) => String(n).padStart(2, '0');
export function hms(ms, { cs = false, forceH = false } = {}) {
  ms = Math.max(0, ms); const tot = cs ? Math.floor(ms / 10) : Math.ceil(ms / 1000 - 1e-9); const c = cs ? tot % 100 : 0; const s = (cs ? Math.floor(tot / 100) : tot) % 60; const m = Math.floor((cs ? tot / 100 : tot) / 60) % 60; const h = Math.floor((cs ? tot / 100 : tot) / 3600);
  return (h || forceH ? `${h}:${pad2(m)}` : `${m}`.padStart(2, '0')) + `:${pad2(s)}` + (cs ? `.${pad2(c)}` : '');
}
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function tzOffset(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {}; dtf.formatToParts(date).forEach((x) => { p[x.type] = +x.value; });
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second); return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}
const RENAMED = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires' };
export const LOCAL_TZ = (() => { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; return RENAMED[z] || z; } catch { return 'UTC'; } })();
export const cityOf = (tz) => { const s = tz.split('/').pop().replace(/_/g, ' '); return s; };
export const regionOf = (tz) => (tz.includes('/') ? tz.split('/')[0].replace(/_/g, ' ') : '');
export const offsetLabel = (min) => { const sgn = min < 0 ? '-' : '+'; const a = Math.abs(min); return `UTC${sgn}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`; };
export function allZones() { try { const l = Intl.supportedValuesOf('timeZone'); if (l && l.length) { const out = l.map((z) => RENAMED[z] || z); ['UTC', 'Asia/Kolkata'].forEach((z) => { if (!out.includes(z)) out.push(z); }); return [...new Set(out)].sort(); } } catch { /* ignore */ } return ['UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'America/Anchorage', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York', 'America/Sao_Paulo', 'America/Toronto', 'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/Berlin', 'Europe/London', 'Europe/Moscow', 'Europe/Paris', 'Pacific/Auckland', 'Pacific/Honolulu']; }
/* clock parts for a timezone at epoch ms */
export function partsIn(tz, ms) { const off = tzOffset(tz, new Date(ms)); const d = new Date(ms + off * 60000); return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), day: d.getUTCDate(), dow: d.getUTCDay(), y: d.getUTCFullYear(), mo: d.getUTCMonth(), off, dayNum: Math.floor((ms + off * 60000) / 86400000) }; }
export const fmtClock = (h, m, h24, secs) => (h24 ? `${pad2(h)}:${pad2(m)}${secs !== undefined ? ':' + pad2(secs) : ''}` : `${h % 12 || 12}:${pad2(m)}${secs !== undefined ? ':' + pad2(secs) : ''}`);
export const ampm = (h) => (h < 12 ? 'AM' : 'PM');
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
