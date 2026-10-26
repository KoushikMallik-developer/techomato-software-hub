import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, MenuRows, Modal, useToast, useAsk, useContextMenu } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { downloadFile, pickFiles, readAsText, safeName } from '../lib/download.js';
import { uid, highlight, buildDoc, standaloneHtml, format, TEMPLATES, LIBS, langOf } from './code/engine.js';
import '../styles/code.css';

const DEVICES = [['Responsive', 0, 0], ['Phone 375×667', 375, 667], ['Phone 414×896', 414, 896], ['Tablet 768×1024', 768, 1024], ['Laptop 1280×800', 1280, 800]];
const newProject = (tpl = TEMPLATES[0], name) => ({ id: uid(), name: name || tpl.name, files: tpl.make(), libs: [], updated: Date.now() });
const blank = () => { const p = newProject(TEMPLATES[1], 'Landing page'); return { projects: [p], cur: p.id, ui: { auto: true, layout: 'side', split: 50, dev: 0, font: 13, wrap: false, consoleOpen: true, active: {} } }; };
const migrate = (d) => { const b = blank(); if (!d || !Array.isArray(d.projects) || !d.projects.length) return b; return { ...b, ...d, ui: { ...b.ui, ...(d.ui || {}) } }; };

function Editor({ file, onChange, font, wrap, onRun, findQ, onCursor }) {
  const ta = useRef(null), pre = useRef(null), gut = useRef(null);
  const code = file.content;
  const lines = useMemo(() => code.split('\n').length, [code]);
  const html = useMemo(() => highlight(code, file.name), [code, file.name]);
  const sync = () => { if (!ta.current) return; if (pre.current) { pre.current.scrollTop = ta.current.scrollTop; pre.current.scrollLeft = ta.current.scrollLeft; } if (gut.current) gut.current.scrollTop = ta.current.scrollTop; };
    const edit = (start, end, text, selS, selE) => { const t = ta.current; const v = t.value.slice(0, start) + text + t.value.slice(end); t.value = v; t.setSelectionRange(selS ?? start + text.length, selE ?? selS ?? start + text.length); onChange(v); cur(); };
  const onKey = (e) => {
    const t = e.target; const { selectionStart: s, selectionEnd: en, value: v } = t;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); return; }
    if (e.key === 'Tab') { e.preventDefault(); const ls = v.lastIndexOf('\n', s - 1) + 1; if (s !== en && v.slice(s, en).includes('\n')) { const blockEnd = en; const seg = v.slice(ls, blockEnd); const out = e.shiftKey ? seg.replace(/^( {1,2}|\t)/gm, '') : seg.replace(/^/gm, '  '); edit(ls, blockEnd, out, ls, ls + out.length); } else if (e.shiftKey) { if (v.slice(ls, ls + 2) === '  ') edit(ls, ls + 2, '', Math.max(ls, s - 2)); } else edit(s, en, '  '); return; }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { const ls = v.lastIndexOf('\n', s - 1) + 1; const ind = /^[ \t]*/.exec(v.slice(ls, s))[0]; const prev = v[s - 1], next = v[s]; if (prev === '{' && next === '}' || prev === '[' && next === ']' || prev === '(' && next === ')') { e.preventDefault(); edit(s, en, '\n' + ind + '  \n' + ind, s + 1 + ind.length + 2); return; } if (ind || prev === '{' || prev === '>' && false) { e.preventDefault(); const extra = /[{[(]$/.test(v.slice(ls, s).trimEnd()) ? '  ' : ''; edit(s, en, '\n' + ind + extra); return; } }
    const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    if (pairs[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) { if (s !== en) { e.preventDefault(); edit(s, en, e.key + v.slice(s, en) + pairs[e.key], s + 1, en + 1); return; } if (v[s] === e.key && ')]}"\'`'.includes(e.key)) { e.preventDefault(); t.selectionStart = t.selectionEnd = s + 1; return; } if ((e.key === '"' || e.key === "'" || e.key === '`') && /\w/.test(v[s - 1] || '')) return; e.preventDefault(); edit(s, en, e.key + pairs[e.key], s + 1); return; }
    if (')]}'.includes(e.key) && v[s] === e.key && s === en) { e.preventDefault(); t.selectionStart = t.selectionEnd = s + 1; return; }
    if (e.key === 'Backspace' && s === en && s > 0 && pairs[v[s - 1]] === v[s]) { e.preventDefault(); edit(s - 1, s + 1, '', s - 1); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); const l = langOf(file.name); const ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', en); if (le < 0) le = v.length; const seg = v.slice(ls, le); let out; if (l === 'xml') out = /^\s*<!--.*-->\s*$/.test(seg) ? seg.replace(/<!--\s?|\s?-->/g, '') : seg.replace(/^(\s*)(.*)$/s, '$1<!-- $2 -->'); else if (l === 'css') out = /^\s*\/\*.*\*\/\s*$/.test(seg) ? seg.replace(/\/\*\s?|\s?\*\//g, '') : seg.replace(/^(\s*)(.*)$/s, '$1/* $2 */'); else { const all = seg.split('\n').every((x) => /^\s*\/\//.test(x) || !x.trim()); out = seg.split('\n').map((x) => (all ? x.replace(/^(\s*)\/\/ ?/, '$1') : x.replace(/^(\s*)/, '$1// '))).join('\n'); } edit(ls, le, out, ls, ls + out.length); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); const ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', en); if (le < 0) le = v.length; const seg = v.slice(ls, le); edit(le, le, '\n' + seg, le + 1 + (s - ls), le + 1 + (en - ls)); }
  };
  const cur = () => { const t = ta.current; if (!t || !onCursor) return; const before = t.value.slice(0, t.selectionStart); const ln = before.split('\n').length; onCursor(ln, t.selectionStart - before.lastIndexOf('\n'), t.selectionEnd - t.selectionStart); };
  const fs = { fontSize: font + 'px', lineHeight: Math.round(font * 1.55) + 'px' };
  return (
    <div className="cd-ed" style={fs}>
      <div className="cd-gut" ref={gut} aria-hidden="true">{Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}</div>
      <div className="cd-code">
        <pre ref={pre} className={'cd-hl hljs' + (wrap ? ' wrap' : '')} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
        <textarea ref={ta} className={'cd-ta' + (wrap ? ' wrap' : '')} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap={wrap ? 'soft' : 'off'} value={code} aria-label={'Code of ' + file.name} data-find={findQ || ''}
          onChange={(e) => onChange(e.target.value)} onScroll={sync} onKeyDown={onKey} onKeyUp={cur} onClick={cur} onSelect={cur} />
      </div>
    </div>
  );
}

export default function CodeApp() {
  const [data, setData, meta] = useStore('code', blank, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const [dlg, setDlg] = useState(null); const [logs, setLogs] = useState([]); const [pos, setPos] = useState([1, 1, 0]); const [cmd, setCmd] = useState(''); const [fq, setFq] = useState(''); const [fr, setFr] = useState(''); const [fcase, setFcase] = useState(false);
  const [runDoc, setRunDoc] = useState(''); const [runN, setRunN] = useState(0); const frame = useRef(null); const drag = useRef(null); const main = useRef(null);
  const { ui } = data; const setUi = (p) => setData((d) => ({ ...d, ui: { ...d.ui, ...p } }));
  const proj = data.projects.find((p) => p.id === data.cur) || data.projects[0];
  const activeId = (ui.active || {})[proj.id]; const file = proj.files.find((f) => f.id === activeId) || proj.files[0];
  const upProj = useCallback((fn) => setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === d.cur ? { ...fn(p), updated: Date.now() } : p)) })), [setData]);
  const setContent = (v) => upProj((p) => ({ ...p, files: p.files.map((f) => (f.id === file.id ? { ...f, content: v } : f)) }));
  const openFile = (id) => setUi({ active: { ...(ui.active || {}), [proj.id]: id } });

  /* run */
  const run = useCallback(() => { setLogs([]); setRunDoc(buildDoc(proj.files, proj.libs)); setRunN((n) => n + 1); }, [proj.files, proj.libs]);
  const runRef = useRef(run); runRef.current = run;
  useEffect(() => { const t = setTimeout(() => { if (runN === 0 || ui.auto) runRef.current(); }, runN === 0 ? 0 : 450); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [proj.id, proj.files, proj.libs, ui.auto]);
  useEffect(() => {
    const h = (e) => { if (!frame.current || e.source !== frame.current.contentWindow || !e.data || !e.data.__tc) return; const m = e.data; if (m.type === 'clear') setLogs([]); else setLogs((l) => [...l.slice(-499), { type: m.type, text: m.text, id: Math.random() }]); };
    window.addEventListener('message', h); return () => window.removeEventListener('message', h);
  }, []);
  const evalCmd = () => { const c = cmd.trim(); if (!c || !frame.current) return; setLogs((l) => [...l, { type: 'in', text: c, id: Math.random() }]); frame.current.contentWindow.postMessage({ __tcEval: 1, code: c }, '*'); setCmd(''); };

  /* files */
  const addFile = async () => { const n = await ask({ kind: 'prompt', title: 'New file', message: 'File name, for example about.html, app.js or theme.css', value: '', okText: 'Create' }); if (!n) return; const name = n.trim().replace(/[\\/]/g, '-'); if (!/\.[a-z0-9]+$/i.test(name)) { toast('Give the file an extension such as .js or .css'); return; } if (proj.files.some((f) => f.name === name)) { toast('A file with that name already exists'); return; } const f = { id: uid(), name, content: '' }; upProj((p) => ({ ...p, files: [...p.files, f] })); openFile(f.id); };
  const renameFile = async (f) => { const n = await ask({ kind: 'prompt', title: 'Rename file', value: f.name, okText: 'Rename' }); if (!n || n === f.name) return; if (proj.files.some((x) => x.name === n && x.id !== f.id)) { toast('A file with that name already exists'); return; } upProj((p) => ({ ...p, files: p.files.map((x) => (x.id === f.id ? { ...x, name: n.trim() } : x)) })); };
  const delFile = async (f) => { if (proj.files.length <= 1) { toast('A project needs at least one file'); return; } if (!(await ask({ kind: 'confirm', title: 'Delete file', message: `Delete ${f.name}?`, okText: 'Delete', danger: true }))) return; upProj((p) => ({ ...p, files: p.files.filter((x) => x.id !== f.id) })); };
  const tabMenu = (e, f) => showCtx(e, [{ label: 'Rename…', onClick: () => renameFile(f) }, { label: 'Duplicate', onClick: () => upProj((p) => ({ ...p, files: [...p.files, { id: uid(), name: f.name.replace(/(\.[^.]+)?$/, '-copy$1'), content: f.content }] })) }, { sep: true }, { label: 'Delete', onClick: () => delFile(f) }]);
  const importFiles = async () => { const fs = await pickFiles('.html,.htm,.css,.js,.json,.md,.txt,.svg'); if (!fs || !fs.length) return; const added = []; for (const f of fs) added.push({ id: uid(), name: f.name, content: await readAsText(f) }); upProj((p) => { const names = new Set(added.map((a) => a.name)); return { ...p, files: [...p.files.filter((x) => !names.has(x.name)), ...added] }; }); openFile(added[0].id); toast(`Added ${added.length} file${added.length > 1 ? 's' : ''}`); };
  const doFormat = () => { const out = format(file.content, file.name); if (out === file.content) { toast('Already tidy'); return; } setContent(out); toast('Formatted ' + file.name); };

  /* projects */
  const newProj = (tpl) => { const p = newProject(tpl); setData((d) => ({ ...d, projects: [...d.projects, p], cur: p.id })); setDlg(null); toast('Created "' + p.name + '"'); };
  const renameProj = async () => { const n = await ask({ kind: 'prompt', title: 'Rename project', value: proj.name, okText: 'Rename' }); if (n && n.trim()) upProj((p) => ({ ...p, name: n.trim() })); };
  const dupProj = () => { const c = { ...proj, id: uid(), name: proj.name + ' (copy)', files: proj.files.map((f) => ({ ...f, id: uid() })), updated: Date.now() }; setData((d) => ({ ...d, projects: [...d.projects, c], cur: c.id })); };
  const delProj = async () => { if (!(await ask({ kind: 'confirm', title: 'Delete project', message: `Delete "${proj.name}" and all its files?`, okText: 'Delete', danger: true }))) return; setData((d) => { const rest = d.projects.filter((p) => p.id !== proj.id); if (!rest.length) { const p = newProject(); return { ...d, projects: [p], cur: p.id }; } return { ...d, projects: rest, cur: rest[0].id }; }); };

  /* export */
  const expHtml = () => { downloadFile(safeName(proj.name) + '.html', standaloneHtml(proj.files, proj.libs), 'text/html'); toast('Saved a single HTML file'); };
  const expZip = async () => { try { const JSZip = (await import('jszip')).default; const z = new JSZip(); proj.files.forEach((f) => z.file(f.name, f.content)); const blob = await z.generateAsync({ type: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = safeName(proj.name) + '.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch { toast('Could not create the ZIP'); } };
  const openTab = () => { const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to open the preview in a new tab'); return; } w.document.open(); w.document.write(standaloneHtml(proj.files, proj.libs)); w.document.close(); };

  /* find / replace */
  const flags = fcase ? 'g' : 'gi'; const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = fq ? (file.content.match(new RegExp(escRe(fq), flags)) || []).length : 0;
  const replaceAll = () => { if (!fq) return; setContent(file.content.replace(new RegExp(escRe(fq), flags), () => fr)); toast(`Replaced ${count} match${count === 1 ? '' : 'es'}`); };
  const findNext = () => { const t = document.querySelector('.cd-ta'); if (!t || !fq) return; const hay = fcase ? t.value : t.value.toLowerCase(); const nd = fcase ? fq : fq.toLowerCase(); let i = hay.indexOf(nd, t.selectionEnd); if (i < 0) i = hay.indexOf(nd); if (i < 0) { toast('No matches'); return; } t.focus(); t.setSelectionRange(i, i + fq.length); const lh = parseFloat(getComputedStyle(t).lineHeight); t.scrollTop = Math.max(0, (t.value.slice(0, i).split('\n').length - 4) * lh); };

  /* shortcuts */
  useEffect(() => { const k = (e) => { const mod = e.ctrlKey || e.metaKey; if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); toast('Saved in this browser'); } else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); setDlg('find'); } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); doFormat(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });

  /* splitter */
  const startDrag = (e) => { e.preventDefault(); const r = main.current.getBoundingClientRect(); const vert = ui.layout === 'stack'; drag.current = true; const mv = (ev) => { if (!drag.current) return; const p = vert ? ((ev.clientY - r.top) / r.height) * 100 : ((ev.clientX - r.left) / r.width) * 100; setUi({ split: Math.min(80, Math.max(20, p)) }); }; const up = () => { drag.current = false; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.classList.remove('cd-dragging'); }; document.body.classList.add('cd-dragging'); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };

  const dev = DEVICES[ui.dev] || DEVICES[0];
  const errs = logs.filter((l) => l.type === 'error').length;
  const libOn = (u) => proj.libs.some((l) => l.url === u);
  const toggleLib = (name, type, url) => upProj((p) => ({ ...p, libs: p.libs.some((l) => l.url === url) ? p.libs.filter((l) => l.url !== url) : [...p.libs, { name, type, url }] }));
  const [customLib, setCustomLib] = useState('');
  const addCustom = () => { const u = customLib.trim(); if (!/^https:\/\/.+/i.test(u)) { toast('Enter a full https:// address'); return; } upProj((p) => ({ ...p, libs: [...p.libs, { name: u.split('/').pop() || u, type: /\.css(\?|$)/i.test(u) ? 'css' : 'script', url: u }] })); setCustomLib(''); };

  return (
    <div className="fx cd" style={{ '--brand': '#4b5563', '--brand-h': '#1f2937', '--brand-soft': '#e8ebef' }} data-app="code">
      <AppBar id="code" name="Techomato Code Playground" status={meta.status === 'error' ? 'error' : undefined}
        right={<span className="cd-save">{meta.status === 'saving' ? 'Saving…' : meta.status === 'error' ? 'Not saved' : 'Saved'}</span>}
        backup={{ name: 'code', get: () => data, set: (d) => meta.replace(migrate(d)), blank: () => blank() }}
        extraMenu={[{ label: 'Keyboard shortcuts', onClick: () => setDlg('keys') }]} />
      <div className="cd-top" role="toolbar" aria-label="Project">
        <select className="fi cd-sel" aria-label="Project" value={proj.id} onChange={(e) => setData((d) => ({ ...d, cur: e.target.value }))}>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <Pop trigger={({ toggle }) => <button className="fb sub" onClick={toggle}>Project <Icon name="chevronDown" size={12} /></button>}>{({ close }) => <MenuRows close={close} items={[{ label: 'New from template…', onClick: () => setDlg('templates') }, { label: 'Rename…', onClick: renameProj }, { label: 'Duplicate', onClick: dupProj }, { sep: true }, { label: 'Delete…', onClick: delProj }]} />}</Pop>
        <span className="cd-vs" />
        <button className="fb pri" onClick={run} title="Run (Ctrl+Enter)"><Icon name="chevronRight" size={14} /> Run</button>
        <label className="cd-chk cd-auto"><input type="checkbox" checked={ui.auto} onChange={(e) => setUi({ auto: e.target.checked })} /> Auto-run</label>
        <span className="cd-vs" />
        <button className="fb sub" onClick={doFormat} title="Format file (Ctrl+Shift+F)">Format</button>
        <button className="fb sub" onClick={() => setDlg('find')} title="Find and replace (Ctrl+F)">Find</button>
        <button className="fb sub" onClick={() => setDlg('libs')}>Libraries{proj.libs.length ? ` (${proj.libs.length})` : ''}</button>
        <div className="spacer" />
        <select className="fi cd-sel sm" aria-label="Preview size" value={ui.dev} onChange={(e) => setUi({ dev: +e.target.value })}>{DEVICES.map((d, i) => <option key={d[0]} value={i}>{d[0]}</option>)}</select>
        <div className="fx-seg" role="group" aria-label="Layout"><button className={ui.layout === 'side' ? 'on' : ''} onClick={() => setUi({ layout: 'side' })}>Side</button><button className={ui.layout === 'stack' ? 'on' : ''} onClick={() => setUi({ layout: 'stack' })}>Stack</button></div>
        <Pop align="right" trigger={({ toggle }) => <button className="fb sub" onClick={toggle}><Icon name="download" size={14} /> Export</button>}>{({ close }) => <MenuRows close={close} items={[{ label: 'Single HTML file', onClick: expHtml }, { label: 'All files (.zip)', onClick: expZip }, { label: 'Open preview in new tab', onClick: openTab }, { sep: true }, { label: 'Import files…', onClick: importFiles }]} />}</Pop>
      </div>
      <div className={'cd-main ' + ui.layout} ref={main} style={{ '--split': ui.split + '%' }}>
        <section className="cd-pane cd-editor" aria-label="Editor">
          <div className="cd-tabs" role="tablist">
            {proj.files.map((f) => <button key={f.id} role="tab" aria-selected={f.id === file.id} className={'cd-tab' + (f.id === file.id ? ' on' : '')} onClick={() => openFile(f.id)} onContextMenu={(e) => tabMenu(e, f)} onDoubleClick={() => renameFile(f)} title="Double-click to rename, right-click for more">{f.name}</button>)}
            <button className="cd-tab add" onClick={addFile} aria-label="New file" title="New file"><Icon name="plus" size={14} /></button>
            <div className="spacer" />
            <button className="fb ico sub sm" aria-label="Smaller text" onClick={() => setUi({ font: Math.max(10, ui.font - 1) })}><Icon name="minus" size={14} /></button><span className="cd-fs">{ui.font}px</span><button className="fb ico sub sm" aria-label="Larger text" onClick={() => setUi({ font: Math.min(24, ui.font + 1) })}><Icon name="plus" size={14} /></button>
            <label className="cd-chk cd-wrap"><input type="checkbox" checked={ui.wrap} onChange={(e) => setUi({ wrap: e.target.checked })} /> Wrap</label>
          </div>
          <Editor key={file.id} file={file} onChange={setContent} font={ui.font} wrap={ui.wrap} onRun={run} onCursor={(l, c, n) => setPos([l, c, n])} />
          <div className="cd-status"><span>Ln {pos[0]}, Col {pos[1]}{pos[2] ? ` (${pos[2]} selected)` : ''}</span><span>{file.content.length.toLocaleString()} characters</span><span>{langOf(file.name) === 'xml' ? 'HTML' : langOf(file.name)}</span></div>
        </section>
        <div className="cd-split" role="separator" aria-orientation={ui.layout === 'stack' ? 'horizontal' : 'vertical'} onPointerDown={startDrag} />
        <section className="cd-pane cd-out" aria-label="Preview">
          <div className="cd-prev">
            <div className="cd-frame-wrap" style={dev[1] ? { width: dev[1], height: dev[2], maxWidth: '100%', maxHeight: '100%' } : undefined}>
              <iframe ref={frame} title="Preview" className="cd-frame" sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin" srcDoc={runDoc} />
            </div>
          </div>
          <div className={'cd-cons' + (ui.consoleOpen ? ' open' : '')}>
            <div className="cd-cons-h"><button className="fb sub sm" onClick={() => setUi({ consoleOpen: !ui.consoleOpen })} aria-expanded={ui.consoleOpen}><Icon name={ui.consoleOpen ? 'chevronDown' : 'chevronUp'} size={12} /> Console</button>{errs > 0 && <span className="cd-badge">{errs} error{errs > 1 ? 's' : ''}</span>}<div className="spacer" />{ui.consoleOpen && <button className="fb sub sm" onClick={() => setLogs([])}>Clear</button>}</div>
            {ui.consoleOpen && <>
              <div className="cd-log" role="log" aria-live="off">{logs.length === 0 && <div className="cd-log-empty">console.log output appears here.</div>}{logs.map((l) => <div key={l.id} className={'cd-line ' + l.type}><span className="cd-pfx">{l.type === 'in' ? '›' : l.type === 'result' ? '‹' : ''}</span><span>{l.text}</span></div>)}</div>
              <div className="cd-cmd"><span>›</span><input aria-label="Run JavaScript in the preview" placeholder="Type JavaScript and press Enter" value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') evalCmd(); }} /></div>
            </>}
          </div>
        </section>
      </div>

      {dlg === 'templates' && <Modal title="New project from a template" onClose={() => setDlg(null)} width={560} footer={<button className="fb" onClick={() => setDlg(null)}>Cancel</button>}><div className="cd-tpls">{TEMPLATES.map((t) => <button key={t.id} className="cd-tpl" onClick={() => newProj(t)}><b>{t.name}</b><span>{t.desc}</span></button>)}</div></Modal>}
      {dlg === 'libs' && <Modal title="Libraries" onClose={() => setDlg(null)} width={520} footer={<button className="fb pri" onClick={() => setDlg(null)}>Done</button>}>
        <p className="muted" style={{ marginTop: 0 }}>Libraries load from a public CDN, so the preview needs an internet connection for these.</p>
        <div className="cd-libs">{LIBS.map(([n, t, u]) => <label key={u} className="cd-chk"><input type="checkbox" checked={libOn(u)} onChange={() => toggleLib(n, t, u)} /> {n}</label>)}</div>
        {proj.libs.filter((l) => !LIBS.some((x) => x[2] === l.url)).map((l) => <div key={l.url} className="cd-custom"><span className="ellip">{l.url}</span><button className="fb sub sm" onClick={() => toggleLib(l.name, l.type, l.url)}>Remove</button></div>)}
        <div className="cd-add"><input className="fi" placeholder="https://…/library.js or .css" value={customLib} onChange={(e) => setCustomLib(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }} /><button className="fb" onClick={addCustom}>Add</button></div>
      </Modal>}
      {dlg === 'find' && <Modal title="Find and replace" onClose={() => setDlg(null)} width={420} footer={<><button className="fb" onClick={replaceAll} disabled={!fq}>Replace all</button><button className="fb pri" onClick={() => { findNext(); setDlg(null); }} disabled={!fq}>Find next</button></>}>
        <div className="fx-kv"><label>Find</label><input className="fi" autoFocus value={fq} onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { findNext(); setDlg(null); } }} /><label>Replace</label><input className="fi" value={fr} onChange={(e) => setFr(e.target.value)} /></div>
        <label className="cd-chk" style={{ marginTop: 8 }}><input type="checkbox" checked={fcase} onChange={(e) => setFcase(e.target.checked)} /> Match case</label>
        <p className="muted" style={{ marginBottom: 0 }}>{fq ? `${count} match${count === 1 ? '' : 'es'} in ${file.name}` : 'Searches the open file.'}</p>
      </Modal>}
      {dlg === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setDlg(null)} footer={<button className="fb pri" onClick={() => setDlg(null)}>Close</button>}><div className="fx-kv">{[['Ctrl+Enter', 'Run the preview'], ['Ctrl+F', 'Find and replace'], ['Ctrl+Shift+F', 'Format the open file'], ['Ctrl+/', 'Comment or uncomment lines'], ['Ctrl+D', 'Duplicate the current line'], ['Tab / Shift+Tab', 'Indent or outdent'], ['Ctrl+S', 'Confirm saved (it saves automatically)']].flatMap(([a, b]) => [<span key={a} className="cd-kbd">{a}</span>, <span key={b}>{b}</span>])}</div></Modal>}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}
