import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt, faUndo } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';
import { useNavigate } from 'react-router-dom';
import api from "../api/axiosConfig";
import { useLang } from '../config/i18n';
import { MAINTENANCE_CATEGORIES } from '../config/maintenanceOptions';
import { LIMITS, addDays, checkDate, checkText, localDateString } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import useFilePreview from '../hooks/useFilePreview';
import FieldError from '../Components/form/FieldError';
import CharCount from '../Components/form/CharCount';
import { formatFileSize, invalidCls } from '../Components/form/formHelpers';

const TIME_WINDOWS = ['morning', 'afternoon'];
const DESCRIPTION_MIN = 10;
import '../assets/styles/responsive/user/maintenance-request.responsive.css';

export default function MaintenanceRequest() {
    const { t } = useLang();
    const [issueType, setIssueType] = useState('');
    const [preferredDate, setPreferredDate] = useState('');
    const [preferredTime, setPreferredTime] = useState('');
    const [description, setDescription] = useState('');
    const [permissionToEnter, setPermissionToEnter] = useState(false);//checkbox state
    const [uploadedFile, setUploadedFile, previewUrl] = useFilePreview();
    const [isDragging, setIsDragging] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    // A visit from today up to 2 weeks ahead (the shared date helpers replace a
    // hand-made Philippine-time conversion that duplicated localDateString).
    const minDateString = localDateString();
    const maxDateString = addDays(14);

    //File uploading drop mechanics
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    // Keys match maintenance_request.php's form fields.
    const form = useFieldErrors({
        issueType: (v) => (MAINTENANCE_CATEGORIES.some(c => c.value === v) ? '' : 'Please choose the type of issue.'),
        preferredDate: (v) => checkDate(v, { min: minDateString, max: maxDateString, label: 'Preferred date' }),
        preferredTime: (v) => (TIME_WINDOWS.includes(v) ? '' : 'Please choose a time window.'),
        description: (v) => checkText(v, { label: 'Description', min: DESCRIPTION_MIN, max: LIMITS.message }),
        uploadedFile: (f) => (f ? checkFile(f, FILE_RULES.maintenance) : ''),
    }, { idPrefix: 'maint-' });
    const values = { issueType, preferredDate, preferredTime, description, uploadedFile };
    const setters = { issueType: setIssueType, preferredDate: setPreferredDate, preferredTime: setPreferredTime, description: setDescription };
    const change = (name) => (e) => { setters[name](e.target.value); form.clearError(name); };
    const blur = (name) => () => {
        const v = name === 'description' ? description.trim() : values[name];
        if (v !== values[name]) setters[name](v);
        if (v) form.validateField(name, { ...values, [name]: v });
    };

    const acceptFile = (file) => {
        const fileError = checkFile(file, FILE_RULES.maintenance);
        form.setFieldError('uploadedFile', fileError);
        if (fileError) return;
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
        const cleanDescription = description.trim();
        setDescription(cleanDescription);
        if (!form.validateAll({ ...values, description: cleanDescription })) return;

        const formData = new FormData();
        formData.append('issueType', issueType);
        formData.append('preferredDate', preferredDate);
        formData.append('preferredTime', preferredTime);
        formData.append('description', cleanDescription);
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
            } else if (!form.applyServerErrors(res)) {
                alert(res.data.message);
            }
        } catch (error) {
            if (!form.applyServerErrors(error)) alert(apiErrorMessage(error, 'Failed to submit your request. Please try again.'));
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
                <form className="maintenance-form-card animate-fade-in-up bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleFormSubmit} noValidate>

                    {/*Issue Category Selector*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="maint-issueType" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.category')}</label>
                        <select
                            {...form.fieldA11y('issueType')}
                            value={issueType}
                            onChange={change('issueType')}
                            className={"maintenance-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.issueType)}
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>{t('maintenance.selectCategory')}</option>
                            {MAINTENANCE_CATEGORIES.map(c => (
                                <option key={c.value} value={c.value}>{t(c.i18nKey)}</option>
                            ))}
                        </select>
                        <FieldError id="maint-issueType" error={form.errors.issueType} className="m-0" />
                    </div>

                    {/*Preferred Date Field*/}
                    <div className="flex flex-col space-y-2">
                        <label htmlFor="maint-preferredDate" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.prefDate')}</label>
                        <input
                            type="date"
                            {...form.fieldA11y('preferredDate')}
                            min={minDateString}
                            max={maxDateString}
                            value={preferredDate}
                            onChange={change('preferredDate')}
                            onBlur={blur('preferredDate')}
                            className={"maintenance-input focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.preferredDate)}
                            style={{ color: '#1e293b' }}
                            required
                        />
                        <FieldError id="maint-preferredDate" error={form.errors.preferredDate} className="m-0" />
                    </div>

                    {/*Time Window Selector*/}
                    <div className="flex flex-col space-y-2">
                        <label htmlFor="maint-preferredTime" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.prefTime')}</label>
                        <select
                            {...form.fieldA11y('preferredTime')}
                            value={preferredTime}
                            onChange={change('preferredTime')}
                            className={"maintenance-select focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]" + invalidCls(form.errors.preferredTime)}
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>{t('maintenance.selectTime')}</option>
                            <option value="morning">{t('maintenance.morning')}</option>
                            <option value="afternoon">{t('maintenance.afternoon')}</option>
                        </select>
                        <FieldError id="maint-preferredTime" error={form.errors.preferredTime} className="m-0" />
                    </div>

                    {/*Problem Description Area*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="maint-description" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.description')}</label>
                        <textarea
                            rows={4}
                            {...form.fieldA11y('description')}
                            placeholder={t('maintenance.descPlaceholder')}
                            value={description}
                            maxLength={LIMITS.message}
                            onChange={change('description')}
                            onBlur={blur('description')}
                            className={"maintenance-textarea focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base resize-none" + invalidCls(form.errors.description)}
                            style={{ color: '#1e293b' }}
                            required
                        />
                        <FieldError id="maint-description" error={form.errors.description} className="m-0" />
                        <CharCount value={description} max={LIMITS.message} className="m-0" />
                    </div>

                    {/*File Upload Drag and Drop Area*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="maint-uploadedFile" className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('maintenance.attachments')}</label>
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
                                        {...form.fieldA11y('uploadedFile')}
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
                                            src={previewUrl}
                                            className="w-40 h-24 object-cover rounded border border-slate-200 bg-slate-900"
                                            muted
                                        />
                                    ) : (
                                        <img
                                            src={previewUrl}
                                            alt="Maintenance Issue Preview"
                                            className="w-32 h-20 object-cover rounded border border-slate-200"
                                        />
                                    )}
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-slate-800 m-0 truncate max-w-[240px]">{uploadedFile.name}</p>
                                        <p className="text-slate-400 text-xs m-0 mt-0.5">({formatFileSize(uploadedFile.size)})</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setUploadedFile(null); form.clearError('uploadedFile'); }}
                                        className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-4 py-2 rounded-xl border-0 cursor-pointer transition-colors shadow-sm flex items-center gap-1.5"
                                    >
                                        <FontAwesomeIcon icon={faUndo} /> {t('maintenance.removeRetake')}
                                    </button>
                                </div>
                            )}
                        </div>
                        <FieldError id="maint-uploadedFile" error={form.errors.uploadedFile} className="m-0" />
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
                            {isSubmitting ? 'Submitting…' : t('maintenance.submit')}
                        </button>
                    </div>

                </form>
            </div>

            {/*Standalone Modular Success Display Layer Component*/}
            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    navigate('/my-requests'); // where the request can be followed
                }}
                message={t('maintenance.success')}
            />
        </div>
    );
}
