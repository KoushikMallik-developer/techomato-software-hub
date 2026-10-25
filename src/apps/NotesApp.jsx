import { useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, Modal, useToast, useAsk, useContextMenu, Swatches, download } from '../components/fxui.jsx';
import { useStore, uid } from '../lib/useStore.js';
import { downloadFile, pickFile, readAsText, safeName } from '../lib/download.js';
import PageEditor from './notes/Editor.jsx';
import { SEC_COLORS, TEMPLATES, blankData, migrate, newPage, snippet, htmlToText, htmlToMd, mdToHtml, textToHtml, sanitize, pageToHtmlDoc, esc } from './notes/model.js';
import '../styles/notes.css';

const SORTS = [['manual', 'Manual order'], ['modified', 'Date modified'], ['created', 'Date created'], ['title', 'Title (A–Z)']];
const fmtD = (t) => { const d = new Date(t); const n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }); };
const hl = (text, q) => { if (!q) return text; const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return text; return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>; };

export default function NotesApp() {
  const [data, setData, meta] = useStore('notes', blankData, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const [q, setQ] = useState(''); const [scope, setScope] = useState('all'); const [filter, setFilter] = useState(''); const [modal, setModal] = useState(null); const [listOpen, setListOpen] = useState(false); const dragId = useRef(null);
  const { ui } = data; const setUi = (p) => setData((d) => ({ ...d, ui: { ...d.ui, ...p } }));

  const nb = data.notebooks.find((n) => n.id === ui.nb) || data.notebooks[0];
  const secs = data.sections.filter((s) => s.nb === (nb && nb.id));
  const sec = secs.find((s) => s.id === ui.sec) || secs[0];
  const secPages = useMemo(() => data.pages.filter((p) => sec && p.sec === sec.id), [data.pages, sec]);
  const sorted = useMemo(() => {
    let l = [...secPages]; const f = filter.trim().toLowerCase();
    if (f) l = l.filter((p) => (p.title + ' ' + htmlToText(p.html) + ' ' + p.tags.join(' ')).toLowerCase().includes(f));
    if (ui.sort === 'modified') l.sort((a, b) => b.updated - a.updated); else if (ui.sort === 'created') l.sort((a, b) => b.created - a.created); else if (ui.sort === 'title') l.sort((a, b) => (a.title || 'zzz').localeCompare(b.title || 'zzz'));
    return [...l.filter((p) => p.pin), ...l.filter((p) => !p.pin)];
  }, [secPages, ui.sort, filter]);
  const page = data.pages.find((p) => p.id === ui.page && sec && p.sec === sec.id) || sorted[0] || null;

  const updatePage = (id, patch) => setData((d) => ({ ...d, pages: d.pages.map((p) => { if (p.id !== id) return p; if (patch.html !== undefined && Object.keys(patch).length === 1 && patch.html === p.html) return p; const touched = patch.html !== undefined || patch.title !== undefined; return { ...p, ...patch, updated: touched ? Date.now() : p.updated }; }) }));
  const select = (nbId, secId, pageId) => setUi({ nb: nbId, sec: secId, page: pageId });
  const addPage = (tpl = TEMPLATES[0]) => { if (!sec) return; const p = newPage(sec.id, tpl); setData((d) => ({ ...d, pages: [...d.pages, p], ui: { ...d.ui, page: p.id } })); setListOpen(false); setTimeout(() => { const el = document.querySelector('.nt-title'); if (el) el.focus(); }, 60); };
  const delPage = (p) => { setData((d) => ({ ...d, pages: d.pages.filter((x) => x.id !== p.id), bin: [{ ...p, deleted: Date.now() }, ...d.bin].slice(0, 200) })); toast(`Deleted "${p.title || 'Untitled page'}"`, { action: { label: 'Undo', onClick: () => restore(p.id) } }); };
  const restore = (id) => setData((d) => { const p = d.bin.find((x) => x.id === id); if (!p) return d; const ok = d.sections.some((s) => s.id === p.sec); const target = ok ? p.sec : (d.sections.find((s) => s.nb === d.ui.nb) || d.sections[0]).id; const { deleted, ...rest } = p; void deleted; return { ...d, bin: d.bin.filter((x) => x.id !== id), pages: [...d.pages, { ...rest, sec: target }], ui: { ...d.ui, nb: d.sections.find((s) => s.id === target).nb, sec: target, page: p.id } }; });
  const dupPage = (p) => { const c = { ...p, id: uid(), title: (p.title || 'Untitled page') + ' (copy)', created: Date.now(), updated: Date.now(), pin: false }; setData((d) => { const i = d.pages.findIndex((x) => x.id === p.id); const pages = [...d.pages]; pages.splice(i + 1, 0, c); return { ...d, pages, ui: { ...d.ui, page: c.id } }; }); };
  const movePage = (p, secId) => setData((d) => ({ ...d, pages: d.pages.map((x) => (x.id === p.id ? { ...x, sec: secId, level: 0 } : x)), ui: { ...d.ui, sec: secId, nb: d.sections.find((s) => s.id === secId).nb, page: p.id } }));
  const reorder = (fromId, beforeId) => { if (fromId === beforeId) return; setData((d) => { const from = d.pages.find((x) => x.id === fromId); const rest = d.pages.filter((x) => x.id !== fromId); const i = rest.findIndex((x) => x.id === beforeId); rest.splice(i, 0, { ...from, sec: rest[i].sec }); return { ...d, pages: rest }; }); };

  /* export / import */
  const exportPage = (p, kind) => { const name = safeName(p.title || 'Untitled page'); if (kind === 'md') download(`${name}.md`, htmlToMd(p.html, p.title), 'text/markdown'); else if (kind === 'html') download(`${name}.html`, pageToHtmlDoc(p), 'text/html'); else download(`${name}.txt`, (p.title ? p.title + '\n\n' : '') + htmlToText(p.html), 'text/plain'); };
  const exportNotebook = async () => {
    try { const JSZip = (await import('jszip')).default; const z = new JSZip(); const root = z.folder(safeName(nb.name));
      secs.forEach((s) => { const f = root.folder(safeName(s.name)); const seen = {}; data.pages.filter((p) => p.sec === s.id).forEach((p) => { let n = safeName(p.title || 'Untitled page'); seen[n] = (seen[n] || 0) + 1; if (seen[n] > 1) n += ` (${seen[n]})`; f.file(n + '.md', htmlToMd(p.html, p.title)); }); });
      const blob = await z.generateAsync({ type: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = safeName(nb.name) + '.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast('Notebook exported as .zip of Markdown files');
    } catch { toast('Could not create the export'); }
  };
  const importFiles = async () => {
    const f = await pickFile('.md,.markdown,.txt,.html,.htm,text/plain,text/markdown,text/html'); if (!f || !sec) return;
    try {
      const txt = await readAsText(f); const ext = (f.name.split('.').pop() || '').toLowerCase(); let html; let title = f.name.replace(/\.[^.]+$/, '');
      if (ext === 'html' || ext === 'htm') { const doc = new DOMParser().parseFromString(txt, 'text/html'); const h1 = doc.querySelector('h1'); if (doc.title) title = doc.title; else if (h1) title = h1.textContent; html = sanitize(doc.body.innerHTML); }
      else if (ext === 'md' || ext === 'markdown') { const m = /^#\s+(.+)$/m.exec(txt); html = mdToHtml(m ? txt.replace(m[0], '') : txt); if (m) title = m[1].trim(); } else html = textToHtml(txt);
      const p = newPage(sec.id, { title, html: html || '<div><br></div>' }); setData((d) => ({ ...d, pages: [...d.pages, p], ui: { ...d.ui, page: p.id } })); toast(`Imported "${title}"`);
    } catch { toast('Could not import that file'); }
  };

  /* sections and notebooks */
  const addSection = async () => { const name = await ask({ kind: 'prompt', title: 'New section', placeholder: 'Section name', okText: 'Create' }); if (!name || !name.trim()) return; const s = { id: uid(), nb: nb.id, name: name.trim(), color: SEC_COLORS[secs.length % SEC_COLORS.length] }; const p = newPage(s.id); setData((d) => ({ ...d, sections: [...d.sections, s], pages: [...d.pages, p], ui: { ...d.ui, sec: s.id, page: p.id } })); };
  const secMenu = (s, e) => showCtx(e, [
    { label: 'Rename section', icon: 'edit', onClick: async () => { const n = await ask({ kind: 'prompt', title: 'Rename section', value: s.name }); if (n && n.trim()) setData((d) => ({ ...d, sections: d.sections.map((x) => (x.id === s.id ? { ...x, name: n.trim() } : x)) })); } },
    { label: 'Section colour...', icon: 'palette', onClick: () => setModal({ kind: 'color', id: s.id }) },
    { label: 'Move left', icon: 'arrowLeft', onClick: () => moveSec(s, -1) }, { label: 'Move right', icon: 'arrowRight', onClick: () => moveSec(s, 1) }, { sep: true },
    { label: 'Delete section', icon: 'trash', danger: true, onClick: async () => { const n = data.pages.filter((p) => p.sec === s.id).length; if (secs.length <= 1) return toast('A notebook needs at least one section'); if (await ask({ title: `Delete "${s.name}"?`, message: n ? `Its ${n} page${n === 1 ? '' : 's'} will move to the recycle bin.` : '', okText: 'Delete', danger: true })) setData((d) => ({ ...d, sections: d.sections.filter((x) => x.id !== s.id), pages: d.pages.filter((p) => p.sec !== s.id), bin: [...d.pages.filter((p) => p.sec === s.id).map((p) => ({ ...p, deleted: Date.now() })), ...d.bin], ui: { ...d.ui, sec: secs.find((x) => x.id !== s.id).id, page: null } })); } },
  ]);
  const moveSec = (s, dir) => setData((d) => { const all = [...d.sections]; const mine = all.filter((x) => x.nb === s.nb); const i = mine.findIndex((x) => x.id === s.id); const j = i + dir; if (j < 0 || j >= mine.length) return d; const a = all.indexOf(mine[i]); const b = all.indexOf(mine[j]); [all[a], all[b]] = [all[b], all[a]]; return { ...d, sections: all }; });
  const addNotebook = async () => { const name = await ask({ kind: 'prompt', title: 'New notebook', placeholder: 'Notebook name', okText: 'Create' }); if (!name || !name.trim()) return; const n = { id: uid(), name: name.trim(), color: SEC_COLORS[data.notebooks.length % SEC_COLORS.length] }; const s = { id: uid(), nb: n.id, name: 'New Section', color: SEC_COLORS[0] }; const p = newPage(s.id); setData((d) => ({ ...d, notebooks: [...d.notebooks, n], sections: [...d.sections, s], pages: [...d.pages, p], ui: { ...d.ui, nb: n.id, sec: s.id, page: p.id } })); };
  const pageMenu = (p, e) => showCtx(e, [
    { label: p.pin ? 'Unpin' : 'Pin to top', icon: 'pin', onClick: () => updatePage(p.id, { pin: !p.pin }) },
    { label: 'Duplicate', icon: 'copy', onClick: () => dupPage(p) },
    { label: p.level < 2 ? 'Make subpage' : 'Subpage (max level)', icon: 'indent', onClick: () => p.level < 2 && updatePage(p.id, { level: p.level + 1 }) },
    { label: 'Promote page', icon: 'outdent', onClick: () => p.level > 0 && updatePage(p.id, { level: p.level - 1 }) },
    { label: 'Move to section...', icon: 'moveTo', onClick: () => setModal({ kind: 'move', p }) }, { sep: true },
    { label: 'Export as Markdown', icon: 'download', onClick: () => exportPage(p, 'md') }, { label: 'Export as HTML', icon: 'download', onClick: () => exportPage(p, 'html') }, { label: 'Export as text', icon: 'download', onClick: () => exportPage(p, 'txt') }, { sep: true },
    { label: 'Delete page', icon: 'trash', danger: true, onClick: () => delPage(p) },
  ]);

  /* search */
  const results = useMemo(() => {
    const s = q.trim().toLowerCase(); if (!s) return [];
    const nbOf = (secId) => data.sections.find((x) => x.id === secId);
    return data.pages.filter((p) => { const sc = nbOf(p.sec); if (!sc) return false; if (scope === 'section' && (!sec || p.sec !== sec.id)) return false; if (scope === 'notebook' && sc.nb !== (nb && nb.id)) return false; const t = (p.title + ' ' + htmlToText(p.html) + ' ' + p.tags.map((x) => '#' + x).join(' ')).toLowerCase(); return t.includes(s); }).slice(0, 40).map((p) => { const sc = nbOf(p.sec); const text = htmlToText(p.html).replace(/\s+/g, ' '); const i = text.toLowerCase().indexOf(s); const snip = i < 0 ? text.slice(0, 80) : (i > 30 ? '…' : '') + text.slice(Math.max(0, i - 30), i + 70); return { p, sc, nb: data.notebooks.find((n) => n.id === sc.nb), snip }; });
  }, [q, scope, data.pages, data.sections, data.notebooks, sec, nb]);

  const binCount = data.bin.length;
  return (
    <div className="fx nts" style={{ '--brand': '#7719aa' }}>
      <AppBar id="notes" name="Techomato Notes" status={meta.status} backup={{ name: 'notes', get: () => meta.ref.current, set: (v) => setData(() => migrate(v)), blank: blankData }}
        center={<div className="nts-search"><label className="fx-search"><input type="search" placeholder="Search all notes" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} /><Icon name="search" size={15} /></label>
          {q.trim() && <div className="fx-pop nts-results"><div className="nts-scope">{[['all', 'All notebooks'], ['notebook', 'This notebook'], ['section', 'This section']].map(([k, n]) => <button key={k} className={'fx-chip' + (scope === k ? ' on' : '')} onClick={() => setScope(k)}>{n}</button>)}</div>
            {results.length === 0 ? <div className="fx-note">No results for "{q}".</div> : results.map(({ p, sc, nb: n, snip }) => <button key={p.id} className="nts-res" onClick={() => { select(sc.nb, sc.id, p.id); setQ(''); }}><b>{hl(p.title || 'Untitled page', q.trim())}</b><span className="muted">{n.name} › {sc.name}</span><span className="sn">{hl(snip, q.trim())}</span></button>)}</div>}</div>}
        right={<button className="fx-bar-btn nts-burger" aria-label="Show pages" onClick={() => setListOpen((o) => !o)}><Icon name="list" size={18} /></button>}
        extraMenu={[{ label: 'Import file (.md, .txt, .html)...', onClick: importFiles }, ...(page ? [{ label: 'Export this page (.md)', onClick: () => exportPage(page, 'md') }, { label: 'Export this page (.html)', onClick: () => exportPage(page, 'html') }, { label: 'Print this page', onClick: () => window.print() }] : []), { label: 'Export notebook (.zip of Markdown)', onClick: exportNotebook }, { sep: true }, { label: `Recycle bin${binCount ? ` (${binCount})` : ''}...`, onClick: () => setModal({ kind: 'bin' }) }]} />
      <div className="nts-tabs" role="tablist" aria-label="Sections">
        <Pop trigger={({ toggle }) => <button className="nts-nb" onClick={toggle} aria-label="Notebooks"><Icon name="note" size={17} /><b>{nb ? nb.name : 'Notebook'}</b><Icon name="chevronDown" size={13} /></button>} width={260}>{({ close }) => (
          <div>{data.notebooks.map((n) => <div key={n.id} className="nts-nbrow"><button className="fx-row" onClick={() => { const s = data.sections.find((x) => x.nb === n.id); select(n.id, s.id, null); close(); }}>{n.id === (nb && nb.id) ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}<span className="grow ellip">{n.name}</span></button>
            <button className="fb sub ico sm" aria-label={`Rename ${n.name}`} onClick={async () => { close(); const v = await ask({ kind: 'prompt', title: 'Rename notebook', value: n.name }); if (v && v.trim()) setData((d) => ({ ...d, notebooks: d.notebooks.map((x) => (x.id === n.id ? { ...x, name: v.trim() } : x)) })); }}><Icon name="edit" size={14} /></button>
            {data.notebooks.length > 1 && <button className="fb sub ico sm" aria-label={`Delete ${n.name}`} onClick={async () => { close(); const ids = data.sections.filter((s) => s.nb === n.id).map((s) => s.id); const cnt = data.pages.filter((p) => ids.includes(p.sec)).length; if (await ask({ title: `Delete notebook "${n.name}"?`, message: `${ids.length} section${ids.length === 1 ? '' : 's'} and ${cnt} page${cnt === 1 ? '' : 's'} will be removed. Pages go to the recycle bin.`, okText: 'Delete', danger: true })) setData((d) => { const rest = d.notebooks.filter((x) => x.id !== n.id); const s0 = d.sections.find((s) => s.nb === rest[0].id); return { ...d, notebooks: rest, sections: d.sections.filter((s) => s.nb !== n.id), pages: d.pages.filter((p) => !ids.includes(p.sec)), bin: [...d.pages.filter((p) => ids.includes(p.sec)).map((p) => ({ ...p, deleted: Date.now() })), ...d.bin], ui: { ...d.ui, nb: rest[0].id, sec: s0.id, page: null } }; }); }}><Icon name="trash" size={14} /></button>}</div>)}
            <div className="fx-sep" /><button className="fx-row" onClick={() => { close(); addNotebook(); }}><Icon name="plus" size={14} />New notebook</button></div>)}</Pop>
        <div className="nts-stabs">{secs.map((s) => <button key={s.id} role="tab" aria-selected={sec && s.id === sec.id} className={'nts-tab' + (sec && s.id === sec.id ? ' on' : '')} style={{ '--sc': s.color }} onClick={() => select(nb.id, s.id, null)} onContextMenu={(e) => { e.preventDefault(); secMenu(s, e); }} onDoubleClick={(e) => secMenu(s, e)}>{s.name}</button>)}
          <button className="nts-tabadd" aria-label="Add section" title="Add section" onClick={addSection}><Icon name="plus" size={15} /></button></div>
      </div>
      <div className="nts-body">
        <section className="nts-canvas" aria-label="Page">
          {page ? <PageEditor key={page.id} page={page} onUpdate={(patch, id) => updatePage(id || page.id, patch)} toast={toast} zoom={ui.zoom} setZoom={(z) => setUi({ zoom: z })} /> : (
            <div className="fx-empty nts-empty"><Icon name="note" size={44} /><h3>{sec ? 'This section has no pages' : 'No sections'}</h3><p>Create a page to start writing.</p><button className="fb pri" onClick={() => addPage()}><Icon name="plus" size={15} />Add page</button></div>)}
        </section>
        <aside className={'nts-list' + (listOpen ? ' open' : '')} aria-label="Pages">
          <div className="nts-lh">
            <div className="nts-split"><button className="fb pri" onClick={() => addPage()}><Icon name="plus" size={15} />Add page</button>
              <Pop trigger={({ toggle }) => <button className="fb pri nts-caret" aria-label="Page templates" onClick={toggle}><Icon name="chevronDown" size={13} /></button>} width={230} align="right">{({ close }) => <div><div className="fx-head">New page from template</div>{TEMPLATES.map((t) => <button key={t.id} className="fx-row" onClick={() => { addPage(t); close(); }}>{t.name}</button>)}</div>}</Pop></div>
            <Pop trigger={({ toggle }) => <button className="fb sub ico" aria-label="Sort pages" title="Sort pages" onClick={toggle}><Icon name="sortDesc" size={16} /></button>} width={190} align="right">{({ close }) => <div>{SORTS.map(([k, n]) => <button key={k} className="fx-row" onClick={() => { setUi({ sort: k }); close(); }}>{ui.sort === k ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{n}</button>)}</div>}</Pop>
          </div>
          <label className="fx-search light nts-lf"><input type="search" placeholder="Filter pages" aria-label="Filter pages" value={filter} onChange={(e) => setFilter(e.target.value)} /><Icon name="filter" size={14} /></label>
          <div className="nts-pages" role="list">
            {sorted.length === 0 && <div className="fx-note">{filter ? 'No matching pages.' : 'No pages yet.'}</div>}
            {sorted.map((p) => (
              <div key={p.id} role="listitem" className={'nts-pg' + (page && p.id === page.id ? ' on' : '')} style={{ paddingLeft: 12 + p.level * 14, '--sc': sec ? sec.color : '#7719aa' }} draggable={ui.sort === 'manual' && !filter} onDragStart={() => { dragId.current = p.id; }} onDragOver={(e) => { if (dragId.current) e.preventDefault(); }} onDrop={() => { if (dragId.current) reorder(dragId.current, p.id); dragId.current = null; }} onContextMenu={(e) => { e.preventDefault(); pageMenu(p, e); }}>
                <button className="nts-pgb" onClick={() => { setUi({ page: p.id }); setListOpen(false); }}>
                  <span className="t">{p.pin && <Icon name="pin" size={12} />}{p.title || 'Untitled page'}</span>
                  <span className="s">{fmtD(p.updated)} · {snippet(p.html, 44) || 'No content'}</span>
                </button>
                <button className="fb sub ico sm nts-pgm" aria-label={`Options for ${p.title || 'Untitled page'}`} onClick={(e) => { e.stopPropagation(); pageMenu(p, e); }}><Icon name="moreV" size={15} /></button>
              </div>))}
          </div>
        </aside>
        {listOpen && <div className="nts-scrim" onClick={() => setListOpen(false)} />}
      </div>
      {modal && modal.kind === 'color' && <Modal title="Section colour" onClose={() => setModal(null)} width={340} footer={<button className="fb pri" onClick={() => setModal(null)}>Done</button>}><Swatches value={(data.sections.find((s) => s.id === modal.id) || {}).color} colors={SEC_COLORS} onChange={(c) => setData((d) => ({ ...d, sections: d.sections.map((s) => (s.id === modal.id ? { ...s, color: c } : s)) }))} /></Modal>}
      {modal && modal.kind === 'move' && <Modal title={`Move "${modal.p.title || 'Untitled page'}"`} onClose={() => setModal(null)} width={380} footer={<button className="fb" onClick={() => setModal(null)}>Cancel</button>}>{data.notebooks.map((n) => <div key={n.id}><div className="fx-head">{n.name}</div>{data.sections.filter((s) => s.nb === n.id).map((s) => <button key={s.id} className="fx-row" onClick={() => { movePage(modal.p, s.id); setModal(null); toast(`Moved to ${s.name}`); }}><i className="nts-sdot" style={{ background: s.color }} />{s.name}</button>)}</div>)}</Modal>}
      {modal && modal.kind === 'bin' && (
        <Modal title="Recycle bin" onClose={() => setModal(null)} width={520} footer={<>{data.bin.length > 0 && <button className="fb danger" style={{ marginRight: 'auto' }} onClick={async () => { if (await ask({ title: 'Empty recycle bin?', message: 'These pages will be permanently deleted.', okText: 'Empty bin', danger: true })) setData((d) => ({ ...d, bin: [] })); }}>Empty bin</button>}<button className="fb pri" onClick={() => setModal(null)}>Close</button></>}>
          {data.bin.length === 0 ? <div className="fx-empty">The recycle bin is empty.</div> : data.bin.map((p) => <div key={p.id} className="nts-binrow"><div className="grow"><b>{p.title || 'Untitled page'}</b><div className="muted" style={{ fontSize: 12 }}>Deleted {fmtD(p.deleted)} · {snippet(p.html, 50)}</div></div><button className="fb sm" onClick={() => { restore(p.id); toast('Page restored'); }}>Restore</button><button className="fb sub sm danger" onClick={() => setData((d) => ({ ...d, bin: d.bin.filter((x) => x.id !== p.id) }))}>Delete</button></div>)}
        </Modal>)}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}
