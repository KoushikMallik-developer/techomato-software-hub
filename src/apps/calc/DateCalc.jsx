import { useMemo, useState } from 'react';
import { ymd, parseYmd, addDays, addMonths, diffDays, fmtDate } from '../../lib/cal.js';

function ymdDiff(a, b) { // a <= b ; whole months by clamped month-addition, then leftover days
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  const addM = (n) => { const r = new Date(a.getFullYear(), a.getMonth() + n, a.getDate()); const tm = (((a.getMonth() + n) % 12) + 12) % 12; return r.getMonth() !== tm ? new Date(r.getFullYear(), r.getMonth(), 0) : r; };
  while (months > 0 && addM(months) > b) months--;
  return { y: Math.floor(months / 12), m: months % 12, d: diffDays(addM(months), b) };
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function addYMD(date, sign, y, m, d) {
  let r = new Date(date.getFullYear() + sign * y, date.getMonth() + sign * m, date.getDate());
  const targetMonth = (((date.getMonth() + sign * m + sign * y * 12) % 12) + 12) % 12; // clamp end-of-month
  if (r.getMonth() !== targetMonth) r = new Date(r.getFullYear(), r.getMonth(), 0);
  return addDays(r, sign * d);
}
function weekdays(a, b) { let n = 0; for (let d = a; d < b; d = addDays(d, 1)) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; } return n; }

export default function DateCalc({ fmt }) {
  const [mode, setMode] = useState('diff');
  const today = ymd(new Date());
  const [from, setFrom] = useState(today); const [to, setTo] = useState(ymd(addDays(new Date(), 30)));
  const [base, setBase] = useState(today); const [sign, setSign] = useState(1); const [yy, setY] = useState(0); const [mm, setM] = useState(0); const [dd, setD] = useState(7);
  const diff = useMemo(() => {
    if (!from || !to) return null; let a = parseYmd(from); let b = parseYmd(to); const neg = a > b; if (neg) [a, b] = [b, a];
    const r = ymdDiff(a, b); const days = diffDays(a, b);
    return { r, days, weeks: Math.floor(days / 7), rem: days % 7, wd: weekdays(a, b), neg };
  }, [from, to]);
  const res = useMemo(() => (base ? addYMD(parseYmd(base), sign, +yy || 0, +mm || 0, +dd || 0) : null), [base, sign, yy, mm, dd]);
  const long = (d) => d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="calc-date">
      <div className="fx-seg" role="tablist" aria-label="Date calculation mode"><button role="tab" aria-selected={mode === 'diff'} className={mode === 'diff' ? 'on' : ''} onClick={() => setMode('diff')}>Difference between dates</button><button role="tab" aria-selected={mode === 'add'} className={mode === 'add' ? 'on' : ''} onClick={() => setMode('add')}>Add or subtract days</button></div>
      {mode === 'diff' ? (
        <>
          <div className="calc-dgrid"><label>From<input type="date" className="fi" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /></label><label>To<input type="date" className="fi" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></label></div>
          {diff && (
            <div className="calc-dres" aria-live="polite">
              <div className="lbl">Difference{diff.neg ? ' (To is before From)' : ''}</div>
              <div className="big">{diff.days === 0 ? 'Same dates' : [diff.r.y && plural(diff.r.y, 'year'), diff.r.m && plural(diff.r.m, 'month'), diff.r.d && plural(diff.r.d, 'day')].filter(Boolean).join(', ')}</div>
              <div className="sub">{diff.days.toLocaleString()} days total · {plural(diff.weeks, 'week')}{diff.rem ? `, ${plural(diff.rem, 'day')}` : ''} · {diff.wd.toLocaleString()} weekdays</div>
              <div className="calc-dpresets">{[['Today', today], ['Tomorrow', ymd(addDays(new Date(), 1))]].map(([n, v]) => <button key={n} className="fb sm" onClick={() => setFrom(v)}>From: {n}</button>)}<button className="fb sm" onClick={() => { setTo(from); setFrom(to); }}>Swap</button></div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="calc-dgrid"><label>From<input type="date" className="fi" value={base} onChange={(e) => setBase(e.target.value)} aria-label="Start date" /></label>
            <div className="fx-seg" style={{ alignSelf: 'end', width: 'fit-content' }}><button className={sign === 1 ? 'on' : ''} onClick={() => setSign(1)}>Add</button><button className={sign === -1 ? 'on' : ''} onClick={() => setSign(-1)}>Subtract</button></div></div>
          <div className="calc-dgrid three"><label>Years<input type="number" min="0" className="fi" value={yy} onChange={(e) => setY(e.target.value)} aria-label="Years" /></label><label>Months<input type="number" min="0" className="fi" value={mm} onChange={(e) => setM(e.target.value)} aria-label="Months" /></label><label>Days<input type="number" min="0" className="fi" value={dd} onChange={(e) => setD(e.target.value)} aria-label="Days" /></label></div>
          {res && <div className="calc-dres" aria-live="polite"><div className="lbl">Date</div><div className="big" data-testid="date-result">{long(res)}</div><div className="sub">{fmtDate ? '' : ''}{ymd(res)}</div></div>}
        </>
      )}
    </div>
  );
}
