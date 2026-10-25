import { memo, useMemo } from 'react';
import { niceTicks } from '../../lib/sheet/chartData.js';
import { formatValue } from '../../lib/sheet/numfmt.js';

export const CHART_COLORS = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#fcd04f', '#71c287'];
export const CHART_TYPES = [
  ['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['combo', 'Combo (columns + lines)'], ['pie', 'Pie'], ['doughnut', 'Doughnut'], ['scatter', 'Scatter'],
];
const D_INK = '#3c4043'; const D_GRID = '#e3e6ea'; const D_SOFT = '#6b7280';
const fmtTick = (v, step) => {
  const a = Math.abs(v);
  if (a >= 1e9) return +(v / 1e9).toPrecision(3) + 'B'; if (a >= 1e6) return +(v / 1e6).toPrecision(3) + 'M'; if (a >= 1e4) return +(v / 1e3).toPrecision(3) + 'K';
  const dec = step && step < 1 ? Math.min(6, Math.ceil(-Math.log10(step))) : 0;
  return v.toLocaleString('en-US', { maximumFractionDigits: dec });
};
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const arcPath = (cx, cy, r, r0, a0, a1) => {
  const large = a1 - a0 > Math.PI ? 1 : 0; const [x0, y0] = polar(cx, cy, r, a0); const [x1, y1] = polar(cx, cy, r, a1);
  if (a1 - a0 >= Math.PI * 2 - 1e-6) { const [xm, ym] = polar(cx, cy, r, a0 + Math.PI); return r0 ? `M${x0},${y0} A${r},${r} 0 1 1 ${xm},${ym} A${r},${r} 0 1 1 ${x0},${y0} M${cx + r0},${cy} A${r0},${r0} 0 1 0 ${cx - r0},${cy} A${r0},${r0} 0 1 0 ${cx + r0},${cy}` : `M${x0},${y0} A${r},${r} 0 1 1 ${xm},${ym} A${r},${r} 0 1 1 ${x0},${y0}Z`; }
  if (!r0) return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}Z`;
  const [xi1, yi1] = polar(cx, cy, r0, a1); const [xi0, yi0] = polar(cx, cy, r0, a0);
  return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${r0},${r0} 0 ${large} 0 ${xi0},${yi0}Z`;
};

