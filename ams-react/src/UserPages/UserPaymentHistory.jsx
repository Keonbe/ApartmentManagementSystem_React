import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoiceDollar, faDownload, faHistory, faPrint, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';
import useInvoiceWatch, { AWAITING_STATUSES, PAYABLE_STATUSES } from '../hooks/useInvoiceWatch';
import fileUrl from '../api/fileUrl';
import { useLang, dateLocale, t as translate } from '../config/i18n';
import { daysPastDue, formatPeriodRange, isBundleKey, isPastDue } from '../utils/billingPeriod';
import { printElement } from '../utils/print';
import useDialog from '../hooks/useDialog';
import { invoiceOwed } from '../utils/invoiceBalance';
import Collapsible from '../Components/tenant/Collapsible';
import { Bone, SkeletonGroup } from '../Components/tenant/Skeleton';
import '../assets/styles/responsive/user/user-payment-history.responsive.css';
import { personName } from '../utils/personName';

// Badge per invoice status. Anything awaiting management or the gateway is
// shown as such rather than as "Unpaid", and only a payable bill gets Pay Now.
const STATUS_BADGES = {
    'pending-verification': { key: 'pending-verification', cls: 'bg-sky-100 text-sky-800' },
    scheduled: { key: 'scheduled', cls: 'bg-sky-100 text-sky-800' },
    processing: { key: 'processing', cls: 'bg-sky-100 text-sky-800' },
    'payment-failed': { key: 'payment-failed', cls: 'bg-rose-100 text-rose-700' },
    overdue: { key: 'overdue', cls: 'bg-rose-100 text-rose-700' },
    cancelled: { key: 'cancelled', cls: 'bg-slate-100 text-slate-700' },
};
const UNPAID_BADGE = { key: 'unpaid', cls: 'bg-amber-100 text-amber-800' };

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};
const formatDate = (value) => value
    ? new Date(value).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
    : translate('paymentHistory.notAvailable');

