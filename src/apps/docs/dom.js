// DOM helpers for the Docs editor (no React in here).

/* ---------- Sanitising pasted / imported HTML ---------- */
const ALLOWED_TAGS = new Set(
  'p br span b strong i em u s strike del ins sub sup a img h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tfoot tr td th colgroup col caption blockquote pre code hr mark small abbr cite'.split(' ')
);
const DROP_TAGS = new Set('script style meta link iframe object embed noscript template svg canvas form input button select textarea title head base frame frameset'.split(' '));
const BLOCKS = new Set('p h1 h2 h3 h4 h5 h6 ul ol li table blockquote pre hr div'.split(' '));
const STYLE_OK = new Set([
  'color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align', 'font-size', 'font-family',
  'line-height', 'margin-left', 'margin-top', 'margin-bottom', 'margin-right', 'text-indent', 'width', 'height', 'vertical-align', 'border',
  'border-top', 'border-bottom', 'border-left', 'border-right', 'border-collapse', 'border-color', 'border-width', 'border-style', 'padding',
  'float', 'max-width', 'direction', 'column-count', 'display', 'list-style-type', 'text-transform',
]);
const KEEP_CLASSES = new Set(['checklist', 'doctable', 'page-break', 'doc-title', 'doc-subtitle', 'toc', 'toc-item', 'cmt', 'code-block', 'toc-title', 'toc-l1', 'toc-l2', 'toc-l3']);

const safeUrl = (u, allowData) => {
  const v = (u || '').trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(v)) return v;
  if (allowData && /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp);/i.test(v)) return v;
  return null;
};

function cleanStyle(el) {
  const out = [];
  const st = el.style;
  for (let i = 0; i < st.length; i++) {
    const p = st[i];
    if (!STYLE_OK.has(p)) continue;
    const v = st.getPropertyValue(p);
    if (/url\(|expression|javascript/i.test(v)) continue;
    if (p === 'display' && !/^(block|inline|inline-block)$/.test(v)) continue;
    out.push(`${p}:${v}`);
  }
  return out.join(';');
}

function cleanChildren(parent, doc) {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 8) { child.remove(); continue; }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) { child.remove(); continue; }

    // Google Docs wraps everything in <b style="font-weight:normal">
    if ((tag === 'b' || tag === 'strong') && /^(normal|400)$/.test(child.style.fontWeight)) {
      cleanChildren(child, doc);
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    if (tag === 'font') {
      const span = doc.createElement('span');
      const color = child.getAttribute('color');
      const face = child.getAttribute('face');
      if (color) span.style.color = color;
      if (face) span.style.fontFamily = face;
      while (child.firstChild) span.appendChild(child.firstChild);
      child.replaceWith(span);
      cleanChildren(span, doc);
      continue;
    }
    if (tag === 'div') {
      cleanChildren(child, doc);
      const hasBlock = Array.from(child.children).some((c) => BLOCKS.has(c.tagName.toLowerCase()));
      if (hasBlock) child.replaceWith(...Array.from(child.childNodes));
      else {
        const p = doc.createElement('p');
        const style = cleanStyle(child);
        if (style) p.setAttribute('style', style);
        while (child.firstChild) p.appendChild(child.firstChild);
        child.replaceWith(p);
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      cleanChildren(child, doc);
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }

    const keep = {};
    if (tag === 'a') {
      const h = safeUrl(child.getAttribute('href'));
      if (h) keep.href = h;
    }
    if (tag === 'img') {
      const s = safeUrl(child.getAttribute('src'), true);
      if (!s) { child.remove(); continue; }
      keep.src = s;
      if (child.getAttribute('alt')) keep.alt = child.getAttribute('alt');
    }
    if (tag === 'td' || tag === 'th') {
      ['colspan', 'rowspan'].forEach((a) => { if (/^\d+$/.test(child.getAttribute(a) || '')) keep[a] = child.getAttribute(a); });
    }
    if (child.getAttribute('dir') === 'rtl' || child.getAttribute('dir') === 'ltr') keep.dir = child.getAttribute('dir');
    if (/^(none|outer|rows|all)$/.test(child.getAttribute('data-borders') || '')) keep['data-borders'] = child.getAttribute('data-borders');
    if (child.hasAttribute('data-done')) keep['data-done'] = child.getAttribute('data-done');
    if (child.hasAttribute('data-cid')) keep['data-cid'] = child.getAttribute('data-cid');
    if (child.id && /^h-[\w-]+$/.test(child.id)) keep.id = child.id;
    const cls = (child.getAttribute('class') || '').split(/\s+/).filter((c) => KEEP_CLASSES.has(c));
    if (cls.length) keep.class = cls.join(' ');
    const style = cleanStyle(child);
    if (style) keep.style = style;

    for (const a of Array.from(child.attributes)) child.removeAttribute(a.name);
    Object.entries(keep).forEach(([k, v]) => child.setAttribute(k, v));
    if (tag === 'a') child.setAttribute('rel', 'noopener noreferrer');
    cleanChildren(child, doc);
  }
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  cleanChildren(doc.body, doc);
  return doc.body.innerHTML;
}

