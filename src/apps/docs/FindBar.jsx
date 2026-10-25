import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { buildRegExp, findMatches, setHighlights } from './dom.js';

/* Find & replace bar for the contentEditable page. */
export default function FindBar({ getRoot, version, replaceMode, onClose, onChanged, initial = '' }) {
  const [q, setQ] = useState(initial);
  const [rep, setRep] = useState('');
  const [opts, setOpts] = useState({ matchCase: false, whole: false, regex: false });
  const [showRep, setShowRep] = useState(!!replaceMode);
  const [idx, setIdx] = useState(0);
  const [count, setCount] = useState(0);
  const matches = useRef([]);
  const input = useRef(null);

  useEffect(() => { setShowRep(!!replaceMode); }, [replaceMode]);
  useEffect(() => { input.current && (input.current.focus(), input.current.select()); }, []);

  const goto = useCallback((i, list = matches.current) => {
    if (!list.length) { setHighlights([], null); return; }
    const k = ((i % list.length) + list.length) % list.length;
    setIdx(k);
    setHighlights(list, list[k]);
    const r = list[k];
    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, []);

  // Re-run the search whenever the query, options or document changes
  useEffect(() => {
    const root = getRoot();
    if (!root) return;
    const list = q ? findMatches(root, q, opts) : [];
    matches.current = list;
    setCount(list.length);
    const keep = Math.min(idx, Math.max(0, list.length - 1));
    if (list.length) { setIdx(keep); setHighlights(list, list[keep]); } else { setIdx(0); setHighlights([], null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, opts, version]);

  useEffect(() => () => setHighlights([], null), []);

  const replacement = (range) => {
    if (!opts.regex) return rep;
    const re = buildRegExp(q, opts);
    if (!re) return rep;
    return range.toString().replace(new RegExp(re.source, re.flags.replace('g', '')), rep);
  };

  const replaceOne = () => {
    const r = matches.current[idx];
    if (!r) return;
    const root = getRoot();
    root.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand('insertText', false, replacement(r));
    onChanged();
  };

  const replaceAll = () => {
    const root = getRoot();
    const list = [...matches.current];
    if (!list.length) return;
    root.focus();
    const sel = window.getSelection();
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      const text = replacement(r);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('insertText', false, text);
    }
    onChanged();
  };

  const key = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goto(idx + (e.shiftKey ? -1 : 1)); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const tog = (k, label, title) => (
    <button type="button" className={'fb-opt' + (opts[k] ? ' on' : '')} title={title} aria-pressed={opts[k]} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}>{label}</button>
  );
  const bad = opts.regex && q && !buildRegExp(q, opts);

  return (
    <div className="findbar no-print" role="search">
      <div className="fb-row">
        <button type="button" className="icon-btn" title={showRep ? 'Hide replace' : 'Show replace'} aria-label="Toggle replace" onClick={() => setShowRep((s) => !s)}>
          <Icon name={showRep ? 'chevronDown' : 'chevronRight'} size={14} />
        </button>
        <input ref={input} className={'fb-in' + (bad ? ' bad' : '')} placeholder="Find" aria-label="Find" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} />
        <span className="fb-count" aria-live="polite">{q ? (count ? `${idx + 1} of ${count}` : bad ? 'Bad pattern' : 'No results') : ''}</span>
        {tog('matchCase', 'Aa', 'Match case')}
        {tog('whole', 'ab', 'Whole word')}
        {tog('regex', '.*', 'Regular expression')}
        <button type="button" className="icon-btn" title="Previous (Shift+Enter)" aria-label="Previous match" onClick={() => goto(idx - 1)}><Icon name="chevronUp" size={14} /></button>
        <button type="button" className="icon-btn" title="Next (Enter)" aria-label="Next match" onClick={() => goto(idx + 1)}><Icon name="chevronDown" size={14} /></button>
        <button type="button" className="icon-btn" title="Close (Esc)" aria-label="Close find" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      {showRep && (
        <div className="fb-row">
          <span className="icon-btn" style={{ visibility: 'hidden' }} />
          <input className="fb-in" placeholder="Replace with" aria-label="Replace with" value={rep} onChange={(e) => setRep(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } if (e.key === 'Escape') onClose(); }} />
          <button type="button" className="btn sm" disabled={!count} onClick={replaceOne}>Replace</button>
          <button type="button" className="btn sm" disabled={!count} onClick={replaceAll}>Replace all</button>
        </div>
      )}
    </div>
  );
}
