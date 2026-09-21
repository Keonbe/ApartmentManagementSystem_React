import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faSignOutAlt, faUserCog, faBars } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { ADMIN_NOTIFICATION_LINKS, ADMIN_NOTIFICATIONS_EVENT, NOTIFICATION_POLL_MS, formatRelativeTime } from '../config/notificationLinks';
import '../assets/styles/responsive/admin/admin-header.responsive.css';

const Header = ({ title = "Dashboard", onToggleSidebar }) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('get_notifications.php');
      if (response.data.success) {
        setNotifications(response.data.notifications);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Polled while the tab is visible. The bell used to load once per page, and
  // rendered a "time" field the API never returns.
  useEffect(() => {
    const load = async () => { await fetchNotifications(); };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchNotifications();
    }, NOTIFICATION_POLL_MS);
    window.addEventListener(ADMIN_NOTIFICATIONS_EVENT, fetchNotifications);
    return () => {
      clearInterval(timer);
      window.removeEventListener(ADMIN_NOTIFICATIONS_EVENT, fetchNotifications);
    };
  }, [fetchNotifications]);

  const handleToggle = () => {
    if (onToggleSidebar) {
      onToggleSidebar();
    } else {
      window.dispatchEvent(new CustomEvent('toggle-admin-sidebar'));
    }
  };

  const handleLogout = () => {
    api.post('/logout.php').catch(() => {}); // invalidate the server-side session; fire-and-forget
    // Both stores: readers fall back to localStorage, so clearing one left the user "signed in".
    for (const store of [sessionStorage, localStorage]) {
      store.removeItem("loggedInUser");
      store.removeItem("sessionToken");
    }
    navigate('/login');
  };

  // One request marks everything the admin can see as read (it used to send one per id).
  const handleMarkAllRead = async () => {
    try {
      await api.post('mark_notification_read.php', {});
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_EVENT));
    } catch (err) {
      console.error(err);
    }
  };

  const openNotification = async (notif) => {
    setIsNotifOpen(false);
    if (!Number(notif.is_read)) {
      try {
        await api.post('mark_notification_read.php', { id: notif.id });
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
        window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_EVENT));
      } catch (err) {
        console.error(err);
      }
    }
    navigate(ADMIN_NOTIFICATION_LINKS[notif.type] || '/admin-notifications');
  };

  const unreadCount = notifications.filter(n => !Number(n.is_read)).length;

  return (
    <header className="admin-header-root h-20 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 shrink-0 select-none relative z-40">

      {/* Left Area: Hamburger + Title */}
      <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
        <button
          type="button"
          onClick={handleToggle}
          aria-label="Open Navigation Menu"
          className="admin-header-hamburger btn-interactive text-slate-700 hover:text-indigo-600 md:hidden bg-transparent border-0 cursor-pointer p-2 flex items-center justify-center text-lg focus:outline-none shrink-0"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>

        <h2 className="admin-header-title text-xl md:text-2xl font-bold !text-[#1e293b] opacity-100 m-0 tracking-tight truncate">
          {title}
        </h2>
      </div>

      <div className="flex items-center gap-3 sm:gap-6 relative shrink-0">

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setIsNotifOpen(!isNotifOpen); setIsProfileOpen(false); }}
            className="admin-header-notif-btn btn-interactive text-gray-500 hover:text-gray-700 transition-colors relative bg-transparent border-0 cursor-pointer p-2 outline-none"
            aria-label="Notifications"
          >
            <FontAwesomeIcon icon={faBell} className="text-lg sm:text-xl" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-0.5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border border-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="admin-header-notif-dropdown animate-scale-in absolute right-0 mt-3 w-80 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-gray-200 overflow-hidden z-50 transform origin-top-right transition-all">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center select-none">
                <h3 className="text-sm font-semibold text-gray-700 m-0">Notifications</h3>
                {unreadCount > 0 && (
                  <span onClick={handleMarkAllRead} className="text-xs text-indigo-600 font-medium cursor-pointer hover:text-indigo-800 transition-colors">Mark all as read</span>
                )}
              </div>
              <div className="stagger-children max-h-80 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map(notif => (
                    <div
                      key={notif.id}
                      onClick={() => openNotification(notif)}
                      className={`px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors relative flex flex-col gap-0.5 ${!Number(notif.is_read) ? 'bg-indigo-50/20' : ''}`}
                    >
                      {!Number(notif.is_read) && (
                        <span className="absolute left-1.5 top-[18px] w-1.5 h-1.5 bg-indigo-600 rounded-full"></span>
                      )}
                      <p className={`text-xs font-bold m-0 leading-snug ${!Number(notif.is_read) ? 'text-slate-800' : 'text-slate-600'}`}>{notif.title}</p>
                      <p className="text-[11px] text-slate-500 m-0 leading-normal">{notif.message}</p>
                      <p className="text-[9px] text-slate-400 font-medium m-0 mt-1">{formatRelativeTime(notif.created_at)}</p>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs italic">
                    Nothing needs your attention
                  </div>
                )}
              </div>
              <div className="px-4 py-2.5 text-center border-t border-gray-100">
                <button onClick={() => { setIsNotifOpen(false); navigate('/admin-notifications'); }} className="btn-interactive text-xs text-indigo-600 hover:text-indigo-800 font-bold bg-transparent border-none cursor-pointer">View All</button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <div
            onClick={() => { setIsProfileOpen(!isProfileOpen); setIsNotifOpen(false); }}
            className="admin-header-avatar-btn btn-interactive w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md cursor-pointer text-xs sm:text-sm hover:bg-indigo-700 transition-all border-2 border-transparent hover:border-indigo-200 select-none"
            aria-label="Admin Profile Menu"
          >
            Ad
          </div>

          {isProfileOpen && (
            <div className="admin-header-profile-dropdown animate-scale-in absolute right-0 mt-3 w-56 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-gray-200 py-2 z-50 transform origin-top-right transition-all">
              <div className="px-4 py-3 border-b border-gray-100 mb-2">
                <p className="text-sm font-semibold text-gray-800 m-0">Admin Dashboard</p>
                <p className="text-xs text-gray-500 m-0 mt-0.5 truncate">admin@system.com</p>
              </div>
              <button
                className="btn-interactive w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors flex items-center gap-3 bg-transparent border-none cursor-pointer"
                onClick={() => { setIsProfileOpen(false); navigate('/admin-settings'); }}
              >
                <FontAwesomeIcon icon={faUserCog} className="text-gray-400 w-4" />
                <span>Account Settings</span>
              </button>
              <button
                className="btn-interactive w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3 bg-transparent border-none cursor-pointer"
                onClick={handleLogout}
              >
                <FontAwesomeIcon icon={faSignOutAlt} className="w-4" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
