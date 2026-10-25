import { useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { flow, hasBranching, validate, isAnswered, score, shuffled, quizMax } from './model.js';

/* ---- one question as the respondent sees it ---- */
export function Ask({ q, n, a, set, err, form, seed, reveal }) {
  const val = a || {}; const opts = useMemo(() => (q.shuffle && q.options ? shuffled(q.options, seed + q.id) : q.options), [q.options, q.shuffle, seed, q.id]);
  const toggle = (oid) => { if (q.multi) { const s = new Set(val.sel || []); s.has(oid) ? s.delete(oid) : s.add(oid); set({ ...val, sel: [...s] }); } else set({ ...val, sel: [oid], other: val.other ? '' : val.other }); };
  if (q.type === 'section') return <section className="frm-q section"><h2>{q.title || 'Section title'}</h2>{q.sub && <p className="sub">{q.sub}</p>}</section>;
  const title = <h3 id={'q-' + q.id}>{n}. {q.title || <span className="muted">Question</span>}{q.required && <b className="req" aria-label="required"> *</b>}{form.kind === 'quiz' && q.points > 0 && <span className="pts">{q.points} point{q.points === 1 ? '' : 's'}</span>}</h3>;
  const rv = reveal && reveal.per ? reveal.per[q.id] : undefined;
  return (
    <section className={'frm-q' + (err ? ' bad' : '')} aria-labelledby={'q-' + q.id}>
      {title}{q.sub && <p className="sub">{q.sub}</p>}
      {q.type === 'choice' && (q.dropdown && !q.multi ? <select className="fi frm-dd" aria-label={q.title} value={(val.sel || [])[0] || ''} onChange={(e) => set({ sel: e.target.value ? [e.target.value] : [] })}><option value="">Select your answer</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.t}</option>)}</select>
        : <div className="frm-opts" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.title}>{opts.map((o) => { const on = (val.sel || []).includes(o.id); return <label key={o.id} className={'frm-opt' + (on ? ' on' : '') + (reveal && reveal.show && o.correct ? ' correct' : '') + (reveal && reveal.show && on && !o.correct && q.options.some((x) => x.correct) ? ' wrong' : '')}><input type={q.multi ? 'checkbox' : 'radio'} name={q.id} checked={on} onChange={() => toggle(o.id)} /><span>{o.t || 'Option'}</span>{reveal && reveal.show && o.correct && <Icon name="check" size={15} />}</label>; })}
          {q.other && <label className={'frm-opt other' + ((val.sel || []).includes('__other') ? ' on' : '')}><input type={q.multi ? 'checkbox' : 'radio'} name={q.id} checked={(val.sel || []).includes('__other')} onChange={() => toggle('__other')} /><span>Other</span><input className="fi" aria-label="Other answer" value={val.other || ''} onChange={(e) => set({ ...val, other: e.target.value, sel: q.multi ? [...new Set([...(val.sel || []), '__other'])] : ['__other'] })} placeholder="Enter your answer" /></label>}</div>)}
      {q.type === 'text' && (q.long ? <textarea className="fi frm-txt" rows={4} aria-label={q.title} value={val.text || ''} onChange={(e) => set({ text: e.target.value })} placeholder="Enter your answer" /> : <input className="fi frm-txt" aria-label={q.title} type={q.restrict === 'number' ? 'number' : q.restrict === 'email' ? 'email' : 'text'} value={val.text || ''} onChange={(e) => set({ text: e.target.value })} placeholder={q.restrict === 'number' ? 'Enter a number' : q.restrict === 'email' ? 'name@example.com' : 'Enter your answer'} />)}
      {(q.type === 'rating' || q.type === 'nps') && (() => { const lo = q.type === 'nps' ? 0 : 1; const cnt = q.type === 'nps' ? 11 : q.levels; const star = q.type === 'rating' && q.symbol === 'star'; return <><div className={'frm-scale' + (star ? ' stars' : '')} role="radiogroup" aria-label={q.title}>{Array.from({ length: cnt }, (_, i) => lo + i).map((v) => <button key={v} type="button" role="radio" aria-checked={val.n === v} aria-label={star ? `${v} star${v === 1 ? '' : 's'}` : String(v)} className={(star ? (val.n >= v ? 'on' : '') : val.n === v ? 'on' : '')} onClick={() => set({ n: v })}>{star ? <Icon name="star" size={28} /> : v}</button>)}</div>{(q.labelL || q.labelR) && <div className="frm-lab"><span>{q.labelL}</span><span>{q.labelR}</span></div>}</>; })()}
      {q.type === 'date' && <input type="date" className="fi frm-date" aria-label={q.title} value={val.d || ''} onChange={(e) => set({ d: e.target.value })} />}
      {q.type === 'ranking' && (() => { const order = val.rank && val.rank.length === q.options.length ? val.rank : opts.map((o) => o.id); const mv = (i, d) => { const r = [...order]; const j = i + d; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j], r[i]]; set({ rank: r }); }; return <ol className="frm-rank" aria-label={q.title}>{order.map((oid, i) => { const o = q.options.find((x) => x.id === oid); return <li key={oid}><span className="num">{i + 1}</span><span className="grow">{o.t}</span><button type="button" className="fb sub ico sm" aria-label={`Move ${o.t} up`} disabled={i === 0} onClick={() => mv(i, -1)}><Icon name="arrowUp" size={14} /></button><button type="button" className="fb sub ico sm" aria-label={`Move ${o.t} down`} disabled={i === order.length - 1} onClick={() => mv(i, 1)}><Icon name="arrowDown" size={14} /></button></li>; })}{!(val.rank && val.rank.length) && <li className="hint">Use the arrows to reorder, then continue. Untouched order counts as your ranking.</li>}</ol>; })()}
      {q.type === 'likert' && <div className="frm-likwrap"><table className="frm-lik"><thead><tr><th /> {q.options.map((o) => <th key={o.id}>{o.t}</th>)}</tr></thead><tbody>{q.rows.map((r) => <tr key={r.id}><td>{r.t}</td>{q.options.map((o, ci) => <td key={o.id}><input type="radio" name={q.id + r.id} aria-label={`${r.t}: ${o.t}`} checked={(val.rows || {})[r.id] === ci} onChange={() => set({ rows: { ...(val.rows || {}), [r.id]: ci } })} /></td>)}</tr>)}</tbody></table></div>}
      {err && <div className="frm-err" role="alert"><Icon name="info" size={14} />{err}</div>}
      {reveal && reveal.show && rv !== undefined && <div className={'frm-fb ' + (rv ? 'ok' : 'no')}>{rv ? `Correct${q.feedbackOk ? ' — ' + q.feedbackOk : ''}` : `Incorrect${q.feedbackNo ? ' — ' + q.feedbackNo : ''}`}</div>}
    </section>
  );
}

