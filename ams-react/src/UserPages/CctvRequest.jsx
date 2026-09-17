import { useState } from 'react';
import SuccessModal from '../Components/SuccessModal';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
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
    const navigate = useNavigate();

    const today = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(today.getMonth() - 2);

    const maxDateString = today.toISOString().split('T')[0];
    const minDateString = twoMonthsAgo.toISOString().split('T')[0];

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        const payload = {
            incidentDate: incidentDate,
            incidentTime: incidentTime,
            locationDetails: locationDetails,
            reasonRequest: reasonRequest.trim()
        };

        setIsSubmitting(true);
        try {
            const res = await api.post("/cctv_request.php", payload);

            if (res.data.success) {
                setIsModalOpen(true);
            } else {
                alert(res.data.message);
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to submit your request. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="cctv-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/*Top Header Row containing Live Slot Counter Indicators*/}
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

                    {/*Available Slots Counter Widget*/}
                    <div className="cctv-status-widget bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm flex items-center space-x-3 flex-shrink-0 select-none">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                        <div>
                            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">{t('cctv.status')}</span>
                            <span className="text-xl font-black text-slate-800 tracking-tight">{t('cctv.activeQueue')}</span>
                        </div>
                    </div>
                </div>

                {/*Form Inputs Panel Layout*/}
                <form className="cctv-form-card bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleFormSubmit}>

                    {/*Incident Date Input Field Box Layout*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('cctv.incidentDate')}</label>
                        <input
                            type="date"
                            min={minDateString}
                            max={maxDateString}
                            value={incidentDate}
                            onChange={(e) => setIncidentDate(e.target.value)}
                            className="cctv-input w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                            required
                        />
                    </div>

                    {/*Estimated Time Select Component Dropdown Menu*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('cctv.incidentTime')}</label>
                        <select
                            value={incidentTime}
                            onChange={(e) => setIncidentTime(e.target.value)}
                            className="cctv-select w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
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
                    </div>

                    {/*Corridor Location Dropdown Menu Layout Component*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('cctv.location')}</label>
                        <select
                            value={locationDetails}
                            onChange={(e) => setLocationDetails(e.target.value)}
                            className="cctv-select w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>{t('cctv.selectFloor')}</option>
                            <option value="1st Floor">{t('cctv.floor1')}</option>
                            <option value="2nd Floor">{t('cctv.floor2')}</option>
                            <option value="3rd Floor">{t('cctv.floor3')}</option>
                            <option value="All Floors">{t('cctv.allFloors')}</option>
                        </select>
                    </div>

                    {/*Reason for Request text input area box layout Component*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('cctv.reason')}</label>
                        <textarea
                            rows={3}
                            placeholder={t('cctv.reasonPlaceholder')}
                            value={reasonRequest}
                            onChange={(e) => setReasonRequest(e.target.value)}
                            className="cctv-textarea w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base resize-none"
                            style={{ color: '#1e293b' }}
                            required
                        />
                    </div>

                    {/*Data Privacy Consent Checkbox*/}
                    <div className="cctv-consent-box md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start space-x-3">
                        <input
                            type="checkbox"
                            id="privacyConsent"
                            checked={privacyConsent}
                            onChange={(e) => setPrivacyConsent(e.target.checked)}
                            className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
                            required
                        />
                        <label htmlFor="privacyConsent" className="text-xs text-slate-600 cursor-pointer text-left leading-relaxed">
                            {t('cctv.privacyConsent')}
                        </label>
                    </div>

                    {/*Submission Request Action Trigger Button Layout Area*/}
                    <div className="md:col-span-2 border-t border-slate-100 pt-6 flex justify-end">
                        <button
                            type="submit"
                            disabled={!privacyConsent || isSubmitting}
                            className="cctv-submit-btn w-full sm:w-auto min-h-[48px] bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.03] active:scale-[0.97] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center"
                        >
                            {t('cctv.submit')}
                        </button>
                    </div>

                </form>
            </div>

            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    navigate('/home');
                }}
                message={t('cctv.success')}
            />
        </div>
    );
}