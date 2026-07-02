import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Building, Users, CreditCard, Wrench, Megaphone, FileText, Settings } from 'lucide-react';

const navSections = [
  {
    title: 'Main',
    items: [
      { to: '/admin-dashboard', icon: Home, label: 'Dashboard' },
      { to: '/admin-units', icon: Building, label: 'Units' },
      { to: '/admin-tenants', icon: Users, label: 'Tenants' },
      { to: '/admin-payments', icon: CreditCard, label: 'Payments' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin-maintenance', icon: Wrench, label: 'Maintenance' },
      { to: '/admin-announcements', icon: Megaphone, label: 'Announcements' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/admin-reports', icon: FileText, label: 'Reports' },
    ],
  },
];

const Sidebar = () => {
  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex-col hidden md:flex h-full">
      {/* Logo Area */}
      <div className="h-20 flex flex-col justify-center px-6 border-b border-slate-800">
        <h1 className="text-3xl font-bold text-white tracking-wider italic font-serif">AMS</h1>
        <p className="text-xs text-slate-400">Apartment Management System</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
        {navSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">{section.title}</h2>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-slate-800'
                      }`
                    }
                  >
                    <item.icon size={18} />
                    <span className="font-medium">{item.label}</span>
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