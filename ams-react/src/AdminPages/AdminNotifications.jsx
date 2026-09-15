import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell, faSearch, faTimes, faCheckDouble, faTrashAlt, faClock, faMoneyBillWave,
  faWrench, faExclamationTriangle, faToggleOn, faToggleOff, faCog, faCheck,
  faUsers, faCalendarPlus, faCheckCircle, faTimesCircle, faFileContract, faCar, faVideo,
  faArrowRight, faConciergeBell, faInfoCircle, faPlay
} from '@fortawesome/free-solid-svg-icons';

import api from '../api/axiosConfig';
import { ADMIN_NOTIFICATION_LINKS, ADMIN_NOTIFICATIONS_EVENT, formatRelativeTime } from '../config/notificationLinks';

// Keyed on the types the backend actually writes. Filters used to look for
// 'maintenance' (the data says 'maintenance_request') and 'rent_due' (never in the
// admin feed), so those tabs were always empty.
const typeConfig = {
  occupancy_request: { label: 'Occupancy Request', icon: faUsers, color: 'bg-purple-100 text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  lease_extension_request: { label: 'Lease Extension', icon: faCalendarPlus, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  rent_application: { label: 'Rent Application', icon: faFileContract, color: 'bg-indigo-100 text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
  maintenance_request: { label: 'Maintenance', icon: faWrench, color: 'bg-amber-100 text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  parking_reservation: { label: 'Parking', icon: faCar, color: 'bg-teal-100 text-teal-600', badge: 'bg-teal-100 text-teal-700' },
  cctv_request: { label: 'CCTV Request', icon: faVideo, color: 'bg-slate-100 text-slate-600', badge: 'bg-slate-100 text-slate-700' },
  service_request: { label: 'Service Booking', icon: faConciergeBell, color: 'bg-cyan-100 text-cyan-600', badge: 'bg-cyan-100 text-cyan-700' },
  inquiry: { label: 'Inquiry', icon: faInfoCircle, color: 'bg-sky-100 text-sky-600', badge: 'bg-sky-100 text-sky-700' },
  payment_verification: { label: 'Payment Proof', icon: faMoneyBillWave, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
};

const FILTERS = [
  { key: 'all', label: 'All', types: null },
  { key: 'decide', label: 'Occupancy & Lease', types: ['occupancy_request', 'lease_extension_request'] },
  { key: 'applications', label: 'Applications & Inquiries', types: ['rent_application', 'inquiry'] },
  { key: 'maintenance', label: 'Maintenance', types: ['maintenance_request'] },
  { key: 'services', label: 'Services, CCTV & Parking', types: ['service_request', 'cctv_request', 'parking_reservation'] },
  { key: 'payments', label: 'Payments', types: ['payment_verification'] },
];

const DECIDED_HERE = ['occupancy_request', 'lease_extension_request'];

const AdminNotifications = () => {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [notice, setNotice] = useState(null);

  // Reminder automation settings, loaded from and saved to system_settings. They
  // used to live in localStorage, and a failed save said "saved to local session".
  const [settings, setSettings] = useState({ rentDueEnabled: true, rentDueDays: '3', overdueEnabled: true, overdueDays: '3' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningSweep, setRunningSweep] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('get_notifications.php');
      if (response.data.success) {
        setNotifications(response.data.notifications.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          createdAt: n.created_at,
          read: Number(n.is_read) === 1,
          status: n.status,
        })));
      }
    } catch (e) {
      setNotice({ ok: false, text: e.response?.data?.message || 'Could not load notifications.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
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

  const handleSaveSettings = async () => {
    const days = Number(settings.rentDueDays);
    const interval = Number(settings.overdueDays);
    if (!Number.isInteger(days) || days < 0 || days > 30 || !Number.isInteger(interval) || interval < 1 || interval > 30) {
      setNotice({ ok: false, text: 'Reminder days must be whole numbers: 0–30 days before due, and every 1–30 days when overdue.' });
      return;
    }
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
      setNotice({ ok: false, text: err.response?.data?.message || 'Could not save reminder settings.' });
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
  const handleClearAll = () => {
    if (!window.confirm('Clear your processed notifications? Requests still awaiting a decision are kept.')) return;
    post('delete_notification.php', {}, 'Could not clear notifications.');
  };
  const handleMarkRead = (id) => post('mark_notification_read.php', { notificationId: id }, 'Could not mark as read.');
  const handleDelete = (id) => post('delete_notification.php', { notificationId: id }, 'Could not delete the notification.');

  const toggleSetting = (key) => setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Notifications & Verifications" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">

            {notice && (
              <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold flex justify-between gap-3 ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} className="bg-transparent border-0 cursor-pointer text-current" aria-label="Dismiss"><FontAwesomeIcon icon={faTimes} /></button>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6">

              <div className="flex-1 space-y-4">
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm focus-within:border-indigo-500 transition-all flex-1 max-w-sm">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                    <input type="text" placeholder="Search requests & notifications..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm outline-none border-0 p-0 text-slate-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleMarkAllRead} disabled={unreadCount === 0} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-50">
                      <FontAwesomeIcon icon={faCheckDouble} /> Mark All Read
                    </button>
                    <button onClick={handleClearAll} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50 cursor-pointer transition-colors">
                      <FontAwesomeIcon icon={faTrashAlt} /> Clear Processed
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} className={`lg:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors border ${showSettings ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}>
                      <FontAwesomeIcon icon={faCog} /> Settings
                    </button>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 overflow-x-auto">
                  {FILTERS.map(f => {
                    const count = f.types ? notifications.filter(n => f.types.includes(n.type) && n.status === 'Pending').length : openCount;
                    return (
                      <button key={f.key} onClick={() => setActiveFilter(f.key)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap border-0 cursor-pointer transition-colors ${activeFilter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:bg-slate-50'}`}>
                        {f.label}
                        {count > 0 && (
                          <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Notification Cards */}
                <div className="space-y-2">
                  {loading ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-400">Loading…</div>
                  ) : filtered.length === 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                      <FontAwesomeIcon icon={faBell} className="text-4xl text-slate-200 mb-3" />
                      <p className="text-sm text-slate-500 m-0">Nothing is waiting for you here.</p>
                    </div>
                  )}

                  {filtered.map(n => {
                    const cfg = typeConfig[n.type] || { label: 'General', icon: faBell, color: 'bg-slate-100 text-slate-600', badge: 'bg-slate-100 text-slate-700' };
                    const isPending = n.status === 'Pending';
                    const decideHere = isPending && DECIDED_HERE.includes(n.type);
                    const reviewPath = isPending && !DECIDED_HERE.includes(n.type) ? ADMIN_NOTIFICATION_LINKS[n.type] : null;

                    return (
                      <div key={n.id} className={`bg-white rounded-xl border shadow-sm p-4 flex gap-4 items-start transition-all hover:shadow-md group ${n.read ? 'border-slate-200' : 'border-indigo-200 bg-indigo-50/30'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
                          <FontAwesomeIcon icon={cfg.icon} className="text-sm" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-slate-800 m-0">{n.title}</h4>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${cfg.badge}`}>{cfg.label}</span>
                              {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap shrink-0" title={n.createdAt}>{formatRelativeTime(n.createdAt)}</span>
                          </div>

                          <p className="text-xs text-slate-600 m-0 leading-relaxed">{n.message}</p>

                          {decideHere && (
                            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                              <button
                                onClick={() => handleProcessRequest(n.id, 'approve')}
                                disabled={processingId === n.id}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg border-0 cursor-pointer flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                              >
                                <FontAwesomeIcon icon={faCheckCircle} /> Approve Request
                              </button>
                              <button
                                onClick={() => handleProcessRequest(n.id, 'reject')}
                                disabled={processingId === n.id}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs px-3.5 py-1.5 rounded-lg border border-rose-200 cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50"
                              >
                                <FontAwesomeIcon icon={faTimesCircle} /> Reject
                              </button>
                            </div>
                          )}
                          {reviewPath && (
                            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                              <button
                                onClick={() => { if (!n.read) handleMarkRead(n.id); navigate(reviewPath); }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg border-0 cursor-pointer flex items-center gap-1.5 shadow-sm transition-all"
                              >
                                <span>Review Request</span>
                                <FontAwesomeIcon icon={faArrowRight} />
                              </button>
                              <span className="text-[10px] text-slate-400">Clears from this list once decided.</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {!n.read && (
                            <button onClick={() => handleMarkRead(n.id)} title="Mark read" aria-label="Mark read" className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer transition-colors">
                              <FontAwesomeIcon icon={faCheck} className="text-xs" />
                            </button>
                          )}
                          {!isPending && (
                            <button onClick={() => handleDelete(n.id)} title="Delete" aria-label="Delete" className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 bg-transparent border-0 cursor-pointer transition-colors">
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
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 sticky top-6">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faCog} className="text-slate-400" /> Reminder Automation</h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700 m-0">Rent Due Reminders</p>
                        <p className="text-[10px] text-slate-400 m-0 mt-0.5">Sent before the due date</p>
                      </div>
                      <button onClick={() => toggleSetting('rentDueEnabled')} className="bg-transparent border-0 cursor-pointer text-2xl" aria-label="Toggle rent due reminders">
                        <FontAwesomeIcon icon={settings.rentDueEnabled ? faToggleOn : faToggleOff} className={settings.rentDueEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>
                    <label className="flex items-center justify-between text-xs text-slate-600 gap-2">
                      Days before due date
                      <input type="number" min="0" max="30" value={settings.rentDueDays} disabled={!settings.rentDueEnabled}
                        onChange={e => setSettings(p => ({ ...p, rentDueDays: e.target.value }))}
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm disabled:opacity-50" />
                    </label>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700 m-0">Overdue Alerts</p>
                        <p className="text-[10px] text-slate-400 m-0 mt-0.5">Repeated while unpaid</p>
                      </div>
                      <button onClick={() => toggleSetting('overdueEnabled')} className="bg-transparent border-0 cursor-pointer text-2xl" aria-label="Toggle overdue alerts">
                        <FontAwesomeIcon icon={settings.overdueEnabled ? faToggleOn : faToggleOff} className={settings.overdueEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>
                    <label className="flex items-center justify-between text-xs text-slate-600 gap-2">
                      Repeat every (days)
                      <input type="number" min="1" max="30" value={settings.overdueDays} disabled={!settings.overdueEnabled}
                        onChange={e => setSettings(p => ({ ...p, overdueDays: e.target.value }))}
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm disabled:opacity-50" />
                    </label>
                  </div>

                  <button onClick={handleSaveSettings} disabled={savingSettings} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors border-0 cursor-pointer shadow-sm disabled:opacity-50">
                    {savingSettings ? 'Saving…' : 'Save Settings'}
                  </button>

                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <p className="text-[11px] text-slate-500 m-0 flex gap-2">
                      <FontAwesomeIcon icon={faClock} className="text-slate-400 mt-0.5" />
                      Reminders, overdue alerts and automatic parking billing run once a day on their own.
                    </p>
                    <button onClick={handleRunSweep} disabled={runningSweep} className="w-full py-2 bg-white text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200 hover:bg-indigo-50 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                      <FontAwesomeIcon icon={faPlay} /> {runningSweep ? 'Running…' : 'Run reminder check now'}
                    </button>
                    <p className="text-[10px] text-slate-400 m-0 flex gap-2">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5" />
                      Email and SMS delivery are not available yet; all notices are in-app.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminNotifications;
