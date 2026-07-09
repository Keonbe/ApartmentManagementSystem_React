import React, { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faPlus, faTimes, faUser, faFileAlt, faBuilding, faUpload, faCalendarAlt, faPhone, faEnvelope, faExclamationTriangle, faCheckCircle, faSignOutAlt, faEye, faChevronRight, faClock, faShieldAlt } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

const daysRemaining = (leaseEnd) => {
  const diff = Math.ceil((new Date(leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
};

const AdminTenants = () => {
  const [tenants, setTenants] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMoveOutConfirm, setShowMoveOutConfirm] = useState(false);
  const [moveOutTarget, setMoveOutTarget] = useState(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const res = await api.get('/get_tenants.php');
      if (res.data.success) setTenants(res.data.data);
    } catch (err) {
      console.error("Error fetching tenants:", err);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.post('/update_tenant_status.php', { id, status });
      fetchTenants();
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const counts = {
    all: tenants.length,
    active: tenants.filter(t => t.status === 'active').length,
    'pending-move-out': tenants.filter(t => t.status === 'pending-move-out').length,
    'moved-out': tenants.filter(t => t.status === 'moved-out').length,
  };

  const filters = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'active', label: `Active (${counts.active})`, activeStyle: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    { key: 'pending-move-out', label: `Pending Move-Out (${counts['pending-move-out']})`, activeStyle: 'bg-amber-100 text-amber-800 border-amber-300' },
    { key: 'moved-out', label: `Moved Out (${counts['moved-out']})`, activeStyle: 'bg-slate-200 text-slate-600 border-slate-300' },
  ];

  let displayed = activeFilter === 'all' ? tenants : tenants.filter(t => t.status === activeFilter);
  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    displayed = displayed.filter(t => t.name.toLowerCase().includes(q) || t.unit.toLowerCase().includes(q) || t.email.toLowerCase().includes(q));
  }

  const getOccupancyBadge = (status) => {
    const map = {
      active: { style: 'bg-emerald-100 text-emerald-800', label: '● Active' },
      'pending-move-out': { style: 'bg-amber-100 text-amber-800', label: '◔ Pending Move-Out' },
      'moved-out': { style: 'bg-slate-100 text-slate-500', label: '○ Moved Out' },
    };
    const { style, label } = map[status] || map.active;
    return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${style}`}>{label}</span>;
  };

  const getPaymentBadge = (ps) => {
    const map = {
      paid: { style: 'bg-emerald-100 text-emerald-800', label: '✓ Paid' },
      pending: { style: 'bg-amber-100 text-amber-800', label: '○ Pending' },
      overdue: { style: 'bg-red-100 text-red-800', label: '! Overdue' },
    };
    const { style, label } = map[ps] || map.paid;
    return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${style}`}>{label}</span>;
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Tenant Management" />
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="flex-1 bg-transparent text-sm text-slate-700 outline-none p-0" />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {filters.map(f => (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`px-4 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${activeFilter === f.key ? (f.activeStyle || 'bg-indigo-600 text-white') : 'bg-white text-slate-500'}`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Tenant</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Unit</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(t => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{t.name}</div>
                        <div className="text-[11px] text-slate-400">{t.email}</div>
                      </td>
                      <td className="px-4 py-3">{t.unit}</td>
                      <td className="px-4 py-3">{getOccupancyBadge(t.status)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelectedTenant(t); setShowProfileModal(true); }} className="text-indigo-600 font-semibold border-0 bg-transparent cursor-pointer">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      
      {showProfileModal && selectedTenant && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowProfileModal(false)}>
             <div className="bg-white p-6 rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                 <h2 className="font-bold text-lg">{selectedTenant.name}</h2>
                 <p className="text-sm">Unit: {selectedTenant.unit}</p>
                 <button onClick={() => { updateStatus(selectedTenant.id, 'pending-move-out'); setShowProfileModal(false); }} className="mt-4 w-full bg-amber-500 text-white p-2 rounded">Move Out</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default AdminTenants;