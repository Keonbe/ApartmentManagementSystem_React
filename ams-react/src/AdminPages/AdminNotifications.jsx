import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import AdminNotificationModal from '../Components/AdminNotificationModal';
import FollowupMonitor from '../Components/FollowupMonitor';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell, faSearch, faTimes, faCheckDouble, faArchive, faClock, faMoneyBillWave,
  faWrench, faExclamationTriangle, faToggleOn, faToggleOff, faCog, faCheck,
  faUsers, faCalendarPlus, faCheckCircle, faTimesCircle, faFileContract, faCar, faVideo,
  faArrowRight, faConciergeBell, faInfoCircle, faPlay
} from '@fortawesome/free-solid-svg-icons';

import api from '../api/axiosConfig';
import { ADMIN_NOTIFICATION_LINKS, ADMIN_NOTIFICATIONS_EVENT, formatRelativeTime } from '../config/notificationLinks';
import { LIMITS, checkIntRange } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import { clickable } from '../utils/clickable';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { blockNonIntegerKeys, invalidCls } from '../Components/form/formHelpers';
import useUrlFilter from '../hooks/useUrlFilter';
import { btn } from '../Components/admin/ui/styles';
import FilterTabs from '../Components/admin/ui/FilterTabs';
import { SkeletonList } from '../Components/admin/ui/Skeleton';
import LoadError from '../Components/admin/ui/LoadError';

// update_system_settings.php: 0–30 days before due; every 1–30 days when overdue.
const REMINDER_VALIDATORS = {
  rent_due_reminder_days: (v, all) => (all.rentDueEnabled ? checkIntRange(v === '' ? NaN : v, 0, 30, 'Days before due date') : ''),
  overdue_reminder_interval_days: (v, all) => (all.overdueEnabled ? checkIntRange(v === '' ? NaN : v, 1, 30, 'Repeat interval') : ''),
};