function ChartInner({ chart, data, width, height, fmt }) {
  const INK = chart.ink || D_INK; const GRID = chart.grid || D_GRID; const SOFT = chart.soft || D_SOFT;
  const W = Math.max(120, width); const H = Math.max(90, height);
  const type = chart.type || 'column';
  const colors = (i) => (chart.colors && chart.colors[i]) || CHART_COLORS[i % CHART_COLORS.length];
  const series = data.series; const cats = data.cats;
  const f = (v) => (fmt ? formatValue(v, fmt).text : fmtTick(v));
  const legendPos = chart.legend || (series.length > 1 || type === 'pie' || type === 'doughnut' ? 'right' : 'none');
  const pie = type === 'pie' || type === 'doughnut';

  const L = useMemo(() => {
    const pad = 12; let top = pad; let bottom = pad; let left = pad; let right = pad;
    if (chart.title) top += 26;
    const legItems = pie ? cats.length : series.length;
    const legW = Math.min(150, 28 + Math.max(0, ...(pie ? cats : series.map((s) => s.name)).slice(0, 30).map((s) => Math.min(String(s).length, 18))) * 6.2);
    if (legendPos === 'right') right += legW; else if (legendPos === 'left') left += legW; else if (legendPos === 'bottom') bottom += 22; else if (legendPos === 'top') top += 22;
    void legItems;
    return { pad, top, bottom, left, right, legW };
  }, [chart.title, legendPos, series, cats, pie]);

  const legend = (() => {
    if (legendPos === 'none') return null;
    const items = pie ? cats.map((c, i) => ({ name: c || `Item ${i + 1}`, color: colors(i) })) : series.map((s, i) => ({ name: s.name, color: colors(i) }));
    if (legendPos === 'right' || legendPos === 'left') {
      const x = legendPos === 'right' ? W - L.right + 10 : 10; const y0 = L.top + 6;
      return items.slice(0, Math.floor((H - y0 - 10) / 18)).map((it, i) => (
        <g key={i} transform={`translate(${x},${y0 + i * 18})`}><rect width="10" height="10" y="-9" rx="2" fill={it.color} /><text x="15" fontSize="11" fill={INK}>{trunc(String(it.name), 20)}</text></g>
      ));
    }
    let x = L.left; const y = legendPos === 'top' ? (chart.title ? 40 : 18) : H - 10;
    return items.map((it, i) => { const w = 28 + Math.min(String(it.name).length, 18) * 6; const g = (<g key={i} transform={`translate(${x},${y})`}><rect width="10" height="10" y="-9" rx="2" fill={it.color} /><text x="15" fontSize="11" fill={INK}>{trunc(String(it.name), 20)}</text></g>); x += w; return x < W - 10 ? g : null; });
  })();
  const title = chart.title ? <text x={W / 2} y={22} textAnchor="middle" fontSize="14" fontWeight="600" fill={INK}>{chart.title}</text> : null;

  if (data.error || !series.length) return <g><text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill={SOFT}>{data.error || 'No numeric data in the chosen range'}</text></g>;

  /* ---- pie / doughnut ---- */
  if (pie) {
    const vals = series[0].values.map((v) => (v === null || v < 0 ? 0 : v)); const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = L.left + (W - L.left - L.right) / 2; const cy = L.top + (H - L.top - L.bottom) / 2; const r = Math.max(20, Math.min((W - L.left - L.right) / 2, (H - L.top - L.bottom) / 2) - 6);
    let a = -Math.PI / 2;
    return (
      <g>
        {title}
        {vals.map((v, i) => {
          if (!v) return null; const a1 = a + (v / total) * Math.PI * 2; const mid = (a + a1) / 2; const path = arcPath(cx, cy, r, type === 'doughnut' ? r * 0.55 : 0, a, a1 - (vals.filter(Boolean).length === 1 ? 0.0001 : 0)); a = a1;
          const [lx, ly] = polar(cx, cy, type === 'doughnut' ? r * 0.78 : r * 0.65, mid);
          return (
            <g key={i}>
              <path d={path} fill={colors(i)} stroke="#fff" strokeWidth="1.5"><title>{`${cats[i] || i + 1}: ${f(v)} (${((v / total) * 100).toFixed(1)}%)`}</title></path>
              {(chart.labels !== false && v / total > 0.04) && <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#fff" fontWeight="600" pointerEvents="none">{chart.labels === 'value' ? f(v) : ((v / total) * 100).toFixed(v / total < 0.1 ? 1 : 0) + '%'}</text>}
            </g>
          );
        })}
        {legend}
      </g>
    );
  }

  /* ---- scatter ---- */
  if (type === 'scatter') {
    const xs = data.catVals.map((v, i) => (typeof v === 'number' ? v : i + 1));
    const pts = series.map((s) => s.values.map((y, i) => (y === null ? null : [xs[i], y])).filter(Boolean));
    const allx = pts.flat().map((p) => p[0]); const ally = pts.flat().map((p) => p[1]);
    if (!allx.length) return null;
    const yt = niceTicks(Math.min(0, Math.min(...ally)), Math.max(...ally)); const xt = niceTicks(Math.min(...allx), Math.max(...allx), 6);
    const yminP = chart.min !== undefined && chart.min !== '' ? +chart.min : yt.min; const ymaxP = chart.max !== undefined && chart.max !== '' ? +chart.max : yt.max;
    const yLabW = Math.max(...yt.ticks.map((t) => fmtTick(t, yt.step).length)) * 6.5 + 10;
    const x0 = L.left + yLabW + (chart.yTitle ? 16 : 0); const x1 = W - L.right; const y0 = L.top; const y1 = H - L.bottom - 22 - (chart.xTitle ? 16 : 0);
    const sx = (v) => x0 + ((v - xt.min) / (xt.max - xt.min || 1)) * (x1 - x0); const sy = (v) => y1 - ((v - yminP) / (ymaxP - yminP || 1)) * (y1 - y0);
    return (
      <g>
        {title}
        {yt.ticks.filter((t) => t >= yminP && t <= ymaxP).map((t) => (<g key={t}><line x1={x0} x2={x1} y1={sy(t)} y2={sy(t)} stroke={GRID} /><text x={x0 - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={SOFT}>{fmtTick(t, yt.step)}</text></g>))}
        {xt.ticks.map((t) => (<g key={t}><line x1={sx(t)} x2={sx(t)} y1={y0} y2={y1} stroke={GRID} /><text x={sx(t)} y={y1 + 15} textAnchor="middle" fontSize="11" fill={SOFT}>{fmtTick(t, xt.step)}</text></g>))}
        <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="#9aa0a6" />
        {pts.map((p, i) => p.map((q, k) => <circle key={i + '-' + k} cx={sx(q[0])} cy={sy(q[1])} r="4" fill={colors(i)} fillOpacity=".85"><title>{`${series[i].name}: (${f(q[0])}, ${f(q[1])})`}</title></circle>))}
        {chart.xTitle && <text x={(x0 + x1) / 2} y={H - L.bottom - 2} textAnchor="middle" fontSize="11" fill={SOFT}>{chart.xTitle}</text>}
        {chart.yTitle && <text transform={`translate(${L.left + 6},${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill={SOFT}>{chart.yTitle}</text>}
        {legend}
      </g>
    );
  }

  /* ---- cartesian: column / bar / line / area / combo ---- */
  const horizontal = type === 'bar';
  const stacked = !!chart.stacked && (type === 'column' || type === 'bar' || type === 'area'); const pct = stacked && !!chart.percent;
  const n = cats.length;
  const vals = series.map((s) => s.values.map((v) => (v === null ? 0 : v)));
  let lo = 0; let hi = 0;
  if (stacked) {
    for (let i = 0; i < n; i++) { let pos = 0; let neg = 0; vals.forEach((v) => { if (v[i] >= 0) pos += v[i]; else neg += v[i]; }); hi = Math.max(hi, pct ? 100 : pos); lo = Math.min(lo, pct ? 0 : neg); }
  } else { const flat = vals.flat(); hi = Math.max(0, ...flat); lo = Math.min(0, ...flat); if (type === 'line' && !chart.zero) { const real = series.flatMap((s) => s.values.filter((v) => v !== null)); lo = Math.min(...real) >= 0 && Math.min(...real) > (Math.max(...real)) * 0.5 ? Math.min(...real) : Math.min(0, ...real); hi = Math.max(...real); } }
  const nt = niceTicks(lo, hi, horizontal ? 5 : 6);
  const ymin = chart.min !== undefined && chart.min !== '' ? +chart.min : nt.min; const ymax = chart.max !== undefined && chart.max !== '' ? +chart.max : nt.max;
  const tickLabel = (t) => (pct ? t + '%' : f(t));
  const valLabW = Math.max(...nt.ticks.map((t) => String(tickLabel(t)).length)) * 6.5 + 10;
  const catLabLen = Math.max(...cats.map((c) => c.length), 1);
  const rotate = !horizontal && n * Math.min(catLabLen, 12) * 6.2 > W - L.left - L.right - valLabW && n > 3;
  const botExtra = horizontal ? 0 : rotate ? 38 : 20;
  const x0 = L.left + (horizontal ? Math.min(110, catLabLen * 6.2 + 12) : valLabW) + (chart.yTitle && !horizontal ? 16 : 0);
  const x1 = W - L.right; const y0 = L.top; const y1 = H - L.bottom - botExtra - (horizontal ? 20 : 0) - (chart.xTitle && !horizontal ? 16 : 0);
  const sv = (v) => (horizontal ? x0 + ((v - ymin) / (ymax - ymin || 1)) * (x1 - x0) : y1 - ((v - ymin) / (ymax - ymin || 1)) * (y1 - y0));
  const bandW = (horizontal ? y1 - y0 : x1 - x0) / Math.max(n, 1);
  const cpos = (i) => (horizontal ? y0 + bandW * i : x0 + bandW * i);
  const gap = Math.min(0.8, Math.max(0, (chart.gap ?? 80) / 100)) ;
  const isBarSeries = (si) => type === 'column' || type === 'bar' || (type === 'combo' && si === 0);
  const barSeries = series.map((_, i) => i).filter(isBarSeries);
  const groupW = bandW / (1 + gap);
  const barW = stacked ? groupW : groupW / Math.max(barSeries.length, 1);
  const stackBase = series.map(() => []);
  if (stacked) {
    for (let i = 0; i < n; i++) {
      let pos = 0; let neg = 0; const tot = pct ? vals.reduce((s, v) => s + Math.abs(v[i]), 0) || 1 : 1;
      vals.forEach((v, k) => { const val = pct ? (v[i] / tot) * 100 : v[i]; if (val >= 0) { stackBase[k][i] = [pos, pos + val]; pos += val; } else { stackBase[k][i] = [neg + val, neg]; neg += val; } });
    }
  }
  const xPoint = (i) => (horizontal ? sv(0) : x0 + bandW * (i + 0.5));
  const lineXY = (si, i) => { const v = stacked ? stackBase[si][i][1] : vals[si][i]; return [x0 + bandW * (i + 0.5), sv(v)]; };
  const ticksV = nt.ticks.filter((t) => t >= ymin - 1e-9 && t <= ymax + 1e-9);
  const catStep = Math.ceil(n / Math.max(1, Math.floor((horizontal ? y1 - y0 : x1 - x0) / (rotate ? 16 : Math.min(catLabLen, 12) * 6.5 + 8))));

  return (
    <g>
      {title}
      {ticksV.map((t) => (
        <g key={t}>
          {horizontal ? <line x1={sv(t)} x2={sv(t)} y1={y0} y2={y1} stroke={GRID} /> : <line x1={x0} x2={x1} y1={sv(t)} y2={sv(t)} stroke={GRID} />}
          {horizontal ? <text x={sv(t)} y={y1 + 15} textAnchor="middle" fontSize="11" fill={SOFT}>{tickLabel(t)}</text> : <text x={x0 - 6} y={sv(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={SOFT}>{tickLabel(t)}</text>}
        </g>
      ))}
      {/* areas */}
      {(type === 'area') && series.map((s, k) => {
        const top = vals[k].map((_, i) => lineXY(k, i)); const bot = stacked ? vals[k].map((_, i) => [x0 + bandW * (i + 0.5), sv(stackBase[k][i][0])]) : vals[k].map((_, i) => [x0 + bandW * (i + 0.5), sv(Math.max(0, ymin))]);
        const d = 'M' + top.map((p) => p.join(',')).join(' L') + ' L' + bot.reverse().map((p) => p.join(',')).join(' L') + 'Z';
        return <path key={k} d={d} fill={colors(k)} fillOpacity=".55" stroke={colors(k)} strokeWidth="1.5" />;
      })}
      {/* bars */}
      {series.map((s, k) => !isBarSeries(k) ? null : vals[k].map((v, i) => {
        const bi = barSeries.indexOf(k);
        const off = stacked ? (bandW - groupW) / 2 : (bandW - groupW) / 2 + bi * barW;
        const [a, b] = stacked ? stackBase[k][i] : [Math.min(0, v), Math.max(0, v)];
        if (s.values[i] === null) return null;
        const p0 = sv(a); const p1 = sv(b);
        const props = horizontal ? { x: Math.min(p0, p1), y: cpos(i) + off, width: Math.abs(p1 - p0), height: barW * 0.96 } : { x: cpos(i) + off, y: Math.min(p0, p1), width: barW * 0.96, height: Math.abs(p1 - p0) };
        return (
          <g key={k + '-' + i}>
            <rect {...props} fill={colors(k)} rx="1.5"><title>{`${s.name} - ${cats[i]}: ${f(v)}`}</title></rect>
            {chart.labels && <text x={horizontal ? props.x + props.width + 4 : props.x + props.width / 2} y={horizontal ? props.y + props.height / 2 : props.y - 4} textAnchor={horizontal ? 'start' : 'middle'} dominantBaseline={horizontal ? 'middle' : 'auto'} fontSize="10" fill={INK}>{f(v)}</text>}
          </g>
        );
      }))}
      {/* lines */}
      {(type === 'line' || type === 'combo' || type === 'area') && series.map((s, k) => {
        if (type === 'combo' && k === 0) return null;
        const pts = s.values.map((v, i) => (v === null ? null : lineXY(k, i)));
        const segs = []; let cur = [];
        pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
        const path = (seg) => (chart.smooth && seg.length > 2 ? 'M' + seg[0].join(',') + seg.slice(1).map((p, i) => { const q = seg[i]; const mx = (q[0] + p[0]) / 2; return ` C${mx},${q[1]} ${mx},${p[1]} ${p[0]},${p[1]}`; }).join('') : 'M' + seg.map((p) => p.join(',')).join(' L'));
        return (
          <g key={k}>
            {type !== 'area' && segs.map((seg, j) => <path key={j} d={path(seg)} fill="none" stroke={colors(k)} strokeWidth="2.2" strokeLinejoin="round" />)}
            {type !== 'area' && pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={n > 40 ? 0 : 3.2} fill="#fff" stroke={colors(k)} strokeWidth="2"><title>{`${s.name} - ${cats[i]}: ${f(s.values[i])}`}</title></circle>)}
            {chart.labels && pts.map((p, i) => p && <text key={'l' + i} x={p[0]} y={p[1] - 8} textAnchor="middle" fontSize="10" fill={INK}>{f(s.values[i])}</text>)}
          </g>
        );
      })}
      {/* axes + category labels */}
      {horizontal ? <line x1={sv(0)} x2={sv(0)} y1={y0} y2={y1} stroke="#9aa0a6" /> : <line x1={x0} x2={x1} y1={sv(Math.max(ymin, Math.min(0, ymax)))} y2={sv(Math.max(ymin, Math.min(0, ymax)))} stroke="#9aa0a6" />}
      {cats.map((c, i) => (i % catStep ? null : horizontal
        ? <text key={i} x={x0 - 6} y={cpos(i) + bandW / 2} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={SOFT}>{trunc(c, 16)}</text>
        : <text key={i} x={x0 + bandW * (i + 0.5)} y={y1 + 15} textAnchor={rotate ? 'end' : 'middle'} fontSize="11" fill={SOFT} transform={rotate ? `rotate(-40 ${x0 + bandW * (i + 0.5)} ${y1 + 15})` : undefined}>{trunc(c, rotate ? 14 : 12)}</text>))}
      {chart.xTitle && <text x={(x0 + x1) / 2} y={H - L.bottom - 2 + (legendPos === 'bottom' ? 0 : 0)} textAnchor="middle" fontSize="11" fill={SOFT}>{chart.xTitle}</text>}
      {chart.yTitle && <text transform={`translate(${L.left + 6},${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill={SOFT}>{chart.yTitle}</text>}
      {legend}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" />
      {void xPoint}
    </g>
  );
}

const Chart = memo(function Chart({ chart, data, width, height, scale = 1 }) {
  return (
    <svg width={width * scale} height={height * scale} viewBox={`0 0 ${Math.max(120, width)} ${Math.max(90, height)}`} role="img" aria-label={chart.title || 'Chart'} style={{ display: 'block', background: chart.bg === undefined ? '#fff' : chart.bg || 'transparent', fontFamily: chart.font || 'Arial, Helvetica, sans-serif' }}>
      <ChartInner chart={chart} data={data} width={width} height={height} fmt={chart.fmt} />
    </svg>
  );
});
export default Chart;
