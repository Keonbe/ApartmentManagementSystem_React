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
  suggestions = [],
}) {
  const hasOptions = options?.length > 0;
  const [choice, setChoice] = useState(hasOptions ? options[0] : OTHER);
  const typing = choice === OTHER;
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const validate = (value) => checkText(value, { label, max, required });

  const close = () => {
    if (!busy) onClose?.();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setAttemptedSubmit(true);
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
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 modal-overlay-anim animate-fade-in" onClick={close}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl modal-card-anim border border-slate-100"
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
            {suggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Common reasons">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => { setReason(suggestion); setError(''); }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 select-none shadow-xs ${
                      reason === suggestion
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-500/30'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700'
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <label htmlFor="reason-modal-text" className="mt-4 block text-sm font-semibold text-slate-700">
              {hasOptions ? 'Please specify' : label}{required && (error || (attemptedSubmit && !reason.trim())) ? <span className="text-red-500"> *</span> : null}
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
              onBlur={() => { setReason(reason.trim()); if (attemptedSubmit) setError(validate(reason)); }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'reason-modal-text-error' : undefined}
              className={`mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all${invalidCls(error)}`}
            />
            <FieldError id="reason-modal-text" error={error} />
            <CharCount value={reason} max={max} />
          </>
        )}
        {!typing && error && <FieldError id="reason-modal-choice" error={error} />}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800 active:scale-95 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg active:scale-95 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none ${btn}`}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