/* ---- full respondent experience ---- */
export default function Filler({ form, onSubmit, preview, onDone, closedMsg }) {
  const [ans, setAns] = useState({}); const [errs, setErrs] = useState({}); const [done, setDone] = useState(null); const [step, setStep] = useState(0); const seed = useRef(Math.random().toString(36).slice(2)).current;
  const branch = hasBranching(form); const single = form.settings.oneAtATime || branch;
  const base = useMemo(() => (form.settings.shuffleQ ? shuffleSections(form.questions, seed) : form.questions), [form.questions, form.settings.shuffleQ, seed]);
  const f2 = useMemo(() => ({ ...form, questions: base }), [form, base]); const seq = branch ? flow(f2, ans) : base; const answerable = seq.filter((q) => q.type !== 'section');
  const visible = single ? [seq.filter((q, i) => i >= 0)[Math.min(step, seq.length - 1)]].filter(Boolean) : seq; const th = { '--fc': form.theme.color, '--fb': form.theme.bg };
  const numOf = (q) => answerable.indexOf(q) + 1; const setA = (qid, v) => { setAns((a) => ({ ...a, [qid]: v })); if (errs[qid]) setErrs((e) => { const n = { ...e }; delete n[qid]; return n; }); };
  const submit = () => {
    const only = new Set(seq.map((q) => q.id)); const e = validate(f2, ans, only); if (Object.keys(e).length) { setErrs(e); const first = seq.findIndex((q) => e[q.id]); if (single && first >= 0) setStep(first); else setTimeout(() => { const el = document.querySelector('.frm-q.bad'); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 30); return; }
    const clean = {}; seq.forEach((q) => { if (isAnswered(q, ans[q.id])) clean[q.id] = ans[q.id]; }); const sc = form.kind === 'quiz' ? score(form, clean) : null;
    const rec = onSubmit({ answers: clean, score: sc ? sc.got : null, max: sc ? sc.max : null }); setDone({ sc, clean, rec });
  };
  const next = () => { const q = seq[step]; if (q && q.type !== 'section') { const e = validate(f2, ans, new Set([q.id])); if (Object.keys(e).length) { setErrs(e); return; } } setStep((s) => Math.min(s + 1, seq.length - 1)); };
  const pct = single ? Math.round(((Math.min(step, seq.length - 1) + 1) / Math.max(1, seq.length)) * 100) : Math.round((answerable.filter((q) => isAnswered(q, ans[q.id])).length / Math.max(1, answerable.length)) * 100);
  if (closedMsg) return <div className="frm-fill" style={th}><div className="frm-paper"><div className="frm-head"><h1>{form.title}</h1></div><div className="frm-q"><Icon name="lock" size={20} /> {closedMsg}</div></div></div>;
  if (done) { const sc = done.sc; return (
    <div className="frm-fill" style={th}><div className="frm-paper"><div className="frm-head"><h1>{form.title}</h1></div>
      <div className="frm-q frm-thanks"><Icon name="circleCheck" size={44} /><h2>{form.settings.thanks ? 'Thanks!' : 'Your response was submitted'}</h2><p>{form.settings.thanks || 'Thank you for taking the time.'}</p>
        {sc && form.settings.showScore && <div className="frm-score" role="status"><b>{sc.got}</b><span>/ {sc.max} points</span><em>{sc.max ? Math.round((sc.got / sc.max) * 100) : 0}%</em></div>}
        {preview ? <p className="muted">This was a preview. Nothing was saved.</p> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>{!form.settings.oncePerBrowser && <button className="fb" onClick={() => { setAns({}); setDone(null); setStep(0); setErrs({}); }}>Submit another response</button>}{onDone && <button className="fb pri" onClick={onDone}>{preview ? 'Back to editing' : 'Done'}</button>}</div></div>
      {sc && form.settings.showAnswers && seq.map((q) => <Ask key={q.id} q={q} n={numOf(q)} a={done.clean[q.id]} set={() => {}} form={form} seed={seed} reveal={{ show: true, per: sc ? scorePer(form, done.clean) : null }} />)}
    </div></div>); }
  return (
    <div className="frm-fill" style={th}>
      <div className="frm-paper">
        <div className="frm-head"><h1>{form.title || 'Untitled form'}</h1>{form.desc && <p className="sub">{form.desc}</p>}{form.settings.progress && <div className="frm-prog" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Progress"><i style={{ width: pct + '%' }} /></div>}</div>
        {visible.map((q) => <Ask key={q.id} q={q} n={numOf(q)} a={ans[q.id]} set={(v) => setA(q.id, v)} err={errs[q.id]} form={form} seed={seed} />)}
        {form.questions.length === 0 && <div className="frm-q muted">This form has no questions yet.</div>}
        <div className="frm-nav">{single && step > 0 && <button className="fb" onClick={() => setStep(step - 1)}>Back</button>}<span className="spacer" />
          {single && step < seq.length - 1 ? <button className="fb pri lg" onClick={next}>Next</button> : <button className="fb pri lg" onClick={submit} disabled={!form.questions.length}>Submit</button>}</div>
        <div className="frm-foot">{preview ? 'Preview — responses are not saved' : 'Techomato Forms · Never give out your password.'}</div>
      </div>
    </div>
  );
}
const scorePer = (form, ans) => score(form, ans).per;
function shuffleSections(qs, seed) { const out = []; let blk = []; const flush = () => { out.push(...shuffled(blk, seed)); blk = []; }; qs.forEach((q) => { if (q.type === 'section') { flush(); out.push(q); } else blk.push(q); }); flush(); return out; }
