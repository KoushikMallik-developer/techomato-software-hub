import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Pop, MenuRows, useContextMenu } from '../../components/fxui.jsx';
import { PERIODS, periodRange, inRange, parts, newTx, parseAmount, r2, balances, txToCsv, monthLabel } from './model.js';
import { ymd, parseYmd } from '../../lib/cal.js';

const PAGE = 250;
const fmtD = (s) => parseYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function Register({ X }) {
  const { data, set, fmt, cn, cur, toast, ask } = X; const accId = data.ui.acc; const acc = accId && data.accounts.find((a) => a.id === accId);
  const [f, setF] = useState(() => ({ q: '', type: 'all', cat: '', period: 'all', cleared: 'all', from: '', to: '', ...(X.jump || {}) }));
  const [sort, setSort] = useState({ k: 'date', dir: -1 }); const [sel, setSel] = useState(() => new Set()); const [limit, setLimit] = useState(PAGE); const [ctxNode, showCtx] = useContextMenu();
  const [qa, setQa] = useState({ date: ymd(new Date()), payee: '', cat: '', amt: '', acc: '' }); const payeeRef = useRef(null);
  useEffect(() => { if (X.jump) { setF((o) => ({ ...o, ...X.jump })); X.clearJump(); } }, [X.jump]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(new Set()); setLimit(PAGE); }, [accId, f, sort]);
  const catOf = (t) => (t.splits ? 'Split' : t.to ? 'Transfer' : t.cat ? cn(t.cat).name : 'Uncategorised');
  const accName = (id) => (data.accounts.find((a) => a.id === id) || { name: '?' }).name;

  const range = f.period === 'custom' ? [f.from || '0000-01-01', f.to || '9999-12-31'] : periodRange(f.period);
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase(); const qn = parseAmount(f.q); let list = data.tx.filter((t) => {
      if (accId && t.acc !== accId && t.to !== accId) return false;
      if (f.type === 'expense' && !(!t.to && t.amount < 0)) return false; if (f.type === 'income' && !(!t.to && t.amount > 0)) return false; if (f.type === 'transfer' && !t.to) return false;
      if (f.cat === '_none' ? (t.to || t.cat || t.splits) : f.cat && !parts(t).some((p) => p.cat === f.cat)) return false;
      if (f.period !== 'all' && !inRange(t, range)) return false;
      if (f.cleared === 'yes' && !t.cleared) return false; if (f.cleared === 'no' && t.cleared) return false;
      if (q) { const hay = `${t.payee} ${t.note} ${catOf(t)} ${(t.tags || []).join(' ')} ${accName(t.acc)} ${t.date}`.toLowerCase(); if (!hay.includes(q) && !(!isNaN(qn) && Math.abs(Math.abs(t.amount) - Math.abs(qn)) < 0.005)) return false; }
      return true;
    });
    const dir = sort.dir; const key = { date: (t) => t.date, payee: (t) => (t.payee || '').toLowerCase(), cat: (t) => catOf(t).toLowerCase(), amount: (t) => (accId && t.to === accId ? -t.amount : t.amount), acc: (t) => accName(t.acc).toLowerCase() }[sort.k];
    list = list.map((t, i) => [t, i]).sort((a, b) => { const x = key(a[0]); const y = key(b[0]); return (x < y ? -1 : x > y ? 1 : 0) * dir || (a[0].date < b[0].date ? 1 : -1) * dir || b[1] - a[1]; }).map((x) => x[0]);
    return list;
  }, [data.tx, data.cats, data.accounts, f, sort, accId]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = useMemo(() => { // balance after each tx in a single account
    if (!accId) return null; const a = data.accounts.find((x) => x.id === accId); if (!a) return null; let b = +a.start || 0; const m = new Map();
    const all = data.tx.map((t, i) => [t, i]).filter(([t]) => t.acc === accId || t.to === accId).sort((x, y) => (x[0].date < y[0].date ? -1 : x[0].date > y[0].date ? 1 : y[1] - x[1]));
    for (const [t] of all) { b = r2(b + (t.acc === accId ? t.amount : -t.amount)); m.set(t.id, b); } return m;
  }, [data.tx, data.accounts, accId]);
  const showRun = running && sort.k === 'date' && f.q === '' && f.type === 'all' && !f.cat && f.cleared === 'all' && f.period === 'all';
  const amtFor = (t) => (accId && t.to === accId ? -t.amount : t.amount);
  const totals = rows.reduce((s, t) => { if (t.to && !accId) return s; const a = amtFor(t); if (a > 0) s.in = r2(s.in + a); else s.out = r2(s.out - a); return s; }, { in: 0, out: 0 });
  const anyFilter = f.q || f.type !== 'all' || f.cat || f.period !== 'all' || f.cleared !== 'all';
  const toggleSort = (k) => setSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: k === 'date' || k === 'amount' ? -1 : 1 }));
  const th = (k, label, cls = '') => <th className={cls} aria-sort={sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}><button className="mny-th" onClick={() => toggleSort(k)}>{label}{sort.k === k && <Icon name={sort.dir > 0 ? 'arrowUp' : 'arrowDown'} size={12} />}</button></th>;

  const quickAdd = () => {
    const a = parseAmount(qa.amt); if (isNaN(a) || a === 0) { toast('Enter an amount'); return; } const cat = qa.cat; const g = cat ? (data.cats.find((c) => c.id === cat) || {}).group : null;
    const amount = qa.amt.trim().startsWith('+') || g === 'income' ? Math.abs(a) : -Math.abs(a); const target = accId || qa.acc || X.openAccounts[0].id;
    X.saveTx(newTx({ acc: target, date: qa.date || ymd(new Date()), payee: qa.payee.trim(), cat: cat || null, amount }));
    setQa({ ...qa, payee: '', amt: '', cat: '' }); setTimeout(() => payeeRef.current && payeeRef.current.focus(), 0);
  };
  const onPayee = (v) => { const m = data.tx.find((t) => !t.to && t.payee && t.payee.toLowerCase() === v.toLowerCase()); setQa((o) => ({ ...o, payee: v, cat: !o.cat && m && m.cat ? m.cat : o.cat })); };
  const bulk = (fn) => { set((d) => ({ ...d, tx: d.tx.map((t) => (sel.has(t.id) ? fn(t) : t)) })); };
  const menuFor = (e, t) => { e.preventDefault(); showCtx(e, [{ label: 'Edit…', icon: 'edit', onClick: () => X.edit(t) }, { label: 'Duplicate', icon: 'copy', onClick: () => X.saveTx({ ...t, id: undefined, cleared: false }) }, { label: t.cleared ? 'Mark uncleared' : 'Mark cleared', icon: 'check', onClick: () => X.saveTx({ ...t, cleared: !t.cleared }) }, { sep: true }, { label: 'Delete', icon: 'trash', danger: true, onClick: () => X.delTx([t.id]) }]); };
  const pageRows = rows.slice(0, limit);
  const allSel = pageRows.length > 0 && pageRows.every((t) => sel.has(t.id));
  const bal = X.bal;

  return (
    <div className="mny-page">
      <div className="mny-ph"><div><h1>{acc ? acc.name : 'All transactions'}</h1><div className="muted">{acc ? <>Balance <b className={bal[acc.id] < 0 ? 'neg' : ''}>{fmt(bal[acc.id])}</b>{acc.closed ? ' · Closed' : ''}</> : <>{data.tx.length} transactions in {data.accounts.length} account{data.accounts.length === 1 ? '' : 's'}</>}</div></div>
        <span className="spacer" />
        {acc && <button className="fb" onClick={() => X.reconcile(acc)}><Icon name="circleCheck" size={15} />Reconcile</button>}
        <button className="fb" onClick={() => X.importCsv()}><Icon name="upload" size={15} />Import</button>
        <button className="fb" onClick={() => X.exportCsv(rows)}><Icon name="download" size={15} />Export</button>
        <button className="fb pri" onClick={() => X.edit(null)}><Icon name="plus" size={15} />Add transaction</button></div>
      <div className="mny-filters" role="search">
        <label className="fx-search light" style={{ width: 230 }}><Icon name="search" size={15} /><input placeholder="Search payee, note, amount…" aria-label="Search transactions" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        <div className="fx-seg" role="group" aria-label="Type">{[['all', 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']].map(([k, n]) => <button key={k} className={f.type === k ? 'on' : ''} aria-pressed={f.type === k} onClick={() => setF({ ...f, type: k })}>{n}</button>)}</div>
        <select className="fi mny-sel" aria-label="Category filter" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}><option value="">All categories</option><option value="_none">Uncategorised</option>{data.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="fi mny-sel" aria-label="Period" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}><option value="all">All dates</option>{PERIODS.filter((p) => p[0] !== 'all').map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        {f.period === 'custom' && <><input type="date" className="fi mny-sel" aria-label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><input type="date" className="fi mny-sel" aria-label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></>}
        <select className="fi mny-sel" aria-label="Cleared filter" value={f.cleared} onChange={(e) => setF({ ...f, cleared: e.target.value })}><option value="all">Any status</option><option value="yes">Cleared</option><option value="no">Not cleared</option></select>
        {anyFilter && <button className="fb sub" onClick={() => setF({ q: '', type: 'all', cat: '', period: 'all', cleared: 'all', from: '', to: '' })}><Icon name="x" size={14} />Clear filters</button>}
      </div>
      {sel.size > 0 && <div className="mny-bulk" role="toolbar" aria-label="Selected transactions"><b>{sel.size} selected</b>
        <Pop trigger={({ toggle }) => <button className="fb sm" onClick={toggle}><Icon name="tag" size={14} />Set category</button>} width={220}>{({ close }) => <div className="mny-catpick">{data.cats.map((c) => <button key={c.id} className="fx-row" onClick={() => { bulk((t) => (t.to ? t : { ...t, cat: c.id, splits: null })); close(); toast(`Category set for ${sel.size}`); }}><i className="mny-dot" style={{ background: c.color }} />{c.name}</button>)}</div>}</Pop>
        <button className="fb sm" onClick={() => bulk((t) => ({ ...t, cleared: true }))}><Icon name="check" size={14} />Mark cleared</button><button className="fb sm" onClick={() => bulk((t) => ({ ...t, cleared: false }))}>Mark uncleared</button>
        <button className="fb sm danger" onClick={() => X.delTx([...sel])}><Icon name="trash" size={14} />Delete</button><span className="spacer" /><button className="fb sub sm" onClick={() => setSel(new Set())}>Deselect</button></div>}
      <div className="mny-tablewrap">
        <table className="mny-table"><thead><tr><th style={{ width: 34 }}><input type="checkbox" aria-label="Select all" checked={allSel} onChange={(e) => setSel(e.target.checked ? new Set(pageRows.map((t) => t.id)) : new Set())} /></th>{th('date', 'Date')}{th('payee', 'Payee')}{th('cat', 'Category')}{!accId && th('acc', 'Account')}{th('amount', 'Amount', 'r')}{showRun && <th className="r"><span className="mny-th">Balance</span></th>}<th style={{ width: 34 }} aria-label="Cleared" title="Cleared"><Icon name="check" size={13} /></th></tr>
          <tr className="mny-qa"><td /><td><input type="date" className="fi" aria-label="New date" value={qa.date} onChange={(e) => setQa({ ...qa, date: e.target.value })} /></td>
            <td><input ref={payeeRef} className="fi" list="mny-payees" placeholder="Add a transaction: payee" aria-label="New payee" value={qa.payee} onChange={(e) => onPayee(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && quickAdd()} /></td>
            <td><select className="fi" aria-label="New category" value={qa.cat} onChange={(e) => setQa({ ...qa, cat: e.target.value })}><option value="">Category</option>{['expense', 'income'].map((g) => <optgroup key={g} label={g === 'expense' ? 'Expenses' : 'Income'}>{data.cats.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</select></td>
            {!accId && <td><select className="fi" aria-label="New account" value={qa.acc || X.openAccounts[0].id} onChange={(e) => setQa({ ...qa, acc: e.target.value })}>{X.openAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></td>}
            <td><input className="fi r" placeholder="Amount (+ income)" aria-label="New amount" inputMode="decimal" value={qa.amt} onChange={(e) => setQa({ ...qa, amt: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && quickAdd()} /></td>
            {showRun && <td />}<td><button className="fb pri ico sm" aria-label="Add" title="Add (Enter)" onClick={quickAdd}><Icon name="plus" size={15} /></button></td></tr></thead>
          <tbody>
            {pageRows.map((t) => { const a = amtFor(t); return (
              <tr key={t.id} className={sel.has(t.id) ? 'sel' : ''} onDoubleClick={() => X.edit(t)} onContextMenu={(e) => menuFor(e, t)}>
                <td><input type="checkbox" aria-label={`Select ${t.payee || 'transaction'}`} checked={sel.has(t.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(t.id) : n.delete(t.id); return n; })} /></td>
                <td className="nw">{fmtD(t.date)}</td>
                <td className="py"><button className="mny-link" onClick={() => X.edit(t)}>{t.payee || <span className="muted">(no payee)</span>}</button>{t.note && <div className="mny-note ellip">{t.note}</div>}{t.tags && t.tags.length > 0 && <span className="mny-tags">{t.tags.map((g) => <span key={g} className="fx-chip">#{g}</span>)}</span>}</td>
                <td>{t.to ? <span className="mny-xf"><Icon name="swap" size={13} />{t.acc === accId || !accId ? `to ${accName(t.to)}` : `from ${accName(t.acc)}`}</span> : t.splits ? <span className="mny-split"><Icon name="split" size={13} />Split ({t.splits.length})</span> : t.cat ? <span className="mny-cat"><i className="mny-dot" style={{ background: cn(t.cat).color }} />{cn(t.cat).name}</span> : <span className="muted">Uncategorised</span>}</td>
                {!accId && <td className="muted nw">{accName(t.acc)}</td>}
                <td className={'r nw mny-amt ' + (t.to ? '' : a < 0 ? 'neg' : 'pos')}>{fmt(a, { sign: !t.to })}</td>
                {showRun && <td className="r nw muted">{running.has(t.id) ? fmt(running.get(t.id)) : ''}</td>}
                <td><button className={'mny-clr' + (t.cleared ? ' on' : '')} aria-label={t.cleared ? 'Cleared' : 'Not cleared'} aria-pressed={t.cleared} title={t.cleared ? 'Cleared' : 'Not cleared yet'} onClick={() => X.saveTx({ ...t, cleared: !t.cleared })}><Icon name="check" size={13} /></button></td>
              </tr>); })}
          </tbody></table>
        {rows.length === 0 && <div className="fx-empty"><Icon name="receipt" size={34} /><h3>{anyFilter ? 'No transactions match' : 'No transactions yet'}</h3><div>{anyFilter ? 'Try clearing a filter.' : 'Add your first one above, import a bank CSV, or load sample data from the ⋯ menu.'}</div></div>}
        {rows.length > limit && <div style={{ padding: 12, textAlign: 'center' }}><button className="fb" onClick={() => setLimit(limit + PAGE)}>Show more ({rows.length - limit} left)</button></div>}
      </div>
      <div className="mny-foot"><span>{rows.length} transaction{rows.length === 1 ? '' : 's'}</span><span>In <b className="pos">{fmt(totals.in)}</b></span><span>Out <b className="neg">{fmt(totals.out)}</b></span><span>Net <b className={totals.in - totals.out < 0 ? 'neg' : 'pos'}>{fmt(r2(totals.in - totals.out), { sign: true })}</b></span></div>
      <datalist id="mny-payees">{X.payees.map((p) => <option key={p} value={p} />)}</datalist>
      {ctxNode}
    </div>
  );
}
