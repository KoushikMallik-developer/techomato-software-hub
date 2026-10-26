import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLogo from './AppLogo.jsx';
import Icon from './Icon.jsx';
import { TomatoMark } from './Brand.jsx';
import { useDialog } from './Dialogs.jsx';
import { useDismiss } from './ui.jsx';
import { downloadFile, pickFile, readAsText } from '../lib/download.js';
import '../styles/fluent.css';

/*
  Top bar used by the "everyday" apps (Microsoft 365 style): site link, app logo + name,
  optional centre slot (search), right slot, and a "..." menu with backup / restore.
    <AppBar id="todo" name="Techomato To Do" backup={{ name:'todo', get, set }}>
*/
export default function AppBar({ id, name, center, right, backup, extraMenu = [], status }) {
  const dlg = useDialog();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const exportBackup = () => {
    downloadFile(`techomato-${backup.name}-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ kind: 'techomato-app-backup', app: backup.name, exported: new Date().toISOString(), data: backup.get() }), 'application/json');
    dlg.toast('Backup downloaded');
  };
  const importBackup = async () => {
    const f = await pickFile('.json'); if (!f) return;
    try {
      const o = JSON.parse(await readAsText(f));
      if (o.kind !== 'techomato-app-backup' || o.app !== backup.name) throw new Error('bad');
      if (await dlg.confirm({ title: 'Restore backup', message: 'This replaces everything currently in this app with the backup. Continue?', okText: 'Restore', danger: true })) { backup.set(o.data); dlg.toast('Backup restored'); }
    } catch { dlg.alert(`That file is not a ${name} backup.`, 'Could not restore'); }
  };
  const reset = async () => {
    if (await dlg.confirm({ title: 'Erase all data', message: `Delete everything stored by ${name} in this browser? This cannot be undone.`, okText: 'Erase everything', danger: true })) { backup.set(backup.blank()); dlg.toast('All data erased'); }
  };
  return (
    <header className="fx-bar no-print">
      <Link to="/" className="fx-brand" title="Back to Techomato Softwares"><TomatoMark size={26} /><span className="fx-brand-t">techomato</span></Link>
      <span className="fx-bar-div" aria-hidden="true" />
      <span className="fx-bar-name"><AppLogo id={id} size={24} /><b>{name}</b></span>
      {center && <div className="fx-bar-center">{center}</div>}
      <div className="spacer" />
      {status === 'error' && <span className="fx-bar-warn">Storage full</span>}
      {right}
      {backup && (
        <span className="fx-more" ref={ref}>
          <button className="fx-bar-btn" aria-label="More options" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon name="more" size={18} /></button>
          {open && (
            <div className="fx-pop right">
              {extraMenu.map((m, i) => (m.sep ? <div key={i} className="fx-sep" /> : <button key={i} className="fx-row" onClick={() => { setOpen(false); m.onClick(); }}>{m.label}</button>))}
              {extraMenu.length > 0 && <div className="fx-sep" />}
              <button className="fx-row" onClick={() => { setOpen(false); exportBackup(); }}>Back up data (.json)</button>
              <button className="fx-row" onClick={() => { setOpen(false); importBackup(); }}>Restore from backup...</button>
              <div className="fx-sep" />
              <button className="fx-row danger" onClick={() => { setOpen(false); reset(); }}>Erase all data...</button>
              <div className="fx-sep" />
              <div className="fx-note">Data is stored only in this browser. Back it up now and then.</div>
            </div>
          )}
        </span>
      )}
    </header>
  );
}
