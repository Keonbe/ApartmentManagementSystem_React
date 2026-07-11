import React, { useState, useMemo } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faSearch, faTimes, faFileContract, faEye, faDownload, faCalendarAlt,
  faUser, faBuilding, faCheckCircle, faClock, faExclamationTriangle, faFileSignature,
  faArrowRight, faArrowLeft, faPrint, faEdit, faTrashAlt, faUpload, faShieldAlt,
  faGavel, faFileUpload, faFile, faTimesCircle, faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings } from '../config/systemSettings';

const initialContracts = [
  { id: 'CTR-001', tenant: 'Maria Santos', unit: 'A', type: 'Studio', rent: 6500, deposit: 13000, leaseStart: '2024-06-01', leaseEnd: '2025-06-01', status: 'active', generatedDate: '2024-05-28', signedLease: { uploaded: true, fileName: 'lease_maria_santos.pdf', uploadDate: '2024-05-30' }, notarizedLease: { uploaded: true, fileName: 'notarized_maria_santos.pdf', uploadDate: '2024-06-01' }, evictionStatus: null, overdueInfo: null },
  { id: 'CTR-002', tenant: 'Jose Reyes', unit: 'B', type: 'Studio', rent: 6500, deposit: 13000, leaseStart: '2024-07-15', leaseEnd: '2025-07-15', status: 'active', generatedDate: '2024-07-10', signedLease: { uploaded: true, fileName: 'lease_jose_reyes.pdf', uploadDate: '2024-07-12' }, notarizedLease: { uploaded: false, fileName: null, uploadDate: null }, evictionStatus: null, overdueInfo: null },
  { id: 'CTR-003', tenant: 'Ana Garcia', unit: 'C', type: '1BR', rent: 7500, deposit: 15000, leaseStart: '2024-05-01', leaseEnd: '2025-05-01', status: 'active', generatedDate: '2024-04-25', signedLease: { uploaded: true, fileName: 'lease_ana_garcia.pdf', uploadDate: '2024-04-28' }, notarizedLease: { uploaded: true, fileName: 'notarized_ana_garcia.pdf', uploadDate: '2024-05-01' }, evictionStatus: null, overdueInfo: null },
  { id: 'CTR-004', tenant: 'Pedro Cruz', unit: 'E', type: 'Studio', rent: 6500, deposit: 13000, leaseStart: '2024-03-01', leaseEnd: '2025-03-01', status: 'active', generatedDate: '2024-02-25', signedLease: { uploaded: true, fileName: 'lease_pedro_cruz.pdf', uploadDate: '2024-02-27' }, notarizedLease: { uploaded: false, fileName: null, uploadDate: null }, evictionStatus: 'warning', overdueInfo: { daysOverdue: 20, lastPaymentDate: '2025-04-03', outstandingAmount: 7670 } },
  { id: 'CTR-005', tenant: 'Carlos Mendoza', unit: 'D', type: 'Studio', rent: 6500, deposit: 13000, leaseStart: '2023-06-01', leaseEnd: '2024-06-01', status: 'expired', generatedDate: '2023-05-28', signedLease: { uploaded: true, fileName: 'lease_carlos_mendoza.pdf', uploadDate: '2023-05-30' }, notarizedLease: { uploaded: true, fileName: 'notarized_carlos_mendoza.pdf', uploadDate: '2023-06-01' }, evictionStatus: null, overdueInfo: null },
];

const tenantOptions = [
  { name: 'Maria Santos', unit: 'A', type: 'Studio', rent: 6500 },
  { name: 'Jose Reyes', unit: 'B', type: 'Studio', rent: 6500 },
  { name: 'Pedro Cruz', unit: 'E', type: 'Studio', rent: 6500 },
  { name: 'Rosa Dela Cruz', unit: 'F', type: '1BR', rent: 7500 },
  { name: 'Ben Flores', unit: 'G', type: 'Studio', rent: 6500 },
];

