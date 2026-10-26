import { addDays, addMonths, addYears, diffDays, parseYmd, ymd, todayKey, startOfDay, weekdayNames } from '../../lib/cal.js';
import { uid } from '../../lib/useStore.js';

export const SMART = [
  { id: 'myday', name: 'My Day', icon: 'sun', color: '#C8381F' },
  { id: 'important', name: 'Important', icon: 'star', color: '#c4314b' },
  { id: 'planned', name: 'Planned', icon: 'calendarIco', color: '#107c41' },
  { id: 'all', name: 'All tasks', icon: 'inbox', color: '#5b5fc7' },
  { id: 'done', name: 'Completed', icon: 'circleCheck', color: '#69797e' },
];
export const LIST_ICONS = ['list', 'home', 'star', 'flag', 'heart', 'bookmark', 'lightbulb', 'folder', 'wallet', 'users', 'trophy', 'mapPin', 'tag', 'bell', 'image', 'note'];
export const LIST_COLORS = ['#2564cf', '#0f6cbd', '#5b5fc7', '#8764b8', '#b146c2', '#e3008c', '#c4314b', '#da3b01', '#ca5010', '#c19c00', '#498205', '#107c41', '#038387', '#00b7c3', '#69797e'];

export const blankData = () => ({
  v: 1,
  lists: [{ id: 'tasks', name: 'Tasks', icon: 'home', color: '#C8381F', builtin: true, sort: { by: 'manual', dir: 'asc' }, hideDone: false, groupId: null }],
  groups: [],
  tasks: [],
  settings: { newOnTop: true, confirmDelete: true, hidden: [], sound: true, completedOpen: false },
  ui: { sel: 'myday' },
});

export const newTask = (o = {}) => ({ id: uid(), listId: 'tasks', title: '', done: false, doneAt: null, important: false, myDay: null, due: null, remind: null, reminded: false, repeat: null, steps: [], note: '', created: Date.now(), updated: Date.now(), order: Date.now(), ...o });

export function repeatLabel(r) {
  if (!r) return '';
  const names = weekdayNames(0, 'short');
  if (r.unit === 'day') return r.every === 1 ? 'Daily' : `Every ${r.every} days`;
  if (r.unit === 'week') {
    const d = (r.days || []).slice().sort();
    if (r.every === 1 && d.join() === '1,2,3,4,5') return 'Weekdays';
    if (r.every === 1 && !d.length) return 'Weekly';
    const ds = d.length ? ' (' + d.map((x) => names[x]).join(', ') + ')' : '';
    return (r.every === 1 ? 'Weekly' : `Every ${r.every} weeks`) + ds;
  }
  if (r.unit === 'month') return r.every === 1 ? 'Monthly' : `Every ${r.every} months`;
  if (r.unit === 'year') return r.every === 1 ? 'Yearly' : `Every ${r.every} years`;
  return 'Repeats';
}

export function nextDue(due, r) {
  const t = startOfDay(new Date());
  let d = due ? parseYmd(due) : t;
  const step = (x) => {
    if (r.unit === 'day') return addDays(x, r.every || 1);
    if (r.unit === 'month') return addMonths(x, r.every || 1);
    if (r.unit === 'year') return addYears(x, r.every || 1);
    const days = (r.days || []).slice().sort();
    if (!days.length) return addDays(x, 7 * (r.every || 1));
    let y = addDays(x, 1);
    for (let i = 0; i < 7 * (r.every || 1) + 7; i++) {
      const wk = Math.floor(diffDays(startOfDay(x), y) / 7);
      const sameWeek = y.getDay() > x.getDay() || (y.getDay() === 0 && x.getDay() !== 0 ? false : false);
      void wk; void sameWeek;
      if (days.includes(y.getDay())) {
        // honour "every N weeks": only accept days that fall in a week that is a multiple of N after x's week
        const weeksApart = Math.floor((diffDays(startOfWeekMon(x), startOfWeekMon(y))) / 7);
        if (weeksApart === 0 || weeksApart % (r.every || 1) === 0) return y;
      }
      y = addDays(y, 1);
    }
    return addDays(x, 7);
  };
  d = step(d);
  let guard = 0;
  while (diffDays(t, d) < 0 && guard++ < 400) d = step(d);
  return ymd(d);
}
const startOfWeekMon = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export function dueInfo(due) {
  if (!due) return null;
  const n = diffDays(new Date(), parseYmd(due));
  const d = parseYmd(due);
  let text;
  if (n === 0) text = 'Today'; else if (n === 1) text = 'Tomorrow'; else if (n === -1) text = 'Yesterday';
  else if (n > 1 && n < 7) text = d.toLocaleDateString(undefined, { weekday: 'long' });
  else text = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  return { text, overdue: n < 0, today: n === 0, n };
}

