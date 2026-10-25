import { useCallback, useEffect, useRef, useState } from 'react';

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

/*
  Small persisted state for the Techomato apps.

    const [data, set, meta] = useStore('todo', () => initialData, migrate?)
    set((d) => ({ ...d, x: 1 }))      // always pass a function so rapid updates never use stale state
    meta.status   -> 'saved' | 'saving' | 'error'
    meta.replace(obj)  -> replaces everything (used by backup restore)

  Data lives in localStorage under "techomato:<name>". Other tabs stay in sync through the storage event.
*/
export function useStore(name, initial, migrate) {
  const key = `techomato:${name}`;
  const mk = () => (typeof initial === 'function' ? initial() : initial);
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const v = JSON.parse(raw); if (v !== null && typeof v === 'object') return migrate ? migrate(v) : v; }
    } catch { /* corrupted storage: start fresh */ }
    return mk();
  });
  const ref = useRef(state);
  const timer = useRef(0);
  const [status, setStatus] = useState('saved');

  const flush = useCallback(() => {
    clearTimeout(timer.current); timer.current = 0;
    try { localStorage.setItem(key, JSON.stringify(ref.current)); setStatus('saved'); } catch { setStatus('error'); }
  }, [key]);

  const set = useCallback((fn) => {
    const next = typeof fn === 'function' ? fn(ref.current) : fn;
    if (next === ref.current) return;
    ref.current = next; setState(next); setStatus('saving');
    if (!timer.current) timer.current = setTimeout(flush, 250);
  }, [flush]);

  useEffect(() => {
    const onHide = () => { if (timer.current) flush(); };
    const onStorage = (e) => {
      if (e.key !== key || !e.newValue) return;
      try { const v = JSON.parse(e.newValue); ref.current = migrate ? migrate(v) : v; setState(ref.current); } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('storage', onStorage);
    return () => { onHide(); window.removeEventListener('beforeunload', onHide); window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('storage', onStorage); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, flush]);

  return [state, set, { status, ref, flush, replace: (v) => set(() => v), blank: mk }];
}
