import { ymd, parseYmd, addDays, startOfWeek, diffDays, daysInMonth } from '../../lib/cal.js';

export const id = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const COLORS = ['#e0701a', '#d13438', '#e3008c', '#8764b8', '#5b5fc7', '#0f6cbd', '#038387', '#107c10', '#498205', '#c19c00', '#ca5010', '#69797e'];
export const EMOJI = ['💧', '🏃', '📚', '🧘', '🥗', '😴', '✍️', '💪', '🚶', '🎸', '🧠', '💊', '🦷', '🧹', '🌱', '🎨', '☕', '🚭', '📵', '🙏', '💻', '🌅', '🚴', '🏊', '🍎', '📞', '💰', '🛏️', '🐕', '🧴'];
export const CATEGORIES = ['Health', 'Fitness', 'Mind', 'Learning', 'Productivity', 'Home', 'Social', 'Finance', 'Other'];
export const PARTS = [['any', 'Anytime'], ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']];
export const KINDS = [['check', 'Yes / No', 'Mark it done or not'], ['count', 'Count', 'Reach a number (glasses, pages…)'], ['time', 'Duration', 'Reach a number of minutes']];
export const SCHEDULES = [['daily', 'Every day'], ['days', 'Specific days'], ['week', 'X times a week'], ['interval', 'Every N days']];

export const blankData = () => ({
  v: 1,
  habits: [],
  logs: {}, // logs[habitId][ymd] = number (>=0) ; -1 = skipped
  notes: {}, // notes[habitId][ymd] = text
  settings: { weekStart: 1, notify: false, showQuote: true, hideDoneToday: false },
  ui: { view: 'today', sel: null, day: null, cat: 'all' },
});

export const newHabit = (o = {}) => ({
  id: id(), name: '', icon: '💧', color: COLORS[0], category: 'Health', part: 'any',
  kind: 'check', goal: 1, unit: '', limit: false,
  schedule: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], times: 3, every: 2 },
  start: ymd(new Date()), end: null, remind: null, why: '', archived: false, created: Date.now(), ...o,
});

/* ---------- ideas ---------- */
const T = (name, icon, category, o = {}) => ({ name, icon, category, ...o });
export const IDEAS = [
  T('Drink water', '💧', 'Health', { kind: 'count', goal: 8, unit: 'glasses', color: '#0f6cbd' }),
  T('Read', '📚', 'Learning', { kind: 'time', goal: 20, unit: 'min', color: '#5b5fc7', part: 'evening' }),
  T('Exercise', '💪', 'Fitness', { kind: 'time', goal: 30, unit: 'min', color: '#d13438', schedule: { type: 'week', times: 4, days: [0, 1, 2, 3, 4, 5, 6], every: 2 } }),
  T('Meditate', '🧘', 'Mind', { kind: 'time', goal: 10, unit: 'min', color: '#8764b8', part: 'morning' }),
  T('Walk 10,000 steps', '🚶', 'Fitness', { kind: 'count', goal: 10000, unit: 'steps', color: '#498205' }),
  T('Take vitamins', '💊', 'Health', { color: '#c19c00', part: 'morning' }),
  T('Journal', '✍️', 'Mind', { color: '#ca5010', part: 'evening' }),
  T('Sleep before 11 pm', '😴', 'Health', { color: '#5b5fc7', part: 'evening' }),
  T('No sugary drinks', '🥗', 'Health', { color: '#107c10', kind: 'count', goal: 0, unit: 'drinks', limit: true }),
  T('Limit coffee', '☕', 'Health', { color: '#ca5010', kind: 'count', goal: 2, unit: 'cups', limit: true }),
  T('Screen-free hour', '📵', 'Mind', { color: '#69797e', part: 'evening', kind: 'time', goal: 60, unit: 'min' }),
  T('Learn a language', '🌐', 'Learning', { kind: 'time', goal: 15, unit: 'min', color: '#038387' }),
  T('Practice an instrument', '🎸', 'Learning', { kind: 'time', goal: 20, unit: 'min', color: '#e3008c', schedule: { type: 'days', days: [1, 3, 5], times: 3, every: 2 } }),
  T('Tidy up', '🧹', 'Home', { color: '#038387', part: 'evening' }),
  T('Water the plants', '🌱', 'Home', { color: '#498205', schedule: { type: 'interval', days: [], times: 3, every: 3 } }),
  T('Call family', '📞', 'Social', { color: '#e3008c', schedule: { type: 'days', days: [0], times: 1, every: 7 } }),
  T('Track expenses', '💰', 'Finance', { color: '#038387', part: 'evening' }),
  T('Stretch', '🏃', 'Fitness', { color: '#e0701a', part: 'morning', kind: 'time', goal: 10, unit: 'min' }),
  T('Floss', '🦷', 'Health', { color: '#0f6cbd', part: 'evening' }),
  T('Plan tomorrow', '💻', 'Productivity', { color: '#5b5fc7', part: 'evening' }),
];
export const ideaToHabit = (i) => newHabit({ ...i, schedule: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], times: 3, every: 2, ...(i.schedule || {}) } });

