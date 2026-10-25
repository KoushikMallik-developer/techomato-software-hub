import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { ymd, parseYmd, addDays, addMonths, startOfWeek, weekdayNames, MONTHS, daysInMonth, fmtDate } from '../../lib/cal.js';
import { Ring, Heat, Bars, Trend, Dots } from './Charts.jsx';
import { dayStatus, streaks, rate, pct, totalCheckins, valueOf, weekDone, scheduleLabel, goalLabel, daySummary, overallStats, monthly, weekly, BADGES, inRange } from './model.js';

export const STATUS_LABEL = { done: 'done', partial: 'partly done', skip: 'skipped', miss: 'missed', pending: 'to do', off: 'not scheduled' };
const NOUN = (s) => (s.unit === 'week' ? 'weeks' : 'days');

export function habitCells(h, data, today, weeks, first) {
  const m = new Map(); const end = parseYmd(today); const start = addDays(startOfWeek(end, first), -(weeks - 1) * 7);
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const ds = ymd(d); const st = dayStatus(h, data, ds, today); const v = valueOf(data, h.id, ds);
    if (!inRange(h, ds)) { m.set(ds, { v: null, t: ds }); continue; }
    const frac = st === 'done' ? 1 : st === 'partial' ? Math.max(0.25, Math.min(0.75, v / h.goal)) : 0;
    m.set(ds, { v: st === 'off' || st === 'skip' ? (st === 'skip' ? 0 : null) : frac, t: `${fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}: ${STATUS_LABEL[st]}` });
  }
  return m;
}

