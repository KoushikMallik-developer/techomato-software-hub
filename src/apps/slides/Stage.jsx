import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { SlideView } from './Render.jsx';
import { SW, SH, aabb, bounds, corners, rad, withGroups } from './model.js';

const BLUE = '#2563eb';
const HANDLES = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];
const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };

function hit(els, x, y, tol) {
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    const cx = e.x + e.w / 2; const cy = e.y + e.h / 2; const a = -rad(e.rot || 0);
    const dx = x - cx; const dy = y - cy; const lx = dx * Math.cos(a) - dy * Math.sin(a); const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (e.type === 'line') {
      const x1 = -e.w / 2 * (e.flipH ? -1 : 1); const x2 = -x1; const y1 = -e.h / 2 * (e.flipV ? -1 : 1); const y2 = -y1;
      const vx = x2 - x1; const vy = y2 - y1; const L = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((lx - x1) * vx + (ly - y1) * vy) / L));
      const d = Math.hypot(lx - (x1 + t * vx), ly - (y1 + t * vy));
      if (d <= Math.max(tol, (e.stroke ? e.stroke.w : 3) / 2 + tol / 2)) return e;
      continue;
    }
    if (Math.abs(lx) <= e.w / 2 && Math.abs(ly) <= e.h / 2) {
      // transparent empty text boxes are only hit inside their box (fine); shapes with no fill and no text pass through
      return e;
    }
  }
  return null;
}

