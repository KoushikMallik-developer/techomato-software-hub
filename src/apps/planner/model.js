import { ymd, parseYmd, startOfWeek, addDays, diffDays } from '../../lib/cal.js';

export const id = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const PROGRESS = [[0, 'Not started'], [50, 'In progress'], [100, 'Completed']];
export const PRIORITY = [['urgent', 'Urgent', '#c50f1f'], ['important', 'Important', '#ca5010'], ['medium', 'Medium', '#0f6cbd'], ['low', 'Low', '#7a7574']];
export const LABEL_COLORS = ['#d13438', '#ca5010', '#c19c00', '#498205', '#038387', '#0f6cbd', '#8764b8', '#e3008c', '#69797e', '#986f0b'];
export const PLAN_COLORS = ['#2f7d32', '#0f6cbd', '#8764b8', '#c239b3', '#d13438', '#ca5010', '#038387', '#4f6bed', '#986f0b', '#69797e'];
export const MEMBER_COLORS = ['#0f6cbd', '#c239b3', '#498205', '#ca5010', '#8764b8', '#038387', '#d13438', '#986f0b'];
export const GROUPS = [['bucket', 'Bucket'], ['progress', 'Progress'], ['priority', 'Priority'], ['due', 'Due date'], ['assigned', 'Assigned to']];
export const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

const lbls = () => ['Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue'].map((n, i) => ({ id: 'l' + i, name: '', color: LABEL_COLORS[i], dflt: n }));
export const TEMPLATES = {
  blank: { name: 'Blank plan', buckets: ['To do', 'Doing', 'Done'] },
  project: { name: 'Project plan', buckets: ['Backlog', 'Planning', 'In progress', 'Review', 'Done'] },
  sprint: { name: 'Sprint board', buckets: ['Sprint backlog', 'In development', 'Testing', 'Released'] },
  event: { name: 'Event planning', buckets: ['Ideas', 'Venue & vendors', 'Invitations', 'Day-of', 'Wrap-up'] },
  personal: { name: 'Personal to-dos', buckets: ['This week', 'Soon', 'Someday'] },
  home: { name: 'Home projects', buckets: ['Planned', 'In progress', 'Waiting on parts', 'Finished'] },
};
export const newPlan = (tpl = 'blank', name, color) => { const t = TEMPLATES[tpl] || TEMPLATES.blank; return { id: id(), name: name || t.name, color: color || PLAN_COLORS[Math.floor(Math.random() * PLAN_COLORS.length)], star: false, archived: false, members: [{ id: 'me', name: 'Me', color: MEMBER_COLORS[0] }], buckets: t.buckets.map((n) => ({ id: id(), name: n })), labels: lbls(), tasks: [], created: ymd(new Date()) }; };
export const newTask = (bucket, title = '', o = {}) => ({ id: id(), bucket, title, notes: '', progress: 0, priority: 'medium', start: null, due: null, assignees: [], labels: [], checklist: [], links: [], comments: [], created: ymd(new Date()), completed: null, ...o });
export const blankData = () => ({ v: 1, plans: [], ui: { plan: null, view: 'board', group: 'bucket', filter: { q: '', due: '', priority: '', label: '', assignee: '', progress: '' } } });
export const migrate = (v) => { const b = blankData(); return { ...b, ...v, plans: Array.isArray(v.plans) ? v.plans : [], ui: { ...b.ui, ...(v.ui || {}), filter: { ...b.ui.filter, ...((v.ui || {}).filter || {}) } } }; };

export const labelName = (l) => l.name || l.dflt || 'Label';
export const isLate = (t, now = ymd(new Date())) => !!t.due && t.progress < 100 && t.due < now;
export const dueBucket = (t, now = new Date()) => {
  if (!t.due) return 'No date'; if (t.progress === 100) return 'Completed'; const d = diffDays(now, parseYmd(t.due)); if (d < 0) return 'Late'; if (d === 0) return 'Today';
  const ws = startOfWeek(now, 1); const we = addDays(ws, 6); const dd = parseYmd(t.due); if (dd <= we) return 'This week'; if (dd <= addDays(we, 7)) return 'Next week'; return 'Future';
};
export const DUE_ORDER = ['Late', 'Today', 'This week', 'Next week', 'Future', 'No date', 'Completed'];
export const statusOf = (t) => (t.progress === 100 ? 'Completed' : isLate(t) ? 'Late' : t.progress === 50 ? 'In progress' : 'Not started');
export const STATUS_COLORS = { 'Not started': '#8a8a8a', 'In progress': '#0f6cbd', Late: '#c50f1f', Completed: '#2f9e5a' };

