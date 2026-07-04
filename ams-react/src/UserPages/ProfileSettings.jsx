import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserCircle, faFileAlt, faKey, faSave } from '@fortawesome/free-solid-svg-icons';
import DocumentsModal from '../Components/DocumentsModal';
import ChangePasswordModal from '../Components/ChangePasswordModal';

export default function ProfileSettings() {
    const [firstName, setFirstName] = useState('Juan');
    const [lastName, setLastName] = useState('Dela Cruz');
    const [suffix, setSuffix] = useState('Jr');
    const [contactNo, setContactNo] = useState('0999 676 6967');
    const [email, setEmail] = useState('JDelaCruz12@gmail.com');
    const [gender, setGender] = useState('Male');

    //Modal layout state controls
    const [showDocsModal, setShowDocsModal] = useState(false);
    const [showPassModal, setShowPassModal] = useState(false);

    const handleFormSubmit = (e) => {
        e.preventDefault();
        alert("Personal profile changes saved successfully inside local mockup states.");
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">

                {/*Top Header Row containing sized up Avatar placement*/}
                <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
                    <div>
                        <h1
                            className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                            style={{ color: '#3b4276' }}
                        >
                            Profile Settings
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 m-0">
                            Review and maintain your master identity records configuration details below.
                        </p>
                    </div>
                    
                    {/*Sized Up Profile Avatar Container*/}
                    <div className="w-24 h-24 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 shrink-0 select-none pointer-events-none">
                        <FontAwesomeIcon icon={faUserCircle} className="text-6xl" />
                    </div>
                </div>

                {/*Form Container Card Panel Layout*/}
                <form className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-10 space-y-8" onSubmit={handleFormSubmit}>

                    {/*SECTION 1: PERSONAL PROFILE MASTER GRID FIELDS*/}
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
                                <input
                                    type="text"
                                    value={contactNo}
                                    onChange={(e) => setContactNo(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                    required
                                />
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
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/*SECTION 2: MODAL CONTROL UTILITY ACCESS LINKS GRIDS*/}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowDocsModal(true)}
                            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl p-4 text-left flex items-center space-x-4 cursor-pointer transition-all duration-150 shadow-sm"
                        >
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <FontAwesomeIcon icon={faFileAlt} className="text-base" />
                            </div>
                            <div>
                                <p className="m-0 text-sm font-bold text-slate-800">Verification Documents</p>
                                <p className="m-0 text-xs text-slate-400 mt-0.5">Manage Valid ID & NBI Clearance attachments</p>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowPassModal(true)}
                            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl p-4 text-left flex items-center space-x-4 cursor-pointer transition-all duration-150 shadow-sm"
                        >
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <FontAwesomeIcon icon={faKey} className="text-base" />
                            </div>
                            <div>
                                <p className="m-0 text-sm font-bold text-slate-800">Account Security</p>
                                <p className="m-0 text-xs text-slate-400 mt-0.5">Update account login security credentials</p>
                            </div>
                        </button>
                    </div>

                    {/*Form Actions Save Trigger Action Footer Container*/}
                    <div className="border-t border-slate-100 pt-6 flex justify-end">
                        <button
                            type="submit"
                            className="w-full sm:w-auto bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-[1.03] active:scale-[0.97] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2"
                        >
                            <FontAwesomeIcon icon={faSave} />
                            <span>Save Profile</span>
                        </button>
                    </div>

                </form>
            </div>

            {/*Imported Overlay Modal Containers Layers*/}
            <DocumentsModal isOpen={showDocsModal} onClose={() => setShowDocsModal(false)} />
            <ChangePasswordModal isOpen={showPassModal} onClose={() => setShowPassModal(false)} />
        </div>
    );
}