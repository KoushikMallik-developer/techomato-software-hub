// Rounded-square app logos (Microsoft 365 style): gradient tile + simple white glyph.
const W = { fill: 'none', stroke: '#fff', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const GLYPHS = {
  docs: <><path {...W} d="M10 6h8l5 5v15H10z" /><path {...W} d="M18 6v5h5M13 16h7M13 20h7" /></>,
  sheets: <><rect {...W} x="7" y="7" width="18" height="18" rx="2" /><path {...W} d="M7 13h18M7 19h18M14 7v18" /></>,
  slides: <><rect {...W} x="6" y="8" width="20" height="14" rx="2" /><path {...W} d="M16 22v4M11 26h10" /><path fill="#fff" d="M13 12.2v5.6l5-2.8z" /></>,
  todo: <><circle {...W} cx="16" cy="16" r="9" /><path {...W} d="m12 16.2 3 3 5.5-6" /></>,
  calendar: <><rect {...W} x="6" y="8" width="20" height="18" rx="3" /><path {...W} d="M6 14h20M11 5v6M21 5v6" /><circle fill="#fff" cx="12" cy="19" r="1.4" /><circle fill="#fff" cx="16" cy="19" r="1.4" /><circle fill="#fff" cx="20" cy="19" r="1.4" /></>,
  calculator: <><rect {...W} x="8" y="5" width="16" height="22" rx="3" /><path {...W} d="M12 10h8" /><circle fill="#fff" cx="12.5" cy="16" r="1.3" /><circle fill="#fff" cx="16" cy="16" r="1.3" /><circle fill="#fff" cx="19.5" cy="16" r="1.3" /><circle fill="#fff" cx="12.5" cy="21" r="1.3" /><circle fill="#fff" cx="16" cy="21" r="1.3" /><circle fill="#fff" cx="19.5" cy="21" r="1.3" /></>,
  clock: <><circle {...W} cx="16" cy="16" r="10" /><path {...W} d="M16 10v6l4 2.5" /></>,
  notes: <><path {...W} d="M9 5h13a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H9z" /><path {...W} d="M9 5v22M13 11h7M13 15h7M13 19h4" /></>,
  paint: <><path {...W} d="M16 5c6 0 11 4 11 9 0 3-2 4-4 4h-2c-1.5 0-2 1-2 2 0 2 1 3 1 4 0 1-1 3-4 3C9 27 5 22 5 16S9 5 16 5z" /><circle fill="#fff" cx="11" cy="14" r="1.6" /><circle fill="#fff" cx="16" cy="10.5" r="1.6" /><circle fill="#fff" cx="21" cy="13" r="1.6" /></>,
  money: <><rect {...W} x="5" y="9" width="22" height="14" rx="3" /><circle {...W} cx="16" cy="16" r="3.2" /><path {...W} d="M9 13v.1M23 19v.1" /></>,
  planner: <><rect {...W} x="5" y="6" width="6.5" height="20" rx="1.8" /><rect {...W} x="13" y="6" width="6.5" height="13" rx="1.8" /><rect {...W} x="21" y="6" width="6" height="8" rx="1.8" /></>,
  forms: <><rect {...W} x="7" y="5" width="18" height="22" rx="2.5" /><path {...W} d="m11 12 1.5 1.5L15 11M18 12h4M11 19l1.5 1.5L15 18M18 19h4" /></>,
  photo: <><rect {...W} x="5" y="7" width="22" height="18" rx="3" /><circle fill="#fff" cx="12" cy="13" r="2" /><path {...W} d="m6 23 6-6 4 4 4-5 6 7" /></>,
  audio: <><path {...W} d="M6 16h2.5M12 10v12M16 6v20M20 11v10M24 14v4M27 16h-.5" /></>,
  video: <><rect {...W} x="4.5" y="8" width="23" height="16" rx="3" /><path {...W} d="M9 8v16M23 8v16" /><path fill="#fff" d="M14 12.5v7l6-3.5z" /></>,
  motion: <><path {...W} d="m16 5 3 7 7 1-5 5 1.5 7.5L16 22l-6.5 3.500L11 18l-5-5 7-1z" /></>,
  '3d': <><path {...W} d="m16 4 10 5.500v11L16 26 6 20.500v-11z" /><path {...W} d="M6 9.500 16 15l10-5.500M16 15v11" /></>,
  habits: <><path {...W} d="M16 27C9 22 6 18 6 13.5A5.5 5.5 0 0 1 16 10a5.5 5.5 0 0 1 10 3.5C26 18 23 22 16 27z" /><path {...W} d="m12 15 3 3 5-5" /></>,
};
export const APP_COLORS = {
  docs: ['#2b7cd3', '#185abd'], sheets: ['#21a366', '#107c41'], slides: ['#e8623c', '#b7472a'], todo: ['#3b8fe8', '#2564cf'],
  calendar: ['#2f9bf0', '#0f6cbd'], calculator: ['#6a7285', '#3d4457'], clock: ['#8a6be0', '#5b3fc4'], notes: ['#a64dd0', '#7719aa'],
  paint: ['#f0577f', '#d42f66'], money: ['#1aa39b', '#0b7a75'], planner: ['#4aa84a', '#2f7d32'], forms: ['#12a89a', '#00756a'], habits: ['#f59a2f', '#e0701a'],
  photo: ['#31a8ff', '#1668c7'], audio: ['#2fd1b0', '#0f8f7c'], video: ['#9a6bff', '#5a32d6'], motion: ['#f06bd0', '#a62fa0'], '3d': ['#ff9a3d', '#d4590f'],
};
export default function AppLogo({ id, size = 28, className = '' }) {
  const [a, b] = APP_COLORS[id] || ['#e5412d', '#b32d1c'];
  const g = `lg-${id}-${size}`;
  return (
    <svg className={'applogo ' + className} width={size} height={size} viewBox="0 0 32 32" role="img" aria-hidden="true" style={{ flex: 'none' }}>
      <defs><linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <rect width="32" height="32" rx="7" fill={`url(#${g})`} />
      {GLYPHS[id] || null}
    </svg>
  );
}
