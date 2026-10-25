// Text measuring with a shared canvas (used for overflow, autofit and wrapping).
let ctx = null;
const cache = new Map();
export function measureText(text, font) {
  if (!ctx) { const c = document.createElement('canvas'); ctx = c.getContext('2d'); }
  const key = font + '|' + text;
  let w = cache.get(key);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(text).width;
    if (cache.size > 20000) cache.clear();
    cache.set(key, w);
  }
  return w;
}
export const DEFAULT_FONT_FAMILY = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';
export const fontString = (st, zoom = 1) => `${st.i ? 'italic ' : ''}${st.b ? 'bold ' : ''}${((st.fs || 11) * 96 / 72) * zoom}px ${st.ff ? `"${st.ff}", ` : ''}${DEFAULT_FONT_FAMILY}`;

/* number of wrapped lines for text in width */
export function wrapLines(text, font, width) {
  let lines = 0;
  String(text).split('\n').forEach((para) => {
    if (para === '') { lines++; return; }
    let cur = ''; lines++;
    para.split(/(\s+)/).forEach((tok) => {
      const next = cur + tok;
      if (cur && measureText(next.trimEnd(), font) > width) { lines++; cur = tok.trimStart(); } else cur = next;
    });
  });
  return lines;
}
