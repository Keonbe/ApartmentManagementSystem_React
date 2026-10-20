import { useState, useEffect } from 'react';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { apiErrorMessage } from '../utils/apiError';

// The documents on the signed-in tenant's latest application
// (Settings → Application Requirements decides which ones are asked for).
export default function DocumentsModal({ isOpen, onClose }) {
    const [data, setData] = useState({ documents: [], missing: [], verifiedAt: null });
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setErrorMsg('');
            try {
                const res = await api.get('/get_documents.php');
                if (cancelled) return;
                if (res.data.success) {
                    setData({
                        documents: res.data.documents || [],
                        missing: res.data.missing_documents || [],
                        verifiedAt: res.data.documents_verified_at || null,
                    });
                } else {
                    setErrorMsg(res.data.message || 'No application documents found.');
                }
            } catch (error) {
                if (!cancelled) setErrorMsg(apiErrorMessage(error, 'Unable to load your documents. Please try again.'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in modal-overlay-anim"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="documents-modal-title"
                className="modal-card-anim sheet-mobile bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden text-left"
            >
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 id="documents-modal-title" className="text-lg font-bold m-0 text-slate-800">Verification Documents</h3>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 font-bold bg-transparent border-0 cursor-pointer text-base"
                    >✕</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4 grow">
                    {loading && (
                        <p className="text-center text-sm font-semibold text-slate-400 m-0 py-8 animate-pulse">Loading your documents…</p>
                    )}

                    {errorMsg && !loading && (
                        <p className="text-center text-sm font-semibold text-red-500 m-0 py-8">{errorMsg}</p>
                    )}

                    {!loading && !errorMsg && (
                        <>
                            {data.verifiedAt && data.documents.length === 0 && (
                                <p className="m-0 text-sm text-emerald-700 font-semibold">Your documents were checked in person by the office.</p>
                            )}
                            {data.documents.length === 0 && data.missing.length === 0 && !data.verifiedAt && (
                                <p className="m-0 text-sm text-slate-500">No documents on file.</p>
                            )}
                            <div className="divide-y divide-slate-100">
                                {data.documents.map((doc) => (
                                    <div key={doc.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                                        <div className="min-w-0 pr-4">
                                            <p className="m-0 text-sm font-bold text-slate-800 truncate">{doc.label}</p>
                                            <p className="m-0 text-xs text-slate-400 mt-0.5 truncate">Uploaded {String(doc.uploaded_at || '').slice(0, 10)}</p>
                                        </div>
                                        <a
                                            href={fileUrl(doc.file_path)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold px-4 py-2 rounded-xl transition-colors no-underline shrink-0"
                                        >
                                            View Document
                                        </a>
                                    </div>
                                ))}
                                {!data.verifiedAt && data.missing.map((label) => (
                                    <div key={`missing-${label}`} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                                        <p className="m-0 text-sm font-bold text-slate-400 truncate">{label}</p>
                                        <span className="text-[10px] font-bold uppercase text-rose-500">Missing</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
