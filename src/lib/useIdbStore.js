import { useCallback, useEffect, useRef, useState } from 'react';
import { idbGet, idbSet } from './idb.js';

/* Like useStore, but persisted in IndexedDB (for big data such as pictures). Same API:
   const [data, set, meta] = useIdbStore('whiteboard', () => initial, migrate?)   meta.ready is true once loaded. */
export function useIdbStore(name, initial, migrate) {
  const key = `techomato:${name}`; const mk = () => (typeof initial === 'function' ? initial() : initial);
  const [state, setState] = useState(mk); const ref = useRef(state); const [ready, setReady] = useState(false); const [status, setStatus] = useState('saved'); const timer = useRef(0); const dirty = useRef(false);
  useEffect(() => { let dead = false; (async () => { const v = await idbGet(key); if (dead) return; if (v && typeof v === 'object' && !dirty.current) { ref.current = migrate ? migrate(v) : v; setState(ref.current); } setReady(true); })(); return () => { dead = true; }; }, [key]); // eslint-disable-line
  const flush = useCallback(async () => { clearTimeout(timer.current); timer.current = 0; if (!dirty.current) return; const ok = await idbSet(key, ref.current); setStatus(ok ? 'saved' : 'error'); }, [key]);
  const set = useCallback((fn) => { const next = typeof fn === 'function' ? fn(ref.current) : fn; if (next === ref.current) return; dirty.current = true; ref.current = next; setState(next); setStatus('saving'); clearTimeout(timer.current); timer.current = setTimeout(flush, 600); }, [flush]);
  useEffect(() => { const h = () => { if (timer.current) flush(); }; window.addEventListener('pagehide', h); document.addEventListener('visibilitychange', h); return () => { h(); window.removeEventListener('pagehide', h); document.removeEventListener('visibilitychange', h); }; }, [flush]);
  return [state, set, { status, ready, ref, flush, replace: (v) => set(() => v), blank: mk }];
}
