import { def } from './registry.js';
import { ERR, SErr, bool, flatten, isMat, isRef, num, S, str } from './fnhelp.js';
import { Lambda, compare, matDims, makeMat, broadcast, isLambda } from './fnutil.js';

const dv = (ctx, x) => ctx.api.deref(x);
const isErrV = (v) => v instanceof SErr;

/* IF: lazy so that only the chosen branch is evaluated */
def('IF', (a, ctx, ev) => {
  const c = dv(ctx, ev(a[0]));
  if (isMat(c)) {
    const t = a[1] ? dv(ctx, ev(a[1])) : true; const f = a[2] ? dv(ctx, ev(a[2])) : false;
    const tm = isMat(t) ? t : [[t]]; const fm = isMat(f) ? f : [[f]];
    const [R, C] = matDims(c);
    return makeMat(R, C, (i, j) => {
      try {
        const v = c[i][j];
        if (bool(v)) return tm[tm.length === 1 ? 0 : i]?.[tm[0].length === 1 ? 0 : j] ?? ERR.NA;
        return fm[fm.length === 1 ? 0 : i]?.[fm[0].length === 1 ? 0 : j] ?? ERR.NA;
      } catch (e) { if (e instanceof SErr) return e; throw e; }
    });
  }
  if (isErrV(c)) throw c;
  if (bool(c)) return a[1] ? ev(a[1]) : true;
  return a[2] ? ev(a[2]) : false;
}, { min: 2, max: 3, lazy: true });
def('IFS', (a, ctx, ev) => {
  if (a.length % 2) throw ERR.NA;
  for (let i = 0; i < a.length; i += 2) { const c = dv(ctx, ev(a[i])); if (isErrV(c)) throw c; if (bool(isMat(c) ? c[0][0] : c)) return ev(a[i + 1]); }
  throw ERR.NA;
}, { min: 2, lazy: true });
const trapErr = (kind) => (a, ctx, ev) => {
  let v;
  try { v = dv(ctx, ev(a[0])); } catch (e) { if (e instanceof SErr && (kind === 'any' || e.code === '#N/A')) return ev(a[1]); throw e; }
  const test = (x) => x instanceof SErr && (kind === 'any' || x.code === '#N/A');
  if (isMat(v)) {
    if (!v.some((r) => r.some(test))) return v;
    const alt = dv(ctx, ev(a[1]));
    return v.map((r, i) => r.map((x, j) => (test(x) ? (isMat(alt) ? alt[i]?.[j] ?? alt[0][0] : alt) : x)));
  }
  return test(v) ? ev(a[1]) : v;
};
def('IFERROR', trapErr('any'), { min: 2, max: 2, lazy: true });
def('IFNA', trapErr('na'), { min: 2, max: 2, lazy: true });
def('SWITCH', (a, ctx, ev) => {
  const x = dv(ctx, ev(a[0]));
  if (isErrV(x)) throw x;
  let i = 1;
  for (; i + 1 < a.length; i += 2) { const y = dv(ctx, ev(a[i])); if (isErrV(y)) throw y; if (typeof x === typeof y && compare(x, y) === 0) return ev(a[i + 1]); }
  if (i < a.length) return ev(a[i]);
  throw ERR.NA;
}, { min: 3, lazy: true });
def('CHOOSE', (a, ctx, ev) => {
  const idx = dv(ctx, ev(a[0]));
  const pick = (v) => { const k = Math.trunc(num(v)); if (k < 1 || k >= a.length) throw ERR.VALUE; return k; };
  if (isMat(idx)) return idx.map((r) => r.map((v) => { try { return dv(ctx, ev(a[pick(v)])); } catch (e) { if (e instanceof SErr) return e; throw e; } }));
  return ev(a[pick(idx)]);
}, { min: 2, lazy: true });

const logicVals = (ctx, args) => {
  const out = [];
  for (const a of args) {
    if (isRef(a) || isMat(a)) ctx.api.toMatrix(a).forEach((r) => r.forEach((v) => { if (v instanceof SErr) throw v; if (typeof v === 'boolean') out.push(v); else if (typeof v === 'number') out.push(v !== 0); }));
    else out.push(bool(a));
  }
  if (!out.length) throw ERR.VALUE;
  return out;
};
def('AND', (args, ctx) => logicVals(ctx, args).every(Boolean), { min: 1 });
def('OR', (args, ctx) => logicVals(ctx, args).some(Boolean), { min: 1 });
def('XOR', (args, ctx) => logicVals(ctx, args).filter(Boolean).length % 2 === 1, { min: 1 });
def('NOT', ([x]) => !bool(x), { min: 1, max: 1, lift: true });
def('TRUE', () => true, { max: 0 });
def('FALSE', () => false, { max: 0 });

