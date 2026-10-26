import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, MenuRows, Modal, useToast, useAsk, useContextMenu } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { downloadFile, pickFiles, readAsText, readAsDataURL, safeName } from '../lib/download.js';
import { uid, render, titleOf, stats, headings, previewDoc, exportHtml, THEMES, TEMPLATES } from './writer/engine.js';
import '../styles/writer.css';

const mkDoc = (md = '', title) => ({ id: uid(), md, created: Date.now(), updated: Date.now(), pin: false, title: title || null });
const blank = () => { const d = mkDoc(TEMPLATES[5][1]); return { docs: [d], cur: d.id, ui: { view: 'split', theme: 'clean', size: 16, font: 14, wrap: true, list: true, outline: false, focus: false, sync: true } }; };
const migrate = (d) => (d && Array.isArray(d.docs) && d.docs.length ? { ...blank(), ...d, ui: { ...blank().ui, ...(d.ui || {}) } } : blank());
const dTitle = (d) => d.title || titleOf(d.md);
const fmtD = (t) => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

function T({ icon, label, onClick, kbd, text, on }) { return <button className={'fb ico sub wr-t' + (on ? ' on' : '')} aria-label={label} title={label + (kbd ? ` (${kbd})` : '')} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{icon ? <Icon name={icon} size={16} /> : <b>{text}</b>}</button>; }
export default function WriterApp() {
  const [data, setData, meta] = useStore('writer', blank, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const { ui } = data; const setUi = (p) => setData((d) => ({ ...d, ui: { ...d.ui, ...p } }));
  const doc = data.docs.find((d) => d.id === data.cur) || data.docs[0];
  const ta = useRef(null); const frame = useRef(null); const [dlg, setDlg] = useState(null); const [q, setQ] = useState(''); const [sel, setSel] = useState({ s: 0, e: 0 }); const [fq, setFq] = useState(''); const [fr, setFr] = useState(''); const [fcase, setFcase] = useState(false); const [tb, setTb] = useState({ r: 3, c: 3 });
  const [mdDebounced, setMdDebounced] = useState(doc.md);
  useEffect(() => { const t = setTimeout(() => setMdDebounced(doc.md), 120); return () => clearTimeout(t); }, [doc.md, doc.id]);
  const st = useMemo(() => stats(doc.md), [doc.md]); const heads = useMemo(() => headings(doc.md), [doc.md]);
  const srcDoc = useMemo(() => previewDoc(mdDebounced, ui.theme, ui.size), [mdDebounced, ui.theme, ui.size]);

  const upDoc = useCallback((p) => setData((d) => ({ ...d, docs: d.docs.map((x) => (x.id === d.cur ? { ...x, ...p, updated: Date.now() } : x)) })), [setData]);
  const setMd = (v) => upDoc({ md: v });

  /* text editing helpers: use execCommand so native undo/redo keeps working */
  const replace = (start, end, text, selS, selE) => { const t = ta.current; if (!t) return; t.focus(); t.setSelectionRange(start, end); let ok = false; try { ok = document.execCommand('insertText', false, text); } catch { ok = false; } if (!ok) { t.setRangeText(text, start, end, 'end'); setMd(t.value); } const a = selS ?? start + text.length, b = selE ?? selS ?? start + text.length; t.setSelectionRange(a, b); setSel({ s: a, e: b }); };
  const val = () => ta.current.value; const range = () => [ta.current.selectionStart, ta.current.selectionEnd];
  const wrap = (a, b = a, ph = 'text') => { const v = val(); const [s, e] = range(); const mid = v.slice(s, e); if (mid && v.slice(s - a.length, s) === a && v.slice(e, e + b.length) === b) { replace(s - a.length, e + b.length, mid, s - a.length, s - a.length + mid.length); return; } const t = mid || ph; replace(s, e, a + t + b, s + a.length, s + a.length + t.length); };
  const lineRange = () => { const v = val(); const [s, e] = range(); const ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', e); if (le < 0) le = v.length; if (e > s && v[e - 1] === '\n') le = e - 1; return [ls, le]; };
  const prefix = (kind) => { const v = val(); const [ls, le] = lineRange(); const lines = v.slice(ls, le).split('\n'); let n = 1; const strip = (l) => l.replace(/^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/, '$1'); const has = lines.every((l) => (kind === 'ul' ? /^\s*[-*+]\s+(?!\[)/.test(l) : kind === 'ol' ? /^\s*\d+[.)]\s/.test(l) : kind === 'task' ? /^\s*[-*+]\s+\[[ xX]\]\s/.test(l) : kind === 'quote' ? /^\s*>/.test(l) : new RegExp('^#{' + kind.length + '}\\s').test(l) && !new RegExp('^#{' + (kind.length + 1) + '}').test(l)));
    const out = lines.map((l) => { if (has) return strip(l); const base = strip(l); return kind === 'ul' ? '- ' + base : kind === 'ol' ? (n++) + '. ' + base : kind === 'task' ? '- [ ] ' + base : kind === 'quote' ? '> ' + base : kind + ' ' + base; }).join('\n'); replace(ls, le, out, ls, ls + out.length); };
  const link = () => { const v = val(); const [s, e] = range(); const t = v.slice(s, e) || 'link text'; if (/^https?:\/\//.test(t)) { replace(s, e, `[link text](${t})`, s + 1, s + 10); return; } const out = `[${t}](https://)`; replace(s, e, out, s + t.length + 3, s + t.length + 11); };
  const codeBlock = () => { const v = val(); const [s, e] = range(); const mid = v.slice(s, e); if (mid.includes('\n') || !mid) { const t = mid || 'code'; replace(s, e, '```\n' + t + '\n```', s + 4, s + 4 + t.length); } else wrap('`', '`', 'code'); };
  const insert = (text, selS, selE) => { const [s, e] = range(); const v = val(); const pre = s > 0 && v[s - 1] !== '\n' ? '\n\n' : ''; replace(s, e, pre + text, selS != null ? s + pre.length + selS : undefined, selE != null ? s + pre.length + selE : undefined); };
  const insertTable = () => { const { r, c } = tb; const head = '| ' + Array.from({ length: c }, (_, i) => 'Column ' + (i + 1)).join(' | ') + ' |'; const sep = '| ' + Array.from({ length: c }, () => '---').join(' | ') + ' |'; const rows = Array.from({ length: r }, () => '| ' + Array.from({ length: c }, () => '   ').join(' | ') + ' |'); insert([head, sep, ...rows].join('\n') + '\n'); setDlg(null); };
  const insertImage = async (files) => { const imgs = [...files].filter((f) => /^image\//.test(f.type)); if (!imgs.length) return false; for (const f of imgs) { if (f.size > 1.5 * 1048576) { toast(`${f.name} is large (${(f.size / 1048576).toFixed(1)} MB). Embedding big images makes the document heavy.`); } const url = await readAsDataURL(f); const [s, e] = range(); replace(s, e, `![${f.name.replace(/\.[^.]+$/, '')}](${url})\n`); } return true; };

  const onKey = (e) => {
    const mod = e.ctrlKey || e.metaKey; const t = e.target;
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**'); } else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*'); } else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); link(); } else if (mod && e.key === '`') { e.preventDefault(); wrap('`', '`', 'code'); } else if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); wrap('~~'); }
    else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); setDlg('find'); } else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); toast('Saved in this browser'); }
    else if (e.key === 'Tab') { e.preventDefault(); const [ls, le] = lineRange(); const v = val(); const [s, en] = range(); if (s === en && !e.shiftKey) { replace(s, en, '  '); return; } const seg = v.slice(ls, le); const out = e.shiftKey ? seg.replace(/^( {1,2}|\t)/gm, '') : seg.replace(/^/gm, '  '); replace(ls, le, out, ls, ls + out.length); }
    else if (e.key === 'Enter' && !mod && !e.shiftKey) { const v = t.value; const [s, en] = [t.selectionStart, t.selectionEnd]; if (s !== en) return; const ls = v.lastIndexOf('\n', s - 1) + 1; const line = v.slice(ls, s); const m = /^(\s*)([-*+]|\d+[.)])(\s+\[[ xX]\])?\s+(.*)$/.exec(line) || /^(\s*)(>)()\s?(.*)$/.exec(line); if (!m) return; e.preventDefault(); if (!m[4].trim() && !(m[3] && false)) { replace(ls, s, '', ls); return; } let mk = m[2]; if (/\d/.test(mk)) mk = parseInt(mk, 10) + 1 + mk.replace(/\d+/, ''); replace(s, s, '\n' + m[1] + mk + (m[2] === '>' ? ' ' : (m[3] ? ' [ ] ' : ' '))); }
  };
  const onPaste = async (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.some((f) => /^image\//.test(f.type))) { e.preventDefault(); await insertImage(fs); return; } const txt = e.clipboardData?.getData('text'); const [s, en] = range(); if (txt && /^https?:\/\/\S+$/.test(txt.trim()) && s !== en) { e.preventDefault(); const sel2 = val().slice(s, en); replace(s, en, `[${sel2}](${txt.trim()})`); } };
  const onDrop = async (e) => { if ([...e.dataTransfer.files].some((f) => /^image\//.test(f.type))) { e.preventDefault(); await insertImage(e.dataTransfer.files); } else if (e.dataTransfer.files.length) { e.preventDefault(); const f = e.dataTransfer.files[0]; if (/\.(md|markdown|txt)$/i.test(f.name)) { const t = await readAsText(f); newDoc(t, f.name.replace(/\.[^.]+$/, '')); } } };

  /* scroll sync */
  const syncing = useRef(null);
  const onEditorScroll = () => { if (!ui.sync || ui.view !== 'split' || syncing.current === 'p') return; const t = ta.current, f = frame.current; if (!t || !f || !f.contentDocument) return; const d = f.contentDocument.documentElement; const r = t.scrollTop / Math.max(1, t.scrollHeight - t.clientHeight); syncing.current = 'e'; d.scrollTop = r * (d.scrollHeight - d.clientHeight); setTimeout(() => { syncing.current = null; }, 60); };
  const bindFrame = () => { const f = frame.current; if (!f || !f.contentDocument) return; f.contentDocument.addEventListener('scroll', () => { if (!ui.sync || ui.view !== 'split' || syncing.current === 'e') return; const d = f.contentDocument.documentElement; const r = d.scrollTop / Math.max(1, d.scrollHeight - d.clientHeight); syncing.current = 'p'; ta.current.scrollTop = r * (ta.current.scrollHeight - ta.current.clientHeight); setTimeout(() => { syncing.current = null; }, 60); }); f.contentDocument.addEventListener('click', (ev) => { const a = ev.target.closest && ev.target.closest('a'); if (a && a.getAttribute('href') && !a.getAttribute('href').startsWith('#')) { ev.preventDefault(); window.open(a.href, '_blank', 'noopener'); } }); };
  const goHeading = (h) => { const t = ta.current; if (!t) return; const lines = t.value.split('\n'); let pos = 0; for (let i = 0; i < h.line; i++) pos += lines[i].length + 1; t.focus(); t.setSelectionRange(pos, pos + lines[h.line].length); const lh = parseFloat(getComputedStyle(t).lineHeight) || 22; t.scrollTop = Math.max(0, h.line * lh - 60); const f = frame.current; if (f && f.contentDocument) { const idx = heads.indexOf(h); const el = f.contentDocument.querySelectorAll('h1,h2,h3,h4,h5,h6')[idx]; if (el) el.scrollIntoView({ block: 'start' }); } };

  /* documents */
  const newDoc = (md = '', title) => { const d = mkDoc(md, title); setData((x) => ({ ...x, docs: [d, ...x.docs], cur: d.id })); setTimeout(() => ta.current && ta.current.focus(), 50); };
  const delDoc = async (d) => { if (!(await ask({ kind: 'confirm', title: 'Delete document', message: `Delete "${dTitle(d)}"?`, okText: 'Delete', danger: true }))) return; setData((x) => { const rest = x.docs.filter((y) => y.id !== d.id); if (!rest.length) { const n = mkDoc(''); return { ...x, docs: [n], cur: n.id }; } return { ...x, docs: rest, cur: x.cur === d.id ? rest[0].id : x.cur }; }); };
  const dupDoc = (d) => { const c = { ...d, id: uid(), title: d.title ? d.title + ' (copy)' : null, md: d.title ? d.md : d.md, created: Date.now(), updated: Date.now() }; setData((x) => ({ ...x, docs: [c, ...x.docs], cur: c.id })); };
  const renameDoc = async (d) => { const n = await ask({ kind: 'prompt', title: 'Rename document', message: 'Leave empty to use the first heading as the name.', value: d.title || '', okText: 'Rename' }); if (n != null) setData((x) => ({ ...x, docs: x.docs.map((y) => (y.id === d.id ? { ...y, title: n.trim() || null } : y)) })); };
  const docMenu = (e, d) => showCtx(e, [{ label: 'Rename…', onClick: () => renameDoc(d) }, { label: d.pin ? 'Unpin' : 'Pin to top', onClick: () => setData((x) => ({ ...x, docs: x.docs.map((y) => (y.id === d.id ? { ...y, pin: !y.pin } : y)) })) }, { label: 'Duplicate', onClick: () => dupDoc(d) }, { label: 'Download .md', onClick: () => downloadFile(safeName(dTitle(d)) + '.md', d.md, 'text/markdown') }, { sep: true }, { label: 'Delete…', onClick: () => delDoc(d) }]);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); let l = data.docs; if (s) l = l.filter((d) => (dTitle(d) + ' ' + d.md).toLowerCase().includes(s)); return [...l].sort((a, b) => (b.pin - a.pin) || (b.updated - a.updated)); }, [data.docs, q]);
  const importFiles = async () => { const fs = await pickFiles('.md,.markdown,.txt,text/markdown,text/plain'); if (!fs.length) return; for (const f of fs) { const t = await readAsText(f); newDoc(t, f.name.replace(/\.[^.]+$/, '')); } toast(`Imported ${fs.length} file${fs.length > 1 ? 's' : ''}`); };

  /* export */
  const name = safeName(dTitle(doc));
  const exportMd = () => downloadFile(name + '.md', doc.md, 'text/markdown');
  const exportHtmlF = () => downloadFile(name + '.html', exportHtml(doc.md, ui.theme === 'dark' ? 'dark' : ui.theme, dTitle(doc)), 'text/html');
  const printPdf = () => { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; f.srcdoc = previewDoc(doc.md, ui.theme === 'dark' ? 'clean' : ui.theme, ui.size).replace('<title>', '<title>') ; document.body.appendChild(f); f.onload = () => { setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { toast('Printing is not available here'); } setTimeout(() => f.remove(), 2000); }, 300); }; };
  const copyHtml = async () => { const html = render(doc.md); try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([doc.md], { type: 'text/plain' }) })]); toast('Copied as formatted text'); } catch { try { await navigator.clipboard.writeText(html); toast('Copied the HTML code'); } catch { toast('Copy was blocked by the browser'); } } };

  /* find / replace */
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const fre = () => new RegExp(escRe(fq), fcase ? 'g' : 'gi'); const count = fq ? (doc.md.match(fre()) || []).length : 0;
  const findNext = () => { const t = ta.current; if (!t || !fq) return; const hay = fcase ? t.value : t.value.toLowerCase(); const nd = fcase ? fq : fq.toLowerCase(); let i = hay.indexOf(nd, t.selectionEnd); if (i < 0) i = hay.indexOf(nd); if (i < 0) { toast('No matches'); return; } t.focus(); t.setSelectionRange(i, i + fq.length); const lh = parseFloat(getComputedStyle(t).lineHeight) || 22; t.scrollTop = Math.max(0, (t.value.slice(0, i).split('\n').length - 4) * lh); };
  const replaceAll = () => { if (!fq) return; setMd(doc.md.replace(fre(), () => fr)); toast(`Replaced ${count} match${count === 1 ? '' : 'es'}`); };
  useEffect(() => { const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !dlg) { e.preventDefault(); setDlg('find'); } if (e.key === 'Escape' && ui.focus) setUi({ focus: false }); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  const selWords = sel.e > sel.s ? (doc.md.slice(sel.s, sel.e).match(/[\p{L}\p{N}]+/gu) || []).length : 0;
  const show = ui.view;

  return (
    <div className={'fx wr' + (ui.focus ? ' focus' : '')} style={{ '--brand': '#2f3b49', '--brand-h': '#1f2832', '--brand-soft': '#e6eaf0' }} data-app="writer">
      {!ui.focus && <AppBar id="writer" name="Techomato Writer" status={meta.status === 'error' ? 'error' : undefined} right={<span className="wr-save">{meta.status === 'saving' ? 'Saving…' : meta.status === 'error' ? 'Not saved' : 'Saved'}</span>}
        backup={{ name: 'writer', get: () => data, set: (d) => meta.replace(migrate(d)), blank }} extraMenu={[{ label: 'Import Markdown files…', onClick: importFiles }, { label: 'Keyboard shortcuts', onClick: () => setDlg('keys') }]} />}
      <div className="wr-top" role="toolbar" aria-label="Formatting">
        <button className={'fb sub ico' + (ui.list ? ' on' : '')} aria-label="Documents" aria-pressed={ui.list} title="Documents" onClick={() => setUi({ list: !ui.list })}><Icon name="list" size={16} /></button>
        <span className="wr-vs" />
        <Pop trigger={({ toggle }) => <button className="fb sub wr-h" onMouseDown={(e) => e.preventDefault()} onClick={toggle} aria-label="Heading">Heading <Icon name="chevronDown" size={11} /></button>}>{({ close }) => <MenuRows close={close} items={[['#', 'Heading 1'], ['##', 'Heading 2'], ['###', 'Heading 3'], ['####', 'Heading 4']].map(([k, l]) => ({ label: l, onClick: () => prefix(k) }))} />}</Pop>
        <T text="B" label="Bold" kbd="Ctrl+B" onClick={() => wrap('**')} /><T text={<i>I</i>} label="Italic" kbd="Ctrl+I" onClick={() => wrap('*')} /><T text={<s>S</s>} label="Strikethrough" kbd="Ctrl+Shift+X" onClick={() => wrap('~~')} /><T text="</>" label="Code" kbd="Ctrl+`" onClick={codeBlock} />
        <span className="wr-vs" />
        <T icon="list" label="Bulleted list" onClick={() => prefix('ul')} /><T text="1." label="Numbered list" onClick={() => prefix('ol')} /><T icon="checkbox" label="Task list" onClick={() => prefix('task')} /><T text="❝" label="Quote" onClick={() => prefix('quote')} />
        <span className="wr-vs" />
        <T text="🔗" label="Link" kbd="Ctrl+K" onClick={link} /><T icon="image" label="Image from file" onClick={async () => { const fs = await pickFiles('image/*'); if (fs.length) insertImage(fs); }} /><T icon="rows" label="Table" onClick={() => setDlg('table')} /><T text="―" label="Horizontal rule" onClick={() => insert('---\n')} />
        <div className="spacer" />
        <div className="fx-seg" role="group" aria-label="View">{[['edit', 'Write'], ['split', 'Split'], ['preview', 'Preview']].map(([v, l]) => <button key={v} className={show === v ? 'on' : ''} onClick={() => setUi({ view: v })}>{l}</button>)}</div>
        <select className="fi wr-sel" aria-label="Preview style" value={ui.theme} onChange={(e) => setUi({ theme: e.target.value })}>{Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button className={'fb sub' + (ui.outline ? ' on' : '')} aria-pressed={ui.outline} onClick={() => setUi({ outline: !ui.outline })}>Outline</button>
        <button className="fb sub" aria-label="Find and replace" onClick={() => setDlg('find')}>Find</button>
        <Pop align="right" trigger={({ toggle }) => <button className="fb" onClick={toggle}><Icon name="download" size={14} /> Export</button>}>{({ close }) => <MenuRows close={close} items={[{ label: 'Markdown (.md)', onClick: exportMd }, { label: 'Web page (.html)', onClick: exportHtmlF }, { label: 'PDF (print…)', onClick: printPdf }, { sep: true }, { label: 'Copy as formatted text', onClick: copyHtml }, { label: 'Copy Markdown', onClick: () => navigator.clipboard.writeText(doc.md).then(() => toast('Copied'), () => toast('Copy was blocked')) }]} />}</Pop>
        <button className={'fb sub ico' + (ui.focus ? ' on' : '')} aria-label="Focus mode" title="Focus mode (Esc to leave)" aria-pressed={ui.focus} onClick={() => setUi({ focus: !ui.focus })}><Icon name="fullscreen" size={16} /></button>
      </div>
      <div className="wr-body">
        {ui.list && !ui.focus && (
          <aside className="wr-docs" aria-label="Documents">
            <div className="wr-dh"><input className="fi" placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} /><Pop align="right" trigger={({ toggle }) => <button className="fb pri ico" aria-label="New document" onClick={toggle}><Icon name="plus" size={16} /></button>}>{({ close }) => <MenuRows close={close} items={TEMPLATES.map(([n, md]) => ({ label: n, onClick: () => newDoc(md) }))} />}</Pop></div>
            <div className="wr-dl">{list.map((d) => <button key={d.id} className={'wr-d' + (d.id === doc.id ? ' on' : '')} onClick={() => setData((x) => ({ ...x, cur: d.id }))} onContextMenu={(e) => docMenu(e, d)}><b className="ellip">{d.pin ? '📌 ' : ''}{dTitle(d)}</b><small className="ellip">{fmtD(d.updated)} · {(d.md.replace(/[#>*_`\-\s]+/g, ' ').trim() || 'Empty').slice(0, 50)}</small></button>)}{!list.length && <div className="wr-none">No documents match.</div>}</div>
          </aside>
        )}
        {ui.outline && !ui.focus && <aside className="wr-out" aria-label="Outline"><div className="fx-head">Outline</div>{heads.length === 0 ? <div className="wr-none">Add headings with # to build an outline.</div> : heads.map((h, i) => <button key={i} className="wr-o" style={{ paddingLeft: 8 + (h.level - 1) * 12 }} onClick={() => goHeading(h)}>{h.text}</button>)}</aside>}
        {show !== 'preview' && (
          <section className="wr-pane wr-edit" aria-label="Editor">
            <textarea ref={ta} className="wr-ta" spellCheck value={doc.md} placeholder="Start writing in Markdown…" aria-label="Markdown editor" style={{ fontSize: ui.font + 'px', whiteSpace: ui.wrap ? 'pre-wrap' : 'pre' }}
              onChange={(e) => setMd(e.target.value)} onKeyDown={onKey} onPaste={onPaste} onDrop={onDrop} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onScroll={onEditorScroll} onSelect={(e) => setSel({ s: e.target.selectionStart, e: e.target.selectionEnd })} />
          </section>
        )}
        {show === 'split' && <div className="wr-gap" />}
        {show !== 'edit' && <section className="wr-pane wr-prev" aria-label="Preview"><iframe ref={frame} title="Preview" className="wr-frame" sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={bindFrame} /></section>}
      </div>
      <div className="wr-status"><span>{st.words.toLocaleString()} words</span><span>{st.chars.toLocaleString()} characters</span><span>{st.minutes} min read</span>{selWords > 0 && <span>{selWords} selected</span>}<div className="spacer" /><label className="wr-chk"><input type="checkbox" checked={ui.sync} onChange={(e) => setUi({ sync: e.target.checked })} /> Sync scroll</label><label className="wr-chk"><input type="checkbox" checked={ui.wrap} onChange={(e) => setUi({ wrap: e.target.checked })} /> Wrap</label><button className="fb sub sm" aria-label="Smaller text" onClick={() => setUi({ font: Math.max(11, ui.font - 1) })}>A−</button><button className="fb sub sm" aria-label="Larger text" onClick={() => setUi({ font: Math.min(24, ui.font + 1) })}>A+</button></div>
      {dlg === 'table' && <Modal title="Insert a table" onClose={() => setDlg(null)} width={360} footer={<><button className="fb" onClick={() => setDlg(null)}>Cancel</button><button className="fb pri" onClick={insertTable}>Insert</button></>}><div className="fx-kv"><label>Columns</label><input className="fi" type="number" min="1" max="12" value={tb.c} onChange={(e) => setTb({ ...tb, c: Math.min(12, Math.max(1, +e.target.value || 1)) })} aria-label="Columns" /><label>Rows</label><input className="fi" type="number" min="1" max="50" value={tb.r} onChange={(e) => setTb({ ...tb, r: Math.min(50, Math.max(1, +e.target.value || 1)) })} aria-label="Rows" /></div></Modal>}
      {dlg === 'find' && <Modal title="Find and replace" onClose={() => setDlg(null)} width={420} footer={<><button className="fb" onClick={replaceAll} disabled={!fq}>Replace all</button><button className="fb pri" onClick={() => { findNext(); setDlg(null); }} disabled={!fq}>Find next</button></>}><div className="fx-kv"><label>Find</label><input className="fi" autoFocus value={fq} onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { findNext(); setDlg(null); } }} aria-label="Find" /><label>Replace</label><input className="fi" value={fr} onChange={(e) => setFr(e.target.value)} aria-label="Replace with" /></div><label className="wr-chk" style={{ marginTop: 8 }}><input type="checkbox" checked={fcase} onChange={(e) => setFcase(e.target.checked)} /> Match case</label><p className="muted" style={{ marginBottom: 0 }}>{fq ? `${count} match${count === 1 ? '' : 'es'}` : 'Searches this document.'}</p></Modal>}
      {dlg === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setDlg(null)} footer={<button className="fb pri" onClick={() => setDlg(null)}>Close</button>}><div className="fx-kv">{[['Ctrl+B / I', 'Bold / italic'], ['Ctrl+Shift+X', 'Strikethrough'], ['Ctrl+K', 'Insert a link'], ['Ctrl+`', 'Inline code'], ['Tab / Shift+Tab', 'Indent / outdent lines'], ['Enter', 'Continue a list or quote'], ['Ctrl+F', 'Find and replace'], ['Ctrl+Z / Y', 'Undo / redo'], ['Paste an image', 'Embeds it in the document'], ['Select text, paste a link', 'Turns it into a link']].flatMap(([a, b]) => [<span key={a} className="wr-kbd">{a}</span>, <span key={b}>{b}</span>])}</div></Modal>}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}
