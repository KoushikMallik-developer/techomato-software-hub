// Techomato Slides -> .pptx (PowerPoint). Uses pptxgenjs, then patches transitions / hidden slides into the XML.
import { dataUrlToBytes, bytesToBase64, rasterizeToPng } from './util.js';
import { SHAPES, rc, rf, hex6, decoShapes, slideBg, textBase, mixHex, isEmptyParas } from '../../apps/slides/model.js';

const PX = 1 / 72; // 960 px == 13.333 in
const inch = (v) => Math.round(v * PX * 10000) / 10000;
const C = (c, th) => hex6(rc(c, th));
const DASH = { solid: 'solid', dash: 'dash', dot: 'sysDot', dashdot: 'dashDot' };
const HEAD = { none: 'none', arrow: 'triangle', open: 'arrow', dot: 'oval', diamond: 'diamond' };
const CHART_KIND = { column: 'bar', bar: 'bar', line: 'line', area: 'area', pie: 'pie', doughnut: 'doughnut', scatter: 'line', combo: 'bar' };

async function gradientPng(f, th, w = 1600, h = 900) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const a = ((f.ang ?? 90) - 90) * (Math.PI / 180); const cx = w / 2; const cy = h / 2; const L = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h) / 2;
  const gr = g.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
  gr.addColorStop(0, rc(f.c1, th)); gr.addColorStop(1, rc(f.c2, th)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return 'image/png;base64,' + c.toDataURL('image/png').split(',')[1];
}

async function imageData(src) {
  if (!src) return null;
  try {
    const { bytes, mime } = dataUrlToBytes(src);
    if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/gif') return `${mime};base64,${bytesToBase64(bytes)}`;
  } catch { /* fall through to rasterise */ }
  const png = await rasterizeToPng(src);
  return png ? `image/png;base64,${bytesToBase64(png.bytes)}` : null;
}

const linkOf = (l) => (l ? (l.slide !== undefined ? { slide: l.slide + 1 } : l.url ? { url: l.url } : undefined) : undefined);

function runOpts(r, base, th) {
  const o = {};
  o.bold = !!(r.b !== undefined ? r.b : base.b); o.italic = !!(r.i !== undefined ? r.i : base.i);
  if (r.u) o.underline = { style: 'sng' };
  if (r.s) o.strike = 'sngStrike';
  o.color = C(r.c || base.c, th);
  o.fontSize = Math.round((r.sz || base.sz) * 10) / 10;
  o.fontFace = rf(r.f || base.f, th);
  if (r.hl) o.highlight = C(r.hl, th);
  if (r.sup) o.superscript = true;
  if (r.sub) o.subscript = true;
  const hl = linkOf(r.link); if (hl) o.hyperlink = hl;
  return o;
}

function textRuns(el, th) {
  const base = textBase(el); const out = [];
  const paras = el.paras && el.paras.length ? el.paras : [{ runs: [] }];
  paras.forEach((p, pi) => {
    const popt = {};
    const al = p.al || base.al; popt.align = al === 'just' ? 'justify' : al;
    if (p.bul) popt.bullet = p.bul === 'num' ? { type: 'number' } : true;
    if (p.lvl) popt.indentLevel = p.lvl;
    popt.lineSpacingMultiple = p.ls || base.ls || 1.15;
    if (p.sb) popt.paraSpaceBefore = p.sb;
    const last = pi === paras.length - 1;
    if (!p.runs.length) { out.push({ text: ' ', options: { ...popt, fontSize: base.sz, fontFace: rf(base.f, th), color: C(base.c, th), breakLine: !last } }); return; }
    p.runs.forEach((r, ri) => {
      const t = base.caps ? r.t.toUpperCase() : r.t;
      out.push({ text: t, options: { ...(ri === 0 ? popt : {}), ...runOpts(r, base, th), breakLine: ri === p.runs.length - 1 && !last } });
    });
  });
  return out;
}

