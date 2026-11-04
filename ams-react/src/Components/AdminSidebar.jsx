import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGaugeHigh, faBuilding, faUsers, faCreditCard,
  faWrench, faBullhorn, faFileAlt, faBell, faFileContract, faConciergeBell,
  faHistory, faUsersCog, faTimes, faIdBadge, faCar, faVideo, faBolt,
  faEnvelopeOpenText, faEnvelope, faMoneyBillTransfer, faChartBar, faSlidersH, faIdCard,
  faCogs, faComments, faHouseUser, faFileInvoiceDollar, faScrewdriverWrench, faUserGear,
  faChevronDown, faThumbtack, faArrowPointer, faAnglesLeft,
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import '@fontsource-variable/ibm-plex-sans';
import '../assets/styles/responsive/admin/admin-sidebar.responsive.css';
// Phone rules for every admin page (.admin-shell): every page renders this sidebar.
import '../assets/styles/responsive/admin/admin-shell.responsive.css';

// Dashboard stays on top; everything else sits in a group that opens and closes.
// The contract template is edited on the Contracts page (its Template Editor
// tab); /admin-contract-editor redirects there.
const DASHBOARD = { to: '/admin-dashboard', icon: faGaugeHigh, label: 'Dashboard' };
const NAV_GROUPS = [
  {
    id: 'general',
    title: 'General',
    icon: faComments,
    items: [
      { to: '/admin-messages', icon: faEnvelope, label: 'Messages' },
      { to: '/admin-notifications', icon: faBell, label: 'Notifications' },
      { to: '/admin-announcements', icon: faBullhorn, label: 'Announcements' },
    ],
  },
  {
    id: 'leasing',
    title: 'Leasing',
    icon: faHouseUser,
    items: [
      { to: '/admin-inquiries', icon: faEnvelopeOpenText, label: 'Inquiries' },
      { to: '/admin-applications', icon: faFileAlt, label: 'Applications' },
      { to: '/admin-units', icon: faBuilding, label: 'Units' },
      { to: '/admin-tenants', icon: faUsers, label: 'Tenants' },
      { to: '/admin-contracts', icon: faFileContract, label: 'Contracts' },
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    icon: faFileInvoiceDollar,
    items: [
      { to: '/admin-payments', icon: faCreditCard, label: 'Payments' }, // Core service: always visible
      { to: '/admin-refunds', icon: faMoneyBillTransfer, label: 'Refunds' },
      { to: '/admin-utilities', icon: faBolt, label: 'Utilities' },
      { to: '/admin-payment-options', icon: faSlidersH, label: 'Payment Options' },
    ],
  },
  {
    id: 'services',
    title: 'Services',
    icon: faScrewdriverWrench,
    items: [
      { to: '/admin-maintenance', icon: faWrench, label: 'Maintenance', serviceKey: 'service_maintenance_active' },
      { to: '/admin-services', icon: faConciergeBell, label: 'Services' },
      { to: '/admin-visitors', icon: faIdBadge, label: 'Visitors', serviceKey: 'service_visitor_management_active' },
      { to: '/admin-parking', icon: faCar, label: 'Parking', serviceKey: 'service_parking_active' },
      { to: '/admin-cctv', icon: faVideo, label: 'CCTV', serviceKey: 'service_cctv_active' },
    ],
  },
  {
    id: 'admin',
    title: 'Administration',
    icon: faUserGear,
    items: [
      { to: '/admin-users', icon: faUsersCog, label: 'Users' },
      { to: '/admin-reports', icon: faChartBar, label: 'Reports' },
      { to: '/admin-activity-logs', icon: faHistory, label: 'Activity Log' },
      { to: '/admin-requirements', icon: faIdCard, label: 'Document Requirements' },
      { to: '/admin-other-settings', icon: faCogs, label: 'Other Settings' },
    ],
  },
];

// How the desktop sidebar behaves (below lg it is always a slide-out drawer):
// stay open, an icon rail whose groups open as flyouts, or a rail that opens on hover.
const MODES = [
  { id: 'expanded', icon: faThumbtack, label: 'Stay open' },
  { id: 'collapsed', icon: faAnglesLeft, label: 'Collapsed' },
  { id: 'hover', icon: faArrowPointer, label: 'Expand on hover' },
];
const MODE_KEY = 'ams_admin_sidebar_mode';
const GROUPS_KEY = 'ams_admin_sidebar_groups';

const readStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const writeStore = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered (private window): the default applies next time.
  }
};

