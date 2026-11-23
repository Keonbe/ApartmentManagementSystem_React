import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faExclamationCircle, faInfoCircle, faTimes } from '@fortawesome/free-solid-svg-icons';
import { createToastStore } from './toastStore';

// window.alert() replacement for action results, callable from any handler:
//
//   toast.success('Reminder sent.');
//   toast.error(apiErrorMessage(err, 'Failed to save.'));
//   toast.info('This bill changed while you were confirming.');
//
// One persistent root on document.body (no provider to wire). Errors are
// announced at once (role="alert"), the others politely (role="status"). The
// text keeps line breaks. Fixed light colours, like InlineAlert, so it reads on
// every theme. For a failure beside a form or list use InlineAlert / LoadError.
const store = createToastStore();

const TONES = {
  success: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: faCheckCircle, iconCls: 'text-emerald-600', role: 'status' },
  info: { cls: 'bg-sky-50 border-sky-200 text-sky-900', icon: faInfoCircle, iconCls: 'text-sky-700', role: 'status' },
  error: { cls: 'bg-rose-50 border-rose-200 text-rose-800', icon: faExclamationCircle, iconCls: 'text-rose-600', role: 'alert' },
};

// eslint-disable-next-line react-refresh/only-export-components -- internal host, the module's default export is the imperative API
function ToastHost() {
  const items = useSyncExternalStore(store.subscribe, store.getItems, store.getItems);
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[120] flex flex-col items-end gap-2 pointer-events-none">
      {items.map((it) => {
        const tone = TONES[it.tone] || TONES.info;
        return (
          <div key={it.id} role={tone.role} className={`pointer-events-auto flex w-full sm:w-auto sm:max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium text-left shadow-lg ${tone.cls}`}>
            <FontAwesomeIcon icon={tone.icon} className={`mt-0.5 shrink-0 ${tone.iconCls}`} aria-hidden="true" />
            <div className="min-w-0 flex-1 leading-relaxed" style={{ whiteSpace: 'pre-line' }}>{it.message}</div>
            <button type="button" onClick={() => store.dismiss(it.id)} aria-label="Dismiss" className="shrink-0 -m-2.5 p-1 min-w-[44px] min-h-[44px] inline-flex items-center justify-center bg-transparent border-0 cursor-pointer opacity-70 hover:opacity-100 text-current">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

let mounted = false;
function ensureMounted() {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  createRoot(host).render(<ToastHost />);
}

const show = (tone) => (message, opts) => {
  ensureMounted();
  return store.push(tone, message, opts);
};

const toast = {
  success: show('success'),
  info: show('info'),
  error: show('error'),
  dismiss: store.dismiss,
};

export default toast;
