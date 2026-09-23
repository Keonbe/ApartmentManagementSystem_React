import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import { 
    faChevronDown, faSignOutAlt, faBars, faTimes, faCog, faSignInAlt, 
    faBell, faCheck, faTrash, faInfoCircle, faExclamationTriangle, faFileContract, faCheckCircle, faHistory,
    faHome, faCompass, faConciergeBell, faBed, faUserPlus
} from '@fortawesome/free-solid-svg-icons';
import '../assets/styles/responsive/components/navbar.responsive.css';

export default function TopBar({ hasRentedRoom, isLoggedIn, username, onLoginClick }) {
    const navigate = useNavigate();
    const { lang, setLang, t } = useLang();
    const location = useLocation();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    
    const dropdownRef = useRef(null);
    const notificationRef = useRef(null);
    const mobileMenuRef = useRef(null);

    const [loggedInUser, setLoggedInUser] = useState(JSON.parse(sessionStorage.getItem("loggedInUser") || "{}"));
    const [dbAvatarUrl, setDbAvatarUrl] = useState(loggedInUser.avatar_url || ''); // Real-time avatar tracker
    const [notifications, setNotifications] = useState([]);
    const [fetchError, setFetchError] = useState(null);

    // 1. Fetch live profile records to ensure avatar path accuracy across tabs
    useEffect(() => {
        const fetchLiveProfile = async () => {
            if (!loggedInUser.email_address) return;
            try {
                const res = await api.get(`/profile.php?email=${encodeURIComponent(loggedInUser.email_address)}`);
                if (res.data.success && res.data.data) {
                    const latestAvatar = res.data.data.avatar_url || '';
                    setDbAvatarUrl(latestAvatar);
                    
                    // Keep session storage updated silently
                    const updatedSession = { ...loggedInUser, avatar_url: latestAvatar };
                    sessionStorage.setItem("loggedInUser", JSON.stringify(updatedSession));
                }
            } catch (error) {
                console.error("Failed to sync live layout navbar records:", error);
            }
        };
        
        if (isLoggedIn) {
            fetchLiveProfile();
        }
    }, [loggedInUser.email_address, isLoggedIn]);

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
        setIsDropdownOpen(false);
        setIsNotificationOpen(false);
    }, [location.pathname]);

    const getFullAvatarUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        const cleanPath = url.replace(/^\//, ''); 
        return `http://localhost/ApartmentManagementSystem_React/backend/${cleanPath}`;
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        try {
            const diff = new Date() - new Date(dateStr.replace(/-/g, '/'));
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'Just now';
            if (mins < 60) return `${mins}m ago`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `${hours}h ago`;
            return `${Math.floor(hours / 24)}d ago`;
        } catch (e) {
            return dateStr;
        }
    };

    const fetchNotifications = async () => {
        if (!loggedInUser.id) return;
        setFetchError(null);
        try {
            const response = await api.get(`get_notifications.php?userId=${loggedInUser.id}`);
            if (response.data.success) {
                setNotifications(response.data.notifications.map(n => ({
                    id: n.id,
                    title: n.title,
                    message: n.message,
                    type: n.type,
                    time: formatTime(n.created_at),
                    read: n.is_read
                })));
            }
        } catch(e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [loggedInUser.id]);

    useEffect(() => {
        if (!loggedInUser.id) return;
        const handleSync = () => { fetchNotifications(); };
        window.addEventListener('user_notifications_updated', handleSync);
        return () => window.removeEventListener('user_notifications_updated', handleSync);
    }, [loggedInUser.id]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsDropdownOpen(false);
            if (notificationRef.current && !notificationRef.current.contains(event.target)) setIsNotificationOpen(false);
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target) && !event.target.closest('.mobile-menu-toggle')) {
                setIsMobileMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;
    const markAsRead = async (id) => {
        try {
            await api.post('mark_notification_read.php', { id, userId: loggedInUser.id });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
        } catch (e) {
            console.error(e);
        }
    };

    const getInitials = () => {
        if (!username || username === 'Guest') return 'U';
        const nameParts = username.split(' ');
        const firstInitial = nameParts[0] ? nameParts[0].charAt(0) : '';
        const lastInitial = nameParts[1] ? nameParts[1].charAt(0) : '';
        return `${firstInitial}${lastInitial}`.toUpperCase();
    };

    const isActive = (path) => location.pathname === path;
    const navItemClass = (path) => `text-sm font-medium transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full ${isActive(path) ? 'text-white font-extrabold after:w-full' : 'text-white/90 hover:text-white after:w-0'}`;

    return (
        <nav className="topbar-nav w-full bg-[#3b4276] px-6 md:px-12 py-3.5 shadow-md sticky top-0 z-50 select-none box-border">
            <div className="w-full flex justify-between items-center h-[44px]">
                
                {/* Brand Logo & Desktop Links */}
                <div className="flex items-center space-x-8">
                    <div 
                        onClick={() => navigate('/home')} 
                        className="topbar-logo text-white text-3xl italic font-bold tracking-wider cursor-pointer transition-transform duration-200 hover:scale-105 font-serif"
                    >
                        AMS
                    </div>

                    <div className="hidden md:flex items-center space-x-6">
                        <button onClick={() => navigate('/home')} className={navItemClass('/home')}>{t('nav.home')}</button>
                        {isLoggedIn && !hasRentedRoom && (
                            <button onClick={() => navigate('/track-application')} className={navItemClass('/track-application')}>{t('nav.trackApp')}</button>
                        )}
                        {isLoggedIn && hasRentedRoom && (
                            <button onClick={() => navigate('/services')} className={navItemClass('/services')}>{t('nav.services')}</button>
                        )}
                        {isLoggedIn && hasRentedRoom && (
                            <button onClick={() => navigate('/my-room')} className={navItemClass('/my-room')}>{t('nav.myRoom')}</button>
                        )}
                    </div>
                </div>

                {/* Desktop Action Controls */}
                <div className="hidden md:flex items-center space-x-4">
                    {/* Language Toggle Pill */}
                    <div className="flex items-center bg-white/10 rounded-lg overflow-hidden text-[11px] font-bold select-none">
                        <button
                            onClick={() => setLang('en')}
                            className={`px-2.5 py-1.5 border-0 cursor-pointer transition-all duration-150 ${lang === 'en' ? 'bg-white text-[#3b4276]' : 'bg-transparent text-white/70 hover:text-white'}`}
                        >EN</button>
                        <button
                            onClick={() => setLang('fil')}
                            className={`px-2.5 py-1.5 border-0 cursor-pointer transition-all duration-150 ${lang === 'fil' ? 'bg-white text-[#3b4276]' : 'bg-transparent text-white/70 hover:text-white'}`}
                        >FIL</button>
                    </div>

                    {isLoggedIn && (
                        <div className="relative" ref={notificationRef}>
                            <button
                                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all duration-200 border-0 cursor-pointer relative"
                            >
                                <FontAwesomeIcon icon={faBell} className="text-sm" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#3b4276]">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            {isNotificationOpen && (
                                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-50 overflow-hidden text-left">
                                    <div className="px-4 pb-2 border-b border-slate-100 flex justify-between items-center">
                                        <span className="font-bold text-xs uppercase tracking-wider text-slate-500">Notifications ({unreadCount})</span>
                                        <button onClick={() => { setIsNotificationOpen(false); navigate('/notifications'); }} className="text-xs text-indigo-600 hover:underline font-bold bg-transparent border-0 cursor-pointer p-0">View All</button>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto px-2 py-1 space-y-1">
                                        {notifications.length > 0 ? (
                                            notifications.slice(0, 5).map(n => (
                                                <div 
                                                    key={n.id} 
                                                    onClick={() => markAsRead(n.id)}
                                                    className={`p-2.5 rounded-xl cursor-pointer transition-colors ${n.read ? 'hover:bg-slate-50 opacity-60' : 'bg-indigo-50/50 hover:bg-indigo-50'}`}
                                                >
                                                    <p className="text-xs font-bold text-slate-800 m-0">{n.title}</p>
                                                    <p className="text-[11px] text-slate-500 m-0 mt-0.5">{n.message}</p>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-slate-400 text-center py-4 m-0">No notifications</p>
                                        )}
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
                                
                                {dbAvatarUrl ? (
                                    <img 
                                        src={getFullAvatarUrl(dbAvatarUrl)} 
                                        alt="Avatar" 
                                        className="w-9 h-9 rounded-full object-cover border border-white/20 shadow-inner"
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-indigo-600 border border-white/20 text-white flex items-center justify-center text-xs font-black tracking-wider shadow-inner">
                                        {getInitials()}
                                    </div>
                                )}
                                
                                <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] opacity-70 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 py-1.5 z-50 overflow-hidden animate-fade-in text-left">
                                    <button onClick={() => { setIsDropdownOpen(false); navigate('/profile-settings'); }} className="w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-semibold">
                                        <FontAwesomeIcon icon={faCog} className="text-slate-400 text-xs" />
                                        <span>Profile Settings</span>
                                    </button>
                                    {!hasRentedRoom && (
                                        <button onClick={() => { setIsDropdownOpen(false); navigate('/track-application'); }} className="w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-semibold">
                                            <FontAwesomeIcon icon={faFileContract} className="text-slate-400 text-xs" />
                                            <span>Track Application</span>
                                        </button>
                                    )}
                                    {hasRentedRoom && (
                                        <button onClick={() => { setIsDropdownOpen(false); navigate('/payment-history'); }} className="w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-semibold">
                                            <FontAwesomeIcon icon={faHistory} className="text-slate-400 text-xs" />
                                            <span>Payment History</span>
                                        </button>
                                    )}
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <button onClick={() => { sessionStorage.removeItem("loggedInUser"); localStorage.removeItem("loggedInUser"); window.dispatchEvent(new Event('auth-changed')); setIsDropdownOpen(false); navigate('/login'); }} className="w-full px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-bold">
                                        <FontAwesomeIcon icon={faSignOutAlt} className="text-xs" />
                                        <span>Logout</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button onClick={onLoginClick} className="bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all duration-150 flex items-center space-x-1.5">
                            <FontAwesomeIcon icon={faSignInAlt} />
                            <span>{t('nav.login')}</span>
                        </button>
                    )}
                </div>

                {/* Mobile Right Controls */}
                <div className="flex md:hidden items-center space-x-2">
                    {/* Quick Login button on Mobile header if Guest */}
                    {!isLoggedIn && (
                        <button 
                            onClick={onLoginClick} 
                            className="bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold px-3.5 py-2 rounded-xl text-xs border-0 cursor-pointer transition-all flex items-center space-x-1.5 shadow-sm"
                        >
                            <FontAwesomeIcon icon={faSignInAlt} className="text-xs" />
                            <span>{t('nav.login')}</span>
                        </button>
                    )}

                    {/* Notification Icon for Mobile if logged in */}
                    {isLoggedIn && (
                        <button
                            onClick={() => navigate('/notifications')}
                            className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center border-0 cursor-pointer relative"
                            aria-label="Notifications"
                        >
                            <FontAwesomeIcon icon={faBell} className="text-sm" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[#3b4276]">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>
                    )}

                    {/* Hamburger Toggle Button */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="mobile-menu-toggle topbar-mobile-menu-btn rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white border-0 cursor-pointer flex items-center justify-center transition-colors"
                        aria-label="Toggle menu"
                    >
                        <FontAwesomeIcon icon={isMobileMenuOpen ? faTimes : faBars} className="text-lg" />
                    </button>
                </div>
            </div>

            {/* Mobile Dropdown Drawer */}
            {isMobileMenuOpen && (
                <div 
                    ref={mobileMenuRef}
                    className="topbar-mobile-drawer md:hidden absolute left-0 right-0 top-[100%] bg-[#2e3460] shadow-2xl border-b border-white/10 px-5 py-5 z-50 flex flex-col space-y-4 text-left backdrop-blur-md"
                >
                    {/* Navigation Items */}
                    {/* Mobile Language Toggle */}
                    <div className="flex items-center justify-between px-2 pb-2">
                        <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Language</span>
                        <div className="flex items-center bg-white/10 rounded-lg overflow-hidden text-[11px] font-bold select-none">
                            <button
                                onClick={() => setLang('en')}
                                className={`px-3 py-1.5 border-0 cursor-pointer transition-all duration-150 ${lang === 'en' ? 'bg-white text-[#3b4276]' : 'bg-transparent text-white/70 hover:text-white'}`}
                            >EN</button>
                            <button
                                onClick={() => setLang('fil')}
                                className={`px-3 py-1.5 border-0 cursor-pointer transition-all duration-150 ${lang === 'fil' ? 'bg-white text-[#3b4276]' : 'bg-transparent text-white/70 hover:text-white'}`}
                            >FIL</button>
                        </div>
                    </div>

                    <div className="flex flex-col space-y-1">
                        <button
                            onClick={() => { setIsMobileMenuOpen(false); navigate('/home'); }}
                            className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-sm border-0 bg-transparent text-left cursor-pointer transition-colors ${isActive('/home') ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}
                        >
                            <FontAwesomeIcon icon={faHome} className="text-xs w-4" />
                            <span>{t('nav.home')}</span>
                        </button>

                        <button
                            onClick={() => { setIsMobileMenuOpen(false); navigate('/preview'); }}
                            className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-sm border-0 bg-transparent text-left cursor-pointer transition-colors ${isActive('/preview') ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}
                        >
                            <FontAwesomeIcon icon={faCompass} className="text-xs w-4" />
                            <span>{t('preview.availableRooms')}</span>
                        </button>

                        {isLoggedIn && !hasRentedRoom && (
                            <button
                                onClick={() => { setIsMobileMenuOpen(false); navigate('/track-application'); }}
                                className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-sm border-0 bg-transparent text-left cursor-pointer transition-colors ${isActive('/track-application') ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}
                            >
                                <FontAwesomeIcon icon={faFileContract} className="text-xs w-4" />
                                <span>{t('nav.trackApp')}</span>
                            </button>
                        )}

                        {isLoggedIn && hasRentedRoom && (
                            <>
                                <button
                                    onClick={() => { setIsMobileMenuOpen(false); navigate('/services'); }}
                                    className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-sm border-0 bg-transparent text-left cursor-pointer transition-colors ${isActive('/services') ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}
                                >
                                    <FontAwesomeIcon icon={faConciergeBell} className="text-xs w-4" />
                                    <span>{t('nav.services')}</span>
                                </button>
                                <button
                                    onClick={() => { setIsMobileMenuOpen(false); navigate('/my-room'); }}
                                    className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-sm border-0 bg-transparent text-left cursor-pointer transition-colors ${isActive('/my-room') ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}
                                >
                                    <FontAwesomeIcon icon={faBed} className="text-xs w-4" />
                                    <span>{t('nav.myRoom')}</span>
                                </button>
                            </>
                        )}
                    </div>

                    {/* Account Controls */}
                    <div className="border-t border-white/10 pt-4 flex flex-col space-y-3">
                        {isLoggedIn ? (
                            <>
                                <div className="flex items-center space-x-3 px-2">
                                    {dbAvatarUrl ? (
                                        <img 
                                            src={getFullAvatarUrl(dbAvatarUrl)} 
                                            alt="Avatar" 
                                            className="w-10 h-10 rounded-full object-cover border border-white/20 shadow-md"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black tracking-wider shadow-md">
                                            {getInitials()}
                                        </div>
                                    )}
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold text-sm leading-snug">{username}</span>
                                        <span className="text-white/50 text-xs">Logged In</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                        onClick={() => { setIsMobileMenuOpen(false); navigate('/profile-settings'); }}
                                        className="bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 px-3 rounded-xl text-xs border-0 cursor-pointer flex items-center justify-center space-x-2 transition-colors"
                                    >
                                        <FontAwesomeIcon icon={faCog} className="text-xs" />
                                        <span>Settings</span>
                                    </button>
                                    {hasRentedRoom ? (
                                        <button
                                            onClick={() => { setIsMobileMenuOpen(false); navigate('/payment-history'); }}
                                            className="bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 px-3 rounded-xl text-xs border-0 cursor-pointer flex items-center justify-center space-x-2 transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faHistory} className="text-xs" />
                                            <span>History</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setIsMobileMenuOpen(false); navigate('/track-application'); }}
                                            className="bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 px-3 rounded-xl text-xs border-0 cursor-pointer flex items-center justify-center space-x-2 transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faFileContract} className="text-xs" />
                                            <span>Status</span>
                                        </button>
                                    )}
                                </div>

                                <button
                                    onClick={() => {
                                        sessionStorage.removeItem("loggedInUser");
                                        localStorage.removeItem("loggedInUser");
                                        window.dispatchEvent(new Event('auth-changed'));
                                        setIsMobileMenuOpen(false);
                                        navigate('/login');
                                    }}
                                    className="w-full bg-rose-600 hover:bg-rose-700 active:scale-98 text-white py-3 rounded-xl font-bold text-center shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 text-sm transition-all mt-1"
                                >
                                    <FontAwesomeIcon icon={faSignOutAlt} />
                                    <span>Logout</span>
                                </button>
                            </>
                        ) : (
                            <div className="flex flex-col space-y-2">
                                <button
                                    onClick={() => { setIsMobileMenuOpen(false); onLoginClick(); }}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white py-3 rounded-xl font-bold text-center shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 text-sm transition-all"
                                >
                                    <FontAwesomeIcon icon={faSignInAlt} />
                                    <span>Sign In to Account</span>
                                </button>
                                <button
                                    onClick={() => { setIsMobileMenuOpen(false); navigate('/register'); }}
                                    className="w-full bg-white/10 hover:bg-white/20 active:scale-98 text-white py-2.5 rounded-xl font-semibold text-center border-0 cursor-pointer flex items-center justify-center space-x-2 text-xs transition-all"
                                >
                                    <FontAwesomeIcon icon={faUserPlus} />
                                    <span>Create New Account</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}