import { useId } from 'react';
import useDialog from '../hooks/useDialog';
import { t } from '../config/i18n';

// Asks before an action that cannot be undone (replaces window.confirm).
// Render it only while a question is open: <ConfirmDialog title=… onConfirm=… onClose=… />.
// onConfirm may return a promise; the dialog stays busy until it settles and
// is not closable meanwhile. tone 'danger' (default) or 'primary' colours the
// confirm button. The cancel button has focus first, so Enter does not confirm
// by accident.
const TONES = {
  danger: 'bg-rose-700 hover:bg-rose-800',
  primary: 'bg-indigo-600 hover:bg-indigo-700',
};

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = t('confirm.yesContinue'),
  cancelLabel = t('visitors.keepIt'),
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const close = () => { if (!busy) onClose?.(); };
  const ref = useDialog(true, close);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl outline-none text-left"
      >
        <h2 id={titleId} className="m-0 text-lg font-bold text-slate-900">{title}</h2>
        {message && <p className="m-0 mt-2 text-sm leading-relaxed text-slate-600">{message}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-autofocus
            onClick={close}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-[44px] rounded-xl border-0 px-5 text-sm font-bold text-white cursor-pointer disabled:opacity-50 ${TONES[tone] || TONES.danger}`}
          >
            {busy ? t('common.pleaseWait') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