/* ---------- schedule ---------- */
export const inRange = (h, ds) => ds >= h.start && (!h.end || ds <= h.end);
export function isScheduled(h, ds) {
  if (!inRange(h, ds)) return false;
  const s = h.schedule;
  if (s.type === 'daily' || s.type === 'week') return true;
  if (s.type === 'days') return (s.days || []).includes(parseYmd(ds).getDay());
  if (s.type === 'interval') { const n = diffDays(parseYmd(h.start), parseYmd(ds)); return n >= 0 && n % Math.max(1, s.every || 1) === 0; }
  return true;
}
export function scheduleLabel(h) {
  const s = h.schedule; const nm = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (s.type === 'daily') return 'Every day';
  if (s.type === 'days') { const d = [...(s.days || [])].sort(); if (d.length === 7) return 'Every day'; if (d.join() === '1,2,3,4,5') return 'Weekdays'; if (d.join() === '0,6') return 'Weekends'; return d.map((x) => nm[x]).join(', '); }
  if (s.type === 'week') return `${s.times} times a week`;
  return s.every === 1 ? 'Every day' : `Every ${s.every} days`;
}
export const goalLabel = (h) => {
  if (h.kind === 'check') return '';
  const u = h.unit ? ' ' + h.unit : (h.kind === 'time' ? ' min' : '');
  return h.limit ? `at most ${h.goal.toLocaleString()}${u}` : `${h.goal.toLocaleString()}${u}`;
};

/* ---------- logs ---------- */
export const getLog = (data, hid, ds) => (data.logs[hid] || {})[ds];
export const isSkipped = (data, hid, ds) => getLog(data, hid, ds) === -1;
export function setLog(data, hid, ds, v) {
  const logs = { ...data.logs }; const m = { ...(logs[hid] || {}) };
  if (v === undefined || v === null) delete m[ds]; else m[ds] = v;
  logs[hid] = m; return { ...data, logs };
}
export function setNote(data, hid, ds, text) {
  const notes = { ...data.notes }; const m = { ...(notes[hid] || {}) };
  if (!text) delete m[ds]; else m[ds] = text;
  notes[hid] = m; return { ...data, notes };
}
export const valueOf = (data, hid, ds) => { const v = getLog(data, hid, ds); return v > 0 ? v : 0; };

/* completion of a single day: 'done' | 'partial' | 'skip' | 'miss' | 'pending' | 'off' */
export function dayStatus(h, data, ds, todayStr) {
  if (!isScheduled(h, ds) && h.schedule.type !== 'week') {
    // an unscheduled day can still hold a bonus completion
    const v = valueOf(data, h.id, ds);
    return v > 0 && !h.limit && inRange(h, ds) ? (v >= h.goal ? 'done' : 'partial') : 'off';
  }
  if (!inRange(h, ds)) return 'off';
  const raw = getLog(data, h.id, ds);
  if (raw === -1) return 'skip';
  const v = raw > 0 ? raw : 0;
  const past = ds < todayStr;
  if (h.limit) {
    if (v > h.goal) return 'miss';
    if (raw === undefined) return past ? 'done' : 'pending';
    return 'done';
  }
  if (v >= h.goal && v > 0) return 'done';
  if (h.kind !== 'check' && v > 0) return past ? 'partial' : 'partial';
  if (h.schedule.type === 'week' && !past) return 'pending';
  return past ? 'miss' : 'pending';
}
const okStatus = (s) => s === 'done';

/* week-based (X times a week) bookkeeping */
export function weekDone(h, data, ds, first = 1) {
  const s = startOfWeek(parseYmd(ds), first); let n = 0;
  for (let i = 0; i < 7; i++) { const d = ymd(addDays(s, i)); if (d >= h.start && (!h.end || d <= h.end) && valueOf(data, h.id, d) >= h.goal && valueOf(data, h.id, d) > 0) n++; }
  return n;
}