export function applyFilter(tasks, f, plan) {
  const q = (f.q || '').trim().toLowerCase(); const now = new Date();
  return tasks.filter((t) => {
    if (q && !(`${t.title} ${t.notes} ${t.checklist.map((c) => c.t).join(' ')}`.toLowerCase().includes(q))) return false;
    if (f.priority && t.priority !== f.priority) return false; if (f.label && !t.labels.includes(f.label)) return false;
    if (f.assignee === '_none' ? t.assignees.length : f.assignee && !t.assignees.includes(f.assignee)) return false;
    if (f.progress === 'late' ? !isLate(t) : f.progress === 'open' ? t.progress === 100 : f.progress !== '' && f.progress != null && t.progress !== +f.progress) return false;
    if (f.due && dueBucket(t, now) !== f.due) return false;
    return true;
  });
}
export function groupTasks(plan, tasks, by) {
  const mem = new Map(plan.members.map((m) => [m.id, m]));
  switch (by) {
    case 'progress': return PROGRESS.map(([v, n]) => ({ key: String(v), name: n, tasks: tasks.filter((t) => t.progress === v), set: (t) => ({ progress: v }) }));
    case 'priority': return PRIORITY.map(([k, n, c]) => ({ key: k, name: n, color: c, tasks: tasks.filter((t) => t.priority === k), set: () => ({ priority: k }) }));
    case 'due': return DUE_ORDER.map((n) => ({ key: n, name: n, tasks: tasks.filter((t) => dueBucket(t) === n), readonly: true })).filter((g) => g.tasks.length || ['Late', 'Today', 'This week', 'Next week', 'No date'].includes(g.name));
    case 'assigned': return [...plan.members.map((m) => ({ key: m.id, name: m.name, tasks: tasks.filter((t) => t.assignees.includes(m.id)), readonly: true })), { key: '_none', name: 'Unassigned', tasks: tasks.filter((t) => !t.assignees.length), readonly: true }];
    default: return plan.buckets.map((b) => ({ key: b.id, name: b.name, bucket: true, tasks: tasks.filter((t) => t.bucket === b.id), set: () => ({ bucket: b.id }) }));
  }
}
/* move task `tid` to group-set `patch`, before task `beforeId` (or end) */
export function moveTask(plan, tid, patch, beforeId) {
  const t = plan.tasks.find((x) => x.id === tid); if (!t) return plan; let n = { ...t, ...patch };
  if (patch.progress !== undefined) n.completed = patch.progress === 100 ? t.completed || ymd(new Date()) : null;
  const rest = plan.tasks.filter((x) => x.id !== tid); let i = beforeId ? rest.findIndex((x) => x.id === beforeId) : -1;
  if (i < 0) { if (n.bucket !== undefined) { let last = -1; rest.forEach((x, j) => { if (x.bucket === n.bucket) last = j; }); i = last + 1; } else i = rest.length; }
  rest.splice(i, 0, n); return { ...plan, tasks: rest };
}
export function stats(plan) {
  const s = { total: plan.tasks.length, 'Not started': 0, 'In progress': 0, Late: 0, Completed: 0 }; const byBucket = plan.buckets.map((b) => ({ id: b.id, name: b.name, 'Not started': 0, 'In progress': 0, Late: 0, Completed: 0 })); const bm = new Map(byBucket.map((b) => [b.id, b]));
  const byPri = PRIORITY.map(([k, n, c]) => ({ k, name: n, color: c, v: 0 })); const byMem = plan.members.map((m) => ({ id: m.id, name: m.name, color: m.color, open: 0, done: 0 })); const mm = new Map(byMem.map((m) => [m.id, m]));
  for (const t of plan.tasks) { const st = statusOf(t); s[st]++; const b = bm.get(t.bucket); if (b) b[st]++; if (t.progress < 100) { const p = byPri.find((x) => x.k === t.priority); if (p) p.v++; } t.assignees.forEach((a) => { const m = mm.get(a); if (m) t.progress === 100 ? m.done++ : m.open++; }); }
  return { ...s, byBucket, byPri, byMem };
}
export const tasksToCsv = (plan) => { const q = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; const bn = new Map(plan.buckets.map((b) => [b.id, b.name])); const mn = new Map(plan.members.map((m) => [m.id, m.name])); const ln = new Map(plan.labels.map((l) => [l.id, labelName(l)]));
  return [['Task', 'Bucket', 'Progress', 'Priority', 'Start date', 'Due date', 'Completed date', 'Assigned to', 'Labels', 'Checklist done', 'Checklist total', 'Notes'], ...plan.tasks.map((t) => [t.title, bn.get(t.bucket) || '', PROGRESS.find((p) => p[0] === t.progress)[1], t.priority, t.start || '', t.due || '', t.completed || '', t.assignees.map((a) => mn.get(a)).filter(Boolean).join('; '), t.labels.map((a) => ln.get(a)).filter(Boolean).join('; '), t.checklist.filter((c) => c.done).length, t.checklist.length, t.notes])].map((r) => r.map(q).join(',')).join('\r\n'); };
