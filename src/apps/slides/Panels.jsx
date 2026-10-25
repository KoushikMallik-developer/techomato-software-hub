import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { ColorPanel, useDismiss } from '../../components/ui.jsx';
import Chart from '../sheets/Chart.jsx';
import { chartFor } from './Render.jsx';
import { THEMES, TOKENS, LAYOUTS, FONTS, SHAPES, SHAPE_ORDER, rc, shapeD, fontStack, isDark, mixHex, plain } from './model.js';
import { CHART_TYPES } from '../sheets/Chart.jsx';

/* ---------- small controls ---------- */
export function Section({ title, children, open = true, right }) {
  return (
    <details className="fsec" open={open}>
      <summary><span>{title}</span>{right}</summary>
      <div className="fbody">{children}</div>
    </details>
  );
}
export const Row = ({ label, children, wide }) => (
  <label className={'frow' + (wide ? ' wide' : '')}><span className="flab">{label}</span><span className="fctl">{children}</span></label>
);
export function Num({ value, onChange, min, max, step = 1, suffix, width = 64, round = 1 }) {
  const [txt, setTxt] = useState(null);
  const shown = txt !== null ? txt : value === undefined || value === null || Number.isNaN(value) ? '' : String(Math.round(value / round) * round);
  const commit = (t) => { setTxt(null); if (t === '' || Number.isNaN(Number(t))) return; let v = Number(t); if (min !== undefined) v = Math.max(min, v); if (max !== undefined) v = Math.min(max, v); if (v !== value) onChange(v); };
  return (
    <span className="numfield">
      <input type="number" value={shown} step={step} min={min} max={max} style={{ width }}
        onChange={(e) => { setTxt(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && !Number.isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n); }}
        onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}
export function Seg({ value, onChange, options, title }) {
  return (
    <span className="seg" role="group" aria-label={title}>
      {options.map(([v, label, icon]) => (
        <button key={String(v)} type="button" className={value === v ? 'on' : ''} title={typeof label === 'string' ? label : undefined} aria-label={typeof label === 'string' ? label : undefined} aria-pressed={value === v} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(v)}>
          {icon ? <Icon name={icon} size={14} /> : label}
        </button>
      ))}
    </span>
  );
}
export const Check = ({ checked, onChange, label }) => (
  <label className="fcheck"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
);

/* ---------- colour picker with theme swatches ---------- */
export function ThemeColors({ th, onPick, current }) {
  return (
    <div className="themecols">
      <div className="sw-label">Theme colours</div>
      <div className="swrow">
        {TOKENS.map(([t, name]) => (
          <button key={t} type="button" className={'sw' + (current === t ? ' on' : '')} title={name} aria-label={name} style={{ background: rc(t, th) }} onClick={() => onPick(t)} />
        ))}
      </div>
    </div>
  );
}
export function ColorPick({ value, onPick, th, none, icon, title, bar, wide }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const shown = value ? rc(value, th) : null;
  return (
    <span className="drop colorpick" ref={ref} data-keepedit>
      <button type="button" className={icon ? 'tb' : 'swbtn'} title={title} aria-label={title} aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        {icon ? <><Icon name={icon} size={16} /><span className="cbar" style={{ background: shown || 'transparent', boxShadow: shown ? undefined : 'inset 0 0 0 1px #9ca3af' }} /></> : <span className="swin" style={{ background: shown || 'transparent' }}>{!shown && <Icon name="x" size={12} />}</span>}
        {wide && <span className="swlab">{shown || 'None'}</span>}
      </button>
      {open && (
        <div className={'panel colorpop' + (bar ? ' right' : '')} onMouseDown={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
          <ThemeColors th={th} onPick={(c) => { onPick(c); setOpen(false); }} current={value} />
          <ColorPanel onPick={(c) => { onPick(c); }} noneLabel={none} current={value} close={() => setOpen(false)} />
        </div>
      )}
    </span>
  );
}

/* ---------- layout thumbnails ---------- */
export function LayoutThumb({ layout, th }) {
  return (
    <svg viewBox="0 0 960 540" width="64" height="36" style={{ background: th.bg, borderRadius: 3, border: '1px solid #d1d5db' }}>
      {layout.ph.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx="14" fill={p.role === 'title' || p.role.startsWith('head') ? mixHex(th.text, th.bg, 0.55) : mixHex(th.text, th.bg, 0.8)} />
      ))}
    </svg>
  );
}

export function ThemeCard({ t, on, onPick }) {
  return (
    <button type="button" className={'themecard' + (on ? ' on' : '')} onClick={() => onPick(t)} title={t.name}>
      <span className="tcprev" style={{ background: t.bg, color: t.text, fontFamily: fontStack(t.head) }}>
        <b style={{ color: t.text }}>Aa</b>
        <span className="tcdots">{t.a.slice(0, 5).map((c) => <i key={c} style={{ background: c }} />)}</span>
      </span>
      <span className="tcname">{t.name}</span>
    </button>
  );
}

