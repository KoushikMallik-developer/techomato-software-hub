import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppBar from '../components/AppBar.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, Pop, useToast, useAsk, useContextMenu, download } from '../components/fxui.jsx';
import { useStore } from '../lib/useStore.js';
import { readAsText } from '../lib/download.js';
import Filler from './forms/Filler.jsx';
import { Editor } from './forms/Editor.jsx';
import { Results } from './forms/Results.jsx';
import { blankData, migrate, TEMPLATES, THEMES, id, responsesToCsv, toStandaloneHtml, sampleResponses, score, newForm, hasBranching } from './forms/model.js';
import '../styles/money.css';
import '../styles/forms.css';

const relTime = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; if (m < 1440) return `${Math.round(m / 60)} h ago`; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const fillUrl = (fid) => `${window.location.href.split('#')[0]}#/app/forms?fill=${fid}`;
const closedReason = (f) => (!f.settings.open ? 'This form is not accepting responses right now.' : f.settings.closeAt && new Date(f.settings.closeAt) < new Date() ? 'This form closed on ' + new Date(f.settings.closeAt).toLocaleString() + '.' : '');

export default function FormsApp() {
  const [data, set, meta] = useStore('forms', blankData, migrate); const [toastNode, toast] = useToast(); const [askNode, ask] = useAsk(); const [ctxNode, showCtx] = useContextMenu();
  const [sp] = useSearchParams(); const kiosk = sp.get('fill'); const [dlg, setDlg] = useState(null); const [fillId, setFillId] = useState(null); const [q, setQ] = useState('');
  const form = data.forms.find((f) => f.id === data.ui.form) || null; const tab = data.ui.tab;
  const setUi = (patch) => set((d) => ({ ...d, ui: { ...d.ui, ...patch } }));
  const setForm = (fid, fn) => set((d) => ({ ...d, forms: d.forms.map((f) => (f.id === fid ? { ...fn(f), updated: new Date().toISOString() } : f)) }));
  const create = (tpl) => { const f = tpl.make(); set((d) => ({ ...d, forms: [f, ...d.forms], ui: { form: f.id, tab: 'questions' } })); setDlg(null); };
  const submit = (fid, rec) => { const r = { id: id(), at: new Date().toISOString(), ...rec }; set((d) => ({ ...d, forms: d.forms.map((f) => (f.id === fid ? { ...f, responses: [r, ...f.responses] } : f)) })); try { localStorage.setItem('techomato:forms-done:' + fid, '1'); } catch { /* ignore */ } return r; };
  const delForm = async (f) => { if (!(await ask({ title: `Delete "${f.title}"?`, message: `The form and its ${f.responses.length} response${f.responses.length === 1 ? '' : 's'} will be deleted. This cannot be undone.`, okText: 'Delete', danger: true }))) return; set((d) => ({ ...d, forms: d.forms.filter((x) => x.id !== f.id), ui: { ...d.ui, form: d.ui.form === f.id ? null : d.ui.form } })); };
  const dupForm = (f) => { const c = JSON.parse(JSON.stringify(f)); c.id = id(); c.title = f.title + ' (copy)'; c.responses = []; c.created = c.updated = new Date().toISOString(); set((d) => ({ ...d, forms: [c, ...d.forms] })); toast('Form copied'); };
  const importResponses = (fid) => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.multiple = true; input.onchange = async () => { const f0 = data.forms.find((x) => x.id === fid); let ok = 0; let bad = 0; const recs = []; for (const file of [...input.files]) { try { const o = JSON.parse(await readAsText(file)); const list = Array.isArray(o) ? o : [o]; for (const r of list) { if (r && r.kind === 'techomato-forms-response' && r.formId === fid && r.answers && typeof r.answers === 'object') { const sc = f0.kind === 'quiz' ? score(f0, r.answers) : { got: null, max: null }; recs.push({ id: id(), at: String(r.at || new Date().toISOString()), answers: r.answers, score: sc.got, max: sc.max }); ok++; } else bad++; } } catch { bad++; } } if (recs.length) setForm(fid, (f) => ({ ...f, responses: [...recs, ...f.responses].sort((a, b) => (a.at < b.at ? 1 : -1)) })); toast(`Imported ${ok} response${ok === 1 ? '' : 's'}${bad ? `; ${bad} file${bad === 1 ? '' : 's'} did not match this form` : ''}`); }; input.click(); };
  const X = { data, setForm, toast, share: (fid) => setDlg({ k: 'share', fid }), fill: (fid) => setFillId(fid), importResponses, exportCsv: (f) => { download(`${f.title || 'form'}-responses.csv`, responsesToCsv(f), 'text/csv'); toast('Exported CSV'); },
    addSamples: (fid) => setForm(fid, (f) => ({ ...f, responses: sampleResponses(f).reverse().concat(f.responses) })),
    deleteResponse: (fid, rid) => setForm(fid, (f) => ({ ...f, responses: f.responses.filter((r) => r.id !== rid) })),
    clearResponses: async (fid) => { if (await ask({ title: 'Delete all responses?', message: 'This cannot be undone. Export a CSV first if you need a copy.', okText: 'Delete all', danger: true })) setForm(fid, (f) => ({ ...f, responses: [] })); } };

  /* kiosk respondent mode (link from Share) */
  if (kiosk) { const f = data.forms.find((x) => x.id === kiosk); const done = (() => { try { return localStorage.getItem('techomato:forms-done:' + kiosk) === '1'; } catch { return false; } })();
    if (!f) return <div className="fx frm-solo"><div className="frm-fill"><div className="frm-paper"><div className="frm-q">This form was not found in this browser. Forms are stored privately in the browser where they were created.</div></div></div></div>;
    return <div className="fx frm-solo" style={{ '--brand': f.theme.color }}><Filler key={f.id} form={f} closedMsg={closedReason(f) || (f.settings.oncePerBrowser && done ? 'You have already responded to this form on this device.' : '')} onSubmit={(r) => submit(f.id, r)} /></div>; }
  if (fillId) { const f = data.forms.find((x) => x.id === fillId); if (f) return (
    <div className="fx frm-solo" style={{ '--brand': f.theme.color }}><div className="frm-fillbar"><Icon name="users" size={16} />Respondent view — answers are saved to this form<span className="spacer" /><button className="fb sm" onClick={() => setFillId(null)}><Icon name="x" size={14} />Close respondent view</button></div>
      <div className="frm-solo-body"><Filler key={f.id} form={f} closedMsg={closedReason(f)} onSubmit={(r) => submit(f.id, r)} onDone={() => setFillId(null)} /></div>{toastNode}</div>); }

  const list = data.forms.filter((f) => !q || f.title.toLowerCase().includes(q.toLowerCase()));
  const menu = (e, f) => { e.preventDefault(); e.stopPropagation(); showCtx(e, [{ label: 'Open', icon: 'edit', onClick: () => setUi({ form: f.id, tab: 'questions' }) }, { label: 'Responses', icon: 'chartBar', onClick: () => setUi({ form: f.id, tab: 'responses' }) }, { label: 'Share…', icon: 'share', onClick: () => setDlg({ k: 'share', fid: f.id }) }, { label: 'Duplicate', icon: 'copy', onClick: () => dupForm(f) }, { sep: true }, { label: 'Delete…', icon: 'trash', danger: true, onClick: () => delForm(f) }]); };
  return (
    <div className="fx frm" style={{ '--brand': '#00756a', '--brand-h': '#005e55', '--brand-soft': 'color-mix(in srgb, #00756a 14%, var(--bg))' }}>
      <AppBar id="forms" name="Techomato Forms" status={meta.status === 'error' ? 'error' : undefined} backup={{ name: 'forms', get: () => data, set: (v) => meta.replace(migrate(v)), blank: () => blankData() }}
        extraMenu={[{ label: 'New form', onClick: () => create(TEMPLATES[0]) }, { label: 'New quiz', onClick: () => create(TEMPLATES[1]) }]} />
      {!form ? (
        <main className="frm-home">
          <div className="frm-hh"><h1>Forms</h1><span className="spacer" /><label className="fx-search light" style={{ width: 240 }}><Icon name="search" size={15} /><input aria-label="Search forms" placeholder="Search forms" value={q} onChange={(e) => setQ(e.target.value)} /></label><button className="fb pri lg" onClick={() => create(TEMPLATES[0])}><Icon name="plus" size={16} />New form</button><button className="fb lg" onClick={() => create(TEMPLATES[1])}><Icon name="plus" size={16} />New quiz</button></div>
          <h2 className="frm-sec">Start from a template</h2>
          <div className="frm-tpls">{TEMPLATES.slice(2).map((t) => { const f = t.make(); return <button key={t.k} className="frm-tpl" onClick={() => create(t)} aria-label={`Template: ${t.n}`}><div className="th" style={{ background: f.theme.bg, borderTopColor: f.theme.color }}><i style={{ background: f.theme.color }} /><i /><i /><i /></div><b>{t.n}</b><span>{t.d}</span></button>; })}</div>
          <h2 className="frm-sec">My forms {data.forms.length > 0 && <span className="fx-badge">{data.forms.length}</span>}</h2>
          {list.length ? <div className="frm-grid">{list.map((f) => <article key={f.id} className="frm-fc" role="button" tabIndex={0} aria-label={`Open ${f.title}`} onClick={() => setUi({ form: f.id, tab: 'questions' })} onKeyDown={(e) => e.key === 'Enter' && setUi({ form: f.id, tab: 'questions' })} onContextMenu={(e) => menu(e, f)}>
            <div className="top" style={{ background: f.theme.bg, borderBottom: `5px solid ${f.theme.color}` }}><span className="ic" style={{ background: f.theme.color }}><Icon name={f.kind === 'quiz' ? 'trophy' : 'checkbox'} size={20} /></span>{f.kind === 'quiz' && <span className="fx-chip">Quiz</span>}{!f.settings.open && <span className="fx-chip">Closed</span>}</div>
            <div className="bd"><h3 className="ellip">{f.title || 'Untitled form'}</h3><div className="muted s">{f.questions.filter((x) => x.type !== 'section').length} questions · Edited {relTime(f.updated)}</div><div className="rs"><b>{f.responses.length}</b> response{f.responses.length === 1 ? '' : 's'}<span className="spacer" /><button className="fb sub ico sm" aria-label={`${f.title} options`} onClick={(e) => menu(e, f)}><Icon name="more" size={16} /></button></div></div></article>)}</div>
            : <div className="fx-empty"><Icon name="checkbox" size={40} /><h3>{q ? 'No forms match' : 'No forms yet'}</h3><div>{q ? 'Try a different search.' : 'Create a form or quiz, or pick a template above.'}</div></div>}
        </main>
      ) : (
        <>
          <div className="frm-bar">
            <button className="fb sub" onClick={() => setUi({ form: null })}><Icon name="chevronLeft" size={15} />All forms</button>
            <div className="fx-tabs frm-tabs" role="tablist"><button role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'on' : ''} onClick={() => setUi({ tab: 'questions' })}>Questions</button><button role="tab" aria-selected={tab === 'responses'} className={tab === 'responses' ? 'on' : ''} onClick={() => setUi({ tab: 'responses' })}>Responses <span className="fx-badge">{form.responses.length}</span></button></div>
            <span className="spacer" />
            <Pop trigger={({ toggle }) => <button className="fb" onClick={toggle}><Icon name="palette" size={15} />Theme</button>} align="right" width={210}>{() => <div className="frm-themes" role="group" aria-label="Theme colours">{THEMES.map(([c, bg]) => <button key={c} className={form.theme.color === c ? 'on' : ''} style={{ background: bg, borderColor: c }} aria-label={`Theme ${c}`} onClick={() => setForm(form.id, (f) => ({ ...f, theme: { color: c, bg } }))}><i style={{ background: c }} /></button>)}</div>}</Pop>
            <button className="fb" onClick={() => setDlg({ k: 'preview' })}><Icon name="eye" size={15} />Preview</button>
            <button className="fb" onClick={() => setDlg({ k: 'settings' })}><Icon name="settings" size={15} />Settings</button>
            <button className="fb pri" onClick={() => setDlg({ k: 'share', fid: form.id })}><Icon name="share" size={15} />Share</button>
          </div>
          <main className="frm-work">{tab === 'questions' ? <Editor key={form.id} X={X} form={form} /> : <Results X={X} form={form} />}</main>
        </>)}
      {dlg && dlg.k === 'preview' && form && <Preview form={form} onClose={() => setDlg(null)} />}
      {dlg && dlg.k === 'settings' && form && <SettingsDlg form={form} setForm={setForm} onClose={() => setDlg(null)} />}
      {dlg && dlg.k === 'share' && <ShareDlg X={X} form={data.forms.find((f) => f.id === dlg.fid)} setForm={setForm} onClose={() => setDlg(null)} />}
      {toastNode}{askNode}{ctxNode}
    </div>
  );
}

