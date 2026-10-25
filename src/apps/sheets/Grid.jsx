import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MAX_COLS, MAX_ROWS, colName, keyOf } from '../../lib/sheet/addr.js';
import { Axis, DEFAULT_COLW, DEFAULT_ROWH, mergeAt, normRange, styleIndexAt } from '../../lib/sheet/model.js';
import { formatValue } from '../../lib/sheet/numfmt.js';
import { SErr } from '../../lib/sheet/values.js';
import { tokenize } from '../../lib/sheet/parser.js';
import { dvRuleAt, dvItems } from '../../lib/sheet/cf.js';
import { Spark } from '../../lib/sheet/fn_misc.js';
import { chartData } from '../../lib/sheet/chartData.js';
import { FUNCS } from '../../lib/sheet/functions.js';
import Chart from './Chart.jsx';
import { DEFAULT_FONT_FAMILY, fontString, measureText } from './measure.js';
import { FN_SIGS } from './fnmeta.js';

export const HDR_W = 48;
export const HDR_H = 24;
const REF_COLORS = ['#1a73e8', '#d93025', '#188038', '#e37400', '#9334e6', '#00897b', '#c2185b', '#5f6368'];
const BORDER_W = { thin: 1, medium: 2, thick: 3, dashed: 1, dotted: 1, double: 3 };
const BORDER_CSS = { thin: 'solid', medium: 'solid', thick: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FN_NAMES = Object.keys(FUNCS).sort();

const isPrintable = (e) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
const rangeFrom = (a, b) => ({ r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) });

/* grow a range so that it fully contains any merged cells it touches */
function expandMerges(sh, g) {
  let cur = { ...g }; let changed = true; let guard = 0;
  while (changed && guard++ < 8) {
    changed = false;
    for (const m of sh.merges) {
      if (m.r1 <= cur.r2 && cur.r1 <= m.r2 && m.c1 <= cur.c2 && cur.c1 <= m.c2) {
        const n = { r1: Math.min(cur.r1, m.r1), c1: Math.min(cur.c1, m.c1), r2: Math.max(cur.r2, m.r2), c2: Math.max(cur.c2, m.c2) };
        if (n.r1 !== cur.r1 || n.c1 !== cur.c1 || n.r2 !== cur.r2 || n.c2 !== cur.c2) { cur = n; changed = true; }
      }
    }
  }
  return cur;
}

/* function-call context at caret for hints: returns { name, argIndex } */
export function callContext(text, caret) {
  if (!text.startsWith('=')) return null;
  let depth = 0; const stack = [];
  let toks;
  try { toks = tokenize(text.slice(1)); } catch { toks = null; }
  if (!toks) return null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]; const pos = t.start + 1;
    if (pos >= caret) break;
    if (t.t === 'func') { stack.push({ name: t.v.toUpperCase(), arg: 0 }); const nxt = toks[i + 1]; if (nxt && nxt.v === '(') i++; if (nxt && nxt.start + 1 >= caret) { /* caret before paren */ stack.pop(); } }
    else if (t.t === 'op' && t.v === '(') { depth++; stack.push({ name: null, arg: 0 }); }
    else if (t.t === 'op' && t.v === ')') stack.pop();
    else if (t.t === 'op' && (t.v === ',' || t.v === ';')) { if (stack.length) stack[stack.length - 1].arg++; }
  }
  void depth;
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name) return stack[i];
  return null;
}

