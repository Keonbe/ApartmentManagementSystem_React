import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTools, faVideo, faCar, faTimesCircle, faCheckCircle, faClock } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

export default function UserMyRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const response = await api.get(`get_my_requests.php?userId=${loggedInUser.id}`);
            if (response.data.success) {
                setRequests(response.data.requests);
            }
        } catch (error) {
            console.error("Failed to fetch requests", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async (id, type) => {
        if (!window.confirm(`Are you sure you want to cancel this ${type} request?`)) return;

        try {
            const response = await api.post('cancel_request.php', {
                userId: loggedInUser.id,
                id,
                type
            });
            if (response.data.success) {
                fetchRequests();
            } else {
                alert(response.data.message);
            }
        } catch (error) {
            console.error("Failed to cancel request", error);
        }
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'Maintenance': return <FontAwesomeIcon icon={faTools} className="text-amber-500" />;
            case 'CCTV': return <FontAwesomeIcon icon={faVideo} className="text-blue-500" />;
            case 'Parking': return <FontAwesomeIcon icon={faCar} className="text-emerald-500" />;
            default: return null;
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Pending':
                return <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faClock} /> Pending</span>;
            case 'Approved':
            case 'Completed':
            case 'Resolved':
                return <span className="px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faCheckCircle} /> {status}</span>;
            case 'Cancelled':
            case 'Rejected':
                return <span className="px-2.5 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faTimesCircle} /> {status}</span>;
            default:
                return <span className="px-2.5 py-1 text-xs font-bold bg-slate-100 text-slate-700 rounded-full">{status}</span>;
        }
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1000px] space-y-8 flex flex-col justify-start text-left">
                
                <div className="border-b border-slate-200 pb-4">
                    <h1 className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none" style={{ color: '#3b4276' }}>
                        My Requests
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 m-0">
                        View the status of your submitted service tickets, parking reservations, and CCTV footage requests.
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">Loading your requests...</div>
                    ) : requests.length === 0 ? (
                        <div className="p-12 text-center">
                            <FontAwesomeIcon icon={faTools} className="text-4xl text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-700 m-0">No Requests Found</h3>
                            <p className="text-sm text-slate-500 mt-2">You haven't submitted any service requests yet.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {requests.map((req, idx) => (
                                <div key={idx} className="p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl shrink-0">
                                            {getTypeIcon(req.type)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold tracking-wider uppercase text-slate-400">{req.type}</span>
                                                <span className="text-xs text-slate-300">•</span>
                                                <span className="text-xs font-medium text-slate-500">{new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            </div>
                                            <h3 className="text-base font-bold text-slate-800 m-0">{req.title}</h3>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0 pl-16 sm:pl-0">
                                        {getStatusBadge(req.status)}
                                        
                                        {req.status === 'Pending' && (
                                            <button 
                                                onClick={() => handleCancel(req.id, req.type)}
                                                className="px-3 py-1.5 text-xs font-bold text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
