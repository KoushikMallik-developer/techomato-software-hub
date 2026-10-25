import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, useToast } from '../components/fxui.jsx';
import { useStore, uid } from '../lib/useStore.js';
import { reduce, initState, exprLabel } from './calc/machine.js';
import { group, sci, plain } from './calc/engine.js';
import { ProgKeypad, initProg, progDisplay } from './calc/Programmer.jsx';
import DateCalc from './calc/DateCalc.jsx';
import Graph, { GRAPH_COLORS } from './calc/Graph.jsx';
import Converter from './calc/Converter.jsx';
import { CATS, defaultRates } from './calc/units.js';
import '../styles/calculator.css';

const blankData = () => ({
  mode: 'standard', history: [], memory: [], angle: 'deg', fe: false, rates: defaultRates(),
  graph: { eqs: [{ id: 'g1', expr: 'sin(x)', color: GRAPH_COLORS[0], on: true }, { id: 'g2', expr: 'x^2/4', color: GRAPH_COLORS[1], on: true }], view: { cx: 0, cy: 0, s: 40 }, params: { a: 1, b: 1, c: 0 }, radians: true },
});
const migrate = (v) => { const b = blankData(); return { ...b, ...v, rates: { ...b.rates, ...(v.rates || {}) }, graph: { ...b.graph, ...(v.graph || {}) } }; };
const NAV = [['standard', 'Standard', 'calculator'], ['scientific', 'Scientific', 'sigma'], ['graphing', 'Graphing', 'chartLine'], ['programmer', 'Programmer', 'code'], ['date', 'Date calculation', 'calendarIco']];
const MODE_TITLE = (m) => (m.startsWith('conv:') ? (CATS.find((c) => c.id === m.slice(5)) || CATS[0]).name : (NAV.find((n) => n[0] === m) || NAV[0])[1]);
const TRIG = [['sin', 'asin', 'sinh', 'asinh'], ['cos', 'acos', 'cosh', 'acosh'], ['tan', 'atan', 'tanh', 'atanh'], ['sec'], ['csc'], ['cot']];

