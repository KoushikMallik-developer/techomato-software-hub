import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AppChrome from '../components/AppChrome.jsx';
import Icon from '../components/Icon.jsx';
import { Btn, ColorBtn, Drop, MenuList, Sel, Sep, Stepper, useDismiss } from '../components/ui.jsx';
import { useDialog } from '../components/Dialogs.jsx';
import { useLibrary } from '../lib/useLibrary.js';
import { downloadFile, pickFile, readAsDataURL, readAsText, safeName } from '../lib/download.js';
import { saveBlob } from '../lib/office/util.js';
import {
  applyFontSize, blocksInRange, convertFontTags, cellOf, closestBlock, docStats, ensureBlocks, escapeHtml, getHeadings, makeTableHtml, sanitizeHtml, stripBlankText, tableOps,
  textBeforeCaret, tidyHtml, tocHtml, toTitleCase,
} from './docs/dom.js';
import { htmlToMarkdown, markdownToHtml } from './docs/md.js';
import { SYMBOL_GROUPS } from './docs/symbols.js';
import { DEFAULT_PAGE, DOC_TEMPLATES, PAGE_SIZES } from './docs/templates.js';
import { FONTS, buildHtmlDocument, fixDivs, getOffsets, pageDims, plainText, readFormat, restoreNodes, saveNodes, setOffsets, transformFragmentText } from './docs/editorUtils.js';
import FindBar from './docs/FindBar.jsx';
import '../styles/docs.css';

const blank = () => ({ html: '<p><br></p>', page: DEFAULT_PAGE, comments: [] });

const STYLE_OPTIONS = [
  ['p', 'Normal text'], ['title', 'Title'], ['subtitle', 'Subtitle'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'],
  ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['quote', 'Quote'], ['code', 'Code block'],
].map(([value, label]) => ({ value, label }));

const SHORTCUTS = [
  { group: 'Text', items: [['Ctrl + B', 'Bold'], ['Ctrl + I', 'Italic'], ['Ctrl + U', 'Underline'], ['Ctrl + Shift + X', 'Strikethrough'], ['Ctrl + .', 'Superscript'], ['Ctrl + ,', 'Subscript'], ['Ctrl + \\', 'Clear formatting'], ['Ctrl + K', 'Insert link']] },
  { group: 'Paragraph', items: [['Ctrl + Alt + 0', 'Normal text'], ['Ctrl + Alt + 1', 'Heading 1'], ['Ctrl + Alt + 2', 'Heading 2'], ['Ctrl + Alt + 3', 'Heading 3'], ['Ctrl + Shift + L', 'Align left'], ['Ctrl + Shift + E', 'Align centre'], ['Ctrl + Shift + R', 'Align right'], ['Ctrl + Shift + J', 'Justify'], ['Ctrl + Shift + 7', 'Numbered list'], ['Ctrl + Shift + 8', 'Bulleted list'], ['Ctrl + Shift + 9', 'Checklist'], ['Ctrl + ]', 'Increase indent'], ['Ctrl + [', 'Decrease indent']] },
  { group: 'Document', items: [['Ctrl + Z', 'Undo'], ['Ctrl + Y', 'Redo'], ['Ctrl + F', 'Find'], ['Ctrl + H', 'Find and replace'], ['Ctrl + S', 'Save a version'], ['Ctrl + P', 'Print'], ['Ctrl + Enter', 'Page break'], ['Ctrl + Alt + M', 'Add comment'], ['Ctrl + Shift + V', 'Paste without formatting']] },
  { group: 'Typing shortcuts', items: [['# + Space', 'Heading 1 (## = 2 ...)'], ['- + Space', 'Bulleted list'], ['1. + Space', 'Numbered list'], ['[] + Space', 'Checklist'], ['> + Space', 'Quote'], ['Tab', 'Next table cell / indent list']] },
];

const URL_RE = /^(https?:\/\/|mailto:|tel:|#)/i;
const normUrl = (u) => {
  const v = (u || '').trim();
  if (!v) return '';
  if (/^javascript:/i.test(v) || /^data:/i.test(v)) return '';
  if (URL_RE.test(v)) return v;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(v)) return 'mailto:' + v;
  return 'https://' + v;
};

async function downscale(dataUrl, type, maxW = 1600) {
  if (/svg|gif/.test(type)) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth <= maxW) { resolve(dataUrl); return; }
      const k = maxW / img.naturalWidth;
      const c = document.createElement('canvas');
      c.width = maxW;
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL(/jpe?g/.test(type) ? 'image/jpeg' : 'image/png', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function SymbolPicker({ onPick }) {
  const [g, setG] = useState(0);
  return (
    <div className="symbols">
      <div className="symtabs">
        {SYMBOL_GROUPS.map((x, i) => (
          <button key={x.name} type="button" className={'chip' + (i === g ? ' on' : '')} onClick={() => setG(i)}>{x.name}</button>
        ))}
      </div>
      <div className="symgrid">
        {SYMBOL_GROUPS[g].chars.map((c) => (
          <button key={c} type="button" onClick={() => onPick(c)} aria-label={'Insert ' + c}>{c}</button>
        ))}
      </div>
    </div>
  );
}

function TablePicker({ onPick, close }) {
  const [hover, setHover] = useState([0, 0]);
  const R = 8; const C = 8;
  return (
    <div className="tpicker">
      <div className="tgrid" onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: R * C }, (_, i) => {
          const r = Math.floor(i / C) + 1; const c = (i % C) + 1;
          return <button key={i} type="button" aria-label={`${r} by ${c} table`} className={r <= hover[0] && c <= hover[1] ? 'on' : ''} onMouseEnter={() => setHover([r, c])} onClick={() => { onPick(r, c); close(); }} />;
        })}
      </div>
      <div className="tlabel">{hover[0] ? `${hover[0]} x ${hover[1]}` : 'Insert table'}</div>
    </div>
  );
}

