import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillTransfer } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { RefundForm, RefundTrail, StatusBadge } from '../Components/RefundParts';
import ConfirmDialog from '../Components/ConfirmDialog';
import { TYPE_LABELS, peso, when } from '../utils/refundFormat';
import { useLang } from '../config/i18n';
import { Bone, SkeletonGroup } from '../Components/tenant/Skeleton';
import DepositStatement from '../Components/DepositStatement';

export default function UserRefunds() {
  const { t } = useLang();
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
      setNotice({ ok: false, text: apiErrorMessage(err, t('refunds.loadFailed')) });
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      // Usually refused because management changed the request meanwhile:
      // show its current state instead of the stale one.
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    // Inside AccountLayout (App.jsx), which gives the page its width, padding and side menu.
    <div className="w-full">
      <div className="page-enter w-full space-y-6 text-left">
        <div className="border-b border-slate-200 pb-4">
          <h1 className="m-0 flex items-center gap-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-brand">
            <FontAwesomeIcon icon={faMoneyBillTransfer} className="text-2xl text-indigo-500 sm:text-3xl" />
            {t('topbar.myRefunds')}
          </h1>
          <p className="m-0 mt-2 text-sm text-slate-500">{t('refunds.intro')}</p>
        </div>

        {notice && (
          <div role="status" className={`animate-fade-in rounded-lg border p-3 text-sm font-semibold ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{notice.text}</div>
        )}

        <DepositStatement />

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="m-0 mb-3 text-lg font-bold text-slate-800">{t('refunds.requestTitle')}</h2>
          {/* The form shows what can be refunded, so it waits for the same read as the list. */}
          {loading ? (
            <SkeletonGroup label={t('common.loading')} className="space-y-3">
              <Bone className="h-4 w-2/3" />
              <Bone className="h-11 w-full rounded-lg" />
              <Bone className="h-20 w-full rounded-lg" />
              <Bone className="h-11 w-40 rounded-lg" />
            </SkeletonGroup>
          ) : (
            <div className="animate-fade-in">
              <RefundForm eligible={eligible} busy={busy === 'form'}
                onSubmit={(body, reset) => call('form', 'create_refund_request.php', body, t('refunds.submitted'), reset)} />
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="m-0 text-lg font-bold text-slate-800">{t('refunds.yourRequests')}</h2>
          {loading ? (
            <SkeletonGroup label={t('common.loading')} className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <Bone className="h-4 w-48 max-w-full" />
                      <Bone className="h-3 w-32" />
                    </div>
                    <Bone className="h-6 w-24 rounded-full" />
                  </div>
                  <Bone className="h-3 w-full" />
                  <Bone className="h-3 w-3/4" />
                </div>
              ))}
            </SkeletonGroup>
          ) : requests.length === 0 ? (
            <p className="animate-fade-in rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{t('refunds.none')}</p>
          ) : requests.map((r, i) => (
            <article key={r.id} style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }} className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="m-0 text-base font-bold text-slate-800">{TYPE_LABELS[r.type] || r.type || t('notifications.type.refund_update')} · {peso(r.amount)}</h3>
                  <p className="m-0 text-xs text-slate-500">{t('refunds.requestNo', { id: r.id })} · {when(r.createdAt)}{r.raisedByRole === 'admin' ? ` · ${t('refunds.openedByManagement')}` : ''}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="m-0 mt-2 whitespace-pre-wrap text-sm text-slate-600">{r.reason}</p>
              {r.dueDate && ['Pending Review', 'Info Requested', 'Approved'].includes(r.status) && (
                <p className={`m-0 mt-1 text-xs font-semibold ${r.overdue ? 'text-rose-700' : 'text-slate-500'}`}>{t(r.overdue ? 'refunds.overdue' : 'refunds.dueBy', { date: r.dueDate })}</p>
              )}
              {r.status === 'Refunded' && <p className="m-0 mt-2 text-sm font-semibold text-emerald-700">{t('refunds.paidOutVia', { method: r.payoutMethod || t('refunds.agreedMethod') })}{r.payoutReference ? ` (${t('refunds.ref', { ref: r.payoutReference })})` : ''}{r.refundedAt ? ` ${t('refunds.on', { date: when(r.refundedAt) })}` : ''}.</p>}
              {r.status === 'Rejected' && <p className="m-0 mt-2 text-sm font-semibold text-rose-700">{r.decisionReason ? t('refunds.reason', { reason: r.decisionReason }) : t('refunds.notApproved')}</p>}
              <RefundTrail events={r.events} />

              {r.status === 'Info Requested' && (
                <div className="mt-4 space-y-2">
                  <textarea rows={2} maxLength={1000} value={replies[r.id] || ''} placeholder={t('refunds.replyPlaceholder')}
                    onChange={(e) => setReplies((p) => ({ ...p, [r.id]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 p-2 text-base sm:text-sm" />
                  <button type="button" disabled={busy === r.id || !(replies[r.id] || '').trim()}
                    onClick={() => call(r.id, 'respond_refund_request.php', { id: r.id, action: 'reply', message: replies[r.id] }, t('refunds.replySent'), () => setReplies((p) => ({ ...p, [r.id]: '' })))}
                    className="min-h-[44px] cursor-pointer rounded-lg border-0 bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{t('refunds.sendReply')}</button>
                </div>
              )}
              {(r.status === 'Pending Review' || r.status === 'Info Requested') && r.type !== 'deposit' && (
                <button type="button" disabled={busy === r.id}
                  onClick={() => setCancelId(r.id)}
                  className="mt-3 min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-sm font-bold text-rose-700 hover:underline">{t('refunds.cancelRequest')}</button>
              )}
            </article>
          ))}
        </section>
      </div>

      {cancelId !== null && (
        <ConfirmDialog
          title={t('refunds.cancelTitle')}
          message={t('refunds.cancelBody')}
          confirmLabel={t('refunds.cancelYes')} cancelLabel={t('visitors.keepIt')}
          busy={busy === cancelId}
          onConfirm={async () => {
            await call(cancelId, 'respond_refund_request.php', { id: cancelId, action: 'cancel' }, t('refunds.cancelled'));
            setCancelId(null);
          }}
          onClose={() => setCancelId(null)}
        />
      )}
    </div>
  );
}
