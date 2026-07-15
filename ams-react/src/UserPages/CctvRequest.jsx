import React, { useState } from 'react';
import SuccessModal from '../Components/SuccessModal';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';

export default function CctvRequest() {
    const [incidentDate, setIncidentDate] = useState('');
    const [incidentTime, setIncidentTime] = useState('');
    const [locationDetails, setLocationDetails] = useState('');
    const [reasonRequest, setReasonRequest] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const navigate = useNavigate();

    const today = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(today.getMonth() - 2);

    const maxDateString = today.toISOString().split('T')[0];
    const minDateString = twoMonthsAgo.toISOString().split('T')[0];

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        const loggedInUserStr = sessionStorage.getItem('loggedInUser');
        const loggedInUser = loggedInUserStr ? JSON.parse(loggedInUserStr) : null;
        const userId = loggedInUser?.id || '';

        const payload = {
            userId: userId,
            incidentDate: incidentDate,
            incidentTime: incidentTime,
            locationDetails: locationDetails,
            reasonRequest: reasonRequest.trim()
        };

        try {
            const res = await api.post("/cctv_request.php", payload);

            if (res.data.success) {
                setIsModalOpen(true);
            } else {
                console.error("Server Error:", res.data.message);
                alert(res.data.message);
            }
        } catch (error) {
            console.error("Error submitting CCTV request:", error);
        }
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">

                {/*Top Header Row containing Live Slot Counter Indicators*/}
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1
                            className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                            style={{ color: '#3b4276' }}
                        >
                            CCTV Footage Request
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 m-0">
                            Complete the security asset review information form below to request footage access permissions.
                        </p>
                    </div>

                    {/*Available Slots Counter Widget*/}
                    <div className="bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm flex items-center space-x-3 flex-shrink-0 select-none">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                        <div>
                            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Review Status</span>
                            <span className="text-xl font-black text-slate-800 tracking-tight">Active Queue</span>
                        </div>
                    </div>
                </div>

                {/*Form Inputs Panel Layout*/}
                <form className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleFormSubmit}>

                    {/*Incident Date Input Field Box Layout*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Incident Date</label>
                        <input
                            type="date"
                            min={minDateString}
                            max={maxDateString}
                            value={incidentDate}
                            onChange={(e) => setIncidentDate(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            style={{ color: '#1e293b' }}
                            required
                        />
                    </div>

                    {/*Estimated Time Select Component Dropdown Menu*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Estimated Time</label>
                        <select
                            value={incidentTime}
                            onChange={(e) => setIncidentTime(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>Select approximate hour...</option>
                            <option value="12:00 AM - 04:00 AM">Midnight (12:00 AM - 04:00 AM)</option>
                            <option value="04:00 AM - 08:00 AM">Early Morning (04:00 AM - 08:00 AM)</option>
                            <option value="08:00 AM - 12:00 PM">Morning (08:00 AM - 12:00 PM)</option>
                            <option value="12:00 PM - 04:00 PM">Afternoon (12:00 PM - 04:00 PM)</option>
                            <option value="04:00 PM - 08:00 PM">Evening (04:00 PM - 08:00 PM)</option>
                            <option value="08:00 PM - 12:00 AM">Night (08:00 PM - 12:00 AM)</option>
                        </select>
                    </div>

                    {/*Corridor Location Dropdown Menu Layout Component*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Corridor Location / Camera Area</label>
                        <select
                            value={locationDetails}
                            onChange={(e) => setLocationDetails(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>Select camera floor location...</option>
                            <option value="1st Floor">1st Floor</option>
                            <option value="2nd Floor">2nd Floor</option>
                            <option value="3rd Floor">3rd Floor</option>
                            <option value="All Floors">All</option>
                        </select>
                    </div>

                    {/*Reason for Request text input area box layout Component*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Reason for Request</label>
                        <textarea
                            rows={3}
                            placeholder="Please provide a detailed justification for requesting security camera footage records..."
                            value={reasonRequest}
                            onChange={(e) => setReasonRequest(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base resize-none"
                            style={{ color: '#1e293b' }}
                            required
                        />
                    </div>

                    {/*Submission Request Action Trigger Button Layout Area*/}
                    <div className="md:col-span-2 border-t border-slate-100 pt-6 flex justify-end">
                        <button
                            type="submit"
                            className="w-full sm:w-auto bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-[1.03] active:scale-[0.97] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer"
                        >
                            Submit Request
                        </button>
                    </div>

                </form>
            </div>

            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    navigate('/home');
                }}
                message="Request Submitted Successfully"
            />
        </div>
    );
}