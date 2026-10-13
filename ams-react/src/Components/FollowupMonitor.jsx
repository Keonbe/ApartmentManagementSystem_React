import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faFileCircleExclamation, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Tenants with overdue or lapsed payments, and applicants with documents or
// deadlines outstanding (monitor_followups.php). "Remind" nudges the tenant.
export default function FollowupMonitor({ onChanged }) {
  const [data, setData] = useState({ payments: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('monitor_followups.php');
      if (res.data?.success) setData({ payments: res.data.payments || [], documents: res.data.documents || [] });
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load the follow-up list.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const remind = async (item) => {
    const key = `${item.kind}:${item.id}:${item.issue}`;
    setBusyKey(key);
    setNotice(null);
    try {
      const res = await api.post('monitor_followups.php', { kind: item.kind, id: item.id });
      setNotice({ ok: !!res.data?.success, text: res.data?.message || 'Reminder sent.' });
      onChanged?.();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not send the reminder.') });
    } finally {
      setBusyKey(null);
    }
  };

  const total = data.payments.length + data.documents.length;
  if (loading || total === 0) return null;

  const row = (item) => {
    const key = `${item.kind}:${item.id}:${item.issue}`;
    return (
      <li key={key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-left">
          <p className="m-0 text-sm font-bold text-slate-800">
            {item.name || 'Tenant'}{item.room ? <span className="font-medium text-slate-500"> · Unit {item.room}</span> : null}
          </p>
          <p className="m-0 text-xs text-slate-600">
            <span className="font-semibold">{item.issue}.</span> {item.detail}
            {item.daysLate > 0 ? ` ${item.daysLate} day${item.daysLate === 1 ? '' : 's'} late.` : ''}
            {item.kind === 'payment' && item.amount > 0 ? ` Total ${peso(item.amount)}.` : ''}
          </p>
        </div>
        {item.kind !== 'lapsed' && (
          <button type="button" onClick={() => remind(item)} disabled={busyKey === key}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 cursor-pointer hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-wait sm:self-auto">
            <FontAwesomeIcon icon={faPaperPlane} /> {busyKey === key ? 'Sending…' : 'Remind'}
          </button>
        )}
      </li>
    );
  };

  return (
    <section aria-label="Missed payments and missing documents" className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-left">
      <h2 className="m-0 mb-1 flex items-center gap-2 text-sm font-bold text-slate-800">
        <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500" />
        Needs follow-up <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{total}</span>
      </h2>
      {notice && <p role="status" className={`m-0 mb-2 text-xs font-semibold ${notice.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{notice.text}</p>}
      {data.payments.length > 0 && (
        <>
          <h3 className="m-0 mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Missed or lapsed payments ({data.payments.length})</h3>
          <ul className="m-0 list-none divide-y divide-amber-100 p-0">{data.payments.map(row)}</ul>
        </>
      )}
      {data.documents.length > 0 && (
        <>
          <h3 className="m-0 mt-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <FontAwesomeIcon icon={faFileCircleExclamation} /> Missing documents and deadlines ({data.documents.length})
          </h3>
          <ul className="m-0 list-none divide-y divide-amber-100 p-0">{data.documents.map(row)}</ul>
        </>
      )}
    </section>
  );
}
