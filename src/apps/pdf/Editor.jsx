import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Modal, Swatches } from '../../components/fxui.jsx';
import { pickFile } from '../../lib/download.js';
import { renderPageTo, displaySize, uid } from './engine.js';

const COLORS = ['#000000', '#d13438', '#da3b01', '#ffb900', '#107c10', '#0f6cbd', '#8764b8', '#ffffff'];
const CSS_FONT = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
const TOOLS = [
  ['select', 'select', 'Select / move (V)'], ['text', 'textT', 'Text (T)'], ['highlight', 'highlight', 'Highlight (H)'], ['rect', 'square', 'Rectangle (R)'], ['ellipse', 'circle', 'Ellipse (O)'],
  ['line', 'line', 'Line (L)'], ['arrow', 'arrowShape', 'Arrow (A)'], ['pen', 'pencil', 'Pen (P)'], ['cover', 'eraser', 'White box (W)'], ['image', 'image', 'Image (I)'], ['sign', 'edit', 'Signature (S)'],
];
const mctx = document.createElement('canvas').getContext('2d');
export function textBox(a) {
  mctx.font = `${a.italic ? 'italic ' : ''}${a.bold ? 'bold ' : ''}${a.size}px ${CSS_FONT[a.font] || CSS_FONT.Helvetica}`;
  const lines = String(a.text || '').split('\n'); const w = Math.max(10, ...lines.map((l) => mctx.measureText(l).width)); const h = lines.length * a.size * 1.2;
  return { x: a.align === 'center' ? a.x - w / 2 : a.align === 'right' ? a.x - w : a.x, y: a.y, w, h };
}
const bbox = (a) => {
  if (a.type === 'text') return textBox(a);
  if (a.type === 'line') return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  if (a.type === 'path') { const xs = a.pts.map((p) => p[0]), ys = a.pts.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  return { x: a.x, y: a.y, w: a.w, h: a.h };
};
const moveAnn = (a, dx, dy) => {
  if (a.type === 'line') return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  if (a.type === 'path') return { ...a, pts: a.pts.map((p) => [p[0] + dx, p[1] + dy]) };
  return { ...a, x: a.x + dx, y: a.y + dy };
};

function Shape({ a, sel, onDown, onDbl }) {
  const common = { onPointerDown: onDown, onDoubleClick: onDbl, style: { cursor: 'move' }, 'data-ann': a.id, opacity: a.opacity == null ? 1 : a.opacity };
  if (a.type === 'text') { const lines = String(a.text || '').split('\n'); const anchor = a.align === 'center' ? 'middle' : a.align === 'right' ? 'end' : 'start'; const b = textBox(a);
    return <g {...common}><rect x={b.x - 3} y={b.y - 2} width={b.w + 6} height={b.h + 4} fill="rgba(0,0,0,0.001)" />{lines.map((l, i) => <text key={i} x={a.x} y={a.y + a.size * 0.95 + i * a.size * 1.2} fontSize={a.size} fill={a.color} textAnchor={anchor} fontWeight={a.bold ? 700 : 400} fontStyle={a.italic ? 'italic' : 'normal'} fontFamily={CSS_FONT[a.font] || CSS_FONT.Helvetica} style={{ whiteSpace: 'pre' }}>{l}</text>)}</g>; }
  if (a.type === 'rect' || a.type === 'cover') return <rect {...common} x={a.x} y={a.y} width={a.w} height={a.h} fill={a.type === 'cover' ? '#ffffff' : a.fill || 'rgba(0,0,0,0.001)'} stroke={a.type === 'cover' ? (sel ? '#999' : 'none') : a.stroke === false ? 'none' : a.color} strokeWidth={a.sw} strokeDasharray={a.type === 'cover' && sel ? '4 3' : undefined} />;
  if (a.type === 'highlight') return <rect {...common} x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} style={{ cursor: 'move', mixBlendMode: 'multiply' }} fillOpacity={0.35} opacity={1} />;
  if (a.type === 'ellipse') return <ellipse {...common} cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={Math.abs(a.w / 2)} ry={Math.abs(a.h / 2)} fill={a.fill || 'rgba(0,0,0,0.001)'} stroke={a.stroke === false ? 'none' : a.color} strokeWidth={a.sw} />;
  if (a.type === 'line') { const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1); const L = 10 + a.sw * 2; return <g {...common}><line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="rgba(0,0,0,0.001)" strokeWidth={Math.max(12, a.sw + 8)} /><line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={a.sw} strokeLinecap="round" />{a.arrow && [-1, 1].map((s) => <line key={s} x1={a.x2} y1={a.y2} x2={a.x2 - L * Math.cos(ang + s * 0.45)} y2={a.y2 - L * Math.sin(ang + s * 0.45)} stroke={a.color} strokeWidth={a.sw} strokeLinecap="round" />)}</g>; }
  if (a.type === 'path') return <g {...common}><polyline points={a.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(0,0,0,0.001)" strokeWidth={Math.max(12, a.sw + 8)} /><polyline points={a.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={a.color} strokeWidth={a.sw} strokeLinecap="round" strokeLinejoin="round" /></g>;
  if (a.type === 'image') return <image {...common} href={a.src} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="none" />;
  return null;
}

