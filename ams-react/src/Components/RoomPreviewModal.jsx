import { useEffect, useState } from 'react';
import { publicAssetUrl } from '../api/fileUrl';

// The admin chooses which view the public preview shows (Settings → Lease Policy):
// real per-room showcase photos, or the generic 2D floor plan fallback for
// rooms without any uploaded images. There is no 360° view — no panorama
// images exist. mode/images are resolved once by the caller (Preview.jsx)
// so this modal doesn't need its own settings fetch.
export default function RoomPreviewModal({ isOpen, onClose, roomId, mode, images = [] }) {
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        if (isOpen) setActiveIndex(0);
    }, [isOpen, roomId]);

    if (!isOpen) return null;

    const showImages = mode === 'images' && images.length > 0;

    return (
        <div 
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in modal-overlay-anim"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="modal-card-anim sheet-mobile bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden text-left"
            >
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold m-0 text-slate-800">Room {roomId} Preview</h3>
                    <button 
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 font-bold bg-transparent border-0 cursor-pointer text-base"
                    >✕</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 flex-grow">
                    <div className="grid grid-cols-1 gap-6">
                        {!mode && (
                            <div className="h-80 flex items-center justify-center text-sm text-slate-400">Loading preview…</div>
                        )}

                        {showImages && (
                        <div className="flex flex-col space-y-3">
                            <h4 className="text-sm font-bold text-slate-700 m-0">Showcase Photos</h4>
                            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-80 flex items-center justify-center">
                                <img
                                    src={publicAssetUrl(images[activeIndex])}
                                    alt={`Room ${roomId} — photo ${activeIndex + 1}`}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-md backdrop-blur-sm font-semibold">
                                    Interior View ({activeIndex + 1} of {images.length})
                                </div>
                            </div>
                            {images.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {images.map((img, idx) => (
                                        <button
                                            key={img}
                                            type="button"
                                            onClick={() => setActiveIndex(idx)}
                                            className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 cursor-pointer p-0 ${idx === activeIndex ? 'border-indigo-500' : 'border-transparent hover:border-slate-300'}`}
                                        >
                                            <img src={publicAssetUrl(img)} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        )}

                        {mode === 'floor_plan' && (
                        <div className="flex flex-col space-y-2">
                            <h4 className="text-sm font-bold text-slate-700 m-0">2D Floor Plan Layout</h4>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 h-80 p-4 flex flex-col items-center justify-center relative overflow-hidden">
                                {/* Vector SVG Blueprint mockup */}
                                <svg className="w-full h-56 text-slate-300" viewBox="0 0 200 120" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    {/* Main walls */}
                                    <rect x="10" y="10" width="180" height="100" rx="4" strokeWidth="2.5" />
                                    {/* Bathroom */}
                                    <rect x="10" y="10" width="55" height="50" />
                                    <circle cx="25" cy="25" r="8" strokeDasharray="3,3" /> {/* Toilet */}
                                    <rect x="40" y="35" width="20" height="20" rx="2" /> {/* Sink */}
                                    {/* Kitchenette */}
                                    <rect x="10" y="80" width="60" height="30" />
                                    <circle cx="25" cy="95" r="6" /> {/* Stove */}
                                    <circle cx="45" cy="95" r="6" />
                                    {/* Bed Area */}
                                    <rect x="120" y="10" width="70" height="60" rx="3" strokeDasharray="4,2" />
                                    <rect x="135" y="10" width="40" height="15" rx="1" /> {/* Pillows */}
                                    {/* Door Swing */}
                                    <path d="M 120,110 A 30,30 0 0,1 90,80 L 90,110 Z" fill="rgba(99, 102, 241, 0.05)" stroke="#6366f1" strokeWidth="1" />
                                    {/* Text Annotations */}
                                    <text x="37" y="32" fill="#94a3b8" fontSize="6" textAnchor="middle" stroke="none">Bath</text>
                                    <text x="40" y="100" fill="#94a3b8" fontSize="6" textAnchor="middle" stroke="none">Kitchen</text>
                                    <text x="155" y="45" fill="#94a3b8" fontSize="7" textAnchor="middle" stroke="none" fontWeight="bold">Studio Space</text>
                                    <text x="100" y="115" fill="#6366f1" fontSize="6" textAnchor="middle" stroke="none" fontWeight="bold">ENTRANCE</text>
                                </svg>
                                
                                <div className="absolute bottom-3 right-3 bg-indigo-50 text-indigo-700 text-[10px] px-2.5 py-1 rounded-md font-semibold border border-indigo-100">
                                    Standard 2D Layout
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2 rounded-xl text-xs border-0 cursor-pointer transition-colors shadow-sm"
                    >
                        Close Preview
                    </button>
                </div>
            </div>
        </div>
    );
}