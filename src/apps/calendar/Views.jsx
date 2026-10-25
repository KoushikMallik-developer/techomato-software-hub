import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { addDays, addMonths, diffDays, isoWeek, minutesOf, sameDay, startOfDay, startOfMonth, startOfWeek, weekdayNames, ymd, MONTHS, pad } from '../../lib/cal.js';
import { layoutDay } from './model.js';

export const fmtT = (d, h12) => { if (h12) { const h = d.getHours() % 12 || 12; const m = d.getMinutes(); return `${h}${m ? ':' + pad(m) : ''} ${d.getHours() < 12 ? 'AM' : 'PM'}`; } return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const hourLabel = (h, h12) => (h12 ? `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` : `${pad(h)}:00`);
export const tint = (c) => ({ '--ec': c });

/* ---------- mini month ---------- */
export function MiniMonth({ month, setMonth, date, onPick, weekStart, weekNums, dots, rangeStart, rangeEnd }) {
  const first = startOfWeek(startOfMonth(month), weekStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const names = weekdayNames(weekStart, 'narrow');
  const today = new Date();
  return (
    <div className="cal-mini" role="group" aria-label="Month navigator">
      <div className="cal-mini-h">
        <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
        <span className="spacer" />
        <button className="fb sub ico sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronUp" size={14} /></button>
        <button className="fb sub ico sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronDown" size={14} /></button>
      </div>
      <div className={'cal-mini-g' + (weekNums ? ' wn' : '')}>
        {weekNums && <span className="dn" />}
        {names.map((n, i) => <span key={i} className="dn">{n}</span>)}
        {days.map((d, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {weekNums && i % 7 === 0 && <span className="wk">{isoWeek(d)}</span>}
            <button className={'d' + (d.getMonth() !== month.getMonth() ? ' out' : '') + (sameDay(d, today) ? ' today' : '') + (sameDay(d, date) ? ' sel' : '') + (d >= rangeStart && d < rangeEnd ? ' inr' : '')} onClick={() => onPick(d)} aria-label={d.toDateString()}>
              {d.getDate()}{dots && dots.has(ymd(d)) && <i />}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- time grid (day / work week / week) ---------- */
function useNow() { const [n, setN] = useState(new Date()); useEffect(() => { const id = setInterval(() => setN(new Date()), 30000); return () => clearInterval(id); }, []); return n; }
const snap = (m, s = 15) => Math.round(m / s) * s;

export function TimeGrid({ days, occs, colorOf, settings, ppm, onCreate, onOpen, onChange, selected, scrollKey }) {
  const h12 = settings.h12; const now = useNow(); const bodyRef = useRef(null); const scrollRef = useRef(null); const colsRef = useRef(null);
  const [sel, setSel] = useState(null); const [ghost, setGhost] = useState(null); const drag = useRef(null);
  const n = days.length; const H = ppm * 60;
  const timed = []; const allday = [];
  const d0 = days[0]; const dEnd = addDays(days[n - 1], 1);
  occs.forEach((o) => { if (o.allDay) allday.push(o); else timed.push(o); });
  useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (settings.dayStart - 1) * H); }, [scrollKey, H]); // eslint-disable-line react-hooks/exhaustive-deps

  // all-day lanes
  const lanes = []; const bars = [];
  allday.slice().sort((a, b) => a.start - b.start || (b.endExcl - b.start) - (a.endExcl - a.start)).forEach((o) => {
    const cs = Math.max(0, diffDays(d0, o.start)); const ce = Math.min(n - 1, diffDays(d0, o.endExcl) - 1); if (ce < cs) return;
    let l = 0; while (lanes[l] && lanes[l].some(([a, b]) => !(ce < a || cs > b))) l++; (lanes[l] = lanes[l] || []).push([cs, ce]);
    bars.push({ o, cs, ce, l, cl: o.start < d0, cr: o.endExcl > dEnd });
  });
  const laneCount = lanes.length;

  const perDay = days.map((d) => {
    const ds = startOfDay(d).getTime(); const de = ds + 86400000;
    const items = timed.filter((o) => o.start.getTime() < de && Math.max(o.endExcl.getTime(), o.start.getTime() + 15 * 60000) > ds).map((o) => ({ o, s: Math.max(0, (o.start.getTime() - ds) / 60000), e: Math.min(1440, (Math.max(o.endExcl.getTime(), o.start.getTime() + 15 * 60000) - ds) / 60000) }));
    return layoutDay(items);
  });

  const pointToSlot = (x, y) => {
    const r = colsRef.current.getBoundingClientRect(); const cw = r.width / n; const di = Math.max(0, Math.min(n - 1, Math.floor((x - r.left) / cw)));
    const m = Math.max(0, Math.min(1440, (y - r.top) / ppm)); return { di, m };
  };

  useEffect(() => {
    const move = (e) => {
      const dr = drag.current; if (!dr) return;
      if (dr.type === 'create') { const { di, m } = pointToSlot(e.clientX, e.clientY); const a = dr.anchor; const lo = Math.min(a, snap(m)); const hi = Math.max(a + 15, snap(m)); dr.moved = dr.moved || Math.abs(e.clientY - dr.y0) > 4; setSel({ di: dr.di, s: Math.min(lo, a), e: Math.max(hi, a + 15) }); if (di !== dr.di) { /* single-day selection */ } return; }
      if (!dr.moved && Math.hypot(e.clientX - dr.x0, e.clientY - dr.y0) < 5) return; dr.moved = true;
      const o = dr.occ;
      if (dr.type === 'move') { const { di } = pointToSlot(e.clientX, e.clientY); const dd = di - dr.di0; const dm = snap((e.clientY - dr.y0) / ppm); const s = new Date(dr.os.getTime() + dd * 86400000 + dm * 60000); const ns = new Date(addDays(dr.os, dd).getFullYear(), addDays(dr.os, dd).getMonth(), addDays(dr.os, dd).getDate(), dr.os.getHours(), dr.os.getMinutes() + dm); setGhost({ key: o.key, start: ns, end: new Date(ns.getTime() + (dr.oe - dr.os)) }); void s; }
      else if (dr.type === 'resize') { const dm = snap((e.clientY - dr.y0) / ppm); const ne = new Date(Math.max(dr.os.getTime() + 15 * 60000, dr.oe.getTime() + dm * 60000)); setGhost({ key: o.key, start: dr.os, end: ne }); }
      else if (dr.type === 'moveAll') { const r = colsRef.current.getBoundingClientRect(); const cw = r.width / n; const dd = Math.round((e.clientX - dr.x0) / cw); setGhost({ key: o.key, start: addDays(o.start, dd), end: addDays(o.end, dd), allDay: true }); }
    };
    const up = (e) => {
      const dr = drag.current; if (!dr) return; drag.current = null;
      if (dr.type === 'create') { const s = (sel || {}); const hit = dr.moved ? s : { di: dr.di, s: dr.anchor, e: dr.anchor + settings.defLen }; setSel(null); onCreate({ day: days[hit.di], startMin: hit.s, endMin: hit.e, x: e.clientX, y: e.clientY, dbl: dr.dbl }); return; }
      if (!dr.moved) { setGhost(null); onOpen(dr.occ, e); return; }
      setGhost((g) => { if (g) onChange(dr.occ, g.start, g.end, g.allDay); return null; });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });

  const lastDown = useRef(null);
  const colDown = (e, di) => {
    if (e.button !== 0 || e.target.closest('.cal-ev')) return;
    const { m } = pointToSlot(e.clientX, e.clientY); const a = Math.min(1425, snap(m - 7));
    const tn = Date.now(); const lp = lastDown.current; const dbl = !!lp && tn - lp.t < 450 && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) < 8; lastDown.current = { t: tn, x: e.clientX, y: e.clientY };
    drag.current = { type: 'create', di, anchor: Math.max(0, a), y0: e.clientY, moved: false, dbl };
    setSel({ di, s: Math.max(0, a), e: Math.max(0, a) + 15 });
  };
  const evDown = (e, o, type) => {
    if (e.button !== 0) return; e.stopPropagation();
    const { di } = pointToSlot(e.clientX, e.clientY);
    drag.current = { type, occ: o, x0: e.clientX, y0: e.clientY, os: o.start, oe: o.end, di0: di, moved: false };
  };

  const nowTop = minutesOf(now) * ppm; const todayIdx = days.findIndex((d) => sameDay(d, now));
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const colTemplate = { gridTemplateColumns: `56px repeat(${n}, minmax(0, 1fr))` };
  return (
    <div className="cal-tg">
      <div className="cal-tg-head" style={colTemplate}>
        <div className="cal-gut" />
        {days.map((d, i) => (
          <div key={i} className={'cal-dh' + (sameDay(d, now) ? ' today' : '')}>
            <span className="dow">{d.toLocaleDateString(undefined, { weekday: n === 1 ? 'long' : 'short' })}</span>
            <span className="dnum">{d.getDate()}</span>
            {settings.weekNums && i === 0 && <span className="wkn">W{isoWeek(d)}</span>}
          </div>
        ))}
      </div>
      {laneCount > 0 && (
        <div className="cal-ad" style={{ ...colTemplate, gridTemplateRows: `repeat(${laneCount}, 22px)` }}>
          <div className="cal-gut cal-adl" style={{ gridRow: `1 / span ${laneCount}` }}>all-day</div>
          {days.map((d, i) => <div key={i} className="cal-adcol" style={{ gridColumn: i + 2, gridRow: `1 / span ${laneCount}` }} />)}
          {bars.map((b) => {
            const g = ghost && ghost.key === b.o.key && ghost.allDay; const shift = g ? diffDays(b.o.start, ghost.start) : 0;
            return (
              <div key={b.o.key} className={'cal-bar' + (b.cl ? ' cl' : '') + (b.cr ? ' cr' : '') + (b.o.holiday ? ' hol' : '') + (selected === b.o.key ? ' on' : '') + (g ? ' ghost' : '') + (b.o.showAs === 'free' ? ' free' : '')} style={{ ...tint(colorOf(b.o)), gridColumn: `${b.cs + 2 + shift} / ${b.ce + 3 + shift}`, gridRow: b.l + 1 }}
                onPointerDown={(e) => !b.o.holiday && evDown(e, b.o, 'moveAll')} onClick={(e) => { if (b.o.holiday) onOpen(b.o, e); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(b.o, e); }}>
                <span className="ellip">{b.o.title || '(No title)'}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-body" ref={bodyRef} style={{ height: 24 * H, ...colTemplate }}>
          <div className="cal-gut cal-hours">{hours.map((h) => <div key={h} className="hr" style={{ height: H }}>{h > 0 && <span>{hourLabel(h, h12)}</span>}</div>)}</div>
          <div className="cal-cols" ref={colsRef} style={{ gridColumn: `2 / span ${n}`, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {days.map((d, di) => (
              <div key={di} className={'cal-col' + (sameDay(d, now) ? ' today' : '') + (!settings.workDays.includes(d.getDay()) ? ' off' : '')} onPointerDown={(e) => colDown(e, di)} data-day={ymd(d)}>
                {hours.map((h) => <div key={h} className={'cal-slot' + (h >= settings.dayStart && h < settings.dayEnd && settings.workDays.includes(d.getDay()) ? ' work' : '')} style={{ height: H }}><i style={{ top: H / 2 }} /></div>)}
                {sel && sel.di === di && <div className="cal-sel" style={{ top: sel.s * ppm, height: (sel.e - sel.s) * ppm }}><span>{fmtT(new Date(2000, 0, 1, 0, sel.s), h12)} – {fmtT(new Date(2000, 0, 1, 0, sel.e), h12)}</span></div>}
                {perDay[di].map(({ o, s, e, col, cols }) => {
                  const g = ghost && ghost.key === o.key && !ghost.allDay; const top = s * ppm; const hgt = Math.max(18, (e - s) * ppm - 1);
                  return (
                    <div key={o.key} className={'cal-ev' + (selected === o.key ? ' on' : '') + (o.showAs === 'free' ? ' free' : '') + (o.showAs === 'tentative' ? ' tent' : '') + (g ? ' ghost' : '') + (o.holiday ? ' hol' : '')} style={{ ...tint(colorOf(o)), top, height: hgt, left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - ${cols > 1 ? 3 : 5}px)` }}
                      onPointerDown={(e) => !o.holiday && evDown(e, o, 'move')} role="button" tabIndex={0} aria-label={`${o.title || 'No title'}, ${fmtT(o.start, h12)}`} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(o, e); }}>
                      <div className="t ellip2">{o.title || '(No title)'}</div>
                      {hgt > 34 && <div className="m ellip">{fmtT(o.start, h12)} – {fmtT(o.end, h12)}</div>}
                      {hgt > 52 && o.location && <div className="m ellip"><Icon name="location" size={11} /> {o.location}</div>}
                      {o.rec && hgt > 30 && <Icon name="repeat" size={11} className="rp" />}
                      <span className="rs" onPointerDown={(e) => evDown(e, o, 'resize')} />
                    </div>
                  );
                })}
                {ghost && !ghost.allDay && sameDay(ghost.start, d) && (() => { const o = timed.find((x) => x.key === ghost.key); if (!o) return null; const top = minutesOf(ghost.start) * ppm; return <div className="cal-ev dragging" style={{ ...tint(colorOf(o)), top, height: Math.max(18, (ghost.end - ghost.start) / 60000 * ppm - 1), left: 1, right: 4 }}><div className="t">{o.title || '(No title)'}</div><div className="m">{fmtT(ghost.start, h12)} – {fmtT(ghost.end, h12)}</div></div>; })()}
                {todayIdx === di && <div className="cal-now" style={{ top: nowTop }}><i /></div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- month grid ---------- */
export function MonthGrid({ date, occs, colorOf, settings, onDayClick, onOpen, onMore, onMoveDay, selected }) {
  const ws = settings.weekStart; const first = startOfWeek(startOfMonth(date), ws);
  const rows = Math.ceil((diffDays(first, new Date(date.getFullYear(), date.getMonth() + 1, 0)) + 1) / 7);
  const weeks = Array.from({ length: rows }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i)));
  const ref = useRef(null); const [h, setH] = useState(600);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setH(el.clientHeight)); ro.observe(el); setH(el.clientHeight); return () => ro.disconnect(); }, []);
  const rowH = (h - 26) / rows; const maxLanes = Math.max(1, Math.floor((rowH - 26) / 21));
  const names = weekdayNames(ws, 'short'); const today = new Date();
  const dragRef = useRef(null); const [dragOver, setDragOver] = useState(null);
  return (
    <div className="cal-month">
      <div className="cal-mh">{settings.weekNums && <span className="wkc" />}{names.map((n) => <span key={n}>{n}</span>)}</div>
      <div className="cal-mrows" ref={ref}>
        {weeks.map((wk, wi) => {
          const ws0 = wk[0]; const we = addDays(wk[6], 1);
          const segs = occs.filter((o) => o.start < we && o.endExcl > ws0 && (o.allDay || o.endExcl - o.start >= 0)).map((o) => {
            const multi = o.allDay || startOfDay(o.start).getTime() !== startOfDay(new Date(o.endExcl.getTime() - 1)).getTime();
            const cs = Math.max(0, diffDays(ws0, o.start)); const ce = Math.min(6, diffDays(ws0, o.allDay ? addDays(o.endExcl, -1) : new Date(o.endExcl.getTime() - 1)));
            return { o, cs, ce: Math.max(cs, ce), multi, cl: o.start < ws0, cr: o.endExcl > we };
          }).sort((a, b) => (b.multi - a.multi) || a.cs - b.cs || (b.ce - b.cs) - (a.ce - a.cs) || a.o.start - b.o.start);
          const lanes = []; segs.forEach((s) => { let l = 0; while (lanes[l] && lanes[l].some(([x, y]) => !(s.ce < x || s.cs > y))) l++; (lanes[l] = lanes[l] || []).push([s.cs, s.ce]); s.l = l; });
          const hidden = Array(7).fill(0); segs.forEach((s) => { if (s.l >= maxLanes) for (let c = s.cs; c <= s.ce; c++) hidden[c]++; });
          return (
            <div key={wi} className="cal-mweek" style={{ gridTemplateColumns: settings.weekNums ? '30px repeat(7, 1fr)' : 'repeat(7, 1fr)' }}>
              {settings.weekNums && <span className="wkc">{isoWeek(wk[0])}</span>}
              {wk.map((d, di) => (
                <div key={di} className={'cal-mcell' + (d.getMonth() !== date.getMonth() ? ' out' : '') + (!settings.workDays.includes(d.getDay()) ? ' off' : '') + (dragOver === ymd(d) ? ' over' : '')} onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('n')) onDayClick(d, e); }} onDoubleClick={(e) => onDayClick(d, e, true)} data-day={ymd(d)}>
                  <span className={'n' + (sameDay(d, today) ? ' today' : '')} onClick={(e) => { e.stopPropagation(); onDayClick(d, e); }}>{d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d.getDate()}</span>
                  {hidden[di] > 0 && <button className="more" onClick={(e) => { e.stopPropagation(); onMore(d, e); }}>+{hidden[di]} more</button>}
                </div>
              ))}
              <div className="cal-mlayer" style={{ left: settings.weekNums ? 30 : 0 }}>
                {segs.filter((s) => s.l < maxLanes).map((s) => {
                  const bar = s.multi; const o = s.o;
                  return (
                    <div key={o.key + wi} className={'cal-mev' + (bar ? ' bar' : '') + (s.cl ? ' cl' : '') + (s.cr ? ' cr' : '') + (o.holiday ? ' hol' : '') + (selected === o.key ? ' on' : '') + (o.showAs === 'free' && bar ? ' free' : '')} style={{ ...tint(colorOf(o)), left: `calc(${(s.cs / 7) * 100}% + 2px)`, width: `calc(${((s.ce - s.cs + 1) / 7) * 100}% - 4px)`, top: 24 + s.l * 21 }}
                      draggable={!o.holiday} onDragStart={(e) => { dragRef.current = o; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', o.key); } catch { /* ignore */ } }} onDragEnd={() => setDragOver(null)}
                      onClick={(e) => { e.stopPropagation(); onOpen(o, e); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(o, e); }}>
                      {!bar && <i className="dot" />}
                      {!bar && !o.allDay && <span className="tm">{fmtT(o.start, settings.h12)}</span>}
                      <span className="ellip ttl">{o.title || '(No title)'}</span>
                    </div>
                  );
                })}
              </div>
              <div className="cal-mdrop" style={{ left: settings.weekNums ? 30 : 0 }}>
                {wk.map((d, di) => <div key={di} onDragOver={(e) => { if (dragRef.current) { e.preventDefault(); setDragOver(ymd(d)); } }} onDragLeave={() => setDragOver((x) => (x === ymd(d) ? null : x))} onDrop={(e) => { e.preventDefault(); const o = dragRef.current; dragRef.current = null; setDragOver(null); if (o) onMoveDay(o, d); }} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- agenda ---------- */
export function Agenda({ from, days, occs, colorOf, settings, onOpen, title }) {
  const groups = []; const map = new Map();
  occs.forEach((o) => {
    let d = startOfDay(o.start < from ? from : o.start); const last = startOfDay(o.allDay ? addDays(o.endExcl, -1) : new Date(o.endExcl.getTime() - (o.endExcl > o.start ? 1 : 0)));
    for (let i = 0; i < 366 && d <= last; i++, d = addDays(d, 1)) { const k = ymd(d); if (!map.has(k)) { const g = { date: new Date(d), list: [] }; map.set(k, g); groups.push(g); } map.get(k).list.push(o); if (!o.allDay && ymd(o.start) !== ymd(o.endExcl)) break; }
  });
  groups.sort((a, b) => a.date - b.date);
  return (
    <div className="cal-agenda">
      {title && <div className="muted" style={{ padding: '4px 0 10px' }}>{title}</div>}
      {groups.length === 0 && <div className="fx-empty"><Icon name="calendarIco" size={52} style={{ opacity: 0.4 }} /><h3>No events</h3><div>Nothing scheduled in this period.</div></div>}
      {groups.map((g) => (
        <section key={ymd(g.date)} className="cal-ag">
          <h3 className={sameDay(g.date, new Date()) ? 'today' : ''}><span className="n">{g.date.getDate()}</span><span>{g.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', year: 'numeric' })}{sameDay(g.date, new Date()) ? ' · Today' : ''}</span></h3>
          {g.list.map((o) => (
            <button key={o.key + ymd(g.date)} className="cal-agrow" style={tint(colorOf(o))} onClick={(e) => onOpen(o, e)}>
              <span className="tm">{o.allDay ? 'All day' : `${fmtT(o.start, settings.h12)} – ${fmtT(o.end, settings.h12)}`}</span>
              <i className="bar" /><span className="grow ellip"><b>{o.title || '(No title)'}</b>{o.location && <span className="muted"> · {o.location}</span>}</span>
              {o.rec && <Icon name="repeat" size={13} />}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
