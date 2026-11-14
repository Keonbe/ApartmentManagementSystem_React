import { t, dateLocale } from '../config/i18n';

export const peso = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n) || 0);
export const when = (v) => v
  ? new Date(String(v).replace(' ', 'T')).toLocaleString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '';

// The label tables below are getters, so each is read in the language chosen at
// the moment it is shown. Keys (the status and type values) are the database's
// and are never translated: only the text a person reads.
const labels = (prefix, keys) => Object.defineProperties({}, Object.fromEntries(
  keys.map((k) => [k, { enumerable: true, get: () => t(`${prefix}.${k}`) }]),
));

// The words for a refund request's status ('Pending Review', 'Refunded' ...).
export const statusLabel = (status) => {
  const key = { 'Pending Review': 'pendingReview', 'Info Requested': 'infoRequested' }[status] || String(status || '').toLowerCase();
  const text = t(`refund.status.${key}`);
  return text === `refund.status.${key}` ? String(status || '') : text;
};

export const STATUS_STYLES = {
  'Pending Review': 'bg-amber-100 text-amber-800',
  'Info Requested': 'bg-sky-100 text-sky-800',
  Approved: 'bg-indigo-100 text-indigo-800',
  Refunded: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-600',
};

export const TYPE_LABELS = labels('refund.type', ['advance', 'overpayment', 'rejected_application', 'rejected_charge', 'deposit', 'online_payment']);

// PayMongo's own refund states, as shown next to a refund paid out online.
export const GATEWAY_LABELS = labels('refund.gateway', ['requesting', 'pending', 'processing', 'succeeded', 'failed']);

export const ACTION_LABELS = labels('refund.action', ['raised', 'request_info', 'reply', 'approve', 'reject', 'mark_refunded', 'cancel']);

