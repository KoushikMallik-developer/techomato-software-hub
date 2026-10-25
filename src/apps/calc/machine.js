/* Windows-style calculator state machine (Standard + Scientific). Pure functions. */
import { evaluate, FUNCS, plain, factorial, clean } from './engine.js';

export const initState = () => ({ cur: '0', entered: false, toks: [], lastOp: null, lastArg: null, err: null, curLabel: null });
const OPSYM = { '+': '+', '-': '−', '*': '×', '/': '÷', pow: '^', yroot: 'yroot', mod: 'mod', e: 'e' };
const OPSTR = { '+': '+', '-': '-', '*': '*', '/': '/', pow: '^', mod: ' mod ' };
const num = (s) => parseFloat(s);
const num0 = (s) => { const n = parseFloat(s); return Number.isNaN(n) ? 0 : n; };

function toExpr(toks) {
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === 'n') out += `(${t.v})`;
    else if (t.k === 'o') {
      if (t.v === 'yroot') { const nx = toks[i + 1]; if (nx && nx.k === 'n') { out += `^(1/(${nx.v}))`; i++; } else out += '^1'; }
      else if (t.v === 'e') { const nx = toks[i + 1]; if (nx && nx.k === 'n') { out += `*(10^(${nx.v}))`; i++; } }
      else out += OPSTR[t.v];
    } else out += t.k;
  }
  return out;
}
const label = (toks) => toks.map((t) => (t.k === 'n' ? t.l : t.k === 'o' ? OPSYM[t.v] : t.k)).join(' ');
const open = (toks) => toks.reduce((n, t) => n + (t.k === '(' ? 1 : t.k === ')' ? -1 : 0), 0);
const fail = (s, e) => ({ ...initState(), err: e.message || 'Invalid input', lastOp: null });
const clip = (n) => { if (!Number.isFinite(n)) throw new Error(Number.isNaN(n) ? 'Invalid input' : 'Overflow'); return n; };
const mk = (s, v, extra = {}) => ({ ...s, cur: plain(clip(v)), entered: true, ...extra });

