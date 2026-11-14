import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faUniversity, faMoneyBillWave, faCheckCircle, faHistory, faExclamationTriangle, faClock, faHourglassHalf, faTimesCircle, faCalendarPlus, faCoins, faQrcode, faHome, faShieldAlt, faTint, faBolt, faCar, faConciergeBell, faWrench, faTachometerAlt, faReceipt, faLayerGroup, faArrowLeft, faArrowRight, faCheck, faLock, faChevronDown, faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { appReturnUrl, gatewayReturnParams } from '../api/env';
import { Link, useNavigate } from 'react-router-dom';
import { useLang, dateLocale } from '../config/i18n';
import SuccessModal from '../Components/SuccessModal';
import InlineAlert from '../Components/InlineAlert';
import useInvoiceWatch, { AWAITING_STATUSES, OPEN_STATUSES, PAYABLE_STATUSES } from '../hooks/useInvoiceWatch';
import { TENANT_NOTIFICATIONS_EVENT } from '../config/notificationLinks';
import { addDays, checkAmount, checkDate, localDateString } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import { daysPastDue, formatCoveredPeriod, formatDay, formatPeriodRange, isBundleKey, isPastDue } from '../utils/billingPeriod';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import SplitPaymentForm from '../Components/SplitPaymentForm';
import { checkSplit, emptyPortion } from '../utils/splitPayment';
import { invalidCls } from '../Components/form/formHelpers';

// schedule_payment.php accepts today up to 60 days ahead, morning/afternoon.
const SCHEDULE_MAX_DAYS = 60;
const TIME_SLOTS = ['morning', 'afternoon'];

import { invoiceOwed } from '../utils/invoiceBalance';
import '../assets/styles/responsive/user/pay-bills.responsive.css';
import { Bone, SkeletonGroup } from '../Components/tenant/Skeleton';

