import { useState } from 'react';
import SuccessModal from '../Components/SuccessModal';
import InlineAlert from '../Components/InlineAlert';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { LIMITS, addDays, checkDate, checkText, localDateString } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import CharCount from '../Components/form/CharCount';
import { invalidCls } from '../Components/form/formHelpers';

const TIME_WINDOWS = ['12:00 AM - 04:00 AM', '04:00 AM - 08:00 AM', '08:00 AM - 12:00 PM', '12:00 PM - 04:00 PM', '04:00 PM - 08:00 PM', '08:00 PM - 12:00 AM'];
const LOCATIONS = ['1st Floor', '2nd Floor', '3rd Floor', 'All Floors'];
const REASON_MIN = 10;
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/cctv-request.responsive.css';

export default function CctvRequest() {
    const { t } = useLang();
    const [incidentDate, setIncidentDate] = useState('');
    const [incidentTime, setIncidentTime] = useState('');
    const [locationDetails, setLocationDetails] = useState('');
    const [reasonRequest, setReasonRequest] = useState('');
    const [privacyConsent, setPrivacyConsent] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // A failed submit shows next to the submit button (it was alert()).
    const [submitError, setSubmitError] = useState('');
    const navigate = useNavigate();

    // Footage is kept about two months. addDays, not setMonth(-2): that rolled
    // Apr 30 over to Mar 2 (there is no Feb 30).
    const maxDateString = localDateString();
    const minDateString = addDays(-60);

    // Keys match cctv_request.php's body. reason_request is TEXT, so the
    // limit is the shared notes cap (the old hard-coded 1000).
    const form = useFieldErrors({
        incidentDate: (v) => checkDate(v, { min: minDateString, max: maxDateString, label: 'Incident date' }),
        incidentTime: (v) => (TIME_WINDOWS.includes(v) ? '' : 'Please choose the time window.'),
        locationDetails: (v) => (LOCATIONS.includes(v) ? '' : 'Please choose the location.'),
        reasonRequest: (v) => checkText(v, { label: 'Reason', min: REASON_MIN, max: LIMITS.notes }),
        privacyConsent: (v) => (v ? '' : 'Please agree to the data privacy terms.'),
    }, { idPrefix: 'cctv-' });
    const values = { incidentDate, incidentTime, locationDetails, reasonRequest, privacyConsent };

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
                setSubmitError(res.data.message || 'Failed to submit your request. Please try again.');
            }
        } catch (error) {
            if (!form.applyServerErrors(error)) setSubmitError(apiErrorMessage(error, 'Failed to submit your request. Please try again.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="cctv-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/* Page header */}
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1
                            className="cctv-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                            style={{ color: '#3b4276' }}
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
                        <label htmlFor="cctv-incidentDate" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('cctv.incidentDate')}</label>
                        <input
                            type="date"
                            {...form.fieldA11y('incidentDate')}
                            min={minDateString}
                            max={maxDateString}
                            value={incidentDate}
                            onChange={(e) => { setIncidentDate(e.target.value); form.clearError('incidentDate'); }}
                            onBlur={() => incidentDate && form.validateField('incidentDate', values)}
                            className={"cctv-input focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.incidentDate)}
                            style={{ color: '#1e293b' }}
                            required
                        />
                        <FieldError id="cctv-incidentDate" error={form.errors.incidentDate} className="m-0" />
                    </div>

                    {/*Estimated Time Select Component Dropdown Menu*/}
                    <div className="flex flex-col space-y-2">
                        <label htmlFor="cctv-incidentTime" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('cctv.incidentTime')}</label>
                        <select
                            {...form.fieldA11y('incidentTime')}
                            value={incidentTime}
                            onChange={(e) => { setIncidentTime(e.target.value); form.clearError('incidentTime'); }}
                            className={"cctv-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.incidentTime)}
                            style={{ color: '#1e293b' }}
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
                        <label htmlFor="cctv-locationDetails" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('cctv.location')}</label>
                        <select
                            {...form.fieldA11y('locationDetails')}
                            value={locationDetails}
                            onChange={(e) => { setLocationDetails(e.target.value); form.clearError('locationDetails'); }}
                            className={"cctv-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.locationDetails)}
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>{t('cctv.selectFloor')}</option>
                            <option value="1st Floor">{t('cctv.floor1')}</option>
                            <option value="2nd Floor">{t('cctv.floor2')}</option>
                            <option value="3rd Floor">{t('cctv.floor3')}</option>
                            <option value="All Floors">{t('cctv.allFloors')}</option>
                        </select>
                        <FieldError id="cctv-locationDetails" error={form.errors.locationDetails} className="m-0" />
                    </div>

                    {/*Reason for Request text input area box layout Component*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="cctv-reasonRequest" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('cctv.reason')}</label>
                        <textarea
                            rows={3}
                            {...form.fieldA11y('reasonRequest')}
                            placeholder={t('cctv.reasonPlaceholder')}
                            value={reasonRequest}
                            maxLength={LIMITS.notes}
                            onChange={(e) => { setReasonRequest(e.target.value); form.clearError('reasonRequest'); }}
                            onBlur={() => { const v = reasonRequest.trim(); setReasonRequest(v); if (v) form.validateField('reasonRequest', { ...values, reasonRequest: v }); }}
                            className={"cctv-textarea focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base resize-none" + invalidCls(form.errors.reasonRequest)}
                            style={{ color: '#1e293b' }}
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