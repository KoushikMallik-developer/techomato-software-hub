import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, MenuRows, Modal, useToast, useAsk, useContextMenu, Swatches, download } from '../components/fxui.jsx';
import { useStore, uid } from '../lib/useStore.js';
import { addDays, addMonths, diffDays, isoWeek, parseYmd, startOfDay, startOfMonth, startOfWeek, weekdayNames, ymd, MONTHS, pad, sameDay } from '../lib/cal.js';
import { pickFile, readAsText } from '../lib/download.js';
import { CAL_COLORS, REMINDERS, SHOW_AS, HOLIDAY_REGIONS, blankData, newEvent, toLocal, parseLocal, dateOnly, rangeOccurrences, applyChange, applyDelete, repeatSummary, holidaysFor, toIcs, fromIcs } from './calendar/model.js';
import { MiniMonth, TimeGrid, MonthGrid, Agenda, fmtT } from './calendar/Views.jsx';
import '../styles/calendar.css';

const VIEWS = [['day', 'Day'], ['workweek', 'Work week'], ['week', 'Week'], ['month', 'Month'], ['agenda', 'Agenda']];
const migrate = (v) => { const b = blankData(); return { ...b, ...v, settings: { ...b.settings, ...(v.settings || {}) } }; };

function useFloat(anchor) {
  const ref = useRef(null); const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });
  useLayoutEffect(() => { const r = ref.current.getBoundingClientRect(); let left = anchor.x + 12; let top = anchor.y - 20; if (left + r.width > window.innerWidth - 8) left = Math.max(8, anchor.x - r.width - 12); if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8); if (top < 8) top = 8; setPos({ left, top }); }, [anchor.x, anchor.y]);
  return [ref, pos];
}

function ScopeModal({ verb, onPick, onClose }) {
  const [v, setV] = useState('one');
  return (
    <Modal title={`${verb} recurring event`} onClose={onClose} width={400} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onPick(v)}>OK</button></>}>
      {[['one', 'This event'], ['following', 'This and following events'], ['all', 'All events in the series']].map(([k, n]) => <label key={k} className="chk" style={{ display: 'flex', padding: '6px 0' }}><input type="radio" name="scope" checked={v === k} onChange={() => setV(k)} />{n}</label>)}
    </Modal>
  );
}

