import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, MenuRows, Modal, useToast, useAsk, useContextMenu, Swatches, download } from '../components/fxui.jsx';
import { useStore, uid } from '../lib/useStore.js';
import { todayKey, addDays, ymd, weekdayNames, parseYmd } from '../lib/cal.js';
import { pickFile, readAsText } from '../lib/download.js';
import { SMART, LIST_ICONS, LIST_COLORS, blankData, newTask, repeatLabel, nextDue, dueInfo, viewTasks, sortTasks, plannedGroups, quickDates, tasksToCsv, tasksToText, parseImport } from './todo/model.js';
import '../styles/todo.css';

const SORTS = [['manual', 'Manual'], ['importance', 'Importance'], ['due', 'Due date'], ['myday', 'Added to My Day'], ['alpha', 'Alphabetically'], ['created', 'Creation date']];
const migrate = (v) => ({ ...blankData(), ...v, settings: { ...blankData().settings, ...(v.settings || {}) }, ui: { ...blankData().ui, ...(v.ui || {}) } });

/* ---------- small pickers ---------- */
function DatePop({ value, onChange, children, label = 'Due' }) {
  return (
    <Pop trigger={({ toggle }) => children({ toggle })} width={240}>
      {({ close }) => (
        <>
          <div className="fx-head">{label}</div>
          {quickDates().map(([n, v]) => <button key={n} className="fx-row" onClick={() => { onChange(v); close(); }}><Icon name="calendarIco" size={15} /><span className="grow">{n}</span><kbd>{parseYmd(v).toLocaleDateString(undefined, { weekday: 'short' })}</kbd></button>)}
          <div className="fx-sep" />
          <div style={{ padding: '4px 8px 6px' }}><input type="date" className="fi" value={value || ''} onChange={(e) => { onChange(e.target.value || null); }} aria-label="Pick a date" /></div>
          {value && <><div className="fx-sep" /><button className="fx-row danger" onClick={() => { onChange(null); close(); }}><Icon name="x" size={15} />Remove due date</button></>}
        </>
      )}
    </Pop>
  );
}
function remindPresets() {
  const now = new Date(); const later = new Date(now.getTime() + 3 * 3600e3); later.setMinutes(0, 0, 0); if (later <= now) later.setHours(later.getHours() + 1);
  const tom = addDays(now, 1); tom.setHours(9, 0, 0, 0);
  const nm = addDays(now, ((8 - now.getDay()) % 7) || 7); nm.setHours(9, 0, 0, 0);
  const iso = (d) => `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return [['Later today', later], ['Tomorrow', tom], ['Next week', nm]].map(([n, d]) => [n, iso(d), d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })]);
}
function RemindPop({ value, onChange, children }) {
  return (
    <Pop trigger={({ toggle }) => children({ toggle })} width={260}>
      {({ close }) => (
        <>
          <div className="fx-head">Remind me</div>
          {remindPresets().map(([n, v, t]) => <button key={n} className="fx-row" onClick={() => { onChange(v); close(); }}><Icon name="bell" size={15} /><span className="grow">{n}</span><kbd>{t}</kbd></button>)}
          <div className="fx-sep" />
          <div style={{ padding: '4px 8px 6px' }}><input type="datetime-local" className="fi" value={value || ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Pick date and time" /></div>
          {value && <><div className="fx-sep" /><button className="fx-row danger" onClick={() => { onChange(null); close(); }}><Icon name="x" size={15} />Remove reminder</button></>}
        </>
      )}
    </Pop>
  );
}
function RepeatPop({ value, onChange, children }) {
  const [custom, setCustom] = useState(false);
  const [c, setC] = useState(value || { unit: 'week', every: 1, days: [] });
  const names = weekdayNames(0, 'short');
  const presets = [['Daily', { unit: 'day', every: 1 }], ['Weekdays', { unit: 'week', every: 1, days: [1, 2, 3, 4, 5] }], ['Weekly', { unit: 'week', every: 1, days: [] }], ['Monthly', { unit: 'month', every: 1 }], ['Yearly', { unit: 'year', every: 1 }]];
  return (
    <Pop trigger={({ toggle }) => children({ toggle })} width={280}>
      {({ close }) => (
        <>
          <div className="fx-head">Repeat</div>
          {presets.map(([n, v]) => <button key={n} className={'fx-row' + (value && repeatLabel(value) === n ? ' on' : '')} onClick={() => { onChange(v); close(); }}><Icon name="repeat" size={15} />{n}</button>)}
          <button className="fx-row" onClick={() => setCustom((x) => !x)}><Icon name="settings" size={15} />Custom...</button>
          {custom && (
            <div style={{ padding: '6px 10px 8px', display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Every <input type="number" min="1" max="99" className="fi" style={{ width: 62 }} value={c.every} onChange={(e) => setC({ ...c, every: Math.max(1, Number(e.target.value) || 1) })} />
                <select className="fi" value={c.unit} onChange={(e) => setC({ ...c, unit: e.target.value })}><option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option></select></div>
              {c.unit === 'week' && <div style={{ display: 'flex', gap: 3 }}>{names.map((n, i) => <button key={i} className={'fb sm' + ((c.days || []).includes(i) ? ' pri' : '')} onClick={() => { const d = new Set(c.days || []); d.has(i) ? d.delete(i) : d.add(i); setC({ ...c, days: [...d].sort() }); }}>{n[0]}</button>)}</div>}
              <button className="fb pri" onClick={() => { onChange(c); close(); }}>Apply</button>
            </div>
          )}
          {value && <><div className="fx-sep" /><button className="fx-row danger" onClick={() => { onChange(null); close(); }}><Icon name="x" size={15} />Never repeat</button></>}
        </>
      )}
    </Pop>
  );
}

/* ---------- task row ---------- */
function TaskRow({ t, data, showList, hideMyDay, selected, onSelect, onToggle, onStar, onCtx, drag, dragProps }) {
  const di = dueInfo(t.due); const list = data.lists.find((l) => l.id === t.listId);
  const stepsDone = t.steps.filter((s) => s.done).length;
  return (
    <div className={'td-row' + (t.done ? ' done' : '') + (selected ? ' sel' : '') + (drag === t.id ? ' dragging' : '')} role="listitem" onClick={() => onSelect(t.id)} onContextMenu={(e) => onCtx(e, t)} {...dragProps(t)} data-id={t.id}>
      <button className={'fcheck' + (t.done ? ' on' : '')} aria-label={t.done ? 'Mark as not completed' : 'Mark as completed'} aria-pressed={t.done} onClick={(e) => { e.stopPropagation(); onToggle(t); }}><Icon name="check" size={12} /></button>
      <div className="td-main">
        <div className="td-title">{t.title}</div>
        <div className="td-sub">
          {showList && list && <span>{list.name}</span>}
          {t.steps.length > 0 && <span>{stepsDone} of {t.steps.length}</span>}
          {t.myDay === todayKey() && !t.done && !hideMyDay && <span className="ic"><Icon name="sun" size={12} />My Day</span>}
          {di && <span className={'ic' + (di.overdue && !t.done ? ' over' : di.today ? ' today' : '')}><Icon name="calendarIco" size={12} />{di.text}</span>}
          {t.repeat && <span className="ic"><Icon name="repeat" size={12} /></span>}
          {t.remind && <span className="ic"><Icon name="bell" size={12} /></span>}
          {t.note && <span className="ic"><Icon name="note" size={12} /></span>}
        </div>
      </div>
      <button className={'td-star' + (t.important ? ' on' : '')} aria-label={t.important ? 'Remove importance' : 'Mark as important'} aria-pressed={t.important} onClick={(e) => { e.stopPropagation(); onStar(t); }}><Icon name="star" size={17} style={t.important ? { fill: 'currentColor' } : undefined} /></button>
    </div>
  );
}

/* ---------- detail pane ---------- */
function Detail({ t, data, mut, onClose, onToggle, onDelete, onMove }) {
  const [step, setStep] = useState('');
  const upd = (patch) => mut((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, ...patch, updated: Date.now() } : x)) }), { coalesce: 'task-' + t.id });
  const di = dueInfo(t.due); const today = t.myDay === todayKey();
  const lists = data.lists;
  const addStep = () => { const v = step.trim(); if (!v) return; upd({ steps: [...t.steps, { id: uid(), t: v, done: false }] }); setStep(''); };
  return (
    <aside className="td-detail" aria-label="Task details">
      <div className="td-dhead">
        <button className={'fcheck' + (t.done ? ' on' : '')} aria-label="Toggle completed" onClick={() => onToggle(t)}><Icon name="check" size={12} /></button>
        <textarea className="td-dtitle" rows={1} value={t.title} aria-label="Task title" onChange={(e) => upd({ title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} style={t.done ? { textDecoration: 'line-through', color: 'var(--ink2)' } : undefined} />
        <button className={'td-star' + (t.important ? ' on' : '')} aria-label="Toggle important" onClick={() => upd({ important: !t.important })}><Icon name="star" size={18} style={t.important ? { fill: 'currentColor' } : undefined} /></button>
      </div>
      <div className="td-dbody">
        <div className="td-card">
          {t.steps.map((s) => (
            <div key={s.id} className="td-step">
              <button className={'fcheck sm' + (s.done ? ' on' : '')} aria-label="Toggle step" onClick={() => upd({ steps: t.steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}><Icon name="check" size={10} /></button>
              <input value={s.t} aria-label="Step" className={s.done ? 'done' : ''} onChange={(e) => upd({ steps: t.steps.map((x) => (x.id === s.id ? { ...x, t: e.target.value } : x)) })} />
              <button className="fb sub ico sm" aria-label="Delete step" onClick={() => upd({ steps: t.steps.filter((x) => x.id !== s.id) })}><Icon name="x" size={13} /></button>
            </div>
          ))}
          <div className="td-step add"><Icon name="plus" size={16} /><input placeholder={t.steps.length ? 'Next step' : 'Add step'} value={step} aria-label="Add step" onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addStep(); }} onBlur={addStep} /></div>
        </div>
        <div className="td-card">
          <button className={'td-opt' + (today ? ' on' : '')} onClick={() => upd({ myDay: today ? null : todayKey() })}><Icon name="sun" size={18} /><span>{today ? 'Added to My Day' : 'Add to My Day'}</span>{today && <span className="x" onClick={(e) => { e.stopPropagation(); upd({ myDay: null }); }}><Icon name="x" size={14} /></span>}</button>
        </div>
        <div className="td-card">
          <RemindPop value={t.remind} onChange={(v) => { upd({ remind: v, reminded: false }); if (v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }}>
            {({ toggle }) => <button className={'td-opt' + (t.remind ? ' on' : '')} onClick={toggle}><Icon name="bell" size={18} /><span>{t.remind ? 'Remind me at ' + new Date(t.remind).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Remind me'}</span>{t.remind && <span className="x" onClick={(e) => { e.stopPropagation(); upd({ remind: null }); }}><Icon name="x" size={14} /></span>}</button>}
          </RemindPop>
          <DatePop value={t.due} onChange={(v) => upd({ due: v })}>
            {({ toggle }) => <button className={'td-opt' + (t.due ? ' on' : '') + (di && di.overdue && !t.done ? ' over' : '')} onClick={toggle}><Icon name="calendarIco" size={18} /><span>{di ? (di.overdue ? 'Overdue, ' : 'Due ') + di.text : 'Add due date'}</span>{t.due && <span className="x" onClick={(e) => { e.stopPropagation(); upd({ due: null }); }}><Icon name="x" size={14} /></span>}</button>}
          </DatePop>
          <RepeatPop value={t.repeat} onChange={(v) => upd({ repeat: v, due: v && !t.due ? todayKey() : t.due })}>
            {({ toggle }) => <button className={'td-opt' + (t.repeat ? ' on' : '')} onClick={toggle}><Icon name="repeat" size={18} /><span>{t.repeat ? repeatLabel(t.repeat) : 'Repeat'}</span>{t.repeat && <span className="x" onClick={(e) => { e.stopPropagation(); upd({ repeat: null }); }}><Icon name="x" size={14} /></span>}</button>}
          </RepeatPop>
        </div>
        <div className="td-card">
          <Pop trigger={({ toggle }) => <button className="td-opt" onClick={toggle}><Icon name="list" size={18} /><span>Move to: {(lists.find((l) => l.id === t.listId) || {}).name}</span></button>} width={220}>
            {({ close }) => <MenuRows close={close} items={lists.map((l) => ({ label: l.name, icon: l.icon, checked: l.id === t.listId, onClick: () => onMove(t, l.id) }))} />}
          </Pop>
        </div>
        <div className="td-card"><textarea className="td-note" placeholder="Add note" aria-label="Note" value={t.note} onChange={(e) => upd({ note: e.target.value })} rows={4} /></div>
      </div>
      <div className="td-dfoot">
        <button className="fb sub ico" aria-label="Close details" title="Hide details" onClick={onClose}><Icon name="sidebar" size={17} /></button>
        <span className="muted">{t.done ? `Completed ${new Date(t.doneAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : `Created ${new Date(t.created).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`}</span>
        <button className="fb sub ico" aria-label="Delete task" title="Delete task" onClick={() => onDelete(t)}><Icon name="trash" size={17} /></button>
      </div>
    </aside>
  );
}

