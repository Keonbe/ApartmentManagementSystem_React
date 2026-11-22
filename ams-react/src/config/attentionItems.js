// What the admin has to act on: the lines of the Dashboard's "Needs your
// attention" list (Components/admin/AttentionList.jsx), counted by
// dashboard_stats.php → attention. Each line opens its page already filtered to
// the rows it counts. The admin sidebar adds up the lines per page for its
// badges (navAttention below), so the badge on a page is the Dashboard's number.
// Tone = priority: red = overdue / at risk, amber = waiting on the admin, sky = for information.
export const countLabel = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export const ATTENTION_GROUPS = [
  {
    title: 'Money',
    items: [
      { key: 'proofs_to_verify', tone: 'amber', to: '/admin-payments?status=pending-verification', one: 'tenant payment to verify', many: 'tenant payments to verify' },
      { key: 'overdue_tenants', tone: 'red', to: '/admin-payments?status=overdue', text: (a) => `${countLabel(a.overdue_tenants, 'tenant', 'tenants')} overdue (${countLabel(a.overdue_invoices, 'bill', 'bills')})` },
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
      { key: 'signed_contracts_to_review', tone: 'amber', to: '/admin-contracts?status=to-check', one: 'signed contract to check', many: 'signed contracts to check' },
      { key: 'move_out_requests', tone: 'amber', to: '/admin-tenants?filter=pending-move-out', one: 'move-out request', many: 'move-out requests' },
      { key: 'extension_requests', tone: 'amber', to: '/admin-tenants?filter=extension', one: 'rent extension request to decide', many: 'rent extension requests to decide' },
      { key: 'requests_to_decide', tone: 'amber', to: '/admin-notifications?filter=decide', one: 'occupancy or household request to decide', many: 'occupancy or household requests to decide' },
      { key: 'new_inquiries', tone: 'amber', to: '/admin-inquiries', one: 'new inquiry to answer', many: 'new inquiries to answer' },
    ],
  },
  {
    title: 'Contracts',
    items: [
      { key: 'eviction_pending', tone: 'red', to: '/admin-contracts?status=eviction-pending', one: 'contract pending eviction', many: 'contracts pending eviction' },
      { key: 'contracts_missing_docs', tone: 'amber', to: '/admin-contracts?status=docs-missing', one: 'contract missing documents', many: 'contracts missing documents' },
      { key: 'notarized_contracts_to_collect', tone: 'amber', to: '/admin-contracts?status=to-collect', one: 'notarized contract to collect', many: 'notarized contracts to collect' },
      { key: 'contracts_draft', tone: 'sky', to: '/admin-contracts?status=draft', one: 'draft contract not yet active', many: 'draft contracts not yet active' },
      { key: 'contracts_ending', tone: 'sky', to: '/admin-contracts?status=ending', text: (a) => `${countLabel(a.contracts_ending, 'rent term ends', 'rent terms end')} within ${a.contracts_ending_days ?? 30} days` },
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

// One line's wording, e.g. "3 applications to review".
export const attentionLine = (item, attention) => (
  item.text ? item.text(attention) : countLabel(attention[item.key], item.one, item.many)
);

// Lines that ask the admin to do something (red and amber; sky is for information).
const NAV_TONES = ['red', 'amber'];
// Pages that never get a sidebar count: Notifications is what the bell already shows.
const NAV_HIDDEN_PAGES = ['/admin-notifications'];
const pathOf = (to) => to.split('?')[0];

// Sidebar badges: { '/admin-payments': { count: 4, lines: ['3 tenant payments to verify', …] } }
// for each page with something to do.
export function navAttention(attention) {
  const out = {};
  if (!attention) return out;
  for (const group of ATTENTION_GROUPS) {
    for (const item of group.items) {
      const count = Number(attention[item.key]) || 0;
      if (count <= 0 || !NAV_TONES.includes(item.tone)) continue;
      const page = pathOf(item.to);
      if (NAV_HIDDEN_PAGES.includes(page)) continue;
      const entry = out[page] || (out[page] = { count: 0, lines: [] });
      entry.count += count;
      entry.lines.push(attentionLine(item, attention));
    }
  }
  return out;
}
