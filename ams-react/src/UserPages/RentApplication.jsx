import { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle2, Hourglass, Check, Info, FileText, X, AlertCircle } from 'lucide-react';
import SuccessModal from '../Components/SuccessModal';
import HouseRulesModal from '../Components/HouseRulesModal';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { getSystemSettings } from '../config/systemSettings';
import { useLang } from '../config/i18n';
import { LIMITS, checkIntRange, checkPersonName, checkPhMobile, toPhLocal10, toPhE164 } from '../utils/validation';
import PhoneInput from '../Components/PhoneInput';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import useFilePreview from '../hooks/useFilePreview';
import FieldError from '../Components/form/FieldError';
import { blockNonIntegerKeys, formatFileSize, invalidCls } from '../Components/form/formHelpers';
import '../assets/styles/responsive/user/rent-application.responsive.css';

const GENDERS = ['Male', 'Female', 'Other'];
const MAX_OCCUPANTS = 8;
const MAX_MONTHS = 24;
const INPUT_CLS = "w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner text-sm transition-all font-medium disabled:opacity-75 disabled:cursor-not-allowed";
const LOCKED_CLS = "w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 shadow-inner text-sm font-medium cursor-not-allowed";
const LABEL_CLS = "text-sm font-bold text-slate-700";

// Fallback only, used until the room's real rooms.monthly_rent loads —
// it used to be the permanent source of truth, silently ignoring any rate
// an admin configured via update_room.php.
const getRoomPriceFallback = (id) => (['I', 'J', 'K', 'L', 'M', 'N'].includes(id) ? 3500 : 4000);

// The unsent form is kept per user in sessionStorage (not localStorage), so a
// phone number never outlives the browser tab on a shared computer. Documents
// can't be stored and must be picked again.
const draftKey = (userId) => `rentApplicationDraft:${userId || 'guest'}`;
const readDraft = (userId) => {
    try {
        return JSON.parse(sessionStorage.getItem(draftKey(userId)) || 'null') || {};
    } catch {
        return {};
    }
};

