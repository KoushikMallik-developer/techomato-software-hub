import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, useToast } from '../components/fxui.jsx';
import { useStore, uid } from '../lib/useStore.js';
import { pickFiles, safeName } from '../lib/download.js';
import { FORMATS, fmtOf, fmtBytes, stem, RATIOS, decode, render, encode, formatSupport, outSize } from './convert/engine.js';
import '../styles/convert.css';

const DEF = { format: 'webp', quality: 82, targetKB: 0, mode: 'none', w: 1920, h: 1080, pct: 50, noUp: true, crop: 0, rot: 0, flipH: false, flipV: false, gray: false, fill: false, bg: '#ffffff', ico: [16, 32, 48, 64, 128, 256], pattern: '{name}' };
const PRESETS = [
  ['Web (WebP, max 1920 px)', { format: 'webp', quality: 80, mode: 'fit', w: 1920, h: 1920, noUp: true }],
  ['Email (JPG, max 1280 px)', { format: 'jpeg', quality: 75, mode: 'fit', w: 1280, h: 1280, noUp: true }],
  ['Small file (JPG ≤ 200 KB)', { format: 'jpeg', quality: 85, targetKB: 200, mode: 'fit', w: 2000, h: 2000, noUp: true }],
  ['Square post (JPG 1080)', { format: 'jpeg', quality: 88, mode: 'exact', w: 1080, h: 1080, crop: 1, noUp: false }],
  ['Thumbnail (WebP 320 px)', { format: 'webp', quality: 75, mode: 'width', w: 320, noUp: true }],
  ['Favicon / app icon (ICO)', { format: 'ico', crop: 1, mode: 'none' }],
  ['Lossless PNG', { format: 'png', mode: 'none', targetKB: 0 }],
];
const migrate = (d) => ({ ...DEF, ...(d && d.s ? d.s : {}) });

