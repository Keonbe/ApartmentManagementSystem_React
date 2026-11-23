import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faCheck, faRotateLeft } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import fileUrl from '../../api/fileUrl';
import { apiErrorMessage } from '../../utils/apiError';
import askConfirm from '../../utils/askConfirm';
import ReasonModal from '../form/ReasonModal';
import { btn } from './ui/styles';
import { SIGNED_REVIEW, SIGNED_REJECT_REASONS, isImagePath } from '../../config/signedContract';

// The tenant's signed rent contract and the office's check of it, on Applications
// and in a contract's details (review_signed_contract.php).
//   <SignedContractReview contract={{ id, signedPath, review, note, uploadedAt }}
//     onPreview={(storedPath, title) => …} onChanged={reload} />
// onPreview gets the stored path (as the page's own preview takes it); without it the
// copy opens in a new tab. Accepting sends the
// path the admin is looking at, so a newer upload is never accepted unseen (409).
const day = (v) => {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function SignedContractReview({ contract, onPreview, onChanged, tenantName = 'The tenant' }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  if (!contract) return null;

  const review = contract.signedPath ? (contract.review || 'accepted') : null;
  const tone = SIGNED_REVIEW[review || 'none'];
  const url = contract.signedPath ? fileUrl(contract.signedPath) : null;
  const image = isImagePath(contract.signedPath);
  const open = () => (onPreview ? onPreview(contract.signedPath, 'Signed rent contract') : window.open(url, '_blank', 'noopener'));

  const decide = async (decision, note) => {
    const res = await api.post('review_signed_contract.php', { contractId: contract.id, decision, note, path: contract.signedPath });
    if (res.data?.success === false) throw new Error(res.data.message || 'The review was not saved.');
    await onChanged?.();
  };
  const accept = async () => {
    if (busy) return;
    if (!(await askConfirm(`${tenantName} is told their signed contract was accepted.`, { title: 'Accept the signed contract?', tone: 'primary', confirmLabel: 'Accept' }))) return;
    setBusy(true);
    setError('');
    try { await decide('accept'); } catch (err) { setError(apiErrorMessage(err, err?.message || 'The review was not saved.')); } finally { setBusy(false); }
  };

  return (
    <div className={`rounded-control border p-4 ${tone.box}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {image ? (
            <button type="button" onClick={open} className="h-14 w-11 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white p-0 cursor-pointer" aria-label="Open the signed contract">
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ) : (
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${tone.tile}`} aria-hidden="true">
              <FontAwesomeIcon icon={tone.icon} />
            </span>
          )}
          <div className="min-w-0">
            <p className="m-0 flex flex-wrap items-center gap-2 text-label font-semibold text-slate-800">
              Signed contract
              <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ring-1 ring-inset ${tone.chip}`}>{tone.label}</span>
            </p>
            <p className="m-0 mt-0.5 text-caption text-slate-600">
              {tone.text}{contract.uploadedAt ? ` Uploaded ${day(contract.uploadedAt)}.` : ''}
            </p>
            {review === 'rejected' && contract.note && (
              <p className="m-0 mt-1 text-caption text-rose-800">Your note: {contract.note}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {url && (
            <button type="button" onClick={open} className={btn('secondary', 'sm')}>
              <FontAwesomeIcon icon={faEye} aria-hidden="true" /> View
            </button>
          )}
          {review === 'pending' && (
            <>
              <button type="button" disabled={busy} onClick={() => setAsking(true)} className={btn('secondary', 'sm')}>
                <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" /> Ask for a new copy
              </button>
              <button type="button" disabled={busy} onClick={accept} className={btn('primary', 'sm')}>
                <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> {busy ? 'Saving…' : 'Accept'}
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p role="alert" className="m-0 mt-2 text-caption font-semibold text-red-600">{error}</p>}

      {asking && (
        <ReasonModal
          title="Ask for a new copy"
          description={`${tenantName} is notified with this note and can upload a new copy from Track Application.`}
          label="What should they fix?"
          confirmLabel="Send back"
          tone="indigo"
          max={255}
          suggestions={SIGNED_REJECT_REASONS}
          onConfirm={async (note) => { await decide('reject', note); setAsking(false); }}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}
