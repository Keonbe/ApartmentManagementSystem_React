import React, { useState, useMemo, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell, faSearch, faTimes, faCheckDouble, faTrashAlt, faClock, faDollarSign,
  faWrench, faExclamationTriangle, faEnvelope, faMobileAlt, faToggleOn, faToggleOff,
  faCog, faFilter, faCheck, faCircle
} from '@fortawesome/free-solid-svg-icons';

const initialNotifications = [
  { id: 1, type: 'rent_due', title: 'Rent Due Reminder', message: 'Unit E — Pedro Cruz rent of ₱6,500 is due in 3 days (July 5).', time: '2 hours ago', timestamp: '2024-07-02 10:00', read: false },
  { id: 2, type: 'overdue', title: 'Overdue Alert', message: 'Unit G — Ben Flores has an overdue balance of ₱6,500 (7 days past due).', time: '3 hours ago', timestamp: '2024-07-02 09:00', read: false },
  { id: 3, type: 'maintenance', title: 'Maintenance Update', message: 'REQ-003 (Clogged kitchen drain) has been marked as In Progress. Assigned to Mang Totoy.', time: '5 hours ago', timestamp: '2024-07-02 07:00', read: false },
  { id: 4, type: 'rent_due', title: 'Rent Due Reminder', message: 'Unit F — Rosa Dela Cruz rent of ₱7,500 is due in 5 days (July 7).', time: 'Yesterday', timestamp: '2024-07-01 14:00', read: true },
  { id: 5, type: 'sms', title: 'SMS Sent', message: 'Rent reminder SMS sent to Pedro Cruz (0919-345-6789).', time: 'Yesterday', timestamp: '2024-07-01 10:00', read: true },
  { id: 6, type: 'email', title: 'Email Sent', message: 'Monthly invoice email sent to maria.santos@email.com for Unit A.', time: '2 days ago', timestamp: '2024-06-30 09:00', read: true },
  { id: 7, type: 'overdue', title: 'Overdue Alert', message: 'Unit G — Ben Flores has an overdue balance of ₱6,500 (5 days past due).', time: '2 days ago', timestamp: '2024-06-30 08:00', read: true },
  { id: 8, type: 'maintenance', title: 'Maintenance Completed', message: 'REQ-004 (Electrical short in outlet) has been resolved.', time: '3 days ago', timestamp: '2024-06-29 16:00', read: true },
  { id: 9, type: 'rent_due', title: 'Rent Due Reminder', message: 'Unit J — Gloria Tan rent of ₱6,500 is due tomorrow.', time: '4 days ago', timestamp: '2024-06-28 10:00', read: true },
  { id: 10, type: 'sms', title: 'SMS Sent', message: 'Overdue notice SMS sent to Ben Flores (0921-567-8901).', time: '5 days ago', timestamp: '2024-06-27 09:00', read: true },
];