export default function UserPaymentHistory() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLang();

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
    // Opened directly when arriving from a "Payment confirmed" notice.
    const [receiptInvoiceId, setReceiptInvoiceId] = useState(location.state?.receiptId || null);
    const [notice, setNotice] = useState(null);
    const [view, setView] = useState('all');
    const receiptRef = useRef(null);

    const handleTransitions = (events) => {
        const confirmed = events.filter(e => e.type === 'confirmed');
        if (confirmed.length === 0) return;
        const first = confirmed[0].invoice;
        setNotice({
            message: t('paymentHistory.confirmedTitle'),
            subtext: confirmed.length === 1
                ? t('paymentHistory.confirmedOne', { period: first.billing_period || t('paymentHistory.invoiceNo', { id: first.id }) })
                : t('paymentHistory.confirmedMany', { count: confirmed.length }),
            action: { label: t('paymentHistory.viewReceipt'), onClick: () => { setNotice(null); setReceiptInvoiceId(first.id); } },
        });
    };

    const { invoices, loaded, loadError, refresh } = useInvoiceWatch({ onTransition: handleTransitions });
    const loading = !loaded;

    const buildReceipt = (inv) => {
        let breakdown = inv.advance_months
            ? t(inv.advance_months === 1 ? 'paymentHistory.advanceRentOne' : 'paymentHistory.advanceRentMany', { n: inv.advance_months, amount: formatCurrency(inv.base_rent) })
            : `${t('paymentHistory.rent')} ${formatCurrency(inv.base_rent)}`;
        if (parseFloat(inv.security_deposit) > 0) {
            breakdown += `\n${t('paymentHistory.deposit')} ${formatCurrency(inv.security_deposit)}`;
        }
        if (parseFloat(inv.water) > 0) {
            breakdown += `\n${t('paymentHistory.water')} ${formatCurrency(inv.water)}`;
        }
        if (parseFloat(inv.electricity) > 0) {
            breakdown += `\n${t('paymentHistory.electricity')} ${formatCurrency(inv.electricity)}`;
        }
        if (parseFloat(inv.parking) > 0) {
            breakdown += `\n${t('paymentHistory.parking')} ${formatCurrency(inv.parking)}`;
        }
        if (parseFloat(inv.services) > 0) {
            breakdown += `\n${t('paymentHistory.addOnServices')} ${formatCurrency(inv.services)}`;
        }
        if (parseFloat(inv.maintenance) > 0) {
            breakdown += `\n${t('paymentHistory.maintenance')} ${formatCurrency(inv.maintenance)}`;
        }
        if (parseFloat(inv.late_fee) > 0) {
            breakdown += `\n${t('paymentHistory.lateFee')} ${formatCurrency(inv.late_fee)}`;
        }

        // A month paid ahead of its due date says so; every month keeps its own receipt.
        const paidInAdvance = inv.paid_at && inv.due_date && String(inv.paid_at).slice(0, 10) < inv.due_date;

        return {
            rctId: `RCT-${inv.id}`,
            date: formatDate(inv.paid_at),
            tenant: personName(loggedInUser) || t('paymentHistory.tenantFallback'),
            unit: inv.room_name || t('paymentHistory.notAvailable'),
            period: inv.billing_period,
            coveredPeriod: formatPeriodRange(inv.period_start, inv.period_end),
            dueDate: inv.due_date ? formatDate(`${inv.due_date}T00:00:00`) : null,
            paidInAdvance,
            // Month settled from a credit: payment_reference is the advance invoice.
            paidFromAdvance: inv.paid_from_advance ? inv.payment_reference : null,
            advanceMonths: inv.advance_months || 0,
            bundleKey: isBundleKey(inv.payment_group) ? inv.payment_group : null,
            amount: parseFloat(inv.total_amount),
            breakdown: breakdown,
            status: inv.status.toUpperCase(),
            method: inv.payment_method || t('paymentHistory.notAvailable'),
            paymentTransactions: inv.payment_transactions || [],
            reference: inv.payment_reference || null,
            proofPath: inv.proof_of_payment_path || null
        };
    };

    // A receipt for one recorded portion of a bill that is not fully paid yet
    // (id 'TX-<payment_transactions.id>'). Numbered from the portion's own id, so
    // no new column is needed; the full receipt follows when the bill is paid.
    const buildPartReceipt = (inv, tx) => {
        const portions = [...(inv.payment_transactions || [])].sort((a, b) => Number(a.id) - Number(b.id));
        const upTo = portions.slice(0, portions.findIndex((p) => String(p.id) === String(tx.id)) + 1);
        const paidSoFar = upTo.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        const billTotal = parseFloat(inv.total_amount) || 0;
        return {
            ...buildReceipt(inv),
            rctId: `RCT-${inv.id}-${tx.id}`,
            date: formatDate(tx.created_at),
            status: 'PART',
            isPart: true,
            method: tx.bank_name || tx.payment_method || t('paymentHistory.notAvailable'),
            reference: tx.reference_number || null,
            paymentTransactions: [],
            proofPath: null,
            amount: parseFloat(tx.amount) || 0,
            paidSoFar,
            balance: Math.max(0, Math.round((billTotal - paidSoFar) * 100) / 100),
        };
    };
    const partOf = (id) => {
        if (!String(id || '').startsWith('TX-')) return null;
        const txId = String(id).slice(3);
        for (const inv of invoices) {
            const tx = (inv.payment_transactions || []).find((p) => String(p.id) === txId);
            if (tx) return { inv, tx };
        }
        return null;
    };

    // Combined payments ('BND-…'): the bills paid together, keyed by group.
    const combinedPayments = Object.values(invoices.reduce((acc, inv) => {
        if (inv.status === 'paid' && isBundleKey(inv.payment_group)) {
            (acc[inv.payment_group] = acc[inv.payment_group] || { key: inv.payment_group, bills: [] }).bills.push(inv);
        }
        return acc;
    }, {})).map(c => ({ ...c, bills: [...c.bills].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))) }));

    // One receipt for a whole combined payment: every billing period it
    // settled, with the payment details they share.
    const buildCombinedReceipt = ({ key, bills }) => {
        const first = bills[0];
        return {
            ...buildReceipt(first),
            rctId: `RCT-${key}`,
            period: t(bills.length === 1 ? 'paymentHistory.combinedPeriodOne' : 'paymentHistory.combinedPeriodMany', { count: bills.length }),
            coveredPeriod: '',
            dueDate: null,
            paidInAdvance: false,
            paidFromAdvance: null,
            advanceMonths: 0,
            bundleKey: null,
            combinedBills: bills.length,
            // Every bill's payment rows, not only the first bill's.
            paymentTransactions: bills.flatMap(b => b.payment_transactions || []),
            reference: [...new Set(bills.map(b => b.payment_reference).filter(Boolean))].join(', ') || null,
            amount: bills.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0),
            breakdown: bills.map(i => {
                const range = formatPeriodRange(i.period_start, i.period_end);
                const fee = parseFloat(i.late_fee) > 0 ? ` ${t('paymentHistory.inclLateFee', { amount: formatCurrency(i.late_fee) })}` : '';
                return `${i.billing_period}${range ? ` · ${range}` : ''} · ${i.id}: ${formatCurrency(i.total_amount)}${fee}`;
            }).join('\n'),
        };
    };

    const combinedForReceipt = isBundleKey(receiptInvoiceId) ? combinedPayments.find(c => c.key === receiptInvoiceId) : null;
    const receiptInvoice = invoices.find(i => i.id === receiptInvoiceId && i.status === 'paid');
    const partForReceipt = partOf(receiptInvoiceId);
    const receiptData = combinedForReceipt ? buildCombinedReceipt(combinedForReceipt)
        : partForReceipt ? buildPartReceipt(partForReceipt.inv, partForReceipt.tx)
        : receiptInvoice ? buildReceipt(receiptInvoice) : null;
    const showReceipt = !!receiptData;
    const receiptDialogRef = useDialog(showReceipt, () => setReceiptInvoiceId(null));

    // ── Grouping: To pay (open and awaiting), Paid by year, Cancelled ──
    const byDue = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''));
    const owedOf = invoiceOwed;
    const isOpen = (i) => PAYABLE_STATUSES.includes(i.status) || AWAITING_STATUSES.includes(i.status);
    const openBills = invoices.filter(isOpen).sort(byDue);
    const payable = openBills.filter((i) => PAYABLE_STATUSES.includes(i.status));
    // An unpaid advance-rent invoice is an optional prepayment, not a debt: left out of the owed total.
    const owedBills = payable.filter((i) => i.advance_months == null);
    const toPayTotal = owedBills.reduce((s, i) => s + owedOf(i), 0);
    const paidBills = invoices.filter((i) => i.status === 'paid');
    const otherBills = invoices.filter((i) => !isOpen(i) && i.status !== 'paid');
    const lastPaid = paidBills.filter((i) => i.paid_at).sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))[0];
    // A bill's place in time: the month it covers, else its due date.
    const sortKey = (i) => String(i.period_start || i.due_date || i.created_at || '');
    // A bill paid in a combined payment is listed once, inside that payment.
    const paidEntries = [
        ...paidBills.filter((i) => !isBundleKey(i.payment_group)).map((i) => ({ kind: 'bill', key: i.id, sort: sortKey(i), inv: i })),
        ...combinedPayments.map((c) => ({ kind: 'combined', key: c.key, sort: sortKey(c.bills[c.bills.length - 1]), group: c })),
    ].sort((a, b) => b.sort.localeCompare(a.sort));
    const paidByYear = paidEntries.reduce((acc, e) => {
        const year = e.sort.slice(0, 4) || 'Earlier';
        (acc[year] = acc[year] || []).push(e);
        return acc;
    }, {});
    const years = Object.keys(paidByYear).sort((a, b) => b.localeCompare(a));

    const invoiceLabel = (inv) => (String(inv.id).startsWith('INV-') ? inv.id : `INV-${inv.id}`);
    const shortDay = (d) => (d ? new Date(String(d).length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' }) : '');
    // The charges on a bill, as one quiet line ("Rent ₱4,000.00, Water ₱120.00").
    const chargesLine = (inv) => [
        [t('paymentHistory.rent'), inv.base_rent], [t('paymentHistory.deposit'), inv.security_deposit],
        [t('paymentHistory.water'), inv.water], [t('paymentHistory.electricity'), inv.electricity],
        [t('paymentHistory.parking'), inv.parking], [t('paymentHistory.maintenance'), inv.maintenance],
    ].filter(([, v]) => parseFloat(v) > 0).map(([label, v]) => `${String(label).replace(/:\s*$/, '')} ${formatCurrency(v)}`).join(', ');

    // max-w + leading-tight: a long label ("Tingnan ang Resibo") wraps inside the
    // button instead of pushing the button under the amount on phones.
    const RECEIPT_BTN = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] max-w-[10rem] px-4 py-1.5 rounded-lg leading-tight text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-bold border-0 cursor-pointer transition-colors';

    // One bill in a list. `nested`: shown inside a combined payment.
    const billRow = (inv, { nested = false } = {}) => {
        const paid = inv.status === 'paid';
        const open = isOpen(inv);
        const isAdvanceBill = inv.advance_months != null && inv.status === 'overdue';
        const badge = isAdvanceBill ? UNPAID_BADGE : (STATUS_BADGES[inv.status] || UNPAID_BADGE);
        const badgeLabel = t(`paymentHistory.status.${badge.key}`);
        const range = inv.period_start && inv.period_end ? formatPeriodRange(inv.period_start, inv.period_end) : '';
        const amount = open ? owedOf(inv) : parseFloat(inv.total_amount) || 0;
        const partPaid = open && (parseFloat(inv.amount_paid) || 0) > 0;
        const charges = nested ? '' : chargesLine(inv);
        return (
            <li key={inv.id} className={`payment-history-item flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${nested ? 'py-3' : 'py-4'}`}>
                <div className="min-w-0">
                    <p className={`m-0 font-bold text-slate-900 ${nested ? 'text-sm' : 'text-base'}`}>{inv.billing_period || invoiceLabel(inv)}</p>
                    <p className="m-0 mt-0.5 text-sm text-slate-500">
                        {range && <>{range}, </>}{invoiceLabel(inv)}
                    </p>
                    {open && !isAdvanceBill && isPastDue(inv) && (
                        <p className="m-0 mt-1 text-sm font-semibold text-rose-700">{daysPastDue(inv) === 1 ? t('paymentHistory.overdueOne') : t('paymentHistory.overdueMany', { count: daysPastDue(inv) })}</p>
                    )}
                    {paid && inv.paid_from_advance && (
                        <p className="m-0 mt-1 text-sm font-semibold text-emerald-700">{t('paymentHistory.paidFromAdvance', { ref: inv.payment_reference })}</p>
                    )}
                    {charges && <p className="m-0 mt-1 text-sm text-slate-500">{charges}</p>}
                </div>
                <div className="payment-history-actions flex flex-wrap items-center gap-3 sm:justify-end shrink-0">
                    <div className="sm:text-right min-w-0 flex-[1_1_8rem]">
                        <p className={`m-0 font-bold text-slate-900 tabular-nums ${nested ? 'text-sm' : 'text-base'}`}>{formatCurrency(amount)}</p>
                        {partPaid && <p className="m-0 text-xs text-slate-600 tabular-nums">{t('paymentHistory.ofTotal', { amount: formatCurrency(inv.total_amount) })}</p>}
                        {paid && inv.paid_at && <p className="m-0 text-sm text-emerald-700">{t('paymentHistory.paidOn')} {shortDay(inv.paid_at)}</p>}
                    </div>
                    {open && <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${badge.cls}`}>{badgeLabel}</span>}
                    {open && PAYABLE_STATUSES.includes(inv.status) && (
                        <button type="button" onClick={() => navigate('/pay-bills')} className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold border-0 cursor-pointer transition-colors">
                            {t('paymentHistory.payNow')} <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                        </button>
                    )}
                    {paid && (
                        <button type="button" onClick={() => setReceiptInvoiceId(inv.id)} className={RECEIPT_BTN}>
                            <FontAwesomeIcon icon={faDownload} aria-hidden="true" /> {t('paymentHistory.viewReceipt')}
                        </button>
                    )}
                    {partPaid && (inv.payment_transactions || []).map((tx) => (
                        <button key={tx.id} type="button" onClick={() => setReceiptInvoiceId(`TX-${tx.id}`)} className={RECEIPT_BTN}>
                            <FontAwesomeIcon icon={faDownload} aria-hidden="true" /> {t('paymentHistory.partReceiptBtn', { amount: formatCurrency(tx.amount) })}
                        </button>
                    ))}
                </div>
            </li>
        );
    };

    const SECTION = 'bg-white rounded-2xl border border-slate-200 shadow-sm px-4 sm:px-6';

    return (
        // Inside AccountLayout (App.jsx), which gives the page its width, padding and side menu.
        <div className="payment-history-root w-full">
            <div className="w-full flex flex-col gap-6 text-left">

                <header className="animate-fade-in flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-slate-200 pb-4">
                    <div>
                        <h1 className="payment-history-heading m-0 text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3 text-brand">
                            <FontAwesomeIcon icon={faHistory} className="text-indigo-600 text-2xl sm:text-3xl" aria-hidden="true" />
                            {t('paymentHistory.heading')}
                        </h1>
                        <p className="payment-history-subtext m-0 mt-2 text-sm text-slate-600">{t('paymentHistory.subtext')}</p>
                    </div>
                    {/* My Refunds is in the account side menu (AccountLayout). */}
                </header>

                {loading ? (
                    // Shaped like the page: the summary card, the filters and a list of bills.
                    <SkeletonGroup label={t('paymentHistory.loading')} className="flex flex-col gap-6">
                        <Bone className="h-[124px] rounded-2xl" />
                        <div className="flex gap-2">
                            {[0, 1, 2].map((i) => <Bone key={i} className="h-11 w-20 rounded-full" />)}
                        </div>
                        <div>
                            <Bone className="h-6 w-28 mb-3" />
                            <div className={`${SECTION} divide-y divide-slate-100`}>
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="flex items-center justify-between gap-4 py-5">
                                        <div className="flex-1 space-y-2">
                                            <Bone className="h-4 w-40" />
                                            <Bone className="h-3 w-64 max-w-full" />
                                            <Bone className="h-3 w-32" />
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <Bone className="h-4 w-24" />
                                            <Bone className="h-10 w-32 rounded-xl" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </SkeletonGroup>
                ) : loadError && invoices.length === 0 ? (
                    <div role="alert" className="p-8 text-center bg-white rounded-2xl border border-rose-200">
                        <p className="m-0 text-sm font-semibold text-rose-800">{t('common.loadFailed')}</p>
                        <button type="button" onClick={refresh} className="mt-4 min-h-[44px] px-5 rounded-xl bg-white border border-rose-300 text-rose-800 text-sm font-bold cursor-pointer hover:bg-rose-50">
                            {t('common.retry')}
                        </button>
                    </div>
                ) : invoices.length === 0 ? (
                    <div className="animate-fade-in-up p-12 text-center bg-white rounded-2xl border border-slate-200">
                        <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-4xl text-slate-300 mb-4" aria-hidden="true" />
                        <h2 className="text-lg font-bold text-slate-800 m-0">{t('paymentHistory.none')}</h2>
                        <p className="text-sm text-slate-600 mt-2 mb-0">{t('paymentHistory.noneDesc')}</p>
                    </div>
                ) : (
                    <div className="page-enter flex flex-col gap-6">
                        {/* Summary: what is owed now, and the last payment. */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-brand text-white p-5 sm:p-6">
                            <div>
                                <p className="m-0 text-sm text-indigo-100">
                                    {owedBills.length === 0 ? t('paymentHistory.nothingToPay') : owedBills.length === 1 ? t('paymentHistory.toPayOne') : t('paymentHistory.toPayMany', { count: owedBills.length })}
                                </p>
                                <p className="m-0 mt-1 text-3xl font-extrabold tabular-nums">{formatCurrency(toPayTotal)}</p>
                                {lastPaid && (
                                    <p className="m-0 mt-2 text-sm text-indigo-100">
                                        {t('paymentHistory.lastPayment', { amount: formatCurrency(lastPaid.total_amount), date: shortDay(lastPaid.paid_at) })}
                                    </p>
                                )}
                            </div>
                            {payable.length > 0 && (
                                <button type="button" onClick={() => navigate('/pay-bills')} className="self-start sm:self-auto inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-white text-brand text-sm font-bold border-0 cursor-pointer hover:bg-indigo-50">
                                    {t('paymentHistory.goToPayBills')} <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                                </button>
                            )}
                        </div>

                        {openBills.length > 0 && paidEntries.length > 0 && (
                            <div role="group" aria-label={t('paymentHistory.filterLabel')} className="flex flex-wrap gap-2">
                                {[['all', 'filterAll'], ['topay', 'filterToPay'], ['paid', 'filterPaid']].map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        aria-pressed={view === key}
                                        onClick={() => setView(key)}
                                        className={`min-h-[44px] cursor-pointer rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-200 active:scale-95 ${view === key ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                                    >
                                        {t(`paymentHistory.${label}`)}
                                    </button>
                                ))}
                            </div>
                        )}

                        {openBills.length > 0 && view !== 'paid' && (
                            <section aria-labelledby="history-to-pay">
                                <h2 id="history-to-pay" className="m-0 mb-3 text-xl font-bold text-slate-900">{t('paymentHistory.toPay')}</h2>
                                <ul className={`${SECTION} list-none m-0 divide-y divide-slate-100`}>
                                    {openBills.map((inv) => billRow(inv))}
                                </ul>
                            </section>
                        )}

                        {paidEntries.length > 0 && view !== 'topay' && (
                            <section aria-labelledby="history-paid">
                                <h2 id="history-paid" className="m-0 mb-3 text-xl font-bold text-slate-900">{t('paymentHistory.paidHeading')}</h2>
                                <div className="flex flex-col gap-5">
                                    {years.map((year) => (
                                        <div key={year}>
                                            <h3 className="m-0 mb-2 text-sm font-bold text-slate-600 tabular-nums">{year}</h3>
                                            <ul className={`${SECTION} list-none m-0 divide-y divide-slate-100`}>
                                                {paidByYear[year].map((entry) => (entry.kind === 'bill' ? billRow(entry.inv) : (
                                                    <li key={entry.key} className="payment-history-item py-4">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="m-0 text-base font-bold text-slate-900">{t('paymentHistory.combinedPayment', { count: entry.group.bills.length })}</p>
                                                                <p className="m-0 mt-0.5 text-sm text-slate-500">
                                                                    {entry.group.bills.map((b) => b.billing_period).join(', ')}, {entry.group.key}
                                                                </p>
                                                            </div>
                                                            <div className="payment-history-actions flex flex-wrap items-center gap-3 sm:justify-end shrink-0">
                                                                <div className="sm:text-right">
                                                                    <p className="m-0 text-base font-bold text-slate-900 tabular-nums">
                                                                        {formatCurrency(entry.group.bills.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0))}
                                                                    </p>
                                                                    {entry.group.bills[0].paid_at && <p className="m-0 text-sm text-emerald-700">{t('paymentHistory.paidOn')} {shortDay(entry.group.bills[0].paid_at)}</p>}
                                                                </div>
                                                                <button type="button" onClick={() => setReceiptInvoiceId(entry.key)} className={RECEIPT_BTN}>
                                                                    <FontAwesomeIcon icon={faDownload} aria-hidden="true" /> {t('paymentHistory.combinedReceipt')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {/* The bills it paid, each with its own receipt. */}
                                                        <ul className="list-none m-0 mt-3 pl-4 border-l-2 border-emerald-200 divide-y divide-slate-100">
                                                            {entry.group.bills.map((b) => billRow(b, { nested: true }))}
                                                        </ul>
                                                    </li>
                                                )))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {otherBills.length > 0 && view === 'all' && (
                            <Collapsible
                                summary={t('paymentHistory.cancelledBills', { count: otherBills.length })}
                                summaryClassName="text-base font-bold text-slate-700 hover:text-slate-900"
                            >
                                <ul className={`${SECTION} list-none m-0 mt-2 divide-y divide-slate-100`}>
                                    {otherBills.map((inv) => (
                                        <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                                            <span className="text-slate-700">{inv.billing_period || invoiceLabel(inv)} <span className="text-slate-500">({invoiceLabel(inv)})</span></span>
                                            <span className="flex items-center gap-3">
                                                <span className="font-semibold text-slate-600 tabular-nums line-through decoration-slate-400">{formatCurrency(inv.total_amount)}</span>
                                                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${(STATUS_BADGES[inv.status] || STATUS_BADGES.cancelled).cls}`}>{t(`paymentHistory.status.${(STATUS_BADGES[inv.status] || STATUS_BADGES.cancelled).key}`)}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </Collapsible>
                        )}
                    </div>
                )}
            </div>

            {/* Receipt Modal */}
            {showReceipt && receiptData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 modal-overlay-anim" onClick={() => setReceiptInvoiceId(null)}>
                    <div ref={(node) => { receiptRef.current = node; receiptDialogRef.current = node; }} role="dialog" aria-modal="true" aria-labelledby="receipt-title" tabIndex={-1} className="receipt-modal-card modal-card-anim sheet-mobile bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden printable-receipt max-h-[92vh] flex flex-col outline-none" onClick={e => e.stopPropagation()}>
                        <div className="bg-brand text-white p-5 sm:p-6 text-center shrink-0 print:bg-white print:text-slate-900 print:border-b-2 print:border-slate-900">
                            <h2 id="receipt-title" className="m-0 text-xl sm:text-2xl font-bold tracking-wide italic font-serif">Apartment AMS</h2>
                            <p className="m-0 mt-2 text-sm font-semibold text-indigo-100 print:text-slate-700">{t('paymentHistory.officialReceipt')}</p>
                            <p className="m-0 mt-1 text-sm font-mono text-white print:text-slate-900">{receiptData.rctId}</p>
                        </div>
                        <div className="receipt-modal-body p-4 sm:p-6 space-y-4 text-sm text-slate-800 overflow-y-auto flex-grow">
                            <div className="flex justify-between gap-4 border-b border-slate-200 pb-3">
                                <div><p className="m-0 text-xs text-slate-500">{t('paymentHistory.date')}</p><p className="m-0 mt-0.5 font-semibold">{receiptData.date}</p></div>
                                <div className="text-right"><p className="m-0 text-xs text-slate-500">{t('paymentHistory.statusLabel')}</p><p className={`m-0 mt-0.5 font-bold ${receiptData.isPart ? 'text-amber-700' : 'text-emerald-700'}`}>{receiptData.isPart ? t('paymentHistory.partPayment') : receiptData.status === 'PAID' ? t('paymentHistory.paid') : receiptData.status}</p></div>
                            </div>
                            <div className="flex justify-between gap-4 border-b border-slate-200 pb-3">
                                <div>
                                    <p className="m-0 text-xs text-slate-500">{t('paymentHistory.receivedFrom')}</p>
                                    <p className="m-0 mt-0.5 text-base font-bold text-slate-900">{receiptData.tenant}</p>
                                    <p className="m-0 text-slate-600">{t('paymentHistory.unit')} {receiptData.unit}</p>
                                </div>
                                <div className="text-right">
                                    <p className="m-0 text-xs text-slate-500">{t('paymentHistory.method')}</p>
                                    <p className="m-0 mt-0.5 font-semibold text-slate-900">{receiptData.method}</p>
                                    {receiptData.paymentTransactions?.length > 0 && (
                                        <div className="mt-2 text-left space-y-1">
                                            {receiptData.paymentTransactions.map((tx) => (
                                                <p key={tx.id} className="m-0 text-xs text-slate-700">
                                                    {formatCurrency(tx.amount)} {tx.bank_name || tx.payment_method}{tx.reference_number ? <> ({t('paymentHistory.refShort')} <span className="font-mono">{tx.reference_number}</span>)</> : ''}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                    {receiptData.reference && (
                                        <p className="m-0 mt-1 text-xs font-semibold text-indigo-700">{t('paymentHistory.refShort')} <span className="font-mono">{receiptData.reference}</span></p>
                                    )}
                                </div>
                            </div>
                            <div className="border-b border-slate-200 pb-3">
                                <p className="m-0 text-xs text-slate-500">{t('paymentHistory.billingPeriod')}</p>
                                <p className="m-0 mt-0.5 font-semibold text-slate-900">
                                    {receiptData.period}{receiptData.coveredPeriod ? ` (${receiptData.coveredPeriod})` : ''}{receiptData.dueDate && !receiptData.advanceMonths ? `, ${t('paymentHistory.dueOn', { date: receiptData.dueDate })}` : ''}
                                </p>
                                {receiptData.bundleKey && (
                                    <p className="m-0 mt-1 text-xs font-semibold text-emerald-700">
                                        {t('paymentHistory.partOfCombined', { key: receiptData.bundleKey })}{' '}
                                        <button type="button" onClick={() => setReceiptInvoiceId(receiptData.bundleKey)} className="print-hide bg-transparent border-0 p-0 text-xs font-bold text-indigo-700 underline cursor-pointer">
                                            {t('paymentHistory.viewCombined')}
                                        </button>
                                    </p>
                                )}
                                {receiptData.combinedBills > 0 && (
                                    <p className="m-0 mt-1 text-xs font-semibold text-emerald-700">{t('paymentHistory.eachHasReceipt')}</p>
                                )}
                                {receiptData.paidFromAdvance ? (
                                    <p className="m-0 mt-1 text-xs font-semibold text-emerald-700">{t('paymentHistory.paidFromAdvance', { ref: receiptData.paidFromAdvance })}</p>
                                ) : receiptData.advanceMonths > 0 ? (
                                    <p className="m-0 mt-1 text-xs font-semibold text-emerald-700">{t(receiptData.advanceMonths === 1 ? 'paymentHistory.advanceNoteOne' : 'paymentHistory.advanceNoteMany', { n: receiptData.advanceMonths })}</p>
                                ) : receiptData.paidInAdvance && (
                                    <p className="m-0 mt-1 text-xs font-semibold text-emerald-700">{t('paymentHistory.paidInAdvanceOn', { date: receiptData.date })}</p>
                                )}
                            </div>
                            <div>
                                <p className="m-0 mb-1 text-xs text-slate-500">{t('paymentHistory.breakdown')}</p>
                                <div className="bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed text-slate-800 tabular-nums">{receiptData.breakdown}</div>
                            </div>
                            {receiptData.proofPath && (
                                <div className="print-hide text-sm text-slate-700 bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex items-center justify-between flex-wrap gap-2">
                                    <span>{t('paymentHistory.proofAttached')}</span>
                                    <a href={fileUrl(receiptData.proofPath)} target="_blank" rel="noreferrer" className="text-indigo-700 font-bold hover:underline">{t('paymentHistory.viewScreenshot')}</a>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-3 border-t-2 border-dashed border-slate-200">
                                <p className="m-0 font-bold text-slate-700 text-base">{receiptData.isPart ? t('paymentHistory.thisPayment') : t('paymentHistory.totalPaid')}</p>
                                <p className="m-0 text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(receiptData.amount)}</p>
                            </div>
                            {receiptData.isPart && (
                                <div className="space-y-1">
                                    <div className="flex justify-between gap-4 text-sm"><span className="text-slate-600">{t('paymentHistory.paidSoFar')}</span><span className="font-semibold tabular-nums">{formatCurrency(receiptData.paidSoFar)}</span></div>
                                    <div className="flex justify-between gap-4 text-sm"><span className="text-slate-600">{t('paymentHistory.balanceRemaining')}</span><span className="font-semibold tabular-nums">{formatCurrency(receiptData.balance)}</span></div>
                                    <p className="m-0 pt-1 text-xs text-slate-500">{t('paymentHistory.partNote')}</p>
                                </div>
                            )}
                        </div>
                        <div className="receipt-modal-footer flex gap-2 p-3 sm:p-4 bg-slate-50 border-t border-slate-200 print-hide shrink-0">
                            <button type="button" onClick={() => printElement(receiptRef.current)} className="flex-1 flex items-center justify-center gap-2 min-h-[44px] bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors">
                                <FontAwesomeIcon icon={faPrint} aria-hidden="true" /> {t('paymentHistory.printReceipt')}
                            </button>
                            <button type="button" onClick={() => setReceiptInvoiceId(null)} className="flex-1 min-h-[44px] bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-100 cursor-pointer transition-colors">
                                {t('paymentHistory.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SuccessModal
                isOpen={!!notice}
                onClose={() => setNotice(null)}
                message={notice?.message}
                subtext={notice?.subtext}
                action={notice?.action}
            />
        </div>
    );
}
