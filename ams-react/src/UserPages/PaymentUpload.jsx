import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCloudUploadAlt, faHourglassHalf, faCheckCircle, faTimesCircle, faUndo, faEye, faExpand, faDownload, faFilePdf } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { publicAssetUrl } from '../api/fileUrl';
import { useLang } from '../config/i18n';
import SuccessModal from '../Components/SuccessModal';
import FileAlertModal from '../Components/FileAlertModal';
import DocumentPreviewModal from '../Components/DocumentPreviewModal';
import QrPreviewModal from '../Components/QrPreviewModal';
import { LIMITS, checkPaymentReference, checkText, isBankMethod } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { invalidCls, formatFileSize } from '../Components/form/formHelpers';
import { fetchContractTemplate, accountsForMethod } from '../Components/contract/contractTemplate';
import '../assets/styles/responsive/user/payment-upload.responsive.css';
import { Bone, SkeletonPage } from '../Components/tenant/Skeleton';

const INPUT_CLS = "focus-glow w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base sm:text-sm outline-none text-slate-800 focus:border-indigo-500 transition-colors box-border shadow-sm";
const BANKS = ['BDO', 'BPI', 'Metrobank', 'Landbank', 'RCBC', 'UnionBank', 'Security Bank', 'Maya Bank', 'Other'];

// The bill being paid arrives as navigation state, which a refresh loses: it is
// kept for the tab in sessionStorage and cleared once the proof is sent.
const SESSION_KEY = 'paymentUploadSession';
const readSession = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') || {}; } catch { return {}; }
};

const getQrTitle = (label) => {
    if (!label || /^qr\s*ph(\s*slot\s*\d+)?$/i.test(label.trim()) || /^slot\s*\d+$/i.test(label.trim())) {
        return 'QR Ph (Scan to Pay)';
    }
    return label.replace(/\s*\(?slot\s*\d+\)?/i, '').trim() || 'QR Ph (Scan to Pay)';
};

