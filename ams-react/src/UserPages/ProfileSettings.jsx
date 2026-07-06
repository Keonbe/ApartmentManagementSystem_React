import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileAlt, faKey, faSave } from '@fortawesome/free-solid-svg-icons';
import DocumentsModal from '../Components/DocumentsModal';
import ChangePasswordModal from '../Components/ChangePasswordModal';
import api from '../api/axiosConfig';

export default function ProfileSettings() {
    const [loggedInUser, setLoggedInUser] = useState(JSON.parse(sessionStorage.getItem("loggedInUser") || "{}"));
    
    const [firstName, setFirstName] = useState(loggedInUser.first_name || '');
    const [lastName, setLastName] = useState(loggedInUser.last_name || '');
    const [suffix, setSuffix] = useState(loggedInUser.suffix || '');
    const [phoneRawNumber, setPhoneRawNumber] = useState(loggedInUser.contact_no ? loggedInUser.contact_no.replace('+63 ', '') : '');
    const [phoneError, setPhoneError] = useState('');
    const [email, setEmail] = useState(loggedInUser.email_address || '');
    const [gender, setGender] = useState(loggedInUser.gender || '');

    const [showDocsModal, setShowDocsModal] = useState(false);
    const [showPassModal, setShowPassModal] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!loggedInUser.email_address) return;
            try {
                const res = await api.get(`/profile.php?email=${encodeURIComponent(loggedInUser.email_address)}`);
                if (res.data.success && res.data.data) {
                    const data = res.data.data;
                    setFirstName(data.first_name || '');
                    setLastName(data.last_name || '');
                    setSuffix(data.suffix || '');
                    setGender(data.gender || '');
                    if (data.contact_no) {
                        setPhoneRawNumber(data.contact_no.replace('+63 ', ''));
                    }
                }
            } catch (error) {
                console.error("Failed to load profile data:", error);
            }
        };
        fetchProfile();
    }, [loggedInUser.email_address]);

    const handlePhoneRawInput = (e) => {
        const val = e.target.value.replace(/\D/g, '');
        if (val.length <= 10) {
            setPhoneRawNumber(val);
            setPhoneError('');
        }
    };

    const validatePhilippineNumber = (number) => {
        if (number.length !== 10) return "Mobile number must be exactly 10 digits.";
        if (!/^[89]/.test(number)) return "Invalid prefix.";
        if (/^(\d)\1+$/.test(number)) return "Repetitive number pattern flagged.";
        if ("012345678901".includes(number) || "09876543210".includes(number)) return "Sequential numbers rejected.";
        return "";
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        const validationError = validatePhilippineNumber(phoneRawNumber);
        if (validationError) {
            setPhoneError(validationError);
            alert(validationError);
            return;
        }

        const fullContactNumber = `+63 ${phoneRawNumber}`;

        try {
            const payload = {
                oldEmail: loggedInUser.email_address,
                email: email.trim(),
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                suffix: suffix.trim(),
                contactNo: fullContactNumber,
                gender: gender
            };

            const res = await api.post('/profile.php', payload);

            if (res.data.success) {
                const updatedUser = {
                    ...loggedInUser,
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    suffix: suffix.trim(),
                    contact_no: fullContactNumber,
                    gender: gender,
                    email_address: email.trim()
                };
                
                sessionStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
                setLoggedInUser(updatedUser);
                
                alert("Profile saved successfully.");
            } else {
                alert(res.data.message);
            }
        } catch (error) {
            console.error("Error saving profile:", error);
            alert("A network error occurred while saving.");
        }
    };

    const getInitials = () => {
        const firstLetter = firstName ? firstName.charAt(0) : '';
        const lastLetter = lastName ? lastName.charAt(0) : '';
        return `${firstLetter}${lastLetter}`.toUpperCase();
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">
                <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none" style={{ color: '#3b4276' }}>
                            Profile Settings
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 m-0">
                            Review and maintain your master identity records configuration details below.
                        </p>
                    </div>
                    
                    <div 
                        className="w-20 h-24 sm:w-24 rounded-full flex items-center justify-center text-white text-3xl font-black shrink-0 select-none pointer-events-none tracking-wider shadow-md border-2 border-white"
                        style={{ backgroundColor: '#3b4276' }}
                    >
                        {getInitials() || "?"}
                    </div>
                </div>

                <form className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-10 space-y-8" onSubmit={handleFormSubmit}>
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2" style={{ color: '#3b4276' }}>Personal Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">First Name</label>
                                <input
                                    type="text"
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
                                    value={suffix}
                                    onChange={(e) => setSuffix(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Contact No.</label>
                                <div className="w-full flex relative">
                                    <div className="flex items-center space-x-1 px-3 bg-slate-100 border border-slate-200 rounded-l-xl text-slate-800 text-sm font-bold select-none border-r-0 pointer-events-none opacity-80 box-border">
                                        <span>🇵🇭</span>
                                        <span className="text-slate-600 text-xs font-semibold">+63</span>
                                    </div>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="917 123 4567"
                                        value={phoneRawNumber}
                                        onChange={handlePhoneRawInput}
                                        className={`w-full flex-grow px-4 py-2.5 rounded-r-xl bg-slate-50 border text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm box-border ${phoneError ? 'border-red-400' : 'border-slate-200'}`}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Email Address</label>
                                <input
                                    type="text"
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
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <button type="button" onClick={() => setShowDocsModal(true)} className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl p-4 text-left flex items-center space-x-4 cursor-pointer transition-all duration-150 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <FontAwesomeIcon icon={faFileAlt} className="text-base" />
                            </div>
                            <div>
                                <p className="m-0 text-sm font-bold text-slate-800">Verification Documents</p>
                                <p className="m-0 text-xs text-slate-400 mt-0.5">Manage Valid ID & NBI Clearance</p>
                            </div>
                        </button>
                        <button type="button" onClick={() => setShowPassModal(true)} className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl p-4 text-left flex items-center space-x-4 cursor-pointer transition-all duration-150 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <FontAwesomeIcon icon={faKey} className="text-base" />
                            </div>
                            <div>
                                <p className="m-0 text-sm font-bold text-slate-800">Account Security</p>
                                <p className="m-0 text-xs text-slate-400 mt-0.5">Update login credentials</p>
                            </div>
                        </button>
                    </div>

                    <div className="border-t border-slate-100 pt-6 flex justify-end">
                        <button
                            type="submit"
                            className="w-full sm:w-auto bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2"
                        >
                            <FontAwesomeIcon icon={faSave} />
                            <span>Save Profile</span>
                        </button>
                    </div>
                </form>
            </div>
            <DocumentsModal isOpen={showDocsModal} onClose={() => setShowDocsModal(false)} />
            <ChangePasswordModal isOpen={showPassModal} onClose={() => setShowPassModal(false)} />
        </div>
    );
}