/* ---- LET / LAMBDA and helpers ---- */
def('LET', (a, ctx, ev) => {
  if (a.length < 3 || a.length % 2 === 0) throw ERR.VALUE;
  let env = ctx.env || null;
  for (let i = 0; i + 1 < a.length; i += 2) {
    if (a[i].t !== 'name') throw ERR.NAME;
    const v = ev(a[i + 1], env);
    env = { vars: { [a[i].name.toLowerCase()]: v }, parent: env };
  }
  return ev(a[a.length - 1], env);
}, { min: 3, lazy: true });
def('LAMBDA', (a, ctx) => {
  const params = a.slice(0, -1).map((n) => { if (n.t !== 'name') throw ERR.VALUE; return n.name; });
  return new Lambda(params, a[a.length - 1], ctx.env || null, { si: ctx.si, r: ctx.r, c: ctx.c });
}, { min: 1, lazy: true });
const lam = (x) => { if (!(x instanceof Lambda)) throw ERR.VALUE; return x; };
const scal = (ctx, v) => { const d = dv(ctx, v); return isMat(d) ? (d.length ? d[0][0] : ERR.CALC) : d; };
def('MAP', (args, ctx) => {
  const f = lam(args[args.length - 1]); const mats = args.slice(0, -1).map((a) => ctx.api.toMatrix(a));
  const [R, C] = matDims(mats[0]);
  return makeMat(R, C, (i, j) => { try { const v = scal(ctx, ctx.api.call(f, mats.map((m) => m[i]?.[j] ?? null))); return v === undefined ? null : v; } catch (e) { if (e instanceof SErr) return e; throw e; } });
}, { min: 2 });
def('REDUCE', ([init, arr, f], ctx) => {
  let acc = init === undefined || init === null ? null : ctx.api.deref(init);
  const fn = lam(f);
  ctx.api.toMatrix(arr).forEach((r) => r.forEach((v) => { acc = dv(ctx, ctx.api.call(fn, [acc, v])); }));
  return acc;
}, { min: 3, max: 3 });
def('SCAN', ([init, arr, f], ctx) => {
  let acc = ctx.api.deref(init); const fn = lam(f);
  return ctx.api.toMatrix(arr).map((r) => r.map((v) => { acc = scal(ctx, ctx.api.call(fn, [acc, v])); return acc; }));
}, { min: 3, max: 3 });
def('BYROW', ([arr, f], ctx) => { const fn = lam(f); return ctx.api.toMatrix(arr).map((r) => [scal(ctx, ctx.api.call(fn, [[r]]))]); }, { min: 2, max: 2 });
def('BYCOL', ([arr, f], ctx) => {
  const fn = lam(f); const m = ctx.api.toMatrix(arr);
  return [m[0].map((_, j) => scal(ctx, ctx.api.call(fn, [m.map((r) => [r[j]])])))];
}, { min: 2, max: 2 });
def('MAKEARRAY', ([r, c, f], ctx) => {
  const R = Math.trunc(num(S(ctx, r))); const C = Math.trunc(num(S(ctx, c))); const fn = lam(f);
  if (R < 1 || C < 1) throw ERR.VALUE;
  return makeMat(R, C, (i, j) => { try { return scal(ctx, ctx.api.call(fn, [i + 1, j + 1])); } catch (e) { if (e instanceof SErr) return e; throw e; } });
}, { min: 3, max: 3 });
def('ARRAYFORMULA', ([a], ctx) => a, { min: 1, max: 1 });
def('ISOMITTED', ([a]) => a === null || a === undefined, { min: 1, max: 1 });

/* ---- info ---- */
const isTest = (name, pred) => def(name, (a, ctx, ev) => {
  let v;
  try { v = ctx.api.deref(ev(a[0])); } catch (e) { if (e instanceof SErr) v = e; else throw e; }
  return isMat(v) ? v.map((r) => r.map(pred)) : pred(v);
}, { min: 1, max: 1, lazy: true });
isTest('ISNUMBER', (v) => typeof v === 'number');
isTest('ISTEXT', (v) => typeof v === 'string');
isTest('ISNONTEXT', (v) => typeof v !== 'string');
isTest('ISLOGICAL', (v) => typeof v === 'boolean');
isTest('ISBLANK', (v) => v === null || v === undefined);
isTest('ISERROR', (v) => v instanceof SErr);
isTest('ISERR', (v) => v instanceof SErr && v.code !== '#N/A');
isTest('ISNA', (v) => v instanceof SErr && v.code === '#N/A');
const I1 = { min: 1, max: 1, lift: true };
def('ISREF', ([a]) => isRef(a), { min: 1, max: 1 });
def('ISFORMULA', ([a], ctx) => { if (!isRef(a)) throw ERR.VALUE; const c = ctx.api.rawCell(a.si, a.r1, a.c1); return !!(c && c.f); }, { min: 1, max: 1 });
def('ISLAMBDA', ([a]) => isLambda(a), { min: 1, max: 1 });
def('NA', () => { throw ERR.NA; }, { max: 0 });
def('TYPE', ([a], ctx) => { const v = S(ctx, a); if (isMat(a)) return 64; return v instanceof SErr ? 16 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : 1; }, { min: 1, max: 1 });
def('ERROR.TYPE', ([v]) => { if (!(v instanceof SErr)) throw ERR.NA; const i = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A'].indexOf(v.code); if (i < 0) throw ERR.NA; return i + 1; }, I1);
def('SHEET', ([a], ctx) => (a === undefined ? ctx.si + 1 : isRef(a) ? a.si + 1 : ERR.NA), { min: 0, max: 1 });
def('SHEETS', (a, ctx) => ctx.api.sheets.length, { min: 0, max: 1 });
def('CELL', ([t, ref], ctx) => {
  const kind = str(S(ctx, t)).toLowerCase(); const r = ref || { si: ctx.si, r1: ctx.r, c1: ctx.c };
  const v = ctx.api.value(r.si, r.r1, r.c1);
  switch (kind) { case 'row': return r.r1 + 1; case 'col': return r.c1 + 1; case 'contents': return v; case 'type': return v === null ? 'b' : typeof v === 'string' ? 'l' : 'v'; default: return ERR.VALUE; }
}, { min: 1, max: 2 });
def('INFO', () => 'Techomato Sheets', { min: 1, max: 1 });
def('VALUE_ERR', () => ERR.VALUE, { max: 0 });
