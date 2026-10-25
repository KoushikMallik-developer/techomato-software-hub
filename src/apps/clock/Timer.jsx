import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Modal } from '../../components/fxui.jsx';
import { Ring } from './Ring.jsx';
import { hms } from './util.js';
import { uid } from '../../lib/useStore.js';

const PRESETS = [[60, '1 min'], [300, '5 min'], [600, '10 min'], [900, '15 min'], [1800, '30 min'], [3600, '1 hour']];
const Num = ({ v, set, max, label }) => <label className="clk-num"><input type="number" min="0" max={max} className="fi" value={v} aria-label={label} onChange={(e) => set(Math.max(0, Math.min(max, +e.target.value || 0)))} /><span>{label}</span></label>;

export function TimerEditor({ init, onSave, onClose }) {
  const t = init ? init.total / 1000 : 300; const [h, setH] = useState(Math.floor(t / 3600)); const [m, setM] = useState(Math.floor((t % 3600) / 60)); const [s, setS] = useState(t % 60); const [name, setName] = useState(init ? init.name : '');
  const total = h * 3600 + m * 60 + s;
  return (
    <Modal title={init ? 'Edit timer' : 'New timer'} onClose={onClose} width={400} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={total < 1} onClick={() => onSave({ name: name.trim(), total: total * 1000 })}>{init ? 'Save' : 'Create'}</button></>}>
      <div className="clk-edtime"><Num v={h} set={setH} max={99} label="hours" /><b>:</b><Num v={m} set={setM} max={59} label="minutes" /><b>:</b><Num v={s} set={setS} max={59} label="seconds" /></div>
      <div className="clk-presets" style={{ margin: '12px 0' }}>{PRESETS.map(([sec, l]) => <button key={sec} className="fx-chip" onClick={() => { setH(Math.floor(sec / 3600)); setM(Math.floor((sec % 3600) / 60)); setS(sec % 60); }}>{l}</button>)}</div>
      <input className="fi" placeholder="Timer name (optional)" aria-label="Timer name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
    </Modal>
  );
}

export default function Timers({ data, setData, now, a }) {
  const [edit, setEdit] = useState(null); const [full, setFull] = useState(null);
  const list = data.timers;
  const left = (t) => (t.endAt ? Math.max(0, t.endAt - now) : t.left);
  const card = (t, big) => {
    const l = left(t); const running = !!t.endAt; const done = l <= 0;
    return (
      <div key={t.id} className={'clk-tcard' + (big ? ' big' : '') + (done ? ' done' : '')}>
        {!big && <div className="clk-tname">{t.name || hms(t.total, { forceH: t.total >= 3600000 })}<span className="spacer" />
          <button className="fb sub ico sm" aria-label="Full screen" title="Full screen" onClick={() => setFull(t.id)}><Icon name="fullscreen" size={14} /></button>
          <button className="fb sub ico sm" aria-label="Edit timer" title="Edit" disabled={running} onClick={() => setEdit(t)}><Icon name="edit" size={14} /></button>
          <button className="fb sub ico sm" aria-label="Delete timer" title="Delete" onClick={() => a.timerDelete(t.id)}><Icon name="trash" size={14} /></button></div>}
        <Ring size={big ? 360 : 190} stroke={big ? 14 : 9} progress={t.total ? 1 - l / t.total : 0} color={done ? 'var(--danger)' : 'var(--brand)'}>
          <div className="clk-big" style={{ fontSize: big ? 64 : 34 }} data-testid="timer-time">{hms(l, { forceH: t.total >= 3600000 })}</div>
          {big && t.name && <div className="clk-sub">{t.name}</div>}
        </Ring>
        <div className="clk-btns">
          <button className="fb pri" aria-label={running ? 'Pause timer' : 'Start timer'} onClick={() => (running ? a.timerPause(t.id) : a.timerStart(t.id))}><Icon name={running ? 'pause' : 'play'} size={15} />{running ? 'Pause' : done ? 'Restart' : 'Start'}</button>
          <button className="fb" aria-label="Reset timer" onClick={() => a.timerReset(t.id)}><Icon name="refresh" size={15} />Reset</button>
          <button className="fb sub" aria-label="Add one minute" onClick={() => a.timerAdd(t.id, 60000)}>+1 min</button>
          {big && <button className="fb sub" onClick={() => setFull(null)}>Close</button>}
        </div>
      </div>
    );
  };
  const fullT = list.find((t) => t.id === full);
  return (
    <div className="clk-timers">
      <div className="clk-th"><div className="clk-presets">{PRESETS.slice(0, 5).map(([sec, l]) => <button key={sec} className="fx-chip" onClick={() => a.timerCreate({ name: '', total: sec * 1000 }, true)}>{l}</button>)}</div><span className="spacer" /><button className="fb pri" onClick={() => setEdit({})}><Icon name="plus" size={15} />New timer</button></div>
      {list.length === 0 ? <div className="fx-empty"><Icon name="timer" size={40} /><h3>No timers yet</h3><p>Pick a preset above or create a custom timer. Timers keep running while you use other apps, as long as this tab stays open.</p></div> : <div className="clk-tgrid">{list.map((t) => card(t))}</div>}
      {edit && <TimerEditor init={edit.id ? edit : null} onClose={() => setEdit(null)} onSave={(v) => { if (edit.id) a.timerUpdate(edit.id, v); else a.timerCreate(v, false); setEdit(null); }} />}
      {fullT && <div className="clk-fs" role="dialog" aria-label="Full screen timer">{card(fullT, true)}</div>}
    </div>
  );
}
