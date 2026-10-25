export const FUNCS = {};
/* def(names, fn, { min, max, lift, lazy }) */
export function def(names, fn, opts = {}) {
  const o = { fn, min: opts.min ?? 0, max: opts.max ?? 255, lift: opts.lift, lazy: opts.lazy };
  for (const n of [].concat(names)) FUNCS[n] = o;
}
