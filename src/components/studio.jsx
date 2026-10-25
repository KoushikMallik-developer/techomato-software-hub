import { useEffect, useRef, useState, useCallback } from 'react';
import Icon from './Icon.jsx';
import { Pop, MenuRows } from './fxui.jsx';
import '../styles/studio.css';

/* Menu bar (File, Edit, ...). menus: [{label, items:[{label,icon,kbd,onClick,disabled,checked,sep,head,danger}]}] */
export function StudioMenu({ menus }) {
  return (
    <nav className="stu-menu no-print" aria-label="Menu">
      {menus.map((m) => (
        <Pop key={m.label} trigger={({ toggle, open }) => <button type="button" className={'stu-mb' + (open ? ' on' : '')} aria-haspopup="true" onClick={toggle}>{m.label}</button>} width={236}>
          {({ close }) => <MenuRows items={m.items} close={close} />}
        </Pop>
      ))}
    </nav>
  );
}

/* Number box whose label can be dragged to scrub the value, with an optional slider. */
export function Num({ label, value, onChange, min = 0, max = 100, step = 1, unit = '', slider = true, digits, onCommit, title }) {
  const ref = useRef(null);
  const d = digits !== undefined ? digits : (step < 1 ? Math.min(3, String(step).split('.')[1]?.length || 2) : 0);
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const fmt = (v) => (Number.isFinite(v) ? Number(v).toFixed(d) : '');
  const [txt, setTxt] = useState(fmt(value)); const edit = useRef(false);
  useEffect(() => { if (!edit.current) setTxt(fmt(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const down = (e) => {
    if (e.button !== 0) return; e.preventDefault();
    const x0 = e.clientX, v0 = value; const range = max - min; const per = Math.max(step, range / 300);
    const mv = (ev) => { const dv = (ev.clientX - x0) * per * (ev.shiftKey ? 0.1 : 1); const nv = clamp(Math.round((v0 + dv) / step) * step); onChange(+nv.toFixed(6)); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.style.cursor = ''; onCommit && onCommit(); };
    document.body.style.cursor = 'ew-resize'; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const commit = () => { edit.current = false; const n = parseFloat(txt); if (Number.isFinite(n)) onChange(clamp(n)); else setTxt(fmt(value)); onCommit && onCommit(); };
  return (
    <div className="stu-num" title={title}>
      {label && <span className="stu-nl" onPointerDown={down}>{label}</span>}
      {slider && <input type="range" aria-label={label || 'value'} min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(parseFloat(e.target.value))} onPointerUp={() => onCommit && onCommit()} />}
      <input ref={ref} type="text" inputMode="decimal" className="stu-nv" aria-label={label ? `${label} value` : 'value'} value={txt} onFocus={(e) => { edit.current = true; e.target.select(); }} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { setTxt(fmt(value)); edit.current = false; e.target.blur(); } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const nv = clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)); onChange(+nv.toFixed(6)); } }} />
      {unit && <span className="stu-nu">{unit}</span>}
    </div>
  );
}

export function PanelBox({ title, actions, children, open: open0 = true, grow, className = '', id }) {
  const [open, setOpen] = useState(open0);
  return (
    <section className={'stu-panel ' + (grow ? 'grow ' : '') + className} aria-label={title} id={id}>
      <header className="stu-ph">
        <button type="button" className="stu-pt" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />{title}</button>
        <span className="spacer" />{open && actions}
      </header>
      {open && <div className="stu-pb">{children}</div>}
    </section>
  );
}

export function ColorField({ value, onChange, label, size = 22 }) {
  return (
    <label className="stu-color" title={label}>
      <input type="color" aria-label={label || 'Colour'} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
      <i style={{ background: value, width: size, height: size }} />
    </label>
  );
}

export const Row = ({ label, children, className = '' }) => <div className={'stu-r ' + className}>{label && <span className="stu-rl">{label}</span>}<div className="stu-rc">{children}</div></div>;

export function ToolBtn({ icon, label, on, onClick, kbd, disabled, text }) {
  return <button type="button" className={'stu-tool' + (on ? ' on' : '')} aria-label={label} aria-pressed={on} title={kbd ? `${label} (${kbd})` : label} disabled={disabled} onClick={onClick}>{icon ? <Icon name={icon} size={18} /> : text}</button>;
}

/* hotkeys: map of 'ctrl+z' -> fn(e). Ignored while typing in fields. */
export function useHotkeys(map, deps = []) {
  const ref = useRef(map); ref.current = map;
  useEffect(() => {
    const kd = (e) => {
      const t = e.target; const tag = t && t.tagName;
      if (tag === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) { if (!(e.ctrlKey || e.metaKey) || e.key.length > 1) return; if (tag === 'TEXTAREA' || (tag === 'INPUT' && t.type !== 'range')) return; }
      if (document.querySelector('.fx-modal')) return;
      let k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      if (k === ' ') k = 'space';
      const mods = (e.ctrlKey || e.metaKey ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey && (k.length > 1 || e.ctrlKey || e.metaKey) ? 'shift+' : '');
      const fn = ref.current[mods + k]; if (fn) { const r = fn(e); if (r !== false) e.preventDefault(); }
    };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useRaf(fn, active = true) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => { if (!active) return undefined; let id = 0, last = performance.now(); const loop = (t) => { const dt = (t - last) / 1000; last = t; ref.current(dt, t); id = requestAnimationFrame(loop); }; id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id); }, [active]);
}

/* undo/redo stack for plain JSON-ish state */
export function useHistory(initial) {
  const [state, setState] = useState(initial);
  const past = useRef([]); const future = useRef([]); const cur = useRef(initial); cur.current = state;
  const [, force] = useState(0);
  const set = useCallback((next, { record = true } = {}) => {
    const n = typeof next === 'function' ? next(cur.current) : next; if (n === cur.current) return;
    if (record) { past.current.push(cur.current); if (past.current.length > 100) past.current.shift(); future.current = []; }
    cur.current = n; setState(n); force((x) => x + 1);
  }, []);
  const undo = useCallback(() => { if (!past.current.length) return; future.current.push(cur.current); const p = past.current.pop(); cur.current = p; setState(p); force((x) => x + 1); }, []);
  const redo = useCallback(() => { if (!future.current.length) return; past.current.push(cur.current); const n = future.current.pop(); cur.current = n; setState(n); force((x) => x + 1); }, []);
  const mark = useCallback((prev) => { past.current.push(prev); if (past.current.length > 100) past.current.shift(); future.current = []; force((x) => x + 1); }, []);
  const reset = useCallback((v) => { past.current = []; future.current = []; cur.current = v; setState(v); force((x) => x + 1); }, []);
  return { state, set, undo, redo, reset, mark, canUndo: past.current.length > 0, canRedo: future.current.length > 0, ref: cur };
}

export const fmtTime = (s, fps) => { s = Math.max(0, s); const m = Math.floor(s / 60), sec = Math.floor(s % 60); const base = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; if (fps) return `${base}:${String(Math.floor((s % 1) * fps)).padStart(2, '0')}`; return `${base}.${String(Math.floor((s % 1) * 100)).padStart(2, '0')}`; };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
