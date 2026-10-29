import { useState, useEffect, useRef, useCallback } from 'react';
import { UploadCloud, CheckCircle2, Hourglass, Check, Info, FileText, X } from 'lucide-react';
import SuccessModal from '../Components/SuccessModal';
import HouseRulesModal from '../Components/HouseRulesModal';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { getSystemSettings } from '../config/systemSettings';
import { useLang } from '../config/i18n';
import { LIMITS, MOVE_IN_WINDOW_DEFAULT, checkMoveInDate, moveInBounds, moveInRangeText, checkIntRange, checkPersonName, checkPhMobile, checkText, toPhLocal10, toPhE164 } from '../utils/validation';
import PhoneInput from '../Components/PhoneInput';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import InlineAlert from '../Components/InlineAlert';
import useDialog from '../hooks/useDialog';
import { blockNonIntegerKeys, formatFileSize, invalidCls } from '../Components/form/formHelpers';
import '../assets/styles/responsive/user/rent-application.responsive.css';

const GENDERS = ['Male', 'Female', 'Other'];
const MAX_OCCUPANTS = 8;
const MAX_MONTHS = 24;
// rent_applications.previous_address; rent_application.php checks the same range.
const ADDRESS_MIN = 5;
const ADDRESS_MAX = 255;
const docKey = (id) => `doc_${id}`;
const INPUT_CLS = "w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 shadow-sm text-base sm:text-sm transition-all font-medium hover:border-slate-300 disabled:opacity-75 disabled:cursor-not-allowed";
const LOCKED_CLS = "w-full px-4 py-3 rounded-xl bg-slate-100/70 border border-slate-200/80 text-slate-500 shadow-sm text-sm font-medium cursor-not-allowed select-none";
const LABEL_CLS = "text-sm font-bold text-slate-700 select-none";

// Rent, room type and the occupant rules come from the room list and Settings
// (rent_application.php takes the rent from the room itself). A hardcoded
// price per room letter and "Studio" used to show until, or instead of, them.
// Above this many occupants each extra person adds the per-person surcharge
// (config.php apply_occupant_count()).
const SURCHARGE_FROM_OCCUPANTS = 4;

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

