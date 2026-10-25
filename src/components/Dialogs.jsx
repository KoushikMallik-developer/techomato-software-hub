import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/*
  In-app replacements for alert / confirm / prompt (these are blocked in some
  embedded browsers anyway), plus form dialogs, custom dialogs and toasts.

    const dlg = useDialog();
    await dlg.confirm({ title, message, danger: true })      -> boolean
    await dlg.prompt({ title, label, value })                -> string | null
    await dlg.form({ title, fields: [...] })                 -> { name: value } | null
    await dlg.custom(({ close }) => <div/>, { title })       -> whatever close(value) passes
    dlg.toast('Saved')
*/
const Ctx = createContext(null);
export const useDialog = () => useContext(Ctx);

function Field({ f, value, onChange, values }) {
  const id = 'f_' + f.name;
  if (f.type === 'info') return <p className="field-info">{f.text}</p>;
  if (f.type === 'checkbox') {
    return (
      <label className="field field-check" htmlFor={id}>
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>{f.label}</span>
        {f.hint && <small>{f.hint}</small>}
      </label>
    );
  }
  let control;
  if (f.type === 'textarea') {
    control = <textarea id={id} rows={f.rows || 4} value={value ?? ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === 'select') {
    control = (
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {(f.options || []).map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={String(v)} value={v}>{l}</option>;
        })}
      </select>
    );
  } else if (f.type === 'color') {
    control = <input id={id} type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === 'range') {
    control = (
      <span className="range-row">
        <input id={id} type="range" min={f.min} max={f.max} step={f.step || 1} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{value}</output>
      </span>
    );
  } else if (f.type === 'number') {
    control = (
      <input id={id} type="number" min={f.min} max={f.max} step={f.step || 1} value={value ?? ''} placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
    );
  } else {
    control = <input id={id} type="text" value={value ?? ''} placeholder={f.placeholder} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className="field">
      <label htmlFor={id}>{f.label}</label>
      {control}
      {f.hint && <small>{f.hint}</small>}
    </div>
  );
}

function FormModal({ spec, close }) {
  const [values, setValues] = useState(() => {
    const v = {};
    (spec.fields || []).forEach((f) => { if (f.type !== 'info') v[f.name] = f.value ?? (f.type === 'checkbox' ? false : f.type === 'number' ? '' : ''); });
    return v;
  });
  const [error, setError] = useState('');
  const submit = () => {
    if (spec.validate) {
      const msg = spec.validate(values);
      if (msg) { setError(msg); return; }
    }
    close(values);
  };
  return (
    <form
      className="modal-body"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      {spec.message && <p className="modal-msg">{spec.message}</p>}
      {(spec.fields || []).map((f) =>
        f.show && !f.show(values) ? null : (
          <Field key={f.name} f={f} value={values[f.name]} values={values}
            onChange={(val) => { setValues((s) => ({ ...s, [f.name]: val })); setError(''); }} />
        )
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={() => close(null)}>{spec.cancelText || 'Cancel'}</button>
        <button type="submit" className={'btn ' + (spec.danger ? 'danger-solid' : 'primary')}>{spec.okText || 'OK'}</button>
      </div>
    </form>
  );
}

function ConfirmModal({ spec, close }) {
  return (
    <div className="modal-body">
      <p className="modal-msg">{spec.message}</p>
      <div className="modal-foot">
        {!spec.alert && <button className="btn ghost" onClick={() => close(false)}>{spec.cancelText || 'Cancel'}</button>}
        <button className={'btn ' + (spec.danger ? 'danger-solid' : 'primary')} autoFocus onClick={() => close(true)}>
          {spec.okText || 'OK'}
        </button>
      </div>
    </div>
  );
}

function Modal({ item, onClose }) {
  const { spec } = item;
  const close = useCallback((v) => onClose(item.id, v), [item.id, onClose]);
  const cancelValue = spec.kind === 'confirm' ? false : null;
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(cancelValue); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, cancelValue]);

  useEffect(() => {
    const el = ref.current && ref.current.querySelector('input:not([type=checkbox]):not([type=range]), textarea, select');
    if (el && !(spec.kind === 'confirm') && !spec.noAutofocus) {
      el.focus();
      if (el.select && el.type === 'text') el.select();
    }
  }, [spec.kind, spec.noAutofocus]);

  let body;
  if (spec.kind === 'confirm') body = <ConfirmModal spec={spec} close={close} />;
  else if (spec.kind === 'custom') body = <div className="modal-body">{spec.render({ close })}</div>;
  else body = <FormModal spec={spec} close={close} />;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !spec.sticky) close(cancelValue); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={spec.title} style={{ width: spec.width || 420 }} ref={ref}>
        <div className="modal-head">
          <h2>{spec.title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={() => close(cancelValue)}><Icon name="x" /></button>
        </div>
        {body}
      </div>
    </div>
  );
}

export function DialogProvider({ children }) {
  const [stack, setStack] = useState([]);
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const pending = useRef(new Map());

  const open = useCallback(
    (spec) =>
      new Promise((resolve) => {
        const id = ++idRef.current;
        pending.current.set(id, resolve);
        setStack((s) => [...s, { id, spec }]);
      }),
    []
  );

  const onClose = useCallback((id, value) => {
    const r = pending.current.get(id);
    if (r) {
      pending.current.delete(id);
      r(value);
    }
    setStack((s) => s.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message, opts = {}) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, message, kind: opts.kind || 'info' }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.ms || 2600);
  }, []);

  const api = useMemo(
    () => ({
      alert: (message, title = 'Notice') => open({ kind: 'confirm', alert: true, title, message }),
      confirm: (o) => open({ kind: 'confirm', title: 'Please confirm', okText: 'OK', ...(typeof o === 'string' ? { message: o } : o) }),
      prompt: (o) =>
        open({
          kind: 'form',
          title: o.title || 'Enter a value',
          okText: o.okText,
          fields: [{ name: 'v', label: o.label || '', type: o.multiline ? 'textarea' : 'text', value: o.value || '', placeholder: o.placeholder, hint: o.hint }],
          validate: o.validate ? (v) => o.validate(v.v) : undefined,
        }).then((r) => (r ? r.v : null)),
      form: (o) => open({ kind: 'form', ...o }),
      custom: (render, o = {}) => open({ kind: 'custom', render, ...o }),
      toast,
    }),
    [open, toast]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {stack.map((item) => (
        <Modal key={item.id} item={item} onClose={onClose} />
      ))}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.kind}>{t.message}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
