import { useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useContextMenu, Pop } from '../../components/fxui.jsx';
import { Donut, Bar } from '../money/Charts.jsx';
import { PRIORITY, PROGRESS, GROUPS, groupTasks, moveTask, stats, dueLabel, isLate, labelName, initials, statusOf, STATUS_COLORS, newTask, DUE_ORDER, dueBucket } from './model.js';
import { ymd, parseYmd, startOfMonth, startOfWeek, addDays, addMonths, sameDay, MONTHS, weekdayNames } from '../../lib/cal.js';

export const Avatar = ({ m, size = 24 }) => <span className="pln-av" title={m.name} style={{ background: m.color, width: size, height: size, fontSize: size * 0.42 }}>{initials(m.name)}</span>;
const priColor = (k) => (PRIORITY.find((p) => p[0] === k) || [0, 0, '#888'])[2];

/* ---------- task card ---------- */
export function Card({ X, plan, t, drag, onDragStart, onDragOver, dropMark, showPlan }) {
  const mem = new Map(plan.members.map((m) => [m.id, m])); const lab = plan.labels.filter((l) => t.labels.includes(l.id)); const late = isLate(t); const done = t.checklist.filter((c) => c.done).length;
  const [menu, show] = useContextMenu();
  const items = () => [{ label: 'Open', icon: 'edit', onClick: () => X.openTask(plan.id, t.id) }, { label: t.progress === 100 ? 'Mark not started' : 'Mark complete', icon: 'circleCheck', onClick: () => X.patchTask(plan.id, t.id, { progress: t.progress === 100 ? 0 : 100 }) }, { head: 'Move to' }, ...plan.buckets.filter((b) => b.id !== t.bucket).map((b) => ({ label: b.name, icon: 'moveTo', onClick: () => X.setPlan(plan.id, (p) => moveTask(p, t.id, { bucket: b.id }, null)) })), { sep: true }, { label: 'Duplicate', icon: 'copy', onClick: () => X.dupTask(plan.id, t.id) }, { label: 'Delete', icon: 'trash', danger: true, onClick: () => X.delTask(plan.id, t.id) }];
  return (
    <div className={'pln-card' + (t.progress === 100 ? ' done' : '') + (dropMark ? ' mark-' + dropMark : '')} draggable={!!drag} onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; onDragStart && onDragStart(t); }} onDragOver={onDragOver} onContextMenu={(e) => { e.preventDefault(); show(e, items()); }}
      role="button" tabIndex={0} aria-label={`Task ${t.title}`} onClick={() => X.openTask(plan.id, t.id)} onKeyDown={(e) => { if (e.key === 'Enter') X.openTask(plan.id, t.id); }}>
      {lab.length > 0 && <div className="pln-labs">{lab.map((l) => <span key={l.id} style={{ background: l.color }} title={labelName(l)} />)}</div>}
      <div className="pln-ct"><button className={'pln-check' + (t.progress === 100 ? ' on' : t.progress === 50 ? ' half' : '')} aria-label={t.progress === 100 ? `Mark ${t.title} not complete` : `Mark ${t.title} complete`} onClick={(e) => { e.stopPropagation(); X.patchTask(plan.id, t.id, { progress: t.progress === 100 ? 0 : 100 }); }}>{t.progress === 100 && <Icon name="check" size={12} />}</button><span className="pln-title">{t.title || '(untitled)'}</span></div>
      {showPlan && <div className="pln-pl"><i style={{ background: plan.color }} />{plan.name}</div>}
      <div className="pln-meta">
        {t.due && <span className={'pln-due' + (late ? ' late' : '')}><Icon name="calendarIco" size={12} />{dueLabel(t.due)}</span>}
        {(t.priority === 'urgent' || t.priority === 'important') && <span className="pln-pri" style={{ color: priColor(t.priority) }} title={t.priority}><Icon name="flag" size={12} /></span>}
        {t.checklist.length > 0 && <span title="Checklist"><Icon name="checkbox" size={12} />{done}/{t.checklist.length}</span>}
        {t.notes && <span title="Has notes"><Icon name="note" size={12} /></span>}
        {t.comments.length > 0 && <span title="Comments"><Icon name="comment" size={12} />{t.comments.length}</span>}
        <span className="spacer" />
        {t.assignees.length > 0 && <span className="pln-avs">{t.assignees.slice(0, 3).map((a) => mem.get(a) && <Avatar key={a} m={mem.get(a)} size={22} />)}{t.assignees.length > 3 && <span className="pln-av more">+{t.assignees.length - 3}</span>}</span>}
      </div>
      <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{menu}</span>
    </div>
  );
}

