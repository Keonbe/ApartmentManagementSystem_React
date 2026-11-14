import { useState } from 'react';
import { ACTION_LABELS, STATUS_STYLES, peso, statusLabel, when } from '../utils/refundFormat';

// Shared by the tenant page (UserRefunds) and the admin page (AdminRefunds).

export function StatusBadge({ status }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[status] || STATUS_STYLES.Cancelled}`}>{statusLabel(status)}</span>;
}

// Timestamped status trail, oldest first.
export function RefundTrail({ events }) {
  if (!events?.length) return null;
  return (
    <ol className="m-0 mt-3 list-none space-y-2 border-l-2 border-slate-200 pl-4 p-0">
      {events.map((e, i) => (
        <li key={i} className="text-xs text-slate-600">
          <span className="font-bold text-slate-800">{ACTION_LABELS[e.action] || e.action}</span>
          <span className="text-slate-400"> · {e.actorName || (e.actorRole === 'admin' ? 'Admin' : e.actorRole === 'system' ? 'System' : 'Tenant')} · {when(e.createdAt)}</span>
          {e.message ? <p className="m-0 mt-0.5 whitespace-pre-wrap text-slate-600">{e.message}</p> : null}
        </li>
      ))}
    </ol>
  );
}

// New request form. `eligible` = { advance, overpayments: [{ invoiceId, label, amount }] }.
export function RefundForm({ eligible, onSubmit, busy }) {
  const [type, setType] = useState('advance');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const overpayments = eligible?.overpayments || [];
  const advance = eligible?.advance || 0;
  const options = [];
  if (advance > 0) options.push('advance');
  if (overpayments.length) options.push('overpayment');

  if (!options.length) {
    return <p className="m-0 text-sm text-slate-500">There is no advance rent or overpayment available to refund right now.</p>;
  }

  const activeType = options.includes(type) ? type : options[0];
  const selectedOver = overpayments.find((o) => o.invoiceId === (invoiceId || overpayments[0]?.invoiceId));
  const max = activeType === 'advance' ? advance : (selectedOver?.amount || 0);

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      type: activeType,
      invoice_id: activeType === 'overpayment' ? (selectedOver?.invoiceId || '') : '',
      amount: Number(amount),
      reason: reason.trim(),
    }, () => { setAmount(''); setReason(''); });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-bold text-slate-600">What to refund
          <select value={activeType} onChange={(e) => { setType(e.target.value); setAmount(''); }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal">
            {options.includes('advance') && <option value="advance">Advance rent (up to {peso(advance)})</option>}
            {options.includes('overpayment') && <option value="overpayment">Overpayment</option>}
          </select>
        </label>
        {activeType === 'overpayment' && (
          <label className="block text-xs font-bold text-slate-600">Overpaid bill
            <select value={selectedOver?.invoiceId || ''} onChange={(e) => { setInvoiceId(e.target.value); setAmount(''); }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal">
              {overpayments.map((o) => <option key={o.invoiceId} value={o.invoiceId}>{o.label} — {peso(o.amount)} extra</option>)}
            </select>
          </label>
        )}
        <label className="block text-xs font-bold text-slate-600">Amount (max {peso(max)})
          <input type="number" min="0.01" step="0.01" max={max} required value={amount} onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal" />
        </label>
      </div>
      {activeType === 'advance' && (
        <p className="m-0 text-xs text-slate-500">Advance rent is refunded in whole months, oldest first. Enter the full amount of one or more months.</p>
      )}
      <label className="block text-xs font-bold text-slate-600">Reason
        <textarea required maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal" />
      </label>
      <button type="submit" disabled={busy}
        className="cursor-pointer rounded-lg border-0 bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
        {busy ? 'Sending…' : 'Submit refund request'}
      </button>
    </form>
  );
}
