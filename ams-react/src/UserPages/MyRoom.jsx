import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faUsers, faCalendarAlt, faHourglassHalf, faCalendarPlus, faSignOutAlt, faMapMarkerAlt } from '@fortawesome/free-solid-svg-icons';
import ApartmentPic from '../assets/Apartment_Pic.png';
import api from "../api/axiosConfig";

export default function MyRoom() {
    const navigate = useNavigate();

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
    const activeFirstName = loggedInUser ? loggedInUser.first_name : "";
    const activeEmail = loggedInUser ? loggedInUser.email_address : "";

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

                    const endDate = new Date(creationDate);
                    endDate.setMonth(endDate.getMonth() + parseInt(data.months_of_rent));

                    setRoomDetails({
                        name: data.room_name,
                        type: "Studio Apartment",
                        monthlyRent: parseFloat(data.monthly_rent),
                        rentStart: startDateString,
                        paymentDue: dueDateString,
                        status: data.status
                    });

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
        if (val > 4) val = 4;
        if (val < 1) val = 1;
        setOccupants(val);
    };

    const handleUpdateOccupants = async (e) => {
        e.preventDefault();

        if (!occupants || occupants < 1 || occupants > 4) {
            alert("Please enter a valid number of occupants between 1 and 4.");
            return;
        }

        try {
            const res = await api.post('/update_occupants.php', {
                email: activeEmail,
                occupants: occupants
            });

            if (res.data.success) {
                alert(`Successfully updated your room to ${occupants} occupants.`);
            } else {
                alert(`Error: ${res.data.message}`);
            }
        } catch (err) {
            console.error("Failed to update occupants:", err);
            alert("A network error occurred while updating.");
        }
    };

    const handleSeeContract = () => {
        navigate('/view-contract');
    };

    const [additionalMonths, setAdditionalMonths] = useState(1);

    const handleExtendRent = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/extend_lease.php', {
                email: activeEmail,
                additionalMonths: additionalMonths
            });

            if (res.data.success) {
                alert("Lease extended successfully.");
                window.location.reload();
            } else {
                alert(res.data.message);
            }
        } catch (err) {
            alert("Failed to connect to server.");
        }
    };

    const handleEndRent = () => {
        const confirmAction = window.confirm("Are you sure you want to request lease termination? This action sends a notice to administration.");
        if (confirmAction) {
            alert("Termination notice submitted.");
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
        <div className="w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start overflow-y-auto box-border py-10 px-4 md:px-12">

            <div className="absolute inset-0 z-0">
                <img
                    src={ApartmentPic}
                    alt="Apartment Background"
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-900/80 to-slate-950/95"></div>
            </div>

            <div className="w-full max-w-6xl z-10 space-y-8 flex flex-col justify-start text-left">

                <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-6 flex flex-col justify-between space-y-6">
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

                    <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-6 flex flex-col justify-between space-y-6">
                        <form onSubmit={handleUpdateOccupants} className="space-y-4 m-0 flex-grow flex flex-col justify-between">
                            <div className="space-y-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-500/10 text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                                        <FontAwesomeIcon icon={faUsers} className="text-lg" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white m-0">No. Occupants</h3>
                                </div>
                                <div className="flex flex-col space-y-1.5 text-left">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Room Count</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="4"
                                        value={occupants}
                                        onChange={handleOccupantChange}
                                        className="w-full px-4 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm box-border font-bold"
                                        required
                                    />
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

                    <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-6 flex flex-col justify-between space-y-6">
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
                                    <span className="text-slate-200">₱{roomDetails.monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
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

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">

                    <div className="md:col-span-8 bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl p-6 md:p-8">
                        <form onSubmit={handleExtendRent} className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end m-0 text-left">
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
                                        value={additionalMonths}
                                        onChange={(e) => setAdditionalMonths(parseInt(e.target.value) || 1)}
                                        className="w-full px-4 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm box-border font-bold"
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
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md"
                        >
                            End Rent Term
                        </button>
                    </div>

                </div>

            </div>
        </div>
    );
}