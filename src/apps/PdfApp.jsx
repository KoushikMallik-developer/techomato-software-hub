import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast, useAsk, useContextMenu } from '../components/fxui.jsx';
import { pickFiles } from '../lib/download.js';
import { openPdf, imageToPdf, buildPdf, renderPageTo, displaySize, parseRanges, PAGE_SIZES, uid, saveBlob, fmtBytes, stem, makeZip, openBytes, rasterize, imagesToPdfBytes, extractText, loadLibs } from './pdf/engine.js';
import Editor from './pdf/Editor.jsx';
import '../styles/pdf.css';

const TABS = ['Home', 'Insert', 'Stamp', 'Convert', 'Document'];
const sizeKey = (p, files) => { if (p.blank) return `${p.blank.w}x${p.blank.h}`; const f = files.get(p.fid); return f.info[p.idx].w; };

/* A page thumbnail that renders lazily */
function Thumb({ file, p, size = 170 }) {
  const ref = useRef(null); const holder = useRef(null); const [vis, setVis] = useState(false);
  useEffect(() => { const el = holder.current; if (!el || typeof IntersectionObserver === 'undefined') { setVis(true); return undefined; } const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVis(true); io.disconnect(); } }, { rootMargin: '300px' }); io.observe(el); return () => io.disconnect(); }, []);
  const ann = p.ann ? p.ann.length : 0;
  useEffect(() => { if (!vis || !ref.current) return; if (p.blank) { const c = ref.current; c.width = 4; c.height = 4; c.getContext('2d').fillStyle = '#fff'; c.getContext('2d').fillRect(0, 0, 4, 4); return; } renderPageTo(file, p.idx, p.rot, ref.current, size).catch(() => {}); }, [vis, p.rot, p.idx, file, size]); // eslint-disable-line
  const [w, h] = p.blank ? [p.blank.w, p.blank.h] : displaySize(file.info[p.idx], p.rot); const k = size / Math.max(w, h);
  return <div className="pdf-th" ref={holder} style={{ width: w * k, height: h * k }}><canvas ref={ref} style={{ width: '100%', height: '100%' }} />{ann > 0 && <span className="pdf-annb" title={`${ann} annotation${ann > 1 ? 's' : ''}`}><Icon name="edit" size={11} />{ann}</span>}</div>;
}

