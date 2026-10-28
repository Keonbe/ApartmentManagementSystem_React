import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHome, faBuilding, faUsers, faCreditCard, 
  faWrench, faBullhorn, faFileAlt, faBell, faFileContract, faConciergeBell,
  faHistory, faUsersCog, faTimes, faIdBadge, faCar, faVideo, faBolt,
  faEnvelopeOpenText, faEnvelope, faFileSignature, faMoneyBillTransfer
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import '../assets/styles/responsive/admin/admin-sidebar.responsive.css';
// Phone rules for every admin page (.admin-shell): every page renders this sidebar.
import '../assets/styles/responsive/admin/admin-shell.responsive.css';

const defaultNavSections = [
  {
    title: 'Main',
    items: [
      { to: '/admin-dashboard', icon: faHome, label: 'Dashboard' },
      { to: '/admin-inquiries', icon: faEnvelopeOpenText, label: 'Inquiries' },
      { to: '/admin-applications', icon: faFileAlt, label: 'Applications' },
      { to: '/admin-units', icon: faBuilding, label: 'Units' },
      { to: '/admin-tenants', icon: faUsers, label: 'Tenants' },
      { to: '/admin-users', icon: faUsersCog, label: 'Users' },
      { to: '/admin-payments', icon: faCreditCard, label: 'Payments' }, // Core service: always visible
      { to: '/admin-refunds', icon: faMoneyBillTransfer, label: 'Refunds' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin-messages', icon: faEnvelope, label: 'Messages' },
      { to: '/admin-visitors', icon: faIdBadge, label: 'Visitors', serviceKey: 'service_visitor_management_active' },
      { to: '/admin-parking', icon: faCar, label: 'Parking', serviceKey: 'service_parking_active' },
      { to: '/admin-maintenance', icon: faWrench, label: 'Maintenance', serviceKey: 'service_maintenance_active' },
      { to: '/admin-cctv', icon: faVideo, label: 'CCTV', serviceKey: 'service_cctv_active' },
      { to: '/admin-utilities', icon: faBolt, label: 'Utilities' },
      { to: '/admin-services', icon: faConciergeBell, label: 'Services' },
      { to: '/admin-announcements', icon: faBullhorn, label: 'Announcements' },
      { to: '/admin-notifications', icon: faBell, label: 'Notifications' },
      { to: '/admin-activity-logs', icon: faHistory, label: 'Activity Log' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/admin-reports', icon: faFileAlt, label: 'Reports' },
      { to: '/admin-contracts', icon: faFileContract, label: 'Contracts' },
      { to: '/admin-contract-editor', icon: faFileSignature, label: 'Edit Contract' },
    ],
  },
];

const Sidebar = ({ isOpen: propIsOpen, onClose: propOnClose }) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [settings, setSettings] = useState({});
  const location = useLocation();

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

  // Auto close the mobile drawer on navigation. The internal state is adjusted during
  // render; the parent's onClose is an external callback, so it stays in an effect.
  const [seenPath, setSeenPath] = useState(location.pathname);
  if (seenPath !== location.pathname) {
    setSeenPath(location.pathname);
    setInternalIsOpen(false);
  }

  useEffect(() => {
    if (propOnClose) propOnClose();
  }, [location.pathname]);

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

  const isItemVisible = (item) => {
    if (!item.serviceKey) return true; // Always visible for core items
    const val = settings[item.serviceKey];
    return val === undefined || val === 'true' || val === true;
  };

  const renderNavContent = (isMobile = false) => (
    <>
      {/* Logo Area */}
      <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800 shrink-0 bg-slate-900 z-10 select-none">
        <div className="flex flex-col justify-center">
          <p className="text-2xl font-bold text-white tracking-wider italic font-serif m-0 leading-none uppercase">AMS</p>
          <p className="text-[11px] font-medium text-slate-400 m-0 mt-1 whitespace-nowrap tracking-tight font-sans">Apartment Management System</p>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Sidebar"
            className="admin-sidebar-close-btn btn-interactive text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer p-2 text-xl focus:outline-none"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8 min-h-0 admin-sidebar-nav-scroll">
        {defaultNavSections.map((section) => {
          const visibleItems = section.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2 m-0">{section.title}</h2>
              <ul className="space-y-1 p-0 m-0 list-none">
                {visibleItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={isMobile ? handleClose : undefined}
                      className={({ isActive }) =>
                        `admin-sidebar-nav-link btn-interactive flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm no-underline ${
                          isActive
                            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`
                      }
                    >
                      <div className="w-5 text-center flex items-center justify-center">
                        <FontAwesomeIcon icon={item.icon} className="text-sm" />
                      </div>
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </>
  );

  // Every admin page renders its own <main> (the header sits inside it), so the
  // skip link focuses whichever one is on screen instead of a fixed id.
  const skipToMain = (e) => {
    const main = document.querySelector('main');
    if (!main) return;
    e.preventDefault();
    main.tabIndex = -1;
    main.focus();
  };

  return (
    <>
      <a
        href="#main"
        onClick={skipToMain}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-white focus:text-indigo-700 focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-indigo-500 print:hidden"
      >
        Skip to main content
      </a>

      {/* Desktop Persistent Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex-col hidden lg:flex h-full text-left shrink-0 select-none border-r border-slate-800 print:hidden">
        {renderNavContent(false)}
      </aside>

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
        className={`admin-sidebar-mobile-drawer fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-900 text-slate-300 flex flex-col h-full text-left lg:hidden transform transition-transform duration-300 ease-in-out select-none print:hidden ${
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Mobile Navigation"
        inert={!isDrawerOpen}
      >
        {renderNavContent(true)}
      </aside>
    </>
  );
};

export default Sidebar;