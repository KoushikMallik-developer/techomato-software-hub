import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast } from '../components/fxui.jsx';
import { useStore, uid } from '../lib/useStore.js';
import { SOUNDS, playSound, askNotify, notify, hms, dayKey, LOCAL_TZ } from './clock/util.js';
import Focus from './clock/Focus.jsx';
import Timers from './clock/Timer.jsx';
import Stopwatch from './clock/Stopwatch.jsx';
import Alarms from './clock/Alarm.jsx';
import World from './clock/World.jsx';
import '../styles/clock.css';

const blankData = () => ({
  tab: 'focus', settings: { h24: false, sound: 'chimes', volume: 0.7, notif: true },
  focus: { goal: 120, session: 25, brk: 5, longBrk: 15, every: 4, auto: false, task: '', run: null, log: {} },
  timers: [], sw: { startAt: null, base: 0, laps: [] }, alarms: [], zones: [LOCAL_TZ, 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'].filter((z, i, a) => a.indexOf(z) === i), compare: 0,
});
const migrate = (v) => { const b = blankData(); return { ...b, ...v, settings: { ...b.settings, ...(v.settings || {}) }, focus: { ...b.focus, ...(v.focus || {}) }, sw: { ...b.sw, ...(v.sw || {}) } }; };
const TABS = [['focus', 'Focus sessions', 'circleCheck'], ['timer', 'Timer', 'timer'], ['stopwatch', 'Stopwatch', 'clockIco'], ['alarm', 'Alarm', 'bell'], ['world', 'World clock', 'globe']];

export default function ClockApp() {
  const [data, setData, meta] = useStore('clock', blankData, migrate);
  const [toastNode, toast] = useToast(); const [now, setNow] = useState(() => Date.now());
  const [ring, setRing] = useState([]); const [settings, setSettings] = useState(false);
  const d = useRef(data); d.current = data;
  const { tab } = data;
  const fast = tab === 'stopwatch' && data.sw.startAt !== null;
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), fast ? 40 : tab === 'world' || data.timers.some((t) => t.endAt) || data.focus.run ? 250 : 1000); return () => clearInterval(id); }, [fast, tab, data.timers, data.focus.run]);
  const upd = useCallback((fn) => setData((x) => fn(x)), [setData]);
  const pushRing = useCallback((r) => setRing((l) => [...l, { id: uid(), ...r }]), []);

  /* ---- focus ---- */
  const logFocus = (x, min, session) => { const k = dayKey(); const e = x.focus.log[k] || { min: 0, sessions: 0 }; return { ...x.focus.log, [k]: { min: e.min + min, sessions: e.sessions + (session ? 1 : 0) } }; };
  const endPhase = useCallback((manual) => {
    const t = Date.now();
    upd((x) => {
      const f = x.focus; const run = f.run; if (!run) return x;
      let log = f.log; let idx = run.idx;
      if (run.phase === 'focus') { const left = run.endAt ? Math.max(0, run.endAt - t) : run.left; const el = run.total - left; const min = manual ? Math.floor(el / 60000) : Math.round(run.total / 60000); log = logFocus(x, min, !manual || min >= 1); idx = run.idx + 1; }
      const next = run.phase === 'focus' ? (idx % f.every === 0 ? 'long' : 'break') : 'focus';
      const total = (next === 'focus' ? f.session : next === 'long' ? f.longBrk : f.brk) * 60000;
      const auto = f.auto && !manual;
      return { ...x, focus: { ...f, log, run: { phase: next, total, idx, endAt: auto ? t + total : null, left: auto ? null : total } } };
    });
    if (!manual) { const r = d.current.focus.run; const nextBreak = r && r.phase === 'focus'; const title = nextBreak ? 'Focus session complete' : 'Break is over'; notify(title, nextBreak ? 'Time for a break.' : 'Ready for the next session?'); if (!d.current.focus.auto) pushRing({ kind: 'focus', title, sub: nextBreak ? 'Nice work. Take a break.' : 'Ready for the next focus session?', cta: nextBreak ? 'Start break' : 'Start focus' }); else { playSound(d.current.settings.sound, d.current.settings.volume); toast(title); } }
  }, [upd, pushRing, toast]);
  const a = useMemo(() => ({
    toast,
    focusStart: () => { askNotify(); upd((x) => { const total = x.focus.session * 60000; return { ...x, focus: { ...x.focus, run: { phase: 'focus', total, idx: 0, endAt: Date.now() + total, left: null } } }; }); },
    focusPause: () => upd((x) => { const r = x.focus.run; return { ...x, focus: { ...x.focus, run: { ...r, left: Math.max(0, r.endAt - Date.now()), endAt: null } } }; }),
    focusResume: () => upd((x) => { const r = x.focus.run; return { ...x, focus: { ...x.focus, run: { ...r, endAt: Date.now() + r.left, left: null } } }; }),
    focusSkip: () => endPhase(true),
    focusStop: () => upd((x) => ({ ...x, focus: { ...x.focus, run: null } })),
    clearFocusLog: () => upd((x) => ({ ...x, focus: { ...x.focus, log: {} } })),
    /* timers */
    timerCreate: (v, start) => { if (start) askNotify(); upd((x) => ({ ...x, tab: 'timer', timers: [...x.timers, { id: uid(), name: v.name, total: v.total, left: v.total, endAt: start ? Date.now() + v.total : null }] })); },
    timerUpdate: (id, v) => upd((x) => ({ ...x, timers: x.timers.map((t) => (t.id === id ? { ...t, ...v, left: v.total, endAt: null } : t)) })),
    timerDelete: (id) => upd((x) => ({ ...x, timers: x.timers.filter((t) => t.id !== id) })),
    timerStart: (id) => { askNotify(); upd((x) => ({ ...x, timers: x.timers.map((t) => { if (t.id !== id) return t; const left = (t.endAt ? t.endAt - Date.now() : t.left) <= 0 ? t.total : t.left; return { ...t, left, endAt: Date.now() + left }; }) })); },
    timerPause: (id) => upd((x) => ({ ...x, timers: x.timers.map((t) => (t.id === id && t.endAt ? { ...t, left: Math.max(0, t.endAt - Date.now()), endAt: null } : t)) })),
    timerReset: (id) => upd((x) => ({ ...x, timers: x.timers.map((t) => (t.id === id ? { ...t, left: t.total, endAt: null } : t)) })),
    timerAdd: (id, ms) => upd((x) => ({ ...x, timers: x.timers.map((t) => (t.id === id ? { ...t, total: t.total + ms, left: t.endAt ? t.left : t.left + ms, endAt: t.endAt ? t.endAt + ms : null } : t)) })),
    /* stopwatch */
    swToggle: () => upd((x) => { const s = x.sw; return { ...x, sw: s.startAt === null ? { ...s, startAt: Date.now() } : { ...s, base: s.base + (Date.now() - s.startAt), startAt: null } }; }),
    swLap: () => upd((x) => { const s = x.sw; if (s.startAt === null) return x; const el = s.base + (Date.now() - s.startAt); return { ...x, sw: { ...s, laps: [el, ...s.laps] } }; }),
    swReset: () => upd((x) => ({ ...x, sw: { startAt: null, base: 0, laps: [] } })),
    /* alarms */
    alarmToggle: (id) => { askNotify(); upd((x) => ({ ...x, alarms: x.alarms.map((al) => (al.id === id ? { ...al, on: !al.on, snoozeUntil: 0, last: '' } : al)) })); },
    alarmSave: (id, v) => { askNotify(); upd((x) => ({ ...x, alarms: id ? x.alarms.map((al) => (al.id === id ? { ...al, ...v, on: true, last: '', snoozeUntil: 0 } : al)) : [...x.alarms, { id: uid(), on: true, last: '', snoozeUntil: 0, ...v }] })); },
    alarmDelete: (id) => upd((x) => ({ ...x, alarms: x.alarms.filter((al) => al.id !== id) })),
    setCompare: (v) => upd((x) => ({ ...x, compare: v })),
  }), [upd, endPhase, toast]);

  /* ---- global tick: timers, focus, alarms ---- */
  useEffect(() => {
    const x = d.current; const t = Date.now();
    const done = x.timers.filter((tm) => tm.endAt && tm.endAt <= t);
    if (done.length) {
      upd((y) => ({ ...y, timers: y.timers.map((tm) => (tm.endAt && tm.endAt <= t ? { ...tm, endAt: null, left: 0 } : tm)) }));
      done.forEach((tm) => { notify("Time's up", tm.name || 'Your timer has finished'); pushRing({ kind: 'timer', refId: tm.id, title: tm.name || 'Timer', sub: "Time's up" }); });
    }
    const run = x.focus.run; if (run && run.endAt && run.endAt <= t) endPhase(false);
    const dt = new Date(t);
    x.alarms.forEach((al) => {
      if (!al.on) return;
      if (al.snoozeUntil) { if (t >= al.snoozeUntil) { upd((y) => ({ ...y, alarms: y.alarms.map((q) => (q.id === al.id ? { ...q, snoozeUntil: 0, on: q.days.length ? true : false } : q)) })); notify(al.name || 'Alarm', 'Snooze is over'); pushRing({ kind: 'alarm', refId: al.id, title: al.name || 'Alarm', sub: 'Snooze is over', sound: al.sound, snooze: al.snooze }); } return; }
      const at = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), al.h, al.m, 0).getTime(); const key = dayKey(dt) + ' ' + al.h + ':' + al.m;
      if (t >= at && t < at + 120000 && al.last !== key && (!al.days.length || al.days.includes(dt.getDay()))) {
        upd((y) => ({ ...y, alarms: y.alarms.map((q) => (q.id === al.id ? { ...q, last: key, on: q.days.length ? true : false } : q)) }));
        notify(al.name || 'Alarm', `${String(al.h).padStart(2, '0')}:${String(al.m).padStart(2, '0')}`); pushRing({ kind: 'alarm', refId: al.id, title: al.name || 'Alarm', sub: new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), sound: al.sound, snooze: al.snooze });
      }
    });
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ring sound loop */
  useEffect(() => {
    if (!ring.length) return undefined; const r = ring[0]; const snd = r.sound || data.settings.sound; const vol = data.settings.volume;
    playSound(snd, vol); let n = 0; const id = setInterval(() => { if (++n > 30) return clearInterval(id); playSound(snd, vol); }, 2600); return () => clearInterval(id);
  }, [ring.length > 0 ? ring[0].id : null]); // eslint-disable-line react-hooks/exhaustive-deps
  const dismiss = (id) => setRing((l) => l.filter((r) => r.id !== id));

  /* title */
  useEffect(() => {
    const orig = document.title; const run = data.focus.run; const tm = data.timers.find((q) => q.endAt);
    if (run && run.endAt) document.title = `${hms(run.endAt - now)} · ${run.phase === 'focus' ? 'Focus' : 'Break'}`; else if (tm) document.title = `${hms(tm.endAt - now)} · Timer`; else document.title = orig;
    return () => { document.title = orig; };
  }, [now, data.focus.run, data.timers]);

  const badge = (id) => (id === 'timer' ? data.timers.filter((t) => t.endAt).length : id === 'alarm' ? data.alarms.filter((q) => q.on).length : id === 'focus' ? (data.focus.run && data.focus.run.endAt ? 1 : 0) : id === 'stopwatch' ? (data.sw.startAt !== null ? 1 : 0) : 0);
  const props = { data, setData: upd, now, a };
  const rg = ring[0];
  return (
    <div className="fx clk" style={{ '--brand': '#6b4fd8' }}>
      <AppBar id="clock" name="Techomato Clock" status={meta.status} backup={{ name: 'clock', get: () => meta.ref.current, set: (v) => setData(() => migrate(v)), blank: blankData }}
        right={<button className="fx-bar-btn" aria-label="Clock settings" title="Settings" onClick={() => setSettings(true)}><Icon name="settings" size={17} /></button>} />
      <div className="clk-wrap">
        <nav className="clk-nav" aria-label="Clock sections">
          {TABS.map(([id, name, ic]) => <button key={id} className={'clk-ni' + (tab === id ? ' on' : '')} onClick={() => upd((x) => ({ ...x, tab: id }))} aria-current={tab === id ? 'page' : undefined}><Icon name={ic} size={20} /><span>{name}</span>{badge(id) > 0 && <i className="clk-dot" aria-label="active" />}</button>)}
        </nav>
        <main className="clk-main">
          <h1 className="clk-h1">{TABS.find((t) => t[0] === tab)[1]}</h1>
          {tab === 'focus' && <Focus {...props} />}
          {tab === 'timer' && <Timers {...props} />}
          {tab === 'stopwatch' && <Stopwatch {...props} />}
          {tab === 'alarm' && <Alarms {...props} />}
          {tab === 'world' && <World {...props} />}
        </main>
      </div>
      {rg && (
        <div className="clk-ring-dlg" role="alertdialog" aria-label={rg.title} aria-modal="true">
          <div className="clk-ring-card">
            <div className="clk-ring-ic"><Icon name={rg.kind === 'alarm' ? 'bell' : rg.kind === 'timer' ? 'timer' : 'circleCheck'} size={34} /></div>
            <h2>{rg.title}</h2><p>{rg.sub}</p>
            <div className="clk-btns">
              {rg.kind === 'alarm' && <button className="fb lg" onClick={() => { upd((x) => ({ ...x, alarms: x.alarms.map((q) => (q.id === rg.refId ? { ...q, on: true, snoozeUntil: Date.now() + rg.snooze * 60000 } : q)) })); dismiss(rg.id); toast(`Snoozed for ${rg.snooze} minutes`); }}>Snooze {rg.snooze} min</button>}
              {rg.kind === 'timer' && <button className="fb lg" onClick={() => { a.timerAdd(rg.refId, 60000); a.timerStart(rg.refId); dismiss(rg.id); }}>+1 min</button>}
              {rg.kind === 'focus' && <button className="fb pri lg" onClick={() => { a.focusResume(); dismiss(rg.id); }}>{rg.cta}</button>}
              <button className={'fb lg' + (rg.kind === 'focus' ? '' : ' pri')} onClick={() => { dismiss(rg.id); if (rg.kind === 'focus') a.focusStop(); }}>{rg.kind === 'focus' ? 'Stop' : 'Dismiss'}</button>
            </div>
            {ring.length > 1 && <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>{ring.length - 1} more waiting</div>}
          </div>
        </div>
      )}
      {settings && (
        <Modal title="Clock settings" onClose={() => setSettings(false)} width={440} footer={<button className="fb pri" onClick={() => setSettings(false)}>Done</button>}>
          <div className="fx-kv">
            <label>Time format</label><div className="fx-seg" style={{ width: 'fit-content' }}><button className={!data.settings.h24 ? 'on' : ''} onClick={() => upd((x) => ({ ...x, settings: { ...x.settings, h24: false } }))}>12-hour</button><button className={data.settings.h24 ? 'on' : ''} onClick={() => upd((x) => ({ ...x, settings: { ...x.settings, h24: true } }))}>24-hour</button></div>
            <label>Default sound</label><div style={{ display: 'flex', gap: 6 }}><select className="fi" aria-label="Default sound" value={data.settings.sound} onChange={(e) => upd((x) => ({ ...x, settings: { ...x.settings, sound: e.target.value } }))}>{SOUNDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select><button className="fb sub ico" aria-label="Preview" onClick={() => playSound(data.settings.sound, data.settings.volume)}><Icon name="speaker" size={16} /></button></div>
            <label>Volume</label><input type="range" min="0.1" max="1" step="0.05" value={data.settings.volume} aria-label="Volume" onChange={(e) => upd((x) => ({ ...x, settings: { ...x.settings, volume: +e.target.value } }))} style={{ accentColor: 'var(--brand)' }} />
            <label>Notifications</label><div><button className="fb sm" onClick={() => askNotify().then(() => toast('Notification permission: ' + (window.Notification ? Notification.permission : 'unsupported')))}>Allow desktop notifications</button></div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Alarms, timers and focus sessions run in your browser. Keep this tab open (it can stay in the background) for them to go off on time.</p>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
