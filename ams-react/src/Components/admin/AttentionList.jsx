import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faChevronDown, faCheckCircle, faCircleInfo, faClock } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import EmptyState from './ui/EmptyState';
import LoadError from './ui/LoadError';
import { PANEL } from './ui/styles';
import { SkeletonList } from './ui/Skeleton';

// What the admin has to act on, from dashboard_stats.php → attention. Each line
// opens its page already filtered to the same rows it counts (useUrlFilter), so
// the number on the Dashboard is the number on the page. Lines at 0 are hidden.
// Tone = priority: red = overdue / at risk, amber = waiting on the admin, sky = for information.
const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const GROUPS = [
  {
    title: 'Money',
    items: [
      { key: 'proofs_to_verify', tone: 'amber', to: '/admin-payments?status=pending-verification', one: 'tenant payment to verify', many: 'tenant payments to verify' },
      { key: 'overdue_tenants', tone: 'red', to: '/admin-payments?status=overdue', text: (a) => `${n(a.overdue_tenants, 'tenant', 'tenants')} overdue (${n(a.overdue_invoices, 'bill', 'bills')})` },
      { key: 'failed_payments', tone: 'red', to: '/admin-payments?status=payment-failed', one: 'tenant with a failed online payment', many: 'tenants with a failed online payment' },
      { key: 'cash_visits', tone: 'sky', to: '/admin-payments?status=scheduled', one: 'tenant booked to pay cash', many: 'tenants booked to pay cash' },
      { key: 'refunds_to_review', tone: 'amber', to: '/admin-refunds', one: 'refund request to review', many: 'refund requests to review' },
      { key: 'readings_to_invoice', tone: 'sky', to: '/admin-utilities?tab=pending', one: 'utility reading not invoiced', many: 'utility readings not invoiced' },
    ],
  },
  {
    title: 'Tenants',
    items: [
      { key: 'applications_to_review', tone: 'amber', to: '/admin-applications?status=pending', one: 'application to review', many: 'applications to review' },
      { key: 'move_in_due', tone: 'amber', to: '/admin-applications?status=approved', one: 'approved tenant not moved in yet', many: 'approved tenants not moved in yet' },
      { key: 'move_out_requests', tone: 'amber', to: '/admin-tenants?filter=pending-move-out', one: 'move-out request', many: 'move-out requests' },
      { key: 'requests_to_decide', tone: 'amber', to: '/admin-notifications?filter=decide', one: 'occupancy or rent request to decide', many: 'occupancy or rent requests to decide' },
      { key: 'new_inquiries', tone: 'amber', to: '/admin-inquiries?status=new', one: 'new inquiry to answer', many: 'new inquiries to answer' },
    ],
  },
  {
    title: 'Contracts',
    items: [
      { key: 'eviction_pending', tone: 'red', to: '/admin-contracts?status=eviction-pending', one: 'contract pending eviction', many: 'contracts pending eviction' },
      { key: 'contracts_missing_docs', tone: 'amber', to: '/admin-contracts?status=docs-missing', one: 'contract missing documents', many: 'contracts missing documents' },
      { key: 'contracts_draft', tone: 'sky', to: '/admin-contracts?status=draft', one: 'draft contract not yet active', many: 'draft contracts not yet active' },
      { key: 'contracts_ending', tone: 'sky', to: '/admin-contracts?status=ending', text: (a) => `${n(a.contracts_ending, 'rent term ends', 'rent terms end')} within ${a.contracts_ending_days ?? 30} days` },
    ],
  },
  {
    title: 'Building & requests',
    items: [
      { key: 'maintenance_urgent', tone: 'red', to: '/admin-maintenance?priority=Urgent&scope=open', one: 'urgent maintenance request', many: 'urgent maintenance requests' },
      { key: 'maintenance_triage', tone: 'amber', to: '/admin-maintenance?priority=Needs%20Triage&scope=pending', one: 'maintenance request to triage', many: 'maintenance requests to triage' },
      { key: 'visitors_overstayed', tone: 'red', to: '/admin-visitors?status=overstayed', one: 'visitor overstayed', many: 'visitors overstayed' },
      { key: 'visitors_pending', tone: 'amber', to: '/admin-visitors?status=pending_approval', one: 'visitor registration to review', many: 'visitor registrations to review' },
      { key: 'parking_requests', tone: 'amber', to: '/admin-parking?tab=Pending', one: 'parking request', many: 'parking requests' },
      { key: 'cctv_requests', tone: 'amber', to: '/admin-cctv?tab=pending', one: 'CCTV footage request', many: 'CCTV footage requests' },
      { key: 'service_requests', tone: 'amber', to: '/admin-services?tab=services&status=Pending', one: 'service booking to confirm', many: 'service bookings to confirm' },
    ],
  },
];

