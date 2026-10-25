import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Modal, useContextMenu } from '../../components/fxui.jsx';
import { Donut, FlowBars, LineArea, Bar, Spark } from './Charts.jsx';
import { PERIODS, periodRange, monthKey, monthLabel, shiftMonth, sumByCat, monthlyFlow, monthsBack, netWorthSeries, topPayees, budgetRows, budgetFor, upcoming, FREQS, balances, netWorth, r2, id, parts, csvCell, newTx, advance, ACC_GROUPS, ACC_TYPES } from './model.js';
import { ymd, parseYmd, diffDays, addDays, fmtDate } from '../../lib/cal.js';
import { download } from '../../components/fxui.jsx';

const dshort = (s) => parseYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const Card = ({ title, action, children, className = '' }) => <section className={'mny-card ' + className}><header><h2>{title}</h2><span className="spacer" />{action}</header>{children}</section>;
const Kpi = ({ label, value, sub, tone, spark, onClick }) => <div className={'mny-kpi' + (onClick ? ' click' : '')} onClick={onClick}><div className="l">{label}</div><div className={'v ' + (tone || '')}>{value}</div><div className="s">{sub}</div>{spark}</div>;

/* ============ Overview ============ */
export function Overview({ X }) {
  const { data, fmt, cn, cur, bal } = X; const now = new Date(); const mk = monthKey(now); const range = periodRange('this'); const prevR = periodRange('last');
  const months6 = useMemo(() => monthsBack(6), []); const flow = useMemo(() => monthlyFlow(data, months6), [data.tx, data.cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const thisM = flow[5]; const prevM = flow[4]; const nw = netWorth(data); const nwSeries = useMemo(() => netWorthSeries(data, months6), [data.tx, data.accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const spend = sumByCat(data, range, 'expense'); const top = spend.rows.slice(0, 6); const rest = spend.rows.slice(6).reduce((s, r) => r2(s + r.value), 0);
  const slices = [...top.map((r) => ({ label: r.cat ? cn(r.cat).name : 'Uncategorised', value: r.value, color: r.cat ? cn(r.cat).color : '#8a8a8a', fmt: fmt(r.value) })), ...(rest > 0 ? [{ label: 'Everything else', value: rest, color: '#b0b0b0', fmt: fmt(rest) }] : [])];
  const brows = budgetRows(data, mk).filter((r) => r.budget > 0); const bTotal = brows.reduce((s, r) => s + r.budget, 0); const bSpent = brows.reduce((s, r) => s + r.spent, 0);
  const worst = [...brows].sort((a, b) => b.spent / b.budget - a.spent / a.budget).slice(0, 5);
  const bills = upcoming(data, 14); const recent = data.tx.slice(0, 7); const rate = thisM.income > 0 ? Math.round(((thisM.income - thisM.expense) / thisM.income) * 100) : null;
  const delta = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
  const dExp = delta(thisM.expense, prevM.expense);
  if (!data.tx.length && data.accounts.every((a) => !a.start)) return (
    <div className="mny-page"><div className="fx-empty mny-hello"><Icon name="wallet" size={44} /><h3>Welcome to Techomato Money</h3><div>Track accounts, budget by category, schedule bills and watch your net worth grow. Everything stays in this browser.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}><button className="fb pri lg" onClick={() => X.edit(null)}><Icon name="plus" size={16} />Add a transaction</button><button className="fb lg" onClick={() => X.addAccount()}>Add an account</button><button className="fb lg" onClick={() => X.importCsv()}>Import a bank CSV</button><button className="fb lg" onClick={X.loadSample}><Icon name="sparkles" size={16} />Try sample data</button></div></div></div>);
  return (
    <div className="mny-page">
      <div className="mny-ph"><div><h1>Overview</h1><div className="muted">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div></div></div>
      <div className="mny-kpis">
        <Kpi label="Net worth" value={fmt(nw)} tone={nw < 0 ? 'neg' : ''} sub={`${data.accounts.filter((a) => !a.closed).length} accounts`} spark={<div className="sp"><Spark values={nwSeries.map((s) => s.v)} /></div>} />
        <Kpi label={`Income · ${monthLabel(mk, { month: 'short' })}`} value={fmt(thisM.income)} tone="pos" sub={`Last month ${fmt(prevM.income)}`} onClick={() => X.go('tx', { jump: { type: 'income', period: 'this' } })} />
        <Kpi label={`Spending · ${monthLabel(mk, { month: 'short' })}`} value={fmt(thisM.expense)} sub={dExp === null ? '—' : <span className={dExp > 0 ? 'neg' : 'pos'}>{dExp > 0 ? '▲' : '▼'} {Math.abs(dExp)}% vs last month</span>} onClick={() => X.go('tx', { jump: { type: 'expense', period: 'this' } })} />
        <Kpi label="Saved this month" value={fmt(r2(thisM.income - thisM.expense), { sign: true })} tone={thisM.income - thisM.expense < 0 ? 'neg' : 'pos'} sub={rate === null ? 'No income yet' : `Savings rate ${rate}%`} />
      </div>
      <div className="mny-grid">
        <Card title="Cash flow" action={<button className="fb sub sm" onClick={() => X.go('reports')}>Reports</button>} className="span2"><FlowBars data={flow} cur={cur} /><div className="mny-legend"><span><i style={{ background: '#2f9e5a' }} />Income</span><span><i style={{ background: '#e8590c' }} />Expenses</span></div></Card>
        <Card title={`Spending in ${monthLabel(mk, { month: 'long' })}`}>{slices.length ? <div className="mny-donutrow"><Donut slices={slices} total={fmt(spend.total)} center="Spent" cur={cur} />
          <ul className="mny-leg">{slices.map((s) => <li key={s.label}><i style={{ background: s.color }} /><span className="ellip">{s.label}</span><b>{s.fmt}</b></li>)}</ul></div> : <div className="fx-empty">No spending this month yet.</div>}</Card>
        <Card title="Budget" action={<button className="fb sub sm" onClick={() => X.go('budget')}>Open</button>}>
          {brows.length ? <><div className="mny-bsum"><b>{fmt(bSpent)}</b> <span className="muted">of {fmt(bTotal)} budgeted</span></div><Bar value={bSpent} max={bTotal} over={bSpent > bTotal} height={10} />
            <div className="mny-blist">{worst.map((r) => <div key={r.cat.id}><div className="row"><span className="ellip"><i className="mny-dot" style={{ background: r.cat.color }} />{r.cat.name}</span><span className={r.left < 0 ? 'neg' : 'muted'}>{r.left < 0 ? `${fmt(-r.left)} over` : `${fmt(r.left)} left`}</span></div><Bar value={r.spent} max={r.budget} over={r.spent > r.budget} color={r.cat.color} /></div>)}</div></>
            : <div className="fx-empty">No budgets set yet.<button className="fb sm" onClick={() => X.go('budget')}>Set a budget</button></div>}</Card>
        <Card title="Net worth" className="span2"><LineArea data={nwSeries} cur={cur} /></Card>
        <Card title="Accounts"><div className="mny-acclist">{data.accounts.filter((a) => !a.closed).map((a) => <button key={a.id} className="mny-accrow" onClick={() => X.go('tx', { acc: a.id })}><span className="ico" style={{ background: a.color }}><Icon name={(ACC_TYPES.find((t) => t[0] === a.type) || [0, 0, 'bank'])[2]} size={15} /></span><span className="ellip grow">{a.name}</span><b className={bal[a.id] < 0 ? 'neg' : ''}>{fmt(bal[a.id])}</b></button>)}</div></Card>
        <Card title="Upcoming bills" action={<button className="fb sub sm" onClick={() => X.go('bills')}>All bills</button>}>{bills.length ? <div className="mny-bills">{bills.slice(0, 6).map((b, i) => { const dd = diffDays(new Date(), parseYmd(b.date)); return <div key={i} className="row"><span className="ellip grow">{b.rec.payee}<div className={'muted s' + (dd < 0 ? ' neg' : '')}>{dd < 0 ? `${-dd}d overdue` : dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : `${dshort(b.date)}`}</div></span><b className={b.rec.amount < 0 ? '' : 'pos'}>{fmt(Math.abs(b.rec.amount))}</b></div>; })}</div> : <div className="fx-empty">Nothing due in the next 14 days.</div>}</Card>
        <Card title="Recent" action={<button className="fb sub sm" onClick={() => X.go('tx', { acc: null })}>See all</button>} className="span2"><div className="mny-recent">{recent.map((t) => <button key={t.id} className="row" onClick={() => X.edit(t)}><span className="d">{dshort(t.date)}</span><span className="ellip grow">{t.payee || '(no payee)'}</span><span className="muted ellip c">{t.to ? 'Transfer' : t.cat ? cn(t.cat).name : ''}</span><b className={t.to ? '' : t.amount < 0 ? 'neg' : 'pos'}>{fmt(t.amount, { sign: !t.to })}</b></button>)}</div></Card>
        <Card title="Goals" action={<button className="fb sub sm" onClick={() => X.go('goals')}>All goals</button>}>{data.goals.length ? data.goals.slice(0, 3).map((g) => <div key={g.id} className="mny-goalmini"><div className="row"><span className="ellip">{g.name}</span><b>{Math.round((g.saved / g.target) * 100)}%</b></div><Bar value={g.saved} max={g.target} color={g.color} /></div>) : <div className="fx-empty">No goals yet.<button className="fb sm" onClick={() => X.go('goals')}>Create one</button></div>}</Card>
      </div>
    </div>
  );
}

/* ============ Budget ============ */
export function BudgetView({ X }) {
  const { data, set, fmt, toast, cur } = X; const [mk, setMk] = useState(monthKey(new Date())); const rows = budgetRows(data, mk);
  const tot = rows.reduce((s, r) => ({ b: s.b + r.budget, sp: s.sp + r.spent, l: s.l + r.left }), { b: 0, sp: 0, l: 0 });
  const income = sumByCat(data, [mk + '-01', mk + '-31'], 'income').total; const isNow = mk === monthKey(new Date());
  const setB = (catId, v) => set((d) => { const cur = { ...(d.budgets[mk] || {}) }; const n = parseFloat(v); if (v === '' || isNaN(n)) delete cur[catId]; else cur[catId] = Math.max(0, r2(n)); return { ...d, budgets: { ...d.budgets, [mk]: cur } }; });
  const copyPrev = () => { const p = shiftMonth(mk, -1); set((d) => { const o = {}; d.cats.filter((c) => c.group === 'expense').forEach((c) => { o[c.id] = budgetFor(d, p, c.id); }); return { ...d, budgets: { ...d.budgets, [mk]: o } }; }); toast(`Copied from ${monthLabel(p)}`); };
  const autoFill = () => { const ms = [1, 2, 3].map((n) => shiftMonth(mk, -n)); set((d) => { const o = {}; d.cats.filter((c) => c.group === 'expense').forEach((c) => { const avg = ms.reduce((s, m) => s + ((sumByCat(d, [m + '-01', m + '-31'], 'expense').rows.find((r) => r.cat === c.id) || { value: 0 }).value), 0) / 3; o[c.id] = Math.round(avg / 5) * 5; }); return { ...d, budgets: { ...d.budgets, [mk]: o } }; }); toast('Budget set from your last 3 months of spending'); };
  const reset = () => { set((d) => { const b = { ...d.budgets }; delete b[mk]; return { ...d, budgets: b }; }); toast('Back to default budgets'); };
  const custom = !!data.budgets[mk] && Object.keys(data.budgets[mk]).length > 0;
  return (
    <div className="mny-page">
      <div className="mny-ph"><div><h1>Budget</h1><div className="muted">Plan monthly spending by category</div></div><span className="spacer" />
        <div className="mny-monthnav"><button className="fb ico" aria-label="Previous month" onClick={() => setMk(shiftMonth(mk, -1))}><Icon name="chevronLeft" size={16} /></button><b>{monthLabel(mk)}</b><button className="fb ico" aria-label="Next month" onClick={() => setMk(shiftMonth(mk, 1))}><Icon name="chevronRight" size={16} /></button>{!isNow && <button className="fb sm" onClick={() => setMk(monthKey(new Date()))}>This month</button>}</div></div>
      <div className="mny-kpis three">
        <Kpi label="Budgeted" value={fmt(tot.b)} sub={income ? `Income this month ${fmt(income)}` : 'No income recorded'} />
        <Kpi label="Spent" value={fmt(tot.sp)} sub={tot.b ? `${Math.round((tot.sp / tot.b) * 100)}% of budget` : '—'} />
        <Kpi label={tot.l < 0 ? 'Over budget' : 'Left to spend'} value={fmt(Math.abs(tot.l))} tone={tot.l < 0 ? 'neg' : 'pos'} sub={isNow ? `${Math.max(0, diffDays(new Date(), parseYmd(shiftMonth(mk, 1) + '-01')))} days left in month` : ''} />
      </div>
      <div className="mny-toolrow"><button className="fb" onClick={copyPrev}><Icon name="copy" size={14} />Copy last month</button><button className="fb" onClick={autoFill}><Icon name="sparkles" size={14} />Auto-fill from 3-month average</button>{custom && <button className="fb sub" onClick={reset}>Reset to defaults</button>}<span className="spacer" />
        <label className="chk"><input type="checkbox" checked={!!data.settings.rollover} onChange={(e) => set((d) => ({ ...d, settings: { ...d.settings, rollover: e.target.checked } }))} />Roll unspent money into next month</label></div>
      <div className="mny-tablewrap"><table className="mny-table btab"><thead><tr><th>Category</th><th className="r">Budget</th>{data.settings.rollover && <th className="r">Carried</th>}<th className="r">Spent</th><th className="r">Left</th><th style={{ width: '24%' }}>Progress</th></tr></thead>
        <tbody>{rows.map((r) => { const pct = r.budget + r.carry > 0 ? r.spent / (r.budget + r.carry) : r.spent > 0 ? 2 : 0; return (
          <tr key={r.cat.id}><td><span className="mny-cat"><i className="mny-dot" style={{ background: r.cat.color }} />{r.cat.name}</span></td>
            <td className="r"><input className="fi r mny-bin" type="number" min="0" step="5" aria-label={`Budget for ${r.cat.name}`} value={(data.budgets[mk] || {})[r.cat.id] !== undefined ? data.budgets[mk][r.cat.id] : r.budget || ''} placeholder="0" onChange={(e) => setB(r.cat.id, e.target.value)} /></td>
            {data.settings.rollover && <td className={'r muted'}>{r.carry ? fmt(r.carry, { sign: true }) : '—'}</td>}
            <td className="r"><button className="mny-link" onClick={() => X.go('tx', { jump: { cat: r.cat.id, period: 'custom', from: mk + '-01', to: mk + '-31' } })}>{fmt(r.spent)}</button></td>
            <td className={'r ' + (r.left < 0 ? 'neg' : r.budget + r.carry > 0 ? 'pos' : 'muted')}><b>{fmt(r.left)}</b></td>
            <td><Bar value={r.spent} max={r.budget + r.carry} over={pct > 1} color={r.cat.color} />{pct > 0.85 && pct <= 1 && <span className="mny-warnmini">Almost used up</span>}</td></tr>); })}</tbody>
        <tfoot><tr><td><b>Total</b></td><td className="r"><b>{fmt(tot.b)}</b></td>{data.settings.rollover && <td />}<td className="r"><b>{fmt(tot.sp)}</b></td><td className={'r ' + (tot.l < 0 ? 'neg' : 'pos')}><b>{fmt(tot.l)}</b></td><td /></tr></tfoot></table></div>
    </div>
  );
}

/* ============ Reports ============ */
export function Reports({ X }) {
  const { data, fmt, cn, cur, bal } = X; const [tab, setTab] = useState('spending'); const [per, setPer] = useState('6m'); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [acc, setAcc] = useState('');
  const range = periodRange(per, new Date(), [from || '0000-01-01', to || '9999-12-31']); const d2 = acc ? { ...data, tx: data.tx.filter((t) => t.acc === acc || t.to === acc) } : data;
  const sp = sumByCat(d2, range, 'expense', acc || null); const inc = sumByCat(d2, range, 'income', acc || null);
  const nM = per === '3m' ? 3 : per === '12m' || per === 'ytd' || per === 'all' ? 12 : 6; const months = monthsBack(per === 'this' || per === 'last' ? 6 : nM); const flow = monthlyFlow(d2, months, acc || null); const nws = netWorthSeries(data, monthsBack(12)); const payees = topPayees(d2, range, 15);
  const tot = flow.reduce((s, m) => ({ i: s.i + m.income, e: s.e + m.expense }), { i: 0, e: 0 });
  const slices = (res) => res.rows.slice(0, 10).map((r) => ({ label: r.cat ? cn(r.cat).name : 'Uncategorised', value: r.value, color: r.cat ? cn(r.cat).color : '#8a8a8a', fmt: fmt(r.value) }));
  const exportCsv = () => { const rows = tab === 'spending' || tab === 'income' ? [['Category', 'Amount'], ...(tab === 'spending' ? sp : inc).rows.map((r) => [r.cat ? cn(r.cat).name : 'Uncategorised', r.value.toFixed(2)])] : tab === 'cashflow' ? [['Month', 'Income', 'Expenses', 'Net'], ...flow.map((m) => [m.k, m.income, m.expense, m.net])] : tab === 'networth' ? [['Month', 'Net worth'], ...nws.map((m) => [m.k, m.v])] : [['Payee', 'Total', 'Count'], ...payees.map((p) => [p.payee, p.total, p.count])]; download(`money-${tab}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv'); };
  const catTable = (res, color) => <table className="mny-table"><thead><tr><th>Category</th><th className="r">Amount</th><th className="r">Share</th><th style={{ width: '30%' }} /></tr></thead><tbody>{res.rows.map((r) => <tr key={r.cat || 'none'}><td><span className="mny-cat"><i className="mny-dot" style={{ background: r.cat ? cn(r.cat).color : '#8a8a8a' }} />{r.cat ? cn(r.cat).name : 'Uncategorised'}</span></td><td className="r">{fmt(r.value)}</td><td className="r muted">{res.total ? Math.round((r.value / res.total) * 100) : 0}%</td><td><Bar value={r.value} max={res.rows[0].value} color={r.cat ? cn(r.cat).color : color} /></td></tr>)}</tbody><tfoot><tr><td><b>Total</b></td><td className="r"><b>{fmt(res.total)}</b></td><td /><td /></tr></tfoot></table>;
  return (
    <div className="mny-page">
      <div className="mny-ph"><div><h1>Reports</h1><div className="muted">See where your money goes</div></div><span className="spacer" /><button className="fb" onClick={exportCsv}><Icon name="download" size={15} />Export CSV</button></div>
      <div className="fx-tabs" role="tablist">{[['spending', 'Spending'], ['income', 'Income'], ['cashflow', 'Cash flow'], ['networth', 'Net worth'], ['payees', 'Top payees']].map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
      {tab !== 'networth' && <div className="mny-filters"><select className="fi mny-sel" aria-label="Report period" value={per} onChange={(e) => setPer(e.target.value)}>{PERIODS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>{per === 'custom' && <><input type="date" className="fi mny-sel" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" className="fi mny-sel" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} /></>}
        <select className="fi mny-sel" aria-label="Report account" value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">All accounts</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
      {tab === 'spending' && (sp.rows.length ? <div className="mny-rep"><Card title="By category"><Donut slices={slices(sp)} total={fmt(sp.total)} center="Total spent" cur={cur} size={230} /></Card><Card title="Breakdown">{catTable(sp, '#e8590c')}</Card></div> : <div className="fx-empty">No spending in this period.</div>)}
      {tab === 'income' && (inc.rows.length ? <div className="mny-rep"><Card title="By source"><Donut slices={slices(inc)} total={fmt(inc.total)} center="Total income" cur={cur} size={230} /></Card><Card title="Breakdown">{catTable(inc, '#2f9e5a')}</Card></div> : <div className="fx-empty">No income in this period.</div>)}
      {tab === 'cashflow' && <div className="mny-rep one"><Card title="Income vs expenses"><FlowBars data={flow} cur={cur} height={260} /><div className="mny-legend"><span><i style={{ background: '#2f9e5a' }} />Income</span><span><i style={{ background: '#e8590c' }} />Expenses</span></div></Card>
        <Card title="By month"><table className="mny-table"><thead><tr><th>Month</th><th className="r">Income</th><th className="r">Expenses</th><th className="r">Net</th><th className="r">Savings rate</th></tr></thead><tbody>{[...flow].reverse().map((m) => <tr key={m.k}><td>{monthLabel(m.k)}</td><td className="r pos">{fmt(m.income)}</td><td className="r">{fmt(m.expense)}</td><td className={'r ' + (m.net < 0 ? 'neg' : 'pos')}>{fmt(m.net, { sign: true })}</td><td className="r muted">{m.income ? Math.round((m.net / m.income) * 100) + '%' : '—'}</td></tr>)}</tbody><tfoot><tr><td><b>Total</b></td><td className="r"><b>{fmt(tot.i)}</b></td><td className="r"><b>{fmt(tot.e)}</b></td><td className={'r ' + (tot.i - tot.e < 0 ? 'neg' : 'pos')}><b>{fmt(r2(tot.i - tot.e), { sign: true })}</b></td><td /></tr></tfoot></table></Card></div>}
      {tab === 'networth' && <div className="mny-rep one"><Card title="Net worth, last 12 months"><LineArea data={nws} cur={cur} height={260} /></Card>
        <Card title="Where it is today"><table className="mny-table"><thead><tr><th>Account</th><th>Type</th><th className="r">Balance</th></tr></thead><tbody>{Object.entries(data.accounts.reduce((g, a) => { (g[ACC_GROUPS[a.type] || 'Other'] ||= []).push(a); return g; }, {})).map(([g, list]) => [<tr key={g} className="grp"><td colSpan="2"><b>{g}</b></td><td className="r"><b>{fmt(list.reduce((s, a) => s + bal[a.id], 0))}</b></td></tr>, ...list.map((a) => <tr key={a.id}><td>{a.name}</td><td className="muted">{(ACC_TYPES.find((t) => t[0] === a.type) || [0, a.type])[1]}</td><td className={'r ' + (bal[a.id] < 0 ? 'neg' : '')}>{fmt(bal[a.id])}</td></tr>)])}</tbody><tfoot><tr><td colSpan="2"><b>Net worth</b></td><td className="r"><b>{fmt(netWorth(data))}</b></td></tr></tfoot></table></Card></div>}
      {tab === 'payees' && (payees.length ? <Card title="Where you spend the most"><table className="mny-table"><thead><tr><th>Payee</th><th className="r">Transactions</th><th className="r">Total</th><th style={{ width: '32%' }} /></tr></thead><tbody>{payees.map((p) => <tr key={p.payee}><td>{p.payee}</td><td className="r muted">{p.count}</td><td className="r">{fmt(p.total)}</td><td><Bar value={p.total} max={payees[0].total} color="#0f6cbd" /></td></tr>)}</tbody></table></Card> : <div className="fx-empty">No spending in this period.</div>)}
    </div>
  );
}

/* ============ Bills & recurring ============ */
export function Bills({ X }) {
  const { data, set, fmt, cn, toast } = X; const [days, setDays] = useState(30); const list = upcoming(data, days); const [menu, show] = useContextMenu();
  const post = (rec, date) => { X.saveTx(newTx({ acc: rec.acc, date, payee: rec.payee, cat: rec.cat, amount: rec.amount, note: rec.note || '', to: rec.to || null })); set((d) => ({ ...d, recurring: d.recurring.map((r) => (r.id === rec.id && r.next === date ? { ...r, next: advance(r) } : r)) })); toast(`Posted ${rec.payee}`); };
  const skip = (rec, date) => set((d) => ({ ...d, recurring: d.recurring.map((r) => (r.id === rec.id && r.next === date ? { ...r, next: advance(r) } : r)) }));
  const accName = (i) => (data.accounts.find((a) => a.id === i) || { name: '?' }).name;
  const monthly = data.recurring.reduce((s, r) => { const f = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.freq] || 1; return s + (r.to ? 0 : r.amount * f); }, 0);
  return (
    <div className="mny-page">
      <div className="mny-ph"><div><h1>Bills &amp; recurring</h1><div className="muted">Scheduled income, bills and subscriptions · about <b className={monthly < 0 ? 'neg' : 'pos'}>{fmt(monthly, { sign: true })}</b> a month</div></div><span className="spacer" /><button className="fb pri" onClick={() => X.editRecurring(null)}><Icon name="plus" size={15} />Add recurring</button></div>
      <Card title="Coming up" action={<div className="fx-seg">{[30, 60, 90].map((n) => <button key={n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n} days</button>)}</div>}>
        {list.length ? <div className="mny-due">{list.map((b, i) => { const dd = diffDays(new Date(), parseYmd(b.date)); const isNext = b.rec.next === b.date; return (
          <div className="row" key={b.rec.id + b.date}><div className={'when ' + (dd < 0 ? 'late' : dd <= 3 ? 'soon' : '')}><b>{parseYmd(b.date).getDate()}</b><span>{parseYmd(b.date).toLocaleDateString(undefined, { month: 'short' })}</span></div>
            <div className="grow"><div>{b.rec.payee}</div><div className="muted s">{dd < 0 ? <span className="neg">{-dd} day{dd === -1 ? '' : 's'} overdue</span> : dd === 0 ? 'Due today' : `In ${dd} day${dd === 1 ? '' : 's'}`} · {accName(b.rec.acc)}{b.rec.cat ? ` · ${cn(b.rec.cat).name}` : ''}{b.rec.auto ? ' · auto-posts' : ''}</div></div>
            <b className={b.rec.amount < 0 ? '' : 'pos'}>{fmt(b.rec.amount, { sign: true })}</b>
            {isNext ? <><button className="fb sm pri" onClick={() => post(b.rec, b.date)}>{b.rec.amount < 0 ? 'Mark paid' : 'Mark received'}</button><button className="fb sm" onClick={() => skip(b.rec, b.date)}>Skip</button></> : <span className="muted s" style={{ minWidth: 130 }}>after the previous one</span>}</div>); })}</div>
          : <div className="fx-empty">Nothing is scheduled in the next {days} days.</div>}</Card>
      <Card title="All recurring">{data.recurring.length ? <table className="mny-table"><thead><tr><th>Payee</th><th>Repeats</th><th>Next</th><th>Account</th><th className="r">Amount</th><th /></tr></thead><tbody>{data.recurring.map((r) => <tr key={r.id} onContextMenu={(e) => { e.preventDefault(); show(e, [{ label: 'Edit…', icon: 'edit', onClick: () => X.editRecurring(r) }, { label: 'Delete', icon: 'trash', danger: true, onClick: () => set((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== r.id) })) }]); }}>
          <td><button className="mny-link" onClick={() => X.editRecurring(r)}>{r.payee}</button></td><td>{(FREQS.find((f) => f[0] === r.freq) || [0, r.freq])[1]}{r.auto && <span className="fx-chip" style={{ marginLeft: 6 }}>auto</span>}</td><td>{dshort(r.next)}</td><td className="muted">{accName(r.acc)}</td><td className={'r ' + (r.amount < 0 ? '' : 'pos')}>{fmt(r.amount, { sign: true })}</td>
          <td className="r"><button className="fb sub ico sm" aria-label={`Edit ${r.payee}`} onClick={() => X.editRecurring(r)}><Icon name="edit" size={14} /></button><button className="fb sub ico sm" aria-label={`Delete ${r.payee}`} onClick={() => set((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== r.id) }))}><Icon name="trash" size={14} /></button></td></tr>)}</tbody></table> : <div className="fx-empty">No recurring items. Add rent, subscriptions or your salary.</div>}</Card>
      {menu}
    </div>
  );
}

/* ============ Goals ============ */
export function Goals({ X }) {
  const { data, set, fmt, toast } = X; const [edit, setEdit] = useState(null); const [amt, setAmt] = useState(null);
  const total = data.goals.reduce((s, g) => ({ saved: s.saved + g.saved, target: s.target + g.target }), { saved: 0, target: 0 });
  const monthsLeft = (g) => (g.due ? Math.max(1, Math.round(diffDays(new Date(), parseYmd(g.due)) / 30.4)) : null);
  return (
    <div className="mny-page">
      <div className="mny-ph"><div><h1>Savings goals</h1><div className="muted">{data.goals.length ? `${fmt(total.saved)} saved of ${fmt(total.target)}` : 'Set something to save for'}</div></div><span className="spacer" /><button className="fb pri" onClick={() => setEdit({ id: null, name: '', target: '', saved: 0, due: '', color: '#1aa39b' })}><Icon name="plus" size={15} />New goal</button></div>
      {data.goals.length ? <div className="mny-goals">{data.goals.map((g) => { const p = Math.min(1, g.saved / g.target); const left = Math.max(0, g.target - g.saved); const ml = monthsLeft(g); const done = g.saved >= g.target; return (
        <article key={g.id} className="mny-goal" style={{ '--gc': g.color }}>
          <div className="ring" role="img" aria-label={`${Math.round(p * 100)} percent saved`}><svg viewBox="0 0 64 64" width="84" height="84"><circle cx="32" cy="32" r="27" fill="none" stroke="var(--bg3)" strokeWidth="7" /><circle cx="32" cy="32" r="27" fill="none" stroke={g.color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${p * 169.6} 169.6`} transform="rotate(-90 32 32)" /></svg><b>{Math.round(p * 100)}%</b></div>
          <div className="grow"><h3>{g.name}{done && <span className="fx-chip on" style={{ marginLeft: 8 }}>Reached 🎉</span>}</h3><div className="muted">{fmt(g.saved)} of {fmt(g.target)}</div>
            <div className="muted s">{done ? 'Goal reached' : g.due ? <>{dshort(g.due)}{ml ? ` · save ${fmt(Math.ceil(left / ml))}/month to get there` : ''}</> : `${fmt(left)} to go`}</div></div>
          <div className="acts"><button className="fb sm" onClick={() => setAmt({ g, sign: 1 })}>Add money</button><button className="fb sm" onClick={() => setAmt({ g, sign: -1 })}>Withdraw</button><button className="fb sub ico sm" aria-label={`Edit ${g.name}`} onClick={() => setEdit({ ...g, due: g.due || '' })}><Icon name="edit" size={14} /></button></div></article>); })}</div>
        : <div className="fx-empty"><Icon name="target" size={40} /><h3>No goals yet</h3><div>Create a goal for an emergency fund, a trip or a big purchase, then add money to it as you go.</div></div>}
      {edit && <Modal title={edit.id ? 'Edit goal' : 'New goal'} onClose={() => setEdit(null)} width={420} footer={<>{edit.id && <button className="fb danger" style={{ marginRight: 'auto' }} onClick={() => { set((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== edit.id) })); setEdit(null); }}>Delete</button>}<button className="fb" onClick={() => setEdit(null)}>Cancel</button><button className="fb pri" disabled={!edit.name.trim() || !(+edit.target > 0)} onClick={() => { const g = { id: edit.id || id(), name: edit.name.trim(), target: +edit.target, saved: Math.max(0, +edit.saved || 0), due: edit.due || null, color: edit.color }; set((d) => ({ ...d, goals: edit.id ? d.goals.map((x) => (x.id === g.id ? g : x)) : [...d.goals, g] })); setEdit(null); }}>Save</button></>}>
        <div className="fx-kv"><label>Name</label><input className="fi" autoFocus aria-label="Goal name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><label>Target</label><input className="fi" type="number" min="1" aria-label="Goal target" value={edit.target} onChange={(e) => setEdit({ ...edit, target: e.target.value })} /><label>Saved so far</label><input className="fi" type="number" min="0" aria-label="Saved so far" value={edit.saved} onChange={(e) => setEdit({ ...edit, saved: e.target.value })} /><label>Target date</label><input className="fi" type="date" aria-label="Target date" value={edit.due} onChange={(e) => setEdit({ ...edit, due: e.target.value })} /><label>Colour</label><div className="mny-colors">{['#1aa39b', '#0f6cbd', '#8764b8', '#e3008c', '#d13438', '#ca5010', '#c19c00', '#498205'].map((c) => <button key={c} className={edit.color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setEdit({ ...edit, color: c })} />)}</div></div></Modal>}
      {amt && <Modal title={`${amt.sign > 0 ? 'Add to' : 'Withdraw from'} ${amt.g.name}`} onClose={() => setAmt(null)} width={360} footer={<><button className="fb" onClick={() => setAmt(null)}>Cancel</button><button className="fb pri" disabled={!(+amt.v > 0)} onClick={() => { const v = +amt.v * amt.sign; set((d) => ({ ...d, goals: d.goals.map((g) => (g.id === amt.g.id ? { ...g, saved: Math.max(0, r2(g.saved + v)) } : g)) })); toast(amt.sign > 0 ? `Added ${fmt(+amt.v)}` : `Withdrew ${fmt(+amt.v)}`); setAmt(null); }}>OK</button></>}>
        <input className="fi" type="number" min="0" autoFocus aria-label="Amount" placeholder="Amount" value={amt.v || ''} onChange={(e) => setAmt({ ...amt, v: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && +amt.v > 0) e.currentTarget.closest('.fx-modal').querySelector('.fb.pri').click(); }} /></Modal>}
    </div>
  );
}
