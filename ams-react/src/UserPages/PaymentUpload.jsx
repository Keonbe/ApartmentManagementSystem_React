import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCloudUploadAlt, faHourglassHalf, faCheckCircle, faTimesCircle } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import ApartmentPic from '../assets/Apartment_Pic.png';

export default function PaymentUpload() {
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state || {};
    const { invoiceId, amount, paymentMethod, returnUrl } = state;

    const [senderName, setSenderName] = useState('');
    const [referenceNo, setReferenceNo] = useState('');
    const [proofImage, setProofImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    if (!invoiceId) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-slate-800">Invalid Payment Session</h2>
                    <button onClick={() => navigate('/home')} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-xl cursor-pointer border-0">Go Home</button>
                </div>
            </div>
        );
    }

    const mockAccountNo = paymentMethod === 'GCash' ? '0917-123-4567' : 'BDO - 0012 3456 7890';
    const mockAccountName = 'AMS Property Management';

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setProofImage(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!senderName || !referenceNo || !proofImage) {
            setError("Please fill out all fields and upload the payment proof.");
            return;
        }

        if (paymentMethod === 'GCash') {
            if (!/^\d{13}$/.test(referenceNo)) {
                setError("GCash Reference Number must be exactly 13 digits and contain only numbers.");
                return;
            }
        } else if (paymentMethod === 'Bank Transfer') {
            if (referenceNo.length > 55) {
                setError("Bank Transfer Reference Number must be 55 characters or less.");
                return;
            }
            if (/^\d+$/.test(referenceNo)) {
                setError("Bank Transfer Reference Number cannot consist of numbers only.");
                return;
            }
        }

        setUploading(true);
        setError('');

        const loggedInUserStr = sessionStorage.getItem("loggedInUser");
        const loggedInUser = loggedInUserStr ? JSON.parse(loggedInUserStr) : {};
        const userId = loggedInUser.id || '';

        const formData = new FormData();
        formData.append('userId', userId);
        formData.append('invoiceId', invoiceId);
        formData.append('paymentMethod', paymentMethod);
        formData.append('senderName', senderName);
        formData.append('referenceNo', referenceNo);
        formData.append('proofImage', proofImage);

        try {
            const res = await api.post("/upload_payment_proof.php", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                alert("Payment proof uploaded successfully! Our management will verify it shortly.");
                navigate(returnUrl || '/home');
            } else {
                setError(res.data.message || "Failed to upload payment proof.");
            }
        } catch (err) {
            console.error("Upload error:", err);
            setError("A network error occurred while uploading.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start py-10 px-4 md:px-12 box-border">
            <div className="absolute inset-0 z-0 hidden md:block">
                <img src={ApartmentPic} alt="Background" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/95 via-slate-900/90 to-slate-950/95"></div>
            </div>

            <div className="w-full max-w-2xl z-10 space-y-8 relative bg-white md:bg-slate-900/60 md:backdrop-blur-md rounded-3xl md:border md:border-white/10 md:shadow-2xl p-6 md:p-10 text-slate-800 md:text-white">
                <button onClick={() => navigate(returnUrl || '/home')} className="flex items-center space-x-2 text-indigo-600 md:text-indigo-400 hover:underline bg-transparent border-0 p-0 font-semibold cursor-pointer">
                    <FontAwesomeIcon icon={faArrowLeft} /> <span>Back</span>
                </button>

                <div>
                    <h1 className="text-3xl font-extrabold m-0">Upload Payment Proof</h1>
                    <p className="text-sm text-slate-500 md:text-slate-300 mt-2 m-0 leading-relaxed">
                        Complete your {paymentMethod} transaction by sending the amount to the details below and uploading the receipt.
                    </p>
                </div>

                {error && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-600 md:bg-rose-500/10 md:border-rose-500/20 md:text-rose-400 p-4 rounded-xl flex items-center gap-3 text-sm font-semibold">
                        <FontAwesomeIcon icon={faTimesCircle} /> {error}
                    </div>
                )}

                <div className="bg-slate-50 md:bg-white/5 border border-slate-200 md:border-white/10 rounded-2xl p-6 space-y-4 shadow-inner">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 md:text-slate-400">Total Amount Due</span>
                        <span className="text-2xl font-black text-indigo-600 md:text-indigo-400">₱{amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t border-slate-200 md:border-white/10 pt-4 mt-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 md:text-slate-400 block mb-3">{paymentMethod} Details</span>
                        <div className="flex flex-col gap-1.5 text-sm font-medium">
                            <span><strong className="text-slate-400 mr-2">Account Name:</strong> {mockAccountName}</span>
                            <span className="flex items-center"><strong className="text-slate-400 mr-2">Account No:</strong> <span className="text-lg font-black tracking-wider text-indigo-600 md:text-indigo-400">{mockAccountNo}</span></span>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-600 md:text-slate-400 uppercase tracking-wider block">Sender Name</label>
                            <input 
                                type="text" 
                                value={senderName} 
                                onChange={e => setSenderName(e.target.value)} 
                                required
                                className="w-full bg-slate-50 md:bg-white/5 border border-slate-200 md:border-white/10 rounded-xl px-4 py-3 text-sm outline-none text-slate-800 md:text-white focus:border-indigo-500 transition-colors box-border shadow-sm"
                                placeholder="E.g. Juan Dela Cruz"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-600 md:text-slate-400 uppercase tracking-wider block">Reference No.</label>
                            <input 
                                type="text" 
                                value={referenceNo} 
                                onChange={e => setReferenceNo(e.target.value)} 
                                required
                                className="w-full bg-slate-50 md:bg-white/5 border border-slate-200 md:border-white/10 rounded-xl px-4 py-3 text-sm outline-none text-slate-800 md:text-white focus:border-indigo-500 transition-colors box-border shadow-sm"
                                placeholder={paymentMethod === 'GCash' ? "13-digit Reference No." : "Alphanumeric reference (max 55 chars)"}
                            />
                            <p className="text-[10px] text-slate-400 m-0 leading-relaxed mt-1 font-medium">
                                {paymentMethod === 'GCash' 
                                    ? "GCash reference numbers must be exactly 13 digits (numbers only)." 
                                    : "Bank transfer reference numbers can be up to 55 characters and cannot consist of numbers only."}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-600 md:text-slate-400 uppercase tracking-wider block">Upload Receipt Image</label>
                        <div className="relative border-2 border-dashed border-slate-300 md:border-white/20 rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50 md:bg-white/5 hover:border-indigo-500 transition-colors overflow-hidden group cursor-pointer shadow-inner">
                            <input 
                                type="file" 
                                accept="image/jpeg,image/png,image/jpg" 
                                onChange={handleImageChange}
                                required
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                            />
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover z-10" />
                            ) : (
                                <>
                                    <FontAwesomeIcon icon={faCloudUploadAlt} className="text-4xl text-indigo-500 md:text-indigo-400 mb-3 group-hover:scale-110 transition-transform" />
                                    <p className="text-sm font-semibold text-slate-600 md:text-slate-300 m-0">Click to upload or drag & drop</p>
                                    <p className="text-xs text-slate-500 md:text-slate-400 mt-1 m-0 font-medium">JPG, JPEG, PNG (Max 5MB)</p>
                                </>
                            )}
                            {previewUrl && (
                                <div className="absolute inset-0 bg-black/60 z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                    <FontAwesomeIcon icon={faCloudUploadAlt} className="text-3xl text-white mb-2" />
                                    <span className="text-white font-bold text-sm">Change Image</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="submit" 
                            disabled={uploading}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold py-4 rounded-xl text-sm transition-all shadow-lg border-0 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <><FontAwesomeIcon icon={faHourglassHalf} className="animate-spin" /> <span>Submitting...</span></>
                            ) : (
                                <><FontAwesomeIcon icon={faCheckCircle} /> <span>Submit Payment Proof</span></>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
