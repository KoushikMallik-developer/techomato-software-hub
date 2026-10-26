import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Pop, MenuRows, Modal, useToast, useAsk, Swatches } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { downloadFile, pickFile, readAsText, safeName } from '../lib/download.js';
import { uid, newCard, isDue, schedule, previews, level, endOfToday, dayKey, hasCloze, clozeFront, clozeBack, tokens, plain, sameAnswer, parseTable, csvEsc, SAMPLE } from './cards/srs.js';
import '../styles/cards.css';

const DECK_COLORS = ['#8e5ad7', '#2f8fdd', '#3aa676', '#e0568f', '#f2a93b', '#e5484d', '#18a2a2', '#5f6ad6'];
const DEF = { newPerDay: 20, maxReviews: 200, speak: false };
const mkDeck = (name, color, cards = []) => ({ id: uid(), name, color: color || DECK_COLORS[0], created: Date.now(), cards });
const blank = () => ({ decks: [], log: {}, set: DEF });
const migrate = (d) => ({ ...blank(), ...(d || {}), set: { ...DEF, ...((d && d.set) || {}) }, decks: Array.isArray(d && d.decks) ? d.decks : [] });
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const Rich = ({ text }) => <>{tokens(text).map((t, i) => (t.t === 'br' ? <br key={i} /> : t.t === 'b' ? <b key={i}>{t.v}</b> : t.t === 'code' ? <code key={i}>{t.v}</code> : t.t === 'blank' ? <span key={i} className="cd-blank">[{t.v}]</span> : t.t === 'ans' ? <span key={i} className="cd-ans">{t.v}</span> : t.t === 'img' ? <img key={i} src={t.src} alt={t.alt} className="cd-img" /> : <span key={i}>{t.v}</span>))}</>;
const sides = (c) => (c.type === 'cloze' || hasCloze(c.front) ? { q: clozeFront(c.front), a: clozeBack(c.front) + (c.back ? '\n' + c.back : '') } : { q: c.front, a: c.back });
const counts = (deck, set, log, now = Date.now()) => { const intro = (log[dayKey()] || {}).n || 0; const left = Math.max(0, set.newPerDay - intro); let nw = 0, lr = 0, du = 0; deck.cards.forEach((c) => { if (c.susp) return; if (c.state === 'new') nw++; else if (c.state === 'review') { if (c.due <= endOfToday(now)) du++; } else if (c.due <= now + 20 * 60000) lr++; }); return { new: Math.min(nw, left), learn: lr, due: Math.min(du, set.maxReviews), total: deck.cards.length, newAll: nw }; };

