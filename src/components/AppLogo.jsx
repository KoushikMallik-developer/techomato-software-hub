// Rounded-square app logos (Microsoft 365 style): gradient tile + simple white glyph.
const W = { fill: 'none', stroke: '#fff', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const GLYPHS = {
  money: <><rect {...W} x="5" y="9" width="22" height="14" rx="3" /><circle {...W} cx="16" cy="16" r="3.2" /><path {...W} d="M9 13v.1M23 19v.1" /></>,
  pdf: <><path {...W} d="M10 5h9l5 5v17H10z" /><path {...W} d="M19 5v5h5" /><path {...W} d="M13 22c2-3 3.500-6 3-9 1 3 2.500 5 5 6-3 0-5 .700-8 3z" /></>,
  convert: <><rect {...W} x="5" y="6" width="22" height="20" rx="3" /><circle fill="#fff" cx="12" cy="13" r="2" /><path {...W} d="m7 23 6-6 3 3 3-4 5 7" /></>,
  mindmap: <><circle {...W} cx="16" cy="16" r="3.500" /><circle {...W} cx="6.500" cy="8" r="2" /><circle {...W} cx="26" cy="8" r="2" /><circle {...W} cx="6.500" cy="24" r="2" /><circle {...W} cx="26" cy="24" r="2" /><path {...W} d="m8 9.500 5 4M24 9.500l-5 4M8 22.500l5-4M24 22.500l-5-4" /></>,
  vault: <><rect {...W} x="6" y="14" width="20" height="13" rx="3" /><path {...W} d="M10.500 14v-3.500a5.500 5.500 0 0 1 11 0V14" /><circle fill="#fff" cx="16" cy="20.500" r="1.800" /></>,
  flow: <><rect {...W} x="11" y="5" width="10" height="6" rx="1.500" /><rect {...W} x="4.500" y="21" width="9" height="6" rx="1.500" /><rect {...W} x="18.500" y="21" width="9" height="6" rx="1.500" /><path {...W} d="M16 11v5M9 21v-5h14v5" /></>,
  photo: <><rect {...W} x="5" y="7" width="22" height="18" rx="3" /><circle fill="#fff" cx="12" cy="13" r="2" /><path {...W} d="m6 23 6-6 4 4 4-5 6 7" /></>,
  audio: <><path {...W} d="M6 16h2.5M12 10v12M16 6v20M20 11v10M24 14v4M27 16h-.5" /></>,
  video: <><rect {...W} x="4.5" y="8" width="23" height="16" rx="3" /><path {...W} d="M9 8v16M23 8v16" /><path fill="#fff" d="M14 12.5v7l6-3.5z" /></>,
  motion: <><path {...W} d="m16 5 3 7 7 1-5 5 1.5 7.5L16 22l-6.5 3.500L11 18l-5-5 7-1z" /></>,
  '3d': <><path {...W} d="m16 4 10 5.500v11L16 26 6 20.500v-11z" /><path {...W} d="M6 9.500 16 15l10-5.500M16 15v11" /></>,
};
export const APP_COLORS = {
  money: ['#1aa39b', '#0b7a75'],
  pdf: ['#e5484d', '#b3262b'], convert: ['#38b6ff', '#1a73c9'], mindmap: ['#f2a93b', '#c2740f'], vault: ['#5f6ad6', '#3a42a8'], flow: ['#3fa7d6', '#1b6f9e'],
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
