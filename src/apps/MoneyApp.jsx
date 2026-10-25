import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast, useAsk, useContextMenu, download } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { pickFile, readAsText } from '../lib/download.js';
import { ymd } from '../lib/cal.js';
import Register from './money/Register.jsx';
import { Overview, BudgetView, Reports, Bills, Goals } from './money/Views.jsx';
import { blankData, migrate, sampleData, newTx, money, balances, id, parts, r2, parseAmount, parseCsv, guessColumns, importRows, dupKey, txToCsv, ACC_TYPES, ACC_GROUPS, COLORS, CURRENCIES, FREQS, nextDate, dueRecurring, netWorth, catById } from './money/model.js';
import '../styles/money.css';

const NAV = [['overview', 'Overview', 'home'], ['tx', 'Transactions', 'receipt'], ['budget', 'Budget', 'chartPie'], ['reports', 'Reports', 'chartBar'], ['bills', 'Bills & recurring', 'repeat'], ['goals', 'Goals', 'target']];
const accIcon = (t) => (ACC_TYPES.find((x) => x[0] === t) || [0, 0, 'bank'])[2];

export default function MoneyApp() {
  const [data, set, meta] = useStore('money', blankData, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [menu, showMenu] = useContextMenu();
  const [dlg, setDlg] = useState(null); const [jump, setJump] = useState(null); const [navOpen, setNavOpen] = useState(false);
  const cur = data.settings.currency; const fmt = useCallback((n, o) => money(n, cur, { hideCents: data.settings.hideCents, ...o }), [cur, data.settings.hideCents]);
  const cn = useMemo(() => catById(data), [data.cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const bal = useMemo(() => balances(data), [data.tx, data.accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const openAccounts = data.accounts.filter((a) => !a.closed); const view = data.ui.view;
  const payees = useMemo(() => [...new Set(data.tx.map((t) => t.payee).filter(Boolean))].sort().slice(0, 400), [data.tx]);
  const setUi = (patch) => set((d) => ({ ...d, ui: { ...d.ui, ...patch } }));
  const go = (v, o = {}) => { setUi({ view: v, acc: o.acc !== undefined ? o.acc : v === 'tx' && !o.jump ? data.ui.acc : null }); if (o.jump) setJump(o.jump); setNavOpen(false); };

  /* post auto recurring that are due */
  const didAuto = useRef(false);
  useEffect(() => {
    if (didAuto.current) return; didAuto.current = true; const today = ymd(new Date()); let n = 0;
    set((d) => { let tx = d.tx; const rec = d.recurring.map((r) => { if (!r.auto || r.next > today) return r; const due = dueRecurring({ ...r, anchorDay: r.anchorDay }, today); if (!due.dates.length) return r; tx = [...due.dates.map((dt) => newTx({ acc: r.acc, date: dt, payee: r.payee, cat: r.cat, amount: r.amount, note: r.note || '', to: r.to || null })), ...tx]; n += due.dates.length; return { ...r, next: due.next }; }); if (!n) return d; return { ...d, tx, recurring: rec }; });
    if (n) setTimeout(() => toast(`Posted ${n} scheduled transaction${n === 1 ? '' : 's'}`), 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTx = (t) => { const row = { ...t, id: t.id || id() }; set((d) => { const i = d.tx.findIndex((x) => x.id === row.id); const tx = i >= 0 ? d.tx.map((x) => (x.id === row.id ? row : x)) : [row, ...d.tx]; tx.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); return { ...d, tx }; }); };
  const delTx = (ids) => { const gone = data.tx.filter((t) => ids.includes(t.id)); set((d) => ({ ...d, tx: d.tx.filter((t) => !ids.includes(t.id)) })); setDlg(null); toast(`Deleted ${ids.length} transaction${ids.length === 1 ? '' : 's'}`, { action: { label: 'Undo', onClick: () => set((d) => ({ ...d, tx: [...gone, ...d.tx].sort((a, b) => (a.date < b.date ? 1 : -1)) })) } }); };
  const X = { data, set, fmt, cn, cur, bal, toast, ask, jump, clearJump: () => setJump(null), go, openAccounts, payees, saveTx, delTx,
    edit: (t) => setDlg({ k: 'tx', t }), editRecurring: (r) => setDlg({ k: 'rec', r }), addAccount: () => setDlg({ k: 'acc', a: null }), importCsv: () => doImport(), exportCsv: (rows) => { download(`techomato-money-${ymd(new Date())}.csv`, txToCsv(data, rows || data.tx), 'text/csv'); toast(`Exported ${(rows || data.tx).length} transactions`); }, reconcile: (a) => setDlg({ k: 'rec-acc', a }),
    loadSample: async () => { if (data.tx.length && !(await ask({ title: 'Replace your data?', message: 'Sample data replaces everything in Techomato Money on this browser.', okText: 'Replace', danger: true }))) return; meta.replace({ ...sampleData(), ui: { view: 'overview', acc: null } }); toast('Sample data loaded'); } };
  const doImport = async () => { const f = await pickFile('.csv,.tsv,.txt,text/csv'); if (!f) return; try { const text = await readAsText(f); const rows = parseCsv(text); if (rows.length < 2) { toast('That file has no rows'); return; } setDlg({ k: 'import', rows, name: f.name }); } catch { toast('Could not read that file'); } };

  useEffect(() => { const kd = (e) => { const t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey || dlg) return; if (e.key === 'n') { e.preventDefault(); setDlg({ k: 'tx', t: null }); } }; window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd); }, [dlg]);

  const groups = {}; data.accounts.filter((a) => !a.closed).forEach((a) => { (groups[ACC_GROUPS[a.type] || 'Other'] ||= []).push(a); });
  const closed = data.accounts.filter((a) => a.closed);
  const accMenu = (e, a) => { e.preventDefault(); showMenu(e, [{ label: 'Edit account…', icon: 'edit', onClick: () => setDlg({ k: 'acc', a }) }, { label: 'Reconcile…', icon: 'circleCheck', onClick: () => setDlg({ k: 'rec-acc', a }) }, { label: a.closed ? 'Reopen account' : 'Close account', icon: 'archive', onClick: () => set((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === a.id ? { ...x, closed: !x.closed } : x)) })) }]); };
  const body = view === 'tx' ? <Register X={X} /> : view === 'budget' ? <BudgetView X={X} /> : view === 'reports' ? <Reports X={X} /> : view === 'bills' ? <Bills X={X} /> : view === 'goals' ? <Goals X={X} /> : <Overview X={X} />;

  return (
    <div className="fx mny" style={{ '--brand': '#0b7a75', '--brand-h': '#096560', '--brand-soft': 'color-mix(in srgb, #0b7a75 14%, var(--bg))' }}>
      <AppBar id="money" name="Techomato Money" status={meta.status === 'error' ? 'error' : undefined}
        right={<button className="fx-bar-btn" onClick={() => setDlg({ k: 'settings' })} aria-label="Settings" title="Settings"><Icon name="settings" size={17} /></button>}
        backup={{ name: 'money', get: () => data, set: (v) => meta.replace(migrate(v)), blank: () => blankData() }}
        extraMenu={[{ label: 'Import transactions (CSV)…', onClick: doImport }, { label: 'Export all transactions (CSV)', onClick: () => X.exportCsv() }, { sep: true }, { label: 'Load sample data', onClick: X.loadSample }]} />
      <div className="mny-body">
        <button className="mny-burger fb ico" aria-label="Menu" onClick={() => setNavOpen(!navOpen)}><Icon name="menu" size={18} /></button>
        <nav className={'mny-nav' + (navOpen ? ' open' : '')} aria-label="Money navigation">
          <button className="fb pri block" onClick={() => setDlg({ k: 'tx', t: null })}><Icon name="plus" size={16} />Add transaction</button>
          <div className="mny-navl">{NAV.map(([k, n, ic]) => <button key={k} className={'mny-ni' + (view === k && !(k === 'tx' && data.ui.acc) ? ' on' : '')} aria-current={view === k && !(k === 'tx' && data.ui.acc) ? 'page' : undefined} onClick={() => go(k, k === 'tx' ? { acc: null } : {})}><Icon name={ic} size={17} />{n}</button>)}</div>
          <div className="mny-navh"><span>Accounts</span><button className="fb sub ico sm" aria-label="Add account" title="Add account" onClick={() => setDlg({ k: 'acc', a: null })}><Icon name="plus" size={14} /></button></div>
          <div className="mny-accs">{Object.entries(groups).map(([g, list]) => <div key={g}><div className="mny-gh"><span>{g}</span><b>{fmt(list.reduce((s, a) => s + bal[a.id], 0))}</b></div>
            {list.map((a) => <button key={a.id} className={'mny-na' + (view === 'tx' && data.ui.acc === a.id ? ' on' : '')} onClick={() => go('tx', { acc: a.id })} onContextMenu={(e) => accMenu(e, a)}><span className="ico" style={{ background: a.color }}><Icon name={accIcon(a.type)} size={13} /></span><span className="ellip grow">{a.name}</span><span className={bal[a.id] < 0 ? 'neg' : ''}>{fmt(bal[a.id])}</span></button>)}</div>)}
            {closed.length > 0 && <div><div className="mny-gh"><span>Closed</span></div>{closed.map((a) => <button key={a.id} className={'mny-na closed' + (view === 'tx' && data.ui.acc === a.id ? ' on' : '')} onClick={() => go('tx', { acc: a.id })} onContextMenu={(e) => accMenu(e, a)}><span className="ico" style={{ background: '#8a8a8a' }}><Icon name={accIcon(a.type)} size={13} /></span><span className="ellip grow">{a.name}</span><span>{fmt(bal[a.id])}</span></button>)}</div>}</div>
          <div className="mny-nw"><span>Net worth</span><b className={netWorth(data) < 0 ? 'neg' : ''}>{fmt(netWorth(data))}</b></div>
        </nav>
        <main className="mny-main" id="mny-main">{body}</main>
      </div>
      {dlg && dlg.k === 'tx' && <TxEditor X={X} tx={dlg.t} onClose={() => setDlg(null)} />}
      {dlg && dlg.k === 'acc' && <AccountEditor X={X} a={dlg.a} onClose={() => setDlg(null)} />}
      {dlg && dlg.k === 'rec' && <RecurringEditor X={X} r={dlg.r} onClose={() => setDlg(null)} />}
      {dlg && dlg.k === 'rec-acc' && <Reconcile X={X} a={dlg.a} onClose={() => setDlg(null)} />}
      {dlg && dlg.k === 'import' && <ImportDialog X={X} rows={dlg.rows} name={dlg.name} onClose={() => setDlg(null)} />}
      {dlg && dlg.k === 'settings' && <SettingsDialog X={X} onClose={() => setDlg(null)} />}
      {toastNode}{askNode}{menu}
    </div>
  );
}

/* ---------- transaction editor ---------- */
function TxEditor({ X, tx, onClose }) {
  const { data, fmt, toast, cn } = X; const isNew = !tx || !tx.id; const base = tx || newTx({ acc: X.data.ui.acc || X.openAccounts[0].id });
  const [type, setType] = useState(base.to ? 'transfer' : base.amount > 0 ? 'income' : 'expense'); const [amt, setAmt] = useState(base.amount ? String(Math.abs(base.amount)) : '');
  const [date, setDate] = useState(base.date); const [acc, setAcc] = useState(base.acc || X.openAccounts[0].id); const [to, setTo] = useState(base.to || ''); const [payee, setPayee] = useState(base.payee || ''); const [cat, setCat] = useState(base.cat || '');
  const [note, setNote] = useState(base.note || ''); const [tags, setTags] = useState((base.tags || []).join(' ')); const [cleared, setCleared] = useState(!!base.cleared); const [split, setSplit] = useState(!!base.splits);
  const [rows, setRows] = useState(base.splits ? base.splits.map((s) => ({ cat: s.cat || '', amt: String(Math.abs(s.amount)) })) : [{ cat: '', amt: '' }, { cat: '', amt: '' }]); const [rep, setRep] = useState(''); const [err, setErr] = useState('');
  const total = Math.abs(parseAmount(amt) || 0); const splitSum = rows.reduce((s, r) => s + (parseAmount(r.amt) || 0), 0); const remain = r2(total - splitSum);
  const cats = data.cats.filter((c) => c.group === (type === 'income' ? 'income' : 'expense'));
  useEffect(() => { if (type === 'transfer') setSplit(false); }, [type]);
  const onPayee = (v) => { setPayee(v); if (!isNew || type === 'transfer') return; const m = data.tx.find((t) => !t.to && t.payee && t.payee.toLowerCase() === v.toLowerCase()); if (m) { if (!cat && m.cat && !m.splits) setCat(m.cat); if (!amt) setAmt(String(Math.abs(m.amount))); } };
  const save = (again) => {
    const a = parseAmount(amt); if (isNaN(a) || a <= 0) { setErr('Enter an amount greater than zero.'); return; } if (!date) { setErr('Pick a date.'); return; }
    if (type === 'transfer' && (!to || to === acc)) { setErr('Choose a different account to transfer to.'); return; }
    const sign = type === 'income' ? 1 : -1; const row = { ...base, acc, date, payee: payee.trim(), amount: r2(type === 'transfer' ? -a : sign * a), note: note.trim(), cleared, to: type === 'transfer' ? to : null, cat: type === 'transfer' || split ? null : cat || null, splits: null, tags: tags.split(/[\s,]+/).map((x) => x.replace(/^#/, '')).filter(Boolean) };
    if (split && type !== 'transfer') { const list = rows.filter((r) => r.cat || parseAmount(r.amt)); if (list.length < 2) { setErr('A split needs at least two lines.'); return; } if (Math.abs(remain) > 0.005) { setErr(`Split lines must add up to ${fmt(a)} (${fmt(Math.abs(remain))} ${remain > 0 ? 'left' : 'over'}).`); return; } row.splits = list.map((r) => ({ cat: r.cat || null, amount: r2(sign * Math.abs(parseAmount(r.amt) || 0)) })); }
    X.saveTx(row);
    if (isNew && rep) X.set((d) => ({ ...d, recurring: [...d.recurring, { id: id(), acc, payee: row.payee, cat: row.cat, amount: row.amount, to: row.to, freq: rep, next: nextDate(date, rep), anchorDay: +date.slice(8), end: null, auto: false, note: row.note }] }));
    toast(isNew ? 'Transaction added' : 'Saved');
    if (again) { setAmt(''); setPayee(''); setNote(''); setCat(''); setErr(''); setTags(''); } else onClose();
  };
  return (
    <Modal title={isNew ? 'Add transaction' : 'Edit transaction'} onClose={onClose} width={560} footer={<>{!isNew && <button className="fb danger" style={{ marginRight: 'auto' }} onClick={() => { onClose(); X.delTx([base.id]); }}><Icon name="trash" size={14} />Delete</button>}<button className="fb" onClick={onClose}>Cancel</button>{isNew && <button className="fb" onClick={() => save(true)}>Save &amp; add another</button>}<button className="fb pri" onClick={() => save(false)}>Save</button></>}>
      <div className="fx-seg mny-typeseg" role="group" aria-label="Type">{[['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']].map(([k, n]) => <button key={k} className={type === k ? 'on' : ''} aria-pressed={type === k} onClick={() => setType(k)}>{n}</button>)}</div>
      <div className="mny-amtbox"><span>{(() => { try { return (0).toLocaleString(undefined, { style: 'currency', currency: X.cur }).replace(/[0-9.,\s]/g, ''); } catch { return ''; } })()}</span><input autoFocus inputMode="decimal" aria-label="Amount" placeholder="0.00" value={amt} onChange={(e) => { setAmt(e.target.value); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && save(false)} /></div>
      <div className="fx-kv mny-kv">
        <label htmlFor="mt-date">Date</label><input id="mt-date" type="date" className="fi" value={date} onChange={(e) => setDate(e.target.value)} />
        <label htmlFor="mt-acc">{type === 'transfer' ? 'From' : 'Account'}</label><select id="mt-acc" className="fi" value={acc} onChange={(e) => setAcc(e.target.value)}>{data.accounts.filter((a) => !a.closed || a.id === acc).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {type === 'transfer' && <><label htmlFor="mt-to">To</label><select id="mt-to" className="fi" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose account…</option>{data.accounts.filter((a) => a.id !== acc && !a.closed).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></>}
        <label htmlFor="mt-payee">{type === 'income' ? 'From' : type === 'transfer' ? 'Description' : 'Payee'}</label><input id="mt-payee" className="fi" list="mny-payees2" value={payee} onChange={(e) => onPayee(e.target.value)} placeholder={type === 'transfer' ? 'e.g. Monthly savings' : 'Who was it?'} />
        {type !== 'transfer' && !split && <><label htmlFor="mt-cat">Category</label><select id="mt-cat" className="fi" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Uncategorised</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></>}
      </div>
      {type !== 'transfer' && <label className="chk" style={{ margin: '8px 0 4px' }}><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />Split across categories</label>}
      {split && type !== 'transfer' && <div className="mny-splits">{rows.map((r, i) => <div key={i} className="row"><select className="fi" aria-label={`Split ${i + 1} category`} value={r.cat} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, cat: e.target.value } : x)))}><option value="">Uncategorised</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input className="fi r" inputMode="decimal" aria-label={`Split ${i + 1} amount`} placeholder="0.00" value={r.amt} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amt: e.target.value } : x)))} /><button className="fb sub ico sm" aria-label="Remove line" onClick={() => rows.length > 2 && setRows(rows.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button></div>)}
        <div className="row foot"><button className="fb sm" onClick={() => setRows([...rows, { cat: '', amt: remain > 0 ? String(remain) : '' }])}><Icon name="plus" size={13} />Add line</button><span className={Math.abs(remain) > 0.005 ? 'neg' : 'pos'}>{Math.abs(remain) <= 0.005 ? 'Adds up ✓' : `${fmt(Math.abs(remain))} ${remain > 0 ? 'left to assign' : 'over'}`}</span></div></div>}
      <div className="fx-kv mny-kv" style={{ marginTop: 8 }}>
        <label htmlFor="mt-note">Note</label><input id="mt-note" className="fi" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        <label htmlFor="mt-tags">Tags</label><input id="mt-tags" className="fi" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trip, reimbursable" />
        {isNew && <><label htmlFor="mt-rep">Repeat</label><select id="mt-rep" className="fi" value={rep} onChange={(e) => setRep(e.target.value)}><option value="">Does not repeat</option>{FREQS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></>}
      </div>
      <label className="chk" style={{ marginTop: 10 }}><input type="checkbox" checked={cleared} onChange={(e) => setCleared(e.target.checked)} />Cleared (appears on my bank statement)</label>
      {err && <div className="mny-err" role="alert">{err}</div>}
      <datalist id="mny-payees2">{X.payees.map((p) => <option key={p} value={p} />)}</datalist>
    </Modal>
  );
}

function AccountEditor({ X, a, onClose }) {
  const { data, set, fmt } = X; const [name, setName] = useState(a ? a.name : ''); const [type, setType] = useState(a ? a.type : 'checking'); const [start, setStart] = useState(a ? String(a.start) : '0'); const [color, setColor] = useState(a ? a.color : COLORS[data.accounts.length % COLORS.length]);
  const ok = name.trim() && !isNaN(parseAmount(start) || 0);
  const save = () => { const row = { id: a ? a.id : id(), name: name.trim(), type, start: r2(parseAmount(start) || 0), color, closed: a ? a.closed : false }; set((d) => ({ ...d, accounts: a ? d.accounts.map((x) => (x.id === a.id ? row : x)) : [...d.accounts, row], ui: a ? d.ui : { ...d.ui, view: 'tx', acc: row.id } })); onClose(); };
  const del = async () => { const n = data.tx.filter((t) => t.acc === a.id || t.to === a.id).length; if (!(await X.ask({ title: `Delete ${a.name}?`, message: n ? `This also deletes its ${n} transaction${n === 1 ? '' : 's'}. This cannot be undone.` : 'This account has no transactions.', okText: 'Delete', danger: true }))) return; set((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id), tx: d.tx.filter((t) => t.acc !== a.id && t.to !== a.id), recurring: d.recurring.filter((r) => r.acc !== a.id), ui: { ...d.ui, acc: null, view: d.ui.view === 'tx' ? 'overview' : d.ui.view } })); onClose(); };
  return (
    <Modal title={a ? 'Edit account' : 'Add account'} onClose={onClose} width={440} footer={<>{a && data.accounts.length > 1 && <button className="fb danger" style={{ marginRight: 'auto' }} onClick={del}>Delete</button>}<button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!ok} onClick={save}>{a ? 'Save' : 'Add account'}</button></>}>
      <div className="fx-kv mny-kv"><label htmlFor="ac-name">Name</label><input id="ac-name" className="fi" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main checking" onKeyDown={(e) => e.key === 'Enter' && ok && save()} />
        <label htmlFor="ac-type">Type</label><select id="ac-type" className="fi" value={type} onChange={(e) => setType(e.target.value)}>{ACC_TYPES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <label htmlFor="ac-start">Opening balance</label><input id="ac-start" className="fi" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
        <label>Colour</label><div className="mny-colors">{COLORS.map((c) => <button key={c} className={color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />)}</div></div>
      <p className="muted" style={{ fontSize: 12.5 }}>{type === 'card' || type === 'loan' ? 'For a card or loan, enter what you owe as a negative number (e.g. -420).' : 'The balance the account had before your first transaction here.'}</p>
    </Modal>
  );
}

