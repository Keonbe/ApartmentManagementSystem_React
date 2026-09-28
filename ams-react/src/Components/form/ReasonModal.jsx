import { useState } from 'react';
import { LIMITS, checkText } from '../../utils/validation';
import FieldError from './FieldError';
import CharCount from './CharCount';
import { invalidCls } from './formHelpers';

// Replaces window.prompt() for reasons (reject, deny, close, terminate).
// Render it only while open, so each opening starts empty. onConfirm(reason)
// may return a promise; the modal stays busy until it settles, and if it
// throws, the error's message is shown under the textarea.
// With `options`, the reason is picked from a dropdown of presets; "Other…"
// reveals the textarea for a typed reason.
const OTHER = '__other__';

export default function ReasonModal({
  title,
  description,
  label = 'Reason',
  placeholder,
  confirmLabel = 'Confirm',
  required = true,
  max = LIMITS.reason,
  onConfirm,
  onClose,
  tone = 'red',
  options,
}) {
  const hasOptions = options?.length > 0;
  const [choice, setChoice] = useState(hasOptions ? options[0] : OTHER);
  const typing = choice === OTHER;
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const validate = (value) => checkText(value, { label, max, required });

  const close = () => {
    if (!busy) onClose?.();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const message = typing ? validate(reason) : '';
    setError(message);
    if (message) return;
    setBusy(true);
    try {
      await onConfirm?.(typing ? reason.trim() : choice);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const btn = tone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700';

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/50 p-4" onClick={close}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-modal-title"
      >
        <h3 id="reason-modal-title" className="text-lg font-bold text-slate-800">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        {hasOptions && (
          <>
            <label htmlFor="reason-modal-choice" className="mt-4 block text-sm font-semibold text-slate-700">
              {label}{required && <span className="text-red-500"> *</span>}
            </label>
            <select
              id="reason-modal-choice"
              name="reasonChoice"
              autoFocus
              value={choice}
              onChange={(e) => { setChoice(e.target.value); setError(''); }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {options.map(o => <option key={o} value={o}>{o}</option>)}
              <option value={OTHER}>Other…</option>
            </select>
          </>
        )}
        {typing && (
          <>
            <label htmlFor="reason-modal-text" className="mt-4 block text-sm font-semibold text-slate-700">
              {hasOptions ? 'Please specify' : label}{required && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              id="reason-modal-text"
              name="reason"
              rows={4}
              autoFocus
              maxLength={max}
              placeholder={placeholder}
              value={reason}
              onChange={(e) => { setReason(e.target.value); if (error) setError(''); }}
              onBlur={() => { setReason(reason.trim()); setError(validate(reason)); }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'reason-modal-text-error' : undefined}
              className={`mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500${invalidCls(error)}`}
            />
            <FieldError id="reason-modal-text" error={error} />
            <CharCount value={reason} max={max} />
          </>
        )}
        {!typing && error && <FieldError id="reason-modal-choice" error={error} />}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${btn}`}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
