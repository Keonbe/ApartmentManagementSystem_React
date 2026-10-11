import { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faPlus, faTimes, faBuilding, faUser, faClock,
  faCheckCircle, faExclamationTriangle, faEye, faUserPlus,
  faHistory, faLayerGroup, faSync, faWrench, faFileContract,
  faInfoCircle, faChevronRight, faImages, faUpload, faTrash, faBoxArchive
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { getSystemSettings } from '../config/systemSettings';
import { publicAssetUrl } from '../api/fileUrl';
import { LIMITS, MAX_AMOUNT, addYears, checkAmount, checkDate, checkDateRange, checkIntRange, checkText, localDateString, maxFutureDate } from '../utils/validation';

// admin_extend_rent.php extends by whole months, at most 12 (the server also
// enforces Settings -> Rental -> Maximum Months Ahead and the dues rules).
const MAX_EXTENSION_MONTHS = 12;

// YYYY-MM-DD plus n months, clamped to the month's last day — the date the
// server's DATE_ADD(lease_end, INTERVAL n MONTH) lands on.
const addMonthsTo = (dateStr, n) => {
  if (!dateStr || !n) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + Number(n), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
};
import { FILE_RULES, acceptFor, checkFiles } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';

const UNIT_TYPES = ['Studio', '1BR', '2BR'];
const FIELD_CLS = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition-all text-slate-800 bg-white';

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
const emptyAssignForm = { userId: '', tenantName: '', moveIn: '', leaseEnd: '', rent: '', identityVerified: false };

const AdminUnits = () => {
  const [units, setUnits] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showExtendForm, setShowExtendForm] = useState(false);
  
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [assignForm, setAssignForm] = useState(emptyAssignForm);
  const [extendForm, setExtendForm] = useState({ addMonths: '', newRent: '' });
  const [leaseError, setLeaseError] = useState('');
  const [addUnitError, setAddUnitError] = useState('');
  const [addUnitSubmitting, setAddUnitSubmitting] = useState(false);
  const [removingUnitId, setRemovingUnitId] = useState(null);
  const [unitActionError, setUnitActionError] = useState('');
  
  // Settings → Rental → Minimum Rent Duration.
  const [minLeaseDuration, setMinLeaseDuration] = useState(3);
  useEffect(() => {
    getSystemSettings().then(s => setMinLeaseDuration(s.minLeaseDuration || 3));
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get('get_users.php');
      if (res.data.success) {
        setUsers(res.data.data);
      }
    } catch (err) {
      console.error("Failed to fetch users list:", err);
    }
  };

  const fetchRooms = async () => {
    try {
      const response = await api.get('get_rooms.php');
      if (response.data.success) {
        console.log("Fetched rooms from DB:", response.data.rooms);
        // get_rooms.php now returns real maintenanceHistory/occupancyHistory/
        // leaseHistory per room — only hydrate the fields it genuinely has no
        // source for yet (history/paymentHistory), instead of clobbering the
        // real arrays with [] the way this used to.
        const hydratedRooms = response.data.rooms.map(room => ({
          ...room,
          history: [],
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

  useEffect(() => {
    const load = async () => { await Promise.all([fetchRooms(), fetchUsers()]); };
    load();
  }, []);

  const counts = {
    all: units.length,
    occupied: units.filter(u => u.status === 'occupied').length,
    vacant: units.filter(u => u.status === 'vacant').length,
    reserved: units.filter(u => u.status === 'reserved').length,
    repair: units.filter(u => u.status === 'repair').length,
  };

  const filters = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'occupied', label: `Occupied (${counts.occupied})` },
    { key: 'vacant', label: `Vacant (${counts.vacant})` },
    { key: 'reserved', label: `Reserved (${counts.reserved})` },
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
      reserved: { style: 'bg-violet-100 text-violet-800', label: '◐ Reserved' },
      repair: { style: 'bg-red-100 text-red-800', label: '✕ Under Repair' },
    };
    const { style, label } = map[status] || map.vacant;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${style}`}>{label}</span>;
  };

  const validateLeaseDuration = (startDate, endDate) => {
    if (!startDate || !endDate) return '';
    const start = new Date(startDate);
    start.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (start < today) {
      return 'Move-in date cannot be in the past.';
    }

    const end = new Date(endDate);
    end.setHours(0,0,0,0);
    if (end <= start) {
      return 'Rent end date must be after the move-in date.';
    }

    const months = monthsBetween(startDate, endDate);
    if (months < minLeaseDuration) {
      return `Rent duration must be at least ${minLeaseDuration} months. Current: ${months} month(s).`;
    }
    return '';
  };

  // Field checks for the three unit forms. Keys match create_room.php /
  // update_room.php where a matching body field exists.
  const unitErrors = useFieldErrors({
    id: (v) => checkText(v, { label: 'Unit number', max: LIMITS.unitId }),
    floor: (v) => checkText(v, { label: 'Floor', max: LIMITS.unitId }),
    type: (v) => (UNIT_TYPES.includes(v) ? '' : 'Choose a unit type.'),
    rent: (v) => checkAmount(v, { label: 'Monthly rent', min: 0.01, allowZero: false }),
  }, { idPrefix: 'unit-' });
  const assignErrors = useFieldErrors({
    userId: (v) => (users.some(u => String(u.id) === String(v)) ? '' : 'Choose the tenant to assign.'),
    moveIn: (v) => checkDate(v, { label: 'Move-in date', min: localDateString(), max: maxFutureDate() })
      .replace(/cannot be before .*/, 'cannot be in the past.'),
    leaseEnd: (v, all) => checkDate(v, { label: 'Rent end', max: maxFutureDate() })
      || checkDateRange(all.moveIn, v, { startLabel: 'Move-in date', endLabel: 'Rent end' })
      || validateLeaseDuration(all.moveIn, v),
    rent: (v) => (v !== '' && v != null ? checkAmount(v, { label: 'Monthly rent', min: 0.01, allowZero: false }) : ''),
    identityVerified: (v) => (v ? '' : 'Please confirm identity verification before assigning a tenant.'),
  }, { idPrefix: 'assign-' });
  const minExtensionMonths = Math.min(MAX_EXTENSION_MONTHS, Math.max(1, minLeaseDuration || 1));
  const extendErrors = useFieldErrors({
    addMonths: (v) => checkIntRange(v === '' ? NaN : v, minExtensionMonths, MAX_EXTENSION_MONTHS, 'Months to add'),
    newRent: (v) => (v !== '' ? checkAmount(v, { label: 'New rent', min: 0.01, allowZero: false }) : ''),
  }, { idPrefix: 'extend-' });
  const [assigning, setAssigning] = useState(false);
  const [extending, setExtending] = useState(false);

  const handleAddUnit = async (e) => {
    e?.preventDefault();
    if (addUnitSubmitting) return;
    const clean = { ...unitForm, id: unitForm.id.trim(), floor: unitForm.floor.trim() };
    setUnitForm(clean);
    if (!unitErrors.validateAll(clean)) return;
    setAddUnitError('');
    setAddUnitSubmitting(true);
    try {
      const response = await api.post('create_room.php', {
        id: clean.id,
        type: clean.type,
        floor: clean.floor,
        rent: Number(clean.rent)
      });
      if (response.data.success) {
        await fetchRooms();
        setUnitForm(emptyUnitForm);
        setShowAddModal(false);
      } else if (!unitErrors.applyServerErrors(response)) {
        setAddUnitError(response.data.message || 'Failed to create unit.');
      }
    } catch (err) {
      if (!unitErrors.applyServerErrors(err)) setAddUnitError(apiErrorMessage(err, 'Failed to create unit.'));
    } finally {
      setAddUnitSubmitting(false);
    }
  };

  const closeAddModal = () => { setShowAddModal(false); setAddUnitError(''); unitErrors.setErrors({}); };
  const closeAssignModal = () => { setShowAssignModal(false); setLeaseError(''); assignErrors.setErrors({}); };

  const handleRemoveUnit = async (unit) => {
    if (removingUnitId) return;
    const confirmed = window.confirm(
      `Remove Unit ${unit.id} from active listings? This is allowed only for a vacant unit with no active tenancy or reservation. Historical records will be retained.`
    );
    if (!confirmed) return;

    setUnitActionError('');
    setRemovingUnitId(unit.id);
    try {
      const response = await api.post('archive_room.php', { id: unit.id });
      if (!response.data.success) {
        setUnitActionError(response.data.message || 'Failed to remove unit.');
        return;
      }
      setUnits(current => current.filter(item => item.id !== unit.id));
      if (selectedUnit?.id === unit.id) {
        setShowDetailModal(false);
        setSelectedUnit(null);
      }
    } catch (error) {
      setUnitActionError(apiErrorMessage(error, 'Failed to remove unit.'));
    } finally {
      setRemovingUnitId(null);
    }
  };

  const handleAssignTenant = async (e) => {
    e?.preventDefault();
    if (!selectedUnit || assigning) return;
    if (!assignErrors.validateAll(assignForm)) return;
    setLeaseError('');

    setAssigning(true);
    try {
      const payload = {
        id: selectedUnit.id,
        status: 'occupied',
        user_id: Number(assignForm.userId),
        tenant_name: assignForm.tenantName,
        lease_start: assignForm.moveIn,
        lease_end: assignForm.leaseEnd,
        monthly_rent: Number(assignForm.rent) || selectedUnit.rent,
        identity_verified: assignForm.identityVerified
      };
      
      const response = await api.post('update_room.php', payload);
      if (response.data.success) {
        fetchRooms();
        setShowAssignModal(false);
        setAssignForm(emptyAssignForm);
        alert(response.data.message);
      } else if (!assignErrors.applyServerErrors(response)) {
        setLeaseError(apiErrorMessage(response, 'Failed to assign tenant.'));
      }
    } catch (error) {
      console.error('Failed to assign tenant:', error);
      if (!assignErrors.applyServerErrors(error)) setLeaseError(apiErrorMessage(error, 'Failed to assign tenant.'));
    } finally {
      setAssigning(false);
    }
  };

  const handleExtendLease = async () => {
    if (!selectedUnit || extending) return;
    if (!extendErrors.validateAll(extendForm)) return;
    setLeaseError('');

    setExtending(true);
    try {
      // A real extension (contract, Rent History, monthly billing), refused
      // while the tenant has overdue bills or a scheduled move-out.
      const payload = {
        roomId: selectedUnit.id,
        addMonths: Number(extendForm.addMonths),
        newRent: extendForm.newRent !== '' ? Number(extendForm.newRent) : null,
      };

      const response = await api.post('admin_extend_rent.php', payload);
      if (response.data.success) {
        fetchRooms();
        setExtendForm({ addMonths: '', newRent: '' });
        setShowExtendForm(false);
        alert(response.data.message);
      } else if (!extendErrors.applyServerErrors(response)) {
        setLeaseError(apiErrorMessage(response, 'Failed to extend rent.'));
      }
    } catch (error) {
      console.error('Failed to extend lease:', error);
      if (!extendErrors.applyServerErrors(error)) setLeaseError(apiErrorMessage(error, 'Failed to extend rent.'));
    } finally {
      setExtending(false);
    }
  };

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Unit Management" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Top Bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                <input maxLength={LIMITS.search}
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
            <div className="stagger-children grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="card-interactive bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Units</p>
                <p className="text-2xl font-bold text-slate-800 mt-1 m-0">{counts.all}</p>
              </div>
              <div className="card-interactive bg-white border-l-4 border-l-emerald-500 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Occupied</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1 m-0">{counts.occupied}</p>
                <p className="text-[10px] text-slate-400 m-0 mt-0.5">{counts.all > 0 ? Math.round((counts.occupied / counts.all) * 100) : 0}% occupancy</p>
              </div>
              <div className="card-interactive bg-white border-l-4 border-l-amber-400 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Vacant</p>
                <p className="text-2xl font-bold text-amber-500 mt-1 m-0">{counts.vacant}</p>
                <p className="text-[10px] text-slate-400 m-0 mt-0.5">Available now</p>
              </div>
              <div className="card-interactive bg-white border-l-4 border-l-red-400 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Under Repair</p>
                <p className="text-2xl font-bold text-red-500 mt-1 m-0">{counts.repair}</p>
              </div>
            </div>

            {/* Min Lease Duration Notice */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-indigo-700">
              <FontAwesomeIcon icon={faInfoCircle} className="text-indigo-400" />
              <span>Minimum rent duration policy: <strong>{minLeaseDuration} months</strong>. Configure in Settings → System Configuration.</span>
            </div>

            {/* Filter Pills */}
            {unitActionError && (
              <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                {unitActionError}
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {filters.map(f => (
                <button
                  key={f.key} onClick={() => setActiveFilter(f.key)}
                  className={`btn-interactive px-4 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
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
            <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {displayed.map(unit => {
                const remaining = daysRemaining(unit.leaseEnd);
                return (
                  <div
                    key={unit.id}
                    className={`card-interactive bg-white border rounded-xl p-4 transition-all hover:shadow-lg hover:-translate-y-0.5 group relative ${
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
                            {remaining > 0 ? `${remaining} days left` : 'Rent expired'}
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
                      {unit.status === 'vacant' && !unit.tenant && (
                        <button
                          type="button"
                          disabled={removingUnitId !== null}
                          onClick={() => handleRemoveUnit(unit)}
                          title={`Remove Unit ${unit.id} from active listings`}
                          className="flex items-center justify-center gap-1 text-[10px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md px-2 py-1.5 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FontAwesomeIcon icon={faBoxArchive} className="text-[9px]" />
                          {removingUnitId === unit.id ? 'Removing…' : 'Remove'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm modal-overlay-anim" onClick={closeAddModal}>
          <form className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()} onSubmit={handleAddUnit} noValidate>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><FontAwesomeIcon icon={faBuilding} /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 m-0">Add New Unit</h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">Create a new apartment unit</p>
                </div>
              </div>
              <button type="button" onClick={closeAddModal} aria-label="Close" className="btn-interactive text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 space-y-4">
              {addUnitError && (
                <div role="alert" className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{addUnitError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[['id', 'Unit Number *', 'e.g. 6A'], ['floor', 'Floor *', 'e.g. 6F']].map(([key, label, placeholder]) => (
                  <div key={key}>
                    <label htmlFor={`unit-${key}`} className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
                    <input {...unitErrors.fieldA11y(key)} autoComplete="off" value={unitForm[key]} maxLength={LIMITS.unitId}
                      onChange={e => { setUnitForm({ ...unitForm, [key]: e.target.value }); unitErrors.clearError(key); }}
                      onBlur={() => { const v = unitForm[key].trim(); setUnitForm({ ...unitForm, [key]: v }); if (v) unitErrors.validateField(key, { ...unitForm, [key]: v }); }}
                      className={FIELD_CLS + invalidCls(unitErrors.errors[key])} placeholder={placeholder} />
                    <FieldError id={`unit-${key}`} error={unitErrors.errors[key]} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="unit-type" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Type *</label>
                  <select {...unitErrors.fieldA11y('type')} value={unitForm.type} onChange={e => { setUnitForm({ ...unitForm, type: e.target.value }); unitErrors.clearError('type'); }} className={FIELD_CLS + invalidCls(unitErrors.errors.type)}>
                    {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <FieldError id="unit-type" error={unitErrors.errors.type} />
                </div>
                <div>
                  <label htmlFor="unit-rent" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Monthly Rent *</label>
                  <input type="number" {...unitErrors.fieldA11y('rent')} inputMode="decimal" min="0.01" max={MAX_AMOUNT} step="0.01" value={unitForm.rent}
                    onKeyDown={blockNonNumericKeys}
                    onChange={e => { setUnitForm({ ...unitForm, rent: e.target.value }); unitErrors.clearError('rent'); }}
                    onBlur={() => unitForm.rent !== '' && unitErrors.validateField('rent', unitForm)}
                    className={FIELD_CLS + invalidCls(unitErrors.errors.rent)} placeholder="6500" />
                  <FieldError id="unit-rent" error={unitErrors.errors.rent} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={closeAddModal} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
              <button type="submit" disabled={addUnitSubmitting} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer disabled:opacity-40">{addUnitSubmitting ? 'Adding...' : 'Add Unit'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Assign Tenant Modal */}
      {showAssignModal && selectedUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm modal-overlay-anim" onClick={closeAssignModal}>
          <form className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()} onSubmit={handleAssignTenant} noValidate>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><FontAwesomeIcon icon={faUserPlus} /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 m-0">Assign Tenant to Unit {selectedUnit.id}</h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">{selectedUnit.type} · {selectedUnit.floor}</p>
                </div>
              </div>
              <button type="button" onClick={closeAssignModal} aria-label="Close" className="btn-interactive text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="assign-userId" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Select Tenant User *</label>
                <select
                  {...assignErrors.fieldA11y('userId')}
                  value={assignForm.userId}
                  onChange={e => {
                    const selectedUser = users.find(u => String(u.id) === e.target.value);
                    setAssignForm({
                      ...assignForm,
                      userId: e.target.value,
                      tenantName: selectedUser ? selectedUser.name : ''
                    });
                    assignErrors.clearError('userId');
                  }}
                  className={`w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(assignErrors.errors.userId)}`}
                >
                  <option value="" disabled>-- Choose Existing User --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <FieldError id="assign-userId" error={assignErrors.errors.userId} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="assign-moveIn" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Move-in Date *</label>
                  <input type="date" {...assignErrors.fieldA11y('moveIn')} min={localDateString()} max={maxFutureDate()} value={assignForm.moveIn}
                    onChange={e => {
                      const moveIn = e.target.value;
                      // A lease end now before the move-in is cleared rather than kept invalid.
                      const leaseEnd = assignForm.leaseEnd && moveIn && assignForm.leaseEnd <= moveIn ? '' : assignForm.leaseEnd;
                      setAssignForm({ ...assignForm, moveIn, leaseEnd });
                      assignErrors.clearError('moveIn');
                      setLeaseError('');
                    }}
                    onBlur={() => assignForm.moveIn && assignErrors.validateField('moveIn', assignForm)}
                    className={`w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(assignErrors.errors.moveIn)}`} />
                  <FieldError id="assign-moveIn" error={assignErrors.errors.moveIn} />
                </div>
                <div>
                  <label htmlFor="assign-leaseEnd" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Rent End *</label>
                  <input type="date" {...assignErrors.fieldA11y('leaseEnd')} min={assignForm.moveIn || localDateString()} max={maxFutureDate()} value={assignForm.leaseEnd}
                    onChange={e => { setAssignForm({ ...assignForm, leaseEnd: e.target.value }); assignErrors.clearError('leaseEnd'); setLeaseError(''); }}
                    onBlur={() => assignForm.leaseEnd && assignErrors.validateField('leaseEnd', assignForm)}
                    className={`w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(assignErrors.errors.leaseEnd)}`} />
                  <FieldError id="assign-leaseEnd" error={assignErrors.errors.leaseEnd} />
                </div>
              </div>
              {assignForm.moveIn && assignForm.leaseEnd && (
                <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 border border-slate-100">
                  Duration: <strong>{monthsBetween(assignForm.moveIn, assignForm.leaseEnd)} months</strong> · Min required: <strong>{minLeaseDuration} months</strong>
                </div>
              )}
              <p className="m-0 text-xs text-slate-500 bg-indigo-50 border border-indigo-100 rounded-lg p-2">
                The unit is reserved and a move-in invoice (1 month advance rent + 1 month security deposit) is issued. It becomes occupied when the move-in is confirmed after that invoice is paid.
              </p>
              {leaseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-xs text-red-700">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
                  {leaseError}
                </div>
              )}
              <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  {...assignErrors.fieldA11y('identityVerified')}
                  checked={assignForm.identityVerified || false}
                  onChange={e => { setAssignForm({ ...assignForm, identityVerified: e.target.checked }); assignErrors.clearError('identityVerified'); }}
                  className="mt-0.5"
                />
                <span>I confirm this tenant's valid ID and NBI clearance have been verified in person, and they have agreed to the Terms &amp; Conditions.</span>
              </label>
              <FieldError id="assign-identityVerified" error={assignErrors.errors.identityVerified} />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={closeAssignModal} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
              <button type="submit" disabled={assigning} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 shadow-sm border-0 cursor-pointer disabled:opacity-40">{assigning ? 'Assigning…' : 'Assign Tenant'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Unit Detail Modal */}
      {showDetailModal && selectedUnit && (
        <UnitDetailModal
          unit={selectedUnit} onClose={() => { setShowDetailModal(false); setSelectedUnit(null); setShowExtendForm(false); setLeaseError(''); }}
          onAssign={() => { setShowDetailModal(false); setAssignForm({ ...emptyAssignForm, rent: String(selectedUnit.rent) }); setShowAssignModal(true); }}
          showExtendForm={showExtendForm} setShowExtendForm={setShowExtendForm} extendForm={extendForm} setExtendForm={setExtendForm} onExtendLease={handleExtendLease}
          minLeaseDuration={minLeaseDuration} leaseError={leaseError} setLeaseError={setLeaseError}
          extendErrors={extendErrors} extending={extending}
          onUpdateSuccess={fetchRooms}
        />
      )}
    </div>
  );
};

/* ─── Unit Detail Tabbed Modal Sub-Component ─── */
const UnitDetailModal = ({ unit, onClose, onAssign, showExtendForm, setShowExtendForm, extendForm, setExtendForm, onExtendLease, minLeaseDuration, leaseError, setLeaseError, extendErrors, extending, onUpdateSuccess }) => {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Unit status monitoring edit states
  const [showStatusEdit, setShowStatusEdit] = useState(false);
  const [editCondition, setEditCondition] = useState(unit.roomCondition || 'Good');
  const [editInspectionDate, setEditInspectionDate] = useState(unit.lastInspectionDate || '');
  const [editFurnishing, setEditFurnishing] = useState(unit.furnishingStatus || 'Unfurnished');
  const [isUpdating, setIsUpdating] = useState(false);

  // Unit showcase gallery states
  const [galleryImages, setGalleryImages] = useState(unit.images || []);
  const [galleryError, setGalleryError] = useState('');
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [deletingImagePath, setDeletingImagePath] = useState(null);

  const handleUploadImages = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const filesError = checkFiles(files, FILE_RULES.image, { maxCount: 8 - galleryImages.length });
    if (filesError) {
      setGalleryError(filesError);
      e.target.value = '';
      return;
    }
    setGalleryError('');
    setIsUploadingImages(true);
    try {
      const formData = new FormData();
      formData.append('room_id', unit.id);
      Array.from(files).forEach(file => formData.append('images[]', file));

      const res = await api.post('upload_room_images.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setGalleryImages(res.data.gallery);
        if (onUpdateSuccess) onUpdateSuccess();
      } else {
        setGalleryError(res.data.message || 'Failed to upload images.');
      }
    } catch (err) {
      setGalleryError(err.response?.data?.message || 'Failed to upload images.');
    } finally {
      setIsUploadingImages(false);
      e.target.value = '';
    }
  };

  const handleDeleteImage = async (path) => {
    if (!window.confirm('Remove this showcase image?')) return;
    setGalleryError('');
    setDeletingImagePath(path);
    try {
      const res = await api.post('delete_room_image.php', { room_id: unit.id, path });
      if (res.data.success) {
        setGalleryImages(res.data.gallery);
        if (onUpdateSuccess) onUpdateSuccess();
      } else {
        setGalleryError(res.data.message || 'Failed to remove image.');
      }
    } catch (err) {
      setGalleryError(err.response?.data?.message || 'Failed to remove image.');
    } finally {
      setDeletingImagePath(null);
    }
  };

  const handleSaveMonitoring = async () => {
    if (isUpdating) return;
    // An inspection is a past event: not in the future, not decades ago.
    const inspectionError = editInspectionDate
      ? checkDate(editInspectionDate, { label: 'Last inspection date', min: addYears(-10), max: localDateString() })
      : '';
    if (inspectionError) { alert(inspectionError); return; }
    setIsUpdating(true);
    try {
      const res = await api.post('update_room.php', {
        id: unit.id,
        room_condition: editCondition,
        last_inspection_date: editInspectionDate || null,
        furnishing_status: editFurnishing
      });
      if (res.data.success) {
        setShowStatusEdit(false);
        if (onUpdateSuccess) {
          onUpdateSuccess();
        }
      } else {
        alert(res.data.message || "Failed to update room attributes");
      }
    } catch (err) {
      console.error("Error updating room monitoring:", err);
      alert(apiErrorMessage(err, "Failed to update status monitoring attributes."));
    } finally {
      setIsUpdating(false);
    }
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: faLayerGroup },
    { key: 'gallery', label: 'Gallery', icon: faImages },
    { key: 'occupancy', label: 'Occupancy', icon: faUser },
    { key: 'occupancyHistory', label: 'Occupancy History', icon: faHistory },
    { key: 'leaseHistory', label: 'Rent History', icon: faFileContract },
    { key: 'maintenance', label: 'Maintenance', icon: faWrench },
  ];

  const remaining = daysRemaining(unit.leaseEnd);
  const totalDays = unit.leaseStart && unit.leaseEnd ? Math.ceil((new Date(unit.leaseEnd) - new Date(unit.leaseStart)) / (1000 * 60 * 60 * 24)) : 0;
  const elapsed = totalDays - (remaining || 0);
  const progressPct = totalDays > 0 ? Math.min(100, Math.max(0, (elapsed / totalDays) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm modal-overlay-anim" onClick={onClose}>
      <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
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
          <button onClick={onClose} className="btn-interactive text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
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

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Unit Number" value={unit.id} />
                <DetailField label="Type" value={unit.type} />
                <DetailField label="Floor" value={unit.floor} />
                <DetailField label="Monthly Rent" value={formatCurrency(unit.rent)} />
                {unit.status === 'occupied' && (
                  <DetailField label="Current Occupants" value={`${unit.occupants || 0} Person(s)`} />
                )}
                <DetailField label="Room Condition" value={unit.roomCondition || 'Good'} />
                <DetailField label="Furnishing Status" value={unit.furnishingStatus || 'Unfurnished'} />
                <DetailField label="Last Inspected" value={unit.lastInspectionDate || 'Never Inspected'} />
              </div>

              {/* Status Monitoring Editor section */}
              <div className="border-t border-slate-100 pt-4 mt-2">
                {!showStatusEdit ? (
                  <button 
                    onClick={() => {
                      setEditCondition(unit.roomCondition || 'Good');
                      setEditInspectionDate(unit.lastInspectionDate || '');
                      setEditFurnishing(unit.furnishingStatus || 'Unfurnished');
                      setShowStatusEdit(true);
                    }}
                    className="btn-interactive flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-colors"
                  >
                    <FontAwesomeIcon icon={faWrench} className="text-[10px]" /> Update Status & Inspection Details
                  </button>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 text-left">
                    <h4 className="text-xs font-bold text-slate-700 m-0">Edit Unit Status Monitoring</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Room Condition</label>
                        <select 
                          value={editCondition} 
                          onChange={e => setEditCondition(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white text-slate-800"
                        >
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                          <option value="Poor">Poor</option>
                          <option value="Needs Repair">Needs Repair</option>
                          <option value="Under Maintenance">Under Maintenance</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Furnishing Status</label>
                        <select 
                          value={editFurnishing} 
                          onChange={e => setEditFurnishing(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white text-slate-800"
                        >
                          <option value="Unfurnished">Unfurnished</option>
                          <option value="Semi-Furnished">Semi-Furnished</option>
                          <option value="Fully Furnished">Fully Furnished</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="monitor-inspection" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Last Inspection Date</label>
                        <input
                          type="date"
                          id="monitor-inspection"
                          name="last_inspection_date"
                          min={addYears(-10)}
                          max={localDateString()}
                          value={editInspectionDate}
                          onChange={e => setEditInspectionDate(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none bg-white text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button 
                        onClick={handleSaveMonitoring} 
                        disabled={isUpdating}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold border-0 cursor-pointer disabled:opacity-50"
                      >
                        {isUpdating ? 'Saving...' : 'Save Monitoring'}
                      </button>
                      <button 
                        onClick={() => setShowStatusEdit(false)} 
                        className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-white rounded-lg border-0 bg-transparent cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'gallery' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-slate-500 m-0 leading-relaxed">
                  Showcase photos shown to guests on the public Preview page. Rooms with no images hide the "View Layout" button entirely (max 8 images).
                </p>
                <label className={`btn-interactive shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-colors ${galleryImages.length >= 8 || isUploadingImages ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                  <FontAwesomeIcon icon={faUpload} className="text-[10px]" />
                  {isUploadingImages ? 'Uploading...' : 'Upload Images'}
                  <input
                    type="file"
                    accept={acceptFor(FILE_RULES.image)}
                    multiple
                    onChange={handleUploadImages}
                    disabled={galleryImages.length >= 8 || isUploadingImages}
                    className="hidden"
                  />
                </label>
              </div>

              {galleryError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-xs text-red-700">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
                  {galleryError}
                </div>
              )}

              {galleryImages.length === 0 ? (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faImages} className="text-slate-300 text-4xl mb-3 mx-auto block" />
                  <p className="text-sm text-slate-400 m-0">No showcase images uploaded for this unit yet.</p>
                </div>
              ) : (
                <div className="stagger-children grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {galleryImages.map((path) => (
                    <div key={path} className="card-interactive relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                      <img src={publicAssetUrl(path)} alt={`Unit ${unit.id} showcase`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleDeleteImage(path)}
                        disabled={deletingImagePath === path}
                        className="btn-interactive absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/60 hover:bg-red-600 text-white flex items-center justify-center border-0 cursor-pointer transition-colors disabled:opacity-50"
                        title="Remove image"
                      >
                        <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'occupancy' && (
            <div className="space-y-5">
              {unit.status === 'occupied' ? (
                <>
                  <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-xl p-5 border border-indigo-100">
                    <h4 className="text-sm font-semibold text-slate-800 m-0 mb-4">Rent Progress</h4>
                    <div className="grid grid-cols-4 gap-2 text-center mb-4">
                      <div><p className="text-xl font-bold text-indigo-600 m-0 truncate" title={unit.tenant}>{unit.tenant?.split(' ')[0]}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Tenant</p></div>
                      <div><p className="text-xl font-bold text-slate-800 m-0">{unit.occupants || 0}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Occupants</p></div>
                      <div><p className="text-xl font-bold text-slate-800 m-0">{elapsed > 0 ? elapsed : 0}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Days Elapsed</p></div>
                      <div><p className={`text-xl font-bold m-0 ${remaining <= 30 ? 'text-red-500' : remaining <= 90 ? 'text-amber-500' : 'text-emerald-600'}`}>{remaining > 0 ? remaining : 0}</p><p className="text-[11px] text-slate-400 m-0 mt-0.5">Days Left</p></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>{unit.leaseStart}</span><span>{unit.leaseEnd}</span></div>
                      <div className="w-full h-2 bg-white rounded-full overflow-hidden shadow-inner"><div className={`h-full rounded-full transition-all ${remaining <= 30 ? 'bg-red-500' : remaining <= 90 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${progressPct}%` }} /></div>
                    </div>
                  </div>
                  {!showExtendForm ? (
                    <button onClick={() => { setShowExtendForm(true); setLeaseError(''); extendErrors.setErrors({}); }} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors border-dashed cursor-pointer"><FontAwesomeIcon icon={faSync} /> Extend Rent / Adjust Rent</button>
                  ) : (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-slate-800 m-0">Extend Rent</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="extend-addMonths" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Months to Add *</label>
                          <input type="number" {...extendErrors.fieldA11y('addMonths')} inputMode="numeric" min={Math.min(MAX_EXTENSION_MONTHS, minLeaseDuration)} max={MAX_EXTENSION_MONTHS} step="1" value={extendForm.addMonths}
                            onKeyDown={blockNonNumericKeys}
                            onChange={e => { setExtendForm({ ...extendForm, addMonths: e.target.value }); extendErrors.clearError('addMonths'); setLeaseError(''); }}
                            onBlur={() => extendForm.addMonths !== '' && extendErrors.validateField('addMonths', extendForm)}
                            className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(extendErrors.errors.addMonths)}`}
                            placeholder={`${Math.min(MAX_EXTENSION_MONTHS, minLeaseDuration)}–${MAX_EXTENSION_MONTHS}`} />
                          <FieldError id="extend-addMonths" error={extendErrors.errors.addMonths} />
                        </div>
                        <div>
                          <label htmlFor="extend-newRent" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">New Rent (optional)</label>
                          <input type="number" {...extendErrors.fieldA11y('newRent')} inputMode="decimal" min="0.01" max={MAX_AMOUNT} step="0.01" value={extendForm.newRent}
                            onKeyDown={blockNonNumericKeys}
                            onChange={e => { setExtendForm({ ...extendForm, newRent: e.target.value }); extendErrors.clearError('newRent'); }}
                            onBlur={() => extendErrors.validateField('newRent', extendForm)}
                            className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(extendErrors.errors.newRent)}`} placeholder={String(unit.rent)} />
                          <FieldError id="extend-newRent" error={extendErrors.errors.newRent} />
                        </div>
                      </div>
                      {Number(extendForm.addMonths) > 0 && (
                        <div className="text-xs text-slate-500 bg-white rounded-lg p-2 border border-slate-100">
                          New rent end: <strong>{addMonthsTo(unit.leaseEnd, extendForm.addMonths) || '—'}</strong> · The added months are billed a week before each starts. Refused while the tenant has overdue bills or a scheduled move-out.
                        </div>
                      )}
                      {leaseError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-xs text-red-700">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
                          {leaseError}
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button type="button" onClick={onExtendLease} disabled={extending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 border-0 cursor-pointer disabled:opacity-40">{extending ? 'Saving…' : 'Confirm Extension'}</button>
                        <button type="button" onClick={() => { setShowExtendForm(false); setLeaseError(''); extendErrors.setErrors({}); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-white rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
                      </div>

                      {/* Previous Extensions Table */}
                      {unit.leaseHistory && unit.leaseHistory.filter(l => l.event === 'Rent Extended').length > 0 && (
                        <div className="mt-3 pt-3 border-t border-indigo-100">
                          <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 m-0">Previous Extensions</h5>
                          <div className="space-y-1.5">
                            {unit.leaseHistory.filter(l => l.event === 'Rent Extended').map((ext, idx) => (
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
                <div className="stagger-children space-y-3">
                  {[...unit.occupancyHistory].reverse().map((occ, idx) => {
                    const duration = monthsBetween(occ.leaseStart, occ.leaseEnd);
                    return (
                      <div key={idx} className={`card-interactive rounded-xl p-4 border ${occ.status === 'current' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
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
                Rent Event Log
              </h4>
              {unit.leaseHistory && unit.leaseHistory.length > 0 ? (
                <div className="stagger-children relative pl-6">
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
                  <p className="text-sm text-slate-400 m-0">No rent history recorded for this unit.</p>
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
            <div className="stagger-children space-y-3">
              {unit.maintenanceHistory && unit.maintenanceHistory.length > 0 ? (
                <>
                  {/* Cost summary */}
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800">Total Maintenance Cost for This Unit</span>
                    <span className="text-sm font-bold text-amber-700">{formatCurrency(unit.maintenanceHistory.reduce((sum, m) => sum + (m.cost || 0), 0))}</span>
                  </div>
                  {[...unit.maintenanceHistory].reverse().map((entry, idx) => (
                    <div key={idx} className="card-interactive flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
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