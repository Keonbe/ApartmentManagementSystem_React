import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faUniversity, faMoneyBillWave, faChevronDown, faCheckCircle, faHistory, faExclamationTriangle, faClock, faCalendarAlt, faHourglassHalf, faTimesCircle, faCalendarPlus, faCoins } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { appReturnUrl, gatewayReturnParams } from '../api/env';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../config/i18n';
import SuccessModal from '../Components/SuccessModal';
import useInvoiceWatch, { AWAITING_STATUSES, OPEN_STATUSES, PAYABLE_STATUSES } from '../hooks/useInvoiceWatch';
import { TENANT_NOTIFICATIONS_EVENT } from '../config/notificationLinks';
import { addDays, checkDate, checkPaymentReference, isBankMethod, localDateString, LIMITS } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import { daysPastDue, formatCoveredPeriod, formatDay, formatPeriodRange, isBundleKey, isPastDue } from '../utils/billingPeriod';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import FileChip from '../Components/form/FileChip';
import SplitPaymentForm from '../Components/SplitPaymentForm';
import { checkSplit, emptyPortion } from '../utils/splitPayment';
import { invalidCls } from '../Components/form/formHelpers';

// schedule_payment.php accepts today up to 60 days ahead, morning/afternoon.
const SCHEDULE_MAX_DAYS = 60;
const TIME_SLOTS = ['morning', 'afternoon'];

// Per-method reference rules (same as PaymentUpload / checkPaymentReference).
const referenceInputProps = (label = '') => {
    const m = label.toLowerCase();
    if (m.includes('gcash')) return { maxLength: 13, inputMode: 'numeric', placeholder: '13-digit GCash reference' };
    if (isBankMethod(m)) return { maxLength: 55, inputMode: 'text', placeholder: m.includes('bpi') ? 'e.g. BPI-2026-000123' : 'e.g. BDO-2026-000123' };
    return { maxLength: LIMITS.paymentReference, inputMode: 'text', placeholder: 'e.g. 1002 9382 1823' };
};
import '../assets/styles/responsive/user/pay-bills.responsive.css';

