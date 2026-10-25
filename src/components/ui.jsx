import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/* ---------- Toolbar button ---------- */
export function Btn({ icon, children, title, active, disabled, onClick, className = '', size = 16, style, id }) {
  return (
    <button
      id={id}
      type="button"
      className={'tb' + (active ? ' on' : '') + (className ? ' ' + className : '')}
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : !!active}
      disabled={disabled}
      style={style}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={size} />}
      {children}
    </button>
  );
}

export const Sep = () => <span className="sep" role="separator" />;

/* ---------- Native select styled for toolbars ---------- */
export function Sel({ value, onChange, options, title, width, placeholder, className = '' }) {
  return (
    <select
      className={'tbselect ' + className}
      title={title}
      aria-label={title}
      value={value ?? ''}
      style={width ? { width } : undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder !== undefined && (
        <option value="" disabled hidden>{placeholder}</option>
      )}
      {options.map((o) => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        return <option key={String(v)} value={v}>{l}</option>;
      })}
    </select>
  );
}

/* ---------- Number stepper (font size etc.) ---------- */
export function Stepper({ value, onChange, min = 1, max = 400, step = 1, title, width = 44 }) {
  const [draft, setDraftState] = useState(null);
  const draftRef = useRef(null);
  const setDraft = (v) => { draftRef.current = v; setDraftState(v); };
  const commit = () => {
    const d = draftRef.current;
    if (d !== null) {
      setDraft(null);
      const n = parseFloat(d);
      if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
    }
  };
  return (
    <span className="stepper" title={title}>
      <button type="button" className="tb mini" aria-label={'Decrease ' + (title || '')} onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(Math.max(min, Math.round(((Number(value) || min) - step) * 100) / 100))}>
        <Icon name="minus" size={12} />
      </button>
      <input
        aria-label={title}
        style={{ width }}
        value={draft !== null ? draft : value ?? ''}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); e.target.blur(); }
          if (e.key === 'Escape') { setDraft(null); e.target.blur(); }
        }}
      />
      <button type="button" className="tb mini" aria-label={'Increase ' + (title || '')} onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(Math.min(max, Math.round(((Number(value) || min) + step) * 100) / 100))}>
        <Icon name="plus" size={12} />
      </button>
    </span>
  );
}

/* ---------- Popover / dropdown ---------- */
export function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, setOpen, ref]);
}

/*
  <Drop icon="alignLeft" title="Align" label="text">{({close}) => ...}</Drop>
  The panel is positioned under the button and flipped if it would leave the screen.
*/
export function Drop({ icon, label, title, active, disabled, children, align = 'left', panelClass = '', caret = true, className = '', onOpen, size = 16, controlled }) {
  const [openState, setOpenState] = useState(false);
  const open = controlled ? controlled.open : openState;
  const setOpen = controlled ? controlled.setOpen : setOpenState;
  const ref = useRef(null);
  const panel = useRef(null);
  const [pos, setPos] = useState({});
  useDismiss(open, setOpen, ref);

  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const r = panel.current.getBoundingClientRect();
    const next = {};
    if (r.right > window.innerWidth - 8) { next.left = 'auto'; next.right = 0; }
    const room = window.innerHeight - r.top - 12;
    if (r.height > room) { next.maxHeight = Math.max(160, room); next.overflowY = 'auto'; }
    setPos(next);
  }, [open]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <span className={'drop ' + className} ref={ref}>
      <button
        type="button"
        className={'tb' + (active || open ? ' on' : '') + (label ? ' has-label' : '')}
        title={title}
        aria-label={title}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!open && onOpen) onOpen();
          setOpen(!open);
        }}
      >
        {icon && <Icon name={icon} size={size} />}
        {label}
        {caret && <Icon name="chevronDown" size={11} className="caret" />}
      </button>
      {open && (
        <div
          className={'panel ' + panelClass + (align === 'right' ? ' right' : '')}
          ref={panel}
          style={pos}
          onMouseDown={(e) => {
            const t = e.target;
            if (!(t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.tagName === 'OPTION')) e.preventDefault();
          }}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </span>
  );
}