const Grid = forwardRef(function Grid(props, ref) {
  const {
    book, sh, si, engine, cfFn, zoom: Z = 1, showFormulas, sel, setSel, editing, setEditing, onCommit, onCancelEdit, onEditStart, onCommand,
    marquee, findKeys, barRef, editingRef, selectedChart, onChartSelect, onChartChange, onContextMenu, onResizeEnd, onFill, onFilterBtn, onGrow, readOnly, onClipboard,
  } = props;
  const root = useRef(null); const scroller = useRef(null); const taRef = useRef(null); const view = useRef(null);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [vp, setVp] = useState({ w: 900, h: 500 });
  const [drag, setDrag] = useState(null); // header resize preview
  const [fillPrev, setFillPrev] = useState(null);
  const [hover, setHover] = useState(null); // cursor hint
  const [dvPop, setDvPop] = useState(null);
  const [hint, setHint] = useState({ caret: 0, ac: 0 });
  const dragMode = useRef(null);
  const curTa = () => (editRef.current && editRef.current.src === 'bar' && barRef && barRef.current) || taRef.current;
  const selRef = useRef(sel); selRef.current = sel;
  const editRef = useRef(editing); editRef.current = editing;
  const liveEd = () => (editingRef && editingRef.current !== undefined ? editingRef.current : editRef.current);
  const propsRef = useRef(props); propsRef.current = props;
  const nRows = Math.max(sh.rows, 1); const nCols = Math.max(sh.cols, 1);
  const fr = sh.freeze ? Math.min(sh.freeze.r, nRows) : 0; const fc = sh.freeze ? Math.min(sh.freeze.c, nCols) : 0;

  /* ---------- axes ---------- */
  const colAxis = useMemo(() => {
    const o = {};
    Object.keys(sh.colW || {}).forEach((k) => { o[k] = sh.colW[k] * Z; });
    Object.keys(sh.hidden.cols || {}).forEach((k) => { if (sh.hidden.cols[k]) o[k] = 0; });
    if (drag && drag.kind === 'col') drag.idxs.forEach((i) => { o[i] = drag.size * Z; });
    return new Axis(DEFAULT_COLW * Z, o, nCols);
  }, [sh.colW, sh.hidden.cols, Z, nCols, drag]);
  const rowAxis = useMemo(() => {
    const o = {};
    Object.keys(sh.rowH || {}).forEach((k) => { o[k] = sh.rowH[k] * Z; });
    const hide = { ...(sh.filtered || {}), ...(sh.hidden.rows || {}) };
    Object.keys(hide).forEach((k) => { if (hide[k]) o[k] = 0; });
    if (drag && drag.kind === 'row') drag.idxs.forEach((i) => { o[i] = drag.size * Z; });
    return new Axis(DEFAULT_ROWH * Z, o, nRows);
  }, [sh.rowH, sh.hidden.rows, sh.filtered, Z, nRows, drag]);
  const frozenW = colAxis.offset(fc); const frozenH = rowAxis.offset(fr);
  const totalW = colAxis.total(); const totalH = rowAxis.total();

  /* ---------- viewport ---------- */
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return undefined;
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rafRef = useRef(0);
  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scroller.current; if (!el) return;
      setScroll((s) => (s.x === el.scrollLeft && s.y === el.scrollTop ? s : { x: el.scrollLeft, y: el.scrollTop }));
    });
  }, []);
  // grow the sheet when scrolled near the end
  useEffect(() => {
    const needR = rowAxis.at(scroll.y + vp.h) >= nRows - 5 && nRows < MAX_ROWS; const needC = colAxis.at(scroll.x + vp.w) >= nCols - 3 && nCols < MAX_COLS;
    if (needR || needC) onGrow && onGrow(needR ? nRows + 200 : nRows, needC ? nCols + 10 : nCols);
  }, [scroll, vp, nRows, nCols, rowAxis, colAxis, onGrow]);

  const scrollTo = useCallback((r, c) => {
    const el = scroller.current; if (!el) return;
    const x0 = colAxis.offset(c); const x1 = x0 + colAxis.size(c); const y0 = rowAxis.offset(r); const y1 = y0 + rowAxis.size(r);
    let { scrollLeft: sx, scrollTop: sy } = el;
    const viewW = el.clientWidth - HDR_W; const viewH = el.clientHeight - HDR_H;
    if (c >= fc) { if (x0 < sx + frozenW) sx = Math.max(0, x0 - frozenW); else if (x1 > sx + viewW) sx = x1 - viewW; }
    if (r >= fr) { if (y0 < sy + frozenH) sy = Math.max(0, y0 - frozenH); else if (y1 > sy + viewH) sy = y1 - viewH; }
    if (sx !== el.scrollLeft) el.scrollLeft = sx; if (sy !== el.scrollTop) el.scrollTop = sy;
  }, [colAxis, rowAxis, fc, fr, frozenW, frozenH]);

  useImperativeHandle(ref, () => ({
    scrollTo, focus: () => root.current && root.current.focus({ preventScroll: true }),
    cellRect: (r, c) => { const b = view.current.getBoundingClientRect(); const x = HDR_W + colAxis.offset(c) - (c >= fc ? scroll.x : 0); const y = HDR_H + rowAxis.offset(r) - (r >= fr ? scroll.y : 0); return { left: b.left + x, top: b.top + y, width: colAxis.size(c), height: rowAxis.size(r) }; },
    viewSize: () => ({ rows: Math.max(1, rowAxis.at(scroll.y + vp.h) - rowAxis.at(scroll.y)), cols: Math.max(1, colAxis.at(scroll.x + vp.w) - colAxis.at(scroll.x)) }),
    textarea: () => taRef.current,
  }), [scrollTo, colAxis, rowAxis, scroll, vp, fc, fr]);

  // keep the active cell in view whenever it changes
  useEffect(() => { if (sel && sel.end) scrollTo(sel.end.r, sel.end.c); }, [sel && sel.end && sel.end.r, sel && sel.end && sel.end.c, scrollTo]);

  /* ---------- panes ---------- */
  const viewW = Math.max(0, vp.w - HDR_W); const viewH = Math.max(0, vp.h - HDR_H);
  const mainW = Math.max(0, viewW - frozenW); const mainH = Math.max(0, viewH - frozenH);
  const cStart = Math.max(fc, colAxis.at(scroll.x + frozenW) - 1); const cEnd = Math.min(nCols - 1, colAxis.at(scroll.x + viewW) + 1);
  const rStart = Math.max(fr, rowAxis.at(scroll.y + frozenH) - 1); const rEnd = Math.min(nRows - 1, rowAxis.at(scroll.y + viewH) + 1);
  const panes = [];
  const mk = (id, x, y, w, h, rs, re, cs, ce, ox, oy) => { if (w > 0 && h > 0 && re >= rs && ce >= cs) panes.push({ id, x, y, w, h, rs, re, cs, ce, ox, oy }); };
  mk('ff', 0, 0, frozenW, frozenH, 0, fr - 1, 0, fc - 1, 0, 0);
  mk('fm', frozenW, 0, mainW, frozenH, 0, fr - 1, cStart, cEnd, scroll.x + frozenW, 0);
  mk('mf', 0, frozenH, frozenW, mainH, rStart, rEnd, 0, fc - 1, 0, scroll.y + frozenH);
  mk('mm', frozenW, frozenH, mainW, mainH, rStart, rEnd, cStart, cEnd, scroll.x + frozenW, scroll.y + frozenH);

  /* ---------- hit testing ---------- */
  const hit = useCallback((cx, cy) => {
    const b = view.current.getBoundingClientRect();
    const lx = cx - b.left - HDR_W; const ly = cy - b.top - HDR_H;
    const c = lx < frozenW ? colAxis.at(Math.max(0, lx)) : colAxis.at(lx + scroll.x);
    const r = ly < frozenH ? rowAxis.at(Math.max(0, ly)) : rowAxis.at(ly + scroll.y);
    return { r: clamp(r, 0, nRows - 1), c: clamp(c, 0, nCols - 1), lx, ly, outside: { x: lx < 0 ? -1 : lx > viewW ? 1 : 0, y: ly < 0 ? -1 : ly > viewH ? 1 : 0 } };
  }, [colAxis, rowAxis, frozenW, frozenH, scroll, nRows, nCols, viewW, viewH]);

  /* ---------- cell helpers ---------- */
  const cellValue = (r, c) => engine.value(si, r, c);
  const isEmpty = (r, c) => { const cell = sh.cells[keyOf(r, c)]; if (cell && (cell.f || (cell.v !== undefined && cell.v !== ''))) return false; return engine.value(si, r, c) === null; };
  const rectOf = (r1, c1, r2, c2, pane) => ({ x: colAxis.offset(c1) - pane.ox, y: rowAxis.offset(r1) - pane.oy, w: colAxis.offset(c2 + 1) - colAxis.offset(c1), h: rowAxis.offset(r2 + 1) - rowAxis.offset(r1) });
  const dvAt = (r, c) => dvRuleAt(sh, r, c);

  /* ---------- selection ---------- */
  const lastRange = (s) => s.ranges[s.ranges.length - 1];
  const setLast = (s, g, end) => ({ ...s, ranges: [...s.ranges.slice(0, -1), g], end: end || s.end });
  const startSel = (r, c, mode) => {
    const m = mergeAt(sh, r, c);
    const g = m ? { ...m } : { r1: r, c1: c, r2: r, c2: c };
    const a = m ? { r: m.r1, c: m.c1 } : { r, c };
    const prev = selRef.current;
    if (mode === 'add') setSel({ ranges: [...prev.ranges, g], active: a, end: { r: m ? m.r2 : r, c: m ? m.c2 : c } });
    else setSel({ ranges: [g], active: a, end: { r: m ? m.r2 : r, c: m ? m.c2 : c } });
  };
  const extendTo = (r, c) => {
    const s = selRef.current; const a = s.active;
    let g = rangeFrom(a, { r, c });
    g = expandMerges(sh, g);
    setSel(setLast(s, g, { r, c }));
  };

  /* ---------- mouse ---------- */
  const autoscroll = useRef(null);
  const stopDrag = () => { dragMode.current = null; clearInterval(autoscroll.current); autoscroll.current = null; };
  const onDocMove = useCallback((e) => {
    const dm = dragMode.current; if (!dm) return;
    const p = propsRef.current; void p;
    const h = hit(e.clientX, e.clientY);
    dm.last = e;
    // autoscroll when the pointer is outside
    if (h.outside.x || h.outside.y) {
      if (!autoscroll.current) autoscroll.current = setInterval(() => { const ev = dragMode.current && dragMode.current.last; const el = scroller.current; if (!ev || !el) return; const b = view.current.getBoundingClientRect(); const dx = ev.clientX < b.left + HDR_W ? -40 : ev.clientX > b.right ? 40 : 0; const dy = ev.clientY < b.top + HDR_H ? -40 : ev.clientY > b.bottom ? 40 : 0; el.scrollLeft += dx; el.scrollTop += dy; onDocMove(ev); }, 50);
    } else if (autoscroll.current) { clearInterval(autoscroll.current); autoscroll.current = null; }
    if (dm.kind === 'cells') extendTo(h.r, h.c);
    else if (dm.kind === 'cols') { const s = selRef.current; setSel({ ...s, ranges: [...s.ranges.slice(0, -1), { r1: 0, r2: MAX_ROWS - 1, c1: Math.min(dm.a, h.c), c2: Math.max(dm.a, h.c) }], end: { r: s.end.r, c: h.c } }); }
    else if (dm.kind === 'rows') { const s = selRef.current; setSel({ ...s, ranges: [...s.ranges.slice(0, -1), { c1: 0, c2: MAX_COLS - 1, r1: Math.min(dm.a, h.r), r2: Math.max(dm.a, h.r) }], end: { r: h.r, c: s.end.c } }); }
    else if (dm.kind === 'resize') {
      const delta = (dm.axis === 'col' ? e.clientX - dm.x0 : e.clientY - dm.y0) / Z;
      const size = Math.max(dm.axis === 'col' ? 12 : 8, Math.round(dm.size0 + delta));
      setDrag({ kind: dm.axis, idxs: dm.idxs, size });
      dm.size = size;
    } else if (dm.kind === 'fill') {
      const s = dm.src; let g = { ...s };
      const dr = h.r < s.r1 ? h.r - s.r1 : h.r > s.r2 ? h.r - s.r2 : 0; const dc = h.c < s.c1 ? h.c - s.c1 : h.c > s.c2 ? h.c - s.c2 : 0;
      const vertical = Math.abs(dr) >= Math.abs(dc);
      if (vertical && dr > 0) g = { ...s, r2: h.r }; else if (vertical && dr < 0) g = { ...s, r1: h.r }; else if (!vertical && dc > 0) g = { ...s, c2: h.c }; else if (!vertical && dc < 0) g = { ...s, c1: h.c };
      dm.dst = g; dm.dir = vertical ? (dr >= 0 ? 'down' : 'up') : (dc >= 0 ? 'right' : 'left');
      setFillPrev(g);
    } else if (dm.kind === 'point') {
      const g = rangeFrom({ r: dm.r, c: dm.c }, { r: h.r, c: h.c });
      dm.setRef(g);
    } else if (dm.kind === 'chart') {
      const dx = (e.clientX - dm.x0) / Z; const dy = (e.clientY - dm.y0) / Z;
      const o = dm.orig; let n;
      if (dm.mode === 'move') n = { x: Math.max(0, Math.round(o.x + dx)), y: Math.max(0, Math.round(o.y + dy)) };
      else { n = { x: o.x, y: o.y, w: o.w, h: o.h }; if (/e/.test(dm.mode)) n.w = Math.max(160, Math.round(o.w + dx)); if (/s/.test(dm.mode)) n.h = Math.max(110, Math.round(o.h + dy)); if (/w/.test(dm.mode)) { n.w = Math.max(160, Math.round(o.w - dx)); n.x = Math.max(0, Math.round(o.x + o.w - n.w)); } if (/n/.test(dm.mode)) { n.h = Math.max(110, Math.round(o.h - dy)); n.y = Math.max(0, Math.round(o.y + o.h - n.h)); } }
      dm.patch = n;
      propsRef.current.onChartChange(dm.id, n, false);
    }
  }, [hit, Z]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDocUp = useCallback(() => {
    const dm = dragMode.current;
    document.removeEventListener('mousemove', onDocMoveRef.current, true); document.removeEventListener('mouseup', onDocUpRef.current, true);
    stopDrag();
    if (!dm) return;
    if (dm.kind === 'resize') { setDrag(null); if (dm.size !== undefined) propsRef.current.onResizeEnd(dm.axis, dm.idxs, dm.size); }
    if (dm.kind === 'fill') { setFillPrev(null); if (dm.dst && dm.dir) propsRef.current.onFill(dm.src, dm.dst, dm.dir); }
    if (dm.kind === 'chart' && dm.patch) propsRef.current.onChartChange(dm.id, dm.patch, true);
    root.current && root.current.focus({ preventScroll: true });
  }, []);
  const onDocMoveRef = useRef(onDocMove); onDocMoveRef.current = onDocMove;
  const onDocUpRef = useRef(onDocUp); onDocUpRef.current = onDocUp;
  const beginDrag = (dm) => {
    dragMode.current = dm;
    const mv = (e) => onDocMoveRef.current(e); const up = (e) => onDocUpRef.current(e);
    onDocMoveRef.current = onDocMoveRef.current; // keep latest
    document.addEventListener('mousemove', mv, true);
    document.addEventListener('mouseup', function once(e) { document.removeEventListener('mousemove', mv, true); document.removeEventListener('mouseup', once, true); up(e); }, true);
    // the shared remove in onDocUp is harmless for already-removed listeners
    onDocUpRef.current = onDocUpRef.current;
  };

  const edgeAt = (lx, ly) => {
    // returns {axis, idx} when pointer is on a header boundary
    const near = 4;
    if (ly < 0 && lx >= 0) { const x = lx < frozenW ? lx : lx + scroll.x; const c = colAxis.at(x); const e1 = colAxis.offset(c + 1); const e0 = colAxis.offset(c); if (Math.abs(x - e1) <= near) return { axis: 'col', idx: c }; if (Math.abs(x - e0) <= near && c > 0) { let k = c - 1; return { axis: 'col', idx: k }; } }
    if (lx < 0 && ly >= 0) { const y = ly < frozenH ? ly : ly + scroll.y; const r = rowAxis.at(y); const e1 = rowAxis.offset(r + 1); const e0 = rowAxis.offset(r); if (Math.abs(y - e1) <= near) return { axis: 'row', idx: r }; if (Math.abs(y - e0) <= near && r > 0) return { axis: 'row', idx: r - 1 }; }
    return null;
  };

  const onMouseDown = (e) => {
    if (e.button === 2) return;
    if (e.button !== 0) return;
    const h = hit(e.clientX, e.clientY);
    const ed = editRef.current;
    const s = selRef.current;
    // header / corner
    if (h.lx < 0 || h.ly < 0) {
      e.preventDefault();
      if (ed) onCommit(ed.text, 'none');
      root.current.focus({ preventScroll: true });
      if (h.lx < 0 && h.ly < 0) { setSel({ ranges: [{ r1: 0, c1: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 }], active: { r: 0, c: 0 }, end: { r: 0, c: 0 } }); return; }
      const edge = edgeAt(h.lx, h.ly);
      if (edge) {
        const size0 = edge.axis === 'col' ? (sh.colW[edge.idx] || DEFAULT_COLW) : (sh.rowH[edge.idx] || DEFAULT_ROWH);
        let idxs = [edge.idx];
        const inSel = s.ranges.find((g) => (edge.axis === 'col' ? g.r1 === 0 && g.r2 >= MAX_ROWS - 1 && edge.idx >= g.c1 && edge.idx <= g.c2 : g.c1 === 0 && g.c2 >= MAX_COLS - 1 && edge.idx >= g.r1 && edge.idx <= g.r2));
        if (inSel) idxs = Array.from({ length: (edge.axis === 'col' ? Math.min(inSel.c2, nCols - 1) - inSel.c1 : Math.min(inSel.r2, nRows - 1) - inSel.r1) + 1 }, (_, i) => (edge.axis === 'col' ? inSel.c1 : inSel.r1) + i);
        if (e.detail >= 2) { onCommand('autofit', { axis: edge.axis, idxs }); return; }
        beginDrag({ kind: 'resize', axis: edge.axis, idx: edge.idx, idxs, x0: e.clientX, y0: e.clientY, size0 });
        return;
      }
      if (h.ly < 0) {
        const c = h.c;
        if (e.shiftKey) { const a = s.active.c; setSel({ ranges: [{ r1: 0, r2: MAX_ROWS - 1, c1: Math.min(a, c), c2: Math.max(a, c) }], active: s.active, end: { r: s.end.r, c } }); beginDrag({ kind: 'cols', a }); return; }
        const g = { r1: 0, r2: MAX_ROWS - 1, c1: c, c2: c };
        const ns = { ranges: e.ctrlKey || e.metaKey ? [...s.ranges, g] : [g], active: { r: e.ctrlKey || e.metaKey ? s.active.r : (fr ? 0 : Math.max(0, rowAxis.at(scroll.y))), c }, end: { r: 0, c } };
        ns.active = { r: ns.active.r, c }; ns.end = { r: ns.active.r, c };
        setSel(ns); beginDrag({ kind: 'cols', a: c });
      } else {
        const r = h.r;
        if (e.shiftKey) { const a = s.active.r; setSel({ ranges: [{ c1: 0, c2: MAX_COLS - 1, r1: Math.min(a, r), r2: Math.max(a, r) }], active: s.active, end: { r, c: s.end.c } }); beginDrag({ kind: 'rows', a }); return; }
        const g = { c1: 0, c2: MAX_COLS - 1, r1: r, r2: r };
        setSel({ ranges: e.ctrlKey || e.metaKey ? [...s.ranges, g] : [g], active: { r, c: fc ? 0 : Math.max(0, colAxis.at(scroll.x)) }, end: { r, c: fc ? 0 : Math.max(0, colAxis.at(scroll.x)) } });
        beginDrag({ kind: 'rows', a: r });
      }
      return;
    }
    // cell area
    const { r, c } = h;
    if (!ed || ed.si === si) propsRef.current.onChartSelect(null);
    if (ed) {
      if (ed.text.startsWith('=') && canPoint(ed.text, curTa() ? curTa().selectionStart : ed.text.length, ed.point)) {
        e.preventDefault();
        const setRef = (g) => pointInsert(g);
        pointInsert({ r1: r, c1: c, r2: r, c2: c });
        beginDrag({ kind: 'point', r, c, setRef });
        return;
      }
      onCommit(ed.text, 'none');
    }
    e.preventDefault();
    root.current.focus({ preventScroll: true });
    if (e.shiftKey) { extendTo(r, c); beginDrag({ kind: 'cells' }); return; }
    startSel(r, c, e.ctrlKey || e.metaKey ? 'add' : 'new');
    // Ctrl+click on a link opens it
    if ((e.ctrlKey || e.metaKey) && sh.cells[keyOf(r, c)] && /^=HYPERLINK\(/i.test(sh.cells[keyOf(r, c)].f || '')) {
      const v = engine.evalText(si, r, c, sh.cells[keyOf(r, c)].f.replace(/^=HYPERLINK\(/i, '=INDEX({').replace(/,.*$/, '},1)'));
      if (typeof v === 'string' && /^(https?:|mailto:)/i.test(v)) window.open(v, '_blank', 'noopener');
    }
    if (!(e.ctrlKey || e.metaKey)) beginDrag({ kind: 'cells' }); else beginDrag({ kind: 'cells' });
  };

  const onDoubleClick = (e) => {
    const h = hit(e.clientX, e.clientY);
    if (h.lx < 0 || h.ly < 0 || e.target.closest('.fillh, .chartbox')) return;
    if (readOnly) return;
    const cell = sh.cells[keyOf(h.r, h.c)];
    const m = mergeAt(sh, h.r, h.c);
    onEditStart(m ? m.r1 : h.r, m ? m.c1 : h.c, null, 'edit', cell);
  };

  const onMouseMove = (e) => {
    if (dragMode.current) return;
    const b = view.current.getBoundingClientRect();
    const lx = e.clientX - b.left - HDR_W; const ly = e.clientY - b.top - HDR_H;
    const edge = (lx < 0 || ly < 0) ? edgeAt(lx, ly) : null;
    const next = edge ? edge.axis : null;
    if (next !== hover) setHover(next);
  };

  /* ---------- fill handle ---------- */
  const onFillDown = (e) => {
    e.stopPropagation(); e.preventDefault();
    const s = selRef.current; const g = lastRange(s);
    if (e.detail >= 2) { onCommand('fillAuto', g); return; }
    beginDrag({ kind: 'fill', src: normRange({ r1: g.r1, c1: g.c1, r2: Math.min(g.r2, nRows - 1), c2: Math.min(g.c2, nCols - 1) }) });
  };

  /* ---------- formula pointing ---------- */
  function canPoint(text, caret, point) {
    if (!text.startsWith('=')) return false;
    if (point && point.at + point.len === caret) return true;
    const before = text.slice(0, caret).replace(/\s+$/, '');
    if (!before) return false;
    return /[=+\-*/^&<>(,;:{]$/.test(before) && !/"[^"]*$/.test(before.replace(/""/g, ''));
  }
  function pointInsert(g) {
    const ed = editRef.current; if (!ed) return;
    const ta = curTa(); const caret = ta ? ta.selectionStart : ed.text.length;
    const single = g.r1 === g.r2 && g.c1 === g.c2;
    const mm = mergeAt(sh, g.r1, g.c1);
    const txt = single ? `${colName(g.c1)}${g.r1 + 1}` : `${colName(g.c1)}${g.r1 + 1}:${colName(g.c2)}${g.r2 + 1}`;
    void mm;
    const sheetPrefix = ed.sheetSi !== undefined && ed.sheetSi !== si ? `${/^[A-Za-z_][\w.]*$/.test(sh.name) ? sh.name : `'${sh.name.replace(/'/g, "''")}'`}!` : '';
    const refText = sheetPrefix + txt;
    let start = caret; let end = caret;
    if (ed.point && ed.point.at + ed.point.len === caret) { start = ed.point.at; end = caret; }
    const nt = ed.text.slice(0, start) + refText + ed.text.slice(end);
    setEditing({ ...ed, text: nt, point: { at: start, len: refText.length, g }, caretTo: start + refText.length });
  }

  /* ---------- editor ---------- */
  useLayoutEffect(() => {
    const ta = curTa(); if (!ta || !editing) return;
    if (editing.caretTo !== undefined) { try { ta.setSelectionRange(editing.caretTo, editing.caretTo); } catch { /* ignore */ } setHint((h) => ({ ...h, caret: editing.caretTo })); setEditing({ ...editing, caretTo: undefined }); }
  });
  useLayoutEffect(() => {
    const ta = taRef.current; if (!ta || !editing) return;
    if (editing.focusKey !== ta.dataset.fk) {
      ta.dataset.fk = editing.focusKey;
      if (editing.src !== 'bar') { ta.focus({ preventScroll: true }); const n = ta.value.length; ta.setSelectionRange(editing.select ? 0 : n, n); }
      setHint({ caret: ta.selectionStart || 0, ac: 0 });
    }
  }, [editing && editing.focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const acList = useMemo(() => {
    if (!editing || !editing.text.startsWith('=') || editing.src === 'bar') return [];
    const caret = hint.caret; const before = editing.text.slice(0, caret);
    const m = /([A-Za-z][A-Za-z0-9_.]*)$/.exec(before);
    if (!m) return [];
    const pre = before.slice(0, before.length - m[1].length).replace(/\s+$/, '');
    if (pre && !/[=+\-*/^&<>(,;:{]$/.test(pre)) return [];
    const q = m[1].toUpperCase();
    if (/^[A-Z]{1,3}\d+$/.test(q)) return [];
    const after = editing.text.slice(caret);
    if (/^[A-Za-z0-9_.]/.test(after)) return [];
    const names = [...FN_NAMES, ...Object.keys(book.names || {}).map((n) => n.toUpperCase())];
    return names.filter((n) => n.startsWith(q) && n !== q).slice(0, 8).map((n) => ({ name: n, isName: !FUNCS[n], start: caret - m[1].length }));
  }, [editing && editing.text, hint.caret, book.names]); // eslint-disable-line react-hooks/exhaustive-deps
  const acIndex = Math.min(hint.ac || 0, Math.max(0, acList.length - 1));
  const chooseAc = (item) => {
    const ed = liveEd(); const ta = taRef.current; if (!ed || !item) return;
    const caret = ta.selectionStart; const ins = item.isName ? item.name : item.name + '(';
    const nt = ed.text.slice(0, item.start) + ins + ed.text.slice(caret);
    setEditing({ ...ed, text: nt, caretTo: item.start + ins.length, point: null });
  };
  const call = editing && editing.src !== 'bar' ? callContext(editing.text, hint.caret) : null;
  const sig = call && FN_SIGS(call.name);

  const onEditorKey = (e) => {
    const ed = liveEd(); if (!ed) return;
    const ta = taRef.current;
    e.stopPropagation();
    if (acList.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHint((h) => ({ ...h, ac: (acIndex + 1) % acList.length })); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHint((h) => ({ ...h, ac: (acIndex - 1 + acList.length) % acList.length })); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.altKey)) { e.preventDefault(); chooseAc(acList[acIndex]); return; }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); root.current.focus({ preventScroll: true }); return; }
    if (e.key === 'Enter') {
      if (e.altKey) { e.preventDefault(); const s0 = ta.selectionStart; const nt = ed.text.slice(0, s0) + '\n' + ed.text.slice(ta.selectionEnd); setEditing({ ...ed, text: nt, caretTo: s0 + 1 }); return; }
      e.preventDefault(); onCommit(ed.text, mod ? 'fill' : e.shiftKey ? 'up' : 'down'); root.current.focus({ preventScroll: true }); return;
    }
    if (e.key === 'Tab') { e.preventDefault(); onCommit(ed.text, e.shiftKey ? 'left' : 'right'); root.current.focus({ preventScroll: true }); return; }
    if (e.key === 'F2') { e.preventDefault(); setEditing({ ...ed, mode: ed.mode === 'edit' ? 'enter' : 'edit' }); return; }
    if (e.key === 'F4') {
      e.preventDefault();
      const caret = ta.selectionStart; let toks; try { toks = tokenize(ed.text.slice(1)); } catch { return; }
      const t = toks.find((x) => x.t === 'ref' && x.start + 1 <= caret && x.end + 1 >= caret);
      if (t) {
        const seg = ed.text.slice(t.start + 1, t.end + 1); const m = /^((?:'[^']*'|[A-Za-z_][\w.]*)!)?(\$?)([A-Z]+)(\$?)(\d+)(?::(\$?)([A-Z]+)(\$?)(\d+))?$/i.exec(seg);
        if (m) {
          const state = (m[2] ? 1 : 0) + (m[4] ? 2 : 0); const next = (state + 1) % 4; // 0 rel,1 col abs? cycle: A1 -> $A$1 -> A$1 -> $A1
          const order = [[true, true], [false, true], [true, false], [false, false]]; void state; void next;
          const cur = m[2] && m[4] ? 0 : !m[2] && m[4] ? 1 : m[2] && !m[4] ? 2 : 3; const [ac, ar] = order[(cur + 1) % 4 === 3 && cur === 2 ? 3 : (cur + 1) % 4]; void ac; void ar;
          const seq = [[0, 0], [1, 1], [0, 1], [1, 0]]; // [absCol, absRow]
          const idx = m[2] && m[4] ? 1 : !m[2] && m[4] ? 2 : m[2] && !m[4] ? 3 : 0; const [nc, nr] = seq[(idx + 1) % 4];
          const mk = (c, r) => `${nc ? '$' : ''}${c}${nr ? '$' : ''}${r}`;
          const rep = (m[1] || '') + mk(m[3], m[5]) + (m[7] ? ':' + (nc ? '$' : '') + m[7] + (nr ? '$' : '') + m[9] : '');
          setEditing({ ...ed, text: ed.text.slice(0, t.start + 1) + rep + ed.text.slice(t.end + 1), caretTo: t.start + 1 + rep.length });
        }
      }
      return;
    }
    if (e.key.startsWith('Arrow') && ed.mode === 'enter' && !e.altKey && !e.shiftKey) {
      const dirs = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      const canP = ed.text.startsWith('=') && canPoint(ed.text, ta.selectionStart, ed.point);
      if (canP && !mod) {
        e.preventDefault();
        const cur = ed.point && ed.point.g ? { r: ed.point.g.r1, c: ed.point.g.c1 } : { r: ed.r, c: ed.c };
        const nr = clamp(cur.r + dirs[0], 0, nRows - 1); const nc = clamp(cur.c + dirs[1], 0, nCols - 1);
        pointInsert({ r1: nr, c1: nc, r2: nr, c2: nc }); scrollTo(nr, nc);
        return;
      }
      if (!ed.text.startsWith('=') || !canP) { e.preventDefault(); onCommit(ed.text, { ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]); root.current.focus({ preventScroll: true }); return; }
    }
    if (mod && /^[biu]$/i.test(e.key) && false) e.preventDefault();
  };
  const onEditorChange = (e) => {
    const ed = liveEd(); if (!ed) return;
    setEditing({ ...ed, text: e.target.value, point: null, dirty: true });
    setHint({ caret: e.target.selectionStart, ac: 0 });
  };
  const onEditorBlur = (e) => {
    const ed = liveEd(); if (!ed || ed.src === 'bar') return;
    const to = e.relatedTarget;
    if (to && (to.closest && (to.closest('.sheetbar') || to.closest('.fnpop') || to.closest('.ctxmenu')))) return;
    if (dragMode.current && dragMode.current.kind === 'point') return;
    if (document.activeElement === document.body && !to) { /* window blur: keep */ return; }
    onCommit(ed.text, 'none');
  };

  /* ---------- keyboard (grid focused, not editing) ---------- */
  const hasContent = (r, c) => !isEmpty(r, c);
  const isHiddenRow = (r) => !!((sh.hidden.rows && sh.hidden.rows[r]) || (sh.filtered && sh.filtered[r]));
  const isHiddenCol = (c) => !!(sh.hidden.cols && sh.hidden.cols[c]);
  const stepFrom = (r, c, dr, dc, ctrl) => {
    let nr = r; let nc = c;
    const m = mergeAt(sh, r, c);
    if (m) { if (dr > 0) nr = m.r2; if (dr < 0) nr = m.r1; if (dc > 0) nc = m.c2; if (dc < 0) nc = m.c1; }
    const lim = (v, max) => clamp(v, 0, max);
    if (ctrl) {
      const ext = engine.usedExtent(si);
      const maxR = Math.max(ext.r, 0); const maxC = Math.max(ext.c, 0);
      const stepOne = (a, b) => [a + dr, b + dc];
      let [a, b] = stepOne(nr, nc);
      if (a < 0 || b < 0 || a >= MAX_ROWS || b >= MAX_COLS) return { r: nr, c: nc };
      if (hasContent(nr, nc) && hasContent(a, b)) { while (true) { const [x, y] = stepOne(a, b); if (x < 0 || y < 0 || x > Math.max(maxR, nRows) || y > Math.max(maxC, nCols) || !hasContent(x, y)) break; a = x; b = y; if (a > maxR + 1 || b > maxC + 1) break; } return { r: lim(a, MAX_ROWS - 1), c: lim(b, MAX_COLS - 1) }; }
      while (!hasContent(a, b)) { const [x, y] = stepOne(a, b); if (x < 0 || y < 0 || x > maxR || y > maxC) { return dr > 0 ? { r: Math.min(MAX_ROWS - 1, dr > 0 ? Math.max(maxR, nr) : 0), c: nc } : dr < 0 ? { r: 0, c: nc } : dc > 0 ? { r: nr, c: Math.max(maxC, nc) } : { r: nr, c: 0 }; } a = x; b = y; }
      return { r: a, c: b };
    }
    nr += dr; nc += dc;
    while (nr >= 0 && nr < nRows && isHiddenRow(nr) && dr) nr += dr;
    while (nc >= 0 && nc < nCols && isHiddenCol(nc) && dc) nc += dc;
    return { r: lim(nr, MAX_ROWS - 1), c: lim(nc, MAX_COLS - 1) };
  };

  const moveSel = (dr, dc, shift, ctrl) => {
    const s = selRef.current;
    if (shift) {
      const t = stepFrom(s.end.r, s.end.c, dr, dc, ctrl);
      let g = rangeFrom(s.active, t); g = expandMerges(sh, g);
      setSel(setLast(s, g, t)); return;
    }
    const t = stepFrom(s.active.r, s.active.c, dr, dc, ctrl);
    const m = mergeAt(sh, t.r, t.c);
    setSel({ ranges: [m ? { ...m } : { r1: t.r, c1: t.c, r2: t.r, c2: t.c }], active: m ? { r: m.r1, c: m.c1 } : t, end: m ? { r: m.r2, c: m.c2 } : t });
  };

  const onKeyDown = (e) => {
    const live = editingRef ? editingRef.current : editRef.current;
    if (live) {
      const ed = live;
      // keystrokes that arrive before the editor has received focus are appended (fast typing)
      if (ed.si === si && e.target === root.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.length === 1) { e.preventDefault(); setEditing({ ...ed, text: ed.text + e.key, point: null }); return; }
        if (e.key === 'Backspace') { e.preventDefault(); setEditing({ ...ed, text: ed.text.slice(0, -1), point: null }); return; }
        if (e.key === 'Enter') { e.preventDefault(); onCommit(ed.text, e.shiftKey ? 'up' : 'down'); return; }
        if (e.key === 'Tab') { e.preventDefault(); onCommit(ed.text, e.shiftKey ? 'left' : 'right'); return; }
        if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); return; }
      }
      if (ed.si !== si) { if (e.key === 'Enter') { e.preventDefault(); onCommit(ed.text, 'down'); } else if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); } }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const s = selRef.current;
    const k = e.key;
    const cmd = (name, arg) => { e.preventDefault(); onCommand(name, arg); };
    switch (k) {
      case 'ArrowDown': e.preventDefault(); return moveSel(1, 0, e.shiftKey, mod);
      case 'ArrowUp': e.preventDefault(); return moveSel(-1, 0, e.shiftKey, mod);
      case 'ArrowLeft': e.preventDefault(); return moveSel(0, -1, e.shiftKey, mod);
      case 'ArrowRight': e.preventDefault(); return moveSel(0, 1, e.shiftKey, mod);
      case 'PageDown': case 'PageUp': {
        e.preventDefault(); const n = Math.max(1, rowAxis.at(scroll.y + viewH) - rowAxis.at(scroll.y + frozenH) - 1);
        if (e.altKey) { const nc = Math.max(1, colAxis.at(scroll.x + viewW) - colAxis.at(scroll.x)); return moveSel(0, k === 'PageDown' ? nc : -nc, e.shiftKey, false); }
        return moveSel(k === 'PageDown' ? n : -n, 0, e.shiftKey, false);
      }
      case 'Home': {
        e.preventDefault();
        if (mod) { const t = { r: fr, c: fc }; return setSel({ ranges: [{ r1: t.r, c1: t.c, r2: t.r, c2: t.c }], active: t, end: t }); }
        const t = { r: s.end.r, c: 0 }; if (e.shiftKey) { setSel(setLast(s, rangeFrom(s.active, t), t)); return undefined; }
        return setSel({ ranges: [{ r1: t.r, c1: 0, r2: t.r, c2: 0 }], active: t, end: t });
      }
      case 'End': {
        e.preventDefault();
        if (mod) { const ext = engine.usedExtent(si); const t = { r: Math.max(0, ext.r), c: Math.max(0, ext.c) }; if (e.shiftKey) { setSel(setLast(s, rangeFrom(s.active, t), t)); return undefined; } return setSel({ ranges: [{ r1: t.r, c1: t.c, r2: t.r, c2: t.c }], active: t, end: t }); }
        return undefined;
      }
      case 'Enter': case 'Tab': {
        e.preventDefault();
        const back = e.shiftKey; const horiz = k === 'Tab';
        const g = lastRange(s); const multi = (g.r2 > g.r1 || g.c2 > g.c1) && s.ranges.length >= 1 && !(g.r1 === 0 && g.r2 >= MAX_ROWS - 1) && !(g.c1 === 0 && g.c2 >= MAX_COLS - 1);
        if (multi) {
          let { r, c } = s.active; const gr = { r1: g.r1, r2: Math.min(g.r2, nRows - 1), c1: g.c1, c2: Math.min(g.c2, nCols - 1) };
          if (horiz) { c += back ? -1 : 1; if (c > gr.c2) { c = gr.c1; r += 1; } if (c < gr.c1) { c = gr.c2; r -= 1; } if (r > gr.r2) r = gr.r1; if (r < gr.r1) r = gr.r2; }
          else { r += back ? -1 : 1; if (r > gr.r2) { r = gr.r1; c += 1; } if (r < gr.r1) { r = gr.r2; c -= 1; } if (c > gr.c2) c = gr.c1; if (c < gr.c1) c = gr.c2; }
          return setSel({ ...s, active: { r, c }, end: s.end });
        }
        return moveSel(horiz ? 0 : (back ? -1 : 1), horiz ? (back ? -1 : 1) : 0, false, false);
      }
      case 'Delete': case 'Backspace': return cmd('clear', 'contents');
      case 'Escape': return onCommand('escape');
      case 'F2': { e.preventDefault(); const cell = sh.cells[keyOf(s.active.r, s.active.c)]; return onEditStart(s.active.r, s.active.c, null, 'edit', cell); }
      case 'F4': return cmd('repeat');
      case ' ':
        if (mod) { e.preventDefault(); const c = s.active.c; return setSel({ ranges: [{ r1: 0, r2: MAX_ROWS - 1, c1: c, c2: c }], active: s.active, end: s.end }); }
        if (e.shiftKey) { e.preventDefault(); const r = s.active.r; return setSel({ ranges: [{ c1: 0, c2: MAX_COLS - 1, r1: r, r2: r }], active: s.active, end: s.end }); }
        break;
      default: break;
    }
    if (mod && !e.altKey) {
      const lk = k.toLowerCase();
      if (lk === 'a') { e.preventDefault(); const ext = engine.usedExtent(si); const g = lastRange(s); const all = { r1: 0, c1: 0, r2: Math.max(ext.r, 0), c2: Math.max(ext.c, 0) }; if (s.ranges.length === 1 && !(g.r1 === 0 && g.c1 === 0 && g.r2 >= all.r2 && g.c2 >= all.c2)) return setSel({ ranges: [all], active: { r: 0, c: 0 }, end: { r: all.r2, c: all.c2 } }); return setSel({ ranges: [{ r1: 0, c1: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 }], active: s.active, end: s.end }); }
      const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', b: 'bold', i: 'italic', u: 'underline', d: 'fillDown', r: 'fillRight', f: 'find', h: 'replace', g: 'goto', p: 'print', s: 'saveVersion', k: 'link', '\\': 'clearFormat', ';': e.shiftKey ? 'insertTime' : 'insertDate', '`': 'toggleFormulas', l: e.shiftKey ? 'filter' : null, enter: 'fillSel', '5': e.shiftKey ? null : 'strike', '/': null, '9': 'hideRows', '0': 'hideCols', '+': 'insertCells', '=': 'insertCells', '-': 'deleteCells', 'x': null, 'c': null, 'v': null };
      if (lk === 'enter') return cmd('fillSel');
      if (lk === 'x' || lk === 'c' || lk === 'v') return undefined; // native clipboard events
      if (map[lk]) return cmd(map[lk]);
      if (e.shiftKey && lk === '5') return cmd('percent');
      if (e.shiftKey && lk === '4') return cmd('currency');
      if (e.shiftKey && lk === '1') return cmd('number');
      if (e.shiftKey && lk === '2') return cmd('time');
      if (e.shiftKey && lk === '3') return cmd('date');
      if (e.shiftKey && lk === '!') return cmd('number');
      if (e.shiftKey && lk === '$') return cmd('currency');
      if (e.shiftKey && lk === '%') return cmd('percent');
      return undefined;
    }
    if (e.altKey && k === '=') return cmd('autosum');
    if (e.altKey && e.shiftKey && k === 'ArrowRight') return cmd('group');
    if (e.shiftKey && k === 'F3') return cmd('insertFunction');
    if (e.shiftKey && k === 'F2') return cmd('addNote');
    if (isPrintable(e) && !readOnly) { e.preventDefault(); return onEditStart(s.active.r, s.active.c, k, 'enter'); }
    return undefined;
  };

  /* ---------- clipboard ---------- */
  const guard = (e) => (e.target && e.target.tagName === 'TEXTAREA') || editRef.current;
  const onCopy = (e) => { if (guard(e)) return; e.preventDefault(); onClipboard('copy', e); };
  const onCut = (e) => { if (guard(e)) return; e.preventDefault(); onClipboard('cut', e); };
  const onPaste = (e) => { if (guard(e)) return; e.preventDefault(); onClipboard('paste', e); };

  const onCtx = (e) => {
    e.preventDefault();
    const h = hit(e.clientX, e.clientY);
    const chartEl = e.target.closest && e.target.closest('.chartbox');
    if (chartEl) { onContextMenu(e, { type: 'chart', id: chartEl.dataset.id }); return; }
    if (h.lx < 0 && h.ly < 0) return onContextMenu(e, { type: 'corner' });
    if (h.ly < 0) { const s = selRef.current; const inSel = s.ranges.some((g) => g.r1 === 0 && g.r2 >= MAX_ROWS - 1 && h.c >= g.c1 && h.c <= g.c2); if (!inSel) setSel({ ranges: [{ r1: 0, r2: MAX_ROWS - 1, c1: h.c, c2: h.c }], active: { r: 0, c: h.c }, end: { r: 0, c: h.c } }); return onContextMenu(e, { type: 'col', c: h.c }); }
    if (h.lx < 0) { const s = selRef.current; const inSel = s.ranges.some((g) => g.c1 === 0 && g.c2 >= MAX_COLS - 1 && h.r >= g.r1 && h.r <= g.r2); if (!inSel) setSel({ ranges: [{ c1: 0, c2: MAX_COLS - 1, r1: h.r, r2: h.r }], active: { r: h.r, c: 0 }, end: { r: h.r, c: 0 } }); return onContextMenu(e, { type: 'row', r: h.r }); }
    const s = selRef.current;
    const inSel = s.ranges.some((g) => h.r >= g.r1 && h.r <= g.r2 && h.c >= g.c1 && h.c <= g.c2);
    if (!inSel) startSel(h.r, h.c, 'new');
    return onContextMenu(e, { type: 'cell', r: h.r, c: h.c });
  };

  /* ---------- rendering ---------- */
  const activeKey = sel ? keyOf(sel.active.r, sel.active.c) : null; void activeKey;
  const selSet = sel.ranges;
  const isColSelected = (c) => selSet.some((g) => c >= g.c1 && c <= g.c2);
  const isRowSelected = (r) => selSet.some((g) => r >= g.r1 && r <= g.r2);
  const isColFull = (c) => selSet.some((g) => g.r1 === 0 && g.r2 >= MAX_ROWS - 1 && c >= g.c1 && c <= g.c2);
  const isRowFull = (r) => selSet.some((g) => g.c1 === 0 && g.c2 >= MAX_COLS - 1 && r >= g.r1 && r <= g.r2);

  const refBoxes = useMemo(() => {
    if (!editing || !editing.text.startsWith('=')) return [];
    let toks; try { toks = tokenize(editing.text.slice(1)); } catch { return []; }
    const out = []; let k = 0;
    toks.forEach((t) => {
      if (t.t !== 'ref') return;
      const nm = t.sheet; if (nm && nm.toLowerCase() !== sh.name.toLowerCase()) { k++; return; }
      if (!nm && editing.sheetSi !== undefined && editing.sheetSi !== si) { k++; return; }
      const a = t.a; const b = t.b || t.a;
      out.push({ g: { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.min(Math.max(a.r, b.r), nRows - 1), c2: Math.min(Math.max(a.c, b.c), nCols - 1) }, color: REF_COLORS[k % REF_COLORS.length] }); k++;
    });
    return out;
  }, [editing && editing.text, sh.name, si, nRows, nCols]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors = {};
  const charts = sh.charts || [];

  const renderCells = (pane) => {
    const out = [];
    const seenMerge = new Set();
    const drawn = new Set();
    const makeCell = (r, c, mg) => {
      const key = keyOf(r, c);
      const raw = sh.cells[key];
      const sidx = styleIndexAt(sh, r, c);
      const st0 = sidx ? book.styles[sidx] || {} : null;
      let v = cellValue(r, c);
      const cf = cfFn ? cfFn(r, c, v) : null;
      const hasStyle = !!st0 || !!cf;
      if (v === null && !hasStyle && !raw) return;
      if (v === null && !raw && !cf && !st0) return;
      const st = cf && cf.style ? { ...(st0 || {}), ...cf.style } : st0 || {};
      const x = colAxis.offset(mg ? mg.c1 : c) - pane.ox; const y = rowAxis.offset(mg ? mg.r1 : r) - pane.oy;
      const w = colAxis.offset((mg ? mg.c2 : c) + 1) - colAxis.offset(mg ? mg.c1 : c); const h = rowAxis.offset((mg ? mg.r2 : r) + 1) - rowAxis.offset(mg ? mg.r1 : r);
      if (w <= 0 || h <= 0) return;
      const isSpark = v instanceof Spark;
      const dv = dvAt(r, c);
      const isCheck = dv && dv.type === 'checkbox';
      let text = ''; let color; const isErr = v instanceof SErr;
      if (showFormulas && raw && raw.f) text = raw.f;
      else if (!isSpark) { const f = formatValue(typeof v === 'object' && v !== null && !isErr ? '' : v, st.fmt); text = f.text; color = f.color; }
      const kind = isErr ? 'err' : typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : 'str';
      let ha = st.ha || (showFormulas ? 'left' : kind === 'num' ? 'right' : kind === 'bool' || kind === 'err' ? 'center' : 'left');
      const fsz = ((st.fs || 11) * 96 / 72) * Z;
      const wrap = st.wrap === 'wrap';
      const style = { left: x, top: y, width: w, height: h, fontSize: fsz };
      if (st.ff) style.fontFamily = `"${st.ff}", ${DEFAULT_FONT_FAMILY}`;
      if (st.b) style.fontWeight = 700; if (st.i) style.fontStyle = 'italic';
      const deco = [st.u || (raw && raw.f && /^=HYPERLINK\(/i.test(raw.f)) ? 'underline' : '', st.st ? 'line-through' : ''].filter(Boolean).join(' '); if (deco) style.textDecoration = deco;
      const fc = (cf && cf.style && cf.style.fc) || st.fc || color || (raw && raw.f && /^=HYPERLINK\(/i.test(raw.f) ? '#1a0dab' : undefined); if (fc) style.color = fc;
      else if (isErr) style.color = '#d93025';
      if (st.bg) style.background = st.bg;
      style.justifyContent = ha === 'center' ? 'center' : ha === 'right' ? 'flex-end' : 'flex-start';
      style.alignItems = st.va === 'top' ? 'flex-start' : st.va === 'middle' ? 'center' : 'flex-end';
      if (wrap) { style.whiteSpace = 'pre-wrap'; style.overflowWrap = 'anywhere'; style.textAlign = ha; }
      if (st.ind) style.paddingLeft = 4 + st.ind * 9 * Z;
      if (st.bd) ['t', 'r', 'b', 'l'].forEach((sd) => { const b = st.bd[sd]; if (b) { const nm = { t: 'Top', r: 'Right', b: 'Bottom', l: 'Left' }[sd]; style['border' + nm] = `${(BORDER_W[b[0]] || 1)}px ${BORDER_CSS[b[0]] || 'solid'} ${b[1] || '#000'}`; } });
      let content;
      const flt = sh.filter && sh.filter.ref;
      if (isSpark) content = <SparkView spark={v} w={w} h={h} />;
      else if (isCheck) content = <input type="checkbox" className="scheck" checked={v === true} aria-label="Checkbox" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => onCommand('setValue', { r, c, text: e.target.checked ? 'TRUE' : 'FALSE' })} />;
      else {
        let shown = text;
        // numbers that don't fit become ####
        if (kind === 'num' && !showFormulas && !wrap && shown) { const wText = measureText(shown, fontString(st, Z)); if (wText > w - 6) shown = '#'.repeat(Math.max(1, Math.floor((w - 6) / (fsz * 0.6)))); }
        if (st.rot && !isSpark) content = <span className="srot" style={{ transform: `rotate(${-st.rot}deg)` }}>{shown}</span>;
        else content = shown;
        // overflow into empty neighbours for left-aligned text
        if (!wrap && !mg && kind === 'str' && shown && ha === 'left' && !st.rot) {
          const need = measureText(shown, fontString(st, Z)) + 8; let width = w; let cc = c + 1;
          while (width < need && cc < nCols && isEmpty(r, cc) && !mergeAt(sh, r, cc)) { width += colAxis.size(cc); cc++; }
          if (width > w) { style.width = width; style.zIndex = 1; style.overflow = 'visible'; if (!st.bg) style.background = 'transparent'; }
        }
      }
      const cls = ['sc'];
      if (cf && cf.bar) cls.push('hasbar');
      if (sh.notes && sh.notes[key]) cls.push('hasnote');
      if (findKeys && findKeys.has(key)) cls.push('found');
      if (wrap) cls.push('wrap');
      if (isCheck) cls.push('chk');
      out.push(
        <div key={key} className={cls.join(' ')} style={style} title={sh.notes && sh.notes[key] ? sh.notes[key] : undefined} data-r={r} data-c={c}>
          {cf && cf.bar && <i className="dbar" style={{ left: `${cf.bar.from * 100}%`, width: `${Math.max(1, (cf.bar.to - cf.bar.from) * 100)}%`, background: cf.bar.color }} />}
          {cf && cf.icon && <b className="cficon" style={{ color: cf.icon.color }}>{cf.icon.text}</b>}
          {!(cf && cf.icon && cf.icon.onlyIcon) && content}
          {flt && r === flt.r1 && c >= flt.c1 && c <= flt.c2 && null}
        </div>
      );
    };
    // merges first
    sh.merges.forEach((m) => {
      if (m.r2 < pane.rs || m.r1 > pane.re || m.c2 < pane.cs || m.c1 > pane.ce) return;
      // only draw in the pane containing its top-left, or partially visible main
      const inRow = m.r1 >= pane.rs && m.r1 <= pane.re; const inCol = m.c1 >= pane.cs && m.c1 <= pane.ce;
      if (!(inRow && inCol) && !(pane.id === 'mm')) return;
      seenMerge.add(m); drawn.add(keyOf(m.r1, m.c1)); makeCell(m.r1, m.c1, m);
    });
    for (let r = pane.rs; r <= pane.re; r++) {
      if (rowAxis.size(r) === 0) continue;
      for (let c = pane.cs; c <= pane.ce; c++) {
        if (colAxis.size(c) === 0) continue;
        if (sh.merges.length && mergeAt(sh, r, c)) continue;
        makeCell(r, c, null);
      }
    }
    return out;
  };

  const gridLines = (pane) => {
    if (sh.grid === false) return null;
    const xs = []; const ys = [];
    for (let c = pane.cs; c <= pane.ce + 1; c++) { const x = colAxis.offset(c) - pane.ox; if (x >= 0 && x <= pane.w + 1) xs.push(x); }
    for (let r = pane.rs; r <= pane.re + 1; r++) { const y = rowAxis.offset(r) - pane.oy; if (y >= 0 && y <= pane.h + 1) ys.push(y); }
    const d = xs.map((x) => `M${Math.round(x) - 0.5},0V${pane.h}`).join('') + ys.map((y) => `M0,${Math.round(y) - 0.5}H${pane.w}`).join('');
    return <svg className="glines" width={pane.w} height={pane.h}><path d={d} /></svg>;
  };

  const box = (g, pane, cls, extra) => {
    const x0 = colAxis.offset(g.c1) - pane.ox; const y0 = rowAxis.offset(g.r1) - pane.oy;
    const x1 = colAxis.offset(Math.min(g.c2, nCols - 1) + 1) - pane.ox; const y1 = rowAxis.offset(Math.min(g.r2, nRows - 1) + 1) - pane.oy;
    if (x1 < 0 || y1 < 0 || x0 > pane.w || y0 > pane.h) return null;
    return <div className={cls} style={{ left: x0, top: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0), ...extra }} />;
  };

  const lastG = sel.ranges[sel.ranges.length - 1];
  const activeMerge = mergeAt(sh, sel.active.r, sel.active.c);

  const renderPane = (pane) => {
    const ar = sel.active.r; const ac = sel.active.c;
    const inPane = (r, c) => r >= pane.rs && r <= pane.re && c >= pane.cs && c <= pane.ce;
    return (
      <div key={pane.id} className={'pane ' + pane.id} style={{ left: HDR_W + pane.x, top: HDR_H + pane.y, width: pane.w, height: pane.h }}>
        {gridLines(pane)}
        {renderCells(pane)}
        {refBoxes.map((b, i) => box(b.g, pane, 'refbox', { borderColor: b.color, background: b.color + '14', key: 'rb' + i }))}
        {sel.ranges.map((g, i) => box(normRange({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 }), pane, 'selbox' + (i === sel.ranges.length - 1 ? ' last' : ''), { key: 'sb' + i }))}
        {!editing && inPane(ar, ac) && box(activeMerge ? activeMerge : { r1: ar, c1: ac, r2: ar, c2: ac }, pane, 'activecell', { key: 'ac' })}
        {marquee && box(marquee, pane, 'marquee', { key: 'mq' })}
        {fillPrev && box(fillPrev, pane, 'fillprev', { key: 'fp' })}
        {editing && editing.si === undefined ? null : null}
        {pane.id === 'mm' && lastG && !editing && !readOnly && (() => {
          const g = normRange({ r1: lastG.r1, c1: lastG.c1, r2: Math.min(lastG.r2, nRows - 1), c2: Math.min(lastG.c2, nCols - 1) });
          if (lastG.r1 === 0 && lastG.r2 >= MAX_ROWS - 1 || lastG.c1 === 0 && lastG.c2 >= MAX_COLS - 1) return null;
          const x = colAxis.offset(g.c2 + 1) - pane.ox; const y = rowAxis.offset(g.r2 + 1) - pane.oy;
          if (x < 0 || y < 0 || x > pane.w + 6 || y > pane.h + 6) return null;
          return <div className="fillh" style={{ left: x - 4, top: y - 4 }} onMouseDown={onFillDown} />;
        })()}
        {sh.filter && sh.filter.ref && renderFilterBtns(pane)}
        {dvArrow(pane)}
        {editing && editing.si === si && editing.r >= pane.rs && editing.r <= pane.re && editing.c >= pane.cs && editing.c <= pane.ce && renderEditor(pane)}
        {pane.id === 'mm' && charts.map((ch) => renderChart(ch, pane))}
        {pane.id === 'mm' && dvPop && renderDvPop(pane)}
      </div>
    );
  };

  function dvArrow(pane) {
    if (editing) return null;
    const { r, c } = sel.active;
    if (r < pane.rs || r > pane.re || c < pane.cs || c > pane.ce) return null;
    const dv = dvAt(r, c); if (!dv || !['list', 'listRange'].includes(dv.type) || dv.showDropdown === false) return null;
    const m = activeMerge;
    const x = colAxis.offset((m ? m.c2 : c) + 1) - pane.ox - 18; const y = rowAxis.offset(m ? m.r1 : r) - pane.oy;
    return <button type="button" className="dvarrow" style={{ left: x, top: y + 2, height: Math.min(20, rowAxis.size(r) - 4) }} aria-label="Show options" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDvPop(dvPop ? null : { r, c, items: dvItems(dv, engine, si) }); }}>▾</button>;
  }
  function renderDvPop(pane) {
    const x = colAxis.offset(dvPop.c) - pane.ox; const y = rowAxis.offset(dvPop.r + 1) - pane.oy;
    return (
      <div className="dvpop" style={{ left: x, top: y, minWidth: colAxis.size(dvPop.c) }} role="listbox" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        {dvPop.items.length === 0 && <div className="muted small pad">No options</div>}
        {dvPop.items.map((it, i) => <button key={i} type="button" role="option" onClick={() => { onCommand('setValue', { r: dvPop.r, c: dvPop.c, text: String(it) }); setDvPop(null); root.current.focus({ preventScroll: true }); }}>{String(it)}</button>)}
      </div>
    );
  }
  function renderFilterBtns(pane) {
    const f = sh.filter.ref; const out = [];
    if (f.r1 < pane.rs || f.r1 > pane.re) return null;
    for (let c = Math.max(f.c1, pane.cs); c <= Math.min(f.c2, pane.ce); c++) {
      const x = colAxis.offset(c + 1) - pane.ox - 18; const y = rowAxis.offset(f.r1) - pane.oy;
      const active = sh.filter.cols && sh.filter.cols[c] && (sh.filter.cols[c].hide || sh.filter.cols[c].cond || sh.filter.cols[c].show);
      out.push(<button key={c} type="button" className={'fbtn' + (active ? ' on' : '')} style={{ left: x, top: y + Math.max(2, (rowAxis.size(f.r1) - 18) / 2) }} aria-label={`Filter column ${colName(c)}`} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onFilterBtn(c, e.currentTarget.getBoundingClientRect()); }}>{active ? '▼' : '▾'}</button>);
    }
    return out;
  }
  function renderEditor(pane) {
    const ed = editing; const m = mergeAt(sh, ed.r, ed.c);
    const x = colAxis.offset(ed.c) - pane.ox; const y = rowAxis.offset(ed.r) - pane.oy;
    const w0 = m ? colAxis.offset(m.c2 + 1) - colAxis.offset(m.c1) : colAxis.size(ed.c); const h0 = m ? rowAxis.offset(m.r2 + 1) - rowAxis.offset(m.r1) : rowAxis.size(ed.r);
    const sidx = styleIndexAt(sh, ed.r, ed.c); const st = book.styles[sidx] || {};
    const lines = ed.text.split('\n'); const font = fontString(st, Z);
    const textW = Math.max(...lines.map((l) => measureText(l || ' ', font))) + 16;
    const maxW = Math.max(w0, pane.w - x - 4);
    const width = clamp(Math.max(w0, textW), w0, maxW);
    const wrapLinesN = lines.reduce((n, l) => n + Math.max(1, Math.ceil((measureText(l || ' ', font) + 10) / Math.max(20, width))), 0);
    const height = Math.max(h0, wrapLinesN * ((st.fs || 11) * 96 / 72) * Z * 1.25 + 6);
    const st2 = { left: x, top: y, width, height, fontSize: ((st.fs || 11) * 96 / 72) * Z, fontWeight: st.b ? 700 : 400, fontStyle: st.i ? 'italic' : 'normal', color: st.fc || undefined, fontFamily: st.ff ? `"${st.ff}", ${DEFAULT_FONT_FAMILY}` : undefined, textAlign: st.ha || (typeof cellValue(ed.r, ed.c) === 'number' && !ed.text.startsWith('=') ? 'right' : 'left') };
    return (
      <div className="sed" style={st2}>
        <textarea
          ref={taRef} className="sedta" value={ed.text} spellCheck={false} aria-label={`Editing ${colName(ed.c)}${ed.r + 1}`} rows={1}
          onChange={onEditorChange} onKeyDown={onEditorKey} onBlur={onEditorBlur}
          onKeyUp={(e) => setHint((h) => ({ ...h, caret: e.target.selectionStart }))} onClick={(e) => setHint((h) => ({ ...h, caret: e.target.selectionStart }))}
          onSelect={(e) => { const cur = e.target.selectionStart; setHint((h) => (h.caret === cur ? h : { ...h, caret: cur })); }}
        />
        {acList.length > 0 && (
          <div className="fnpop" role="listbox" style={{ top: height + 2 }} onMouseDown={(e) => e.preventDefault()}>
            {acList.map((it, i) => (<button key={it.name} type="button" role="option" aria-selected={i === acIndex} className={i === acIndex ? 'on' : ''} onClick={() => chooseAc(it)}><b>{it.name.slice(0, it.name.length)}</b><small>{it.isName ? 'named range' : (FN_SIGS(it.name) || {}).desc || ''}</small></button>))}
          </div>
        )}
        {sig && !acList.length && (
          <div className="fnhint" style={{ top: height + 2 }}>
            <b>{call.name}</b>(
            {sig.args.map((a, i) => <span key={i} className={i === Math.min(call.arg, sig.args.length - 1) || (sig.rep && i === sig.args.length - 1 && call.arg >= i) ? 'cur' : ''}>{i ? ', ' : ''}{a}</span>)})
            {sig.desc && <small>{sig.desc}</small>}
          </div>
        )}
      </div>
    );
  }
  function renderChart(ch, pane) {
    const x = ch.x * Z - pane.ox + 0; const y = ch.y * Z - pane.oy;
    const w = ch.w * Z; const h = ch.h * Z;
    if (x + w < 0 || y + h < 0 || x > pane.w || y > pane.h) return null;
    const data = chartData(ch, book, engine, si);
    const selected = selectedChart === ch.id;
    const onDown = (e, mode) => {
      e.stopPropagation(); e.preventDefault(); onChartSelect(ch.id); root.current.focus({ preventScroll: true });
      beginDrag({ kind: 'chart', id: ch.id, mode, x0: e.clientX, y0: e.clientY, orig: { x: ch.x, y: ch.y, w: ch.w, h: ch.h } });
    };
    return (
      <div key={ch.id} className={'chartbox' + (selected ? ' sel' : '')} data-id={ch.id} style={{ left: x, top: y, width: w, height: h }} onMouseDown={(e) => onDown(e, 'move')} onDoubleClick={() => onCommand('editChart', ch.id)}>
        <Chart chart={ch} data={data} width={ch.w} height={ch.h} scale={Z} />
        {selected && ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((m) => <i key={m} className={'chh ' + m} onMouseDown={(e) => onDown(e, m)} />)}
      </div>
    );
  }

  /* headers */
  const colHeaders = [];
  const pushColHeaders = (from, to, zone) => {
    for (let c = from; c <= to; c++) {
      const w = colAxis.size(c); if (w === 0) continue;
      const x = colAxis.offset(c) - (zone === 'f' ? 0 : scroll.x);
      colHeaders.push(<div key={(zone === 'f' ? 'f' : 'm') + c} className={'ch' + (zone === 'f' ? ' fz' : '') + (isColFull(c) ? ' full' : isColSelected(c) ? ' on' : '')} style={{ left: HDR_W + x, width: w }}>{colName(c)}</div>);
    }
  };
  pushColHeaders(0, fc - 1, 'f');
  pushColHeaders(cStart, cEnd, 'm');
  const rowHeaders = [];
  const pushRowHeaders = (from, to, zone) => {
    for (let r = from; r <= to; r++) {
      const h = rowAxis.size(r); if (h === 0) continue;
      const y = rowAxis.offset(r) - (zone === 'f' ? 0 : scroll.y);
      rowHeaders.push(<div key={(zone === 'f' ? 'f' : 'm') + r} className={'rh' + (zone === 'f' ? ' fz' : '') + (isRowFull(r) ? ' full' : isRowSelected(r) ? ' on' : '')} style={{ top: HDR_H + y, height: h }}>{r + 1}</div>);
    }
  };
  pushRowHeaders(0, fr - 1, 'f');
  pushRowHeaders(rStart, rEnd, 'm');

  const hiddenColMarks = []; const hiddenRowMarks = [];
  for (let c = cStart; c <= cEnd; c++) if (isHiddenCol(c)) hiddenColMarks.push(<div key={c} className="hmark v" style={{ left: HDR_W + colAxis.offset(c) - scroll.x - 2 }} />);
  for (let r = rStart; r <= rEnd; r++) if (isHiddenRow(r)) hiddenRowMarks.push(<div key={r} className="hmark h" style={{ top: HDR_H + rowAxis.offset(r) - scroll.y - 2 }} />);

  return (
    <div className={'sgrid' + (hover === 'col' ? ' cur-col' : hover === 'row' ? ' cur-row' : '')} ref={root} tabIndex={0} role="grid" aria-label="Spreadsheet grid" aria-rowcount={nRows} aria-colcount={nCols}
      onKeyDown={onKeyDown} onCopy={onCopy} onCut={onCut} onPaste={onPaste} onContextMenu={onCtx} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onDoubleClick={onDoubleClick}
      style={{ '--z': Z }}>
      <div className="sscroll" ref={scroller} onScroll={onScroll}>
        <div className="sspacer" style={{ width: HDR_W + totalW + 80, height: HDR_H + totalH + 80 }} />
        <div className="sview" ref={view}>
          <div className="corner" style={{ width: HDR_W, height: HDR_H }} />
          <div className="chrow" style={{ left: 0, top: 0, width: '100%', height: HDR_H }}>{colHeaders}</div>
          <div className="rhcol" style={{ top: 0, left: 0, height: '100%', width: HDR_W }}>{rowHeaders}</div>
          {hiddenColMarks}{hiddenRowMarks}
          <div className="corner top" style={{ width: HDR_W, height: HDR_H }} />
          {panes.map(renderPane)}
          {(fr > 0 || fc > 0) && <>{fc > 0 && <div className="freezev" style={{ left: HDR_W + frozenW - 1, top: 0 }} />}{fr > 0 && <div className="freezeh" style={{ top: HDR_H + frozenH - 1, left: 0 }} />}</>}
          {drag && <div className={'rsline ' + drag.kind} style={drag.kind === 'col' ? { left: HDR_W + colAxis.offset(drag.idxs[drag.idxs.length - 1] + 1) - (drag.idxs[0] >= fc ? scroll.x : 0), top: 0 } : { top: HDR_H + rowAxis.offset(drag.idxs[drag.idxs.length - 1] + 1) - (drag.idxs[0] >= fr ? scroll.y : 0), left: 0 }} />}
        </div>
      </div>
    </div>
  );
});

function SparkView({ spark, w, h }) {
  const d = spark.data.filter((v) => v !== null); const type = String(spark.opts.charttype || 'line').toLowerCase();
  if (!d.length) return null;
  const mn = Math.min(...d, 0); const mx = Math.max(...d, 0.0001); const pad = 4; const W = w - pad * 2; const H = h - pad * 2;
  const color = spark.opts.color || '#1a73e8';
  const y = (v) => pad + H - ((v - mn) / (mx - mn || 1)) * H;
  if (type === 'column' || type === 'winloss') {
    const bw = W / spark.data.length;
    return <svg width={w} height={h} className="spark">{spark.data.map((v, i) => v === null ? null : <rect key={i} x={pad + i * bw + 1} width={Math.max(1, bw - 2)} y={Math.min(y(v), y(0))} height={Math.max(1, Math.abs(y(v) - y(0)))} fill={v < 0 ? spark.opts.negcolor || '#d93025' : color} />)}</svg>;
  }
  if (type === 'bar') { const tot = d.reduce((a, b) => a + Math.max(0, b), 0) || 1; let x = pad; return <svg width={w} height={h} className="spark">{d.map((v, i) => { const bw = (Math.max(0, v) / tot) * W; const el = <rect key={i} x={x} y={pad} width={bw} height={H} fill={i % 2 ? '#8ab4f8' : color} />; x += bw; return el; })}</svg>; }
  const pts = spark.data.map((v, i) => (v === null ? null : [pad + (i / Math.max(1, spark.data.length - 1)) * W, y(v)])).filter(Boolean);
  const line = 'M' + pts.map((p) => p.join(',')).join(' L');
  return <svg width={w} height={h} className="spark"><path d={type === 'area' ? line + ` L${pts[pts.length - 1][0]},${pad + H} L${pts[0][0]},${pad + H}Z` : line} fill={type === 'area' ? color + '44' : 'none'} stroke={color} strokeWidth="1.6" /></svg>;
}

export default Grid;
void DEFAULT_ROWH;
