import { THEMES, themeById, newSlide, newChart, newTable, newShape, newText, newLine, P, SW, SH } from './model.js';

const slide = (th, layout, f = {}, extra = []) => {
  const s = newSlide(layout, th);
  const set = (role, text, bul) => { const e = s.els.find((x) => x.ph === role); if (e && text !== undefined) e.paras = P(text, bul ? { para: { bul: 'dot' } } : {}); };
  set('title', f.title); set('sub', f.sub); set('body', Array.isArray(f.body) ? f.body.join('\n') : f.body, true); set('body2', Array.isArray(f.body2) ? f.body2.join('\n') : f.body2, true); set('head1', f.head1); set('head2', f.head2);
  if (f.notes) s.notes = f.notes;
  s.els.push(...extra.map((e) => ({ ...e })));
  s.els = s.els.filter((e) => !(e.ph && e.paras.every((p) => !p.runs.length) && f.dropEmpty));
  return s;
};
const deck = (th, slides, footer) => ({ v: 2, w: SW, h: SH, theme: { ...th }, footer: footer || { num: true, text: '' }, slides });

const stat = (x, y, big, small, col = '@a1') => [
  newText({ x, y, w: 260, h: 80, paras: P(big), tx: { sz: 54, b: true, c: col, f: '@head', al: 'center', va: 'bot', pad: 4 } }),
  newText({ x, y: y + 84, w: 260, h: 40, paras: P(small), tx: { sz: 18, c: '@muted', al: 'center', va: 'top', pad: 4 } }),
];

