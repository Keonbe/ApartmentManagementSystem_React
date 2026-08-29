import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faHourglassHalf, faCheckCircle, faTimesCircle, faArrowRight, faFileInvoiceDollar, 
    faHome, faCalendarAlt, faUsers, faInfoCircle, faArrowLeft,
    faWallet, faUniversity, faMoneyBillWave, faCheck, faFileContract, faUpload, faLock
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import ApartmentPic from '../assets/Apartment_Pic.png';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/track-application.responsive.css';

export default function TrackApplication() {
    const navigate = useNavigate();
    const { t } = useLang();
    const [loading, setLoading] = useState(true);
    const [application, setApplication] = useState(null);
    const [error, setError] = useState(null);
    const [paymentChannels, setPaymentChannels] = useState([]);
    const [selectedMethod, setSelectedMethod] = useState('');
    const [paying, setPaying] = useState(false);
    const [contractFile, setContractFile] = useState(null);
    const [uploadingContract, setUploadingContract] = useState(false);

    const validateAndSetContractFile = (file) => {
        if (!file) return;
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            alert("The selected file is too large. The maximum limit is 5MB.");
            return;
        }
        const isPdfType = file.type === 'application/pdf';
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const isPdfExt = fileExtension === 'pdf';
        
        if (!isPdfType && !isPdfExt) {
            alert("Invalid file format. Only PDF files are allowed.");
            return;
        }
        setContractFile(file);
    };

    const handleContractUpload = async (e) => {
        e.preventDefault();
        if (!contractFile) {
            alert("Please select a signed contract file to upload.");
            return;
        }
        setUploadingContract(true);
        try {
            const formData = new FormData();
            formData.append('file', contractFile);
            formData.append('rentApplicationId', application.id);
            formData.append('docType', 'signedLease');

            const res = await api.post('/upload_lease_document.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                alert("Signed lease contract uploaded successfully! You may now proceed to initial payment.");
                setApplication(prev => ({
                    ...prev,
                    signed_lease_path: res.data.filePath,
                    contract_id: res.data.contractId
                }));
                setContractFile(null);
            } else {
                alert(res.data.message || "Failed to upload contract.");
            }
        } catch (err) {
            console.error("Contract upload error:", err);
            alert("Failed to upload contract. Please try again.");
        } finally {
            setUploadingContract(false);
        }
    };

    const handleInitialPayment = async (e) => {
        e.preventDefault();
        if (!application?.signed_lease_path) {
            alert("Please upload your signed lease contract before proceeding to payment.");
            return;
        }
        if (!application?.pending_invoice_id) {
            alert("No pending invoice found.");
            return;
        }

        const currentMethodObj = paymentChannels.find(m => m.id === selectedMethod) || paymentChannels[0] || {};
        const totalAmount = parseFloat(application.pending_total_amount || (2 * parseFloat(application.monthly_rent || 0)));

        if (currentMethodObj.family === 'sandbox') {
            try {
                const returnBase = `${window.location.origin}${window.location.pathname}`;
                const res = await api.post("/create_checkout_session.php", {
                    invoice_id: application.pending_invoice_id,
                    channel: currentMethodObj.id,
                    success_url: `${returnBase}#/track-application?status=success&invoice_id=${encodeURIComponent(application.pending_invoice_id)}`,
                    cancel_url: `${returnBase}#/track-application?status=cancelled`
                });
                
                if (res.data.success && res.data.checkout_url) {
                    window.location.href = res.data.checkout_url;
                } else {
                    alert(res.data.message || "Failed to create checkout session.");
                }
            } catch (error) {
                console.error("Error creating checkout session:", error);
                const msg = error?.response?.data?.message || "Payment gateway error.";
                alert(msg);
            }
            return;
        }

        if (currentMethodObj.family !== 'in_person') {
            navigate('/upload-payment', { 
                state: { 
                    invoiceId: application.pending_invoice_id, 
                    amount: totalAmount, 
                    paymentMethod: currentMethodObj.label,
                    returnUrl: '/track-application'
                } 
            });
            return;
        }

        setPaying(true);
        try {
            const res = await api.post("/pay_bill.php", {
                invoiceId: application.pending_invoice_id,
                paymentMethod: currentMethodObj.label
            });

            if (res.data.success) {
                alert("Cash payment method selected successfully. Please proceed to the management office to settle your payment. Your room details will be unlocked once management confirms receipt of the payment.");
                window.location.reload();
            } else {
                alert(res.data.message || "Failed to process payment.");
            }
        } catch (error) {
            console.error("Error submitting initial payment:", error);
            alert("Payment failed. Please try again.");
        } finally {
            setPaying(false);
        }
    };

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
    const activeEmail = loggedInUser.email_address || '';

    useEffect(() => {
        const fetchApplicationStatus = async () => {
            if (!activeEmail) {
                setError("Please log in to track your application.");
                setLoading(false);
                return;
            }
            try {
                // Call my_room.php which returns the user's latest rent application status
                const res = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);
                if (res.data.success && res.data.data) {
                    setApplication(res.data.data);
                } else {
                    // success false indicates no application exists
                    setApplication(null);
                }
            } catch (err) {
                console.error("Failed to fetch application status:", err);
                setError("Unable to connect to the server. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        const fetchChannels = async () => {
            try {
                const res = await api.get('/get_payment_channels.php');
                if (res.data.success && res.data.channels) {
                    const mapped = res.data.channels.map(ch => {
                        let icon, color, isDigital;
                        if (ch.icon === 'gcash') { icon = faWallet; color = 'text-blue-600'; isDigital = true; }
                        else if (ch.icon === 'bank') { icon = faUniversity; color = 'text-indigo-600'; isDigital = true; }
                        else if (ch.icon === 'qr') { icon = faMoneyBillWave; color = 'text-blue-500'; isDigital = true; }
                        else if (ch.icon === 'maya') { icon = faWallet; color = 'text-emerald-500'; isDigital = true; }
                        else { icon = faMoneyBillWave; color = 'text-emerald-600'; isDigital = false; }
                        
                        return { ...ch, icon, color, isDigital };
                    });
                    setPaymentChannels(mapped);
                    if (mapped.length > 0) {
                        setSelectedMethod(mapped[0].id);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch payment channels:", error);
            }
        };
        fetchChannels();
        fetchApplicationStatus();

        const hash = window.location.hash;
        if (hash.includes('?')) {
            const queryParams = new URLSearchParams(hash.split('?')[1]);
            const status = queryParams.get('status');
            if (status === 'success') {
                setTimeout(() => {
                    alert("Payment successfully processed! Your initial payment status is now updating.");
                    navigate('/track-application', { replace: true });
                }, 500);
            } else if (status === 'cancelled') {
                setTimeout(() => {
                    alert("Payment was cancelled.");
                    navigate('/track-application', { replace: true });
                }, 500);
            }
        }
    }, [activeEmail, navigate]);

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-950 text-white">
                <div className="flex flex-col items-center space-y-4">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-4xl text-indigo-500 animate-spin" />
                    <h2 className="text-xl font-bold tracking-wide">Loading application details...</h2>
                </div>
            </div>
        );
    }

    // Determine status normalized representation
    const rawStatus = application?.status || '';
    let statusNormalized = 'none';
    let statusLabel = 'No Active Application';
    let statusColorClass = 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    
    if (rawStatus.toLowerCase() === 'pending review' || rawStatus.toLowerCase() === 'pending') {
        statusNormalized = 'pending';
        statusLabel = 'Pending Review';
        statusColorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    } else if (rawStatus.toLowerCase() === 'approved' || rawStatus.toLowerCase() === 'active') {
        statusNormalized = 'approved';
        statusLabel = 'Approved';
        statusColorClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    } else if (rawStatus.toLowerCase() === 'pending-move-out') {
        statusNormalized = 'pending-move-out';
        statusLabel = 'Move-Out Pending';
        statusColorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    } else if (rawStatus.toLowerCase() === 'moved-out') {
        statusNormalized = 'moved-out';
        statusLabel = 'Moved Out';
        statusColorClass = 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    } else if (rawStatus.toLowerCase() === 'rejected' || rawStatus.toLowerCase() === 'declined') {
        statusNormalized = 'rejected';
        statusLabel = 'Rejected';
        statusColorClass = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    }

    return (
        <div className="track-app-root w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start overflow-y-auto box-border py-10 px-4 md:px-12 text-left">
            {/* Background Image & Overlay */}
            <div className="absolute inset-0 z-0">
                <img
                    src={ApartmentPic}
                    alt="Apartment Background"
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/95 via-slate-900/85 to-slate-950/95"></div>
            </div>

            <div className="w-full max-w-4xl z-10 space-y-8 flex flex-col justify-start relative border-0 bg-transparent">
                
                {/* Back Link */}
                <button 
                    onClick={() => navigate('/home')}
                    className="flex items-center space-x-2 text-white/70 hover:text-white transition-all bg-transparent border-0 cursor-pointer self-start p-0 outline-none"
                >
                    <FontAwesomeIcon icon={faArrowLeft} />
                    <span className="text-sm font-bold">{t('trackApp.backHome')}</span>
                </button>

                {/* Page Title */}
                <div className="track-app-header border-b border-white/10 pb-4">
                    <h1 className="text-4xl font-sans font-extrabold m-0 text-white tracking-tight select-none">
                        {t('trackApp.heading')}
                    </h1>
                    <p className="text-slate-300 text-sm mt-1.5 m-0 font-medium">
                        {t('trackApp.subtext')}
                    </p>
                </div>

                {error && (
                    <div className="bg-rose-500/15 border border-rose-500/30 rounded-2xl p-5 flex items-center space-x-3 text-rose-300 text-sm font-semibold">
                        <FontAwesomeIcon icon={faTimesCircle} className="text-rose-400 text-lg shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Application exists and has a valid status */}
                {application ? (
                    <div className="space-y-8">
                        {/* Status Summary Banner */}
                        <div className="track-app-status-banner bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-2">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${statusColorClass} select-none`}>
                                    <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse"></span>
                                    {statusLabel}
                                </span>
                                <h2 className="text-2xl font-bold text-white m-0">
                                    {statusNormalized === 'moved-out' 
                                        ? "Previous Tenancy Concluded" 
                                        : `Lease Application for ${application.room_name ? `Room ${application.room_name}` : "Studio Unit"}`}
                                </h2>
                                <p className="text-slate-400 text-xs m-0 font-medium pt-1">
                                    {statusNormalized === 'moved-out'
                                        ? "You have officially moved out of your previous room."
                                        : `Submitted on ${new Date(application.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
                                </p>
                            </div>

                            {statusNormalized === 'approved' && (
                                application.has_pending_first_payment ? (
                                    <div className="track-app-status-actions flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                        <button
                                            onClick={() => navigate('/view-contract')}
                                            className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold px-6 py-2.5 rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                                        >
                                            {t('trackApp.viewContract')}
                                        </button>
                                        <div className="flex items-center space-x-2 text-amber-400 text-xs bg-amber-500/10 px-4 py-2.5 rounded-xl border border-amber-500/20">
                                            <FontAwesomeIcon icon={faInfoCircle} className="text-amber-400 animate-pulse" />
                                            <span>
                                                {application.pending_invoice_status === 'pending-verification'
                                                    ? 'Verification Pending'
                                                    : 'Payment Pending'}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => navigate('/my-room')}
                                        className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold px-8 py-3 rounded-xl text-sm transition-all shadow-lg border-0 cursor-pointer flex items-center space-x-2"
                                    >
                                        <span>{t('trackApp.proceedRoom')}</span>
                                        <FontAwesomeIcon icon={faArrowRight} />
                                    </button>
                                )
                            )}

                            {statusNormalized === 'pending' && (
                                <div className="flex items-center space-x-2 text-slate-400 text-xs bg-white/5 px-4 py-2.5 rounded-xl border border-white/10">
                                    <FontAwesomeIcon icon={faInfoCircle} className="text-indigo-400 animate-pulse" />
                                    <span>Locked during review</span>
                                </div>
                            )}

                            {statusNormalized === 'pending-move-out' && (
                                <button
                                    onClick={() => navigate('/my-room')}
                                    className="bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-lg border-0 cursor-pointer flex items-center space-x-2"
                                >
                                    <span>View Move-Out Notice</span>
                                    <FontAwesomeIcon icon={faArrowRight} />
                                </button>
                            )}



                            {statusNormalized === 'rejected' && (
                                <button
                                    onClick={() => navigate('/rent-application', { state: { editApplication: application } })}
                                    className="bg-[#6366f1] hover:bg-[#4f46e5] active:scale-95 text-white font-bold px-8 py-3 rounded-xl text-sm transition-all shadow-lg border-0 cursor-pointer flex items-center space-x-2"
                                >
                                    <span>{t('trackApp.fixResubmit')}</span>
                                    <FontAwesomeIcon icon={faArrowRight} />
                                </button>
                            )}
                        </div>

                        {statusNormalized === 'rejected' && application.rejection_reason && (
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 md:p-8 shadow-2xl space-y-3">
                                <h3 className="text-lg font-bold text-rose-400 m-0 flex items-center gap-2">
                                    <FontAwesomeIcon icon={faTimesCircle} className="text-rose-400" />
                                    Reason for Rejection
                                </h3>
                                <p className="text-slate-300 text-sm m-0 leading-relaxed bg-rose-950/20 p-4 rounded-xl border border-rose-500/10 font-medium">
                                    {application.rejection_reason}
                                </p>
                            </div>
                        )}

                        {statusNormalized === 'moved-out' && (
                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-3xl p-6 md:p-8 shadow-2xl space-y-4 text-left">
                                <div className="flex items-center space-x-3 text-purple-300">
                                    <FontAwesomeIcon icon={faCheckCircle} className="text-2xl text-purple-400" />
                                    <h3 className="text-xl font-bold text-white m-0">Tenancy Concluded (Moved Out)</h3>
                                </div>
                                <p className="text-slate-300 text-sm m-0 leading-relaxed font-medium">
                                    Your tenancy for <strong>{application.room_name ? `Room ${application.room_name}` : "your rented unit"}</strong> has officially ended and room clearance is complete. You are currently not renting a unit, so you are eligible to submit a brand new rent application whenever you are ready!
                                </p>
                                <div className="pt-2">
                                    <button
                                        onClick={() => navigate('/preview')}
                                        className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold px-8 py-3 rounded-xl text-sm transition-all shadow-lg border-0 cursor-pointer inline-flex items-center space-x-2"
                                    >
                                        <span>Browse Available Rooms & Apply</span>
                                        <FontAwesomeIcon icon={faArrowRight} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {statusNormalized === 'approved' && application.has_pending_first_payment && (
                            <>
                                {/* Step 1: Lease Contract Verification & Upload */}
                                <div className="track-app-upload-box bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl space-y-4">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-white m-0 flex items-center gap-2">
                                                <FontAwesomeIcon icon={faFileContract} className="text-indigo-400" />
                                                {t('trackApp.step1')}
                                            </h3>
                                            <p className="text-slate-300 text-xs m-0 mt-1">
                                                Review your lease agreement, sign it, and upload the signed document below to unlock payment.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => navigate('/view-contract')}
                                            className="bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 font-semibold px-4 py-2.5 rounded-xl text-xs transition-all shrink-0 cursor-pointer flex items-center gap-2"
                                        >
                                            <FontAwesomeIcon icon={faFileContract} />
                                            <span>{t('trackApp.viewPrintContract')}</span>
                                        </button>
                                    </div>

                                    {application.signed_lease_path ? (
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
                                            <div className="flex items-center space-x-3 text-emerald-400 font-bold">
                                                <FontAwesomeIcon icon={faCheckCircle} className="text-lg" />
                                                <div>
                                                    <p className="m-0 text-white font-bold">Signed Lease Contract Uploaded</p>
                                                    <p className="m-0 text-xs font-normal text-emerald-300">Your signed contract has been attached. You may now proceed to initial payment below.</p>
                                                </div>
                                            </div>
                                            <label className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-2 rounded-xl cursor-pointer transition-all border border-white/10 shrink-0">
                                                <span>{t('trackApp.reupload')}</span>
                                                <input 
                                                    type="file" 
                                                    accept="application/pdf" 
                                                    className="hidden" 
                                                    onChange={(e) => {
                                                        if (e.target.files?.[0]) {
                                                            validateAndSetContractFile(e.target.files[0]);
                                                        }
                                                    }} 
                                                />
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-3">
                                            <div className="flex items-center space-x-2.5 text-amber-400 font-bold text-sm">
                                                <FontAwesomeIcon icon={faInfoCircle} className="animate-pulse" />
                                                <span>Signed Contract Upload Required (Max 5MB PDF)</span>
                                            </div>
                                            <p className="text-slate-300 text-xs m-0">
                                                You must upload your signed contract first (PDF format only; max 5MB) before initial payment options are enabled.
                                            </p>
                                            <form onSubmit={handleContractUpload} className="track-app-upload-form flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                                                <input 
                                                    type="file" 
                                                    accept="application/pdf"
                                                    onChange={(e) => {
                                                        if (e.target.files?.[0]) {
                                                            validateAndSetContractFile(e.target.files[0]);
                                                        }
                                                    }}
                                                    className="flex-1 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-xl p-2.5 outline-none file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={!contractFile || uploadingContract}
                                                    className="bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                                >
                                                    {uploadingContract ? (
                                                        <>
                                                            <FontAwesomeIcon icon={faHourglassHalf} className="animate-spin" />
                                                            <span>Uploading...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FontAwesomeIcon icon={faUpload} />
                                                            <span>{t('trackApp.uploadContract')}</span>
                                                        </>
                                                    )}
                                                </button>
                                            </form>
                                        </div>
                                    )}
                                </div>

                                {/* Step 2: Complete Initial Lease Payment */}
                                <div className="track-app-payment-box bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
                                    <div className="border-b border-white/10 pb-4">
                                        <h3 className="text-lg font-bold text-white m-0 flex items-center gap-2">
                                            <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-indigo-400" />
                                            {t('trackApp.step2')}
                                        </h3>
                                        <p className="text-slate-300 text-xs sm:text-sm m-0 mt-1.5 leading-relaxed">
                                            Your lease application is approved! Settle your initial 1-month advance rent and 1-month security deposit below:
                                        </p>
                                    </div>

                                    {!application.signed_lease_path && (
                                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 sm:p-5 rounded-2xl text-xs font-semibold flex items-center space-x-3 my-2">
                                            <FontAwesomeIcon icon={faLock} className="text-rose-400 text-base shrink-0" />
                                            <span className="leading-relaxed">Payment is locked. Please upload your signed lease contract in Step 1 above to enable initial payment.</span>
                                        </div>
                                    )}

                                    <div className="track-app-payment-breakdown space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-7 text-sm">
                                        <div className="flex justify-between items-center py-1.5 px-1">
                                            <span className="text-slate-200 font-medium text-sm">1-Month Advance Rent:</span>
                                            <span className="font-bold text-white text-base tracking-wide">
                                                ₱{parseFloat(application.pending_base_rent || application.monthly_rent || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 px-1">
                                            <span className="text-slate-200 font-medium text-sm">1-Month Security Deposit:</span>
                                            <span className="font-bold text-white text-base tracking-wide">
                                                ₱{parseFloat(application.pending_security_deposit || application.monthly_rent || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="border-t border-white/10 pt-4 mt-2 px-1 flex justify-between items-center font-bold">
                                            <span className="text-slate-100 text-sm font-semibold">Total Initial Payment Due:</span>
                                            <span className="text-2xl font-black text-indigo-400">
                                                ₱{parseFloat(application.pending_total_amount || (2 * parseFloat(application.monthly_rent || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>

                                    {application.pending_invoice_status === 'pending-verification' ? (
                                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 space-y-3">
                                            <div className="flex items-center gap-2.5 text-indigo-400 font-bold text-sm">
                                                <FontAwesomeIcon icon={faInfoCircle} className="animate-pulse" />
                                                Payment Verification Pending
                                            </div>
                                            <p className="text-slate-300 text-xs m-0 leading-relaxed">
                                                Your payment proof (via <strong>{application.pending_payment_method}</strong>) has been submitted and is currently being verified by management. Your room details and service features will automatically unlock here once management confirms receipt of the payment.
                                            </p>
                                        </div>
                                    ) : application.pending_payment_method === 'Cash on Hand' ? (
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 space-y-3">
                                            <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
                                                <FontAwesomeIcon icon={faInfoCircle} className="animate-pulse" />
                                                Cash Payment Request Pending
                                            </div>
                                            <p className="text-slate-300 text-xs m-0 leading-relaxed">
                                                Please proceed to the management office to settle your cash payment of <strong className="text-white">₱{parseFloat(application.pending_total_amount || (2 * parseFloat(application.monthly_rent || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>. Your room details and service features will automatically unlock here once management confirms receipt of the payment.
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Payment Method Selector */}
                                            <div className={`space-y-3 ${!application.signed_lease_path ? 'opacity-40 pointer-events-none' : ''}`}>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Payment Method</label>
                                                <div className="track-app-payment-methods grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                    {paymentChannels.length > 0 ? paymentChannels.map((method) => (
                                                        <button
                                                            key={method.id}
                                                            disabled={!application.signed_lease_path}
                                                            onClick={() => setSelectedMethod(method.id)}
                                                            className={`flex items-center justify-between p-4 rounded-2xl border text-sm font-semibold transition-all ${
                                                                !application.signed_lease_path
                                                                    ? 'opacity-40 bg-white/5 border-white/5 text-slate-500 cursor-not-allowed'
                                                                    : selectedMethod === method.id 
                                                                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg cursor-pointer' 
                                                                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 cursor-pointer'
                                                            }`}
                                                        >
                                                            <div className="flex items-center space-x-3">
                                                                <FontAwesomeIcon icon={method.icon} className={selectedMethod === method.id ? 'text-indigo-400' : 'text-slate-400'} />
                                                                <span>{method.label}</span>
                                                            </div>
                                                            {selectedMethod === method.id && (
                                                                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-xs">
                                                                    <FontAwesomeIcon icon={faCheck} className="text-white text-[10px]" />
                                                                </div>
                                                            )}
                                                        </button>
                                                    )) : (
                                                        <div className="col-span-3 text-slate-400 text-xs italic">Loading payment methods...</div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Button */}
                                            <button
                                                onClick={handleInitialPayment}
                                                disabled={paying || !application.signed_lease_path}
                                                className="track-app-pay-btn w-full bg-indigo-500 hover:bg-indigo-600 active:scale-[0.98] text-white font-bold py-4 rounded-2xl text-sm transition-all shadow-lg border-0 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {paying ? (
                                                    <>
                                                        <FontAwesomeIcon icon={faHourglassHalf} className="animate-spin" />
                                                        <span>Processing Payment...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>Pay ₱{parseFloat(application.pending_total_amount || (2 * parseFloat(application.monthly_rent || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })} Now</span>
                                                        <FontAwesomeIcon icon={faArrowRight} />
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Visual Progress Timeline */}
                        <div className="bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
                            <h3 className="text-lg font-bold text-white m-0">
                                {statusNormalized === 'moved-out' ? "Tenancy Checkout Milestones" : "Application Progress"}
                            </h3>
                            
                            {statusNormalized === 'moved-out' ? (
                                <div className="track-app-timeline relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-0 pt-4 pb-2">
                                    {/* Timeline Line (Desktop) */}
                                    <div className="absolute top-[20px] left-0 right-0 h-0.5 bg-indigo-500/80 hidden md:block z-0"></div>

                                    {/* Step 1: Concluded */}
                                    <div className="flex md:flex-col items-center gap-4 md:gap-2 z-10 w-full md:w-1/3 text-left md:text-center relative">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold shadow-md border-4 border-slate-900">
                                            <FontAwesomeIcon icon={faCheckCircle} />
                                        </div>
                                        <div className="flex flex-col md:items-center">
                                            <span className="text-sm font-bold text-white">Tenancy Concluded</span>
                                            <span className="text-xs text-slate-400 mt-0.5">Lease period ended</span>
                                        </div>
                                    </div>

                                    {/* Step 2: Clearance */}
                                    <div className="flex md:flex-col items-center gap-4 md:gap-2 z-10 w-full md:w-1/3 text-left md:text-center relative">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold shadow-md border-4 border-slate-900">
                                            <FontAwesomeIcon icon={faCheckCircle} />
                                        </div>
                                        <div className="flex flex-col md:items-center">
                                            <span className="text-sm font-bold text-white">Inspected & Cleared</span>
                                            <span className="text-xs text-slate-400 mt-0.5">Deductions and utilities settled</span>
                                        </div>
                                    </div>

                                    {/* Step 3: Vacated */}
                                    <div className="flex md:flex-col items-center gap-4 md:gap-2 z-10 w-full md:w-1/3 text-left md:text-center relative">
                                        <div className="w-10 h-10 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold shadow-md border-4 border-slate-900">
                                            <FontAwesomeIcon icon={faCheckCircle} />
                                        </div>
                                        <div className="flex flex-col md:items-center">
                                            <span className="text-sm font-bold text-white">Unit Vacated</span>
                                            <span className="text-xs text-slate-400 mt-0.5">Room released vacant for lease</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="track-app-timeline relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-0 pt-4 pb-2">
                                    {/* Timeline Line (Desktop) */}
                                    <div className="absolute top-[20px] left-0 right-0 h-0.5 bg-slate-800 hidden md:block z-0"></div>
                                    <div 
                                        className="absolute top-[20px] left-0 h-0.5 bg-indigo-500 hidden md:block z-0 transition-all duration-500"
                                        style={{
                                            width: statusNormalized === 'approved' ? '100%' : statusNormalized === 'rejected' ? '100%' : '50%'
                                        }}
                                    ></div>

                                    {/* Step 1: Submitted */}
                                    <div className="flex md:flex-col items-center gap-4 md:gap-2 z-10 w-full md:w-1/3 text-left md:text-center relative">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold shadow-md border-4 border-slate-900">
                                            <FontAwesomeIcon icon={faCheckCircle} />
                                        </div>
                                        <div className="flex flex-col md:items-center">
                                            <span className="text-sm font-bold text-white">Application Submitted</span>
                                            <span className="text-xs text-slate-400 mt-0.5">Documents uploaded successfully</span>
                                        </div>
                                    </div>

                                    {/* Step 2: Under Review */}
                                    <div className="flex md:flex-col items-center gap-4 md:gap-2 z-10 w-full md:w-1/3 text-left md:text-center relative">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-md border-4 border-slate-900 transition-all ${
                                            statusNormalized === 'pending' ? 'bg-amber-500 text-white animate-pulse' : 'bg-indigo-500 text-white'
                                        }`}>
                                            <FontAwesomeIcon icon={statusNormalized === 'pending' ? faHourglassHalf : faCheckCircle} className={statusNormalized === 'pending' ? 'animate-spin' : ''} />
                                        </div>
                                        <div className="flex flex-col md:items-center">
                                            <span className="text-sm font-bold text-white">Under Review</span>
                                            <span className="text-xs text-slate-400 mt-0.5">Building management verification</span>
                                        </div>
                                    </div>

                                    {/* Step 3: Final Decision */}
                                    <div className="flex md:flex-col items-center gap-4 md:gap-2 z-10 w-full md:w-1/3 text-left md:text-center relative">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-md border-4 border-slate-900 transition-all ${
                                            statusNormalized === 'approved' ? 'bg-emerald-500 text-white' : 
                                            statusNormalized === 'rejected' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-500'
                                        }`}>
                                            <FontAwesomeIcon icon={
                                                statusNormalized === 'approved' ? faCheckCircle : 
                                                statusNormalized === 'rejected' ? faTimesCircle : faCheckCircle
                                            } />
                                        </div>
                                        <div className="flex flex-col md:items-center">
                                            <span className="text-sm font-bold text-white">
                                                {statusNormalized === 'rejected' ? 'Application Rejected' : 'Final Decision'}
                                            </span>
                                            <span className="text-xs text-slate-400 mt-0.5">
                                                {statusNormalized === 'approved' ? (
                                                    application.has_pending_first_payment ? 'Pending Initial Payment' : 'Ready to move in'
                                                ) : 
                                                 statusNormalized === 'rejected' ? 'Review feedback or re-apply' : 'Pending decisions'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Lease Details Grid */}
                        <div className="bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
                            <h3 className="text-lg font-bold text-white m-0">Lease Details</h3>
                            
                            <div className="track-app-details-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                                <div className="flex items-center space-x-3.5">
                                    <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                        <FontAwesomeIcon icon={faHome} className="text-lg" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Room</span>
                                        <span className="text-sm font-extrabold text-white mt-0.5">{application.room_name ? `Room ${application.room_name}` : "Studio Unit"}</span>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-3.5">
                                    <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                        <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-lg" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monthly Rent</span>
                                        <span className="text-sm font-extrabold text-white mt-0.5">
                                            ₱{parseFloat(application.monthly_rent || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-3.5">
                                    <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                        <FontAwesomeIcon icon={faCalendarAlt} className="text-lg" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lease Term</span>
                                        <span className="text-sm font-extrabold text-white mt-0.5">{application.months_of_rent} Months</span>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-3.5">
                                    <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                        <FontAwesomeIcon icon={faUsers} className="text-lg" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Occupants</span>
                                        <span className="text-sm font-extrabold text-white mt-0.5">{application.occupants} Person(s)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Empty State (No application found) */
                    <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-10 text-center space-y-6 max-w-xl mx-auto">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20">
                            <FontAwesomeIcon icon={faHourglassHalf} className="text-2xl" />
                        </div>
                        
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-white m-0">No Active Application</h2>
                            <p className="text-slate-300 text-sm leading-relaxed max-w-md mx-auto m-0 font-medium">
                                You haven't submitted any lease application yet. Browse our available studio room configurations to start your boarding process.
                            </p>
                        </div>

                        <button
                            onClick={() => navigate('/preview')}
                            className="bg-[#6366f1] hover:bg-[#4f46e5] active:scale-95 text-white font-bold py-3 px-8 rounded-xl text-sm transition-all shadow-lg border-0 cursor-pointer inline-flex items-center space-x-2"
                        >
                            <span>Browse Available Rooms</span>
                            <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
