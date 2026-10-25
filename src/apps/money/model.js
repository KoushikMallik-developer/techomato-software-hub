import { ymd, parseYmd, addDays, addMonths, daysInMonth, startOfMonth } from '../../lib/cal.js';

export const id = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const ACC_TYPES = [['checking', 'Checking', 'bank'], ['savings', 'Savings', 'piggy'], ['card', 'Credit card', 'card'], ['cash', 'Cash', 'wallet'], ['invest', 'Investment', 'chartLine'], ['loan', 'Loan', 'file']];
export const ACC_GROUPS = { checking: 'Cash & bank', savings: 'Cash & bank', cash: 'Cash & bank', card: 'Credit & loans', loan: 'Credit & loans', invest: 'Investments' };
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD', 'AED', 'BRL', 'MXN', 'ZAR', 'SEK', 'NZD', 'KRW', 'RUB', 'TRY', 'IDR', 'PHP', 'THB', 'BDT', 'PKR', 'NGN', 'EGP'];
export const COLORS = ['#1aa39b', '#0f6cbd', '#8764b8', '#e3008c', '#d13438', '#ca5010', '#c19c00', '#498205', '#00b294', '#5c7e8c', '#7a7574', '#4f6bed'];
export const FREQS = [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Every 3 months'], ['yearly', 'Yearly']];

const C = (name, group, color, budget = 0) => ({ id: 'c_' + name.toLowerCase().replace(/[^a-z]+/g, ''), name, group, color, budget });
export const defaultCats = () => [
  C('Salary', 'income', '#498205'), C('Freelance', 'income', '#00b294'), C('Interest', 'income', '#5c7e8c'), C('Gifts received', 'income', '#c19c00'), C('Other income', 'income', '#7a7574'),
  C('Housing', 'expense', '#0f6cbd', 0), C('Groceries', 'expense', '#498205', 0), C('Dining out', 'expense', '#ca5010', 0), C('Transport', 'expense', '#8764b8', 0), C('Utilities', 'expense', '#00b294', 0), C('Health', 'expense', '#d13438', 0),
  C('Shopping', 'expense', '#e3008c', 0), C('Entertainment', 'expense', '#4f6bed', 0), C('Travel', 'expense', '#1aa39b', 0), C('Education', 'expense', '#c19c00', 0), C('Subscriptions', 'expense', '#5c7e8c', 0), C('Insurance', 'expense', '#7a7574', 0), C('Personal care', 'expense', '#a4262c', 0), C('Gifts & donations', 'expense', '#bf5700', 0), C('Fees & taxes', 'expense', '#69797e', 0), C('Other', 'expense', '#8a8a8a', 0),
];
export const blankData = () => ({
  v: 1, settings: { currency: 'USD', rollover: false, hideCents: false },
  accounts: [{ id: 'a_main', name: 'Checking', type: 'checking', start: 0, color: '#1aa39b', closed: false }],
  cats: defaultCats(), tx: [], budgets: {}, recurring: [], goals: [], ui: { view: 'overview', acc: null },
});
export const migrate = (v) => { const b = blankData(); return { ...b, ...v, settings: { ...b.settings, ...(v.settings || {}) }, ui: { ...b.ui, ...(v.ui || {}) }, accounts: Array.isArray(v.accounts) && v.accounts.length ? v.accounts : b.accounts, cats: Array.isArray(v.cats) && v.cats.length ? v.cats : b.cats, tx: Array.isArray(v.tx) ? v.tx : [], recurring: v.recurring || [], goals: v.goals || [], budgets: v.budgets || {} }; };
export const newTx = (o = {}) => ({ id: id(), acc: null, date: ymd(new Date()), payee: '', cat: null, amount: 0, note: '', cleared: false, to: null, splits: null, tags: [], ...o });

export const money = (n, cur = 'USD', o = {}) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, minimumFractionDigits: o.hideCents ? 0 : undefined, maximumFractionDigits: o.hideCents ? 0 : undefined, signDisplay: o.sign ? 'exceptZero' : 'auto' }).format(n); } catch { return (n < 0 ? '-' : '') + Math.abs(n).toFixed(2); } };
export const compact = (n, cur = 'USD') => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch { return String(Math.round(n)); } };
export const r2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
export const monthKey = (d) => (typeof d === 'string' ? d.slice(0, 7) : ymd(d).slice(0, 7));
export const monthLabel = (k, o = { month: 'long', year: 'numeric' }) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, o); };
export const shiftMonth = (k, n) => monthKey(addMonths(parseYmd(k + '-01'), n));

