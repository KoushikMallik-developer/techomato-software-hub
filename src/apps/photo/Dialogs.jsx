import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/fxui.jsx';
import { Num, Row, ColorField } from '../../components/studio.jsx';
import { ADJUSTMENTS, adjDefaults } from './adjust.js';
import { FILTERS, filterDefaults } from './filters.js';
import { ControlsForm, StyleForm } from './Panels.jsx';
import { mk, ctxOf, cloneCanvas, defaultStyle } from './doc.js';

const Foot = ({ onClose, onOk, ok = 'OK', disabled, extra }) => <>{extra}<span className="spacer" /><button type="button" className="fb" onClick={onClose}>Cancel</button><button type="button" className="fb pri" disabled={disabled} onClick={onOk}>{ok}</button></>;

export const PRESETS = [['Web 1280 × 720', 1280, 720], ['Full HD 1920 × 1080', 1920, 1080], ['Square 1080 × 1080', 1080, 1080], ['Instagram portrait 1080 × 1350', 1080, 1350], ['A4 150 dpi 1240 × 1754', 1240, 1754], ['4K 3840 × 2160', 3840, 2160], ['Banner 1500 × 500', 1500, 500], ['Icon 512 × 512', 512, 512]];

export function NewDocDialog({ onClose, onCreate, def }) {
  const [w, setW] = useState(def?.w || 1200), [h, setH] = useState(def?.h || 800), [bg, setBg] = useState('white'), [color, setColor] = useState('#ffffff'), [name, setName] = useState('Untitled');
  return (
    <Modal title="New document" onClose={onClose} width={500} footer={<Foot onClose={onClose} ok="Create" disabled={!(w > 0 && h > 0)} onOk={() => onCreate({ w: Math.min(8000, w), h: Math.min(8000, h), bg: bg === 'white' ? '#ffffff' : bg === 'transparent' ? 'transparent' : bg === 'black' ? '#000000' : color, name })} />}>
      <div className="pho-dlg">
        <Row label="Name"><input className="fi" aria-label="Document name" value={name} onChange={(e) => setName(e.target.value)} /></Row>
        <Row label="Preset"><select className="stu-sel" aria-label="Preset" onChange={(e) => { const p = PRESETS[+e.target.value]; if (p) { setW(p[1]); setH(p[2]); } }} defaultValue=""><option value="" disabled>Choose a preset…</option>{PRESETS.map((p, i) => <option key={p[0]} value={i}>{p[0]}</option>)}</select></Row>
        <div className="stu-grid2"><Num label="Width" value={w} min={1} max={8000} slider={false} unit="px" onChange={setW} /><Num label="Height" value={h} min={1} max={8000} slider={false} unit="px" onChange={setH} /></div>
        <Row label="Background">{[['white', 'White'], ['black', 'Black'], ['transparent', 'Transparent'], ['color', 'Colour']].map(([v, l]) => <label key={v} className="stu-chk"><input type="radio" name="bg" checked={bg === v} onChange={() => setBg(v)} />{l}</label>)}{bg === 'color' && <ColorField label="Background colour" value={color} onChange={setColor} />}</Row>
      </div>
    </Modal>
  );
}

export function ExportDialog({ doc, onClose, onExport }) {
  const [fmt, setFmt] = useState('png'), [q, setQ] = useState(90), [scale, setScale] = useState(100), [matte, setMatte] = useState('#ffffff');
  const w = Math.round((doc.w * scale) / 100), h = Math.round((doc.h * scale) / 100);
  return (
    <Modal title="Export as" onClose={onClose} width={440} footer={<Foot onClose={onClose} ok="Export" onOk={() => onExport({ fmt, q: q / 100, scale: scale / 100, matte })} />}>
      <div className="pho-dlg">
        <Row label="Format">{[['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']].map(([v, l]) => <label key={v} className="stu-chk"><input type="radio" name="fmt" checked={fmt === v} onChange={() => setFmt(v)} />{l}</label>)}</Row>
        {fmt !== 'png' && <Num label="Quality" value={q} min={1} max={100} unit="%" onChange={setQ} />}
        <Num label="Scale" value={scale} min={5} max={400} unit="%" onChange={setScale} />
        {fmt === 'jpeg' && <Row label="Background"><ColorField label="Matte colour" value={matte} onChange={setMatte} /><span className="stu-hint">JPEG has no transparency.</span></Row>}
        <p className="stu-hint">Output size: {w} × {h} px</p>
      </div>
    </Modal>
  );
}

