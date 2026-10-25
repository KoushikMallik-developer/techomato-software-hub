// .xlsx -> workbook (Techomato Sheets model).
import JSZip from 'jszip';
import { attr, kid, kids, parseXml } from './util.js';
import { MAX_COLS, MAX_ROWS, colIndex, keyOf, parseCell, parseRange } from '../sheet/addr.js';
import { shiftFormula, tokenize } from '../sheet/parser.js';
import { Axis, DEFAULT_COLW, DEFAULT_ROWH, Draft, GRID_COLS, GRID_ROWS, newBook, newSheet, nid, uniqueSheetName } from '../sheet/model.js';
import { FUNCS } from '../sheet/functions.js';

const BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm', 37: '#,##0_);(#,##0)', 38: '#,##0_);[Red](#,##0)', 39: '#,##0.00_);(#,##0.00)', 40: '#,##0.00_);[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@' };
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
const DEF_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

const BORDER_MAP = { thin: 'thin', hair: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', mediumDashed: 'dashed', dashDot: 'dashed', mediumDashDot: 'dashed', dashDotDot: 'dashed', slantDashDot: 'dashed', mediumDashDotDot: 'dashed', dotted: 'dotted', double: 'double' };

const hexToHsl = (h) => { const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); let hh = 0; let s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; } return [hh, s, l]; };
const hslToHex = ([h, s, l]) => { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; let r; let g; let b; if (s === 0) r = g = b = l; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); } return [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
const tint = (hex, t) => { if (!t) return hex; const [h, s, l] = hexToHsl(hex); return hslToHex([h, s, t < 0 ? l * (1 + t) : l * (1 - t) + t]); };

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isNaN(n) ? d : n; };
const dirOf = (p) => p.replace(/[^/]*$/, '');
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dirOf(base) + target).split('/'); const out = [];
  parts.forEach((p) => { if (p === '..') out.pop(); else if (p !== '.') out.push(p); });
  return out.join('/');
}
async function relsOf(zip, path) {
  const rp = dirOf(path) + '_rels/' + path.split('/').pop() + '.rels';
  const f = zip.file(rp); const map = {};
  if (!f) return map;
  const doc = parseXml(await f.async('string'));
  Array.from(doc.getElementsByTagName('Relationship')).forEach((r) => { map[r.getAttribute('Id')] = { type: r.getAttribute('Type') || '', target: r.getAttribute('Target'), external: r.getAttribute('TargetMode') === 'External', path: r.getAttribute('TargetMode') === 'External' ? r.getAttribute('Target') : resolvePath(path, r.getAttribute('Target')) }; });
  return map;
}
const stripPrefixes = (f) => f.replace(/_xl(?:fn|ws|pm|l)\./gi, '').replace(/\b_xlfn\./g, '');

