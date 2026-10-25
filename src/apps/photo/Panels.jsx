import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Pop, MenuRows, useContextMenu } from '../../components/fxui.jsx';
import { Num, ColorField, Row, PanelBox } from '../../components/studio.jsx';
import { BLENDS, ctxOf, textBox } from './doc.js';
import { ADJUSTMENTS, ADJ_ORDER, curveLut, hexRgb } from './adjust.js';

/* ------------ shared controls form (adjustments + filters) ------------ */
export function ControlsForm({ spec, kind, params, onChange, onCommit }) {
  const set = (patch) => onChange({ ...params, ...patch });
  const ctl = (c, k) => <Num key={k || c.key} label={c.label} value={params[c.key] ?? c.def} min={c.min} max={c.max} step={c.step} onChange={(v) => set({ [c.key]: v })} onCommit={onCommit} />;
  return (
    <div className="pho-form">
      {spec.channels && <Row label="Channel"><select className="stu-sel" aria-label="Channel" value={params.channel || 'rgb'} onChange={(e) => set({ channel: e.target.value })}>{[['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>}
      {spec.curves && <CurvesEditor params={params} onChange={onChange} onCommit={onCommit} />}
      {spec.sections ? spec.sections.map((s, i) => <div key={s} className="pho-sec"><b>{s}</b>{spec.controls.slice(i * 3, i * 3 + 3).map((c) => ctl(c, c.key))}</div>) : spec.controls.map((c) => ctl(c))}
      {(spec.flags || []).map(([k, l]) => <label key={k} className="stu-chk"><input type="checkbox" checked={!!params[k]} onChange={(e) => { set({ [k]: e.target.checked }); onCommit && onCommit(); }} />{l}</label>)}
      {spec.color && <Row label="Colour"><ColorField label="Filter colour" value={params.color || '#ec8a00'} onChange={(v) => set({ color: v })} /></Row>}
      {spec.colors && <Row label="Gradient"><ColorField label="Shadow colour" value={params.from || '#101030'} onChange={(v) => set({ from: v })} /><ColorField label="Highlight colour" value={params.to || '#ffe9b0'} onChange={(v) => set({ to: v })} /></Row>}
      {kind === 'blackWhite' && <>
        <label className="stu-chk"><input type="checkbox" checked={!!params.tint} onChange={(e) => { set({ tint: e.target.checked }); onCommit && onCommit(); }} />Tint</label>
        {params.tint && <Row label="Tint"><ColorField label="Tint colour" value={params.tintColor || '#d8b070'} onChange={(v) => set({ tintColor: v })} /><Num label="Amount" value={params.tintAmt ?? 40} min={0} max={100} onChange={(v) => set({ tintAmt: v })} onCommit={onCommit} /></Row>}
      </>}
      {kind === 'photoFilter' && <label className="stu-chk"><input type="checkbox" checked={params.keepLum !== false} onChange={(e) => { set({ keepLum: e.target.checked }); onCommit && onCommit(); }} />Preserve luminosity</label>}
    </div>
  );
}

/* ------------ curves ------------ */
const drag0 = { current: false };
export function CurvesEditor({ params, onChange, onCommit }) {
  const ch = params.channel || 'rgb'; const pts0 = params.points[ch]; const ptsRef = useRef(pts0); if (!drag0.current) ptsRef.current = pts0; const pts = ptsRef.current; const ref = useRef(null); const drag = useRef(-1); const S = 220;
  const toPt = (e) => { const r = ref.current.getBoundingClientRect(); return [Math.round(Math.min(255, Math.max(0, ((e.clientX - r.left) / r.width) * 255))), Math.round(Math.min(255, Math.max(0, 255 - ((e.clientY - r.top) / r.height) * 255)))]; };
  const setPts = (np) => { ptsRef.current = np; onChange({ ...params, points: { ...params.points, [ch]: np } }); };
  const down = (e) => {
    const pts = ptsRef.current; if (e.button !== 0) return; const [x, y] = toPt(e); let i = pts.findIndex((p) => Math.hypot(p[0] - x, p[1] - y) < 10);
    let np = pts; if (i < 0) { np = [...pts, [x, y]].sort((a, b) => a[0] - b[0]); i = np.findIndex((p) => p[0] === x && p[1] === y); setPts(np); }
    drag.current = i; drag0.current = true; ref.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => { const pts = ptsRef.current; if (drag.current < 0) return; const [x, y] = toPt(e); const i = drag.current; const np = pts.map((p, k) => (k === i ? [i === 0 || i === pts.length - 1 ? p[0] : Math.min(pts[i + 1][0] - 1, Math.max(pts[i - 1][0] + 1, x)), y] : p)); setPts(np); };
  const up = () => { if (drag.current >= 0) { drag.current = -1; drag0.current = false; onCommit && onCommit(); } };
  const del = (e) => { const pts = ptsRef.current; e.preventDefault(); const [x, y] = toPt(e); const i = pts.findIndex((p, k) => k > 0 && k < pts.length - 1 && Math.hypot(p[0] - x, p[1] - y) < 10); if (i > 0) { setPts(pts.filter((_, k) => k !== i)); onCommit && onCommit(); } };
  const lut = curveLut(pts); let path = ''; for (let x = 0; x < 256; x += 4) path += `${x ? 'L' : 'M'}${(x / 255) * S},${S - (lut[x] / 255) * S} `;
  const col = { rgb: '#e8e8ee', r: '#ff5a5a', g: '#5adf6a', b: '#5a9aff' }[ch];
  return (
    <div className="pho-curves">
      <div className="pho-chs" role="group" aria-label="Curve channel">{[['rgb', 'RGB'], ['r', 'R'], ['g', 'G'], ['b', 'B']].map(([v, l]) => <button key={v} type="button" className={'stu-btn' + (ch === v ? ' on' : '')} onClick={() => onChange({ ...params, channel: v })}>{l}</button>)}<span className="spacer" /><button type="button" className="stu-btn" onClick={() => { setPts([[0, 0], [255, 255]]); onCommit && onCommit(); }}>Reset</button></div>
      <svg ref={ref} width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="application" aria-label="Curve editor. Click to add a point, drag to move, right click to remove." onPointerDown={down} onPointerMove={move} onPointerUp={up} onContextMenu={del} className="pho-curve-svg">
        <rect width={S} height={S} fill="#15151a" />
        {[1, 2, 3].map((k) => <g key={k} stroke="#33333b"><line x1={(S * k) / 4} y1="0" x2={(S * k) / 4} y2={S} /><line x1="0" y1={(S * k) / 4} x2={S} y2={(S * k) / 4} /></g>)}
        <line x1="0" y1={S} x2={S} y2="0" stroke="#44444c" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke={col} strokeWidth="1.8" />
        {pts.map((p, i) => <circle key={i} cx={(p[0] / 255) * S} cy={S - (p[1] / 255) * S} r="4.5" fill="#15151a" stroke={col} strokeWidth="1.8" />)}
      </svg>
    </div>
  );
}

/* ------------ layer thumbnails ------------ */
function Thumb({ doc, layer, mask, ver }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c || doc.busy) return; const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    if (mask) { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.save(); g.scale(c.width / doc.w, c.height / doc.h); const t = document.createElement('canvas'); t.width = doc.w; t.height = doc.h; const tg = t.getContext('2d'); tg.fillStyle = '#fff'; tg.fillRect(0, 0, t.width, t.height); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(layer.mask, 0, 0); g.drawImage(t, 0, 0); g.restore(); return; }
    if (layer.type === 'adjust') return;
    const k = Math.min(c.width / doc.w, c.height / doc.h); const w = doc.w * k, h = doc.h * k; g.drawImage(doc.surface(layer), (c.width - w) / 2, (c.height - h) / 2, w, h);
  }, [ver, layer, mask, doc]); // eslint-disable-line
  if (layer.type === 'adjust' && !mask) return <span className="pho-th adj"><Icon name={ADJUSTMENTS[layer.adj?.kind]?.icon || 'adjust'} size={16} /></span>;
  return <canvas ref={ref} className={'pho-th' + (mask ? ' mask' : '')} width={mask ? 30 : 38} height={30} aria-hidden="true" />;
}

/* ------------ layers panel ------------ */
export function LayersPanel({ doc, ver, onAction, onFx }) {
  const [ctxNode, showCtx] = useContextMenu(); const [editing, setEditing] = useState(null); const dragId = useRef(null); const [over, setOver] = useState(null);
  const A = doc.active; const list = [...doc.layers].reverse();
  const live = (patch, label) => { doc.liveSet(() => Object.assign(A, patch)); if (label) doc.liveEnd(label); };
  const adjMenu = ADJ_ORDER.map((k) => ({ label: ADJUSTMENTS[k].label, icon: ADJUSTMENTS[k].icon, onClick: () => onAction('addAdjust', k) }));
  const items = (L) => [
    { label: 'Duplicate layer', icon: 'copy', onClick: () => doc.duplicate(L) }, { label: 'Delete layer', icon: 'trash', onClick: () => doc.remove(L), disabled: doc.layers.length <= 1 },
    { sep: true }, { label: 'Rasterize layer', onClick: () => doc.rasterize(L), disabled: L.type === 'raster' || L.type === 'adjust' },
    { label: L.mask ? 'Delete mask' : 'Add layer mask', onClick: () => (L.mask ? doc.deleteMask(L) : doc.addMask(L, doc.sel ? 'selection' : 'reveal')) }, { label: 'Apply mask', onClick: () => doc.deleteMask(L, true), disabled: !L.mask },
    { label: L.clip ? 'Release clipping mask' : 'Create clipping mask', onClick: () => doc.setProps(L, { clip: !L.clip }, 'Clipping mask') },
    { sep: true }, { label: 'Merge down', icon: 'merge', onClick: () => doc.mergeDown(L) }, { label: 'Merge visible', onClick: () => doc.mergeVisible() }, { label: 'Flatten image', onClick: () => doc.flatten() },
  ];
  return (
    <PanelBox title="Layers" grow id="pho-layers" actions={null}>
      <div className="pho-lhead">
        <select className="stu-sel" aria-label="Blend mode" value={A.blend} disabled={A.type === 'adjust' && false} onChange={(e) => live({ blend: e.target.value }, 'Blend mode')}>{BLENDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <Num label="Opacity" value={A.opacity} min={0} max={100} onChange={(v) => doc.liveSet(() => { A.opacity = v; })} onCommit={() => doc.liveEnd('Layer opacity')} slider={false} />
        <button type="button" className={'stu-ib' + (A.locked ? ' on' : '')} aria-label="Lock layer" aria-pressed={A.locked} title="Lock layer" onClick={() => doc.setProps(A, { locked: !A.locked }, 'Lock layer')}><Icon name={A.locked ? 'lock' : 'unlock'} size={14} /></button>
      </div>
      <ul className="stu-list pho-llist" role="listbox" aria-label="Layers">
        {list.map((L) => (
          <li key={L.id} role="option" aria-selected={L.id === doc.activeId} className={'stu-li pho-layer' + (L.id === doc.activeId ? ' on' : '') + (over === L.id ? ' over' : '') + (L.clip ? ' clip' : '')} draggable onDragStart={() => { dragId.current = L.id; }} onDragOver={(e) => { e.preventDefault(); setOver(L.id); }} onDragLeave={() => setOver(null)} onDrop={() => { setOver(null); const f = doc.layers.find((x) => x.id === dragId.current); if (f && f.id !== L.id) doc.moveTo(f, doc.indexOf(L.id)); }}
            onClick={() => { doc.activeId = L.id; doc.maskEdit = false; doc.touch(); }} onContextMenu={(e) => { doc.activeId = L.id; doc.touch(); showCtx(e, items(L)); }}>
            <button type="button" className="stu-ib" aria-label={(L.visible ? 'Hide ' : 'Show ') + L.name} aria-pressed={L.visible} onClick={(e) => { e.stopPropagation(); doc.setProps(L, { visible: !L.visible }, 'Layer visibility'); }}><Icon name={L.visible ? 'eye' : 'eyeOff'} size={14} /></button>
            <Thumb doc={doc} layer={L} ver={ver} />
            {L.mask && <button type="button" className={'pho-maskbtn' + (L.id === doc.activeId && doc.maskEdit ? ' on' : '')} aria-label={`Edit mask of ${L.name}`} title="Click to edit the mask · Shift-click to disable" onClick={(e) => { e.stopPropagation(); if (e.shiftKey) doc.setProps(L, { maskOn: !L.maskOn }, 'Toggle mask'); else { doc.activeId = L.id; doc.maskEdit = true; doc.touch(); } }}><Thumb doc={doc} layer={L} mask ver={ver} /></button>}
            {editing === L.id
              ? <input className="pho-rename" autoFocus defaultValue={L.name} aria-label="Layer name" onClick={(e) => e.stopPropagation()} onBlur={(e) => { doc.setProps(L, { name: e.target.value || L.name }, 'Rename layer'); setEditing(null); }} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(null); }} />
              : <span className="grow" onDoubleClick={() => setEditing(L.id)} title="Double-click to rename">{L.name}{L.type === 'text' && <Icon name="textT" size={11} />}</span>}
            {hasFx(L) && <button type="button" className="stu-ib" aria-label="Layer styles" title="Layer styles" onClick={(e) => { e.stopPropagation(); onFx(L); }}><Icon name="fxIco" size={13} /></button>}
            {L.locked && <Icon name="lock" size={11} />}
          </li>
        ))}
      </ul>
      <div className="pho-lfoot">
        <button type="button" className="stu-ib" aria-label="New layer" title="New layer" onClick={() => doc.addLayer({ name: `Layer ${doc.layers.length + 1}` })}><Icon name="plus" size={15} /></button>
        <Pop up trigger={({ toggle }) => <button type="button" className="stu-ib" aria-label="New adjustment layer" title="New adjustment layer" onClick={toggle}><Icon name="adjust" size={15} /></button>} width={220}>{({ close }) => <MenuRows items={adjMenu} close={close} />}</Pop>
        <button type="button" className="stu-ib" aria-label="Add layer mask" title="Add layer mask" disabled={!!A.mask} onClick={() => doc.addMask(A, doc.sel ? 'selection' : 'reveal')}><Icon name="mask" size={15} /></button>
        <button type="button" className="stu-ib" aria-label="Layer styles" title="Layer styles" disabled={A.type === 'adjust'} onClick={() => onFx(A)}><Icon name="fxIco" size={15} /></button>
        <span className="spacer" />
        <button type="button" className="stu-ib" aria-label="Duplicate layer" title="Duplicate layer" onClick={() => doc.duplicate()}><Icon name="copy" size={15} /></button>
        <button type="button" className="stu-ib" aria-label="Delete layer" title="Delete layer" disabled={doc.layers.length <= 1} onClick={() => doc.remove()}><Icon name="trash" size={15} /></button>
      </div>
      {ctxNode}
    </PanelBox>
  );
}
const hasFx = (L) => L.style && (L.style.shadow.on || L.style.glow.on || L.style.stroke.on || L.style.overlay.on);

/* ------------ layer styles dialog body ------------ */
export function StyleForm({ style, onChange }) {
  const up = (k, patch) => onChange({ ...style, [k]: { ...style[k], ...patch } });
  const blk = (k, title, body) => <fieldset className="pho-fs"><legend><label className="stu-chk"><input type="checkbox" checked={style[k].on} onChange={(e) => up(k, { on: e.target.checked })} />{title}</label></legend>{style[k].on && body}</fieldset>;
  return (
    <div className="pho-stylef">
      {blk('shadow', 'Drop shadow', <><Row label="Colour"><ColorField label="Shadow colour" value={style.shadow.color} onChange={(v) => up('shadow', { color: v })} /></Row><Num label="Opacity" value={style.shadow.opacity} min={0} max={100} onChange={(v) => up('shadow', { opacity: v })} /><Num label="Angle" value={style.shadow.angle} min={-180} max={180} onChange={(v) => up('shadow', { angle: v })} /><Num label="Distance" value={style.shadow.dist} min={0} max={100} onChange={(v) => up('shadow', { dist: v })} /><Num label="Blur" value={style.shadow.blur} min={0} max={60} onChange={(v) => up('shadow', { blur: v })} /></>)}
      {blk('glow', 'Outer glow', <><Row label="Colour"><ColorField label="Glow colour" value={style.glow.color} onChange={(v) => up('glow', { color: v })} /></Row><Num label="Opacity" value={style.glow.opacity} min={0} max={100} onChange={(v) => up('glow', { opacity: v })} /><Num label="Size" value={style.glow.size} min={1} max={60} onChange={(v) => up('glow', { size: v })} /></>)}
      {blk('stroke', 'Stroke', <><Row label="Colour"><ColorField label="Stroke colour" value={style.stroke.color} onChange={(v) => up('stroke', { color: v })} /></Row><Num label="Size" value={style.stroke.size} min={1} max={40} onChange={(v) => up('stroke', { size: v })} /></>)}
      {blk('overlay', 'Colour overlay', <><Row label="Colour"><ColorField label="Overlay colour" value={style.overlay.color} onChange={(v) => up('overlay', { color: v })} /></Row><Num label="Opacity" value={style.overlay.opacity} min={0} max={100} onChange={(v) => up('overlay', { opacity: v })} /></>)}
    </div>
  );
}

/* ------------ properties panel (adjustment / text / shape) ------------ */
const FONTS = ['Inter, Arial, sans-serif', 'Arial, sans-serif', 'Georgia, serif', '"Times New Roman", serif', '"Courier New", monospace', 'Impact, sans-serif', 'Verdana, sans-serif', '"Comic Sans MS", cursive', 'Trebuchet MS, sans-serif', '"Segoe UI", sans-serif'];
export function PropertiesPanel({ doc }) {
  const L = doc.active; if (!L) return null;
  if (L.type === 'adjust' && L.adj) {
    const spec = ADJUSTMENTS[L.adj.kind];
    return <PanelBox title={`Properties · ${spec.label}`} id="pho-props"><ControlsForm spec={spec} kind={L.adj.kind} params={L.adj.params} onChange={(p) => doc.liveSet(() => { L.adj = { ...L.adj, params: p }; })} onCommit={() => doc.liveEnd(`Adjust ${spec.label}`)} /></PanelBox>;
  }
  if (L.type === 'text') {
    const t = L.text; const set = (patch) => doc.liveSet(() => { L.text = { ...L.text, ...patch }; });
    return (
      <PanelBox title="Properties · Text" id="pho-props">
        <textarea className="pho-ta" aria-label="Text content" rows={2} value={t.str} onChange={(e) => set({ str: e.target.value })} onBlur={() => { doc.liveSet(() => { L.name = (L.text.str.split('\n')[0] || '').slice(0, 20) || 'Text'; }); doc.liveEnd('Edit text'); }} />
        <Row label="Font"><select className="stu-sel" aria-label="Font" value={t.font} onChange={(e) => { set({ font: e.target.value }); doc.liveEnd('Text font'); }}>{FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}</select></Row>
        <Num label="Size" value={t.size} min={6} max={600} onChange={(v) => set({ size: v })} onCommit={() => doc.liveEnd('Text size')} />
        <Row label="Style"><ColorField label="Text colour" value={t.color} onChange={(v) => set({ color: v })} />
          <button type="button" className={'stu-ib' + (t.bold ? ' on' : '')} aria-label="Bold" aria-pressed={t.bold} onClick={() => { set({ bold: !t.bold }); doc.liveEnd('Bold'); }}><Icon name="bold" size={14} /></button>
          <button type="button" className={'stu-ib' + (t.italic ? ' on' : '')} aria-label="Italic" aria-pressed={t.italic} onClick={() => { set({ italic: !t.italic }); doc.liveEnd('Italic'); }}><Icon name="italic" size={14} /></button>
          {['left', 'center', 'right'].map((a) => <button key={a} type="button" className={'stu-ib' + (t.align === a ? ' on' : '')} aria-label={`Align ${a}`} aria-pressed={t.align === a} onClick={() => { set({ align: a }); doc.liveEnd('Text align'); }}><Icon name={'align' + a[0].toUpperCase() + a.slice(1)} size={14} /></button>)}</Row>
        <Num label="Tracking" value={t.track} min={-10} max={60} onChange={(v) => set({ track: v })} onCommit={() => doc.liveEnd('Tracking')} />
        <Num label="Leading" value={t.lineH} min={0.7} max={3} step={0.05} onChange={(v) => set({ lineH: v })} onCommit={() => doc.liveEnd('Leading')} />
      </PanelBox>
    );
  }
  if (L.type === 'shape') {
    const s = L.shape; const set = (patch) => doc.liveSet(() => { L.shape = { ...L.shape, ...patch }; });
    return (
      <PanelBox title="Properties · Shape" id="pho-props">
        <Row label="Shape"><select className="stu-sel" aria-label="Shape kind" value={s.kind} onChange={(e) => { set({ kind: e.target.value }); doc.liveEnd('Shape kind'); }}>{['rect', 'ellipse', 'polygon', 'star', 'line'].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</select></Row>
        <Row label="Fill"><ColorField label="Fill colour" value={s.fill} onChange={(v) => set({ fill: v })} /><label className="stu-chk"><input type="checkbox" checked={s.hasFill !== false} onChange={(e) => { set({ hasFill: e.target.checked }); doc.liveEnd('Shape fill'); }} />On</label></Row>
        <Row label="Stroke"><ColorField label="Stroke colour" value={s.stroke} onChange={(v) => set({ stroke: v })} /></Row>
        <Num label="Stroke W" value={s.sw} min={0} max={80} onChange={(v) => set({ sw: v })} onCommit={() => doc.liveEnd('Stroke width')} />
        {s.kind === 'rect' && <Num label="Radius" value={s.radius} min={0} max={300} onChange={(v) => set({ radius: v })} onCommit={() => doc.liveEnd('Corner radius')} />}
        {(s.kind === 'polygon' || s.kind === 'star') && <Num label="Sides" value={s.sides} min={3} max={20} onChange={(v) => set({ sides: v })} onCommit={() => doc.liveEnd('Sides')} />}
        <div className="stu-grid2"><Num label="W" value={Math.round(s.w)} min={-4000} max={4000} slider={false} onChange={(v) => set({ w: v })} onCommit={() => doc.liveEnd('Shape size')} /><Num label="H" value={Math.round(s.h)} min={-4000} max={4000} slider={false} onChange={(v) => set({ h: v })} onCommit={() => doc.liveEnd('Shape size')} /></div>
      </PanelBox>
    );
  }
  return null;
}

/* ------------ history ------------ */
export function HistoryPanel({ doc }) {
  const items = [{ label: 'Open document' }, ...doc.hist.map((h) => h)];
  const ref = useRef(null); useEffect(() => { const el = ref.current && ref.current.querySelector('.on'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); });
  return (
    <PanelBox title="History" open={false} id="pho-history">
      <ul className="stu-list pho-hist" ref={ref} role="listbox" aria-label="History" style={{ maxHeight: 200 }}>
        {items.map((h, i) => <li key={i} role="option" aria-selected={i === doc.hi} className={'stu-li' + (i === doc.hi ? ' on' : i > doc.hi ? ' future' : '')} onClick={() => doc.jump(i)}>{h.label}</li>)}
      </ul>
    </PanelBox>
  );
}

/* ------------ colour ------------ */
const SWS = ['#000000', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93', '#3a3a3c', '#f2f2f7'];
export function ColorPanel({ fg, bg, setFg, setBg, swap, reset }) {
  const [ch, setCh] = useState('fg'); const cur = ch === 'fg' ? fg : bg; const setCur = ch === 'fg' ? setFg : setBg; const [r, g, b] = hexRgb(cur);
  const toHex = (rr, gg, bb) => '#' + [rr, gg, bb].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  return (
    <PanelBox title="Colour" id="pho-colour">
      <div className="pho-fgbg">
        <div className="pho-sw">
          <button type="button" className={'pho-bgsw' + (ch === 'bg' ? ' on' : '')} style={{ background: bg }} aria-label={`Background colour ${bg}`} onClick={() => setCh('bg')} />
          <button type="button" className={'pho-fgsw' + (ch === 'fg' ? ' on' : '')} style={{ background: fg }} aria-label={`Foreground colour ${fg}`} onClick={() => setCh('fg')} />
        </div>
        <div className="pho-sw-btns"><button type="button" className="stu-ib" aria-label="Swap colours" title="Swap (X)" onClick={swap}><Icon name="swap" size={14} /></button><button type="button" className="stu-ib" aria-label="Default colours" title="Default colours (D)" onClick={reset}><Icon name="circleEmpty" size={14} /></button></div>
        <div className="pho-hex"><input aria-label="Hex colour" className="stu-nv" style={{ width: 76, textAlign: 'left' }} value={cur} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-f]{6}$/i.test(v)) setCur(v.toLowerCase()); }} onBlur={(e) => { if (!/^#[0-9a-f]{6}$/i.test(e.target.value)) e.target.value = cur; }} key={cur} defaultValue={cur} /><ColorField label="Pick colour" value={cur} onChange={setCur} /></div>
      </div>
      <Num label="R" value={r} min={0} max={255} onChange={(v) => setCur(toHex(v, g, b))} />
      <Num label="G" value={g} min={0} max={255} onChange={(v) => setCur(toHex(r, v, b))} />
      <Num label="B" value={b} min={0} max={255} onChange={(v) => setCur(toHex(r, g, v))} />
      <div className="pho-swatches" role="group" aria-label="Swatches">{SWS.map((c) => <button key={c} type="button" style={{ background: c }} aria-label={`Swatch ${c}`} onClick={() => setCur(c)} />)}</div>
    </PanelBox>
  );
}

/* ------------ navigator ------------ */
export function NavigatorPanel({ doc, comp, ver, view, setView, vp }) {
  const ref = useRef(null); const W = 270, H = 130; const k = Math.min(W / doc.w, H / doc.h); const nw = Math.round(doc.w * k), nh = Math.round(doc.h * k);
  useEffect(() => { const c = ref.current; if (!c || !comp || doc.busy) return; const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.drawImage(comp, 0, 0, nw, nh); }, [ver, comp, nw, nh, doc]);
  const vx = Math.max(0, (-view.x / view.z) * k), vy = Math.max(0, (-view.y / view.z) * k), vw = Math.min(nw, (vp.w / view.z) * k), vh = Math.min(nh, (vp.h / view.z) * k);
  const go = (e) => { const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / k), y = ((e.clientY - r.top) / k); setView({ ...view, x: vp.w / 2 - x * view.z, y: vp.h / 2 - y * view.z }); };
  return (
    <PanelBox title="Navigator" id="pho-nav">
      <div className="pho-nav" style={{ width: nw, height: nh }} onPointerDown={(e) => { go(e); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.d = '1'; }} onPointerMove={(e) => { if (e.currentTarget.dataset.d) go(e); }} onPointerUp={(e) => { delete e.currentTarget.dataset.d; }} role="img" aria-label="Navigator">
        <canvas ref={ref} width={nw} height={nh} /><div className="pho-nav-box" style={{ left: vx, top: vy, width: vw, height: vh }} />
      </div>
      <Num label="Zoom %" value={Math.round(view.z * 100)} min={5} max={3200} step={1} slider={false} onChange={(v) => setView({ ...view, z: v / 100 })} />
    </PanelBox>
  );
}

/* ------------ histogram ------------ */
export function HistogramPanel({ doc, comp, ver }) {
  const ref = useRef(null); const [mode, setMode] = useState('rgb');
  useEffect(() => {
    const c = ref.current; if (!c || !comp || doc.busy) return; const t = setTimeout(() => {
      const h = doc.histogram(comp); const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      const series = mode === 'rgb' ? [['r', 'rgba(255,70,70,.55)'], ['g', 'rgba(70,220,90,.55)'], ['b', 'rgba(80,130,255,.55)']] : [['l', 'rgba(220,220,230,.8)']]; const mx = Math.max(1, ...series.flatMap(([k]) => Array.from(h[k].slice(1, 255))));
      g.globalCompositeOperation = 'lighter'; for (const [k, col] of series) { g.fillStyle = col; for (let i = 0; i < 256; i++) { const v = Math.min(1, h[k][i] / mx) * c.height; g.fillRect(i, c.height - v, 1, v); } }
    }, 120); return () => clearTimeout(t);
  }, [ver, comp, mode, doc]);
  return (
    <PanelBox title="Histogram" open={false} id="pho-hist" actions={<select className="stu-sel" aria-label="Histogram channel" value={mode} onChange={(e) => setMode(e.target.value)}><option value="rgb">RGB</option><option value="l">Luminosity</option></select>}>
      <canvas ref={ref} width={256} height={80} className="pho-histc" aria-label="Histogram" />
    </PanelBox>
  );
}
export { ctxOf, textBox };