export default function CalculatorApp() {
  const [data, setData, meta] = useStore('calculator', blankData, migrate);
  const [toastNode, toast] = useToast();
  const [navOpen, setNavOpen] = useState(false); const [pane, setPane] = useState(false); const [tab, setTab] = useState('history');
  const [s, setS] = useState(initState); const [lastExpr, setLastExpr] = useState('');
  const [second, setSecond] = useState(false); const [hyp, setHyp] = useState(false);
  const [prog, setProg] = useState(initProg);
  const { mode } = data; const isStd = mode === 'standard' || mode === 'scientific'; const isConv = mode.startsWith('conv:'); const isProg = mode === 'programmer';
  const setMode = (m) => { setData((d) => ({ ...d, mode: m })); setNavOpen(false); };
  const log = useCallback((e) => setData((d) => ({ ...d, history: [{ id: uid(), t: Date.now(), ...e }, ...d.history].slice(0, 100) })), [setData]);
  const sref = useRef(s); sref.current = s;
  const press = useCallback((a) => {
    const [ns, em] = reduce(sref.current, a, { mode: mode === 'scientific' ? 'scientific' : 'standard', angle: data.angle });
    sref.current = ns; setS(ns);
    if (em.length) { em.forEach(log); setLastExpr(em[em.length - 1].expr); } else if (!['=', 'pct'].includes(a)) setLastExpr((x) => (ns.toks.length ? '' : x && ns.justEq ? x : ''));
  }, [mode, data.angle, log]);
  useEffect(() => { setS(initState()); sref.current = initState(); setLastExpr(''); }, [mode]);

  /* keyboard */
  useEffect(() => {
    if (!isStd) return undefined;
    const k = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || (e.target.closest && e.target.closest('.fx-modal'))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { if (!window.getSelection().toString()) { navigator.clipboard && navigator.clipboard.writeText(sref.current.err || sref.current.cur).then(() => toast('Copied to clipboard')).catch(() => {}); } return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { navigator.clipboard && navigator.clipboard.readText().then((t) => { const v = (t || '').replace(/[,\s]/g, ''); if (/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(v)) { const n = parseFloat(v); setS((x) => ({ ...x, cur: plain(n), entered: true, curLabel: null, err: null })); } else toast('Clipboard does not contain a number'); }).catch(() => {}); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let a = null; const key = e.key;
      if (/^[0-9]$/.test(key)) a = 'd' + key; else if (key === '.' || key === ',') a = 'dot'; else if (['+', '-', '*', '/'].includes(key)) a = key; else if (key === 'Enter' || key === '=') a = '='; else if (key === 'Backspace') a = 'back'; else if (key === 'Escape') a = 'c'; else if (key === 'Delete') a = 'ce';
      else if (key === '%') a = mode === 'scientific' ? 'mod' : 'pct'; else if (key === '^') a = 'pow'; else if (key === '(') a = '('; else if (key === ')') a = ')'; else if (key === '!') a = 'fact'; else if (key.toLowerCase() === 'p' && mode === 'scientific') a = 'pi'; else if (key.toLowerCase() === 'r') a = 'inv'; else if (key.toLowerCase() === 'q') a = 'sqr'; else if (key === '@') a = 'sqrt'; else if (key === 'F9') a = 'neg';
      if (a) { e.preventDefault(); press(a); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [isStd, mode, press, toast]);

  /* memory */
  const mem = data.memory; const curVal = () => parseFloat(sref.current.cur) || 0;
  const memOp = (k) => {
    const v = curVal();
    if (k === 'mc') setData((d) => ({ ...d, memory: [] }));
    else if (k === 'ms') setData((d) => ({ ...d, memory: [plain(v), ...d.memory].slice(0, 30) }));
    else if (k === 'mp') setData((d) => ({ ...d, memory: d.memory.length ? [plain(parseFloat(d.memory[0]) + v), ...d.memory.slice(1)] : [plain(v)] }));
    else if (k === 'mm') setData((d) => ({ ...d, memory: d.memory.length ? [plain(parseFloat(d.memory[0]) - v), ...d.memory.slice(1)] : [plain(-v)] }));
    else if (k === 'mr' && mem.length) { const ns = { ...sref.current, cur: mem[0], entered: true, curLabel: null, err: null, justEq: false }; sref.current = ns; setS(ns); }
    if (['ms', 'mp', 'mm'].includes(k)) toast(k === 'ms' ? 'Saved to memory' : 'Memory updated');
  };

  const disp = isProg ? progDisplay(prog) : null;
  const shown = disp ? disp.main : s.err ? s.err : data.fe && !s.entered ? sci(parseFloat(s.cur)) : group(s.cur);
  const exprText = isProg ? disp.expr : s.toks.length ? exprLabel(s.toks) : lastExpr;
  const fs = shown.length > 22 ? 22 : shown.length > 16 ? 28 : shown.length > 11 ? 36 : 48;

  const B = (a, label, cls = 'op', aria) => <button key={a + (aria || '')} className={'cb ' + cls} onClick={() => press(a)} aria-label={aria || (typeof label === 'string' ? label : a)}>{label}</button>;
  const N = (d) => B('d' + d, String(d), 'num');
  const trigFn = (n) => { const row = TRIG.find((r) => r[0] === n); const i = (second ? 1 : 0) + (hyp ? 2 : 0); return row[i] || row[0]; };

  const std = (
    <div className="calc-pad std">
      {B('pct', '%')}{B('ce', 'CE')}{B('c', 'C')}{B('back', <Icon name="backspace" size={18} />, 'op', 'Backspace')}
      {B('inv', <i>¹⁄ₓ</i>, 'op', 'Reciprocal')}{B('sqr', <>x<sup>2</sup></>, 'op', 'Square')}{B('sqrt', '²√x', 'op', 'Square root')}{B('/', '÷', 'op', 'Divide')}
      {N(7)}{N(8)}{N(9)}{B('*', '×', 'op', 'Multiply')}
      {N(4)}{N(5)}{N(6)}{B('-', '−', 'op', 'Subtract')}
      {N(1)}{N(2)}{N(3)}{B('+', '+', 'op', 'Add')}
      {B('neg', '±', 'num', 'Negate')}{N(0)}{B('dot', '.', 'num', 'Decimal point')}{B('=', '=', 'eq', 'Equals')}
    </div>
  );
  const scientific = (
    <>
      <div className="calc-sbar">
        <button className="fb sub sm" onClick={() => setData((d) => ({ ...d, angle: d.angle === 'deg' ? 'rad' : d.angle === 'rad' ? 'grad' : 'deg' }))} title="Angle unit" aria-label={`Angle unit: ${data.angle}`}>{data.angle.toUpperCase()}</button>
        <button className={'fb sub sm' + (data.fe ? ' on' : '')} onClick={() => setData((d) => ({ ...d, fe: !d.fe }))} aria-pressed={data.fe}>F–E</button>
        <Pop trigger={({ toggle }) => <button className="fb sub sm" onClick={toggle}>Trigonometry<Icon name="chevronDown" size={12} /></button>} width={260}>{({ close }) => (
          <div className="calc-popgrid"><div className="calc-poprow"><button className={'fb sm' + (second ? ' on' : '')} onClick={() => setSecond((x) => !x)}>2nd</button><button className={'fb sm' + (hyp ? ' on' : '')} onClick={() => setHyp((x) => !x)}>hyp</button></div>
            <div className="calc-popbtns">{TRIG.map((r) => { const n = trigFn(r[0]); return <button key={r[0]} className="cb op" onClick={() => { press(n); close(); }}>{n}</button>; })}</div></div>)}</Pop>
        <Pop trigger={({ toggle }) => <button className="fb sub sm" onClick={toggle}>Function<Icon name="chevronDown" size={12} /></button>} width={220}>{({ close }) => (
          <div className="calc-popgrid"><div className="calc-popbtns">{[['abs', '|x|'], ['floor', '⌊x⌋'], ['ceil', '⌈x⌉'], ['rand', 'rand'], ['dms', '→dms'], ['deg', '→deg'], ['cube', 'x³'], ['cbrt', '∛x'], ['log2', 'log₂']].map(([a, l]) => <button key={a} className="cb op" onClick={() => { press(a); close(); }}>{l}</button>)}</div></div>)}</Pop>
      </div>
      <div className="calc-pad sci">
        {[
          <button key="2nd" className={'cb op' + (second ? ' on' : '')} aria-pressed={second} onClick={() => setSecond((x) => !x)}>2nd</button>, B('pi', 'π'), B('e', 'e'), B('c', 'C'), B('back', <Icon name="backspace" size={18} />, 'op', 'Backspace'),
          second ? B('cube', <>x<sup>3</sup></>, 'op', 'Cube') : B('sqr', <>x<sup>2</sup></>, 'op', 'Square'), B('inv', <i>¹⁄ₓ</i>, 'op', 'Reciprocal'), B('abs', '|x|'), B('e10', 'exp'), B('mod', 'mod'),
          second ? B('cbrt', '³√x', 'op', 'Cube root') : B('sqrt', '²√x', 'op', 'Square root'), B('(', '('), B(')', ')'), B('fact', 'n!'), B('/', '÷', 'op', 'Divide'),
          second ? B('yroot', <>y√x</>, 'op', 'y-th root') : B('pow', <>x<sup>y</sup></>, 'op', 'Power'), N(7), N(8), N(9), B('*', '×', 'op', 'Multiply'),
          second ? B('pow2', <>2<sup>x</sup></>, 'op', 'Two to the power') : B('pow10', <>10<sup>x</sup></>, 'op', 'Ten to the power'), N(4), N(5), N(6), B('-', '−', 'op', 'Subtract'),
          second ? B('log2', <>log₂</>, 'op', 'Log base 2') : B('log', 'log'), N(1), N(2), N(3), B('+', '+', 'op', 'Add'),
          second ? B('expx', <>e<sup>x</sup></>, 'op', 'e to the power') : B('ln', 'ln'), B('neg', '±', 'num', 'Negate'), N(0), B('dot', '.', 'num', 'Decimal point'), B('=', '=', 'eq', 'Equals'),
        ]}
      </div>
    </>
  );

  let body;
  if (mode === 'graphing') body = <Graph eqs={data.graph.eqs} setEqs={(fn) => setData((d) => ({ ...d, graph: { ...d.graph, eqs: typeof fn === 'function' ? fn(d.graph.eqs) : fn } }))} view={data.graph.view} setView={(v) => setData((d) => ({ ...d, graph: { ...d.graph, view: v } }))} params={data.graph.params} setParams={(p) => setData((d) => ({ ...d, graph: { ...d.graph, params: p } }))} radians={data.graph.radians} setRadians={(r) => setData((d) => ({ ...d, graph: { ...d.graph, radians: r } }))} />;
  else if (mode === 'date') body = <DateCalc />;
  else if (isConv) { const cat = CATS.find((c) => c.id === mode.slice(5)); body = <Converter key={cat.id} cat={cat} rates={data.rates} setRates={(r) => setData((d) => ({ ...d, rates: r }))} onLog={(e) => { log(e); toast('Saved to history'); }} />; }
  else {
    body = (
      <div className={'calc-keys-wrap' + (isProg ? ' prog' : '')}>
        <div className="calc-disp" role="status" aria-live="polite">
          <div className="calc-expr" data-testid="expr">{exprText}</div>
          <div className="calc-val" style={{ fontSize: fs }} data-testid="display">{shown}</div>
        </div>
        {isStd && (
          <div className="calc-mem">
            {[['mc', 'MC'], ['mr', 'MR'], ['mp', 'M+'], ['mm', 'M−'], ['ms', 'MS']].map(([k, l]) => <button key={k} className="calc-mb" disabled={(k === 'mc' || k === 'mr') && !mem.length} onClick={() => memOp(k)} aria-label={{ mc: 'Memory clear', mr: 'Memory recall', mp: 'Memory add', mm: 'Memory subtract', ms: 'Memory store' }[k]}>{l}</button>)}
            <button className="calc-mb" onClick={() => { setTab('memory'); setPane(true); }} aria-label="Memory list">M<Icon name="chevronDown" size={11} /></button>
          </div>
        )}
        {isProg ? <ProgKeypad st={prog} setSt={setProg} onEmit={log} /> : mode === 'scientific' ? scientific : std}
      </div>
    );
  }
  const showPane = isStd || isProg || isConv;
  return (
    <div className="fx calc" style={{ '--brand': '#2f6db5' }}>
      <AppBar id="calculator" name="Techomato Calculator" status={meta.status} backup={{ name: 'calculator', get: () => meta.ref.current, set: (v) => setData(() => migrate(v)), blank: blankData }}
        right={showPane ? <button className="fx-bar-btn" aria-label="History and memory" title="History and memory" onClick={() => setPane((p) => !p)}><Icon name="history" size={18} /></button> : null} />
      <div className="calc-wrap">
        <nav className={'calc-nav' + (navOpen ? ' open' : '')} aria-label="Calculator modes">
          <div className="calc-nav-g">Calculator</div>
          {NAV.map(([id, name, ic]) => <button key={id} className={'calc-ni' + (mode === id ? ' on' : '')} onClick={() => setMode(id)} aria-current={mode === id}><Icon name={ic} size={17} /><span>{name}</span></button>)}
          <div className="calc-nav-g">Converter</div>
          {CATS.map((c) => <button key={c.id} className={'calc-ni' + (mode === 'conv:' + c.id ? ' on' : '')} onClick={() => setMode('conv:' + c.id)} aria-current={mode === 'conv:' + c.id}><Icon name={c.icon} size={17} /><span>{c.name}</span></button>)}
        </nav>
        {navOpen && <div className="calc-scrim" onClick={() => setNavOpen(false)} />}
        <main className="calc-main">
          <div className="calc-head"><button className="fb sub ico" aria-label="Toggle navigation" onClick={() => setNavOpen((o) => !o)}><Icon name="menu" size={19} /></button><h1>{MODE_TITLE(mode)}</h1>
            {mode === 'graphing' && <span className="muted" style={{ fontSize: 12.5 }}>Drag to pan · scroll to zoom</span>}</div>
          <div className="calc-content">{body}</div>
        </main>
        {showPane && pane && (
          <aside className="calc-pane" aria-label="History and memory">
            <div className="fx-tabs" role="tablist"><button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button><button role="tab" aria-selected={tab === 'memory'} className={tab === 'memory' ? 'on' : ''} onClick={() => setTab('memory')}>Memory</button></div>
            <div className="calc-plist">
              {tab === 'history' ? (data.history.length === 0 ? <div className="fx-empty">There's no history yet</div> : data.history.map((h) => (
                <button key={h.id} className="calc-hi" onClick={() => { if (isStd) { const ns = { ...initState(), cur: h.res.replace(/,/g, ''), entered: true }; if (!Number.isNaN(parseFloat(ns.cur))) { sref.current = ns; setS(ns); } } navigator.clipboard && !isStd && navigator.clipboard.writeText(h.res).then(() => toast('Result copied')).catch(() => {}); }}><span className="e">{h.expr}</span><span className="r">{group(h.res)}</span></button>
              )) ) : mem.length === 0 ? <div className="fx-empty">There's nothing saved in memory</div> : mem.map((m, i) => (
                <div key={i} className="calc-hi mem"><button className="r" onClick={() => { const ns = { ...sref.current, cur: m, entered: true, curLabel: null, err: null }; sref.current = ns; setS(ns); }}>{group(m)}</button>
                  <div className="calc-hb"><button onClick={() => setData((d) => ({ ...d, memory: d.memory.filter((_, j) => j !== i) }))} aria-label="MC">MC</button><button onClick={() => setData((d) => ({ ...d, memory: d.memory.map((x, j) => (j === i ? plain(parseFloat(x) + curVal()) : x)) }))} aria-label="M+">M+</button><button onClick={() => setData((d) => ({ ...d, memory: d.memory.map((x, j) => (j === i ? plain(parseFloat(x) - curVal()) : x)) }))} aria-label="M−">M−</button></div></div>
              ))}
            </div>
            {((tab === 'history' && data.history.length > 0) || (tab === 'memory' && mem.length > 0)) && <button className="calc-clr" aria-label="Clear" onClick={() => setData((d) => (tab === 'history' ? { ...d, history: [] } : { ...d, memory: [] }))}><Icon name="trash" size={17} /></button>}
          </aside>
        )}
      </div>
      {toastNode}
    </div>
  );
}
