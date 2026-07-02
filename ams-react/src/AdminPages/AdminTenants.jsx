import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import {
  Search, Plus, X, User, FileText, Building, Upload,
  Calendar, Phone, Mail, AlertTriangle, CheckCircle,
  LogOut, Eye, ChevronRight, Clock, Shield
} from 'lucide-react';

/* ───────────────────────────────────────────
   SEED DATA — lives in state, fully mutable
   ─────────────────────────────────────────── */
const initialTenants = [
  {
    id: 1, name: 'Maria Santos', email: 'maria.santos@email.com', phone: '0917-123-4567',
    emergencyContact: 'Juan Santos — 0918-111-2222',
    unit: '1A', rent: '₱6,500', moveIn: '2024-06-01', leaseEnd: '2025-06-01',
    status: 'active', balance: '₱0', paymentStatus: 'paid',
    documents: [
      { name: 'Valid_ID.jpg', type: 'Valid ID', date: '2024-06-01' },
      { name: 'Lease_Contract.pdf', type: 'Lease Contract', date: '2024-06-01' },
    ],
  },
  {
    id: 2, name: 'Jose Reyes', email: 'jose.reyes@email.com', phone: '0918-234-5678',
    emergencyContact: 'Ana Reyes — 0917-222-3333',
    unit: '1B', rent: '₱6,500', moveIn: '2024-07-15', leaseEnd: '2025-07-15',
    status: 'active', balance: '₱0', paymentStatus: 'paid',
    documents: [
      { name: 'Gov_ID.jpg', type: 'Valid ID', date: '2024-07-15' },
    ],
  },
  {
    id: 3, name: 'Pedro Cruz', email: 'pedro.cruz@email.com', phone: '0919-345-6789',
    emergencyContact: 'Rosa Cruz — 0916-333-4444',
    unit: '2B', rent: '₱6,500', moveIn: '2024-03-01', leaseEnd: '2025-03-01',
    status: 'active', balance: '₱6,500', paymentStatus: 'overdue',
    documents: [
      { name: 'ID_Front.jpg', type: 'Valid ID', date: '2024-03-01' },
      { name: 'Contract_Signed.pdf', type: 'Lease Contract', date: '2024-03-01' },
      { name: 'Barangay_Clearance.pdf', type: 'Barangay Clearance', date: '2024-03-05' },
    ],
  },
  {
    id: 4, name: 'Rosa Dela Cruz', email: 'rosa.dc@email.com', phone: '0920-456-7890',
    emergencyContact: 'Marco Dela Cruz — 0915-444-5555',
    unit: '2C', rent: '₱7,500', moveIn: '2024-08-01', leaseEnd: '2025-08-01',
    status: 'active', balance: '₱7,500', paymentStatus: 'pending',
    documents: [
      { name: 'PhilID.jpg', type: 'Valid ID', date: '2024-08-01' },
    ],
  },
  {
    id: 5, name: 'Ben Flores', email: 'ben.flores@email.com', phone: '0921-567-8901',
    emergencyContact: 'Lisa Flores — 0914-555-6666',
    unit: '3A', rent: '₱6,500', moveIn: '2024-04-15', leaseEnd: '2025-04-15',
    status: 'active', balance: '₱6,500', paymentStatus: 'overdue',
    documents: [],
  },
  {
    id: 6, name: 'Lita Ramos', email: 'lita.ramos@email.com', phone: '0922-678-9012',
    emergencyContact: 'Edgar Ramos — 0913-666-7777',
    unit: '3B', rent: '₱6,500', moveIn: '2024-01-01', leaseEnd: '2025-01-01',
    status: 'pending-move-out', balance: '₱0', paymentStatus: 'paid',
    documents: [
      { name: 'NBI_Clearance.pdf', type: 'NBI Clearance', date: '2024-01-01' },
    ],
  },
  {
    id: 7, name: 'Dante Abad', email: 'dante.abad@email.com', phone: '0923-789-0123',
    emergencyContact: 'Nora Abad — 0912-777-8888',
    unit: '3C', rent: '₱7,500', moveIn: '2024-05-01', leaseEnd: '2025-05-01',
    status: 'active', balance: '₱0', paymentStatus: 'paid',
    documents: [],
  },
  {
    id: 8, name: 'Gloria Tan', email: 'gloria.tan@email.com', phone: '0924-890-1234',
    emergencyContact: 'Roberto Tan — 0911-888-9999',
    unit: '4A', rent: '₱6,500', moveIn: '2024-09-01', leaseEnd: '2025-09-01',
    status: 'active', balance: '₱500', paymentStatus: 'overdue',
    documents: [
      { name: 'Passport_Copy.jpg', type: 'Valid ID', date: '2024-09-01' },
      { name: 'Contract.pdf', type: 'Lease Contract', date: '2024-09-01' },
    ],
  },
  {
    id: 9, name: 'Ramon Lim', email: 'ramon.lim@email.com', phone: '0925-901-2345',
    emergencyContact: 'Carmen Lim — 0910-999-0000',
    unit: '4B', rent: '₱6,500', moveIn: '2024-02-01', leaseEnd: '2025-02-01',
    status: 'active', balance: '₱0', paymentStatus: 'paid',
    documents: [],
  },
  {
    id: 10, name: 'Cora Santos', email: 'cora.santos@email.com', phone: '0926-012-3456',
    emergencyContact: 'Manny Santos — 0909-000-1111',
    unit: '4C', rent: '₱7,500', moveIn: '2024-10-01', leaseEnd: '2025-10-01',
    status: 'active', balance: '₱7,500', paymentStatus: 'pending',
    documents: [
      { name: 'SSS_ID.jpg', type: 'Valid ID', date: '2024-10-01' },
    ],
  },
  {
    id: 11, name: 'Carlos Mendoza', email: 'carlos.m@email.com', phone: '0927-111-2222',
    emergencyContact: 'Elena Mendoza — 0908-111-2222',
    unit: '—', rent: '₱0', moveIn: '2023-06-01', leaseEnd: '2024-06-01',
    status: 'moved-out', balance: '₱0', paymentStatus: 'paid',
    documents: [
      { name: 'ID_Carlos.jpg', type: 'Valid ID', date: '2023-06-01' },
    ],
  },
];

