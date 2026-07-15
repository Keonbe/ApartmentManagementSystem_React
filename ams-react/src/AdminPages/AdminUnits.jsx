import React, { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faPlus, faTimes, faBuilding, faUser, faCalendarAlt, faClock,
  faCheckCircle, faExclamationTriangle, faEye, faUserPlus, faArrowRight,
  faHistory, faLayerGroup, faSync, faWrench, faMoneyBillWave, faFileContract,
  faInfoCircle, faChevronRight
} from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings } from '../config/systemSettings';
import api from '../api/axiosConfig';
const initialUnits = [];

const daysRemaining = (leaseEnd) => {
  if (!leaseEnd) return null;
  return Math.ceil((new Date(leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
};

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const monthsBetween = (start, end) => {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e - s) / (1000 * 60 * 60 * 24 * 30.44));
};

const openAssignTenant = (unit, setSelectedUnit, setAssignForm, emptyAssignForm, setShowAssignModal) => {
  setSelectedUnit(unit);
  setAssignForm({ ...emptyAssignForm, rent: String(unit.rent) });
  setShowAssignModal(true);
};

const emptyUnitForm = { id: '', type: 'Studio', floor: '1F', rent: '' };
const emptyAssignForm = { tenantName: '', moveIn: '', leaseEnd: '', rent: '' };

const AdminUnits = () => {
  const [units, setUnits] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showExtendForm, setShowExtendForm] = useState(false);
  
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [assignForm, setAssignForm] = useState(emptyAssignForm);
  const [extendForm, setExtendForm] = useState({ newLeaseEnd: '', newRent: '' });
  const [leaseError, setLeaseError] = useState('');
  
  const minLeaseDuration = 6;

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await api.get('get_rooms.php');
      if (response.data.success) {
        // Hydrate empty arrays for UI elements that expect them but aren't in DB yet
        const hydratedRooms = response.data.rooms.map(room => ({
          ...room,
          history: [],
          occupancyHistory: [],
          leaseHistory: [],
          maintenanceHistory: [],
          paymentHistory: []
        }));
        setUnits(hydratedRooms);
        // Refresh selected unit if open
        if (selectedUnit) {
           const updated = hydratedRooms.find(u => u.id === selectedUnit.id);
           if (updated) setSelectedUnit(updated);
        }
      }
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
    }
  };

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

  const validateLeaseDuration = (startDate, endDate) => {
    if (!startDate || !endDate) return '';
    const months = monthsBetween(startDate, endDate);
    if (months < minLeaseDuration) {
      return `Lease duration must be at least ${minLeaseDuration} months. Current: ${months} month(s).`;
    }
    return '';
  };

  const handleAddUnit = () => {
    if (!unitForm.id || !unitForm.floor || !unitForm.rent) return;
    const newUnit = {
      id: unitForm.id, type: unitForm.type, floor: unitForm.floor, status: 'vacant', tenant: null, rent: Number(unitForm.rent), leaseStart: null, leaseEnd: null, lastTenant: null, maintenanceFlag: false,
      history: [{ event: 'Unit created', detail: `${unitForm.type} on ${unitForm.floor}`, date: new Date().toISOString().slice(0, 10) }],
      occupancyHistory: [],
      leaseHistory: [],
      maintenanceHistory: [],
      paymentHistory: []
    };
    setUnits(prev => [...prev, newUnit]);
    setUnitForm(emptyUnitForm);
    setShowAddModal(false);
  };

  const handleAssignTenant = async () => {
    if (!assignForm.tenantName || !assignForm.moveIn || !assignForm.leaseEnd || !selectedUnit) return;
    const error = validateLeaseDuration(assignForm.moveIn, assignForm.leaseEnd);
    if (error) { setLeaseError(error); return; }
    setLeaseError('');

    try {
      const payload = {
        id: selectedUnit.id,
        status: 'occupied',
        tenant_name: assignForm.tenantName,
        lease_start: assignForm.moveIn,
        lease_end: assignForm.leaseEnd,
        monthly_rent: Number(assignForm.rent) || selectedUnit.rent
      };
      
      const response = await api.post('update_room.php', payload);
      if (response.data.success) {
        fetchRooms();
        setShowAssignModal(false);
        setAssignForm(emptyAssignForm);
      }
    } catch (error) {
      console.error('Failed to assign tenant:', error);
      alert('Failed to assign tenant. Check console for details.');
    }
  };

  const handleExtendLease = async () => {
    if (!extendForm.newLeaseEnd || !selectedUnit) return;
    const error = validateLeaseDuration(selectedUnit.leaseEnd, extendForm.newLeaseEnd);
    if (error) { setLeaseError(error); return; }
    setLeaseError('');

    const newRent = Number(extendForm.newRent) || selectedUnit.rent;
    
    try {
      const payload = {
        id: selectedUnit.id,
        lease_end: extendForm.newLeaseEnd,
        monthly_rent: newRent
      };
      
      const response = await api.post('update_room.php', payload);
      if (response.data.success) {
        fetchRooms();
        setExtendForm({ newLeaseEnd: '', newRent: '' });
        setShowExtendForm(false);
      }
    } catch (error) {
      console.error('Failed to extend lease:', error);
      alert('Failed to extend lease. Check console for details.');
    }
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

            {/* Min Lease Duration Notice */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-indigo-700">
              <FontAwesomeIcon icon={faInfoCircle} className="text-indigo-400" />
              <span>Minimum lease duration policy: <strong>{minLeaseDuration} months</strong>. Configure in Settings → System Configuration.</span>
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
                        onClick={() => { setSelectedUnit(unit); setShowDetailModal(true); setLeaseError(''); }}
                        className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md py-1.5 transition-colors border-0 cursor-pointer"
                      >
                        <FontAwesomeIcon icon={faEye} className="text-[9px]" /> Details
                      </button>
                      {unit.status === 'vacant' && (
                        <button
                          onClick={() => openAssignTenant(unit, setSelectedUnit, setAssignForm, emptyAssignForm, setShowAssignModal)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowAssignModal(false); setLeaseError(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><FontAwesomeIcon icon={faUserPlus} /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 m-0">Assign Tenant to Unit {selectedUnit.id}</h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">{selectedUnit.type} · {selectedUnit.floor}</p>
                </div>
              </div>
              <button onClick={() => { setShowAssignModal(false); setLeaseError(''); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Tenant Name *</label>
                <input value={assignForm.tenantName} onChange={e => setAssignForm({ ...assignForm, tenantName: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" placeholder="Full name of tenant" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Move-in Date *</label>
                  <input type="date" value={assignForm.moveIn} onChange={e => { setAssignForm({ ...assignForm, moveIn: e.target.value }); setLeaseError(''); }} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Lease End *</label>
                  <input type="date" value={assignForm.leaseEnd} onChange={e => { setAssignForm({ ...assignForm, leaseEnd: e.target.value }); setLeaseError(''); }} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" />
                </div>
              </div>
              {assignForm.moveIn && assignForm.leaseEnd && (
                <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 border border-slate-100">
                  Duration: <strong>{monthsBetween(assignForm.moveIn, assignForm.leaseEnd)} months</strong> · Min required: <strong>{minLeaseDuration} months</strong>
                </div>
              )}
              {leaseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-xs text-red-700">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
                  {leaseError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => { setShowAssignModal(false); setLeaseError(''); }} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
              <button onClick={handleAssignTenant} disabled={!assignForm.tenantName || !assignForm.moveIn || !assignForm.leaseEnd} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 shadow-sm border-0 cursor-pointer disabled:opacity-40">Assign Tenant</button>
            </div>
          </div>
        </div>
      )}

      {/* Unit Detail Modal */}
      {showDetailModal && selectedUnit && (
        <UnitDetailModal
          unit={selectedUnit} onClose={() => { setShowDetailModal(false); setSelectedUnit(null); setShowExtendForm(false); setLeaseError(''); }}
          onAssign={() => { setShowDetailModal(false); setAssignForm({ ...emptyAssignForm, rent: String(selectedUnit.rent) }); setShowAssignModal(true); }}
          showExtendForm={showExtendForm} setShowExtendForm={setShowExtendForm} extendForm={extendForm} setExtendForm={setExtendForm} onExtendLease={handleExtendLease}
          minLeaseDuration={minLeaseDuration} leaseError={leaseError} setLeaseError={setLeaseError}
        />
      )}
    </div>
  );
};

/* ─── Unit Detail Tabbed Modal Sub-Component ─── */
const UnitDetailModal = ({ unit, onClose, onAssign, showExtendForm, setShowExtendForm, extendForm, setExtendForm, onExtendLease, minLeaseDuration, leaseError, setLeaseError }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const tabs = [
    { key: 'overview', label: 'Overview', icon: faLayerGroup },
    { key: 'occupancy', label: 'Occupancy', icon: faUser },
    { key: 'occupancyHistory', label: 'Occupancy History', icon: faHistory },
    { key: 'leaseHistory', label: 'Lease History', icon: faFileContract },
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

        <div className="flex border-b border-slate-200 px-3 shrink-0 bg-white overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-all -mb-px border-t-0 border-x-0 bg-transparent cursor-pointer whitespace-nowrap ${activeTab === tab.key ? 'text-indigo-600 border-b-indigo-600 font-bold' : 'text-slate-400 border-b-transparent hover:text-slate-600'}`}
            >
              <FontAwesomeIcon icon={tab.icon} className="text-[10px]" /> {tab.label}
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
                    <button onClick={() => { setShowExtendForm(true); setLeaseError(''); }} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors border-dashed cursor-pointer"><FontAwesomeIcon icon={faSync} /> Extend Lease / Adjust Rent</button>
                  ) : (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-slate-800 m-0">Extend Lease</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">New Lease End *</label>
                          <input type="date" value={extendForm.newLeaseEnd} onChange={e => { setExtendForm({ ...extendForm, newLeaseEnd: e.target.value }); setLeaseError(''); }} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">New Rent (optional)</label>
                          <input type="number" value={extendForm.newRent} onChange={e => setExtendForm({ ...extendForm, newRent: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" placeholder={String(unit.rent)} />
                        </div>
                      </div>
                      {extendForm.newLeaseEnd && (
                        <div className="text-xs text-slate-500 bg-white rounded-lg p-2 border border-slate-100">
                          Extension: <strong>{monthsBetween(unit.leaseEnd, extendForm.newLeaseEnd)} months</strong> · Min required: <strong>{minLeaseDuration} months</strong>
                        </div>
                      )}
                      {leaseError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-xs text-red-700">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
                          {leaseError}
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button onClick={onExtendLease} disabled={!extendForm.newLeaseEnd} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 border-0 cursor-pointer disabled:opacity-40">Confirm Extension</button>
                        <button onClick={() => { setShowExtendForm(false); setLeaseError(''); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-white rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
                      </div>

                      {/* Previous Extensions Table */}
                      {unit.leaseHistory && unit.leaseHistory.filter(l => l.event === 'Lease Extended').length > 0 && (
                        <div className="mt-3 pt-3 border-t border-indigo-100">
                          <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 m-0">Previous Extensions</h5>
                          <div className="space-y-1.5">
                            {unit.leaseHistory.filter(l => l.event === 'Lease Extended').map((ext, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-2 border border-slate-100 text-xs">
                                <div>
                                  <span className="text-slate-600 font-semibold">{ext.oldEnd} → {ext.newEnd}</span>
                                  <span className="text-slate-400 ml-2">({ext.detail})</span>
                                </div>
                                <span className="text-[10px] text-slate-400">{ext.date}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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

          {/* Occupancy History Tab */}
          {activeTab === 'occupancyHistory' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 m-0 flex items-center gap-2">
                <FontAwesomeIcon icon={faHistory} className="text-indigo-500" />
                All Tenants Who Occupied This Unit
              </h4>
              {unit.occupancyHistory && unit.occupancyHistory.length > 0 ? (
                <div className="space-y-3">
                  {[...unit.occupancyHistory].reverse().map((occ, idx) => {
                    const duration = monthsBetween(occ.leaseStart, occ.leaseEnd);
                    return (
                      <div key={idx} className={`rounded-xl p-4 border ${occ.status === 'current' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${occ.status === 'current' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                              {occ.tenant.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800 m-0">{occ.tenant}</p>
                              <p className="text-[10px] text-slate-400 m-0">{occ.status === 'current' ? 'Current Tenant' : 'Past Tenant'}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${occ.status === 'current' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                            {occ.status === 'current' ? 'Active' : 'Ended'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div><span className="text-slate-400">Period:</span> <span className="font-semibold text-slate-700">{occ.leaseStart} → {occ.leaseEnd}</span></div>
                          <div><span className="text-slate-400">Duration:</span> <span className="font-semibold text-slate-700">{duration} months</span></div>
                          <div><span className="text-slate-400">Rent:</span> <span className="font-bold text-indigo-600">{formatCurrency(occ.rent)}</span></div>
                        </div>
                        {occ.moveOutReason && (
                          <div className="mt-2 text-[11px] text-slate-500 bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                            Move-out reason: <strong>{occ.moveOutReason}</strong>
                          </div>
                        )}
                        {/* Visual duration bar */}
                        <div className="mt-2 w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${occ.status === 'current' ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${Math.min(100, (duration / 12) * 100)}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faUser} className="text-slate-300 text-3xl mb-3 block mx-auto" />
                  <p className="text-sm text-slate-400 m-0">No occupancy history. This unit has never been rented.</p>
                </div>
              )}
            </div>
          )}

          {/* Lease History Tab */}
          {activeTab === 'leaseHistory' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 m-0 flex items-center gap-2">
                <FontAwesomeIcon icon={faFileContract} className="text-indigo-500" />
                Lease Event Log
              </h4>
              {unit.leaseHistory && unit.leaseHistory.length > 0 ? (
                <div className="relative pl-6">
                  <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-indigo-200"></div>
                  {[...unit.leaseHistory].reverse().map((entry, idx) => (
                    <div key={idx} className="relative mb-4 last:mb-0">
                      <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                        entry.event.includes('Terminated') ? 'bg-red-500' :
                        entry.event.includes('Extended') ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}></div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 ml-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold ${
                            entry.event.includes('Terminated') ? 'text-red-700' :
                            entry.event.includes('Extended') ? 'text-amber-700' : 'text-emerald-700'
                          }`}>{entry.event}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">{entry.date}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 m-0">{entry.detail}</p>
                        {entry.oldEnd && entry.newEnd && (
                          <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                            <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">{entry.oldEnd}</span>
                            <FontAwesomeIcon icon={faChevronRight} className="text-slate-400 text-[8px]" />
                            <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono">{entry.newEnd}</span>
                            {entry.oldRent !== entry.newRent && entry.oldRent && entry.newRent && (
                              <span className="ml-2 text-slate-400">Rent: {formatCurrency(entry.oldRent)} → {formatCurrency(entry.newRent)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faFileContract} className="text-slate-300 text-3xl mb-3 block mx-auto" />
                  <p className="text-sm text-slate-400 m-0">No lease history recorded for this unit.</p>
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
              {unit.maintenanceHistory && unit.maintenanceHistory.length > 0 ? (
                <>
                  {/* Cost summary */}
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800">Total Maintenance Cost for This Unit</span>
                    <span className="text-sm font-bold text-amber-700">{formatCurrency(unit.maintenanceHistory.reduce((sum, m) => sum + (m.cost || 0), 0))}</span>
                  </div>
                  {[...unit.maintenanceHistory].reverse().map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className={`w-8 h-8 rounded-full ${entry.status === 'Completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} flex items-center justify-center shrink-0 mt-0.5 text-xs`}><FontAwesomeIcon icon={faWrench} /></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800 m-0">{entry.issue}</p>
                        <p className="text-[11px] text-slate-400 m-0 mt-0.5">Status: {entry.status} {entry.cost ? `· Cost: ${formatCurrency(entry.cost)}` : ''}</p>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">{entry.date}</span>
                    </div>
                  ))}
                </>
              ) : (
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