/* ---------- streaks ---------- */
export function streaks(h, data, todayStr, first = 1) {
  const unit = h.schedule.type === 'week' ? 'week' : 'day';
  const start = parseYmd(h.start);
  const today = parseYmd(todayStr);
  if (today < start) return { current: 0, best: 0, unit };
  if (unit === 'week') {
    const need = h.schedule.times || 1;
    let best = 0, run = 0, w = startOfWeek(start, first); const endW = startOfWeek(today, first);
    const weeks = [];
    for (let d = new Date(w); d <= endW; d = addDays(d, 7)) weeks.push(ymd(d));
    for (const ws of weeks) {
      const n = weekDone(h, data, ws, first); const isCur = ws === ymd(endW);
      if (n >= need) { run++; best = Math.max(best, run); } else if (!isCur) run = 0;
    }
    return { current: run, best, unit };
  }
  let best = 0, run = 0;
  const days = diffDays(start, today);
  for (let i = 0; i <= days; i++) {
    const ds = ymd(addDays(start, i)); const st = dayStatus(h, data, ds, todayStr);
    if (st === 'off' || st === 'skip') continue;
    if (st === 'done') { run++; best = Math.max(best, run); }
    else if (st === 'pending') { /* today not yet done: keeps the streak alive */ }
    else run = 0;
  }
  return { current: run, best, unit };
}

/* completion rate between two dates (inclusive) */
export function rate(h, data, from, to, todayStr) {
  let sched = 0, done = 0;
  const n = diffDays(parseYmd(from), parseYmd(to));
  if (h.schedule.type === 'week') {
    // weekly goals: measure completed check-ins against the target for each week touched
    let w = startOfWeek(parseYmd(from), 1); let need = 0, got = 0;
    for (; w <= parseYmd(to); w = addDays(w, 7)) { const ws = ymd(w); if (ws > todayStr) break; const c = Math.min(weekDone(h, data, ws), h.schedule.times); need += h.schedule.times; got += c; }
    return need ? got / need : null;
  }
  for (let i = 0; i <= n; i++) {
    const ds = ymd(addDays(parseYmd(from), i)); if (ds > todayStr) break;
    const st = dayStatus(h, data, ds, todayStr);
    if (st === 'off' || st === 'skip' || st === 'pending') continue;
    sched++; if (st === 'done') done++;
  }
  return sched ? done / sched : null;
}
export const pct = (x) => (x === null || x === undefined ? '—' : Math.round(x * 100) + '%');

export function totalCheckins(h, data) { return Object.values(data.logs[h.id] || {}).filter((v) => v > 0 && (h.limit ? false : v >= h.goal)).length; }

/* day summary across habits */
export function daySummary(habits, data, ds, todayStr) {
  let total = 0, done = 0, skipped = 0;
  for (const h of habits) {
    if (h.archived) continue;
    if (h.schedule.type === 'week') { if (!inRange(h, ds)) continue; const v = valueOf(data, h.id, ds); if (v > 0 || ds >= todayStr) { total++; if (v >= h.goal && v > 0) done++; } continue; }
    const st = dayStatus(h, data, ds, todayStr);
    if (st === 'off') continue;
    if (st === 'skip') { skipped++; continue; }
    total++; if (st === 'done') done++;
  }
  return { total, done, skipped, ratio: total ? done / total : 0 };
}

/* ---------- statistics ---------- */
export function overallStats(data, todayStr, first = 1) {
  const habits = data.habits.filter((h) => !h.archived);
  const all = data.habits;
  let checkins = 0, perfect = 0; const byWeekday = Array.from({ length: 7 }, () => ({ t: 0, d: 0 }));
  let best = 0, bestName = '';
  for (const h of all) { checkins += totalCheckins(h, data); const s = streaks(h, data, todayStr, first); if (s.unit === 'day' && s.best > best) { best = s.best; bestName = h.name; } }
  const firstDay = habits.length ? habits.map((h) => h.start).sort()[0] : todayStr;
  const span = Math.min(diffDays(parseYmd(firstDay), parseYmd(todayStr)), 365);
  const series = [];
  for (let i = span; i >= 0; i--) {
    const ds = ymd(addDays(parseYmd(todayStr), -i)); const s = daySummary(habits, data, ds, todayStr);
    series.push({ ds, ...s });
    if (s.total) { const wd = parseYmd(ds).getDay(); if (ds < todayStr || s.done) { byWeekday[wd].t += s.total; byWeekday[wd].d += s.done; } }
    if (s.total && s.done === s.total && ds <= todayStr) perfect++;
  }
  return { checkins, perfect, best, bestName, byWeekday, series, active: habits.length };
}
export function monthly(series) {
  const m = new Map();
  for (const s of series) { const k = s.ds.slice(0, 7); const o = m.get(k) || { t: 0, d: 0 }; o.t += s.total; o.d += s.done; m.set(k, o); }
  return [...m.entries()].map(([k, o]) => ({ k, rate: o.t ? o.d / o.t : 0, ...o }));
}
export function weekly(series, first = 1) {
  const m = new Map();
  for (const s of series) { const k = ymd(startOfWeek(parseYmd(s.ds), first)); const o = m.get(k) || { t: 0, d: 0 }; o.t += s.total; o.d += s.done; m.set(k, o); }
  return [...m.entries()].map(([k, o]) => ({ k, rate: o.t ? o.d / o.t : 0, ...o }));
}