export function reduce(s0, a, o = {}) {
  const mode = o.mode || 'standard'; const angle = o.angle || 'deg';
  const emitted = []; let s = s0;
  if (s.err && a !== 'c') s = initState();
  try {
    if (/^d[0-9]$/.test(a)) {
      const d = a[1];
      if (s.justEq) s = { ...initState() };
      if (!s.entered) return [{ ...s, cur: d, entered: true, curLabel: null, justEq: false }, emitted];
      if (s.cur.replace(/[-.e+]/g, '').length >= 16 && !/e/.test(s.cur)) return [s, emitted];
      return [{ ...s, cur: s.cur === '0' ? d : s.cur === '-0' ? '-' + d : s.cur + d, curLabel: null }, emitted];
    }
    switch (a) {
      case 'dot': { if (s.justEq) s = initState(); if (!s.entered) return [{ ...s, cur: '0.', entered: true, curLabel: null }, emitted]; if (s.cur.includes('.') || /e/.test(s.cur)) return [s, emitted]; return [{ ...s, cur: s.cur + '.' }, emitted]; }
      case 'neg': { if (!s.entered && s.cur === '0') return [s, emitted]; const c = s.cur.startsWith('-') ? s.cur.slice(1) : '-' + s.cur; return [{ ...s, cur: c, curLabel: s.curLabel ? `negate(${s.curLabel})` : null, entered: true }, emitted]; }
      case 'back': { if (!s.entered || s.curLabel) return [s, emitted]; const c = s.cur.length <= 1 || (s.cur.length === 2 && s.cur[0] === '-') ? '0' : s.cur.slice(0, -1); return [{ ...s, cur: c }, emitted]; }
      case 'ce': return [{ ...s, cur: '0', entered: false, curLabel: null, err: null }, emitted];
      case 'c': return [initState(), emitted];
      case 'pi': return [mk(s, Math.PI, { curLabel: 'π', justEq: false }), emitted];
      case 'e': return [mk(s, Math.E, { curLabel: 'e', justEq: false }), emitted];
      case 'rand': return [mk(s, Math.random(), { curLabel: 'rand', justEq: false }), emitted];
      case 'pct': {
        const last = s.toks[s.toks.length - 1]; const prev = s.toks[s.toks.length - 2];
        if (last && last.k === 'o' && prev && prev.k === 'n' && ['+', '-', '*', '/'].includes(last.v)) { const v = (num(prev.v) * num0(s.cur)) / 100; return [mk(s, v, { curLabel: plain(v) }), emitted]; }
        return [mk(s, 0, { curLabel: '0' }), emitted];
      }
      case '(': { if (mode === 'standard') return [s, emitted]; const last = s.toks[s.toks.length - 1]; if (last && !s.entered && last.k !== 'o' && last.k !== '(') return [s, emitted]; return [{ ...s, toks: [...s.toks, { k: '(' }], justEq: false, entered: false, cur: '0' }, emitted]; }
      case ')': {
        if (mode === 'standard' || open(s.toks) <= 0) return [s, emitted];
        let toks = s.toks; const last = toks[toks.length - 1];
        if (s.entered || !last || last.k === '(' || last.k === 'o') { if (last && last.k === 'o' && !s.entered) return [s, emitted]; toks = [...toks, { k: 'n', v: s.cur, l: s.curLabel || s.cur }]; }
        toks = [...toks, { k: ')' }];
        // value of the group
        let i = toks.length - 1; let depth = 0; for (; i >= 0; i--) { if (toks[i].k === ')') depth++; else if (toks[i].k === '(') { depth--; if (depth === 0) break; } }
        const v = evaluate(toExpr(toks.slice(i + 1, -1)), { angle });
        return [{ ...s, toks, cur: plain(clip(v)), entered: false, curLabel: null }, emitted];
      }
      case '+': case '-': case '*': case '/': case 'pow': case 'yroot': case 'mod': case 'e10': {
        const op = a === 'e10' ? 'e' : a;
        let toks = s.toks; const last = toks[toks.length - 1];
        if (s.justEq) { toks = []; }
        if (last && last.k === 'o' && !s.entered) { toks = [...toks.slice(0, -1), { k: 'o', v: op }]; return [{ ...s, toks, justEq: false }, emitted]; }
        if (!(last && last.k === ')' && !s.entered)) toks = [...toks, { k: 'n', v: s.cur, l: s.curLabel || s.cur }];
        let cur = s.cur;
        if (mode === 'standard' && toks.length >= 3 && open(toks) === 0) { // eager left-to-right
          const v = clip(evaluate(toExpr(toks), { angle })); toks = [{ k: 'n', v: plain(v), l: plain(v) }]; cur = plain(v);
        }
        return [{ ...s, toks: [...toks, { k: 'o', v: op }], cur, entered: false, curLabel: null, justEq: false }, emitted];
      }
      case '=': {
        let toks = s.toks;
        if (!toks.length) {
          if (s.lastOp) { const ex = [{ k: 'n', v: s.cur, l: s.cur }, s.lastOp, { k: 'n', v: s.lastArg, l: s.lastArg }]; const v = clip(evaluate(toExpr(ex), { angle })); emitted.push({ expr: `${s.curLabel || s.cur} ${OPSYM[s.lastOp.v]} ${s.lastArg} =`, res: plain(v) }); return [{ ...s, cur: plain(v), entered: false, curLabel: null, justEq: true }, emitted]; }
          if (s.curLabel) { emitted.push({ expr: `${s.curLabel} =`, res: s.cur }); }
          return [{ ...s, entered: false, justEq: true }, emitted];
        }
        const lastTok = toks[toks.length - 1];
        if (lastTok.k !== ')' || s.entered) { if (!(lastTok.k === 'n' && !s.entered) ) toks = [...toks, { k: 'n', v: s.cur, l: s.curLabel || s.cur }]; }
        if (toks[toks.length - 1].k === 'o') toks = [...toks, { k: 'n', v: s.cur, l: s.cur }];
        const extra = open(toks); for (let i = 0; i < extra; i++) toks = [...toks, { k: ')' }];
        const exprStr = label(toks);
        const v = clip(evaluate(toExpr(toks), { angle }));
        // repeat-equals memory: last binary op and its right operand (top level)
        let lastOp = null; let lastArg = null; { let depth = 0; for (let i = toks.length - 1; i >= 0; i--) { const t = toks[i]; if (t.k === ')') depth++; else if (t.k === '(') depth--; else if (depth === 0 && t.k === 'o' && i === toks.length - 2) { lastOp = t; lastArg = toks[i + 1].v; } } }
        emitted.push({ expr: exprStr + ' =', res: plain(v) });
        return [{ ...initState(), cur: plain(v), entered: false, lastOp, lastArg, justEq: true }, emitted];
      }
      default: {
        const U = unary(a, angle); if (!U) return [s, emitted];
        const x = num0(s.cur); const v = clip(U.f(x)); const inner = s.curLabel || plain(x);
        return [{ ...s, cur: plain(v), entered: true, curLabel: U.l(inner), justEq: false }, emitted];
      }
    }
  } catch (e) { return [fail(s, e), emitted]; }
}

