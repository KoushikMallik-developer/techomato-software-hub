export function Ring({ size = 260, stroke = 10, progress = 0, color = 'var(--brand)', children, className = '' }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(1, progress));
  return (
    <div className={'clk-ring ' + className} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />{p > 0.002 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .25s linear' }} />}</svg>
      <div className="clk-ring-in">{children}</div>
    </div>
  );
}
export function Analog({ h, m, s, size = 120, secs = true }) {
  const c = size / 2; const hand = (a, len, w, col) => <line x1={c} y1={c} x2={c + Math.sin(a) * len} y2={c - Math.cos(a) * len} stroke={col} strokeWidth={w} strokeLinecap="round" />;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Analog clock" className="clk-analog">
      <circle cx={c} cy={c} r={c - 2} fill="var(--card)" stroke="var(--line2)" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; const r1 = c - 6; const r2 = c - (i % 3 === 0 ? 14 : 10); return <line key={i} x1={c + Math.sin(a) * r1} y1={c - Math.cos(a) * r1} x2={c + Math.sin(a) * r2} y2={c - Math.cos(a) * r2} stroke="var(--ink2)" strokeWidth={i % 3 === 0 ? 2 : 1} />; })}
      {hand(((h % 12) + m / 60) * (Math.PI / 6), c * 0.5, 3.5, 'var(--ink)')}
      {hand((m + s / 60) * (Math.PI / 30), c * 0.75, 2.5, 'var(--ink)')}
      {secs && hand(s * (Math.PI / 30), c * 0.8, 1.2, 'var(--brand)')}
      <circle cx={c} cy={c} r="3.5" fill="var(--brand)" />
    </svg>
  );
}
