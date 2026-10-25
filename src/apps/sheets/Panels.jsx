import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { findCells } from '../../lib/sheet/model.js';
import { parseRange, rangeText, keyOf, colName } from '../../lib/sheet/addr.js';
import { formatValue, FORMAT_PRESETS } from '../../lib/sheet/numfmt.js';
import { ICON_SETS, ICON_COLORS } from '../../lib/sheet/cf.js';
import { FN_CATEGORIES, FN_LIST } from './fnmeta.js';
import { CHART_TYPES } from './Chart.jsx';
import { cellText, rangeLabel } from './ops.js';

const Row = ({ label, children, hint }) => (
  <div className="sp-row"><label>{label}</label><div>{children}</div>{hint && <small>{hint}</small>}</div>
);
const Check = ({ checked, onChange, children }) => (
  <label className="sp-check"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /> <span>{children}</span></label>
);
const Color = ({ value, onChange, label }) => (
  <input type="color" aria-label={label} className="sp-color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
);

/* =============== Find & replace =============== */
export function FindPanel({ book, ev, si, sel, initial, onGo, onHighlight, onReplace, onClose }) {
  const [q, setQ] = useState(initial.q || '');
  const [rep, setRep] = useState('');
  const [o, setO] = useState({ matchCase: false, whole: false, regex: false, inFormulas: false, scope: 'sheet' });
  const [idx, setIdx] = useState(-1);
  const [showRep, setShowRep] = useState(!!initial.replace);
  const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [initial.key]);
  const range = sel && sel.ranges.length === 1 && o.scope === 'sel' ? sel.ranges[0] : null;
  const matches = useMemo(() => {
    if (!q) return [];
    const opts = { matchCase: o.matchCase, whole: o.whole, regex: o.regex, inFormulas: o.inFormulas };
    if (o.scope !== 'all') opts.sheetOnly = si;
    if (range) opts.range = range;
    return findCells(book, (s, r, c, inF) => {
      const sh = book.sheets[s]; const cell = sh.cells[keyOf(r, c)];
      if (!cell) return null;
      if (inF) return cell.f !== undefined ? cell.f : String(cell.v);
      return cellText(ev, book, sh, s, r, c);
    }, q, opts);
  }, [q, o, book, ev, si, range]);
  useEffect(() => {
    onHighlight(new Set(matches.filter((m) => m.si === si).map((m) => keyOf(m.r, m.c))));
    return undefined;
  }, [matches, si]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onHighlight(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setIdx(-1); }, [q, o]);
  const go = (d) => {
    if (!matches.length) return;
    const n = (idx + d + matches.length) % matches.length;
    setIdx(n); onGo(matches[n]);
  };
  const set = (k) => (v) => setO((s) => ({ ...s, [k]: v }));
  return (
    <aside className="sidepanel sp" aria-label="Find and replace">
      <h3>Find{showRep ? ' and replace' : ''} <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={14} /></button></h3>
      <input ref={inputRef} className="sp-in" type="search" placeholder="Find" aria-label="Find" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') onClose(); }} />
      {showRep && <input className="sp-in" type="text" placeholder="Replace with" aria-label="Replace with" value={rep} onChange={(e) => setRep(e.target.value)} />}
      <div className="sp-btns">
        <button className="btn sm" onClick={() => go(-1)} disabled={!matches.length}>Previous</button>
        <button className="btn sm primary" onClick={() => go(1)} disabled={!matches.length}>Next</button>
        <span className="muted small" role="status">{q ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : ''}</span>
      </div>
      {!showRep && <button className="btn sm ghost" onClick={() => setShowRep(true)}>Replace...</button>}
      {showRep && (
        <div className="sp-btns">
          <button className="btn sm" disabled={!matches.length || idx < 0} onClick={() => { onReplace([matches[idx]], q, rep, o); }}>Replace</button>
          <button className="btn sm" disabled={!matches.length} onClick={() => { onReplace(matches, q, rep, o); setIdx(-1); }}>Replace all</button>
        </div>
      )}
      <Row label="Search in">
        <select value={o.scope} onChange={(e) => set('scope')(e.target.value)} aria-label="Search in">
          <option value="sheet">This sheet</option><option value="all">All sheets</option><option value="sel">Selected range</option>
        </select>
      </Row>
      <Check checked={o.matchCase} onChange={set('matchCase')}>Match case</Check>
      <Check checked={o.whole} onChange={set('whole')}>Match entire cell</Check>
      <Check checked={o.regex} onChange={set('regex')}>Regular expression</Check>
      <Check checked={o.inFormulas} onChange={set('inFormulas')}>Also search in formulas</Check>
      {matches.length > 0 && (
        <ul className="sp-list" aria-label="Matches">
          {matches.slice(0, 200).map((m, i) => {
            const sh = book.sheets[m.si];
            return <li key={i}><button className={i === idx ? 'on' : ''} onClick={() => { setIdx(i); onGo(m); }}><b>{o.scope === 'all' ? sh.name + '!' : ''}{colName(m.c)}{m.r + 1}</b> <span>{cellText(ev, book, sh, m.si, m.r, m.c).slice(0, 40)}</span></button></li>;
          })}
        </ul>
      )}
    </aside>
  );
}

