import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

export default function ChangePasswordModal({ isOpen, onClose }) {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPass, setShowNewPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);

    if (!isOpen) return null;

    const handlePasswordSave = (e) => {
        e.preventDefault();
        alert("Password updated locally inside mockup state variables.");
        setNewPassword('');
        setConfirmPassword('');
        onClose();
    };

    return (
        <div 
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
        >
            <div 
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden text-left"
            >
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold m-0 text-slate-800">Change Password</h3>
                    <button 
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 font-bold bg-transparent border-0 cursor-pointer text-base"
                    >✕</button>
                </div>

                <form onSubmit={handlePasswordSave} className="p-6 space-y-4 m-0">
                    <div className="flex flex-col space-y-1.5">
                        <label className="text-xs font-bold text-slate-700">New Password</label>
                        <div className="relative">
                            <input
                                type={showNewPass ? "text" : "password"}
                                placeholder="••••••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm pr-12"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPass(!showNewPass)}
                                className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"
                            >
                                <FontAwesomeIcon icon={showNewPass ? faEyeSlash : faEye} />
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-col space-y-1.5">
                        <label className="text-xs font-bold text-slate-700">Confirm Password</label>
                        <div className="relative">
                            <input
                                type={showConfirmPass ? "text" : "password"}
                                placeholder="••••••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm pr-12"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPass(!showConfirmPass)}
                                className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"
                            >
                                <FontAwesomeIcon icon={showConfirmPass ? faEyeSlash : faEye} />
                            </button>
                        </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                        <button
                            type="submit"
                            className="bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold px-6 py-2.5 rounded-xl text-sm border-0 cursor-pointer transition-colors shadow-sm"
                        >
                            Update Password
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}