import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';

export default function RentApplication() {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [suffix, setSuffix] = useState('');
    const [contactNo, setContactNo] = useState('');
    const [email, setEmail] = useState('');
    const [gender, setGender] = useState('');
    const [occupants, setOccupants] = useState('');
    const [monthsOfRent, setMonthsOfRent] = useState('');
    const [roomName] = useState('Room C');//mock value matching image_be25d0.png
    const [monthlyRent] = useState(4000);//mock value matching image_be25d0.png
    
    //File drops state tracking
    const [validIdFile, setValidIdFile] = useState(null);
    const [nbiFile, setNbiFile] = useState(null);
    const [isDraggingId, setIsDraggingId] = useState(false);
    const [isDraggingNbi, setIsDraggingNbi] = useState(false);

    //Modal display state modifiers
    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    //Locks occupancy count limits between 1 and 4 exclusively
    const handleOccupantsInput = (e) => {
        const value = e.target.value;
        if (value === '') {
            setOccupants('');
            return;
        }
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 1 && num <= 4) {
            setOccupants(num);
        }
    };

    //Locks rental duration limits to structural numeric digits
    const handleMonthsInput = (e) => {
        const value = e.target.value;
        if (value === '' || /^[0-9]\d*$/.test(value)) {
            setMonthsOfRent(value);
        }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!agreePrivacy) {
            alert("Please read and agree to the terms and privacy policy before submitting.");
            return;
        }
        setShowSuccessModal(true);
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">

                {/*Top Header Row Layout*/}
                <div className="border-b border-slate-200 pb-4">
                    <h1
                        className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                        style={{ color: '#3b4276' }}
                    >
                        Rent Application Form
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 m-0">
                        Complete the required documentation onboarding framework below to process your lease application.
                    </p>
                </div>

                {/*Form Container Grid Panel*/}
                <form className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-10 space-y-8" onSubmit={handleFormSubmit}>
                    
                    {/*SECTION 1: PERSONAL INFORMATION PROFILE DATA GRID*/}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2" style={{ color: '#3b4276' }}>Personal Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">First Name</label>
                                <input
                                    type="text"
                                    placeholder="Juan"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Last Name</label>
                                <input
                                    type="text"
                                    placeholder="Dela Cruz"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Suffix</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Jr, Sr, III"
                                    value={suffix}
                                    onChange={(e) => setSuffix(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Contact No.</label>
                                <input
                                    type="text"
                                    placeholder="0999 676 6967"
                                    value={contactNo}
                                    onChange={(e) => setContactNo(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Email Address</label>
                                <input
                                    type="email"
                                    placeholder="JDelaCruz12@gmail.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                    required
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Gender</label>
                                <select
                                    value={gender}
                                    onChange={(e) => setGender(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
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
                                    onChange={handleOccupantsInput}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
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
                                    onChange={handleMonthsInput}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/*SECTION 2: HOUSING PROPERTY UNIT SPECIFICS SPECIFICATIONS DATA GRID*/}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2" style={{ color: '#3b4276' }}>Room Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-400 select-none">Room Type</label>
                                <input
                                    type="text"
                                    value="Studio"
                                    disabled //Locked because all rooms are studio type layout configs
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 font-medium text-sm select-none cursor-not-allowed"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-400 select-none">Assigned Room</label>
                                <input
                                    type="text"
                                    value={roomName}
                                    disabled
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 font-medium text-sm select-none cursor-not-allowed"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-400 select-none">Monthly Rent</label>
                                <input
                                    type="text"
                                    value={`₱${monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                    disabled
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 font-medium text-sm select-none cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>

                    {/*SECTION 3: FILE REGISTRATION DATA VALIDATION SPLIT TRACK PANEL LAYOUT*/}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2" style={{ color: '#3b4276' }}>Verification Documents</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/*Valid ID Upload Drop Box Area Container Component*/}
                            <div className="flex flex-col space-y-2">
                                <label className="text-sm font-bold text-slate-700">Valid ID Card Document Attachment</label>
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingId(true); }}
                                    onDragLeave={() => setIsDraggingId(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDraggingId(false);
                                        if (e.dataTransfer.files && e.dataTransfer.files[0]) setValidIdFile(e.dataTransfer.files[0]);
                                    }}
                                    className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-150 relative bg-slate-50 flex flex-col items-center justify-center min-h-[120px] ${isDraggingId ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={(e) => { if (e.target.files && e.target.files[0]) setValidIdFile(e.target.files[0]); }}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    {!validIdFile ? (
                                        <div className="space-y-1 pointer-events-none">
                                            <FontAwesomeIcon icon={faCloudUploadAlt} className="text-2xl text-slate-400" />
                                            <p className="text-xs font-medium text-slate-700 m-0">Drop your valid identification ID card here, or <span className="text-indigo-600 font-bold">browse</span></p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 flex flex-col items-center pointer-events-none">
                                            <FontAwesomeIcon icon={faCheckCircle} className="text-2xl text-emerald-500" />
                                            <p className="text-xs font-bold text-slate-800 m-0 truncate max-w-[200px]">{validIdFile.name}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/*NBI Clearance Document Upload Area Container Box Layout Component*/}
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
                    </div>

                    {/*TERMS & POLICY TOGGLE AGREEMENT SELECTION TRACK FOOTER LINK LAYER BLOCK COMPONENTS*/}
                    <div className="flex flex-col items-center space-y-4 pt-4 border-t border-slate-100 select-none">
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                id="privacy-agree-checkbox"
                                checked={agreePrivacy}
                                onChange={(e) => setAgreePrivacy(e.target.checked)}
                                className="w-4 h-4 rounded border-indigo-400 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer transition-colors"
                            />
                            <label htmlFor="privacy-agree-checkbox" className="text-sm font-medium text-slate-600">
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

                        <button
                            type="submit"
                            className="w-full sm:w-auto bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-[1.03] active:scale-[0.97] text-white font-bold px-12 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer"
                        >
                            Submit Application
                        </button>
                    </div>

                </form>
            </div>

            {/*MODAL 1: TERMS AND SERVICES MODAL BOX SPECIFICATIONS LAYER OVERLAY CONFIGURATIONS*/}
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

            {/*MODAL 2: SUCCESSFUL POP-UP STANDALONE RESPONSE ELEMENT CONTAINER*/}
            <SuccessModal 
                isOpen={showSuccessModal} 
                onClose={() => setShowSuccessModal(false)} 
                message="Application Submitted Successfully" 
            />
        </div>
    );
}