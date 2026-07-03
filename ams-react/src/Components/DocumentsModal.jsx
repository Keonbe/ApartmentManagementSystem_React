import React, { useState } from 'react';

export default function DocumentsModal({ isOpen, onClose }) {
    const [activeView, setActiveView] = useState(null);//Tracks which file format layout is shown

    if (!isOpen) return null;

    const documentList = [
        { key: 'valid_id', name: 'Valid Government Issued ID', fileName: 'Dela_Cruz_VALID_ID.png' },
        { key: 'nbi', name: 'National Bureau of Investigation (NBI) Clearance', fileName: 'Dela_Cruz_NBI_CLEARANCE.pdf' }
    ];

    return (
        <div 
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
        >
            <div 
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden text-left"
            >
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold m-0 text-slate-800">Verification Documents Log</h3>
                    <button 
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 font-bold bg-transparent border-0 cursor-pointer text-base"
                    >✕</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4 flex-grow">
                    {activeView ? (
                        <div className="space-y-4">
                            <button 
                                onClick={() => setActiveView(null)}
                                className="text-xs font-bold text-indigo-600 hover:underline bg-transparent border-0 p-0 cursor-pointer"
                            >
                                ← Back to Documents List
                            </button>
                            <div className="bg-slate-100 rounded-xl p-4 border border-slate-200 text-center select-none font-medium text-sm text-slate-500 min-h-[240px] flex flex-col items-center justify-center">
                                <p className="m-0 font-bold text-slate-700 mb-1">{activeView.fileName}</p>
                                <p className="m-0 text-xs text-slate-400">Mock Document File Render Workspace Area Placeholder</p>
                            </div>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {documentList.map((doc) => (
                                <div key={doc.key} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                                    <div>
                                        <p className="m-0 text-sm font-bold text-slate-800">{doc.name}</p>
                                        <p className="m-0 text-xs text-slate-400 mt-0.5">{doc.fileName}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setActiveView(doc)}
                                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold px-4 py-2 rounded-xl transition-colors border-0 cursor-pointer"
                                    >
                                        View Document
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}