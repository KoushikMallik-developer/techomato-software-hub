// .docx -> editor HTML (paragraphs, runs, lists, tables, images, page setup).
import { attr, bytesToBase64, kid, kids, matchPageSize, mimeFromName, parseXml } from './util.js';
import { escapeHtml } from '../../apps/docs/dom.js';
import { DEFAULT_PAGE } from '../../apps/docs/templates.js';

const HL = {
  yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000', darkBlue: '000080', darkCyan: '008080',
  darkGreen: '008000', darkMagenta: '800080', darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0', black: '000000', white: 'FFFFFF',
};

const onOff = (el) => {
  if (!el) return undefined;
  const v = attr(el, 'val');
  return !(v === '0' || v === 'false' || v === 'off');
};

function parseRPr(rPr) {
  const o = {};
  if (!rPr) return o;
  const b = onOff(kid(rPr, 'b')); if (b !== undefined) o.b = b;
  const i = onOff(kid(rPr, 'i')); if (i !== undefined) o.i = i;
  const s = onOff(kid(rPr, 'strike')) ?? onOff(kid(rPr, 'dstrike')); if (s !== undefined) o.strike = s;
  const u = kid(rPr, 'u'); if (u) o.u = attr(u, 'val') !== 'none';
  const c = kid(rPr, 'color'); if (c && attr(c, 'val') && attr(c, 'val') !== 'auto') o.color = attr(c, 'val');
  const sz = kid(rPr, 'sz'); if (sz) o.sz = parseInt(attr(sz, 'val'), 10) / 2;
  const f = kid(rPr, 'rFonts'); if (f) o.font = attr(f, 'ascii') || attr(f, 'hAnsi') || attr(f, 'cs') || undefined;
  const hl = kid(rPr, 'highlight'); if (hl && attr(hl, 'val') !== 'none') o.hl = HL[attr(hl, 'val')];
  const shd = kid(rPr, 'shd'); if (shd && attr(shd, 'fill') && attr(shd, 'fill') !== 'auto') o.hl = o.hl || attr(shd, 'fill');
  const va = kid(rPr, 'vertAlign'); if (va) o.vert = attr(va, 'val');
  const caps = onOff(kid(rPr, 'caps')); if (caps) o.caps = true;
  return o;
}

function parsePPr(pPr) {
  const o = {};
  if (!pPr) return o;
  const st = kid(pPr, 'pStyle'); if (st) o.style = attr(st, 'val');
  const jc = kid(pPr, 'jc'); if (jc) o.jc = attr(jc, 'val');
  const ind = kid(pPr, 'ind');
  if (ind) {
    o.left = parseInt(attr(ind, 'left') || attr(ind, 'start') || '0', 10);
    o.firstLine = parseInt(attr(ind, 'firstLine') || '0', 10);
    o.hanging = parseInt(attr(ind, 'hanging') || '0', 10);
  }
  const sp = kid(pPr, 'spacing');
  if (sp) {
    if (attr(sp, 'before') !== null) o.before = parseInt(attr(sp, 'before'), 10);
    if (attr(sp, 'after') !== null) o.after = parseInt(attr(sp, 'after'), 10);
    if (attr(sp, 'line') !== null) { o.line = parseInt(attr(sp, 'line'), 10); o.lineRule = attr(sp, 'lineRule') || 'auto'; }
  }
  const np = kid(pPr, 'numPr');
  if (np) {
    const id = kid(np, 'numId'); const lv = kid(np, 'ilvl');
    if (id) o.numId = attr(id, 'val');
    if (lv) o.ilvl = parseInt(attr(lv, 'val'), 10);
  }
  if (kid(pPr, 'pageBreakBefore')) o.pageBreakBefore = true;
  const bidi = kid(pPr, 'bidi'); if (bidi && onOff(bidi) !== false) o.rtl = true;
  const shd = kid(pPr, 'shd'); if (shd && attr(shd, 'fill') && attr(shd, 'fill') !== 'auto') o.shd = attr(shd, 'fill');
  const pb = kid(pPr, 'pBdr');
  if (pb && kid(pb, 'bottom') && !kid(pb, 'top') && !kid(pb, 'left')) o.ruleBelow = true;
  return o;
}

const merge = (...objs) => Object.assign({}, ...objs.filter(Boolean));

