import React from 'react';
import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHome, faBuilding, faUsers, faCreditCard, 
  faWrench, faBullhorn, faFileAlt, faBell, faFileContract, faConciergeBell
} from '@fortawesome/free-solid-svg-icons';

const navSections = [
  {
    title: 'Main',
    items: [
      { to: '/admin-dashboard', icon: faHome, label: 'Dashboard' },
      { to: '/admin-units', icon: faBuilding, label: 'Units' },
      { to: '/admin-tenants', icon: faUsers, label: 'Tenants' },
      { to: '/admin-payments', icon: faCreditCard, label: 'Payments' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin-maintenance', icon: faWrench, label: 'Maintenance' },
      { to: '/admin-services', icon: faConciergeBell, label: 'Services' },
      { to: '/admin-announcements', icon: faBullhorn, label: 'Announcements' },
      { to: '/admin-notifications', icon: faBell, label: 'Notifications' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/admin-reports', icon: faFileAlt, label: 'Reports' },
      { to: '/admin-contracts', icon: faFileContract, label: 'Contracts' },
    ],
  },
];

const Sidebar = () => {
  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex h-full text-left shrink-0 select-none">
      {/* Logo Area */}
      <div className="h-20 flex flex-col justify-center px-6 border-b border-slate-800">
        <h1 className="text-3xl font-bold text-white tracking-wider italic font-serif m-0 uppercase">AMS</h1>
        <p className="text-xs text-slate-400 m-0 mt-0.5">Apartment Management System</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
        {navSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2 m-0">{section.title}</h2>
            <ul className="space-y-1 p-0 m-0 list-none">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm no-underline ${
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
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;