import React, { useState, useEffect } from 'react';
import api from '../api/axiosConfig';

export default function DocumentsModal({ isOpen, onClose }) {
    const [documentList, setDocumentList] = useState([]);
    const [activeView, setActiveView] = useState(null);{/*Tracks which file format layout is shown*/}
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!isOpen) return;

        const fetchUserDocuments = async () => {
            setLoading(true);
            setErrorMsg('');
            
            const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
            if (!loggedInUser || !loggedInUser.email_address) {
                setErrorMsg("User session expired. Please log in again.");
                setLoading(false);
                return;
            }

            try {
                const res = await api.post('/get_documents.php', {
                    email_address: loggedInUser.email_address
                });

                if (res.data.success) {
                    setDocumentList(res.data.documents);
                } else {
                    setErrorMsg(res.data.message || "Failed to query document records.");
                }
            } catch (error) {
                console.error("Error downloading document entries:", error);
                setErrorMsg("Unable to download document details. Network error.");
            } finally {
                setLoading(false);
            }
        };

        fetchUserDocuments();
    }, [isOpen]);

    if (!isOpen) return null;

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
                    {loading && (
                        <p className="text-center text-sm font-semibold text-slate-400 m-0 py-8 animate-pulse">
                            Loading secure verification file paths...
                        </p>
                    )}

                    {errorMsg && !loading && (
                        <p className="text-center text-sm font-semibold text-red-500 m-0 py-8">
                            {errorMsg}
                        </p>
                    )}

                    {!loading && !errorMsg && (
                        <>
                            {activeView ? (
                                <div className="space-y-4">
                                    <button 
                                        onClick={() => setActiveView(null)}
                                        className="text-xs font-bold text-indigo-600 hover:underline bg-transparent border-0 p-0 cursor-pointer"
                                    >
                                        &larr; Back to Documents List
                                    </button>
                                    <div className="bg-slate-100 rounded-xl p-4 border border-slate-200 text-center select-none font-medium text-sm text-slate-500 min-h-[240px] flex flex-col items-center justify-center">
                                        <p className="m-0 font-bold text-slate-700 mb-1">{activeView.fileName}</p>
                                        <p className="m-0 text-xs text-slate-400 mb-4">File Source Link: {activeView.url}</p>
                                        <a
                                            href={`${api.defaults.baseURL.replace(/\/api\/?$/, '')}/${activeView.url.replace(/^\.\.\//, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-sm no-underline inline-block"
                                        >
                                            Open File Content
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {documentList.map((doc) => (
                                        <div key={doc.key} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                                            <div className="min-w-0 pr-4">
                                                <p className="m-0 text-sm font-bold text-slate-800 truncate">{doc.name}</p>
                                                <p className="m-0 text-xs text-slate-400 mt-0.5 truncate">{doc.fileName}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setActiveView(doc)}
                                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold px-4 py-2 rounded-xl transition-colors border-0 cursor-pointer flex-shrink-0"
                                            >
                                                View Document
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}