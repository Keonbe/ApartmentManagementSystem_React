import { createRoot } from 'react-dom/client';
import ConfirmDialog from '../Components/ConfirmDialog';
import { t } from '../config/i18n';

// window.confirm() replacement that can be awaited from any handler, with no
// state or JSX to wire into the page:
//
//   if (!(await askConfirm('Remove this image?'))) return;
//   if (!(await askConfirm('Refund ₱500 through PayMongo?', { title: 'Refund', confirmLabel: 'Refund', tone: 'danger' }))) return;
//
// Resolves true on confirm and false on Cancel, Esc or a backdrop press. The
// dialog is the shared ConfirmDialog (alertdialog role, focus trap, Cancel
// focused first) mounted in its own root on document.body, so it works the same
// from admin pages, tenant pages and chat. `message` keeps line breaks.
export default function askConfirm(message, { title, confirmLabel, cancelLabel, tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (answer) => {
      resolve(answer);
      // Unmount after this event turn so the dialog's own close handler finishes first.
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
    };
    root.render(
      <ConfirmDialog
        title={title || t('confirm.title')}
        message={<span style={{ whiteSpace: 'pre-line' }}>{message}</span>}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        tone={tone}
        onConfirm={() => finish(true)}
        onClose={() => finish(false)}
      />
    );
  });
}
