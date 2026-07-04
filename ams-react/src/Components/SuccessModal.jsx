import React from 'react';

export default function SuccessModal({ isOpen, onClose, message = "Successfully completed" }) {
    if (!isOpen) return null;

    return (
        <div 
            onClick={onClose} // Closes modal when clicking the dark background overlay
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
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
                onClick={(e) => e.stopPropagation()} // Prevents closing when clicking inside the modal box
                className="bg-slate-200 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl relative flex flex-col items-center space-y-4"
            >
                
                {/*Brand Header*/}
                <div
                    className="modal-ams-logo text-5xl italic font-bold tracking-wider mb-2 select-none uppercase"
                    style={{ color: '#3b4276' }}
                >
                    AMS
                </div>

                <h3 className="text-xl font-medium text-slate-700 m-0">
                    {message}
                </h3>

                <button
                    onClick={onClose}
                    className="bg-[#5c6bc0] hover:bg-[#4f5bba] text-white font-semibold px-8 py-2.5 rounded-xl text-sm tracking-wide shadow-md border-0 cursor-pointer transition-colors"
                >
                    Close
                </button>
            </div>
        </div>
    );
}