import React, { useState, useMemo, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell, faSearch, faTimes, faCheckDouble, faTrashAlt, faClock, faDollarSign,
  faWrench, faExclamationTriangle, faEnvelope, faMobileAlt, faToggleOn, faToggleOff,
  faCog, faFilter, faCheck, faCircle, faUsers, faCalendarPlus, faCheckCircle, faTimesCircle
} from '@fortawesome/free-solid-svg-icons';

import api from '../api/axiosConfig';

const typeConfig = {
  rent_due: { label: 'Rent Due', icon: faClock, color: 'bg-blue-100 text-blue-600', badge: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'Overdue', icon: faExclamationTriangle, color: 'bg-red-100 text-red-600', badge: 'bg-red-100 text-red-700' },
  maintenance: { label: 'Maintenance', icon: faWrench, color: 'bg-amber-100 text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  occupancy_request: { label: 'Occupancy Request', icon: faUsers, color: 'bg-purple-100 text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  lease_extension_request: { label: 'Lease Extension', icon: faCalendarPlus, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  sms: { label: 'SMS', icon: faMobileAlt, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  email: { label: 'Email', icon: faEnvelope, color: 'bg-indigo-100 text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
};

const AdminNotifications = () => {
  const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
  const emailKey = loggedInUser.email_address || "default_admin";

  const [notifications, setNotifications] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem(`admin_notif_settings_${emailKey}`);
    return saved ? JSON.parse(saved) : {
      rentDueEnabled: true, rentDueDays: '3',
      overdueEnabled: true, overdueDays: '3',
      maintenanceEnabled: true,
      smsEnabled: false, smsPhone: '',
      emailEnabled: true, emailAddress: emailKey
    };
  });

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    if (!loggedInUser.id) return;
    try {
      const response = await api.get(`get_notifications.php?userId=${loggedInUser.id}`);
      if (response.data.success) {
        setNotifications(response.data.notifications.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          time: new Date(n.created_at).toLocaleString(),
          read: n.is_read,
          status: n.status || 'Pending'
        })));
      }
    } catch(e) {
      console.error(e);
    }
  };

  useEffect(() => {
    localStorage.setItem(`admin_notif_settings_${emailKey}`, JSON.stringify(settings));
  }, [settings, emailKey]);

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'occupancy_request', label: 'Occupancy Requests' },
    { key: 'lease_extension_request', label: 'Lease Extensions' },
    { key: 'rent_due', label: 'Rent Due' },
    { key: 'maintenance', label: 'Maintenance' },
  ];

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      const matchFilter = activeFilter === 'all' || n.type === activeFilter;
      const matchSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          n.message.toLowerCase().includes(searchQuery.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [notifications, activeFilter, searchQuery]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleProcessRequest = async (notificationId, action) => {
    setProcessingId(notificationId);
    try {
      const res = await api.post('process_tenant_request.php', { notificationId, action });
      if (res.data.success) {
        alert(res.data.message);
        fetchNotifications();
      } else {
        alert(res.data.message || 'Failed to process decision.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error while executing decision.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (!loggedInUser.id) return;
    try {
      await api.post('mark_notification_read.php', { userId: loggedInUser.id });
      fetchNotifications();
    } catch(e) {}
  };

  const handleClearAll = async () => {
    if (!loggedInUser.id) return;
    try {
      await api.post('delete_notification.php', { userId: loggedInUser.id });
      fetchNotifications();
    } catch(e) {}
  };

  const handleToggleRead = async (id) => {
    try {
      await api.post('mark_notification_read.php', { notificationId: id });
      fetchNotifications();
    } catch(e) {}
  };

  const handleDelete = async (id) => {
    try {
      await api.post('delete_notification.php', { notificationId: id });
      fetchNotifications();
    } catch(e) {}
  };

  const toggleSetting = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Notifications & Verifications" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">

            <div className="flex flex-col lg:flex-row gap-6">
              
              <div className="flex-1 space-y-4">
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm focus-within:border-indigo-500 transition-all flex-1 max-w-sm">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                    <input type="text" placeholder="Search requests & notifications..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm outline-none border-0 p-0 text-slate-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleMarkAllRead} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                      <FontAwesomeIcon icon={faCheckDouble} /> Mark All Read
                    </button>
                    <button onClick={handleClearAll} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50 cursor-pointer transition-colors">
                      <FontAwesomeIcon icon={faTrashAlt} /> Clear All
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} className={`lg:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors border ${showSettings ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}>
                      <FontAwesomeIcon icon={faCog} /> Settings
                    </button>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 overflow-x-auto">
                  {filters.map(f => (
                    <button key={f.key} onClick={() => setActiveFilter(f.key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap border-0 cursor-pointer transition-colors ${activeFilter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:bg-slate-50'}`}>
                      {f.label}
                      {f.key === 'all' && unreadCount > 0 && (
                        <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Notification Cards */}
                <div className="space-y-2">
                  {filtered.length === 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                      <FontAwesomeIcon icon={faBell} className="text-4xl text-slate-200 mb-3" />
                      <p className="text-sm text-slate-500 m-0">No pending verification requests found.</p>
                    </div>
                  )}

                  {filtered.map(n => {
                    const cfg = typeConfig[n.type] || { label: 'General', icon: faBell, color: 'bg-slate-100 text-slate-600', badge: 'bg-slate-100 text-slate-700' };
                    const isActionable = (n.type === 'occupancy_request' || n.type === 'lease_extension_request') && n.status === 'Pending';

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
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap shrink-0">{n.time}</span>
                          </div>
                          
                          <p className="text-xs text-slate-600 m-0 leading-relaxed">{n.message}</p>

                          {/* ACTION BUTTONS FOR ADMIN VERIFICATION */}
                          {isActionable ? (
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
                          ) : n.status !== 'Pending' && (n.type === 'occupancy_request' || n.type === 'lease_extension_request') && (
                            <span className={`inline-block mt-2 text-[10px] font-extrabold px-2 py-0.5 rounded ${n.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              Decision: {n.status}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => handleToggleRead(n.id)} title={n.read ? 'Mark unread' : 'Mark read'} className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer transition-colors">
                            <FontAwesomeIcon icon={n.read ? faCircle : faCheck} className="text-xs" />
                          </button>
                          <button onClick={() => handleDelete(n.id)} title="Delete" className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 bg-transparent border-0 cursor-pointer transition-colors">
                            <FontAwesomeIcon icon={faTimes} className="text-xs" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Settings Panel */}
              <div className={`w-full lg:w-80 shrink-0 ${showSettings ? 'block' : 'hidden lg:block'}`}>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 sticky top-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faCog} className="text-slate-400" /> Notification Settings</h3>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Automation</h4>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700 m-0">Rent Due Reminders</p>
                        <p className="text-[10px] text-slate-400 m-0 mt-0.5">Auto-send before due date</p>
                      </div>
                      <button onClick={() => toggleSetting('rentDueEnabled')} className="bg-transparent border-0 cursor-pointer text-2xl">
                        <FontAwesomeIcon icon={settings.rentDueEnabled ? faToggleOn : faToggleOff} className={settings.rentDueEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700 m-0">Overdue Alerts</p>
                        <p className="text-[10px] text-slate-400 m-0 mt-0.5">Auto-send after due date</p>
                      </div>
                      <button onClick={() => toggleSetting('overdueEnabled')} className="bg-transparent border-0 cursor-pointer text-2xl">
                        <FontAwesomeIcon icon={settings.overdueEnabled ? faToggleOn : faToggleOff} className={settings.overdueEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>
                  </div>

                  <button onClick={() => alert('Settings saved successfully!')} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors border-0 cursor-pointer shadow-sm">
                    Save Settings
                  </button>
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