import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faPlus, faTimes, faBuilding, faUser, faCalendarAlt, faClock,
  faCheckCircle, faExclamationTriangle, faEye, faUserPlus, faArrowRight,
  faHistory, faLayerGroup, faSync, faWrench
} from '@fortawesome/free-solid-svg-icons';

const initialUnits = [
  { id: 'A', type: 'Studio', floor: '1F', status: 'occupied', tenant: 'Maria Santos', rent: 6500, leaseStart: '2024-06-01', leaseEnd: '2025-06-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Maria Santos', date: '2024-06-01' }], maintenanceHistory: [], paymentHistory: [{ id: 'RCT-1004', period: 'May 2025', breakdown: 'Rent: 6500, Water: 300, Elec: 700', amount: 7500, datePaid: 'May 1, 2025', status: 'paid', method: 'GCash' }, { id: 'RCT-1005', period: 'Apr 2025', breakdown: 'Rent: 6500, Water: 310, Elec: 720', amount: 7530, datePaid: 'Apr 2, 2025', status: 'paid', method: 'Cash' }] },
  { id: 'B', type: 'Studio', floor: '1F', status: 'occupied', tenant: 'Jose Reyes', rent: 6500, leaseStart: '2024-07-15', leaseEnd: '2025-07-15', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Jose Reyes', date: '2024-07-15' }], maintenanceHistory: [], paymentHistory: [] },
  { id: 'C', type: '1BR', floor: '1F', status: 'occupied', tenant: 'Ana Garcia', rent: 7500, leaseStart: '2024-05-01', leaseEnd: '2025-05-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Ana Garcia', date: '2024-05-01' }], maintenanceHistory: [{ id: 'REQ-004', issue: 'Electrical short in outlet', status: 'Completed', date: '2024-04-20', cost: 1200 }], paymentHistory: [] },
  { id: 'D', type: 'Studio', floor: '2F', status: 'vacant', tenant: null, rent: 6500, leaseStart: null, leaseEnd: null, lastTenant: 'Carlos Mendoza', maintenanceFlag: false, history: [{ event: 'Tenant moved out', detail: 'Carlos Mendoza', date: '2024-06-01' }, { event: 'Unit marked vacant', detail: 'Available for new tenants', date: '2024-06-02' }], maintenanceHistory: [], paymentHistory: [] },
  { id: 'E', type: 'Studio', floor: '2F', status: 'occupied', tenant: 'Pedro Cruz', rent: 6500, leaseStart: '2024-03-01', leaseEnd: '2025-03-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Pedro Cruz', date: '2024-03-01' }], maintenanceHistory: [{ id: 'REQ-001', issue: 'Leaking faucet in bathroom', status: 'Pending', date: '2024-05-15', cost: null }], paymentHistory: [{ id: 'RCT-1001', period: 'Apr 2025', breakdown: 'Rent: 6500, Water: 320, Elec: 750', amount: 7570, datePaid: 'Apr 3, 2025', status: 'paid', method: 'Cash' }, { id: 'RCT-1002', period: 'Mar 2025', breakdown: 'Rent: 6500, Water: 340, Elec: 700', amount: 7540, datePaid: 'Mar 5, 2025', status: 'paid', method: 'GCash' }] },
  { id: 'F', type: '1BR', floor: '2F', status: 'occupied', tenant: 'Rosa Dela Cruz', rent: 7500, leaseStart: '2024-08-01', leaseEnd: '2025-08-01', lastTenant: null, maintenanceFlag: true, history: [{ event: 'Tenant assigned', detail: 'Rosa Dela Cruz', date: '2024-08-01' }], maintenanceHistory: [{ id: 'REQ-003', issue: 'Clogged kitchen drain', status: 'In Progress', date: '2024-05-14', cost: null }], paymentHistory: [{ id: 'RCT-1003', period: 'Apr 2025', breakdown: 'Rent: 7500, Water: 400, Elec: 850', amount: 8750, datePaid: 'Apr 1, 2025', status: 'paid', method: 'Bank Transfer' }] },
  { id: 'G', type: 'Studio', floor: '3F', status: 'occupied', tenant: 'Ben Flores', rent: 6500, leaseStart: '2024-04-15', leaseEnd: '2025-04-15', lastTenant: null, maintenanceFlag: true, history: [{ event: 'Tenant assigned', detail: 'Ben Flores', date: '2024-04-15' }], maintenanceHistory: [{ id: 'REQ-002', issue: 'Busted ceiling light', status: 'Pending', date: '2024-05-16', cost: null }], paymentHistory: [] },
  { id: 'H', type: 'Studio', floor: '3F', status: 'occupied', tenant: 'Lita Ramos', rent: 6500, leaseStart: '2024-01-01', leaseEnd: '2025-01-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Lita Ramos', date: '2024-01-01' }], maintenanceHistory: [], paymentHistory: [] },
  { id: 'I', type: '1BR', floor: '3F', status: 'occupied', tenant: 'Dante Abad', rent: 7500, leaseStart: '2024-05-01', leaseEnd: '2025-05-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Dante Abad', date: '2024-05-01' }], maintenanceHistory: [], paymentHistory: [] },
  { id: 'J', type: 'Studio', floor: '4F', status: 'occupied', tenant: 'Gloria Tan', rent: 6500, leaseStart: '2024-09-01', leaseEnd: '2025-09-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Gloria Tan', date: '2024-09-01' }], maintenanceHistory: [], paymentHistory: [] },
  { id: 'K', type: 'Studio', floor: '4F', status: 'occupied', tenant: 'Ramon Lim', rent: 6500, leaseStart: '2024-02-01', leaseEnd: '2025-02-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Ramon Lim', date: '2024-02-01' }], maintenanceHistory: [], paymentHistory: [] },
  { id: 'L', type: '1BR', floor: '4F', status: 'occupied', tenant: 'Cora Santos', rent: 7500, leaseStart: '2024-10-01', leaseEnd: '2025-10-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Cora Santos', date: '2024-10-01' }], maintenanceHistory: [], paymentHistory: [] },
  { id: 'M', type: 'Studio', floor: '5F', status: 'vacant', tenant: null, rent: 6500, leaseStart: null, leaseEnd: null, lastTenant: null, maintenanceFlag: false, history: [{ event: 'Unit created', detail: 'Vacant since building opened', date: '2023-01-01' }], maintenanceHistory: [], paymentHistory: [] },
  { id: 'N', type: '1BR', floor: '5F', status: 'occupied', tenant: 'Nilo Ocampo', rent: 7500, leaseStart: '2024-11-01', leaseEnd: '2025-11-01', lastTenant: null, maintenanceFlag: false, history: [{ event: 'Tenant assigned', detail: 'Nilo Ocampo', date: '2024-11-01' }], maintenanceHistory: [], paymentHistory: [] }
];

