// HTML (live editor DOM) -> .docx using the `docx` library (loaded on demand).
import { cssColorToHex, dataUrlToBytes, imageSize, rasterizeToPng } from './util.js';
import { PAGE_SIZES } from '../../apps/docs/templates.js';

const INLINE_BG_OK = new Set(['SPAN', 'A', 'B', 'I', 'U', 'S', 'MARK', 'FONT', 'STRONG', 'EM', 'CODE', 'SUB', 'SUP', 'STRIKE', 'DEL']);
const px2twip = (px) => Math.round(px * 15);

export function pageDimsInches(page) {
  const base = page.size === 'custom' ? { w: page.cw || 8.5, h: page.ch || 11 } : PAGE_SIZES[page.size] || PAGE_SIZES.letter;
  return page.orient === 'landscape' ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
}

export async function exportDocx(root, { title = 'Document', page }) {
  const D = await import('docx');
  const sheet = root.closest('.docsheet');
  const prevZoom = sheet ? sheet.style.zoom : '';
  if (sheet) sheet.style.zoom = '1';

  try {
    const dims = pageDimsInches(page);
    const contentWidthPx = (dims.w - page.margins.l - page.margins.r) * 96;
    const baseCs = getComputedStyle(root);
    const baseFont = baseCs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const baseSize = Math.round(parseFloat(baseCs.fontSize) * 0.75 * 2);

    // Pre-load images that Word cannot embed directly (webp, svg ...) and measure the rest.
    const imgInfo = new Map();
    for (const img of Array.from(root.querySelectorAll('img'))) {
      const src = img.getAttribute('src') || '';
      if (!src.startsWith('data:')) continue;
      const d = dataUrlToBytes(src);
      const nat = await imageSize(src);
      let type = null;
      if (/image\/png/.test(d.mime)) type = 'png';
      else if (/image\/jpe?g/.test(d.mime)) type = 'jpg';
      else if (/image\/gif/.test(d.mime)) type = 'gif';
      else if (/image\/bmp/.test(d.mime)) type = 'bmp';
      let data = d.bytes;
      if (!type) {
        const r = await rasterizeToPng(src);
        if (!r) continue;
        data = r.bytes;
        type = 'png';
      }
      imgInfo.set(img, { data, type, w: nat.w, h: nat.h });
    }

    const numberingConfigs = [];
    let olCounter = 0;
    const bulletLevels = Array.from({ length: 9 }, (_, i) => ({
      level: i, format: D.LevelFormat.BULLET, text: ['•', '◦', '▪'][i % 3], alignment: D.AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
    }));
    numberingConfigs.push({ reference: 'bullets', levels: bulletLevels });
    const numLevels = () => Array.from({ length: 9 }, (_, i) => ({
      level: i, format: [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN][i % 3], text: `%${i + 1}.`, alignment: D.AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
    }));

    /* ----- inline ----- */
    const runProps = (el) => {
      const cs = getComputedStyle(el);
      const p = {};
      const w = parseInt(cs.fontWeight, 10) || (cs.fontWeight === 'bold' ? 700 : 400);
      if (w >= 600) p.bold = true;
      if (cs.fontStyle === 'italic') p.italics = true;
      const deco = cs.textDecorationLine || cs.textDecoration || '';
      if (deco.includes('underline')) p.underline = { type: D.UnderlineType.SINGLE };
      if (deco.includes('line-through')) p.strike = true;
      const color = cssColorToHex(cs.color);
      if (color && color !== '000000' && color !== '111111') p.color = color;
      if (INLINE_BG_OK.has(el.tagName) && !el.classList.contains('cmt')) {
        const bg = cssColorToHex(cs.backgroundColor);
        if (bg) p.shading = { type: D.ShadingType.CLEAR, fill: bg, color: 'auto' };
      }
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (fam && fam !== baseFont) p.font = fam;
      const size = Math.round(parseFloat(cs.fontSize) * 0.75 * 2);
      if (size && size !== baseSize) p.size = size;
      if (el.closest('sup') || cs.verticalAlign === 'super') p.superScript = true;
      if (el.closest('sub') || cs.verticalAlign === 'sub') p.subScript = true;
      if (/^(CODE)$/.test(el.tagName)) p.font = 'Courier New';
      return p;
    };

    const imageRun = (img) => {
      const info = imgInfo.get(img);
      if (!info) return null;
      let wpx = info.w;
      const sw = img.style.width;
      if (/px$/.test(sw)) wpx = parseFloat(sw);
      else if (/%$/.test(sw)) wpx = (parseFloat(sw) / 100) * contentWidthPx;
      else if (img.getAttribute('width')) wpx = parseFloat(img.getAttribute('width'));
      wpx = Math.max(8, Math.min(wpx, contentWidthPx));
      const hpx = (wpx * info.h) / info.w;
      return new D.ImageRun({ type: info.type, data: info.data, transformation: { width: Math.round(wpx), height: Math.round(hpx) }, altText: { title: img.alt || 'image', description: img.alt || 'image', name: 'image' } });
    };

    const inline = (node, out, ctx) => {
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3) {
          let t = c.nodeValue.replace(/ /g, ' ');
          if (!ctx.pre) t = t.replace(/[ \t\r\n]+/g, ' ');
          if (!t) return;
          const el = c.parentElement;
          if (ctx.pre) {
            t.split('\n').forEach((line, i) => out.push(new D.TextRun({ text: line, break: i ? 1 : 0, ...runProps(el), font: 'Courier New' })));
          } else {
            const props = runProps(el);
            if (ctx.link) { props.color = props.color || '0563C1'; props.underline = props.underline || { type: D.UnderlineType.SINGLE }; }
            out.push(new D.TextRun({ text: t, ...props }));
          }
          return;
        }
        if (c.nodeType !== 1) return;
        const tag = c.tagName;
        if (tag === 'BR') {
          // a trailing <br> only keeps an empty block open in the editor; it is not a line break
          let last = true;
          for (let n = c.nextSibling; n; n = n.nextSibling) { if (!(n.nodeType === 3 && !n.nodeValue.trim())) { last = false; break; } }
          if (!(last && c.parentElement && /^(P|H[1-6]|LI|TD|TH|BLOCKQUOTE|DIV)$/.test(c.parentElement.tagName))) out.push(new D.TextRun({ break: 1 }));
          return;
        }
        if (tag === 'IMG') { const r = imageRun(c); if (r) out.push(r); return; }
        if (tag === 'INPUT') return;
        if (tag === 'A' && /^(https?:|mailto:)/i.test(c.getAttribute('href') || '')) {
          const kidsOut = [];
          inline(c, kidsOut, { ...ctx, link: true });
          if (kidsOut.length) out.push(new D.ExternalHyperlink({ link: c.getAttribute('href'), children: kidsOut }));
          return;
        }
        if (/^(UL|OL|TABLE)$/.test(tag)) return; // handled as blocks
        inline(c, out, ctx);
      });
    };

    /* ----- paragraphs ----- */
    const paraProps = (el, extra = {}) => {
      const cs = getComputedStyle(el);
      const props = {};
      const ta = cs.textAlign;
      if (ta === 'center') props.alignment = D.AlignmentType.CENTER;
      else if (ta === 'right' || ta === 'end') props.alignment = D.AlignmentType.RIGHT;
      else if (ta === 'justify') props.alignment = D.AlignmentType.BOTH;
      const sp = {};
      const mt = px2twip(parseFloat(cs.marginTop) || 0);
      const mb = px2twip(parseFloat(cs.marginBottom) || 0);
      if (mt) sp.before = mt;
      sp.after = mb;
      const lh = parseFloat(cs.lineHeight);
      const fs = parseFloat(cs.fontSize);
      if (lh && fs && cs.lineHeight !== 'normal') { sp.line = Math.round((lh / fs) * 240); sp.lineRule = D.LineRuleType.AUTO; }
      props.spacing = sp;
      const left = (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.paddingLeft) || 0);
      const ti = parseFloat(cs.textIndent) || 0;
      if (left > 1 || ti) props.indent = { left: px2twip(left), firstLine: ti > 0 ? px2twip(ti) : undefined };
      if (cs.direction === 'rtl') props.bidirectional = true;
      return { ...props, ...extra };
    };

    const makeParagraph = (el, ctx = {}, extra = {}) => {
      const runs = [];
      inline(el, runs, ctx);
      return new D.Paragraph({ children: runs, ...paraProps(el, ctx.skipProps ? {} : {}), ...extra });
    };

    const HEADINGS = [D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3, D.HeadingLevel.HEADING_4, D.HeadingLevel.HEADING_5, D.HeadingLevel.HEADING_6];

    /* ----- lists ----- */
    const listBlocks = (list, level, ref, out, ctx) => {
      const ordered = list.tagName === 'OL';
      const check = list.classList.contains('checklist');
      let reference = ref;
      if (!reference) {
        if (ordered) { reference = 'ol-' + ++olCounter; numberingConfigs.push({ reference, levels: numLevels() }); }
        else reference = 'bullets';
      }
      Array.from(list.children).forEach((li) => {
        if (li.tagName !== 'LI') return;
        const runs = [];
        if (check) runs.push(new D.TextRun({ text: li.getAttribute('data-done') === 'true' ? '☑ ' : '☐ ' }));
        const sub = [];
        li.childNodes.forEach((c) => {
          if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) sub.push(c);
        });
        inline(li, runs, ctx);
        const cs = getComputedStyle(li);
        const props = {};
        if (cs.textAlign === 'center') props.alignment = D.AlignmentType.CENTER;
        else if (cs.textAlign === 'right') props.alignment = D.AlignmentType.RIGHT;
        else if (cs.textAlign === 'justify') props.alignment = D.AlignmentType.BOTH;
        if (check) out.push(new D.Paragraph({ children: runs, indent: { left: 360 * (level + 1) + 360 }, spacing: { after: 40 }, ...props }));
        else out.push(new D.Paragraph({ children: runs, numbering: { reference, level: Math.min(level, 8) }, spacing: { after: 40 }, ...props }));
        sub.forEach((s) => listBlocks(s, level + 1, s.tagName === 'OL' && ordered ? reference : s.tagName === 'OL' ? null : 'bullets', out, ctx));
      });
    };

    /* ----- tables ----- */
    const convertTable = (table) => {
      const rows = Array.from(table.rows);
      const noBorders = table.dataset.borders === 'none';
      const gridWidths = [];
      let widest = 0;
      rows.forEach((tr) => {
        const total = Array.from(tr.cells).reduce((a, c) => a + (c.colSpan || 1), 0);
        if (total > widest) {
          widest = total;
          gridWidths.length = 0;
          Array.from(tr.cells).forEach((c) => {
            const span = c.colSpan || 1;
            const w = px2twip(c.getBoundingClientRect().width) / span;
            for (let i = 0; i < span; i++) gridWidths.push(Math.round(w));
          });
        }
      });
      const trs = rows.map((tr, ri) => {
        const cells = Array.from(tr.cells).map((td) => {
          const cs = getComputedStyle(td);
          const bg = cssColorToHex(cs.backgroundColor);
          const kids = [];
          const hasBlock = Array.from(td.children).some((c) => /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE)$/.test(c.tagName));
          if (hasBlock) convertBlocks(td, kids, {});
          else {
            const runs = [];
            inline(td, runs, {});
            const pr = paraProps(td);
            delete pr.indent;
            pr.spacing = { after: 0 };
            kids.push(new D.Paragraph({ children: runs, ...pr }));
          }
          if (!kids.length) kids.push(new D.Paragraph({}));
          const bcolor = cssColorToHex(cs.borderTopColor) || 'A0AEC0';
          const side = noBorders || cs.borderTopStyle === 'none' || parseFloat(cs.borderTopWidth) === 0
            ? { style: D.BorderStyle.NONE, size: 0, color: 'auto' }
            : { style: D.BorderStyle.SINGLE, size: 4, color: bcolor };
          const va = cs.verticalAlign;
          return new D.TableCell({
            children: kids,
            columnSpan: td.colSpan > 1 ? td.colSpan : undefined,
            rowSpan: td.rowSpan > 1 ? td.rowSpan : undefined,
            shading: bg ? { type: D.ShadingType.CLEAR, fill: bg, color: 'auto' } : (td.tagName === 'TH' ? { type: D.ShadingType.CLEAR, fill: 'F1EDE6', color: 'auto' } : undefined),
            verticalAlign: va === 'middle' ? D.VerticalAlign.CENTER : va === 'bottom' ? D.VerticalAlign.BOTTOM : undefined,
            borders: { top: side, bottom: side, left: side, right: side },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          });
        });
        return new D.TableRow({ children: cells, tableHeader: ri === 0 && tr.cells[0] && tr.cells[0].tagName === 'TH' });
      });
      return new D.Table({ rows: trs, width: { size: 100, type: D.WidthType.PERCENTAGE }, columnWidths: gridWidths.length ? gridWidths : undefined });
    };

    /* ----- blocks ----- */
    const convertBlocks = (parent, out, ctx) => {
      parent.childNodes.forEach((c) => {
        if (c.nodeType === 3) {
          if (c.nodeValue.trim()) out.push(new D.Paragraph({ children: [new D.TextRun({ text: c.nodeValue.replace(/\s+/g, ' ') })] }));
          return;
        }
        if (c.nodeType !== 1) return;
        const tag = c.tagName;
        if (/^H[1-6]$/.test(tag)) {
          out.push(makeParagraph(c, ctx, { heading: HEADINGS[Number(tag[1]) - 1], keepNext: true }));
        } else if (tag === 'P') {
          if (c.classList.contains('doc-title')) out.push(makeParagraph(c, ctx, { heading: D.HeadingLevel.TITLE }));
          else out.push(makeParagraph(c, ctx));
        } else if (tag === 'UL' || tag === 'OL') {
          listBlocks(c, 0, null, out, ctx);
        } else if (tag === 'TABLE') {
          out.push(convertTable(c));
          out.push(new D.Paragraph({ spacing: { after: 0 } }));
        } else if (tag === 'BLOCKQUOTE') {
          const hasBlock = Array.from(c.children).some((k) => /^(P|H[1-6]|UL|OL)$/.test(k.tagName));
          const tmp = [];
          if (hasBlock) convertBlocks(c, tmp, ctx);
          else tmp.push(makeParagraph(c, ctx));
          out.push(...tmp);
        } else if (tag === 'PRE') {
          const runs = [];
          inline(c, runs, { ...ctx, pre: true });
          out.push(new D.Paragraph({ children: runs, shading: { type: D.ShadingType.CLEAR, fill: 'F3F3F3', color: 'auto' }, spacing: { after: 120 } }));
        } else if (tag === 'HR') {
          if (c.classList.contains('page-break')) out.push(new D.Paragraph({ children: [new D.PageBreak()] }));
          else out.push(new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } }, spacing: { after: 120 } }));
        } else if (tag === 'IMG') {
          const r = imageRun(c);
          if (r) out.push(new D.Paragraph({ children: [r] }));
        } else if (tag === 'DIV' || tag === 'SECTION') {
          const hasBlock = Array.from(c.children).some((k) => /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|DIV)$/.test(k.tagName));
          if (hasBlock) convertBlocks(c, out, ctx);
          else out.push(makeParagraph(c, ctx));
        } else {
          out.push(makeParagraph(c, ctx));
        }
      });
    };

    const children = [];
    convertBlocks(root, children, {});
    if (!children.length) children.push(new D.Paragraph({}));

    /* ----- header / footer / page ----- */
    const headerKids = [];
    const footerKids = [];
    if (page.header) headerKids.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: page.header, color: '666666', size: 18 })] }));
    if (page.footer) footerKids.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: page.footer, color: '666666', size: 18 })] }));
    if (page.numbers && page.numbers !== 'none') {
      const right = /right/.test(page.numbers);
      const para = new D.Paragraph({ alignment: right ? D.AlignmentType.RIGHT : D.AlignmentType.CENTER, children: [new D.TextRun({ children: [D.PageNumber.CURRENT], color: '666666', size: 18 })] });
      (/^top/.test(page.numbers) ? headerKids : footerKids).push(para);
    }
    const headers = headerKids.length ? { default: new D.Header({ children: headerKids }) } : undefined;
    const footers = footerKids.length ? { default: new D.Footer({ children: footerKids }) } : undefined;

    const sizeBase = page.size === 'custom' ? { w: page.cw, h: page.ch } : PAGE_SIZES[page.size] || PAGE_SIZES.letter;
    const doc = new D.Document({
      creator: 'Techomato Docs',
      title,
      styles: {
        default: { document: { run: { font: baseFont, size: baseSize } } },
        paragraphStyles: [
          ...[[1, 40, true], [2, 32, true], [3, 26, true], [4, 22, true], [5, 20, true], [6, 20, false]].map(([n, size, bold]) => ({
            id: 'Heading' + n, name: 'heading ' + n, basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size, bold, italics: n === 6, color: '111111', font: baseFont }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true },
          })),
          { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 52, bold: true, color: '111111', font: baseFont }, paragraph: { spacing: { after: 120 } } },
        ],
      },
      numbering: { config: numberingConfigs },
      sections: [{
        properties: {
          page: {
            size: { width: Math.round(sizeBase.w * 1440), height: Math.round(sizeBase.h * 1440), orientation: page.orient === 'landscape' ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT },
            margin: { top: Math.round(page.margins.t * 1440), right: Math.round(page.margins.r * 1440), bottom: Math.round(page.margins.b * 1440), left: Math.round(page.margins.l * 1440) },
          },
          column: page.cols > 1 ? { count: page.cols, space: 720 } : undefined,
        },
        headers,
        footers,
        children,
      }],
    });
    return await D.Packer.toBlob(doc);
  } finally {
    if (sheet) sheet.style.zoom = prevZoom;
  }
}
