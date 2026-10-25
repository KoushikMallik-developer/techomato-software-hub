import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AppChrome from '../components/AppChrome.jsx';
import Icon from '../components/Icon.jsx';
import { Btn, ColorBtn, Drop, MenuList, Sel, Sep, Stepper, useDismiss } from '../components/ui.jsx';
import { useDialog } from '../components/Dialogs.jsx';
import { useLibrary } from '../lib/useLibrary.js';
import { downloadFile, pickFile, readAsText, safeName } from '../lib/download.js';
import { saveBlob } from '../lib/office/util.js';
import { MAX_COLS, MAX_ROWS, colName, keyOf, parseCell, parseRange, rangeText } from '../lib/sheet/addr.js';
import {
  Axis, Draft, activeIndex, addSheet, applyStyleToRanges, cellEditText, clearRanges, copyBlock, deleteSheet, duplicateSheet, fillBlock, formulaFmtHint, mergeAt, mergeRanges, moveBlock, moveSheet,
  nid, normRange, parseInput, pasteBlock, pasteText, removeDuplicates, renameSheet, setCellInput, sheetRangeRef, sortBlock, splitKey, structural, styleAt, textToColumns, unmergeRanges, uniqueSheetName,
  DEFAULT_COLW, DEFAULT_ROWH, newBook, usedBounds,
} from '../lib/sheet/model.js';
import { createEngine } from '../lib/sheet/engine.js';
import { buildCF, dvCheck, dvRuleAt } from '../lib/sheet/cf.js';
import { FORMAT_PRESETS, formatValue, isDateFormat } from '../lib/sheet/numfmt.js';
import { parseChartRange } from '../lib/sheet/chartData.js';
import { shiftFormula, quoteSheet } from '../lib/sheet/parser.js';
import { SErr } from '../lib/sheet/values.js';
import { parseCSV, toCSV } from '../lib/sheet/csv.js';
import Grid, { HDR_H, HDR_W } from './sheets/Grid.jsx';
import { CFPanel, CFRuleForm, ChartPanel, DedupeDialog, FilterPop, FindPanel, FormatPicker, FunctionPicker, NamesPanel, PivotDialog, SortDialog } from './sheets/Panels.jsx';
import {
  autofitCols, autofitRows, bookFromRows, cellText, chartRangeText, chartSpot, clampToUsed, computeFiltered, contiguousRegion, isWholeCols, isWholeRows, rangeLabel, rowsFromJson, selectionStats,
  sheetRows, sheetToHtmlTable,
} from './sheets/ops.js';
import { SHEET_TEMPLATES } from './sheets/templates.js';
import '../styles/sheets.css';

const blankBook = () => { const b = newBook(); b.active = b.sheets[0].id; return b; };
const FONTS = ['Calibri', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Georgia', 'Times New Roman', 'Cambria', 'Garamond', 'Courier New', 'Consolas', 'Comic Sans MS'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];
const INIT_SEL = { ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], active: { r: 0, c: 0 }, end: { r: 0, c: 0 } };
const BORDER_STYLES = [['thin', 'Thin'], ['medium', 'Medium'], ['thick', 'Thick'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']];

const SHORTCUTS = [
  { group: 'Navigate', items: [['Arrow keys', 'Move'], ['Ctrl + Arrow', 'Jump to edge of data'], ['Home', 'First column'], ['Ctrl + Home', 'Top left'], ['Ctrl + End', 'Last used cell'], ['Page Up / Down', 'Scroll a page'], ['Ctrl + G', 'Go to'], ['Enter / Tab', 'Next cell (Shift goes back)']] },
  { group: 'Select', items: [['Shift + Arrow', 'Extend selection'], ['Ctrl + Space', 'Select column'], ['Shift + Space', 'Select row'], ['Ctrl + A', 'Select all'], ['Ctrl + Click', 'Add to selection']] },
  { group: 'Edit', items: [['F2', 'Edit cell'], ['Esc', 'Cancel editing'], ['Alt + Enter', 'New line in cell'], ['Ctrl + Enter', 'Fill selection with entry'], ['Delete', 'Clear contents'], ['F4', 'Cycle $ in a reference'], ['Ctrl + D', 'Fill down'], ['Ctrl + R', 'Fill right'], ['Ctrl + ;', 'Insert date'], ['Ctrl + Shift + ;', 'Insert time'], ['Alt + =', 'AutoSum'], ['Shift + F2', 'Edit note']] },
  { group: 'Format', items: [['Ctrl + B / I / U', 'Bold / italic / underline'], ['Ctrl + 5', 'Strikethrough'], ['Ctrl + Shift + 1', 'Number'], ['Ctrl + Shift + 4', 'Currency'], ['Ctrl + Shift + 5', 'Percent'], ['Ctrl + \\', 'Clear formatting']] },
  { group: 'Sheet', items: [['Ctrl + Z / Y', 'Undo / redo'], ['Ctrl + F / H', 'Find / replace'], ['Ctrl + K', 'Insert link'], ['Ctrl + Shift + L', 'Toggle filter'], ['Ctrl + `', 'Show formulas'], ['Ctrl + P', 'Print'], ['Ctrl + S', 'Save version']] },
];

function migrate(data) {
  if (data && data.v === 2 && Array.isArray(data.sheets)) return data;
  const b = blankBook();
  if (data && data.cells && typeof data.cells === 'object') {
    const d = new Draft(b);
    Object.keys(data.cells).forEach((k) => {
      const p = parseCell(k); const t = data.cells[k];
      if (p && t !== '' && t !== undefined && t !== null) setCellInput(d, 0, p.r, p.c, String(t));
    });
    const out = d.done(); out.active = out.sheets[0].id; return out;
  }
  return b;
}

function adjustDecimals(fmt, delta, shown) {
  if (!fmt || fmt === 'General') {
    const m = /\.(\d+)/.exec(shown || ''); const n = m ? m[1].length : 0; const nn = Math.max(0, n + delta);
    return nn ? '0.' + '0'.repeat(nn) : '0';
  }
  let hit = false;
  const out = fmt.replace(/(#,##)?0(\.(0+))?/, (all, grp, _d, zeros) => { hit = true; const n = zeros ? zeros.length : 0; const nn = Math.max(0, n + delta); return (grp || '') + '0' + (nn ? '.' + '0'.repeat(nn) : ''); });
  return hit ? out : fmt;
}

function CtxMenu({ ctx, close }) {
  const ref = useRef(null);
  useDismiss(true, (o) => { if (!o) close(); }, ref);
  const [pos, setPos] = useState({ left: ctx.x, top: ctx.y });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(ctx.x, window.innerWidth - r.width - 6)), top: Math.max(4, Math.min(ctx.y, window.innerHeight - r.height - 6)) });
  }, [ctx.x, ctx.y]);
  return (
    <div className="ctxmenu panel" ref={ref} style={pos} onMouseDown={(e) => e.preventDefault()} role="menu">
      <MenuList items={ctx.items} close={close} />
    </div>
  );
}

const guessHeader = (ev, si, g) => {
  if (g.r2 <= g.r1) return false;
  const first = []; const second = [];
  for (let c = g.c1; c <= g.c2; c++) { first.push(ev.value(si, g.r1, c)); second.push(ev.value(si, g.r1 + 1, c)); }
  return first.every((v) => typeof v === 'string' && v !== '') && second.some((v) => typeof v !== 'string' && v !== null);
};

