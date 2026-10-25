import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Modal } from '../../components/fxui.jsx';
import { SOUNDS, playSound, DOW, pad2, fmtClock, ampm } from './util.js';

export function nextRing(al, nowMs) {
  if (!al.on) return null; const now = new Date(nowMs);
  if (al.snoozeUntil && al.snoozeUntil > nowMs) return al.snoozeUntil;
  for (let i = 0; i < 8; i++) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, al.h, al.m, 0); if (d.getTime() <= nowMs) continue; if (!al.days.length || al.days.includes(d.getDay())) return d.getTime(); }
  return null;
}
export const untilLabel = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); const mm = m % 60; return m < 1 ? 'in less than a minute' : 'in ' + [d && `${d} day${d > 1 ? 's' : ''}`, h && `${h} hr`, mm && !d && `${mm} min`].filter(Boolean).join(' '); };
const daysLabel = (days) => (!days.length ? 'Once' : days.length === 7 ? 'Every day' : days.join() === '1,2,3,4,5' ? 'Weekdays' : days.join() === '0,6' ? 'Weekends' : days.map((d) => DOW[d]).join(', '));

function AlarmEditor({ init, h24, onSave, onClose, onDelete }) {
  const [h, setH] = useState(init.h); const [m, setM] = useState(init.m); const [name, setName] = useState(init.name); const [days, setDays] = useState(init.days); const [sound, setSound] = useState(init.sound); const [snooze, setSnooze] = useState(init.snooze);
  const pm = h >= 12; const h12 = h % 12 || 12;
  const setH12 = (v, p) => setH((v % 12) + (p ? 12 : 0));
  return (
    <Modal title={init.id ? 'Edit alarm' : 'New alarm'} onClose={onClose} width={420} footer={<>{init.id && <button className="fb danger" style={{ marginRight: 'auto' }} onClick={onDelete}><Icon name="trash" size={15} />Delete</button>}<button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onSave({ h, m, name: name.trim(), days, sound, snooze })}>Save</button></>}>
      <div className="clk-edtime">
        {h24 ? <select className="fi clk-sel" aria-label="Hour" value={h} onChange={(e) => setH(+e.target.value)}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{pad2(i)}</option>)}</select>
          : <select className="fi clk-sel" aria-label="Hour" value={h12} onChange={(e) => setH12(+e.target.value, pm)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>}
        <b>:</b>
        <select className="fi clk-sel" aria-label="Minute" value={m} onChange={(e) => setM(+e.target.value)}>{Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{pad2(i)}</option>)}</select>
        {!h24 && <div className="fx-seg"><button className={!pm ? 'on' : ''} onClick={() => setH12(h12, false)}>AM</button><button className={pm ? 'on' : ''} onClick={() => setH12(h12, true)}>PM</button></div>}
      </div>
      <div className="fx-kv" style={{ marginTop: 14 }}>
        <label>Name</label><input className="fi" placeholder="Alarm" aria-label="Alarm name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <label>Repeat</label><div style={{ display: 'grid', gap: 6 }}><div style={{ display: 'flex', gap: 3 }}>{DOW.map((n, i) => <button key={i} className={'fb sm' + (days.includes(i) ? ' pri' : '')} aria-pressed={days.includes(i)} aria-label={n} onClick={() => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))}>{n[0]}</button>)}</div><span className="muted" style={{ fontSize: 12 }}>{daysLabel(days)}</span></div>
        <label>Sound</label><div style={{ display: 'flex', gap: 6 }}><select className="fi" aria-label="Sound" value={sound} onChange={(e) => setSound(e.target.value)}>{SOUNDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select><button className="fb sub ico" aria-label="Preview sound" onClick={() => playSound(sound, 0.7)}><Icon name="speaker" size={16} /></button></div>
        <label>Snooze</label><select className="fi" aria-label="Snooze time" value={snooze} onChange={(e) => setSnooze(+e.target.value)}>{[1, 5, 10, 15, 20, 30].map((v) => <option key={v} value={v}>{v} minutes</option>)}</select>
      </div>
    </Modal>
  );
}

export default function Alarms({ data, now, a }) {
  const [edit, setEdit] = useState(null); const h24 = data.settings.h24;
  const list = useMemo(() => [...data.alarms].sort((x, y) => x.h * 60 + x.m - (y.h * 60 + y.m)), [data.alarms]);
  const next = useMemo(() => data.alarms.map((al) => nextRing(al, now)).filter(Boolean).sort((x, y) => x - y)[0], [data.alarms, Math.floor(now / 30000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const blank = () => { const d = new Date(now + 3600000); return { h: d.getHours(), m: 0, name: '', days: [], sound: data.settings.sound, snooze: 10, on: true }; };
  return (
    <div className="clk-alarms">
      <div className="clk-th"><div className="clk-nextal" aria-live="polite">{next ? <><Icon name="bell" size={16} /> Next alarm {untilLabel(next - now)}</> : <span className="muted">No upcoming alarms</span>}</div><span className="spacer" /><button className="fb pri" onClick={() => setEdit(blank())}><Icon name="plus" size={15} />New alarm</button></div>
      {list.length === 0 ? <div className="fx-empty"><Icon name="bell" size={40} /><h3>No alarms</h3><p>Add an alarm and it will ring while this page is open. Allow notifications so you also get an alert when the tab is in the background.</p></div> : (
        <div className="clk-alist">{list.map((al) => (
          <div key={al.id} className={'clk-al' + (al.on ? '' : ' off')}>
            <button className="clk-al-main" onClick={() => setEdit(al)} aria-label={`Edit alarm ${fmtClock(al.h, al.m, h24)}`}>
              <span className="clk-al-t">{fmtClock(al.h, al.m, h24)}{!h24 && <small>{ampm(al.h)}</small>}</span>
              <span className="clk-al-n">{al.name || 'Alarm'} · {daysLabel(al.days)}{al.on && nextRing(al, now) ? ' · ' + untilLabel(nextRing(al, now) - now) : ''}</span>
            </button>
            <label className="clk-switch"><input type="checkbox" role="switch" checked={al.on} aria-label={`Alarm ${fmtClock(al.h, al.m, h24)} on`} onChange={() => a.alarmToggle(al.id)} /><i /></label>
          </div>))}</div>
      )}
      {edit && <AlarmEditor init={edit} h24={h24} onClose={() => setEdit(null)} onSave={(v) => { a.alarmSave(edit.id, v); setEdit(null); }} onDelete={() => { a.alarmDelete(edit.id); setEdit(null); }} />}
    </div>
  );
}
