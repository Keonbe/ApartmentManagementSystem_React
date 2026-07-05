import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faUsers, faCalendarAlt, faHourglassHalf, faCalendarPlus, faSignOutAlt, faMapMarkerAlt } from '@fortawesome/free-solid-svg-icons';
import ApartmentPic from '../assets/Apartment_Pic.png';

export default function MyRoom() {
    const navigate = useNavigate();
    const [occupants, setOccupants] = useState(2);
    const [expectedEnd, setExpectedEnd] = useState('2027-02-16');

    {/*Fetch active user context session profiles for greeting generation*/}
    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
    const activeFirstName = loggedInUser ? loggedInUser.first_name : "";

    const roomDetails = {
        name: "Room C",
        type: "Studio Apartment",
        rentStart: "May 16, 2026",
        paymentDue: "June 16, 2026"
    };

    const handleSeeContract = () => {
        alert("Opening contract view... (Auto-generation link placeholder)");
    };

    const handleUpdateOccupants = (e) => {
        e.preventDefault();
        alert(`Occupant count updated to: ${occupants}`);
    };

    const handleExtendRent = (e) => {
        e.preventDefault();
        alert(`Extension requested up to: ${expectedEnd}`);
    };

    const handleEndRent = () => {
        const confirmAction = window.confirm("Are you sure you want to request lease termination? This action sends a notice to administration.");
        if (confirmAction) {
            alert("Termination notice submitted.");
        }
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start overflow-y-auto box-border py-10 px-4 md:px-12">
            
            {/*Full Bleed Background Hero Layer*/}
            <div className="absolute inset-0 z-0">
                <img
                    src={ApartmentPic}
                    alt="Apartment Background"
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-900/80 to-slate-950/95"></div>
            </div>

            {/*Main Content Structural Layout Workspace*/}
            <div className="w-full max-w-6xl z-10 space-y-8 flex flex-col justify-start text-left">
                
                {/*Premium Translucent Header Section Layout with separated texts*/}
                <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-[9px] tracking-widest uppercase font-black px-2.5 py-1 rounded bg-[#6366f1] text-white select-none">
                                Active Tenancy
                            </span>
                            <span className="text-xs text-indigo-300 font-bold flex items-center space-x-1">
                                <FontAwesomeIcon icon={faMapMarkerAlt} className="text-[10px]" />
                                <span>Maguyam Silang, Cavite</span>
                            </span>
                        </div>
                        
                        {/*Separated Welcome Greeting Header Row*/}
                        <h1 className="text-3xl md:text-4xl font-sans font-extrabold m-0 text-white tracking-tight leading-tight">
                            {activeFirstName ? `Welcome Back, ${activeFirstName}` : "Welcome Back"}
                        </h1>
                        
                        {/*Separated Room Specification Suffix Element Row*/}
                        <h2 className="text-xl font-sans font-bold m-0 text-indigo-200 tracking-tight pt-0.5">
                            Current Assigned Unit: {roomDetails.name}
                        </h2>
                        
                        <p className="text-slate-300 text-xs sm:text-sm m-0 font-medium pt-1">
                            {roomDetails.type} — Manage your ongoing tenancy parameters, dates, and contracts.
                        </p>
                    </div>
                </div>

                {/*Primary Cards Grid Section*/}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/*CARD 1: Lease Contract documentation container module*/}
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

                    {/*CARD 2: Occupants Update management form panel*/}
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
                                        onChange={(e) => setOccupants(parseInt(e.target.value) || '')}
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

                    {/*CARD 3: Statement Billing Ledger Info panel*/}
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

                {/*Lower Control Management Options Split Grid Wrapper*/}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                    
                    {/*Lease Timeline Extensions Container Form*/}
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
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expected Rent End</label>
                                    <input
                                        type="date"
                                        value={expectedEnd}
                                        onChange={(e) => setExpectedEnd(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm box-border font-bold color-scheme-dark"
                                        style={{ colorScheme: 'dark' }}
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

                    {/*Dangerous Actions: Lease Contract Termination Block*/}
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