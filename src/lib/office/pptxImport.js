// .pptx (PowerPoint) -> Techomato Slides deck. Handles text, shapes, lines, pictures, tables, charts,
// groups, notes, backgrounds, transitions and hidden slides. Placeholders inherit position / size / colour from layout & master.
import { parseXml, kids, kid, mimeFromName, bytesToBase64 } from './util.js';
import { SHAPES, SW, SH, themeById, mixHex, newEl, newText, newShape, newLine, newImage, newTable, newChart, P, hex6 } from '../../apps/slides/model.js';

const EMU = 12700; // 1 slide unit == 1 pt == 12700 EMU
const REV_PRST = {}; Object.entries(SHAPES).forEach(([id, s]) => { if (s.prst && !REV_PRST[s.prst]) REV_PRST[s.prst] = id; });
Object.assign(REV_PRST, { flowChartProcess: 'rect', snip1Rect: 'rect', round1Rect: 'roundRect', round2SameRect: 'roundRect', flowChartAlternateProcess: 'roundRect', flowChartTerminator: 'roundRect', flowChartDecision: 'diamond', flowChartConnector: 'ellipse', rtTriangle: 'rtTriangle', bentArrow: 'arrowRight', wedgeRectCallout: 'callout', wedgeEllipseCallout: 'callout', cloudCallout: 'cloud', star7: 'star6', star8: 'star6', star10: 'star6', star12: 'star6', star16: 'star6', star24: 'star6', star32: 'star6', blockArc: 'donut', noSmoking: 'donut', plaque: 'roundRect', ellipseRibbon: 'rect' });

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const A = (el, n) => (el && el.getAttribute(n)) || '';
const path = (...a) => { const out = []; a.join('/').split('/').forEach((s) => { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }); return out.join('/'); };
const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
const q = (el, sel) => (el ? el.getElementsByTagNameNS('*', sel)[0] || null : null);
const deep = (el, ...names) => { let c = el; for (const n of names) { c = kid(c, n); if (!c) return null; } return c; };

/* ---------- colour ---------- */
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const toHsl = (h) => { const r = parseInt(h.slice(1, 3), 16) / 255; const g = parseInt(h.slice(3, 5), 16) / 255; const b = parseInt(h.slice(5, 7), 16) / 255; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; let hh = 0; let s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; } return [hh, s, l]; };
const fromHsl = ([h, s, l]) => { const f = (p, q2, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q2 - p) * 6 * t; if (t < 1 / 2) return q2; if (t < 2 / 3) return p + (q2 - p) * (2 / 3 - t) * 6; return p; }; let r; let g; let b; if (s === 0) r = g = b = l; else { const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q2; r = f(p, q2, h + 1 / 3); g = f(p, q2, h); b = f(p, q2, h - 1 / 3); } return '#' + [r, g, b].map((v) => clamp(v * 255).toString(16).padStart(2, '0')).join(''); };