export const dueLabel = (d) => { if (!d) return ''; const n = diffDays(new Date(), parseYmd(d)); if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday'; return parseYmd(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
export function sampleData() {
  const d = blankData(); const p = newPlan('project', 'Website relaunch', '#2f7d32'); p.members = [{ id: 'me', name: 'Me', color: MEMBER_COLORS[0] }, { id: 'm2', name: 'Priya Nair', color: MEMBER_COLORS[1] }, { id: 'm3', name: 'Marcus Lee', color: MEMBER_COLORS[2] }];
  p.labels[0].name = 'Blocker'; p.labels[1].name = 'Design'; p.labels[3].name = 'Content'; p.labels[5].name = 'Engineering';
  const [bk, pl, ip, rv, dn] = p.buckets.map((b) => b.id); const dd = (n) => ymd(addDays(new Date(), n)); const T = (b, t, o) => p.tasks.push(newTask(b, t, o));
  T(bk, 'Collect customer feedback themes', { priority: 'low', labels: ['l3'], notes: 'Pull from support tickets and NPS comments.' });
  T(bk, 'Evaluate headless CMS options', { priority: 'medium', labels: ['l5'], assignees: ['m3'] });
  T(pl, 'Define sitemap and navigation', { priority: 'important', due: dd(3), assignees: ['me', 'm2'], labels: ['l1'], checklist: [{ id: id(), t: 'Audit current pages', done: true }, { id: id(), t: 'Group by journey', done: true }, { id: id(), t: 'Review with stakeholders', done: false }] });
  T(pl, 'Write homepage copy', { priority: 'medium', due: dd(6), assignees: ['m2'], labels: ['l3'], progress: 50 });
  T(ip, 'Design system tokens and components', { priority: 'urgent', progress: 50, due: dd(-2), assignees: ['m2'], labels: ['l1'], start: dd(-9), checklist: [{ id: id(), t: 'Colour and type scale', done: true }, { id: id(), t: 'Buttons and forms', done: true }, { id: id(), t: 'Cards and navigation', done: false }, { id: id(), t: 'Dark mode', done: false }] });
  T(ip, 'Build responsive homepage', { priority: 'important', progress: 50, due: dd(5), assignees: ['me', 'm3'], labels: ['l5'], comments: [{ id: id(), by: 'Marcus Lee', t: 'Hero section is up on staging.', at: new Date().toISOString() }] });
  T(ip, 'Fix image CDN caching bug', { priority: 'urgent', due: dd(1), assignees: ['m3'], labels: ['l0', 'l5'] });
  T(rv, 'Accessibility audit (WCAG AA)', { priority: 'important', due: dd(9), assignees: ['me'], labels: ['l5'] });
  T(dn, 'Kick-off meeting', { progress: 100, completed: dd(-12), priority: 'medium', assignees: ['me'] });
  T(dn, 'Pick hosting provider', { progress: 100, completed: dd(-6), priority: 'low', assignees: ['m3'], labels: ['l5'] });
  const p2 = newPlan('personal', 'Personal', '#8764b8'); p2.tasks.push(newTask(p2.buckets[0].id, 'Renew passport', { priority: 'important', due: dd(2), assignees: ['me'] }), newTask(p2.buckets[0].id, 'Book dentist appointment', { due: dd(-1), assignees: ['me'] }), newTask(p2.buckets[1].id, 'Plan weekend trip', { priority: 'low' }));
  d.plans = [p, p2]; d.ui.plan = p.id; return d;
}