export default function PaymentUpload() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useLang();
    const [state] = useState(() => {
        const fromNav = location.state || {};
        if (fromNav.invoiceId) {
            try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(fromNav)); } catch { /* storage blocked: refresh just won't restore */ }
            return fromNav;
        }
        return readSession();
    });
    // From Pay Bills also: partAmount (paying part of one bill now; null = the
    // whole balance) and billLabel (what is being paid, e.g. "Rent — December 2026").
    const { invoiceId, amount, paymentMethod, returnUrl, partAmount, billLabel } = state;
    // paymentMethod is the channel label, e.g. 'GCash (Manual)' or 'BPI (Manual)'.
    const isGcash = /gcash/i.test(paymentMethod || '');
    const isBankTransfer = isBankMethod(paymentMethod);
    const isQrPh = /qr/i.test(paymentMethod || '');
    const [qrData, setQrData] = useState(null);
    const [channelChecking, setChannelChecking] = useState(true);
    const [channelDisabled, setChannelDisabled] = useState(false);
    const [channelDisabledMessage, setChannelDisabledMessage] = useState('');

    const [senderName, setSenderName] = useState('');
    const [referenceNo, setReferenceNo] = useState('');
    const [bankName, setBankName] = useState('');
    const [proofImage, setProofImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [fileAlert, setFileAlert] = useState('');
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    // Landlord's GCash/bank accounts, edited in Admin → Edit Contract.
    const [accounts, setAccounts] = useState([]);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    // Keys match upload_payment_proof.php's form fields.
    const form = useFieldErrors({
        // Account names can be joint or business names, so free text, not a person-name check.
        sender_name: (v) => checkText(v, { label: t('paymentUpload.senderNameLabel'), max: LIMITS.senderName }),
        payment_reference: (v) => checkPaymentReference(v, paymentMethod),
        proof: (f) => (f ? checkFile(f, FILE_RULES.paymentProof) : t('paymentUpload.errProof')),
    }, { idPrefix: 'upload-' });

    useEffect(() => {
        let isMounted = true;
        api.get('/get_payment_channels.php')
            .then((res) => {
                if (!isMounted) return;
                const channels = res.data?.channels || [];
                let isChannelActive = false;
                if (isQrPh) {
                    const qrCh = channels.find(c => c.icon === 'qr' || c.id === 'qrph_manual');
                    if (qrCh) {
                        isChannelActive = true;
                        if (qrCh.qr_data) setQrData(qrCh.qr_data);
                    }
                } else if (isGcash) {
                    isChannelActive = channels.some(c => c.family === 'manual' && /gcash/i.test(c.label || c.id));
                } else if (isBankTransfer) {
                    const norm = (paymentMethod || '').toLowerCase();
                    isChannelActive = channels.some(c => {
                        if (c.family !== 'manual') return false;
                        if (norm.includes('bdo') && /bdo/i.test(c.label || c.id)) return true;
                        if (norm.includes('bpi') && /bpi/i.test(c.label || c.id)) return true;
                        return /bank/i.test(c.label || c.id);
                    });
                } else {
                    isChannelActive = channels.some(c => (c.label === paymentMethod || c.id === paymentMethod) && c.family === 'manual');
                }

                if (!isChannelActive) {
                    setChannelDisabled(true);
                    setChannelDisabledMessage(`The selected payment method (${paymentMethod || 'Manual payment'}) is currently disabled or unavailable.`);
                }
                setChannelChecking(false);
            })
            .catch((err) => {
                console.error('Failed to load payment channels:', err);
                if (isMounted) setChannelChecking(false);
            });

        if (!isQrPh) {
            fetchContractTemplate()
                .then((res) => {
                    if (isMounted) setAccounts(accountsForMethod(res?.template?.payment_accounts, paymentMethod));
                })
                .catch((err) => console.error('Failed to load payment accounts:', err));
        }

        return () => {
            isMounted = false;
        };
    }, [paymentMethod, isQrPh, isGcash, isBankTransfer]);

    if (!invoiceId) {
        // Reached without choosing a bill (a bookmark, or the proof was already sent).
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50 px-4">
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-bold text-slate-800 m-0">{t('paymentUpload.noBillTitle')}</h2>
                    <p className="m-0 mt-2 text-sm text-slate-600">{t('paymentUpload.noBillBody')}</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                        <button type="button" onClick={() => navigate('/pay-bills')} className="min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 rounded-xl cursor-pointer border-0">{t('utilities.goPayBills')}</button>
                        <button type="button" onClick={() => navigate('/track-application')} className="min-h-[44px] bg-white border border-slate-300 text-slate-700 text-sm font-semibold px-5 rounded-xl cursor-pointer hover:bg-slate-50">{t('nav.trackApp')}</button>
                    </div>
                </div>
            </div>
        );
    }

    if (channelChecking) {
        return (
            <SkeletonPage label="Verifying payment method…" maxWidth="max-w-2xl">
                <div aria-hidden="true" className="rounded-3xl border border-slate-200 bg-white p-6 md:p-10 space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                        <div className="flex items-center justify-between"><Bone className="h-4 w-32" /><Bone className="h-7 w-28" /></div>
                        <Bone className="mx-auto h-52 w-52 rounded-2xl" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2"><Bone className="h-3 w-24" /><Bone className="h-12 w-full rounded-xl" /></div>
                        <div className="space-y-2"><Bone className="h-3 w-24" /><Bone className="h-12 w-full rounded-xl" /></div>
                    </div>
                    <Bone className="h-40 w-full rounded-2xl" />
                    <Bone className="h-14 w-full rounded-xl" />
                </div>
            </SkeletonPage>
        );
    }

    if (channelDisabled) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50 px-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-md w-full">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
                        <FontAwesomeIcon icon={faTimesCircle} className="text-3xl" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 m-0">Payment Option Unavailable</h2>
                    <p className="m-0 mt-3 text-sm text-slate-600 leading-relaxed">
                        {channelDisabledMessage || 'This payment option is currently disabled by apartment management. Please return to billing to select an available payment method.'}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate(returnUrl || '/pay-bills')}
                            className="btn-interactive min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-6 rounded-xl cursor-pointer border-0 transition-colors shadow-sm"
                        >
                            {returnUrl ? 'Return' : t('utilities.goPayBills')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const fileError = checkFile(file, FILE_RULES.paymentProof);
            if (fileError) {
                e.target.value = '';
                setFileAlert(fileError);
                form.setFieldError('proof', fileError);
                return;
            }
            form.clearError('proof');
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setProofImage(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const removeImage = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setProofImage(null);
        setPreviewUrl('');
        setShowPreviewModal(false);
    };

    //{/*LimitsGCashCharactersDynamicallyTo13Digits*/}
    const handleReferenceChange = (e) => {
        const val = e.target.value;
        if (isGcash) {
            const numericVal = val.replace(/\D/g, '').slice(0, 13);
            setReferenceNo(numericVal);
        } else {
            setReferenceNo(val);
        }
        form.clearError('payment_reference');
    };

    const isPdf = !!proofImage && (proofImage.type === 'application/pdf' || /\.pdf$/i.test(proofImage.name || ''));
    const values = { sender_name: senderName, payment_reference: referenceNo, proof: proofImage, bank_name: bankName };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (uploading) return;
        const clean = { ...values, sender_name: senderName.trim(), payment_reference: referenceNo.trim() };
        setSenderName(clean.sender_name);
        setReferenceNo(clean.payment_reference);
        if (!form.validateAll(clean)) return;
        if (isBankTransfer && !bankName) {
            setError(t('paymentUpload.errBank'));
            return;
        }

        setUploading(true);
        setError('');

        const loggedInUserStr = sessionStorage.getItem("loggedInUser");
        const loggedInUser = loggedInUserStr ? JSON.parse(loggedInUserStr) : {};
        const userId = loggedInUser.id || '';

        const formData = new FormData();
        formData.append('userId', userId);
        formData.append('invoiceId', invoiceId);
        formData.append('invoice_id', invoiceId);
        formData.append('paymentMethod', paymentMethod);
        formData.append('payment_method', paymentMethod);
        if (isBankTransfer) formData.append('bank_name', bankName);
        formData.append('senderName', clean.sender_name);
        formData.append('sender_name', clean.sender_name);
        formData.append('referenceNo', clean.payment_reference);
        formData.append('payment_reference', clean.payment_reference);
        formData.append('proofImage', proofImage);
        formData.append('proof', proofImage);
        // Part of one bill (installments); without it the whole balance is paid.
        if (partAmount) formData.append('amount', String(partAmount));

        try {
            const res = await api.post("/upload_payment_proof.php", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setSubmitted(true);
                try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing to clear */ }
            } else if (!form.applyServerErrors(res)) {
                setError(res.data.message || t('paymentUpload.uploadFailed'));
            }
        } catch (err) {
            console.error("Upload error:", err);
            if (!form.applyServerErrors(err)) setError(apiErrorMessage(err, "A network error occurred while uploading."));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="payment-upload-root w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start py-10 px-4 md:px-12 box-border text-left">
            <div className="payment-upload-card w-full max-w-2xl z-10 space-y-8 relative bg-white rounded-3xl md:border md:border-slate-200 md:shadow-2xl p-6 md:p-10 text-slate-800">
                <button onClick={() => navigate(returnUrl || '/home')} className="flex items-center space-x-2 text-indigo-600 hover:underline bg-transparent border-0 p-0 font-semibold cursor-pointer">
                    <FontAwesomeIcon icon={faArrowLeft} /> <span>{t('paymentUpload.back')}</span>
                </button>

                <div>
                    <h1 className="text-3xl font-extrabold m-0">{t('paymentUpload.heading')}</h1>
                    <p className="text-sm text-slate-500 mt-2 m-0 leading-relaxed">
                        {t('paymentUpload.subtext')}
                    </p>
                </div>

                {error && (
                    <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-600 p-4 rounded-xl flex items-center gap-3 text-sm font-semibold">
                        <FontAwesomeIcon icon={faTimesCircle} /> {error}
                    </div>
                )}

                <div className="payment-info-box bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-inner">
                    <div className="flex justify-between items-center">
                        <span className="min-w-0">
                            <span className="block text-xs font-bold text-slate-500 ">{partAmount ? t('paymentUpload.payingNow') : t('paymentUpload.totalDue')}</span>
                            {billLabel && <span className="block mt-0.5 text-sm font-semibold text-slate-700 truncate">{billLabel}</span>}
                        </span>
                        <span className="text-2xl font-black text-indigo-600 shrink-0">₱{(Number(amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t border-slate-200 pt-4 mt-4">
                        <span className="text-xs font-bold text-slate-500 block mb-3">{paymentMethod} {t('paymentUpload.accountDetails')}</span>
                        {isQrPh ? (
                            <div>
                                {qrData?.image_path ? (
                                    <div className="flex flex-col items-center text-center py-2 space-y-4">
                                        {/* Title & subtitle (Never say 'QR Ph Slot 1') */}
                                        <div className="space-y-1">
                                            <h3 className="m-0 text-base font-extrabold text-indigo-600 ">
                                                {getQrTitle(qrData.label)}
                                            </h3>
                                            <p className="m-0 text-xs text-slate-500 ">
                                                Interoperable across GCash, Maya, BDO, BPI, and all Philippine bank apps
                                            </p>
                                        </div>

                                        {/* Larger, centered QR card with hover-to-enlarge */}
                                        <div
                                            onClick={() => setShowQrModal(true)}
                                            className="group relative cursor-pointer inline-block rounded-2xl p-3 bg-white border-2 border-indigo-100 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all"
                                            title="Click to enlarge QR Code"
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowQrModal(true); }}
                                        >
                                            <img
                                                src={publicAssetUrl(qrData.image_path)}
                                                alt={getQrTitle(qrData.label)}
                                                className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-xl bg-white select-none block"
                                            />
                                            <div className="absolute inset-0 rounded-2xl bg-white/85 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-slate-900 gap-1.5 font-bold text-xs backdrop-blur-[2px]">
                                                <FontAwesomeIcon icon={faExpand} className="text-xl" />
                                                <span>Click to Enlarge</span>
                                            </div>
                                        </div>

                                        {/* Action buttons: Enlarge & Download */}
                                        <div className="flex items-center justify-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setShowQrModal(true)}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold border border-indigo-200 cursor-pointer transition-colors"
                                            >
                                                <FontAwesomeIcon icon={faExpand} className="text-[11px]" />
                                                <span>Enlarge QR</span>
                                            </button>
                                            <a
                                                href={publicAssetUrl(qrData.image_path)}
                                                download="qr_ph_payment.png"
                                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-slate-700 hover:bg-slate-100 text-xs font-semibold border border-slate-200 no-underline cursor-pointer transition-colors"
                                            >
                                                <FontAwesomeIcon icon={faDownload} className="text-[11px]" />
                                                <span>Save Image</span>
                                            </a>
                                        </div>

                                        {/* Account Details if provided */}
                                        {(qrData.account_name || qrData.account_number) && (
                                            <div className="w-full max-w-sm p-3.5 rounded-xl bg-white border border-slate-200 text-xs space-y-1.5 shadow-xs text-left">
                                                {qrData.account_name && (
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-slate-500 font-medium">Account Name:</span>
                                                        <span className="font-bold text-slate-800 truncate max-w-[200px]">{qrData.account_name}</span>
                                                    </div>
                                                )}
                                                {qrData.account_number && (
                                                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 ">
                                                        <span className="text-slate-500 font-medium">Account / Mobile No:</span>
                                                        <span className="font-mono font-bold text-indigo-600 ">{qrData.account_number}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <p className="text-[11px] text-slate-500 max-w-sm m-0 leading-relaxed">
                                            Scan using GCash, Maya, BDO, BPI, or any Philippine banking app, then enter the reference number and upload your receipt below.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm font-medium m-0 text-slate-500 text-center py-4">No active QR code uploaded by management yet.</p>
                                )}
                            </div>
                        ) : (
                            <>
                                {accounts.length === 0 && (
                                    <p className="text-sm font-medium m-0 text-slate-500 ">{t('paymentUpload.noAccount')}</p>
                                )}
                                {accounts.map((acct) => (
                                    <div key={acct.id} className="flex flex-col gap-1.5 text-sm font-medium [&+&]:mt-3 [&+&]:pt-3 [&+&]:border-t [&+&]:border-slate-200 md:[&+&]:border-slate-200">
                                        {accounts.length > 1 && <span className="text-xs font-bold text-slate-500 ">{acct.label}</span>}
                                        {acct.account_name && <span><strong className="text-slate-500 mr-2">{t('paymentUpload.accountName')}:</strong> {acct.account_name}</span>}
                                        <span className="flex items-center"><strong className="text-slate-500 mr-2">{t('paymentUpload.accountNo')}:</strong> <span className="text-lg font-black tracking-wider text-indigo-600 ">{acct.account_number}</span></span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {isBankTransfer && (
                            <div className="space-y-2 md:col-span-2">
                                <label htmlFor="upload-bank-name" className="text-xs font-bold text-slate-600 block">{t('paymentUpload.bankFrom')}</label>
                                <select 
                                    id="upload-bank-name" 
                                    value={bankName} 
                                    onChange={(e) => { setBankName(e.target.value); setError(''); }} 
                                    required 
                                    className={`${INPUT_CLS} cursor-pointer bg-white text-slate-800 border-slate-200`}
                                >
                                    <option value="">{t('paymentUpload.selectBank')}</option>
                                    {BANKS.map((bank) => (
                                        <option key={bank} value={bank}>
                                            {bank}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label htmlFor="upload-sender_name" className="text-xs font-bold text-slate-600 block">{t('paymentUpload.senderName')}</label>
                            <input
                                type="text"
                                {...form.fieldA11y('sender_name')}
                                autoComplete="name"
                                value={senderName}
                                onChange={e => { setSenderName(e.target.value); form.clearError('sender_name'); }}
                                onBlur={() => {
                                    const v = senderName.trim();
                                    setSenderName(v);
                                    if (v) form.validateField('sender_name', { ...values, sender_name: v });
                                }}
                                maxLength={LIMITS.senderName}
                                required
                                className={INPUT_CLS + invalidCls(form.errors.sender_name)}
                                placeholder={t('visitors.namePlaceholder')}
                            />
                            <FieldError id="upload-sender_name" error={form.errors.sender_name} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="upload-payment_reference" className="text-xs font-bold text-slate-600 block">{t('paymentUpload.refNo')}</label>
                            <input
                                type="text"
                                {...form.fieldA11y('payment_reference')}
                                autoComplete="off"
                                value={referenceNo}
                                onChange={handleReferenceChange}
                                onBlur={() => {
                                    const v = referenceNo.trim();
                                    setReferenceNo(v);
                                    if (v) form.validateField('payment_reference', { ...values, payment_reference: v });
                                }}
                                required
                                inputMode={isGcash ? "numeric" : "text"}
                                maxLength={isGcash ? 13 : isBankMethod(paymentMethod) ? 55 : LIMITS.paymentReference}
                                className={INPUT_CLS + invalidCls(form.errors.payment_reference)}
                                placeholder={isGcash ? t('paymentUpload.refGcashPlaceholder') : t('paymentUpload.refBankPlaceholder')}
                            />
                            <FieldError id="upload-payment_reference" error={form.errors.payment_reference} />
                            <p className="text-xs text-slate-500 m-0 leading-relaxed mt-1 font-medium">
                                {isGcash 
                                    ? t('paymentUpload.refGcashHint') 
                                    : t('paymentUpload.refBankHint')}
                            </p>
                        </div>
                    </div>

                    {/*AdjustedReceiptPreviewContainerArea*/}
                    <div className="space-y-2">
                        <label htmlFor="upload-proof" className="text-xs font-bold text-slate-600 block">{t('paymentUpload.uploadReceipt')}</label>

                        {!previewUrl ? (
                            <div className={`payment-dropzone card-interactive relative border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50 hover:border-indigo-500 transition-colors overflow-hidden group cursor-pointer shadow-inner min-h-[160px]${invalidCls(form.errors.proof)}`}>
                                <input
                                    type="file"
                                    {...form.fieldA11y('proof')}
                                    accept={acceptFor(FILE_RULES.paymentProof)}
                                    onChange={handleImageChange}
                                    required
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                />
                                <FontAwesomeIcon icon={faCloudUploadAlt} className="text-4xl text-indigo-500 mb-3 group-hover:scale-110 transition-transform" />
                                <p className="text-sm font-semibold text-slate-600 m-0">{t('paymentUpload.dropHere')}</p>
                                <p className="text-xs text-slate-500 mt-1 m-0 font-medium">{FILE_RULES.paymentProof.label} (Max {FILE_RULES.paymentProof.maxMB} MB)</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center space-y-3 p-4 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner">
                                {isPdf ? (
                                    <div className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200">
                                        <FontAwesomeIcon icon={faFilePdf} className="text-3xl text-rose-500" aria-hidden="true" />
                                        <span className="min-w-0 text-sm font-semibold text-slate-700 truncate">{proofImage?.name}</span>
                                    </div>
                                ) : (
                                <button
 type="button"
 onClick={() => setShowPreviewModal(true)}
 className="border-0 p-0 w-full h-72 flex items-center justify-center overflow-hidden rounded-xl bg-black/40 cursor-pointer group relative hover:ring-2 hover:ring-indigo-500 transition-all"
                                    title={t('paymentUpload.viewLarger')}
                                >
                                    <img 
                                        src={previewUrl} 
                                        alt={t('paymentUpload.receiptPreview')} 
                                        className="max-h-full max-w-full object-contain rounded group-hover:scale-[1.02] transition-transform"
                                    />
                                    <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                        <span className="bg-white text-slate-900 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-300 shadow-lg flex items-center gap-2">
                                            <FontAwesomeIcon icon={faEye} />
                                            <span>{t('paymentUpload.viewLarger')}</span>
                                        </span>
                                    </span>
                                </button>
                                )}
                                {proofImage && (
                                    <p className="text-xs text-slate-600 m-0 truncate w-full text-center">
                                        {proofImage.name} ({formatFileSize(proofImage.size)})
                                    </p>
                                )}
                                <div className="flex items-center gap-3 w-full pt-1">
                                    <label className="relative flex-1 min-h-[44px] focus-within:ring-2 focus-within:ring-indigo-500 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl border-0 cursor-pointer transition-colors text-center flex items-center justify-center gap-1.5 shadow-sm">
                                        <FontAwesomeIcon icon={faCloudUploadAlt} />
                                        <span>{t('paymentUpload.changePhoto')}</span>
                                        <input
                                            type="file"
                                            accept={acceptFor(FILE_RULES.paymentProof)}
                                            onChange={handleImageChange}
                                            className="sr-only"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={removeImage}
                                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold px-4 py-2.5 rounded-xl border border-rose-200 cursor-pointer transition-colors flex items-center gap-1.5"
                                    >
                                        <FontAwesomeIcon icon={faUndo} />
                                        <span>{t('paymentUpload.remove')}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                        <FieldError id="upload-proof" error={form.errors.proof} />
                    </div>

                    <div className="pt-2">
                        <button 
                            type="submit" 
                            disabled={uploading}
                            className="payment-submit-btn btn-interactive w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold py-4 rounded-xl text-sm transition-all shadow-lg border-0 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <><FontAwesomeIcon icon={faHourglassHalf} className="animate-spin" /> <span>{t('paymentUpload.submitting')}</span></>
                            ) : (
                                <><FontAwesomeIcon icon={faCheckCircle} /> <span>{t('paymentUpload.submit')}</span></>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            <SuccessModal
                isOpen={submitted}
                onClose={() => navigate(returnUrl || '/home')}
                message={t('paymentUpload.submittedTitle')}
                subtext={t('paymentUpload.submittedBody')}
            />

            {/* Modal Alert for file size / format violations */}
            <FileAlertModal
                isOpen={!!fileAlert}
                message={fileAlert}
                onClose={() => setFileAlert('')}
            />

            {/* Modal preview for full-size receipt image */}
            <DocumentPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                title={proofImage ? proofImage.name : t('paymentUpload.receiptPreview')}
                fileUrl={previewUrl}
                isImage={true}
            />

            {/* QR Ph Enlarge Modal */}
            {isQrPh && qrData?.image_path && (
                <QrPreviewModal
                    isOpen={showQrModal}
                    onClose={() => setShowQrModal(false)}
                    imagePath={qrData.image_path}
                    title={getQrTitle(qrData.label)}
                    accountName={qrData.account_name}
                    accountNumber={qrData.account_number}
                />
            )}
        </div>
    );
}