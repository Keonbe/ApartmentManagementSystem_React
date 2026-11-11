import { useState, useEffect, useCallback } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { RefundForm, RefundTrail, StatusBadge } from '../Components/RefundParts';
import { TYPE_LABELS, GATEWAY_LABELS, peso, when } from '../utils/refundFormat';
import FilterTabs from '../Components/admin/ui/FilterTabs';
import LoadError from '../Components/admin/ui/LoadError';
import { SkeletonCards } from '../Components/admin/ui/Skeleton';

const FILTERS = ['all', 'Pending Review', 'Info Requested', 'Approved', 'Refunded', 'Rejected', 'Cancelled'];

export default function AdminRefunds() {
  const [requests, setRequests] = useState([]);
  // The list did not load: shown instead of "No refund requests here."
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState('Pending Review');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [text, setText] = useState({});      // per-request message / reason box
  const [payout, setPayout] = useState({});  // per-request { method, reference }
  const [refundAmounts, setRefundAmounts] = useState({});
  const [tenants, setTenants] = useState([]);
  const [newUserId, setNewUserId] = useState('');
  const [eligible, setEligible] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_refund_requests.php');
      if (res.data.success) { setRequests(res.data.requests || []); setLoadFailed(false); }
      else setLoadFailed(true);
    } catch (err) {
      setLoadFailed(true);
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load refund requests.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!showNew || tenants.length) return undefined;
    const timer = window.setTimeout(() => api.get('get_tenants.php').then((res) => {
      const seen = new Set();
      const list = (res.data.data || []).filter((t) => t.user_id && !seen.has(t.user_id) && seen.add(t.user_id));
      setTenants(list);
    }).catch(() => {}), 0);
    return () => window.clearTimeout(timer);
  }, [showNew, tenants.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!newUserId) { setEligible(null); return; }
      api.get('get_refund_requests.php', { params: { user_id: newUserId } })
        .then((res) => setEligible(res.data.eligible || { advance: 0, overpayments: [] }))
        .catch(() => setEligible(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [newUserId]);

  const call = async (endpoint, body, okText, done) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.post(endpoint, body);
      setNotice({ ok: !!res.data.success, text: res.data.success ? okText : res.data.message });
      if (res.data.success) { done?.(); await load(); }
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err) });
      // Usually refused because the tenant or another admin changed the
      // request meanwhile: show its current state instead of the stale one.
      await load();
    } finally {
      setBusy(false);
    }
  };

  const act = (r, action, okText, extra = {}) => call('update_refund_request.php',
    { id: r.id, action, message: text[r.id] || '', payout_method: payout[r.id]?.method || '', payout_reference: payout[r.id]?.reference || '', ...(action === 'approve' && refundAmounts[r.id] !== undefined ? { amount: Number(refundAmounts[r.id]) } : {}), ...extra },
    okText, () => setText((p) => ({ ...p, [r.id]: '' })));

  // Money returns to the payer's own GCash / card / bank through PayMongo.
  const refundOnline = (r) => {
    if (window.confirm(`Refund ${peso(r.amount)} to ${r.tenantName} through PayMongo? This sends the money back and cannot be undone.`)) {
      act(r, 'mark_refunded', 'Refund sent through PayMongo.', { gateway: true });
    }
  };

  const shown = requests.filter((r) => filter === 'all' || r.status === filter);
  const btn = 'cursor-pointer rounded-control border-0 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50';

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 text-left font-sans">
        <Header title="Refund Requests" />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            <p className="m-0 text-body text-slate-500">Advance rent and overpayments only; the security deposit is not refundable. Approving a request does not move money. Money paid online can be sent back through PayMongo from here; anything else is paid by hand and the payout recorded.</p>

            {notice && <div role="status" className={`rounded-control border p-3 text-body font-semibold ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>}

            <div className="flex flex-wrap items-center gap-2">
              <FilterTabs
                label="Filter refund requests by status"
                value={filter}
                onChange={setFilter}
                options={FILTERS.map(f => ({ value: f, label: f === 'all' ? 'All' : f, count: loading || (loadFailed && requests.length === 0) ? null : f === 'all' ? requests.length : requests.filter(r => r.status === f).length }))}
              />
              <button type="button" onClick={() => setShowNew((v) => !v)} className="ml-auto cursor-pointer rounded-control border border-indigo-600 bg-white px-3 py-1.5 text-label font-bold text-indigo-700">
                {showNew ? 'Close' : 'Open a request for a tenant'}
              </button>
            </div>

            {showNew && (
              <section className="space-y-3 rounded-card border border-slate-200 bg-white p-4 shadow-card">
                <label className="block text-label font-bold text-slate-600">Tenant
                  <select value={newUserId} onChange={(e) => setNewUserId(e.target.value)} className="mt-1 w-full rounded-control border border-slate-300 bg-white p-2 text-body font-normal">
                    <option value="">Choose a tenant</option>
                    {tenants.map((t) => <option key={t.user_id} value={t.user_id}>{t.name} · {t.unit}</option>)}
                  </select>
                </label>
                {eligible && (
                  <RefundForm eligible={eligible} busy={busy}
                    onSubmit={(body, reset) => call('create_refund_request.php', { ...body, user_id: Number(newUserId) }, 'Refund request opened.', () => { reset(); setNewUserId(''); })} />
                )}
              </section>
            )}

            {loading ? <SkeletonCards count={3} className="space-y-3" label="Loading refund requests…" />
              : loadFailed && requests.length === 0 ? (
              <div className="rounded-card border border-slate-200 bg-white"><LoadError title="Couldn't load refund requests" onRetry={() => { setLoading(true); load(); }} /></div>
            ) : shown.length === 0 ? (
              <p className="rounded-card border border-slate-200 p-6 text-body text-slate-500">No refund requests here.</p>
            ) : shown.map((r) => (
              <article key={r.id} className="rounded-card border border-slate-200 bg-white p-4 shadow-card sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="m-0 text-title font-bold text-slate-800">{r.tenantName}{r.roomName ? ` · Unit ${r.roomName}` : ''}</h3>
                    <p className="m-0 text-label text-slate-500">#{r.id} · {TYPE_LABELS[r.type]}{r.invoiceId ? ` (${r.invoiceId})` : ''} · {when(r.createdAt)}{r.origin === 'cancelled_by_tenant' ? ` · Opened by tenant: ${r.tenantName}` : r.origin === 'rejected_by_admin' ? ' · Opened by admin' : r.raisedByRole === 'admin' ? ' · Opened by admin' : ''}</p>
                    {r.origin === 'cancelled_by_tenant' && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Application cancelled by applicant</span>}
                    {r.origin === 'rejected_by_admin' && <span className="mt-1 inline-block rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-900">Application rejected by admin</span>}
                  </div>
                  <div className="text-right">
                    <p className="m-0 text-title font-bold text-slate-800">{peso(r.amount)}</p>
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                <p className="m-0 mt-2 whitespace-pre-wrap text-body text-slate-600">{r.reason}</p>
                {r.type === 'rejected_application' && r.paidAmount != null && (
                  <section className="mt-3 rounded-control border border-indigo-100 bg-indigo-50 p-3 text-label text-slate-700" aria-label="Refund calculation breakdown">
                    <p className="m-0 font-bold text-slate-800">Move-in payment breakdown</p>
                    <dl className="m-0 mt-2 grid grid-cols-2 gap-y-1">
                      <dt>Total paid</dt><dd className="m-0 text-right font-semibold">{peso(r.paidAmount)}</dd>
                      <dt>Security deposit portion (refundable before move-in)</dt><dd className="m-0 text-right font-semibold">{peso(r.depositAmount || 0)}</dd>
                      <dt>Eligible refund (management review)</dt><dd className="m-0 text-right font-bold">{peso(r.amount)}</dd>
                    </dl>
                  </section>
                )}
                {r.payoutDestination && <p className="m-0 mt-2 rounded-control bg-amber-50 p-3 text-label text-slate-700"><strong>Tenant payout destination:</strong> {r.payoutDestination}</p>}
                {r.status === 'Refunded' && <p className="m-0 mt-2 text-body font-semibold text-emerald-700">Paid out via {r.payoutMethod} (ref {r.payoutReference}).{r.gatewayStatus ? ` ${GATEWAY_LABELS[r.gatewayStatus] || r.gatewayStatus}.` : ''}</p>}
                <RefundTrail events={r.events} />

                {(r.status === 'Pending Review') && (
                  <div className="mt-4 space-y-2">
                    {r.type === 'rejected_application' && <label className="block text-label font-bold text-slate-600">Final refund amount (max {peso(r.paidAmount ?? r.amount)})
                      <input aria-label={`Final refund amount for request ${r.id}`} type="number" min="0.01" step="0.01" max={r.paidAmount ?? r.amount} value={refundAmounts[r.id] ?? r.amount}
                        onChange={(e) => setRefundAmounts((p) => ({ ...p, [r.id]: e.target.value }))} className="mt-1 w-full max-w-xs rounded-control border border-slate-300 p-2 text-body" />
                    </label>}
                    <label className="block text-label font-bold text-slate-600">Message to tenant
                      <textarea rows={2} maxLength={1000} value={text[r.id] || ''} placeholder="Your question, or the reason for rejecting"
                        onChange={(e) => setText((p) => ({ ...p, [r.id]: e.target.value }))} className="mt-1 w-full rounded-control border border-slate-300 p-2 text-body font-normal" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy || (r.type === 'rejected_application' && (!(Number(refundAmounts[r.id] ?? r.amount) > 0) || Number(refundAmounts[r.id] ?? r.amount) > Number(r.paidAmount ?? r.amount)))} onClick={() => act(r, 'approve', 'Refund approved.')} className={`${btn} bg-emerald-600 hover:bg-emerald-700`}>Approve</button>
                      <button type="button" disabled={busy || !(text[r.id] || '').trim()} title="Sends your message to the tenant and pauses this request until they reply."
                        onClick={() => act(r, 'request_info', 'Question sent to the tenant.')} className={`${btn} bg-sky-600 hover:bg-sky-700`}>Ask tenant a question</button>
                      <button type="button" disabled={busy || !(text[r.id] || '').trim()} onClick={() => act(r, 'reject', 'Refund rejected.')} className={`${btn} bg-red-600 hover:bg-red-700`}>Reject</button>
                    </div>
                    <p className="m-0 text-label text-slate-500"><strong>Ask tenant a question:</strong> sends your message and waits for their reply. <strong>Reject:</strong> sends your message as the reason and closes the request.</p>
                  </div>
                )}
                {r.status === 'Info Requested' && (
                  <p className="m-0 mt-3 text-body font-semibold text-sky-700">Waiting for the tenant's reply.</p>
                )}
                {r.status === 'Approved' && r.canRefundOnline && r.gatewayStatus !== 'requesting' && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => refundOnline(r)} className={`${btn} bg-emerald-600 hover:bg-emerald-700`}>Refund {peso(r.amount)} through PayMongo</button>
                    <span className="text-label text-slate-500">This was paid online, so it goes back to the payer's own account. Or record a payout made by hand:</span>
                  </div>
                )}
                {r.status === 'Approved' && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input placeholder="Paid via (e.g. GCash, bank transfer, cash)" maxLength={50} value={payout[r.id]?.method || ''}
                      onChange={(e) => setPayout((p) => ({ ...p, [r.id]: { ...p[r.id], method: e.target.value } }))} className="rounded-control border border-slate-300 p-2 text-body" />
                    <input placeholder="Payout reference" maxLength={100} value={payout[r.id]?.reference || ''}
                      onChange={(e) => setPayout((p) => ({ ...p, [r.id]: { ...p[r.id], reference: e.target.value } }))} className="rounded-control border border-slate-300 p-2 text-body" />
                    <button type="button" disabled={busy || !payout[r.id]?.method?.trim() || !payout[r.id]?.reference?.trim()}
                      onClick={() => act(r, 'mark_refunded', 'Payout recorded.')} className={`${btn} bg-indigo-600 hover:bg-indigo-700`}>Record payout</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
