import React from "react";

export default function GuestLogInModal({ isOpen, onClose, onLoginRedirect }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-slate-100 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-white/20 relative">
                {/*Close Button*/}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold transition-colors"
                >
                    ✕
                </button>

                {/*Brand Header*/}
                <div className="text-[#0091ff] font-serif text-4xl italic font-black tracking-wider mb-6 select-none">
                    AMS
                </div>

                <h3 className="text-xl font-semibold text-slate-800 mb-6 px-4 leading-relaxed">
                    Log in to proceed with your desired rent.
                </h3>

                <button
                    onClick={onLoginRedirect}
                    className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium py-3 rounded-xl shadow-lg shadow-indigo-200 transition-all text-base"
                >
                    Login
                </button>
            </div>
        </div>
    );
}