function Preview({ form, onClose }) {
  const [mobile, setMobile] = useState(false);
  return (
    <div className="frm-prev" role="dialog" aria-modal="true" aria-label="Preview"><div className="bar"><b>Preview</b><div className="fx-seg" role="group" aria-label="Device"><button className={!mobile ? 'on' : ''} onClick={() => setMobile(false)}><Icon name="layout" size={14} /> Computer</button><button className={mobile ? 'on' : ''} onClick={() => setMobile(true)}><Icon name="speaker" size={14} /> Mobile</button></div><span className="spacer" /><button className="fb pri" onClick={onClose}>Close preview</button></div>
      <div className="stage"><div className={'dev' + (mobile ? ' mob' : '')}><Filler form={form} preview onSubmit={() => ({})} onDone={onClose} /></div></div></div>
  );
}
function SettingsDlg({ form, setForm, onClose }) {
  const s = form.settings; const up = (patch) => setForm(form.id, (f) => ({ ...f, settings: { ...f.settings, ...patch } })); const quiz = form.kind === 'quiz'; const br = hasBranching(form);
  const Sw = ({ k, label, hint, disabled }) => <label className="frm-setrow"><span><b>{label}</b>{hint && <small>{hint}</small>}</span><span className="frm-sw"><input type="checkbox" role="switch" aria-label={label} disabled={disabled} checked={!!s[k]} onChange={(e) => up({ [k]: e.target.checked })} /><span /></span></label>;
  return (
    <Modal title="Form settings" onClose={onClose} width={520} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <div className="frm-setlist">
        <div className="frm-setrow"><span><b>Type</b><small>Quizzes score answers automatically</small></span><div className="fx-seg"><button className={!quiz ? 'on' : ''} onClick={() => setForm(form.id, (f) => ({ ...f, kind: 'form' }))}>Form</button><button className={quiz ? 'on' : ''} onClick={() => setForm(form.id, (f) => ({ ...f, kind: 'quiz', questions: f.questions.map((q) => (['choice', 'text'].includes(q.type) && !q.points ? { ...q, points: 1 } : q)) }))}>Quiz</button></div></div>
        <Sw k="open" label="Accepting responses" hint="Turn off to close the form" />
        <label className="frm-setrow"><span><b>Close automatically</b><small>Optional date and time</small></span><input type="datetime-local" className="fi" aria-label="Close date" value={s.closeAt || ''} onChange={(e) => up({ closeAt: e.target.value })} /></label>
        <Sw k="oneAtATime" label="One question at a time" hint={br ? 'Always on while branching is used' : 'Show a single question per page'} disabled={br} />
        <Sw k="shuffleQ" label="Shuffle question order" hint="Questions stay inside their section" />
        <Sw k="progress" label="Show progress bar" />
        <Sw k="oncePerBrowser" label="One response per device" hint="Uses a flag saved in the respondent's browser" />
        {quiz && <><Sw k="showScore" label="Show score after submitting" /><Sw k="showAnswers" label="Show correct answers after submitting" /></>}
        <label className="frm-setcol"><b>Thank-you message</b><textarea className="fi" rows={2} aria-label="Thank-you message" placeholder="Thank you for taking the time." value={s.thanks} onChange={(e) => up({ thanks: e.target.value })} /></label>
      </div>
    </Modal>
  );
}
function ShareDlg({ X, form, setForm, onClose }) {
  if (!form) return null; const url = fillUrl(form.id); const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { X.toast('Select the link and press Ctrl+C'); } };
  return (
    <Modal title={`Share "${form.title || 'Untitled form'}"`} onClose={onClose} width={580} footer={<button className="fb pri" onClick={onClose}>Done</button>}>
      <label className="frm-setrow" style={{ marginTop: 0 }}><span><b>Accepting responses</b></span><span className="frm-sw"><input type="checkbox" role="switch" aria-label="Accepting responses" checked={form.settings.open} onChange={(e) => setForm(form.id, (f) => ({ ...f, settings: { ...f.settings, open: e.target.checked } }))} /><span /></span></label>
      <div className="frm-shr"><div className="ic"><Icon name="link" size={20} /></div><div className="grow"><b>Link for this browser</b><p>Open it on this device, for example on a tablet for event check-in. Forms and responses are saved only in the browser where they were created.</p>
        <div className="frm-url"><input className="fi" readOnly aria-label="Form link" value={url} onFocus={(e) => e.target.select()} /><button className="fb pri" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div><div style={{ marginTop: 8, display: 'flex', gap: 8 }}><button className="fb sm" onClick={() => { onClose(); X.fill(form.id); }}>Open respondent view</button></div></div></div>
      <div className="frm-shr"><div className="ic"><Icon name="download" size={20} /></div><div className="grow"><b>Fillable file for anyone</b><p>Download a single HTML file and email it. Anyone can open it in any browser and fill it in offline. When they submit, they download a small response file to send back to you, and you import it from the Responses tab. {hasBranching(form) && <em>Branching is not included in exported files.</em>}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="fb" onClick={() => { download(`${(form.title || 'form').replace(/[^\w -]+/g, '')}.html`, toStandaloneHtml(form), 'text/html'); X.toast('Downloaded the fillable file'); }}><Icon name="download" size={15} />Download fillable HTML</button><button className="fb" onClick={() => { onClose(); X.importResponses(form.id); }}><Icon name="upload" size={15} />Import response files</button></div></div></div>
    </Modal>
  );
}
