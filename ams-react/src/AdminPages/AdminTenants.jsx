import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faPlus, faTimes, faUser, faFileText, faBuilding, faUpload,
  faCalendarAlt, faPhone, faEnvelope, faExclamationTriangle, faCheckCircle,
  faLogOut, faEye, faChevronRight, faClock, faShieldAlt
} from '@fortawesome/free-solid-svg-icons';

const initialTenants = [
  { id: 1, name: 'Maria Santos', email: 'maria.santos@email.com', phone: '0917-123-4567', emergencyContact: 'Juan Santos — 0918-111-2222', unit: '1A', rent: '₱6,500', moveIn: '2024-06-01', leaseEnd: '2025-06-01', status: 'active', balance: '₱0', paymentStatus: 'paid', documents: [{ name: 'Valid_ID.jpg', type: 'Valid ID', date: '2024-06-01' }, { name: 'Lease_Contract.pdf', type: 'Lease Contract', date: '2024-06-01' }] },
  { id: 2, name: 'Jose Reyes', email: 'jose.reyes@email.com', phone: '0918-234-5678', emergencyContact: 'Ana Reyes — 0917-222-3333', unit: '1B', rent: '₱6,500', moveIn: '2024-07-15', leaseEnd: '2025-07-15', status: 'active', balance: '₱0', paymentStatus: 'paid', documents: [{ name: 'Gov_ID.jpg', type: 'Valid ID', date: '2024-07-15' }] },
  { id: 3, name: 'Pedro Cruz', email: 'pedro.cruz@email.com', phone: '0919-345-6789', emergencyContact: 'Rosa Cruz — 0916-333-4444', unit: '2B', rent: '₱6,500', moveIn: '2024-03-01', leaseEnd: '2025-03-01', status: 'active', balance: '₱6,500', paymentStatus: 'overdue', documents: [{ name: 'ID_Front.jpg', type: 'Valid ID', date: '2024-03-01' }, { name: 'Contract_Signed.pdf', type: 'Lease Contract', date: '2024-03-01' }, { name: 'Barangay_Clearance.pdf', type: 'Barangay Clearance', date: '2024-03-05' }] },
  { id: 4, name: 'Rosa Dela Cruz', email: 'rosa.dc@email.com', phone: '0920-456-7890', emergencyContact: 'Marco Dela Cruz — 0915-444-5555', unit: '2C', rent: '₱7,500', moveIn: '2024-08-01', leaseEnd: '2025-08-01', status: 'active', balance: '₱7,500', paymentStatus: 'pending', documents: [{ name: 'PhilID.jpg', type: 'Valid ID', date: '2024-08-01' }] },
  { id: 5, name: 'Ben Flores', email: 'ben.flores@email.com', phone: '0921-567-8901', emergencyContact: 'Lisa Flores — 0914-555-6666', unit: '3A', rent: '₱6,500', moveIn: '2024-04-15', leaseEnd: '2025-04-15', status: 'active', balance: '₱6,500', paymentStatus: 'overdue', documents: [] },
  { id: 6, name: 'Lita Ramos', email: 'lita.ramos@email.com', phone: '0922-678-9012', emergencyContact: 'Edgar Ramos — 0913-666-7777', unit: '3B', rent: '₱6,500', moveIn: '2024-01-01', leaseEnd: '2025-01-01', status: 'pending-move-out', balance: '₱0', paymentStatus: 'paid', documents: [{ name: 'NBI_Clearance.pdf', type: 'NBI Clearance', date: '2024-01-01' }] },
  { id: 7, name: 'Dante Abad', email: 'dante.abad@email.com', phone: '0923-789-0123', emergencyContact: 'Nora Abad — 0912-777-8888', unit: '3C', rent: '₱7,500', moveIn: '2024-05-01', leaseEnd: '2025-05-01', status: 'active', balance: '₱0', paymentStatus: 'paid', documents: [] },
  { id: 8, name: 'Gloria Tan', email: 'gloria.tan@email.com', phone: '0924-890-1234', emergencyContact: 'Roberto Tan — 0911-888-9999', unit: '4A', rent: '₱6,500', moveIn: '2024-09-01', leaseEnd: '2025-09-01', status: 'active', balance: '₱500', paymentStatus: 'overdue', documents: [{ name: 'Passport_Copy.jpg', type: 'Valid ID', date: '2024-09-01' }, { name: 'Contract.pdf', type: 'Lease Contract', date: '2024-09-01' }] },
  { id: 9, name: 'Ramon Lim', email: 'ramon.lim@email.com', phone: '0925-901-2345', emergencyContact: 'Carmen Lim — 0910-999-0000', unit: '4B', rent: '₱6,500', moveIn: '2024-02-01', leaseEnd: '2025-02-01', status: 'active', balance: '₱0', paymentStatus: 'paid', documents: [] },
  { id: 10, name: 'Cora Santos', email: 'cora.santos@email.com', phone: '0926-012-3456', emergencyContact: 'Manny Santos — 0909-000-1111', unit: '4C', rent: '₱7,500', moveIn: '2024-10-01', leaseEnd: '2025-10-01', status: 'active', balance: '₱7,500', paymentStatus: 'pending', documents: [{ name: 'SSS_ID.jpg', type: 'Valid ID', date: '2024-10-01' }] },
  { id: 11, name: 'Carlos Mendoza', email: 'carlos.m@email.com', phone: '0927-111-2222', emergencyContact: 'Elena Mendoza — 0908-111-2222', unit: '—', rent: '₱0', moveIn: '2023-06-01', leaseEnd: '2024-06-01', status: 'moved-out', balance: '₱0', paymentStatus: 'paid', documents: [{ name: 'ID_Carlos.jpg', type: 'Valid ID', date: '2023-06-01' }] }
];