/* =============== Insert function =============== */
export function FunctionPicker({ close }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const list = useMemo(() => FN_LIST.filter((f) => (cat === 'All' || f.cat === cat) && (!q || f.name.includes(q.toUpperCase()) || f.desc.toLowerCase().includes(q.toLowerCase()))), [q, cat]);
  const [pick, setPick] = useState(null);
  const cur = pick && list.find((f) => f.name === pick) ? pick : list[0] && list[0].name;
  const info = list.find((f) => f.name === cur);
  return (
    <div className="fnpicker">
      <input className="sp-in" type="search" placeholder="Search functions" aria-label="Search functions" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && cur) { e.preventDefault(); close(cur); } }} />
      <div className="fp-body">
        <ul className="fp-cats" aria-label="Categories">
          {['All', ...FN_CATEGORIES].map((c) => <li key={c}><button className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button></li>)}
        </ul>
        <ul className="fp-list" role="listbox" aria-label="Functions">
          {list.map((f) => <li key={f.name}><button role="option" aria-selected={f.name === cur} className={f.name === cur ? 'on' : ''} onClick={() => setPick(f.name)} onDoubleClick={() => close(f.name)}>{f.name}</button></li>)}
          {!list.length && <li className="muted small pad">No functions found.</li>}
        </ul>
      </div>
      {info && <div className="fp-info"><b>{info.sig}</b><p>{info.desc}</p></div>}
      <div className="modal-foot">
        <button className="btn ghost" onClick={() => close(null)}>Cancel</button>
        <button className="btn primary" disabled={!cur} onClick={() => close(cur)}>Insert</button>
      </div>
    </div>
  );
}

/* =============== Custom number format =============== */
export function FormatPicker({ initial, sample, close }) {
  const [fmt, setFmt] = useState(initial || 'General');
  let preview = '';
  try { preview = formatValue(sample, fmt).text; } catch { preview = '(invalid format)'; }
  return (
    <div className="fmtpicker">
      <div className="field"><label htmlFor="fmtin">Format code</label><input id="fmtin" type="text" value={fmt} onChange={(e) => setFmt(e.target.value)} spellCheck={false} autoFocus /></div>
      <p className="fmtprev" aria-live="polite">Preview: <b>{preview}</b></p>
      <ul className="fmtlist" aria-label="Format presets">
        {FORMAT_PRESETS.filter((p) => !p.sep).map((p) => <li key={p.label}><button onClick={() => setFmt(p.fmt)} className={p.fmt === fmt ? 'on' : ''}><span>{p.label}</span><small>{formatValue(p.sample, p.fmt).text}</small></button></li>)}
      </ul>
      <p className="muted small">Examples: <code>0.00</code>, <code>#,##0</code>, <code>0.0%</code>, <code>yyyy-mm-dd</code>, <code>[Red]-0;0</code>, <code>0.0,,"M"</code>, <code>@</code></p>
      <div className="modal-foot"><button className="btn ghost" onClick={() => close(null)}>Cancel</button><button className="btn primary" onClick={() => close(fmt)}>Apply</button></div>
    </div>
  );
}

