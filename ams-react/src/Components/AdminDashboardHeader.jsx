import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faSignOutAlt, faUserCog } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';

const defaultAdminNotifications = [
  { id: 1, type: 'rent_due', title: 'Rent Due Reminder', message: 'Unit E — Pedro Cruz rent of ₱6,500 is due in 3 days (July 5).', time: '2 hours ago', timestamp: '2024-07-02 10:00', read: false },
  { id: 2, type: 'overdue', title: 'Overdue Alert', message: 'Unit G — Ben Flores has an overdue balance of ₱6,500 (7 days past due).', time: '3 hours ago', timestamp: '2024-07-02 09:00', read: false },
  { id: 3, type: 'maintenance', title: 'Maintenance Update', message: 'REQ-003 (Clogged kitchen drain) has been marked as In Progress. Assigned to Mang Totoy.', time: '5 hours ago', timestamp: '2024-07-02 07:00', read: false },
  { id: 4, type: 'rent_due', title: 'Rent Due Reminder', message: 'Unit F — Rosa Dela Cruz rent of ₱7,500 is due in 5 days (July 7).', time: 'Yesterday', timestamp: '2024-07-01 14:00', read: true },
];

const Header = ({ title = "Dashboard" }) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();

  const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
  const emailKey = loggedInUser.email_address || "default_admin";

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem(`admin_notifications_${emailKey}`);
    return saved ? JSON.parse(saved) : defaultAdminNotifications;
  });

  // Sync state with localStorage updates
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

  // Persist local state edits to localStorage and emit sync event
  useEffect(() => {
    const currentStr = JSON.stringify(notifications);
    const saved = localStorage.getItem(`admin_notifications_${emailKey}`);
    if (saved !== currentStr) {
      localStorage.setItem(`admin_notifications_${emailKey}`, currentStr);
      window.dispatchEvent(new Event('admin_notifications_updated'));
    }
  }, [notifications, emailKey]);

  const handleLogout = () => {
    sessionStorage.removeItem("loggedInUser");
    navigate('/login');
  };

  const handleMarkAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
  };

  const handleMarkRead = (id) => {
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    setNotifications(updated);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0 select-none relative z-50">
      
      {/* 
        FIX APPLIED HERE: 
        Replaced 'text-slate-800' with '!text-[#1e293b]' to force the dark color
        and override any conflicting global CSS. Added 'opacity-100' for safety.
      */}
      <h2 className="text-2xl font-bold !text-[#1e293b] opacity-100 m-0 tracking-tight">
        {title}
      </h2>

      <div className="flex items-center gap-6 relative">
        
        {/* Notifications */}
        <div className="relative">
          <button 
            onClick={() => { setIsNotifOpen(!isNotifOpen); setIsProfileOpen(false); }}
            className="text-gray-500 hover:text-gray-700 transition-colors relative bg-transparent border-0 cursor-pointer p-1 outline-none"
          >
            <FontAwesomeIcon icon={faBell} className="text-xl" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border border-white">
                {unreadCount}
              </span>
            )}
          </button>
          
          {isNotifOpen && (
            <div className="absolute right-0 mt-3 w-80 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-gray-200 overflow-hidden z-50 transform origin-top-right transition-all">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center select-none">
                <h3 className="text-sm font-semibold text-gray-700 m-0">Notifications</h3>
                {unreadCount > 0 && (
                  <span onClick={handleMarkAllRead} className="text-xs text-indigo-600 font-medium cursor-pointer hover:text-indigo-800 transition-colors">Mark all as read</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      onClick={() => handleMarkRead(notif.id)}
                      className={`px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors relative flex flex-col gap-0.5 ${!notif.read ? 'bg-indigo-50/20' : ''}`}
                    >
                      {!notif.read && (
                        <span className="absolute left-1.5 top-[18px] w-1.5 h-1.5 bg-indigo-600 rounded-full"></span>
                      )}
                      <p className={`text-xs font-bold m-0 leading-snug ${!notif.read ? 'text-slate-800' : 'text-slate-600'}`}>{notif.title}</p>
                      <p className="text-[11px] text-slate-500 m-0 leading-normal">{notif.message}</p>
                      <p className="text-[9px] text-slate-400 font-medium m-0 mt-1">{notif.time}</p>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs italic">
                    No new notifications
                  </div>
                )}
              </div>
              <div className="px-4 py-2.5 text-center border-t border-gray-100">
                <button onClick={() => { setIsNotifOpen(false); navigate('/admin-notifications'); }} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold bg-transparent border-none cursor-pointer">View All</button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <div 
            onClick={() => { setIsProfileOpen(!isProfileOpen); setIsNotifOpen(false); }}
            className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md cursor-pointer text-sm hover:bg-indigo-700 transition-all border-2 border-transparent hover:border-indigo-200"
          >
            Ad
          </div>

          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-56 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-gray-200 py-2 z-50 transform origin-top-right transition-all">
              <div className="px-4 py-3 border-b border-gray-100 mb-2">
                <p className="text-sm font-semibold text-gray-800 m-0">Admin Dashboard</p>
                <p className="text-xs text-gray-500 m-0 mt-0.5">admin@system.com</p>
              </div>
              <button 
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors flex items-center gap-3 bg-transparent border-none cursor-pointer"
                onClick={() => { setIsProfileOpen(false); navigate('/admin-settings'); }}
              >
                <FontAwesomeIcon icon={faUserCog} className="text-gray-400 w-4" />
                <span>Account Settings</span>
              </button>
              <button 
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3 bg-transparent border-none cursor-pointer"
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