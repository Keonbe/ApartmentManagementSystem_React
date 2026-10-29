import { useState } from 'react';
import useDialog, { openDialogCount } from '../../hooks/useDialog';

// The shell of every admin pop-up: backdrop + card with the dialog role and
// name, focus moved in and kept inside, Esc and a backdrop press to close, focus
// returned to the opener, and the page behind locked (all via useDialog). The
// content (header, body, buttons) is the caller's. Render it only while open.
//
//   <Modal title="Edit user" onClose={close} busy={saving} className="… max-w-lg …">…</Modal>
//
// title      accessible name (aria-label); or labelledBy = id of a visible heading
// busy       while true nothing closes it (a save in flight is never cut off)
// className  the card's look; modal-card-anim is always added (phone layout and
//            print rules key off it)
// as="form"  the card is the form; extra props (onSubmit, noValidate) go to the card
// z          only to override the automatic stacking (50, then +10 per open dialog)
const DEFAULT_CARD = 'bg-white rounded-dialog shadow-dialog w-full max-w-lg mx-4 overflow-hidden';
const DEFAULT_OVERLAY = 'flex items-center justify-center bg-black/50 backdrop-blur-sm p-4';

export default function Modal({
  title, labelledBy, onClose, busy = false, role = 'dialog', as: Card = 'div',
  className = DEFAULT_CARD, overlayClassName = DEFAULT_OVERLAY, z, cardRef,
  closeOnBackdrop = true, children, ...cardProps
}) {
  const close = () => { if (!busy) onClose?.(); };
  // cardRef (an object ref) is shared with the caller, e.g. the receipt prints its card.
  const dialogRef = useDialog(true, close, cardRef);
  const [depth] = useState(openDialogCount);

  return (
    <div
      className={`fixed inset-0 modal-overlay-anim ${overlayClassName}`}
      style={{ zIndex: z ?? 50 + depth * 10 }}
      // mousedown, not click: a drag that starts in a field and ends on the
      // backdrop must not close the form.
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) close(); }}
    >
      <Card
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : title}
        tabIndex={-1}
        className={`modal-card-anim outline-none ${className}`}
        {...cardProps}
      >
        {children}
      </Card>
    </div>
  );
}
