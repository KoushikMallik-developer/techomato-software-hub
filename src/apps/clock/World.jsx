import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Modal } from '../../components/fxui.jsx';
import { Analog } from './Ring.jsx';
import { LOCAL_TZ, allZones, cityOf, regionOf, offsetLabel, partsIn, fmtClock, ampm, DOW, tzOffset } from './util.js';

function AddZone({ have, onAdd, onClose }) {
  const [q, setQ] = useState(''); const zones = useMemo(() => allZones(), []);
  const list = useMemo(() => { const s = q.trim().toLowerCase().replace(/ /g, '_'); return zones.filter((z) => !have.includes(z) && (!s || z.toLowerCase().includes(s))).slice(0, 60); }, [q, zones, have]);
  return (
    <Modal title="Add a city" onClose={onClose} width={440} footer={<button className="fb" onClick={onClose}>Close</button>}>
      <input className="fi" autoFocus placeholder="Search for a city or region" aria-label="Search time zones" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="clk-zlist" role="listbox">{list.length === 0 ? <div className="fx-note">No matching time zones.</div> : list.map((z) => <button key={z} role="option" className="fx-row" onClick={() => onAdd(z)}><span className="grow"><b>{cityOf(z)}</b> <span className="muted">{regionOf(z)}</span></span><kbd>{offsetLabel(tzOffset(z, new Date()))}</kbd></button>)}</div>
    </Modal>
  );
}

export default function World({ data, setData, now, a }) {
  const [add, setAdd] = useState(false); const h24 = data.settings.h24; const shift = data.compare; const t = now + shift * 60000;
  const zones = data.zones; const localOff = tzOffset(LOCAL_TZ, new Date(now));
  const set = (fn) => setData((d) => ({ ...d, zones: fn(d.zones) }));
  const move = (i, dir) => set((z) => { const n = [...z]; const j = i + dir; if (j < 0 || j >= n.length) return z; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const rel = (tz) => { const p = partsIn(tz, t); const l = partsIn(LOCAL_TZ, t); const dd = p.dayNum - l.dayNum; const diff = (p.off - l.off) / 60; return { day: dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : dd === -1 ? 'Yesterday' : '', diff: diff === 0 ? 'Same time' : `${diff > 0 ? '+' : '−'}${Math.abs(diff) % 1 ? Math.abs(diff).toFixed(2).replace(/0+$/, '') : Math.abs(diff)} hrs` }; };
  const lp = partsIn(LOCAL_TZ, t);
  const main = zones[0] || LOCAL_TZ; const mp = partsIn(main, t);
  return (
    <div className="clk-world">
      <div className="clk-th"><div className="clk-wh"><b>{cityOf(LOCAL_TZ)}</b><span className="muted"> · local time {fmtClock(lp.h, lp.m, h24)}{!h24 ? ' ' + ampm(lp.h) : ''}</span></div><span className="spacer" />
        <button className="fb" onClick={() => setAdd(true)}><Icon name="plus" size={15} />Add city</button></div>
      <div className="clk-wgrid">
        {zones.map((tz, i) => { const p = partsIn(tz, t); const r = rel(tz); const night = p.h < 6 || p.h >= 19;
          return (
            <div key={tz} className={'clk-wc' + (night ? ' night' : '')}>
              <div className="clk-wc-top"><div><div className="clk-wc-city">{cityOf(tz)}{tz === LOCAL_TZ && <span className="fx-badge">Local</span>}</div><div className="muted" style={{ fontSize: 12 }}>{r.day ? r.day + ' · ' : ''}{DOW[p.dow]}, {p.day} · {r.diff}</div></div>
                <div className="clk-wc-acts"><button className="fb sub ico sm" aria-label={`Move ${cityOf(tz)} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrowUp" size={13} /></button><button className="fb sub ico sm" aria-label={`Move ${cityOf(tz)} down`} disabled={i === zones.length - 1} onClick={() => move(i, 1)}><Icon name="arrowDown" size={13} /></button><button className="fb sub ico sm" aria-label={`Remove ${cityOf(tz)}`} onClick={() => set((z) => z.filter((x) => x !== tz))}><Icon name="x" size={14} /></button></div></div>
              <div className="clk-wc-body"><Analog h={p.h} m={p.m} s={p.s} size={84} secs={!shift} /><div className="clk-wc-time" data-testid={'wc-' + cityOf(tz)}>{fmtClock(p.h, p.m, h24)}{!h24 && <small>{ampm(p.h)}</small>}</div><Icon name={night ? 'moon' : 'sun'} size={22} /></div>
            </div>);
        })}
      </div>
      {zones.length === 0 && <div className="fx-empty"><Icon name="globe" size={40} /><h3>No cities yet</h3><p>Add a city to see its local time.</p></div>}
      <div className="clk-conv">
        <div className="clk-conv-h"><b>Time converter</b><span className="muted">{shift ? `Showing ${shift > 0 ? '+' : '−'}${Math.floor(Math.abs(shift) / 60)}h ${Math.abs(shift) % 60 ? Math.abs(shift) % 60 + 'm ' : ''}from now` : 'Drag to compare times across cities'}</span>{shift !== 0 && <button className="fb sm" onClick={() => a.setCompare(0)}>Back to now</button>}</div>
        <input type="range" min="-720" max="720" step="15" value={shift} onChange={(e) => a.setCompare(+e.target.value)} aria-label="Time offset" className="clk-range" />
        <div className="clk-conv-ticks"><span>−12h</span><span>−6h</span><span>Now</span><span>+6h</span><span>+12h</span></div>
      </div>
      {add && <AddZone have={zones} onClose={() => setAdd(false)} onAdd={(z) => { set((l) => [...l, z]); setAdd(false); }} />}
    </div>
  );
}
