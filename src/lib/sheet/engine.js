// Formula evaluation engine: lazy, memoised per engine instance, with spill support.
import { MAX_COLS, MAX_ROWS, keyOf } from './addr.js';
import { parseFormula } from './parser.js';
import { ERR, SErr, errFromCode } from './values.js';
import { Lambda, RangeRef, bool, broadcast, compare, isMat, isRef, matDims, num, str } from './fnutil.js';
import { FUNCS } from './functions.js';

const astCache = new Map();
export function getAst(f) {
  let a = astCache.get(f);
  if (a === undefined) {
    try { a = parseFormula(f); } catch (e) { a = { t: 'parseerr', msg: e.message }; }
    if (astCache.size > 30000) astCache.clear();
    astCache.set(f, a);
  }
  return a;
}

/* ----- static analysis: can this formula produce an array (spill)? ----- */
const ALWAYS_ARRAY = new Set(['FILTER', 'SORT', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'RANDARRAY', 'TRANSPOSE', 'MMULT', 'MINVERSE', 'MUNIT', 'TEXTSPLIT', 'VSTACK', 'HSTACK', 'TOCOL', 'TOROW', 'CHOOSECOLS', 'CHOOSEROWS', 'TAKE', 'DROP', 'EXPAND', 'WRAPROWS', 'WRAPCOLS', 'FLATTEN', 'SPLIT', 'MAP', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'FREQUENCY', 'LINEST', 'TREND', 'ARRAYFORMULA', 'REGEXEXTRACT', 'GROWTH']);
const PASS_THROUGH = new Set(['IF', 'IFS', 'IFERROR', 'IFNA', 'CHOOSE', 'SWITCH', 'LET', 'LOOKUP', 'TEXTBEFORE', 'TEXTAFTER', 'INDIRECT', 'OFFSET']);
const isZeroOrEmpty = (a) => !a || a.t === 'empty' || (a.t === 'num' && a.v === 0);
const arrayish = (n) => {
  if (!n) return false;
  switch (n.t) {
    case 'ref': return !(n.r1 === n.r2 && n.c1 === n.c2);
    case 'arr': return n.rows.length > 1 || n.rows[0].length > 1;
    case 'paren': case 'un': case 'pct': return arrayish(n.a);
    case 'icall': return n.args.some(arrayish);
    case 'bin': return arrayish(n.a) || arrayish(n.b);
    case 'call': {
      if (ALWAYS_ARRAY.has(n.name)) return true;
      if (PASS_THROUGH.has(n.name)) return n.args.some(arrayish);
      if (n.name === 'INDEX') return n.args.some((a, i) => i > 0 && arrayish(a)) || (n.args.length >= 2 && (isZeroOrEmpty(n.args[1]) || (n.args.length >= 3 && isZeroOrEmpty(n.args[2]))));
      if (n.name === 'XLOOKUP' || n.name === 'XMATCH') return n.args.slice(0, 1).some(arrayish) || (n.args[2] && n.args[2].t === 'ref' && n.args[2].c2 > n.args[2].c1 && n.args[2].r2 > n.args[2].r1);
      if (n.name === 'ROW' || n.name === 'COLUMN') return n.args.some(arrayish);
      const f = FUNCS[n.name];
      if (f && f.lift) return n.args.some(arrayish);
      return false;
    }
    default: return false;
  }
};

const nkey = (si, r, c) => si * 17179869184 + r * 16384 + c;