// One look for every notice on the page (awaiting, returned, overdue, combine…).
// Full class strings so Tailwind sees them; the user themes remap these shades.
const BANNER_TONES = {
    sky: { box: 'bg-sky-50 border-sky-200', icon: 'bg-sky-100 text-sky-700', title: 'text-sky-900', body: 'text-sky-800', chip: 'bg-sky-100 text-sky-800' },
    rose: { box: 'bg-rose-50 border-rose-200', icon: 'bg-rose-100 text-rose-600', title: 'text-rose-900', body: 'text-rose-700', chip: 'bg-rose-100 text-rose-700' },
    amber: { box: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-700', title: 'text-amber-900', body: 'text-amber-800', chip: 'bg-amber-100 text-amber-800' },
    emerald: { box: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-100 text-emerald-700', title: 'text-emerald-900', body: 'text-emerald-800', chip: 'bg-emerald-100 text-emerald-800' },
    indigo: { box: 'bg-indigo-50 border-indigo-200', icon: 'bg-indigo-100 text-indigo-700', title: 'text-indigo-900', body: 'text-indigo-700', chip: 'bg-indigo-100 text-indigo-800' },
    slate: { box: 'bg-slate-50 border-slate-200', icon: 'bg-slate-200 text-slate-600', title: 'text-slate-800', body: 'text-slate-600', chip: 'bg-slate-200 text-slate-700' },
};

function Banner({ tone = 'slate', icon, title, chip, children, actions }) {
    const c = BANNER_TONES[tone];
    return (
        <div className={`w-full rounded-2xl border p-4 sm:p-5 flex items-start gap-3.5 ${c.box}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.icon}`}>
                <FontAwesomeIcon icon={icon} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`text-sm sm:text-base font-bold m-0 ${c.title}`}>{title}</h4>
                    {chip && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.chip}`}>{chip}</span>}
                </div>
                {children && <div className={`text-xs sm:text-sm m-0 leading-relaxed ${c.body}`}>{children}</div>}
                {actions && <div className="flex flex-col sm:flex-row gap-2 pt-2">{actions}</div>}
            </div>
        </div>
    );
}

// Small icon for each line of the bill.
const LINE_ICONS = {
    baseRent: faHome, deposit: faShieldAlt, water: faTint, electricity: faBolt, parking: faCar,
    services: faConciergeBell, maintenance: faWrench, lateFee: faExclamationTriangle,
};

function BillLine({ icon, label, sub, amount, tone }) {
    const late = tone === 'late';
    return (
        <div className={`pay-bills-ledger-row flex items-center gap-3 py-3 ${late ? 'px-3 -mx-3 rounded-xl bg-rose-50' : ''}`}>
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm ${late ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                <FontAwesomeIcon icon={icon} aria-hidden="true" />
            </span>
            <span className={`min-w-0 flex-1 text-sm font-medium ${late ? 'text-rose-700 font-bold' : 'text-slate-700'}`}>
                {label}
                {sub && <span className="block text-xs font-normal text-slate-500">{sub}</span>}
            </span>
            <span className={`shrink-0 text-sm font-bold tabular-nums ${late ? 'text-rose-700' : 'text-slate-900'}`}>{amount}</span>
        </div>
    );
}

const PILL_LINK = 'inline-flex items-center gap-2 min-h-[40px] px-4 rounded-full bg-white border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold cursor-pointer shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors';
const BTN_SOLID_ROSE = 'min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50';
const BTN_GHOST = 'min-h-[40px] px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold cursor-pointer hover:bg-slate-50 disabled:opacity-50';

function StepTitle({ n, children, className = '' }) {
    return (
        <h3 className={`flex items-center gap-2.5 text-sm font-bold text-slate-800 m-0 ${className}`}>
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black flex items-center justify-center shrink-0">{n}</span>
            {children}
        </h3>
    );
}

export default function PayBills() {
    const navigate = useNavigate();
    const { t } = useLang();
    // t() with bold values inside: `strong` values are wrapped in <strong>, `plain` ones are text.
    const rich = (key, strong = {}, plain = {}) => {
        const marked = Object.fromEntries(Object.keys(strong).map((name) => [name, `\uE000${name}\uE001`]));
        return t(key, { ...plain, ...marked }).split(/\uE000(\w+)\uE001/).map((part, i) => (i % 2 ? <strong key={i}>{strong[part]}</strong> : part));
    };
    const [selectedMethod, setSelectedMethod] = useState('');
    const [methodMenuOpen, setMethodMenuOpen] = useState(false);
    const methodMenuRef = useRef(null);
    const [paymentChannels, setPaymentChannels] = useState([]);
    const [channelsLoading, setChannelsLoading] = useState(true);
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTimeSlot, setScheduledTimeSlot] = useState('morning');

    // Confirmation modal: shown after the tenant submits a payment, and again
    // when management's decision arrives (useInvoiceWatch polls for it).
    // Back from a PayMongo checkout: the invoice stays 'processing' until the
    // webhook lands; useInvoiceWatch keeps polling and shows "Payment confirmed" then.
    const [notice, setNotice] = useState(() => (
        gatewayReturnParams().get('status') === 'success'
            ? {
                kind: 'sent',
                message: t('payBills.sentTitle'),
                subtext: t('payBills.sentBody'),
            }
            : null
    ));

    // Inline messages that used to be alert(): a failed payment (next to the
    // pay button), a failed combine/advance action (next to those controls), and
    // the result of a cancelled gateway checkout (top of the page).
    const [payError, setPayError] = useState('');
    const [actionError, setActionError] = useState('');   // combine / split bills
    const [advanceError, setAdvanceError] = useState(''); // pay in advance
    const [gatewayMessage, setGatewayMessage] = useState('');
    const [confirmCancelAdvance, setConfirmCancelAdvance] = useState(false);

    const confirmedNotice = (paidInvoices) => {
        const first = paidInvoices[0];
        const total = paidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total_amount) || 0), 0);
        const amount = `₱${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        return {
            message: t('paymentHistory.confirmedTitle'),
            subtext: paidInvoices.length === 1
                ? t('payBills.confirmedOne', { amount, period: first.billing_period || t('paymentHistory.invoiceNo', { id: first.id }) })
                : t('payBills.confirmedMany', { count: paidInvoices.length, amount }),
            action: { label: t('paymentHistory.viewReceipt'), onClick: () => navigate('/payment-history', { state: { receiptId: first.id } }) },
        };
    };

    // The webhook can land before the first fetch: then no transition is ever
    // seen and "Payment sent" never cleared (audit N-10b). Settle the notice
    // from the returned invoice's state on that first fetch instead.
    const [gatewayKey] = useState(() => (
        gatewayReturnParams().get('status') === 'success' ? gatewayReturnParams().get('invoice_id') : null
    ));
    const handleFirstLoad = (list) => {
        if (!gatewayKey) return;
        const covered = list.filter(i => i.id === gatewayKey || i.payment_group === gatewayKey);
        if (covered.length === 0) return;
        if (covered.every(i => i.status === 'paid')) setNotice(confirmedNotice(covered));
        // Declined: the bill's own banner explains it.
        else if (covered.some(i => i.status === 'payment-failed')) setNotice(null);
    };

    const handleTransitions = (events) => {
        const confirmed = events.filter(e => e.type === 'confirmed');
        if (confirmed.length > 0) setNotice(confirmedNotice(confirmed.map(e => e.invoice)));
        // A declined checkout: drop "Payment sent"; the bill's banner says why.
        else if (events.some(e => e.type === 'failed')) setNotice(prev => (prev?.kind === 'sent' ? null : prev));
        // A rejection or a declined checkout shows as a banner on the bill itself.
        // A settled advance turns into prepaid-month credits on the advance card.
        if (events.some(e => e.invoice?.advance_months)) loadAdvance();
    };

    const { invoices, loaded, loadError, refresh } = useInvoiceWatch({ onTransition: handleTransitions, onFirstLoad: handleFirstLoad });

    // The bill on screen: the earliest-due invoice the tenant still has to pay;
    // failing that, the earliest one awaiting confirmation (shown read-only).
    // A grouped payment (advance-rent invoice, legacy advance group, or a
    // combined payment of overdue bills) is paid as a whole, never shown as the
    // bill on screen.
    const byDueDate = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''));
    const isCancelledApp = (i) => ['cancelled', 'rejected', 'declined', 'moved-out', 'archived'].includes(String(i?.application_status || '').toLowerCase());
    const isGrouped = (i) => !!(i.payment_group || i.advance_months);
    // What is still owed on an open bill: its balance after any parts already received.
    const owed = invoiceOwed;
    const payableInvoices = invoices.filter(i => PAYABLE_STATUSES.includes(i.status) && !isGrouped(i) && !isCancelledApp(i)).sort(byDueDate);
    const awaitingInvoices = invoices.filter(i => AWAITING_STATUSES.includes(i.status) && !isCancelledApp(i)).sort(byDueDate);
    const hasCancelledApp = invoices.length > 0 && invoices.every(isCancelledApp);
    // One "awaiting" banner per payment: a group's bills together.
    const awaitingEntries = Object.values(awaitingInvoices.reduce((acc, inv) => {
        const key = inv.payment_group || inv.id;
        if (!acc[key]) {
            acc[key] = { ...inv, id: key, months: [inv.billing_period], owed: inv.proof_amount ?? owed(inv) };
        } else {
            acc[key].total_amount = (parseFloat(acc[key].total_amount) || 0) + (parseFloat(inv.total_amount) || 0);
            acc[key].owed += owed(inv);
            acc[key].months.push(inv.billing_period);
        }
        return acc;
    }, {})).map(e => (e.payment_group
        ? { ...e, billing_period: t(isBundleKey(e.payment_group) ? 'payBills.combinedPrefix' : 'payBills.advancePrefix', { months: e.months.join(', ') }) }
        : e));
    const activeInv = payableInvoices[0] || awaitingInvoices.find(i => !isGrouped(i)) || null;

    {/*Billing breakdown parameters mirroring system metrics*/}
    const billDetails = {
        baseRent: parseFloat(activeInv?.base_rent) || 0,
        water: parseFloat(activeInv?.water) || 0,
        electricity: parseFloat(activeInv?.electricity) || 0,
        parking: parseFloat(activeInv?.parking) || 0,
        services: parseFloat(activeInv?.services) || 0,
        maintenance: parseFloat(activeInv?.maintenance) || 0,
        securityDeposit: parseFloat(activeInv?.security_deposit) || 0,
        lateFee: parseFloat(activeInv?.late_fee) || 0,
        invoiceId: activeInv?.id || null,
        dueDate: activeInv?.due_date || '',
        billingPeriod: activeInv?.billing_period || '',
        coveredPeriod: formatCoveredPeriod(activeInv),
        status: activeInv?.status || '',
        rejectionReason: activeInv?.proof_rejection_reason || '',
        scheduledDate: activeInv?.scheduled_date || '',
        scheduledTimeSlot: activeInv?.scheduled_time_slot || '',
    };
    const isAwaiting = AWAITING_STATUSES.includes(billDetails.status);
    const fmtMoney = (n) => `₱${(parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    // ── Advance payment (advance_payment.php) ──
    // The tenant pays one advance-rent invoice for N upcoming months. Each
    // month is credited; its rent invoice is still issued on the usual date
    // and paid from the credit, with its own receipt. Older advances were a
    // payment_group 'ADV-…' of invoices billed at once; those still show here.
    const [advance, setAdvance] = useState(null); // preview: { available, months[], monthly_rent, lease_end, pending, credits[] }
    const [advanceCount, setAdvanceCount] = useState(1);
    const [advanceBusy, setAdvanceBusy] = useState(false);
    const [payingAdvance, setPayingAdvance] = useState(false);

    const loadAdvance = async () => {
        try {
            const res = await api.get('/advance_payment.php');
            if (res.data.success) setAdvance(res.data);
        } catch (err) {
            console.error('Failed to load advance payment options:', err);
        }
    };

    // The open advance payment, from the watched invoices so its status stays
    // live: { key, months: [{ key, label, sub, amount }], total, payable, cancelBody }.
    const openAdvance = (() => {
        const inv = invoices.filter(i => i.advance_months && OPEN_STATUSES.includes(i.status) && !isCancelledApp(i)).sort(byDueDate)[0];
        if (inv) {
            const pending = advance?.pending?.id === inv.id ? advance.pending.months : [];
            return {
                key: inv.id,
                months: pending.map(m => ({ key: m.period_start, label: m.billing_period, sub: t('payBills.advanceStarts', { date: formatDay(m.period_start) }), amount: m.amount })),
                total: parseFloat(inv.total_amount) || 0,
                payable: PAYABLE_STATUSES.includes(inv.status),
                cancelBody: { action: 'cancel', invoice: inv.id },
            };
        }
        const group = invoices.filter(i => i.payment_group && !isBundleKey(i.payment_group) && OPEN_STATUSES.includes(i.status) && !isCancelledApp(i)).sort(byDueDate);
        const key = group[0]?.payment_group;
        if (!key) return null;
        const rows = group.filter(i => i.payment_group === key);
        return {
            key,
            months: rows.map(i => ({ key: i.id, label: i.billing_period, sub: t('payBills.dueIdSub', { date: i.due_date, id: i.id }), amount: i.total_amount })),
            total: rows.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0),
            payable: rows.every(i => PAYABLE_STATUSES.includes(i.status)),
            cancelBody: { action: 'cancel', group: key },
        };
    })();
    const advanceMonthsText = openAdvance ? openAdvance.months.map(m => m.label).join(', ') : '';
    // Prepaid months still waiting for their month (paid automatically when billed).

    // ── Combined payment of overdue bills (bundle_payment.php) ──
    // With two or more unpaid bills, at least one overdue, the tenant pays them
    // all together, overdue and current (one 'BND-…' key; each bill still gets
    // its own receipt, plus one combined receipt), or one at a time, earliest first.
    // "Oct 4 – Nov 3, 2026 · 8 days overdue" for a past-due bill, "Due Oct 15, 2026" otherwise.
    const billStatusText = (i) => (isPastDue(i)
        ? t(daysPastDue(i) === 1 ? 'payBills.periodOverdueOne' : 'payBills.periodOverdueMany', { period: formatCoveredPeriod(i), count: daysPastDue(i) })
        : t('payBills.dueOnDay', { date: formatDay(i.due_date) }));
    const [bundleBusy, setBundleBusy] = useState(false);
    const [bundleView, setBundleView] = useState(true);   // show an open bundle in the ledger
    const [bundleChoiceHidden, setBundleChoiceHidden] = useState(false);
    const openBundle = (() => {
        const rows = invoices.filter(i => isBundleKey(i.payment_group) && OPEN_STATUSES.includes(i.status) && !isCancelledApp(i)).sort(byDueDate);
        const key = rows[0]?.payment_group;
        if (!key) return null;
        const mine = rows.filter(i => i.payment_group === key);
        return {
            key,
            months: mine.map(i => ({ key: i.id, label: i.billing_period, sub: `${billStatusText(i)} · ${i.id}`, amount: owed(i) })),
            total: mine.reduce((s, i) => s + owed(i), 0),
            payable: mine.every(i => PAYABLE_STATUSES.includes(i.status)),
        };
    })();
    // Bills that can be combined: unpaid with nothing submitted yet (matches
    // bundle_candidates() in config.php).
    const unpaidSingles = payableInvoices.filter(i => ['pending', 'unpaid', 'overdue', 'payment-failed'].includes(i.status));
    const overdueCount = unpaidSingles.filter(isPastDue).length;
    const canBundle = !openBundle && unpaidSingles.length >= 2 && overdueCount > 0;

    const handleCreateBundle = async () => {
        if (bundleBusy) return;
        setActionError('');
        setBundleBusy(true);
        try {
            const res = await api.post('/bundle_payment.php', { action: 'create' });
            if (res.data.success) {
                await refresh();
                setBundleView(true);
                setPayingAdvance(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                setActionError(res.data.message || t('payBills.errCombine'));
            }
        } catch (err) {
            setActionError(apiErrorMessage(err, t('payBills.errCombine')));
        } finally {
            setBundleBusy(false);
        }
    };

    const handleReleaseBundle = async () => {
        if (!openBundle || bundleBusy) return;
        setActionError('');
        setBundleBusy(true);
        try {
            const res = await api.post('/bundle_payment.php', { action: 'release', key: openBundle.key });
            if (res.data.success) {
                setBundleChoiceHidden(true);
                await refresh();
            } else {
                setActionError(res.data.message || t('payBills.errSplitBundle'));
            }
        } catch (err) {
            setActionError(apiErrorMessage(err, t('payBills.errSplitBundle')));
        } finally {
            setBundleBusy(false);
        }
    };

    // The group the payment panel pays, if any: the combined payment (shown by
    // default while open), or the advance payment when the tenant chose it.
    const activeGroup = (payingAdvance && openAdvance?.payable)
        ? { ...openAdvance, kind: 'advance' }
        : (bundleView && openBundle?.payable) ? { ...openBundle, kind: 'bundle' } : null;
    const payingGroup = !!activeGroup;
    const groupWord = activeGroup?.kind === 'bundle' ? t('payBills.combinedPayment') : t('payBills.advancePayment');

    // What the payment panel pays: the chosen group, otherwise the bill on screen.
    const payKey = payingGroup ? activeGroup.key : billDetails.invoiceId;
    const payLabel = payingGroup
        ? `${groupWord.toLowerCase()} (${activeGroup.months.map(m => m.label).join(', ')})`
        : (billDetails.billingPeriod || t('payBills.thisBill'));

    const handleCreateAdvance = async () => {
        if (advanceBusy) return;
        setAdvanceError('');
        setAdvanceBusy(true);
        try {
            const res = await api.post('/advance_payment.php', { action: 'create', months: advanceCount });
            if (res.data.success) {
                await Promise.all([refresh(), loadAdvance()]);
                setPayingAdvance(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                setAdvanceError(res.data.message || t('payBills.errPrepareAdvance'));
            }
        } catch (err) {
            setAdvanceError(apiErrorMessage(err, t('payBills.errPrepareAdvance')));
        } finally {
            setAdvanceBusy(false);
        }
    };

    // Asked in place on the advance card (was window.confirm).
    const handleCancelAdvance = async () => {
        if (!openAdvance || advanceBusy) return;
        setAdvanceError('');
        setAdvanceBusy(true);
        try {
            const res = await api.post('/advance_payment.php', openAdvance.cancelBody);
            if (res.data.success) {
                setPayingAdvance(false);
                setConfirmCancelAdvance(false);
                await Promise.all([refresh(), loadAdvance()]);
            } else {
                setAdvanceError(res.data.message || t('payBills.errCancelAdvance'));
            }
        } catch (err) {
            setAdvanceError(apiErrorMessage(err, t('payBills.errCancelAdvance')));
        } finally {
            setAdvanceBusy(false);
        }
    };

    const dueStatus = (() => {
        if (!billDetails.dueDate) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const parts = billDetails.dueDate.split('-');
        const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        due.setHours(0, 0, 0, 0);
        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return {
            diffDays,
            isOverdue: diffDays < 0 || billDetails.status === 'overdue',
            isDueToday: diffDays === 0,
            isDueSoon: diffDays > 0 && diffDays <= 3,
            formattedDate: due.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
        };
    })();

    useEffect(() => {
        const fetchChannels = async () => {
            setChannelsLoading(true);
            try {
                const res = await api.get('/get_payment_channels.php');
                if (res.data.success && res.data.channels) {
                    const mapped = res.data.channels.map(ch => {
                        let icon, color;
                        if (ch.icon === 'gcash') { icon = faWallet; color = 'text-blue-600'; }
                        else if (ch.icon === 'bank') { icon = faUniversity; color = 'text-indigo-600'; }
                        else if (ch.icon === 'qr') { icon = faQrcode; color = 'text-indigo-600'; }
                        else if (ch.icon === 'maya') { icon = faWallet; color = 'text-emerald-500'; }
                        else { icon = faMoneyBillWave; color = 'text-emerald-600'; }
                        
                        return { ...ch, icon, color, isGcash: ch.icon === 'gcash', isQr: ch.icon === 'qr' };
                    });
                    // Splitting a bill across methods rests on manual proofs, so it is
                    // offered with them, after the other methods.
                    if (mapped.some(ch => ch.family === 'manual')) {
                        mapped.push({ id: 'split', label: 'Split payment', family: 'split', icon: faCoins, color: 'text-amber-600' });
                    }
                    setPaymentChannels(mapped);
                    if (mapped.length > 0) {
                        setSelectedMethod(mapped[0].id);
                    } else {
                        setSelectedMethod('');
                    }
                } else {
                    setPaymentChannels([]);
                    setSelectedMethod('');
                }
            } catch (error) {
                console.error("Failed to fetch payment channels:", error);
                setPaymentChannels([]);
                setSelectedMethod('');
            } finally {
                setChannelsLoading(false);
            }
        };
        fetchChannels();
        const loadAdvanceOnMount = async () => { await loadAdvance(); };
        loadAdvanceOnMount();

        // Back from the gateway: /pay-bills?status=...&invoice_id=...
        const queryParams = gatewayReturnParams();
        if (queryParams.has('status')) {
            const status = queryParams.get('status');
            if (status === 'success') {
                // The "Payment sent" notice is set from the URL on first render.
                navigate('/pay-bills', { replace: true });
            } else if (status === 'cancelled') {
                // Hand the invoice back to 'pending'/'overdue'. Without this it
                // stays in 'processing' and becomes unpayable.
                const invoiceId = queryParams.get('invoice_id');
                (async () => {
                    // The endpoint only releases the caller's own bill, and only while it
                    // is in 'processing'. Anything else (a typed URL, a second cancel, a
                    // webhook that already settled it) releases nothing: say nothing then.
                    let outcome = 'none';
                    if (invoiceId) {
                        try {
                            const res = await api.post('/release_checkout_session.php', { invoice_id: invoiceId });
                            if (res.data?.released) outcome = 'released';
                        } catch (err) {
                            console.error('Failed to release the cancelled payment session:', err);
                            outcome = 'failed';
                        }
                    }
                    if (outcome !== 'none') setGatewayMessage(outcome === 'released'
                        ? t('payBills.cancelledReopened')
                        : t('payBills.cancelledNotReopened'));
                    navigate('/pay-bills', { replace: true });
                    refresh();
                })();
            }
        }
    }, [navigate, refresh, t]);

    const totalAmount = billDetails.baseRent + billDetails.water + billDetails.electricity + billDetails.parking + billDetails.services + billDetails.maintenance + billDetails.securityDeposit + billDetails.lateFee;
    // Installments: parts already received on this bill, and what is left.
    const paidSoFar = parseFloat(activeInv?.amount_paid) || 0;
    const balanceDue = activeInv ? invoiceOwed(activeInv) : Math.max(0, Math.round((totalAmount - paidSoFar) * 100) / 100);
    // The part the tenant pays now ('' = the whole balance). Single bills only.
    const [partAmount, setPartAmount] = useState('');
    const [partCapped, setPartCapped] = useState(false); // the last entry was over the balance
    const partError = partAmount === '' ? '' : checkAmount(partAmount, { label: t('validation.amount'), min: 0.01, max: balanceDue, allowZero: false });

    const currentMethodObj = paymentChannels.find(m => m.id === selectedMethod) || paymentChannels[0] || {};
    useEffect(() => {
        if (!methodMenuOpen) return undefined;
        const closeOnOutsidePointer = (event) => {
            if (!methodMenuRef.current?.contains(event.target)) setMethodMenuOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setMethodMenuOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [methodMenuOpen]);

    const handleMethodSelect = (methodId) => {
        setSelectedMethod(methodId);
        setMethodMenuOpen(false);
        setSplitAttempted(false);
        setPayError('');
        payForm.setErrors({});
    };

    // Split payment: the portions being entered, and whether a submit was tried
    // (errors show only then).
    const [splitParts, setSplitParts] = useState(() => [emptyPortion('cash'), emptyPortion('gcash')]);
    const [splitAttempted, setSplitAttempted] = useState(false);
    const splitTotal = payingGroup ? (parseFloat(activeGroup.total) || 0) : (partAmount !== '' && !partError ? Number(partAmount) : balanceDue);
    const [isPaying, setIsPaying] = useState(false);

    // Only the fields of the chosen method are checked. Manual methods (QR Ph,
    // GCash, bank) take the reference and receipt on the next page.
    const family = currentMethodObj.family;
    const payForm = useFieldErrors(
        family === 'in_person' ? {
            scheduled_date: (v) => checkDate(v, { min: localDateString(), max: addDays(SCHEDULE_MAX_DAYS), label: t('payBills.scheduleDateLabel') }),
            scheduled_time_slot: (v) => (TIME_SLOTS.includes(v) ? '' : t('payBills.errTimeSlot')),
        } : {},
        { idPrefix: 'pay-' }
    );
    const payValues = { scheduled_date: scheduledDate, scheduled_time_slot: scheduledTimeSlot };

    const handlePaymentExecution = async (e) => {
        e.preventDefault();
        if (isPaying) return;
        setPayError('');
        setIsPaying(true);
        try {
            await executePayment();
        } finally {
            setIsPaying(false);
        }
    };

    const executePayment = async () => {
        if (!payKey) {
            setPayError(t('payBills.errNoInvoice'));
            return;
        }
        if (!payingGroup && isAwaiting) {
            setPayError(t('payBills.errAwaiting'));
            return;
        }

        if (currentMethodObj.family === 'in_person') {
            if (!payForm.validateAll(payValues)) return;
            try {
                const res = await api.post("/schedule_payment.php", {
                    invoice_id: payKey,
                    scheduled_date: scheduledDate,
                    scheduled_time_slot: scheduledTimeSlot
                });
                if (res.data.success) {
                    // Bell and invoice watch both refetch; the bell starts polling faster.
                    window.dispatchEvent(new CustomEvent(TENANT_NOTIFICATIONS_EVENT));
                    setNotice({
                        message: payingGroup ? t('payBills.groupScheduled', { group: groupWord }) : t('payBills.paymentScheduled'),
                        subtext: t('payBills.scheduledBody', { date: scheduledDate, slot: t(`payBills.slot.${scheduledTimeSlot}`) }),
                    });
                } else if (!payForm.applyServerErrors(res)) {
                    setPayError(res.data.message);
                }
            } catch (error) {
                console.error(error);
                if (!payForm.applyServerErrors(error)) setPayError(apiErrorMessage(error, t('payBills.errSchedule')));
            }
            return;
        }

        if (currentMethodObj.family === 'split') {
            setSplitAttempted(true);
            if (partError) return;
            if (!checkSplit(splitParts, splitTotal, scheduledDate).valid) return;
            const formData = new FormData();
            formData.append('invoice_id', payKey);
            if (!payingGroup && partAmount !== '') formData.append('amount', String(Number(partAmount)));
            if (splitParts.some(p => p.method === 'cash')) {
                formData.append('scheduled_date', scheduledDate);
                formData.append('scheduled_time_slot', scheduledTimeSlot);
            }
            formData.append('parts', JSON.stringify(splitParts.map(p => ({
                method: p.method,
                amount: Number(p.amount),
                bank_name: p.method === 'bank_transfer' ? p.bank_name : undefined,
                reference_number: p.method === 'cash' ? undefined : p.reference_number.trim(),
            }))));
            splitParts.forEach((p, i) => { if (p.method !== 'cash') formData.append(`proof_${i}`, p.proof); });
            const hadCash = splitParts.some(p => p.method === 'cash');
            try {
                const res = await api.post('/submit_split_payment.php', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                if (res.data.success) {
                    setSplitParts([emptyPortion('cash'), emptyPortion('gcash')]);
                    setScheduledDate('');
                    setSplitAttempted(false);
                    window.dispatchEvent(new CustomEvent(TENANT_NOTIFICATIONS_EVENT));
                    setNotice({
                        message: payingGroup ? t('payBills.groupSubmitted', { group: groupWord }) : t('payBills.paymentSubmitted'),
                        subtext: `${t('payBills.splitAwaiting', { label: payLabel })}${hadCash ? ` ${t('payBills.splitCash', { date: scheduledDate, slot: t(`payBills.slot.${scheduledTimeSlot}`) })}` : ''} ${t('payBills.splitTail')}`,
                    });
                } else {
                    setPayError(res.data.message);
                }
            } catch (error) {
                console.error('Error submitting split payment:', error);
                setPayError(apiErrorMessage(error, t('payBills.errSplit')));
            }
            return;
        }

        if (currentMethodObj.family === 'sandbox') {
            try {
                const res = await api.post("/create_checkout_session.php", {
                    invoice_id: payKey,
                    channel: currentMethodObj.id,
                    success_url: appReturnUrl('pay-bills', { status: 'success', invoice_id: payKey }),
                    cancel_url: appReturnUrl('pay-bills', { status: 'cancelled', invoice_id: payKey })
                });
                
                if (res.data.success && res.data.checkout_url) {
                    window.location.assign(res.data.checkout_url);
                } else {
                    setPayError(res.data.message || t('payBills.errCheckout'));
                }
            } catch (error) {
                console.error("Error creating checkout session:", error);
                setPayError(apiErrorMessage(error, t('payBills.errGateway')));
            }
            return;
        }

        // Manual (QR Ph / GCash / bank): the account details, the reference and
        // the receipt are on their own page (PaymentUpload), as from Track
        // Application. upload_payment_proof.php takes the part amount and a
        // combined or advance payment's key as they were sent from here.
        if (partError) return;
        const part = !payingGroup && partAmount !== '' ? Number(partAmount) : null;
        navigate('/upload-payment', {
            state: {
                invoiceId: payKey,
                amount: part ?? (payingGroup ? (parseFloat(activeGroup.total) || 0) : balanceDue),
                partAmount: part,
                paymentMethod: currentMethodObj.label,
                billLabel: payLabel,
                returnUrl: '/pay-bills',
            },
        });
    };

    // The statement and payment form only when there is something to pay (was a
    // ₱0.00 statement and a disabled form when the tenant was paid up).
    const showWorkspace = loaded && (payingGroup || !!activeInv);

    return (
        <div className="pay-bills-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-8 lg:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-6xl lg:max-w-[1400px] space-y-5 sm:space-y-6 flex flex-col justify-start text-left">

                {/* Named after the bill on screen, not today's month: an overdue bill is from an earlier one. */}
                <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 pb-2">
                    <div className="min-w-0">
                        <Link
                            to="/my-room"
                            className="group mb-2 -ml-0.5 inline-flex min-h-[44px] items-center gap-1.5 py-1 text-sm font-medium text-slate-500 no-underline transition-colors hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        >
                            <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                            <span>{t('common.backToMyRoom')}</span>
                        </Link>
                        <h1 className="pay-bills-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none text-slate-900">
                            {payingGroup ? groupWord : t('payBills.heading')}
                        </h1>
                        <p className="pay-bills-subtext text-slate-500 text-sm sm:text-base mt-1.5 m-0">
                            {t('payBills.subtext')}
                        </p>
                    </div>
                    <nav className="flex flex-wrap gap-2 shrink-0" aria-label={t('payBills.billingLinks')}>
                        <button type="button" onClick={() => navigate('/user-utilities')} className={PILL_LINK}>
                            <FontAwesomeIcon icon={faTachometerAlt} className="text-indigo-500" aria-hidden="true" />
                            <span>{t('payBills.meterReadings')}</span>
                        </button>
                        <button type="button" onClick={() => navigate('/payment-history')} className={PILL_LINK}>
                            <FontAwesomeIcon icon={faHistory} className="text-indigo-500" aria-hidden="true" />
                            <span>{t('payBills.viewPrevious')}</span>
                        </button>
                    </nav>
                </header>

                <InlineAlert tone="info" onDismiss={() => setGatewayMessage('')}>{gatewayMessage}</InlineAlert>

                {/* Payments awaiting management's (or the gateway's) confirmation */}
                {awaitingEntries.map(inv => (
                    <Banner
                        key={inv.id}
                        tone="sky"
                        icon={faHourglassHalf}
                        chip={inv.billing_period || inv.id}
                        title={inv.status === 'scheduled' ? t('payBills.awaitScheduledTitle')
                            : inv.status === 'processing' ? t('payBills.awaitProcessingTitle')
                            : t('payBills.awaitVerifyTitle')}
                    >
                        {inv.status === 'scheduled'
                            ? rich('payBills.awaitScheduledBody', { amount: fmtMoney(inv.owed), date: inv.scheduled_date }, { slot: inv.scheduled_time_slot ? ` (${t(`payBills.slot.${inv.scheduled_time_slot}`)})` : '' })
                            : inv.status === 'processing'
                            ? rich('payBills.awaitProcessingBody', { amount: fmtMoney(inv.owed) })
                            : rich('payBills.awaitVerifyBody', { amount: fmtMoney(inv.owed) }, { method: inv.payment_method || '', ref: inv.payment_reference ? ` (${t('paymentHistory.refShort')} ${inv.payment_reference})` : '' })}
                    </Banner>
                ))}

                {/* Management sent the proof back, or the online checkout was declined */}
                {!isAwaiting && billDetails.rejectionReason && (
                    <Banner tone="rose" icon={faTimesCircle} title={t('payBills.proofRejectedTitle')}>
                        {rich('payBills.proofRejectedBody', { reason: billDetails.rejectionReason }, { period: billDetails.billingPeriod || t('payBills.thisBill') })}
                    </Banner>
                )}
                {billDetails.status === 'payment-failed' && (
                    <Banner tone="rose" icon={faTimesCircle} title={t('payBills.onlineFailedTitle')}>
                        {t('payBills.onlineFailedBody')}
                    </Banner>
                )}

                {loaded && !activeInv && !openBundle && (
                    loadError && invoices.length === 0 ? (
                        // The fetch failed: say so rather than "all paid up".
                        <InlineAlert>
                            {t('common.loadFailed')}{' '}
                            <button type="button" onClick={refresh} className="ml-1 min-h-[36px] px-3 rounded-lg bg-white border border-rose-300 text-rose-800 text-sm font-bold cursor-pointer hover:bg-rose-100 transition-colors">
                                {t('common.retry')}
                            </button>
                        </InlineAlert>
                    ) : hasCancelledApp ? (
                        <Banner tone="slate" icon={faTimesCircle} title={t('payBills.appCancelledTitle')}>
                            {t('payBills.appCancelledBody')}
                        </Banner>
                    ) : (
                        <div className="w-full rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-10 sm:py-12 flex flex-col items-center text-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl">
                                <FontAwesomeIcon icon={faCheckCircle} aria-hidden="true" />
                            </div>
                            <h2 className="text-xl sm:text-2xl font-extrabold text-emerald-900 m-0">{t('payBills.paidUpTitle')}</h2>
                            <p className="text-sm text-emerald-800 m-0 max-w-md leading-relaxed">
                                {t('payBills.paidUpBody')}
                            </p>
                            <button type="button" onClick={() => navigate('/payment-history')} className={`${PILL_LINK} mt-1`}>
                                <FontAwesomeIcon icon={faReceipt} className="text-emerald-600" aria-hidden="true" />
                                <span>{t('payBills.viewPrevious')}</span>
                            </button>
                        </div>
                    )
                )}

                {/* Overdue / due today (not while a payment awaits confirmation, and not under the
                    unpaid-bills, returned-proof or declined-payment banner: one lead banner at a time). "Due soon" is
                    the chip on the bill card instead of a banner of its own. */}
                {dueStatus && !isAwaiting && !payingGroup && !(canBundle && !bundleChoiceHidden) && !billDetails.rejectionReason && billDetails.status !== 'payment-failed' && (
                    dueStatus.isOverdue ? (
                        <Banner
                            tone="rose"
                            icon={faExclamationTriangle}
                            title={t('payBills.overdueTitle')}
                            chip={dueStatus.diffDays < 0 ? t(Math.abs(dueStatus.diffDays) === 1 ? 'payBills.pastDueChipOne' : 'payBills.pastDueChipMany', { count: Math.abs(dueStatus.diffDays) }) : null}
                        >
                            {rich('payBills.overdueBody', { amount: fmtMoney(balanceDue), period: billDetails.coveredPeriod })}
                        </Banner>
                    ) : dueStatus.isDueToday ? (
                        <Banner tone="amber" icon={faClock} title={t('payBills.dueTodayTitle')}>
                            {rich('payBills.dueTodayBody', { amount: fmtMoney(balanceDue), date: dueStatus.formattedDate }, { period: billDetails.billingPeriod })}
                        </Banner>
                    ) : null
                )}

                {/* Overdue plus other unpaid bills: pay them all together, or one at a time. */}
                {canBundle && !bundleChoiceHidden && !payingGroup && (
                    <Banner
                        tone="rose"
                        icon={faLayerGroup}
                        title={t('payBills.unpaidBillsTitle', { count: unpaidSingles.length, overdue: overdueCount })}
                        chip={fmtMoney(unpaidSingles.reduce((s, i) => s + owed(i), 0))}
                        actions={<>
                            <button type="button" onClick={handleCreateBundle} disabled={bundleBusy} className={BTN_SOLID_ROSE}>
                                {bundleBusy ? t('payBills.preparing') : t('payBills.payAllTogether')}
                            </button>
                            <button type="button" onClick={() => setBundleChoiceHidden(true)} className={BTN_GHOST}>
                                {t('payBills.payOneAtATime')}
                            </button>
                        </>}
                    >
                        <p className="m-0">{t('payBills.bundleHint')}</p>
                        <ul className="pl-0 mt-2 list-none rounded-xl bg-white border border-rose-100 divide-y divide-slate-100">
                            {unpaidSingles.map(i => (
                                <li key={i.id} className="flex justify-between gap-3 px-3 py-2 text-xs sm:text-sm text-slate-600">
                                    <span>{i.billing_period} <span className={isPastDue(i) ? 'text-rose-600' : 'text-slate-500'}>({billStatusText(i)})</span></span>
                                    <span className="font-bold text-slate-800 shrink-0 tabular-nums">{fmtMoney(owed(i))}</span>
                                </li>
                            ))}
                        </ul>
                    </Banner>
                )}

                {/* An open combined payment the tenant stepped away from. */}
                {openBundle?.payable && !payingGroup && (
                    <Banner
                        tone="rose"
                        icon={faLayerGroup}
                        title={t('payBills.bundleReadyTitle')}
                        chip={fmtMoney(openBundle.total)}
                        actions={<>
                            <button type="button" onClick={() => { setPayingAdvance(false); setBundleView(true); }} className={BTN_SOLID_ROSE}>
                                {t('payBills.payAll')}
                            </button>
                            <button type="button" onClick={handleReleaseBundle} disabled={bundleBusy} className={BTN_GHOST}>
                                {t('payBills.paySeparately')}
                            </button>
                        </>}
                    >
                        {openBundle.months.map(m => m.label).join(', ')}
                    </Banner>
                )}

                {/* A combine / split-bills action that failed (its buttons are just above, or in the ledger). */}
                <InlineAlert onDismiss={() => setActionError('')}>{actionError}</InlineAlert>

                {/* Still loading: placeholders instead of a ₱0.00 statement. */}
                {!loaded && (
                    <SkeletonGroup label={t('common.loading')} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 overflow-hidden">
                            <div className="p-6 sm:p-8 space-y-3 bg-slate-50/70"><Bone className="h-3 w-40" /><Bone className="h-10 w-48" /><Bone className="h-3 w-56" /></div>
                            <div className="p-6 sm:p-8 space-y-4">
                                {[0, 1, 2].map((i) => <div key={i} className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><Bone className="h-9 w-9 rounded-xl" /><Bone className="h-4 w-32" /></div><Bone className="h-4 w-20" /></div>)}
                                <Bone className="h-14 w-full rounded-2xl" />
                            </div>
                        </div>
                        <div className="lg:col-span-5 rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 space-y-5">
                            <div className="flex items-center gap-3"><Bone className="h-10 w-10 rounded-xl" /><Bone className="h-5 w-40" /></div>
                            <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Bone key={i} className="h-16 rounded-2xl" />)}</div>
                            <Bone className="h-14 w-full rounded-2xl" />
                        </div>
                    </SkeletonGroup>
                )}

                {/*Main Workspace: the bill (left) and how to pay it (right)*/}
                <div className="stagger-children grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[auto_1fr] gap-6 items-start">
                    {showWorkspace && (<>

                    {/*Left Grid Parameter Block: Billing Items Statement Breakdown Ledger*/}
                    {payingGroup ? (
                    <section className={`pay-bills-bill lg:col-start-1 lg:col-span-7 lg:row-start-1 bg-white rounded-3xl border shadow-sm overflow-hidden ${activeGroup.kind === 'bundle' ? 'border-rose-200' : 'border-indigo-200'}`}>
                        <div className={`px-5 sm:px-7 pt-5 sm:pt-7 pb-5 border-b border-slate-100 ${activeGroup.kind === 'bundle' ? 'bg-rose-50/60' : 'bg-indigo-50/60'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 m-0">{groupWord}</p>
                                    <p className="pay-bills-total-due text-3xl sm:text-4xl font-black text-slate-900 m-0 mt-1 tabular-nums">{fmtMoney(activeGroup.total)}</p>
                                </div>
                                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${activeGroup.kind === 'bundle' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                    {t(activeGroup.kind === 'bundle'
                                        ? (activeGroup.months.length === 1 ? 'payBills.billsCountOne' : 'payBills.billsCountMany')
                                        : (activeGroup.months.length === 1 ? 'payBills.monthsCountOne' : 'payBills.monthsCountMany'), { count: activeGroup.months.length })}
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-600 m-0 mt-3 leading-relaxed">
                                {activeGroup.kind === 'bundle'
                                    ? t('payBills.groupBundleNote', { count: activeGroup.months.length })
                                    : t(activeGroup.months.length === 1 ? 'payBills.groupAdvanceNoteOne' : 'payBills.groupAdvanceNoteMany', { count: activeGroup.months.length })}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {(activeGroup.kind === 'advance' || activeInv) && (
                                    <button
                                        type="button"
                                        onClick={() => (activeGroup.kind === 'advance' ? setPayingAdvance(false) : setBundleView(false))}
                                        className={PILL_LINK}
                                    >
                                        <FontAwesomeIcon icon={faArrowLeft} className="text-indigo-500" aria-hidden="true" />
                                        {t('payBills.backToCurrent')}
                                    </button>
                                )}
                                {activeGroup.kind === 'bundle' && (
                                    <button type="button" onClick={handleReleaseBundle} disabled={bundleBusy} className={`${PILL_LINK} text-rose-600 disabled:opacity-50`}>
                                        {t('payBills.paySeparatelyInstead')}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="px-5 sm:px-7 py-2 divide-y divide-slate-100">
                            {activeGroup.months.map(m => (
                                <BillLine
                                    key={m.key}
                                    icon={activeGroup.kind === 'bundle' ? faReceipt : faCalendarPlus}
                                    label={activeGroup.kind === 'bundle' ? m.label : t('payBills.rentDash', { label: m.label })}
                                    sub={m.sub}
                                    amount={fmtMoney(m.amount)}
                                />
                            ))}
                        </div>
                        <div className="mx-5 sm:mx-7 mb-5 sm:mb-7 mt-2 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-700">{t('payBills.total')}</span>
                            <span className="text-lg font-black text-slate-900 tabular-nums">{fmtMoney(activeGroup.total)}</span>
                        </div>
                    </section>
                    ) : (
                    <section className="pay-bills-bill lg:col-start-1 lg:col-span-7 lg:row-start-1 bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        {/* Summary: what is owed now, the bill's period and where it stands. */}
                        <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-5 bg-indigo-50/50 border-b border-slate-100">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 m-0">
                                        {t('payBills.statementLedger')}{billDetails.billingPeriod ? ` · ${billDetails.billingPeriod}` : ''}
                                    </p>
                                    <p className="pay-bills-total-due text-3xl sm:text-4xl font-black text-slate-900 m-0 mt-1 tabular-nums">{fmtMoney(balanceDue)}</p>
                                    <p className="text-xs sm:text-sm text-slate-500 m-0 mt-1">
                                        {paidSoFar > 0 ? t('paymentHistory.balanceRemaining') : t('payBills.totalDue')}
                                    </p>
                                </div>
                                {dueStatus && (
                                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                                        isAwaiting ? 'bg-sky-100 text-sky-800'
                                        : dueStatus.isOverdue ? 'bg-rose-100 text-rose-700'
                                        : dueStatus.isDueToday ? 'bg-amber-100 text-amber-800'
                                        : dueStatus.isDueSoon ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-slate-100 text-slate-600'}`}
                                    >
                                        {isAwaiting ? t('payBills.awaitingConfirmation')
                                            : dueStatus.isOverdue ? t('payBills.overdue')
                                            : dueStatus.isDueToday ? t('payBills.dueToday')
                                            : dueStatus.isDueSoon ? t(dueStatus.diffDays === 1 ? 'payBills.dueInOne' : 'payBills.dueInMany', { count: dueStatus.diffDays })
                                            : t('payBills.upcoming')}
                                    </span>
                                )}
                            </div>
                            {/* Past due: the period the bill covers, not a due date already gone. */}
                            {dueStatus?.isOverdue ? (
                                <p className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 m-0 mt-3">
                                    <FontAwesomeIcon icon={faCalendarPlus} className="text-slate-400" aria-hidden="true" />
                                    {t('payBills.covers')} <strong className="text-slate-800">{billDetails.coveredPeriod}</strong>
                                </p>
                            ) : billDetails.dueDate && (
                                <p className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 m-0 mt-3">
                                    <FontAwesomeIcon icon={faClock} className="text-slate-400" aria-hidden="true" />
                                    {t('payBills.dueLabel')} <strong className="text-slate-800">{dueStatus?.formattedDate || billDetails.dueDate}</strong>
                                </p>
                            )}
                        </div>

                        {/* Like services and maintenance, a charge that is not on this bill is not listed. */}
                        <div className="px-5 sm:px-7 py-2 divide-y divide-slate-100">
                            <BillLine icon={LINE_ICONS.baseRent} label={t('payBills.baseRent')} amount={fmtMoney(billDetails.baseRent)} />
                            {billDetails.securityDeposit > 0 && (
                                <BillLine icon={LINE_ICONS.deposit} label={t('payBills.deposit')} amount={fmtMoney(billDetails.securityDeposit)} />
                            )}
                            {[['water', billDetails.water], ['electricity', billDetails.electricity], ['parking', billDetails.parking], ['services', billDetails.services], ['maintenance', billDetails.maintenance]]
                                .filter(([, amount]) => amount > 0)
                                .map(([key, amount]) => (
                                    <BillLine key={key} icon={LINE_ICONS[key]} label={t(`payBills.${key}`)} amount={fmtMoney(amount)} />
                                ))}
                            {billDetails.lateFee > 0 && (
                                <BillLine tone="late" icon={LINE_ICONS.lateFee} label={t('payBills.lateFee')} amount={fmtMoney(billDetails.lateFee)} />
                            )}
                        </div>

                        <div className="mx-5 sm:mx-7 mb-5 sm:mb-7 mt-2 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-700">{paidSoFar > 0 ? t('payBills.billTotal') : t('payBills.totalDue')}</span>
                                <span className="text-lg font-black text-slate-900 tabular-nums">{fmtMoney(totalAmount)}</span>
                            </div>
                            {paidSoFar > 0 && (
                                <>
                                    {/* Installments: paid so far and the balance */}
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={t('paymentHistory.paidSoFar')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((paidSoFar / (totalAmount || 1)) * 100)}>
                                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (paidSoFar / (totalAmount || 1)) * 100)}%` }} />
                                    </div>
                                    <div className="flex justify-between text-sm font-semibold text-emerald-700"><span>{t('paymentHistory.paidSoFar')}</span><span className="tabular-nums">{fmtMoney(paidSoFar)}</span></div>
                                    <div className="flex justify-between text-sm font-extrabold text-slate-800"><span>{t('payBills.balance')}</span><span className="tabular-nums">{fmtMoney(balanceDue)}</span></div>
                                </>
                            )}
                        </div>
                    </section>
                    )}

                    {/*Right column: how to pay*/}
                    <section className="pay-bills-card lg:col-start-8 lg:col-span-5 lg:row-start-1 lg:row-span-2 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 sm:p-7 space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                            <span className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                                <FontAwesomeIcon icon={faWallet} aria-hidden="true" />
                            </span>
                            <h2 className="text-lg font-bold m-0 text-slate-900">{t('payBills.paymentSettings')}</h2>
                        </div>

                        <fieldset className="space-y-3 mx-0 mt-0 p-0 border-0 min-w-0">
                            <legend className="p-0 mb-3"><StepTitle n={1}>{t('payBills.selectMethod')}</StepTitle></legend>
                            {channelsLoading ? (
                                <p className="m-0 text-sm text-slate-500">{t('payBills.loadingMethods')}</p>
                            ) : paymentChannels.length === 0 ? (
                                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1">
                                    <p className="font-bold m-0 flex items-center gap-1.5">
                                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600" />
                                        {t('payBills.noChannelsTitle')}
                                    </p>
                                    <p className="m-0 text-slate-600">{t('payBills.noChannelsBody')}</p>
                                </div>
                            ) : null}
                            <div ref={methodMenuRef} className="relative">
                                <button
                                    type="button"
                                    aria-expanded={methodMenuOpen}
                                    aria-controls="pay-method-options"
                                    aria-label={t('payBills.selectMethod')}
                                    disabled={channelsLoading || paymentChannels.length === 0}
                                    onClick={() => setMethodMenuOpen(open => !open)}
                                    className="flex h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                                        {currentMethodObj.isGcash ? <span className="rounded bg-blue-600 px-1 text-[9px] font-black leading-4 tracking-tighter text-white">GCash</span>
                                            : currentMethodObj.isQr ? <span className="rounded bg-indigo-600 px-1 text-[8px] font-black leading-4 tracking-tight text-white">QR PH</span>
                                                : <FontAwesomeIcon icon={currentMethodObj.icon || faWallet} className={`text-base ${currentMethodObj.color || 'text-slate-500'}`} />}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">{currentMethodObj.family === 'split' ? t('payBills.splitPayment') : currentMethodObj.label || t('payBills.selectAMethod')}</span>
                                    <FontAwesomeIcon icon={faChevronDown} className={`text-xs text-slate-400 transition-transform ${methodMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                                </button>
                                {methodMenuOpen && (
                                    <ul id="pay-method-options" aria-label={t('payBills.selectMethod')} className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                                        {paymentChannels.map((method) => {
                                            const checked = (currentMethodObj.id ?? selectedMethod) === method.id;
                                            return (
                                                <li key={method.id}>
                                                    <button
                                                        type="button"
                                                        aria-pressed={checked}
                                                        onClick={() => handleMethodSelect(method.id)}
                                                        className={`flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${checked ? 'bg-indigo-50 text-indigo-800' : 'text-slate-800'}`}
                                                    >
                                                        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                                                            {method.isGcash ? <span className="rounded bg-blue-600 px-1 text-[9px] font-black leading-4 tracking-tighter text-white">GCash</span>
                                                                : method.isQr ? <span className="rounded bg-indigo-600 px-1 text-[8px] font-black leading-4 tracking-tight text-white">QR PH</span>
                                                                    : <FontAwesomeIcon icon={method.icon} className={`text-base ${method.color}`} />}
                                                        </span>
                                                        <span className="min-w-0 flex-1 text-sm font-semibold">{method.family === 'split' ? t('payBills.splitPayment') : method.label}</span>
                                                        {checked && <FontAwesomeIcon icon={faCheck} className="text-xs text-indigo-600" aria-hidden="true" />}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </fieldset>

                        {(['split', 'in_person'].includes(currentMethodObj.family) || (currentMethodObj.family === 'manual' && !payingGroup && balanceDue > 0)) && (
                            <StepTitle n={2} className="mb-3">{currentMethodObj.family === 'manual' ? t('payBills.amountNow') : t('payBills.paymentDetails')}</StepTitle>
                        )}

                        {!payingGroup && ['manual', 'split'].includes(currentMethodObj.family) && balanceDue > 0 && (
                            <div className="flex flex-col gap-2 text-left">
                                <label htmlFor="pay-part_amount" className={currentMethodObj.family === 'manual' ? 'sr-only' : 'text-xs font-bold text-slate-700 block'}>{t('payBills.amountNowPeso')}</label>
                                {/* Text, not type="number" (which took 1e6, -5 and any size): digits
                                    and one point, 2 decimals, and never more than the balance. */}
                                <input id="pay-part_amount" type="text" inputMode="decimal" autoComplete="off" value={partAmount}
                                    onChange={(e) => {
                                        let v = e.target.value.replace(/[^\d.]/g, '');
                                        const dot = v.indexOf('.');
                                        if (dot !== -1) v = `${v.slice(0, dot + 1)}${v.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
                                        const capped = v !== '' && v !== '.' && Number(v) > balanceDue;
                                        setPartCapped(capped);
                                        setPartAmount(capped ? balanceDue.toFixed(2) : v);
                                    }}
                                    placeholder={t('payBills.wholeBalancePlaceholder', { amount: balanceDue.toFixed(2) })} aria-invalid={!!partError} aria-describedby="pay-part_amount-hint"
                                    className={`pay-bills-input w-full rounded-xl border px-3 py-2 text-sm text-slate-800 ${partError ? 'border-rose-400' : 'border-slate-200'}`} />
                                {partError
                                    ? <p id="pay-part_amount-hint" role="alert" className="m-0 mt-0.5 text-xs font-semibold text-rose-600">{partError}</p>
                                    : partCapped && partAmount !== ''
                                    ? <p id="pay-part_amount-hint" role="status" className="m-0 mt-0.5 text-xs font-semibold text-amber-700">{t('payBills.maxIsBalance', { amount: fmtMoney(balanceDue) })}</p>
                                    : <p id="pay-part_amount-hint" className="m-0 mt-0.5 text-xs text-slate-500">{t('payBills.leaveBlank', { amount: fmtMoney(balanceDue) })}</p>}
                            </div>
                        )}

                        {currentMethodObj.family === 'manual' && (
                            <p className="m-0 flex items-start gap-2.5 p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 leading-relaxed text-left">
                                <FontAwesomeIcon icon={currentMethodObj.isQr ? faQrcode : faReceipt} className="mt-0.5 text-indigo-500" aria-hidden="true" />
                                <span>
                                    {currentMethodObj.isQr
                                        ? t('payBills.nextQr')
                                        : t('payBills.nextAccount', { method: (currentMethodObj.label || '').replace(/\s*\(manual\)/i, '') })}
                                </span>
                            </p>
                        )}

                        {currentMethodObj.family === 'split' && (
                            <SplitPaymentForm parts={splitParts} setParts={setSplitParts} total={splitTotal} showErrors={splitAttempted} fmtMoney={fmtMoney}
                                scheduledDate={scheduledDate} setScheduledDate={setScheduledDate} scheduledTimeSlot={scheduledTimeSlot} setScheduledTimeSlot={setScheduledTimeSlot} />
                        )}

                        {currentMethodObj.family === 'in_person' && (
                            <div className="space-y-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 text-left">
                                <div>
                                    <label htmlFor="pay-scheduled_date" className="block text-xs font-bold text-slate-700 mb-1">
                                        {t('payBills.scheduleDate')} <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        {...payForm.fieldA11y('scheduled_date')}
                                        value={scheduledDate}
                                        onChange={e => { setScheduledDate(e.target.value); payForm.clearError('scheduled_date'); }}
                                        onBlur={() => scheduledDate && payForm.validateField('scheduled_date', payValues)}
                                        required
                                        className={`pay-bills-input w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500${invalidCls(payForm.errors.scheduled_date)}`}
                                        min={localDateString()}
                                        max={addDays(SCHEDULE_MAX_DAYS)}
                                    />
                                    <FieldError id="pay-scheduled_date" error={payForm.errors.scheduled_date} />
                                </div>
                                <div>
                                    <label htmlFor="pay-scheduled_time_slot" className="block text-xs font-bold text-slate-700 mb-1">
                                        {t('payBills.timeSlot')} <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        {...payForm.fieldA11y('scheduled_time_slot')}
                                        value={scheduledTimeSlot}
                                        onChange={e => { setScheduledTimeSlot(e.target.value); payForm.clearError('scheduled_time_slot'); }}
                                        className={`pay-bills-input w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500 cursor-pointer${invalidCls(payForm.errors.scheduled_time_slot)}`}
                                    >
                                        <option value="morning">{t('payBills.slotMorning')}</option>
                                        <option value="afternoon">{t('payBills.slotAfternoon')}</option>
                                    </select>
                                    <FieldError id="pay-scheduled_time_slot" error={payForm.errors.scheduled_time_slot} />
                                </div>
                            </div>
                        )}

                        {/* Submit */}
                        <div className="pt-4 border-t border-slate-100 space-y-3">
                            <InlineAlert onDismiss={() => setPayError('')}>{payError}</InlineAlert>
                            <button
                                type="button"
                                onClick={handlePaymentExecution}
                                disabled={isPaying || paymentChannels.length === 0 || (currentMethodObj.family === 'split' && !checkSplit(splitParts, splitTotal, scheduledDate).valid) || (payingGroup ? false : (!activeInv || isAwaiting))}
                                className="pay-bills-submit-btn btn-interactive focus-glow w-full min-h-[52px] bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white font-extrabold py-3.5 rounded-2xl text-base transition-all duration-150 shadow-md border-0 cursor-pointer text-center flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed"
                            >
                                {!(currentMethodObj.family === 'manual' && !isAwaiting) && <FontAwesomeIcon icon={faLock} className="text-sm opacity-80" aria-hidden="true" />}
                                {isPaying ? t('payBills.processing') : currentMethodObj.family === 'manual' && (payingGroup || (activeInv && !isAwaiting))
                                    ? `${t('payBills.continueToPayment')} (${fmtMoney(payingGroup ? activeGroup.total : (partAmount !== '' && !partError ? Number(partAmount) : balanceDue))})`
                                    : payingGroup
                                    ? `${activeGroup.kind === 'bundle' ? t('payBills.payAll') : t('payBills.payAdvance')} (${fmtMoney(activeGroup.total)})`
                                    : isAwaiting ? t('payBills.awaitingConfirmation')
                                    // A part amount is sent only with manual and split payments.
                                    : activeInv ? `${t('payBills.proceedToPay')} (${fmtMoney(['manual', 'split'].includes(currentMethodObj.family) && partAmount !== '' && !partError ? Number(partAmount) : balanceDue)})`
                                    : t('payBills.proceedToPay')}
                                {currentMethodObj.family === 'manual' && !isPaying && (payingGroup || (activeInv && !isAwaiting)) && <FontAwesomeIcon icon={faArrowRight} className="text-sm" aria-hidden="true" />}
                            </button>
                            {currentMethodObj.family !== 'sandbox' && (
                                <p className="m-0 text-center text-xs text-slate-500">{t('payBills.notifyOnConfirm')}</p>
                            )}
                        </div>

                    </section>
                    </>)}

                {/* Pay in advance: one payment credits N upcoming months; each
                    month is still billed on its usual date and paid from it.
                    Full width when there is no bill to pay. */}
                {loaded && (advance?.available || advance?.credits?.length > 0) && (
                    <section id="pay-in-advance" className={`pay-bills-card bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 sm:p-7 space-y-4 scroll-mt-24 ${showWorkspace ? 'lg:col-start-1 lg:col-span-7 lg:row-start-2' : 'lg:col-span-12'}`}>
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                                <FontAwesomeIcon icon={faCalendarPlus} aria-hidden="true" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold m-0 text-slate-900">{t('payBills.advanceCardTitle')}</h3>
                                <p className="text-xs text-slate-500 m-0 mt-0.5">
                                    {t('payBills.advanceCardBody')}
                                </p>
                            </div>
                        </div>

                        {openAdvance ? (
                            openAdvance.payable ? (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <p className="text-sm text-slate-700 m-0">
                                        {rich('payBills.advanceReady', { months: advanceMonthsText, amount: fmtMoney(openAdvance.total) })}
                                    </p>
                                    {confirmCancelAdvance ? (
                                        <div role="group" aria-label={t('payBills.confirmCancelAdvanceLabel')} className="flex flex-col sm:items-end gap-2 shrink-0">
                                            <p className="m-0 text-sm font-semibold text-slate-800">{t('payBills.cancelAdvanceAsk')}</p>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleCancelAdvance}
                                                    disabled={advanceBusy}
                                                    className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50"
                                                >
                                                    {advanceBusy ? t('payBills.cancelling') : t('payBills.yesCancelAdvance')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmCancelAdvance(false)}
                                                    disabled={advanceBusy}
                                                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold cursor-pointer hover:bg-slate-50 disabled:opacity-50"
                                                >
                                                    {t('payBills.keepIt')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                    <div className="flex gap-2 shrink-0">
                                        {activeGroup?.kind !== 'advance' && (
                                            <button
                                                type="button"
                                                onClick={() => { setPayingAdvance(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold border-0 cursor-pointer"
                                            >
                                                {t('paymentHistory.payNow')}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setConfirmCancelAdvance(true)}
                                            disabled={advanceBusy}
                                            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold cursor-pointer hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            {t('payBills.cancelAdvance')}
                                        </button>
                                    </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-600 m-0">
                                    {t('payBills.advanceAwaiting', { months: advanceMonthsText })}
                                </p>
                            )
                        ) : advance?.available && advance.months?.length > 0 ? (
                            <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    <label htmlFor="advance-months" className="text-sm font-bold text-slate-700">{t('payBills.monthsToPrepay')}</label>
                                    <select
                                        id="advance-months"
                                        value={Math.min(advanceCount, advance.months.length)}
                                        onChange={e => setAdvanceCount(Number(e.target.value))}
                                        className="pay-bills-input px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500 cursor-pointer"
                                    >
                                        {advance.months.map((m, i) => (
                                            <option key={m.period_start} value={i + 1}>{t(i === 0 ? 'payBills.monthsCountOne' : 'payBills.monthsCountMany', { count: i + 1 })}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    {(() => {
                                        const selectedMonths = advance.months.slice(0, Math.min(advanceCount, advance.months.length));
                                        const total = selectedMonths.reduce((sum, month) => sum + month.amount, 0);
                                        if (selectedMonths.length === 1) {
                                            const [month] = selectedMonths;
                                            return (
                                                <div className="flex justify-between text-sm text-slate-600">
                                                    <span>{t('payBills.rentDash', { label: month.billing_period })} <span className="text-xs text-slate-500">({formatPeriodRange(month.period_start, month.period_end)})</span></span>
                                                    <span className="font-bold text-slate-900">{fmtMoney(month.amount)}</span>
                                                </div>
                                            );
                                        }
                                        const firstMonth = selectedMonths[0];
                                        const lastMonth = selectedMonths[selectedMonths.length - 1];
                                        const sameMonthlyAmount = selectedMonths.every(month => month.amount === firstMonth.amount);
                                        return (
                                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-slate-600">
                                                <span>{t('payBills.rentAdvanceRange', { count: selectedMonths.length, from: formatDay(firstMonth.period_start), to: formatDay(lastMonth.period_end) })}</span>
                                                <span className="font-bold text-slate-900">
                                                    {sameMonthlyAmount && <span>{t('payBills.amountTimesMonths', { amount: fmtMoney(firstMonth.amount), count: selectedMonths.length })} </span>}
                                                    <span className="text-indigo-600">{t('payBills.totalAmount', { amount: fmtMoney(total) })}</span>
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCreateAdvance}
                                    disabled={advanceBusy}
                                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50"
                                >
                                    {advanceBusy ? t('payBills.preparing') : t('payBills.continueToPayment')}
                                </button>
                            </div>
                        ) : advance?.available ? (
                            <p className="text-sm text-slate-600 m-0">
                                {t('payBills.noMonthsLeft', { end: advance.lease_end ? ` (${advance.lease_end})` : '' })}
                            </p>
                        ) : null}

                        <InlineAlert onDismiss={() => setAdvanceError('')}>{advanceError}</InlineAlert>

                        {/* Months already paid in advance: waiting for their month, or billed and settled. */}
                        {advance?.credits?.length > 0 && (
                            <div className="border-t border-slate-100 pt-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 m-0 mb-1">{t('payBills.prepaidMonths')}</p>
                                <div className="divide-y divide-slate-100">
                                    {advance.credits.map(c => (
                                        <BillLine
                                            key={`${c.advance_invoice_id}-${c.period_start}`}
                                            icon={c.status === 'applied' ? faCheckCircle : faCalendarPlus}
                                            label={t('payBills.rentDash', { label: c.billing_period })}
                                            sub={c.status === 'applied'
                                                ? t('payBills.creditApplied', { id: c.applied_invoice_id })
                                                : t('payBills.creditWaiting', { date: formatDay(c.period_start) })}
                                            amount={<span className={c.status === 'applied' ? 'text-emerald-600' : 'text-indigo-600'}>{fmtMoney(c.amount)}</span>}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}
                </div>


            </div>

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