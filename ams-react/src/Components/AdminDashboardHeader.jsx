import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faSignOutAlt, faUserCog } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';

const Header = ({ title = "Dashboard" }) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem("loggedInUser");
    navigate('/login');
  };

  const notifications = [
    { id: 1, text: "New tenant registration: John Doe", time: "10 mins ago", unread: true },
    { id: 2, text: "Maintenance request #1024 updated", time: "1 hour ago", unread: true },
    { id: 3, text: "Rent payment received for Unit 301", time: "2 hours ago", unread: false },
  ];

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
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>
          
          {isNotifOpen && (
            <div className="absolute right-0 mt-3 w-80 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-gray-200 overflow-hidden z-50 transform origin-top-right transition-all">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-gray-700 m-0">Notifications</h3>
                <span className="text-xs text-indigo-600 font-medium cursor-pointer hover:text-indigo-800 transition-colors">Mark all as read</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.map(notif => (
                  <div key={notif.id} className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${notif.unread ? 'bg-indigo-50/30' : ''}`}>
                    <p className="text-sm text-gray-800 m-0 mb-1">{notif.text}</p>
                    <p className="text-xs text-gray-400 m-0">{notif.time}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 text-center border-t border-gray-100">
                <button className="text-xs text-gray-500 hover:text-gray-700 font-medium bg-transparent border-none cursor-pointer">View All</button>
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