/* ----- balances ----- */
export function balances(data, upTo = null) {
  const b = {}; data.accounts.forEach((a) => { b[a.id] = r2(+a.start || 0); });
  for (const t of data.tx) { if (upTo && t.date > upTo) continue; if (b[t.acc] !== undefined) b[t.acc] = r2(b[t.acc] + t.amount); if (t.to && b[t.to] !== undefined) b[t.to] = r2(b[t.to] - t.amount); }
  return b;
}
export const netWorth = (data, upTo) => { const b = balances(data, upTo); return r2(data.accounts.filter((a) => !a.closed || b[a.id] !== 0).reduce((s, a) => s + b[a.id], 0)); };
export const isTransfer = (t) => !!t.to;
/* a tx as category parts (handles splits). Transfers have none. */
export const parts = (t) => (t.to ? [] : t.splits && t.splits.length ? t.splits : [{ cat: t.cat, amount: t.amount }]);
export const catById = (data) => { const m = new Map(data.cats.map((c) => [c.id, c])); return (k) => m.get(k) || { id: k, name: 'Uncategorised', group: 'expense', color: '#8a8a8a' }; };

/* ----- period helpers ----- */
export function periodRange(kind, now = new Date(), custom) {
  const k = monthKey(now); const y = now.getFullYear();
  const first = (mk) => mk + '-01'; const last = (mk) => mk + '-' + String(daysInMonth(+mk.slice(0, 4), +mk.slice(5) - 1)).padStart(2, '0');
  switch (kind) {
    case 'this': return [first(k), last(k)];
    case 'last': { const p = shiftMonth(k, -1); return [first(p), last(p)]; }
    case '3m': return [first(shiftMonth(k, -2)), last(k)];
    case '6m': return [first(shiftMonth(k, -5)), last(k)];
    case 'ytd': return [`${y}-01-01`, ymd(now)];
    case '12m': return [first(shiftMonth(k, -11)), last(k)];
    case 'year': return [`${y}-01-01`, `${y}-12-31`];
    case 'all': return ['0000-01-01', '9999-12-31'];
    case 'custom': return custom || ['0000-01-01', '9999-12-31'];
    default: return [first(k), last(k)];
  }
}
export const PERIODS = [['this', 'This month'], ['last', 'Last month'], ['3m', 'Last 3 months'], ['6m', 'Last 6 months'], ['ytd', 'Year to date'], ['12m', 'Last 12 months'], ['all', 'All time'], ['custom', 'Custom…']];
export const inRange = (t, [a, b]) => t.date >= a && t.date <= b;