/* Whitespace between block tags would show up as blank lines in the editor */
export const tidyHtml = (html) => html.replace(/>\s*\n\s*</g, '><').replace(/^\s+|\s+$/g, '');
export function stripBlankText(root) {
  const holders = [root, ...root.querySelectorAll('ul,ol,table,tbody,thead,tr')];
  holders.forEach((h) => Array.from(h.childNodes).forEach((n) => { if (n.nodeType === 3 && !n.nodeValue.trim()) n.remove(); }));
}

export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- Blocks & selection ---------- */
export const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre';

export function blocksInRange(root, range) {
  if (!range) return [];
  const out = [];
  root.querySelectorAll(BLOCK_SEL).forEach((b) => {
    if (b.tagName !== 'LI' && b.querySelector(BLOCK_SEL)) return;
    if (range.intersectsNode(b)) out.push(b);
  });
  return out;
}

export function closestBlock(node, root) {
  let el = node && node.nodeType === 1 ? node : node && node.parentElement;
  while (el && el !== root) {
    if (/^(P|H[1-6]|LI|BLOCKQUOTE|PRE|TD|TH)$/.test(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

/* Wrap loose text directly under the editor root into paragraphs */
export function ensureBlocks(root) {
  let changed = false;
  Array.from(root.childNodes).forEach((n) => {
    const isText = n.nodeType === 3 && n.nodeValue.trim() !== '';
    const isInline = n.nodeType === 1 && !/^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|DIV)$/.test(n.tagName);
    if (isText || isInline) {
      const p = document.createElement('p');
      n.replaceWith(p);
      p.appendChild(n);
      changed = true;
    }
  });
  if (!root.firstChild) {
    root.innerHTML = '<p><br></p>';
    changed = true;
  }
  return changed;
}

/* Replace <font size=7> that execCommand produced with a real pt size */
export function convertFontTags(root, pt) {
  root.querySelectorAll('font[size="7"]').forEach((f) => {
    const span = document.createElement('span');
    span.style.fontSize = pt + 'pt';
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
  });
  root.querySelectorAll('span[style*="xxx-large"]').forEach((s) => { s.style.fontSize = pt + 'pt'; });
}

export function applyFontSize(root, pt) {
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontSize', false, '7');
  document.execCommand('styleWithCSS', false, true);
  convertFontTags(root, pt);
}

/* ---------- Tables ---------- */
export const cellOf = (node, root) => {
  const el = node && node.nodeType === 1 ? node : node && node.parentElement;
  const td = el && el.closest ? el.closest('td,th') : null;
  return td && root.contains(td) ? td : null;
};

const cellIndex = (td) => Array.from(td.parentElement.children).indexOf(td);

export function makeTableHtml(rows, cols, header = true) {
  let h = '<table class="doctable"><tbody>';
  for (let r = 0; r < rows; r++) {
    h += '<tr>';
    for (let c = 0; c < cols; c++) h += header && r === 0 ? '<th><br></th>' : '<td><br></td>';
    h += '</tr>';
  }
  return h + '</tbody></table><p><br></p>';
}

export const tableOps = {
  insertRow(td, after) {
    const tr = td.parentElement;
    const copy = tr.cloneNode(true);
    copy.querySelectorAll('td,th').forEach((c) => {
      const n = document.createElement('td');
      n.innerHTML = '<br>';
      if (c.getAttribute('colspan')) n.setAttribute('colspan', c.getAttribute('colspan'));
      if (c.style.width) n.style.width = c.style.width;
      c.replaceWith(n);
    });
    after ? tr.after(copy) : tr.before(copy);
  },
  deleteRow(td) {
    const tr = td.parentElement;
    const table = tr.closest('table');
    if (table.rows.length <= 1) table.remove();
    else tr.remove();
  },
  insertCol(td, after) {
    const idx = cellIndex(td);
    const table = td.closest('table');
    Array.from(table.rows).forEach((tr) => {
      const ref = tr.children[Math.min(idx, tr.children.length - 1)];
      if (!ref) return;
      const n = document.createElement(ref.tagName.toLowerCase());
      n.innerHTML = '<br>';
      after ? ref.after(n) : ref.before(n);
    });
  },
  deleteCol(td) {
    const idx = cellIndex(td);
    const table = td.closest('table');
    if (table.rows[0] && table.rows[0].children.length <= 1) { table.remove(); return; }
    Array.from(table.rows).forEach((tr) => tr.children[idx] && tr.children[idx].remove());
  },
  deleteTable(td) { td.closest('table').remove(); },
  mergeRight(td) {
    const next = td.nextElementSibling;
    if (!next) return false;
    const span = (parseInt(td.getAttribute('colspan') || '1', 10)) + (parseInt(next.getAttribute('colspan') || '1', 10));
    if (next.textContent.trim()) td.innerHTML = td.innerHTML.replace(/<br>$/, '') + ' ' + next.innerHTML;
    td.setAttribute('colspan', span);
    next.remove();
    return true;
  },
  mergeDown(td) {
    const tr = td.parentElement;
    const nextRow = tr.nextElementSibling;
    if (!nextRow) return false;
    const idx = cellIndex(td);
    const below = nextRow.children[idx];
    if (!below) return false;
    const rs = parseInt(td.getAttribute('rowspan') || '1', 10);
    td.setAttribute('rowspan', rs + parseInt(below.getAttribute('rowspan') || '1', 10));
    if (below.textContent.trim()) td.innerHTML = td.innerHTML.replace(/<br>$/, '') + ' ' + below.innerHTML;
    below.remove();
    return true;
  },
  split(td) {
    const cs = parseInt(td.getAttribute('colspan') || '1', 10);
    const rs = parseInt(td.getAttribute('rowspan') || '1', 10);
    if (cs > 1) {
      td.removeAttribute('colspan');
      for (let i = 1; i < cs; i++) { const n = document.createElement('td'); n.innerHTML = '<br>'; td.after(n); }
    }
    if (rs > 1) {
      td.removeAttribute('rowspan');
      const idx = cellIndex(td);
      let row = td.parentElement;
      for (let i = 1; i < rs; i++) {
        row = row && row.nextElementSibling;
        if (!row) break;
        const n = document.createElement('td');
        n.innerHTML = '<br>';
        row.insertBefore(n, row.children[idx] || null);
      }
    }
  },
  setBg(td, color) { color ? (td.style.backgroundColor = color) : td.style.removeProperty('background-color'); },
  toggleHeader(td) {
    const table = td.closest('table');
    const first = table.rows[0];
    if (!first) return;
    const isHeader = first.children[0].tagName === 'TH';
    Array.from(first.children).forEach((c) => {
      const n = document.createElement(isHeader ? 'td' : 'th');
      Array.from(c.attributes).forEach((a) => n.setAttribute(a.name, a.value));
      n.innerHTML = c.innerHTML;
      c.replaceWith(n);
    });
  },
  setBorders(td, mode) {
    const table = td.closest('table');
    table.dataset.borders = mode; // 'all' | 'none' | 'outer' | 'rows'
  },
  setVAlign(td, v) { td.style.verticalAlign = v; },
};

/* ---------- Find ---------- */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildRegExp(query, { matchCase, whole, regex }) {
  if (!query) return null;
  let src = regex ? query : escapeRegExp(query);
  if (whole) src = '\\b(?:' + src + ')\\b';
  try {
    return new RegExp(src, 'g' + (matchCase ? '' : 'i'));
  } catch {
    return null;
  }
}

export function findMatches(root, query, opts) {
  const re = buildRegExp(query, opts);
  if (!re) return [];
  const nodes = [];
  let text = '';
  let prevBlock = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const blk = closestBlock(n, root);
    if (prevBlock && blk !== prevBlock) text += '\n';
    prevBlock = blk;
    nodes.push({ n, start: text.length, end: text.length + n.nodeValue.length });
    text += n.nodeValue;
  }
  const locate = (pos, isEnd) => {
    for (const o of nodes) {
      if (isEnd ? pos > o.start && pos <= o.end : pos >= o.start && pos < o.end) return [o.n, pos - o.start];
    }
    return null;
  };
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    const a = locate(m.index, false);
    const b = locate(m.index + m[0].length, true);
    if (a && b) {
      const r = document.createRange();
      r.setStart(a[0], a[1]);
      r.setEnd(b[0], b[1]);
      out.push(r);
    }
    if (out.length > 5000) break;
  }
  return out;
}

export function setHighlights(all, current) {
  if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
  try {
    CSS.highlights.delete('find-all');
    CSS.highlights.delete('find-current');
    if (all.length) CSS.highlights.set('find-all', new Highlight(...all));
    if (current) CSS.highlights.set('find-current', new Highlight(current));
  } catch { /* ignore */ }
}

/* ---------- Outline, TOC, stats ---------- */
export function getHeadings(root) {
  return Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((el) => ({ level: Number(el.tagName[1]), text: el.textContent.trim(), el })).filter((h) => h.text);
}

export function tocHtml(root) {
  const hs = Array.from(root.querySelectorAll('h1,h2,h3')).filter((h) => h.textContent.trim());
  hs.forEach((h) => { if (!h.id) h.id = 'h-' + Math.random().toString(36).slice(2, 8); });
  if (!hs.length) return '<p><i>Add headings to your document, then insert the table of contents again.</i></p>';
  return '<p class="toc-title"><b>Contents</b></p>' + hs.map((h) => `<p class="toc-item toc-l${h.tagName[1]}"><a href="#${h.id}">${escapeHtml(h.textContent.trim())}</a></p>`).join('') + '<p><br></p>';
}

export function docStats(text) {
  const t = text.replace(/ /g, ' ');
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const chars = t.replace(/\n/g, '').length;
  const charsNoSpace = t.replace(/\s/g, '').length;
  const sentences = (t.match(/[^.!?]+[.!?]+(\s|$)/g) || []).length || (words ? 1 : 0);
  const paragraphs = t.split(/\n+/).filter((p) => p.trim()).length;
  return { words, chars, charsNoSpace, sentences, paragraphs, minutes: Math.max(words ? 1 : 0, Math.round(words / 230)) };
}

/* ---------- Markdown-style shortcuts ---------- */
export function textBeforeCaret(block, range) {
  const r = document.createRange();
  r.selectNodeContents(block);
  r.setEnd(range.startContainer, range.startOffset);
  return r;
}

/* ---------- Case conversion ---------- */
export const toTitleCase = (s) => s.toLowerCase().replace(/(^|[\s\-"'(])([a-z\u00c0-\u024f])/g, (m, a, b) => a + b.toUpperCase());