export function viewTasks(data, view, search) {
  const t = todayKey();
  let arr = data.tasks;
  if (search) { const q = search.toLowerCase(); return arr.filter((x) => x.title.toLowerCase().includes(q) || x.note.toLowerCase().includes(q) || x.steps.some((s) => s.t.toLowerCase().includes(q))); }
  if (view === 'myday') return arr.filter((x) => x.myDay === t);
  if (view === 'important') return arr.filter((x) => x.important);
  if (view === 'planned') return arr.filter((x) => x.due);
  if (view === 'all') return arr;
  if (view === 'done') return arr.filter((x) => x.done);
  return arr.filter((x) => x.listId === view);
}

export function sortTasks(arr, sort) {
  const by = sort ? sort.by : 'manual'; const dir = sort && sort.dir === 'desc' ? -1 : 1;
  const cmp = {
    manual: (a, b) => a.order - b.order,
    importance: (a, b) => (b.important - a.important) || (a.order - b.order),
    due: (a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : a.order - b.order,
    myday: (a, b) => ((b.myDay === todayKey()) - (a.myDay === todayKey())) || (a.order - b.order),
    alpha: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    created: (a, b) => a.created - b.created,
  }[by] || ((a, b) => a.order - b.order);
  return arr.slice().sort((a, b) => cmp(a, b) * dir);
}

export function plannedGroups(tasks) {
  const buckets = [['Earlier', []], ['Today', []], ['Tomorrow', []], ['This week', []], ['Next week', []], ['Later', []]];
  tasks.forEach((t) => {
    const n = diffDays(new Date(), parseYmd(t.due));
    const i = n < 0 ? 0 : n === 0 ? 1 : n === 1 ? 2 : n < 7 ? 3 : n < 14 ? 4 : 5;
    buckets[i][1].push(t);
  });
  return buckets.filter(([, a]) => a.length).map(([name, items]) => ({ name, items: items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.order - b.order)) }));
}

export const quickDates = () => {
  const t = startOfDay(new Date()); const nextMon = addDays(t, ((8 - t.getDay()) % 7) || 7);
  return [['Today', ymd(t)], ['Tomorrow', ymd(addDays(t, 1))], ['Next week', ymd(nextMon)]];
};

export function tasksToCsv(tasks, lists) {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const ln = Object.fromEntries(lists.map((l) => [l.id, l.name]));
  return ['List,Title,Completed,Important,Due,Repeat,Steps,Note', ...tasks.map((t) => [q(ln[t.listId] || ''), q(t.title), t.done ? 'yes' : 'no', t.important ? 'yes' : 'no', t.due || '', q(repeatLabel(t.repeat)), q(t.steps.map((s) => (s.done ? '[x] ' : '[ ] ') + s.t).join('; ')), q(t.note)].join(','))].join('\n');
}
export function tasksToText(tasks) {
  return tasks.map((t) => `${t.done ? '[x]' : '[ ]'} ${t.title}${t.due ? ' (due ' + t.due + ')' : ''}${t.steps.map((s) => `\n    ${s.done ? '[x]' : '[ ]'} ${s.t}`).join('')}${t.note ? '\n    ' + t.note.replace(/\n/g, '\n    ') : ''}`).join('\n');
}
export function parseImport(text) {
  return text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim()).filter(Boolean);
}
