import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTools, faVideo, faCar, faTimesCircle, faCheckCircle, faClock, faBroom, faSpinner } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { useLang, dateLocale } from '../config/i18n';
import InlineAlert from '../Components/InlineAlert';
import ConfirmDialog from '../Components/ConfirmDialog';
import '../assets/styles/responsive/user/user-my-requests.responsive.css';

const parseDate = (value) => (value ? new Date(String(value).replace(' ', 'T')) : null);

export default function UserMyRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    // A failed load used to show "no requests found", which was not true.
    const [loadFailed, setLoadFailed] = useState(false);
    const { t } = useLang();

    const loadRequests = async () => {
        try {
            const response = await api.get('get_my_requests.php');
            if (response.data.success) {
                setRequests(response.data.requests);
                setLoadFailed(false);
            } else {
                setLoadFailed(true);
            }
        } catch (error) {
            console.error("Failed to fetch requests", error);
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    };

    // Refreshes in place after a cancel: the list stays on screen (it used to
    // blank to "Loading…" first).
    const fetchRequests = () => loadRequests();
    const retryLoad = () => { setLoading(true); loadRequests(); };

    useEffect(() => {
        const load = async () => { await loadRequests(); };
        load();
    }, []);

    // The request being cancelled (asked in a dialog, was window.confirm), and
    // an inline message for a failure (was alert).
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [actionError, setActionError] = useState('');

    const confirmCancel = async () => {
        if (!cancelTarget || cancelling) return;
        setCancelling(true);
        setActionError('');
        try {
            const response = await api.post('cancel_request.php', { id: cancelTarget.id, type: cancelTarget.type });
            if (response.data.success) {
                await fetchRequests();
            } else {
                setActionError(response.data.message || t('myRequests.cancelFailed'));
            }
        } catch (error) {
            setActionError(error.response?.data?.message || t('myRequests.cancelFailed'));
        } finally {
            setCancelling(false);
            setCancelTarget(null);
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

    const statusLabel = (status) => {
        if (!status) return '—';
        const key = `status.${status.toLowerCase().replace(/\s+/g, '')}`;
        const translated = t(key);
        return translated === key ? status : translated;
    };

    const formatStamp = (value) => {
        const d = parseDate(value);
        if (!d) return '—';
        return `${d.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' })} ${t('myRequests.at')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const getStatusBadge = (status) => {
        const label = statusLabel(status);
        switch (status) {
            case 'Pending':
                return <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faClock} /> {label}</span>;
            case 'In Progress':
                return <span className="px-2.5 py-1 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faSpinner} /> {label}</span>;
            case 'Approved':
            case 'Assigned':
            case 'Completed':
            case 'Resolved':
                return <span className="px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faCheckCircle} /> {label}</span>;
            case 'Cancelled':
            case 'Rejected':
                return <span className="px-2.5 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faTimesCircle} /> {label}</span>;
            default:
                return <span className="px-2.5 py-1 text-xs font-bold bg-slate-100 text-slate-700 rounded-full">{label}</span>;
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

                <InlineAlert onDismiss={() => setActionError('')}>{actionError}</InlineAlert>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">{t('myRequests.loading')}</div>
                    ) : loadFailed && requests.length === 0 ? (
                        <div className="p-4">
                            <InlineAlert>
                                {t('common.loadFailed')}{' '}
                                <button type="button" onClick={retryLoad} className="ml-1 min-h-[36px] px-3 rounded-lg bg-white border border-rose-300 text-rose-800 text-sm font-bold cursor-pointer hover:bg-rose-100">
                                    {t('common.retry')}
                                </button>
                            </InlineAlert>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="p-12 text-center">
                            <FontAwesomeIcon icon={faTools} className="text-4xl text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-700 m-0">{t('myRequests.noneFound')}</h3>
                            <p className="text-sm text-slate-500 mt-2">{t('myRequests.noneFoundDesc')}</p>
                        </div>
                    ) : (
                        <div className="stagger-children divide-y divide-slate-100">
                            {requests.map((req) => (
                                <div key={`${req.type}-${req.id}`} className="my-requests-item card-interactive p-4 sm:p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-lg sm:text-xl shrink-0">
                                            {getTypeIcon(req.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-xs font-bold text-slate-500">{req.type}</span>
                                                <span className="text-xs text-slate-300">•</span>
                                                <span className="text-xs font-medium text-slate-500">
                                                    {t('myRequests.submitted')} {formatStamp(req.created_at)}
                                                </span>
                                                {req.resolved_at && (
                                                    <>
                                                        <span className="text-xs text-slate-300">•</span>
                                                        <span className="text-xs font-semibold text-emerald-600">
                                                            {t('myRequests.resolved')} {formatStamp(req.resolved_at)}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            <h3 className="text-base font-bold text-slate-800 m-0">{req.title}</h3>
                                            {req.description && (
                                                <p className="text-xs text-slate-600 m-0 mt-1 line-clamp-2">{req.description}</p>
                                            )}
                                            {req.status === 'Rejected' && req.rejection_reason && (
                                                <p className="text-xs text-red-600 m-0 mt-1">Reason: {req.rejection_reason}</p>
                                            )}
                                            {req.total_cost !== null && req.total_cost !== undefined && (
                                                <p className="text-xs font-bold text-indigo-600 m-0 mt-1">
                                                    {t('myRequests.serviceCost')}: ₱{Number(req.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            )}
                                            {req.attachment_path && (
                                                <div className="mt-2">
                                                    <a
                                                        href={fileUrl(req.attachment_path)}
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
                                                type="button"
                                                onClick={() => setCancelTarget({ id: req.id, type: req.type, title: req.title })}
                                                aria-label={`${t('myRequests.cancel')}: ${req.title || req.type}`}
                                                className="my-requests-cancel-btn px-4 py-2 text-sm font-bold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
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

            {cancelTarget && (
                <ConfirmDialog
                    title={t('myRequests.cancelConfirm')}
                    confirmLabel={t('myRequests.cancel')}
                    busy={cancelling}
                    onConfirm={confirmCancel}
                    onClose={() => setCancelTarget(null)}
                />
            )}
        </div>
    );
}
