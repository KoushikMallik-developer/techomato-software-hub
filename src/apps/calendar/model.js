import { addDays, addMonths, daysInMonth, parseYmd, pad, ymd, startOfDay, startOfWeek, diffDays } from '../../lib/cal.js';
import { uid } from '../../lib/useStore.js';

export const CAL_COLORS = ['#0f6cbd', '#107c10', '#8764b8', '#c239b3', '#d13438', '#ca5010', '#c19c00', '#038387', '#69797e', '#2b88d8'];
export const REMINDERS = [[null, 'None'], [0, 'At time of event'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [120, '2 hours before'], [1440, '1 day before'], [10080, '1 week before']];
export const SHOW_AS = [['busy', 'Busy'], ['free', 'Free'], ['tentative', 'Tentative'], ['oof', 'Out of office']];

export const blankData = () => ({
  v: 1,
  cals: [{ id: 'main', name: 'Calendar', color: '#0f6cbd', show: true, builtin: true }],
  events: [],
  settings: { weekStart: 0, h12: true, weekNums: false, dayStart: 9, dayEnd: 17, workDays: [1, 2, 3, 4, 5], defLen: 30, defReminder: 15, holidays: 'none', density: 48, view: 'week' },
});

/* ---------- local date-time strings ---------- */
export const toLocal = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const parseLocal = (s) => { if (!s) return new Date(NaN); if (s.length <= 10) return parseYmd(s); const [dd, tt] = s.split('T'); const [y, m, d] = dd.split('-').map(Number); const [h, mi] = tt.split(':').map(Number); return new Date(y, m - 1, d, h, mi || 0); };
export const dateOnly = (s) => (s || '').slice(0, 10);

export function newEvent(o = {}) {
  const t = new Date(); t.setMinutes(0, 0, 0); t.setHours(t.getHours() + 1);
  return { id: uid(), calId: 'main', title: '', allDay: false, start: toLocal(t), end: toLocal(new Date(t.getTime() + 3600e3)), location: '', notes: '', url: '', attendees: [], color: null, showAs: 'busy', reminder: 15, repeat: null, over: {}, created: Date.now(), ...o };
}

export function repeatSummary(r, startStr) {
  if (!r) return 'Does not repeat';
  const iv = r.interval || 1; const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let s;
  if (r.freq === 'daily') s = iv === 1 ? 'Daily' : `Every ${iv} days`;
  else if (r.freq === 'weekly') { const d = (r.byday && r.byday.length ? r.byday : [parseLocal(startStr).getDay()]).slice().sort(); s = (d.join() === '1,2,3,4,5' && iv === 1) ? 'Every weekday' : (iv === 1 ? 'Weekly' : `Every ${iv} weeks`) + ' on ' + d.map((x) => names[x]).join(', '); }
  else if (r.freq === 'monthly') { const sd = parseLocal(startStr); s = (iv === 1 ? 'Monthly' : `Every ${iv} months`) + (r.monthMode === 'nth' ? ` on the ${ordinal(Math.ceil(sd.getDate() / 7))} ${names[sd.getDay()]}` : ` on day ${sd.getDate()}`); }
  else s = iv === 1 ? 'Yearly' : `Every ${iv} years`;
  if (r.until) s += ` until ${parseYmd(r.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  else if (r.count) s += `, ${r.count} times`;
  return s;
}
const ordinal = (n) => ['', '1st', '2nd', '3rd', '4th', '5th'][n] || n + 'th';

/* ---------- recurrence ---------- */
function nthWeekdayOfMonth(y, m, dow, n) { const first = new Date(y, m, 1); let d = 1 + ((dow - first.getDay() + 7) % 7) + (n - 1) * 7; if (d > daysInMonth(y, m)) d -= 7; return new Date(y, m, d); }

function* baseDates(ev, from, to) {
  const s = startOfDay(parseLocal(ev.start)); const r = ev.repeat;
  if (!r) { yield s; return; }
  const iv = Math.max(1, r.interval || 1); const until = r.until ? parseYmd(r.until) : null; const limit = until && until < to ? until : to;
  let n = 0; const max = r.count || Infinity;
  if (r.freq === 'daily') {
    let k = 0;
    if (!r.count && from > s) k = Math.max(0, Math.floor(diffDays(s, from) / iv) - 1);
    for (let d = addDays(s, k * iv); d <= limit && n < max + k; d = addDays(d, iv)) { n++; if (r.count && n > max) return; yield d; }
    return;
  }
  if (r.freq === 'weekly') {
    const days = (r.byday && r.byday.length ? r.byday : [s.getDay()]).slice().sort((a, b) => a - b);
    const wk0 = startOfWeek(s, 0); let k = 0;
    if (!r.count && from > s) k = Math.max(0, Math.floor(diffDays(wk0, from) / (7 * iv)) - 1);
    for (let wk = addDays(wk0, k * 7 * iv); wk <= limit; wk = addDays(wk, 7 * iv)) {
      for (const dw of days) { const d = addDays(wk, dw); if (d < s) continue; if (d > limit) return; n++; if (r.count && n > max) return; yield d; }
    }
    return;
  }
  if (r.freq === 'monthly') {
    const nth = r.monthMode === 'nth'; const nIdx = Math.ceil(s.getDate() / 7);
    for (let k = 0; k < 2400; k++) {
      const base = new Date(s.getFullYear(), s.getMonth() + k * iv, 1);
      const d = nth ? nthWeekdayOfMonth(base.getFullYear(), base.getMonth(), s.getDay(), nIdx) : new Date(base.getFullYear(), base.getMonth(), Math.min(s.getDate(), daysInMonth(base.getFullYear(), base.getMonth())));
      if (d > limit) return; n++; if (r.count && n > max) return; yield d;
    }
    return;
  }
  for (let k = 0; k < 400; k++) {
    const y = s.getFullYear() + k * iv; const d = new Date(y, s.getMonth(), Math.min(s.getDate(), daysInMonth(y, s.getMonth())));
    if (d > limit) return; n++; if (r.count && n > max) return; yield d;
  }
}

/* occurrences of one event overlapping [from, to) */
export function occurrences(ev, from, to) {
  const out = [];
  const s0 = parseLocal(ev.start); const e0 = parseLocal(ev.end);
  const spanDays = ev.allDay ? diffDays(startOfDay(s0), startOfDay(e0)) : 0;
  const durMs = e0 - s0;
  const lookFrom = addDays(from, -(ev.allDay ? spanDays : Math.ceil(durMs / 86400000)) - 1);
  for (const d of baseDates(ev, lookFrom, to)) {
    const key = ymd(d);
    const ov = ev.over && ev.over[key];
    if (ov && ov.deleted) continue;
    let start; let end;
    if (ev.allDay) { start = d; end = addDays(d, spanDays); } else { start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s0.getHours(), s0.getMinutes()); end = new Date(start.getTime() + durMs); }
    let merged = ev;
    if (ov) { merged = { ...ev, ...ov }; if (ov.start) start = parseLocal(ov.start); if (ov.end) end = parseLocal(ov.end); }
    const endExcl = merged.allDay ? addDays(startOfDay(end), 1) : end;
    const zero = !merged.allDay && end.getTime() === start.getTime();
    if (start >= to) continue;
    if (zero ? start < from : endExcl <= from) continue;
    out.push({ key: ev.id + '@' + key, ev, date: key, start, end, endExcl, allDay: !!merged.allDay, title: merged.title, location: merged.location, notes: merged.notes, color: merged.color, showAs: merged.showAs, reminder: merged.reminder, calId: ev.calId, rec: !!ev.repeat, edited: !!ov, m: merged });
  }
  return out;
}

export function rangeOccurrences(data, from, to, holidayEvents = []) {
  const visible = new Set(data.cals.filter((c) => c.show).map((c) => c.id));
  const out = [];
  for (const ev of data.events) if (visible.has(ev.calId)) out.push(...occurrences(ev, from, to));
  holidayEvents.forEach((h) => { const d = parseYmd(h.date); if (d >= startOfDay(from) && d < to) out.push({ key: 'h' + h.date + h.name, ev: null, holiday: true, date: h.date, start: d, end: d, endExcl: addDays(d, 1), allDay: true, title: h.name, calId: 'holidays', color: '#8764b8', location: '', notes: '', showAs: 'free' }); });
  return out.sort((a, b) => a.start - b.start || (b.endExcl - b.start) - (a.endExcl - a.start));
}

/* overlap layout for a day column: returns [{occ, col, cols}] */
export function layoutDay(items, minGap = 0) {
  const arr = items.slice().sort((a, b) => a.s - b.s || b.e - a.e);
  const res = []; let cluster = []; let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const cols = [];
    cluster.forEach((it) => { let c = cols.findIndex((end) => end <= it.s + minGap * 0); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = it.e; it.col = c; });
    cluster.forEach((it) => { it.cols = cols.length; res.push(it); });
    cluster = [];
  };
  for (const it of arr) { if (it.s >= clusterEnd) { flush(); clusterEnd = it.e; } else clusterEnd = Math.max(clusterEnd, it.e); cluster.push(it); }
  flush();
  return res;
}

/* ---------- editing with recurrence scopes ---------- */
export function applyChange(events, ev, dateKey, scope, changes) {
  // changes: partial fields of the event; start/end are absolute strings for the occurrence being edited
  const rep = (id, f) => events.map((e) => (e.id === id ? f(e) : e));
  if (!ev.repeat || scope === 'all') {
    if (ev.repeat && (changes.start || changes.end)) {
      // shifting the whole series: keep each occurrence's relative time, move the series start by the same delta
      const occStart = parseLocal(changes.start || ev.start); const origOcc = parseYmd(dateKey);
      const baseS = parseLocal(ev.start); const baseE = parseLocal(ev.end);
      const dayDelta = diffDays(origOcc, startOfDay(occStart));
      const ns = changes.allDay || ev.allDay ? addDays(baseS, dayDelta) : new Date(addDays(baseS, dayDelta).getFullYear(), addDays(baseS, dayDelta).getMonth(), addDays(baseS, dayDelta).getDate(), occStart.getHours(), occStart.getMinutes());
      const dur = changes.end ? parseLocal(changes.end) - parseLocal(changes.start || ev.start) : baseE - baseS;
      const fmt = (d, allDay) => (allDay ? ymd(d) : toLocal(d));
      const allDay = changes.allDay !== undefined ? changes.allDay : ev.allDay;
      const ne = ev.allDay ? addDays(ns, diffDays(startOfDay(baseS), startOfDay(baseE))) : new Date(ns.getTime() + dur);
      const { start: _s, end: _e, ...rest } = changes; void _s; void _e;
      return rep(ev.id, (e) => ({ ...e, ...rest, allDay, start: fmt(ns, allDay), end: fmt(ne, allDay), over: {} }));
    }
    return rep(ev.id, (e) => ({ ...e, ...changes }));
  }
  if (scope === 'one') return rep(ev.id, (e) => ({ ...e, over: { ...e.over, [dateKey]: { ...(e.over[dateKey] || {}), ...changes } } }));
  // following: end this series the day before, start a new series at this occurrence
  const prevDay = ymd(addDays(parseYmd(dateKey), -1));
  const s0 = parseLocal(ev.start); const e0 = parseLocal(ev.end);
  const occStart = changes.start ? parseLocal(changes.start) : new Date(parseYmd(dateKey).getFullYear(), parseYmd(dateKey).getMonth(), parseYmd(dateKey).getDate(), s0.getHours(), s0.getMinutes());
  const dur = changes.end ? parseLocal(changes.end) - parseLocal(changes.start || ev.start) : e0 - s0;
  const allDay = changes.allDay !== undefined ? changes.allDay : ev.allDay;
  const fmt = (d) => (allDay ? ymd(d) : toLocal(d));
  const oldOver = {}; const newOver = {}; Object.entries(ev.over || {}).forEach(([k, v]) => { (k < dateKey ? oldOver : newOver)[k] = v; });
  const first = { ...ev, over: oldOver, repeat: { ...ev.repeat, until: prevDay, count: null } };
  const { start: _s2, end: _e2, ...rest } = changes; void _s2; void _e2;
  const second = { ...ev, ...rest, id: uid(), allDay, start: fmt(occStart), end: fmt(allDay ? addDays(occStart, diffDays(startOfDay(s0), startOfDay(e0))) : new Date(occStart.getTime() + dur)), over: newOver, repeat: ev.repeat && { ...ev.repeat, count: ev.repeat.count ? Math.max(1, ev.repeat.count) : null } };
  return events.flatMap((e) => (e.id === ev.id ? [first, second] : [e]));
}
export function applyDelete(events, ev, dateKey, scope) {
  if (!ev.repeat || scope === 'all') return events.filter((e) => e.id !== ev.id);
  if (scope === 'one') return events.map((e) => (e.id === ev.id ? { ...e, over: { ...e.over, [dateKey]: { deleted: true } } } : e));
  const prevDay = ymd(addDays(parseYmd(dateKey), -1));
  if (dateKey <= dateOnly(ev.start)) return events.filter((e) => e.id !== ev.id);
  return events.map((e) => (e.id === ev.id ? { ...e, repeat: { ...e.repeat, until: prevDay, count: null } } : e));
}

/* ---------- holidays ---------- */
function easter(y) { const a = y % 19; const b = Math.floor(y / 100); const c = y % 100; const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451); const mo = Math.floor((h + l - 7 * m + 114) / 31); const da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
const lastDow = (y, m, dow) => { const d = new Date(y, m + 1, 0); while (d.getDay() !== dow) d.setDate(d.getDate() - 1); return d; };
export function holidaysFor(region, y) {
  const H = (d, name) => ({ date: ymd(d), name }); const D = (m, d) => new Date(y, m - 1, d);
  if (region === 'IN') return [H(D(1, 1), "New Year's Day"), H(D(1, 26), 'Republic Day'), H(D(5, 1), 'Labour Day'), H(D(8, 15), 'Independence Day'), H(D(10, 2), 'Gandhi Jayanti'), H(D(12, 25), 'Christmas Day')];
  if (region === 'US') return [H(D(1, 1), "New Year's Day"), H(nthWeekdayOfMonth(y, 0, 1, 3), 'Martin Luther King Jr. Day'), H(nthWeekdayOfMonth(y, 1, 1, 3), "Presidents' Day"), H(lastDow(y, 4, 1), 'Memorial Day'), H(D(6, 19), 'Juneteenth'), H(D(7, 4), 'Independence Day'), H(nthWeekdayOfMonth(y, 8, 1, 1), 'Labor Day'), H(nthWeekdayOfMonth(y, 9, 1, 2), 'Columbus Day'), H(D(11, 11), 'Veterans Day'), H(nthWeekdayOfMonth(y, 10, 4, 4), 'Thanksgiving'), H(D(12, 25), 'Christmas Day')];
  if (region === 'UK') { const e = easter(y); return [H(D(1, 1), "New Year's Day"), H(addDays(e, -2), 'Good Friday'), H(addDays(e, 1), 'Easter Monday'), H(nthWeekdayOfMonth(y, 4, 1, 1), 'Early May bank holiday'), H(lastDow(y, 4, 1), 'Spring bank holiday'), H(lastDow(y, 7, 1), 'Summer bank holiday'), H(D(12, 25), 'Christmas Day'), H(D(12, 26), 'Boxing Day')]; }
  return [];
}
export const HOLIDAY_REGIONS = [['none', 'None'], ['IN', 'India (fixed-date holidays)'], ['US', 'United States'], ['UK', 'United Kingdom']];

/* ---------- ICS ---------- */
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsDT = (s, allDay) => (allDay ? s.replace(/-/g, '') : s.replace(/[-:]/g, '') + '00');
export function toIcs(events, calName = 'Techomato Calendar') {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Techomato Softwares//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEsc(calName)}`];
  const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  events.forEach((e) => {
    L.push('BEGIN:VEVENT', `UID:${e.id}@techomato`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
    if (e.allDay) L.push(`DTSTART;VALUE=DATE:${icsDT(e.start, true)}`, `DTEND;VALUE=DATE:${icsDT(ymd(addDays(parseYmd(e.end), 1)), true)}`);
    else L.push(`DTSTART:${icsDT(e.start)}`, `DTEND:${icsDT(e.end)}`);
    L.push(`SUMMARY:${icsEsc(e.title || '(No title)')}`);
    if (e.location) L.push(`LOCATION:${icsEsc(e.location)}`);
    if (e.notes) L.push(`DESCRIPTION:${icsEsc(e.notes)}`);
    if (e.url) L.push(`URL:${e.url}`);
    if (e.showAs === 'free') L.push('TRANSP:TRANSPARENT');
    if (e.repeat) {
      const r = e.repeat; let rr = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`;
      if (r.freq === 'weekly' && r.byday && r.byday.length) rr += ';BYDAY=' + r.byday.map((d) => DAY[d]).join(',');
      if (r.freq === 'monthly' && r.monthMode === 'nth') { const sd = parseLocal(e.start); rr += `;BYDAY=${Math.ceil(sd.getDate() / 7)}${DAY[sd.getDay()]}`; }
      if (r.until) rr += ';UNTIL=' + r.until.replace(/-/g, ''); else if (r.count) rr += ';COUNT=' + r.count;
      L.push(rr);
      Object.entries(e.over || {}).forEach(([k, v]) => { if (v.deleted) L.push(`EXDATE${e.allDay ? ';VALUE=DATE' : ''}:${e.allDay ? k.replace(/-/g, '') : k.replace(/-/g, '') + 'T' + e.start.slice(11, 13) + e.start.slice(14, 16) + '00'}`); });
    }
    if (e.reminder !== null && e.reminder !== undefined) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', `TRIGGER:-PT${e.reminder}M`, 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
export function fromIcs(text, calId) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null; let alarm = null;
  const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
  const parseDT = (val, params) => {
    const allDay = /VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(val);
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(val.trim()); if (!m) return null;
    if (allDay || !m[4]) return { s: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
    let d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if (m[7]) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return { s: toLocal(d), allDay: false };
  };
  const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  for (const raw of lines) {
    const line = raw.trim(); if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = newEvent({ calId, reminder: null, title: '', over: {} }); cur._exd = []; continue; }
    if (line === 'END:VEVENT') { if (cur && cur.start) { if (!cur.end) cur.end = cur.allDay ? cur.start : toLocal(new Date(parseLocal(cur.start).getTime() + 3600e3)); cur._exd.forEach((k) => { cur.over[k] = { deleted: true }; }); delete cur._exd; out.push(cur); } cur = null; continue; }
    if (line === 'BEGIN:VALARM') { alarm = true; continue; } if (line === 'END:VALARM') { alarm = false; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':'); if (idx < 0) continue; const head = line.slice(0, idx); const val = line.slice(idx + 1); const [name, ...pp] = head.split(';'); const params = pp.join(';');
    const N = name.toUpperCase();
    if (alarm) { if (N === 'TRIGGER') { const m = /-P(?:T?(\d+)([MHD])|(\d+)W)/.exec(val); if (m) cur.reminder = m[3] ? +m[3] * 10080 : m[2] === 'M' ? +m[1] : m[2] === 'H' ? +m[1] * 60 : +m[1] * 1440; else if (/^PT0S$/.test(val)) cur.reminder = 0; } continue; }
    if (N === 'SUMMARY') cur.title = unesc(val);
    else if (N === 'LOCATION') cur.location = unesc(val);
    else if (N === 'DESCRIPTION') cur.notes = unesc(val);
    else if (N === 'URL') cur.url = val;
    else if (N === 'TRANSP') cur.showAs = val === 'TRANSPARENT' ? 'free' : 'busy';
    else if (N === 'DTSTART') { const p = parseDT(val, params); if (p) { cur.start = p.s; cur.allDay = p.allDay; } }
    else if (N === 'DTEND') { const p = parseDT(val, params); if (p) cur.end = p.allDay ? ymd(addDays(parseYmd(p.s), -1)) : p.s; }
    else if (N === 'EXDATE') val.split(',').forEach((v) => { const p = parseDT(v, params); if (p) cur._exd.push(p.s.slice(0, 10)); });
    else if (N === 'RRULE') {
      const o = Object.fromEntries(val.split(';').map((kv) => kv.split('=')));
      const freq = (o.FREQ || '').toLowerCase(); if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) continue;
      const r = { freq, interval: +o.INTERVAL || 1 };
      if (o.BYDAY && freq === 'weekly') r.byday = o.BYDAY.split(',').map((d) => DAYS[d.slice(-2)]).filter((x) => x !== undefined);
      if (o.BYDAY && freq === 'monthly' && /^-?\d/.test(o.BYDAY)) r.monthMode = 'nth';
      if (o.COUNT) r.count = +o.COUNT; if (o.UNTIL) { const p = parseDT(o.UNTIL, ''); if (p) r.until = p.s.slice(0, 10); }
      cur.repeat = r;
    }
  }
  return out;
}