// Keyed on the types the backend actually writes. Filters used to look for
// 'maintenance' (the data says 'maintenance_request') and 'rent_due' (never in the
// admin feed), so those tabs were always empty.
const typeConfig = {
  occupancy_request: { label: 'Occupancy Request', icon: faUsers, color: 'bg-purple-100 text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  household_request: { label: 'Household Change', icon: faUsers, color: 'bg-violet-100 text-violet-600', badge: 'bg-violet-100 text-violet-700' },
  lease_extension_request: { label: 'Rent Extension', icon: faCalendarPlus, color: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  new_user: { label: 'New Account', icon: faUsers, color: 'bg-blue-100 text-blue-600', badge: 'bg-blue-100 text-blue-700' },
  rent_application: { label: 'Rent Application', icon: faFileContract, color: 'bg-indigo-100 text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
  maintenance_request: { label: 'Maintenance', icon: faWrench, color: 'bg-amber-100 text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  parking_reservation: { label: 'Parking', icon: faCar, color: 'bg-teal-100 text-teal-600', badge: 'bg-teal-100 text-teal-700' },
  cctv_request: { label: 'CCTV Request', icon: faVideo, color: 'bg-slate-100 text-slate-600', badge: 'bg-slate-100 text-slate-700' },
  service_request: { label: 'Service Booking', icon: faConciergeBell, color: 'bg-cyan-100 text-cyan-600', badge: 'bg-cyan-100 text-cyan-700' },
  inquiry: { label: 'Inquiry', icon: faInfoCircle, color: 'bg-sky-100 text-sky-700', badge: 'bg-sky-100 text-sky-700' },
  unit_waitlist: { label: 'Waitlist', icon: faClock, color: 'bg-sky-100 text-sky-700', badge: 'bg-sky-100 text-sky-700' },
  payment_verification: { label: 'Payment Proof', icon: faMoneyBillWave, color: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  cash_payment_declared: { label: 'Cash Payment', icon: faMoneyBillWave, color: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  payment: { label: 'Payment', icon: faMoneyBillWave, color: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  payment_followup: { label: 'Overdue Payment', icon: faExclamationTriangle, color: 'bg-red-100 text-red-600', badge: 'bg-red-100 text-red-700' },
  document_followup: { label: 'Documents Needed', icon: faFileContract, color: 'bg-amber-100 text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  refund_request: { label: 'Refund Request', icon: faMoneyBillWave, color: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  move_out_request: { label: 'Move-Out Notice', icon: faCalendarPlus, color: 'bg-red-100 text-red-600', badge: 'bg-red-100 text-red-700' },
};

const FILTERS = [
  { key: 'all', label: 'All', types: null },
  { key: 'decide', label: 'Occupancy & Rent', types: ['occupancy_request', 'household_request', 'lease_extension_request'] },
  { key: 'applications', label: 'Applications & Inquiries', types: ['rent_application', 'new_user', 'inquiry', 'unit_waitlist'] },
  { key: 'maintenance', label: 'Maintenance', types: ['maintenance_request'] },
  { key: 'services', label: 'Services, CCTV & Parking', types: ['service_request', 'cctv_request', 'parking_reservation'] },
  { key: 'payments', label: 'Payments', types: ['payment_verification', 'cash_payment_declared', 'payment', 'refund_request', 'payment_followup', 'document_followup'] },
];

const DECIDED_HERE = ['occupancy_request', 'household_request', 'lease_extension_request'];

const AdminNotifications = () => {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  // The list did not load: shown instead of "Nothing is waiting for you here."
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useUrlFilter('filter', 'all', FILTERS.map(f => f.key));
  const [showSettings, setShowSettings] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [archivingAll, setArchivingAll] = useState(false);
  const [notice, setNotice] = useState(null);

  // Reminder automation settings, loaded from and saved to system_settings. They
  // used to live in localStorage, and a failed save said "saved to local session".
  const [settings, setSettings] = useState({ rentDueEnabled: true, rentDueDays: '3', overdueEnabled: true, overdueDays: '3' });
  const [savingSettings, setSavingSettings] = useState(false);
  const reminderErrors = useFieldErrors(REMINDER_VALIDATORS, { idPrefix: 'reminder-' });
  const [runningSweep, setRunningSweep] = useState(false);

  const [selectedNotification, setSelectedNotification] = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('get_notifications.php');
      if (response.data.success) {
        setLoadFailed(false);
        setNotifications(response.data.notifications.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          createdAt: n.created_at,
          read: Number(n.is_read) === 1,
          status: n.status,
          attachment_path: n.attachment_path,
          attachmentPath: n.attachment_path,
          metadata_value: n.metadata_value,
          // Rent-extension requests: the tenant's past-due total (approval is
          // refused while it's above zero — extension_block_reason()).
          tenantOverdueTotal: Number(n.tenant_overdue_total || 0),
        })));
      } else {
        setLoadFailed(true);
      }
    } catch (e) {
      setLoadFailed(true);
      setNotice({ ok: false, text: e.response?.data?.message || 'Could not load notifications.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => { await fetchNotifications(); };
    load();
    window.addEventListener(ADMIN_NOTIFICATIONS_EVENT, fetchNotifications);
    return () => window.removeEventListener(ADMIN_NOTIFICATIONS_EVENT, fetchNotifications);
  }, [fetchNotifications]);

  useEffect(() => {
    api.get('get_system_settings.php').then(res => {
      const s = res.data?.settings || {};
      setSettings({
        rentDueEnabled: s.rent_due_reminders_enabled !== 'false',
        rentDueDays: String(s.rent_due_reminder_days ?? '3'),
        overdueEnabled: s.overdue_reminders_enabled !== 'false',
        overdueDays: String(s.overdue_reminder_interval_days ?? '3'),
      });
    }).catch(() => {});
  }, []);

  const refreshAll = () => {
    fetchNotifications();
    window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_EVENT));
  };

  const reminderValues = () => ({
    ...settings,
    rent_due_reminder_days: settings.rentDueDays,
    overdue_reminder_interval_days: settings.overdueDays,
  });

  const handleSaveSettings = async () => {
    if (savingSettings) return;
    if (!reminderErrors.validateAll(reminderValues())) return;
    const days = Number(settings.rentDueDays);
    const interval = Number(settings.overdueDays);
    setSavingSettings(true);
    try {
      await api.post('update_system_settings.php', {
        rent_due_reminders_enabled: settings.rentDueEnabled ? 'true' : 'false',
        rent_due_reminder_days: String(days),
        overdue_reminders_enabled: settings.overdueEnabled ? 'true' : 'false',
        overdue_reminder_interval_days: String(interval),
      });
      setNotice({ ok: true, text: 'Reminder settings saved.' });
    } catch (err) {
      if (!reminderErrors.applyServerErrors(err)) setNotice({ ok: false, text: apiErrorMessage(err, 'Could not save reminder settings.') });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRunSweep = async () => {
    setRunningSweep(true);
    try {
      const res = await api.post('check_due_date_reminders.php', {});
      const r = res.data;
      setNotice({
        ok: true,
        text: `Reminder check done: ${r.marked_overdue} marked overdue, ${r.upcoming_reminders_sent} due reminders, ${r.overdue_reminders_sent} overdue alerts, ${r.parking_released} parking slots released, ${r.parking_charges_posted} parking fees billed.`,
      });
      refreshAll();
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'The reminder check failed.' });
    } finally {
      setRunningSweep(false);
    }
  };

  const filtered = useMemo(() => {
    const types = FILTERS.find(f => f.key === activeFilter)?.types;
    const q = searchQuery.toLowerCase();
    return notifications.filter(n =>
      (!types || types.includes(n.type)) &&
      (n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q))
    );
  }, [notifications, activeFilter, searchQuery]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const openCount = notifications.filter(n => n.status === 'Pending').length;

  const handleProcessRequest = async (notificationId, action) => {
    setProcessingId(notificationId);
    try {
      const res = await api.post('process_tenant_request.php', { notificationId, action });
      setNotice({ ok: res.data.success, text: res.data.message });
      refreshAll();
    } catch (e) {
      setNotice({ ok: false, text: e.response?.data?.message || 'Could not process the request.' });
    } finally {
      setProcessingId(null);
    }
  };

  const post = async (endpoint, body, failure) => {
    try {
      await api.post(endpoint, body);
      refreshAll();
    } catch (e) {
      setNotice({ ok: false, text: e.response?.data?.message || failure });
    }
  };

  const handleMarkAllRead = () => post('mark_notification_read.php', {}, 'Could not mark notifications as read.');
  const handleArchiveAll = async () => {
    if (archivingAll) return;
    if (!window.confirm('Clear your processed notifications? Requests still awaiting a decision are kept.')) return;

    setArchivingAll(true);
    setNotice(null);
    try {
      const response = await api.post('archive_notification.php', {});
      setNotifications(current => current.filter(notification => notification.status === 'Pending'));
      setNotice({ ok: true, text: response.data?.message || 'Processed notifications archived.' });
      window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_EVENT));
    } catch (error) {
      setNotice({ ok: false, text: error.response?.data?.message || 'Could not archive notifications.' });
    } finally {
      setArchivingAll(false);
    }
  };
  const handleMarkRead = (id) => post('mark_notification_read.php', { notificationId: id }, 'Could not mark as read.');
  const handleArchive = (id) => post('archive_notification.php', { notificationId: id }, 'Could not archive the notification.');

  const handleModalIgnore = (notif) => {
    setSelectedNotification(null);
    if (notif && !notif.read) handleMarkRead(notif.id);
  };

  const handleModalGoToPage = (notif, targetPath) => {
    setSelectedNotification(null);
    if (notif && !notif.read) handleMarkRead(notif.id);
    const path = targetPath || ADMIN_NOTIFICATION_LINKS[notif?.type] || '/admin-notifications';
    navigate(path);
  };

  const handleModalApprove = async (notif) => {
    await handleProcessRequest(notif.id, 'approve');
    setSelectedNotification(null);
  };

  const handleModalReject = async (notif) => {
    await handleProcessRequest(notif.id, 'reject');
    setSelectedNotification(null);
  };

  const toggleSetting = (key) => setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Notifications & Verifications" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">

            {notice && (
              <div className={`mb-4 rounded-card border px-4 py-3 text-body font-semibold flex justify-between gap-3 ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} className="bg-transparent border-0 cursor-pointer text-current" aria-label="Dismiss"><FontAwesomeIcon icon={faTimes} /></button>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6">

              <div className="flex-1 min-w-0 space-y-4">
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-control px-3 py-2 shadow-card focus-within:border-indigo-500 transition-all flex-1 max-w-sm">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" />
                    <input maxLength={LIMITS.search} type="text" placeholder="Search requests & notifications..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-body outline-none border-0 p-0 text-slate-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleMarkAllRead} disabled={unreadCount === 0} className={btn('secondary', 'sm')}>
                      <FontAwesomeIcon icon={faCheckDouble} /> Mark All Read
                    </button>
                    <button onClick={handleArchiveAll} disabled={archivingAll} className="flex items-center gap-1.5 px-3 py-2 text-label font-semibold text-red-600 bg-white border border-slate-200 rounded-control hover:bg-red-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-wait">
                      <FontAwesomeIcon icon={faArchive} /> Clear Processed
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} className={`lg:hidden flex items-center gap-1.5 px-3 py-2 text-label font-semibold rounded-control cursor-pointer transition-colors border ${showSettings ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}>
                      <FontAwesomeIcon icon={faCog} /> Settings
                    </button>
                  </div>
                </div>

                <FollowupMonitor onChanged={fetchNotifications} />

                {/* Filter tabs: they wrap onto a second line instead of forcing the page wider */}
                <FilterTabs
                  label="Filter notifications"
                  value={activeFilter}
                  onChange={setActiveFilter}
                  options={FILTERS.map(f => ({
                    value: f.key,
                    label: f.label,
                    count: loading || (loadFailed && notifications.length === 0) ? null : f.types ? notifications.filter(n => f.types.includes(n.type) && n.status === 'Pending').length : openCount,
                  }))}
                />

                {/* Notification Cards */}
                <div className="stagger-children space-y-2">
                  {loading ? (
                    <div className="bg-white rounded-card border border-slate-200 overflow-hidden"><SkeletonList rows={5} label="Loading notifications…" /></div>
                  ) : loadFailed && notifications.length === 0 ? (
                    <div className="bg-white rounded-card border border-slate-200"><LoadError title="Couldn't load notifications" onRetry={() => { setLoading(true); fetchNotifications(); }} /></div>
                  ) : filtered.length === 0 && (
                    <div className="bg-white rounded-card border border-slate-200 p-12 text-center">
                      <FontAwesomeIcon icon={faBell} className="text-4xl text-slate-200 mb-3" />
                      <p className="text-body text-slate-500 m-0">Nothing is waiting for you here.</p>
                    </div>
                  )}

                  {filtered.map(n => {
                    const cfg = typeConfig[n.type] || { label: 'General', icon: faBell, color: 'bg-slate-100 text-slate-600', badge: 'bg-slate-100 text-slate-700' };
                    const isPending = n.status === 'Pending';
                    const decideHere = isPending && DECIDED_HERE.includes(n.type);
                    const reviewPath = isPending && !DECIDED_HERE.includes(n.type) ? ADMIN_NOTIFICATION_LINKS[n.type] : null;

                    return (
                      <div
                        key={n.id}
                        {...clickable(() => setSelectedNotification(n), { role: null })}
                        className={`card-interactive bg-white rounded-card border shadow-card p-4 flex gap-4 items-start transition-all hover:shadow-raised group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${n.read ? 'border-slate-200' : 'border-indigo-200 bg-indigo-50/30'}`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
                          <FontAwesomeIcon icon={cfg.icon} className="text-sm" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-body font-bold text-slate-800 m-0">{n.title}</h4>
                              <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${cfg.badge}`}>{cfg.label}</span>
                              {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>}
                            </div>
                            <span className="text-caption text-slate-500 font-medium whitespace-nowrap shrink-0" title={n.createdAt}>{formatRelativeTime(n.createdAt)}</span>
                          </div>

                          <p className="text-label text-slate-600 m-0 leading-relaxed">{n.message}</p>

                          {decideHere && n.type === 'lease_extension_request' && n.tenantOverdueTotal > 0 && (
                            <p className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap mt-2 mb-0 inline-flex items-center gap-1.5 bg-red-50 text-red-700 ring-red-200 ring-1 ring-inset">
                              <FontAwesomeIcon icon={faTimesCircle} />
                              Overdue: ₱{n.tenantOverdueTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} — approval is refused until it's settled.
                            </p>
                          )}

                          {decideHere && (
                            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleProcessRequest(n.id, 'approve'); }}
                                disabled={processingId === n.id}
                                className={btn('success', 'sm')}
                              >
                                <FontAwesomeIcon icon={faCheckCircle} /> Approve Request
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleProcessRequest(n.id, 'reject'); }}
                                disabled={processingId === n.id}
                                className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-label px-3.5 py-1.5 rounded-control border border-red-200 cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50"
                              >
                                <FontAwesomeIcon icon={faTimesCircle} /> Reject
                              </button>
                            </div>
                          )}
                          {reviewPath && (
                            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedNotification(n); }}
                                className={btn('primary', 'sm')}
                              >
                                <span>Review Request</span>
                                <FontAwesomeIcon icon={faArrowRight} />
                              </button>
                              <span className="text-caption text-slate-500">Clears from this list once decided.</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {!n.read && (
                            <button onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }} title="Mark read" aria-label="Mark read" className="w-7 h-7 rounded-control flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer transition-colors">
                              <FontAwesomeIcon icon={faCheck} className="text-xs" />
                            </button>
                          )}
                          {!isPending && (
                            <button onClick={(e) => { e.stopPropagation(); handleArchive(n.id); }} title="Archive" aria-label="Archive" className="w-7 h-7 rounded-control flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 bg-transparent border-0 cursor-pointer transition-colors">
                              <FontAwesomeIcon icon={faTimes} className="text-xs" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Settings Panel */}
              <div className={`w-full lg:w-80 shrink-0 ${showSettings ? 'block' : 'hidden lg:block'}`}>
                <div className="bg-white rounded-card border border-slate-200 shadow-card p-6 space-y-6 sticky top-6">
                  <h3 className="text-body font-bold text-slate-800 flex items-center gap-2"><FontAwesomeIcon icon={faCog} className="text-slate-500" /> Reminder Automation</h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-body font-medium text-slate-700 m-0">Rent Due Reminders</p>
                        <p className="text-caption text-slate-500 m-0 mt-0.5">Sent before the due date</p>
                      </div>
                      <button onClick={() => toggleSetting('rentDueEnabled')} className="bg-transparent border-0 cursor-pointer text-page" aria-label="Toggle rent due reminders">
                        <FontAwesomeIcon icon={settings.rentDueEnabled ? faToggleOn : faToggleOff} className={settings.rentDueEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>
                    <label className="flex items-center justify-between text-label text-slate-600 gap-2">
                      Days before due date
                      <input type="number" {...reminderErrors.fieldA11y('rent_due_reminder_days')} inputMode="numeric" min="0" max="30" step="1" value={settings.rentDueDays} disabled={!settings.rentDueEnabled}
                        onKeyDown={blockNonIntegerKeys}
                        onChange={e => { setSettings(p => ({ ...p, rentDueDays: e.target.value })); reminderErrors.clearError('rent_due_reminder_days'); }}
                        onBlur={() => reminderErrors.validateField('rent_due_reminder_days', reminderValues())}
                        className={`w-16 rounded-control border border-slate-200 px-2 py-1 text-center text-body disabled:opacity-50${invalidCls(reminderErrors.errors.rent_due_reminder_days)}`} />
                    </label>
                    <FieldError id="reminder-rent_due_reminder_days" error={reminderErrors.errors.rent_due_reminder_days} />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-body font-medium text-slate-700 m-0">Overdue Alerts</p>
                        <p className="text-caption text-slate-500 m-0 mt-0.5">Repeated while unpaid</p>
                      </div>
                      <button onClick={() => toggleSetting('overdueEnabled')} className="bg-transparent border-0 cursor-pointer text-page" aria-label="Toggle overdue alerts">
                        <FontAwesomeIcon icon={settings.overdueEnabled ? faToggleOn : faToggleOff} className={settings.overdueEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>
                    <label className="flex items-center justify-between text-label text-slate-600 gap-2">
                      Repeat every (days)
                      <input type="number" {...reminderErrors.fieldA11y('overdue_reminder_interval_days')} inputMode="numeric" min="1" max="30" step="1" value={settings.overdueDays} disabled={!settings.overdueEnabled}
                        onKeyDown={blockNonIntegerKeys}
                        onChange={e => { setSettings(p => ({ ...p, overdueDays: e.target.value })); reminderErrors.clearError('overdue_reminder_interval_days'); }}
                        onBlur={() => reminderErrors.validateField('overdue_reminder_interval_days', reminderValues())}
                        className={`w-16 rounded-control border border-slate-200 px-2 py-1 text-center text-body disabled:opacity-50${invalidCls(reminderErrors.errors.overdue_reminder_interval_days)}`} />
                    </label>
                    <FieldError id="reminder-overdue_reminder_interval_days" error={reminderErrors.errors.overdue_reminder_interval_days} />
                  </div>

                  <button onClick={handleSaveSettings} disabled={savingSettings} className={btn('primary', 'md', 'w-full')}>
                    {savingSettings ? 'Saving…' : 'Save Settings'}
                  </button>

                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <p className="text-caption text-slate-500 flex gap-2">
                      <FontAwesomeIcon icon={faClock} className="text-slate-500 mt-0.5" />
                      Reminders, overdue alerts and automatic parking billing run once a day on their own.
                    </p>
                    <button onClick={handleRunSweep} disabled={runningSweep} className="w-full py-2 bg-white text-indigo-700 rounded-control text-label font-bold border border-indigo-200 hover:bg-indigo-50 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                      <FontAwesomeIcon icon={faPlay} /> {runningSweep ? 'Running…' : 'Run reminder check now'}
                    </button>
                    <p className="text-caption text-slate-500 flex gap-2">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5" />
                      These automatic reminders go out in-app and by email, not by SMS. To text a tenant, use Send Due Reminder on the Payments page.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      {selectedNotification && (
        <AdminNotificationModal
          notification={selectedNotification}
          isOpen={Boolean(selectedNotification)}
          onClose={() => setSelectedNotification(null)}
          onIgnore={handleModalIgnore}
          onGoToPage={handleModalGoToPage}
          onApprove={DECIDED_HERE.includes(selectedNotification.type) ? handleModalApprove : null}
          onReject={DECIDED_HERE.includes(selectedNotification.type) ? handleModalReject : null}
          isProcessing={processingId === selectedNotification.id}
        />
      )}

    </div>
  );
};


export default AdminNotifications;