const Stage = forwardRef(function Stage({
  deck, slide, si, scale, sel, editing, editCell, showGrid, gridSize = 20, snapOn, gridSnap, rulers,
  onSelect, onPatch, onEditText, onEditCell, onChartEdit, onContext, onDropFiles, handlers, onMoveStart,
}, ref) {
  const wrap = useRef(null);
  const slideRef = useRef(null);
  const [marquee, setMarquee] = useState(null);
  const [guides, setGuides] = useState([]);
  const drag = useRef(null);
  const seq = useRef(0);
  const els = slide.els;
  const selEls = useMemo(() => els.filter((e) => sel.includes(e.id)), [els, sel]);

  useImperativeHandle(ref, () => ({ rect: () => slideRef.current && slideRef.current.getBoundingClientRect(), el: () => slideRef.current }), []);

  const pt = (ev) => { const r = slideRef.current.getBoundingClientRect(); return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale }; };

  /* snapping candidates */
  const lines = useCallback((skip) => {
    const xs = [0, SW / 2, SW]; const ys = [0, SH / 2, SH];
    for (const e of els) { if (skip.has(e.id)) continue; const q = aabb(e); xs.push(q.x1, (q.x1 + q.x2) / 2, q.x2); ys.push(q.y1, (q.y1 + q.y2) / 2, q.y2); }
    return { xs, ys };
  }, [els]);
  const snapAxis = (vals, cands, thr) => {
    let best = null;
    for (const v of vals) for (const c of cands) { const d = c - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c }; }
    return best;
  };

  const startDrag = (e, kind, extra) => {
    const key = 'drag' + ++seq.current;
    drag.current = { kind, key, start: pt(e), startClient: { x: e.clientX, y: e.clientY }, moved: false, ...extra };
    onMoveStart && onMoveStart();
    const mv = (ev) => onDragMove(ev);
    const up = (ev) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); onDragEnd(ev); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const onDragMove = (ev) => {
    const d = drag.current; if (!d) return;
    const p = pt(ev);
    if (!d.moved && Math.hypot(ev.clientX - d.startClient.x, ev.clientY - d.startClient.y) < 3) return;
    d.moved = true;
    const noSnap = ev.altKey;
    if (d.kind === 'marquee') {
      const r = { x1: Math.min(d.start.x, p.x), y1: Math.min(d.start.y, p.y), x2: Math.max(d.start.x, p.x), y2: Math.max(d.start.y, p.y) };
      setMarquee(r);
      const inside = els.filter((e) => { const q = aabb(e); return q.x1 >= r.x1 && q.x2 <= r.x2 && q.y1 >= r.y1 && q.y2 <= r.y2; }).map((e) => e.id);
      const ids = withGroups(els, inside);
      onSelect(d.add ? [...new Set([...d.base, ...ids])] : ids);
      return;
    }
    if (d.kind === 'move') {
      let dx = p.x - d.start.x; let dy = p.y - d.start.y;
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const gl = [];
      if (!noSnap && (snapOn || gridSnap)) {
        const b = d.bb; const thr = 6 / scale;
        const nx = [b.x1 + dx, (b.x1 + b.x2) / 2 + dx, b.x2 + dx]; const ny = [b.y1 + dy, (b.y1 + b.y2) / 2 + dy, b.y2 + dy];
        if (snapOn) {
          const sx = snapAxis(nx, d.lines.xs, thr); const sy = snapAxis(ny, d.lines.ys, thr);
          if (sx) { dx += sx.d; gl.push({ v: sx.at }); } if (sy) { dy += sy.d; gl.push({ h: sy.at }); }
        }
        if (gridSnap && !gl.length) { dx = Math.round((b.x1 + dx) / gridSize) * gridSize - b.x1; dy = Math.round((b.y1 + dy) / gridSize) * gridSize - b.y1; }
      }
      setGuides(gl);
      const patches = {}; for (const o of d.orig) patches[o.id] = { x: Math.round((o.x + dx) * 10) / 10, y: Math.round((o.y + dy) * 10) / 10 };
      onPatch(patches, { coalesce: d.key });
      return;
    }
    if (d.kind === 'rotate') {
      const o = d.orig; const cx = o.x + o.w / 2; const cy = o.y + o.h / 2;
      let ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) ang = Math.round(ang / 15) * 15; else { for (const t of [0, 90, 180, -90, -180, 270]) if (Math.abs(ang - t) < 3) ang = t; }
      ang = ((ang % 360) + 360) % 360;
      onPatch({ [o.id]: { rot: Math.round(ang * 10) / 10 } }, { coalesce: d.key });
      return;
    }
    if (d.kind === 'lineend') {
      const o = d.orig; // endpoint index 0 or 1; absolute endpoints
      const ends = d.ends.map((q) => ({ ...q })); ends[d.idx] = { x: p.x, y: p.y };
      if (ev.shiftKey) { const other = ends[1 - d.idx]; const dx = ends[d.idx].x - other.x; const dy = ends[d.idx].y - other.y; const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12); const L = Math.hypot(dx, dy); ends[d.idx] = { x: other.x + Math.cos(a) * L, y: other.y + Math.sin(a) * L }; }
      const x1 = Math.min(ends[0].x, ends[1].x); const y1 = Math.min(ends[0].y, ends[1].y);
      onPatch({ [o.id]: { x: x1, y: y1, w: Math.abs(ends[0].x - ends[1].x), h: Math.abs(ends[0].y - ends[1].y), flipH: ends[0].x > ends[1].x, flipV: ends[0].y > ends[1].y, rot: 0 } }, { coalesce: d.key });
      return;
    }
    if (d.kind === 'resize') {
      const o = d.orig; const [name, hx, hy] = d.handle; const a = rad(o.rot || 0); const c = Math.cos(a); const s = Math.sin(a);
      // pointer delta in element-local axes
      const gdx = p.x - d.start.x; const gdy = p.y - d.start.y; const ldx = gdx * c + gdy * s; const ldy = -gdx * s + gdy * c;
      let w = o.w; let h = o.h; let ox = 0; let oy = 0; // ox,oy shift of top-left in local axes
      if (hx === 1) w = o.w + ldx; else if (hx === 0 && name.includes('w')) { w = o.w - ldx; ox = ldx; }
      if (hy === 1) h = o.h + ldy; else if (hy === 0 && name.includes('n')) { h = o.h - ldy; oy = ldy; }
      const keep = ev.shiftKey || (o.type === 'image' && !ev.altKey) || d.ratioLock;
      if (keep && o.w > 0 && o.h > 0 && name.length === 2) {
        const r = o.w / o.h; if (Math.abs(w / o.w) > Math.abs(h / o.h)) { const nh = w / r; if (name.includes('n')) oy = o.h - nh; h = nh; } else { const nw = h * r; if (name.includes('w')) ox = o.w - nw; w = nw; }
      }
      const minS = 4;
      if (w < minS) { if (name.includes('w')) ox -= minS - w; w = minS; } if (h < minS && o.type !== 'line') { if (name.includes('n')) oy -= minS - h; h = minS; }
      // new centre in global coords
      const cxl = ox + w / 2 - o.w / 2; const cyl = oy + h / 2 - o.h / 2;
      const ncx = o.x + o.w / 2 + cxl * c - cyl * s; const ncy = o.y + o.h / 2 + cxl * s + cyl * c;
      let nx = ncx - w / 2; let ny = ncy - h / 2;
      const gl = [];
      if (!noSnap && snapOn && !o.rot) {
        const thr = 6 / scale; const L = d.lines;
        if (name.includes('e') || name.includes('w')) { const edge = name.includes('w') ? nx : nx + w; const sx = snapAxis([edge], L.xs, thr); if (sx) { if (name.includes('w')) { w += nx - sx.at; nx = sx.at; } else w = sx.at - nx; gl.push({ v: sx.at }); } }
        if (name.includes('n') || name.includes('s')) { const edge = name.includes('n') ? ny : ny + h; const sy = snapAxis([edge], L.ys, thr); if (sy) { if (name.includes('n')) { h += ny - sy.at; ny = sy.at; } else h = sy.at - ny; gl.push({ h: sy.at }); } }
      }
      setGuides(gl);
      const patch = { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 };
      if (o.type === 'table') { patch.rowH = o.rowH.map((r) => (r * patch.h) / o.h); }
      onPatch({ [o.id]: patch }, { coalesce: d.key });
    }
  };

  const onDragEnd = () => {
    const d = drag.current; drag.current = null; setMarquee(null); setGuides([]);
    if (!d) return;
    if (d.kind === 'move' && !d.moved && d.clickEdit) onEditText(d.clickEdit);
  };

  const onPointerDown = (e) => {
    if (e.button === 2) return;
    if (e.target.closest && (e.target.closest('.stext.editing') || e.target.closest('.cellta'))) return;
    if (e.target.closest && e.target.closest('.hdl')) return;
    if (editing && handlers.commitEditing) handlers.commitEditing();
    if (editCell && handlers.commitEditing) handlers.commitEditing();
    const p = pt(e);
    const tol = 6 / scale;
    const target = hit(els, p.x, p.y, tol);
    wrap.current && wrap.current.focus({ preventScroll: true });
    if (!target) {
      if (!e.shiftKey) onSelect([]);
      startDrag(e, 'marquee', { add: e.shiftKey, base: e.shiftKey ? sel : [] });
      return;
    }
    const ids = withGroups(els, [target.id]);
    let nextSel;
    if (e.shiftKey || e.ctrlKey || e.metaKey) nextSel = sel.includes(target.id) ? sel.filter((i) => !ids.includes(i)) : [...new Set([...sel, ...ids])];
    else nextSel = sel.includes(target.id) ? sel : ids;
    const wasSelected = sel.length === 1 && sel[0] === target.id && !e.shiftKey;
    onSelect(nextSel);
    if (!nextSel.length || (e.shiftKey && !nextSel.includes(target.id))) return;
    if (target.locked) return;
    const mover = els.filter((x) => nextSel.includes(x.id) && !x.locked);
    const clickEdit = wasSelected && !editing && (target.type === 'text' || target.type === 'shape') ? target.id : null;
    startDrag(e, 'move', { orig: mover.map((x) => ({ id: x.id, x: x.x, y: x.y })), bb: bounds(mover), lines: lines(new Set(mover.map((x) => x.id))), clickEdit });
  };

  const onDoubleClick = (e) => {
    if (e.target.closest && (e.target.closest('.stext.editing') || e.target.closest('.cellta'))) return;
    const p = pt(e); const t = hit(els, p.x, p.y, 6 / scale); if (!t) return;
    if (t.type === 'text' || t.type === 'shape') { onSelect([t.id]); onEditText(t.id); }
    else if (t.type === 'table') { const td = e.target.closest && e.target.closest('td'); if (td) { onSelect([t.id]); onEditCell(t.id, Number(td.dataset.r), Number(td.dataset.c)); } }
    else if (t.type === 'chart') onChartEdit && onChartEdit(t.id);
    else if (t.type === 'line') onSelect([t.id]);
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    const p = pt(e); const t = hit(els, p.x, p.y, 6 / scale);
    if (t && !sel.includes(t.id)) onSelect(withGroups(els, [t.id]));
    onContext && onContext(e, t ? t.id : null, p);
  };

  const onResizeDown = (e, handle) => {
    e.stopPropagation(); e.preventDefault();
    const o = selEls[0]; if (!o || o.locked) return;
    startDrag(e, 'resize', { orig: { ...o }, handle, lines: lines(new Set([o.id])) });
  };
  const onRotateDown = (e) => { e.stopPropagation(); e.preventDefault(); const o = selEls[0]; if (!o || o.locked) return; startDrag(e, 'rotate', { orig: { ...o } }); };
  const onLineEndDown = (e, idx) => {
    e.stopPropagation(); e.preventDefault(); const o = selEls[0]; if (!o) return;
    const cs = corners({ ...o, rot: o.rot || 0 }); // tl, tr, br, bl (rotated)
    const a = o.flipH ? 1 : 0; const b = o.flipV ? 3 : 0;
    void a; void b;
    const p1 = o.flipH ? (o.flipV ? cs[2] : cs[1]) : o.flipV ? cs[3] : cs[0];
    const p2 = o.flipH ? (o.flipV ? cs[0] : cs[3]) : o.flipV ? cs[1] : cs[2];
    startDrag(e, 'lineend', { orig: { ...o }, idx, ends: [{ x: p1[0], y: p1[1] }, { x: p2[0], y: p2[1] }] });
  };

  /* ---------- overlay ---------- */
  const hs = 9 / scale; const bw = 1.5 / scale;
  const single = selEls.length === 1 ? selEls[0] : null;
  const gb = selEls.length > 1 ? bounds(selEls) : null;
  const showHandles = single && !editing && !single.locked && !(editCell && editCell.id === single.id);

  const dropProps = {
    onDragOver: (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); } },
    onDrop: (e) => { const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (files.length) { e.preventDefault(); onDropFiles && onDropFiles(files, pt(e)); } },
  };

  const overlay = (
    <div className="stageov" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {showGrid && <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(to right, rgba(0,0,0,.08) ${1 / scale}px, transparent ${1 / scale}px), linear-gradient(to bottom, rgba(0,0,0,.08) ${1 / scale}px, transparent ${1 / scale}px)`, backgroundSize: `${gridSize}px ${gridSize}px` }} />}
      {selEls.map((e) => (
        <div key={e.id} style={{ position: 'absolute', left: e.x, top: e.y, width: e.w, height: Math.max(e.h, 0), transform: `rotate(${e.rot || 0}deg)`, outline: e.type === 'line' ? 'none' : `${bw}px solid ${e.locked ? '#9ca3af' : BLUE}`, outlineOffset: 0, boxSizing: 'border-box' }}>
          {e.locked && <span className="lockbadge" style={{ transform: `scale(${1 / scale})` }}>🔒</span>}
        </div>
      ))}
      {gb && <div style={{ position: 'absolute', left: gb.x1, top: gb.y1, width: gb.w, height: gb.h, outline: `${bw}px dashed ${BLUE}`, boxSizing: 'border-box' }} />}
      {showHandles && single.type === 'line' && [0, 1].map((i) => {
        const cs = corners(single); const p1 = single.flipH ? (single.flipV ? cs[2] : cs[1]) : single.flipV ? cs[3] : cs[0]; const p2 = single.flipH ? (single.flipV ? cs[0] : cs[3]) : single.flipV ? cs[1] : cs[2];
        const p = i === 0 ? p1 : p2;
        return <div key={i} className="hdl" onPointerDown={(e) => onLineEndDown(e, i)} style={{ position: 'absolute', left: p[0] - hs / 2, top: p[1] - hs / 2, width: hs, height: hs, borderRadius: '50%', background: '#fff', border: `${bw}px solid ${BLUE}`, cursor: 'crosshair', pointerEvents: 'auto' }} />;
      })}
      {showHandles && single.type !== 'line' && (
        <div style={{ position: 'absolute', left: single.x, top: single.y, width: single.w, height: single.h, transform: `rotate(${single.rot || 0}deg)`, pointerEvents: 'none' }}>
          {HANDLES.map((h) => (
            <div key={h[0]} className="hdl" onPointerDown={(e) => onResizeDown(e, h)}
              style={{ position: 'absolute', left: `calc(${h[1] * 100}% - ${hs / 2}px)`, top: `calc(${h[2] * 100}% - ${hs / 2}px)`, width: hs, height: hs, background: '#fff', border: `${bw}px solid ${BLUE}`, borderRadius: 2 / scale, cursor: CURSORS[h[0]], pointerEvents: 'auto', boxSizing: 'border-box' }} />
          ))}
          <div className="hdl" onPointerDown={onRotateDown} title="Rotate"
            style={{ position: 'absolute', left: `calc(50% - ${hs / 2}px)`, top: -26 / scale - hs / 2, width: hs, height: hs, borderRadius: '50%', background: '#fff', border: `${bw}px solid ${BLUE}`, cursor: 'grab', pointerEvents: 'auto', boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', left: '50%', top: -26 / scale + hs / 2, width: bw, height: 26 / scale - hs / 2, background: BLUE }} />
        </div>
      )}
      {marquee && <div style={{ position: 'absolute', left: marquee.x1, top: marquee.y1, width: marquee.x2 - marquee.x1, height: marquee.y2 - marquee.y1, background: 'rgba(37,99,235,.12)', border: `${bw}px solid ${BLUE}` }} />}
      {guides.map((g, i) => (g.v !== undefined
        ? <div key={i} style={{ position: 'absolute', left: g.v - 0.5 / scale, top: 0, width: 1 / scale, height: SH, background: '#e11d8f' }} />
        : <div key={i} style={{ position: 'absolute', top: g.h - 0.5 / scale, left: 0, height: 1 / scale, width: SW, background: '#e11d8f' }} />))}
    </div>
  );

  return (
    <div className="stagewrap" ref={wrap} tabIndex={0} data-stage="1">
      <div className="stageslide" ref={slideRef} style={{ width: SW * scale, height: SH * scale, position: 'relative', boxShadow: '0 2px 14px rgba(0,0,0,.28)' }}
        onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} {...dropProps}>
        <SlideView slide={slide} deck={deck} index={si} scale={scale} mode="edit" editing={editing} editCell={editCell} handlers={handlers} overlay={overlay} />
      </div>
    </div>
  );
});
export default Stage;
