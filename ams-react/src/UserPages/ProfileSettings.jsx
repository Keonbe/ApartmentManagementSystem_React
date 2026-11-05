import { useState, useEffect, useRef } from 'react';
import { PROFILE_UPDATED_EVENT } from '../config/appEvents';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileAlt, faKey, faSave, faCamera, faUpload, faUndo, faPen, faUser, faAddressCard, faChevronRight, faTimes, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import Modal from '../Components/admin/Modal';
import DocumentsModal from '../Components/DocumentsModal';
import ChangePasswordModal from '../Components/ChangePasswordModal';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { useLang, t as translate } from '../config/i18n';
import { LIMITS, checkEmail, checkPersonName, checkPhMobile, normalizeEmail, toPhLocal10, toPhE164 } from '../utils/validation';
import PhoneInput from '../Components/PhoneInput';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import SuccessModal from '../Components/SuccessModal';
import ConfirmDialog from '../Components/ConfirmDialog';
import { invalidCls, formatFileSize } from '../Components/form/formHelpers';
import '../assets/styles/responsive/user/profile-settings.responsive.css';

const INPUT_CLS = "focus-glow w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base sm:text-sm";
const GENDERS = ['Male', 'Female', 'Other'];

// Names match profile.php's body keys, so a server field error lands on the input.
const VALIDATORS = {
    firstName: (v) => checkPersonName(v, { label: translate('profile.firstNameLabel'), max: LIMITS.firstName }),
    middleName: (v) => checkPersonName(v, { label: translate('reg.middleNameLabel') || 'Middle name', max: LIMITS.middleName, required: false }),
    lastName: (v) => checkPersonName(v, { label: translate('profile.lastNameLabel'), max: LIMITS.lastName }),
    suffix: (v) => checkPersonName(v, { label: translate('profile.suffixLabel'), max: LIMITS.suffix, required: false }),
    contactNo: (v) => checkPhMobile(v),
    email: (v) => checkEmail(v, { max: LIMITS.userEmail }),
    gender: (v) => (GENDERS.includes(v) ? '' : translate('profile.errGender')),
};


