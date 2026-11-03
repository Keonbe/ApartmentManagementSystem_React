export const peso = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n) || 0);
export const when = (v) => v
  ? new Date(String(v).replace(' ', 'T')).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '';

export const STATUS_STYLES = {
  'Pending Review': 'bg-amber-100 text-amber-800',
  'Info Requested': 'bg-sky-100 text-sky-800',
  Approved: 'bg-indigo-100 text-indigo-800',
  Refunded: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-600',
};

export const TYPE_LABELS = { advance: 'Advance rent', overpayment: 'Overpayment', rejected_application: 'Rejected application payment', rejected_charge: 'Rejected charge', online_payment: 'Online payment not applied' };

// PayMongo's own refund states, as shown next to a refund paid out online.
export const GATEWAY_LABELS = {
  requesting: 'Sending to PayMongo',
  pending: 'Pending at PayMongo',
  processing: 'Processing at PayMongo',
  succeeded: 'Returned to the payer',
  failed: 'Failed at PayMongo',
};

export const ACTION_LABELS = {
  raised: 'Request raised',
  request_info: 'Question sent to tenant',
  reply: 'Tenant replied',
  approve: 'Approved',
  reject: 'Rejected',
  mark_refunded: 'Refund paid out',
  cancel: 'Cancelled',
};