export default function ConvertApp() {
  const [stored, setStored, meta] = useStore('convert', () => ({ s: DEF }), (d) => ({ s: migrate(d) }));
  const s = stored.s; const set = (p) => setStored((d) => ({ ...d, s: { ...d.s, ...p } }));
  const [toastNode, toast] = useToast();
  const [items, setItems] = useState([]); const [support, setSupport] = useState({ png: true, jpeg: true, webp: true, bmp: true, ico: true, avif: false });
  const [over, setOver] = useState(false); const [view, setView] = useState(null); const [busy, setBusy] = useState(false); const [zipping, setZipping] = useState(false);
  const srcs = useRef(new Map()); const gen = useRef(0);
  useEffect(() => { formatSupport().then(setSupport); }, []);

  const key = JSON.stringify([s.format, s.quality, s.targetKB, s.mode, s.w, s.h, s.pct, s.noUp, s.crop, s.rot, s.flipH, s.flipV, s.gray, s.fill, s.bg, s.ico]);
  const upd = (id, p) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const add = useCallback(async (files) => {
    const imgs = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|avif|bmp|svg|ico|heic)$/i.test(f.name));
    if (!imgs.length) { toast('No image files found'); return; }
    const fresh = imgs.map((f) => ({ id: uid(), name: f.name, size: f.size, file: f, status: 'pending', thumb: URL.createObjectURL(f) }));
    setItems((l) => [...l, ...fresh]);
  }, [toast]);

  /* (re)process everything when settings or the list change */
  useEffect(() => {
    const my = ++gen.current; const todo = items.filter((x) => x.rev !== key && x.status !== 'error'); if (!todo.length) return undefined;
    const t = setTimeout(async () => {
      setBusy(true);
      for (const it of todo) {
        if (my !== gen.current) return;
        upd(it.id, { status: 'working' });
        try {
          let src = srcs.current.get(it.id); if (!src) { src = await decode(it.file); srcs.current.set(it.id, src); }
          const f = fmtOf(s.format);
          const c = render(src, { mode: s.mode, w: +s.w || 0, h: +s.h || 0, pct: +s.pct || 100, noUp: s.noUp, crop: s.crop, rot: s.rot, flipH: s.flipH, flipV: s.flipV, gray: s.gray, bg: (s.fill || ['jpeg', 'bmp'].includes(f.id)) ? s.bg : null });
          const { blob, quality } = await encode(c, { format: s.format, quality: s.quality, targetKB: s.targetKB, icoSizes: s.ico });
          const prev = it.out && it.out.url; if (prev) URL.revokeObjectURL(prev);
          if (my !== gen.current) return;
          upd(it.id, { status: 'done', rev: key, w: src.w, h: src.h, out: { blob, url: URL.createObjectURL(blob), w: c.width, h: c.height, size: blob.size, q: quality } });
        } catch (e) { upd(it.id, { status: 'error', err: e.message || 'Could not convert' }); }
      }
      if (my === gen.current) setBusy(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [key, items.length]);

  useEffect(() => { const h = (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); add(fs); } }; window.addEventListener('paste', h); return () => window.removeEventListener('paste', h); }, [add]);

  const remove = (id) => { setItems((l) => { const x = l.find((i) => i.id === id); if (x) { URL.revokeObjectURL(x.thumb); if (x.out) URL.revokeObjectURL(x.out.url); } return l.filter((i) => i.id !== id); }); srcs.current.delete(id); };
  const clear = () => { items.forEach((x) => { URL.revokeObjectURL(x.thumb); if (x.out) URL.revokeObjectURL(x.out.url); }); srcs.current.clear(); setItems([]); };
  const retry = () => { setItems((l) => l.map((x) => (x.status === 'error' ? { ...x, status: 'pending', rev: null } : x))); };

  const f = fmtOf(s.format);
  const names = useMemo(() => { const seen = {}; return Object.fromEntries(items.map((it, i) => { let n = safeName((s.pattern || '{name}').replace(/\{name\}/g, stem(it.name)).replace(/\{n\}/g, String(i + 1).padStart(2, '0')).replace(/\{size\}/g, it.out ? `${it.out.w}x${it.out.h}` : '')); const k = n.toLowerCase(); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) n += '-' + seen[k]; return [it.id, n + '.' + f.ext]; })); }, [items, s.pattern, f.ext]);
  const save = (it) => { const a = document.createElement('a'); a.href = it.out.url; a.download = names[it.id]; document.body.appendChild(a); a.click(); a.remove(); };
  const saveAll = async () => {
    const done = items.filter((x) => x.out); if (!done.length) return; if (done.length === 1) { save(done[0]); return; }
    setZipping(true); try { const JSZip = (await import('jszip')).default; const z = new JSZip(); done.forEach((it) => z.file(names[it.id], it.out.blob)); const blob = await z.generateAsync({ type: 'blob', compression: 'STORE' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'converted-images.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch { toast('Could not create the ZIP'); } setZipping(false);
  };
  const totals = useMemo(() => { const d = items.filter((x) => x.out); return { n: d.length, from: d.reduce((a, x) => a + x.size, 0), to: d.reduce((a, x) => a + x.out.size, 0) }; }, [items]);
  const preview = (() => { const it = items.find((x) => x.w); if (!it) return null; const r = outSize(it.w, it.h, { crop: s.crop, rot: s.rot, mode: s.mode, w: +s.w, h: +s.h, pct: +s.pct, noUp: s.noUp }); return `${it.w}×${it.h} → ${it.out ? it.out.w + '×' + it.out.h : r.tw + '×' + r.th}`; })();
  const icoToggle = (n) => set({ ico: s.ico.includes(n) ? s.ico.filter((x) => x !== n) : [...s.ico, n].sort((a, b) => a - b) });

  return (
    <div className="fx cv" style={{ '--brand': '#1a73c9', '--brand-h': '#155a9f', '--brand-soft': '#e3f0fb' }} data-app="convert">
      <AppBar id="convert" name="Techomato Image Converter" status={meta.status === 'error' ? 'error' : undefined} backup={{ name: 'convert', get: () => stored, set: (d) => meta.replace({ s: migrate(d) }), blank: () => ({ s: DEF }) }} />
      <div className="cv-top" role="toolbar" aria-label="Files">
        <button className="fb pri" onClick={async () => add(await pickFiles('image/*,.heic'))}><Icon name="plus" size={14} /> Add images</button>
        <button className="fb" onClick={saveAll} disabled={!totals.n || zipping}><Icon name="download" size={14} /> {zipping ? 'Zipping…' : totals.n > 1 ? `Download all (${totals.n}) as ZIP` : 'Download'}</button>
        <button className="fb sub" onClick={clear} disabled={!items.length}>Clear all</button>
        {items.some((x) => x.status === 'error') && <button className="fb sub" onClick={retry}>Retry failed</button>}
        <div className="spacer" />
        {totals.n > 0 && <span className="cv-sum">{fmtBytes(totals.from)} → <b>{fmtBytes(totals.to)}</b> <em className={totals.to <= totals.from ? 'good' : 'bad'}>{totals.from ? (totals.to <= totals.from ? '−' : '+') + Math.abs(Math.round((1 - totals.to / totals.from) * 100)) + '%' : ''}</em></span>}
        {busy && <span className="cv-busy"><i className="cv-spin" /> Converting…</span>}
      </div>
      <div className="cv-main">
        <aside className="cv-side" aria-label="Settings">
          <div className="fx-head">Quick presets</div>
          <select className="fi" aria-label="Preset" value="" onChange={(e) => { const p = PRESETS[+e.target.value]; if (p) set({ ...DEF, ...{ ico: s.ico, pattern: s.pattern, bg: s.bg }, ...p[1] }); }}><option value="" disabled>Choose a preset…</option>{PRESETS.map((p, i) => <option key={p[0]} value={i}>{p[0]}</option>)}</select>
          <div className="fx-head">Output format</div>
          <div className="cv-fmts" role="radiogroup" aria-label="Format">{FORMATS.map((x) => <button key={x.id} role="radio" aria-checked={s.format === x.id} className={'cv-fmt' + (s.format === x.id ? ' on' : '')} disabled={!support[x.id]} title={support[x.id] ? '' : 'Not supported by this browser'} onClick={() => set({ format: x.id })}>{x.label}</button>)}</div>
          {f.lossy && <><label className="cv-lbl">Quality <b>{s.quality}%</b><input type="range" min="1" max="100" value={s.quality} onChange={(e) => set({ quality: +e.target.value })} aria-label="Quality" /></label>
            <label className="cv-lbl">Limit file size to (KB, 0 = off)<input className="fi" type="number" min="0" value={s.targetKB} onChange={(e) => set({ targetKB: Math.max(0, +e.target.value || 0) })} aria-label="Target size in KB" /></label></>}
          {f.id === 'ico' && <div className="cv-lbl">Icon sizes<div className="cv-chips">{[16, 24, 32, 48, 64, 128, 256].map((n) => <button key={n} className={'cv-chip' + (s.ico.includes(n) ? ' on' : '')} aria-pressed={s.ico.includes(n)} onClick={() => icoToggle(n)}>{n}</button>)}</div></div>}
          <div className="fx-head">Resize</div>
          <select className="fi" aria-label="Resize mode" value={s.mode} onChange={(e) => set({ mode: e.target.value })}><option value="none">Keep original size</option><option value="percent">By percentage</option><option value="width">Set width (keep ratio)</option><option value="height">Set height (keep ratio)</option><option value="fit">Fit inside a box</option><option value="exact">Exact size (crop to fill)</option></select>
          {s.mode === 'percent' && <label className="cv-lbl">Scale <b>{s.pct}%</b><input type="range" min="5" max="400" value={s.pct} onChange={(e) => set({ pct: +e.target.value })} aria-label="Percent" /></label>}
          {['width', 'fit', 'exact'].includes(s.mode) && <label className="cv-lbl">Width (px)<input className="fi" type="number" min="1" value={s.w} onChange={(e) => set({ w: Math.max(1, +e.target.value || 1) })} aria-label="Width" /></label>}
          {['height', 'fit', 'exact'].includes(s.mode) && <label className="cv-lbl">Height (px)<input className="fi" type="number" min="1" value={s.h} onChange={(e) => set({ h: Math.max(1, +e.target.value || 1) })} aria-label="Height" /></label>}
          {s.mode !== 'none' && s.mode !== 'exact' && <label className="cv-chk"><input type="checkbox" checked={s.noUp} onChange={(e) => set({ noUp: e.target.checked })} /> Never enlarge small images</label>}
          {preview && <div className="cv-note">{preview}</div>}
          <div className="fx-head">Adjust</div>
          <label className="cv-lbl">Crop to ratio (centre)<select className="fi" aria-label="Crop ratio" value={s.crop} onChange={(e) => set({ crop: +e.target.value })}>{RATIOS.map(([n, v]) => <option key={n} value={v}>{n}</option>)}</select></label>
          <div className="cv-row"><button className="fb sub" onClick={() => set({ rot: (s.rot + 270) % 360 })} title="Rotate left"><Icon name="rotate" size={14} /> Left</button><button className="fb sub" onClick={() => set({ rot: (s.rot + 90) % 360 })} title="Rotate right"><Icon name="rotate" size={14} /> Right</button><button className={'fb sub' + (s.flipH ? ' on' : '')} aria-pressed={s.flipH} onClick={() => set({ flipH: !s.flipH })}><Icon name="flipH" size={14} /> Flip</button></div>
          {(s.rot || s.flipH) ? <div className="cv-note">Rotation {s.rot}°{s.flipH ? ', mirrored' : ''} <button className="fb sub sm" onClick={() => set({ rot: 0, flipH: false })}>Reset</button></div> : null}
          <label className="cv-chk"><input type="checkbox" checked={s.gray} onChange={(e) => set({ gray: e.target.checked })} /> Black and white</label>
          {!['jpeg', 'bmp'].includes(s.format) && <label className="cv-chk"><input type="checkbox" checked={s.fill} onChange={(e) => set({ fill: e.target.checked })} /> Fill transparent areas</label>}
          {(s.fill || ['jpeg', 'bmp'].includes(s.format)) && <label className="cv-lbl">Background colour<input type="color" className="cv-color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} aria-label="Background colour" /></label>}
          <div className="fx-head">File names</div>
          <input className="fi" value={s.pattern} onChange={(e) => set({ pattern: e.target.value })} aria-label="Name pattern" />
          <div className="cv-note">Use <code>{'{name}'}</code>, <code>{'{n}'}</code> (number) and <code>{'{size}'}</code>. Example: {safeName((s.pattern || '{name}').replace('{name}', 'photo').replace('{n}', '01').replace('{size}', '800x600'))}.{f.ext}</div>
          <button className="fb sub" onClick={() => setStored((d) => ({ ...d, s: DEF }))}>Reset all settings</button>
          <div className="cv-note priv">Your images never leave this browser. Metadata such as location and camera info is removed on conversion.</div>
        </aside>
        <section className={'cv-drop' + (over ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }} aria-label="Images">
          {!items.length ? (
            <div className="fx-empty cv-empty"><div className="cv-big"><Icon name="image" size={40} /></div><h2>Convert, resize and compress images</h2><p>Drop images here, paste them, or choose files. Convert between JPG, PNG, WebP, AVIF, BMP and ICO, in bulk, without uploading anything.</p><button className="fb pri lg" onClick={async () => add(await pickFiles('image/*,.heic'))}>Choose images</button><p className="muted">Reads JPG, PNG, GIF (first frame), WebP, AVIF, BMP, SVG and ICO. HEIC works only if your browser can open it.</p></div>
          ) : (
            <div className="cv-list">{items.map((it) => (
              <div key={it.id} className={'cv-item ' + it.status}>
                <button className="cv-thumb" onClick={() => it.out && setView(it.id)} aria-label={'Compare ' + it.name}><img src={it.out ? it.out.url : it.thumb} alt="" /></button>
                <div className="cv-info"><div className="cv-name ellip" title={it.name}>{it.name}</div>
                  <div className="cv-meta">{it.w ? `${it.w}×${it.h}` : '…'} · {fmtBytes(it.size)}{it.out && <> → <b>{it.out.w}×{it.out.h}</b> · <b>{fmtBytes(it.out.size)}</b> <em className={it.out.size <= it.size ? 'good' : 'bad'}>{it.out.size <= it.size ? '−' : '+'}{Math.abs(Math.round((1 - it.out.size / it.size) * 100))}%</em></>}</div>
                  {it.status === 'error' && <div className="cv-err">{it.err}</div>}{it.status === 'working' && <div className="cv-meta"><i className="cv-spin" /> Working…</div>}
                  {it.out && <div className="cv-meta out">{names[it.id]}{it.out.q != null && f.lossy && s.targetKB ? ` · quality ${Math.round(it.out.q * 100)}%` : ''}</div>}</div>
                <div className="cv-act"><button className="fb sub sm" disabled={!it.out} onClick={() => save(it)} aria-label={'Download ' + it.name}><Icon name="download" size={14} /></button><button className="fb sub sm" onClick={() => remove(it.id)} aria-label={'Remove ' + it.name}><Icon name="x" size={14} /></button></div>
              </div>))}
              <button className="cv-add" onClick={async () => add(await pickFiles('image/*,.heic'))}><Icon name="plus" size={18} /> Add more images</button></div>
          )}
          {over && <div className="cv-over">Drop images to add them</div>}
        </section>
      </div>
      {view && (() => { const it = items.find((x) => x.id === view); if (!it || !it.out) return null; return (
        <Modal title={names[it.id]} onClose={() => setView(null)} width={900} footer={<><button className="fb" onClick={() => save(it)}><Icon name="download" size={14} /> Download</button><button className="fb pri" onClick={() => setView(null)}>Close</button></>}>
          <div className="cv-cmp"><figure><figcaption>Original · {it.w}×{it.h} · {fmtBytes(it.size)}</figcaption><div className="cv-chk-bg"><img src={it.thumb} alt="Original" /></div></figure><figure><figcaption>Converted · {it.out.w}×{it.out.h} · {fmtBytes(it.out.size)}</figcaption><div className="cv-chk-bg"><img src={it.out.url} alt="Converted" /></div></figure></div>
        </Modal>); })()}
      {toastNode}
    </div>
  );
}