/* =============== Sort dialog =============== */
export function SortDialog({ g, headerGuess, labelOf, close }) {
  const [hasHeader, setHasHeader] = useState(headerGuess);
  const cols = []; for (let c = g.c1; c <= g.c2; c++) cols.push(c);
  const [keys, setKeys] = useState([{ col: g.c1, desc: false }]);
  const label = (c) => (hasHeader ? `${labelOf(c) || 'Column ' + colName(c)}` : `Column ${colName(c)}`);
  return (
    <div className="sortdlg">
      <Check checked={hasHeader} onChange={setHasHeader}>Data has a header row</Check>
      {keys.map((k, i) => (
        <div className="sd-row" key={i}>
          <span>{i ? 'then by' : 'Sort by'}</span>
          <select aria-label={`Sort column ${i + 1}`} value={k.col} onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, col: Number(e.target.value) } : x)))}>
            {cols.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
          <select aria-label={`Sort order ${i + 1}`} value={k.desc ? 'd' : 'a'} onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, desc: e.target.value === 'd' } : x)))}>
            <option value="a">A to Z</option><option value="d">Z to A</option>
          </select>
          {keys.length > 1 && <button className="icon-btn" aria-label="Remove level" onClick={() => setKeys(keys.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>}
        </div>
      ))}
      {keys.length < 5 && <button className="btn sm ghost" onClick={() => setKeys([...keys, { col: cols.find((c) => !keys.some((k) => k.col === c)) ?? g.c1, desc: false }])}>+ Add another sort column</button>}
      <p className="muted small">Range: {rangeText(g)}</p>
      <div className="modal-foot"><button className="btn ghost" onClick={() => close(null)}>Cancel</button><button className="btn primary" onClick={() => close({ hasHeader, keys })}>Sort</button></div>
    </div>
  );
}

/* =============== Remove duplicates =============== */
export function DedupeDialog({ g, labelOf, headerGuess, close }) {
  const [hasHeader, setHasHeader] = useState(headerGuess);
  const cols = []; for (let c = g.c1; c <= g.c2; c++) cols.push(c);
  const [chosen, setChosen] = useState(new Set(cols));
  return (
    <div>
      <Check checked={hasHeader} onChange={setHasHeader}>Data has a header row</Check>
      <p className="muted small">Columns to compare:</p>
      <div className="dd-cols">
        {cols.map((c) => <Check key={c} checked={chosen.has(c)} onChange={(v) => { const n = new Set(chosen); if (v) n.add(c); else n.delete(c); setChosen(n); }}>{hasHeader ? labelOf(c) || colName(c) : 'Column ' + colName(c)}</Check>)}
      </div>
      <div className="modal-foot"><button className="btn ghost" onClick={() => close(null)}>Cancel</button><button className="btn primary" disabled={!chosen.size} onClick={() => close({ hasHeader, cols: [...chosen] })}>Remove duplicates</button></div>
    </div>
  );
}

/* =============== Pivot table =============== */
export function PivotDialog({ fields, rangeText: rt, close }) {
  const [rowF, setRowF] = useState(0);
  const [colF, setColF] = useState(-1);
  const [valF, setValF] = useState(Math.min(1, fields.length - 1));
  const [agg, setAgg] = useState('SUM');
  return (
    <div>
      <p className="muted small">Source: {rt}. Builds a new sheet with live formulas.</p>
      <div className="field"><label htmlFor="pv1">Rows</label><select id="pv1" value={rowF} onChange={(e) => setRowF(+e.target.value)}>{fields.map((f, i) => <option key={i} value={i}>{f}</option>)}</select></div>
      <div className="field"><label htmlFor="pv2">Columns (optional)</label><select id="pv2" value={colF} onChange={(e) => setColF(+e.target.value)}><option value={-1}>(none)</option>{fields.map((f, i) => <option key={i} value={i}>{f}</option>)}</select></div>
      <div className="field"><label htmlFor="pv3">Values</label><select id="pv3" value={valF} onChange={(e) => setValF(+e.target.value)}>{fields.map((f, i) => <option key={i} value={i}>{f}</option>)}</select></div>
      <div className="field"><label htmlFor="pv4">Summarise by</label><select id="pv4" value={agg} onChange={(e) => setAgg(e.target.value)}>{['SUM', 'COUNT', 'AVERAGE', 'MAX', 'MIN'].map((a) => <option key={a}>{a}</option>)}</select></div>
      <div className="modal-foot"><button className="btn ghost" onClick={() => close(null)}>Cancel</button><button className="btn primary" onClick={() => close({ rowF, colF, valF, agg })}>Create</button></div>
    </div>
  );
}

