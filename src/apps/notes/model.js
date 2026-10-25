import { uid } from '../../lib/useStore.js';

export const SEC_COLORS = ['#7719aa', '#0f6cbd', '#038387', '#107c10', '#c19c00', '#ca5010', '#d13438', '#e3008c', '#5b5fc7', '#69797e'];
const NB_COLORS = ['#7719aa', '#0f6cbd', '#107c10', '#ca5010', '#d13438', '#038387'];

/* ---------- sanitising (used for paste, import and restored backups) ---------- */
const TAGS = new Set(['p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'mark']);
const CLASSES = new Set(['nt-todo', 'nt-cb', 'nt-table', 'nt-tag', 'nt-imp', 'nt-q', 'nt-idea', 'nt-rem', 'nt-date', 'on']);
const STYLE_OK = /^(color|background-color|font-size|font-family|text-align|font-weight|font-style|text-decoration|text-decoration-line|margin-left|padding-left|width|height|vertical-align|border-collapse)$/;
const clean = (v) => !/url\s*\(|expression|javascript:|@import|<|>/i.test(v);
function cleanStyle(st) { return st.split(';').map((x) => x.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); if (i < 0) return ''; const k = d.slice(0, i).trim().toLowerCase(); const v = d.slice(i + 1).trim(); return STYLE_OK.test(k) && clean(v) ? `${k}:${v}` : ''; }).filter(Boolean).join(';'); }
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const walk = (node) => {
    [...node.childNodes].forEach((ch) => {
      if (ch.nodeType === 8) { ch.remove(); return; }
      if (ch.nodeType !== 1) return;
      const tag = ch.tagName.toLowerCase();
      if (!TAGS.has(tag)) { if (['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'link', 'meta', 'svg', 'math', 'form', 'input', 'textarea', 'select', 'button'].includes(tag)) { ch.remove(); return; } walk(ch); while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch); ch.remove(); return; }
      [...ch.attributes].forEach((at) => {
        const n = at.name.toLowerCase(); const v = at.value;
        if (n === 'style') { const s = cleanStyle(v); if (s) ch.setAttribute('style', s); else ch.removeAttribute('style'); }
        else if (n === 'class') { const c = v.split(/\s+/).filter((x) => CLASSES.has(x)).join(' '); if (c) ch.setAttribute('class', c); else ch.removeAttribute('class'); }
        else if (tag === 'a' && n === 'href') { if (!/^(https?:|mailto:|#)/i.test(v.trim())) ch.removeAttribute('href'); }
        else if (tag === 'img' && n === 'src') { if (!/^(data:image\/(png|jpe?g|gif|webp);base64,|https?:)/i.test(v.trim())) ch.remove(); }
        else if (['alt', 'colspan', 'rowspan', 'width', 'height', 'title', 'data-done', 'contenteditable', 'target', 'rel', 'data-d'].includes(n)) { if (n === 'contenteditable' && v !== 'false') ch.removeAttribute(n); }
        else ch.removeAttribute(n);
      });
      if (tag === 'a') { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener noreferrer'); }
      walk(ch);
    });
  };
  walk(doc.body); return doc.body.innerHTML;
}
const BLOCK = /<\/(p|div|h[1-6]|li|tr|blockquote|pre)>|<br\s*\/?>|<hr\s*\/?>/gi;
export function htmlToText(html) { const s = (html || '').replace(BLOCK, '\n').replace(/<\/(td|th)>/gi, '\t'); const d = new DOMParser().parseFromString(s, 'text/html'); return (d.body.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function snippet(html, n = 70) { const t = htmlToText(html).replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n) + '…' : t; }
export const wordCount = (html) => { const t = htmlToText(html); return t ? t.split(/\s+/).length : 0; };

/* ---------- markdown ---------- */
export function htmlToMd(html, title) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html'); let out = title ? `# ${title}\n\n` : '';
  const inl = (n) => { let s = ''; n.childNodes.forEach((c) => { if (c.nodeType === 3) s += c.textContent.replace(/\u00a0/g, ' '); else if (c.nodeType === 1) { const t = c.tagName.toLowerCase(); const x = inl(c); if (t === 'b' || t === 'strong') s += x.trim() ? `**${x}**` : x; else if (t === 'i' || t === 'em') s += x.trim() ? `*${x}*` : x; else if (t === 's' || t === 'strike' || t === 'del') s += `~~${x}~~`; else if (t === 'code') s += `\`${x}\``; else if (t === 'a') s += c.getAttribute('href') ? `[${x}](${c.getAttribute('href')})` : x; else if (t === 'img') s += `![${c.getAttribute('alt') || 'image'}](${c.getAttribute('src') || ''})`; else if (t === 'br') s += '  \n'; else if (c.classList.contains('nt-cb')) s += ''; else s += x; } }); return s; };
  const block = (n, ind = '') => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) { if (c.textContent.trim()) out += ind + c.textContent.trim() + '\n\n'; return; }
      if (c.nodeType !== 1) return; const t = c.tagName.toLowerCase();
      if (/^h[1-6]$/.test(t)) out += `${'#'.repeat(+t[1])} ${inl(c).trim()}\n\n`;
      else if (t === 'ul' || t === 'ol') { [...c.children].forEach((li, i) => { out += `${ind}${t === 'ol' ? i + 1 + '.' : '-'} ${inl(li).replace(/\n+$/, '').split('\n')[0]}\n`; const sub = [...li.children].filter((x) => ['ul', 'ol'].includes(x.tagName.toLowerCase())); sub.forEach((s) => block({ childNodes: [s] }, ind + '  ')); }); out += '\n'; }
      else if (t === 'blockquote') out += inl(c).trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
      else if (t === 'pre') out += '```\n' + c.textContent.replace(/\n$/, '') + '\n```\n\n';
      else if (t === 'hr') out += '---\n\n';
      else if (t === 'table') { const rows = [...c.querySelectorAll('tr')].map((r) => [...r.children].map((x) => inl(x).trim().replace(/\|/g, '\\|').replace(/\n/g, ' '))); if (rows.length) { out += '| ' + rows[0].join(' | ') + ' |\n| ' + rows[0].map(() => '---').join(' | ') + ' |\n'; rows.slice(1).forEach((r) => { out += '| ' + r.join(' | ') + ' |\n'; }); out += '\n'; } }
      else if (c.classList.contains('nt-todo')) out += `${ind}- [${c.getAttribute('data-done') === '1' ? 'x' : ' '}] ${inl(c).trim()}\n`;
      else if (t === 'div' || t === 'p') { if ([...c.children].some((x) => /^(div|p|ul|ol|table|pre|h[1-6]|blockquote)$/i.test(x.tagName))) block(c, ind); else { const x = inl(c).trim(); if (x) out += x + '\n\n'; else if (!c.classList.contains('nt-todo')) out += ''; } }
      else { const x = inl(c).trim(); if (x) out += x + '\n\n'; }
    });
  };
  block(doc.body); return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
export function mdToHtml(md) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const lines = md.replace(/\r/g, '').split('\n'); let h = ''; let list = null; let code = false; let buf = [];
  const close = () => { if (list) { h += `</${list}>`; list = null; } };
  for (const l of lines) {
    if (/^```/.test(l)) { if (code) { h += `<pre>${esc(buf.join('\n'))}</pre>`; buf = []; code = false; } else { close(); code = true; } continue; }
    if (code) { buf.push(l); continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { close(); h += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(l))) { close(); h += `<div class="nt-todo" data-done="${m[1] === ' ' ? 0 : 1}"><span class="nt-cb" contenteditable="false"></span>${inline(m[2])}</div>`; }
    else if ((m = /^\s*[-*+]\s+(.*)$/.exec(l))) { if (list !== 'ul') { close(); h += '<ul>'; list = 'ul'; } h += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (list !== 'ol') { close(); h += '<ol>'; list = 'ol'; } h += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^>\s?(.*)$/.exec(l))) { close(); h += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if (/^(-{3,}|\*{3,})$/.test(l.trim())) { close(); h += '<hr>'; }
    else if (!l.trim()) close();
    else { close(); h += `<div>${inline(l)}</div>`; }
  }
  close(); if (code) h += `<pre>${esc(buf.join('\n'))}</pre>`; return h;
}
export const textToHtml = (t) => t.replace(/\r/g, '').split('\n').map((l) => `<div>${l ? esc(l) : '<br>'}</div>`).join('');

/* ---------- data ---------- */
const todo = (t, done = false) => `<div class="nt-todo" data-done="${done ? 1 : 0}"><span class="nt-cb" contenteditable="false"></span>${t}</div>`;
export const TEMPLATES = [
  { id: 'blank', name: 'Blank page', title: '', html: '<div><br></div>' },
  { id: 'meeting', name: 'Meeting notes', title: 'Meeting notes', html: `<h2>Details</h2><div><b>Date:</b> </div><div><b>Attendees:</b> </div><div><b>Agenda:</b> </div><h2>Discussion</h2><ul><li><br></li></ul><h2>Action items</h2>${todo('')}${todo('')}` },
  { id: 'todo', name: 'To-do list', title: 'To-do list', html: `<h2>Today</h2>${todo('')}${todo('')}${todo('')}<h2>This week</h2>${todo('')}${todo('')}<h2>Someday</h2>${todo('')}` },
  { id: 'journal', name: 'Daily journal', title: '', html: '<h2>Grateful for</h2><ol><li><br></li></ol><h2>What happened today</h2><div><br></div><h2>Tomorrow I will</h2>' + todo('') },
  { id: 'project', name: 'Project plan', title: 'Project plan', html: `<h2>Goal</h2><div><br></div><h2>Milestones</h2><table class="nt-table"><tbody><tr><td><b>Milestone</b></td><td><b>Owner</b></td><td><b>Due</b></td><td><b>Status</b></td></tr><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr></tbody></table><div><br></div><h2>Risks</h2><ul><li><br></li></ul>` },
  { id: 'cornell', name: 'Study notes (Cornell)', title: 'Study notes', html: `<table class="nt-table"><tbody><tr><td style="width:30%"><b>Cues / questions</b></td><td><b>Notes</b></td></tr><tr><td><br><br><br><br></td><td><br><br><br><br></td></tr></tbody></table><h3>Summary</h3><div><br></div>` },
];
export function newPage(secId, tpl = TEMPLATES[0], extra = {}) {
  const t = Date.now(); return { id: uid(), sec: secId, title: tpl.title || '', html: tpl.html, created: t, updated: t, level: 0, pin: false, tags: [], paper: 'none', ...extra };
}
export function blankData() {
  const nb = { id: uid(), name: 'My Notebook', color: NB_COLORS[0] }; const s1 = { id: uid(), nb: nb.id, name: 'Quick Notes', color: SEC_COLORS[0] }; const s2 = { id: uid(), nb: nb.id, name: 'Ideas', color: SEC_COLORS[1] };
  const welcome = newPage(s1.id, { title: 'Welcome to Techomato Notes', html: `<div>Your notes live right here in your browser. A few things to try:</div>${todo('Type <b>/</b> nothing special, but <b>Ctrl+Enter</b> turns a line into a checkbox')}${todo('Select text and use the ribbon to format it')}${todo('Insert a table, a picture or a link from the Insert group')}${todo('Right-click a page, section or table for more options')}<h2>Shortcuts</h2><ul><li><code># </code> + space makes a heading, <code>- </code> a bullet, <code>1. </code> a numbered list, <code>[] </code> a checkbox</li><li><b>Ctrl+B / I / U</b> for bold, italic and underline</li><li><b>Ctrl+K</b> inserts a link</li></ul><div>Back up your notes now and then from the <b>…</b> menu, since nothing is sent to a server.</div>` }, { tags: ['welcome'] });
  const idea = newPage(s2.id, { title: 'First idea', html: '<div><br></div>' });
  return { notebooks: [nb], sections: [s1, s2], pages: [welcome, idea], bin: [], ui: { nb: nb.id, sec: s1.id, page: welcome.id, sort: 'manual', zoom: 100, list: true } };
}
export const migrate = (v) => { const b = blankData(); const o = { ...b, ...v, ui: { ...b.ui, ...(v.ui || {}) } }; o.pages = (o.pages || []).map((p) => ({ tags: [], level: 0, paper: 'none', ...p, html: sanitize(p.html) })); return o; };
export function pageToHtmlDoc(p) { return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title || 'Untitled')}</title><style>body{font:16px/1.5 "Segoe UI",system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#222}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px 10px}img{max-width:100%}pre{background:#f3f3f3;padding:10px;border-radius:4px;white-space:pre-wrap}.nt-todo{display:flex;gap:8px}.nt-cb::before{content:"\\2610"}.nt-todo[data-done="1"] .nt-cb::before{content:"\\2611"}</style></head><body><h1>${esc(p.title || 'Untitled')}</h1>${sanitize(p.html)}</body></html>`; }
