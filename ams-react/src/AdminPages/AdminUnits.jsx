import { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faPlus, faTimes, faBuilding, faUser, faClock,
  faCheckCircle, faExclamationTriangle, faEye, faUserPlus,
  faHistory, faLayerGroup, faSync, faWrench,
  faChevronRight, faImages, faUpload, faTrash, faBoxArchive, faSpinner,
  faCheck, faCalendarAlt, faEnvelope, faPhone, faUsers, faCouch, faClipboardCheck, faPesoSign, faStairs, faDoorOpen
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { getSystemSettings } from '../config/systemSettings';
import { publicAssetUrl } from '../api/fileUrl';
import DepositOutcome from '../Components/DepositOutcome';
import SetUnderMaintenanceModal from '../Components/admin/SetUnderMaintenanceModal';
import { LIMITS, MAX_AMOUNT, addYears, checkAmount, checkDate, checkDateRange, dateProblem, checkIntRange, checkText, localDateString, maxFutureDate } from '../utils/validation';

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
import Modal from '../Components/admin/Modal';
import { btn } from '../Components/admin/ui/styles';
import FilterTabs from '../Components/admin/ui/FilterTabs';
import InfoTip from '../Components/admin/ui/InfoTip';
import TenantPicker from '../Components/admin/TenantPicker';
import PersonAvatar from '../Components/admin/PersonAvatar';
import EmptyState from '../Components/admin/ui/EmptyState';
import LoadError from '../Components/admin/ui/LoadError';
import { SkeletonCards } from '../Components/admin/ui/Skeleton';
import useLoadState from '../hooks/useLoadState';
import askConfirm from '../utils/askConfirm';

const UNIT_TYPES = ['Studio', '1BR', '2BR'];
const FIELD_CLS = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-control outline-none focus:border-indigo-500 transition-all text-slate-800 bg-white';

const daysRemaining = (leaseEnd) => {
  if (!leaseEnd) return null;
  return Math.ceil((new Date(leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
};

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;
// "2F" -> "2nd floor" for the floor filter (as config.php floor_display_name()).
const floorName = (floor) => {
  const m = /^(\d+)F$/i.exec(String(floor || '').trim());
  if (!m) return String(floor);
  const n = Number(m[1]);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  return `${n}${suffix} floor`;
};

// 'YYYY-MM-DD' plus n months, kept on the last day when the month is shorter.
const addMonthsIso = (iso, n) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const out = new Date(y, m - 1 + n, Math.min(d, last));
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
};

// 'YYYY-MM-DD' -> "Nov 1, 2025" (blank stays blank).
const fmtDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return iso || '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// The unit's state as one pill, for the detail modal header.
const unitStatePill = (unit) => {
  if (unit.maintenanceFlag || unit.status === 'repair') return { label: 'Under maintenance', cls: 'bg-amber-100 text-amber-800 ring-amber-200' };
  if (unit.status === 'occupied') return { label: 'Occupied', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' };
  if (unit.status === 'reserved') return { label: 'Reserved', cls: 'bg-violet-100 text-violet-800 ring-violet-200' };
  return { label: 'Vacant', cls: 'bg-amber-50 text-amber-800 ring-amber-200' };
};

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
  // loading | error | ready: until ready the grid shows a skeleton or the error
  // and the counts are hidden, never an empty grid and "0% occupied".
  const unitsState = useLoadState();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showExtendForm, setShowExtendForm] = useState(false);
  
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  // Floor -> fixed rent from Settings. A new unit's rent follows its floor until typed over.
  const [floorRates, setFloorRates] = useState({});
  const [rentTyped, setRentTyped] = useState(false);
  useEffect(() => {
    api.get('get_system_settings.php').then((res) => setFloorRates(res.data?.settings?.floor_rates || {})).catch(() => {});
  }, []);
  const [assignForm, setAssignForm] = useState(emptyAssignForm);
  const [extendForm, setExtendForm] = useState({ addMonths: '', newRent: '' });
  const [leaseError, setLeaseError] = useState('');
  const [addUnitError, setAddUnitError] = useState('');
  const [addUnitSubmitting, setAddUnitSubmitting] = useState(false);
  const [removingUnitId, setRemovingUnitId] = useState(null);
  const [unitActionError, setUnitActionError] = useState('');
  const [unitToRemove, setUnitToRemove] = useState(null);
  const [removeModalError, setRemoveModalError] = useState('');

  // Under Maintenance Modal State
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [maintenanceTargetUnit, setMaintenanceTargetUnit] = useState(null);
  const [completingMaintenanceId, setCompletingMaintenanceId] = useState(null);

  const openSetMaintenance = (unit) => {
    if (unit.status === 'occupied' || unit.tenant) {
      alert(`Unit ${unit.id} is occupied by ${unit.tenant}. An occupied unit cannot be placed under maintenance while a tenant resides there.`);
      return;
    }
    setMaintenanceTargetUnit(unit);
    setMaintenanceModalOpen(true);
  };

  const handleCompleteMaintenance = async (unit) => {
    if (!(await askConfirm(`Mark maintenance for Unit ${unit.id} as completed? The unit will return to Available status.`))) return;
    setCompletingMaintenanceId(unit.id);
    try {
      const res = await api.post('set_unit_maintenance.php', {
        unitId: unit.id,
        action: 'complete',
      });
      if (res.data.success) {
        await fetchRooms();
        if (selectedUnit && selectedUnit.id === unit.id) {
          setSelectedUnit((prev) => ({
            ...prev,
            maintenanceFlag: false,
            availableDate: null,
            roomCondition: 'Good',
          }));
        }
      } else {
        alert(res.data.message || 'Failed to complete maintenance.');
      }
    } catch (err) {
      console.error('Failed to complete maintenance:', err);
      alert(err.response?.data?.message || 'Server error completing maintenance.');
    } finally {
      setCompletingMaintenanceId(null);
    }
  };
  
  // Settings → Rental → Minimum Rent Duration.
  const [minLeaseDuration, setMinLeaseDuration] = useState(3);
  // Rent control (RA 9653): shown as a hint on Extend Rent; extend_tenancy() enforces it.
  const [rentCap, setRentCap] = useState({ percent: 1, maxCovered: 10000 });
  useEffect(() => {
    getSystemSettings().then(s => {
      setMinLeaseDuration(s.minLeaseDuration || 3);
      setRentCap({ percent: Number(s.rentCapPercent ?? 1), maxCovered: Number(s.rentCapMaxCoveredRent ?? 10000) });
    });
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
        unitsState.ready();
        // Refresh selected unit if open
        if (selectedUnit) {
           const updated = hydratedRooms.find(u => u.id === selectedUnit.id);
           if (updated) setSelectedUnit(updated);
        }
      } else {
        unitsState.fail();
      }
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      // A failed refresh after an action keeps the grid already shown.
      unitsState.fail();
    }
  };

  useEffect(() => {
    const load = async () => { await Promise.all([fetchRooms(), fetchUsers()]); };
    load();
  }, []);

  // The floor filter narrows everything below it: the status counts, the
  // occupancy badge and the grid all describe the floor being looked at.
  const onFloor = floorFilter === 'all' ? units : units.filter(u => u.floor === floorFilter);
  const counts = {
    all: onFloor.length,
    occupied: onFloor.filter(u => u.status === 'occupied').length,
    vacant: onFloor.filter(u => u.status === 'vacant' && !u.maintenanceFlag).length,
    reserved: onFloor.filter(u => u.status === 'reserved').length,
    maintenance: onFloor.filter(u => u.maintenanceFlag || u.status === 'repair').length,
  };

  const filters = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'occupied', label: 'Occupied', count: counts.occupied },
    { key: 'vacant', label: 'Vacant', count: counts.vacant },
    { key: 'reserved', label: 'Reserved', count: counts.reserved },
    { key: 'maintenance', label: 'Under Maintenance', count: counts.maintenance },
  ];

  const occupancyPct = counts.all > 0 ? Math.round((counts.occupied / counts.all) * 100) : 0;
  // Floors in order (1F, 2F, 3F…); a unit's floor is free text, so sort naturally.
  const floors = [...new Set(units.map(u => u.floor).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  let displayed = onFloor;
  if (activeFilter === 'vacant') {
    displayed = onFloor.filter(u => u.status === 'vacant' && !u.maintenanceFlag);
  } else if (activeFilter === 'maintenance') {
    displayed = onFloor.filter(u => u.maintenanceFlag || u.status === 'repair');
  } else if (activeFilter !== 'all') {
    displayed = onFloor.filter(u => u.status === activeFilter);
  }

  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    displayed = displayed.filter(u =>
      u.id.toLowerCase().includes(q) || u.type.toLowerCase().includes(q) || (u.tenant || '').toLowerCase().includes(q)
    );
  }

  const getStatusBadge = (unitOrStatus) => {
    const isUnitObj = typeof unitOrStatus === 'object' && unitOrStatus !== null;
    const status = isUnitObj ? unitOrStatus.status : unitOrStatus;
    const isMaintenance = isUnitObj ? unitOrStatus.maintenanceFlag : status === 'repair';
    const availableDate = isUnitObj ? unitOrStatus.availableDate : null;

    if (isMaintenance) {
      return (
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1 bg-amber-100 text-amber-800">
          <FontAwesomeIcon icon={faWrench} className="text-[9px]" />
          <span>Under Maintenance</span>
          {availableDate && (
            <span className="text-[10px] text-amber-700 font-normal">
              (Soon: {new Date(availableDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
            </span>
          )}
        </span>
      );
    }

    const map = {
      occupied: { style: 'bg-emerald-100 text-emerald-800', label: '● Occupied' },
      vacant: { style: 'bg-amber-100 text-amber-800', label: '○ Vacant' },
      reserved: { style: 'bg-violet-100 text-violet-800', label: '◐ Reserved' },
      repair: { style: 'bg-red-100 text-red-800', label: '✕ Under Repair' },
    };
    const { style, label } = map[status] || map.vacant;
    return <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1 ${style}`}>{label}</span>;
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
  // Quick rent terms on Assign Tenant: the minimum, then 6 and 12 months.
  const termOptions = [...new Set([minLeaseDuration, 6, 12].filter((m) => m >= minLeaseDuration))].sort((a, b) => a - b);
  const assignErrors = useFieldErrors({
    userId: (v) => (users.some(u => String(u.id) === String(v)) ? '' : 'Choose the tenant to assign.'),
    moveIn: (v) => (dateProblem(v, { min: localDateString() }) === 'before'
      ? 'Move-in date cannot be in the past.'
      : checkDate(v, { label: 'Move-in date', min: localDateString(), max: maxFutureDate() })),
    leaseEnd: (v, all) => checkDate(v, { label: 'Rent end', max: maxFutureDate() })
      || checkDateRange(all.moveIn, v, { startLabel: 'Move-in date', endLabel: 'Rent end' })
      || validateLeaseDuration(all.moveIn, v),
    rent: (v) => (v !== '' && v != null ? checkAmount(v, { label: 'Monthly rent', min: 0.01, allowZero: false }) : ''),
    identityVerified: (v) => (v ? '' : 'Please confirm identity verification before assigning a tenant.'),
  }, { idPrefix: 'assign-' });
  // get_rooms.php extensionRange: Minimum Rent Duration, shrunk to what fits
  // under the months-ahead limit (config.php extension_month_range()).
  const minExtensionMonths = selectedUnit?.extensionRange?.min || Math.min(MAX_EXTENSION_MONTHS, Math.max(1, minLeaseDuration || 1));
  // max 0 means no month fits under the months-ahead limit (the server refuses any request).
  const noExtensionFits = selectedUnit?.extensionRange?.max === 0;
  const maxExtensionMonths = Math.max(minExtensionMonths, selectedUnit?.extensionRange?.max ?? MAX_EXTENSION_MONTHS);
  const extendErrors = useFieldErrors({
    addMonths: (v) => (noExtensionFits
      ? 'This rent already reaches the months-ahead limit, so it cannot be extended.'
      : checkIntRange(v === '' ? NaN : v, minExtensionMonths, maxExtensionMonths, 'Months to add')),
    newRent: (v) => (v !== '' ? checkAmount(v, { label: 'New rent', min: 0.01, allowZero: false }) : ''),
  }, { idPrefix: 'extend-' });
  const [assigning, setAssigning] = useState(false);
  const [extending, setExtending] = useState(false);
  // Other applicants who want this unit before the new rent end (409 from admin_extend_rent.php).
  const [extendConflict, setExtendConflict] = useState(null);
  const [overrideConflict, setOverrideConflict] = useState(false);

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
        setRentTyped(false);
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

  const promptRemoveUnit = (unit) => {
    setUnitToRemove(unit);
    setRemoveModalError('');
  };

  const closeRemoveModal = () => {
    if (removingUnitId) return;
    setUnitToRemove(null);
    setRemoveModalError('');
  };

  const confirmRemoveUnit = async () => {
    if (!unitToRemove || removingUnitId) return;
    setRemoveModalError('');
    setUnitActionError('');
    setRemovingUnitId(unitToRemove.id);
    try {
      const response = await api.post('archive_room.php', {
        id: unitToRemove.id,
        roomId: unitToRemove.id,
        room_id: unitToRemove.id
      });
      if (!response.data.success) {
        setRemoveModalError(response.data.message || 'Failed to remove unit.');
        return;
      }
      const removedId = unitToRemove.id;
      setUnits(current => current.filter(item => item.id !== removedId));
      if (selectedUnit?.id === removedId) {
        setShowDetailModal(false);
        setSelectedUnit(null);
      }
      setUnitToRemove(null);
    } catch (error) {
      setRemoveModalError(apiErrorMessage(error, 'Failed to remove unit.'));
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
    setExtendConflict(null);

    setExtending(true);
    try {
      // A real extension (contract, Rent History, monthly billing), refused
      // while the tenant has overdue bills or a scheduled move-out.
      const payload = {
        roomId: selectedUnit.id,
        addMonths: Number(extendForm.addMonths),
        newRent: extendForm.newRent !== '' ? Number(extendForm.newRent) : null,
        overrideConflict,
      };

      const response = await api.post('admin_extend_rent.php', payload);
      if (response.data.success) {
        fetchRooms();
        setExtendForm({ addMonths: '', newRent: '' });
        setOverrideConflict(false);
        setShowExtendForm(false);
        alert(response.data.message);
      } else if (!extendErrors.applyServerErrors(response)) {
        setLeaseError(apiErrorMessage(response, 'Failed to extend rent.'));
      }
    } catch (error) {
      console.error('Failed to extend lease:', error);
      setExtendConflict(error?.response?.data?.conflict ?? null);
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
              <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-control px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-sm" />
                <input maxLength={LIMITS.search}
                  type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search units, tenants..."
                  className="flex-1 bg-transparent text-body text-slate-700 placeholder-slate-400 outline-none focus-visible:outline-none focus-visible:ring-0 border-0 p-0"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {unitsState.isReady && counts.all > 0 && (
                  <div
                    className="flex items-center gap-3 rounded-card border border-emerald-200 bg-emerald-50 px-3.5 py-1.5"
                    title={`${counts.occupied} of ${counts.all} units occupied${floorFilter !== 'all' ? ` on the ${floorName(floorFilter)}` : ''}`}
                  >
                    <span className="text-title font-bold text-emerald-700 tabular-nums">{occupancyPct}%</span>
                    <span className="flex flex-col gap-1">
                      <span className="text-caption font-semibold text-emerald-800 leading-none">Occupied</span>
                      <span className="text-caption text-emerald-700/80 leading-none">{counts.occupied} of {counts.all} units{floorFilter !== 'all' ? ` · ${floorName(floorFilter)}` : ''}</span>
                    </span>
                    <span className="hidden sm:block h-2 w-20 overflow-hidden rounded-full bg-emerald-100" aria-hidden="true">
                      <span className="block h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${occupancyPct}%` }} />
                    </span>
                  </div>
                )}
                <button
                  onClick={() => { setRentTyped(false); setUnitForm({ ...emptyUnitForm, rent: floorRates[emptyUnitForm.floor] ? String(floorRates[emptyUnitForm.floor]) : '' }); setShowAddModal(true); }}
                  className={btn('primary', 'md')}
                >
                  <FontAwesomeIcon icon={faPlus} /> Add Unit
                </button>
              </div>
            </div>

            {/* Error banner if any */}
            {unitActionError && (
              <div role="alert" className="text-body text-red-700 bg-red-50 border border-red-200 rounded-control px-4 py-3">
                {unitActionError}
              </div>
            )}

            {/* Filter pills carry the counts; occupancy, the one figure they do not show, sits in the top bar. */}
            <div className="flex flex-wrap items-center gap-3">
              <FilterTabs
                label="Filter units by status"
                value={activeFilter}
                onChange={setActiveFilter}
                options={filters.map(f => ({ value: f.key, label: f.label, count: unitsState.isReady ? f.count : null }))}
              />
              {floors.length > 1 && (
                <FilterTabs
                  label="Filter units by floor"
                  value={floorFilter}
                  onChange={setFloorFilter}
                  options={[
                    { value: 'all', label: 'All floors' },
                    ...floors.map(f => ({ value: f, label: floorName(f), count: unitsState.isReady ? units.filter(u => u.floor === f).length : null })),
                  ]}
                />
              )}
            </div>

            {/* Units Grid */}
            {unitsState.isLoading && <SkeletonCards count={10} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4" label="Loading units…" />}
            {unitsState.isError && <div className="bg-white border border-slate-200 rounded-card shadow-card"><LoadError title="Couldn't load units" onRetry={() => { unitsState.retry(); fetchRooms(); }} /></div>}
            {unitsState.isReady && displayed.length === 0 && <div className="bg-white border border-slate-200 rounded-card shadow-card"><EmptyState title="No units here" message={units.length ? 'No unit matches this filter.' : 'Add the first unit with Add Unit.'} /></div>}
            {unitsState.isReady && <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
              {displayed.map(unit => {
                const remaining = daysRemaining(unit.leaseEnd);
                return (
                  <div
                    key={unit.id}
                    className={`card-interactive bg-white border rounded-card p-4 transition-all hover:shadow-raised hover:-translate-y-0.5 group relative ${
                      unit.status === 'vacant' && !unit.maintenanceFlag ? 'border-amber-300' : unit.maintenanceFlag ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'
                    }`}
                  >
                    {/* Status first, top left; the wrench marks a unit under maintenance. */}
                    <div className="flex items-center justify-between gap-2 min-h-[1.5rem]">
                      {getStatusBadge(unit)}
                      {unit.maintenanceFlag && (
                        <FontAwesomeIcon icon={faWrench} className="text-amber-500 text-xs animate-pulse" title="Under maintenance" />
                      )}
                    </div>

                    <div className="mt-2 text-section font-bold text-slate-800 leading-tight">{unit.id}</div>
                    {/* Who lives here (or who it is held for), right under the unit. */}
                    {(unit.status === 'occupied' || (unit.status === 'reserved' && unit.tenant)) && (
                      <div className="mt-0.5 truncate text-body font-semibold text-slate-900" title={unit.tenant || ''}>
                        {unit.status === 'reserved' && <span className="font-medium text-violet-700">For </span>}
                        {unit.tenant || 'Unnamed tenant'}
                      </div>
                    )}
                    <div className="text-caption text-slate-500 mt-0.5 mb-1">{unit.type} · {unit.floor}</div>

                    {unit.status === 'occupied' || (unit.status === 'reserved' && unit.tenant) ? (
                      <>
                        <div className="text-label font-bold text-indigo-600 mt-2">{formatCurrency(unit.rent)}/mo</div>
                        {remaining !== null && (
                          <div className={`text-caption font-medium mt-1.5 flex items-center gap-1 ${remaining <= 30 ? 'text-red-600' : remaining <= 90 ? 'text-amber-700' : 'text-slate-500'}`}>
                            <FontAwesomeIcon icon={faClock} className="text-[9px]" />
                            {remaining > 0 ? `${remaining} days left` : 'Rent expired'}
                          </div>
                        )}
                      </>
                    ) : unit.maintenanceFlag ? (
                      <>
                        <div className="text-caption text-amber-800 font-semibold mt-2">Coming Soon</div>
                        <div className="text-caption text-slate-500">
                          Est. Ready: <span className="font-semibold text-amber-700">{unit.availableDate ? new Date(unit.availableDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}</span>
                        </div>
                        <div className="text-label font-bold text-slate-700 mt-1">{formatCurrency(unit.rent)}/mo</div>
                        {unit.lastTenant && <div className="text-caption text-slate-500 mt-1">Last: {unit.lastTenant}</div>}
                      </>
                    ) : (
                      <>
                        <div className="text-caption text-emerald-700 font-semibold mt-2">Available now</div>
                        <div className="text-label font-bold text-emerald-700 mt-1">{formatCurrency(unit.rent)}/mo</div>
                        {unit.lastTenant && <div className="text-caption text-slate-500 mt-1">Last: {unit.lastTenant}</div>}
                      </>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => { setSelectedUnit(unit); setShowDetailModal(true); setLeaseError(''); }}
                        className="flex-1 min-w-[5.5rem] flex items-center justify-center gap-1 text-caption font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-control py-1.5 transition-colors border-0 cursor-pointer"
                      >
                        <FontAwesomeIcon icon={faEye} className="text-[9px]" /> Details
                      </button>
                      
                      {unit.status === 'vacant' && !unit.maintenanceFlag && (
                        <button
                          onClick={() => openAssignTenant(unit, setSelectedUnit, setAssignForm, emptyAssignForm, setShowAssignModal)}
                          className="flex-1 min-w-[5.5rem] flex items-center justify-center gap-1 text-caption font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-control py-1.5 transition-colors border-0 cursor-pointer"
                        >
                          <FontAwesomeIcon icon={faUserPlus} className="text-[9px]" /> Assign
                        </button>
                      )}

                      {unit.status === 'vacant' && !unit.maintenanceFlag && !unit.tenant && (
                        <button
                          type="button"
                          onClick={() => openSetMaintenance(unit)}
                          title={`Schedule maintenance for Unit ${unit.id}`}
                          className="flex-1 min-w-[5.5rem] flex items-center justify-center gap-1 text-caption font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-control py-1.5 transition-colors border-0 cursor-pointer"
                        >
                          <FontAwesomeIcon icon={faWrench} className="text-[9px]" /> Maintain
                        </button>
                      )}

                      {unit.maintenanceFlag && (
                        <button
                          type="button"
                          disabled={completingMaintenanceId === unit.id}
                          onClick={() => handleCompleteMaintenance(unit)}
                          title={`Mark maintenance for Unit ${unit.id} as finished`}
                          className="flex-1 min-w-[5.5rem] flex items-center justify-center gap-1 text-caption font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-control py-1.5 transition-colors border-0 cursor-pointer disabled:opacity-50"
                        >
                          <FontAwesomeIcon icon={completingMaintenanceId === unit.id ? faSpinner : faCheck} className={`text-[9px] ${completingMaintenanceId === unit.id ? 'animate-spin' : ''}`} />
                          {completingMaintenanceId === unit.id ? 'Saving…' : 'Complete'}
                        </button>
                      )}

                      {unit.status === 'vacant' && !unit.tenant && (
                        <button
                          type="button"
                          disabled={removingUnitId !== null}
                          onClick={() => promptRemoveUnit(unit)}
                          title={`Remove Unit ${unit.id} from active listings`}
                          className="flex-1 min-w-[5.5rem] flex items-center justify-center gap-1 text-caption font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-control px-2 py-1.5 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FontAwesomeIcon icon={faBoxArchive} className="text-[9px]" />
                          {removingUnitId === unit.id ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>}

          </div>
        </div>
      </main>

      {/* Add New Unit Modal */}
      {showAddModal && (
        <Modal busy={addUnitSubmitting} title="Add New Unit" onClose={closeAddModal} as="form" overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-md mx-4" onSubmit={handleAddUnit} noValidate>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-card bg-indigo-100 text-indigo-600 flex items-center justify-center"><FontAwesomeIcon icon={faBuilding} /></div>
                <div>
                  <h3 className="text-title font-bold text-slate-800 m-0">Add New Unit</h3>
                  <p className="text-label text-slate-500 m-0 mt-0.5">Create a new apartment unit</p>
                </div>
              </div>
              <button type="button" onClick={closeAddModal} aria-label="Close" className="btn-interactive text-slate-500 hover:text-slate-600 p-1 rounded-control hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 space-y-4">
              {addUnitError && (
                <div role="alert" className="text-label font-medium text-red-700 bg-red-50 border border-red-200 rounded-control px-3 py-2">{addUnitError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[['id', 'Unit Number *', 'e.g. 6A'], ['floor', 'Floor *', 'e.g. 6F']].map(([key, label, placeholder]) => (
                  <div key={key}>
                    <label htmlFor={`unit-${key}`} className="block text-label font-medium text-slate-600 mb-1 capitalize">{label}</label>
                    <input {...unitErrors.fieldA11y(key)} autoComplete="off" value={unitForm[key]} maxLength={LIMITS.unitId}
                      onChange={e => {
                        const next = { ...unitForm, [key]: e.target.value };
                        const rate = key === 'floor' ? floorRates[e.target.value.trim()] : undefined;
                        if (rate && !rentTyped) { next.rent = String(rate); unitErrors.clearError('rent'); }
                        setUnitForm(next); unitErrors.clearError(key);
                      }}
                      onBlur={() => { const v = unitForm[key].trim(); setUnitForm({ ...unitForm, [key]: v }); if (v) unitErrors.validateField(key, { ...unitForm, [key]: v }); }}
                      className={FIELD_CLS + invalidCls(unitErrors.errors[key])} placeholder={placeholder} />
                    <FieldError id={`unit-${key}`} error={unitErrors.errors[key]} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="unit-type" className="block text-label font-medium text-slate-600 mb-1">Type *</label>
                  <select {...unitErrors.fieldA11y('type')} value={unitForm.type} onChange={e => { setUnitForm({ ...unitForm, type: e.target.value }); unitErrors.clearError('type'); }} className={FIELD_CLS + invalidCls(unitErrors.errors.type)}>
                    {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <FieldError id="unit-type" error={unitErrors.errors.type} />
                </div>
                <div>
                  <label htmlFor="unit-rent" className="block text-label font-medium text-slate-600 mb-1 capitalize">Monthly Rent *{floorRates[unitForm.floor.trim()] ? <span className="normal-case font-normal text-slate-500"> (floor rent {floorRates[unitForm.floor.trim()]})</span> : null}</label>
                  <input type="number" {...unitErrors.fieldA11y('rent')} inputMode="decimal" min="0.01" max={MAX_AMOUNT} step="0.01" value={unitForm.rent}
                    onKeyDown={blockNonNumericKeys}
                    onChange={e => { setRentTyped(true); setUnitForm({ ...unitForm, rent: e.target.value }); unitErrors.clearError('rent'); }}
                    onBlur={() => unitForm.rent !== '' && unitErrors.validateField('rent', unitForm)}
                    className={FIELD_CLS + invalidCls(unitErrors.errors.rent)} placeholder="6500" />
                  <FieldError id="unit-rent" error={unitErrors.errors.rent} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-card">
              <button type="button" onClick={closeAddModal} className="px-4 py-2 text-body text-slate-600 font-medium hover:bg-slate-100 rounded-control border-0 bg-transparent cursor-pointer">Cancel</button>
              <button type="submit" disabled={addUnitSubmitting} className={btn('primary', 'md')}>{addUnitSubmitting ? 'Adding...' : 'Add Unit'}</button>
            </div>
          </Modal>
      )}

      {/* Assign Tenant Modal */}
      {showAssignModal && selectedUnit && (
        <Modal busy={assigning} title={`Assign Tenant to Unit ${selectedUnit.id}`} onClose={closeAssignModal} as="form" overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-md mx-4" onSubmit={handleAssignTenant} noValidate>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-card bg-emerald-100 text-emerald-700 flex items-center justify-center"><FontAwesomeIcon icon={faUserPlus} /></div>
                <div>
                  <div className="flex items-center gap-1">
                    <h3 className="text-title font-bold text-slate-800 m-0">Assign Tenant to Unit {selectedUnit.id}</h3>
                    <InfoTip label="What happens when you assign a tenant">
                      The unit is <strong>reserved</strong> and a move-in invoice (1 month advance rent + 1 month security deposit) is issued to the tenant. It becomes <strong>occupied</strong> when the move-in is confirmed after that invoice is paid.
                    </InfoTip>
                  </div>
                  <p className="text-label text-slate-500 m-0 mt-0.5">{selectedUnit.type} · {selectedUnit.floor} · {formatCurrency(selectedUnit.rent)}/mo</p>
                </div>
              </div>
              <button type="button" onClick={closeAssignModal} aria-label="Close" className="btn-interactive text-slate-500 hover:text-slate-600 p-1 rounded-control hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="assign-userId" className="block text-label font-semibold text-slate-700 mb-1.5">Tenant <span className="text-red-600" aria-hidden="true">*</span></label>
                <TenantPicker
                  users={users}
                  value={assignForm.userId}
                  unitId={selectedUnit.id}
                  invalid={!!assignErrors.errors.userId}
                  inputProps={assignErrors.fieldA11y('userId')}
                  onChange={(u) => {
                    setAssignForm({ ...assignForm, userId: String(u.id), tenantName: u.name });
                    assignErrors.clearError('userId');
                  }}
                />
                <FieldError id="assign-userId" error={assignErrors.errors.userId} />
                {!assignErrors.errors.userId && <p className="m-0 mt-1.5 text-caption text-slate-500">Only registered tenant accounts are listed. Someone who already rents or has an open application is shown but can't be picked.</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-label font-semibold text-slate-700">Rent period</span>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rent term">
                  {termOptions.map((m) => {
                    const on = assignForm.moveIn && assignForm.leaseEnd === addMonthsIso(assignForm.moveIn, m);
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={!assignForm.moveIn}
                        aria-pressed={!!on}
                        title={assignForm.moveIn ? `Rent end ${m} months after the move-in` : 'Pick the move-in date first'}
                        onClick={() => { setAssignForm({ ...assignForm, leaseEnd: addMonthsIso(assignForm.moveIn, m) }); assignErrors.clearError('leaseEnd'); setLeaseError(''); }}
                        className={`rounded-full border px-2.5 py-1 text-caption font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'}`}
                      >
                        {m} mo
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2!">
                <div>
                  <label htmlFor="assign-moveIn" className="block text-label font-medium text-slate-600 mb-1">Move-in Date *</label>
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
                    className={`w-full px-3 py-2.5 text-body border border-slate-200 rounded-control outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(assignErrors.errors.moveIn)}`} />
                  <FieldError id="assign-moveIn" error={assignErrors.errors.moveIn} />
                </div>
                <div>
                  <label htmlFor="assign-leaseEnd" className="block text-label font-medium text-slate-600 mb-1">Rent End *</label>
                  <input type="date" {...assignErrors.fieldA11y('leaseEnd')} min={assignForm.moveIn || localDateString()} max={maxFutureDate()} value={assignForm.leaseEnd}
                    onChange={e => { setAssignForm({ ...assignForm, leaseEnd: e.target.value }); assignErrors.clearError('leaseEnd'); setLeaseError(''); }}
                    onBlur={() => assignForm.leaseEnd && assignErrors.validateField('leaseEnd', assignForm)}
                    className={`w-full px-3 py-2.5 text-body border border-slate-200 rounded-control outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(assignErrors.errors.leaseEnd)}`} />
                  <FieldError id="assign-leaseEnd" error={assignErrors.errors.leaseEnd} />
                </div>
              </div>
              {assignForm.moveIn && assignForm.leaseEnd ? (() => {
                const months = monthsBetween(assignForm.moveIn, assignForm.leaseEnd);
                const ok = months >= minLeaseDuration;
                return (
                  <div className={`flex items-center gap-2 rounded-control border px-3 py-2 text-label ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    <FontAwesomeIcon icon={ok ? faCheckCircle : faExclamationTriangle} aria-hidden="true" />
                    <span><strong>{months} month{months === 1 ? '' : 's'}</strong>{ok ? '' : ` · the minimum is ${minLeaseDuration} months`}</span>
                  </div>
                );
              })() : (
                <p className="m-0 text-caption text-slate-500">The rent must run at least {minLeaseDuration} months.</p>
              )}
              {leaseError && (
                <div className="bg-red-50 border border-red-200 rounded-control p-3 flex items-start gap-2 text-label text-red-700">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-600 mt-0.5" />
                  {leaseError}
                </div>
              )}
              <label className={`flex items-start gap-3 rounded-control border px-3 py-2.5 text-label cursor-pointer transition-colors ${assignForm.identityVerified ? 'border-indigo-200 bg-indigo-50/60 text-slate-700' : assignErrors.errors.identityVerified ? 'border-red-300 bg-red-50/40 text-slate-600' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                <input
                  type="checkbox"
                  {...assignErrors.fieldA11y('identityVerified')}
                  checked={assignForm.identityVerified || false}
                  onChange={e => { setAssignForm({ ...assignForm, identityVerified: e.target.checked }); assignErrors.clearError('identityVerified'); }}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-control border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>I confirm this tenant's required documents have been verified in person, and they have agreed to the Terms &amp; Conditions.</span>
              </label>
              <FieldError id="assign-identityVerified" error={assignErrors.errors.identityVerified} />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-card">
              <button type="button" onClick={closeAssignModal} className="px-4 py-2 text-body text-slate-600 font-medium hover:bg-slate-100 rounded-control border-0 bg-transparent cursor-pointer">Cancel</button>
              <button type="submit" disabled={assigning} className={btn('success', 'md')}>{assigning ? 'Assigning…' : 'Assign Tenant'}</button>
            </div>
          </Modal>
      )}

      {/* Remove Unit Confirmation Modal */}
      {unitToRemove && (
        <Modal
          title={`Remove Unit ${unitToRemove.id}?`}
          onClose={closeRemoveModal}
          busy={removingUnitId !== null}
          overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          className="w-full max-w-md rounded-card bg-white p-6 shadow-dialog space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 text-base">
              <FontAwesomeIcon icon={faBoxArchive} />
            </div>
            <div className="space-y-1">
              <h3 className="text-title font-bold text-slate-800 m-0">Remove Unit {unitToRemove.id}?</h3>
              <p className="text-body text-slate-500 m-0">
                Are you sure you want to remove Unit <strong>{unitToRemove.id}</strong> from active listings?
              </p>
              <p className="text-label text-slate-400 m-0">
                This is allowed only for vacant units with no active tenancy or reservation. Historical records and logs will be retained.
              </p>
            </div>
          </div>

          {removeModalError && (
            <div role="alert" className="text-label font-medium text-red-700 bg-red-50 border border-red-200 rounded-control px-3.5 py-2.5">
              {removeModalError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={removingUnitId !== null}
              onClick={closeRemoveModal}
              className={btn('secondary', 'md')}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={removingUnitId !== null}
              onClick={confirmRemoveUnit}
              className={btn('danger', 'md')}
            >
              {removingUnitId !== null ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
                  <span>Removing…</span>
                </>
              ) : (
                'Yes, remove unit'
              )}
            </button>
          </div>
        </Modal>
      )}

      {/* Unit Detail Modal */}
      {showDetailModal && selectedUnit && (
        <UnitDetailModal
          unit={selectedUnit} onClose={() => { setShowDetailModal(false); setSelectedUnit(null); setShowExtendForm(false); setLeaseError(''); }}
          onAssign={() => { setShowDetailModal(false); setAssignForm({ ...emptyAssignForm, rent: String(selectedUnit.rent) }); setShowAssignModal(true); }}
          onRemove={() => promptRemoveUnit(selectedUnit)}
          onSetMaintenance={openSetMaintenance}
          onCompleteMaintenance={handleCompleteMaintenance}
          completingMaintenanceId={completingMaintenanceId}
          showExtendForm={showExtendForm} setShowExtendForm={setShowExtendForm} extendForm={extendForm} setExtendForm={setExtendForm} onExtendLease={handleExtendLease}
          extendConflict={extendConflict} overrideConflict={overrideConflict} setOverrideConflict={setOverrideConflict}
          minLeaseDuration={minLeaseDuration} rentCap={rentCap} leaseError={leaseError} setLeaseError={setLeaseError}
          extendErrors={extendErrors} extending={extending}
          onUpdateSuccess={fetchRooms}
        />
      )}

      {/* Set Under Maintenance Modal */}
      <SetUnderMaintenanceModal
        isOpen={maintenanceModalOpen}
        onClose={() => {
          setMaintenanceModalOpen(false);
          setMaintenanceTargetUnit(null);
        }}
        unit={maintenanceTargetUnit}
        onSuccess={async () => {
          await fetchRooms();
          if (selectedUnit && maintenanceTargetUnit && selectedUnit.id === maintenanceTargetUnit.id) {
            setSelectedUnit((prev) => ({
              ...prev,
              maintenanceFlag: true,
              availableDate: prev?.availableDate || null,
            }));
          }
        }}
      />
    </div>
  );
};

/* ─── Unit Detail Tabbed Modal Sub-Component ─── */
const UnitDetailModal = ({ unit, onClose, onAssign, onRemove, onSetMaintenance, onCompleteMaintenance, completingMaintenanceId, showExtendForm, setShowExtendForm, extendForm, setExtendForm, onExtendLease, extendConflict, overrideConflict, setOverrideConflict, minLeaseDuration, rentCap, leaseError, setLeaseError, extendErrors, extending, onUpdateSuccess }) => {
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
    if (!(await askConfirm('Remove this showcase image?'))) return;
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

  // Edits a photo's description / display option locally; the description is saved on blur.
  const editGalleryItem = (path, patch) => setGalleryImages((items) => items.map((it) => (it.path === path ? { ...it, ...patch } : it)));

  const saveGalleryItem = async (path, patch = {}) => {
    const current = galleryImages.find((it) => it.path === path);
    if (!current) return;
    const next = { ...current, ...patch };
    setGalleryError('');
    try {
      const res = await api.post('update_room_image.php', { room_id: unit.id, path, alt: next.alt, fit: next.fit });
      if (res.data.success) {
        setGalleryImages(res.data.gallery);
        if (onUpdateSuccess) onUpdateSuccess();
      } else {
        setGalleryError(res.data.message || 'Failed to save image details.');
      }
    } catch (err) {
      setGalleryError(err.response?.data?.message || 'Failed to save image details.');
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

  const remaining = daysRemaining(unit.leaseEnd);
  const totalDays = unit.leaseStart && unit.leaseEnd ? Math.ceil((new Date(unit.leaseEnd) - new Date(unit.leaseStart)) / (1000 * 60 * 60 * 24)) : 0;
  const elapsed = totalDays - (remaining || 0);
  const progressPct = totalDays > 0 ? Math.min(100, Math.max(0, (elapsed / totalDays) * 100)) : 0;
  const extensionCount = (unit.leaseHistory || []).filter((l) => l.event === 'Rent Extended').length;
  const tabs = [
    { key: 'overview', label: 'Overview', icon: faLayerGroup },
    { key: 'gallery', label: 'Gallery', icon: faImages, count: galleryImages.length },
    { key: 'occupancy', label: 'Occupancy', icon: faUser },
    { key: 'occupancyHistory', label: 'Occupancy History', icon: faHistory, count: (unit.occupancyHistory || []).length },
    { key: 'extensions', label: 'Extensions', icon: faCalendarAlt, count: extensionCount },
    { key: 'maintenance', label: 'Maintenance', icon: faWrench, count: (unit.maintenanceHistory || []).length },
  ];
  // Who is in (or holding) the unit: the profile from get_rooms.php, else the name on the room.
  const person = unit.tenantProfile || (unit.tenant ? { name: unit.tenant } : null);
  const remainingTone = remaining === null ? 'text-slate-500' : remaining <= 30 ? 'text-red-600' : remaining <= 90 ? 'text-amber-700' : 'text-emerald-700';
  const barTone = remaining !== null && remaining <= 30 ? 'bg-red-500' : remaining !== null && remaining <= 90 ? 'bg-amber-400' : 'bg-indigo-500';


  return (
    <Modal title={`Unit ${unit.id}`} onClose={onClose} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 bg-slate-50">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-12 h-12 shrink-0 rounded-card flex items-center justify-center text-white font-bold text-title shadow-raised ${unit.status === 'occupied' ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : unit.status === 'reserved' ? 'bg-gradient-to-br from-violet-500 to-violet-700' : 'bg-gradient-to-br from-amber-400 to-amber-600'}`}>
              {unit.id}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-title font-bold text-slate-800 m-0">Unit {unit.id}</h3>
                <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ring-1 ring-inset ${unitStatePill(unit).cls}`}>{unitStatePill(unit).label}</span>
              </div>
              <p className="text-label text-slate-500 m-0 mt-0.5">{unit.type} · {floorName(unit.floor)} · {formatCurrency(unit.rent)}/mo</p>
            </div>
          </div>
          <button aria-label="Close" onClick={onClose} className="btn-interactive shrink-0 text-slate-500 hover:text-slate-600 p-1 rounded-control hover:bg-slate-100 border-0 bg-transparent cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
        </div>

        <div className="flex border-b border-slate-200 px-3 shrink-0 bg-white overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-label font-medium border-b-2 transition-all -mb-px border-t-0 border-x-0 bg-transparent cursor-pointer whitespace-nowrap ${activeTab === tab.key ? 'text-indigo-600 border-b-indigo-600 font-bold' : 'text-slate-500 border-b-transparent hover:text-slate-600'}`}
            >
              <FontAwesomeIcon icon={tab.icon} className="text-[10px]" /> {tab.label}
              {tab.count > 0 && (
                <span className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {person && (unit.status === 'occupied' || unit.status === 'reserved') ? (
                <section aria-label={unit.status === 'reserved' ? 'Reserved for' : 'Current tenant'} className={`rounded-card border p-4 ${unit.status === 'reserved' ? 'border-violet-200 bg-violet-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
                  <div className="flex flex-wrap items-center gap-4">
                    <PersonAvatar name={person.name} src={person.avatar} size="lg" ring />
                    <div className="min-w-0 flex-1">
                      <p className={`m-0 text-caption font-semibold ${unit.status === 'reserved' ? 'text-violet-700' : 'text-emerald-700'}`}>{unit.status === 'reserved' ? 'Reserved for' : 'Current tenant'}</p>
                      <p className="m-0 text-title font-bold text-slate-900 truncate">{person.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-label text-slate-600">
                        {person.email && (
                          <a href={`mailto:${person.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-slate-600 no-underline hover:text-indigo-700">
                            <FontAwesomeIcon icon={faEnvelope} className="text-[11px] text-slate-400" aria-hidden="true" /><span className="truncate">{person.email}</span>
                          </a>
                        )}
                        {person.phone && (
                          <a href={`tel:${String(person.phone).replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 text-slate-600 no-underline hover:text-indigo-700">
                            <FontAwesomeIcon icon={faPhone} className="text-[11px] text-slate-400" aria-hidden="true" />{person.phone}
                          </a>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faUsers} className="text-[11px] text-slate-400" aria-hidden="true" />{unit.occupants || 0} occupant{unit.occupants === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {unit.leaseStart && unit.leaseEnd && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-2 text-caption text-slate-500 mb-1.5">
                        <span>{fmtDay(unit.leaseStart)}</span>
                        <span className={`font-semibold ${remainingTone}`}>{remaining > 0 ? `${remaining} days left` : 'Rent ended'}</span>
                        <span>{fmtDay(unit.leaseEnd)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white shadow-inner" role="progressbar" aria-label="Rent period elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPct)}>
                        <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <section className={`rounded-card border p-4 flex flex-wrap items-center justify-between gap-3 ${unit.maintenanceFlag ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className={`flex h-10 w-10 items-center justify-center rounded-full ${unit.maintenanceFlag ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                      <FontAwesomeIcon icon={unit.maintenanceFlag ? faWrench : faDoorOpen} />
                    </span>
                    <div>
                      <p className="text-body font-semibold text-slate-800 m-0">{unit.maintenanceFlag ? 'Under maintenance' : 'Vacant and available'}</p>
                      <p className="text-label text-slate-500 m-0 mt-0.5">
                        {unit.maintenanceFlag
                          ? `Ready by ${unit.availableDate ? fmtDay(unit.availableDate) : 'a date not set yet'}`
                          : unit.lastTenant ? `Last tenant: ${unit.lastTenant}` : 'No tenant yet'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!unit.maintenanceFlag && unit.status === 'vacant' && (
                      <button onClick={onAssign} className={btn('success', 'sm')}><FontAwesomeIcon icon={faUserPlus} /> Assign Tenant</button>
                    )}
                    {!unit.maintenanceFlag && unit.status === 'vacant' && !unit.tenant && onSetMaintenance && (
                      <button
                        type="button"
                        onClick={() => onSetMaintenance(unit)}
                        className={btn('secondary', 'sm', 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100')}
                      >
                        <FontAwesomeIcon icon={faWrench} /> Set Under Maintenance
                      </button>
                    )}
                    {unit.maintenanceFlag && onCompleteMaintenance && (
                      <button
                        type="button"
                        disabled={completingMaintenanceId === unit.id}
                        onClick={() => onCompleteMaintenance(unit)}
                        className={btn('success', 'sm')}
                      >
                        <FontAwesomeIcon icon={completingMaintenanceId === unit.id ? faSpinner : faCheck} className={completingMaintenanceId === unit.id ? 'animate-spin' : ''} />
                        {completingMaintenanceId === unit.id ? 'Saving…' : 'Complete Maintenance'}
                      </button>
                    )}
                    {unit.status === 'vacant' && !unit.tenant && onRemove && (
                      <button type="button" onClick={onRemove} className={btn('danger-outline', 'sm')}><FontAwesomeIcon icon={faBoxArchive} /> Remove Unit</button>
                    )}
                  </div>
                </section>
              )}

              <dl className="m-0 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <DetailField icon={faLayerGroup} label="Type" value={unit.type} />
                <DetailField icon={faStairs} label="Floor" value={floorName(unit.floor)} />
                <DetailField icon={faPesoSign} label="Monthly rent" value={`${formatCurrency(unit.rent)}`} />
                <DetailField icon={faClipboardCheck} label="Condition" value={unit.roomCondition || 'Good'} tone={['Poor', 'Needs Repair', 'Under Maintenance'].includes(unit.roomCondition) ? 'amber' : 'emerald'} />
                <DetailField icon={faCouch} label="Furnishing" value={unit.furnishingStatus || 'Unfurnished'} />
                <DetailField icon={faCalendarAlt} label="Last inspected" value={unit.lastInspectionDate ? fmtDay(unit.lastInspectionDate) : 'Never'} />
              </dl>

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
                    className="btn-interactive flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-control text-label font-semibold border-0 cursor-pointer transition-colors"
                  >
                    <FontAwesomeIcon icon={faWrench} className="text-[10px]" /> Update Status & Inspection Details
                  </button>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-card p-4 space-y-4 text-left">
                    <h4 className="text-label font-bold text-slate-700 m-0">Edit Unit Status Monitoring</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-label font-medium text-slate-600 mb-1">Room Condition</label>
                        <select 
                          value={editCondition} 
                          onChange={e => setEditCondition(e.target.value)}
                          className="w-full px-2 py-1.5 text-label border border-slate-200 rounded-control outline-none bg-white text-slate-800"
                        >
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                          <option value="Poor">Poor</option>
                          <option value="Needs Repair">Needs Repair</option>
                          <option value="Under Maintenance">Under Maintenance</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-label font-medium text-slate-600 mb-1">Furnishing Status</label>
                        <select 
                          value={editFurnishing} 
                          onChange={e => setEditFurnishing(e.target.value)}
                          className="w-full px-2 py-1.5 text-label border border-slate-200 rounded-control outline-none bg-white text-slate-800"
                        >
                          <option value="Unfurnished">Unfurnished</option>
                          <option value="Semi-Furnished">Semi-Furnished</option>
                          <option value="Fully Furnished">Fully Furnished</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="monitor-inspection" className="block text-label font-medium text-slate-600 mb-1">Last Inspection Date</label>
                        <input
                          type="date"
                          id="monitor-inspection"
                          name="last_inspection_date"
                          min={addYears(-10)}
                          max={localDateString()}
                          value={editInspectionDate}
                          onChange={e => setEditInspectionDate(e.target.value)}
                          className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap w-full ring-slate-200 outline-none bg-white text-slate-800 ring-1 ring-inset"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button 
                        onClick={handleSaveMonitoring} 
                        disabled={isUpdating}
                        className={btn('primary', 'sm')}
                      >
                        {isUpdating ? 'Saving...' : 'Save Monitoring'}
                      </button>
                      <button 
                        onClick={() => setShowStatusEdit(false)} 
                        className="px-3.5 py-1.5 text-label text-slate-600 hover:bg-white rounded-control border-0 bg-transparent cursor-pointer"
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
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="m-0 text-body font-bold text-slate-800">Showcase photos</h3>
                  <span className="text-caption font-semibold text-slate-500 tabular-nums">{galleryImages.length} / 8</span>
                  <InfoTip label="About showcase photos">
                    Shown to guests on the public Preview page. Rooms with no images hide the "View Layout" button entirely (max 8 images). Add a description for each photo (used as its caption and for screen readers) and choose Fill (crop to the frame), Fit (show the whole photo) or Wide (panoramic frame).
                  </InfoTip>
                </div>
                <label className={`btn-interactive shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-control text-label font-semibold border-0 cursor-pointer transition-colors ${galleryImages.length >= 8 || isUploadingImages ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
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
                <div className="bg-red-50 border border-red-200 rounded-control p-3 flex items-start gap-2 text-label text-red-700">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-600 mt-0.5" />
                  {galleryError}
                </div>
              )}

              {galleryImages.length === 0 ? (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faImages} className="text-slate-300 text-4xl mb-3 mx-auto block" />
                  <p className="text-body text-slate-500 m-0">No showcase images uploaded for this unit yet.</p>
                </div>
              ) : (
                <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {galleryImages.map((item) => (
                    <div key={item.path} className="card-interactive rounded-card overflow-hidden border border-slate-200 bg-white">
                      <div className={`relative group bg-slate-100 ${item.fit === 'wide' ? 'aspect-[21/9]' : 'aspect-[4/3]'}`}>
                        <img src={publicAssetUrl(item.path)} alt={item.alt || `Unit ${unit.id} showcase`} className={`w-full h-full ${item.fit === 'fit' ? 'object-contain' : 'object-cover'}`} />
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(item.path)}
                          disabled={deletingImagePath === item.path}
                          className="btn-interactive absolute top-1.5 right-1.5 w-7 h-7 rounded-control bg-black/60 hover:bg-red-600 text-white flex items-center justify-center border-0 cursor-pointer transition-colors disabled:opacity-50"
                          title="Remove image"
                          aria-label="Remove image"
                        >
                          <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
                        </button>
                      </div>
                      <div className="p-2.5 space-y-2">
                        <label className="block text-caption font-semibold text-slate-600">
                          Description (read aloud by screen readers)
                          <input
                            type="text"
                            maxLength={200}
                            value={item.alt}
                            placeholder="e.g. Studio with a window and a double bed"
                            onChange={(e) => editGalleryItem(item.path, { alt: e.target.value })}
                            onBlur={() => saveGalleryItem(item.path)}
                            className="mt-1 w-full rounded-control border border-slate-300 px-2.5 py-1.5 text-label font-normal"
                          />
                        </label>
                        <div role="group" aria-label="Display size" className="flex gap-1">
                          {[['fill', 'Fill'], ['fit', 'Fit'], ['wide', 'Wide']].map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={item.fit === value}
                              onClick={() => { editGalleryItem(item.path, { fit: value }); saveGalleryItem(item.path, { fit: value }); }}
                              className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap flex-1 cursor-pointer ${item.fit === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                            >{label}</button>
                          ))}
                        </div>
                      </div>
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
                  <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-card p-5 border border-indigo-100">
                    <div className="flex items-center gap-3 mb-4">
                      <PersonAvatar name={person?.name || unit.tenant} src={person?.avatar} size="md" ring />
                      <div className="min-w-0">
                        <p className="m-0 text-body font-bold text-slate-900 truncate">{person?.name || unit.tenant}</p>
                        <p className="m-0 text-caption text-slate-500">Rent progress</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-4">
                      <div className="rounded-control bg-white/70 py-2"><p className="text-section font-bold text-slate-800 m-0">{unit.occupants || 0}</p><p className="text-caption text-slate-500 m-0 mt-0.5">Occupants</p></div>
                      <div className="rounded-control bg-white/70 py-2"><p className="text-section font-bold text-slate-800 m-0">{elapsed > 0 ? elapsed : 0}</p><p className="text-caption text-slate-500 m-0 mt-0.5">Days elapsed</p></div>
                      <div className="rounded-control bg-white/70 py-2"><p className={`text-section font-bold m-0 ${remainingTone}`}>{remaining > 0 ? remaining : 0}</p><p className="text-caption text-slate-500 m-0 mt-0.5">Days left</p></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-caption text-slate-500 mb-1"><span>{fmtDay(unit.leaseStart)}</span><span>{fmtDay(unit.leaseEnd)}</span></div>
                      <div className="w-full h-2 bg-white rounded-full overflow-hidden shadow-inner"><div className={`h-full rounded-full transition-all ${remaining <= 30 ? 'bg-red-500' : remaining <= 90 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${progressPct}%` }} /></div>
                    </div>
                  </div>
                  {!showExtendForm ? (
                    <button onClick={() => { setShowExtendForm(true); setLeaseError(''); extendErrors.setErrors({}); }} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-control text-body font-semibold hover:bg-indigo-100 transition-colors border-dashed cursor-pointer"><FontAwesomeIcon icon={faSync} /> Extend Rent / Adjust Rent</button>
                  ) : (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-card p-4 space-y-3">
                      <h4 className="text-body font-semibold text-slate-800 m-0">Extend Rent</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="extend-addMonths" className="block text-label font-medium text-slate-600 mb-1">Months to Add *</label>
                          <input type="number" {...extendErrors.fieldA11y('addMonths')} inputMode="numeric" min={unit.extensionRange?.min || Math.min(MAX_EXTENSION_MONTHS, minLeaseDuration)} max={Math.max(1, unit.extensionRange?.max ?? MAX_EXTENSION_MONTHS)} step="1" value={extendForm.addMonths}
                            onKeyDown={blockNonNumericKeys}
                            onChange={e => { setExtendForm({ ...extendForm, addMonths: e.target.value }); extendErrors.clearError('addMonths'); setLeaseError(''); }}
                            onBlur={() => extendForm.addMonths !== '' && extendErrors.validateField('addMonths', extendForm)}
                            className={`w-full px-3 py-2 text-body border border-slate-200 rounded-control outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(extendErrors.errors.addMonths)}`}
                            placeholder={`${Math.min(MAX_EXTENSION_MONTHS, minLeaseDuration)}–${MAX_EXTENSION_MONTHS}`} />
                          <FieldError id="extend-addMonths" error={extendErrors.errors.addMonths} />
                        </div>
                        <div>
                          <label htmlFor="extend-newRent" className="block text-label font-medium text-slate-600 mb-1">New Rent (optional)</label>
                          <input type="number" {...extendErrors.fieldA11y('newRent')} inputMode="decimal" min="0.01" max={MAX_AMOUNT} step="0.01" value={extendForm.newRent}
                            onKeyDown={blockNonNumericKeys}
                            onChange={e => { setExtendForm({ ...extendForm, newRent: e.target.value }); extendErrors.clearError('newRent'); }}
                            onBlur={() => extendErrors.validateField('newRent', extendForm)}
                            className={`w-full px-3 py-2 text-body border border-slate-200 rounded-control outline-none focus:border-indigo-500 text-slate-800 bg-white${invalidCls(extendErrors.errors.newRent)}`} placeholder={String(unit.rent)} />
                          <FieldError id="extend-newRent" error={extendErrors.errors.newRent} />
                          {rentCap && Number(unit.rent) > 0 && Number(unit.rent) <= rentCap.maxCovered && (
                            <p className="m-0 mt-1 text-caption text-slate-500">
                              Rent control (RA 9653): at most +{rentCap.percent}% a year for the same tenant, about ₱{(Math.floor(Number(unit.rent) * (1 + rentCap.percent / 100) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}.
                            </p>
                          )}
                        </div>
                      </div>
                      {Number(extendForm.addMonths) > 0 && (
                        <div className="text-label text-slate-500 bg-white rounded-control p-2 border border-slate-100">
                          New rent end: <strong>{addMonthsTo(unit.leaseEnd, extendForm.addMonths) || '—'}</strong> · The added months are billed a week before each starts. Refused while the tenant has overdue bills or a scheduled move-out.
                        </div>
                      )}
                      {leaseError && (
                        <div className="bg-red-50 border border-red-200 rounded-control p-3 flex items-start gap-2 text-label text-red-700">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-600 mt-0.5" />
                          {leaseError}
                        </div>
                      )}
                      {extendConflict?.applications?.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-control p-3 text-label text-amber-800 space-y-2">
                          <p className="m-0 font-semibold">Other applicants want this unit before the new rent end:</p>
                          <ul className="m-0 pl-5">
                            {extendConflict.applications.map(a => (
                              <li key={a.id}>{a.name} (application #{a.id}, {a.status}) {a.moveInDate ? `from ${a.moveInDate}` : 'as soon as it is free'}</li>
                            ))}
                          </ul>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={overrideConflict} onChange={e => setOverrideConflict(e.target.checked)} className="mt-0.5" />
                            <span>Extend anyway and tell them the unit is occupied until the new end. Their applications stay open for you to decide.</span>
                          </label>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button type="button" onClick={onExtendLease} disabled={extending} className={btn('primary', 'sm')}>{extending ? 'Saving…' : 'Confirm Extension'}</button>
                        <button type="button" onClick={() => { setShowExtendForm(false); setLeaseError(''); extendErrors.setErrors({}); }} className="px-4 py-2 text-body text-slate-600 hover:bg-white rounded-control border-0 bg-transparent cursor-pointer">Cancel</button>
                      </div>

                      {/* Previous Extensions Table */}
                      {unit.leaseHistory && unit.leaseHistory.filter(l => l.event === 'Rent Extended').length > 0 && (
                        <div className="mt-3 pt-3 border-t border-indigo-100">
                          <h5 className="text-label font-medium text-slate-600 mb-2 m-0">Previous Extensions</h5>
                          <div className="space-y-1.5">
                            {unit.leaseHistory.filter(l => l.event === 'Rent Extended').map((ext, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white rounded-control p-2 border border-slate-100 text-label">
                                <div>
                                  <span className="text-slate-600 font-semibold">{ext.oldEnd} → {ext.newEnd}</span>
                                  <span className="text-slate-500 ml-2">({ext.detail})</span>
                                </div>
                                <span className="text-caption text-slate-500">{ext.date}</span>
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
                  <p className="text-body text-slate-500 m-0">This unit is currently vacant.</p>
                </div>
              )}
            </div>
          )}

          {/* Extensions Tab: every rent extension recorded for this unit, across tenants */}
          {activeTab === 'extensions' && (
            <div className="space-y-4">
              <h4 className="text-body font-bold text-slate-700 m-0 flex items-center gap-2">
                <FontAwesomeIcon icon={faCalendarAlt} className="text-indigo-500" aria-hidden="true" />
                Rent Extensions for This Unit
              </h4>
              {(() => {
                const extensions = (unit.leaseHistory || []).filter((l) => l.event === 'Rent Extended');
                if (extensions.length === 0) {
                  return <p className="text-body text-slate-600 m-0">No rent extension has been recorded for this unit.</p>;
                }
                return (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {[...extensions].reverse().map((ext, idx) => (
                      <li key={idx} className="rounded-control border border-slate-200 bg-white p-3 text-label">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">{ext.tenant || 'Tenant'}</span>
                          <span className="text-caption text-slate-600">{fmtDay(ext.date)}</span>
                        </div>
                        <p className="m-0 mt-1 text-slate-700">{fmtDay(ext.oldEnd)} → {fmtDay(ext.newEnd)} <span className="text-slate-600">({ext.addedMonths} month{ext.addedMonths === 1 ? '' : 's'} added)</span></p>
                        {ext.previousRent != null && ext.rentAtRenewal != null && (
                          <p className="m-0 mt-0.5 text-slate-600">
                            Rent {ext.previousRent === ext.rentAtRenewal ? `unchanged at ${formatCurrency(ext.rentAtRenewal)}` : `${formatCurrency(ext.previousRent)} → ${formatCurrency(ext.rentAtRenewal)}`}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          )}

          {/* Occupancy History Tab */}
          {activeTab === 'occupancyHistory' && (
            <div className="space-y-4">
              <h4 className="text-body font-bold text-slate-700 m-0 flex items-center gap-2">
                <FontAwesomeIcon icon={faHistory} className="text-indigo-500" />
                All Tenants Who Occupied This Unit
              </h4>
              {unit.occupancyHistory && unit.occupancyHistory.length > 0 ? (
                <div className="stagger-children space-y-3">
                  {[...unit.occupancyHistory].reverse().map((occ, idx) => {
                    const duration = monthsBetween(occ.leaseStart, occ.leaseEnd);
                    return (
                      <div key={idx} className={`card-interactive rounded-card p-4 border ${occ.status === 'current' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <PersonAvatar name={occ.tenant} src={occ.avatar} size="md" tone={occ.status === 'current' ? 'emerald' : 'slate'} ring />
                            <div className="min-w-0">
                              <p className="text-body font-semibold text-slate-800 m-0 truncate">{occ.tenant}</p>
                              <p className="text-caption text-slate-500 m-0 truncate">
                                {occ.status === 'current' ? 'Current tenant' : 'Past tenant'}
                                {occ.email ? ` · ${occ.email}` : ''}
                              </p>
                            </div>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap capitalize ${occ.status === 'current' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                            {occ.status === 'current' ? 'Active' : 'Ended'}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-label">
                          <div><span className="text-slate-500">Period:</span> <span className="font-semibold text-slate-700">{occ.leaseStart ? `${fmtDay(occ.leaseStart)} → ${fmtDay(occ.leaseEnd)}` : '—'}</span></div>
                          <div><span className="text-slate-500">Duration:</span> <span className="font-semibold text-slate-700">{duration} months</span></div>
                          <div><span className="text-slate-500">Rent:</span> <span className="font-bold text-indigo-600">{formatCurrency(occ.rent)}</span></div>
                        </div>
                        {occ.moveOutReason && (
                          <div className="mt-2 text-caption text-slate-500 bg-white rounded-control px-2.5 py-1.5 border border-slate-100">
                            Move-out reason: <strong>{occ.moveOutReason}</strong>
                          </div>
                        )}
                        {occ.extensions?.length > 0 && (
                          <div className="mt-2 bg-white rounded-control px-2.5 py-2 border border-slate-100">
                            <p className="text-label font-medium text-amber-700 m-0 mb-1">Extensions</p>
                            <div className="space-y-1">
                              {occ.extensions.map((ext, i) => (
                                <div key={i} className="flex flex-wrap items-center gap-2 text-caption">
                                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-control font-medium">{fmtDay(ext.oldEnd)}</span>
                                  <FontAwesomeIcon icon={faChevronRight} className="text-slate-400 text-[8px]" aria-hidden="true" />
                                  <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-control font-semibold">{fmtDay(ext.newEnd)}</span>
                                  <span className="text-slate-500">+{ext.addedMonths} month{ext.addedMonths === 1 ? '' : 's'}</span>
                                  {ext.date && <span className="text-slate-500 ml-auto">Approved {fmtDay(ext.date)}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {occ.deposit && (
                          <DepositOutcome deposit={occ.deposit} />
                        )}
                        {/* The current stay: how far through the rent period it is. */}
                        {occ.status === 'current' && occ.leaseStart && occ.leaseEnd && (() => {
                          const span = new Date(occ.leaseEnd) - new Date(occ.leaseStart);
                          const pct = span > 0 ? Math.min(100, Math.max(0, ((Date.now() - new Date(occ.leaseStart)) / span) * 100)) : 100;
                          return (
                            <div className="mt-3">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                              </div>
                              <p className="m-0 mt-1 text-right text-caption text-slate-500">{Math.round(pct)}% of the rent period</p>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faUser} className="text-slate-300 text-3xl mb-3 block mx-auto" />
                  <p className="text-body text-slate-500 m-0">No occupancy history. This unit has never been rented.</p>
                </div>
              )}
            </div>
          )}


          {activeTab === 'history' && (
            <div className="space-y-3">
              {[...unit.history].reverse().map((entry, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-control border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 text-label"><FontAwesomeIcon icon={faHistory} /></div>
                  <div className="flex-1">
                    <p className="text-body font-medium text-slate-800 m-0">{entry.event}</p>
                    <p className="text-caption text-slate-500 m-0 mt-0.5">{entry.detail}</p>
                  </div>
                  <span className="text-caption text-slate-500 shrink-0">{entry.date}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="stagger-children space-y-4">
              {/* Active Maintenance Status Banner */}
              {unit.maintenanceFlag ? (
                <div className="bg-amber-50 border border-amber-300 rounded-card p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-body font-bold text-amber-800 flex items-center gap-2">
                      <FontAwesomeIcon icon={faWrench} /> Active Maintenance in Progress
                    </div>
                    <div className="text-label text-amber-700 mt-1">
                      Target Completion / Coming Soon: <strong>{unit.availableDate ? new Date(unit.availableDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unspecified'}</strong>
                    </div>
                    <div className="text-caption text-slate-500 mt-0.5">
                      Units under maintenance transition to "Coming Soon" with no tenants allowed until finished.
                    </div>
                  </div>
                  {onCompleteMaintenance && (
                    <button
                      type="button"
                      disabled={completingMaintenanceId === unit.id}
                      onClick={() => onCompleteMaintenance(unit)}
                      className={btn('success', 'sm')}
                    >
                      <FontAwesomeIcon icon={completingMaintenanceId === unit.id ? faSpinner : faCheck} className={completingMaintenanceId === unit.id ? 'animate-spin' : ''} />
                      {completingMaintenanceId === unit.id ? 'Saving…' : 'Mark Completed'}
                    </button>
                  )}
                </div>
              ) : unit.status === 'vacant' && !unit.tenant && onSetMaintenance ? (
                <div className="bg-slate-50 border border-slate-200 rounded-card p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-body font-bold text-slate-800">Schedule Unit Maintenance</div>
                    <div className="text-label text-slate-500 mt-0.5">This unit is vacant and available to be scheduled for renovation or repairs.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetMaintenance(unit)}
                    className={btn('secondary', 'sm', 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100')}
                  >
                    <FontAwesomeIcon icon={faWrench} /> Set Under Maintenance
                  </button>
                </div>
              ) : null}

              {unit.maintenanceHistory && unit.maintenanceHistory.length > 0 ? (
                <>
                  {/* Cost summary */}
                  <div className="bg-amber-50 border border-amber-100 rounded-control p-3 flex items-center justify-between">
                    <span className="text-label font-semibold text-amber-800">Total Maintenance Cost for This Unit</span>
                    <span className="text-body font-bold text-amber-700">{formatCurrency(unit.maintenanceHistory.reduce((sum, m) => sum + (m.cost || 0), 0))}</span>
                  </div>
                  {[...unit.maintenanceHistory].reverse().map((entry, idx) => (
                    <div key={idx} className="card-interactive flex items-start gap-3 p-3 bg-slate-50 rounded-control border border-slate-100">
                      <div className={`w-8 h-8 rounded-full ${entry.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} flex items-center justify-center shrink-0 mt-0.5 text-label`}><FontAwesomeIcon icon={faWrench} /></div>
                      <div className="flex-1">
                        <p className="text-body font-medium text-slate-800 m-0">{entry.issue}</p>
                        <p className="text-caption text-slate-500 m-0 mt-0.5">Status: {entry.status} {entry.cost ? `· Cost: ${formatCurrency(entry.cost)}` : ''}</p>
                      </div>
                      <span className="text-caption text-slate-500 shrink-0">{entry.date}</span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-8 text-slate-500 text-body">No maintenance history for this unit.</div>
              )}
            </div>
          )}

        </div>
      </Modal>
  );
};

const DetailField = ({ label, value, icon, tone }) => (
  <div className="rounded-control border border-slate-200 bg-white px-3 py-2.5">
    <dt className="m-0 flex items-center gap-1.5 text-caption font-medium text-slate-500">
      {icon && <FontAwesomeIcon icon={icon} className="text-[10px] text-slate-400" aria-hidden="true" />}
      {label}
    </dt>
    <dd className={`m-0 mt-0.5 text-body font-semibold ${tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-800'}`}>{value || '—'}</dd>
  </div>
);

export default AdminUnits;