import { useEffect, useState } from 'react';
import { CCTV_DEFAULTS, CCTV_OTHER_KEY, CCTV_OTHER_REASON_MIN, incidentTypeLabel, loadCctvConfig, locationLabel } from '../config/cctvConfig';
import SuccessModal from '../Components/SuccessModal';
import InlineAlert from '../Components/InlineAlert';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, addDays, checkDate, checkText, localDateString } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import CharCount from '../Components/form/CharCount';
import { invalidCls } from '../Components/form/formHelpers';

const TIME_WINDOWS = ['12:00 AM - 04:00 AM', '04:00 AM - 08:00 AM', '08:00 AM - 12:00 PM', '12:00 PM - 04:00 PM', '04:00 PM - 08:00 PM', '08:00 PM - 12:00 AM'];
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/cctv-request.responsive.css';

export default function CctvRequest() {
    const { t } = useLang();
    const [incidentDate, setIncidentDate] = useState('');
    const [incidentTime, setIncidentTime] = useState('');
    const [locationDetails, setLocationDetails] = useState('');
    const [incidentType, setIncidentType] = useState('');
    const [reasonRequest, setReasonRequest] = useState('');
    const [privacyConsent, setPrivacyConsent] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // A failed submit shows next to the submit button (it was alert()).
    const [submitError, setSubmitError] = useState('');
    const navigate = useNavigate();

    // The locations, incident types and footage window the admin set up in
    // Settings -> CCTV. The defaults show until they load (or if they can't).
    const [config, setConfig] = useState(CCTV_DEFAULTS);
    useEffect(() => {
        let active = true;
        loadCctvConfig().then((c) => { if (active) setConfig(c); });
        return () => { active = false; };
    }, []);
    const locations = config.locations;
    const incidentTypes = config.incidentTypes;

    // addDays, not setMonth(-N): that rolled Apr 30 over to Mar 2 (there is no Feb 30).
    const maxDateString = localDateString();
    const minDateString = addDays(-config.lookbackDays);

    // Keys match cctv_request.php's body. reason_request is TEXT, so the
    // limit is the shared notes cap (the old hard-coded 1000).
    const form = useFieldErrors({
        incidentDate: (v) => checkDate(v, { min: minDateString, max: maxDateString, label: t('cctv.incidentDateLabel') }),
        incidentTime: (v) => (TIME_WINDOWS.includes(v) ? '' : t('common.errTimeWindow')),
        locationDetails: (v) => (locations.includes(v) ? '' : t('cctv.errLocation')),
        incidentType: (v) => (incidentTypes.some((x) => x.key === v) ? '' : t('cctv.errIncidentType')),
        reasonRequest: (v, all) => {
            const err = checkText(v, { label: 'Reason', min: config.minReasonLength, max: LIMITS.notes });
            if (err) return err;
            return all?.incidentType === CCTV_OTHER_KEY && v.trim().length < CCTV_OTHER_REASON_MIN ? t('cctv.errOtherReason') : '';
        },
        privacyConsent: (v) => (v ? '' : t('cctv.errConsent')),
    }, { idPrefix: 'cctv-' });
    const values = { incidentDate, incidentTime, locationDetails, incidentType, reasonRequest, privacyConsent };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        const reason = reasonRequest.trim();
        setReasonRequest(reason);
        if (!form.validateAll({ ...values, reasonRequest: reason })) return;

        const payload = {
            incidentDate: incidentDate,
            incidentTime: incidentTime,
            locationDetails: locationDetails,
            incidentType: incidentType,
            reasonRequest: reason,
            // cctv_request.php requires it and stores when it was given.
            privacyConsent: true
        };

        setSubmitError('');
        setIsSubmitting(true);
        try {
            const res = await api.post("/cctv_request.php", payload);

            if (res.data.success) {
                setIsModalOpen(true);
            } else if (!form.applyServerErrors(res)) {
                setSubmitError(res.data.message || t('common.requestFailed'));
            }
        } catch (error) {
            if (!form.applyServerErrors(error)) setSubmitError(apiErrorMessage(error, 'Failed to submit your request. Please try again.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="cctv-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl lg:max-w-[1400px] space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/* Page header */}
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <Link to="/services" className="group mb-2 -ml-0.5 inline-flex min-h-[44px] items-center gap-1.5 py-1 text-sm font-medium text-slate-500 no-underline transition-colors hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                            <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                            <span>Back to Services</span>
                        </Link>
                        <h1
                            className="cctv-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none text-brand"
                        >
                            {t('cctv.heading')}
                        </h1>
                        <p className="cctv-subtext text-slate-500 text-sm mt-1 m-0">
                            {t('cctv.subtext')}
                        </p>
                    </div>
                    {/* A static "Active queue" widget stood here; it looked like live data but never changed. */}
                </div>

                {/*Form Inputs Panel Layout*/}
                <form className="cctv-form-card bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleFormSubmit} noValidate>

                    {/*Incident Date Input Field Box Layout*/}
                    <div className="flex flex-col space-y-2">
                        <label htmlFor="cctv-incidentDate" className="text-sm font-bold text-brand">{t('cctv.incidentDate')}</label>
                        <input
                            type="date"
                            {...form.fieldA11y('incidentDate')}
                            min={minDateString}
                            max={maxDateString}
                            value={incidentDate}
                            onChange={(e) => { setIncidentDate(e.target.value); form.clearError('incidentDate'); }}
                            onBlur={() => incidentDate && form.validateField('incidentDate', values)}
                            className={"cctv-input focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.incidentDate)}
                            required
                        />
                        <FieldError id="cctv-incidentDate" error={form.errors.incidentDate} className="m-0" />
                    </div>

                    {/*Estimated Time Select Component Dropdown Menu*/}
                    <div className="flex flex-col space-y-2">
                        <label htmlFor="cctv-incidentTime" className="text-sm font-bold text-brand">{t('cctv.incidentTime')}</label>
                        <select
                            {...form.fieldA11y('incidentTime')}
                            value={incidentTime}
                            onChange={(e) => { setIncidentTime(e.target.value); form.clearError('incidentTime'); }}
                            className={"cctv-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.incidentTime)}
                            required
                        >
                            <option value="" disabled hidden>{t('cctv.selectHour')}</option>
                            <option value="12:00 AM - 04:00 AM">{t('cctv.midnight')}</option>
                            <option value="04:00 AM - 08:00 AM">{t('cctv.earlyMorning')}</option>
                            <option value="08:00 AM - 12:00 PM">{t('cctv.morning')}</option>
                            <option value="12:00 PM - 04:00 PM">{t('cctv.afternoon')}</option>
                            <option value="04:00 PM - 08:00 PM">{t('cctv.evening')}</option>
                            <option value="08:00 PM - 12:00 AM">{t('cctv.night')}</option>
                        </select>
                        <FieldError id="cctv-incidentTime" error={form.errors.incidentTime} className="m-0" />
                    </div>

                    {/*Corridor Location Dropdown Menu Layout Component*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="cctv-locationDetails" className="text-sm font-bold text-brand">{t('cctv.location')}</label>
                        <select
                            {...form.fieldA11y('locationDetails')}
                            value={locationDetails}
                            onChange={(e) => { setLocationDetails(e.target.value); form.clearError('locationDetails'); }}
                            className={"cctv-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.locationDetails)}
                            required
                        >
                            <option value="" disabled hidden>{t('cctv.selectFloor')}</option>
                            {locations.map((loc) => <option key={loc} value={loc}>{locationLabel(loc, t)}</option>)}
                        </select>
                        <FieldError id="cctv-locationDetails" error={form.errors.locationDetails} className="m-0" />
                    </div>

                    {/*Incident type: footage is released for incidents only*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="cctv-incidentType" className="text-sm font-bold text-brand">{t('cctv.incidentType')}</label>
                        <select
                            {...form.fieldA11y('incidentType')}
                            value={incidentType}
                            onChange={(e) => { setIncidentType(e.target.value); form.clearError('incidentType'); form.clearError('reasonRequest'); }}
                            className={"cctv-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.incidentType)}
                            required
                        >
                            <option value="" disabled hidden>{t('cctv.selectIncidentType')}</option>
                            {incidentTypes.map(x => <option key={x.key} value={x.key}>{incidentTypeLabel(incidentTypes, x.key, t)}</option>)}
                        </select>
                        <p className="text-xs text-slate-500 m-0">{t('cctv.incidentTypeHint', { days: config.lookbackDays })}</p>
                        <FieldError id="cctv-incidentType" error={form.errors.incidentType} className="m-0" />
                    </div>

                    {/*Reason for Request text input area box layout Component*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="cctv-reasonRequest" className="text-sm font-bold text-brand">{t('cctv.reason')}</label>
                        <textarea
                            rows={3}
                            {...form.fieldA11y('reasonRequest')}
                            placeholder={t('cctv.reasonPlaceholder')}
                            value={reasonRequest}
                            maxLength={LIMITS.notes}
                            onChange={(e) => { setReasonRequest(e.target.value); form.clearError('reasonRequest'); }}
                            onBlur={() => { const v = reasonRequest.trim(); setReasonRequest(v); if (v) form.validateField('reasonRequest', { ...values, reasonRequest: v }); }}
                            className={"cctv-textarea focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base resize-none" + invalidCls(form.errors.reasonRequest)}
                            required
                        />
                        <FieldError id="cctv-reasonRequest" error={form.errors.reasonRequest} className="m-0" />
                        <CharCount value={reasonRequest} max={LIMITS.notes} className="m-0" />
                    </div>

                    {/*Data Privacy Consent Checkbox*/}
                    <div className="cctv-consent-box md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start space-x-3">
                        <input
                            type="checkbox"
                            {...form.fieldA11y('privacyConsent')}
                            checked={privacyConsent}
                            onChange={(e) => { setPrivacyConsent(e.target.checked); form.clearError('privacyConsent'); }}
                            className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
                            required
                        />
                        <label htmlFor="cctv-privacyConsent" className="text-xs text-slate-600 cursor-pointer text-left leading-relaxed">
                            {t('cctv.privacyConsent')}
                        </label>
                    </div>
                    <FieldError id="cctv-privacyConsent" error={form.errors.privacyConsent} className="md:col-span-2 m-0" />

                    {/*Submission Request Action Trigger Button Layout Area*/}
                    <div className="md:col-span-2 border-t border-slate-100 pt-6 flex flex-col gap-3 sm:items-end">
                        <InlineAlert onDismiss={() => setSubmitError('')} className="w-full">{submitError}</InlineAlert>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="cctv-submit-btn btn-interactive w-full sm:w-auto min-h-[48px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.03] active:scale-[0.97] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center"
                        >
                            {isSubmitting ? 'Submitting…' : t('cctv.submit')}
                        </button>
                    </div>

                </form>
            </div>

            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    navigate('/my-requests'); // where the request can be followed
                }}
                message={t('cctv.success')}
            />
        </div>
    );
}