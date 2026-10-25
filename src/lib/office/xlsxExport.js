// Workbook -> .xlsx (hand-written OOXML via JSZip).
import JSZip from 'jszip';
import { colName, keyOf, parseRange } from '../sheet/addr.js';
import { createEngine } from '../sheet/engine.js';
import { SErr } from '../sheet/values.js';
import { tokenize } from '../sheet/parser.js';
import { Axis, DEFAULT_COLW, DEFAULT_ROWH, splitKey, styleIndexAt } from '../sheet/model.js';
import { chartData, parseChartRange } from '../sheet/chartData.js';
import { Spark } from '../sheet/fn_misc.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const argb = (hex) => 'FF' + String(hex).replace('#', '').toUpperCase().padStart(6, '0').slice(-6);
const valid = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

const XLFN = new Set(('IFS SWITCH TEXTJOIN CONCAT MAXIFS MINIFS XLOOKUP XMATCH FILTER SORT SORTBY UNIQUE SEQUENCE RANDARRAY LET LAMBDA MAP REDUCE SCAN BYROW BYCOL MAKEARRAY ' +
  'TEXTBEFORE TEXTAFTER TEXTSPLIT VSTACK HSTACK TOCOL TOROW CHOOSECOLS CHOOSEROWS TAKE DROP EXPAND WRAPROWS WRAPCOLS ARRAYTOTEXT VALUETOTEXT ' +
  'STDEV.S STDEV.P VAR.S VAR.P MODE.SNGL MODE.MULT PERCENTILE.INC PERCENTILE.EXC QUARTILE.INC QUARTILE.EXC PERCENTRANK.INC RANK.EQ RANK.AVG NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV ' +
  'T.DIST T.DIST.RT T.DIST.2T T.INV T.INV.2T T.TEST CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT F.DIST F.DIST.RT BINOM.DIST BINOM.INV POISSON.DIST EXPON.DIST GAMMA.DIST GAMMA LOGNORM.DIST WEIBULL.DIST ' +
  'CONFIDENCE.NORM COVARIANCE.P COVARIANCE.S Z.TEST FORECAST.LINEAR CEILING.MATH FLOOR.MATH ISOWEEKNUM DAYS IFNA XOR ARABIC BASE BITAND BITOR BITXOR BITLSHIFT BITRSHIFT DECIMAL COMBINA ' +
  'ISFORMULA SHEET SHEETS NUMBERVALUE UNICHAR UNICODE PDURATION RRI GAUSS PHI').split(' '));
const GOOGLE_ONLY = new Set(['SPLIT', 'JOIN', 'REGEXMATCH', 'REGEXEXTRACT', 'REGEXREPLACE', 'COUNTUNIQUE', 'SPARKLINE', 'FLATTEN', 'SORTN', 'ARRAYFORMULA', 'IMAGE']);

export function toXlsxFormula(f) {
  const src = f.startsWith('=') ? f.slice(1) : f;
  let toks; try { toks = tokenize(src); } catch { return src; }
  const declared = new Set();
  toks.forEach((t, i) => {
    if (t.t === 'func' && (t.v.toUpperCase() === 'LET' || t.v.toUpperCase() === 'LAMBDA')) {
      // collect names in argument positions at depth 1
      let depth = 0; let argIdx = 0;
      for (let j = i + 1; j < toks.length; j++) {
        const x = toks[j];
        if (x.t === 'op' && (x.v === '(' || x.v === '{')) depth++;
        else if (x.t === 'op' && (x.v === ')' || x.v === '}')) { depth--; if (depth === 0) break; }
        else if (depth === 1 && x.t === 'op' && x.v === ',') argIdx++;
        else if (depth === 1 && x.t === 'id') {
          const isName = t.v.toUpperCase() === 'LET' ? argIdx % 2 === 0 && toks[j + 1] && toks[j + 1].v === ',' : toks[j + 1] && toks[j + 1].v !== undefined;
          if (isName) declared.add(x.v.toLowerCase());
        }
      }
    }
  });
  let out = ''; let last = 0;
  for (const t of toks) {
    if (t.t === 'func') {
      const u = t.v.toUpperCase();
      if (XLFN.has(u)) { out += src.slice(last, t.start) + '_xlfn.' + t.v; last = t.end; }
      else if (GOOGLE_ONLY.has(u)) { /* keep as is; Excel will show #NAME? */ }
    } else if (t.t === 'id' && declared.has(t.v.toLowerCase())) {
      out += src.slice(last, t.start) + '_xlpm.' + t.v; last = t.end;
    }
  }
  return out + src.slice(last);
}

