// Small helpers shared by the Office import/export modules.

export const dataUrlToBytes = (url) => {
  const i = url.indexOf(',');
  const meta = url.slice(5, i);
  const body = url.slice(i + 1);
  if (/;base64/i.test(meta)) {
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return { bytes: out, mime: meta.split(';')[0] };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(body)), mime: meta.split(';')[0] };
};

export const bytesToBase64 = (bytes) => {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
};

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf' };
export const mimeFromName = (n) => MIME_BY_EXT[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

/* "rgb(12, 34, 56)" / "#abc" / "rgba(..., 0)" -> "0C2238" or null for transparent */
export function cssColorToHex(c) {
  if (!c) return null;
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(c.trim());
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (h) {
    const x = h[1].length === 3 ? h[1].split('').map((d) => d + d).join('') : h[1];
    return x.toUpperCase();
  }
  return null;
}

/* Rasterise any <img> source into PNG bytes through a canvas (for formats Office can't embed) */
export function rasterizeToPng(src, maxW = 1600) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, maxW / (img.naturalWidth || 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((img.naturalWidth || 300) * k));
        c.height = Math.max(1, Math.round((img.naturalHeight || 150) * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve({ ...dataUrlToBytes(c.toDataURL('image/png')), w: img.naturalWidth || c.width, h: img.naturalHeight || c.height });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function imageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
    img.onerror = () => resolve({ w: 300, h: 200 });
    img.src = src;
  });
}

export const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');

/* Child elements by local name */
export const kids = (el, name) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
export const kid = (el, name) => (el ? Array.from(el.children).find((c) => c.localName === name) || null : null);
export const attr = (el, name) => {
  if (!el) return null;
  for (const a of Array.from(el.attributes)) if (a.localName === name) return a.value;
  return null;
};

export const PAGE_PRESETS = [
  ['letter', 8.5, 11], ['a4', 8.27, 11.69], ['legal', 8.5, 14], ['a5', 5.83, 8.27], ['a3', 11.69, 16.54],
];
export function matchPageSize(w, h) {
  const [pw, ph] = w <= h ? [w, h] : [h, w];
  for (const [id, a, b] of PAGE_PRESETS) if (Math.abs(a - pw) < 0.06 && Math.abs(b - ph) < 0.06) return { size: id };
  return { size: 'custom', cw: Math.round(pw * 100) / 100, ch: Math.round(ph * 100) / 100 };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
