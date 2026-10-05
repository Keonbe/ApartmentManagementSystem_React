import { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faTimes, faUser, faCalendarAlt,
  faExclamationTriangle, faCheckCircle, faEye,
  faArchive, faDollarSign, faWrench, faFileAlt,
  faSignOutAlt, faClipboardCheck
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, MAX_AMOUNT, addDays, checkAmount, checkDate, checkText } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import CharCount from '../Components/form/CharCount';
import { blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';

// update_tenant_status.php: a scheduled move-out is 15–30 days ahead.
const MOVE_OUT_MIN_DAYS = 15;
const MOVE_OUT_MAX_DAYS = 30;
const money = (v) => Number(v) || 0;
import { fileUrl } from '../api/fileUrl';
import AdminHouseholdList from '../Components/AdminHouseholdList';

// ==========================================
// MOCK DATA FOR ARCHIVED TENANTS & HISTORY
// ==========================================
const initialArchivedTenants = [];

const archiveReasons = ['End of Rent Term', 'Personal Reasons', 'Relocated', 'Financial Hardship', 'Evicted', 'Other'];

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
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'unit'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'

  const [invoices, setInvoices] = useState([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState([]);
  const [contracts, setContracts] = useState([]);

  // Archive workflow states
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState('End of Rent Term');
  const [archiveNotes, setArchiveNotes] = useState('');

  // Move out scheduling states
  const [showMoveOutModal, setShowMoveOutModal] = useState(false);
  const [moveOutTarget, setMoveOutTarget] = useState(null);
  const [moveOutDate, setMoveOutDate] = useState('');

  // Move-out inspection & clearance states
  const [showClearanceModal, setShowClearanceModal] = useState(false);
  const [clearanceTarget, setClearanceTarget] = useState(null);
  const [damageDeduction, setDamageDeduction] = useState(0);
  const [damageNotes, setDamageNotes] = useState('');
  const [utilityDeduction, setUtilityDeduction] = useState(0);

  const fetchInvoices = async () => {
    try {
      const res = await api.get('/get_invoices.php');
      if (res.data.success) {
        setInvoices(res.data.invoices);
      }
    } catch (err) {
      console.error("Error fetching invoices:", err);
    }
  };

  const fetchMaintenanceRequests = async () => {
    try {
      const res = await api.get('/get_maintenance_requests.php');
      if (res.data.success) {
        setMaintenanceRequests(res.data.requests || res.data.maintenance || []);
      }
    } catch (err) {
      console.error("Error fetching maintenance requests:", err);
    }
  };

  const fetchContracts = async () => {
    try {
      const res = await api.get('/get_contracts.php');
      if (res.data.success) {
        setContracts(res.data.contracts);
      }
    } catch (err) {
      console.error("Error fetching contracts:", err);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await api.get('/get_tenants.php');
      if (res.data.success) {
        const allApplications = res.data.data.filter(t => t.status !== 'Pending Review' && t.status !== 'Rejected');
        const dbActive = allApplications.filter(t => t.status !== 'archived');
        const dbArchived = allApplications.filter(t => t.status === 'archived');
        setTenants(dbActive);
        setArchivedTenants(dbArchived);
      }
    } catch (err) {
      console.error("Error fetching tenants:", err);
    }
  };

  useEffect(() => {
    const load = async () => { await Promise.all([fetchTenants(), fetchInvoices(), fetchMaintenanceRequests(), fetchContracts()]); };
    load();
  }, []);

  const openClearanceModal = (tenant) => {
    setClearanceTarget(tenant);
    setDamageDeduction(0);
    setDamageNotes('');
    setUtilityDeduction(0);
    setShowProfileModal(false);
    tenantForms.setErrors({});
    setShowClearanceModal(true);
  };

  // One hook for the archive, move-out and clearance modals; each submit
  // checks only its own fields. Keys match the endpoints' body fields.
  const [savingAction, setSavingAction] = useState('');
  const tenantForms = useFieldErrors({
    archiveReason: (v) => (archiveReasons.includes(v) ? '' : 'Choose an archive reason.'),
    archiveNotes: (v) => checkText(v, { label: 'Notes', max: LIMITS.notes, required: false }),
    requested_move_out_date: (v) => checkDate(v, { label: 'Move-out date', min: addDays(MOVE_OUT_MIN_DAYS), max: addDays(MOVE_OUT_MAX_DAYS) })
      .replace(/cannot be before .*/, `must be at least ${MOVE_OUT_MIN_DAYS} days from today.`)
      .replace(/cannot be after .*/, `cannot be more than ${MOVE_OUT_MAX_DAYS} days from today.`),
    damage_deduction: (v) => checkAmount(v, { label: 'Damage deduction', required: false }),
    damage_notes: (v) => checkText(v, { label: 'Inspection notes', max: LIMITS.reason, required: false }),
    utility_deduction: (v) => checkAmount(v, { label: 'Utility balance', required: false }),
  }, { idPrefix: 'tenant-' });
  const tenantValues = {
    archiveReason, archiveNotes, requested_move_out_date: moveOutDate,
    damage_deduction: damageDeduction, damage_notes: damageNotes, utility_deduction: utilityDeduction,
  };
  const blurTenantField = (name) => tenantForms.validateField(name, tenantValues);

  const handleConfirmClearance = async () => {
    if (!clearanceTarget || savingAction) return;

    const rentStr = clearanceTarget.rent ? String(clearanceTarget.rent) : '4000';
    const baseDeposit = parseFloat(rentStr.replace(/[^0-9.]/g, '')) || 4000;
    const damages = money(damageDeduction);
    const utilities = money(utilityDeduction);
    const netRefund = Math.max(0, baseDeposit - damages - utilities);
    const notes = String(damageNotes).trim();
    setDamageNotes(notes);
    if (!tenantForms.validateAll({ ...tenantValues, damage_notes: notes }, ['damage_deduction', 'damage_notes', 'utility_deduction'])) return;

    const summaryNotes = `Clearance Summary — Deposit: ₱${baseDeposit.toLocaleString()}, Damage Deductions: ₱${damages.toLocaleString()}${damageNotes ? ` (${damageNotes})` : ''}, Unpaid Utilities Settlement: ₱${utilities.toLocaleString()}, Net Refundable/Settled: ₱${netRefund.toLocaleString()}`;

    setSavingAction('clearance');
    try {
      const res = await api.post('/update_tenant_status.php', {
        id: clearanceTarget.id,
        status: 'moved-out',
        damage_deduction: damages,
        damage_notes: notes,
        utility_deduction: utilities,
        clearance_notes: summaryNotes
      });

      if (res.data.success) {
        alert("Move-out clearance completed successfully. Room is now marked vacant.");
        setShowClearanceModal(false);
        setClearanceTarget(null);
        fetchTenants();
      } else if (!tenantForms.applyServerErrors(res)) {
        alert(res.data.message || "Failed to complete move-out clearance.");
      }
    } catch (err) {
      console.error("Error confirming clearance:", err);
      if (!tenantForms.applyServerErrors(err)) alert(apiErrorMessage(err, "Failed to submit move-out clearance."));
    } finally {
      setSavingAction('');
    }
  };

  // Profile modal tab state
  const [profileTab, setProfileTab] = useState('overview');

  const handleInitiateMoveOutClick = (tenant) => {
    setMoveOutTarget(tenant);
    setMoveOutDate(addDays(MOVE_OUT_MIN_DAYS));
    tenantForms.setErrors({});
    setShowProfileModal(false);
    setShowMoveOutModal(true);
  };

  const handleConfirmMoveOut = async () => {
    if (!moveOutTarget || savingAction) return;
    if (!tenantForms.validateAll(tenantValues, ['requested_move_out_date'])) return;

    setSavingAction('moveout');
    try {
      const res = await api.post('/update_tenant_status.php', {
        id: moveOutTarget.id,
        status: 'pending-move-out',
        requested_move_out_date: moveOutDate
      });

      if (res.data.success) {
        alert("Move-out scheduled successfully.");
        setShowMoveOutModal(false);
        setMoveOutTarget(null);
        fetchTenants();
      } else if (!tenantForms.applyServerErrors(res)) {
        alert(res.data.message || "Failed to update tenant status.");
      }
    } catch (err) {
      console.error("Error setting move out date:", err);
      if (!tenantForms.applyServerErrors(err)) alert(apiErrorMessage(err, "Failed to update status. Please try again."));
    } finally {
      setSavingAction('');
    }
  };

  const handleArchiveTenant = async () => {
    if (!archiveTarget || savingAction) return;
    const notes = archiveNotes.trim();
    setArchiveNotes(notes);
    if (!tenantForms.validateAll({ ...tenantValues, archiveNotes: notes }, ['archiveReason', 'archiveNotes'])) return;
    setSavingAction('archive');
    try {
      const payload = {
        id: archiveTarget.id,
        archiveReason,
        archiveNotes: notes,
      };
      const res = await api.post('/archive_tenant.php', payload);
      if (!res.data.success) {
        if (!tenantForms.applyServerErrors(res)) alert(apiErrorMessage(res, 'Failed to archive tenant.'));
        return;
      }
      fetchTenants();
      setShowArchiveModal(false);
      setArchiveTarget(null);
      setArchiveReason('End of Rent Term');
      setArchiveNotes('');
    } catch (err) {
      console.error("Error archiving tenant:", err);
      if (!tenantForms.applyServerErrors(err)) alert(apiErrorMessage(err, 'Failed to archive tenant.'));
    } finally {
      setSavingAction('');
    }
  };

  const handleRestoreTenant = async (id) => {
    try {
      const res = await api.post('/restore_tenant.php', { id });
      if (res.data.success) {
        alert(res.data.message || 'Tenant restored successfully.');
        fetchTenants();
      } else {
        alert(res.data.message || 'Failed to restore tenant.');
      }
    } catch (err) {
      console.error("Error restoring tenant:", err);
      alert(apiErrorMessage(err, 'Failed to restore tenant.'));
    }
  };

  const openArchiveModal = (tenant) => {
    setArchiveTarget(tenant);
    setArchiveReason('End of Rent Term');
    setArchiveNotes('');
    tenantForms.setErrors({});
    setShowArchiveModal(true);
  };

  // Count logic
  const activeTenantCount = tenants.filter(t => t.status === 'active' || t.status === 'Approved').length;
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
  let displayed;
  if (activeFilter === 'archived') {
    displayed = [...archivedTenants];
  } else if (activeFilter === 'all') {
    displayed = [...tenants, ...archivedTenants];
  } else if (activeFilter === 'active') {
    displayed = tenants.filter(t => t.status === 'active' || t.status === 'Approved');
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

  // Sort logic
  displayed.sort((a, b) => {
    let valA = '';
    let valB = '';

    if (sortBy === 'name') {
      valA = (a.name || '').toLowerCase();
      valB = (b.name || '').toLowerCase();
    } else if (sortBy === 'unit') {
      valA = (a.unit || '').toLowerCase();
      valB = (b.unit || '').toLowerCase();
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const tenantInvoices = selectedTenant ? invoices.filter(inv => Number(inv.user_id) === Number(selectedTenant.user_id)) : [];
  const tenantMaintenance = selectedTenant ? maintenanceRequests.filter(req => Number(req.user_id) === Number(selectedTenant.user_id)) : [];

  const totalPaid = tenantInvoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total_amount), 0);
  const monthsPaid = tenantInvoices.filter(inv => inv.status === 'paid').length;
  const overdueCount = tenantInvoices.filter(inv => inv.status === 'overdue' || (inv.status === 'pending' && new Date(inv.due_date) < new Date())).length;
  const lastPaidInvoice = tenantInvoices.filter(inv => inv.status === 'paid').sort((a,b) => new Date(b.paid_at) - new Date(a.paid_at))[0];
  const lastPayment = lastPaidInvoice ? (lastPaidInvoice.paid_at ? lastPaidInvoice.paid_at.split(' ')[0] : '—') : '—';

  const timeline = [];
  if (selectedTenant) {
    if (selectedTenant.moveIn) {
      timeline.push({
        event: 'Rent Started',
        date: selectedTenant.moveIn.split(' ')[0],
        detail: `Tenant moved into Unit ${selectedTenant.unit} with rent of ${selectedTenant.rent}`
      });
    }
    const myContract = contracts.find(c => Number(c.rent_application_id) === Number(selectedTenant.id));
    if (myContract) {
      timeline.push({
        event: 'Contract Generated',
        date: myContract.generated_at ? myContract.generated_at.split(' ')[0] : (selectedTenant.moveIn ? selectedTenant.moveIn.split(' ')[0] : ''),
        detail: `Rent contract generated. Status: ${myContract.status}`
      });
      if (myContract.signed_lease_path) {
        timeline.push({
          event: 'Signed Contract Uploaded',
          date: myContract.generated_at ? myContract.generated_at.split(' ')[0] : (selectedTenant.moveIn ? selectedTenant.moveIn.split(' ')[0] : ''),
          detail: 'Signed rent agreement uploaded and registered.'
        });
      }
    }
    if (selectedTenant.leaseEnd) {
      timeline.push({
        event: 'Rent Scheduled End',
        date: selectedTenant.leaseEnd,
        detail: `Rent is scheduled to end on ${selectedTenant.leaseEnd}`
      });
    }
    if (selectedTenant.status === 'moved-out' || selectedTenant.status === 'archived') {
      timeline.push({
        event: 'Tenant Moved Out',
        date: selectedTenant.archiveDate || selectedTenant.movedOutDate || new Date().toISOString().split(' ')[0],
        detail: `Tenant officially moved out. Reason: ${selectedTenant.archiveReason || 'End of Rent Term'}`
      });
    }
  }
  const sortedTimeline = timeline.filter(t => t.date).sort((a, b) => new Date(a.date) - new Date(b.date));

  const getOccupancyBadge = (status) => {
    const map = {
      'Pending Review': { style: 'bg-blue-100 text-blue-800', label: '○ Pending Review' },
      'Approved':       { style: 'bg-sky-100 text-sky-800',     label: '◑ Approved (Pending Move-In)' },
      'active':         { style: 'bg-emerald-100 text-emerald-800', label: '● Active' },
      'pending-move-out': { style: 'bg-amber-100 text-amber-800', label: '◔ Pending Move-Out' },
      'moved-out':      { style: 'bg-slate-100 text-slate-500', label: '○ Moved Out' },
      'archived':       { style: 'bg-violet-100 text-violet-700', label: '◇ Archived' },
    };
    const entry = map[status] || { style: 'bg-slate-100 text-slate-500', label: `○ ${status || 'Unknown'}` };
    return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${entry.style}`}>{entry.label}</span>;
  };

  const openProfile = (tenant) => {
    setSelectedTenant(tenant);
    setProfileTab('overview');
    setShowProfileModal(true);
  };

  // Shared by the table (md and up) and the card list (phones).
  // Payment standing from real invoices (checklist 8.4)
  const renderPaymentStanding = (t) => (t.status !== 'archived' && t.paymentStatus) ? (
    <div className="mt-1">
      {t.paymentStatus === 'overdue' ? (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200" title={`${t.daysOverdue} day(s) past due`}>
          Overdue ₱{Number(t.overdueBalance).toLocaleString()}
        </span>
      ) : t.paymentStatus === 'due' ? (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          Due ₱{Number(t.outstandingBalance).toLocaleString()}
        </span>
      ) : (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Paid up
        </span>
      )}
    </div>
  ) : null;

  const renderTenantDetails = (t) => (
    t.status === 'archived' ? (
      <div>
        <div>Archived: {t.archiveDate}</div>
        <div className="text-[10px] text-violet-500 font-semibold">{t.archiveReason}</div>
      </div>
    ) : t.status === 'Pending Review' ? (
      <span className="text-slate-400">Move-in date pending</span>
    ) : t.status === 'Approved' ? (
      <span className="text-sky-600 font-semibold">Pending move-in payment</span>
    ) : t.leaseEnd ? (
      <div>
        <div>Rent ends: {t.leaseEnd}</div>
        {daysRemaining(t.leaseEnd) > 0 && (
          <div className={`text-[10px] font-semibold ${daysRemaining(t.leaseEnd) <= 30 ? 'text-red-500' : 'text-slate-400'}`}>
            {daysRemaining(t.leaseEnd)} days remaining
          </div>
        )}
      </div>
    ) : t.status === 'pending-move-out' ? (
      <div>
        <div>Scheduled Out: {t.requestedMoveOutDate}</div>
        {daysRemaining(t.requestedMoveOutDate) > 0 ? (
          <div className="text-[10px] text-amber-600 font-semibold">
            {daysRemaining(t.requestedMoveOutDate)} days notice
          </div>
        ) : (
          <div className="text-[10px] text-red-500 font-semibold">Notice expired / due today</div>
        )}
      </div>
    ) : (
      <span className="text-slate-300">—</span>
    )
  );

  const renderTenantActions = (t) => (
    <div className="flex flex-wrap items-center gap-2">
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
      {t.status === 'archived' && (
        <button
          onClick={() => handleRestoreTenant(t.id)}
          className="flex items-center gap-1.5 text-emerald-600 font-semibold border-0 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
        >
          <FontAwesomeIcon icon={faCheckCircle} className="text-[10px]" /> Restore Tenant
        </button>
      )}
      {t.status === 'active' && (
        <button
          onClick={() => handleInitiateMoveOutClick(t)}
          className="flex items-center gap-1.5 text-amber-600 font-semibold border-0 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="text-[10px]" /> Move Out
        </button>
      )}
      {t.status === 'pending-move-out' && (
        <button
          onClick={() => openClearanceModal(t)}
          className="flex items-center gap-1.5 text-slate-600 font-semibold border-0 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
        >
          <FontAwesomeIcon icon={faCheckCircle} className="text-[10px]" /> Complete Move Out
        </button>
      )}
    </div>
  );

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Tenant Management" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Search Bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                <input maxLength={LIMITS.search} type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search tenants, units, emails..." className="flex-1 bg-transparent text-sm text-slate-700 outline-none p-0 border-0 placeholder-slate-400" />
              </div>

              {/* Sorting Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Sort by:</span>
                  <select 
                    value={sortBy} 
                    onChange={e => setSortBy(e.target.value)} 
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-700 focus:border-indigo-500 cursor-pointer shadow-sm"
                  >
                    <option value="name">Name</option>
                    <option value="unit">Unit</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Order:</span>
                  <select 
                    value={sortOrder} 
                    onChange={e => setSortOrder(e.target.value)} 
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-700 focus:border-indigo-500 cursor-pointer shadow-sm"
                  >
                    <option value="asc">Ascending (A-Z)</option>
                    <option value="desc">Descending (Z-A)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Stats Summary */}
            <div className="stagger-children grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="card-interactive bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Records</p>
                <p className="text-2xl font-bold text-slate-800 mt-1 m-0">{counts.all}</p>
              </div>
              <div className="card-interactive bg-white border-l-4 border-l-emerald-500 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Active</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1 m-0">{counts.active}</p>
              </div>
              <div className="card-interactive bg-white border-l-4 border-l-amber-400 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Pending Move-Out</p>
                <p className="text-2xl font-bold text-amber-500 mt-1 m-0">{counts['pending-move-out']}</p>
              </div>
              <div className="card-interactive bg-white border-l-4 border-l-slate-400 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Moved Out</p>
                <p className="text-2xl font-bold text-slate-500 mt-1 m-0">{counts['moved-out']}</p>
              </div>
              <div className="card-interactive bg-white border-l-4 border-l-violet-500 border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Archived</p>
                <p className="text-2xl font-bold text-violet-600 mt-1 m-0">{counts.archived}</p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-3 flex-wrap">
              {filters.map(f => (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`btn-interactive px-4 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-all ${activeFilter === f.key ? (f.activeStyle || 'bg-indigo-600 text-white border-indigo-600') : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Tenant Table */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm table-scroll-x">
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
                        {renderPaymentStanding(t)}
                      </td>
                      <td className="px-4 py-3">{getOccupancyBadge(t.status)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{renderTenantDetails(t)}</td>
                      <td className="px-4 py-3">{renderTenantActions(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tenant Cards (phones) */}
            <div className="md:hidden space-y-3">
              {displayed.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl text-center py-12 text-slate-400 text-sm">No tenants found matching your criteria.</div>
              )}
              {displayed.map((t, idx) => (
                <div key={t.id || idx} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                        t.status === 'archived' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {(t.name || '').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{t.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">{t.email}</div>
                      </div>
                    </div>
                    <div className="shrink-0">{getOccupancyBadge(t.status)}</div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Unit</span>
                      <div className="text-right">
                        <span className="font-bold text-indigo-600">Unit {t.unit}</span>
                        {renderPaymentStanding(t)}
                      </div>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Details</span>
                      <div className="text-right text-xs text-slate-500">{renderTenantDetails(t)}</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100">{renderTenantActions(t)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ─── TENANT PROFILE MODAL ─── */}
      {showProfileModal && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm modal-overlay-anim" onClick={() => setShowProfileModal(false)}>
          <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md ${
                  selectedTenant.status === 'archived' 
                    ? 'bg-gradient-to-br from-violet-500 to-violet-700' 
                    : selectedTenant.status === 'active'
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-700'
                      : selectedTenant.status === 'Approved'
                        ? 'bg-gradient-to-br from-sky-500 to-sky-700'
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
                { key: 'lease', label: 'Rent Timeline', icon: faCalendarAlt },
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
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white">
              
              {/* Overview Tab */}
              {profileTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  {['Approved', 'active', 'pending-move-out'].includes(selectedTenant.status) && (
                    <AdminHouseholdList userId={selectedTenant.user_id} />
                  )}

                  {/* Verification Documents */}
                  {(selectedTenant.valid_id_front_path || selectedTenant.valid_id_back_path || selectedTenant.nbi_clearance_path) && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                       <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 m-0">Verification Documents</p>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         {selectedTenant.valid_id_front_path && (
                           <a href={fileUrl(selectedTenant.valid_id_front_path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 text-sm hover:underline p-2 bg-indigo-50 rounded-lg"><FontAwesomeIcon icon={faFileAlt} /> Valid ID (Front)</a>
                         )}
                         {selectedTenant.valid_id_back_path && (
                           <a href={fileUrl(selectedTenant.valid_id_back_path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 text-sm hover:underline p-2 bg-indigo-50 rounded-lg"><FontAwesomeIcon icon={faFileAlt} /> Valid ID (Back)</a>
                         )}
                         {selectedTenant.nbi_clearance_path && (
                           <a href={fileUrl(selectedTenant.nbi_clearance_path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 text-sm hover:underline p-2 bg-indigo-50 rounded-lg"><FontAwesomeIcon icon={faFileAlt} /> NBI Clearance</a>
                         )}
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

                  {/* Actions for non-archived tenants. Pending Review applications are
                      handled on the Applications page (AdminApplications.jsx) — this
                      page's tenant list already excludes that status (see the filter
                      above), so no approve/reject action exists here. */}
                  {selectedTenant.status !== 'archived' && (selectedTenant.status === 'active' || selectedTenant.status === 'Approved') && (
                    <button 
                      onClick={() => handleInitiateMoveOutClick(selectedTenant)} 
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-amber-500 text-white p-2.5 rounded-lg border-0 cursor-pointer text-sm font-semibold hover:bg-amber-600 transition-colors"
                    >
                      <FontAwesomeIcon icon={faSignOutAlt} /> Initiate Move Out
                    </button>
                  )}
                  {selectedTenant.status === 'pending-move-out' && (
                    <button 
                      onClick={() => openClearanceModal(selectedTenant)} 
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-600 text-white p-2.5 rounded-lg border-0 cursor-pointer text-sm font-semibold hover:bg-slate-700 transition-colors"
                    >
                      <FontAwesomeIcon icon={faCheckCircle} /> Complete Move Out
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
                  {sortedTimeline.length > 0 ? (
                    <div className="relative pl-6">
                      {/* Timeline line */}
                      <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-indigo-200"></div>
                      {sortedTimeline.map((entry, idx) => (
                        <div key={idx} className="relative mb-4 last:mb-0">
                          <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                            entry.event.includes('End') || entry.event.includes('Moved') ? 'bg-red-500' : 
                            entry.event.includes('Contract') ? 'bg-amber-500' : 'bg-emerald-500'
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
                      <p className="text-sm text-slate-400 m-0">No rent timeline data available for this tenant.</p>
                      {selectedTenant.moveIn && (
                        <div className="mt-4 bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs text-slate-500 inline-block">
                          Rent started: {selectedTenant.moveIn} {selectedTenant.leaseEnd ? `→ Ends: ${selectedTenant.leaseEnd}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Payment History Tab */}
              {profileTab === 'payments' && (
                <div className="space-y-4">
                  <div className="stagger-children grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="card-interactive bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-emerald-700 m-0">₱{totalPaid.toLocaleString()}</p>
                      <p className="text-[10px] text-emerald-600 font-semibold m-0 mt-0.5">Total Paid</p>
                    </div>
                    <div className="card-interactive bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-indigo-700 m-0">{monthsPaid}</p>
                      <p className="text-[10px] text-indigo-600 font-semibold m-0 mt-0.5">Invoices Paid</p>
                    </div>
                    <div className="card-interactive bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-red-700 m-0">{overdueCount}</p>
                      <p className="text-[10px] text-red-600 font-semibold m-0 mt-0.5">Overdue Invoices</p>
                    </div>
                    <div className="card-interactive bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-sm font-bold text-slate-700 m-0 truncate">{lastPayment}</p>
                      <p className="text-[10px] text-slate-500 font-semibold m-0 mt-0.5">Last Payment</p>
                    </div>
                  </div>

                  {tenantInvoices.length > 0 ? (
                    <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-1">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Invoices list</p>
                      {tenantInvoices.map((entry, idx) => (
                        <div key={idx} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="flex items-start gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                              entry.status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                            }`}>
                              ₱
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-800 m-0">₱{Number(entry.total_amount).toLocaleString()}</p>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                  entry.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {entry.status.toUpperCase()}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 m-0 mt-0.5">
                                {entry.billing_period || 'Initial Rent Payment'} · Due: {entry.due_date}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-[10px] text-slate-400">
                            <div className="font-mono text-indigo-600">{entry.invoice_number}</div>
                            {entry.paid_at && <div className="mt-0.5">Paid: {entry.paid_at.split(' ')[0]}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">No payments recorded.</div>
                  )}
                </div>
              )}

              {/* Maintenance Tab */}
              {profileTab === 'maintenance' && (
                <div className="space-y-3">
                  {tenantMaintenance.length > 0 ? (
                    tenantMaintenance.map((req, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                          req.status === 'Completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          <FontAwesomeIcon icon={faWrench} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-slate-800 m-0">{req.category} - {req.description}</p>
                          <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                            Status: {req.status} {req.estimatedCost ? `· Cost: ₱${req.estimatedCost.toLocaleString()}` : ''}
                          </p>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">{req.dateSubmitted}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm modal-overlay-anim" onClick={() => setShowArchiveModal(false)}>
          <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
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
                <label htmlFor="tenant-archiveReason" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Archive Reason *</label>
                <select
                  {...tenantForms.fieldA11y('archiveReason')}
                  value={archiveReason}
                  onChange={(e) => { setArchiveReason(e.target.value); tenantForms.clearError('archiveReason'); }}
                  className={`w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-500 bg-white text-slate-800${invalidCls(tenantForms.errors.archiveReason)}`}
                >
                  {archiveReasons.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <FieldError id="tenant-archiveReason" error={tenantForms.errors.archiveReason} />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="tenant-archiveNotes" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Additional Notes</label>
                <textarea
                  {...tenantForms.fieldA11y('archiveNotes')}
                  value={archiveNotes}
                  maxLength={LIMITS.notes}
                  onChange={(e) => { setArchiveNotes(e.target.value); tenantForms.clearError('archiveNotes'); }}
                  onBlur={() => { const v = archiveNotes.trim(); setArchiveNotes(v); tenantForms.validateField('archiveNotes', { ...tenantValues, archiveNotes: v }); }}
                  rows={3}
                  placeholder="Optional notes about this archival..."
                  className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-500 bg-white text-slate-700 resize-y${invalidCls(tenantForms.errors.archiveNotes)}`}
                />
                <FieldError id="tenant-archiveNotes" error={tenantForms.errors.archiveNotes} />
                <CharCount value={archiveNotes} max={LIMITS.notes} />
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 mt-0.5 text-xs" />
                <p className="text-[11px] text-amber-700 m-0">
                  This will archive the tenant's record. Their rent history, payment records, and maintenance requests will be preserved for reference. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowArchiveModal(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
              <button type="button" onClick={handleArchiveTenant} disabled={!!savingAction} className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 shadow-sm border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <FontAwesomeIcon icon={faArchive} className="mr-1.5" /> Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}
        {/* ─── ADMIN MOVE OUT SCHEDULING MODAL ─── */}
        {showMoveOutModal && moveOutTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm modal-overlay-anim" onClick={() => setShowMoveOutModal(false)}>
            <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                    <FontAwesomeIcon icon={faSignOutAlt} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 m-0">Schedule Move-Out</h3>
                    <p className="text-xs text-slate-400 m-0 mt-0.5">Set planned move-out date for tenant</p>
                  </div>
                </div>
                <button onClick={() => setShowMoveOutModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                  <FontAwesomeIcon icon={faTimes} className="text-base" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Tenant Summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left">
                  <p className="text-sm font-bold text-slate-800 m-0">{moveOutTarget.name}</p>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">Unit {moveOutTarget.unit} · {moveOutTarget.rent}</p>
                </div>

                {/* Policy alert */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-left">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 mt-0.5 text-xs shrink-0" />
                  <p className="text-[11px] text-amber-700 m-0">
                    Prior notice of at least <strong>15 days</strong> but less than <strong>30 days</strong> is required before the Tenant's actual move-out date.
                  </p>
                </div>

                {/* Date Picker */}
                <div className="text-left">
                  <label htmlFor="tenant-requested_move_out_date" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Planned Move-Out Date *</label>
                  <input
                    type="date"
                    {...tenantForms.fieldA11y('requested_move_out_date')}
                    value={moveOutDate}
                    min={addDays(MOVE_OUT_MIN_DAYS)}
                    max={addDays(MOVE_OUT_MAX_DAYS)}
                    onChange={(e) => { setMoveOutDate(e.target.value); tenantForms.clearError('requested_move_out_date'); }}
                    onBlur={() => blurTenantField('requested_move_out_date')}
                    className={`w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white text-slate-800${invalidCls(tenantForms.errors.requested_move_out_date)}`}
                    required
                  />
                  <FieldError id="tenant-requested_move_out_date" error={tenantForms.errors.requested_move_out_date} />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                <button type="button" onClick={() => setShowMoveOutModal(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
                <button type="button" onClick={handleConfirmMoveOut} disabled={!!savingAction} className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 shadow-sm border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {savingAction === 'moveout' ? 'Saving…' : 'Confirm Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ─── MOVE-OUT INSPECTION & CLEARANCE MODAL ─── */}
        {showClearanceModal && clearanceTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm modal-overlay-anim" onClick={() => setShowClearanceModal(false)}>
            <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center font-bold">
                    <FontAwesomeIcon icon={faClipboardCheck} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 m-0">Move-Out Inspection & Clearance</h3>
                    <p className="text-xs text-slate-400 m-0 mt-0.5">Physical inspection, deposit deductions, & utility settlement</p>
                  </div>
                </div>
                <button onClick={() => setShowClearanceModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                  <FontAwesomeIcon icon={faTimes} className="text-base" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-left max-h-[75vh] overflow-y-auto">
                {/* Tenant Summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800 m-0">{clearanceTarget.name}</p>
                    <p className="text-xs text-slate-400 m-0 mt-0.5">Unit {clearanceTarget.unit} · {clearanceTarget.rent}/mo</p>
                  </div>
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                    Pending Clearance
                  </span>
                </div>

                {/* Section 1: Room Inspection for Damages */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    1. Physical Room Inspection & Damages
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="tenant-damage_deduction" className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Damage Deductions (₱)</label>
                      {/* Kept as typed and validated, instead of being clamped on every keystroke. */}
                      <input
                        type="number"
                        {...tenantForms.fieldA11y('damage_deduction')}
                        inputMode="decimal"
                        min="0"
                        max={MAX_AMOUNT}
                        step="0.01"
                        value={damageDeduction}
                        onKeyDown={blockNonNumericKeys}
                        onChange={(e) => { setDamageDeduction(e.target.value); tenantForms.clearError('damage_deduction'); }}
                        onBlur={() => blurTenantField('damage_deduction')}
                        className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-bold text-slate-800${invalidCls(tenantForms.errors.damage_deduction)}`}
                        placeholder="0.00"
                      />
                      <FieldError id="tenant-damage_deduction" error={tenantForms.errors.damage_deduction} />
                    </div>
                    <div>
                      <label htmlFor="tenant-damage_notes" className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Inspection Notes / Details</label>
                      <input
                        type="text"
                        {...tenantForms.fieldA11y('damage_notes')}
                        autoComplete="off"
                        value={damageNotes}
                        maxLength={LIMITS.reason}
                        onChange={(e) => { setDamageNotes(e.target.value); tenantForms.clearError('damage_notes'); }}
                        onBlur={() => { const v = damageNotes.trim(); setDamageNotes(v); tenantForms.validateField('damage_notes', { ...tenantValues, damage_notes: v }); }}
                        className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800${invalidCls(tenantForms.errors.damage_notes)}`}
                        placeholder="e.g., Wall repaint, key replacement"
                      />
                      <FieldError id="tenant-damage_notes" error={tenantForms.errors.damage_notes} />
                    </div>
                  </div>
                </div>

                {/* Section 2: Unpaid Utility Bills Settlement */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    2. Unpaid Utility Bills Settlement
                  </label>
                  <div>
                    <label htmlFor="tenant-utility_deduction" className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unpaid Electricity & Water Balance (₱)</label>
                    <input
                      type="number"
                      {...tenantForms.fieldA11y('utility_deduction')}
                      inputMode="decimal"
                      min="0"
                      max={MAX_AMOUNT}
                      step="0.01"
                      value={utilityDeduction}
                      onKeyDown={blockNonNumericKeys}
                      onChange={(e) => { setUtilityDeduction(e.target.value); tenantForms.clearError('utility_deduction'); }}
                      onBlur={() => blurTenantField('utility_deduction')}
                      className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-bold text-slate-800${invalidCls(tenantForms.errors.utility_deduction)}`}
                      placeholder="0.00"
                    />
                    <FieldError id="tenant-utility_deduction" error={tenantForms.errors.utility_deduction} />
                  </div>
                </div>

                {/* Section 3: Security Deposit Calculations */}
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-bold text-indigo-900 uppercase tracking-wide m-0">
                    3. Security Deposit Settlement Calculation
                  </label>
                  <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                    <div className="flex justify-between">
                      <span>Initial Security Deposit:</span>
                      <span className="font-semibold text-slate-800">₱{(parseFloat(String(clearanceTarget.rent || '4000').replace(/[^0-9.]/g, '')) || 4000).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>Less: Room Damages:</span>
                      <span className="font-semibold">-₱{money(damageDeduction).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>Less: Unpaid Utilities:</span>
                      <span className="font-semibold">-₱{money(utilityDeduction).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t border-indigo-200 pt-2 flex justify-between font-bold text-sm text-indigo-950">
                      <span>Net Refundable Security Deposit:</span>
                      <span className="text-emerald-600 font-black">
                        ₱{Math.max(0, (parseFloat(String(clearanceTarget.rent || '4000').replace(/[^0-9.]/g, '')) || 4000) - money(damageDeduction) - money(utilityDeduction)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                <button onClick={() => setShowClearanceModal(false)} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg border-0 bg-transparent cursor-pointer">Cancel</button>
                <button type="button" onClick={handleConfirmClearance} disabled={!!savingAction} className="px-5 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 shadow-sm border-0 cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <FontAwesomeIcon icon={faCheckCircle} /> Confirm Clearance & Complete Move Out
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default AdminTenants;