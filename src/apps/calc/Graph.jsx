import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { compile } from './engine.js';
import { download } from '../../components/fxui.jsx';

export const GRAPH_COLORS = ['#c239b3', '#0f6cbd', '#107c10', '#da3b01', '#8764b8', '#038387', '#c19c00', '#d13438'];
export const EXAMPLES = ['sin(x)', 'x^2 - 4', '1/x', 'a*sin(b*x)', 'abs(x)', 'sqrt(x)', 'x^3 - 3x', 'tan(x)', 'e^(-x^2)', 'ln(x)'];
const strip = (s) => s.replace(/^\s*(y|f\(x\))\s*=\s*/i, '');

function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p; }
const fmt = (v) => { if (!Number.isFinite(v)) return '—'; const a = Math.abs(v); if (a !== 0 && (a >= 1e6 || a < 1e-4)) return v.toExponential(3); return String(parseFloat(v.toPrecision(6))); };

export function usesParam(eqs, p) { return eqs.some((e) => new RegExp(`(^|[^a-zA-Z_])${p}([^a-zA-Z_(]|$)`).test(strip(e.expr))); }

export default function Graph({ eqs, setEqs, view, setView, params, setParams, radians, setRadians }) {
  const cvs = useRef(null); const box = useRef(null); const [size, setSize] = useState({ w: 600, h: 400 });
  const [hover, setHover] = useState(null); const [active, setActive] = useState(eqs[0] ? eqs[0].id : null); const drag = useRef(null);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const compiled = useMemo(() => eqs.map((e) => { const src = strip(e.expr); if (!src.trim()) return { id: e.id, f: null }; try { return { id: e.id, f: compile(src, { vars: ['x', 'a', 'b', 'c'] }) }; } catch (er) { return { id: e.id, f: null, err: 'Not a valid equation' }; } }), [eqs]);
  const env = (x) => ({ x, a: params.a, b: params.b, c: params.c, angle: radians ? 'rad' : 'deg', lenient: true });
  const fx = (c, x) => { try { const y = c.f(env(x)); return typeof y === 'number' ? y : NaN; } catch { return NaN; } };

  useEffect(() => { const ro = new ResizeObserver(() => { const r = box.current.getBoundingClientRect(); setSize({ w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)) }); }); ro.observe(box.current); return () => ro.disconnect(); }, []);

  const analysis = useMemo(() => {
    const eq = compiled.find((c) => c.id === active); if (!eq || !eq.f) return null;
    const x0 = view.cx - size.w / 2 / view.s; const x1 = view.cx + size.w / 2 / view.s; const N = 800; const dx = (x1 - x0) / N;
    const f = (x) => fx(eq, x); const roots = []; const ext = [];
    let px = x0; let py = f(px);
    const ys = [py];
    for (let i = 1; i <= N; i++) {
      const x = x0 + i * dx; const y = f(x); ys.push(y);
      if (Number.isFinite(py) && Number.isFinite(y) && ((py < 0 && y > 0) || (py > 0 && y < 0))) {
        let lo = px; let hi = x; for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; const fm = f(m); if ((f(lo) < 0) === (fm < 0)) lo = m; else hi = m; }
        const r = (lo + hi) / 2; if (Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(py) + Math.abs(y))) roots.push({ x: r, y: 0 });
      } else if (Number.isFinite(y) && y === 0 && !(Number.isFinite(py) && py === 0)) roots.push({ x, y: 0 });
      px = x; py = y;
    }
    for (let i = 1; i < N; i++) {
      const a = ys[i - 1]; const b = ys[i]; const c = ys[i + 1]; if (![a, b, c].every(Number.isFinite)) continue;
      if ((b > a && b >= c) || (b < a && b <= c)) {
        if (b === a && b === c) continue; const isMax = b > a; let lo = x0 + (i - 1) * dx; let hi = x0 + (i + 1) * dx;
        for (let k = 0; k < 60; k++) { const m1 = lo + (hi - lo) / 3; const m2 = hi - (hi - lo) / 3; if ((f(m1) > f(m2)) === isMax) hi = m2; else lo = m1; }
        const x = (lo + hi) / 2; const y = f(x); if (Number.isFinite(y) && !ext.some((e) => Math.abs(e.x - x) < dx * 3)) ext.push({ x, y, kind: isMax ? 'Maximum' : 'Minimum' });
      }
    }
    const y0 = f(0);
    return { roots: roots.slice(0, 12), ext: ext.slice(0, 12), y0: Number.isFinite(y0) ? y0 : null };
  }, [compiled, active, view, size, params, radians]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = cvs.current; const dpr = window.devicePixelRatio || 1; c.width = size.w * dpr; c.height = size.h * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr);
    const css = getComputedStyle(box.current); const col = (n) => css.getPropertyValue(n).trim() || '#888';
    g.fillStyle = col('--card'); g.fillRect(0, 0, size.w, size.h);
    const { cx, cy, s } = view; const W = size.w; const H = size.h;
    const X = (x) => W / 2 + (x - cx) * s; const Y = (y) => H / 2 - (y - cy) * s;
    const step = niceStep(70 / s); const minor = step / 5;
    const xl = cx - W / 2 / s; const xr = cx + W / 2 / s; const yb = cy - H / 2 / s; const yt = cy + H / 2 / s;
    g.lineWidth = 1; g.font = '11px "Segoe UI", system-ui, sans-serif'; g.textBaseline = 'top';
    g.strokeStyle = col('--line'); g.globalAlpha = 0.45; g.beginPath();
    for (let x = Math.ceil(xl / minor) * minor; x <= xr; x += minor) { const px = Math.round(X(x)) + 0.5; g.moveTo(px, 0); g.lineTo(px, H); }
    for (let y = Math.ceil(yb / minor) * minor; y <= yt; y += minor) { const py = Math.round(Y(y)) + 0.5; g.moveTo(0, py); g.lineTo(W, py); }
    g.stroke(); g.globalAlpha = 1; g.strokeStyle = col('--line2'); g.beginPath();
    for (let x = Math.ceil(xl / step) * step; x <= xr; x += step) { const px = Math.round(X(x)) + 0.5; g.moveTo(px, 0); g.lineTo(px, H); }
    for (let y = Math.ceil(yb / step) * step; y <= yt; y += step) { const py = Math.round(Y(y)) + 0.5; g.moveTo(0, py); g.lineTo(W, py); }
    g.stroke();
    const ax = Math.min(Math.max(X(0), 0), W); const ay = Math.min(Math.max(Y(0), 0), H);
    g.strokeStyle = col('--ink2'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, ay); g.lineTo(W, ay); g.moveTo(ax, 0); g.lineTo(ax, H); g.stroke();
    g.fillStyle = col('--ink2');
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    g.textAlign = 'center'; for (let x = Math.ceil(xl / step) * step; x <= xr; x += step) { if (Math.abs(x) < step / 1e3) continue; const ty = Math.min(Math.max(ay + 4, 2), H - 14); g.fillText(Math.abs(x) >= 1e6 ? x.toExponential(0) : x.toFixed(decimals), X(x), ty); }
    g.textAlign = 'left'; for (let y = Math.ceil(yb / step) * step; y <= yt; y += step) { if (Math.abs(y) < step / 1e3) continue; const tx = ax > W - 40 ? ax - 36 : ax + 5; g.fillText(Math.abs(y) >= 1e6 ? y.toExponential(0) : y.toFixed(decimals), Math.max(2, tx), Y(y) - 6); }
    g.textAlign = 'left'; if (Y(0) >= 0 && Y(0) <= H && X(0) >= 0 && X(0) <= W) g.fillText('0', X(0) + 4, Y(0) + 4);
    // curves
    eqs.forEach((e, idx) => {
      const cc = compiled[idx]; if (!e.on || !cc.f) return;
      g.strokeStyle = e.color; g.lineWidth = e.id === active ? 3 : 2.25; g.lineJoin = 'round'; g.beginPath();
      let pen = false; let ppy = 0;
      for (let px = 0; px <= W; px += 0.75) {
        const x = cx + (px - W / 2) / s; const y = fx(cc, x); const py = Y(y);
        if (!Number.isFinite(y) || Math.abs(py) > 1e6) { pen = false; continue; }
        if (pen && Math.abs(py - ppy) > H * 1.2 && (py - H / 2) * (ppy - H / 2) < 0) pen = false;
        if (pen) g.lineTo(px, py); else g.moveTo(px, py); pen = true; ppy = py;
      }
      g.stroke();
    });
    // analysis markers
    if (showAnalysis && analysis) {
      const eq = eqs.find((q) => q.id === active);
      const mk = (x, y, fill) => { const px = X(x); const py = Y(y); if (px < -5 || px > W + 5 || py < -5 || py > H + 5) return; g.fillStyle = col('--card'); g.strokeStyle = fill; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 4.5, 0, 7); g.fill(); g.stroke(); };
      if (eq && eq.on) { analysis.roots.forEach((r) => mk(r.x, 0, eq.color)); analysis.ext.forEach((r) => mk(r.x, r.y, eq.color)); if (analysis.y0 !== null) mk(0, analysis.y0, eq.color); }
    }
    // hover
    if (hover) {
      const x = cx + (hover.px - W / 2) / s; g.strokeStyle = col('--ink3'); g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(hover.px + 0.5, 0); g.lineTo(hover.px + 0.5, H); g.stroke(); g.setLineDash([]);
      eqs.forEach((e, idx) => { const cc = compiled[idx]; if (!e.on || !cc.f) return; const y = fx(cc, x); if (!Number.isFinite(y)) return; const py = Y(y); if (py < -10 || py > H + 10) return; g.fillStyle = e.color; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(hover.px, py, 5, 0, 7); g.fill(); g.stroke(); });
    }
  });

  const pt = (e) => { const r = cvs.current.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
  const down = (e) => { cvs.current.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; };
  const move = (e) => {
    const p = pt(e);
    if (drag.current) { const d = drag.current; setView({ ...view, cx: d.cx - (e.clientX - d.x) / view.s, cy: d.cy + (e.clientY - d.y) / view.s }); setHover(null); } else setHover(p);
  };
  const up = () => { drag.current = null; };
  const zoomAt = (f, px, py) => { const ox = px === undefined ? size.w / 2 : px; const oy = py === undefined ? size.h / 2 : py; const wx = view.cx + (ox - size.w / 2) / view.s; const wy = view.cy - (oy - size.h / 2) / view.s; const ns = Math.min(1e6, Math.max(1e-4, view.s * f)); setView({ s: ns, cx: wx - (ox - size.w / 2) / ns, cy: wy + (oy - size.h / 2) / ns }); };
  useEffect(() => { const c = cvs.current; const wh = (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }; c.addEventListener('wheel', wh, { passive: false }); return () => c.removeEventListener('wheel', wh); });
  const exportPng = () => cvs.current.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'graph.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  const update = (id, p) => setEqs((l) => l.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const add = (expr = '') => { const id = Math.random().toString(36).slice(2, 9); setEqs((l) => [...l, { id, expr, color: GRAPH_COLORS[l.length % GRAPH_COLORS.length], on: true }]); setActive(id); };
  const hoverX = hover ? view.cx + (hover.px - size.w / 2) / view.s : null;

  return (
    <div className="calc-graph">
      <div className="calc-geq">
        <div className="calc-geq-h"><b>Equations</b><span className="spacer" />
          <button className="fb sub sm" onClick={() => add('')}><Icon name="plus" size={14} />Add</button></div>
        {eqs.map((e, i) => (
          <div key={e.id} className={'calc-eq' + (active === e.id ? ' act' : '')} onClick={() => setActive(e.id)}>
            <button className="calc-eq-dot" style={{ background: e.on ? e.color : 'transparent', borderColor: e.color }} aria-label={e.on ? 'Hide equation' : 'Show equation'} onClick={(ev) => { ev.stopPropagation(); update(e.id, { on: !e.on }); }} />
            <span className="muted">y =</span>
            <input className="fi" value={e.expr} placeholder="Enter an equation, e.g. sin(x)" aria-label={`Equation ${i + 1}`} spellCheck={false} onChange={(ev) => update(e.id, { expr: ev.target.value })} />
            <button className="fb sub ico sm" aria-label="Remove equation" onClick={(ev) => { ev.stopPropagation(); setEqs((l) => (l.length > 1 ? l.filter((x) => x.id !== e.id) : l.map((x) => ({ ...x, expr: '' })))); }}><Icon name="x" size={14} /></button>
            {compiled[i] && compiled[i].err && <div className="calc-eq-err">{compiled[i].err}</div>}
          </div>
        ))}
        {['a', 'b', 'c'].filter((p) => usesParam(eqs, p)).map((p) => (
          <div key={p} className="calc-slider"><label>{p} = <b>{params[p]}</b></label><input type="range" min="-10" max="10" step="0.1" value={params[p]} aria-label={`Parameter ${p}`} onChange={(ev) => setParams({ ...params, [p]: +ev.target.value })} /></div>
        ))}
        <div className="calc-gopts"><label className="chk"><input type="checkbox" checked={radians} onChange={(e) => setRadians(e.target.checked)} />Radians (uncheck for degrees)</label><label className="chk"><input type="checkbox" checked={showAnalysis} onChange={(e) => setShowAnalysis(e.target.checked)} />Show zeros and extrema</label></div>
        {showAnalysis && analysis && (analysis.roots.length > 0 || analysis.ext.length > 0 || analysis.y0 !== null) && (
          <div className="calc-ana"><b>Key points</b>
            {analysis.y0 !== null && <div>y-intercept <span>(0, {fmt(analysis.y0)})</span></div>}
            {analysis.roots.map((r, i) => <div key={'r' + i}>Zero <span>({fmt(r.x)}, 0)</span></div>)}
            {analysis.ext.map((r, i) => <div key={'e' + i}>{r.kind} <span>({fmt(r.x)}, {fmt(r.y)})</span></div>)}
          </div>
        )}
        <div className="calc-ex"><b>Examples</b><div>{EXAMPLES.map((x) => <button key={x} className="fx-chip" onClick={() => add(x)}>{x}</button>)}</div></div>
      </div>
      <div className="calc-gcanvas" ref={box}>
        <canvas ref={cvs} style={{ width: size.w, height: size.h, touchAction: 'none', cursor: drag.current ? 'grabbing' : 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { setHover(null); up(); }} aria-label="Graph. Drag to pan, scroll to zoom." role="img" />
        <div className="calc-gtools">
          <button className="fb ico" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><Icon name="plus" size={16} /></button>
          <button className="fb ico" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4)}><Icon name="minus" size={16} /></button>
          <button className="fb ico" aria-label="Reset view" title="Reset view" onClick={() => setView({ cx: 0, cy: 0, s: 40 })}><Icon name="home" size={16} /></button>
          <button className="fb ico" aria-label="Save as image" title="Save as image" onClick={exportPng}><Icon name="download" size={16} /></button>
        </div>
        {hover && hoverX !== null && (
          <div className="calc-gtip" style={{ left: Math.min(hover.px + 14, size.w - 150), top: Math.min(hover.py + 14, size.h - 20 - 22 * (1 + eqs.length)) }}>
            <div>x = {fmt(hoverX)}</div>
            {eqs.map((e, i) => (e.on && compiled[i].f ? <div key={e.id}><i style={{ background: e.color }} />y = {fmt(fx(compiled[i], hoverX))}</div> : null))}
          </div>
        )}
      </div>
    </div>
  );
}
