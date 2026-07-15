import React from 'react';

export default function RoomPreviewModal({ isOpen, onClose, roomId }) {
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
                    <h3 className="text-lg font-bold m-0 text-slate-800">Room {roomId} Interior Preview</h3>
                    <button 
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 font-bold bg-transparent border-0 cursor-pointer text-base"
                    >✕</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4 flex-grow">
                    {/*Placeholder container block rendering mock layout views dynamically*/}
                    <div className="bg-slate-100 rounded-xl p-6 border border-slate-200 text-center select-none font-medium text-sm text-slate-500 min-h-[260px] flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mb-3">
                            <span className="text-xl font-black">{roomId}</span>
                        </div>
                        <p className="m-0 font-bold text-slate-700 mb-1">Interior Image Placeholder</p>
                        <p className="m-0 text-xs text-slate-400 max-w-xs leading-relaxed">
                            Full 3D digital render configurations and high-resolution unit tour image galleries will hook directly here on backend integration sprints.
                        </p>
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