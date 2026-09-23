import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt, faUndo, faHourglassHalf, faBroom, faTshirt, faConciergeBell, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/service-booking.responsive.css';

//MapsTheCatalogIconColumnOntoRealFontAwesomeIcons
const ICONS = {
    faBroom,
    faTshirt,
    faConciergeBell,
};
const iconFor = (name) => ICONS[name] || faConciergeBell;

export default function ServiceBooking() {
    const navigate = useNavigate();
    const { t } = useLang();
    const [searchParams] = useSearchParams();

    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const [serviceId, setServiceId] = useState(searchParams.get('serviceId') || '');
    //Empty means "untouched" and falls back to the selected service minimum
    const [quantityInput, setQuantityInput] = useState('');
    const [preferredDate, setPreferredDate] = useState('');
    const [preferredTimeSlot, setPreferredTimeSlot] = useState('');
    const [notes, setNotes] = useState('');
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    //1.LoadTheActiveCatalogRowsTheTenantIsAllowedToBook
    useEffect(() => {
        const loadCatalog = async () => {
            try {
                const [res, settingsRes] = await Promise.all([
                    api.get('get_service_catalog.php?active=1'),
                    api.get('get_system_settings.php').catch(() => ({ data: {} })),
                ]);
                const settings = settingsRes.data?.settings || {};
                //ADisabledCategoryIsRefusedByService_request.php,SoNeverOfferIt
                const categoryEnabled = (category) => {
                    const value = settings[`service_${category}_active`];
                    return value === undefined || value === null || value === true || value === 'true';
                };
                if (res.data.success) setCatalog((res.data.services || []).filter(s => categoryEnabled(s.category)));
            } catch (err) {
                console.error('Failed to load service catalog:', err);
                setFormError(t('serviceBooking.loadError'));
            } finally {
                setLoading(false);
            }
        };
        loadCatalog();
    }, []);

    const selected = useMemo(
        () => catalog.find(s => String(s.id) === String(serviceId)) || null,
        [catalog, serviceId]
    );

    const quantity = quantityInput === '' ? (selected?.minQuantity ?? 1) : quantityInput;

    //ChangingTheServiceResetsAnythingItsOwnPricingOrLeadTimeInvalidates
    const handleServiceChange = (e) => {
        setServiceId(e.target.value);
        setQuantityInput('');
        setPreferredDate('');
    };

    //Enforces Philippines Standard Time (PST - UTC+8) for today's boundary tracking
    const targetTimezoneOffset = 8 * 60;//PST is UTC+8 in minutes
    const localDate = new Date();
    const utcTime = localDate.getTime() + (localDate.getTimezoneOffset() * 60000);
    const pstDate = new Date(utcTime + (targetTimezoneOffset * 60000));

    //Helper function to format date cleanly as YYYY-MM-DD without UTC shift issues
    const formatDateString = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    //Earliest bookable day is today plus the service's own lead time; the window
    //still closes 2 weeks (14 days) out, matching the maintenance request form.
    const leadDays = selected?.leadTimeDays ?? 0;
    const earliestDate = new Date(pstDate.getTime());
    earliestDate.setDate(pstDate.getDate() + leadDays);

    const twoWeeksLater = new Date(pstDate.getTime());
    twoWeeksLater.setDate(pstDate.getDate() + 14);

    const minDateString = formatDateString(earliestDate);
    const maxDateString = formatDateString(twoWeeksLater);

    //SessionPricedServicesAreAlwaysASingleVisit-NoQuantityInput
    const isQuantified = selected && selected.pricingUnit !== 'session';
    const estimatedTotal = selected ? selected.price * (Number(quantity) || 0) : 0;

    const unitLabel = (unit) => {
        switch (unit) {
            case 'kg': return t('serviceBooking.unitKg');
            case 'hour': return t('serviceBooking.unitHour');
            case 'item': return t('serviceBooking.unitItem');
            default: return t('serviceBooking.unitSession');
        }
    };

    //File uploading drop mechanics
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) setUploadedFile(e.dataTransfer.files[0]);
    };
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) setUploadedFile(e.target.files[0]);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setFormError(null);

        if (!selected) {
            setFormError(t('serviceBooking.selectServiceFirst'));
            return;
        }

        const formData = new FormData();
        formData.append('serviceId', selected.id);
        formData.append('quantity', isQuantified ? quantity : 1);
        formData.append('preferredDate', preferredDate);
        formData.append('preferredTimeSlot', preferredTimeSlot);
        formData.append('notes', notes.trim());

        if (uploadedFile) formData.append('uploadedFile', uploadedFile);

        setSubmitting(true);
        try {
            const res = await api.post('/service_request.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setIsModalOpen(true);
            } else {
                setFormError(res.data.message);
            }
        } catch (error) {
            setFormError(error.response?.data?.message || t('serviceBooking.submitError'));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center space-y-3 text-slate-500">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-3xl text-indigo-500 animate-spin" />
                    <p className="text-sm font-semibold m-0">{t('serviceBooking.loading')}</p>
                </div>
            </div>
        );
    }

    const inputClass = "focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]";
    const labelClass = "text-sm font-bold text-slate-700";

    return (
        <div className="service-booking-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/*Top Header Row*/}
                <div className="border-b border-slate-200 pb-4">
                    <h1
                        className="service-booking-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                        style={{ color: '#3b4276' }}
                    >
                        {t('serviceBooking.heading')}
                    </h1>
                    <p className="service-booking-subtext text-slate-500 text-sm mt-1 m-0">
                        {t('serviceBooking.subtext')}
                    </p>
                </div>

                {catalog.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-md p-10 text-center">
                        <FontAwesomeIcon icon={faConciergeBell} className="text-4xl text-slate-200 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 m-0">{t('serviceBooking.noServices')}</h3>
                    </div>
                ) : (
                    <form className="service-booking-form-card bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleFormSubmit}>

                        {/*Service Selector*/}
                        <div className="flex flex-col space-y-2 md:col-span-2">
                            <label className={labelClass} style={{ color: '#3b4276' }}>{t('serviceBooking.selectService')}</label>
                            <select
                                value={serviceId}
                                onChange={handleServiceChange}
                                className={`service-booking-select ${inputClass}`}
                                style={{ color: '#1e293b' }}
                                required
                            >
                                <option value="" disabled hidden>{t('serviceBooking.selectServicePlaceholder')}</option>
                                {catalog.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} — ₱{Number(s.price || 0).toLocaleString()} / {unitLabel(s.pricingUnit)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/*Selected Service Summary Card*/}
                        {selected && (
                            <div className="md:col-span-2 flex items-start gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                                    <FontAwesomeIcon icon={iconFor(selected.icon)} className="text-xl text-[#3b4276]" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base font-bold text-slate-800 m-0">{selected.name}</h3>
                                    <p className="text-xs text-slate-500 m-0 mt-1 leading-relaxed">{selected.description}</p>
                                    <p className="text-xs font-semibold text-indigo-600 m-0 mt-2">
                                        ₱{Number(selected.price || 0).toLocaleString()} / {unitLabel(selected.pricingUnit)}
                                        {selected.leadTimeDays > 0 && (
                                            <span className="ml-2 font-medium text-slate-400">
                                                · {t('serviceBooking.leadTime').replace('{days}', selected.leadTimeDays)}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/*Quantity Field-OnlyForNonSessionPricing*/}
                        {isQuantified && (
                            <div className="flex flex-col space-y-2">
                                <label className={labelClass} style={{ color: '#3b4276' }}>
                                    {t('serviceBooking.quantity')} ({unitLabel(selected.pricingUnit)})
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    min={selected.minQuantity}
                                    max={selected.maxQuantity ?? undefined}
                                    value={quantity}
                                    onChange={(e) => setQuantityInput(e.target.value)}
                                    className={`service-booking-input ${inputClass}`}
                                    style={{ color: '#1e293b' }}
                                    required
                                />
                                <p className="text-xs text-slate-400 m-0">
                                    {t('serviceBooking.quantityRange')
                                        .replace('{min}', selected.minQuantity)
                                        .replace('{max}', selected.maxQuantity ?? '∞')}
                                </p>
                            </div>
                        )}

                        {/*Estimated Total*/}
                        {selected && (
                            <div className={`flex flex-col justify-center space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 ${isQuantified ? '' : 'md:col-span-2'}`}>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 m-0">{t('serviceBooking.estimatedTotal')}</p>
                                <p className="text-2xl font-extrabold text-indigo-600 m-0">₱{estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        )}

                        {/*Preferred Date Field*/}
                        <div className="flex flex-col space-y-2">
                            <label className={labelClass} style={{ color: '#3b4276' }}>{t('serviceBooking.preferredDate')}</label>
                            <input
                                type="date"
                                min={minDateString}
                                max={maxDateString}
                                value={preferredDate}
                                onChange={(e) => setPreferredDate(e.target.value)}
                                className={`service-booking-input ${inputClass}`}
                                style={{ color: '#1e293b' }}
                                required
                            />
                        </div>

                        {/*Time Window Selector*/}
                        <div className="flex flex-col space-y-2">
                            <label className={labelClass} style={{ color: '#3b4276' }}>{t('serviceBooking.preferredTimeSlot')}</label>
                            <select
                                value={preferredTimeSlot}
                                onChange={(e) => setPreferredTimeSlot(e.target.value)}
                                className={`service-booking-select ${inputClass}`}
                                style={{ color: '#1e293b' }}
                                required
                            >
                                <option value="" disabled hidden>{t('serviceBooking.selectTime')}</option>
                                <option value="morning">{t('serviceBooking.morning')}</option>
                                <option value="afternoon">{t('serviceBooking.afternoon')}</option>
                            </select>
                        </div>

                        {/*Additional Notes Area*/}
                        <div className="flex flex-col space-y-2 md:col-span-2">
                            <label className={labelClass} style={{ color: '#3b4276' }}>{t('serviceBooking.notes')}</label>
                            <textarea
                                rows={4}
                                placeholder={t('serviceBooking.notesPlaceholder')}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="service-booking-textarea focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base resize-none"
                                style={{ color: '#1e293b' }}
                            />
                        </div>

                        {/*File Upload Drag and Drop Area*/}
                        <div className="flex flex-col space-y-2 md:col-span-2">
                            <label className={labelClass} style={{ color: '#3b4276' }}>{t('serviceBooking.attachment')}</label>
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`service-booking-upload-box card-interactive w-full border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-150 relative bg-slate-50 flex flex-col items-center justify-center min-h-[140px] ${isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                {!uploadedFile ? (
                                    <>
                                        <input
                                            type="file"
                                            accept="image/*,.pdf"
                                            onChange={handleFileChange}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                        />
                                        <div className="space-y-2 pointer-events-none">
                                            <FontAwesomeIcon icon={faCloudUploadAlt} className="text-3xl text-slate-400" />
                                            <p className="text-sm font-medium text-slate-700 m-0">{t('serviceBooking.dropFile')} <span className="text-indigo-600 font-bold">{t('serviceBooking.browse')}</span></p>
                                            <p className="text-slate-400 text-xs m-0">{t('serviceBooking.attachmentHint')}</p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-3 flex flex-col items-center w-full z-10">
                                        {uploadedFile.type.startsWith('image/') ? (
                                            <img
                                                src={URL.createObjectURL(uploadedFile)}
                                                alt="Service reference preview"
                                                className="w-32 h-20 object-cover rounded border border-slate-200"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 bg-indigo-50 flex items-center justify-center rounded border border-indigo-200 text-indigo-600 font-bold text-xs">
                                                PDF
                                            </div>
                                        )}
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-slate-800 m-0 truncate max-w-[240px]">{uploadedFile.name}</p>
                                            <p className="text-slate-400 text-xs m-0 mt-0.5">({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setUploadedFile(null)}
                                            className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-4 py-2 rounded-xl border-0 cursor-pointer transition-colors shadow-sm flex items-center gap-1.5"
                                        >
                                            <FontAwesomeIcon icon={faUndo} /> {t('serviceBooking.removeFile')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/*BillingNotice-ChargesLandOnTheInvoiceForTheMonthOfDelivery*/}
                        <div className="md:col-span-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-amber-500" />
                            <p className="text-xs text-amber-800 m-0 leading-relaxed">{t('serviceBooking.billingNotice')}</p>
                        </div>

                        {/*ErrorBanner*/}
                        {formError && (
                            <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                                <p className="text-sm font-medium text-red-700 m-0">{formError}</p>
                            </div>
                        )}

                        {/*Form Actions footer container*/}
                        <div className="md:col-span-2 border-t border-slate-100 pt-6 flex justify-end">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="service-booking-submit-btn btn-interactive w-full sm:w-auto min-h-[48px] bg-[#10b981] hover:bg-[#059669] hover:scale-[1.03] active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center"
                            >
                                {submitting ? t('serviceBooking.submitting') : t('serviceBooking.submit')}
                            </button>
                        </div>

                    </form>
                )}
            </div>

            {/*Standalone Modular Success Display Layer Component*/}
            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    navigate('/my-requests');
                }}
                message={t('serviceBooking.successMsg')}
            />
        </div>
    );
}