const daysRemaining = (leaseEnd) => {
  if (!leaseEnd) return null;
  return Math.ceil((new Date(leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
};

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const AdminUnits = () => {
  const [units, setUnits] = useState(initialUnits);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);

  const emptyUnitForm = { id: '', type: 'Studio', floor: '', rent: '' };
  const [unitForm, setUnitForm] = useState(emptyUnitForm);

  const emptyAssignForm = { tenantName: '', moveIn: '', leaseEnd: '', rent: '' };
  const [assignForm, setAssignForm] = useState(emptyAssignForm);
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [extendForm, setExtendForm] = useState({ newLeaseEnd: '', newRent: '' });

  const counts = {
    all: units.length,
    occupied: units.filter(u => u.status === 'occupied').length,
    vacant: units.filter(u => u.status === 'vacant').length,
    repair: units.filter(u => u.status === 'repair').length,
  };

  const filters = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'occupied', label: `Occupied (${counts.occupied})` },
    { key: 'vacant', label: `Vacant (${counts.vacant})` },
    { key: 'repair', label: `Under Repair (${counts.repair})` },
  ];

  let displayed = activeFilter === 'all' ? units : units.filter(u => u.status === activeFilter);
  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    displayed = displayed.filter(u =>
      u.id.toLowerCase().includes(q) || u.type.toLowerCase().includes(q) || (u.tenant || '').toLowerCase().includes(q)
    );
  }

  const getStatusBadge = (status) => {
    const map = {
      occupied: { style: 'bg-emerald-100 text-emerald-800', label: '● Occupied' },
      vacant: { style: 'bg-amber-100 text-amber-800', label: '○ Vacant' },
      repair: { style: 'bg-red-100 text-red-800', label: '✕ Under Repair' },
    };
    const { style, label } = map[status] || map.vacant;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${style}`}>{label}</span>;
  };

  const handleAddUnit = () => {
    if (!unitForm.id || !unitForm.floor || !unitForm.rent) return;
    const newUnit = {
      id: unitForm.id, type: unitForm.type, floor: unitForm.floor, status: 'vacant', tenant: null, rent: Number(unitForm.rent), leaseStart: null, leaseEnd: null, lastTenant: null, maintenanceFlag: false,
      history: [{ event: 'Unit created', detail: `${unitForm.type} on ${unitForm.floor}`, date: new Date().toISOString().slice(0, 10) }],
      maintenanceHistory: []
    };
    setUnits(prev => [...prev, newUnit]);
    setUnitForm(emptyUnitForm);
    setShowAddModal(false);
  };

  const handleAssignTenant = () => {
    if (!assignForm.tenantName || !assignForm.moveIn || !assignForm.leaseEnd || !selectedUnit) return;
    setUnits(prev =>
      prev.map(u => u.id === selectedUnit.id ? {
        ...u, status: 'occupied', tenant: assignForm.tenantName, rent: Number(assignForm.rent) || u.rent, leaseStart: assignForm.moveIn, leaseEnd: assignForm.leaseEnd,
        history: [...u.history, { event: 'Tenant assigned', detail: assignForm.tenantName, date: assignForm.moveIn }],
      } : u)
    );
    setSelectedUnit(prev => ({ ...prev, status: 'occupied', tenant: assignForm.tenantName, rent: Number(assignForm.rent) || prev.rent, leaseStart: assignForm.moveIn, leaseEnd: assignForm.leaseEnd }));
    setAssignForm(emptyAssignForm);
    setShowAssignModal(false);
  };

  const handleExtendLease = () => {
    if (!extendForm.newLeaseEnd || !selectedUnit) return;
    const newRent = Number(extendForm.newRent) || selectedUnit.rent;
    setUnits(prev =>
      prev.map(u => u.id === selectedUnit.id ? {
        ...u, leaseEnd: extendForm.newLeaseEnd, rent: newRent,
        history: [...u.history, { event: 'Lease extended', detail: `New end: ${extendForm.newLeaseEnd} · Rent: ${formatCurrency(newRent)}`, date: new Date().toISOString().slice(0, 10) }],
      } : u)
    );
    setSelectedUnit(prev => ({ ...prev, leaseEnd: extendForm.newLeaseEnd, rent: newRent }));
    setExtendForm({ newLeaseEnd: '', newRent: '' });
    setShowExtendForm(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Unit Management" />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Top Bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                <input
                  type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search units, tenants..."
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none border-0 p-0"
                />
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm border-0 cursor-pointer"
              >
                <FontAwesomeIcon icon={faPlus} /> Add Unit
              </button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Units</p>
                <p className="text-2xl font-bold text-slate-800 mt-1 m-0">{counts.all}</p>
              </div>
              <div className="bg-white border-l-4 border-l-emerald-500 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Occupied</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1 m-0">{counts.occupied}</p>
                <p className="text-[10px] text-slate-400 m-0 mt-0.5">{counts.all > 0 ? Math.round((counts.occupied / counts.all) * 100) : 0}% occupancy</p>
              </div>
              <div className="bg-white border-l-4 border-l-amber-400 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Vacant</p>
                <p className="text-2xl font-bold text-amber-500 mt-1 m-0">{counts.vacant}</p>
                <p className="text-[10px] text-slate-400 m-0 mt-0.5">Available now</p>
              </div>
              <div className="bg-white border-l-4 border-l-red-400 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Under Repair</p>
                <p className="text-2xl font-bold text-red-500 mt-1 m-0">{counts.repair}</p>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-3 flex-wrap">
              {filters.map(f => (
                <button
                  key={f.key} onClick={() => setActiveFilter(f.key)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    activeFilter === f.key
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Units Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {displayed.map(unit => {
                const remaining = daysRemaining(unit.leaseEnd);
                return (
                  <div
                    key={unit.id}
                    className={`bg-white border rounded-xl p-4 transition-all hover:shadow-lg hover:-translate-y-0.5 group relative ${
                      unit.status === 'vacant' ? 'border-amber-300' : unit.maintenanceFlag ? 'border-red-200' : 'border-slate-200'
                    }`}
                  >
                    {unit.maintenanceFlag && (
                      <div className="absolute top-2 right-2">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400 text-xs" title="Has open maintenance" />
                      </div>
                    )}

                    <div className="text-xl font-bold text-slate-800">{unit.id}</div>
                    <div className="text-[11px] text-slate-500 mb-2">{unit.type} · {unit.floor}</div>
                    {getStatusBadge(unit.status)}

                    {unit.status === 'occupied' ? (
                      <>
                        <div className="text-[10px] text-slate-400 mt-2">{unit.tenant}</div>
                        <div className="text-xs font-bold text-indigo-600 mt-1">{formatCurrency(unit.rent)}/mo</div>
                        {remaining !== null && (
                          <div className={`text-[10px] font-medium mt-1.5 flex items-center gap-1 ${remaining <= 30 ? 'text-red-500' : remaining <= 90 ? 'text-amber-500' : 'text-slate-400'}`}>
                            <FontAwesomeIcon icon={faClock} className="text-[9px]" />
                            {remaining > 0 ? `${remaining} days left` : 'Lease expired'}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-[10px] text-amber-500 mt-2">Available now</div>
                        <div className="text-xs font-bold text-emerald-500 mt-1">{formatCurrency(unit.rent)}/mo</div>
                        {unit.lastTenant && <div className="text-[10px] text-slate-400 mt-1">Last: {unit.lastTenant}</div>}
                      </>
                    )}

                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => { setSelectedUnit(unit); setShowDetailModal(true); }}
                        className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md py-1.5 transition-colors border-0 cursor-pointer"
                      >
                        <FontAwesomeIcon icon={faEye} className="text-[9px]" /> Details
                      </button>
                      {unit.status === 'vacant' && (
                        <button
                          onClick={() => openAssignTenant(unit)}
                          className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md py-1.5 transition-colors border-0 cursor-pointer"
                        >
                          <FontAwesomeIcon icon={faUserPlus} className="text-[9px]" /> Assign
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </main>

      {/* Add New Unit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><FontAwesomeIcon icon={faBuilding} /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 m-0">Add New Unit</h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">Create a new apartment unit</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Unit Number *</label>
                  <input value={unitForm.id} onChange={e => setUnitForm({ ...unitForm, id: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition-all text-slate-800 bg-white" placeholder="e.g. 6A" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Floor *</label>
                  <input value={unitForm.floor} onChange={e => setUnitForm({ ...unitForm, floor: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition-all text-slate-800 bg-white" placeholder="e.g. 6F" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Type *</label>
                  <select value={unitForm.type} onChange={e => setUnitForm({ ...unitForm, type: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition-all bg-white text-slate-800">
                    <option>Studio</option>
                    <option>1BR</option>
                    <option>2BR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Monthly Rent *</label>
                  <input type="number" value={unitForm.rent} onChange={e => setUnitForm({ ...unitForm, rent: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition-all text-slate-800 bg-white" placeholder="6500" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
              <button onClick={handleAddUnit} disabled={!unitForm.id || !unitForm.floor || !unitForm.rent} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer disabled:opacity-40">Add Unit</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Tenant Modal */}
      {showAssignModal && selectedUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><FontAwesomeIcon icon={faUserPlus} /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 m-0">Assign Tenant to Unit {selectedUnit.id}</h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">{selectedUnit.type} · {selectedUnit.floor}</p>
                </div>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Tenant Name *</label>
                <input value={assignForm.tenantName} onChange={e => setAssignForm({ ...assignForm, tenantName: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" placeholder="Full name of tenant" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Move-in Date *</label>
                  <input type="date" value={assignForm.moveIn} onChange={e => setAssignForm({ ...assignForm, moveIn: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Lease End *</label>
                  <input type="date" value={assignForm.leaseEnd} onChange={e => setAssignForm({ ...assignForm, leaseEnd: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
              <button onClick={handleAssignTenant} disabled={!assignForm.tenantName || !assignForm.moveIn || !assignForm.leaseEnd} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 shadow-sm border-0 cursor-pointer disabled:opacity-40">Assign Tenant</button>
            </div>
          </div>
        </div>
      )}

      {/* Unit Detail Modal */}
      {showDetailModal && selectedUnit && (
        <UnitDetailModal
          unit={selectedUnit} onClose={() => { setShowDetailModal(false); setSelectedUnit(null); setShowExtendForm(false); }}
          onAssign={() => { setShowDetailModal(false); setAssignForm({ ...emptyAssignForm, rent: String(selectedUnit.rent) }); setShowAssignModal(true); }}
          showExtendForm={showExtendForm} setShowExtendForm={setShowExtendForm} extendForm={extendForm} setExtendForm={setExtendForm} onExtendLease={handleExtendLease}
        />
      )}
    </div>
  );
};

/* ─── Unit Detail Tabbed Modal Sub-Component ─── */
const UnitDetailModal = ({ unit, onClose, onAssign, showExtendForm, setShowExtendForm, extendForm, setExtendForm, onExtendLease }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const odds = [
    { key: 'overview', label: 'Overview', icon: faLayerGroup },
    { key: 'occupancy', label: 'Occupancy', icon: faUser },
    { key: 'history', label: 'History', icon: faHistory },
    { key: 'maintenance', label: 'Maintenance', icon: faWrench },
    { key: 'payments', label: 'Payments', icon: faMoneyBillWave },
  ];

  const remaining = daysRemaining(unit.leaseEnd);
  const totalDays = unit.leaseStart && unit.leaseEnd ? Math.ceil((new Date(unit.leaseEnd) - new Date(unit.leaseStart)) / (1000 * 60 * 60 * 24)) : 0;
  const elapsed = totalDays - (remaining || 0);
  const progressPct = totalDays > 0 ? Math.min(100, Math.max(0, (elapsed / totalDays) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md ${unit.status === 'occupied' ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : 'bg-gradient-to-br from-amber-400 to-amber-600'}`}>
              {unit.id}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 m-0">Unit {unit.id}</h3>
              <p className="text-xs text-slate-400 m-0 mt-0.5">{unit.type} · {unit.floor} · {formatCurrency(unit.rent)}/mo</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
        </div>

        <div className="flex border-b border-slate-200 px-6 shrink-0 bg-white">
          {odds.map(tab => (
            <button
              key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px border-t-0 border-x-0 bg-transparent cursor-pointer ${activeTab === tab.key ? 'text-indigo-600 border-b-indigo-600 font-bold' : 'text-slate-400 border-b-transparent hover:text-slate-600'}`}
            >
              <FontAwesomeIcon icon={tab.icon} className="text-xs" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className={`rounded-xl p-4 border ${unit.status === 'occupied' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon icon={unit.status === 'occupied' ? faCheckCircle : faBuilding} className={unit.status === 'occupied' ? 'text-emerald-600 text-lg' : 'text-amber-600 text-lg'} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 m-0">{unit.status === 'occupied' ? 'Currently Occupied' : 'Vacant — Available'}</p>
                      <p className="text-xs text-slate-500 m-0 mt-0.5">{unit.tenant ? `Tenant: ${unit.tenant}` : 'No current tenant'}</p>
                    </div>
                  </div>
                  {unit.status === 'vacant' && (
                    <button onClick={onAssign} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm border-0 cursor-pointer"><FontAwesomeIcon icon={faUserPlus} /> Assign Tenant</button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Unit Number" value={unit.id} />
                <DetailField label="Type" value={unit.type} />
                <DetailField label="Floor" value={unit.floor} />
                <DetailField label="Monthly Rent" value={formatCurrency(unit.rent)} />
              </div>
            </div>
          )}

          {activeTab === 'occupancy' && (
            <div className="space-y-5">
              {unit.status === 'occupied' ? (
                <>
                  <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-xl p-5 border border-indigo-100">
                    <h4 className="text-sm font-semibold text-slate-800 m-0 mb-4">Lease Progress</h4>
                    <div className="grid grid-cols-3 gap-4 text-center mb-4">
                      <div><p className="text-2xl font-bold text-indigo-600 m-0">{unit.tenant?.split(' ')[0]}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Tenant</p></div>
                      <div><p className="text-2xl font-bold text-slate-800 m-0">{elapsed > 0 ? elapsed : 0}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Days Elapsed</p></div>
                      <div><p className={`text-2xl font-bold m-0 ${remaining <= 30 ? 'text-red-500' : remaining <= 90 ? 'text-amber-500' : 'text-emerald-600'}`}>{remaining > 0 ? remaining : 0}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Days Left</p></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>{unit.leaseStart}</span><span>{unit.leaseEnd}</span></div>
                      <div className="w-full h-2 bg-white rounded-full overflow-hidden shadow-inner"><div className={`h-full rounded-full transition-all ${remaining <= 30 ? 'bg-red-500' : remaining <= 90 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${progressPct}%` }} /></div>
                    </div>
                  </div>
                  {!showExtendForm ? (
                    <button onClick={() => setShowExtendForm(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors border-dashed cursor-pointer"><FontAwesomeIcon icon={faSync} /> Extend Lease / Adjust Rent</button>
                  ) : (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-slate-800 m-0">Extend Lease</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">New Lease End *</label>
                          <input type="date" value={extendForm.newLeaseEnd} onChange={e => setExtendForm({ ...extendForm, newLeaseEnd: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">New Rent (optional)</label>
                          <input type="number" value={extendForm.newRent} onChange={e => setExtendForm({ ...extendForm, newRent: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" placeholder={String(unit.rent)} />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={onExtendLease} disabled={!extendForm.newLeaseEnd} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 border-0 cursor-pointer disabled:opacity-40">Confirm Extension</button>
                        <button onClick={() => setShowExtendForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-white rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faBuilding} className="text-slate-300 text-4xl mb-3 mx-auto block" />
                  <p className="text-sm text-slate-400 m-0">This unit is currently vacant.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {[...unit.history].reverse().map((entry, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 text-xs"><FontAwesomeIcon icon={faHistory} /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 m-0">{entry.event}</p>
                    <p className="text-[11px] text-slate-400 m-0 mt-0.5">{entry.detail}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{entry.date}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="space-y-3">
              {unit.maintenanceHistory && unit.maintenanceHistory.length > 0 ? [...unit.maintenanceHistory].reverse().map((entry, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className={`w-8 h-8 rounded-full ${entry.status === 'Completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} flex items-center justify-center shrink-0 mt-0.5 text-xs`}><FontAwesomeIcon icon={faWrench} /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 m-0">{entry.issue}</p>
                    <p className="text-[11px] text-slate-400 m-0 mt-0.5">Status: {entry.status} {entry.cost ? `· Cost: ₱${entry.cost.toLocaleString()}` : ''}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{entry.date}</span>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400 text-sm">No maintenance history for this unit.</div>
              )}
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-3">
              {unit.paymentHistory && unit.paymentHistory.length > 0 ? [...unit.paymentHistory].map((entry, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className={`w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 text-xs`}><FontAwesomeIcon icon={faCheckCircle} /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800 m-0">{formatCurrency(entry.amount)}</p>
                      <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">{entry.method}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 m-0 mt-0.5">{entry.period} · {entry.breakdown}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-mono text-indigo-600 m-0">{entry.id}</p>
                    <p className="text-[11px] text-slate-400 m-0 mt-0.5">{entry.datePaid}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400 text-sm">No payment history for this unit.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailField = ({ label, value }) => (
  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">{label}</p>
    <p className="text-sm font-medium text-slate-700 m-0 mt-0.5">{value || '—'}</p>
  </div>
);

export default AdminUnits;