const typeConfig = {
  rent_due: { label: 'Rent Due', icon: faClock, color: 'bg-blue-100 text-blue-600', badge: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'Overdue', icon: faExclamationTriangle, color: 'bg-red-100 text-red-600', badge: 'bg-red-100 text-red-700' },
  maintenance: { label: 'Maintenance', icon: faWrench, color: 'bg-amber-100 text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  sms: { label: 'SMS', icon: faMobileAlt, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  email: { label: 'Email', icon: faEnvelope, color: 'bg-indigo-100 text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
};

const AdminNotifications = () => {
  const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
  const emailKey = loggedInUser.email_address || "default_admin";

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem(`admin_notifications_${emailKey}`);
    return saved ? JSON.parse(saved) : initialNotifications;
  });
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Settings state
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem(`admin_notif_settings_${emailKey}`);
    return saved ? JSON.parse(saved) : {
      rentDueEnabled: true, rentDueDays: '3',
      overdueEnabled: true, overdueDays: '1',
      maintenanceEnabled: true,
      smsEnabled: true, smsPhone: '0917-123-4567',
      emailEnabled: true, emailAddress: 'admin@apartment.com',
    };
  });

  // Sync state with localStorage updates (from header or other pages)
  useEffect(() => {
    const handleSync = () => {
      const saved = localStorage.getItem(`admin_notifications_${emailKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setNotifications(prev => {
          if (JSON.stringify(prev) !== saved) {
            return parsed;
          }
          return prev;
        });
      }
    };
    window.addEventListener('admin_notifications_updated', handleSync);
    return () => window.removeEventListener('admin_notifications_updated', handleSync);
  }, [emailKey]);

  // Persist state to localStorage and emit sync event
  useEffect(() => {
    const currentStr = JSON.stringify(notifications);
    const saved = localStorage.getItem(`admin_notifications_${emailKey}`);
    if (saved !== currentStr) {
      localStorage.setItem(`admin_notifications_${emailKey}`, currentStr);
      window.dispatchEvent(new Event('admin_notifications_updated'));
    }
  }, [notifications, emailKey]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem(`admin_notif_settings_${emailKey}`, JSON.stringify(settings));
  }, [settings, emailKey]);

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'rent_due', label: 'Rent Due' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'sms', label: 'SMS' },
    { key: 'email', label: 'Email' },
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

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClearAll = () => {
    setNotifications([]);
  };

  const handleToggleRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n));
  };

  const handleDelete = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const toggleSetting = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Notifications" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">

            <div className="flex flex-col lg:flex-row gap-6">
              
              {/* Main Notification List */}
              <div className="flex-1 space-y-4">
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm focus-within:border-indigo-500 transition-all flex-1 max-w-sm">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                    <input type="text" placeholder="Search notifications..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm outline-none border-0 p-0 text-slate-800" />
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
                      <p className="text-sm text-slate-500 m-0">No notifications found.</p>
                    </div>
                  )}
                  {filtered.map(n => {
                    const cfg = typeConfig[n.type];
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

                  {/* Automation Toggles */}
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
                    {settings.rentDueEnabled && (
                      <div className="ml-4 flex items-center gap-2">
                        <span className="text-xs text-slate-500">Send</span>
                        <select value={settings.rentDueDays} onChange={e => setSettings(p => ({...p, rentDueDays: e.target.value}))} className="px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-700 outline-none">
                          <option value="1">1 day</option><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option>
                        </select>
                        <span className="text-xs text-slate-500">before due</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700 m-0">Overdue Alerts</p>
                        <p className="text-[10px] text-slate-400 m-0 mt-0.5">Auto-send after due date</p>
                      </div>
                      <button onClick={() => toggleSetting('overdueEnabled')} className="bg-transparent border-0 cursor-pointer text-2xl">
                        <FontAwesomeIcon icon={settings.overdueEnabled ? faToggleOn : faToggleOff} className={settings.overdueEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>
                    {settings.overdueEnabled && (
                      <div className="ml-4 flex items-center gap-2">
                        <span className="text-xs text-slate-500">Send</span>
                        <select value={settings.overdueDays} onChange={e => setSettings(p => ({...p, overdueDays: e.target.value}))} className="px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-700 outline-none">
                          <option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option>
                        </select>
                        <span className="text-xs text-slate-500">after due</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700 m-0">Maintenance Updates</p>
                        <p className="text-[10px] text-slate-400 m-0 mt-0.5">On status changes</p>
                      </div>
                      <button onClick={() => toggleSetting('maintenanceEnabled')} className="bg-transparent border-0 cursor-pointer text-2xl">
                        <FontAwesomeIcon icon={settings.maintenanceEnabled ? faToggleOn : faToggleOff} className={settings.maintenanceEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>
                  </div>

                  <hr className="border-slate-100 m-0" />

                  {/* Channels */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Channels</h4>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faMobileAlt} className="text-emerald-500" />
                        <p className="text-sm font-medium text-slate-700 m-0">SMS Notifications</p>
                      </div>
                      <button onClick={() => toggleSetting('smsEnabled')} className="bg-transparent border-0 cursor-pointer text-2xl">
                        <FontAwesomeIcon icon={settings.smsEnabled ? faToggleOn : faToggleOff} className={settings.smsEnabled ? 'text-emerald-600' : 'text-slate-300'} />
                      </button>
                    </div>
                    {settings.smsEnabled && (
                      <input type="text" value={settings.smsPhone} onChange={e => setSettings(p => ({...p, smsPhone: e.target.value}))} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none text-slate-700 bg-slate-50 focus:bg-white focus:border-indigo-500" placeholder="Admin phone number" />
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faEnvelope} className="text-indigo-500" />
                        <p className="text-sm font-medium text-slate-700 m-0">Email Notifications</p>
                      </div>
                      <button onClick={() => toggleSetting('emailEnabled')} className="bg-transparent border-0 cursor-pointer text-2xl">
                        <FontAwesomeIcon icon={settings.emailEnabled ? faToggleOn : faToggleOff} className={settings.emailEnabled ? 'text-indigo-600' : 'text-slate-300'} />
                      </button>
                    </div>
                    {settings.emailEnabled && (
                      <input type="text" value={settings.emailAddress} onChange={e => setSettings(p => ({...p, emailAddress: e.target.value}))} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none text-slate-700 bg-slate-50 focus:bg-white focus:border-indigo-500" placeholder="Admin email address" />
                    )}
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
