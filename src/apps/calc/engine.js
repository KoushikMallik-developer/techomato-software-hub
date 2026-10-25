/* Safe expression engine (no eval). compile(src, {angle}) -> fn(env) */
const TAU = Math.PI;
export const clean = (v) => (Number.isFinite(v) ? parseFloat(v.toPrecision(14)) : v);

function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1; const g = 7; const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
export function factorial(n) {
  if (n < 0 && Number.isInteger(n)) throw new Error('Invalid input');
  if (Number.isInteger(n)) { if (n > 170) return Infinity; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
  return gamma(n + 1);
}
const toRad = (a, m) => (m === 'deg' ? (a * Math.PI) / 180 : m === 'grad' ? (a * Math.PI) / 200 : a);
const fromRad = (r, m) => (m === 'deg' ? (r * 180) / Math.PI : m === 'grad' ? (r * 200) / Math.PI : r);
const trigClean = (v) => (Math.abs(v) < 1e-15 ? 0 : clean(v));

export const FUNCS = {
  sin: (x, m) => trigClean(Math.sin(toRad(x, m))), cos: (x, m) => trigClean(Math.cos(toRad(x, m))),
  tan: (x, m) => { const r = toRad(x, m); if (Math.abs(Math.cos(r)) < 1e-15) throw new Error('Invalid input'); return trigClean(Math.tan(r)); },
  sec: (x, m) => 1 / FUNCS.cos(x, m), csc: (x, m) => 1 / FUNCS.sin(x, m), cot: (x, m) => 1 / FUNCS.tan(x, m),
  asin: (x, m) => { if (Math.abs(x) > 1) throw new Error('Invalid input'); return clean(fromRad(Math.asin(x), m)); },
  acos: (x, m) => { if (Math.abs(x) > 1) throw new Error('Invalid input'); return clean(fromRad(Math.acos(x), m)); },
  atan: (x, m) => clean(fromRad(Math.atan(x), m)),
  sinh: (x) => clean(Math.sinh(x)), cosh: (x) => clean(Math.cosh(x)), tanh: (x) => clean(Math.tanh(x)),
  asinh: (x) => clean(Math.asinh(x)), acosh: (x) => { if (x < 1) throw new Error('Invalid input'); return clean(Math.acosh(x)); }, atanh: (x) => { if (Math.abs(x) >= 1) throw new Error('Invalid input'); return clean(Math.atanh(x)); },
  log: (x) => { if (x <= 0) throw new Error('Invalid input'); return clean(Math.log10(x)); },
  ln: (x) => { if (x <= 0) throw new Error('Invalid input'); return clean(Math.log(x)); },
  log2: (x) => { if (x <= 0) throw new Error('Invalid input'); return clean(Math.log2(x)); },
  sqrt: (x) => { if (x < 0) throw new Error('Invalid input'); return clean(Math.sqrt(x)); }, cbrt: (x) => clean(Math.cbrt(x)),
  abs: (x) => Math.abs(x), exp: (x) => clean(Math.exp(x)), floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, sign: Math.sign,
  fact: (x) => factorial(x), gamma: (x) => gamma(x),
};
const MULTI = { min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => a - b * Math.floor(a / b), atan2: Math.atan2, hypot: Math.hypot, root: (a, b) => (a < 0 && b % 2 === 1 ? -Math.pow(-a, 1 / b) : Math.pow(a, 1 / b)), ncr: (n, r) => factorial(n) / (factorial(r) * factorial(n - r)), npr: (n, r) => factorial(n) / factorial(n - r) };
const CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 };

function tokenize(src) {
  const t = []; let i = 0; const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\s+/g, ' ');
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) { const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i)); if (!m) throw new Error('Invalid input'); t.push({ k: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if (/[a-zA-Z_]/.test(c)) { const m = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(s.slice(i))[0]; t.push({ k: 'id', v: m }); i += m.length; continue; }
    if ('+-*/^(),!%|'.includes(c)) { t.push({ k: c }); i++; continue; }
    throw new Error('Invalid input');
  }
  return t;
}

