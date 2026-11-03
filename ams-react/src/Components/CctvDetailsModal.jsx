import { useId, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import useDialog from '../hooks/useDialog';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';

// Everything the tenant entered on a CCTV footage request, for the admin to
// review before approving. Render it only while a request is open:
// <CctvDetailsModal request=… onClose=… onDecide=… initialAction=… />.
// onDecide(status, note) is only offered while the request is Pending, and the
// admin must write a note first: pickup instructions when approving, the reason
// when rejecting. initialAction ('Approved' | 'Rejected') opens that step directly.
const NOTE_MAX = 500;
const FOOTAGE_MAX_BYTES = 25 * 1024 * 1024;
const FOOTAGE_EXT = /\.(mp4|m4v|webm|mov|jpe?g|png|webp)$/i;
const NOTE_HELP = {
  Approved: { label: 'Footage pickup instructions', placeholder: 'Where and when can the tenant view or collect the footage? e.g. Admin office, weekdays 9 AM to 5 PM, bring a valid ID.' },
  Rejected: { label: 'Reason for rejection', placeholder: 'Tell the tenant why this request cannot be approved.' },
};
const STATUS_CLS = {
  Pending: 'bg-amber-100 text-amber-700',
  Approved: 'bg-emerald-100 text-emerald-700',
};

const formatStamp = (value) => {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

function Field({ label, children, full = false }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-caption font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="m-0 mt-1 text-body text-slate-800 break-words">{children}</dd>
    </div>
  );
}

export default function CctvDetailsModal({ request, incidentLabel, onClose, onDecide, initialAction = null, footageDays = 14, onFootageChange }) {
  const titleId = useId();
  const noteId = useId();
  const [action, setAction] = useState(initialAction);
  const [note, setNote] = useState('');
  const [footageMode, setFootageMode] = useState('file');
  const [footageFile, setFootageFile] = useState(null);
  const [footageLink, setFootageLink] = useState('');
  const [footageBusy, setFootageBusy] = useState(false);
  const [footageError, setFootageError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const fileId = useId();
  const linkId = useId();
  const ref = useDialog(true, onClose);
  if (!request) return null;

  const footageActive = !!request.footageKind && !Number(request.footageExpired);
  const showFootageForm = request.status === 'Approved' && (!footageActive || replacing);

  const pickFootage = (event) => {
    const file = event.target.files?.[0] ?? null;
    setFootageError('');
    if (file && !FOOTAGE_EXT.test(file.name)) { setFootageError('Choose an MP4, WEBM or MOV video, or a JPG, PNG or WEBP image.'); setFootageFile(null); return; }
    if (file && file.size > FOOTAGE_MAX_BYTES) { setFootageError('That file is over 25MB. Paste a link for longer footage.'); setFootageFile(null); return; }
    setFootageFile(file);
  };

  const attachFootage = async () => {
    setFootageError('');
    const form = new FormData();
    form.append('id', request.rawId);
    if (footageMode === 'file') {
      if (!footageFile) { setFootageError('Choose a footage file first.'); return; }
      form.append('file', footageFile);
    } else {
      if (!/^https:\/\/\S+$/i.test(footageLink.trim())) { setFootageError('Paste a full https:// link.'); return; }
      form.append('url', footageLink.trim());
    }
    setFootageBusy(true);
    try {
      const res = await api.post('attach_cctv_footage.php', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!res.data.success) throw res;
      setFootageFile(null); setFootageLink(''); setReplacing(false);
      onFootageChange?.();
    } catch (err) {
      setFootageError(apiErrorMessage(err, 'Could not attach the footage.'));
    } finally {
      setFootageBusy(false);
    }
  };

  const removeFootage = async () => {
    setFootageError('');
    setFootageBusy(true);
    try {
      const res = await api.post('remove_cctv_footage.php', { id: request.rawId });
      if (!res.data.success) throw res;
      onFootageChange?.();
    } catch (err) {
      setFootageError(apiErrorMessage(err, 'Could not remove the footage.'));
    } finally {
      setFootageBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl outline-none text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="m-0 text-lg font-bold text-slate-900">CCTV Request #{request.rawId}</h2>
            <p className="m-0 mt-1 text-label text-slate-500">Filed {formatStamp(request.createdAt)}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${STATUS_CLS[request.status] || 'bg-red-100 text-red-700'}`}>
            {request.status}
          </span>
        </div>

        <dl className="m-0 mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tenant">{request.tenant}</Field>
          <Field label="Unit">{request.unit}</Field>
          <Field label="Incident date">{request.incidentDate || '—'}</Field>
          <Field label="Time window">{request.time || '—'}</Field>
          <Field label="Location">{request.location || '—'}</Field>
          <Field label="Incident type">{incidentLabel || 'Not specified'}</Field>
          <Field label="Reason" full>
            <span className="whitespace-pre-wrap">{request.reason || '—'}</span>
          </Field>
          <Field label="Data privacy consent" full>
            {request.privacyConsentAt ? `Agreed ${formatStamp(request.privacyConsentAt)}` : 'Not recorded (filed before consent was required)'}
          </Field>
        </dl>

        {request.decisionNote && request.status !== 'Pending' && (
          <div className="mt-4 rounded-control bg-slate-50 p-3">
            <p className="m-0 text-caption font-semibold uppercase tracking-wide text-slate-500">
              {request.status === 'Approved' ? NOTE_HELP.Approved.label : NOTE_HELP.Rejected.label}
            </p>
            <p className="m-0 mt-1 whitespace-pre-wrap text-body text-slate-800">{request.decisionNote}</p>
          </div>
        )}

        {request.status === 'Approved' && (
          <div className="mt-4 rounded-control border border-slate-200 p-3">
            <p className="m-0 text-caption font-semibold uppercase tracking-wide text-slate-500">Footage for the tenant</p>
            {footageActive && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-body text-slate-800">
                  {request.footageKind === 'file' ? 'A footage file' : 'A footage link'} is attached. The tenant can open it until {formatStamp(request.footageExpiresAt)}.
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={footageBusy} onClick={() => { setReplacing((v) => !v); setFootageError(''); }} className="min-h-9 rounded-control border border-slate-200 bg-white px-3 text-label font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
                    {replacing ? 'Cancel replace' : 'Replace'}
                  </button>
                  <button type="button" disabled={footageBusy} onClick={removeFootage} className="min-h-9 rounded-control border border-red-200 bg-white px-3 text-label font-semibold text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50">
                    Remove
                  </button>
                </div>
              </div>
            )}
            {!footageActive && request.footageExpiresAt && (
              <p className="m-0 mt-2 text-body text-slate-600">Footage was available until {formatStamp(request.footageExpiresAt)} and has been removed. Attach it again to restart the {footageDays}-day period.</p>
            )}
            {showFootageForm && (
              <div className="mt-2 space-y-2">
                <p className="m-0 text-label text-slate-500">Attach a short clip (up to 25MB) or paste a private link for longer footage. The tenant is notified and can open it for {footageDays} days. It shows other residents, so share it only with this tenant.</p>
                <div className="flex gap-4 text-label text-slate-700">
                  <label className="flex items-center gap-1.5"><input type="radio" name={`${fileId}-mode`} checked={footageMode === 'file'} onChange={() => { setFootageMode('file'); setFootageError(''); }} /> File</label>
                  <label className="flex items-center gap-1.5"><input type="radio" name={`${fileId}-mode`} checked={footageMode === 'link'} onChange={() => { setFootageMode('link'); setFootageError(''); }} /> Link</label>
                </div>
                {footageMode === 'file' ? (
                  <input id={fileId} type="file" aria-label="Footage file" accept=".mp4,.m4v,.webm,.mov,.jpg,.jpeg,.png,.webp,video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp" onChange={pickFootage} className="block w-full text-label" />
                ) : (
                  <input id={linkId} type="url" aria-label="Footage link" value={footageLink} onChange={(e) => { setFootageLink(e.target.value); setFootageError(''); }} maxLength={500} placeholder="https://" className="w-full rounded-control border border-slate-200 px-3 py-2 text-body outline-none focus:border-blue-400" />
                )}
                {footageError && <p role="alert" className="m-0 text-label text-red-600">{footageError}</p>}
                <button type="button" disabled={footageBusy} onClick={attachFootage} className="inline-flex min-h-10 items-center rounded-control border-0 bg-blue-600 px-4 text-label font-semibold text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50">
                  {footageBusy ? 'Working…' : replacing ? 'Replace footage' : 'Attach footage'}
                </button>
              </div>
            )}
            {!showFootageForm && footageError && <p role="alert" className="m-0 mt-2 text-label text-red-600">{footageError}</p>}
          </div>
        )}

        {action && request.status === 'Pending' && onDecide && (
          <div className="mt-4">
            <label htmlFor={noteId} className="text-label font-semibold text-slate-700">
              {action === 'Approved' ? 'Approve' : 'Reject'}: {NOTE_HELP[action].label}
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))}
              rows={3}
              maxLength={NOTE_MAX}
              placeholder={NOTE_HELP[action].placeholder}
              className="mt-1 w-full rounded-control border border-slate-200 p-3 text-body text-slate-800 outline-none focus:border-blue-400"
            />
            <p className="m-0 mt-1 text-right text-caption text-slate-500">{note.length}/{NOTE_MAX}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {request.status === 'Pending' && onDecide && !action && (
            <>
              <button type="button" onClick={() => setAction('Rejected')} className="inline-flex min-h-10 items-center gap-2 rounded-control border border-red-200 bg-white px-4 text-label font-semibold text-red-600 hover:bg-red-50 cursor-pointer">
                <FontAwesomeIcon icon={faTimes} /> Reject
              </button>
              <button type="button" onClick={() => setAction('Approved')} className="inline-flex min-h-10 items-center gap-2 rounded-control border-0 bg-emerald-600 px-4 text-label font-semibold text-white hover:bg-emerald-700 cursor-pointer">
                <FontAwesomeIcon icon={faCheck} /> Approve
              </button>
            </>
          )}
          {request.status === 'Pending' && onDecide && action && (
            <>
              <button type="button" onClick={() => setAction(null)} className="inline-flex min-h-10 items-center rounded-control border border-slate-200 bg-white px-4 text-label font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                Back
              </button>
              <button
                type="button"
                disabled={note.trim() === ''}
                onClick={() => onDecide(action, note.trim())}
                className={`inline-flex min-h-10 items-center gap-2 rounded-control border-0 px-4 text-label font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${action === 'Approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                <FontAwesomeIcon icon={action === 'Approved' ? faCheck : faTimes} /> Confirm {action === 'Approved' ? 'approval' : 'rejection'}
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center rounded-control border border-slate-200 bg-white px-4 text-label font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
