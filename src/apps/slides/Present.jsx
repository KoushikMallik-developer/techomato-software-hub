import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { SlideView } from './Render.jsx';
import { SW, SH, rc } from './model.js';

/* animation steps for a slide: groups of elements revealed together */
export function buildSteps(slide) {
  const items = slide.els.filter((e) => e.anim && e.anim.type && e.anim.type !== 'pulse').sort((a, b) => (a.anim.n ?? 0) - (b.anim.n ?? 0));
  const steps = [];
  let t = 0;
  for (const e of items) {
    const a = e.anim; const dur = a.dur || 0.5; const dl = a.delay || 0;
    if (a.trigger === 'click' || !steps.length) { steps.push([]); t = 0; }
    else if (a.trigger === 'after') { const g = steps[steps.length - 1]; t = Math.max(...g.map((x) => x.at + x.dur)); }
    steps[steps.length - 1].push({ id: e.id, anim: a, at: t + dl, dur });
  }
  return steps;
}

const PEN_COLORS = ['#ef4444', '#2563eb', '#16a34a', '#facc15', '#111827', '#ffffff'];

export function Presenter({ deck, start, onExit, withNotes }) {
  const order = useMemo(() => deck.slides.map((s, i) => i).filter((i) => !deck.slides[i].hidden), [deck.slides]);
  const first = order.includes(start) ? start : order.find((i) => i > start) ?? order[0] ?? 0;
  const [idx, setIdx] = useState(first);
  const [step, setStep] = useState(0);
  const [layers, setLayers] = useState([]); // transition layers
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [blank, setBlank] = useState(null);
  const [pen, setPen] = useState(false);
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [laser, setLaser] = useState(false);
  const [notes, setNotes] = useState(!!withNotes);
  const [bar, setBar] = useState(true);
  const [jump, setJump] = useState('');
  const [laserPos, setLaserPos] = useState(null);
  const [strokes, setStrokes] = useState({}); // per slide index
  const [elapsed, setElapsed] = useState(0);
  const rootRef = useRef(null);
  const barTimer = useRef(null);
  const slide = deck.slides[idx];
  const steps = useMemo(() => buildSteps(slide), [slide]);

  useEffect(() => {
    const el = rootRef.current;
    if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onFs = () => { if (!document.fullscreenElement && !fsExiting.current) onExit(); };
    const fsExiting = { current: false };
    window.addEventListener('resize', onResize); document.addEventListener('fullscreenchange', onFs);
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => { fsExiting.current = true; window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFs); clearInterval(t); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = useCallback((n, atEnd) => {
    if (n === idx) return;
    const to = deck.slides[n]; if (!to) return;
    const tr = to.trans || { type: 'none' };
    const back = n < idx;
    if (tr.type && tr.type !== 'none') {
      setLayers([{ key: 'o' + idx + Date.now(), idx, role: 'out', type: tr.type, dur: tr.dur || 0.5, back }, { key: 'i' + n + Date.now(), idx: n, role: 'in', type: tr.type, dur: tr.dur || 0.5, back }]);
      setTimeout(() => setLayers([]), (tr.dur || 0.5) * 1000 + 40);
    } else setLayers([]);
    setIdx(n); setStep(atEnd ? buildSteps(to).length : 0);
  }, [idx, deck.slides]);

  const next = useCallback(() => {
    if (blank) { setBlank(null); return; }
    if (step < steps.length) { setStep(step + 1); return; }
    const pos = order.indexOf(idx);
    if (pos < order.length - 1) goTo(order[pos + 1]); else onExit();
  }, [step, steps.length, order, idx, goTo, onExit, blank]);
  const prev = useCallback(() => {
    if (blank) { setBlank(null); return; }
    if (step > 0) { setStep(step - 1); return; }
    const pos = order.indexOf(idx); if (pos > 0) goTo(order[pos - 1], true);
  }, [step, order, idx, goTo, blank]);

  // auto advance
  useEffect(() => {
    const after = slide.trans && slide.trans.after;
    if (!after || step < steps.length) return undefined;
    const t = setTimeout(() => next(), after * 1000);
    return () => clearTimeout(t);
  }, [idx, step, steps.length, slide.trans]); // eslint-disable-line react-hooks/exhaustive-deps
  // timed builds ("after previous" runs automatically)
  useEffect(() => {
    if (step === 0 || step > steps.length) return undefined;
    return undefined;
  }, [step, steps.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) { setJump((j) => (j + k).slice(0, 3)); return; }
      if (k === 'Enter' && jump) { const n = Math.min(deck.slides.length, Math.max(1, Number(jump))) - 1; setJump(''); goTo(n); e.preventDefault(); return; }
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); next(); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); prev(); }
      else if (k === 'Home') goTo(order[0]); else if (k === 'End') goTo(order[order.length - 1]);
      else if (k === 'Escape') { if (pen) setPen(false); else if (blank) setBlank(null); else onExit(); }
      else if (k === 'b' || k === 'B') setBlank((b) => (b === 'black' ? null : 'black'));
      else if (k === 'w' || k === 'W') setBlank((b) => (b === 'white' ? null : 'white'));
      else if (k === 'p' || k === 'P') { setPen((v) => !v); setLaser(false); }
      else if (k === 'l' || k === 'L') { setLaser((v) => !v); setPen(false); }
      else if (k === 'e' || k === 'E') setStrokes((s) => ({ ...s, [idx]: [] }));
      else if (k === 'n' || k === 'N') setNotes((v) => !v);
      else if (k === 'f' || k === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else rootRef.current && rootRef.current.requestFullscreen && rootRef.current.requestFullscreen().catch(() => {}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, goTo, order, onExit, jump, pen, blank, idx, deck.slides.length]);

  const wakeBar = () => { setBar(true); clearTimeout(barTimer.current); barTimer.current = setTimeout(() => setBar(false), 2500); };
  useEffect(() => { wakeBar(); return () => clearTimeout(barTimer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nextSlide = deck.slides[order[order.indexOf(idx) + 1]];
  const area = notes ? { w: Math.min(size.w * 0.64, (size.h - 70) * (SW / SH)), h: 0 } : { w: size.w, h: size.h };
  const scale = notes ? Math.min((size.w * 0.64) / SW, (size.h - 60) / SH) : Math.min(size.w / SW, size.h / SH);
  void area;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const stageClick = (e) => {
    const a = e.target.closest && e.target.closest('a[data-slide]');
    if (a) { e.preventDefault(); e.stopPropagation(); goTo(Math.min(deck.slides.length - 1, Math.max(0, Number(a.dataset.slide)))); return; }
    const l = e.target.closest && e.target.closest('a[href]'); if (l && l.target === '_blank') { e.stopPropagation(); return; }
    const el = e.target.closest && e.target.closest('.el[data-link]');
    if (el) { const lk = el.dataset.link; if (lk.startsWith('slide:')) { e.stopPropagation(); goTo(Number(lk.slice(6))); return; } if (/^https?:|^mailto:/i.test(lk)) { e.stopPropagation(); window.open(lk, '_blank', 'noopener'); return; } }
    if (pen) return;
    next();
  };

  return (
    <div ref={rootRef} className={'presenter' + (laser ? ' laser' : '') + (pen ? ' penning' : '')} role="dialog" aria-label="Presentation" onMouseMove={(e) => { wakeBar(); if (laser) setLaserPos({ x: e.clientX, y: e.clientY }); }}>
      <div className={'pstage' + (notes ? ' withnotes' : '')}>
        <div className="pmain" onClick={stageClick}>
          <div className="pslidebox" style={{ width: SW * scale, height: SH * scale }}>
            {layers.length ? layers.map((L) => (
              <div key={L.key} className={`ptrans tr-${L.type} ${L.role}${L.back ? ' back' : ''}`} style={{ '--td': `${L.dur}s` }}>
                <SlideView slide={deck.slides[L.idx]} deck={deck} index={L.idx} scale={scale} mode="present" />
              </div>
            )) : <PresentSlide deck={deck} slide={slide} idx={idx} step={step} steps={steps} scale={scale} />}
            {!layers.length && <PenLayer scale={scale} active={pen} color={penColor} strokes={strokes[idx] || []} setStrokes={(fn) => setStrokes((s) => ({ ...s, [idx]: fn(s[idx] || []) }))} />}
          </div>
        </div>
        {notes && (
          <aside className="pnotes" onClick={(e) => e.stopPropagation()}>
            <div className="ptimer"><Icon name="timer" size={16} /> {mmss}<span>Slide {order.indexOf(idx) + 1} of {order.length}</span></div>
            <div className="pnext"><small>Next</small>{nextSlide ? <SlideView slide={nextSlide} deck={deck} index={deck.slides.indexOf(nextSlide)} scale={0.28} mode="present" /> : <em>End of presentation</em>}</div>
            <div className="pnotetext"><small>Speaker notes</small><div>{slide.notes ? slide.notes.split('\n').map((l, i) => <p key={i}>{l}</p>) : <em>No notes for this slide.</em>}</div></div>
          </aside>
        )}
      </div>
      {blank && <div className="pblank" style={{ background: blank }} onClick={() => setBlank(null)} />}
      {laser && laserPos && <div className="plaser" style={{ left: laserPos.x, top: laserPos.y }} />}
      {jump && <div className="pjump">Go to slide {jump} ⏎</div>}
      <div className={'pbar' + (bar ? ' show' : '')} onClick={(e) => e.stopPropagation()} onMouseMove={(e) => { e.stopPropagation(); wakeBar(); }}>
        <button onClick={prev} aria-label="Previous"><Icon name="chevronLeft" size={16} /></button>
        <span className="pcount">{order.indexOf(idx) + 1} / {order.length}</span>
        <button onClick={next} aria-label="Next"><Icon name="chevronRight" size={16} /></button>
        <span className="psep" />
        <button className={pen ? 'on' : ''} onClick={() => { setPen((v) => !v); setLaser(false); }} title="Pen (P)" aria-label="Pen"><Icon name="pencil" size={16} /></button>
        {pen && PEN_COLORS.map((c) => <button key={c} className={'pcol' + (c === penColor ? ' on' : '')} style={{ background: c }} onClick={() => setPenColor(c)} aria-label={'Pen colour ' + c} />)}
        {pen && <button onClick={() => setStrokes((s) => ({ ...s, [idx]: [] }))} title="Erase ink (E)" aria-label="Erase ink"><Icon name="eraser" size={16} /></button>}
        <button className={laser ? 'on' : ''} onClick={() => { setLaser((v) => !v); setPen(false); }} title="Laser pointer (L)" aria-label="Laser pointer"><span className="laserdot" /></button>
        <button className={notes ? 'on' : ''} onClick={() => setNotes((v) => !v)} title="Speaker notes (N)" aria-label="Speaker notes"><Icon name="note" size={16} /></button>
        <button onClick={() => setBlank('black')} title="Black screen (B)" aria-label="Black screen"><Icon name="square" size={16} /></button>
        <span className="ptime">{mmss}</span>
        <button onClick={onExit} title="Exit (Esc)" aria-label="Exit"><Icon name="x" size={16} /></button>
      </div>
    </div>
  );
}

function PresentSlide({ deck, slide, idx, step, steps, scale }) {
  const hidden = useMemo(() => { const s = new Set(); steps.forEach((g, i) => { if (i >= step) g.forEach((x) => s.add(x.id)); }); return s; }, [steps, step]);
  const animMap = useMemo(() => { const m = {}; const g = steps[step - 1]; if (g) g.forEach((x) => { m[x.id] = { ...x.anim, dur: x.dur, delay: x.at }; }); return m; }, [steps, step]);
  const pulses = useMemo(() => { const m = {}; slide.els.forEach((e) => { if (e.anim && e.anim.type === 'pulse') m[e.id] = { ...e.anim }; }); return m; }, [slide]);
  return <SlideView slide={slide} deck={deck} index={idx} scale={scale} mode="present" hidden={hidden} animMap={{ ...pulses, ...animMap }} animKey={step} />;
}

function PenLayer({ scale, active, color, strokes, setStrokes }) {
  const ref = useRef(null);
  const cur = useRef(null);
  const pt = (e) => { const r = ref.current.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };
  const down = (e) => { if (!active) return; e.stopPropagation(); ref.current.setPointerCapture(e.pointerId); cur.current = { c: color, pts: [pt(e)] }; setStrokes((s) => [...s, cur.current]); };
  const move = (e) => { if (!cur.current) return; cur.current.pts.push(pt(e)); setStrokes((s) => [...s.slice(0, -1), { ...cur.current, pts: [...cur.current.pts] }]); };
  const up = () => { cur.current = null; };
  return (
    <svg ref={ref} className="penlayer" width={SW * scale} height={SH * scale} viewBox={`0 0 ${SW} ${SH}`} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: active ? 'auto' : 'none', cursor: active ? 'crosshair' : 'default' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onClick={(e) => active && e.stopPropagation()}>
      {strokes.map((s, i) => <polyline key={i} points={s.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.c} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />)}
    </svg>
  );
}

/* ---------- slide sorter ---------- */
export function Sorter({ deck, sel, active, onPick, onMove, onContext, onOpen, onDelete }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  return (
    <div className="sorter" onClick={(e) => { if (e.target === e.currentTarget) onPick(null, e); }}>
      {deck.slides.map((s, i) => (
        <div key={s.id} className={'sortitem' + (sel.includes(i) ? ' on' : '') + (i === active ? ' cur' : '') + (over === i ? ' over' : '') + (s.hidden ? ' hid' : '')}
          draggable onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDragEnd={() => { setDrag(null); setOver(null); }}
          onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) onMove(drag, i); setDrag(null); setOver(null); }}
          onClick={(e) => onPick(i, e)} onDoubleClick={() => onOpen(i)} onContextMenu={(e) => { e.preventDefault(); onContext(e, i); }}>
          <SlideView slide={s} deck={deck} index={i} scale={0.26} mode="present" />
          <span className="sortn">{i + 1}</span>
          {s.hidden && <span className="sorthid" title="Skipped in presentation"><Icon name="eyeOff" size={12} /></span>}
        </div>
      ))}
      <button className="sortadd" onClick={() => onOpen(-1)} aria-label="Add slide"><Icon name="plus" size={22} /></button>
      {void onDelete}{void rc}
    </div>
  );
}
