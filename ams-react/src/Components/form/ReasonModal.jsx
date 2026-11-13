import { useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperclip, faTimes, faFilePdf } from '@fortawesome/free-solid-svg-icons';
import { LIMITS, checkText } from '../../utils/validation';
import FieldError from './FieldError';
import CharCount from './CharCount';
import { invalidCls } from './formHelpers';
import Modal from '../admin/Modal';
import { apiErrorMessage } from '../../utils/apiError';

// Replaces window.prompt() for reasons (reject, deny, close, terminate).
// Render it only while open, so each opening starts empty. onConfirm(reason, file)
// may return a promise; the modal stays busy until it settles, and if it
// throws, the error's message is shown under the textarea.
// With `options`, the reason is picked from a dropdown of presets; "Other…"
// reveals the textarea for a typed reason.
// With `allowAttachment`, optional file/image upload is supported.
// `children` render under the reason (extra options such as a checkbox the caller reads itself).
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
  allowAttachment = false,
  attachmentLabel = 'Attach Supporting Document / Image (optional)',
  children = null,
}) {
  const hasOptions = options?.length > 0;
  const [choice, setChoice] = useState(hasOptions ? options[0] : OTHER);
  const typing = choice === OTHER;
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const fileInputRef = useRef(null);

  const validate = (value) => checkText(value, { label, max, required });

  const close = () => {
    if (!busy) {
      if (attachmentPreview) {
        URL.revokeObjectURL(attachmentPreview);
      }
      onClose?.();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('Attachment must be 10MB or less.');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setError('Invalid file type. Please upload a JPG, PNG, WEBP image or PDF.');
      return;
    }

    setError('');
    setAttachment(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setAttachmentPreview(url);
    } else {
      setAttachmentPreview(null);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    if (attachmentPreview) {
      URL.revokeObjectURL(attachmentPreview);
      setAttachmentPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
      await onConfirm?.(typing ? reason.trim() : choice, attachment);
    } catch (err) {
      // A rejected API call carries the server's reason; a thrown Error its own message.
      setError(apiErrorMessage(err, err?.message || 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const btn = tone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700';

  return (
    <Modal busy={busy} title={`${title}`} onClose={close} as="form" overlayClassName="flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in" onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto" labelledBy="reason-modal-title">
        <h3 id="reason-modal-title" className="text-lg font-bold text-slate-800">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        {hasOptions && (
          <>
            <label htmlFor="reason-modal-choice" className="mt-4 block text-sm font-semibold text-slate-700">
              {label}{required && <span className="text-red-600"> *</span>}
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
              {hasOptions ? 'Please specify' : label}{required && (error || (attemptedSubmit && !reason.trim())) ? <span className="text-red-600"> *</span> : null}
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

        {children}

        {allowAttachment && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {attachmentLabel}
            </label>
            {!attachment ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-xl p-3 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1 group"
              >
                <FontAwesomeIcon icon={faPaperclip} className="text-slate-400 group-hover:text-indigo-500 text-sm" />
                <span className="text-xs text-slate-500 group-hover:text-indigo-600 font-medium">Click to attach image or PDF (max 10MB)</span>
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/jpeg,image/png,image/webp,application/pdf" 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
              </div>
            ) : (
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {attachmentPreview ? (
                    <img src={attachmentPreview} alt="Preview" className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs uppercase">
                      <FontAwesomeIcon icon={faFilePdf} className="text-base text-indigo-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate m-0">{attachment.name}</p>
                    <p className="text-[10px] text-slate-400 m-0">{(attachment.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button aria-label="Close"
                  type="button"
                  onClick={removeAttachment}
                  className="text-slate-400 hover:text-rose-500 p-1.5 bg-transparent border-0 cursor-pointer transition-colors"
                  title="Remove attachment"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            )}
          </div>
        )}

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
      </Modal>
  );
}
