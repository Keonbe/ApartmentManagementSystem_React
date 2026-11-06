import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faFileCircleExclamation, faMoneyBillWave, faPaperPlane, faXmark, faChevronRight, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { btn, badge } from './admin/ui/styles';
import Modal from './admin/Modal';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Tenants with overdue or lapsed payments, and applicants with documents or
// deadlines outstanding (monitor_followups.php). On the Notifications page it
// is a one-line banner; "Review" opens the full list in a dialog, where "Remind"
// nudges one tenant and "Remind all" nudges everyone (each at most once a day).
export default function FollowupMonitor({ onChanged }) {
  const [data, setData] = useState({ payments: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState(null); // an item key, or 'all'
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
    if (busyKey) return;
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

  // One reminder per tenant/application and kind a day (send_followup_nudge keys
  // on kind + id), so three document issues for one applicant are one reminder.
  const remindable = new Set([...data.payments, ...data.documents]
    .filter((item) => item.kind !== 'lapsed')
    .map((item) => `${item.kind}:${item.id}`)).size;

  const remindAll = async () => {
    if (busyKey) return;
    if (!window.confirm(`Send a reminder to everyone on this list (${remindable})? Anyone already reminded in the last day is skipped.`)) return;
    setBusyKey('all');
    setNotice(null);
    try {
      const res = await api.post('monitor_followups.php', { action: 'remind_all' });
      setNotice({ ok: (res.data?.sent || 0) > 0, text: res.data?.message || 'Reminders sent.' });
      onChanged?.();
      await load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not send the reminders.') });
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
          <p className="m-0 text-body font-semibold text-slate-900">
            {item.name || 'Tenant'}{item.room ? <span className="font-normal text-slate-600"> · Unit {item.room}</span> : null}
          </p>
          <p className="m-0 text-label text-slate-600">
            <span className="font-semibold">{item.issue}.</span> {item.detail}
            {item.daysLate > 0 ? ` ${item.daysLate} day${item.daysLate === 1 ? '' : 's'} late.` : ''}
            {item.kind === 'payment' && item.amount > 0 ? ` Total ${peso(item.amount)}.` : ''}
          </p>
        </div>
        {item.kind !== 'lapsed' && (
          <button type="button" onClick={() => remind(item)} disabled={Boolean(busyKey)}
            className={btn('secondary', 'sm', 'shrink-0 self-start sm:self-auto')}>
            <FontAwesomeIcon icon={faPaperPlane} /> {busyKey === key ? 'Sending…' : 'Remind'}
          </button>
        )}
      </li>
    );
  };

  const section = (title, icon, items) => items.length > 0 && (
    <section className="mt-1">
      <h3 className="sticky top-0 z-[1] m-0 flex items-center gap-2 border-b border-slate-100 bg-white py-2 text-label font-semibold text-slate-600">
        <FontAwesomeIcon icon={icon} className="text-amber-600" /> {title} ({items.length})
      </h3>
      <ul className="m-0 list-none divide-y divide-slate-100 p-0">{items.map(row)}</ul>
    </section>
  );

  return (
    <>
      {/* The banner: the counts at a glance, the list one click away. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-card border border-amber-200 bg-amber-50/60 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-amber-50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <FontAwesomeIcon icon={faExclamationTriangle} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-body font-semibold text-slate-900">
            Needs follow-up <span className={badge('warning')}>{total}</span>
          </span>
          <span className="block text-label text-slate-600">
            {data.payments.length > 0 && `${data.payments.length} missed or lapsed payment${data.payments.length === 1 ? '' : 's'}`}
            {data.payments.length > 0 && data.documents.length > 0 && ' · '}
            {data.documents.length > 0 && `${data.documents.length} missing document${data.documents.length === 1 ? '' : 's'} or deadline${data.documents.length === 1 ? '' : 's'}`}
          </span>
        </span>
        <span className={btn('secondary', 'sm', 'shrink-0 pointer-events-none')}>
          Review <FontAwesomeIcon icon={faChevronRight} className="transition-[translate] group-hover:translate-x-0.5" />
        </span>
      </button>

      {open && (
        <Modal
          labelledBy="followup-title"
          onClose={() => setOpen(false)}
          busy={busyKey === 'all'}
          className="bg-white rounded-dialog shadow-dialog w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[88vh]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h2 id="followup-title" className="m-0 flex items-center gap-2 text-title font-semibold text-slate-900">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600" />
              Needs follow-up <span className={badge('warning')}>{total}</span>
            </h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={remindAll} disabled={Boolean(busyKey) || remindable === 0} className={btn('primary', 'sm')}>
                <FontAwesomeIcon icon={faPaperPlane} /> {busyKey === 'all' ? 'Sending…' : `Remind all (${remindable})`}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={busyKey === 'all'} aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:opacity-50">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          </div>

          {notice && (
            <p role="status" className={`m-0 border-b px-5 py-2.5 text-label font-semibold ${notice.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-700'}`}>{notice.text}</p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
            {section('Missed or lapsed payments', faMoneyBillWave, data.payments)}
            {section('Missing documents and deadlines', faFileCircleExclamation, data.documents)}
          </div>

          <p className="m-0 flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-caption text-slate-500">
            <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5" />
            Each tenant gets at most one reminder a day per item, in-app and by email. Lapsed payments have nothing to remind and are skipped.
          </p>
        </Modal>
      )}
    </>
  );
}