function colorOf(node, ctx) {
  // node: an element holding srgbClr / schemeClr / sysClr / prstClr child
  const c = Array.from(node.children).find((k) => /^(srgbClr|schemeClr|sysClr|prstClr|scrgbClr|hslClr)$/.test(k.localName));
  if (!c) return null;
  let hex = null; let token = null;
  if (c.localName === 'srgbClr') hex = '#' + A(c, 'val').toLowerCase();
  else if (c.localName === 'sysClr') hex = '#' + (A(c, 'lastClr') || (A(c, 'val') === 'windowText' ? '000000' : 'ffffff')).toLowerCase();
  else if (c.localName === 'prstClr') hex = ({ black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080' })[A(c, 'val')] || '#000000';
  else if (c.localName === 'schemeClr') {
    let n = A(c, 'val'); n = ctx.clrMap[n] || n;
    hex = ctx.scheme[n] || '#000000';
    token = { dk1: '@text', tx1: '@text', lt1: '@bg', bg1: '@bg', accent1: '@a1', accent2: '@a2', accent3: '@a3', accent4: '@a4', accent5: '@a5', accent6: '@a6' }[n] || null;
  }
  if (!hex || !/^#[0-9a-f]{6}$/.test(hex)) hex = '#000000';
  let alpha = 1; let mod = false;
  for (const t of Array.from(c.children)) {
    const v = num(A(t, 'val')) / 100000;
    if (t.localName === 'alpha') alpha = v;
    else if (t.localName === 'lumMod') { const [h, s, l] = toHsl(hex); hex = fromHsl([h, s, Math.min(1, l * v)]); mod = true; } else if (t.localName === 'lumOff') { const [h, s, l] = toHsl(hex); hex = fromHsl([h, s, Math.max(0, Math.min(1, l + v))]); mod = true; } else if (t.localName === 'tint') { hex = mixHex(hex, '#ffffff', 1 - v); mod = true; } else if (t.localName === 'shade') { hex = mixHex(hex, '#000000', 1 - v); mod = true; } else if (t.localName === 'satMod') { const [h, s, l] = toHsl(hex); hex = fromHsl([h, Math.min(1, s * v), l]); mod = true; }
  }
  return { c: !mod && token ? token : hex, alpha };
}

function fillOf(spPr, ctx) {
  if (!spPr) return undefined; // not specified
  const sf = kid(spPr, 'solidFill'); if (sf) { const c = colorOf(sf, ctx); return c ? { fill: { t: 'solid', c: c.c }, alpha: c.alpha } : undefined; }
  if (kid(spPr, 'noFill')) return { fill: null };
  const gf = kid(spPr, 'gradFill');
  if (gf) {
    const gs = kids(deep(gf, 'gsLst'), 'gs'); const c1 = gs[0] && colorOf(gs[0], ctx); const c2 = gs[gs.length - 1] && colorOf(gs[gs.length - 1], ctx);
    const lin = kid(gf, 'lin'); const ang = lin ? Math.round(num(A(lin, 'ang')) / 60000) : 90;
    if (c1 && c2) return { fill: { t: 'grad', c1: c1.c, c2: c2.c, ang: (ang + 90) % 360 } };
  }
  return undefined;
}

function lineOf(spPr, ctx) {
  const ln = kid(spPr, 'ln'); if (!ln) return undefined;
  if (kid(ln, 'noFill')) return null;
  const sf = kid(ln, 'solidFill'); if (!sf) return undefined;
  const c = colorOf(sf, ctx); if (!c) return undefined;
  const d = A(kid(ln, 'prstDash'), 'val');
  return { c: c.c, w: Math.max(0.5, num(A(ln, 'w'), 12700) / EMU), dash: d === 'dash' || d === 'lgDash' || d === 'sysDash' ? 'dash' : d === 'sysDot' || d === 'dot' ? 'dot' : d === 'dashDot' || d === 'lgDashDot' ? 'dashdot' : 'solid' };
}

/* ---------- text ---------- */
const LVL = (n) => `lvl${n + 1}pPr`;
function mergeRPr(dst, rPr, ctx, sc) {
  if (!rPr) return dst;
  if (rPr.hasAttribute('sz')) dst.sz = num(A(rPr, 'sz')) / 100 * sc;
  if (rPr.hasAttribute('b')) dst.b = A(rPr, 'b') === '1' || A(rPr, 'b') === 'true';
  if (rPr.hasAttribute('i')) dst.i = A(rPr, 'i') === '1' || A(rPr, 'i') === 'true';
  if (rPr.hasAttribute('u')) dst.u = A(rPr, 'u') !== 'none';
  if (rPr.hasAttribute('strike')) dst.s = A(rPr, 'strike') !== 'noStrike';
  if (rPr.hasAttribute('baseline')) { const b = num(A(rPr, 'baseline')); dst.sup = b > 0; dst.sub = b < 0; }
  if (rPr.hasAttribute('cap')) dst.caps = A(rPr, 'cap') === 'all';
  const sf = kid(rPr, 'solidFill'); if (sf) { const c = colorOf(sf, ctx); if (c) dst.c = c.c; }
  const hl = kid(rPr, 'highlight'); if (hl) { const c = colorOf(hl, ctx); if (c) dst.hl = c.c; }
  const lat = kid(rPr, 'latin'); if (lat) { const t = A(lat, 'typeface'); if (t && t[0] !== '+') dst.f = t; else if (t === '+mj-lt') dst.f = '@head'; else if (t === '+mn-lt') dst.f = '@body'; }
  return dst;
}
function mergePPr(dst, pPr, ctx, sc) {
  if (!pPr) return dst;
  const al = A(pPr, 'algn'); if (al) dst.al = { l: 'left', ctr: 'center', r: 'right', just: 'just', dist: 'just' }[al] || 'left';
  if (pPr.hasAttribute('marL')) dst.marL = num(A(pPr, 'marL')) / EMU * sc;
  if (pPr.hasAttribute('indent')) dst.indent = num(A(pPr, 'indent')) / EMU * sc;
  const ls = kid(pPr, 'lnSpc'); const sp = ls && kid(ls, 'spcPct'); if (sp) dst.ls = Math.round((num(A(sp, 'val')) / 100000) * 100) / 100;
  const sb = kid(pPr, 'spcBef'); const sbp = sb && kid(sb, 'spcPts'); if (sbp) dst.sb = Math.round(num(A(sbp, 'val')) / 100 * sc);
  if (kid(pPr, 'buNone')) dst.bul = null;
  else if (kid(pPr, 'buChar')) dst.bul = 'dot';
  else if (kid(pPr, 'buAutoNum')) dst.bul = 'num';
  const d = kid(pPr, 'defRPr'); if (d) { dst.run = mergeRPr(dst.run || {}, d, ctx, sc); }
  return dst;
}

/* inherited paragraph/run defaults for a placeholder (or plain text box) */
function inheritedStyle(phType, lvl, chain, ctx, sc) {
  const out = { run: {} };
  const kind = /^(title|ctrTitle)$/.test(phType || '') ? 'titleStyle' : phType ? 'bodyStyle' : 'otherStyle';
  const sources = [];
  sources.push(deep(ctx.master, 'txStyles', kind));
  if (!phType) sources.push(deep(ctx.master, 'txStyles', 'otherStyle'));
  sources.push(...chain.map((s) => s && deep(s, 'txBody', 'lstStyle')));
  const defaults = ctx.presDefault;
  for (const src of [defaults, ...sources]) {
    if (!src) continue;
    mergePPr(out, kid(src, LVL(lvl)), ctx, sc);
  }
  return out;
}

function parseText(txBody, ctx, sc, { phType, chain, lstStyle, defColor }) {
  const bodyPr = kid(txBody, 'bodyPr');
  const auto = bodyPr && kid(bodyPr, 'normAutofit'); const fscale = auto && auto.hasAttribute('fontScale') ? num(A(auto, 'fontScale')) / 100000 : 1;
  const paras = []; let first = null; const baseLvl0 = inheritedStyle(phType, 0, chain, ctx, sc);
  let baseRun = null;
  for (const p of kids(txBody, 'p')) {
    const pPr = kid(p, 'pPr'); const lvl = pPr ? num(A(pPr, 'lvl')) : 0;
    const st = inheritedStyle(phType, lvl, chain, ctx, sc);
    if (defColor) st.run.c = defColor;
    if (lstStyle) mergePPr(st, kid(lstStyle, LVL(lvl)), ctx, sc);
    mergePPr(st, pPr, ctx, sc);
    const para = { runs: [] };
    if (st.al) para.al = st.al;
    if (lvl) para.lvl = lvl;
    // bullets only when explicitly turned on somewhere in the chain
    if (st.bul) para.bul = st.bul;
    if (st.ls && st.ls !== 1.15) para.ls = st.ls;
    if (st.sb) para.sb = st.sb;
    const endRPr = kid(p, 'endParaRPr');
    const rd = mergeRPr({ ...st.run }, endRPr, ctx, sc);
    const items = Array.from(p.children).filter((c) => /^(r|br|fld)$/.test(c.localName));
    for (const it of items) {
      if (it.localName === 'br') { const last = para.runs[para.runs.length - 1]; if (last) last.t += '\n'; else para.runs.push({ t: '\n' }); continue; }
      const t = kid(it, 't'); const text = t ? t.textContent : '';
      if (it.localName === 'fld' && /slidenum|datetime/i.test(A(it, 'type'))) continue;
      if (!text) continue;
      const rPr = kid(it, 'rPr');
      const eff = mergeRPr({ ...st.run }, rPr, ctx, sc);
      if (eff.sz) eff.sz = Math.round(eff.sz * fscale * 10) / 10;
      const hl = rPr && kid(rPr, 'hlinkClick');
      const run = { t: eff.caps ? text.toUpperCase() : text, _e: eff };
      if (hl) { const rid = hl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || hl.getAttribute('r:id'); const rel = rid && ctx.rels[rid]; if (rel) { if (rel.external) run.link = { url: rel.target }; else if (/slides\/slide\d+\.xml$/.test(rel.target)) run.link = { slide: Number(/slide(\d+)\.xml$/.exec(rel.target)[1]) - 1, _num: true }; } }
      if (!baseRun) baseRun = eff;
      para.runs.push(run);
    }
    if (!para.runs.length && !baseRun) baseRun = rd;
    paras.push({ para, rd });
    if (!first) first = para;
  }
  const base = { f: '@body', sz: 18 * sc, c: '@text', b: false, i: false, ...(baseRun || {}) };
  delete base.u; delete base.s; delete base.sup; delete base.sub; delete base.hl; delete base.caps;
  const out = paras.map(({ para, rd }) => {
    para.runs = para.runs.map((r) => {
      const e = r._e; const o = { t: r.t };
      if (e) { ['b', 'i'].forEach((k) => { if (!!e[k] !== !!base[k]) o[k] = !!e[k]; }); if (e.c && e.c !== base.c) o.c = e.c; if (e.sz && Math.abs(e.sz - base.sz) > 0.4) o.sz = e.sz; if (e.f && e.f !== base.f) o.f = e.f; if (e.u) o.u = true; if (e.s) o.s = true; if (e.hl) o.hl = e.hl; if (e.sup) o.sup = true; if (e.sub) o.sub = true; }
      if (r.link) o.link = r.link;
      return o;
    });
    void rd;
    return para;
  });
  if (!out.length) out.push({ runs: [] });
  const bp = bodyPr || null;
  const anchor = bp ? A(bp, 'anchor') : '';
  const tx = { f: base.f, sz: Math.round(base.sz * 10) / 10, c: base.c, b: !!base.b, i: !!base.i, al: (first && first.al) || baseLvl0.al || 'left', va: anchor === 'ctr' ? 'mid' : anchor === 'b' ? 'bot' : 'top' };
  if (bp) {
    const l = bp.hasAttribute('lIns') ? num(A(bp, 'lIns')) : 91440; const t = bp.hasAttribute('tIns') ? num(A(bp, 'tIns')) : 45720;
    tx.pad = Math.round(((l + t) / 2 / EMU) * sc * 10) / 10;
    if (bp && kid(bp, 'normAutofit')) tx.fit = 'shrink';
  } else tx.pad = 7;
  return { paras: out, tx };
}

/* ---------- package ---------- */
async function readRels(zip, partPath) {
  const rp = dirOf(partPath) + '_rels/' + partPath.slice(partPath.lastIndexOf('/') + 1) + '.rels';
  const f = zip.file(rp); const out = {};
  if (!f) return out;
  const d = parseXml(await f.async('string'));
  for (const r of Array.from(d.getElementsByTagNameNS('*', 'Relationship'))) {
    const ext = A(r, 'TargetMode') === 'External';
    out[A(r, 'Id')] = { type: A(r, 'Type').split('/').pop(), target: ext ? A(r, 'Target') : A(r, 'Target').startsWith('/') ? A(r, 'Target').slice(1) : path(dirOf(partPath), A(r, 'Target')), external: ext };
  }
  return out;
}
const readXml = async (zip, p) => { const f = zip.file(p); return f ? parseXml(await f.async('string')) : null; };

function readTheme(doc) {
  const scheme = {}; const cs = doc && q(doc, 'clrScheme');
  if (cs) for (const c of Array.from(cs.children)) { const k = c.localName; const v = c.firstElementChild; if (!v) continue; scheme[k] = '#' + (A(v, 'lastClr') || A(v, 'val') || '000000').toLowerCase(); }
  const fs = doc && q(doc, 'fontScheme'); const major = fs && q(q(fs, 'majorFont'), 'latin'); const minor = fs && q(q(fs, 'minorFont'), 'latin');
  return { scheme, head: major ? A(major, 'typeface') : 'Calibri', body: minor ? A(minor, 'typeface') : 'Calibri' };
}

const mimeOK = /^image\/(png|jpeg|gif|webp|svg\+xml|bmp)$/;
async function mediaUrl(zip, p) {
  const f = zip.file(p); if (!f) return null;
  const mime = mimeFromName(p); if (!mimeOK.test(mime)) return null;
  return `data:${mime};base64,${bytesToBase64(await f.async('uint8array'))}`;
}

/* ---------- elements ---------- */
function xfrmOf(spPr, grp) {
  const x = spPr && kid(spPr, 'xfrm'); if (!x) return null;
  const off = kid(x, 'off'); const ext = kid(x, 'ext'); if (!off || !ext) return null;
  let r = { x: num(A(off, 'x')), y: num(A(off, 'y')), w: num(A(ext, 'cx')), h: num(A(ext, 'cy')), rot: num(A(x, 'rot')) / 60000, flipH: A(x, 'flipH') === '1', flipV: A(x, 'flipV') === '1' };
  if (grp) r = { ...r, x: grp.ox + (r.x - grp.cx) * grp.kx, y: grp.oy + (r.y - grp.cy) * grp.ky, w: r.w * grp.kx, h: r.h * grp.ky };
  return r;
}

function geomPlace(t, ctx) { return { x: Math.round((ctx.ox + (t.x / EMU) * ctx.sc) * 10) / 10, y: Math.round((ctx.oy + (t.y / EMU) * ctx.sc) * 10) / 10, w: Math.round((t.w / EMU) * ctx.sc * 10) / 10, h: Math.round((t.h / EMU) * ctx.sc * 10) / 10 }; }

function findPh(shapes, ph) {
  const type = A(ph, 'type'); const idx = A(ph, 'idx');
  return shapes.find((s) => {
    const nv = kid(s, 'nvSpPr'); const nvPr = nv && kid(nv, 'nvPr'); const p = nvPr && kid(nvPr, 'ph');
    if (!p) return false;
    if (idx && A(p, 'idx') === idx) return true;
    return !!type && A(p, 'type') === type;
  }) || null;
}

async function convertTree(tree, zip, ctx, out, warn, opts) {
  for (const node of Array.from(tree.children)) {
    const nm = node.localName;
    if (nm === 'grpSp') {
      const gp = kid(node, 'grpSpPr'); const x = gp && kid(gp, 'xfrm');
      let grp = null;
      if (x) { const off = kid(x, 'off'); const ext = kid(x, 'ext'); const co = kid(x, 'chOff'); const ce = kid(x, 'chExt'); if (off && ext && co && ce) { const kx = num(A(ext, 'cx')) / (num(A(ce, 'cx')) || 1); const ky = num(A(ext, 'cy')) / (num(A(ce, 'cy')) || 1); grp = { ox: num(A(off, 'x')), oy: num(A(off, 'y')), cx: num(A(co, 'x')), cy: num(A(co, 'y')), kx, ky }; } }
      const gid = 'g' + Math.random().toString(36).slice(2, 8);
      const sub = []; await convertTree(node, zip, { ...ctx, grp: grp ? combine(ctx.grp, grp) : ctx.grp }, sub, warn, opts);
      sub.forEach((e) => { e.gid = gid; }); out.push(...sub);
      continue;
    }
    if (!/^(sp|pic|graphicFrame|cxnSp)$/.test(nm)) continue;
    const nv = kid(node, nm === 'sp' ? 'nvSpPr' : nm === 'pic' ? 'nvPicPr' : nm === 'cxnSp' ? 'nvCxnSpPr' : 'nvGraphicFramePr');
    const cNv = nv && kid(nv, 'cNvPr'); const nvPr = nv && kid(nv, 'nvPr'); const ph = nvPr && kid(nvPr, 'ph');
    if (cNv && A(cNv, 'hidden') === '1') continue;
    const phType = ph ? A(ph, 'type') || (A(ph, 'idx') ? 'body' : '') : '';
    if (/^(sldNum|dt|ftr|hdr)$/.test(phType)) continue;
    if (opts.inherit && ph && !opts.isSlide) continue; // placeholders of layout/master are not drawn on slides
    const name = cNv ? A(cNv, 'name') : ''; const alt = cNv ? A(cNv, 'descr') : '';
    const spPr = kid(node, nm === 'graphicFrame' ? 'xfrm' : 'spPr');
    let t = nm === 'graphicFrame' ? (() => { const x = spPr; if (!x) return null; const off = kid(x, 'off'); const ext = kid(x, 'ext'); return off && ext ? { x: num(A(off, 'x')), y: num(A(off, 'y')), w: num(A(ext, 'cx')), h: num(A(ext, 'cy')), rot: 0 } : null; })() : xfrmOf(spPr, ctx.grp);
    if (nm === 'graphicFrame' && t && ctx.grp) t = { ...t, x: ctx.grp.ox + (t.x - ctx.grp.cx) * ctx.grp.kx, y: ctx.grp.oy + (t.y - ctx.grp.cy) * ctx.grp.ky, w: t.w * ctx.grp.kx, h: t.h * ctx.grp.ky };
    let chain = [];
    if (ph && opts.isSlide) {
      const lp = findPh(ctx.layoutShapes, ph); const mp = findPh(ctx.masterShapes, ph.hasAttribute('type') && A(ph, 'type') === 'ctrTitle' ? (() => { const f = ph.cloneNode(true); f.setAttribute('type', 'title'); return f; })() : ph);
      chain = [mp, lp].filter(Boolean);
      if (!t) for (const s of [lp, mp]) { if (!s) continue; const tt = xfrmOf(kid(s, 'spPr'), null); if (tt) { t = tt; break; } }
    }
    if (!t) continue;
    const pos = geomPlace(t, ctx);
    const common = { ...pos, rot: Math.round(t.rot || 0) % 360 };
    if (name) common.name = name; if (alt) common.alt = alt;
    if (opts.lock) common.locked = true;

    if (nm === 'pic') {
      const blip = q(node, 'blip'); const rid = blip && (blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || blip.getAttribute('r:embed'));
      const rel = rid && ctx.rels[rid]; const url = rel && await mediaUrl(zip, rel.target);
      if (!url) { warn.add('Some pictures could not be imported (unsupported image format).'); continue; }
      const el = newImage(url, common.w, common.h, { ...common, fit: 'fill' });
      if (t.flipH) el.flipH = true; if (t.flipV) el.flipV = true;
      const ln = lineOf(spPr, ctx.c); if (ln) el.stroke = ln;
      const pg = spPr && kid(spPr, 'prstGeom'); if (pg && A(pg, 'prst') === 'ellipse') el.r = 0.5;
      if (q(node, 'srcRect')) { el.fit = 'cover'; }
      out.push(el);
    } else if (nm === 'cxnSp' || (nm === 'sp' && spPr && A(kid(spPr, 'prstGeom'), 'prst') === 'line')) {
      const ln = kid(spPr, 'ln'); const styl0 = kid(node, 'style'); const lr0 = styl0 && kid(styl0, 'lnRef'); const lc0 = lr0 && colorOf(lr0, ctx.c); const st = lineOf(spPr, ctx.c) || { c: lc0 ? lc0.c : '@text', w: 2, dash: 'solid' };
      const mapEnd = (e) => { if (!e) return 'none'; const ty = A(e, 'type'); return { triangle: 'arrow', stealth: 'arrow', arrow: 'open', oval: 'dot', diamond: 'diamond', none: 'none' }[ty] || 'none'; };
      const el = newLine({ ...common, stroke: st, head: mapEnd(ln && kid(ln, 'headEnd')), tail: mapEnd(ln && kid(ln, 'tailEnd')) });
      if (t.flipH) el.flipH = true; if (t.flipV) el.flipV = true;
      out.push(el);
    } else if (nm === 'graphicFrame') {
      const tbl = q(node, 'tbl'); const chartRef = q(node, 'chart');
      if (tbl) out.push(parseTable(tbl, common, ctx));
      else if (chartRef) {
        const rid = chartRef.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || chartRef.getAttribute('r:id'); const rel = rid && ctx.rels[rid];
        const cd = rel && (await readXml(zip, rel.target));
        const el = cd && parseChart(cd, common, ctx);
        if (el) out.push(el); else warn.add('A chart could not be imported.');
      } else warn.add('Some embedded objects (SmartArt, media or OLE) were skipped.');
    } else if (nm === 'sp') {
      const pg = spPr && kid(spPr, 'prstGeom'); const prst = pg ? A(pg, 'prst') : '';
      const cust = spPr && kid(spPr, 'custGeom');
      let shape = REV_PRST[prst] || 'rect';
      if (prst && !REV_PRST[prst]) warn.add('Some shapes were simplified to the nearest available shape.');
      if (cust) warn.add('Freeform shapes were converted to rectangles.');
      const fl = fillOf(spPr, ctx.c); const ln = lineOf(spPr, ctx.c);
      // style-referenced fill / line (shapes drawn with theme styles)
      const styl = kid(node, 'style');
      const txBody = kid(node, 'txBody');
      const hasText = txBody && Array.from(txBody.getElementsByTagNameNS('*', 't')).some((x) => x.textContent);
      const lstStyle = txBody && kid(txBody, 'lstStyle');
      const parsed = txBody ? parseText(txBody, ctx.c, ctx.sc, { phType, chain, lstStyle, defColor: (() => { if (phType || !styl) return null; const fr = kid(styl, 'fontRef'); const c = fr && colorOf(fr, ctx.c); return c ? c.c : null; })() }) : { paras: [{ runs: [] }], tx: { sz: 18, al: 'center', va: 'mid', pad: 7, c: '@text' } };
      let fill = fl ? fl.fill : undefined; let stroke = ln;
      if (fill === undefined && styl) { const fr = kid(styl, 'fillRef'); if (fr && A(fr, 'idx') !== '0') { const c = colorOf(fr, ctx.c); if (c) fill = { t: 'solid', c: c.c }; } }
      if (stroke === undefined && styl) { const lr = kid(styl, 'lnRef'); if (lr && A(lr, 'idx') !== '0') { const c = colorOf(lr, ctx.c); if (c) stroke = { c: c.c, w: 1.5, dash: 'solid' }; } }
      if (stroke === undefined) stroke = null; if (fill === undefined) fill = null;
      const hasGeom = shape !== 'rect' || fill || stroke;
      if (!hasText && !hasGeom) continue;
      const isText = !fill && !stroke && shape === 'rect';
      const el = isText ? newText({ ...common, fill: null, stroke: null, shape: 'rect', paras: parsed.paras, tx: parsed.tx }) : newShape(shape, { ...common, fill, stroke, paras: parsed.paras, tx: { ...parsed.tx, ...(txBody ? {} : {}) } });
      if (t.flipH) el.flipH = true; if (t.flipV) el.flipV = true;
      if (fl && fl.alpha !== undefined && fl.alpha < 1) el.opacity = Math.round(fl.alpha * 100) / 100;
      if (shape === 'roundRect') { const av = pg && q(pg, 'gd'); const m = av && /val (\d+)/.exec(A(av, 'fmla')); el.radius = m ? Math.min(0.5, num(m[1]) / 100000) : 0.1667; }
      const efx = spPr && kid(spPr, 'effectLst'); const os = efx && kid(efx, 'outerShdw');
      if (os) { const c = colorOf(os, ctx.c); const dist = num(A(os, 'dist')) / EMU * ctx.sc; const ang = num(A(os, 'dir')) / 60000 * Math.PI / 180; el.shadow = { x: Math.round(Math.cos(ang) * dist), y: Math.round(Math.sin(ang) * dist), b: Math.round(num(A(os, 'blurRad')) / EMU * ctx.sc), c: c ? c.c : '#000000', o: c ? Math.round(c.alpha * 100) / 100 : 0.35 }; }
      if (ph && (phType === 'title' || phType === 'ctrTitle')) el.ph = null;
      out.push(el);
    }
  }
}
const combine = (outer, inner) => (!outer ? inner : { ox: outer.ox + (inner.ox - outer.cx) * outer.kx, oy: outer.oy + (inner.oy - outer.cy) * outer.ky, cx: inner.cx, cy: inner.cy, kx: inner.kx * outer.kx, ky: inner.ky * outer.ky });

function parseTable(tbl, common, ctx) {
  const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => num(A(g, 'w'))); const total = cols.reduce((a, b) => a + b, 0) || 1;
  const trs = kids(tbl, 'tr'); const cells = []; const rowH = trs.map((r) => Math.round(num(A(r, 'h')) / EMU * ctx.sc));
  let sz = 0; let tc0 = null;
  const pr = kid(tbl, 'tblPr'); const hdr = pr ? A(pr, 'firstRow') === '1' : false; const band = pr ? A(pr, 'bandRow') === '1' : false;
  trs.forEach((tr) => {
    cells.push(kids(tr, 'tc').map((tc) => {
      const txBody = kid(tc, 'txBody'); const cell = { t: txBody ? kids(txBody, 'p').map((p) => Array.from(p.getElementsByTagNameNS('*', 't')).map((x) => x.textContent).join('')).join('\n') : '' };
      const r = txBody && q(txBody, 'rPr'); const p0 = txBody && q(txBody, 'pPr');
      if (r) { if (A(r, 'b') === '1') cell.b = true; if (A(r, 'i') === '1') cell.i = true; if (r.hasAttribute('sz') && !sz) sz = num(A(r, 'sz')) / 100 * ctx.sc; const sf = kid(r, 'solidFill'); if (sf) { const c = colorOf(sf, ctx.c); if (c) cell.c = c.c; } }
      if (p0 && A(p0, 'algn')) cell.al = { l: 'left', ctr: 'center', r: 'right' }[A(p0, 'algn')] || 'left';
      const tcPr = kid(tc, 'tcPr'); const f = tcPr && kid(tcPr, 'solidFill'); if (f) { const c = colorOf(f, ctx.c); if (c) cell.bg = c.c; }
      if (!tc0) tc0 = tc;
      return cell;
    }));
  });
  const nc = Math.max(1, ...cells.map((r) => r.length)); cells.forEach((r) => { while (r.length < nc) r.push({ t: '' }); });
  const el = newTable(cells.length || 1, nc, { ...common, cells: cells.length ? cells : [[{ t: '' }]], colW: cols.length ? cols.map((c) => c / total) : [1], rowH: rowH.length ? rowH : [40], hdr, band, tstyle: '@a1', tx: { sz: sz || 16 * ctx.sc, f: '@body', c: '@text' } });
  // header row defaults to the table style colours already; if cells carry explicit bg keep them
  return el;
}

const CKIND = { barChart: 'column', bar3DChart: 'column', lineChart: 'line', line3DChart: 'line', areaChart: 'area', area3DChart: 'area', pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'doughnut', scatterChart: 'scatter', ofPieChart: 'pie' };
function parseChart(doc, common, ctx) {
  const plot = q(doc, 'plotArea'); if (!plot) return null;
  const ch = Array.from(plot.children).find((c) => CKIND[c.localName]); if (!ch) return null;
  let type = CKIND[ch.localName];
  if (ch.localName === 'barChart' && A(kid(ch, 'barDir'), 'val') === 'bar') type = 'bar';
  const grouping = A(kid(ch, 'grouping'), 'val');
  const sers = kids(ch, 'ser'); const cats = []; const series = [];
  const pts = (cache) => { const o = []; if (!cache) return o; const n = num(A(kid(cache, 'ptCount'), 'val')); for (let i = 0; i < n; i++) o.push(null); kids(cache, 'pt').forEach((p) => { o[num(A(p, 'idx'))] = kid(p, 'v') ? kid(p, 'v').textContent : null; }); return o; };
  sers.forEach((s, i) => {
    const tx = q(kid(s, 'tx'), 'v'); const catN = kid(s, 'cat') || kid(s, 'xVal'); const valN = kid(s, 'val') || kid(s, 'yVal');
    const cc = catN && (q(catN, 'strCache') || q(catN, 'numCache')); const vc = valN && q(valN, 'numCache');
    if (i === 0) pts(cc).forEach((c, k) => cats[k] = c === null ? String(k + 1) : c);
    series.push({ name: tx ? tx.textContent : `Series ${i + 1}`, values: pts(vc).map((v) => (v === null || v === '' ? null : Number(v))) });
  });
  const n = Math.max(cats.length, ...series.map((s) => s.values.length));
  while (cats.length < n) cats.push(String(cats.length + 1));
  series.forEach((s) => { while (s.values.length < n) s.values.push(null); });
  const title = (() => { const t = kid(doc.documentElement.getElementsByTagNameNS('*', 'chart')[0], 'title'); return t ? Array.from(t.getElementsByTagNameNS('*', 't')).map((x) => x.textContent).join('') : ''; })();
  const lg = q(doc, 'legend'); const lp = lg && kid(lg, 'legendPos');
  const legend = lg ? { b: 'bottom', t: 'top', l: 'left', r: 'right', tr: 'right' }[A(lp, 'val') || 'r'] || 'right' : 'none';
  const dl = q(ch, 'dLbls'); const labels = !!(dl && A(kid(dl, 'showVal'), 'val') === '1');
  const colors = []; sers.forEach((s) => { const sf = kid(kid(s, 'spPr'), 'solidFill'); const c = sf && colorOf(sf, ctx.c); colors.push(c ? c.c : null); });
  const base = ['@a1', '@a2', '@a3', '@a4', '@a5', '@a6'];
  const el = newChart(type, { ...common, chart: { type, title, legend, labels, stacked: grouping === 'stacked' || grouping === 'percentStacked', smooth: !!(kid(sers[0], 'smooth') && A(kid(sers[0], 'smooth'), 'val') === '1'), colors: base.map((b, i) => colors[i] || b) }, data: { cats, series } });
  return el;
}

async function parseNotes(zip, rels) {
  const nrel = Object.values(rels).find((r) => r.type === 'notesSlide'); if (!nrel) return '';
  const d = await readXml(zip, nrel.target); if (!d) return '';
  const sps = Array.from(d.getElementsByTagNameNS('*', 'sp'));
  const body = sps.find((s) => { const ph = q(s, 'ph'); return ph && A(ph, 'type') === 'body'; });
  if (!body) return '';
  return kids(kid(body, 'txBody'), 'p').map((p) => Array.from(p.getElementsByTagNameNS('*', 't')).map((x) => x.textContent).join('')).join('\n').trim();
}

const TRANS = { fade: 'fade', dissolve: 'dissolve', push: 'push', cover: 'cover', pull: 'push', wipe: 'slide', split: 'fade', zoom: 'zoom', randomBar: 'dissolve', checker: 'dissolve', blinds: 'slide', circle: 'zoom', diamond: 'zoom', plus: 'zoom', wedge: 'fade', wheel: 'flip', cut: 'none' };
function parseTransition(doc) {
  const tr = q(doc, 'transition'); if (!tr) return { type: 'none', dur: 0.5 };
  const inner = Array.from(tr.children)[0]; const nm = inner ? inner.localName : '';
  const spd = A(tr, 'spd'); const d14 = tr.getAttributeNS('http://schemas.microsoft.com/office/powerpoint/2010/main', 'dur') || tr.getAttribute('p14:dur');
  const o = { type: TRANS[nm] || (nm ? 'fade' : 'none'), dur: d14 ? Math.max(0.2, Math.min(3, num(d14) / 1000)) : spd === 'slow' ? 1.2 : spd === 'fast' ? 0.3 : 0.6 };
  if (tr.hasAttribute('advTm')) o.after = num(A(tr, 'advTm')) / 1000;
  return o;
}

export async function importPptx(buf) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);
  const pres = await readXml(zip, 'ppt/presentation.xml');
  if (!pres) throw new Error('This file is not a PowerPoint presentation (.pptx).');
  const warn = new Set();
  const presRels = await readRels(zip, 'ppt/presentation.xml');
  const sz = q(pres, 'sldSz'); const cx = sz ? num(A(sz, 'cx'), 12192000) : 12192000; const cy = sz ? num(A(sz, 'cy'), 6858000) : 6858000;
  const wu = cx / EMU; const hu = cy / EMU; const sc = Math.min(SW / wu, SH / hu);
  const ox = (SW - wu * sc) / 2; const oy = (SH - hu * sc) / 2;
  if (Math.abs(wu / hu - 16 / 9) > 0.02) warn.add('This presentation is not 16:9; slides were fitted into a 16:9 frame.');
  const sldIds = Array.from(pres.getElementsByTagNameNS('*', 'sldId'));
  const slidePaths = sldIds.map((s) => { const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id'); return presRels[rid] && presRels[rid].target; }).filter(Boolean);
  if (!slidePaths.length) throw new Error('The presentation has no slides.');
  const presDefault = (() => { const d = q(pres, 'defaultTextStyle'); return d; })();

  // theme / master from first slide's chain
  const masterCache = {}; const layoutCache = {};
  const slides = []; let themeInfo = null; let deckTheme = null;
  for (let si = 0; si < slidePaths.length; si++) {
    const sp = slidePaths[si]; const doc = await readXml(zip, sp); if (!doc) continue;
    const rels = await readRels(zip, sp);
    const lrel = Object.values(rels).find((r) => r.type === 'slideLayout');
    const lp = lrel && lrel.target;
    const ld = lp && (layoutCache[lp] || (layoutCache[lp] = await readXml(zip, lp)));
    const lrels = lp ? await readRels(zip, lp) : {};
    const mrel = Object.values(lrels).find((r) => r.type === 'slideMaster'); const mp = mrel && mrel.target;
    const md = mp && (masterCache[mp] || (masterCache[mp] = await readXml(zip, mp)));
    const mrels = mp ? await readRels(zip, mp) : {};
    const trel = Object.values(mrels).find((r) => r.type === 'theme');
    if (!themeInfo) { themeInfo = readTheme(trel ? await readXml(zip, trel.target) : null); }
    const cm = md && q(md, 'clrMap'); const clrMap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    if (cm) for (const a of Array.from(cm.attributes)) clrMap[a.name] = a.value;
    const cctx = { scheme: themeInfo.scheme, clrMap, master: md ? md.documentElement : null, rels, presDefault };
    if (!deckTheme) {
      const s = themeInfo.scheme; const base = themeById('office');
      const bg = s[clrMap.bg1] || s.lt1 || base.bg; const tx = s[clrMap.tx1] || s.dk1 || base.text;
      const a = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((k, i) => s[k] || base.a[i]);
      deckTheme = { id: 'imported', name: 'Imported', bg, text: tx, muted: mixHex(tx, bg, 0.45), panel: mixHex(tx, bg, 0.92), a, head: themeInfo.head || 'Calibri', body: themeInfo.body || 'Calibri', deco: 'none' };
    }
    const ctxBase = { c: cctx, sc, ox, oy, rels, grp: null, layoutShapes: ld ? Array.from(kid(kid(ld.documentElement, 'cSld'), 'spTree').children).filter((n) => n.localName === 'sp') : [], masterShapes: md ? Array.from(kid(kid(md.documentElement, 'cSld'), 'spTree').children).filter((n) => n.localName === 'sp') : [] };

    const els = [];
    const showMaster = A(doc.documentElement, 'showMasterSp') !== '0';
    // layout & master artwork (non-placeholder shapes / logos) sit behind the slide's own content
    if (showMaster && md) {
      const mt = kid(kid(md.documentElement, 'cSld'), 'spTree'); const mctx = { ...ctxBase, rels: mrels, c: { ...cctx, rels: mrels }, layoutShapes: [], masterShapes: [] };
      const tmp = []; await convertTree(mt, zip, mctx, tmp, new Set(), { lock: true, inherit: true, isSlide: false });
      els.push(...tmp);
    }
    if (showMaster && ld && A(ld.documentElement, 'showMasterSp') !== '0') {
      const lt = kid(kid(ld.documentElement, 'cSld'), 'spTree'); const lctx = { ...ctxBase, rels: lrels, c: { ...cctx, rels: lrels }, layoutShapes: [], masterShapes: [] };
      const tmp = []; await convertTree(lt, zip, lctx, tmp, new Set(), { lock: true, inherit: true, isSlide: false });
      els.push(...tmp);
    }
    const tree = kid(kid(doc.documentElement, 'cSld'), 'spTree');
    await convertTree(tree, zip, ctxBase, els, warn, { isSlide: true });

    // background: slide -> layout -> master
    let bg = null;
    for (const d of [doc, ld, md]) {
      if (!d) continue; const bgEl = q(d, 'bg'); if (!bgEl) continue;
      const bgPr = kid(bgEl, 'bgPr'); const bgRef = kid(bgEl, 'bgRef');
      const r = d === doc ? rels : d === ld ? lrels : mrels;
      if (bgPr) {
        const f = fillOf(bgPr, cctx);
        if (f && f.fill && f.fill.t === 'solid') { bg = { type: 'solid', color: f.fill.c }; break; }
        if (f && f.fill && f.fill.t === 'grad') { bg = { type: 'grad', c1: f.fill.c1, c2: f.fill.c2, ang: f.fill.ang }; break; }
        const blip = q(bgPr, 'blip'); const rid = blip && (blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || blip.getAttribute('r:embed'));
        const url = rid && r[rid] && await mediaUrl(zip, r[rid].target); if (url) { bg = { type: 'image', src: url }; break; }
      } else if (bgRef) { const c = colorOf(bgRef, cctx); if (c) { bg = { type: 'solid', color: c.c }; break; } }
    }
    const rid2slide = {};
    els.forEach((e) => { if (e.type === 'text' || e.type === 'shape') e.paras.forEach((p) => p.runs.forEach((r) => { if (r.link && r.link._num) { delete r.link._num; } })); });
    void rid2slide;
    slides.push({ id: 's' + Math.random().toString(36).slice(2, 9), layout: 'blank', bg, notes: await parseNotes(zip, rels), trans: parseTransition(doc), hidden: A(doc.documentElement, 'show') === '0', els });
  }
  if (!slides.length) throw new Error('No slides could be read from this file.');
  // give every element a fresh unique id (newEl already does) and drop layout-level duplicates of the first slide's bg
  return { deck: { v: 2, w: SW, h: SH, theme: deckTheme, footer: { num: false, text: '' }, slides }, warnings: Array.from(warn) };
}
void hex6; void P; void newEl;