export default function PdfApp() {
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const [files, setFiles] = useState(() => new Map()); const [pages, setPages] = useState([]); const [sel, setSel] = useState(() => new Set()); const [anchor, setAnchor] = useState(null);
  const [tab, setTab] = useState('Home'); const [dlg, setDlg] = useState(null); const [editor, setEditor] = useState(null); const [busy, setBusy] = useState(null); const [dragOver, setDragOver] = useState(false);
  const [settings, setSettings] = useState({ watermark: { on: false, text: 'CONFIDENTIAL', size: 72, angle: 45, opacity: 0.25, color: '#999999', pages: 'all' }, numbers: { on: false, format: 'Page {n} of {total}', pos: 'bottom', align: 'center', size: 11, start: 1, skipFirst: false, color: '#444444' }, header: { on: false, left: '', center: '', right: '', size: 10 }, footer: { on: false, left: '', center: '', right: '', size: 10 }, crop: { t: 0, r: 0, b: 0, l: 0 }, meta: { title: '', author: '', subject: '', keywords: '' } });
  const [sigs, setSigs] = useState(() => { try { return JSON.parse(localStorage.getItem('techomato:pdf-sigs') || '[]'); } catch { return []; } });
  const [zoom, setZoom] = useState(170); const [outSize, setOutSize] = useState(null); const undoStack = useRef([]); const redoStack = useRef([]); const fileInput = useRef(null); const dragFrom = useRef(null); const [dropAt, setDropAt] = useState(null);
  useEffect(() => { try { localStorage.setItem('techomato:pdf-sigs', JSON.stringify(sigs)); } catch { /* ignore */ } }, [sigs]);
  const fileList = [...files.values()];

  /* ---------- history ---------- */
  const setP = (next, keepSel) => { undoStack.current = [...undoStack.current, pages].slice(-60); redoStack.current = []; setPages(next); if (!keepSel) setSel(new Set()); };
  const undo = () => { if (!undoStack.current.length) return; redoStack.current.push(pages); setPages(undoStack.current.pop()); setSel(new Set()); };
  const redo = () => { if (!redoStack.current.length) return; undoStack.current.push(pages); setPages(redoStack.current.pop()); setSel(new Set()); };
  const hasMeta = settings.meta.title || settings.meta.author || settings.meta.subject || settings.meta.keywords;

  /* ---------- adding content ---------- */
  const addFiles = async (list) => {
    if (!list.length) return; setBusy({ label: 'Opening files…' }); const added = []; const newFiles = new Map(files); let metaDone = false;
    for (const f of list) {
      try {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          const bytes = new Uint8Array(await f.arrayBuffer()); let pass; let pdf = null;
          for (let tries = 0; tries < 3 && !pdf; tries++) { try { pdf = await openPdf(bytes, f.name, pass); } catch (e) { if (e && e.name === 'PasswordException') { pass = await ask({ kind: 'prompt', title: 'Password required', message: `${f.name} is protected. Enter its password to open it.`, okText: 'Open' }); if (pass === null) break; } else throw e; } }
          if (!pdf) { toast(`Skipped ${f.name}`); continue; }
          if (!pdf.editable) { toast(`${f.name} cannot be edited (encrypted)`); continue; }
          newFiles.set(pdf.id, pdf); for (let i = 0; i < pdf.n; i++) added.push({ id: uid(), fid: pdf.id, idx: i, rot: 0, ann: [] });
          if (!metaDone && !files.size && !hasMeta) { setSettings((s) => ({ ...s, meta: pdf.meta })); metaDone = true; }
        } else if (/^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)) {
          const bytes = await imageToPdf(f, { size: 'fit' }); const pdf = await openPdf(bytes, f.name.replace(/\.[^.]+$/, '') + '.pdf'); newFiles.set(pdf.id, pdf); added.push({ id: uid(), fid: pdf.id, idx: 0, rot: 0, ann: [] });
        } else toast(`${f.name} is not a PDF or image`);
      } catch (e) { toast(`Could not open ${f.name}: ${e.message || e}`); }
    }
    setBusy(null); if (!added.length) return; setFiles(newFiles); setP([...pages, ...added], true); setSel(new Set(added.map((p) => p.id))); toast(`Added ${added.length} page${added.length > 1 ? 's' : ''}`);
  };
  const addDialog = async () => addFiles(await pickFiles('application/pdf,.pdf,image/*'));
  const addBlank = (size = 'A4') => { const [w, h] = PAGE_SIZES[size]; const np = { id: uid(), blank: { w, h }, rot: 0, ann: [] }; const at = sel.size ? Math.max(...pages.map((p, i) => (sel.has(p.id) ? i : -1))) + 1 : pages.length; const n = [...pages]; n.splice(at, 0, np); setP(n); setSel(new Set([np.id])); };
  useEffect(() => {
    const dv = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDragOver(true); } }; const dl = (e) => { if (!e.relatedTarget) setDragOver(false); }; const dp = (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); setDragOver(false); addFiles([...e.dataTransfer.files]); } };
    window.addEventListener('dragover', dv); window.addEventListener('dragleave', dl); window.addEventListener('drop', dp); return () => { window.removeEventListener('dragover', dv); window.removeEventListener('dragleave', dl); window.removeEventListener('drop', dp); };
  });

  /* ---------- selection & page operations ---------- */
  const idxSel = pages.map((p, i) => (sel.has(p.id) ? i : -1)).filter((i) => i >= 0);
  const click = (e, p, i) => { if (e.shiftKey && anchor != null) { const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]; setSel(new Set(pages.slice(a, b + 1).map((x) => x.id))); } else if (e.ctrlKey || e.metaKey) { const n = new Set(sel); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setSel(n); setAnchor(i); } else { setSel(new Set([p.id])); setAnchor(i); } };
  const target = () => (sel.size ? pages.filter((p) => sel.has(p.id)) : pages);
  const need = () => { if (!sel.size) { toast('Select one or more pages first'); return false; } return true; };
  const rotate = (d) => { const t = sel.size ? sel : new Set(pages.map((p) => p.id)); setP(pages.map((p) => (t.has(p.id) ? { ...p, rot: (((p.rot + d) % 360) + 360) % 360 } : p)), true); };
  const remove = () => { if (!need()) return; const n = pages.filter((p) => !sel.has(p.id)); setP(n); toast(`Deleted ${pages.length - n.length} page${pages.length - n.length > 1 ? 's' : ''}`, { action: { label: 'Undo', onClick: undo } }); };
  const dupPages = () => { if (!need()) return; const n = []; for (const p of pages) { n.push(p); if (sel.has(p.id)) n.push({ ...p, id: uid(), ann: (p.ann || []).map((a) => ({ ...a })) }); } setP(n, true); };
  const move = (dir) => { if (!need()) return; const n = [...pages]; if (dir < 0) { for (let i = 1; i < n.length; i++) if (sel.has(n[i].id) && !sel.has(n[i - 1].id)) [n[i - 1], n[i]] = [n[i], n[i - 1]]; } else { for (let i = n.length - 2; i >= 0; i--) if (sel.has(n[i].id) && !sel.has(n[i + 1].id)) [n[i + 1], n[i]] = [n[i], n[i + 1]]; } setP(n, true); };
  const reverse = () => setP([...pages].reverse(), true);
  const selectAll = () => setSel(new Set(pages.map((p) => p.id)));
  const selectBy = (kind) => { const f = { odd: (i) => i % 2 === 0, even: (i) => i % 2 === 1, none: () => false }[kind]; setSel(new Set(pages.filter((_, i) => f(i)).map((p) => p.id))); };
  const selectRange = async () => { const v = await ask({ kind: 'prompt', title: 'Select pages', message: `Type page numbers or ranges, such as 1-3, 5, 8- (document has ${pages.length} pages).`, value: '', okText: 'Select' }); if (v === null) return; const r = parseRanges(v, pages.length); if (!r) return toast('That is not a valid page range'); setSel(new Set(r.map((i) => pages[i].id))); };
  const clearAll = async () => { if (pages.length && !(await ask({ title: 'Close all', message: 'Remove all files and pages from the workspace?', okText: 'Close all', danger: true }))) return; setFiles(new Map()); setPages([]); setSel(new Set()); undoStack.current = []; redoStack.current = []; setOutSize(null); };
  const removeFile = (fid) => { setP(pages.filter((p) => p.fid !== fid)); const n = new Map(files); n.delete(fid); setFiles(n); };

  /* drag to reorder */
  const dragStart = (e, p) => { const ids = sel.has(p.id) ? pages.filter((x) => sel.has(x.id)).map((x) => x.id) : [p.id]; dragFrom.current = ids; if (!sel.has(p.id)) setSel(new Set([p.id])); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'pdf-pages'); };
  const dragOverItem = (e, i) => { if (!dragFrom.current) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1); };
  const dropItem = (e) => { if (!dragFrom.current) return; e.preventDefault(); const ids = new Set(dragFrom.current); let at = dropAt == null ? pages.length : dropAt; const moving = pages.filter((p) => ids.has(p.id)); const before = pages.slice(0, at).filter((p) => !ids.has(p.id)); const after = pages.slice(at).filter((p) => !ids.has(p.id)); setP([...before, ...moving, ...after], true); dragFrom.current = null; setDropAt(null); };

  /* ---------- editor ---------- */
  const openEditor = (i) => setEditor(i);
  const saveEditor = (i, ann) => setPages((ps) => ps.map((p, k) => (k === i ? { ...p, ann } : p)));

  /* ---------- export ---------- */
  const effSettings = () => ({ ...settings, meta: hasMeta ? settings.meta : null, crop: settings.crop });
  const doBuild = async (list, label = 'Building PDF…') => { setBusy({ label, pct: 0 }); try { const bytes = await buildPdf(files, list, effSettings(), (p) => setBusy({ label, pct: p })); return bytes; } finally { setBusy(null); } };
  const exportPdf = async (opts) => {
    const base = fileList.length === 1 ? stem(fileList[0].name) : 'combined';
    let list = opts.scope === 'sel' ? pages.filter((p) => sel.has(p.id)) : pages; if (opts.scope === 'range') { const r = parseRanges(opts.range, pages.length); if (!r || !r.length) return toast('That is not a valid page range'); list = r.map((i) => pages[i]); }
    if (!list.length) return toast('Nothing to export');
    try {
      if (opts.mode === 'split') {
        let groups = []; if (opts.split === 'each') groups = list.map((p) => [p]); else if (opts.split === 'every') { const n = Math.max(1, +opts.every || 1); for (let i = 0; i < list.length; i += n) groups.push(list.slice(i, i + n)); } else { const parts = String(opts.ranges || '').split(/[;\n]+/).map((s) => s.trim()).filter(Boolean); for (const part of parts) { const r = parseRanges(part, list.length); if (!r || !r.length) return toast(`Invalid range: ${part}`); groups.push(r.map((i) => list[i])); } }
        if (!groups.length) return toast('Nothing to split'); const entries = []; setBusy({ label: 'Splitting…', pct: 0 });
        for (let g = 0; g < groups.length; g++) { const bytes = await buildPdf(files, groups[g], effSettings()); entries.push([`${base}-${String(g + 1).padStart(String(groups.length).length, '0')}.pdf`, bytes]); setBusy({ label: 'Splitting…', pct: (g + 1) / groups.length }); }
        setBusy(null); if (entries.length === 1) saveBlob(entries[0][0], new Blob([entries[0][1]], { type: 'application/pdf' })); else saveBlob(`${base}-split.zip`, await makeZip(entries)); toast(`Created ${entries.length} PDF file${entries.length > 1 ? 's' : ''}`); setDlg(null); return;
      }
      let bytes = await doBuild(list); if (opts.compress) { bytes = await compressBytes(bytes, opts.quality); }
      saveBlob(`${opts.name || base}.pdf`, new Blob([bytes], { type: 'application/pdf' })); setOutSize(bytes.length); toast(`Saved ${opts.name || base}.pdf (${fmtBytes(bytes.length)})`); setDlg(null);
    } catch (e) { setBusy(null); toast('Export failed: ' + (e.message || e)); }
  };
  const compressBytes = async (bytes, quality) => { const q = { low: [1, 0.5], med: [1.4, 0.7], high: [2, 0.85] }[quality || 'med']; const doc = await openBytes(bytes); setBusy({ label: 'Compressing…', pct: 0 }); const imgs = await rasterize(doc, q[0], 'image/jpeg', q[1], (p) => setBusy({ label: 'Compressing…', pct: p })); const out = await imagesToPdfBytes(imgs); setBusy(null); return out; };
  const toImages = async (o) => { const list = o.scope === 'sel' ? pages.filter((p) => sel.has(p.id)) : pages; if (!list.length) return toast('Nothing to convert'); try { const bytes = await doBuild(list); const doc = await openBytes(bytes); setBusy({ label: 'Rendering images…', pct: 0 }); const imgs = await rasterize(doc, o.dpi / 72, o.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92, (p) => setBusy({ label: 'Rendering images…', pct: p })); setBusy(null); const base = fileList.length === 1 ? stem(fileList[0].name) : 'pages'; if (imgs.length === 1) saveBlob(`${base}-1.${o.fmt}`, imgs[0].blob); else saveBlob(`${base}-images.zip`, await makeZip(await Promise.all(imgs.map(async (im, i) => [`${base}-${String(i + 1).padStart(3, '0')}.${o.fmt}`, await im.blob.arrayBuffer()])))); toast(`Saved ${imgs.length} image${imgs.length > 1 ? 's' : ''}`); setDlg(null); } catch (e) { setBusy(null); toast('Conversion failed: ' + (e.message || e)); } };
  const toText = async (o) => { const list = (o && o.scope === 'sel') ? pages.filter((p) => sel.has(p.id)) : pages; if (!list.length) return; setBusy({ label: 'Extracting text…' }); try { const out = []; for (const p of list) { if (p.blank) { out.push(''); continue; } out.push((await extractText(files.get(p.fid), [p.idx]))[0]); } const text = out.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n'); setBusy(null); if (!text.replace(/--- Page \d+ ---|\s/g, '')) toast('No selectable text found (this may be a scanned document)'); else { saveBlob(`${fileList.length === 1 ? stem(fileList[0].name) : 'text'}.txt`, new Blob([text], { type: 'text/plain' })); toast('Text saved'); } } catch (e) { setBusy(null); toast('Extraction failed'); } };
  const previewAll = async () => { const bytes = await doBuild(pages, 'Preparing preview…'); const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const k = (e) => { const t = e.target; if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return; if (editor !== null || document.querySelector('.fx-modal-back')) return; const key = e.key.toLowerCase(); const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (ctrl && key === 'y') { e.preventDefault(); redo(); } else if (ctrl && key === 'a') { e.preventDefault(); selectAll(); } else if (ctrl && key === 'o') { e.preventDefault(); addDialog(); } else if (ctrl && key === 's') { e.preventDefault(); if (pages.length) setDlg({ k: 'export' }); }
      else if (key === 'delete' || key === 'backspace') { if (sel.size) { e.preventDefault(); remove(); } } else if (key === 'enter' && idxSel.length === 1) openEditor(idxSel[0]); else if (key === '[' ) rotate(-90); else if (key === ']') rotate(90); else if (key === 'escape') setSel(new Set()); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const ctxMenu = (e, p, i) => { e.preventDefault(); if (!sel.has(p.id)) { setSel(new Set([p.id])); setAnchor(i); } showCtx(e, [{ label: 'Edit page / annotate', icon: 'edit', onClick: () => openEditor(i) }, { sep: true }, { label: 'Rotate left', onClick: () => { setSel(new Set(sel.has(p.id) ? sel : [p.id])); rotate(-90); } }, { label: 'Rotate right', onClick: () => rotate(90) }, { label: 'Duplicate', icon: 'copy', onClick: dupPages }, { label: 'Move left', onClick: () => move(-1) }, { label: 'Move right', onClick: () => move(1) }, { sep: true }, { label: 'Delete', icon: 'trash', onClick: remove }]); };

  const totalPages = pages.length; const colorOf = (fid) => { const ids = [...files.keys()]; return ['#0f6cbd', '#107c10', '#da3b01', '#8764b8', '#00b7c3', '#c239b3', '#ca5010'][ids.indexOf(fid) % 7]; };
  const hasPages = totalPages > 0; const dis = !hasPages;
  const Btn = ({ icon, label, onClick, disabled, on, title }) => <button className={'pdf-rb' + (on ? ' on' : '')} disabled={disabled} onClick={onClick} title={title || label}><Icon name={icon} size={20} /><span>{label}</span></button>;

  return (
    <div className="fx pdf" style={{ '--brand': '#d13438' }} data-app="pdf">
      <AppBar id="pdf" name="Techomato PDF Toolkit" right={<><button className="fb pri pdf-exp" disabled={dis} onClick={() => setDlg({ k: 'export' })}><Icon name="download" size={14} />Export PDF</button></>} extraMenu={[{ label: 'Keyboard shortcuts', onClick: () => setDlg({ k: 'keys' }) }]} />
      <div className="pdf-ribbon" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      <div className="pdf-tools" role="toolbar" aria-label={`${tab} tools`}>
        {tab === 'Home' && <>
          <Btn icon="plus" label="Add files" onClick={addDialog} title="Add PDF or image files (Ctrl+O)" />
          <Btn icon="file" label="Blank page" onClick={() => addBlank('A4')} />
          <span className="pdf-sep" />
          <Btn icon="rotate" label="Rotate right" onClick={() => rotate(90)} disabled={dis} /><Btn icon="flipH" label="Rotate left" onClick={() => rotate(-90)} disabled={dis} />
          <Btn icon="trash" label="Delete" onClick={remove} disabled={dis || !sel.size} /><Btn icon="copy" label="Duplicate" onClick={dupPages} disabled={dis || !sel.size} />
          <Btn icon="arrowLeft" label="Move left" onClick={() => move(-1)} disabled={dis || !sel.size} /><Btn icon="arrowRight" label="Move right" onClick={() => move(1)} disabled={dis || !sel.size} /><Btn icon="sortDesc" label="Reverse" onClick={reverse} disabled={dis} />
          <span className="pdf-sep" />
          <Btn icon="edit" label="Edit page" onClick={() => (idxSel.length ? openEditor(idxSel[0]) : toast('Select a page to edit'))} disabled={dis} title="Annotate, add text, shapes, images and signatures (Enter)" />
          <span className="pdf-sep" />
          <Btn icon="checkbox" label="Select all" onClick={selectAll} disabled={dis} /><Btn icon="list" label="Odd pages" onClick={() => selectBy('odd')} disabled={dis} /><Btn icon="list" label="Even pages" onClick={() => selectBy('even')} disabled={dis} /><Btn icon="rectSel" label="By range" onClick={selectRange} disabled={dis} />
          <span className="pdf-sep" /><Btn icon="undo" label="Undo" onClick={undo} disabled={!undoStack.current.length} /><Btn icon="redo" label="Redo" onClick={redo} disabled={!redoStack.current.length} />
        </>}
        {tab === 'Insert' && <>
          <Btn icon="image" label="Images as pages" onClick={async () => addFiles(await pickFiles('image/*'))} />
          {Object.keys(PAGE_SIZES).map((s) => <Btn key={s} icon="file" label={`Blank ${s}`} onClick={() => addBlank(s)} />)}
          <span className="pdf-sep" /><Btn icon="textT" label="Add text" onClick={() => (idxSel.length ? openEditor(idxSel[0]) : toast('Select a page first'))} disabled={dis} /><Btn icon="edit" label="Signature" onClick={() => (idxSel.length ? openEditor(idxSel[0]) : toast('Select a page first'))} disabled={dis} />
        </>}
        {tab === 'Stamp' && <>
          <Btn icon="textColor" label="Watermark" on={settings.watermark.on} onClick={() => setDlg({ k: 'watermark' })} disabled={dis} />
          <Btn icon="list" label="Page numbers" on={settings.numbers.on} onClick={() => setDlg({ k: 'numbers' })} disabled={dis} />
          <Btn icon="rows" label="Header" on={settings.header.on} onClick={() => setDlg({ k: 'header' })} disabled={dis} /><Btn icon="rows" label="Footer" on={settings.footer.on} onClick={() => setDlg({ k: 'footer' })} disabled={dis} />
          <Btn icon="crop" label="Crop margins" on={!!(settings.crop.t || settings.crop.r || settings.crop.b || settings.crop.l)} onClick={() => setDlg({ k: 'crop' })} disabled={dis} />
        </>}
        {tab === 'Convert' && <>
          <Btn icon="image" label="PDF to images" onClick={() => setDlg({ k: 'images' })} disabled={dis} /><Btn icon="type" label="Extract text" onClick={() => toText({ scope: sel.size ? 'sel' : 'all' })} disabled={dis} title="Save the selectable text of the pages as .txt" />
          <Btn icon="download" label="Split into files" onClick={() => setDlg({ k: 'export', mode: 'split' })} disabled={dis} /><Btn icon="merge" label="Merge & save" onClick={() => setDlg({ k: 'export' })} disabled={dis} />
          <Btn icon="eye" label="Preview result" onClick={previewAll} disabled={dis} title="Open the combined PDF in a new tab" />
        </>}
        {tab === 'Document' && <>
          <Btn icon="info" label="Properties" onClick={() => setDlg({ k: 'meta' })} disabled={dis} /><Btn icon="sliders" label="Reduce size" onClick={() => setDlg({ k: 'export', compress: true })} disabled={dis} />
          <Btn icon="x" label="Close all" onClick={clearAll} disabled={dis} /><Btn icon="keyboard" label="Shortcuts" onClick={() => setDlg({ k: 'keys' })} />
        </>}
      </div>
      <div className="pdf-main">
        <aside className="pdf-side" aria-label="Files">
          <div className="fx-head">Files ({fileList.length})</div>
          <div className="pdf-files">{fileList.map((f) => <div key={f.id} className="pdf-file"><span className="pdf-dot" style={{ background: colorOf(f.id) }} /><span className="ellip" title={f.name}>{f.name}</span><small>{pages.filter((p) => p.fid === f.id).length}/{f.n}</small><button className="fb ico sm sub" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f.id)}><Icon name="x" size={12} /></button></div>)}
            {!fileList.length && <p className="muted pdf-small">No files yet.</p>}</div>
          <button className="fb block" onClick={addDialog}><Icon name="plus" size={14} />Add files</button>
          <div className="spacer" />
          <div className="pdf-sum">{hasPages && <><b>{totalPages}</b> page{totalPages > 1 ? 's' : ''}{sel.size > 0 && <> · <b>{sel.size}</b> selected</>}{outSize != null && <div>Last export: {fmtBytes(outSize)}</div>}</>}</div>
          {hasPages && <label className="pdf-zm">Thumbnail size<input type="range" min={110} max={300} value={zoom} onChange={(e) => setZoom(+e.target.value)} aria-label="Thumbnail size" /></label>}
        </aside>
        <main className={'pdf-canvas' + (dragOver ? ' over' : '')} onClick={(e) => { if (e.target === e.currentTarget) setSel(new Set()); }} onDragOver={(e) => { if (dragFrom.current) { e.preventDefault(); if (e.target === e.currentTarget) setDropAt(pages.length); } }} onDrop={dropItem}>
          {!hasPages ? (
            <div className="fx-empty pdf-empty"><div className="pdf-big"><Icon name="file" size={40} /></div><h3>Work with PDFs, privately</h3><p>Merge, split, reorder, rotate, annotate, sign, watermark and number pages. Everything happens in this browser tab — your files are never uploaded.</p>
              <div className="pdf-cta"><button className="fb pri lg" onClick={addDialog}><Icon name="plus" size={16} />Add PDF or image files</button><button className="fb lg" onClick={() => addBlank('A4')}>Start with a blank page</button></div><p className="muted pdf-small">…or drop files anywhere on this window.</p></div>
          ) : (
            <div className="pdf-grid" style={{ '--tw': `${zoom + 24}px` }}>
              {pages.map((p, i) => { const file = p.blank ? null : files.get(p.fid); return (
                <div key={p.id} className={'pdf-card' + (sel.has(p.id) ? ' sel' : '') + (dropAt === i ? ' dl' : '') + (dropAt === i + 1 && i === pages.length - 1 ? ' dr' : '')} draggable onDragStart={(e) => dragStart(e, p)} onDragEnd={() => { dragFrom.current = null; setDropAt(null); }} onDragOver={(e) => dragOverItem(e, i)} onDrop={dropItem}
                  onClick={(e) => click(e, p, i)} onDoubleClick={() => openEditor(i)} onContextMenu={(e) => ctxMenu(e, p, i)} role="button" tabIndex={0} aria-pressed={sel.has(p.id)} aria-label={`Page ${i + 1}`} onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); click(e, p, i); } }}>
                  <div className="pdf-thw" style={{ height: zoom * 1.3 }}><Thumb file={file} p={p} size={zoom} /></div>
                  <div className="pdf-cap"><span className="pdf-dot" style={{ background: p.blank ? '#999' : colorOf(p.fid) }} />{i + 1}{p.rot ? <small> · {p.rot}°</small> : null}</div>
                  <div className="pdf-hover"><button className="fb ico sm" aria-label={`Edit page ${i + 1}`} onClick={(e) => { e.stopPropagation(); openEditor(i); }}><Icon name="edit" size={13} /></button><button className="fb ico sm" aria-label={`Rotate page ${i + 1}`} onClick={(e) => { e.stopPropagation(); setP(pages.map((x) => (x.id === p.id ? { ...x, rot: (x.rot + 90) % 360 } : x)), true); }}><Icon name="rotate" size={13} /></button><button className="fb ico sm" aria-label={`Delete page ${i + 1}`} onClick={(e) => { e.stopPropagation(); setP(pages.filter((x) => x.id !== p.id)); }}><Icon name="trash" size={13} /></button></div>
                </div>); })}
              <div className="pdf-add" onClick={addDialog} role="button" tabIndex={0} aria-label="Add more files" onKeyDown={(e) => e.key === 'Enter' && addDialog()}><Icon name="plus" size={28} /><span>Add files</span></div>
            </div>
          )}
          {dragOver && <div className="pdf-drop"><Icon name="upload" size={34} /><b>Drop PDF or image files to add them</b></div>}
        </main>
      </div>
      {busy && <div className="pdf-busy" role="status"><div className="pdf-busy-box"><div className="pdf-spin" />{busy.label}{busy.pct != null && <div className="pdf-bar"><i style={{ width: `${Math.round(busy.pct * 100)}%` }} /></div>}</div></div>}
      {dlg && dlg.k === 'export' && <ExportDialog pages={pages} sel={sel} fileList={fileList} initial={dlg} onClose={() => setDlg(null)} onGo={exportPdf} />}
      {dlg && dlg.k === 'images' && <ImagesDialog sel={sel} onClose={() => setDlg(null)} onGo={toImages} />}
      {dlg && ['watermark', 'numbers', 'header', 'footer'].includes(dlg.k) && <StampDialog kind={dlg.k} value={settings[dlg.k]} onClose={() => setDlg(null)} onSave={(v) => { setSettings((s) => ({ ...s, [dlg.k]: v })); setDlg(null); toast(v.on ? 'Applied — it will be added when you export' : 'Turned off'); }} />}
      {dlg && dlg.k === 'crop' && <CropDialog value={settings.crop} onClose={() => setDlg(null)} onSave={(v) => { setSettings((s) => ({ ...s, crop: v })); setDlg(null); }} />}
      {dlg && dlg.k === 'meta' && <MetaDialog value={settings.meta} onClose={() => setDlg(null)} onSave={(v) => { setSettings((s) => ({ ...s, meta: v })); setDlg(null); toast('Properties updated'); }} />}
      {dlg && dlg.k === 'keys' && <Modal title="Keyboard shortcuts" onClose={() => setDlg(null)} footer={<button className="fb pri" onClick={() => setDlg(null)}>Close</button>}><div className="fx-kv">{[['Ctrl+O', 'Add files'], ['Ctrl+S', 'Export PDF'], ['Ctrl+A', 'Select all pages'], ['Shift / Ctrl + click', 'Select a range / several pages'], ['Delete', 'Delete selected pages'], ['[   ]', 'Rotate left / right'], ['Enter or double-click', 'Edit the page'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Drag a page', 'Reorder pages'], ['V T H R O L A P W I S', 'Editor tools']].map(([a, b]) => <><kbd className="pdf-kbd">{a}</kbd><span>{b}</span></>)}</div></Modal>}
      {editor !== null && pages[editor] && <Editor files={files} pages={pages} start={editor} onSave={saveEditor} onClose={() => setEditor(null)} sigs={sigs} onSigs={setSigs} toast={toast} />}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}

function ExportDialog({ pages, sel, fileList, initial, onClose, onGo }) {
  const [o, setO] = useState({ mode: initial.mode || 'merge', scope: 'all', range: '', name: fileList.length === 1 ? stem(fileList[0].name) : 'combined', split: 'each', every: 2, ranges: '', compress: !!initial.compress, quality: 'med' });
  const set = (p) => setO((x) => ({ ...x, ...p })); const n = o.scope === 'sel' ? sel.size : pages.length;
  return (
    <Modal title="Export PDF" onClose={onClose} width={520} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onGo(o)}><Icon name="download" size={14} />{o.mode === 'split' ? 'Split & download' : 'Save PDF'}</button></>}>
      <div className="fx-seg" role="group" aria-label="Export mode" style={{ marginBottom: 12 }}><button className={o.mode === 'merge' ? 'on' : ''} onClick={() => set({ mode: 'merge' })}>One PDF</button><button className={o.mode === 'split' ? 'on' : ''} onClick={() => set({ mode: 'split' })}>Split into several PDFs</button></div>
      <div className="fx-kv">
        <label>Pages</label><select className="fi" aria-label="Pages to export" value={o.scope} onChange={(e) => set({ scope: e.target.value })}><option value="all">All pages ({pages.length})</option>{sel.size > 0 && <option value="sel">Selected pages ({sel.size})</option>}<option value="range">A page range…</option></select>
        {o.scope === 'range' && <><label>Range</label><input className="fi" aria-label="Page range" placeholder="e.g. 1-3, 5, 8-" value={o.range} onChange={(e) => set({ range: e.target.value })} /></>}
        {o.mode === 'merge' ? <><label>File name</label><div className="pdf-row"><input className="fi" aria-label="File name" value={o.name} onChange={(e) => set({ name: e.target.value })} /><span>.pdf</span></div>
          <label>Size</label><div><label className="pdf-chk"><input type="checkbox" checked={o.compress} onChange={(e) => set({ compress: e.target.checked })} /> Reduce file size</label>{o.compress && <><select className="fi" aria-label="Quality" value={o.quality} onChange={(e) => set({ quality: e.target.value })} style={{ marginTop: 6 }}><option value="high">High quality (larger)</option><option value="med">Balanced</option><option value="low">Smallest</option></select><p className="muted pdf-small">Pages are converted to images, so text can no longer be selected or searched.</p></>}</div></>
          : <><label>Split</label><select className="fi" aria-label="Split method" value={o.split} onChange={(e) => set({ split: e.target.value })}><option value="each">One file per page</option><option value="every">Every N pages</option><option value="ranges">By custom ranges</option></select>
            {o.split === 'every' && <><label>Pages per file</label><input className="fi" type="number" min={1} aria-label="Pages per file" value={o.every} onChange={(e) => set({ every: e.target.value })} /></>}
            {o.split === 'ranges' && <><label>Ranges</label><input className="fi" aria-label="Split ranges" placeholder="1-3; 4-6; 7-" value={o.ranges} onChange={(e) => set({ ranges: e.target.value })} /></>}</>}
      </div>
      <p className="muted pdf-small" style={{ marginTop: 12 }}>{o.mode === 'split' ? 'Several files are saved together in one ZIP.' : `${n} page${n === 1 ? '' : 's'} will be saved with your rotations, edits, watermark and numbering.`}</p>
    </Modal>
  );
}
function ImagesDialog({ sel, onClose, onGo }) {
  const [o, setO] = useState({ scope: sel.size ? 'sel' : 'all', fmt: 'png', dpi: 150 });
  return <Modal title="Convert pages to images" onClose={onClose} width={460} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onGo(o)}>Convert</button></>}><div className="fx-kv">
    <label>Pages</label><select className="fi" aria-label="Pages" value={o.scope} onChange={(e) => setO({ ...o, scope: e.target.value })}><option value="all">All pages</option>{sel.size > 0 && <option value="sel">Selected pages ({sel.size})</option>}</select>
    <label>Format</label><select className="fi" aria-label="Image format" value={o.fmt} onChange={(e) => setO({ ...o, fmt: e.target.value })}><option value="png">PNG</option><option value="jpg">JPEG</option></select>
    <label>Resolution</label><select className="fi" aria-label="Resolution" value={o.dpi} onChange={(e) => setO({ ...o, dpi: +e.target.value })}><option value={72}>72 dpi (screen)</option><option value={150}>150 dpi</option><option value={200}>200 dpi</option><option value={300}>300 dpi (print)</option></select></div><p className="muted pdf-small" style={{ marginTop: 10 }}>Several images are saved together in a ZIP.</p></Modal>;
}
function StampDialog({ kind, value, onClose, onSave }) {
  const [v, setV] = useState({ ...value, on: true }); const set = (p) => setV((x) => ({ ...x, ...p }));
  const title = { watermark: 'Watermark', numbers: 'Page numbers', header: 'Header', footer: 'Footer' }[kind];
  return (
    <Modal title={title} onClose={onClose} width={500} footer={<>{value.on && <button className="fb danger" onClick={() => onSave({ ...value, on: false })}>Remove</button>}<span className="spacer" /><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onSave(v)}>Apply</button></>}>
      <div className="fx-kv">
        {kind === 'watermark' && <><label>Text</label><input className="fi" aria-label="Watermark text" value={v.text} onChange={(e) => set({ text: e.target.value })} /><label>Size</label><input className="fi" type="number" aria-label="Watermark size" min={8} max={300} value={v.size} onChange={(e) => set({ size: +e.target.value || 40 })} /><label>Angle</label><input type="range" min={-90} max={90} aria-label="Watermark angle" value={v.angle} onChange={(e) => set({ angle: +e.target.value })} /><label>Opacity</label><input type="range" min={0.05} max={1} step={0.05} aria-label="Watermark opacity" value={v.opacity} onChange={(e) => set({ opacity: +e.target.value })} /><label>Colour</label><input type="color" className="pdf-color" aria-label="Watermark colour" value={v.color} onChange={(e) => set({ color: e.target.value })} /><label>Pages</label><select className="fi" aria-label="Watermark pages" value={v.pages} onChange={(e) => set({ pages: e.target.value })}><option value="all">All pages</option><option value="odd">Odd pages</option><option value="even">Even pages</option></select></>}
        {kind === 'numbers' && <><label>Format</label><input className="fi" aria-label="Number format" value={v.format} onChange={(e) => set({ format: e.target.value })} /><label /><span className="muted pdf-small">Use {'{n}'} for the page number and {'{total}'} for the page count.</span><label>Position</label><div className="pdf-row"><select className="fi" aria-label="Vertical position" value={v.pos} onChange={(e) => set({ pos: e.target.value })}><option value="bottom">Bottom</option><option value="top">Top</option></select><select className="fi" aria-label="Alignment" value={v.align} onChange={(e) => set({ align: e.target.value })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></div><label>Font size</label><input className="fi" type="number" aria-label="Number size" min={6} max={40} value={v.size} onChange={(e) => set({ size: +e.target.value || 11 })} /><label>Start at page</label><input className="fi" type="number" aria-label="Start at page" min={1} value={v.start} onChange={(e) => set({ start: +e.target.value || 1 })} /><label /><label className="pdf-chk"><input type="checkbox" checked={v.skipFirst} onChange={(e) => set({ skipFirst: e.target.checked })} /> Skip the first page</label></>}
        {(kind === 'header' || kind === 'footer') && <><label>Left</label><input className="fi" aria-label={`${title} left`} value={v.left} onChange={(e) => set({ left: e.target.value })} /><label>Centre</label><input className="fi" aria-label={`${title} centre`} value={v.center} onChange={(e) => set({ center: e.target.value })} /><label>Right</label><input className="fi" aria-label={`${title} right`} value={v.right} onChange={(e) => set({ right: e.target.value })} /><label>Font size</label><input className="fi" type="number" aria-label={`${title} size`} min={6} max={40} value={v.size} onChange={(e) => set({ size: +e.target.value || 10 })} /><label /><span className="muted pdf-small">You can use {'{n}'}, {'{total}'} and {'{file}'}.</span></>}
      </div>
    </Modal>
  );
}
function CropDialog({ value, onClose, onSave }) {
  const [v, setV] = useState(value); const f = (k, l) => <><label>{l}</label><div className="pdf-row"><input className="fi" type="number" min={0} aria-label={`Crop ${l.toLowerCase()}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: Math.max(0, +e.target.value || 0) })} /><span>pt</span></div></>;
  return <Modal title="Crop margins" onClose={onClose} width={420} footer={<><button className="fb" onClick={() => onSave({ t: 0, r: 0, b: 0, l: 0 })}>Reset</button><span className="spacer" /><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onSave(v)}>Apply</button></>}><div className="fx-kv">{f('t', 'Top')}{f('r', 'Right')}{f('b', 'Bottom')}{f('l', 'Left')}</div><p className="muted pdf-small" style={{ marginTop: 10 }}>Trims the visible area of every page when you export (72 pt = 1 inch). The hidden content stays in the file.</p></Modal>;
}
function MetaDialog({ value, onClose, onSave }) {
  const [v, setV] = useState(value); const f = (k, l) => <><label>{l}</label><input className="fi" aria-label={l} value={v[k] || ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></>;
  return <Modal title="Document properties" onClose={onClose} width={460} footer={<><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onSave(v)}>Save</button></>}><div className="fx-kv">{f('title', 'Title')}{f('author', 'Author')}{f('subject', 'Subject')}{f('keywords', 'Keywords')}</div></Modal>;
}
