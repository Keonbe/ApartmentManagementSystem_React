import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';

export default function SuccessModal({ isOpen, onClose, message = "Successfully completed" }) {
    if (!isOpen) return null;

    return (
        <div 
            onClick={onClose} //{/*ClosesModalWhenClickingDarkOverlay*/}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in"
        >
            <style>
                {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
          .modal-ams-logo {
            font-family: 'Playfair Display', Georgia, serif !important;
          }
        `}
            </style>

            <div 
                onClick={(e) => e.stopPropagation()} //{/*PreventsModalCloseWhenClickingInnerCard*/}
                className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative flex flex-col items-center space-y-5 border border-slate-100"
            >
                {/*AnimatedSuccessCheckBadge*/}
                <div className="relative flex items-center justify-center">
                    <div className="absolute w-16 h-16 rounded-full bg-emerald-100 animate-ping opacity-75"></div>
                    <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 z-10">
                        <FontAwesomeIcon icon={faCheck} className="text-2xl" />
                    </div>
                </div>

                {/*BrandHeader*/}
                <div
                    className="modal-ams-logo text-3xl italic font-bold tracking-wider select-none uppercase m-0"
                    style={{ color: '#3b4276' }}
                >
                    AMS
                </div>

                {/*StatusMessageBody*/}
                <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-800 m-0 leading-snug">
                        {message}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium m-0">
                        Your request has been recorded in the system.
                    </p>
                </div>

                {/*CloseActionButton*/}
                <button
                    onClick={onClose}
                    className="w-full bg-[#6366f1] hover:bg-[#4f46e5] active:scale-[0.98] text-white font-bold py-3 rounded-xl text-sm transition-all duration-200 shadow-md hover:shadow-indigo-200 border-0 cursor-pointer"
                >
                    Continue
                </button>
            </div>
        </div>
    );
}