// One drop zone per required document.
function DocumentCard({ form, fieldKey, label, dropText, file, previewUrl, keepsPath, dragging, setDragging, onPick, onRemove, onPreview, t }) {
    const isImage = file && (file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name));
    return (
        <div className="flex flex-col space-y-2">
            <label htmlFor={`rent-${fieldKey}`} className={LABEL_CLS}>{label} {form.errors[fieldKey] && <span className="text-rose-500">*</span>}</label>
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files?.[0]) onPick(e.dataTransfer.files[0]);
                }}
                className={`rent-app-upload-zone border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-200 relative bg-slate-50 flex flex-col items-center justify-center min-h-[180px] ${dragging ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02]' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-100'}${invalidCls(form.errors[fieldKey])}`}
            >
                {!file ? (
                    <>
                        <input
                            type="file"
                            {...form.fieldA11y(fieldKey)}
                            accept={acceptFor(FILE_RULES.document)}
                            onChange={(e) => { if (e.target.files?.[0]) onPick(e.target.files[0]); e.target.value = ''; }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div className="space-y-3 pointer-events-none p-2 flex flex-col items-center">
                            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center border border-slate-200">
                                <UploadCloud className="w-6 h-6 text-indigo-500" />
                            </div>
                            <p className="text-xs font-bold text-slate-600 m-0 leading-relaxed">{dropText}<br /><span className="text-indigo-600">{t('rent.browse')}</span></p>
                            {keepsPath && (
                                <p className="text-[10px] text-emerald-600 font-bold m-0">✓ Keeps: {keepsPath.split('/').pop()}</p>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="space-y-3 flex flex-col items-center w-full z-10">
                        {isImage ? (
                            <img
                                src={previewUrl}
                                alt={`${label} preview`}
                                onClick={() => onPreview(file, label)}
                                className="w-full h-24 object-cover rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity"
                            />
                        ) : (
                            <div className="w-full h-24 bg-indigo-50 flex flex-col items-center justify-center rounded-xl border border-indigo-200 text-indigo-600">
                                <FileText className="w-8 h-8 mb-2" />
                                <button type="button" onClick={() => onPreview(file, label)} className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm cursor-pointer border-0">View PDF</button>
                            </div>
                        )}
                        <p className="text-[10px] font-bold text-slate-600 m-0 truncate w-full px-2">
                            {file.name} <span className="font-normal text-slate-400">({formatFileSize(file.size)})</span>
                        </p>
                        <button type="button" onClick={onRemove} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer border-0">Remove</button>
                    </div>
                )}
            </div>
            <FieldError id={`rent-${fieldKey}`} error={form.errors[fieldKey]} className="m-0" />
        </div>
    );
}

export default function RentApplication() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLang();

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
    const defaultFirstName = loggedInUser.first_name || '';
    const defaultMiddleName = loggedInUser.middle_name || '';
    const defaultLastName = loggedInUser.last_name || '';
    const defaultSuffix = loggedInUser.suffix || '';
    const defaultEmail = loggedInUser.email_address || '';
    const defaultContactNo = loggedInUser.contact_no || '';
    const defaultGender = loggedInUser.gender || '';

    const editApp = location.state?.editApplication;
    const isEditing = !!editApp;
    const passedRoomId = location.state?.selectedRoomId || editApp?.room_name || 'C';
    // Read once: a draft only applies to a new application.
    const [draft] = useState(() => (isEditing ? {} : readDraft(loggedInUser.id)));

    const [applicationStatus, setApplicationStatus] = useState('none');

    const [firstName, setFirstName] = useState(editApp?.first_name || defaultFirstName);
    const [middleName, setMiddleName] = useState(editApp?.middle_name || defaultMiddleName);
    const [lastName, setLastName] = useState(editApp?.last_name || defaultLastName);
    const [suffix, setSuffix] = useState(editApp?.suffix || defaultSuffix);

    const [phoneRawNumber, setPhoneRawNumber] = useState(
        editApp?.contact_no
            ? toPhLocal10(editApp.contact_no)
            : (draft.phoneRawNumber || toPhLocal10(defaultContactNo) || '')
    );
    const [email] = useState(editApp?.email || defaultEmail);
    const [gender, setGender] = useState(
        editApp?.gender || draft.gender || defaultGender || ''
    );
    const [occupants, setOccupants] = useState(draft.occupants || '');
    const [monthsOfRent, setMonthsOfRent] = useState(draft.monthsOfRent || '');
    const [prefMoveInDate, setPrefMoveInDate] = useState(draft.prefMoveInDate || '');
    const [isASAP, setIsASAP] = useState(false);
    // Settings → Rental → Minimum Rent Duration (rent_application.php enforces it too).
    const [minMonths, setMinMonths] = useState(1);
    useEffect(() => {
        getSystemSettings().then(s => setMinMonths(Math.min(MAX_MONTHS, s.minLeaseDuration || 1)));
    }, []);

    useEffect(() => {
        const fetchUserProfile = async () => {
            if (!defaultEmail) return;
            try {
                const res = await api.get(`/profile.php?email=${encodeURIComponent(defaultEmail)}`);
                if (res.data.success && res.data.data) {
                    const data = res.data.data;
                    setFirstName(prev => prev || data.first_name || '');
                    setMiddleName(prev => prev || data.middle_name || '');
                    setLastName(prev => prev || data.last_name || '');
                    setSuffix(prev => prev || data.suffix || '');
                    if (data.contact_no) {
                        setPhoneRawNumber(prev => prev || toPhLocal10(data.contact_no));
                    }
                    if (data.gender) {
                        setGender(prev => prev || data.gender);
                    }
                }

                // Fetch existing rent application status
                if (loggedInUser.id) {
                    const roomRes = await api.get(`/my_room.php?userId=${encodeURIComponent(loggedInUser.id)}`);
                    if (roomRes.data.success && roomRes.data.data) {
                        const appData = roomRes.data.data;
                        const status = appData.status;
                        setApplicationStatus(status ? status.toLowerCase() : 'none');
                        // When applying again after rejection, only pre-populate phone and gender
                        if (appData.contact_no) {
                            setPhoneRawNumber(prev => prev || toPhLocal10(appData.contact_no));
                        }
                        if (appData.gender) {
                            setGender(prev => prev || appData.gender);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch user details/application status:", err);
            }
        };
        fetchUserProfile();
    }, [defaultEmail, loggedInUser.id]);

    // Room picker: an applicant may switch to any vacant unit before submitting.
    const [selectedRoomId, setSelectedRoomId] = useState(isEditing ? passedRoomId : (location.state?.selectedRoomId || draft.selectedRoomId || passedRoomId));
    const [rooms, setRooms] = useState([]);
    const [showRoomModal, setShowRoomModal] = useState(false);
    const availableRooms = rooms.filter(r => r.status?.toLowerCase() === 'vacant');
    const roomRent = rooms.find(r => r.id === selectedRoomId)?.rent;
    // Editing keeps the application's own rate; otherwise the room's current rate.
    const monthlyRent = isEditing
        ? Number(editApp.monthly_rent) || getRoomPriceFallback(selectedRoomId)
        : (roomRent != null ? Number(roomRent) : getRoomPriceFallback(selectedRoomId));

    useEffect(() => {
        if (editApp) return; // an edit keeps its unit and rate
        const fetchRooms = async () => {
            try {
                const res = await api.get('/get_rooms.php');
                setRooms(res.data?.rooms || res.data?.data || (Array.isArray(res.data) ? res.data : []));
            } catch (err) {
                console.error("Failed to fetch rooms, using fallback pricing:", err);
            }
        };
        fetchRooms();
    }, [editApp]);

    const [validIdFrontFile, setValidIdFrontFile, validIdFrontUrl] = useFilePreview();
    const [validIdBackFile, setValidIdBackFile, validIdBackUrl] = useFilePreview();
    const [nbiFile, setNbiFile, nbiUrl] = useFilePreview();
    const [submitting, setSubmitting] = useState(false);
    const [isDraggingIdFront, setIsDraggingIdFront] = useState(false);
    const [isDraggingIdBack, setIsDraggingIdBack] = useState(false);
    const [isDraggingNbi, setIsDraggingNbi] = useState(false);

    const [preview, setPreview] = useState(null); // { url, title, isImage }
    const [notice, setNotice] = useState('');     // messages that belong to no single field

    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [agreeRules, setAgreeRules] = useState(false);
    const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const isPendingReview = ['pending', 'pending review'].includes(applicationStatus?.toLowerCase());
    const isReadOnly = isPendingReview || applicationStatus === 'accepted';
    const hasActiveApplication = ['pending', 'pending review', 'approved', 'active'].includes(applicationStatus?.toLowerCase()) && !editApp;
    const isTenant = ['active', 'pending-move-out'].includes(applicationStatus?.toLowerCase());

    // Save the unsent form as the applicant types.
    useEffect(() => {
        if (isEditing || !['none', 'rejected'].includes(applicationStatus)) return;
        try {
            sessionStorage.setItem(draftKey(loggedInUser.id), JSON.stringify({ phoneRawNumber, gender, occupants, monthsOfRent, selectedRoomId, prefMoveInDate }));
        } catch { /* storage full or blocked: the form still works */ }
    }, [phoneRawNumber, gender, occupants, monthsOfRent, prefMoveInDate, selectedRoomId, isEditing, applicationStatus, loggedInUser.id]);

    // Documents are required on every application submission.
    const requireDoc = (label) => (f) => (f ? checkFile(f, FILE_RULES.document) : `Please upload your ${label}.`);
    const form = useFieldErrors({
        suffix: (v) => checkPersonName(v, { label: 'Suffix', max: LIMITS.suffix, required: false }),
        contactNo: (v) => checkPhMobile(v),
        gender: (v) => (GENDERS.includes(v) ? '' : 'Please select your gender.'),
        occupants: (v) => checkIntRange(v === '' ? NaN : v, 1, MAX_OCCUPANTS, 'Number of occupants'),
        monthsOfRent: (v) => checkIntRange(v === '' ? NaN : v, minMonths, MAX_MONTHS, 'Months of rent'),
        prefMoveInDate: (v) => (isASAP || v ? '' : 'Please select when you need to move in by.'),
        // Only a vacant unit can be applied for (checked once the list has loaded).
        roomName: (v) => (!isEditing && rooms.length && !availableRooms.some(r => r.id === v) ? `Room ${v} is not available. Choose another room.` : ''),
        validIdFrontFile: requireDoc('Valid ID (front)'),
        validIdBackFile: requireDoc('Valid ID (back)'),
        nbiFile: requireDoc('NBI Clearance'),
        agreeTerms: (v) => (v ? '' : 'Please read and agree to the terms and privacy policy.'),
        agreeRules: (v) => (v ? '' : 'Please read and agree to follow the apartment rules.'),
    }, { idPrefix: 'rent-' });
    const values = {
        suffix, contactNo: phoneRawNumber, gender, occupants, monthsOfRent, prefMoveInDate, roomName: selectedRoomId,
        validIdFrontFile, validIdBackFile, nbiFile, agreeTerms: agreePrivacy, agreeRules,
    };

    // Accepts the file when it passes the upload rules; otherwise the error pops up as a modal alert.
    const pickFile = (key, setFile) => (file) => {
        const fileError = checkFile(file, FILE_RULES.document);
        if (fileError) {
            setNotice(fileError);
            form.setFieldError(key, fileError);
        } else {
            form.clearError(key);
            setFile(file);
        }
    };
    const removeFile = (key, setFile) => () => { setFile(null); form.clearError(key); };

    const handlePhoneChange = (digits) => {
        if (isReadOnly) return;
        setPhoneRawNumber(digits);
        form.clearError('contactNo');
    };

    const handleOccupantsInput = (e) => {
        if (isReadOnly) return;
        form.clearError('occupants');
        const value = e.target.value;
        if (value === '') { setOccupants(''); return; }
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 1 && num <= MAX_OCCUPANTS) setOccupants(num);
    };

    const handleMonthsInput = (e) => {
        if (isReadOnly) return;
        form.clearError('monthsOfRent');
        const value = e.target.value;
        if (value === '') { setMonthsOfRent(''); return; }
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
            if (num > MAX_MONTHS) setMonthsOfRent(MAX_MONTHS);
            else if (num < 1) setMonthsOfRent(1);
            else setMonthsOfRent(num);
        }
    };

    // The preview's URL is released when the viewer closes.
    const openPreview = (file, title) => {
        setPreview({ url: URL.createObjectURL(file), title, isImage: file.type.startsWith('image/') });
    };
    const closePreview = () => {
        if (preview) URL.revokeObjectURL(preview.url);
        setPreview(null);
    };

    const chooseRoom = (roomId) => {
        setSelectedRoomId(roomId);
        form.clearError('roomName');
        setShowRoomModal(false);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        if (applicationStatus === 'accepted') {
            navigate('/payments');
            return;
        }

        if (hasActiveApplication) {
            setNotice("You already have an active or pending rent application. You cannot submit another one.");
            return;
        }

        if (!agreePrivacy || !agreeRules) {
            form.validateAll({ ...values, agreeTerms: agreePrivacy, agreeRules });
            return;
        }

        // Names and email are read-only copies of the account, so only the
        // editable fields are checked here.
        const cleanSuffix = suffix.trim();
        setSuffix(cleanSuffix);
        if (!form.validateAll({ ...values, suffix: cleanSuffix })) return;

        const finalMonthlyRent = monthlyRent + (occupants > 4 ? (occupants - 4) * 1000 : 0);

        const formData = new FormData();
        if (isEditing) formData.append('appId', editApp.id);
        formData.append('firstName', firstName.trim());
        formData.append('middleName', middleName.trim());
        formData.append('lastName', lastName.trim());
        formData.append('suffix', cleanSuffix);
        formData.append('contactNo', toPhE164(phoneRawNumber));
        formData.append('email', email.trim());
        formData.append('gender', gender);
        formData.append('occupants', occupants);
        formData.append('monthsOfRent', monthsOfRent);
        formData.append('preferredMoveInDate', isASAP ? '' : prefMoveInDate);
        formData.append('isAsap', isASAP ? '1' : '0');
        formData.append('roomName', selectedRoomId);
        formData.append('monthlyRent', finalMonthlyRent);
        formData.append('agreeTerms', agreePrivacy);
        if (validIdFrontFile) formData.append('validIdFrontFile', validIdFrontFile);
        if (validIdBackFile) formData.append('validIdBackFile', validIdBackFile);
        if (nbiFile) formData.append('nbiFile', nbiFile);

        setSubmitting(true);
        try {
            const res = await api.post("/rent_application.php", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                try {
                    sessionStorage.removeItem(draftKey(loggedInUser.id));
                    const updatedUser = {
                        ...loggedInUser,
                        middle_name: middleName,
                        suffix: cleanSuffix,
                        contact_no: toPhE164(phoneRawNumber),
                        gender: gender
                    };
                    sessionStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
                } catch { /* ignore */ }
                setShowSuccessModal(true);
            } else if (!form.applyServerErrors(res)) {
                setNotice(res.data.message || 'Your application could not be submitted.');
            }
        } catch (error) {
            console.error("Error submitting application:", error);
            if (error.response?.status === 413) {
                setNotice("The files you are uploading are larger than the server accepts. Please upload smaller files.");
            } else if (!form.applyServerErrors(error)) {
                setNotice(apiErrorMessage(error, "A network error occurred while submitting your application."));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const docCard = (fieldKey, label, dropText, file, setFile, url, keepsPath, dragging, setDragging) => (
        <DocumentCard
            form={form}
            fieldKey={fieldKey}
            label={label}
            dropText={dropText}
            file={file}
            previewUrl={url}
            keepsPath={keepsPath}
            dragging={dragging}
            setDragging={setDragging}
            onPick={pickFile(fieldKey, setFile)}
            onRemove={removeFile(fieldKey, setFile)}
            onPreview={openPreview}
            t={t}
        />
    );

    return (
        <div className="rent-app-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">

                <div className="rent-app-header-row border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="rent-app-heading text-4xl font-sans font-black m-0 tracking-tight select-none text-slate-900">
                            {t('rent.heading')}
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 m-0 font-medium">
                            {t('rent.subtitle')}
                        </p>
                    </div>

                    {['pending review', 'pending', 'approved', 'active'].includes(applicationStatus?.toLowerCase()) && (
                        <div className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl font-bold text-sm shadow-sm select-none border border-current self-start sm:self-center transition-all duration-300 ${isPendingReview ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {isPendingReview ? <Hourglass className="w-5 h-5 animate-pulse" /> : <Check className="w-5 h-5" />}
                            <div className="flex flex-col text-left">
                                <span className="text-[10px] uppercase tracking-wider opacity-75 leading-none">{t('rent.statusLabel')}</span>
                                <span className="text-sm font-black mt-0.5">{isPendingReview ? t('rent.pendingReview') : t('rent.approved')}</span>
                            </div>
                        </div>
                    )}
                </div>

                {hasActiveApplication ? (
                    isTenant ? (
                        <div className="animate-scale-in bg-white rounded-[2rem] border border-slate-200 p-8 md:p-12 text-center max-w-xl mx-auto space-y-6 shadow-xl shadow-slate-900/5 select-none">
                            <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto border-4 border-emerald-100">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 m-0 tracking-tight">{t('rent.tenancyConfirmed')}</h2>
                                <p className="text-slate-500 text-sm mt-3 m-0 leading-relaxed font-medium px-4">
                                    {t('rent.tenancyDesc')}
                                </p>
                            </div>
                            <div className="rent-app-status-actions grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                                <button type="button" onClick={() => navigate('/my-room')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl text-sm border-0 cursor-pointer transition-all shadow-md shadow-indigo-600/20">{t('rent.goMyRoom')}</button>
                                <button type="button" onClick={() => navigate('/pay-bills')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl text-sm border-0 cursor-pointer transition-colors">{t('rent.payBills')}</button>
                                <button type="button" onClick={() => navigate('/maintenance-request')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl text-sm border-0 cursor-pointer transition-colors">{t('rent.requestMaint')}</button>
                                <button type="button" onClick={() => navigate('/home')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl text-sm border-0 cursor-pointer transition-colors">{t('rent.goHome')}</button>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-scale-in bg-white rounded-[2rem] border border-slate-200 p-8 md:p-12 text-center max-w-xl mx-auto space-y-6 shadow-xl shadow-slate-900/5 select-none">
                            <div className="w-20 h-20 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto border-4 border-indigo-100">
                                <Info className="w-10 h-10 animate-pulse" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 m-0 tracking-tight">{t('rent.applicationActive')}</h2>
                                <p className="text-slate-500 text-sm mt-3 m-0 leading-relaxed font-medium px-4">
                                    {t('rent.applicationActiveDesc').replace('{status}', applicationStatus)}
                                </p>
                            </div>
                            <div className="rent-app-status-actions flex flex-col sm:flex-row gap-3 justify-center pt-4">
                                <button type="button" onClick={() => navigate('/track-application')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl text-sm border-0 cursor-pointer transition-all shadow-md shadow-indigo-600/20">{t('rent.trackApp')}</button>
                                <button type="button" onClick={() => navigate('/home')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-8 rounded-xl text-sm border-0 cursor-pointer transition-colors">{t('rent.goHome')}</button>
                            </div>
                        </div>
                    )
                ) : (
                    <form className="rent-app-form-card bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-900/5 p-6 md:p-10 space-y-10" onSubmit={handleFormSubmit} noValidate>

                        <div className="space-y-5">
                            <h3 className="text-xl font-black m-0 border-b border-slate-100 pb-3 text-slate-900">{t('rent.personalDetails')}</h3>
                            <div className="rent-app-personal-grid grid grid-cols-1 md:grid-cols-4 gap-5">
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-firstName" className={LABEL_CLS}>{t('rent.firstName')}</label>
                                    <input id="rent-firstName" type="text" value={firstName} maxLength={LIMITS.applicantName} disabled className={LOCKED_CLS} />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-middleName" className={LABEL_CLS}>{t('rent.middleName')}</label>
                                    <input id="rent-middleName" type="text" value={middleName} maxLength={LIMITS.applicantName} disabled className={LOCKED_CLS} />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-lastName" className={LABEL_CLS}>{t('rent.lastName')}</label>
                                    <input id="rent-lastName" type="text" value={lastName} maxLength={LIMITS.applicantName} disabled className={LOCKED_CLS} />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-suffix" className={LABEL_CLS}>
                                        {t('rent.suffix')} <span className="text-xs font-normal text-slate-400 ml-1">(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        {...form.fieldA11y('suffix')}
                                        autoComplete="honorific-suffix"
                                        placeholder="e.g. Jr, Sr, III"
                                        value={suffix}
                                        disabled={isReadOnly}
                                        maxLength={LIMITS.suffix}
                                        onChange={(e) => { setSuffix(e.target.value); form.clearError('suffix'); }}
                                        onBlur={() => { const v = suffix.trim(); setSuffix(v); form.validateField('suffix', { ...values, suffix: v }); }}
                                        className={INPUT_CLS + invalidCls(form.errors.suffix)}
                                    />
                                    <FieldError id="rent-suffix" error={form.errors.suffix} className="m-0" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-contactNo" className={LABEL_CLS}>
                                        {t('rent.contactNo')} {form.errors.contactNo && <span className="text-rose-500 ml-0.5">*</span>}
                                    </label>
                                    <PhoneInput
                                        id="rent-contactNo"
                                        name="contactNo"
                                        value={phoneRawNumber}
                                        disabled={isReadOnly}
                                        onChange={handlePhoneChange}
                                        onBlur={() => form.validateField('contactNo', values)}
                                        error={form.errors.contactNo}
                                        required
                                    />
                                </div>

                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-email" className={LABEL_CLS}>{t('rent.email')}</label>
                                    <input id="rent-email" type="email" value={email} maxLength={LIMITS.email} disabled className={LOCKED_CLS} />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-gender" className={LABEL_CLS}>
                                        {t('rent.gender')} {form.errors.gender && <span className="text-rose-500 ml-0.5">*</span>}
                                    </label>
                                    <select
                                        {...form.fieldA11y('gender')}
                                        value={gender}
                                        disabled={isReadOnly}
                                        onChange={(e) => { setGender(e.target.value); form.clearError('gender'); }}
                                        onBlur={() => gender && form.validateField('gender', values)}
                                        className={INPUT_CLS + invalidCls(form.errors.gender)}
                                        required
                                    >
                                        <option value="" disabled hidden>{t('rent.selectGender')}</option>
                                        <option value="Male">{t('rent.male')}</option>
                                        <option value="Female">{t('rent.female')}</option>
                                        <option value="Other">{t('rent.other')}</option>
                                    </select>
                                    <FieldError id="rent-gender" error={form.errors.gender} className="m-0" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="flex flex-col">
                                    <label htmlFor="rent-occupants" className={`${LABEL_CLS} flex justify-between items-start min-h-[56px] mb-1.5`}>
                                        <span>{t('rent.occupants')} {form.errors.occupants && <span className="text-rose-500 ml-0.5">*</span>}</span>
                                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">{t('rent.occupantsSurcharge')}</span>
                                    </label>
                                    <div className="flex flex-col">
                                    <input
                                        type="number"
                                        {...form.fieldA11y('occupants')}
                                        inputMode="numeric"
                                        min="1"
                                        max={MAX_OCCUPANTS}
                                        step="1"
                                        placeholder="2"
                                        value={occupants}
                                        disabled={isReadOnly}
                                        onKeyDown={blockNonIntegerKeys}
                                        onChange={handleOccupantsInput}
                                        onBlur={() => form.validateField('occupants', values)}
                                        className={INPUT_CLS + invalidCls(form.errors.occupants)}
                                        required
                                    />
                                    <FieldError id="rent-occupants" error={form.errors.occupants} className="mt-1 m-0" />
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <label htmlFor="rent-monthsOfRent" className={`${LABEL_CLS} flex justify-between items-start min-h-[56px] mb-1.5`}>
                                        <span>{t('rent.monthsOfRent')} {form.errors.monthsOfRent && <span className="text-rose-500 ml-0.5">*</span>}</span>
                                        <span className="text-xs font-semibold text-slate-400">{t('rent.monthsMax').replace('{min}', minMonths)}</span>
                                    </label>
                                    <div className="flex flex-col">
                                    <input
                                        type="number"
                                        {...form.fieldA11y('monthsOfRent')}
                                        inputMode="numeric"
                                        min={minMonths}
                                        max={MAX_MONTHS}
                                        step="1"
                                        placeholder={`e.g. ${Math.max(6, minMonths)} (Min ${minMonths}, Max 24)`}
                                        value={monthsOfRent}
                                        disabled={isReadOnly}
                                        onKeyDown={blockNonIntegerKeys}
                                        onChange={handleMonthsInput}
                                        onBlur={() => form.validateField('monthsOfRent', values)}
                                        className={INPUT_CLS + invalidCls(form.errors.monthsOfRent)}
                                        required
                                    />
                                    <FieldError id="rent-monthsOfRent" error={form.errors.monthsOfRent} className="mt-1 m-0" />
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <label htmlFor="rent-prefMoveInDate" className={`${LABEL_CLS} flex justify-between items-start min-h-[56px] mb-1.5`}>
                                        <span>Move In By {form.errors.prefMoveInDate && <span className="text-rose-500 ml-0.5">*</span>}</span>
                                        {!isReadOnly && (
                                            <label className="flex items-center gap-1.5 cursor-pointer ml-2 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors">
                                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${isASAP ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-300'}`}>
                                                    {isASAP && <svg className="w-2.5 h-2.5 text-white pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                </div>
                                                <input type="checkbox" checked={isASAP} onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setIsASAP(checked);
                                                    setPrefMoveInDate('');
                                                    if (checked) {
                                                        form.clearError('prefMoveInDate');
                                                    }
                                                }} className="hidden" />
                                                <span className="text-[10px] font-bold text-indigo-600 uppercase select-none">Any time</span>
                                            </label>
                                        )}
                                    </label>
                                    <div className="flex flex-col">
                                    {isASAP ? (
                                        <input
                                            type="text"
                                            value="Any time"
                                            disabled
                                            className={INPUT_CLS + " text-slate-500 font-bold"}
                                        />
                                    ) : (
                                        <input
                                            type="date"
                                            {...form.fieldA11y('prefMoveInDate')}
                                            min={new Date().toISOString().split('T')[0]}
                                            value={prefMoveInDate}
                                            disabled={isReadOnly}
                                            onChange={(e) => { setPrefMoveInDate(e.target.value); form.clearError('prefMoveInDate'); }}
                                            onBlur={() => form.validateField('prefMoveInDate', values)}
                                            className={INPUT_CLS + invalidCls(form.errors.prefMoveInDate)}
                                            required
                                        />
                                    )}
                                    <FieldError id="rent-prefMoveInDate" error={form.errors.prefMoveInDate} className="mt-1 m-0" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <h3 className="text-xl font-black m-0 border-b border-slate-100 pb-3 text-slate-900">{t('rent.roomDetails')}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-roomType" className="text-sm font-bold text-slate-800 select-none">{t('rent.roomType')}</label>
                                    <input id="rent-roomType" type="text" value="Studio" disabled className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-extrabold text-sm select-none cursor-not-allowed shadow-inner" />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-roomName" className="text-sm font-bold text-slate-800 select-none flex justify-between">
                                        {t('rent.assignedRoom')}
                                        {!isReadOnly && !isEditing && (
                                            <button type="button" onClick={() => setShowRoomModal(true)} className="text-xs text-indigo-600 font-bold hover:underline bg-transparent border-0 cursor-pointer p-0">Change</button>
                                        )}
                                    </label>
                                    <input
                                        type="text"
                                        {...form.fieldA11y('roomName')}
                                        value={`Room ${selectedRoomId}`}
                                        disabled
                                        className={`w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-extrabold text-sm select-none cursor-not-allowed shadow-inner${invalidCls(form.errors.roomName)}`}
                                    />
                                    <FieldError id="rent-roomName" error={form.errors.roomName} className="m-0" />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="rent-monthlyRent" className="text-sm font-bold text-slate-800 select-none">{t('rent.monthlyRent')}</label>
                                    <input
                                        id="rent-monthlyRent"
                                        type="text"
                                        value={`₱${(monthlyRent + (occupants > 4 ? (occupants - 4) * 1000 : 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                        disabled
                                        className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-indigo-700 font-black text-lg select-none cursor-not-allowed shadow-inner"
                                    />
                                    {occupants > 4 && (
                                        <span className="text-[10px] text-emerald-600 font-bold mt-1 uppercase tracking-wide">
                                            {t('rent.extraOccupantFee').replace('{amount}', ((occupants - 4) * 1000).toLocaleString())}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="border-b border-slate-100 pb-3">
                                <h3 className="text-xl font-black m-0 text-slate-900">{t('rent.verificationDocs')}</h3>
                                <p className="text-slate-500 text-xs mt-1.5 m-0 font-semibold">{t('rent.acceptedFormats')}</p>
                            </div>

                            {isReadOnly ? (
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-center space-x-3 text-slate-600 text-sm font-bold">
                                    <Info className="text-indigo-500 w-5 h-5" />
                                    <span>{t('rent.docsLocked')}</span>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {docCard('validIdFrontFile', t('rent.validIdFront'), t('rent.dropFront'), validIdFrontFile, setValidIdFrontFile, validIdFrontUrl, null, isDraggingIdFront, setIsDraggingIdFront)}
                                        {docCard('validIdBackFile', t('rent.validIdBack'), t('rent.dropBack'), validIdBackFile, setValidIdBackFile, validIdBackUrl, null, isDraggingIdBack, setIsDraggingIdBack)}
                                    </div>
                                    <div className="flex justify-center pt-2">
                                        <div className="w-full md:w-1/2">
                                            {docCard('nbiFile', t('rent.nbiClearance'), t('rent.dropNbi'), nbiFile, setNbiFile, nbiUrl, null, isDraggingNbi, setIsDraggingNbi)}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-8 border-t border-slate-200 flex flex-col items-center gap-4">
                            <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                                {!isReadOnly && (
                                    <div className="flex w-full flex-col items-start gap-3 sm:flex-1">
                                        <div className="flex items-start gap-3">
                                            <label className="group relative mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    {...form.fieldA11y('agreeTerms')}
                                                    checked={agreePrivacy}
                                                    onChange={(e) => { setAgreePrivacy(e.target.checked); form.clearError('agreeTerms'); }}
                                                    className="peer sr-only"
                                                />
                                                <div className="flex h-full w-full items-center justify-center rounded-md border-2 border-slate-300 transition-all peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 group-hover:border-indigo-400">
                                                    <Check className={`h-3.5 w-3.5 text-white transition-transform duration-200 ${agreePrivacy ? 'scale-100' : 'scale-0'}`} />
                                                </div>
                                            </label>
                                            <label htmlFor="rent-agreeTerms" className="text-sm font-semibold text-slate-600">
                                                {t('rent.agreeTerms')}{' '}
                                                <button type="button" onClick={() => setShowTermsModal(true)} className="inline cursor-pointer border-0 bg-transparent p-0 font-bold text-indigo-600 underline underline-offset-2 hover:text-indigo-700">
                                                    {t('rent.termsLink')}
                                                </button>
                                            </label>
                                        </div>
                                        <FieldError id="rent-agreeTerms" error={form.errors.agreeTerms} className="m-0" />

                                        <div className="flex items-start gap-3">
                                            <label className="group relative mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    {...form.fieldA11y('agreeRules')}
                                                    checked={agreeRules}
                                                    onChange={(e) => { setAgreeRules(e.target.checked); form.clearError('agreeRules'); }}
                                                    className="peer sr-only"
                                                />
                                                <div className="flex h-full w-full items-center justify-center rounded-md border-2 border-slate-300 transition-all peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 group-hover:border-indigo-400">
                                                    <Check className={`h-3.5 w-3.5 text-white transition-transform duration-200 ${agreeRules ? 'scale-100' : 'scale-0'}`} />
                                                </div>
                                            </label>
                                            <label htmlFor="rent-agreeRules" className="text-sm font-semibold text-slate-600">
                                                I have read and agree to the {' '}
                                                <button type="button" onClick={(e) => { e.preventDefault(); setIsRulesModalOpen(true); }} className="inline cursor-pointer border-0 bg-transparent p-0 font-semibold text-indigo-600 underline hover:text-indigo-800">
                                                    Apartment Rules &amp; Policies
                                                </button>.
                                            </label>
                                        </div>
                                        <FieldError id="rent-agreeRules" error={form.errors.agreeRules} className="m-0" />
                                    </div>
                                )}

                                {isPendingReview ? (
                                    <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-700 text-sm font-bold w-full">
                                        {t('rent.pendingMsg')}
                                    </div>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={submitting || (applicationStatus !== 'accepted' && (!agreePrivacy || !agreeRules))}
                                        className={`rent-app-submit-btn w-full sm:w-auto font-black px-12 py-4 rounded-xl text-sm transition-all duration-300 shadow-xl border-0 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${applicationStatus === 'accepted' ? 'bg-[#10b981] hover:bg-[#059669] shadow-emerald-600/30 text-white cursor-pointer' : (!agreePrivacy || !agreeRules || submitting) ? 'bg-slate-400 hover:bg-slate-400 text-white cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30 text-white cursor-pointer hover:-translate-y-1 active:translate-y-0'}`}
                                    >
                                        {submitting ? 'Submitting…' : applicationStatus === 'accepted' ? t('rent.proceedPayment') : t('rent.submitApp')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                )}
            </div>

            {/* Room Selection Modal: vacant units only */}
            {showRoomModal && (
                <div onClick={() => setShowRoomModal(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="rent-room-modal-title" className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-scale-in overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 id="rent-room-modal-title" className="text-xl font-black text-slate-900 m-0">Select Available Room</h3>
                            <button type="button" aria-label="Close" onClick={() => setShowRoomModal(false)} className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors border-0">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-slate-50 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {availableRooms.length > 0 ? availableRooms.map(room => (
                                <button
                                    type="button"
                                    key={room.id}
                                    onClick={() => chooseRoom(room.id)}
                                    aria-pressed={selectedRoomId === room.id}
                                    className={`text-left p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedRoomId === room.id ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/10' : 'border-slate-200 bg-white hover:border-indigo-300'}`}
                                >
                                    <span className="flex justify-between items-start mb-2">
                                        <span className="text-lg font-black text-slate-900">Room {room.id}</span>
                                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md uppercase tracking-wider">Available</span>
                                    </span>
                                    <span className="block text-sm font-medium text-slate-500">Floor: <span className="text-slate-800 font-bold">{room.floor || 'N/A'}</span></span>
                                    <span className="block text-indigo-700 font-black text-lg">₱{Number(room.rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}<span className="text-xs text-indigo-500 font-medium">/mo</span></span>
                                </button>
                            )) : (
                                <div className="col-span-2 text-center text-slate-500 py-10 font-bold">No available rooms at the moment.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Notice: messages that belong to no single field */}
            {notice && (
                <div onClick={() => setNotice('')} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="rent-notice-title" aria-describedby="rent-notice-text" className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm flex flex-col p-8 text-center animate-scale-in border-4 border-rose-100">
                        <div className="w-20 h-20 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-5">
                            <AlertCircle className="w-10 h-10" />
                        </div>
                        <h3 id="rent-notice-title" className="text-2xl font-black text-slate-900 m-0 mb-3">Notice</h3>
                        <p id="rent-notice-text" className="text-slate-600 text-sm font-medium m-0 mb-8 leading-relaxed px-2">{notice}</p>
                        <button type="button" autoFocus onClick={() => setNotice('')} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-sm transition-colors cursor-pointer shadow-md border-0">
                            I Understand
                        </button>
                    </div>
                </div>
            )}

            {/* Document Preview Modal (images and PDFs) */}
            {preview && (
                <div onClick={closePreview} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-scale-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                            <h3 className="text-lg font-black text-slate-900 m-0 flex items-center gap-2">
                                <FileText className="text-rose-500 w-5 h-5" />
                                {preview.title}
                            </h3>
                            <button type="button" aria-label={t('rent.closePdf')} onClick={closePreview} className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors border-0">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 w-full bg-slate-100 p-4 flex items-center justify-center overflow-auto relative">
                            {preview.isImage ? (
                                <img src={preview.url} alt={preview.title} className="max-w-full max-h-full object-contain rounded-xl shadow-md border border-slate-200 bg-white" />
                            ) : (
                                <iframe src={preview.url} title={preview.title} className="w-full h-full border-0 rounded-xl bg-white shadow-inner"></iframe>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showTermsModal && (
                <div onClick={() => setShowTermsModal(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()} className="rent-app-terms-modal bg-white rounded-[2rem] shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] animate-scale-in overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 className="text-xl font-black text-slate-900 m-0">{t('rent.termsTitle')}</h3>
                            <button type="button" aria-label="Close" onClick={() => setShowTermsModal(false)} className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors border-0">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-600 leading-relaxed text-left">
                            <div>
                                <h4 className="font-bold text-slate-900 m-0 mb-1">{t('rent.terms1Title')}</h4>
                                <p className="m-0 font-medium">{t('rent.terms1Body')}</p>
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 m-0 mb-1">{t('rent.terms2Title')}</h4>
                                <p className="m-0 font-medium">{t('rent.terms2Body')}</p>
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 m-0 mb-1">{t('rent.terms3Title')}</h4>
                                <p className="m-0 font-medium">{t('rent.terms3Body')}</p>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50">
                            <button type="button" onClick={() => { setAgreePrivacy(true); form.clearError('agreeTerms'); setShowTermsModal(false); }} className="bg-[#10b981] hover:bg-[#059669] text-white font-black px-8 py-3 rounded-xl text-sm transition-colors shadow-md shadow-emerald-600/20 cursor-pointer border-0">
                                {t('rent.acceptAgree')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <HouseRulesModal isOpen={isRulesModalOpen} onClose={() => setIsRulesModalOpen(false)} />

            <SuccessModal
                isOpen={showSuccessModal}
                onClose={() => { setShowSuccessModal(false); navigate('/track-application'); }}
                message={t('rent.successMsg')}
            />
        </div>
    );
}
