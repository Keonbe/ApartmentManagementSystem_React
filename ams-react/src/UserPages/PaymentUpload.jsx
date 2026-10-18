import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCloudUploadAlt, faHourglassHalf, faCheckCircle, faTimesCircle, faUndo, faEye } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import ApartmentPic from '../assets/Apartment_Pic.webp';
import { useLang } from '../config/i18n';
import SuccessModal from '../Components/SuccessModal';
import FileAlertModal from '../Components/FileAlertModal';
import DocumentPreviewModal from '../Components/DocumentPreviewModal';
import { LIMITS, checkPaymentReference, checkText, isBankMethod } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { invalidCls, formatFileSize } from '../Components/form/formHelpers';
import { fetchContractTemplate, accountsForMethod } from '../Components/contract/contractTemplate';
import '../assets/styles/responsive/user/payment-upload.responsive.css';

const INPUT_CLS = "focus-glow w-full bg-slate-50 md:bg-white/5 border border-slate-200 md:border-white/10 rounded-xl px-4 py-3 text-sm outline-none text-slate-800 md:text-white focus:border-indigo-500 transition-colors box-border shadow-sm";
const BANKS = ['BDO', 'BPI', 'Metrobank', 'Landbank', 'RCBC', 'UnionBank', 'Security Bank', 'Maya Bank', 'Other'];