/* A list of menu rows inside a Drop panel */
export function MenuList({ items, close }) {
  return (
    <div className="mlist">
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="msep" />
        ) : it.hidden ? null : (
          <button
            key={i}
            type="button"
            className={'mrow' + (it.danger ? ' danger' : '')}
            disabled={it.disabled}
            onClick={() => {
              if (close && !it.keepOpen) close();
              it.onClick && it.onClick();
            }}
          >
            <span className="mcheck">{it.checked ? <Icon name="check" size={13} /> : it.icon ? <Icon name={it.icon} size={14} /> : null}</span>
            <span className="mlabel">{it.label}</span>
            {it.shortcut && <span className="mkey">{it.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
}

/* ---------- Colours ---------- */
const mix = (hex, to, t) => {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = n(hex);
  const b = to === 'w' ? [255, 255, 255] : [0, 0, 0];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const GRAYS = ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'];
const VIVID = ['#cc0000', '#ff0000', '#ff9900', '#ffd600', '#00b050', '#00bcd4', '#4a86e8', '#1f4fd8', '#8e44ad', '#e91e8c'];
const PALETTE = [GRAYS, VIVID.map((c) => mix(c, 'w', 0.8)), VIVID.map((c) => mix(c, 'w', 0.6)), VIVID.map((c) => mix(c, 'w', 0.35)), VIVID, VIVID.map((c) => mix(c, 'b', 0.25)), VIVID.map((c) => mix(c, 'b', 0.5))];

const RECENT_KEY = 'techomato:recentColors';
const getRecent = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
};
const pushRecent = (c) => {
  try {
    const r = [c, ...getRecent().filter((x) => x !== c)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  } catch { /* ignore */ }
};

export function ColorPanel({ onPick, noneLabel, close, current }) {
  const [hex, setHex] = useState(current && current.startsWith('#') ? current : '#3366cc');
  const recent = getRecent();
  const pick = (c) => {
    if (c) pushRecent(c);
    onPick(c);
    close && close();
  };
  return (
    <div className="colorpanel">
      {noneLabel && (
        <button type="button" className="mrow" onClick={() => pick(null)}>
          <span className="mcheck"><Icon name="x" size={13} /></span>
          <span className="mlabel">{noneLabel}</span>
        </button>
      )}
      <div className="swatches">
        {PALETTE.map((row, i) => (
          <div key={i} className="swrow">
            {row.map((c) => (
              <button key={c} type="button" className={'sw' + (c === current ? ' on' : '')} style={{ background: c }} title={c} aria-label={c} onClick={() => pick(c)} />
            ))}
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="sw-label">Recent</div>
          <div className="swrow">
            {recent.map((c) => (
              <button key={c} type="button" className="sw" style={{ background: c }} title={c} aria-label={c} onClick={() => pick(c)} />
            ))}
          </div>
        </>
      )}
      <div className="sw-custom">
        <input type="color" aria-label="Custom colour" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'} onChange={(e) => setHex(e.target.value)} />
        <input type="text" aria-label="Hex colour" value={hex} spellCheck={false} onChange={(e) => setHex(e.target.value)} />
        <button type="button" className="btn primary sm" onClick={() => /^#[0-9a-f]{6}$/i.test(hex) && pick(hex)}>Apply</button>
      </div>
    </div>
  );
}

/* Split colour button: left half applies the last colour, right half opens the palette */
export function ColorBtn({ icon, title, value, onPick, noneLabel, defaultColor = '#000000' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const shown = value || defaultColor;
  return (
    <span className="drop colorbtn2" ref={ref}>
      <button type="button" className="tb split-l" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(shown)}>
        <Icon name={icon} size={16} />
        <span className="cbar" style={{ background: shown }} />
      </button>
      <button type="button" className="tb split-r" title={title + ' options'} aria-label={title + ' options'} aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        <Icon name="chevronDown" size={11} />
      </button>
      {open && (
        <div className="panel" onMouseDown={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
          <ColorPanel onPick={onPick} noneLabel={noneLabel} current={value} close={() => setOpen(false)} />
        </div>
      )}
    </span>
  );
}

/* Small helper: confirm-on-second-click button label etc. can be added later */
export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}