function RecurringEditor({ X, r, onClose }) {
  const { data, set } = X; const [p, setP] = useState(() => (r ? { ...r, amount: String(Math.abs(r.amount)), kind: r.to ? 'transfer' : r.amount > 0 ? 'income' : 'expense' } : { payee: '', acc: X.openAccounts[0].id, cat: '', amount: '', freq: 'monthly', next: ymd(new Date()), kind: 'expense', auto: false, to: '', end: '', note: '' }));
  const a = parseAmount(p.amount); const ok = p.payee.trim() && a > 0 && p.next && (p.kind !== 'transfer' || (p.to && p.to !== p.acc));
  const save = () => { const sign = p.kind === 'income' ? 1 : -1; const row = { id: r ? r.id : id(), acc: p.acc, payee: p.payee.trim(), cat: p.kind === 'transfer' ? null : p.cat || null, amount: r2(sign * a), to: p.kind === 'transfer' ? p.to : null, freq: p.freq, next: p.next, anchorDay: +p.next.slice(8), end: p.end || null, auto: !!p.auto, note: p.note || '' }; set((d) => ({ ...d, recurring: r ? d.recurring.map((x) => (x.id === r.id ? row : x)) : [...d.recurring, row] })); onClose(); };
  return (
    <Modal title={r ? 'Edit recurring' : 'Add recurring'} onClose={onClose} width={480} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!ok} onClick={save}>Save</button></>}>
      <div className="fx-seg mny-typeseg">{[['expense', 'Bill / expense'], ['income', 'Income'], ['transfer', 'Transfer']].map(([k, n]) => <button key={k} className={p.kind === k ? 'on' : ''} onClick={() => setP({ ...p, kind: k })}>{n}</button>)}</div>
      <div className="fx-kv mny-kv"><label htmlFor="rc-p">Name</label><input id="rc-p" className="fi" autoFocus value={p.payee} onChange={(e) => setP({ ...p, payee: e.target.value })} placeholder="e.g. Rent" />
        <label htmlFor="rc-a">Amount</label><input id="rc-a" className="fi" inputMode="decimal" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} />
        <label htmlFor="rc-ac">{p.kind === 'transfer' ? 'From' : 'Account'}</label><select id="rc-ac" className="fi" value={p.acc} onChange={(e) => setP({ ...p, acc: e.target.value })}>{X.openAccounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {p.kind === 'transfer' ? <><label htmlFor="rc-to">To</label><select id="rc-to" className="fi" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })}><option value="">Choose…</option>{X.openAccounts.filter((x) => x.id !== p.acc).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></> : <><label htmlFor="rc-c">Category</label><select id="rc-c" className="fi" value={p.cat || ''} onChange={(e) => setP({ ...p, cat: e.target.value })}><option value="">Uncategorised</option>{data.cats.filter((c) => c.group === (p.kind === 'income' ? 'income' : 'expense')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></>}
        <label htmlFor="rc-f">Repeats</label><select id="rc-f" className="fi" value={p.freq} onChange={(e) => setP({ ...p, freq: e.target.value })}>{FREQS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <label htmlFor="rc-n">Next due</label><input id="rc-n" type="date" className="fi" value={p.next} onChange={(e) => setP({ ...p, next: e.target.value })} />
        <label htmlFor="rc-e">Ends</label><input id="rc-e" type="date" className="fi" value={p.end || ''} onChange={(e) => setP({ ...p, end: e.target.value })} /></div>
      <label className="chk" style={{ marginTop: 10 }}><input type="checkbox" checked={!!p.auto} onChange={(e) => setP({ ...p, auto: e.target.checked })} />Post automatically when due (the next time you open Money)</label>
    </Modal>
  );
}

function Reconcile({ X, a, onClose }) {
  const { data, set, fmt } = X; const [stmt, setStmt] = useState(''); const [date, setDate] = useState(ymd(new Date()));
  const cleared = useMemo(() => { let b = +a.start || 0; for (const t of data.tx) { if (t.date > date || !t.cleared) continue; if (t.acc === a.id) b += t.amount; if (t.to === a.id) b -= t.amount; } return r2(b); }, [data.tx, a, date]);
  const target = parseAmount(stmt); const diff = isNaN(target) ? null : r2(target - cleared);
  const pending = data.tx.filter((t) => (t.acc === a.id || t.to === a.id) && !t.cleared && t.date <= date);
  const markAll = () => { set((d) => ({ ...d, tx: d.tx.map((t) => ((t.acc === a.id || t.to === a.id) && !t.cleared && t.date <= date ? { ...t, cleared: true } : t)) })); X.toast(`Marked ${pending.length} as cleared`); };
  return (
    <Modal title={`Reconcile ${a.name}`} onClose={onClose} width={500} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <p className="muted" style={{ marginTop: 0 }}>Compare your cleared balance with your bank statement. Tick the Cleared box on each transaction that appears on the statement.</p>
      <div className="fx-kv mny-kv"><label htmlFor="rc-d">Statement date</label><input id="rc-d" type="date" className="fi" value={date} onChange={(e) => setDate(e.target.value)} /><label htmlFor="rc-s">Statement balance</label><input id="rc-s" className="fi" inputMode="decimal" autoFocus value={stmt} onChange={(e) => setStmt(e.target.value)} placeholder="From your statement" /></div>
      <div className="mny-recbox"><div><span>Cleared balance</span><b>{fmt(cleared)}</b></div><div><span>Statement balance</span><b>{diff === null ? '—' : fmt(target)}</b></div><div className={diff === null ? '' : diff === 0 ? 'ok' : 'bad'}><span>Difference</span><b>{diff === null ? '—' : fmt(diff)}</b></div></div>
      {diff === 0 && <div className="mny-ok" role="status"><Icon name="circleCheck" size={16} />Balanced. Your records match the statement.</div>}
      {diff !== null && diff !== 0 && <div className="mny-err" role="status">{pending.length} uncleared transaction{pending.length === 1 ? '' : 's'} up to this date total {fmt(pending.reduce((s, t) => s + (t.acc === a.id ? t.amount : -t.amount), 0))}. {Math.abs(r2(diff - pending.reduce((s, t) => s + (t.acc === a.id ? t.amount : -t.amount), 0))) < 0.005 ? 'Marking them all as cleared would balance the account.' : 'Something is missing or different.'}</div>}
      {pending.length > 0 && <button className="fb" style={{ marginTop: 10 }} onClick={markAll}>Mark {pending.length} uncleared as cleared</button>}
    </Modal>
  );
}

function ImportDialog({ X, rows, name, onClose }) {
  const { data, set, toast } = X; const head = rows[0]; const [hasHead, setHasHead] = useState(true); const body = hasHead ? rows.slice(1) : rows;
  const cols = hasHead ? head : head.map((_, i) => `Column ${i + 1}`); const [map, setMap] = useState(() => guessColumns(head)); const [acc, setAcc] = useState(X.data.ui.acc || X.openAccounts[0].id); const [dayFirst, setDayFirst] = useState(false); const [invert, setInvert] = useState(false); const [skipDup, setSkipDup] = useState(true);
  const res = useMemo(() => importRows(body, map, { dayFirst, invert }), [body, map, dayFirst, invert]);
  const existing = useMemo(() => new Set(data.tx.map(dupKey)), [data.tx]);
  const items = res.list.map((r) => ({ ...r, dup: existing.has(dupKey({ acc, date: r.date, amount: r.amount, payee: r.payee })) })); const toAdd = skipDup ? items.filter((r) => !r.dup) : items;
  const sel = (k, label, optional) => <><label>{label}</label><select className="fi" aria-label={label} value={map[k]} onChange={(e) => setMap({ ...map, [k]: +e.target.value })}>{optional && <option value={-1}>(none)</option>}{!optional && map[k] < 0 && <option value={-1}>Choose…</option>}{cols.map((c, i) => <option key={i} value={i}>{c || `Column ${i + 1}`}</option>)}</select></>;
  const run = () => {
    const byName = new Map(data.cats.map((c) => [c.name.toLowerCase(), c.id])); const byPayee = new Map(); data.tx.forEach((t) => { if (t.payee && t.cat && !byPayee.has(t.payee.toLowerCase())) byPayee.set(t.payee.toLowerCase(), t.cat); });
    const tx = toAdd.map((r) => newTx({ acc, date: r.date, amount: r.amount, payee: r.payee, note: r.note, cleared: true, cat: (r.catName && byName.get(r.catName.toLowerCase())) || byPayee.get((r.payee || '').toLowerCase()) || null }));
    set((d) => ({ ...d, tx: [...tx, ...d.tx].sort((a, b) => (a.date < b.date ? 1 : -1)), ui: { ...d.ui, view: 'tx', acc } })); toast(`Imported ${tx.length} transactions${items.length - toAdd.length ? `, skipped ${items.length - toAdd.length} duplicates` : ''}`); onClose();
  };
  const okMap = map.date >= 0 && (map.amount >= 0 || map.debit >= 0 || map.credit >= 0);
  return (
    <Modal title={`Import ${name}`} onClose={onClose} width={680} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!okMap || !toAdd.length} onClick={run}>Import {toAdd.length} transaction{toAdd.length === 1 ? '' : 's'}</button></>}>
      <div className="fx-kv mny-kv"><label>Into account</label><select className="fi" aria-label="Import into account" value={acc} onChange={(e) => setAcc(e.target.value)}>{X.openAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {sel('date', 'Date')}{sel('payee', 'Payee / description')}{sel('amount', 'Amount', true)}{sel('debit', 'Debit (money out)', true)}{sel('credit', 'Credit (money in)', true)}{sel('cat', 'Category', true)}{sel('note', 'Note', true)}</div>
      <div className="mny-opts"><label className="chk"><input type="checkbox" checked={hasHead} onChange={(e) => setHasHead(e.target.checked)} />First row is a header</label><label className="chk"><input type="checkbox" checked={dayFirst} onChange={(e) => setDayFirst(e.target.checked)} />Dates are day/month/year</label><label className="chk"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />Flip signs (spending shown as positive)</label><label className="chk"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />Skip duplicates</label></div>
      <div className="mny-impsum">{res.list.length} readable row{res.list.length === 1 ? '' : 's'}{res.bad ? <span className="neg"> · {res.bad} unreadable skipped</span> : ''}{items.some((i) => i.dup) ? ` · ${items.filter((i) => i.dup).length} look like duplicates` : ''}</div>
      <div className="mny-tablewrap" style={{ maxHeight: 220 }}><table className="mny-table"><thead><tr><th>Date</th><th>Payee</th><th className="r">Amount</th><th /></tr></thead><tbody>{items.slice(0, 8).map((r, i) => <tr key={i}><td>{r.date}</td><td className="ellip" style={{ maxWidth: 260 }}>{r.payee}</td><td className={'r ' + (r.amount < 0 ? 'neg' : 'pos')}>{X.fmt(r.amount, { sign: true })}</td><td>{r.dup && <span className="fx-chip">duplicate</span>}</td></tr>)}</tbody></table></div>
    </Modal>
  );
}