/* ---------- animations ---------- */
export const ANIMS = [['', 'None'], ['appear', 'Appear'], ['fade', 'Fade in'], ['fly', 'Fly in'], ['zoom', 'Zoom in'], ['wipe', 'Wipe'], ['spin', 'Spin in'], ['pulse', 'Pulse (emphasis)']];
export const TRANS = [['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide in'], ['push', 'Push'], ['cover', 'Cover'], ['zoom', 'Zoom'], ['flip', 'Flip'], ['dissolve', 'Dissolve']];

/* ---------- the format panel ---------- */
export function FormatPanel({ api, deck, slide, si, sel }) {
  const th = deck.theme;
  const tab = api.tab; const setTab = api.setTab;
  const one = sel.length === 1 ? sel[0] : null;
  const types = new Set(sel.map((e) => e.type));
  const hasText = sel.some((e) => e.type === 'text' || e.type === 'shape');
  const shapes = sel.filter((e) => e.type === 'text' || e.type === 'shape');
  const ids = sel.map((e) => e.id);
  const set = (patch, opts) => api.upd(ids, patch, opts);
  const setNested = (key, patch) => api.upd(ids, (e) => ({ [key]: { ...(e[key] || {}), ...patch } }));

  return (
    <aside className="sidepanel fp" aria-label="Format">
      <div className="fptabs" role="tablist">
        {[['slide', 'Slide'], ['format', 'Format'], ['theme', 'Design'], ['anim', 'Animate']].map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>
        ))}
        <button className="fpclose" aria-label="Close panel" onClick={api.closePanel}><Icon name="x" size={14} /></button>
      </div>
      <div className="fpscroll">
        {tab === 'slide' && <SlideTab api={api} deck={deck} slide={slide} si={si} />}
        {tab === 'theme' && <ThemeTab api={api} deck={deck} />}
        {tab === 'anim' && <AnimTab api={api} deck={deck} slide={slide} sel={sel} />}
        {tab === 'format' && (
          !sel.length ? <p className="fhint">Select an object on the slide to format it.</p> : (
            <>
              <Section title="Size and position">
                {one ? <>
                  <div className="grid2">
                    <Row label="X"><Num value={one.x} onChange={(v) => set({ x: v })} step={1} round={0.1} /></Row>
                    <Row label="Y"><Num value={one.y} onChange={(v) => set({ y: v })} step={1} round={0.1} /></Row>
                    <Row label="W"><Num value={one.w} min={one.type === 'line' ? 0 : 4} onChange={(v) => api.resizeTo(one, { w: v })} round={0.1} /></Row>
                    <Row label="H"><Num value={one.h} min={one.type === 'line' ? 0 : 4} onChange={(v) => api.resizeTo(one, { h: v })} round={0.1} /></Row>
                    <Row label="Rotate"><Num value={one.rot || 0} min={0} max={359} onChange={(v) => set({ rot: v })} suffix="°" /></Row>
                  </div>
                  {one.type === 'image' && <Check checked={api.lockRatio} onChange={api.setLockRatio} label="Lock aspect ratio" />}
                </> : <p className="fhint">{sel.length} objects selected</p>}
                <div className="btnrow">
                  <button className="btn sm" onClick={() => api.flip('h')}><Icon name="flipH" size={14} /> Flip H</button>
                  <button className="btn sm" onClick={() => api.flip('v')}><Icon name="flipV" size={14} /> Flip V</button>
                  <button className="btn sm" onClick={() => api.toggleLock()}><Icon name={sel.every((e) => e.locked) ? 'unlock' : 'lock'} size={14} /> {sel.every((e) => e.locked) ? 'Unlock' : 'Lock'}</button>
                </div>
              </Section>
              {hasText && <ShapeSection api={api} th={th} els={shapes} set={set} setNested={setNested} />}
              {hasText && <TextSection api={api} th={th} els={shapes} set={set} setNested={setNested} />}
              {types.has('line') && <LineSection api={api} th={th} els={sel.filter((e) => e.type === 'line')} set={set} setNested={setNested} />}
              {types.has('image') && <ImageSection api={api} th={th} els={sel.filter((e) => e.type === 'image')} set={set} setNested={setNested} />}
              {types.has('table') && one && one.type === 'table' && <TableSection api={api} th={th} el={one} />}
              {types.has('chart') && one && one.type === 'chart' && <ChartSection api={api} th={th} el={one} />}
              <Section title="Shadow and opacity" open={false}>
                <Row label="Opacity"><input type="range" min="5" max="100" value={Math.round((sel[0].opacity ?? 1) * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} /></Row>
                <Check checked={!!sel[0].shadow} onChange={(v) => set({ shadow: v ? { x: 4, y: 4, b: 8, o: 0.35, c: '#000000' } : null })} label="Drop shadow" />
                {sel[0].shadow && <div className="grid2">
                  <Row label="X"><Num value={sel[0].shadow.x} onChange={(v) => setNested('shadow', { x: v })} /></Row>
                  <Row label="Y"><Num value={sel[0].shadow.y} onChange={(v) => setNested('shadow', { y: v })} /></Row>
                  <Row label="Blur"><Num value={sel[0].shadow.b} min={0} onChange={(v) => setNested('shadow', { b: v })} /></Row>
                  <Row label="Alpha"><Num value={Math.round(sel[0].shadow.o * 100)} min={0} max={100} onChange={(v) => setNested('shadow', { o: v / 100 })} suffix="%" /></Row>
                </div>}
              </Section>
              <Section title="Link and alt text" open={false}>
                <Row label="Link" wide><span className="linkrow">{sel[0].link ? <span className="linkinfo">{sel[0].link.slide !== undefined ? 'Slide ' + (sel[0].link.slide + 1) : sel[0].link.url}</span> : <em className="muted">None</em>}<button className="btn sm" onClick={() => api.linkDialog('el')}>Edit…</button>{sel[0].link && <button className="btn sm ghost" onClick={() => set({ link: null })}>Remove</button>}</span></Row>
                <Row label="Alt text" wide><textarea rows={2} value={sel[0].alt || ''} onChange={(e) => set({ alt: e.target.value })} placeholder="Describe this object for screen readers" /></Row>
                <Row label="Name" wide><input type="text" value={sel[0].name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="Optional" /></Row>
              </Section>
            </>
          )
        )}
      </div>
    </aside>
  );
}

