import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faHourglassHalf, faCheckCircle, faArrowRight, faArrowLeft,
    faWallet, faUniversity, faMoneyBillWave, faCheck, faFileContract, faUpload, faEye, faFilePdf, faQrcode
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { appReturnUrl, gatewayReturnParams } from '../api/env';
import fileUrl from '../api/fileUrl';
import { useLang, dateLocale } from '../config/i18n';
import SuccessModal from '../Components/SuccessModal';
import FileAlertModal from '../Components/FileAlertModal';
import InlineAlert from '../Components/InlineAlert';
import DocumentPreviewModal from '../Components/DocumentPreviewModal';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import FieldError from '../Components/form/FieldError';
import { formatFileSize } from '../Components/form/formHelpers';
import ReasonModal from '../Components/form/ReasonModal';
import { apiErrorMessage } from '../utils/apiError';
import { MOVE_IN_WINDOW_DEFAULT, checkMoveInDate, moveInBounds, moveInRangeText } from '../utils/validation';
import { getSystemSettings } from '../config/systemSettings';
import ApplicationStepper from '../Components/tenant/ApplicationStepper';
import { APPLICATION_STATUS_CHIP, applicationSteps, normalizeApplicationStatus } from '../utils/applicationSteps';
import '../assets/styles/responsive/user/track-application.responsive.css';