// One drop zone per application requirement (Settings → Application Requirements).
function DocumentCard({ form, fieldKey, label, optional, dropText, file, previewUrl, keepsPath, dragging, setDragging, onPick, onRemove, onPreview, t }) {
    const isImage = file && (file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name));
    return (
        <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between min-h-[26px]">
                <label htmlFor={`rent-${fieldKey}`} className={LABEL_CLS}>
                    {label}
                    {form.errors[fieldKey] && <span className="text-rose-500 ml-0.5">*</span>}
                </label>
                {optional ? (
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                        {t('rent.optional') || 'Optional'}
                    </span>
                ) : (
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                        Required
                    </span>
                )}
            </div>
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files?.[0]) onPick(e.dataTransfer.files[0]);
                }}
                className={`rent-app-upload-zone border-2 border-dashed rounded-2xl p-5 text-center transition-all duration-200 relative bg-slate-50/50 flex flex-col items-center justify-center min-h-[175px] ${dragging ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20'}${invalidCls(form.errors[fieldKey])}`}
            >
                {!file ? (
                    <>
                        <input
                            type="file"
                            id={`rent-${fieldKey}`}
                            {...form.fieldA11y(fieldKey)}
                            accept={acceptFor(FILE_RULES.document)}
                            onChange={(e) => { if (e.target.files?.[0]) onPick(e.target.files[0]); e.target.value = ''; }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div className="space-y-3 pointer-events-none p-2 flex flex-col items-center">
                            <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-200/80 text-indigo-600">
                                <UploadCloud className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-700 m-0 leading-relaxed">
                                    {dropText} <span className="text-indigo-600 underline underline-offset-2">{t('rent.browse')}</span>
                                </p>
                                <p className="text-[11px] text-slate-400 m-0 mt-0.5 font-medium">PDF, PNG, JPG up to 10MB</p>
                            </div>
                            {keepsPath && (
                                <p className="text-xs text-emerald-600 font-bold m-0 flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5 inline" /> {t('rent.docOnFile')}
                                </p>
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
                                className="w-full h-28 object-cover rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                            />
                        ) : (
                            <div className="w-full h-24 bg-indigo-50 flex flex-col items-center justify-center rounded-xl border border-indigo-200 text-indigo-600">
                                <FileText className="w-8 h-8 mb-2" />
                                <button type="button" onClick={() => onPreview(file, label)} className="min-h-[44px] bg-indigo-600 text-white text-sm font-bold px-4 rounded-lg shadow-sm cursor-pointer border-0">{t('rent.viewPdf')}</button>
                            </div>
                        )}
                        <p className="text-xs font-bold text-slate-700 m-0 truncate w-full px-2">
                            {file.name} <span className="font-normal text-slate-500">({formatFileSize(file.size)})</span>
                        </p>
                        <button type="button" onClick={onRemove} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-bold min-h-[44px] rounded-xl transition-colors cursor-pointer border-0">{t('common.remove')}</button>
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
    const { t, lang } = useLang();

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
    // No room passed in means none chosen yet (it used to default to Room C).
    const passedRoomId = location.state?.selectedRoomId || editApp?.room_name || '';
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
    const [previousAddress, setPreviousAddress] = useState(editApp?.previous_address || draft.previousAddress || '');
    const [isASAP, setIsASAP] = useState(false);
    // Settings → Rental → Minimum Rent Duration (rent_application.php enforces it too).
    const [minMonths, setMinMonths] = useState(1);
    // Settings → Rental → Earliest / Latest Move-In Date (rent_application.php enforces it too).
    const [moveInWindow, setMoveInWindow] = useState(MOVE_IN_WINDOW_DEFAULT);
    const moveInLimits = moveInBounds(moveInWindow);
    // Settings → Rental → Maximum Occupants per Unit, and the per-person surcharge.
    const [maxOccupants, setMaxOccupants] = useState(MAX_OCCUPANTS);
    const [surchargePerPerson, setSurchargePerPerson] = useState(null);
    useEffect(() => {
        getSystemSettings().then(s => {
            setMaxOccupants(s.maxOccupantsPerUnit || MAX_OCCUPANTS);
            setSurchargePerPerson(s.occupantSurchargePerPerson);
            setMinMonths(Math.min(MAX_MONTHS, s.minLeaseDuration || 1));
            setMoveInWindow({ min: s.moveInMinDays ?? MOVE_IN_WINDOW_DEFAULT.min, max: s.moveInMaxDays || MOVE_IN_WINDOW_DEFAULT.max });
        });
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

            } catch (err) {
                console.error("Failed to fetch user details:", err);
            }
        };
        // The application status is fetched on its own: it used to sit in the
        // same try as the profile, so a failed profile request left an applicant
        // who had already applied looking at a blank form.
        const fetchApplicationStatus = async () => {
            if (!loggedInUser.id) return;
            try {
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
            } catch (err) {
                console.error("Failed to fetch application status:", err);
            }
        };
        fetchUserProfile();
        fetchApplicationStatus();
    }, [defaultEmail, loggedInUser.id]);

    // Room picker: an applicant may switch to any vacant unit before submitting.
    const [selectedRoomId, setSelectedRoomId] = useState(isEditing ? passedRoomId : (location.state?.selectedRoomId || draft.selectedRoomId || passedRoomId));
    const [rooms, setRooms] = useState([]);
    const [showRoomModal, setShowRoomModal] = useState(false);
    const availableRooms = rooms.filter(r => r.status?.toLowerCase() === 'vacant');
    // Ids compared as strings: the API may send them as numbers.
    const sameRoom = (a, b) => String(a ?? '') === String(b ?? '');
    const selectedRoom = rooms.find(r => sameRoom(r.id, selectedRoomId)) || null;
    // The room's base rate (what rent_application.php bills); an edit whose room
    // is not in the list falls back to the application's own rate. null = not
    // known yet, shown as a dash, never as a guessed price.
    const baseRent = selectedRoom?.rent != null ? Number(selectedRoom.rent)
        : isEditing && Number(editApp.monthly_rent) ? Number(editApp.monthly_rent)
        : null;
    const extraOccupants = Math.max(0, (Number(occupants) || 0) - SURCHARGE_FROM_OCCUPANTS);
    const surcharge = extraOccupants * (surchargePerPerson ?? 0);
    const monthlyRent = baseRent === null ? null : baseRent + surcharge;

    // The room list gives the rate and type, also when editing (the unit stays fixed).
    useEffect(() => {
        const fetchRooms = async () => {
            try {
                const res = await api.get('/get_rooms.php');
                setRooms(res.data?.rooms || res.data?.data || (Array.isArray(res.data) ? res.data : []));
            } catch (err) {
                console.error("Failed to fetch rooms:", err);
            }
        };
        fetchRooms();
    }, []);

    // The documents to upload come from Settings → Application Requirements.
    // On a resubmission, files already on the application count as provided.
    const [requirements, setRequirements] = useState([]);
    const [requirementsState, setRequirementsState] = useState('loading'); // loading | ready | error
    const [onFile, setOnFile] = useState({}); // requirement id → document already uploaded
    useEffect(() => {
        let cancelled = false;
        api.get('/get_application_requirements.php')
            .then((res) => {
                if (cancelled) return;
                setRequirements(res.data?.requirements || []);
                setRequirementsState('ready');
            })
            .catch(() => { if (!cancelled) setRequirementsState('error'); });
        if (isEditing) {
            api.get('/get_documents.php')
                .then((res) => {
                    if (cancelled || !res.data?.success || Number(res.data.application_id) !== Number(editApp.id)) return;
                    const map = {};
                    (res.data.documents || []).forEach((d) => { if (d.requirement_id != null) map[d.requirement_id] = d; });
                    setOnFile(map);
                })
                .catch(() => { /* the form still works: every required file must then be picked */ });
        }
        return () => { cancelled = true; };
    }, [isEditing, editApp?.id]);
    const requirementLabel = (r) => (lang === 'fil' && r.label_fil?.trim() ? r.label_fil : r.label);

    // Picked files per requirement id, each with a blob: URL for its preview.
    // A URL is released when its file is replaced or removed, and on unmount.
    const [docFiles, setDocFiles] = useState({}); // id → { file, url }
    const docFilesRef = useRef({});
    useEffect(() => () => {
        Object.values(docFilesRef.current).forEach((d) => d?.url && URL.revokeObjectURL(d.url));
    }, []);
    const setDocFile = useCallback((id, file) => {
        const prev = docFilesRef.current;
        if (prev[id]?.url) URL.revokeObjectURL(prev[id].url);
        const next = { ...prev };
        if (file) next[id] = { file, url: URL.createObjectURL(file) };
        else delete next[id];
        docFilesRef.current = next;
        setDocFiles(next);
    }, []);
    const [draggingId, setDraggingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const [preview, setPreview] = useState(null); // { url, title, isImage }
    const [notice, setNotice] = useState('');     // messages that belong to no single field

    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [agreeRules, setAgreeRules] = useState(false);
    const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const isPendingReview = ['pending', 'pending review'].includes(applicationStatus?.toLowerCase());
    const isReadOnly = isPendingReview || applicationStatus === 'accepted';
    // An application still in progress, or a current tenancy: the same statuses
    // Login sends to Track Application, plus a tenant's own.
    const hasActiveApplication = ['pending', 'pending review', 'approved', 'action required', 'pending deposit', 'active', 'pending-move-out']
        .includes(applicationStatus?.toLowerCase()) && !editApp;
    const isTenant = ['active', 'pending-move-out'].includes(applicationStatus?.toLowerCase());

    // Save the unsent form as the applicant types.
    useEffect(() => {
        if (isEditing || !['none', 'rejected'].includes(applicationStatus)) return;
        try {
            sessionStorage.setItem(draftKey(loggedInUser.id), JSON.stringify({ phoneRawNumber, gender, occupants, monthsOfRent, selectedRoomId, prefMoveInDate, previousAddress }));
        } catch { /* storage full or blocked: the form still works */ }
    }, [phoneRawNumber, gender, occupants, monthsOfRent, prefMoveInDate, previousAddress, selectedRoomId, isEditing, applicationStatus, loggedInUser.id]);

    // One check per requirement: a picked file must pass the upload rules; a
    // required one with no file is an error unless it is already on file.
    const docValidators = {};
    requirements.forEach((r) => {
        docValidators[docKey(r.id)] = (f) => {
            if (f) return checkFile(f, FILE_RULES.document);
            return r.is_required && !onFile[r.id] ? t('rent.uploadRequired').replace('{label}', requirementLabel(r)) : '';
        };
    });
    const form = useFieldErrors({
        ...docValidators,
        previousAddress: (v) => checkText(v, { label: t('rent.previousAddress'), min: ADDRESS_MIN, max: ADDRESS_MAX }),
        suffix: (v) => checkPersonName(v, { label: 'Suffix', max: LIMITS.suffix, required: false }),
        contactNo: (v) => checkPhMobile(v),
        gender: (v) => (GENDERS.includes(v) ? '' : t('rent.errGender')),
        occupants: (v) => checkIntRange(v === '' ? NaN : v, 1, maxOccupants, 'Number of occupants'),
        monthsOfRent: (v) => checkIntRange(v === '' ? NaN : v, minMonths, MAX_MONTHS, 'Months of rent'),
        // Inside the admin's move-in window (rent_application.php checks the same):
        // the picker's min does not stop a typed past date.
        prefMoveInDate: (v) => {
            if (isASAP) return '';
            if (!v) return t('rent.errMoveIn');
            return checkMoveInDate(v, moveInWindow);
        },
        // Only a vacant unit can be applied for (checked once the list has loaded).
        roomName: (v) => (!v ? t('rent.errRoom')
            : !isEditing && rooms.length && !availableRooms.some(r => sameRoom(r.id, v)) ? t('rent.errRoomTaken', { room: v }) : ''),
        agreeTerms: (v) => (v ? '' : t('rent.errTerms')),
        agreeRules: (v) => (v ? '' : t('rent.errRules')),
    }, { idPrefix: 'rent-' });
    const docValues = {};
    requirements.forEach((r) => { docValues[docKey(r.id)] = docFiles[r.id]?.file || null; });
    const values = {
        suffix, contactNo: phoneRawNumber, gender, occupants, monthsOfRent, prefMoveInDate, roomName: selectedRoomId,
        previousAddress, ...docValues, agreeTerms: agreePrivacy, agreeRules,
    };

    // Accepts the file when it passes the upload rules; otherwise the error shows under its card.
    const pickFile = (id) => (file) => {
        const key = docKey(id);
        const fileError = checkFile(file, FILE_RULES.document);
        if (fileError) {
            form.setFieldError(key, fileError);
        } else {
            form.clearError(key);
            setDocFile(id, file);
        }
    };
    const removeFile = (id) => () => { setDocFile(id, null); form.clearError(docKey(id)); };

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
        if (isNaN(num)) return;
        if (num > maxOccupants) {
            form.setFieldError('occupants', `At most ${maxOccupants} people can live in one room.`);
        } else if (num >= 1) {
            setOccupants(num);
        }
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

    // Esc, focus in and back out, Tab kept inside: the four dialogs below.
    const roomDialogRef = useDialog(showRoomModal, () => setShowRoomModal(false));
    const previewDialogRef = useDialog(!!preview, closePreview);
    const termsDialogRef = useDialog(showTermsModal, () => setShowTermsModal(false));

    const chooseRoom = (roomId) => {
        setSelectedRoomId(roomId);
        form.clearError('roomName');
        setShowRoomModal(false);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        // A legacy status: its move-in payment is on Track Application (/payments never existed).
        if (applicationStatus === 'accepted') {
            navigate('/track-application');
            return;
        }

        if (hasActiveApplication) {
            setNotice(t('rent.alreadyApplied'));
            return;
        }

        if (!agreePrivacy || !agreeRules) {
            form.validateAll({ ...values, agreeTerms: agreePrivacy, agreeRules });
            return;
        }

        // Names and email are read-only copies of the account, so only the
        // editable fields are checked here.
        if (requirementsState !== 'ready') {
            setNotice(t('rent.docsLoadFailed'));
            return;
        }
        const cleanSuffix = suffix.trim();
        const cleanAddress = previousAddress.trim();
        setSuffix(cleanSuffix);
        setPreviousAddress(cleanAddress);
        if (!form.validateAll({ ...values, suffix: cleanSuffix, previousAddress: cleanAddress })) return;

        // Display value only: rent_application.php bills the room's own rate.
        const finalMonthlyRent = monthlyRent ?? 0;

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
        formData.append('previousAddress', cleanAddress);
        formData.append('agreeTerms', agreePrivacy);
        requirements.forEach((r) => {
            const f = docFiles[r.id]?.file;
            if (f) formData.append(docKey(r.id), f);
        });

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
                setNotice(res.data.message || t('rent.submitFailed'));
            }
        } catch (error) {
            console.error("Error submitting application:", error);
            if (error.response?.status === 413) {
                setNotice(t('rent.filesTooLarge'));
            } else if (!form.applyServerErrors(error)) {
                setNotice(apiErrorMessage(error, "A network error occurred while submitting your application."));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const docCard = (r) => (
        <DocumentCard
            key={r.id}
            form={form}
            fieldKey={docKey(r.id)}
            label={requirementLabel(r)}
            optional={!r.is_required}
            dropText={t('rent.dropDoc')}
            file={docFiles[r.id]?.file || null}
            previewUrl={docFiles[r.id]?.url || ''}
            keepsPath={onFile[r.id]?.file_path || null}
            dragging={draggingId === r.id}
            setDragging={(on) => setDraggingId(on ? r.id : null)}
            onPick={pickFile(r.id)}
            onRemove={removeFile(r.id)}
            onPreview={openPreview}
            t={t}
        />
    );

    return (
        <div className="rent-app-root w-full min-h-[calc(100vh-76px)] bg-slate-50/70 py-8 md:py-12 px-4 sm:px-6 lg:px-10 box-border flex flex-col items-center">
            <div className="w-full max-w-5xl xl:max-w-6xl space-y-8 flex flex-col justify-start text-left">

                <div className="rent-app-header-row pb-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="rent-app-heading text-3xl sm:text-4xl font-sans font-black m-0 tracking-tight select-none text-slate-900">
                            {t('rent.heading')}
                        </h1>
                        <p className="text-slate-500 text-sm mt-1.5 m-0 font-medium">
                            {t('rent.subtitle')}
                        </p>
                    </div>

                    {['pending review', 'pending', 'approved', 'active'].includes(applicationStatus?.toLowerCase()) && (
                        <div className={`flex items-center space-x-3 px-5 py-2.5 rounded-2xl font-bold text-sm shadow-sm select-none border transition-all duration-300 self-start sm:self-center ${isPendingReview ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {isPendingReview ? <Hourglass className="w-5 h-5" aria-hidden="true" /> : <Check className="w-5 h-5" />}
                            <div className="flex flex-col text-left">
                                <span className="text-xs opacity-75 leading-none">{t('rent.statusLabel')}</span>
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
                                <Info className="w-10 h-10" aria-hidden="true" />
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
                    <form className="rent-app-form-card bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-900/[0.03] p-6 sm:p-8 md:p-10 space-y-10" onSubmit={handleFormSubmit} noValidate>

                        {/* Section 1: Personal Details */}
                        <div className="space-y-6">
                            <div className="border-b border-slate-100 pb-3">
                                <h3 className="text-xl font-black m-0 text-slate-900">{t('rent.personalDetails')}</h3>
                                <p className="text-slate-500 text-xs mt-1 m-0 font-medium">Applicant contact and identity details on file</p>
                            </div>
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
                                        {t('rent.suffix')} <span className="text-xs font-normal text-slate-400 ml-1">({t('rent.optional')})</span>
                                    </label>
                                    <input
                                        type="text"
                                        {...form.fieldA11y('suffix')}
                                        autoComplete="honorific-suffix"
                                        placeholder={t('rent.suffixPlaceholder')}
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
                        </div>

                        {/* Section 2: Rental Preferences & Move-in Details */}
                        <div className="space-y-6">
                            <div className="border-b border-slate-100 pb-3">
                                <h3 className="text-xl font-black m-0 text-slate-900">Rental Preferences</h3>
                                <p className="text-slate-500 text-xs mt-1 m-0 font-medium">Specify your residential history, move-in target, and lease terms</p>
                            </div>

                            <div className="flex flex-col space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="rent-previousAddress" className={LABEL_CLS}>
                                        {t('rent.previousAddress')} {form.errors.previousAddress && <span className="text-rose-500 ml-0.5">*</span>}
                                    </label>
                                    <span className="text-xs text-slate-400 font-medium">Recent residential address</span>
                                </div>
                                <input
                                    type="text"
                                    {...form.fieldA11y('previousAddress')}
                                    autoComplete="street-address"
                                    placeholder={t('rent.previousAddressPlaceholder')}
                                    value={previousAddress}
                                    disabled={isReadOnly}
                                    maxLength={ADDRESS_MAX}
                                    onChange={(e) => { setPreviousAddress(e.target.value); form.clearError('previousAddress'); }}
                                    onBlur={() => { const v = previousAddress.trim(); setPreviousAddress(v); form.validateField('previousAddress', { ...values, previousAddress: v }); }}
                                    className={INPUT_CLS + invalidCls(form.errors.previousAddress)}
                                    required
                                />
                                <FieldError id="rent-previousAddress" error={form.errors.previousAddress} className="m-0" />
                            </div>

                            {/* 3 Perfectly Aligned Columns */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                {/* 1. Occupants */}
                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between h-7 mb-2">
                                        <label htmlFor="rent-occupants" className={LABEL_CLS}>
                                            {t('rent.occupants')} {form.errors.occupants && <span className="text-rose-500 ml-0.5">*</span>}
                                        </label>
                                    </div>
                                    <input
                                        id="rent-occupants"
                                        type="number"
                                        {...form.fieldA11y('occupants')}
                                        inputMode="numeric"
                                        min="1"
                                        max={maxOccupants}
                                        step="1"
                                        placeholder="2"
                                        value={occupants}
                                        disabled={isReadOnly}
                                        onKeyDown={blockNonIntegerKeys}
                                        onChange={handleOccupantsInput}
                                        onBlur={() => form.validateField('occupants', values)}
                                        className={`${INPUT_CLS} ${invalidCls(form.errors.occupants)}`}
                                        required
                                    />
                                    <div className="min-h-[22px] mt-1.5">
                                        {form.errors.occupants ? (
                                            <FieldError id="rent-occupants" error={form.errors.occupants} className="m-0" />
                                        ) : (
                                            <p className="m-0 text-xs text-indigo-600 font-semibold leading-relaxed">
                                                {t('rent.occupantsSurcharge')}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* 2. Months of Rent */}
                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between h-7 mb-2">
                                        <label htmlFor="rent-monthsOfRent" className={LABEL_CLS}>
                                            {t('rent.monthsOfRent')} {form.errors.monthsOfRent && <span className="text-rose-500 ml-0.5">*</span>}
                                        </label>
                                    </div>
                                    <input
                                        id="rent-monthsOfRent"
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
                                        className={`${INPUT_CLS} ${invalidCls(form.errors.monthsOfRent)}`}
                                        required
                                    />
                                    <div className="min-h-[22px] mt-1.5">
                                        {form.errors.monthsOfRent ? (
                                            <FieldError id="rent-monthsOfRent" error={form.errors.monthsOfRent} className="m-0" />
                                        ) : (
                                            <p className="m-0 text-xs text-slate-500 font-medium leading-relaxed">
                                                {t('rent.monthsMax').replace('{min}', minMonths)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* 3. Move In By */}
                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between h-7 mb-2">
                                        <label htmlFor="rent-prefMoveInDate" className={LABEL_CLS}>
                                            {t('rent.moveInBy') || 'Move In By'} {form.errors.prefMoveInDate && <span className="text-rose-500 ml-0.5">*</span>}
                                        </label>
                                        {!isReadOnly && (
                                            <label htmlFor="rent-isAsap" className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 hover:bg-indigo-100 transition-colors cursor-pointer select-none">
                                                <input
                                                    id="rent-isAsap"
                                                    type="checkbox"
                                                    checked={isASAP}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setIsASAP(checked);
                                                        setPrefMoveInDate('');
                                                        if (checked) {
                                                            form.clearError('prefMoveInDate');
                                                        }
                                                    }}
                                                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                                                />
                                                <span>{t('rent.anyTime') || 'Any time'}</span>
                                            </label>
                                        )}
                                    </div>
                                    {isASAP ? (
                                        <input
                                            type="text"
                                            value="Any time (Flexible)"
                                            disabled
                                            className={`${INPUT_CLS} bg-slate-100/70 text-slate-600 font-bold cursor-not-allowed select-none`}
                                        />
                                    ) : (
                                        <input
                                            type="date"
                                            {...form.fieldA11y('prefMoveInDate')}
                                            min={moveInLimits.min}
                                            max={moveInLimits.max}
                                            value={prefMoveInDate}
                                            disabled={isReadOnly}
                                            onChange={(e) => { setPrefMoveInDate(e.target.value); form.clearError('prefMoveInDate'); }}
                                            onBlur={() => form.validateField('prefMoveInDate', values)}
                                            className={`${INPUT_CLS} ${invalidCls(form.errors.prefMoveInDate)}`}
                                            required
                                        />
                                    )}
                                    <div className="min-h-[22px] mt-1.5">
                                        {form.errors.prefMoveInDate ? (
                                            <FieldError id="rent-prefMoveInDate" error={form.errors.prefMoveInDate} className="m-0" />
                                        ) : !isASAP && !isReadOnly ? (
                                            <p className="m-0 text-xs text-slate-500 font-medium leading-relaxed">{moveInRangeText(moveInWindow)}</p>
                                        ) : (
                                            <p className="m-0 text-xs text-emerald-600 font-medium leading-relaxed">No fixed move-in deadline</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Room & Rate Overview */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div>
                                    <h3 className="text-xl font-black m-0 text-slate-900">{t('rent.roomDetails')}</h3>
                                    <p className="text-slate-500 text-xs mt-1 m-0 font-medium">Selected apartment unit and estimated monthly billing</p>
                                </div>
                                {!isReadOnly && !isEditing && (
                                    <button
                                        type="button"
                                        onClick={() => setShowRoomModal(true)}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200/60 transition-colors cursor-pointer"
                                    >
                                        <span>{selectedRoomId ? t('rent.changeRoom') : t('rent.chooseRoom')}</span>
                                    </button>
                                )}
                            </div>

                            <input type="hidden" id="rent-roomName" {...form.fieldA11y('roomName')} value={selectedRoomId || ''} readOnly />

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                {/* Room Type Card */}
                                <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex flex-col justify-between min-h-[125px]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('rent.roomType')}</span>
                                        <span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200/80 shadow-2xs">Layout</span>
                                    </div>
                                    <div className="my-2">
                                        <span className="text-xl font-black text-slate-900 block">
                                            {selectedRoom?.type || 'Studio'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 m-0 font-medium">Self-contained private unit</p>
                                </div>

                                {/* Assigned Room Card */}
                                <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between min-h-[125px] ${form.errors.roomName ? 'border-rose-300 bg-rose-50/30 ring-2 ring-rose-200' : selectedRoomId ? 'bg-indigo-50/30 border-indigo-200/80' : 'bg-slate-50/70 border-slate-200/80'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('rent.assignedRoom')}</span>
                                        {!isReadOnly && !isEditing && (
                                            <button
                                                type="button"
                                                onClick={() => setShowRoomModal(true)}
                                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200 transition-colors cursor-pointer"
                                            >
                                                {selectedRoomId ? t('rent.changeRoom') : t('rent.chooseRoom')}
                                            </button>
                                        )}
                                    </div>
                                    <div className="my-2">
                                        <span className="text-xl font-black text-indigo-950 block">
                                            {selectedRoomId ? t('rent.roomName', { room: selectedRoomId }) : t('rent.noRoomYet')}
                                        </span>
                                    </div>
                                    <div>
                                        <FieldError id="rent-roomName" error={form.errors.roomName} className="m-0" />
                                        {!form.errors.roomName && (
                                            <p className="text-xs text-slate-500 m-0 font-medium">
                                                {selectedRoom ? `Floor ${selectedRoom.floor || 1} • Unit Available` : 'Choose a vacant unit to proceed'}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Monthly Rent Card */}
                                <div className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex flex-col justify-between min-h-[125px]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">{t('rent.monthlyRent')}</span>
                                        <span className="text-[11px] font-bold text-indigo-700 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200/60 shadow-2xs">Estimated</span>
                                    </div>
                                    <div className="my-2">
                                        <span className="text-2xl font-black text-indigo-700 block">
                                            {monthlyRent === null ? '—' : `₱${monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                            <span className="text-xs font-bold text-indigo-500 ml-1">/ month</span>
                                        </span>
                                    </div>
                                    <div>
                                        {surcharge > 0 ? (
                                            <p className="text-xs text-emerald-600 font-bold m-0">
                                                {t('rent.extraOccupantFee').replace('{amount}', surcharge.toLocaleString())}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-slate-500 m-0 font-medium">
                                                Standard base rate for {occupants || 1} occupant(s)
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Verification Documents */}
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
                                requirementsState === 'loading' ? (
                                    <p className="m-0 text-sm font-semibold text-slate-500 animate-pulse">{t('rent.docsLoading')}</p>
                                ) : requirementsState === 'error' ? (
                                    <p role="alert" className="m-0 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{t('rent.docsLoadFailed')}</p>
                                ) : requirements.length === 0 ? (
                                    <div className="p-8 rounded-2xl bg-slate-50/70 border border-slate-200/80 text-center flex flex-col items-center justify-center">
                                        <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5 border border-emerald-100">
                                            <Check className="w-6 h-6" />
                                        </div>
                                        <p className="m-0 text-sm font-bold text-slate-800">{t('rent.noDocsRequired')}</p>
                                        <p className="m-0 text-xs text-slate-400 mt-1 font-medium">No identity or verification documents are required for this application submission.</p>
                                    </div>
                                ) : (
                                    <div className={`grid gap-5 sm:gap-6 ${
                                        requirements.length === 1
                                            ? 'grid-cols-1 max-w-xl mx-auto'
                                            : 'grid-cols-1 md:grid-cols-2'
                                    }`}>
                                        {requirements.map((r, idx) => {
                                            const isLastOdd = requirements.length % 2 === 1 && idx === requirements.length - 1 && requirements.length > 1;
                                            if (isLastOdd) {
                                                return (
                                                    <div key={r.id} className="md:col-span-2 flex justify-center">
                                                        <div className="w-full md:w-[calc(50%-0.75rem)]">
                                                            {docCard(r)}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return docCard(r);
                                        })}
                                    </div>
                                )
                            )}
                        </div>

                        <div className="pt-8 border-t border-slate-200 flex flex-col items-center gap-4">
                            {/* Messages that belong to no single field (was a popup). */}
                            <InlineAlert className="w-full" onDismiss={() => setNotice('')}>{notice}</InlineAlert>
                            <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                                {!isReadOnly && (
                                    <div className="flex w-full min-w-0 flex-col items-start gap-3.5 sm:flex-1">
                                        <label className="flex items-start gap-3 cursor-pointer group select-none">
                                            <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                                                <input
                                                    type="checkbox"
                                                    id="rent-agreeTerms"
                                                    {...form.fieldA11y('agreeTerms')}
                                                    checked={agreePrivacy}
                                                    onChange={(e) => { setAgreePrivacy(e.target.checked); form.clearError('agreeTerms'); }}
                                                    className="peer sr-only"
                                                />
                                                <div className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-slate-300 bg-white transition-all peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 group-hover:border-indigo-400">
                                                    <Check className={`h-3.5 w-3.5 text-white transition-transform duration-200 ${agreePrivacy ? 'scale-100' : 'scale-0'}`} />
                                                </div>
                                            </div>
                                            <span className="min-w-0 text-sm font-semibold text-slate-700 leading-snug">
                                                {t('rent.agreeTerms')}{' '}
                                                <button type="button" onClick={() => setShowTermsModal(true)} className="inline cursor-pointer border-0 bg-transparent p-0 font-bold text-indigo-600 underline underline-offset-2 hover:text-indigo-800">
                                                    {t('rent.termsLink')}
                                                </button>
                                            </span>
                                        </label>
                                        <FieldError id="rent-agreeTerms" error={form.errors.agreeTerms} className="m-0 pl-8" />

                                        <label className="flex items-start gap-3 cursor-pointer group select-none">
                                            <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                                                <input
                                                    type="checkbox"
                                                    id="rent-agreeRules"
                                                    {...form.fieldA11y('agreeRules')}
                                                    checked={agreeRules}
                                                    onChange={(e) => { setAgreeRules(e.target.checked); form.clearError('agreeRules'); }}
                                                    className="peer sr-only"
                                                />
                                                <div className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-slate-300 bg-white transition-all peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 group-hover:border-indigo-400">
                                                    <Check className={`h-3.5 w-3.5 text-white transition-transform duration-200 ${agreeRules ? 'scale-100' : 'scale-0'}`} />
                                                </div>
                                            </div>
                                            <span className="min-w-0 text-sm font-semibold text-slate-700 leading-snug">
                                                {t('rent.rulesAgreement')}{' '}
                                                <button type="button" onClick={(e) => { e.preventDefault(); setIsRulesModalOpen(true); }} className="inline cursor-pointer border-0 bg-transparent p-0 font-bold text-indigo-600 underline hover:text-indigo-800">
                                                    {t('rent.rulesLink')}
                                                </button>.
                                            </span>
                                        </label>
                                        <FieldError id="rent-agreeRules" error={form.errors.agreeRules} className="m-0 pl-8" />

                                        <label className="flex items-start gap-3 cursor-pointer group select-none">
                                            <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                                                <input
                                                    type="checkbox"
                                                    id="rent-agreeBoth"
                                                    checked={agreePrivacy && agreeRules}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setAgreePrivacy(checked);
                                                        setAgreeRules(checked);
                                                        if (checked) {
                                                            form.clearError('agreeTerms');
                                                            form.clearError('agreeRules');
                                                        }
                                                    }}
                                                    className="peer sr-only"
                                                />
                                                <div className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-slate-300 bg-white transition-all peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 group-hover:border-indigo-400">
                                                    <Check className={`h-3.5 w-3.5 text-white transition-transform duration-200 ${(agreePrivacy && agreeRules) ? 'scale-100' : 'scale-0'}`} />
                                                </div>
                                            </div>
                                            <span className="min-w-0 text-sm font-semibold text-slate-700 leading-snug">
                                                {t('rent.agreeBoth')}
                                            </span>
                                        </label>
                                    </div>
                                )}

                                <div className="shrink-0 w-full sm:w-auto self-stretch sm:self-center flex items-center justify-end">
                                    {isPendingReview ? (
                                        <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-700 text-sm font-bold w-full">
                                            {t('rent.pendingMsg')}
                                        </div>
                                    ) : (
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className={`rent-app-submit-btn w-full sm:w-auto font-black px-10 py-3.5 rounded-xl text-sm transition-all duration-300 shadow-xl border-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${applicationStatus === 'accepted' ? 'bg-[#10b981] hover:bg-[#059669] shadow-emerald-600/30 text-white cursor-pointer' : submitting ? 'bg-slate-400 hover:bg-slate-400 text-white cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30 text-white cursor-pointer hover:-translate-y-0.5 active:translate-y-0'}`}
                                        >
                                            {submitting ? 'Submitting…' : applicationStatus === 'accepted' ? t('rent.proceedPayment') : t('rent.submitApp')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </form>
                )}
            </div>

            {/* Room Selection Modal: vacant units only */}
            {showRoomModal && (
                <div onClick={() => setShowRoomModal(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                    <div ref={roomDialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="rent-room-modal-title" className="outline-none bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-scale-in overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 id="rent-room-modal-title" className="text-xl font-black text-slate-900 m-0">{t('rent.selectRoomTitle')}</h3>
                            <button type="button" aria-label={t('common.close')} onClick={() => setShowRoomModal(false)} className="flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full cursor-pointer transition-colors border-0">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-slate-50 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {availableRooms.length > 0 ? availableRooms.map(room => (
                                <button
                                    type="button"
                                    key={room.id}
                                    onClick={() => chooseRoom(room.id)}
                                    aria-pressed={sameRoom(selectedRoomId, room.id)}
                                    className={`text-left p-4 rounded-2xl border-2 cursor-pointer transition-all ${sameRoom(selectedRoomId, room.id) ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/10' : 'border-slate-200 bg-white hover:border-indigo-300'}`}
                                >
                                    <span className="flex justify-between items-start mb-2">
                                        <span className="text-lg font-black text-slate-900">Room {room.id}</span>
                                        <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">{t('rent.available')}</span>
                                    </span>
                                    <span className="block text-sm font-medium text-slate-500">{t('rent.floor')} <span className="text-slate-800 font-bold">{room.floor || '—'}</span></span>
                                    <span className="block text-indigo-700 font-black text-lg">₱{Number(room.rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}<span className="text-xs text-indigo-500 font-medium">{t('rent.perMonth')}</span></span>
                                </button>
                            )) : (
                                <div className="col-span-2 text-center text-slate-500 py-10 font-bold">{t('rent.noRooms')}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Document Preview Modal (images and PDFs) */}
            {preview && (
                <div onClick={closePreview} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
                    <div ref={previewDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rent-preview-title" onClick={(e) => e.stopPropagation()} className="outline-none bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-scale-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                            <h3 id="rent-preview-title" className="text-lg font-black text-slate-900 m-0 flex items-center gap-2">
                                <FileText className="text-rose-500 w-5 h-5" aria-hidden="true" />
                                {preview.title}
                            </h3>
                            <button type="button" aria-label={t('rent.closePdf')} onClick={closePreview} className="flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full cursor-pointer transition-colors border-0">
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
                    <div ref={termsDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rent-terms-title" onClick={(e) => e.stopPropagation()} className="outline-none rent-app-terms-modal bg-white rounded-[2rem] shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] animate-scale-in overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 id="rent-terms-title" className="text-xl font-black text-slate-900 m-0">{t('rent.termsTitle')}</h3>
                            <button type="button" aria-label={t('common.close')} onClick={() => setShowTermsModal(false)} className="flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full cursor-pointer transition-colors border-0">
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
