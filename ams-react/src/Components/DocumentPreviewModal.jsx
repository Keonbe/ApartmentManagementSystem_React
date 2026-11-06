import { FileText, Image as ImageIcon, X } from 'lucide-react';
import Modal from './admin/Modal';

/**
 * Reusable modal dialog for document and image previews (PDFs, images).
 * Matches the document preview modal in RentApplication.
 */
// z: stacking order when opened over another non-Modal dialog (e.g. DocumentsModal).
export default function DocumentPreviewModal({ isOpen, onClose, title = 'Document Preview', fileUrl, isImage, z }) {
    if (!isOpen || !fileUrl) return null;

    const isImg = typeof isImage === 'boolean'
        ? isImage
        : /\.(png|jpe?g|webp|gif)$/i.test(fileUrl) || fileUrl.startsWith('data:image/');

    return (
        <Modal title={`${title}`} onClose={onClose} z={z} overlayClassName="flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in" className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-scale-in text-left">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0">
                    <h3 className="text-lg font-black text-slate-900 m-0 flex items-center gap-2 truncate pr-2">
                        {isImg ? (
                            <ImageIcon className="text-indigo-500 w-5 h-5 shrink-0" />
                        ) : (
                            <FileText className="text-rose-500 w-5 h-5 shrink-0" />
                        )}
                        <span className="truncate">{title}</span>
                    </h3>
                    <button 
                        type="button" 
                        aria-label="Close preview" 
                        onClick={onClose} 
                        className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors border-0 shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 w-full bg-slate-100 p-4 flex items-center justify-center overflow-auto relative">
                    {isImg ? (
                        <img 
                            src={fileUrl} 
                            alt={title} 
                            className="max-w-full max-h-full object-contain rounded-xl shadow-md border border-slate-200 bg-white" 
                        />
                    ) : (
                        <iframe 
                            src={fileUrl} 
                            title={title} 
                            className="w-full h-full border-0 rounded-xl bg-white shadow-inner"
                        />
                    )}
                </div>
            </Modal>
    );
}

