// Track Application: where a rent application stands, from the my_room.php
// fields alone (status, signed_lease_path, initial_payment_paid,
// pending_invoice_status, move_in_date, created_at).

// One name per application status, whatever its casing in the database.
export const normalizeApplicationStatus = (raw) => {
  const s = String(raw || '').toLowerCase();
  if (s === 'pending review' || s === 'pending') return 'pending';
  if (s === 'action required') return 'action';
  if (s === 'approved') return 'approved';
  if (s === 'active') return 'active';
  if (s === 'pending-move-out') return 'pending-move-out';
  // An archived application is a finished tenancy (pre_archive_status moved-out).
  if (s === 'moved-out' || s === 'archived') return 'moved-out';
  if (s === 'rejected' || s === 'declined') return 'rejected';
  if (s === 'cancelled') return 'cancelled';
  return 'none';
};

// The status chip next to the page title.
export const APPLICATION_STATUS_CHIP = {
  pending: { label: 'Under review', tone: 'waiting' },
  action: { label: 'Action required', tone: 'action' },
  approved: { label: 'Approved', tone: 'done' },
  active: { label: 'Moved in', tone: 'done' },
  'pending-move-out': { label: 'Move-out pending', tone: 'action' },
  'moved-out': { label: 'Moved out', tone: 'neutral' },
  rejected: { label: 'Not approved', tone: 'stopped' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  none: { label: 'No application', tone: 'neutral' },
};

const longDate = (value) => (value
  ? new Date(String(value).length <= 10 ? `${value}T00:00:00` : value)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : '');

// The application's path from submitted to moved in. Each step:
// { key, label, state: 'done' | 'current' | 'upcoming' | 'stopped', tone, note, date }.
// tone on the current step: 'action' (the tenant must act) or 'waiting'
// (management must). Returns [] for a finished tenancy (moved out or giving
// notice), which the page shows without a stepper.
export function applicationSteps(app) {
  if (!app) return [];
  const status = normalizeApplicationStatus(app.status);
  if (['pending-move-out', 'moved-out', 'none'].includes(status)) return [];

  const signed = !!app.signed_lease_path;
  const paid = !!app.initial_payment_paid;
  const housed = status === 'active';
  const approved = status === 'approved' || housed;

  // A cancelled application stops at the step it had reached.
  const cancelledAt = status === 'cancelled' ? (paid ? 'movein' : signed ? 'payment' : 'review') : null;
  const stopIf = (key, otherwise) => (cancelledAt === key ? 'stopped' : otherwise);

  const reviewState = status === 'rejected' ? 'stopped'
    : stopIf('review', approved || cancelledAt === 'payment' || cancelledAt === 'movein' ? 'done'
      : (status === 'pending' || status === 'action') ? 'current' : 'upcoming');
  const contractState = cancelledAt ? (signed || paid ? 'done' : 'upcoming')
    : housed || signed || paid ? 'done' : status === 'approved' ? 'current' : 'upcoming';
  const paymentState = stopIf('payment', housed || paid ? 'done'
    : status === 'approved' && signed ? 'current' : 'upcoming');
  const moveInState = stopIf('movein', housed ? 'done' : status === 'approved' && paid ? 'current' : 'upcoming');

  const verifying = app.pending_invoice_status === 'pending-verification';
  const balance = parseFloat(app.pending_balance ?? app.pending_total_amount);
  const amount = Number.isFinite(balance) && balance > 0
    ? `₱${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '';

  const steps = [
    { key: 'submitted', label: 'Application submitted', state: 'done', date: longDate(app.created_at) },
    {
      key: 'review',
      label: status === 'rejected' ? 'Not approved' : 'Management review',
      state: reviewState,
      tone: status === 'action' ? 'action' : 'waiting',
      note: status === 'pending' ? 'Management is checking your application and documents. You will be notified of the decision.'
        : status === 'action' ? 'Management needs a new move-in date from you.'
        : status === 'rejected' ? 'See the reason below. You can fix your application and send it again.'
        : '',
    },
    {
      key: 'contract',
      label: 'Sign your rent contract',
      state: contractState,
      tone: 'action',
      note: contractState === 'current' ? 'Read the contract, sign it, and upload the signed copy.' : '',
    },
    {
      key: 'payment',
      label: 'Pay your move-in bill',
      state: paymentState,
      tone: verifying ? 'waiting' : 'action',
      note: paymentState === 'current'
        ? (verifying ? 'Your payment is being verified by management.' : `One month's advance rent and a one-month security deposit${amount ? `: ${amount}` : ''}.`)
        : paymentState === 'upcoming' && amount ? amount : '',
    },
    {
      key: 'movein',
      label: 'Move-in day',
      state: moveInState,
      tone: 'waiting',
      note: moveInState === 'current'
        ? (app.move_in_date ? `Scheduled for ${longDate(app.move_in_date)}.` : 'Payment confirmed. Management will tell you your move-in date.')
        : '',
      date: moveInState === 'done' || moveInState === 'current' ? longDate(app.move_in_date) : '',
    },
    {
      key: 'movedin',
      label: 'Moved in',
      state: housed ? 'done' : 'upcoming',
      note: housed ? 'Welcome home. Your room details are on My Room.' : '',
    },
  ];

  // The step a cancelled application stopped at says so; the rest are not shown as pending.
  if (cancelledAt) {
    return steps.map((s) => (s.state === 'stopped'
      ? { ...s, label: 'Application cancelled', note: 'No payment is needed for this application.' }
      : s));
  }
  return steps;
}