/* ---------- main ---------- */
export default function TodoApp() {
  const [data, setData, meta] = useStore('todo', blankData, migrate);
  const [toastNode, toast] = useToast();
  const [askNode, ask] = useAsk();
  const [ctxNode, showCtx] = useContextMenu();
  const hist = useRef([]); const lastCoalesce = useRef({ key: '', t: 0 });
  const mut = useCallback((fn, o = {}) => {
    const now = Date.now();
    if (!(o.coalesce && lastCoalesce.current.key === o.coalesce && now - lastCoalesce.current.t < 1500)) { hist.current.push(meta.ref.current); if (hist.current.length > 40) hist.current.shift(); }
    lastCoalesce.current = { key: o.coalesce || '', t: now };
    setData(fn);
  }, [setData, meta.ref]);
  const undo = useCallback(() => { const p = hist.current.pop(); if (p) { lastCoalesce.current = { key: '', t: 0 }; setData(() => p); } }, [setData]);

  const [sel, setSelState] = useState(data.ui.sel || 'myday');
  const setSel = (v) => { setSelState(v); setSearch(''); setTaskId(null); setSide(false); setData((d) => ({ ...d, ui: { ...d.ui, sel: v } })); };
  const [taskId, setTaskId] = useState(null);
  const [search, setSearch] = useState('');
  const [side, setSide] = useState(false);
  const [draft, setDraft] = useState('');
  const [dd, setDd] = useState({ due: null, remind: null, repeat: null });
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [showSug, setShowSug] = useState(false);
  const [modal, setModal] = useState(null);
  const addRef = useRef(null); const searchRef = useRef(null);

  const { settings } = data;
  const smart = SMART.find((s) => s.id === sel);
  const list = data.lists.find((l) => l.id === sel);
  const view = smart || list || SMART[0];
  const color = view.color;
  const tasksAll = useMemo(() => viewTasks(data, sel, search), [data, sel, search]);
  const task = data.tasks.find((t) => t.id === taskId) || null;
  const isList = !!list && !smart;
  const sort = isList ? list.sort : (sel === 'important' || sel === 'myday' ? { by: 'manual' } : { by: 'manual' });

  const counts = useMemo(() => {
    const t = todayKey(); const c = { myday: 0, important: 0, planned: 0, all: 0, done: 0 };
    data.tasks.forEach((x) => { if (!x.done) { c.all++; if (x.myDay === t) c.myday++; if (x.important) c.important++; if (x.due) c.planned++; } else c.done++; });
    data.lists.forEach((l) => { c[l.id] = data.tasks.filter((x) => x.listId === l.id && !x.done).length; });
    return c;
  }, [data.tasks, data.lists]);

  /* reminders */
  useEffect(() => {
    const tick = () => {
      const now = Date.now(); const fire = meta.ref.current.tasks.filter((t) => !t.done && t.remind && !t.reminded && new Date(t.remind).getTime() <= now);
      if (!fire.length) return;
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (fire.some((f) => f.id === t.id) ? { ...t, reminded: true } : t)) }));
      fire.forEach((t) => {
        toast('Reminder: ' + t.title, { ms: 8000 });
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Techomato To Do', { body: t.title }); } catch { /* ignore */ }
        if (meta.ref.current.settings.sound) beep();
      });
    };
    tick(); const id = setInterval(tick, 15000); return () => clearInterval(id);
  }, [meta.ref, setData, toast]);

  /* actions */
  const patch = (id, p) => mut((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...p, updated: Date.now() } : t)) }));
  const toggle = (t) => {
    if (!t.done && t.repeat) {
      const due = nextDue(t.due, t.repeat);
      mut((d) => ({ ...d, tasks: [...d.tasks.map((x) => (x.id === t.id ? { ...x, done: true, doneAt: Date.now() } : x)), { ...newTask({ ...t, id: uid(), done: false, doneAt: null, due, myDay: null, reminded: false, steps: t.steps.map((s) => ({ ...s, id: uid(), done: false })), created: Date.now(), order: t.order }), remind: t.remind ? due + t.remind.slice(10) : null }] }));
      toast(`Done. Next one is due ${dueInfo(due).text.toLowerCase()}.`);
    } else patch(t.id, { done: !t.done, doneAt: t.done ? null : Date.now() });
  };
  const del = async (t) => {
    if (settings.confirmDelete) { const ok = await ask({ title: 'Delete task', message: `"${t.title}" will be permanently deleted.`, okText: 'Delete', danger: true }); if (!ok) return; }
    const prev = meta.ref.current;
    mut((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== t.id) })); if (taskId === t.id) setTaskId(null);
    toast('Task deleted', { action: { label: 'Undo', onClick: () => setData(() => prev) } });
  };
  const addTask = () => {
    const title = draft.trim(); if (!title) return;
    const t = newTask({ title, listId: isList ? list.id : (list ? list.id : 'tasks'), ...dd });
    if (sel === 'myday') t.myDay = todayKey(); if (sel === 'important') t.important = true; if (sel === 'planned' && !t.due) t.due = todayKey();
    if (!settings.newOnTop) t.order = Date.now(); else t.order = (Math.min(0, ...meta.ref.current.tasks.map((x) => x.order)) || 0) - 1;
    mut((d) => ({ ...d, tasks: [...d.tasks, t] }));
    setDraft(''); setDd({ due: null, remind: null, repeat: null });
    if (dd.remind && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  };
  const move = (t, listId) => patch(t.id, { listId });
  const reorder = (fromId, toId) => {
    if (fromId === toId) return;
    mut((d) => { const ids = sortTasks(viewTasks(d, sel, ''), { by: 'manual' }).filter((x) => !x.done).map((x) => x.id); const from = ids.indexOf(fromId); const to = ids.indexOf(toId); if (from < 0 || to < 0) return d; ids.splice(to, 0, ids.splice(from, 1)[0]); const ord = Object.fromEntries(ids.map((id, i) => [id, i])); return { ...d, tasks: d.tasks.map((x) => (x.id in ord ? { ...x, order: ord[x.id] } : x)) }; });
  };
  const newList = async (groupId = null) => {
    const name = await ask({ kind: 'prompt', title: 'New list', placeholder: 'Untitled list', okText: 'Create list' }); if (!name || !name.trim()) return;
    const l = { id: uid(), name: name.trim(), icon: 'list', color: LIST_COLORS[data.lists.length % LIST_COLORS.length], sort: { by: 'manual', dir: 'asc' }, hideDone: false, groupId };
    mut((d) => ({ ...d, lists: [...d.lists, l] })); setSel(l.id);
  };
  const newGroup = async () => {
    const name = await ask({ kind: 'prompt', title: 'New group', placeholder: 'Untitled group', okText: 'Create group' }); if (!name || !name.trim()) return;
    mut((d) => ({ ...d, groups: [...d.groups, { id: uid(), name: name.trim(), open: true }] }));
  };
  const renameList = async (l) => { const name = await ask({ kind: 'prompt', title: 'Rename list', value: l.name, okText: 'Rename' }); if (name && name.trim()) mut((d) => ({ ...d, lists: d.lists.map((x) => (x.id === l.id ? { ...x, name: name.trim() } : x)) })); };
  const delList = async (l) => {
    const n = data.tasks.filter((t) => t.listId === l.id).length;
    if (!await ask({ title: `Delete "${l.name}"?`, message: n ? `This list and its ${n} task${n === 1 ? '' : 's'} will be permanently deleted.` : 'This list will be permanently deleted.', okText: 'Delete list', danger: true })) return;
    const prev = meta.ref.current;
    mut((d) => ({ ...d, lists: d.lists.filter((x) => x.id !== l.id), tasks: d.tasks.filter((t) => t.listId !== l.id) })); setSel('myday');
    toast('List deleted', { action: { label: 'Undo', onClick: () => setData(() => prev) } });
  };
  const dupList = (l) => {
    const nid = uid(); mut((d) => ({ ...d, lists: [...d.lists, { ...l, id: nid, name: l.name + ' (copy)', builtin: false }], tasks: [...d.tasks, ...d.tasks.filter((t) => t.listId === l.id).map((t) => ({ ...t, id: uid(), listId: nid, steps: t.steps.map((s) => ({ ...s, id: uid() })) }))] })); setSel(nid);
  };
  const setListProp = (l, p) => mut((d) => ({ ...d, lists: d.lists.map((x) => (x.id === l.id ? { ...x, ...p } : x)) }));
  const clearDone = async () => {
    const ids = viewTasks(data, sel, '').filter((t) => t.done).map((t) => t.id); if (!ids.length) return toast('No completed tasks here');
    if (!await ask({ title: 'Delete completed tasks', message: `Permanently delete ${ids.length} completed task${ids.length === 1 ? '' : 's'}?`, okText: 'Delete', danger: true })) return;
    const prev = meta.ref.current; mut((d) => ({ ...d, tasks: d.tasks.filter((t) => !ids.includes(t.id)) })); toast('Completed tasks deleted', { action: { label: 'Undo', onClick: () => setData(() => prev) } });
  };
  const importTasks = async () => {
    const f = await pickFile('.txt,.csv,.json'); if (!f) return; const txt = await readAsText(f); let lines;
    try { const j = JSON.parse(txt); lines = (j.tasks || j).map((x) => x.title || String(x)); } catch { lines = parseImport(txt); }
    if (!lines.length) return toast('Nothing to import');
    const lid = isList ? list.id : 'tasks'; mut((d) => ({ ...d, tasks: [...d.tasks, ...lines.map((title, i) => newTask({ title, listId: lid, order: Date.now() + i }))] })); toast(`Imported ${lines.length} task${lines.length === 1 ? '' : 's'}`);
  };

  /* context menu for tasks */
  const taskCtx = (e, t) => {
    const qd = quickDates();
    showCtx(e, [
      { label: t.myDay === todayKey() ? 'Remove from My Day' : 'Add to My Day', icon: 'sun', onClick: () => patch(t.id, { myDay: t.myDay === todayKey() ? null : todayKey() }) },
      { label: t.important ? 'Remove importance' : 'Mark as important', icon: 'star', onClick: () => patch(t.id, { important: !t.important }) },
      { label: t.done ? 'Mark as not completed' : 'Mark as completed', icon: 'circleCheck', onClick: () => toggle(t) },
      { sep: true },
      ...qd.map(([n, v]) => ({ label: `Due ${n.toLowerCase()}`, icon: 'calendarIco', onClick: () => patch(t.id, { due: v }) })),
      { label: 'Remove due date', icon: 'x', hidden: !t.due, onClick: () => patch(t.id, { due: null }) },
      { sep: true },
      { head: 'Move task to' },
      ...data.lists.filter((l) => l.id !== t.listId).map((l) => ({ label: l.name, icon: l.icon, onClick: () => move(t, l.id) })),
      { sep: true },
      { label: 'Delete task', icon: 'trash', danger: true, onClick: () => del(t) },
    ]);
  };
  const listCtx = (e, l) => showCtx(e, [
    { label: 'Rename list', icon: 'edit', onClick: () => renameList(l) }, { label: 'Duplicate list', icon: 'copy', onClick: () => dupList(l) },
    { label: 'Change theme...', icon: 'palette', onClick: () => setModal({ kind: 'theme', id: l.id }) },
    ...(l.builtin ? [] : [{ sep: true }, { label: 'Delete list', icon: 'trash', danger: true, onClick: () => delList(l) }]),
  ]);

  /* keyboard */
  useEffect(() => {
    const k = (e) => {
      const tag = (e.target.tagName || '').toLowerCase(); const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
      if (e.key === 'Escape') { if (modal) setModal(null); else if (taskId) setTaskId(null); else if (search) setSearch(''); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/' || e.key === 'f') { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
      else if (e.key === 'n') { e.preventDefault(); addRef.current && addRef.current.focus(); }
      else if (e.key === 'Delete' && task) del(task);
      else if (e.key === ' ' && task) { e.preventDefault(); toggle(task); }
      else if (e.key === 'i' && task) patch(task.id, { important: !task.important });
      else if (e.key === '?') setModal({ kind: 'keys' });
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  /* derived lists for display */
  const showAdd = !search && sel !== 'done' && sel !== 'all' || (sel === 'all' && !search);
  const open = sortTasks(tasksAll.filter((t) => !t.done), isList ? list.sort : { by: 'manual' });
  const doneTasks = tasksAll.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const canDrag = isList && list.sort.by === 'manual' && !search || sel === 'myday' || sel === 'important';
  const dragProps = (t) => canDrag && !t.done ? { draggable: true, onDragStart: (e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.id); } catch { /* ignore */ } }, onDragOver: (e) => { e.preventDefault(); setOverId(t.id); }, onDrop: (e) => { e.preventDefault(); reorder(dragId, t.id); setDragId(null); setOverId(null); }, onDragEnd: () => { setDragId(null); setOverId(null); } } : {};
  const rowProps = { data, showList: !isList, hideMyDay: sel === 'myday', onSelect: setTaskId, onToggle: toggle, onStar: (t) => patch(t.id, { important: !t.important }), onCtx: taskCtx, drag: dragId, dragProps };

  const suggestions = useMemo(() => {
    if (sel !== 'myday') return [];
    const t = todayKey();
    return data.tasks.filter((x) => !x.done && x.myDay !== t && (x.important || (x.due && x.due <= t))).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1).slice(0, 12);
  }, [data.tasks, sel]);

  const renderSection = (items, key) => items.map((t) => <TaskRow key={key + t.id} t={t} selected={taskId === t.id} {...rowProps} />);
  const planned = sel === 'planned' || (search && false);
  const hideDone = isList && list.hideDone;
  const [doneOpen, setDoneOpen] = useState(settings.completedOpen);

  const listOptions = (close) => {
    const l = list; const items = [];
    if (l) items.push({ label: 'Rename list', icon: 'edit', onClick: () => renameList(l) });
    if (l) items.push({ head: 'Sort by' }, ...SORTS.map(([k, n]) => ({ label: n, checked: l.sort.by === k, onClick: () => setListProp(l, { sort: { by: k, dir: 'asc' } }), keepOpen: false })), { label: l.sort.dir === 'desc' ? 'Descending' : 'Ascending', icon: l.sort.dir === 'desc' ? 'arrowDown' : 'arrowUp', onClick: () => setListProp(l, { sort: { ...l.sort, dir: l.sort.dir === 'desc' ? 'asc' : 'desc' } }) }, { sep: true });
    if (l) items.push({ label: 'Change theme...', icon: 'palette', onClick: () => setModal({ kind: 'theme', id: l.id }) }, { label: hideDone ? 'Show completed tasks' : 'Hide completed tasks', icon: hideDone ? 'eye' : 'eyeOff', onClick: () => setListProp(l, { hideDone: !hideDone }) }, { label: 'Duplicate list', icon: 'copy', onClick: () => dupList(l) }, { sep: true });
    items.push({ label: 'Print this list', icon: 'printer', onClick: () => window.print() });
    items.push({ label: 'Export as text (.txt)', icon: 'download', onClick: () => download(`${view.name}.txt`, tasksToText(tasksAll)) }, { label: 'Export as spreadsheet (.csv)', icon: 'download', onClick: () => download(`${view.name}.csv`, tasksToCsv(tasksAll, data.lists), 'text/csv') }, { label: 'Import tasks...', icon: 'upload', onClick: importTasks });
    items.push({ sep: true }, { label: 'Delete completed tasks', icon: 'trash', onClick: clearDone });
    if (l && !l.builtin) items.push({ label: 'Delete list', icon: 'trash', danger: true, onClick: () => delList(l) });
    return <MenuRows items={items} close={close} />;
  };

  const sidebar = (
    <nav className={'td-side' + (side ? ' open' : '')} aria-label="Lists">
      <div className="td-smart">
        {SMART.filter((s) => !settings.hidden.includes(s.id)).map((s) => (
          <button key={s.id} className={'td-nav' + (sel === s.id ? ' on' : '')} onClick={() => setSel(s.id)} aria-current={sel === s.id ? 'page' : undefined}>
            <Icon name={s.icon} size={18} style={{ color: s.color }} /><span className="ellip grow">{s.name}</span>{counts[s.id] > 0 && s.id !== 'done' && <span className="cnt">{counts[s.id]}</span>}
          </button>
        ))}
        <button className={'td-nav' + (sel === 'tasks' ? ' on' : '')} onClick={() => setSel('tasks')} onContextMenu={(e) => listCtx(e, data.lists[0])}><Icon name="home" size={18} style={{ color: data.lists[0].color }} /><span className="ellip grow">{data.lists[0].name}</span>{counts.tasks > 0 && <span className="cnt">{counts.tasks}</span>}</button>
      </div>
      <div className="td-sep" />
      <div className="td-lists">
        {data.lists.filter((l) => !l.builtin && !l.groupId).map((l) => <ListNav key={l.id} l={l} sel={sel} count={counts[l.id]} setSel={setSel} ctx={listCtx} />)}
        {data.groups.map((g) => (
          <div key={g.id} className="td-group">
            <button className="td-nav grp" onClick={() => mut((d) => ({ ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, open: !x.open } : x)) }))} onContextMenu={(e) => showCtx(e, [{ label: 'Add list to group', icon: 'plus', onClick: () => newList(g.id) }, { label: 'Rename group', icon: 'edit', onClick: async () => { const n = await ask({ kind: 'prompt', title: 'Rename group', value: g.name }); if (n && n.trim()) mut((d) => ({ ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, name: n.trim() } : x)) })); } }, { label: 'Ungroup', icon: 'x', onClick: () => mut((d) => ({ ...d, groups: d.groups.filter((x) => x.id !== g.id), lists: d.lists.map((l) => (l.groupId === g.id ? { ...l, groupId: null } : l)) })) }])}><Icon name={g.open ? 'chevronDown' : 'chevronRight'} size={14} /><span className="ellip grow" style={{ fontWeight: 600 }}>{g.name}</span></button>
            {g.open && data.lists.filter((l) => l.groupId === g.id).map((l) => <ListNav key={l.id} l={l} sel={sel} count={counts[l.id]} setSel={setSel} ctx={listCtx} indent />)}
          </div>
        ))}
      </div>
      <div className="td-sidefoot">
        <button className="td-nav" onClick={() => newList()}><Icon name="plus" size={18} /><span className="grow">New list</span></button>
        <button className="fb sub ico" title="New group" aria-label="New group" onClick={newGroup}><Icon name="folder" size={17} /></button>
        <button className="fb sub ico" title="Settings" aria-label="Settings" onClick={() => setModal({ kind: 'settings' })}><Icon name="settings" size={17} /></button>
      </div>
    </nav>
  );

  const tint = `linear-gradient(180deg, ${color}22 0%, ${color}0a 220px, transparent 420px)`;
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const listName = search ? `Search results` : view.name;

  return (
    <div className="fx td" style={{ '--brand': '#2564cf', '--brand-h': '#1b4fa8', '--brand-soft': 'color-mix(in srgb, #2564cf 12%, var(--bg))', '--lc': color }}>
      <AppBar id="todo" name="Techomato To Do" backup={{ name: 'todo', get: () => meta.ref.current, set: (v) => setData(() => migrate(v)), blank: blankData }} status={meta.status}
        center={<label className="fx-search"><input ref={searchRef} type="search" placeholder="Search" aria-label="Search tasks" value={search} onChange={(e) => { setSearch(e.target.value); setTaskId(null); }} /><Icon name="search" size={15} /></label>}
        right={<><button className="fx-bar-btn td-burger" aria-label="Show lists" onClick={() => setSide((s) => !s)}><Icon name="menu" size={18} /></button><button className="fx-bar-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setModal({ kind: 'keys' })}><Icon name="keyboard" size={17} /></button></>}
        extraMenu={[{ label: 'Import tasks...', onClick: importTasks }, { label: 'Settings', onClick: () => setModal({ kind: 'settings' }) }]} />
      <div className="td-body">
        {sidebar}
        {side && <div className="td-scrim" onClick={() => setSide(false)} />}
        <main className="td-main-pane" style={{ background: tint }}>
          <div className="td-head">
            <div>
              <h1 style={{ color }}>{!search && <Icon name={view.icon} size={26} />} {listName}</h1>
              {sel === 'myday' && !search && <div className="muted td-date">{dateLine}</div>}
              {search && <div className="muted td-date">for "{search}" · {tasksAll.length} result{tasksAll.length === 1 ? '' : 's'}</div>}
            </div>
            <div className="spacer" />
            {sel === 'myday' && !search && <button className={'fb sub' + (showSug ? ' on' : '')} onClick={() => setShowSug((s) => !s)}><Icon name="lightbulb" size={16} />Suggestions</button>}
            {isList && <Pop align="right" trigger={({ toggle, open }) => <button className={'fb sub' + (open ? ' on' : '')} onClick={toggle}><Icon name="sortAsc" size={16} />Sort</button>} width={200}>{({ close }) => <MenuRows close={close} items={[...SORTS.map(([k, n]) => ({ label: n, checked: list.sort.by === k, onClick: () => setListProp(list, { sort: { by: k, dir: 'asc' } }) })), { sep: true }, { label: 'Reverse order', icon: 'swap', onClick: () => setListProp(list, { sort: { ...list.sort, dir: list.sort.dir === 'desc' ? 'asc' : 'desc' } }) }]} />}</Pop>}
            <Pop align="right" trigger={({ toggle }) => <button className="fb sub ico" aria-label="List options" title="List options" onClick={toggle}><Icon name="more" size={18} /></button>} width={250}>{({ close }) => listOptions(close)}</Pop>
          </div>
          {showSug && sel === 'myday' && (
            <div className="td-sug">
              <div className="fx-head" style={{ padding: 0 }}>Suggestions from your tasks</div>
              {suggestions.length === 0 && <div className="muted" style={{ padding: '8px 0' }}>Nothing to suggest right now. Overdue, due-today and important tasks show up here.</div>}
              {suggestions.map((t) => <div key={t.id} className="td-sugrow"><span className="ellip grow">{t.title}</span><span className="muted">{t.due ? dueInfo(t.due).text : 'Important'}</span><button className="fb sub ico sm" aria-label={`Add ${t.title} to My Day`} onClick={() => patch(t.id, { myDay: todayKey() })}><Icon name="plus" size={15} /></button></div>)}
            </div>
          )}
          {showAdd && (
            <div className={'td-add' + (adding || draft ? ' focus' : '')}>
              <Icon name={draft ? 'circleEmpty' : 'plus'} size={20} />
              <input ref={addRef} placeholder="Add a task" aria-label="Add a task" value={draft} onFocus={() => setAdding(true)} onBlur={() => setAdding(false)} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }} />
              {(adding || draft) && (
                <span className="td-addtools" onMouseDown={(e) => e.preventDefault()}>
                  <DatePop value={dd.due} onChange={(v) => setDd((x) => ({ ...x, due: v }))} label="Due">{({ toggle }) => <button className={'fb sub ico sm' + (dd.due ? ' on' : '')} aria-label="Add due date" title={dd.due ? dueInfo(dd.due).text : 'Add due date'} onClick={toggle}><Icon name="calendarIco" size={16} /></button>}</DatePop>
                  <RemindPop value={dd.remind} onChange={(v) => setDd((x) => ({ ...x, remind: v }))}>{({ toggle }) => <button className={'fb sub ico sm' + (dd.remind ? ' on' : '')} aria-label="Remind me" title="Remind me" onClick={toggle}><Icon name="bell" size={16} /></button>}</RemindPop>
                  <RepeatPop value={dd.repeat} onChange={(v) => setDd((x) => ({ ...x, repeat: v, due: v && !x.due ? todayKey() : x.due }))}>{({ toggle }) => <button className={'fb sub ico sm' + (dd.repeat ? ' on' : '')} aria-label="Repeat" title="Repeat" onClick={toggle}><Icon name="repeat" size={16} /></button>}</RepeatPop>
                  <button className="fb pri sm" disabled={!draft.trim()} onClick={addTask}>Add</button>
                </span>
              )}
            </div>
          )}
          <div className="td-scroll" role="list" aria-label="Tasks">
            {planned && !search ? plannedGroups(open).map((g) => <section key={g.name}><h3 className="td-gh">{g.name} <span className="fx-badge">{g.items.length}</span></h3>{renderSection(g.items, g.name)}</section>) : sel === 'done' && !search ? renderSection(doneTasks, 'd') : renderSection(open, 'o')}
            {sel !== 'done' && doneTasks.length > 0 && !hideDone && (
              <section>
                <button className="td-doneh" aria-expanded={doneOpen} onClick={() => setDoneOpen((o) => !o)}><Icon name={doneOpen ? 'chevronDown' : 'chevronRight'} size={14} />Completed <span className="fx-badge">{doneTasks.length}</span></button>
                {doneOpen && renderSection(doneTasks, 'c')}
              </section>
            )}
            {tasksAll.length === 0 && (
              <div className="fx-empty">
                <Icon name={view.icon} size={54} style={{ color, opacity: 0.55 }} />
                <h3>{search ? 'No matching tasks' : sel === 'myday' ? 'Focus on your day' : sel === 'important' ? 'Try starring some tasks' : sel === 'planned' ? 'Plan your days' : sel === 'done' ? 'Nothing completed yet' : 'No tasks here'}</h3>
                <div>{search ? 'Try a different word.' : sel === 'myday' ? 'Get things done with My Day, a list that refreshes every day.' : sel === 'important' ? 'Star a task to see it here.' : sel === 'planned' ? 'Tasks with due dates appear here.' : sel === 'done' ? 'Completed tasks are listed here.' : 'Add a task above to get started.'}</div>
              </div>
            )}
          </div>
        </main>
        {task && <Detail key={task.id} t={task} data={data} mut={mut} onClose={() => setTaskId(null)} onToggle={toggle} onDelete={del} onMove={move} />}
      </div>
      {modal && modal.kind === 'theme' && <ThemeModal list={data.lists.find((l) => l.id === modal.id)} onChange={(p) => setListProp(data.lists.find((l) => l.id === modal.id), p)} onClose={() => setModal(null)} />}
      {modal && modal.kind === 'settings' && <SettingsModal s={settings} onChange={(p) => mut((d) => ({ ...d, settings: { ...d.settings, ...p } }))} onClose={() => setModal(null)} />}
      {modal && modal.kind === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setModal(null)} footer={<button className="fb pri" onClick={() => setModal(null)}>Close</button>}><dl className="td-keys">{[['N', 'New task'], ['/ or F', 'Search'], ['Space', 'Complete selected task'], ['I', 'Toggle important'], ['Delete', 'Delete selected task'], ['Ctrl+Z', 'Undo'], ['Esc', 'Close details / search'], ['?', 'This help']].map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl></Modal>}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}

