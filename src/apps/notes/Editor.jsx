import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Pop, Modal, Swatches, SWATCHES, useContextMenu } from '../../components/fxui.jsx';
import { pickFile } from '../../lib/download.js';
import { sanitize, wordCount, esc } from './model.js';

const FONTS = [['Segoe UI', 'Segoe UI, system-ui, sans-serif'], ['Arial', 'Arial, sans-serif'], ['Calibri', 'Calibri, Carlito, sans-serif'], ['Georgia', 'Georgia, serif'], ['Times New Roman', '"Times New Roman", serif'], ['Courier New', '"Courier New", monospace'], ['Verdana', 'Verdana, sans-serif'], ['Trebuchet MS', '"Trebuchet MS", sans-serif'], ['Comic Sans MS', '"Comic Sans MS", cursive']];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const TAGS = [['nt-imp', '★', 'Important'], ['nt-q', '?', 'Question'], ['nt-idea', '💡', 'Idea'], ['nt-rem', '📌', 'Remember for later']];

async function compressImage(file) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  if (file.type === 'image/gif' || file.size < 150000) return url;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const max = 1600; const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL(file.type === 'image/png' && file.size < 600000 ? 'image/png' : 'image/jpeg', 0.85);
}
const blockOf = (root, node) => { let n = node; while (n && n.parentNode !== root) n = n.parentNode; return n && n.nodeType === 1 ? n : null; };
const Rb = ({ icon, label, on, onClick, children, disabled, wide }) => <button className={'nt-rb' + (on ? ' on' : '') + (wide ? ' wide' : '')} aria-label={label} title={label} aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{icon && <Icon name={icon} size={16} />}{children}</button>;

