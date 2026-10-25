import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';

const WS = [['QWORD', 64], ['DWORD', 32], ['WORD', 16], ['BYTE', 8]];
const BASES = [['HEX', 16], ['DEC', 10], ['OCT', 8], ['BIN', 2]];
const mask = (ws) => (1n << BigInt(ws)) - 1n;
const toSigned = (v, ws) => (v >> BigInt(ws - 1) ? v - (1n << BigInt(ws)) : v);
const wrap = (v, ws) => ((v % (1n << BigInt(ws))) + (1n << BigInt(ws))) % (1n << BigInt(ws));
const fmtBase = (v, base, ws) => { if (base === 10) return toSigned(v, ws).toString(10); let s = v.toString(base).toUpperCase(); if (base === 2) s = s.padStart(Math.ceil(s.length / 4) * 4, '0'); return s; };
const groupStr = (s, base) => { if (base === 10) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); if (base === 16) return s.replace(/\B(?=([0-9A-F]{4})+(?!\w))/g, ' '); if (base === 2) return s.replace(/\B(?=([01]{4})+(?!\w))/g, ' '); return s; };
const nz = (b) => { if (b === 0n) throw new Error('Cannot divide by zero'); return b; };
const OPS = { '+': 1, '-': 1, '*': 1, '/': 1, mod: 1, and: 1, or: 1, xor: 1, nand: 1, nor: 1, lsh: 1, rsh: 1 };
function calc(op, a, b, ws) {
  const A = toSigned(a, ws); const Bv = toSigned(b, ws); const sh = b > 128n ? 128n : b;
  switch (op) {
    case '+': return wrap(A + Bv, ws); case '-': return wrap(A - Bv, ws); case '*': return wrap(A * Bv, ws);
    case '/': return wrap(A / nz(Bv), ws); case 'mod': return wrap(A % nz(Bv), ws);
    case 'and': return a & b; case 'or': return a | b; case 'xor': return a ^ b; case 'nand': return wrap(~(a & b), ws); case 'nor': return wrap(~(a | b), ws);
    case 'lsh': return wrap(a << sh, ws); case 'rsh': return wrap(A >> sh, ws); default: return b;
  }
}
const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷', mod: 'Mod', and: 'AND', or: 'OR', xor: 'XOR', nand: 'NAND', nor: 'NOR', lsh: '<<', rsh: '>>' };

export const initProg = () => ({ val: 0n, base: 10, ws: 64, acc: null, op: null, fresh: true, err: null, expr: '' });