function ShapeSection({ api, th, els, set, setNested }) {
  const e = els[0]; const f = e.fill; const st = e.stroke;
  const isShape = els.every((x) => x.type === 'shape');
  return (
    <Section title="Fill and line">
      {isShape && (
        <Row label="Shape"><select value={e.shape} onChange={(ev) => set({ shape: ev.target.value })}>{SHAPE_ORDER.map((k) => <option key={k} value={k}>{SHAPES[k].label}</option>)}</select></Row>
      )}
      {e.shape === 'roundRect' && <Row label="Corners"><input type="range" min="0" max="50" value={Math.round((e.radius ?? 0.18) * 100)} onChange={(ev) => set({ radius: Number(ev.target.value) / 100 })} /></Row>}
      <Row label="Fill"><Seg value={!f ? 'none' : f.t} onChange={(v) => set({ fill: v === 'none' ? null : v === 'solid' ? { t: 'solid', c: f && f.c ? f.c : '@a1' } : { t: 'grad', c1: f && f.c ? f.c : '@a1', c2: '@a2', ang: 90 } })} options={[['none', 'None'], ['solid', 'Solid'], ['grad', 'Gradient']]} title="Fill type" /></Row>
      {f && f.t === 'solid' && <Row label="Colour"><ColorPick th={th} value={f.c} onPick={(c) => set({ fill: { t: 'solid', c } })} title="Fill colour" wide /></Row>}
      {f && f.t === 'grad' && <>
        <Row label="From"><ColorPick th={th} value={f.c1} onPick={(c) => set({ fill: { ...f, c1: c } })} title="Gradient start" wide /></Row>
        <Row label="To"><ColorPick th={th} value={f.c2} onPick={(c) => set({ fill: { ...f, c2: c } })} title="Gradient end" wide /></Row>
        <Row label="Angle"><Num value={f.ang ?? 90} min={0} max={360} onChange={(v) => set({ fill: { ...f, ang: v } })} suffix="°" /></Row>
      </>}
      <Row label="Line"><Seg value={st ? 'on' : 'none'} onChange={(v) => set({ stroke: v === 'none' ? null : { c: '@text', w: 2, dash: 'solid' } })} options={[['none', 'None'], ['on', 'Line']]} title="Outline" /></Row>
      {st && <>
        <Row label="Colour"><ColorPick th={th} value={st.c} onPick={(c) => setNested('stroke', { c })} title="Line colour" wide /></Row>
        <Row label="Width"><Num value={st.w} min={0.5} max={40} step={0.5} onChange={(v) => setNested('stroke', { w: v })} suffix="px" round={0.5} /></Row>
        <Row label="Style"><select value={st.dash || 'solid'} onChange={(ev) => setNested('stroke', { dash: ev.target.value })}><option value="solid">Solid</option><option value="dash">Dashed</option><option value="dot">Dotted</option><option value="dashdot">Dash-dot</option></select></Row>
      </>}
    </Section>
  );
}

