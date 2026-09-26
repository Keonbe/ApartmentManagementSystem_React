import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faUniversity, faMoneyBillWave, faChevronDown, faCheckCircle, faCreditCard, faCheck, faHistory, faExclamationTriangle, faClock, faCalendarAlt, faHourglassHalf, faTimesCircle } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { appReturnBase } from '../api/env';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../config/i18n';
import SuccessModal from '../Components/SuccessModal';
import useInvoiceWatch, { AWAITING_STATUSES, PAYABLE_STATUSES } from '../hooks/useInvoiceWatch';
import { checkDate, checkPaymentReference, localDateString, LIMITS } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import '../assets/styles/responsive/user/pay-bills.responsive.css';

export default function PayBills() {
    const navigate = useNavigate();
    const { t } = useLang();
    const [selectedMethod, setSelectedMethod] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isAutoPayEnabled, setIsAutoPayEnabled] = useState(false);
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
        /[?&]status=success\b/.test(window.location.hash)
            ? {
                message: 'Payment sent',
                subtext: 'We are waiting for the payment gateway to confirm it. This page updates by itself, and you will also get a notification.',
            }
            : null
    ));

    const handleTransitions = (events) => {
        const confirmed = events.filter(e => e.type === 'confirmed');
        if (confirmed.length > 0) {
            const first = confirmed[0].invoice;
            const total = confirmed.reduce((sum, e) => sum + (parseFloat(e.invoice.total_amount) || 0), 0);
            setNotice({
                message: 'Payment confirmed',
                subtext: confirmed.length === 1
                    ? `Management confirmed your payment of ₱${total.toLocaleString(undefined, { minimumFractionDigits: 2 })} for ${first.billing_period || `invoice ${first.id}`}. Your receipt is ready.`
                    : `Management confirmed ${confirmed.length} payments totalling ₱${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}. A receipt for each month is ready.`,
                action: { label: 'View receipt', onClick: () => navigate('/payment-history', { state: { receiptId: first.id } }) },
            });
        }
        // A rejection or a declined checkout shows as a banner on the bill itself.
    };

    const { invoices, loaded, refresh } = useInvoiceWatch({ onTransition: handleTransitions });

    // The bill on screen: the earliest-due invoice the tenant still has to pay;
    // failing that, the earliest one awaiting confirmation (shown read-only).
    const byDueDate = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''));
    const payableInvoices = invoices.filter(i => PAYABLE_STATUSES.includes(i.status) && !i.payment_group).sort(byDueDate);
    const awaitingInvoices = invoices.filter(i => AWAITING_STATUSES.includes(i.status)).sort(byDueDate);
    const activeInv = payableInvoices[0] || awaitingInvoices[0] || null;

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
        status: activeInv?.status || 'pending',
        rejectionReason: activeInv?.proof_rejection_reason || '',
        scheduledDate: activeInv?.scheduled_date || '',
        scheduledTimeSlot: activeInv?.scheduled_time_slot || '',
    };
    const isAwaiting = AWAITING_STATUSES.includes(billDetails.status);
    const fmtMoney = (n) => `₱${(parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

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
                        let icon, color, isDigital;
                        if (ch.icon === 'gcash') { icon = faWallet; color = 'text-blue-600'; isDigital = true; }
                        else if (ch.icon === 'bank') { icon = faUniversity; color = 'text-indigo-600'; isDigital = true; }
                        else if (ch.icon === 'qr') { icon = faMoneyBillWave; color = 'text-blue-500'; isDigital = true; }
                        else if (ch.icon === 'maya') { icon = faWallet; color = 'text-emerald-500'; isDigital = true; }
                        else { icon = faMoneyBillWave; color = 'text-emerald-600'; isDigital = false; }
                        
                        return { ...ch, icon, color, isDigital };
                    });
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

        // HashRouter: the gateway's return query sits after the hash (#/pay-bills?status=...).
        const hash = window.location.hash;
        if (hash.includes('?')) {
            const queryParams = new URLSearchParams(hash.split('?')[1]);
            const status = queryParams.get('status');
            if (status === 'success') {
                // The "Payment sent" notice is set from the URL on first render.
                navigate('/pay-bills', { replace: true });
            } else if (status === 'cancelled') {
                // Hand the invoice back to 'pending'/'overdue'. Without this it
                // stays in 'processing' and becomes unpayable.
                const invoiceId = queryParams.get('invoice_id');
                (async () => {
                    if (invoiceId) {
                        try {
                            await api.post('/release_checkout_session.php', { invoice_id: invoiceId });
                        } catch (err) {
                            console.error('Failed to release the cancelled payment session:', err);
                        }
                    }
                    alert("Payment was cancelled.");
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
        {/*Block enrollment if not digital*/}
        const methodObj = paymentChannels.find(m => m.id === methodId);
        if (methodObj && !methodObj.isDigital) {
            setIsAutoPayEnabled(false);
        }
    };

    const [paymentReference, setPaymentReference] = useState('');
    const [proofFile, setProofFile] = useState(null);

    const handlePaymentExecution = async (e) => {
        e.preventDefault();
        if (!billDetails.invoiceId) {
            alert("No pending invoice found.");
            return;
        }
        if (isAwaiting) {
            alert("This bill already has a payment awaiting confirmation.");
            return;
        }

        if (currentMethodObj.family === 'in_person') {
            const dateError = checkDate(scheduledDate, { min: localDateString(), label: 'Schedule date' });
            if (dateError) { alert(dateError); return; }
            try {
                const res = await api.post("/schedule_payment.php", {
                    invoice_id: billDetails.invoiceId,
                    scheduled_date: scheduledDate,
                    scheduled_time_slot: scheduledTimeSlot
                });
                if (res.data.success) {
                    await refresh();
                    setNotice({
                        message: 'Payment scheduled',
                        subtext: `Please pay at the admin office on ${scheduledDate} (${scheduledTimeSlot}). You will be notified once management records your payment.`,
                    });
                } else {
                    alert(res.data.message);
                }
            } catch (error) {
                console.error(error);
                alert(apiErrorMessage(error, "Failed to schedule payment."));
            }
            return;
        }

        if (currentMethodObj.family === 'sandbox') {
            try {
                const returnBase = appReturnBase();
                const res = await api.post("/create_checkout_session.php", {
                    invoice_id: billDetails.invoiceId,
                    channel: currentMethodObj.id,
                    success_url: `${returnBase}#/pay-bills?status=success&invoice_id=${encodeURIComponent(billDetails.invoiceId)}`,
                    cancel_url: `${returnBase}#/pay-bills?status=cancelled&invoice_id=${encodeURIComponent(billDetails.invoiceId)}`
                });
                
                if (res.data.success && res.data.checkout_url) {
                    window.location.assign(res.data.checkout_url);
                } else {
                    alert(res.data.message || "Failed to create checkout session.");
                }
            } catch (error) {
                console.error("Error creating checkout session:", error);
                const msg = error?.response?.data?.message || "Payment gateway error.";
                alert(msg);
            }
            return;
        }

        // Manual (GCash / bank) payments need a reference and a proof: pay_bill.php
        // refuses a non-cash payment until upload_payment_proof.php has stored one.
        const referenceError = checkPaymentReference(paymentReference, currentMethodObj.label);
        if (referenceError) { alert(referenceError); return; }
        const proofError = proofFile ? checkFile(proofFile, FILE_RULES.paymentProof) : 'Please attach your proof of payment.';
        if (proofError) { alert(proofError); return; }

        let proofPath;
        const formData = new FormData();
        formData.append('invoice_id', billDetails.invoiceId);
        formData.append('payment_reference', paymentReference);
        formData.append('payment_method', currentMethodObj.label);
        formData.append('proof', proofFile);

        try {
            const uploadRes = await api.post('/upload_payment_proof.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (!uploadRes.data.success) {
                alert(apiErrorMessage(uploadRes, "Payment proof could not be uploaded."));
                return;
            }
            proofPath = uploadRes.data.proof_path;
        } catch (err) {
            // Without a stored proof pay_bill.php would refuse anyway, so stop
            // here and say why instead of sending a request that must fail (L8).
            console.error("Proof upload failed:", err);
            alert(apiErrorMessage(err, "Payment proof could not be uploaded."));
            return;
        }

        try {
            const res = await api.post("/pay_bill.php", {
                invoiceId: billDetails.invoiceId,
                paymentMethod: currentMethodObj.label,
                paymentReference: paymentReference,
                proofOfPaymentPath: proofPath
            });

            if (res.data.success) {
                setPaymentReference('');
                setProofFile(null);
                await refresh();
                setNotice({
                    message: 'Payment submitted',
                    subtext: `Your ${currentMethodObj.label} payment is awaiting verification by management. This page updates by itself, and you will be notified once it is confirmed.`,
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
                {awaitingInvoices.map(inv => (
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

                {loaded && !activeInv && (
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
                )}

                {/* Due Date & Overdue Reminder Banner (not while a payment awaits confirmation) */}
                {dueStatus && !isAwaiting && (
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
                                        Your payment of <strong>₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> for {billDetails.billingPeriod} was due on <strong>{dueStatus.formattedDate}</strong>. Please settle your bill immediately to avoid late fees and service interruptions.
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

                {/*Main Workspace Content Segment Panel*/}
                <div className="stagger-children grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-start">

                    {/*Left Grid Parameter Block: Billing Items Statement Breakdown Ledger*/}
                    <div className="pay-bills-card card-interactive md:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-lg font-bold m-0" style={{ color: '#3b4276' }}>{t('payBills.statementLedger')}</h3>
                                {billDetails.dueDate && (
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
                                    {currentMethodObj.id === 'gcash' ? (
                                        <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center font-black text-[9px] tracking-tighter select-none px-0.5">GCash</div>
                                    ) : (
                                        <FontAwesomeIcon icon={currentMethodObj.icon} className={`text-base ${currentMethodObj.color}`} />
                                    )}
                                    <span>{currentMethodObj.label}</span>
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
                                                {method.icon === 'gcash' ? (
                                                    <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center font-black text-[9px] tracking-tighter select-none px-0.5">GCash</div>
                                                ) : (
                                                    <FontAwesomeIcon icon={method.icon} className={`text-base ${method.color}`} />
                                                )}
                                                <span>{method.label}</span>
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
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        {t('payBills.refNo')}
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. 1002 9382 1823"
                                        value={paymentReference}
                                        onChange={e => setPaymentReference(e.target.value)}
                                        maxLength={LIMITS.paymentReference}
                                        required
                                        className="pay-bills-input w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        {t('payBills.proofOfPayment')}
                                    </label>
                                    <input 
                                        type="file" 
                                        accept={acceptFor(FILE_RULES.paymentProof)}
                                        required
                                        onChange={e => {
                                            const file = e.target.files[0] || null;
                                            const fileError = checkFile(file, FILE_RULES.paymentProof);
                                            if (fileError) { alert(fileError); e.target.value = ''; setProofFile(null); return; }
                                            setProofFile(file);
                                        }}
                                        className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 min-h-[44px]"
                                    />
                                </div>
                            </div>
                        )}

                        {currentMethodObj.family === 'in_person' && (
                            <div className="space-y-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 text-left">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Schedule Date
                                    </label>
                                    <input 
                                        type="date" 
                                        value={scheduledDate}
                                        onChange={e => setScheduledDate(e.target.value)}
                                        className="pay-bills-input w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500"
                                        min={localDateString()}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Time Slot
                                    </label>
                                    <select 
                                        value={scheduledTimeSlot}
                                        onChange={e => setScheduledTimeSlot(e.target.value)}
                                        className="pay-bills-input w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500 cursor-pointer"
                                    >
                                        <option value="morning">Morning (9am-12pm)</option>
                                        <option value="afternoon">Afternoon (1pm-5pm)</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/*Polished Automatic Subscriptions Selection Box with Custom Transparent Checkbox*/}
                        <div className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between ${currentMethodObj.isDigital ? 'bg-slate-50/50 border-slate-100 opacity-100' : 'bg-slate-50/30 border-slate-100/50 opacity-40 select-none pointer-events-none'}`}>
                            <div className="space-y-0.5 pr-4 text-left">
                                <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
                                    <FontAwesomeIcon icon={faCreditCard} className="text-slate-400 text-xs" />
                                    <span>{t('payBills.autoPay')}</span>
                                </div>
                                <p className="text-slate-400 text-[11px] m-0 leading-relaxed font-medium">
                                    {t('payBills.autoPayDesc')}
                                </p>
                            </div>

                            {/*Custom Blueprint-Compliant Checkbox Box Element Layer Context*/}
                            <label className={`relative flex items-center justify-center w-6 h-6 rounded-md border-2 bg-transparent transition-all flex-shrink-0 ${!currentMethodObj.isDigital ? 'border-slate-300 cursor-not-allowed' : 'border-indigo-500 cursor-pointer'}`}>
                                <input
                                    type="checkbox"
                                    checked={isAutoPayEnabled}
                                    disabled={!currentMethodObj.isDigital}
                                    onChange={(e) => setIsAutoPayEnabled(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`w-full h-full rounded-[4px] bg-indigo-600 flex items-center justify-center text-white text-[10px] transition-transform duration-150 ${isAutoPayEnabled ? 'scale-100' : 'scale-0'}`}>
                                    <FontAwesomeIcon icon={faCheck} />
                                </div>
                            </label>
                        </div>

                        {/*Action Submission Execution Button Panel Layout*/}
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={handlePaymentExecution}
                                disabled={!activeInv || isAwaiting}
                                className="pay-bills-submit-btn btn-interactive focus-glow w-full min-h-[48px] bg-[#22c55e] hover:bg-[#16a34a] hover:scale-[1.02] active:scale-[0.98] text-white font-extrabold py-3.5 rounded-xl text-base transition-all duration-150 shadow-md border-0 cursor-pointer text-center flex items-center justify-center disabled:bg-slate-300 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                {isAwaiting ? 'Awaiting confirmation' : t('payBills.proceedToPay')}
                            </button>
                        </div>

                    </div>
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