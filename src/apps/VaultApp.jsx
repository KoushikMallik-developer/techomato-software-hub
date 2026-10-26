import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, MenuRows, Modal, useToast, useAsk } from '../components/fxui.jsx';
import { useStore, uid } from '../lib/useStore.js';
import { downloadFile, pickFile, readAsText, safeName } from '../lib/download.js';
import { createEnvelope, unlockEnvelope, resealEnvelope, deriveKey, ITER, totp, parseOtpAuth, genPassword, genPassphrase, genBits, strength, WORD_COUNT } from './vault/crypto.js';
import '../styles/vault.css';

const TYPES = [['login', 'Login'], ['note', 'Secure note'], ['card', 'Payment card']];
const DEFSET = { autoLock: 5, lockHidden: false, clip: 30 };
const DEFGEN = { mode: 'password', length: 20, lower: true, upper: true, digits: true, symbols: true, ambig: false, words: 6, sep: '-', cap: true, num: true };
const emptyPayload = () => ({ items: [], set: DEFSET, gen: DEFGEN });
const newItem = (type) => ({ id: uid(), type, title: '', user: '', pw: '', url: '', totp: '', note: '', cardNo: '', cardName: '', exp: '', cvv: '', tags: [], fav: false, created: Date.now(), updated: Date.now(), hist: [] });
const host = (u) => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const fmtD = (t) => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/* -------- CSV -------- */
function parseCsv(text) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; } else f += c; } row.push(f); if (row.some((x) => x !== '')) rows.push(row); return rows; }
const csvEsc = (s) => (/[",\n\r]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
function importCsv(text) {
  const rows = parseCsv(text); if (rows.length < 2) return []; const h = rows[0].map((x) => x.trim().toLowerCase()); const col = (...names) => h.findIndex((x) => names.includes(x));
  const iT = col('name', 'title', 'login_name'), iU = col('url', 'login_uri', 'website', 'web site'), iN = col('username', 'login_username', 'user', 'login'), iP = col('password', 'login_password'), iNote = col('note', 'notes'), iO = col('totp', 'login_totp', 'otpauth', 'otp'), iTy = col('type');
  return rows.slice(1).map((r) => { const it = newItem(iTy >= 0 && /note/i.test(r[iTy] || '') ? 'note' : 'login'); it.title = (r[iT] || host(r[iU] || '') || 'Imported').trim(); it.url = (r[iU] || '').trim(); it.user = (r[iN] || '').trim(); it.pw = r[iP] || ''; it.note = r[iNote] || ''; it.totp = iO >= 0 ? parseOtpAuth(r[iO] || '') : ''; return it; }).filter((x) => x.pw || x.user || x.note || x.url);
}

export default function VaultApp() {
  const [stored, setStored, meta] = useStore('vault', () => ({ env: null }), (d) => ({ env: d && d.env && d.env.kind === 'techomato-vault' ? d.env : null }));
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk();
  const env = stored.env;
  const [key, setKey] = useState(null); const [payload, setPayload] = useState(null); const keySalt = useRef(null); const dirty = useRef(false); const envRef = useRef(env); envRef.current = env;
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [ack, setAck] = useState(false); const [showPw, setShowPw] = useState(false);
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState(''); const [selId, setSelId] = useState(null); const [editing, setEditing] = useState(null); const [dlg, setDlg] = useState(null);
  const unlocked = !!(key && payload);

  const lock = useCallback(() => { setKey(null); setPayload(null); keySalt.current = null; dirty.current = false; setSelId(null); setEditing(null); setDlg(null); setPw(''); setPw2(''); setErr(''); }, []);
  /* if the stored vault is replaced (restore / erase) while open, lock */
  useEffect(() => { if (key && (!env || env.salt !== keySalt.current)) lock(); }, [env, key, lock]);

  /* persist (re-encrypt) after every change */
  useEffect(() => {
    if (!unlocked || !dirty.current) return undefined;
    const t = setTimeout(async () => { try { const next = await resealEnvelope(envRef.current, key, payload); dirty.current = false; setStored(() => ({ env: next })); } catch { toast('Could not save the vault'); } }, 300);
    return () => clearTimeout(t);
  }, [payload, unlocked, key, setStored, toast]);
  const flushNow = async () => { if (unlocked && dirty.current) { const next = await resealEnvelope(envRef.current, key, payload); dirty.current = false; setStored(() => ({ env: next })); } };
  const mut = (fn) => { dirty.current = true; setPayload((p) => fn(p)); };

  /* auto-lock */
  const set = payload ? payload.set : DEFSET;
  useEffect(() => {
    if (!unlocked) return undefined; let t; const arm = () => { clearTimeout(t); if (set.autoLock > 0) t = setTimeout(async () => { await flushNow().catch(() => {}); lock(); toast('Vault locked after inactivity'); }, set.autoLock * 60000); };
    const ev = ['pointerdown', 'keydown', 'wheel']; ev.forEach((e) => window.addEventListener(e, arm, true)); arm();
    const vis = () => { if (document.hidden && set.lockHidden) { flushNow().catch(() => {}).then(lock); } }; document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, arm, true)); document.removeEventListener('visibilitychange', vis); };
    // eslint-disable-next-line
  }, [unlocked, set.autoLock, set.lockHidden]);
  useEffect(() => { const h = () => { if (unlocked && dirty.current) { /* best effort: nothing sync possible with WebCrypto */ } }; window.addEventListener('pagehide', h); return () => window.removeEventListener('pagehide', h); }, [unlocked]);

  /* -------- setup / unlock -------- */
  const create = async () => {
    setErr(''); if (pw.length < 8) { setErr('Use at least 8 characters. 14 or more is much better.'); return; } if (pw !== pw2) { setErr('The two passwords do not match.'); return; } if (!ack) { setErr('Please confirm that you understand the password cannot be recovered.'); return; }
    setBusy(true); try { const p = emptyPayload(); const { env: e, key: k } = await createEnvelope(pw, p); keySalt.current = e.salt; setStored(() => ({ env: e })); setKey(k); setPayload(p); setPw(''); setPw2(''); setAck(false); } catch (x) { setErr('Could not create the vault: ' + x.message); } setBusy(false);
  };
  const unlock = async () => {
    setErr(''); if (!pw) return; setBusy(true);
    try { const { key: k, payload: p } = await unlockEnvelope(pw, env); keySalt.current = env.salt; setKey(k); setPayload({ ...emptyPayload(), ...p, set: { ...DEFSET, ...(p.set || {}) }, gen: { ...DEFGEN, ...(p.gen || {}) } }); setPw(''); } catch { setErr('That password is not correct.'); } setBusy(false);
  };
  const eraseVault = async () => { if (!(await ask({ kind: 'confirm', title: 'Erase this vault', message: 'This permanently deletes the encrypted vault from this browser. If you have a backup you can restore it later. Continue?', okText: 'Erase vault', danger: true }))) return; setStored(() => ({ env: null })); lock(); };

  /* -------- clipboard -------- */
  const clipTimer = useRef(0);
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); } catch { toast('Copy was blocked by the browser'); return; } const s = set.clip; toast(s ? `${label} copied. Clipboard clears in ${s}s.` : `${label} copied`); clearTimeout(clipTimer.current); if (s) clipTimer.current = setTimeout(async () => { try { const cur = await navigator.clipboard.readText(); if (cur === text) await navigator.clipboard.writeText(''); } catch { try { await navigator.clipboard.writeText(''); } catch { /* ignore */ } } }, s * 1000); };

  /* -------- items -------- */
  const items = payload ? payload.items : [];
  const reused = useMemo(() => { const m = {}; items.forEach((i) => { if (i.pw) (m[i.pw] ||= []).push(i.id); }); return new Set(Object.values(m).filter((l) => l.length > 1).flat()); }, [items]);
  const audit = useMemo(() => { const weak = [], old = [], none = []; items.forEach((i) => { if (i.type !== 'login') return; if (!i.pw) { none.push(i); return; } if (strength(i.pw).score <= 2) weak.push(i); if (Date.now() - i.updated > 365 * 864e5) old.push(i); }); return { weak, old, none, reused: items.filter((i) => reused.has(i.id)) }; }, [items, reused]);
  const tags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); let l = items.filter((i) => (filter === 'all' || filter === 'audit') ? true : filter === 'fav' ? i.fav : TYPES.some((t) => t[0] === filter) ? i.type === filter : i.tags.includes(filter.slice(4))); if (s) l = l.filter((i) => [i.title, i.user, i.url, i.note, i.tags.join(' ')].join(' ').toLowerCase().includes(s)); return [...l].sort((a, b) => (b.fav - a.fav) || (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })); }, [items, filter, q]);
  const sel = items.find((i) => i.id === selId) || null;
  const saveItem = (it) => { const old = items.find((x) => x.id === it.id); const hist = old && old.pw && old.pw !== it.pw ? [{ pw: old.pw, at: old.updated }, ...(old.hist || [])].slice(0, 8) : (old ? old.hist : []) || []; const next = { ...it, hist, updated: Date.now(), title: it.title.trim() || host(it.url) || 'Untitled' }; mut((p) => ({ ...p, items: old ? p.items.map((x) => (x.id === it.id ? next : x)) : [...p.items, next] })); setSelId(it.id); setEditing(null); toast(old ? 'Saved' : 'Added to your vault'); };
  const delItem = async (it) => { if (!(await ask({ kind: 'confirm', title: 'Delete item', message: `Delete "${it.title}" permanently?`, okText: 'Delete', danger: true }))) return; mut((p) => ({ ...p, items: p.items.filter((x) => x.id !== it.id) })); setSelId(null); };
  const toggleFav = (it) => mut((p) => ({ ...p, items: p.items.map((x) => (x.id === it.id ? { ...x, fav: !x.fav } : x)) }));

  /* -------- settings / backup -------- */
  const upSet = (s) => mut((p) => ({ ...p, set: { ...p.set, ...s } }));
  const upGen = (g) => mut((p) => ({ ...p, gen: { ...p.gen, ...g } }));
  const exportEnc = async () => { await flushNow(); downloadFile(`techomato-vault-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(envRef.current), 'application/json'); toast('Encrypted backup downloaded'); };
  const exportCsv = async () => { if (!(await ask({ kind: 'confirm', title: 'Export unencrypted CSV', message: 'The CSV file will contain all your passwords in plain text. Anyone who can open it can read them. Delete it as soon as you are done.', okText: 'Export CSV', danger: true }))) return; const rows = [['name', 'url', 'username', 'password', 'note', 'totp', 'type']].concat(items.map((i) => [i.title, i.url, i.user, i.pw, i.note, i.totp, i.type])); downloadFile('techomato-vault-export.csv', rows.map((r) => r.map(csvEsc).join(',')).join('\n'), 'text/csv'); };
  const doImport = async () => { const f = await pickFile('.csv,text/csv'); if (!f) return; const list = importCsv(await readAsText(f)); if (!list.length) { toast('No logins found in that file'); return; } mut((p) => ({ ...p, items: [...p.items, ...list] })); toast(`Imported ${list.length} item${list.length > 1 ? 's' : ''}`); };
  const restoreEnc = async () => { const f = await pickFile('.json'); if (!f) return; try { const o = JSON.parse(await readAsText(f)); if (o.kind !== 'techomato-vault') throw new Error('x'); if (!(await ask({ kind: 'confirm', title: 'Restore vault backup', message: 'This replaces the vault stored in this browser with the backup. You will need the master password that was used for the backup.', okText: 'Restore', danger: true }))) return; setStored(() => ({ env: o })); lock(); toast('Backup restored. Unlock it with its master password.'); } catch { toast('That is not a Techomato vault backup'); } };

  const lockedScreen = !unlocked;
  return (
    <div className="fx vl" style={{ '--brand': '#3a42a8', '--brand-h': '#2c3385', '--brand-soft': '#e8eafa' }} data-app="vault">
      <AppBar id="vault" name="Techomato Vault" status={meta.status === 'error' ? 'error' : undefined}
        right={unlocked && <button className="fx-bar-btn vl-lock" onClick={async () => { await flushNow().catch(() => {}); lock(); }} aria-label="Lock vault"><Icon name="rectSel" size={16} /> Lock</button>}
        backup={{ name: 'vault', get: () => ({ env }), set: (d) => { const e = d && d.env && d.env.kind === 'techomato-vault' ? d.env : d && d.kind === 'techomato-vault' ? d : null; meta.replace({ env: e }); }, blank: () => ({ env: null }) }}
        extraMenu={[{ label: 'Restore encrypted backup…', onClick: restoreEnc }]} />
      {lockedScreen && (
        <div className="vl-gate">
          <form className="vl-card" onSubmit={(e) => { e.preventDefault(); env ? unlock() : create(); }}>
            <div className="vl-big"><Icon name="rectSel" size={34} /></div>
            <h2>{env ? 'Vault locked' : 'Create your vault'}</h2>
            {!env && <p className="vl-sub">Choose a master password. It encrypts everything in this browser, so only you can read it.</p>}
            {env && <p className="vl-sub">Enter your master password to unlock.</p>}
            <label className="vl-lbl">Master password<div className="vl-pwrow"><input className="fi" type={showPw ? 'text' : 'password'} autoFocus autoComplete={env ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Master password" /><button type="button" className="fb sub sm" onClick={() => setShowPw(!showPw)}>{showPw ? 'Hide' : 'Show'}</button></div></label>
            {!env && <><Meter pw={pw} />
              <label className="vl-lbl">Repeat master password<input className="fi" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} aria-label="Repeat master password" /></label>
              <label className="vl-chk"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand that if I forget this password, nobody can recover my data, not even Techomato.</label></>}
            {err && <div className="vl-err" role="alert">{err}</div>}
            <button className="fb pri lg block" disabled={busy || !pw}>{busy ? 'Working…' : env ? 'Unlock' : 'Create vault'}</button>
            <div className="vl-links">{env ? <><button type="button" className="vl-link" onClick={restoreEnc}>Restore a backup</button><button type="button" className="vl-link danger" onClick={eraseVault}>Forgot the password? Erase the vault</button></> : <button type="button" className="vl-link" onClick={restoreEnc}>I already have a backup file</button>}</div>
            <div className="vl-fine">Encrypted with AES-256-GCM. Your key comes from your password using PBKDF2-SHA-256 ({(ITER / 1000).toLocaleString()}k rounds). The vault lives only in this browser.</div>
          </form>
        </div>
      )}
      {unlocked && (
        <div className="vl-main">
          <nav className="vl-nav" aria-label="Filters">
            <button className="fb pri block" onClick={() => { const it = newItem(TYPES.some((t) => t[0] === filter) ? filter : 'login'); setEditing(it); setSelId(null); }}><Icon name="plus" size={14} /> New item</button>
            {[['all', 'All items', items.length], ['fav', 'Favourites', items.filter((i) => i.fav).length], ...TYPES.map(([k, l]) => [k, l + 's'.replace('Secure notes', 's'), items.filter((i) => i.type === k).length])].map(([k, l, n]) => <button key={k} className={'vl-f' + (filter === k ? ' on' : '')} onClick={() => { setFilter(k); setSelId(null); }}><span>{k === 'note' ? 'Secure notes' : k === 'card' ? 'Payment cards' : k === 'login' ? 'Logins' : l}</span><em>{n}</em></button>)}
            {tags.length > 0 && <div className="fx-head">Tags</div>}
            {tags.map((t) => <button key={t} className={'vl-f' + (filter === 'tag:' + t ? ' on' : '')} onClick={() => { setFilter('tag:' + t); setSelId(null); }}><span># {t}</span><em>{items.filter((i) => i.tags.includes(t)).length}</em></button>)}
            <div className="fx-head">Tools</div>
            <button className={'vl-f' + (filter === 'audit' ? ' on' : '')} onClick={() => { setFilter('audit'); setSelId(null); setEditing(null); }}><span>Password check</span><em className={audit.weak.length + audit.reused.length ? 'warn' : ''}>{audit.weak.length + audit.reused.length || '✓'}</em></button>
            <button className="vl-f" onClick={() => setDlg('gen')}><span>Password generator</span></button>
            <button className="vl-f" onClick={() => setDlg('settings')}><span>Settings</span></button>
          </nav>
          {filter === 'audit' ? <Audit audit={audit} onOpen={(id) => { setFilter('all'); setSelId(id); }} /> : <>
            <section className="vl-list" aria-label="Items">
              <div className="vl-search"><input className="fi" placeholder="Search your vault" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <div className="vl-items">{shown.length === 0 && <div className="vl-none">{items.length ? 'Nothing matches.' : 'Your vault is empty. Add your first item, or import a CSV from another password manager in Settings.'}</div>}
                {shown.map((it) => <button key={it.id} className={'vl-item' + (selId === it.id ? ' on' : '')} onClick={() => { setSelId(it.id); setEditing(null); }}><span className="vl-ico" style={{ background: hue(it.title) }}>{(it.title || '?')[0].toUpperCase()}</span><span className="vl-it"><b className="ellip">{it.title}</b><small className="ellip">{it.type === 'login' ? it.user || host(it.url) : it.type === 'card' ? '•••• ' + (it.cardNo || '').slice(-4) : 'Secure note'}</small></span>{it.fav && <span className="vl-star">★</span>}{reused.has(it.id) && <span className="vl-flag" title="Password reused">!</span>}</button>)}</div>
            </section>
            <section className="vl-detail" aria-label="Item details">
              {editing ? <Edit key={editing.id} item={editing} gen={payload.gen} onGen={upGen} onSave={saveItem} onCancel={() => setEditing(null)} existingTags={tags} /> : sel ? <View item={sel} copy={copy} onEdit={() => setEditing({ ...sel })} onDelete={() => delItem(sel)} onFav={() => toggleFav(sel)} reused={reused.has(sel.id)} /> : <div className="fx-empty vl-empty"><div className="vl-big"><Icon name="rectSel" size={30} /></div><p>Select an item to see its details.</p></div>}
            </section></>}
        </div>
      )}
      {dlg === 'gen' && <GenDialog gen={payload.gen} onGen={upGen} copy={copy} onClose={() => setDlg(null)} />}
      {dlg === 'settings' && <SettingsDialog set={payload.set} upSet={upSet} onClose={() => setDlg(null)} exportEnc={exportEnc} exportCsv={exportCsv} doImport={doImport} onChangePw={() => setDlg('chpw')} count={items.length} />}
      {dlg === 'chpw' && <ChangePw onClose={() => setDlg(null)} env={env} onDone={async (np) => { const { env: e2, key: k2 } = await createEnvelope(np, payload); keySalt.current = e2.salt; setKey(k2); dirty.current = false; setStored(() => ({ env: e2 })); setDlg(null); toast('Master password changed'); }} />}
      {toastNode}{askNode}
    </div>
  );
}
const hue = (s) => { let h = 0; for (const c of s || '?') h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 42%)`; };

function Meter({ pw }) { const s = strength(pw); return <div className="vl-meter" aria-live="polite"><div className="vl-bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= s.score ? 's' + s.score : ''} />)}</div><span>{pw ? `${s.label} · about ${s.bits} bits` : 'Pick something long. A few random words work well.'}</span>{pw && s.tips.length > 0 && <small>{s.tips[0]}</small>}</div>; }

function Secret({ label, value, copy, mono }) { const [show, setShow] = useState(false); if (!value) return null; return <div className="vl-row"><label>{label}</label><div className="vl-val"><span className={mono ? 'mono' : ''}>{show ? value : '••••••••••••'}</span><button className="fb sub sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button><button className="fb sub sm" onClick={() => copy(value, label)}>Copy</button></div></div>; }
function Field({ label, value, copy, link }) { if (!value) return null; return <div className="vl-row"><label>{label}</label><div className="vl-val"><span className="ellip">{value}</span>{link && <a className="fb sub sm" href={/^https?:\/\//i.test(value) ? value : 'https://' + value} target="_blank" rel="noopener noreferrer">Open</a>}<button className="fb sub sm" onClick={() => copy(value, label)}>Copy</button></div></div>; }
function Totp({ secret, copy }) {
  const [c, setC] = useState(''); const [left, setLeft] = useState(30);
  useEffect(() => { let on = true; const tick = async () => { try { const v = await totp(secret); if (on) setC(v); } catch { if (on) setC('invalid'); } if (on) setLeft(30 - (Math.floor(Date.now() / 1000) % 30)); }; tick(); const i = setInterval(tick, 1000); return () => { on = false; clearInterval(i); }; }, [secret]);
  if (!secret) return null; return <div className="vl-row"><label>One-time code</label><div className="vl-val"><span className="mono vl-otp">{c === 'invalid' ? 'Invalid secret' : c.replace(/(\d{3})(\d{3})/, '$1 $2')}</span><span className="vl-left" style={{ '--p': left / 30 }}>{left}s</span>{c !== 'invalid' && <button className="fb sub sm" onClick={() => copy(c, 'Code')}>Copy</button>}</div></div>;
}
function View({ item, copy, onEdit, onDelete, onFav, reused }) {
  const st = item.type === 'login' && item.pw ? strength(item.pw) : null;
  return (
    <div className="vl-view">
      <header className="vl-vh"><span className="vl-ico lg" style={{ background: hue(item.title) }}>{(item.title || '?')[0].toUpperCase()}</span><div className="vl-vt"><h2 className="ellip">{item.title}</h2><small>{TYPES.find((t) => t[0] === item.type)[1]} · updated {fmtD(item.updated)}</small></div><div className="spacer" /><button className="fb sub" onClick={onFav} aria-pressed={item.fav}>{item.fav ? '★ Favourite' : '☆ Favourite'}</button><button className="fb" onClick={onEdit}><Icon name="edit" size={14} /> Edit</button><button className="fb sub" onClick={onDelete} aria-label="Delete item"><Icon name="trash" size={14} /></button></header>
      {item.type === 'login' && <><Field label="Username" value={item.user} copy={copy} /><Secret label="Password" value={item.pw} copy={copy} mono />{st && <div className="vl-row"><label>Strength</label><div className="vl-val"><span className={'vl-badge s' + st.score}>{st.label}</span><small>{st.bits} bits{reused ? ' · reused in another item' : ''}</small></div></div>}<Field label="Website" value={item.url} copy={copy} link /><Totp secret={item.totp} copy={copy} /></>}
      {item.type === 'card' && <><Field label="Name on card" value={item.cardName} copy={copy} /><Secret label="Card number" value={item.cardNo} copy={copy} mono /><Field label="Expires" value={item.exp} copy={copy} /><Secret label="Security code" value={item.cvv} copy={copy} mono /></>}
      {item.note && <div className="vl-row col"><label>Notes</label><div className="vl-notev">{item.note}</div></div>}
      {item.tags.length > 0 && <div className="vl-row"><label>Tags</label><div className="vl-tags">{item.tags.map((t) => <span key={t} className="fx-chip"># {t}</span>)}</div></div>}
      {item.hist && item.hist.length > 0 && <details className="vl-hist"><summary>Previous passwords ({item.hist.length})</summary>{item.hist.map((h, i) => <Secret key={i} label={fmtD(h.at)} value={h.pw} copy={copy} mono />)}</details>}
    </div>
  );
}
function Edit({ item, gen, onGen, onSave, onCancel, existingTags }) {
  const [it, setIt] = useState(item); const set = (p) => setIt((x) => ({ ...x, ...p })); const [showG, setShowG] = useState(false); const [tagIn, setTagIn] = useState(''); const isNew = !item.updatedOnce && item.title === '' && item.pw === '' && item.note === '' && item.user === '';
  const addTag = () => { const t = tagIn.trim().toLowerCase().replace(/\s+/g, '-'); if (t && !it.tags.includes(t)) set({ tags: [...it.tags, t] }); setTagIn(''); };
  return (
    <form className="vl-edit" onSubmit={(e) => { e.preventDefault(); onSave({ ...it, tags: tagIn.trim() ? [...new Set([...it.tags, tagIn.trim().toLowerCase().replace(/\s+/g, '-')])] : it.tags }); }}>
      <h2>{isNew ? 'New ' + TYPES.find((t) => t[0] === it.type)[1].toLowerCase() : 'Edit item'}</h2>
      <label className="vl-lbl">Type<select className="fi" aria-label="Type" value={it.type} onChange={(e) => set({ type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="vl-lbl">Name<input className="fi" autoFocus aria-label="Name" value={it.title} onChange={(e) => set({ title: e.target.value })} placeholder={it.type === 'login' ? 'For example: GitHub' : ''} /></label>
      {it.type === 'login' && <>
        <label className="vl-lbl">Username or email<input className="fi" aria-label="Username" autoComplete="off" value={it.user} onChange={(e) => set({ user: e.target.value })} /></label>
        <label className="vl-lbl">Password<div className="vl-pwrow"><input className="fi mono" aria-label="Password" autoComplete="new-password" value={it.pw} onChange={(e) => set({ pw: e.target.value })} /><button type="button" className="fb sm" onClick={() => setShowG(!showG)}>Generate</button></div></label>
        {it.pw && <Meter pw={it.pw} />}
        {showG && <GenPanel gen={gen} onGen={onGen} onUse={(p) => { set({ pw: p }); setShowG(false); }} />}
        <label className="vl-lbl">Website<input className="fi" aria-label="Website" value={it.url} onChange={(e) => set({ url: e.target.value })} placeholder="example.com" /></label>
        <label className="vl-lbl">Two-factor secret <small>(optional, to show 6-digit codes)</small><input className="fi mono" aria-label="Two-factor secret" autoComplete="off" value={it.totp} onChange={(e) => set({ totp: parseOtpAuth(e.target.value) })} placeholder="JBSWY3DPEHPK3PXP or an otpauth:// link" /></label></>}
      {it.type === 'card' && <>
        <label className="vl-lbl">Name on card<input className="fi" value={it.cardName} onChange={(e) => set({ cardName: e.target.value })} /></label>
        <label className="vl-lbl">Card number<input className="fi mono" inputMode="numeric" autoComplete="off" value={it.cardNo} onChange={(e) => set({ cardNo: e.target.value })} /></label>
        <div className="vl-two"><label className="vl-lbl">Expires<input className="fi" placeholder="MM/YY" value={it.exp} onChange={(e) => set({ exp: e.target.value })} /></label><label className="vl-lbl">Security code<input className="fi mono" inputMode="numeric" autoComplete="off" value={it.cvv} onChange={(e) => set({ cvv: e.target.value })} /></label></div></>}
      <label className="vl-lbl">Notes<textarea className="fi" rows={it.type === 'note' ? 10 : 3} aria-label="Notes" value={it.note} onChange={(e) => set({ note: e.target.value })} /></label>
      <div className="vl-lbl">Tags<div className="vl-tags">{it.tags.map((t) => <button key={t} type="button" className="fx-chip" onClick={() => set({ tags: it.tags.filter((x) => x !== t) })} title="Remove tag"># {t} ×</button>)}<input className="fi vl-tagin" list="vl-tags" placeholder="Add tag" value={tagIn} onChange={(e) => setTagIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} /><datalist id="vl-tags">{existingTags.map((t) => <option key={t} value={t} />)}</datalist></div></div>
      <div className="vl-actions"><button type="button" className="fb" onClick={onCancel}>Cancel</button><button className="fb pri">Save</button></div>
    </form>
  );
}
function GenPanel({ gen, onGen, onUse, copy }) {
  const [out, setOut] = useState(''); const make = useCallback(() => setOut(gen.mode === 'phrase' ? genPassphrase(gen) : genPassword(gen)), [gen]); useEffect(() => { make(); }, [make]);
  const bits = genBits(gen, gen.mode); const s = bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return (
    <div className="vl-gen">
      <div className="fx-seg" role="group" aria-label="Generator type"><button type="button" className={gen.mode === 'password' ? 'on' : ''} onClick={() => onGen({ mode: 'password' })}>Password</button><button type="button" className={gen.mode === 'phrase' ? 'on' : ''} onClick={() => onGen({ mode: 'phrase' })}>Passphrase</button></div>
      <div className="vl-genout"><code aria-label="Generated password">{out}</code><button type="button" className="fb sub sm" onClick={make} aria-label="Regenerate">↻</button></div>
      <div className="vl-meter"><div className="vl-bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= s ? 's' + s : ''} />)}</div><span>About {bits} bits of randomness</span></div>
      {gen.mode === 'password' ? <>
        <label className="vl-lbl">Length <b>{gen.length}</b><input type="range" min="8" max="64" value={gen.length} onChange={(e) => onGen({ length: +e.target.value })} aria-label="Length" /></label>
        <div className="vl-opts">{[['lower', 'a–z'], ['upper', 'A–Z'], ['digits', '0–9'], ['symbols', '!@#$']].map(([k, l]) => <label key={k} className="vl-chk"><input type="checkbox" checked={gen[k]} onChange={(e) => onGen({ [k]: e.target.checked })} /> {l}</label>)}<label className="vl-chk"><input type="checkbox" checked={gen.ambig} onChange={(e) => onGen({ ambig: e.target.checked })} /> No look-alikes (l, 1, O, 0)</label></div></> : <>
        <label className="vl-lbl">Words <b>{gen.words}</b><input type="range" min="4" max="10" value={gen.words} onChange={(e) => onGen({ words: +e.target.value })} aria-label="Words" /></label>
        <div className="vl-opts"><label className="vl-chk"><input type="checkbox" checked={gen.cap} onChange={(e) => onGen({ cap: e.target.checked })} /> Capitalise</label><label className="vl-chk"><input type="checkbox" checked={gen.num} onChange={(e) => onGen({ num: e.target.checked })} /> Add a number</label><label className="vl-chk">Separator <select className="fi" style={{ width: 70, height: 28 }} value={gen.sep} onChange={(e) => onGen({ sep: e.target.value })}>{['-', '.', '_', ' ', ''].map((x) => <option key={x} value={x}>{x === ' ' ? 'space' : x || 'none'}</option>)}</select></label></div>
        <small className="muted">{WORD_COUNT} words in the list, so each word adds about {Math.log2(WORD_COUNT).toFixed(1)} bits.</small></>}
      <div className="vl-actions">{copy && <button type="button" className="fb" onClick={() => copy(out, 'Password')}>Copy</button>}{onUse && <button type="button" className="fb pri" onClick={() => onUse(out)}>Use this password</button>}</div>
    </div>
  );
}
function GenDialog({ gen, onGen, copy, onClose }) { return <Modal title="Password generator" onClose={onClose} width={460} footer={<button className="fb pri" onClick={onClose}>Close</button>}><GenPanel gen={gen} onGen={onGen} copy={copy} /></Modal>; }
function Audit({ audit, onOpen }) {
  const Sec = ({ title, list, hint }) => <div className="vl-asec"><h3>{title} <em>{list.length}</em></h3><p>{hint}</p>{list.length === 0 ? <div className="vl-ok">All clear</div> : list.map((i) => <button key={i.id} className="vl-aitem" onClick={() => onOpen(i.id)}><b>{i.title}</b><small>{i.user || host(i.url)}</small></button>)}</div>;
  return <section className="vl-audit" aria-label="Password check"><h2>Password check</h2><p className="muted">Everything is checked on this device. Nothing is sent anywhere.</p><Sec title="Weak passwords" list={audit.weak} hint="Easy to guess. Replace them with generated passwords." /><Sec title="Reused passwords" list={audit.reused} hint="If one site is breached, every account sharing this password is at risk." /><Sec title="Not changed in over a year" list={audit.old} hint="Consider rotating these, especially for important accounts." /><Sec title="Logins without a password" list={audit.none} hint="These logins have no password saved." /></section>;
}
function SettingsDialog({ set, upSet, onClose, exportEnc, exportCsv, doImport, onChangePw, count }) {
  return <Modal title="Vault settings" onClose={onClose} width={500} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
    <div className="fx-kv vl-kv"><label>Auto-lock</label><select className="fi" aria-label="Auto-lock" value={set.autoLock} onChange={(e) => upSet({ autoLock: +e.target.value })}>{[[1, 'After 1 minute idle'], [5, 'After 5 minutes idle'], [15, 'After 15 minutes idle'], [30, 'After 30 minutes idle'], [0, 'Never (until I lock it)']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <label>Clear clipboard</label><select className="fi" aria-label="Clear clipboard" value={set.clip} onChange={(e) => upSet({ clip: +e.target.value })}>{[[15, 'After 15 seconds'], [30, 'After 30 seconds'], [60, 'After 1 minute'], [0, 'Never']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
    <label className="vl-chk" style={{ margin: '10px 0' }}><input type="checkbox" checked={set.lockHidden} onChange={(e) => upSet({ lockHidden: e.target.checked })} /> Lock when I switch to another tab or window</label>
    <div className="fx-head">Master password</div><button className="fb" onClick={onChangePw}>Change master password…</button>
    <div className="fx-head">Backup ({count} item{count === 1 ? '' : 's'})</div>
    <div className="vl-btns"><button className="fb" onClick={exportEnc}>Download encrypted backup</button><button className="fb" onClick={doImport}>Import CSV…</button><button className="fb sub" onClick={exportCsv}>Export CSV (not encrypted)…</button></div>
    <p className="muted" style={{ marginBottom: 0 }}>Your vault exists only in this browser. Clearing site data or using a different browser will not carry it over, so keep an encrypted backup somewhere safe. The backup is useless without your master password.</p>
  </Modal>;
}
function ChangePw({ onClose, env, onDone }) {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [c, setC] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { setErr(''); if (b.length < 8) { setErr('Use at least 8 characters.'); return; } if (b !== c) { setErr('The new passwords do not match.'); return; } setBusy(true); try { await unlockEnvelope(a, env); await onDone(b); } catch { setErr('The current password is not correct.'); } setBusy(false); };
  return <Modal title="Change master password" onClose={onClose} width={440} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={busy} onClick={go}>{busy ? 'Working…' : 'Change password'}</button></>}>
    <label className="vl-lbl">Current password<input className="fi" type="password" autoFocus value={a} onChange={(e) => setA(e.target.value)} aria-label="Current password" /></label>
    <label className="vl-lbl">New password<input className="fi" type="password" value={b} onChange={(e) => setB(e.target.value)} aria-label="New password" /></label><Meter pw={b} />
    <label className="vl-lbl">Repeat new password<input className="fi" type="password" value={c} onChange={(e) => setC(e.target.value)} aria-label="Repeat new password" /></label>
    {err && <div className="vl-err" role="alert">{err}</div>}<p className="muted" style={{ marginBottom: 0 }}>Old backups still need the old password.</p></Modal>;
}
