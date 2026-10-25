import { useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, Pop, useToast, useAsk, useContextMenu, download } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { pickFile, readAsText } from '../lib/download.js';
import { ymd } from '../lib/cal.js';
import { Board, Grid, Schedule, Charts, MyTasks, Avatar } from './planner/Views.jsx';
import { blankData, migrate, sampleData, newPlan, newTask, moveTask, applyFilter, id, TEMPLATES, PLAN_COLORS, MEMBER_COLORS, LABEL_COLORS, PRIORITY, PROGRESS, GROUPS, labelName, tasksToCsv, dueBucket, DUE_ORDER, isLate, dueLabel } from './planner/model.js';
import '../styles/money.css';
import '../styles/planner.css';

const VIEWS = [['board', 'Board', 'columns'], ['grid', 'Grid', 'rows'], ['charts', 'Charts', 'chartPie'], ['schedule', 'Schedule', 'calendarIco']];

export default function PlannerApp() {
  const [data, set, meta] = useStore('planner', blankData, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const [dlg, setDlg] = useState(null); const [task, setTask] = useState(null); const [navOpen, setNavOpen] = useState(false);
  const ui = data.ui; const plan = data.plans.find((p) => p.id === ui.plan && !p.archived) || null; const view = ui.view; const f = ui.filter;
  const setUi = (patch) => set((d) => ({ ...d, ui: { ...d.ui, ...patch } }));
  const setPlan = (pid, fn) => set((d) => ({ ...d, plans: d.plans.map((p) => (p.id === pid ? fn(p) : p)) }));
  const patchTask = (pid, tid, patch) => setPlan(pid, (p) => ({ ...p, tasks: p.tasks.map((t) => { if (t.id !== tid) return t; const n = { ...t, ...patch }; if (patch.progress !== undefined) n.completed = patch.progress === 100 ? t.completed || ymd(new Date()) : null; return n; }) }));
  const delTask = (pid, tid) => { const p = data.plans.find((x) => x.id === pid); const t = p.tasks.find((x) => x.id === tid); const idx = p.tasks.indexOf(t); setPlan(pid, (pp) => ({ ...pp, tasks: pp.tasks.filter((x) => x.id !== tid) })); setTask(null); toast(`Deleted "${t.title || 'task'}"`, { action: { label: 'Undo', onClick: () => setPlan(pid, (pp) => { const tasks = [...pp.tasks]; tasks.splice(Math.min(idx, tasks.length), 0, t); return { ...pp, tasks }; }) } }); };
  const dupTask = (pid, tid) => setPlan(pid, (p) => { const t = p.tasks.find((x) => x.id === tid); const c = { ...t, id: id(), title: t.title + ' (copy)', progress: 0, completed: null, checklist: t.checklist.map((x) => ({ ...x, id: id(), done: false })), comments: [], created: ymd(new Date()) }; const i = p.tasks.indexOf(t); const tasks = [...p.tasks]; tasks.splice(i + 1, 0, c); return { ...p, tasks }; });
  const openTask = (pid, tid) => setTask({ pid, tid });
  const quickAdd = async (pid, due) => { const title = await ask({ kind: 'prompt', title: 'New task', placeholder: 'Task name', okText: 'Add' }); if (!title || !title.trim()) return; setPlan(pid, (p) => ({ ...p, tasks: [...p.tasks, newTask(p.buckets[0].id, title.trim(), { due })] })); };
  const renameBucket = async (pid, bid) => { const b = data.plans.find((p) => p.id === pid).buckets.find((x) => x.id === bid); const n = await ask({ kind: 'prompt', title: 'Rename bucket', value: b.name, okText: 'Rename' }); if (n && n.trim()) setPlan(pid, (p) => ({ ...p, buckets: p.buckets.map((x) => (x.id === bid ? { ...x, name: n.trim() } : x)) })); };
  const addBucket = async (pid) => { const n = await ask({ kind: 'prompt', title: 'New bucket', placeholder: 'Bucket name', okText: 'Add' }); if (n && n.trim()) setPlan(pid, (p) => ({ ...p, buckets: [...p.buckets, { id: id(), name: n.trim() }] })); };
  const moveBucket = (pid, bid, dir) => setPlan(pid, (p) => { const i = p.buckets.findIndex((b) => b.id === bid); const j = i + dir; if (j < 0 || j >= p.buckets.length) return p; const b = [...p.buckets]; [b[i], b[j]] = [b[j], b[i]]; return { ...p, buckets: b }; });
  const delBucket = async (pid, bid) => { const p = data.plans.find((x) => x.id === pid); if (p.buckets.length <= 1) { toast('A plan needs at least one bucket'); return; } const n = p.tasks.filter((t) => t.bucket === bid).length; const mv = p.buckets.find((b) => b.id !== bid); if (!(await ask({ title: 'Delete bucket?', message: n ? `Its ${n} task${n === 1 ? '' : 's'} will move to "${mv.name}".` : 'The bucket is empty.', okText: 'Delete', danger: true }))) return; setPlan(pid, (pp) => ({ ...pp, buckets: pp.buckets.filter((b) => b.id !== bid), tasks: pp.tasks.map((t) => (t.bucket === bid ? { ...t, bucket: mv.id } : t)) })); };
  const X = { data, set, setPlan, patchTask, delTask, dupTask, openTask, quickAdd, renameBucket, addBucket, moveBucket, delBucket, toast, ask };

  const tasks = useMemo(() => (plan ? applyFilter(plan.tasks, f, plan) : []), [plan, f]);
  const anyF = f.q || f.due || f.priority || f.label || f.assignee || f.progress;
  const setF = (patch) => setUi({ filter: { ...f, ...patch } });
  useEffect(() => { if (!plan && view !== 'my' && data.plans.length && !data.plans.some((p) => p.id === ui.plan)) { const first = data.plans.find((p) => !p.archived); if (first) setUi({ plan: first.id }); } }, [data.plans.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const selTask = task && data.plans.find((p) => p.id === task.pid) && data.plans.find((p) => p.id === task.pid).tasks.find((t) => t.id === task.tid);

  const createPlan = (name, tpl, color) => { const p = newPlan(tpl, name, color); set((d) => ({ ...d, plans: [...d.plans, p], ui: { ...d.ui, plan: p.id, view: 'board', group: 'bucket' } })); setDlg(null); toast(`Created "${p.name}"`); };
  const dupPlan = (p) => { const np = JSON.parse(JSON.stringify(p)); np.id = id(); np.name = p.name + ' (copy)'; np.star = false; const bm = new Map(); np.buckets.forEach((b) => { const n = id(); bm.set(b.id, n); b.id = n; }); np.tasks.forEach((t) => { t.id = id(); t.bucket = bm.get(t.bucket); t.progress = 0; t.completed = null; t.comments = []; t.checklist.forEach((c) => { c.done = false; }); }); set((d) => ({ ...d, plans: [...d.plans, np], ui: { ...d.ui, plan: np.id } })); toast('Plan copied (tasks reset to not started)'); };
  const delPlan = async (p) => { if (!(await ask({ title: `Delete "${p.name}"?`, message: `This deletes the plan and its ${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'}. This cannot be undone.`, okText: 'Delete plan', danger: true }))) return; set((d) => { const plans = d.plans.filter((x) => x.id !== p.id); return { ...d, plans, ui: { ...d.ui, plan: d.ui.plan === p.id ? (plans.find((x) => !x.archived) || {}).id || null : d.ui.plan } }; }); };
  const planMenu = (e, p) => { e.preventDefault(); e.stopPropagation(); showCtx(e, [{ label: p.star ? 'Remove from favourites' : 'Add to favourites', icon: 'star', onClick: () => setPlan(p.id, (x) => ({ ...x, star: !x.star })) }, { label: 'Plan settings…', icon: 'settings', onClick: () => setDlg({ k: 'settings', pid: p.id }) }, { label: 'Make a copy', icon: 'copy', onClick: () => dupPlan(p) }, { label: 'Export tasks (CSV)', icon: 'download', onClick: () => download(`${p.name}.csv`, tasksToCsv(p), 'text/csv') }, { label: 'Export plan (JSON)', icon: 'download', onClick: () => download(`${p.name}.plan.json`, JSON.stringify(p, null, 1), 'application/json') }, { sep: true }, { label: p.archived ? 'Restore plan' : 'Archive plan', icon: 'archive', onClick: () => { setPlan(p.id, (x) => ({ ...x, archived: !x.archived })); } }, { label: 'Delete plan…', icon: 'trash', danger: true, onClick: () => delPlan(p) }]); };
  const importPlan = async () => { const fl = await pickFile('.json,application/json'); if (!fl) return; try { const p = JSON.parse(await readAsText(fl)); if (!p || !Array.isArray(p.buckets) || !Array.isArray(p.tasks)) throw new Error('bad'); const np = { ...newPlan('blank', String(p.name || 'Imported plan').slice(0, 80), p.color), ...p, id: id(), archived: false }; set((d) => ({ ...d, plans: [...d.plans, np], ui: { ...d.ui, plan: np.id } })); toast(`Imported "${np.name}"`); } catch { toast('That is not a Planner plan file'); } };
  const loadSample = async () => { if (data.plans.length && !(await ask({ title: 'Replace your plans?', message: 'Sample data replaces everything in Techomato Planner on this browser.', okText: 'Replace', danger: true }))) return; meta.replace(sampleData()); toast('Sample plans loaded'); };
  useEffect(() => { const kd = (e) => { const t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey || dlg || task) return; if (e.key === 'n' && plan) { e.preventDefault(); quickAdd(plan.id, null); } }; window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd); }); // eslint-disable-line react-hooks/exhaustive-deps

  const active = data.plans.filter((p) => !p.archived); const archived = data.plans.filter((p) => p.archived);
  const myCount = active.reduce((n, p) => n + p.tasks.filter((t) => t.assignees.includes('me') && t.progress < 100).length, 0);
  const navPlan = (p) => <button key={p.id} className={'pln-np' + (view !== 'my' && ui.plan === p.id ? ' on' : '')} onClick={() => { setUi({ plan: p.id, view: view === 'my' ? 'board' : view }); setNavOpen(false); }} onContextMenu={(e) => planMenu(e, p)}><i style={{ background: p.color }}>{p.name[0]}</i><span className="ellip grow">{p.name}</span>{p.star && <Icon name="star" size={12} />}<span className="muted">{p.tasks.filter((t) => t.progress < 100).length}</span></button>;

  return (
    <div className="fx pln mny" style={{ '--brand': '#2f7d32', '--brand-h': '#256528', '--brand-soft': 'color-mix(in srgb, #2f7d32 14%, var(--bg))' }}>
      <AppBar id="planner" name="Techomato Planner" status={meta.status === 'error' ? 'error' : undefined}
        center={plan && view !== 'my' ? <label className="fx-search"><Icon name="search" size={15} /><input aria-label="Search tasks" placeholder="Search this plan" value={f.q} onChange={(e) => setF({ q: e.target.value })} /></label> : null}
        backup={{ name: 'planner', get: () => data, set: (v) => meta.replace(migrate(v)), blank: () => blankData() }}
        extraMenu={[{ label: 'New plan…', onClick: () => setDlg({ k: 'new' }) }, { label: 'Import plan (JSON)…', onClick: importPlan }, { sep: true }, { label: 'Load sample plans', onClick: loadSample }]} />
      <div className="mny-body">
        <button className="mny-burger fb ico" aria-label="Menu" onClick={() => setNavOpen(!navOpen)}><Icon name="menu" size={18} /></button>
        <nav className={'mny-nav pln-nav' + (navOpen ? ' open' : '')} aria-label="Planner navigation">
          <button className="fb pri block" onClick={() => setDlg({ k: 'new' })}><Icon name="plus" size={16} />New plan</button>
          <button className={'mny-ni' + (view === 'my' ? ' on' : '')} onClick={() => { setUi({ view: 'my' }); setNavOpen(false); }}><Icon name="circleCheck" size={17} />My tasks{myCount > 0 && <span className="fx-badge" style={{ marginLeft: 'auto' }}>{myCount}</span>}</button>
          {active.some((p) => p.star) && <><div className="mny-navh"><span>Favourites</span></div>{active.filter((p) => p.star).map(navPlan)}</>}
          <div className="mny-navh"><span>All plans</span></div>
          <div className="mny-accs">{active.map(navPlan)}{active.length === 0 && <div className="muted" style={{ padding: '8px 10px', fontSize: 13 }}>No plans yet.</div>}
            {archived.length > 0 && <details className="pln-arch"><summary>Archived ({archived.length})</summary>{archived.map((p) => <button key={p.id} className="pln-np" onContextMenu={(e) => planMenu(e, p)} onClick={(e) => planMenu(e, p)}><i style={{ background: '#8a8a8a' }}>{p.name[0]}</i><span className="ellip grow">{p.name}</span></button>)}</details>}</div>
        </nav>
        <main className="mny-main">
          {view === 'my' ? <MyTasks X={X} data={data} /> : !plan ? (
            <div className="mny-page"><div className="fx-empty mny-hello"><Icon name="columns" size={44} /><h3>Welcome to Techomato Planner</h3><div>Organise work into plans with buckets, assign tasks, track progress and see it all on a board, grid, chart or calendar.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}><button className="fb pri lg" onClick={() => setDlg({ k: 'new' })}><Icon name="plus" size={16} />Create a plan</button><button className="fb lg" onClick={loadSample}><Icon name="sparkles" size={16} />Try sample plans</button><button className="fb lg" onClick={importPlan}>Import a plan</button></div></div></div>
          ) : (
            <div className="pln-wrap">
              <div className="pln-head"><span className="pln-logo" style={{ background: plan.color }}>{plan.name[0]}</span><div className="grow" style={{ minWidth: 0 }}><h1 className="ellip">{plan.name}</h1><div className="pln-sub"><span className="pln-avs">{plan.members.slice(0, 5).map((m) => <Avatar key={m.id} m={m} size={22} />)}</span><button className="mny-link" onClick={() => setDlg({ k: 'settings', pid: plan.id, tab: 'members' })}>{plan.members.length} member{plan.members.length === 1 ? '' : 's'}</button></div></div>
                <button className="fb sub ico" aria-label={plan.star ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={plan.star} onClick={() => setPlan(plan.id, (p) => ({ ...p, star: !p.star }))}><Icon name="star" size={17} style={plan.star ? { fill: '#f0b429', stroke: '#f0b429' } : undefined} /></button>
                <button className="fb sub ico" aria-label="Plan options" onClick={(e) => planMenu(e, plan)}><Icon name="more" size={18} /></button><button className="fb pri" onClick={() => quickAdd(plan.id, null)}><Icon name="plus" size={15} />Add task</button></div>
              <div className="fx-tabs pln-tabs" role="tablist">{VIEWS.map(([k, n, ic]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setUi({ view: k })}><Icon name={ic} size={15} />{n}</button>)}
                <span className="spacer" />
                {(view === 'board') && <Pop trigger={({ toggle }) => <button className="fb sm" onClick={toggle}><Icon name="rows" size={14} />Group by {GROUPS.find((g) => g[0] === ui.group)[1]}<Icon name="chevronDown" size={12} /></button>} width={190} align="right">{({ close }) => <div>{GROUPS.map(([k, n]) => <button key={k} className="fx-row" onClick={() => { setUi({ group: k }); close(); }}>{ui.group === k ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{n}</button>)}</div>}</Pop>}
                {view !== 'charts' && <Pop trigger={({ toggle }) => <button className={'fb sm' + (anyF && (f.due || f.priority || f.label || f.assignee || f.progress) ? ' on' : '')} onClick={toggle}><Icon name="filter" size={14} />Filter{(f.due || f.priority || f.label || f.assignee || f.progress) ? ' ·' : ''}</button>} width={260} align="right">{() => <div className="pln-filter">
                  <label>Due<select className="fi" aria-label="Filter by due" value={f.due} onChange={(e) => setF({ due: e.target.value })}><option value="">Any</option>{DUE_ORDER.map((d) => <option key={d}>{d}</option>)}</select></label>
                  <label>Priority<select className="fi" aria-label="Filter by priority" value={f.priority} onChange={(e) => setF({ priority: e.target.value })}><option value="">Any</option>{PRIORITY.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                  <label>Progress<select className="fi" aria-label="Filter by progress" value={f.progress} onChange={(e) => setF({ progress: e.target.value })}><option value="">Any</option><option value="open">Not completed</option><option value="late">Late</option>{PROGRESS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
                  <label>Label<select className="fi" aria-label="Filter by label" value={f.label} onChange={(e) => setF({ label: e.target.value })}><option value="">Any</option>{plan.labels.map((l) => <option key={l.id} value={l.id}>{labelName(l)}</option>)}</select></label>
                  <label>Assigned to<select className="fi" aria-label="Filter by assignee" value={f.assignee} onChange={(e) => setF({ assignee: e.target.value })}><option value="">Anyone</option><option value="_none">Unassigned</option>{plan.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                  <button className="fb sm" onClick={() => setUi({ filter: { q: '', due: '', priority: '', label: '', assignee: '', progress: '' } })}>Clear all</button></div>}</Pop>}
                {anyF && <button className="fb sub sm" onClick={() => setUi({ filter: { q: '', due: '', priority: '', label: '', assignee: '', progress: '' } })}><Icon name="x" size={13} />Clear filters</button>}</div>
              <div className={'pln-content ' + view}>{view === 'board' ? <Board X={X} plan={plan} tasks={tasks} group={ui.group} /> : view === 'grid' ? <Grid X={X} plan={plan} tasks={tasks} /> : view === 'charts' ? <Charts plan={plan} /> : <Schedule X={X} plan={plan} tasks={tasks} />}</div>
            </div>)}
        </main>
      </div>
      {dlg && dlg.k === 'new' && <NewPlan onClose={() => setDlg(null)} onCreate={createPlan} />}
      {dlg && dlg.k === 'settings' && <PlanSettings X={X} pid={dlg.pid} tab={dlg.tab} onClose={() => setDlg(null)} />}
      {selTask && <TaskDialog X={X} plan={data.plans.find((p) => p.id === task.pid)} t={selTask} onClose={() => setTask(null)} />}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}

function NewPlan({ onClose, onCreate }) {
  const [name, setName] = useState(''); const [tpl, setTpl] = useState('project'); const [color, setColor] = useState(PLAN_COLORS[0]);
  return (
    <Modal title="New plan" onClose={onClose} width={520} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!name.trim() && false} onClick={() => onCreate(name.trim() || TEMPLATES[tpl].name, tpl, color)}>Create plan</button></>}>
      <div className="fx-kv"><label htmlFor="np-name">Plan name</label><input id="np-name" className="fi" autoFocus placeholder={TEMPLATES[tpl].name} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onCreate(name.trim() || TEMPLATES[tpl].name, tpl, color)} /><label>Colour</label><div className="mny-colors">{PLAN_COLORS.map((c) => <button key={c} className={color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />)}</div></div>
      <div className="fx-head" style={{ marginTop: 14 }}>Start from</div>
      <div className="pln-tpls">{Object.entries(TEMPLATES).map(([k, t]) => <button key={k} className={'pln-tpl' + (tpl === k ? ' on' : '')} aria-pressed={tpl === k} onClick={() => setTpl(k)}><b>{t.name}</b><span>{t.buckets.join(' · ')}</span></button>)}</div>
    </Modal>
  );
}

function PlanSettings({ X, pid, tab: t0, onClose }) {
  const plan = X.data.plans.find((p) => p.id === pid); const [tab, setTab] = useState(t0 || 'general'); const upd = (fn) => X.setPlan(pid, fn); if (!plan) return null;
  return (
    <Modal title="Plan settings" onClose={onClose} width={540} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <div className="fx-tabs" role="tablist">{[['general', 'General'], ['members', 'Members'], ['labels', 'Labels']].map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
      <div style={{ paddingTop: 14 }}>
        {tab === 'general' && <div className="fx-kv"><label htmlFor="ps-n">Plan name</label><input id="ps-n" className="fi" value={plan.name} onChange={(e) => upd((p) => ({ ...p, name: e.target.value }))} /><label>Colour</label><div className="mny-colors">{PLAN_COLORS.map((c) => <button key={c} className={plan.color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => upd((p) => ({ ...p, color: c }))} />)}</div></div>}
        {tab === 'members' && <div className="pln-edlist">{plan.members.map((m, i) => <div className="row" key={m.id}><Avatar m={m} /><input className="fi" aria-label={`Member ${i + 1} name`} value={m.name} onChange={(e) => upd((p) => ({ ...p, members: p.members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)) }))} />{m.id === 'me' ? <span className="muted s">You</span> : <button className="fb sub ico sm" aria-label={`Remove ${m.name}`} onClick={() => upd((p) => ({ ...p, members: p.members.filter((x) => x.id !== m.id), tasks: p.tasks.map((t) => ({ ...t, assignees: t.assignees.filter((a) => a !== m.id) })) }))}><Icon name="trash" size={14} /></button>}</div>)}
          <button className="fb sm" onClick={() => upd((p) => ({ ...p, members: [...p.members, { id: id(), name: `Member ${p.members.length + 1}`, color: MEMBER_COLORS[p.members.length % MEMBER_COLORS.length] }] }))}><Icon name="plus" size={14} />Add member</button><p className="muted s">Members are names you can assign tasks to. Everything stays in this browser.</p></div>}
        {tab === 'labels' && <div className="pln-edlist">{plan.labels.map((l, i) => <div className="row" key={l.id}><input type="color" aria-label={`Label ${i + 1} colour`} value={l.color} onChange={(e) => upd((p) => ({ ...p, labels: p.labels.map((x) => (x.id === l.id ? { ...x, color: e.target.value } : x)) }))} /><input className="fi" aria-label={`Label ${i + 1} name`} placeholder={l.dflt || 'Label'} value={l.name} onChange={(e) => upd((p) => ({ ...p, labels: p.labels.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)) }))} /></div>)}</div>}
      </div>
    </Modal>
  );
}

function TaskDialog({ X, plan, t, onClose }) {
  const [cl, setCl] = useState(''); const [lk, setLk] = useState(''); const [cm, setCm] = useState(''); const up = (patch) => X.patchTask(plan.id, t.id, patch); const done = t.checklist.filter((c) => c.done).length;
  const addCheck = () => { const v = cl.trim(); if (!v) return; up({ checklist: [...t.checklist, { id: id(), t: v, done: false }] }); setCl(''); };
  const addLink = () => { let v = lk.trim(); if (!v) return; if (!/^[a-z]+:\/\//i.test(v)) v = 'https://' + v; if (!/^https?:\/\//i.test(v)) return; up({ links: [...t.links, { id: id(), url: v }] }); setLk(''); };
  const addCm = () => { const v = cm.trim(); if (!v) return; up({ comments: [...t.comments, { id: id(), by: 'Me', t: v, at: new Date().toISOString() }] }); setCm(''); };
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Modal title="Task details" onClose={onClose} width={820} footer={<><button className="fb danger" style={{ marginRight: 'auto' }} onClick={() => X.delTask(plan.id, t.id)}><Icon name="trash" size={14} />Delete task</button><button className="fb" onClick={() => { X.dupTask(plan.id, t.id); X.toast('Task duplicated'); }}><Icon name="copy" size={14} />Duplicate</button><button className="fb pri" onClick={onClose}>Close</button></>}>
      <div className="pln-td">
        <div className="main">
          <div className="pln-tt"><button className={'pln-check big' + (t.progress === 100 ? ' on' : t.progress === 50 ? ' half' : '')} aria-label={t.progress === 100 ? 'Mark not complete' : 'Mark complete'} onClick={() => up({ progress: t.progress === 100 ? 0 : 100 })}>{t.progress === 100 && <Icon name="check" size={14} />}</button><input className="pln-tin" aria-label="Task title" value={t.title} onChange={(e) => up({ title: e.target.value })} placeholder="Task name" /></div>
          <h4>Notes</h4><textarea className="fi" rows={4} aria-label="Notes" placeholder="Add notes or a description" value={t.notes} onChange={(e) => up({ notes: e.target.value })} />
          <h4>Checklist {t.checklist.length > 0 && <span className="muted">{done}/{t.checklist.length}</span>}</h4>
          {t.checklist.length > 0 && <div className="mny-bar" style={{ height: 6, marginBottom: 6 }}><i style={{ width: (done / t.checklist.length) * 100 + '%', background: 'var(--brand)' }} /></div>}
          <div className="pln-chk">{t.checklist.map((c) => <div className="row" key={c.id}><input type="checkbox" aria-label={`Done: ${c.t}`} checked={c.done} onChange={(e) => up({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)) })} /><input className={'pln-cin' + (c.done ? ' done' : '')} aria-label="Checklist item" value={c.t} onChange={(e) => up({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, t: e.target.value } : x)) })} /><button className="fb sub ico sm" aria-label={`Remove ${c.t}`} onClick={() => up({ checklist: t.checklist.filter((x) => x.id !== c.id) })}><Icon name="x" size={13} /></button></div>)}
            <div className="row"><Icon name="plus" size={15} /><input className="fi" aria-label="Add checklist item" placeholder="Add an item" value={cl} onChange={(e) => setCl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCheck()} /></div></div>
          <h4>Links</h4><div className="pln-chk">{t.links.map((l) => <div className="row" key={l.id}><Icon name="link" size={14} /><a href={l.url} target="_blank" rel="noopener noreferrer" className="ellip grow">{l.url}</a><button className="fb sub ico sm" aria-label="Remove link" onClick={() => up({ links: t.links.filter((x) => x.id !== l.id) })}><Icon name="x" size={13} /></button></div>)}
            <div className="row"><Icon name="plus" size={15} /><input className="fi" aria-label="Add link" placeholder="Paste a link" value={lk} onChange={(e) => setLk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} /></div></div>
          <h4>Comments</h4><div className="pln-cms">{t.comments.map((c) => <div key={c.id} className="cm"><Avatar m={plan.members.find((m) => m.name === c.by) || { name: c.by, color: '#69797e' }} size={26} /><div><b>{c.by}</b> <span className="muted s">{new Date(c.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><div>{c.t}</div></div></div>)}
            <div className="row"><input className="fi" aria-label="Add a comment" placeholder="Type your message here" value={cm} onChange={(e) => setCm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCm()} /><button className="fb pri sm" onClick={addCm}>Send</button></div></div>
        </div>
        <aside className="side">
          <label>Bucket<select className="fi" value={t.bucket} onChange={(e) => X.setPlan(plan.id, (p) => moveTask(p, t.id, { bucket: e.target.value }, null))}>{plan.buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label>Progress<select className="fi" value={t.progress} onChange={(e) => up({ progress: +e.target.value })}>{PROGRESS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
          <label>Priority<select className="fi" value={t.priority} onChange={(e) => up({ priority: e.target.value })}>{PRIORITY.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label>Start date<input type="date" className="fi" value={t.start || ''} onChange={(e) => up({ start: e.target.value || null })} /></label>
          <label>Due date<input type="date" className={'fi' + (isLate(t) ? ' late' : '')} value={t.due || ''} onChange={(e) => up({ due: e.target.value || null })} /></label>
          <div className="lbl">Assign to</div><div className="pln-pick">{plan.members.map((m) => <button key={m.id} className={t.assignees.includes(m.id) ? 'on' : ''} aria-pressed={t.assignees.includes(m.id)} onClick={() => up({ assignees: toggle(t.assignees, m.id) })}><Avatar m={m} size={20} />{m.name}</button>)}</div>
          <div className="lbl">Labels</div><div className="pln-pick">{plan.labels.map((l) => <button key={l.id} className={t.labels.includes(l.id) ? 'on' : ''} aria-pressed={t.labels.includes(l.id)} onClick={() => up({ labels: toggle(t.labels, l.id) })}><i style={{ background: l.color }} />{labelName(l)}</button>)}</div>
          <div className="muted s" style={{ marginTop: 10 }}>Created {t.created}{t.completed ? ` · Completed ${t.completed}` : ''}</div>
        </aside>
      </div>
    </Modal>
  );
}