export function compile(src, { vars = [] } = {}) {
  const toks = tokenize(src); let p = 0; const peek = () => toks[p]; const eat = (k) => { if (peek() && peek().k === k) return toks[p++]; return null; };
  const need = (k) => { if (!eat(k)) throw new Error('Invalid input'); };
  const startsOperand = () => { const t = peek(); return t && (t.k === 'n' || t.k === 'id' || t.k === '('); };
  function expr() { let l = term(); for (;;) { if (eat('+')) { const a = l; const b = term(); l = (e) => a(e) + b(e); } else if (eat('-')) { const a = l; const b = term(); l = (e) => a(e) - b(e); } else return l; } }
  function term() {
    let l = unary();
    for (;;) {
      const t = peek();
      if (t && t.k === '*') { p++; const a = l; const b = unary(); l = (e) => a(e) * b(e); }
      else if (t && t.k === '/') { p++; const a = l; const b = unary(); l = (e) => { const d = b(e); if (d === 0 && !e.lenient) throw new Error('Cannot divide by zero'); return a(e) / d; }; }
      else if (t && t.k === 'id' && t.v === 'mod') { p++; const a = l; const b = unary(); l = (e) => { const d = b(e); if (d === 0) throw new Error('Cannot divide by zero'); const x = a(e); return x - d * Math.floor(x / d); }; }
      else if (startsOperand() && !(t.k === 'id' && t.v === 'mod')) { const a = l; const b = unary(); l = (e) => a(e) * b(e); }
      else return l;
    }
  }
  function unary() { if (eat('-')) { const a = unary(); return (e) => -a(e); } if (eat('+')) return unary(); return power(); }
  function power() { const base = postfix(); if (eat('^')) { const ex = unary(); return (e) => { const b = base(e); const x = ex(e); if (b === 0 && x < 0 && !e.lenient) throw new Error('Cannot divide by zero'); const r = Math.pow(b, x); if (Number.isNaN(r) && !e.lenient) throw new Error('Invalid input'); return clean(r); }; } return base; }
  function postfix() { let v = primary(); for (;;) { if (eat('!')) { const a = v; v = (e) => factorial(a(e)); } else if (peek() && peek().k === '%') { p++; const a = v; v = (e) => a(e) / 100; } else return v; } }
  function primary() {
    const t = toks[p++]; if (!t) throw new Error('Invalid input');
    if (t.k === 'n') { const v = t.v; return () => v; }
    if (t.k === '(') { const x = expr(); need(')'); return x; }
    if (t.k === '|') { const x = expr(); need('|'); return (e) => Math.abs(x(e)); }
    if (t.k === 'id') {
      const name = t.v.toLowerCase();
      if (peek() && peek().k === '(' && (FUNCS[name] || MULTI[name])) {
        p++; const args = []; if (!eat(')')) { do args.push(expr()); while (eat(',')); need(')'); }
        if (FUNCS[name]) { if (args.length !== 1) throw new Error('Invalid input'); const f = FUNCS[name]; const a = args[0]; return (e) => f(a(e), e.angle || 'rad'); }
        const f = MULTI[name]; return (e) => f(...args.map((a) => a(e)));
      }
      if (FUNCS[name] && !(peek() && peek().k === '(')) { // sin 30 style
        const a = unary(); const f = FUNCS[name]; return (e) => f(a(e), e.angle || 'rad');
      }
      if (name in CONST) { const v = CONST[name]; return () => v; }
      if (vars.includes(name)) return (e) => { const v = e[name]; return v === undefined ? NaN : v; };
      throw new Error('Invalid input');
    }
    throw new Error('Invalid input');
  }
  const f = expr(); if (p < toks.length) throw new Error('Invalid input');
  return f;
}
export function evaluate(src, env = {}) { const f = compile(src, { vars: Object.keys(env) }); return f({ angle: 'deg', ...env }); }

/* number formatting */
export function plain(v) {
  if (!Number.isFinite(v)) return 'NaN';
  v = clean(v); if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e16 || a < 1e-9) { let s = v.toExponential(14).replace(/\.?0+e/, 'e'); return s; }
  let s = String(v); if (/e/.test(s)) s = v.toFixed(Math.min(20, 15)).replace(/\.?0+$/, '');
  return s;
}
export function group(str, sep = ',') {
  const m = /^(-?)(\d+)(\.\d*)?(e[+-]?\d+)?$/.exec(str); if (!m) return str;
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, sep) + (m[3] || '') + (m[4] || '');
}
export function sci(v) { if (!Number.isFinite(v)) return 'NaN'; return v.toExponential(10).replace(/\.?0+e/, 'e').replace('e+', 'e+'); }