export function ProgKeypad({ st, setSt, onEmit }) {
  const { val, base, ws } = st;
  const sv = (v) => wrap(v, ws);
  const press = (k) => {
    setSt((s0) => {
      let s = s0.err ? { ...initProg(), base: s0.base, ws: s0.ws } : s0;
      try {
        if (/^[0-9A-F]$/.test(k)) { const d = BigInt(parseInt(k, 16)); if (d >= BigInt(s.base)) return s; const nv = s.fresh ? d : wrap(s.val * BigInt(s.base) + d, s.ws); if (!s.fresh && s.val * BigInt(s.base) + d > mask(s.ws) && s.base !== 10) return s; if (!s.fresh && s.base === 10 && toSigned(s.val, s.ws) * 10n + d > (1n << BigInt(s.ws - 1)) - 1n) return s; return { ...s, val: nv, fresh: false }; }
        if (k === 'back') { if (s.fresh) return s; return { ...s, val: s.val / BigInt(s.base) }; }
        if (k === 'ce') return { ...s, val: 0n, fresh: true };
        if (k === 'c') return { ...initProg(), base: s.base, ws: s.ws };
        if (k === 'neg') return { ...s, val: sv(-toSigned(s.val, s.ws)), fresh: false };
        if (k === 'not') return { ...s, val: sv(~s.val), fresh: false };
        if (k === 'rol') { const top = s.val >> BigInt(s.ws - 1); return { ...s, val: sv((s.val << 1n) | top), fresh: false }; }
        if (k === 'ror') { const lo = s.val & 1n; return { ...s, val: sv((s.val >> 1n) | (lo << BigInt(s.ws - 1))), fresh: false }; }
        if (k === 'rsh1') return { ...s, val: sv(toSigned(s.val, s.ws) >> 1n), fresh: false };
        if (k === '=') {
          if (s.op) { const r = calc(s.op, s.acc, s.val, s.ws); onEmit({ expr: `${fmtBase(s.acc, s.base, s.ws)} ${SYM[s.op]} ${fmtBase(s.val, s.base, s.ws)} =`, res: fmtBase(r, s.base, s.ws), base: s.base }); return { ...s, val: r, acc: null, op: null, fresh: true, expr: '' }; }
          return s;
        }
        if (OPS[k]) {
          let acc = s.val;
          if (s.op && !s.fresh) { acc = calc(s.op, s.acc, s.val, s.ws); }
          else if (s.op && s.fresh) { return { ...s, op: k, expr: `${fmtBase(s.acc, s.base, s.ws)} ${SYM[k]}` }; }
          return { ...s, acc, op: k, val: acc, fresh: true, expr: `${fmtBase(acc, s.base, s.ws)} ${SYM[k]}` };
        }
      } catch (e) { return { ...initProg(), base: s.base, ws: s.ws, err: e.message }; }
      return s;
    });
  };
  useEffect(() => {
    const k = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const m = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'c', Delete: 'ce', '+': '+', '-': '-', '*': '*', '/': '/', '%': 'mod', '&': 'and', '|': 'or', '^': 'xor', '~': 'not', '<': 'lsh', '>': 'rsh' };
      const key = m[e.key] || (/^[0-9a-fA-F]$/.test(e.key) ? e.key.toUpperCase() : null); if (!key) return; e.preventDefault(); press(key);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  const B = (k, label, cls = '', dis) => <button key={k} className={'cb ' + cls} disabled={dis} onClick={() => press(k)} aria-label={typeof label === 'string' ? label : k}>{label}</button>;
  const dis = (c) => parseInt(c, 16) >= base;
  const setBase = (b) => setSt((s) => ({ ...s, base: b, fresh: true }));
  const setWs = () => setSt((s) => { const i = WS.findIndex((w) => w[1] === s.ws); const n = WS[(i + 1) % WS.length][1]; return { ...s, ws: n, val: wrap(s.val > 0n && toSigned(s.val, s.ws) < 0n ? toSigned(s.val, s.ws) : s.val, n), acc: s.acc === null ? null : wrap(s.acc, n) }; });
  const toggleBit = (i) => setSt((s) => ({ ...s, val: s.val ^ (1n << BigInt(i)), fresh: true }));
  const wsName = WS.find((w) => w[1] === ws)[0];
  return (
    <div className="calc-prog">
      <div className="calc-bases" role="radiogroup" aria-label="Number base">
        {BASES.map(([n, b]) => <button key={n} role="radio" aria-checked={base === b} className={'calc-base' + (base === b ? ' on' : '')} onClick={() => setBase(b)}><b>{n}</b><span>{groupStr(fmtBase(val, b, ws), b)}</span></button>)}
      </div>
      <div className="calc-bits" aria-label="Bit toggles">
        {[3, 2, 1, 0].map((row) => <div className="calc-bitrow" key={row}>{[3, 2, 1, 0].map((nib) => <div className="calc-nib" key={nib}>{[3, 2, 1, 0].map((bit) => { const i = row * 16 + nib * 4 + bit; const off = i >= ws; return <button key={i} className={'calc-bit' + ((val >> BigInt(i)) & 1n ? ' on' : '')} disabled={off} onClick={() => toggleBit(i)} aria-label={`Bit ${i}`} title={`Bit ${i}`}>{off ? '' : (val >> BigInt(i)) & 1n ? '1' : '0'}</button>; })}</div>)}<small>{row * 16 + 15}</small></div>)}
      </div>
      <div className="calc-prog-top"><button className="fb sm" onClick={setWs} title="Change word size">{wsName}</button><span className="muted" style={{ fontSize: 12 }}>{ws}-bit · range {toSigned(1n << BigInt(ws - 1), ws).toString()} … {((1n << BigInt(ws - 1)) - 1n).toString()}</span></div>
      <div className="calc-pad prog">
        {B('lsh', '<<', 'op')}{B('rsh', '>>', 'op')}{B('c', 'C', 'op')}{B('back', <Icon name="backspace" size={18} />, 'op')}{B('/', '÷', 'op')}
        {B('and', 'AND', 'op')}{B('or', 'OR', 'op')}{B('xor', 'XOR', 'op')}{B('not', 'NOT', 'op')}{B('*', '×', 'op')}
        {B('nand', 'NAND', 'op')}{B('nor', 'NOR', 'op')}{B('rol', 'RoL', 'op')}{B('ror', 'RoR', 'op')}{B('-', '−', 'op')}
        {B('A', 'A', 'num', dis('A'))}{B('B', 'B', 'num', dis('B'))}{B('7', '7', 'num', dis('7'))}{B('8', '8', 'num', dis('8'))}{B('9', '9', 'num', dis('9'))}
        {B('C', 'C', 'num', dis('C'))}{B('D', 'D', 'num', dis('D'))}{B('4', '4', 'num', dis('4'))}{B('5', '5', 'num', dis('5'))}{B('6', '6', 'num', dis('6'))}
        {B('E', 'E', 'num', dis('E'))}{B('F', 'F', 'num', dis('F'))}{B('1', '1', 'num', dis('1'))}{B('2', '2', 'num', dis('2'))}{B('3', '3', 'num', dis('3'))}
        {B('mod', 'Mod', 'op')}{B('neg', '±', 'op')}{B('0', '0', 'num')}{B('ce', 'CE', 'op')}{B('+', '+', 'op')}
        {B('=', '=', 'eq wide')}
      </div>
    </div>
  );
}
export const progDisplay = (st) => ({ main: groupStr(fmtBase(st.val, st.base, st.ws), st.base), expr: st.expr, err: st.err });