export async function importXlsx(buffer, opts = {}) {
  const zip = await JSZip.loadAsync(buffer);
  const wbFile = zip.file('xl/workbook.xml');
  if (!wbFile) throw new Error('Not an Excel workbook');
  const wb = parseXml(await wbFile.async('string'));
  const wbRels = await relsOf(zip, 'xl/workbook.xml');
  const date1904 = (() => { const p = kid(wb.documentElement, 'workbookPr'); return p && attr(p, 'date1904') === '1'; })();
  const warnings = { unsupported: 0, charts: 0, date1904 };

  // shared strings
  const sst = [];
  const ssf = zip.file('xl/sharedStrings.xml');
  if (ssf) {
    const doc = parseXml(await ssf.async('string'));
    kids(doc.documentElement, 'si').forEach((si) => { sst.push(Array.from(si.getElementsByTagName('t')).filter((t) => !t.parentElement || t.parentElement.localName !== 'rPh').map((t) => t.textContent).join('')); });
  }
  // theme
  let theme = [...DEF_THEME];
  const tf = zip.file('xl/theme/theme1.xml');
  if (tf) {
    const doc = parseXml(await tf.async('string'));
    const cs = doc.getElementsByTagName('a:clrScheme')[0] || Array.from(doc.getElementsByTagName('*')).find((e) => e.localName === 'clrScheme');
    if (cs) {
      const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
      theme = order.map((n, i) => { const e = Array.from(cs.children).find((c) => c.localName === n); const c = e && e.firstElementChild; return c ? (attr(c, 'val') === 'window' ? 'FFFFFF' : attr(c, 'val') === 'windowText' ? '000000' : attr(c, 'lastClr') || attr(c, 'val')) : DEF_THEME[i]; });
    }
  }
  const colorOf = (el) => {
    if (!el) return null;
    let hex = null;
    if (attr(el, 'rgb')) hex = attr(el, 'rgb').slice(-6);
    else if (attr(el, 'theme') !== null) hex = theme[parseInt(attr(el, 'theme'), 10)] || null;
    else if (attr(el, 'indexed') !== null) { const i = parseInt(attr(el, 'indexed'), 10); hex = i === 64 || i === 65 ? null : INDEXED[i] || null; }
    else if (attr(el, 'auto') === '1') return null;
    if (!hex) return null;
    hex = tint(hex.toLowerCase().padStart(6, '0'), num(attr(el, 'tint')));
    return '#' + hex.toLowerCase();
  };

  // styles
  const numFmts = {}; const fonts = []; const fills = []; const borders = []; const xfs = []; const dxfs = [];
  const sf = zip.file('xl/styles.xml');
  const readFont = (f) => {
    const o = {};
    if (!f) return o;
    const on = (n) => { const e = kid(f, n); return e && attr(e, 'val') !== '0' && attr(e, 'val') !== 'false'; };
    if (on('b')) o.b = true; if (on('i')) o.i = true; if (on('strike')) o.st = true;
    const u = kid(f, 'u'); if (u && attr(u, 'val') !== 'none') o.u = true;
    const sz = kid(f, 'sz'); if (sz && Math.abs(num(attr(sz, 'val'), 11) - 11) > 0.01) o.fs = num(attr(sz, 'val'), 11);
    const nm = kid(f, 'name'); if (nm && attr(nm, 'val') && attr(nm, 'val') !== 'Calibri') o.ff = attr(nm, 'val');
    const c = colorOf(kid(f, 'color')); if (c && c !== '#000000') o.fc = c;
    return o;
  };
  const readFill = (f) => {
    const p = kid(f, 'patternFill'); if (!p) return {};
    const t = attr(p, 'patternType');
    if (t === 'none' || t === 'gray125' || !t) { const g = kid(f, 'gradientFill'); void g; return {}; }
    const c = colorOf(kid(p, 'fgColor')) || colorOf(kid(p, 'bgColor'));
    return c && c !== '#ffffff' ? { bg: c } : {};
  };
  const readBorder = (b) => {
    const bd = {};
    [['left', 'l'], ['right', 'r'], ['top', 't'], ['bottom', 'b']].forEach(([n, k]) => {
      const e = kid(b, n); const s = e && attr(e, 'style');
      if (s && BORDER_MAP[s]) bd[k] = [BORDER_MAP[s], colorOf(kid(e, 'color')) || '#000000'];
    });
    return Object.keys(bd).length ? { bd } : {};
  };
  if (sf) {
    const doc = parseXml(await sf.async('string')); const root = doc.documentElement;
    kids(kid(root, 'numFmts'), 'numFmt').forEach((n) => { numFmts[attr(n, 'numFmtId')] = attr(n, 'formatCode'); });
    kids(kid(root, 'fonts'), 'font').forEach((f) => fonts.push(readFont(f)));
    kids(kid(root, 'fills'), 'fill').forEach((f) => fills.push(readFill(f)));
    kids(kid(root, 'borders'), 'border').forEach((b) => borders.push(readBorder(b)));
    kids(kid(root, 'cellXfs'), 'xf').forEach((x) => {
      const o = {};
      Object.assign(o, fonts[parseInt(attr(x, 'fontId') || '0', 10)] || {}, fills[parseInt(attr(x, 'fillId') || '0', 10)] || {}, borders[parseInt(attr(x, 'borderId') || '0', 10)] || {});
      const nf = attr(x, 'numFmtId') || '0';
      const code = numFmts[nf] !== undefined ? numFmts[nf] : BUILTIN[nf];
      if (code && code !== 'General') o.fmt = code;
      const al = kid(x, 'alignment');
      if (al) {
        const h = attr(al, 'horizontal'); if (h && h !== 'general') o.ha = h === 'centerContinuous' ? 'center' : h === 'fill' || h === 'justify' || h === 'distributed' ? 'left' : h;
        const v = attr(al, 'vertical'); if (v && v !== 'bottom') o.va = v === 'center' ? 'middle' : v === 'distributed' || v === 'justify' ? 'middle' : v;
        if (attr(al, 'wrapText') === '1') o.wrap = 'wrap';
        const ind = num(attr(al, 'indent')); if (ind) o.ind = ind;
        const rot = num(attr(al, 'textRotation')); if (rot && rot <= 180) o.rot = rot > 90 ? 90 - rot : rot;
      }
      xfs.push(o);
    });
    kids(kid(root, 'dxfs'), 'dxf').forEach((dx) => {
      const o = {};
      const f = kid(dx, 'font'); if (f) { Object.assign(o, readFont(f)); const c = colorOf(kid(f, 'color')); if (c) o.fc = c; }
      const fl = kid(dx, 'fill'); if (fl) { const p = kid(fl, 'patternFill'); const c = colorOf(kid(p, 'bgColor')) || colorOf(kid(p, 'fgColor')); if (c) o.bg = c; }
      delete o.fs; delete o.ff;
      dxfs.push(o);
    });
  }

  const book = newBook();
  const d = new Draft(book);
  const xfCache = new Map();
  const styleFor = (xi) => { if (xi === undefined || xi === null || xi === 0) return 0; if (xfCache.has(xi)) return xfCache.get(xi); const i = d.style(xfs[xi] || {}); xfCache.set(xi, i); return i; };
  const dateStyle = (xi) => { const f = (xfs[xi] || {}).fmt; return !!f && /[ymdhs]/i.test(f.replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/^[#0.,%\s_*()$€£¥-]+$/.test(f); };

  // names
  const names = {}; const localNames = [];
  const sheetEls = kids(kid(wb.documentElement, 'sheets'), 'sheet');
  kids(kid(wb.documentElement, 'definedNames'), 'definedName').forEach((n) => {
    const nm = attr(n, 'name'); if (nm.startsWith('_xlnm.') || attr(n, 'hidden') === '1') return;
    const text = '=' + stripPrefixes(n.textContent);
    if (attr(n, 'localSheetId') !== null) localNames.push([nm, text]); else names[nm] = text;
  });

  const sheets = [];
  const usedNames = new Set();
  for (let i = 0; i < sheetEls.length; i++) {
    const sEl = sheetEls[i];
    const rel = wbRels[attr(sEl, 'id')];
    if (!rel) continue;
    const f = zip.file(rel.path);
    if (!f) continue;
    const sh = newSheet(uniqueSheetName({ sheets: sheets.map((s) => ({ name: s.name })) }, (attr(sEl, 'name') || `Sheet${i + 1}`).slice(0, 80)));
    sh.cells = {};
    if (attr(sEl, 'state') === 'hidden' || attr(sEl, 'state') === 'veryHidden') sh.hiddenSheet = true;
    sheets.push(sh);
    usedNames.add(sh.name);
    const doc = parseXml(await f.async('string')); const root = doc.documentElement;
    const rels = await relsOf(zip, rel.path);
    const tab = kid(kid(root, 'sheetPr'), 'tabColor'); if (tab) { const c = colorOf(tab); if (c) sh.tab = c; }
    const sv = kid(kid(root, 'sheetViews'), 'sheetView');
    if (sv) {
      if (attr(sv, 'showGridLines') === '0') sh.grid = false;
      const pane = kid(sv, 'pane');
      if (pane && attr(pane, 'state') && /frozen/.test(attr(pane, 'state'))) sh.freeze = { r: Math.round(num(attr(pane, 'ySplit'))), c: Math.round(num(attr(pane, 'xSplit'))) };
    }
    // columns
    const sfp = kid(root, 'sheetFormatPr'); void sfp;
    kids(kid(root, 'cols'), 'col').forEach((c) => {
      const mn = parseInt(attr(c, 'min'), 10) - 1; const mx = Math.min(parseInt(attr(c, 'max'), 10) - 1, mn + 255, MAX_COLS - 1);
      const w = attr(c, 'width'); const hidden = attr(c, 'hidden') === '1'; const st = attr(c, 'style');
      for (let k = mn; k <= mx; k++) {
        if (w !== null && attr(c, 'customWidth') !== '0') { const px = Math.round(num(w) * 7 + 5); if (Math.abs(px - DEFAULT_COLW) > 2) sh.colW[k] = px; }
        if (hidden) sh.hidden.cols[k] = true;
        if (st && parseInt(st, 10) > 0 && mx - mn < 64) { const si = styleFor(parseInt(st, 10)); if (si) sh.colS[k] = si; }
      }
    });
    // rows & cells
    const shared = new Map(); // si -> {f, r, c}
    const spillSkip = new Set();
    let maxR = 0; let maxC = 0;
    kids(kid(root, 'sheetData'), 'row').forEach((row) => {
      const r0 = parseInt(attr(row, 'r'), 10) - 1;
      if (attr(row, 'hidden') === '1') sh.hidden.rows[r0] = true;
      const ht = attr(row, 'ht'); if (ht !== null && attr(row, 'customHeight') === '1') { const px = Math.round(num(ht) / 0.75); if (Math.abs(px - DEFAULT_ROWH) > 1) sh.rowH[r0] = px; }
      if (attr(row, 'customFormat') === '1' && attr(row, 's')) { const si = styleFor(parseInt(attr(row, 's'), 10)); if (si) sh.rowS[r0] = si; }
      let nextC = 0;
      kids(row, 'c').forEach((c) => {
        const ref = attr(c, 'r');
        let r; let col;
        if (ref) { const p = parseCell(ref); if (!p) return; r = p.r; col = p.c; } else { r = r0; col = nextC; }
        nextC = col + 1;
        const k = keyOf(r, col);
        if (spillSkip.has(k)) return;
        const xi = attr(c, 's') ? parseInt(attr(c, 's'), 10) : 0;
        const s = styleFor(xi);
        const t = attr(c, 't') || 'n';
        const fEl = kid(c, 'f'); const vEl = kid(c, 'v');
        const vtxt = vEl ? vEl.textContent : null;
        let cell = {};
        let cached;
        if (t === 's') cached = vtxt !== null ? sst[parseInt(vtxt, 10)] : undefined;
        else if (t === 'inlineStr') cached = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent).join('');
        else if (t === 'str') cached = vtxt;
        else if (t === 'b') cached = vtxt === '1';
        else if (t === 'e') cached = { err: vtxt };
        else if (t === 'd') { const dt = Date.parse(vtxt); cached = Number.isNaN(dt) ? vtxt : dt / 86400000 + 25569; }
        else if (vtxt !== null && vtxt !== '') { cached = parseFloat(vtxt); if (date1904 && dateStyle(xi)) cached += 1462; }
        if (fEl) {
          let ft = attr(fEl, 't'); let text = fEl.textContent;
          if (ft === 'shared') {
            const si = attr(fEl, 'si');
            if (text) shared.set(si, { f: text, r, c: col });
            else { const m = shared.get(si); if (m) text = shiftFormula('=' + stripPrefixes(m.f), r - m.r, col - m.c).slice(1); }
          }
          if (text) {
            const formula = '=' + stripPrefixes(text);
            let supported = true;
            try { tokenize(formula.slice(1)).forEach((tk) => { if (tk.t === 'func' && !FUNCS[tk.v.toUpperCase()] && !['LET', 'LAMBDA'].includes(tk.v.toUpperCase())) supported = false; }); } catch { supported = false; }
            if (supported) cell.f = formula;
            else { warnings.unsupported++; if (cached !== undefined) cell.v = cached && cached.err ? undefined : cached; if (cached && cached.err) cell.f = '=' + cached.err; }
            if (ft === 'array' && attr(fEl, 'ref') && supported) {
              const g = parseRange(attr(fEl, 'ref'));
              if (g && (g.r2 > g.r1 || g.c2 > g.c1)) for (let rr = g.r1; rr <= g.r2; rr++) for (let cc = g.c1; cc <= g.c2; cc++) if (rr !== r || cc !== col) spillSkip.add(keyOf(rr, cc));
            }
          } else if (cached !== undefined) cell.v = cached && cached.err ? undefined : cached;
        } else if (cached !== undefined) {
          if (cached && cached.err) cell.f = '=' + cached.err; else cell.v = cached;
        }
        if (s) cell.s = s;
        if (cell.f === undefined && cell.v === undefined && cell.s === undefined) return;
        if (cell.v === '' && cell.f === undefined) { delete cell.v; if (cell.s === undefined) return; }
        sh.cells[k] = cell;
        if (r > maxR) maxR = r; if (col > maxC) maxC = col;
      });
    });
    // spilled array members that were cached values (non-array formula engines): handled by skipping
    sh.rows = Math.min(MAX_ROWS, Math.max(GRID_ROWS, maxR + 101));
    sh.cols = Math.min(MAX_COLS, Math.max(GRID_COLS, maxC + 6));
    // merges
    kids(kid(root, 'mergeCells'), 'mergeCell').forEach((m) => { const g = parseRange(attr(m, 'ref') || ''); if (g && (g.r2 > g.r1 || g.c2 > g.c1)) sh.merges.push(g); });
    // auto filter
    const af = kid(root, 'autoFilter'); if (af && attr(af, 'ref')) { const g = parseRange(attr(af, 'ref')); if (g) sh.filter = { ref: g, cols: {} }; }
    // data validation
    kids(kid(root, 'dataValidations'), 'dataValidation').forEach((dv) => {
      const sq = (attr(dv, 'sqref') || '').split(/\s+/).map(parseRange).filter(Boolean); if (!sq.length) return;
      const type = attr(dv, 'type'); const f1 = (kid(dv, 'formula1') || {}).textContent || ''; const f2 = (kid(dv, 'formula2') || {}).textContent || '';
      const opMap = { equal: 'eq', notEqual: 'ne', greaterThan: 'gt', greaterThanOrEqual: 'ge', lessThan: 'lt', lessThanOrEqual: 'le', between: 'between', notBetween: 'notBetween' };
      const rule = { id: nid('dv'), ranges: sq, allowBlank: attr(dv, 'allowBlank') !== '0', onInvalid: attr(dv, 'errorStyle') === 'warning' || attr(dv, 'errorStyle') === 'information' ? 'warn' : 'reject' };
      if (attr(dv, 'error')) rule.message = attr(dv, 'error'); if (attr(dv, 'prompt')) rule.help = attr(dv, 'prompt');
      if (type === 'list') { if (/^".*"$/.test(f1.trim())) { rule.type = 'list'; rule.items = f1.trim().slice(1, -1).replace(/""/g, '"').split(','); } else { rule.type = 'listRange'; rule.range = f1; } }
      else if (['whole', 'decimal', 'date', 'textLength'].includes(type)) { rule.type = type === 'textLength' ? 'textLen' : type; rule.op = opMap[attr(dv, 'operator') || 'between']; rule.v1 = f1; rule.v2 = f2; }
      else if (type === 'custom') { rule.type = 'custom'; rule.f = '=' + stripPrefixes(f1); }
      else return;
      sh.dv.push(rule);
    });
    // conditional formatting
    kids(root, 'conditionalFormatting').forEach((cfEl) => {
      const ranges = (attr(cfEl, 'sqref') || '').split(/\s+/).map(parseRange).filter(Boolean); if (!ranges.length) return;
      kids(cfEl, 'cfRule').forEach((rl) => {
        const type = attr(rl, 'type'); const dx = attr(rl, 'dxfId') !== null ? dxfs[parseInt(attr(rl, 'dxfId'), 10)] || {} : {};
        const fs = kids(rl, 'formula').map((x) => x.textContent);
        const base = { id: nid('cf'), ranges, style: dx };
        const opMap = { equal: 'eq', notEqual: 'ne', greaterThan: 'gt', greaterThanOrEqual: 'ge', lessThan: 'lt', lessThanOrEqual: 'le', between: 'between', notBetween: 'notBetween' };
        const unq = (x) => (x && /^".*"$/.test(x) ? x.slice(1, -1) : x);
        let rule = null;
        if (type === 'cellIs') rule = { ...base, type: 'cell', op: opMap[attr(rl, 'operator')] || 'eq', v1: unq(fs[0]), v2: unq(fs[1]) };
        else if (type === 'containsText' || type === 'beginsWith' || type === 'endsWith' || type === 'notContainsText') rule = { ...base, type: 'text', op: type === 'containsText' ? 'contains' : type === 'beginsWith' ? 'begins' : type === 'endsWith' ? 'ends' : 'notContains', text: attr(rl, 'text') || '' };
        else if (type === 'containsBlanks') rule = { ...base, type: 'blank' }; else if (type === 'notContainsBlanks') rule = { ...base, type: 'notBlank' };
        else if (type === 'containsErrors') rule = { ...base, type: 'error' }; else if (type === 'notContainsErrors') rule = { ...base, type: 'noError' };
        else if (type === 'duplicateValues') rule = { ...base, type: 'dup' }; else if (type === 'uniqueValues') rule = { ...base, type: 'unique' };
        else if (type === 'top10') rule = { ...base, type: attr(rl, 'bottom') === '1' ? 'bottom' : 'top', n: parseInt(attr(rl, 'rank') || '10', 10), pct: attr(rl, 'percent') === '1' };
        else if (type === 'aboveAverage') { const below = attr(rl, 'aboveAverage') === '0'; const eqa = attr(rl, 'equalAverage') === '1'; rule = { ...base, type: 'avg', op: below ? (eqa ? 'belowEq' : 'below') : (eqa ? 'aboveEq' : 'above') }; }
        else if (type === 'expression') rule = { ...base, type: 'formula', f: '=' + stripPrefixes(fs[0] || 'TRUE') };
        else if (type === 'colorScale') {
          const cs = kid(rl, 'colorScale'); const vos = kids(cs, 'cfvo'); const cols = kids(cs, 'color');
          rule = { id: base.id, ranges, type: 'scale', stops: vos.map((v, k) => ({ type: ({ percent: 'pct', min: 'min', max: 'max', num: 'num', percentile: 'percentile' })[attr(v, 'type')] || 'num', v: attr(v, 'val') || '', color: colorOf(cols[k]) || '#ffffff' })) };
        } else if (type === 'dataBar') { const db = kid(rl, 'dataBar'); rule = { id: base.id, ranges, type: 'bar', color: colorOf(kid(db, 'color')) || '#638ec6' }; }
        else if (type === 'iconSet') { const is = kid(rl, 'iconSet'); const nm = attr(is, 'iconSet') || '3TrafficLights1'; const mp = { '3Arrows': 'arrows3', '3ArrowsGray': 'arrows3', '3TrafficLights1': 'traffic3', '3TrafficLights2': 'traffic3', '3Flags': 'flags3', '3Stars': 'stars3', '3Symbols': 'check3', '3Symbols2': 'check3', '4Arrows': 'arrows4', '4ArrowsGray': 'arrows4', '5Quarters': 'rating5', '5Rating': 'rating5' }; rule = { id: base.id, ranges, type: 'icons', set: mp[nm] || 'traffic3', reverse: attr(is, 'reverse') === '1' }; }
        if (rule) { if (attr(rl, 'stopIfTrue') === '1') rule.stop = true; sh.cf.push(rule); }
      });
    });
    // hyperlinks -> HYPERLINK formulas
    kids(kid(root, 'hyperlinks'), 'hyperlink').forEach((h) => {
      const g = parseCell(attr(h, 'ref') || ''); if (!g) return;
      const rid = attr(h, 'id'); const target = rid && rels[rid] ? rels[rid].target : attr(h, 'location') ? '#' + attr(h, 'location') : null; if (!target) return;
      const k = keyOf(g.r, g.c); const cell = sh.cells[k] || {};
      if (cell.f) return;
      const shown = cell.v !== undefined ? String(cell.v) : target;
      sh.cells[k] = { ...cell, f: `=HYPERLINK("${target.replace(/"/g, '""')}","${shown.replace(/"/g, '""')}")` };
      delete sh.cells[k].v;
    });
    // comments (notes)
    const cRel = Object.values(rels).find((x) => /\/comments$/.test(x.type));
    if (cRel && zip.file(cRel.path)) {
      const cd = parseXml(await zip.file(cRel.path).async('string'));
      Array.from(cd.getElementsByTagName('comment')).forEach((cm) => {
        const ref = attr(cm, 'ref'); const txt = Array.from(cm.getElementsByTagName('t')).map((t) => t.textContent).join('');
        if (ref && txt) sh.notes[ref.replace(/\$/g, '')] = txt.replace(/^[^\n]*:\n/, (m) => (m.length < 40 ? '' : m));
      });
    }
    // charts
    const dRel = Object.values(rels).find((x) => /\/drawing$/.test(x.type));
    if (dRel && zip.file(dRel.path)) {
      try { await importCharts(zip, dRel.path, sh, sheetEls.length, warnings, names, sheets); } catch (e) { warnings.charts++; }
    }
  }
  if (!sheets.length) throw new Error('The workbook has no sheets');
  localNames.forEach(([nm, text]) => { if (!(nm in names)) names[nm] = text; });
  // finish
  const out = d.done();
  out.sheets = sheets; out.names = names;
  const act = kid(kid(wb.documentElement, 'bookViews'), 'workbookView');
  const ai = act ? Math.min(sheets.length - 1, parseInt(attr(act, 'activeTab') || '0', 10)) : 0;
  out.active = sheets[ai].id;
  return { book: out, warnings };
}

/* ----- charts ----- */
async function importCharts(zip, dPath, sh, nSheets, warnings, names, sheets) {
  const doc = parseXml(await zip.file(dPath).async('string'));
  const rels = await relsOf(zip, dPath);
  const anchors = Array.from(doc.documentElement.children).filter((a) => /Anchor$/.test(a.localName));
  const colAx = new Axis(DEFAULT_COLW, sh.colW, 16384); const rowAx = new Axis(DEFAULT_ROWH, sh.rowH, 1048576);
  for (const a of anchors) {
    const gf = Array.from(a.getElementsByTagName('*')).find((e) => e.localName === 'chart');
    if (!gf) continue;
    const rid = attr(gf, 'id'); const rel = rels[rid]; if (!rel || !zip.file(rel.path)) continue;
    const from = kid(a, 'from'); const to = kid(a, 'to'); const ext = kid(a, 'ext');
    const pos = (e, ax, tag, off) => { if (!e) return 0; const i = parseInt((kid(e, tag) || {}).textContent || '0', 10); const o = parseInt((kid(e, off) || {}).textContent || '0', 10) / 9525; return ax.offset(i) + o; };
    const x = pos(from, colAx, 'col', 'colOff'); const y = pos(from, rowAx, 'row', 'rowOff');
    let w = 480; let h = 300;
    if (to) { w = Math.max(160, pos(to, colAx, 'col', 'colOff') - x); h = Math.max(120, pos(to, rowAx, 'row', 'rowOff') - y); } else if (ext) { w = num(attr(ext, 'cx')) / 9525; h = num(attr(ext, 'cy')) / 9525; }
    const ch = await parseChartXml(zip, rel.path, sh, sheets);
    if (!ch) { warnings.charts++; continue; }
    sh.charts.push({ id: nid('ch'), ...ch, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }
}
const REFRX = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/;
async function parseChartXml(zip, path, sh, sheets) {
  const doc = parseXml(await zip.file(path).async('string'));
  const all = (n, root = doc) => Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === n);
  const plot = all('plotArea')[0]; if (!plot) return null;
  const typeEl = Array.from(plot.children).find((e) => /Chart$/.test(e.localName) && e.localName !== 'chart'); if (!typeEl) return null;
  const nm = typeEl.localName;
  let type = ({ barChart: 'column', bar3DChart: 'column', lineChart: 'line', line3DChart: 'line', areaChart: 'area', pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'doughnut', scatterChart: 'scatter', ofPieChart: 'pie' })[nm];
  if (!type) return null;
  if (type === 'column' && (kid(typeEl, 'barDir') && attr(kid(typeEl, 'barDir'), 'val') === 'bar')) type = 'bar';
  const grouping = kid(typeEl, 'grouping') ? attr(kid(typeEl, 'grouping'), 'val') : 'standard';
  const sers = kids(typeEl, 'ser');
  if (!sers.length) return null;
  const fOf = (el) => { const f = el && Array.from(el.getElementsByTagName('*')).find((e) => e.localName === 'f'); return f ? f.textContent : null; };
  const parseRef = (t) => { if (!t) return null; const m = REFRX.exec(t.trim()); if (!m) return null; const sn = (m[1] ? m[1].replace(/''/g, "'") : m[2]); const g = parseRange(m[3]); return g ? { sn, g } : null; };
  const refs = []; let sheetName = null;
  const items = sers.map((s) => ({ tx: parseRef(fOf(kid(s, 'tx'))), cat: parseRef(fOf(kid(s, 'cat') || kid(s, 'xVal'))), val: parseRef(fOf(kid(s, 'val') || kid(s, 'yVal'))) }));
  items.forEach((it) => [it.tx, it.cat, it.val].forEach((r) => { if (r) { refs.push(r.g); sheetName = sheetName || r.sn; } }));
  if (!refs.length) return null;
  const g = { r1: Math.min(...refs.map((x) => x.r1)), c1: Math.min(...refs.map((x) => x.c1)), r2: Math.max(...refs.map((x) => x.r2)), c2: Math.max(...refs.map((x) => x.c2)) };
  const v0 = items[0].val ? items[0].val.g : null;
  const byRows = !!v0 && v0.r1 === v0.r2 && v0.c2 > v0.c1;
  const text = (e) => (e ? Array.from(e.getElementsByTagName('*')).filter((x) => x.localName === 't').map((x) => x.textContent).join('') : '');
  const titleEl = Array.from(doc.documentElement.getElementsByTagName('*')).find((e) => e.localName === 'chart');
  const title = text(kid(titleEl, 'title'));
  const legendEl = kid(titleEl, 'legend'); const lp = legendEl && kid(legendEl, 'legendPos');
  const colors = sers.map((s) => { const sp = kid(s, 'spPr'); const c = sp && Array.from(sp.getElementsByTagName('*')).find((e) => e.localName === 'srgbClr'); return c ? '#' + attr(c, 'val').toLowerCase() : null; });
  const q = /^[A-Za-z_][\w.]*$/.test(sheetName) ? sheetName : `'${sheetName.replace(/'/g, "''")}'`;
  const cell = (r, c) => `${colName2(c)}${r + 1}`;
  return {
    type, range: `${q}!${cell(g.r1, g.c1)}:${cell(g.r2, g.c2)}`, title, byRows, stacked: grouping === 'stacked' || grouping === 'percentStacked', percent: grouping === 'percentStacked',
    legend: legendEl ? ({ r: 'right', l: 'left', t: 'top', b: 'bottom' })[lp ? attr(lp, 'val') : 'r'] || 'right' : 'none',
    colors: colors.every(Boolean) ? colors : undefined, headerRow: items.some((i) => i.tx) ? true : false, headerCol: items.some((i) => i.cat) ? true : false,
    smooth: kid(sers[0], 'smooth') ? attr(kid(sers[0], 'smooth'), 'val') === '1' : false, labels: !!all('dLbls', typeEl).some((e) => { const sv = kid(e, 'showVal'); return sv && attr(sv, 'val') === '1'; }),
  };
}
const colName2 = (i) => { let s = ''; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
void colIndex; void GRID_COLS;
