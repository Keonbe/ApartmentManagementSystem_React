import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt, faUndo } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';
import { useNavigate } from 'react-router-dom';
import api from "../api/axiosConfig";
import { useLang } from '../config/i18n';
import { MAINTENANCE_CATEGORIES } from '../config/maintenanceOptions';
import { LIMITS, checkDate, firstError } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import '../assets/styles/responsive/user/maintenance-request.responsive.css';

export default function MaintenanceRequest() {
    const { t } = useLang();
    const [issueType, setIssueType] = useState('');
    const [preferredDate, setPreferredDate] = useState('');
    const [preferredTime, setPreferredTime] = useState('');
    const [description, setDescription] = useState('');
    const [permissionToEnter, setPermissionToEnter] = useState(false);//checkbox state
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    //Enforces Philippines Standard Time (PST - UTC+8) for today's boundary tracking
    const targetTimezoneOffset = 8 * 60;//PST is UTC+8 in minutes
    const localDate = new Date();
    const utcTime = localDate.getTime() + (localDate.getTimezoneOffset() * 60000);
    const pstDate = new Date(utcTime + (targetTimezoneOffset * 60000));

    //Restricts choices from current PST date up to 2 weeks (14 days) into the future
    const twoWeeksLater = new Date(pstDate.getTime());
    twoWeeksLater.setDate(pstDate.getDate() + 14);

    //Helper function to format date cleanly as YYYY-MM-DD without UTC shift issues
    const formatDateString = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const minDateString = formatDateString(pstDate);
    const maxDateString = formatDateString(twoWeeksLater);

    //File uploading drop mechanics
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const acceptFile = (file) => {
        const fileError = checkFile(file, FILE_RULES.maintenance);
        if (fileError) {
            alert(fileError);
            return;
        }
        setUploadedFile(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            acceptFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            acceptFile(e.target.files[0]);
            e.target.value = '';
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        const formError = firstError(
            issueType ? '' : 'Please choose the type of issue.',
            checkDate(preferredDate, { min: minDateString, max: maxDateString, label: 'Preferred date' }),
            preferredTime ? '' : 'Please choose a time window.',
            description.trim() ? '' : 'Please describe the problem.'
        );
        if (formError) {
            alert(formError);
            return;
        }

        const formData = new FormData();
        formData.append('issueType', issueType);
        formData.append('preferredDate', preferredDate);
        formData.append('preferredTime', preferredTime);
        formData.append('description', description.trim());
        formData.append('permissionToEnter', permissionToEnter ? 1 : 0);

        if (uploadedFile) {
            formData.append('uploadedFile', uploadedFile);
        }

        setIsSubmitting(true);
        try {
            const res = await api.post("/maintenance_request.php", formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

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

    const isVideo = uploadedFile && (uploadedFile.type.startsWith('video/') || /\.(mp4|m4v|webm|mov)$/i.test(uploadedFile.name));

    return (
        <div className="maintenance-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/*Top Header Row*/}
                <div className="border-b border-slate-200 pb-4">
                    <h1
                        className="maintenance-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                        style={{ color: '#3b4276' }}
                    >
                        {t('maintenance.heading')}
                    </h1>
                    <p className="maintenance-subtext text-slate-500 text-sm mt-1 m-0">
                        {t('maintenance.subtext')}
                    </p>
                </div>

                {/*Form Inputs Panel Layout*/}
                <form className="maintenance-form-card animate-fade-in-up bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleFormSubmit}>

                    {/*Issue Category Selector*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.category')}</label>
                        <select
                            value={issueType}
                            onChange={(e) => setIssueType(e.target.value)}
                            className="maintenance-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>{t('maintenance.selectCategory')}</option>
                            {MAINTENANCE_CATEGORIES.map(c => (
                                <option key={c.value} value={c.value}>{t(c.i18nKey)}</option>
                            ))}
                        </select>
                    </div>

                    {/*Preferred Date Field*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.prefDate')}</label>
                        <input
                            type="date"
                            min={minDateString}
                            max={maxDateString}
                            value={preferredDate}
                            onChange={(e) => setPreferredDate(e.target.value)}
                            className="maintenance-input focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                            required
                        />
                    </div>

                    {/*Time Window Selector*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.prefTime')}</label>
                        <select
                            value={preferredTime}
                            onChange={(e) => setPreferredTime(e.target.value)}
                            className="maintenance-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>{t('maintenance.selectTime')}</option>
                            <option value="morning">{t('maintenance.morning')}</option>
                            <option value="afternoon">{t('maintenance.afternoon')}</option>
                        </select>
                    </div>

                    {/*Problem Description Area*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.description')}</label>
                        <textarea
                            rows={4}
                            placeholder={t('maintenance.descPlaceholder')}
                            value={description}
                            maxLength={LIMITS.message}
                            onChange={(e) => setDescription(e.target.value)}
                            className="maintenance-textarea focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base resize-none"
                            style={{ color: '#1e293b' }}
                            required
                        />
                    </div>

                    {/*File Upload Drag and Drop Area*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.attachments')}</label>
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`maintenance-upload-box w-full border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-150 relative bg-slate-50 flex flex-col items-center justify-center min-h-[140px] ${isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            {!uploadedFile ? (
                                <>
                                    <input
                                        type="file"
                                        id="file-upload-input"
                                        accept={acceptFor(FILE_RULES.maintenance)}
                                        onChange={handleFileChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    <div className="space-y-2 pointer-events-none">
                                        <FontAwesomeIcon icon={faCloudUploadAlt} className="text-3xl text-slate-400" />
                                        <p className="text-sm font-medium text-slate-700 m-0">{t('maintenance.dropFile')} <span className="text-indigo-600 font-bold">{t('maintenance.browse')}</span></p>
                                        <p className="text-slate-400 text-xs m-0">{t('maintenance.supports')}</p>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-3 flex flex-col items-center w-full z-10">
                                    {isVideo ? (
                                        <video
                                            src={URL.createObjectURL(uploadedFile)}
                                            className="w-40 h-24 object-cover rounded border border-slate-200 bg-slate-900"
                                            muted
                                        />
                                    ) : (
                                        <img
                                            src={URL.createObjectURL(uploadedFile)}
                                            alt="Maintenance Issue Preview"
                                            className="w-32 h-20 object-cover rounded border border-slate-200"
                                        />
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
                                        <FontAwesomeIcon icon={faUndo} /> {t('maintenance.removeRetake')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/*Home Entry Checkbox Option Area*/}
                    <div className="md:col-span-2 flex items-center space-x-3 pt-2 select-none">
                        <input
                            type="checkbox"
                            id="permission-enter-checkbox"
                            checked={permissionToEnter}
                            onChange={(e) => setPermissionToEnter(e.target.checked)}
                            className="w-4 h-4 rounded border-indigo-400 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer transition-colors"
                        />
                        <label
                            htmlFor="permission-enter-checkbox"
                            className="text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-800"
                        >
                            {t('maintenance.permissionEnter')}
                        </label>
                    </div>

                    {/*Form Actions footer container*/}
                    <div className="md:col-span-2 border-t border-slate-100 pt-6 flex justify-end">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="maintenance-submit-btn btn-interactive w-full sm:w-auto min-h-[48px] bg-[#10b981] hover:bg-[#059669] hover:scale-[1.03] active:scale-[0.97] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {t('maintenance.submit')}
                        </button>
                    </div>

                </form>
            </div>

            {/*Standalone Modular Success Display Layer Component*/}
            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    navigate('/home');
                }}
                message={t('maintenance.success')}
            />
        </div>
    );
}