const darkHex = (h) => { const n = parseInt(h, 16); return (((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000) < 140; };

async function addEl(pptx, slide, el, th, warn) {
  const common = { x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h) };
  if (el.rot) common.rotate = el.rot;
  const opacity = el.opacity === undefined ? 1 : el.opacity;
  const transp = Math.round((1 - opacity) * 100);
  const sh = el.shadow;
  const shadow = sh ? { type: 'outer', color: C(sh.c || '#000000', th), blur: sh.b ?? 8, offset: Math.hypot(sh.x ?? 4, sh.y ?? 4), angle: Math.round(((Math.atan2(sh.y ?? 4, sh.x ?? 4) * 180) / Math.PI + 360) % 360), opacity: sh.o ?? 0.35 } : undefined;
  const alt = el.alt || undefined;

  if (el.type === 'text' || el.type === 'shape') {
    const prst = (SHAPES[el.shape || 'rect'] || SHAPES.rect).prst;
    const o = { ...common };
    if (el.flipH) o.flipH = true;
    if (el.flipV) o.flipV = true;
    const f = el.fill;
    if (f) { const col = f.t === 'grad' ? mixHex(rc(f.c1, th), rc(f.c2, th), 0.5) : rc(f.c, th); o.fill = { color: hex6(col), transparency: transp }; }
    if (el.stroke) o.line = { color: C(el.stroke.c, th), width: el.stroke.w, dashType: DASH[el.stroke.dash] || 'solid' };
    if (shadow) o.shadow = shadow;
    const base = textBase(el);
    o.valign = base.va === 'mid' ? 'middle' : base.va === 'bot' ? 'bottom' : 'top';
    o.margin = base.pad; o.fit = base.fit === 'shrink' ? 'shrink' : 'none';
    if (prst === 'roundRect') o.rectRadius = Math.min(el.w, el.h) * (el.radius ?? 0.18) * PX;
    const st = pptx.ShapeType[prst];
    if (st && prst !== 'rect') o.shape = st; else if (!st) warn.shapes++;
    if (el.type === 'shape' && !el.fill) o.fill = { type: 'none' };
    const empty = isEmptyParas(el.paras);
    slide.addText(empty ? [{ text: ' ', options: { fontSize: base.sz } }] : textRuns(el, th), o);
  } else if (el.type === 'line') {
    const st = el.stroke || { c: '@text', w: 3, dash: 'solid' };
    const o = { ...common, line: { color: C(st.c, th), width: st.w, dashType: DASH[st.dash] || 'solid', beginArrowType: HEAD[el.head || 'none'], endArrowType: HEAD[el.tail || 'none'] } };
    if (el.flipH) o.flipH = true;
    if (el.flipV) o.flipV = true;
    if (shadow) o.shadow = shadow;
    slide.addShape(pptx.ShapeType.line, o);
  } else if (el.type === 'image') {
    const data = await imageData(el.src);
    if (!data) { warn.images++; return; }
    const o = { ...common, data, altText: alt || 'Image' };
    if (el.flipH) o.flipH = true;
    if (el.flipV) o.flipV = true;
    if (el.fit === 'contain' || el.fit === 'cover') o.sizing = { type: el.fit, w: common.w, h: common.h };
    if ((el.r || 0) >= 0.5) o.rounding = true;
    if (transp) o.transparency = transp;
    const hl = linkOf(el.link); if (hl) o.hyperlink = hl;
    slide.addImage(o);
    if (el.stroke) slide.addShape(pptx.ShapeType.rect, { ...common, fill: { type: 'none' }, line: { color: C(el.stroke.c, th), width: el.stroke.w, dashType: DASH[el.stroke.dash] || 'solid' } });
  } else if (el.type === 'table') {
    const base = textBase(el); const hdrC = rc(el.tstyle || '@a1', th); const panel = rc('@panel', th); const B = el.border || { c: '#d1d5db', w: 1 };
    const hdDark = darkHex(hex6(hdrC));
    const bd = B.w ? { type: 'solid', pt: B.w, color: C(B.c, th) } : { type: 'none' };
    const rows = el.cells.map((row, r) => row.map((cell) => {
      const isH = el.hdr && r === 0;
      const bg = cell.bg ? rc(cell.bg, th) : isH ? hdrC : el.band && ((el.hdr ? r : r + 1) % 2 === 0) ? panel : null;
      return { text: cell.t || ' ', options: { bold: cell.b ?? isH, italic: !!cell.i, color: cell.c ? C(cell.c, th) : isH ? (hdDark ? 'FFFFFF' : '111111') : C(base.c, th), fontSize: base.sz, fontFace: rf(base.f, th), align: cell.al || 'left', valign: cell.va === 'top' ? 'top' : cell.va === 'bot' ? 'bottom' : 'middle', fill: bg ? { color: hex6(bg) } : undefined, border: [bd, bd, bd, bd] } };
    }));
    const tw = common.w; const cw = el.colW.map((f) => Math.round(f * tw * 10000) / 10000);
    slide.addTable(rows, { x: common.x, y: common.y, w: tw, colW: cw, rowH: el.rowH.map((v) => inch(v)), margin: [0.04, 0.1, 0.04, 0.1] });
  } else if (el.type === 'chart') {
    const c = el.chart; const kind = CHART_KIND[c.type] || 'bar';
    if (c.type === 'scatter' || c.type === 'combo') warn.charts++;
    const data = el.data.series.map((s) => ({ name: s.name || 'Series', labels: el.data.cats, values: s.values.map((v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))) }));
    const colors = (c.colors || []).map((x) => C(x, th));
    const legend = c.legend && c.legend !== 'none';
    const opt = {
      ...common, showLegend: !!legend, legendPos: { bottom: 'b', top: 't', left: 'l', right: 'r' }[c.legend] || 'b', legendColor: C('@text', th), legendFontSize: 12, legendFontFace: th.body,
      showTitle: !!c.title, title: c.title || undefined, titleColor: C('@text', th), titleFontSize: 16, titleFontFace: th.body, showValue: !!c.labels, dataLabelColor: C('@text', th), dataLabelFontSize: 11,
      catAxisLabelColor: C('@muted', th), valAxisLabelColor: C('@muted', th), catAxisLabelFontSize: 11, valAxisLabelFontSize: 11, catAxisLabelFontFace: th.body, valAxisLabelFontFace: th.body,
      valGridLine: { color: hex6(mixHex(th.text, th.bg, 0.85)), size: 0.75 }, catGridLine: { style: 'none' },
    };
    if (colors.length) opt.chartColors = kind === 'pie' || kind === 'doughnut' ? el.data.cats.map((_, i) => colors[i % colors.length]) : data.map((_, i) => colors[i % colors.length]);
    if (kind === 'bar') { opt.barDir = c.type === 'bar' ? 'bar' : 'col'; opt.barGrouping = c.stacked ? 'stacked' : 'clustered'; }
    if (kind === 'area') opt.barGrouping = c.stacked ? 'stacked' : 'standard';
    if (kind === 'line') { opt.lineSmooth = !!c.smooth; opt.lineDataSymbolSize = 7; opt.lineSize = 3; }
    if (kind === 'doughnut') opt.holeSize = 55;
    if (c.xTitle) { opt.showCatAxisTitle = true; opt.catAxisTitle = c.xTitle; opt.catAxisTitleColor = C('@muted', th); }
    if (c.yTitle) { opt.showValAxisTitle = true; opt.valAxisTitle = c.yTitle; opt.valAxisTitleColor = C('@muted', th); }
    slide.addChart(pptx.charts[kind.toUpperCase()], data, opt);
  }
  void alt;
}

