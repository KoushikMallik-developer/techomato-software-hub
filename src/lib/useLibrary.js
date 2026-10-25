import { useCallback, useEffect, useRef, useState } from 'react';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const MAX_VERSIONS = 15;
const MAX_UNDO = 120;
const AUTO_VERSION_MS = 10 * 60 * 1000;

const makeItem = (data, title = 'Untitled') => {
  const t = Date.now();
  return { id: uid(), title, created: t, updated: t, snapT: t, data, versions: [] };
};

function load(key, blank) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || localStorage.getItem(key.replace('techomato:', 'softhub:')) || 'null');
    if (saved && Array.isArray(saved.items) && saved.items.length && saved.items.some((i) => i.id === saved.currentId)) {
      return { ...saved, items: saved.items.map((i) => ({ versions: [], created: i.updated, snapT: i.updated, ...i })) };
    }
  } catch {
    /* ignore corrupted storage */
  }
  const first = makeItem(blank());
  return { items: [first], currentId: first.id };
}

/*
  A list of files for one app, persisted in localStorage, with undo/redo history,
  automatic + manual version history, duplicate and backup/restore.

  `blank` returns the data of an empty file. Always change data with
  edit(fn) (fn receives the latest data and returns the new data) so that
  fast sequences of changes (dragging, typing) never work from stale state.
*/
export function useLibrary(app, blank) {
  const key = `techomato:${app}`;
  const blankRef = useRef(blank);
  blankRef.current = blank;

  const [lib, setLibState] = useState(() => load(key, blank));
  const libRef = useRef(lib);
  const hist = useRef({});
  const [status, setStatus] = useState('saved');
  const [savedAt, setSavedAt] = useState(Date.now());

  const apply = useCallback((fn) => {
    const next = fn(libRef.current);
    if (next === libRef.current) return;
    libRef.current = next;
    setLibState(next);
    setStatus('saving');
  }, []);

  // ----- persistence -----
  const persist = useCallback(() => {
    const write = (o) => localStorage.setItem(key, JSON.stringify(o));
    let obj = libRef.current;
    try {
      write(obj);
    } catch {
      try {
        obj = { ...obj, items: obj.items.map((i) => (i.id === obj.currentId ? i : { ...i, versions: [] })) };
        write(obj);
      } catch {
        try {
          obj = { ...obj, items: obj.items.map((i) => ({ ...i, versions: [] })) };
          write(obj);
        } catch (e) {
          console.warn('Techomato: could not save (storage full?)', e);
          setStatus('error');
          return;
        }
      }
    }
    setStatus('saved');
    setSavedAt(Date.now());
  }, [key]);

  useEffect(() => {
    const t = setTimeout(persist, 450);
    return () => clearTimeout(t);
  }, [lib, persist]);

  useEffect(() => {
    const h = () => persist();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [persist]);

  // ----- editing -----
  const mapCurrent = (l, fn) => ({ ...l, items: l.items.map((i) => (i.id === l.currentId ? fn(i) : i)) });

  const edit = useCallback(
    (fn, opts = {}) =>
      apply((l) => {
        const cur = l.items.find((i) => i.id === l.currentId);
        if (!cur) return l;
        const data = fn(cur.data);
        if (data === cur.data || data === undefined) return l;
        const now = Date.now();
        if (opts.history !== false) {
          const h = hist.current[cur.id] || (hist.current[cur.id] = { u: [], r: [], key: null, t: 0 });
          const merge = opts.coalesce && h.key === opts.coalesce && now - h.t < (opts.coalesceMs || 1200);
          if (!merge) {
            h.u.push(cur.data);
            if (h.u.length > MAX_UNDO) h.u.shift();
          }
          h.r = [];
          h.key = opts.coalesce || null;
          h.t = now;
        }
        let versions = cur.versions;
        let snapT = cur.snapT;
        if (now - (cur.snapT || cur.created) > AUTO_VERSION_MS) {
          versions = [...versions, { id: uid(), t: cur.updated, label: '', auto: true, data: cur.data }].slice(-MAX_VERSIONS);
          snapT = now;
        }
        return mapCurrent(l, (i) => ({ ...i, data, versions, snapT, updated: now }));
      }),
    [apply]
  );

  const update = useCallback(
    (patch, opts) => {
      if (patch.data !== undefined) {
        const { data, ...rest } = patch;
        if (Object.keys(rest).length) apply((l) => mapCurrent(l, (i) => ({ ...i, ...rest, updated: Date.now() })));
        edit(() => data, opts);
      } else {
        apply((l) => mapCurrent(l, (i) => ({ ...i, ...patch, updated: Date.now() })));
      }
    },
    [apply, edit]
  );

  const undo = useCallback(
    () =>
      apply((l) => {
        const cur = l.items.find((i) => i.id === l.currentId);
        const h = cur && hist.current[cur.id];
        if (!h || !h.u.length) return l;
        const prev = h.u.pop();
        h.r.push(cur.data);
        h.key = null;
        return mapCurrent(l, (i) => ({ ...i, data: prev, updated: Date.now() }));
      }),
    [apply]
  );

  const redo = useCallback(
    () =>
      apply((l) => {
        const cur = l.items.find((i) => i.id === l.currentId);
        const h = cur && hist.current[cur.id];
        if (!h || !h.r.length) return l;
        const next = h.r.pop();
        h.u.push(cur.data);
        h.key = null;
        return mapCurrent(l, (i) => ({ ...i, data: next, updated: Date.now() }));
      }),
    [apply]
  );

  // ----- files -----
  const create = useCallback(
    (data, title) => {
      const item = makeItem(data ?? blankRef.current(), title);
      apply((l) => ({ ...l, items: [item, ...l.items], currentId: item.id }));
      return item.id;
    },
    [apply]
  );

  const open = useCallback((id) => apply((l) => (l.items.some((i) => i.id === id) ? { ...l, currentId: id } : l)), [apply]);

  const remove = useCallback(
    (id) => {
      delete hist.current[id];
      apply((l) => {
        let items = l.items.filter((i) => i.id !== id);
        if (!items.length) items = [makeItem(blankRef.current())];
        const currentId = items.some((i) => i.id === l.currentId) ? l.currentId : items[0].id;
        return { ...l, items, currentId };
      });
    },
    [apply]
  );

  const duplicate = useCallback(
    (id) => {
      const src = libRef.current.items.find((i) => i.id === (id || libRef.current.currentId));
      if (!src) return;
      const copy = makeItem(src.data, (src.title || 'Untitled') + ' (copy)');
      apply((l) => ({ ...l, items: [copy, ...l.items], currentId: copy.id }));
    },
    [apply]
  );

  // ----- versions -----
  const snapshot = useCallback(
    (label = '') =>
      apply((l) =>
        mapCurrent(l, (i) => ({
          ...i,
          snapT: Date.now(),
          versions: [...i.versions, { id: uid(), t: Date.now(), label, auto: false, data: i.data }].slice(-MAX_VERSIONS),
        }))
      ),
    [apply]
  );

  const restore = useCallback(
    (vid) =>
      apply((l) => {
        const cur = l.items.find((i) => i.id === l.currentId);
        const v = cur && cur.versions.find((x) => x.id === vid);
        if (!v) return l;
        const h = hist.current[cur.id] || (hist.current[cur.id] = { u: [], r: [], key: null, t: 0 });
        h.u.push(cur.data);
        h.r = [];
        return mapCurrent(l, (i) => ({
          ...i,
          data: v.data,
          updated: Date.now(),
          versions: [...i.versions, { id: uid(), t: Date.now(), label: 'Before restore', auto: false, data: cur.data }].slice(-MAX_VERSIONS),
        }));
      }),
    [apply]
  );

  const deleteVersion = useCallback(
    (vid) => apply((l) => mapCurrent(l, (i) => ({ ...i, versions: i.versions.filter((v) => v.id !== vid) }))),
    [apply]
  );

  // ----- backup -----
  const backup = useCallback(
    () => ({ app, kind: 'techomato-backup', version: 1, exported: new Date().toISOString(), items: libRef.current.items.map(({ versions, ...i }) => i) }),
    [app]
  );

  const restoreBackup = useCallback(
    (obj) => {
      if (!obj || (obj.kind !== 'techomato-backup' && obj.kind !== 'softhub-backup') || obj.app !== app || !Array.isArray(obj.items)) return 0;
      const items = obj.items.filter((i) => i && i.data !== undefined).map((i) => ({ ...makeItem(i.data, i.title || 'Untitled'), created: i.created || Date.now() }));
      if (!items.length) return 0;
      apply((l) => ({ ...l, items: [...items, ...l.items], currentId: items[0].id }));
      return items.length;
    },
    [apply, app]
  );

  const current = lib.items.find((i) => i.id === lib.currentId) || lib.items[0];
  const h = hist.current[current.id];

  return {
    items: lib.items,
    current,
    edit,
    update,
    create,
    open,
    remove,
    duplicate,
    undo,
    redo,
    canUndo: !!(h && h.u.length),
    canRedo: !!(h && h.r.length),
    snapshot,
    restore,
    deleteVersion,
    backup,
    restoreBackup,
    status,
    savedAt,
  };
}
