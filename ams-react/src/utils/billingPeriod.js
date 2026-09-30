// Billing-period display (panel feedback 2026-09-28): a past-due bill shows
// the dates it covers, counted from the tenant's move-in day, instead of a due
// date that has already passed. get_invoices.php sends period_start /
// period_end (invoice_covered_period() in backend/config.php).

const parseYmd = (s) => {
    const [y, m, d] = String(s || '').split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
};

const fmt = (d, withYear) => d.toLocaleDateString('en-US', withYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' });

// "Sep 15 – Oct 14, 2026" (the year once when both ends share it), or ''.
export const formatPeriodRange = (start, end) => {
    const a = parseYmd(start);
    const b = parseYmd(end);
    if (!a || !b) return '';
    return a.getFullYear() === b.getFullYear()
        ? `${fmt(a, false)} – ${fmt(b, true)}`
        : `${fmt(a, true)} – ${fmt(b, true)}`;
};

// The covered period of an invoice, falling back to its "Month YYYY" label.
export const formatCoveredPeriod = (inv) =>
    formatPeriodRange(inv?.period_start, inv?.period_end) || inv?.billing_period || '';

// Whole days an unpaid invoice is past its due date (0 when not past due).
export const daysPastDue = (inv) => {
    const due = parseYmd(inv?.due_date);
    if (!due) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((today - due) / 86400000));
};

// Unpaid and past its due date (or already marked overdue).
export const isPastDue = (inv) =>
    !!inv && inv.status !== 'paid' && inv.status !== 'cancelled'
    && (inv.status === 'overdue' || daysPastDue(inv) > 0);

// "Nov 1, 2026" for a 'YYYY-MM-DD' date, or ''.
export const formatDay = (s) => {
    const d = parseYmd(s);
    return d ? fmt(d, true) : '';
};

// A combined payment of overdue bills ('BND-…', bundle_payment.php).
export const isBundleKey = (k) => typeof k === 'string' && k.startsWith('BND-');