export default function CardsApp() {
  const [data, setData, meta] = useStore('cards', blank, migrate);
  const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk();
  const [view, setView] = useState('decks'); const [deckId, setDeckId] = useState(null); const [study, setStudy] = useState(null); const [dlg, setDlg] = useState(null); const [edit, setEdit] = useState(null); const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const deck = data.decks.find((d) => d.id === deckId) || null;
  const upDeck = (id, fn) => setData((d) => ({ ...d, decks: d.decks.map((x) => (x.id === id ? fn(x) : x)) }));
  const upCard = (did, cid, p) => upDeck(did, (x) => ({ ...x, cards: x.cards.map((c) => (c.id === cid ? { ...c, ...p } : c)) }));

  /* ---------- decks ---------- */
  const addDeck = async () => { const n = await ask({ kind: 'prompt', title: 'New deck', value: '', okText: 'Create', placeholder: 'For example: Spanish verbs' }); if (!n || !n.trim()) return; const d = mkDeck(n.trim(), DECK_COLORS[data.decks.length % DECK_COLORS.length]); setData((x) => ({ ...x, decks: [...x.decks, d] })); setDeckId(d.id); setView('deck'); };
  const addSample = () => { const d = mkDeck('World capitals', '#2f8fdd', [...SAMPLE.map(([a, b]) => newCard('Capital of ' + a + '?', b)), newCard('The capital of {{c1::Italy}} is {{c2::Rome}}.', '', 'cloze')]); setData((x) => ({ ...x, decks: [...x.decks, d] })); toast('Added a sample deck'); };
  const renameDeck = async (d) => { const n = await ask({ kind: 'prompt', title: 'Rename deck', value: d.name, okText: 'Rename' }); if (n && n.trim()) upDeck(d.id, (x) => ({ ...x, name: n.trim() })); };
  const delDeck = async (d) => { if (!(await ask({ kind: 'confirm', title: 'Delete deck', message: `Delete "${d.name}" and its ${d.cards.length} cards?`, okText: 'Delete', danger: true }))) return; setData((x) => ({ ...x, decks: x.decks.filter((y) => y.id !== d.id) })); if (deckId === d.id) { setView('decks'); setDeckId(null); } };
  const resetDeck = async (d) => { if (!(await ask({ kind: 'confirm', title: 'Reset progress', message: 'All cards go back to new. Your cards are kept.', okText: 'Reset', danger: true }))) return; upDeck(d.id, (x) => ({ ...x, cards: x.cards.map((c) => ({ ...newCard(c.front, c.back, c.type), id: c.id, tags: c.tags, created: c.created })) })); toast('Progress reset'); };
  const deckMenu = (d) => [{ label: 'Rename…', onClick: () => renameDeck(d) }, { label: 'Export as CSV', onClick: () => downloadFile(safeName(d.name) + '.csv', 'front,back\n' + d.cards.map((c) => csvEsc(c.front) + ',' + csvEsc(c.back)).join('\n'), 'text/csv') }, { label: 'Export with progress (.json)', onClick: () => downloadFile(safeName(d.name) + '.json', JSON.stringify({ kind: 'techomato-deck', deck: d }), 'application/json') }, { label: 'Reset progress…', onClick: () => resetDeck(d) }, { sep: true }, { label: 'Delete…', onClick: () => delDeck(d) }];
  const importFile = async (into) => { const f = await pickFile('.csv,.tsv,.txt,.json,text/plain'); if (!f) return; const t = await readAsText(f); try { if (/\.json$/i.test(f.name)) { const o = JSON.parse(t); if (o.kind !== 'techomato-deck') throw new Error('x'); const d = { ...o.deck, id: uid() }; setData((x) => ({ ...x, decks: [...x.decks, d] })); toast(`Imported "${d.name}"`); return; } const rows = parseTable(t); if (!rows.length) { toast('No cards found. Use two columns: front and back.'); return; } const cards = rows.map(([a, b]) => newCard(a, b)); if (into) { upDeck(into.id, (x) => ({ ...x, cards: [...x.cards, ...cards] })); toast(`Added ${cards.length} cards`); } else { const d = mkDeck(f.name.replace(/\.[^.]+$/, ''), DECK_COLORS[data.decks.length % DECK_COLORS.length], cards); setData((x) => ({ ...x, decks: [...x.decks, d] })); toast(`Imported ${cards.length} cards into a new deck`); } } catch { toast('Could not read that file'); } };

  /* ---------- study ---------- */
  const startStudy = (d, mode) => {
    const nowT = Date.now(); const c = counts(d, data.set, data.log, nowT); let ids;
    if (mode === 'srs') { const ls = d.cards.filter((x) => !x.susp && x.state !== 'new' && x.state !== 'review' && x.due <= nowT + 20 * 60000); const rv = shuffle(d.cards.filter((x) => !x.susp && x.state === 'review' && x.due <= endOfToday(nowT))).slice(0, data.set.maxReviews); const nw = d.cards.filter((x) => !x.susp && x.state === 'new').slice(0, c.new); ids = [...shuffle([...ls, ...rv]), ...nw].map((x) => x.id); if (!ids.length) { toast('Nothing to study right now. Come back later, or try Cram.'); return; } }
    else if (mode === 'cram') { ids = shuffle(d.cards.filter((x) => !x.susp)).map((x) => x.id); if (!ids.length) { toast('This deck has no cards yet'); return; } }
    else { const cards = d.cards.filter((x) => !x.susp && !(x.type === 'cloze' || hasCloze(x.front))); if (cards.length < 4) { toast('Quiz needs at least 4 normal (non-cloze) cards'); return; } ids = shuffle(cards).map((x) => x.id); }
    setStudy({ deckId: d.id, mode, queue: ids, total: ids.length, shown: false, typed: '', done: 0, again: 0, good: 0, hist: [], t0: Date.now(), opts: null, pick: null, wrong: [], typeMode: false, finished: false });
  };
  const cur = study && !study.finished ? (data.decks.find((d) => d.id === study.deckId) || { cards: [] }).cards.find((c) => c.id === study.queue[0]) : null;
  const quizOpts = useMemo(() => { if (!study || study.mode !== 'quiz' || !cur) return []; const d = data.decks.find((x) => x.id === study.deckId); const others = shuffle(d.cards.filter((c) => c.id !== cur.id && !(c.type === 'cloze' || hasCloze(c.front)) && plain(c.back) !== plain(cur.back))).slice(0, 3); return shuffle([cur, ...others].map((c) => ({ id: c.id, text: c.back }))); /* eslint-disable-next-line */ }, [study && study.queue[0], study && study.mode]);
  const speak = (text) => { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(plain(text))); } catch { /* ignore */ } };
  useEffect(() => { if (cur && study && data.set.speak && study.mode !== 'quiz') speak(sides(cur).q); /* eslint-disable-next-line */ }, [cur && cur.id]);

  const reveal = () => setStudy((s) => (s && !s.shown ? { ...s, shown: true } : s));
  const logDay = (log, p) => { const k = dayKey(); const l = log[k] || { r: 0, c: 0, n: 0, rv: 0, rc: 0 }; return { ...log, [k]: { r: l.r + 1, c: l.c + (p.good ? 1 : 0), n: l.n + (p.isNew ? 1 : 0), rv: l.rv + (p.isRev ? 1 : 0), rc: l.rc + (p.isRev && p.good ? 1 : 0) } }; };
  const rate = (rating) => {
    if (!study || !cur) return; const nowT = Date.now(); const good = rating >= 3; const prev = cur;
    if (study.mode === 'srs') {
      const next = schedule(cur, rating, nowT); setData((d) => ({ ...d, decks: d.decks.map((x) => (x.id === study.deckId ? { ...x, cards: x.cards.map((c) => (c.id === cur.id ? next : c)) } : x)), log: logDay(d.log, { good, isNew: cur.state === 'new', isRev: cur.state === 'review' }) }));
      setStudy((s) => { let q = s.queue.slice(1); const again = next.state !== 'review' && next.due <= nowT + 20 * 60000; if (again) { const pos = Math.min(q.length, rating === 1 ? 3 : 6); q.splice(pos, 0, cur.id); } return { ...s, queue: q, shown: false, typed: '', done: s.done + (again ? 0 : 1), again: s.again + (rating === 1 ? 1 : 0), good: s.good + (good ? 1 : 0), hist: [...s.hist, { card: prev, log: { good, isNew: prev.state === 'new', isRev: prev.state === 'review' }, qlen: s.queue.length }], finished: q.length === 0 }; });
    } else {
      setStudy((s) => { let q = s.queue.slice(1); if (!good) q.splice(Math.min(q.length, 4), 0, cur.id); return { ...s, queue: q, shown: false, typed: '', done: s.done + (good ? 1 : 0), again: s.again + (good ? 0 : 1), good: s.good + (good ? 1 : 0), finished: q.length === 0 }; });
    }
  };
  const answerQuiz = (id) => { if (!study || study.pick) return; const ok = id === cur.id; setStudy((s) => ({ ...s, pick: id, good: s.good + (ok ? 1 : 0), again: s.again + (ok ? 0 : 1), wrong: ok ? s.wrong : [...s.wrong, cur.id] })); };
  const nextQuiz = () => setStudy((s) => { const q = s.queue.slice(1); return { ...s, queue: q, pick: null, done: s.done + 1, finished: q.length === 0 }; });
  const undo = () => { if (!study || study.mode !== 'srs' || !study.hist.length) return; const h = study.hist[study.hist.length - 1]; setData((d) => ({ ...d, decks: d.decks.map((x) => (x.id === study.deckId ? { ...x, cards: x.cards.map((c) => (c.id === h.card.id ? h.card : c)) } : x)), log: (() => { const k = dayKey(); const l = d.log[k]; if (!l) return d.log; return { ...d.log, [k]: { r: Math.max(0, l.r - 1), c: Math.max(0, l.c - (h.log.good ? 1 : 0)), n: Math.max(0, l.n - (h.log.isNew ? 1 : 0)), rv: Math.max(0, l.rv - (h.log.isRev ? 1 : 0)), rc: Math.max(0, l.rc - (h.log.isRev && h.log.good ? 1 : 0)) } }; })() })); setStudy((s) => ({ ...s, queue: [h.card.id, ...s.queue.filter((i) => i !== h.card.id)], shown: false, hist: s.hist.slice(0, -1), finished: false, good: s.good - (h.log.good ? 1 : 0), again: s.again - (h.log.good ? 0 : 1), done: Math.max(0, s.done - 1) })); };
  const suspendCur = () => { if (!cur) return; upCard(study.deckId, cur.id, { susp: true }); setStudy((s) => { const q = s.queue.slice(1); return { ...s, queue: q, shown: false, finished: q.length === 0 }; }); toast('Card suspended. Unsuspend it in the deck.'); };

  useEffect(() => {
    if (!study) return undefined;
    const k = (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.key !== 'Escape') { if (e.key === 'Enter' && e.target.dataset.typed && !study.shown) { e.preventDefault(); reveal(); } return; } if (dlg || edit) return;
      if (e.key === 'Escape') { setStudy(null); return; }
      if (study.finished) return;
      if (study.mode === 'quiz') { if (/^[1-4]$/.test(e.key) && !study.pick && quizOpts[+e.key - 1]) answerQuiz(quizOpts[+e.key - 1].id); else if ((e.key === ' ' || e.key === 'Enter') && study.pick) { e.preventDefault(); nextQuiz(); } return; }
      if (!study.shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); } else if (study.shown) { if (study.mode === 'cram') { if (e.key === '1' || e.key === 'ArrowLeft') rate(1); else if (e.key === '3' || e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); rate(3); } } else if (/^[1-4]$/.test(e.key)) rate(+e.key); else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rate(3); } }
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); } else if (e.key.toLowerCase() === 'e' && cur && !e.ctrlKey) { setEdit({ did: study.deckId, card: cur }); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  /* ---------- stats ---------- */
  const allCards = data.decks.flatMap((d) => d.cards); const lv = { new: 0, learning: 0, young: 0, mature: 0 }; allCards.forEach((c) => { lv[level(c)]++; });
  const streak = (() => { let s = 0; let t = Date.now(); if (!(data.log[dayKey(t)] || {}).r) t -= 86400000; while ((data.log[dayKey(t)] || {}).r) { s++; t -= 86400000; } return s; })();
  const ret = (() => { let rv = 0, rc = 0; for (let i = 0; i < 30; i++) { const l = data.log[dayKey(Date.now() - i * 86400000)]; if (l) { rv += l.rv; rc += l.rc; } } return rv ? Math.round((rc / rv) * 100) : null; })();
  const forecast = Array.from({ length: 7 }, (_, i) => { const a = endOfToday(Date.now() + i * 86400000) - 86399999, b = endOfToday(Date.now() + i * 86400000); return allCards.filter((c) => !c.susp && c.state === 'review' && (i === 0 ? c.due <= b : c.due >= a && c.due <= b)).length; });
  const heat = Array.from({ length: 91 }, (_, i) => { const t = Date.now() - (90 - i) * 86400000; return { k: dayKey(t), r: (data.log[dayKey(t)] || {}).r || 0, d: new Date(t) }; });
  const maxH = Math.max(1, ...heat.map((h) => h.r)); const todayR = (data.log[dayKey()] || {}).r || 0;

  /* ---------- render ---------- */
  const sdeck = study ? data.decks.find((d) => d.id === study.deckId) : null;
  const elapsed = study ? Math.round((Date.now() - study.t0) / 1000) : 0;
  return (
    <div className="fx cd-cards" style={{ '--brand': '#5f2fa8', '--brand-h': '#4a2385', '--brand-soft': '#efe8fb' }} data-app="cards">
      <AppBar id="cards" name="Techomato Flashcards" status={meta.status === 'error' ? 'error' : undefined} backup={{ name: 'cards', get: () => data, set: (d) => meta.replace(migrate(d)), blank }}
        extraMenu={[{ label: 'Import deck from file…', onClick: () => importFile(null) }, { label: 'Study settings', onClick: () => setDlg('settings') }]} />
      {!study && (
        <div className="fx-tabs cd-tabs" role="tablist">
          <button role="tab" aria-selected={view !== 'stats'} className={view !== 'stats' ? 'on' : ''} onClick={() => setView(deck ? 'deck' : 'decks')}>Decks</button>
          <button role="tab" aria-selected={view === 'stats'} className={view === 'stats' ? 'on' : ''} onClick={() => setView('stats')}>Progress</button>
          <div className="spacer" />{streak > 0 && <span className="cd-streak" title="Days in a row with reviews">🔥 {streak} day{streak > 1 ? 's' : ''}</span>}
        </div>
      )}
      {!study && view === 'decks' && (
        <div className="cd-main">
          <div className="cd-head"><h2>Your decks</h2><div className="spacer" /><button className="fb" onClick={() => importFile(null)}>Import</button><button className="fb pri" onClick={addDeck}><Icon name="plus" size={14} /> New deck</button></div>
          {!data.decks.length ? (
            <div className="fx-empty cd-empty"><div className="cd-big"><Icon name="layout" size={36} /></div><h2>Learn anything, remember it</h2><p>Make a deck of cards. Flashcards reappear just before you would forget them, so you spend time on what you do not know yet.</p><div className="cd-cta"><button className="fb pri lg" onClick={addDeck}>Create a deck</button><button className="fb lg" onClick={addSample}>Try a sample deck</button><button className="fb lg" onClick={() => importFile(null)}>Import a file</button></div></div>
          ) : (
            <div className="cd-grid">{data.decks.map((d) => { const c = counts(d, data.set, data.log, now); const L = { new: 0, learning: 0, young: 0, mature: 0 }; d.cards.forEach((x) => { L[level(x)]++; }); const tot = Math.max(1, d.cards.length); const todo = c.new + c.learn + c.due;
              return (
                <article key={d.id} className="cd-deck" style={{ '--dc': d.color }}>
                  <div className="cd-dtop"><button className="cd-dname" onClick={() => { setDeckId(d.id); setView('deck'); }} aria-label={'Open ' + d.name}>{d.name}</button><Pop align="right" trigger={({ toggle }) => <button className="fb sub ico sm" aria-label={'Options for ' + d.name} onClick={toggle}><Icon name="more" size={16} /></button>}>{({ close }) => <MenuRows close={close} items={deckMenu(d)} />}</Pop></div>
                  <div className="cd-cnt"><span className="n" title="New cards to learn today"><b>{c.new}</b> new</span><span className="l" title="Cards in learning"><b>{c.learn}</b> learning</span><span className="r" title="Reviews due"><b>{c.due}</b> due</span></div>
                  <div className="cd-bar" title={`${L.mature} mature, ${L.young} young, ${L.learning} learning, ${L.new} new`}><i className="mature" style={{ width: L.mature / tot * 100 + '%' }} /><i className="young" style={{ width: L.young / tot * 100 + '%' }} /><i className="learning" style={{ width: L.learning / tot * 100 + '%' }} /></div>
                  <div className="cd-dfoot"><small>{d.cards.length} card{d.cards.length === 1 ? '' : 's'}</small><div className="spacer" /><button className="fb sub sm" onClick={() => startStudy(d, 'cram')}>Cram</button><button className="fb sub sm" onClick={() => startStudy(d, 'quiz')}>Quiz</button><button className="fb pri sm" onClick={() => startStudy(d, 'srs')}>{todo ? `Study ${todo}` : 'Study'}</button></div>
                </article>); })}<button className="cd-adddeck" onClick={addDeck}><Icon name="plus" size={20} /> New deck</button></div>
          )}
        </div>
      )}
      {!study && view === 'deck' && deck && <DeckView deck={deck} counts={counts(deck, data.set, data.log, now)} onBack={() => { setView('decks'); setDeckId(null); }} upDeck={upDeck} onStudy={(m) => startStudy(deck, m)} onEdit={(c) => setEdit({ did: deck.id, card: c })} toast={toast} ask={ask} deckMenu={deckMenu(deck)} importInto={() => importFile(deck)} />}
      {!study && view === 'stats' && (
        <div className="cd-main">
          <div className="cd-head"><h2>Progress</h2></div>
          <div className="cd-kpis"><div><b>{todayR}</b><span>cards reviewed today</span></div><div><b>{streak}</b><span>day streak</span></div><div><b>{ret == null ? '–' : ret + '%'}</b><span>retention, 30 days</span></div><div><b>{allCards.length}</b><span>cards in total</span></div></div>
          <section className="cd-sec"><h3>Your cards</h3><div className="cd-bar big">{['mature', 'young', 'learning', 'new'].map((k) => <i key={k} className={k} style={{ width: (allCards.length ? lv[k] / allCards.length * 100 : 0) + '%' }} />)}</div><div className="cd-leg">{[['mature', 'Mature (21+ day interval)'], ['young', 'Young'], ['learning', 'Learning'], ['new', 'New']].map(([k, l]) => <span key={k}><i className={k} /> {l}: <b>{lv[k]}</b></span>)}</div></section>
          <section className="cd-sec"><h3>Reviews, last 13 weeks</h3><div className="cd-heat" role="img" aria-label="Review activity">{heat.map((h) => <i key={h.k} title={`${h.d.toLocaleDateString()}: ${h.r} review${h.r === 1 ? '' : 's'}`} style={{ '--a': h.r ? 0.25 + 0.75 * (h.r / maxH) : 0 }} className={h.r ? 'on' : ''} />)}</div></section>
          <section className="cd-sec"><h3>Reviews due, next 7 days</h3><div className="cd-fc">{forecast.map((n, i) => <div key={i}><div className="bar"><i style={{ height: Math.max(2, n / Math.max(1, ...forecast) * 100) + '%' }} /></div><b>{n}</b><span>{i === 0 ? 'Today' : new Date(Date.now() + i * 86400000).toLocaleDateString(undefined, { weekday: 'short' })}</span></div>)}</div></section>
        </div>
      )}
      {study && sdeck && (
        <div className="cd-study">
          <div className="cd-sbar"><button className="fb sub" onClick={() => setStudy(null)}><Icon name="chevronLeft" size={14} /> {sdeck.name}</button><span className="cd-mode">{{ srs: 'Study', cram: 'Cram', quiz: 'Quiz' }[study.mode]}</span><div className="spacer" />
            {!study.finished && study.mode !== 'quiz' && <><label className="cd-chk"><input type="checkbox" checked={study.typeMode} onChange={(e) => setStudy({ ...study, typeMode: e.target.checked })} /> Type answers</label><button className="fb sub sm" disabled={study.mode !== 'srs' || !study.hist.length} onClick={undo} title="Undo (Ctrl+Z)">Undo</button><button className="fb sub sm" onClick={() => cur && setEdit({ did: study.deckId, card: cur })} title="Edit (E)">Edit</button>{study.mode === 'srs' && <button className="fb sub sm" onClick={suspendCur}>Suspend</button>}</>}
          </div>
          <div className="cd-prog" role="progressbar" aria-valuenow={study.done} aria-valuemax={study.total}><i style={{ width: Math.min(100, study.done / Math.max(1, study.total) * 100) + '%' }} /></div>
          {study.finished ? (
            <div className="cd-done"><div className="cd-big">✓</div><h2>{study.mode === 'quiz' ? 'Quiz finished' : 'Session complete'}</h2>
              <div className="cd-kpis small"><div><b>{study.mode === 'quiz' ? `${study.good}/${study.total}` : study.total}</b><span>{study.mode === 'quiz' ? 'correct' : 'cards'}</span></div><div><b>{study.good + study.again ? Math.round(study.good / (study.good + study.again) * 100) : 0}%</b><span>{study.mode === 'quiz' ? 'score' : 'answered well'}</span></div><div><b>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</b><span>time</span></div></div>
              {study.mode === 'quiz' && study.wrong.length > 0 && <div className="cd-wrong"><h4>Review these</h4>{study.wrong.map((id) => { const c = sdeck.cards.find((x) => x.id === id); return c ? <div key={id}><b>{plain(c.front)}</b> <span>{plain(c.back)}</span></div> : null; })}</div>}
              <div className="cd-cta"><button className="fb pri lg" onClick={() => setStudy(null)}>Back to decks</button>{study.mode === 'quiz' && study.wrong.length >= 1 && <button className="fb lg" onClick={() => { const ids = study.wrong; setStudy({ ...study, queue: shuffle(ids), total: ids.length, done: 0, good: 0, again: 0, wrong: [], finished: false, pick: null, t0: Date.now() }); }}>Retry the {study.wrong.length} missed</button>}</div></div>
          ) : cur && (study.mode === 'quiz' ? (
            <div className="cd-stage"><div className="cd-count">{study.done + 1} of {study.total}</div><div className="cd-card"><div className="cd-face"><Rich text={sides(cur).q} /></div></div>
              <div className="cd-opts">{quizOpts.map((o, i) => <button key={o.id} className={'cd-opt' + (study.pick ? (o.id === cur.id ? ' ok' : o.id === study.pick ? ' bad' : ' dim') : '')} disabled={!!study.pick} onClick={() => answerQuiz(o.id)}><kbd>{i + 1}</kbd><span><Rich text={o.text} /></span></button>)}</div>
              {study.pick && <div className="cd-next"><span className={study.pick === cur.id ? 'good' : 'bad'}>{study.pick === cur.id ? 'Correct!' : 'Not quite'}</span><button className="fb pri" onClick={nextQuiz} autoFocus>{study.queue.length > 1 ? 'Next (Space)' : 'Finish'}</button></div>}</div>
          ) : (
            <div className="cd-stage">
              <div className="cd-count">{study.mode === 'srs' ? <><span className="n">{study.queue.filter((id) => (sdeck.cards.find((c) => c.id === id) || {}).state === 'new').length} new</span> · <span className="l">{study.queue.filter((id) => ['learn', 'relearn'].includes((sdeck.cards.find((c) => c.id === id) || {}).state)).length} learning</span> · <span className="r">{study.queue.filter((id) => (sdeck.cards.find((c) => c.id === id) || {}).state === 'review').length} review</span></> : `${study.queue.length} left`}</div>
              <div className={'cd-card' + (study.shown ? ' flipped' : '')} onClick={() => !study.shown && reveal()}>
                <button className="fb sub ico sm cd-spk" aria-label="Read aloud" onClick={(e) => { e.stopPropagation(); speak(study.shown ? sides(cur).a : sides(cur).q); }}>🔊</button>
                <div className="cd-face"><Rich text={sides(cur).q} /></div>
                {study.shown && <><hr /><div className="cd-face back"><Rich text={sides(cur).a} /></div></>}
              </div>
              {study.typeMode && !study.shown && <input className="fi cd-type" autoFocus data-typed="1" placeholder="Type your answer, then press Enter" aria-label="Your answer" value={study.typed} onChange={(e) => setStudy({ ...study, typed: e.target.value })} />}
              {study.typeMode && study.shown && study.typed && <div className={'cd-cmp ' + (sameAnswer(study.typed, sides(cur).a.replace(/\{\{ans:(.*?)\}\}/g, '$1')) || sameAnswer(study.typed, plain(cur.back)) ? 'good' : 'bad')}>You typed: <b>{study.typed}</b> {sameAnswer(study.typed, plain(cur.back)) || sameAnswer(study.typed, sides(cur).a.replace(/\{\{ans:(.*?)\}\}/g, '$1')) ? '✓ matches' : '✗ different'}</div>}
              <div className="cd-rate">
                {!study.shown ? <button className="fb pri lg cd-show" onClick={reveal}>Show answer <kbd>Space</kbd></button> : study.mode === 'cram' ? <><button className="fb lg cd-r1" onClick={() => rate(1)}>Still learning <kbd>1</kbd></button><button className="fb lg cd-r3" onClick={() => rate(3)}>Got it <kbd>3</kbd></button></> :
                  (() => { const pv = previews(cur); return [['Again', 1], ['Hard', 2], ['Good', 3], ['Easy', 4]].map(([l, r], i) => <button key={r} className={'fb lg cd-r' + r} onClick={() => rate(r)}><small>{pv[i]}</small>{l} <kbd>{r}</kbd></button>); })()}
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <CardEditor init={edit.card} onClose={() => setEdit(null)} onSave={(p) => { upCard(edit.did, edit.card.id, p); setEdit(null); toast('Card saved'); }} onDelete={async () => { if (await ask({ kind: 'confirm', title: 'Delete card', message: 'Delete this card?', okText: 'Delete', danger: true })) { upDeck(edit.did, (x) => ({ ...x, cards: x.cards.filter((c) => c.id !== edit.card.id) })); if (study) setStudy((s) => { const q = s.queue.filter((i) => i !== edit.card.id); return { ...s, queue: q, shown: false, finished: q.length === 0 }; }); setEdit(null); } }} />}
      {dlg === 'settings' && <Modal title="Study settings" onClose={() => setDlg(null)} width={420} footer={<button className="fb pri" onClick={() => setDlg(null)}>Done</button>}>
        <div className="fx-kv cd-kv"><label>New cards per day</label><input className="fi" type="number" min="0" max="500" aria-label="New cards per day" value={data.set.newPerDay} onChange={(e) => setData((d) => ({ ...d, set: { ...d.set, newPerDay: Math.max(0, +e.target.value || 0) } }))} /><label>Maximum reviews per day</label><input className="fi" type="number" min="0" max="5000" aria-label="Maximum reviews per day" value={data.set.maxReviews} onChange={(e) => setData((d) => ({ ...d, set: { ...d.set, maxReviews: Math.max(0, +e.target.value || 0) } }))} /></div>
        <label className="cd-chk" style={{ marginTop: 12 }}><input type="checkbox" checked={data.set.speak} onChange={(e) => setData((d) => ({ ...d, set: { ...d.set, speak: e.target.checked } }))} /> Read the question aloud when a card appears</label>
        <p className="muted" style={{ marginBottom: 0 }}>Cards are scheduled with a spaced-repetition method similar to SM-2: new cards go through short learning steps (1 and 10 minutes), then return after 1 day, and the gap grows each time you remember.</p></Modal>}
      {toastNode}{askNode}
    </div>
  );
}

function DeckView({ deck, counts: c, onBack, upDeck, onStudy, onEdit, toast, ask, deckMenu, importInto }) {
  const [q, setQ] = useState(''); const [filt, setFilt] = useState('all'); const [front, setFront] = useState(''); const [back, setBack] = useState(''); const [type, setType] = useState('basic'); const [bulk, setBulk] = useState(false); const [bulkText, setBulkText] = useState(''); const fr = useRef(null);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return deck.cards.filter((x) => (filt === 'all' ? true : filt === 'new' ? x.state === 'new' : filt === 'due' ? isDue(x) : filt === 'susp' ? x.susp : filt === 'learning' ? level(x) === 'learning' : level(x) === filt)).filter((x) => !s || (x.front + ' ' + x.back + ' ' + x.tags.join(' ')).toLowerCase().includes(s)); }, [deck.cards, q, filt]);
  const add = () => { if (!front.trim() || (type === 'basic' && !back.trim())) { toast(type === 'basic' ? 'Fill in both sides of the card' : 'Write the text with {{c1::hidden words}}'); return; } if (type === 'cloze' && !hasCloze(front)) { toast('Put the hidden words inside {{c1::…}}'); return; } upDeck(deck.id, (x) => ({ ...x, cards: [...x.cards, newCard(front.trim(), back.trim(), type)] })); setFront(''); setBack(''); fr.current && fr.current.focus(); };
  const addBulk = () => { const rows = parseTable(bulkText); if (!rows.length) { toast('No cards found. Put one card per line as: front ; back'); return; } upDeck(deck.id, (x) => ({ ...x, cards: [...x.cards, ...rows.map(([a, b]) => newCard(a, b))] })); setBulkText(''); setBulk(false); toast(`Added ${rows.length} cards`); };
  const toggleSusp = (cd) => upDeck(deck.id, (x) => ({ ...x, cards: x.cards.map((y) => (y.id === cd.id ? { ...y, susp: !y.susp } : y)) }));
  const due = (cd) => (cd.susp ? 'Suspended' : cd.state === 'new' ? 'New' : cd.due <= Date.now() ? 'Due now' : 'In ' + (cd.due - Date.now() < 36e5 ? Math.max(1, Math.round((cd.due - Date.now()) / 6e4)) + ' min' : cd.due - Date.now() < 864e5 ? Math.round((cd.due - Date.now()) / 36e5) + ' h' : Math.round((cd.due - Date.now()) / 864e5) + ' d'));
  return (
    <div className="cd-main">
      <div className="cd-head"><button className="fb sub" onClick={onBack}><Icon name="chevronLeft" size={14} /> Decks</button><h2 className="ellip">{deck.name}</h2><span className="cd-sw" style={{ background: deck.color }} /><div className="spacer" />
        <Pop align="right" trigger={({ toggle }) => <button className="fb sub ico" aria-label="Deck options" onClick={toggle}><Icon name="more" size={16} /></button>}>{({ close }) => <MenuRows close={close} items={deckMenu} />}</Pop>
        <button className="fb" onClick={() => onStudy('cram')}>Cram</button><button className="fb" onClick={() => onStudy('quiz')}>Quiz</button><button className="fb pri" onClick={() => onStudy('srs')}>Study ({c.new + c.learn + c.due})</button></div>
      <section className="cd-add"><div className="cd-addh"><b>Add a card</b><div className="fx-seg" role="group" aria-label="Card type"><button className={type === 'basic' ? 'on' : ''} onClick={() => setType('basic')}>Basic</button><button className={type === 'cloze' ? 'on' : ''} onClick={() => setType('cloze')}>Fill in the blank</button></div><div className="spacer" /><button className="fb sub sm" onClick={() => setBulk(!bulk)}>{bulk ? 'Single card' : 'Add many at once'}</button><button className="fb sub sm" onClick={importInto}>Import file…</button></div>
        {bulk ? <><textarea className="fi" rows={6} aria-label="Many cards" placeholder={'One card per line: front ; back\nbonjour ; hello\nmerci ; thank you'} value={bulkText} onChange={(e) => setBulkText(e.target.value)} /><div className="cd-addb"><button className="fb pri" onClick={addBulk}>Add cards</button></div></> :
          <><div className="cd-two"><label>{type === 'cloze' ? 'Text with blanks' : 'Front'}<textarea ref={fr} className="fi" rows={3} aria-label="Front" placeholder={type === 'cloze' ? 'The capital of {{c1::France}} is {{c2::Paris}}.' : 'Question or term'} value={front} onChange={(e) => setFront(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); }} /></label>
            <label>{type === 'cloze' ? 'Extra info (optional)' : 'Back'}<textarea className="fi" rows={3} aria-label="Back" placeholder={type === 'cloze' ? 'Shown with the answer' : 'Answer'} value={back} onChange={(e) => setBack(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); }} /></label></div><div className="cd-addb"><small className="muted">Supports **bold**, `code` and ![image](https://…). Ctrl+Enter adds the card.</small><button className="fb pri" onClick={add}>Add card</button></div></>}
      </section>
      <div className="cd-list-h"><input className="fi" placeholder="Search cards" aria-label="Search cards" value={q} onChange={(e) => setQ(e.target.value)} /><select className="fi" aria-label="Filter cards" value={filt} onChange={(e) => setFilt(e.target.value)}><option value="all">All cards ({deck.cards.length})</option><option value="new">New</option><option value="learning">Learning</option><option value="young">Young</option><option value="mature">Mature</option><option value="due">Due now</option><option value="susp">Suspended</option></select></div>
      {list.length === 0 ? <div className="cd-none">{deck.cards.length ? 'No cards match.' : 'This deck is empty. Add your first card above.'}</div> :
        <div className="cd-table" role="table" aria-label="Cards">{list.map((cd) => <div key={cd.id} className={'cd-row' + (cd.susp ? ' susp' : '')} role="row"><div className="cd-c f"><Rich text={sides(cd).q} /></div><div className="cd-c b"><Rich text={sides(cd).a} /></div><div className="cd-c s"><span className={'cd-pill ' + level(cd)}>{due(cd)}</span></div><div className="cd-c a"><button className="fb sub sm" onClick={() => onEdit(cd)} aria-label="Edit card"><Icon name="edit" size={14} /></button><button className="fb sub sm" onClick={() => toggleSusp(cd)} aria-label={cd.susp ? 'Unsuspend card' : 'Suspend card'} title={cd.susp ? 'Unsuspend' : 'Suspend'}>{cd.susp ? '▶' : '⏸'}</button><button className="fb sub sm" aria-label="Delete card" onClick={async () => { if (await ask({ kind: 'confirm', title: 'Delete card', message: 'Delete this card?', okText: 'Delete', danger: true })) upDeck(deck.id, (x) => ({ ...x, cards: x.cards.filter((y) => y.id !== cd.id) })); }}><Icon name="trash" size={14} /></button></div></div>)}</div>}
    </div>
  );
}
function CardEditor({ init, onClose, onSave, onDelete }) {
  const [f, setF] = useState(init.front); const [b, setB] = useState(init.back); const [t, setT] = useState(init.type || 'basic'); const [tags, setTags] = useState((init.tags || []).join(', '));
  return <Modal title="Edit card" onClose={onClose} width={520} footer={<><button className="fb danger" onClick={onDelete}>Delete</button><div className="spacer" /><button className="fb" onClick={onClose}>Cancel</button><button className="fb pri" onClick={() => onSave({ front: f, back: b, type: t === 'cloze' || hasCloze(f) ? 'cloze' : 'basic', tags: tags.split(',').map((x) => x.trim()).filter(Boolean) })}>Save</button></>}>
    <label className="cd-lbl">{t === 'cloze' ? 'Text with blanks' : 'Front'}<textarea className="fi" rows={4} autoFocus aria-label="Front" value={f} onChange={(e) => setF(e.target.value)} /></label>
    <label className="cd-lbl">{t === 'cloze' ? 'Extra info' : 'Back'}<textarea className="fi" rows={4} aria-label="Back" value={b} onChange={(e) => setB(e.target.value)} /></label>
    <label className="cd-lbl">Tags (comma separated)<input className="fi" aria-label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} /></label></Modal>;
}