export default function TrackApplication() {
    const navigate = useNavigate();
    const { t } = useLang();
    const [loading, setLoading] = useState(true);
    const [application, setApplication] = useState(null);
    const [error, setError] = useState(null);
    const [paymentChannels, setPaymentChannels] = useState([]);
    const [channelsLoading, setChannelsLoading] = useState(true);
    const [selectedMethod, setSelectedMethod] = useState('');
    const [paying, setPaying] = useState(false);
    const [contractFile, setContractFile] = useState(null);
    const [uploadingContract, setUploadingContract] = useState(false);
    const [fileAlert, setFileAlert] = useState('');
    const [previewModal, setPreviewModal] = useState(null); // { url, title, isImage, isLocalBlob }
    // Back from a PayMongo checkout, the move-in invoice stays 'processing'
    // until the webhook lands; say so instead of an alert.
    const [notice, setNotice] = useState(() => (
        gatewayReturnParams().get('status') === 'success'
            ? { message: 'Payment sent', subtext: 'We are waiting for the payment gateway to confirm it. You will be notified once it is confirmed.' }
            : null
    ));

    // Inline messages that used to be alert(): the pay step's error, and the
    // result of a cancelled gateway checkout.
    const [payError, setPayError] = useState('');
    const [gatewayMessage, setGatewayMessage] = useState('');
    const [contractError, setContractError] = useState('');
    const [contractInputKey, setContractInputKey] = useState(0);
    const [cancelApplication, setCancelApplication] = useState(false);
    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
    const activeEmail = loggedInUser.email_address || '';

    const fetchApplication = useCallback(async () => {
        try {
            const res = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);
            setApplication(res.data.success ? res.data.data : null);
        } catch {
            setError('Unable to refresh your application. Please try again later.');
        }
    }, [activeEmail]);

    const confirmCancellation = async (reason) => {
        const res = await api.post('/cancel_application.php', { id: application.id, reason });
        if (!res.data.success) throw new Error(apiErrorMessage(res, 'Could not cancel the application.'));
        setCancelApplication(false);
        await fetchApplication();
    };

    const clearContractFile = () => {
        if (previewModal?.isLocalBlob && previewModal?.url) {
            URL.revokeObjectURL(previewModal.url);
        }
        setContractFile(null);
        setContractInputKey(k => k + 1); // remounts the file inputs, clearing them
    };

    const validateAndSetContractFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fileError = checkFile(file, FILE_RULES.pdf);
        setContractError(fileError);
        if (fileError) {
            e.target.value = '';
            setContractFile(null);
            setFileAlert(fileError);
            return;
        }
        setContractFile(file);
    };

    const openContractPreview = (file) => {
        if (!file) return;
        const isImage = file.type?.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);
        setPreviewModal({
            url: URL.createObjectURL(file),
            title: file.name || 'Signed Rent Contract',
            isImage,
            isLocalBlob: true
        });
    };

    const openSubmittedContractPreview = () => {
        if (!application?.signed_lease_path) return;
        const path = fileUrl(application.signed_lease_path);
        const isImage = /\.(png|jpe?g|webp|gif)$/i.test(application.signed_lease_path);
        setPreviewModal({
            url: path,
            title: 'Submitted Signed Contract',
            isImage,
            isLocalBlob: false
        });
    };

    const closePreviewModal = () => {
        if (previewModal?.isLocalBlob && previewModal?.url) {
            URL.revokeObjectURL(previewModal.url);
        }
        setPreviewModal(null);
    };

    const handleContractUpload = async (e) => {
        e?.preventDefault();
        if (uploadingContract) return;
        if (!contractFile) {
            setContractError("Please select the signed contract (PDF) to upload.");
            return;
        }
        setContractError('');
        setUploadingContract(true);
        try {
            const formData = new FormData();
            formData.append('file', contractFile);
            formData.append('rentApplicationId', application.id);
            formData.append('docType', 'signedLease');

            const res = await api.post('/upload_lease_document.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setNotice({
                    message: 'Rent Contract Uploaded',
                    subtext: 'Signed rent contract uploaded successfully! You may now proceed to initial payment.'
                });
                setApplication(prev => ({
                    ...prev,
                    signed_lease_path: res.data.filePath,
                    contract_id: res.data.contractId
                }));
                clearContractFile();
            } else {
                setContractError(res.data.message || "Failed to upload contract.");
            }
        } catch (err) {
            console.error("Contract upload error:", err);
            setContractError(apiErrorMessage(err, "Failed to upload contract. Please try again."));
        } finally {
            setUploadingContract(false);
        }
    };

    const handleInitialPayment = async (e) => {
        e.preventDefault();
        if (paying) return;
        setPayError('');
        if (!application?.signed_lease_path) {
            setPayError("Please upload your signed rent contract before proceeding to payment.");
            return;
        }
        if (!application?.pending_invoice_id) {
            setPayError("No pending invoice found.");
            return;
        }

        const currentMethodObj = paymentChannels.find(m => m.id === selectedMethod) || paymentChannels[0] || {};
        const totalAmount = parseFloat(application.pending_balance ?? application.pending_total_amount ?? (2 * parseFloat(application.monthly_rent || 0)));

        if (currentMethodObj.family === 'sandbox') {
            setPaying(true);
            try {
                const res = await api.post("/create_checkout_session.php", {
                    invoice_id: application.pending_invoice_id,
                    channel: currentMethodObj.id,
                    success_url: appReturnUrl('track-application', { status: 'success', invoice_id: application.pending_invoice_id }),
                    cancel_url: appReturnUrl('track-application', { status: 'cancelled', invoice_id: application.pending_invoice_id })
                });

                if (res.data.success && res.data.checkout_url) {
                    window.location.href = res.data.checkout_url;
                    return; // keep the button busy while the browser leaves
                }
                setPayError(res.data.message || "Failed to create checkout session.");
            } catch (error) {
                console.error("Error creating checkout session:", error);
                setPayError(apiErrorMessage(error, "Payment gateway error."));
            }
            setPaying(false);
            return;
        }

        if (currentMethodObj.family !== 'in_person') {
            navigate('/upload-payment', { 
                state: { 
                    invoiceId: application.pending_invoice_id, 
                    amount: totalAmount, 
                    paymentMethod: currentMethodObj.label,
                    returnUrl: '/track-application'
                } 
            });
            return;
        }

        setPaying(true);
        try {
            const res = await api.post("/pay_bill.php", {
                invoiceId: application.pending_invoice_id,
                paymentMethod: currentMethodObj.label
            });

            if (res.data.success) {
                setNotice({
                    message: 'Cash payment declared',
                    subtext: 'Please settle your payment at the management office. Your room details unlock once management confirms receipt, and you will be notified.',
                });
                // Refetch in place (this used to reload the whole page when the notice closed).
                await fetchApplication();
            } else {
                setPayError(res.data.message || "Failed to process payment.");
            }
        } catch (error) {
            console.error("Error submitting initial payment:", error);
            setPayError(apiErrorMessage(error, "Payment failed. Please try again."));
        } finally {
            setPaying(false);
        }
    };

    const [newDate, setNewDate] = useState('');
    const [submittingDate, setSubmittingDate] = useState(false);
    const [dateError, setDateError] = useState('');
    // Settings → Rental → Earliest / Latest Move-In Date (resubmit_date.php enforces it too).
    const [moveInWindow, setMoveInWindow] = useState(MOVE_IN_WINDOW_DEFAULT);
    const moveInLimits = moveInBounds(moveInWindow);
    useEffect(() => {
        let alive = true;
        getSystemSettings().then((s) => {
            if (alive) setMoveInWindow({ min: s.moveInMinDays ?? MOVE_IN_WINDOW_DEFAULT.min, max: s.moveInMaxDays || MOVE_IN_WINDOW_DEFAULT.max });
        }).catch(() => {});
        return () => { alive = false; };
    }, []);

    // Errors show under the date field; only a saved date opens the success notice.
    const handleResubmitDate = async () => {
        if (submittingDate) return;
        if (!newDate) {
            setDateError('Please select a new move-in date.');
            return;
        }
        // Same range as resubmit_date.php: a typed date gets past the picker's min.
        const rangeError = checkMoveInDate(newDate, moveInWindow);
        if (rangeError) {
            setDateError(rangeError);
            return;
        }
        setDateError('');
        setSubmittingDate(true);
        try {
            const res = await api.post('/resubmit_date.php', { id: application.id, preferred_move_in_date: newDate });
            if (res.data.success) {
                setNotice({ message: 'New date submitted', subtext: 'Management will review your new move-in date. You will be notified of their decision.' });
                setNewDate('');
                fetchApplication();
            } else {
                setDateError(apiErrorMessage(res, 'Failed to submit new date.'));
            }
        } catch (err) {
            setDateError(apiErrorMessage(err, 'Failed to submit new date.'));
        } finally {
            setSubmittingDate(false);
        }
    };

    useEffect(() => {
        const fetchApplicationStatus = async () => {
            if (!activeEmail) {
                setError("Please log in to track your application.");
                setLoading(false);
                return;
            }
            try {
                await fetchApplication();
            } catch (err) {
                console.error("Failed to fetch application status:", err);
                setError("Unable to connect to the server. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        const fetchChannels = async () => {
            setChannelsLoading(true);
            try {
                const res = await api.get('/get_payment_channels.php');
                if (res.data.success && res.data.channels) {
                    const mapped = res.data.channels.map(ch => {
                        let icon, color, isDigital;
                        if (ch.icon === 'gcash') { icon = faWallet; color = 'text-blue-600'; isDigital = true; }
                        else if (ch.icon === 'bank') { icon = faUniversity; color = 'text-indigo-600'; isDigital = true; }
                        else if (ch.icon === 'qr') { icon = faQrcode; color = 'text-indigo-600'; isDigital = true; }
                        else if (ch.icon === 'maya') { icon = faWallet; color = 'text-emerald-500'; isDigital = true; }
                        else { icon = faMoneyBillWave; color = 'text-emerald-600'; isDigital = false; }
                        
                        return { ...ch, icon, color, isDigital };
                    });
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
        fetchApplicationStatus();

        // Back from the gateway: /track-application?status=...&invoice_id=...
        const queryParams = gatewayReturnParams();
        if (queryParams.has('status')) {
            const status = queryParams.get('status');
            if (status === 'success') {
                // The "Payment sent" notice is set from the URL on first render.
                navigate('/track-application', { replace: true });
            } else if (status === 'cancelled') {
                // Hand the move-in invoice back to 'pending'. Without this it
                // stays in 'processing' and cannot be paid again.
                const invoiceId = queryParams.get('invoice_id');
                (async () => {
                    // Only the caller's own 'processing' bill is released; when nothing
                    // was (a typed URL, a second cancel), no message is shown.
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
                        ? "Payment was cancelled. You can choose a payment method and try again."
                        : "Payment was cancelled, but this payment could not be reopened. Please contact management to release it.");
                    navigate('/track-application', { replace: true });
                    fetchApplicationStatus();
                })();
            }
        }
    }, [activeEmail, fetchApplication, navigate]);

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50 text-slate-900">
                <div className="flex flex-col items-center gap-4" role="status">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-4xl text-indigo-700 animate-spin" aria-hidden="true" />
                    <p className="m-0 text-lg font-semibold">Loading your application…</p>
                </div>
            </div>
        );
    }

    const status = normalizeApplicationStatus(application?.status);
    const chip = APPLICATION_STATUS_CHIP[status];
    const steps = applicationSteps(application);
    const peso = (n) => `₱${(parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const dayLabel = (d) => (d ? new Date(String(d).length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString(dateLocale(), { month: 'long', day: 'numeric', year: 'numeric' }) : '');
    const roomLabel = application?.room_name ? `Room ${application.room_name}` : 'your room';
    const moveInBalance = application ? parseFloat(application.pending_balance ?? application.pending_total_amount ?? (2 * parseFloat(application.monthly_rent || 0))) : 0;
    // Cancelling is allowed only before moving in (cancel_application.php checks too).
    const canCancel = ['pending', 'action', 'approved'].includes(status);

    // Dark-page building blocks, so every card and button matches.
    const PANEL = 'bg-white border border-slate-200 rounded-2xl';
    const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold border-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    const BTN_QUIET = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold border border-slate-200 cursor-pointer transition-colors';
    const CHIP_TONE = {
        done: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        action: 'text-amber-700 bg-amber-50 border-amber-200',
        waiting: 'text-sky-700 bg-sky-50 border-sky-200',
        stopped: 'text-rose-700 bg-rose-50 border-rose-200',
        neutral: 'text-slate-700 bg-slate-100 border-slate-300',
    };

    // ── Step bodies: what opens under the current (or stopped) step ──

    const newDateBody = (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            {application?.rejection_reason && (
                <p className="m-0 mb-4 border-l-2 border-amber-200 pl-3 text-sm leading-relaxed text-amber-900">
                    {application.rejection_reason}
                </p>
            )}
            <label htmlFor="resubmit-date" className="block text-sm font-bold text-amber-800 mb-2">New move-in date</label>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <input
                    id="resubmit-date"
                    type="date"
                    value={newDate}
                    onChange={e => { setNewDate(e.target.value); setDateError(''); }}
                    min={moveInLimits.min}
                    max={moveInLimits.max}
                    aria-invalid={dateError ? true : undefined}
                    aria-describedby={dateError ? 'resubmit-date-error resubmit-date-hint' : 'resubmit-date-hint'}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-50 border border-amber-200 text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                />
                <button
                    type="button"
                    onClick={handleResubmitDate}
                    disabled={submittingDate}
                    className="min-h-[44px] px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold border-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submittingDate ? 'Sending…' : 'Send new date'}
                </button>
            </div>
            <p id="resubmit-date-hint" className="m-0 mt-2 text-sm text-amber-900">{moveInRangeText(moveInWindow)}</p>
            <FieldError id="resubmit-date" error={dateError} />
        </div>
    );

    const refundCard = application?.refund && (
        <div className={`rounded-xl p-4 border ${application.refund.status === 'Rejected' ? 'bg-rose-50 border-rose-200' : application.refund.status === 'Refunded' ? 'bg-emerald-50 border-emerald-200' : 'bg-sky-50 border-sky-200'}`}>
            <p className="m-0 text-sm font-bold text-slate-900">
                Refund of {peso(application.refund.amount)}: {application.refund.status}
            </p>
            <p className="m-0 mt-1 text-sm leading-relaxed text-slate-700">
                {application.refund.status === 'Rejected'
                    ? <>Management did not approve this refund{application.refund.decision_reason ? <>: <strong className="text-slate-900">{application.refund.decision_reason}</strong></> : '.'}</>
                    : application.refund.status === 'Refunded'
                    ? `Paid out via ${application.refund.payout_method}${application.refund.payout_reference ? ` (ref. ${application.refund.payout_reference})` : ''}.`
                    : 'Management is reviewing this refund. Open My Refunds to reply if they asked for more information.'}
            </p>
            <button type="button" onClick={() => navigate('/my-refunds')} className={`${BTN_QUIET} mt-3`}>View my refunds</button>
        </div>
    );

    const rejectedBody = (
        <div className="space-y-4">
            {(application?.rejection_reason || application?.rejection_attachment_path) && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <p className="m-0 text-sm font-bold text-rose-800">Reason</p>
                    {application.rejection_reason && (
                        <p className="m-0 mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{application.rejection_reason}</p>
                    )}
                    {application.rejection_attachment_path && (
                        application.rejection_attachment_path.toLowerCase().endsWith('.pdf') ? (
                            <a href={fileUrl(application.rejection_attachment_path)} target="_blank" rel="noopener noreferrer" className={`${BTN_QUIET} mt-3 no-underline`}>
                                <FontAwesomeIcon icon={faFilePdf} aria-hidden="true" /> Open the attached PDF
                            </a>
                        ) : (
                            <a href={fileUrl(application.rejection_attachment_path)} target="_blank" rel="noopener noreferrer" className="mt-3 block w-fit">
                                <img src={fileUrl(application.rejection_attachment_path)} alt="Attachment from management" className="max-h-56 max-w-full rounded-xl border border-rose-200 object-cover bg-slate-50" />
                                <span className="mt-1 block text-sm font-semibold text-rose-800 underline">Open the full image</span>
                            </a>
                        )
                    )}
                </div>
            )}
            {refundCard}
            <button type="button" onClick={() => navigate('/rent-application', { state: { editApplication: application } })} className={BTN_PRIMARY}>
                {t('trackApp.fixResubmit')} <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
            </button>
        </div>
    );

    const cancelledBody = (
        <div className="space-y-4">
            {refundCard}
            <button type="button" onClick={() => navigate('/preview')} className={BTN_PRIMARY}>
                Browse available rooms <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
            </button>
        </div>
    );

    // A picked contract file, before it is uploaded.
    const pickedContract = contractFile && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm">
            <span className="min-w-0 truncate text-slate-900" title={contractFile.name}>
                {contractFile.name} <span className="text-slate-600">({formatFileSize(contractFile.size)})</span>
            </span>
            <span className="flex items-center gap-3 shrink-0">
                <button type="button" onClick={() => openContractPreview(contractFile)} className="inline-flex items-center gap-1.5 bg-transparent border-0 p-0 text-sm font-semibold text-indigo-700 hover:text-indigo-700 cursor-pointer">
                    <FontAwesomeIcon icon={faEye} aria-hidden="true" /> Preview
                </button>
                <button type="button" onClick={clearContractFile} className="bg-transparent border-0 p-0 text-sm font-semibold text-rose-700 hover:text-rose-700 cursor-pointer">Remove</button>
            </span>
        </div>
    );

    const contractBody = (
        <div className="space-y-4">
            <button type="button" onClick={() => navigate('/view-contract')} className={BTN_QUIET}>
                <FontAwesomeIcon icon={faFileContract} aria-hidden="true" /> {t('trackApp.viewPrintContract')}
            </button>
            <form onSubmit={handleContractUpload} className="track-app-upload-form space-y-3" noValidate>
                <label htmlFor="contract-file" className="block text-sm font-bold text-slate-800">
                    Signed contract <span className="font-normal text-slate-600">(PDF, up to 5 MB)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <input
                        key={contractInputKey}
                        type="file"
                        id="contract-file"
                        name="file"
                        accept={acceptFor(FILE_RULES.pdf)}
                        aria-invalid={contractError ? true : undefined}
                        aria-describedby={contractError ? 'contract-file-error' : undefined}
                        onChange={validateAndSetContractFile}
                        className="flex-1 min-w-0 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2 file:mr-3 file:min-h-[36px] file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                    />
                    <button type="submit" disabled={!contractFile || uploadingContract} className={BTN_PRIMARY}>
                        <FontAwesomeIcon icon={uploadingContract ? faHourglassHalf : faUpload} className={uploadingContract ? 'animate-spin' : ''} aria-hidden="true" />
                        {uploadingContract ? 'Uploading…' : t('trackApp.uploadContract')}
                    </button>
                </div>
                {pickedContract}
                <FieldError id="contract-file" error={contractError} />
            </form>
        </div>
    );

    // The signed copy is on file: shown above the payment, with a way to replace it.
    const signedContractRow = application?.signed_lease_path && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <FontAwesomeIcon icon={faCheckCircle} aria-hidden="true" /> Your signed contract is on file.
                </p>
                <span className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={openSubmittedContractPreview} className={BTN_QUIET}>
                        <FontAwesomeIcon icon={faEye} aria-hidden="true" /> View
                    </button>
                    {/* The input stays focusable (sr-only, not hidden), so the label works from the keyboard. */}
                    <label className={`${BTN_QUIET} focus-within:ring-2 focus-within:ring-indigo-500`}>
                        {t('trackApp.reupload')}
                        <input
                            key={contractInputKey}
                            type="file"
                            id="contract-file"
                            name="file"
                            accept={acceptFor(FILE_RULES.pdf)}
                            aria-invalid={contractError ? true : undefined}
                            aria-describedby={contractError ? 'contract-file-error' : undefined}
                            className="sr-only"
                            onChange={validateAndSetContractFile}
                        />
                    </label>
                </span>
            </div>
            {contractFile && (
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="flex-1 min-w-0">{pickedContract}</div>
                    <button type="button" onClick={handleContractUpload} disabled={uploadingContract} className={BTN_PRIMARY}>
                        {uploadingContract ? 'Uploading…' : 'Upload new copy'}
                    </button>
                </div>
            )}
            <FieldError id="contract-file" error={contractError} />
        </div>
    );

    const paymentBody = (
        <div className="space-y-4">
            {signedContractRow}

            <dl className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">One month's advance rent</dt>
                    <dd className="m-0 font-semibold text-slate-900 tabular-nums">{peso(application?.pending_base_rent || application?.monthly_rent)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Security deposit (one month)</dt>
                    <dd className="m-0 font-semibold text-slate-900 tabular-nums">{peso(application?.pending_security_deposit || application?.monthly_rent)}</dd>
                </div>
                {Number(application?.pending_amount_paid) > 0 && (
                    <div className="flex justify-between gap-3">
                        <dt className="text-slate-600">Paid so far</dt>
                        <dd className="m-0 font-semibold text-emerald-700 tabular-nums">−{peso(application.pending_amount_paid)}</dd>
                    </div>
                )}
                <div className="flex justify-between gap-3 border-t border-slate-200 pt-3">
                    <dt className="font-bold text-slate-900">{Number(application?.pending_amount_paid) > 0 ? 'Balance to pay' : 'Total to pay'}</dt>
                    <dd className="m-0 text-xl font-extrabold text-indigo-800 tabular-nums">{peso(moveInBalance)}</dd>
                </div>
            </dl>

            {application?.pending_invoice_status !== 'pending-verification' && application?.pending_rejection_reason && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-relaxed text-slate-800">
                    <strong className="text-rose-800">Payment returned.</strong> Management returned your payment: <strong className="text-slate-900">{application.pending_rejection_reason}</strong>. Please pay again below.
                </div>
            )}

            {application?.pending_invoice_status === 'pending-verification' ? (
                <p className="m-0 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-relaxed text-slate-800">
                    Your payment {application.pending_payment_method ? <>by <strong className="text-slate-900">{application.pending_payment_method}</strong> </> : ''}is being verified by management. This step completes by itself once they confirm it, and you will be notified.
                </p>
            ) : application?.pending_payment_method === 'Cash on Hand' ? (
                <p className="m-0 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-slate-800">
                    Please pay <strong className="text-slate-900">{peso(moveInBalance)}</strong> in cash at the management office. This step completes once management records it, and you will be notified.
                </p>
            ) : (
                <>
                    <fieldset className="p-0 border-0 min-w-0">
                        <legend className="mb-2 p-0 text-sm font-bold text-slate-800">Payment method</legend>
                        <div className="track-app-payment-methods grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {channelsLoading ? (
                                <p className="m-0 text-sm text-slate-600">Loading payment methods…</p>
                            ) : paymentChannels.length > 0 ? paymentChannels.map((method) => {
                                const chosen = selectedMethod === method.id;
                                return (
                                    <button
                                        key={method.id}
                                        type="button"
                                        aria-pressed={chosen}
                                        onClick={() => { setSelectedMethod(method.id); setPayError(''); }}
                                        className={`flex items-center justify-between gap-3 min-h-[48px] px-4 rounded-xl border text-sm font-semibold text-left cursor-pointer transition-colors ${chosen ? 'bg-indigo-50 border-indigo-300 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                                    >
                                        <span className="flex items-center gap-3">
                                            <FontAwesomeIcon icon={method.icon} className={chosen ? 'text-indigo-800' : 'text-slate-600'} aria-hidden="true" />
                                            {method.label}
                                        </span>
                                        {chosen && <FontAwesomeIcon icon={faCheck} className="text-indigo-800" aria-hidden="true" />}
                                    </button>
                                );
                            }) : (
                                <div className="sm:col-span-2 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                                    <strong>Payment options currently unavailable.</strong> Apartment management has disabled all payment channels. Please contact management for assistance.
                                </div>
                            )}
                        </div>
                    </fieldset>
                    <InlineAlert onDismiss={() => setPayError('')}>{payError}</InlineAlert>
                    <button type="button" onClick={handleInitialPayment} disabled={paying || paymentChannels.length === 0} className={`${BTN_PRIMARY} w-full sm:w-auto min-h-[48px] text-base`}>
                        {paying ? 'Processing…' : `Pay ${peso(moveInBalance)}`}
                    </button>
                </>
            )}
        </div>
    );

    const moveInBody = (
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/view-contract')} className={BTN_QUIET}>
                <FontAwesomeIcon icon={faFileContract} aria-hidden="true" /> {t('trackApp.viewContract')}
            </button>
        </div>
    );

    const bodies = {
        review: status === 'action' ? newDateBody : status === 'rejected' ? rejectedBody : status === 'cancelled' ? cancelledBody : null,
        contract: contractBody,
        payment: status === 'cancelled' ? cancelledBody : paymentBody,
        movein: status === 'cancelled' ? cancelledBody : moveInBody,
    };

    return (
        <div className="track-app-root w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start box-border py-8 sm:py-10 px-4 md:px-12 text-left">
            <div className="w-full max-w-5xl z-10 relative flex flex-col gap-6">
                <button
                    type="button"
                    onClick={() => navigate('/home')}
                    className="self-start inline-flex items-center gap-2 min-h-[44px] bg-transparent border-0 p-0 text-sm font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
                >
                    <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" /> {t('trackApp.backHome')}
                </button>

                <header className="track-app-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-slate-200 pb-5">
                    <div>
                        <h1 className="m-0 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">{t('trackApp.heading')}</h1>
                        <p className="m-0 mt-2 text-sm sm:text-base text-slate-600">
                            {application
                                ? <>Rent application for {roomLabel}{application.created_at ? <>, sent {dayLabel(application.created_at)}</> : null}</>
                                : t('trackApp.subtext')}
                        </p>
                    </div>
                    {application && (
                        <span className={`self-start sm:self-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-bold ${CHIP_TONE[chip.tone]}`}>
                            <span aria-hidden="true" className="w-2 h-2 rounded-full bg-current" />
                            {chip.label}
                        </span>
                    )}
                </header>

                {error && <InlineAlert>{error}</InlineAlert>}
                <InlineAlert tone="info" onDismiss={() => setGatewayMessage('')}>{gatewayMessage}</InlineAlert>

                {!application ? (
                    /* No application yet: an invitation, not a dead end. */
                    <section className={`${PANEL} p-8 sm:p-10 text-center max-w-xl mx-auto`}>
                        <h2 className="m-0 text-2xl font-bold text-slate-900">You haven't applied for a room yet</h2>
                        <p className="m-0 mt-2 text-sm sm:text-base leading-relaxed text-slate-600">
                            Choose an available room and send your application. You can follow every step here afterwards.
                        </p>
                        <button type="button" onClick={() => navigate('/preview')} className={`${BTN_PRIMARY} mt-6`}>
                            Browse available rooms <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                        </button>
                    </section>
                ) : steps.length === 0 ? (
                    /* A tenancy that is ending or has ended: no application steps left. */
                    <section className={`${PANEL} p-6 sm:p-8 space-y-4`}>
                        {status === 'pending-move-out' ? (
                            <>
                                <h2 className="text-xl font-bold text-slate-900">You've given notice to move out</h2>
                                <p className="text-sm sm:text-base leading-relaxed text-slate-600">
                                    {application.requested_move_out_date
                                        ? <>Your move-out date is <strong className="text-slate-900">{dayLabel(application.requested_move_out_date)}</strong>. </>
                                        : null}
                                    Management will contact you about the room inspection and your deposit.
                                </p>
                                <button type="button" onClick={() => navigate('/my-room')} className={BTN_PRIMARY}>
                                    See your move-out notice <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                                </button>
                            </>
                        ) : (
                            <>
                                <h2 className="text-xl font-bold text-slate-900">Your tenancy has ended</h2>
                                <p className="text-sm sm:text-base leading-relaxed text-slate-600">
                                    Your rent for {roomLabel} has ended and the room clearance is complete. You can apply for a room again whenever you are ready.
                                </p>
                                <button type="button" onClick={() => navigate('/preview')} className={BTN_PRIMARY}>
                                    Browse available rooms <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                                </button>
                            </>
                        )}
                    </section>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
                        <section aria-label="Application progress" className={`${PANEL} p-5 sm:p-7`}>
                            <ApplicationStepper steps={steps} bodies={bodies} />
                            {status === 'active' && (
                                <button type="button" onClick={() => navigate('/my-room')} className={`${BTN_PRIMARY} mt-6`}>
                                    {t('trackApp.proceedRoom')} <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                                </button>
                            )}
                        </section>

                        <aside className={`${PANEL} p-5 sm:p-6`}>
                            <h2 className="m-0 text-base font-bold text-slate-900">Your rent details</h2>
                            <dl className="m-0 mt-4 space-y-3 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-slate-600">Room</dt>
                                    <dd className="m-0 font-semibold text-slate-900">{application.room_name ? `Room ${application.room_name}` : '—'}{application.room_type ? `, ${application.room_type}` : ''}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-slate-600">Monthly rent</dt>
                                    <dd className="m-0 font-semibold text-slate-900 tabular-nums">{peso(application.monthly_rent)}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-slate-600">Rent term</dt>
                                    <dd className="m-0 font-semibold text-slate-900">{application.months_of_rent} month{Number(application.months_of_rent) === 1 ? '' : 's'}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-slate-600">Occupants</dt>
                                    <dd className="m-0 font-semibold text-slate-900">{application.occupants} {Number(application.occupants) === 1 ? 'person' : 'people'}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-slate-600">Preferred move-in</dt>
                                    <dd className="m-0 font-semibold text-slate-900 text-right">{application.preferred_move_in_date ? dayLabel(application.preferred_move_in_date) : 'As soon as possible'}</dd>
                                </div>
                            </dl>
                            {canCancel && (
                                <div className="mt-5 border-t border-slate-200 pt-4">
                                    <button type="button" onClick={() => setCancelApplication(true)} className="min-h-[44px] bg-transparent border-0 p-0 text-sm font-semibold text-rose-700 hover:text-rose-700 cursor-pointer underline-offset-2 hover:underline">
                                        Cancel application
                                    </button>
                                    <p className="m-0 mt-1 text-sm text-slate-600">Possible until you move in.</p>
                                </div>
                            )}
                        </aside>
                    </div>
                )}
            </div>

            <SuccessModal
                isOpen={!!notice}
                onClose={() => setNotice(null)}
                message={notice?.message}
                subtext={notice?.subtext}
            />
            {cancelApplication && (
                <ReasonModal
                    title="Cancel application"
                    description="You can cancel only before you move in. If payment was made, management will contact you about any refund."
                    label="Reason for cancelling"
                    confirmLabel="Cancel application"
                    suggestions={['Change of mind', 'Found another place', 'Financial reasons', 'Other']}
                    onConfirm={confirmCancellation}
                    onClose={() => setCancelApplication(false)}
                />
            )}

            {/* Modal Alert for file size / format violations */}
            <FileAlertModal
                isOpen={!!fileAlert}
                message={fileAlert}
                onClose={() => setFileAlert('')}
            />

            {/* Document / Contract Preview Modal */}
            <DocumentPreviewModal
                isOpen={!!previewModal}
                onClose={closePreviewModal}
                title={previewModal?.title || 'Contract Document'}
                fileUrl={previewModal?.url}
                isImage={previewModal?.isImage}
            />
        </div>
    );
}
