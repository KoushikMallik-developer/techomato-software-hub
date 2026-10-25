/* Tiny IndexedDB key/value helper (for big project blobs that don't fit localStorage). */
const DB = 'techomato-studio', STORE = 'kv';
function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => { db.close(); res(out && out.result); }; t.onerror = () => { db.close(); rej(t.error); }; }); };
export const idbGet = (k) => run('readonly', (s) => s.get(k)).catch(() => undefined);
export const idbSet = (k, v) => run('readwrite', (s) => s.put(v, k)).then(() => true).catch(() => false);
export const idbDel = (k) => run('readwrite', (s) => s.delete(k)).catch(() => false);