/* ---------- detail panel ---------- */
export function Detail({ h, data, today, first, onToggle, onEdit, onClose, onNote, onArchive }) {
  const [month, setMonth] = useState(() => { const d = parseYmd(today); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const s = streaks(h, data, today, first);
  const names = weekdayNames(first, 'short');
  const lead = (month.getDay() - first + 7) % 7; const dim = daysInMonth(month.getFullYear(), month.getMonth());
  const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const r30 = rate(h, data, ymd(addDays(parseYmd(today), -29)), today, today);
  const rAll = rate(h, data, h.start, today, today);
  const heat = useMemo(() => habitCells(h, data, today, 16, first), [h, data, today, first]); // eslint-disable-line react-hooks/exhaustive-deps
  const notes = Object.entries(data.notes[h.id] || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 5);
  return (
    <aside className="hab-detail" aria-label={`${h.name} details`}>
      <div className="hab-d-head" style={{ '--hc': h.color }}>
        <span className="hab-tile big" style={{ background: h.color }}>{h.icon}</span>
        <div className="grow">
          <h2>{h.name}</h2>
          <div className="muted">{h.category} · {scheduleLabel(h)}{h.kind !== 'check' ? ` · ${goalLabel(h)}` : ''}</div>
        </div>
        <button className="fi-btn" onClick={onEdit} aria-label="Edit habit" title="Edit habit"><Icon name="edit" size={16} /></button>
        <button className="fi-btn" onClick={onClose} aria-label="Close details" title="Close"><Icon name="x" size={16} /></button>
      </div>
      {h.why && <p className="hab-why">“{h.why}”</p>}
      <div className="hab-d-kpis">
        <div><b>{s.current}</b><span>Current streak ({NOUN(s)})</span></div>
        <div><b>{s.best}</b><span>Best streak ({NOUN(s)})</span></div>
        <div><b>{pct(r30)}</b><span>Last 30 days</span></div>
        <div><b>{totalCheckins(h, data)}</b><span>Total check-ins</span></div>
      </div>
      <div className="hab-card">
        <div className="hab-mh">
          <button className="fi-btn" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" size={16} /></button>
          <b className="grow" style={{ textAlign: 'center' }}>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
          <button className="fi-btn" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" size={16} /></button>
        </div>
        <div className="hab-mg">
          {names.map((n, i) => <span key={i} className="hab-wd">{n.slice(0, 2)}</span>)}
          {cells.map((ds, i) => {
            if (!ds) return <span key={'e' + i} />;
            const st = dayStatus(h, data, ds, today); const fut = ds > today;
            return <button key={ds} className={`hab-md ${st}${ds === today ? ' today' : ''}`} style={{ '--hc': h.color }} disabled={fut || ds < h.start} aria-label={`${h.name} ${ds}: ${STATUS_LABEL[st]}`} onClick={() => onToggle(h, ds)} title={STATUS_LABEL[st]}>{Number(ds.slice(8))}</button>;
          })}
        </div>
        <div className="hab-legend"><i className="done" style={{ '--hc': h.color }} />Done<i className="partial" style={{ '--hc': h.color }} />Partly<i className="skip" />Skipped<i className="miss" />Missed</div>
      </div>
      <div className="hab-card">
        <div className="hab-ch">Last 16 weeks</div>
        <Heat cells={heat} weeks={16} first={first} color={h.color} today={today} label={`${h.name} history`} />
      </div>
      <div className="hab-card">
        <div className="hab-ch">Notes<span className="spacer" /><button className="fb sm" onClick={() => onNote(h, today)}><Icon name="plus" size={13} />Add note for today</button></div>
        {notes.length ? notes.map(([ds, t]) => <div key={ds} className="hab-note" onClick={() => onNote(h, ds)}><small>{fmtDate(parseYmd(ds), { weekday: 'short', month: 'short', day: 'numeric' })}</small><p>{t}</p></div>) : <div className="muted">No notes yet. Jot down how it went.</div>}
      </div>
      <div className="hab-d-foot"><button className="fb" onClick={() => onArchive(h)}><Icon name="archive" size={15} />{h.archived ? 'Restore habit' : 'Archive habit'}</button><span className="muted">All time: {pct(rAll)} done</span></div>
    </aside>
  );
}

/* ---------- all habits ---------- */
export function HabitsView({ habits, data, today, first, sel, onSel, onNew, onCtx, archived }) {
  if (!habits.length) return <div className="fx-empty">{archived ? 'No archived habits.' : 'No habits here yet.'}{!archived && <><br /><button className="fb pri" style={{ marginTop: 12 }} onClick={onNew}><Icon name="plus" size={15} />New habit</button></>}</div>;
  return (
    <div className="hab-grid">
      {habits.map((h) => {
        const s = streaks(h, data, today, first);
        const last = Array.from({ length: 14 }, (_, i) => { const ds = ymd(addDays(parseYmd(today), -13 + i)); const st = dayStatus(h, data, ds, today); return { t: `${ds}: ${STATUS_LABEL[st]}`, c: st === 'done' ? h.color : st === 'partial' ? `color-mix(in srgb, ${h.color} 45%, var(--bg3))` : 'var(--bg3)' }; });
        return (
          <button key={h.id} className={'hab-hcard' + (sel === h.id ? ' on' : '')} onClick={() => onSel(h.id)} onContextMenu={(e) => onCtx(e, h)} aria-label={`Open ${h.name}`}>
            <span className="hab-tile" style={{ background: h.color }}>{h.icon}</span>
            <span className="hab-hc-main"><b className="ellip">{h.name}</b><small className="ellip">{h.category} · {scheduleLabel(h)}</small></span>
            <span className="hab-hc-streak" title="Current streak"><Icon name="fire" size={14} />{s.current}<small>{s.unit === 'week' ? 'wk' : 'd'}</small></span>
            <span className="hab-hc-spark"><Dots items={last} /></span>
            <span className="hab-hc-rate">{pct(rate(h, data, ymd(addDays(parseYmd(today), -29)), today, today))}<small>30 days</small></span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- statistics ---------- */
export function StatsView({ data, today, first, onOpen }) {
  const habits = data.habits.filter((h) => !h.archived);
  const st = useMemo(() => overallStats(data, today, first), [data, today, first]);
  const cells = useMemo(() => { const m = new Map(); st.series.forEach((x) => m.set(x.ds, { v: x.total ? x.done / x.total : null, t: `${x.ds}: ${x.done} of ${x.total} done` })); return m; }, [st]);
  const wk = weekly(st.series, first).slice(-12).map((w) => ({ label: fmtDate(parseYmd(w.k), { month: 'short', day: 'numeric' }), v: w.rate }));
  const mo = monthly(st.series).slice(-6).map((m) => ({ label: MONTHS[Number(m.k.slice(5)) - 1].slice(0, 3), v: m.rate }));
  const order = [1, 2, 3, 4, 5, 6, 0]; const wdn = weekdayNames(0, 'short');
  const wd = (first === 0 ? [0, 1, 2, 3, 4, 5, 6] : order).map((d) => ({ label: wdn[d], v: st.byWeekday[d].t ? st.byWeekday[d].d / st.byWeekday[d].t : 0 }));
  const bestDay = wd.reduce((a, b) => (b.v > a.v ? b : a), wd[0]);
  const last7 = st.series.slice(-7); const l7 = last7.reduce((a, x) => a + x.done, 0), t7 = last7.reduce((a, x) => a + x.total, 0);
  const rows = habits.map((h) => ({ h, s: streaks(h, data, today, first), r7: rate(h, data, ymd(addDays(parseYmd(today), -6)), today, today), r30: rate(h, data, ymd(addDays(parseYmd(today), -29)), today, today), all: rate(h, data, h.start, today, today), n: totalCheckins(h, data) }));
  if (!habits.length) return <div className="fx-empty">Add a few habits and check them off. Your statistics will appear here.</div>;
  return (
    <div className="hab-stats">
      <div className="hab-kpis">
        <div className="hab-kpi"><span>Last 7 days</span><b>{t7 ? Math.round((l7 / t7) * 100) + '%' : '—'}</b><small>{l7} of {t7} check-ins</small></div>
        <div className="hab-kpi"><span>Active habits</span><b>{st.active}</b><small>{data.habits.length - st.active} archived</small></div>
        <div className="hab-kpi"><span>Total check-ins</span><b>{st.checkins}</b><small>all time</small></div>
        <div className="hab-kpi"><span>Perfect days</span><b>{st.perfect}</b><small>every habit done</small></div>
        <div className="hab-kpi"><span>Longest streak</span><b>{st.best}<em> days</em></b><small>{st.bestName || '—'}</small></div>
        <div className="hab-kpi"><span>Strongest day</span><b>{bestDay.v ? bestDay.label : '—'}</b><small>{bestDay.v ? Math.round(bestDay.v * 100) + '% completion' : 'not enough data'}</small></div>
      </div>
      <div className="hab-card"><div className="hab-ch">Daily completion, last year</div><div style={{ overflowX: 'auto' }}><Heat cells={cells} weeks={Math.min(52, Math.max(26, Math.ceil(st.series.length / 7) + 1))} first={first} today={today} color="#e0701a" label="Daily completion" /></div></div>
      <div className="hab-two">
        <div className="hab-card"><div className="hab-ch">Weekly trend</div><Trend points={wk} color="#e0701a" label="Weekly completion trend" /></div>
        <div className="hab-card"><div className="hab-ch">By day of week</div><Bars data={wd.map((d) => ({ ...d, dim: d.label !== bestDay.label }))} color="#e0701a" label="Completion by weekday" /></div>
      </div>
      <div className="hab-two">
        <div className="hab-card"><div className="hab-ch">By month</div><Bars data={mo} color="#5b5fc7" label="Completion by month" /></div>
        <div className="hab-card"><div className="hab-ch">Achievements<span className="spacer" /><small className="muted">{BADGES.filter((b) => b[4](st)).length} of {BADGES.length}</small></div>
          <div className="hab-badges">{BADGES.map(([k, n, d, e, f]) => { const got = f(st); return <div key={k} className={'hab-badge' + (got ? ' got' : '')} title={d} aria-label={`${n}: ${got ? 'earned' : 'locked'}. ${d}`}><span>{e}</span><b>{n}</b><small>{d}</small></div>; })}</div>
        </div>
      </div>
      <div className="hab-card">
        <div className="hab-ch">Habit breakdown</div>
        <div className="hab-tablewrap"><table className="hab-table">
          <thead><tr><th>Habit</th><th>Streak</th><th>Best</th><th>7 days</th><th>30 days</th><th>All time</th><th>Check-ins</th></tr></thead>
          <tbody>{rows.map(({ h, s, r7, r30, all, n }) => (
            <tr key={h.id} onClick={() => onOpen(h.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(h.id)}>
              <td><span className="hab-tile sm" style={{ background: h.color }}>{h.icon}</span> {h.name}</td>
              <td>{s.current} {s.unit === 'week' ? 'wk' : 'd'}</td><td>{s.best} {s.unit === 'week' ? 'wk' : 'd'}</td>
              <td><RateBar v={r7} c={h.color} /></td><td><RateBar v={r30} c={h.color} /></td><td><RateBar v={all} c={h.color} /></td><td>{n}</td>
            </tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}
const RateBar = ({ v, c }) => <span className="hab-rb"><i><u style={{ width: `${Math.round((v || 0) * 100)}%`, background: c }} /></i>{pct(v)}</span>;

/* ---------- month calendar ---------- */
export function CalendarView({ data, today, first, onPickDay }) {
  const [month, setMonth] = useState(() => { const d = parseYmd(today); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const habits = data.habits.filter((h) => !h.archived);
  const names = weekdayNames(first, 'short');
  const lead = (month.getDay() - first + 7) % 7; const dim = daysInMonth(month.getFullYear(), month.getMonth());
  const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  let td = 0, dn = 0, perfect = 0;
  for (const ds of cells) { if (!ds || ds > today) continue; const s = daySummary(habits, data, ds, today); td += s.total; dn += s.done; if (s.total && s.done === s.total) perfect++; }
  return (
    <div className="hab-calview">
      <div className="hab-calhead">
        <button className="fi-btn" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" size={18} /></button>
        <h2>{MONTHS[month.getMonth()]} {month.getFullYear()}</h2>
        <button className="fi-btn" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" size={18} /></button>
        <button className="fb sm" onClick={() => { const d = parseYmd(today); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>This month</button>
        <span className="spacer" /><span className="muted">{td ? `${Math.round((dn / td) * 100)}% completed · ${perfect} perfect day${perfect === 1 ? '' : 's'}` : 'No data this month'}</span>
      </div>
      <div className="hab-cg">
        {names.map((n) => <span key={n} className="hab-cwd">{n}</span>)}
        {cells.map((ds, i) => {
          if (!ds) return <span key={'e' + i} className="hab-cc empty" />;
          const s = daySummary(habits, data, ds, today); const fut = ds > today;
          return (
            <button key={ds} className={'hab-cc' + (ds === today ? ' today' : '') + (fut ? ' fut' : '')} onClick={() => onPickDay(ds)} aria-label={`${fmtDate(parseYmd(ds), { weekday: 'long', month: 'long', day: 'numeric' })}: ${s.total ? `${s.done} of ${s.total} done` : 'no habits'}`}>
              <span className="hab-cn">{Number(ds.slice(8))}</span>
              {s.total > 0 && <Ring value={fut ? 0 : s.ratio} size={38} stroke={5} color={s.ratio === 1 && !fut ? '#107c10' : '#e0701a'}><small>{fut ? '' : `${s.done}/${s.total}`}</small></Ring>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { Ring, weekDone };
