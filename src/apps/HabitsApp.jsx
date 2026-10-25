import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { useToast, useAsk, useContextMenu, download } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { todayKey, ymd, parseYmd, addDays, startOfWeek, weekdayNames, fmtDate, relDay } from '../lib/cal.js';
import { blankData, newHabit, ideaToHabit, id as mkId, PARTS, CATEGORIES, dayStatus, isScheduled, inRange, valueOf, getLog, setLog, setNote, streaks, scheduleLabel, goalLabel, daySummary, weekDone, logsToCsv, habitsToText, dueReminders, sampleData } from './habits/model.js';
import { Ring } from './habits/Charts.jsx';
import { HabitDialog, IdeasDialog, SettingsDialog } from './habits/Dialogs.jsx';
import { Detail, HabitsView, StatsView, CalendarView, STATUS_LABEL } from './habits/Views.jsx';
import '../styles/habits.css';

const migrate = (v) => { const b = blankData(); return { ...b, ...v, settings: { ...b.settings, ...(v.settings || {}) }, logs: v.logs || {}, notes: v.notes || {}, habits: v.habits || [] }; };
const QUOTES = ['Small steps every day add up to big change.', 'You do not rise to your goals, you fall to your systems.', 'Never miss twice.', 'Consistency beats intensity.', 'Done is better than perfect.', 'Start where you are. Use what you have.', 'Show up. That is most of it.', 'Every check-in is a vote for who you want to be.', 'Motivation gets you started, habit keeps you going.', 'One percent better every day.'];
const stepOf = (h) => (h.kind === 'time' ? 5 : h.goal >= 1000 ? 500 : h.goal >= 100 ? 10 : 1);
const fmtNum = (n) => Number(n).toLocaleString();

