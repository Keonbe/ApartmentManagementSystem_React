import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import EmptyState from './ui/EmptyState';
import LoadError from './ui/LoadError';
import { PANEL, PANEL_HEADER, PANEL_TITLE } from './ui/styles';
import { SkeletonList } from './ui/Skeleton';

// What the admin has to act on, from dashboard_stats.php → attention. Each line
// opens its page already filtered to the same rows it counts (useUrlFilter), so
// the number on the Dashboard is the number on the page. Lines at 0 are hidden.
// Tone: red = overdue / at risk, amber = waiting on the admin, sky = for information.
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

const DOT = { red: 'bg-red-600', amber: 'bg-amber-500', sky: 'bg-sky-500' };

// `attention.incomplete` means the server could not count some groups: the list never
// says "All caught up" then, and warns when it shows only part of the picture.
export default function AttentionList({ attention, loading, onRetry }) {
  const incomplete = !!attention?.incomplete;
  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => (attention?.[it.key] ?? 0) > 0) }))
    .filter((g) => g.items.length > 0);
  const total = groups.reduce((sum, g) => sum + g.items.reduce((s, it) => s + (attention[it.key] || 0), 0), 0);

  return (
    <section aria-labelledby="attention-title" className={`${PANEL} overflow-hidden`}>
      <div className={PANEL_HEADER}>
        <h2 id="attention-title" className={PANEL_TITLE}>Needs your attention</h2>
        {total > 0 && <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-slate-900 text-white">{total}</span>}
      </div>

      {loading ? (
        <SkeletonList rows={6} label="Loading what needs your attention…" className="py-2" />
      ) : incomplete && groups.length === 0 ? (
        <LoadError title="Couldn't count what needs your attention" message="This is not an all-clear: the counts did not load." onRetry={onRetry} />
      ) : groups.length === 0 ? (
        <EmptyState icon={faCheckCircle} iconClassName="text-emerald-600" title="All caught up" message="Nothing is waiting on you right now." />
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map((g) => (
            <div key={g.title} className="py-2">
              <h3 className="m-0 px-5 pt-1 pb-1 text-label font-medium text-slate-500">{g.title}</h3>
              <ul className="m-0 p-0 list-none">
                {g.items.map((it) => (
                  <li key={it.key}>
                    <Link
                      to={it.to}
                      className="group flex items-center gap-3 px-5 py-2 text-body text-slate-800 no-underline hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[it.tone]}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">{it.text ? it.text(attention) : n(attention[it.key], it.one, it.many)}</span>
                      <FontAwesomeIcon icon={faChevronRight} className="text-xs text-slate-400 group-hover:text-indigo-600" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {incomplete && (
            <p role="alert" className="m-0 flex items-center justify-between gap-3 bg-amber-50 px-5 py-3 text-label text-amber-800">
              Some items could not be counted, so this list may be missing lines.
              {onRetry && <button type="button" onClick={onRetry} className="bg-transparent border-0 p-0 font-semibold text-amber-900 underline cursor-pointer">Try again</button>}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