export const BADGES = [
  ['first', 'First step', 'Complete a habit for the first time', '🌱', (s) => s.checkins >= 1],
  ['c10', 'Getting going', '10 check-ins', '🚀', (s) => s.checkins >= 10],
  ['c100', 'Centurion', '100 check-ins', '💯', (s) => s.checkins >= 100],
  ['c500', 'Unstoppable', '500 check-ins', '🏆', (s) => s.checkins >= 500],
  ['s7', 'One week strong', 'A 7-day streak', '🔥', (s) => s.best >= 7],
  ['s21', 'Habit formed', 'A 21-day streak', '🧠', (s) => s.best >= 21],
  ['s30', 'Month master', 'A 30-day streak', '📅', (s) => s.best >= 30],
  ['s100', 'Legend', 'A 100-day streak', '👑', (s) => s.best >= 100],
  ['p1', 'Perfect day', 'Finish every habit in a day', '⭐', (s) => s.perfect >= 1],
  ['p7', 'Perfect week', '7 perfect days', '🌟', (s) => s.perfect >= 7],
  ['h5', 'Collector', 'Track 5 habits at once', '🗂️', (s) => s.active >= 5],
];

/* ---------- exports ---------- */
const q = (s) => /[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
export function logsToCsv(data) {
  const rows = [['Habit', 'Category', 'Date', 'Value', 'Goal', 'Unit', 'Status', 'Note']];
  for (const h of data.habits) {
    const m = data.logs[h.id] || {};
    for (const ds of Object.keys(m).sort()) {
      const v = m[ds]; const note = (data.notes[h.id] || {})[ds] || '';
      rows.push([h.name, h.category, ds, v === -1 ? '' : v, h.kind === 'check' ? '' : h.goal, h.unit, v === -1 ? 'skipped' : (h.limit ? (v <= h.goal ? 'kept' : 'exceeded') : (v >= h.goal ? 'done' : 'partial')), note]);
    }
  }
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}
export function habitsToText(data, todayStr) {
  return data.habits.filter((h) => !h.archived).map((h) => { const s = streaks(h, data, todayStr); return `${h.icon} ${h.name} — ${scheduleLabel(h)}${h.kind !== 'check' ? ', ' + goalLabel(h) : ''} — streak ${s.current} ${s.unit}${s.current === 1 ? '' : 's'}, best ${s.best}`; }).join('\n');
}

/* ---------- reminders ---------- */
export function dueReminders(data, now, firedKey) {
  const ds = ymd(now); const nowMin = now.getHours() * 60 + now.getMinutes();
  return data.habits.filter((h) => {
    if (h.archived || !h.remind || !isScheduled(h, ds) || firedKey.has(`${h.id}|${ds}`)) return false;
    const [hh, mm] = h.remind.split(':').map(Number); const diff = nowMin - (hh * 60 + mm);
    if (diff < 0 || diff > 45) return false; // only while the reminder time is recent
    const st = dayStatus(h, data, ds, ds); return st !== 'done' && st !== 'skip';
  });
}

/* ---------- sample data ---------- */
export function sampleData(todayStr) {
  const d = blankData(); const today = parseYmd(todayStr);
  const pick = (name) => IDEAS.find((i) => i.name === name);
  const start = ymd(addDays(today, -89));
  const hs = ['Drink water', 'Read', 'Exercise', 'Meditate', 'Take vitamins', 'Journal', 'Limit coffee'].map((n) => ideaToHabit({ ...pick(n), start }));
  d.habits = hs;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const prob = [0.8, 0.65, 0.7, 0.55, 0.82, 0.5, 0.7];
  hs.forEach((h, k) => {
    const m = {};
    for (let i = 89; i >= 0; i--) {
      const ds = ymd(addDays(today, -i)); if (i === 0 && k % 2) continue;
      const ok = rnd() < prob[k] + (89 - i) / 89 * 0.08;
      if (h.schedule.type === 'week' && !ok) continue;
      if (h.limit) m[ds] = ok ? Math.floor(rnd() * (h.goal + 1)) : h.goal + 1 + Math.floor(rnd() * 2);
      else if (ok) m[ds] = h.kind === 'check' ? 1 : h.goal + (rnd() < 0.3 ? Math.round(h.goal * 0.2) : 0);
      else if (h.kind !== 'check' && rnd() < 0.4) m[ds] = Math.max(1, Math.round(h.goal * rnd() * 0.7));
    }
    d.logs[h.id] = m;
  });
  d.notes[hs[0].id] = { [todayStr]: 'Kept a bottle on my desk.' };
  return d;
}

export { daysInMonth };
