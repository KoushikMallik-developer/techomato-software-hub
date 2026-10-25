import { useMemo } from 'react';
import Icon from '../../components/Icon.jsx';
import { Ring } from './Ring.jsx';
import { hms, dayKey, DOW } from './util.js';

export function streakOf(log, goal) { let n = 0; const d = new Date(); const day = (x) => (log[dayKey(x)] || { min: 0 }).min; if (day(d) < goal) d.setDate(d.getDate() - 1); while (day(d) >= goal && goal > 0) { n++; d.setDate(d.getDate() - 1); } return n; }
const PHASE = { focus: 'Focus', break: 'Short break', long: 'Long break' };
const Step = ({ label, value, min, max, step = 5, unit = 'min', onChange }) => (
  <div className="clk-step"><span>{label}</span><div><button className="fb sub ico sm" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}><Icon name="minus" size={14} /></button><b>{value} {unit}</b><button className="fb sub ico sm" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + step))}><Icon name="plus" size={14} /></button></div></div>
);

export default function Focus({ data, setData, now, a }) {
  const f = data.focus; const run = f.run; const running = run && run.endAt !== null;
  const left = run ? (running ? Math.max(0, run.endAt - now) : run.left) : f.session * 60000;
  const total = run ? run.total : f.session * 60000;
  const set = (p) => setData((d) => ({ ...d, focus: { ...d.focus, ...p } }));
  const today = (f.log[dayKey()] || { min: 0, sessions: 0 });
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const e = f.log[dayKey(d)] || { min: 0 }; return { k: dayKey(d), dow: DOW[d.getDay()], min: e.min, today: i === 6 }; }), [f.log, now > 0 && dayKey()]);
  const max = Math.max(f.goal, ...week.map((x) => x.min), 1);
  const streak = streakOf(f.log, f.goal);
  const phase = run ? run.phase : 'focus';
  const dots = f.every;
  const done = run ? run.idx % f.every : 0;
  return (
    <div className="clk-focus">
      <section className="clk-fmain">
        <div className="clk-phase" aria-live="polite">{PHASE[phase]}{run && phase === 'focus' ? ` · session ${done + 1} of ${f.every}` : ''}</div>
        <Ring size={280} stroke={12} progress={run ? 1 - left / total : 0} color={phase === 'focus' ? 'var(--brand)' : 'var(--ok)'}>
          <div className="clk-big" data-testid="focus-time">{hms(left)}</div>
          <div className="clk-sub">{running ? 'Stay with it' : run ? 'Paused' : 'Ready when you are'}</div>
        </Ring>
        <input className="fi clk-task" placeholder="What will you focus on?" aria-label="Focus task" value={f.task} onChange={(e) => set({ task: e.target.value })} maxLength={100} />
        <div className="clk-btns">
          {!run && <button className="fb pri lg" onClick={() => a.focusStart()}><Icon name="play" size={16} />Start focus session</button>}
          {run && running && <button className="fb pri lg" onClick={() => a.focusPause()}><Icon name="pause" size={16} />Pause</button>}
          {run && !running && <button className="fb pri lg" onClick={() => a.focusResume()}><Icon name="play" size={16} />Resume</button>}
          {run && <button className="fb lg" onClick={() => a.focusSkip()} title="Finish this phase now">{phase === 'focus' ? 'Finish early' : 'Skip break'}</button>}
          {run && <button className="fb sub lg" onClick={() => a.focusStop()}><Icon name="stop" size={14} />Stop</button>}
        </div>
        <div className="clk-dots" aria-label={`${done} of ${dots} sessions done in this cycle`}>{Array.from({ length: dots }, (_, i) => <i key={i} className={i < done ? 'on' : ''} />)}</div>
      </section>
      <aside className="clk-fside">
        <div className="clk-card">
          <div className="clk-ch"><b>Daily progress</b><span className="muted">{today.min} / {f.goal} min</span></div>
          <div className="clk-bar" role="progressbar" aria-valuenow={today.min} aria-valuemin="0" aria-valuemax={f.goal} aria-label="Daily goal"><i style={{ width: Math.min(100, (today.min / f.goal) * 100) + '%' }} /></div>
          <div className="clk-stats"><div><b>{today.sessions || 0}</b><span>sessions today</span></div><div><b><Icon name="fire" size={15} /> {streak}</b><span>day streak</span></div><div><b>{week.reduce((s, x) => s + x.min, 0)}</b><span>min this week</span></div></div>
          <div className="clk-week" aria-label="Last 7 days">{week.map((x) => <div key={x.k} className={x.today ? 'today' : ''} title={`${x.min} min`}><i style={{ height: Math.max(3, (x.min / max) * 70) }} className={x.min >= f.goal ? 'goal' : ''} /><span>{x.dow[0]}</span></div>)}<u style={{ bottom: 18 + (f.goal / max) * 70 }} /></div>
        </div>
        <div className="clk-card">
          <div className="clk-ch"><b>Session settings</b></div>
          <Step label="Daily goal" value={f.goal} min={15} max={600} step={15} onChange={(v) => set({ goal: v })} />
          <Step label="Focus length" value={f.session} min={5} max={180} onChange={(v) => set({ session: v })} />
          <Step label="Short break" value={f.brk} min={1} max={30} step={1} onChange={(v) => set({ brk: v })} />
          <Step label="Long break" value={f.longBrk} min={5} max={60} onChange={(v) => set({ longBrk: v })} />
          <Step label="Sessions before long break" value={f.every} min={2} max={8} step={1} unit="" onChange={(v) => set({ every: v })} />
          <label className="chk" style={{ marginTop: 6 }}><input type="checkbox" checked={f.auto} onChange={(e) => set({ auto: e.target.checked })} />Start the next phase automatically</label>
          <div className="clk-presets">{[[25, 5], [50, 10], [90, 20]].map(([s, b]) => <button key={s} className={'fx-chip' + (f.session === s && f.brk === b ? ' on' : '')} onClick={() => set({ session: s, brk: b })}>{s} / {b}</button>)}</div>
          {Object.keys(f.log).length > 0 && <button className="fb sub sm" style={{ marginTop: 8 }} onClick={() => a.clearFocusLog()}>Clear focus history</button>}
        </div>
      </aside>
    </div>
  );
}