/* ---------- board ---------- */
export function Board({ X, plan, tasks, group }) {
  const groups = groupTasks(plan, tasks, group); const [dnd, setDnd] = useState(null); const dragId = useRef(null); const [adding, setAdding] = useState(null); const [text, setText] = useState(''); const [menu, show] = useContextMenu();
  const canDrop = ['bucket', 'progress', 'priority'].includes(group);
  const drop = (g, before) => { const id = dragId.current; dragId.current = null; setDnd(null); if (!id || !g.set) return; X.setPlan(plan.id, (p) => moveTask(p, id, g.set(), before)); };
  const add = (g) => { const title = text.trim(); if (!title) { setAdding(null); return; } const patch = g.set ? g.set() : {}; const first = plan.buckets[0].id; X.setPlan(plan.id, (p) => ({ ...p, tasks: [...p.tasks, newTask(patch.bucket || first, title, { ...patch, completed: patch.progress === 100 ? ymd(new Date()) : null })] })); setText(''); };
  const bucketMenu = (e, g, i) => { show(e, [{ label: 'Rename…', icon: 'edit', onClick: () => X.renameBucket(plan.id, g.key) }, { label: 'Move left', icon: 'arrowLeft', disabled: i === 0, onClick: () => X.moveBucket(plan.id, g.key, -1) }, { label: 'Move right', icon: 'arrowRight', disabled: i === groups.length - 1, onClick: () => X.moveBucket(plan.id, g.key, 1) }, { sep: true }, { label: 'Delete bucket…', icon: 'trash', danger: true, onClick: () => X.delBucket(plan.id, g.key) }]); };
  return (
    <div className="pln-board" role="list" aria-label="Board">
      {groups.map((g, gi) => (
        <section key={g.key} className={'pln-col' + (dnd && dnd.col === g.key && dnd.before === null ? ' over' : '')} role="listitem" aria-label={g.name}
          onDragOver={(e) => { if (!canDrop || !g.set) return; e.preventDefault(); setDnd((d) => (d && d.col === g.key ? d : { col: g.key, before: null })); }} onDrop={(e) => { e.preventDefault(); drop(g, dnd && dnd.col === g.key ? dnd.before : null); }}>
          <header className="pln-colh">{g.color && <i className="pln-dot" style={{ background: g.color }} />}<h3 className="ellip">{g.name}</h3><span className="fx-badge">{g.tasks.length}</span><span className="spacer" />{g.bucket && <button className="fb sub ico sm" aria-label={`${g.name} options`} onClick={(e) => bucketMenu(e, g, gi)}><Icon name="more" size={15} /></button>}</header>
          {!g.readonly && (adding === g.key ? <div className="pln-addbox"><input className="fi" autoFocus aria-label="Task title" placeholder="Enter a task name" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(g); if (e.key === 'Escape') { setAdding(null); setText(''); } }} onBlur={() => { if (!text.trim()) setAdding(null); }} /><div><button className="fb pri sm" onMouseDown={(e) => e.preventDefault()} onClick={() => add(g)}>Add task</button><button className="fb sub sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { setAdding(null); setText(''); }}>Cancel</button></div></div>
            : <button className="pln-addtask" onClick={() => { setAdding(g.key); setText(''); }}><Icon name="plus" size={15} />Add task</button>)}
          <div className="pln-cards">{g.tasks.map((t) => <Card key={t.id} X={X} plan={plan} t={t} drag={canDrop} onDragStart={() => { dragId.current = t.id; }} dropMark={dnd && dnd.col === g.key && dnd.before === t.id ? 'top' : null}
            onDragOver={(e) => { if (!canDrop || !g.set) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const idx = g.tasks.indexOf(t); const before = e.clientY < r.top + r.height / 2 ? t.id : (g.tasks[idx + 1] || { id: null }).id; setDnd((d) => (d && d.col === g.key && d.before === before ? d : { col: g.key, before })); }} />)}</div>
          {g.tasks.length === 0 && <div className="pln-colempty">{canDrop && g.set ? 'Drop tasks here' : 'Nothing here'}</div>}
        </section>))}
      {group === 'bucket' && <section className="pln-col newcol"><button className="pln-addbucket" onClick={() => X.addBucket(plan.id)}><Icon name="plus" size={16} />Add new bucket</button></section>}
      {menu}
    </div>
  );
}

