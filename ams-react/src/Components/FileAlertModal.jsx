import { AlertCircle } from 'lucide-react';

/**
 * Reusable modal alert dialog for file upload errors (e.g. file size exceeded or wrong format).
 * Matches the Notice modal style in RentApplication.
 */
export default function FileAlertModal({ isOpen, message, onClose, title = 'Notice' }) {
    if (!isOpen && !message) return null;
    const text = message || '';

    return (
        <div 
            onClick={onClose} 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
        >
            <div 
                onClick={(e) => e.stopPropagation()} 
                role="alertdialog" 
                aria-modal="true" 
                aria-labelledby="file-alert-title" 
                aria-describedby="file-alert-text" 
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm flex flex-col p-8 text-center animate-scale-in border-4 border-rose-100"
            >
                <div className="w-20 h-20 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-5">
                    <AlertCircle className="w-10 h-10" />
                </div>
                <h3 id="file-alert-title" className="text-2xl font-black text-slate-900 m-0 mb-3">{title}</h3>
                <p id="file-alert-text" className="text-slate-600 text-sm font-medium m-0 mb-8 leading-relaxed px-2">{text}</p>
                <button 
                    type="button" 
                    autoFocus 
                    onClick={onClose} 
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-sm transition-colors cursor-pointer shadow-md border-0"
                >
                    I Understand
                </button>
            </div>
        </div>
    );
}