export function ImageSizeDialog({ doc, onClose, onApply }) {
  const [w, setW] = useState(doc.w), [h, setH] = useState(doc.h), [lock, setLock] = useState(true); const r = doc.w / doc.h;
  return (
    <Modal title="Image size" onClose={onClose} width={400} footer={<Foot onClose={onClose} ok="Resize" onOk={() => onApply(w, h)} />}>
      <div className="pho-dlg">
        <Num label="Width" value={w} min={1} max={8000} slider={false} unit="px" onChange={(v) => { setW(Math.round(v)); if (lock) setH(Math.max(1, Math.round(v / r))); }} />
        <Num label="Height" value={h} min={1} max={8000} slider={false} unit="px" onChange={(v) => { setH(Math.round(v)); if (lock) setW(Math.max(1, Math.round(v * r))); }} />
        <label className="stu-chk"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />Keep proportions</label>
        <p className="stu-hint">Current: {doc.w} × {doc.h} px</p>
      </div>
    </Modal>
  );
}
export function CanvasSizeDialog({ doc, onClose, onApply }) {
  const [w, setW] = useState(doc.w), [h, setH] = useState(doc.h), [a, setA] = useState([1, 1]);
  return (
    <Modal title="Canvas size" onClose={onClose} width={400} footer={<Foot onClose={onClose} ok="Apply" onOk={() => onApply(w, h, a[0] / 2, a[1] / 2)} />}>
      <div className="pho-dlg">
        <Num label="Width" value={w} min={1} max={8000} slider={false} unit="px" onChange={(v) => setW(Math.round(v))} />
        <Num label="Height" value={h} min={1} max={8000} slider={false} unit="px" onChange={(v) => setH(Math.round(v))} />
        <Row label="Anchor"><div className="pho-anchor" role="group" aria-label="Anchor">{[0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => <button key={`${x}${y}`} type="button" className={a[0] === x && a[1] === y ? 'on' : ''} aria-label={`Anchor ${['top', 'middle', 'bottom'][y]} ${['left', 'centre', 'right'][x]}`} onClick={() => setA([x, y])} />))}</div></Row>
      </div>
    </Modal>
  );
}

/* Live-preview dialog for filters and (destructive) adjustments. */
export function EffectDialog({ doc, kind, isFilter, onClose, onApply }) {
  const spec = isFilter ? FILTERS[kind] : ADJUSTMENTS[kind]; const [params, setParams] = useState(() => (isFilter ? filterDefaults(kind) : adjDefaults(kind))); const [preview, setPreview] = useState(true);
  const cv = useRef(null); const base = useMemo(() => { const L = doc.active; const src = doc.surface(L); const k = Math.min(1, 520 / Math.max(doc.w, doc.h)); return { k, src }; }, [doc]); // eslint-disable-line
  const tm = useRef(0);
  useEffect(() => {
    clearTimeout(tm.current); tm.current = setTimeout(() => {
      const c = cv.current; if (!c) return; const g = c.getContext('2d'); const { src } = base; const w = Math.round(doc.w * base.k), h = Math.round(doc.h * base.k); c.width = w; c.height = h; g.clearRect(0, 0, w, h);
      if (!preview) { g.drawImage(src, 0, 0, w, h); return; }
      // run at preview scale; radii scale with the image
      const small = mk(w, h); ctxOf(small).drawImage(src, 0, 0, w, h); const sg = ctxOf(small); const img = sg.getImageData(0, 0, w, h);
      try {
        if (isFilter) { const p = { ...params }; for (const cc of spec.controls) if (/radius|size|amount|dist|distance|blur|pixel|cell|scale/i.test(cc.key) && !/percent|%/.test(cc.label)) { /* leave */ } const o = spec.run({ data: img.data, width: w, height: h }, p); g.putImageData(new ImageData(new Uint8ClampedArray(o), w, h), 0, 0); }
        else { spec.make(params)(img.data); g.putImageData(img, 0, 0); }
      } catch { g.drawImage(src, 0, 0, w, h); }
    }, 60); return () => clearTimeout(tm.current);
  }, [params, preview, base, isFilter, spec, doc.w, doc.h]);
  return (
    <Modal title={spec.label + (isFilter ? '' : '')} onClose={onClose} width={720} label={spec.label} footer={<Foot onClose={onClose} ok="OK" onOk={() => onApply(params)} extra={<label className="stu-chk"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />Preview</label>} />}>
      <div className="pho-effect">
        <div className="pho-prev checker"><canvas ref={cv} aria-label="Preview" /></div>
        <div className="pho-effect-form"><ControlsForm spec={spec} kind={isFilter ? null : kind} params={params} onChange={setParams} />{isFilter && doc.sel && <p className="stu-hint">Applied inside the current selection.</p>}</div>
      </div>
    </Modal>
  );
}

