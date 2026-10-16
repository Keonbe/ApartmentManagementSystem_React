import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoiceDollar, faCheckCircle, faDownload, faHistory, faPrint, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';
import useInvoiceWatch, { PAYABLE_STATUSES } from '../hooks/useInvoiceWatch';
import fileUrl from '../api/fileUrl';
import { useLang } from '../config/i18n';
import { daysPastDue, formatPeriodRange, isBundleKey, isPastDue } from '../utils/billingPeriod';
import { printElement } from '../utils/print';
import '../assets/styles/responsive/user/user-payment-history.responsive.css';

// Badge per invoice status. Anything awaiting management or the gateway is
// shown as such rather than as "Unpaid", and only a payable bill gets Pay Now.
const STATUS_BADGES = {
    'pending-verification': { label: 'Verifying', cls: 'bg-sky-100 text-sky-800' },
    scheduled: { label: 'Scheduled', cls: 'bg-sky-100 text-sky-800' },
    processing: { label: 'Processing', cls: 'bg-sky-100 text-sky-800' },
    'payment-failed': { label: 'Payment failed', cls: 'bg-rose-100 text-rose-700' },
    overdue: { label: 'Overdue', cls: 'bg-rose-100 text-rose-700' },
    cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600' },
};
const UNPAID_BADGE = { label: 'Unpaid', cls: 'bg-amber-100 text-amber-800' };

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};
const formatDate = (value) => value
    ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'N/A';