export default function ProfileSettings() {
    const { t } = useLang();
    const [loggedInUser, setLoggedInUser] = useState(JSON.parse(sessionStorage.getItem("loggedInUser") || "{}"));

    const [firstName, setFirstName] = useState(loggedInUser.first_name || '');
    const [middleName, setMiddleName] = useState(loggedInUser.middle_name || '');
    const [lastName, setLastName] = useState(loggedInUser.last_name || '');
    const [suffix, setSuffix] = useState(loggedInUser.suffix || '');
    const [phoneRawNumber, setPhoneRawNumber] = useState(toPhLocal10(loggedInUser.contact_no));
    const [email, setEmail] = useState(loggedInUser.email_address || '');
    const [avatarError, setAvatarError] = useState('');
    const [saveError, setSaveError] = useState('');
    // Results that were alert(): a success notice, and the delete-avatar question
    // (was window.confirm); delete failures show under the photo uploader.
    const [notice, setNotice] = useState(null);
    const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState(false);
    const [deletingAvatar, setDeletingAvatar] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const form = useFieldErrors(VALIDATORS, { idPrefix: 'profile-' });
    const [gender, setGender] = useState(loggedInUser.gender || '');
    const [avatarUrl, setAvatarUrl] = useState(loggedInUser.avatar_url || '');

    const [showDocsModal, setShowDocsModal] = useState(false);
    const [showPassModal, setShowPassModal] = useState(false);
    // The "Change photo" dialog, opened by clicking the avatar.
    const [photoDialogOpen, setPhotoDialogOpen] = useState(false);

    // Camera Snapshot Simulation States
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [tempAvatar, setTempAvatar] = useState(null); // Before submission preview
    const [selectedFile, setSelectedFile] = useState(null); // Store the actual file object
    const videoRef = useRef(null);
    // The live stream, also in a ref so leaving the page always stops the camera.
    const streamRef = useRef(null);
    const [avatarImgFailed, setAvatarImgFailed] = useState(false);
    const stopStream = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraStream(null);
    };
    useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
    // The video element mounts after the stream arrives (and again on Retake).
    useEffect(() => {
        if (cameraStream && videoRef.current) videoRef.current.srcObject = cameraStream;
    }, [cameraStream, tempAvatar]);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!loggedInUser.email_address) return;
            try {
                const res = await api.get(`/profile.php?email=${encodeURIComponent(loggedInUser.email_address)}`);
                if (res.data.success && res.data.data) {
                    const data = res.data.data;
                    setFirstName(data.first_name || '');
                    setMiddleName(data.middle_name || '');
                    setLastName(data.last_name || '');
                    setSuffix(data.suffix || '');
                    setGender(data.gender || '');
                    if (data.contact_no) {
                        setPhoneRawNumber(toPhLocal10(data.contact_no));
                    }
                    if (data.avatar_url) {
                        // Ensure the URL is properly formatted for the browser
                        const avatarPath = data.avatar_url.startsWith('/') ? data.avatar_url : '/' + data.avatar_url;
                        setAvatarUrl(avatarPath);
                        // Update session storage
                        const updatedUser = {
                            ...loggedInUser,
                            avatar_url: avatarPath
                        };
                        sessionStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
                        setLoggedInUser(updatedUser);
                    }
                }
            } catch (error) {
                console.error("Failed to load profile data:", error);
            }
        };
        fetchProfile();
    }, [loggedInUser.email_address]);

    // Handle profile image file change. True when a valid file was picked.
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const fileError = checkFile(file, FILE_RULES.avatar);
            setAvatarError(fileError);
            if (fileError) {
                e.target.value = '';
                return false;
            }
            setSelectedFile(file); // Store the file for later upload
            const reader = new FileReader();
            reader.onloadend = () => {
                setTempAvatar(reader.result);
            };
            reader.readAsDataURL(file);
            return true;
        }
        return false;
    };

    // Opens the camera. Without one (or without permission) it says so; it used
    // to put a random stock photo of a stranger in the preview instead.
    const startCamera = async () => {
        setTempAvatar(null);
        setSelectedFile(null);
        setAvatarError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = stream;
            setCameraStream(stream);
            setIsCameraActive(true);
        } catch (err) {
            console.warn('Camera not available:', err);
            setIsCameraActive(false);
            setAvatarError(t('profile.noCamera'));
        }
    };

    // Simulate capturing photo from camera
    const capturePhoto = () => {
        if (cameraStream) {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 320;
            const ctx = canvas.getContext('2d');
            if (videoRef.current) {
                ctx.drawImage(videoRef.current, 0, 0, 320, 320);
                const dataUrl = canvas.toDataURL('image/png');
                // Convert data URL to file
                fetch(dataUrl)
                    .then(res => res.blob())
                    .then(blob => {
                        const file = new File([blob], `camera_${Date.now()}.png`, { type: 'image/png' });
                        setSelectedFile(file);
                        setTempAvatar(dataUrl);
                        // Keep the camera view open so Retake / Keep show; only the stream stops.
                        stopStream();
                    });
            }
        }
    };

    // Stop camera feed
    const stopCamera = () => {
        stopStream();
        setIsCameraActive(false);
    };

    // Retake: back to the live camera.
    const handleRetake = () => {
        setTempAvatar(null);
        setSelectedFile(null);
        startCamera();
    };

    const values = { firstName, middleName, lastName, suffix, contactNo: phoneRawNumber, email, gender };
    const setters = { firstName: setFirstName, middleName: setMiddleName, lastName: setLastName, suffix: setSuffix, email: setEmail, gender: setGender };

    const change = (name) => (e) => {
        setters[name](e.target.value);
        form.clearError(name);
    };
    // Trim (and lowercase the email) on leaving a field, then check it.
    const blur = (name) => () => {
        const raw = values[name];
        const v = name === 'email' ? normalizeEmail(raw) : String(raw).trim();
        if (setters[name] && v !== raw) setters[name](v);
        form.validateField(name, { ...values, [name]: v });
    };

    const handlePhoneChange = (digits) => {
        setPhoneRawNumber(digits);
        form.clearError('contactNo');
    };


    // Update your handleFormSubmit function with this complete flow
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        setSaveError('');

        const clean = {
            ...values,
            firstName: firstName.trim(),
            middleName: middleName.trim(),
            lastName: lastName.trim(),
            suffix: suffix.trim(),
            email: normalizeEmail(email),
        };
        setFirstName(clean.firstName);
        setMiddleName(clean.middleName);
        setLastName(clean.lastName);
        setSuffix(clean.suffix);
        setEmail(clean.email);
        // Phone uses profile.php's rule: +639XXXXXXXXX.
        if (!form.validateAll(clean)) return;

        setIsSaving(true);
        try {
            let currentAvatarUrl = avatarUrl;

            // 1. If a new avatar file is pending, upload it first!
            if (selectedFile) {
                const formData = new FormData();
                formData.append('oldEmail', loggedInUser.email_address);
                formData.append('avatar', selectedFile);

                const avatarRes = await api.post('/profile.php', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (avatarRes.data.success && avatarRes.data.avatar_url) {
                    // Update our tracked tracking path variable
                    currentAvatarUrl = avatarRes.data.avatar_url;
                } else {
                    setAvatarError(avatarRes.data.message || t('profile.avatarUploadFailed'));
                    return; // Halt if image upload explicitly failed
                }
            }

            // 2. Submit the primary profile data updates via JSON
            const fullContactNumber = toPhE164(phoneRawNumber);
            const profileData = {
                oldEmail: loggedInUser.email_address,
                email: clean.email,
                firstName: clean.firstName,
                middleName: clean.middleName,
                lastName: clean.lastName,
                suffix: clean.suffix,
                contactNo: fullContactNumber,
                gender: gender
            };

            const res = await api.post('/profile.php', profileData, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.data.success) {
                // 3. Sync both text and new image paths to session storage
                const updatedUser = {
                    ...loggedInUser,
                    email_address: clean.email,
                    first_name: clean.firstName,
                    middle_name: clean.middleName,
                    last_name: clean.lastName,
                    suffix: clean.suffix,
                    contact_no: fullContactNumber,
                    gender: gender,
                    avatar_url: currentAvatarUrl
                };

                sessionStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
                setLoggedInUser(updatedUser);
                setAvatarUrl(currentAvatarUrl || '');
                setTempAvatar(null);
                setSelectedFile(null);
                setAvatarImgFailed(false);
                // TopBar re-reads the user and avatar (was a full page reload).
                window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
                setNotice({ message: t('profile.savedTitle'), subtext: t('profile.savedBody') });
            } else if (!form.applyServerErrors(res)) {
                setSaveError(res.data.message || t('profile.saveFailed'));
            }
        } catch (error) {
            console.error("Error updating profile settings payload workflow:", error);
            if (!form.applyServerErrors(error)) {
                setSaveError(apiErrorMessage(error, "An error occurred while saving your profile."));
            }
        } finally {
            setIsSaving(false);
        }
    };

    const getInitials = () => {
        const firstLetter = firstName ? firstName.charAt(0) : '';
        const lastLetter = lastName ? lastName.charAt(0) : '';
        return `${firstLetter}${lastLetter}`.toUpperCase();
    };

    const hasPhoto = !!(tempAvatar || (avatarUrl && !avatarImgFailed));
    const fullName = [firstName, middleName, lastName, suffix].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

    // The photo dialog: options, or the live camera. Closing it stops the camera.
    const closePhotoDialog = () => {
        if (isCameraActive && !tempAvatar) stopCamera();
        else setIsCameraActive(false);
        setPhotoDialogOpen(false);
    };

    return (
        // Inside AccountLayout (App.jsx), which gives the page its width, padding and side menu.
        <div className="profile-settings-root w-full">
            <div className="w-full space-y-6 flex flex-col justify-start text-left">
                <header className="profile-settings-header">
                    <h1 className="text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none text-slate-900">
                        {t('profile.heading')}
                    </h1>
                    <p className="text-slate-500 text-sm sm:text-base mt-1.5 m-0">
                        {t('profile.subtext')}
                    </p>
                </header>

                {/* Identity card: click the photo to change it */}
                <section className="profile-settings-card bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="h-20 sm:h-24 bg-indigo-50 border-b border-slate-100" aria-hidden="true" />
                    <div className="px-5 sm:px-8 pb-6 -mt-12 sm:-mt-14 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                        <button
                            type="button"
                            onClick={() => setPhotoDialogOpen(true)}
                            aria-label={t('profile.changePhoto')}
                            title={t('profile.changePhoto')}
                            className="profile-avatar-btn group relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-full p-0 border-4 border-white bg-white shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300"
                        >
                            {/* A broken image shows the initials. */}
                            {hasPhoto ? (
                                <img
                                    src={tempAvatar || fileUrl(avatarUrl)}
                                    alt={t('profile.photoAlt')}
                                    className="w-full h-full rounded-full object-cover"
                                    onError={() => { if (!tempAvatar) setAvatarImgFailed(true); }}
                                />
                            ) : (
                                <span className="w-full h-full rounded-full flex items-center justify-center text-white text-3xl sm:text-4xl font-black tracking-wider bg-brand">
                                    {getInitials() || '?'}
                                </span>
                            )}
                            <span aria-hidden="true" className="absolute inset-0 rounded-full bg-slate-900/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <FontAwesomeIcon icon={faCamera} className="text-xl" />
                            </span>
                            <span aria-hidden="true" className="absolute bottom-0.5 right-0.5 w-8 h-8 rounded-full bg-indigo-600 text-white border-2 border-white shadow flex items-center justify-center text-xs transition-transform group-hover:scale-110">
                                <FontAwesomeIcon icon={faPen} />
                            </span>
                        </button>

                        <div className="min-w-0 flex-1 sm:pb-1">
                            <h2 className="m-0 text-xl sm:text-2xl font-extrabold text-slate-900 truncate">{fullName || t('account.title')}</h2>
                            <p className="m-0 mt-0.5 text-sm text-slate-500 truncate">{email}</p>
                            {tempAvatar && (
                                <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-full bg-amber-50 border border-amber-200 pl-3 pr-1 py-1">
                                    <span className="text-xs font-bold text-amber-800">{t('profile.photoPending')}</span>
                                    <button
                                        type="button"
                                        onClick={() => { setTempAvatar(null); setSelectedFile(null); }}
                                        className="min-h-[28px] px-2.5 rounded-full bg-white border border-amber-200 text-xs font-bold text-amber-800 cursor-pointer hover:bg-amber-100"
                                    >
                                        {t('common.remove')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    {avatarError && (
                        <div className="px-5 sm:px-8 pb-5 -mt-2">
                            <FieldError id="profile-avatar" error={avatarError} />
                        </div>
                    )}
                </section>

                <form className="space-y-6" onSubmit={handleFormSubmit} noValidate>
                    <section className="profile-settings-card bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 sm:p-8 space-y-5">
                        <h3 className="flex items-center gap-2.5 text-base font-bold m-0 text-slate-900">
                            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm"><FontAwesomeIcon icon={faUser} aria-hidden="true" /></span>
                            {t('profile.personalDetails')}
                        </h3>
                        <div className="profile-details-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label htmlFor="profile-firstName" className="text-sm font-bold text-slate-700">{t('profile.firstName')}</label>
                                <input
                                    type="text"
                                    {...form.fieldA11y('firstName')}
                                    autoComplete="given-name"
                                    value={firstName}
                                    maxLength={LIMITS.firstName}
                                    onChange={change('firstName')}
                                    onBlur={blur('firstName')}
                                    className={INPUT_CLS + invalidCls(form.errors.firstName)}
                                    required
                                />
                                <FieldError id="profile-firstName" error={form.errors.firstName} className="m-0" />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label htmlFor="profile-middleName" className="text-sm font-bold text-slate-700">{t('reg.middleName') || 'Middle Name'}</label>
                                <input
                                    type="text"
                                    {...form.fieldA11y('middleName')}
                                    autoComplete="additional-name"
                                    value={middleName}
                                    maxLength={LIMITS.middleName}
                                    onChange={change('middleName')}
                                    onBlur={blur('middleName')}
                                    className={INPUT_CLS + invalidCls(form.errors.middleName)}
                                />
                                <FieldError id="profile-middleName" error={form.errors.middleName} className="m-0" />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label htmlFor="profile-lastName" className="text-sm font-bold text-slate-700">{t('profile.lastName')}</label>
                                <input
                                    type="text"
                                    {...form.fieldA11y('lastName')}
                                    autoComplete="family-name"
                                    value={lastName}
                                    maxLength={LIMITS.lastName}
                                    onChange={change('lastName')}
                                    onBlur={blur('lastName')}
                                    className={INPUT_CLS + invalidCls(form.errors.lastName)}
                                    required
                                />
                                <FieldError id="profile-lastName" error={form.errors.lastName} className="m-0" />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label htmlFor="profile-suffix" className="text-sm font-bold text-slate-700">{t('profile.suffix')}</label>
                                <input
                                    type="text"
                                    {...form.fieldA11y('suffix')}
                                    autoComplete="honorific-suffix"
                                    value={suffix}
                                    maxLength={LIMITS.suffix}
                                    onChange={change('suffix')}
                                    onBlur={blur('suffix')}
                                    className={INPUT_CLS + invalidCls(form.errors.suffix)}
                                />
                                <FieldError id="profile-suffix" error={form.errors.suffix} className="m-0" />
                            </div>
                        </div>
                        <div className="profile-details-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label htmlFor="profile-gender" className="text-sm font-bold text-slate-700">{t('profile.gender')}</label>
                                <select
                                    {...form.fieldA11y('gender')}
                                    value={gender}
                                    onChange={change('gender')}
                                    onBlur={() => form.validateField('gender', values)}
                                    className={INPUT_CLS + invalidCls(form.errors.gender)}
                                    required
                                >
                                    <option value="" disabled hidden>{t('profile.selectGender')}</option>
                                    {GENDERS.map((g) => <option key={g} value={g}>{t(`profile.gender${g}`)}</option>)}
                                </select>
                                <FieldError id="profile-gender" error={form.errors.gender} className="m-0" />
                            </div>
                        </div>
                    </section>

                    <section className="profile-settings-card bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 sm:p-8 space-y-5">
                        <h3 className="flex items-center gap-2.5 text-base font-bold m-0 text-slate-900">
                            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm"><FontAwesomeIcon icon={faAddressCard} aria-hidden="true" /></span>
                            {t('profile.contactDetails')}
                        </h3>
                        <div className="profile-details-grid grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label htmlFor="profile-contactNo" className="text-sm font-bold text-slate-700">{t('profile.contactNumber')}</label>
                                <PhoneInput
                                    id="profile-contactNo"
                                    name="contactNo"
                                    value={phoneRawNumber}
                                    onChange={handlePhoneChange}
                                    onBlur={() => form.validateField('contactNo', values)}
                                    error={form.errors.contactNo}
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label htmlFor="profile-email" className="text-sm font-bold text-slate-700">{t('profile.email')}</label>
                                <input
                                    type="email"
                                    {...form.fieldA11y('email')}
                                    inputMode="email"
                                    autoComplete="email"
                                    value={email}
                                    maxLength={LIMITS.userEmail}
                                    onChange={change('email')}
                                    onBlur={blur('email')}
                                    className={INPUT_CLS + invalidCls(form.errors.email)}
                                    required
                                />
                                <FieldError id="profile-email" error={form.errors.email} className="m-0" />
                            </div>
                        </div>
                    </section>

                    {/* Account: documents and password, each opens a dialog */}
                    <section className="profile-settings-card bg-white rounded-3xl border border-slate-200/80 shadow-sm p-2 sm:p-3">
                        <h3 className="m-0 px-3 sm:px-5 pt-3 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{t('profile.accountSection')}</h3>
                        <div className="profile-actions-grid divide-y divide-slate-100">
                            {[
                                { icon: faFileAlt, title: t('profile.verificationDocs'), hint: t('profile.docsHint'), onClick: () => setShowDocsModal(true) },
                                { icon: faKey, title: t('profile.accountSecurity'), hint: t('profile.securityHint'), onClick: () => setShowPassModal(true) },
                            ].map((row) => (
                                <button
                                    key={row.title}
                                    type="button"
                                    onClick={row.onClick}
                                    className="w-full flex items-center gap-4 px-3 sm:px-5 py-4 bg-transparent border-0 rounded-2xl text-left cursor-pointer hover:bg-slate-50 transition-colors"
                                >
                                    <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                        <FontAwesomeIcon icon={row.icon} aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-bold text-slate-800">{row.title}</span>
                                        <span className="block text-xs text-slate-500 mt-0.5">{row.hint}</span>
                                    </span>
                                    <FontAwesomeIcon icon={faChevronRight} className="text-slate-400 text-sm shrink-0" aria-hidden="true" />
                                </button>
                            ))}
                        </div>
                    </section>

                    {saveError && (
                        <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl font-semibold">
                            {saveError}
                        </div>
                    )}

                    <div className="profile-save-bar flex justify-end">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="profile-save-btn btn-interactive w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <FontAwesomeIcon icon={faSave} aria-hidden="true" />
                            <span>{isSaving ? 'Saving…' : t('profile.saveProfile')}</span>
                        </button>
                    </div>
                </form>
            </div>

            {/* Change photo: upload, camera, or delete */}
            {photoDialogOpen && (
                <Modal
                    title={t('profile.changePhoto')}
                    onClose={closePhotoDialog}
                    className="sheet-mobile bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto text-left"
                >
                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
                        <div className="min-w-0">
                            <h3 className="m-0 text-lg font-bold text-slate-900">{t('profile.changePhoto')}</h3>
                            <p className="m-0 mt-0.5 text-xs text-slate-500">{t('profile.photoHint')}</p>
                        </div>
                        <button type="button" onClick={closePhotoDialog} aria-label={t('common.close')} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 bg-transparent border-0 cursor-pointer">
                            <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="p-5 space-y-4">
                        {isCameraActive ? (
                            <div className="ut-native w-full bg-slate-900 rounded-2xl overflow-hidden aspect-square relative flex items-center justify-center">
                                {tempAvatar ? (
                                    <img src={tempAvatar} alt={t('profile.capturedAlt')} className="w-full h-full object-cover" />
                                ) : (
                                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]"></video>
                                )}
                                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                                    {!tempAvatar ? (
                                        <>
                                            <button type="button" onClick={capturePhoto} className="min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 rounded-xl border-0 cursor-pointer shadow flex items-center gap-1.5">
                                                <FontAwesomeIcon icon={faCamera} aria-hidden="true" /> {t('profile.capture')}
                                            </button>
                                            <button type="button" onClick={stopCamera} className="min-h-[44px] bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 rounded-xl border-0 cursor-pointer">
                                                {t('common.cancel')}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" onClick={handleRetake} className="min-h-[44px] bg-white/20 hover:bg-white/30 text-white text-sm font-bold px-4 rounded-xl border-0 cursor-pointer flex items-center gap-1.5">
                                                <FontAwesomeIcon icon={faUndo} aria-hidden="true" /> {t('profile.retake')}
                                            </button>
                                            <button type="button" onClick={() => { setIsCameraActive(false); setPhotoDialogOpen(false); }} className="min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 rounded-xl border-0 cursor-pointer shadow">
                                                {t('profile.keepSnapshot')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-center">
                                    {hasPhoto ? (
                                        <img src={tempAvatar || fileUrl(avatarUrl)} alt="" className="w-28 h-28 rounded-full object-cover border-4 border-slate-100 shadow-sm" />
                                    ) : (
                                        <span className="w-28 h-28 rounded-full flex items-center justify-center text-white text-4xl font-black tracking-wider bg-brand">{getInitials() || '?'}</span>
                                    )}
                                </div>
                                <div className="profile-avatar-options grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="relative border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-2xl p-4 flex flex-col items-center justify-center text-center bg-slate-50 cursor-pointer group transition-colors min-h-[104px] focus-within:ring-2 focus-within:ring-indigo-500">
                                        <input
                                            type="file"
                                            id="profile-avatar-input"
                                            name="avatar"
                                            accept={acceptFor(FILE_RULES.avatar)}
                                            onChange={(e) => { if (handleFileChange(e)) setPhotoDialogOpen(false); }}
                                            className="sr-only"
                                        />
                                        <FontAwesomeIcon icon={faUpload} className="text-slate-500 group-hover:text-indigo-600 text-lg mb-1.5 transition-colors" aria-hidden="true" />
                                        <span className="text-sm font-bold text-slate-800">{t('profile.chooseFile')}</span>
                                        <span className="text-xs text-slate-500 mt-0.5">{FILE_RULES.avatar.label} up to {FILE_RULES.avatar.maxMB} MB</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={startCamera}
                                        className="border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-2xl p-4 flex flex-col items-center justify-center text-center bg-slate-50 cursor-pointer group transition-colors min-h-[104px]"
                                    >
                                        <FontAwesomeIcon icon={faCamera} className="text-slate-500 group-hover:text-indigo-600 text-lg mb-1.5 transition-colors" aria-hidden="true" />
                                        <span className="text-sm font-bold text-slate-800">{t('profile.takeSnapshot')}</span>
                                        <span className="text-xs text-slate-500 mt-0.5">{t('profile.useCamera')}</span>
                                    </button>
                                </div>
                                {(tempAvatar || avatarUrl) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPhotoDialogOpen(false);
                                            // An unsaved photo is just dropped; a saved one is deleted after a confirm.
                                            if (tempAvatar) { setTempAvatar(null); setSelectedFile(null); }
                                            else setConfirmDeleteAvatar(true);
                                        }}
                                        className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white text-rose-600 text-sm font-bold cursor-pointer hover:bg-rose-50"
                                    >
                                        <FontAwesomeIcon icon={faTrashAlt} aria-hidden="true" />
                                        {tempAvatar ? t('common.remove') : t('profile.deletePhoto')}
                                    </button>
                                )}
                            </>
                        )}
                        {avatarError && <FieldError id="profile-avatar-dialog" error={avatarError} />}
                        {tempAvatar && !isCameraActive && selectedFile && (
                            <p className="m-0 text-xs text-slate-500 text-center">
                                {selectedFile.name} ({formatFileSize(selectedFile.size)}) · {t('profile.saveToApply')}
                            </p>
                        )}
                    </div>
                </Modal>
            )}

            <DocumentsModal isOpen={showDocsModal} onClose={() => setShowDocsModal(false)} />
            <ChangePasswordModal isOpen={showPassModal} onClose={() => setShowPassModal(false)} />

            {confirmDeleteAvatar && (
                <ConfirmDialog
                    title={t('profile.deleteTitle')}
                    message={t('profile.deleteBody')}
                    confirmLabel={t('profile.deleteYes')}
                    busy={deletingAvatar}
                    onConfirm={async () => {
                        if (deletingAvatar) return;
                        setDeletingAvatar(true);
                        setAvatarError('');
                        try {
                            const res = await api.post('/profile.php', {
                                oldEmail: loggedInUser.email_address,
                                clearAvatar: true
                            });
                            if (res.data.success) {
                                setAvatarUrl('');
                                setTempAvatar(null);
                                setSelectedFile(null);
                                setAvatarImgFailed(false);
                                const updatedUser = { ...loggedInUser, avatar_url: '' };
                                sessionStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
                                setLoggedInUser(updatedUser);
                                window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
                                setNotice({ message: t('profile.deletedTitle'), subtext: t('profile.deletedBody') });
                            } else {
                                setAvatarError(res.data.message || t('profile.deleteFailed'));
                            }
                        } catch (err) {
                            console.error("Error deleting avatar:", err);
                            setAvatarError(apiErrorMessage(err, 'An error occurred while deleting the photo.'));
                        } finally {
                            setDeletingAvatar(false);
                            setConfirmDeleteAvatar(false);
                        }
                    }}
                    onClose={() => setConfirmDeleteAvatar(false)}
                />
            )}

            <SuccessModal
                isOpen={!!notice}
                onClose={() => setNotice(null)}
                message={notice?.message}
                subtext={notice?.subtext}
            />
        </div>
    );
}