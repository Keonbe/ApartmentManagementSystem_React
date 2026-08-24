import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faUsers, faCalendarAlt, faHourglassHalf, faCalendarPlus, faSignOutAlt, faMapMarkerAlt, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import ApartmentPic from '../assets/Apartment_Pic.png';
import api from "../api/axiosConfig";
import '../assets/styles/responsive/user/my-room.responsive.css';

export default function MyRoom() {
    const navigate = useNavigate();

    const [loggedInUser] = useState(() => {
        const sessionData = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
        return sessionData ? JSON.parse(sessionData) : null;
    });

    const activeEmail = loggedInUser?.email_address || "";
    const activeFirstName = loggedInUser?.first_name || "";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [roomDetails, setRoomDetails] = useState({
        name: "Unassigned",
        type: "Studio Apartment",
        monthlyRent: 0,
        rentStart: "Pending",
        paymentDue: "Pending",
        status: "N/A"
    });

    const [occupants, setOccupants] = useState(2);
    const [expectedEnd, setExpectedEnd] = useState('');
    const [daysUntilExpiration, setDaysUntilExpiration] = useState(null);
    const [showMoveOutModal, setShowMoveOutModal] = useState(false);
    const [moveOutDate, setMoveOutDate] = useState('');

    useEffect(() => {
        const fetchMyRoom = async () => {
            if (!activeEmail) {
                setError("No active user session found.");
                setLoading(false);
                return;
            }

            try {
                const res = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);

                if (res.data.success && res.data.data) {
                    const data = res.data.data;

                    const creationDate = new Date(data.created_at);
                    const startDateString = creationDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

                    const nextMonth = new Date(creationDate);
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    const dueDateString = nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

                    const endDate = data.lease_end ? new Date(data.lease_end) : new Date(creationDate);
                    if (!data.lease_end) {
                        endDate.setMonth(endDate.getMonth() + parseInt(data.months_of_rent));
                    }

                    setRoomDetails({
                        name: data.room_name,
                        type: "Studio Apartment",
                        monthlyRent: parseFloat(data.monthly_rent),
                        rentStart: startDateString,
                        paymentDue: dueDateString,
                        status: data.status,
                        requestedMoveOutDate: data.requested_move_out_date
                    });

                    const diffTime = endDate.getTime() - new Date().getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    setDaysUntilExpiration(diffDays);

                    setExpectedEnd(endDate.toISOString().split('T')[0]);

                    if (data.occupants) {
                        setOccupants(parseInt(data.occupants));
                    }

                } else {
                    setError("No active room assignments found.");
                }
            } catch (err) {
                console.error("Failed to fetch room details:", err);
                setError("Failed to connect to the server.");
            } finally {
                setLoading(false);
            }
        };

        fetchMyRoom();
    }, [activeEmail]);

    const handleOccupantChange = (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val)) {
            setOccupants('');
            return;
        }
        if (val > 8) val = 8;
        if (val < 1) val = 1;
        setOccupants(val);
    };
    const [currentOccupants, setCurrentOccupants] = useState(2);

    // 2. In your useEffect (fetchMyRoom), store current occupants when room data loads
    useEffect(() => {
        const fetchMyRoom = async () => {
            if (!activeEmail) return;
            try {
                const res = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);
                if (res.data.success && res.data.data) {
                    const data = res.data.data;

                    if (data.occupants) {
                        const count = parseInt(data.occupants, 10);
                        setOccupants(count);
                        setCurrentOccupants(count); // Store current baseline
                    }
                }
            } catch (err) {
                console.error("Failed to fetch current occupants:", err);
            }
        };
        fetchMyRoom();
    }, [activeEmail]);
    const handleUpdateOccupants = async (e) => {
        if (e) e.preventDefault();

        if (!occupants || occupants < 1 || occupants > 8) {
            alert("Please enter a valid number of occupants between 1 and 8.");
            return;
        }

        if (occupants === currentOccupants) {
            alert(`Your room is already assigned to ${occupants} occupant(s).`);
            return;
        }

        try {
            const res = await api.post('/update_occupants.php', {
                email: activeEmail,
                occupants: occupants
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.data.success) {
                alert("Your request to change occupants has been sent to administration for verification.");
                // Refresh the current route
                window.location.reload();
            } else {
                alert(`Error: ${res.data.message}`);
            }
        } catch (err) {
            console.error("Failed to update occupants:", err);
            alert("A network error occurred while submitting your request.");
        }
    };


    const handleSeeContract = () => {
        navigate('/view-contract');
    };

    const [additionalMonths, setAdditionalMonths] = useState(1);

    const handleExtendRent = async (e) => {
        if (e) e.preventDefault();

        const months = parseInt(additionalMonths, 10);
        if (!months || months < 1 || months > 12) {
            alert("Please enter a valid extension period between 1 and 12 months.");
            return;
        }

        try {
            const res = await api.post('/extend_lease.php', {
                email: activeEmail,
                additionalMonths: months
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.data.success) {
                alert("Your lease extension request has been sent to administration for verification.");
                // Refresh the current route
                window.location.reload();
            } else {
                alert(`Error: ${res.data.message}`);
            }
        } catch (err) {
            console.error("Failed to extend lease:", err);
            alert("A network error occurred while submitting your request.");
        }
    };

    const handleEndRent = () => {
        const date = new Date();
        date.setDate(date.getDate() + 15);
        setMoveOutDate(date.toISOString().split('T')[0]);
        setShowMoveOutModal(true);
    };

    const handleConfirmMoveOut = async () => {
        if (!moveOutDate) {
            alert("Please select a move-out date.");
            return;
        }

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const selected = new Date(moveOutDate);
            selected.setHours(0, 0, 0, 0);

            const diffTime = selected.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 15) {
                alert("Prior notice of at least 15 days is required before your actual move-out.");
                return;
            }
            if (diffDays > 30) {
                alert("Move-out notice cannot exceed 30 days in advance.");
                return;
            }

            const res = await api.post('/record_move_out.php', {
                email: activeEmail,
                move_out_date: moveOutDate
            });

            if (res.data.success) {
                alert("Termination notice submitted successfully.");
                setShowMoveOutModal(false);
                window.location.reload();
            } else {
                alert(res.data.message);
            }
        } catch (err) {
            console.error("Move-out error:", err);
            alert(err.response?.data?.message || "Failed to submit termination request. Please try again.");
        }
    };


    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="flex flex-col items-center space-y-4">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-4xl text-indigo-500 animate-spin" />
                    <h2 className="text-xl font-bold">Loading Room Details...</h2>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="bg-slate-800/80 p-8 rounded-3xl border border-white/10 text-center max-w-md space-y-4 shadow-2xl">
                    <FontAwesomeIcon icon={faFileContract} className="text-5xl text-rose-500 mb-2" />
                    <h2 className="text-2xl font-bold">No Room Found</h2>
                    <p className="text-slate-400 text-sm">{error}</p>
                    <button
                        onClick={() => navigate('/rent-application')}
                        className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl transition-all"
                    >
                        Apply for a Room
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="my-room-root w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start overflow-y-auto box-border py-10 px-4 md:px-12">

            <div className="absolute inset-0 z-0">
                <img
                    src={ApartmentPic}
                    alt="Apartment Background"
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-900/80 to-slate-950/95"></div>
            </div>

            <div className="w-full max-w-6xl z-10 space-y-8 flex flex-col justify-start text-left">

                {daysUntilExpiration !== null && daysUntilExpiration > 0 && daysUntilExpiration <= 30 && (
                    <div className="bg-amber-500/20 border border-amber-500/50 rounded-2xl p-4 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-md">
                        <div className="flex items-center space-x-3">
                            <FontAwesomeIcon icon={faCalendarAlt} className="text-amber-400 text-2xl" />
                            <div>
                                <h4 className="font-bold text-amber-300 m-0 text-sm">Lease Expiring Soon!</h4>
                                <p className="text-xs m-0 mt-0.5 text-amber-200/90">
                                    Your current lease contract expires in <strong>{daysUntilExpiration} days</strong> ({expectedEnd}). Submit an extension to prevent service disruption.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="my-room-banner bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className={`text-[9px] tracking-widest uppercase font-black px-2.5 py-1 rounded select-none ${roomDetails.status === 'Approved' ? 'bg-[#10b981] text-white' : 'bg-[#6366f1] text-white'}`}>
                                {roomDetails.status === 'Approved' ? 'Active Tenancy' : `Status: ${roomDetails.status}`}
                            </span>
                            <span className="text-xs text-indigo-300 font-bold flex items-center space-x-1">
                                <FontAwesomeIcon icon={faMapMarkerAlt} className="text-[10px]" />
                                <span>Maguyam Silang, Cavite</span>
                            </span>
                        </div>

                        <h1 className="text-3xl md:text-4xl font-sans font-extrabold m-0 text-white tracking-tight leading-tight">
                            {activeFirstName ? `Welcome Back, ${activeFirstName}` : "Welcome Back"}
                        </h1>

                        <h2 className="text-xl font-sans font-bold m-0 text-indigo-200 tracking-tight pt-0.5">
                            Current Assigned Unit: {roomDetails.name}
                        </h2>

                        <p className="text-slate-300 text-xs sm:text-sm m-0 font-medium pt-1">
                            {roomDetails.type} — Manage your ongoing tenancy parameters, dates, and contracts.
                        </p>
                    </div>
                </div>

                <div className="my-room-cards-grid grid grid-cols-1 md:grid-cols-3 gap-6">

                    <div className="my-room-card bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-6 flex flex-col justify-between space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                    <FontAwesomeIcon icon={faFileContract} className="text-lg" />
                                </div>
                                <h3 className="text-lg font-bold text-white m-0">Lease Contract</h3>
                            </div>
                            <p className="text-slate-300 text-xs leading-relaxed m-0 font-medium">
                                View legal bindings, rules, and document authentications associated with your rented room unit.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleSeeContract}
                            className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md"
                        >
                            See Contract
                        </button>
                    </div>

                    <div className="my-room-card bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-6 flex flex-col justify-between space-y-6">
                        <form onSubmit={handleUpdateOccupants} className="space-y-4 m-0 flex-grow flex flex-col justify-between">
                            <div className="space-y-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-500/10 text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                                        <FontAwesomeIcon icon={faUsers} className="text-lg" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white m-0">No. Occupants</h3>
                                </div>
                                <div className="flex flex-col space-y-1.5 text-left">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No. Occupants (Max 4)</label>
                                        <span className="text-[9px] text-slate-400">Exceeding 4 adds ₱1,000/person surcharge</span>
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        max="8"
                                        value={occupants}
                                        onChange={handleOccupantChange}
                                        className="w-full px-4 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm box-border font-bold"
                                        required
                                    />
                                    {occupants > 4 && (
                                        <span className="text-[9px] text-amber-300 font-medium leading-normal mt-1">
                                            ⚠️ +₱{((occupants - 4) * 1000).toLocaleString()}/mo capacity surcharge (₱1,000 per person exceeding 4)
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-slate-800 hover:bg-slate-700 border border-white/10 text-white font-bold py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md"
                            >
                                Update Occupants
                            </button>
                        </form>
                    </div>

                    <div className="my-room-card bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-6 flex flex-col justify-between space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                                    <FontAwesomeIcon icon={faHourglassHalf} className="text-lg animate-pulse" />
                                </div>
                                <h3 className="text-lg font-bold text-white m-0">Next Bill Due</h3>
                            </div>
                            <div className="space-y-2.5 pt-1 text-left">
                                <div className="flex justify-between text-xs font-semibold text-slate-400">
                                    <span>Rent Balance:</span>
                                    <span className="text-slate-200">
                                        ₱{roomDetails.monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                {occupants > 4 && (
                                    <div className="flex justify-between text-[10px] font-semibold text-indigo-300">
                                        <span>(Base + Extra Occupant Surcharge):</span>
                                        <span>
                                            ₱{(roomDetails.monthlyRent - (occupants - 4) * 1000).toLocaleString()} + ₱{((occupants - 4) * 1000).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs font-semibold text-slate-400">
                                    <span>Cycle Started:</span>
                                    <span className="text-slate-200">{roomDetails.rentStart}</span>
                                </div>
                                <div className="flex justify-between text-xs font-semibold text-slate-400">
                                    <span>Deadline Date:</span>
                                    <span className="text-rose-400 font-bold">{roomDetails.paymentDue}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/pay-bills')}
                            className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md"
                        >
                            Pay Rent Balance
                        </button>
                    </div>

                </div>

                <div className="my-room-operations-grid grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">

                    <div className="md:col-span-8 bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-6 md:p-8">
                        <form onSubmit={handleExtendRent} className="my-room-extend-form grid grid-cols-1 sm:grid-cols-3 gap-6 items-end m-0 text-left">
                            <div className="sm:col-span-2 space-y-3">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                        <FontAwesomeIcon icon={faCalendarPlus} className="text-lg" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white m-0">Extend Lease Term</h3>
                                </div>
                                <p className="text-slate-300 text-xs leading-relaxed m-0 font-medium">
                                    Select a new prospective end date to file an official extension request to administration.
                                </p>
                            </div>
                            <div className="space-y-3 w-full box-border">
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Additional Months</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="12"
                                        maxLength="2"
                                        value={additionalMonths}
                                        onChange={(e) => {
                                            let val = e.target.value;

                                            // Truncate to 2 characters maximum
                                            if (val.length > 2) val = val.slice(0, 2);

                                            let intVal = parseInt(val, 10);

                                            // Handle empty or invalid typing
                                            if (isNaN(intVal) || intVal < 1) {
                                                setAdditionalMonths('');
                                                return;
                                            }

                                            // Hard-cap at 12 months
                                            if (intVal > 12) intVal = 12;

                                            setAdditionalMonths(intVal);
                                        }}
                                        onBlur={() => {
                                            // Fallback to 1 if left empty when clicking away
                                            if (!additionalMonths || additionalMonths < 1) {
                                                setAdditionalMonths(1);
                                            }
                                        }}
                                        className="w-full px-4 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm box-border font-bold"
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md"
                                >
                                    Submit Extension
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="md:col-span-4 bg-rose-950/20 backdrop-blur-md rounded-3xl border border-rose-500/20 p-6 flex flex-col justify-between text-left space-y-4 shadow-2xl">
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-rose-400 font-bold text-base">
                                <FontAwesomeIcon icon={faSignOutAlt} className="text-sm" />
                                <span>Terminate Tenancy</span>
                            </div>
                            <p className="text-slate-300 text-xs leading-relaxed m-0 font-medium">
                                Initiate standard check-out procedures to vacate the unit and close your balance statements.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleEndRent}
                            disabled={roomDetails.status === 'pending-move-out'}
                            className={`w-full font-bold py-3 rounded-xl text-xs border-0 transition-all shadow-md ${roomDetails.status === 'pending-move-out'
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                                }`}
                        >
                            {roomDetails.status === 'pending-move-out' ? 'Move-Out Pending' : 'End Rent Term'}
                        </button>
                        {roomDetails.status === 'pending-move-out' && (
                            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1.5 mt-2">
                                <div className="text-xs font-bold text-amber-400">Move-Out Notice Active</div>
                                <div className="text-[11px] text-slate-300 leading-normal">
                                    Your scheduled move-out date: <strong>{roomDetails.requestedMoveOutDate ? new Date(roomDetails.requestedMoveOutDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Pending'}</strong>
                                </div>
                                {roomDetails.requestedMoveOutDate && (() => {
                                    const diff = Math.ceil((new Date(roomDetails.requestedMoveOutDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                    return (
                                        <div className="text-[10px] text-amber-300/90 font-semibold">
                                            ⏳ {diff > 0 ? `${diff} days remaining until move-out` : 'Move-out is due today'}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                </div>

            </div>

            {/* ─── MOVE OUT SCHEDULING MODAL ─── */}
            {showMoveOutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowMoveOutModal(false)}>
                    <div className="my-room-modal-content bg-slate-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
                                    <FontAwesomeIcon icon={faSignOutAlt} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white m-0">Terminate Tenancy</h3>
                                    <p className="text-[10px] text-slate-400 m-0 mt-0.5">Submit notice to administration</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-4 text-left">
                            <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 flex items-start space-x-3">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-rose-400 mt-0.5 shrink-0" />
                                <p className="text-xs text-slate-300 m-0 leading-relaxed">
                                    Under system policy, prior notice must be given at least <strong>15 days</strong> but less than <strong>30 days</strong> before your actual move-out date.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actual Move-Out Date</label>
                                <input
                                    type="date"
                                    value={moveOutDate}
                                    min={(() => {
                                        const d = new Date();
                                        d.setDate(d.getDate() + 15);
                                        return d.toISOString().split('T')[0];
                                    })()}
                                    max={(() => {
                                        const d = new Date();
                                        d.setDate(d.getDate() + 30);
                                        return d.toISOString().split('T')[0];
                                    })()}
                                    onChange={(e) => setMoveOutDate(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500 text-sm box-border font-bold"
                                    required
                                />
                            </div>
                        </div>

                        <div className="my-room-modal-actions flex items-center justify-end gap-3 px-6 py-4 bg-slate-950/40 border-t border-white/10">
                            <button 
                                onClick={() => setShowMoveOutModal(false)} 
                                className="px-4 py-2 text-xs text-slate-400 font-bold hover:text-white rounded-xl border-0 bg-transparent cursor-pointer transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleConfirmMoveOut} 
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md border-0 cursor-pointer transition-all"
                            >
                                Confirm Notice
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}