function ListNav({ l, sel, count, setSel, ctx, indent }) {
  return <button className={'td-nav' + (sel === l.id ? ' on' : '') + (indent ? ' indent' : '')} onClick={() => setSel(l.id)} onContextMenu={(e) => ctx(e, l)}><Icon name={l.icon} size={18} style={{ color: l.color }} /><span className="ellip grow">{l.name}</span>{count > 0 && <span className="cnt">{count}</span>}</button>;
}
function ThemeModal({ list, onChange, onClose }) {
  if (!list) return null;
  return (
    <Modal title={`Theme for "${list.name}"`} onClose={onClose} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <div className="fx-head" style={{ padding: 0, marginBottom: 6 }}>Colour</div><Swatches value={list.color} colors={LIST_COLORS} onChange={(c) => onChange({ color: c })} />
      <div className="fx-head" style={{ padding: 0, margin: '16px 0 6px' }}>Icon</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{LIST_ICONS.map((n) => <button key={n} className={'fb ico' + (list.icon === n ? ' on' : '')} aria-label={n} onClick={() => onChange({ icon: n })}><Icon name={n} size={18} style={{ color: list.color }} /></button>)}</div>
    </Modal>
  );
}
function SettingsModal({ s, onChange, onClose }) {
  const toggleHidden = (id) => onChange({ hidden: s.hidden.includes(id) ? s.hidden.filter((x) => x !== id) : [...s.hidden, id] });
  return (
    <Modal title="Settings" onClose={onClose} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label className="chk"><input type="checkbox" checked={s.newOnTop} onChange={(e) => onChange({ newOnTop: e.target.checked })} />Add new tasks to the top of the list</label>
        <label className="chk"><input type="checkbox" checked={s.confirmDelete} onChange={(e) => onChange({ confirmDelete: e.target.checked })} />Confirm before deleting</label>
        <label className="chk"><input type="checkbox" checked={s.sound} onChange={(e) => onChange({ sound: e.target.checked })} />Play a sound for reminders</label>
        <label className="chk"><input type="checkbox" checked={!!s.completedOpen} onChange={(e) => onChange({ completedOpen: e.target.checked })} />Show completed tasks expanded</label>
        <div className="fx-head" style={{ padding: 0, marginTop: 6 }}>Smart lists</div>
        {SMART.map((x) => <label key={x.id} className="chk"><input type="checkbox" checked={!s.hidden.includes(x.id)} onChange={() => toggleHidden(x.id)} />{x.name}</label>)}
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Reminders pop up while this page is open. Allow browser notifications to see them in other tabs.</p>
      </div>
    </Modal>
  );
}

let actx;
function beep() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(); const g = actx.createGain(); o.connect(g); g.connect(actx.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.5); o.start(); o.stop(actx.currentTime + 0.55); } catch { /* ignore */ }
}