export default function SheetsApp() {
  const lib = useLibrary('sheets', blankBook);
  const dlg = useDialog();
  const { current, edit } = lib;
  const book = useMemo(() => migrate(current.data), [current.data]);
  useEffect(() => { if (current.data !== book && current.data && current.data.v !== 2) edit(() => book, { history: false }); }, [current.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const si = activeIndex(book);
  const sh = book.sheets[si];
  const L = useRef(lib); L.current = lib;

  const engine = useMemo(() => createEngine(book, { now: Date.now() }), [book]);
  const cfFn = useMemo(() => buildCF(sh, si, engine), [sh.cf, sh.cells, engine, si]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => computeFiltered(book, sh, engine, si), [book, sh, engine, si]);
  const shV = useMemo(() => (filtered ? { ...sh, filtered } : sh), [sh, filtered]);

  /* ---------- UI state ---------- */
  const [sel, setSelState] = useState(INIT_SEL);
  const selRef = useRef(sel);
  const selMem = useRef({});
  const curId = useRef(sh.id); curId.current = sh.id;
  const internalMove = useRef(false);
  const tabAnchor = useRef(null);
  const setSel = useCallback((s) => { if (!internalMove.current) tabAnchor.current = null; selRef.current = s; selMem.current[curId.current] = s; setSelState(s); }, []);
  const [editing, setEditingState] = useState(null);
  const editingRef = useRef(null);
  const setEditing = useCallback((v) => { editingRef.current = v; setEditingState(v); }, []);
  const editSeq = useRef(0);
  const [zoom, setZoomState] = useState(() => { try { return Number(localStorage.getItem('techomato:sheets:zoom')) || 1; } catch { return 1; } });
  const setZoom = (z) => { const v = Math.max(0.5, Math.min(2, Math.round(z * 100) / 100)); setZoomState(v); try { localStorage.setItem('techomato:sheets:zoom', String(v)); } catch { /* ignore */ } };
  const [showFormulas, setShowFormulas] = useState(false);
  const [showBar, setShowBar] = useState(true);
  const [panel, setPanel] = useState(null);
  const [findInit, setFindInit] = useState({ key: 0 });
  const [findKeys, setFindKeys] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [selChart, setSelChart] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [filterPop, setFilterPop] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [nameText, setNameText] = useState(null);
  const [barOpen, setBarOpen] = useState(false);
  const [dragTab, setDragTab] = useState(null);
  const gridRef = useRef(null);
  const barRef = useRef(null);
  const clipRef = useRef(null);
  const lastCmd = useRef(null);

  // restore the per-sheet selection when the sheet changes (tab click, undo, version restore)
  useEffect(() => { setSelState(selMem.current[sh.id] || INIT_SEL); selRef.current = selMem.current[sh.id] || INIT_SEL; setMarquee(null); setSelChart(null); }, [sh.id]);
  useEffect(() => { // reset when another file is opened
    selMem.current = {}; setSelState(INIT_SEL); selRef.current = INIT_SEL; setEditing(null); setPanel(null); setMarquee(null); setSelChart(null);
  }, [current.id, setEditing]);

  const focusGrid = () => { if (gridRef.current) gridRef.current.focus(); setTimeout(() => { if (gridRef.current && !editingRef.current) gridRef.current.focus(); }, 0); };

  /* ---------- data mutation ---------- */
  const mutate = useCallback((fn, opts) => {
    L.current.edit((b) => {
      const d = new Draft(migrate(b));
      let ev = null;
      const lazyEv = () => ev || (ev = createEngine(d.book, { now: Date.now() }));
      // evaluate against the book as it is before this change
      const evBefore = () => { if (!ev) ev = createEngine(b, { now: Date.now() }); return ev; };
      const res = fn(d, b, evBefore);
      void lazyEv;
      return res === false ? b : d.done();
    }, opts);
  }, []);

  /* ---------- derived ---------- */
  const lastRange = sel.ranges[sel.ranges.length - 1];
  const ext = useMemo(() => engine.usedExtent(si), [engine, si]);
  const act = sel.active;
  const actKey = keyOf(act.r, act.c);
  const actCell = sh.cells[actKey];
  const actStyle = styleAt(book, sh, act.r, act.c);
  const actValue = engine.value(si, act.r, act.c);
  const actText = actCell ? cellEditText(actCell) : (typeof actValue === 'object' && actValue !== null ? '' : actValue === null ? '' : cellEditText({ v: actValue }));
  const stats = useMemo(() => selectionStats(engine, si, sel, ext), [engine, si, sel, ext]);
  const multiSel = sel.ranges.length > 1 || lastRange.r2 > lastRange.r1 || lastRange.c2 > lastRange.c1;
  const selRect = (g) => normRange({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 });

  /* ---------- selection helpers ---------- */
  const select = (g, active) => {
    const n = normRange(g); const a = active || { r: n.r1, c: n.c1 };
    setSel({ ranges: [n], active: a, end: { r: n.r2, c: n.c2 } });
  };
  const selectCell = (r, c) => select({ r1: r, c1: c, r2: r, c2: c });
  const goTo = (m) => {
    if (m.si !== si) { mutate((d) => { d.book.active = d.book.sheets[m.si].id; }, { history: false }); selMem.current[book.sheets[m.si].id] = { ranges: [{ r1: m.r, c1: m.c, r2: m.r, c2: m.c }], active: { r: m.r, c: m.c }, end: { r: m.r, c: m.c } }; }
    else selectCell(m.r, m.c);
  };
  const switchSheet = (id) => {
    if (id === sh.id) return;
    if (editingRef.current && editingRef.current.text.startsWith('=')) { /* keep editing: pointing at another sheet */ }
    else if (editingRef.current) commitEdit(editingRef.current.text, 'none');
    mutate((d) => { d.book.active = id; }, { history: false });
  };

  /* ---------- cell editing ---------- */
  const startEdit = (r, c, key, mode, cell) => {
    if (editingRef.current) return;
    const text = key !== null && key !== undefined ? key : cellEditText(cell);
    setMarquee(null);
    setEditing({ r, c, si, sheetId: sh.id, sheetSi: si, text, mode, src: 'cell', focusKey: ++editSeq.current, point: null });
  };
  const startBarEdit = () => {
    if (editingRef.current) return;
    setEditing({ r: act.r, c: act.c, si, sheetId: sh.id, sheetSi: si, text: cellEditText(actCell), mode: 'edit', src: 'bar', focusKey: ++editSeq.current, point: null });
  };
  const cancelEdit = () => {
    const ed = editingRef.current; setEditing(null);
    if (ed && ed.sheetId !== curId.current) mutate((d) => { d.book.active = ed.sheetId; }, { history: false });
    focusGrid();
  };
  const stepActive = (dir) => {
    const s = selRef.current; const g = s.ranges[s.ranges.length - 1];
    const dr = dir === 'down' ? 1 : dir === 'up' ? -1 : 0; const dc = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
    const multi = (g.r2 > g.r1 || g.c2 > g.c1) && !isWholeCols(g) && !isWholeRows(g);
    let { r, c } = s.active;
    const hiddenR = (x) => !!(sh.hidden.rows && sh.hidden.rows[x]) || !!(filtered && filtered[x]);
    if (multi) {
      const gr = { r1: g.r1, r2: Math.min(g.r2, sh.rows - 1), c1: g.c1, c2: Math.min(g.c2, sh.cols - 1) };
      if (dc) { c += dc; if (c > gr.c2) { c = gr.c1; r++; } if (c < gr.c1) { c = gr.c2; r--; } if (r > gr.r2) r = gr.r1; if (r < gr.r1) r = gr.r2; }
      else { r += dr; if (r > gr.r2) { r = gr.r1; c++; } if (r < gr.r1) { r = gr.r2; c--; } if (c > gr.c2) c = gr.c1; if (c < gr.c1) c = gr.c2; }
      setSel({ ...s, active: { r, c } });
      return;
    }
    const m = mergeAt(sh, r, c);
    if (m) { if (dr > 0) r = m.r2; if (dr < 0) r = m.r1; if (dc > 0) c = m.c2; if (dc < 0) c = m.c1; }
    r = Math.max(0, Math.min(MAX_ROWS - 1, r + dr)); c = Math.max(0, Math.min(MAX_COLS - 1, c + dc));
    while (dr && hiddenR(r) && r < sh.rows) r += dr;
    const m2 = mergeAt(sh, r, c);
    if (m2) select(m2, { r: m2.r1, c: m2.c1 }); else selectCell(r, c);
  };
  const commitEdit = (text, dir) => {
    const ed = editingRef.current; if (!ed) return;
    const eSi = ed.si; const esh = book.sheets[eSi] || sh;
    // data validation
    const rule = dvRuleAt(esh, ed.r, ed.c);
    if (rule && rule.type !== 'checkbox' && text !== '' && !text.startsWith('=') && rule.reject !== false) {
      const p = parseInput(text, (styleAt(book, esh, ed.r, ed.c) || {}).fmt);
      const v = p.t === 'number' || p.t === 'text' || p.t === 'bool' ? p.v : text;
      const res = dvCheck(rule, typeof v === 'string' ? v : v, engine, eSi, ed.r, ed.c);
      if (!res.ok) { dlg.toast(res.msg || 'That entry is not allowed in this cell.', { kind: 'error', ms: 3500 }); return; }
    }
    setEditing(null);
    if (ed.sheetId !== curId.current) mutate((d) => { d.book.active = ed.sheetId; }, { history: false });
    const s = selRef.current;
    mutate((d) => {
      if (dir === 'fill') {
        s.ranges.forEach((g0) => { const g = clampToUsed(normRange(g0), { r: Math.max(ext.r, g0.r1 + 5000), c: Math.max(ext.c, g0.c1 + 500) }); for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 50000); r++) for (let c = g.c1; c <= g.c2; c++) setCellInput(d, eSi, r, c, text.startsWith('=') ? shiftFormula(text, r - ed.r, c - ed.c) : text); });
      } else setCellInput(d, eSi, ed.r, ed.c, text);
    });
    setMarquee(null);
    if (dir && dir !== 'none' && dir !== 'fill') {
      internalMove.current = true;
      selRef.current = { ...selRef.current, active: { r: ed.r, c: ed.c } };
      const single = !((s.ranges[s.ranges.length - 1].r2 > s.ranges[s.ranges.length - 1].r1) || (s.ranges[s.ranges.length - 1].c2 > s.ranges[s.ranges.length - 1].c1));
      if (single && dir === 'right') { if (!tabAnchor.current || tabAnchor.current.row !== ed.r) tabAnchor.current = { row: ed.r, col: ed.c }; stepActive(dir); }
      else if (single && dir === 'down' && tabAnchor.current && tabAnchor.current.row === ed.r) { const col = tabAnchor.current.col; tabAnchor.current = null; selectCell(Math.min(MAX_ROWS - 1, ed.r + 1), col); }
      else { tabAnchor.current = null; stepActive(dir); }
      internalMove.current = false;
    }
    focusGrid();
  };

  /* ---------- formatting ---------- */
  const applyStyle = (patch) => mutate((d) => applyStyleToRanges(d, si, selRef.current.ranges, patch));
  const toggle = (key) => applyStyle({ [key]: !actStyle[key] });
  const setFmt = (fmt) => applyStyle({ fmt });
  const shownText = actValue === null ? '' : formatValue(typeof actValue === 'object' && !(actValue instanceof SErr) ? '' : actValue, actStyle.fmt).text;
  const doBorders = (kind, style = 'thin', color = '#202124') => {
    const b = [style, color];
    mutate((d) => {
      selRef.current.ranges.forEach((g0) => {
        const g = clampToUsed(normRange(g0), { r: Math.max(sh.rows, g0.r2) - 1, c: Math.max(sh.cols, g0.c2) - 1 });
        const ap = (r1, c1, r2, c2, bd) => { if (r1 <= r2 && c1 <= c2 && r1 >= 0 && c1 >= 0) applyStyleToRanges(d, si, [{ r1, c1, r2, c2 }], { bd }); };
        switch (kind) {
          case 'all': ap(g.r1, g.c1, g.r2, g.c2, { t: b, r: b, b, l: b }); break;
          case 'outer': ap(g.r1, g.c1, g.r1, g.c2, { t: b }); ap(g.r2, g.c1, g.r2, g.c2, { b }); ap(g.r1, g.c1, g.r2, g.c1, { l: b }); ap(g.r1, g.c2, g.r2, g.c2, { r: b }); break;
          case 'inner': ap(g.r1, g.c1, g.r2, g.c2 - 1, { r: b }); ap(g.r1, g.c1 + 1, g.r2, g.c2, { l: b }); ap(g.r1, g.c1, g.r2 - 1, g.c2, { b }); ap(g.r1 + 1, g.c1, g.r2, g.c2, { t: b }); break;
          case 'top': ap(g.r1, g.c1, g.r1, g.c2, { t: b }); break;
          case 'bottom': ap(g.r2, g.c1, g.r2, g.c2, { b }); break;
          case 'left': ap(g.r1, g.c1, g.r2, g.c1, { l: b }); break;
          case 'right': ap(g.r1, g.c2, g.r2, g.c2, { r: b }); break;
          case 'horizontal': ap(g.r1, g.c1, g.r2 - 1, g.c2, { b }); ap(g.r1 + 1, g.c1, g.r2, g.c2, { t: b }); break;
          case 'vertical': ap(g.r1, g.c1, g.r2, g.c2 - 1, { r: b }); ap(g.r1, g.c1 + 1, g.r2, g.c2, { l: b }); break;
          case 'none':
            ap(g.r1, g.c1, g.r2, g.c2, { t: null, r: null, b: null, l: null });
            ap(g.r1 - 1, g.c1, g.r1 - 1, g.c2, { b: null }); ap(g.r2 + 1, g.c1, g.r2 + 1, g.c2, { t: null });
            ap(g.r1, g.c1 - 1, g.r2, g.c1 - 1, { r: null }); ap(g.r1, g.c2 + 1, g.r2, g.c2 + 1, { l: null });
            break;
          default: break;
        }
      });
    });
  };
  const doMerge = (mode) => {
    mutate((d) => { selRef.current.ranges.forEach((g) => { if (mode === 'none') unmergeRanges(d, si, g); else mergeRanges(d, si, g, mode); }); });
    const g = lastRange;
    if (mode === 'all') select(g, { r: Math.min(g.r1, g.r2), c: Math.min(g.c1, g.c2) });
  };
  const setFreeze = (r, c) => mutate((d) => { d.patch(si, { freeze: { r, c } }); });

  /* ---------- structure ---------- */
  const countOf = (axis) => { const g = lastRange; return axis === 'r' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1; };
  const insertAxis = (axis, after) => {
    const g = normRange(lastRange); const n = Math.min(countOf(axis), 500);
    const at = axis === 'r' ? (after ? g.r2 + 1 : g.r1) : (after ? g.c2 + 1 : g.c1);
    mutate((d) => { structural(d, si, axis, at, n, 'insert'); });
    if (!after) { const s = selRef.current; setSel({ ...s, ranges: s.ranges.map((x) => ({ ...x })) }); }
  };
  const deleteAxis = async (axis) => {
    const g = normRange(lastRange); const n = countOf(axis);
    const at = axis === 'r' ? g.r1 : g.c1;
    if (n > 200 && !(await dlg.confirm({ title: `Delete ${axis === 'r' ? 'rows' : 'columns'}`, message: `Delete ${n} ${axis === 'r' ? 'rows' : 'columns'}?`, okText: 'Delete', danger: true }))) return;
    mutate((d) => { structural(d, si, axis, at, n, 'delete'); });
    const s = selRef.current; const c = { r: axis === 'r' ? Math.min(s.active.r, at) : s.active.r, c: axis === 'c' ? Math.min(s.active.c, at) : s.active.c };
    selectCell(c.r, c.c);
  };
  const insertCells = (shift) => { // shift: 'down' | 'right'
    const g = normRange(lastRange);
    mutate((d) => { // emulate by moving the block below/right of the selection
      const cur = d.sheet(si);
      const e = Math.max(usedBounds(cur).r, g.r2); const ec = Math.max(usedBounds(cur).c, g.c2);
      if (shift === 'down') { const h = g.r2 - g.r1 + 1; for (let c = g.c1; c <= g.c2; c++) if (e >= g.r1) moveBlock(d, si, { r1: g.r1, r2: e, c1: c, c2: c }, h, 0); }
      else { const w = g.c2 - g.c1 + 1; for (let r = g.r1; r <= g.r2; r++) if (ec >= g.c1) moveBlock(d, si, { r1: r, r2: r, c1: g.c1, c2: ec }, 0, w); }
    });
  };
  const deleteCells = (shift) => {
    const g = normRange(lastRange);
    mutate((d) => {
      clearRanges(d, si, [g], 'all');
      const cur = d.sheet(si);
      const e = usedBounds(cur);
      if (shift === 'up') { const h = g.r2 - g.r1 + 1; for (let c = g.c1; c <= g.c2; c++) if (e.r > g.r2) moveBlock(d, si, { r1: g.r2 + 1, r2: e.r, c1: c, c2: c }, -h, 0); }
      else { const w = g.c2 - g.c1 + 1; for (let r = g.r1; r <= g.r2; r++) if (e.c > g.c2) moveBlock(d, si, { r1: r, r2: r, c1: g.c2 + 1, c2: e.c }, 0, -w); }
    });
  };
  const hideAxis = (axis, hide) => mutate((d) => {
    const cur = d.sheet(si); const key = axis === 'r' ? 'rows' : 'cols';
    const map = { ...cur.hidden[key] };
    selRef.current.ranges.forEach((g0) => {
      const g = normRange(g0);
      let a = axis === 'r' ? g.r1 : g.c1; let b = axis === 'r' ? g.r2 : g.c2;
      if (!hide) { while (a > 0 && map[a - 1]) a--; while (map[b + 1]) b++; }
      for (let i = a; i <= Math.min(b, (axis === 'r' ? sh.rows : sh.cols) + 50); i++) { if (hide) map[i] = true; else delete map[i]; }
    });
    cur.hidden = { ...cur.hidden, [key]: map };
  });
  const setSize = (axis, idxs, size) => mutate((d) => {
    const cur = d.sheet(si); const key = axis === 'col' ? 'colW' : 'rowH';
    const map = { ...cur[key] };
    idxs.forEach((i) => { if (size === null) delete map[i]; else map[i] = size; });
    cur[key] = map;
    if (cur.hidden) { const hk = axis === 'col' ? 'cols' : 'rows'; if (idxs.some((i) => cur.hidden[hk] && cur.hidden[hk][i])) { const h = { ...cur.hidden[hk] }; idxs.forEach((i) => delete h[i]); cur.hidden = { ...cur.hidden, [hk]: h }; } }
  });
  const selectedAxisIdxs = (axis) => {
    const out = new Set();
    selRef.current.ranges.forEach((g0) => { const g = normRange(g0); const a = axis === 'col' ? g.c1 : g.r1; const b = axis === 'col' ? g.c2 : g.r2; for (let i = a; i <= Math.min(b, (axis === 'col' ? sh.cols : sh.rows) - 1); i++) out.add(i); });
    return [...out];
  };
  const autofit = (axis, idxs) => {
    if (axis === 'col') { const m = autofitCols(book, sh, si, engine, idxs, ext); mutate((d) => { const cur = d.sheet(si); cur.colW = { ...cur.colW, ...m }; }); }
    else { const m = autofitRows(book, sh, si, engine, idxs, ext); mutate((d) => { const cur = d.sheet(si); cur.rowH = { ...cur.rowH, ...m }; }); }
  };
  const sizeDialog = async (axis) => {
    const idxs = selectedAxisIdxs(axis);
    const cur = axis === 'col' ? sh.colW[idxs[0]] || DEFAULT_COLW : sh.rowH[idxs[0]] || DEFAULT_ROWH;
    const r = await dlg.form({ title: axis === 'col' ? 'Column width' : 'Row height', fields: [{ name: 'v', label: `${axis === 'col' ? 'Width' : 'Height'} in pixels`, type: 'number', value: cur, min: axis === 'col' ? 12 : 8, max: 800 }], validate: (v) => (v.v === '' || v.v < 4 ? 'Enter a size.' : '') });
    if (r) setSize(axis, idxs, Number(r.v));
  };

  /* ---------- clearing ---------- */
  const clearSel = (what) => {
    if (selChart) { deleteChart(selChart); return; }
    mutate((d) => {
      if (what === 'notes') { const cur = d.sheet(si); const n = { ...cur.notes }; selRef.current.ranges.forEach((g0) => { const g = normRange(g0); Object.keys(n).forEach((k) => { const { r, c } = splitKey(k); if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) delete n[k]; }); }); cur.notes = n; return; }
      if (what === 'validation') { const cur = d.sheet(si); cur.dv = (cur.dv || []).map((x) => ({ ...x, ranges: x.ranges.flatMap((r) => subtract(r, selRef.current.ranges)) })).filter((x) => x.ranges.length); return; }
      clearRanges(d, si, selRef.current.ranges, what);
    });
  };
  function subtract(r, cuts) { // remove cut areas from a rect (simple: drop when fully covered, else keep)
    return cuts.some((c0) => { const c = normRange(c0); return c.r1 <= r.r1 && c.r2 >= r.r2 && c.c1 <= r.c1 && c.c2 >= r.c2; }) ? [] : [r];
  }

  /* ---------- sort & filter ---------- */
  const sortRegion = () => {
    const g = normRange(lastRange);
    if (g.r1 === g.r2 && g.c1 === g.c2) return contiguousRegion(engine, si, g.r1, g.c1);
    return clampToUsed(g, ext);
  };
  const quickSort = (desc, colOverride) => {
    let g = sortRegion();
    const hasHeader = guessHeader(engine, si, g);
    const col = colOverride !== undefined ? colOverride : Math.min(Math.max(act.c, g.c1), g.c2);
    mutate((d, b, ev) => { const e = ev(); sortBlock(d, si, g, [{ col, desc }], hasHeader, (r, c) => e.value(si, r, c)); });
  };
  const sortDialog = async () => {
    const g = sortRegion(); const hg = guessHeader(engine, si, g);
    const res = await dlg.custom(({ close }) => <SortDialog g={g} headerGuess={hg} labelOf={(c) => { const v = engine.value(si, g.r1, c); return v === null ? '' : String(v); }} close={close} />, { title: 'Sort range', width: 460 });
    if (res) mutate((d, b, ev) => { const e = ev(); sortBlock(d, si, g, res.keys, res.hasHeader, (r, c) => e.value(si, r, c)); });
  };
  const toggleFilter = () => {
    if (sh.filter) { mutate((d) => { d.patch(si, { filter: null }); }); return; }
    let g = normRange(lastRange);
    if (g.r1 === g.r2 && g.c1 === g.c2) g = contiguousRegion(engine, si, g.r1, g.c1); else g = clampToUsed(g, ext);
    if (g.r2 <= g.r1 && g.c2 <= g.c1) { dlg.toast('Select a range of data first.'); return; }
    mutate((d) => { d.patch(si, { filter: { ref: g, cols: {} } }); });
  };
  const openFilterPop = (c, rect) => {
    const f = sh.filter; if (!f) return;
    const counts = new Map();
    for (let r = f.ref.r1 + 1; r <= f.ref.r2; r++) { const t = cellText(engine, book, sh, si, r, c); counts.set(t, (counts.get(t) || 0) + 1); }
    const values = [...counts.entries()].map(([text, n]) => ({ text, n })).sort((a, b) => { const x = parseFloat(a.text); const y = parseFloat(b.text); if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y; return a.text.localeCompare(b.text); });
    setFilterPop({ c, rect, values });
  };
  const applyFilterCol = (c, state) => {
    mutate((d) => {
      const f = d.sheet(si).filter; if (!f) return false;
      const cols = { ...f.cols };
      if ((state.hide && state.hide.length) || state.cond) cols[c] = { hide: state.hide && state.hide.length ? state.hide : undefined, cond: state.cond || undefined }; else delete cols[c];
      d.patch(si, { filter: { ...f, cols } });
      return undefined;
    });
    setFilterPop(null);
  };
  const clearFilters = () => mutate((d) => { const f = d.sheet(si).filter; if (!f) return false; d.patch(si, { filter: { ...f, cols: {} } }); return undefined; });
  const filterSort = (c, desc) => {
    const f = sh.filter; if (!f) return;
    mutate((d, b, ev) => { const e = ev(); sortBlock(d, si, f.ref, [{ col: c, desc }], true, (r, cc) => e.value(si, r, cc)); });
    setFilterPop(null);
  };

  /* ---------- fill ---------- */
  const doFill = (src, dst, dir) => {
    const s = normRange(src); const t = normRange(dst);
    let target;
    if (dir === 'down') target = { r1: s.r2 + 1, r2: t.r2, c1: s.c1, c2: s.c2 };
    else if (dir === 'up') target = { r1: t.r1, r2: s.r1 - 1, c1: s.c1, c2: s.c2 };
    else if (dir === 'right') target = { r1: s.r1, r2: s.r2, c1: s.c2 + 1, c2: t.c2 };
    else target = { r1: s.r1, r2: s.r2, c1: t.c1, c2: s.c1 - 1 };
    if (target.r2 < target.r1 || target.c2 < target.c1) return;
    mutate((d, b, ev) => { const e = ev(); fillBlock(d, si, s, target, dir, (r, c) => e.value(si, r, c), { isDate: (r, c) => isDateFormat((styleAt(b, b.sheets[si], r, c) || {}).fmt) }); });
    select({ r1: Math.min(s.r1, target.r1), c1: Math.min(s.c1, target.c1), r2: Math.max(s.r2, target.r2), c2: Math.max(s.c2, target.c2) }, selRef.current.active);
  };
  const fillDirection = (dir) => { // Ctrl+D / Ctrl+R on the selection
    const g = normRange(lastRange);
    if (dir === 'down' && g.r2 > g.r1) doFill({ ...g, r2: g.r1 }, g, 'down');
    else if (dir === 'right' && g.c2 > g.c1) doFill({ ...g, c2: g.c1 }, g, 'right');
    else if (dir === 'down' && g.r1 > 0) doFillCopy({ r1: g.r1 - 1, r2: g.r1 - 1, c1: g.c1, c2: g.c2 }, g, 'down');
    else if (dir === 'right' && g.c1 > 0) doFillCopy({ r1: g.r1, r2: g.r2, c1: g.c1 - 1, c2: g.c1 - 1 }, g, 'right');
  };
  function doFillCopy(src, target, dir) {
    mutate((d, b, ev) => { const e = ev(); fillBlock(d, si, src, target, dir, (r, c) => e.value(si, r, c), { copyOnly: true }); });
  }
  const fillAuto = (g0) => {
    const g = normRange(g0);
    // extend down alongside the neighbouring column (or row) of data
    const probe = (c) => { let r = g.r2 + 1; if (c < 0) return g.r2; while (r < MAX_ROWS) { const v = engine.value(si, r, c); if (v === null || v === '') break; r++; } return r - 1; };
    const left = probe(g.c1 - 1); const right = probe(g.c2 + 1);
    const end = Math.max(left, right);
    if (end > g.r2) doFill(g, { ...g, r2: end }, 'down');
  };
  const fillSeriesDialog = async () => {
    const g = normRange(lastRange);
    const r = await dlg.form({
      title: 'Fill series', message: `Fills ${rangeLabel(g)} using the first cell as the start.`,
      fields: [{ name: 'step', label: 'Step value', type: 'number', value: 1, step: 'any' }, { name: 'dir', label: 'Series in', type: 'select', value: g.r2 > g.r1 || g.c2 === g.c1 ? 'col' : 'row', options: [{ value: 'col', label: 'Columns (down)' }, { value: 'row', label: 'Rows (across)' }] }],
    });
    if (!r) return;
    const step = Number(r.step) || 1;
    mutate((d, b, ev) => {
      const e = ev();
      if (r.dir === 'col') for (let c = g.c1; c <= g.c2; c++) { const start = e.value(si, g.r1, c); if (typeof start !== 'number') continue; for (let i = 0; i <= g.r2 - g.r1; i++) { const k = keyOf(g.r1 + i, c); const old = d.sheet(si).cells[k]; d.sheet(si).cells[k] = { ...(old && old.s !== undefined ? { s: old.s } : {}), v: start + step * i }; } }
      else for (let rr = g.r1; rr <= g.r2; rr++) { const start = e.value(si, rr, g.c1); if (typeof start !== 'number') continue; for (let i = 0; i <= g.c2 - g.c1; i++) { const k = keyOf(rr, g.c1 + i); const old = d.sheet(si).cells[k]; d.sheet(si).cells[k] = { ...(old && old.s !== undefined ? { s: old.s } : {}), v: start + step * i }; } }
    });
  };

  /* ---------- clipboard ---------- */
  const copyRange = () => {
    const g = clampToUsed(normRange(lastRange), { r: Math.max(ext.r, lastRange.r1), c: Math.max(ext.c, lastRange.c1) });
    const clip = copyBlock(book, sh, g, (r, c) => engine.value(si, r, c));
    const tsv = clip.cells.map((row, i) => row.map((x, j) => { const t = cellText(engine, book, sh, si, g.r1 + i, g.c1 + j); return /[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join('\t')).join('\n');
    const html = '<table>' + clip.cells.map((row, i) => '<tr>' + row.map((x, j) => `<td>${cellText(engine, book, sh, si, g.r1 + i, g.c1 + j).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</td>`).join('') + '</tr>').join('') + '</table>';
    return { clip, tsv, html, range: g };
  };
  const onClipboard = (kind, e) => {
    if (kind === 'copy' || kind === 'cut') {
      const c = copyRange();
      clipRef.current = { ...c, cut: kind === 'cut', si, sheetId: sh.id };
      setMarquee(c.range);
      if (e && e.clipboardData) { e.clipboardData.setData('text/plain', c.tsv); e.clipboardData.setData('text/html', c.html); }
      return;
    }
    const text = e && e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    doPaste('all', text);
  };
  const doPaste = (mode, text) => {
    const ref = clipRef.current;
    const norm = (s) => (s || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
    const internal = ref && (text === undefined || text === '' || norm(text) === norm(ref.tsv));
    const g = normRange(lastRange);
    const r0 = g.r1; const c0 = g.c1;
    if (internal) {
      const { clip } = ref;
      const tr = mode === 'transpose';
      const H = tr ? clip.w : clip.h; const W = tr ? clip.h : clip.w;
      const selH = isWholeCols(g) ? H : g.r2 - g.r1 + 1; const selW = isWholeRows(g) ? W : g.c2 - g.c1 + 1;
      const ty = !ref.cut && selH >= H && selH % H === 0 ? selH / H : 1; const tx = !ref.cut && selW >= W && selW % W === 0 ? selW / W : 1;
      mutate((d) => {
        if (ref.cut && mode === 'all') {
          const src = clip.src; const dr = r0 - src.r1; const dc = c0 - src.c1;
          const srcIdx = book.sheets.findIndex((s) => s.id === ref.sheetId);
          if (srcIdx >= 0) moveBlock(d, srcIdx, src, dr, dc, si);
        } else {
          for (let y = 0; y < ty; y++) for (let x = 0; x < tx; x++) pasteBlock(d, si, r0 + y * H, c0 + x * W, clip, mode);
        }
      });
      if (ref.cut && mode === 'all') clipRef.current = null;
      setMarquee(null);
      select({ r1: r0, c1: c0, r2: r0 + H * ty - 1, c2: c0 + W * tx - 1 }, { r: r0, c: c0 });
      return;
    }
    if (!text) { dlg.toast('Nothing to paste.'); return; }
    const rows = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    if (rows.length === 1 && !rows[0].includes('\t') && multiSel) {
      mutate((d) => { sel.ranges.forEach((g1) => { const x = clampToUsed(normRange(g1), { r: Math.max(sh.rows, 1) - 1, c: Math.max(sh.cols, 1) - 1 }); for (let r = x.r1; r <= x.r2; r++) for (let c = x.c1; c <= x.c2; c++) setCellInput(d, si, r, c, rows[0]); }); });
      return;
    }
    let dims = { h: 0, w: 0 };
    mutate((d) => { dims = pasteText(d, si, r0, c0, text); });
    select({ r1: r0, c1: c0, r2: r0 + Math.max(dims.h, 1) - 1, c2: c0 + Math.max(dims.w, 1) - 1 }, { r: r0, c: c0 });
  };
  const menuClipboard = async (kind, mode = 'all') => {
    if (kind === 'copy' || kind === 'cut') {
      gridRef.current && gridRef.current.focus();
      let ok = false;
      try { ok = document.execCommand(kind); } catch { ok = false; }
      if (!ok) { const c = copyRange(); clipRef.current = { ...c, cut: kind === 'cut', si, sheetId: sh.id }; setMarquee(c.range); try { await navigator.clipboard.writeText(c.tsv); } catch { /* ignore */ } }
      return;
    }
    let text;
    if (mode === 'all') { try { text = await navigator.clipboard.readText(); } catch { text = undefined; } }
    doPaste(mode, mode === 'all' ? text : undefined);
  };

  /* ---------- charts ---------- */
  const insertChart = () => {
    let g = normRange(lastRange);
    if (g.r1 === g.r2 && g.c1 === g.c2) g = contiguousRegion(engine, si, g.r1, g.c1); else g = clampToUsed(g, ext);
    if (engine.value(si, g.r1, g.c1) === null && g.r1 === g.r2) { dlg.toast('Select the cells you want to chart first.'); return; }
    const spot = chartSpot(sh, g);
    const dateCat = isDateFormat((styleAt(book, sh, g.r1 + 1, g.c1) || {}).fmt);
    const chart = { id: nid('ch'), type: dateCat ? 'line' : 'column', range: chartRangeText(book, si, g).replace(/^[^!]*!/, ''), title: '', legend: 'right', ...spot };
    mutate((d) => { const cur = d.sheet(si); cur.charts = [...(cur.charts || []), chart]; });
    setSelChart(chart.id); setPanel('chart');
  };
  const updateChart = (id, patch, key) => mutate((d) => { const cur = d.sheet(si); cur.charts = cur.charts.map((c) => { if (c.id !== id) return c; const n = { ...c, ...patch }; Object.keys(n).forEach((k) => n[k] === undefined && delete n[k]); return n; }); }, key ? { coalesce: 'chart:' + id + key, coalesceMs: 900 } : undefined);
  function deleteChart(id) { mutate((d) => { const cur = d.sheet(si); cur.charts = cur.charts.filter((c) => c.id !== id); }); setSelChart(null); setPanel((p) => (p === 'chart' ? null : p)); }
  const chartObj = selChart ? (sh.charts || []).find((c) => c.id === selChart) : null;
  useEffect(() => { if (selChart && !chartObj) setSelChart(null); }, [selChart, chartObj]);

  /* ---------- notes, links, validation, special inserts ---------- */
  const editNote = async () => {
    const k = actKey; const cur = (sh.notes || {})[k] || '';
    const r = await dlg.form({ title: `Note on ${k}`, fields: [{ name: 'v', label: 'Note', type: 'textarea', value: cur, rows: 5 }], okText: 'Save' });
    if (r === null) return;
    mutate((d) => { const s = d.sheet(si); const n = { ...s.notes }; if (r.v.trim()) n[k] = r.v; else delete n[k]; s.notes = n; });
  };
  const insertLink = async () => {
    const cur = actCell && actCell.f && /^=HYPERLINK\(/i.test(actCell.f) ? actCell.f : '';
    const m = /^=HYPERLINK\("((?:[^"]|"")*)"(?:,\s*"((?:[^"]|"")*)")?\)$/i.exec(cur);
    const r = await dlg.form({
      title: 'Insert link',
      fields: [{ name: 'url', label: 'Link', type: 'text', value: m ? m[1].replace(/""/g, '"') : '', placeholder: 'https://example.com' }, { name: 'label', label: 'Text to show', type: 'text', value: m && m[2] ? m[2].replace(/""/g, '"') : String(actText && !cur ? actText : '') }],
      validate: (v) => (v.url.trim() ? '' : 'Enter a link.'),
    });
    if (!r) return;
    let url = r.url.trim(); if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
    const q = (s) => s.replace(/"/g, '""');
    mutate((d) => { setCellInput(d, si, act.r, act.c, `=HYPERLINK("${q(url)}"${r.label.trim() ? `,"${q(r.label.trim())}"` : ''})`); });
  };
  const insertDateTime = (time) => {
    const n = new Date();
    const text = time ? `${n.getHours()}:${String(n.getMinutes()).padStart(2, '0')}` : `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    mutate((d) => { setCellInput(d, si, act.r, act.c, text); });
  };
  const insertCheckbox = () => {
    mutate((d) => {
      const cur = d.sheet(si);
      cur.dv = [...(cur.dv || []), { id: nid('dv'), ranges: sel.ranges.map(normRange), type: 'checkbox' }];
      sel.ranges.forEach((g0) => { const g = clampToUsed(normRange(g0), { r: g0.r1 + 2000, c: g0.c1 + 100 }); for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const k = keyOf(r, c); const old = cur.cells[k]; if (!old || (old.v === undefined && !old.f)) cur.cells[k] = { ...(old || {}), v: false }; } });
    });
  };
  const validationDialog = async () => {
    const ex = dvRuleAt(sh, act.r, act.c);
    const g = normRange(lastRange);
    const r = await dlg.form({
      title: 'Data validation', width: 460, okText: 'Save',
      fields: [
        { name: 'type', label: 'Allow', type: 'select', value: ex ? ex.type : 'list', options: [{ value: 'list', label: 'List of items' }, { value: 'listRange', label: 'List from a range' }, { value: 'number', label: 'Number' }, { value: 'whole', label: 'Whole number' }, { value: 'date', label: 'Date' }, { value: 'textLen', label: 'Text length' }, { value: 'custom', label: 'Custom formula' }, { value: 'checkbox', label: 'Checkbox' }] },
        { name: 'items', label: 'Items (comma separated)', type: 'text', value: ex && ex.items ? ex.items.join(', ') : '', placeholder: 'Yes, No, Maybe', show: (v) => v.type === 'list' },
        { name: 'range', label: 'Range', type: 'text', value: ex && ex.range ? ex.range : '', placeholder: 'Sheet1!A1:A10', show: (v) => v.type === 'listRange' },
        { name: 'op', label: 'Condition', type: 'select', value: (ex && ex.op) || 'between', options: [['between', 'between'], ['notBetween', 'not between'], ['eq', 'equal to'], ['ne', 'not equal to'], ['gt', 'greater than'], ['ge', 'greater than or equal to'], ['lt', 'less than'], ['le', 'less than or equal to']].map(([value, label]) => ({ value, label })), show: (v) => ['number', 'whole', 'date', 'textLen'].includes(v.type) },
        { name: 'v1', label: 'Value', type: 'text', value: ex && ex.v1 !== undefined ? String(ex.v1) : '', show: (v) => ['number', 'whole', 'date', 'textLen'].includes(v.type) },
        { name: 'v2', label: 'And', type: 'text', value: ex && ex.v2 !== undefined ? String(ex.v2) : '', show: (v) => ['number', 'whole', 'date', 'textLen'].includes(v.type) && ['between', 'notBetween'].includes(v.op) },
        { name: 'f', label: 'Formula (true = allowed)', type: 'text', value: (ex && ex.f) || '=A1>0', show: (v) => v.type === 'custom' },
        { name: 'allowBlank', label: 'Allow blank entries', type: 'checkbox', value: ex ? ex.allowBlank !== false : true },
        { name: 'reject', label: 'Reject invalid input', type: 'checkbox', value: ex ? ex.reject !== false : true },
        { name: 'message', label: 'Message shown for invalid entries (optional)', type: 'text', value: (ex && ex.message) || '' },
      ],
      validate: (v) => (v.type === 'list' && !v.items.trim() ? 'Enter at least one item.' : v.type === 'listRange' && !v.range.trim() ? 'Enter the range holding the items.' : ['number', 'whole', 'date', 'textLen'].includes(v.type) && v.v1 === '' ? 'Enter a value.' : ''),
    });
    if (!r) return;
    const rule = { id: nid('dv'), ranges: sel.ranges.map(normRange), type: r.type, allowBlank: r.allowBlank, reject: r.reject };
    if (r.message.trim()) rule.message = r.message.trim();
    if (r.type === 'list') rule.items = r.items.split(',').map((x) => x.trim()).filter(Boolean);
    if (r.type === 'listRange') rule.range = r.range.trim();
    if (['number', 'whole', 'date', 'textLen'].includes(r.type)) { rule.op = r.op; rule.v1 = r.v1; if (['between', 'notBetween'].includes(r.op)) rule.v2 = r.v2; }
    if (r.type === 'custom') rule.f = r.f;
    mutate((d) => {
      const cur = d.sheet(si);
      const rest = (cur.dv || []).map((x) => ({ ...x, ranges: x.ranges.flatMap((rg) => subtract(rg, sel.ranges)) })).filter((x) => x.ranges.length);
      cur.dv = [...rest, rule];
      void g;
    });
  };
  const insertDropdown = () => validationDialog();
  const sparklineDialog = async () => {
    const r = await dlg.form({
      title: 'Insert sparkline', okText: 'Insert',
      fields: [{ name: 'range', label: 'Data range', type: 'text', value: multiSel ? rangeLabel(normRange(lastRange)) : '', placeholder: 'B2:G2' }, { name: 'type', label: 'Type', type: 'select', value: 'line', options: ['line', 'column', 'bar', 'winloss', 'area'] }, { name: 'color', label: 'Colour', type: 'color', value: '#1a73e8' }],
      validate: (v) => (parseRange(v.range.replace(/^.*!/, '')) ? '' : 'Enter a range such as B2:G2.'),
    });
    if (!r) return;
    mutate((d) => { setCellInput(d, si, act.r, act.c, `=SPARKLINE(${r.range.trim()},{"charttype","${r.type}";"color","${r.color}"})`); });
  };
  const transformText = (fn) => mutate((d) => {
    const cur = d.sheet(si);
    sel.ranges.forEach((g0) => { const g = clampToUsed(normRange(g0), { r: Math.max(ext.r, 0), c: Math.max(ext.c, 0) }); for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const k = keyOf(r, c); const cell = cur.cells[k]; if (cell && typeof cell.v === 'string' && cell.f === undefined) { const nv = fn(cell.v); if (nv !== cell.v) cur.cells[k] = { ...cell, v: nv }; } } });
  });
  const autoSum = (fn = 'SUM') => {
    const g = normRange(lastRange);
    const num = (r, c) => typeof engine.value(si, r, c) === 'number';
    if (g.r1 === g.r2 && g.c1 === g.c2) {
      let r = g.r1 - 1; while (r >= 0 && num(r, g.c1)) r--;
      let text;
      if (r < g.r1 - 1) text = `=${fn}(${colName(g.c1)}${r + 2}:${colName(g.c1)}${g.r1})`;
      else { let c = g.c1 - 1; while (c >= 0 && num(g.r1, c)) c--; if (c < g.c1 - 1) text = `=${fn}(${colName(c + 1)}${g.r1 + 1}:${colName(g.c1 - 1)}${g.r1 + 1})`; else text = `=${fn}()`; }
      mutate((d) => { setCellInput(d, si, g.r1, g.c1, text); });
      if (text.endsWith('()')) startEdit(g.r1, g.c1, text.slice(0, -1), 'edit');
      return;
    }
    // multiple cells: totals go below (or to the right when the selection is one row)
    mutate((d) => {
      if (g.r2 > g.r1 || g.c2 === g.c1) for (let c = g.c1; c <= g.c2; c++) setCellInput(d, si, g.r2 + 1, c, `=${fn}(${colName(c)}${g.r1 + 1}:${colName(c)}${g.r2 + 1})`);
      else for (let r = g.r1; r <= g.r2; r++) setCellInput(d, si, r, g.c2 + 1, `=${fn}(${colName(g.c1)}${r + 1}:${colName(g.c2)}${r + 1})`);
    });
  };
  const insertFunction = async (target) => {
    const name = await dlg.custom(({ close }) => <FunctionPicker close={close} />, { title: 'Insert function', width: 560 });
    if (!name) return;
    if (editingRef.current) { const ed = editingRef.current; setEditing({ ...ed, text: (ed.text.startsWith('=') ? ed.text : '=') + name + '(', caretTo: undefined }); return; }
    void target;
    startEdit(act.r, act.c, `=${name}(`, 'edit');
  };
  const customFormat = async () => {
    const f = await dlg.custom(({ close }) => <FormatPicker initial={actStyle.fmt || 'General'} sample={typeof actValue === 'number' ? actValue : 1234.5678} close={close} />, { title: 'Custom number format', width: 520 });
    if (f) setFmt(f);
  };
  const gotoDialog = async () => {
    const t = await dlg.prompt({ title: 'Go to', label: 'Cell, range or named range', placeholder: 'e.g. B12, A1:C20, Sheet2!D5' });
    if (t) gotoText(t);
  };
  function gotoText(t0) {
    const t = t0.trim().replace(/\$/g, '');
    if (!t) return false;
    const names = book.names || {};
    const nk = Object.keys(names).find((k) => k.toLowerCase() === t.toLowerCase());
    let ref = nk ? names[nk].replace(/^=/, '').replace(/\$/g, '') : t;
    const m = /^(.*)!([^!]+)$/.exec(ref);
    let tsi = si; let body = ref;
    if (m) { const nm = m[1].replace(/^'|'$/g, '').replace(/''/g, "'"); const i = book.sheets.findIndex((s) => s.name.toLowerCase() === nm.toLowerCase()); if (i < 0) return false; tsi = i; body = m[2]; }
    const g = parseRange(body) || (() => { const c = parseCell(body); return c ? { r1: c.r, c1: c.c, r2: c.r, c2: c.c } : null; })();
    if (!g) return false;
    if (tsi !== si) { selMem.current[book.sheets[tsi].id] = { ranges: [normRange(g)], active: { r: g.r1, c: g.c1 }, end: { r: g.r2, c: g.c2 } }; mutate((d) => { d.book.active = d.book.sheets[tsi].id; }, { history: false }); }
    else select(g);
    return true;
  }
  const commitNameBox = async (text) => {
    setNameText(null);
    if (gotoText(text)) { focusGrid(); return; }
    const nm = text.trim();
    if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(nm) && !/^[A-Za-z]{1,3}\d+$/.test(nm)) {
      const ref = sheetRangeRef(book, si, normRange(lastRange));
      mutate((d) => { d.book.names = { ...(d.book.names || {}), [nm]: '=' + ref }; });
      dlg.toast(`Named range "${nm}" created`); focusGrid(); return;
    }
    dlg.toast(`"${text}" is not a valid cell or name.`, { kind: 'error' });
  };

  /* ---------- named ranges, CF ---------- */
  const addName = (name, ref) => {
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) || /^[A-Za-z]{1,3}\d+$/.test(name)) { dlg.toast('Names must start with a letter and cannot look like a cell (A1).', { kind: 'error' }); return false; }
    if (!ref.trim()) { dlg.toast('Enter what the name refers to.', { kind: 'error' }); return false; }
    mutate((d) => { d.book.names = { ...(d.book.names || {}), [name]: ref.startsWith('=') ? ref : '=' + ref }; });
    return true;
  };
  const deleteName = (n) => mutate((d) => { const names = { ...d.book.names }; delete names[n]; d.book.names = names; });
  const addCFRule = async (idx) => {
    const existing = idx !== undefined ? sh.cf[idx] : null;
    const rule = await dlg.custom(({ close }) => <CFRuleForm initial={existing} defaultRanges={sel.ranges.map(normRange)} close={close} />, { title: existing ? 'Edit rule' : 'New conditional format rule', width: 520 });
    if (!rule) return;
    mutate((d) => { const cur = d.sheet(si); const r = { ...rule, id: existing ? existing.id : nid('cf') }; cur.cf = existing ? cur.cf.map((x, i) => (i === idx ? r : x)) : [...(cur.cf || []), r]; });
    setPanel('cf');
  };
  const quickCF = (rule) => { mutate((d) => { const cur = d.sheet(si); cur.cf = [...(cur.cf || []), { id: nid('cf'), ranges: sel.ranges.map(normRange), ...rule }]; }); };

  /* ---------- sheet tabs ---------- */
  const newSheetTab = () => { mutate((d) => { addSheet(d); }); };
  const renameTab = async (i) => {
    const cur = book.sheets[i].name;
    const n = await dlg.prompt({ title: 'Rename sheet', label: 'Sheet name', value: cur, validate: (v) => (!v.trim() ? 'Enter a name.' : /[\[\]:*?/\\]/.test(v) ? 'Names cannot contain : \\ / ? * [ ]' : v.length > 31 ? 'Use 31 characters or fewer.' : book.sheets.some((s, j) => j !== i && s.name.toLowerCase() === v.trim().toLowerCase()) ? 'Another sheet already has that name.' : '') });
    if (n && n.trim() !== cur) mutate((d) => { renameSheet(d, i, n.trim()); });
  };
  const deleteTab = async (i) => {
    if (book.sheets.length < 2) { dlg.toast('A workbook needs at least one sheet.'); return; }
    if (!(await dlg.confirm({ title: 'Delete sheet', message: `Delete "${book.sheets[i].name}"? Formulas pointing at it will show #REF!.`, okText: 'Delete', danger: true }))) return;
    mutate((d) => { deleteSheet(d, i); });
  };
  const tabColor = async (i) => {
    const r = await dlg.form({ title: 'Tab colour', fields: [{ name: 'c', label: 'Colour', type: 'color', value: book.sheets[i].tab || '#4a86e8' }], okText: 'Apply', cancelText: 'Cancel' });
    if (r) mutate((d) => { d.patch(i, { tab: r.c }); });
  };
  const tabMenu = (e, i) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, items: [
      { label: 'Rename', onClick: () => renameTab(i) }, { label: 'Duplicate', onClick: () => mutate((d) => { duplicateSheet(d, i); }) },
      { label: 'Delete', danger: true, onClick: () => deleteTab(i) }, { sep: true },
      { label: 'Tab colour...', onClick: () => tabColor(i) }, { label: 'Clear tab colour', disabled: !book.sheets[i].tab, onClick: () => mutate((d) => { d.patch(i, { tab: null }); }) }, { sep: true },
      { label: 'Move left', disabled: i === 0, onClick: () => mutate((d) => { moveSheet(d, i, i - 1); }) }, { label: 'Move right', disabled: i === book.sheets.length - 1, onClick: () => mutate((d) => { moveSheet(d, i, i + 1); }) },
    ] });
  };

  /* ---------- replace ---------- */
  const doReplace = (matches, q, rep, o) => {
    let re; try { re = new RegExp(o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (o.matchCase ? '' : 'i')); } catch { return; }
    if (o.whole) re = new RegExp(`^(?:${o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})$`, o.matchCase ? '' : 'i');
    let n = 0;
    mutate((d) => {
      matches.forEach((m) => {
        const cur = d.sheet(m.si); const k = keyOf(m.r, m.c); const cell = cur.cells[k]; if (!cell) return;
        if (cell.f !== undefined) { if (!o.inFormulas) return; const nf = cell.f.replace(re, rep); if (nf !== cell.f) { cur.cells[k] = { ...cell, f: nf }; n++; } return; }
        const raw = typeof cell.v === 'boolean' ? (cell.v ? 'TRUE' : 'FALSE') : String(cell.v);
        const nt = raw.replace(re, rep);
        if (nt !== raw) { setCellInput(d, m.si, m.r, m.c, nt); n++; }
      });
    });
    dlg.toast(n ? `Replaced in ${n} cell${n === 1 ? '' : 's'}` : 'Nothing was replaced');
  };

  /* ---------- pivot ---------- */
  const pivotDialog = async () => {
    const g = sortRegion();
    if (g.r2 <= g.r1) { dlg.toast('Select a table with a header row first.'); return; }
    const fields = []; for (let c = g.c1; c <= g.c2; c++) { const v = engine.value(si, g.r1, c); fields.push(v === null || v === '' ? `Column ${colName(c)}` : String(v)); }
    const cfg = await dlg.custom(({ close }) => <PivotDialog fields={fields} rangeText={rangeText(g)} close={close} />, { title: 'Create pivot table', width: 440 });
    if (!cfg) return;
    const q = quoteSheet(sh.name);
    const rng = (f) => `${q}!$${colName(g.c1 + f)}$${g.r1 + 2}:$${colName(g.c1 + f)}$${g.r2 + 1}`;
    const uniq = (f) => { const seen = new Map(); for (let r = g.r1 + 1; r <= g.r2; r++) { const v = engine.value(si, r, g.c1 + f); if (v === null || v === '' || v instanceof SErr) continue; const key = typeof v + String(v).toLowerCase(); if (!seen.has(key)) seen.set(key, v); } return [...seen.values()].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)))); };
    const rowKeys = uniq(cfg.rowF); const colKeys = cfg.colF >= 0 ? uniq(cfg.colF) : [];
    const ifs = { SUM: 'SUMIFS', COUNT: 'COUNTIFS', AVERAGE: 'AVERAGEIFS', MAX: 'MAXIFS', MIN: 'MINIFS' }[cfg.agg];
    const f = (extra) => (cfg.agg === 'COUNT' ? `=COUNTIFS(${extra})` : `=${ifs}(${rng(cfg.valF)},${extra})`);
    mutate((d) => {
      const ns = addSheet(d, `Pivot ${fields[cfg.valF]}`.slice(0, 28));
      const idx = d.book.sheets.length - 1;
      const cur = d.sheet(idx);
      const hdr = d.style({ b: true, bg: '#e8eef7' }); const tot = d.style({ b: true, bt: undefined });
      cur.cells[keyOf(0, 0)] = { v: `${cfg.agg} of ${fields[cfg.valF]}`, s: hdr };
      if (cfg.colF < 0) {
        cur.cells[keyOf(0, 0)] = { v: fields[cfg.rowF], s: hdr };
        cur.cells[keyOf(0, 1)] = { v: `${cfg.agg} of ${fields[cfg.valF]}`, s: hdr };
        rowKeys.forEach((k, i) => { cur.cells[keyOf(i + 1, 0)] = { v: k }; cur.cells[keyOf(i + 1, 1)] = { f: f(`${rng(cfg.rowF)},$A${i + 2}`) }; });
        if (cfg.agg === 'SUM' || cfg.agg === 'COUNT') { const last = rowKeys.length + 1; cur.cells[keyOf(last, 0)] = { v: 'Total', s: tot }; cur.cells[keyOf(last, 1)] = { f: `=SUM(B2:B${last})`, s: tot }; }
      } else {
        cur.cells[keyOf(0, 0)] = { v: `${fields[cfg.rowF]} \\ ${fields[cfg.colF]}`, s: hdr };
        colKeys.forEach((k, j) => { cur.cells[keyOf(0, j + 1)] = { v: k, s: hdr }; });
        rowKeys.forEach((k, i) => {
          cur.cells[keyOf(i + 1, 0)] = { v: k };
          colKeys.forEach((_, j) => { cur.cells[keyOf(i + 1, j + 1)] = { f: f(`${rng(cfg.rowF)},$A${i + 2},${rng(cfg.colF)},${colName(j + 1)}$1`) }; });
        });
        if (cfg.agg === 'SUM' || cfg.agg === 'COUNT') {
          const lr = rowKeys.length + 1; const lc = colKeys.length + 1;
          cur.cells[keyOf(0, lc)] = { v: 'Total', s: hdr }; cur.cells[keyOf(lr, 0)] = { v: 'Total', s: tot };
          for (let i = 1; i <= rowKeys.length; i++) cur.cells[keyOf(i, lc)] = { f: `=SUM(B${i + 1}:${colName(lc - 1)}${i + 1})`, s: tot };
          for (let j = 1; j <= colKeys.length; j++) cur.cells[keyOf(lr, j)] = { f: `=SUM(${colName(j)}2:${colName(j)}${lr})`, s: tot };
          cur.cells[keyOf(lr, lc)] = { f: `=SUM(${colName(lc)}2:${colName(lc)}${lr})`, s: tot };
        }
      }
      cur.colW = { 0: 160 };
      void ns;
    });
    dlg.toast('Pivot table created on a new sheet');
  };

  /* ---------- import / export ---------- */
  const importFile = async (file) => {
    if (!file) return;
    const ext1 = (file.name.split('.').pop() || '').toLowerCase();
    const title = file.name.replace(/\.[^.]+$/, '');
    try {
      if (['xlsx', 'xlsm', 'xltx'].includes(ext1)) {
        const { importXlsx } = await import('../lib/office/xlsxImport.js');
        const { book: nb, warnings } = await importXlsx(await file.arrayBuffer());
        L.current.create(nb, title);
        const notes = [];
        if (warnings.unsupported) notes.push(`${warnings.unsupported} formula${warnings.unsupported === 1 ? '' : 's'} use functions that are not supported here and were kept as their last calculated values`);
        if (warnings.charts) notes.push(`${warnings.charts} chart${warnings.charts === 1 ? '' : 's'} could not be imported`);
        dlg.toast(notes.length ? 'Imported. ' + notes.join('; ') + '.' : 'Imported ' + file.name, { ms: notes.length ? 6000 : 2600 });
      } else if (ext1 === 'json') {
        const rows = rowsFromJson(JSON.parse(await readAsText(file)));
        if (!rows) throw new Error('shape');
        L.current.create(bookFromRows(rows, 'Sheet1'), title);
      } else if (['csv', 'tsv', 'txt', 'tab'].includes(ext1)) {
        L.current.create(bookFromRows(parseCSV(await readAsText(file), ext1 === 'tsv' ? '\t' : undefined)), title);
      } else dlg.alert('Open an Excel (.xlsx), CSV, TSV or JSON file.', 'Unsupported file');
    } catch (err) {
      dlg.alert(`That file could not be opened (${err && err.message ? err.message : 'unknown error'}).`, 'Could not import');
    }
  };
  const doImport = async () => { const f = await pickFile('.xlsx,.xlsm,.csv,.tsv,.txt,.json'); if (f) importFile(f); };
  const fname = safeName(current.title || 'Spreadsheet');
  const doExport = async (kind) => {
    try {
      if (kind === 'xlsx') {
        const { exportXlsx } = await import('../lib/office/xlsxExport.js');
        saveBlob(await exportXlsx(book, { title: current.title }), fname + '.xlsx');
      } else if (kind === 'csv' || kind === 'tsv') {
        downloadFile(fname + (kind === 'csv' ? '.csv' : '.tsv'), '﻿' + toCSV(sheetRows(book, engine, si, true), kind === 'csv' ? ',' : '\t'), kind === 'csv' ? 'text/csv' : 'text/tab-separated-values');
      } else if (kind === 'json') {
        const rows = sheetRows(book, engine, si, false);
        const [head, ...body] = rows;
        const data = head ? body.map((r) => Object.fromEntries(head.map((h, i) => [String(h || `column${i + 1}`), r[i] === '' ? null : r[i]]))) : [];
        downloadFile(fname + '.json', JSON.stringify(data, null, 2), 'application/json');
      } else if (kind === 'html') {
        downloadFile(fname + '.html', `<!doctype html><html><head><meta charset="utf-8"><title>${(current.title || 'Spreadsheet').replace(/</g, '&lt;')}</title></head><body>${sheetToHtmlTable(book, engine, si, { grid: sh.grid !== false, filtered })}</body></html>`, 'text/html');
      }
    } catch (err) { dlg.alert(`Export failed: ${err && err.message ? err.message : err}`, 'Export'); }
  };
  const doPrint = async () => {
    const o = await dlg.form({ title: 'Print', okText: 'Print', fields: [{ name: 'orient', label: 'Orientation', type: 'select', value: 'portrait', options: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] }, { name: 'grid', label: 'Print gridlines', type: 'checkbox', value: sh.grid !== false }, { name: 'scale', label: 'Scale (%)', type: 'number', value: 100, min: 25, max: 200 }, { name: 'title', label: 'Print the file title above the sheet', type: 'checkbox', value: true }] });
    if (!o) return;
    setPrinting(o);
    const done = () => { setPrinting(null); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch { /* ignore */ } setTimeout(done, 1500); }, 150);
  };

  /* ---------- paint format ---------- */
  const [painter, setPainter] = useState(null);
  useEffect(() => {
    if (!painter || painter.sel === sel) return;
    const keys = ['b', 'i', 'u', 'st', 'fs', 'ff', 'fc', 'bg', 'ha', 'va', 'wrap', 'fmt', 'ind', 'rot'];
    const patch = {}; keys.forEach((k) => { patch[k] = painter.style[k]; });
    patch.bd = { t: null, r: null, b: null, l: null, ...(painter.style.bd || {}) };
    mutate((d) => applyStyleToRanges(d, si, sel.ranges, patch));
    setPainter(null);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- grow the sheet when the cursor runs past the end ---------- */
  const grow = useCallback((rows, cols) => { mutate((d) => { const cur = d.sheet(si); if (rows <= cur.rows && cols <= cur.cols) return false; d.patch(si, { rows: Math.min(MAX_ROWS, Math.max(cur.rows, rows)), cols: Math.min(MAX_COLS, Math.max(cur.cols, cols)) }); return undefined; }, { history: false }); }, [mutate, si]);
  useEffect(() => { if (sel.end.r >= sh.rows - 2 || sel.end.c >= sh.cols - 1) grow(sel.end.r + 100, sel.end.c + 6); }, [sel.end.r, sel.end.c]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (gridRef.current) gridRef.current.focus(); }, [current.id]);

  const openFind = (replace) => {
    const q = !multiSel && actText && typeof actValue === 'string' && actText.length < 60 ? actText : '';
    setFindInit({ key: Date.now(), replace, q: panel === 'find' ? undefined : q });
    setPanel('find');
  };

  /* ---------- command router (keyboard shortcuts from the grid) ---------- */
  const cmd = (name, arg) => {
    switch (name) {
      case 'clear': return clearSel('contents');
      case 'undo': return L.current.undo();
      case 'redo': return L.current.redo();
      case 'bold': return toggle('b'); case 'italic': return toggle('i'); case 'underline': return toggle('u'); case 'strike': return toggle('st');
      case 'fillDown': return fillDirection('down'); case 'fillRight': return fillDirection('right');
      case 'find': return openFind(false); case 'replace': return openFind(true);
      case 'goto': return gotoDialog();
      case 'print': return doPrint();
      case 'saveVersion': L.current.snapshot(''); return dlg.toast('Version saved');
      case 'link': return insertLink();
      case 'clearFormat': return clearSel('formats');
      case 'insertDate': return insertDateTime(false); case 'insertTime': return insertDateTime(true);
      case 'toggleFormulas': return setShowFormulas((v) => !v);
      case 'filter': return toggleFilter();
      case 'hideRows': return hideAxis('r', true); case 'hideCols': return hideAxis('c', true);
      case 'insertCells': return isWholeRows(lastRange) ? insertAxis('r') : isWholeCols(lastRange) ? insertAxis('c') : insertCells('down');
      case 'deleteCells': return isWholeRows(lastRange) ? deleteAxis('r') : isWholeCols(lastRange) ? deleteAxis('c') : deleteCells('up');
      case 'percent': return setFmt('0%'); case 'currency': return setFmt('$#,##0.00'); case 'number': return setFmt('#,##0.00');
      case 'time': return setFmt('h:mm AM/PM'); case 'date': return setFmt('m/d/yyyy');
      case 'autosum': return autoSum();
      case 'insertFunction': return insertFunction();
      case 'addNote': return editNote();
      case 'escape': setMarquee(null); setSelChart(null); if (painter) setPainter(null); return undefined;
      case 'autofit': return autofit(arg.axis, arg.idxs);
      case 'fillAuto': return fillAuto(arg);
      case 'setValue': return mutate((d) => { setCellInput(d, si, arg.r, arg.c, arg.text); });
      case 'editChart': setSelChart(arg); return setPanel('chart');
      case 'saveFile': return undefined;
      default: return undefined;
    }
  };

  /* ---------- context menus ---------- */
  const pasteSpecialItems = [
    { label: 'Values only', onClick: () => menuClipboard('paste', 'values') }, { label: 'Formulas only', onClick: () => menuClipboard('paste', 'formulas') },
    { label: 'Formatting only', onClick: () => menuClipboard('paste', 'formats') }, { label: 'Transposed', onClick: () => menuClipboard('paste', 'transpose') },
  ];
  const onContextMenu = (e, target) => {
    const g = normRange(lastRange);
    const nRowsSel = g.r2 - g.r1 + 1; const nColsSel = g.c2 - g.c1 + 1;
    let items;
    if (target.type === 'chart') {
      items = [{ label: 'Edit chart', onClick: () => cmd('editChart', target.id) }, { label: 'Delete chart', danger: true, onClick: () => deleteChart(target.id) }];
    } else if (target.type === 'row') {
      items = [{ label: 'Cut', shortcut: 'Ctrl+X', onClick: () => menuClipboard('cut') }, { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => menuClipboard('copy') }, { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => menuClipboard('paste') }, { sep: true },
        { label: `Insert ${nRowsSel} row${nRowsSel > 1 ? 's' : ''} above`, onClick: () => insertAxis('r', false) }, { label: `Insert ${nRowsSel} row${nRowsSel > 1 ? 's' : ''} below`, onClick: () => insertAxis('r', true) },
        { label: `Delete row${nRowsSel > 1 ? 's' : ''}`, onClick: () => deleteAxis('r') }, { label: 'Clear contents', onClick: () => clearSel('contents') }, { sep: true },
        { label: 'Hide rows', onClick: () => hideAxis('r', true) }, { label: 'Unhide rows', onClick: () => hideAxis('r', false) }, { label: 'Row height...', onClick: () => sizeDialog('row') }, { label: 'Fit to data', onClick: () => autofit('row', selectedAxisIdxs('row')) }];
    } else if (target.type === 'col') {
      items = [{ label: 'Cut', shortcut: 'Ctrl+X', onClick: () => menuClipboard('cut') }, { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => menuClipboard('copy') }, { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => menuClipboard('paste') }, { sep: true },
        { label: `Insert ${nColsSel} column${nColsSel > 1 ? 's' : ''} left`, onClick: () => insertAxis('c', false) }, { label: `Insert ${nColsSel} column${nColsSel > 1 ? 's' : ''} right`, onClick: () => insertAxis('c', true) },
        { label: `Delete column${nColsSel > 1 ? 's' : ''}`, onClick: () => deleteAxis('c') }, { label: 'Clear contents', onClick: () => clearSel('contents') }, { sep: true },
        { label: 'Hide columns', onClick: () => hideAxis('c', true) }, { label: 'Unhide columns', onClick: () => hideAxis('c', false) }, { label: 'Column width...', onClick: () => sizeDialog('col') }, { label: 'Fit to data', onClick: () => autofit('col', selectedAxisIdxs('col')) },
        { sep: true }, { label: 'Sort sheet A to Z', onClick: () => quickSort(false, g.c1) }, { label: 'Sort sheet Z to A', onClick: () => quickSort(true, g.c1) }];
    } else {
      const hasNote = !!(sh.notes || {})[actKey];
      items = [{ label: 'Cut', shortcut: 'Ctrl+X', onClick: () => menuClipboard('cut') }, { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => menuClipboard('copy') }, { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => menuClipboard('paste') }, { label: 'Paste special', children: pasteSpecialItems }, { sep: true },
        { label: 'Insert row above', onClick: () => insertAxis('r', false) }, { label: 'Insert row below', onClick: () => insertAxis('r', true) }, { label: 'Insert column left', onClick: () => insertAxis('c', false) }, { label: 'Insert column right', onClick: () => insertAxis('c', true) },
        { label: 'Delete row', onClick: () => deleteAxis('r') }, { label: 'Delete column', onClick: () => deleteAxis('c') }, { label: 'Clear contents', shortcut: 'Del', onClick: () => clearSel('contents') }, { sep: true },
        { label: 'Insert link', shortcut: 'Ctrl+K', onClick: insertLink }, { label: hasNote ? 'Edit note' : 'Insert note', onClick: editNote }, { label: 'Data validation...', onClick: validationDialog },
        { label: 'Conditional formatting...', onClick: () => { setPanel('cf'); } }, { sep: true },
        { label: 'Sort range A to Z', onClick: () => quickSort(false) }, { label: 'Sort range Z to A', onClick: () => quickSort(true) }, { label: sh.filter ? 'Remove filter' : 'Create a filter', onClick: toggleFilter }];
    }
    setCtx({ x: e.clientX, y: e.clientY, items });
  };

  /* ---------- menus ---------- */
  const nameLabel = (g) => {
    if (isWholeCols(g) && isWholeRows(g)) return 'A1:' + colName(Math.max(ext.c, 0)) + (Math.max(ext.r, 0) + 1);
    if (isWholeCols(g)) return `${colName(g.c1)}:${colName(g.c2)}`;
    if (isWholeRows(g)) return `${g.r1 + 1}:${g.r2 + 1}`;
    return rangeLabel(g);
  };
  const fmtItems = FORMAT_PRESETS.map((p) => (p.sep ? { sep: true } : { label: p.label, shortcut: '', checked: (actStyle.fmt || 'General') === p.fmt, onClick: () => setFmt(p.fmt) }));
  const freezeItems = [
    { label: 'No freeze', onClick: () => setFreeze(0, 0) }, { sep: true },
    { label: '1 row', onClick: () => setFreeze(1, sh.freeze.c) }, { label: '2 rows', onClick: () => setFreeze(2, sh.freeze.c) }, { label: `Up to row ${act.r + 1}`, onClick: () => setFreeze(act.r + 1, sh.freeze.c) },
    { sep: true }, { label: '1 column', onClick: () => setFreeze(sh.freeze.r, 1) }, { label: '2 columns', onClick: () => setFreeze(sh.freeze.r, 2) }, { label: `Up to column ${colName(act.c)}`, onClick: () => setFreeze(sh.freeze.r, act.c + 1) },
    { sep: true }, { label: `Up to ${colName(act.c)}${act.r + 1}`, onClick: () => setFreeze(act.r + 1, act.c + 1) },
  ];
  const fileItems = [
    { label: 'Import file (xlsx, csv, tsv, json)...', icon: 'upload', onClick: doImport },
    { label: 'Download as', icon: 'download', children: [
      { label: 'Excel workbook (.xlsx)', onClick: () => doExport('xlsx') }, { label: 'CSV (this sheet)', onClick: () => doExport('csv') }, { label: 'TSV (this sheet)', onClick: () => doExport('tsv') },
      { label: 'JSON (this sheet)', onClick: () => doExport('json') }, { label: 'Web page (.html)', onClick: () => doExport('html') },
    ] },
    { label: 'Print...', shortcut: 'Ctrl+P', icon: 'printer', onClick: doPrint },
  ];
  const menus = [
    { label: 'Edit', items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', icon: 'undo', disabled: !lib.canUndo, onClick: () => lib.undo() }, { label: 'Redo', shortcut: 'Ctrl+Y', icon: 'redo', disabled: !lib.canRedo, onClick: () => lib.redo() }, { sep: true },
      { label: 'Cut', shortcut: 'Ctrl+X', icon: 'scissors', onClick: () => menuClipboard('cut') }, { label: 'Copy', shortcut: 'Ctrl+C', icon: 'copy', onClick: () => menuClipboard('copy') }, { label: 'Paste', shortcut: 'Ctrl+V', icon: 'paste', onClick: () => menuClipboard('paste') },
      { label: 'Paste special', children: pasteSpecialItems }, { sep: true },
      { label: 'Fill', children: [{ label: 'Down', shortcut: 'Ctrl+D', onClick: () => fillDirection('down') }, { label: 'Right', shortcut: 'Ctrl+R', onClick: () => fillDirection('right') }, { label: 'Series...', onClick: fillSeriesDialog }] },
      { label: 'Delete', children: [{ label: 'Values', onClick: () => clearSel('contents') }, { label: 'Formatting', onClick: () => clearSel('formats') }, { label: 'Everything', onClick: () => clearSel('all') }, { label: 'Notes', onClick: () => clearSel('notes') }, { label: 'Data validation', onClick: () => clearSel('validation') }] },
      { label: 'Delete row(s)', onClick: () => deleteAxis('r') }, { label: 'Delete column(s)', onClick: () => deleteAxis('c') }, { sep: true },
      { label: 'Find...', shortcut: 'Ctrl+F', icon: 'search', onClick: () => openFind(false) }, { label: 'Find and replace...', shortcut: 'Ctrl+H', onClick: () => openFind(true) }, { label: 'Go to...', shortcut: 'Ctrl+G', onClick: gotoDialog },
      { label: 'Select all', shortcut: 'Ctrl+A', onClick: () => setSel({ ranges: [{ r1: 0, c1: 0, r2: Math.max(ext.r, 0), c2: Math.max(ext.c, 0) }], active: { r: 0, c: 0 }, end: { r: Math.max(ext.r, 0), c: Math.max(ext.c, 0) } }) },
    ] },
    { label: 'View', items: [
      { label: 'Freeze', icon: 'freeze', children: freezeItems }, { sep: true },
      { label: 'Gridlines', checked: sh.grid !== false, onClick: () => mutate((d) => { d.patch(si, { grid: sh.grid === false }); }) },
      { label: 'Show formulas', shortcut: 'Ctrl+`', checked: showFormulas, onClick: () => setShowFormulas((v) => !v) },
      { label: 'Formula bar', checked: showBar, onClick: () => setShowBar((v) => !v) }, { sep: true },
      { label: 'Zoom', children: [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2].map((z) => ({ label: `${Math.round(z * 100)}%`, checked: Math.abs(zoom - z) < 0.01, onClick: () => setZoom(z) })) }, { sep: true },
      { label: 'Hide row(s)', onClick: () => hideAxis('r', true) }, { label: 'Unhide row(s)', onClick: () => hideAxis('r', false) }, { label: 'Hide column(s)', onClick: () => hideAxis('c', true) }, { label: 'Unhide column(s)', onClick: () => hideAxis('c', false) }, { sep: true },
      { label: 'Named ranges', onClick: () => setPanel(panel === 'names' ? null : 'names') }, { label: 'Conditional formatting rules', onClick: () => setPanel(panel === 'cf' ? null : 'cf') },
    ] },
    { label: 'Insert', items: [
      { label: 'Row above', onClick: () => insertAxis('r', false) }, { label: 'Row below', onClick: () => insertAxis('r', true) }, { label: 'Column left', onClick: () => insertAxis('c', false) }, { label: 'Column right', onClick: () => insertAxis('c', true) },
      { label: 'Cells, shift down', onClick: () => insertCells('down') }, { label: 'Cells, shift right', onClick: () => insertCells('right') }, { sep: true },
      { label: 'New sheet', onClick: newSheetTab }, { label: 'Chart', icon: 'chartBar', onClick: insertChart }, { label: 'Function...', icon: 'fx', shortcut: 'Shift+F3', onClick: () => insertFunction() }, { label: 'Sparkline...', icon: 'spark', onClick: sparklineDialog }, { sep: true },
      { label: 'Link', icon: 'link', shortcut: 'Ctrl+K', onClick: insertLink }, { label: 'Note', icon: 'note', shortcut: 'Shift+F2', onClick: editNote }, { label: 'Checkbox', icon: 'checkbox', onClick: insertCheckbox }, { label: 'Dropdown / validation...', icon: 'dropdown', onClick: insertDropdown }, { sep: true },
      { label: 'Today\'s date', shortcut: 'Ctrl+;', onClick: () => insertDateTime(false) }, { label: 'Current time', shortcut: 'Ctrl+Shift+;', onClick: () => insertDateTime(true) },
    ] },
    { label: 'Format', items: [
      { label: 'Number', children: [...fmtItems, { sep: true }, { label: 'Custom number format...', onClick: customFormat }] },
      { label: 'Text', children: [{ label: 'Bold', shortcut: 'Ctrl+B', checked: !!actStyle.b, onClick: () => toggle('b') }, { label: 'Italic', shortcut: 'Ctrl+I', checked: !!actStyle.i, onClick: () => toggle('i') }, { label: 'Underline', shortcut: 'Ctrl+U', checked: !!actStyle.u, onClick: () => toggle('u') }, { label: 'Strikethrough', shortcut: 'Ctrl+5', checked: !!actStyle.st, onClick: () => toggle('st') }] },
      { label: 'Alignment', children: [{ label: 'Left', checked: actStyle.ha === 'left', onClick: () => applyStyle({ ha: 'left' }) }, { label: 'Center', checked: actStyle.ha === 'center', onClick: () => applyStyle({ ha: 'center' }) }, { label: 'Right', checked: actStyle.ha === 'right', onClick: () => applyStyle({ ha: 'right' }) }, { label: 'Automatic', onClick: () => applyStyle({ ha: undefined }) }, { sep: true }, { label: 'Top', checked: actStyle.va === 'top', onClick: () => applyStyle({ va: 'top' }) }, { label: 'Middle', checked: actStyle.va === 'middle', onClick: () => applyStyle({ va: 'middle' }) }, { label: 'Bottom', checked: !actStyle.va || actStyle.va === 'bottom', onClick: () => applyStyle({ va: 'bottom' }) }, { sep: true }, { label: 'Increase indent', onClick: () => applyStyle({ ind: Math.min(15, (actStyle.ind || 0) + 1) }) }, { label: 'Decrease indent', onClick: () => applyStyle({ ind: Math.max(0, (actStyle.ind || 0) - 1) }) }] },
      { label: 'Rotation', children: [[0, 'None'], [45, 'Tilt up'], [-45, 'Tilt down'], [90, 'Rotate up'], [-90, 'Rotate down']].map(([v, l]) => ({ label: l, checked: (actStyle.rot || 0) === v, onClick: () => applyStyle({ rot: v }) })) },
      { label: 'Wrapping', children: [{ label: 'Overflow', checked: !actStyle.wrap, onClick: () => applyStyle({ wrap: undefined }) }, { label: 'Wrap', checked: actStyle.wrap === 'wrap', onClick: () => applyStyle({ wrap: 'wrap' }) }, { label: 'Clip', checked: actStyle.wrap === 'clip', onClick: () => applyStyle({ wrap: 'clip' }) }] },
      { label: 'Merge cells', icon: 'merge', children: [{ label: 'Merge all', onClick: () => doMerge('all') }, { label: 'Merge horizontally', onClick: () => doMerge('h') }, { label: 'Merge vertically', onClick: () => doMerge('v') }, { label: 'Unmerge', onClick: () => doMerge('none') }] }, { sep: true },
      { label: 'Conditional formatting...', onClick: () => setPanel('cf') },
      { label: 'Alternating colors', onClick: () => quickCF({ type: 'formula', f: '=MOD(ROW(),2)=0', style: { bg: '#f1f3f4' } }) }, { sep: true },
      { label: 'Row height...', onClick: () => sizeDialog('row') }, { label: 'Column width...', onClick: () => sizeDialog('col') },
      { label: 'Fit columns to data', onClick: () => autofit('col', selectedAxisIdxs('col')) }, { label: 'Fit rows to data', onClick: () => autofit('row', selectedAxisIdxs('row')) }, { sep: true },
      { label: 'Clear formatting', shortcut: 'Ctrl+\\', icon: 'eraser', onClick: () => clearSel('formats') },
    ] },
    { label: 'Data', items: [
      { label: 'Sort range A to Z', icon: 'sortAsc', onClick: () => quickSort(false) }, { label: 'Sort range Z to A', icon: 'sortDesc', onClick: () => quickSort(true) }, { label: 'Sort range...', onClick: sortDialog }, { sep: true },
      { label: sh.filter ? 'Remove filter' : 'Create a filter', icon: 'filter', shortcut: 'Ctrl+Shift+L', onClick: toggleFilter }, { label: 'Clear all filter conditions', disabled: !sh.filter, onClick: clearFilters }, { sep: true },
      { label: 'Data validation...', onClick: validationDialog },
      { label: 'Remove duplicates...', onClick: async () => {
        const g = sortRegion(); const hg = guessHeader(engine, si, g);
        const r = await dlg.custom(({ close }) => <DedupeDialog g={g} headerGuess={hg} labelOf={(c) => { const v = engine.value(si, g.r1, c); return v === null ? '' : String(v); }} close={close} />, { title: 'Remove duplicates', width: 440 });
        if (r) { let removed = 0; mutate((d, b, ev) => { const e = ev(); removed = removeDuplicates(d, si, g, r.cols, r.hasHeader, (rr, c) => e.value(si, rr, c)); }); dlg.toast(`${removed} duplicate row${removed === 1 ? '' : 's'} removed`); }
      } },
      { label: 'Split text to columns...', onClick: async () => {
        const g = normRange(lastRange);
        const r = await dlg.form({ title: 'Split text to columns', fields: [{ name: 'd', label: 'Separator', type: 'select', value: ',', options: [{ value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: '\t', label: 'Tab' }, { value: ' ', label: 'Space' }, { value: '|', label: 'Pipe' }, { value: 'custom', label: 'Custom...' }] }, { name: 'custom', label: 'Custom separator', type: 'text', value: '', show: (v) => v.d === 'custom' }], validate: (v) => (v.d === 'custom' && !v.custom ? 'Enter a separator.' : '') });
        if (r) mutate((d, b, ev) => { const e = ev(); textToColumns(d, si, clampToUsed(g, ext), r.d === 'custom' ? r.custom : r.d, (rr, c) => e.value(si, rr, c)); });
      } }, { sep: true },
      { label: 'Trim whitespace', onClick: () => transformText((s) => s.replace(/\s+/g, ' ').trim()) }, { label: 'UPPER CASE', onClick: () => transformText((s) => s.toUpperCase()) }, { label: 'lower case', onClick: () => transformText((s) => s.toLowerCase()) }, { label: 'Title Case', onClick: () => transformText((s) => s.toLowerCase().replace(/(^|\s|[-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())) }, { sep: true },
      { label: 'Highlight duplicates', onClick: () => quickCF({ type: 'dup', style: { bg: '#f4c7c3', fc: '#9c0006' } }) },
      { label: 'Pivot table...', onClick: pivotDialog }, { label: 'Named ranges...', onClick: () => setPanel('names') },
    ] },
  ];

  /* ---------- toolbar ---------- */
  const sumFns = ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN'];
  const toolbar = (
    <>
      <Btn icon="undo" title="Undo (Ctrl+Z)" disabled={!lib.canUndo} onClick={() => lib.undo()} />
      <Btn icon="redo" title="Redo (Ctrl+Y)" disabled={!lib.canRedo} onClick={() => lib.redo()} />
      <Btn icon="printer" title="Print (Ctrl+P)" onClick={doPrint} />
      <Btn icon="paintFormat" title="Paint format" active={!!painter} onClick={() => setPainter(painter ? null : { style: actStyle, sel })} />
      <Sep />
      <Sel title="Zoom" value={String(Math.round(zoom * 100))} width={72} onChange={(v) => setZoom(Number(v) / 100)} options={[50, 75, 90, 100, 125, 150, 200].map((z) => ({ value: String(z), label: z + '%' }))} />
      <Sep />
      <Btn icon="currency" title="Format as currency" onClick={() => setFmt(actStyle.fmt && /^\$/.test(actStyle.fmt) ? 'General' : '$#,##0.00')} />
      <Btn icon="percent" title="Format as percent" onClick={() => setFmt(actStyle.fmt && /%$/.test(actStyle.fmt) ? 'General' : '0%')} />
      <Btn icon="decimalDown" title="Decrease decimal places" onClick={() => setFmt(adjustDecimals(actStyle.fmt, -1, shownText))} />
      <Btn icon="decimalUp" title="Increase decimal places" onClick={() => setFmt(adjustDecimals(actStyle.fmt, 1, shownText))} />
      <Drop label="123" title="More number formats" className="numfmt">
        {({ close }) => (<div className="fmtdrop"><MenuList close={close} items={[...fmtItems, { sep: true }, { label: 'Custom number format...', onClick: customFormat }]} /></div>)}
      </Drop>
      <Sep />
      <Sel title="Font" value={actStyle.ff || 'Calibri'} width={118} onChange={(v) => applyStyle({ ff: v === 'Calibri' ? undefined : v })} options={FONTS} />
      <Stepper title="Font size" value={actStyle.fs || 11} min={6} max={96} onChange={(v) => applyStyle({ fs: v === 11 ? undefined : v })} />
      <Btn icon="bold" title="Bold (Ctrl+B)" active={!!actStyle.b} onClick={() => toggle('b')} />
      <Btn icon="italic" title="Italic (Ctrl+I)" active={!!actStyle.i} onClick={() => toggle('i')} />
      <Btn icon="underline" title="Underline (Ctrl+U)" active={!!actStyle.u} onClick={() => toggle('u')} />
      <Btn icon="strike" title="Strikethrough (Ctrl+5)" active={!!actStyle.st} onClick={() => toggle('st')} />
      <ColorBtn icon="textColor" title="Text colour" value={actStyle.fc} defaultColor="#000000" onPick={(c) => applyStyle({ fc: c || undefined })} noneLabel="Automatic" />
      <ColorBtn icon="fillColor" title="Fill colour" value={actStyle.bg} defaultColor="#fff2cc" onPick={(c) => applyStyle({ bg: c || undefined })} noneLabel="No fill" />
      <Sep />
      <Drop icon="borders" title="Borders">{({ close }) => <BorderPanel onApply={(k, s, c) => { doBorders(k, s, c); close(); }} />}</Drop>
      <Drop icon="merge" title="Merge cells">
        {({ close }) => <MenuList close={close} items={[{ label: 'Merge all', onClick: () => doMerge('all') }, { label: 'Merge horizontally', onClick: () => doMerge('h') }, { label: 'Merge vertically', onClick: () => doMerge('v') }, { label: 'Unmerge', onClick: () => doMerge('none') }]} />}
      </Drop>
      <Sep />
      <Drop icon={actStyle.ha === 'center' ? 'alignCenter' : actStyle.ha === 'right' ? 'alignRight' : 'alignLeft'} title="Horizontal align">
        {({ close }) => <MenuList close={close} items={[{ label: 'Left', icon: 'alignLeft', checked: actStyle.ha === 'left', onClick: () => applyStyle({ ha: 'left' }) }, { label: 'Center', icon: 'alignCenter', checked: actStyle.ha === 'center', onClick: () => applyStyle({ ha: 'center' }) }, { label: 'Right', icon: 'alignRight', checked: actStyle.ha === 'right', onClick: () => applyStyle({ ha: 'right' }) }, { label: 'Automatic', onClick: () => applyStyle({ ha: undefined }) }]} />}
      </Drop>
      <Drop icon={actStyle.va === 'top' ? 'alignT' : actStyle.va === 'middle' ? 'alignM' : 'alignB'} title="Vertical align">
        {({ close }) => <MenuList close={close} items={[{ label: 'Top', icon: 'alignT', checked: actStyle.va === 'top', onClick: () => applyStyle({ va: 'top' }) }, { label: 'Middle', icon: 'alignM', checked: actStyle.va === 'middle', onClick: () => applyStyle({ va: 'middle' }) }, { label: 'Bottom', icon: 'alignB', checked: !actStyle.va || actStyle.va === 'bottom', onClick: () => applyStyle({ va: 'bottom' }) }]} />}
      </Drop>
      <Btn icon="wrap" title="Wrap text" active={actStyle.wrap === 'wrap'} onClick={() => applyStyle({ wrap: actStyle.wrap === 'wrap' ? undefined : 'wrap' })} />
      <Btn icon="outdent" title="Decrease indent" onClick={() => applyStyle({ ind: Math.max(0, (actStyle.ind || 0) - 1) })} />
      <Btn icon="indent" title="Increase indent" onClick={() => applyStyle({ ind: Math.min(15, (actStyle.ind || 0) + 1) })} />
      <Sep />
      <Btn icon="link" title="Insert link (Ctrl+K)" onClick={insertLink} />
      <Btn icon="note" title="Insert note" onClick={editNote} />
      <Btn icon="chartBar" title="Insert chart" onClick={insertChart} />
      <Btn icon="filter" title="Create or remove a filter" active={!!sh.filter} onClick={toggleFilter} />
      <Drop icon="sigma" title="Functions">
        {({ close }) => <MenuList close={close} items={[...sumFns.map((f) => ({ label: f, onClick: () => autoSum(f) })), { sep: true }, { label: 'More functions...', icon: 'fx', onClick: () => insertFunction() }]} />}
      </Drop>
      <Drop icon="freeze" title="Freeze rows and columns">{({ close }) => <MenuList close={close} items={freezeItems} />}</Drop>
    </>
  );

  /* ---------- panels ---------- */
  let sidePanel = null;
  if (panel === 'find') {
    sidePanel = <FindPanel key={findInit.key} book={book} ev={engine} si={si} sel={sel} initial={findInit} onGo={goTo} onHighlight={setFindKeys} onReplace={doReplace} onClose={() => { setPanel(null); focusGrid(); }} />;
  } else if (panel === 'cf') {
    sidePanel = <CFPanel sh={sh} onAdd={() => addCFRule()} onEdit={(i) => addCFRule(i)} onClose={() => setPanel(null)}
      onDelete={(i) => mutate((d) => { const cur = d.sheet(si); cur.cf = cur.cf.filter((_, j) => j !== i); })}
      onMove={(i, dir) => mutate((d) => { const cur = d.sheet(si); const a = [...cur.cf]; const j = i + dir; if (j < 0 || j >= a.length) return false; [a[i], a[j]] = [a[j], a[i]]; cur.cf = a; return undefined; })}
      onClear={() => mutate((d) => { d.sheet(si).cf = []; })} />;
  } else if (panel === 'chart' && chartObj) {
    sidePanel = <ChartPanel chart={chartObj} onChange={(p, k) => updateChart(chartObj.id, p, k)} onDelete={() => deleteChart(chartObj.id)} onClose={() => setPanel(null)}
      onUseSelection={() => { let g = normRange(lastRange); if (g.r1 === g.r2 && g.c1 === g.c2) g = contiguousRegion(engine, si, g.r1, g.c1); else g = clampToUsed(g, ext); updateChart(chartObj.id, { range: chartRangeText(book, si, g).replace(/^[^!]*!/, '') }); }} />;
  } else if (panel === 'names') {
    sidePanel = <NamesPanel book={book} defaultRef={'=' + sheetRangeRef(book, si, normRange(lastRange))} onAdd={addName} onDelete={deleteName} onGo={(n) => gotoText(n)} onClose={() => setPanel(null)} />;
  }

  /* ---------- formula bar ---------- */
  const barText = editing ? editing.text : actText;
  const onBarKey = (e) => {
    const ed = editingRef.current; if (!ed) return;
    if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); commitEdit(ed.text, e.ctrlKey || e.metaKey ? 'fill' : 'down'); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    else if (e.key === 'Tab') { e.preventDefault(); commitEdit(ed.text, e.shiftKey ? 'left' : 'right'); }
  };
  const onBarBlur = (e) => {
    const ed = editingRef.current; if (!ed || ed.src !== 'bar') return;
    const to = e.relatedTarget;
    if (to && to.closest && (to.closest('.sgrid') || to.closest('.fnpop'))) return;
    commitEdit(ed.text, 'none');
  };
  const nameShown = nameText !== null ? nameText : nameLabel(lastRange);

  const printNode = printing ? (
    <div className="print-root sheetprint" style={{ zoom: (printing.scale || 100) / 100 }}>
      <style>{`@media print{@page{size:A4 ${printing.orient};margin:12mm}}`}</style>
      {printing.title && <h2 className="printtitle">{current.title}</h2>}
      <div dangerouslySetInnerHTML={{ __html: sheetToHtmlTable(book, engine, si, { grid: printing.grid, filtered }) }} />
    </div>
  ) : null;

  return (
    <AppChrome
      name="Techomato Sheets" icon="📊" noun="spreadsheet" lib={lib} menus={menus} fileItems={fileItems} templates={SHEET_TEMPLATES} shortcuts={SHORTCUTS}
      toolbar={toolbar} rightPanel={sidePanel}
    >
      {showBar && (
        <div className="sheetbar no-print">
          <input className="namebox" aria-label="Name box" value={nameShown} spellCheck={false}
            onFocus={(e) => { setNameText(nameLabel(lastRange)); e.target.select(); }}
            onChange={(e) => setNameText(e.target.value)}
            onBlur={() => setNameText(null)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitNameBox(e.target.value); } else if (e.key === 'Escape') { setNameText(null); focusGrid(); } }} />
          <button type="button" className="fxbtn" title="Insert function" aria-label="Insert function" onMouseDown={(e) => e.preventDefault()} onClick={() => insertFunction()}>fx</button>
          <textarea ref={barRef} className="fbar" aria-label="Formula bar" rows={barOpen ? 5 : 1} spellCheck={false} value={barText}
            onFocus={startBarEdit}
            onChange={(e) => { const ed = editingRef.current; if (ed) setEditing({ ...ed, text: e.target.value, point: null }); }}
            onKeyDown={onBarKey} onBlur={onBarBlur} />
          <button type="button" className="icon-btn" title={barOpen ? 'Collapse formula bar' : 'Expand formula bar'} aria-label="Expand formula bar" onClick={() => setBarOpen((o) => !o)}><Icon name={barOpen ? 'chevronUp' : 'chevronDown'} size={14} /></button>
        </div>
      )}
      <div className="gridwrap">
        <Grid
          ref={gridRef} book={book} sh={shV} si={si} engine={engine} cfFn={cfFn} zoom={zoom} showFormulas={showFormulas}
          sel={sel} setSel={setSel} editing={editing} setEditing={setEditing} barRef={barRef} editingRef={editingRef}
          onCommit={commitEdit} onCancelEdit={cancelEdit} onEditStart={startEdit} onCommand={cmd}
          marquee={marquee} findKeys={findKeys}
          selectedChart={selChart} onChartSelect={(id) => setSelChart(id)}
          onChartChange={(id, patch) => updateChart(id, patch, 'drag')}
          onContextMenu={onContextMenu}
          onResizeEnd={(axis, idxs, size) => setSize(axis, idxs, size)}
          onFill={doFill} onFilterBtn={openFilterPop} onGrow={grow} onClipboard={onClipboard}
        />
        {painter && <div className="painterhint no-print">Paint format: click or select the cells to format</div>}
        {filterPop && sh.filter && (
          <FilterPop rect={filterPop.rect} col={filterPop.c} values={filterPop.values} state={(sh.filter.cols || {})[filterPop.c] || {}}
            onApply={(st) => applyFilterCol(filterPop.c, st)} onSort={(desc) => filterSort(filterPop.c, desc)} onClose={() => setFilterPop(null)} />
        )}
      </div>
      <div className="sheettabs no-print">
        <button type="button" className="icon-btn" title="Add sheet" aria-label="Add sheet" onClick={newSheetTab}><Icon name="plus" size={15} /></button>
        <Drop icon="menu" title="All sheets" caret={false} panelClass="sheetlist">
          {({ close }) => <MenuList close={close} items={book.sheets.map((s, i) => ({ label: s.name, checked: i === si, onClick: () => switchSheet(s.id) }))} />}
        </Drop>
        <div className="tabs" role="tablist" aria-label="Sheets">
          {book.sheets.map((s, i) => (
            <div key={s.id} role="tab" aria-selected={i === si} tabIndex={0} draggable
              className={'stab' + (i === si ? ' on' : '') + (dragTab === i ? ' drag' : '')} style={s.tab ? { boxShadow: `inset 0 -3px 0 ${s.tab}` } : undefined}
              onMouseDown={(e) => { if (editingRef.current && editingRef.current.text.startsWith('=')) e.preventDefault(); }}
              onClick={() => switchSheet(s.id)} onDoubleClick={() => renameTab(i)} onContextMenu={(e) => tabMenu(e, i)}
              onKeyDown={(e) => { if (e.key === 'Enter') switchSheet(s.id); if (e.key === 'F2') renameTab(i); }}
              onDragStart={(e) => { setDragTab(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* ignore */ } }}
              onDragOver={(e) => { if (dragTab !== null) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragTab !== null && dragTab !== i) mutate((d) => { moveSheet(d, dragTab, i); }); setDragTab(null); }}
              onDragEnd={() => setDragTab(null)}>
              {s.name}
            </div>
          ))}
        </div>
      </div>
      <div className="statusbar sheetstatus no-print">
        <span>{nameLabel(lastRange)}{sel.ranges.length > 1 ? ` (+${sel.ranges.length - 1})` : ''}</span>
        {(stats.count > 1 || multiSel) && stats.count > 0 && (
          <>
            {stats.nums > 0 && <span>Sum: <b>{fmtStat(stats.sum)}</b></span>}
            {stats.nums > 1 && <span>Average: <b>{fmtStat(stats.avg)}</b></span>}
            <span>Count: <b>{stats.count}</b></span>
            {stats.nums > 1 && <><span>Min: <b>{fmtStat(stats.min)}</b></span><span>Max: <b>{fmtStat(stats.max)}</b></span></>}
          </>
        )}
        {sh.filter && filtered && <span>{Object.keys(filtered).length} row{Object.keys(filtered).length === 1 ? '' : 's'} hidden by filter</span>}
        <span className="spacer" />
        <button type="button" className="link" onClick={() => setZoom(zoom - 0.1)} aria-label="Zoom out">-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="link" onClick={() => setZoom(zoom + 0.1)} aria-label="Zoom in">+</button>
      </div>
      {ctx && <CtxMenu ctx={ctx} close={() => setCtx(null)} />}
      {printNode}
    </AppChrome>
  );
}

const fmtStat = (n) => (Number.isInteger(n) ? n.toLocaleString() : (Math.round(n * 1e6) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 }));

function BorderPanel({ onApply }) {
  const [style, setStyle] = useState('thin');
  const [color, setColor] = useState('#202124');
  const kinds = [['all', 'All borders'], ['outer', 'Outer borders'], ['inner', 'Inner borders'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right'], ['none', 'No borders']];
  return (
    <div className="borderpanel">
      <div className="bp-opts">
        <select aria-label="Border style" value={style} onChange={(e) => setStyle(e.target.value)}>{BORDER_STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input type="color" aria-label="Border colour" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <div className="bp-grid">
        {kinds.map(([k, l]) => <button key={k} type="button" className="mrow" onClick={() => onApply(k, style, color)}><span className={'bpicon bp-' + k} aria-hidden="true" /><span className="mlabel">{l}</span></button>)}
      </div>
    </div>
  );
}
