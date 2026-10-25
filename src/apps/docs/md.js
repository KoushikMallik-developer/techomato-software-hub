// HTML <-> Markdown conversion for the Docs editor.
import { escapeHtml } from './dom.js';

/* ---------- HTML -> Markdown ---------- */
const wrap = (s, m) => {
  const lead = s.match(/^\s*/)[0];
  const trail = s.match(/\s*$/)[0];
  const core = s.trim();
  return core ? lead + m + core + m + trail : s;
};

function inline(n) {
  if (n.nodeType === 3) return n.nodeValue.replace(/ /g, ' ').replace(/\n/g, ' ');
  if (n.nodeType !== 1) return '';
  const t = n.tagName.toLowerCase();
  const inner = () => Array.from(n.childNodes).map(inline).join('');
  switch (t) {
    case 'b': case 'strong': return wrap(inner(), '**');
    case 'i': case 'em': return wrap(inner(), '*');
    case 's': case 'strike': case 'del': return wrap(inner(), '~~');
    case 'u': return `<u>${inner()}</u>`;
    case 'sup': return `<sup>${inner()}</sup>`;
    case 'sub': return `<sub>${inner()}</sub>`;
    case 'code': return '`' + n.textContent + '`';
    case 'a': return n.getAttribute('href') ? `[${inner()}](${n.getAttribute('href')})` : inner();
    case 'img': return `![${n.getAttribute('alt') || ''}](${n.getAttribute('src') || ''})`;
    case 'br': return '  \n';
    case 'span': {
      let s = inner();
      const w = n.style.fontWeight;
      if (w === 'bold' || parseInt(w, 10) >= 600) s = wrap(s, '**');
      if (n.style.fontStyle === 'italic') s = wrap(s, '*');
      return s;
    }
    default: return inner();
  }
}

const inlineChildren = (el) => Array.from(el.childNodes).filter((c) => !(c.nodeType === 1 && /^(ul|ol)$/i.test(c.tagName))).map(inline).join('').trim();

function listMd(el, depth) {
  const ordered = el.tagName.toLowerCase() === 'ol';
  const check = el.classList.contains('checklist');
  const pad = '  '.repeat(depth);
  let out = '';
  Array.from(el.children).filter((c) => c.tagName === 'LI').forEach((li, i) => {
    const mark = check ? (li.getAttribute('data-done') === 'true' ? '- [x] ' : '- [ ] ') : ordered ? `${i + 1}. ` : '- ';
    out += pad + mark + inlineChildren(li) + '\n';
    Array.from(li.children).filter((c) => /^(UL|OL)$/.test(c.tagName)).forEach((sub) => { out += listMd(sub, depth + 1); });
  });
  return out;
}

function tableMd(table) {
  const rows = Array.from(table.rows).map((tr) => Array.from(tr.cells).map((c) => inlineChildren(c).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')));
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const fix = (r) => { const x = [...r]; while (x.length < cols) x.push(''); return '| ' + x.join(' | ') + ' |'; };
  return [fix(rows[0]), '| ' + Array(cols).fill('---').join(' | ') + ' |', ...rows.slice(1).map(fix)].join('\n') + '\n\n';
}

function blocks(parent) {
  let out = '';
  Array.from(parent.childNodes).forEach((c) => {
    if (c.nodeType === 3) {
      if (c.nodeValue.trim()) out += c.nodeValue.trim() + '\n\n';
      return;
    }
    if (c.nodeType !== 1) return;
    const t = c.tagName.toLowerCase();
    if (/^h[1-6]$/.test(t)) out += '#'.repeat(Number(t[1])) + ' ' + inlineChildren(c) + '\n\n';
    else if (t === 'p') { const s = Array.from(c.childNodes).map(inline).join('').trim(); if (s) out += s + '\n\n'; }
    else if (t === 'ul' || t === 'ol') out += listMd(c, 0) + '\n';
    else if (t === 'blockquote') out += blocks(c).trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
    else if (t === 'pre') out += '```\n' + c.textContent.replace(/\n$/, '') + '\n```\n\n';
    else if (t === 'hr') out += '---\n\n';
    else if (t === 'table') out += tableMd(c);
    else if (t === 'img') out += inline(c) + '\n\n';
    else out += blocks(c);
  });
  return out;
}

export function htmlToMarkdown(root) {
  return blocks(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* ---------- Markdown -> HTML ---------- */
const esc = escapeHtml;

function inl(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img alt="${a}" src="${u}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  s = s.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (m, a, b) => `<b>${a || b}</b>`);
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>');
  s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  s = s.replace(/&lt;(u|sup|sub)&gt;(.*?)&lt;\/\1&gt;/g, '<$1>$2</$1>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function renderItems(items) {
  let out = '';
  let i = 0;
  while (i < items.length) {
    const ordered = items[i].ordered;
    const group = [];
    while (i < items.length && items[i].ordered === ordered) group.push(items[i++]);
    const check = group.some((g) => g.checked !== null);
    out += (ordered ? '<ol>' : check ? '<ul class="checklist">' : '<ul>');
    group.forEach((g) => {
      out += `<li${check ? ` data-done="${g.checked ? 'true' : 'false'}"` : ''}>${inl(g.text)}${g.children.length ? renderItems(g.children) : ''}</li>`;
    });
    out += ordered ? '</ol>' : '</ul>';
  }
  return out;
}

function parseList(lines, start) {
  const root = { indent: -1, children: [] };
  const stack = [root];
  let i = start;
  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i]);
    if (!m) break;
    const indent = m[1].replace(/\t/g, '  ').length;
    let text = m[3];
    let checked = null;
    const tm = /^\[( |x|X)\]\s+(.*)$/.exec(text);
    if (tm) { checked = tm[1] !== ' '; text = tm[2]; }
    const node = { indent, ordered: /\d/.test(m[2]), text, checked, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
    i++;
  }
  return [renderItems(root.children), i];
}

function parseBlocks(lines) {
  let i = 0;
  let out = '';
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    let m = /^```(\w*)\s*$/.exec(line);
    if (m) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) { out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`; i++; continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { out += '<hr>'; i++; continue; }
    if (/^\s{0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) buf.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      out += '<blockquote>' + parseBlocks(buf) + '</blockquote>';
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      out += '<table class="doctable"><tbody><tr>' + head.map((c) => `<th>${inl(c)}</th>`).join('') + '</tr>' +
        body.map((r) => '<tr>' + head.map((_, k) => `<td>${inl(r[k] || '')}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
      continue;
    }
    if (LIST_RE.test(line)) {
      const [html, next] = parseList(lines, i);
      out += html;
      i = next;
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|\s{0,3}>)/.test(lines[i]) && !LIST_RE.test(lines[i])) buf.push(lines[i++]);
    out += '<p>' + inl(buf.join('\n')).replace(/ {2,}\n|\n/g, '<br>') + '</p>';
  }
  return out;
}

export function markdownToHtml(md) {
  return parseBlocks(md.replace(/\r\n?/g, '\n').split('\n'));
}
