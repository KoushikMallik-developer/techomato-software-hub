import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { useDismiss } from './ui.jsx';

/* Popover anchored to its trigger. trigger: ({open, toggle}) => node ; children: ({close}) => node */
export function Pop({ trigger, children, align = 'left', up = false, className = '', width, controlled }) {
  const [o, setO] = useState(false);
  const open = controlled ? controlled.open : o; const setOpen = controlled ? controlled.setOpen : setO;
  const ref = useRef(null); const panel = useRef(null); const [style, setStyle] = useState({});
  useDismiss(open, setOpen, ref);
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const r = panel.current.getBoundingClientRect(); const s = {};
    if (r.right > window.innerWidth - 8) { s.left = 'auto'; s.right = 0; }
    if (r.left < 8 && align === 'right') { s.right = 'auto'; s.left = 0; }
    if (!up && r.bottom > window.innerHeight - 8) { const room = window.innerHeight - r.top - 10; if (r.height > room && r.top > window.innerHeight / 2) { s.top = 'auto'; s.bottom = 'calc(100% + 4px)'; } else { s.maxHeight = Math.max(160, room); } }
    setStyle(s);
  }, [open, align, up]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  return (
    <span className={'fx-popwrap ' + className} ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({ open, toggle: () => setOpen(!open), close })}
      {open && <div className={'fx-pop' + (align === 'right' ? ' right' : '') + (up ? ' up' : '')} style={{ ...(width ? { minWidth: width } : {}), ...style }} ref={panel}>{typeof children === 'function' ? children({ close }) : children}</div>}
    </span>
  );
}

/* Rows for a popover / context menu. items: {label, icon, onClick, checked, danger, sep, head, kbd, disabled} */
export function MenuRows({ items, close }) {
  return items.map((it, i) => it.sep ? <div key={i} className="fx-sep" /> : it.head ? <div key={i} className="fx-head">{it.head}</div> : it.hidden ? null : (
    <button key={i} className={'fx-row' + (it.danger ? ' danger' : '') + (it.checked ? ' on' : '')} disabled={it.disabled} onClick={() => { if (!it.keepOpen && close) close(); it.onClick && it.onClick(); }}>
      {it.icon ? <Icon name={it.icon} size={15} /> : it.checked !== undefined ? <span style={{ width: 15 }}>{it.checked ? <Icon name="check" size={15} /> : null}</span> : null}
      <span className="grow">{it.label}</span>{it.kbd && <kbd>{it.kbd}</kbd>}
    </button>
  ));
}

/* Right-click menu at screen position */
export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null); const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => { const r = ref.current.getBoundingClientRect(); setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 6)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 6)) }); }, [x, y]);
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down, true); document.addEventListener('keydown', key, true); window.addEventListener('blur', onClose); window.addEventListener('resize', onClose);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); window.removeEventListener('blur', onClose); window.removeEventListener('resize', onClose); };
  }, [onClose]);
  return createPortal(<div className="fx fx-ctx" style={{ position: 'fixed', inset: 'auto', height: 'auto', background: 'transparent', overflow: 'visible', zIndex: 200, left: 0, top: 0 }}><div className="fx-pop" ref={ref} style={{ position: 'fixed', left: pos.left, top: pos.top }}><MenuRows items={items} close={onClose} /></div></div>, document.body);
}
export function useContextMenu() {
  const [m, setM] = useState(null);
  const show = useCallback((e, items) => { e.preventDefault(); e.stopPropagation(); setM({ x: e.clientX, y: e.clientY, items }); }, []);
  const node = m ? <ContextMenu x={m.x} y={m.y} items={m.items} onClose={() => setM(null)} /> : null;
  return [node, show, () => setM(null)];
}

export function Modal({ title, onClose, children, footer, width = 520, label }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; document.addEventListener('keydown', k, true); return () => document.removeEventListener('keydown', k, true); }, [onClose]);
  return (
    <div className="fx-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fx-modal" role="dialog" aria-modal="true" aria-label={label || title} style={{ width: `min(${width}px, 100%)` }}>
        {title && <h2>{title}</h2>}
        {children}
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}

/* Toast with optional action (Undo) */
export function useToast() {
  const [t, setT] = useState(null); const timer = useRef(0);
  const show = useCallback((message, opts = {}) => { clearTimeout(timer.current); setT({ message, action: opts.action, n: Math.random() }); timer.current = setTimeout(() => setT(null), opts.ms || (opts.action ? 6000 : 2800)); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = t ? <div className="fx-toast" role="status" key={t.n}>{t.message}{t.action && <button onClick={() => { t.action.onClick(); setT(null); }}>{t.action.label}</button>}</div> : null;
  return [node, show];
}

/* Simple confirm / prompt modals returning promises */
export function useAsk() {
  const [m, setM] = useState(null);
  const ask = useCallback((o) => new Promise((res) => setM({ ...o, res })), []);
  const done = (v) => { const r = m.res; setM(null); r(v); };
  const node = m ? <AskModal m={m} done={done} /> : null;
  return [node, ask];
}
function AskModal({ m, done }) {
  const [v, setV] = useState(m.value ?? '');
  const isPrompt = m.kind === 'prompt';
  return (
    <Modal title={m.title} onClose={() => done(isPrompt ? null : false)} width={m.width || 420}
      footer={<><button className="fb" onClick={() => done(isPrompt ? null : false)}>{m.cancelText || 'Cancel'}</button><button className={'fb ' + (m.danger ? 'danger' : 'pri')} style={m.danger ? { background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' } : undefined} onClick={() => done(isPrompt ? v : true)} autoFocus={!isPrompt}>{m.okText || 'OK'}</button></>}>
      {m.message && <p style={{ margin: '0 0 10px' }}>{m.message}</p>}
      {isPrompt && (m.multiline ? <textarea className="fi" rows={5} autoFocus value={v} placeholder={m.placeholder} onChange={(e) => setV(e.target.value)} /> : <input className="fi" autoFocus value={v} placeholder={m.placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) done(v); }} />)}
    </Modal>
  );
}

/* Colour swatch row */
export const SWATCHES = ['#0f6cbd', '#2564cf', '#5b5fc7', '#8764b8', '#b146c2', '#c239b3', '#e3008c', '#d13438', '#da3b01', '#ca5010', '#c19c00', '#498205', '#107c10', '#038387', '#00b7c3', '#69797e', '#4a5459'];
export function Swatches({ value, onChange, colors = SWATCHES }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{colors.map((c) => <button key={c} type="button" className={'fx-color' + (value === c ? ' on' : '')} style={{ background: c }} aria-label={c} onClick={() => onChange(c)} />)}</div>;
}

export function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