function parseStyles(xml) {
  const out = { defaults: {}, byId: {}, normalId: null };
  if (!xml) return out;
  const d = parseXml(xml);
  const root = d.documentElement;
  const dd = kid(root, 'docDefaults');
  if (dd) out.defaults = parseRPr(kid(kid(dd, 'rPrDefault'), 'rPr'));
  kids(root, 'style').forEach((s) => {
    const id = attr(s, 'styleId');
    const name = (attr(kid(s, 'name'), 'val') || '').toLowerCase();
    out.byId[id] = { id, name, type: attr(s, 'type'), basedOn: attr(kid(s, 'basedOn'), 'val'), rPr: parseRPr(kid(s, 'rPr')), pPr: parsePPr(kid(s, 'pPr')) };
    if (attr(s, 'type') === 'paragraph' && attr(s, 'default') === '1') out.normalId = id;
  });
  return out;
}

function styleChain(styles, id, key, seen = new Set()) {
  const s = styles.byId[id];
  if (!s || seen.has(id)) return {};
  seen.add(id);
  return merge(styleChain(styles, s.basedOn, key, seen), s[key]);
}

function parseNumbering(xml) {
  const out = { nums: {}, abstract: {} };
  if (!xml) return out;
  const root = parseXml(xml).documentElement;
  kids(root, 'abstractNum').forEach((a) => {
    const lv = {};
    kids(a, 'lvl').forEach((l) => { lv[attr(l, 'ilvl')] = { fmt: attr(kid(l, 'numFmt'), 'val') || 'decimal', start: parseInt(attr(kid(l, 'start'), 'val') || '1', 10) }; });
    out.abstract[attr(a, 'abstractNumId')] = lv;
  });
  kids(root, 'num').forEach((n) => { out.nums[attr(n, 'numId')] = attr(kid(n, 'abstractNumId'), 'val'); });
  return out;
}

