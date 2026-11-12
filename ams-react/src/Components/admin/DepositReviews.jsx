import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';
import { peso, when } from '../../utils/refundFormat';

// Tenant requests to review a security deposit settlement (Admin → Refunds).
// An open review is answered here: "stands" (with the reason the tenant reads)
// or "adjust" (return more of the deposit: opens an approved deposit refund
// that only waits for its payout). The server checks the amount.
export default function DepositReviews({ onChanged }) {
  const [reviews, setReviews] = useState([]);
  const [form, setForm] = useState({});   // per review: { outcome, amount, response }
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_deposit_reviews.php');
      if (res.data.success) setReviews(res.data.data || []);
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load deposit reviews.') });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const open = reviews.filter((r) => r.status === 'Open');
  const resolved = reviews.filter((r) => r.status !== 'Open');
  if (reviews.length === 0 && !notice) return null;

  const set = (id, patch) => setForm((p) => ({ ...p, [id]: { outcome: 'upheld', amount: '', response: '', ...p[id], ...patch } }));

  const answer = async (r) => {
    const f = { outcome: 'upheld', amount: '', response: '', ...form[r.id] };
    if (busy) return;
    setBusy(r.id);
    setNotice(null);
    try {
      const res = await api.post('resolve_deposit_review.php', { id: r.id, outcome: f.outcome, response: f.response, amount: f.outcome === 'adjusted' ? f.amount : undefined });
      setNotice({ ok: !!res.data.success, text: res.data.message });
      if (res.data.success) { await load(); onChanged?.(); }
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err) });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const card = (r) => {
    const f = { outcome: 'upheld', amount: '', response: '', ...form[r.id] };
    return (
      <article key={r.id} className="space-y-2 rounded-card border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-title font-bold text-slate-800">{r.tenantName}{r.roomName ? ` · Unit ${r.roomName}` : ''}</h3>
            <p className="m-0 text-label text-slate-500">Review #{r.id} · {when(r.createdAt)} · deposit {peso(r.deposit)} ({r.depositStatus}), returned {peso(r.refundAmount)}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.status === 'Open' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{r.status === 'Open' ? 'Open' : r.outcome === 'adjusted' ? `Adjusted ${peso(r.adjustedAmount)}` : 'Stands'}</span>
        </div>
        <p className="m-0 whitespace-pre-wrap text-body text-slate-700">&ldquo;{r.message}&rdquo;</p>
        {r.deductions.length > 0 && (
          <ul className="m-0 list-none space-y-0.5 p-0 text-label text-slate-600">
            {r.deductions.map((d, i) => <li key={i}>{d.label}{d.reason ? `: ${d.reason}` : ''} <strong className="text-red-600">-{peso(d.amount)}</strong></li>)}
          </ul>
        )}
        {r.status === 'Open' ? (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-4 text-body">
              <label className="flex items-center gap-1.5"><input type="radio" name={`outcome-${r.id}`} checked={f.outcome === 'upheld'} onChange={() => set(r.id, { outcome: 'upheld' })} /> Settlement stands</label>
              <label className="flex items-center gap-1.5"><input type="radio" name={`outcome-${r.id}`} checked={f.outcome === 'adjusted'} disabled={r.maxAdjustment <= 0} onChange={() => set(r.id, { outcome: 'adjusted' })} /> Return more of the deposit</label>
              {f.outcome === 'adjusted' && (
                <label className="flex items-center gap-1.5 text-label">Amount (max {peso(r.maxAdjustment)})
                  <input type="number" min="0.01" max={r.maxAdjustment} step="0.01" value={f.amount} onChange={(e) => set(r.id, { amount: e.target.value })} className="w-28 rounded-control border border-slate-300 p-1.5" />
                </label>
              )}
            </div>
            <textarea rows={2} maxLength={1000} value={f.response} onChange={(e) => set(r.id, { response: e.target.value })} placeholder="Reason the tenant will read" className="w-full rounded-control border border-slate-300 p-2 text-body" />
            <button type="button" disabled={busy === r.id || !f.response.trim() || (f.outcome === 'adjusted' && !(Number(f.amount) > 0))} onClick={() => answer(r)}
              className="cursor-pointer rounded-control border-0 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Send answer</button>
          </div>
        ) : (
          <p className="m-0 border-t border-slate-100 pt-2 text-label text-slate-500"><strong>Answer:</strong> {r.adminResponse}</p>
        )}
      </article>
    );
  };

  return (
    <section className="space-y-3 pt-2" aria-label="Deposit reviews">
      <h2 className="m-0 text-title font-bold text-slate-800">Deposit reviews{open.length ? ` (${open.length} open)` : ''}</h2>
      {notice && <div role="status" className={`rounded-control border p-3 text-body font-semibold ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{notice.text}</div>}
      {open.map(card)}
      {open.length === 0 && <p className="m-0 text-body text-slate-500">No open deposit reviews.</p>}
      {resolved.length > 0 && (
        <>
          <button type="button" onClick={() => setShowResolved((v) => !v)} className="cursor-pointer border-0 bg-transparent p-0 text-label font-bold text-indigo-700 hover:underline">
            {showResolved ? 'Hide answered reviews' : `Show ${resolved.length} answered review(s)`}
          </button>
          {showResolved && resolved.map(card)}
        </>
      )}
    </section>
  );
}
