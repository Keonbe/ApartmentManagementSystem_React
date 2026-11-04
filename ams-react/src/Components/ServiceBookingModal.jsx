import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faTimes } from '@fortawesome/free-solid-svg-icons';
import Modal from './admin/Modal';
import InlineAlert from './InlineAlert';
import { btn } from './admin/ui/styles';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { apiErrorMessage } from '../utils/apiError';
import { localDateString } from '../utils/validation';

const STATUS_STYLE = {
  'Pending': 'bg-amber-100 text-amber-700',
  'Approved': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-indigo-100 text-indigo-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'Rejected': 'bg-red-100 text-red-700',
  'Cancelled': 'bg-red-100 text-red-700',
};
const WINDOWS = [['morning', 'Morning (8AM–12PM)'], ['afternoon', 'Afternoon (1PM–5PM)']];
const money = (v) => `₱${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyLabel = (v) => String(Number(v));

// One place to act on a service booking: confirm the visit, assign someone, write the
// tenant a note, adjust the real quantity at completion, or reject/cancel with a reason.
// The parent mounts it with key={req.id}, so each booking starts with fresh drafts.
export default function ServiceBookingModal({ req, onClose, onSaved }) {
  const [visitDate, setVisitDate] = useState(req.scheduledDate || req.preferredDate || '');
  const [visitWindow, setVisitWindow] = useState(req.scheduledWindow || (['morning', 'afternoon'].includes(req.preferredTimeSlot) ? req.preferredTimeSlot : 'morning'));
  const [assignee, setAssignee] = useState(req.assignedTo || '');
  const [note, setNote] = useState('');
  const [finalQty, setFinalQty] = useState(String(req.quantity ?? 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [billingMessage, setBillingMessage] = useState('');

  const open = ['Pending', 'Approved', 'In Progress'].includes(req.status);
  const perSession = req.pricingUnit === 'session';
  const unitPrice = Number(req.unitPrice || 0);
  const previewQty = Number(finalQty);
  const previewTotal = Number.isFinite(previewQty) && previewQty > 0 ? Math.round(unitPrice * previewQty * 100) / 100 : null;
  const slotChanged = visitDate !== (req.scheduledDate || '') || visitWindow !== (req.scheduledWindow || '');

  const submit = async (extra, { withSchedule, withAssignee, withNote } = {}) => {
    setError('');
    setFieldErrors({});
    const body = { rawId: req.rawId || req.id, ...extra };
    if (withSchedule && visitDate) { body.scheduledDate = visitDate; body.scheduledWindow = visitWindow; }
    if (withAssignee && assignee.trim() !== (req.assignedTo || '')) body.assignedTo = assignee.trim();
    if (withNote && note.trim() !== '') body.adminNotes = note.trim();
    // A reject or cancel always carries the note: the tenant reads it as the reason.
    if (['Rejected', 'Cancelled'].includes(extra.status)) {
      if (!note.trim()) { setFieldErrors({ adminNotes: 'Write the reason the tenant will see.' }); return; }
      body.adminNotes = note.trim();
    }
    setSaving(true);
    try {
      const res = await api.post('update_service_status.php', body);
      if (!res.data?.success) {
        setError(res.data?.message || 'Could not update the booking.');
        return;
      }
      if (res.data.warning) {
        // The status change stands; the charge can be retried from the table.
        setBillingMessage(`Saved, but the charge was not billed: ${res.data.warning}`);
        onSaved({ keepOpen: true });
        return;
      }
      onSaved({ message: res.data.billed && res.data.invoiceId ? `Marked ${extra.status || req.status}. The charge was added to invoice ${res.data.invoiceId}.` : null });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update the booking.'));
      setFieldErrors(err.response?.data?.errors || {});
    } finally {
      setSaving(false);
    }
  };

  const fieldCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-control outline-none text-slate-800 bg-white focus:border-indigo-500';
  const errorText = (name) => fieldErrors[name] && <p className="text-caption text-red-600 m-0 mt-1">{fieldErrors[name]}</p>;

  return (
    <Modal title={`${req.serviceName} booking`} busy={saving} onClose={onClose} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      className="bg-white rounded-card shadow-dialog w-full max-w-3xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
      {/* Left: the booking */}
      <div className="flex-1 min-w-0 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${STATUS_STYLE[req.status] || ''}`}>{req.status}</span>
            <span className="rounded-full px-2 py-0.5 text-caption font-semibold bg-white text-slate-600 ring-1 ring-inset ring-slate-200 capitalize">{req.category}</span>
            {req.cancelRequestedAt && <span className="rounded-full px-2 py-0.5 text-caption font-semibold bg-red-50 text-red-700">Cancel requested</span>}
          </div>
          <h2 className="text-section font-bold text-slate-800 m-0">{req.serviceName}</h2>
          <p className="text-label text-slate-500 m-0 mt-1">{req.tenant || 'Unknown'} · Unit {req.unit}</p>
        </div>

        <div className="p-6 space-y-4">
          {req.cancelRequestedAt && open && (
            <div className="bg-red-50 border border-red-200 rounded-control p-4 text-body text-red-700">
              <p className="m-0 mb-3"><strong>The tenant asked to cancel</strong> because the visit is close or already started.</p>
              <div className="flex gap-2 flex-wrap">
                <button type="button" disabled={saving} onClick={() => submit({ status: 'Cancelled' })} className={btn('secondary', 'md')}>Cancel booking</button>
                <button type="button" disabled={saving} onClick={() => submit({ declineCancel: true })} className={btn('secondary', 'md')}>Keep booking</button>
              </div>
              <p className="text-caption m-0 mt-2">To cancel, write the reason in the note on the right first.</p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body m-0">
            <div><dt className="text-caption text-slate-500">Booked</dt><dd className="m-0 font-medium text-slate-800">{perSession ? '1 session' : `${qtyLabel(req.bookedQuantity ?? req.quantity)} ${req.pricingUnit}`}</dd></div>
            <div><dt className="text-caption text-slate-500">Price</dt><dd className="m-0 font-medium text-slate-800">{money(unitPrice)} / {req.pricingUnit}</dd></div>
            <div><dt className="text-caption text-slate-500">Tenant asked for</dt><dd className="m-0 font-medium text-slate-800">{req.preferredDate} ({req.preferredTimeSlot})</dd></div>
            <div><dt className="text-caption text-slate-500">Total</dt><dd className="m-0 font-semibold text-indigo-600">{money(req.totalCost)}</dd></div>
          </dl>
          {req.bookedTotalCost !== null && req.bookedTotalCost !== undefined && Number(req.bookedTotalCost) !== Number(req.totalCost) && (
            <p className="text-label text-violet-700 bg-violet-50 border border-violet-200 rounded-control p-2 m-0">
              Adjusted at completion: {qtyLabel(req.bookedQuantity)} → {qtyLabel(req.quantity)} {req.pricingUnit}, {money(req.bookedTotalCost)} → {money(req.totalCost)}.
            </p>
          )}

          <div>
            <h4 className="text-label font-medium text-slate-600 m-0 mb-1">Tenant notes</h4>
            <div className="bg-slate-50 border border-slate-100 rounded-control p-3 text-body text-slate-700 whitespace-pre-wrap">{req.notes || 'No notes.'}</div>
          </div>
          {req.attachmentPath && (
            <a href={fileUrl(req.attachmentPath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-label font-semibold text-indigo-600 no-underline hover:underline">
              <FontAwesomeIcon icon={faEye} /> View reference photo
            </a>
          )}
          {req.rating ? (
            <div className="bg-amber-50 border border-amber-200 rounded-control p-3 text-body text-amber-900">
              <p className="m-0 font-semibold" aria-label={`${req.rating} out of 5 stars`}>{'★'.repeat(req.rating)}{'☆'.repeat(5 - req.rating)}</p>
              {req.ratingComment && <p className="m-0 mt-1 text-label">“{req.ratingComment}”</p>}
            </div>
          ) : null}
          {req.isInvoiced ? (
            <p className="text-label text-emerald-700 m-0">Billed to {req.invoiceId} ({req.billingPeriod}).</p>
          ) : null}
          {billingMessage && <InlineAlert>{billingMessage}</InlineAlert>}
        </div>
      </div>

      {/* Right: decide */}
      <div className="w-full md:w-80 shrink-0 flex flex-col bg-slate-50 overflow-y-auto">
        <div className="px-6 py-3 flex justify-end">
          <button type="button" aria-label="Close" onClick={onClose} disabled={saving} className="p-1 text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-xl" /></button>
        </div>
        <div className="px-6 pb-6 flex flex-col gap-4">
          <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>

          {open && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="svc-visitDate" className="block text-label font-medium text-slate-600">Confirmed visit</label>
                  <button type="button" className="text-caption font-semibold text-indigo-600 bg-transparent border-0 cursor-pointer p-0 hover:underline"
                    onClick={() => { setVisitDate(req.preferredDate || ''); if (['morning', 'afternoon'].includes(req.preferredTimeSlot)) setVisitWindow(req.preferredTimeSlot); }}>
                    Use tenant's
                  </button>
                </div>
                <div className="flex gap-2">
                  <input id="svc-visitDate" type="date" value={visitDate} min={localDateString()} onChange={e => setVisitDate(e.target.value)} className={`${fieldCls} flex-1 min-w-0`} />
                  <select aria-label="Visit window" value={visitWindow} onChange={e => setVisitWindow(e.target.value)} className={`${fieldCls} w-auto cursor-pointer`}>
                    {WINDOWS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                {errorText('scheduledDate')}{errorText('scheduledWindow')}
              </div>
              <div>
                <label htmlFor="svc-assignee" className="block text-label font-medium text-slate-600 mb-1">Assigned to</label>
                <input id="svc-assignee" type="text" maxLength={100} value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Staff or provider" className={fieldCls} />
                {errorText('assignedTo')}
              </div>
            </>
          )}

          {!['Rejected', 'Cancelled'].includes(req.status) && (
            <div>
              <label htmlFor="svc-note" className="block text-label font-medium text-slate-600 mb-1">Note to tenant{open || req.status === 'Completed' ? ' (required to reject or cancel)' : ''}</label>
              <textarea id="svc-note" rows={3} maxLength={500} value={note} onChange={e => { setNote(e.target.value); setFieldErrors({}); }} placeholder={req.adminNotes ? 'Write a new note to replace the current one' : 'Shown to the tenant on My Requests'} className={`${fieldCls} resize-none`} />
              {req.adminNotes && <p className="text-caption text-slate-500 m-0 mt-1">Current note: {req.adminNotes}</p>}
              {errorText('adminNotes')}
            </div>
          )}

          {(req.status === 'Approved' || req.status === 'In Progress') && !perSession && (
            <div>
              <label htmlFor="svc-finalQty" className="block text-label font-medium text-slate-600 mb-1">Final quantity ({req.pricingUnit})</label>
              <input id="svc-finalQty" type="number" min="0" step={req.pricingUnit === 'item' ? '1' : '0.01'} inputMode="decimal" value={finalQty} onChange={e => { setFinalQty(e.target.value); setFieldErrors({}); }} className={fieldCls} />
              {errorText('finalQuantity')}
              <p className="text-caption text-slate-500 m-0 mt-1">
                Set the real amount when completing (e.g. laundry weight).{previewTotal !== null && <> Total: <strong>{money(previewTotal)}</strong>.</>} The tenant is told if it differs from the booking.
              </p>
            </div>
          )}

          {/* Actions follow SERVICE_TRANSITIONS */}
          <div className="flex flex-col gap-2 pt-1">
            {req.status === 'Pending' && (
              <>
                <button type="button" disabled={saving || !visitDate} onClick={() => submit({ status: 'Approved' }, { withSchedule: true, withAssignee: true, withNote: true })} className={btn('primary', 'md', 'w-full')}>
                  {saving ? 'Saving…' : 'Approve & confirm visit'}
                </button>
                <button type="button" disabled={saving} onClick={() => submit({ status: 'Rejected' })} className={btn('secondary', 'md', 'w-full')}>Reject (note required)</button>
              </>
            )}
            {(req.status === 'Approved' || req.status === 'In Progress') && (
              <>
                {(slotChanged || assignee.trim() !== (req.assignedTo || '') || note.trim() !== '') && (
                  <button type="button" disabled={saving || !visitDate} onClick={() => submit({}, { withSchedule: true, withAssignee: true, withNote: true })} className={btn('secondary', 'md', 'w-full')}>Save changes</button>
                )}
                {req.status === 'Approved' && (
                  <button type="button" disabled={saving} onClick={() => submit({ status: 'In Progress' }, { withSchedule: true, withAssignee: true, withNote: true })} className={btn('secondary', 'md', 'w-full')}>Start work</button>
                )}
                <button type="button" disabled={saving} onClick={() => submit({ status: 'Completed', ...(perSession ? {} : { finalQuantity: Number(finalQty) }) }, { withAssignee: true, withNote: true })} className={btn('success', 'md', 'w-full')}>
                  {saving ? 'Saving…' : 'Mark completed & bill'}
                </button>
                <button type="button" disabled={saving} onClick={() => submit({ status: 'Cancelled' })} className={btn('secondary', 'md', 'w-full')}>Cancel booking (note required)</button>
              </>
            )}
            {req.status === 'Completed' && (
              <button type="button" disabled={saving} onClick={() => submit({ status: 'Cancelled' })} className={btn('secondary', 'md', 'w-full')}>
                Reverse charge &amp; cancel (note required)
              </button>
            )}
            {['Rejected', 'Cancelled'].includes(req.status) && (
              <p className="text-label text-slate-500 italic m-0">This booking is closed.{req.adminNotes ? ` Reason: ${req.adminNotes}` : ''}</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
