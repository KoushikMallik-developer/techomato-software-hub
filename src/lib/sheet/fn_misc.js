import { def } from './registry.js';
import { ERR, SErr, flatten, num, S, str } from './fnhelp.js';

/* Marker value rendered as an in-cell chart by the grid */
export class Spark { constructor(data, opts) { this.data = data; this.opts = opts; } toString() { return ''; } }
def('SPARKLINE', ([d, o], ctx) => {
  const data = ctx.api.toMatrix(d).flat().map((v) => (typeof v === 'number' ? v : null));
  const opts = {};
  if (o !== undefined) ctx.api.toMatrix(o).forEach((row) => { if (row.length >= 2 && typeof row[0] === 'string') opts[row[0].toLowerCase()] = row[1]; });
  return new Spark(data, opts);
}, { min: 1, max: 2 });
def('IMAGE', ([u]) => ({ image: String(u) }), { min: 1, max: 4, lift: false });
def('CONVERT', ([x, from, to]) => {
  const U = { m: ['len', 1], km: ['len', 1000], cm: ['len', 0.01], mm: ['len', 0.001], mi: ['len', 1609.344], ft: ['len', 0.3048], in: ['len', 0.0254], yd: ['len', 0.9144],
    g: ['mass', 1], kg: ['mass', 1000], mg: ['mass', 0.001], lbm: ['mass', 453.59237], oz: ['mass', 28.349523125],
    l: ['vol', 1], ml: ['vol', 0.001], gal: ['vol', 3.785411784], qt: ['vol', 0.946352946], pt: ['vol', 0.473176473], cup: ['vol', 0.2365882365],
    s: ['time', 1], min: ['time', 60], hr: ['time', 3600], day: ['time', 86400], yr: ['time', 31557600], mn: ['time', 60] };
  const a = String(from); const b = String(to);
  if (['C', 'F', 'K'].includes(a) && ['C', 'F', 'K'].includes(b)) {
    let c = num(x); if (a === 'F') c = ((c - 32) * 5) / 9; else if (a === 'K') c -= 273.15;
    return b === 'C' ? c : b === 'F' ? (c * 9) / 5 + 32 : c + 273.15;
  }
  const A = U[a]; const B = U[b]; if (!A || !B || A[0] !== B[0]) throw ERR.NA;
  return (num(x) * A[1]) / B[1];
}, { min: 3, max: 3, lift: [0] });