function TextSection({ api, th, els, set, setNested }) {
  const e = els[0]; const tx = { f: '@body', sz: 24, c: '@text', al: 'left', va: 'top', pad: 8, ls: 1.15, ...(e.tx || {}) };
  const t = (patch) => api.setTx(patch);
  return (
    <Section title="Text">
      <Row label="Font"><select value={tx.f[0] === '@' ? tx.f : tx.f} onChange={(ev) => t({ f: ev.target.value })}>
        <option value="@head">Heading ({th.head})</option><option value="@body">Body ({th.body})</option>
        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</select></Row>
      <div className="grid2">
        <Row label="Size"><Num value={tx.sz} min={4} max={400} onChange={(v) => t({ sz: v })} /></Row>
        <Row label="Colour"><ColorPick th={th} value={tx.c} onPick={(c) => t({ c })} title="Text colour" /></Row>
      </div>
      <Row label="Style"><span className="btnrow tight">
        <button className={'tb' + (tx.b ? ' on' : '')} onClick={() => t({ b: !tx.b })} aria-label="Bold"><Icon name="bold" size={14} /></button>
        <button className={'tb' + (tx.i ? ' on' : '')} onClick={() => t({ i: !tx.i })} aria-label="Italic"><Icon name="italic" size={14} /></button>
        <button className={'tb' + (tx.caps ? ' on' : '')} onClick={() => t({ caps: !tx.caps })} aria-label="All caps" title="All caps"><b>AA</b></button>
      </span></Row>
      <Row label="Align"><Seg value={tx.al} onChange={(v) => t({ al: v })} options={[['left', 'Left', 'alignLeft'], ['center', 'Centre', 'alignCenter'], ['right', 'Right', 'alignRight'], ['just', 'Justify', 'justify']]} title="Alignment" /></Row>
      <Row label="Vertical"><Seg value={tx.va} onChange={(v) => t({ va: v })} options={[['top', 'Top', 'alignT'], ['mid', 'Middle', 'alignM'], ['bot', 'Bottom', 'alignB']]} title="Vertical alignment" /></Row>
      <div className="grid2">
        <Row label="Spacing"><Num value={tx.ls} min={0.8} max={3} step={0.05} round={0.01} onChange={(v) => t({ ls: v })} /></Row>
        <Row label="Padding"><Num value={tx.pad} min={0} max={100} onChange={(v) => t({ pad: v })} /></Row>
      </div>
      <Row label="Autofit"><Seg value={tx.fit || 'none'} onChange={(v) => t({ fit: v })} options={[['none', 'None'], ['shrink', 'Shrink on overflow']]} title="Autofit" /></Row>
    </Section>
  );
}

