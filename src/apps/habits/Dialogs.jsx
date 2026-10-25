import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Modal, Swatches } from '../../components/fxui.jsx';
import { weekdayNames } from '../../lib/cal.js';
import { COLORS, EMOJI, CATEGORIES, PARTS, KINDS, SCHEDULES, IDEAS, scheduleLabel, goalLabel } from './model.js';

export function HabitDialog({ habit, isNew, onSave, onClose, onDelete }) {
  const [h, setH] = useState(habit);
  const up = (o) => setH((x) => ({ ...x, ...o }));
  const upS = (o) => setH((x) => ({ ...x, schedule: { ...x.schedule, ...o } }));
  const names = weekdayNames(0, 'short');
  const s = h.schedule;
  const valid = h.name.trim() && (h.kind === 'check' || h.limit || h.goal > 0) && (!h.end || h.end >= h.start) && (s.type !== 'days' || s.days.length > 0);
  const save = () => {
    const goal = h.kind === 'check' ? 1 : Math.max(h.limit ? 0 : 1, Number(h.goal) || 0);
    onSave({ ...h, name: h.name.trim(), goal, limit: h.kind === 'check' ? false : h.limit, unit: h.kind === 'time' && !h.unit ? 'min' : h.unit });
  };
  return (
    <Modal title={isNew ? 'New habit' : 'Edit habit'} onClose={onClose} width={560}
      footer={<>
        {!isNew && <button className="fb danger" onClick={onDelete}><Icon name="trash" size={15} />Delete</button>}
        <span className="spacer" />
        <button className="fb" onClick={onClose}>Cancel</button>
        <button className="fb pri" disabled={!valid} onClick={save}>Save</button>
      </>}>
      <div className="hab-form">
        <div className="hab-f-top">
          <span className="hab-tile big" style={{ background: h.color }} aria-hidden="true">{h.icon}</span>
          <input className="fi hab-name" autoFocus placeholder="Habit name, e.g. Drink water" aria-label="Habit name" value={h.name} maxLength={60} onChange={(e) => up({ name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && valid) save(); }} />
        </div>
        <fieldset className="hab-fs"><legend>Icon</legend>
          <div className="hab-emojis">{EMOJI.map((e) => <button key={e} type="button" className={'hab-em' + (h.icon === e ? ' on' : '')} aria-label={`Icon ${e}`} aria-pressed={h.icon === e} onClick={() => up({ icon: e })}>{e}</button>)}</div>
        </fieldset>
        <fieldset className="hab-fs"><legend>Colour</legend><Swatches value={h.color} onChange={(c) => up({ color: c })} colors={COLORS} /></fieldset>
        <div className="hab-row2">
          <label className="hab-l">Category<select className="fi" value={h.category} onChange={(e) => up({ category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="hab-l">Time of day<select className="fi" value={h.part} onChange={(e) => up({ part: e.target.value })}>{PARTS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        </div>
        <fieldset className="hab-fs"><legend>How do you track it?</legend>
          <div className="hab-kinds" role="radiogroup" aria-label="Tracking type">
            {KINDS.map(([k, n, d]) => <button key={k} type="button" role="radio" aria-checked={h.kind === k} className={'hab-kind' + (h.kind === k ? ' on' : '')} onClick={() => up({ kind: k, goal: k === 'check' ? 1 : (h.kind === 'check' ? (k === 'time' ? 15 : 5) : h.goal), unit: k === 'time' ? 'min' : (h.kind === 'time' ? '' : h.unit) })}><b>{n}</b><span>{d}</span></button>)}
          </div>
          {h.kind !== 'check' && (
            <div className="hab-row2" style={{ marginTop: 10 }}>
              <label className="hab-l">{h.limit ? 'Stay at or below' : 'Daily goal'}<input type="number" min={h.limit ? 0 : 1} className="fi" aria-label="Goal" value={h.goal} onChange={(e) => up({ goal: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} /></label>
              <label className="hab-l">Unit<input className="fi" aria-label="Unit" placeholder={h.kind === 'time' ? 'min' : 'glasses, pages, steps…'} value={h.unit} maxLength={14} onChange={(e) => up({ unit: e.target.value })} /></label>
              <label className="hab-chk"><input type="checkbox" className="chk" checked={h.limit} onChange={(e) => up({ limit: e.target.checked })} />This is a limit (a good day stays at or below the goal)</label>
            </div>
          )}
        </fieldset>
        <fieldset className="hab-fs"><legend>Repeat</legend>
          <div className="hab-row2">
            <label className="hab-l">Frequency<select className="fi" aria-label="Frequency" value={s.type} onChange={(e) => upS({ type: e.target.value })}>{SCHEDULES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            {s.type === 'week' && <label className="hab-l">Times per week<input type="number" min="1" max="7" className="fi" aria-label="Times per week" value={s.times} onChange={(e) => upS({ times: Math.min(7, Math.max(1, Number(e.target.value) || 1)) })} /></label>}
            {s.type === 'interval' && <label className="hab-l">Every (days)<input type="number" min="1" max="60" className="fi" aria-label="Every N days" value={s.every} onChange={(e) => upS({ every: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })} /></label>}
          </div>
          {s.type === 'days' && (
            <div className="hab-days" role="group" aria-label="Days of the week">
              {names.map((n, i) => <button key={i} type="button" className={'hab-day' + (s.days.includes(i) ? ' on' : '')} aria-pressed={s.days.includes(i)} aria-label={n} onClick={() => { const d = new Set(s.days); d.has(i) ? d.delete(i) : d.add(i); upS({ days: [...d].sort() }); }}>{n.slice(0, 2)}</button>)}
            </div>
          )}
        </fieldset>
        <div className="hab-row2">
          <label className="hab-l">Start date<input type="date" className="fi" aria-label="Start date" value={h.start} onChange={(e) => e.target.value && up({ start: e.target.value })} /></label>
          <label className="hab-l">End date (optional)<input type="date" className="fi" aria-label="End date" value={h.end || ''} onChange={(e) => up({ end: e.target.value || null })} /></label>
          <label className="hab-l">Reminder<input type="time" className="fi" aria-label="Reminder time" value={h.remind || ''} onChange={(e) => up({ remind: e.target.value || null })} /></label>
        </div>
        <label className="hab-l">Why does this matter to you?<textarea className="fi" rows={2} aria-label="Motivation" placeholder="A reminder for the days you don't feel like it" value={h.why} onChange={(e) => up({ why: e.target.value })} /></label>
      </div>
    </Modal>
  );
}

export function IdeasDialog({ onPick, onBlank, onClose }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState('All');
  const cats = ['All', ...CATEGORIES.filter((c) => IDEAS.some((i) => i.category === c))];
  const list = useMemo(() => IDEAS.filter((i) => (cat === 'All' || i.category === cat) && i.name.toLowerCase().includes(q.toLowerCase())), [q, cat]);
  return (
    <Modal title="Habit ideas" onClose={onClose} width={640} footer={<><span className="muted">Pick one to customise it, or start from scratch.</span><span className="spacer" /><button className="fb" onClick={onBlank}><Icon name="plus" size={15} />Start from scratch</button></>}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label className="fx-search light"><Icon name="search" size={14} /><input aria-label="Search ideas" placeholder="Search ideas" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="hab-chips">{cats.map((c) => <button key={c} className={'fx-chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="hab-ideas">
          {list.map((i) => (
            <button key={i.name} className="hab-idea" aria-label={`Idea: ${i.name}`} onClick={() => onPick(i)}>
              <span className="hab-tile" style={{ background: i.color || COLORS[0] }}>{i.icon}</span>
              <span className="grow"><b>{i.name}</b><small>{i.category}{i.kind && i.kind !== 'check' ? ` · ${goalLabel(i)}` : ''}{i.schedule && i.schedule.type !== 'daily' ? ` · ${scheduleLabel({ schedule: { type: 'daily', days: [], times: 3, every: 2, ...i.schedule } })}` : ''}</small></span>
            </button>
          ))}
          {!list.length && <div className="fx-empty">No ideas match “{q}”.</div>}
        </div>
      </div>
    </Modal>
  );
}

export function SettingsDialog({ data, setSettings, onClose, onCsv, onCopy, onSample, onClearLogs, notifState, onNotify }) {
  const s = data.settings;
  return (
    <Modal title="Habit settings" onClose={onClose} width={500} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <div className="hab-form">
        <label className="hab-l">Week starts on
          <select className="fi" aria-label="Week starts on" value={s.weekStart} onChange={(e) => setSettings({ weekStart: Number(e.target.value) })}><option value={0}>Sunday</option><option value={1}>Monday</option><option value={6}>Saturday</option></select>
        </label>
        <label className="hab-chk"><input type="checkbox" className="chk" checked={s.hideDoneToday} onChange={(e) => setSettings({ hideDoneToday: e.target.checked })} />Hide completed habits on Today</label>
        <label className="hab-chk"><input type="checkbox" className="chk" checked={s.showQuote} onChange={(e) => setSettings({ showQuote: e.target.checked })} />Show a daily motivation line</label>
        <div className="hab-set-n">
          <label className="hab-chk"><input type="checkbox" className="chk" checked={s.notify} onChange={(e) => onNotify(e.target.checked)} />Show reminders as notifications</label>
          <small className="muted">{notifState === 'unsupported' ? 'This browser does not support notifications. In-app reminders still appear.' : notifState === 'denied' ? 'Notifications are blocked for this site in your browser settings.' : 'Reminders fire at the time you set on each habit, only while this page is open.'}</small>
        </div>
        <div className="fx-sep" />
        <div className="hab-set-b">
          <button className="fb" onClick={onCsv}><Icon name="download" size={15} />Export check-ins (CSV)</button>
          <button className="fb" onClick={onCopy}><Icon name="copy" size={15} />Copy habit summary</button>
          <button className="fb" onClick={onSample}><Icon name="sparkles" size={15} />Add sample habits</button>
          <button className="fb danger" onClick={onClearLogs}><Icon name="trash" size={15} />Clear all check-ins</button>
        </div>
      </div>
    </Modal>
  );
}
