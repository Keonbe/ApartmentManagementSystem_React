import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt, faCheckCircle, faHourglassHalf, faCheck, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';
import api from '../api/axiosConfig';

export default function RentApplication() {
    const navigate = useNavigate();
    
    {/*MOCK STATUS CONFIGURATOR: Reset to none so users submit fresh forms by default*/}
    const [applicationStatus, setApplicationStatus] = useState('none');

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [suffix, setSuffix] = useState('');
    
    {/*Philippine Mobile Number States*/}
    const [phoneRawNumber, setPhoneRawNumber] = useState('');
    const [phoneError, setPhoneError] = useState('');

    const [email, setEmail] = useState('');
    const [gender, setGender] = useState('');
    const [occupants, setOccupants] = useState('');
    const [monthsOfRent, setMonthsOfRent] = useState('');
    const [roomName] = useState('Room C');
    const [monthlyRent] = useState(4000);
    
    {/*File drops state tracking for separated front and back ID files*/}
    const [validIdFrontFile, setValidIdFrontFile] = useState(null);
    const [validIdBackFile, setValidIdBackFile] = useState(null);
    const [nbiFile, setNbiFile] = useState(null);
    const [isDraggingIdFront, setIsDraggingIdFront] = useState(false);
    const [isDraggingIdBack, setIsDraggingIdBack] = useState(false);
    const [isDraggingNbi, setIsDraggingNbi] = useState(false);

    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const isReadOnly = applicationStatus === 'pending' || applicationStatus === 'accepted';

    {/*Filters and restricts real-time typing to a strict 10-digit Philippine mobile format*/}
    const handlePhoneRawInput = (e) => {
        if (isReadOnly) return;
        
        {/*Strip any non-numeric characters*/}
        const val = e.target.value.replace(/\D/g, '');
        
        {/*Enforce the absolute 10-digit maximum cutoff count*/}
        if (val.length <= 10) {
            setPhoneRawNumber(val);
            setPhoneError('');
        }
    };

    {/*Checks for realistic phone arrangements and prefixes on blur or submit*/}
    const validatePhilippineNumber = (number) => {
        if (number.length !== 10) {
            return "Mobile number must be exactly 10 digits (e.g., 9171234567).";
        }
        
        {/*Philippine mobile numbers start with 9 or 8 after the +63 code*/}
        if (!/^[89]/.test(number)) {
            return "Invalid prefix. Real Philippine mobile numbers must start with 9 or 8.";
        }

        {/*Anti-fraud check: Block obviously repetitive fake patterns (e.g., 9999999999)*/}
        if (/^(\d)\1+$/.test(number)) {
            return "Fake number pattern detected. Please enter a valid number.";
        }

        {/*Anti-fraud check: Block sequential fake entries (e.g., 1234567890)*/}
        if ("012345678901".includes(number) || "09876543210".includes(number)) {
            return "Sequential numbers are not accepted as valid contact records.";
        }

        return "";
    };

    const handleOccupantsInput = (e) => {
        if (isReadOnly) return;
        const value = e.target.value;
        if (value === '') { setOccupants(''); return; }
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 1 && num <= 4) setOccupants(num);
    };

    const handleMonthsInput = (e) => {
        if (isReadOnly) return;
        const value = e.target.value;
        if (value === '' || /^[0-9]\d*$/.test(value)) setMonthsOfRent(value);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        if (applicationStatus === 'accepted') {
            navigate('/payments'); 
            return;
        }

        {/*Run final strict phone validation algorithms check*/}
        const validationError = validatePhilippineNumber(phoneRawNumber);
        if (validationError) {
            setPhoneError(validationError);
            alert(validationError);
            return;
        }

        if (!agreePrivacy) {
            alert("Please read and agree to the terms and privacy policy before submitting.");
            return;
        }

        if (!validIdFrontFile || !validIdBackFile || !nbiFile) {
            alert("Please upload your Valid ID Front, Valid ID Back, and NBI Clearance.");
            return;
        }

        const fullContactNumber = `+63 ${phoneRawNumber}`;

        const formData = new FormData();
        formData.append('firstName', firstName.trim());
        formData.append('lastName', lastName.trim());
        formData.append('suffix', suffix.trim());
        formData.append('contactNo', fullContactNumber);
        formData.append('email', email.trim());
        formData.append('gender', gender);
        formData.append('occupants', occupants);
        formData.append('monthsOfRent', monthsOfRent);
        formData.append('roomName', roomName);
        formData.append('monthlyRent', monthlyRent);
        formData.append('validIdFrontFile', validIdFrontFile);
        formData.append('validIdBackFile', validIdBackFile);
        formData.append('nbiFile', nbiFile);

        try {
            const res = await api.post("/rent_application.php", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setShowSuccessModal(true);
            } else {
                alert(res.data.message);
            }
        } catch (error) {
            console.error("Error submitting application:", error);
            alert("A network error occurred.");
        }
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">

                {/*Top Header Row Layout with Status Badges*/}
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none" style={{ color: '#3b4276' }}>
                            Rent Application Form
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 m-0">
                            Complete the required documentation onboarding framework below to process your lease application.
                        </p>
                    </div>

                    {/*Status Badge UI Engine*/}
                    {applicationStatus !== 'none' && (
                        <div className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl font-bold text-sm shadow-sm select-none border border-current self-start sm:self-center transition-all duration-300 ${applicationStatus === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            <FontAwesomeIcon icon={applicationStatus === 'pending' ? faHourglassHalf : faCheck} className={applicationStatus === 'pending' ? 'animate-spin' : ''} />
                            <div className="flex flex-col text-left">
                                <span className="text-[10px] uppercase tracking-wider opacity-75 leading-none">Application Status</span>
                                <span className="text-sm font-black mt-0.5">{applicationStatus === 'pending' ? 'Pending Review' : 'Approved'}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/*Form Container Panel Grid*/}
                <form className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-10 space-y-8" onSubmit={handleFormSubmit}>
                    
                    {/*SECTION 1: PERSONAL DETAILS PROFILE DATA GRID*/}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2" style={{ color: '#3b4276' }}>Personal Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">First Name</label>
                                <input
                                    type="text"
                                    placeholder="Juan"
                                    value={firstName}
                                    disabled={isReadOnly}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Last Name</label>
                                <input
                                    type="text"
                                    placeholder="Dela Cruz"
                                    value={lastName}
                                    disabled={isReadOnly}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Suffix</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Jr, Sr, III"
                                    value={suffix}
                                    disabled={isReadOnly}
                                    onChange={(e) => setSuffix(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            
                            {/*Philippine Mobile Input Container with structural country indicators*/}
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Contact No.</label>
                                <div className="w-full flex relative">
                                    <div className="flex items-center space-x-1 px-3 bg-slate-100 border border-slate-200 rounded-l-xl text-slate-800 text-sm font-bold select-none border-r-0 pointer-events-none opacity-80">
                                        <span>🇵🇭</span>
                                        <span className="text-slate-600 text-xs font-semibold">+63</span>
                                    </div>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="917 123 4567"
                                        value={phoneRawNumber}
                                        disabled={isReadOnly}
                                        onChange={handlePhoneRawInput}
                                        onBlur={() => setPhoneError(validatePhilippineNumber(phoneRawNumber))}
                                        className={`w-full flex-grow px-4 py-2.5 rounded-r-xl bg-slate-50 border text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm disabled:opacity-75 disabled:cursor-not-allowed box-border ${phoneError ? 'border-red-400 focus:ring-red-400' : 'border-slate-200'}`}
                                        required
                                    />
                                </div>
                                {phoneError && (
                                    <span className="text-[11px] text-red-500 font-medium leading-none mt-1">{phoneError}</span>
                                )}
                            </div>

                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Email Address</label>
                                <input
                                    type="email"
                                    placeholder="JDelaCruz12@gmail.com"
                                    value={email}
                                    disabled={isReadOnly}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Gender</label>
                                <select
                                    value={gender}
                                    disabled={isReadOnly}
                                    onChange={(e) => setGender(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    required
                                >
                                    <option value="" disabled hidden>Select gender...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">No. Occupants (Max 4)</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    max="4"
                                    placeholder="2"
                                    value={occupants}
                                    disabled={isReadOnly}
                                    onChange={handleOccupantsInput}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Months of Rent</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="6 Months"
                                    value={monthsOfRent}
                                    disabled={isReadOnly}
                                    onChange={handleMonthsInput}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/*SECTION 2: ROOM DETAILS WITH CORRECTED FONT COLORS AND SLATE BG*/}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2" style={{ color: '#3b4276' }}>Room Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-800 select-none">Room Type</label>
                                <input
                                    type="text"
                                    value="Studio"
                                    disabled
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-extrabold text-sm select-none cursor-not-allowed shadow-inner"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-800 select-none">Assigned Room</label>
                                <input
                                    type="text"
                                    value={roomName}
                                    disabled
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-extrabold text-sm select-none cursor-not-allowed shadow-inner"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-800 select-none">Monthly Rent</label>
                                <input
                                    type="text"
                                    value={`₱${monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                    disabled
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-extrabold text-sm select-none cursor-not-allowed shadow-inner"
                                />
                            </div>
                        </div>
                    </div>

                    {/*SECTION 3: VERIFICATION DOCUMENTS FOR SEPARATED FRONT/BACK IDS*/}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2" style={{ color: '#3b4276' }}>Verification Documents</h3>
                        
                        {isReadOnly ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-center space-x-3 text-slate-600 text-sm font-medium">
                                <FontAwesomeIcon icon={faInfoCircle} className="text-indigo-500 text-lg" />
                                <span>Your verification file assets have been uploaded securely and are locked while undergoing review.</span>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/*Valid ID Front Side Upload Drop Box*/}
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Valid ID Card (Front Side)</label>
                                        <div
                                            onDragOver={(e) => { e.preventDefault(); setIsDraggingIdFront(true); }}
                                            onDragLeave={() => setIsDraggingIdFront(false)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setIsDraggingIdFront(false);
                                                if (e.dataTransfer.files && e.dataTransfer.files[0]) setValidIdFrontFile(e.dataTransfer.files[0]);
                                            }}
                                            className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-150 relative bg-slate-50 flex flex-col items-center justify-center min-h-[120px] ${isDraggingIdFront ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <input
                                                type="file"
                                                accept=".pdf,.jpg,.jpeg,.png"
                                                onChange={(e) => { if (e.target.files && e.target.files[0]) setValidIdFrontFile(e.target.files[0]); }}
                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                            />
                                            {!validIdFrontFile ? (
                                                <div className="space-y-1 pointer-events-none">
                                                    <FontAwesomeIcon icon={faCloudUploadAlt} className="text-2xl text-slate-400" />
                                                    <p className="text-xs font-medium text-slate-700 m-0">Drop ID card front view here, or <span className="text-indigo-600 font-bold">browse</span></p>
                                                </div>
                                            ) : (
                                                <div className="space-y-1 flex flex-col items-center pointer-events-none">
                                                    <FontAwesomeIcon icon={faCheckCircle} className="text-2xl text-emerald-500" />
                                                    <p className="text-xs font-bold text-slate-800 m-0 truncate max-w-[200px]">{validIdFrontFile.name}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/*Valid ID Back Side Upload Drop Box*/}
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Valid ID Card (Back Side)</label>
                                        <div
                                            onDragOver={(e) => { e.preventDefault(); setIsDraggingIdBack(true); }}
                                            onDragLeave={() => setIsDraggingIdBack(false)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setIsDraggingIdBack(false);
                                                if (e.dataTransfer.files && e.dataTransfer.files[0]) setValidIdBackFile(e.dataTransfer.files[0]);
                                            }}
                                            className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-150 relative bg-slate-50 flex flex-col items-center justify-center min-h-[120px] ${isDraggingIdBack ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <input
                                                type="file"
                                                accept=".pdf,.jpg,.jpeg,.png"
                                                onChange={(e) => { if (e.target.files && e.target.files[0]) setValidIdBackFile(e.target.files[0]); }}
                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                            />
                                            {!validIdBackFile ? (
                                                <div className="space-y-1 pointer-events-none">
                                                    <FontAwesomeIcon icon={faCloudUploadAlt} className="text-2xl text-slate-400" />
                                                    <p className="text-xs font-medium text-slate-700 m-0">Drop ID card back view here, or <span className="text-indigo-600 font-bold">browse</span></p>
                                                </div>
                                            ) : (
                                                <div className="space-y-1 flex flex-col items-center pointer-events-none">
                                                    <FontAwesomeIcon icon={faCheckCircle} className="text-2xl text-emerald-500" />
                                                    <p className="text-xs font-bold text-slate-800 m-0 truncate max-w-[200px]">{validIdBackFile.name}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/*NBI Clearance Upload Drop Box*/}
                                <div className="flex flex-col space-y-2">
                                    <label className="text-sm font-bold text-slate-700">NBI Clearance Form Document Attachment</label>
                                    <div
                                        onDragOver={(e) => { e.preventDefault(); setIsDraggingNbi(true); }}
                                        onDragLeave={() => setIsDraggingNbi(false)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDraggingNbi(false);
                                            if (e.dataTransfer.files && e.dataTransfer.files[0]) setNbiFile(e.dataTransfer.files[0]);
                                        }}
                                        className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-150 relative bg-slate-50 flex flex-col items-center justify-center min-h-[120px] ${isDraggingNbi ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                                    >
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => { if (e.target.files && e.target.files[0]) setNbiFile(e.target.files[0]); }}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                        />
                                        {!nbiFile ? (
                                            <div className="space-y-1 pointer-events-none">
                                                <FontAwesomeIcon icon={faCloudUploadAlt} className="text-2xl text-slate-400" />
                                                <p className="text-xs font-medium text-slate-700 m-0">Drop your valid NBI clearance form here, or <span className="text-indigo-600 font-bold">browse</span></p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1 flex flex-col items-center pointer-events-none">
                                                <FontAwesomeIcon icon={faCheckCircle} className="text-2xl text-emerald-500" />
                                                <p className="text-xs font-bold text-slate-800 m-0 truncate max-w-[200px]">{nbiFile.name}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/*DYNAMIC ACTION CONTROLS ENGINE HOOK LAYOUT ROW*/}
                    <div className="flex flex-col items-center space-y-4 pt-4 border-t border-slate-100 select-none">
                        
                        {/*Custom Transparent Checked Box Layout Element*/}
                        {applicationStatus === 'none' && (
                            <div className="flex items-center space-x-3">
                                <label className="relative flex items-center justify-center w-5 h-5 rounded-md border-2 border-indigo-500 bg-transparent cursor-pointer transition-all">
                                    <input
                                        type="checkbox"
                                        checked={agreePrivacy}
                                        onChange={(e) => setAgreePrivacy(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={`w-full h-full rounded-[4px] bg-indigo-600 flex items-center justify-center text-white text-[10px] transition-transform duration-150 ${agreePrivacy ? 'scale-100' : 'scale-0'}`}>
                                        <FontAwesomeIcon icon={faCheck} />
                                    </div>
                                </label>
                                <label className="text-sm font-medium text-slate-600">
                                    By ticking this box, I agree that I have read the{' '}
                                    <button
                                        type="button"
                                        onClick={() => setShowTermsModal(true)}
                                        className="text-indigo-600 font-bold hover:underline bg-transparent border-0 p-0 cursor-pointer inline"
                                    >
                                        terms and privacy policy
                                    </button>
                                </label>
                            </div>
                        )}

                        {applicationStatus === 'pending' ? (
                            <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-700 text-sm font-medium w-full">
                                Your lease request data is currently under review by building management. Submissions cannot be edited at this time.
                            </div>
                        ) : (
                            <button
                                type="submit"
                                className={`w-full sm:w-auto text-white font-bold px-12 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer ${applicationStatus === 'accepted' ? 'bg-[#10b981] hover:bg-[#059669] hover:scale-[1.03] active:scale-[0.97]' : 'bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-[1.03] active:scale-[0.97]'}`}
                            >
                                {applicationStatus === 'accepted' ? 'Proceed to Payment' : 'Submit Application'}
                            </button>
                        )}
                    </div>

                </form>
            </div>

            {/*MODAL 1: TERMS AND SERVICES*/}
            {showTermsModal && (
                <div 
                    onClick={() => setShowTermsModal(false)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
                    >
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-2xl">
                            <h3 className="text-xl font-bold m-0" style={{ color: '#3b4276' }}>Terms and Services</h3>
                            <button 
                                onClick={() => setShowTermsModal(false)}
                                className="text-slate-400 hover:text-slate-600 font-bold bg-transparent border-0 cursor-pointer text-lg"
                            >✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4 text-sm text-slate-600 leading-relaxed text-left">
                            <h4 className="font-bold text-slate-800 m-0">1. Apartment Occupancy Regulations</h4>
                            <p className="m-0">The maximum occupancy layout configuration is strictly restricted to a limit of 4 tenants per studio apartment room setup. Exceeding this calculation capacity bounds violates asset unit safety compliance guidelines.</p>
                            
                            <h4 className="font-bold text-slate-800 m-0">2. Verification Paperwork Protocols</h4>
                            <p className="m-0">Applicants are legally required to submit clear authentic record documentation copies of both a valid government issued ID layout file asset and a recent NBI Clearance verification page.</p>
                            
                            <h4 className="font-bold text-slate-800 m-0">3. Data Privacy Statement</h4>
                            <p className="m-0">All uploaded file artifacts, text names, contact phone keys, and communication metrics are encrypted and safely stored solely within the Apartment Management System (AMS) data records platform securely.</p>
                        </div>
                        <div className="p-4 border-t border-slate-200 flex justify-end bg-white rounded-b-2xl">
                            <button
                                onClick={() => {
                                    setAgreePrivacy(true);
                                    setShowTermsModal(false);
                                }}
                                className="bg-[#10b981] hover:bg-[#059669] text-white font-bold px-6 py-2 rounded-xl text-sm border-0 cursor-pointer transition-colors"
                            >
                                Accept & Agree
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/*MODAL 2: SUCCESS DIALOG POPUP*/}
            <SuccessModal 
                isOpen={showSuccessModal} 
                onClose={() => {
                    setShowSuccessModal(false);
                    navigate('/home');
                }} 
                message="Application Submitted Successfully" 
            />
        </div>
    );
}