import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import api from '../api/axiosConfig';
import fileUrl from '../api/fileUrl';
import { useLang } from '../config/i18n';
import { 
    faChevronDown, faSignOutAlt, faBars, faTimes, faCog, faSignInAlt, 
    faBell, faFileContract, faHistory, faMoneyBillTransfer,
    faHome, faCompass, faConciergeBell, faBed, faUserPlus, faCheckCircle, faTimesCircle, faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import {
    TENANT_NOTIFICATION_LINKS, TENANT_NOTIFICATIONS_EVENT, NOTIFICATION_POLL_MS, PAYMENT_WATCH_POLL_MS,
    TENANT_PAYMENT_ALERT_TITLES, TENANT_PAYMENT_AWAITING_TITLES, formatRelativeTime,
} from '../config/notificationLinks';
import usePaymentAlerts from '../hooks/usePaymentAlerts';
import '../assets/styles/responsive/components/navbar.responsive.css';

// Stable empty set: no notice highlighted in the bell dropdown.
const NO_HIGHLIGHT = new Set();

export default function TopBar({ hasRentedRoom, isLoggedIn, username, onLoginClick }) {
    const navigate = useNavigate();
    const { lang, setLang, t } = useLang();
    const location = useLocation();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        api.post('/logout.php').catch(() => {}); // invalidate the server-side session; fire-and-forget
        // Both stores: readers fall back to localStorage, so clearing one left the user "signed in".
        for (const store of [sessionStorage, localStorage]) {
            store.removeItem("loggedInUser");
            store.removeItem("sessionToken");
        }
        for (const key of Object.keys(localStorage)) {
            if (key === 'ams_guest_token' || key.startsWith('ams_guest_')) localStorage.removeItem(key);
        }
        window.dispatchEvent(new Event('auth-changed'));
        navigate('/login');
    };
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState(null);
    
    const dropdownRef = useRef(null);
    const notificationRef = useRef(null);
    const mobileMenuRef = useRef(null);

    const [loggedInUser] = useState(JSON.parse(sessionStorage.getItem("loggedInUser") || "{}"));
    const [dbAvatarUrl, setDbAvatarUrl] = useState(loggedInUser.avatar_url || ''); // Real-time avatar tracker
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [rawNotifications, setRawNotifications] = useState([]);
    const [highlightIds, setHighlightIds] = useState(NO_HIGHLIGHT); // new payment notices, shown in the open dropdown

    const [appStatusModal, setAppStatusModal] = useState(null);

    // An unread approved / rejected / action-required application notice opens
    // the one-time modal (once per notice per browser session). Run on every
    // freshly fetched list, from fetchNotifications below, which is the only
    // place the list changes; this used to be an effect on `notifications`.
    const showAppStatusOnce = (list) => {
        if (!list || !list.length) return;
        const unreadAppUpdate = list.find(n =>
            n.type === 'application_update' &&
            !n.read &&
            (n.title?.toLowerCase().includes('approved') || n.title?.toLowerCase().includes('rejected') || n.title?.toLowerCase().includes('declined') || n.title?.toLowerCase().includes('action required'))
        );
        if (unreadAppUpdate && !sessionStorage.getItem(`app_status_shown_${unreadAppUpdate.id}`)) {
            setAppStatusModal(unreadAppUpdate);
            sessionStorage.setItem(`app_status_shown_${unreadAppUpdate.id}`, 'true');
        }
    };

    const closeAppStatusModal = async () => {
        if (!appStatusModal) return;
        try {
            await api.post('/mark_notification_read.php', { id: appStatusModal.id });
            window.dispatchEvent(new CustomEvent(TENANT_NOTIFICATIONS_EVENT));
        } catch (e) {
            console.error(e);
        }
        setAppStatusModal(null);
    };


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

    // Close menus on route change (adjusted during render rather than in an effect)
    const [seenPath, setSeenPath] = useState(location.pathname);
    if (seenPath !== location.pathname) {
        setSeenPath(location.pathname);
        setIsMobileMenuOpen(false);
        setIsDropdownOpen(false);
        setIsNotificationOpen(false);
        setHighlightIds(NO_HIGHLIGHT);
    }

    const getFullAvatarUrl = (url) => (url ? fileUrl(url.replace(/^\//, '')) : null);

    // Identity comes from the session token; the bell used to send ?userId=.
    const fetchNotifications = async () => {
        if (!isLoggedIn) return;
        try {
            const response = await api.get('get_notifications.php');
            if (response.data.success) {
                setRawNotifications(response.data.notifications);
                const list = response.data.notifications.map(n => ({
                    id: n.id,
                    title: n.title,
                    message: n.message,
                    type: n.type,
                    metadata: n.metadata_value,
                    createdAt: n.created_at,
                    read: Number(n.is_read) === 1,
                    attachment_path: n.attachment_path,
                    isArchived: Number(n.is_archived) === 1
                }));
                setNotifications(list);
                showAppStatusOnce(list);
                setUnreadCount(response.data.unread_count ?? response.data.notifications.filter(n => !Number(n.is_read)).length);
            }
        } catch (e) {
            console.error('Failed to load notifications:', e);
        }
    };

    // Waiting on management: the newest payment notice is the tenant's own
    // submission, so the admin's answer is due. Poll faster until it arrives.
    const latestPayment = rawNotifications.find(n => n.type === 'payment');
    const paymentAwaiting = !!latestPayment && TENANT_PAYMENT_AWAITING_TITLES.includes(latestPayment.title);

    // Fetched once, then polled while the tab is visible, and whenever another
    // component changes notifications. The bell used to fetch only on mount, so new
    // notices never appeared until a full reload.
    useEffect(() => {
        if (!isLoggedIn) return;
        const load = async () => { await fetchNotifications(); };
        load();
        window.addEventListener(TENANT_NOTIFICATIONS_EVENT, fetchNotifications);
        return () => window.removeEventListener(TENANT_NOTIFICATIONS_EVENT, fetchNotifications);
    }, [isLoggedIn, loggedInUser.id]);

    useEffect(() => {
        if (!isLoggedIn) return;
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') fetchNotifications();
        }, paymentAwaiting ? PAYMENT_WATCH_POLL_MS : NOTIFICATION_POLL_MS);
        return () => clearInterval(timer);
    }, [isLoggedIn, loggedInUser.id, paymentAwaiting]);

    // An admin's answer to a payment (confirmed, rejected, failed) opens the bell
    // dropdown on any page, the new notice highlighted. PayBills shows its own
    // "Payment confirmed" modal, so a confirmation alone doesn't open it there;
    // a rejection does, because the bill's banner doesn't cover advance payments.
    const onPayBills = location.pathname === '/pay-bills';
    const isPaymentAlert = useCallback((n) => n.type === 'payment' && !!TENANT_PAYMENT_ALERT_TITLES[n.title], []);
    const showPaymentAlerts = useCallback((list) => {
        setHighlightIds(new Set(list.map(n => n.id)));
        if (!onPayBills || list.some(n => TENANT_PAYMENT_ALERT_TITLES[n.title] !== 'success')) {
            setIsDropdownOpen(false);
            setIsNotificationOpen(true);
        }
        // Pages showing invoices (PayBills, Payment History) refetch on this event.
        window.dispatchEvent(new CustomEvent(TENANT_NOTIFICATIONS_EVENT));
    }, [onPayBills]);
    usePaymentAlerts(rawNotifications, {
        storageKey: loggedInUser.id ? `ams_payment_alert_mark_${loggedInUser.id}` : null,
        match: isPaymentAlert,
        onNew: showPaymentAlerts,
    });

    const closeNotifications = () => {
        setIsNotificationOpen(false);
        setHighlightIds(NO_HIGHLIGHT);
    };

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsDropdownOpen(false);
            if (notificationRef.current && !notificationRef.current.contains(event.target) && !event.target.closest('.mobile-payment-alerts')) {
                setIsNotificationOpen(false);
                setHighlightIds(NO_HIGHLIGHT);
            }
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target) && !event.target.closest('.mobile-menu-toggle')) {
                setIsMobileMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Where a notice leads. A confirmed payment opens its receipt; a rejected or
    // failed one goes back to the bill.
    const notificationTarget = (n) => {
        const tone = n.type === 'payment' ? TENANT_PAYMENT_ALERT_TITLES[n.title] : null;
        // An applicant has no Pay Bills or Payment History yet (resident-only
        // pages would send them home): the move-in payment lives on Track Application.
        if (n.type === 'payment' && !hasRentedRoom) return ['/track-application'];
        if (tone === 'success' && String(n.metadata || '').startsWith('invoice:')) {
            return ['/payment-history', { state: { receiptId: String(n.metadata).slice(8) } }];
        }
        if (tone === 'error') return ['/pay-bills'];
        return [TENANT_NOTIFICATION_LINKS[n.type]?.path || '/notifications'];
    };

    // Clicking a notice marks it read and opens the page it is about.
    const openNotification = async (n) => {
        closeNotifications();
        if (!n.read) {
            try {
                await api.post('mark_notification_read.php', { id: n.id });
                window.dispatchEvent(new CustomEvent(TENANT_NOTIFICATIONS_EVENT));
            } catch (e) {
                console.error(e);
            }
        }
        if (n.type === 'payment') {
            navigate(...notificationTarget(n));
        } else {
            setSelectedNotification(n);
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
                                onClick={() => (isNotificationOpen ? closeNotifications() : setIsNotificationOpen(true))}
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
                                        {notifications.filter(n => !n.isArchived).length > 0 ? (
                                            notifications.filter(n => !n.isArchived).slice(0, 5).map(n => {
                                                // A payment update that just arrived: tinted by outcome, marked New.
                                                const isNew = highlightIds.has(n.id);
                                                const success = TENANT_PAYMENT_ALERT_TITLES[n.title] === 'success';
                                                const tone = !isNew ? (n.read ? 'hover:bg-slate-50 opacity-60' : 'bg-indigo-50/50 hover:bg-indigo-50')
                                                    : success ? 'bg-emerald-50 hover:bg-emerald-100/70 border-l-4 border-emerald-500'
                                                    : 'bg-rose-50 hover:bg-rose-100/70 border-l-4 border-rose-500';
                                                return (
                                                    <div
                                                        key={n.id}
                                                        data-new={isNew || undefined}
                                                        onClick={() => openNotification(n)}
                                                        className={`p-2.5 rounded-xl cursor-pointer transition-colors ${tone}`}
                                                    >
                                                        <div className="flex justify-between gap-2">
                                                            <p className="text-xs font-bold text-slate-800 m-0">
                                                                {n.title}
                                                                {isNew && (
                                                                    <span className={`ml-1.5 align-middle text-[9px] font-black uppercase tracking-wider text-white px-1.5 py-0.5 rounded-full ${success ? 'bg-emerald-500' : 'bg-rose-500'}`}>New</span>
                                                                )}
                                                            </p>
                                                            <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatRelativeTime(n.createdAt)}</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 m-0 mt-0.5">{n.message}</p>
                                                        {isNew && (
                                                            <p className={`text-[11px] font-bold m-0 mt-1 ${success ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                                {success ? 'View receipt →' : 'Open Pay Bills →'}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })
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
                                    <button onClick={() => { setIsDropdownOpen(false); navigate('/my-refunds'); }} className="w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-semibold">
                                        <FontAwesomeIcon icon={faMoneyBillTransfer} className="text-slate-400 text-xs" />
                                        <span>My Refunds</span>
                                    </button>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <button onClick={() => { setIsDropdownOpen(false); handleLogout(); }} className="w-full px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-bold">
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

            {/* Payment alerts on phones: the bell dropdown above is desktop-only,
                so a confirmed/rejected/failed payment used to show only as a badge. */}
            {isNotificationOpen && highlightIds.size > 0 && !isMobileMenuOpen && (
                <div className="mobile-payment-alerts md:hidden absolute left-0 right-0 top-[100%] z-50 px-3 pt-2 space-y-2" role="status">
                    {notifications.filter(n => highlightIds.has(n.id)).map(n => {
                        const success = TENANT_PAYMENT_ALERT_TITLES[n.title] === 'success';
                        return (
                            <div key={n.id} className={`flex items-start gap-2 rounded-xl p-3 shadow-xl border-l-4 ${success ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'}`}>
                                <button type="button" onClick={() => openNotification(n)} className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer">
                                    <p className="text-xs font-bold text-slate-800 m-0">{n.title}</p>
                                    <p className="text-[11px] text-slate-600 m-0 mt-0.5">{n.message}</p>
                                    <p className={`text-[11px] font-bold m-0 mt-1 ${success ? 'text-emerald-700' : 'text-rose-700'}`}>
                                        {success ? 'View receipt →' : 'Open Pay Bills →'}
                                    </p>
                                </button>
                                <button type="button" onClick={closeNotifications} aria-label="Dismiss" className="shrink-0 w-7 h-7 rounded-lg bg-transparent border-0 text-slate-500 cursor-pointer flex items-center justify-center">
                                    <FontAwesomeIcon icon={faTimes} className="text-xs" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

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
                                        setIsMobileMenuOpen(false);
                                        handleLogout();
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

            {selectedNotification && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 animate-fade-in" onClick={() => setSelectedNotification(null)}>
                    <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-scale-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800 m-0">{selectedNotification.title}</h3>
                            <button onClick={() => setSelectedNotification(null)} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-2">
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto">
                            <p className="text-sm text-slate-600 whitespace-pre-wrap m-0">{selectedNotification.message}</p>
                            {selectedNotification.attachment_path && (
                                <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                                    {selectedNotification.attachment_path.toLowerCase().endsWith('.pdf') ? (
                                        <iframe src={fileUrl(selectedNotification.attachment_path)} className="w-full h-64 border-0" title="Attachment"></iframe>
                                    ) : (
                                        <img src={fileUrl(selectedNotification.attachment_path)} alt="Attachment" className="w-full max-h-64 object-contain bg-slate-50" />
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                            {TENANT_NOTIFICATION_LINKS[selectedNotification.type] && (
                                <button
                                    onClick={() => {
                                        const path = TENANT_NOTIFICATION_LINKS[selectedNotification.type].path;
                                        setSelectedNotification(null);
                                        navigate(path);
                                    }}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer border-0"
                                >
                                    Go to Page
                                </button>
                            )}
                            <button onClick={() => setSelectedNotification(null)} className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer border-0">Close</button>
                        </div>
                    </div>
                </div>
            )}
        
            {/* App Status One-Time Modal */}
            {appStatusModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={closeAppStatusModal}>
                    <div onClick={e => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-slate-100">
                        {appStatusModal.title?.toLowerCase().includes('approved') ? (
                            <div className="bg-emerald-50 p-8 flex flex-col items-center border-b border-emerald-100 text-center">
                                <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center shadow-inner mb-4 border-4 border-white">
                                    <FontAwesomeIcon icon={faCheckCircle} className="text-4xl" />
                                </div>
                                <h2 className="text-2xl font-black text-emerald-800 m-0 tracking-tight">Congratulations!</h2>
                                <p className="text-emerald-600 font-bold mt-1 mb-0 uppercase tracking-widest text-xs">Application Approved</p>
                            </div>
                        ) : appStatusModal.title?.toLowerCase().includes('action required') ? (
                            <div className="bg-amber-50 p-8 flex flex-col items-center border-b border-amber-100 text-center">
                                <div className="w-20 h-20 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center shadow-inner mb-4 border-4 border-white">
                                    <FontAwesomeIcon icon={faInfoCircle} className="text-4xl" />
                                </div>
                                <h2 className="text-2xl font-black text-amber-800 m-0 tracking-tight">Action Required</h2>
                                <p className="text-amber-600 font-bold mt-1 mb-0 uppercase tracking-widest text-xs">Update Needed</p>
                            </div>
                        ) : (
                            <div className="bg-red-50 p-8 flex flex-col items-center border-b border-red-100 text-center">
                                <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center shadow-inner mb-4 border-4 border-white">
                                    <FontAwesomeIcon icon={faTimesCircle} className="text-4xl" />
                                </div>
                                <h2 className="text-2xl font-black text-red-800 m-0 tracking-tight">Application Update</h2>
                                <p className="text-red-600 font-bold mt-1 mb-0 uppercase tracking-widest text-xs">Application Rejected</p>
                            </div>
                        )}
                        <div className="p-8 flex flex-col items-center text-center">
                            <p className="text-slate-600 font-medium leading-relaxed m-0 whitespace-pre-wrap">{appStatusModal.message}</p>
                            {appStatusModal.attachment_path && (
                                <div className="mt-4 w-full border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                    {appStatusModal.attachment_path.toLowerCase().endsWith('.pdf') ? (
                                        <iframe src={fileUrl(appStatusModal.attachment_path)} className="w-full h-64 border-0" title="Attachment"></iframe>
                                    ) : (
                                        <img src={fileUrl(appStatusModal.attachment_path)} alt="Attachment" className="w-full max-h-64 object-contain bg-slate-50" />
                                    )}
                                </div>
                            )}
                            <button onClick={closeAppStatusModal} className="mt-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-6 rounded-xl border-0 cursor-pointer shadow-md shadow-indigo-200 transition-all active:scale-[0.98]">
                                Okay, got it!
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </nav>
    );
}
