import { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle2, Hourglass, Check, Info, FileText, Eye, X, AlertCircle } from 'lucide-react';
import SuccessModal from '../Components/SuccessModal';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/rent-application.responsive.css';

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

    const editApp = location.state?.editApplication;
    const passedRoomId = location.state?.selectedRoomId || editApp?.room_name || 'C';

    const [applicationStatus, setApplicationStatus] = useState('none');
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [fileErrorMsg, setFileErrorMsg] = useState('');

    const [firstName, setFirstName] = useState(editApp?.first_name || defaultFirstName);
    const [middleName, setMiddleName] = useState(editApp?.middle_name || defaultMiddleName);
    const [lastName, setLastName] = useState(editApp?.last_name || defaultLastName);
    const [suffix, setSuffix] = useState(editApp?.suffix || defaultSuffix);
    
    const [phoneRawNumber, setPhoneRawNumber] = useState(editApp?.contact_no?.replace('+63 ', '') || '');
    const [phoneError, setPhoneError] = useState('');

    const [email] = useState(editApp?.email || defaultEmail);
    const [gender, setGender] = useState(editApp?.gender || '');
    const [occupants, setOccupants] = useState(editApp?.occupants || '');
    const [monthsOfRent, setMonthsOfRent] = useState(editApp?.months_of_rent || '');
    
    // New Room Selection State
    const [selectedRoomId, setSelectedRoomId] = useState(passedRoomId);
    const [availableRooms, setAvailableRooms] = useState([]);
    const [showRoomModal, setShowRoomModal] = useState(false);
    
    const getRoomPriceFallback = (id) => {
        if (['I', 'J', 'K', 'L', 'M', 'N'].includes(id)) return 3500;
        return 4000;
    };
    const [monthlyRent, setMonthlyRent] = useState(editApp?.monthly_rent || getRoomPriceFallback(passedRoomId));

    useEffect(() => {
        const fetchUserProfile = async () => {
            if (!defaultEmail || editApp) return;
            try {
                const res = await api.get(`/profile.php?email=${encodeURIComponent(defaultEmail)}`);
                if (res.data.success && res.data.data) {
                    const data = res.data.data;
                    setFirstName(data.first_name || '');
                    setMiddleName(data.middle_name || '');
                    setLastName(data.last_name || '');
                    setSuffix(data.suffix || '');
                }

                if (loggedInUser.id) {
                    const roomRes = await api.get(`/my_room.php?userId=${encodeURIComponent(loggedInUser.id)}`);
                    if (roomRes.data.success && roomRes.data.data) {
                        const status = roomRes.data.data.status;
                        setApplicationStatus(status ? status.toLowerCase() : 'none');
                    }
                }
            } catch (err) {
                console.error("Failed to fetch user details/application status:", err);
            }
        };
        fetchUserProfile();
    }, [defaultEmail, loggedInUser.id, editApp]);
    
    // Load Draft from LocalStorage
    useEffect(() => {
        if (!editApp && applicationStatus === 'none') {
            const savedData = localStorage.getItem('rentApplicationDraft');
            if (savedData) {
                try {
                    const data = JSON.parse(savedData);
                    if (data.phoneRawNumber) setPhoneRawNumber(data.phoneRawNumber);
                    if (data.gender) setGender(data.gender);
                    if (data.occupants) setOccupants(data.occupants);
                    if (data.monthsOfRent) setMonthsOfRent(data.monthsOfRent);
                    if (data.selectedRoomId) setSelectedRoomId(data.selectedRoomId);
                } catch (e) {
                    console.error("Error parsing draft", e);
                }
            }
        }
    }, [editApp, applicationStatus]);

    // Save Draft to LocalStorage
    useEffect(() => {
        if (!editApp && ['none', 'rejected'].includes(applicationStatus)) {
            const data = { phoneRawNumber, gender, occupants, monthsOfRent, selectedRoomId };
            localStorage.setItem('rentApplicationDraft', JSON.stringify(data));
        }
    }, [phoneRawNumber, gender, occupants, monthsOfRent, selectedRoomId, editApp, applicationStatus]);

    useEffect(() => {
        const fetchRooms = async () => {
            try {
                const res = await api.get('/get_rooms.php');
                const rooms = res.data?.rooms || res.data?.data || (Array.isArray(res.data) ? res.data : []);
                setAvailableRooms(rooms.filter(r => r.status?.toLowerCase() === 'vacant'));
                
                const match = rooms.find(r => r.id === selectedRoomId);
                if (match && match.rent != null) {
                    setMonthlyRent(Number(match.rent));
                }
            } catch (err) {
                console.error("Failed to fetch rooms", err);
            }
        };
        if (!editApp) fetchRooms();
    }, [selectedRoomId, editApp]);

    const [validIdFrontFile, setValidIdFrontFile] = useState(null);
    const [validIdBackFile, setValidIdBackFile] = useState(null);
    const [nbiFile, setNbiFile] = useState(null);
    const [isDraggingIdFront, setIsDraggingIdFront] = useState(false);
    const [isDraggingIdBack, setIsDraggingIdBack] = useState(false);
    const [isDraggingNbi, setIsDraggingNbi] = useState(false);

    const [previewModalUrl, setPreviewModalUrl] = useState(null);
    const [previewModalTitle, setPreviewModalTitle] = useState('Document Preview');
    const [previewModalIsImage, setPreviewModalIsImage] = useState(false);

    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const isPendingReview = ['pending', 'pending review'].includes(applicationStatus?.toLowerCase());
    const isReadOnly = isPendingReview || applicationStatus === 'accepted';
    const hasActiveApplication = ['pending', 'pending review', 'approved', 'active'].includes(applicationStatus?.toLowerCase()) && !editApp;
    const isTenant = ['approved', 'active'].includes(applicationStatus?.toLowerCase());

    const validateFile = (file) => {
        if (!file) return false;
        const maxSizeBytes = 10 * 1024 * 1024; //10MB
        if (file.size > maxSizeBytes) {
            setFileErrorMsg(`The file "${file.name}" exceeds the 10MB limit. Please upload a smaller file.`);
            return false;
        }
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf'];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowedExtensions.includes(fileExtension) || (file.type && !allowedMimeTypes.includes(file.type))) {
            setFileErrorMsg(`Invalid format for "${file.name}". Only JPEG, PNG, and PDF are allowed.`);
            return false;
        }
        return true;
    };

    const handlePhoneRawInput = (e) => {
        if (isReadOnly) return;
        const val = e.target.value.replace(/\D/g, '');
        if (val.length <= 10) {
            setPhoneRawNumber(val);
            setPhoneError('');
        }
    };

    const validatePhilippineNumber = (number) => {
        if (number.length !== 10) return "Must be exactly 10 digits (e.g., 9171234567).";
        if (!/^9/.test(number)) return "Must start with 9.";
        if (/^(\d)\1+$/.test(number)) return "Fake number pattern detected.";
        if ("012345678901".includes(number) || "09876543210".includes(number)) return "Sequential numbers not accepted.";
        return "";
    };

    const handleOccupantsInput = (e) => {
        if (isReadOnly) return;
        const value = e.target.value;
        if (value === '') { setOccupants(''); return; }
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 1 && num <= 8) setOccupants(num);
    };

    const handleMonthsInput = (e) => {
        if (isReadOnly) return;
        const value = e.target.value;
        if (value === '') { setMonthsOfRent(''); return; }
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
            if (num > 24) setMonthsOfRent(24);
            else if (num < 1) setMonthsOfRent(1);
            else setMonthsOfRent(num);
        }
    };

    const openPreviewModal = (file, title) => {
        const url = URL.createObjectURL(file);
        setPreviewModalUrl(url);
        setPreviewModalTitle(title);
        setPreviewModalIsImage(file.type.startsWith('image/'));
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setHasSubmitted(true);
        
        if (applicationStatus === 'accepted') {
            navigate('/payments'); 
            return;
        }
        if (hasActiveApplication) {
            setFileErrorMsg("You already have an active or pending lease application.");
            return;
        }
        
        const phoneValidationError = validatePhilippineNumber(phoneRawNumber);
        if (phoneValidationError) {
            setPhoneError(phoneValidationError);
            return;
        }

        if (!agreePrivacy) {
            setFileErrorMsg("Please read and agree to the terms and privacy policy before submitting.");
            return;
        }

        const isEditing = !!editApp;
        if (!isEditing && (!validIdFrontFile || !validIdBackFile || !nbiFile)) {
            setFileErrorMsg("Please upload your Valid ID Front, Valid ID Back, and NBI Clearance.");
            return;
        }

        const fullContactNumber = `+63 ${phoneRawNumber}`;
        const finalMonthlyRent = monthlyRent + (occupants > 4 ? (occupants - 4) * 1000 : 0);

        const formData = new FormData();
        if (isEditing) formData.append('appId', editApp.id);
        formData.append('firstName', firstName.trim());
        formData.append('middleName', middleName.trim());
        formData.append('lastName', lastName.trim());
        formData.append('suffix', suffix.trim());
        formData.append('contactNo', fullContactNumber);
        formData.append('email', email.trim());
        formData.append('gender', gender);
        formData.append('occupants', occupants);
        formData.append('monthsOfRent', monthsOfRent);
        formData.append('roomName', selectedRoomId);
        formData.append('monthlyRent', finalMonthlyRent);
        formData.append('agreeTerms', agreePrivacy);
        if (validIdFrontFile) formData.append('validIdFrontFile', validIdFrontFile);
        if (validIdBackFile) formData.append('validIdBackFile', validIdBackFile);
        if (nbiFile) formData.append('nbiFile', nbiFile);

        try {
            const res = await api.post("/rent_application.php", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                localStorage.removeItem('rentApplicationDraft'); // Clear draft on success
                setShowSuccessModal(true);
            } else {
                setFileErrorMsg(res.data.message);
            }
        } catch (error) {
            console.error("Error submitting application:", error);
            if (error.response && error.response.status === 413) {
                setFileErrorMsg("Payload Too Large: The files you are trying to upload exceed the server's limit. Please try smaller files.");
            } else {
                setFileErrorMsg("A network error occurred while submitting your application.");
            }
        }
    };

    return (
        <div className="rent-app-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <style>
                {`
                form.has-submitted .form-group:has(input:invalid) .required-asterisk,
                form.has-submitted .form-group:has(select:invalid) .required-asterisk {
                    display: inline-block !important;
                }
                .required-asterisk { display: none; }
                `}
            </style>

            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">

                <div className="rent-app-header-row border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-sans font-black m-0 tracking-tight select-none text-slate-900">
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                                <button onClick={() => navigate('/my-room')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl text-sm border-0 cursor-pointer transition-all shadow-md shadow-indigo-600/20">{t('rent.goMyRoom')}</button>
                                <button onClick={() => navigate('/pay-bills')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl text-sm border-0 cursor-pointer transition-colors">{t('rent.payBills')}</button>
                                <button onClick={() => navigate('/maintenance-request')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl text-sm border-0 cursor-pointer transition-colors">{t('rent.requestMaint')}</button>
                                <button onClick={() => navigate('/home')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl text-sm border-0 cursor-pointer transition-colors">{t('rent.goHome')}</button>
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
                            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                                <button onClick={() => navigate('/track-application')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl text-sm border-0 cursor-pointer transition-all shadow-md shadow-indigo-600/20">{t('rent.trackApp')}</button>
                                <button onClick={() => navigate('/services')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-8 rounded-xl text-sm border-0 cursor-pointer transition-colors">{t('rent.backServices')}</button>
                            </div>
                        </div>
                    )
                ) : (
                    <form className={`bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-900/5 p-6 md:p-10 space-y-10 ${hasSubmitted ? 'has-submitted' : ''}`} onSubmit={handleFormSubmit} onInvalid={() => setHasSubmitted(true)}>
                        
                        <div className="space-y-5">
                            <h3 className="text-xl font-black m-0 border-b border-slate-100 pb-3 text-slate-900">{t('rent.personalDetails')}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700">{t('rent.firstName')}</label>
                                    <input type="text" value={firstName} disabled className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 shadow-inner text-sm font-medium cursor-not-allowed" />
                                </div>
                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700">{t('rent.middleName')}</label>
                                    <input type="text" value={middleName} disabled className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 shadow-inner text-sm font-medium cursor-not-allowed" />
                                </div>
                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700">{t('rent.lastName')}</label>
                                    <input type="text" value={lastName} disabled className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 shadow-inner text-sm font-medium cursor-not-allowed" />
                                </div>
                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700">
                                        {t('rent.suffix')} <span className="text-xs font-normal text-slate-400 ml-1">(Optional)</span>
                                    </label>
                                    <input type="text" placeholder="e.g. Jr, Sr" value={suffix} disabled={isReadOnly} onChange={(e) => setSuffix(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner text-sm transition-all font-medium disabled:opacity-75" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700">
                                        {t('rent.contactNo')} <span className="required-asterisk text-rose-500 ml-0.5">*</span>
                                    </label>
                                    <div className="w-full flex relative">
                                        <div className="flex items-center space-x-1 px-3.5 bg-slate-100 border border-slate-200 rounded-l-xl text-slate-800 text-sm font-bold select-none border-r-0 pointer-events-none opacity-80">
                                            <span>🇵🇭</span>
                                            <span className="text-slate-600 text-xs font-semibold">+63</span>
                                        </div>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="917 123 4567"
                                            pattern="^9\d{9}$"
                                            value={phoneRawNumber}
                                            disabled={isReadOnly}
                                            onChange={handlePhoneRawInput}
                                            onBlur={() => setPhoneError(validatePhilippineNumber(phoneRawNumber))}
                                            className={`w-full flex-grow px-4 py-3 rounded-r-xl bg-slate-50 border text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner text-sm transition-all font-medium disabled:opacity-75 ${phoneError ? 'border-red-400 focus:ring-red-400' : 'border-slate-200'}`}
                                            required
                                        />
                                    </div>
                                    {phoneError && <span className="text-[11px] text-red-500 font-bold leading-none mt-1">{phoneError}</span>}
                                </div>

                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700">{t('rent.email')}</label>
                                    <input type="email" value={email} disabled className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 shadow-inner text-sm font-medium cursor-not-allowed" />
                                </div>
                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700">
                                        {t('rent.gender')} <span className="required-asterisk text-rose-500 ml-0.5">*</span>
                                    </label>
                                    <select
                                        value={gender}
                                        disabled={isReadOnly}
                                        onChange={(e) => setGender(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner text-sm transition-all font-medium disabled:opacity-75"
                                        required
                                    >
                                        <option value="" disabled hidden>{t('rent.selectGender')}</option>
                                        <option value="Male">{t('rent.male')}</option>
                                        <option value="Female">{t('rent.female')}</option>
                                        <option value="Other">{t('rent.other')}</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700 flex justify-between items-center">
                                        <span>{t('rent.occupants')} <span className="required-asterisk text-rose-500 ml-0.5">*</span></span>
                                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">{t('rent.occupantsSurcharge')}</span>
                                    </label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        max="8"
                                        placeholder="2"
                                        value={occupants}
                                        disabled={isReadOnly}
                                        onChange={handleOccupantsInput}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner text-sm transition-all font-medium disabled:opacity-75"
                                        required
                                    />
                                </div>
                                <div className="flex flex-col space-y-1.5 form-group">
                                    <label className="text-sm font-bold text-slate-700 flex justify-between items-center">
                                        <span>{t('rent.monthsOfRent')} <span className="required-asterisk text-rose-500 ml-0.5">*</span></span>
                                        <span className="text-xs font-semibold text-slate-400">{t('rent.monthsMax')}</span>
                                    </label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        max="24"
                                        placeholder="e.g. 6 (Max 24)"
                                        value={monthsOfRent}
                                        disabled={isReadOnly}
                                        onChange={handleMonthsInput}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner text-sm transition-all font-medium disabled:opacity-75"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <h3 className="text-xl font-black m-0 border-b border-slate-100 pb-3 text-slate-900">{t('rent.roomDetails')}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-800 select-none flex justify-between">
                                        {t('rent.roomType')}
                                    </label>
                                    <input type="text" value="Studio" disabled className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-extrabold text-sm select-none cursor-not-allowed shadow-inner" />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-800 select-none flex justify-between">
                                        {t('rent.assignedRoom')}
                                        {!isReadOnly && !editApp && (
                                            <button type="button" onClick={() => setShowRoomModal(true)} className="text-xs text-indigo-600 font-bold hover:underline bg-transparent border-0 cursor-pointer p-0">Change</button>
                                        )}
                                    </label>
                                    <input type="text" value={`Room ${selectedRoomId}`} disabled className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-extrabold text-sm select-none cursor-not-allowed shadow-inner" />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-800 select-none">{t('rent.monthlyRent')}</label>
                                    <input
                                        type="text"
                                        value={`₱${(monthlyRent + (occupants > 4 ? (occupants - 4) * 1000 : 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                        disabled
                                        className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-indigo-700 font-black text-lg select-none cursor-not-allowed shadow-inner"
                                    />
                                    {occupants > 4 && (
                                        <span className="text-[10px] text-emerald-600 font-bold mt-1 uppercase tracking-wide">
                                            +{((occupants - 4) * 1000).toLocaleString()} Extra Occupant Fee
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="border-b border-slate-100 pb-3">
                                <h3 className="text-xl font-black m-0 text-slate-900">{t('rent.verificationDocs')}</h3>
                                <p className="text-slate-500 text-xs mt-1.5 m-0 font-semibold">Accepted formats: JPEG, PNG, PDF (Max 10MB per file)</p>
                            </div>
                            
                            {isReadOnly ? (
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-center space-x-3 text-slate-600 text-sm font-bold">
                                    <Info className="text-indigo-500 w-5 h-5" />
                                    <span>{t('rent.docsLocked')}</span>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Front and Back IDs Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/*ValidIDFront*/}
                                        <div className="flex flex-col space-y-2">
                                            <label className="text-sm font-bold text-slate-700">ID Front <span className="text-rose-500">*</span></label>
                                            <div
                                                onDragOver={(e) => { e.preventDefault(); setIsDraggingIdFront(true); }}
                                                onDragLeave={() => setIsDraggingIdFront(false)}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setIsDraggingIdFront(false);
                                                    if (e.dataTransfer.files?.[0] && validateFile(e.dataTransfer.files[0])) setValidIdFrontFile(e.dataTransfer.files[0]);
                                                }}
                                                className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-200 relative bg-slate-50 flex flex-col items-center justify-center min-h-[180px] ${isDraggingIdFront ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02]' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-100'}`}
                                            >
                                                {!validIdFrontFile ? (
                                                    <>
                                                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { if (e.target.files?.[0] && validateFile(e.target.files[0])) setValidIdFrontFile(e.target.files[0]); }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                                                        <div className="space-y-3 pointer-events-none p-2 flex flex-col items-center">
                                                            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center border border-slate-200">
                                                                <UploadCloud className="w-6 h-6 text-indigo-500" />
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-600 m-0 leading-relaxed">Drop Front ID<br/><span className="text-indigo-600">Browse Files</span></p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="space-y-3 flex flex-col items-center w-full z-10">
                                                        {validIdFrontFile.type.startsWith('image/') ? (
                                                            <img 
                                                                src={URL.createObjectURL(validIdFrontFile)} 
                                                                alt="Front Preview" 
                                                                onClick={() => openPreviewModal(validIdFrontFile, 'ID Front')}
                                                                className="w-full h-24 object-cover rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity" 
                                                            />
                                                        ) : (
                                                            <div className="w-full h-24 bg-indigo-50 flex flex-col items-center justify-center rounded-xl border border-indigo-200 text-indigo-600">
                                                                <FileText className="w-8 h-8 mb-2" />
                                                                <button type="button" onClick={() => openPreviewModal(validIdFrontFile, 'ID Front')} className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm cursor-pointer">View PDF</button>
                                                            </div>
                                                        )}
                                                        <p className="text-[10px] font-bold text-slate-600 m-0 truncate w-full px-2">{validIdFrontFile.name}</p>
                                                        <button type="button" onClick={() => setValidIdFrontFile(null)} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer">Remove</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/*ValidIDBack*/}
                                        <div className="flex flex-col space-y-2">
                                            <label className="text-sm font-bold text-slate-700">ID Back <span className="text-rose-500">*</span></label>
                                            <div
                                                onDragOver={(e) => { e.preventDefault(); setIsDraggingIdBack(true); }}
                                                onDragLeave={() => setIsDraggingIdBack(false)}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setIsDraggingIdBack(false);
                                                    if (e.dataTransfer.files?.[0] && validateFile(e.dataTransfer.files[0])) setValidIdBackFile(e.dataTransfer.files[0]);
                                                }}
                                                className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-200 relative bg-slate-50 flex flex-col items-center justify-center min-h-[180px] ${isDraggingIdBack ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02]' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-100'}`}
                                            >
                                                {!validIdBackFile ? (
                                                    <>
                                                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { if (e.target.files?.[0] && validateFile(e.target.files[0])) setValidIdBackFile(e.target.files[0]); }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                                                        <div className="space-y-3 pointer-events-none p-2 flex flex-col items-center">
                                                            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center border border-slate-200">
                                                                <UploadCloud className="w-6 h-6 text-indigo-500" />
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-600 m-0 leading-relaxed">Drop Back ID<br/><span className="text-indigo-600">Browse Files</span></p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="space-y-3 flex flex-col items-center w-full z-10">
                                                        {validIdBackFile.type.startsWith('image/') ? (
                                                            <img 
                                                                src={URL.createObjectURL(validIdBackFile)} 
                                                                alt="Back Preview" 
                                                                onClick={() => openPreviewModal(validIdBackFile, 'ID Back')}
                                                                className="w-full h-24 object-cover rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity" 
                                                            />
                                                        ) : (
                                                            <div className="w-full h-24 bg-indigo-50 flex flex-col items-center justify-center rounded-xl border border-indigo-200 text-indigo-600">
                                                                <FileText className="w-8 h-8 mb-2" />
                                                                <button type="button" onClick={() => openPreviewModal(validIdBackFile, 'ID Back')} className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm cursor-pointer">View PDF</button>
                                                            </div>
                                                        )}
                                                        <p className="text-[10px] font-bold text-slate-600 m-0 truncate w-full px-2">{validIdBackFile.name}</p>
                                                        <button type="button" onClick={() => setValidIdBackFile(null)} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer">Remove</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/*NBI Clearance Row - Separate from IDs */}
                                    <div className="flex justify-center pt-2">
                                        <div className="flex flex-col space-y-2 w-full md:w-1/2">
                                            <label className="text-sm font-bold text-slate-700">NBI Clearance <span className="text-rose-500">*</span></label>
                                            <div
                                                onDragOver={(e) => { e.preventDefault(); setIsDraggingNbi(true); }}
                                                onDragLeave={() => setIsDraggingNbi(false)}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setIsDraggingNbi(false);
                                                    if (e.dataTransfer.files?.[0] && validateFile(e.dataTransfer.files[0])) setNbiFile(e.dataTransfer.files[0]);
                                                }}
                                                className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-200 relative bg-slate-50 flex flex-col items-center justify-center min-h-[180px] ${isDraggingNbi ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02]' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-100'}`}
                                            >
                                                {!nbiFile ? (
                                                    <>
                                                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { if (e.target.files?.[0] && validateFile(e.target.files[0])) setNbiFile(e.target.files[0]); }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                                                        <div className="space-y-3 pointer-events-none p-2 flex flex-col items-center">
                                                            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center border border-slate-200">
                                                                <UploadCloud className="w-6 h-6 text-indigo-500" />
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-600 m-0 leading-relaxed">Drop NBI Form<br/><span className="text-indigo-600">Browse Files</span></p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="space-y-3 flex flex-col items-center w-full z-10">
                                                        {nbiFile.type.startsWith('image/') ? (
                                                            <img 
                                                                src={URL.createObjectURL(nbiFile)} 
                                                                alt="NBI Preview" 
                                                                onClick={() => openPreviewModal(nbiFile, 'NBI Clearance')}
                                                                className="w-full h-24 object-cover rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity" 
                                                            />
                                                        ) : (
                                                            <div className="w-full h-24 bg-indigo-50 flex flex-col items-center justify-center rounded-xl border border-indigo-200 text-indigo-600">
                                                                <FileText className="w-8 h-8 mb-2" />
                                                                <button type="button" onClick={() => openPreviewModal(nbiFile, 'NBI Clearance')} className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm cursor-pointer">View PDF</button>
                                                            </div>
                                                        )}
                                                        <p className="text-[10px] font-bold text-slate-600 m-0 truncate w-full px-2">{nbiFile.name}</p>
                                                        <button type="button" onClick={() => setNbiFile(null)} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer">Remove</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6">
                            {!isReadOnly && (
                                <div className="flex items-center space-x-3 w-full sm:w-auto">
                                    <label className="relative flex items-center justify-center cursor-pointer w-6 h-6 shrink-0 group">
                                        <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} className="peer sr-only" />
                                        <div className="w-full h-full rounded-md border-2 border-slate-300 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all flex items-center justify-center group-hover:border-indigo-400">
                                            <Check className={`w-3.5 h-3.5 text-white transition-transform duration-200 ${agreePrivacy ? 'scale-100' : 'scale-0'}`} />
                                        </div>
                                    </label>
                                    <label className="text-sm font-semibold text-slate-600">
                                        {t('rent.agreeTerms')}{' '}
                                        <button type="button" onClick={() => setShowTermsModal(true)} className="text-indigo-600 font-bold hover:text-indigo-700 bg-transparent border-0 p-0 cursor-pointer inline underline underline-offset-2">
                                            {t('rent.termsLink')}
                                        </button>
                                    </label>
                                </div>
                            )}

                            {isPendingReview ? (
                                <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-700 text-sm font-bold w-full">
                                    {t('rent.pendingMsg')}
                                </div>
                            ) : (
                                <button
                                    type="submit"
                                    className="w-full sm:w-auto text-white font-black px-12 py-4 rounded-xl text-sm transition-all duration-300 shadow-xl shadow-indigo-600/30 border-0 cursor-pointer bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 uppercase tracking-wider"
                                >
                                    {t('rent.submitApp')}
                                </button>
                            )}
                        </div>
                    </form>
                )}
            </div>

            {/* Room Selection Modal */}
            {showRoomModal && (
                <div onClick={() => setShowRoomModal(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-scale-in overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 className="text-xl font-black text-slate-900 m-0">Select Available Room</h3>
                            <button onClick={() => setShowRoomModal(false)} className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-slate-50 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 custom-scrollbar">
                            {availableRooms.length > 0 ? availableRooms.map(room => (
                                <div 
                                    key={room.id}
                                    onClick={() => {
                                        setSelectedRoomId(room.id);
                                        setShowRoomModal(false);
                                    }}
                                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedRoomId === room.id ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/10' : 'border-slate-200 bg-white hover:border-indigo-300'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="text-lg font-black text-slate-900 m-0">Room {room.id}</h4>
                                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md uppercase tracking-wider">Available</span>
                                    </div>
                                    <div className="text-sm font-medium text-slate-600 space-y-1">
                                        <p className="m-0 text-slate-500">Floor: <span className="text-slate-800 font-bold">{room.floor || 'N/A'}</span></p>
                                        <p className="m-0 text-indigo-700 font-black text-lg">₱{Number(room.rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}<span className="text-xs text-indigo-500 font-medium">/mo</span></p>
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-2 text-center text-slate-500 py-10 font-bold">No available rooms at the moment.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Error File Modal Overlay */}
            {fileErrorMsg && (
                <div onClick={() => setFileErrorMsg('')} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm flex flex-col p-8 text-center animate-scale-in border-4 border-rose-100">
                        <div className="w-20 h-20 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-5">
                            <AlertCircle className="w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 m-0 mb-3">Notice</h3>
                        <p className="text-slate-600 text-sm font-medium m-0 mb-8 leading-relaxed px-2">{fileErrorMsg}</p>
                        <button onClick={() => setFileErrorMsg('')} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-sm transition-colors cursor-pointer shadow-md">
                            I Understand
                        </button>
                    </div>
                </div>
            )}

            {/* Document Preview Modal */}
            {previewModalUrl && (
                <div onClick={() => setPreviewModalUrl(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-scale-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                            <h3 className="text-lg font-black text-slate-900 m-0 flex items-center gap-2">
                                <FileText className="text-rose-500 w-5 h-5" />
                                {previewModalTitle}
                            </h3>
                            <button onClick={() => setPreviewModalUrl(null)} className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 w-full bg-slate-100 p-4 flex items-center justify-center overflow-auto relative">
                            {previewModalIsImage ? (
                                <img src={previewModalUrl} alt={previewModalTitle} className="max-w-full max-h-full object-contain rounded-xl shadow-md border border-slate-200 bg-white" />
                            ) : (
                                <iframe src={previewModalUrl} title={previewModalTitle} className="w-full h-full border-0 rounded-xl bg-white shadow-inner"></iframe>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showTermsModal && (
                <div onClick={() => setShowTermsModal(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] animate-scale-in overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 className="text-xl font-black text-slate-900 m-0">{t('rent.termsTitle')}</h3>
                            <button onClick={() => setShowTermsModal(false)} className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-600 leading-relaxed custom-scrollbar">
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
                            <button onClick={() => { setAgreePrivacy(true); setShowTermsModal(false); }} className="bg-[#10b981] hover:bg-[#059669] text-white font-black px-8 py-3 rounded-xl text-sm transition-colors shadow-md shadow-emerald-600/20 cursor-pointer">
                                {t('rent.acceptAgree')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SuccessModal 
                isOpen={showSuccessModal} 
                onClose={() => { setShowSuccessModal(false); navigate('/track-application'); }} 
                message={t('rent.successMsg')}
            />
        </div>
    );
}