export const SLIDE_TEMPLATES = [
  {
    name: 'Pitch deck', title: 'Pitch deck',
    make: () => {
      const th = themeById('bold');
      return deck(th, [
        slide(th, 'title', { title: 'Your startup name', sub: 'One sentence that says what you do', notes: 'Open with the one-liner. Keep it under 20 seconds.' }),
        slide(th, 'content', { title: 'The problem', body: ['Who has the problem, and how often', 'What it costs them today (time, money, risk)', 'Why current options fall short'] }),
        slide(th, 'two', { title: 'Our solution', body: ['What we built', 'How it works in three steps'], body2: ['Why it is better', 'What makes it hard to copy'] }),
        slide(th, 'titleOnly', { title: 'Traction' }, [...stat(60, 170, '12k', 'active users'), ...stat(350, 170, '38%', 'month-over-month growth', '@a2'), ...stat(640, 170, '$240k', 'annual run rate', '@a3'), newChart('column', { x: 60, y: 330, w: 840, h: 170, chart: { type: 'column', title: '', legend: 'none', labels: false, colors: ['@a1'] }, data: { cats: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], series: [{ name: 'Users', values: [1.2, 2.1, 3.9, 6.3, 8.8, 12] }] } })]),
        slide(th, 'content', { title: 'Business model', body: ['Who pays and how much', 'Unit economics at a glance', 'Path to profitability'] }),
        slide(th, 'compare', { title: 'Team', head1: 'Founders', body: ['Name - role and background', 'Name - role and background'], head2: 'Advisors', body2: ['Name - why they matter', 'Name - why they matter'] }),
        slide(th, 'section', { title: 'The ask', sub: 'What you are raising and what it unlocks' }),
      ]);
    },
  },
  {
    name: 'Project status update', title: 'Project status update',
    make: () => {
      const th = themeById('office');
      const tbl = newTable(5, 4, { x: 64, y: 140, w: 832, rowH: [44, 44, 44, 44, 44], cells: [[{ t: 'Workstream' }, { t: 'Owner' }, { t: 'Status' }, { t: 'Due' }], [{ t: 'Design' }, { t: 'Ana' }, { t: 'On track', c: '#16a34a', b: true }, { t: 'Nov 12' }], [{ t: 'Build' }, { t: 'Raj' }, { t: 'At risk', c: '#ca8a04', b: true }, { t: 'Dec 03' }], [{ t: 'Testing' }, { t: 'Mei' }, { t: 'Not started', c: '#6b7280' }, { t: 'Dec 15' }], [{ t: 'Launch' }, { t: 'Sam' }, { t: 'Not started', c: '#6b7280' }, { t: 'Jan 08' }]] });
      return deck(th, [
        slide(th, 'title', { title: 'Project status update', sub: 'Week of 4 November' }),
        slide(th, 'content', { title: 'Summary', body: ['Overall status: on track with one risk', 'Key win: design approved by stakeholders', 'Decision needed: extra QA budget'] }),
        slide(th, 'titleOnly', { title: 'Workstreams' }, [tbl]),
        slide(th, 'titleOnly', { title: 'Progress' }, [newChart('line', { x: 64, y: 140, w: 832, h: 350, chart: { type: 'line', title: '', legend: 'bottom', labels: false, colors: ['@a1', '@a2'] }, data: { cats: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'], series: [{ name: 'Planned', values: [5, 15, 30, 50, 70, 90] }, { name: 'Actual', values: [4, 12, 28, 41, 58, null] }] } })]),
        slide(th, 'two', { title: 'Risks and next steps', body: ['Build estimate is tight', 'Vendor API changes pending'], body2: ['Lock scope by Friday', 'Book QA contractors', 'Weekly check-in with sponsor'] }),
      ]);
    },
  },
  {
    name: 'Lesson plan', title: 'Lesson',
    make: () => {
      const th = themeById('paper');
      return deck(th, [
        slide(th, 'title', { title: 'Lesson title', sub: 'Subject - Grade - Date' }),
        slide(th, 'content', { title: 'Learning objectives', body: ['By the end of this lesson you will be able to…', 'Explain the main idea in your own words', 'Apply it to a new example'] }),
        slide(th, 'two', { title: 'Key ideas', body: ['Concept one', 'Definition and example'], body2: ['Concept two', 'Definition and example'] }),
        slide(th, 'caption', { title: 'Think about it: what would happen if…?' }),
        slide(th, 'content', { title: 'Practice', body: ['Work in pairs for 10 minutes', 'Question 1', 'Question 2', 'Question 3'] }),
        slide(th, 'section', { title: 'Exit ticket', sub: 'One thing you learned. One question you still have.' }),
      ], { num: true, text: '' });
    },
  },
  {
    name: 'Quarterly review', title: 'Quarterly review',
    make: () => {
      const th = themeById('ocean');
      return deck(th, [
        slide(th, 'title', { title: 'Q3 business review', sub: 'Highlights, numbers and priorities for Q4' }),
        slide(th, 'titleOnly', { title: 'Q3 at a glance' }, [...stat(60, 170, '$4.2M', 'revenue', '@a1'), ...stat(350, 170, '+18%', 'vs last quarter', '@a2'), ...stat(640, 170, '94%', 'customer retention', '@a3')]),
        slide(th, 'titleOnly', { title: 'Revenue by region' }, [newChart('pie', { x: 160, y: 130, w: 640, h: 370, chart: { type: 'doughnut', title: '', legend: 'right', labels: true, colors: ['@a1', '@a2', '@a3', '@a4'] }, data: { cats: ['Americas', 'EMEA', 'APAC', 'Other'], series: [{ name: 'Revenue', values: [48, 27, 19, 6] }] } })]),
        slide(th, 'compare', { title: 'What worked / what to fix', head1: 'Wins', body: ['Enterprise pipeline up 30%', 'Support response time halved'], head2: 'Gaps', body2: ['Churn in the SMB segment', 'Onboarding takes too long'] }),
        slide(th, 'content', { title: 'Q4 priorities', body: ['Launch the new pricing tiers', 'Cut onboarding time to 5 days', 'Open the APAC office'] }),
      ]);
    },
  },
  ...['dark', 'sunset', 'mono', 'pastel', 'navy'].map((id) => ({
    name: `Blank - ${themeById(id).name}`, title: 'Untitled presentation',
    make: () => { const th = themeById(id); const s = newSlide('title', th); s.els[0].paras = P('Presentation title'); s.els[1].paras = P('Subtitle or your name'); return deck(th, [s], { num: false, text: '' }); },
  })),
];
void THEMES; void newShape; void newLine;