/* ---------- one habit row ---------- */
function Row({ h, data, day, today, first, selected, onSelect, onToggle, onAdjust, onSetValue, onCtx }) {
  const st = dayStatus(h, data, day, today); const v = valueOf(data, h.id, day);
  const s = streaks(h, data, today, first); const fut = day > today;
  const done = st === 'done'; const skipped = st === 'skip';
  const week = h.schedule.type === 'week' ? weekDone(h, data, day, first) : null;
  const frac = h.kind === 'check' ? (done ? 1 : 0) : h.limit ? Math.min(1, v / (h.goal || 1)) : Math.min(1, v / h.goal);
  const unit = h.unit || (h.kind === 'time' ? 'min' : '');
  return (
    <div className={`hab-row ${st}${selected ? ' sel' : ''}`} style={{ '--hc': h.color }} onClick={() => onSelect(h.id)} onContextMenu={(e) => onCtx(e, h)}>
      <button className={'hab-check' + (done ? ' on' : '') + (st === 'partial' ? ' part' : '') + (skipped ? ' skip' : '') + (st === 'miss' && h.limit ? ' over' : '')} disabled={fut} aria-pressed={done}
        aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${h.name}`} onClick={(e) => { e.stopPropagation(); onToggle(h, day); }}>
        {done ? <Icon name="check" size={16} /> : skipped ? <Icon name="minus" size={14} /> : st === 'miss' && h.limit ? <Icon name="x" size={14} /> : null}
      </button>
      <span className="hab-tile" style={{ background: h.color }} aria-hidden="true">{h.icon}</span>
      <span className="hab-main">
        <span className="hab-title">{h.name}</span>
        <span className="hab-sub">
          {s.current > 0 && <span className="hab-streak" title="Current streak"><Icon name="fire" size={12} />{s.current} {s.unit === 'week' ? 'week' : 'day'}{s.current === 1 ? '' : 's'}</span>}
          {week !== null && <span>{week}/{h.schedule.times} this week</span>}
          {week === null && h.schedule.type !== 'daily' && <span>{scheduleLabel(h)}</span>}
          {h.kind !== 'check' && <span>{h.limit ? 'Limit ' : 'Goal '}{goalLabel(h).replace('at most ', '')}</span>}
          {skipped && <span>Skipped</span>}
          {h.limit && v > h.goal && <span className="hab-over">Over the limit by {fmtNum(v - h.goal)}</span>}
          {h.part !== 'any' && false}
        </span>
        {h.kind !== 'check' && <span className="hab-bar" aria-hidden="true"><i style={{ width: `${frac * 100}%`, background: h.limit && v > h.goal ? 'var(--danger)' : h.color }} /></span>}
      </span>
      {h.kind !== 'check' && (
        <span className="hab-counter" onClick={(e) => e.stopPropagation()}>
          <button className="fb ico sm" disabled={fut || v <= 0} aria-label={`Decrease ${h.name}`} onClick={() => onAdjust(h, day, -stepOf(h))}><Icon name="minus" size={14} /></button>
          <button className="hab-val" disabled={fut} aria-label={`Set value for ${h.name}`} title="Click to type a value" onClick={() => onSetValue(h, day)}><b>{fmtNum(v)}</b><small>/ {fmtNum(h.goal)} {unit}</small></button>
          <button className="fb ico sm" disabled={fut} aria-label={`Increase ${h.name}`} onClick={() => onAdjust(h, day, stepOf(h))}><Icon name="plus" size={14} /></button>
        </span>
      )}
      <button className="fb ico sm hab-more" aria-label={`More options for ${h.name}`} onClick={(e) => { e.stopPropagation(); onCtx(e, h); }}><Icon name="more" size={16} /></button>
    </div>
  );
}

export default function HabitsApp() {
  const [data, set, meta] = useStore('habits', blankData, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const [, setTick] = useState(0);
  const today = todayKey();
  const [view, setView] = useState('today');
  const [day, setDay] = useState(today);
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [ideas, setIdeas] = useState(false);
  const [settings, setSettings] = useState(false);
  const [cat, setCat] = useState('all');
  const [navOpen, setNavOpen] = useState(false);
  const dataRef = useRef(data); dataRef.current = data;
  const first = data.settings.weekStart;
  const active = useMemo(() => data.habits.filter((h) => !h.archived), [data.habits]);
  const archived = useMemo(() => data.habits.filter((h) => h.archived), [data.habits]);
  const catOk = (h) => cat === 'all' || h.category === cat;
  const habit = sel && data.habits.find((h) => h.id === sel);

  /* refresh at midnight and every minute */
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  const lastToday = useRef(today);
  useEffect(() => { if (lastToday.current !== today) { setDay((d) => (d === lastToday.current ? today : d)); lastToday.current = today; } }, [today]);

  /* reminders (only fire while the page is open) */
  const fired = useRef(new Set());
  const check = useCallback(() => {
    const now = new Date(); const d = dataRef.current;
    for (const h of dueReminders(d, now, fired.current)) {
      fired.current.add(`${h.id}|${ymd(now)}`);
      toast(`Reminder: ${h.icon} ${h.name}`, { ms: 7000 });
      if (d.settings.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Techomato Habits', { body: `Time for: ${h.icon} ${h.name}` }); } catch { /* ignore */ } }
    }
  }, [toast]);
  useEffect(() => { const t = setInterval(check, 15000); return () => clearInterval(t); }, [check]);
  useEffect(() => { const t = setTimeout(check, 400); return () => clearTimeout(t); }, [data.habits, check]);

  /* ---------- mutations ---------- */
  const toggle = useCallback((h, ds) => set((d) => {
    const cur = getLog(d, h.id, ds); const st = dayStatus(h, d, ds, today);
    if (h.limit) return setLog(d, h.id, ds, cur === undefined ? 0 : undefined);
    if (st === 'done') return setLog(d, h.id, ds, undefined);
    return setLog(d, h.id, ds, h.kind === 'check' ? 1 : h.goal);
  }), [set, today]);
  const adjust = useCallback((h, ds, delta) => set((d) => {
    const v = Math.max(0, valueOf(d, h.id, ds) + delta);
    return setLog(d, h.id, ds, v === 0 && !h.limit ? undefined : v);
  }), [set]);
  const setValue = useCallback(async (h, ds) => {
    const r = await ask({ kind: 'prompt', title: `${h.name}`, message: `How much ${h.unit || (h.kind === 'time' ? 'minutes' : 'in total')} on ${fmtDate(parseYmd(ds), { weekday: 'long', month: 'short', day: 'numeric' })}?`, value: String(valueOf(dataRef.current, h.id, ds)), okText: 'Save' });
    if (r === null || r === undefined) return;
    const n = Math.max(0, Number(String(r).replace(/,/g, ''))); if (Number.isNaN(n)) return;
    set((d) => setLog(d, h.id, ds, n === 0 && !h.limit ? undefined : n));
  }, [ask, set]);
  const skip = (h, ds) => set((d) => setLog(d, h.id, ds, getLog(d, h.id, ds) === -1 ? undefined : -1));
  const editNote = useCallback(async (h, ds) => {
    const r = await ask({ kind: 'prompt', multiline: true, title: `Note · ${h.name}`, message: fmtDate(parseYmd(ds), { weekday: 'long', month: 'long', day: 'numeric' }), value: (dataRef.current.notes[h.id] || {})[ds] || '', placeholder: 'How did it go?', okText: 'Save note' });
    if (r === null || r === undefined) return; set((d) => setNote(d, h.id, ds, String(r).trim()));
  }, [ask, set]);
  const saveHabit = (h) => {
    const isNew = !data.habits.some((x) => x.id === h.id);
    set((d) => ({ ...d, habits: isNew ? [...d.habits, h] : d.habits.map((x) => (x.id === h.id ? h : x)) }));
    setEditing(null); toast(isNew ? `Added “${h.name}”` : 'Habit saved');
  };
  const removeHabit = async (h) => {
    if (!(await ask({ title: 'Delete habit', message: `Delete “${h.name}” and all of its history? You can undo this right after.`, okText: 'Delete', danger: true }))) return;
    const snap = { habit: h, logs: data.logs[h.id], notes: data.notes[h.id], idx: data.habits.findIndex((x) => x.id === h.id) };
    set((d) => { const logs = { ...d.logs }, notes = { ...d.notes }; delete logs[h.id]; delete notes[h.id]; return { ...d, habits: d.habits.filter((x) => x.id !== h.id), logs, notes }; });
    setEditing(null); if (sel === h.id) setSel(null);
    toast(`Deleted “${h.name}”`, { action: { label: 'Undo', onClick: () => set((d) => { const hs = [...d.habits]; hs.splice(Math.min(snap.idx, hs.length), 0, snap.habit); return { ...d, habits: hs, logs: snap.logs ? { ...d.logs, [h.id]: snap.logs } : d.logs, notes: snap.notes ? { ...d.notes, [h.id]: snap.notes } : d.notes }; }) } });
  };
  const archive = (h) => {
    const to = !h.archived; set((d) => ({ ...d, habits: d.habits.map((x) => (x.id === h.id ? { ...x, archived: to } : x)) }));
    if (to && sel === h.id) setSel(null);
    toast(to ? `Archived “${h.name}”` : `Restored “${h.name}”`, { action: { label: 'Undo', onClick: () => set((d) => ({ ...d, habits: d.habits.map((x) => (x.id === h.id ? { ...x, archived: !to } : x)) })) } });
  };
  const duplicate = (h) => { const c = { ...h, id: mkId(), name: h.name + ' (copy)', created: Date.now() }; set((d) => ({ ...d, habits: [...d.habits, c] })); toast('Habit duplicated'); };
  const move = (h, dir) => set((d) => { const arr = [...d.habits]; const i = arr.findIndex((x) => x.id === h.id); let j = i + dir; while (j >= 0 && j < arr.length && arr[j].archived !== h.archived) j += dir; if (j < 0 || j >= arr.length) return d; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...d, habits: arr }; });
  const newOne = (o) => setEditing({ habit: newHabit(o), isNew: true });

  const menu = (e, h) => {
    const st = dayStatus(h, data, day, today); const done = st === 'done';
    const items = [];
    if (!h.archived) {
      items.push({ label: done ? 'Mark not done' : 'Mark done', icon: 'check', onClick: () => toggle(h, day), disabled: day > today });
      items.push({ label: st === 'skip' ? 'Undo skip' : 'Skip this day', icon: 'minus', onClick: () => skip(h, day), disabled: day > today });
      items.push({ label: 'Add note…', icon: 'note', onClick: () => editNote(h, day) });
      items.push({ sep: true });
    }
    items.push({ label: 'Edit…', icon: 'edit', onClick: () => setEditing({ habit: h, isNew: false }) });
    items.push({ label: 'View details', icon: 'info', onClick: () => setSel(h.id) });
    if (!h.archived) { items.push({ label: 'Move up', icon: 'chevronUp', onClick: () => move(h, -1) }); items.push({ label: 'Move down', icon: 'chevronDown', onClick: () => move(h, 1) }); }
    items.push({ label: 'Duplicate', icon: 'copy', onClick: () => duplicate(h) });
    items.push({ sep: true });
    items.push({ label: h.archived ? 'Restore' : 'Archive', icon: 'archive', onClick: () => archive(h) });
    items.push({ label: 'Delete…', icon: 'trash', danger: true, onClick: () => removeHabit(h) });
    showCtx(e, items);
  };

  /* ---------- derived ---------- */
  const shown = (h) => inRange(h, day) && (isScheduled(h, day) || h.schedule.type === 'week' || valueOf(data, h.id, day) > 0) && catOk(h);
  const todays = active.filter(shown);
  const summary = daySummary(active.filter(catOk), data, day, today);
  const remaining = daySummary(active, data, today, today);
  const left = Math.max(0, remaining.total - remaining.done);
  const list = data.settings.hideDoneToday ? todays.filter((h) => dayStatus(h, data, day, today) !== 'done') : todays;
  const bestStreak = active.reduce((b, h) => { const s = streaks(h, data, today, first); return s.unit === 'day' && s.current > b.n ? { n: s.current, h } : b; }, { n: 0, h: null });
  const allDone = summary.total > 0 && summary.done === summary.total;
  const cheered = useRef('');
  useEffect(() => { if (allDone && day === today && cheered.current !== today) { cheered.current = today; toast('🎉 All habits done for today. Great work!'); } if (!allDone && cheered.current === today) cheered.current = ''; }, [allDone, day, today, toast]);

  const weekStart = startOfWeek(parseYmd(day), first);
  const strip = Array.from({ length: 7 }, (_, i) => ymd(addDays(weekStart, i)));
  const wn = weekdayNames(first, 'short');
  const dayTitle = day === today ? 'Today' : relDay(parseYmd(day));
  const go = (n) => setDay(ymd(addDays(parseYmd(day), n)));
  const quote = QUOTES[(parseYmd(today).getDate() + parseYmd(today).getMonth()) % QUOTES.length];

  useEffect(() => {
    const kd = (e) => {
      const t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey || editing || ideas || settings || document.querySelector('.fx-modal')) return;
      if (e.key === 'n') { e.preventDefault(); setIdeas(true); }
      else if (view === 'today' && e.key === 'ArrowLeft') go(-1); else if (view === 'today' && e.key === 'ArrowRight') go(1); else if (e.key === 't') setDay(today);
    };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- settings actions ---------- */
  const notifState = typeof window === 'undefined' || !('Notification' in window) ? 'unsupported' : Notification.permission;
  const onNotify = async (on) => {
    if (!on) { set((d) => ({ ...d, settings: { ...d.settings, notify: false } })); return; }
    if (notifState === 'unsupported') { toast('Notifications are not supported here. In-app reminders still work.'); return; }
    let p = Notification.permission; if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } }
    if (p === 'granted') { set((d) => ({ ...d, settings: { ...d.settings, notify: true } })); toast('Notifications on while this page is open'); } else toast('Notifications were not allowed');
  };
  const loadSample = () => set((d) => { const s = sampleData(today); const have = new Set(d.habits.map((h) => h.id)); const hs = s.habits.filter((h) => !have.has(h.id)); return { ...d, habits: [...d.habits, ...hs], logs: { ...d.logs, ...s.logs }, notes: { ...d.notes, ...s.notes } }; });
  const clearLogs = async () => { if (await ask({ title: 'Clear all check-ins', message: 'Remove every check-in and note but keep your habits?', okText: 'Clear', danger: true })) { set((d) => ({ ...d, logs: {}, notes: {} })); toast('Check-ins cleared'); } };

  const cats = CATEGORIES.filter((c) => data.habits.some((h) => !h.archived && h.category === c));
  const nav = [['today', 'Today', 'sun', left || null], ['habits', 'All habits', 'list', active.length || null], ['stats', 'Statistics', 'spark', null], ['calendar', 'Calendar', 'calendarIco', null], ['archive', 'Archive', 'archive', archived.length || null]];
  const showDetail = habit && view !== 'calendar';

  const todayView = (
    <div className="hab-page">
      <div className="hab-top">
        <div className="hab-titlebar">
          <button className="fb ico" aria-label="Previous day" onClick={() => go(-1)}><Icon name="chevronLeft" size={18} /></button>
          <div><h1>{dayTitle}</h1><div className="muted">{fmtDate(parseYmd(day), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
          <button className="fb ico" aria-label="Next day" onClick={() => go(1)}><Icon name="chevronRight" size={18} /></button>
          {day !== today && <button className="fb sm" onClick={() => setDay(today)}>Go to today</button>}
          <input type="date" className="fi hab-datepick" aria-label="Pick a date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
        <div className="hab-sum">
          <Ring value={summary.ratio} size={92} stroke={9} color={allDone ? '#107c10' : 'var(--brand)'} label={`${Math.round(summary.ratio * 100)} percent complete`}><b>{Math.round(summary.ratio * 100)}%</b></Ring>
          <div className="hab-sum-t">
            <div className="hab-sum-h">{summary.total ? (allDone ? 'All done. Great work!' : `${summary.done} of ${summary.total} done`) : 'Nothing scheduled'}</div>
            <div className="muted">{summary.total ? (allDone ? 'You completed everything on your list.' : `${summary.total - summary.done} to go${summary.skipped ? ` · ${summary.skipped} skipped` : ''}`) : 'Enjoy the day off or add a habit.'}</div>
            {data.settings.showQuote && <div className="hab-quote">“{quote}”</div>}
          </div>
          {bestStreak.n > 1 && <div className="hab-best" title={`${bestStreak.h.name}`}><Icon name="fire" size={22} /><b>{bestStreak.n}</b><small>day streak<br />{bestStreak.h.name}</small></div>}
        </div>
        <div className="hab-strip" role="group" aria-label="This week">
          {strip.map((ds, i) => { const s = daySummary(active.filter(catOk), data, ds, today); const fut = ds > today; return (
            <button key={ds} className={'hab-sd' + (ds === day ? ' on' : '') + (ds === today ? ' today' : '')} onClick={() => setDay(ds)} aria-label={`${fmtDate(parseYmd(ds), { weekday: 'long', month: 'short', day: 'numeric' })}: ${s.total ? `${s.done} of ${s.total} done` : 'nothing scheduled'}`} aria-pressed={ds === day}>
              <small>{wn[i]}</small>
              <Ring value={fut ? 0 : s.ratio} size={34} stroke={4} color={s.ratio === 1 && s.total ? '#107c10' : 'var(--brand)'}>{Number(ds.slice(8))}</Ring>
            </button>); })}
        </div>
      </div>
      {!active.length ? (
        <div className="fx-empty hab-welcome">
          <span className="hab-welcome-i">🌱</span><h3>Build habits that stick</h3>
          <p>Track daily routines, set goals, watch your streaks grow and see how consistent you are.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}><button className="fb pri" onClick={() => setIdeas(true)}><Icon name="sparkles" size={15} />Browse habit ideas</button><button className="fb" onClick={() => newOne()}><Icon name="plus" size={15} />Create your own</button><button className="fb" onClick={loadSample}>Try with sample data</button></div>
        </div>
      ) : (
        <div className="hab-list">
          {PARTS.map(([k, n]) => {
            const rows = list.filter((h) => h.part === k); if (!rows.length) return null;
            return (
              <section key={k} aria-label={n}>
                {PARTS.filter(([kk]) => list.some((h) => h.part === kk)).length > 1 && <h3 className="hab-gh">{k === 'morning' ? '🌅 ' : k === 'afternoon' ? '☀️ ' : k === 'evening' ? '🌙 ' : '🕐 '}{n}<span>{rows.filter((h) => dayStatus(h, data, day, today) === 'done').length}/{rows.length}</span></h3>}
                {rows.map((h) => <Row key={h.id} h={h} data={data} day={day} today={today} first={first} selected={sel === h.id} onSelect={setSel} onToggle={toggle} onAdjust={adjust} onSetValue={setValue} onCtx={menu} />)}
              </section>
            );
          })}
          {!list.length && <div className="fx-empty">{todays.length ? 'Everything is done. Nice work!' : 'No habits scheduled for this day.'}</div>}
          <button className="hab-addrow" onClick={() => setIdeas(true)}><Icon name="plus" size={16} />Add a habit</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="fx hab" style={{ '--brand': '#d9650f', '--brand-h': '#b9540b', '--brand-soft': 'color-mix(in srgb, #e0701a 15%, var(--bg))' }}>
      <AppBar id="habits" name="Techomato Habits" status={meta.status === 'error' ? 'error' : undefined}
        right={<><button className="fx-bar-btn" onClick={() => setIdeas(true)}><Icon name="plus" size={16} />New habit</button><button className="fx-bar-btn" aria-label="Habit settings" title="Settings" onClick={() => setSettings(true)}><Icon name="settings" size={17} /></button></>}
        backup={{ name: 'habits', get: () => data, set: (v) => meta.replace(migrate(v)), blank: () => blankData() }} />
      <div className="hab-body">
        <button className="hab-burger fb ico" aria-label="Menu" onClick={() => setNavOpen(!navOpen)}><Icon name="menu" size={18} /></button>
        <nav className={'hab-nav' + (navOpen ? ' open' : '')} aria-label="Habits navigation">
          <button className="fb pri block" onClick={() => { setIdeas(true); setNavOpen(false); }}><Icon name="plus" size={16} />New habit</button>
          <div className="hab-navl">
            {nav.map(([k, n, ic, c]) => <button key={k} className={'hab-ni' + (view === k ? ' on' : '')} aria-current={view === k ? 'page' : undefined} onClick={() => { setView(k); setNavOpen(false); }}><Icon name={ic} size={17} /><span className="grow">{n}</span>{c ? <span className="hab-cnt">{c}</span> : null}</button>)}
          </div>
          {cats.length > 0 && (
            <>
              <div className="hab-navh">Categories</div>
              <div className="hab-navl">
                <button className={'hab-na' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>All categories</button>
                {cats.map((c) => <button key={c} className={'hab-na' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}<span className="hab-cnt">{active.filter((h) => h.category === c).length}</span></button>)}
              </div>
            </>
          )}
          <span className="spacer" />
          <button className="hab-na" onClick={() => setIdeas(true)}><Icon name="sparkles" size={15} />Habit ideas</button>
        </nav>
        {navOpen && <div className="hab-scrim" onClick={() => setNavOpen(false)} />}
        <main className="hab-content">
          {view === 'today' && todayView}
          {view === 'habits' && <div className="hab-page"><div className="hab-ph"><h1>All habits</h1><span className="muted">{active.filter(catOk).length} active{cat !== 'all' ? ` in ${cat}` : ''}</span></div><HabitsView habits={active.filter(catOk)} data={data} today={today} first={first} sel={sel} onSel={setSel} onNew={() => setIdeas(true)} onCtx={menu} /></div>}
          {view === 'archive' && <div className="hab-page"><div className="hab-ph"><h1>Archive</h1><span className="muted">Archived habits keep their history but leave your daily list.</span></div><HabitsView habits={archived} archived data={data} today={today} first={first} sel={sel} onSel={setSel} onCtx={menu} /></div>}
          {view === 'stats' && <div className="hab-page"><div className="hab-ph"><h1>Statistics</h1></div><StatsView data={data} today={today} first={first} onOpen={setSel} /></div>}
          {view === 'calendar' && <div className="hab-page"><div className="hab-ph"><h1>Calendar</h1><span className="muted">Pick a day to review or fix its check-ins.</span></div><CalendarView data={data} today={today} first={first} onPickDay={(ds) => { setDay(ds); setView('today'); }} /></div>}
        </main>
        {showDetail && <Detail key={habit.id} h={habit} data={data} today={today} first={first} onToggle={toggle} onEdit={() => setEditing({ habit, isNew: false })} onClose={() => setSel(null)} onNote={editNote} onArchive={archive} />}
      </div>
      {editing && <HabitDialog key={editing.habit.id} habit={editing.habit} isNew={editing.isNew} onClose={() => setEditing(null)} onSave={saveHabit} onDelete={() => removeHabit(editing.habit)} />}
      {ideas && <IdeasDialog onClose={() => setIdeas(false)} onBlank={() => { setIdeas(false); newOne(); }} onPick={(i) => { setIdeas(false); setEditing({ habit: ideaToHabit(i), isNew: true }); }} />}
      {settings && <SettingsDialog data={data} onClose={() => setSettings(false)} setSettings={(o) => set((d) => ({ ...d, settings: { ...d.settings, ...o } }))} onCsv={() => download('techomato-habits.csv', logsToCsv(data), 'text/csv')} onCopy={async () => { try { await navigator.clipboard.writeText(habitsToText(data, today)); toast('Summary copied'); } catch { toast('Could not copy'); } }} onSample={() => { loadSample(); toast('Sample habits added'); }} onClearLogs={clearLogs} notifState={notifState} onNotify={onNotify} />}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}