/* ---------- full editor ---------- */
function Editor({ init, isNew, cals, settings, onSave, onDelete, onClose, dateKey }) {
  const [f, setF] = useState(init);
  const [custom, setCustom] = useState(false);
  const [att, setAtt] = useState((init.attendees || []).join(', '));
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const sd = f.start.slice(0, 10); const ed = f.end.slice(0, 10); const st = f.start.slice(11, 16); const et = f.end.slice(11, 16);
  const durMs = parseLocal(f.end) - parseLocal(f.start);
  const setStart = (dateStr, timeStr) => {
    const ns = f.allDay ? dateStr : `${dateStr}T${timeStr || st || '09:00'}`; const sNew = parseLocal(ns);
    const ne = f.allDay ? ymd(addDays(parseYmd(dateStr), diffDays(parseYmd(sd), parseYmd(ed)))) : toLocal(new Date(sNew.getTime() + Math.max(durMs, 0)));
    set({ start: ns, end: ne });
  };
  const setEnd = (dateStr, timeStr) => set({ end: f.allDay ? dateStr : `${dateStr}T${timeStr || et || '10:00'}` });
  const invalid = parseLocal(f.end) < parseLocal(f.start);
  const toggleAllDay = (on) => { if (on) set({ allDay: true, start: sd, end: ed }); else { const s = new Date(parseYmd(sd).getFullYear(), parseYmd(sd).getMonth(), parseYmd(sd).getDate(), settings.dayStart, 0); set({ allDay: false, start: toLocal(s), end: toLocal(new Date(s.getTime() + settings.defLen * 60000)) }); } };
  const r = f.repeat; const sdate = parseLocal(f.start);
  const presetKey = !r ? 'none' : custom ? 'custom' : r.freq === 'daily' && (r.interval || 1) === 1 ? 'daily' : r.freq === 'weekly' && (r.interval || 1) === 1 && (r.byday || []).join() === '1,2,3,4,5' ? 'weekday' : r.freq === 'weekly' && (r.interval || 1) === 1 && !(r.byday && r.byday.length) ? 'weekly' : r.freq === 'monthly' && (r.interval || 1) === 1 && !r.monthMode ? 'monthly' : r.freq === 'yearly' && (r.interval || 1) === 1 ? 'yearly' : 'custom';
  const setPreset = (k) => {
    setCustom(k === 'custom');
    const keep = r ? { until: r.until, count: r.count } : {};
    if (k === 'none') set({ repeat: null }); else if (k === 'daily') set({ repeat: { freq: 'daily', interval: 1, ...keep } }); else if (k === 'weekday') set({ repeat: { freq: 'weekly', interval: 1, byday: [1, 2, 3, 4, 5], ...keep } }); else if (k === 'weekly') set({ repeat: { freq: 'weekly', interval: 1, ...keep } }); else if (k === 'monthly') set({ repeat: { freq: 'monthly', interval: 1, ...keep } }); else if (k === 'yearly') set({ repeat: { freq: 'yearly', interval: 1, ...keep } }); else if (!r) set({ repeat: { freq: 'weekly', interval: 1, byday: [sdate.getDay()] } });
  };
  const names = weekdayNames(0, 'short');
  const endMode = !r ? 'never' : r.until ? 'until' : r.count ? 'count' : 'never';
  const save = () => { if (invalid) return; onSave({ ...f, title: f.title.trim(), attendees: att.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean) }); };
  return (
    <Modal title={isNew ? 'New event' : 'Edit event'} onClose={onClose} width={640} label="Event editor"
      footer={<>{!isNew && <button className="fb danger" style={{ marginRight: 'auto' }} onClick={onDelete}><Icon name="trash" size={15} />Delete</button>}<button className="fb" onClick={onClose}>Discard</button><button className="fb pri" onClick={save} disabled={invalid}>Save</button></>}>
      <div className="cal-ed">
        <input className="fi cal-ed-title" autoFocus placeholder="Add a title" aria-label="Title" value={f.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <div className="fx-kv"><label>Calendar</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><i className="cal-dotc" style={{ background: f.color || (cals.find((c) => c.id === f.calId) || {}).color }} /><select className="fi" value={f.calId} onChange={(e) => set({ calId: e.target.value })} aria-label="Calendar">{cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <Pop trigger={({ toggle }) => <button className="fb sub sm" onClick={toggle} title="Event colour"><Icon name="palette" size={15} />Colour</button>} width={210}>{({ close }) => <div style={{ padding: 8 }}><Swatches value={f.color} colors={CAL_COLORS} onChange={(c) => { set({ color: c }); close(); }} />{f.color && <button className="fb sub sm" style={{ marginTop: 8 }} onClick={() => { set({ color: null }); close(); }}>Use calendar colour</button>}</div>}</Pop></div>
          <label>Start</label>
          <div className="cal-dt"><input type="date" className="fi" value={sd} aria-label="Start date" onChange={(e) => e.target.value && setStart(e.target.value)} />{!f.allDay && <input type="time" step="900" className="fi" value={st} aria-label="Start time" onChange={(e) => e.target.value && setStart(sd, e.target.value)} />}</div>
          <label>End</label>
          <div className="cal-dt"><input type="date" className="fi" value={ed} aria-label="End date" onChange={(e) => e.target.value && setEnd(e.target.value)} />{!f.allDay && <input type="time" step="900" className="fi" value={et} aria-label="End time" onChange={(e) => e.target.value && setEnd(ed, e.target.value)} />}</div>
          <span />
          <div>{invalid && <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>The end can't be before the start.</div>}<label className="chk"><input type="checkbox" checked={f.allDay} onChange={(e) => toggleAllDay(e.target.checked)} />All day</label></div>
          <label>Repeat</label>
          <div style={{ display: 'grid', gap: 8 }}>
            <select className="fi" value={presetKey} aria-label="Repeat" onChange={(e) => setPreset(e.target.value)}>
              <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekday">Every weekday (Mon–Fri)</option><option value="weekly">Weekly on {names[sdate.getDay()]}</option><option value="monthly">Monthly on day {sdate.getDate()}</option><option value="yearly">Yearly on {MONTHS[sdate.getMonth()]} {sdate.getDate()}</option><option value="custom">Custom...</option>
            </select>
            {r && (presetKey === 'custom' || custom) && (
              <div className="cal-rep">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Repeat every <input type="number" min="1" max="99" className="fi" style={{ width: 64 }} value={r.interval || 1} onChange={(e) => set({ repeat: { ...r, interval: Math.max(1, +e.target.value || 1) } })} aria-label="Interval" />
                  <select className="fi" style={{ width: 110 }} value={r.freq} onChange={(e) => set({ repeat: { ...r, freq: e.target.value, byday: e.target.value === 'weekly' ? [sdate.getDay()] : undefined } })} aria-label="Frequency"><option value="daily">day(s)</option><option value="weekly">week(s)</option><option value="monthly">month(s)</option><option value="yearly">year(s)</option></select></div>
                {r.freq === 'weekly' && <div style={{ display: 'flex', gap: 3 }}>{names.map((n, i) => <button key={i} className={'fb sm' + ((r.byday || []).includes(i) ? ' pri' : '')} aria-label={n} onClick={() => { const d = new Set(r.byday || []); d.has(i) ? d.delete(i) : d.add(i); if (!d.size) d.add(sdate.getDay()); set({ repeat: { ...r, byday: [...d].sort() } }); }}>{n[0]}</button>)}</div>}
                {r.freq === 'monthly' && <select className="fi" value={r.monthMode || 'date'} onChange={(e) => set({ repeat: { ...r, monthMode: e.target.value === 'nth' ? 'nth' : undefined } })} aria-label="Monthly mode"><option value="date">On day {sdate.getDate()}</option><option value="nth">On the {['', '1st', '2nd', '3rd', '4th', '5th'][Math.ceil(sdate.getDate() / 7)]} {names[sdate.getDay()]}</option></select>}
              </div>
            )}
            {r && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="fi" style={{ width: 130 }} value={endMode} aria-label="Ends" onChange={(e) => { const m = e.target.value; set({ repeat: { ...r, until: m === 'until' ? ymd(addMonths(parseLocal(f.start), 3)) : undefined, count: m === 'count' ? 10 : undefined } }); }}><option value="never">Never ends</option><option value="until">Ends on</option><option value="count">Ends after</option></select>
                {endMode === 'until' && <input type="date" className="fi" style={{ width: 160 }} value={r.until} onChange={(e) => set({ repeat: { ...r, until: e.target.value } })} aria-label="Until" />}
                {endMode === 'count' && <><input type="number" min="1" max="999" className="fi" style={{ width: 80 }} value={r.count} onChange={(e) => set({ repeat: { ...r, count: Math.max(1, +e.target.value || 1) } })} aria-label="Occurrences" />occurrences</>}
              </div>
            )}
            {r && <div className="muted" style={{ fontSize: 12.5 }}>{repeatSummary(r, f.start)}</div>}
          </div>
          <label>Location</label><input className="fi" placeholder="Add a location" value={f.location} onChange={(e) => set({ location: e.target.value })} aria-label="Location" />
          <label>Online link</label><input className="fi" placeholder="https://meet.example.com/..." value={f.url} onChange={(e) => set({ url: e.target.value })} aria-label="Online meeting link" />
          <label>Attendees</label><input className="fi" placeholder="Add people (comma separated)" value={att} onChange={(e) => setAtt(e.target.value)} aria-label="Attendees" />
          <label>Reminder</label><select className="fi" value={f.reminder === null ? '' : f.reminder} onChange={(e) => set({ reminder: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Reminder">{REMINDERS.map(([v, n]) => <option key={String(v)} value={v === null ? '' : v}>{n}</option>)}</select>
          <label>Show as</label><select className="fi" value={f.showAs} onChange={(e) => set({ showAs: e.target.value })} aria-label="Show as">{SHOW_AS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        </div>
        <textarea className="fi" rows={5} placeholder="Add a description" aria-label="Description" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        {att.trim() && <div className="muted" style={{ fontSize: 12 }}>Invitations aren't sent from here. Attendees are saved with the event and included when you export it.</div>}
      </div>
    </Modal>
  );
}

/* ---------- main ---------- */
export default function CalendarApp() {
  const [data, setData, meta] = useStore('calendar', blankData, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const { settings: S } = data; const ws = S.weekStart;
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [mini, setMini] = useState(() => startOfMonth(new Date()));
  const [view, setViewS] = useState(S.view || 'week');
  const setView = (v) => { setViewS(v); setData((d) => ({ ...d, settings: { ...d.settings, view: v } })); };
  const [pop, setPop] = useState(null); // {kind:'detail'|'quick', ...}
  const [editor, setEditor] = useState(null); const [scope, setScope] = useState(null);
  const [selKey, setSelKey] = useState(null); const [modal, setModal] = useState(null); const [side, setSide] = useState(false);
  const [q, setQ] = useState(''); const searchRef = useRef(null);
  const hist = useRef([]);
  const mut = useCallback((fn) => { hist.current.push(meta.ref.current); if (hist.current.length > 40) hist.current.shift(); setData(fn); }, [meta.ref, setData]);
  const undo = () => { const p = hist.current.pop(); if (p) setData(() => p); };

  const go = (d) => { setDate(startOfDay(d)); setMini(startOfMonth(d)); };
  const step = (dir) => { if (view === 'day') go(addDays(date, dir)); else if (view === 'month') go(addMonths(date, dir)); else if (view === 'agenda') go(addDays(date, 30 * dir)); else go(addDays(date, 7 * dir)); };

  const days = useMemo(() => {
    if (view === 'day') return [date];
    const w0 = startOfWeek(date, ws); const all = Array.from({ length: 7 }, (_, i) => addDays(w0, i));
    return view === 'workweek' ? all.filter((d) => S.workDays.includes(d.getDay())) : all;
  }, [view, date, ws, S.workDays]);
  const range = useMemo(() => {
    if (view === 'month') { const f = startOfWeek(startOfMonth(date), ws); const rows = Math.ceil((diffDays(f, new Date(date.getFullYear(), date.getMonth() + 1, 0)) + 1) / 7); return [f, addDays(f, rows * 7)]; }
    if (view === 'agenda') return [date, addDays(date, 30)];
    return [days[0], addDays(days[days.length - 1], 1)];
  }, [view, date, ws, days]);
  const holidayEvents = useMemo(() => { if (S.holidays === 'none' || data.holidaysHidden) return []; const ys = new Set([range[0].getFullYear(), range[1].getFullYear(), mini.getFullYear()]); return [...ys].flatMap((y) => holidaysFor(S.holidays, y)); }, [S.holidays, range, mini, data.holidaysHidden]);
  const occs = useMemo(() => rangeOccurrences(data, range[0], range[1], holidayEvents), [data, range, holidayEvents]);
  const miniFrom = startOfWeek(startOfMonth(mini), ws); const miniTo = addDays(miniFrom, 42);
  const dots = useMemo(() => { const set = new Set(); rangeOccurrences(data, miniFrom, miniTo, holidayEvents).forEach((o) => { for (let d = startOfDay(o.start); d < o.endExcl && d < miniTo; d = addDays(d, 1)) set.add(ymd(d)); }); return set; }, [data, mini, holidayEvents]); // eslint-disable-line react-hooks/exhaustive-deps
  const calOf = (id) => data.cals.find((c) => c.id === id);
  const colorOf = (o) => (o.holiday ? '#8764b8' : o.color || (calOf(o.calId) || { color: '#C8381F' }).color);

  /* ---- actions ---- */
  const askScope = (verb) => new Promise((res) => setScope({ verb, res }));
  const saveEvent = async (ev, orig, occDate) => {
    const exists = data.events.some((e) => e.id === ev.id);
    if (!exists) { mut((d) => ({ ...d, events: [...d.events, ev] })); toast('Event created'); setEditor(null); return; }
    if (orig.repeat) {
      const sc = await askScope('Edit'); if (!sc) return;
      const { id, over, created, ...changes } = ev; void id; void over; void created;
      mut((d) => ({ ...d, events: applyChange(d.events, orig, occDate, sc, changes) }));
    } else mut((d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? { ...e, ...ev } : e)) }));
    setEditor(null); toast('Event saved');
  };
  const deleteEvent = async (ev, occDate) => {
    let sc = 'all';
    if (ev.repeat) { sc = await askScope('Delete'); if (!sc) return; } else if (!await ask({ title: 'Delete event', message: `Delete "${ev.title || '(No title)'}"?`, okText: 'Delete', danger: true })) return;
    const prev = meta.ref.current; mut((d) => ({ ...d, events: applyDelete(d.events, ev, occDate, sc) })); setPop(null); setEditor(null); setSelKey(null);
    toast('Event deleted', { action: { label: 'Undo', onClick: () => setData(() => prev) } });
  };
  const changeOcc = async (o, ns, ne, allDay) => {
    if (!o.ev) return; const ev = o.ev;
    const ch = allDay || o.allDay ? { start: ymd(ns), end: ymd(ne) } : { start: toLocal(ns), end: toLocal(ne) };
    let sc = 'all'; if (ev.repeat) { sc = await askScope('Change'); if (!sc) return; }
    const prev = meta.ref.current; mut((d) => ({ ...d, events: applyChange(d.events, ev, o.date, sc, ch) }));
    toast('Event updated', { action: { label: 'Undo', onClick: () => setData(() => prev) } });
  };
  const moveToDay = (o, day) => { if (!o.ev) return; const dd = diffDays(startOfDay(o.start), day); if (!dd) return; changeOcc(o, addDays(o.start, dd), addDays(o.end, dd), o.allDay); };
  const openEditor = (init, isNew) => { setPop(null); setEditor({ ev: init, isNew, orig: init, date: init.start.slice(0, 10) }); };
  const openOccEditor = (o) => { const m = { ...o.ev, ...(o.ev.over && o.ev.over[o.date] ? o.ev.over[o.date] : {}) }; const start = o.allDay ? ymd(o.start) : toLocal(o.start); const end = o.allDay ? ymd(o.end) : toLocal(o.end); setPop(null); setEditor({ ev: { ...m, start, end }, isNew: false, orig: o.ev, date: o.date }); };
  const create = ({ day, startMin, endMin, x, y, dbl, allDay }) => {
    const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, startMin); const e = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, endMin);
    const calId = (data.cals.find((c) => c.show && !c.builtin) || data.cals[0]).id;
    const ev = newEvent({ calId: data.cals.find((c) => c.id === 'main') ? (data.cals.find((c) => c.show) || data.cals[0]).id : calId, allDay: !!allDay, start: allDay ? ymd(day) : toLocal(s), end: allDay ? ymd(day) : toLocal(e), reminder: S.defReminder });
    if (dbl) openEditor(ev, true); else setPop({ kind: 'quick', x, y, ev });
  };
  const openOcc = (o, e) => { setSelKey(o.key); setPop({ kind: 'detail', occ: o, x: e.clientX || 200, y: e.clientY || 200 }); };

  /* reminders */
  const fired = useRef(new Set(JSON.parse(sessionStorage.getItem('techomato:cal-fired') || '[]')));
  useEffect(() => {
    const tick = () => {
      const now = Date.now(); const from = new Date(now - 6 * 60000); const to = new Date(now + 8 * 86400000);
      rangeOccurrences(meta.ref.current, from, to).forEach((o) => {
        if (o.reminder === null || o.reminder === undefined || o.allDay) return; const t = o.start.getTime() - o.reminder * 60000;
        if (t <= now && t > now - 5 * 60000 && !fired.current.has(o.key + t)) {
          fired.current.add(o.key + t); try { sessionStorage.setItem('techomato:cal-fired', JSON.stringify([...fired.current].slice(-200))); } catch { /* ignore */ }
          const when = o.start.getTime() - now > 30000 ? `starts in ${Math.max(1, Math.round((o.start.getTime() - now) / 60000))} min` : 'is starting now';
          toast(`${o.title || '(No title)'} ${when}`, { ms: 9000 });
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification(o.title || 'Event', { body: `${fmtT(o.start, S.h12)}${o.location ? ' · ' + o.location : ''}` }); } catch { /* ignore */ }
          beep();
        }
      });
    };
    tick(); const id = setInterval(tick, 20000); return () => clearInterval(id);
  }, [meta.ref, toast, S.h12]);

  /* keyboard */
  useEffect(() => {
    const k = (e) => {
      const t = e.target; const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
      if (e.key === 'Escape') { if (pop) setPop(null); else if (q) setQ(''); return; }
      if (typing || editor || modal || scope || e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && !editor) { e.preventDefault(); undo(); } return; }
      if (e.key === 't') go(new Date()); else if (e.key === 'n') openEditor(newEvent({ calId: data.cals[0].id, reminder: S.defReminder }), true);
      else if ('12345'.includes(e.key) && e.key) setView(['day', 'workweek', 'week', 'month', 'agenda'][+e.key - 1]);
      else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
      else if (e.key === '/') { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
      else if (e.key === 'Delete' && selKey) { const o = occs.find((x) => x.key === selKey); if (o && o.ev) deleteEvent(o.ev, o.date); }
      else if (e.key === '?') setModal({ kind: 'keys' });
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  /* search */
  const results = useMemo(() => {
    const s = q.trim().toLowerCase(); if (!s) return [];
    return data.events.filter((e) => (e.title + ' ' + e.location + ' ' + e.notes + ' ' + (e.attendees || []).join(' ')).toLowerCase().includes(s)).sort((a, b) => (a.start < b.start ? 1 : -1)).slice(0, 12);
  }, [q, data.events]);

  /* calendars */
  const addCal = async () => { const name = await ask({ kind: 'prompt', title: 'New calendar', placeholder: 'Calendar name', okText: 'Create' }); if (name && name.trim()) mut((d) => ({ ...d, cals: [...d.cals, { id: uid(), name: name.trim(), color: CAL_COLORS[d.cals.length % CAL_COLORS.length], show: true }] })); };
  const calMenu = (c, e) => showCtx(e, [
    { label: 'Show only this calendar', icon: 'eye', onClick: () => mut((d) => ({ ...d, cals: d.cals.map((x) => ({ ...x, show: x.id === c.id })) })) },
    { label: 'Rename', icon: 'edit', onClick: async () => { const n = await ask({ kind: 'prompt', title: 'Rename calendar', value: c.name }); if (n && n.trim()) mut((d) => ({ ...d, cals: d.cals.map((x) => (x.id === c.id ? { ...x, name: n.trim() } : x)) })); } },
    { label: 'Change colour...', icon: 'palette', onClick: () => setModal({ kind: 'color', id: c.id }) },
    { label: 'Export as .ics', icon: 'download', onClick: () => download(`${c.name}.ics`, toIcs(data.events.filter((x) => x.calId === c.id), c.name), 'text/calendar') },
    ...(c.builtin ? [] : [{ sep: true }, { label: 'Delete calendar', icon: 'trash', danger: true, onClick: async () => { const n = data.events.filter((x) => x.calId === c.id).length; if (await ask({ title: `Delete "${c.name}"?`, message: n ? `Its ${n} event${n === 1 ? '' : 's'} will be deleted too.` : '', okText: 'Delete', danger: true })) mut((d) => ({ ...d, cals: d.cals.filter((x) => x.id !== c.id), events: d.events.filter((x) => x.calId !== c.id) })); } }]),
  ]);
  const importIcs = async () => {
    const f = await pickFile('.ics,text/calendar'); if (!f) return;
    try { const evs = fromIcs(await readAsText(f), data.cals[0].id); if (!evs.length) return toast('No events found in that file'); mut((d) => ({ ...d, events: [...d.events, ...evs] })); toast(`Imported ${evs.length} event${evs.length === 1 ? '' : 's'}`); if (evs[0]) go(parseLocal(evs[0].start)); } catch { toast('Could not read that file'); }
  };
  const exportIcs = () => download('techomato-calendar.ics', toIcs(data.events), 'text/calendar');

  const title = view === 'day' ? date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : view === 'month' ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}` : view === 'agenda' ? `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(date, 29).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : (() => { const a = days[0]; const b = days[days.length - 1]; return a.getMonth() === b.getMonth() ? `${MONTHS[a.getMonth()]} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}` : `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`; })();
  const ppm = S.density / 60;
  const moreFor = (d, e) => { const dayStart = startOfDay(d); const list = occs.filter((o) => o.start < addDays(dayStart, 1) && o.endExcl > dayStart); showCtx(e, list.map((o) => ({ label: `${o.allDay ? 'All day' : fmtT(o.start, S.h12)}  ${o.title || '(No title)'}`, icon: 'calendarIco', onClick: () => openOcc(o, { clientX: e.clientX, clientY: e.clientY }) }))); };

  return (
    <div className="fx cal" style={{ '--brand': '#C8381F' }}>
      <AppBar id="calendar" name="Techomato Calendar" status={meta.status} backup={{ name: 'calendar', get: () => meta.ref.current, set: (v) => setData(() => migrate(v)), blank: blankData }}
        center={<div className="cal-sw"><label className="fx-search"><input ref={searchRef} type="search" placeholder="Search events" aria-label="Search events" value={q} onChange={(e) => setQ(e.target.value)} /><Icon name="search" size={15} /></label>
          {q.trim() && <div className="fx-pop cal-results" style={{ left: 0, right: 0 }}>{results.length === 0 ? <div className="fx-note">No matching events.</div> : results.map((ev) => <button key={ev.id} className="fx-row" onClick={() => { go(parseLocal(ev.start)); setQ(''); setView(view === 'month' ? 'month' : 'week'); }}><i className="cal-dotc" style={{ background: ev.color || (calOf(ev.calId) || {}).color }} /><span className="grow ellip">{ev.title || '(No title)'}</span><kbd>{parseLocal(ev.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</kbd></button>)}</div>}</div>}
        right={<><button className="fx-bar-btn cal-burger" aria-label="Toggle calendar list" onClick={() => setSide((s) => !s)}><Icon name="menu" size={18} /></button><button className="fx-bar-btn" aria-label="Settings" title="Settings" onClick={() => setModal({ kind: 'settings' })}><Icon name="settings" size={17} /></button></>}
        extraMenu={[{ label: 'Import .ics file...', onClick: importIcs }, { label: 'Export all events (.ics)', onClick: exportIcs }, { label: 'Print', onClick: () => window.print() }]} />
      <div className="cal-body-wrap">
        <aside className={'cal-side' + (side ? ' open' : '')}>
          <button className="fb pri lg block" onClick={() => openEditor(newEvent({ calId: data.cals[0].id, reminder: S.defReminder, start: toLocal(new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.max(new Date().getHours() + 1, 8))), end: toLocal(new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.max(new Date().getHours() + 1, 8), S.defLen)) }), true)}><Icon name="plus" size={16} />New event</button>
          <MiniMonth month={mini} setMonth={setMini} date={date} onPick={(d) => { go(d); setSide(false); }} weekStart={ws} weekNums={S.weekNums} dots={dots} rangeStart={range[0]} rangeEnd={view === 'month' || view === 'agenda' ? range[0] : range[1]} />
          <div className="cal-cals">
            <div className="fx-head" style={{ padding: '4px 6px' }}>My calendars</div>
            {data.cals.map((c) => (
              <div key={c.id} className="cal-calrow" onContextMenu={(e) => calMenu(c, e)}>
                <label className="chk"><input type="checkbox" checked={c.show} onChange={() => mut((d) => ({ ...d, cals: d.cals.map((x) => (x.id === c.id ? { ...x, show: !x.show } : x)) }))} style={{ accentColor: c.color }} aria-label={`Show ${c.name}`} /><span className="ellip">{c.name}</span></label>
                <button className="fb sub ico sm" aria-label={`Options for ${c.name}`} onClick={(e) => calMenu(c, e)}><Icon name="moreV" size={15} /></button>
              </div>
            ))}
            {S.holidays !== 'none' && <div className="cal-calrow"><label className="chk"><input type="checkbox" checked={!data.holidaysHidden} onChange={() => mut((d) => ({ ...d, holidaysHidden: !d.holidaysHidden }))} style={{ accentColor: '#8764b8' }} aria-label="Show holidays" /><span className="ellip">Holidays ({S.holidays})</span></label></div>}
            <button className="fb sub sm" style={{ marginTop: 4 }} onClick={addCal}><Icon name="plus" size={14} />Add calendar</button>
          </div>
        </aside>
        {side && <div className="cal-scrim" onClick={() => setSide(false)} />}
        <main className="cal-main">
          <div className="cal-tools">
            <button className="fb" onClick={() => go(new Date())}>Today</button>
            <button className="fb sub ico" aria-label="Previous" onClick={() => step(-1)}><Icon name="chevronLeft" size={17} /></button>
            <button className="fb sub ico" aria-label="Next" onClick={() => step(1)}><Icon name="chevronRight" size={17} /></button>
            <Pop trigger={({ toggle }) => <button className="fb sub cal-title" onClick={toggle} aria-label="Go to date">{title}<Icon name="chevronDown" size={14} /></button>} width={250}>{({ close }) => <div style={{ padding: 8 }}><div className="fx-head" style={{ padding: '0 0 6px' }}>Go to date</div><input type="date" className="fi" value={ymd(date)} onChange={(e) => { if (e.target.value) { go(parseYmd(e.target.value)); close(); } }} aria-label="Go to date" /></div>}</Pop>
            <span className="spacer" />
            <div className="fx-seg" role="tablist" aria-label="View">{VIEWS.map(([k, n]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{n}</button>)}</div>
          </div>
          <div className="cal-view">
            {(view === 'day' || view === 'week' || view === 'workweek') && <TimeGrid days={days} occs={occs} colorOf={colorOf} settings={S} ppm={ppm} onCreate={create} onOpen={openOcc} onChange={changeOcc} selected={selKey} scrollKey={view} />}
            {view === 'month' && <MonthGrid date={date} occs={occs} colorOf={colorOf} settings={S} onDayClick={(d, e, dbl) => create({ day: d, startMin: S.dayStart * 60, endMin: S.dayStart * 60 + S.defLen, x: e.clientX, y: e.clientY, dbl, allDay: true })} onOpen={openOcc} onMore={moreFor} onMoveDay={moveToDay} selected={selKey} />}
            {view === 'agenda' && <Agenda from={date} days={30} occs={occs} colorOf={colorOf} settings={S} onOpen={openOcc} />}
          </div>
        </main>
      </div>

      {pop && pop.kind === 'quick' && <QuickCard pop={pop} cals={data.cals} settings={S} onClose={() => setPop(null)} onMore={(ev) => openEditor(ev, true)} onSave={(ev) => { mut((d) => ({ ...d, events: [...d.events, ev] })); setPop(null); toast('Event created'); }} />}
      {pop && pop.kind === 'detail' && <DetailCard pop={pop} cals={data.cals} colorOf={colorOf} settings={S} onClose={() => setPop(null)} onEdit={() => (pop.occ.ev ? openOccEditor(pop.occ) : setPop(null))} onDelete={() => deleteEvent(pop.occ.ev, pop.occ.date)} />}
      {editor && <Editor init={editor.ev} isNew={editor.isNew} cals={data.cals} settings={S} dateKey={editor.date} onClose={() => setEditor(null)} onSave={(ev) => saveEvent(ev, editor.orig, editor.date)} onDelete={() => deleteEvent(editor.orig, editor.date)} />}
      {scope && <ScopeModal verb={scope.verb} onClose={() => { scope.res(null); setScope(null); }} onPick={(v) => { scope.res(v); setScope(null); }} />}
      {modal && modal.kind === 'settings' && <SettingsModal S={S} onChange={(p) => mut((d) => ({ ...d, settings: { ...d.settings, ...p } }))} onClose={() => setModal(null)} />}
      {modal && modal.kind === 'color' && <Modal title="Calendar colour" onClose={() => setModal(null)} width={340} footer={<button className="fb pri" onClick={() => setModal(null)}>Done</button>}><Swatches value={(calOf(modal.id) || {}).color} colors={CAL_COLORS} onChange={(c) => mut((d) => ({ ...d, cals: d.cals.map((x) => (x.id === modal.id ? { ...x, color: c } : x)) }))} /></Modal>}
      {modal && modal.kind === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setModal(null)} footer={<button className="fb pri" onClick={() => setModal(null)}>Close</button>}><dl className="td-keys">{[['T', 'Go to today'], ['1 – 5', 'Day, Work week, Week, Month, Agenda'], ['← / →', 'Previous / next period'], ['N', 'New event'], ['/', 'Search'], ['Delete', 'Delete selected event'], ['Ctrl+Z', 'Undo'], ['Esc', 'Close']].map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl></Modal>}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}

function QuickCard({ pop, cals, settings, onClose, onMore, onSave }) {
  const [ref, pos] = useFloat(pop); const [ev, setEv] = useState(pop.ev);
  useEffect(() => { const d = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener('mousedown', d, true); return () => document.removeEventListener('mousedown', d, true); }, [onClose, ref]);
  const s = parseLocal(ev.start); const e = parseLocal(ev.end);
  const label = ev.allDay ? s.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : `${s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}  ${fmtT(s, settings.h12)} – ${fmtT(e, settings.h12)}`;
  return (
    <div className="cal-float" ref={ref} style={pos} role="dialog" aria-label="Quick event">
      <input className="fi" autoFocus placeholder="Add a title" aria-label="Title" value={ev.title} onChange={(x) => setEv({ ...ev, title: x.target.value })} onKeyDown={(x) => { if (x.key === 'Enter') onSave({ ...ev, title: ev.title.trim() }); if (x.key === 'Escape') onClose(); }} />
      <div className="cal-fl-row"><Icon name="clockIco" size={15} /><span>{label}</span></div>
      <div className="cal-fl-row"><i className="cal-dotc" style={{ background: (cals.find((c) => c.id === ev.calId) || {}).color }} /><select className="fi" value={ev.calId} onChange={(x) => setEv({ ...ev, calId: x.target.value })} aria-label="Calendar">{cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="cal-fl-foot"><button className="fb sub" onClick={() => onMore({ ...ev, title: ev.title.trim() })}>More options</button><span className="spacer" /><button className="fb pri" onClick={() => onSave({ ...ev, title: ev.title.trim() })}>Save</button></div>
    </div>
  );
}
function DetailCard({ pop, cals, colorOf, settings, onClose, onEdit, onDelete }) {
  const [ref, pos] = useFloat(pop); const o = pop.occ;
  useEffect(() => { const d = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.cal-ev,.cal-bar,.cal-mev,.cal-agrow,.fx-pop,.fx-modal-back')) onClose(); }; document.addEventListener('mousedown', d, true); return () => document.removeEventListener('mousedown', d, true); }, [onClose, ref]);
  const cal = cals.find((c) => c.id === o.calId); const m = o.m || {};
  const when = o.allDay ? (sameDay(o.start, o.end) ? o.start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : `${o.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${o.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`) : sameDay(o.start, o.end) ? `${o.start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${fmtT(o.start, settings.h12)} – ${fmtT(o.end, settings.h12)}` : `${o.start.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${o.end.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  const link = m.url && /^https?:\/\//.test(m.url) ? m.url : null;
  return (
    <div className="cal-float cal-detail" ref={ref} style={{ ...pos, '--ec': colorOf(o) }} role="dialog" aria-label="Event details">
      <div className="cal-dh-bar" />
      <div className="cal-fl-title">{o.title || '(No title)'}</div>
      <div className="cal-fl-row"><Icon name="clockIco" size={15} /><span>{when}</span></div>
      {o.rec && o.ev && <div className="cal-fl-row"><Icon name="repeat" size={15} /><span>{repeatSummary(o.ev.repeat, o.ev.start)}</span></div>}
      {o.location && <div className="cal-fl-row"><Icon name="location" size={15} /><span>{o.location}</span></div>}
      {link && <div className="cal-fl-row"><Icon name="video" size={15} /><a href={link} target="_blank" rel="noreferrer noopener">Join online</a></div>}
      {m.attendees && m.attendees.length > 0 && <div className="cal-fl-row"><Icon name="users" size={15} /><span>{m.attendees.join(', ')}</span></div>}
      {o.reminder !== null && o.reminder !== undefined && !o.holiday && <div className="cal-fl-row"><Icon name="bell" size={15} /><span>{(REMINDERS.find(([v]) => v === o.reminder) || [0, o.reminder + ' min'])[1]}</span></div>}
      <div className="cal-fl-row"><i className="cal-dotc" style={{ background: colorOf(o) }} /><span>{o.holiday ? 'Holidays' : cal ? cal.name : ''}{o.showAs && o.showAs !== 'busy' ? ' · ' + (SHOW_AS.find(([k]) => k === o.showAs) || [0, ''])[1] : ''}</span></div>
      {o.notes && <div className="cal-fl-notes">{o.notes}</div>}
      {!o.holiday && <div className="cal-fl-foot"><button className="fb" onClick={onEdit}><Icon name="edit" size={15} />Edit</button><button className="fb danger" onClick={onDelete}><Icon name="trash" size={15} />Delete</button><span className="spacer" /><button className="fb sub ico" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button></div>}
    </div>
  );
}
function SettingsModal({ S, onChange, onClose }) {
  const names = weekdayNames(0, 'short');
  const hrs = Array.from({ length: 24 }, (_, h) => h);
  return (
    <Modal title="Calendar settings" onClose={onClose} width={560} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <div className="fx-kv" style={{ gridTemplateColumns: '170px 1fr' }}>
        <label>First day of week</label><select className="fi" value={S.weekStart} onChange={(e) => onChange({ weekStart: +e.target.value })}>{names.map((n, i) => <option key={i} value={i}>{new Date(2021, 7, 1 + i).toLocaleDateString(undefined, { weekday: 'long' })}</option>)}</select>
        <label>Time format</label><div className="fx-seg" style={{ width: 'fit-content' }}><button className={S.h12 ? 'on' : ''} onClick={() => onChange({ h12: true })}>12-hour</button><button className={!S.h12 ? 'on' : ''} onClick={() => onChange({ h12: false })}>24-hour</button></div>
        <label>Work days</label><div style={{ display: 'flex', gap: 3 }}>{names.map((n, i) => <button key={i} className={'fb sm' + (S.workDays.includes(i) ? ' pri' : '')} onClick={() => onChange({ workDays: S.workDays.includes(i) ? S.workDays.filter((x) => x !== i) : [...S.workDays, i].sort() })}>{n}</button>)}</div>
        <label>Work hours</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><select className="fi" style={{ width: 110 }} value={S.dayStart} onChange={(e) => onChange({ dayStart: +e.target.value })}>{hrs.map((h) => <option key={h} value={h}>{`${pad(h)}:00`}</option>)}</select>to<select className="fi" style={{ width: 110 }} value={S.dayEnd} onChange={(e) => onChange({ dayEnd: +e.target.value })}>{hrs.map((h) => <option key={h} value={h}>{`${pad(h)}:00`}</option>)}</select></div>
        <label>Default event length</label><select className="fi" value={S.defLen} onChange={(e) => onChange({ defLen: +e.target.value })}>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>
        <label>Default reminder</label><select className="fi" value={S.defReminder === null ? '' : S.defReminder} onChange={(e) => onChange({ defReminder: e.target.value === '' ? null : +e.target.value })}>{REMINDERS.map(([v, n]) => <option key={String(v)} value={v === null ? '' : v}>{n}</option>)}</select>
        <label>Row height</label><select className="fi" value={S.density} onChange={(e) => onChange({ density: +e.target.value })}><option value={36}>Compact</option><option value={48}>Normal</option><option value={64}>Comfortable</option><option value={84}>Large</option></select>
        <label>Holidays</label><select className="fi" value={S.holidays} onChange={(e) => onChange({ holidays: e.target.value })}>{HOLIDAY_REGIONS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        <span /><label className="chk"><input type="checkbox" checked={S.weekNums} onChange={(e) => onChange({ weekNums: e.target.checked })} />Show week numbers</label>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '12px 0 0' }}>Holidays that follow a lunar calendar (such as Diwali, Holi or Eid) are not included. Reminders appear while this page is open.</p>
    </Modal>
  );
}
let actx;
function beep() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); [0, 0.18].forEach((dt) => { const o = actx.createOscillator(); const g = actx.createGain(); o.connect(g); g.connect(actx.destination); o.frequency.value = 784; const t = actx.currentTime + dt; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.start(t); o.stop(t + 0.32); }); } catch { /* ignore */ } }