/* =============== Named ranges panel =============== */
export function NamesPanel({ book, defaultRef, onAdd, onDelete, onGo, onClose }) {
  const [name, setName] = useState('');
  const [ref, setRef] = useState(defaultRef);
  useEffect(() => { setRef(defaultRef); }, [defaultRef]);
  const names = Object.entries(book.names || {});
  return (
    <aside className="sidepanel sp" aria-label="Named ranges">
      <h3>Named ranges <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={14} /></button></h3>
      <form className="sp-form" onSubmit={(e) => { e.preventDefault(); if (onAdd(name.trim(), ref.trim())) setName(''); }}>
        <input className="sp-in" aria-label="Name" placeholder="Name (e.g. Sales)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="sp-in" aria-label="Refers to" placeholder="=Sheet1!$A$1:$A$10" value={ref} onChange={(e) => setRef(e.target.value)} spellCheck={false} />
        <button className="btn sm primary" type="submit">Add name</button>
      </form>
      <ul className="sp-list">
        {names.map(([n, r]) => (
          <li key={n} className="sp-item"><button onClick={() => onGo(n)}><b>{n}</b> <span>{r}</span></button>
            <button className="icon-btn" aria-label={`Delete ${n}`} onClick={() => onDelete(n)}><Icon name="trash" size={13} /></button></li>
        ))}
        {!names.length && <li className="muted small">No names yet. Names make formulas easier to read: =SUM(Sales).</li>}
      </ul>
    </aside>
  );
}

