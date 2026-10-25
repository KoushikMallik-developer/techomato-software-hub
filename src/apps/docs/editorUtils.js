import { cssColorToHex } from '../../lib/office/util.js';

const hx = (c) => { const h = cssColorToHex(c); return h ? '#' + h.toLowerCase() : ''; };
import { closestBlock, escapeHtml } from './dom.js';
import { PAGE_SIZES } from './templates.js';

export const FONTS = [
  'Calibri', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Segoe UI', 'Georgia', 'Times New Roman', 'Garamond', 'Cambria', 'Palatino Linotype',
  'Courier New', 'Consolas', 'Comic Sans MS', 'Impact',
];

export const pageDims = (page) => {
  const base = page.size === 'custom' ? { w: page.cw || 8.5, h: page.ch || 11 } : PAGE_SIZES[page.size] || PAGE_SIZES.letter;
  return page.orient === 'landscape' ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
};

/* ---------- Selection <-> text offsets (survive innerHTML replacement) ---------- */
export function getOffsets(root) {
  const s = window.getSelection();
  if (!s || !s.rangeCount || !s.anchorNode || !root.contains(s.anchorNode) || !root.contains(s.focusNode)) return null;
  const off = (node, o) => {
    const r = document.createRange();
    r.selectNodeContents(root);
    r.setEnd(node, o);
    return r.toString().length;
  };
  return { a: off(s.anchorNode, s.anchorOffset), f: off(s.focusNode, s.focusOffset) };
}

export function setOffsets(root, sel) {
  if (!sel) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  let total = 0;
  while ((n = walker.nextNode())) { nodes.push([n, total]); total += n.nodeValue.length; }
  const locate = (pos) => {
    for (const [node, start] of nodes) {
      if (pos <= start + node.nodeValue.length) return [node, Math.max(0, pos - start)];
    }
    const last = nodes[nodes.length - 1];
    return last ? [last[0], last[0].nodeValue.length] : [root, 0];
  };
  const [an, ao] = locate(sel.a);
  const [fn, fo] = locate(sel.f);
  try { window.getSelection().setBaseAndExtent(an, ao, fn, fo); } catch { /* ignore */ }
}

/* Remember / restore the exact selection nodes (they survive moves done by fixDivs) */
export function saveNodes() {
  const s = window.getSelection();
  if (!s || !s.rangeCount) return null;
  return { an: s.anchorNode, ao: s.anchorOffset, fn: s.focusNode, fo: s.focusOffset };
}
export function restoreNodes(root, o) {
  if (!o || !o.an || !root.contains(o.an) || !root.contains(o.fn)) return;
  try { window.getSelection().setBaseAndExtent(o.an, o.ao, o.fn, o.fo); } catch { /* ignore */ }
}

/* Chrome leaves <div> blocks behind after Enter in some situations; make them paragraphs. */
export function fixDivs(root) {
  const divs = Array.from(root.querySelectorAll('div')).filter((d) => !d.closest('td,th') || true);
  let changed = false;
  divs.forEach((d) => {
    const hasBlock = Array.from(d.children).some((c) => /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|DIV)$/.test(c.tagName));
    if (hasBlock) { d.replaceWith(...Array.from(d.childNodes)); changed = true; return; }
    const p = document.createElement('p');
    Array.from(d.attributes).forEach((a) => p.setAttribute(a.name, a.value));
    while (d.firstChild) p.appendChild(d.firstChild);
    d.replaceWith(p);
    changed = true;
  });
  // Invalid nesting that execCommand sometimes produces: <p><ul>..</ul></p>, <h1><p>..</p></h1>
  const BLOCKY = 'ul,ol,table,blockquote,pre,hr,h1,h2,h3,h4,h5,h6,p';
  root.querySelectorAll('p').forEach((p) => {
    if (p.querySelector(BLOCKY)) { p.replaceWith(...Array.from(p.childNodes)); changed = true; }
  });
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    h.querySelectorAll('p').forEach((p) => { p.replaceWith(...Array.from(p.childNodes)); changed = true; });
  });
  return changed;
}

/* ---------- Current formatting under the caret ---------- */
const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };

export function readFormat(root) {
  const s = window.getSelection();
  if (!s || !s.rangeCount || !s.anchorNode || !root.contains(s.anchorNode)) return null;
  const el = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
  if (!el) return null;
  const cs = getComputedStyle(el);
  const block = closestBlock(s.anchorNode, root);
  let style = 'p';
  if (block) {
    const t = block.tagName;
    if (/^H[1-6]$/.test(t)) style = t.toLowerCase();
    else if (t === 'BLOCKQUOTE') style = 'quote';
    else if (t === 'PRE') style = 'code';
    else if (block.classList.contains('doc-title')) style = 'title';
    else if (block.classList.contains('doc-subtitle')) style = 'subtitle';
  }
  const list = el.closest('li') && root.contains(el.closest('li')) ? el.closest('ul,ol') : null;
  const bcs = block ? getComputedStyle(block) : cs;
  let align = bcs.textAlign;
  if (align === 'start' || align === 'left') align = bcs.direction === 'rtl' ? 'right' : 'left';
  if (align === 'end') align = 'right';
  const family = (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim();
  let bg = '';
  for (let e = el; e && e !== root; e = e.parentElement) {
    if (/^(P|H[1-6]|LI|TD|TH|TABLE|BLOCKQUOTE|PRE)$/.test(e.tagName)) break;
    const c = getComputedStyle(e).backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = hx(c); break; }
  }
  const cell = el.closest('td,th');
  const link = el.closest('a');
  return {
    bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough'), sub: q('subscript'), sup: q('superscript'),
    style, align, font: family, size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2,
    color: hx(cs.color) || '#000000', bg,
    list: list ? (list.classList.contains('checklist') ? 'check' : list.tagName === 'OL' ? 'ol' : 'ul') : '',
    inTable: !!(cell && root.contains(cell)),
    link: link && root.contains(link) ? link.getAttribute('href') || '' : null,
    rtl: bcs.direction === 'rtl',
    collapsed: s.isCollapsed,
  };
}

/* ---------- Text case ---------- */
export function transformFragmentText(html, fn) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) n.nodeValue = fn(n.nodeValue);
  return div.innerHTML;
}

/* ---------- Standalone HTML export ---------- */
export function buildHtmlDocument(title, body, page) {
  const d = pageDims(page);
  const m = page.margins;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;background:#eceff3;font-family:Calibri,Carlito,Arial,sans-serif;color:#111}
.page{box-sizing:border-box;width:${d.w}in;max-width:100%;min-height:${d.h}in;margin:24px auto;padding:${m.t}in ${m.r}in ${m.b}in ${m.l}in;background:${page.bg || '#fff'};box-shadow:0 2px 12px rgba(0,0,0,.15);font-size:11pt;line-height:1.5;${page.cols > 1 ? `column-count:${page.cols};column-gap:.5in;` : ''}}
h1{font-size:20pt}h2{font-size:16pt}h3{font-size:13pt}h1,h2,h3,h4{line-height:1.25}
img{max-width:100%}blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #bbb;color:#444}
pre{background:#f3f3f3;padding:10px;border-radius:4px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;vertical-align:top}
.doc-title{font-size:26pt;font-weight:700}.doc-subtitle{font-size:14pt;color:#666}
ul.checklist{list-style:none;padding-left:4px}ul.checklist li:before{content:"\\2610 ";}ul.checklist li[data-done=true]:before{content:"\\2611 ";}
hr.page-break{border:0;border-top:1px dashed #999;margin:2em 0}
@media print{body{background:#fff}.page{margin:0;box-shadow:none;width:auto;padding:0}@page{size:${d.w}in ${d.h}in;margin:${m.t}in ${m.r}in ${m.b}in ${m.l}in}hr.page-break{break-after:page;border:0}}
</style></head><body><div class="page">
${body}
</div></body></html>`;
}

export function plainText(root) {
  const lines = [];
  root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,tr').forEach((b) => {
    if (b.tagName === 'TR') { lines.push(Array.from(b.children).map((c) => c.textContent.trim()).join('\t')); return; }
    if (b.closest('td,th') && b.tagName !== 'TR') return;
    if (b.tagName !== 'LI' && b.querySelector('p,h1,h2,h3,li')) return;
    lines.push(b.textContent);
  });
  return lines.join('\n');
}
