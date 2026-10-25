import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/*
  menus: [{ label, items: [ { label, shortcut, onClick, disabled, checked, icon, danger, sep, hidden, children } ] }]
  `children` makes a submenu (one level deep, opens on hover).
*/
function Items({ items, close }) {
  return items.map((it, i) => {
    if (it.hidden) return null;
    if (it.sep) return <div key={i} className="msep" />;
    if (it.children) {
      return (
        <div key={i} className="mrow-wrap has-sub">
          <button type="button" className="mrow" disabled={it.disabled}>
            <span className="mcheck">{it.icon ? <Icon name={it.icon} size={14} /> : null}</span>
            <span className="mlabel">{it.label}</span>
            <Icon name="chevronRight" size={12} className="msub" />
          </button>
          <div className="submenu">
            <Items items={it.children} close={close} />
          </div>
        </div>
      );
    }
    return (
      <button
        key={i}
        type="button"
        className={'mrow' + (it.danger ? ' danger' : '')}
        disabled={it.disabled}
        role="menuitem"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!it.keepOpen) close();
          it.onClick && it.onClick();
        }}
      >
        <span className="mcheck">{it.checked ? <Icon name="check" size={13} /> : it.icon ? <Icon name={it.icon} size={14} /> : null}</span>
        <span className="mlabel">{it.label}</span>
        {it.shortcut && <span className="mkey">{it.shortcut}</span>}
      </button>
    );
  });
}

export default function MenuBar({ menus }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (open === null) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <nav className="menubar no-print" ref={ref} aria-label="Menu">
      {menus.map((m, i) => (
        <div className="menu-top" key={m.label}>
          <button
            type="button"
            className={'menu-label' + (open === i ? ' on' : '')}
            aria-haspopup="true"
            aria-expanded={open === i}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="menu-panel" role="menu">
              <Items items={m.items} close={() => setOpen(null)} />
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
