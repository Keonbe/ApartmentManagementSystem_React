import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faArrowLeft, faHourglassHalf, faFileSignature, faDownload } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { useLang } from '../config/i18n';
import { getSystemSettings } from '../config/systemSettings';
import '../assets/styles/responsive/user/view-contract.responsive.css';

const BLANK_LINE = '____________________';
const BLANK_FIELD = '_________________________________________';

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
    const location = useLocation();
    const { t, lang } = useLang();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isEmpty, setIsEmpty] = useState(false);
    const [contractData, setContractData] = useState(null);
    const [landlord, setLandlord] = useState({ name: '', address: '', contact: '', propertyAddress: '' });
    const [language, setLanguage] = useState(lang === 'fil' ? 'tl' : 'en'); // 'tl' | 'en'

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
        getSystemSettings().then((s) => setLandlord({
            name: s.landlordName || '',
            address: s.landlordAddress || '',
            contact: s.landlordContact || '',
            propertyAddress: s.propertyAddress || ''
        }));
    }, []);

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

                if (data) {
                    const isTentative = !data.lease_start;
                    const entryDateRaw = data.lease_start || data.created_at || data.app_created_at;
                    const startDate = entryDateRaw ? new Date(entryDateRaw) : null;
                    const hasValidStart = startDate && !isNaN(startDate.getTime());

                    const cleanRoomName = data.room_name ? data.room_name.replace(/^Room\s+/i, '') : null;
                    const monthlyRent = formatPeso(data.monthly_rent);

                    setContractData({
                        tenantName: `${data.first_name || ""} ${data.last_name || ""}`.trim() || `${loggedInUser?.first_name || ""} ${loggedInUser?.last_name || ""}`.trim(),
                        tenantEmail: activeEmail,
                        tenantPhone: data.contact_no || BLANK_LINE,
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
                        signedLeasePath: data.signed_lease_path || null,
                        notarizedLeasePath: data.notarized_lease_path || null
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
        window.print();
    };

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="flex flex-col items-center space-y-4">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-4xl text-indigo-500 animate-spin" />
                    <h2 className="text-xl font-bold">{t('contract.loading')}</h2>
                </div>
            </div>
        );
    }

    if (isEmpty) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="bg-slate-800/80 p-8 rounded-3xl border border-white/10 text-center max-w-md space-y-4 shadow-2xl">
                    <FontAwesomeIcon icon={faFileSignature} className="text-4xl text-slate-500" />
                    <h2 className="text-xl font-bold text-slate-200">{t('contract.emptyTitle')}</h2>
                    <p className="text-slate-400 text-sm">{t('contract.emptyBody')}</p>
                    <button
                        onClick={() => navigate(-1)}
                        className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl transition-all border-0 cursor-pointer text-xs"
                    >
                        {t('contract.goBack')}
                    </button>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="bg-slate-800/80 p-8 rounded-3xl border border-white/10 text-center max-w-md space-y-4 shadow-2xl">
                    <h2 className="text-2xl font-bold text-rose-500">{t('contract.errTitle')}</h2>
                    <p className="text-slate-400 text-sm">{error}</p>
                    <button
                        onClick={() => navigate(-1)}
                        className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl transition-all border-0 cursor-pointer text-xs"
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
                    onClick={() => navigate(-1)}
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

            <style>
                {`
                    @media print {
                        @page {
                            size: A4 portrait;
                            margin: 10mm 15mm 10mm 15mm;
                        }
                        nav, footer, .print\\:hidden, button {
                            display: none !important;
                        }
                        body {
                            background-color: #fff !important;
                            color: #000 !important;
                            font-family: Arial, "Helvetica Neue", sans-serif !important;
                            font-size: 10.5pt !important;
                            line-height: 1.45 !important;
                        }
                        .contract-page {
                            box-shadow: none !important;
                            border: none !important;
                            padding: 0 !important;
                            margin: 0 !important;
                            max-width: 100% !important;
                            min-height: 270mm !important;
                            display: flex !important;
                            flex-direction: column !important;
                            justify-content: space-between !important;
                            page-break-after: always !important;
                            page-break-inside: avoid !important;
                        }
                        .contract-page:last-child {
                            page-break-after: auto !important;
                        }
                        hr {
                            border: none !important;
                            border-top: 1px solid #000 !important;
                            margin: 8pt 0 !important;
                        }
                    }
                `}
            </style>

            {/* 4-PAGE FORMAL LEGAL CONTRACT WRAPPER */}
            <div className="w-full max-w-3xl space-y-8 print:space-y-0 print:w-full">
                {language === 'tl' ? (
                    <>
                        {/* ================= PAGE 1 ================= */}
                        <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
                            <div>
                                {/* Page Header */}
                                <div className="text-center mb-6">
                                    <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase m-0">KONTRATA SA PAGPAPAUPA NG APARTMENT</h2>
                                    <p className="text-rose-600 font-semibold italic text-[11px] m-0 mt-0.5">(Kopya ng Nangungupahan)</p>
                                </div>

                                <div className="space-y-3">
                                    <p className="m-0 font-bold text-slate-900">SA PAGITAN NG:</p>
                                    <div className="space-y-1 text-sm pl-2">
                                        <p className="m-0"><strong>Pangalan ng May-ari ng Apartment:</strong> {landlord.name || BLANK_FIELD}</p>
                                        <p className="m-0"><strong>Tirahan ng May-ari:</strong> {landlord.address || BLANK_FIELD}</p>
                                        <p className="m-0"><strong>Telepono ng May-ari:</strong> {landlord.contact || BLANK_FIELD}</p>
                                        <p className="m-0 font-bold py-1">AT</p>
                                        <p className="m-0"><strong>Pangalan ng Nangungupahan:</strong> <span className="underline font-semibold">{contractData.tenantName || BLANK_FIELD}</span></p>
                                        <p className="m-0"><strong>Tirahan ng Nangungupahan:</strong> <span className="underline font-semibold">{BLANK_FIELD}</span></p>
                                        <p className="m-0"><strong>Telepono ng Nangungupahan:</strong> <span className="underline font-semibold">{contractData.tenantPhone || BLANK_FIELD}</span></p>
                                        <p className="m-0"><strong>Letra ng Itinalagang Kwarto:</strong> <span className="underline font-semibold">Room {contractData.roomName || '______'}</span></p>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div>
                                        <h3 className="font-bold text-slate-900 uppercase text-sm m-0 mb-1">PAKSA: PAGPAPAUPA NG APARTMENT</h3>
                                        <p className="m-0">Sa ilalim ng mga sumusunod na kondisyon, ang May-ari at ang Nangungupahan ay nagkasunduan sa mga sumusunod na tuntunin ng pagrenta ng apartment:</p>
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">I. PAGLALARAWAN NG APARTMENT</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Lokasyon at Adres ng Apartment:</strong><br />{landlord.propertyAddress || BLANK_FIELD}</p>
                                            <p className="m-0"><strong>2. Deskripsyon ng Apartment:</strong><br />Ang apartment ay may isang (1) kwarto, isang (1) palikuran, at may sapat na espasyo para sa kusina at sala. Ang unit ay may tamang laki para sa isang maliit na pamilya, grupo, o indibidwal na naghahanap ng simpleng tirahan. May mga bintana na nagbibigay liwanag at hangin, at ang apartment ay nasa maayos na kondisyon.</p>
                                            <p className="m-0"><strong>3. Pinakamataas na Kapasidad ng Apartment:</strong><br />Ang pinakamataas na kapasidad ng apartment ay apat (4) na tao lamang. Kung sakaling lalagpas sa apat (4) na tao, kinakailangan ng Nangungupahan na magbayad ng karagdagang ₱1,000 kada tao na lalagpas sa itinakdang kapasidad. Ang mga dagdag na bayad na ito ay dapat bayaran kasama ng buwanang upa at hindi maaaring kunin mula sa security deposit.</p>
                                            <p className="m-0"><strong>4. Petsa ng Pagpasok:</strong> <span className="underline font-semibold">{contractData.entryDate || '______________________________________________'}</span> {contractData.isTentative && <span className="text-rose-600 font-semibold">(Panimula — Hindi pa Pinal)</span>}</p>
                                            <p className="m-0"><strong>5. Panahon ng Pag-upa:</strong> <span className="underline font-semibold">{contractData.entryDate || '____________________'}</span> hanggang <span className="underline font-semibold">{contractData.leaseEndDate || '____________________'}</span></p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div className="space-y-2 pt-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">II. MGA TUNTUNIN SA PAGBABAYAD NG UPA</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Halaga ng Buwanang Upa:</strong><br />Ang buwanang upa para sa Room <strong>{contractData.roomName || '__'}</strong> ay <strong className="underline">{contractData.monthlyRent || '____________'}</strong> kada buwan.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Page Footer */}
                            <div className="mt-8 pt-4 flex justify-between items-end text-xs font-sans print:mt-auto">
                                <span className="text-slate-500 font-semibold">Page 1 of 4</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-64 border-b border-slate-400 mb-1"></div>
                                    <span className="font-semibold text-slate-800 text-[10px]">Pangalan at Pirma ng Nangungupahan</span>
                                </div>
                            </div>
                        </div>

                        {/* ================= PAGE 2 ================= */}
                        <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
                            <div>
                                {/* Page Header */}
                                <div className="text-center mb-6">
                                    <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase m-0">KONTRATA SA PAGPAPAUPA NG APARTMENT</h2>
                                    <p className="text-rose-600 font-semibold italic text-[11px] m-0 mt-0.5">(Kopya ng Nangungupahan)</p>
                                </div>

                                <div className="space-y-3">
                                    <div className="pl-4 space-y-3">
                                        <p className="m-0"><strong>2. Pangunahing Paraan ng Pagbabayad:</strong><br />Ang pagbabayad ng renta ay maaaring gawin sa alinman sa mga sumusunod na paraan:</p>
                                        <ul className="list-disc pl-6 m-0 space-y-1">
                                            <li><strong>GCash:</strong> *********** ({landlord.name || '—'})</li>
                                            <li><strong>Banko</strong>
                                                <ul className="list-none pl-4 space-y-0.5">
                                                    <li>✓ <strong>BDO:</strong> ************ (Savings account)</li>
                                                    <li>✓ <strong>BPI:</strong> *********** (Savings account)</li>
                                                </ul>
                                            </li>
                                            <li><strong>Cash:</strong> Maaaring iabot nang direkta sa May-ari ng apartment.</li>
                                        </ul>

                                        <p className="m-0 mt-2"><strong>3. Paunang Bayad sa Upa (Advance Rent):</strong><br />Bago pumasok sa unit, ang Nangungupahan ay magbabayad ng paunang upa para sa unang buwan na nagkakahalaga ng <strong className="underline">{contractData.advanceRent || '____________'}</strong>. Ito ay ibinibilang sa upa ng unang buwan ng pananatili at hindi bahagi ng security deposit.</p>

                                        <p className="m-0 mt-2"><strong>4. Security Deposit:</strong><br />Bukod sa paunang upa, ang Nangungupahan ay magbabayad ng security deposit na nagkakahalaga ng <strong className="underline">{contractData.depositAmount || '____________'}</strong>, katumbas ng isang buwang upa. Ang deposito ay magsisilbing garantiya para sa mga posibleng pinsala o hindi nabayarang gastusin.</p>

                                        <p className="m-0"><strong>Paggamit ng Security Deposit:</strong><br />Ang security deposit ay <strong>hindi ibinabalik bilang cash</strong>. Sa halip, ito ay <strong>ikinakaltas sa mga hindi nabayarang upa, singil sa kuryente at tubig, o pinsala</strong> sa unit at mga kagamitan nito. Kung wala nang natitirang kaltas sa pagtatapos ng kontrata, maaari itong ipambayad sa huling buwan ng pag-upa.</p>

                                        <p className="m-0 mt-2"><strong>5. Paalala sa Takdang Araw ng Bayad:</strong><br />Ang bayad sa upa ay dapat maibigay bago o sa takdang araw ng bawat buwan. Ang buwanang takdang araw ng pagbabayad ay ang ika-<span className="underline font-semibold">{contractData.dueDateDay || '__'}</span> ng buwan.<br />
                                        <strong>Tandaan:</strong> Kung sakaling hindi makapagbayad bago ang itinakdang due date, hinihikayat ang Nangungupahan na agad makipag-ugnayan sa May-ari upang mapag-usapan ang posibilidad ng palugit o alternatibong paraan ng pagbabayad.</p>

                                        <p className="m-0"><strong>6. Payo sa Pagbabayad ng Upa:</strong><br />Walang multang ipinapataw kung magbabayad sa mismong takdang araw. Subalit, <strong>hinihikayat ang Nangungupahan na magbayad sa tamang oras at araw</strong> ng bawat buwan upang maiwasan ang mga aberya na maaaring magresulta sa <strong>pagpapawalang-bisa ng kontrata o pagpapaalis sa apartment</strong>.<br />Kung sakaling nahirapan sa pagbabayad, <strong>maaaring makipag-ugnayan sa May-ari</strong> upang humiling ng <strong>palugit sa pagbabayad</strong>. Ang May-ari ay may konsiderasyon at maaaring magbigay ng palugit batay sa sitwasyon ng Nangungupahan.</p>

                                        <p className="m-0"><strong>7. Pagpapatunay ng Pagbabayad:</strong><br />Kung ang Nangungupahan ay nagbayad sa pamamagitan ng <strong>GCash o bank transfer</strong>, kinakailangan nilang magpadala ng <strong>larawan ng resibo (screenshot)</strong> ng kanilang pagbabayad sa May-ari sa pamamagitan ng <strong>Facebook Messenger</strong> sa account na <strong>{landlord.name || '—'}</strong>. Ang larawang ito ng pagbabayad ay</p>
                                    </div>
                                </div>
                            </div>

                            {/* Page Footer */}
                            <div className="mt-8 pt-4 flex justify-between items-end text-xs font-sans print:mt-auto">
                                <span className="text-slate-500 font-semibold">Page 2 of 4</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-64 border-b border-slate-400 mb-1"></div>
                                    <span className="font-semibold text-slate-800 text-[10px]">Pangalan at Pirma ng Nangungupahan</span>
                                </div>
                            </div>
                        </div>

                        {/* ================= PAGE 3 ================= */}
                        <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
                            <div>
                                {/* Page Header */}
                                <div className="text-center mb-6">
                                    <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase m-0">KONTRATA SA PAGPAPAUPA NG APARTMENT</h2>
                                    <p className="text-rose-600 font-semibold italic text-[11px] m-0 mt-0.5">(Kopya ng Nangungupahan)</p>
                                </div>

                                <div className="space-y-3">
                                    <p className="m-0">magsisilbing patunay ng kanilang obligasyon sa pagbabayad ng upa para sa kasalukuyang buwan.</p>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div className="space-y-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">III. MGA RESPONSIBILIDAD NG MAY-ARI</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Pag-aalaga at Pag-maintenance:</strong><br />Ang May-ari ay responsable sa pagpapagawa ng mga pangunahing sira at pagkukumpuni ng apartment. Ang mga pangunahing sira ay may kinalaman sa mga sistema ng tubig, kuryente, at estruktura ng apartment.</p>
                                            <p className="m-0"><strong>2. Pagbibigay ng Maayos na Tirahan:</strong><br />Tinitiyak ng May-ari na ang apartment ay malinis, maayos, at ligtas gamitin bago magpatuloy ang pagrenta.</p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div className="space-y-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">IV. MGA RESPONSIBILIDAD NG NANGUNGUPAHAN</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Pag-aalaga ng Apartment:</strong><br />Ang Nangungupahan ay dapat mag-ingat at mag-maintain ng kalinisan at kaayusan ng apartment, pati na ang mga gamit at kagamitan na kasama sa unit.</p>
                                            <p className="m-0"><strong>2. Hindi Pagpapabago ng Estruktura:</strong><br />Hindi maaaring baguhin, sirain, o gawing permanenteng gamit ang anumang bahagi ng apartment (halimbawa, magbutas ng pader, magdikit sa pader gamit ang pandikit na mahirap alisin) nang walang pahintulot ng May-ari.</p>
                                            <p className="m-0"><strong>3. Pagbabayad ng mga Singil sa Serbisyo:</strong><br />Ang Nangungupahan ay mananagot sa lahat ng mga gastusin sa kuryente, tubig, internet, at iba pang serbisyo maliban kung magkakaroon ng ibang kasunduan.</p>
                                            <p className="m-0"><strong>4. Hindi Pagbabayad ng Kuryente at Tubig:</strong><br />Kung sakaling maputulan ng <strong>kuryente at tubig</strong> ang apartment dahil sa hindi pagbabayad ng mga singil, hindi magiging <strong>responsibilidad</strong> ng May-ari ang pagbabayad para sa muling pagkonekta sa mga serbisyong ito. Ang Nangungupahan ay <strong>dapat magbayad</strong> ng mga nakaraang singil at tiyakin ang agarang pagbabayad upang maiwasan ang pagkaantala sa mga serbisyong ito. Ang May-ari ay hindi mananagot para sa anumang abala o istorbong dulot ng hindi pagkakaroon ng kuryente at tubig.</p>
                                            <p className="m-0"><strong>5. Pagtanggap sa Pagsusuri ng Unit:</strong><br />Ang Nangungupahan ay papayag na magsagawa ng pagsusuri o inspeksyon ang May-ari sa unit para tiyakin na ito ay nasa tamang kondisyon at walang sira o pinsala sa mga kagamitan.</p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />
                                </div>
                            </div>

                            {/* Page Footer */}
                            <div className="mt-8 pt-4 flex justify-between items-end text-xs font-sans print:mt-auto">
                                <span className="text-slate-500 font-semibold">Page 3 of 4</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-64 border-b border-slate-400 mb-1"></div>
                                    <span className="font-semibold text-slate-800 text-[10px]">Pangalan at Pirma ng Nangungupahan</span>
                                </div>
                            </div>
                        </div>

                        {/* ================= PAGE 4 ================= */}
                        <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
                            <div>
                                {/* Page Header */}
                                <div className="text-center mb-6">
                                    <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase m-0">KONTRATA SA PAGPAPAUPA NG APARTMENT</h2>
                                    <p className="text-rose-600 font-semibold italic text-[11px] m-0 mt-0.5">(Kopya ng Nangungupahan)</p>
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">V. PAGWAWAKAS NG KONTRATA</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Paglabag sa Mga Tuntunin ng Kontrata:</strong><br />Ang May-ari o ang Nangungupahan ay may karapatan na tapusin ang kontrata kung may malubhang paglabag sa mga kondisyon ng kasunduan.</p>
                                            <p className="m-0"><strong>2. Pagtatapos ng Kontrata:</strong><br />Kung nais ng alinmang panig na tapusin ang kontrata, kinakailangan na magbigay ng paunang abiso sa kabilang panig ng hindi bababa sa 15 na araw bago ang aktwal na paglabas ng Nangungupahan.</p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div className="space-y-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">VI. IBA PANG MGA TUNTUNIN</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Paglilipat ng Karapatan:</strong><br />Hindi maaaring ilipat, isalin, o ipaupa muli ng Nangungupahan sa iba ang mga karapatan o responsibilidad na nakasaad sa kontratang ito nang walang nakasulat na pahintulot mula sa May-ari.</p>
                                            <p className="m-0"><strong>2. Pagbabago ng Kasunduan:</strong><br />Ang anumang pagbabago o karagdagan sa kontratang ito ay magiging epektibo lamang kapag nakasulat at pinirmahan ng parehong partido.</p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    {/* Section VII & Signatures matching Apartment-Contract.pdf */}
                                    <div className="space-y-4 pt-1">
                                        <div>
                                            <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">VII. PAGPIRMA</h3>
                                            <p className="m-0 mt-1">Pinagtibay at pinirmahan ng dalawang partido ang kontratang ito bilang patunay ng kanilang kasunduan.</p>
                                        </div>

                                        <p className="m-0 font-semibold text-slate-900">Pinirmahan ng:</p>

                                        <div className="contract-signature-grid grid grid-cols-2 gap-8 text-sm font-sans pt-1">
                                            <div className="contract-signature-box space-y-3">
                                                <p className="m-0 font-bold">May-ari ng Apartment:</p>
                                                <p className="m-0">Pirma: ___________________________</p>
                                                <p className="m-0">Pangalan: {landlord.name || '________________________'}</p>
                                                <p className="m-0">Petsa: ___________________________</p>
                                            </div>
                                            <div className="contract-signature-box space-y-3">
                                                <p className="m-0 font-bold">Nangungupahan:</p>
                                                <p className="m-0">Pirma: ___________________________</p>
                                                <p className="m-0">Pangalan: {contractData.tenantName || '________________________'}</p>
                                                <p className="m-0">Petsa: ___________________________</p>
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
                                            <p className="m-0"><strong>Paalala:</strong><br />Ang pagpirma ng Nangungupahan sa bawat pahina ng kontrata ay nangangahulugang tinanggap niya at naunawaan ang bawat nakasaad na kondisyon at tuntunin. Ang kontratang ito ay magiging epektibo lamang kapag ganap nang napirmahan ng parehong panig.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Page Footer */}
                            <div className="mt-8 pt-4 flex justify-between items-end text-xs font-sans print:mt-auto">
                                <span className="text-slate-500 font-semibold">Page 4 of 4</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-64 border-b border-slate-400 mb-1"></div>
                                    <span className="font-semibold text-slate-800 text-[10px]">Pangalan at Pirma ng Nangungupahan</span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* ================= ENGLISH PAGE 1 ================= */}
                        <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
                            <div>
                                {/* Page Header */}
                                <div className="text-center mb-6">
                                    <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase m-0">APARTMENT LEASE AGREEMENT</h2>
                                    <p className="text-rose-600 font-semibold italic text-[11px] m-0 mt-0.5">(Tenant Copy)</p>
                                </div>

                                <div className="space-y-3">
                                    <p className="m-0 font-bold text-slate-900">BETWEEN:</p>
                                    <div className="space-y-1 text-sm pl-2">
                                        <p className="m-0"><strong>Name of Apartment Owner:</strong> {landlord.name || BLANK_FIELD}</p>
                                        <p className="m-0"><strong>Owner's Address:</strong> {landlord.address || BLANK_FIELD}</p>
                                        <p className="m-0"><strong>Owner's Phone Number:</strong> {landlord.contact || BLANK_FIELD}</p>
                                        <p className="m-0 font-bold py-1">AND</p>
                                        <p className="m-0"><strong>Name of Tenant:</strong> <span className="underline font-semibold">{contractData.tenantName || BLANK_FIELD}</span></p>
                                        <p className="m-0"><strong>Tenant's Address:</strong> <span className="underline font-semibold">{BLANK_FIELD}</span></p>
                                        <p className="m-0"><strong>Tenant's Phone Number:</strong> <span className="underline font-semibold">{contractData.tenantPhone || BLANK_FIELD}</span></p>
                                        <p className="m-0"><strong>Assigned Room Letter:</strong> <span className="underline font-semibold">Room {contractData.roomName || '______'}</span></p>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div>
                                        <h3 className="font-bold text-slate-900 uppercase text-sm m-0 mb-1">SUBJECT: APARTMENT LEASE</h3>
                                        <p className="m-0">Under the following conditions, the Owner and the Tenant have agreed on the following rental terms for the apartment:</p>
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">I. DESCRIPTION OF THE APARTMENT</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Location and Address of the Apartment:</strong><br />{landlord.propertyAddress || BLANK_FIELD}</p>
                                            <p className="m-0"><strong>2. Description of the Apartment:</strong><br />The apartment has one (1) bedroom, one (1) bathroom, and sufficient space for a kitchen and living room. The unit is an appropriate size for a small family, group, or individual looking for simple housing. It has windows that provide light and air, and the apartment is in good condition.</p>
                                            <p className="m-0"><strong>3. Maximum Capacity of the Apartment:</strong><br />The maximum capacity of the apartment is four (4) people only. Should the number of occupants exceed four (4) people, the Tenant is required to pay an additional ₱1,000 per person exceeding the set capacity. These additional fees must be paid together with the monthly rent and cannot be deducted from the security deposit.</p>
                                            <p className="m-0"><strong>4. Move-in Date:</strong> <span className="underline font-semibold">{contractData.entryDate || '______________________________________________'}</span> {contractData.isTentative && <span className="text-rose-600 font-semibold">(Tentative — Not Final)</span>}</p>
                                            <p className="m-0"><strong>5. Term of Lease:</strong> <span className="underline font-semibold">{contractData.entryDate || '____________________'}</span> to <span className="underline font-semibold">{contractData.leaseEndDate || '____________________'}</span></p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div className="space-y-2 pt-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">II. RENT PAYMENT TERMS</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Amount of Monthly Rent:</strong><br />The monthly rent for Room <strong>{contractData.roomName || '__'}</strong> is <strong className="underline">{contractData.monthlyRent || '____________'}</strong> per month.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Page Footer */}
                            <div className="mt-8 pt-4 flex justify-between items-end text-xs font-sans print:mt-auto">
                                <span className="text-slate-500 font-semibold">Page 1 of 4</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-64 border-b border-slate-400 mb-1"></div>
                                    <span className="font-semibold text-slate-800 text-[10px]">Name and Signature of Tenant</span>
                                </div>
                            </div>
                        </div>

                        {/* ================= ENGLISH PAGE 2 ================= */}
                        <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
                            <div>
                                {/* Page Header */}
                                <div className="text-center mb-6">
                                    <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase m-0">APARTMENT LEASE AGREEMENT</h2>
                                    <p className="text-rose-600 font-semibold italic text-[11px] m-0 mt-0.5">(Tenant Copy)</p>
                                </div>

                                <div className="space-y-3">
                                    <div className="pl-4 space-y-3">
                                        <p className="m-0"><strong>2. Primary Payment Methods:</strong><br />Rent payment may be made through any of the following methods:</p>
                                        <ul className="list-disc pl-6 m-0 space-y-1">
                                            <li><strong>GCash:</strong> *********** ({landlord.name || '—'})</li>
                                            <li><strong>Bank</strong>
                                                <ul className="list-none pl-4 space-y-0.5">
                                                    <li>✓ <strong>BDO:</strong> ************ (Savings account)</li>
                                                    <li>✓ <strong>BPI:</strong> *********** (Savings account)</li>
                                                </ul>
                                            </li>
                                            <li><strong>Cash:</strong> May be handed directly to the apartment Owner.</li>
                                        </ul>

                                        <p className="m-0 mt-2"><strong>3. Advance Rent:</strong><br />Before moving in, the Tenant shall pay one (1) month's advance rent amounting to <strong className="underline">{contractData.advanceRent || '____________'}</strong>. This is credited to the rent for the first month of occupancy and is separate from the security deposit.</p>

                                        <p className="m-0 mt-2"><strong>4. Security Deposit:</strong><br />In addition to the advance rent, the Tenant shall pay a security deposit amounting to <strong className="underline">{contractData.depositAmount || '____________'}</strong>, equivalent to one month's rent. The deposit shall serve as a guarantee against possible damages or unpaid expenses.</p>

                                        <p className="m-0"><strong>Use of the Security Deposit:</strong><br />The security deposit is <strong>not refunded in cash</strong>. It is instead <strong>applied against unpaid rent, unpaid electricity and water bills, or damage</strong> to the unit and its fixtures. If no deductions remain at the end of the lease, it may be applied to the last month's rent.</p>

                                        <p className="m-0 mt-2"><strong>5. Due Date Reminder:</strong><br />Rent payment must be given on or before the due date each month. The monthly due date for rent payment is the <span className="underline font-semibold">{contractData.dueDateDay || '__'}</span> of the month.<br />
                                        <strong>Note:</strong> Should the Tenant be unable to pay before the set due date, the Tenant is encouraged to immediately contact the Owner to discuss the possibility of an extension or alternative payment arrangement.</p>

                                        <p className="m-0"><strong>6. Advice on Rent Payment:</strong><br />No penalty is imposed for payment made on the due date itself. However, <strong>the Tenant is encouraged to pay on the correct time and day</strong> each month to avoid issues that could result in the <strong>voiding of the contract or eviction from the apartment</strong>.<br />Should the Tenant experience difficulty in payment, <strong>they may contact the Owner</strong> to request an <strong>extension</strong>. The Owner is considerate and may grant an extension based on the Tenant's situation.</p>

                                        <p className="m-0"><strong>7. Proof of Payment:</strong><br />If the Tenant pays via <strong>GCash or bank transfer</strong>, they are required to send a <strong>screenshot</strong> of their payment to the Owner via <strong>Facebook Messenger</strong> to the account of <strong>{landlord.name || '—'}</strong>. The payment screenshot shall</p>
                                    </div>
                                </div>
                            </div>

                            {/* Page Footer */}
                            <div className="mt-8 pt-4 flex justify-between items-end text-xs font-sans print:mt-auto">
                                <span className="text-slate-500 font-semibold">Page 2 of 4</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-64 border-b border-slate-400 mb-1"></div>
                                    <span className="font-semibold text-slate-800 text-[10px]">Name and Signature of Tenant</span>
                                </div>
                            </div>
                        </div>

                        {/* ================= ENGLISH PAGE 3 ================= */}
                        <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
                            <div>
                                {/* Page Header */}
                                <div className="text-center mb-6">
                                    <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase m-0">APARTMENT LEASE AGREEMENT</h2>
                                    <p className="text-rose-600 font-semibold italic text-[11px] m-0 mt-0.5">(Tenant Copy)</p>
                                </div>

                                <div className="space-y-3">
                                    <p className="m-0">serve as proof of their rent payment obligation for the current month.</p>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div className="space-y-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">III. RESPONSIBILITIES OF THE OWNER</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Care and Maintenance:</strong><br />The Owner is responsible for repairing major damages and maintaining the apartment. Major damages pertain to the apartment's water, electrical, and structural systems.</p>
                                            <p className="m-0"><strong>2. Providing Proper Housing:</strong><br />The Owner ensures that the apartment is clean, well-maintained, and safe to use before the lease proceeds.</p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div className="space-y-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">IV. RESPONSIBILITIES OF THE TENANT</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Care of the Apartment:</strong><br />The Tenant must take care of and maintain the cleanliness and orderliness of the apartment, including the items and fixtures included in the unit.</p>
                                            <p className="m-0"><strong>2. No Structural Alterations:</strong><br />No part of the apartment may be altered, damaged, or made permanent use of (for example, drilling holes in the wall, attaching hard-to-remove adhesives to the wall) without the Owner's permission.</p>
                                            <p className="m-0"><strong>3. Payment of Utility Bills:</strong><br />The Tenant shall be responsible for all expenses related to electricity, water, internet, and other utility services, unless otherwise agreed.</p>
                                            <p className="m-0"><strong>4. Non-Payment of Electricity and Water:</strong><br />Should the apartment's <strong>electricity and water</strong> be disconnected due to non-payment of utility bills, the Owner shall not be <strong>responsible</strong> for the cost of reconnecting these services. The Tenant <strong>must pay</strong> the overdue bills and ensure prompt payment to avoid delays in these services. The Owner shall not be liable for any inconvenience caused by the lack of electricity and water.</p>
                                            <p className="m-0"><strong>5. Acceptance of Unit Inspection:</strong><br />The Tenant agrees to allow the Owner to conduct an inspection of the unit to ensure that it is in proper condition and that there is no damage to the fixtures.</p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />
                                </div>
                            </div>

                            {/* Page Footer */}
                            <div className="mt-8 pt-4 flex justify-between items-end text-xs font-sans print:mt-auto">
                                <span className="text-slate-500 font-semibold">Page 3 of 4</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-64 border-b border-slate-400 mb-1"></div>
                                    <span className="font-semibold text-slate-800 text-[10px]">Name and Signature of Tenant</span>
                                </div>
                            </div>
                        </div>

                        {/* ================= ENGLISH PAGE 4 ================= */}
                        <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
                            <div>
                                {/* Page Header */}
                                <div className="text-center mb-6">
                                    <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase m-0">APARTMENT LEASE AGREEMENT</h2>
                                    <p className="text-rose-600 font-semibold italic text-[11px] m-0 mt-0.5">(Tenant Copy)</p>
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">V. TERMINATION OF THE CONTRACT</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Violation of Contract Terms:</strong><br />Either the Owner or the Tenant has the right to terminate the contract in case of a serious violation of the terms of the agreement.</p>
                                            <p className="m-0"><strong>2. Ending the Contract:</strong><br />Should either party wish to end the contract, prior notice must be given to the other party at least 15 days before the Tenant's actual move-out.</p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    <div className="space-y-2">
                                        <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">VI. OTHER TERMS</h3>
                                        <div className="pl-4 space-y-2">
                                            <p className="m-0"><strong>1. Transfer of Rights:</strong><br />The Tenant may not transfer, assign, or sublease to another person the rights or responsibilities stated in this contract without the Owner's written permission.</p>
                                            <p className="m-0"><strong>2. Amendment of the Agreement:</strong><br />Any change or addition to this contract shall only take effect once it is put in writing and signed by both parties.</p>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-t border-slate-300" />

                                    {/* Section VII & Signatures matching Apartment-Contract.pdf */}
                                    <div className="space-y-4 pt-1">
                                        <div>
                                            <h3 className="font-bold text-slate-900 m-0 text-sm uppercase">VII. SIGNATURES</h3>
                                            <p className="m-0 mt-1">This contract has been affirmed and signed by both parties as proof of their agreement.</p>
                                        </div>

                                        <p className="m-0 font-semibold text-slate-900">Signed by:</p>

                                        <div className="contract-signature-grid grid grid-cols-2 gap-8 text-sm font-sans pt-1">
                                            <div className="contract-signature-box space-y-3">
                                                <p className="m-0 font-bold">Apartment Owner:</p>
                                                <p className="m-0">Signature: ___________________________</p>
                                                <p className="m-0">Name: {landlord.name || '________________________'}</p>
                                                <p className="m-0">Date: ___________________________</p>
                                            </div>
                                            <div className="contract-signature-box space-y-3">
                                                <p className="m-0 font-bold">Tenant:</p>
                                                <p className="m-0">Signature: ___________________________</p>
                                                <p className="m-0">Name: {contractData.tenantName || '________________________'}</p>
                                                <p className="m-0">Date: ___________________________</p>
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
                                            <p className="m-0"><strong>Reminder:</strong><br />The Tenant's signature on each page of the contract signifies that they have accepted and understood every condition and term stated. This contract shall only take effect once it has been fully signed by both parties.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Page Footer */}
                            <div className="mt-8 pt-4 flex justify-between items-end text-xs font-sans print:mt-auto">
                                <span className="text-slate-500 font-semibold">Page 4 of 4</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-64 border-b border-slate-400 mb-1"></div>
                                    <span className="font-semibold text-slate-800 text-[10px]">Name and Signature of Tenant</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}