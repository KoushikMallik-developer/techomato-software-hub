// A1-style addressing helpers (0-based rows/cols internally).
export const MAX_ROWS = 1048576;
export const MAX_COLS = 16384;

const colCache = [];
export const colName = (i) => {
  if (colCache[i]) return colCache[i];
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  if (i < 2000) colCache[i] = s;
  return s;
};

export const colIndex = (s) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) & 31);
  return n - 1;
};

export const keyOf = (r, c) => colName(c) + (r + 1);

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;
export function parseCell(ref) {
  const m = CELL_RE.exec(ref);
  if (!m) return null;
  const c = colIndex(m[1].toUpperCase());
  const r = parseInt(m[2], 10) - 1;
  if (c >= MAX_COLS || r >= MAX_ROWS || r < 0) return null;
  return { r, c };
}

/* "A1", "A1:C5", "A:A", "2:4" -> {r1,c1,r2,c2} (normalised, inclusive) or null */
export function parseRange(text) {
  const t = text.trim().replace(/\$/g, '');
  let m;
  if ((m = /^([A-Za-z]{1,3})(\d+):([A-Za-z]{1,3})(\d+)$/.exec(t))) {
    const a = { r: +m[2] - 1, c: colIndex(m[1].toUpperCase()) };
    const b = { r: +m[4] - 1, c: colIndex(m[3].toUpperCase()) };
    return norm(a.r, a.c, b.r, b.c);
  }
  if ((m = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(t))) return norm(0, colIndex(m[1].toUpperCase()), MAX_ROWS - 1, colIndex(m[2].toUpperCase()));
  if ((m = /^(\d+):(\d+)$/.exec(t))) return norm(+m[1] - 1, 0, +m[2] - 1, MAX_COLS - 1);
  const c = parseCell(t);
  return c ? { r1: c.r, c1: c.c, r2: c.r, c2: c.c } : null;
}
const norm = (r1, c1, r2, c2) => ({ r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) });

export const rangeText = (g) => {
  if (!g) return '';
  if (g.r1 === g.r2 && g.c1 === g.c2) return keyOf(g.r1, g.c1);
  if (g.r1 === 0 && g.r2 >= MAX_ROWS - 1) return colName(g.c1) + ':' + colName(g.c2);
  if (g.c1 === 0 && g.c2 >= MAX_COLS - 1) return g.r1 + 1 + ':' + (g.r2 + 1);
  return keyOf(g.r1, g.c1) + ':' + keyOf(g.r2, g.c2);
};

export const inRange = (g, r, c) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
export const rangesIntersect = (a, b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
export const rangeSize = (g) => (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1);