function SignDialog({ sigs, onSigs, onPick, onClose }) {
  const cv = useRef(null); const [drawn, setDrawn] = useState(false); const [save, setSave] = useState(true); const [color, setColor] = useState('#1b2a6b');
  const down = (e) => { const c = cv.current; const r = c.getBoundingClientRect(); const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = color; let last = [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; g.beginPath(); g.arc(last[0], last[1], 1.4, 0, 7); g.fillStyle = color; g.fill(); setDrawn(true); c.setPointerCapture(e.pointerId);
    const mv = (ev) => { const p = [(ev.clientX - r.left) * c.width / r.width, (ev.clientY - r.top) * c.height / r.height]; g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; }; const up = () => { c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); }; c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); };
  const finish = () => { const c = cv.current; const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } if (x1 <= x0) return; const t = document.createElement('canvas'); t.width = x1 - x0 + 8; t.height = y1 - y0 + 8; t.getContext('2d').drawImage(c, x0 - 4, y0 - 4, t.width, t.height, 0, 0, t.width, t.height); const src = t.toDataURL('image/png'); const sig = { id: uid(), src, w: t.width, h: t.height }; if (save) onSigs([...sigs, sig].slice(-6)); onPick(sig); };
  return (
    <Modal title="Signature" onClose={onClose} width={520} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!drawn} onClick={finish}>Use drawn signature</button></>}>
      {sigs.length > 0 && <><div className="fx-head" style={{ padding: 0 }}>Saved signatures</div><div className="pdf-sigs">{sigs.map((s) => <span key={s.id} className="pdf-sig"><button className="pdf-sigbtn" aria-label="Use saved signature" onClick={() => onPick(s)}><img src={s.src} alt="Saved signature" /></button><button className="fb ico sm sub" aria-label="Delete saved signature" onClick={() => onSigs(sigs.filter((x) => x.id !== s.id))}><Icon name="x" size={12} /></button></span>)}</div></>}
      <div className="fx-head" style={{ padding: '10px 0 4px' }}>Draw a new one</div>
      <canvas ref={cv} width={900} height={300} className="pdf-signcv" aria-label="Signature pad" onPointerDown={down} />
      <div className="pdf-row" style={{ marginTop: 8 }}><span className="muted">Ink</span>{['#1b2a6b', '#000000', '#0f6cbd'].map((c) => <button key={c} className={'fx-color' + (color === c ? ' on' : '')} style={{ background: c }} aria-label={`Ink ${c}`} onClick={() => setColor(c)} />)}<span className="spacer" /><button className="fb sm" onClick={() => { const c = cv.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setDrawn(false); }}>Clear</button><label className="pdf-chk"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Remember on this device</label></div>
    </Modal>
  );
}