// Row geometry: nav px-3 + row px-3 put a w-6 icon's centre 36px from the
// left, the middle of the 72px rail, so icons never move when it widens.
const rowBase = 'admin-sidebar-nav-link btn-interactive w-full flex items-center gap-3 h-10 px-3 rounded-lg text-sm no-underline transition-colors border-0 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const iconBox = 'w-6 shrink-0 flex items-center justify-center';
const fade = (narrow) => `whitespace-nowrap overflow-hidden transition-opacity duration-200 ${narrow ? 'opacity-0' : 'opacity-100 delay-75'}`;

// narrow: the 72px rail (labels hidden, groups closed). flyouts: rail groups open
// a flyout (collapsed mode); in hover mode the whole rail widens instead.
function SidebarNav({ narrow = false, mobile = false, flyouts = false, nav }) {
  const { groups, activeGroupId, openGroups, toggleGroup, isItemActive, flyout, setFlyout, openFlyout, closeFlyoutSoon, mode, setMode, handleClose } = nav;
  const dashActive = isItemActive(DASHBOARD);
  const flyoutHandlers = (id) => (flyouts ? {
    onMouseEnter: (e) => openFlyout(id, e.currentTarget),
    onMouseLeave: closeFlyoutSoon,
    onFocus: (e) => openFlyout(id, e.currentTarget),
  } : {});

  return (
    <>
      {/* Logo */}
      <div className={`h-20 flex items-center justify-between shrink-0 border-b border-slate-800 bg-slate-900 select-none ${narrow ? 'px-0 justify-center' : 'px-6'}`}>
        {narrow ? (
          <p className="text-xl font-medium text-white italic font-serif m-0 leading-none">AMS</p>
        ) : (
          <div className="flex flex-col justify-center min-w-0">
            <p className="text-2xl font-medium text-white italic font-serif m-0 leading-none">AMS</p>
            <p className="text-caption font-medium text-slate-400 m-0 mt-1 whitespace-nowrap tracking-tight font-sans">Apartment Management System</p>
          </div>
        )}
        {mobile && (
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Sidebar"
            className="admin-sidebar-close-btn btn-interactive text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer p-2 text-section focus:outline-none"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 min-h-0 admin-sidebar-nav-scroll" aria-label="Admin">
        <NavLink
          to={DASHBOARD.to}
          onClick={mobile ? handleClose : undefined}
          aria-current={dashActive ? 'page' : undefined}
          aria-label={narrow ? DASHBOARD.label : undefined}
          className={`${rowBase} ${dashActive ? 'bg-indigo-600 text-white font-semibold shadow-card' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          {...flyoutHandlers('dashboard')}
        >
          <span className={iconBox}><FontAwesomeIcon icon={DASHBOARD.icon} /></span>
          <span className={fade(narrow)}>{DASHBOARD.label}</span>
        </NavLink>

        <div className="my-3 border-t border-slate-800" aria-hidden="true" />

        <ul className="m-0 p-0 list-none space-y-1">
          {groups.map((g) => {
            const containsActive = g.id === activeGroupId;
            const open = !narrow && !!openGroups[g.id];
            const listId = `admin-nav-${g.id}${mobile ? '-m' : ''}`;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={(e) => (flyouts ? (flyout?.id === g.id ? setFlyout(null) : openFlyout(g.id, e.currentTarget)) : toggleGroup(g.id))}
                  aria-expanded={flyouts ? flyout?.id === g.id : open}
                  aria-controls={flyouts ? undefined : listId}
                  aria-haspopup={flyouts ? 'menu' : undefined}
                  aria-label={narrow ? g.title : undefined}
                  className={`${rowBase} font-semibold ${
                    narrow && containsActive
                      ? 'bg-indigo-600/90 text-white'
                      : containsActive
                        ? 'text-white hover:bg-slate-800'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                  {...flyoutHandlers(g.id)}
                >
                  <span className={iconBox}><FontAwesomeIcon icon={g.icon} /></span>
                  <span className={`flex-1 ${fade(narrow)}`}>{g.title}</span>
                  {!narrow && (
                    <>
                      {containsActive && !open && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" aria-hidden="true" />}
                      <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] shrink-0 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`} aria-hidden="true" />
                    </>
                  )}
                </button>

                {!narrow && (
                  // grid-rows 0fr → 1fr animates the height without measuring it.
                  <div
                    id={listId}
                    className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                    inert={!open}
                  >
                    <ul className="m-0 p-0 list-none overflow-hidden min-h-0 ml-6 pl-3 border-l border-slate-800 space-y-0.5">
                      {g.items.map((item, idx) => {
                        const active = isItemActive(item);
                        return (
                          <li key={item.to} className={idx === 0 ? 'pt-1' : idx === g.items.length - 1 ? 'pb-1' : ''}>
                            <NavLink
                              to={item.to}
                              onClick={mobile ? handleClose : undefined}
                              aria-current={active ? 'page' : undefined}
                              className={`admin-sidebar-nav-link btn-interactive flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-sm no-underline transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                                active ? 'bg-indigo-600 text-white font-semibold shadow-card' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                              }`}
                            >
                              <span className="w-4 shrink-0 flex items-center justify-center text-xs opacity-90"><FontAwesomeIcon icon={item.icon} /></span>
                              <span className="truncate">{item.label}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sidebar mode (desktop only) */}
      {!mobile && (
        <div className={`shrink-0 border-t border-slate-800 p-3 ${narrow ? 'flex flex-col items-center gap-1' : ''}`}>
          {!narrow && <p className="m-0 mb-2 px-1 text-caption font-medium text-slate-500">Sidebar</p>}
          <div className={narrow ? 'flex flex-col gap-1' : 'grid grid-cols-3 gap-1 rounded-lg bg-slate-800/70 p-1'} role="radiogroup" aria-label="Sidebar behaviour">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                title={m.label}
                aria-label={m.label}
                className={`touch-compact h-8 ${narrow ? 'w-10' : 'w-full'} rounded-md border-0 cursor-pointer text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  mode === m.id ? 'bg-indigo-600 text-white' : 'bg-transparent text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <FontAwesomeIcon icon={m.icon} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const Sidebar = ({ isOpen: propIsOpen, onClose: propOnClose }) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [settings, setSettings] = useState({});
  const location = useLocation();

  const [mode, setModeState] = useState(() => {
    const m = readStore(MODE_KEY, 'expanded');
    return MODES.some((x) => x.id === m) ? m : 'expanded';
  });
  const setMode = (m) => { setModeState(m); writeStore(MODE_KEY, m); setFlyout(null); };

  const isItemVisible = (item) => {
    if (!item.serviceKey) return true; // Always visible for core items
    const val = settings[item.serviceKey];
    return val === undefined || val === 'true' || val === true;
  };
  const isItemActive = (item) => location.pathname === item.to;
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(isItemVisible) }))
    .filter((g) => g.items.length > 0);
  const activeGroupId = NAV_GROUPS.find((g) => g.items.some(isItemActive))?.id;

  // Open groups, remembered; the current page's group always starts open.
  const [openGroups, setOpenGroups] = useState(() => {
    const stored = readStore(GROUPS_KEY, {});
    const start = stored && typeof stored === 'object' ? { ...stored } : {};
    const active = NAV_GROUPS.find((g) => g.items.some((it) => it.to === location.pathname));
    if (active) start[active.id] = true;
    return start;
  });
  const toggleGroup = (id) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeStore(GROUPS_KEY, next);
      return next;
    });
  };

  // Hover mode: the rail widens over the page while the pointer or focus is in it.
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef(null);
  const setHoverSoon = (value, ms) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(value), ms);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // Collapsed mode: a group's links (or the Dashboard's name) in a flyout beside the rail.
  // Fixed position, so the scrolling nav never clips it.
  const [flyout, setFlyout] = useState(null); // { id, top, bottom } | null
  const flyoutTimer = useRef(null);
  const openFlyout = (id, el) => {
    clearTimeout(flyoutTimer.current);
    const r = el.getBoundingClientRect();
    const lowHalf = r.top > window.innerHeight * 0.6;
    setFlyout({ id, top: lowHalf ? null : r.top, bottom: lowHalf ? window.innerHeight - r.bottom : null });
  };
  const closeFlyoutSoon = () => {
    clearTimeout(flyoutTimer.current);
    flyoutTimer.current = setTimeout(() => setFlyout(null), 160);
  };
  useEffect(() => () => clearTimeout(flyoutTimer.current), []);
  useEffect(() => {
    if (!flyout) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setFlyout(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flyout]);

  const isDrawerOpen = propIsOpen !== undefined ? propIsOpen : internalIsOpen;
  const handleClose = () => {
    if (propOnClose) propOnClose();
    setInternalIsOpen(false);
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('get_system_settings.php');
      if (res.data.success && res.data.settings) {
        setSettings(res.data.settings);
      }
    } catch (e) {
      console.error('Failed to load system settings in sidebar:', e);
    }
  };

  useEffect(() => {
    const load = async () => { await fetchSettings(); };
    load();

    const handleSettingsUpdate = (e) => {
      if (e && e.detail) {
        setSettings(prev => ({ ...prev, ...e.detail }));
      } else {
        fetchSettings();
      }
    };

    window.addEventListener('system-settings-updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('system-settings-updated', handleSettingsUpdate);
    };
  }, []);

  // Auto close the mobile drawer and any flyout on navigation. The internal state
  // is adjusted during render; the parent's onClose is an external callback.
  const currentRoute = location.pathname + location.search;
  const [seenPath, setSeenPath] = useState(currentRoute);
  if (seenPath !== currentRoute) {
    setSeenPath(currentRoute);
    setInternalIsOpen(false);
    setFlyout(null);
  }

  useEffect(() => {
    if (propOnClose) propOnClose();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleToggle = () => setInternalIsOpen(prev => !prev);
    const handleOpen = () => setInternalIsOpen(true);
    const handleCloseEvent = () => setInternalIsOpen(false);

    window.addEventListener('toggle-admin-sidebar', handleToggle);
    window.addEventListener('open-admin-sidebar', handleOpen);
    window.addEventListener('close-admin-sidebar', handleCloseEvent);

    return () => {
      window.removeEventListener('toggle-admin-sidebar', handleToggle);
      window.removeEventListener('open-admin-sidebar', handleOpen);
      window.removeEventListener('close-admin-sidebar', handleCloseEvent);
    };
  }, []);

  // While the drawer is open: Escape closes it and the page behind it does not scroll.
  useEffect(() => {
    if (!isDrawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (propOnClose) propOnClose();
      setInternalIsOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isDrawerOpen, propOnClose]);


  const nav = { groups, activeGroupId, openGroups, toggleGroup, isItemActive, flyout, setFlyout, openFlyout, closeFlyoutSoon, mode, setMode, handleClose };

  // Every admin page renders its own <main> (the header sits inside it), so the
  // skip link focuses whichever one is on screen instead of a fixed id.
  const skipToMain = (e) => {
    const main = document.querySelector('main');
    if (!main) return;
    e.preventDefault();
    main.tabIndex = -1;
    main.focus();
  };

  const flyoutGroup = flyout && flyout.id !== 'dashboard' ? groups.find((g) => g.id === flyout.id) : null;
  const panelBase = 'bg-slate-900 text-slate-300 flex flex-col h-full text-left select-none';

  return (
    <>
      <a
        href="#main"
        onClick={skipToMain}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-control focus:bg-white focus:text-indigo-700 focus:font-semibold focus:shadow-raised focus:ring-2 focus:ring-indigo-500 print:hidden"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      {mode === 'hover' ? (
        // The 72px slot stays in the layout; the panel widens over the page.
        <aside className="hidden lg:block relative w-[72px] shrink-0 h-full print:hidden" aria-label="Admin navigation">
          <div
            className={`${panelBase} absolute inset-y-0 left-0 z-50 overflow-hidden border-r border-slate-800 transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none ${hovered ? 'w-64 shadow-2xl shadow-slate-950/40' : 'w-[72px]'}`}
            onMouseEnter={() => setHoverSoon(true, 120)}
            onMouseLeave={() => setHoverSoon(false, 250)}
            onFocusCapture={() => setHoverSoon(true, 0)}
            onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHoverSoon(false, 0); }}
          >
            <div className={`${hovered ? 'w-64' : 'w-[72px]'} h-full flex flex-col`}>
              <SidebarNav narrow={!hovered} nav={nav} />
            </div>
          </div>
        </aside>
      ) : (
        <aside
          className={`${panelBase} hidden lg:flex shrink-0 border-r border-slate-800 print:hidden ${mode === 'collapsed' ? 'w-[72px]' : 'w-64'}`}
          aria-label="Admin navigation"
        >
          <SidebarNav narrow={mode === 'collapsed'} flyouts={mode === 'collapsed'} nav={nav} />
        </aside>
      )}

      {/* Collapsed rail flyout */}
      {flyout && mode === 'collapsed' && (
        <div
          className="hidden lg:block fixed z-[60] left-[80px] min-w-48 max-w-64 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl shadow-slate-950/50 py-1.5 text-left modal-card-anim print:hidden"
          style={flyout.top !== null ? { top: flyout.top } : { bottom: flyout.bottom }}
          onMouseEnter={() => clearTimeout(flyoutTimer.current)}
          onMouseLeave={closeFlyoutSoon}
          role={flyoutGroup ? 'menu' : 'tooltip'}
          aria-label={flyoutGroup ? flyoutGroup.title : DASHBOARD.label}
        >
          {flyoutGroup ? (
            <>
              <p className="m-0 px-3 pt-1 pb-1.5 text-caption font-semibold text-slate-400">{flyoutGroup.title}</p>
              <ul className="m-0 p-0 list-none">
                {flyoutGroup.items.map((item) => {
                  const active = isItemActive(item);
                  return (
                    <li key={item.to} className="px-1.5">
                      <NavLink
                        to={item.to}
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
                        onBlur={(e) => { if (!e.currentTarget.closest('[role="menu"]')?.contains(e.relatedTarget)) closeFlyoutSoon(); }}
                        className={`flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm no-underline transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                          active ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span className="w-4 shrink-0 flex items-center justify-center text-xs"><FontAwesomeIcon icon={item.icon} /></span>
                        <span className="whitespace-nowrap">{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="m-0 px-3 py-0.5 text-sm font-semibold text-slate-100 whitespace-nowrap">{DASHBOARD.label}</p>
          )}
        </div>
      )}

      {/* Mobile Drawer Overlay Backdrop */}
      {isDrawerOpen && (
        <div
          onClick={handleClose}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity modal-overlay-anim print:hidden"
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-Out Drawer */}
      <aside
        className={`admin-sidebar-mobile-drawer ${panelBase} fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] lg:hidden transform transition-transform duration-300 ease-in-out print:hidden ${
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Mobile Navigation"
        inert={!isDrawerOpen}
      >
        <SidebarNav mobile nav={nav} />
      </aside>
    </>
  );
};

export default Sidebar;