function SettingsDialog({ X, onClose }) {
  const { data, set, ask } = X; const [tab, setTab] = useState('general'); const [nc, setNc] = useState({ name: '', group: 'expense' });
  const used = (cid) => data.tx.filter((t) => t.cat === cid || (t.splits || []).some((s) => s.cat === cid)).length;
  const upd = (cid, patch) => set((d) => ({ ...d, cats: d.cats.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));
  const del = async (c) => { const n = used(c.id); if (n && !(await ask({ title: `Delete ${c.name}?`, message: `${n} transaction${n === 1 ? ' uses' : 's use'} it and will become uncategorised.`, okText: 'Delete', danger: true }))) return; set((d) => ({ ...d, cats: d.cats.filter((x) => x.id !== c.id), tx: d.tx.map((t) => ({ ...t, cat: t.cat === c.id ? null : t.cat, splits: t.splits ? t.splits.map((s) => ({ ...s, cat: s.cat === c.id ? null : s.cat })) : null })), recurring: d.recurring.map((r) => (r.cat === c.id ? { ...r, cat: null } : r)) })); };
  const add = () => { if (!nc.name.trim()) return; set((d) => ({ ...d, cats: [...d.cats, { id: 'c_' + id(), name: nc.name.trim(), group: nc.group, color: COLORS[d.cats.length % COLORS.length], budget: 0 }] })); setNc({ ...nc, name: '' }); };
  const wipe = async () => { if (!(await ask({ title: 'Delete all Money data?', message: 'Every account, transaction, budget and goal on this browser will be removed. Download a backup first if you might need it.', okText: 'Delete everything', danger: true }))) return; X.go('overview'); X.set(() => blankData()); onClose(); };
  return (
    <Modal title="Money settings" onClose={onClose} width={560} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <div className="fx-tabs" role="tablist">{[['general', 'General'], ['cats', 'Categories'], ['data', 'Data']].map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
      {tab === 'general' && <div style={{ paddingTop: 14 }}><div className="fx-kv mny-kv"><label htmlFor="st-cur">Currency</label><select id="st-cur" className="fi" value={data.settings.currency} onChange={(e) => set((d) => ({ ...d, settings: { ...d.settings, currency: e.target.value } }))}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <label className="chk" style={{ marginTop: 12 }}><input type="checkbox" checked={!!data.settings.hideCents} onChange={(e) => set((d) => ({ ...d, settings: { ...d.settings, hideCents: e.target.checked } }))} />Hide cents (whole numbers only)</label>
        <label className="chk" style={{ marginTop: 8 }}><input type="checkbox" checked={!!data.settings.rollover} onChange={(e) => set((d) => ({ ...d, settings: { ...d.settings, rollover: e.target.checked } }))} />Roll unspent budget into next month</label>
        <p className="muted" style={{ fontSize: 12.5 }}>Changing the currency only changes how amounts are shown. It does not convert anything.</p></div>}
      {tab === 'cats' && <div style={{ paddingTop: 12 }}><div className="mny-catlist">{['expense', 'income'].map((g) => <div key={g}><div className="fx-head">{g === 'expense' ? 'Expense categories' : 'Income categories'}</div>{data.cats.filter((c) => c.group === g).map((c) => <div className="row" key={c.id}><input type="color" aria-label={`${c.name} colour`} value={c.color} onChange={(e) => upd(c.id, { color: e.target.value })} /><input className="fi" aria-label={`Rename ${c.name}`} value={c.name} onChange={(e) => upd(c.id, { name: e.target.value })} /><span className="muted s">{used(c.id)} tx</span><button className="fb sub ico sm" aria-label={`Delete ${c.name}`} onClick={() => del(c)}><Icon name="trash" size={14} /></button></div>)}</div>)}</div>
        <div className="row addcat"><input className="fi" aria-label="New category name" placeholder="New category" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} /><select className="fi" aria-label="New category type" value={nc.group} onChange={(e) => setNc({ ...nc, group: e.target.value })}><option value="expense">Expense</option><option value="income">Income</option></select><button className="fb pri" onClick={add}>Add</button></div></div>}
      {tab === 'data' && <div style={{ paddingTop: 14, display: 'grid', gap: 10 }}><div className="muted">Your data is saved only in this browser. Use the ⋯ menu at the top for a full backup file.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="fb" onClick={() => X.exportCsv()}><Icon name="download" size={15} />Export transactions (CSV)</button><button className="fb" onClick={() => { onClose(); X.importCsv(); }}><Icon name="upload" size={15} />Import CSV</button><button className="fb" onClick={() => { onClose(); X.loadSample(); }}><Icon name="sparkles" size={15} />Load sample data</button></div>
        <div className="fx-sep" /><button className="fb danger" style={{ width: 'fit-content' }} onClick={wipe}><Icon name="trash" size={15} />Delete all Money data…</button></div>}
    </Modal>
  );
}