/* ----- aggregation ----- */
export function sumByCat(data, range, group = 'expense', accId = null) {
  const m = new Map(); let total = 0;
  for (const t of data.tx) {
    if (!inRange(t, range) || (accId && t.acc !== accId)) continue;
    for (const p of parts(t)) {
      const c = data.cats.find((x) => x.id === p.cat); const g = c ? c.group : p.amount < 0 ? 'expense' : 'income';
      if (g !== group) continue; const v = group === 'expense' ? -p.amount : p.amount; m.set(p.cat || '_none', r2((m.get(p.cat || '_none') || 0) + v)); total = r2(total + v);
    }
  }
  return { rows: [...m.entries()].map(([cat, v]) => ({ cat: cat === '_none' ? null : cat, value: v })).sort((a, b) => b.value - a.value), total };
}
export function monthlyFlow(data, months, accId = null) {
  const out = months.map((k) => ({ k, income: 0, expense: 0, net: 0 })); const ix = new Map(out.map((o, i) => [o.k, i]));
  for (const t of data.tx) { if (t.to) continue; if (accId && t.acc !== accId) continue; const i = ix.get(t.date.slice(0, 7)); if (i === undefined) continue; for (const p of parts(t)) { const c = data.cats.find((x) => x.id === p.cat); const g = c ? c.group : p.amount < 0 ? 'expense' : 'income'; if (g === 'income') out[i].income = r2(out[i].income + p.amount); else out[i].expense = r2(out[i].expense - p.amount); } }
  out.forEach((o) => { o.net = r2(o.income - o.expense); }); return out;
}
export const monthsBack = (n, from = new Date()) => Array.from({ length: n }, (_, i) => shiftMonth(monthKey(from), i - (n - 1)));
export function netWorthSeries(data, months) { return months.map((k) => ({ k, v: netWorth(data, k + '-' + String(daysInMonth(+k.slice(0, 4), +k.slice(5) - 1)).padStart(2, '0')) })); }
export function topPayees(data, range, n = 10) {
  const m = new Map(); for (const t of data.tx) { if (t.to || !inRange(t, range) || t.amount >= 0) continue; const k = (t.payee || '(none)').trim(); const o = m.get(k) || { payee: k, total: 0, count: 0 }; o.total = r2(o.total - t.amount); o.count++; m.set(k, o); }
  return [...m.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

/* ----- budget ----- */
export const budgetFor = (data, mk, catId) => { const b = data.budgets[mk]; if (b && b[catId] !== undefined) return +b[catId] || 0; const c = data.cats.find((x) => x.id === catId); return c ? +c.budget || 0 : 0; };
export function budgetRows(data, mk) {
  const range = [mk + '-01', mk + '-31']; const spent = new Map(sumByCat(data, range, 'expense').rows.map((r) => [r.cat, r.value]));
  const prev = shiftMonth(mk, -1);
  return data.cats.filter((c) => c.group === 'expense').map((c) => {
    const budget = budgetFor(data, mk, c.id); const s = spent.get(c.id) || 0;
    let carry = 0;
    if (data.settings.rollover) { const pr = [prev + '-01', prev + '-31']; const ps = (sumByCat(data, pr, 'expense').rows.find((r) => r.cat === c.id) || { value: 0 }).value; carry = Math.max(-1e9, r2(budgetFor(data, prev, c.id) - ps)); if (!hasAnyBefore(data, prev)) carry = 0; }
    return { cat: c, budget, spent: s, carry, left: r2(budget + carry - s) };
  });
}
const hasAnyBefore = (data, mk) => data.tx.some((t) => t.date.slice(0, 7) <= mk);

/* ----- recurring ----- */
export function nextDate(date, freq) { const d = parseYmd(date); switch (freq) { case 'weekly': return ymd(addDays(d, 7)); case 'biweekly': return ymd(addDays(d, 14)); case 'quarterly': return ymd(addMonths(d, 3)); case 'yearly': return ymd(addMonths(d, 12)); default: { const n = addMonths(d, 1); return ymd(n); } } }
/* monthly recurrences keep the original day-of-month (31st → end of shorter months) */
export function advance(rec) { const base = rec.anchorDay || parseYmd(rec.next).getDate(); if (rec.freq === 'monthly' || rec.freq === 'quarterly' || rec.freq === 'yearly') { const step = rec.freq === 'monthly' ? 1 : rec.freq === 'quarterly' ? 3 : 12; const d = parseYmd(rec.next); const t = new Date(d.getFullYear(), d.getMonth() + step, 1); t.setDate(Math.min(base, daysInMonth(t.getFullYear(), t.getMonth()))); return ymd(t); } return nextDate(rec.next, rec.freq); }
export function dueRecurring(rec, upto) { const out = []; let cur = rec.next; let guard = 0; let r = { ...rec }; while (cur && cur <= upto && (!rec.end || cur <= rec.end) && guard++ < 400) { out.push(cur); r = { ...r, next: cur }; cur = advance(r); } return { dates: out, next: cur }; }
export function upcoming(data, days = 30, from = new Date()) {
  const end = ymd(addDays(from, days)); const out = [];
  for (const rec of data.recurring) { let r = { ...rec }; let guard = 0; while (r.next <= end && (!rec.end || r.next <= rec.end) && guard++ < 100) { out.push({ rec, date: r.next, overdue: r.next < ymd(from) }); r = { ...r, next: advance(r) }; } }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ----- CSV ----- */
export function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false; const s = text.replace(/^﻿/, '');
  const delim = (s.split('\n')[0].match(/;/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? ';' : s.split('\n')[0].includes('\t') ? '\t' : ',';
  for (let i = 0; i < s.length; i++) { const ch = s[i]; if (q) { if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; } else if (ch === '"') q = true; else if (ch === delim) { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; } else f += ch; }
  row.push(f); if (row.some((x) => x.trim() !== '')) rows.push(row); return rows;
}
export const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function txToCsv(data, list) { const cn = catById(data); const an = new Map(data.accounts.map((a) => [a.id, a.name])); const head = ['Date', 'Account', 'Payee', 'Category', 'Amount', 'Cleared', 'Transfer to', 'Note', 'Tags']; return [head, ...list.map((t) => [t.date, an.get(t.acc) || '', t.payee, t.splits ? 'Split' : t.to ? '' : t.cat ? cn(t.cat).name : '', t.amount.toFixed(2), t.cleared ? 'Y' : '', t.to ? an.get(t.to) || '' : '', t.note, (t.tags || []).join(' ')])].map((r) => r.map(csvCell).join(',')).join('\r\n'); }
export function parseAmount(s) { if (typeof s === 'number') return s; let t = String(s || '').trim(); if (!t) return NaN; let neg = false; if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); } if (/-$/.test(t)) { neg = true; t = t.slice(0, -1); } if (/^(dr|db)/i.test(t)) { neg = true; } t = t.replace(/[^0-9.,\-]/g, ''); if (t.startsWith('-')) { neg = true; t = t.slice(1); } const lc = t.lastIndexOf(','); const ld = t.lastIndexOf('.'); if (lc > ld && (ld >= 0 || /,\d{1,2}$/.test(t))) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, ''); const n = parseFloat(t); if (isNaN(n)) return NaN; return r2(neg ? -n : n); }
export function parseDateLoose(s, dayFirst = false) { const t = String(s || '').trim(); let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`; m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t); if (m) { let [, a, b, y] = m; if (y.length === 2) y = (+y > 69 ? '19' : '20') + y; let d = dayFirst ? +a : +b; let mo = dayFirst ? +b : +a; if (mo > 12 && d <= 12) [d, mo] = [mo, d]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; } const dt = new Date(t); if (!isNaN(dt)) return ymd(dt); return null; }
export function guessColumns(head) { const l = head.map((h) => h.toLowerCase()); const find = (...ks) => l.findIndex((h) => ks.some((k) => h.includes(k))); return { date: find('date', 'posted'), payee: find('payee', 'description', 'merchant', 'memo', 'name', 'narration', 'details'), amount: find('amount', 'value'), debit: find('debit', 'withdraw', 'paid out'), credit: find('credit', 'deposit', 'paid in'), cat: find('categor'), note: find('note', 'memo') === find('payee', 'description') ? -1 : find('note', 'memo') }; }
export function importRows(rows, map, { dayFirst, invert }) {
  const out = []; let bad = 0;
  for (const r of rows) { const date = parseDateLoose(r[map.date], dayFirst); let amt = NaN; if (map.amount >= 0) amt = parseAmount(r[map.amount]); else { const d = map.debit >= 0 ? parseAmount(r[map.debit]) : NaN; const c = map.credit >= 0 ? parseAmount(r[map.credit]) : NaN; amt = (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(d) ? 0 : Math.abs(d)); if (isNaN(d) && isNaN(c)) amt = NaN; } if (!date || isNaN(amt)) { bad++; continue; } out.push({ date, amount: invert ? -amt : amt, payee: (r[map.payee] || '').trim().slice(0, 120), catName: map.cat >= 0 ? (r[map.cat] || '').trim() : '', note: map.note >= 0 ? (r[map.note] || '').trim().slice(0, 300) : '' }); }
  return { list: out, bad };
}
export const dupKey = (t) => `${t.acc}|${t.date}|${t.amount}|${(t.payee || '').toLowerCase()}`;

/* ----- sample data ----- */
export function sampleData() {
  const b = blankData(); const now = new Date(); const cn = (n) => b.cats.find((c) => c.name === n).id;
  b.accounts = [{ id: 'a_chk', name: 'Everyday Checking', type: 'checking', start: 2400, color: '#0f6cbd', closed: false }, { id: 'a_sav', name: 'Rainy-day Savings', type: 'savings', start: 8000, color: '#498205', closed: false }, { id: 'a_cc', name: 'Rewards Card', type: 'card', start: -420, color: '#d13438', closed: false }, { id: 'a_cash', name: 'Wallet', type: 'cash', start: 120, color: '#c19c00', closed: false }];
  const bud = { Housing: 1300, Groceries: 450, 'Dining out': 180, Transport: 160, Utilities: 210, Health: 90, Shopping: 200, Entertainment: 100, Subscriptions: 60, Travel: 150, Insurance: 120, 'Personal care': 50, 'Gifts & donations': 60, Other: 80 };
  b.cats.forEach((c) => { if (bud[c.name]) c.budget = bud[c.name]; });
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const tx = []; const add = (acc, date, payee, cat, amount, extra = {}) => tx.push(newTx({ acc, date, payee, cat: cat && cn(cat), amount: r2(amount), cleared: date < ymd(addDays(now, -3)), ...extra }));
  for (let m = 5; m >= 0; m--) {
    const base = addMonths(startOfMonth(now), -m); const Y = base.getFullYear(); const M = base.getMonth(); const dd = (d) => ymd(new Date(Y, M, Math.min(d, daysInMonth(Y, M))));
    add('a_chk', dd(1), 'Acme Corp payroll', 'Salary', 3650); add('a_chk', dd(15), 'Acme Corp payroll', 'Salary', 3650); if (m % 2 === 0) add('a_chk', dd(20), 'Side project client', 'Freelance', 300 + Math.round(rnd() * 400));
    add('a_chk', dd(2), 'Maple Street Apartments', 'Housing', -1300); add('a_chk', dd(8), 'City Power & Water', 'Utilities', -(90 + Math.round(rnd() * 40))); add('a_chk', dd(10), 'FiberNet Internet', 'Utilities', -65);
    add('a_cc', dd(5), 'StreamFlix', 'Subscriptions', -15.99); add('a_cc', dd(7), 'Tunes Premium', 'Subscriptions', -10.99); add('a_chk', dd(12), 'SafeDrive Insurance', 'Insurance', -118);
    for (let i = 0; i < 5; i++) add(i % 2 ? 'a_cc' : 'a_chk', dd(3 + i * 6), ['Green Basket Market', 'FreshMart', 'Corner Grocer'][i % 3], 'Groceries', -(55 + Math.round(rnd() * 60)));
    for (let i = 0; i < 4; i++) add('a_cc', dd(4 + i * 7), ['Luigi\'s Pizzeria', 'Bean There Coffee', 'Sushi Zen', 'Taco Corner'][i], 'Dining out', -(14 + Math.round(rnd() * 38)));
    add('a_cc', dd(9), 'Metro Fuel', 'Transport', -(38 + Math.round(rnd() * 25))); add('a_cc', dd(22), 'Metro Fuel', 'Transport', -(38 + Math.round(rnd() * 25))); add('a_cash', dd(11), 'Bus pass top-up', 'Transport', -20);
    if (m % 2 === 1) add('a_cc', dd(17), 'Bright Dental', 'Health', -(60 + Math.round(rnd() * 70))); add('a_cc', dd(19), 'Urban Outfitters', 'Shopping', -(30 + Math.round(rnd() * 120))); if (m % 3 === 0) add('a_cc', dd(24), 'CinemaPlex', 'Entertainment', -(24 + Math.round(rnd() * 20)));
    add('a_chk', dd(27), 'Transfer to savings', null, -400, { to: 'a_sav' }); add('a_chk', dd(28), 'Rewards Card payment', null, -350, { to: 'a_cc' });
  }
  b.tx = tx.filter((t) => t.date <= ymd(now)).sort((a, z) => (a.date < z.date ? 1 : -1));
  const nm = monthKey(now); const ps = shiftMonth(nm, -1); b.budgets = { [nm]: { [cn('Dining out')]: 200 }, [ps]: {} };
  b.recurring = [{ id: id(), acc: 'a_chk', payee: 'Maple Street Apartments', cat: cn('Housing'), amount: -1300, freq: 'monthly', next: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 2)), end: null, auto: false, note: 'Rent' }, { id: id(), acc: 'a_cc', payee: 'StreamFlix', cat: cn('Subscriptions'), amount: -15.99, freq: 'monthly', next: ymd(addDays(now, 4)), end: null, auto: true, note: '' }, { id: id(), acc: 'a_chk', payee: 'Acme Corp payroll', cat: cn('Salary'), amount: 3650, freq: 'monthly', next: ymd(addDays(now, 9)), end: null, auto: false, note: '' }];
  b.goals = [{ id: id(), name: 'Emergency fund', target: 12000, saved: 8000, due: ymd(addMonths(now, 14)), color: '#498205' }, { id: id(), name: 'Japan trip', target: 3500, saved: 900, due: ymd(addMonths(now, 8)), color: '#e3008c' }, { id: id(), name: 'New laptop', target: 1600, saved: 400, due: null, color: '#0f6cbd' }];
  return b;
}