const PRIORITY = {
  red: { rank: 0, dot: 'bg-red-600', label: 'Urgent', text: 'Overdue, failed or at risk: act first.' },
  amber: { rank: 1, dot: 'bg-amber-500', label: 'Waiting on you', text: 'Someone is waiting for your answer or approval.' },
  sky: { rank: 2, dot: 'bg-sky-500', label: 'For information', text: 'Good to know; no one is blocked.' },
};

const PERIODS = [
  { days: 0, label: 'Any time' },
  { days: 1, label: 'Last 24 hours' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
];

const CLOSED_KEY = 'ams_dashboard_attention_closed';
const readClosed = () => {
  try { return JSON.parse(localStorage.getItem(CLOSED_KEY) || '{}') || {}; } catch { return {}; }
};

// `attention.incomplete` means the server could not count some groups: the list never
// says "All caught up" then, and warns when it shows only part of the picture.
// The parent gives the height (the card scrolls inside it); `className` sizes the card.
export default function AttentionList({ attention: initial, loading: parentLoading, onRetry, className = '' }) {
  const [days, setDays] = useState(0);
  const [own, setOwn] = useState(null); // counts for a chosen period
  const [fetching, setFetching] = useState(false);
  const [periodError, setPeriodError] = useState('');
  const [closed, setClosed] = useState(readClosed);
  const [showKey, setShowKey] = useState(false);
  const requestId = useRef(0);

  const attention = (days > 0 && own) || initial || {};
  const loading = parentLoading || fetching;
  const undated = days > 0 ? (attention.undated_keys || []) : [];

  const choosePeriod = async (d) => {
    setDays(d);
    setPeriodError('');
    if (d === 0) { setOwn(null); return; }
    const id = ++requestId.current;
    setFetching(true);
    try {
      const res = await api.get('dashboard_stats.php', { params: { section: 'attention', attention_days: d } });
      if (id !== requestId.current) return;
      if (res.data?.success) setOwn(res.data.attention);
      else setPeriodError(res.data?.message || 'Could not load this period.');
    } catch (e) {
      if (id !== requestId.current) return;
      setPeriodError(e?.response?.data?.message || 'Could not load this period.');
    } finally {
      if (id === requestId.current) setFetching(false);
    }
  };

  const toggleGroup = (title) => {
    setClosed((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try { localStorage.setItem(CLOSED_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
      return next;
    });
  };

  const incomplete = !!attention.incomplete;
  const groups = GROUPS
    .map((g) => ({
      ...g,
      items: g.items
        .filter((it) => !undated.includes(it.key) && (attention[it.key] ?? 0) > 0)
        .sort((a, b) => PRIORITY[a.tone].rank - PRIORITY[b.tone].rank),
    }))
    .filter((g) => g.items.length > 0);
  const countOf = (it) => attention[it.key] || 0;
  const total = groups.reduce((sum, g) => sum + g.items.reduce((s, it) => s + countOf(it), 0), 0);
  const hiddenUndated = undated.reduce((s, k) => s + (attention[k] || 0), 0);
  const periodLabel = PERIODS.find((p) => p.days === days)?.label.toLowerCase();

  return (
    <section aria-labelledby="attention-title" className={`${PANEL} flex flex-col overflow-hidden ${className}`}>
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="attention-title" className="m-0 text-title font-semibold text-slate-900 flex items-center gap-2">
            Needs your attention
            {total > 0 && !loading && <span className="rounded-full px-2 py-0.5 text-caption font-semibold bg-slate-900 text-white">{total}</span>}
          </h2>
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-expanded={showKey}
            aria-controls="attention-key"
            title="What the colours mean"
            className={`touch-compact w-8 h-8 rounded-control border-0 cursor-pointer text-label transition-colors ${showKey ? 'bg-indigo-50 text-indigo-700' : 'bg-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <FontAwesomeIcon icon={faCircleInfo} />
            <span className="sr-only">What the colours mean</span>
          </button>
        </div>

        <label className="relative flex items-center">
          <span className="sr-only">Show what came in</span>
          <FontAwesomeIcon icon={faClock} className="absolute left-3 text-slate-400 text-label pointer-events-none" aria-hidden="true" />
          <select
            value={days}
            onChange={(e) => choosePeriod(Number(e.target.value))}
            className="w-full h-9 pl-8 pr-8 rounded-control border border-slate-300 bg-white text-label font-medium text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.days === 0 ? 'Everything open' : `New in the ${p.label.toLowerCase()}`}</option>)}
          </select>
        </label>

        {showKey && (
          <dl id="attention-key" className="m-0 rounded-control bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1.5 text-caption">
            {Object.values(PRIORITY).map((p) => (
              <div key={p.label} className="flex items-start gap-2">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${p.dot}`} aria-hidden="true" />
                <div>
                  <dt className="inline font-semibold text-slate-800">{p.label}: </dt>
                  <dd className="inline m-0 text-slate-600">{p.text}</dd>
                </div>
              </div>
            ))}
            <p className="m-0 pt-1 text-slate-500">Within each category the most urgent lines come first.</p>
          </dl>
        )}
        {periodError && <p role="alert" className="m-0 text-label text-red-700">{periodError}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {loading ? (
          <SkeletonList rows={6} label="Loading what needs your attention…" className="py-2" />
        ) : incomplete && groups.length === 0 ? (
          <LoadError title="Couldn't count what needs your attention" message="This is not an all-clear: the counts did not load." onRetry={onRetry} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={faCheckCircle}
            iconClassName="text-emerald-600"
            title={days > 0 ? `Nothing new in the ${periodLabel}` : 'All caught up'}
            message={days > 0 ? 'Choose "Everything open" to see older items.' : 'Nothing is waiting on you right now.'}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((g) => {
              const isClosed = !!closed[g.title];
              const groupCount = g.items.reduce((s, it) => s + countOf(it), 0);
              const top = PRIORITY[g.items[0].tone];
              const listId = `attention-${g.title.replace(/\W+/g, '-').toLowerCase()}`;
              return (
                <div key={g.title}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.title)}
                    aria-expanded={!isClosed}
                    aria-controls={listId}
                    className="touch-compact sticky top-0 z-[1] w-full flex items-center gap-2 px-5 py-2.5 bg-white/95 backdrop-blur-[2px] border-0 cursor-pointer text-left hover:bg-slate-50"
                  >
                    <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] text-slate-400 transition-transform duration-200 ${isClosed ? '-rotate-90' : ''}`} aria-hidden="true" />
                    <span className="flex-1 text-label font-semibold text-slate-700">{g.title}</span>
                    <span className={`h-2 w-2 rounded-full ${top.dot}`} title={`Most urgent: ${top.label}`} aria-hidden="true" />
                    <span className="rounded-full px-2 py-0.5 text-caption font-semibold bg-slate-100 text-slate-700">{groupCount}</span>
                  </button>
                  {!isClosed && (
                    <ul id={listId} className="m-0 p-0 pb-1.5 list-none">
                      {g.items.map((it) => (
                        <li key={it.key}>
                          <Link
                            to={it.to}
                            className="group flex items-center gap-3 px-5 py-2 text-body text-slate-800 no-underline hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                          >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY[it.tone].dot}`} aria-hidden="true" />
                            <span className="sr-only">{PRIORITY[it.tone].label}: </span>
                            <span className="min-w-0 flex-1">{it.text ? it.text(attention) : n(attention[it.key], it.one, it.many)}</span>
                            <FontAwesomeIcon icon={faChevronRight} className="text-xs text-slate-400 group-hover:text-indigo-600" aria-hidden="true" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!loading && hiddenUndated > 0 && (
          <p className="m-0 px-5 py-3 bg-slate-50 border-t border-slate-100 text-caption text-slate-600">
            {n(hiddenUndated, 'more item has', 'more items have')} no start date (payments waiting on older bills, move-ins and move-outs, evictions, rent terms ending).{' '}
            <button type="button" onClick={() => choosePeriod(0)} className="bg-transparent border-0 p-0 font-semibold text-indigo-700 underline cursor-pointer">Show everything open</button>
          </p>
        )}
        {!loading && incomplete && groups.length > 0 && (
          <p role="alert" className="m-0 flex items-center justify-between gap-3 bg-amber-50 px-5 py-3 text-label text-amber-800">
            Some items could not be counted, so this list may be missing lines.
            {onRetry && <button type="button" onClick={onRetry} className="bg-transparent border-0 p-0 font-semibold text-amber-900 underline cursor-pointer">Try again</button>}
          </p>
        )}
      </div>
    </section>
  );
}
