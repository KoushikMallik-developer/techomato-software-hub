// Starter spreadsheets offered in File - New.
import { Draft, applyStyleToRanges, newBook, nid, setCellInput } from '../../lib/sheet/model.js';

function build(fn) {
  return () => {
    const d = new Draft(newBook());
    const sh = d.sheet(0);
    const put = (r, c, text, st) => { setCellInput(d, 0, r, c, String(text)); if (st) style(r, c, r, c, st); };
    const style = (r1, c1, r2, c2, st) => applyStyleToRanges(d, 0, [{ r1, c1, r2, c2 }], st);
    const row = (r, c, arr, st) => arr.forEach((t, i) => put(r, c + i, t, st));
    const widths = (o) => { sh.colW = { ...sh.colW, ...o }; };
    fn({ d, sh, put, style, row, widths });
    const out = d.done();
    out.active = out.sheets[0].id;
    return out;
  };
}
const HEAD = { b: true, bg: '#1f4e79', fc: '#ffffff' };
const MONEY = '$#,##0.00';

export const SHEET_TEMPLATES = [
  {
    name: 'Monthly budget', title: 'Monthly budget',
    make: build(({ sh, put, row, style, widths }) => {
      put(0, 0, 'Monthly budget', { b: true, fs: 18 });
      row(2, 0, ['Category', 'Budget', 'Actual', 'Difference'], HEAD);
      const items = [['Rent', 1400, 1400], ['Groceries', 450, 512.4], ['Utilities', 180, 164.75], ['Transport', 120, 98.2], ['Insurance', 210, 210], ['Eating out', 150, 187.5], ['Subscriptions', 45, 52.97], ['Savings', 400, 400]];
      items.forEach((it, i) => { const r = 3 + i; put(r, 0, it[0]); put(r, 1, it[1]); put(r, 2, it[2]); put(r, 3, `=B${r + 1}-C${r + 1}`); });
      const t = 3 + items.length;
      row(t, 0, ['Total', `=SUM(B4:B${t})`, `=SUM(C4:C${t})`, `=B${t + 1}-C${t + 1}`], { b: true, bt: undefined });
      style(3, 1, t, 3, { fmt: MONEY }); style(t, 0, t, 3, { bg: '#ddebf7' });
      widths({ 0: 170, 1: 110, 2: 110, 3: 120 });
      sh.cf = [{ id: nid('cf'), ranges: [{ r1: 3, c1: 3, r2: t, c2: 3 }], type: 'cell', op: 'lt', v1: '0', style: { fc: '#c5221f', b: true } }, { id: nid('cf'), ranges: [{ r1: 3, c1: 2, r2: t - 1, c2: 2 }], type: 'bar', color: '#9fc5e8', negColor: '#e06666' }];
      sh.charts = [{ id: nid('ch'), type: 'column', range: `A3:C${t}`, title: 'Budget vs actual', legend: 'bottom', x: 580, y: 40, w: 520, h: 320 }];
    }),
  },
  {
    name: 'Invoice', title: 'Invoice',
    make: build(({ sh, put, row, style, widths }) => {
      put(0, 0, 'INVOICE', { b: true, fs: 22, fc: '#1f4e79' });
      put(2, 0, 'Bill to:', { b: true }); put(3, 0, 'Customer name'); put(4, 0, 'Street address'); put(5, 0, 'City, postcode');
      put(2, 3, 'Invoice #', { b: true }); put(2, 4, 'INV-0001'); put(3, 3, 'Date', { b: true }); put(3, 4, '=TODAY()', { fmt: 'yyyy-mm-dd' }); put(4, 3, 'Due', { b: true }); put(4, 4, '=E4+30', { fmt: 'yyyy-mm-dd' });
      row(7, 0, ['Description', 'Qty', 'Unit price', 'Amount'], HEAD);
      const items = [['Design work', 12, 85], ['Development', 30, 95], ['Hosting (annual)', 1, 240]];
      items.forEach((it, i) => { const r = 8 + i; put(r, 0, it[0]); put(r, 1, it[1]); put(r, 2, it[2], { fmt: MONEY }); put(r, 3, `=B${r + 1}*C${r + 1}`, { fmt: MONEY }); });
      for (let r = 11; r < 15; r++) put(r, 3, `=IF(B${r + 1}="","",B${r + 1}*C${r + 1})`, { fmt: MONEY });
      put(15, 2, 'Subtotal', { b: true }); put(15, 3, '=SUM(D9:D15)', { fmt: MONEY });
      put(16, 2, 'Tax rate', { b: true }); put(16, 3, 0.08, { fmt: '0.0%' });
      put(17, 2, 'Tax', { b: true }); put(17, 3, '=D16*D17', { fmt: MONEY });
      put(18, 2, 'Total due', { b: true, fs: 13 }); put(18, 3, '=D16+D18', { fmt: MONEY, b: true, fs: 13, bg: '#ddebf7' });
      style(8, 1, 14, 1, { fmt: '0' });
      widths({ 0: 240, 1: 70, 2: 110, 3: 120, 4: 110 }); sh.grid = false;
    }),
  },
  {
    name: 'Task tracker', title: 'Task tracker',
    make: build(({ sh, put, row, widths }) => {
      row(0, 0, ['Task', 'Owner', 'Status', 'Priority', 'Due', 'Done'], HEAD);
      const tasks = [['Draft project plan', 'Sam', 'Done', 'High', '2026-11-02'], ['Design review', 'Priya', 'In progress', 'High', '2026-11-09'], ['Set up analytics', 'Lee', 'In progress', 'Medium', '2026-11-12'], ['Write launch email', 'Sam', 'Not started', 'Medium', '2026-11-16'], ['Customer interviews', 'Priya', 'Not started', 'Low', '2026-11-23']];
      tasks.forEach((t, i) => { row(1 + i, 0, t); put(1 + i, 5, t[2] === 'Done' ? 'TRUE' : 'FALSE'); });
      widths({ 0: 220, 1: 100, 2: 120, 3: 100, 4: 110, 5: 70 });
      sh.dv = [
        { id: nid('dv'), ranges: [{ r1: 1, c1: 2, r2: 200, c2: 2 }], type: 'list', items: ['Not started', 'In progress', 'Blocked', 'Done'] },
        { id: nid('dv'), ranges: [{ r1: 1, c1: 3, r2: 200, c2: 3 }], type: 'list', items: ['High', 'Medium', 'Low'] },
        { id: nid('dv'), ranges: [{ r1: 1, c1: 5, r2: 200, c2: 5 }], type: 'checkbox' },
      ];
      sh.cf = [
        { id: nid('cf'), ranges: [{ r1: 1, c1: 2, r2: 200, c2: 2 }], type: 'cell', op: 'eq', v1: 'Done', style: { bg: '#c6efce', fc: '#006100' } },
        { id: nid('cf'), ranges: [{ r1: 1, c1: 2, r2: 200, c2: 2 }], type: 'cell', op: 'eq', v1: 'Blocked', style: { bg: '#f4c7c3', fc: '#9c0006' } },
        { id: nid('cf'), ranges: [{ r1: 1, c1: 3, r2: 200, c2: 3 }], type: 'cell', op: 'eq', v1: 'High', style: { fc: '#c5221f', b: true } },
        { id: nid('cf'), ranges: [{ r1: 1, c1: 0, r2: 200, c2: 5 }], type: 'formula', f: '=$F2=TRUE', style: { fc: '#80868b', st: true } },
      ];
      sh.freeze = { r: 1, c: 0 };
    }),
  },
  {
    name: 'Gradebook', title: 'Gradebook',
    make: build(({ sh, put, row, style, widths }) => {
      row(0, 0, ['Student', 'Quiz 1', 'Quiz 2', 'Midterm', 'Final', 'Average', 'Grade'], HEAD);
      const names = ['Avery', 'Blake', 'Casey', 'Devon', 'Emerson', 'Finley'];
      const scores = [[88, 92, 79, 85], [72, 65, 70, 68], [95, 98, 91, 97], [60, 74, 66, 71], [81, 77, 84, 80], [55, 62, 58, 64]];
      names.forEach((n, i) => { const r = 1 + i; put(r, 0, n); scores[i].forEach((s, j) => put(r, 1 + j, s)); put(r, 5, `=ROUND(AVERAGE(B${r + 1}:E${r + 1}),1)`); put(r, 6, `=IFS(F${r + 1}>=90,"A",F${r + 1}>=80,"B",F${r + 1}>=70,"C",F${r + 1}>=60,"D",TRUE,"F")`, { ha: 'center', b: true }); });
      const last = 1 + names.length;
      put(last, 0, 'Class average', { b: true }); for (let c = 1; c <= 5; c++) put(last, c, `=ROUND(AVERAGE(${String.fromCharCode(65 + c)}2:${String.fromCharCode(65 + c)}${last}),1)`, { b: true });
      style(last, 0, last, 6, { bg: '#ddebf7' });
      widths({ 0: 150 });
      sh.cf = [{ id: nid('cf'), ranges: [{ r1: 1, c1: 1, r2: last - 1, c2: 5 }], type: 'scale', stops: [{ type: 'min', color: '#f8696b' }, { type: 'percentile', v: 50, color: '#ffeb84' }, { type: 'max', color: '#63be7b' }] }];
      sh.freeze = { r: 1, c: 1 };
    }),
  },
  {
    name: 'Sales summary', title: 'Sales summary',
    make: build(({ sh, put, row, style, widths }) => {
      row(0, 0, ['Month', 'North', 'South', 'East', 'West', 'Total', 'Trend'], HEAD);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const data = [[12400, 9800, 15200, 11100], [13100, 10300, 14800, 11900], [14900, 9900, 16100, 12400], [14200, 11200, 17300, 12000], [16100, 11800, 17900, 13500], [17300, 12400, 19200, 14100]];
      months.forEach((m, i) => { const r = 1 + i; put(r, 0, m); data[i].forEach((v, j) => put(r, 1 + j, v)); put(r, 5, `=SUM(B${r + 1}:E${r + 1})`, { b: true }); });
      put(7, 0, 'Total', { b: true }); for (let c = 1; c <= 5; c++) { const L = String.fromCharCode(65 + c); put(7, c, `=SUM(${L}2:${L}7)`, { b: true }); }
      put(1, 6, '=SPARKLINE(B2:E2)'); style(7, 0, 7, 6, { bg: '#ddebf7' }); style(1, 1, 7, 5, { fmt: '$#,##0' });
      put(9, 0, 'Best month', { b: true }); put(9, 1, '=INDEX(A2:A7,MATCH(MAX(F2:F7),F2:F7,0))');
      put(10, 0, 'Growth Jan to Jun', { b: true }); put(10, 1, '=F7/F2-1', { fmt: '0.0%' });
      widths({ 0: 150, 6: 120 });
      sh.charts = [{ id: nid('ch'), type: 'column', range: 'A1:E7', title: 'Sales by region', legend: 'bottom', stacked: true, x: 20, y: 300, w: 520, h: 300 }, { id: nid('ch'), type: 'line', range: 'A1:E7', title: 'Regional trend', legend: 'bottom', smooth: true, x: 560, y: 300, w: 440, h: 300 }];
    }),
  },
];