const BUILTIN_FMT = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '0.00E+00': 11, '# ?/?': 12, '# ??/??': 13, 'm/d/yyyy': 14, 'd-mmm-yy': 15, 'd-mmm': 16, 'mmm-yy': 17, 'h:mm AM/PM': 18, 'h:mm:ss AM/PM': 19, 'h:mm': 20, 'h:mm:ss': 21, 'm/d/yyyy h:mm': 22, '@': 49 };
const BORDER_STYLE = { thin: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', dotted: 'dotted', double: 'double', hair: 'hair' };
const EMU = 9525;

class StyleTable {
  constructor(book) {
    this.book = book;
    this.fonts = ['<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.numFmts = []; this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.cache = new Map(); this.dxfs = [];
  }
  idx(list, xml) { let i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; }
  xf(sidx) {
    if (!sidx) return 0;
    if (this.cache.has(sidx)) return this.cache.get(sidx);
    const s = this.book.styles[sidx] || {};
    const font = `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.st ? '<strike/>' : ''}${s.u ? '<u/>' : ''}<sz val="${s.fs || 11}"/><color rgb="${valid(s.fc) ? argb(s.fc) : 'FF000000'}"/><name val="${esc(s.ff || 'Calibri')}"/><family val="2"/></font>`;
    const fontId = this.idx(this.fonts, font);
    const fillId = valid(s.bg) ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.bg)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    let borderId = 0;
    if (s.bd) {
      const side = (n, v) => (v ? `<${n} style="${BORDER_STYLE[v[0]] || 'thin'}"><color rgb="${valid(v[1]) ? argb(v[1]) : 'FF000000'}"/></${n}>` : `<${n}/>`);
      borderId = this.idx(this.borders, `<border>${side('left', s.bd.l)}${side('right', s.bd.r)}${side('top', s.bd.t)}${side('bottom', s.bd.b)}<diagonal/></border>`);
    }
    let numFmtId = 0;
    if (s.fmt && s.fmt !== 'General') {
      if (BUILTIN_FMT[s.fmt] !== undefined) numFmtId = BUILTIN_FMT[s.fmt];
      else { let i = this.numFmts.indexOf(s.fmt); if (i < 0) { this.numFmts.push(s.fmt); i = this.numFmts.length - 1; } numFmtId = 164 + i; }
    }
    let align = '';
    const a = [];
    if (s.ha) a.push(`horizontal="${s.ha}"`);
    if (s.va) a.push(`vertical="${s.va === 'middle' ? 'center' : s.va}"`);
    if (s.wrap === 'wrap') a.push('wrapText="1"');
    if (s.ind) a.push(`indent="${s.ind}"`);
    if (s.rot) a.push(`textRotation="${s.rot < 0 ? 90 - s.rot : s.rot}"`);
    if (a.length) align = `<alignment ${a.join(' ')}/>`;
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`;
    this.xfs.push(xf);
    const id = this.xfs.length - 1; this.cache.set(sidx, id); return id;
  }
  dxf(st) {
    const font = (st.b || st.i || st.u || st.st || st.fc) ? `<font>${st.b ? '<b/>' : ''}${st.i ? '<i/>' : ''}${st.st ? '<strike/>' : ''}${st.u ? '<u/>' : ''}${valid(st.fc) ? `<color rgb="${argb(st.fc)}"/>` : ''}</font>` : '';
    const fill = valid(st.bg) ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(st.bg)}"/><bgColor rgb="${argb(st.bg)}"/></patternFill></fill>` : '';
    this.dxfs.push(`<dxf>${font}${fill}</dxf>`);
    return this.dxfs.length - 1;
  }
  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      (this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="${this.dxfs.length}">${this.dxfs.join('')}</dxfs></styleSheet>`;
  }
}

const OPS = { gt: 'greaterThan', lt: 'lessThan', ge: 'greaterThanOrEqual', le: 'lessThanOrEqual', eq: 'equal', ne: 'notEqual', between: 'between', notBetween: 'notBetween' };
const cfNum = (x) => { if (typeof x === 'string' && x.startsWith('=')) return esc(x.slice(1)); const n = Number(x); return Number.isNaN(n) || String(x).trim() === '' ? esc('"' + String(x).replace(/"/g, '""') + '"') : String(n); };
const rngText = (g) => `${colName(g.c1)}${g.r1 + 1}${g.r1 === g.r2 && g.c1 === g.c2 ? '' : ':' + colName(g.c2) + (g.r2 + 1)}`;

function cfXml(sh, st, startPrio) {
  let prio = startPrio; const out = [];
  (sh.cf || []).forEach((rule) => {
    if (!rule.ranges || !rule.ranges.length) return;
    const g0 = rule.ranges[0]; const tl = `${colName(g0.c1)}${g0.r1 + 1}`;
    const sq = rule.ranges.map(rngText).join(' ');
    let inner = '';
    const dx = () => (rule.style ? ` dxfId="${st.dxf(rule.style)}"` : '');
    const stop = rule.stop ? ' stopIfTrue="1"' : '';
    switch (rule.type) {
      case 'cell': inner = `<cfRule type="cellIs"${dx()} priority="${prio++}" operator="${OPS[rule.op] || 'equal'}"${stop}><formula>${cfNum(rule.v1)}</formula>${rule.op === 'between' || rule.op === 'notBetween' ? `<formula>${cfNum(rule.v2)}</formula>` : ''}</cfRule>`; break;
      case 'text': {
        const t = esc(String(rule.text || '').replace(/"/g, '""'));
        const m = { contains: ['containsText', `NOT(ISERROR(SEARCH("${t}",${tl})))`], notContains: ['notContains', `ISERROR(SEARCH("${t}",${tl}))`], begins: ['beginsWith', `LEFT(${tl},LEN("${t}"))="${t}"`], ends: ['endsWith', `RIGHT(${tl},LEN("${t}"))="${t}"`] }[rule.op] || ['containsText', ''];
        inner = `<cfRule type="${m[0]}"${dx()} priority="${prio++}" operator="${m[0] === 'notContains' ? 'notContains' : m[0]}" text="${esc(rule.text || '')}"><formula>${m[1]}</formula></cfRule>`; break;
      }
      case 'blank': inner = `<cfRule type="containsBlanks"${dx()} priority="${prio++}"><formula>LEN(TRIM(${tl}))=0</formula></cfRule>`; break;
      case 'notBlank': inner = `<cfRule type="notContainsBlanks"${dx()} priority="${prio++}"><formula>LEN(TRIM(${tl}))&gt;0</formula></cfRule>`; break;
      case 'error': inner = `<cfRule type="containsErrors"${dx()} priority="${prio++}"><formula>ISERROR(${tl})</formula></cfRule>`; break;
      case 'noError': inner = `<cfRule type="notContainsErrors"${dx()} priority="${prio++}"><formula>NOT(ISERROR(${tl}))</formula></cfRule>`; break;
      case 'dup': inner = `<cfRule type="duplicateValues"${dx()} priority="${prio++}"/>`; break;
      case 'unique': inner = `<cfRule type="uniqueValues"${dx()} priority="${prio++}"/>`; break;
      case 'top': case 'bottom': inner = `<cfRule type="top10"${dx()} priority="${prio++}" rank="${rule.n || 10}"${rule.pct ? ' percent="1"' : ''}${rule.type === 'bottom' ? ' bottom="1"' : ''}/>`; break;
      case 'avg': inner = `<cfRule type="aboveAverage"${dx()} priority="${prio++}"${rule.op === 'below' || rule.op === 'belowEq' ? ' aboveAverage="0"' : ''}${rule.op === 'aboveEq' || rule.op === 'belowEq' ? ' equalAverage="1"' : ''}/>`; break;
      case 'formula': inner = `<cfRule type="expression"${dx()} priority="${prio++}"${stop}><formula>${esc(toXlsxFormula(rule.f))}</formula></cfRule>`; break;
      case 'scale': {
        const cv = (s) => `<cfvo type="${s.type === 'pct' ? 'percent' : s.type}"${s.type === 'num' || s.type === 'pct' || s.type === 'percentile' ? ` val="${s.v}"` : ''}/>`;
        inner = `<cfRule type="colorScale" priority="${prio++}"><colorScale>${rule.stops.map(cv).join('')}${rule.stops.map((s) => `<color rgb="${argb(s.color)}"/>`).join('')}</colorScale></cfRule>`; break;
      }
      case 'bar': inner = `<cfRule type="dataBar" priority="${prio++}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${argb(rule.color || '#638ec6')}"/></dataBar></cfRule>`; break;
      case 'icons': {
        const n = (rule.set || 'arrows3').endsWith('4') ? 4 : (rule.set || '').endsWith('5') ? 5 : 3;
        const nm = { arrows3: '3Arrows', traffic3: '3TrafficLights1', flags3: '3Flags', stars3: '3Stars', check3: '3Symbols', arrows4: '4Arrows', rating5: '5Quarters' }[rule.set] || '3Arrows';
        const cvs = Array.from({ length: n }, (_, i) => `<cfvo type="percent" val="${Math.round((100 * i) / n)}"/>`).join('');
        inner = `<cfRule type="iconSet" priority="${prio++}"><iconSet iconSet="${nm}"${rule.reverse ? ' reverse="1"' : ''}>${cvs}</iconSet></cfRule>`; break;
      }
      default: break;
    }
    if (inner) out.push(`<conditionalFormatting sqref="${sq}">${inner}</conditionalFormatting>`);
  });
  return { xml: out.join(''), prio };
}

function dvXml(sh) {
  const items = (sh.dv || []).filter((d) => d.ranges && d.ranges.length && d.type !== 'checkbox').map((d) => {
    const sq = d.ranges.map(rngText).join(' ');
    const tl = `${colName(d.ranges[0].c1)}${d.ranges[0].r1 + 1}`;
    let type = 'custom'; let f1 = ''; let f2 = ''; let op = '';
    const opn = { between: 'between', notBetween: 'notBetween', eq: 'equal', ne: 'notEqual', gt: 'greaterThan', ge: 'greaterThanOrEqual', lt: 'lessThan', le: 'lessThanOrEqual' };
    switch (d.type) {
      case 'list': type = 'list'; f1 = esc('"' + (d.items || []).join(',').replace(/"/g, '""') + '"'); break;
      case 'listRange': type = 'list'; f1 = esc((d.range || '').replace(/^=/, '')); break;
      case 'number': case 'decimal': type = 'decimal'; f1 = cfNum(d.v1); f2 = cfNum(d.v2); op = opn[d.op || 'between']; break;
      case 'whole': type = 'whole'; f1 = cfNum(d.v1); f2 = cfNum(d.v2); op = opn[d.op || 'between']; break;
      case 'date': type = 'date'; f1 = cfNum(d.v1); f2 = cfNum(d.v2); op = opn[d.op || 'between']; break;
      case 'textLen': type = 'textLength'; f1 = cfNum(d.v1); f2 = cfNum(d.v2); op = opn[d.op || 'between']; break;
      case 'custom': type = 'custom'; f1 = esc(toXlsxFormula(d.f || '=TRUE')); break;
      default: break;
    }
    void tl;
    return `<dataValidation type="${type}"${op && op !== 'between' ? ` operator="${op}"` : ''} allowBlank="${d.allowBlank === false ? 0 : 1}" showInputMessage="1" showErrorMessage="1"${d.onInvalid === 'warn' ? ' errorStyle="warning"' : ''}${d.message ? ` error="${esc(d.message)}"` : ''}${d.help ? ` prompt="${esc(d.help)}"` : ''} sqref="${sq}"><formula1>${f1}</formula1>${f2 && (op === 'between' || op === 'notBetween' || !op) ? `<formula2>${f2}</formula2>` : ''}</dataValidation>`;
  });
  return items.length ? `<dataValidations count="${items.length}">${items.join('')}</dataValidations>` : '';
}

/* ----- charts ----- */
const CHART_NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PALETTE = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#fcd04f', '#71c287'];
const absRef = (si, book, r1, c1, r2, c2) => {
  const nm = book.sheets[si].name; const q = /^[A-Za-z_][\w.]*$/.test(nm) ? nm : "'" + nm.replace(/'/g, "''") + "'";
  const cell = (r, c) => `$${colName(c)}$${r + 1}`;
  return `${q}!${cell(r1, c1)}${r1 === r2 && c1 === c2 ? '' : ':' + cell(r2, c2)}`;
};

function chartXml(chart, book, ev, defSheet) {
  const g = parseChartRange(book, chart.range, defSheet);
  const data = chartData(chart, book, ev, defSheet);
  if (!g || !data.series.length) return null;
  const hasHeader = data.hasHeader; const hasLabels = data.hasLabels;
  const type = chart.type || 'column';
  const color = (i) => (chart.colors && chart.colors[i]) || PALETTE[i % PALETTE.length];
  const byRows = !!chart.byRows;
  const sref = (i) => {
    // reference ranges of series i for name / values
    const j = i + (hasLabels ? 1 : 0);
    if (!byRows) {
      const col = g.c1 + j;
      return { name: hasHeader ? absRef(g.si, book, g.r1, col, g.r1, col) : null, val: absRef(g.si, book, g.r1 + (hasHeader ? 1 : 0), col, g.r2, col), cat: hasLabels ? absRef(g.si, book, g.r1 + (hasHeader ? 1 : 0), g.c1, g.r2, g.c1) : null };
    }
    const row = g.r1 + j;
    return { name: hasHeader ? absRef(g.si, book, row, g.c1, row, g.c1) : null, val: absRef(g.si, book, row, g.c1 + (hasHeader ? 1 : 0), row, g.c2), cat: hasLabels ? absRef(g.si, book, g.r1, g.c1 + (hasHeader ? 1 : 0), g.r1, g.c2) : null };
  };
  const numCache = (vals) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache>`;
  const strCache = (vals) => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
  const isPie = type === 'pie' || type === 'doughnut';
  const isScatter = type === 'scatter';
  const ser = data.series.map((s, i) => {
    const r = sref(i);
    const sp = isPie ? '' : isScatter ? `<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr><a:solidFill><a:srgbClr val="${color(i).slice(1)}"/></a:solidFill></c:spPr></c:marker>` : `<c:spPr>${type === 'line' ? `<a:ln w="28575"><a:solidFill><a:srgbClr val="${color(i).slice(1)}"/></a:solidFill></a:ln>` : `<a:solidFill><a:srgbClr val="${color(i).slice(1)}"/></a:solidFill>`}</c:spPr>`;
    const dPts = isPie ? s.values.map((_, k) => `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${color(k).slice(1)}"/></a:solidFill></c:spPr></c:dPt>`).join('') : '';
    const catXml = data.hasLabels && r.cat ? (isScatter || data.xNumeric ? `<c:${isScatter ? 'xVal' : 'cat'}><c:numRef><c:f>${esc(r.cat)}</c:f>${numCache(data.catVals)}</c:numRef></c:${isScatter ? 'xVal' : 'cat'}>` : `<c:cat><c:strRef><c:f>${esc(r.cat)}</c:f>${strCache(data.cats)}</c:strRef></c:cat>`) : '';
    const valTag = isScatter ? 'yVal' : 'val';
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${r.name ? `<c:tx><c:strRef><c:f>${esc(r.name)}</c:f>${strCache([s.name])}</c:strRef></c:tx>` : `<c:tx><c:v>${esc(s.name)}</c:v></c:tx>`}${sp}${type === 'line' ? '<c:marker><c:symbol val="none"/></c:marker>' : ''}${dPts}${catXml}<c:${valTag}><c:numRef><c:f>${esc(r.val)}</c:f>${numCache(s.values)}</c:numRef></c:${valTag}>${type === 'line' && chart.smooth ? '<c:smooth val="1"/>' : ''}</c:ser>`;
  }).join('');
  const grouping = chart.stacked ? (chart.percent ? 'percentStacked' : 'stacked') : 'standard';
  let plot;
  const ids = '<c:axId val="111"/><c:axId val="222"/>';
  const catAx = `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${type === 'bar' ? 'l' : 'b'}"/>${chart.xTitle ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(chart.xTitle)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : ''}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>`;
  const valAx = (pos, id, cross) => `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/>${chart.max !== undefined && chart.max !== '' ? `<c:max val="${chart.max}"/>` : ''}${chart.min !== undefined && chart.min !== '' ? `<c:min val="${chart.min}"/>` : ''}</c:scaling><c:delete val="0"/><c:axPos val="${pos}"/><c:majorGridlines/>${chart.yTitle ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(chart.yTitle)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : ''}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/></c:valAx>`;
  const dl = chart.labels ? '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>' : '';
  if (type === 'column' || type === 'bar') plot = `<c:barChart><c:barDir val="${type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${grouping === 'standard' ? 'clustered' : grouping}"/><c:varyColors val="0"/>${ser}${dl}<c:gapWidth val="${chart.gap ?? 80}"/>${chart.stacked ? '<c:overlap val="100"/>' : ''}${ids}</c:barChart>${catAx}${valAx(type === 'bar' ? 'b' : 'l', 222, 111)}`;
  else if (type === 'line') plot = `<c:lineChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${ser}${dl}<c:marker val="1"/>${ids}</c:lineChart>${catAx}${valAx('l', 222, 111)}`;
  else if (type === 'area') plot = `<c:areaChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${ser}${dl}${ids}</c:areaChart>${catAx}${valAx('l', 222, 111)}`;
  else if (type === 'pie') plot = `<c:pieChart><c:varyColors val="1"/>${ser}${dl}<c:firstSliceAng val="0"/></c:pieChart>`;
  else if (type === 'doughnut') plot = `<c:doughnutChart><c:varyColors val="1"/>${ser}${dl}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  else if (isScatter) plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${ser}${ids}</c:scatterChart><c:valAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/></c:valAx>${valAx('l', 222, 111)}`;
  else plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}${ids}</c:barChart>${catAx}${valAx('l', 222, 111)}`;
  const title = chart.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="1"/><a:t>${esc(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  const legendPos = { right: 'r', bottom: 'b', top: 't', left: 'l' }[chart.legend || 'right'];
  const legend = chart.legend === 'none' || (!isPie && data.series.length < 2 && !chart.legend) ? '' : `<c:legend><c:legendPos val="${legendPos || 'r'}"/><c:overlay val="0"/></c:legend>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace ${CHART_NS}><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

/* ----- main ----- */
export async function exportXlsx(book, opts = {}) {
  const ev = createEngine(book, { now: Date.now() });
  const st = new StyleTable(book);
  const strings = []; const strMap = new Map();
  const sst = (s) => { let i = strMap.get(s); if (i === undefined) { i = strings.length; strings.push(s); strMap.set(s, i); } return i; };
  const zip = new JSZip();
  const files = []; // content types overrides
  const sheetsXml = []; let chartNo = 0; let drawNo = 0; let commentNo = 0; let prio = 1;
  const rootRels = [];

  for (let si = 0; si < book.sheets.length; si++) {
    const sh = book.sheets[si];
    const rows = new Map();
    const rowOf = (r) => { let x = rows.get(r); if (!x) { x = []; rows.set(r, x); } return x; };
    let maxR = 0; let maxC = 0;
    for (const k in sh.cells) {
      const cell = sh.cells[k];
      const { r, c } = splitKey(k);
      const sidx = styleIndexAt(sh, r, c);
      const xf = st.xf(sidx);
      const val = ev.value(si, r, c);
      const hasVal = cell.v !== undefined || cell.f;
      if (!hasVal && !xf) continue;
      maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
      let xml = `<c r="${k}"${xf ? ` s="${xf}"` : ''}`;
      const spill = cell.f ? ev.spillAt(si, r, c) : null;
      const v = val;
      const body = (vv) => {
        if (vv === null || vv === undefined) return ['', ''];
        if (vv instanceof SErr) return [' t="e"', `<v>${esc(vv.code)}</v>`];
        if (vv instanceof Spark || (typeof vv === 'object')) return [' t="str"', '<v></v>'];
        if (typeof vv === 'boolean') return [' t="b"', `<v>${vv ? 1 : 0}</v>`];
        if (typeof vv === 'number') return ['', Number.isFinite(vv) ? `<v>${vv}</v>` : ''];
        return [' t="str"', `<v>${escText(vv)}</v>`];
      };
      if (cell.f) {
        const [t, vx] = body(v);
        const fx = toXlsxFormula(cell.f);
        const fa = spill && spill.origin ? ` t="array" ref="${rngText({ r1: r, c1: c, r2: r + spill.region.rows - 1, c2: c + spill.region.cols - 1 })}"` : '';
        xml += `${t}><f${fa}>${escText(fx)}</f>${vx}</c>`;
      } else if (typeof cell.v === 'string') {
        xml += ` t="s"><v>${sst(cell.v)}</v></c>`;
      } else if (typeof cell.v === 'boolean') xml += ` t="b"><v>${cell.v ? 1 : 0}</v></c>`;
      else if (typeof cell.v === 'number') xml += `><v>${cell.v}</v></c>`;
      else xml += '/>';
      rowOf(r).push([c, xml]);
    }
    // spilled values (not stored as cells)
    ev.spillRegions().filter((g) => g.si === si).forEach((g) => {
      for (let i = 0; i < g.rows; i++) for (let j = 0; j < g.cols; j++) {
        if (i === 0 && j === 0) continue;
        const r = g.r + i; const c = g.c + j; const k = keyOf(r, c);
        if (sh.cells[k] && (sh.cells[k].v !== undefined || sh.cells[k].f)) continue;
        const vv = ev.value(si, r, c);
        if (vv === null || vv === undefined) continue;
        const xf = st.xf(styleIndexAt(sh, r, c));
        const t = typeof vv === 'string' ? ' t="str"' : typeof vv === 'boolean' ? ' t="b"' : vv instanceof SErr ? ' t="e"' : '';
        const vx = typeof vv === 'boolean' ? (vv ? 1 : 0) : vv instanceof SErr ? vv.code : typeof vv === 'string' ? escText(vv) : vv;
        rowOf(r).push([c, `<c r="${k}"${xf ? ` s="${xf}"` : ''}${t}><v>${vx}</v></c>`]);
        maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
      }
    });
    // rows with custom height / hidden / style only
    const extraRows = new Set([...Object.keys(sh.rowH || {}), ...Object.keys(sh.hidden.rows || {}), ...Object.keys(sh.rowS || {})].map(Number));
    extraRows.forEach((r) => { rowOf(r); maxR = Math.max(maxR, r); });
    const rowXml = [...rows.keys()].sort((a, b) => a - b).map((r) => {
      const cells = rows.get(r).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join('');
      const attrs = [];
      if (sh.rowH && sh.rowH[r]) attrs.push(`ht="${(sh.rowH[r] * 0.75).toFixed(2)}" customHeight="1"`);
      if (sh.hidden.rows && sh.hidden.rows[r]) attrs.push('hidden="1"');
      if (sh.rowS && sh.rowS[r]) { attrs.push(`s="${st.xf(sh.rowS[r])}" customFormat="1"`); }
      return `<row r="${r + 1}"${attrs.length ? ' ' + attrs.join(' ') : ''}>${cells}</row>`;
    }).join('');
    // columns
    const colIdx = new Set([...Object.keys(sh.colW || {}), ...Object.keys(sh.hidden.cols || {}), ...Object.keys(sh.colS || {})].map(Number));
    const cols = [...colIdx].sort((a, b) => a - b).map((c) => {
      const w = (sh.colW && sh.colW[c]) || DEFAULT_COLW;
      return `<col min="${c + 1}" max="${c + 1}" width="${((w - 5) / 7).toFixed(2)}" customWidth="1"${sh.hidden.cols && sh.hidden.cols[c] ? ' hidden="1"' : ''}${sh.colS && sh.colS[c] ? ` style="${st.xf(sh.colS[c])}"` : ''}/>`;
    }).join('');
    const fz = sh.freeze || { r: 0, c: 0 };
    const pane = fz.r || fz.c ? `<pane${fz.c ? ` xSplit="${fz.c}"` : ''}${fz.r ? ` ySplit="${fz.r}"` : ''} topLeftCell="${colName(fz.c)}${fz.r + 1}" activePane="${fz.r && fz.c ? 'bottomRight' : fz.r ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
    const merges = sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${rngText(m)}"/>`).join('')}</mergeCells>` : '';
    const cf = cfXml(sh, st, prio); prio = cf.prio;
    const dv = dvXml(sh);
    const filt = sh.filter && sh.filter.ref ? `<autoFilter ref="${rngText(sh.filter.ref)}"/>` : '';
    // drawing (charts) + comments
    const rels = []; let drawingTag = ''; let legacyTag = '';
    const chartsHere = (sh.charts || []).map((ch) => ({ ch, xml: chartXml(ch, book, ev, si) })).filter((x) => x.xml);
    if (chartsHere.length) {
      drawNo++;
      const colAx = new Axis(DEFAULT_COLW, { ...(sh.colW || {}), ...Object.fromEntries(Object.keys(sh.hidden.cols || {}).map((k) => [k, 0])) }, 16384);
      const rowAx = new Axis(DEFAULT_ROWH, { ...(sh.rowH || {}), ...Object.fromEntries(Object.keys(sh.hidden.rows || {}).map((k) => [k, 0])) }, 1048576);
      const drels = []; const anchors = [];
      chartsHere.forEach(({ ch, xml }, k) => {
        chartNo++;
        zip.file(`xl/charts/chart${chartNo}.xml`, xml); files.push([`/xl/charts/chart${chartNo}.xml`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml']);
        drels.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`);
        const c0 = colAx.at(ch.x || 0); const r0 = rowAx.at(ch.y || 0);
        anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${c0}</xdr:col><xdr:colOff>${Math.round(((ch.x || 0) - colAx.offset(c0)) * EMU)}</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>${Math.round(((ch.y || 0) - rowAx.offset(r0)) * EMU)}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round((ch.w || 480) * EMU)}" cy="${Math.round((ch.h || 300) * EMU)}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="Chart ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`);
      });
      zip.file(`xl/drawings/drawing${drawNo}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`);
      zip.file(`xl/drawings/_rels/drawing${drawNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drels.join('')}</Relationships>`);
      files.push([`/xl/drawings/drawing${drawNo}.xml`, 'application/vnd.openxmlformats-officedocument.drawing+xml']);
      rels.push(`<Relationship Id="rIdD" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawNo}.xml"/>`);
      drawingTag = '<drawing r:id="rIdD"/>';
    }
    const noteKeys = Object.keys(sh.notes || {}).filter((k) => sh.notes[k]);
    if (noteKeys.length) {
      commentNo++;
      zip.file(`xl/comments${commentNo}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>SoftHub</author></authors><commentList>${noteKeys.map((k) => `<comment ref="${k}" authorId="0"><text><r><t xml:space="preserve">${escText(sh.notes[k])}</t></r></text></comment>`).join('')}</commentList></comments>`);
      files.push([`/xl/comments${commentNo}.xml`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml']);
      const shapes = noteKeys.map((k, i) => { const { r, c } = splitKey(k); return `<v:shape id="_x0000_s${1025 + i}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:5pt;width:160pt;height:70pt;z-index:${i + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${c + 1}, 15, ${r}, 2, ${c + 3}, 15, ${r + 4}, 16</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${r}</x:Row><x:Column>${c}</x:Column></x:ClientData></v:shape>`; }).join('');
      zip.file(`xl/drawings/vmlDrawing${commentNo}.vml`, `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes}</xml>`);
      rels.push(`<Relationship Id="rIdC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments${commentNo}.xml"/>`);
      rels.push(`<Relationship Id="rIdV" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing${commentNo}.vml"/>`);
      legacyTag = '<legacyDrawing r:id="rIdV"/>';
    }
    if (rels.length) zip.file(`xl/worksheets/_rels/sheet${si + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
    const active = book.sheets[si].id === book.active || (!book.active && si === 0);
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      (sh.tab ? `<sheetPr><tabColor rgb="${argb(sh.tab)}"/></sheetPr>` : '') +
      `<dimension ref="A1:${colName(maxC)}${maxR + 1}"/><sheetViews><sheetView${sh.grid === false ? ' showGridLines="0"' : ''}${active ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="${DEFAULT_ROWH * 0.75}" defaultColWidth="${((DEFAULT_COLW - 5) / 7).toFixed(2)}" customHeight="1"/>` +
      (cols ? `<cols>${cols}</cols>` : '') + `<sheetData>${rowXml}</sheetData>${filt}${merges}${cf.xml}${dv}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${drawingTag}${legacyTag}</worksheet>`;
    sheetsXml.push(xml);
    zip.file(`xl/worksheets/sheet${si + 1}.xml`, xml);
  }

  const ai = Math.max(0, book.sheets.findIndex((s) => s.id === book.active));
  const names = Object.entries(book.names || {}).map(([k, v]) => `<definedName name="${esc(k)}">${esc(toXlsxFormula(v.startsWith('=') ? v : '=' + v))}</definedName>`).join('');
  const filterNames = book.sheets.map((s, i) => (s.filter && s.filter.ref ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(`'${s.name.replace(/'/g, "''")}'!$${colName(s.filter.ref.c1)}$${s.filter.ref.r1 + 1}:$${colName(s.filter.ref.c2)}$${s.filter.ref.r2 + 1}`)}</definedName>` : '')).join('');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="${ai}"/></bookViews><sheets>${book.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hiddenSheet ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets>${names || filterNames ? `<definedNames>${names}${filterNames}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  const n = book.sheets.length;
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${book.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
  zip.file('xl/styles.xml', st.xml());
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${escText(s)}</t></si>`).join('')}</sst>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(opts.title || 'Workbook')}</dc:title><dc:creator>SoftHub Sheets</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  files.push(['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml']);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${book.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${files.map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`).join('')}</Types>`);
  return zip.generateAsync({ type: opts.type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