/* =============== Chart panel =============== */
export function ChartPanel({ chart, onChange, onUseSelection, onDelete, onClose }) {
  const [range, setRange] = useState(chart.range);
  useEffect(() => { setRange(chart.range); }, [chart.range, chart.id]);
  const ch = (p, k) => onChange(p, k);
  return (
    <aside className="sidepanel sp" aria-label="Chart editor">
      <h3>Chart <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={14} /></button></h3>
      <Row label="Type"><select value={chart.type} onChange={(e) => ch({ type: e.target.value })} aria-label="Chart type">{CHART_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
      <Row label="Data range">
        <input className="sp-in" value={range} spellCheck={false} aria-label="Data range" onChange={(e) => setRange(e.target.value)} onBlur={() => range !== chart.range && ch({ range })} onKeyDown={(e) => { if (e.key === 'Enter') ch({ range }); }} />
        <button className="btn sm ghost" onClick={onUseSelection}>Use selection</button>
      </Row>
      <Check checked={chart.byRows} onChange={(v) => ch({ byRows: v })}>Switch rows / columns</Check>
      <Row label="First row is header"><select value={chart.headerRow === undefined ? 'auto' : String(chart.headerRow)} onChange={(e) => ch({ headerRow: e.target.value === 'auto' ? undefined : e.target.value === 'true' })}><option value="auto">Auto</option><option value="true">Yes</option><option value="false">No</option></select></Row>
      <Row label="First column is labels"><select value={chart.headerCol === undefined ? 'auto' : String(chart.headerCol)} onChange={(e) => ch({ headerCol: e.target.value === 'auto' ? undefined : e.target.value === 'true' })}><option value="auto">Auto</option><option value="true">Yes</option><option value="false">No</option></select></Row>
      <Row label="Title"><input className="sp-in" value={chart.title || ''} aria-label="Chart title" onChange={(e) => ch({ title: e.target.value }, 'ct')} /></Row>
      <Row label="Legend"><select value={chart.legend || 'right'} onChange={(e) => ch({ legend: e.target.value })} aria-label="Legend">{['right', 'bottom', 'top', 'left', 'none'].map((x) => <option key={x}>{x}</option>)}</select></Row>
      {['column', 'bar', 'area'].includes(chart.type) && <Check checked={chart.stacked} onChange={(v) => ch({ stacked: v, percent: v ? chart.percent : false })}>Stacked</Check>}
      {['column', 'bar', 'area'].includes(chart.type) && chart.stacked && <Check checked={chart.percent} onChange={(v) => ch({ percent: v })}>100% stacked</Check>}
      {['line', 'combo', 'scatter'].includes(chart.type) && <Check checked={chart.smooth} onChange={(v) => ch({ smooth: v })}>Smooth lines</Check>}
      <Check checked={chart.labels} onChange={(v) => ch({ labels: v })}>Data labels</Check>
      <Row label="X axis title"><input className="sp-in" value={chart.xTitle || ''} aria-label="X axis title" onChange={(e) => ch({ xTitle: e.target.value }, 'cx')} /></Row>
      <Row label="Y axis title"><input className="sp-in" value={chart.yTitle || ''} aria-label="Y axis title" onChange={(e) => ch({ yTitle: e.target.value }, 'cy')} /></Row>
      <div className="sp-two">
        <Row label="Axis min"><input className="sp-in" type="number" value={chart.min ?? ''} aria-label="Axis minimum" onChange={(e) => ch({ min: e.target.value === '' ? undefined : Number(e.target.value) }, 'cmin')} /></Row>
        <Row label="Axis max"><input className="sp-in" type="number" value={chart.max ?? ''} aria-label="Axis maximum" onChange={(e) => ch({ max: e.target.value === '' ? undefined : Number(e.target.value) }, 'cmax')} /></Row>
      </div>
      <Row label="Series colours">
        <div className="sp-colors">
          {[0, 1, 2, 3, 4, 5].map((i) => <Color key={i} label={`Series ${i + 1} colour`} value={(chart.colors || [])[i]} onChange={(v) => { const cs = [...(chart.colors || [])]; cs[i] = v; ch({ colors: cs }); }} />)}
          {chart.colors && chart.colors.length > 0 && <button className="btn sm ghost" onClick={() => ch({ colors: undefined })}>Reset</button>}
        </div>
      </Row>
      <button className="btn sm danger-solid" onClick={onDelete}>Delete chart</button>
    </aside>
  );
}

/* =============== Conditional formatting =============== */
const STYLE_PRESETS = [
  { id: 'red', label: 'Light red fill, dark red text', s: { bg: '#f4c7c3', fc: '#9c0006' } },
  { id: 'yellow', label: 'Yellow fill, dark yellow text', s: { bg: '#fff2cc', fc: '#7f6000' } },
  { id: 'green', label: 'Green fill, dark green text', s: { bg: '#c6efce', fc: '#006100' } },
  { id: 'blue', label: 'Light blue fill', s: { bg: '#cfe2f3', fc: '#0b3d91' } },
  { id: 'redtext', label: 'Red text', s: { fc: '#c5221f' } },
  { id: 'bold', label: 'Bold', s: { b: true } },
  { id: 'custom', label: 'Custom...', s: null },
];
export const CF_TYPES = [
  ['Highlight cells', [['cell', 'Cell value...'], ['text', 'Text...'], ['date', 'Date...'], ['blank', 'Is empty'], ['notBlank', 'Is not empty'], ['error', 'Has an error'], ['dup', 'Duplicate values'], ['unique', 'Unique values'], ['top', 'Top N'], ['bottom', 'Bottom N'], ['avg', 'Above / below average'], ['formula', 'Custom formula']]],
  ['Visual scales', [['scale', 'Colour scale'], ['bar', 'Data bars'], ['icons', 'Icon set']]],
];
const CF_OPS = { gt: 'is greater than', lt: 'is less than', ge: 'is greater than or equal to', le: 'is less than or equal to', eq: 'is equal to', ne: 'is not equal to', between: 'is between', notBetween: 'is not between' };

export function describeRule(r) {
  const t = r.type;
  if (t === 'cell') return `Value ${CF_OPS[r.op] || r.op} ${r.v1}${r.op === 'between' || r.op === 'notBetween' ? ' and ' + r.v2 : ''}`;
  if (t === 'text') return `Text ${({ contains: 'contains', notContains: 'does not contain', begins: 'begins with', ends: 'ends with' })[r.op]} "${r.text}"`;
  if (t === 'date') return `Date is ${({ today: 'today', yesterday: 'yesterday', tomorrow: 'tomorrow', last7: 'in the last 7 days', future: 'in the future', past: 'in the past' })[r.op]}`;
  if (t === 'blank') return 'Is empty'; if (t === 'notBlank') return 'Is not empty'; if (t === 'error') return 'Has an error'; if (t === 'noError') return 'Has no error';
  if (t === 'dup') return 'Duplicate values'; if (t === 'unique') return 'Unique values';
  if (t === 'top') return `Top ${r.n}${r.pct ? '%' : ''}`; if (t === 'bottom') return `Bottom ${r.n}${r.pct ? '%' : ''}`;
  if (t === 'avg') return `${({ above: 'Above', below: 'Below', aboveEq: 'At or above', belowEq: 'At or below' })[r.op]} average`;
  if (t === 'formula') return `Formula ${r.f}`;
  if (t === 'scale') return `${r.stops.length}-colour scale`;
  if (t === 'bar') return 'Data bars'; if (t === 'icons') return `Icons: ${r.set}`;
  return t;
}

export function CFRuleForm({ initial, defaultRanges, close }) {
  const [rule, setRule] = useState(() => initial || { type: 'cell', op: 'gt', v1: '0', style: STYLE_PRESETS[0].s });
  const [rangesText, setRangesText] = useState((initial ? initial.ranges : defaultRanges).map(rangeText).join(', '));
  const [preset, setPreset] = useState(() => { const f = STYLE_PRESETS.find((p) => p.s && JSON.stringify(p.s) === JSON.stringify(rule.style)); return f ? f.id : 'custom'; });
  const [err, setErr] = useState('');
  const set = (p) => setRule((r) => ({ ...r, ...p }));
  const setType = (type) => {
    const base = { type, style: rule.style || STYLE_PRESETS[0].s };
    if (type === 'cell') Object.assign(base, { op: 'gt', v1: '0' });
    if (type === 'text') Object.assign(base, { op: 'contains', text: '' });
    if (type === 'date') Object.assign(base, { op: 'today' });
    if (type === 'top' || type === 'bottom') Object.assign(base, { n: 10, pct: false });
    if (type === 'avg') Object.assign(base, { op: 'above' });
    if (type === 'formula') Object.assign(base, { f: '=A1>0' });
    if (type === 'scale') Object.assign(base, { stops: [{ type: 'min', color: '#f8696b' }, { type: 'percentile', v: 50, color: '#ffeb84' }, { type: 'max', color: '#63be7b' }] });
    if (type === 'bar') Object.assign(base, { color: '#638ec6', negColor: '#e06666' });
    if (type === 'icons') Object.assign(base, { set: 'arrows3' });
    setRule(base);
  };
  const usesStyle = !['scale', 'bar', 'icons'].includes(rule.type);
  const style = rule.style || {};
  const setStyle = (p) => { const s = { ...style, ...p }; Object.keys(s).forEach((k) => (s[k] === undefined || s[k] === false) && delete s[k]); set({ style: s }); };
  const submit = () => {
    const parts = rangesText.split(',').map((x) => x.trim()).filter(Boolean).map((x) => parseRange(x.replace(/^.*!/, '')));
    if (!parts.length || parts.some((p) => !p)) { setErr('Enter the cells to format, for example A1:C20.'); return; }
    if (rule.type === 'formula' && !String(rule.f || '').trim()) { setErr('Enter a formula.'); return; }
    if (usesStyle && !Object.keys(style).length) { setErr('Pick a format to apply.'); return; }
    close({ ...rule, ranges: parts });
  };
  return (
    <form className="cfform" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="field"><label htmlFor="cfr">Apply to range</label><input id="cfr" type="text" value={rangesText} onChange={(e) => setRangesText(e.target.value)} spellCheck={false} /></div>
      <div className="field"><label htmlFor="cft">Format cells if...</label>
        <select id="cft" value={rule.type} onChange={(e) => setType(e.target.value)}>
          {CF_TYPES.map(([g, items]) => <optgroup key={g} label={g}>{items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}
        </select>
      </div>
      {rule.type === 'cell' && (
        <div className="cf-inline">
          <select aria-label="Condition" value={rule.op} onChange={(e) => set({ op: e.target.value })}>{Object.entries(CF_OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input aria-label="Value" type="text" value={rule.v1 ?? ''} onChange={(e) => set({ v1: e.target.value })} />
          {(rule.op === 'between' || rule.op === 'notBetween') && <><span>and</span><input aria-label="Second value" type="text" value={rule.v2 ?? ''} onChange={(e) => set({ v2: e.target.value })} /></>}
        </div>
      )}
      {rule.type === 'text' && (
        <div className="cf-inline">
          <select aria-label="Condition" value={rule.op} onChange={(e) => set({ op: e.target.value })}><option value="contains">contains</option><option value="notContains">does not contain</option><option value="begins">begins with</option><option value="ends">ends with</option></select>
          <input aria-label="Text" type="text" value={rule.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
        </div>
      )}
      {rule.type === 'date' && <select aria-label="Date condition" value={rule.op} onChange={(e) => set({ op: e.target.value })}>{[['today', 'Today'], ['yesterday', 'Yesterday'], ['tomorrow', 'Tomorrow'], ['last7', 'In the last 7 days'], ['future', 'In the future'], ['past', 'In the past']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
      {(rule.type === 'top' || rule.type === 'bottom') && (
        <div className="cf-inline"><input aria-label="Count" type="number" min="1" value={rule.n} onChange={(e) => set({ n: Math.max(1, Number(e.target.value) || 1) })} /><Check checked={rule.pct} onChange={(v) => set({ pct: v })}>percent</Check></div>
      )}
      {rule.type === 'avg' && <select aria-label="Average condition" value={rule.op} onChange={(e) => set({ op: e.target.value })}><option value="above">Above average</option><option value="below">Below average</option><option value="aboveEq">At or above average</option><option value="belowEq">At or below average</option></select>}
      {rule.type === 'formula' && <div className="field"><label htmlFor="cff">Formula (written for the first cell)</label><input id="cff" type="text" value={rule.f} onChange={(e) => set({ f: e.target.value })} spellCheck={false} /><small>Example: =$B1&gt;100 or =MOD(ROW(),2)=0</small></div>}
      {rule.type === 'scale' && (
        <div className="cf-stops">
          {rule.stops.map((s, i) => (
            <div className="cf-inline" key={i}>
              <span>{['Min', 'Mid', 'Max'][rule.stops.length === 2 ? (i ? 2 : 0) : i]}</span>
              <select aria-label="Stop type" value={s.type} onChange={(e) => set({ stops: rule.stops.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}><option value="min">Lowest value</option><option value="max">Highest value</option><option value="num">Number</option><option value="pct">Percent</option><option value="percentile">Percentile</option></select>
              {['num', 'pct', 'percentile'].includes(s.type) && <input aria-label="Stop value" type="number" value={s.v ?? 0} onChange={(e) => set({ stops: rule.stops.map((x, j) => (j === i ? { ...x, v: Number(e.target.value) } : x)) })} />}
              <Color label="Stop colour" value={s.color} onChange={(v) => set({ stops: rule.stops.map((x, j) => (j === i ? { ...x, color: v } : x)) })} />
            </div>
          ))}
          <button type="button" className="btn sm ghost" onClick={() => set({ stops: rule.stops.length === 3 ? [rule.stops[0], rule.stops[2]] : [rule.stops[0], { type: 'percentile', v: 50, color: '#ffeb84' }, rule.stops[1]] })}>{rule.stops.length === 3 ? 'Use 2 colours' : 'Use 3 colours'}</button>
        </div>
      )}
      {rule.type === 'bar' && <div className="cf-inline"><span>Positive</span><Color label="Bar colour" value={rule.color} onChange={(v) => set({ color: v })} /><span>Negative</span><Color label="Negative bar colour" value={rule.negColor} onChange={(v) => set({ negColor: v })} /></div>}
      {rule.type === 'icons' && (
        <div className="cf-inline">
          <select aria-label="Icon set" value={rule.set} onChange={(e) => set({ set: e.target.value })}>{Object.keys(ICON_SETS).map((k) => <option key={k} value={k}>{ICON_SETS[k].join(' ')}</option>)}</select>
          <Check checked={rule.reverse} onChange={(v) => set({ reverse: v })}>reverse</Check>
          <Check checked={rule.iconOnly} onChange={(v) => set({ iconOnly: v })}>icon only</Check>
        </div>
      )}
      {usesStyle && (
        <fieldset className="cf-style">
          <legend>Format</legend>
          <select aria-label="Format preset" value={preset} onChange={(e) => { setPreset(e.target.value); const p = STYLE_PRESETS.find((x) => x.id === e.target.value); if (p && p.s) set({ style: p.s }); }}>{STYLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          <div className="cf-inline">
            <span>Fill</span><Color label="Fill colour" value={style.bg} onChange={(v) => { setPreset('custom'); setStyle({ bg: v }); }} />
            <span>Text</span><Color label="Text colour" value={style.fc || '#000000'} onChange={(v) => { setPreset('custom'); setStyle({ fc: v }); }} />
            <Check checked={style.b} onChange={(v) => { setPreset('custom'); setStyle({ b: v }); }}>Bold</Check>
            <Check checked={style.i} onChange={(v) => { setPreset('custom'); setStyle({ i: v }); }}>Italic</Check>
            <Check checked={style.st} onChange={(v) => { setPreset('custom'); setStyle({ st: v }); }}>Strike</Check>
          </div>
          <div className="cf-sample" style={{ background: style.bg, color: style.fc, fontWeight: style.b ? 700 : 400, fontStyle: style.i ? 'italic' : 'normal', textDecoration: style.st ? 'line-through' : 'none' }}>Sample text 123</div>
        </fieldset>
      )}
      <Check checked={rule.stop} onChange={(v) => set({ stop: v })}>Stop if true (skip lower rules)</Check>
      {err && <p className="field-error" role="alert">{err}</p>}
      <div className="modal-foot"><button type="button" className="btn ghost" onClick={() => close(null)}>Cancel</button><button type="submit" className="btn primary">Done</button></div>
    </form>
  );
}

export function CFPanel({ sh, onAdd, onEdit, onDelete, onMove, onClear, onClose }) {
  const rules = sh.cf || [];
  return (
    <aside className="sidepanel sp" aria-label="Conditional formatting">
      <h3>Conditional formatting <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={14} /></button></h3>
      <button className="btn sm primary" onClick={onAdd}><Icon name="plus" size={13} /> Add a rule</button>
      <ul className="sp-list">
        {rules.map((r, i) => (
          <li key={r.id || i} className="sp-card">
            <button className="sp-card-main" onClick={() => onEdit(i)} aria-label={`Edit rule: ${describeRule(r)}`}>
              <span className="cf-swatch" style={r.style ? { background: r.style.bg || '#fff', color: r.style.fc || '#222', fontWeight: r.style.b ? 700 : 400 } : { background: 'linear-gradient(90deg,#f8696b,#ffeb84,#63be7b)' }}>Aa</span>
              <span><b>{describeRule(r)}</b><small>{r.ranges.map(rangeLabel).join(', ')}</small></span>
            </button>
            <span className="sp-card-btns">
              <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => onMove(i, -1)}><Icon name="chevronUp" size={13} /></button>
              <button className="icon-btn" aria-label="Move down" disabled={i === rules.length - 1} onClick={() => onMove(i, 1)}><Icon name="chevronDown" size={13} /></button>
              <button className="icon-btn" aria-label="Delete rule" onClick={() => onDelete(i)}><Icon name="trash" size={13} /></button>
            </span>
          </li>
        ))}
        {!rules.length && <li className="muted small">No rules. Select cells and add a rule to highlight values, add colour scales, data bars or icons.</li>}
      </ul>
      {rules.length > 0 && <button className="btn sm ghost" onClick={onClear}>Remove all rules</button>}
    </aside>
  );
}

/* =============== Filter popover =============== */
export function FilterPop({ rect, col, values, state, onApply, onSort, onClose }) {
  const ref = useRef(null);
  const [hide, setHide] = useState(new Set(state.hide || []));
  const [cond, setCond] = useState(state.cond || { op: '', v: '', v2: '' });
  const [q, setQ] = useState('');
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down, true); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); };
  }, [onClose]);
  const shown = values.filter((v) => !q || v.text.toLowerCase().includes(q.toLowerCase()));
  const left = Math.min(rect.left, window.innerWidth - 270); const top = Math.min(rect.bottom + 2, window.innerHeight - 440);
  const needsV = cond.op && !['blank', 'notBlank'].includes(cond.op);
  return (
    <div className="filterpop panel" ref={ref} style={{ left: Math.max(4, left), top: Math.max(4, top) }} role="dialog" aria-label={`Filter column ${colName(col)}`}>
      <button className="mrow" onClick={() => onSort(false)}><span className="mlabel">Sort A to Z</span></button>
      <button className="mrow" onClick={() => onSort(true)}><span className="mlabel">Sort Z to A</span></button>
      <div className="msep" />
      <div className="fp-cond">
        <select aria-label="Filter by condition" value={cond.op} onChange={(e) => setCond({ ...cond, op: e.target.value })}>
          <option value="">Filter by condition: none</option>
          {[['blank', 'Is empty'], ['notBlank', 'Is not empty'], ['contains', 'Text contains'], ['notContains', 'Text does not contain'], ['begins', 'Text starts with'], ['ends', 'Text ends with'], ['eq', 'Is equal to'], ['ne', 'Is not equal to'], ['gt', 'Greater than'], ['ge', 'Greater than or equal'], ['lt', 'Less than'], ['le', 'Less than or equal'], ['between', 'Is between']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {needsV && <input type="text" aria-label="Condition value" value={cond.v} onChange={(e) => setCond({ ...cond, v: e.target.value })} />}
        {cond.op === 'between' && <input type="text" aria-label="Condition second value" value={cond.v2} onChange={(e) => setCond({ ...cond, v2: e.target.value })} />}
      </div>
      <div className="msep" />
      <input className="sp-in" type="search" placeholder="Search values" aria-label="Search values" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="fp-actions">
        <button className="btn sm ghost" onClick={() => setHide(new Set())}>Select all</button>
        <button className="btn sm ghost" onClick={() => setHide(new Set(values.map((v) => v.text)))}>Clear</button>
      </div>
      <ul className="fp-values" aria-label="Values">
        {shown.map((v) => (
          <li key={v.text}><label><input type="checkbox" checked={!hide.has(v.text)} onChange={(e) => { const n = new Set(hide); if (e.target.checked) n.delete(v.text); else n.add(v.text); setHide(n); }} /> <span>{v.text === '' ? '(Blanks)' : v.text}</span> <small>{v.n}</small></label></li>
        ))}
        {!shown.length && <li className="muted small pad">No values</li>}
      </ul>
      <div className="modal-foot"><button className="btn sm ghost" onClick={onClose}>Cancel</button><button className="btn sm primary" onClick={() => onApply({ hide: [...hide], cond: cond.op ? cond : null })}>OK</button></div>
    </div>
  );
}
