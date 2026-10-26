/* Flashcards: spaced-repetition scheduler (SM-2 style with learning steps), cloze, import/export helpers */
export const uid = () => Math.random().toString(36).slice(2, 9);
const MIN = 60000, DAY = 86400000; export const STEPS = [1, 10]; // minutes
export const endOfToday = (now = Date.now()) => { const d = new Date(now); d.setHours(23, 59, 59, 999); return d.getTime(); };
export const dayKey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const newCard = (front, back, type = 'basic') => ({ id: uid(), type, front, back, tags: [], created: Date.now(), state: 'new', step: 0, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, susp: false });
export const isDue = (c, now = Date.now()) => !c.susp && (c.state === 'new' ? false : (c.state === 'review' ? c.due <= endOfToday(now) : c.due <= now + 20 * MIN));

/* returns the card after applying rating 1=Again 2=Hard 3=Good 4=Easy */
export function schedule(c, rating, now = Date.now()) {
  const n = { ...c, reps: c.reps + 1 }; const learn = (step) => { n.state = c.state === 'review' || c.state === 'relearn' ? 'relearn' : 'learn'; n.step = step; n.due = now + STEPS[Math.min(step, STEPS.length - 1)] * MIN; };
  if (c.state === 'new' || c.state === 'learn' || c.state === 'relearn') {
    const re = c.state === 'relearn';
    if (rating === 1) { learn(0); if (re) n.state = 'relearn'; else n.state = 'learn'; }
    else if (rating === 2) { n.state = c.state === 'new' ? 'learn' : c.state; n.step = c.step; const a = STEPS[Math.min(c.step, STEPS.length - 1)], b = STEPS[Math.min(c.step + 1, STEPS.length - 1)]; n.due = now + (c.step === 0 ? Math.round((a + b) / 2) : a) * MIN; }
    else if (rating === 3) { if (c.step + 1 < STEPS.length) { n.state = re ? 'relearn' : 'learn'; n.step = c.step + 1; n.due = now + STEPS[n.step] * MIN; } else { n.state = 'review'; n.interval = re ? Math.max(1, c.interval || 1) : 1; n.due = now + n.interval * DAY; n.step = 0; } }
    else { n.state = 'review'; n.interval = re ? Math.max(2, (c.interval || 1) + 1) : 4; n.due = now + n.interval * DAY; n.step = 0; if (!re) n.ease = c.ease; }
  } else {
    if (rating === 1) { n.lapses = c.lapses + 1; n.ease = Math.max(1.3, c.ease - 0.2); n.state = 'relearn'; n.step = 0; n.interval = Math.max(1, Math.round(c.interval * 0.5)); n.due = now + STEPS[1] * MIN; }
    else if (rating === 2) { n.ease = Math.max(1.3, c.ease - 0.15); n.interval = Math.max(c.interval + 1, Math.round(c.interval * 1.2)); n.due = now + n.interval * DAY; }
    else if (rating === 3) { n.interval = Math.max(c.interval + 1, Math.round(c.interval * c.ease)); n.due = now + n.interval * DAY; }
    else { n.ease = c.ease + 0.15; n.interval = Math.max(c.interval + 2, Math.round(c.interval * c.ease * 1.3)); n.due = now + n.interval * DAY; }
  }
  return n;
}
export const fmtIv = (ms) => { const m = ms / MIN; if (m < 60) return Math.max(1, Math.round(m)) + 'm'; const h = m / 60; if (h < 24) return Math.round(h) + 'h'; const d = h / 24; if (d < 30) return Math.round(d) + 'd'; if (d < 365) return (d / 30).toFixed(1).replace(/\.0$/, '') + 'mo'; return (d / 365).toFixed(1).replace(/\.0$/, '') + 'y'; };
export const previews = (c, now = Date.now()) => [1, 2, 3, 4].map((r) => fmtIv(schedule(c, r, now).due - now));
export const level = (c) => (c.state === 'new' ? 'new' : c.state === 'review' ? (c.interval >= 21 ? 'mature' : 'young') : 'learning');

/* cloze: {{c1::answer}} or {{c1::answer::hint}} */
const CLOZE = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g;
export const hasCloze = (s) => /\{\{c\d+::/.test(s);
export const clozeFront = (s) => s.replace(CLOZE, (m, a, h) => `{{blank:${h || '…'}}}`);
export const clozeBack = (s) => s.replace(CLOZE, (m, a) => `{{ans:${a}}}`);

/* tiny safe formatter -> array of React-friendly tokens */
export function tokens(text) {
  const out = []; const re = /(\{\{blank:(.*?)\}\}|\{\{ans:(.*?)\}\}|\*\*(.+?)\*\*|`(.+?)`|!\[(.*?)\]\((https?:\/\/[^)\s]+)\)|\n)/g; let last = 0, m;
  while ((m = re.exec(text))) { if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) }); if (m[0] === '\n') out.push({ t: 'br' }); else if (m[2] !== undefined) out.push({ t: 'blank', v: m[2] }); else if (m[3] !== undefined) out.push({ t: 'ans', v: m[3] }); else if (m[4] !== undefined) out.push({ t: 'b', v: m[4] }); else if (m[5] !== undefined) out.push({ t: 'code', v: m[5] }); else out.push({ t: 'img', alt: m[6], src: m[7] }); last = m.index + m[0].length; }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) }); return out;
}
export const plain = (s) => s.replace(CLOZE, '$1').replace(/\*\*|`/g, '').replace(/!\[.*?\]\(.*?\)/g, '');
const norm = (s) => plain(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
export const sameAnswer = (a, b) => { const x = norm(a), y = norm(b); if (!x) return false; if (x === y) return true; const [lo, hi] = x.length < y.length ? [x, y] : [y, x]; if (hi.length > 5 && lo.length > 3) { const d = lev(lo, hi); return d <= Math.floor(hi.length / 8); } return false; };
function lev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }

/* import / export */
export function parseTable(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim()); if (!lines.length) return [];
  const delim = lines.some((l) => l.includes('\t')) ? '\t' : (lines.filter((l) => l.includes(';')).length > lines.length / 2 && !lines.some((l) => /,\s*"/.test(l))) ? ';' : ',';
  const split = (l) => { const out = []; let f = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"') { if (l[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"' && !f) q = true; else if (c === delim) { out.push(f); f = ''; } else f += c; } out.push(f); return out.map((x) => x.trim()); };
  let rows = lines.map(split).filter((r) => r.length >= 2 && (r[0] || r[1])); if (rows.length && /^(front|question|term)$/i.test(rows[0][0]) && /^(back|answer|definition)$/i.test(rows[0][1])) rows = rows.slice(1);
  return rows.map((r) => [r[0].replace(/\\n/g, '\n'), r[1].replace(/\\n/g, '\n')]);
}
export const csvEsc = (s) => (/[",\n\r;]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
export const SAMPLE = [
  ['France', 'Paris'], ['Japan', 'Tokyo'], ['Brazil', 'Brasília'], ['Australia', 'Canberra'], ['Canada', 'Ottawa'], ['Egypt', 'Cairo'], ['India', 'New Delhi'], ['Kenya', 'Nairobi'], ['Germany', 'Berlin'], ['Peru', 'Lima'], ['Norway', 'Oslo'], ['Thailand', 'Bangkok'],
];
