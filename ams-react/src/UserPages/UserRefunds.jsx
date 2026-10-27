import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillTransfer } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { RefundForm, RefundTrail, StatusBadge } from '../Components/RefundParts';
import ConfirmDialog from '../Components/ConfirmDialog';
import { TYPE_LABELS, peso, when } from '../utils/refundFormat';

export default function UserRefunds() {
  const [requests, setRequests] = useState([]);
  const [eligible, setEligible] = useState({ advance: 0, overpayments: [] });
  const [loading, setLoading] = useState(true);
  // Which action is running: 'form' (new request) or a request id. One shared
  // flag used to disable every card while any one of them was busy.
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null); // { ok, text }
  const [replies, setReplies] = useState({});
  const [cancelId, setCancelId] = useState(null); // the request being cancelled (asked in a dialog)

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_refund_requests.php');
      if (res.data.success) {
        setRequests(res.data.requests || []);
        setEligible(res.data.eligible || { advance: 0, overpayments: [] });
      }
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load your refunds.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const call = async (key, endpoint, body, okText, done) => {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    try {
      const res = await api.post(endpoint, body);
      setNotice({ ok: !!res.data.success, text: res.data.success ? okText : res.data.message });
      if (res.data.success) { done?.(); await load(); }
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-76px)] w-full bg-slate-50 px-4 py-6 sm:py-10 md:px-12 box-border flex flex-col items-center">
      <div className="w-full max-w-[1000px] space-y-6 text-left">
        <div className="border-b border-slate-200 pb-4">
          <h1 className="m-0 flex items-center gap-3 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#3b4276' }}>
            <FontAwesomeIcon icon={faMoneyBillTransfer} className="text-2xl text-indigo-500 sm:text-3xl" />
            My Refunds
          </h1>
          <p className="m-0 mt-2 text-sm text-slate-500">Ask for advance rent or an overpayment back. Management reviews every request and may ask you for more information. The security deposit is not refundable.</p>
        </div>

        {notice && (
          <div role="status" className={`rounded-lg border p-3 text-sm font-semibold ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{notice.text}</div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="m-0 mb-3 text-lg font-bold text-slate-800">Request a refund</h2>
          <RefundForm eligible={eligible} busy={busy === 'form'}
            onSubmit={(body, reset) => call('form', 'create_refund_request.php', body, 'Refund request submitted. We will review it shortly.', reset)} />
        </section>

        <section className="space-y-4">
          <h2 className="m-0 text-lg font-bold text-slate-800">Your requests</h2>
          {loading ? <p className="text-sm text-slate-500">Loading…</p> : requests.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">You have not asked for a refund yet.</p>
          ) : requests.map((r) => (
            <article key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="m-0 text-base font-bold text-slate-800">{TYPE_LABELS[r.type] || r.type || 'Refund'} · {peso(r.amount)}</h3>
                  <p className="m-0 text-xs text-slate-500">Request #{r.id} · {when(r.createdAt)}{r.raisedByRole === 'admin' ? ' · opened by management' : ''}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="m-0 mt-2 whitespace-pre-wrap text-sm text-slate-600">{r.reason}</p>
              {r.status === 'Refunded' && <p className="m-0 mt-2 text-sm font-semibold text-emerald-700">Paid out via {r.payoutMethod || 'the agreed method'}{r.payoutReference ? ` (ref ${r.payoutReference})` : ''}{r.refundedAt ? ` on ${when(r.refundedAt)}` : ''}.</p>}
              {r.status === 'Rejected' && <p className="m-0 mt-2 text-sm font-semibold text-rose-700">{r.decisionReason ? `Reason: ${r.decisionReason}` : 'Management did not approve this refund.'}</p>}
              <RefundTrail events={r.events} />

              {r.status === 'Info Requested' && (
                <div className="mt-4 space-y-2">
                  <textarea rows={2} maxLength={1000} value={replies[r.id] || ''} placeholder="Write your reply"
                    onChange={(e) => setReplies((p) => ({ ...p, [r.id]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 p-2 text-base sm:text-sm" />
                  <button type="button" disabled={busy === r.id || !(replies[r.id] || '').trim()}
                    onClick={() => call(r.id, 'respond_refund_request.php', { id: r.id, action: 'reply', message: replies[r.id] }, 'Reply sent.', () => setReplies((p) => ({ ...p, [r.id]: '' })))}
                    className="cursor-pointer rounded-lg border-0 bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">Send reply</button>
                </div>
              )}
              {(r.status === 'Pending Review' || r.status === 'Info Requested') && (
                <button type="button" disabled={busy === r.id}
                  onClick={() => setCancelId(r.id)}
                  className="mt-3 min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-sm font-bold text-rose-700 hover:underline">Cancel request</button>
              )}
            </article>
          ))}
        </section>
      </div>

      {cancelId !== null && (
        <ConfirmDialog
          title="Cancel this refund request?"
          message="Management will no longer review it. You can send a new request later."
          confirmLabel="Yes, cancel request"
          busy={busy === cancelId}
          onConfirm={async () => {
            await call(cancelId, 'respond_refund_request.php', { id: cancelId, action: 'cancel' }, 'Refund request cancelled.');
            setCancelId(null);
          }}
          onClose={() => setCancelId(null)}
        />
      )}
    </div>
  );
}