export default function UserPaymentHistory() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLang();

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
    // Opened directly when arriving from a "Payment confirmed" notice.
    const [receiptInvoiceId, setReceiptInvoiceId] = useState(location.state?.receiptId || null);
    const [notice, setNotice] = useState(null);
    const receiptRef = useRef(null);

    const handleTransitions = (events) => {
        const confirmed = events.filter(e => e.type === 'confirmed');
        if (confirmed.length === 0) return;
        const first = confirmed[0].invoice;
        setNotice({
            message: 'Payment confirmed',
            subtext: confirmed.length === 1
                ? `Management confirmed your payment for ${first.billing_period || `invoice ${first.id}`}. Your receipt is ready.`
                : `Management confirmed ${confirmed.length} payments. A receipt for each month is ready.`,
            action: { label: 'View receipt', onClick: () => { setNotice(null); setReceiptInvoiceId(first.id); } },
        });
    };

    const { invoices, loaded } = useInvoiceWatch({ onTransition: handleTransitions });
    const loading = !loaded;

    const buildReceipt = (inv) => {
        let breakdown = inv.advance_months
            ? `Advance rent (${inv.advance_months} month${inv.advance_months === 1 ? '' : 's'}): ${formatCurrency(inv.base_rent)}`
            : `Rent: ${formatCurrency(inv.base_rent)}`;
        if (parseFloat(inv.security_deposit) > 0) {
            breakdown += `\nSecurity Deposit: ${formatCurrency(inv.security_deposit)}`;
        }
        if (parseFloat(inv.water) > 0) {
            breakdown += `\nWater: ${formatCurrency(inv.water)}`;
        }
        if (parseFloat(inv.electricity) > 0) {
            breakdown += `\nElectricity: ${formatCurrency(inv.electricity)}`;
        }
        if (parseFloat(inv.parking) > 0) {
            breakdown += `\nParking: ${formatCurrency(inv.parking)}`;
        }
        if (parseFloat(inv.services) > 0) {
            breakdown += `\nAdd-On Services: ${formatCurrency(inv.services)}`;
        }
        if (parseFloat(inv.maintenance) > 0) {
            breakdown += `\nMaintenance Recharge: ${formatCurrency(inv.maintenance)}`;
        }
        if (parseFloat(inv.late_fee) > 0) {
            breakdown += `\nLate Fee Penalty (Overdue): ${formatCurrency(inv.late_fee)}`;
        }

        // A month paid ahead of its due date says so; every month keeps its own receipt.
        const paidInAdvance = inv.paid_at && inv.due_date && String(inv.paid_at).slice(0, 10) < inv.due_date;

        return {
            rctId: `RCT-${inv.id}`,
            date: formatDate(inv.paid_at),
            tenant: `${loggedInUser.first_name || ''} ${loggedInUser.last_name || ''}`.trim() || 'Tenant',
            unit: inv.room_name || 'N/A',
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
            method: inv.payment_method || 'N/A',
            paymentTransactions: inv.payment_transactions || [],
            reference: inv.payment_reference || null,
            proofPath: inv.proof_of_payment_path || null
        };
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
            period: `Combined payment — ${bills.length} billing period${bills.length === 1 ? '' : 's'}`,
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
                const fee = parseFloat(i.late_fee) > 0 ? ` (incl. late fee ${formatCurrency(i.late_fee)})` : '';
                return `${i.billing_period}${range ? ` · ${range}` : ''} · ${i.id}: ${formatCurrency(i.total_amount)}${fee}`;
            }).join('\n'),
        };
    };

    const combinedForReceipt = isBundleKey(receiptInvoiceId) ? combinedPayments.find(c => c.key === receiptInvoiceId) : null;
    const receiptInvoice = invoices.find(i => i.id === receiptInvoiceId && i.status === 'paid');
    const receiptData = combinedForReceipt ? buildCombinedReceipt(combinedForReceipt)
        : receiptInvoice ? buildReceipt(receiptInvoice) : null;
    const showReceipt = !!receiptData;

    return (
        <div className="payment-history-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1000px] space-y-6 sm:space-y-8 flex flex-col justify-start text-left">
                
                <div className="border-b border-slate-200 pb-4 relative">
                    <button
                        onClick={() => navigate('/my-refunds')}
                        className="sm:absolute sm:right-0 sm:top-0 mb-3 sm:mb-0 px-4 py-2 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-sm font-semibold cursor-pointer hover:bg-indigo-50 transition-colors flex items-center gap-2"
                    >
                        {t('paymentHistory.myRefunds')}
                        <FontAwesomeIcon icon={faArrowRight} />
                    </button>
                    <h1 className="payment-history-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none flex items-center gap-3" style={{ color: '#3b4276' }}>
                        <FontAwesomeIcon icon={faHistory} className="text-indigo-500 text-2xl sm:text-3xl" />
                        {t('paymentHistory.heading')}
                    </h1>
                    <p className="payment-history-subtext text-slate-500 text-sm mt-2 m-0">
                        {t('paymentHistory.subtext')}
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">{t('paymentHistory.loading')}</div>
                    ) : invoices.length === 0 ? (
                        <div className="p-12 text-center">
                            <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-4xl text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-700 m-0">{t('paymentHistory.none')}</h3>
                            <p className="text-sm text-slate-500 mt-2">{t('paymentHistory.noneDesc')}</p>
                        </div>
                    ) : (
                        <div className="stagger-children divide-y divide-slate-100">
                            {combinedPayments.map(c => (
                                <div key={c.key} className="payment-history-item card-interactive p-4 sm:p-6 bg-emerald-50/40 hover:bg-emerald-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
                                    <div className="flex items-start gap-3 sm:gap-4">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-lg sm:text-xl shrink-0 bg-emerald-100 text-emerald-600">
                                            <FontAwesomeIcon icon={faCheckCircle} />
                                        </div>
                                        <div>
                                            <span className="text-xs font-bold tracking-wider text-slate-400">Combined payment {c.key}</span>
                                            <h3 className="text-base sm:text-lg font-bold text-slate-800 m-0 mt-1">
                                                {formatCurrency(c.bills.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0))}
                                            </h3>
                                            <p className="text-xs text-slate-500 m-0 mt-1">
                                                {c.bills.length} billing periods: {c.bills.map(i => i.billing_period).join(', ')}
                                            </p>
                                            {c.bills[0].paid_at && (
                                                <p className="text-xs text-emerald-600 font-medium m-0 mt-2">{t('paymentHistory.paidOn')} {new Date(c.bills[0].paid_at).toLocaleDateString()}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="payment-history-actions flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 w-full sm:w-auto mt-2 sm:mt-0 pl-0 shrink-0">
                                        <span className="px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full">{t('paymentHistory.paid')}</span>
                                        <button
                                            onClick={() => setReceiptInvoiceId(c.key)}
                                            className="payment-history-view-btn flex items-center gap-1.5 px-4 py-2.5 sm:py-2 text-sm font-bold text-indigo-600 bg-indigo-50 border-0 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer min-h-[44px]"
                                        >
                                            <FontAwesomeIcon icon={faDownload} /> Combined receipt
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {invoices.map((inv) => {
                                const isPaid = inv.status?.toLowerCase() === 'paid';
                                const badge = STATUS_BADGES[inv.status] || UNPAID_BADGE;
                                return (
                                    <div key={inv.id} className="payment-history-item card-interactive p-4 sm:p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-lg sm:text-xl shrink-0 ${isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                <FontAwesomeIcon icon={isPaid ? faCheckCircle : faFileInvoiceDollar} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="text-xs font-bold tracking-wider text-slate-400">{String(inv.id).startsWith('INV-') ? inv.id : `INV-${inv.id}`}</span>
                                                    <span className="text-xs text-slate-300">•</span>
                                                    <span className="text-xs font-medium text-slate-500">{t('paymentHistory.billed')} {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                                <h3 className="text-base sm:text-lg font-bold text-slate-800 m-0">{formatCurrency(inv.total_amount)}</h3>
                                                
                                                <div className="mt-2 space-y-1 text-xs text-slate-500">
                                                    <div className="flex gap-2">
                                                        <span className="font-semibold">{t('paymentHistory.period')}</span>
                                                        <span>
                                                            {inv.billing_period}
                                                            {inv.period_start && inv.period_end && (
                                                                <span className="text-slate-400"> ({formatPeriodRange(inv.period_start, inv.period_end)})</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    {isPastDue(inv) && (
                                                        <div className="text-rose-600 font-semibold">
                                                            Overdue by {daysPastDue(inv)} day{daysPastDue(inv) === 1 ? '' : 's'}
                                                        </div>
                                                    )}
                                                    {inv.paid_from_advance && (
                                                        <div className="text-emerald-600 font-semibold">Paid from advance payment {inv.payment_reference}</div>
                                                    )}
                                                    {isBundleKey(inv.payment_group) && (
                                                        <div className="text-emerald-600 font-semibold">Part of combined payment {inv.payment_group}</div>
                                                    )}
                                                    <div className="flex gap-2 sm:gap-3 flex-wrap text-[11px] text-slate-400">
                                                        <span>{t('paymentHistory.rent')} {formatCurrency(inv.base_rent)}</span>
                                                        {parseFloat(inv.security_deposit) > 0 && (
                                                            <span>{t('paymentHistory.deposit')} {formatCurrency(inv.security_deposit)}</span>
                                                        )}
                                                        {parseFloat(inv.water) > 0 && (
                                                            <span>{t('paymentHistory.water')} {formatCurrency(inv.water)}</span>
                                                        )}
                                                        {parseFloat(inv.electricity) > 0 && (
                                                            <span>{t('paymentHistory.electricity')} {formatCurrency(inv.electricity)}</span>
                                                        )}
                                                        {parseFloat(inv.parking) > 0 && (
                                                            <span>{t('paymentHistory.parking')} {formatCurrency(inv.parking)}</span>
                                                        )}
                                                        {parseFloat(inv.maintenance) > 0 && (
                                                            <span>{t('paymentHistory.maintenance')} {formatCurrency(inv.maintenance)}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {isPaid && inv.paid_at && (
                                                    <p className="text-xs text-emerald-600 font-medium m-0 mt-2">{t('paymentHistory.paidOn')} {new Date(inv.paid_at).toLocaleDateString()}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="payment-history-actions flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 w-full sm:w-auto mt-2 sm:mt-0 pl-0 shrink-0">
                                            {isPaid ? (
                                                <span className="px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full">{t('paymentHistory.paid')}</span>
                                            ) : (
                                                <>
                                                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${badge.cls}`}>
                                                        {badge.label}
                                                    </span>
                                                    {PAYABLE_STATUSES.includes(inv.status) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate('/pay-bills')}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg border-0 cursor-pointer transition-colors"
                                                        >
                                                            <span>Pay Now</span>
                                                            <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            
                                            {isPaid && (
                                                <button
                                                    onClick={() => setReceiptInvoiceId(inv.id)}
                                                    className="payment-history-view-btn flex items-center gap-1.5 px-4 py-2.5 sm:py-2 text-sm font-bold text-indigo-600 bg-indigo-50 border-0 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer min-h-[44px]"
                                                >
                                                    <FontAwesomeIcon icon={faDownload} /> {t('paymentHistory.viewReceipt')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>

            {/* Receipt Modal */}
            {showReceipt && receiptData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 modal-overlay-anim" onClick={() => setReceiptInvoiceId(null)}>
                    <div ref={receiptRef} className="receipt-modal-card modal-card-anim sheet-mobile bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden printable-receipt max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="bg-slate-900 text-white p-5 sm:p-6 text-center border-b-4 border-indigo-500 shrink-0 print:bg-white print:text-slate-900 print:border-b-2 print:border-slate-900">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-wider italic font-serif mb-1 m-0 uppercase">Apartment AMS</h2>
                            <div className="mt-3 pt-3 border-t border-slate-700/50 print:border-slate-300">
                                <p className="text-xs sm:text-sm font-semibold text-slate-300 uppercase tracking-widest m-0 print:text-slate-700">{t('paymentHistory.officialReceipt')}</p>
                                <p className="text-xs font-mono text-indigo-300 m-0 mt-1 print:text-slate-900">{receiptData.rctId}</p>
                            </div>
                        </div>
                        <div className="receipt-modal-body p-4 sm:p-6 space-y-4 font-mono text-xs sm:text-sm overflow-y-auto flex-grow">
                            <div className="flex justify-between border-b border-slate-200 pb-3">
                                <div><p className="text-slate-500 text-[10px] uppercase m-0">Date</p><p className="font-semibold m-0 mt-0.5">{receiptData.date}</p></div>
                                <div className="text-right"><p className="text-slate-500 text-[10px] uppercase m-0">Status</p><p className="font-bold text-emerald-600 m-0 mt-0.5">{receiptData.status}</p></div>
                            </div>
                            <div className="flex justify-between border-b border-slate-200 pb-3">
                                <div><p className="text-slate-500 text-[10px] uppercase m-0">{t('paymentHistory.receivedFrom')}</p><p className="font-bold text-sm sm:text-base m-0 mt-0.5 text-slate-800">{receiptData.tenant}</p><p className="m-0 text-slate-600 text-xs">{t('paymentHistory.unit')} {receiptData.unit}</p></div>
                                <div className="text-right">
                                    <p className="text-slate-500 text-[10px] uppercase m-0">{t('paymentHistory.method')}</p>
                                    <p className="font-semibold text-slate-800 m-0 mt-0.5">{receiptData.method}</p>
                                    {receiptData.paymentTransactions?.length > 0 && (
                                        <div className="mt-2 text-left space-y-1">
                                            {receiptData.paymentTransactions.map((tx) => <p key={tx.id} className="text-[10px] text-slate-700 m-0">{formatCurrency(tx.amount)} {tx.bank_name || tx.payment_method}{tx.reference_number ? ` (Ref: ${tx.reference_number})` : ''}</p>)}
                                        </div>
                                    )}
                                    {receiptData.reference && (
                                        <p className="text-[10px] text-indigo-600 m-0 mt-1 font-bold">Ref: {receiptData.reference}</p>
                                    )}
                                </div>
                            </div>
                            <div className="border-b border-slate-200 pb-3">
                                <p className="text-slate-500 text-[10px] uppercase m-0">Billing period</p>
                                <p className="font-semibold text-slate-800 m-0 mt-0.5">
                                    {receiptData.period}{receiptData.coveredPeriod ? ` (${receiptData.coveredPeriod})` : ''}{receiptData.dueDate && !receiptData.advanceMonths ? `, due ${receiptData.dueDate}` : ''}
                                </p>
                                {receiptData.bundleKey && (
                                    <p className="text-[10px] text-emerald-700 font-bold m-0 mt-1">
                                        Paid as part of combined payment {receiptData.bundleKey}.{' '}
                                        <button type="button" onClick={() => setReceiptInvoiceId(receiptData.bundleKey)} className="print-hide bg-transparent border-0 p-0 text-indigo-600 font-bold underline cursor-pointer text-[10px]">
                                            View combined receipt
                                        </button>
                                    </p>
                                )}
                                {receiptData.combinedBills > 0 && (
                                    <p className="text-[10px] text-emerald-700 font-bold m-0 mt-1">Each billing period below also has its own receipt.</p>
                                )}
                                {receiptData.paidFromAdvance ? (
                                    <p className="text-[10px] text-emerald-700 font-bold m-0 mt-1">Paid from advance payment {receiptData.paidFromAdvance}</p>
                                ) : receiptData.advanceMonths > 0 ? (
                                    <p className="text-[10px] text-emerald-700 font-bold m-0 mt-1">Advance payment for {receiptData.advanceMonths} month{receiptData.advanceMonths === 1 ? '' : 's'}. Each month's rent invoice is issued on its usual date and paid from it, with its own receipt.</p>
                                ) : receiptData.paidInAdvance && (
                                    <p className="text-[10px] text-emerald-700 font-bold m-0 mt-1">Paid in advance on {receiptData.date}</p>
                                )}
                            </div>
                            <div>
                                <p className="text-slate-500 text-[10px] uppercase m-0 mb-1">{t('paymentHistory.breakdown')} ({receiptData.period})</p>
                                <div className="bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed text-xs text-slate-700">{receiptData.breakdown}</div>
                            </div>
                            {receiptData.proofPath && (
                                <div className="print-hide text-xs text-slate-600 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100 flex items-center justify-between flex-wrap gap-2">
                                    <span>{t('paymentHistory.proofAttached')}</span>
                                    <a href={fileUrl(receiptData.proofPath)} target="_blank" rel="noreferrer" className="text-indigo-600 font-bold hover:underline">{t('paymentHistory.viewScreenshot')}</a>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-3 border-t-2 border-dashed border-slate-200">
                                <p className="font-bold text-slate-600 m-0 text-sm sm:text-base">{t('paymentHistory.totalPaid')}</p>
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 m-0">{formatCurrency(receiptData.amount)}</p>
                            </div>
                        </div>
                        <div className="receipt-modal-footer flex gap-2 p-3 sm:p-4 bg-slate-50 border-t border-slate-200 print-hide shrink-0">
                            <button onClick={() => printElement(receiptRef.current)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors min-h-[44px]"><FontAwesomeIcon icon={faPrint} /> {t('paymentHistory.printReceipt')}</button>
                            <button onClick={() => setReceiptInvoiceId(null)} className="flex-1 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-100 border-solid cursor-pointer transition-colors min-h-[44px]">{t('paymentHistory.close')}</button>
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
