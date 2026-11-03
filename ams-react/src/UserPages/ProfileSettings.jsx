import { useState, useEffect, useRef } from 'react';
import { PROFILE_UPDATED_EVENT } from '../config/appEvents';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileAlt, faKey, faSave, faCamera, faUpload, faUndo } from '@fortawesome/free-solid-svg-icons';
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

    // Handle profile image file change
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const fileError = checkFile(file, FILE_RULES.avatar);
            setAvatarError(fileError);
            if (fileError) {
                e.target.value = '';
                return;
            }
            setSelectedFile(file); // Store the file for later upload
            const reader = new FileReader();
            reader.onloadend = () => {
                setTempAvatar(reader.result);
            };
            reader.readAsDataURL(file);
        }
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

    return (
        <div className="profile-settings-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">
                <div className="profile-settings-header border-b border-slate-200 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none text-brand">
                            {t('profile.heading')}
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 m-0">
                            {t('profile.subtext')}
                        </p>
                    </div>

                    {/* Profile Picture Display / Preview */}
                    <div className="flex items-center gap-4">
                        <div className="relative group select-none">
                            {/* A broken image shows the initials (it used to overwrite the DOM, which dropped the delete button). */}
                            {(tempAvatar || (avatarUrl && !avatarImgFailed)) ? (
                                <img
                                    src={tempAvatar || fileUrl(avatarUrl)}
                                    alt={t('profile.photoAlt')}
                                    className="w-20 h-20 rounded-full object-cover border-2 border-indigo-500 shadow-md"
                                    onError={() => { if (!tempAvatar) setAvatarImgFailed(true); }}
                                />
                            ) : (
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-black shrink-0 tracking-wider shadow-md border-2 border-white bg-brand"
                                >
                                    {getInitials() || "?"}
                                </div>
                            )}
                            {(tempAvatar || avatarUrl) && (
                                <button
                                    type="button"
                                    onClick={() => setConfirmDeleteAvatar(true)}
                                    aria-label={t('profile.deletePhoto')}
                                    title={t('profile.deletePhoto')}
                                    className="absolute -top-3 -right-3 flex h-11 w-11 items-center justify-center bg-transparent border-0 cursor-pointer"
                                >
                                    {/* The red dot is small; the button around it is the 44px target. */}
                                    <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-sm">✕</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="profile-settings-card card-interactive bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-10 space-y-8">
                    {/* Profile Photo Uploader with Camera Capture */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-700 m-0">{t('profile.avatarPhoto')}</h3>

                        {isCameraActive ? (
                            <div className="ut-native max-w-sm w-full bg-slate-900 rounded-2xl overflow-hidden aspect-square relative flex flex-col items-center justify-center border border-slate-800">
                                {tempAvatar ? (
                                    <img src={tempAvatar} alt={t('profile.capturedAlt')} className="w-full h-full object-cover" />
                                ) : (
                                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]"></video>
                                )}

                                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                                    {!tempAvatar ? (
                                        <>
                                            <button type="button" onClick={capturePhoto} className="min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 rounded-xl border-0 cursor-pointer shadow">
                                                {t('profile.capture')}
                                            </button>
                                            <button type="button" onClick={stopCamera} className="min-h-[44px] bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 rounded-xl border-0 cursor-pointer">
                                                {t('common.cancel')}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" onClick={handleRetake} className="min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold px-4 rounded-xl border-0 cursor-pointer shadow flex items-center gap-1.5">
                                                <FontAwesomeIcon icon={faUndo} aria-hidden="true" /> {t('profile.retake')}
                                            </button>
                                            <button type="button" onClick={() => setIsCameraActive(false)} className="min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 rounded-xl border-0 cursor-pointer shadow">
                                                {t('profile.keepSnapshot')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="profile-avatar-options grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Local file selector */}
                                <div className="border border-slate-200 hover:border-indigo-400 rounded-2xl p-4 flex flex-col items-center justify-center text-center bg-slate-50/50 relative cursor-pointer group transition-colors min-h-[110px]">
                                    <input
                                        type="file"
                                        id="profile-avatar"
                                        name="avatar"
                                        accept={acceptFor(FILE_RULES.avatar)}
                                        onChange={handleFileChange}
                                        aria-invalid={avatarError ? true : undefined}
                                        aria-describedby={avatarError ? 'profile-avatar-error' : undefined}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    <FontAwesomeIcon icon={faUpload} className="text-slate-500 group-hover:text-indigo-500 text-lg mb-1.5 transition-colors" />
                                    <span className="text-xs font-bold text-slate-700">{t('profile.chooseFile')}</span>
                                    <span className="text-xs text-slate-500 mt-0.5">{FILE_RULES.avatar.label} up to {FILE_RULES.avatar.maxMB} MB</span>
                                </div>

                                {/* Simulated Camera button */}
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    className="border border-slate-200 hover:border-indigo-400 rounded-2xl p-4 flex flex-col items-center justify-center text-center bg-slate-50/50 cursor-pointer group transition-all min-h-[110px]"
                                >
                                    <FontAwesomeIcon icon={faCamera} className="text-slate-500 group-hover:text-indigo-500 text-lg mb-1.5 transition-colors" />
                                    <span className="text-xs font-bold text-slate-700">{t('profile.takeSnapshot')}</span>
                                    <span className="text-xs text-slate-500 mt-0.5">{t('profile.useCamera')}</span>
                                </button>
                            </div>
                        )}
                        <FieldError id="profile-avatar" error={avatarError} />

                        {tempAvatar && !isCameraActive && (
                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <img src={tempAvatar} alt="" className="w-12 h-12 rounded-full object-cover border border-indigo-200 shadow-sm" />
                                    <div>
                                        <p className="text-xs font-bold text-indigo-900 m-0">
                                            {selectedFile ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})` : t('profile.previewLabel')}
                                        </p>
                                        <p className="text-xs text-indigo-500 m-0">{t('profile.saveToApply')}</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => {
                                    setTempAvatar(null);
                                    setSelectedFile(null);
                                }} className="min-h-[44px] text-slate-600 hover:text-red-600 bg-transparent border-0 cursor-pointer text-sm font-semibold px-3">
                                    {t('common.remove')}
                                </button>
                            </div>
                        )}
                    </div>

                    <form className="space-y-8" onSubmit={handleFormSubmit} noValidate>
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2 text-brand">{t('profile.personalDetails')}</h3>
                            <div className="profile-details-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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

                            <div className="profile-details-grid grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        </div>

                        <div className="profile-actions-grid grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <button type="button" onClick={() => setShowDocsModal(true)} className="btn-interactive bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl p-4 text-left flex items-center space-x-4 cursor-pointer transition-all duration-150 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                    <FontAwesomeIcon icon={faFileAlt} className="text-base" />
                                </div>
                                <div>
                                    <p className="m-0 text-sm font-bold text-slate-800">{t('profile.verificationDocs')}</p>
                                    <p className="m-0 text-xs text-slate-500 mt-0.5">{t('profile.docsHint')}</p>
                                </div>
                            </button>
                            <button type="button" onClick={() => setShowPassModal(true)} className="btn-interactive bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl p-4 text-left flex items-center space-x-4 cursor-pointer transition-all duration-150 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                    <FontAwesomeIcon icon={faKey} className="text-base" />
                                </div>
                                <div>
                                    <p className="m-0 text-sm font-bold text-slate-800">{t('profile.accountSecurity')}</p>
                                    <p className="m-0 text-xs text-slate-500 mt-0.5">{t('profile.securityHint')}</p>
                                </div>
                            </button>
                        </div>

                        {saveError && (
                            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-semibold">
                                {saveError}
                            </div>
                        )}

                        <div className="border-t border-slate-100 pt-6 flex justify-end">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="profile-save-btn btn-interactive w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <FontAwesomeIcon icon={faSave} />
                                <span>{isSaving ? 'Saving…' : t('profile.saveProfile')}</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
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