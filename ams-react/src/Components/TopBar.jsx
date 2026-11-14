import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import api from '../api/axiosConfig';
import fileUrl from '../api/fileUrl';
import { useLang } from '../config/i18n';
import { 
    faChevronDown, faSignOutAlt, faBars, faTimes, faCog, faSignInAlt, 
    faBell, faFileContract,
    faHome, faCompass, faConciergeBell, faBed, faBullhorn, faBroom, faUserPlus, faCheckCircle, faTimesCircle, faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import {
    TENANT_NOTIFICATION_LINKS, TENANT_NOTIFICATIONS_EVENT, NOTIFICATION_POLL_MS, PAYMENT_WATCH_POLL_MS,
    TENANT_PAYMENT_ALERT_TITLES, TENANT_PAYMENT_AWAITING_TITLES, formatRelativeTime,
} from '../config/notificationLinks';
import usePaymentAlerts from '../hooks/usePaymentAlerts';
import { ThemePicker, LangSwitch } from './UserTheme';
import useDialog from '../hooks/useDialog';
import usePresence from '../hooks/usePresence';
import { PROFILE_UPDATED_EVENT } from '../config/appEvents';
import { useLanguageSwitch } from '../config/publicSettings';
import { clearRoomCache, useRoomStatus } from '../config/tenantHome';
import '../assets/styles/responsive/components/navbar.responsive.css';
import { personName } from '../utils/personName';

// Stable empty set: no notice highlighted in the bell dropdown.
const NO_HIGHLIGHT = new Set();

// How long the menus take to animate closed (navbar.responsive.css topbarPopOut).
const MENU_EXIT_MS = 160;

// Pages reached from the Services page: the Services link stays marked on them.
const SERVICE_PATHS = [
    '/services', '/pay-bills', '/parking-reservation', '/cctv-request', '/service-catalog', '/service-booking',
    '/maintenance-request', '/visitor-management', '/user-utilities', '/my-requests',
];

// Where the desktop link pill last sat. TopBar remounts when the route's
// guard changes (Home → My Room), so the pill starts from here and slides.
let lastPill = null;

// What the bar fetched, kept across those remounts too: the profile is read
// once per user per page load, and the bell's list is reused instead of
// refetched while it is under NOTIF_REUSE_MS old (the 60 s poll and the
// notification events keep it current). Each remount used to fetch both.
const NOTIF_REUSE_MS = 15000;
let profileSyncedFor = null;
let notifCache = null; // { userId, at, raw, list, unread }
const cachedNotifs = (userId) => (notifCache && notifCache.userId === userId ? notifCache : null);

// Desktop links. A white pill slides under the current page's link; it is
// measured because the links differ in width and change with the language.
function NavPills({ links, activePath, onGo }) {
    const wrapRef = useRef(null);
    const pillRef = useRef(null);
    const placed = useRef(false);
    const activeKey = links.find((l) => l.match.includes(activePath))?.path || '';
    const linksKey = links.map((l) => l.path).join('|');

    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        const pill = pillRef.current;
        if (!wrap || !pill) return undefined;
        const jump = (box) => {
            pill.style.transition = 'none';
            pill.style.width = `${box.width}px`;
            pill.style.transform = `translateX(${box.left}px)`;
            void pill.offsetWidth; // apply before the transition comes back
            pill.style.transition = '';
        };
        const place = () => {
            const el = wrap.querySelector('[aria-current="page"]');
            if (!el) {
                pill.style.opacity = '0';
                return;
            }
            const box = { left: el.offsetLeft, width: el.offsetWidth };
            if (!placed.current) {
                placed.current = true;
                jump(lastPill || box);
            }
            pill.style.opacity = '1';
            pill.style.width = `${box.width}px`;
            pill.style.transform = `translateX(${box.left}px)`;
            lastPill = box;
        };
        place();
        // The labels change width with the language.
        const ro = new ResizeObserver(place);
        wrap.querySelectorAll('button').forEach((b) => ro.observe(b));
        return () => ro.disconnect();
    }, [activeKey, linksKey]);

    return (
        <div ref={wrapRef} className="relative hidden md:flex items-center gap-1 rounded-xl bg-white/[0.07] p-1">
            <span ref={pillRef} aria-hidden="true" className="topbar-nav-pill pointer-events-none absolute left-0 top-1 bottom-1 rounded-lg bg-white shadow-md" style={{ opacity: 0 }} />
            {links.map((l) => {
                const active = l.path === activeKey;
                return (
                    <button
                        key={l.path}
                        type="button"
                        onClick={() => onGo(l.path)}
                        aria-current={active ? 'page' : undefined}
                        title={l.label}
                        className={`relative z-[1] inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border-0 bg-transparent px-3 lg:px-3.5 text-sm font-semibold cursor-pointer transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? 'text-brand' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                    >
                        <FontAwesomeIcon icon={l.icon} className="text-xs" aria-hidden="true" />
                        {/* Icon only below lg: the labels and the account name don't fit beside each other there. */}
                        <span className="sr-only lg:not-sr-only lg:whitespace-nowrap">{l.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

// The red count on the bell. Keyed by the count, so it pops (and its halo
// pulses a few times) whenever the number changes.
function UnreadBadge({ count }) {
    if (count <= 0) return null;
    return (
        <span key={count} aria-hidden="true" className="topbar-badge pointer-events-none absolute -top-1 -right-1 flex">
            <span className="topbar-badge-halo absolute inset-0 rounded-full bg-rose-500" />
            <span className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-red-600 px-1 text-[10px] font-extrabold leading-none tabular-nums text-white shadow-md shadow-rose-950/40 ring-2 ring-brand">
                {count > 9 ? '9+' : count}
            </span>
        </span>
    );
}

export default function TopBar({ hasRentedRoom, isLoggedIn, username, onLoginClick }) {
    const navigate = useNavigate();
    const { t } = useLang();
    const location = useLocation();
    // Home is always Glass (App.jsx), so the theme switch would do nothing there.
    const showThemePicker = location.pathname !== '/home';
    // Other Settings → Language can turn the EN / FIL switch off (pages then show English).
    const showLangSwitch = useLanguageSwitch();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { hasApplication, refreshRoomStatus } = useRoomStatus();

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
        clearRoomCache();
        profileSyncedFor = null;
        notifCache = null;
        window.dispatchEvent(new Event('auth-changed'));
        navigate('/login');
    };
    // The menu animates closed first, then the user is signed out.
    const logoutTimer = useRef(null);
    useEffect(() => () => clearTimeout(logoutTimer.current), []);
    const closeMenusThenLogout = () => {
        setIsDropdownOpen(false);
        setIsMobileMenuOpen(false);
        clearTimeout(logoutTimer.current);
        logoutTimer.current = setTimeout(handleLogout, MENU_EXIT_MS);
    };
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const profileMenu = usePresence(isDropdownOpen, MENU_EXIT_MS);
    const notifMenu = usePresence(isNotificationOpen, MENU_EXIT_MS);
    const drawer = usePresence(isMobileMenuOpen, MENU_EXIT_MS);
    const [selectedNotification, setSelectedNotification] = useState(null);
    
    const dropdownRef = useRef(null);
    const notificationRef = useRef(null);
    const mobileMenuRef = useRef(null);
    const bellButtonRef = useRef(null);
    const avatarButtonRef = useRef(null);
    const menuButtonRef = useRef(null);

    const [loggedInUser] = useState(JSON.parse(sessionStorage.getItem("loggedInUser") || "{}"));
    const [dbAvatarUrl, setDbAvatarUrl] = useState(loggedInUser.avatar_url || ''); // Real-time avatar tracker
    // Profile Settings saved a new name or photo: re-read them here (that page
    // used to reload the whole app so the bar would show the change).
    const [nameOverride, setNameOverride] = useState(null);
    useEffect(() => {
        const onProfileUpdated = () => {
            const u = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
            setDbAvatarUrl(u.avatar_url || '');
            const fullName = personName(u);
            if (fullName) setNameOverride(fullName);
        };
        window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
        return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    }, []);
    const displayName = (isLoggedIn && nameOverride) || username;
    const [notifications, setNotifications] = useState(() => cachedNotifs(loggedInUser.id)?.list ?? []);
    const [unreadCount, setUnreadCount] = useState(() => cachedNotifs(loggedInUser.id)?.unread ?? 0);
    const lastUnread = useRef(cachedNotifs(loggedInUser.id)?.unread ?? null);
    const [bellRing, setBellRing] = useState(0); // bumped to replay the bell's ring
    const [rawNotifications, setRawNotifications] = useState(() => cachedNotifs(loggedInUser.id)?.raw ?? []);
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

    // Esc, focus in and back out, Tab kept inside: the two modals at the bottom.
    const detailDialogRef = useDialog(!!selectedNotification, () => setSelectedNotification(null));
    const appStatusDialogRef = useDialog(!!appStatusModal, () => closeAppStatusModal());


    // 1. Fetch live profile records to ensure avatar path accuracy across tabs
    useEffect(() => {
        const fetchLiveProfile = async () => {
            if (!loggedInUser.email_address || profileSyncedFor === loggedInUser.id) return;
            try {
                const res = await api.get(`/profile.php?email=${encodeURIComponent(loggedInUser.email_address)}`);
                if (res.data.success && res.data.data) {
                    profileSyncedFor = loggedInUser.id;
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
                const unread = response.data.unread_count ?? response.data.notifications.filter(n => !Number(n.is_read)).length;
                // A new notice since the last check rings the bell (not on the first
                // load) and rechecks the room: it may be a move-in confirmation.
                if (lastUnread.current !== null && unread > lastUnread.current) {
                    setBellRing(r => r + 1);
                    refreshRoomStatus();
                }
                lastUnread.current = unread;
                setUnreadCount(unread);
                notifCache = { userId: loggedInUser.id, at: Date.now(), raw: response.data.notifications, list, unread };
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
        const cached = cachedNotifs(loggedInUser.id);
        if (!cached || Date.now() - cached.at >= NOTIF_REUSE_MS) load();
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
        if (!isNotificationOpen && !isDropdownOpen && !isMobileMenuOpen) return undefined;
        const onKey = (event) => {
            if (event.key !== 'Escape') return;
            if (isNotificationOpen) { setIsNotificationOpen(false); setHighlightIds(NO_HIGHLIGHT); bellButtonRef.current?.focus(); }
            if (isDropdownOpen) { setIsDropdownOpen(false); avatarButtonRef.current?.focus(); }
            if (isMobileMenuOpen) { setIsMobileMenuOpen(false); menuButtonRef.current?.focus(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isNotificationOpen, isDropdownOpen, isMobileMenuOpen]);

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
        if (!displayName || displayName === 'Guest') return 'U';
        const nameParts = displayName.split(' ');
        const firstInitial = nameParts[0] ? nameParts[0].charAt(0) : '';
        const lastInitial = nameParts[1] ? nameParts[1].charAt(0) : '';
        return `${firstInitial}${lastInitial}`.toUpperCase();
    };

    // A tenant's home is My Room: Home is not offered (App.jsx sends them on).
    // Applicants and guests keep Home. Admins browsing tenant pages keep it too.
    const isTenant = isLoggedIn && hasRentedRoom && loggedInUser.role !== 'admin';
    const homePath = isTenant ? '/my-room' : '/home';
    const link = (path, label, icon, match = [path]) => ({ path, label, icon, match });
    // Guests and applicants also get the rooms page (and the inquiry form behind it).
    const previewLink = link('/preview', t('preview.availableRooms'), faCompass, ['/preview', '/inquire', '/rent-application']);
    const navLinks = [
        !isTenant && link('/home', t('nav.home'), faHome),
        !hasRentedRoom && previewLink,
        // Only for someone who has applied (any application, even a closed one).
        isLoggedIn && !hasRentedRoom && hasApplication && link('/track-application', t('nav.trackApp'), faFileContract),
        isLoggedIn && hasRentedRoom && link('/my-room', t('nav.myRoom'), faBed),
        isLoggedIn && hasRentedRoom && link('/services', t('nav.services'), faConciergeBell, SERVICE_PATHS),
        // Announcements has its own link (it was a Services card).
        isLoggedIn && hasRentedRoom && link('/announcements', t('nav.announcements'), faBullhorn),
        isLoggedIn && hasRentedRoom && link('/housekeeping', t('nav.housekeeping'), faBroom),
        // Payment History and My Refunds live in the account area (Profile Settings side menu).
    ].filter(Boolean);
    // Phones list the rooms page for tenants too, last.
    const mobileLinks = hasRentedRoom ? [...navLinks, previewLink] : navLinks;
    const isLinkActive = (l) => l.match.includes(location.pathname);
    const goTo = (path) => navigate(path);

    const menuItemClass = 'topbar-menu-item w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-semibold';

    return (
        <nav className="topbar-nav ut-native w-full bg-brand px-6 md:px-12 py-3.5 shadow-md sticky top-0 z-50 select-none box-border">
            <div className="w-full flex justify-between items-center gap-4 h-[44px]">

                {/* Brand Logo & Desktop Links */}
                <div className="flex min-w-0 items-center gap-6 lg:gap-8">
                    <button
                        type="button"
                        onClick={() => navigate(homePath)}
                        aria-label={t('topbar.logoLabel')}
                        className="topbar-logo text-white text-3xl italic font-bold tracking-wider cursor-pointer bg-transparent border-0 p-0 transition-transform duration-200 hover:scale-105 font-serif focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                    >
                        AMS
                    </button>

                    <NavPills links={navLinks} activePath={location.pathname} onGo={goTo} />
                </div>

                {/* Desktop Action Controls */}
                <div className="hidden md:flex shrink-0 items-center space-x-4">
                    {/* Signed-in users find the language in the account menu. */}
                    {!isLoggedIn && showLangSwitch && <LangSwitch />}

                    {isLoggedIn && (
                        <div className="relative" ref={notificationRef}>
                            <button
                                ref={bellButtonRef}
                                type="button"
                                onClick={() => (isNotificationOpen ? closeNotifications() : setIsNotificationOpen(true))}
                                aria-label={unreadCount > 0 ? t('topbar.notifUnread', { n: unreadCount }) : t('nav.notifications')}
                                aria-haspopup="true"
                                aria-expanded={isNotificationOpen}
                                className={`topbar-bell w-11 h-11 rounded-full text-white flex items-center justify-center transition-colors duration-200 border-0 cursor-pointer relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${isNotificationOpen ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                <FontAwesomeIcon key={bellRing} icon={faBell} className={`text-base ${bellRing ? 'topbar-bell-ring' : ''}`} aria-hidden="true" />
                                <UnreadBadge count={unreadCount} />
                            </button>

                            {notifMenu.mounted && (
                                <div data-closing={notifMenu.closing || undefined} className="topbar-pop ut-themed absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-50 overflow-hidden text-left">
                                    <div className="px-4 pb-2 border-b border-slate-100 flex justify-between items-center">
                                        <span className="font-bold text-xs text-slate-500">Notifications ({unreadCount})</span>
                                        <button onClick={() => { setIsNotificationOpen(false); navigate('/notifications'); }} className="min-h-[44px] px-2 -mr-2 text-sm text-indigo-600 hover:underline font-bold bg-transparent border-0 cursor-pointer">{t('nav.viewAll')}</button>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto px-2 py-1 space-y-1">
                                        {notifications.filter(n => !n.isArchived).length > 0 ? (
                                            notifications.filter(n => !n.isArchived).slice(0, 5).map(n => {
                                                // A payment update that just arrived: tinted by outcome, marked New.
                                                const isNew = highlightIds.has(n.id);
                                                const success = TENANT_PAYMENT_ALERT_TITLES[n.title] === 'success';
                                                const tone = !isNew ? (n.read ? 'hover:bg-slate-50' : 'bg-indigo-50/50 hover:bg-indigo-50')
                                                    : success ? 'bg-emerald-50 hover:bg-emerald-100/70 border-l-4 border-emerald-500'
                                                    : 'bg-rose-50 hover:bg-rose-100/70 border-l-4 border-rose-500';
                                                return (
                                                    <div
                                                        key={n.id}
                                                        data-new={isNew || undefined}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => openNotification(n)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNotification(n); } }}
                                                        className={`p-2.5 rounded-xl cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 ${tone}`}
                                                    >
                                                        <div className="flex justify-between gap-2">
                                                            <p className="text-xs font-bold text-slate-800 m-0">
                                                                {n.title}
                                                                {isNew && (
                                                                    <span className={`ml-1.5 align-middle text-xs font-black text-white px-1.5 py-0.5 rounded-full ${success ? 'bg-emerald-500' : 'bg-rose-500'}`}>{t('topbar.new')}</span>
                                                                )}
                                                            </p>
                                                            <span className="text-xs text-slate-500 whitespace-nowrap">{formatRelativeTime(n.createdAt)}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 m-0 mt-0.5">{n.message}</p>
                                                        {isNew && (
                                                            <p className={`text-xs font-bold m-0 mt-1 ${success ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                                {success ? t('topbar.viewReceipt') : t('topbar.openPayBills')}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="text-xs text-slate-500 text-center py-4 m-0">{t('topbar.noNotifications')}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {isLoggedIn ? (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                ref={avatarButtonRef}
                                type="button"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                aria-label={t('nav.accountMenuFor', { name: displayName })}
                                aria-haspopup="menu"
                                aria-expanded={isDropdownOpen}
                                className="flex items-center space-x-3 text-white/90 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 min-h-[44px] rounded-xl border-0 bg-transparent cursor-pointer transition-all duration-200 select-none focus-visible:outline-2 focus-visible:outline-white"
                            >
                                {/* The name shows from xl; below that the links need the room (the avatar stays). */}
                                <span className="hidden xl:inline font-bold text-sm tracking-wide">{displayName}</span>
                                
                                {dbAvatarUrl ? (
                                    <img 
                                        src={getFullAvatarUrl(dbAvatarUrl)} 
                                        alt="" 
                                        className="w-9 h-9 rounded-full object-cover border border-white/20 shadow-inner"
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-indigo-600 border border-white/20 text-white flex items-center justify-center text-xs font-black tracking-wider shadow-inner">
                                        {getInitials()}
                                    </div>
                                )}
                                
                                <FontAwesomeIcon icon={faChevronDown} className={`text-xs opacity-70 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {profileMenu.mounted && (
                                <div data-closing={profileMenu.closing || undefined} className="topbar-pop topbar-menu-stagger ut-themed absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 py-1.5 z-50 overflow-hidden text-left">
                                    <button onClick={() => { setIsDropdownOpen(false); navigate('/profile-settings'); }} className={menuItemClass}>
                                        <FontAwesomeIcon icon={faCog} className="text-slate-500 text-xs" />
                                        <span>{t('topbar.profileSettings')}</span>
                                    </button>
                                    {/* Payment History and My Refunds are in the Profile Settings side menu. */}
                                    <div className="border-t border-slate-100 my-1"></div>
                                    {(showThemePicker || showLangSwitch) && (
                                        <>
                                            {showThemePicker && <ThemePicker variant="menu" />}
                                            {showLangSwitch && <LangSwitch variant="menu" />}
                                            <div className="border-t border-slate-100 my-1"></div>
                                        </>
                                    )}
                                    <button onClick={closeMenusThenLogout} className="topbar-menu-item w-full px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-bold">
                                        <FontAwesomeIcon icon={faSignOutAlt} className="text-xs" />
                                        <span>{t('nav.logout')}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Guests have no account menu, so the theme switch sits on the bar. */}
                            {showThemePicker && <ThemePicker variant="bar" />}
                            <button onClick={onLoginClick} className="bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all duration-150 flex items-center space-x-1.5">
                                <FontAwesomeIcon icon={faSignInAlt} />
                                <span>{t('nav.login')}</span>
                            </button>
                        </>
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

                    {/* Keep quick notification access beside the drawer close control. */}
                    {isLoggedIn && (
                        <button
                            type="button"
                            onClick={() => navigate('/notifications')}
                            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border-0 cursor-pointer relative transition-colors"
                            aria-label={unreadCount > 0 ? t('topbar.notifUnread', { n: unreadCount }) : t('nav.notifications')}
                        >
                            <FontAwesomeIcon key={bellRing} icon={faBell} className={`text-base ${bellRing ? 'topbar-bell-ring' : ''}`} aria-hidden="true" />
                            <UnreadBadge count={unreadCount} />
                        </button>
                    )}

                    {/* Hamburger Toggle Button */}
                    <button
                        ref={menuButtonRef}
                        type="button"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        aria-expanded={isMobileMenuOpen}
                        aria-controls="mobile-nav-drawer"
                        className="mobile-menu-toggle topbar-mobile-menu-btn rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white border-0 cursor-pointer flex items-center justify-center transition-colors"
                        aria-label={t('topbar.menu')}
                    >
                        <FontAwesomeIcon icon={isMobileMenuOpen ? faTimes : faBars} className="text-lg" />
                    </button>
                </div>
            </div>

            {/* Payment alerts on phones: the bell dropdown above is desktop-only,
                so a confirmed/rejected/failed payment used to show only as a badge. */}
            {isNotificationOpen && highlightIds.size > 0 && !isMobileMenuOpen && (
                <div className="mobile-payment-alerts ut-themed md:hidden absolute left-0 right-0 top-[100%] z-50 px-3 pt-2 space-y-2" role="status">
                    {notifications.filter(n => highlightIds.has(n.id)).map(n => {
                        const success = TENANT_PAYMENT_ALERT_TITLES[n.title] === 'success';
                        return (
                            <div key={n.id} className={`flex items-start gap-2 rounded-xl p-3 shadow-xl border-l-4 ${success ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'}`}>
                                <button type="button" onClick={() => openNotification(n)} className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer">
                                    <p className="text-xs font-bold text-slate-800 m-0">{n.title}</p>
                                    <p className="text-xs text-slate-600 m-0 mt-0.5">{n.message}</p>
                                    <p className={`text-xs font-bold m-0 mt-1 ${success ? 'text-emerald-700' : 'text-rose-700'}`}>
                                        {success ? t('topbar.viewReceipt') : t('topbar.openPayBills')}
                                    </p>
                                </button>
                                <button type="button" onClick={closeNotifications} aria-label={t('topbar.dismiss')} className="shrink-0 w-11 h-11 rounded-lg bg-transparent border-0 text-slate-500 cursor-pointer flex items-center justify-center">
                                    <FontAwesomeIcon icon={faTimes} className="text-xs" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Mobile Dropdown Drawer */}
            {drawer.mounted && (
                <div
                    ref={mobileMenuRef}
                    id="mobile-nav-drawer"
                    data-closing={drawer.closing || undefined}
                    className="topbar-mobile-drawer md:hidden absolute left-0 right-0 top-[100%] bg-[#2e3460] shadow-2xl border-b border-white/10 px-5 py-5 z-50 flex flex-col space-y-4 text-left backdrop-blur-md"
                >
                    {/* Mobile Language Toggle */}
                    {showLangSwitch && (
                        <div className="flex items-center justify-between px-2 pb-2">
                            <span className="text-white/70 text-xs font-bold">{t('topbar.language')}</span>
                            <LangSwitch size="lg" />
                        </div>
                    )}

                    {showThemePicker && <ThemePicker variant="drawer" />}

                    {/* Navigation Items: the current page gets a white bar on its left. */}
                    <div className="topbar-menu-stagger flex flex-col space-y-1">
                        {mobileLinks.map((l) => {
                            const active = isLinkActive(l);
                            return (
                                <button
                                    key={l.path}
                                    type="button"
                                    onClick={() => { setIsMobileMenuOpen(false); navigate(l.path); }}
                                    aria-current={active ? 'page' : undefined}
                                    className={`relative flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-sm border-0 text-left cursor-pointer transition-colors before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-white before:transition-transform before:duration-300 ${active ? 'bg-white/15 text-white before:scale-y-100' : 'bg-transparent text-white/80 hover:bg-white/5 hover:text-white before:scale-y-0'}`}
                                >
                                    <FontAwesomeIcon icon={l.icon} className="text-xs w-4" />
                                    <span>{l.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Account Controls */}
                    <div className="border-t border-white/10 pt-4 flex flex-col space-y-3">
                        {isLoggedIn ? (
                            <>
                                <div className="flex items-center space-x-3 px-2">
                                    {dbAvatarUrl ? (
                                        <img 
                                            src={getFullAvatarUrl(dbAvatarUrl)} 
                                            alt="" 
                                            className="w-10 h-10 rounded-full object-cover border border-white/20 shadow-md"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black tracking-wider shadow-md">
                                            {getInitials()}
                                        </div>
                                    )}
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold text-sm leading-snug">{displayName}</span>
                                        <span className="text-white/70 text-xs">{t('topbar.loggedIn')}</span>
                                    </div>
                                </div>

                                <div className="flex w-full flex-col gap-2 pt-1">
                                    <button
                                        onClick={() => { setIsMobileMenuOpen(false); navigate('/profile-settings'); }}
                                        className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 px-3 rounded-xl text-xs border-0 cursor-pointer flex items-center justify-center space-x-2 transition-colors"
                                    >
                                        <FontAwesomeIcon icon={faCog} className="text-xs" />
                                        <span>{t('nav.settings')}</span>
                                    </button>
                                    {/* Payment History and My Refunds are in the Profile Settings side menu. */}
                                </div>

                                <button
                                    onClick={closeMenusThenLogout}
                                    className="w-full bg-rose-500/15 hover:bg-rose-500/25 active:scale-98 text-red-300 py-3 rounded-xl font-medium text-center border border-rose-500/40 cursor-pointer flex items-center justify-center space-x-2 text-sm transition-all mt-1"
                                >
                                    <FontAwesomeIcon icon={faSignOutAlt} />
                                    <span>{t('nav.logout')}</span>
                                </button>
                            </>
                        ) : (
                            <div className="flex flex-col space-y-2">
                                <button
                                    onClick={() => { setIsMobileMenuOpen(false); onLoginClick(); }}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white py-3 rounded-xl font-bold text-center shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 text-sm transition-all"
                                >
                                    <FontAwesomeIcon icon={faSignInAlt} />
                                    <span>{t('topbar.signInAccount')}</span>
                                </button>
                                <button
                                    onClick={() => { setIsMobileMenuOpen(false); navigate('/register'); }}
                                    className="w-full bg-white/10 hover:bg-white/20 active:scale-98 text-white py-2.5 rounded-xl font-semibold text-center border-0 cursor-pointer flex items-center justify-center space-x-2 text-xs transition-all"
                                >
                                    <FontAwesomeIcon icon={faUserPlus} />
                                    <span>{t('login.createAccount')}</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {selectedNotification && (
                <div className="ut-themed fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 animate-fade-in" onClick={() => setSelectedNotification(null)}>
                    <div ref={detailDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="topbar-notif-title" onClick={e => e.stopPropagation()} className="outline-none bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-scale-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center gap-3">
                            <h3 id="topbar-notif-title" className="text-lg font-bold text-slate-800 m-0">{selectedNotification.title}</h3>
                            <button type="button" aria-label={t('common.close')} onClick={() => setSelectedNotification(null)} className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer">
                                <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto">
                            <p className="text-sm text-slate-600 whitespace-pre-wrap m-0">{selectedNotification.message}</p>
                            {selectedNotification.attachment_path && (
                                <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                                    {selectedNotification.attachment_path.toLowerCase().endsWith('.pdf') ? (
                                        <iframe src={fileUrl(selectedNotification.attachment_path)} className="w-full h-64 border-0" title={t('topbar.attachment')}></iframe>
                                    ) : (
                                        <img src={fileUrl(selectedNotification.attachment_path)} alt={t('topbar.attachment')} className="w-full max-h-64 object-contain bg-slate-50" />
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                            {TENANT_NOTIFICATION_LINKS[selectedNotification.type] && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const path = TENANT_NOTIFICATION_LINKS[selectedNotification.type].path;
                                        setSelectedNotification(null);
                                        navigate(path);
                                    }}
                                    className="min-h-[44px] px-6 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl cursor-pointer border-0"
                                >
                                    {t('topbar.goToPage')}
                                </button>
                            )}
                            <button type="button" onClick={() => setSelectedNotification(null)} className="min-h-[44px] px-6 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl cursor-pointer border-0">{t('common.close')}</button>
                        </div>
                    </div>
                </div>
            )}
        
            {/* App Status One-Time Modal */}
            {appStatusModal && (
                <div className="ut-themed fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={closeAppStatusModal}>
                    <div ref={appStatusDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('topbar.appUpdate')} onClick={e => e.stopPropagation()} className="outline-none bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-slate-100">
                        {appStatusModal.title?.toLowerCase().includes('approved') ? (
                            <div className="bg-emerald-50 p-8 flex flex-col items-center border-b border-emerald-100 text-center">
                                <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center shadow-inner mb-4 border-4 border-white">
                                    <FontAwesomeIcon icon={faCheckCircle} className="text-4xl" />
                                </div>
                                <h2 className="text-2xl font-black text-emerald-800 m-0 tracking-tight">{t('topbar.congrats')}</h2>
                                <p className="text-emerald-600 font-bold mt-1 mb-0 text-xs">{t('topbar.appApproved')}</p>
                            </div>
                        ) : appStatusModal.title?.toLowerCase().includes('action required') ? (
                            <div className="bg-amber-50 p-8 flex flex-col items-center border-b border-amber-100 text-center">
                                <div className="w-20 h-20 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center shadow-inner mb-4 border-4 border-white">
                                    <FontAwesomeIcon icon={faInfoCircle} className="text-4xl" />
                                </div>
                                <h2 className="text-2xl font-black text-amber-800 m-0 tracking-tight">{t('topbar.actionRequired')}</h2>
                                <p className="text-amber-600 font-bold mt-1 mb-0 text-xs">{t('topbar.updateNeeded')}</p>
                            </div>
                        ) : (
                            <div className="bg-red-50 p-8 flex flex-col items-center border-b border-red-100 text-center">
                                <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center shadow-inner mb-4 border-4 border-white">
                                    <FontAwesomeIcon icon={faTimesCircle} className="text-4xl" />
                                </div>
                                <h2 className="text-2xl font-black text-red-800 m-0 tracking-tight">{t('topbar.appUpdate')}</h2>
                                <p className="text-red-600 font-bold mt-1 mb-0 text-xs">{t('topbar.appRejected')}</p>
                            </div>
                        )}
                        <div className="p-8 flex flex-col items-center text-center">
                            <p className="text-slate-600 font-medium leading-relaxed m-0 whitespace-pre-wrap">{appStatusModal.message}</p>
                            {appStatusModal.attachment_path && (
                                <div className="mt-4 w-full border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                    {appStatusModal.attachment_path.toLowerCase().endsWith('.pdf') ? (
                                        <iframe src={fileUrl(appStatusModal.attachment_path)} className="w-full h-64 border-0" title={t('topbar.attachment')}></iframe>
                                    ) : (
                                        <img src={fileUrl(appStatusModal.attachment_path)} alt={t('topbar.attachment')} className="w-full max-h-64 object-contain bg-slate-50" />
                                    )}
                                </div>
                            )}
                            <button onClick={closeAppStatusModal} className="mt-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-6 rounded-xl border-0 cursor-pointer shadow-md shadow-indigo-200 transition-all active:scale-[0.98]">
                                {t('topbar.gotIt')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </nav>
    );
}