/* ---- XML patching: transitions + hidden slides ---- */
const TRANS_XML = { fade: '<p:fade/>', dissolve: '<p:dissolve/>', slide: '<p:cover dir="l"/>', cover: '<p:cover dir="l"/>', push: '<p:push dir="l"/>', zoom: '<p:zoom dir="in"/>', flip: '<p:fade/>' };

async function patchPptx(blob, deck) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  for (let i = 0; i < deck.slides.length; i++) {
    const path = `ppt/slides/slide${i + 1}.xml`; const f = zip.file(path); if (!f) continue;
    let xml = await f.async('string'); const s = deck.slides[i];
    const tr = s.trans || {};
    const type = tr.type && tr.type !== 'none' ? tr.type : null;
    if (type || tr.after) {
      const d = tr.dur || 0.5; const spd = d <= 0.4 ? 'fast' : d <= 1 ? 'med' : 'slow';
      const adv = tr.after ? ` advTm="${Math.round(tr.after * 1000)}"` : '';
      const inner = type ? TRANS_XML[type] || '<p:fade/>' : '';
      const t = `<p:transition spd="${spd}"${adv}>${inner}</p:transition>`;
      xml = xml.replace(/<p:transition[\s\S]*?<\/p:transition>/, '');
      // schema order: cSld, clrMapOvr, transition, timing
      if (xml.includes('</p:clrMapOvr>')) xml = xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + t);
      else xml = xml.replace('</p:cSld>', '</p:cSld>' + t);
    }
    if (s.hidden) xml = xml.replace(/<p:sld\b([^>]*)>/, (m, a) => (/\sshow=/.test(a) ? m : `<p:sld${a} show="0">`));
    zip.file(path, xml);
  }
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' });
}

export async function exportPptx(deck, { title } = {}) {
  const mod = await import('pptxgenjs');
  const PptxGenJS = mod.default || mod;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'SOFTHUB169', width: 13.3333, height: 7.5 });
  pptx.layout = 'SOFTHUB169';
  pptx.title = title || 'Presentation'; pptx.author = 'Techomato Slides'; pptx.company = 'Techomato Softwares';
  const th = deck.theme;
  pptx.theme = { headFontFace: th.head, bodyFontFace: th.body };
  const warn = { images: 0, shapes: 0, charts: 0 };
  const deco = decoShapes(th).map((d) => ({ rot: 0, ...d }));
  for (let i = 0; i < deck.slides.length; i++) {
    const s = deck.slides[i]; const slide = pptx.addSlide();
    const bg = slideBg(s, th);
    if (bg.t === 'solid') slide.background = { color: C(bg.c, th) };
    else if (bg.t === 'grad') slide.background = { data: await gradientPng(bg, th) };
    else { const d = await imageData(bg.src); if (d) slide.background = { data: d }; }
    for (const d of deco) await addEl(pptx, slide, d._corner ? { ...d, flipH: true } : d, th, warn);
    for (const el of s.els) await addEl(pptx, slide, el, th, warn);
    const ft = deck.footer || {};
    const skip = ft.skipTitle && i === 0;
    if (ft.text && !skip) slide.addText(ft.text, { x: inch(36), y: inch(500), w: inch(500), h: inch(28), fontSize: 14, color: C('@muted', th), fontFace: th.body, margin: 0, valign: 'middle' });
    if (ft.num && !skip) slide.slideNumber = { x: inch(960 - 36 - 60), y: inch(500), w: inch(60), h: inch(28), fontSize: 14, color: C('@muted', th), fontFace: th.body, align: 'right' };
    if (s.notes) slide.addNotes(s.notes);
  }
  const blob = await pptx.write({ outputType: 'blob' });
  return await patchPptx(blob, deck);
}