const statusConfig = {
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-700 border-red-200' },
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  'eviction-pending': { label: 'Eviction Pending', color: 'bg-red-200 text-red-900 border-red-300' },
};

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const AdminContracts = () => {
  const [contracts, setContracts] = useState(initialContracts);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  const [createStep, setCreateStep] = useState(1);

  const [form, setForm] = useState({ tenant: '', unit: '', type: '', rent: '', deposit: '', leaseStart: '', leaseEnd: '' });

  const settings = getSystemSettings();
  const overdueThresholdDays = settings.overdueThresholdDays || 15;

  // Count overdue contracts exceeding threshold
  const evictionAlertContracts = useMemo(() => {
    return contracts.filter(c => c.overdueInfo && c.overdueInfo.daysOverdue >= overdueThresholdDays && c.status !== 'eviction-pending');
  }, [contracts, overdueThresholdDays]);

  const filtered = useMemo(() => {
    return contracts.filter(c => {
      const matchSearch = c.tenant.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.unit.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = filterStatus === 'all' || c.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [contracts, searchQuery, filterStatus]);

  const handleTenantSelect = (e) => {
    const selected = tenantOptions.find(t => t.name === e.target.value);
    if (selected) {
      setForm(prev => ({ ...prev, tenant: selected.name, unit: selected.unit, type: selected.type, rent: selected.rent, deposit: selected.rent * 2 }));
    } else {
      setForm(prev => ({ ...prev, tenant: e.target.value }));
    }
  };

  const handleGenerate = () => {
    const newContract = {
      id: `CTR-${String(contracts.length + 1).padStart(3, '0')}`,
      tenant: form.tenant, unit: form.unit, type: form.type,
      rent: Number(form.rent), deposit: Number(form.deposit),
      leaseStart: form.leaseStart, leaseEnd: form.leaseEnd,
      status: 'active', generatedDate: new Date().toISOString().slice(0, 10),
      signedLease: { uploaded: false, fileName: null, uploadDate: null },
      notarizedLease: { uploaded: false, fileName: null, uploadDate: null },
      evictionStatus: null, overdueInfo: null,
    };
    setContracts([newContract, ...contracts]);
    setShowCreateModal(false);
    setCreateStep(1);
    setForm({ tenant: '', unit: '', type: '', rent: '', deposit: '', leaseStart: '', leaseEnd: '' });
  };

  const openPreview = (contract) => {
    setSelectedContract(contract);
    setShowPreviewModal(true);
  };

  // File upload simulation
  const handleUploadFile = (contractId, docType) => {
    const today = new Date().toISOString().slice(0, 10);
    setContracts(prev => prev.map(c => c.id === contractId ? {
      ...c,
      [docType]: { uploaded: true, fileName: `${docType}_${c.tenant.toLowerCase().replace(/\s/g, '_')}.pdf`, uploadDate: today }
    } : c));
    if (selectedContract && selectedContract.id === contractId) {
      setSelectedContract(prev => ({
        ...prev,
        [docType]: { uploaded: true, fileName: `${docType}_${prev.tenant.toLowerCase().replace(/\s/g, '_')}.pdf`, uploadDate: today }
      }));
    }
  };

  const handleRemoveFile = (contractId, docType) => {
    setContracts(prev => prev.map(c => c.id === contractId ? {
      ...c,
      [docType]: { uploaded: false, fileName: null, uploadDate: null }
    } : c));
    if (selectedContract && selectedContract.id === contractId) {
      setSelectedContract(prev => ({ ...prev, [docType]: { uploaded: false, fileName: null, uploadDate: null } }));
    }
  };

  // Flag for eviction
  const handleFlagEviction = (contractId) => {
    setContracts(prev => prev.map(c => c.id === contractId ? {
      ...c, status: 'eviction-pending', evictionStatus: 'flagged'
    } : c));
    if (selectedContract && selectedContract.id === contractId) {
      setSelectedContract(prev => ({ ...prev, status: 'eviction-pending', evictionStatus: 'flagged' }));
    }
  };

  const handleClearEviction = (contractId) => {
    setContracts(prev => prev.map(c => c.id === contractId ? {
      ...c, status: 'active', evictionStatus: null
    } : c));
    if (selectedContract && selectedContract.id === contractId) {
      setSelectedContract(prev => ({ ...prev, status: 'active', evictionStatus: null }));
    }
  };

  // Lease completeness checker
  const getDocumentStatus = (contract) => {
    const signed = contract.signedLease?.uploaded || false;
    const notarized = contract.notarizedLease?.uploaded || false;
    if (signed && notarized) return { label: 'Complete', color: 'text-emerald-600', icon: faCheckCircle };
    if (signed || notarized) return { label: 'Partial', color: 'text-amber-600', icon: faClock };
    return { label: 'Missing', color: 'text-red-500', icon: faExclamationTriangle };
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Contracts" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ─── EVICTION MONITORING BANNER ─── */}
            {evictionAlertContracts.length > 0 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faGavel} className="text-lg" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-red-800 m-0">⚠ Eviction Threshold Exceeded</h3>
                    <p className="text-xs text-red-600 m-0 mt-0.5">{evictionAlertContracts.length} tenant(s) have exceeded the {overdueThresholdDays}-day overdue payment threshold. Review and take action.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {evictionAlertContracts.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white rounded-lg border border-red-200 p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">{c.tenant.charAt(0)}</div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 m-0">{c.tenant} · Unit {c.unit}</p>
                          <p className="text-[11px] text-red-500 m-0 mt-0.5">{c.overdueInfo.daysOverdue} days overdue · Outstanding: {formatCurrency(c.overdueInfo.outstandingAmount)}</p>
                        </div>
                      </div>
                      <button onClick={() => handleFlagEviction(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 border-0 cursor-pointer transition-colors">
                        <FontAwesomeIcon icon={faGavel} /> Flag for Eviction
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><FontAwesomeIcon icon={faCheckCircle} /></div>
                  <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Active</p><p className="text-2xl font-bold text-slate-800 m-0">{contracts.filter(c => c.status === 'active').length}</p></div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><FontAwesomeIcon icon={faExclamationTriangle} /></div>
                  <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Expired</p><p className="text-2xl font-bold text-slate-800 m-0">{contracts.filter(c => c.status === 'expired').length}</p></div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 text-red-700 flex items-center justify-center"><FontAwesomeIcon icon={faGavel} /></div>
                  <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Eviction Pending</p><p className="text-2xl font-bold text-red-600 m-0">{contracts.filter(c => c.status === 'eviction-pending').length}</p></div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><FontAwesomeIcon icon={faFileUpload} /></div>
                  <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Docs Incomplete</p><p className="text-2xl font-bold text-amber-600 m-0">{contracts.filter(c => !c.signedLease?.uploaded || !c.notarizedLease?.uploaded).length}</p></div>
                </div>
              </div>
            </div>

            {/* Doc completeness notice */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-indigo-700">
              <FontAwesomeIcon icon={faInfoCircle} className="text-indigo-400" />
              <span>All contracts require <strong>signed lease agreement</strong> and <strong>notarized copy</strong> to be uploaded. Eviction threshold: <strong>{overdueThresholdDays} days</strong> overdue.</span>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm focus-within:border-indigo-500 transition-all max-w-xs w-full">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                  <input type="text" placeholder="Search contracts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm outline-none border-0 p-0 text-slate-800" />
                </div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none cursor-pointer shadow-sm">
                  <option value="all">All Status</option><option value="active">Active</option><option value="expired">Expired</option><option value="draft">Draft</option><option value="eviction-pending">Eviction Pending</option>
                </select>
              </div>
              <button onClick={() => { setShowCreateModal(true); setCreateStep(1); }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer transition-colors">
                <FontAwesomeIcon icon={faPlus} /> New Contract
              </button>
            </div>

            {/* Contract Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="py-3 px-4">Contract ID</th><th className="py-3 px-4">Tenant</th><th className="py-3 px-4">Unit</th><th className="py-3 px-4">Lease Period</th><th className="py-3 px-4">Rent</th><th className="py-3 px-4">Documents</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const docStatus = getDocumentStatus(c);
                    return (
                      <tr key={c.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${c.status === 'eviction-pending' ? 'bg-red-50/30' : ''}`}>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-indigo-600">{c.id}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{c.tenant}</span>
                            {c.evictionStatus === 'flagged' && <FontAwesomeIcon icon={faGavel} className="text-red-500 text-[10px]" title="Eviction Pending" />}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{c.unit} <span className="text-slate-400 text-xs">({c.type})</span></td>
                        <td className="py-3 px-4 text-xs text-slate-600">{c.leaseStart} → {c.leaseEnd}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{formatCurrency(c.rent)}/mo</td>
                        <td className="py-3 px-4">
                          <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${docStatus.color}`}>
                            <FontAwesomeIcon icon={docStatus.icon} className="text-[10px]" /> {docStatus.label}
                          </span>
                        </td>
                        <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusConfig[c.status]?.color || statusConfig.active.color}`}>{statusConfig[c.status]?.label || c.status}</span></td>
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => openPreview(c)} className="w-7 h-7 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faEye} className="text-xs" /></button>
                          <button className="w-7 h-7 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 bg-transparent border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faDownload} className="text-xs" /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan="8" className="py-10 text-center text-slate-400 text-sm">No contracts found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </main>

      {/* Create Contract Modal — Multi-Step */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800 m-0">Create New Contract</h2>
                <p className="text-xs text-slate-500 m-0 mt-0.5">Step {createStep} of 3</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
            </div>

            {/* Step indicators */}
            <div className="px-6 pt-4 flex gap-2">
              {[1,2,3].map(s => (
                <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= createStep ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
              ))}
            </div>

            <div className="p-6 space-y-4">
              {createStep === 1 && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Select Tenant *</label>
                    <select value={form.tenant} onChange={handleTenantSelect} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500">
                      <option value="">Choose a tenant...</option>
                      {tenantOptions.map(t => <option key={t.name} value={t.name}>{t.name} — Unit {t.unit}</option>)}
                    </select>
                  </div>
                  {form.tenant && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-800">
                      <span className="font-semibold">Auto-filled:</span> Unit {form.unit} ({form.type}) · {formatCurrency(form.rent)}/mo
                    </div>
                  )}
                </>
              )}

              {createStep === 2 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Monthly Rent *</label>
                      <input type="number" value={form.rent} onChange={e => setForm(p => ({...p, rent: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Security Deposit *</label>
                      <input type="number" value={form.deposit} onChange={e => setForm(p => ({...p, deposit: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Lease Start *</label>
                      <input type="date" value={form.leaseStart} onChange={e => setForm(p => ({...p, leaseStart: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Lease End *</label>
                      <input type="date" value={form.leaseEnd} onChange={e => setForm(p => ({...p, leaseEnd: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500" />
                    </div>
                  </div>
                </>
              )}

              {createStep === 3 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="text-center border-b border-slate-200 pb-4">
                    <h3 className="text-lg font-bold text-slate-800 italic font-serif m-0">GRAND VILLAS AMS</h3>
                    <p className="text-[10px] text-slate-400 m-0 mt-1 uppercase tracking-widest">Lease Agreement</p>
                  </div>
                  <div className="space-y-2 text-xs text-slate-700">
                    <div className="flex justify-between"><span className="text-slate-400">Tenant:</span><span className="font-semibold">{form.tenant}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Unit:</span><span className="font-semibold">{form.unit} ({form.type})</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Monthly Rent:</span><span className="font-semibold">{formatCurrency(form.rent)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Security Deposit:</span><span className="font-semibold">{formatCurrency(form.deposit)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Lease Period:</span><span className="font-semibold">{form.leaseStart} → {form.leaseEnd}</span></div>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-[10px] text-slate-400 leading-relaxed m-0">
                      This Lease Agreement is entered into between Grand Villas AMS ("Landlord") and the Tenant named above. 
                      The Tenant agrees to pay the monthly rent on or before the 5th of each month. A late fee of ₱500 
                      will be charged for payments made after the due date. The security deposit shall be refunded upon 
                      lease termination, subject to property inspection. Both parties agree to the terms herein.
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <FontAwesomeIcon icon={faInfoCircle} className="mr-1.5" />
                    <strong>Note:</strong> After generating the contract, upload signed and notarized lease documents via the contract details page.
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between">
              {createStep > 1 ? (
                <button onClick={() => setCreateStep(s => s - 1)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100 cursor-pointer transition-colors">
                  <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
              ) : <div></div>}
              {createStep < 3 ? (
                <button onClick={() => setCreateStep(s => s + 1)} disabled={createStep === 1 && !form.tenant} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors disabled:opacity-50">
                  Next <FontAwesomeIcon icon={faArrowRight} />
                </button>
              ) : (
                <button onClick={handleGenerate} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 border-0 cursor-pointer transition-colors">
                  <FontAwesomeIcon icon={faFileSignature} /> Generate Contract
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal — Enhanced with Document Upload */}
      {showPreviewModal && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPreviewModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">{selectedContract.id}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusConfig[selectedContract.status]?.color || statusConfig.active.color}`}>{statusConfig[selectedContract.status]?.label || selectedContract.status}</span>
                {selectedContract.evictionStatus === 'flagged' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-200 text-red-900 border border-red-300">🚨 Eviction Flagged</span>
                )}
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Contract Details */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="text-center border-b border-slate-200 pb-4">
                  <h3 className="text-xl font-bold text-slate-800 italic font-serif m-0">GRAND VILLAS AMS</h3>
                  <p className="text-[10px] text-slate-400 m-0 mt-1 uppercase tracking-widest">Lease Agreement</p>
                  <p className="text-[10px] text-slate-400 m-0 mt-1">Generated: {selectedContract.generatedDate}</p>
                </div>
                <div className="space-y-3 text-sm text-slate-700">
                  <div className="flex justify-between py-1 border-b border-dotted border-slate-200"><span className="text-slate-400">Tenant</span><span className="font-semibold">{selectedContract.tenant}</span></div>
                  <div className="flex justify-between py-1 border-b border-dotted border-slate-200"><span className="text-slate-400">Unit</span><span className="font-semibold">{selectedContract.unit} ({selectedContract.type})</span></div>
                  <div className="flex justify-between py-1 border-b border-dotted border-slate-200"><span className="text-slate-400">Monthly Rent</span><span className="font-semibold">{formatCurrency(selectedContract.rent)}</span></div>
                  <div className="flex justify-between py-1 border-b border-dotted border-slate-200"><span className="text-slate-400">Security Deposit</span><span className="font-semibold">{formatCurrency(selectedContract.deposit)}</span></div>
                  <div className="flex justify-between py-1"><span className="text-slate-400">Lease Period</span><span className="font-semibold">{selectedContract.leaseStart} → {selectedContract.leaseEnd}</span></div>
                </div>
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h4 className="text-xs font-bold text-slate-600 mb-2 m-0">Terms & Conditions</h4>
                  <p className="text-[10px] text-slate-400 leading-relaxed m-0">
                    This Lease Agreement is entered into between Grand Villas AMS ("Landlord") and the Tenant named above. 
                    The Tenant agrees to pay the monthly rent on or before the 5th of each month. A late fee of ₱500 
                    will be charged for payments made after the due date. The security deposit shall be refunded upon 
                    lease termination, subject to property inspection. Both parties agree to the terms herein.
                  </p>
                </div>
                <div className="flex justify-between items-end pt-6 border-t border-slate-200 mt-4">
                  <div className="text-center"><div className="w-32 border-t border-slate-300 pt-1"><span className="text-[10px] text-slate-400">Landlord Signature</span></div></div>
                  <div className="text-center"><div className="w-32 border-t border-slate-300 pt-1"><span className="text-[10px] text-slate-400">Tenant Signature</span></div></div>
                </div>
              </div>

              {/* ─── DOCUMENT UPLOAD TRACKING ─── */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <FontAwesomeIcon icon={faFileUpload} className="text-indigo-500" />
                  <h4 className="text-sm font-bold text-slate-800 m-0">Lease Document Upload</h4>
                </div>
                <div className="p-5 space-y-4">
                  {/* Signed Lease */}
                  <div className={`rounded-lg border p-4 ${selectedContract.signedLease?.uploaded ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedContract.signedLease?.uploaded ? 'bg-emerald-200 text-emerald-700' : 'bg-amber-200 text-amber-700'}`}>
                          <FontAwesomeIcon icon={selectedContract.signedLease?.uploaded ? faCheckCircle : faFileSignature} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 m-0">Signed Lease Agreement</p>
                          {selectedContract.signedLease?.uploaded ? (
                            <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                              <FontAwesomeIcon icon={faFile} className="mr-1 text-slate-400" />
                              {selectedContract.signedLease.fileName} · Uploaded {selectedContract.signedLease.uploadDate}
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-600 m-0 mt-0.5">Not yet uploaded</p>
                          )}
                        </div>
                      </div>
                      {selectedContract.signedLease?.uploaded ? (
                        <button onClick={() => handleRemoveFile(selectedContract.id, 'signedLease')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-red-500 text-xs font-semibold rounded-lg hover:bg-red-50 cursor-pointer transition-colors">
                          <FontAwesomeIcon icon={faTimesCircle} /> Remove
                        </button>
                      ) : (
                        <button onClick={() => handleUploadFile(selectedContract.id, 'signedLease')} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 border-0 cursor-pointer transition-colors">
                          <FontAwesomeIcon icon={faUpload} /> Upload File
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notarized Lease */}
                  <div className={`rounded-lg border p-4 ${selectedContract.notarizedLease?.uploaded ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedContract.notarizedLease?.uploaded ? 'bg-emerald-200 text-emerald-700' : 'bg-amber-200 text-amber-700'}`}>
                          <FontAwesomeIcon icon={selectedContract.notarizedLease?.uploaded ? faCheckCircle : faShieldAlt} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 m-0">Notarized Lease Copy</p>
                          {selectedContract.notarizedLease?.uploaded ? (
                            <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                              <FontAwesomeIcon icon={faFile} className="mr-1 text-slate-400" />
                              {selectedContract.notarizedLease.fileName} · Uploaded {selectedContract.notarizedLease.uploadDate}
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-600 m-0 mt-0.5">Not yet uploaded</p>
                          )}
                        </div>
                      </div>
                      {selectedContract.notarizedLease?.uploaded ? (
                        <button onClick={() => handleRemoveFile(selectedContract.id, 'notarizedLease')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-red-500 text-xs font-semibold rounded-lg hover:bg-red-50 cursor-pointer transition-colors">
                          <FontAwesomeIcon icon={faTimesCircle} /> Remove
                        </button>
                      ) : (
                        <button onClick={() => handleUploadFile(selectedContract.id, 'notarizedLease')} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 border-0 cursor-pointer transition-colors">
                          <FontAwesomeIcon icon={faUpload} /> Upload File
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Document status summary */}
                  {(() => {
                    const ds = getDocumentStatus(selectedContract);
                    return (
                      <div className={`flex items-center gap-2 text-xs font-semibold ${ds.color} bg-slate-50 border border-slate-100 rounded-lg p-2.5`}>
                        <FontAwesomeIcon icon={ds.icon} />
                        Document Status: {ds.label}
                        {ds.label !== 'Complete' && <span className="text-slate-400 font-normal ml-1">— Please upload all required documents.</span>}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ─── EVICTION ACTION PANEL ─── */}
              {selectedContract.overdueInfo && (
                <div className={`rounded-xl border-2 p-5 space-y-3 ${selectedContract.status === 'eviction-pending' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon icon={faGavel} className={`text-xl ${selectedContract.status === 'eviction-pending' ? 'text-red-600' : 'text-amber-600'}`} />
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 m-0">
                        {selectedContract.status === 'eviction-pending' ? '🚨 Eviction Flagged' : '⚠ Overdue Payment Detected'}
                      </h4>
                      <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                        {selectedContract.overdueInfo.daysOverdue} days overdue · Outstanding: {formatCurrency(selectedContract.overdueInfo.outstandingAmount)} · Last payment: {selectedContract.overdueInfo.lastPaymentDate}
                      </p>
                    </div>
                  </div>
                  {selectedContract.overdueInfo.daysOverdue >= overdueThresholdDays && (
                    <div className="bg-white border border-red-200 rounded-lg p-3 text-xs text-red-700">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1.5" />
                      This tenant has exceeded the <strong>{overdueThresholdDays}-day</strong> overdue payment threshold configured in System Settings.
                    </div>
                  )}
                  <div className="flex gap-2">
                    {selectedContract.status !== 'eviction-pending' ? (
                      <button onClick={() => handleFlagEviction(selectedContract.id)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 border-0 cursor-pointer transition-colors">
                        <FontAwesomeIcon icon={faGavel} /> Flag for Eviction
                      </button>
                    ) : (
                      <button onClick={() => handleClearEviction(selectedContract.id)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 border-0 cursor-pointer transition-colors">
                        <FontAwesomeIcon icon={faCheckCircle} /> Clear Eviction Flag
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2 shrink-0">
              <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100 cursor-pointer transition-colors">
                <FontAwesomeIcon icon={faPrint} /> Print
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors">
                <FontAwesomeIcon icon={faDownload} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminContracts;
