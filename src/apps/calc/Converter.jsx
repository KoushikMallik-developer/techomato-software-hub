import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Modal } from '../../components/fxui.jsx';
import { convert, defaultRates, RATES_NOTE } from './units.js';

const show = (v) => { if (!Number.isFinite(v)) return '—'; if (v === 0) return '0'; const a = Math.abs(v); if (a >= 1e15 || a < 1e-7) return v.toExponential(6).replace(/\.?0+e/, 'e'); return parseFloat(v.toPrecision(10)).toLocaleString(undefined, { maximumFractionDigits: 10 }); };

export default function Converter({ cat, rates, setRates, onLog }) {
  const u = cat.units; const [val, setVal] = useState('1'); const [from, setFrom] = useState(cat.id === 'currency' ? 'USD' : cat.id === 'temperature' ? 'C' : u[Math.min(4, u.length - 1)].id);
  const [to, setTo] = useState(cat.id === 'currency' ? 'INR' : cat.id === 'temperature' ? 'F' : u[Math.min(5, u.length - 1)].id);
  const [edit, setEdit] = useState(false);
  const n = parseFloat(val); const valid = val.trim() !== '' && Number.isFinite(n);
  const out = valid ? convert(cat, n, from, to, rates) : NaN;
  const all = useMemo(() => (valid ? u.map((x) => ({ ...x, v: convert(cat, n, from, x.id, rates) })) : []), [valid, n, from, u, cat, rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (id) => u.find((x) => x.id === id).name;
  const isCur = cat.id === 'currency';
  const keypad = (k) => { setVal((v) => { if (k === 'back') return v.length <= 1 ? '0' : v.slice(0, -1); if (k === 'c') return '0'; if (k === '±') return v.startsWith('-') ? v.slice(1) : v === '0' ? v : '-' + v; if (k === '.') return v.includes('.') ? v : v + '.'; return v === '0' ? k : v + k; }); };
  return (
    <div className="calc-conv">
      <div className="calc-conv-main">
        <div className="calc-cbox">
          <input className="calc-cin" inputMode="decimal" value={val} aria-label="Value to convert" onChange={(e) => { if (/^-?[0-9]*\.?[0-9]*(e[+-]?[0-9]*)?$/i.test(e.target.value)) setVal(e.target.value); }} />
          <select className="fi" value={from} aria-label="From unit" onChange={(e) => setFrom(e.target.value)}>{u.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </div>
        <button className="fb ico calc-cswap" aria-label="Swap units" onClick={() => { setFrom(to); setTo(from); if (valid) setVal(String(parseFloat(out.toPrecision(10)))); }}><Icon name="swap" size={18} /></button>
        <div className="calc-cbox out">
          <div className="calc-cin" aria-live="polite" aria-label="Converted value" data-testid="conv-out">{valid ? show(out) : '—'}</div>
          <select className="fi" value={to} aria-label="To unit" onChange={(e) => setTo(e.target.value)}>{u.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </div>
        <div className="calc-cnote">{valid ? `${show(n)} ${(u.find((x) => x.id === from).abbr || from)} = ${show(out)} ${(u.find((x) => x.id === to).abbr || to)}` : 'Enter a number'}</div>
        <div className="calc-pad conv">{['7', '8', '9', 'back', '4', '5', '6', 'c', '1', '2', '3', '±', '0', '.'].map((k) => <button key={k} className={'cb ' + (/\d/.test(k) ? 'num' : 'op')} onClick={() => keypad(k)} aria-label={k === 'back' ? 'Backspace' : k === 'c' ? 'Clear' : k}>{k === 'back' ? <Icon name="backspace" size={18} /> : k === 'c' ? 'C' : k}</button>)}
          <button className="cb eq" style={{ gridColumn: 'span 2' }} disabled={!valid} onClick={() => onLog && onLog({ expr: `${show(n)} ${name(from)} →`, res: `${show(out)} ${name(to)}` })}>Save to history</button></div>
      </div>
      <div className="calc-conv-all">
        <div className="calc-cah"><b>All {cat.name.toLowerCase()} units</b>{isCur && <button className="fb sm" onClick={() => setEdit(true)}><Icon name="edit" size={14} />Edit rates</button>}</div>
        {isCur && <div className="calc-ratenote">{RATES_NOTE}</div>}
        <div className="calc-ctable" role="table">{all.map((x) => <button key={x.id} className={'calc-crow' + (x.id === to ? ' on' : '')} onClick={() => setTo(x.id)}><span>{x.name}</span><b>{show(x.v)}</b></button>)}</div>
      </div>
      {edit && <RateEditor cat={cat} rates={rates} onClose={() => setEdit(false)} onSave={setRates} />}
    </div>
  );
}
function RateEditor({ cat, rates, onClose, onSave }) {
  const [r, setR] = useState(() => { const o = {}; cat.units.forEach((x) => { o[x.id] = String(parseFloat((1 / (rates[x.id] || x.f)).toPrecision(7))); }); return o; });
  const save = () => { const o = {}; cat.units.forEach((x) => { const v = parseFloat(r[x.id]); o[x.id] = v > 0 ? 1 / v : x.f; }); o.USD = 1; onSave(o); onClose(); };
  return (
    <Modal title="Edit exchange rates" onClose={onClose} width={440} footer={<><button className="fb" style={{ marginRight: 'auto' }} onClick={() => { const o = defaultRates(); const m = {}; cat.units.forEach((x) => { m[x.id] = String(parseFloat((1 / o[x.id]).toPrecision(7))); }); setR(m); }}>Reset to defaults</button><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={save}>Save</button></>}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Units of each currency per 1 US dollar.</p>
      <div className="calc-rates">{cat.units.filter((x) => x.id !== 'USD').map((x) => <label key={x.id}><span>{x.id} <small>{x.name}</small></span><input className="fi" inputMode="decimal" value={r[x.id]} aria-label={`${x.id} per USD`} onChange={(e) => setR({ ...r, [x.id]: e.target.value })} /></label>)}</div>
    </Modal>
  );
}
