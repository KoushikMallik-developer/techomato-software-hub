import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AppChrome from '../components/AppChrome.jsx';
import Icon from '../components/Icon.jsx';
import { Btn, Drop, MenuList, Sel, Sep, Stepper, useDismiss } from '../components/ui.jsx';
import { useDialog } from '../components/Dialogs.jsx';
import { useLibrary, uid } from '../lib/useLibrary.js';
import { pickFile, readAsDataURL, readAsText, safeName, downloadFile } from '../lib/download.js';
import { saveBlob, imageSize } from '../lib/office/util.js';
import {
  SW, SH, THEMES, LAYOUTS, FONTS, blankDeck, migrateDeck, newSlide, newText, newShape, newLine, newImage, newTable, newChart, applyLayout, layoutById,
  P, plain, isEmptyParas, aabb, bounds, alignEls, distributeEls, withGroups, cloneEl, rc, fontStack, themeById, placeholderEl,
} from './slides/model.js';
import { SlideView, changeLevel, paragraphsInSelection } from './slides/Render.jsx';
import Stage from './slides/Stage.jsx';
import { ColorPick, FormatPanel, ShapeGallery, ChartEditor } from './slides/Panels.jsx';
import { Presenter, Sorter } from './slides/Present.jsx';
import { SLIDE_TEMPLATES } from './slides/templates.js';
import { SLIDE_CSS } from './slides/slidecss.js';
import '../styles/slides.css';

const SHORTCUTS = [
  { group: 'Slides', items: [['Ctrl + M', 'New slide'], ['Page Up / Page Down', 'Previous / next slide'], ['F5', 'Present from start'], ['Shift + F5', 'Present from this slide'], ['Ctrl + Shift + Up / Down', 'Move slide up / down']] },
  { group: 'Objects', items: [['Arrow keys', 'Nudge (Shift = 10 px)'], ['Ctrl + D', 'Duplicate'], ['Ctrl + C / X / V', 'Copy / cut / paste'], ['Delete', 'Delete'], ['Ctrl + A', 'Select all'], ['Ctrl + G / Shift + G', 'Group / ungroup'], ['Tab', 'Select next object'], ['Enter / F2', 'Edit text'], ['Ctrl + ] / [', 'Bring forward / send backward'], ['Alt + drag', 'Move without snapping'], ['Shift + drag', 'Constrain / keep proportions']] },
  { group: 'Text', items: [['Ctrl + B / I / U', 'Bold / italic / underline'], ['Ctrl + K', 'Insert link'], ['Tab / Shift + Tab', 'Indent / outdent list'], ['Esc', 'Finish editing']] },
  { group: 'Presenting', items: [['Space / Right / Enter', 'Next'], ['Left / Backspace', 'Previous'], ['Number + Enter', 'Go to slide'], ['B / W', 'Black / white screen'], ['P / E', 'Pen / erase ink'], ['L', 'Laser pointer'], ['N', 'Speaker notes'], ['Esc', 'Exit']] },
  { group: 'General', items: [['Ctrl + Z / Y', 'Undo / redo'], ['Ctrl + F / H', 'Find / replace'], ['Ctrl + P', 'Print']] },
];
const EMOJI = ['😀', '😂', '😊', '😍', '😎', '🤔', '😢', '😡', '👍', '👎', '👏', '🙏', '💪', '🎉', '🔥', '⭐', '✨', '💡', '✅', '❌', '⚠️', '❓', '❗', '➡️', '⬅️', '⬆️', '⬇️', '🔗', '📌', '📎', '📅', '⏰', '💰', '📈', '📉', '🏆', '🎯', '🚀', '🌍', '🌱', '☀️', '🌙', '©', '®', '™', '°', '±', '×', '÷', '≈', '≠', '≤', '≥', '∞', '→', '←', '↑', '↓', '•', '…', '—', '€', '£', '¥', '✓', '★', '☆', '♥'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const slideCopy = (s) => { const c = JSON.parse(JSON.stringify(s)); c.id = uid(); const g = {}; c.els.forEach((e) => { e.id = uid(); if (e.gid) { g[e.gid] = g[e.gid] || uid(); e.gid = g[e.gid]; } }); return c; };
const newSlideId = () => uid();

async function prepImage(file) {
  const src0 = await readAsDataURL(file);
  const { w, h } = await imageSize(src0);
  if (file.type === 'image/svg+xml' || file.type === 'image/gif' || (w <= 1600 && h <= 1600 && file.size < 700 * 1024)) return { src: src0, w, h };
  const k = Math.min(1, 1600 / Math.max(w, h));
  const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src0; });
  if (!img) return { src: src0, w, h };
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const png = file.type === 'image/png' && file.size < 2.5 * 1024 * 1024;
  return { src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88), w, h };
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
  return <div className="ctxmenu panel" ref={ref} style={pos} onMouseDown={(e) => e.preventDefault()} role="menu"><MenuList items={ctx.items} close={close} /></div>;
}

/* ---------- find & replace ---------- */
function replaceInParas(paras, find, repl, cs) {
  const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi');
  let n = 0;
  const out = paras.map((p) => {
    const text = p.runs.map((r) => r.t).join('');
    if (!text.match(re)) return p;
    let runs = p.runs.map((r) => ({ ...r, t: r.t.replace(re, () => { n++; return repl; }) }));
    if (runs.map((r) => r.t).join('').match(re)) { n++; runs = [{ ...p.runs[0], t: text.replace(re, repl) }]; }
    return { ...p, runs };
  });
  return [out, n];
}
function findAll(deck, q, cs) {
  if (!q) return [];
  const hay = (t) => (cs ? t.includes(q) : t.toLowerCase().includes(q.toLowerCase()));
  const out = [];
  deck.slides.forEach((s, si) => {
    s.els.forEach((e) => {
      if (e.paras) { const t = plain(e.paras); if (hay(t)) out.push({ si, id: e.id, text: t, where: 'text' }); }
      if (e.type === 'table') e.cells.forEach((row, r) => row.forEach((c, k) => { if (hay(c.t || '')) out.push({ si, id: e.id, text: c.t, where: `cell ${r + 1},${k + 1}` }); }));
    });
    if (s.notes && hay(s.notes)) out.push({ si, id: null, text: s.notes, where: 'notes' });
  });
  return out;
}
function FindPanel({ deck, onGo, onReplaceAll, onClose, initialReplace }) {
  const [q, setQ] = useState(''); const [r, setR] = useState(''); const [cs, setCs] = useState(false); const [showR, setShowR] = useState(!!initialReplace);
  const res = useMemo(() => findAll(deck, q, cs), [deck, q, cs]);
  return (
    <aside className="sidepanel fp" aria-label="Find and replace">
      <div className="fptabs"><b className="fpt">Find{showR ? ' and replace' : ''}</b><button className="fpclose" aria-label="Close panel" onClick={onClose}><Icon name="x" size={14} /></button></div>
      <div className="fpscroll findbody">
        <input autoFocus type="search" placeholder="Find in all slides" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) onGo(res[0]); }} aria-label="Find" />
        {showR && <input type="text" placeholder="Replace with" value={r} onChange={(e) => setR(e.target.value)} aria-label="Replace with" />}
        <label className="fcheck"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /> Match case</label>
        <div className="btnrow">
          {!showR && <button className="btn sm" onClick={() => setShowR(true)}>Replace…</button>}
          {showR && <button className="btn sm primary" disabled={!res.length} onClick={() => onReplaceAll(q, r, cs)}>Replace all ({res.length})</button>}
        </div>
        <p className="muted small">{q ? `${res.length} match${res.length === 1 ? '' : 'es'}` : 'Searches text, tables and notes.'}</p>
        <ul className="findlist">{res.slice(0, 200).map((m, i) => (
          <li key={i}><button onClick={() => onGo(m)}><b>Slide {m.si + 1}</b> <small>{m.where}</small><span>{m.text.slice(0, 70)}</span></button></li>
        ))}</ul>
      </div>
    </aside>
  );
}

export default function SlidesApp() {
  const lib = useLibrary('slides', blankDeck);
  const dlg = useDialog();
  const { current, edit } = lib;
  const deck = useMemo(() => migrateDeck(current.data), [current.data]);
  useEffect(() => { if (current.data && current.data.v !== 2) edit(() => deck, { history: false }); }, [current.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = deck.theme;
  const L = useRef(lib); L.current = lib;
  const D = useRef(deck); D.current = deck;

  /* ---------- state ---------- */
  const [si0, setSi] = useState(0);
  const si = clamp(si0, 0, deck.slides.length - 1);
  const siRef = useRef(si); siRef.current = si;
  const slide = deck.slides[si];
  const [selSlides, setSelSlides] = useState([0]);
  const [selIds, setSelIds] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editCell, setEditCell] = useState(null);
  const [tcell, setTcell] = useState(null);
  const [tscope, setTscope] = useState('cell');
  const [zoom, setZoom] = useState('fit');
  const [view, setView] = useState('edit');
  const [panel, setPanel] = useState('format');
  const [tab, setTab] = useState('slide');
  const [showNotes, setShowNotes] = useState(true);
  const [grid, setGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [gridSnap, setGridSnap] = useState(false);
  const [lockRatio, setLockRatio] = useState(true);
  const [present, setPresent] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [area, setArea] = useState({ w: 800, h: 500 });
  const [fmtState, setFmtState] = useState({});
  const [printMode, setPrintMode] = useState(null);
  const [findInit, setFindInit] = useState(false);
  const editorRef = useRef(null);
  const savedRange = useRef(null);
  const areaRef = useRef(null);
  const stageRef = useRef(null);
  const clipRef = useRef(null);
  const focusArea = useRef('stage');
  const pasteN = useRef(0);
  const editRef = useRef(null); editRef.current = editing;
  const cellRef = useRef(null); cellRef.current = editCell;

  useEffect(() => { setSi(0); setSelSlides([0]); setSelIds([]); setEditing(null); setEditCell(null); setTcell(null); setView('edit'); }, [current.id]);
  useEffect(() => { setSelIds((ids) => { const ok = ids.filter((id) => slide.els.some((e) => e.id === id)); return ok.length === ids.length ? ids : ok; }); }, [slide]);
  useEffect(() => { if (selSlides.some((i) => i >= deck.slides.length)) setSelSlides([si]); }, [deck.slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = useMemo(() => slide.els.filter((e) => selIds.includes(e.id)), [slide, selIds]);
  const one = sel.length === 1 ? sel[0] : null;

  useEffect(() => {
    const n = areaRef.current; if (!n) return undefined;
    const ro = new ResizeObserver(() => setArea({ w: n.clientWidth, h: n.clientHeight }));
    ro.observe(n); setArea({ w: n.clientWidth, h: n.clientHeight });
    return () => ro.disconnect();
  }, [view]);
  const scale = zoom === 'fit' ? Math.max(0.1, Math.min((area.w - 56) / SW, (area.h - 48) / SH)) : zoom;

  /* ---------- mutation helpers ---------- */
  const mut = useCallback((fn, opts) => edit((d0) => { const d = d0.v === 2 ? d0 : migrateDeck(d0); const r = fn(d); return r === undefined ? d0 : r; }, opts), [edit]);
  const setSlides = useCallback((fn, opts) => mut((d) => { const s = fn(d.slides, d); return s === d.slides ? d : { ...d, slides: s }; }, opts), [mut]);
  const updSlideAt = useCallback((i, fn, opts) => setSlides((ss) => ss.map((s, k) => (k === i ? fn(s) : s)), opts), [setSlides]);
  const upd = useCallback((ids, patch, opts) => updSlideAt(siRef.current, (s) => ({ ...s, els: s.els.map((e) => (ids.includes(e.id) ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)) }), opts), [updSlideAt]);
  const patchMany = useCallback((byId, opts) => updSlideAt(siRef.current, (s) => ({ ...s, els: s.els.map((e) => (byId[e.id] ? { ...e, ...byId[e.id] } : e)) }), opts), [updSlideAt]);
  const setSlide = (patch, opts) => updSlideAt(si, (s) => ({ ...s, ...patch }), opts);

  const commitEditing = useCallback(() => { const n = editorRef.current; if (n && n.__commit) n.__commit(); if (cellRef.current) { /* cell editor commits on blur */ const a = document.activeElement; if (a && a.classList && a.classList.contains('cellta')) a.blur(); } }, []);

  const select = useCallback((ids) => { setSelIds(ids); if (ids.length !== 1) { setTcell(null); } }, []);
  const gotoSlide = (i, ev) => {
    commitEditing(); setEditing(null); setEditCell(null);
    const n = clamp(i, 0, deck.slides.length - 1);
    setSi(n); setSelIds([]); setTcell(null);
    if (ev && ev.shiftKey) { const a = Math.min(si, n); const b = Math.max(si, n); setSelSlides(Array.from({ length: b - a + 1 }, (_, k) => a + k)); }
    else if (ev && (ev.ctrlKey || ev.metaKey)) setSelSlides((s) => (s.includes(n) ? (s.length > 1 ? s.filter((x) => x !== n) : s) : [...s, n].sort((a, b) => a - b)));
    else setSelSlides([n]);
  };

  /* ---------- adding / removing elements ---------- */
  const addEls = (els, { edit: ed } = {}) => {
    updSlideAt(si, (s) => ({ ...s, els: [...s.els, ...els] }));
    setSelIds(els.map((e) => e.id)); setTab('format'); setPanel((p) => p || 'format');
    if (ed && els[0]) setTimeout(() => setEditing(els[0].id), 30);
  };
  const delEls = (ids = selIds) => { if (!ids.length) return; commitEditing(); setEditing(null); setEditCell(null); updSlideAt(si, (s) => ({ ...s, els: s.els.filter((e) => !ids.includes(e.id)) })); setSelIds([]); };
  const centre = (w, h) => ({ x: Math.round((SW - w) / 2), y: Math.round((SH - h) / 2) });

  const insertText = () => { const e = newText({ ...centre(420, 60), w: 420, h: 60, paras: [{ runs: [] }], tx: { sz: 28, c: '@text', f: '@body', va: 'top', pad: 8 } }); addEls([e], { edit: true }); };
  const insertShape = (shape) => { const e = newShape(shape, { ...centre(220, 140) }); if (shape === 'star5' || shape === 'heart' || shape === 'plus') { e.w = 160; e.h = 160; Object.assign(e, centre(160, 160)); } addEls([e]); };
  const insertLine = (kind) => addEls([newLine({ x: 300, y: 270, w: 360, h: 0, head: kind === 'darrow' ? 'arrow' : 'none', tail: kind === 'line' ? 'none' : 'arrow' })]);
  const insertImages = async (files, at) => {
    const out = [];
    for (const f of files) {
      if (!/^image\//.test(f.type)) continue;
      const { src, w, h } = await prepImage(f);
      const k = Math.min(1, 640 / w, 400 / h); const ww = Math.round(w * k); const hh = Math.round(h * k);
      const p = at ? { x: Math.round(at.x - ww / 2), y: Math.round(at.y - hh / 2) } : centre(ww, hh);
      out.push(newImage(src, ww, hh, { ...p, x: p.x + out.length * 24, y: p.y + out.length * 24, nat: { w, h }, alt: f.name.replace(/\.[^.]+$/, '') }));
    }
    if (out.length) addEls(out); else dlg.toast('Choose an image file', { kind: 'error' });
  };
  const pickImage = async () => { const f = await pickFile('image/*'); if (f) insertImages([f]); };
  const insertTableDlg = async () => {
    const r = await dlg.form({ title: 'Insert table', fields: [{ name: 'rows', label: 'Rows', type: 'number', value: 4, min: 1, max: 30 }, { name: 'cols', label: 'Columns', type: 'number', value: 3, min: 1, max: 12 }], okText: 'Insert' });
    if (!r) return;
    const rows = clamp(Math.round(r.rows) || 3, 1, 30); const cols = clamp(Math.round(r.cols) || 3, 1, 12);
    const w = Math.min(840, cols * 200); const t = newTable(rows, cols, { w, h: rows * 44, ...centre(w, rows * 44) });
    addEls([t]);
  };
  const editChart = async (id) => {
    const el = D.current.slides[siRef.current].els.find((e) => e.id === id); if (!el) return;
    const r = await dlg.custom(({ close }) => <ChartEditor el={el} th={D.current.theme} close={close} />, { title: 'Chart data', width: 900 });
    if (r) upd([id], { chart: r.chart, data: r.data });
  };
  const insertChart = (type = 'column') => { const c = newChart(type, { ...centre(560, 340) }); addEls([c]); setTimeout(() => editChart(c.id), 60); };
  const insertEmoji = (ch) => {
    if (editorRef.current) { withEditor(() => document.execCommand('insertText', false, ch)); return; }
    addEls([newText({ ...centre(120, 100), w: 120, h: 100, paras: P(ch), tx: { sz: 64, al: 'center', va: 'mid', pad: 4, c: '@text' } })]);
  };

  /* ---------- text formatting ---------- */
  const withEditor = (fn) => {
    const n = editorRef.current; if (!n) return false;
    n.focus();
    if (savedRange.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange.current); }
    try { document.execCommand('styleWithCSS', false, true); } catch { /* ignore */ }
    fn(n); readFmt();
    return true;
  };
  useEffect(() => {
    const h = () => {
      const n = editorRef.current; if (!n) return;
      const s = window.getSelection(); if (!s.rangeCount) return;
      const r = s.getRangeAt(0); if (n.contains(r.commonAncestorContainer)) { savedRange.current = r.cloneRange(); readFmt(); }
    };
    document.addEventListener('selectionchange', h);
    return () => document.removeEventListener('selectionchange', h);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  function readFmt() {
    const n = editorRef.current; if (!n) return;
    const s = window.getSelection(); let el = s.anchorNode; if (el && el.nodeType === 3) el = el.parentElement;
    if (!el || !n.contains(el)) return;
    const cs = getComputedStyle(el); const para = paragraphsInSelection(n)[0];
    const st = {
      b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline'), s: document.queryCommandState('strikeThrough'),
      sz: Math.round(parseFloat(cs.fontSize) * 10) / 10, c: cs.color, f: (cs.fontFamily.split(',')[0] || '').replace(/["']/g, ''), al: para ? (para.style.textAlign || 'left') : 'left', bul: para ? para.dataset.bul || '' : '', link: !!el.closest('a'),
    };
    setFmtState((o) => (JSON.stringify(o) === JSON.stringify(st) ? o : st));
  }
  const rgbHex = (c) => { const m = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c || ''); return m ? '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('') : '#000000'; };
  const baseTx = (e) => ({ f: '@body', sz: 24, c: '@text', b: false, i: false, al: 'left', va: 'top', pad: 8, ls: 1.15, ...(e.tx || {}) });

  const stripRuns = (paras, keys) => paras.map((p) => ({ ...p, runs: p.runs.map((r) => { const n = { ...r }; keys.forEach((k) => delete n[k]); return n; }) }));
  const setTx = (patch) => {
    const textEls = sel.filter((e) => e.type === 'text' || e.type === 'shape');
    const edKeys = Object.keys(patch).filter((k) => ['b', 'i', 'sz', 'c', 'f', 'al'].includes(k));
    if (editorRef.current && edKeys.length === Object.keys(patch).length) {
      withEditor(() => {
        if ('b' in patch) { if (document.queryCommandState('bold') !== !!patch.b) document.execCommand('bold'); }
        if ('i' in patch) { if (document.queryCommandState('italic') !== !!patch.i) document.execCommand('italic'); }
        if ('c' in patch) document.execCommand('foreColor', false, rc(patch.c, th));
        if ('f' in patch) document.execCommand('fontName', false, patch.f === '@head' ? th.head : patch.f === '@body' ? th.body : patch.f);
        if ('sz' in patch) setSelFontSize(patch.sz);
        if ('al' in patch) document.execCommand({ left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', just: 'justifyFull' }[patch.al] || 'justifyLeft');
      });
      return;
    }
    if (!textEls.length) return;
    const strip = []; ['b', 'i', 'c', 'f', 'sz'].forEach((k) => { if (k in patch) strip.push(k); });
    const ids = textEls.map((e) => e.id);
    upd(ids, (e) => ({ tx: { ...e.tx, ...patch, __user: true }, paras: strip.length || 'al' in patch ? stripRuns(e.paras, strip).map((p) => ('al' in patch ? { ...p, al: undefined } : p)) : e.paras }));
  };
  function setSelFontSize(v) {
    document.execCommand('fontSize', false, '7');
    const n = editorRef.current; if (!n) return;
    n.querySelectorAll('font[size="7"], span[style*="xxx-large"], span[style*="-webkit-xxx-large"]').forEach((f) => {
      const sp = document.createElement('span'); sp.style.fontSize = v + 'px'; sp.innerHTML = f.innerHTML; f.replaceWith(sp);
      sp.querySelectorAll('span').forEach((c) => { if (c.style.fontSize) c.style.fontSize = ''; });
    });
  }
  const toggleFmt = (k) => {
    if (editorRef.current) { const cmd = { b: 'bold', i: 'italic', u: 'underline', s: 'strikeThrough' }[k]; withEditor(() => document.execCommand(cmd)); return; }
    const els = sel.filter((e) => e.paras);
    if (!els.length) return;
    const all = els.every((e) => (k === 'b' || k === 'i' ? baseTx(e)[k] : e.paras.every((p) => p.runs.every((r) => r[k]))));
    upd(els.map((e) => e.id), (e) => (k === 'b' || k === 'i' ? { tx: { ...e.tx, [k]: !all }, paras: stripRuns(e.paras, [k]) } : { paras: e.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, [k]: !all || undefined })) })) }));
  };
  const setBullet = (kind) => {
    if (editorRef.current) { withEditor((n) => { const ps = paragraphsInSelection(n); const allSame = ps.every((d) => d.dataset.bul === kind); ps.forEach((d) => { if (allSame) { delete d.dataset.bul; d.style.paddingLeft = (Number(d.dataset.lvl) || 0) ? `${Number(d.dataset.lvl) * 0.9}em` : ''; } else { d.dataset.bul = kind; d.style.paddingLeft = `${((Number(d.dataset.lvl) || 0) + 1) * 0.9}em`; } }); }); return; }
    const els = sel.filter((e) => e.paras); if (!els.length) return;
    const all = els.every((e) => e.paras.every((p) => p.bul === kind));
    upd(els.map((e) => e.id), (e) => ({ paras: e.paras.map((p) => ({ ...p, bul: all ? undefined : kind })) }));
  };
  const indent = (dir) => {
    if (editorRef.current) { withEditor((n) => changeLevel(n, dir)); return; }
    const els = sel.filter((e) => e.paras); upd(els.map((e) => e.id), (e) => ({ paras: e.paras.map((p) => ({ ...p, lvl: clamp((p.lvl || 0) + dir, 0, 5) })) }));
  };
  const setLineSpacing = (v) => upd(sel.filter((e) => e.paras).map((e) => e.id), (e) => ({ tx: { ...e.tx, ls: v }, paras: e.paras.map((p) => ({ ...p, ls: undefined })) }));
  const setSupSub = (k) => withEditor(() => document.execCommand(k === 'sup' ? 'superscript' : 'subscript'));
  const setHighlight = (c) => { if (editorRef.current) withEditor(() => document.execCommand('hiliteColor', false, c ? rc(c, th) : 'transparent')); else upd(sel.filter((e) => e.paras).map((e) => e.id), (e) => ({ paras: e.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, hl: c || undefined })) })) })); };
  const clearFormat = () => { if (editorRef.current) { withEditor(() => document.execCommand('removeFormat')); return; } upd(sel.filter((e) => e.paras).map((e) => e.id), (e) => ({ paras: stripRuns(e.paras, ['b', 'i', 'u', 's', 'c', 'sz', 'f', 'hl', 'sup', 'sub']) })); };
  const caseChange = (how) => {
    const f = (t) => (how === 'upper' ? t.toUpperCase() : how === 'lower' ? t.toLowerCase() : t.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()));
    if (editorRef.current) { withEditor(() => { const s = window.getSelection(); if (!s.isCollapsed) document.execCommand('insertText', false, f(s.toString())); }); return; }
    upd(sel.filter((e) => e.paras).map((e) => e.id), (e) => ({ paras: e.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, t: f(r.t) })) })) }));
  };

  /* current formatting for the toolbar */
  const first = sel.find((e) => e.paras);
  const cur = useMemo(() => {
    if (editing && editorRef.current && fmtState.sz) return { b: fmtState.b, i: fmtState.i, u: fmtState.u, s: fmtState.s, sz: fmtState.sz, c: rgbHex(fmtState.c), f: fmtState.f, al: fmtState.al, bul: fmtState.bul };
    if (first) { const t = baseTx(first); const p0 = first.paras[0] || {}; const r0 = (p0.runs && p0.runs[0]) || {}; return { b: r0.b ?? t.b, i: r0.i ?? t.i, u: !!r0.u, s: !!r0.s, sz: r0.sz ?? t.sz, c: r0.c ?? t.c, f: r0.f ?? t.f, al: p0.al ?? t.al, bul: p0.bul || '' }; }
    return { b: false, i: false, u: false, s: false, sz: 24, c: '@text', f: '@body', al: 'left', bul: '' };
  }, [editing, fmtState, first]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- arrange ---------- */
  const reorder = (how) => updSlideAt(si, (s) => {
    const ids = new Set(selIds); const els = s.els; const picked = els.filter((e) => ids.has(e.id)); const rest = els.filter((e) => !ids.has(e.id));
    if (!picked.length) return s;
    if (how === 'front') return { ...s, els: [...rest, ...picked] };
    if (how === 'back') return { ...s, els: [...picked, ...rest] };
    const out = [...els];
    if (how === 'forward') { for (let i = out.length - 2; i >= 0; i--) if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]]; } else { for (let i = 1; i < out.length; i++) if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]]; }
    return { ...s, els: out };
  });
  const align = (how) => { if (sel.length === 1) { const q = aabb(sel[0]); const t = { left: [-q.x1, 0], right: [SW - q.x2, 0], center: [SW / 2 - (q.x1 + q.x2) / 2, 0], top: [0, -q.y1], bottom: [0, SH - q.y2], middle: [0, SH / 2 - (q.y1 + q.y2) / 2] }[how]; upd([sel[0].id], (e) => ({ x: e.x + t[0], y: e.y + t[1] })); return; } patchMany(alignEls(sel, how)); };
  const distribute = (axis) => patchMany(distributeEls(sel, axis));
  const group = () => { if (sel.length < 2) return; const g = uid(); upd(selIds, { gid: g }); };
  const ungroup = () => upd(selIds, { gid: undefined });
  const flip = (axis) => upd(selIds, (e) => (axis === 'h' ? { flipH: !e.flipH } : { flipV: !e.flipV }));
  const toggleLock = () => { const all = sel.every((e) => e.locked); upd(selIds, { locked: !all }); };
  const rotate90 = () => upd(selIds, (e) => ({ rot: ((e.rot || 0) + 90) % 360 }));
  const resizeTo = (e, p) => {
    const patch = { ...p };
    if (e.type === 'image' && lockRatio && e.w && e.h) { if (p.w !== undefined) patch.h = Math.round((p.w * e.h) / e.w * 10) / 10; else if (p.h !== undefined) patch.w = Math.round((p.h * e.w) / e.h * 10) / 10; }
    if (e.type === 'table' && patch.h) patch.rowH = e.rowH.map((r) => (r * patch.h) / e.h);
    upd([e.id], patch);
  };
  const nudge = (dx, dy) => patchMany(Object.fromEntries(sel.filter((e) => !e.locked).map((e) => [e.id, { x: e.x + dx, y: e.y + dy }])), { coalesce: 'nudge', coalesceMs: 700 });

  /* ---------- clipboard ---------- */
  const copyEls = (cut) => {
    if (!sel.length) return;
    clipRef.current = { kind: 'els', els: JSON.parse(JSON.stringify(sel)), text: sel.map((e) => (e.paras ? plain(e.paras) : '')).filter(Boolean).join('\n') };
    pasteN.current = 0;
    try { navigator.clipboard && navigator.clipboard.writeText(clipRef.current.text || ' ').catch(() => {}); } catch { /* ignore */ }
    if (cut) delEls();
  };
  const copySlides = (cut) => {
    const idx = selSlides.length ? selSlides : [si];
    clipRef.current = { kind: 'slides', slides: idx.map((i) => JSON.parse(JSON.stringify(deck.slides[i]))) }; pasteN.current = 0;
    if (cut) deleteSlides(idx);
    else dlg.toast(`Copied ${idx.length} slide${idx.length === 1 ? '' : 's'}`);
  };
  const pasteClip = () => {
    const c = clipRef.current; if (!c) return false;
    if (c.kind === 'slides') {
      const at = Math.max(...selSlides, si) + 1; const copies = c.slides.map(slideCopy);
      setSlides((ss) => [...ss.slice(0, at), ...copies, ...ss.slice(at)]); setSi(at); setSelSlides(copies.map((_, k) => at + k)); return true;
    }
    pasteN.current += 1; const off = 18 * pasteN.current; const gm = {};
    const els = c.els.map((e) => cloneEl(e, off, off, gm)); addEls(els); return true;
  };
  const duplicate = () => { if (!sel.length) return; const gm = {}; const els = sel.map((e) => cloneEl(e, 18, 18, gm)); addEls(els); };
  const selectAll = () => setSelIds(slide.els.map((e) => e.id));

  useEffect(() => {
    const onPaste = async (e) => {
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (present) return;
      const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter((f) => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); insertImages(files); return; }
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      if (clipRef.current && (focusArea.current === 'thumbs' ? clipRef.current.kind === 'slides' : true) && (clipRef.current.kind === 'slides' || !text || text === (clipRef.current.text || ' ') || text.trim() === (clipRef.current.text || '').trim())) { e.preventDefault(); pasteClip(); return; }
      if (text.trim()) { e.preventDefault(); const lines = text.replace(/\r/g, ''); addEls([newText({ ...centre(560, 120), w: 560, h: Math.min(400, 40 + lines.split('\n').length * 36), paras: P(lines), tx: { sz: 24, va: 'top', pad: 8, c: '@text', f: '@body' } })]); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  /* ---------- slides ---------- */
  const addSlide = (layoutId, at) => {
    commitEditing();
    const idx = at === undefined ? Math.max(...selSlides, si) + 1 : at;
    const lay = layoutId || (slide.layout === 'title' || slide.layout === 'section' ? 'content' : slide.layout === 'blank' ? 'blank' : slide.layout || 'content');
    const s = newSlide(lay, th);
    setSlides((ss) => [...ss.slice(0, idx), s, ...ss.slice(idx)]); setSi(idx); setSelSlides([idx]); setSelIds([]); setEditing(null);
  };
  const dupSlides = (idxs = selSlides) => { const sorted = [...idxs].sort((a, b) => a - b); const at = sorted[sorted.length - 1] + 1; const copies = sorted.map((i) => slideCopy(deck.slides[i])); setSlides((ss) => [...ss.slice(0, at), ...copies, ...ss.slice(at)]); setSi(at); setSelSlides(copies.map((_, k) => at + k)); setSelIds([]); };
  function deleteSlides(idxs = selSlides) {
    commitEditing(); setEditing(null);
    const set = new Set(idxs);
    setSlides((ss) => { const rest = ss.filter((_, i) => !set.has(i)); return rest.length ? rest : [newSlide('title', th)]; });
    const n = Math.max(0, Math.min(Math.min(...idxs), deck.slides.length - idxs.length - 1)); setSi(n); setSelSlides([n]); setSelIds([]);
  }
  const moveSlide = (from, to) => { if (from === to) return; setSlides((ss) => { const a = [...ss]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; }); setSi(to); setSelSlides([to]); };
  const moveSelSlides = (dir) => {
    const idxs = [...selSlides].sort((a, b) => a - b); if (!idxs.length) return;
    const lo = idxs[0]; const hi = idxs[idxs.length - 1];
    if (dir === 'up' && lo === 0) return; if (dir === 'down' && hi === deck.slides.length - 1) return;
    setSlides((ss) => { const a = [...ss]; const picked = idxs.map((i) => a[i]); const set = new Set(idxs); const rest = a.filter((_, i) => !set.has(i)); let at = dir === 'up' ? lo - 1 : dir === 'down' ? lo + 1 : dir === 'top' ? 0 : rest.length; rest.splice(at, 0, ...picked); return rest; });
    const base = dir === 'up' ? lo - 1 : dir === 'down' ? lo + 1 : dir === 'top' ? 0 : deck.slides.length - idxs.length;
    setSelSlides(idxs.map((_, k) => base + k)); setSi(base);
  };
  const toggleSkip = (idxs = selSlides) => { const set = new Set(idxs); const all = idxs.every((i) => deck.slides[i].hidden); setSlides((ss) => ss.map((s, i) => (set.has(i) ? { ...s, hidden: !all } : s))); };
  const applyLayoutTo = (id) => { commitEditing(); const set = new Set(selSlides.length ? selSlides : [si]); setSlides((ss) => ss.map((s, i) => (set.has(i) ? applyLayout(s, id) : s))); setSelIds([]); };
  const setBg = async (bg, all) => {
    let val = bg;
    if (typeof bg === 'function') { const f = await pickFile('image/*'); if (!f) return; const { src } = await prepImage(f); val = { type: 'image', src }; }
    if (all) setSlides((ss) => ss.map((s) => ({ ...s, bg: val }))); else setSlide({ bg: val });
  };
  const pickBgImage = async () => { const f = await pickFile('image/*'); if (!f) return; const { src } = await prepImage(f); setSlide({ bg: { type: 'image', src } }); };
  const setTrans = (patch, all) => { if (all) setSlides((ss) => ss.map((s) => ({ ...s, trans: { ...(s.trans || { type: 'none', dur: 0.5 }), ...(slide.trans || {}), ...patch } }))); else setSlide({ trans: { ...(slide.trans || { type: 'none', dur: 0.5 }), ...patch } }); };
  const setTheme = (t) => mut((d) => ({ ...d, theme: { ...t } }));
  const setFooter = (patch) => mut((d) => ({ ...d, footer: { ...(d.footer || {}), ...patch } }));
  const setAnim = (id, anim) => upd([id], (e) => {
    if (!anim) return { anim: null };
    const n = e.anim && e.anim.n !== undefined ? e.anim.n : Math.max(0, ...slide.els.map((x) => (x.anim ? x.anim.n ?? 0 : 0))) + 1;
    return { anim: { ...anim, n } };
  });
  const moveAnim = (id, dir) => {
    const list = slide.els.filter((e) => e.anim).sort((a, b) => (a.anim.n ?? 0) - (b.anim.n ?? 0)); const i = list.findIndex((e) => e.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= list.length) return;
    const order = list.map((e) => e.id); [order[i], order[j]] = [order[j], order[i]];
    updSlideAt(si, (s) => ({ ...s, els: s.els.map((e) => (e.anim ? { ...e, anim: { ...e.anim, n: order.indexOf(e.id) + 1 } } : e)) }));
  };

  /* ---------- tables ---------- */
  const tableOp = (op) => {
    if (!one || one.type !== 'table') return;
    const r0 = tcell && tcell.id === one.id ? tcell.r : one.cells.length - 1; const c0 = tcell && tcell.id === one.id ? tcell.c : one.cells[0].length - 1;
    upd([one.id], (t) => {
      let { cells, colW, rowH } = t; cells = cells.map((r) => [...r]); colW = [...colW]; rowH = [...rowH];
      const nc = cells[0].length; const avg = rowH.reduce((a, b) => a + b, 0) / rowH.length;
      if (op === 'addRow' || op === 'addRowAbove') { const at = op === 'addRow' ? r0 + 1 : r0; cells.splice(at, 0, Array.from({ length: nc }, () => ({ t: '' }))); rowH.splice(at, 0, avg); }
      if (op === 'delRow' && cells.length > 1) { cells.splice(r0, 1); rowH.splice(r0, 1); }
      if (op === 'addCol' || op === 'addColLeft') { const at = op === 'addCol' ? c0 + 1 : c0; const share = 1 / (nc + 1); colW = colW.map((w) => w * (1 - share)); colW.splice(at, 0, share); cells.forEach((r) => r.splice(at, 0, { t: '' })); }
      if (op === 'delCol' && nc > 1) { const w = colW[c0]; colW.splice(c0, 1); colW = colW.map((x) => x / (1 - w)); cells.forEach((r) => r.splice(c0, 1)); }
      return { cells, colW, rowH, h: rowH.reduce((a, b) => a + b, 0) };
    });
  };
  const cellFmt = (patch) => {
    if (!one || one.type !== 'table') return; const ac = tcell && tcell.id === one.id ? tcell : { r: 0, c: 0 };
    upd([one.id], (t) => ({ cells: t.cells.map((row, r) => row.map((c, k) => { const hit = tscope === 'all' || (tscope === 'cell' && r === ac.r && k === ac.c) || (tscope === 'row' && r === ac.r) || (tscope === 'col' && k === ac.c); return hit ? { ...c, ...patch } : c; })) }));
  };
  const onCellCommit = (text) => { const ec = cellRef.current; if (!ec) return; upd([ec.id], (t) => ({ cells: t.cells.map((row, r) => (r === ec.r ? row.map((c, k) => (k === ec.c ? { ...c, t: text } : c)) : row)) })); };
  const onCellDone = (cancel, dir) => {
    const ec = cellRef.current; setEditCell(null);
    if (dir && ec) { const t = D.current.slides[siRef.current].els.find((e) => e.id === ec.id); if (t) { const nr = t.cells.length; const nc = t.cells[0].length; let idx = ec.r * nc + ec.c + dir; if (idx >= nr * nc) { tableOp('addRow'); idx = ec.r * nc + nc; } idx = Math.max(0, idx); setTimeout(() => { setEditCell({ id: ec.id, r: Math.floor(idx / nc), c: idx % nc }); setTcell({ id: ec.id, r: Math.floor(idx / nc), c: idx % nc }); }, 40); } }
    void cancel;
  };

  /* ---------- links / images ---------- */
  const linkDialog = async (kind) => {
    const isText = kind === 'text';
    let existing = null;
    if (!isText && one) existing = one.link;
    const sl = D.current.slides;
    const r = await dlg.form({
      title: isText ? 'Link text' : 'Link object',
      fields: [
        { name: 'type', label: 'Link to', type: 'select', value: existing && existing.slide !== undefined ? 'slide' : 'url', options: [{ value: 'url', label: 'Web address' }, { value: 'slide', label: 'Slide in this presentation' }] },
        { name: 'url', label: 'Address', type: 'text', value: existing && existing.url ? existing.url : 'https://', show: (v) => v.type === 'url' },
        { name: 'slide', label: 'Slide', type: 'select', value: String(existing && existing.slide !== undefined ? existing.slide : 0), options: sl.map((s, i) => ({ value: String(i), label: `${i + 1}. ${plain((s.els.find((e) => e.ph === 'title') || { paras: [] }).paras).slice(0, 40) || 'Slide ' + (i + 1)}` })), show: (v) => v.type === 'slide' },
      ],
      okText: 'Apply',
    });
    if (!r) { if (isText) withEditor(() => {}); return; }
    const link = r.type === 'slide' ? { slide: Number(r.slide) } : { url: /^[a-z]+:/i.test(r.url) ? r.url : 'https://' + r.url };
    if (isText) {
      withEditor((n) => {
        const s = window.getSelection(); if (s.isCollapsed) { document.execCommand('insertText', false, link.url || `Slide ${link.slide + 1}`); }
        document.execCommand('createLink', false, link.url || '#');
        n.querySelectorAll('a').forEach((a) => { if (link.slide !== undefined && a.getAttribute('href') === '#') { a.dataset.slide = String(link.slide); } else if (link.url && a.getAttribute('href') === link.url) a.dataset.url = link.url; });
      });
    } else upd(selIds, { link });
  };
  const insertLinkCmd = () => { if (editorRef.current) linkDialog('text'); else if (sel.length) linkDialog('el'); else dlg.toast('Select text or an object first'); };
  const replaceImage = async () => { const f = await pickFile('image/*'); if (!f || !one) return; const { src, w, h } = await prepImage(f); upd([one.id], { src, nat: { w, h } }); };
  const resetImageSize = () => { if (!one || !one.nat) return; const k = Math.min(1, SW / one.nat.w, SH / one.nat.h); upd([one.id], { w: Math.round(one.nat.w * k), h: Math.round(one.nat.h * k) }); };

  /* ---------- find ---------- */
  const goMatch = (m) => { gotoSlide(m.si); if (m.id) setSelIds([m.id]); setView('edit'); };
  const replaceAll = (q, r, cs) => {
    let total = 0;
    setSlides((ss) => ss.map((s) => {
      let notes = s.notes; if (notes) { const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); notes = notes.replace(re, () => { total++; return r; }); }
      return { ...s, notes, els: s.els.map((e) => {
        let ne = e;
        if (e.paras) { const [p, n] = replaceInParas(e.paras, q, r, cs); if (n) { total += n; ne = { ...ne, paras: p }; } }
        if (e.type === 'table') { const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); ne = { ...ne, cells: e.cells.map((row) => row.map((c) => { if (c.t && re.test(c.t)) { re.lastIndex = 0; total++; return { ...c, t: c.t.replace(re, () => r) }; } re.lastIndex = 0; return c; })) }; }
        return ne;
      }) };
    }));
    setTimeout(() => dlg.toast(`Replaced ${total} occurrence${total === 1 ? '' : 's'}`), 50);
  };

  /* ---------- import / export / print ---------- */
  const importFile = async (file) => {
    if (!file) return; const ext = (file.name.split('.').pop() || '').toLowerCase(); const title = file.name.replace(/\.[^.]+$/, '');
    try {
      if (['pptx', 'pptm', 'potx'].includes(ext)) {
        const { importPptx } = await import('../lib/office/pptxImport.js');
        const { deck: nd, warnings } = await importPptx(await file.arrayBuffer());
        L.current.create(nd, title);
        const notes = Array.isArray(warnings) ? warnings.map((w) => w.replace(/\.$/, '')) : [];
        dlg.toast(notes.length ? 'Imported. ' + notes.join('; ') + '.' : 'Imported ' + file.name, { ms: notes.length ? 6000 : 2600 });
      } else if (ext === 'json') {
        const obj = JSON.parse(await readAsText(file)); const dk = obj && obj.slides ? (obj.v === 2 ? obj : migrateDeck(obj)) : null; if (!dk) throw new Error('not a deck');
        L.current.create(dk, obj.title || title);
      } else dlg.alert('Open a PowerPoint (.pptx) or Techomato Slides (.json) file.', 'Unsupported file');
    } catch (err) { dlg.alert(`That file could not be opened (${err && err.message ? err.message : 'unknown error'}).`, 'Could not import'); }
  };
  const doImport = async () => { const f = await pickFile('.pptx,.pptm,.potx,.json'); if (f) importFile(f); };
  const fname = safeName(current.title || 'Presentation');
  const doExport = async (kind) => {
    commitEditing();
    try {
      if (kind === 'pptx') { const { exportPptx } = await import('../lib/office/pptxExport.js'); saveBlob(await exportPptx(D.current, { title: current.title }), fname + '.pptx'); }
      else if (kind === 'html') { const { slidesToHtml } = await import('./slides/exporters.jsx'); downloadFile(fname + '.html', await slidesToHtml(D.current, current.title || 'Presentation'), 'text/html'); }
      else if (kind === 'json') downloadFile(fname + '.techomato-slides.json', JSON.stringify({ ...D.current, title: current.title }), 'application/json');
      else if (kind === 'png') { const { slideToPng } = await import('./slides/exporters.jsx'); const b = await slideToPng(D.current, siRef.current); saveBlob(b, `${fname}-slide-${siRef.current + 1}.png`); }
      else if (kind === 'pngzip') { const { slidesToZip } = await import('./slides/exporters.jsx'); dlg.toast('Rendering slides…', { ms: 1500 }); saveBlob(await slidesToZip(D.current), fname + '-slides.zip'); }
      else if (kind === 'txt') { const t = D.current.slides.map((s, i) => `Slide ${i + 1}\n` + s.els.filter((e) => e.paras).map((e) => plain(e.paras)).filter(Boolean).join('\n') + (s.notes ? `\nNotes: ${s.notes}` : '')).join('\n\n'); downloadFile(fname + '.txt', t, 'text/plain'); }
    } catch (err) { dlg.alert(`Export failed (${err && err.message ? err.message : 'unknown error'}).`, 'Could not export'); }
  };
  const doPrint = async () => {
    const r = await dlg.form({ title: 'Print', fields: [{ name: 'mode', label: 'Layout', type: 'select', value: 'slides', options: [{ value: 'slides', label: 'Slides (one per page)' }, { value: 'notes', label: 'Notes pages (slide + notes)' }, { value: 'handout', label: 'Handout (6 slides per page)' }] }, { name: 'hidden', label: 'Include skipped slides', type: 'checkbox', value: false }, { type: 'info', text: 'In the print dialog choose "Save as PDF" to create a PDF file. Turn on "Background graphics" so slide colours print.' }], okText: 'Print' });
    if (!r) return;
    setPrintMode({ mode: r.mode, hidden: !!r.hidden });
    setTimeout(() => { window.print(); setTimeout(() => setPrintMode(null), 500); }, 250);
  };

  const startPresent = (from, withNotes) => { commitEditing(); setEditing(null); setPresent({ start: from, notes: withNotes }); };
  const previewAnims = () => startPresent(si);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (present) return;
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey; const k = e.key;
      if (document.querySelector('.modal-backdrop')) return;
      if (mod && !e.shiftKey && (k === 'p' || k === 'P')) { e.preventDefault(); doPrint(); return; }
      if (k === 'F5') { e.preventDefault(); startPresent(e.shiftKey ? si : 0); return; }
      if (mod && (k === 'f' || k === 'F') && !typing) { e.preventDefault(); setFindInit(false); setPanel('find'); return; }
      if (mod && (k === 'h' || k === 'H') && !typing) { e.preventDefault(); setFindInit(true); setPanel('find'); return; }
      if (mod && (k === 'k' || k === 'K')) { e.preventDefault(); insertLinkCmd(); return; }
      if (editing || editCell) { if (mod && (k === 'z' || k === 'Z' || k === 'y')) return; return; }
      if (typing) return;
      if (mod && !e.shiftKey && (k === 'z' || k === 'Z')) { e.preventDefault(); lib.undo(); return; }
      if (mod && (k === 'y' || k === 'Y' || (e.shiftKey && (k === 'z' || k === 'Z')))) { e.preventDefault(); lib.redo(); return; }
      if (mod && (k === 'm' || k === 'M')) { e.preventDefault(); addSlide(); return; }
      if (focusArea.current === 'thumbs' || view === 'sorter') {
        if (mod && (k === 'c' || k === 'C')) { e.preventDefault(); copySlides(false); return; }
        if (mod && (k === 'x' || k === 'X')) { e.preventDefault(); copySlides(true); return; }
        if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); dupSlides(); return; }
        if (mod && e.shiftKey && k === 'ArrowUp') { e.preventDefault(); moveSelSlides('up'); return; }
        if (mod && e.shiftKey && k === 'ArrowDown') { e.preventDefault(); moveSelSlides('down'); return; }
        if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSlides(); return; }
        if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); gotoSlide(si + 1, e); return; }
        if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); gotoSlide(si - 1, e); return; }
        if (k === 'Enter') { e.preventDefault(); setView('edit'); setTimeout(() => stageRef.current && stageRef.current.el() && document.querySelector('.stagewrap') && document.querySelector('.stagewrap').focus(), 30); return; }
      }
      if (mod && (k === 'c' || k === 'C')) { e.preventDefault(); copyEls(false); return; }
      if (mod && (k === 'x' || k === 'X')) { e.preventDefault(); copyEls(true); return; }
      if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); duplicate(); return; }
      if (mod && (k === 'a' || k === 'A')) { e.preventDefault(); selectAll(); return; }
      if (mod && (k === 'g' || k === 'G')) { e.preventDefault(); if (e.shiftKey) ungroup(); else group(); return; }
      if (mod && (k === ']' || k === '[')) { e.preventDefault(); reorder(k === ']' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward')); return; }
      if (mod && (k === 'b' || k === 'B') && sel.length) { e.preventDefault(); toggleFmt('b'); return; }
      if (mod && (k === 'i' || k === 'I') && sel.length) { e.preventDefault(); toggleFmt('i'); return; }
      if (mod && (k === 'u' || k === 'U') && sel.length) { e.preventDefault(); toggleFmt('u'); return; }
      if (sel.length) {
        const st = e.shiftKey ? 10 : 1;
        if (k === 'ArrowLeft') { e.preventDefault(); nudge(-st, 0); return; } if (k === 'ArrowRight') { e.preventDefault(); nudge(st, 0); return; }
        if (k === 'ArrowUp') { e.preventDefault(); nudge(0, -st); return; } if (k === 'ArrowDown') { e.preventDefault(); nudge(0, st); return; }
        if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); delEls(); return; }
        if ((k === 'Enter' || k === 'F2') && one && (one.type === 'text' || one.type === 'shape') && !one.locked) { e.preventDefault(); setEditing(one.id); return; }
        if (k === 'Escape') { setSelIds([]); return; }
      }
      if (k === 'Tab' && slide.els.length) { e.preventDefault(); const i = slide.els.findIndex((x) => x.id === selIds[selIds.length - 1]); const n = (i + (e.shiftKey ? -1 : 1) + slide.els.length) % slide.els.length; setSelIds([slide.els[n].id]); return; }
      if (k === 'PageDown') { e.preventDefault(); gotoSlide(si + 1); return; } if (k === 'PageUp') { e.preventDefault(); gotoSlide(si - 1); return; }
      if (k === 'Escape') setSelIds([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- context menus ---------- */
  const elMenu = () => [
    { label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', onClick: () => copyEls(true) }, { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => copyEls(false) }, { label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V', disabled: !clipRef.current, onClick: pasteClip },
    { label: 'Duplicate', shortcut: 'Ctrl+D', onClick: duplicate }, { label: 'Delete', shortcut: 'Del', danger: true, onClick: () => delEls() }, { sep: true },
    { label: 'Bring to front', icon: 'bringFront', onClick: () => reorder('front') }, { label: 'Send to back', icon: 'sendBack', onClick: () => reorder('back') }, { sep: true },
    { label: 'Group', shortcut: 'Ctrl+G', disabled: sel.length < 2, onClick: group }, { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', disabled: !sel.some((e) => e.gid), onClick: ungroup }, { label: sel.every((e) => e.locked) ? 'Unlock' : 'Lock', icon: 'lock', onClick: toggleLock }, { sep: true },
    { label: 'Link…', icon: 'link', shortcut: 'Ctrl+K', onClick: () => linkDialog('el') }, { label: 'Format options…', icon: 'sliders', onClick: () => { setPanel('format'); setTab('format'); } },
  ];
  const stageMenu = () => [{ label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V', disabled: !clipRef.current, onClick: pasteClip }, { label: 'Select all', shortcut: 'Ctrl+A', onClick: selectAll }, { sep: true }, { label: 'New text box', onClick: insertText }, { label: 'New slide', shortcut: 'Ctrl+M', onClick: () => addSlide() }, { label: 'Slide background…', onClick: () => { setPanel('format'); setTab('slide'); } }, { label: grid ? 'Hide grid' : 'Show grid', onClick: () => setGrid((g) => !g) }];
  const slideMenu = (i) => {
    const idxs = selSlides.includes(i) ? selSlides : [i];
    return [
      { label: 'New slide', shortcut: 'Ctrl+M', onClick: () => addSlide(undefined, i + 1) }, { label: 'Duplicate slide', shortcut: 'Ctrl+D', onClick: () => dupSlides(idxs) }, { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => copySlides(false) }, { label: 'Cut', onClick: () => copySlides(true) }, { label: 'Paste', disabled: !clipRef.current || clipRef.current.kind !== 'slides', onClick: pasteClip }, { sep: true },
      { label: idxs.every((x) => deck.slides[x].hidden) ? 'Include in presentation' : 'Skip slide', icon: 'eyeOff', onClick: () => toggleSkip(idxs) }, { label: 'Move up', onClick: moveSelSlides.bind(null, 'up') }, { label: 'Move down', onClick: moveSelSlides.bind(null, 'down') }, { sep: true },
      { label: 'Delete slide', danger: true, onClick: () => deleteSlides(idxs) },
    ];
  };
  const openCtx = (e, items) => setCtx({ x: e.clientX, y: e.clientY, items });

  /* ---------- panel api ---------- */
  const api = {
    tab, setTab, closePanel: () => setPanel(null), upd, resizeTo, lockRatio, setLockRatio, flip, toggleLock, setTx, linkDialog, replaceImage, resetImageSize, tcell, tscope, setTscope, tableOp, cellFmt, editChart,
    applyLayout: applyLayoutTo, setBg, pickBgImage, setTrans, setSlide, setTheme, setFooter, setAnim, moveAnim, selectIds: setSelIds, previewAnims,
  };

  const handlers = useMemo(() => ({
    commitEditing, editorRef,
    onTextCommit: (paras, need) => {
      const id = editRef.current; setEditing(null); editorRef.current = null;
      if (!id) return;
      const el = D.current.slides[siRef.current].els.find((e) => e.id === id); if (!el) return;
      if (el.type === 'text' && !el.ph && isEmptyParas(paras)) { updSlideAt(siRef.current, (s) => ({ ...s, els: s.els.filter((e) => e.id !== id) })); setSelIds([]); return; }
      const grow = el.type === 'text' && need && need > el.h && !(el.tx && el.tx.fit === 'shrink') ? { h: need } : {};
      upd([id], { paras, ...grow });
    },
    onTextCancel: () => { setEditing(null); editorRef.current = null; },
    onCellCommit, onCellDone,
  }), [upd, updSlideAt]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- menus ---------- */
  const zoomItems = [['Fit', 'fit'], ['50%', 0.5], ['75%', 0.75], ['100%', 1], ['125%', 1.25], ['150%', 1.5], ['200%', 2]].map(([l, v]) => ({ label: l, checked: zoom === v, onClick: () => setZoom(v) }));
  const fileItems = [
    { label: 'Import (.pptx, .json)...', icon: 'upload', onClick: doImport },
    { label: 'Download as', icon: 'download', children: [
      { label: 'PowerPoint (.pptx)', onClick: () => doExport('pptx') }, { label: 'PDF (via Print)...', onClick: doPrint }, { label: 'Web presentation (.html)', onClick: () => doExport('html') },
      { label: 'PNG image (this slide)', onClick: () => doExport('png') }, { label: 'PNG images (all slides, .zip)', onClick: () => doExport('pngzip') }, { label: 'Plain text outline (.txt)', onClick: () => doExport('txt') }, { label: 'Techomato Slides (.json)', onClick: () => doExport('json') },
    ] },
    { label: 'Print...', shortcut: 'Ctrl+P', icon: 'printer', onClick: doPrint },
  ];
  const arrangeItems = [
    { label: 'Order', children: [{ label: 'Bring to front', shortcut: 'Ctrl+Shift+]', onClick: () => reorder('front') }, { label: 'Bring forward', shortcut: 'Ctrl+]', onClick: () => reorder('forward') }, { label: 'Send backward', shortcut: 'Ctrl+[', onClick: () => reorder('backward') }, { label: 'Send to back', shortcut: 'Ctrl+Shift+[', onClick: () => reorder('back') }] },
    { label: 'Align', children: [['Left', 'left'], ['Centre', 'center'], ['Right', 'right'], ['Top', 'top'], ['Middle', 'middle'], ['Bottom', 'bottom']].map(([l, h]) => ({ label: l, onClick: () => align(h) })) },
    { label: 'Distribute', children: [{ label: 'Horizontally', disabled: sel.length < 3, onClick: () => distribute('h') }, { label: 'Vertically', disabled: sel.length < 3, onClick: () => distribute('v') }] },
    { label: 'Rotate', children: [{ label: 'Rotate 90° clockwise', onClick: rotate90 }, { label: 'Flip horizontal', onClick: () => flip('h') }, { label: 'Flip vertical', onClick: () => flip('v') }] }, { sep: true },
    { label: 'Group', shortcut: 'Ctrl+G', disabled: sel.length < 2, onClick: group }, { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', disabled: !sel.some((e) => e.gid), onClick: ungroup }, { label: sel.length && sel.every((e) => e.locked) ? 'Unlock' : 'Lock', onClick: toggleLock },
  ];
  const menus = [
    { label: 'Edit', items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', icon: 'undo', disabled: !lib.canUndo, onClick: () => lib.undo() }, { label: 'Redo', shortcut: 'Ctrl+Y', icon: 'redo', disabled: !lib.canRedo, onClick: () => lib.redo() }, { sep: true },
      { label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', onClick: () => (focusArea.current === 'thumbs' ? copySlides(true) : copyEls(true)) }, { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => (focusArea.current === 'thumbs' ? copySlides(false) : copyEls(false)) }, { label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V', disabled: !clipRef.current, onClick: pasteClip },
      { label: 'Duplicate', shortcut: 'Ctrl+D', onClick: () => (sel.length ? duplicate() : dupSlides()) }, { label: 'Delete', shortcut: 'Del', onClick: () => (sel.length ? delEls() : deleteSlides()) }, { label: 'Select all', shortcut: 'Ctrl+A', onClick: selectAll }, { sep: true },
      { label: 'Find...', icon: 'search', shortcut: 'Ctrl+F', onClick: () => { setFindInit(false); setPanel('find'); } }, { label: 'Find and replace...', shortcut: 'Ctrl+H', onClick: () => { setFindInit(true); setPanel('find'); } },
    ] },
    { label: 'View', items: [
      { label: 'Normal view', checked: view === 'edit', onClick: () => setView('edit') }, { label: 'Slide sorter', icon: 'gridView', checked: view === 'sorter', onClick: () => { commitEditing(); setView('sorter'); } }, { sep: true },
      { label: 'Zoom', children: zoomItems }, { label: 'Speaker notes', checked: showNotes, onClick: () => setShowNotes((s) => !s) }, { label: 'Format panel', checked: !!panel && panel === 'format', onClick: () => setPanel((p) => (p === 'format' ? null : 'format')) }, { sep: true },
      { label: 'Grid', checked: grid, onClick: () => setGrid((g) => !g) }, { label: 'Snap to grid', checked: gridSnap, onClick: () => setGridSnap((g) => !g) }, { label: 'Smart guides', checked: snap, onClick: () => setSnap((g) => !g) }, { sep: true },
      { label: 'Present from start', icon: 'play', shortcut: 'F5', onClick: () => startPresent(0) }, { label: 'Present from this slide', shortcut: 'Shift+F5', onClick: () => startPresent(si) }, { label: 'Presenter view (with notes)', onClick: () => startPresent(si, true) },
    ] },
    { label: 'Insert', items: [
      { label: 'New slide', icon: 'plus', shortcut: 'Ctrl+M', onClick: () => addSlide() }, { label: 'Duplicate slide', onClick: () => dupSlides() }, { sep: true },
      { label: 'Text box', icon: 'textT', onClick: insertText }, { label: 'Image...', icon: 'image', onClick: pickImage }, { label: 'Table...', icon: 'table', onClick: insertTableDlg },
      { label: 'Chart', icon: 'chartBar', children: [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['doughnut', 'Doughnut']].map(([t, l]) => ({ label: l, onClick: () => insertChart(t) })) },
      { label: 'Shape', icon: 'square', children: [['rect', 'Rectangle'], ['roundRect', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['star5', 'Star'], ['arrowRight', 'Arrow'], ['callout', 'Speech bubble'], ['hexagon', 'Hexagon']].map(([s, l]) => ({ label: l, onClick: () => insertShape(s) })) },
      { label: 'Line', icon: 'line', onClick: () => insertLine('line') }, { label: 'Arrow', icon: 'arrowShape', onClick: () => insertLine('arrow') }, { sep: true },
      { label: 'Link...', icon: 'link', shortcut: 'Ctrl+K', onClick: insertLinkCmd }, { label: 'Slide numbers', checked: !!(deck.footer && deck.footer.num), onClick: () => setFooter({ num: !(deck.footer && deck.footer.num) }) },
    ] },
    { label: 'Format', items: [
      { label: 'Bold', shortcut: 'Ctrl+B', checked: !!cur.b, onClick: () => toggleFmt('b') }, { label: 'Italic', shortcut: 'Ctrl+I', checked: !!cur.i, onClick: () => toggleFmt('i') }, { label: 'Underline', shortcut: 'Ctrl+U', checked: !!cur.u, onClick: () => toggleFmt('u') }, { label: 'Strikethrough', checked: !!cur.s, onClick: () => toggleFmt('s') },
      { label: 'Superscript', onClick: () => setSupSub('sup') }, { label: 'Subscript', onClick: () => setSupSub('sub') }, { sep: true },
      { label: 'Align left', onClick: () => setTx({ al: 'left' }) }, { label: 'Align centre', onClick: () => setTx({ al: 'center' }) }, { label: 'Align right', onClick: () => setTx({ al: 'right' }) }, { label: 'Justify', onClick: () => setTx({ al: 'just' }) }, { sep: true },
      { label: 'Bulleted list', onClick: () => setBullet('dot') }, { label: 'Numbered list', onClick: () => setBullet('num') }, { label: 'Increase indent', onClick: () => indent(1) }, { label: 'Decrease indent', onClick: () => indent(-1) }, { sep: true },
      { label: 'UPPER CASE', onClick: () => caseChange('upper') }, { label: 'lower case', onClick: () => caseChange('lower') }, { label: 'Title Case', onClick: () => caseChange('title') }, { label: 'Clear formatting', icon: 'eraser', onClick: clearFormat },
    ] },
    { label: 'Slide', items: [
      { label: 'New slide', shortcut: 'Ctrl+M', onClick: () => addSlide() },
      { label: 'New slide with layout', children: LAYOUTS.map((l) => ({ label: l.name, onClick: () => addSlide(l.id) })) },
      { label: 'Apply layout', children: LAYOUTS.map((l) => ({ label: l.name, checked: slide.layout === l.id, onClick: () => applyLayoutTo(l.id) })) }, { sep: true },
      { label: 'Duplicate slide', onClick: () => dupSlides() }, { label: 'Delete slide', onClick: () => deleteSlides() }, { label: slide.hidden ? 'Include in presentation' : 'Skip slide', onClick: () => toggleSkip() }, { sep: true },
      { label: 'Move up', shortcut: 'Ctrl+Shift+Up', onClick: () => moveSelSlides('up') }, { label: 'Move down', shortcut: 'Ctrl+Shift+Down', onClick: () => moveSelSlides('down') }, { label: 'Move to start', onClick: () => moveSelSlides('top') }, { label: 'Move to end', onClick: () => moveSelSlides('bottom') }, { sep: true },
      { label: 'Background…', onClick: () => { setPanel('format'); setTab('slide'); } }, { label: 'Transition…', onClick: () => { setPanel('format'); setTab('slide'); } }, { label: 'Theme…', onClick: () => { setPanel('format'); setTab('theme'); } },
    ] },
    { label: 'Arrange', items: arrangeItems },
  ];

  /* ---------- toolbar ---------- */
  const fontOpts = [{ value: '@head', label: `Heading (${th.head})` }, { value: '@body', label: `Body (${th.body})` }, ...FONTS.map((f) => ({ value: f, label: f }))];
  const curFont = cur.f && cur.f[0] === '@' ? cur.f : FONTS.find((f) => f.toLowerCase() === String(cur.f).toLowerCase()) || (cur.f === th.head ? '@head' : cur.f === th.body ? '@body' : cur.f);
  const hasTextSel = !!first || !!editing;
  const toolbar = (
    <div className="stool" data-keepedit>
      <Btn icon="undo" title="Undo (Ctrl+Z)" disabled={!lib.canUndo} onClick={() => lib.undo()} /><Btn icon="redo" title="Redo (Ctrl+Y)" disabled={!lib.canRedo} onClick={() => lib.redo()} /><Btn icon="printer" title="Print (Ctrl+P)" onClick={doPrint} />
      <Sep />
      <Btn icon="plus" title="New slide (Ctrl+M)" onClick={() => addSlide()} />
      <Drop icon="layout" title="Layout" label="Layout" panelClass="layoutdrop">{({ close }) => <MenuList close={close} items={LAYOUTS.map((l) => ({ label: l.name, checked: slide.layout === l.id, onClick: () => applyLayoutTo(l.id) }))} />}</Drop>
      <Sep />
      <Btn icon="textT" title="Text box" onClick={insertText} />
      <Btn icon="image" title="Insert image" onClick={pickImage} />
      <Drop icon="square" title="Shapes and lines" panelClass="galpanel">{({ close }) => <ShapeGallery th={th} onPick={(p) => { close(); if (p.kind === 'shape') insertShape(p.shape); else insertLine(p.kind); }} />}</Drop>
      <Btn icon="table" title="Insert table" onClick={insertTableDlg} />
      <Drop icon="chartBar" title="Insert chart">{({ close }) => <MenuList close={close} items={[['column', 'Column chart'], ['bar', 'Bar chart'], ['line', 'Line chart'], ['area', 'Area chart'], ['pie', 'Pie chart'], ['doughnut', 'Doughnut chart']].map(([t, l]) => ({ label: l, onClick: () => insertChart(t) }))} />}</Drop>
      <Drop icon="star" title="Emoji and symbols" panelClass="emojipanel">{({ close }) => <div className="emojigrid">{EMOJI.map((c) => <button key={c} onClick={() => { insertEmoji(c); close(); }}>{c}</button>)}</div>}</Drop>
      <Btn icon="link" title="Link (Ctrl+K)" onClick={insertLinkCmd} />
      <Sep />
      <Sel title="Font" value={curFont} width={128} onChange={(v) => hasTextSel && setTx({ f: v })} options={fontOpts} />
      <Stepper title="Font size" value={Math.round(cur.sz)} min={6} max={400} step={1} width={44} onChange={(v) => hasTextSel && setTx({ sz: v })} />
      <Btn icon="bold" title="Bold (Ctrl+B)" active={!!cur.b} onClick={() => toggleFmt('b')} /><Btn icon="italic" title="Italic (Ctrl+I)" active={!!cur.i} onClick={() => toggleFmt('i')} /><Btn icon="underline" title="Underline (Ctrl+U)" active={!!cur.u} onClick={() => toggleFmt('u')} /><Btn icon="strike" title="Strikethrough" active={!!cur.s} onClick={() => toggleFmt('s')} />
      <ColorPick icon="textColor" title="Text colour" th={th} value={cur.c} onPick={(c) => setTx({ c })} bar />
      <ColorPick icon="highlight" title="Highlight" th={th} value={null} none="No highlight" onPick={(c) => setHighlight(c)} bar />
      <Sep />
      <Btn icon="alignLeft" title="Align left" active={cur.al === 'left'} onClick={() => setTx({ al: 'left' })} /><Btn icon="alignCenter" title="Centre" active={cur.al === 'center'} onClick={() => setTx({ al: 'center' })} /><Btn icon="alignRight" title="Align right" active={cur.al === 'right'} onClick={() => setTx({ al: 'right' })} /><Btn icon="justify" title="Justify" active={cur.al === 'just' || cur.al === 'justify'} onClick={() => setTx({ al: 'just' })} />
      <Btn icon="listBullet" title="Bulleted list" active={cur.bul === 'dot'} onClick={() => setBullet('dot')} /><Btn icon="listNumber" title="Numbered list" active={cur.bul === 'num'} onClick={() => setBullet('num')} />
      <Btn icon="outdent" title="Decrease indent" onClick={() => indent(-1)} /><Btn icon="indent" title="Increase indent" onClick={() => indent(1)} />
      <Drop icon="rows" title="Line spacing">{({ close }) => <MenuList close={close} items={[1, 1.15, 1.5, 2, 2.5].map((v) => ({ label: String(v), onClick: () => setLineSpacing(v) }))} />}</Drop>
      <Sep />
      <ColorPick icon="fillColor" title="Fill colour" th={th} value={first && first.fill && first.fill.t === 'solid' ? first.fill.c : null} none="No fill" onPick={(c) => sel.some((e) => e.type === 'shape' || e.type === 'text') && upd(sel.filter((e) => e.type === 'shape' || e.type === 'text').map((e) => e.id), { fill: c ? { t: 'solid', c } : null })} bar />
      <ColorPick icon="borders" title="Line colour" th={th} value={first && first.stroke ? first.stroke.c : null} none="No line" onPick={(c) => sel.length && upd(sel.filter((e) => e.type !== 'table' && e.type !== 'chart').map((e) => e.id), (e) => ({ stroke: c ? { ...(e.stroke || { w: 2, dash: 'solid' }), c } : null }))} bar />
      <Drop icon="alignL" title="Arrange">{({ close }) => <div className="arrpanel"><MenuList close={close} items={arrangeItems.flatMap((it) => (it.children ? [{ sep: true }, ...it.children.map((c) => ({ ...c, label: `${it.label}: ${c.label}` }))] : [it]))} /></div>}</Drop>
      <Sep />
      <Drop icon="palette" title="Theme" label="Theme" panelClass="themedrop">{({ close }) => <div className="themegrid small">{THEMES.map((t) => <button key={t.id} className={'themecard' + (th.id === t.id ? ' on' : '')} onClick={() => { setTheme(t); close(); }} title={t.name}><span className="tcprev" style={{ background: t.bg, color: t.text, fontFamily: fontStack(t.head) }}><b>Aa</b><span className="tcdots">{t.a.slice(0, 4).map((c) => <i key={c} style={{ background: c }} />)}</span></span><span className="tcname">{t.name}</span></button>)}</div>}</Drop>
      <Btn icon="sliders" title="Format panel" active={panel === 'format'} onClick={() => setPanel((p) => (p === 'format' ? null : 'format'))} />
    </div>
  );

  const actions = (
    <>
      <button className="btn" onClick={() => startPresent(si, true)} title="Presenter view with notes"><Icon name="note" size={15} /> Notes</button>
      <button className="btn primary" onClick={() => startPresent(0)} title="Present from start (F5)"><Icon name="play" size={15} /> Present</button>
    </>
  );

  const rightPanel = panel === 'find'
    ? <FindPanel key={String(findInit)} deck={deck} onGo={goMatch} onReplaceAll={replaceAll} onClose={() => setPanel(null)} initialReplace={findInit} />
    : panel === 'format' ? <FormatPanel api={api} deck={deck} slide={slide} si={si} sel={sel} /> : null;

  const printSlides = printMode ? deck.slides.map((s, i) => ({ s, i })).filter((x) => printMode.hidden || !x.s.hidden) : [];

  return (
    <AppChrome name="Techomato Slides" icon="📽️" noun="presentation" lib={lib} menus={menus} fileItems={fileItems} templates={SLIDE_TEMPLATES} shortcuts={SHORTCUTS} toolbar={toolbar} actions={actions} rightPanel={rightPanel}>
      <style>{SLIDE_CSS}</style>
      <div className={'slidesapp no-print' + (view === 'sorter' ? ' sortmode' : '')}>
        <div className="thumbs" aria-label="Slides" tabIndex={-1} onFocusCapture={() => { focusArea.current = 'thumbs'; }}>
          <ThumbList deck={deck} si={si} selSlides={selSlides} onPick={gotoSlide} onMove={moveSlide} onContext={(e, i) => { if (!selSlides.includes(i)) gotoSlide(i); openCtx(e, slideMenu(i)); }} onAdd={() => addSlide()} />
        </div>
        <div className="center" onFocusCapture={() => { focusArea.current = 'stage'; }}>
          {view === 'sorter' ? (
            <div className="sorterwrap"><Sorter deck={deck} sel={selSlides} active={si} onPick={(i, ev) => (i === null ? setSelSlides([si]) : gotoSlide(i, ev))} onMove={moveSlide} onContext={(e, i) => { if (!selSlides.includes(i)) gotoSlide(i); openCtx(e, slideMenu(i)); }} onOpen={(i) => { if (i < 0) addSlide(); else { gotoSlide(i); setView('edit'); } }} /></div>
          ) : (
            <div className="stagearea" ref={areaRef} data-stagearea>
              <Stage ref={stageRef} deck={deck} slide={slide} si={si} scale={scale} sel={selIds} editing={editing} editCell={editCell} showGrid={grid} snapOn={snap} gridSnap={gridSnap}
                onSelect={select} onPatch={patchMany} onMoveStart={() => {}}
                onEditText={(id) => { const e = slide.els.find((x) => x.id === id); if (e && !e.locked) { setEditing(id); setSelIds([id]); } }}
                onEditCell={(id, r, c) => { setEditCell({ id, r, c }); setTcell({ id, r, c }); setSelIds([id]); setTab('format'); }}
                onChartEdit={editChart} onContext={(e, id) => openCtx(e, id ? elMenu() : stageMenu())} onDropFiles={insertImages} handlers={handlers} />
            </div>
          )}
          {view !== 'sorter' && showNotes && (
            <div className="notesbox">
              <textarea placeholder="Click to add speaker notes" value={slide.notes || ''} onChange={(e) => setSlide({ notes: e.target.value }, { coalesce: 'notes' + si })} aria-label="Speaker notes" />
            </div>
          )}
          <div className="sstatus">
            <span>Slide {si + 1} of {deck.slides.length}{slide.hidden ? ' (skipped)' : ''}</span>
            <span className="grow" />
            <button className={'link' + (showNotes ? ' on' : '')} onClick={() => setShowNotes((s) => !s)}>Notes</button>
            <button className={'link' + (view === 'sorter' ? ' on' : '')} onClick={() => setView((v) => (v === 'sorter' ? 'edit' : 'sorter'))}>Sorter</button>
            <button className={'link' + (grid ? ' on' : '')} onClick={() => setGrid((g) => !g)}>Grid</button>
            <button className={'link' + (snap ? ' on' : '')} onClick={() => setSnap((g) => !g)}>Guides</button>
            <button className="link" onClick={() => setZoom((z) => clamp(Math.round(((z === 'fit' ? scale : z) - 0.1) * 10) / 10, 0.2, 3))} aria-label="Zoom out">−</button>
            <select value={zoom === 'fit' ? 'fit' : String(zoom)} onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))} aria-label="Zoom">
              <option value="fit">Fit ({Math.round(scale * 100)}%)</option>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
            </select>
            <button className="link" onClick={() => setZoom((z) => clamp(Math.round(((z === 'fit' ? scale : z) + 0.1) * 10) / 10, 0.2, 3))} aria-label="Zoom in">+</button>
          </div>
        </div>
      </div>

      {printMode && (
        <div className={'print-only print-root print-slides pm-' + printMode.mode} aria-hidden="true">
          <style>{printMode.mode === 'slides' ? '@page{size:960px 540px;margin:0}' : '@page{size:A4 portrait;margin:12mm}'}</style>
          {printMode.mode === 'handout'
            ? Array.from({ length: Math.ceil(printSlides.length / 6) }, (_, p) => (
              <div className="print-page handout" key={p}>{printSlides.slice(p * 6, p * 6 + 6).map(({ s, i }) => <div key={s.id} className="ho-cell"><SlideView slide={s} deck={deck} index={i} scale={0.35} mode="present" /></div>)}</div>
            ))
            : printSlides.map(({ s, i }) => (
              <div className={'print-slide' + (printMode.mode === 'notes' ? ' withnotes' : '')} key={s.id}>
                <SlideView slide={s} deck={deck} index={i} scale={printMode.mode === 'notes' ? 0.7 : 1} mode="present" />
                {printMode.mode === 'notes' && <div className="print-notes"><h4>Notes - slide {i + 1}</h4><p>{s.notes || ''}</p></div>}
              </div>
            ))}
        </div>
      )}
      {present && <Presenter deck={deck} start={present.start} withNotes={present.notes} onExit={() => setPresent(null)} />}
      {ctx && <CtxMenu ctx={ctx} close={() => setCtx(null)} />}
    </AppChrome>
  );
}

/* ---------- slide thumbnails ---------- */
function ThumbList({ deck, si, selSlides, onPick, onMove, onContext, onAdd }) {
  const [drag, setDrag] = useState(null); const [over, setOver] = useState(null);
  const listRef = useRef(null);
  useEffect(() => { const n = listRef.current && listRef.current.querySelector('.thumb.cur'); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' }); }, [si]);
  return (
    <div className="thumblist" ref={listRef}>
      {deck.slides.map((s, i) => (
        <div key={s.id} className={'thumb' + (i === si ? ' cur' : '') + (selSlides.includes(i) ? ' on' : '') + (over === i ? ' over' : '') + (over === i && drag !== null && drag < i ? ' after' : '') + (s.hidden ? ' hid' : '')}
          draggable onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'slide'); }} onDragOver={(e) => { if (drag !== null) { e.preventDefault(); setOver(i); } }} onDragEnd={() => { setDrag(null); setOver(null); }}
          onDrop={(e) => { e.preventDefault(); if (drag !== null) onMove(drag, i); setDrag(null); setOver(null); }}
          onClick={(e) => onPick(i, e)} onContextMenu={(e) => { e.preventDefault(); onContext(e, i); }} role="button" tabIndex={0} aria-label={`Slide ${i + 1}`} aria-current={i === si}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i, e); } }}>
          <span className="tn">{i + 1}</span>
          <SlideView slide={s} deck={deck} index={i} scale={0.17} mode="present" />
          {s.hidden && <span className="thid" title="Skipped in presentation"><Icon name="eyeOff" size={12} /></span>}
        </div>
      ))}
      <button className="thumbadd" onClick={onAdd} aria-label="New slide"><Icon name="plus" size={16} /> New slide</button>
    </div>
  );
}
void newSlideId; void layoutById; void bounds; void withGroups; void placeholderEl; void themeById;