const daysRemaining = (leaseEnd) => {
  return Math.ceil((new Date(leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
};

const AdminTenants = () => {
  const [tenants, setTenants] = useState(initialTenants);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showRegModal, setShowRegModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showMoveOutConfirm, setShowMoveOutConfirm] = useState(false);
  const [moveOutTarget, setMoveOutTarget] = useState(null);

  const emptyForm = { name: '', email: '', phone: '', emergencyContact: '', unit: '', rent: '', moveIn: '', leaseEnd: '' };
  const [regForm, setRegForm] = useState(emptyForm);

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

  const handleRegister = () => {
    if (!regForm.name || !regForm.unit || !regForm.moveIn || !regForm.leaseEnd) return;
    const newTenant = { ...regForm, id: Date.now(), status: 'active', balance: '₱0', paymentStatus: 'paid', documents: [], rent: regForm.rent || '₱0' };
    setTenants(prev => [newTenant, ...prev]);
    setRegForm(emptyForm);
    setShowRegModal(false);
  };

  const handleConfirmMoveOut = () => {
    if (!moveOutTarget) return;
    setTenants(prev => prev.map(t => t.id === moveOutTarget.id ? { ...t, status: 'moved-out', unit: '—' } : t));
    setShowMoveOutConfirm(false);
    setMoveOutTarget(null);
    if (selectedTenant?.id === moveOutTarget.id) setSelectedTenant(prev => ({ ...prev, status: 'moved-out', unit: '—' }));
  };

  const handleSetPendingMoveOut = (tenant) => {
    setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, status: 'pending-move-out' } : t));
    if (selectedTenant?.id === tenant.id) setSelectedTenant(prev => ({ ...prev, status: 'pending-move-out' }));
  };

  const handleAddDocument = (tenantId, fileName) => {
    const newDoc = { name: fileName, type: 'Uploaded Document', date: new Date().toISOString().slice(0, 10) };
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, documents: [...t.documents, newDoc] } : t));
    if (selectedTenant?.id === tenantId) setSelectedTenant(prev => ({ ...prev, documents: [...prev.documents, newDoc] }));
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Tenant Management" />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* ─── Top Bar ─── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-all">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                <input
                  type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search by name, unit, email..."
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none border-0 p-0"
                />
              </div>
              <button
                onClick={() => setShowRegModal(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm border-0 cursor-pointer"
              >
                <FontAwesomeIcon icon={faPlus} /> Register Tenant
              </button>
            </div>

            {/* ─── Filter Pills ─── */}
            <div className="flex items-center gap-3 flex-wrap">
              {filters.map(f => (
                <button
                  key={f.key} onClick={() => setActiveFilter(f.key)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    activeFilter === f.key ? (f.activeStyle || 'bg-indigo-600 text-white border-indigo-600') : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* ─── Table ─── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Move-in</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Lease End</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Payment</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map(t => {
                      const remaining = daysRemaining(t.leaseEnd);
                      return (
                        <tr key={t.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{t.name}</div>
                            <div className="text-[11px] text-slate-400">{t.email}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{t.unit}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{t.phone}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{t.moveIn}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-600">{t.leaseEnd}</div>
                            {t.status === 'active' && (
                              <div className={`text-[10px] font-medium mt-0.5 ${remaining <= 30 ? 'text-red-500' : remaining <= 90 ? 'text-amber-500' : 'text-slate-400'}`}>
                                {remaining > 0 ? `${remaining} days left` : 'Expired'}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">{getPaymentBadge(t.paymentStatus)}</td>
                          <td className="px-4 py-3">{getOccupancyBadge(t.status)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setSelectedTenant(t); setShowProfileModal(true); }} className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold hover:underline border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faEye} /> Profile</button>
                              {t.status === 'active' && <button onClick={() => handleSetPendingMoveOut(t)} className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold hover:underline border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faClock} /> Move-Out</button>}
                              {t.status === 'pending-move-out' && <button onClick={() => { setMoveOutTarget(t); setShowMoveOutConfirm(true); }} className="flex items-center gap-1 text-[11px] text-red-600 font-semibold hover:underline border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faLogOut} /> Confirm</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ─── Tenant Registration Modal ─── */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowRegModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><FontAwesomeIcon icon={faUser} /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 m-0">Register New Tenant</h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">Fill in tenant information</p>
                </div>
              </div>
              <button onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 space-y-4 bg-white">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Full Name *</label>
                <input value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white" placeholder="Juan Dela Cruz" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Email</label>
                  <input value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white" placeholder="tenant@email.com" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Phone</label>
                  <input value={regForm.phone} onChange={e => setRegForm({ ...regForm, phone: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white" placeholder="0917-000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Assigned Unit *</label>
                  <input value={regForm.unit} onChange={e => setRegForm({ ...regForm, unit: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white" placeholder="e.g. 2A" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Monthly Rent</label>
                  <input value={regForm.rent} onChange={e => setRegForm({ ...regForm, rent: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white" placeholder="₱6,500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Move-in Date *</label>
                  <input type="date" value={regForm.moveIn} onChange={e => setRegForm({ ...regForm, moveIn: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Lease End Date *</label>
                  <input type="date" value={regForm.leaseEnd} onChange={e => setRegForm({ ...regForm, leaseEnd: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowRegModal(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
              <button onClick={handleRegister} disabled={!regForm.name || !regForm.unit || !regForm.moveIn || !regForm.leaseEnd} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer disabled:opacity-40">Register Tenant</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Profile Details tabbed modal area ─── */}
      {showProfileModal && selectedTenant && (
        <TenantProfileModal
          tenant={selectedTenant} onClose={() => { setShowProfileModal(false); setSelectedTenant(null); }}
          onAddDocument={handleAddDocument} onSetPendingMoveOut={handleSetPendingMoveOut} onConfirmMoveOut={(t) => { setMoveOutTarget(t); setShowMoveOutConfirm(true); }}
        />
      )}

      {/* ─── Move Out Confirmation Modal ─── */}
      {showMoveOutConfirm && moveOutTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowMoveOutConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm"><FontAwesomeIcon icon={faExclamationTriangle} /></div>
              <div><h3 className="text-base font-bold text-slate-800 m-0">Confirm Move-Out</h3><p className="text-xs text-slate-400 m-0 mt-0.5">This action cannot be undone</p></div>
            </div>
            <p className="text-sm text-slate-600 mb-6">Are you sure you want to process move-out for <strong>{moveOutTarget.name}</strong> (Unit {moveOutTarget.unit})? This will mark their unit as vacant.</p>
            <div className="flex justify-end gap-3"><button onClick={() => setShowMoveOutConfirm(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button><button onClick={handleConfirmMoveOut} className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 shadow-sm border-0 cursor-pointer">Process Move-Out</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Profile Sub-Modal ─── */
const TenantProfileModal = ({ tenant, onClose, onAddDocument, onSetPendingMoveOut, onConfirmMoveOut }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const tabs = [
    { key: 'profile', label: 'Profile', icon: faUser },
    { key: 'documents', label: 'Documents', icon: faFileText },
    { key: 'occupancy', label: 'Occupancy', icon: faBuilding },
  ];

  const remaining = daysRemaining(tenant.leaseEnd);
  const totalDays = Math.ceil((new Date(tenant.leaseEnd) - new Date(tenant.moveIn)) / (1000 * 60 * 60 * 24));
  const elapsed = totalDays - remaining;
  const progressPct = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shadow-md">{tenant.name.split(' ').map(n => n[0]).join('')}</div>
            <div><h3 className="text-lg font-bold text-slate-800 m-0">{tenant.name}</h3><p className="text-xs text-slate-400 m-0 mt-0.5">Unit {tenant.unit} · {tenant.status.toUpperCase()}</p></div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
        </div>

        <div className="flex border-b border-slate-200 px-6 shrink-0 bg-white">
          {tabs.map(tab => (
            <button
              key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px border-x-0 border-t-0 bg-transparent cursor-pointer ${activeTab === tab.key ? 'text-indigo-600 border-b-indigo-600 font-bold' : 'text-slate-400 border-b-transparent'}`}
            >
              <FontAwesomeIcon icon={tab.icon} className="text-xs" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <InfoField icon={faEnvelope} label="Email" value={tenant.email} />
                <InfoField icon={faPhone} label="Phone" value={tenant.phone} />
                <InfoField icon={faBuilding} label="Assigned Unit" value={tenant.unit} />
                <InfoField icon={faCalendarAlt} label="Monthly Rent" value={tenant.rent} />
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex items-center gap-2 mb-2"><FontAwesomeIcon icon={faShieldAlt} className="text-slate-400 text-xs" /><span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Emergency Contact</span></div>
                <p className="text-sm text-slate-700 m-0">{tenant.emergencyContact || 'Not provided'}</p>
              </div>
              {tenant.status === 'active' && <button onClick={() => onSetPendingMoveOut(tenant)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm font-semibold hover:bg-amber-100 border-dashed cursor-pointer"><FontAwesomeIcon icon={faClock} /> Set Pending Move-Out</button>}
              {tenant.status === 'pending-move-out' && <button onClick={() => onConfirmMoveOut(tenant)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100 border-dashed cursor-pointer"><FontAwesomeIcon icon={faLogOut} /> Process Move-Out</button>}
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <button onClick={() => { const n = prompt("Enter mock document name:"); if(n) onAddDocument(tenant.id, n); }} className="w-full flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 font-medium hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all bg-transparent cursor-pointer"><FontAwesomeIcon icon={faUpload} /> Upload ID / Document</button>
              <div className="space-y-2">
                {tenant.documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 text-xs"><FontAwesomeIcon icon={faFileText} /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-700 truncate m-0">{doc.name}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">{doc.type} · Uploaded {doc.date}</p></div>
                    <FontAwesomeIcon icon={faChevronRight} className="text-slate-300 text-xs" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'occupancy' && (
            <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-xl p-5 border border-indigo-100">
              <div className="grid grid-cols-3 gap-4 text-center mb-4">
                <div><p className="text-2xl font-bold text-indigo-600 m-0">{tenant.unit}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Unit</p></div>
                <div><p className="text-2xl font-bold text-slate-800 m-0">{elapsed > 0 ? elapsed : 0}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Days Elapsed</p></div>
                <div><p className={`text-2xl font-bold m-0 ${remaining <= 30 ? 'text-red-500' : remaining <= 90 ? 'text-amber-500' : 'text-emerald-600'}`}>{remaining > 0 ? remaining : 0}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Days Left</p></div>
              </div>
              <div className="w-full h-2 bg-white rounded-full overflow-hidden shadow-inner"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progressPct}%` }} /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const InfoField = ({ icon, label, value }) => (
  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
    <div className="flex items-center gap-1.5 mb-1"><FontAwesomeIcon icon={icon} className="text-slate-400 text-[10px]" /><span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span></div>
    <p className="text-sm font-medium text-slate-700 m-0 mt-0.5">{value || '—'}</p>
  </div>
);

export default AdminTenants;