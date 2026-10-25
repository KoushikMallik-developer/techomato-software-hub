import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import AppLogo, { APP_COLORS } from './AppLogo.jsx';
import MenuBar from './MenuBar.jsx';
import { useDialog } from './Dialogs.jsx';
import { downloadFile, pickFile, readAsText, safeName } from '../lib/download.js';
import '../styles/app.css';

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString();
}

const fmtDateTime = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function VersionList({ libRef, close, toast }) {
  const lib = libRef.current;
  const versions = [...lib.current.versions].reverse();
  return (
    <div className="versions">
      {versions.length === 0 && (
        <p className="muted">No saved versions yet. Versions are saved automatically as you work, and you can save one yourself from File - Save version.</p>
      )}
      <ul>
        {versions.map((v) => (
          <li key={v.id}>
            <div>
              <strong>{v.label || (v.auto ? 'Automatic version' : 'Saved version')}</strong>
              <small>{fmtDateTime(v.t)}</small>
            </div>
            <div className="vbtns">
              <button className="btn sm" onClick={() => { lib.restore(v.id); toast('Version restored'); close(); }}>Restore</button>
              <button className="btn sm ghost" aria-label="Delete version" onClick={() => { lib.deleteVersion(v.id); close(); }}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">Restoring keeps your current version in this list, so you can switch back.</p>
    </div>
  );
}

function ShortcutsList({ groups }) {
  return (
    <div className="shortcuts">
      {groups.map((g) => (
        <section key={g.group}>
          <h3>{g.group}</h3>
          <dl>
            {g.items.map(([keys, desc]) => (
              <div key={keys + desc}>
                <dt>{keys.split(' ').map((k, i) => (k === '+' ? <span key={i}>+</span> : <kbd key={i} className="kbd">{k}</kbd>))}</dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/*
  Shared frame for every browser app: header, menu bar, toolbar, "My files"
  panel, version history, backup and restore, help.
*/
export default function AppChrome({
  name, icon, noun = 'file', lib, menus = [], fileItems = [], templates, shortcuts = [],
  toolbar, actions, rightPanel, children, hint,
}) {
  const dlg = useDialog();
  const [showFiles, setShowFiles] = useState(false);
  const [q, setQ] = useState('');
  const titleRef = useRef(null);
  const libRef = useRef(lib);
  libRef.current = lib;
  const { current, items } = lib;

  useEffect(() => {
    document.title = `${current.title || 'Untitled'} - ${name}`;
  }, [current.title, name]);

  const exportBackup = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`techomato-${safeName(noun)}-backup-${stamp}.json`, JSON.stringify(lib.backup()), 'application/json');
    dlg.toast(`Backup downloaded (${items.length} ${noun}${items.length === 1 ? '' : 's'})`);
  };

  const importBackup = async () => {
    const f = await pickFile('.json');
    if (!f) return;
    try {
      const n = lib.restoreBackup(JSON.parse(await readAsText(f)));
      if (!n) throw new Error('not a backup');
      dlg.toast(`Restored ${n} ${noun}${n === 1 ? '' : 's'}`);
    } catch {
      dlg.alert(`That file is not a ${name} backup.`, 'Could not restore');
    }
  };

  const showVersions = () => dlg.custom(({ close }) => <VersionList libRef={libRef} close={close} toast={dlg.toast} />, { title: 'Version history', width: 520 });

  const saveVersion = async () => {
    const label = await dlg.prompt({ title: 'Save version', label: 'Name this version (optional)', placeholder: 'e.g. Before review' });
    if (label === null) return;
    lib.snapshot(label.trim());
    dlg.toast('Version saved');
  };

  const confirmDelete = async (id, title) => {
    const ok = await dlg.confirm({ title: `Delete ${noun}`, message: `Delete "${title || 'Untitled'}"? This cannot be undone.`, okText: 'Delete', danger: true });
    if (ok) lib.remove(id);
  };

  const showShortcuts = () => dlg.custom(() => <ShortcutsList groups={shortcuts} />, { title: 'Keyboard shortcuts', width: 620 });

  const newItems = templates && templates.length
    ? [{ label: `New ${noun}`, icon: 'plus', children: [{ label: 'Blank', onClick: () => lib.create() }, { sep: true }, ...templates.map((t) => ({ label: t.name, onClick: () => lib.create(t.make(), t.title || t.name) }))] }]
    : [{ label: `New ${noun}`, icon: 'plus', onClick: () => lib.create() }];

  const fileMenu = {
    label: 'File',
    items: [
      ...newItems,
      ...(fileItems.length ? [{ sep: true }, ...fileItems] : []),
      { sep: true },
      { label: 'Make a copy', icon: 'copy', onClick: () => lib.duplicate() },
      { label: 'Rename', onClick: () => titleRef.current && (titleRef.current.focus(), titleRef.current.select()) },
      { sep: true },
      { label: 'Version history', icon: 'history', onClick: showVersions },
      { label: 'Save version...', onClick: saveVersion },
      { sep: true },
      { label: `Back up all ${noun}s`, icon: 'download', onClick: exportBackup },
      { label: 'Restore from backup...', icon: 'upload', onClick: importBackup },
      { sep: true },
      { label: `Move to trash`, icon: 'trash', danger: true, onClick: () => confirmDelete(current.id, current.title) },
    ],
  };

  const helpMenu = {
    label: 'Help',
    items: [
      { label: 'Keyboard shortcuts', icon: 'keyboard', onClick: showShortcuts, disabled: !shortcuts.length },
      { sep: true },
      { label: `About ${name}`, icon: 'info', onClick: () => dlg.alert(`${name} runs entirely in your browser. Your ${noun}s are stored on this device, so use File - Back up to keep a copy elsewhere.`, name) },
    ],
  };

  const allMenus = [fileMenu, ...menus, helpMenu];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...items].sort((a, b) => b.updated - a.updated).filter((i) => !s || (i.title || 'Untitled').toLowerCase().includes(s));
  }, [items, q]);

  const logoId = String(name).replace(/^Techomato /, '').toLowerCase();
  const statusText = lib.status === 'error' ? 'Storage full - export your work' : lib.status === 'saving' ? 'Saving...' : 'Saved in this browser';

  return (
    <div className="appframe" data-app={logoId}>
      <header className="apptop no-print">
        <Link to="/" className="back" title="Back to Techomato Softwares">
          <Icon name="chevronLeft" size={14} /> Techomato
        </Link>
        <span className="appname">{APP_COLORS[logoId] ? <AppLogo id={logoId} size={26} /> : <span aria-hidden="true">{icon}</span>}<b className="appname-t">{name}</b></span>
        <input
          ref={titleRef}
          className="titleinput"
          value={current.title}
          placeholder="Untitled"
          onChange={(e) => lib.update({ title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          aria-label={`${noun} title`}
        />
        <span className={'savestate ' + lib.status} role="status">
          {lib.status === 'saved' && <Icon name="check" size={13} />} {statusText}
        </span>
        <div className="spacer" />
        {actions}
        <button type="button" className={'btn ghost' + (showFiles ? ' on' : '')} onClick={() => setShowFiles((s) => !s)} aria-expanded={showFiles}>
          <Icon name="file" size={15} /> My files ({items.length})
        </button>
      </header>
      <MenuBar menus={allMenus} />
      {toolbar && <div className="apptoolbar no-print" role="toolbar" aria-label="Formatting">{toolbar}</div>}
      {hint}
      <div className="appbody">
        {showFiles && (
          <aside className="filespanel no-print" aria-label="My files">
            <button className="btn primary block" onClick={() => lib.create()}>
              <Icon name="plus" size={14} /> New {noun}
            </button>
            {items.length > 4 && (
              <input className="filesearch" type="search" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${noun}s`} />
            )}
            <ul>
              {filtered.map((it) => (
                <li key={it.id} className={it.id === current.id ? 'on' : ''}>
                  <button className="fileopen" onClick={() => lib.open(it.id)}>
                    <strong>{it.title || 'Untitled'}</strong>
                    <small>{timeAgo(it.updated)}</small>
                  </button>
                  <button className="filedel" title="Make a copy" aria-label={`Copy ${it.title || 'Untitled'}`} onClick={() => lib.duplicate(it.id)}>
                    <Icon name="copy" size={13} />
                  </button>
                  <button className="filedel" title={`Delete ${noun}`} aria-label={`Delete ${it.title || 'Untitled'}`} onClick={() => confirmDelete(it.id, it.title)}>
                    <Icon name="x" size={13} />
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="muted small pad">Nothing found.</li>}
            </ul>
            <p className="muted small">Files are stored in this browser only. Use File - Back up to keep a copy.</p>
          </aside>
        )}
        <div className="appmain">{children}</div>
        {rightPanel}
      </div>
    </div>
  );
}