/* ───────────────────────────────────────────
   HELPER – days remaining until lease end
   ─────────────────────────────────────────── */
const daysRemaining = (leaseEnd) => {
  const diff = Math.ceil((new Date(leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
};

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */
const AdminTenants = () => {
  const [tenants, setTenants] = useState(initialTenants);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showRegModal, setShowRegModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showMoveOutConfirm, setShowMoveOutConfirm] = useState(false);
  const [moveOutTarget, setMoveOutTarget] = useState(null);

  // Registration form
  const emptyForm = {
    name: '', email: '', phone: '', emergencyContact: '',
    unit: '', rent: '', moveIn: '', leaseEnd: '',
  };
  const [regForm, setRegForm] = useState(emptyForm);

  /* ── Filters & Search ── */
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
    displayed = displayed.filter(t =>
      t.name.toLowerCase().includes(q) || t.unit.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
    );
  }

  /* ── Status badge ── */
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

  /* ── Handlers ── */
  const handleRegister = () => {
    if (!regForm.name || !regForm.unit || !regForm.moveIn || !regForm.leaseEnd) return;
    const newTenant = {
      ...regForm,
      id: Date.now(),
      status: 'active',
      balance: '₱0',
      paymentStatus: 'paid',
      documents: [],
      rent: regForm.rent || '₱0',
    };
    setTenants(prev => [newTenant, ...prev]);
    setRegForm(emptyForm);
    setShowRegModal(false);
  };

  const handleInitiateMoveOut = (tenant) => {
    setMoveOutTarget(tenant);
    setShowMoveOutConfirm(true);
  };

  const handleConfirmMoveOut = () => {
    if (!moveOutTarget) return;
    setTenants(prev =>
      prev.map(t => t.id === moveOutTarget.id ? { ...t, status: 'moved-out', unit: '—' } : t)
    );
    setShowMoveOutConfirm(false);
    setMoveOutTarget(null);
    if (selectedTenant?.id === moveOutTarget.id) {
      setSelectedTenant(prev => ({ ...prev, status: 'moved-out', unit: '—' }));
    }
  };

  const handleSetPendingMoveOut = (tenant) => {
    setTenants(prev =>
      prev.map(t => t.id === tenant.id ? { ...t, status: 'pending-move-out' } : t)
    );
    if (selectedTenant?.id === tenant.id) {
      setSelectedTenant(prev => ({ ...prev, status: 'pending-move-out' }));
    }
  };

  const handleAddDocument = (tenantId, fileName) => {
    const newDoc = { name: fileName, type: 'Uploaded Document', date: new Date().toISOString().slice(0, 10) };
    setTenants(prev =>
      prev.map(t => t.id === tenantId ? { ...t, documents: [...t.documents, newDoc] } : t)
    );
    if (selectedTenant?.id === tenantId) {
      setSelectedTenant(prev => ({ ...prev, documents: [...prev.documents, newDoc] }));
    }
  };

  /* ════════════════════════════════════════
     RENDER
     ════════════════════════════════════════ */
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header title="Tenant Management" />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* ─── Top Bar ─── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <Search size={16} className="text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search by name, unit, email..."
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                />
              </div>
              <button
                onClick={() => setShowRegModal(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus size={16} />
                Register Tenant
              </button>
            </div>

            {/* ─── Filter Pills ─── */}
            <div className="flex items-center gap-3 flex-wrap">
              {filters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    activeFilter === f.key
                      ? (f.activeStyle || 'bg-indigo-600 text-white border-indigo-600')
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
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
                              <button
                                onClick={() => { setSelectedTenant(t); setShowProfileModal(true); }}
                                className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold hover:underline cursor-pointer"
                              >
                                <Eye size={12} /> Profile
                              </button>
                              {t.status === 'active' && (
                                <button
                                  onClick={() => handleSetPendingMoveOut(t)}
                                  className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold hover:underline cursor-pointer"
                                >
                                  <Clock size={12} /> Move-Out
                                </button>
                              )}
                              {t.status === 'pending-move-out' && (
                                <button
                                  onClick={() => handleInitiateMoveOut(t)}
                                  className="flex items-center gap-1 text-[11px] text-red-600 font-semibold hover:underline cursor-pointer"
                                >
                                  <LogOut size={12} /> Confirm
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {displayed.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">No tenants found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ════════════════════════════════════
          MODAL — Tenant Registration
         ════════════════════════════════════ */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowRegModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Register New Tenant</h3>
                  <p className="text-xs text-slate-400">Fill in tenant information</p>
                </div>
              </div>
              <button onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Full Name *</label>
                <input value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Juan Dela Cruz" />
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Email</label>
                  <input value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="tenant@email.com" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Phone</label>
                  <input value={regForm.phone} onChange={e => setRegForm({ ...regForm, phone: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="0917-000-0000" />
                </div>
              </div>

              {/* Emergency Contact */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Emergency Contact</label>
                <input value={regForm.emergencyContact} onChange={e => setRegForm({ ...regForm, emergencyContact: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Name — Phone number" />
              </div>

              {/* Unit + Rent */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Assigned Unit *</label>
                  <input value={regForm.unit} onChange={e => setRegForm({ ...regForm, unit: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="e.g. 2A" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Monthly Rent</label>
                  <input value={regForm.rent} onChange={e => setRegForm({ ...regForm, rent: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="₱6,500" />
                </div>
              </div>

              {/* Move-in + Lease End */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Move-in Date *</label>
                  <input type="date" value={regForm.moveIn} onChange={e => setRegForm({ ...regForm, moveIn: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Lease End Date *</label>
                  <input type="date" value={regForm.leaseEnd} onChange={e => setRegForm({ ...regForm, leaseEnd: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowRegModal(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleRegister}
                disabled={!regForm.name || !regForm.unit || !regForm.moveIn || !regForm.leaseEnd}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Register Tenant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          MODAL — Tenant Profile (tabbed)
         ════════════════════════════════════ */}
      {showProfileModal && selectedTenant && (
        <TenantProfileModal
          tenant={selectedTenant}
          onClose={() => { setShowProfileModal(false); setSelectedTenant(null); }}
          onAddDocument={handleAddDocument}
          onSetPendingMoveOut={handleSetPendingMoveOut}
          onConfirmMoveOut={handleInitiateMoveOut}
        />
      )}

      {/* ════════════════════════════════════
          MODAL — Move-Out Confirmation
         ════════════════════════════════════ */}
      {showMoveOutConfirm && moveOutTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowMoveOutConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Confirm Move-Out</h3>
                <p className="text-xs text-slate-400">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to process move-out for <strong>{moveOutTarget.name}</strong> (Unit {moveOutTarget.unit})? 
              This will mark their unit as vacant.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowMoveOutConfirm(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleConfirmMoveOut} className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors shadow-sm">
                Process Move-Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════
   SUB-COMPONENT — Tenant Profile Modal
   ════════════════════════════════════════════ */
const TenantProfileModal = ({ tenant, onClose, onAddDocument, onSetPendingMoveOut, onConfirmMoveOut }) => {
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'documents', label: 'Documents', icon: FileText },
    { key: 'occupancy', label: 'Occupancy', icon: Building },
  ];

  const remaining = daysRemaining(tenant.leaseEnd);
  const totalDays = Math.ceil((new Date(tenant.leaseEnd) - new Date(tenant.moveIn)) / (1000 * 60 * 60 * 24));
  const elapsed = totalDays - remaining;
  const progressPct = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) onAddDocument(tenant.id, file.name);
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shadow-md">
              {tenant.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">{tenant.name}</h3>
              <p className="text-xs text-slate-400">Unit {tenant.unit} · {tenant.status === 'active' ? 'Active Tenant' : tenant.status === 'pending-move-out' ? 'Pending Move-Out' : 'Moved Out'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                activeTab === tab.key
                  ? 'text-indigo-600 border-indigo-600'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Profile Tab ── */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <InfoField icon={Mail} label="Email" value={tenant.email} />
                <InfoField icon={Phone} label="Phone" value={tenant.phone} />
                <InfoField icon={Building} label="Assigned Unit" value={tenant.unit} />
                <InfoField icon={Calendar} label="Monthly Rent" value={tenant.rent} />
                <InfoField icon={Calendar} label="Move-in Date" value={tenant.moveIn} />
                <InfoField icon={Calendar} label="Lease End" value={tenant.leaseEnd} />
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-slate-400" />
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Emergency Contact</span>
                </div>
                <p className="text-sm text-slate-700">{tenant.emergencyContact || 'Not provided'}</p>
              </div>

              {/* Move-out actions */}
              {tenant.status === 'active' && (
                <button onClick={() => onSetPendingMoveOut(tenant)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm font-semibold hover:bg-amber-100 transition-colors">
                  <Clock size={16} /> Set Pending Move-Out
                </button>
              )}
              {tenant.status === 'pending-move-out' && (
                <button onClick={() => onConfirmMoveOut(tenant)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors">
                  <LogOut size={16} /> Process Move-Out
                </button>
              )}
            </div>
          )}

          {/* ── Documents Tab ── */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <button onClick={handleFileUpload}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 font-medium hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all cursor-pointer">
                <Upload size={18} />
                Upload ID / Document
              </button>
              {tenant.documents.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No documents uploaded yet.</div>
              ) : (
                <div className="space-y-2">
                  {tenant.documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 hover:border-indigo-200 transition-all">
                      <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{doc.name}</p>
                        <p className="text-[11px] text-slate-400">{doc.type} · Uploaded {doc.date}</p>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Occupancy Tab ── */}
          {activeTab === 'occupancy' && (
            <div className="space-y-5">
              {/* Occupancy Summary Card */}
              <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-xl p-5 border border-indigo-100">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-slate-800">Current Occupancy</h4>
                  {tenant.status === 'active' && remaining > 0 ? (
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">Active</span>
                  ) : tenant.status === 'pending-move-out' ? (
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">Pending Move-Out</span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Moved Out</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-indigo-600">{tenant.unit}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Unit</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{elapsed > 0 ? elapsed : 0}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Days Elapsed</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${remaining <= 30 ? 'text-red-500' : remaining <= 90 ? 'text-amber-500' : 'text-emerald-600'}`}>
                      {remaining > 0 ? remaining : 0}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Days Left</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>{tenant.moveIn}</span>
                    <span>{tenant.leaseEnd}</span>
                  </div>
                  <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${remaining <= 30 ? 'bg-red-500' : remaining <= 90 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Move-In/Move-Out Record */}
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-3">Move-In / Move-Out Record</h4>
                <div className="space-y-3">
                  <TimelineItem
                    icon={<CheckCircle size={14} />}
                    color="bg-emerald-100 text-emerald-600"
                    title="Moved In"
                    subtitle={`Unit ${tenant.unit}`}
                    date={tenant.moveIn}
                  />
                  {tenant.status === 'active' && (
                    <TimelineItem
                      icon={<Calendar size={14} />}
                      color="bg-indigo-100 text-indigo-600"
                      title="Lease Ends"
                      subtitle={remaining > 0 ? `${remaining} days remaining` : 'Lease expired'}
                      date={tenant.leaseEnd}
                    />
                  )}
                  {tenant.status === 'pending-move-out' && (
                    <TimelineItem
                      icon={<Clock size={14} />}
                      color="bg-amber-100 text-amber-600"
                      title="Pending Move-Out"
                      subtitle="Move-out has been requested"
                      date="Awaiting processing"
                    />
                  )}
                  {tenant.status === 'moved-out' && (
                    <TimelineItem
                      icon={<LogOut size={14} />}
                      color="bg-slate-100 text-slate-500"
                      title="Moved Out"
                      subtitle="Unit vacated"
                      date="Completed"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Tiny helper components ── */
const InfoField = ({ icon: Icon, label, value }) => (
  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
    <div className="flex items-center gap-1.5 mb-1">
      <Icon size={12} className="text-slate-400" />
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
    <p className="text-sm font-medium text-slate-700">{value || '—'}</p>
  </div>
);

const TimelineItem = ({ icon, color, title, subtitle, date }) => (
  <div className="flex items-start gap-3">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${color}`}>
      {icon}
    </div>
    <div className="flex-1">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="text-[11px] text-slate-400">{subtitle}</p>
    </div>
    <span className="text-[11px] text-slate-400 shrink-0">{date}</span>
  </div>
);

export default AdminTenants;
