// Date helpers for Money.
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); const dim = daysInMonth(x.getFullYear(), x.getMonth()); x.setDate(Math.min(d.getDate(), dim)); x.setHours(d.getHours(), d.getMinutes(), 0, 0); return x; };
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const diffDays = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
export const fmtDate = (d, o = { month: 'short', day: 'numeric' }) => d.toLocaleDateString(undefined, o);