function parseRels(xml) {
  const out = {};
  if (!xml) return out;
  Array.from(parseXml(xml).documentElement.children).forEach((r) => {
    out[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type') || '', external: r.getAttribute('TargetMode') === 'External' };
  });
  return out;
}

const resolvePath = (base, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  target.split('/').forEach((seg) => {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  });
  return parts.join('/');
};

const twipsToPx = (t) => Math.round((t / 20) * (96 / 72) * 10) / 10;

export async function importDocx(buffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const read = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };

  const docXml = await read('word/document.xml');
  if (!docXml) throw new Error('This file does not look like a Word document.');
  const doc = parseXml(docXml);
  const rels = parseRels(await read('word/_rels/document.xml.rels'));
  const styles = parseStyles(await read('word/styles.xml'));
  const numbering = parseNumbering(await read('word/numbering.xml'));

  // Preload images
  const images = {};
  for (const [id, r] of Object.entries(rels)) {
    if (!/\/image$/.test(r.type) || r.external) continue;
    const path = resolvePath('word/document.xml', r.target);
    const f = zip.file(path);
    if (!f) continue;
    const mime = mimeFromName(path);
    if (/emf|wmf|tiff/.test(mime)) continue;
    images[id] = `data:${mime};base64,${bytesToBase64(await f.async('uint8array'))}`;
  }

  const baseRun = merge(styles.defaults, styleChain(styles, styles.normalId, 'rPr'));
  const basePara = styleChain(styles, styles.normalId, 'pPr');

  const body = kid(doc.documentElement, 'body');

  /* ----- runs ----- */
  const runHtml = (r, paraRun, ctx) => {
    const own = parseRPr(kid(r, 'rPr'));
    const rs = kid(kid(r, 'rPr'), 'rStyle');
    const charStyle = rs ? styles.byId[attr(rs, 'val')] : null;
    const p = merge(paraRun, charStyle ? styleChain(styles, charStyle.id, 'rPr') : null, own);
    let html = '';
    let pageBreak = false;
    Array.from(r.children).forEach((c) => {
      const n = c.localName;
      if (n === 't') {
        html += escapeHtml(c.textContent).replace(/ {2,}/g, (m) => ' ' + ' '.repeat(m.length - 1));
      } else if (n === 'tab') html += '    ';
      else if (n === 'br') {
        if (attr(c, 'type') === 'page') pageBreak = true;
        else html += '<br>';
      } else if (n === 'cr') html += '<br>';
      else if (n === 'noBreakHyphen') html += '‑';
      else if (n === 'sym') html += String.fromCharCode(parseInt(attr(c, 'char') || '25cf', 16) & 0xffff);
      else if (n === 'drawing' || n === 'pict') {
        const blip = c.getElementsByTagName('*');
        let rid = null;
        let cx = 0;
        let cy = 0;
        let alt = '';
        for (const e of Array.from(blip)) {
          if (e.localName === 'blip') rid = rid || attr(e, 'embed');
          if (e.localName === 'imagedata') rid = rid || attr(e, 'id');
          if (e.localName === 'extent' && !cx) { cx = parseInt(e.getAttribute('cx') || '0', 10); cy = parseInt(e.getAttribute('cy') || '0', 10); }
          if (e.localName === 'docPr' && !alt) alt = e.getAttribute('descr') || '';
        }
        if (rid && images[rid]) {
          const w = cx ? Math.round(cx / 9525) : 0;
          html += `<img src="${images[rid]}" alt="${escapeHtml(alt)}"${w ? ` style="width:${w}px"` : ''}>`;
        }
      }
    });
    if (html) {
      const style = [];
      if (p.sz && p.sz !== baseRun.sz && !ctx.noSize) style.push(`font-size:${p.sz}pt`);
      if (p.font && p.font !== baseRun.font) style.push(`font-family:'${p.font.replace(/'/g, '')}'`);
      if (p.color && !['000000', '111111'].includes(p.color.toLowerCase())) style.push(`color:#${p.color}`);
      if (p.hl) style.push(`background-color:#${p.hl}`);
      if (p.caps) style.push('text-transform:uppercase');
      if (style.length) html = `<span style="${style.join(';')}">${html}</span>`;
      if (p.vert === 'superscript') html = `<sup>${html}</sup>`;
      if (p.vert === 'subscript') html = `<sub>${html}</sub>`;
      if (p.strike) html = `<s>${html}</s>`;
      if (p.u) html = `<u>${html}</u>`;
      if (p.i && !ctx.noItalic) html = `<i>${html}</i>`;
      if (p.b && !ctx.noBold) html = `<b>${html}</b>`;
    }
    return { html, pageBreak };
  };

  const inlineHtml = (el, paraRun, ctx) => {
    let html = '';
    let pageBreak = false;
    Array.from(el.children).forEach((c) => {
      const n = c.localName;
      if (n === 'r') {
        const r = runHtml(c, paraRun, ctx);
        html += r.html;
        pageBreak = pageBreak || r.pageBreak;
      } else if (n === 'hyperlink') {
        const inner = inlineHtml(c, paraRun, ctx);
        const rid = attr(c, 'id');
        const anchor = attr(c, 'anchor');
        const href = rid && rels[rid] ? rels[rid].target : anchor ? '#' + anchor : '';
        html += href ? `<a href="${escapeHtml(href)}">${inner.html}</a>` : inner.html;
        pageBreak = pageBreak || inner.pageBreak;
      } else if (n === 'ins' || n === 'smartTag' || n === 'fldSimple' || n === 'sdt' || n === 'sdtContent' || n === 'customXml') {
        const inner = inlineHtml(n === 'sdt' ? kid(c, 'sdtContent') || c : c, paraRun, ctx);
        html += inner.html;
        pageBreak = pageBreak || inner.pageBreak;
      }
    });
    return { html, pageBreak };
  };

  /* ----- output with list handling ----- */
  const out = { html: '', stack: [] };
  const closeOne = () => { const t = out.stack.pop(); out.html += '</li></' + t.tag + '>'; };
  const closeLists = () => { while (out.stack.length) closeOne(); };
  const listItem = (numId, level, ordered, content) => {
    const tag = ordered ? 'ol' : 'ul';
    if (out.stack.length && out.stack[0].numId !== numId) closeLists();
    while (out.stack.length > level + 1) closeOne();
    if (out.stack.length === level + 1) {
      if (out.stack[level].tag !== tag) closeOne();
      else { out.html += '</li><li>' + content; return; }
    }
    while (out.stack.length < level + 1) { out.html += `<${tag}><li>`; out.stack.push({ tag, numId }); }
    out.html += content;
  };

  const paraStyleCss = (pp, isHeading) => {
    const css = [];
    const jc = pp.jc;
    if (jc === 'center') css.push('text-align:center');
    else if (jc === 'right' || jc === 'end') css.push('text-align:right');
    else if (jc === 'both' || jc === 'distribute') css.push('text-align:justify');
    if (pp.before !== undefined && !isHeading) css.push(`margin-top:${Math.round((pp.before / 20) * 1.333)}px`);
    if (pp.after !== undefined && !isHeading) css.push(`margin-bottom:${Math.round((pp.after / 20) * 1.333)}px`);
    if (!isHeading && pp.line && pp.lineRule === 'auto' && Math.abs(pp.line - 240) > 6) css.push(`line-height:${(pp.line / 240).toFixed(2)}`);
    if (pp.left && !pp.numId) css.push(`margin-left:${twipsToPx(pp.left)}px`);
    if (pp.firstLine && !pp.numId) css.push(`text-indent:${twipsToPx(pp.firstLine)}px`);
    if (pp.rtl) css.push('direction:rtl');
    if (pp.shd) css.push(`background-color:#${pp.shd}`);
    return css.length ? ` style="${css.join(';')}"` : '';
  };

  const paragraphHtml = (p) => {
    const own = parsePPr(kid(p, 'pPr'));
    const styleId = own.style || styles.normalId;
    const st = styles.byId[styleId] || {};
    const name = st.name || '';
    const styleP = merge(basePara, styleChain(styles, styleId, 'pPr'));
    const pp = merge(styleP, own);
    const styleRun = merge(baseRun, styleChain(styles, styleId, 'rPr'));
    let tag = 'p';
    let cls = '';
    const hm = /^heading (\d)/.exec(name) || /^(?:h)(\d)$/.exec(name);
    const isHeading = !!hm;
    if (hm) tag = 'h' + Math.min(6, Number(hm[1]));
    else if (name === 'title') cls = ' class="doc-title"';
    else if (name === 'subtitle') cls = ' class="doc-subtitle"';
    else if (/quote/.test(name)) tag = 'blockquote';
    const ctx = isHeading ? { noSize: true, noBold: true, noItalic: false } : name === 'title' || name === 'subtitle' ? { noSize: true, noBold: true } : {};
    const paraRun = isHeading || name === 'title' || name === 'subtitle' ? { ...styleRun, sz: undefined, b: undefined } : styleRun;
    // For normal paragraphs, only differences from the base are emitted.
    const inner = inlineHtml(p, paraRun, ctx);
    const content = inner.html;
    if (pp.pageBreakBefore) { closeLists(); out.html += '<hr class="page-break">'; }

    if (pp.numId && pp.numId !== '0' && !isHeading) {
      const abs = numbering.abstract[numbering.nums[pp.numId]] || {};
      const lvl = abs[String(pp.ilvl || 0)] || { fmt: 'decimal' };
      const ordered = lvl.fmt !== 'bullet' && lvl.fmt !== 'none';
      listItem(pp.numId, pp.ilvl || 0, ordered, content || '<br>');
    } else {
      closeLists();
      if (!content && !inner.pageBreak) {
        out.html += `<p${paraStyleCss(pp, false)}><br></p>`;
      } else if (pp.ruleBelow && !content) {
        out.html += '<hr>';
      } else {
        out.html += `<${tag}${cls}${paraStyleCss(pp, isHeading)}>${content || '<br>'}</${tag}>`;
      }
    }
    if (inner.pageBreak) { closeLists(); out.html += '<hr class="page-break">'; }
  };

  /* ----- tables ----- */
  const tableHtml = (tbl) => {
    const rows = kids(tbl, 'tr');
    const grid = [];
    const spans = []; // spans[gridCol] = { cellRef }
    const tblPr = kid(tbl, 'tblPr');
    const borders = kid(tblPr, 'tblBorders');
    const noBorders = borders && Array.from(borders.children).every((b) => ['nil', 'none'].includes(attr(b, 'val')));
    rows.forEach((tr, ri) => {
      const cells = [];
      let col = 0;
      const isHeader = !!kid(kid(tr, 'trPr'), 'tblHeader');
      kids(tr, 'tc').forEach((tc) => {
        const tcPr = kid(tc, 'tcPr');
        const span = parseInt(attr(kid(tcPr, 'gridSpan'), 'val') || '1', 10);
        const vm = kid(tcPr, 'vMerge');
        if (vm && attr(vm, 'val') !== 'restart') {
          const origin = spans[col];
          if (origin) origin.rowspan += 1;
          col += span;
          return;
        }
        const shd = kid(tcPr, 'shd');
        const fill = shd && attr(shd, 'fill') && attr(shd, 'fill') !== 'auto' ? attr(shd, 'fill') : null;
        const va = attr(kid(tcPr, 'vAlign'), 'val');
        const cell = { span, rowspan: 1, fill, va, tc, header: isHeader };
        if (vm) spans[col] = cell;
        else spans[col] = null;
        cells.push(cell);
        col += span;
      });
      grid.push(cells);
    });
    let h = `<table class="doctable"${noBorders ? ' data-borders="none"' : ''}><tbody>`;
    grid.forEach((cells) => {
      h += '<tr>';
      cells.forEach((c) => {
        const tag = c.header ? 'th' : 'td';
        const css = [];
        if (c.fill) css.push(`background-color:#${c.fill}`);
        if (c.va === 'center') css.push('vertical-align:middle');
        if (c.va === 'bottom') css.push('vertical-align:bottom');
        h += `<${tag}${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}${css.length ? ` style="${css.join(';')}"` : ''}>`;
        const saved = { html: out.html, stack: out.stack };
        out.html = '';
        out.stack = [];
        blocks(c.tc);
        closeLists();
        let inner = out.html;
        out.html = saved.html;
        out.stack = saved.stack;
        inner = inner.replace(/^<p(?: style="[^"]*")?>(.*?)<\/p>$/s, (m, x) => (inner.indexOf('<p', 3) === -1 ? x : m));
        h += inner || '<br>';
        h += `</${tag}>`;
      });
      h += '</tr>';
    });
    return h + '</tbody></table><p><br></p>';
  };

  function blocks(parent) {
    Array.from(parent.children).forEach((c) => {
      const n = c.localName;
      if (n === 'p') paragraphHtml(c);
      else if (n === 'tbl') { closeLists(); out.html += tableHtml(c); }
      else if (n === 'sdt') blocks(kid(c, 'sdtContent') || c);
      else if (n === 'sectPr') { /* handled below */ }
    });
  }
  blocks(body);
  closeLists();
  const html = out.html;

  /* ----- page setup ----- */
  const page = JSON.parse(JSON.stringify(DEFAULT_PAGE));
  const sect = Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === 'sectPr').pop();
  if (sect) {
    const sz = kid(sect, 'pgSz');
    const mar = kid(sect, 'pgMar');
    if (sz) {
      const w = parseInt(attr(sz, 'w') || '12240', 10) / 1440;
      const hgt = parseInt(attr(sz, 'h') || '15840', 10) / 1440;
      Object.assign(page, matchPageSize(w, hgt));
      page.orient = attr(sz, 'orient') === 'landscape' || w > hgt ? 'landscape' : 'portrait';
    }
    if (mar) {
      const m = (k, d) => Math.round((parseInt(attr(mar, k) || String(d), 10) / 1440) * 100) / 100;
      page.margins = { t: m('top', 1440), r: m('right', 1440), b: m('bottom', 1440), l: m('left', 1440) };
    }
    const cols = kid(sect, 'cols');
    if (cols && parseInt(attr(cols, 'num') || '1', 10) > 1) page.cols = Math.min(3, parseInt(attr(cols, 'num'), 10));
    const part = async (kind) => {
      const ref = kids(sect, kind + 'Reference').find((r) => attr(r, 'type') === 'default') || kids(sect, kind + 'Reference')[0];
      if (!ref) return null;
      const rel = rels[attr(ref, 'id')];
      if (!rel) return null;
      const xml = await read(resolvePath('word/document.xml', rel.target));
      return xml ? parseXml(xml).documentElement : null;
    };
    const h = await part('header');
    if (h) page.header = Array.from(h.getElementsByTagName('*')).filter((e) => e.localName === 't').map((t) => t.textContent).join(' ').trim();
    const f = await part('footer');
    if (f) {
      const all = Array.from(f.getElementsByTagName('*'));
      const hasPage = all.some((e) => (e.localName === 'instrText' && /PAGE/.test(e.textContent)) || (e.localName === 'fldSimple' && /PAGE/.test(attr(e, 'instr') || '')));
      const jc = all.find((e) => e.localName === 'jc');
      if (hasPage) page.numbers = jc && attr(jc, 'val') === 'right' ? 'bottom-right' : 'bottom-center';
      page.footer = all.filter((e) => e.localName === 't').map((t) => t.textContent).join(' ').trim();
    }
  }

  let title = '';
  const core = await read('docProps/core.xml');
  if (core) {
    const t = Array.from(parseXml(core).documentElement.children).find((e) => e.localName === 'title');
    if (t) title = t.textContent.trim();
  }
  return { html, page, title };
}