export default function Editor({ files, pages, start, onSave, onClose, sigs, onSigs, toast }) {
  const [cur, setCur] = useState(start); const pg = pages[cur]; const file = pg.blank ? null : files.get(pg.fid);
  const [ann, setAnn] = useState(pg.ann || []); const histRef = useRef({ past: [], future: [] }); const [, tick] = useState(0); const hist = histRef.current; const pushPast = (base) => { const h = histRef.current; h.past = [...h.past, base].slice(-80); h.future = []; tick((x) => x + 1); }; const [sel, setSel] = useState(null); const [tool, setTool] = useState('select'); const [zoom, setZoom] = useState(1.25);
  const [style, setStyle] = useState({ color: '#d13438', fill: '', sw: 2, size: 18, font: 'Helvetica', bold: false, italic: false, opacity: 1, align: 'left' });
  const [draft, setDraft] = useState(null); const [signDlg, setSignDlg] = useState(false); const cvRef = useRef(null); const svgRef = useRef(null); const taRef = useRef(null); const lastKey = useRef({ k: '', t: 0 });
  const info = pg.blank ? { w: pg.blank.w, h: pg.blank.h, rot: 0 } : file.info[pg.idx]; const [W, H] = displaySize(info, pg.rot);
  const annRef = useRef(ann); annRef.current = ann; const selRef = useRef(sel); selRef.current = sel;
  /* render the page */
  useEffect(() => { const c = cvRef.current; if (!c) return; if (pg.blank) { c.width = Math.round(W * zoom); c.height = Math.round(H * zoom); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); return; } let dead = false; renderPageTo(file, pg.idx, pg.rot, c, 0, zoom).catch(() => { if (!dead) toast('Could not render this page'); }); return () => { dead = true; }; }, [cur, zoom, pg.rot]); // eslint-disable-line
  const commit = (next, key) => { const now = Date.now(); if (!(key && lastKey.current.k === key && now - lastKey.current.t < 700)) pushPast(annRef.current); lastKey.current = { k: key || '', t: now }; annRef.current = next; setAnn(next); };
  const undo = () => { const h = histRef.current; if (!h.past.length) return; const p = h.past[h.past.length - 1]; h.future = [annRef.current, ...h.future]; h.past = h.past.slice(0, -1); annRef.current = p; setAnn(p); setSel(null); tick((x) => x + 1); };
  const redo = () => { const h = histRef.current; if (!h.future.length) return; const n = h.future[0]; h.past = [...h.past, annRef.current]; h.future = h.future.slice(1); annRef.current = n; setAnn(n); tick((x) => x + 1); };
  const goto = (i) => { if (i < 0 || i >= pages.length || i === cur) return; onSave(cur, annRef.current); const np = pages[i]; setCur(i); setAnn(np.ann || []); annRef.current = np.ann || []; histRef.current = { past: [], future: [] }; setSel(null); };
  const done = () => { onSave(cur, annRef.current); onClose(); };
  const selA = ann.find((a) => a.id === sel) || null;
  const upd = (patch, key) => { const base = patch; setStyle((s) => ({ ...s, ...Object.fromEntries(Object.entries(base).filter(([k]) => k in s)) })); if (selA) commit(annRef.current.map((a) => (a.id === selA.id ? { ...a, ...patch } : a)), key || 'p' + Object.keys(patch).join()); };
  const pt = (e) => { const r = svgRef.current.getBoundingClientRect(); return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom]; };
  const del = () => { if (!selA) return; commit(annRef.current.filter((a) => a.id !== selA.id)); setSel(null); };
  const dup = () => { if (!selA) return; const c = moveAnn({ ...selA, id: uid() }, 12, 12); commit([...annRef.current, c]); setSel(c.id); };
  const order = (front) => { if (!selA) return; const rest = annRef.current.filter((a) => a.id !== selA.id); commit(front ? [...rest, selA] : [selA, ...rest]); };
  const mk = (type, extra) => ({ id: uid(), type, color: style.color, sw: style.sw, opacity: style.opacity, ...extra });

  const startMove = (e, a) => { if (tool !== 'select') return; e.stopPropagation(); setSel(a.id); const p0 = pt(e); let moved = false; const base = annRef.current;
    const mv = (ev) => { const p = pt(ev); const dx = p[0] - p0[0], dy = p[1] - p0[1]; if (!moved && Math.hypot(dx, dy) < 2) return; moved = true; const n = base.map((x) => (x.id === a.id ? moveAnn(a, dx, dy) : x)); annRef.current = n; setAnn(n); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) { pushPast(base); } }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  const startHandle = (e, a, h) => { e.stopPropagation(); const base = annRef.current; const b0 = bbox(a);
    const mv = (ev) => { const p = pt(ev); let n;
      if (a.type === 'line') n = { ...a, ...(h === 'p1' ? { x1: p[0], y1: p[1] } : { x2: p[0], y2: p[1] }) };
      else if (a.type === 'text') { const k = Math.max(0.3, Math.abs(p[0] - b0.x) / Math.max(10, b0.w)); n = { ...a, size: Math.max(6, Math.round(a.size * (h.includes('e') ? k : 1 / Math.max(k, 0.3)) * 10) / 10) }; if (h.includes('w')) n = { ...a, size: Math.max(6, Math.round(a.size * (1 + (b0.x - p[0]) / Math.max(10, b0.w)) * 10) / 10) }; }
      else { let x1 = b0.x, y1 = b0.y, x2 = b0.x + b0.w, y2 = b0.y + b0.h; if (h.includes('w')) x1 = p[0]; if (h.includes('e')) x2 = p[0]; if (h.includes('n')) y1 = p[1]; if (h.includes('s')) y2 = p[1]; if (a.type === 'image' && ev.shiftKey === false) { const ratio = b0.w / b0.h; const w = Math.abs(x2 - x1); const hh = w / ratio; if (h.includes('n')) y1 = y2 - hh; else y2 = y1 + hh; } n = { ...a, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(4, Math.abs(x2 - x1)), h: Math.max(4, Math.abs(y2 - y1)) }; }
      const all = base.map((x) => (x.id === a.id ? n : x)); annRef.current = all; setAnn(all); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); pushPast(base); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };

  const placeImage = (src, w, h, at) => { const k = Math.min(1, 200 / w); const a = mk('image', { src, x: at ? at[0] : W / 2 - (w * k) / 2, y: at ? at[1] : H / 3, w: w * k, h: h * k }); commit([...annRef.current, a]); setSel(a.id); setTool('select'); };
  const addImageFile = async () => { const f = await pickFile('image/*'); if (!f) return; const src = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }); const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }).catch(() => null); if (!im) return toast('Could not read that image'); let url = src; if (!/^data:image\/(png|jpeg)/.test(src)) { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); url = c.toDataURL('image/png'); } placeImage(url, im.naturalWidth, im.naturalHeight); };

  const bgDown = (e) => {
    if (e.button !== 0) return; const p = pt(e);
    if (tool === 'select') { setSel(null); return; }
    if (tool === 'image') { addImageFile(); return; } if (tool === 'sign') { setSignDlg(true); return; }
    if (tool === 'text') { const a = mk('text', { x: p[0], y: p[1], text: 'Text', size: style.size, font: style.font, bold: style.bold, italic: style.italic, align: 'left' }); commit([...annRef.current, a]); setSel(a.id); setTool('select'); setTimeout(() => { if (taRef.current) { taRef.current.focus(); taRef.current.select(); } }, 30); return; }
    const base = annRef.current; let cur2;
    if (tool === 'pen') cur2 = mk('path', { pts: [p] }); else if (tool === 'line' || tool === 'arrow') cur2 = mk('line', { x1: p[0], y1: p[1], x2: p[0], y2: p[1], arrow: tool === 'arrow' }); else cur2 = mk(tool === 'cover' ? 'cover' : tool, { x: p[0], y: p[1], w: 0, h: 0, ...(tool === 'highlight' ? { color: style.color === '#000000' || style.color === '#ffffff' ? '#ffb900' : style.color } : {}), fill: tool === 'rect' || tool === 'ellipse' ? style.fill || undefined : undefined });
    setDraft(cur2); const o = p;
    const mv = (ev) => { const q = pt(ev); if (cur2.type === 'path') cur2 = { ...cur2, pts: [...cur2.pts, q] }; else if (cur2.type === 'line') cur2 = { ...cur2, x2: q[0], y2: q[1] }; else cur2 = { ...cur2, x: Math.min(o[0], q[0]), y: Math.min(o[1], q[1]), w: Math.abs(q[0] - o[0]), h: Math.abs(q[1] - o[1]) }; setDraft(cur2); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setDraft(null); const b = bbox(cur2); if (Math.max(b.w, b.h) < 3 && cur2.type !== 'path') return; if (cur2.type === 'path' && cur2.pts.length < 2) return; const all = [...base, cur2]; pushPast(base); annRef.current = all; setAnn(all); setSel(cur2.id); if (tool !== 'pen') setTool('select'); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    const k = (e) => {
      const t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) { if (e.key === 'Escape') t.blur(); return; } if (document.querySelector('.fx-modal-back')) return; const key = e.key.toLowerCase(); const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && key === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; } if (ctrl && key === 'y') { e.preventDefault(); redo(); return; } if (ctrl && key === 'd') { e.preventDefault(); dup(); return; }
      if (key === 'delete' || key === 'backspace') { e.preventDefault(); del(); return; } if (key === 'escape') { if (selRef.current) setSel(null); else if (tool !== 'select') setTool('select'); else done(); return; }
      if (key.startsWith('arrow') && selRef.current) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; const dx = key === 'arrowleft' ? -s : key === 'arrowright' ? s : 0, dy = key === 'arrowup' ? -s : key === 'arrowdown' ? s : 0; commit(annRef.current.map((a) => (a.id === selRef.current ? moveAnn(a, dx, dy) : a)), 'nudge'); return; }
      if (key === 'pageup') goto(cur - 1); if (key === 'pagedown') goto(cur + 1);
      const m = { v: 'select', t: 'text', h: 'highlight', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', p: 'pen', w: 'cover', i: 'image', s: 'sign' }[key]; if (m && !ctrl) { setTool(m); if (m === 'image' || m === 'sign') { setTool('select'); m === 'image' ? addImageFile() : setSignDlg(true); } }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const handles = (a) => {
    const b = bbox(a); const hs = []; const r = 5 / zoom + 1;
    if (a.type === 'line') return [['p1', a.x1, a.y1], ['p2', a.x2, a.y2]].map(([id, x, y]) => <circle key={id} cx={x} cy={y} r={r + 1} className="pdf-h" onPointerDown={(e) => startHandle(e, a, id)} style={{ cursor: 'crosshair' }} />);
    if (a.type === 'path') return null; if (a.type === 'text') hs.push(['e', b.x + b.w, b.y + b.h / 2]); else hs.push(['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h]);
    return hs.map(([id, x, y]) => <rect key={id} x={x - r} y={y - r} width={r * 2} height={r * 2} className="pdf-h" onPointerDown={(e) => startHandle(e, a, id)} style={{ cursor: id === 'nw' || id === 'se' ? 'nwse-resize' : id === 'e' ? 'ew-resize' : 'nesw-resize' }} />);
  };
  const sb = selA ? bbox(selA) : null;
  const isShape = selA && ['rect', 'ellipse'].includes(selA.type); const isStroke = selA ? ['rect', 'ellipse', 'line', 'path'].includes(selA.type) : ['rect', 'ellipse', 'line', 'arrow', 'pen'].includes(tool);
  const showText = selA ? selA.type === 'text' : tool === 'text';
  const v = (k) => (selA && k in selA ? selA[k] : style[k]);

  return (
    <div className="pdf-ed" role="dialog" aria-label="Edit page">
      <div className="pdf-ed-top">
        <button className="fb pri" onClick={done}><Icon name="check" size={14} />Done</button>
        <span className="pdf-ed-nav"><button className="fb ico sub" aria-label="Previous page" disabled={cur === 0} onClick={() => goto(cur - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {cur + 1} of {pages.length}</span><button className="fb ico sub" aria-label="Next page" disabled={cur === pages.length - 1} onClick={() => goto(cur + 1)}><Icon name="chevronRight" size={16} /></button></span>
        <span className="pdf-vsep" />
        <button className="fb ico sub" aria-label="Undo edit" disabled={!hist.past.length} onClick={undo}><Icon name="undo" size={16} /></button><button className="fb ico sub" aria-label="Redo edit" disabled={!hist.future.length} onClick={redo}><Icon name="redo" size={16} /></button>
        <span className="spacer" />
        <button className="fb ico sub" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}><Icon name="zoomOut" size={16} /></button><span className="pdf-zoom">{Math.round(zoom * 100)}%</span><button className="fb ico sub" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}><Icon name="zoomIn" size={16} /></button>
      </div>
      <div className="pdf-ed-body">
        <div className="pdf-ed-tools" role="toolbar" aria-label="Annotation tools">{TOOLS.map(([k, ic, l]) => <button key={k} className={'fb ico sub' + (tool === k ? ' on' : '')} aria-label={l.replace(/ \(.\)$/, '')} aria-pressed={tool === k} title={l} onClick={() => { if (k === 'image') { addImageFile(); return; } if (k === 'sign') { setSignDlg(true); return; } setTool(k); }}><Icon name={ic} size={17} /></button>)}</div>
        <div className="pdf-ed-scroll" onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div className="pdf-ed-page" style={{ width: W * zoom, height: H * zoom }}>
            <canvas ref={cvRef} aria-label={`Page ${cur + 1}`} style={{ width: W * zoom, height: H * zoom }} />
            <svg ref={svgRef} className={'pdf-ov tool-' + tool} width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`} onPointerDown={bgDown} data-testid="overlay">
              {ann.map((a) => <Shape key={a.id} a={a} sel={a.id === sel} onDown={(e) => startMove(e, a)} onDbl={() => { if (a.type === 'text') setTimeout(() => taRef.current && taRef.current.focus(), 20); }} />)}
              {draft && <Shape a={draft} />}
              {selA && sb && <g pointerEvents="none"><rect x={sb.x - 2} y={sb.y - 2} width={sb.w + 4} height={sb.h + 4} fill="none" stroke="#0f6cbd" strokeWidth={1 / zoom * 1.5} strokeDasharray={`${4 / zoom} ${3 / zoom}`} /></g>}
              {selA && <g>{handles(selA)}</g>}
            </svg>
          </div>
        </div>
        <div className="pdf-ed-props" aria-label="Properties">
          <div className="fx-head" style={{ padding: '0 0 6px' }}>{selA ? ({ text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', line: selA.arrow ? 'Arrow' : 'Line', path: 'Drawing', highlight: 'Highlight', cover: 'White box', image: 'Image' })[selA.type] : TOOLS.find((t) => t[0] === tool)[2].replace(/ \(.\)$/, '') + ' defaults'}</div>
          {showText && <>
            {selA && <textarea ref={taRef} className="fi" rows={3} aria-label="Text content" value={selA.text} onChange={(e) => upd({ text: e.target.value }, 'text')} style={{ height: 'auto', padding: 8 }} />}
            <label className="pdf-lbl">Font<select className="fi" aria-label="Font" value={v('font')} onChange={(e) => upd({ font: e.target.value })}><option>Helvetica</option><option>Times</option><option>Courier</option></select></label>
            <label className="pdf-lbl">Size<input className="fi" type="number" aria-label="Font size" min={6} max={200} value={Math.round(v('size') * 10) / 10} onChange={(e) => upd({ size: Math.max(6, +e.target.value || 12) }, 'size')} /></label>
            <div className="pdf-row"><button className={'fb ico sm' + (v('bold') ? ' on' : '')} aria-label="Bold" aria-pressed={!!v('bold')} onClick={() => upd({ bold: !v('bold') })}><Icon name="bold" size={14} /></button><button className={'fb ico sm' + (v('italic') ? ' on' : '')} aria-label="Italic" aria-pressed={!!v('italic')} onClick={() => upd({ italic: !v('italic') })}><Icon name="italic" size={14} /></button>{['left', 'center', 'right'].map((al) => <button key={al} className={'fb ico sm' + (v('align') === al ? ' on' : '')} aria-label={`Align ${al}`} onClick={() => selA && upd({ align: al })}><Icon name={'align' + al[0].toUpperCase() + al.slice(1)} size={14} /></button>)}</div>
          </>}
          {(selA ? selA.type !== 'image' && selA.type !== 'cover' : tool !== 'select' && tool !== 'cover') && <><div className="pdf-lbl">Colour</div><Swatches value={v('color')} onChange={(c) => upd({ color: c })} colors={COLORS} /><input type="color" className="pdf-color" aria-label="Custom colour" value={/^#[0-9a-f]{6}$/i.test(v('color')) ? v('color') : '#000000'} onChange={(e) => upd({ color: e.target.value }, 'color')} /></>}
          {(isShape || ['rect', 'ellipse'].includes(tool)) && <><div className="pdf-lbl">Fill</div><div className="pdf-row"><button className={'fb sm' + (!v('fill') ? ' on' : '')} onClick={() => upd({ fill: '' })}>None</button>{['#ffffff', '#ffe28a', '#bfe3ff', '#ffc9c9'].map((c) => <button key={c} className={'fx-color' + (v('fill') === c ? ' on' : '')} style={{ background: c }} aria-label={`Fill ${c}`} onClick={() => upd({ fill: c })} />)}</div></>}
          {isStroke && <label className="pdf-lbl">Line width<input type="range" min={1} max={14} aria-label="Line width" value={v('sw')} onChange={(e) => upd({ sw: +e.target.value }, 'sw')} /></label>}
          {selA && selA.type === 'line' && <label className="pdf-chk"><input type="checkbox" checked={!!selA.arrow} onChange={(e) => upd({ arrow: e.target.checked })} /> Arrowhead</label>}
          {selA && selA.type !== 'highlight' && selA.type !== 'cover' && <label className="pdf-lbl">Opacity<input type="range" min={0.1} max={1} step={0.05} aria-label="Opacity" value={selA.opacity == null ? 1 : selA.opacity} onChange={(e) => upd({ opacity: +e.target.value }, 'op')} /></label>}
          {selA && <div className="pdf-row" style={{ flexWrap: 'wrap' }}><button className="fb sm" onClick={dup}><Icon name="copy" size={13} />Duplicate</button><button className="fb sm" onClick={() => order(true)}>To front</button><button className="fb sm" onClick={() => order(false)}>To back</button><button className="fb sm danger" onClick={del}><Icon name="trash" size={13} />Delete</button></div>}
          {tool === 'cover' && !selA && <p className="muted pdf-small">A white box hides content visually. The text underneath stays in the file, so do not use it to remove sensitive information.</p>}
          {!selA && tool === 'select' && <p className="muted pdf-small">Pick a tool on the left, then click or drag on the page. Click an object to move or resize it.</p>}
          <div className="spacer" />
          <p className="muted pdf-small">{ann.length} object{ann.length === 1 ? '' : 's'} on this page</p>
        </div>
      </div>
      {signDlg && <SignDialog sigs={sigs} onSigs={onSigs} onClose={() => setSignDlg(false)} onPick={(s) => { setSignDlg(false); placeImage(s.src, s.w, s.h); }} />}
    </div>
  );
}
