import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faArrowLeft, faHourglassHalf, faFileSignature, faDownload } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { useLang } from '../config/i18n';
import ContractDocument from '../Components/contract/ContractDocument';
import { fetchContractTemplate } from '../Components/contract/contractTemplate';
import { printElement } from '../utils/print';
import { FILE_RULES, checkFile } from '../utils/fileLimits';
import InlineAlert from '../Components/InlineAlert';
import { personName } from '../utils/personName';

const formatPeso = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatLongDate = (raw) => {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function ViewContract() {
    const navigate = useNavigate();
    // Back to the previous page inside the app; opened directly (a link, a new
    // tab) there is none, and navigate(-1) used to leave the app. My Room then
    // (an applicant without a room is sent on to Home by its route guard).
    const goBack = () => {
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate('/my-room');
    };
    const location = useLocation();
    const { t, lang } = useLang();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isEmpty, setIsEmpty] = useState(false);
    const [contractData, setContractData] = useState(null);
    const [template, setTemplate] = useState(null); // admin-editable terms (Admin → Edit Contract)
    const [language, setLanguage] = useState(lang === 'fil' ? 'tl' : 'en'); // 'tl' | 'en'
    const contractDocRef = useRef(null);

    // Keep the contract body in step with the global language switcher (TopBar);
    // adjusted during render rather than in an effect.
    const [seenLang, setSeenLang] = useState(lang);
    if (seenLang !== lang) {
        setSeenLang(lang);
        setLanguage(lang === 'fil' ? 'tl' : 'en');
    }

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");

    // ?email= is the admin preview path only; tenants read their own contract
    // through ?userId=, which the backend scopes to the X-User-Id header.
    const queryParams = new URLSearchParams(location.search);
    const previewEmail = queryParams.get('email');
    const activeEmail = previewEmail || (loggedInUser ? loggedInUser.email_address : "");

    useEffect(() => {
        const fetchContractDetails = async () => {
            if (!previewEmail && !loggedInUser?.id) {
                setError(t('contract.errNoSession'));
                setLoading(false);
                return;
            }

            try {
                const contractQuery = previewEmail
                    ? `/get_contracts.php?email=${encodeURIComponent(previewEmail)}`
                    : `/get_contracts.php?userId=${encodeURIComponent(loggedInUser.id)}`;

                let contractRes = await api.get(contractQuery);
                let data = null;
                let contractStatus = null; // only meaningful when `data` came from get_contracts.php — my_room.php's `status` field is the application's status, not the contract's

                if (contractRes.data.success && contractRes.data.contract) {
                    data = contractRes.data.contract;
                    contractStatus = data.status || null;
                } else if (activeEmail) {
                    const fallbackRes = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);
                    if (fallbackRes.data.success && fallbackRes.data.data) {
                        data = fallbackRes.data.data;
                    }
                }

                // A contract keeps the clauses it was issued under
                // (template_version_id); details and payment accounts are always current.
                const templateRes = await fetchContractTemplate(data?.template_version_id || null);
                setTemplate(templateRes.template);

                if (data) {
                    const isTentative = !data.lease_start;
                    const entryDateRaw = data.lease_start || data.created_at || data.app_created_at;
                    const startDate = entryDateRaw ? new Date(entryDateRaw) : null;
                    const hasValidStart = startDate && !isNaN(startDate.getTime());

                    const cleanRoomName = data.room_name ? data.room_name.replace(/^Room\s+/i, '') : null;
                    const monthlyRent = formatPeso(data.monthly_rent);

                    setContractData({
                        tenantName: personName(data) || personName(loggedInUser),
                        tenantEmail: activeEmail,
                        tenantPhone: data.contact_no || null,
                        tenantPreviousAddress: data.previous_address || null,
                        roomName: cleanRoomName,
                        monthlyRent,
                        // Security deposit is one month's rent; fall back to the rent
                        // figure when the contract row has not recorded one yet.
                        depositAmount: formatPeso(data.deposit_amount) || monthlyRent,
                        advanceRent: monthlyRent,
                        entryDate: hasValidStart ? formatLongDate(startDate) : null,
                        leaseEndDate: formatLongDate(data.lease_end),
                        dueDateDay: hasValidStart ? startDate.getDate() : null,
                        isTentative: isTentative,
                        status: contractStatus,
                        contractId: data.id,
                        signedLeasePath: data.signed_lease_path || null,
                        notarizedLeasePath: data.notarized_lease_path || null,
                        tenantSignature: data.tenant_signature_path || null,
                        ownerSignature: data.owner_signature_path || null
                    });
                } else {
                    setIsEmpty(true);
                }
            } catch (err) {
                console.error("Failed to fetch contract details:", err);
                if (err.response?.status === 403) {
                    setError(t('contract.errForbidden'));
                } else {
                    setError(t('contract.errConnect'));
                }
            } finally {
                setLoading(false);
            }
        };

        fetchContractDetails();
    }, [activeEmail, previewEmail]);

    const handlePrintAction = () => {
        printElement(contractDocRef.current, { variant: 'document' });
    };

    // Result of a signature upload or removal, shown above the contract (these
    // were alert()); 'saving' while a request runs.
    const [signatureMessage, setSignatureMessage] = useState(null); // { ok, text }
    const [signatureBusy, setSignatureBusy] = useState(false);

    const handleTenantSignatureUpload = async (party, file) => {
        if (!contractData?.contractId || signatureBusy) return;
        // The server takes a JPG or PNG of at most 5 MB for a signature.
        const fileError = checkFile(file, FILE_RULES.receiptImage);
        if (fileError) {
            setSignatureMessage({ ok: false, text: fileError });
            return;
        }
        setSignatureBusy(true);
        setSignatureMessage(null);
        const formData = new FormData();
        formData.append('contractId', contractData.contractId);
        formData.append('docType', 'tenantSignature');
        formData.append('action', 'upload');
        formData.append('file', file);
        try {
            const res = await api.post('/upload_lease_document.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                setContractData(prev => ({
                    ...prev,
                    tenantSignature: res.data.filePath
                }));
                setSignatureMessage({ ok: true, text: t('contract.signatureAdded') });
            } else {
                setSignatureMessage({ ok: false, text: res.data.message || t('contract.signatureUploadFailed') });
            }
        } catch (err) {
            console.error('Failed to upload signature:', err);
            setSignatureMessage({ ok: false, text: err.response?.data?.message || t('contract.signatureUploadFailed') });
        } finally {
            setSignatureBusy(false);
        }
    };

    const handleTenantSignatureRemove = async () => {
        if (!contractData?.contractId || signatureBusy) return;
        setSignatureBusy(true);
        setSignatureMessage(null);
        const formData = new FormData();
        formData.append('contractId', contractData.contractId);
        formData.append('docType', 'tenantSignature');
        formData.append('action', 'remove');
        try {
            const res = await api.post('/upload_lease_document.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                setContractData(prev => ({
                    ...prev,
                    tenantSignature: null
                }));
                setSignatureMessage({ ok: true, text: t('contract.signatureRemoved') });
            } else {
                setSignatureMessage({ ok: false, text: res.data.message || t('contract.signatureRemoveFailed') });
            }
        } catch (err) {
            console.error('Failed to remove signature:', err);
            setSignatureMessage({ ok: false, text: err.response?.data?.message || t('contract.signatureRemoveFailed') });
        } finally {
            setSignatureBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50 px-4 text-slate-800">
                <div className="flex flex-col items-center space-y-4">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-4xl text-indigo-600 animate-spin" aria-hidden="true" />
                    <h2 className="text-xl font-bold">{t('contract.loading')}</h2>
                </div>
            </div>
        );
    }

    if (isEmpty) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50 px-4 text-slate-800">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center max-w-md space-y-4 shadow-sm">
                    <FontAwesomeIcon icon={faFileSignature} className="text-4xl text-slate-400" aria-hidden="true" />
                    <h2 className="text-xl font-bold text-slate-800">{t('contract.emptyTitle')}</h2>
                    <p className="text-slate-600 text-sm">{t('contract.emptyBody')}</p>
                    <button
                        onClick={goBack}
                        type="button"
                        className="mt-4 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 rounded-xl transition-all border-0 cursor-pointer text-sm"
                    >
                        {t('contract.goBack')}
                    </button>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50 px-4 text-slate-800">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center max-w-md space-y-4 shadow-sm">
                    <h2 className="text-2xl font-bold text-rose-600">{t('contract.errTitle')}</h2>
                    <p className="text-slate-600 text-sm">{error}</p>
                    <button
                        onClick={goBack}
                        type="button"
                        className="mt-4 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 rounded-xl transition-all border-0 cursor-pointer text-sm"
                    >
                        {t('contract.goBack')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="view-contract-root w-full min-h-[calc(100vh-76px)] bg-slate-100 py-10 px-4 md:px-12 box-border flex flex-col items-center print:bg-white print:py-0 print:px-0">
            
            {/* Control Actions Toolbar Bar Panel Layout (Hidden on Print) */}
            <div className="view-contract-controls animate-fade-in w-full max-w-3xl flex flex-wrap justify-between items-center gap-4 mb-6 print:hidden select-none">
                <button
                    onClick={goBack}
                    className="btn-interactive flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs border border-slate-200 shadow-sm cursor-pointer transition-all"
                >
                    <FontAwesomeIcon icon={faArrowLeft} />
                    <span>{t('contract.goBack')}</span>
                </button>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Language Selector */}
                    <div className="lang-selector flex bg-slate-200/80 p-1 rounded-xl border border-slate-300">
                        <button
                            onClick={() => setLanguage('tl')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${language === 'tl' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                        >
                            {t('contract.tagalog')}
                        </button>
                        <button
                            onClick={() => setLanguage('en')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${language === 'en' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                        >
                            {t('contract.english')}
                        </button>
                    </div>

                    <button
                        onClick={handlePrintAction}
                        className="btn-interactive flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs border-0 shadow-md cursor-pointer transition-all"
                    >
                        <FontAwesomeIcon icon={faPrint} />
                        <span>{t('contract.printSave')}</span>
                    </button>
                </div>
            </div>

            {/* Status banner — screen only, so a Draft/expired/terminated lease
                doesn't read as final just because the printed contract body
                below has no place to show it. */}
            {contractData.status && contractData.status !== 'active' && (
                <div className={`w-full max-w-3xl mb-6 print:hidden rounded-xl border px-4 py-3 text-xs font-semibold ${
 contractData.status === 'draft' ? 'bg-amber-50 border-amber-200 text-amber-800'
 : contractData.status === 'eviction-pending' ? 'bg-red-50 border-red-200 text-red-800'
 : 'bg-slate-100 border-slate-300 text-slate-600'
 }`}>
                    {contractData.status === 'draft' && t('contract.statusDraft')}
                    {contractData.status === 'eviction-pending' && t('contract.statusEvictionPending')}
                    {contractData.status === 'expired' && t('contract.statusExpired')}
                    {contractData.status === 'terminated' && t('contract.statusTerminated')}
                    {/* Any other status used to leave an empty coloured box. */}
                    {!['draft', 'eviction-pending', 'expired', 'terminated'].includes(contractData.status) && `Contract status: ${contractData.status}`}
                </div>
            )}

            {/* Executed copies the tenant has already uploaded */}
            {(contractData.signedLeasePath || contractData.notarizedLeasePath) && (
                <div className="w-full max-w-3xl mb-6 print:hidden bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-slate-700 m-0 mb-2">{t('contract.signedCopies')}</p>
                    <div className="flex flex-wrap gap-3">
                        {contractData.signedLeasePath && (
                            <a
                                href={fileUrl(contractData.signedLeasePath)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-2 rounded-xl no-underline"
                            >
                                <FontAwesomeIcon icon={faDownload} />
                                {t('contract.signedLease')}
                            </a>
                        )}
                        {contractData.notarizedLeasePath && (
                            <a
                                href={fileUrl(contractData.notarizedLeasePath)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-2 rounded-xl no-underline"
                            >
                                <FontAwesomeIcon icon={faDownload} />
                                {t('contract.notarizedLease')}
                            </a>
                        )}
                    </div>
                </div>
            )}



            <div className="w-full max-w-3xl mb-4 print:hidden" aria-live="polite">
                {signatureBusy && <InlineAlert tone="info">{t('contract.signatureSaving')}</InlineAlert>}
                {signatureMessage && (
                    <InlineAlert tone={signatureMessage.ok ? 'info' : 'error'} onDismiss={() => setSignatureMessage(null)}>{signatureMessage.text}</InlineAlert>
                )}
            </div>

            {/* ut-native: the contract stays a white sheet of paper in every theme. */}
            <div ref={contractDocRef} className="ut-native w-full max-w-3xl print:w-full">
                <ContractDocument
                    template={template}
                    lang={language}
                    data={contractData}
                    allowUploadSignature={!previewEmail && contractData.status === 'draft'}
                    signatureParties={['tenantSignature']}
                    onUploadSignature={handleTenantSignatureUpload}
                    onRemoveSignature={handleTenantSignatureRemove}
                />
            </div>
        </div>
    );
}