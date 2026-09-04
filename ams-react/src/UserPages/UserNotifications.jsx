import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell, faSearch, faTimes, faCheckDouble, faTrash, faClock,
  faExclamationTriangle, faFileContract, faCheckCircle, faInfoCircle,
  faCog, faToggleOn, faToggleOff, faCheck, faCircle, faWrench, faArrowRight
} from '@fortawesome/free-solid-svg-icons';

import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/user-notifications.responsive.css';

const typeConfig = {
  warning: { label: 'Alert', icon: faExclamationTriangle, color: 'bg-red-50 text-red-500 border-red-100', badge: 'bg-red-100 text-red-700' },
  success: { label: 'Update', icon: faCheckCircle, color: 'bg-emerald-50 text-emerald-500 border-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  action: { label: 'Action Required', icon: faFileContract, color: 'bg-indigo-50 text-indigo-500 border-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
  info: { label: 'Info', icon: faInfoCircle, color: 'bg-blue-50 text-blue-500 border-blue-100', badge: 'bg-blue-100 text-blue-700' },
  maintenance_update: { label: 'Maintenance', icon: faWrench, color: 'bg-amber-50 text-amber-500 border-amber-100', badge: 'bg-amber-100 text-amber-700' },
  application_update: { label: 'Application', icon: faFileContract, color: 'bg-indigo-50 text-indigo-500 border-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
  rent_due: { label: 'Rent Due', icon: faClock, color: 'bg-blue-50 text-blue-600 border-blue-100', badge: 'bg-blue-100 text-blue-800' },
  overdue: { label: 'Overdue Alert', icon: faExclamationTriangle, color: 'bg-rose-50 text-rose-600 border-rose-100', badge: 'bg-rose-100 text-rose-800' },
  billing: { label: 'Billing', icon: faFileContract, color: 'bg-indigo-50 text-indigo-600 border-indigo-100', badge: 'bg-indigo-100 text-indigo-800' },
};

export default function UserNotifications() {
  const navigate = useNavigate();
  const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
  const emailKey = loggedInUser.email_address || "default";
  const { t } = useLang();

  // State to hold notifications
  const [notifications, setNotifications] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem(`user_notif_pref_${emailKey}`);
    return saved ? JSON.parse(saved) : {
      rentReminders: true,
      maintenanceUpdates: true,
      leaseAlerts: true,
      emailChannel: true,
      smsChannel: false
    };
  });

  useEffect(() => {
    fetchNotifications();
    const handleSync = () => {
      fetchNotifications();
    };
    window.addEventListener('user_notifications_updated', handleSync);
    return () => window.removeEventListener('user_notifications_updated', handleSync);
  }, []);

  const fetchNotifications = async () => {
    if (!loggedInUser.id) return;
    try {
      const response = await api.get(`get_notifications.php?userId=${loggedInUser.id}`);
      if (response.data.success) {
        setNotifications(response.data.notifications.map(n => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          time: new Date(n.created_at).toLocaleString(),
          read: n.is_read
        })));
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleToggleRead = async (id) => {
    const notif = notifications.find(n => n.id === id);
    if (!notif) return;
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

  const togglePreference = (key) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    localStorage.setItem(`user_notif_pref_${emailKey}`, JSON.stringify(updated));
  };

  // Filtered notifications logic
  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      const matchesFilter = activeFilter === 'all' || 
                            (activeFilter === 'unread' && !n.read) ||
                            (activeFilter === 'read' && n.read) ||
                            (activeFilter === 'rent_due' && ['rent_due', 'overdue', 'billing'].includes(n.type)) ||
                            (n.type === activeFilter);
      const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            n.message.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [notifications, activeFilter, searchQuery]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const filterTabs = [
    { key: 'all', label: t('notifications.tabAll') },
    { key: 'unread', label: t('notifications.tabUnread') },
    { key: 'rent_due', label: 'Rent & Billing' },
    { key: 'warning', label: t('notifications.tabAlerts') },
    { key: 'success', label: t('notifications.tabUpdates') },
    { key: 'action', label: t('notifications.tabActionItems') },
  ];

  return (
    <div className="user-notif-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center select-none text-left animate-fade-in">
      <div className="w-full max-w-[1400px] flex flex-col gap-6 sm:gap-8">
        
        {/* Page Title */}
        <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1
              className="user-notif-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight text-slate-800"
              style={{ color: '#3b4276' }}
            >
              {t('notifications.heading')}
            </h1>
            <p className="user-notif-subtext text-slate-500 text-sm mt-1 m-0">
              {t('notifications.subtext')}
            </p>
          </div>
          <div className="user-notif-header-actions flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button 
              onClick={handleMarkAllRead} 
              disabled={unreadCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#3b4276] bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm min-h-[40px]"
            >
              <FontAwesomeIcon icon={faCheckDouble} /> {t('notifications.markAllRead')}
            </button>
            <button 
              onClick={handleClearAll} 
              disabled={notifications.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-600 bg-white border border-slate-200 rounded-xl hover:bg-rose-50 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm min-h-[40px]"
            >
              <FontAwesomeIcon icon={faTrash} /> {t('notifications.clearAll')}
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className={`lg:hidden flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer border shadow-sm min-h-[40px] ${showSettings ? 'bg-[#3b4276] text-white border-[#3b4276]' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
            >
              <FontAwesomeIcon icon={faCog} /> {t('notifications.preferences')}
            </button>
          </div>
        </div>

        {/* Layout Grid */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* Main List Column */}
          <div className="flex-1 w-full flex flex-col gap-6">
            
            {/* Search and Tabs Header */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              {/* Search Bar */}
              <div className="user-notif-search-container flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm focus-within:border-indigo-500 transition-all flex-grow max-w-md">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                <input 
                  type="text" 
                  placeholder={t('notifications.searchPlaceholder')} 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="user-notif-search-input flex-grow bg-transparent text-sm outline-none border-0 p-0 text-slate-800 placeholder-slate-400" 
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="bg-transparent border-0 text-slate-400 hover:text-slate-600 cursor-pointer p-0">
                    <FontAwesomeIcon icon={faTimes} className="text-xs" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="user-notif-tabs-bar flex gap-2 p-1 bg-slate-200/50 rounded-xl overflow-x-auto select-none no-scrollbar">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`user-notif-tab-btn px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap border-0 cursor-pointer transition-all duration-200 ${activeFilter === tab.key ? 'bg-[#3b4276] text-white shadow-sm' : 'bg-transparent text-slate-500 hover:bg-slate-200/80 hover:text-slate-700'}`}
                >
                  {tab.label}
                  {tab.key === 'unread' && unreadCount > 0 && (
                    <span className="ml-1.5 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Cards Container */}
            <div className="flex flex-col gap-3">
              {filteredNotifications.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center shadow-sm flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4 text-[#3b4276]/30">
                    <FontAwesomeIcon icon={faBell} className="text-3xl" />
                  </div>
                  <h3 className="text-base font-bold text-slate-700 m-0">{t('notifications.noFound')}</h3>
                  <p className="text-slate-400 text-xs mt-1 max-w-sm m-0">
                    {searchQuery ? t('notifications.noFoundSearch') : t('notifications.noFoundDesc')}
                  </p>
                </div>
              ) : (
                filteredNotifications.map(n => {
                  const cfg = typeConfig[n.type] || typeConfig.info;
                  return (
                    <div 
                      key={n.id} 
                      className={`user-notif-card bg-white rounded-2xl border shadow-sm p-4 sm:p-5 flex gap-3 sm:gap-4 items-start transition-all duration-200 hover:shadow-md group relative overflow-hidden ${n.read ? 'border-slate-200' : 'border-indigo-100 bg-indigo-50/10'}`}
                    >
                      {/* Read indicator bar */}
                      {!n.read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600"></div>
                      )}

                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${cfg.color} shadow-sm`}>
                        <FontAwesomeIcon icon={cfg.icon} className="text-base" />
                      </div>

                      {/* Details */}
                      <div className="flex-grow min-w-0">
                        <div className="flex items-start justify-between gap-2 sm:gap-3 flex-wrap sm:flex-nowrap mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`text-sm m-0 leading-snug ${!n.read ? 'text-slate-800 font-extrabold' : 'text-slate-700 font-bold'}`}>
                              {n.title}
                            </h4>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-extrabold tracking-wide uppercase ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{n.time}</span>
                        </div>
                        <p className="text-xs text-slate-500 m-0 leading-relaxed mt-0.5">{n.message}</p>
                        {['rent_due', 'overdue', 'billing'].includes(n.type) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate('/pay-bills'); }}
                            className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 cursor-pointer transition-colors"
                          >
                            <span>Pay Bill</span>
                            <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                          </button>
                        )}
                      </div>

                      {/* Action buttons - on mobile visible, on desktop hover */}
                      <div className="user-notif-actions flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                        <button 
                          onClick={() => handleToggleRead(n.id)} 
                          title={n.read ? 'Mark as unread' : 'Mark as read'} 
                          className="user-notif-action-btn w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer transition-colors"
                        >
                          <FontAwesomeIcon icon={n.read ? faCircle : faCheck} className="text-[11px]" />
                        </button>
                        <button 
                          onClick={() => handleDelete(n.id)} 
                          title="Delete" 
                          className="user-notif-action-btn w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 bg-transparent border-0 cursor-pointer transition-colors"
                        >
                          <FontAwesomeIcon icon={faTimes} className="text-xs" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* Preferences Side Column */}
          <div className={`user-notif-pref-panel w-full lg:w-[360px] shrink-0 sticky top-24 ${showSettings ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <FontAwesomeIcon icon={faCog} className="text-slate-400" />
                <h3 className="text-sm font-bold text-slate-800 m-0">{t('notifications.prefTitle')}</h3>
              </div>

              {/* Preference Item Blocks */}
              <div className="space-y-5 text-left">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest m-0">ALERTS & MESSAGES</h4>
                
                {/* Pref 1 */}
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <p className="text-xs font-bold text-slate-700 m-0">{t('notifications.prefRent')}</p>
                    <p className="text-[10px] text-slate-400 m-0 mt-0.5">{t('notifications.prefRentDesc')}</p>
                  </div>
                  <button onClick={() => togglePreference('rentReminders')} className="bg-transparent border-0 cursor-pointer text-2xl p-0 flex items-center">
                    <FontAwesomeIcon 
                      icon={preferences.rentReminders ? faToggleOn : faToggleOff} 
                      className={preferences.rentReminders ? 'text-indigo-600' : 'text-slate-300'} 
                    />
                  </button>
                </div>

                {/* Pref 2 */}
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <p className="text-xs font-bold text-slate-700 m-0">{t('notifications.prefMaint')}</p>
                    <p className="text-[10px] text-slate-400 m-0 mt-0.5">{t('notifications.prefMaintDesc')}</p>
                  </div>
                  <button onClick={() => togglePreference('maintenanceUpdates')} className="bg-transparent border-0 cursor-pointer text-2xl p-0 flex items-center">
                    <FontAwesomeIcon 
                      icon={preferences.maintenanceUpdates ? faToggleOn : faToggleOff} 
                      className={preferences.maintenanceUpdates ? 'text-indigo-600' : 'text-slate-300'} 
                    />
                  </button>
                </div>

                {/* Pref 3 */}
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <p className="text-xs font-bold text-slate-700 m-0">{t('notifications.prefLease')}</p>
                    <p className="text-[10px] text-slate-400 m-0 mt-0.5">{t('notifications.prefLeaseDesc')}</p>
                  </div>
                  <button onClick={() => togglePreference('leaseAlerts')} className="bg-transparent border-0 cursor-pointer text-2xl p-0 flex items-center">
                    <FontAwesomeIcon 
                      icon={preferences.leaseAlerts ? faToggleOn : faToggleOff} 
                      className={preferences.leaseAlerts ? 'text-indigo-600' : 'text-slate-300'} 
                    />
                  </button>
                </div>
              </div>

              <hr className="border-slate-100 m-0" />

              <div className="space-y-5 text-left">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest m-0">CHANNELS</h4>

                {/* Channel 1 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700 m-0">{t('notifications.prefEmail')}</p>
                    <p className="text-[10px] text-slate-400 m-0 mt-0.5">Forward alerts to {emailKey}.</p>
                  </div>
                  <button onClick={() => togglePreference('emailChannel')} className="bg-transparent border-0 cursor-pointer text-2xl p-0 flex items-center">
                    <FontAwesomeIcon 
                      icon={preferences.emailChannel ? faToggleOn : faToggleOff} 
                      className={preferences.emailChannel ? 'text-indigo-600' : 'text-slate-300'} 
                    />
                  </button>
                </div>

                {/* Channel 2 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700 m-0">{t('notifications.prefSms')}</p>
                    <p className="text-[10px] text-slate-400 m-0 mt-0.5">{t('notifications.prefSmsDesc')}</p>
                  </div>
                  <button onClick={() => togglePreference('smsChannel')} className="bg-transparent border-0 cursor-pointer text-2xl p-0 flex items-center">
                    <FontAwesomeIcon 
                      icon={preferences.smsChannel ? faToggleOn : faToggleOff} 
                      className={preferences.smsChannel ? 'text-indigo-600' : 'text-slate-300'} 
                    />
                  </button>
                </div>
              </div>

              <button className="w-full py-3 bg-[#3b4276] hover:bg-[#2d325a] hover:scale-[1.02] active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all border-0 cursor-pointer shadow-sm">
                {t('notifications.savePref')}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
