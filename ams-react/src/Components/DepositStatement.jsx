import { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { useLang } from '../config/i18n';
import { peso, when } from '../utils/refundFormat';
import { Bone, SkeletonGroup } from './tenant/Skeleton';

// "Your security deposit" on My Refunds: what happened to the deposit at move-out
// (get_deposit_statement.php) and, inside the review period, a way to ask
// Management to look again (request_deposit_review.php). Shows nothing until a
// deposit has been settled.
const TEXT = {
  en: {
    title: 'Your security deposit',
    deposit: 'Deposit', refunded: 'To be returned to you', withheld: 'Withheld',
    deductions: 'Deductions', settled: 'Settled', status: 'Status',
    reviewTitle: 'Think something is wrong?',
    reviewHelp: (date) => `You can ask Management to review this until ${date}.`,
    placeholder: 'What should be reviewed, and why?',
    send: 'Request review', sending: 'Sending...', sent: 'Your request was sent. Management will reply here.',
    yourReview: 'Your review request', reply: 'Management reply', open: 'Waiting for Management', upheld: 'The settlement stands', adjusted: (a) => `Adjusted: ${a} will be returned`,
    statuses: { 'Refund Pending': 'Refund on its way', Refunded: 'Refunded', 'Refund Rejected': 'Refund rejected', Forfeited: 'Deposit withheld', 'Applied to Rent': 'Applied to rent', 'Applied to Bills/Damages': 'Applied to what was owed' },
  },
  fil: {
    title: 'Ang iyong security deposit',
    deposit: 'Deposit', refunded: 'Ibabalik sa iyo', withheld: 'Hindi ibinalik',
    deductions: 'Mga kaltas', settled: 'Naayos noong', status: 'Katayuan',
    reviewTitle: 'May mali ba sa tingin mo?',
    reviewHelp: (date) => `Maaari mong hilingin sa Pamunuan na suriin ito hanggang ${date}.`,
    placeholder: 'Ano ang dapat suriin, at bakit?',
    send: 'Humiling ng pagsusuri', sending: 'Ipinapadala...', sent: 'Naipadala ang hiling mo. Sasagot ang Pamunuan dito.',
    yourReview: 'Ang hiling mong pagsusuri', reply: 'Sagot ng Pamunuan', open: 'Naghihintay sa Pamunuan', upheld: 'Nananatili ang settlement', adjusted: (a) => `Inayos: ${a} ang ibabalik`,
    statuses: { 'Refund Pending': 'Papunta na ang refund', Refunded: 'Naibalik na', 'Refund Rejected': 'Tinanggihan ang refund', Forfeited: 'Hindi ibinalik ang deposit', 'Applied to Rent': 'Ikinaltas sa upa', 'Applied to Bills/Damages': 'Ikinaltas sa utang' },
  },
};

export default function DepositStatement({ onChanged }) {
  const { lang } = useLang();
  const L = TEXT[lang === 'fil' ? 'fil' : 'en'];
  const [data, setData] = useState(undefined); // undefined = loading, null = nothing settled
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_deposit_statement.php');
      setData(res.data.success ? res.data.data : null);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (data === undefined) {
    return (
      <SkeletonGroup label="Loading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 space-y-3">
        <Bone className="h-5 w-48" /><Bone className="h-3 w-full" /><Bone className="h-3 w-2/3" />
      </SkeletonGroup>
    );
  }
  if (!data) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !message.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.post('request_deposit_review.php', { message: message.trim() });
      setNotice({ ok: !!res.data.success, text: res.data.success ? L.sent : res.data.message });
      if (res.data.success) { setMessage(''); await load(); onChanged?.(); }
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err) });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const review = data.review;
  return (
    <section className="animate-fade-in rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-lg font-bold text-slate-800">{L.title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{L.statuses[data.status] || data.status}</span>
      </div>
      <dl className="m-0 mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between"><dt className="text-slate-500">{L.deposit}</dt><dd className="m-0 font-semibold">{peso(data.deposit)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">{L.settled}</dt><dd className="m-0 font-semibold">{data.settledOn}</dd></div>
        {data.refundAmount > 0 && <div className="flex justify-between"><dt className="text-slate-500">{L.refunded}</dt><dd className="m-0 font-bold text-emerald-700">{peso(data.refundAmount)}</dd></div>}
        {data.forfeited > 0 && <div className="flex justify-between"><dt className="text-slate-500">{L.withheld}</dt><dd className="m-0 font-bold text-rose-700">{peso(data.forfeited)}</dd></div>}
      </dl>
      {data.deductions.length > 0 && (
        <div className="mt-3">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-slate-500">{L.deductions}</p>
          <ul className="m-0 mt-1 list-none space-y-1 p-0 text-sm text-slate-700">
            {data.deductions.map((d, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="min-w-0"><strong>{d.label}</strong>{d.reason ? `: ${d.reason}` : ''}</span>
                <span className="shrink-0 font-semibold text-rose-700">-{peso(d.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="m-0 font-bold text-slate-700">{L.yourReview} · <span className="font-semibold text-slate-500">{when(review.created_at)}</span></p>
          <p className="m-0 mt-1 whitespace-pre-wrap text-slate-600">{review.message}</p>
          {review.status === 'Open' ? (
            <p className="m-0 mt-2 font-semibold text-amber-700">{L.open}</p>
          ) : (
            <>
              <p className="m-0 mt-2 font-semibold text-indigo-700">{review.outcome === 'adjusted' ? L.adjusted(peso(review.adjusted_amount)) : L.upheld}</p>
              <p className="m-0 mt-1 whitespace-pre-wrap text-slate-600"><strong>{L.reply}:</strong> {review.admin_response}</p>
            </>
          )}
        </div>
      ) : data.canRequestReview && (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <p className="m-0 text-sm font-bold text-slate-700">{L.reviewTitle}</p>
          <p className="m-0 text-xs text-slate-500">{L.reviewHelp(data.reviewWindowEnds)}</p>
          <textarea rows={3} maxLength={1000} value={message} placeholder={L.placeholder} onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2 text-base sm:text-sm" />
          <button type="submit" disabled={busy || !message.trim()}
            className="min-h-[44px] cursor-pointer rounded-lg border-0 bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? L.sending : L.send}</button>
        </form>
      )}
      {notice && <p role="status" className={`m-0 mt-3 text-sm font-semibold ${notice.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{notice.text}</p>}
    </section>
  );
}