function unary(a, m) {
  const fn = (name) => ({ f: (x) => FUNCS[name](x, m), l: (i) => `${name}(${i})` });
  const T = {
    sqr: { f: (x) => clean(x * x), l: (i) => `sqr(${i})` }, cube: { f: (x) => clean(x * x * x), l: (i) => `cube(${i})` },
    sqrt: { f: (x) => FUNCS.sqrt(x), l: (i) => `√(${i})` }, cbrt: { f: (x) => FUNCS.cbrt(x), l: (i) => `∛(${i})` },
    inv: { f: (x) => { if (x === 0) throw new Error('Cannot divide by zero'); return clean(1 / x); }, l: (i) => `1/(${i})` },
    abs: { f: Math.abs, l: (i) => `abs(${i})` }, fact: { f: (x) => factorial(x), l: (i) => `fact(${i})` },
    pow10: { f: (x) => clean(Math.pow(10, x)), l: (i) => `10^(${i})` }, pow2: { f: (x) => clean(Math.pow(2, x)), l: (i) => `2^(${i})` }, expx: { f: (x) => FUNCS.exp(x), l: (i) => `e^(${i})` },
    log: fn('log'), ln: fn('ln'), log2: fn('log2'),
    sin: fn('sin'), cos: fn('cos'), tan: fn('tan'), sec: fn('sec'), csc: fn('csc'), cot: fn('cot'), asin: fn('asin'), acos: fn('acos'), atan: fn('atan'),
    sinh: fn('sinh'), cosh: fn('cosh'), tanh: fn('tanh'), asinh: fn('asinh'), acosh: fn('acosh'), atanh: fn('atanh'),
    floor: { f: Math.floor, l: (i) => `floor(${i})` }, ceil: { f: Math.ceil, l: (i) => `ceil(${i})` }, dms: { f: (x) => { const d = Math.trunc(x); const mm = (Math.abs(x) - Math.abs(d)) * 60; const mi = Math.trunc(mm); const sec = (mm - mi) * 60; return clean(d + mi / 100 + sec / 10000); }, l: (i) => `dms(${i})` },
    deg: { f: (x) => { const d = Math.trunc(x); const r = Math.abs(x - d) * 100; const mi = Math.trunc(r + 1e-9); const sec = (r - mi) * 100; return clean(d + Math.sign(x || 1) * (mi / 60 + sec / 3600)); }, l: (i) => `deg(${i})` },
  };
  return T[a];
}
export const exprLine = (s) => (s.toks.length ? label(s.toks) : '') + (s.toks.length && s.toks[s.toks.length - 1].k === 'o' ? '' : '');
export const exprLabel = label;
