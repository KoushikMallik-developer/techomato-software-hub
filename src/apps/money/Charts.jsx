import { useState } from 'react';
import { compact, monthLabel } from './model.js';

const nice = (max) => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };

/* Donut: slices [{label, value, color}] */
export function Donut({ slices, total, cur, center, size = 190, onPick, active }) {
  const [hov, setHov] = useState(null); const r = size / 2 - 14; const sw = 26; const C = 2 * Math.PI * r; let off = 0; const sum = slices.reduce((s, x) => s + x.value, 0) || 1;
  const h = hov != null ? slices[hov] : null;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Spending by category" className="mny-donut">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg3)" strokeWidth={sw} />
      {slices.map((s, i) => { const len = (s.value / sum) * C; const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={hov === i || active === i ? sw + 5 : sw} strokeDasharray={`${Math.max(0, len - (slices.length > 1 ? 1.5 : 0))} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ cursor: onPick ? 'pointer' : 'default', transition: 'stroke-width .12s' }} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} onClick={() => onPick && onPick(i)}><title>{`${s.label}: ${s.fmt || s.value}`}</title></circle>; off += len; return el; })}
      <text x="50%" y={h ? '45%' : '47%'} textAnchor="middle" fontSize="12" fill="var(--ink2)">{h ? h.label : center}</text>
      <text x="50%" y="58%" textAnchor="middle" fontSize="19" fontWeight="600" fill="var(--ink)">{h ? (h.fmt || h.value) : total}</text>
      {h && <text x="50%" y="69%" textAnchor="middle" fontSize="11.5" fill="var(--ink2)">{Math.round((h.value / sum) * 100)}%</text>}
    </svg>
  );
}

/* Grouped bars: data [{k, income, expense}] */
export function FlowBars({ data, cur, height = 220 }) {
  const [hov, setHov] = useState(null); const W = 560; const H = height; const L = 46; const B = 26; const T = 10; const R = 8;
  const max = nice(Math.max(1, ...data.flatMap((d) => [d.income, d.expense]))); const bw = (W - L - R) / data.length; const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mny-chart" role="img" aria-label="Income and expenses by month" preserveAspectRatio="xMidYMid meet">
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--ink3)">{compact(t, cur)}</text></g>)}
      {data.map((d, i) => { const x0 = L + i * bw; const w = Math.min(26, bw * 0.34); return (
        <g key={d.k} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
          <rect x={x0} y={T} width={bw} height={H - T - B} fill={hov === i ? 'var(--hover)' : 'transparent'} />
          <rect x={x0 + bw / 2 - w - 1} y={y(d.income)} width={w} height={Math.max(0, y(0) - y(d.income))} rx="3" fill="#2f9e5a"><title>{`${monthLabel(d.k)} income: ${compact(d.income, cur)}`}</title></rect>
          <rect x={x0 + bw / 2 + 1} y={y(d.expense)} width={w} height={Math.max(0, y(0) - y(d.expense))} rx="3" fill="#e8590c"><title>{`${monthLabel(d.k)} expenses: ${compact(d.expense, cur)}`}</title></rect>
          <text x={x0 + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={hov === i ? 'var(--ink)' : 'var(--ink2)'}>{monthLabel(d.k, { month: 'short' })}</text>
        </g>); })}
    </svg>
  );
}

/* Line/area: points [{k, v}] */
export function LineArea({ data, cur, height = 220, color = '#0f6cbd' }) {
  const [hov, setHov] = useState(null); const W = 560; const H = height; const L = 54; const B = 26; const T = 12; const R = 14;
  if (!data.length) return null;
  const vs = data.map((d) => d.v); let lo = Math.min(0, ...vs); let hi = Math.max(0, ...vs); if (hi === lo) hi = lo + 1; const pad = (hi - lo) * 0.08; hi += pad; if (lo < 0) lo -= pad;
  const x = (i) => L + (data.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (data.length - 1)); const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.v).toFixed(1)}`).join(' '); const area = `${path} L${x(data.length - 1)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z`;
  const ticks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4); const step = Math.ceil(data.length / 7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mny-chart" role="img" aria-label="Trend over time" onMouseLeave={() => setHov(null)}>
      {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--ink3)">{compact(t, cur)}</text></g>)}
      <path d={area} fill={color} opacity=".14" /><path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
      {data.map((d, i) => <g key={d.k}>{i % step === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink2)">{monthLabel(d.k, { month: 'short' })}</text>}
        <circle cx={x(i)} cy={y(d.v)} r={hov === i ? 5.5 : 3} fill={color} stroke="var(--card)" strokeWidth="1.5" /><rect x={x(i) - 18} y={T} width="36" height={H - T - B} fill="transparent" onMouseEnter={() => setHov(i)}><title>{`${monthLabel(d.k)}: ${compact(d.v, cur)}`}</title></rect></g>)}
      {hov != null && <text x={Math.min(W - 70, Math.max(L, x(hov) - 30))} y={Math.max(14, y(data[hov].v) - 12)} fontSize="12" fontWeight="600" fill="var(--ink)">{compact(data[hov].v, cur)}</text>}
    </svg>
  );
}

export function Bar({ value, max, color = 'var(--brand)', over, height = 8 }) {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return <div className="mny-bar" style={{ height }} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(p * 100)}><i style={{ width: p * 100 + '%', background: over ? 'var(--danger)' : color }} /></div>;
}
export function Spark({ values, color = '#0f6cbd', w = 90, h = 26 }) {
  if (values.length < 2) return null; const lo = Math.min(...values); const hi = Math.max(...values); const sp = hi - lo || 1;
  const pts = values.map((v, i) => `${((i * w) / (values.length - 1)).toFixed(1)},${(h - 2 - ((v - lo) / sp) * (h - 4)).toFixed(1)}`).join(' ');
  return <svg width={w} height={h} aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
