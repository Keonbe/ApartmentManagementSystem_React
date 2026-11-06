import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell, faSearch, faTimes, faCheckDouble, faClock,
  faExclamationTriangle, faFileContract, faCheckCircle, faInfoCircle,
  faCog, faToggleOn, faToggleOff, faCheck, faWrench, faArrowRight, faLock,
  faCar, faVideo, faConciergeBell, faUserFriends, faHome, faMoneyBillWave, faBullhorn, faPaperclip, faBoxArchive
} from '@fortawesome/free-solid-svg-icons';
import ConfirmDialog from '../Components/ConfirmDialog';
import useDialog from '../hooks/useDialog';

import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import { TENANT_NOTIFICATION_LINKS, TENANT_NOTIFICATIONS_EVENT, formatRelativeTime } from '../config/notificationLinks';
import { LIMITS } from '../utils/validation';
import '../assets/styles/responsive/user/user-notifications.responsive.css';
import fileUrl from '../api/fileUrl';

// One entry per type the backend writes. Unlisted types used to all show as "Info".
const typeConfig = {
  warning: { label: 'notifications.type.warning', icon: faExclamationTriangle, color: 'bg-red-50 text-red-500 border-red-100', badge: 'bg-red-100 text-red-700' },
  action: { label: 'notifications.type.action', icon: faBullhorn, color: 'bg-indigo-50 text-indigo-500 border-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
  welcome: { label: 'notifications.type.welcome', icon: faInfoCircle, color: 'bg-emerald-50 text-emerald-600 border-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  info: { label: 'notifications.type.info', icon: faInfoCircle, color: 'bg-blue-50 text-blue-500 border-blue-100', badge: 'bg-blue-100 text-blue-700' },
  maintenance_update: { label: 'notifications.type.maintenance_update', icon: faWrench, color: 'bg-amber-50 text-amber-500 border-amber-100', badge: 'bg-amber-100 text-amber-700' },
  application_update: { label: 'notifications.type.application_update', icon: faFileContract, color: 'bg-indigo-50 text-indigo-500 border-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
  rent_due: { label: 'notifications.type.rent_due', icon: faClock, color: 'bg-blue-50 text-blue-600 border-blue-100', badge: 'bg-blue-100 text-blue-800' },
  overdue: { label: 'notifications.type.overdue', icon: faExclamationTriangle, color: 'bg-rose-50 text-rose-600 border-rose-100', badge: 'bg-rose-100 text-rose-800' },
  billing: { label: 'notifications.type.billing', icon: faFileContract, color: 'bg-indigo-50 text-indigo-600 border-indigo-100', badge: 'bg-indigo-100 text-indigo-800' },
  payment: { label: 'notifications.type.payment', icon: faMoneyBillWave, color: 'bg-emerald-50 text-emerald-600 border-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  service_status: { label: 'notifications.type.service_status', icon: faConciergeBell, color: 'bg-teal-50 text-teal-600 border-teal-100', badge: 'bg-teal-100 text-teal-700' },
  cctv_request: { label: 'notifications.type.cctv_request', icon: faVideo, color: 'bg-slate-50 text-slate-600 border-slate-200', badge: 'bg-slate-100 text-slate-700' },
  parking_reservation: { label: 'notifications.type.parking_reservation', icon: faCar, color: 'bg-teal-50 text-teal-600 border-teal-100', badge: 'bg-teal-100 text-teal-700' },
  visitor_log: { label: 'notifications.type.visitor_log', icon: faUserFriends, color: 'bg-purple-50 text-purple-600 border-purple-100', badge: 'bg-purple-100 text-purple-700' },
  inquiry_update: { label: 'notifications.type.inquiry_update', icon: faInfoCircle, color: 'bg-sky-50 text-sky-600 border-sky-100', badge: 'bg-sky-100 text-sky-700' },
  unit_reservation: { label: 'notifications.type.unit_reservation', icon: faHome, color: 'bg-sky-50 text-sky-600 border-sky-100', badge: 'bg-sky-100 text-sky-700' },
  waitlist_update: { label: 'notifications.type.waitlist_update', icon: faHome, color: 'bg-sky-50 text-sky-600 border-sky-100', badge: 'bg-sky-100 text-sky-700' },
  contract_update: { label: 'notifications.type.contract_update', icon: faFileContract, color: 'bg-violet-50 text-violet-600 border-violet-100', badge: 'bg-violet-100 text-violet-700' },
  move_out_update: { label: 'notifications.type.move_out_update', icon: faHome, color: 'bg-violet-50 text-violet-600 border-violet-100', badge: 'bg-violet-100 text-violet-700' },
  household_request: { label: 'notifications.type.household_request', icon: faUserFriends, color: 'bg-purple-50 text-purple-600 border-purple-100', badge: 'bg-purple-100 text-purple-700' },
  occupancy_request: { label: 'notifications.type.occupancy_request', icon: faUserFriends, color: 'bg-purple-50 text-purple-600 border-purple-100', badge: 'bg-purple-100 text-purple-700' },
  lease_extension_request: { label: 'notifications.type.lease_extension_request', icon: faFileContract, color: 'bg-emerald-50 text-emerald-600 border-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  refund_update: { label: 'notifications.type.refund_update', icon: faMoneyBillWave, color: 'bg-emerald-50 text-emerald-600 border-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
};

const TAB_TYPES = {
  billing: ['rent_due', 'overdue', 'billing', 'payment', 'refund_update'],
  requests: ['maintenance_update', 'service_status', 'cctv_request', 'parking_reservation', 'visitor_log', 'occupancy_request', 'household_request', 'lease_extension_request'],
  lease: ['application_update', 'contract_update', 'move_out_update', 'inquiry_update', 'unit_reservation', 'waitlist_update'],
  announcements: ['info', 'warning', 'action'],
};

export default function UserNotifications() {
  const navigate = useNavigate();
  const { t } = useLang();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);

  // Server-side in-app preferences (checklist 6.8). They used to live only in
  // localStorage and the Save button did nothing.
  const [preferences, setPreferences] = useState([]);
  const [alwaysOn, setAlwaysOn] = useState([]);
  const [prefDirty, setPrefDirty] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefMessage, setPrefMessage] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const detailDialogRef = useDialog(!!selectedNotification, () => setSelectedNotification(null));

  const notifyOthers = () => window.dispatchEvent(new CustomEvent(TENANT_NOTIFICATIONS_EVENT));

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('get_notifications.php');
      if (response.data.success) {
        setNotifications(response.data.notifications.map(n => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          status: n.status,
          createdAt: n.created_at,
          read: Number(n.is_read) === 1,
          attachmentPath: n.attachment_path,
          isArchived: Number(n.is_archived) === 1,
        })));
        setError(null);
      }
    } catch (e) {
      setError(e.response?.data?.message || t('notifications.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await api.get('get_notification_preferences.php');
      if (res.data.success) {
        setPreferences(res.data.preferences);
        setAlwaysOn(res.data.always_on || []);
        setPrefDirty(false);
      }
    } catch {
      setPrefMessage({ ok: false, text: t('notifications.prefLoadFailed') });
    }
  }, [t]);

  useEffect(() => {
    const load = async () => { await Promise.all([fetchNotifications(), fetchPreferences()]); };
    load();
    window.addEventListener(TENANT_NOTIFICATIONS_EVENT, fetchNotifications);
    return () => window.removeEventListener(TENANT_NOTIFICATIONS_EVENT, fetchNotifications);
  }, [fetchNotifications, fetchPreferences]);

  // One refetch per action: the event below reaches this page's own listener
  // (and TopBar's). It used to refetch here as well, so every action loaded twice.
  const runAction = async (request, failure) => {
    try {
      await request();
      notifyOthers();
    } catch (e) {
      setError(e.response?.data?.message || failure);
    }
  };

  const handleMarkRead = (id) => runAction(() => api.post('mark_notification_read.php', { notificationId: id }), 'Could not mark the notification as read.');
  const handleArchive = (id) => runAction(() => api.post('archive_notification.php', { notificationId: id }), 'Could not archive the notification.');
  const handleMarkAllRead = () => runAction(() => api.post('mark_notification_read.php', {}), 'Could not mark notifications as read.');
  const handleArchiveAll = () => {
    setConfirmAction({
      title: t('notifications.archiveAll'),
      message: t('notifications.archiveAllBody'),
      onConfirm: () => {
        runAction(() => api.post('archive_notification.php', {}), 'Could not archive notifications.');
        setConfirmAction(null);
      }
    });
  };

  const openLink = (n) => {
    const link = TENANT_NOTIFICATION_LINKS[n.type];
    if (!link) return;
    if (!n.read) handleMarkRead(n.id);
    navigate(link.path);
  };

  const togglePreference = (category) => {
    setPreferences(prev => prev.map(p => p.category === category ? { ...p, in_app_enabled: !p.in_app_enabled } : p));
    setPrefDirty(true);
    setPrefMessage(null);
  };

  const savePreferences = async () => {
    setPrefSaving(true);
    setPrefMessage(null);
    try {
      const payload = Object.fromEntries(preferences.map(p => [p.category, !!p.in_app_enabled]));
      const res = await api.post('update_notification_preferences.php', { preferences: payload });
      setPrefMessage({ ok: res.data.success, text: res.data.message });
      if (res.data.success) setPrefDirty(false);
    } catch (e) {
      setPrefMessage({ ok: false, text: e.response?.data?.message || t('notifications.prefSaveFailed') });
    } finally {
      setPrefSaving(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return notifications.filter(n => {
      if (activeFilter === 'archived') {
        if (!n.isArchived) return false;
      } else {
        if (n.isArchived) return false;
      }
      
      const matchesFilter = activeFilter === 'all' || activeFilter === 'archived'
        || (activeFilter === 'unread' && !n.read)
        || (TAB_TYPES[activeFilter] || []).includes(n.type);
      const matchesSearch = n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [notifications, activeFilter, searchQuery]);

  const unreadCount = notifications.filter(n => !n.read && !n.isArchived).length;

  const filterTabs = [
    { key: 'all', label: t('notifications.tabAll') },
    { key: 'unread', label: t('notifications.tabUnread') },
    { key: 'billing', label: t('notifications.tabBilling') },
    { key: 'requests', label: t('notifications.tabRequests') },
    { key: 'lease', label: t('notifications.tabRent') },
    { key: 'announcements', label: t('notifications.tabAnnouncements') },
    { key: 'archived', label: t('notifications.tabArchived') },
  ];

  return (
    <div className="user-notif-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center select-none text-left animate-fade-in">
      <div className="w-full max-w-[1400px] flex flex-col gap-6 sm:gap-8">

        {/* Page Title */}
        <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1
              className="user-notif-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight text-brand"
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
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-brand bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm min-h-[40px]"
            >
              <FontAwesomeIcon icon={faCheckDouble} /> {t('notifications.markAllRead')}
            </button>
            <button
              onClick={handleArchiveAll}
              disabled={!notifications.some((n) => !n.isArchived)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-600 bg-white border border-slate-200 rounded-xl hover:bg-rose-50 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm min-h-[40px]"
            >
              <FontAwesomeIcon icon={faBoxArchive} aria-hidden="true" /> {t('notifications.archiveAll')}
            </button>
            <button
              type="button"
              aria-expanded={showSettings}
              aria-controls="notif-pref-panel"
              aria-label={t('notifications.preferences')}
              title={t('notifications.preferences')}
              onClick={() => setShowSettings(!showSettings)}
              className={`user-notif-pref-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all cursor-pointer border shadow-sm active:scale-[0.96] ${showSettings ? 'bg-brand text-white border-brand' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
            >
              <FontAwesomeIcon icon={faCog} aria-hidden="true" className={`transition-transform duration-300 ${showSettings ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            <span><FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />{error}</span>
            <button onClick={() => setError(null)} className="bg-transparent border-0 cursor-pointer text-rose-500" aria-label={t('topbar.dismiss')}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* Main List Column */}
          <div className="flex-1 w-full flex flex-col gap-6">

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="user-notif-search-container flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm focus-within:border-indigo-500 transition-all flex-grow max-w-md">
                <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-sm" />
                <input maxLength={LIMITS.search}
                  type="text"
                  aria-label={t('notifications.searchPlaceholder')}
                  placeholder={t('notifications.searchPlaceholder')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="user-notif-search-input flex-grow bg-transparent text-base sm:text-sm outline-none border-0 p-0 text-slate-800 placeholder-slate-500"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="flex h-11 w-11 -mr-3 items-center justify-center bg-transparent border-0 text-slate-500 hover:text-slate-700 cursor-pointer p-0" aria-label={t('notifications.clearSearch')}>
                    <FontAwesomeIcon icon={faTimes} className="text-sm" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <div role="tablist" aria-label={t('notifications.filter')} className="user-notif-tabs-bar flex gap-2 p-1 bg-slate-200/50 rounded-xl overflow-x-auto select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`user-notif-tab-btn min-h-[44px] px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap border-0 cursor-pointer transition-all duration-200 ${activeFilter === tab.key ? 'bg-brand text-white shadow-sm' : 'bg-transparent text-slate-600 hover:bg-slate-200/80 hover:text-slate-800'}`}
                >
                  {tab.label}
                  {tab.key === 'unread' && unreadCount > 0 && (
                    <span className="ml-1.5 bg-rose-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="stagger-children flex flex-col gap-3">
              {loading ? (
                <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center text-xs text-slate-500">{t('notifications.loading')}</div>
              ) : filteredNotifications.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center shadow-sm flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4 text-brand/30">
                    <FontAwesomeIcon icon={faBell} className="text-3xl" />
                  </div>
                  <h3 className="text-base font-bold text-slate-700 m-0">{t('notifications.noFound')}</h3>
                  <p className="text-slate-500 text-xs mt-1 max-w-sm m-0">
                    {searchQuery ? t('notifications.noFoundSearch') : t('notifications.noFoundDesc')}
                  </p>
                </div>
              ) : (
                filteredNotifications.map(n => {
                  const cfg = typeConfig[n.type] || typeConfig.info;
                  const link = TENANT_NOTIFICATION_LINKS[n.type];
                  const awaitingDecision = n.status === 'Pending';
                  return (
                    <div
                      key={n.id}
                      role="group"
                      aria-label={n.title}
                      className={`user-notif-card card-interactive bg-white rounded-2xl border shadow-sm p-4 sm:p-5 flex gap-3 sm:gap-4 items-start transition-all duration-200 hover:shadow-md group relative overflow-hidden ${n.read ? 'border-slate-200' : 'border-indigo-100 bg-indigo-50/10'}`}
                    >
                      {!n.read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600"></div>
                      )}

                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${cfg.color} shadow-sm`}>
                        <FontAwesomeIcon icon={cfg.icon} className="text-base" />
                      </div>

                      <div className="flex-grow min-w-0">
                        <div className="flex items-start justify-between gap-2 sm:gap-3 flex-wrap sm:flex-nowrap mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`text-sm m-0 leading-snug ${!n.read ? 'text-slate-800 font-extrabold' : 'text-slate-700 font-bold'}`}>
                              <button
                                type="button"
                                onClick={() => { setSelectedNotification(n); if (!n.read) handleMarkRead(n.id); }}
                                className="m-0 cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] text-inherit after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                              >
                                {n.title}
                              </button>
                            </h4>
                            {n.attachmentPath && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-extrabold bg-slate-100 text-slate-600" title={t('notifications.attachmentHint')}>
                                <FontAwesomeIcon icon={faPaperclip} aria-hidden="true" /> {t('topbar.attachment')}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-extrabold ${cfg.badge}`}>
                              {t(cfg.label)}
                            </span>
                            {awaitingDecision && (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-700">{t('notifications.awaitingDecision')}</span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 font-medium whitespace-nowrap" title={n.createdAt}>{formatRelativeTime(n.createdAt)}</span>
                        </div>
                        <p className="text-xs text-slate-500 m-0 leading-relaxed mt-0.5">{n.message}</p>
                        {link && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openLink(n); }}
                            className="relative z-10 mt-2.5 inline-flex min-h-[44px] items-center gap-1.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 cursor-pointer transition-colors"
                          >
                            <span>{t(`notifications.link.${n.type}`)}</span>
                            <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                          </button>
                        )}
                      </div>

                      <div className="user-notif-actions relative z-10 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity shrink-0">
                        {!n.read && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                            title={t('notifications.markRead')}
                            aria-label={`${t('notifications.markRead')}: ${n.title}`}
                            className="user-notif-action-btn btn-interactive h-11 w-11 rounded-lg flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer transition-colors"
                          >
                            <FontAwesomeIcon icon={faCheck} className="text-xs" />
                          </button>
                        )}
                        {!awaitingDecision && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleArchive(n.id); }}
                            title={t('notifications.archive')}
                            aria-label={`${t('notifications.archive')}: ${n.title}`}
                            className="user-notif-action-btn btn-interactive h-11 w-11 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 bg-transparent border-0 cursor-pointer transition-colors"
                          >
                            <FontAwesomeIcon icon={faBoxArchive} className="text-sm" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Preferences Side Column */}
          {/* Opened from the gear icon in the header; on mobile it shows above the list. */}
          <div id="notif-pref-panel" className={`user-notif-pref-panel order-first lg:order-none w-full lg:w-[360px] shrink-0 lg:sticky lg:top-24 ${showSettings ? 'block' : 'hidden'}`}>
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <FontAwesomeIcon icon={faCog} className="text-slate-500" />
                <h3 className="text-sm font-bold text-slate-800 m-0">{t('notifications.prefTitle')}</h3>
              </div>

              <div className="space-y-5 text-left">
                <h4 className="text-xs font-extrabold text-slate-500 m-0">{t('notifications.inApp')}</h4>
                {preferences.map(p => (
                  <div key={p.category} className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700 m-0 pr-3">{p.label}</p>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!p.in_app_enabled}
                      onClick={() => togglePreference(p.category)}
                      className="bg-transparent border-0 cursor-pointer text-3xl h-11 w-14 p-0 flex items-center justify-center"
                      aria-label={p.label}
                    >
                      <FontAwesomeIcon
                        icon={p.in_app_enabled ? faToggleOn : faToggleOff}
                        aria-hidden="true"
                        className={p.in_app_enabled ? 'text-indigo-600' : 'text-slate-400'}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {alwaysOn.length > 0 && (
                <>
                  <hr className="border-slate-100 m-0" />
                  <div className="space-y-2 text-left">
                    <h4 className="text-xs font-extrabold text-slate-500 m-0">{t('notifications.alwaysDelivered')}</h4>
                    {alwaysOn.map(label => (
                      <p key={label} className="text-xs text-slate-500 m-0 flex items-center gap-2">
                        <FontAwesomeIcon icon={faLock} className="text-xs text-slate-300" /> {label}
                      </p>
                    ))}
                    <p className="text-xs text-slate-500 m-0 pt-1">{t('notifications.channelsNote')}</p>
                  </div>
                </>
              )}

              {prefMessage && (
                <p className={`text-xs font-semibold m-0 ${prefMessage.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <FontAwesomeIcon icon={prefMessage.ok ? faCheckCircle : faExclamationTriangle} className="mr-1.5" />
                  {prefMessage.text}
                </p>
              )}

              <button
                onClick={savePreferences}
                disabled={!prefDirty || prefSaving}
                className="w-full py-3 bg-brand hover:bg-[#2d325a] active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all border-0 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {prefSaving ? 'Saving…' : t('notifications.savePref')}
              </button>
            </div>
          </div>

        </div>
      </div>

      {selectedNotification && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 animate-fade-in" onClick={() => setSelectedNotification(null)}>
          <div ref={detailDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="notif-detail-title" onClick={e => e.stopPropagation()} className="outline-none bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center gap-3">
              <h3 id="notif-detail-title" className="text-lg font-bold text-slate-800 m-0">{selectedNotification.title}</h3>
              <button type="button" aria-label={t('common.close')} onClick={() => setSelectedNotification(null)} className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer">
                <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <p className="text-sm text-slate-600 whitespace-pre-wrap m-0">{selectedNotification.message}</p>
              {selectedNotification.attachmentPath && (
                <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                  {selectedNotification.attachmentPath.toLowerCase().endsWith('.pdf') ? (
                    <iframe src={fileUrl(selectedNotification.attachmentPath)} className="w-full h-64 border-0" title={t('topbar.attachment')}></iframe>
                  ) : (
                    <img src={fileUrl(selectedNotification.attachmentPath)} alt={t('topbar.attachment')} className="w-full max-h-64 object-contain bg-slate-50" />
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button type="button" onClick={() => setSelectedNotification(null)} className="min-h-[44px] px-6 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl cursor-pointer border-0">{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={t('notifications.archiveAllYes')}
          cancelLabel={t('common.cancel')}
          tone="primary"
          onConfirm={confirmAction.onConfirm}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

