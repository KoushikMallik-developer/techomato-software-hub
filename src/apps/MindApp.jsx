import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, MenuRows, Modal, useToast, useAsk, Swatches } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { downloadFile, pickFile, readAsText, safeName } from '../lib/download.js';
import { uid, BRANCH, THEMES, LAYOUTS, blankMap, kids, root, subtreeIds, depthOf, layout, nodeFill, nodeInk, toSvg, toPng, toOutline, toOpml, fromOutline, fromOpml } from './mindmap/model.js';
import '../styles/mindmap.css';

const sample = () => { const m = fromOutline('Project plan\n- Research\n  - Users\n  - Competitors\n  - Market size\n- Design\n  - Wireframes\n  - Visual style\n- Build\n  - Frontend\n  - Backend\n- Launch\n  - Marketing\n  - Support', 'Project plan'); return m; };
const blank = () => { const m = sample(); return { maps: [m], cur: m.id }; };
const migrate = (d) => (d && Array.isArray(d.maps) && d.maps.length ? { cur: d.maps[0].id, ...d } : blank());
const COLORS = ['', ...BRANCH, '#2b3441'];

export default function MindApp() {
  const [data, setData, meta] = useStore('mindmap', blank, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk();
  const map = data.maps.find((m) => m.id === data.cur) || data.maps[0];
  const nodes = map.nodes; const sel = nodes.find((n) => n.id === map.sel) || root(nodes);
  const [editing, setEditing] = useState(null); const [draft, setDraft] = useState(''); const [dlg, setDlg] = useState(null); const [q, setQ] = useState(''); const [drag, setDrag] = useState(null); const [panel, setPanel] = useState(true);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 }); const svgRef = useRef(null); const wrapRef = useRef(null); const hist = useRef({}); const clip = useRef(null); const fresh = useRef(null); const fitted = useRef(null);
  const th = THEMES[map.theme] || THEMES.light;
  const g = useMemo(() => layout(map), [map]);

  /* history (per map, in memory) */
  const H = () => (hist.current[map.id] ||= { past: [], future: [] });
  const commit = useCallback((fn, { merge } = {}) => setData((d) => { const m = d.maps.find((x) => x.id === d.cur); const next = fn(m); if (next === m) return d; const h = (hist.current[m.id] ||= { past: [], future: [] }); const now = Date.now(); if (!(merge && h.last && now - h.last < 900)) { h.past.push({ nodes: m.nodes, sel: m.sel, layout: m.layout }); if (h.past.length > 100) h.past.shift(); } h.last = merge ? now : 0; h.future = []; return { ...d, maps: d.maps.map((x) => (x.id === m.id ? next : x)) }; }), [setData]);
  const setNodes = (fn, extra, opt) => commit((m) => ({ ...m, nodes: fn(m.nodes), ...(extra || {}) }), opt);
  const patch = (id, p, opt) => setNodes((l) => l.map((n) => (n.id === id ? { ...n, ...p } : n)), null, opt);
  const select = (id) => setData((d) => ({ ...d, maps: d.maps.map((m) => (m.id === d.cur ? { ...m, sel: id } : m)) }));
  const undo = () => { const h = H(); const p = h.past.pop(); if (!p) return; h.future.push({ nodes: map.nodes, sel: map.sel, layout: map.layout }); setData((d) => ({ ...d, maps: d.maps.map((m) => (m.id === d.cur ? { ...m, ...p } : m)) })); h.last = 0; };
  const redo = () => { const h = H(); const p = h.future.pop(); if (!p) return; h.past.push({ nodes: map.nodes, sel: map.sel, layout: map.layout }); setData((d) => ({ ...d, maps: d.maps.map((m) => (m.id === d.cur ? { ...m, ...p } : m)) })); h.last = 0; };
  const upMap = (p) => setData((d) => ({ ...d, maps: d.maps.map((m) => (m.id === d.cur ? { ...m, ...p } : m)) }));

  /* view / fit */
  const fit = useCallback(() => { const w = wrapRef.current; if (!w) return; const r = w.getBoundingClientRect(); const b = g.bbox; if (!isFinite(b.w)) return; const k = Math.min(1.4, Math.max(0.1, Math.min((r.width - 80) / b.w, (r.height - 80) / b.h))); setView({ k, x: r.width / 2 - (b.x + b.w / 2) * k, y: r.height / 2 - (b.y + b.h / 2) * k }); }, [g]);
  useEffect(() => { if (fitted.current !== map.id) { fitted.current = map.id; const t = setTimeout(fit, 30); return () => clearTimeout(t); } return undefined; }, [map.id, fit]);
  const center = (id) => { const it = g.map.get(id); const w = wrapRef.current; if (!it || !w) return; const r = w.getBoundingClientRect(); setView((v) => { const sx = it.x * v.k + v.x, sy = it.y * v.k + v.y; const ex = sx + it.w * v.k, ey = sy + it.h * v.k; if (sx > 40 && ey < r.height - 40 && sy > 40 && ex < r.width - 40) return v; return { ...v, x: r.width / 2 - (it.x + it.w / 2) * v.k, y: r.height / 2 - (it.y + it.h / 2) * v.k }; }); };
  const zoomAt = (f, cx, cy) => setView((v) => { const r = wrapRef.current.getBoundingClientRect(); cx = cx ?? r.width / 2; cy = cy ?? r.height / 2; const k = Math.min(3, Math.max(0.1, v.k * f)); return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }; });
  useEffect(() => { const el = wrapRef.current; if (!el) return undefined; const h = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })); }; el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h); });

  /* editing operations */
  const startEdit = (id, text) => { fresh.current = null; setEditing(id); setDraft(text ?? nodes.find((n) => n.id === id).t); };
  const endEdit = (save = true) => { if (editing && save) { const t = draft.replace(/\s+$/, ''); if (t !== (nodes.find((n) => n.id === editing) || {}).t) { if (fresh.current === editing) { const id = editing; setData((d) => ({ ...d, maps: d.maps.map((m) => (m.id === d.cur ? { ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, t: t || 'Untitled' } : n)) } : m)) })); } else patch(editing, { t: t || 'Untitled' }, { merge: false }); } } setEditing(null); };
  const addChild = (id = sel.id, text = '') => { const n = { id: uid(), p: id, t: text }; commit((m) => { const pn = m.nodes.find((x) => x.id === id); return { ...m, nodes: [...m.nodes.map((x) => (x.id === id && x.c ? { ...x, c: false } : x)), n], sel: n.id }; }); fresh.current = n.id; setEditing(n.id); setDraft(text); return n.id; };
  const addSibling = (id = sel.id, before = false) => { const cur = nodes.find((n) => n.id === id); if (!cur || cur.p === null) return addChild(id); const n = { id: uid(), p: cur.p, t: '' }; commit((m) => { const i = m.nodes.findIndex((x) => x.id === id); const l = [...m.nodes]; l.splice(before ? i : i + 1, 0, n); return { ...m, nodes: l, sel: n.id }; }); fresh.current = n.id; setEditing(n.id); setDraft(''); return n.id; };
  const del = (id = sel.id) => { const n = nodes.find((x) => x.id === id); if (!n || n.p === null) { toast('The central idea cannot be deleted'); return; } const ids = new Set(subtreeIds(nodes, id)); const sibs = kids(nodes, n.p); const i = sibs.findIndex((s) => s.id === id); const next = (sibs[i + 1] || sibs[i - 1] || { id: n.p }).id; setNodes((l) => l.filter((x) => !ids.has(x.id)), { sel: next }); if (ids.size > 1) toast(`Deleted ${ids.size} topics`, { action: { label: 'Undo', onClick: undo } }); };
  const move = (id, dir) => { const n = nodes.find((x) => x.id === id); if (!n || n.p === null) return; const sibs = kids(nodes, n.p); const i = sibs.findIndex((s) => s.id === id); const j = i + dir; if (j < 0 || j >= sibs.length) return; setNodes((l) => { const a = l.filter((x) => x.id !== id); const target = sibs[j].id; const ti = a.findIndex((x) => x.id === target); const out = [...a]; out.splice(dir > 0 ? ti + 1 : ti, 0, n); return out; }); };
  const reparent = (id, to, before) => { if (id === to) return; const ids = new Set(subtreeIds(nodes, id)); if (ids.has(to)) { toast('A topic cannot move inside itself'); return; } setNodes((l) => { const n = l.find((x) => x.id === id); const rest = l.filter((x) => x.id !== id).map((x) => (x.id === to && x.c ? { ...x, c: false } : x)); return [...rest, { ...n, p: to, side: undefined }]; }); };
  const toggle = (id) => patch(id, { c: !nodes.find((n) => n.id === id).c });
  const flip = (id) => { const it = g.map.get(id); if (!it || it.d !== 1) return; patch(id, { side: it.dir > 0 ? 'l' : 'r' }); };
  const copy = (cut) => { const ids = subtreeIds(nodes, sel.id); const set = new Set(ids); clip.current = nodes.filter((n) => set.has(n.id)).map((n) => ({ ...n })); try { navigator.clipboard && navigator.clipboard.writeText(toOutline({ ...map, nodes: [{ ...sel, p: null }, ...nodes.filter((n) => set.has(n.id) && n.id !== sel.id)] })); } catch { /* ignore */ } if (cut) del(sel.id); else toast('Copied'); };
  const paste = async () => { let sub = clip.current; if (!sub) { try { const t = await navigator.clipboard.readText(); const m = fromOutline(t); if (m) sub = m.nodes; } catch { /* ignore */ } } if (!sub || !sub.length) { toast('Nothing to paste'); return; } const idm = {}; sub.forEach((n) => { idm[n.id] = uid(); }); const top = sub[0].id; const added = sub.map((n) => ({ ...n, id: idm[n.id], p: n.id === top ? sel.id : idm[n.p] })); setNodes((l) => [...l.map((x) => (x.id === sel.id && x.c ? { ...x, c: false } : x)), ...added], { sel: idm[top] }); };
  const dup = () => { if (sel.p === null) return; const ids = subtreeIds(nodes, sel.id); const idm = {}; ids.forEach((i) => { idm[i] = uid(); }); const added = nodes.filter((n) => idm[n.id]).map((n) => ({ ...n, id: idm[n.id], p: n.id === sel.id ? sel.p : idm[n.p] })); setNodes((l) => [...l, ...added], { sel: idm[sel.id] }); };
  const navigate = (dirKey) => { const it = g.map.get(sel.id); if (!it) return; const horizontal = map.layout !== 'down'; const parent = it.n.p && g.map.get(it.n.p); const ks = !it.n.c ? kids(nodes, sel.id) : []; const sibs = it.n.p ? kids(nodes, it.n.p).filter((s) => g.map.has(s.id)) : []; const i = sibs.findIndex((s) => s.id === sel.id);
    const toward = (key) => { if (horizontal) { const d = it.dir || 0; if (key === 'ArrowRight') return d >= 0 ? 'child' : 'parent'; if (key === 'ArrowLeft') return d > 0 ? 'parent' : d < 0 ? 'child' : 'child'; } else { if (key === 'ArrowDown') return 'child'; if (key === 'ArrowUp') return 'parent'; } return null; };
    const sibKey = horizontal ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']; let t = null;
    if (dirKey === sibKey[0]) t = sibs[i - 1]; else if (dirKey === sibKey[1]) t = sibs[i + 1]; else { const w = toward(dirKey); if (w === 'child') { if (it.n.p === null && map.layout === 'map') { const c = ks.filter((k) => g.map.get(k.id) && (g.map.get(k.id).dir > 0) === (dirKey === 'ArrowRight')); t = c[0]; } else t = ks[Math.floor((ks.length - 1) / 2)]; } else if (w === 'parent') t = parent && parent.n; }
    if (t) { select(t.id); center(t.id); } };

  /* keyboard */
  useEffect(() => {
    const k = (e) => { if (editing || dlg || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(); } else if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(true); } else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); } else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); }
      else if (mod && e.key === '0') { e.preventDefault(); fit(); } else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(1.2); } else if (mod && e.key === '-') { e.preventDefault(); zoomAt(1 / 1.2); }
      else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(sel.id, -1); } else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(sel.id, 1); }
      else if (e.key === 'Tab') { e.preventDefault(); addChild(); } else if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? addSibling(sel.id, true) : addSibling(); } else if (e.key === 'F2') { e.preventDefault(); startEdit(sel.id); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); } else if (e.key === ' ') { e.preventDefault(); toggle(sel.id); } else if (e.key.startsWith('Arrow')) { e.preventDefault(); navigate(e.key); }
      else if (e.key === '/' && !mod) { e.preventDefault(); document.getElementById('mm-search')?.focus(); } else if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); startEdit(sel.id, e.key); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  /* pointer: pan, node drag */
  const pt = (e) => { const r = wrapRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; };
  const bgDown = (e) => { if (e.button !== 0 && e.button !== 1) return; if (editing) endEdit(); const sx = e.clientX, sy = e.clientY, v0 = view; let moved = false; const mv = (ev) => { moved = true; setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy }); }; const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (!moved) wrapRef.current.focus(); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  const nodeDown = (e, it) => {
    e.stopPropagation(); if (e.button !== 0) return; if (editing && editing !== it.id) endEdit(); select(it.id); const sx = e.clientX, sy = e.clientY; let started = false; let over = null;
    const mv = (ev) => { if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; if (it.n.p === null) return; started = true; const p = pt(ev); over = g.items.find((o) => o.id !== it.id && !subtreeIds(nodes, it.id).includes(o.id) && p.x >= o.x - 6 && p.x <= o.x + o.w + 6 && p.y >= o.y - 6 && p.y <= o.y + o.h + 6) || null; setDrag({ id: it.id, x: p.x, y: p.y, over: over && over.id }); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (started && over) reparent(it.id, over.id); setDrag(null); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  /* maps */
  const newMap = async () => { const n = await ask({ kind: 'prompt', title: 'New mind map', value: 'Untitled map', okText: 'Create' }); if (n == null) return; const m = blankMap(n.trim() || 'Untitled map'); setData((d) => ({ ...d, maps: [...d.maps, m], cur: m.id })); };
  const renameMap = async () => { const n = await ask({ kind: 'prompt', title: 'Rename map', value: map.name, okText: 'Rename' }); if (n && n.trim()) upMap({ name: n.trim() }); };
  const delMap = async () => { if (!(await ask({ kind: 'confirm', title: 'Delete map', message: `Delete "${map.name}"?`, okText: 'Delete', danger: true }))) return; setData((d) => { const rest = d.maps.filter((m) => m.id !== map.id); if (!rest.length) { const m = blankMap(); return { ...d, maps: [m], cur: m.id }; } return { ...d, maps: rest, cur: rest[0].id }; }); };
  const addMap = (m) => { if (!m) { toast('Could not read any topics from that file'); return; } setData((d) => ({ ...d, maps: [...d.maps, m], cur: m.id })); toast(`Imported "${m.name}" (${m.nodes.length} topics)`); };
  const importFile = async () => { const f = await pickFile('.txt,.md,.opml,.xml,.json,text/plain'); if (!f) return; const t = await readAsText(f); const name = f.name.replace(/\.[^.]+$/, ''); try { if (/\.json$/i.test(f.name)) { const o = JSON.parse(t); if (o.kind === 'techomato-mindmap') addMap({ ...o.map, id: uid() }); else throw new Error('x'); } else if (/\.(opml|xml)$/i.test(f.name) || /^\s*<\?xml|^\s*<opml/i.test(t)) addMap(fromOpml(t, name)); else addMap(fromOutline(t, name)); } catch { toast('Could not read that file'); } };
  const exportAs = async (kind) => { const base = safeName(map.name); try { if (kind === 'png') { const b = await toPng(map, 2); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = base + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); } else if (kind === 'svg') downloadFile(base + '.svg', toSvg(map), 'image/svg+xml'); else if (kind === 'md') downloadFile(base + '.md', toOutline(map), 'text/markdown'); else if (kind === 'opml') downloadFile(base + '.opml', toOpml(map), 'text/x-opml'); else if (kind === 'json') downloadFile(base + '.json', JSON.stringify({ kind: 'techomato-mindmap', map }), 'application/json'); } catch { toast('Export failed'); } };

  const matches = useMemo(() => { const s = q.trim().toLowerCase(); return s ? new Set(nodes.filter((n) => (n.t + ' ' + (n.note || '')).toLowerCase().includes(s)).map((n) => n.id)) : null; }, [q, nodes]);
  const eIt = editing && g.map.get(editing);
  const ctrlStyle = (it) => ({ left: it.x * view.k + view.x, top: it.y * view.k + view.y, width: Math.max(80, it.w) * view.k, minHeight: it.h * view.k, fontSize: it.fs * view.k, fontWeight: it.bold ? 700 : 400 });
  const selIt = g.map.get(sel.id);

  return (
    <div className="fx mm" style={{ '--brand': '#c2740f', '--brand-h': '#a05f0b', '--brand-soft': '#fdf1de' }} data-app="mindmap">
      <AppBar id="mindmap" name="Techomato Mind Maps" status={meta.status === 'error' ? 'error' : undefined}
        right={<span className="mm-save">{meta.status === 'saving' ? 'Saving…' : meta.status === 'error' ? 'Not saved' : 'Saved'}</span>}
        backup={{ name: 'mindmap', get: () => data, set: (d) => meta.replace(migrate(d)), blank }} extraMenu={[{ label: 'Import outline, OPML or JSON…', onClick: importFile }, { label: 'Paste an outline…', onClick: () => setDlg('outline') }, { label: 'Keyboard shortcuts', onClick: () => setDlg('keys') }]} />
      <div className="mm-top" role="toolbar" aria-label="Map">
        <select className="fi mm-sel" aria-label="Map" value={map.id} onChange={(e) => setData((d) => ({ ...d, cur: e.target.value }))}>{data.maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <Pop trigger={({ toggle: t }) => <button className="fb sub ico" aria-label="Map actions" onClick={t}><Icon name="more" size={16} /></button>}>{({ close }) => <MenuRows close={close} items={[{ label: 'New map…', onClick: newMap }, { label: 'Rename…', onClick: renameMap }, { label: 'Delete…', onClick: delMap }]} />}</Pop>
        <span className="mm-vs" />
        <button className="fb sub ico" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!H().past.length} onClick={undo}><Icon name="undo" size={16} /></button><button className="fb sub ico" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!H().future.length} onClick={redo}><Icon name="redo" size={16} /></button>
        <span className="mm-vs" />
        <button className="fb" onClick={() => addChild()} title="Add a subtopic (Tab)"><Icon name="plus" size={14} /> Subtopic</button><button className="fb" onClick={() => addSibling()} title="Add a topic at the same level (Enter)">Sibling</button><button className="fb sub" onClick={() => del()} title="Delete (Delete)" aria-label="Delete topic"><Icon name="trash" size={14} /></button>
        <span className="mm-vs" />
        <select className="fi mm-sel sm" aria-label="Layout" value={map.layout} onChange={(e) => commit((m) => ({ ...m, layout: e.target.value }))}>{LAYOUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className="fi mm-sel sm" aria-label="Theme" value={map.theme} onChange={(e) => upMap({ theme: e.target.value })}><option value="light">White</option><option value="soft">Soft grey</option><option value="dark">Dark</option></select>
        <div className="spacer" />
        <input id="mm-search" className="fi mm-search" placeholder="Search topics ( / )" aria-label="Search topics" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches && matches.size) { const ids = [...matches]; const i = ids.indexOf(sel.id); const nx = ids[(i + 1) % ids.length]; select(nx); center(nx); } if (e.key === 'Escape') { setQ(''); e.target.blur(); } }} />
        <button className="fb sub ico" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.2)}><Icon name="minus" size={16} /></button><span className="mm-zoom">{Math.round(view.k * 100)}%</span><button className="fb sub ico" aria-label="Zoom in" onClick={() => zoomAt(1.2)}><Icon name="plus" size={16} /></button><button className="fb sub" onClick={fit}>Fit</button>
        <Pop align="right" trigger={({ toggle: t }) => <button className="fb" onClick={t}><Icon name="download" size={14} /> Export</button>}>{({ close }) => <MenuRows close={close} items={[{ label: 'PNG image', onClick: () => exportAs('png') }, { label: 'SVG vector', onClick: () => exportAs('svg') }, { label: 'Markdown outline', onClick: () => exportAs('md') }, { label: 'OPML (outliner apps)', onClick: () => exportAs('opml') }, { label: 'Techomato map file (.json)', onClick: () => exportAs('json') }]} />}</Pop>
        <button className={'fb sub ico' + (panel ? ' on' : '')} aria-label="Topic panel" aria-pressed={panel} title="Topic panel" onClick={() => setPanel(!panel)}><Icon name="sliders" size={16} /></button>
      </div>
      <div className="mm-body">
        <div className="mm-canvas" ref={wrapRef} tabIndex={0} style={{ background: th.bg }} onPointerDown={bgDown} aria-label="Mind map canvas">
          <svg ref={svgRef} className="mm-svg" width="100%" height="100%">
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {g.edges.map((e) => <path key={e.id} d={e.d} fill="none" stroke={e.color} strokeWidth={e.sw} strokeLinecap="round" opacity={matches && !matches.has(e.id) ? 0.25 : 1} />)}
              {g.items.map((it) => { const fill = nodeFill(it, th), ink = nodeInk(it, th); const on = it.id === sel.id; const dim = matches && !matches.has(it.id); const rx = it.d === 0 ? it.h / 2.4 : 10; const tx = it.x + (it.d === 0 ? 20 : 14) + (it.n.done !== undefined ? 22 : 0); const dropT = drag && drag.over === it.id;
                return (
                  <g key={it.id} className={'mm-node' + (on ? ' sel' : '')} opacity={dim ? 0.3 : 1} onPointerDown={(e) => nodeDown(e, it)} onDoubleClick={(e) => { e.stopPropagation(); startEdit(it.id); }} data-id={it.id}>
                    {on && <rect x={it.x - 4} y={it.y - 4} width={it.w + 8} height={it.h + 8} rx={rx + 3} fill="none" stroke="#2f8fdd" strokeWidth="2.5" />}
                    {matches && matches.has(it.id) && <rect x={it.x - 3} y={it.y - 3} width={it.w + 6} height={it.h + 6} rx={rx + 3} fill="none" stroke="#f5c518" strokeWidth="3" />}
                    <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={rx} fill={fill} stroke={it.d >= 2 ? it.color : 'none'} strokeWidth={1.6} />
                    {dropT && <rect x={it.x - 3} y={it.y - 3} width={it.w + 6} height={it.h + 6} rx={rx + 3} fill="none" stroke="#2e9d4a" strokeWidth="3" strokeDasharray="6 4" />}
                    {it.n.done !== undefined && <g onPointerDown={(e) => e.stopPropagation()} onClick={() => patch(it.id, { done: !it.n.done })} style={{ cursor: 'pointer' }}><rect x={it.x + 10} y={it.y + it.h / 2 - 7} width="14" height="14" rx="3" fill="none" stroke={ink} strokeWidth="1.6" />{it.n.done && <path d={`M${it.x + 13} ${it.y + it.h / 2}l3 3 5-6`} fill="none" stroke={ink} strokeWidth="2" />}</g>}
                    {editing !== it.id && it.lines.map((l, i) => <text key={i} x={tx} y={it.y + (it.d === 0 ? 12 : 8) + it.lh * i + it.fs * 0.98} fontSize={it.fs} fontWeight={it.bold ? 700 : 400} fill={ink} textDecoration={it.n.done ? 'line-through' : undefined} opacity={it.n.done ? 0.6 : 1} style={{ pointerEvents: 'none', userSelect: 'none' }}>{l}</text>)}
                    {it.n.note && <circle cx={it.x + it.w - 14} cy={it.y + it.h / 2} r="4" fill={ink} opacity=".55" />}
                    {it.hasKids && !it.hidden && <circle cx={it.dir < 0 ? it.x - 0 : it.x + it.w} cy={it.y + it.h / 2} r="0" />}
                    {it.hidden > 0 && <g onPointerDown={(e) => e.stopPropagation()} onClick={() => toggle(it.id)} style={{ cursor: 'pointer' }}><circle cx={it.dir < 0 ? it.x - 14 : it.x + it.w + 14} cy={it.y + it.h / 2} r="10" fill={th.bg} stroke={it.color || '#7a8594'} strokeWidth="1.6" /><text x={it.dir < 0 ? it.x - 14 : it.x + it.w + 14} y={it.y + it.h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={th.ink} style={{ pointerEvents: 'none' }}>{it.hidden}</text></g>}
                  </g>);
              })}
              {drag && (() => { const n = nodes.find((x) => x.id === drag.id); return <g pointerEvents="none" opacity=".8"><rect x={drag.x - 40} y={drag.y - 14} width="120" height="28" rx="8" fill="#2f8fdd" /><text x={drag.x - 30} y={drag.y + 5} fontSize="13" fill="#fff">{(n.t || '').slice(0, 16)}</text></g>; })()}
            </g>
          </svg>
          {eIt && <textarea className="mm-edit" style={ctrlStyle(eIt)} autoFocus value={draft} rows={1} aria-label="Edit topic" onFocus={(e) => e.target.setSelectionRange(draft.length, draft.length)} onChange={(e) => setDraft(e.target.value)} onBlur={() => endEdit()} onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const id = editing; endEdit(); setTimeout(() => wrapRef.current && wrapRef.current.focus(), 0); void id; } else if (e.key === 'Escape') { e.preventDefault(); endEdit(false); wrapRef.current.focus(); } else if (e.key === 'Tab') { e.preventDefault(); const id = editing; endEdit(); setTimeout(() => addChild(id), 0); } }} />}
          <div className="mm-hint">Tab: subtopic · Enter: sibling · F2 / double-click: edit · Space: collapse · drag a topic onto another to move it</div>
        </div>
        {panel && (
          <aside className="mm-panel" aria-label="Topic">
            <div className="fx-head">Selected topic</div>
            <div className="mm-t ellip" title={sel.t}>{sel.t || 'Untitled'}</div>
            <div className="mm-btns"><button className="fb sm" onClick={() => startEdit(sel.id)}>Rename</button><button className="fb sm" disabled={!kids(nodes, sel.id).length} onClick={() => toggle(sel.id)}>{sel.c ? 'Expand' : 'Collapse'}</button>{selIt && selIt.d === 1 && map.layout === 'map' && <button className="fb sm" onClick={() => flip(sel.id)}>Other side</button>}</div>
            <div className="mm-btns"><button className="fb sm" disabled={sel.p === null} onClick={() => move(sel.id, -1)}>Move up</button><button className="fb sm" disabled={sel.p === null} onClick={() => move(sel.id, 1)}>Move down</button><button className="fb sm" disabled={sel.p === null} onClick={dup}>Duplicate</button></div>
            <label className="mm-chk"><input type="checkbox" checked={sel.done !== undefined} onChange={(e) => patch(sel.id, { done: e.target.checked ? false : undefined })} /> Show a checkbox</label>
            <div className="fx-head">Branch colour</div>
            <div className="mm-sw">{COLORS.map((c) => <button key={c || 'auto'} className={'mm-swb' + ((sel.col || '') === c ? ' on' : '')} style={{ background: c || 'transparent' }} aria-label={c ? 'Colour ' + c : 'Automatic colour'} title={c || 'Automatic'} onClick={() => patch(sel.id, { col: c || undefined })}>{!c && 'A'}</button>)}</div>
            <div className="fx-head">Notes</div>
            <textarea className="fi mm-note" placeholder="Add a note to this topic…" aria-label="Topic note" value={sel.note || ''} onChange={(e) => patch(sel.id, { note: e.target.value || undefined }, { merge: true })} />
            <div className="mm-stats">{nodes.length} topics · {kids(nodes, sel.id).length} subtopics here · level {depthOf(nodes, sel.id)}</div>
          </aside>
        )}
      </div>
      {dlg === 'outline' && <OutlineDialog onClose={() => setDlg(null)} onMake={(t) => { const m = fromOutline(t, 'Pasted outline'); if (m) { addMap(m); setDlg(null); } else toast('Type at least one line'); }} />}
      {dlg === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setDlg(null)} footer={<button className="fb pri" onClick={() => setDlg(null)}>Close</button>}><div className="fx-kv">{[['Tab', 'Add a subtopic'], ['Enter / Shift+Enter', 'Add a sibling after / before'], ['F2 or type', 'Edit the selected topic'], ['Space', 'Collapse or expand'], ['Arrow keys', 'Move between topics'], ['Alt+↑ / ↓', 'Reorder among siblings'], ['Delete', 'Delete topic and its subtopics'], ['Ctrl+C / X / V', 'Copy, cut, paste a branch'], ['Ctrl+D', 'Duplicate a branch'], ['Ctrl+Z / Y', 'Undo / redo'], ['Ctrl + wheel, Ctrl +/-', 'Zoom'], ['Ctrl+0', 'Fit the map to the window'], ['/', 'Search topics']].flatMap(([a, b]) => [<span key={a} className="mm-kbd">{a}</span>, <span key={b}>{b}</span>])}</div></Modal>}
      {toastNode}{askNode}
    </div>
  );
}
function OutlineDialog({ onClose, onMake }) {
  const [t, setT] = useState('Trip to Japan\n- Flights\n  - Compare prices\n- Hotels\n- Things to see\n  - Kyoto\n  - Tokyo');
  return <Modal title="Create a map from an outline" onClose={onClose} width={520} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onMake(t)}>Create map</button></>}><p className="muted" style={{ marginTop: 0 }}>One topic per line. Indent with two spaces (or use # headings or - bullets) to make subtopics. The first line is the central idea.</p><textarea className="fi" rows={10} style={{ fontFamily: 'ui-monospace, Consolas, monospace' }} value={t} onChange={(e) => setT(e.target.value)} aria-label="Outline" /></Modal>;
}
