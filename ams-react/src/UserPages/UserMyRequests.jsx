import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTools, faVideo, faCar, faTimesCircle, faCheckCircle, faClock, faBroom, faSpinner } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/user-my-requests.responsive.css';

export default function UserMyRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const { t } = useLang();

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
        if (!window.confirm(t('myRequests.cancelConfirm'))) return;

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
            case 'Service': return <FontAwesomeIcon icon={faBroom} className="text-indigo-500" />;
            default: return null;
        }
    };

    const getStatusBadge = (status) => {
        const statusLabel = t(`status.${status.toLowerCase().replace(/s+/g, '')}`) || status;
        switch (status) {
            case 'Pending':
                return <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faClock} /> {statusLabel}</span>;
            case 'In Progress':
                return <span className="px-2.5 py-1 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faSpinner} /> {statusLabel}</span>;
            case 'Approved':
            case 'Completed':
            case 'Resolved':
                return <span className="px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faCheckCircle} /> {statusLabel}</span>;
            case 'Cancelled':
            case 'Rejected':
                return <span className="px-2.5 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faTimesCircle} /> {statusLabel}</span>;
            default:
                return <span className="px-2.5 py-1 text-xs font-bold bg-slate-100 text-slate-700 rounded-full">{statusLabel}</span>;
        }
    };

    return (
        <div className="my-requests-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1000px] space-y-6 sm:space-y-8 flex flex-col justify-start text-left">
                
                <div className="border-b border-slate-200 pb-4">
                    <h1 className="my-requests-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none" style={{ color: '#3b4276' }}>
                        {t('myRequests.heading')}
                    </h1>
                    <p className="my-requests-subtext text-slate-500 text-sm mt-1 m-0">
                        {t('myRequests.subtext')}
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">{t('myRequests.loading')}</div>
                    ) : requests.length === 0 ? (
                        <div className="p-12 text-center">
                            <FontAwesomeIcon icon={faTools} className="text-4xl text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-700 m-0">{t('myRequests.noneFound')}</h3>
                            <p className="text-sm text-slate-500 mt-2">{t('myRequests.noneFoundDesc')}</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {requests.map((req, idx) => (
                                <div key={idx} className="my-requests-item p-4 sm:p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-lg sm:text-xl shrink-0">
                                            {getTypeIcon(req.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-xs font-bold tracking-wider uppercase text-slate-400">{req.type}</span>
                                                <span className="text-xs text-slate-300">•</span>
                                                <span className="text-xs font-medium text-slate-500">
                                                    {t('myRequests.submitted')} {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} {t('myRequests.at')} {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {req.resolved_at && (
                                                    <>
                                                        <span className="text-xs text-slate-300">•</span>
                                                        <span className="text-xs font-semibold text-emerald-600">
                                                            {t('myRequests.resolved')} {new Date(req.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} {t('myRequests.at')} {new Date(req.resolved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            <h3 className="text-base font-bold text-slate-800 m-0">{req.title}</h3>
                                            {req.description && (
                                                <p className="text-xs text-slate-600 m-0 mt-1 line-clamp-2">{req.description}</p>
                                            )}
                                            {req.total_cost !== null && req.total_cost !== undefined && (
                                                <p className="text-xs font-bold text-indigo-600 m-0 mt-1">
                                                    {t('myRequests.serviceCost')}: ₱{Number(req.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            )}
                                            {req.attachment_path && (
                                                <div className="mt-2">
                                                    <a 
                                                        href={`http://localhost/ApartmentManagementSystem_React/backend/${req.attachment_path.replace(/^(\.\.\/)+/, '')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="my-requests-attachment-link inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-indigo-50 px-2.5 py-1.5 rounded-md transition-colors min-h-[36px]"
                                                    >
                                                        {t('myRequests.viewAttachment')}
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="my-requests-actions flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto mt-2 sm:mt-0 pl-0 shrink-0">
                                        {getStatusBadge(req.status)}
                                        
                                        {req.status === 'Pending' && (
                                            <button 
                                                onClick={() => handleCancel(req.id, req.type)}
                                                className="my-requests-cancel-btn px-4 py-2 text-xs font-bold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer min-h-[40px] flex items-center justify-center"
                                            >
                                                {t('myRequests.cancel')}
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