export function StyleDialog({ layer, onClose, onApply }) {
  const [st, setSt] = useState(() => JSON.parse(JSON.stringify(layer.style || defaultStyle())));
  return (
    <Modal title="Layer style" onClose={onClose} width={420} label="Layer style" footer={<Foot onClose={onClose} ok="OK" onOk={() => onApply(st)} extra={<button type="button" className="fb" onClick={() => setSt(defaultStyle())}>Reset</button>} />}>
      <p className="stu-hint" style={{ marginTop: 0 }}>{layer.name}</p>
      <StyleForm style={st} onChange={setSt} />
    </Modal>
  );
}

export const SHORTCUTS = [
  ['Tools', [['V', 'Move'], ['M', 'Rectangular / elliptical marquee'], ['L', 'Lasso / polygon lasso'], ['W', 'Magic wand'], ['C', 'Crop'], ['I', 'Eyedropper'], ['B', 'Brush'], ['E', 'Eraser'], ['S', 'Clone stamp'], ['R', 'Blur / sharpen / smudge'], ['O', 'Dodge / burn'], ['G', 'Gradient'], ['K', 'Paint bucket'], ['T', 'Type'], ['U', 'Shape'], ['H', 'Hand (or hold Space)'], ['Z', 'Zoom']]],
  ['Edit', [['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+C / X / V', 'Copy / cut / paste'], ['Ctrl+T', 'Free transform'], ['Enter / Esc', 'Commit / cancel transform or crop'], ['Delete', 'Clear selection'], ['Alt+Backspace', 'Fill with foreground'], ['X / D', 'Swap / reset colours'], ['[ / ]', 'Smaller / larger brush']]],
  ['Select', [['Ctrl+A', 'Select all'], ['Ctrl+D', 'Deselect'], ['Ctrl+Shift+I', 'Invert selection'], ['Shift / Alt + drag', 'Add to / subtract from selection']]],
  ['Layers & view', [['Ctrl+Shift+N', 'New layer'], ['Ctrl+J', 'Duplicate layer'], ['Ctrl+E', 'Merge down'], ['Ctrl + wheel', 'Zoom'], ['Ctrl+0 / Ctrl+1', 'Fit / 100%'], ['Ctrl+S', 'Save project']]],
];
export function ShortcutsDialog({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={640} footer={<><span className="spacer" /><button type="button" className="fb pri" onClick={onClose}>Close</button></>}>
      <div className="pho-keys">{SHORTCUTS.map(([g, rows]) => <div key={g}><h4>{g}</h4>{rows.map(([k, d]) => <div key={k} className="pho-key"><kbd>{k}</kbd><span>{d}</span></div>)}</div>)}</div>
    </Modal>
  );
}
export { cloneCanvas };
