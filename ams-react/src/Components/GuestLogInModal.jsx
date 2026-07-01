import React from 'react';

export default function GuestLogInModal({ isOpen, onClose, onLoginRedirect }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            {/*Font Loader Override*/}
            <style>
                {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
          .modal-ams-logo {
            font-family: 'Playfair Display', Georgia, serif !important;
          }
        `}
            </style>

            <div className="bg-slate-100 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-white/20 relative">

                {/*Close Button*/}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold transition-colors bg-transparent border-0 cursor-pointer"
                >
                    ✕
                </button>

                {/*Brand Header - Fixed to match the exact font and dark blue shade (#3b4276)*/}
                <div
                    className="modal-ams-logo text-5xl italic font-bold tracking-wider mb-6 select-none uppercase"
                    style={{ color: '#3b4276' }}
                >
                    AMS
                </div>

                <h3 className="text-xl font-semibold text-slate-800 mb-6 px-4 leading-relaxed">
                    Log in to proceed with your desired rent.
                </h3>

                <button
                    onClick={onLoginRedirect}
                    className="w-full bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-[1.02] active:scale-[0.98] text-white font-medium py-3 rounded-xl shadow-lg shadow-indigo-200 transition-all duration-200 text-base border-0 cursor-pointer"
                >
                    Login
                </button>
            </div>
        </div>
    );
}   