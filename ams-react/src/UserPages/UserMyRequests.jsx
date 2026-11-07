import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTools, faVideo, faCar, faTimesCircle, faCheckCircle, faClock, faBroom, faSpinner, faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl, cctvFootageLinkUrl } from '../api/fileUrl';
import { useLang, dateLocale } from '../config/i18n';
import InlineAlert from '../Components/InlineAlert';
import ConfirmDialog from '../Components/ConfirmDialog';
import Collapsible from '../Components/tenant/Collapsible';
import '../assets/styles/responsive/user/user-my-requests.responsive.css';
import { SkeletonList } from '../Components/tenant/Skeleton';

// A request is closed once it has an outcome; everything else is still in play.
const SECTION = 'm-0 list-none divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-sm';
const CLOSED = ['Completed', 'Resolved', 'Cancelled', 'Rejected'];

const parseDate = (value) => (value ? new Date(String(value).replace(' ', 'T')) : null);

export default function UserMyRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    // A failed load used to show "no requests found", which was not true.
    const [loadFailed, setLoadFailed] = useState(false);
    const navigate = useNavigate();
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
    const [actionNotice, setActionNotice] = useState('');

    // A repair reported as not fixed goes back to In Progress with the tenant's reason.
    const [reopenTarget, setReopenTarget] = useState(null);
    const [reopenReason, setReopenReason] = useState('');
    const [reopening, setReopening] = useState(false);

    const confirmReopen = async () => {
        if (!reopenTarget || reopening) return;
        const reason = reopenReason.trim();
        if (!reason) { setActionError(t('myRequests.reopenPlaceholder')); return; }
        setReopening(true);
        setActionError('');
        try {
            const response = await api.post('reopen_maintenance_request.php', { id: reopenTarget.id, reason });
            if (response.data.success) {
                await fetchRequests();
            } else {
                setActionError(response.data.message || t('myRequests.reopenFailed'));
            }
        } catch (error) {
            setActionError(error.response?.data?.message || t('myRequests.reopenFailed'));
        } finally {
            setReopening(false);
            setReopenTarget(null);
            setReopenReason('');
        }
    };

    // A repair already under way is not cancelled outright: the tenant asks, management decides.
    // Rating a completed add-on service (once, 1 to 5 stars and an optional comment).
    const [rateTarget, setRateTarget] = useState(null);
    const [stars, setStars] = useState(0);
    const [rateComment, setRateComment] = useState('');
    const [rating, setRating] = useState(false);
    const closeRate = () => { setRateTarget(null); setStars(0); setRateComment(''); };
    const confirmRate = async () => {
        if (!rateTarget || rating) return;
        if (stars < 1) { setActionError(t('myRequests.rateTitle')); return; }
        setRating(true);
        setActionError('');
        setActionNotice('');
        try {
            const response = await api.post('rate_service_request.php', { id: rateTarget.id, rating: stars, comment: rateComment.trim() });
            if (response.data.success) {
                setActionNotice(t('myRequests.rateThanks'));
                await fetchRequests();
            } else {
                setActionError(response.data.message || t('myRequests.rateFailed'));
            }
        } catch (error) {
            setActionError(error.response?.data?.message || t('myRequests.rateFailed'));
        } finally {
            setRating(false);
            closeRate();
        }
    };

    const confirmCancel = async () => {
        if (!cancelTarget || cancelling) return;
        setCancelling(true);
        setActionError('');
        setActionNotice('');
        try {
            const response = await api.post('cancel_request.php', { id: cancelTarget.id, type: cancelTarget.type });
            if (response.data.success) {
                if (response.data.requested) setActionNotice(t('myRequests.cancelAsked'));
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

    const money = (value) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const visitText = (req) => {
        const day = parseDate(`${req.scheduled_date} 00:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
        return `${day} (${t(req.scheduled_window === 'afternoon' ? 'myRequests.visitAfternoon' : 'myRequests.visitMorning')})`;
    };

    const typeLabel = (type) => {
        const key = `myRequests.type.${String(type).toLowerCase()}`;
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const activeRequests = requests.filter((r) => !CLOSED.includes(r.status));
    const closedRequests = requests.filter((r) => CLOSED.includes(r.status));

    const serviceUnit = (unit) => t(unit === 'kg' ? 'serviceBooking.unitKg' : unit === 'hour' ? 'serviceBooking.unitHour' : unit === 'item' ? 'serviceBooking.unitItem' : 'serviceBooking.unitSession');

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

    const getStatusBadge = (status, type) => {
        const label = statusLabel(status);
        // An approved booking is accepted, not done: it must not look like Completed.
        if (type === 'Service' && status === 'Approved') {
            return <span className="px-2.5 py-1 text-xs font-bold bg-sky-100 text-sky-700 rounded-full flex items-center gap-1"><FontAwesomeIcon icon={faCheckCircle} /> {t('myRequests.confirmed')}</span>;
        }
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

    const renderRow = (req) => (
                                <li key={`${req.type}-${req.id}`} className="my-requests-item card-interactive p-4 sm:p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-lg sm:text-xl shrink-0">
                                            {getTypeIcon(req.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-xs font-bold text-slate-700">{typeLabel(req.type)}</span>
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
                                            {(req.status === 'Rejected' || (req.status === 'Cancelled' && req.type === 'Service')) && req.rejection_reason && (
                                                <p className="text-xs text-red-600 m-0 mt-1">{t('myRequests.reason')} {req.rejection_reason}</p>
                                            )}
                                            {req.status === 'Approved' && req.type === 'CCTV' && req.rejection_reason && (
                                                <p className="text-xs text-emerald-700 m-0 mt-1">{t('myRequests.footagePickup')} {req.rejection_reason}</p>
                                            )}
                                            {req.type === 'CCTV' && req.footage_kind && Number(req.footage_expired) !== 1 && (
                                                <div className="mt-2">
                                                    <a
                                                        href={req.footage_kind === 'file' ? fileUrl(req.footage_path) : cctvFootageLinkUrl(req.id)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white no-underline hover:bg-blue-700"
                                                    >
                                                        <FontAwesomeIcon icon={faVideo} /> {req.footage_kind === 'file' ? t('myRequests.footageView') : t('myRequests.footageOpenLink')}
                                                    </a>
                                                    <p className="text-xs text-slate-600 m-0 mt-1">{t('myRequests.footageUntil', { date: formatStamp(req.footage_expires_at) })}</p>
                                                    <p className="text-xs text-amber-700 m-0 mt-1">{t('myRequests.footageNotice')}</p>
                                                </div>
                                            )}
                                            {req.type === 'CCTV' && !req.footage_kind && req.footage_expires_at && (
                                                <p className="text-xs text-slate-500 m-0 mt-1">{t('myRequests.footageExpired')}</p>
                                            )}
                                            {req.type === 'Maintenance' && (
                                                <div className="mt-1 space-y-0.5">
                                                    {req.assigned_to && <p className="text-xs text-slate-600 m-0">{t('myRequests.assignedTo')}: <strong>{req.assigned_to}</strong></p>}
                                                    {(req.status === 'Pending' || req.status === 'In Progress') && (
                                                        req.scheduled_date
                                                            ? <p className="text-xs text-indigo-700 font-semibold m-0">{t('myRequests.visit')}: {visitText(req)}</p>
                                                            : <p className="text-xs text-slate-500 m-0">{t('myRequests.visitPending')}</p>
                                                    )}
                                                    {Number(req.tenant_responsible) === 1 && req.charge_amount !== null && !['Rejected', 'Cancelled'].includes(req.status) && (
                                                        <p className="text-xs font-semibold text-violet-700 m-0">
                                                            {t(req.status === 'Completed' ? 'myRequests.charge' : 'myRequests.chargeEstimate', { amount: money(req.charge_amount) })}
                                                        </p>
                                                    )}
                                                    {req.cancel_requested_at && req.status === 'In Progress' && <p className="text-xs text-amber-700 m-0">{t('myRequests.cancelRequested')}</p>}
                                                    {req.reopen_reason && ['In Progress', 'Pending'].includes(req.status) && <p className="text-xs text-slate-500 m-0">{t('myRequests.reopenReason', { reason: req.reopen_reason })}</p>}
                                                </div>
                                            )}
                                            {req.type === 'Service' && (
                                                <div className="mt-1 space-y-0.5">
                                                    {req.pricing_unit && req.pricing_unit !== 'session' && Number(req.quantity) > 0 && (
                                                        <p className="text-xs text-slate-600 m-0">{Number(req.quantity)} {serviceUnit(req.pricing_unit)}</p>
                                                    )}
                                                    {req.assigned_to && <p className="text-xs text-slate-600 m-0">{t('myRequests.assignedTo')}: <strong>{req.assigned_to}</strong></p>}
                                                    {['Pending', 'Approved', 'In Progress'].includes(req.status) && (
                                                        req.scheduled_date
                                                            ? <p className="text-xs text-indigo-700 font-semibold m-0">{t('myRequests.visit')}: {visitText(req)}</p>
                                                            : <p className="text-xs text-slate-500 m-0">{t('myRequests.svcAwaiting')}</p>
                                                    )}
                                                    {req.admin_note && <p className="text-xs text-slate-600 m-0">{t('myRequests.svcNote', { note: req.admin_note })}</p>}
                                                    {req.booked_total_cost !== null && req.booked_total_cost !== undefined && Number(req.booked_total_cost) !== Number(req.total_cost) && (
                                                        <p className="text-xs font-semibold text-violet-700 m-0">{t('myRequests.svcPriceChanged', { final: money(req.total_cost), booked: money(req.booked_total_cost) })}</p>
                                                    )}
                                                    {req.cancel_requested_at && ['Approved', 'In Progress'].includes(req.status) && <p className="text-xs text-amber-700 m-0">{t('myRequests.cancelRequested')}</p>}
                                                    {req.rating && <p className="text-xs text-amber-700 m-0" aria-label={t('myRequests.yourRating', { stars: req.rating })}>{'★'.repeat(Number(req.rating))}{'☆'.repeat(5 - Number(req.rating))}</p>}
                                                </div>
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
                                        {getStatusBadge(req.status, req.type)}

                                        {req.type === 'Maintenance' && Number(req.can_reopen) === 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setReopenTarget({ id: req.id, title: req.title })}
                                                className="px-4 py-2 text-sm font-bold text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
                                            >
                                                {t('myRequests.notFixed')}
                                            </button>
                                        )}
                                        {req.type === 'Maintenance' && req.status === 'In Progress' && !req.cancel_requested_at && (
                                            <button
                                                type="button"
                                                onClick={() => setCancelTarget({ id: req.id, type: req.type, title: req.title, underWay: true })}
                                                className="my-requests-cancel-btn px-4 py-2 text-sm font-bold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
                                            >
                                                {t('myRequests.requestCancel')}
                                            </button>
                                        )}
                                        {req.type === 'Service' && ['Approved', 'In Progress'].includes(req.status) && !req.cancel_requested_at && (
                                            <button
                                                type="button"
                                                onClick={() => setCancelTarget({ id: req.id, type: req.type, title: req.title, askOnly: Number(req.can_cancel_free) !== 1 })}
                                                aria-label={`${t('myRequests.cancel')}: ${req.title || req.type}`}
                                                className="my-requests-cancel-btn px-4 py-2 text-sm font-bold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
                                            >
                                                {Number(req.can_cancel_free) === 1 ? t('myRequests.cancel') : t('myRequests.requestCancel')}
                                            </button>
                                        )}
                                        {req.type === 'Service' && Number(req.can_rate) === 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setRateTarget({ id: req.id, title: req.title })}
                                                className="px-4 py-2 text-sm font-bold text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
                                            >
                                                {t('myRequests.rate')}
                                            </button>
                                        )}
                                        {req.type === 'Service' && req.service_id && ['Completed', 'Cancelled'].includes(req.status) && (
                                            <Link
                                                to={`/service-booking?serviceId=${req.service_id}`}
                                                className="px-4 py-2 text-sm font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors no-underline min-h-[44px] flex items-center justify-center"
                                            >
                                                {t('myRequests.bookAgain')}
                                            </Link>
                                        )}
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
                                </li>
    );

    return (
        <div className="my-requests-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1000px] space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                <header className="border-b border-slate-200 pb-4">
                    <Link
                        to="/my-room"
                        className="group mb-2 -ml-0.5 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-slate-500 no-underline transition-colors hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                        <span>Back to My Room</span>
                    </Link>
                    <h1 className="my-requests-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none text-brand">
                        {t('myRequests.heading')}
                    </h1>
                    <p className="my-requests-subtext text-slate-500 text-sm mt-1 m-0">
                        {t('myRequests.subtext')}
                    </p>
                </header>


                <InlineAlert onDismiss={() => setActionError('')}>{actionError}</InlineAlert>
                {actionNotice && <InlineAlert tone="info" onDismiss={() => setActionNotice('')}>{actionNotice}</InlineAlert>}

                {loading ? (
                    <SkeletonList label={t('myRequests.loading')} count={4} />
                ) : loadFailed && requests.length === 0 ? (
                    <InlineAlert>
                        {t('common.loadFailed')}{' '}
                        <button type="button" onClick={retryLoad} className="ml-1 min-h-[44px] px-3 rounded-lg bg-white border border-rose-300 text-rose-800 text-sm font-bold cursor-pointer hover:bg-rose-100">
                            {t('common.retry')}
                        </button>
                    </InlineAlert>
                ) : requests.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
                        <FontAwesomeIcon icon={faTools} className="mb-4 text-4xl text-slate-300" aria-hidden="true" />
                        <h2 className="m-0 text-lg font-bold text-slate-800">{t('myRequests.noneFound')}</h2>
                        <p className="m-0 mt-2 text-sm text-slate-600">{t('myRequests.noneFoundDesc')}</p>
                        <button type="button" onClick={() => navigate('/services')} className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border-0 bg-indigo-700 px-5 text-sm font-bold text-white hover:bg-indigo-800">
                            {t('myRequests.makeRequest')}
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Summary: what is in progress, and the most recent request. */}
                        <div className="flex flex-col justify-between gap-4 rounded-2xl bg-brand p-5 text-white sm:flex-row sm:items-center sm:p-6" role="status">
                            <div className="min-w-0">
                                <p className="m-0 text-3xl font-extrabold tabular-nums">
                                    {activeRequests.length === 0 ? t('myRequests.activeNone') : activeRequests.length === 1 ? t('myRequests.activeOne') : t('myRequests.activeMany', { count: activeRequests.length })}
                                </p>
                                <p className="m-0 mt-2 truncate text-sm text-indigo-100">{t('myRequests.latest', { title: requests[0].title || typeLabel(requests[0].type) })}</p>
                            </div>
                            <button type="button" onClick={() => navigate('/services')} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 self-start rounded-xl border-0 bg-white px-5 text-sm font-bold text-brand hover:bg-indigo-50 sm:self-auto">
                                {t('myRequests.makeRequest')}
                            </button>
                        </div>

                        {activeRequests.length > 0 && (
                            <section aria-labelledby="requests-active">
                                <h2 id="requests-active" className="m-0 mb-3 text-xl font-bold text-slate-900">{t('myRequests.activeHeading')}</h2>
                                <ul className={`${SECTION} stagger-children`}>
                                    {activeRequests.map(renderRow)}
                                </ul>
                            </section>
                        )}

                        {closedRequests.length > 0 && (
                            <Collapsible
                                defaultOpen={activeRequests.length === 0}
                                summary={t('myRequests.closedHeading', { count: closedRequests.length })}
                                summaryClassName="text-xl font-bold text-slate-900"
                            >
                                <ul className={`${SECTION} mt-3`}>
                                    {closedRequests.map(renderRow)}
                                </ul>
                            </Collapsible>
                        )}
                    </>
                )}

            </div>

            {rateTarget && (
                <ConfirmDialog
                    title={t('myRequests.rateTitle')}
                    message={
                        <span className="block">
                            <span className="block mb-2">{t('myRequests.rateHelp')}</span>
                            <span className="mb-3 flex gap-1" role="radiogroup" aria-label={t('myRequests.rateTitle')}>
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        role="radio"
                                        aria-checked={stars === n}
                                        aria-label={`${n}`}
                                        onClick={() => setStars(n)}
                                        className={`min-h-[44px] min-w-[44px] cursor-pointer rounded-lg border bg-white text-2xl ${n <= stars ? 'border-amber-300 text-amber-500' : 'border-slate-200 text-slate-300'}`}
                                    >
                                        ★
                                    </button>
                                ))}
                            </span>
                            <textarea
                                rows={3}
                                maxLength={255}
                                value={rateComment}
                                onChange={(e) => setRateComment(e.target.value)}
                                placeholder={t('myRequests.ratePlaceholder')}
                                aria-label={t('myRequests.ratePlaceholder')}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-indigo-500 resize-none"
                            />
                        </span>
                    }
                    confirmLabel={t('myRequests.rateSend')}
                    tone="primary"
                    busy={rating}
                    onConfirm={confirmRate}
                    onClose={closeRate}
                />
            )}

            {reopenTarget && (
                <ConfirmDialog
                    title={t('myRequests.reopenTitle')}
                    message={
                        <span className="block">
                            <span className="block mb-2">{t('myRequests.reopenHelp')}</span>
                            <textarea
                                rows={3}
                                maxLength={255}
                                value={reopenReason}
                                onChange={(e) => setReopenReason(e.target.value)}
                                placeholder={t('myRequests.reopenPlaceholder')}
                                aria-label={t('myRequests.reopenPlaceholder')}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-indigo-500 resize-none"
                            />
                        </span>
                    }
                    confirmLabel={t('myRequests.reopenSend')}
                    tone="primary"
                    busy={reopening}
                    onConfirm={confirmReopen}
                    onClose={() => { setReopenTarget(null); setReopenReason(''); }}
                />
            )}

            {cancelTarget && (
                <ConfirmDialog
                    title={cancelTarget.askOnly ? t('myRequests.requestCancelService') : cancelTarget.underWay ? t('myRequests.requestCancelConfirm') : t('myRequests.cancelConfirm')}
                    confirmLabel={t('myRequests.cancel')}
                    busy={cancelling}
                    onConfirm={confirmCancel}
                    onClose={() => setCancelTarget(null)}
                />
            )}
        </div>
    );
}