export default function PaymentUpload() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useLang();
    const state = location.state || {};
    const { invoiceId, amount, paymentMethod, returnUrl } = state;
    // paymentMethod is the channel label, e.g. 'GCash (Manual)' or 'BPI (Manual)'.
    const isGcash = /gcash/i.test(paymentMethod || '');
    const isBankTransfer = isBankMethod(paymentMethod);

    const [senderName, setSenderName] = useState('');
    const [referenceNo, setReferenceNo] = useState('');
    const [bankName, setBankName] = useState('');
    const [proofImage, setProofImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [fileAlert, setFileAlert] = useState('');
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    // Landlord's GCash/bank accounts, edited in Admin → Edit Contract.
    const [accounts, setAccounts] = useState([]);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    // Keys match upload_payment_proof.php's form fields.
    const form = useFieldErrors({
        // Account names can be joint or business names, so free text, not a person-name check.
        sender_name: (v) => checkText(v, { label: 'Sender name', max: LIMITS.senderName }),
        payment_reference: (v) => checkPaymentReference(v, paymentMethod),
        proof: (f) => (f ? checkFile(f, FILE_RULES.receiptImage) : 'Please upload a photo of your receipt.'),
    }, { idPrefix: 'upload-' });

    useEffect(() => {
        fetchContractTemplate()
            .then((res) => setAccounts(accountsForMethod(res.template.payment_accounts, paymentMethod)))
            .catch((err) => console.error('Failed to load payment accounts:', err));
    }, [paymentMethod]);

    if (!invoiceId) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-slate-800">Invalid Payment Session</h2>
                    <button onClick={() => navigate('/home')} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-xl cursor-pointer border-0">Go Home</button>
                </div>
            </div>
        );
    }

    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const fileError = checkFile(file, FILE_RULES.receiptImage);
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

    const values = { sender_name: senderName, payment_reference: referenceNo, proof: proofImage, bank_name: bankName };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (uploading) return;
        const clean = { ...values, sender_name: senderName.trim(), payment_reference: referenceNo.trim() };
        setSenderName(clean.sender_name);
        setReferenceNo(clean.payment_reference);
        if (!form.validateAll(clean)) return;
        if (isBankTransfer && !bankName) {
            setError('Choose the bank you transferred from.');
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

        try {
            const res = await api.post("/upload_payment_proof.php", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setSubmitted(true);
            } else if (!form.applyServerErrors(res)) {
                setError(res.data.message || "Failed to upload payment proof.");
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
            <div className="absolute inset-0 z-0 hidden md:block">
                <img src={ApartmentPic} alt="Background" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/95 via-slate-900/90 to-slate-950/95"></div>
            </div>

            <div className="payment-upload-card w-full max-w-2xl z-10 space-y-8 relative bg-white md:bg-slate-900/60 md:backdrop-blur-md rounded-3xl md:border md:border-white/10 md:shadow-2xl p-6 md:p-10 text-slate-800 md:text-white">
                <button onClick={() => navigate(returnUrl || '/home')} className="flex items-center space-x-2 text-indigo-600 md:text-indigo-400 hover:underline bg-transparent border-0 p-0 font-semibold cursor-pointer">
                    <FontAwesomeIcon icon={faArrowLeft} /> <span>{t('paymentUpload.back')}</span>
                </button>

                <div>
                    <h1 className="text-3xl font-extrabold m-0">{t('paymentUpload.heading')}</h1>
                    <p className="text-sm text-slate-500 md:text-slate-300 mt-2 m-0 leading-relaxed">
                        {t('paymentUpload.subtext')}
                    </p>
                </div>

                {error && (
                    <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-600 md:bg-rose-500/10 md:border-rose-500/20 md:text-rose-400 p-4 rounded-xl flex items-center gap-3 text-sm font-semibold">
                        <FontAwesomeIcon icon={faTimesCircle} /> {error}
                    </div>
                )}

                <div className="payment-info-box bg-slate-50 md:bg-white/5 border border-slate-200 md:border-white/10 rounded-2xl p-6 space-y-4 shadow-inner">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 md:text-slate-400">{t('paymentUpload.totalDue')}</span>
                        <span className="text-2xl font-black text-indigo-600 md:text-indigo-400">₱{amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t border-slate-200 md:border-white/10 pt-4 mt-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 md:text-slate-400 block mb-3">{paymentMethod} {t('paymentUpload.accountDetails')}</span>
                        {accounts.length === 0 && (
                            <p className="text-sm font-medium m-0 text-slate-500 md:text-slate-400">{t('paymentUpload.noAccount')}</p>
                        )}
                        {accounts.map((acct) => (
                            <div key={acct.id} className="flex flex-col gap-1.5 text-sm font-medium [&+&]:mt-3 [&+&]:pt-3 [&+&]:border-t [&+&]:border-slate-200 md:[&+&]:border-white/10">
                                {accounts.length > 1 && <span className="text-xs font-bold text-slate-500 md:text-slate-300">{acct.label}</span>}
                                {acct.account_name && <span><strong className="text-slate-400 mr-2">{t('paymentUpload.accountName')}:</strong> {acct.account_name}</span>}
                                <span className="flex items-center"><strong className="text-slate-400 mr-2">{t('paymentUpload.accountNo')}:</strong> <span className="text-lg font-black tracking-wider text-indigo-600 md:text-indigo-400">{acct.account_number}</span></span>
                            </div>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {isBankTransfer && (
                            <div className="space-y-2 md:col-span-2">
                                <label htmlFor="upload-bank-name" className="text-xs font-bold text-slate-600 md:text-slate-400 uppercase tracking-wider block">Bank transferred from</label>
                                <select 
                                    id="upload-bank-name" 
                                    value={bankName} 
                                    onChange={(e) => { setBankName(e.target.value); setError(''); }} 
                                    required 
                                    className={`${INPUT_CLS} [&>option]:bg-slate-900 [&>option]:text-white cursor-pointer`}
                                    style={{ colorScheme: 'dark' }}
                                >
                                    <option value="" className="bg-slate-900 text-white">Select your bank</option>
                                    {BANKS.map((bank) => (
                                        <option key={bank} value={bank} className="bg-slate-900 text-white">
                                            {bank}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label htmlFor="upload-sender_name" className="text-xs font-bold text-slate-600 md:text-slate-400 uppercase tracking-wider block">{t('paymentUpload.senderName')}</label>
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
                                placeholder="E.g. Juan Dela Cruz"
                            />
                            <FieldError id="upload-sender_name" error={form.errors.sender_name} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="upload-payment_reference" className="text-xs font-bold text-slate-600 md:text-slate-400 uppercase tracking-wider block">{t('paymentUpload.refNo')}</label>
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
                                placeholder={isGcash ? "13-digit Reference No." : "Alphanumeric reference (max 55 chars)"}
                            />
                            <FieldError id="upload-payment_reference" error={form.errors.payment_reference} />
                            <p className="text-[10px] text-slate-400 m-0 leading-relaxed mt-1 font-medium">
                                {isGcash 
                                    ? "GCash reference numbers must be exactly 13 digits (numbers only)." 
                                    : "Bank transfer reference numbers can be up to 55 characters and cannot consist of numbers only."}
                            </p>
                        </div>
                    </div>

                    {/*AdjustedReceiptPreviewContainerArea*/}
                    <div className="space-y-2">
                        <label htmlFor="upload-proof" className="text-xs font-bold text-slate-600 md:text-slate-400 uppercase tracking-wider block">{t('paymentUpload.uploadReceipt')}</label>

                        {!previewUrl ? (
                            <div className={`payment-dropzone card-interactive relative border-2 border-dashed border-slate-300 md:border-white/20 rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50 md:bg-white/5 hover:border-indigo-500 transition-colors overflow-hidden group cursor-pointer shadow-inner min-h-[160px]${invalidCls(form.errors.proof)}`}>
                                <input
                                    type="file"
                                    {...form.fieldA11y('proof')}
                                    accept={acceptFor(FILE_RULES.receiptImage)}
                                    onChange={handleImageChange}
                                    required
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                />
                                <FontAwesomeIcon icon={faCloudUploadAlt} className="text-4xl text-indigo-500 md:text-indigo-400 mb-3 group-hover:scale-110 transition-transform" />
                                <p className="text-sm font-semibold text-slate-600 md:text-slate-300 m-0">Click to upload or drag & drop</p>
                                <p className="text-xs text-slate-500 md:text-slate-400 mt-1 m-0 font-medium">{FILE_RULES.receiptImage.label} (Max {FILE_RULES.receiptImage.maxMB} MB)</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center space-y-3 p-4 bg-slate-950/80 rounded-2xl border border-slate-200 md:border-white/10 shadow-inner">
                                <div 
                                    onClick={() => setShowPreviewModal(true)}
                                    className="w-full h-72 flex items-center justify-center overflow-hidden rounded-xl bg-black/40 cursor-pointer group relative hover:ring-2 hover:ring-indigo-500 transition-all"
                                    title="Click to view larger image"
                                >
                                    <img 
                                        src={previewUrl} 
                                        alt="Uploaded Receipt Preview" 
                                        className="max-h-full max-w-full object-contain rounded group-hover:scale-[1.02] transition-transform"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                        <span className="bg-slate-900/90 text-white text-xs font-bold px-3.5 py-2 rounded-xl border border-white/20 shadow-lg flex items-center gap-2">
                                            <FontAwesomeIcon icon={faEye} />
                                            <span>Click to view larger</span>
                                        </span>
                                    </div>
                                </div>
                                {proofImage && (
                                    <p className="text-xs text-slate-300 m-0 truncate w-full text-center">
                                        {proofImage.name} ({formatFileSize(proofImage.size)})
                                    </p>
                                )}
                                <div className="flex items-center gap-3 w-full pt-1">
                                    <label className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl border-0 cursor-pointer transition-colors text-center flex items-center justify-center gap-1.5 shadow-sm">
                                        <FontAwesomeIcon icon={faCloudUploadAlt} />
                                        <span>{t('paymentUpload.changePhoto')}</span>
                                        <input
                                            type="file"
                                            accept={acceptFor(FILE_RULES.receiptImage)}
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={removeImage}
                                        className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold px-4 py-2.5 rounded-xl border border-rose-500/30 cursor-pointer transition-colors flex items-center gap-1.5"
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
                message="Payment submitted"
                subtext="Your payment proof is awaiting verification by management. You will be notified as soon as it is confirmed."
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
                title={proofImage ? proofImage.name : "Payment Receipt Preview"}
                fileUrl={previewUrl}
                isImage={true}
            />
        </div>
    );
}