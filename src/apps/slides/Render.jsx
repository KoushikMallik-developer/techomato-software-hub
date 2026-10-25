import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Chart from '../sheets/Chart.jsx';
import { SW, SH, rc, rf, fontStack, shapeD, textBase, parasToHtml, htmlToParas, isEmptyParas, decoShapes, slideBg, bgCss, mixHex, isDark } from './model.js';

const dashArray = (d, w) => (d === 'dash' ? `${w * 4},${w * 2.5}` : d === 'dot' ? `${w},${w * 2}` : d === 'dashdot' ? `${w * 4},${w * 2},${w},${w * 2}` : undefined);

/* gradient definition for fills */
function GradDef({ id, f, th }) {
  const a = ((f.ang ?? 90) - 90) * (Math.PI / 180);
  const x = Math.cos(a) / 2; const y = Math.sin(a) / 2;
  return (
    <linearGradient id={id} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
      <stop offset="0" stopColor={rc(f.c1, th)} /><stop offset="1" stopColor={rc(f.c2, th)} />
    </linearGradient>
  );
}
const fillAttr = (f, id, th) => (!f ? 'none' : f.t === 'grad' ? `url(#${id})` : rc(f.c, th));

/* ---------- geometry body (shape / line) ---------- */
function ShapeSvg({ el, th }) {
  const { w, h } = el; const st = el.stroke; const sw = st ? st.w : 0;
  const gid = 'g' + el.id;
  const flip = `${el.flipH ? 'scaleX(-1) ' : ''}${el.flipV ? 'scaleY(-1)' : ''}`.trim();
  const shadow = el.shadow ? `drop-shadow(${el.shadow.x ?? 4}px ${el.shadow.y ?? 4}px ${el.shadow.b ?? 8}px ${rgba(rc(el.shadow.c || '#000000', th), el.shadow.o ?? 0.35)})` : undefined;
  return (
    <svg className="shsvg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', transform: flip || undefined, filter: shadow }}>
      {el.fill && el.fill.t === 'grad' && <defs><GradDef id={gid} f={el.fill} th={th} /></defs>}
      <path d={shapeD(el.shape || 'rect', w, h, el.radius)} fill={fillAttr(el.fill, gid, th)} fillRule="evenodd" stroke={st ? rc(st.c, th) : 'none'} strokeWidth={sw} strokeDasharray={st ? dashArray(st.dash, sw) : undefined} strokeLinejoin="round" />
    </svg>
  );
}
function rgba(hex, o) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
  const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${o})`;
}

function Head({ kind, x, y, ang, size, color }) {
  if (!kind || kind === 'none') return null;
  const t = `translate(${x},${y}) rotate(${(ang * 180) / Math.PI})`;
  if (kind === 'arrow') return <path transform={t} d={`M0,0 L${-size * 1.6},${-size * 0.8} L${-size * 1.6},${size * 0.8}Z`} fill={color} />;
  if (kind === 'open') return <path transform={t} d={`M${-size * 1.5},${-size * 0.9} L0,0 L${-size * 1.5},${size * 0.9}`} fill="none" stroke={color} strokeWidth={size * 0.5} strokeLinecap="round" strokeLinejoin="round" />;
  if (kind === 'dot') return <circle transform={t} cx={-size * 0.5} cy={0} r={size * 0.6} fill={color} />;
  if (kind === 'diamond') return <path transform={t} d={`M0,0 L${-size},${-size * 0.7} L${-size * 2},0 L${-size},${size * 0.7}Z`} fill={color} />;
  return null;
}
function LineSvg({ el, th }) {
  const w = Math.max(el.w, 0.01); const h = Math.max(el.h, 0.01); const st = el.stroke || { c: '@text', w: 3 };
  const x1 = el.flipH ? w : 0; const x2 = el.flipH ? 0 : w; const y1 = el.flipV ? h : 0; const y2 = el.flipV ? 0 : h;
  const ang = Math.atan2(y2 - y1, x2 - x1); const col = rc(st.c, th); const sz = Math.max(4, st.w * 2.2);
  const pad = 20;
  return (
    <svg width={w + pad * 2} height={h + pad * 2} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} style={{ position: 'absolute', left: -pad, top: -pad, overflow: 'visible', pointerEvents: 'none' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={st.w} strokeDasharray={dashArray(st.dash, st.w)} strokeLinecap="round" />
      <Head kind={el.head} x={x1} y={y1} ang={ang + Math.PI} size={sz} color={col} />
      <Head kind={el.tail} x={x2} y={y2} ang={ang} size={sz} color={col} />
    </svg>
  );
}

/* ---------- text ---------- */
function useShrink(ref, enabled, deps) {
  useLayoutEffect(() => {
    const n = ref.current; if (!n) return;
    n.style.zoom = '';
    if (!enabled) return;
    const box = n.parentElement; if (!box) return;
    const avail = box.clientHeight - (parseFloat(getComputedStyle(box).paddingTop) || 0) - (parseFloat(getComputedStyle(box).paddingBottom) || 0);
    const need = n.scrollHeight;
    if (avail > 0 && need > avail + 1) n.style.zoom = String(Math.max(0.35, Math.floor((avail / need) * 100) / 100));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
const VA = { top: 'flex-start', mid: 'center', bot: 'flex-end' };
function textBoxStyle(el, th) {
  const b = textBase(el);
  return {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: VA[b.va] || 'flex-start', boxSizing: 'border-box', padding: b.pad,
    fontFamily: fontStack(rf(b.f, th)), fontSize: b.sz, color: rc(b.c, th), fontWeight: b.b ? 700 : 400, fontStyle: b.i ? 'italic' : 'normal', textAlign: b.al === 'just' ? 'justify' : b.al, lineHeight: b.ls,
    letterSpacing: b.sp ? `${b.sp}px` : undefined, textTransform: b.caps ? 'uppercase' : undefined, wordBreak: 'break-word', overflowWrap: 'anywhere',
  };
}
function TextBody({ el, th, mode, editing, onCommit, onCancel, editorRef }) {
  const base = textBase(el);
  const html = useMemo(() => parasToHtml(el.paras, th, base), [el.paras, th, el.tx]); // eslint-disable-line react-hooks/exhaustive-deps
  const inner = useRef(null);
  useShrink(inner, base.fit === 'shrink' && !editing, [html, el.w, el.h, base.sz, base.pad, editing]);
  const empty = isEmptyParas(el.paras);
  if (editing) return <EditableText el={el} th={th} html={html} base={base} onCommit={onCommit} onCancel={onCancel} editorRef={editorRef} />;
  if (empty && mode === 'present') return null;
  if (empty && mode === 'edit' && el.prompt) return <div style={textBoxStyle(el, th)}><div className="phprompt" style={{ opacity: 0.45 }}>{el.prompt}</div></div>;
  if (empty) return null;
  return (
    <div style={textBoxStyle(el, th)}>
      <div ref={inner} className="stext" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function EditableText({ el, th, html, base, onCommit, onCancel, editorRef }) {
  const ref = useRef(null);
  const done = useRef(false);
  const finishRef = useRef(null);
  useLayoutEffect(() => {
    const n = ref.current; if (!n) return;
    n.innerHTML = html;
    n.focus();
    const sel = window.getSelection(); const r = document.createRange();
    r.selectNodeContents(n); sel.removeAllRanges(); sel.addRange(r);
    try { document.execCommand('styleWithCSS', false, true); } catch { /* ignore */ }
    n.__commit = () => finishRef.current(false);
    if (editorRef) editorRef.current = n;
    return () => { if (editorRef && editorRef.current === n) editorRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = (cancel) => {
    if (done.current) return; done.current = true;
    const n = ref.current;
    if (cancel || !n) { onCancel && onCancel(); return; }
    onCommit(htmlToParas(n, th, base), Math.ceil(n.scrollHeight + (base.pad || 0) * 2));
  };
  finishRef.current = finish;
  return (
    <div style={textBoxStyle(el, th)}>
      <div
        ref={ref} className="stext editing" contentEditable suppressContentEditableWarning spellCheck
        onBlur={(e) => { const to = e.relatedTarget; if (to && to.closest && to.closest('[data-keepedit], .modal')) return; finish(false); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
          if (e.key === 'Tab') { e.preventDefault(); changeLevel(ref.current, e.shiftKey ? -1 : 1); }
        }}
        onPaste={(e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ outline: 'none', minHeight: '1em', width: '100%' }}
        data-finish={0}
      />
    </div>
  );
}
export function paragraphsInSelection(root) {
  const sel = window.getSelection(); if (!root || !sel.rangeCount) return [];
  const rg = sel.getRangeAt(0); const out = [];
  for (const d of Array.from(root.children)) { if (rg.intersectsNode(d)) out.push(d); }
  if (!out.length && root.firstElementChild) out.push(root.firstElementChild);
  return out;
}
export function changeLevel(root, dir) {
  paragraphsInSelection(root).forEach((d) => {
    const l = Math.max(0, Math.min(5, (Number(d.dataset.lvl) || 0) + dir)); d.dataset.lvl = String(l);
    d.style.paddingLeft = d.dataset.bul || l ? `${(l + (d.dataset.bul ? 1 : 0)) * 0.9}em` : '';
  });
}

/* ---------- table ---------- */
function TableBody({ el, th, editCell, onCellCommit, onCellDone }) {
  const base = textBase(el); const cols = el.colW || []; const total = el.w;
  const hdrC = rc(el.tstyle || '@a1', th); const panel = rc('@panel', th);
  const B = el.border || { c: '#d1d5db', w: 1 };
  return (
    <table className="stable" style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: fontStack(rf(base.f, th)), fontSize: base.sz, color: rc(base.c, th) }}>
      <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c * total }} />)}</colgroup>
      <tbody>
        {el.cells.map((row, r) => (
          <tr key={r} style={{ height: el.rowH && el.rowH[r] }}>
            {row.map((cell, c) => {
              const isH = el.hdr && r === 0;
              const bg = cell.bg ? rc(cell.bg, th) : isH ? hdrC : el.band && ((el.hdr ? r : r + 1) % 2 === 0) ? panel : 'transparent';
              const col = cell.c ? rc(cell.c, th) : isH ? (isDark(hdrC) ? '#ffffff' : '#111111') : undefined;
              const editing = editCell && editCell.r === r && editCell.c === c;
              return (
                <td key={c} data-r={r} data-c={c}
                  style={{ background: bg, color: col, fontWeight: cell.b ?? isH ? 700 : 400, fontStyle: cell.i ? 'italic' : 'normal', textAlign: cell.al || 'left', verticalAlign: cell.va || 'middle', border: B.w ? `${B.w}px solid ${rc(B.c, th)}` : 'none', padding: '4px 8px', overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word', outline: editing ? '2px solid #2563eb' : undefined, outlineOffset: -2 }}>
                  {editing ? <CellEditor text={cell.t} onCommit={onCellCommit} onDone={onCellDone} /> : cell.t}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function CellEditor({ text, onCommit, onDone }) {
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => { const n = ref.current; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, []);
  const end = (cancel, dir) => { if (done.current) return; done.current = true; const v = ref.current ? ref.current.value : text; if (!cancel) onCommit(v); onDone(cancel, dir); };
  return (
    <textarea ref={ref} defaultValue={text} className="cellta" data-keepedit
      onBlur={() => end(false)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); end(true); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); end(false); } else if (e.key === 'Tab') { e.preventDefault(); end(false, e.shiftKey ? -1 : 1); } }} />
  );
}

/* ---------- chart ---------- */
export function chartFor(el, th) {
  const c = el.chart || {};
  return { ...c, colors: (c.colors || []).map((x) => rc(x, th)), ink: rc('@text', th), soft: rc('@muted', th), grid: mixHex(th.text, th.bg, 0.82), bg: null, font: fontStack(th.body) };
}
function ChartBody({ el, th }) {
  const chart = useMemo(() => chartFor(el, th), [el.chart, th]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useMemo(() => ({ cats: el.data.cats, series: el.data.series.map((s) => ({ ...s, values: s.values.map((v) => (v === '' || v === undefined ? null : v)) })), xNumeric: false }), [el.data]);
  return <Chart chart={chart} data={data} width={el.w} height={el.h} />;
}

/* ---------- element ---------- */
function ElementView({ el, th, mode, editing, editCell, onTextCommit, onTextCancel, onCellCommit, onCellDone, editorRef, onDoubleClick, anim }) {
  const common = {
    position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.type === 'line' ? Math.max(el.h, 0) : el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
    opacity: el.opacity === undefined ? undefined : el.opacity, boxSizing: 'border-box',
    ...(anim ? { '--ad': `${anim.dur || 0.5}s`, '--adl': `${anim.delay || 0}s` } : {}),
  };
  const link = el.link;
  let body = null;
  if (el.type === 'text' || el.type === 'shape') {
    const shadowOnText = el.type === 'text' && !el.fill && !el.stroke && el.shadow;
    body = (
      <>
        {(el.fill || el.stroke || el.type === 'shape') && <ShapeSvg el={el} th={th} />}
        <div style={shadowOnText ? { position: 'absolute', inset: 0, filter: `drop-shadow(${el.shadow.x ?? 3}px ${el.shadow.y ?? 3}px ${el.shadow.b ?? 4}px ${rgba(rc(el.shadow.c || '#000000', th), el.shadow.o ?? 0.4)})` } : { position: 'absolute', inset: 0 }}>
          <TextBody el={el} th={th} mode={mode} editing={editing} onCommit={onTextCommit} onCancel={onTextCancel} editorRef={editorRef} />
        </div>
      </>
    );
  } else if (el.type === 'line') body = <LineSvg el={el} th={th} />;
  else if (el.type === 'image') {
    const f = el.filter || {};
    const css = [f.bright !== undefined && f.bright !== 100 ? `brightness(${f.bright}%)` : '', f.contrast !== undefined && f.contrast !== 100 ? `contrast(${f.contrast}%)` : '', f.gray ? `grayscale(${f.gray}%)` : '', el.shadow ? `drop-shadow(${el.shadow.x ?? 4}px ${el.shadow.y ?? 4}px ${el.shadow.b ?? 8}px ${rgba('#000000', el.shadow.o ?? 0.35)})` : ''].filter(Boolean).join(' ');
    body = (
      <div style={{ position: 'absolute', inset: 0, borderRadius: el.r ? Math.min(el.w, el.h) * el.r : 0, overflow: 'hidden', border: el.stroke ? `${el.stroke.w}px ${el.stroke.dash === 'dash' ? 'dashed' : el.stroke.dash === 'dot' ? 'dotted' : 'solid'} ${rc(el.stroke.c, th)}` : undefined, boxSizing: 'border-box', filter: css || undefined }}>
        <img src={el.src} alt={el.alt || ''} draggable={false} style={{ width: '100%', height: '100%', objectFit: el.fit === 'fill' ? 'fill' : el.fit || 'fill', display: 'block', transform: `${el.flipH ? 'scaleX(-1) ' : ''}${el.flipV ? 'scaleY(-1)' : ''}` || undefined, pointerEvents: 'none' }} />
      </div>
    );
  } else if (el.type === 'table') body = <TableBody el={el} th={th} editCell={editCell} onCellCommit={onCellCommit} onCellDone={onCellDone} />;
  else if (el.type === 'chart') body = <ChartBody el={el} th={th} />;
  return (
    <div className={'el' + (anim ? ` an an-${anim.type} ad-${anim.dir || 'up'}` : '')} data-id={el.id} data-type={el.type} data-gid={el.gid || undefined} style={common} onDoubleClick={onDoubleClick}
      data-link={link ? (link.slide !== undefined ? 'slide:' + link.slide : link.url) : undefined} aria-label={el.alt || undefined}>
      {body}
    </div>
  );
}
const MemoElement = memo(ElementView);
export { MemoElement as ElementView };

/* ---------- slide ---------- */
export const SlideView = memo(function SlideView({ slide, deck, index = 0, scale = 1, mode = 'view', hidden: hiddenIds, hideDeco, children, overlay, editing, editCell, handlers = {}, bare, animMap }) {
  const th = deck.theme;
  const bg = slideBg(slide, th);
  const deco = useMemo(() => (hideDeco ? [] : decoShapes(th).map((d, i) => ({ ...d, id: 'deco' + i, rot: 0, ...(d._corner ? { flipH: true } : {}) }))), [th, hideDeco]);
  const ft = deck.footer || {};
  return (
    <div style={bare ? undefined : { width: SW * scale, height: SH * scale, position: 'relative', overflow: 'hidden', flex: 'none' }}>
      <div className="slide" data-slide-id={slide.id} style={{ width: SW, height: SH, transform: bare ? undefined : `scale(${scale})`, transformOrigin: '0 0', position: bare ? 'relative' : 'absolute', left: 0, top: 0, overflow: 'hidden', ...bgCss(bg, th), color: rc('@text', th) }}>
        {deco.map((d) => <ElementView key={d.id} el={d} th={th} mode="view" />)}
        {slide.els.map((el) => (hiddenIds && hiddenIds.has(el.id) ? null : (
          <MemoElement key={el.id} el={el} th={th} mode={mode}
            editing={editing === el.id} editCell={editCell && editCell.id === el.id ? editCell : null}
            anim={animMap ? animMap[el.id] : undefined}
            onTextCommit={handlers.onTextCommit} onTextCancel={handlers.onTextCancel} onCellCommit={handlers.onCellCommit} onCellDone={handlers.onCellDone} editorRef={handlers.editorRef}
          />
        )))}
        {(ft.num || ft.text) && !(ft.skipTitle && index === 0) && (
          <div className="sfoot" style={{ color: rc('@muted', th), fontFamily: fontStack(th.body) }}>
            <span>{ft.text || ''}</span><span>{ft.num ? index + 1 : ''}</span>
          </div>
        )}
        {overlay}
        {children}
      </div>
    </div>
  );
});
