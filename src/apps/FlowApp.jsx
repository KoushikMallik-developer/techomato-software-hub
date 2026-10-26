import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, MenuRows, Modal, useToast, useAsk } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { downloadFile, pickFile, readAsText, safeName } from '../lib/download.js';
import { uid, SHAPES, FILLS, STROKES, newNode, blankDiagram, shapePath, nodeSvg, edgeSvg, route, bbox, toSvg, toPng, autoLayout, fromMermaid, toMermaid, fitNode, TEMPLATES, portPt } from './flow/model.js';
import '../styles/flow.css';

const SNAP = 10; const snap = (v, on) => (on ? Math.round(v / SNAP) * SNAP : v);
const starter = () => { const d = fromMermaid(TEMPLATES[0][1], 'Login flow'); return { diagrams: [d], cur: d.id, ui: { grid: true, snap: true, panel: true } }; };
const migrate = (d) => (d && Array.isArray(d.diagrams) && d.diagrams.length ? { cur: d.diagrams[0].id, ...d, ui: { grid: true, snap: true, panel: true, ...(d.ui || {}) } } : starter());
const ShapeIcon = ({ s }) => <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true"><path d={shapePath({ shape: s, x: 2, y: 2, w: 22, h: 14 })} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />{s === 'text' && <text x="13" y="13" textAnchor="middle" fontSize="11" fill="currentColor">T</text>}</svg>;

export default function FlowApp() {
  const [data, setData, meta] = useStore('flow', starter, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk();
  const dg = data.diagrams.find((d) => d.id === data.cur) || data.diagrams[0]; const { ui } = data;
  const [sel, setSel] = useState(new Set()); const [selE, setSelE] = useState(null); const [editing, setEditing] = useState(null); const [draft, setDraft] = useState(''); const [dlg, setDlg] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 }); const [conn, setConn] = useState(null); const [marq, setMarq] = useState(null); const [hover, setHover] = useState(null); const [pan, setPan] = useState(false);
  const wrap = useRef(null); const hist = useRef({}); const clip = useRef(null); const fitted = useRef(null); const spaceDown = useRef(false);
  const setUi = (p) => setData((d) => ({ ...d, ui: { ...d.ui, ...p } }));
  const nm = useMemo(() => new Map(dg.nodes.map((n) => [n.id, n])), [dg.nodes]);

  /* ---- history ---- */
  const H = () => (hist.current[dg.id] ||= { past: [], future: [] });
  const snapshot = () => ({ nodes: dg.nodes, edges: dg.edges });
  const pushHist = () => { const h = H(); h.past.push(snapshot()); if (h.past.length > 100) h.past.shift(); h.future = []; };
  const live = useCallback((fn) => setData((d) => ({ ...d, diagrams: d.diagrams.map((x) => (x.id === d.cur ? fn(x) : x)) })), [setData]);
  const commit = (fn) => { pushHist(); live(fn); };
  const undo = () => { const h = H(); const p = h.past.pop(); if (!p) return; h.future.push(snapshot()); live((x) => ({ ...x, ...p })); setSel(new Set()); setSelE(null); };
  const redo = () => { const h = H(); const p = h.future.pop(); if (!p) return; h.past.push(snapshot()); live((x) => ({ ...x, ...p })); setSel(new Set()); setSelE(null); };

  /* ---- view ---- */
  const fit = useCallback(() => { const w = wrap.current; if (!w) return; const r = w.getBoundingClientRect(); const b = bbox(dg); if (!b.w) { setView({ x: r.width / 2, y: r.height / 2, k: 1 }); return; } const k = Math.min(1.2, Math.max(0.15, Math.min((r.width - 100) / b.w, (r.height - 100) / b.h))); setView({ k, x: r.width / 2 - (b.x + b.w / 2) * k, y: r.height / 2 - (b.y + b.h / 2) * k }); }, [dg]);
  useEffect(() => { if (fitted.current !== dg.id) { fitted.current = dg.id; const t = setTimeout(fit, 30); return () => clearTimeout(t); } return undefined; }, [dg.id, fit]);
  const zoomAt = (f, cx, cy) => setView((v) => { const r = wrap.current.getBoundingClientRect(); cx = cx ?? r.width / 2; cy = cy ?? r.height / 2; const k = Math.min(3, Math.max(0.15, v.k * f)); return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }; });
  useEffect(() => { const el = wrap.current; if (!el) return undefined; const h = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })); }; el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h); });
  const pt = (e) => { const r = wrap.current.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; };
  const centerPt = () => { const r = wrap.current.getBoundingClientRect(); return { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k }; };

  /* ---- editing ops ---- */
  const addNode = (shape, at) => { const c = at || centerPt(); const off = (dg.nodes.length % 6) * 14; const n = newNode(shape, snap(c.x + (at ? 0 : off), ui.snap), snap(c.y + (at ? 0 : off), ui.snap)); commit((x) => ({ ...x, nodes: [...x.nodes, n] })); setSel(new Set([n.id])); setSelE(null); return n; };
  const patchNodes = (ids, p, opt) => { const f = (x) => ({ ...x, nodes: x.nodes.map((n) => (ids.has(n.id) ? fitNode({ ...n, ...(typeof p === 'function' ? p(n) : p) }) : n)) }); opt && opt.live ? live(f) : commit(f); };
  const patchEdge = (id, p) => commit((x) => ({ ...x, edges: x.edges.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
  const delSel = () => { if (selE) { commit((x) => ({ ...x, edges: x.edges.filter((e) => e.id !== selE) })); setSelE(null); return; } if (!sel.size) return; commit((x) => ({ ...x, nodes: x.nodes.filter((n) => !sel.has(n.id)), edges: x.edges.filter((e) => !sel.has(e.from) && !sel.has(e.to)) })); setSel(new Set()); };
  const copy = () => { if (!sel.size) return; clip.current = { nodes: dg.nodes.filter((n) => sel.has(n.id)), edges: dg.edges.filter((e) => sel.has(e.from) && sel.has(e.to)) }; toast('Copied'); };
  const paste = (dx = 30) => { const c = clip.current; if (!c) return; const map = {}; const nn = c.nodes.map((n) => { map[n.id] = uid(); return { ...n, id: map[n.id], x: n.x + dx, y: n.y + dx }; }); const ee = c.edges.map((e) => ({ ...e, id: uid(), from: map[e.from], to: map[e.to] })); commit((x) => ({ ...x, nodes: [...x.nodes, ...nn], edges: [...x.edges, ...ee] })); setSel(new Set(nn.map((n) => n.id))); clip.current = { nodes: nn, edges: ee }; };
  const dup = () => { copy(); paste(); };
  const align = (kind) => { const ns = dg.nodes.filter((n) => sel.has(n.id)); if (ns.length < 2) return; const b = bbox({ nodes: ns }); patchNodes(sel, (n) => ({ l: { x: b.x }, c: { x: Math.round(b.x + b.w / 2 - n.w / 2) }, r: { x: b.x + b.w - n.w }, t: { y: b.y }, m: { y: Math.round(b.y + b.h / 2 - n.h / 2) }, b: { y: b.y + b.h - n.h } }[kind])); };
  const distribute = (axis) => { const ns = dg.nodes.filter((n) => sel.has(n.id)).sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y)); if (ns.length < 3) return; const k = axis === 'x' ? 'x' : 'y', s = axis === 'x' ? 'w' : 'h'; const first = ns[0][k], last = ns[ns.length - 1][k] + ns[ns.length - 1][s]; const total = ns.reduce((a, n) => a + n[s], 0); const gap = (last - first - total) / (ns.length - 1); let pos = first; const m = {}; ns.forEach((n) => { m[n.id] = Math.round(pos); pos += n[s] + gap; }); commit((x) => ({ ...x, nodes: x.nodes.map((n) => (m[n.id] !== undefined ? { ...n, [k]: m[n.id] } : n)) })); };
  const order = (front) => { if (!sel.size) return; commit((x) => { const a = x.nodes.filter((n) => !sel.has(n.id)), b = x.nodes.filter((n) => sel.has(n.id)); return { ...x, nodes: front ? [...a, ...b] : [...b, ...a] }; }); };
  const relayout = (dir) => { commit((x) => autoLayout(x, dir)); setTimeout(fit, 30); };
  const startEdit = (id) => { const n = nm.get(id); if (!n) return; setSel(new Set([id])); setSelE(null); setEditing(id); setDraft(n.text); };
  const endEdit = (save = true) => { if (editing && save) { const n = nm.get(editing); if (n && n.text !== draft) patchNodes(new Set([editing]), { text: draft }); } setEditing(null); };

  /* ---- pointer ---- */
  const hitNode = (p, skip) => { for (let i = dg.nodes.length - 1; i >= 0; i--) { const n = dg.nodes[i]; if (n.id !== skip && p.x >= n.x - 6 && p.x <= n.x + n.w + 6 && p.y >= n.y - 6 && p.y <= n.y + n.h + 6) return n; } return null; };
  const bgDown = (e) => {
    if (e.button === 1 || pan || spaceDown.current) { const sx = e.clientX, sy = e.clientY, v0 = view; const mv = (ev) => setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy }); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return; }
    if (e.button !== 0) return; if (editing) endEdit(); wrap.current.focus(); const p0 = pt(e); const base = e.shiftKey ? new Set(sel) : new Set(); if (!e.shiftKey) { setSel(new Set()); setSelE(null); } let moved = false;
    const mv = (ev) => { const p = pt(ev); if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) * view.k < 4) return; moved = true; const r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) }; setMarq(r); const s = new Set(base); dg.nodes.forEach((n) => { if (n.x < r.x + r.w && n.x + n.w > r.x && n.y < r.y + r.h && n.y + n.h > r.y) s.add(n.id); }); setSel(s); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setMarq(null); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const nodeDown = (e, n) => {
    e.stopPropagation(); if (e.button !== 0) return; if (pan || spaceDown.current) { bgDown(e); return; } if (editing && editing !== n.id) endEdit(); wrap.current.focus(); setSelE(null);
    let ids = sel; if (e.shiftKey) { ids = new Set(sel); ids.has(n.id) ? ids.delete(n.id) : ids.add(n.id); setSel(ids); } else if (!sel.has(n.id)) { ids = new Set([n.id]); setSel(ids); }
    const p0 = pt(e); const start = new Map(dg.nodes.filter((x) => ids.has(x.id)).map((x) => [x.id, { x: x.x, y: x.y }])); let moved = false;
    const mv = (ev) => { const p = pt(ev); let dx = p.x - p0.x, dy = p.y - p0.y; if (!moved) { if (Math.hypot(dx, dy) * view.k < 4) return; moved = true; pushHist(); } live((x) => ({ ...x, nodes: x.nodes.map((q) => { const s = start.get(q.id); return s ? { ...q, x: snap(s.x + dx, ui.snap), y: snap(s.y + dy, ui.snap) } : q; }) })); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const portDown = (e, n, side) => {
    e.stopPropagation(); e.preventDefault(); const from = n.id; setConn({ from, side, x: 0, y: 0, over: null, p0: portPt(n, side) });
    const mv = (ev) => { const p = pt(ev); const over = hitNode(p, from); setConn((c) => ({ ...c, x: p.x, y: p.y, over: over && over.id })); };
    const up = (ev) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); const p = pt(ev); const over = hitNode(p, from); setConn(null);
      if (Math.hypot(p.x - portPt(n, side).x, p.y - portPt(n, side).y) < 8) return;
      if (over) { const ed = { id: uid(), from, to: over.id, label: '', style: 'solid', arrow: 'end', route: 'ortho', fs: side }; commit((x) => ({ ...x, edges: [...x.edges, ed] })); setSelE(ed.id); setSel(new Set()); }
      else { const nn = newNode('process', snap(p.x, ui.snap), snap(p.y, ui.snap), ''); nn.x = snap(p.x - (side === 'l' ? nn.w : side === 'r' ? 0 : nn.w / 2), ui.snap); nn.y = snap(p.y - (side === 't' ? nn.h : side === 'b' ? 0 : nn.h / 2), ui.snap); const ed = { id: uid(), from, to: nn.id, label: '', style: 'solid', arrow: 'end', route: 'ortho' }; commit((x) => ({ ...x, nodes: [...x.nodes, nn], edges: [...x.edges, ed] })); setSel(new Set([nn.id])); setTimeout(() => { setEditing(nn.id); setDraft(''); }, 40); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const resizeDown = (e, n, corner) => {
    e.stopPropagation(); e.preventDefault(); const p0 = pt(e); const o = { ...n }; let started = false;
    const mv = (ev) => { const p = pt(ev); if (!started) { started = true; pushHist(); } let { x, y, w, h } = o; const dx = p.x - p0.x, dy = p.y - p0.y; if (corner.includes('e')) w = o.w + dx; if (corner.includes('s')) h = o.h + dy; if (corner.includes('w')) { w = o.w - dx; x = o.x + dx; } if (corner.includes('n')) { h = o.h - dy; y = o.y + dy; } w = Math.max(40, snap(w, ui.snap)); h = Math.max(28, snap(h, ui.snap)); if (corner.includes('w')) x = o.x + o.w - w; if (corner.includes('n')) y = o.y + o.h - h; live((d) => ({ ...d, nodes: d.nodes.map((q) => (q.id === n.id ? { ...q, x, y, w, h } : q)) })); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  /* ---- keyboard ---- */
  useEffect(() => {
    const k = (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || dlg) return; const mod = e.ctrlKey || e.metaKey;
      if (e.key === ' ') { spaceDown.current = true; if (e.target === wrap.current) e.preventDefault(); return; }
      if (editing) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); } else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(); } else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); } else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); } else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(new Set(dg.nodes.map((n) => n.id))); setSelE(null); }
      else if (mod && e.key === '0') { e.preventDefault(); fit(); } else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(1.2); } else if (mod && e.key === '-') { e.preventDefault(); zoomAt(1 / 1.2); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); } else if ((e.key === 'Enter' || e.key === 'F2') && sel.size === 1) { e.preventDefault(); startEdit([...sel][0]); } else if (e.key === 'Escape') { setSel(new Set()); setSelE(null); }
      else if (e.key.startsWith('Arrow') && sel.size) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0; commit((x) => ({ ...x, nodes: x.nodes.map((n) => (sel.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) })); } };
    const ku = (e) => { if (e.key === ' ') spaceDown.current = false; };
    window.addEventListener('keydown', k); window.addEventListener('keyup', ku); return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', ku); };
  });

  /* ---- diagrams ---- */
  const newDiagram = async () => { const n = await ask({ kind: 'prompt', title: 'New flowchart', value: 'Untitled flowchart', okText: 'Create' }); if (n == null) return; const d = blankDiagram(n.trim() || 'Untitled flowchart'); setData((x) => ({ ...x, diagrams: [...x.diagrams, d], cur: d.id })); setSel(new Set()); };
  const renameDiagram = async () => { const n = await ask({ kind: 'prompt', title: 'Rename flowchart', value: dg.name, okText: 'Rename' }); if (n && n.trim()) live((x) => ({ ...x, name: n.trim() })); };
  const delDiagram = async () => { if (!(await ask({ kind: 'confirm', title: 'Delete flowchart', message: `Delete "${dg.name}"?`, okText: 'Delete', danger: true }))) return; setData((d) => { const rest = d.diagrams.filter((x) => x.id !== dg.id); if (!rest.length) { const b = blankDiagram(); return { ...d, diagrams: [b], cur: b.id }; } return { ...d, diagrams: rest, cur: rest[0].id }; }); };
  const addDiagram = (d) => { if (!d) { toast('Could not read a flowchart from that text'); return false; } setData((x) => ({ ...x, diagrams: [...x.diagrams, d], cur: d.id })); setSel(new Set()); toast(`Created "${d.name}" with ${d.nodes.length} shapes`); return true; };
  const importFile = async () => { const f = await pickFile('.mmd,.md,.txt,.json,text/plain'); if (!f) return; const t = await readAsText(f); try { if (/\.json$/i.test(f.name)) { const o = JSON.parse(t); if (o.kind !== 'techomato-flowchart') throw new Error('x'); addDiagram({ ...o.diagram, id: uid() }); } else addDiagram(fromMermaid(t, f.name.replace(/\.[^.]+$/, ''))); } catch { toast('Could not read that file'); } };
  const exportAs = async (kind) => { const base = safeName(dg.name); try { if (!dg.nodes.length) { toast('The flowchart is empty'); return; } if (kind === 'png') { const b = await toPng(dg, 2); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = base + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); } else if (kind === 'svg') downloadFile(base + '.svg', toSvg(dg), 'image/svg+xml'); else if (kind === 'mmd') downloadFile(base + '.mmd', toMermaid(dg), 'text/plain'); else if (kind === 'json') downloadFile(base + '.json', JSON.stringify({ kind: 'techomato-flowchart', diagram: dg }), 'application/json'); } catch { toast('Export failed'); } };

  /* ---- derived render data ---- */
  const edgeR = useMemo(() => dg.edges.map((e) => { const a = nm.get(e.from), b = nm.get(e.to); if (!a || !b) return null; return { e, ...edgeSvg(e, a, b) }; }).filter(Boolean), [dg.edges, nm]);
  const one = sel.size === 1 ? nm.get([...sel][0]) : null; const edge = selE ? dg.edges.find((e) => e.id === selE) : null; const many = sel.size > 1;
  const eNode = editing && nm.get(editing);
  const SW = ['t', 'r', 'b', 'l'];

  return (
    <div className="fx fl" style={{ '--brand': '#1b6f9e', '--brand-h': '#155a80', '--brand-soft': '#e2f1f9' }} data-app="flow">
      <AppBar id="flow" name="Techomato Flowcharts" status={meta.status === 'error' ? 'error' : undefined} right={<span className="fl-save">{meta.status === 'saving' ? 'Saving…' : meta.status === 'error' ? 'Not saved' : 'Saved'}</span>}
        backup={{ name: 'flow', get: () => data, set: (d) => meta.replace(migrate(d)), blank: starter }} extraMenu={[{ label: 'Open Mermaid or JSON file…', onClick: importFile }, { label: 'Keyboard shortcuts', onClick: () => setDlg('keys') }]} />
      <div className="fl-top" role="toolbar" aria-label="Flowchart">
        <select className="fi fl-sel" aria-label="Flowchart" value={dg.id} onChange={(e) => { setData((d) => ({ ...d, cur: e.target.value })); setSel(new Set()); setSelE(null); }}>{data.diagrams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <Pop trigger={({ toggle }) => <button className="fb sub ico" aria-label="Flowchart actions" onClick={toggle}><Icon name="more" size={16} /></button>}>{({ close }) => <MenuRows close={close} items={[{ label: 'New flowchart…', onClick: newDiagram }, { label: 'From a template…', onClick: () => setDlg('tpl') }, { label: 'From Mermaid text…', onClick: () => setDlg('mermaid') }, { sep: true }, { label: 'Rename…', onClick: renameDiagram }, { label: 'Delete…', onClick: delDiagram }]} />}</Pop>
        <span className="fl-vs" />
        <button className="fb sub ico" aria-label="Undo" disabled={!H().past.length} onClick={undo}><Icon name="undo" size={16} /></button><button className="fb sub ico" aria-label="Redo" disabled={!H().future.length} onClick={redo}><Icon name="redo" size={16} /></button>
        <span className="fl-vs" />
        <Pop trigger={({ toggle }) => <button className="fb" onClick={toggle}>Auto layout <Icon name="chevronDown" size={12} /></button>}>{({ close }) => <MenuRows close={close} items={[{ label: 'Top to bottom', onClick: () => relayout('TB') }, { label: 'Left to right', onClick: () => relayout('LR') }]} />}</Pop>
        <button className={'fb sub' + (ui.snap ? ' on' : '')} aria-pressed={ui.snap} onClick={() => setUi({ snap: !ui.snap })} title="Snap to grid">Snap</button>
        <button className={'fb sub' + (ui.grid ? ' on' : '')} aria-pressed={ui.grid} onClick={() => setUi({ grid: !ui.grid })}>Grid</button>
        <button className={'fb sub ico' + (pan ? ' on' : '')} aria-pressed={pan} aria-label="Pan tool" title="Pan (or hold Space)" onClick={() => setPan(!pan)}><Icon name="hand" size={16} /></button>
        <div className="spacer" />
        <button className="fb sub ico" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.2)}><Icon name="minus" size={16} /></button><span className="fl-zoom">{Math.round(view.k * 100)}%</span><button className="fb sub ico" aria-label="Zoom in" onClick={() => zoomAt(1.2)}><Icon name="plus" size={16} /></button><button className="fb sub" onClick={fit}>Fit</button>
        <Pop align="right" trigger={({ toggle }) => <button className="fb" onClick={toggle}><Icon name="download" size={14} /> Export</button>}>{({ close }) => <MenuRows close={close} items={[{ label: 'PNG image', onClick: () => exportAs('png') }, { label: 'SVG vector', onClick: () => exportAs('svg') }, { label: 'Mermaid text (.mmd)', onClick: () => exportAs('mmd') }, { label: 'Techomato file (.json)', onClick: () => exportAs('json') }]} />}</Pop>
        <button className={'fb sub ico' + (ui.panel ? ' on' : '')} aria-label="Properties" aria-pressed={ui.panel} onClick={() => setUi({ panel: !ui.panel })}><Icon name="sliders" size={16} /></button>
      </div>
      <div className="fl-body">
        <aside className="fl-pal" aria-label="Shapes"><div className="fx-head">Shapes</div>{SHAPES.map(([s, l]) => <button key={s} className="fl-shape" draggable title={l + ' (click or drag onto the page)'} aria-label={'Add ' + l} onClick={() => addNode(s)} onDragStart={(e) => { e.dataTransfer.setData('text/flow-shape', s); e.dataTransfer.effectAllowed = 'copy'; }}><ShapeIcon s={s} /><span>{l}</span></button>)}</aside>
        <div className={'fl-canvas' + (pan ? ' pan' : '') + (ui.grid ? ' grid' : '')} ref={wrap} tabIndex={0} onPointerDown={bgDown} onDragOver={(e) => { if (e.dataTransfer.types.includes('text/flow-shape')) e.preventDefault(); }} onDrop={(e) => { const s = e.dataTransfer.getData('text/flow-shape'); if (s) { e.preventDefault(); addNode(s, pt(e)); } }} aria-label="Flowchart canvas"
          style={{ backgroundSize: `${SNAP * 2 * view.k}px ${SNAP * 2 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
          <svg className="fl-svg" width="100%" height="100%">
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {edgeR.map(({ e, svg, geom }) => <g key={e.id}><g dangerouslySetInnerHTML={{ __html: svg }} />{selE === e.id && <path d={geom.d} fill="none" stroke="#2f8fdd" strokeWidth="6" opacity=".35" pointerEvents="none" />}<path d={geom.d} className="fl-hit" fill="none" stroke="transparent" strokeWidth="14" onPointerDown={(ev) => { ev.stopPropagation(); wrap.current.focus(); setSelE(e.id); setSel(new Set()); }} onDoubleClick={async () => { const v = await ask({ kind: 'prompt', title: 'Connector label', value: e.label || '', okText: 'Set label' }); if (v != null) patchEdge(e.id, { label: v.trim() }); }} /></g>)}
              {dg.nodes.map((n) => { const on = sel.has(n.id); const isOver = conn && conn.over === n.id; return (
                <g key={n.id} className="fl-node" onPointerDown={(e) => nodeDown(e, n)} onDoubleClick={(e) => { e.stopPropagation(); startEdit(n.id); }} onPointerEnter={() => setHover(n.id)} onPointerMove={() => setHover((h) => (h === n.id ? h : n.id))} onPointerLeave={() => setHover((h) => (h === n.id ? null : h))} data-id={n.id}>
                  <rect x={n.x - 8} y={n.y - 8} width={n.w + 16} height={n.h + 16} fill="transparent" />
                  <g dangerouslySetInnerHTML={{ __html: editing === n.id ? nodeSvg({ ...n, text: '' }) : nodeSvg(n) }} pointerEvents="none" />
                  {on && <path d={shapePath(n)} fill="none" stroke="#2f8fdd" strokeWidth="2.6" strokeDasharray={n.shape === 'text' ? '4 3' : undefined} pointerEvents="none" />}
                  {isOver && <path d={shapePath(n)} fill="none" stroke="#2e9d4a" strokeWidth="3.4" pointerEvents="none" />}
                  {(hover === n.id || on) && !editing && !conn && SW.map((s) => { const p = portPt(n, s); return <circle key={s} cx={p.x} cy={p.y} r="5.5" className="fl-port" onPointerDown={(e) => portDown(e, n, s)} />; })}
                  {on && one && !editing && [['nw', n.x, n.y], ['ne', n.x + n.w, n.y], ['sw', n.x, n.y + n.h], ['se', n.x + n.w, n.y + n.h]].map(([c, x, y]) => <rect key={c} className={'fl-h ' + c} x={x - 4.5} y={y - 4.5} width="9" height="9" onPointerDown={(e) => resizeDown(e, n, c)} />)}
                </g>); })}
              {conn && <path d={`M${conn.p0.x} ${conn.p0.y}L${conn.x} ${conn.y}`} stroke="#2f8fdd" strokeWidth="2" strokeDasharray="6 4" fill="none" pointerEvents="none" />}
              {marq && <rect x={marq.x} y={marq.y} width={marq.w} height={marq.h} fill="rgba(47,143,221,.12)" stroke="#2f8fdd" strokeDasharray="4 3" pointerEvents="none" />}
            </g>
          </svg>
          {eNode && <textarea className="fl-edit" autoFocus value={draft} aria-label="Shape text" style={{ left: eNode.x * view.k + view.x, top: eNode.y * view.k + view.y, width: eNode.w * view.k, height: eNode.h * view.k, fontSize: eNode.fs * view.k }} onChange={(e) => setDraft(e.target.value)} onBlur={() => endEdit()} onPointerDown={(e) => e.stopPropagation()} onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); endEdit(); wrap.current.focus(); } else if (e.key === 'Escape') { e.preventDefault(); endEdit(false); wrap.current.focus(); } }} />}
          {!dg.nodes.length && <div className="fl-empty"><h3>Start your flowchart</h3><p>Click a shape on the left, or drag it onto the page. Drag from the dots on a shape to connect it to another.</p><div className="fl-ebtn"><button className="fb pri" onClick={() => setDlg('tpl')}>Use a template</button><button className="fb" onClick={() => setDlg('mermaid')}>Type it as text</button></div></div>}
        </div>
        {ui.panel && (
          <aside className="fl-panel" aria-label="Properties">
            {one ? <>
              <div className="fx-head">Shape</div>
              <label className="fl-lbl">Text<textarea className="fi" rows={3} aria-label="Text" value={one.text} onChange={(e) => patchNodes(sel, { text: e.target.value })} /></label>
              <label className="fl-lbl">Type<select className="fi" aria-label="Shape type" value={one.shape} onChange={(e) => patchNodes(sel, { shape: e.target.value })}>{SHAPES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select></label>
              <div className="fl-two"><label className="fl-lbl">Width<input className="fi" type="number" min="40" value={Math.round(one.w)} onChange={(e) => patchNodes(sel, { w: Math.max(40, +e.target.value || 40) })} /></label><label className="fl-lbl">Height<input className="fi" type="number" min="28" value={Math.round(one.h)} onChange={(e) => patchNodes(sel, { h: Math.max(28, +e.target.value || 28) })} /></label></div>
              <label className="fl-lbl">Font size <b>{one.fs}</b><input type="range" min="10" max="32" value={one.fs} onChange={(e) => patchNodes(sel, { fs: +e.target.value })} /></label>
              <div className="fl-lbl">Fill<div className="fl-sw">{FILLS.map((c) => <button key={c} className={'fl-swb' + (one.fill === c ? ' on' : '')} style={{ background: c }} aria-label={'Fill ' + c} onClick={() => patchNodes(sel, { fill: c })} />)}</div></div>
              <div className="fl-lbl">Outline<div className="fl-sw">{STROKES.map((c) => <button key={c} className={'fl-swb' + (one.stroke === c ? ' on' : '')} style={{ background: c }} aria-label={'Outline ' + c} onClick={() => patchNodes(sel, { stroke: c })} />)}</div></div>
            </> : many ? <>
              <div className="fx-head">{sel.size} shapes selected</div>
              <div className="fl-lbl">Align<div className="fl-btns">{[['l', 'Left'], ['c', 'Centre'], ['r', 'Right'], ['t', 'Top'], ['m', 'Middle'], ['b', 'Bottom']].map(([k, l]) => <button key={k} className="fb sm" onClick={() => align(k)}>{l}</button>)}</div></div>
              <div className="fl-lbl">Distribute<div className="fl-btns"><button className="fb sm" disabled={sel.size < 3} onClick={() => distribute('x')}>Horizontally</button><button className="fb sm" disabled={sel.size < 3} onClick={() => distribute('y')}>Vertically</button></div></div>
              <div className="fl-lbl">Fill<div className="fl-sw">{FILLS.map((c) => <button key={c} className="fl-swb" style={{ background: c }} aria-label={'Fill ' + c} onClick={() => patchNodes(sel, { fill: c })} />)}</div></div>
            </> : edge ? <>
              <div className="fx-head">Connector</div>
              <label className="fl-lbl">Label<input className="fi" aria-label="Connector label" value={edge.label || ''} onChange={(e) => patchEdge(edge.id, { label: e.target.value })} /></label>
              <label className="fl-lbl">Line<select className="fi" aria-label="Line style" value={edge.style || 'solid'} onChange={(e) => patchEdge(edge.id, { style: e.target.value })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="thick">Thick</option></select></label>
              <label className="fl-lbl">Routing<select className="fi" aria-label="Routing" value={edge.route || 'ortho'} onChange={(e) => patchEdge(edge.id, { route: e.target.value })}><option value="ortho">Elbow</option><option value="curve">Curved</option><option value="straight">Straight</option></select></label>
              <label className="fl-lbl">Arrow<select className="fi" aria-label="Arrow" value={edge.arrow || 'end'} onChange={(e) => patchEdge(edge.id, { arrow: e.target.value })}><option value="end">At the end</option><option value="both">Both ends</option><option value="none">None</option></select></label>
              <div className="fl-lbl">Colour<div className="fl-sw">{STROKES.map((c) => <button key={c} className={'fl-swb' + ((edge.color || STROKES[0]) === c ? ' on' : '')} style={{ background: c }} aria-label={'Colour ' + c} onClick={() => patchEdge(edge.id, { color: c })} />)}</div></div>
              <div className="fl-btns"><button className="fb sm" onClick={() => patchEdge(edge.id, { from: edge.to, to: edge.from, fs: edge.ts, ts: edge.fs })}>Reverse direction</button></div>
            </> : <>
              <div className="fx-head">Flowchart</div>
              <div className="fl-note">{dg.nodes.length} shapes, {dg.edges.length} connectors.</div>
              <div className="fl-btns"><button className="fb sm" onClick={() => relayout('TB')}>Tidy top to bottom</button><button className="fb sm" onClick={() => relayout('LR')}>Tidy left to right</button></div>
              <div className="fl-note">Tip: drag from the dots on a shape to connect it. Drop on empty space to create the next step. Double-click a shape or connector to edit its text.</div>
            </>}
            {(sel.size > 0 || edge) && <div className="fl-btns fl-foot">{sel.size > 0 && <><button className="fb sm" onClick={dup}>Duplicate</button><button className="fb sm" onClick={() => order(true)}>Bring to front</button><button className="fb sm" onClick={() => order(false)}>Send to back</button></>}<button className="fb sm danger" onClick={delSel}>Delete</button></div>}
          </aside>
        )}
      </div>
      {dlg === 'tpl' && <Modal title="Start from a template" onClose={() => setDlg(null)} width={520} footer={<button className="fb" onClick={() => setDlg(null)}>Cancel</button>}><div className="fl-tpls">{TEMPLATES.map(([n, src]) => <button key={n} className="fl-tpl" onClick={() => { if (addDiagram(fromMermaid(src, n))) setDlg(null); }}><b>{n}</b><span>{(src.match(/-->/g) || []).length} steps</span></button>)}</div></Modal>}
      {dlg === 'mermaid' && <MermaidDialog onClose={() => setDlg(null)} onMake={(t) => { if (addDiagram(fromMermaid(t, 'Typed flowchart'))) setDlg(null); }} />}
      {dlg === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setDlg(null)} footer={<button className="fb pri" onClick={() => setDlg(null)}>Close</button>}><div className="fx-kv">{[['Double-click', 'Edit the text of a shape or connector'], ['Enter / F2', 'Edit the selected shape'], ['Delete', 'Delete selection'], ['Arrow keys', 'Nudge (Shift = 10 px)'], ['Ctrl+C / V / D', 'Copy, paste, duplicate'], ['Ctrl+A', 'Select all shapes'], ['Ctrl+Z / Y', 'Undo / redo'], ['Space + drag', 'Pan the page'], ['Ctrl + wheel', 'Zoom'], ['Ctrl+0', 'Fit to window']].flatMap(([a, b]) => [<span key={a} className="fl-kbd">{a}</span>, <span key={b}>{b}</span>])}</div></Modal>}
      {toastNode}{askNode}
    </div>
  );
}
function MermaidDialog({ onClose, onMake }) {
  const [t, setT] = useState('flowchart TD\n  A([Start]) --> B{Is it working?}\n  B -->|Yes| C[Ship it]\n  B -->|No| D[Fix it]\n  D --> B');
  return <Modal title="Create a flowchart from text" onClose={onClose} width={560} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onMake(t)}>Create flowchart</button></>}>
    <p className="muted" style={{ marginTop: 0 }}>Uses Mermaid flowchart syntax: <code>A[Box] --&gt; B{'{'}Decision{'}'}</code>, <code>A --&gt;|label| B</code>, <code>([rounded])</code>, <code>[(database)]</code>, <code>[[sub-process]]</code>, <code>-.-&gt;</code> dashed, <code>==&gt;</code> thick. Start with <code>flowchart LR</code> for left-to-right.</p>
    <textarea className="fi" rows={11} style={{ fontFamily: 'ui-monospace, Consolas, monospace' }} value={t} onChange={(e) => setT(e.target.value)} aria-label="Mermaid text" /></Modal>;
}
