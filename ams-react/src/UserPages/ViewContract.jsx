import { readStoredUser } from '../utils/readStoredUser';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPrint, faArrowLeft, faFileSignature, faDownload, faFileAlt,
    faStamp, faHistory, faCheckCircle, faClock, faExclamationCircle,
    faExternalLinkAlt, faUpload, faFilePdf
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { useLang } from '../config/i18n';
import ContractDocument from '../Components/contract/ContractDocument';
import { fetchContractTemplate } from '../Components/contract/contractTemplate';
import { printElement, isolateBrowserPrint } from '../utils/print';
import { FILE_RULES, checkFile } from '../utils/fileLimits';
import InlineAlert from '../Components/InlineAlert';
import { personName } from '../utils/personName';
import { Bone, SkeletonPage } from '../Components/tenant/Skeleton';

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

const isPdf = (path) => typeof path === 'string' && path.toLowerCase().endsWith('.pdf');

const getRenewalTermLabel = (index, total) => {
    // renewals is ordered newest first (id DESC)
    // The oldest renewal (index === total - 1) archived the initial tenancy contract
    const termNum = total - 1 - index;
    if (termNum === 0) return 'Initial Contract';
    return `Renewal #${termNum}`;
};

export default function ViewContract() {
    const navigate = useNavigate();
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
    const [renewals, setRenewals] = useState([]);
    const [pastContracts, setPastContracts] = useState([]);
    const [selectedTermKey, setSelectedTermKey] = useState('current'); // 'current' | 'renewal-{id}' | 'past-{id}'
    const [activeSubTab, setActiveSubTab] = useState('uploaded'); // 'uploaded' | 'document' | 'notarized'
    const [template, setTemplate] = useState(null);
    const [language, setLanguage] = useState(lang === 'fil' ? 'tl' : 'en');
    const contractDocRef = useRef(null);
    // Ctrl+P prints the agreement exactly like the Print / Save button, on any tab
    // (the Signed copy tab used to print the uploaded file first, then the agreement).
    useEffect(() => isolateBrowserPrint(() => contractDocRef.current), []);

    // Keep the contract body in step with the global language switcher (TopBar)
    const [seenLang, setSeenLang] = useState(lang);
    if (seenLang !== lang) {
        setSeenLang(lang);
        setLanguage(lang === 'fil' ? 'tl' : 'en');
    }

    const loggedInUser = readStoredUser();

    // ?email= is the admin preview path only; tenants read their own contract through ?userId=
    const queryParams = new URLSearchParams(location.search);
    const previewEmail = queryParams.get('email');
    const activeEmail = previewEmail || (loggedInUser ? loggedInUser.email_address : "");

    // Upload signed contract state
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadBusy, setUploadBusy] = useState(false);
    const [uploadNotice, setUploadNotice] = useState(null);
    const [showUploadForm, setShowUploadForm] = useState(false);

    // Tenant signature on document canvas state
    const [signatureMessage, setSignatureMessage] = useState(null);
    const [signatureBusy, setSignatureBusy] = useState(false);

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
                let contractStatus = null;

                if (contractRes.data.success && contractRes.data.contract) {
                    data = contractRes.data.contract;
                    contractStatus = data.status || null;
                    if (Array.isArray(contractRes.data.renewals)) {
                        setRenewals(contractRes.data.renewals);
                    }
                    if (Array.isArray(contractRes.data.pastContracts)) {
                        setPastContracts(contractRes.data.pastContracts);
                    }
                } else if (activeEmail) {
                    const fallbackRes = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);
                    if (fallbackRes.data.success && fallbackRes.data.data) {
                        data = fallbackRes.data.data;
                    }
                }

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
                        depositAmount: formatPeso(data.deposit_amount) || monthlyRent,
                        advanceRent: monthlyRent,
                        depositRefundable: Number(data.deposit_refundable) === 1,
                        entryDate: hasValidStart ? formatLongDate(startDate) : null,
                        leaseEndDate: formatLongDate(data.lease_end),
                        dueDateDay: hasValidStart ? startDate.getDate() : null,
                        isTentative: isTentative,
                        status: contractStatus,
                        contractId: data.id,
                        signedLeasePath: data.signed_lease_path || null,
                        signedLeaseReview: data.signed_lease_review || null,
                        signedLeaseReviewNote: data.signed_lease_review_note || null,
                        signedLeaseUploadedAt: data.signed_lease_uploaded_at || null,
                        notarizedLeasePath: data.notarized_lease_path || null,
                        notarizedAt: data.notarized_at || null,
                        notarizedReadyAt: data.notarized_ready_at || null,
                        tenantSignature: data.tenant_signature_path || null,
                        ownerSignature: data.owner_signature_path || null
                    });

                    // If a signed contract exists, default to the uploaded copy view
                    if (data.signed_lease_path) {
                        setActiveSubTab('uploaded');
                    } else if (contractStatus === 'draft') {
                        setActiveSubTab('document');
                    } else {
                        setActiveSubTab('uploaded');
                    }
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

    const handleUploadSignedLease = async (e) => {
        e?.preventDefault();
        if (!uploadFile || uploadBusy || !contractData?.contractId) return;
        const fileErr = checkFile(uploadFile, FILE_RULES.document);
        if (fileErr) {
            setUploadNotice({ ok: false, text: fileErr });
            return;
        }
        setUploadBusy(true);
        setUploadNotice(null);
        try {
            const formData = new FormData();
            formData.append('contractId', contractData.contractId);
            formData.append('docType', 'signedLease');
            formData.append('file', uploadFile);
            const res = await api.post('/upload_lease_document.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                setContractData(prev => ({
                    ...prev,
                    signedLeasePath: res.data.filePath,
                    signedLeaseReview: res.data.review || 'pending',
                    signedLeaseReviewNote: null,
                }));
                setUploadFile(null);
                setShowUploadForm(false);
                setUploadNotice({ ok: true, text: 'Signed contract uploaded successfully and submitted for management review.' });
                setActiveSubTab('uploaded');
            } else {
                setUploadNotice({ ok: false, text: res.data.message || 'Failed to upload signed contract.' });
            }
        } catch (err) {
            console.error('Failed to upload signed contract:', err);
            setUploadNotice({ ok: false, text: err.response?.data?.message || 'Failed to upload signed contract.' });
        } finally {
            setUploadBusy(false);
        }
    };

    const handleTenantSignatureUpload = async (party, file) => {
        if (!contractData?.contractId || signatureBusy) return;
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
            <SkeletonPage label={t('contract.loading')} maxWidth="max-w-4xl">
                <div aria-hidden="true" className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 space-y-4">
                    <Bone className="mx-auto h-6 w-64 max-w-full" />
                    <Bone className="mx-auto h-3 w-40" />
                    <div className="space-y-2.5 pt-4">
                        {['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-3/4', 'w-full', 'w-2/3'].map((w, i) => <Bone key={i} className={`h-3 ${w}`} />)}
                    </div>
                    <div className="grid grid-cols-2 gap-8 pt-8">
                        <div className="space-y-2"><Bone className="h-12 w-full rounded-xl" /><Bone className="h-3 w-24" /></div>
                        <div className="space-y-2"><Bone className="h-12 w-full rounded-xl" /><Bone className="h-3 w-24" /></div>
                    </div>
                </div>
            </SkeletonPage>
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

    const hasHistory = renewals.length > 0 || pastContracts.length > 0;
    const selectedRenewal = selectedTermKey.startsWith('renewal-')
        ? renewals.find(r => `renewal-${r.id}` === selectedTermKey)
        : null;
    const selectedPastContract = selectedTermKey.startsWith('past-')
        ? pastContracts.find(p => `past-${p.id}` === selectedTermKey)
        : null;

    const renderDocumentViewer = (docPath, docTitle, badge = null, downloadName = 'contract-document') => {
        if (!docPath) {
            return (
                <div className="w-full bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                    <FontAwesomeIcon icon={faFileAlt} className="text-3xl text-slate-400 mb-2" />
                    <p className="text-sm font-semibold m-0">No document file is on record for this view.</p>
                </div>
            );
        }

        const isDocPdf = isPdf(docPath);
        const resolvedUrl = fileUrl(docPath);

        return (
            <div className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2 text-xs">
                    <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={isDocPdf ? faFilePdf : faFileSignature} className={isDocPdf ? "text-rose-600 text-base" : "text-indigo-600 text-base"} />
                        <span className="font-bold text-slate-800">{docTitle}</span>
                        {badge}
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={resolvedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 no-underline shadow-xs transition-colors"
                        >
                            <FontAwesomeIcon icon={faExternalLinkAlt} />
                            <span>Open in New Tab</span>
                        </a>
                        <a
                            href={resolvedUrl}
                            download={downloadName}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 no-underline shadow-xs transition-colors"
                        >
                            <FontAwesomeIcon icon={faDownload} />
                            <span>Download</span>
                        </a>
                    </div>
                </div>

                {isDocPdf ? (
                    <div className="w-full bg-slate-100 p-2 sm:p-4">
                        <iframe
                            src={resolvedUrl}
                            title={docTitle}
                            className="w-full h-[650px] sm:h-[750px] border border-slate-200 rounded-xl bg-white shadow-xs"
                        />
                    </div>
                ) : (
                    <div className="w-full bg-slate-900/5 p-4 sm:p-8 flex justify-center items-center">
                        <img
                            src={resolvedUrl}
                            alt={docTitle}
                            className="max-w-full max-h-[850px] object-contain rounded-xl shadow-md border border-slate-200 bg-white"
                        />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="view-contract-root w-full min-h-[calc(100vh-76px)] bg-slate-100 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center print:bg-white print:py-0 print:px-0">
            <h1 className="sr-only print:hidden">{t('contract.heading')}</h1>

            {/* Top Navigation & Toolbar */}
            <div className="view-contract-controls animate-fade-in w-full max-w-4xl flex flex-wrap justify-between items-center gap-3 mb-5 print:hidden select-none">
                <button
                    onClick={goBack}
                    className="btn-interactive flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs border border-slate-200 shadow-xs cursor-pointer transition-all"
                >
                    <FontAwesomeIcon icon={faArrowLeft} />
                    <span>{t('contract.goBack')}</span>
                </button>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Contract Term / History Selector */}
                    {hasHistory && (
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
                            <FontAwesomeIcon icon={faHistory} className="text-indigo-600 text-xs" />
                            <label htmlFor="contract-term-select" className="sr-only">Contract Term</label>
                            <select
                                id="contract-term-select"
                                value={selectedTermKey}
                                onChange={(e) => setSelectedTermKey(e.target.value)}
                                className="text-xs font-bold text-slate-700 bg-transparent border-0 cursor-pointer focus:outline-none"
                            >
                                <option value="current">
                                    {renewals.length > 0
                                        ? `Current Term (Renewal #${renewals.length}: ${contractData.entryDate || 'Start'} – ${contractData.leaseEndDate || 'Current'})`
                                        : `Current Term (${contractData.entryDate || 'Start'} – ${contractData.leaseEndDate || 'Current'})`}
                                </option>
                                {renewals.map((r, i) => {
                                    const termLabel = getRenewalTermLabel(i, renewals.length);
                                    return (
                                        <option key={`renewal-${r.id}`} value={`renewal-${r.id}`}>
                                            {termLabel} (Ended {formatLongDate(r.previous_lease_end)})
                                        </option>
                                    );
                                })}
                                {pastContracts.map((p) => (
                                    <option key={`past-${p.id}`} value={`past-${p.id}`}>
                                        Past Contract: {p.room_name || 'Room'} ({formatLongDate(p.lease_start)} – {formatLongDate(p.lease_end)})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Language Switcher for Official Agreement */}
                    {activeSubTab === 'document' && selectedTermKey === 'current' && (
                        <div className="lang-selector flex bg-slate-200/80 p-1 rounded-xl border border-slate-300">
                            <button
                                onClick={() => setLanguage('tl')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${language === 'tl' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                                {t('contract.tagalog')}
                            </button>
                            <button
                                onClick={() => setLanguage('en')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${language === 'en' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                                {t('contract.english')}
                            </button>
                        </div>
                    )}

                    {/* Print / Save button */}
                    <button
                        onClick={handlePrintAction}
                        className="btn-interactive flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs border-0 shadow-sm cursor-pointer transition-all"
                    >
                        <FontAwesomeIcon icon={faPrint} />
                        <span>{t('contract.printSave')}</span>
                    </button>
                </div>
            </div>

            {/* Status alerts & notifications */}
            <div className="w-full max-w-4xl print:hidden space-y-3 mb-5" aria-live="polite">
                {contractData.status && contractData.status !== 'active' && (
                    <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
                        contractData.status === 'draft' ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : contractData.status === 'eviction-pending' ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-slate-100 border-slate-300 text-slate-600'
                    }`}>
                        {contractData.status === 'draft' && t('contract.statusDraft')}
                        {contractData.status === 'eviction-pending' && t('contract.statusEvictionPending')}
                        {contractData.status === 'expired' && t('contract.statusExpired')}
                        {contractData.status === 'terminated' && t('contract.statusTerminated')}
                        {!['draft', 'eviction-pending', 'expired', 'terminated'].includes(contractData.status) && `Contract status: ${contractData.status}`}
                    </div>
                )}

                {signatureBusy && <InlineAlert tone="info">{t('contract.signatureSaving')}</InlineAlert>}
                {signatureMessage && (
                    <InlineAlert tone={signatureMessage.ok ? 'info' : 'error'} onDismiss={() => setSignatureMessage(null)}>
                        {signatureMessage.text}
                    </InlineAlert>
                )}
                {uploadNotice && (
                    <InlineAlert tone={uploadNotice.ok ? 'success' : 'error'} onDismiss={() => setUploadNotice(null)}>
                        {uploadNotice.text}
                    </InlineAlert>
                )}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="w-full max-w-4xl">
                {/* 1. VIEWING A HISTORICAL RENEWAL TERM */}
                {selectedRenewal && (() => {
                    const renewalIndex = renewals.findIndex(r => r.id === selectedRenewal.id);
                    const termLabel = getRenewalTermLabel(renewalIndex >= 0 ? renewalIndex : 0, renewals.length);
                    const isInitial = termLabel === 'Initial Contract';

                    return (
                        <div className="space-y-6">
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                                    <div>
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 mb-1">
                                            <FontAwesomeIcon icon={faHistory} />
                                            <span>{isInitial ? 'Initial Contract Record' : 'Historical Term Record'}</span>
                                        </span>
                                        <h2 className="text-lg font-bold text-slate-900 m-0">
                                            {isInitial ? 'Initial Tenancy Contract' : `${termLabel} Term Record`}
                                        </h2>
                                        <p className="text-xs text-slate-500 m-0 mt-0.5">
                                            Term ended {formatLongDate(selectedRenewal.previous_lease_end)} · Extended by +{selectedRenewal.added_months} month(s) on {formatLongDate(selectedRenewal.created_at)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500 m-0">Rent for term</p>
                                        <p className="text-base font-bold text-slate-900 m-0">
                                            ₱{Number(selectedRenewal.previous_rent || selectedRenewal.rent_at_renewal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <span className="text-slate-500 block">Term End Date</span>
                                        <strong className="text-slate-800 text-sm">{formatLongDate(selectedRenewal.previous_lease_end)}</strong>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <span className="text-slate-500 block">Extended Until</span>
                                        <strong className="text-slate-800 text-sm">{formatLongDate(selectedRenewal.new_lease_end)}</strong>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
                                        <span className="text-slate-500 block">Extension Added</span>
                                        <strong className="text-slate-800 text-sm">+{selectedRenewal.added_months} month(s)</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Historical Executed Documents */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
                                    <FontAwesomeIcon icon={faFileSignature} className="text-indigo-600" />
                                    <span>Archived Documents for this Term</span>
                                </h3>

                                {selectedRenewal.previous_signed_lease_path ? (
                                    renderDocumentViewer(
                                        selectedRenewal.previous_signed_lease_path,
                                        `Signed Contract Copy (${termLabel} ended ${formatLongDate(selectedRenewal.previous_lease_end)})`,
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">{termLabel} Copy</span>,
                                        `${termLabel.toLowerCase().replace(/[^a-z0-9]/g, '-')}-contract-${selectedRenewal.id}`
                                    )
                                ) : (
                                    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 text-xs">
                                        <FontAwesomeIcon icon={faFileAlt} className="text-2xl text-slate-400 mb-2" />
                                        <p className="m-0 font-medium">No uploaded signed copy was archived for this earlier term.</p>
                                    </div>
                                )}

                                {selectedRenewal.previous_notarized_lease_path && (
                                    <div className="pt-2">
                                        <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                                            <FontAwesomeIcon icon={faStamp} className="text-sky-600" />
                                            <span>Notarized Copy for this Term</span>
                                        </h4>
                                        {renderDocumentViewer(
                                            selectedRenewal.previous_notarized_lease_path,
                                            `Notarized Contract Copy (${termLabel} ended ${formatLongDate(selectedRenewal.previous_lease_end)})`,
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">Notarized</span>,
                                            `notarized-${termLabel.toLowerCase().replace(/[^a-z0-9]/g, '-')}-contract-${selectedRenewal.id}`
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* 2. VIEWING A PAST CONTRACT ROW */}
                {selectedPastContract && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                                <div>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 mb-1">
                                        <FontAwesomeIcon icon={faHistory} />
                                        <span>Past Tenancy Contract</span>
                                    </span>
                                    <h2 className="text-lg font-bold text-slate-900 m-0">Contract #{selectedPastContract.id} (Unit {selectedPastContract.room_name})</h2>
                                </div>
                                <div className="text-right">
                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700 capitalize">
                                        {selectedPastContract.status}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="text-slate-500 block">Lease Start</span>
                                    <strong className="text-slate-800 text-sm">{formatLongDate(selectedPastContract.lease_start)}</strong>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="text-slate-500 block">Lease End</span>
                                    <strong className="text-slate-800 text-sm">{formatLongDate(selectedPastContract.lease_end)}</strong>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
                                    <span className="text-slate-500 block">Monthly Rent</span>
                                    <strong className="text-slate-800 text-sm">{formatPeso(selectedPastContract.monthly_rent)}</strong>
                                </div>
                            </div>
                        </div>

                        {selectedPastContract.signed_lease_path ? (
                            renderDocumentViewer(
                                selectedPastContract.signed_lease_path,
                                `Past Signed Contract (Unit ${selectedPastContract.room_name})`,
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">Past Tenancy</span>,
                                `past-contract-${selectedPastContract.id}`
                            )
                        ) : (
                            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500 text-xs">
                                <p className="m-0 font-medium">No uploaded contract copy is on file for this past tenancy.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. VIEWING THE CURRENT TERM */}
                {selectedTermKey === 'current' && (
                    <div className="space-y-5">
                        {/* Current Term Sub-Tabs */}
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 print:hidden">
                            <button
                                type="button"
                                onClick={() => setActiveSubTab('uploaded')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
                                    activeSubTab === 'uploaded'
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                                }`}
                            >
                                <FontAwesomeIcon icon={faFileSignature} />
                                <span>Uploaded Signed Contract</span>
                                {contractData.signedLeasePath && contractData.signedLeaseReview === 'pending' && (
                                    <span className="px-2 py-0.5 text-[10px] bg-amber-400 text-amber-950 rounded-full font-bold">Review</span>
                                )}
                                {contractData.signedLeasePath && contractData.signedLeaseReview === 'rejected' && (
                                    <span className="px-2 py-0.5 text-[10px] bg-rose-500 text-white rounded-full font-bold">Returned</span>
                                )}
                                {!contractData.signedLeasePath && (
                                    <span className="px-2 py-0.5 text-[10px] bg-amber-500 text-white rounded-full font-bold">Required</span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveSubTab('document')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
                                    activeSubTab === 'document'
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                                }`}
                            >
                                <FontAwesomeIcon icon={faFileAlt} />
                                <span>Official Agreement (Text / Print)</span>
                            </button>

                            {contractData.notarizedLeasePath && (
                                <button
                                    type="button"
                                    onClick={() => setActiveSubTab('notarized')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
                                        activeSubTab === 'notarized'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                            : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                                    }`}
                                >
                                    <FontAwesomeIcon icon={faStamp} />
                                    <span>Notarized Copy</span>
                                </button>
                            )}
                        </div>

                        {/* TAB 1: UPLOADED SIGNED CONTRACT */}
                        {activeSubTab === 'uploaded' && (
                            <div className="space-y-4">
                                {/* Earlier archived contract helper banner */}
                                {!contractData.signedLeasePath && renewals.length > 0 && (
                                    <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-950">
                                        <div className="flex items-center gap-2.5">
                                            <FontAwesomeIcon icon={faHistory} className="text-indigo-600 text-lg" />
                                            <div>
                                                <p className="font-bold m-0 text-indigo-900">
                                                    Your {getRenewalTermLabel(renewals.length - 1, renewals.length)} copy is preserved in history.
                                                </p>
                                                <p className="text-indigo-700 m-0 mt-0.5">
                                                    Term ended {formatLongDate(renewals[renewals.length - 1].previous_lease_end)}. You can view your uploaded copy anytime.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedTermKey(`renewal-${renewals[renewals.length - 1].id}`)}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer transition-colors border-0"
                                        >
                                            <FontAwesomeIcon icon={faFileSignature} />
                                            <span>View {getRenewalTermLabel(renewals.length - 1, renewals.length)} Copy</span>
                                        </button>
                                    </div>
                                )}

                                {/* Upload / Replacement Form */}
                                {(!contractData.signedLeasePath || showUploadForm || contractData.signedLeaseReview === 'rejected') && (
                                    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <h3 className="text-sm sm:text-base font-bold text-slate-800 m-0 flex items-center gap-2">
                                                <FontAwesomeIcon icon={faUpload} className="text-indigo-600" />
                                                <span>{contractData.signedLeasePath ? 'Upload Replacement Signed Contract' : 'Upload Your Signed Contract'}</span>
                                            </h3>
                                            {contractData.signedLeasePath && showUploadForm && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowUploadForm(false)}
                                                    className="text-xs text-slate-500 hover:text-slate-800 font-bold cursor-pointer border-0 bg-transparent"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>

                                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                                            {contractData.status === 'active' && !contractData.signedLeasePath
                                                ? 'Your rent term has been extended. Please print or review the official agreement, sign it, and upload the photo or PDF copy here to update your tenancy records.'
                                                : 'Upload a clear scan or photo of your signed rent agreement. Management will review and verify your copy.'}
                                        </p>

                                        <form onSubmit={handleUploadSignedLease} className="space-y-4">
                                            <div className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-6 text-center bg-slate-50 transition-colors">
                                                <input
                                                    type="file"
                                                    id="signed-contract-file-input"
                                                    accept=".pdf,image/png,image/jpeg,image/jpg"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0] || null;
                                                        setUploadFile(file);
                                                        setUploadNotice(null);
                                                    }}
                                                    className="sr-only"
                                                />
                                                <label htmlFor="signed-contract-file-input" className="cursor-pointer block">
                                                    <FontAwesomeIcon icon={uploadFile ? faFilePdf : faUpload} className="text-3xl text-indigo-500 mb-2" />
                                                    <p className="text-xs sm:text-sm font-bold text-slate-800 m-0">
                                                        {uploadFile ? uploadFile.name : 'Click to select signed contract file'}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 mt-1 m-0">
                                                        {uploadFile ? `${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Supported: PDF, JPG, PNG (Max 10MB)'}
                                                    </p>
                                                </label>
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveSubTab('document')}
                                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold bg-transparent border-0 cursor-pointer p-0"
                                                >
                                                    View / Print Official Agreement Text
                                                </button>

                                                <button
                                                    type="submit"
                                                    disabled={!uploadFile || uploadBusy}
                                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
                                                >
                                                    <FontAwesomeIcon icon={uploadBusy ? faClock : faUpload} className={uploadBusy ? 'animate-spin' : ''} />
                                                    <span>{uploadBusy ? 'Uploading…' : 'Submit Signed Contract'}</span>
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                {/* If tenant has uploaded signed lease, render the viewer */}
                                {contractData.signedLeasePath && (
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3 rounded-xl border border-slate-200">
                                            <div className="flex items-center gap-2">
                                                {contractData.signedLeaseReview === 'pending' && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                                        <FontAwesomeIcon icon={faClock} />
                                                        <span>Under Management Review</span>
                                                    </span>
                                                )}
                                                {contractData.signedLeaseReview === 'accepted' && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                                        <FontAwesomeIcon icon={faCheckCircle} />
                                                        <span>Verified & On File</span>
                                                    </span>
                                                )}
                                                {contractData.signedLeaseReview === 'rejected' && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                                                        <FontAwesomeIcon icon={faExclamationCircle} />
                                                        <span>Returned: {contractData.signedLeaseReviewNote || 'Please re-upload a clear copy'}</span>
                                                    </span>
                                                )}
                                                {!contractData.signedLeaseReview && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                                                        <FontAwesomeIcon icon={faCheckCircle} />
                                                        <span>On File</span>
                                                    </span>
                                                )}
                                            </div>

                                            {!showUploadForm && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowUploadForm(true)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                                                >
                                                    <FontAwesomeIcon icon={faUpload} />
                                                    <span>Upload Replacement</span>
                                                </button>
                                            )}
                                        </div>

                                        {renderDocumentViewer(
                                            contractData.signedLeasePath,
                                            'Current Signed Rent Contract Copy',
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">Current</span>,
                                            `signed-contract-${contractData.contractId}`
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 2: OFFICIAL AGREEMENT (TEXT / PRINT) */}
                        <div className={activeSubTab === 'document' ? 'ut-native w-full' : 'hidden print:block'}>
                            <div ref={contractDocRef} className="w-full">
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

                        {/* TAB 3: NOTARIZED COPY */}
                        {activeSubTab === 'notarized' && contractData.notarizedLeasePath && (
                            <div className="space-y-4">
                                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-900 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FontAwesomeIcon icon={faStamp} className="text-sky-600 text-base" />
                                        <div>
                                            <p className="font-bold m-0">Notarized Tenancy Agreement</p>
                                            <p className="text-sky-700 m-0 mt-0.5">Verified and recorded by apartment management.</p>
                                        </div>
                                    </div>
                                </div>

                                {renderDocumentViewer(
                                    contractData.notarizedLeasePath,
                                    'Notarized Rent Contract',
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">Notarized</span>,
                                    `notarized-contract-${contractData.contractId}`
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