function LineSection({ th, els, set, setNested }) {
  const e = els[0]; const st = e.stroke || { c: '@text', w: 3, dash: 'solid' };
  const heads = [['none', 'None'], ['arrow', 'Arrow'], ['open', 'Open'], ['dot', 'Dot'], ['diamond', 'Diamond']];
  return (
    <Section title="Line">
      <Row label="Colour"><ColorPick th={th} value={st.c} onPick={(c) => setNested('stroke', { c })} title="Line colour" wide /></Row>
      <Row label="Width"><Num value={st.w} min={0.5} max={40} step={0.5} round={0.5} onChange={(v) => setNested('stroke', { w: v })} suffix="px" /></Row>
      <Row label="Style"><select value={st.dash || 'solid'} onChange={(ev) => setNested('stroke', { dash: ev.target.value })}><option value="solid">Solid</option><option value="dash">Dashed</option><option value="dot">Dotted</option><option value="dashdot">Dash-dot</option></select></Row>
      <Row label="Start"><select value={e.head || 'none'} onChange={(ev) => set({ head: ev.target.value })}>{heads.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
      <Row label="End"><select value={e.tail || 'none'} onChange={(ev) => set({ tail: ev.target.value })}>{heads.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
    </Section>
  );
}

function ImageSection({ api, th, els, set, setNested }) {
  const e = els[0]; const f = e.filter || {};
  return (
    <Section title="Image">
      <Row label="Fit"><Seg value={e.fit || 'fill'} onChange={(v) => set({ fit: v })} options={[['fill', 'Stretch'], ['contain', 'Fit'], ['cover', 'Fill']]} title="Image fit" /></Row>
      <Row label="Corners"><input type="range" min="0" max="50" value={Math.round((e.r || 0) * 100)} onChange={(ev) => set({ r: Number(ev.target.value) / 100 })} /></Row>
      <Row label="Border"><Seg value={e.stroke ? 'on' : 'none'} onChange={(v) => set({ stroke: v === 'none' ? null : { c: '@text', w: 3, dash: 'solid' } })} options={[['none', 'None'], ['on', 'Border']]} title="Border" /></Row>
      {e.stroke && <>
        <Row label="Colour"><ColorPick th={th} value={e.stroke.c} onPick={(c) => setNested('stroke', { c })} title="Border colour" wide /></Row>
        <Row label="Width"><Num value={e.stroke.w} min={1} max={30} onChange={(v) => setNested('stroke', { w: v })} suffix="px" /></Row>
      </>}
      <Row label="Brightness"><input type="range" min="40" max="180" value={f.bright ?? 100} onChange={(ev) => setNested('filter', { bright: Number(ev.target.value) })} /></Row>
      <Row label="Contrast"><input type="range" min="40" max="180" value={f.contrast ?? 100} onChange={(ev) => setNested('filter', { contrast: Number(ev.target.value) })} /></Row>
      <Row label="Grayscale"><input type="range" min="0" max="100" value={f.gray ?? 0} onChange={(ev) => setNested('filter', { gray: Number(ev.target.value) })} /></Row>
      <div className="btnrow">
        <button className="btn sm" onClick={api.replaceImage}><Icon name="image" size={14} /> Replace…</button>
        <button className="btn sm" onClick={api.resetImageSize}>Original size</button>
        <button className="btn sm ghost" onClick={() => set({ filter: null })}>Reset</button>
      </div>
    </Section>
  );
}

function TableSection({ api, th, el }) {
  const ac = api.tcell && api.tcell.id === el.id ? api.tcell : null;
  const cell = ac && el.cells[ac.r] ? el.cells[ac.r][ac.c] || {} : {};
  const scope = api.tscope;
  return (
    <Section title="Table">
      <div className="btnrow">
        <button className="btn sm" onClick={() => api.tableOp('addRow')}>+ Row</button>
        <button className="btn sm" onClick={() => api.tableOp('addRowAbove')}>+ Row above</button>
        <button className="btn sm" onClick={() => api.tableOp('delRow')}>− Row</button>
        <button className="btn sm" onClick={() => api.tableOp('addCol')}>+ Column</button>
        <button className="btn sm" onClick={() => api.tableOp('addColLeft')}>+ Col left</button>
        <button className="btn sm" onClick={() => api.tableOp('delCol')}>− Column</button>
      </div>
      <Check checked={el.hdr} onChange={(v) => api.upd([el.id], { hdr: v })} label="Header row" />
      <Check checked={el.band} onChange={(v) => api.upd([el.id], { band: v })} label="Banded rows" />
      <Row label="Header colour"><ColorPick th={th} value={el.tstyle || '@a1'} onPick={(c) => api.upd([el.id], { tstyle: c })} title="Header colour" wide /></Row>
      <Row label="Text size"><Num value={(el.tx && el.tx.sz) || 18} min={6} max={80} onChange={(v) => api.upd([el.id], (e) => ({ tx: { ...e.tx, sz: v } }))} /></Row>
      <Row label="Borders"><span className="btnrow tight"><Num value={(el.border && el.border.w) ?? 1} min={0} max={8} onChange={(v) => api.upd([el.id], (e) => ({ border: { ...(e.border || { c: '#d1d5db' }), w: v } }))} suffix="px" width={48} /><ColorPick th={th} value={(el.border && el.border.c) || '#d1d5db'} onPick={(c) => api.upd([el.id], (e) => ({ border: { ...(e.border || { w: 1 }), c } }))} title="Border colour" /></span></Row>
      <div className="fsub">Cell formatting {ac ? <em>(row {ac.r + 1}, col {ac.c + 1})</em> : <em>(click a cell first)</em>}</div>
      <Row label="Apply to"><Seg value={scope} onChange={api.setTscope} options={[['cell', 'Cell'], ['row', 'Row'], ['col', 'Column'], ['all', 'All']]} title="Scope" /></Row>
      <Row label="Fill"><ColorPick th={th} value={cell.bg} onPick={(c) => api.cellFmt({ bg: c })} none="Default" title="Cell fill" /></Row>
      <Row label="Text"><ColorPick th={th} value={cell.c} onPick={(c) => api.cellFmt({ c })} none="Default" title="Cell text colour" /></Row>
      <Row label="Style"><span className="btnrow tight">
        <button className={'tb' + (cell.b ? ' on' : '')} onClick={() => api.cellFmt({ b: !cell.b })}><Icon name="bold" size={14} /></button>
        <button className={'tb' + (cell.i ? ' on' : '')} onClick={() => api.cellFmt({ i: !cell.i })}><Icon name="italic" size={14} /></button>
      </span></Row>
      <Row label="Align"><Seg value={cell.al || 'left'} onChange={(v) => api.cellFmt({ al: v })} options={[['left', 'L', 'alignLeft'], ['center', 'C', 'alignCenter'], ['right', 'R', 'alignRight']]} title="Cell alignment" /></Row>
    </Section>
  );
}

function ChartSection({ api, th, el }) {
  const c = el.chart; const setC = (p) => api.upd([el.id], (e) => ({ chart: { ...e.chart, ...p } }));
  return (
    <Section title="Chart">
      <Row label="Type"><select value={c.type} onChange={(e) => setC({ type: e.target.value })}>{CHART_TYPES.filter(([k]) => k !== 'scatter' && k !== 'combo').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>
      <Row label="Title"><input type="text" value={c.title || ''} onChange={(e) => setC({ title: e.target.value })} /></Row>
      <Row label="Legend"><select value={c.legend || 'none'} onChange={(e) => setC({ legend: e.target.value })}>{['none', 'bottom', 'right', 'top', 'left'].map((v) => <option key={v} value={v}>{v}</option>)}</select></Row>
      <Check checked={c.labels} onChange={(v) => setC({ labels: v })} label="Data labels" />
      <Check checked={c.stacked} onChange={(v) => setC({ stacked: v })} label="Stacked" />
      <Check checked={c.smooth} onChange={(v) => setC({ smooth: v })} label="Smooth lines" />
      <Row label="X title"><input type="text" value={c.xTitle || ''} onChange={(e) => setC({ xTitle: e.target.value })} /></Row>
      <Row label="Y title"><input type="text" value={c.yTitle || ''} onChange={(e) => setC({ yTitle: e.target.value })} /></Row>
      <div className="fsub">Series colours</div>
      <div className="swrow">{el.data.series.map((s, i) => <ColorPick key={i} th={th} value={(c.colors || [])[i] || '@a' + ((i % 6) + 1)} onPick={(col) => { const cs = [...(c.colors || [])]; cs[i] = col; setC({ colors: cs }); }} title={`Series ${i + 1}: ${s.name}`} />)}</div>
      <div className="btnrow"><button className="btn sm primary" onClick={() => api.editChart(el.id)}><Icon name="table" size={14} /> Edit data…</button></div>
    </Section>
  );
}

/* ---------- slide tab ---------- */
function SlideTab({ api, deck, slide, si }) {
  const th = deck.theme; const bg = slide.bg;
  const bt = !bg ? 'theme' : bg.type;
  return (
    <>
      <Section title="Layout">
        <div className="layoutgrid">
          {LAYOUTS.map((l) => (
            <button key={l.id} type="button" className={'layoutbtn' + (slide.layout === l.id ? ' on' : '')} onClick={() => api.applyLayout(l.id)} title={l.name}>
              <LayoutThumb layout={l} th={th} /><span>{l.name}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Background">
        <Row label="Fill"><Seg value={bt} onChange={(v) => api.setBg(v === 'theme' ? null : v === 'solid' ? { type: 'solid', color: rc('@panel', th) } : v === 'grad' ? { type: 'grad', c1: '@a1', c2: '@a2', ang: 135 } : api.pickBgImage)} options={[['theme', 'Theme'], ['solid', 'Solid'], ['grad', 'Gradient'], ['image', 'Image']]} title="Background type" /></Row>
        {bg && bg.type === 'solid' && <Row label="Colour"><ColorPick th={th} value={bg.color} onPick={(c) => api.setBg({ type: 'solid', color: c })} title="Background colour" wide /></Row>}
        {bg && bg.type === 'grad' && <>
          <Row label="From"><ColorPick th={th} value={bg.c1} onPick={(c) => api.setBg({ ...bg, c1: c })} title="From" wide /></Row>
          <Row label="To"><ColorPick th={th} value={bg.c2} onPick={(c) => api.setBg({ ...bg, c2: c })} title="To" wide /></Row>
          <Row label="Angle"><Num value={bg.ang} min={0} max={360} onChange={(v) => api.setBg({ ...bg, ang: v })} suffix="°" /></Row>
        </>}
        {bg && bg.type === 'image' && <div className="btnrow"><button className="btn sm" onClick={api.pickBgImage}>Change image…</button></div>}
        <div className="btnrow"><button className="btn sm" onClick={() => api.setBg(bg, true)}>Apply to all slides</button></div>
      </Section>
      <Section title="Transition">
        <Row label="Effect"><select value={slide.trans ? slide.trans.type : 'none'} onChange={(e) => api.setTrans({ type: e.target.value })}>{TRANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        <Row label="Duration"><Num value={slide.trans ? slide.trans.dur : 0.5} min={0.1} max={5} step={0.1} round={0.1} onChange={(v) => api.setTrans({ dur: v })} suffix="s" /></Row>
        <Row label="Auto-advance"><Num value={slide.trans && slide.trans.after ? slide.trans.after : 0} min={0} max={600} onChange={(v) => api.setTrans({ after: v })} suffix="s" /></Row>
        <div className="btnrow"><button className="btn sm" onClick={() => api.setTrans({}, true)}>Apply to all slides</button></div>
      </Section>
      <Section title="This slide" open={false}>
        <Check checked={slide.hidden} onChange={(v) => api.setSlide({ hidden: v })} label="Skip slide in presentation" />
        <Row label="Slide number" wide><span className="muted">{si + 1} of {deck.slides.length}</span></Row>
      </Section>
    </>
  );
}

/* ---------- design / theme tab ---------- */
function ThemeTab({ api, deck }) {
  const th = deck.theme;
  const setTh = (p) => api.setTheme({ ...th, id: 'custom', name: 'Custom', ...p });
  return (
    <>
      <Section title="Themes">
        <div className="themegrid">{THEMES.map((t) => <ThemeCard key={t.id} t={t} on={th.id === t.id} onPick={api.setTheme} />)}</div>
      </Section>
      <Section title="Customise theme">
        <Row label="Heading font"><select value={th.head} onChange={(e) => setTh({ head: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Row>
        <Row label="Body font"><select value={th.body} onChange={(e) => setTh({ body: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Row>
        <Row label="Background"><ColorPick th={th} value={th.bg} onPick={(c) => setTh({ bg: c, panel: mixHex(c, th.text, 0.08) })} title="Background" wide /></Row>
        <Row label="Text"><ColorPick th={th} value={th.text} onPick={(c) => setTh({ text: c })} title="Text" wide /></Row>
        <Row label="Muted text"><ColorPick th={th} value={th.muted} onPick={(c) => setTh({ muted: c })} title="Muted" wide /></Row>
        <div className="fsub">Accent colours</div>
        <div className="swrow">{th.a.map((c, i) => <ColorPick key={i} th={th} value={c} onPick={(col) => setTh({ a: th.a.map((x, j) => (j === i ? col : x)) })} title={`Accent ${i + 1}`} />)}</div>
        <Row label="Decoration"><select value={th.deco || 'none'} onChange={(e) => setTh({ deco: e.target.value })}>{[['none', 'None'], ['bar', 'Side bar'], ['band', 'Bottom band'], ['corner', 'Corner'], ['frame', 'Frame']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
      </Section>
      <Section title="Footer">
        <Check checked={deck.footer && deck.footer.num} onChange={(v) => api.setFooter({ num: v })} label="Slide numbers" />
        <Row label="Footer text" wide><input type="text" value={(deck.footer && deck.footer.text) || ''} onChange={(e) => api.setFooter({ text: e.target.value })} placeholder="e.g. Company name" /></Row>
        <Check checked={deck.footer && deck.footer.skipTitle} onChange={(v) => api.setFooter({ skipTitle: v })} label="Hide on first slide" />
      </Section>
    </>
  );
}

/* ---------- animate tab ---------- */
function AnimTab({ api, deck, slide, sel }) {
  const one = sel.length === 1 ? sel[0] : null;
  const a = one && one.anim ? one.anim : null;
  const animated = slide.els.filter((e) => e.anim).sort((x, y) => (x.anim.n ?? 0) - (y.anim.n ?? 0));
  const label = (e) => e.name || (e.type === 'text' || e.type === 'shape' ? plain(e.paras).slice(0, 24) || e.prompt || e.type : e.type);
  return (
    <>
      <Section title="Animation for selected object">
        {!one ? <p className="fhint">Select one object to add an animation.</p> : <>
          <Row label="Effect"><select value={a ? a.type : ''} onChange={(e) => api.setAnim(one.id, e.target.value ? { ...(a || { dir: 'up', trigger: 'click', dur: 0.5, delay: 0 }), type: e.target.value } : null)}>{ANIMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
          {a && <>
            {(a.type === 'fly' || a.type === 'wipe') && <Row label="Direction"><select value={a.dir || 'up'} onChange={(e) => api.setAnim(one.id, { ...a, dir: e.target.value })}>{[['up', 'From bottom'], ['down', 'From top'], ['left', 'From right'], ['right', 'From left']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>}
            <Row label="Start"><select value={a.trigger} onChange={(e) => api.setAnim(one.id, { ...a, trigger: e.target.value })}><option value="click">On click</option><option value="with">With previous</option><option value="after">After previous</option></select></Row>
            <Row label="Duration"><Num value={a.dur} min={0.1} max={10} step={0.1} round={0.1} onChange={(v) => api.setAnim(one.id, { ...a, dur: v })} suffix="s" /></Row>
            <Row label="Delay"><Num value={a.delay || 0} min={0} max={20} step={0.1} round={0.1} onChange={(v) => api.setAnim(one.id, { ...a, delay: v })} suffix="s" /></Row>
          </>}
        </>}
      </Section>
      <Section title="Animation order">
        {!animated.length && <p className="fhint">No animations on this slide.</p>}
        <ol className="animlist">
          {animated.map((e, i) => (
            <li key={e.id} className={sel.some((s) => s.id === e.id) ? 'on' : ''}>
              <button className="animname" onClick={() => api.selectIds([e.id])}>{i + 1}. {label(e)}<small>{ANIMS.find((x) => x[0] === e.anim.type)?.[1]} · {e.anim.trigger === 'click' ? 'click' : e.anim.trigger === 'with' ? 'with prev' : 'after prev'}</small></button>
              <button className="tb" aria-label="Earlier" disabled={i === 0} onClick={() => api.moveAnim(e.id, -1)}><Icon name="arrowUp" size={13} /></button>
              <button className="tb" aria-label="Later" disabled={i === animated.length - 1} onClick={() => api.moveAnim(e.id, 1)}><Icon name="arrowDown" size={13} /></button>
            </li>
          ))}
        </ol>
        {animated.length > 0 && <div className="btnrow"><button className="btn sm" onClick={api.previewAnims}>▶ Preview slide</button></div>}
      </Section>
    </>
  );
}

/* ---------- shapes gallery (insert menu panel) ---------- */
export function ShapeGallery({ onPick, th }) {
  return (
    <div className="shapegal">
      <div className="gallab">Lines and arrows</div>
      <div className="galrow">
        {[['line', 'Line'], ['arrow', 'Arrow'], ['darrow', 'Double arrow']].map(([k, l]) => (
          <button key={k} className="galbtn" title={l} aria-label={l} onClick={() => onPick({ kind: k })}>
            <svg viewBox="0 0 28 28" width="26" height="26"><path d="M4,22 L24,6" stroke="currentColor" strokeWidth="2" fill="none" />{(k === 'arrow' || k === 'darrow') && <path d="M24,6 l-6,1.5 l4,4.5z" fill="currentColor" />}{k === 'darrow' && <path d="M4,22 l6,-1.5 l-4,-4.5z" fill="currentColor" />}</svg>
          </button>
        ))}
      </div>
      <div className="gallab">Shapes</div>
      <div className="galrow wrap">
        {SHAPE_ORDER.map((k) => (
          <button key={k} className="galbtn" title={SHAPES[k].label} aria-label={SHAPES[k].label} onClick={() => onPick({ kind: 'shape', shape: k })}>
            <svg viewBox="0 0 28 28" width="26" height="26"><path d={shapeD(k, 22, 18)} transform="translate(3,5)" fill="none" stroke="currentColor" strokeWidth="1.6" fillRule="evenodd" /></svg>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- chart data editor dialog ---------- */
export function ChartEditor({ el, th, close }) {
  const [chart, setChart] = useState(el.chart);
  const [cats, setCats] = useState(el.data.cats.map(String));
  const [series, setSeries] = useState(el.data.series.map((s) => ({ name: s.name, values: s.values.map((v) => (v === null || v === undefined ? '' : String(v))) })));
  const toNum = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isNaN(n) ? null : n; };
  const data = useMemo(() => ({ cats, series: series.map((s) => ({ name: s.name, values: s.values.map(toNum) })), xNumeric: false }), [cats, series]);
  const prev = useMemo(() => chartFor({ ...el, chart }, th), [chart, th, el]);
  const setCell = (r, c, v) => { if (c === -1) setCats((a) => a.map((x, i) => (i === r ? v : x))); else setSeries((ss) => ss.map((s, i) => (i === c ? { ...s, values: s.values.map((x, j) => (j === r ? v : x)) } : s))); };
  const onPaste = (e, r0, c0) => {
    const t = (e.clipboardData || window.clipboardData).getData('text/plain'); if (!t.includes('\t') && !t.includes('\n')) return;
    e.preventDefault();
    const rows = t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const nR = Math.max(cats.length, r0 + rows.length); const nC = Math.max(series.length, c0 + Math.max(...rows.map((r) => r.length)));
    const C = Array.from({ length: nR }, (_, i) => cats[i] ?? ''); const S = Array.from({ length: Math.max(nC, 1) }, (_, j) => ({ name: series[j] ? series[j].name : `Series ${j + 1}`, values: Array.from({ length: nR }, (_, i) => (series[j] ? series[j].values[i] ?? '' : '')) }));
    rows.forEach((row, i) => row.forEach((v, j) => { const cc = c0 + j; const rr = r0 + i; if (cc === -1) C[rr] = v; else if (S[cc]) S[cc].values[rr] = v; }));
    setCats(C); setSeries(S);
  };
  return (
    <div className="chartedit">
      <div className="ce-left">
        <div className="ce-opts">
          <label>Type <select value={chart.type} onChange={(e) => setChart({ ...chart, type: e.target.value })}>{CHART_TYPES.filter(([k]) => k !== 'scatter' && k !== 'combo').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Title <input type="text" value={chart.title || ''} onChange={(e) => setChart({ ...chart, title: e.target.value })} /></label>
        </div>
        <div className="ce-grid"><table>
          <thead><tr><th></th><th>Category</th>{series.map((s, j) => (
            <th key={j}><input className="ce-name" value={s.name} onChange={(e) => setSeries((ss) => ss.map((x, i) => (i === j ? { ...x, name: e.target.value } : x)))} onPaste={(e) => onPaste(e, 0, j)} aria-label={`Series ${j + 1} name`} />{series.length > 1 && <button className="ce-x" title="Remove series" aria-label="Remove series" onClick={() => setSeries((ss) => ss.filter((_, i) => i !== j))}>×</button>}</th>
          ))}<th><button className="btn sm" onClick={() => setSeries((ss) => [...ss, { name: `Series ${ss.length + 1}`, values: cats.map(() => '') }])}>+ Series</button></th></tr></thead>
          <tbody>{cats.map((c, r) => (
            <tr key={r}>
              <td className="ce-n">{r + 1}</td>
              <td><input value={c} onChange={(e) => setCell(r, -1, e.target.value)} onPaste={(e) => onPaste(e, r, -1)} aria-label={`Category ${r + 1}`} /></td>
              {series.map((s, j) => <td key={j}><input value={s.values[r]} inputMode="decimal" onChange={(e) => setCell(r, j, e.target.value)} onPaste={(e) => onPaste(e, r, j)} aria-label={`${s.name} ${c}`} /></td>)}
              <td><button className="ce-x" title="Remove row" aria-label="Remove row" onClick={() => { setCats((a) => a.filter((_, i) => i !== r)); setSeries((ss) => ss.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== r) }))); }}>×</button></td>
            </tr>
          ))}</tbody>
        </table>
          <button className="btn sm" onClick={() => { setCats((a) => [...a, `Item ${a.length + 1}`]); setSeries((ss) => ss.map((s) => ({ ...s, values: [...s.values, ''] }))); }}>+ Row</button>
          <p className="muted small">Tip: paste a block copied from Sheets or Excel into any cell.</p>
        </div>
      </div>
      <div className="ce-prev"><Chart chart={{ ...prev, bg: th.bg }} data={data} width={360} height={260} /></div>
      <div className="modal-foot ce-foot">
        <button className="btn ghost" onClick={() => close(null)}>Cancel</button>
        <button className="btn primary" onClick={() => close({ chart, data: { cats, series: data.series } })}>Apply</button>
      </div>
    </div>
  );
}

export { isDark };
