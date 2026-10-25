import { ymd, parseYmd, addDays, startOfWeek, weekdayNames, MONTHS } from '../../lib/cal.js';

export function Ring({ value = 0, size = 56, stroke = 6, color = 'var(--brand)', track = 'var(--bg3)', children, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <span className="hab-ring" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .5s ease' }} />
      </svg>
      {children !== undefined && <span className="hab-ring-in">{children}</span>}
    </span>
  );
}

/* GitHub-style contribution grid. cells: Map ds -> {v: 0..1 | null, t: title} */
export function Heat({ cells, weeks = 20, first = 1, color = 'var(--brand)', today, onPick, label = 'Activity' }) {
  const end = parseYmd(today); const startW = addDays(startOfWeek(end, first), -(weeks - 1) * 7);
  const cols = []; const monthMarks = [];
  for (let w = 0; w < weeks; w++) {
    const col = []; const ws = addDays(startW, w * 7);
    if (w === 0 || ws.getDate() <= 7) monthMarks.push([w, MONTHS[ws.getMonth()].slice(0, 3)]);
    for (let d = 0; d < 7; d++) { const dt = addDays(ws, d); const ds = ymd(dt); col.push({ ds, fut: ds > today, c: cells.get(ds) }); }
    cols.push(col);
  }
  const wn = weekdayNames(first, 'short'); const dn = wn.map((n, i) => (i % 2 ? n : ''));
  return (
    <div className="hab-heat" role="img" aria-label={label}>
      <div className="hab-heat-m" style={{ gridTemplateColumns: `22px repeat(${weeks}, 14px)` }}><span />{cols.map((_, w) => <span key={w} style={{ gridColumn: w + 2 }}>{(monthMarks.find((m) => m[0] === w) || [])[1] || ''}</span>)}</div>
      <div className="hab-heat-g" style={{ gridTemplateColumns: `22px repeat(${weeks}, 14px)` }}>
        <div className="hab-heat-d">{dn.map((x, i) => <span key={i}>{x}</span>)}</div>
        {cols.map((col, w) => (
          <div key={w} className="hab-heat-c">
            {col.map((c) => {
              const v = c.c ? c.c.v : null;
              const style = c.fut || v === null ? {} : { background: v <= 0 ? 'var(--bg3)' : `color-mix(in srgb, ${color} ${Math.round(28 + v * 72)}%, var(--bg))` };
              return <button key={c.ds} type="button" className={'hab-hc' + (c.fut ? ' fut' : '') + (c.ds === today ? ' today' : '')} style={style} title={c.c ? c.c.t : c.ds} tabIndex={-1} onClick={() => !c.fut && onPick && onPick(c.ds)} aria-label={c.c ? c.c.t : c.ds} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Bars({ data, color = 'var(--brand)', height = 140, fmt = (v) => Math.round(v * 100) + '%', max = 1, label = 'Bar chart' }) {
  const W = Math.max(data.length * 44, 280), pad = 22;
  return (
    <svg className="hab-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((g) => <line key={g} x1="0" x2={W} y1={height - pad - g * (height - pad - 14)} y2={height - pad - g * (height - pad - 14)} stroke="var(--line)" strokeDasharray={g ? '3 3' : ''} />)}
      {data.map((d, i) => {
        const bw = Math.min(26, W / data.length - 10), x = (i + 0.5) * (W / data.length) - bw / 2, h = Math.max(2, (d.v / max) * (height - pad - 14));
        return (
          <g key={i}>
            <rect x={x} y={height - pad - h} width={bw} height={h} rx="4" fill={d.color || color} opacity={d.dim ? 0.45 : 1}><title>{`${d.label}: ${fmt(d.v)}`}</title></rect>
            <text x={x + bw / 2} y={height - pad - h - 4} textAnchor="middle" fontSize="10" fill="var(--ink2)">{fmt(d.v)}</text>
            <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize="10.5" fill="var(--ink2)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Trend({ points, color = 'var(--brand)', height = 170, label = 'Trend' }) {
  const W = 380, pad = 22, n = points.length;
  if (n < 2) return <div className="muted" style={{ padding: 20 }}>Not enough data yet.</div>;
  const x = (i) => 8 + (i / (n - 1)) * (W - 16), y = (v) => height - pad - v * (height - pad - 10);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1)} ${height - pad} L${x(0)} ${height - pad} Z`;
  const step = Math.ceil(n / 7);
  return (
    <svg className="hab-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((g) => <g key={g}><line x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeDasharray={g ? '3 3' : ''} /><text x="2" y={y(g) - 2} fontSize="9.5" fill="var(--ink3)">{g * 100}%</text></g>)}
      <path d={area} fill={color} opacity=".14" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.v)} r="3" fill={color}><title>{`${p.label}: ${Math.round(p.v * 100)}%`}</title></circle>{i % step === 0 && <text x={x(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--ink2)">{p.label}</text>}</g>)}
    </svg>
  );
}

export function Dots({ items, size = 9 }) {
  return <span className="hab-dots">{items.map((it, i) => <i key={i} title={it.t} style={{ width: size, height: size, background: it.c }} />)}</span>;
}
