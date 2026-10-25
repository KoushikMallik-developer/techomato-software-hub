// Formula tokenizer + parser (Excel syntax) and reference-rewriting helpers.
import { MAX_COLS, MAX_ROWS, colIndex, colName } from './addr.js';

const SHEET = "(?:'(?:[^']|'')+'|[A-Za-z_\\u00c0-\\uffff][\\w.\\u00c0-\\uffff]*)!";
const CELLP = '\\$?[A-Za-z]{1,3}\\$?\\d+';
const RE_REF = new RegExp(`(${SHEET})?(?:(${CELLP})(?::(${CELLP}))?|(\\$?[A-Za-z]{1,3}):(\\$?[A-Za-z]{1,3})|(\\$?\\d+):(\\$?\\d+))(?![\\w.(!])`, 'y');
const RE_NUM = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const RE_STR = /"(?:[^"]|"")*"/y;
const RE_ERR = /#(?:N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!)/iy;
const RE_ID = /[A-Za-z_\\À-￿][\w.À-￿]*/y;
const RE_OP = /<=|>=|<>|[-+*/^&=<>%(),;{}:@#]/y;
const RE_WS = /\s+/y;

const part = (s, kind) => {
  const abs = s.startsWith('$');
  const body = s.replace('$', '');
  return { abs, body };
};

function cellPart(text) {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(text);
  return { absC: !!m[1], c: colIndex(m[2].toUpperCase()), absR: !!m[3], r: parseInt(m[4], 10) - 1 };
}

export function unquoteSheet(s) {
  let n = s.slice(0, -1); // drop "!"
  if (n.startsWith("'")) n = n.slice(1, -1).replace(/''/g, "'");
  return n;
}
export const quoteSheet = (n) => (/^[A-Za-z_][\w.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'");

export function tokenize(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    RE_WS.lastIndex = i;
    if (RE_WS.test(src)) { i = RE_WS.lastIndex; continue; }
    const start = i;
    const ch = src[i];
    let m;
    if (ch === '"') {
      RE_STR.lastIndex = i;
      m = RE_STR.exec(src);
      if (!m) throw new Error('unterminated string');
      out.push({ t: 'str', v: m[0].slice(1, -1).replace(/""/g, '"'), start, end: (i = RE_STR.lastIndex) });
      continue;
    }
    if (ch === '#') {
      RE_ERR.lastIndex = i;
      if ((m = RE_ERR.exec(src))) { out.push({ t: 'err', v: m[0].toUpperCase(), start, end: (i = RE_ERR.lastIndex) }); continue; }
    }
    RE_REF.lastIndex = i;
    if ((m = RE_REF.exec(src)) && (ch !== '.' || m[1])) {
      const tok = { t: 'ref', sheet: m[1] ? unquoteSheet(m[1]) : null, start, end: RE_REF.lastIndex };
      if (m[2]) {
        tok.a = cellPart(m[2]);
        tok.b = m[3] ? cellPart(m[3]) : null;
        tok.kind = m[3] ? 'range' : 'cell';
      } else if (m[4]) {
        const a = part(m[4]); const b = part(m[5]);
        tok.a = { absC: a.abs, c: colIndex(a.body.toUpperCase()), absR: true, r: 0 };
        tok.b = { absC: b.abs, c: colIndex(b.body.toUpperCase()), absR: true, r: MAX_ROWS - 1 };
        tok.kind = 'col';
      } else {
        const a = part(m[6]); const b = part(m[7]);
        tok.a = { absC: true, c: 0, absR: a.abs, r: parseInt(a.body, 10) - 1 };
        tok.b = { absC: true, c: MAX_COLS - 1, absR: b.abs, r: parseInt(b.body, 10) - 1 };
        tok.kind = 'row';
      }
      const bad = [tok.a, tok.b].some((p) => p && (p.c >= MAX_COLS || p.r >= MAX_ROWS || p.r < 0));
      if (!bad) { out.push(tok); i = tok.end; continue; }
    }
    RE_NUM.lastIndex = i;
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      if ((m = RE_NUM.exec(src))) { out.push({ t: 'num', v: parseFloat(m[0]), start, end: (i = RE_NUM.lastIndex) }); continue; }
    }
    RE_ID.lastIndex = i;
    if ((m = RE_ID.exec(src))) {
      i = RE_ID.lastIndex;
      let k = i;
      while (src[k] === ' ') k++;
      out.push({ t: src[k] === '(' ? 'func' : 'id', v: m[0], start, end: i });
      continue;
    }
    RE_OP.lastIndex = i;
    if ((m = RE_OP.exec(src))) { out.push({ t: 'op', v: m[0], start, end: (i = RE_OP.lastIndex) }); continue; }
    throw new Error('Unexpected character ' + ch);
  }
  return out;
}

/* ---------- Parser ---------- */
export function parseFormula(src) {
  const toks = tokenize(src.startsWith('=') ? src.slice(1) : src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
  const eat = (v) => { if (!isOp(v)) throw new Error('Expected ' + v); p++; };

  const CMP = new Set(['=', '<>', '<', '>', '<=', '>=']);
  function cmp() {
    let l = concat();
    while (peek() && peek().t === 'op' && CMP.has(peek().v)) { const op = toks[p++].v; l = { t: 'bin', op, a: l, b: concat() }; }
    return l;
  }
  function concat() {
    let l = add();
    while (isOp('&')) { p++; l = { t: 'bin', op: '&', a: l, b: add() }; }
    return l;
  }
  function add() {
    let l = mul();
    while (isOp('+') || isOp('-')) { const op = toks[p++].v; l = { t: 'bin', op, a: l, b: mul() }; }
    return l;
  }
  function mul() {
    let l = pow();
    while (isOp('*') || isOp('/')) { const op = toks[p++].v; l = { t: 'bin', op, a: l, b: pow() }; }
    return l;
  }
  function pow() {
    let l = unary();
    while (isOp('^')) { p++; l = { t: 'bin', op: '^', a: l, b: unary() }; }
    return l;
  }
  function unary() {
    if (isOp('-')) { p++; return { t: 'un', op: '-', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    if (isOp('@')) { p++; return unary(); }
    return postfix();
  }
  function postfix() {
    let e = primary();
    for (;;) {
      if (isOp('%')) { p++; e = { t: 'pct', a: e }; continue; }
      if (isOp('(') && (e.t === 'call' || e.t === 'icall')) {
        p++; const args = [];
        if (isOp(')')) p++;
        else for (;;) { args.push(isOp(',') || isOp(')') ? { t: 'empty' } : cmp()); if (isOp(',')) { p++; continue; } eat(')'); break; }
        e = { t: 'icall', fn: e, args }; continue;
      }
      break;
    }
    return e;
  }
  function primary() {
    const t = toks[p++];
    if (!t) throw new Error('Unexpected end');
    switch (t.t) {
      case 'num': return { t: 'num', v: t.v };
      case 'str': return { t: 'str', v: t.v };
      case 'err': return { t: 'err', v: t.v };
      case 'ref': {
        const node = { t: 'ref', sheet: t.sheet, r1: t.a.r, c1: t.a.c, r2: (t.b || t.a).r, c2: (t.b || t.a).c, kind: t.kind };
        if (node.r1 > node.r2) [node.r1, node.r2] = [node.r2, node.r1];
        if (node.c1 > node.c2) [node.c1, node.c2] = [node.c2, node.c1];
        if (isOp('#')) { p++; node.spill = true; }
        return node;
      }
      case 'func': {
        eat('(');
        const args = [];
        if (isOp(')')) { p++; return { t: 'call', name: t.v.toUpperCase(), args }; }
        for (;;) {
          if (isOp(',') || isOp(')')) args.push({ t: 'empty' }); else args.push(cmp());
          if (isOp(',')) { p++; continue; }
          eat(')');
          break;
        }
        return { t: 'call', name: t.v.toUpperCase(), args };
      }
      case 'id': {
        const u = t.v.toUpperCase();
        if (u === 'TRUE') return { t: 'bool', v: true };
        if (u === 'FALSE') return { t: 'bool', v: false };
        return { t: 'name', name: t.v };
      }
      case 'op':
        if (t.v === '(') { const e = cmp(); eat(')'); return { t: 'paren', a: e }; }
        if (t.v === '{') {
          const rows = [[]];
          for (;;) {
            rows[rows.length - 1].push(cmp());
            if (isOp(',')) { p++; continue; }
            if (isOp(';')) { p++; rows.push([]); continue; }
            eat('}');
            break;
          }
          return { t: 'arr', rows };
        }
        throw new Error('Unexpected ' + t.v);
      default: throw new Error('Unexpected token');
    }
  }
  const ast = cmp();
  if (p < toks.length) throw new Error('Unexpected ' + (toks[p].v ?? ''));
  return ast;
}

/* ---------- Reference rewriting on the source text ---------- */
export function refText(tok) {
  const a = tok.a; const b = tok.b;
  const cell = (x) => (x.absC ? '$' : '') + colName(x.c) + (x.absR ? '$' : '') + (x.r + 1);
  const pre = tok.sheet ? quoteSheet(tok.sheet) + '!' : '';
  if (tok.kind === 'col') return pre + (a.absC ? '$' : '') + colName(a.c) + ':' + (b.absC ? '$' : '') + colName(b.c);
  if (tok.kind === 'row') return pre + (a.absR ? '$' : '') + (a.r + 1) + ':' + (b.absR ? '$' : '') + (b.r + 1);
  return pre + cell(a) + (b ? ':' + cell(b) : '');
}

/* fn(tok) returns a replacement ref token, the string '#REF!', or null to leave unchanged */
export function rewriteRefs(formula, fn) {
  if (typeof formula !== 'string' || !formula.startsWith('=')) return formula;
  let toks;
  try { toks = tokenize(formula.slice(1)); } catch { return formula; }
  let out = '=';
  let last = 0;
  const body = formula.slice(1);
  for (const t of toks) {
    if (t.t !== 'ref') continue;
    const rep = fn(t);
    if (rep === null || rep === undefined) continue;
    out += body.slice(last, t.start) + (rep === '#REF!' ? '#REF!' : refText(rep));
    last = t.end;
  }
  return out + body.slice(last);
}

/* Shift relative references (used when copying / filling formulas) */
export function shiftFormula(formula, dr, dc) {
  return rewriteRefs(formula, (t) => {
    const mv = (x) => ({ ...x, r: x.absR ? x.r : x.r + dr, c: x.absC ? x.c : x.c + dc });
    const a = mv(t.a); const b = t.b ? mv(t.b) : null;
    if ([a, b].some((x) => x && (x.r < 0 || x.c < 0 || x.r >= MAX_ROWS || x.c >= MAX_COLS))) return '#REF!';
    return { ...t, a, b };
  });
}

export const isFormula = (v) => typeof v === 'string' && v.length > 1 && v[0] === '=';