export default function PayBills() {
    const navigate = useNavigate();
    const { t } = useLang();
    const [selectedMethod, setSelectedMethod] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [paymentChannels, setPaymentChannels] = useState([]);
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTimeSlot, setScheduledTimeSlot] = useState('morning');

    {/*Dynamically compute current calendar month and year variables*/}
    const currentDate = new Date();
    const currentMonthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Confirmation modal: shown after the tenant submits a payment, and again
    // when management's decision arrives (useInvoiceWatch polls for it).
    // Back from a PayMongo checkout: the invoice stays 'processing' until the
    // webhook lands; useInvoiceWatch keeps polling and shows "Payment confirmed" then.
    const [notice, setNotice] = useState(() => (
        gatewayReturnParams().get('status') === 'success'
            ? {
                message: 'Payment sent',
                subtext: 'We are waiting for the payment gateway to confirm it. This page updates by itself, and you will also get a notification.',
            }
            : null
    ));

    const confirmedNotice = (paidInvoices) => {
        const first = paidInvoices[0];
        const total = paidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total_amount) || 0), 0);
        return {
            message: 'Payment confirmed',
            subtext: paidInvoices.length === 1
                ? `Management confirmed your payment of ₱${total.toLocaleString(undefined, { minimumFractionDigits: 2 })} for ${first.billing_period || `invoice ${first.id}`}. Your receipt is ready.`
                : `Management confirmed ${paidInvoices.length} payments totalling ₱${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}. A receipt for each month is ready.`,
            action: { label: 'View receipt', onClick: () => navigate('/payment-history', { state: { receiptId: first.id } }) },
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
        else if (events.some(e => e.type === 'failed')) setNotice(prev => (prev?.message === 'Payment sent' ? null : prev));
        // A rejection or a declined checkout shows as a banner on the bill itself.
        // A settled advance turns into prepaid-month credits on the advance card.
        if (events.some(e => e.invoice?.advance_months)) loadAdvance();
    };

    const { invoices, loaded, refresh } = useInvoiceWatch({ onTransition: handleTransitions, onFirstLoad: handleFirstLoad });

    // The bill on screen: the earliest-due invoice the tenant still has to pay;
    // failing that, the earliest one awaiting confirmation (shown read-only).
    // A grouped payment (advance-rent invoice, legacy advance group, or a
    // combined payment of overdue bills) is paid as a whole, never shown as the
    // bill on screen.
    const byDueDate = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''));
    const isCancelledApp = (i) => ['cancelled', 'rejected', 'declined', 'moved-out', 'archived'].includes(String(i?.application_status || '').toLowerCase());
    const isGrouped = (i) => !!(i.payment_group || i.advance_months);
    const payableInvoices = invoices.filter(i => PAYABLE_STATUSES.includes(i.status) && !isGrouped(i) && !isCancelledApp(i)).sort(byDueDate);
    const awaitingInvoices = invoices.filter(i => AWAITING_STATUSES.includes(i.status) && !isCancelledApp(i)).sort(byDueDate);
    const hasCancelledApp = invoices.length > 0 && invoices.every(isCancelledApp);
    // One "awaiting" banner per payment: a group's bills together.
    const awaitingEntries = Object.values(awaitingInvoices.reduce((acc, inv) => {
        const key = inv.payment_group || inv.id;
        if (!acc[key]) {
            acc[key] = { ...inv, id: key, months: [inv.billing_period] };
        } else {
            acc[key].total_amount = (parseFloat(acc[key].total_amount) || 0) + (parseFloat(inv.total_amount) || 0);
            acc[key].months.push(inv.billing_period);
        }
        return acc;
    }, {})).map(e => (e.payment_group
        ? { ...e, billing_period: `${isBundleKey(e.payment_group) ? 'Combined' : 'Advance'}: ${e.months.join(', ')}` }
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
                months: pending.map(m => ({ key: m.period_start, label: m.billing_period, sub: `Starts ${formatDay(m.period_start)} · paid from this advance when billed`, amount: m.amount })),
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
            months: rows.map(i => ({ key: i.id, label: i.billing_period, sub: `Due ${i.due_date} · ${i.id}`, amount: i.total_amount })),
            total: rows.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0),
            payable: rows.every(i => PAYABLE_STATUSES.includes(i.status)),
            cancelBody: { action: 'cancel', group: key },
        };
    })();
    const advanceMonthsText = openAdvance ? openAdvance.months.map(m => m.label).join(', ') : '';
    // Prepaid months still waiting for their month (paid automatically when billed).
    const prepaidCount = (advance?.credits || []).filter(c => c.status === 'available').length;

    // ── Combined payment of overdue bills (bundle_payment.php) ──
    // With two or more unpaid bills, at least one overdue, the tenant pays them
    // all together, overdue and current (one 'BND-…' key; each bill still gets
    // its own receipt, plus one combined receipt), or one at a time, earliest first.
    // "Oct 4 – Nov 3, 2026 · 8 days overdue" for a past-due bill, "Due Oct 15, 2026" otherwise.
    const billStatusText = (i) => (isPastDue(i)
        ? `${formatCoveredPeriod(i)} · ${daysPastDue(i)} day${daysPastDue(i) === 1 ? '' : 's'} overdue`
        : `Due ${formatDay(i.due_date)}`);
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
            months: mine.map(i => ({ key: i.id, label: i.billing_period, sub: `${billStatusText(i)} · ${i.id}`, amount: i.total_amount })),
            total: mine.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0),
            payable: mine.every(i => PAYABLE_STATUSES.includes(i.status)),
        };
    })();
    // Bills that can be combined: unpaid with nothing submitted yet (matches
    // bundle_candidates() in config.php).
    const unpaidSingles = payableInvoices.filter(i => ['pending', 'unpaid', 'overdue', 'payment-failed'].includes(i.status));
    const overdueCount = unpaidSingles.filter(isPastDue).length;
    const canBundle = !openBundle && unpaidSingles.length >= 2 && overdueCount > 0;

    const handleCreateBundle = async () => {
        setBundleBusy(true);
        try {
            const res = await api.post('/bundle_payment.php', { action: 'create' });
            if (res.data.success) {
                await refresh();
                setBundleView(true);
                setPayingAdvance(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                alert(res.data.message || 'Could not combine the overdue bills.');
            }
        } catch (err) {
            alert(apiErrorMessage(err, 'Could not combine the overdue bills.'));
        } finally {
            setBundleBusy(false);
        }
    };

    const handleReleaseBundle = async () => {
        if (!openBundle) return;
        setBundleBusy(true);
        try {
            const res = await api.post('/bundle_payment.php', { action: 'release', key: openBundle.key });
            if (res.data.success) {
                setBundleChoiceHidden(true);
                await refresh();
            } else {
                alert(res.data.message || 'Could not split the combined payment.');
            }
        } catch (err) {
            alert(apiErrorMessage(err, 'Could not split the combined payment.'));
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
    const groupWord = activeGroup?.kind === 'bundle' ? 'Combined payment' : 'Advance payment';

    // What the payment panel pays: the chosen group, otherwise the bill on screen.
    const payKey = payingGroup ? activeGroup.key : billDetails.invoiceId;
    const payLabel = payingGroup
        ? `${groupWord.toLowerCase()} (${activeGroup.months.map(m => m.label).join(', ')})`
        : (billDetails.billingPeriod || 'this bill');

    const handleCreateAdvance = async () => {
        setAdvanceBusy(true);
        try {
            const res = await api.post('/advance_payment.php', { action: 'create', months: advanceCount });
            if (res.data.success) {
                await Promise.all([refresh(), loadAdvance()]);
                setPayingAdvance(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                alert(res.data.message || 'Could not prepare the advance payment.');
            }
        } catch (err) {
            alert(apiErrorMessage(err, 'Could not prepare the advance payment.'));
        } finally {
            setAdvanceBusy(false);
        }
    };

    const handleCancelAdvance = async () => {
        if (!openAdvance || !window.confirm('Cancel this advance payment? Its months will be billed as usual instead.')) return;
        setAdvanceBusy(true);
        try {
            const res = await api.post('/advance_payment.php', openAdvance.cancelBody);
            if (res.data.success) {
                setPayingAdvance(false);
                await Promise.all([refresh(), loadAdvance()]);
            } else {
                alert(res.data.message || 'Could not cancel the advance payment.');
            }
        } catch (err) {
            alert(apiErrorMessage(err, 'Could not cancel the advance payment.'));
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
            formattedDate: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        };
    })();

    useEffect(() => {
        const fetchChannels = async () => {
            try {
                const res = await api.get('/get_payment_channels.php');
                if (res.data.success && res.data.channels) {
                    const mapped = res.data.channels.map(ch => {
                        let icon, color;
                        if (ch.icon === 'gcash') { icon = faWallet; color = 'text-blue-600'; }
                        else if (ch.icon === 'bank') { icon = faUniversity; color = 'text-indigo-600'; }
                        else if (ch.icon === 'qr') { icon = faMoneyBillWave; color = 'text-blue-500'; }
                        else if (ch.icon === 'maya') { icon = faWallet; color = 'text-emerald-500'; }
                        else { icon = faMoneyBillWave; color = 'text-emerald-600'; }
                        
                        return { ...ch, icon, color, isGcash: ch.icon === 'gcash' };
                    });
                    // Splitting a bill across methods rests on manual proofs, so it is
                    // offered with them, after the other methods.
                    if (mapped.some(ch => ch.family === 'manual')) {
                        mapped.push({ id: 'split', label: 'Split payment', family: 'split', icon: faCoins, color: 'text-amber-600' });
                    }
                    setPaymentChannels(mapped);
                    if (mapped.length > 0) {
                        setSelectedMethod(mapped[0].id);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch payment channels:", error);
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
                    let released = true;
                    if (invoiceId) {
                        try {
                            await api.post('/release_checkout_session.php', { invoice_id: invoiceId });
                        } catch (err) {
                            console.error('Failed to release the cancelled payment session:', err);
                            released = false;
                        }
                    }
                    alert(released
                        ? "Payment was cancelled."
                        : "Payment was cancelled, but this bill could not be reopened for payment. Please contact management to release it.");
                    navigate('/pay-bills', { replace: true });
                    refresh();
                })();
            }
        }
    }, [navigate, refresh]);

    const totalAmount = billDetails.baseRent + billDetails.water + billDetails.electricity + billDetails.parking + billDetails.services + billDetails.maintenance + billDetails.securityDeposit + billDetails.lateFee;

    const currentMethodObj = paymentChannels.find(m => m.id === selectedMethod) || paymentChannels[0] || {};

    const handleMethodSelect = (methodId) => {
        setSelectedMethod(methodId);
        setIsDropdownOpen(false);
        setSplitAttempted(false);
        payForm.setErrors({});
    };

    // Split payment: the portions being entered, and whether a submit was tried
    // (errors show only then).
    const [splitParts, setSplitParts] = useState(() => [emptyPortion('cash'), emptyPortion('gcash')]);
    const [splitAttempted, setSplitAttempted] = useState(false);
    const splitTotal = payingGroup ? (parseFloat(activeGroup.total) || 0) : totalAmount;
    const [paymentReference, setPaymentReference] = useState('');
    const [proofFile, setProofFile] = useState(null);
    const [isPaying, setIsPaying] = useState(false);
    const [proofInputKey, setProofInputKey] = useState(0);

    // Only the fields of the chosen method are checked.
    const family = currentMethodObj.family;
    const payForm = useFieldErrors(
        family === 'manual' ? {
            payment_reference: (v) => checkPaymentReference(v, currentMethodObj.label),
            proof: (f) => (f ? checkFile(f, FILE_RULES.paymentProof) : 'Please attach your proof of payment.'),
        } : family === 'in_person' ? {
            scheduled_date: (v) => checkDate(v, { min: localDateString(), max: addDays(SCHEDULE_MAX_DAYS), label: 'Schedule date' }),
            scheduled_time_slot: (v) => (TIME_SLOTS.includes(v) ? '' : 'Please choose a time slot.'),
        } : {},
        { idPrefix: 'pay-' }
    );
    const payValues = { payment_reference: paymentReference, proof: proofFile, scheduled_date: scheduledDate, scheduled_time_slot: scheduledTimeSlot };

    const clearProof = () => {
        setProofFile(null);
        setProofInputKey(k => k + 1); // remounts the file input, clearing it
    };

    const handlePaymentExecution = async (e) => {
        e.preventDefault();
        if (isPaying) return;
        setIsPaying(true);
        try {
            await executePayment();
        } finally {
            setIsPaying(false);
        }
    };

    const executePayment = async () => {
        if (!payKey) {
            alert("No pending invoice found.");
            return;
        }
        if (!payingGroup && isAwaiting) {
            alert("This bill already has a payment awaiting confirmation.");
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
                        message: payingGroup ? `${groupWord} scheduled` : 'Payment scheduled',
                        subtext: `Please pay at the admin office on ${scheduledDate} (${scheduledTimeSlot}). You will be notified once management records your payment.`,
                    });
                } else if (!payForm.applyServerErrors(res)) {
                    alert(res.data.message);
                }
            } catch (error) {
                console.error(error);
                if (!payForm.applyServerErrors(error)) alert(apiErrorMessage(error, "Failed to schedule payment."));
            }
            return;
        }

        if (currentMethodObj.family === 'split') {
            setSplitAttempted(true);
            if (!checkSplit(splitParts, splitTotal, scheduledDate).valid) return;
            const formData = new FormData();
            formData.append('invoice_id', payKey);
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
                        message: payingGroup ? `${groupWord} submitted` : 'Payment submitted',
                        subtext: `Your split payment for ${payLabel} is awaiting verification by management.${hadCash ? ` Pay the cash portion at the admin office on ${scheduledDate} (${scheduledTimeSlot}).` : ''} This page updates by itself, and you will be notified once it is confirmed.`,
                    });
                } else {
                    alert(res.data.message);
                }
            } catch (error) {
                console.error('Error submitting split payment:', error);
                alert(apiErrorMessage(error, 'Split payment failed.'));
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
                    alert(res.data.message || "Failed to create checkout session.");
                }
            } catch (error) {
                console.error("Error creating checkout session:", error);
                alert(apiErrorMessage(error, "Payment gateway error."));
            }
            return;
        }

        // Manual (GCash / bank) payments need a reference and a proof: pay_bill.php
        // refuses a non-cash payment until upload_payment_proof.php has stored one.
        const reference = paymentReference.trim();
        setPaymentReference(reference);
        if (!payForm.validateAll({ ...payValues, payment_reference: reference })) return;

        let proofPath;
        const formData = new FormData();
        formData.append('invoice_id', payKey);
        formData.append('payment_reference', reference);
        formData.append('payment_method', currentMethodObj.label);
        formData.append('proof', proofFile);

        try {
            const uploadRes = await api.post('/upload_payment_proof.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (!uploadRes.data.success) {
                if (!payForm.applyServerErrors(uploadRes)) payForm.setFieldError('proof', apiErrorMessage(uploadRes, "Payment proof could not be uploaded."));
                return;
            }
            proofPath = uploadRes.data.proof_path;
        } catch (err) {
            // Without a stored proof pay_bill.php would refuse anyway, so stop
            // here and say why instead of sending a request that must fail (L8).
            console.error("Proof upload failed:", err);
            if (!payForm.applyServerErrors(err)) payForm.setFieldError('proof', apiErrorMessage(err, "Payment proof could not be uploaded."));
            return;
        }

        try {
            const res = await api.post("/pay_bill.php", {
                invoiceId: payKey,
                paymentMethod: currentMethodObj.label,
                paymentReference: reference,
                proofOfPaymentPath: proofPath
            });

            if (res.data.success) {
                setPaymentReference('');
                clearProof();
                window.dispatchEvent(new CustomEvent(TENANT_NOTIFICATIONS_EVENT));
                setNotice({
                    message: payingGroup ? `${groupWord} submitted` : 'Payment submitted',
                    subtext: `Your ${currentMethodObj.label} payment for ${payLabel} is awaiting verification by management. This page updates by itself, and you will be notified once it is confirmed.`,
                });
            } else {
                console.error("Server Error:", res.data.message);
                alert(res.data.message);
            }
        } catch (error) {
            console.error("Error submitting payment:", error);
            alert(apiErrorMessage(error, "Payment failed."));
        }
    };

    return (
        <div className="pay-bills-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">
                
                {/*Header Summary Section displaying dynamic system calendar values*/}
                <div className="border-b border-slate-200 pb-4">
                    <h1 className="pay-bills-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none" style={{ color: '#3b4276' }}>
                        {t('payBills.heading')}: {currentMonthYear}
                    </h1>
                    <p className="pay-bills-subtext text-slate-500 text-sm mt-1 m-0">
                        {t('payBills.subtext')}
                    </p>
                </div>

                {/* Payments awaiting management's (or the gateway's) confirmation */}
                {awaitingEntries.map(inv => (
                    <div key={inv.id} className="w-full bg-sky-50 border-2 border-sky-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 text-lg">
                            <FontAwesomeIcon icon={faHourglassHalf} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm sm:text-base font-extrabold text-sky-900 m-0">
                                    {inv.status === 'scheduled' ? 'In-person payment scheduled'
                                        : inv.status === 'processing' ? 'Online payment processing'
                                        : 'Payment awaiting verification'}
                                </h4>
                                <span className="bg-sky-200 text-sky-900 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                                    {inv.billing_period || inv.id}
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-sky-800 m-0 mt-1 leading-relaxed">
                                {inv.status === 'scheduled'
                                    ? <>Please pay <strong>{fmtMoney(inv.total_amount)}</strong> at the admin office on <strong>{inv.scheduled_date}</strong>{inv.scheduled_time_slot ? ` (${inv.scheduled_time_slot})` : ''}. You will be notified once management records it.</>
                                    : inv.status === 'processing'
                                    ? <>Your online payment of <strong>{fmtMoney(inv.total_amount)}</strong> is being confirmed by the payment gateway. This page updates by itself.</>
                                    : <>Your {inv.payment_method || ''} payment of <strong>{fmtMoney(inv.total_amount)}</strong>{inv.payment_reference ? <> (ref. {inv.payment_reference})</> : null} is being verified by management. You will be notified as soon as it is confirmed; this page updates by itself.</>}
                            </p>
                        </div>
                    </div>
                ))}

                {/* Management sent the proof back, or the online checkout was declined */}
                {!isAwaiting && billDetails.rejectionReason && (
                    <div className="w-full bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 text-lg">
                            <FontAwesomeIcon icon={faTimesCircle} />
                        </div>
                        <div>
                            <h4 className="text-sm sm:text-base font-extrabold text-rose-900 m-0">Payment proof not accepted</h4>
                            <p className="text-xs sm:text-sm text-rose-700 m-0 mt-1 leading-relaxed">
                                Management returned your payment for {billDetails.billingPeriod || 'this bill'}: <strong>{billDetails.rejectionReason}</strong>. Please submit a new payment below.
                            </p>
                        </div>
                    </div>
                )}
                {billDetails.status === 'payment-failed' && (
                    <div className="w-full bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 text-lg">
                            <FontAwesomeIcon icon={faTimesCircle} />
                        </div>
                        <div>
                            <h4 className="text-sm sm:text-base font-extrabold text-rose-900 m-0">Online payment did not go through</h4>
                            <p className="text-xs sm:text-sm text-rose-700 m-0 mt-1 leading-relaxed">
                                Please try again or choose another payment method.
                            </p>
                        </div>
                    </div>
                )}

                {loaded && !activeInv && !openBundle && (
                    hasCancelledApp ? (
                        <div className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 text-lg">
                                <FontAwesomeIcon icon={faTimesCircle} />
                            </div>
                            <div>
                                <h4 className="text-sm sm:text-base font-extrabold text-slate-800 m-0">Application Cancelled</h4>
                                <p className="text-xs sm:text-sm text-slate-600 m-0 mt-1 leading-relaxed">
                                    Your application has been cancelled. Any open bills associated with this application were voided and no payment is required.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 text-lg">
                                <FontAwesomeIcon icon={faCheckCircle} />
                            </div>
                            <div>
                                <h4 className="text-sm sm:text-base font-extrabold text-emerald-900 m-0">You're all paid up</h4>
                                <p className="text-xs sm:text-sm text-emerald-800 m-0 mt-1 leading-relaxed">
                                    There is no open bill right now. Receipts for past payments are in your payment history.
                                </p>
                            </div>
                        </div>
                    )
                )}

                {/* Due Date & Overdue Reminder Banner (not while a payment awaits confirmation) */}
                {dueStatus && !isAwaiting && !payingGroup && (
                    <>
                        {dueStatus.isOverdue ? (
                            <div className="w-full bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 text-lg">
                                    <FontAwesomeIcon icon={faExclamationTriangle} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm sm:text-base font-extrabold text-rose-900 m-0">Payment is Overdue</h4>
                                        <span className="bg-rose-200 text-rose-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                                            {Math.abs(dueStatus.diffDays)} day{Math.abs(dueStatus.diffDays) === 1 ? '' : 's'} past due
                                        </span>
                                    </div>
                                    <p className="text-xs sm:text-sm text-rose-700 m-0 mt-1 leading-relaxed">
                                        Your payment of <strong>₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> for the period <strong>{billDetails.coveredPeriod}</strong> is still unpaid. Please settle your bill immediately to avoid late fees and service interruptions.
                                    </p>
                                </div>
                            </div>
                        ) : dueStatus.isDueToday ? (
                            <div className="w-full bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-lg">
                                    <FontAwesomeIcon icon={faClock} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm sm:text-base font-extrabold text-amber-900 m-0">Payment Due Today</h4>
                                        <span className="bg-amber-200 text-amber-900 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                                            Due Today
                                        </span>
                                    </div>
                                    <p className="text-xs sm:text-sm text-amber-800 m-0 mt-1 leading-relaxed">
                                        Your billing payment of <strong>₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> for {billDetails.billingPeriod} is due today (<strong>{dueStatus.formattedDate}</strong>). Please complete your settlement before the end of the day.
                                    </p>
                                </div>
                            </div>
                        ) : dueStatus.isDueSoon ? (
                            <div className="w-full bg-indigo-50 border border-indigo-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 text-lg">
                                    <FontAwesomeIcon icon={faCalendarAlt} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm sm:text-base font-extrabold text-indigo-900 m-0">Upcoming Rent Due Date</h4>
                                        <span className="bg-indigo-200 text-indigo-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                                            Due in {dueStatus.diffDays} day{dueStatus.diffDays === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <p className="text-xs sm:text-sm text-indigo-700 m-0 mt-1 leading-relaxed">
                                        Reminder: Your rental billing for {billDetails.billingPeriod} is due on <strong>{dueStatus.formattedDate}</strong>.
                                    </p>
                                </div>
                            </div>
                        ) : null}
                    </>
                )}

                {/* Overdue plus other unpaid bills: pay them all together, or one at a time. */}
                {canBundle && !bundleChoiceHidden && !payingGroup && (
                    <div className="w-full bg-white border-2 border-rose-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                        <div>
                            <h4 className="text-sm sm:text-base font-extrabold text-rose-900 m-0">
                                You have {unpaidSingles.length} unpaid bills ({overdueCount} overdue) — {fmtMoney(unpaidSingles.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0))}
                            </h4>
                            <p className="text-xs sm:text-sm text-slate-600 m-0 mt-1">
                                Pay them all in one payment, or pay each billing period separately. Every billing period keeps its own invoice and receipt either way.
                            </p>
                        </div>
                        <ul className="m-0 pl-0 list-none space-y-1">
                            {unpaidSingles.map(i => (
                                <li key={i.id} className="flex justify-between gap-3 text-xs sm:text-sm text-slate-600">
                                    <span>{i.billing_period} <span className={isPastDue(i) ? 'text-rose-500' : 'text-slate-400'}>({billStatusText(i)})</span></span>
                                    <span className="font-bold text-slate-800 shrink-0">{fmtMoney(i.total_amount)}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={handleCreateBundle}
                                disabled={bundleBusy}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50"
                            >
                                {bundleBusy ? 'Preparing…' : 'Pay all together'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setBundleChoiceHidden(true)}
                                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold cursor-pointer hover:bg-slate-50"
                            >
                                Pay one at a time
                            </button>
                        </div>
                    </div>
                )}

                {/* An open combined payment the tenant stepped away from. */}
                {openBundle?.payable && !payingGroup && (
                    <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-sm text-rose-900 m-0">
                            Combined payment ready: <strong>{openBundle.months.map(m => m.label).join(', ')}</strong> — <strong>{fmtMoney(openBundle.total)}</strong>
                        </p>
                        <div className="flex gap-2 shrink-0">
                            <button type="button" onClick={() => { setPayingAdvance(false); setBundleView(true); }} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold border-0 cursor-pointer">
                                Pay all
                            </button>
                            <button type="button" onClick={handleReleaseBundle} disabled={bundleBusy} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold cursor-pointer hover:bg-slate-50 disabled:opacity-50">
                                Pay separately
                            </button>
                        </div>
                    </div>
                )}

                {/*Main Workspace Content Segment Panel*/}
                <div className="stagger-children grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-start">

                    {/*Left Grid Parameter Block: Billing Items Statement Breakdown Ledger*/}
                    {payingGroup ? (
                    <div className={`pay-bills-card card-interactive md:col-span-7 bg-white rounded-3xl border-2 ${activeGroup.kind === 'bundle' ? 'border-rose-200' : 'border-indigo-200'} shadow-md p-5 sm:p-8 space-y-5`}>
                        <div className="flex justify-between items-start border-b border-slate-100 pb-3 gap-3">
                            <div>
                                <h3 className="text-lg font-bold m-0" style={{ color: '#3b4276' }}>{groupWord}</h3>
                                <p className="text-xs text-slate-500 m-0 mt-0.5">
                                    {activeGroup.kind === 'bundle'
                                        ? `One payment for ${activeGroup.months.length} bills. You get one combined receipt, and each billing period keeps its own invoice and receipt.`
                                        : `One payment for ${activeGroup.months.length} month${activeGroup.months.length === 1 ? '' : 's'}. Each month's rent invoice is still issued on its usual date and paid from this advance, with its own receipt.`}
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                {activeGroup.kind === 'bundle' && (
                                    <button
                                        type="button"
                                        onClick={handleReleaseBundle}
                                        disabled={bundleBusy}
                                        className="text-xs font-bold text-rose-600 hover:underline bg-transparent border-0 cursor-pointer p-1 disabled:opacity-50"
                                    >
                                        Pay separately instead
                                    </button>
                                )}
                                {(activeGroup.kind === 'advance' || activeInv) && (
                                    <button
                                        type="button"
                                        onClick={() => (activeGroup.kind === 'advance' ? setPayingAdvance(false) : setBundleView(false))}
                                        className="text-xs font-bold text-indigo-600 hover:underline bg-transparent border-0 cursor-pointer p-1"
                                    >
                                        Back to current bill
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="space-y-3">
                            {activeGroup.months.map(m => (
                                <div key={m.key} className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-slate-600">
                                    <span>
                                        {activeGroup.kind === 'bundle' ? m.label : `Rent — ${m.label}`}
                                        <span className="block text-[11px] text-slate-400">{m.sub}</span>
                                    </span>
                                    <span className="font-bold text-slate-900">{fmtMoney(m.amount)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="border-t-2 border-slate-900 pt-4 flex justify-between items-center">
                            <span className="text-base font-extrabold text-slate-800">Total</span>
                            <span className="pay-bills-total-due text-2xl font-black text-indigo-600">{fmtMoney(activeGroup.total)}</span>
                        </div>
                    </div>
                    ) : (
                    <div className="pay-bills-card card-interactive md:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-lg font-bold m-0" style={{ color: '#3b4276' }}>{t('payBills.statementLedger')}</h3>
                                {/* Past due: the period the bill covers, not a due date already gone. */}
                                {dueStatus?.isOverdue ? (
                                    <p className="text-xs text-slate-400 m-0 mt-0.5">
                                        Covers: <strong className="text-slate-600">{billDetails.coveredPeriod}</strong>
                                    </p>
                                ) : billDetails.dueDate && (
                                    <p className="text-xs text-slate-400 m-0 mt-0.5">
                                        Due Date: <strong className="text-slate-600">{dueStatus?.formattedDate || billDetails.dueDate}</strong>
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    type="button" 
                                    onClick={() => navigate('/user-utilities')}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline bg-transparent border-0 cursor-pointer p-1 flex items-center gap-1.5 min-h-[36px]"
                                >
                                    <FontAwesomeIcon icon={faHistory} className="text-[11px]" />
                                    <span>Meter Readings</span>
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => navigate('/payment-history')}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline bg-transparent border-0 cursor-pointer p-1 flex items-center gap-1.5 min-h-[36px]"
                                >
                                    <FontAwesomeIcon icon={faHistory} className="text-[11px]" />
                                    <span>{t('payBills.viewPrevious')}</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-slate-600">
                                <span>{t('payBills.baseRent')}</span>
                                <span className="font-bold text-slate-900">₱{billDetails.baseRent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            {billDetails.securityDeposit > 0 && (
                                <div className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-slate-600">
                                    <span>{t('payBills.deposit')}</span>
                                    <span className="font-bold text-slate-900">₱{billDetails.securityDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            <div className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-slate-600">
                                <span>{t('payBills.water')}</span>
                                <span className="font-bold text-slate-900">₱{billDetails.water.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-slate-600">
                                <span>{t('payBills.electricity')}</span>
                                <span className="font-bold text-slate-900">₱{billDetails.electricity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-slate-600">
                                <span>{t('payBills.parking')}</span>
                                <span className="font-bold text-slate-900">₱{billDetails.parking.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            {billDetails.services > 0 && (
                                <div className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-slate-600">
                                    <span>{t('payBills.services')}</span>
                                    <span className="font-bold text-slate-900">₱{billDetails.services.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            {billDetails.maintenance > 0 && (
                                <div className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-slate-600">
                                    <span>{t('payBills.maintenance')}</span>
                                    <span className="font-bold text-slate-900">₱{billDetails.maintenance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            {billDetails.lateFee > 0 && (
                                <div className="pay-bills-ledger-row flex justify-between items-center text-sm font-medium text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 font-bold">
                                    <span>{t('payBills.lateFee')}</span>
                                    <span>₱{billDetails.lateFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                        </div>

                        <div className="border-t-2 border-slate-900 pt-4 mt-4 flex justify-between items-center">
                            <span className="text-base font-extrabold text-slate-800">{t('payBills.totalDue')}</span>
                            <span className="pay-bills-total-due text-2xl font-black text-indigo-600">₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                    )}

                    {/*Right Grid Parameter Block: Clearing Channel Allocation Panel Controls*/}
                    <div className="pay-bills-card card-interactive md:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 space-y-6">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-3" style={{ color: '#3b4276' }}>{t('payBills.paymentSettings')}</h3>
                        
                        {/*Custom Selected Dropdown Trigger Wrapper*/}
                        <div className="space-y-2 relative">
                            <label className="text-xs font-bold text-slate-700 block">{t('payBills.selectMethod')}</label>
                            
                            <button
                                type="button"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="pay-bills-method-trigger btn-interactive focus-glow w-full min-h-[48px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between transition-all hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer box-border"
                            >
                                <div className="flex items-center space-x-3 text-slate-800 font-semibold text-sm">
                                    {currentMethodObj.isGcash ? (
                                        <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center font-black text-[9px] tracking-tighter select-none px-0.5">GCash</div>
                                    ) : (
                                        <FontAwesomeIcon icon={currentMethodObj.icon} className={`text-base ${currentMethodObj.color}`} />
                                    )}
                                    <span>{currentMethodObj.family === 'split' ? t('payBills.splitPayment') : currentMethodObj.label}</span>
                                </div>
                                <FontAwesomeIcon icon={faChevronDown} className={`text-slate-400 text-xs transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/*Custom Dropdown Selections Layer Menu*/}
                            {isDropdownOpen && paymentChannels.length > 0 && (
                                <div className="absolute top-full left-0 w-full bg-white border border-slate-100 shadow-xl rounded-xl mt-1 overflow-hidden z-50 py-1 box-border">
                                    {paymentChannels.map((method) => (
                                        <button
                                            key={method.id}
                                            type="button"
                                            onClick={() => handleMethodSelect(method.id)}
                                            className={`pay-bills-dropdown-item w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left transition-colors border-0 bg-transparent cursor-pointer font-medium text-sm ${selectedMethod === method.id ? 'bg-slate-50 text-indigo-600' : 'text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            <div className="flex items-center space-x-3 font-semibold">
                                                {method.isGcash ? (
                                                    <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center font-black text-[9px] tracking-tighter select-none px-0.5">GCash</div>
                                                ) : (
                                                    <FontAwesomeIcon icon={method.icon} className={`text-base ${method.color}`} />
                                                )}
                                                <span>{method.family === 'split' ? t('payBills.splitPayment') : method.label}</span>
                                            </div>
                                            {selectedMethod === method.id && (
                                                <FontAwesomeIcon icon={faCheckCircle} className="text-indigo-500 text-sm" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {currentMethodObj.family === 'manual' && (
                            <div className="space-y-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 text-left">
                                <div>
                                    <label htmlFor="pay-payment_reference" className="block text-xs font-bold text-slate-700 mb-1">
                                        {t('payBills.refNo')} <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        {...payForm.fieldA11y('payment_reference')}
                                        {...referenceInputProps(currentMethodObj.label)}
                                        autoComplete="off"
                                        value={paymentReference}
                                        onChange={e => {
                                            const gcash = (currentMethodObj.label || '').toLowerCase().includes('gcash');
                                            setPaymentReference(gcash ? e.target.value.replace(/\D/g, '') : e.target.value);
                                            payForm.clearError('payment_reference');
                                        }}
                                        onBlur={() => {
                                            const v = paymentReference.trim();
                                            setPaymentReference(v);
                                            if (v) payForm.validateField('payment_reference', { ...payValues, payment_reference: v });
                                        }}
                                        required
                                        className={`pay-bills-input w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500${invalidCls(payForm.errors.payment_reference)}`}
                                    />
                                    <FieldError id="pay-payment_reference" error={payForm.errors.payment_reference} />
                                </div>
                                <div>
                                    <label htmlFor="pay-proof" className="block text-xs font-bold text-slate-700 mb-1">
                                        {t('payBills.proofOfPayment')} <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        key={proofInputKey}
                                        type="file"
                                        {...payForm.fieldA11y('proof')}
                                        accept={acceptFor(FILE_RULES.paymentProof)}
                                        required
                                        onChange={e => {
                                            const file = e.target.files[0] || null;
                                            const fileError = checkFile(file, FILE_RULES.paymentProof);
                                            payForm.setFieldError('proof', fileError);
                                            if (fileError) { e.target.value = ''; setProofFile(null); return; }
                                            setProofFile(file);
                                        }}
                                        className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 min-h-[44px]"
                                    />
                                    <p className="text-[11px] text-slate-400 m-0 mt-1">{FILE_RULES.paymentProof.label}, up to {FILE_RULES.paymentProof.maxMB} MB.</p>
                                    <FieldError id="pay-proof" error={payForm.errors.proof} />
                                    <FileChip file={proofFile} onRemove={clearProof} />
                                </div>
                            </div>
                        )}

                        {currentMethodObj.family === 'split' && (
                            <SplitPaymentForm parts={splitParts} setParts={setSplitParts} total={splitTotal} showErrors={splitAttempted} fmtMoney={fmtMoney}
                                scheduledDate={scheduledDate} setScheduledDate={setScheduledDate} scheduledTimeSlot={scheduledTimeSlot} setScheduledTimeSlot={setScheduledTimeSlot} />
                        )}

                        {currentMethodObj.family === 'in_person' && (
                            <div className="space-y-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 text-left">
                                <div>
                                    <label htmlFor="pay-scheduled_date" className="block text-xs font-bold text-slate-700 mb-1">
                                        Schedule Date <span className="text-red-500">*</span>
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
                                        Time Slot <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        {...payForm.fieldA11y('scheduled_time_slot')}
                                        value={scheduledTimeSlot}
                                        onChange={e => { setScheduledTimeSlot(e.target.value); payForm.clearError('scheduled_time_slot'); }}
                                        className={`pay-bills-input w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500 cursor-pointer${invalidCls(payForm.errors.scheduled_time_slot)}`}
                                    >
                                        <option value="morning">Morning (9am-12pm)</option>
                                        <option value="afternoon">Afternoon (1pm-5pm)</option>
                                    </select>
                                    <FieldError id="pay-scheduled_time_slot" error={payForm.errors.scheduled_time_slot} />
                                </div>
                            </div>
                        )}

                        {/* Paying ahead is the one automatic payment there is:
                            prepaid months are paid from the advance when billed.
                            (Replaces an "Automatic Payment" checkbox that was
                            never saved or acted on.) */}
                        {(advance?.available || advance?.credits?.length > 0) && (
                            <div className="p-4 rounded-2xl border bg-slate-50/50 border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                                <div className="space-y-0.5">
                                    <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
                                        <FontAwesomeIcon icon={faCalendarPlus} className="text-indigo-400 text-xs" />
                                        <span>{prepaidCount > 0 ? t('payBills.prepaidCount').replace('{n}', prepaidCount) : t('payBills.payAhead')}</span>
                                    </div>
                                    <p className="text-slate-400 text-[11px] m-0 leading-relaxed font-medium">
                                        {prepaidCount > 0 ? t('payBills.prepaidDesc') : t('payBills.payAheadDesc')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => document.getElementById('pay-in-advance')?.scrollIntoView({ behavior: 'smooth' })}
                                    className="shrink-0 px-4 py-2 rounded-xl bg-white border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer hover:bg-indigo-50"
                                >
                                    {prepaidCount > 0 ? t('payBills.viewPrepaid') : t('payBills.payAheadBtn')}
                                </button>
                            </div>
                        )}

                        {/*Action Submission Execution Button Panel Layout*/}
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={handlePaymentExecution}
                                disabled={isPaying || (currentMethodObj.family === 'split' && !checkSplit(splitParts, splitTotal, scheduledDate).valid) || (payingGroup ? false : (!activeInv || isAwaiting))}
                                className="pay-bills-submit-btn btn-interactive focus-glow w-full min-h-[48px] bg-[#22c55e] hover:bg-[#16a34a] hover:scale-[1.02] active:scale-[0.98] text-white font-extrabold py-3.5 rounded-xl text-base transition-all duration-150 shadow-md border-0 cursor-pointer text-center flex items-center justify-center disabled:bg-slate-300 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                {isPaying ? 'Processing…' : payingGroup
                                    ? `${activeGroup.kind === 'bundle' ? 'Pay all' : 'Pay advance'} (${fmtMoney(activeGroup.total)})`
                                    : isAwaiting ? 'Awaiting confirmation' : t('payBills.proceedToPay')}
                            </button>
                        </div>

                    </div>
                </div>

                {/* Pay in advance: one payment credits N upcoming months; each
                    month is still billed on its usual date and paid from it. */}
                {(advance?.available || advance?.credits?.length > 0) && (
                    <div id="pay-in-advance" className="pay-bills-card bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 space-y-4 scroll-mt-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 text-lg">
                                <FontAwesomeIcon icon={faCalendarPlus} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold m-0" style={{ color: '#3b4276' }}>Pay in advance</h3>
                                <p className="text-xs text-slate-500 m-0 mt-0.5">
                                    Prepay upcoming months in one payment. Each month's rent invoice is still issued on your usual rent day and paid from your advance, with its own receipt.
                                </p>
                            </div>
                        </div>

                        {openAdvance ? (
                            openAdvance.payable ? (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <p className="text-sm text-slate-700 m-0">
                                        Advance payment ready: <strong>{advanceMonthsText}</strong> — <strong>{fmtMoney(openAdvance.total)}</strong>
                                    </p>
                                    <div className="flex gap-2 shrink-0">
                                        {activeGroup?.kind !== 'advance' && (
                                            <button
                                                type="button"
                                                onClick={() => { setPayingAdvance(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold border-0 cursor-pointer"
                                            >
                                                Pay now
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleCancelAdvance}
                                            disabled={advanceBusy}
                                            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold cursor-pointer hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            Cancel advance
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-600 m-0">
                                    Your advance payment for {advanceMonthsText} is awaiting confirmation (see above).
                                </p>
                            )
                        ) : advance?.available && advance.months?.length > 0 ? (
                            <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    <label htmlFor="advance-months" className="text-sm font-bold text-slate-700">Months to prepay</label>
                                    <select
                                        id="advance-months"
                                        value={Math.min(advanceCount, advance.months.length)}
                                        onChange={e => setAdvanceCount(Number(e.target.value))}
                                        className="pay-bills-input px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500 cursor-pointer"
                                    >
                                        {advance.months.map((m, i) => (
                                            <option key={m.period_start} value={i + 1}>{i + 1} month{i === 0 ? '' : 's'}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    {advance.months.slice(0, Math.min(advanceCount, advance.months.length)).map(m => (
                                        <div key={m.period_start} className="flex justify-between text-sm text-slate-600">
                                            <span>Rent — {m.billing_period} <span className="text-[11px] text-slate-400">({formatPeriodRange(m.period_start, m.period_end)})</span></span>
                                            <span className="font-bold text-slate-900">{fmtMoney(m.amount)}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-extrabold text-slate-800">
                                        <span>Total</span>
                                        <span className="text-indigo-600">
                                            {fmtMoney(advance.months.slice(0, Math.min(advanceCount, advance.months.length)).reduce((s, m) => s + m.amount, 0))}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCreateAdvance}
                                    disabled={advanceBusy}
                                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50"
                                >
                                    {advanceBusy ? 'Preparing…' : 'Continue to payment'}
                                </button>
                            </div>
                        ) : advance?.available ? (
                            <p className="text-sm text-slate-600 m-0">
                                There are no upcoming months left to prepay before your rent ends{advance.lease_end ? ` (${advance.lease_end})` : ''}.
                            </p>
                        ) : null}

                        {/* Months already paid in advance: waiting for their month, or billed and settled. */}
                        {advance?.credits?.length > 0 && (
                            <div className="border-t border-slate-100 pt-3 space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 m-0">Prepaid months</p>
                                {advance.credits.map(c => (
                                    <div key={`${c.advance_invoice_id}-${c.period_start}`} className="flex justify-between gap-3 text-sm text-slate-600">
                                        <span>
                                            Rent — {c.billing_period}
                                            <span className="block text-[11px] text-slate-400">
                                                {c.status === 'applied'
                                                    ? `Paid from advance · invoice ${c.applied_invoice_id}`
                                                    : `Credited · the month from ${formatDay(c.period_start)} is paid automatically when billed`}
                                            </span>
                                        </span>
                                        <span className={`font-bold shrink-0 ${c.status === 'applied' ? 'text-emerald-600' : 'text-indigo-600'}`}>{fmtMoney(c.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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