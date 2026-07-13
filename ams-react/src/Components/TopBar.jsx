import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faChevronDown, faSignOutAlt, faBars, faTimes, faCog, faSignInAlt, 
    faBell, faCheck, faTrash, faInfoCircle, faExclamationTriangle, faFileContract, faCheckCircle 
} from '@fortawesome/free-solid-svg-icons';

const defaultNotifications = [
  { id: 1, title: "Rent Overdue Alert", message: "Your Rent payment is due in 3 days. Please settle outstanding balances.", type: "warning", time: "1 hour ago", read: false },
  { id: 2, title: "Maintenance Resolved", message: "Maintenance Request REQ-003 has been marked as Completed.", type: "success", time: "5 hours ago", read: false },
  { id: 3, title: "Lease Document Required", message: "Your signed lease agreement has not been uploaded yet. Please submit the document.", type: "action", time: "1 day ago", read: false },
  { id: 4, title: "Welcome to AMS", message: "Welcome to the Apartment Management System. You can manage rooms, request services, and pay bills here.", type: "info", time: "3 days ago", read: true }
];

export default function TopBar({ hasRentedRoom, isLoggedIn, username, onLoginClick }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    
    const dropdownRef = useRef(null);
    const notificationRef = useRef(null);
    const mobileNotificationRef = useRef(null);

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");

    // Notification State & Persistance
    const [notifications, setNotifications] = useState(() => {
        if (!loggedInUser.email_address) return [];
        const saved = localStorage.getItem(`user_notifications_${loggedInUser.email_address}`);
        return saved ? JSON.parse(saved) : defaultNotifications;
    });

    // Listen for updates from other parts of the app
    useEffect(() => {
        if (!loggedInUser.email_address) return;
        const handleSync = () => {
            const saved = localStorage.getItem(`user_notifications_${loggedInUser.email_address}`);
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
        window.addEventListener('user_notifications_updated', handleSync);
        return () => window.removeEventListener('user_notifications_updated', handleSync);
    }, [loggedInUser.email_address]);

    // Save and emit sync event on changes
    useEffect(() => {
        if (loggedInUser.email_address) {
            const currentStr = JSON.stringify(notifications);
            const saved = localStorage.getItem(`user_notifications_${loggedInUser.email_address}`);
            if (saved !== currentStr) {
                localStorage.setItem(`user_notifications_${loggedInUser.email_address}`, currentStr);
                window.dispatchEvent(new Event('user_notifications_updated'));
            }
        }
    }, [notifications, loggedInUser.email_address]);

    // Close dropdowns on outside clicks
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setIsNotificationOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const markAsRead = (id) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const clearAll = () => {
        setNotifications([]);
    };

    const getInitials = () => {
        if (!username || username === 'Guest') return 'U';
        const nameParts = username.split(' ');
        const firstInitial = nameParts[0] ? nameParts[0].charAt(0) : '';
        const lastInitial = nameParts[1] ? nameParts[1].charAt(0) : '';
        return `${firstInitial}${lastInitial}`.toUpperCase();
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'warning': return <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500" />;
            case 'success': return <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-500" />;
            case 'action': return <FontAwesomeIcon icon={faFileContract} className="text-indigo-500" />;
            default: return <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500" />;
        }
    };

    const getNotificationColor = (type) => {
        switch (type) {
            case 'warning': return 'bg-red-50 border-red-100';
            case 'success': return 'bg-emerald-50 border-emerald-100';
            case 'action': return 'bg-indigo-50 border-indigo-100';
            default: return 'bg-blue-50 border-blue-100';
        }
    };

    const isActive = (path) => location.pathname === path;
    const navItemClass = (path) => `text-sm font-medium transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full ${isActive(path) ? 'text-white font-extrabold after:w-full' : 'text-white/90 hover:text-white after:w-0'}`;

    return (
        <nav className="w-full bg-[#3b4276] px-6 md:px-12 py-4 shadow-md sticky top-0 z-50 select-none box-border">
            <div className="w-full flex justify-between items-center h-[44px]">
                
                {/*Brand Branding Identity Node Layout*/}
                <div className="flex items-center space-x-8">
                    <style>
                        {`
                            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
                            .ams-topbar-logo {
                                font-family: 'Playfair Display', Georgia, serif !important;
                            }
                        `}
                    </style>
                    <div
                        onClick={() => navigate('/home')}
                        className="ams-topbar-logo text-white text-3xl italic font-bold tracking-wider cursor-pointer transition-transform duration-200 hover:scale-105"
                    >
                        AMS
                    </div>

                    {/*Central Links Menu Blocks Layer Context Grid*/}
                    <div className="hidden md:flex items-center space-x-6">
                        <button onClick={() => navigate('/home')} className={navItemClass('/home')}>
                            Home
                        </button>
                        {isLoggedIn && (
                            <button onClick={() => navigate('/services')} className={navItemClass('/services')}>
                                Services
                            </button>
                        )}
                        {isLoggedIn && hasRentedRoom && (
                            <button onClick={() => navigate('/my-room')} className={navItemClass('/my-room')}>
                                My Room
                            </button>
                        )}
                    </div>
                </div>

                {/*Desktop Account Session Interaction Block Workspace*/}
                <div className="hidden md:flex items-center space-x-4">
                    {isLoggedIn && (
                        <div className="relative" ref={notificationRef}>
                            {/* Notification Bell Button */}
                            <button 
                                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                                className="relative w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center border-0 cursor-pointer transition-colors outline-none"
                            >
                                <FontAwesomeIcon icon={faBell} />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Notification Dropdown Panel */}
                            {isNotificationOpen && (
                                <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-50 animate-fade-in text-left flex flex-col max-h-[420px]">
                                    <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                                        <span className="font-bold text-slate-800 text-sm">Notifications</span>
                                        {unreadCount > 0 && (
                                            <button 
                                                onClick={markAllRead}
                                                className="text-[10px] font-bold text-indigo-600 hover:underline border-0 bg-transparent cursor-pointer"
                                            >
                                                Mark all read
                                            </button>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 overflow-y-auto divide-y divide-slate-50 pr-1">
                                        {notifications.length > 0 ? (
                                            notifications.map((notif) => (
                                                <div 
                                                    key={notif.id} 
                                                    onClick={() => markAsRead(notif.id)}
                                                    className={`p-3.5 flex items-start space-x-3 transition-colors cursor-pointer hover:bg-slate-50 relative ${!notif.read ? 'bg-indigo-50/20' : ''}`}
                                                >
                                                    {!notif.read && (
                                                        <span className="absolute left-2 top-[18px] w-1.5 h-1.5 bg-indigo-600 rounded-full"></span>
                                                    )}
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${getNotificationColor(notif.type)}`}>
                                                        {getNotificationIcon(notif.type)}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-xs m-0 leading-snug font-bold ${!notif.read ? 'text-slate-800 font-extrabold' : 'text-slate-600'}`}>{notif.title}</p>
                                                        <p className="text-[11px] text-slate-500 m-0 mt-0.5 leading-normal">{notif.message}</p>
                                                        <span className="text-[9px] text-slate-400 font-medium block mt-1">{notif.time}</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="py-12 text-center text-slate-400 text-xs italic">
                                                No new notifications
                                            </div>
                                        )}
                                    </div>

                                                                    <div className="px-4 pt-2.5 mt-1 border-t border-slate-100 flex justify-between items-center shrink-0">
                                        <button 
                                            onClick={clearAll}
                                            disabled={notifications.length === 0}
                                            className="text-[10px] font-semibold text-rose-500 hover:underline flex items-center gap-1.5 border-0 bg-transparent cursor-pointer disabled:opacity-40 disabled:no-underline"
                                        >
                                            <FontAwesomeIcon icon={faTrash} className="text-[9px]" /> Clear all
                                        </button>
                                        <button 
                                            onClick={() => { setIsNotificationOpen(false); navigate('/notifications'); }}
                                            className="text-[10px] font-bold text-[#3b4276] hover:underline border-0 bg-transparent cursor-pointer"
                                        >
                                            View all
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {isLoggedIn ? (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center space-x-3 text-white/90 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border-0 bg-transparent cursor-pointer transition-all duration-200 select-none outline-none"
                            >
                                <span className="font-bold text-sm tracking-wide">{username}</span>
                                
                                {/* Dynamic Google-Style Avatar Widget */}
                                {loggedInUser.avatar_url ? (
                                    <img 
                                        src={loggedInUser.avatar_url} 
                                        alt="Avatar" 
                                        className="w-9 h-9 rounded-full object-cover border border-white/20 shadow-inner transition-transform group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-indigo-600 border border-white/20 text-white flex items-center justify-center text-xs font-black tracking-wider shadow-inner transition-transform group-hover:scale-105">
                                        {getInitials()}
                                    </div>
                                )}
                                
                                <FontAwesomeIcon
                                    icon={faChevronDown}
                                    className={`text-[10px] opacity-70 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {/*Floating Submenu Accounts Selection List Node Options*/}
                            {isDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-1.5 z-50 overflow-hidden animate-fade-in text-left">
                                    <button
                                        onClick={() => {
                                            setIsDropdownOpen(false);
                                            navigate('/profile-settings');
                                        }}
                                        className="w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-semibold"
                                    >
                                        <FontAwesomeIcon icon={faCog} className="text-slate-400 text-xs" />
                                        <span>Profile Settings</span>
                                    </button>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <button
                                        onClick={() => {
                                            sessionStorage.removeItem("loggedInUser");
                                            setIsDropdownOpen(false);
                                            navigate('/login');
                                        }}
                                        className="w-full px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-bold"
                                    >
                                        <FontAwesomeIcon icon={faSignOutAlt} className="text-xs" />
                                        <span>Logout</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={onLoginClick}
                            className="bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all duration-150 flex items-center space-x-1.5"
                        >
                            <FontAwesomeIcon icon={faSignInAlt} />
                            <span>Log In</span>
                        </button>
                    )}
                </div>

                {/*Mobile Hamburger Layout Button Trigger Node*/}
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="md:hidden text-white hover:text-white/80 transition-colors bg-transparent border-0 cursor-pointer text-xl outline-none"
                >
                    <FontAwesomeIcon icon={isMobileMenuOpen ? faTimes : faBars} />
                </button>
            </div>

            {/*Mobile Adaptive Full View Overlay Drawer Panel Layout*/}
            {isMobileMenuOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-[#3b4276] border-t border-white/10 shadow-2xl flex flex-col justify-between p-6 box-border transition-all z-50 text-left animate-fade-in max-h-[85vh] overflow-y-auto">
                    <div className="flex flex-col space-y-3">
                        <button
                            onClick={() => {
                                setIsMobileMenuOpen(false);
                                navigate('/home');
                            }}
                            className={`text-left text-base py-2.5 font-bold border-0 bg-transparent cursor-pointer ${isActive('/home') ? 'text-white' : 'text-white/70'}`}
                        >
                            Home
                        </button>
                        {isLoggedIn && (
                            <button
                                onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    navigate('/services');
                                }}
                                className={`text-left text-base py-2.5 font-bold border-0 bg-transparent cursor-pointer ${isActive('/services') ? 'text-white' : 'text-white/70'}`}
                            >
                                Services
                            </button>
                        )}
                        {isLoggedIn && hasRentedRoom && (
                            <button
                                onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    navigate('/my-room');
                                }}
                                className={`text-left text-base py-2.5 font-bold border-0 bg-transparent cursor-pointer ${isActive('/my-room') ? 'text-white' : 'text-white/70'}`}
                            >
                                My Room
                            </button>
                        )}
                        
                        {/* Mobile Notifications Center */}
                        {isLoggedIn && (
                            <div className="border-t border-white/10 pt-4 mt-2">
                                <div className="flex justify-between items-center mb-3 select-none">
                                    <p className="text-white/40 text-xs font-bold uppercase tracking-wider m-0">Notifications ({unreadCount})</p>
                                    <button 
                                        onClick={() => { setIsMobileMenuOpen(false); navigate('/notifications'); }}
                                        className="text-white/80 hover:text-white text-xs font-bold bg-transparent border-0 cursor-pointer p-0"
                                    >
                                        View All
                                    </button>
                                </div>
                                <div className="space-y-3 max-h-40 overflow-y-auto pr-1">
                                    {notifications.length > 0 ? (
                                        notifications.map((notif) => (
                                            <div 
                                                key={notif.id}
                                                onClick={() => markAsRead(notif.id)}
                                                className={`p-3 rounded-xl border border-white/10 ${notif.read ? 'opacity-60 bg-white/5' : 'bg-white/10'}`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span className="text-white text-xs font-bold">{notif.title}</span>
                                                    <span className="text-white/40 text-[9px]">{notif.time}</span>
                                                </div>
                                                <p className="text-white/80 text-[10px] m-0 mt-1">{notif.message}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-white/40 text-xs italic m-0 text-center py-4">No notifications</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 border-t border-white/10 flex flex-col space-y-4 w-full mt-4">
                        {isLoggedIn ? (
                            <>
                                <div className="flex items-center space-x-3 px-1 select-none">
                                    {loggedInUser.avatar_url ? (
                                        <img 
                                            src={loggedInUser.avatar_url} 
                                            alt="Avatar" 
                                            className="w-10 h-10 rounded-full object-cover border border-white/20 shadow-md"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black tracking-wider shadow-md">
                                            {getInitials()}
                                        </div>
                                    )}
                                    <span className="text-white font-bold text-sm">{username}</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setIsMobileMenuOpen(false);
                                        navigate('/profile-settings');
                                    }}
                                    className="flex items-center space-x-2 text-white/90 hover:text-white text-left font-semibold text-sm py-2 border-0 bg-transparent cursor-pointer"
                                >
                                    <FontAwesomeIcon icon={faCog} className="text-slate-300 text-xs" />
                                    <span>Profile Settings</span>
                                </button>
                                <button
                                    onClick={() => {
                                        sessionStorage.removeItem("loggedInUser");
                                        setIsMobileMenuOpen(false);
                                        navigate('/login');
                                    }}
                                    className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold text-center shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 text-sm transition-all"
                                >
                                    <FontAwesomeIcon icon={faSignOutAlt} />
                                    <span>Logout</span>
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    onLoginClick();
                                }}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-center shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 text-sm transition-all"
                            >
                                <FontAwesomeIcon icon={faSignInAlt} />
                                <span>Sign In</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}