export default function PageEditor({ page, onUpdate, toast, zoom, setZoom }) {
  const ref = useRef(null); const saved = useRef(null); const timer = useRef(null); const [fmt, setFmt] = useState({}); const [selImg, setSelImg] = useState(null);
  const [ctxNode, showCtx] = useContextMenu(); const [linkDlg, setLinkDlg] = useState(null); const [find, setFind] = useState(null); const [tableGrid, setGrid] = useState([0, 0]); const [tagIn, setTagIn] = useState('');
  const pageRef = useRef(page); pageRef.current = page; const onUpd = useRef(onUpdate); onUpd.current = onUpdate;

  useEffect(() => { ref.current.innerHTML = page.html || '<div><br></div>'; setSelImg(null); }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sync = useCallback((now) => {
    const el = ref.current; if (!el) return;
    el.querySelectorAll('.nt-todo').forEach((t) => { if (!t.firstElementChild || !t.firstElementChild.classList.contains('nt-cb')) { const cb = document.createElement('span'); cb.className = 'nt-cb'; cb.contentEditable = 'false'; t.insertBefore(cb, t.firstChild); if (!t.hasAttribute('data-done') || t.dataset.fresh) t.setAttribute('data-done', '0'); } });
    const push = () => { const c = el.cloneNode(true); c.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel')); c.querySelectorAll('[class=""]').forEach((x) => x.removeAttribute('class')); let h = c.innerHTML; if (h !== pageRef.current.html) onUpd.current({ html: h }); };
    clearTimeout(timer.current); if (now) push(); else timer.current = setTimeout(push, 350);
  }, []);
  useEffect(() => () => { clearTimeout(timer.current); }, [page.id]);
  useEffect(() => { const id = page.id; return () => { const el = ref.current; if (el) { const c = el.cloneNode(true); c.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel')); onUpd.current({ html: c.innerHTML }, id); } }; }, [page.id]); // flush when leaving a page

  /* selection tracking */
  useEffect(() => {
    const h = () => {
      const s = document.getSelection(); if (!s.rangeCount || !ref.current || !ref.current.contains(s.anchorNode)) return; saved.current = s.getRangeAt(0).cloneRange();
      const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } }; const v = (c) => { try { return document.queryCommandValue(c); } catch { return ''; } };
      let size = ''; let n = s.anchorNode; if (n && n.nodeType === 3) n = n.parentNode; if (n && n.nodeType === 1) size = Math.round(parseFloat(getComputedStyle(n).fontSize)) || '';
      const blk = String(v('formatBlock')).toLowerCase().replace(/[<>]/g, '');
      const b = blockOf(ref.current, s.anchorNode);
      setFmt({ b: q('bold'), i: q('italic'), u: q('underline'), s: q('strikeThrough'), sub: q('subscript'), sup: q('superscript'), ul: q('insertUnorderedList'), ol: q('insertOrderedList'), l: q('justifyLeft'), c: q('justifyCenter'), r: q('justifyRight'), block: ['h1', 'h2', 'h3', 'blockquote', 'pre'].includes(blk) ? blk : 'div', size, font: String(v('fontName')).replace(/["']/g, '').split(',')[0].trim(), todo: !!(b && b.classList.contains('nt-todo')) });
    };
    document.addEventListener('selectionchange', h); return () => document.removeEventListener('selectionchange', h);
  }, []);
  const restore = () => { const r = saved.current; if (r) { const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); } };
  const run = (name, val, keepFocus) => { const el = ref.current; if (!keepFocus) { el.focus(); restore(); } document.execCommand('styleWithCSS', false, true); document.execCommand(name, false, val); sync(); };
  const setFontSize = (px) => { const el = ref.current; el.focus(); restore(); document.execCommand('styleWithCSS', false, false); document.execCommand('fontSize', false, '7'); el.querySelectorAll('font[size="7"]').forEach((f) => { const sp = document.createElement('span'); sp.style.fontSize = px + 'px'; while (f.firstChild) sp.appendChild(f.firstChild); f.replaceWith(sp); }); el.querySelectorAll('span[style*="font-size"] span[style*="font-size"]').forEach((s) => { s.parentNode.style.fontSize = ''; }); sync(); };
  const insertHtml = (h) => { const el = ref.current; el.focus(); restore(); document.execCommand('insertHTML', false, h); sync(); };
  const toggleTodo = () => {
    const el = ref.current; el.focus(); restore(); let s = document.getSelection(); if (!s.rangeCount) return;
    let b = blockOf(el, s.anchorNode); if (!b || b === el) { document.execCommand('formatBlock', false, 'div'); s = document.getSelection(); b = blockOf(el, s.anchorNode); }
    if (!b) return;
    if (b.classList.contains('nt-todo')) { b.classList.remove('nt-todo'); b.removeAttribute('data-done'); const cb = b.querySelector(':scope > .nt-cb'); if (cb) cb.remove(); if (!b.getAttribute('class')) b.removeAttribute('class'); }
    else { if (!/^(DIV|P)$/.test(b.tagName)) { document.execCommand('formatBlock', false, 'div'); b = blockOf(el, document.getSelection().anchorNode); } b.classList.add('nt-todo'); b.setAttribute('data-done', '0'); const cb = document.createElement('span'); cb.className = 'nt-cb'; cb.contentEditable = 'false'; b.insertBefore(cb, b.firstChild); }
    sync();
  };
  const insertTable = (r, c) => { const cell = '<td><br></td>'; insertHtml(`<table class="nt-table"><tbody>${('<tr>' + cell.repeat(c) + '</tr>').repeat(r)}</tbody></table><div><br></div>`); };
  const insertImage = async (file) => { if (!file) return; try { const url = await compressImage(file); if (url.length > 3.5e6) { toast('That picture is too large to store. Try a smaller one.'); return; } insertHtml(`<img src="${url}" alt="${esc(file.name.replace(/\.[^.]+$/, ''))}" style="width:60%">`); } catch { toast('Could not read that picture'); } };
  const openLink = () => { const s = document.getSelection(); const txt = s && saved.current ? saved.current.toString() : ''; let url = ''; const a = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('a'); if (a) url = a.getAttribute('href') || ''; setLinkDlg({ text: a ? a.textContent : txt, url, hasText: !!txt || !!a, edit: a }); };
  const applyLink = (text, url) => {
    let u = url.trim(); if (!u) return; if (!/^(https?:|mailto:|#)/i.test(u)) u = /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(u) ? 'mailto:' + u : 'https://' + u;
    const el = ref.current; el.focus(); restore();
    if (linkDlg.edit && el.contains(linkDlg.edit)) { linkDlg.edit.setAttribute('href', u); if (text) linkDlg.edit.textContent = text; sync(); }
    else if (linkDlg.hasText) { document.execCommand('createLink', false, u); el.querySelectorAll(`a[href="${CSS.escape(u)}"]`).forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; }); sync(); }
    else insertHtml(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text || u)}</a>&nbsp;`);
    setLinkDlg(null);
  };

  /* keyboard / input */
  const onKeyDown = (e) => {
    const el = ref.current; const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openLink(); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); toggleTodo(); return; }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); setFind({ q: '' }); return; }
    if (mod && e.key === '.') { e.preventDefault(); run('insertUnorderedList'); return; }
    if (mod && e.key === '/') { e.preventDefault(); run('insertOrderedList'); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); run('strikeThrough'); return; }
    if (e.key === 'Tab') { e.preventDefault(); const s = document.getSelection(); const li = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('li'); if (li) run(e.shiftKey ? 'outdent' : 'indent', undefined, true); else if (e.shiftKey) run('outdent', undefined, true); else run('indent', undefined, true); return; }
    const s = document.getSelection(); if (!s.rangeCount) return; const b = blockOf(el, s.anchorNode);
    if (e.key === 'Enter' && !e.shiftKey && b && b.classList.contains('nt-todo')) {
      const txt = b.textContent.replace(/​/g, '').trim(); if (!txt) { e.preventDefault(); toggleTodo(); return; }
      setTimeout(() => { const nb = blockOf(el, document.getSelection().anchorNode); if (nb && nb.classList.contains('nt-todo') && nb !== b) { nb.setAttribute('data-done', '0'); if (!nb.querySelector(':scope > .nt-cb')) { const cb = document.createElement('span'); cb.className = 'nt-cb'; cb.contentEditable = 'false'; nb.insertBefore(cb, nb.firstChild); } } sync(); }, 0);
    }
    if (e.key === ' ' && b && s.isCollapsed && s.anchorNode.nodeType === 3) {
      const r = document.createRange(); r.setStart(b, 0); r.setEnd(s.anchorNode, s.anchorOffset); const t = r.toString();
      const map = { '#': () => run('formatBlock', 'h1', true), '##': () => run('formatBlock', 'h2', true), '###': () => run('formatBlock', 'h3', true), '-': () => run('insertUnorderedList', undefined, true), '*': () => run('insertUnorderedList', undefined, true), '1.': () => run('insertOrderedList', undefined, true), '>': () => run('formatBlock', 'blockquote', true), '[]': () => toggleTodo(), '[ ]': () => toggleTodo() };
      if (map[t] && b.tagName !== 'LI' && !b.classList.contains('nt-todo')) { e.preventDefault(); r.deleteContents(); map[t](); }
    }
  };
  const onPaste = async (e) => {
    const cd = e.clipboardData; if (!cd) return;
    const img = [...(cd.files || [])].find((f) => f.type.startsWith('image/')); if (img) { e.preventDefault(); insertImage(img); return; }
    const html = cd.getData('text/html'); e.preventDefault();
    if (html && !/^\s*<meta[^>]*>\s*$/i.test(html)) { const clean = sanitize(html.replace(/<!--[\s\S]*?-->/g, '')); document.execCommand('insertHTML', false, clean); } else document.execCommand('insertText', false, cd.getData('text/plain'));
    sync();
  };
  const onDrop = (e) => { const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); insertImage(f); } };
  const onClick = (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains('nt-cb')) { const p = t.parentNode; p.setAttribute('data-done', p.getAttribute('data-done') === '1' ? '0' : '1'); sync(); return; }
    if (t.tagName === 'A' && (e.ctrlKey || e.metaKey) && t.getAttribute('href')) { e.preventDefault(); window.open(t.getAttribute('href'), '_blank', 'noopener,noreferrer'); return; }
    if (t.tagName === 'IMG') { ref.current.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel')); t.classList.add('sel'); setSelImg(t); } else { ref.current.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel')); setSelImg(null); }
  };
  const tableOps = (cell) => {
    const tr = cell.parentNode; const table = cell.closest('table'); const ci = [...tr.children].indexOf(cell);
    const mk = (tag) => { const c = document.createElement(tag); c.innerHTML = '<br>'; return c; };
    const addRow = (after) => { const nr = document.createElement('tr'); [...tr.children].forEach((c) => nr.appendChild(mk(c.tagName.toLowerCase()))); tr.parentNode.insertBefore(nr, after ? tr.nextSibling : tr); sync(); };
    const addCol = (after) => { table.querySelectorAll('tr').forEach((r) => { const ref2 = r.children[ci]; const c = mk(ref2 ? ref2.tagName.toLowerCase() : 'td'); r.insertBefore(c, after ? (ref2 ? ref2.nextSibling : null) : ref2); }); sync(); };
    return [
      { label: 'Insert row above', icon: 'arrowUp', onClick: () => addRow(false) }, { label: 'Insert row below', icon: 'arrowDown', onClick: () => addRow(true) },
      { label: 'Insert column left', icon: 'arrowLeft', onClick: () => addCol(false) }, { label: 'Insert column right', icon: 'arrowRight', onClick: () => addCol(true) }, { sep: true },
      { label: 'Delete row', icon: 'trash', onClick: () => { if (table.rows.length <= 1) table.remove(); else tr.remove(); sync(); } },
      { label: 'Delete column', icon: 'trash', onClick: () => { if (tr.children.length <= 1) table.remove(); else table.querySelectorAll('tr').forEach((r) => r.children[ci] && r.children[ci].remove()); sync(); } },
      { label: 'Delete table', icon: 'trash', danger: true, onClick: () => { table.remove(); sync(); } },
    ];
  };
  const onContext = (e) => {
    const cell = e.target.closest && e.target.closest('td,th'); const a = e.target.closest && e.target.closest('a');
    if (cell) { e.preventDefault(); showCtx(e, tableOps(cell)); }
    else if (a && a.getAttribute('href')) { e.preventDefault(); showCtx(e, [{ label: 'Open link', icon: 'link', onClick: () => window.open(a.getAttribute('href'), '_blank', 'noopener,noreferrer') }, { label: 'Edit link...', icon: 'edit', onClick: () => { const r = document.createRange(); r.selectNodeContents(a); saved.current = r; setLinkDlg({ text: a.textContent, url: a.getAttribute('href'), hasText: true, edit: a }); } }, { label: 'Remove link', icon: 'x', onClick: () => { const t = document.createTextNode(a.textContent); a.replaceWith(t); sync(); } }]); }
  };
  const doFind = (q, back) => { if (!q) return; ref.current.focus(); try { if (!window.find(q, false, back, true, false, false, false)) toast('No matches found'); } catch { /* ignore */ } };
  const stamp = (kind) => { const d = new Date(); const t = kind === 'date' ? d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : kind === 'time' ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }); insertHtml(`<span class="nt-date">${esc(t)}</span>&nbsp;`); };
  const clearFmt = () => { run('removeFormat'); run('formatBlock', 'div', true); };
  const setImgW = (w) => { if (selImg) { selImg.style.width = w; sync(); } };

  const paper = page.paper || 'none';
  const addTag = () => { const t = tagIn.trim().replace(/^#/, ''); if (t && !page.tags.includes(t)) onUpdate({ tags: [...page.tags, t] }); setTagIn(''); };
  return (
    <div className="nt-editor">
      <div className="nt-ribbon" role="toolbar" aria-label="Formatting">
        <div className="nt-rg"><Rb icon="undo" label="Undo" onClick={() => run('undo')} /><Rb icon="redo" label="Redo" onClick={() => run('redo')} /></div>
        <div className="nt-rg">
          <select className="nt-sel" style={{ width: 118 }} aria-label="Font" value={FONTS.find((f) => f[0] === fmt.font) ? fmt.font : ''} onChange={(e) => { ref.current.focus(); restore(); run('fontName', FONTS.find((f) => f[0] === e.target.value)[1], true); }}><option value="" disabled>Font</option>{FONTS.map(([n]) => <option key={n} value={n} style={{ fontFamily: n }}>{n}</option>)}</select>
          <select className="nt-sel" style={{ width: 58 }} aria-label="Font size" value={SIZES.includes(+fmt.size) ? fmt.size : ''} onChange={(e) => setFontSize(+e.target.value)}><option value="" disabled>{fmt.size || 'Size'}</option>{SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </div>
        <div className="nt-rg">
          <Rb icon="bold" label="Bold (Ctrl+B)" on={fmt.b} onClick={() => run('bold')} /><Rb icon="italic" label="Italic (Ctrl+I)" on={fmt.i} onClick={() => run('italic')} /><Rb icon="underline" label="Underline (Ctrl+U)" on={fmt.u} onClick={() => run('underline')} /><Rb icon="strike" label="Strikethrough" on={fmt.s} onClick={() => run('strikeThrough')} />
          <Rb icon="sub" label="Subscript" on={fmt.sub} onClick={() => run('subscript')} /><Rb icon="sup" label="Superscript" on={fmt.sup} onClick={() => run('superscript')} />
          <Pop trigger={({ toggle }) => <Rb icon="highlight" label="Highlight colour" onClick={toggle} />} width={214}>{({ close }) => <div style={{ padding: 8 }}><Swatches value="" colors={['#fff475', '#ccff90', '#a7ffeb', '#cbf0f8', '#d7aefb', '#fdcfe8', '#f28b82', '#fbbc04']} onChange={(c) => { run('hiliteColor', c); close(); }} /><button className="fb sub sm" style={{ marginTop: 8 }} onClick={() => { run('hiliteColor', 'transparent'); close(); }}>No colour</button></div>}</Pop>
          <Pop trigger={({ toggle }) => <Rb icon="textColor" label="Font colour" onClick={toggle} />} width={214}>{({ close }) => <div style={{ padding: 8 }}><Swatches value="" colors={['#000000', ...SWATCHES]} onChange={(c) => { run('foreColor', c); close(); }} /><button className="fb sub sm" style={{ marginTop: 8 }} onClick={() => { run('removeFormat'); close(); }}>Automatic</button></div>}</Pop>
          <Rb icon="eraser" label="Clear formatting" onClick={clearFmt} />
        </div>
        <div className="nt-rg">
          <Rb icon="listBullet" label="Bullets (Ctrl+.)" on={fmt.ul} onClick={() => run('insertUnorderedList')} /><Rb icon="listNumber" label="Numbering (Ctrl+/)" on={fmt.ol} onClick={() => run('insertOrderedList')} />
          <Rb icon="outdent" label="Decrease indent" onClick={() => run('outdent')} /><Rb icon="indent" label="Increase indent" onClick={() => run('indent')} />
          <Rb icon="alignLeft" label="Align left" on={fmt.l} onClick={() => run('justifyLeft')} /><Rb icon="alignCenter" label="Centre" on={fmt.c} onClick={() => run('justifyCenter')} /><Rb icon="alignRight" label="Align right" on={fmt.r} onClick={() => run('justifyRight')} />
        </div>
        <div className="nt-rg">
          <select className="nt-sel" style={{ width: 104 }} aria-label="Style" value={fmt.block || 'div'} onChange={(e) => { ref.current.focus(); restore(); run('formatBlock', e.target.value, true); }}><option value="div">Normal</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option><option value="pre">Code</option></select>
        </div>
        <div className="nt-rg">
          <Rb icon="checkbox" label="To Do tag (Ctrl+Enter)" on={fmt.todo} onClick={toggleTodo} />
          <Pop trigger={({ toggle }) => <Rb icon="tag" label="Tags" onClick={toggle} wide><Icon name="chevronDown" size={11} /></Rb>} width={220}>{({ close }) => <div>{TAGS.map(([c, g, n]) => <button key={c} className="fx-row" onClick={() => { insertHtml(`<span class="nt-tag ${c}" contenteditable="false">${g}</span>&nbsp;`); close(); }}><span style={{ width: 20 }}>{g}</span>{n}</button>)}</div>}</Pop>
        </div>
        <div className="nt-rg">
          <Pop trigger={({ toggle }) => <Rb icon="table" label="Insert table" onClick={toggle} wide><Icon name="chevronDown" size={11} /></Rb>} width={216}>{({ close }) => (
            <div style={{ padding: 10 }}><div className="nt-grid" onMouseLeave={() => setGrid([0, 0])}>{Array.from({ length: 64 }, (_, i) => { const r = Math.floor(i / 8) + 1; const c = (i % 8) + 1; return <i key={i} className={r <= tableGrid[0] && c <= tableGrid[1] ? 'on' : ''} onMouseEnter={() => setGrid([r, c])} onClick={() => { insertTable(r, c); close(); }} role="button" aria-label={`${r} by ${c} table`} />; })}</div><div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>{tableGrid[0] ? `${tableGrid[0]} × ${tableGrid[1]}` : 'Choose size'}</div></div>)}</Pop>
          <Rb icon="image" label="Insert picture" onClick={async () => { const f = await pickFile('image/*'); insertImage(f); }} />
          <Rb icon="link" label="Insert link (Ctrl+K)" onClick={openLink} />
          <Rb icon="hr" label="Horizontal line" onClick={() => run('insertHorizontalRule')} />
          <Rb icon="code" label="Code block" on={fmt.block === 'pre'} onClick={() => run('formatBlock', fmt.block === 'pre' ? 'div' : 'pre')} />
          <Pop trigger={({ toggle }) => <Rb icon="calendarIco" label="Date and time" onClick={toggle} wide><Icon name="chevronDown" size={11} /></Rb>} width={200}>{({ close }) => <div>{[['date', 'Date'], ['time', 'Time'], ['both', 'Date and time']].map(([k, n]) => <button key={k} className="fx-row" onClick={() => { stamp(k); close(); }}>{n}</button>)}</div>}</Pop>
        </div>
        <div className="nt-rg"><Rb icon="search" label="Find on page (Ctrl+F)" onClick={() => setFind({ q: '' })} />
          <Pop trigger={({ toggle }) => <Rb icon="layout" label="View" onClick={toggle} wide><Icon name="chevronDown" size={11} /></Rb>} width={230} align="right">{({ close }) => <div style={{ padding: 6 }}><div className="fx-head">Page paper</div>{[['none', 'Plain'], ['ruled', 'Rule lines'], ['grid', 'Grid']].map(([k, n]) => <button key={k} className="fx-row" onClick={() => { onUpdate({ paper: k }); close(); }}>{paper === k ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{n}</button>)}<div className="fx-sep" /><div className="fx-head">Zoom</div><div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px' }}><button className="fb sub ico sm" aria-label="Zoom out" onClick={() => setZoom(Math.max(70, zoom - 10))}><Icon name="minus" size={14} /></button><b style={{ minWidth: 48, textAlign: 'center' }}>{zoom}%</b><button className="fb sub ico sm" aria-label="Zoom in" onClick={() => setZoom(Math.min(220, zoom + 10))}><Icon name="plus" size={14} /></button><button className="fb sub sm" onClick={() => setZoom(100)}>Reset</button></div></div>}</Pop>
        </div>
        {selImg && <div className="nt-rg pic"><span className="muted" style={{ fontSize: 12 }}>Picture</span>{['25%', '50%', '75%', '100%'].map((w) => <button key={w} className="fb sm" onClick={() => setImgW(w)}>{w}</button>)}<button className="fb sm danger" onClick={() => { selImg.remove(); setSelImg(null); sync(); }}><Icon name="trash" size={13} />Delete</button></div>}
      </div>
      {find && (
        <div className="nt-find"><input className="fi" autoFocus placeholder="Find on this page" aria-label="Find on page" value={find.q} onChange={(e) => setFind({ q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') doFind(find.q, e.shiftKey); if (e.key === 'Escape') setFind(null); }} />
          <button className="fb sub ico sm" aria-label="Previous match" onClick={() => doFind(find.q, true)}><Icon name="chevronUp" size={15} /></button><button className="fb sub ico sm" aria-label="Next match" onClick={() => doFind(find.q, false)}><Icon name="chevronDown" size={15} /></button><button className="fb sub ico sm" aria-label="Close find" onClick={() => setFind(null)}><Icon name="x" size={15} /></button></div>
      )}
      <div className="nt-scroll">
        <div className={'nt-page paper-' + paper} style={{ zoom: zoom / 100 }}>
          <input className="nt-title" placeholder="Untitled page" aria-label="Page title" value={page.title} onChange={(e) => onUpdate({ title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ref.current.focus(); } }} />
          <div className="nt-meta">{new Date(page.created).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {new Date(page.created).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
          <div className="nt-tags">{page.tags.map((t) => <span key={t} className="fx-chip nt-tagchip">#{t}<button aria-label={`Remove tag ${t}`} onClick={() => onUpdate({ tags: page.tags.filter((x) => x !== t) })}>×</button></span>)}<input className="nt-taginput" placeholder="Add tag" aria-label="Add tag" value={tagIn} onChange={(e) => setTagIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} onBlur={addTag} maxLength={30} /></div>
          <div ref={ref} className="nt-content" contentEditable suppressContentEditableWarning spellCheck aria-label="Page content" aria-multiline="true" role="textbox" onInput={() => sync()} onKeyDown={onKeyDown} onPaste={onPaste} onDrop={onDrop} onClick={onClick} onContextMenu={onContext} onBlur={() => sync(true)} />
        </div>
      </div>
      <div className="nt-status"><span>{wordCount(page.html)} words</span><span>Edited {new Date(page.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
      {linkDlg && <LinkDialog init={linkDlg} onClose={() => setLinkDlg(null)} onOk={applyLink} />}
      {ctxNode}
    </div>
  );
}
function LinkDialog({ init, onClose, onOk }) {
  const [text, setText] = useState(init.text); const [url, setUrl] = useState(init.url);
  return (
    <Modal title={init.edit ? 'Edit link' : 'Insert link'} onClose={onClose} width={420} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" disabled={!url.trim()} onClick={() => onOk(text, url)}>{init.edit ? 'Save' : 'Insert'}</button></>}>
      <div className="fx-kv"><label>Text</label><input className="fi" value={text} aria-label="Link text" onChange={(e) => setText(e.target.value)} placeholder="Text to display" /><label>Address</label><input className="fi" autoFocus value={url} aria-label="Link address" onChange={(e) => setUrl(e.target.value)} placeholder="https://" onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) onOk(text, url); }} /></div>
    </Modal>
  );
}