/* ---------- grid ---------- */
export function Grid({ X, plan, tasks }) {
  const [sort, setSort] = useState({ k: 'order', dir: 1 }); const mem = new Map(plan.members.map((m) => [m.id, m])); const bn = new Map(plan.buckets.map((b) => [b.id, b.name]));
  const key = { title: (t) => t.title.toLowerCase(), bucket: (t) => plan.buckets.findIndex((b) => b.id === t.bucket), progress: (t) => t.progress, priority: (t) => PRIORITY.findIndex((p) => p[0] === t.priority), start: (t) => t.start || '9999', due: (t) => t.due || '9999', assigned: (t) => (mem.get(t.assignees[0]) || { name: '~' }).name.toLowerCase(), order: () => 0 }[sort.k];
  const rows = [...tasks].map((t, i) => [t, i]).sort((a, b) => { const x = key(a[0]); const y = key(b[0]); return (x < y ? -1 : x > y ? 1 : a[1] - b[1]) * (x === y ? 1 : sort.dir); }).map((r) => r[0]);
  const th = (k, label) => <th aria-sort={sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}><button className="mny-th" onClick={() => setSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: 1 }))}>{label}{sort.k === k && <Icon name={sort.dir > 0 ? 'arrowUp' : 'arrowDown'} size={12} />}</button></th>;
  return (
    <div className="pln-gridwrap"><table className="pln-grid"><thead><tr><th style={{ width: 36 }} />{th('title', 'Task')}{th('bucket', 'Bucket')}{th('assigned', 'Assigned to')}{th('progress', 'Progress')}{th('priority', 'Priority')}{th('start', 'Start')}{th('due', 'Due')}<th>Labels</th><th>Checklist</th></tr></thead>
      <tbody>{rows.map((t) => <tr key={t.id} className={t.progress === 100 ? 'done' : ''}>
        <td><button className={'pln-check' + (t.progress === 100 ? ' on' : t.progress === 50 ? ' half' : '')} aria-label={`Complete ${t.title}`} onClick={() => X.patchTask(plan.id, t.id, { progress: t.progress === 100 ? 0 : 100 })}>{t.progress === 100 && <Icon name="check" size={12} />}</button></td>
        <td><button className="mny-link pln-gt" onClick={() => X.openTask(plan.id, t.id)}>{t.title || '(untitled)'}</button></td>
        <td><select className="fi pln-sel" aria-label={`Bucket for ${t.title}`} value={t.bucket} onChange={(e) => X.setPlan(plan.id, (p) => moveTask(p, t.id, { bucket: e.target.value }, null))}>{plan.buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
        <td><span className="pln-avs">{t.assignees.map((a) => mem.get(a) && <Avatar key={a} m={mem.get(a)} size={22} />)}</span></td>
        <td><select className="fi pln-sel" aria-label={`Progress for ${t.title}`} value={t.progress} onChange={(e) => X.patchTask(plan.id, t.id, { progress: +e.target.value })}>{PROGRESS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></td>
        <td><select className="fi pln-sel" aria-label={`Priority for ${t.title}`} style={{ color: priColor(t.priority) }} value={t.priority} onChange={(e) => X.patchTask(plan.id, t.id, { priority: e.target.value })}>{PRIORITY.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></td>
        <td><input type="date" className="fi pln-sel" aria-label={`Start for ${t.title}`} value={t.start || ''} onChange={(e) => X.patchTask(plan.id, t.id, { start: e.target.value || null })} /></td>
        <td><input type="date" className={'fi pln-sel' + (isLate(t) ? ' late' : '')} aria-label={`Due for ${t.title}`} value={t.due || ''} onChange={(e) => X.patchTask(plan.id, t.id, { due: e.target.value || null })} /></td>
        <td><span className="pln-labs inline">{plan.labels.filter((l) => t.labels.includes(l.id)).map((l) => <span key={l.id} className="fx-chip" style={{ background: l.color, color: '#fff' }}>{labelName(l)}</span>)}</span></td>
        <td className="muted nw">{t.checklist.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : ''}</td></tr>)}</tbody></table>
      {rows.length === 0 && <div className="fx-empty">No tasks match.</div>}</div>
  );
}

/* ---------- schedule ---------- */
export function Schedule({ X, plan, tasks }) {
  const [month, setMonth] = useState(startOfMonth(new Date())); const [over, setOver] = useState(null); const dragId = useRef(null); const today = new Date();
  const first = startOfWeek(month, 1); const days = Array.from({ length: 42 }, (_, i) => addDays(first, i)); const byDay = new Map(); tasks.forEach((t) => { if (t.due) (byDay.get(t.due) || byDay.set(t.due, []).get(t.due)).push(t); });
  const unsched = tasks.filter((t) => !t.due && t.progress < 100); const mem = new Map(plan.members.map((m) => [m.id, m]));
  const chip = (t) => <button key={t.id} className={'pln-chip' + (t.progress === 100 ? ' done' : isLate(t) ? ' late' : '')} style={{ '--pc': plan.color }} draggable onDragStart={(e) => { dragId.current = t.id; e.dataTransfer.setData('text/plain', t.id); }} onClick={() => X.openTask(plan.id, t.id)} title={t.title}>{t.title}</button>;
  const wd = weekdayNames(1, 'short');
  return (
    <div className="pln-sched">
      <div className="pln-sh"><button className="fb ico" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" size={16} /></button><b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b><button className="fb ico" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" size={16} /></button><button className="fb sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</button></div>
      <div className="pln-sbody"><div className="pln-cal"><div className="pln-wd">{wd.map((d) => <span key={d}>{d}</span>)}</div>
        <div className="pln-days">{days.map((d) => { const k = ymd(d); const list = byDay.get(k) || []; return (
          <div key={k} className={'pln-day' + (d.getMonth() !== month.getMonth() ? ' out' : '') + (sameDay(d, today) ? ' today' : '') + (over === k ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(k); }} onDragLeave={() => setOver((o) => (o === k ? null : o))} onDrop={(e) => { e.preventDefault(); setOver(null); const id = dragId.current || e.dataTransfer.getData('text/plain'); dragId.current = null; if (id) X.patchTask(plan.id, id, { due: k }); }}>
            <div className="dn"><span>{d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d.getDate()}</span><button className="pln-dadd" aria-label={`Add task on ${k}`} onClick={() => X.quickAdd(plan.id, k)}><Icon name="plus" size={12} /></button></div>
            {list.slice(0, 3).map(chip)}{list.length > 3 && <span className="pln-more">+{list.length - 3} more</span>}</div>); })}</div></div>
        <aside className="pln-unsched"><h3>Unscheduled</h3><div className="muted s">Drag onto a day to schedule</div>{unsched.map(chip)}{unsched.length === 0 && <div className="muted s" style={{ padding: 8 }}>Everything has a date.</div>}</aside></div>
    </div>
  );
}

/* ---------- charts ---------- */
export function Charts({ plan }) {
  const s = stats(plan); const slices = ['Not started', 'In progress', 'Late', 'Completed'].map((k) => ({ label: k, value: s[k], color: STATUS_COLORS[k], fmt: String(s[k]) })).filter((x) => x.value > 0);
  const pct = s.total ? Math.round((s.Completed / s.total) * 100) : 0; const maxB = Math.max(1, ...s.byBucket.map((b) => b['Not started'] + b['In progress'] + b.Late + b.Completed)); const maxP = Math.max(1, ...s.byPri.map((p) => p.v)); const maxM = Math.max(1, ...s.byMem.map((m) => m.open + m.done));
  return (
    <div className="pln-charts">
      <div className="mny-kpis"><div className="mny-kpi"><div className="l">Tasks</div><div className="v">{s.total}</div><div className="s">in {plan.buckets.length} buckets</div></div><div className="mny-kpi"><div className="l">Completed</div><div className="v pos">{pct}%</div><div className="s">{s.Completed} of {s.total}</div></div><div className="mny-kpi"><div className="l">In progress</div><div className="v">{s['In progress']}</div><div className="s">being worked on</div></div><div className="mny-kpi"><div className="l">Late</div><div className={'v ' + (s.Late ? 'neg' : '')}>{s.Late}</div><div className="s">past their due date</div></div></div>
      <div className="pln-chgrid">
        <section className="mny-card"><header><h2>Status</h2></header>{s.total ? <div className="mny-donutrow"><Donut slices={slices} total={String(s.total)} center="Tasks" size={180} /><ul className="mny-leg">{slices.map((x) => <li key={x.label}><i style={{ background: x.color }} /><span>{x.label}</span><b>{x.value}</b></li>)}</ul></div> : <div className="fx-empty">No tasks yet.</div>}</section>
        <section className="mny-card"><header><h2>Bucket</h2></header><div className="pln-hb">{s.byBucket.map((b) => { const tot = b['Not started'] + b['In progress'] + b.Late + b.Completed; return <div key={b.id} className="row"><span className="ellip n">{b.name}</span><div className="bar" style={{ width: (tot / maxB) * 100 + '%' }} title={`${tot} tasks`}>{['Completed', 'In progress', 'Late', 'Not started'].map((k) => b[k] > 0 && <i key={k} style={{ flex: b[k], background: STATUS_COLORS[k] }} title={`${k}: ${b[k]}`} />)}</div><b>{tot}</b></div>; })}</div></section>
        <section className="mny-card"><header><h2>Priority (open tasks)</h2></header><div className="pln-hb">{s.byPri.map((p) => <div key={p.k} className="row"><span className="n">{p.name}</span><div className="bar" style={{ width: (p.v / maxP) * 100 + '%' }}><i style={{ flex: 1, background: p.color }} /></div><b>{p.v}</b></div>)}</div></section>
        <section className="mny-card"><header><h2>Members</h2></header><div className="pln-hb">{s.byMem.map((m) => <div key={m.id} className="row"><span className="ellip n">{m.name}</span><div className="bar" style={{ width: ((m.open + m.done) / maxM) * 100 + '%' }}><i style={{ flex: m.done, background: STATUS_COLORS.Completed }} title={`Done ${m.done}`} /><i style={{ flex: m.open, background: m.color }} title={`Open ${m.open}`} /></div><b>{m.open + m.done}</b></div>)}</div><div className="mny-legend"><span><i style={{ background: STATUS_COLORS.Completed }} />Done</span><span><i style={{ background: '#0f6cbd' }} />Open</span></div></section>
      </div>
    </div>
  );
}

/* ---------- my tasks ---------- */
export function MyTasks({ X, data }) {
  const [showDone, setShowDone] = useState(false); const [q, setQ] = useState('');
  const all = []; data.plans.filter((p) => !p.archived).forEach((p) => p.tasks.forEach((t) => { if (t.assignees.includes('me') && (showDone || t.progress < 100) && (!q || t.title.toLowerCase().includes(q.toLowerCase()))) all.push({ p, t }); }));
  const groups = DUE_ORDER.map((n) => ({ n, list: all.filter(({ t }) => dueBucket(t) === n || (n === 'Completed' && t.progress === 100)).filter(({ t }) => (n === 'Completed') === (t.progress === 100)) })).filter((g) => g.list.length);
  return (
    <div className="pln-page"><div className="mny-ph"><div><h1>My tasks</h1><div className="muted">Everything assigned to you across your plans</div></div><span className="spacer" /><label className="fx-search light" style={{ width: 220 }}><Icon name="search" size={15} /><input aria-label="Search my tasks" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></label><label className="chk"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show completed</label></div>
      {groups.length ? groups.map((g) => <section key={g.n} className="mny-card"><header><h2 className={g.n === 'Late' ? 'neg' : ''}>{g.n}</h2><span className="fx-badge">{g.list.length}</span></header><div className="pln-mylist">{g.list.map(({ p, t }) => <div key={t.id} className="row"><button className={'pln-check' + (t.progress === 100 ? ' on' : t.progress === 50 ? ' half' : '')} aria-label={`Complete ${t.title}`} onClick={() => X.patchTask(p.id, t.id, { progress: t.progress === 100 ? 0 : 100 })}>{t.progress === 100 && <Icon name="check" size={12} />}</button><button className="mny-link grow ellip" onClick={() => X.openTask(p.id, t.id)}>{t.title}</button><span className="pln-pl inline"><i style={{ background: p.color }} />{p.name}</span><span className={'pln-due' + (isLate(t) ? ' late' : '')}>{t.due ? dueLabel(t.due) : ''}</span></div>)}</div></section>) : <div className="fx-empty"><Icon name="circleCheck" size={38} /><h3>You're all caught up</h3><div>Tasks assigned to Me show up here from every plan.</div></div>}
    </div>
  );
}