export default function DocsApp() {
  const lib = useLibrary('docs', blank);
  const dlg = useDialog();
  const { current, edit } = lib;
  const data = current.data;
  const page = useMemo(() => ({ ...DEFAULT_PAGE, ...(data.page || {}), margins: { ...DEFAULT_PAGE.margins, ...((data.page || {}).margins || {}) } }), [data.page]);
  const comments = data.comments || [];

  const editRef = useRef(null);
  const sheetRef = useRef(null);
  const scrollRef = useRef(null);
  const savedRange = useRef(null);
  const inRun = useRef(false);
  const plainNext = useRef(false);
  const pendingSize = useRef(0);
  const L = useRef(lib);
  L.current = lib;

  const [fmt, setFmt] = useState(null);
  const [selWords, setSelWords] = useState(0);
  const [version, setVersion] = useState(0);
  const [stats, setStats] = useState({ words: 0, chars: 0, pages: 1 });
  const [zoom, setZoom] = useState(() => { try { return Number(localStorage.getItem('techomato:docs:zoom')) || 100; } catch { return 100; } });
  const [panel, setPanel] = useState(null); // 'outline' | 'comments'
  const [find, setFind] = useState(null); // { replace, initial }
  const [painter, setPainter] = useState(null);
  const [pageless, setPageless] = useState(false);
  const [spell, setSpell] = useState(true);
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [selImg, setSelImg] = useState(null);
  const [linkEl, setLinkEl] = useState(null);
  const [boxes, setBoxes] = useState({});
  const [ctx, setCtx] = useState(null);
  const [outline, setOutline] = useState([]);

  /* ---------- keep the editor DOM in sync with the stored document ---------- */
  useLayoutEffect(() => {
    const el = editRef.current;
    if (!el) return;
    if (el.innerHTML !== data.html) {
      el.innerHTML = data.html;
      stripBlankText(el);
      if (data.sel && document.activeElement === el) setOffsets(el, data.sel);
    }
    setVersion((v) => v + 1);
    setSelImg(null);
  }, [current.id, data.html]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ }
  }, []);

  useEffect(() => { try { localStorage.setItem('techomato:docs:zoom', String(zoom)); } catch { /* ignore */ } }, [zoom]);

  /* ---------- selection tracking ---------- */
  const rafRef = useRef(0);
  const updateFmt = useCallback(() => {
    const el = editRef.current;
    if (!el) return;
    const f = readFormat(el);
    setFmt((prev) => (JSON.stringify(prev) === JSON.stringify(f) ? prev : f));
    const s = window.getSelection();
    if (f && s && s.anchorNode) {
      const a = (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('a');
      setLinkEl(a && el.contains(a) && s.isCollapsed ? a : null);
      const t = s.isCollapsed ? '' : s.toString().trim();
      setSelWords(t ? t.split(/\s+/).length : 0);
    } else {
      setLinkEl(null);
      setSelWords(0);
    }
  }, []);

  useEffect(() => {
    const h = () => {
      const el = editRef.current;
      const s = window.getSelection();
      if (el && s && s.rangeCount && el.contains(s.anchorNode) && el.contains(s.focusNode)) {
        savedRange.current = s.getRangeAt(0).cloneRange();
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(updateFmt);
      }
    };
    document.addEventListener('selectionchange', h);
    return () => document.removeEventListener('selectionchange', h);
  }, [updateFmt]);

  const restoreSel = () => {
    const el = editRef.current;
    const s = window.getSelection();
    if (document.activeElement !== el || !s.rangeCount || !el.contains(s.anchorNode)) {
      el.focus({ preventScroll: true });
      if (savedRange.current) {
        try { s.removeAllRanges(); s.addRange(savedRange.current); } catch { /* ignore */ }
      }
    }
  };

  const commit = useCallback((typing) => {
    const el = editRef.current;
    if (!el) return;
    const html = el.innerHTML;
    const sel = getOffsets(el);
    L.current.edit((d) => (d.html === html ? d : { ...d, html, sel }), typing ? { coalesce: 'type', coalesceMs: 1500 } : {});
    setVersion((v) => v + 1);
  }, []);

  /* Run a command against the editor, then record one undo step */
  const run = useCallback((fn) => {
    const el = editRef.current;
    if (!el) return undefined;
    inRun.current = true;
    let result;
    try {
      restoreSel();
      try { document.execCommand('styleWithCSS', false, true); } catch { /* ignore */ }
      result = fn(el);
      const keep = saveNodes();
      if (ensureBlocks(el) | fixDivs(el)) restoreNodes(el, keep);
    } finally {
      inRun.current = false;
    }
    commit(false);
    updateFmt();
    return result;
  }, [commit, updateFmt]);

  const cmd = (c, v) => run(() => document.execCommand(c, false, v));
  const range = () => { const s = window.getSelection(); return s.rangeCount ? s.getRangeAt(0) : null; };

  /* ---------- outline + stats (debounced) ---------- */
  useEffect(() => {
    const t = setTimeout(() => {
      const el = editRef.current;
      if (!el) return;
      const text = el.innerText || '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const hPx = pageDims(page).h * 96;
      const pages = Math.max(1, Math.ceil((el.parentElement.scrollHeight / (zoom / 100) - 2) / hPx));
      setStats({ words, chars: text.replace(/\n/g, '').length, pages });
      if (panel === 'outline') setOutline(getHeadings(el).map((h) => ({ level: h.level, text: h.text })));
    }, 250);
    return () => clearTimeout(t);
  }, [version, page, zoom, panel]);

  /* ---------- floating bars (image / link) ---------- */
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const cr = sc.getBoundingClientRect();
    const rel = (el) => {
      if (!el || !el.isConnected) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left - cr.left + sc.scrollLeft), top: Math.round(r.top - cr.top + sc.scrollTop), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const next = { img: rel(selImg), link: rel(linkEl) };
    setBoxes((b) => (JSON.stringify(b) === JSON.stringify(next) ? b : next));
  });

  /* ---------- importing / inserting ---------- */
  const insertHtml = (html) => run(() => document.execCommand('insertHTML', false, html));
  const insertText = (t) => run(() => document.execCommand('insertText', false, t));
  const contentWidthPx = () => Math.round((pageDims(page).w - page.margins.l - page.margins.r) * 96);

  const insertImageSrc = async (src, name = '') => {
    const size = await new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([300, 200]); i.src = src; });
    const w = Math.min(size[0] || 300, contentWidthPx(), 640);
    insertHtml(`<img src="${src}" alt="${escapeHtml(name)}" style="width:${w}px">`);
  };

  const insertImageFile = async (f) => {
    if (!f || !/^image\//.test(f.type)) return;
    const raw = await readAsDataURL(f);
    await insertImageSrc(await downscale(raw, f.type), f.name.replace(/\.[^.]+$/, ''));
  };

  const pickImage = async () => { const f = await pickFile('image/*'); if (f) { restoreSel(); await insertImageFile(f); } };

  const imageFromUrl = async () => {
    const r = await dlg.form({ title: 'Image from web address', okText: 'Insert', fields: [{ name: 'url', label: 'Image address', type: 'text', placeholder: 'https://...' }, { name: 'alt', label: 'Description (alt text)', type: 'text' }],
      validate: (v) => (/^https?:\/\//i.test(v.url.trim()) ? '' : 'Enter an address that starts with https://') });
    if (!r) return;
    restoreSel();
    insertHtml(`<img src="${escapeHtml(r.url.trim())}" alt="${escapeHtml(r.alt)}" style="width:${Math.min(480, contentWidthPx())}px">`);
  };

  const insertTable = (rows, cols, header = true) => {
    const html = makeTableHtml(rows, cols, header).replace(/<(td|th)>/, '<$1 data-new="1">');
    run((el) => {
      document.execCommand('insertHTML', false, html);
      const first = el.querySelector('[data-new]');
      if (first) {
        first.removeAttribute('data-new');
        const r = document.createRange();
        r.selectNodeContents(first);
        r.collapse(true);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
    });
  };

  const tableDialog = async () => {
    const r = await dlg.form({ title: 'Insert table', okText: 'Insert', fields: [
      { name: 'rows', label: 'Rows', type: 'number', value: 3, min: 1, max: 100 }, { name: 'cols', label: 'Columns', type: 'number', value: 3, min: 1, max: 20 },
      { name: 'header', label: 'First row is a header', type: 'checkbox', value: true }],
    validate: (v) => (v.rows >= 1 && v.rows <= 100 && v.cols >= 1 && v.cols <= 20 ? '' : 'Use 1-100 rows and 1-20 columns') });
    if (r) insertTable(r.rows, r.cols, r.header);
  };

  const linkDialog = async () => {
    const el = editRef.current;
    restoreSel();
    const f = readFormat(el);
    const s = window.getSelection();
    const r0 = range();
    const saved = r0 ? r0.cloneRange() : null;
    const aEl = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('a');
    const collapsed = s.isCollapsed;
    const res = await dlg.form({
      title: aEl ? 'Edit link' : 'Insert link', okText: 'Apply',
      fields: [
        { name: 'url', label: 'Web address', type: 'text', value: f && f.link ? f.link : 'https://', hint: aEl ? 'Clear the address to remove the link.' : undefined },
        ...(collapsed && !aEl ? [{ name: 'text', label: 'Text to display', type: 'text' }] : []),
      ],
    });
    if (!res) return;
    el.focus();
    if (saved) { s.removeAllRanges(); s.addRange(saved); }
    const url = normUrl(res.url === 'https://' ? '' : res.url);
    run(() => {
      if (aEl && aEl.isConnected) {
        const r = document.createRange();
        r.selectNodeContents(aEl);
        s.removeAllRanges();
        s.addRange(r);
        if (!url) document.execCommand('unlink'); else aEl.setAttribute('href', url);
        return;
      }
      if (!url) return;
      if (collapsed) document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(res.text || url)}</a>`);
      else document.execCommand('createLink', false, url);
    });
  };

  const insertSymbols = () => dlg.custom(({ close }) => <SymbolPicker onPick={(c) => { close(); setTimeout(() => insertText(c), 0); }} />, { title: 'Special characters', width: 560 });

  const insertDate = (kind) => {
    const d = new Date();
    const t = kind === 'long' ? d.toLocaleDateString([], { dateStyle: 'long' }) : kind === 'short' ? d.toLocaleDateString() : kind === 'iso' ? d.toISOString().slice(0, 10) : kind === 'time' ? d.toLocaleTimeString([], { timeStyle: 'short' }) : d.toLocaleString();
    insertText(t);
  };

  const insertToc = () => run((el) => {
    // replace an existing table of contents, or add one at the caret
    const old = el.querySelector('.toc-title');
    const html = tocHtml(el);
    if (old) {
      let n = old.nextElementSibling;
      while (n && n.classList.contains('toc-item')) { const nx = n.nextElementSibling; n.remove(); n = nx; }
      const holder = document.createElement('div');
      holder.innerHTML = html;
      old.replaceWith(...Array.from(holder.childNodes));
      return;
    }
    document.execCommand('insertHTML', false, html);
  });

  /* ---------- formatting ---------- */
  const applyStyle = (v) => run((el) => {
    const tag = { p: 'p', title: 'p', subtitle: 'p', quote: 'blockquote', code: 'pre' }[v] || v;
    const cur = readFormat(el);
    document.execCommand('formatBlock', false, cur && cur.style === v && v === 'quote' ? 'p' : tag);
    const r = range();
    blocksInRange(el, r).forEach((b) => {
      b.classList.remove('doc-title', 'doc-subtitle');
      if (v === 'title') b.classList.add('doc-title');
      if (v === 'subtitle') b.classList.add('doc-subtitle');
      if (!b.getAttribute('class')) b.removeAttribute('class');
    });
  });

  const setSize = (pt) => run((el) => {
    applyFontSize(el, pt);
    const s = window.getSelection();
    pendingSize.current = s.isCollapsed ? pt : 0; // a size chosen with no selection applies to what is typed next
  });
  const bumpSize = (d) => setSize(Math.max(6, Math.min(200, (fmt ? fmt.size : 11) + d)));

  const setBlockStyle = (fn) => run((el) => { blocksInRange(el, range()).forEach(fn); });
  const lineSpacing = (v) => setBlockStyle((b) => { b.style.lineHeight = v; });
  const paraSpace = (side, px) => setBlockStyle((b) => { if (px === null) b.style.removeProperty(side); else b.style[side] = px + 'px'; });

  const indent = (dir) => run((el) => {
    const f = readFormat(el);
    if (f && f.list) { document.execCommand(dir > 0 ? 'indent' : 'outdent'); return; }
    blocksInRange(el, range()).forEach((b) => {
      const cur = parseFloat(b.style.marginLeft) || 0;
      const nxt = Math.max(0, cur + dir * 48);
      if (nxt) b.style.marginLeft = nxt + 'px'; else b.style.removeProperty('margin-left');
    });
  });

  const toggleList = (kind) => run((el) => {
    const cur = (readFormat(el) || {}).list;
    const unCheck = () => {
      blocksInRange(el, range()).forEach((li) => {
        const ul = li.closest('ul.checklist');
        if (ul) { ul.classList.remove('checklist'); ul.querySelectorAll('li').forEach((x) => x.removeAttribute('data-done')); if (!ul.getAttribute('class')) ul.removeAttribute('class'); }
      });
    };
    if (kind === 'check') {
      if (cur === 'check') { document.execCommand('insertUnorderedList'); return; }
      if (cur === 'ol') document.execCommand('insertOrderedList');
      if (cur !== 'ul') document.execCommand('insertUnorderedList');
      blocksInRange(el, range()).forEach((li) => {
        const ul = li.closest('ul');
        if (ul) { ul.classList.add('checklist'); ul.querySelectorAll('li').forEach((x) => { if (!x.hasAttribute('data-done')) x.setAttribute('data-done', 'false'); }); }
      });
      return;
    }
    if (cur === 'check') { unCheck(); if (kind === 'ol') document.execCommand('insertOrderedList'); return; }
    document.execCommand(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
  });

  const numberStyle = (t) => run((el) => {
    blocksInRange(el, range()).forEach((li) => { const ol = li.closest('ol'); if (ol) ol.style.listStyleType = t; });
  });

  const clearFormat = () => run((el) => {
    document.execCommand('removeFormat');
    blocksInRange(el, range()).forEach((b) => {
      ['text-align', 'line-height', 'margin-left', 'text-indent', 'margin-top', 'margin-bottom'].forEach((p) => b.style.removeProperty(p));
      b.querySelectorAll('span').forEach((sp) => { if (!sp.getAttribute('style')) sp.replaceWith(...Array.from(sp.childNodes)); });
      if (!b.getAttribute('style')) b.removeAttribute('style');
    });
  });

  const changeCase = (kind) => run(() => {
    const r = range();
    if (!r || r.collapsed) return;
    const div = document.createElement('div');
    div.appendChild(r.cloneContents());
    const fn = kind === 'upper' ? (t) => t.toUpperCase() : kind === 'lower' ? (t) => t.toLowerCase() : kind === 'sentence' ? (t) => t.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()) : toTitleCase;
    document.execCommand('insertHTML', false, transformFragmentText(div.innerHTML, fn));
  });

  const setDir = (rtl) => setBlockStyle((b) => { if (rtl) b.setAttribute('dir', 'rtl'); else b.removeAttribute('dir'); });

  const insertPageBreak = () => insertHtml('<hr class="page-break"><p><br></p>');

  const startPainter = () => {
    if (painter) { setPainter(null); return; }
    if (!fmt) return;
    setPainter({ bold: fmt.bold, italic: fmt.italic, underline: fmt.underline, strike: fmt.strike, color: fmt.color, bg: fmt.bg, size: fmt.size, font: fmt.font });
    dlg.toast('Format copied - select text to apply it');
  };
  const applyPainter = () => {
    if (!painter) return;
    const s = window.getSelection();
    if (!s.rangeCount || s.isCollapsed) return;
    const p = painter;
    setPainter(null);
    run((el) => {
      document.execCommand('removeFormat');
      if (p.bold) document.execCommand('bold');
      if (p.italic) document.execCommand('italic');
      if (p.underline) document.execCommand('underline');
      if (p.strike) document.execCommand('strikeThrough');
      document.execCommand('foreColor', false, p.color);
      if (p.bg) document.execCommand('hiliteColor', false, p.bg);
      if (p.font) document.execCommand('fontName', false, p.font);
      applyFontSize(el, p.size);
    });
  };

  /* ---------- images ---------- */
  const imgChange = (fn) => { if (!selImg) return; fn(selImg); commit(false); };
  const imgWidth = (frac) => imgChange((im) => { im.style.width = Math.round(contentWidthPx() * frac) + 'px'; im.style.removeProperty('height'); });
  const imgAlign = (a) => imgChange((im) => {
    im.style.removeProperty('float'); im.style.removeProperty('margin-left'); im.style.removeProperty('margin-right');
    const p = im.closest('p,li,td,th,h1,h2,h3,h4,h5,h6');
    if (a === 'wrapL') { im.style.float = 'left'; im.style.marginRight = '12px'; }
    else if (a === 'wrapR') { im.style.float = 'right'; im.style.marginLeft = '12px'; }
    else if (p) p.style.textAlign = a;
  });
  const imgAlt = async () => {
    if (!selImg) return;
    const r = await dlg.prompt({ title: 'Alt text', label: 'Describe this image for screen readers', value: selImg.getAttribute('alt') || '' });
    if (r !== null && selImg) { selImg.setAttribute('alt', r); commit(false); }
  };
  const imgDelete = () => { if (selImg) { selImg.remove(); setSelImg(null); ensureBlocks(editRef.current); commit(false); } };
  const imgReplace = async () => {
    const f = await pickFile('image/*');
    if (!f || !selImg) return;
    selImg.src = await downscale(await readAsDataURL(f), f.type);
    commit(false);
  };
  const dragHandle = (e) => {
    if (!selImg) return;
    e.preventDefault();
    const im = selImg;
    const startX = e.clientX;
    const startW = im.getBoundingClientRect().width / (zoom / 100);
    const move = (ev) => {
      const w = Math.max(24, Math.min(contentWidthPx(), startW + (ev.clientX - startX) / (zoom / 100)));
      im.style.width = Math.round(w) + 'px';
      im.style.removeProperty('height');
      setVersion((v) => v + 1);
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); commit(false); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  /* ---------- tables ---------- */
  const withCell = (fn) => run((el) => {
    const s = window.getSelection();
    const td = cellOf(s.anchorNode, el);
    if (!td) return;
    const ok = fn(td);
    if (ok === false) dlg.toast('Nothing to merge there');
  });
  const tbl = {
    rowAbove: () => withCell((td) => tableOps.insertRow(td, false)),
    rowBelow: () => withCell((td) => tableOps.insertRow(td, true)),
    colLeft: () => withCell((td) => tableOps.insertCol(td, false)),
    colRight: () => withCell((td) => tableOps.insertCol(td, true)),
    delRow: () => withCell((td) => tableOps.deleteRow(td)),
    delCol: () => withCell((td) => tableOps.deleteCol(td)),
    delTable: () => withCell((td) => tableOps.deleteTable(td)),
    mergeRight: () => withCell((td) => tableOps.mergeRight(td)),
    mergeDown: () => withCell((td) => tableOps.mergeDown(td)),
    split: () => withCell((td) => tableOps.split(td)),
    header: () => withCell((td) => tableOps.toggleHeader(td)),
    bg: (c) => withCell((td) => tableOps.setBg(td, c)),
    borders: (m) => withCell((td) => tableOps.setBorders(td, m)),
    valign: (v) => withCell((td) => tableOps.setVAlign(td, v)),
    colWidth: async () => {
      const s = window.getSelection();
      const td = cellOf(s.anchorNode, editRef.current);
      if (!td) return;
      const r = await dlg.prompt({ title: 'Column width', label: 'Width in pixels (empty = automatic)', value: td.style.width ? String(parseInt(td.style.width, 10)) : '' });
      if (r === null) return;
      const idx = Array.from(td.parentElement.children).indexOf(td);
      const px = parseInt(r, 10);
      run(() => Array.from(td.closest('table').rows).forEach((tr) => {
        const c = tr.children[idx];
        if (!c) return;
        if (px > 10) c.style.width = px + 'px'; else c.style.removeProperty('width');
      }));
    },
    sortCol: (dir) => withCell((td) => {
      const idx = Array.from(td.parentElement.children).indexOf(td);
      const table = td.closest('table');
      const rows = Array.from(table.rows);
      const hasHeader = rows[0] && rows[0].children[0] && rows[0].children[0].tagName === 'TH';
      const body = hasHeader ? rows.slice(1) : rows;
      const val = (r) => (r.children[idx] ? r.children[idx].textContent.trim() : '');
      const numOf = (r) => Number(val(r).replace(/[,$%\s]/g, ''));
      const num = body.every((r) => val(r) === '' || !Number.isNaN(numOf(r)));
      body.sort((a, b) => (num ? numOf(a) - numOf(b) : val(a).localeCompare(val(b), undefined, { numeric: true })) * dir);
      const tb = body[0] ? body[0].parentElement : table.tBodies[0];
      body.forEach((r) => tb.appendChild(r));
    }),
  };

  const moveCell = (dir) => {
    const el = editRef.current;
    const s = window.getSelection();
    const td = cellOf(s.anchorNode, el);
    if (!td) return;
    let cells = Array.from(td.closest('table').querySelectorAll('td,th'));
    let i = cells.indexOf(td) + dir;
    if (i >= cells.length) {
      tableOps.insertRow(td.parentElement.lastElementChild, true);
      cells = Array.from(td.closest('table').querySelectorAll('td,th'));
      commit(false);
    }
    if (i < 0) return;
    const r = document.createRange();
    r.selectNodeContents(cells[i]);
    r.collapse(true);
    s.removeAllRanges();
    s.addRange(r);
  };

  /* ---------- comments ---------- */
  const addComment = async () => {
    const el = editRef.current;
    restoreSel();
    const r = range();
    if (!r || r.collapsed) { dlg.toast('Select some text to comment on first'); return; }
    // A triple-click selects up to the start of the next paragraph; pull the end back into the first one
    let b1 = closestBlock(r.startContainer, el); let b2 = closestBlock(r.endContainer, el);
    const atStartOfB2 = () => { const pre = document.createRange(); pre.selectNodeContents(b2); pre.setEnd(r.endContainer, r.endOffset); return pre.toString() === ''; };
    if (b1 && b2 && b1 !== b2 && atStartOfB2()) {
      const w = document.createTreeWalker(b1, NodeFilter.SHOW_TEXT);
      let last = null; let n;
      while ((n = w.nextNode())) last = n;
      if (last) { r.setEnd(last, last.nodeValue.length); b2 = closestBlock(r.endContainer, el); }
    }
    if (!b1 || b1 !== b2) { dlg.toast('Select text within a single paragraph'); return; }
    const quote = r.toString().slice(0, 120);
    const saved = r.cloneRange();
    const text = await dlg.prompt({ title: 'Add comment', label: 'Comment', multiline: true, okText: 'Comment', validate: (v) => (v.trim() ? '' : 'Write a comment first') });
    if (text === null) return;
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    el.focus();
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(saved);
    const span = document.createElement('span');
    span.className = 'cmt';
    span.setAttribute('data-cid', id);
    span.appendChild(saved.extractContents());
    saved.insertNode(span);
    const html = el.innerHTML;
    edit((d) => ({ ...d, html, comments: [...(d.comments || []), { id, text: text.trim(), quote, t: Date.now(), resolved: false }] }));
    setPanel('comments');
  };
  const unwrapComment = (id) => {
    editRef.current.querySelectorAll(`[data-cid="${id}"]`).forEach((sp) => sp.replaceWith(...Array.from(sp.childNodes)));
  };
  const resolveComment = (id) => { unwrapComment(id); const html = editRef.current.innerHTML; edit((d) => ({ ...d, html, comments: d.comments.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)) })); };
  const deleteComment = (id) => { unwrapComment(id); const html = editRef.current.innerHTML; edit((d) => ({ ...d, html, comments: d.comments.filter((c) => c.id !== id) })); };
  const gotoComment = (id) => {
    const sp = editRef.current.querySelector(`[data-cid="${id}"]`);
    if (sp) { sp.scrollIntoView({ block: 'center' }); sp.classList.add('flash'); setTimeout(() => sp.classList.remove('flash'), 1200); }
  };

  /* ---------- page setup, stats ---------- */
  const setPage = (patch) => edit((d) => ({ ...d, page: { ...DEFAULT_PAGE, ...(d.page || {}), ...patch } }));
  const pageSetup = async () => {
    const m = page.margins;
    const r = await dlg.form({
      title: 'Page setup', width: 460, okText: 'Apply',
      fields: [
        { name: 'size', label: 'Paper size', type: 'select', value: PAGE_SIZES[page.size] ? page.size : 'letter', options: Object.entries(PAGE_SIZES).map(([value, v]) => ({ value, label: v.label })) },
        { name: 'orient', label: 'Orientation', type: 'select', value: page.orient, options: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] },
        { name: 't', label: 'Top margin (in)', type: 'number', value: m.t, step: 0.1, min: 0, max: 4 },
        { name: 'b', label: 'Bottom margin (in)', type: 'number', value: m.b, step: 0.1, min: 0, max: 4 },
        { name: 'l', label: 'Left margin (in)', type: 'number', value: m.l, step: 0.1, min: 0, max: 4 },
        { name: 'r', label: 'Right margin (in)', type: 'number', value: m.r, step: 0.1, min: 0, max: 4 },
        { name: 'cols', label: 'Columns', type: 'select', value: String(page.cols), options: ['1', '2', '3'] },
        { name: 'bg', label: 'Page colour', type: 'color', value: page.bg || '#ffffff' },
        { name: 'header', label: 'Header text', type: 'text', value: page.header },
        { name: 'footer', label: 'Footer text', type: 'text', value: page.footer },
        { name: 'numbers', label: 'Page numbers', type: 'select', value: page.numbers, options: [{ value: 'none', label: 'None' }, { value: 'bottom-center', label: 'Bottom centre' }, { value: 'bottom-right', label: 'Bottom right' }, { value: 'top-right', label: 'Top right' }, { value: 'top-center', label: 'Top centre' }] },
      ],
      validate: (v) => (['t', 'b', 'l', 'r'].every((k) => v[k] !== '' && v[k] >= 0) ? '' : 'Margins must be zero or more'),
    });
    if (!r) return;
    setPage({ size: r.size, orient: r.orient, cols: Number(r.cols), bg: r.bg, header: r.header, footer: r.footer, numbers: r.numbers, margins: { t: r.t, r: r.r, b: r.b, l: r.l } });
  };

  const showStats = () => {
    const el = editRef.current;
    const st = docStats(plainText(el));
    const s = window.getSelection();
    const sel = s && !s.isCollapsed && el.contains(s.anchorNode) ? docStats(s.toString()) : null;
    dlg.custom(() => (
      <table className="statstable">
        <thead><tr><th /><th>Document</th>{sel && <th>Selection</th>}</tr></thead>
        <tbody>
          {[['Words', 'words'], ['Characters', 'chars'], ['Characters (no spaces)', 'charsNoSpace'], ['Sentences', 'sentences'], ['Paragraphs', 'paragraphs'], ['Reading time (min)', 'minutes']].map(([l, k]) => (
            <tr key={k}><th>{l}</th><td>{st[k]}</td>{sel && <td>{sel[k]}</td>}</tr>
          ))}
          <tr><th>Pages (approx.)</th><td>{stats.pages}</td>{sel && <td />}</tr>
        </tbody>
      </table>
    ), { title: 'Word count', width: 420 });
  };

  /* ---------- tools: voice, read aloud ---------- */
  const recRef = useRef(null);
  const toggleVoice = () => {
    if (voice && recRef.current) { recRef.current.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { dlg.alert('Voice typing is not supported in this browser. Try Chrome or Edge.', 'Voice typing'); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) insertText(e.results[i][0].transcript.trim() + ' ');
    };
    rec.onend = () => setVoice(false);
    rec.onerror = () => setVoice(false);
    try { rec.start(); recRef.current = rec; setVoice(true); } catch { setVoice(false); }
  };
  const readAloud = () => {
    const ss = window.speechSynthesis;
    if (!ss) { dlg.alert('Read aloud is not supported in this browser.', 'Read aloud'); return; }
    if (speaking) { ss.cancel(); setSpeaking(false); return; }
    const s = window.getSelection();
    const t = s && !s.isCollapsed ? s.toString() : editRef.current.innerText;
    if (!t.trim()) return;
    const u = new SpeechSynthesisUtterance(t);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    ss.speak(u);
  };
  useEffect(() => () => { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); if (recRef.current) recRef.current.stop(); } catch { /* ignore */ } }, []);

  /* ---------- import / export ---------- */
  const importFile = useCallback(async (file) => {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const title = file.name.replace(/\.[^.]+$/, '');
    try {
      let doc;
      if (ext === 'docx') {
        const { importDocx } = await import('../lib/office/docxImport.js');
        const r = await importDocx(await file.arrayBuffer());
        doc = { html: tidyHtml(sanitizeHtml(r.html)) || '<p><br></p>', page: r.page, comments: [], t: r.title || title };
      } else if (ext === 'md' || ext === 'markdown') {
        doc = { html: tidyHtml(sanitizeHtml(markdownToHtml(await readAsText(file)))) || '<p><br></p>', page: DEFAULT_PAGE, comments: [], t: title };
      } else if (ext === 'html' || ext === 'htm') {
        doc = { html: tidyHtml(sanitizeHtml(await readAsText(file))) || '<p><br></p>', page: DEFAULT_PAGE, comments: [], t: title };
      } else if (ext === 'txt' || ext === 'csv' || ext === 'log' || file.type.startsWith('text/')) {
        const txt = await readAsText(file);
        doc = { html: txt.split(/\r?\n/).map((l) => `<p>${escapeHtml(l) || '<br>'}</p>`).join(''), page: DEFAULT_PAGE, comments: [], t: title };
      } else {
        dlg.alert('Docs can open .docx, .md, .html and .txt files. Old .doc files need to be saved as .docx first.', 'Unsupported file');
        return;
      }
      const { t, ...d } = doc;
      L.current.create(d, t);
      dlg.toast(`Opened "${t}"`);
    } catch (err) {
      dlg.alert(`That file could not be opened: ${err.message || err}`, 'Import failed');
    }
  }, [dlg]);

  const doImport = async () => { const f = await pickFile('.docx,.md,.markdown,.html,.htm,.txt'); if (f) importFile(f); };

  const exportAs = async (kind) => {
    const el = editRef.current;
    const base = safeName(current.title);
    try {
      if (kind === 'docx') {
        const { exportDocx } = await import('../lib/office/docxExport.js');
        saveBlob(await exportDocx(el, { title: current.title || 'Document', page }), base + '.docx');
      } else if (kind === 'html') downloadFile(base + '.html', buildHtmlDocument(current.title || 'Document', el.innerHTML, page), 'text/html');
      else if (kind === 'md') downloadFile(base + '.md', htmlToMarkdown(el), 'text/markdown');
      else downloadFile(base + '.txt', plainText(el), 'text/plain');
      dlg.toast(`Downloaded ${base}.${kind}`);
    } catch (err) {
      dlg.alert(`The file could not be created: ${err.message || err}`, 'Export failed');
    }
  };

  const doPrint = () => { try { window.print(); } catch { dlg.alert('Printing is not available here.', 'Print'); } };

  /* ---------- clipboard ---------- */
  const doCopy = (cut) => { restoreSel(); try { document.execCommand(cut ? 'cut' : 'copy'); } catch { /* ignore */ } if (cut) commit(false); };
  const pasteText = (t) => {
    const lines = t.replace(/\r/g, '').split('\n');
    if (lines.length === 1) insertText(t);
    else insertHtml(lines.map((l) => `<p>${escapeHtml(l) || '<br>'}</p>`).join(''));
  };
  const doPaste = async (plain) => {
    restoreSel();
    try {
      if (!plain && navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          if (it.types.includes('text/html')) { insertHtml(sanitizeHtml(await (await it.getType('text/html')).text())); return; }
        }
      }
      pasteText(await navigator.clipboard.readText());
    } catch {
      dlg.toast('Your browser blocks menu paste - press Ctrl+V' + (plain ? '+Shift' : ''));
    }
  };

  const onPaste = (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    e.preventDefault();
    const files = Array.from(cd.files || []).filter((f) => /^image\//.test(f.type));
    if (files.length) { files.forEach(insertImageFile); return; }
    const html = cd.getData('text/html');
    const text = cd.getData('text/plain');
    if (plainNext.current || !html) { plainNext.current = false; pasteText(text); return; }
    insertHtml(sanitizeHtml(html));
  };

  const onDrop = (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    e.preventDefault();
    const imgs = files.filter((f) => /^image\//.test(f.type));
    if (imgs.length) {
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (r) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); savedRange.current = r.cloneRange(); }
      imgs.forEach(insertImageFile);
    } else importFile(files[0]);
  };

  /* ---------- input + keyboard ---------- */
  const onInput = (e) => {
    if (inRun.current) return;
    const el = editRef.current;
    const keep = saveNodes();
    if (pendingSize.current) {
      convertFontTags(el, pendingSize.current);
      if (!el.querySelector('font[size="7"],span[style*="xxx-large"]')) pendingSize.current = 0;
    }
    if (ensureBlocks(el) | fixDivs(el)) restoreNodes(el, keep);
    if (e.nativeEvent && e.nativeEvent.inputType === 'insertParagraph') {
      const s = window.getSelection();
      const li = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('li');
      if (li && li.parentElement.classList.contains('checklist')) li.setAttribute('data-done', 'false');
    }
    commit(true);
    updateFmt();
  };

  const onBeforeInput = (e) => {
    if (e.nativeEvent.inputType === 'historyUndo') { e.preventDefault(); L.current.undo(); }
    if (e.nativeEvent.inputType === 'historyRedo') { e.preventDefault(); L.current.redo(); }
  };

  const mdShortcut = () => {
    const el = editRef.current;
    const s = window.getSelection();
    if (!s.rangeCount || !s.isCollapsed) return false;
    const block = closestBlock(s.anchorNode, el);
    if (!block || block.tagName !== 'P') return false;
    const r = s.getRangeAt(0);
    const before = textBeforeCaret(block, r).toString();
    let m;
    let action = null;
    if ((m = /^(#{1,6})$/.exec(before))) action = () => document.execCommand('formatBlock', false, 'h' + m[1].length);
    else if (/^[-*+]$/.test(before)) action = () => document.execCommand('insertUnorderedList');
    else if (/^\d{1,3}[.)]$/.test(before)) action = () => document.execCommand('insertOrderedList');
    else if (/^\[\s?\]$/.test(before)) {
      action = () => {
        document.execCommand('insertUnorderedList');
        const li = closestBlock(window.getSelection().anchorNode, el);
        const ul = li && li.closest('ul');
        if (ul) { ul.classList.add('checklist'); li.setAttribute('data-done', 'false'); }
      };
    } else if (before === '>') action = () => document.execCommand('formatBlock', false, 'blockquote');
    if (!action) return false;
    run(() => {
      textBeforeCaret(block, r).deleteContents();
      if (!block.firstChild || (block.childNodes.length === 1 && block.firstChild.nodeType === 3 && !block.firstChild.nodeValue)) block.innerHTML = '<br>';
      const nr = document.createRange();
      nr.selectNodeContents(block);
      nr.collapse(true);
      s.removeAllRanges();
      s.addRange(nr);
      action();
    });
    return true;
  };

  const selText = () => { const s = window.getSelection(); return s && !s.isCollapsed && editRef.current.contains(s.anchorNode) && s.toString().length < 80 ? s.toString() : ''; };

  const onKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    setCtx(null);
    if (/^(Arrow|Home|End|Page)/.test(e.key)) pendingSize.current = 0;
    if (selImg && !mod && e.key.length === 1) setSelImg(null);
    if (selImg && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); imgDelete(); return; }
    if (mod && !e.altKey && k === 'z' && !e.shiftKey) { e.preventDefault(); L.current.undo(); return; }
    if (mod && !e.altKey && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); L.current.redo(); return; }
    if (mod && e.shiftKey && k === 'v') { plainNext.current = true; return; }
    if (mod && k === 'k') { e.preventDefault(); linkDialog(); return; }
    if (mod && k === 'f') { e.preventDefault(); setFind({ replace: false, initial: selText() }); return; }
    if (mod && k === 'h') { e.preventDefault(); setFind({ replace: true, initial: selText() }); return; }
    if (mod && k === 's') { e.preventDefault(); L.current.snapshot(''); dlg.toast('Version saved'); return; }
    if (mod && k === 'p') { e.preventDefault(); doPrint(); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); insertPageBreak(); return; }
    if (mod && e.shiftKey && k === 'x') { e.preventDefault(); cmd('strikeThrough'); return; }
    if (mod && e.key === '.') { e.preventDefault(); cmd('superscript'); return; }
    if (mod && e.key === ',') { e.preventDefault(); cmd('subscript'); return; }
    if (mod && e.key === '\\') { e.preventDefault(); clearFormat(); return; }
    if (mod && e.key === ']') { e.preventDefault(); indent(1); return; }
    if (mod && e.key === '[') { e.preventDefault(); indent(-1); return; }
    if (mod && e.shiftKey && ['l', 'e', 'r', 'j'].includes(k)) { e.preventDefault(); cmd({ l: 'justifyLeft', e: 'justifyCenter', r: 'justifyRight', j: 'justifyFull' }[k]); return; }
    if (mod && e.shiftKey && ['7', '8', '9', '&', '*', '('].includes(e.key)) { e.preventDefault(); toggleList({ 7: 'ol', 8: 'ul', 9: 'check', '&': 'ol', '*': 'ul', '(': 'check' }[e.key]); return; }
    if (mod && e.altKey && /^[0-6]$/.test(e.key)) { e.preventDefault(); applyStyle(e.key === '0' ? 'p' : 'h' + e.key); return; }
    if (mod && e.altKey && k === 'm') { e.preventDefault(); addComment(); return; }
    if (e.key === ' ' && !mod && !e.altKey && mdShortcut()) { e.preventDefault(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const f = readFormat(editRef.current);
      if (f && f.inTable) moveCell(e.shiftKey ? -1 : 1);
      else if (f && f.list) run(() => document.execCommand(e.shiftKey ? 'outdent' : 'indent'));
      else if (e.shiftKey) indent(-1);
      else insertText('    ');
    }
  };

  const onClick = (e) => {
    const t = e.target;
    setCtx(null);
    pendingSize.current = 0;
    if (t.tagName === 'IMG' && editRef.current.contains(t)) setSelImg(t); else setSelImg(null);
    const li = t.closest && t.closest('li');
    if (li && li.parentElement.classList.contains('checklist') && editRef.current.contains(li)) {
      const r = li.getBoundingClientRect();
      if (e.clientX - r.left < 26 * (zoom / 100) && e.clientX >= r.left - 6) {
        li.setAttribute('data-done', li.getAttribute('data-done') === 'true' ? 'false' : 'true');
        commit(false);
      }
    }
    const a = t.closest && t.closest('a');
    if (a && (e.ctrlKey || e.metaKey) && a.getAttribute('href')) {
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href.startsWith('#')) { const dest = editRef.current.querySelector(`[id="${href.slice(1)}"]`); if (dest) dest.scrollIntoView({ block: 'start' }); } else window.open(href, '_blank', 'noopener');
    }
  };

  const onContextMenu = (e) => {
    if (!editRef.current.contains(e.target)) return;
    e.preventDefault();
    if (e.target.tagName === 'IMG') setSelImg(e.target);
    const f = readFormat(editRef.current);
    const items = [
      { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => doCopy(true) },
      { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => doCopy(false) },
      { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => doPaste(false) },
      { label: 'Paste without formatting', shortcut: 'Ctrl+Shift+V', onClick: () => doPaste(true) },
      { sep: true },
      { label: 'Insert link...', shortcut: 'Ctrl+K', onClick: linkDialog },
      { label: 'Add comment', onClick: addComment },
      ...(f && f.inTable ? [{ sep: true }, { label: 'Insert row above', onClick: tbl.rowAbove }, { label: 'Insert row below', onClick: tbl.rowBelow }, { label: 'Insert column left', onClick: tbl.colLeft }, { label: 'Insert column right', onClick: tbl.colRight }, { label: 'Delete row', onClick: tbl.delRow }, { label: 'Delete column', onClick: tbl.delCol }, { label: 'Merge cell right', onClick: tbl.mergeRight }, { label: 'Split cell', onClick: tbl.split }] : []),
      { sep: true },
      { label: 'Clear formatting', onClick: clearFormat },
    ];
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 380), items });
  };

  const onMouseUp = () => { if (painter) setTimeout(applyPainter, 0); };

  // Shortcuts used while focus is on the toolbar rather than the page
  useEffect(() => {
    const h = (e) => {
      if (editRef.current && editRef.current.contains(e.target)) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'f') { e.preventDefault(); setFind({ replace: false, initial: '' }); }
      if (mod && k === 'h') { e.preventDefault(); setFind({ replace: true, initial: '' }); }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); L.current.undo(); }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); L.current.redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* ---------- menus ---------- */
  const f = fmt || {};
  const hasSel = !!(fmt && !fmt.collapsed);
  const menus = [
    {
      label: 'Edit',
      items: [
        { label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', onClick: lib.undo, disabled: !lib.canUndo },
        { label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', onClick: lib.redo, disabled: !lib.canRedo },
        { sep: true },
        { label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', onClick: () => doCopy(true) },
        { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => doCopy(false) },
        { label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V', onClick: () => doPaste(false) },
        { label: 'Paste without formatting', shortcut: 'Ctrl+Shift+V', onClick: () => doPaste(true) },
        { label: 'Select all', shortcut: 'Ctrl+A', onClick: () => run((el) => { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }) },
        { sep: true },
        { label: 'Find...', icon: 'search', shortcut: 'Ctrl+F', onClick: () => setFind({ replace: false, initial: selText() }) },
        { label: 'Find and replace...', shortcut: 'Ctrl+H', onClick: () => setFind({ replace: true, initial: selText() }) },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Document outline', checked: panel === 'outline', onClick: () => setPanel(panel === 'outline' ? null : 'outline') },
        { label: 'Comments', checked: panel === 'comments', onClick: () => setPanel(panel === 'comments' ? null : 'comments') },
        { sep: true },
        { label: 'Pageless view', checked: pageless, onClick: () => setPageless((p) => !p) },
        { label: 'Zoom in', icon: 'zoomIn', onClick: () => setZoom((z) => Math.min(300, z + 10)) },
        { label: 'Zoom out', icon: 'zoomOut', onClick: () => setZoom((z) => Math.max(30, z - 10)) },
        { label: 'Fit to width', onClick: () => { const sc = scrollRef.current; if (sc) setZoom(Math.max(30, Math.min(300, Math.floor(((sc.clientWidth - 48) / (pageDims(page).w * 96)) * 100)))); } },
        { label: 'Full screen', icon: 'fullscreen', onClick: () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch { /* ignore */ } } },
      ],
    },
    {
      label: 'Insert',
      items: [
        { label: 'Image from device...', icon: 'image', onClick: pickImage },
        { label: 'Image from web address...', onClick: imageFromUrl },
        { label: 'Table...', icon: 'table', onClick: tableDialog },
        { label: 'Link...', icon: 'link', shortcut: 'Ctrl+K', onClick: linkDialog },
        { sep: true },
        { label: 'Horizontal line', icon: 'hr', onClick: () => insertHtml('<hr><p><br></p>') },
        { label: 'Page break', icon: 'pageBreak', shortcut: 'Ctrl+Enter', onClick: insertPageBreak },
        { label: 'Special characters...', icon: 'sigma', onClick: insertSymbols },
        { label: 'Date and time', children: [
          { label: 'Date (long)', onClick: () => insertDate('long') }, { label: 'Date (short)', onClick: () => insertDate('short') },
          { label: 'Date (ISO)', onClick: () => insertDate('iso') }, { label: 'Time', onClick: () => insertDate('time') }, { label: 'Date and time', onClick: () => insertDate('both') }] },
        { label: 'Table of contents', onClick: insertToc },
        { sep: true },
        { label: 'Checklist', icon: 'listCheck', shortcut: 'Ctrl+Shift+9', onClick: () => toggleList('check') },
        { label: 'Quote', icon: 'quote', onClick: () => applyStyle('quote') },
        { label: 'Code block', icon: 'code', onClick: () => applyStyle('code') },
        { sep: true },
        { label: 'Comment', icon: 'comment', shortcut: 'Ctrl+Alt+M', onClick: addComment },
      ],
    },
    {
      label: 'Format',
      items: [
        { label: 'Text', children: [
          { label: 'Bold', shortcut: 'Ctrl+B', checked: f.bold, onClick: () => cmd('bold') }, { label: 'Italic', shortcut: 'Ctrl+I', checked: f.italic, onClick: () => cmd('italic') },
          { label: 'Underline', shortcut: 'Ctrl+U', checked: f.underline, onClick: () => cmd('underline') }, { label: 'Strikethrough', shortcut: 'Ctrl+Shift+X', checked: f.strike, onClick: () => cmd('strikeThrough') },
          { label: 'Superscript', shortcut: 'Ctrl+.', checked: f.sup, onClick: () => cmd('superscript') }, { label: 'Subscript', shortcut: 'Ctrl+,', checked: f.sub, onClick: () => cmd('subscript') },
          { sep: true }, { label: 'Increase font size', onClick: () => bumpSize(1) }, { label: 'Decrease font size', onClick: () => bumpSize(-1) }] },
        { label: 'Paragraph styles', children: STYLE_OPTIONS.map((o) => ({ label: o.label, checked: f.style === o.value, onClick: () => applyStyle(o.value) })) },
        { label: 'Align and indent', children: [
          { label: 'Left', shortcut: 'Ctrl+Shift+L', checked: f.align === 'left', onClick: () => cmd('justifyLeft') }, { label: 'Centre', shortcut: 'Ctrl+Shift+E', checked: f.align === 'center', onClick: () => cmd('justifyCenter') },
          { label: 'Right', shortcut: 'Ctrl+Shift+R', checked: f.align === 'right', onClick: () => cmd('justifyRight') }, { label: 'Justify', shortcut: 'Ctrl+Shift+J', checked: f.align === 'justify', onClick: () => cmd('justifyFull') },
          { sep: true }, { label: 'Increase indent', shortcut: 'Ctrl+]', onClick: () => indent(1) }, { label: 'Decrease indent', shortcut: 'Ctrl+[', onClick: () => indent(-1) },
          { sep: true }, { label: 'Left to right', checked: !f.rtl, onClick: () => setDir(false) }, { label: 'Right to left', checked: f.rtl, onClick: () => setDir(true) }] },
        { label: 'Line and paragraph spacing', children: [
          ...['1', '1.15', '1.5', '2', '2.5', '3'].map((v) => ({ label: v === '1' ? 'Single' : v, onClick: () => lineSpacing(v) })),
          { sep: true }, { label: 'Add space before', onClick: () => paraSpace('margin-top', 12) }, { label: 'Add space after', onClick: () => paraSpace('margin-bottom', 12) },
          { label: 'Remove paragraph spacing', onClick: () => { paraSpace('margin-top', null); paraSpace('margin-bottom', null); } }] },
        { label: 'Lists', children: [
          { label: 'Bulleted list', shortcut: 'Ctrl+Shift+8', checked: f.list === 'ul', onClick: () => toggleList('ul') }, { label: 'Numbered list', shortcut: 'Ctrl+Shift+7', checked: f.list === 'ol', onClick: () => toggleList('ol') },
          { label: 'Checklist', shortcut: 'Ctrl+Shift+9', checked: f.list === 'check', onClick: () => toggleList('check') }, { sep: true },
          { label: 'Number style: 1, 2, 3', onClick: () => numberStyle('decimal') }, { label: 'Number style: a, b, c', onClick: () => numberStyle('lower-alpha') },
          { label: 'Number style: A, B, C', onClick: () => numberStyle('upper-alpha') }, { label: 'Number style: i, ii, iii', onClick: () => numberStyle('lower-roman') }, { label: 'Number style: I, II, III', onClick: () => numberStyle('upper-roman') }] },
        { label: 'Capitalisation', children: [
          { label: 'UPPERCASE', disabled: !hasSel, onClick: () => changeCase('upper') }, { label: 'lowercase', disabled: !hasSel, onClick: () => changeCase('lower') },
          { label: 'Title Case', disabled: !hasSel, onClick: () => changeCase('title') }, { label: 'Sentence case', disabled: !hasSel, onClick: () => changeCase('sentence') }] },
        { sep: true },
        { label: 'Columns and page...', onClick: pageSetup },
        { label: 'Clear formatting', icon: 'eraser', shortcut: 'Ctrl+\\', onClick: clearFormat },
      ],
    },
    {
      label: 'Table',
      items: [
        { label: 'Insert table...', icon: 'table', onClick: tableDialog },
        { sep: true },
        { label: 'Insert row above', disabled: !f.inTable, onClick: tbl.rowAbove }, { label: 'Insert row below', disabled: !f.inTable, onClick: tbl.rowBelow },
        { label: 'Insert column left', disabled: !f.inTable, onClick: tbl.colLeft }, { label: 'Insert column right', disabled: !f.inTable, onClick: tbl.colRight },
        { sep: true },
        { label: 'Delete row', disabled: !f.inTable, onClick: tbl.delRow }, { label: 'Delete column', disabled: !f.inTable, onClick: tbl.delCol }, { label: 'Delete table', disabled: !f.inTable, danger: true, onClick: tbl.delTable },
        { sep: true },
        { label: 'Merge cell right', icon: 'merge', disabled: !f.inTable, onClick: tbl.mergeRight }, { label: 'Merge cell down', disabled: !f.inTable, onClick: tbl.mergeDown }, { label: 'Split cell', disabled: !f.inTable, onClick: tbl.split },
        { sep: true },
        { label: 'Header row on/off', disabled: !f.inTable, onClick: tbl.header }, { label: 'Column width...', disabled: !f.inTable, onClick: tbl.colWidth },
        { label: 'Sort column A to Z', icon: 'sortAsc', disabled: !f.inTable, onClick: () => tbl.sortCol(1) }, { label: 'Sort column Z to A', icon: 'sortDesc', disabled: !f.inTable, onClick: () => tbl.sortCol(-1) },
        { label: 'Borders', disabled: !f.inTable, children: [{ label: 'All borders', onClick: () => tbl.borders('all') }, { label: 'Outside only', onClick: () => tbl.borders('outer') }, { label: 'Horizontal lines only', onClick: () => tbl.borders('rows') }, { label: 'No borders', onClick: () => tbl.borders('none') }] },
        { label: 'Vertical alignment', disabled: !f.inTable, children: [{ label: 'Top', onClick: () => tbl.valign('top') }, { label: 'Middle', onClick: () => tbl.valign('middle') }, { label: 'Bottom', onClick: () => tbl.valign('bottom') }] },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Word count...', icon: 'info', onClick: showStats },
        { label: 'Spelling check', checked: spell, onClick: () => setSpell((s) => !s) },
        { label: 'Voice typing', icon: 'mic', checked: voice, onClick: toggleVoice },
        { label: speaking ? 'Stop reading' : 'Read aloud', icon: 'speaker', onClick: readAloud },
        { sep: true },
        { label: 'Page setup...', icon: 'layout', onClick: pageSetup },
        { label: 'Update table of contents', onClick: insertToc },
        { label: 'Remove all comments', disabled: !comments.length, danger: true, onClick: async () => { if (await dlg.confirm({ title: 'Remove comments', message: 'Delete every comment in this document?', danger: true, okText: 'Delete' })) { comments.forEach((c) => unwrapComment(c.id)); const html = editRef.current.innerHTML; edit((d) => ({ ...d, html, comments: [] })); } } },
      ],
    },
  ];

  const fileItems = [
    { label: 'Open or import file...', icon: 'upload', onClick: doImport },
    { label: 'Download', icon: 'download', children: [
      { label: 'Microsoft Word (.docx)', onClick: () => exportAs('docx') }, { label: 'Web page (.html)', onClick: () => exportAs('html') },
      { label: 'Markdown (.md)', onClick: () => exportAs('md') }, { label: 'Plain text (.txt)', onClick: () => exportAs('txt') }] },
    { label: 'Print or save as PDF', icon: 'printer', shortcut: 'Ctrl+P', onClick: doPrint },
    { label: 'Page setup...', icon: 'layout', onClick: pageSetup },
  ];

  /* ---------- toolbar ---------- */
  const fontValue = FONTS.includes(f.font) ? f.font : '';
  const toolbar = (
    <>
      <Btn icon="undo" title="Undo (Ctrl+Z)" disabled={!lib.canUndo} onClick={lib.undo} />
      <Btn icon="redo" title="Redo (Ctrl+Y)" disabled={!lib.canRedo} onClick={lib.redo} />
      <Btn icon="printer" title="Print (Ctrl+P)" onClick={doPrint} />
      <Btn icon="paintFormat" title="Paint format" active={!!painter} onClick={startPainter} />
      <Sep />
      <Sel title="Paragraph style" value={f.style || 'p'} onChange={applyStyle} options={STYLE_OPTIONS} width={118} />
      <Sel title="Font" value={fontValue} placeholder={f.font || 'Font'} onChange={(v) => cmd('fontName', v)} options={FONTS.map((x) => ({ value: x, label: x }))} width={118} />
      <Stepper title="Font size" value={f.size || 11} min={6} max={200} width={36} onChange={setSize} />
      <Sep />
      <Btn icon="bold" title="Bold (Ctrl+B)" active={!!f.bold} onClick={() => cmd('bold')} />
      <Btn icon="italic" title="Italic (Ctrl+I)" active={!!f.italic} onClick={() => cmd('italic')} />
      <Btn icon="underline" title="Underline (Ctrl+U)" active={!!f.underline} onClick={() => cmd('underline')} />
      <Btn icon="strike" title="Strikethrough" active={!!f.strike} onClick={() => cmd('strikeThrough')} />
      <ColorBtn icon="textColor" title="Text colour" value={f.color} onPick={(c) => c && cmd('foreColor', c)} />
      <ColorBtn icon="highlight" title="Highlight colour" value={f.bg || '#ffe066'} defaultColor="#ffe066" noneLabel="No highlight" onPick={(c) => cmd('hiliteColor', c || 'transparent')} />
      <Sep />
      <Btn icon="link" title="Insert link (Ctrl+K)" active={f.link !== null && f.link !== undefined} onClick={linkDialog} />
      <Btn icon="comment" title="Add comment (Ctrl+Alt+M)" onClick={addComment} />
      <Btn icon="image" title="Insert image" onClick={pickImage} />
      <Drop icon="table" title="Insert table" panelClass="wide">{({ close }) => <TablePicker onPick={(r, c) => insertTable(r, c)} close={close} />}</Drop>
      <Sep />
      <Btn icon="alignLeft" title="Align left" active={f.align === 'left'} onClick={() => cmd('justifyLeft')} />
      <Btn icon="alignCenter" title="Align centre" active={f.align === 'center'} onClick={() => cmd('justifyCenter')} />
      <Btn icon="alignRight" title="Align right" active={f.align === 'right'} onClick={() => cmd('justifyRight')} />
      <Btn icon="justify" title="Justify" active={f.align === 'justify'} onClick={() => cmd('justifyFull')} />
      <Drop icon="sliders" title="Line and paragraph spacing">
        {({ close }) => <MenuList close={close} items={[...['1', '1.15', '1.5', '2', '2.5', '3'].map((v) => ({ label: v === '1' ? 'Single' : v + ' lines', onClick: () => lineSpacing(v) })), { sep: true }, { label: 'Add space before paragraph', onClick: () => paraSpace('margin-top', 12) }, { label: 'Add space after paragraph', onClick: () => paraSpace('margin-bottom', 12) }, { label: 'Remove paragraph spacing', onClick: () => { paraSpace('margin-top', null); paraSpace('margin-bottom', null); } }]} />}
      </Drop>
      <Sep />
      <Btn icon="listCheck" title="Checklist" active={f.list === 'check'} onClick={() => toggleList('check')} />
      <Btn icon="listBullet" title="Bulleted list" active={f.list === 'ul'} onClick={() => toggleList('ul')} />
      <Btn icon="listNumber" title="Numbered list" active={f.list === 'ol'} onClick={() => toggleList('ol')} />
      <Btn icon="outdent" title="Decrease indent" onClick={() => indent(-1)} />
      <Btn icon="indent" title="Increase indent" onClick={() => indent(1)} />
      <Sep />
      <Btn icon="sup" title="Superscript" active={!!f.sup} onClick={() => cmd('superscript')} />
      <Btn icon="sub" title="Subscript" active={!!f.sub} onClick={() => cmd('subscript')} />
      <Btn icon="eraser" title="Clear formatting" onClick={clearFormat} />
      <Btn icon="search" title="Find (Ctrl+F)" active={!!find} onClick={() => setFind(find ? null : { replace: false, initial: selText() })} />
      {f.inTable && (
        <>
          <span className="tbbreak" />
          <span className="tblabel">Table</span>
          <Btn icon="rows" title="Insert row below" onClick={tbl.rowBelow}><span className="tbtxt">+Row</span></Btn>
          <Btn icon="columns" title="Insert column right" onClick={tbl.colRight}><span className="tbtxt">+Col</span></Btn>
          <Btn title="Delete row" onClick={tbl.delRow}><span className="tbtxt">-Row</span></Btn>
          <Btn title="Delete column" onClick={tbl.delCol}><span className="tbtxt">-Col</span></Btn>
          <Btn icon="merge" title="Merge cell right" onClick={tbl.mergeRight} />
          <Btn title="Split cell" onClick={tbl.split}><span className="tbtxt">Split</span></Btn>
          <Btn title="Header row on/off" onClick={tbl.header}><span className="tbtxt">Header</span></Btn>
          <ColorBtn icon="fillColor" title="Cell shading" value="#fff2cc" defaultColor="#fff2cc" noneLabel="No shading" onPick={tbl.bg} />
          <Drop icon="borders" title="Borders">
            {({ close }) => <MenuList close={close} items={[{ label: 'All borders', onClick: () => tbl.borders('all') }, { label: 'Outside only', onClick: () => tbl.borders('outer') }, { label: 'Horizontal lines only', onClick: () => tbl.borders('rows') }, { label: 'No borders', onClick: () => tbl.borders('none') }]} />}
          </Drop>
          <Btn icon="sortAsc" title="Sort column A-Z" onClick={() => tbl.sortCol(1)} />
          <Btn icon="trash" title="Delete table" onClick={tbl.delTable} />
        </>
      )}
    </>
  );

  /* ---------- side panels ---------- */
  const sidePanel = panel && (
    <aside className="sidepanel no-print" aria-label={panel === 'outline' ? 'Document outline' : 'Comments'}>
      <h3>
        {panel === 'outline' ? 'Outline' : `Comments (${comments.length})`}
        <button type="button" className="icon-btn" aria-label="Close panel" onClick={() => setPanel(null)}><Icon name="x" size={14} /></button>
      </h3>
      {panel === 'outline' && (
        outline.length ? (
          <ul className="outline">
            {outline.map((h, i) => (
              <li key={i} style={{ paddingLeft: (h.level - 1) * 12 }}>
                <button type="button" onClick={() => { const hs = getHeadings(editRef.current); if (hs[i]) hs[i].el.scrollIntoView({ block: 'start' }); }}>{h.text}</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">Headings you add will appear here. Use the Paragraph style menu or type # then a space.</p>
      )}
      {panel === 'comments' && (
        comments.length ? (
          <ul className="cmtlist">
            {comments.map((c) => (
              <li key={c.id} className={c.resolved ? 'resolved' : ''}>
                <button type="button" className="cmtq" onClick={() => !c.resolved && gotoComment(c.id)}>&ldquo;{c.quote}&rdquo;</button>
                <p>{c.text}</p>
                <div className="cmtmeta">
                  <small>{new Date(c.t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small>
                  <span>
                    <button type="button" className="btn sm ghost" onClick={() => resolveComment(c.id)}>{c.resolved ? 'Reopen' : 'Resolve'}</button>
                    <button type="button" className="btn sm ghost" aria-label="Delete comment" onClick={() => deleteComment(c.id)}><Icon name="trash" size={13} /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">Select text and choose Insert - Comment to start a thread.</p>
      )}
    </aside>
  );

  const d = pageDims(page);
  const m = page.margins;
  const guide = pageless ? undefined : `repeating-linear-gradient(to bottom, transparent 0, transparent ${d.h * 96 - 2}px, rgba(110,120,140,.45) ${d.h * 96 - 2}px, rgba(110,120,140,.45) ${d.h * 96}px)`;
  const printCss = `@media print{@page{size:${d.w}in ${d.h}in;margin:${m.t}in ${m.r}in ${m.b}in ${m.l}in;${page.header ? `@top-center{content:${JSON.stringify(page.header)};font-size:9pt;color:#666}` : ''}${page.footer ? `@bottom-left{content:${JSON.stringify(page.footer)};font-size:9pt;color:#666}` : ''}${page.numbers && page.numbers !== 'none' ? `@${page.numbers}{content:counter(page);font-size:9pt;color:#666}` : ''}}}`;

  return (
    <AppChrome
      name="Techomato Docs" icon="📝" noun="document" lib={lib} menus={menus} fileItems={fileItems} templates={DOC_TEMPLATES} shortcuts={SHORTCUTS}
      toolbar={toolbar} rightPanel={sidePanel}
    >
      <style>{printCss}</style>
      {find && (
        <FindBar key={find.replace + ':' + find.initial} getRoot={() => editRef.current} version={version} replaceMode={find.replace} initial={find.initial}
          onClose={() => { setFind(null); if (editRef.current) editRef.current.focus(); }} onChanged={() => { commit(false); }} />
      )}
      <div className="docscroll" ref={scrollRef} onScroll={() => setVersion((v) => v + 1)} onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); editRef.current.focus(); } }}>
        <div
          ref={sheetRef}
          className={'docsheet print-root' + (pageless ? ' pageless' : '') + (page.cols > 1 ? ' multicol' : '')}
          style={{
            width: pageless ? undefined : d.w * 96,
            minHeight: pageless ? undefined : d.h * 96,
            padding: pageless ? '48px 56px' : `${m.t * 96}px ${m.r * 96}px ${m.b * 96}px ${m.l * 96}px`,
            backgroundColor: page.bg || '#fff',
            backgroundImage: guide,
            zoom: zoom / 100,
          }}
        >
          {page.header && !pageless && <div className="dochead no-print" style={{ top: Math.max(6, m.t * 48 - 8) }}>{page.header}</div>}
          <div
            ref={editRef}
            className="docedit"
            contentEditable
            suppressContentEditableWarning
            spellCheck={spell}
            role="textbox"
            aria-multiline="true"
            aria-label="Document"
            style={page.cols > 1 ? { columnCount: page.cols, columnGap: '0.5in' } : undefined}
            onInput={onInput}
            onBeforeInput={onBeforeInput}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onDrop={onDrop}
            onClick={onClick}
            onMouseUp={onMouseUp}
            onContextMenu={onContextMenu}
            onFocus={() => { try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ } }}
          />
          {!pageless && (page.footer || (page.numbers && page.numbers !== 'none')) && (
            <div className="docfoot no-print" style={{ bottom: Math.max(6, m.b * 48 - 8) }}>
              <span>{page.footer}</span>
              {page.numbers && page.numbers !== 'none' && <span className="pn">Page numbers: {page.numbers.replace('-', ' ')}</span>}
            </div>
          )}
        </div>
        {boxes.img && selImg && (
          <>
            <div className="imgsel" style={{ left: boxes.img.left, top: boxes.img.top, width: boxes.img.width, height: boxes.img.height }}>
              <span className="imgh" onMouseDown={dragHandle} title="Drag to resize" />
            </div>
            <div className="floatbar" style={{ left: Math.max(4, boxes.img.left), top: Math.max(4, boxes.img.top - 38) }} onMouseDown={(e) => e.preventDefault()}>
              {[['25%', 0.25], ['50%', 0.5], ['75%', 0.75], ['100%', 1]].map(([l, v]) => <button key={l} type="button" onClick={() => imgWidth(v)}>{l}</button>)}
              <span className="sep" />
              <button type="button" title="Align left" aria-label="Align left" onClick={() => imgAlign('left')}><Icon name="alignLeft" size={14} /></button>
              <button type="button" title="Centre" aria-label="Centre" onClick={() => imgAlign('center')}><Icon name="alignCenter" size={14} /></button>
              <button type="button" title="Align right" aria-label="Align right" onClick={() => imgAlign('right')}><Icon name="alignRight" size={14} /></button>
              <button type="button" title="Wrap text on the right" onClick={() => imgAlign('wrapL')}>Wrap L</button>
              <button type="button" title="Wrap text on the left" onClick={() => imgAlign('wrapR')}>Wrap R</button>
              <span className="sep" />
              <button type="button" onClick={imgAlt}>Alt text</button>
              <button type="button" onClick={imgReplace}>Replace</button>
              <button type="button" title="Delete image" aria-label="Delete image" onClick={imgDelete}><Icon name="trash" size={14} /></button>
            </div>
          </>
        )}
        {boxes.link && linkEl && !selImg && (
          <div className="floatbar link" style={{ left: Math.max(4, boxes.link.left), top: boxes.link.top + boxes.link.height + 6 }} onMouseDown={(e) => e.preventDefault()}>
            <a href={linkEl.getAttribute('href')} target="_blank" rel="noopener noreferrer" className="lnk">{(linkEl.getAttribute('href') || '').slice(0, 48)}</a>
            <span className="sep" />
            <button type="button" onClick={linkDialog}>Edit</button>
            <button type="button" onClick={() => run(() => { const r = document.createRange(); r.selectNodeContents(linkEl); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('unlink'); })}>Remove</button>
          </div>
        )}
      </div>
      {ctx && <CtxMenu ctx={ctx} close={() => setCtx(null)} />}
      <div className="statusbar no-print">
        <span>{stats.words.toLocaleString()} word{stats.words === 1 ? '' : 's'}</span>
        <span>{stats.chars.toLocaleString()} characters</span>
        {selWords > 0 && <span>{selWords} selected</span>}
        {!pageless && <span title="Approximate - based on the page height">{stats.pages} page{stats.pages === 1 ? '' : 's'}</span>}
        <span>~{Math.max(stats.words ? 1 : 0, Math.round(stats.words / 230))} min read</span>
        <span className="spacer" />
        {painter && <span>Paint format on - select text</span>}
        {voice && <span>Listening...</span>}
        <button type="button" className="link" onClick={() => setZoom((z) => Math.max(30, z - 10))} aria-label="Zoom out">-</button>
        <span>{zoom}%</span>
        <button type="button" className="link" onClick={() => setZoom((z) => Math.min(300, z + 10))} aria-label="Zoom in">+</button>
      </div>
    </AppChrome>
  );
}

function CtxMenu({ ctx, close }) {
  const ref = useRef(null);
  useDismiss(true, (o) => { if (!o) close(); }, ref);
  return (
    <div className="ctxmenu panel" ref={ref} style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.preventDefault()}>
      <MenuList items={ctx.items} close={close} />
    </div>
  );
}