export function createEngine(book, opts = {}) {
  const sheets = book.sheets;
  const sheetIdx = new Map();
  sheets.forEach((s, i) => sheetIdx.set(s.name.toLowerCase(), i));
  const names = {};
  Object.entries(book.names || {}).forEach(([k, v]) => { names[k.toLowerCase()] = v; });
  const vals = new Map();
  const evaluating = new Set();
  const spillCells = new Map(); // nkey -> { value, ox, oy, si }
  const spillRegions = new Map(); // origin nkey -> { si, r, c, rows, cols }
  let spillersDone = false;
  const now = opts.now || Date.now();
  const used = [];

  const rawCell = (si, r, c) => {
    const s = sheets[si];
    return s ? s.cells[keyOf(r, c)] : undefined;
  };
  const hasContent = (cell) => !!cell && ((cell.f !== undefined && cell.f !== '') || (cell.v !== undefined && cell.v !== null && cell.v !== ''));

  const spillerList = new WeakMap();
  function ensureSpillers() {
    if (spillersDone) return;
    spillersDone = true;
    sheets.forEach((s, si) => {
      let list = spillerList.get(s.cells);
      if (!list) {
        list = [];
        for (const k in s.cells) {
          const cell = s.cells[k];
          if (cell.f && cell.f.length > 1 && /[:{]|\(/.test(cell.f)) {
            const ast = getAst(cell.f);
            if (ast.t !== 'parseerr' && arrayish(ast)) list.push(k);
          }
        }
        spillerList.set(s.cells, list);
      }
      for (const k of list) {
        const m = /^([A-Z]+)(\d+)$/.exec(k);
        let c = 0;
        for (let i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
        value(si, +m[2] - 1, c - 1);
      }
    });
  }

  function value(si, r, c) {
    const k = nkey(si, r, c);
    let v = vals.get(k);
    if (v !== undefined) return v;
    const cell = rawCell(si, r, c);
    if (cell && cell.f) {
      if (evaluating.has(k)) return ERR.CIRC;
      v = evalFormulaCell(si, r, c, cell.f, k);
    } else if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
      v = cell.v;
    } else {
      if (!spillersDone) ensureSpillers();
      const sp = spillCells.get(k);
      return sp ? sp.value : null;
    }
    vals.set(k, v);
    return v;
  }

  function evalFormulaCell(si, r, c, f, k) {
    evaluating.add(k);
    let res;
    try {
      const ast = getAst(f);
      if (ast.t === 'parseerr') res = errFromCode('#NAME?');
      else {
        const out = evalNode(ast, { si, r, c, env: null });
        res = finalize(out, si, r, c, k);
      }
    } catch (e) {
      if (e instanceof SErr) res = e;
      else { res = ERR.VALUE; if (opts.debug) console.error(e); }
    } finally {
      evaluating.delete(k);
    }
    return res;
  }

  function finalize(out, si, r, c, k) {
    if (isRef(out)) {
      if (out.single) { const v = value(out.si, out.r1, out.c1); return v === null ? 0 : v; }
      out = matrixOf(out);
    }
    if (out instanceof Lambda) return ERR.CALC;
    if (isMat(out)) {
      if (out.length === 1 && out[0].length === 1) { const v = out[0][0]; return isRef(v) ? value(v.si, v.r1, v.c1) : v; }
      if (!out.length || !out[0].length) return ERR.CALC;
      return placeSpill(si, r, c, out, k);
    }
    if (out === null || out === undefined) return 0;
    return out;
  }

  function placeSpill(si, r, c, mat, k) {
    const R = mat.length; const C = mat[0].length;
    if (r + R > MAX_ROWS || c + C > MAX_COLS) return ERR.SPILL;
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < C; j++) {
        if (i === 0 && j === 0) continue;
        if (hasContent(rawCell(si, r + i, c + j)) || spillCells.has(nkey(si, r + i, c + j))) return ERR.SPILL;
      }
    }
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < C; j++) {
        if (i === 0 && j === 0) continue;
        const v = mat[i][j];
        spillCells.set(nkey(si, r + i, c + j), { value: v === undefined ? null : v, ox: r, oy: c, si });
      }
    }
    spillRegions.set(k, { si, r, c, rows: R, cols: C });
    return mat[0][0];
  }

  /* ----- ranges ----- */
  function usedExtent(si) {
    if (used[si]) return used[si];
    let mr = -1; let mc = -1;
    const cells = sheets[si].cells;
    for (const k in cells) {
      if (!hasContent(cells[k])) continue;
      const m = /^([A-Z]+)(\d+)$/.exec(k);
      let c = 0;
      for (let i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
      if (c - 1 > mc) mc = c - 1;
      if (+m[2] - 1 > mr) mr = +m[2] - 1;
    }
    spillRegions.forEach((g) => { if (g.si === si) { mr = Math.max(mr, g.r + g.rows - 1); mc = Math.max(mc, g.c + g.cols - 1); } });
    used[si] = { r: mr, c: mc };
    return used[si];
  }

  function matrixOf(ref) {
    if (!spillersDone) ensureSpillers();
    const ext = usedExtent(ref.si);
    const r2 = Math.min(ref.r2, Math.max(ext.r, ref.r1));
    const c2 = Math.min(ref.c2, Math.max(ext.c, ref.c1));
    const out = [];
    for (let r = ref.r1; r <= r2; r++) {
      const row = [];
      for (let c = ref.c1; c <= c2; c++) row.push(value(ref.si, r, c));
      out.push(row);
    }
    return out;
  }

  /* resolve any arg into a matrix */
  const toMatrix = (x) => (isRef(x) ? matrixOf(x) : isMat(x) ? x : [[x]]);
  /* resolve to a scalar (top-left cell for ranges) */
  const scalar = (x) => {
    if (isRef(x)) return value(x.si, x.r1, x.c1);
    if (isMat(x)) return x.length ? x[0][0] : null;
    return x;
  };
  const deref = (x) => {
    if (isRef(x)) return x.single ? value(x.si, x.r1, x.c1) : matrixOf(x);
    if (isMat(x) && x.length === 1 && x[0].length === 1) return x[0][0];
    return x;
  };

  function sheetIndexOf(name, cur) {
    if (name === null || name === undefined) return cur;
    const i = sheetIdx.get(name.toLowerCase());
    if (i === undefined) throw ERR.REF;
    return i;
  }

  /* ----- evaluation ----- */
  const ctxApi = { value, matrixOf, toMatrix, scalar, deref, evalNode, usedExtent, rawCell, now, sheets, sheetIdx, book, call: callLambda, spillRegions, names };

  function evalNode(n, ctx) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'err': return errFromCode(n.v);
      case 'empty': return null;
      case 'paren': return evalNode(n.a, ctx);
      case 'ref': {
        const si = sheetIndexOf(n.sheet, ctx.si);
        if (n.spill) {
          const reg = spillRegions.get(nkey(si, n.r1, n.c1));
          value(si, n.r1, n.c1);
          const g = spillRegions.get(nkey(si, n.r1, n.c1)) || reg;
          if (!g) return new RangeRef(si, n.r1, n.c1, n.r1, n.c1);
          return new RangeRef(si, g.r, g.c, g.r + g.rows - 1, g.c + g.cols - 1);
        }
        return new RangeRef(si, n.r1, n.c1, n.r2, n.c2);
      }
      case 'name': return evalName(n.name, ctx);
      case 'un': {
        const v = deref(evalNode(n.a, ctx));
        if (isMat(v)) return v.map((row) => row.map((x) => { try { return -num(x); } catch (e) { if (e instanceof SErr) return e; throw e; } }));
        return -num(v);
      }
      case 'pct': {
        const v = deref(evalNode(n.a, ctx));
        if (isMat(v)) return v.map((row) => row.map((x) => { try { return num(x) / 100; } catch (e) { if (e instanceof SErr) return e; throw e; } }));
        return num(v) / 100;
      }
      case 'bin': return evalBin(n, ctx);
      case 'arr': return n.rows.map((row) => row.map((e) => deref(evalNode(e, ctx))));
      case 'call': return evalCall(n, ctx);
      case 'icall': {
        const lam = evalNode(n.fn, ctx);
        if (!(lam instanceof Lambda)) throw ERR.VALUE;
        return callLambda(lam, n.args.map((a) => deref(evalNode(a, ctx))));
      }
      default: throw ERR.VALUE;
    }
  }

  function evalName(name, ctx) {
    const u = name.toLowerCase();
    if (ctx.env) {
      let e = ctx.env;
      while (e) { if (Object.prototype.hasOwnProperty.call(e.vars, u)) return e.vars[u]; e = e.parent; }
    }
    const def = names[u];
    if (def === undefined) throw ERR.NAME;
    const f = def.startsWith('=') ? def : '=' + def;
    const ast = getAst(f);
    if (ast.t === 'parseerr') throw ERR.NAME;
    return evalNode(ast, { si: ctx.si, r: ctx.r, c: ctx.c, env: null });
  }

  const ARITH = {
    '+': (a, b) => num(a) + num(b),
    '-': (a, b) => num(a) - num(b),
    '*': (a, b) => num(a) * num(b),
    '/': (a, b) => { const d = num(b); if (d === 0) throw ERR.DIV0; return num(a) / d; },
    '^': (a, b) => { const x = num(a); const y = num(b); if (x === 0 && y === 0) throw ERR.NUM; const v = Math.pow(x, y); if (!Number.isFinite(v)) throw ERR.NUM; return v; },
    '&': (a, b) => str(a) + str(b),
    '=': (a, b) => compare(a, b) === 0,
    '<>': (a, b) => compare(a, b) !== 0,
    '<': (a, b) => compare(a, b) < 0,
    '>': (a, b) => compare(a, b) > 0,
    '<=': (a, b) => compare(a, b) <= 0,
    '>=': (a, b) => compare(a, b) >= 0,
  };

  function evalBin(n, ctx) {
    const f = ARITH[n.op];
    const a = deref(evalNode(n.a, ctx));
    const b = deref(evalNode(n.b, ctx));
    if (isMat(a) || isMat(b)) return broadcast(isMat(a) ? a : [[a]], isMat(b) ? b : [[b]], f);
    return f(a, b);
  }

  function evalCall(n, ctx) {
    const def = FUNCS[n.name];
    if (!def) {
      // user LAMBDA stored in a local variable?
      if (ctx.env) {
        let e = ctx.env;
        const u = n.name.toLowerCase();
        while (e) {
          if (Object.prototype.hasOwnProperty.call(e.vars, u) && e.vars[u] instanceof Lambda) return callLambda(e.vars[u], n.args.map((a) => deref(evalNode(a, ctx))));
          e = e.parent;
        }
      }
      const nm = names[n.name.toLowerCase()];
      if (nm !== undefined) {
        const lam = evalName(n.name, ctx);
        if (lam instanceof Lambda) return callLambda(lam, n.args.map((a) => deref(evalNode(a, ctx))));
      }
      throw ERR.NAME;
    }
    const argc = n.args.length;
    if (argc < def.min || argc > def.max) throw ERR.VALUE;
    const fullCtx = { ...ctx, api: ctxApi };
    if (def.lazy) return def.fn(n.args, fullCtx, (node, env) => evalNode(node, env === undefined ? ctx : { ...ctx, env }));
    const args = n.args.map((a) => evalNode(a, ctx));
    if (def.lift) return liftCall(def, args, fullCtx);
    return def.fn(args, fullCtx);
  }

  function liftCall(def, args, ctx) {
    const idx = def.lift === true ? args.map((_, i) => i) : def.lift;
    const vals2 = args.map((a, i) => (idx.includes(i) ? deref(a) : a));
    if (!idx.some((i) => isMat(vals2[i]))) return def.fn(vals2, ctx);
    let R = 1; let C = 1;
    idx.forEach((i) => { if (isMat(vals2[i])) { const [r, c] = matDims(vals2[i]); R = Math.max(R, r); C = Math.max(C, c); } });
    const out = [];
    for (let r = 0; r < R; r++) {
      const row = [];
      for (let c = 0; c < C; c++) {
        const a2 = vals2.map((v, i) => {
          if (!idx.includes(i) || !isMat(v)) return v;
          const [vr, vc] = matDims(v);
          return v[vr === 1 ? 0 : r]?.[vc === 1 ? 0 : c] ?? ERR.NA;
        });
        try { row.push(def.fn(a2, ctx)); } catch (e) { if (e instanceof SErr) row.push(e); else throw e; }
      }
      out.push(row);
    }
    return out;
  }

  function callLambda(lam, args) {
    const vars = {};
    lam.params.forEach((p, i) => { vars[p.toLowerCase()] = args[i] === undefined ? null : args[i]; });
    return evalNode(lam.body, { si: lam.ctx.si, r: lam.ctx.r, c: lam.ctx.c, env: { vars, parent: lam.env } });
  }

  /* evaluate an arbitrary formula text relative to a cell (conditional formats, validation) */
  function evalText(si, r, c, formula) {
    const ast = getAst(formula.startsWith('=') ? formula : '=' + formula);
    if (ast.t === 'parseerr') return ERR.NAME;
    try {
      const out = evalNode(ast, { si, r, c, env: null });
      return deref(out);
    } catch (e) {
      if (e instanceof SErr) return e;
      return ERR.VALUE;
    }
  }

  return {
    value,
    rawCell,
    matrixOf,
    evalText,
    usedExtent: (si) => { if (!spillersDone) ensureSpillers(); return usedExtent(si); },
    spillAt: (si, r, c) => {
      if (!spillersDone) ensureSpillers();
      const sp = spillCells.get(nkey(si, r, c));
      if (sp) return { r: sp.ox, c: sp.oy, origin: false, region: spillRegions.get(nkey(si, sp.ox, sp.oy)) };
      const reg = spillRegions.get(nkey(si, r, c));
      return reg ? { r, c, origin: true, region: reg } : null;
    },
    spillRegions: () => { if (!spillersDone) ensureSpillers(); return [...spillRegions.values()]; },
    names,
    now,
  };
}

/* Convert a displayed/computed value to a plain string for copy/export */
export const valueToText = (v) => (v instanceof SErr ? v.code : v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));
export { bool };
