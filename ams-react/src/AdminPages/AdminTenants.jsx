import React, { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faTimes, faUser, faBuilding, faCalendarAlt, faPhone, faEnvelope, 
  faExclamationTriangle, faCheckCircle, faEye, faChevronRight, faClock, 
  faShieldAlt, faArchive, faHistory, faDollarSign, faWrench, faFileAlt,
  faSignOutAlt, faBoxOpen, faUserSlash, faChevronDown, faChevronUp
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

// ==========================================
// MOCK DATA FOR ARCHIVED TENANTS & HISTORY
// ==========================================
const initialArchivedTenants = [
  {
    id: 'ARC-001', name: 'Carlos Mendoza', email: 'carlos.mendoza@email.com', phone: '0917-555-1234',
    unit: 'D', rent: '₱6,500', moveIn: '2023-06-01', leaseEnd: '2024-06-01',
    movedOutDate: '2024-06-01', archiveDate: '2024-06-05', archiveReason: 'End of Lease',
    status: 'archived',
    leaseHistory: [
      { event: 'Lease Started', date: '2023-06-01', detail: 'Studio Unit D · ₱6,500/mo · 12 months' },
      { event: 'Lease Ended', date: '2024-06-01', detail: 'End of lease term, tenant did not renew' },
    ],
    paymentSummary: { totalPaid: 78000, monthsPaid: 12, overdueCount: 0, lastPayment: '2024-05-28' },
    maintenanceRequests: [
      { id: 'REQ-010', issue: 'Door lock replacement', date: '2023-09-15', status: 'Completed', cost: 800 }
    ]
  },
  {
    id: 'ARC-002', name: 'Elena Gomez', email: 'elena.gomez@email.com', phone: '0918-333-5678',
    unit: 'M', rent: '₱6,500', moveIn: '2023-01-15', leaseEnd: '2024-01-15',
    movedOutDate: '2024-01-15', archiveDate: '2024-01-20', archiveReason: 'Personal Reasons',
    status: 'archived',
    leaseHistory: [
      { event: 'Lease Started', date: '2023-01-15', detail: 'Studio Unit M · ₱6,500/mo · 12 months' },
      { event: 'Lease Ended', date: '2024-01-15', detail: 'Tenant chose not to renew — personal reasons' },
    ],
    paymentSummary: { totalPaid: 78000, monthsPaid: 12, overdueCount: 1, lastPayment: '2024-01-10' },
    maintenanceRequests: []
  },
  {
    id: 'ARC-003', name: 'Roberto Tan', email: 'roberto.tan@email.com', phone: '0919-777-9012',
    unit: 'H', rent: '₱6,500', moveIn: '2022-08-01', leaseEnd: '2023-08-01',
    movedOutDate: '2023-08-15', archiveDate: '2023-08-20', archiveReason: 'Relocated',
    status: 'archived',
    leaseHistory: [
      { event: 'Lease Started', date: '2022-08-01', detail: 'Studio Unit H · ₱6,500/mo · 12 months' },
      { event: 'Lease Extended', date: '2023-02-01', detail: 'Extended by 6 months, new end: 2023-08-01' },
      { event: 'Lease Ended', date: '2023-08-01', detail: 'Tenant relocated out of city' },
    ],
    paymentSummary: { totalPaid: 78000, monthsPaid: 12, overdueCount: 2, lastPayment: '2023-07-28' },
    maintenanceRequests: [
      { id: 'REQ-007', issue: 'Leaking ceiling', date: '2023-03-10', status: 'Completed', cost: 2500 },
      { id: 'REQ-009', issue: 'Broken window latch', date: '2023-05-22', status: 'Completed', cost: 600 }
    ]
  }
];

const archiveReasons = ['End of Lease', 'Personal Reasons', 'Relocated', 'Financial Hardship', 'Evicted', 'Other'];

const daysRemaining = (leaseEnd) => {
  const diff = Math.ceil((new Date(leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
};

const AdminTenants = () => {
  const [tenants, setTenants] = useState([]);
  const [archivedTenants, setArchivedTenants] = useState(initialArchivedTenants);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Archive workflow states
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState('End of Lease');
  const [archiveNotes, setArchiveNotes] = useState('');

  // Profile modal tab state
  const [profileTab, setProfileTab] = useState('overview');

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const res = await api.get('/get_tenants.php');
      if (res.data.success) {
        const actualTenants = res.data.data.filter(t => t.status !== 'Pending Review' && t.status !== 'Rejected');
        setTenants(actualTenants);
      }
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

  const handleArchiveTenant = async () => {
    if (!archiveTarget) return;
    try {
      const payload = {
        id: archiveTarget.id,
        archiveReason,
        archiveNotes,
      };
      await api.post('/archive_tenant.php', payload);
      fetchTenants();
      setShowArchiveModal(false);
      setArchiveTarget(null);
      setArchiveReason('End of Lease');
      setArchiveNotes('');
    } catch (err) {
      console.error("Error archiving tenant:", err);
    }
  };

  const openArchiveModal = (tenant) => {
    setArchiveTarget(tenant);
    setArchiveReason('End of Lease');
    setArchiveNotes('');
    setShowArchiveModal(true);
  };

  // Count logic
  const pendingReviewCount = tenants.filter(t => t.status === 'Pending Review').length;
  const activeTenantCount = tenants.filter(t => t.status === 'active').length;
  const pendingMoveOutCount = tenants.filter(t => t.status === 'pending-move-out').length;
  const movedOutCount = tenants.filter(t => t.status === 'moved-out').length;

  const counts = {
    all: tenants.length + archivedTenants.length,
    active: activeTenantCount,
    'pending-move-out': pendingMoveOutCount,
    'moved-out': movedOutCount,
    archived: archivedTenants.length,
  };

  const filters = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'active', label: `Active (${counts.active})`, activeStyle: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    { key: 'pending-move-out', label: `Pending Move-Out (${counts['pending-move-out']})`, activeStyle: 'bg-amber-100 text-amber-800 border-amber-300' },
    { key: 'moved-out', label: `Moved Out (${counts['moved-out']})`, activeStyle: 'bg-slate-200 text-slate-600 border-slate-300' },
    { key: 'archived', label: `Archived (${counts.archived})`, activeStyle: 'bg-violet-100 text-violet-800 border-violet-300' },
  ];

  // Determine displayed list
  let displayed = [];
  if (activeFilter === 'archived') {
    displayed = archivedTenants;
  } else if (activeFilter === 'all') {
    displayed = [...tenants, ...archivedTenants];
  } else {
    displayed = tenants.filter(t => t.status === activeFilter);
  }
  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    displayed = displayed.filter(t => 
      (t.name || '').toLowerCase().includes(q) || 
      (t.unit || '').toLowerCase().includes(q) || 
      (t.email || '').toLowerCase().includes(q)
    );
  }

  const getOccupancyBadge = (status) => {
    const map = {
      'Pending Review': { style: 'bg-blue-100 text-blue-800', label: '○ Pending' },
      active: { style: 'bg-emerald-100 text-emerald-800', label: '● Active' },
      'pending-move-out': { style: 'bg-amber-100 text-amber-800', label: '◔ Pending Move-Out' },
      'moved-out': { style: 'bg-slate-100 text-slate-500', label: '○ Moved Out' },
      archived: { style: 'bg-violet-100 text-violet-700', label: '◇ Archived' },
    };
    const { style, label } = map[status] || map.active;
    return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${style}`}>{label}</span>;
  };

  const openProfile = (tenant) => {
    setSelectedTenant(tenant);
    setProfileTab('overview');
    setShowProfileModal(true);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Tenant Management" />
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Search Bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search tenants, units, emails..." className="flex-1 bg-transparent text-sm text-slate-700 outline-none p-0 border-0 placeholder-slate-400" />
              </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Records</p>
                <p className="text-2xl font-bold text-slate-800 mt-1 m-0">{counts.all}</p>
              </div>
              <div className="bg-white border-l-4 border-l-emerald-500 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Active</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1 m-0">{counts.active}</p>
              </div>
              <div className="bg-white border-l-4 border-l-amber-400 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Pending Move-Out</p>
                <p className="text-2xl font-bold text-amber-500 mt-1 m-0">{counts['pending-move-out']}</p>
              </div>
              <div className="bg-white border-l-4 border-l-slate-400 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Moved Out</p>
                <p className="text-2xl font-bold text-slate-500 mt-1 m-0">{counts['moved-out']}</p>
              </div>
              <div className="bg-white border-l-4 border-l-violet-500 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Archived</p>
                <p className="text-2xl font-bold text-violet-600 mt-1 m-0">{counts.archived}</p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-3 flex-wrap">
              {filters.map(f => (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`px-4 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-all ${activeFilter === f.key ? (f.activeStyle || 'bg-indigo-600 text-white border-indigo-600') : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Tenant Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase text-left">Tenant</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase text-left">Unit</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase text-left">Status</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase text-left">Details</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 && (
                    <tr><td colSpan="5" className="text-center py-12 text-slate-400 text-sm">No tenants found matching your criteria.</td></tr>
                  )}
                  {displayed.map((t, idx) => (
                    <tr key={t.id || idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                            t.status === 'archived' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {(t.name || '').charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">{t.name}</div>
                            <div className="text-[11px] text-slate-400">{t.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-indigo-600">Unit {t.unit}</span>
                      </td>
                      <td className="px-4 py-3">{getOccupancyBadge(t.status)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {t.status === 'archived' ? (
                          <div>
                            <div>Archived: {t.archiveDate}</div>
                            <div className="text-[10px] text-violet-500 font-semibold">{t.archiveReason}</div>
                          </div>
                        ) : t.status === 'Pending Review' ? (
                          <span className="text-slate-400">Move-in date pending</span>
                        ) : t.leaseEnd ? (
                          <div>
                            <div>Lease ends: {t.leaseEnd}</div>
                            {daysRemaining(t.leaseEnd) > 0 && (
                              <div className={`text-[10px] font-semibold ${daysRemaining(t.leaseEnd) <= 30 ? 'text-red-500' : 'text-slate-400'}`}>
                                {daysRemaining(t.leaseEnd)} days remaining
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => openProfile(t)} 
                            className="flex items-center gap-1.5 text-indigo-600 font-semibold border-0 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                          >
                            <FontAwesomeIcon icon={faEye} className="text-[10px]" /> View
                          </button>
                          {t.status === 'moved-out' && (
                            <button 
                              onClick={() => openArchiveModal(t)}
                              className="flex items-center gap-1.5 text-violet-600 font-semibold border-0 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                            >
                              <FontAwesomeIcon icon={faArchive} className="text-[10px]" /> Archive
                            </button>
                          )}
                          {t.status === 'active' && (
                            <button 
                              onClick={() => { updateStatus(t.id, 'pending-move-out'); }}
                              className="flex items-center gap-1.5 text-amber-600 font-semibold border-0 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                            >
                              <FontAwesomeIcon icon={faSignOutAlt} className="text-[10px]" /> Move Out
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ─── TENANT PROFILE MODAL ─── */}
      {showProfileModal && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowProfileModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md ${
                  selectedTenant.status === 'archived' 
                    ? 'bg-gradient-to-br from-violet-500 to-violet-700' 
                    : selectedTenant.status === 'active' 
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' 
                      : 'bg-gradient-to-br from-amber-400 to-amber-600'
                }`}>
                  {(selectedTenant.name || '').charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 m-0">{selectedTenant.name}</h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">
                    Unit {selectedTenant.unit} · {getOccupancyBadge(selectedTenant.status)}
                    {selectedTenant.status === 'archived' && (
                      <span className="ml-2 text-[10px] text-violet-500 font-semibold">Read-Only</span>
                    )}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} className="text-base" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 px-6 shrink-0 bg-white">
              {[
                { key: 'overview', label: 'Overview', icon: faUser },
                { key: 'lease', label: 'Lease Timeline', icon: faCalendarAlt },
                { key: 'payments', label: 'Payment History', icon: faDollarSign },
                { key: 'maintenance', label: 'Maintenance', icon: faWrench },
              ].map(tab => (
                <button
                  key={tab.key} onClick={() => setProfileTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px border-t-0 border-x-0 bg-transparent cursor-pointer ${
                    profileTab === tab.key ? 'text-indigo-600 border-b-indigo-600 font-bold' : 'text-slate-400 border-b-transparent hover:text-slate-600'
                  }`}
                >
                  <FontAwesomeIcon icon={tab.icon} className="text-xs" /> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              
              {/* Overview Tab */}
              {profileTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Full Name</p>
                      <p className="text-sm font-medium text-slate-700 m-0">{selectedTenant.name}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Unit</p>
                      <p className="text-sm font-medium text-indigo-600 m-0">{selectedTenant.unit}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Email</p>
                      <p className="text-sm font-medium text-slate-700 m-0">{selectedTenant.email || '—'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Phone</p>
                      <p className="text-sm font-medium text-slate-700 m-0">{selectedTenant.phone || '—'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Monthly Rent</p>
                      <p className="text-sm font-bold text-emerald-600 m-0">{selectedTenant.rent || '—'}</p>
                    </div>
                    {selectedTenant.status !== 'Pending Review' && (
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Move-in Date</p>
                      <p className="text-sm font-medium text-slate-700 m-0">{selectedTenant.moveIn || '—'}</p>
                    </div>
                    )}
                  </div>

                  {/* Verification Documents */}
                  {selectedTenant.valid_id_front_path && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                       <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 m-0">Verification Documents</p>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         <a href={`http://localhost:8080/ApartmentManagementSystem_React/backend/uploads/applications/${selectedTenant.valid_id_front_path.split('/').pop()}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 text-sm hover:underline p-2 bg-indigo-50 rounded-lg"><FontAwesomeIcon icon={faFileAlt} /> Valid ID (Front)</a>
                         <a href={`http://localhost:8080/ApartmentManagementSystem_React/backend/uploads/applications/${selectedTenant.valid_id_back_path.split('/').pop()}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 text-sm hover:underline p-2 bg-indigo-50 rounded-lg"><FontAwesomeIcon icon={faFileAlt} /> Valid ID (Back)</a>
                         <a href={`http://localhost:8080/ApartmentManagementSystem_React/backend/uploads/applications/${selectedTenant.nbi_clearance_path.split('/').pop()}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 text-sm hover:underline p-2 bg-indigo-50 rounded-lg"><FontAwesomeIcon icon={faFileAlt} /> NBI Clearance</a>
                       </div>
                    </div>
                  )}

                  {/* Archived Tenant Info */}
                  {selectedTenant.status === 'archived' && (
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faArchive} className="text-violet-600" />
                        <span className="text-sm font-bold text-violet-800">Archived Tenant Record</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><span className="text-violet-500">Archive Date:</span> <span className="font-semibold text-slate-700">{selectedTenant.archiveDate}</span></div>
                        <div><span className="text-violet-500">Moved Out:</span> <span className="font-semibold text-slate-700">{selectedTenant.movedOutDate}</span></div>
                        <div><span className="text-violet-500">Reason:</span> <span className="font-semibold text-slate-700">{selectedTenant.archiveReason}</span></div>
                        {selectedTenant.archiveNotes && (
                          <div className="col-span-2"><span className="text-violet-500">Notes:</span> <span className="font-semibold text-slate-700">{selectedTenant.archiveNotes}</span></div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions for non-archived tenants */}
                  {selectedTenant.status === 'Pending Review' && (
                    <div className="flex gap-3 mt-4">
                      <button 
                        onClick={() => { updateStatus(selectedTenant.id, 'active'); setShowProfileModal(false); }} 
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white p-2.5 rounded-lg border-0 cursor-pointer text-sm font-semibold hover:bg-emerald-600 transition-colors"
                      >
                        <FontAwesomeIcon icon={faCheckCircle} /> Approve Application
                      </button>
                      <button 
                        onClick={() => { updateStatus(selectedTenant.id, 'rejected'); setShowProfileModal(false); }} 
                        className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white p-2.5 rounded-lg border-0 cursor-pointer text-sm font-semibold hover:bg-red-600 transition-colors"
                      >
                        <FontAwesomeIcon icon={faTimes} /> Reject
                      </button>
                    </div>
                  )}
                  {selectedTenant.status !== 'archived' && selectedTenant.status === 'active' && (
                    <button 
                      onClick={() => { updateStatus(selectedTenant.id, 'pending-move-out'); setShowProfileModal(false); }} 
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-amber-500 text-white p-2.5 rounded-lg border-0 cursor-pointer text-sm font-semibold hover:bg-amber-600 transition-colors"
                    >
                      <FontAwesomeIcon icon={faSignOutAlt} /> Initiate Move Out
                    </button>
                  )}
                  {selectedTenant.status === 'moved-out' && (
                    <button
                      onClick={() => { setShowProfileModal(false); openArchiveModal(selectedTenant); }}
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-violet-600 text-white p-2.5 rounded-lg border-0 cursor-pointer text-sm font-semibold hover:bg-violet-700 transition-colors"
                    >
                      <FontAwesomeIcon icon={faArchive} /> Archive This Tenant
                    </button>
                  )}
                </div>
              )}

              {/* Lease Timeline Tab */}
              {profileTab === 'lease' && (
                <div className="space-y-4">
                  {selectedTenant.leaseHistory && selectedTenant.leaseHistory.length > 0 ? (
                    <div className="relative pl-6">
                      {/* Timeline line */}
                      <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-indigo-200"></div>
                      {selectedTenant.leaseHistory.map((entry, idx) => (
                        <div key={idx} className="relative mb-4 last:mb-0">
                          <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                            entry.event.includes('End') || entry.event.includes('Moved') ? 'bg-red-500' : 
                            entry.event.includes('Extended') ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}></div>
                          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 ml-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-800">{entry.event}</span>
                              <span className="text-[10px] text-slate-400 font-semibold">{entry.date}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 m-0">{entry.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-300 text-3xl mb-3 block mx-auto" />
                      <p className="text-sm text-slate-400 m-0">No lease timeline data available for this tenant.</p>
                      {selectedTenant.moveIn && (
                        <div className="mt-4 bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs text-slate-500 inline-block">
                          Lease started: {selectedTenant.moveIn} {selectedTenant.leaseEnd ? `→ Ends: ${selectedTenant.leaseEnd}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Payment History Tab */}
              {profileTab === 'payments' && (
                <div className="space-y-4">
                  {selectedTenant.paymentSummary ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                          <p className="text-lg font-bold text-emerald-700 m-0">₱{(selectedTenant.paymentSummary.totalPaid || 0).toLocaleString()}</p>
                          <p className="text-[10px] text-emerald-600 font-semibold m-0 mt-0.5">Total Paid</p>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center">
                          <p className="text-lg font-bold text-indigo-700 m-0">{selectedTenant.paymentSummary.monthsPaid || 0}</p>
                          <p className="text-[10px] text-indigo-600 font-semibold m-0 mt-0.5">Months Paid</p>
                        </div>
                        <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                          <p className="text-lg font-bold text-red-700 m-0">{selectedTenant.paymentSummary.overdueCount || 0}</p>
                          <p className="text-[10px] text-red-600 font-semibold m-0 mt-0.5">Overdue Instances</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                          <p className="text-sm font-bold text-slate-700 m-0">{selectedTenant.paymentSummary.lastPayment || '—'}</p>
                          <p className="text-[10px] text-slate-500 font-semibold m-0 mt-0.5">Last Payment</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <FontAwesomeIcon icon={faDollarSign} className="text-slate-300 text-3xl mb-3 block mx-auto" />
                      <p className="text-sm text-slate-400 m-0">No payment history available for this tenant.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Maintenance Tab */}
              {profileTab === 'maintenance' && (
                <div className="space-y-3">
                  {selectedTenant.maintenanceRequests && selectedTenant.maintenanceRequests.length > 0 ? (
                    selectedTenant.maintenanceRequests.map((req, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                          req.status === 'Completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          <FontAwesomeIcon icon={faWrench} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800 m-0">{req.issue}</p>
                          <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                            Status: {req.status} {req.cost ? `· Cost: ₱${req.cost.toLocaleString()}` : ''}
                          </p>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">{req.date}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <FontAwesomeIcon icon={faWrench} className="text-slate-300 text-3xl mb-3 block mx-auto" />
                      <p className="text-sm text-slate-400 m-0">No maintenance requests recorded for this tenant.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ARCHIVE CONFIRMATION MODAL ─── */}
      {showArchiveModal && archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowArchiveModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                  <FontAwesomeIcon icon={faArchive} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 m-0">Archive Tenant</h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">Preserve tenant history and remove from active list</p>
                </div>
              </div>
              <button onClick={() => setShowArchiveModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} className="text-base" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Tenant Info Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    {(archiveTarget.name || '').charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 m-0">{archiveTarget.name}</p>
                    <p className="text-[11px] text-slate-400 m-0">Unit {archiveTarget.unit} · {archiveTarget.rent}</p>
                  </div>
                </div>
              </div>

              {/* Archive Reason */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Archive Reason *</label>
                <select
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-500 bg-white text-slate-800"
                >
                  {archiveReasons.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Additional Notes</label>
                <textarea
                  value={archiveNotes}
                  onChange={(e) => setArchiveNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional notes about this archival..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-500 bg-white text-slate-700 resize-y"
                />
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 mt-0.5 text-xs" />
                <p className="text-[11px] text-amber-700 m-0">
                  This will archive the tenant's record. Their lease history, payment records, and maintenance requests will be preserved for reference. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowArchiveModal(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
              <button onClick={handleArchiveTenant} className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 shadow-sm border-0 cursor-pointer">
                <FontAwesomeIcon icon={faArchive} className="mr-1.5" /> Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTenants;