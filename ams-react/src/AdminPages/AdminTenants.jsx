import { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faTimes, faUser, faCalendarAlt,
  faExclamationTriangle, faCheckCircle, faEye,
  faArchive, faDollarSign, faWrench, faFileAlt,
  faSignOutAlt, faClipboardCheck, faUsers, faCalendarPlus,
  faEnvelope, faPhone, faTimesCircle
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, addDays, checkAmount, checkDate, checkText, dateProblem } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import CharCount from '../Components/form/CharCount';
import { blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';

// update_tenant_status.php: a scheduled move-out is within the notice window of Settings → Rental
// (15–30 days until the settings load).
const DEFAULT_MOVE_OUT_WINDOW = { min: 15, max: 30 };
const money = (v) => Number(v) || 0;

// deposit_deductions.category (update_tenant_status.php DEPOSIT_DEDUCTION_CATEGORIES).
const DEDUCTION_CATEGORIES = [
  ['damage', 'Damage'], ['electricity', 'Electricity'], ['water', 'Water'], ['unpaid_rent', 'Unpaid rent'], ['other', 'Other'],
];
const MAX_DEDUCTION_LINES = 20;
const deductionLabel = (c) => (DEDUCTION_CATEGORIES.find(([v]) => v === c) || [c, 'Other'])[1];
import { fileUrl } from '../api/fileUrl';
import AdminHouseholdList from '../Components/AdminHouseholdList';
import DepositOutcome from '../Components/DepositOutcome';
import Modal from '../Components/admin/Modal';
import useUrlFilter from '../hooks/useUrlFilter';
import { TH, THEAD, TABLE, TD, TR, PANEL, PANEL_HEADER, btn, badge } from '../Components/admin/ui/styles';
import FilterTabs from '../Components/admin/ui/FilterTabs';
import LoadError, { LoadErrorRow } from '../Components/admin/ui/LoadError';
import { SkeletonCards, SkeletonRows } from '../Components/admin/ui/Skeleton';
import useLoadState from '../hooks/useLoadState';
import { getSystemSettings } from '../config/systemSettings';
import StatCard from '../Components/admin/StatCard';
import PersonAvatar from '../Components/admin/PersonAvatar';
import { ADMIN_NOTIFICATIONS_EVENT } from '../config/notificationLinks';
import askConfirm from '../utils/askConfirm';

// ==========================================
// MOCK DATA FOR ARCHIVED TENANTS & HISTORY
// ==========================================
const initialArchivedTenants = [];

const archiveReasons = ['End of Rent Term', 'Personal Reasons', 'Relocated', 'Financial Hardship', 'Evicted', 'Other'];

const daysRemaining = (leaseEnd) => {
  const diff = Math.ceil((new Date(leaseEnd) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
};

// YYYY-MM-DD plus whole months, clamped to the month's last day like MySQL's
// DATE_ADD (extend_tenancy() in config.php): Jan 31 + 1 month = Feb 28.
const addMonthsYmd = (ymd, months) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  if (!m) return '';
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + Number(months || 0);
  const y = Math.floor(total / 12);
  const mo = total % 12;
  const last = new Date(y, mo + 1, 0).getDate();
  const d = Math.min(Number(m[3]), last);
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const CURRENT_STATUSES = ['Approved', 'active', 'pending-move-out'];
const SORTS = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'unit-asc', label: 'Unit (A-Z)' },
  { value: 'unit-desc', label: 'Unit (Z-A)' },
];

const AdminTenants = () => {
  const [tenants, setTenants] = useState([]);
  // loading | error | ready. Until ready the list shows a skeleton or the error,
  // never "No tenants found" and "(0)" counts.
  const tenantsState = useLoadState();
  const [archivedTenants, setArchivedTenants] = useState(initialArchivedTenants);
  // Active tenants first; extension requests and overdue tenants are one click away.
  const [activeFilter, setActiveFilter] = useUrlFilter('filter', 'active', ['active', 'pending-move-out', 'extension', 'overdue', 'moved-out', 'archived', 'all']);
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
  // Bank interest the deposit earned, returned with it at clearance (RA 9653 Sec. 7).
  const [depositInterest, setDepositInterest] = useState('');
  // Itemized deductions for the clearance: [{key, category, reason, amount}].
  const [deductionLines, setDeductionLines] = useState([]);
  const [deductionErrors, setDeductionErrors] = useState([]);
  const [damageNotes, setDamageNotes] = useState('');

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
        tenantsState.ready();
        return allApplications;
      } else {
        tenantsState.fail();
      }
    } catch (err) {
      console.error("Error fetching tenants:", err);
      // A failed refresh after an action keeps the list already shown.
      tenantsState.fail();
    }
    return null;
  };

  // Rent extension requests (extend_lease.php) are decided here, on the tenant,
  // with the same endpoint the Notifications page used (process_tenant_request.php).
  const [deciding, setDeciding] = useState(null);
  const [notice, setNotice] = useState(null);
  const decideExtension = async (tenant, action) => {
    const req = tenant?.extensionRequest;
    if (!req || deciding) return;
    const approve = action === 'approve';
    const months = `${req.months} month${req.months === 1 ? '' : 's'}`;
    const newEnd = addMonthsYmd(tenant.leaseEnd, req.months);
    const ok = await askConfirm(
      approve
        ? `Extend ${tenant.name}'s rent by ${months}?${newEnd ? `\nThe rent would end on ${newEnd} instead of ${tenant.leaseEnd}.` : ''}\nThe contract is updated and the tenant is told.`
        : `Reject ${tenant.name}'s request to extend the rent by ${months}? The tenant is told.`,
      { title: approve ? 'Approve rent extension' : 'Reject rent extension', confirmLabel: approve ? 'Approve' : 'Reject', tone: approve ? 'primary' : 'danger' },
    );
    if (!ok) return;
    setDeciding(req.id);
    setNotice(null);
    try {
      const res = await api.post('process_tenant_request.php', { notificationId: req.id, action });
      setNotice({ ok: !!res.data.success, text: res.data.message || (approve ? 'Rent extension approved.' : 'Rent extension rejected.') });
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not decide the rent extension request.') });
    } finally {
      // Refresh either way: a request another admin already decided disappears too.
      const list = await fetchTenants();
      fetchContracts();
      if (list) setSelectedTenant((prev) => (prev ? list.find((x) => x.id === prev.id) || prev : prev));
      window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_EVENT));
      setDeciding(null);
    }
  };

  const retryTenants = () => {
    tenantsState.retry();
    Promise.all([fetchTenants(), fetchInvoices(), fetchContracts()]);
  };

  useEffect(() => {
    const load = async () => { await Promise.all([fetchTenants(), fetchInvoices(), fetchMaintenanceRequests(), fetchContracts()]); };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; the loaders only call stable useLoadState callbacks
  }, []);

  const openClearanceModal = (tenant) => {
    setClearanceTarget(tenant);
    setDeductionLines([]);
    setDeductionErrors([]);
    setDamageNotes('');
    setDepositInterest('');
    setShowProfileModal(false);
    tenantForms.setErrors({});
    setShowClearanceModal(true);
  };

  // One hook for the archive, move-out and clearance modals; each submit
  // checks only its own fields. Keys match the endpoints' body fields.
  const [savingAction, setSavingAction] = useState('');
  const [moveOutWindow, setMoveOutWindow] = useState(DEFAULT_MOVE_OUT_WINDOW);
  useEffect(() => {
    getSystemSettings().then((s) => setMoveOutWindow({
      min: s.moveOutMinNoticeDays ?? DEFAULT_MOVE_OUT_WINDOW.min,
      max: s.moveOutMaxNoticeDays ?? DEFAULT_MOVE_OUT_WINDOW.max,
    })).catch(() => {});
  }, []);
  const tenantForms = useFieldErrors({
    archiveReason: (v) => (archiveReasons.includes(v) ? '' : 'Choose an archive reason.'),
    archiveNotes: (v) => checkText(v, { label: 'Notes', max: LIMITS.notes, required: false }),
    requested_move_out_date: (v) => {
      const range = { min: addDays(moveOutWindow.min), max: addDays(moveOutWindow.max) };
      const problem = dateProblem(v, range);
      if (problem === 'before') return `Move-out date must be at least ${moveOutWindow.min} days from today.`;
      if (problem === 'after') return `Move-out date cannot be more than ${moveOutWindow.max} days from today.`;
      return checkDate(v, { label: 'Move-out date', ...range });
    },
    damage_notes: (v) => checkText(v, { label: 'Inspection notes', max: LIMITS.reason, required: false }),
  }, { idPrefix: 'tenant-' });
  const tenantValues = {
    archiveReason, archiveNotes, requested_move_out_date: moveOutDate, damage_notes: damageNotes,
  };
  const blurTenantField = (name) => tenantForms.validateField(name, tenantValues);

  // Deduction lines, checked like update_tenant_status.php: category from the
  // list, reason 1-255 characters, amount above 0 and at most 1,000,000.
  const checkDeduction = (line) => ({
    category: DEDUCTION_CATEGORIES.some(([v]) => v === line.category) ? '' : 'Choose a category.',
    reason: !line.reason.trim() ? 'A reason is required.' : line.reason.trim().length > 255 ? 'The reason can be up to 255 characters.' : '',
    amount: checkAmount(line.amount, { label: 'Amount', min: 0.01, max: 1000000, allowZero: false }),
  });
  const editDeduction = (i, patch, validate = false) => {
    setDeductionLines((prev) => {
      const next = prev.map((l, n) => (n === i ? { ...l, ...patch } : l));
      setDeductionErrors((errs) => { const e = [...errs]; e[i] = validate ? checkDeduction(next[i]) : {}; return e; });
      return next;
    });
  };
  const addDeduction = () => {
    setDeductionLines((prev) => (prev.length >= MAX_DEDUCTION_LINES ? prev
      : [...prev, { key: `${Date.now()}-${prev.length}`, category: 'damage', reason: '', amount: '' }]));
  };
  const removeDeduction = (i) => {
    setDeductionLines((prev) => prev.filter((_, n) => n !== i));
    setDeductionErrors((prev) => prev.filter((_, n) => n !== i));
  };
  const deductionTotal = Math.round(deductionLines.reduce((s, l) => s + money(l.amount), 0) * 100) / 100;
  // What was actually paid and held (a deposit that was never paid covers nothing).
  const clearanceDeposit = clearanceTarget?.depositHeld ? Number(clearanceTarget.depositAmount) || 0 : 0;
  // Mirrors settle_deposit() in config.php for the preview; the server decides.
  const clearanceOwed = Number(clearanceTarget?.outstandingBalance) || 0;
  // RA 9653 Sec. 7: the deposit (plus any bank interest) covers only what is
  // owed and itemized; the rest is always returned.
  const clearanceInterest = clearanceDeposit > 0 ? Math.max(0, money(depositInterest)) : 0;
  const clearanceRemaining = Math.max(0, Math.round((clearanceDeposit + clearanceInterest - deductionTotal - clearanceOwed) * 100) / 100);
  // The deposit pays the unpaid invoices first; deductions it does not reach
  // are billed on a "Move-out balance" invoice (apply_deposit_to_invoices()).
  const clearanceBilled = Math.min(deductionTotal, Math.max(0, Math.round((deductionTotal + clearanceOwed - clearanceDeposit - clearanceInterest) * 100) / 100));

  const handleConfirmClearance = async () => {
    if (!clearanceTarget || savingAction) return;

    const notes = String(damageNotes).trim();
    setDamageNotes(notes);
    const lines = deductionLines.map((l) => ({ ...l, reason: l.reason.trim() }));
    const lineErrors = lines.map(checkDeduction);
    setDeductionLines(lines);
    setDeductionErrors(lineErrors);
    const linesOk = lineErrors.every((e) => !e.category && !e.reason && !e.amount);
    if (!tenantForms.validateAll({ ...tenantValues, damage_notes: notes }, ['damage_notes']) || !linesOk) return;

    const itemText = lines.map((l) => `${deductionLabel(l.category)} – ${l.reason}: ₱${money(l.amount).toLocaleString()}`).join('; ');
    const summaryNotes = `Clearance Summary — Deposit: ₱${clearanceDeposit.toLocaleString()}, Deductions: ₱${deductionTotal.toLocaleString()}${itemText ? ` (${itemText})` : ''}${notes ? `, Notes: ${notes}` : ''}`;

    setSavingAction('clearance');
    try {
      const res = await api.post('/update_tenant_status.php', {
        id: clearanceTarget.id,
        status: 'moved-out',
        deductions: lines.map((l) => ({ category: l.category, reason: l.reason, amount: Math.round(money(l.amount) * 100) / 100 })),
        damage_notes: notes,
        deposit_interest: clearanceInterest,
        clearance_notes: summaryNotes
      });

      if (res.data.success) {
        const peso = (n) => `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        const d = res.data;
        alert([
          "Move-out clearance completed successfully. Room is now marked vacant.",
          d.invoices_paid_from_deposit > 0 ? `${d.invoices_paid_from_deposit} unpaid invoice(s) were paid from the deposit.` : '',
          d.balance_invoice ? `Move-out balance invoice ${d.balance_invoice.id} for ${peso(d.balance_invoice.amount)} was created.` : '',
          d.advance_refund ? `A refund request of ${peso(d.advance_refund.amount)} was opened for unused advance rent. See Refunds.` : '',
        ].filter(Boolean).join('\n'));
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
    setMoveOutDate(addDays(moveOutWindow.min));
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
  const awaitingMoveInCount = tenants.filter(t => t.status === 'Approved').length;
  const pendingMoveOutCount = tenants.filter(t => t.status === 'pending-move-out').length;
  const movedOutCount = tenants.filter(t => t.status === 'moved-out').length;
  const extensionTenants = tenants.filter(t => t.extensionRequest);
  const overdueTenants = tenants.filter(t => CURRENT_STATUSES.includes(t.status) && t.paymentStatus === 'overdue');
  const overdueTotal = overdueTenants.reduce((sum, t) => sum + (Number(t.overdueBalance) || 0), 0);

  const counts = {
    all: tenants.length + archivedTenants.length,
    active: activeTenantCount,
    'pending-move-out': pendingMoveOutCount,
    extension: extensionTenants.length,
    overdue: overdueTenants.length,
    'moved-out': movedOutCount,
    archived: archivedTenants.length,
  };

  const filters = [
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'pending-move-out', label: 'Moving out', count: counts['pending-move-out'], dot: counts['pending-move-out'] > 0 },
    { key: 'extension', label: 'Extension requests', count: counts.extension, dot: counts.extension > 0 },
    { key: 'overdue', label: 'Overdue', count: counts.overdue },
    { key: 'moved-out', label: 'Moved out', count: counts['moved-out'] },
    { key: 'archived', label: 'Archived', count: counts.archived },
    { key: 'all', label: 'All', count: counts.all },
  ];

  // Determine displayed list
  let displayed;
  if (activeFilter === 'archived') {
    displayed = [...archivedTenants];
  } else if (activeFilter === 'all') {
    displayed = [...tenants, ...archivedTenants];
  } else if (activeFilter === 'active') {
    displayed = tenants.filter(t => t.status === 'active' || t.status === 'Approved');
  } else if (activeFilter === 'extension') {
    displayed = [...extensionTenants];
  } else if (activeFilter === 'overdue') {
    displayed = [...overdueTenants];
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
      'moved-out':      { style: 'bg-slate-100 text-slate-600', label: '○ Moved Out' },
      'archived':       { style: 'bg-violet-100 text-violet-700', label: '◇ Archived' },
    };
    const entry = map[status] || { style: 'bg-slate-100 text-slate-600', label: `○ ${status || 'Unknown'}` };
    return <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1 ${entry.style}`}>{entry.label}</span>;
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
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-block bg-red-50 text-red-700 ring-red-200 ring-1 ring-inset" title={`${t.daysOverdue} day(s) past due`}>
          Overdue ₱{Number(t.overdueBalance).toLocaleString()}
        </span>
      ) : t.paymentStatus === 'due' ? (
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-block bg-amber-50 text-amber-700 ring-amber-200 ring-1 ring-inset">
          Due ₱{Number(t.outstandingBalance).toLocaleString()}
        </span>
      ) : (
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-block bg-emerald-50 text-emerald-700 ring-emerald-200 ring-1 ring-inset">
          Paid up
        </span>
      )}
    </div>
  ) : null;

  const renderTenantDetails = (t) => (
    t.status === 'archived' ? (
      <div>
        <div>Archived: {t.archiveDate}</div>
        <div className="text-caption text-violet-700 font-semibold">{t.archiveReason}</div>
      </div>
    ) : t.status === 'Pending Review' ? (
      <span className="text-slate-500">Move-in date pending</span>
    ) : t.status === 'Approved' ? (
      <span className="text-sky-700 font-semibold">Pending move-in payment</span>
    ) : t.leaseEnd ? (
      <div>
        <div>Rent ends: {t.leaseEnd}</div>
        {daysRemaining(t.leaseEnd) > 0 && (
          <div className={`text-caption font-semibold ${daysRemaining(t.leaseEnd) <= 30 ? 'text-red-600' : 'text-slate-500'}`}>
            {daysRemaining(t.leaseEnd)} days remaining
          </div>
        )}
      </div>
    ) : t.status === 'pending-move-out' ? (
      <div>
        <div>Scheduled Out: {t.requestedMoveOutDate}</div>
        {daysRemaining(t.requestedMoveOutDate) > 0 ? (
          <div className="text-caption text-amber-700 font-semibold">
            {daysRemaining(t.requestedMoveOutDate)} days notice
          </div>
        ) : (
          <div className="text-caption text-red-600 font-semibold">Notice expired / due today</div>
        )}
      </div>
    ) : (
      <span className="text-slate-300">—</span>
    )
  );

  // A pending rent extension request: the months asked and the new end date.
  const renderExtensionChip = (t) => t.extensionRequest ? (
    <span className={badge('violet', 'mt-1')} title={`Requested ${String(t.extensionRequest.requestedAt || '').slice(0, 10)}`}>
      <FontAwesomeIcon icon={faCalendarPlus} aria-hidden="true" />
      Wants +{t.extensionRequest.months} mo
    </span>
  ) : null;

  const renderTenantActions = (t) => (
    <div className="flex flex-wrap items-center gap-2">
      {t.extensionRequest && (
        <>
          <button
            type="button"
            onClick={() => decideExtension(t, 'approve')}
            disabled={deciding === t.extensionRequest.id}
            className={btn('success', 'sm')}
            title={`Extend the rent by ${t.extensionRequest.months} month(s)`}
          >
            <FontAwesomeIcon icon={faCheckCircle} className="text-[10px]" /> Approve extension
          </button>
          <button
            type="button"
            onClick={() => decideExtension(t, 'reject')}
            disabled={deciding === t.extensionRequest.id}
            className={btn('danger-outline', 'sm')}
          >
            <FontAwesomeIcon icon={faTimesCircle} className="text-[10px]" /> Reject
          </button>
        </>
      )}
      <button
        onClick={() => openProfile(t)}
        className="flex items-center gap-1.5 text-indigo-600 font-semibold border-0 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-control text-label cursor-pointer transition-colors"
      >
        <FontAwesomeIcon icon={faEye} className="text-[10px]" /> View
      </button>
      {t.status === 'moved-out' && (
        <button
          onClick={() => openArchiveModal(t)}
          className="flex items-center gap-1.5 text-violet-600 font-semibold border-0 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-control text-label cursor-pointer transition-colors"
        >
          <FontAwesomeIcon icon={faArchive} className="text-[10px]" /> Archive
        </button>
      )}
      {t.status === 'archived' && (
        <button
          onClick={() => handleRestoreTenant(t.id)}
          className="flex items-center gap-1.5 text-emerald-700 font-semibold border-0 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-control text-label cursor-pointer transition-colors"
        >
          <FontAwesomeIcon icon={faCheckCircle} className="text-[10px]" /> Restore Tenant
        </button>
      )}
      {t.status === 'active' && (
        <button
          onClick={() => handleInitiateMoveOutClick(t)}
          className="flex items-center gap-1.5 text-amber-700 font-semibold border-0 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-control text-label cursor-pointer transition-colors"
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="text-[10px]" /> Move Out
        </button>
      )}
      {t.status === 'pending-move-out' && (
        <button
          onClick={() => openClearanceModal(t)}
          className="flex items-center gap-1.5 text-slate-600 font-semibold border-0 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-control text-label cursor-pointer transition-colors"
        >
          <FontAwesomeIcon icon={faCheckCircle} className="text-[10px]" /> Complete Move Out
        </button>
      )}
    </div>
  );

  const kpiStatus = tenantsState.isReady ? undefined : 'loading';
  const sortValue = `${sortBy}-${sortOrder}`;
  const emptyText = {
    extension: 'No rent extension requests are waiting.',
    overdue: 'Nobody is overdue.',
    'pending-move-out': 'Nobody is moving out.',
  }[activeFilter] || 'No tenants found matching your criteria.';

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left min-w-0">
        <Header title="Tenants" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Heading, as on the Dashboard and Reports */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-section font-semibold text-slate-900">Tenants</p>
                <p className="m-0 mt-0.5 text-label text-slate-500">Who is renting now, who is moving out, and the requests waiting for you.</p>
              </div>
            </div>

            {notice && (
              <div role="status" className={`flex items-start justify-between gap-3 rounded-card border px-4 py-3 text-label font-medium ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                <span>{notice.text}</span>
                <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="shrink-0 border-0 bg-transparent p-0 text-current cursor-pointer">
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            )}

            {/* Key figures; each card opens its list below */}
            <section aria-label="Key figures" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                icon={faUsers}
                showIconBadge={false}
                title="Active tenants"
                value={counts.active}
                color="emerald"
                subtext={awaitingMoveInCount > 0 ? `${awaitingMoveInCount} waiting to move in` : 'Renting a unit now'}
                tooltip="Tenants renting now, and approved applicants about to move in"
                status={kpiStatus}
                onClick={() => setActiveFilter('active')}
              />
              <StatCard
                icon={faSignOutAlt}
                showIconBadge={false}
                title="Moving out"
                value={counts['pending-move-out']}
                color={counts['pending-move-out'] > 0 ? 'amber' : 'slate'}
                subtext={counts['pending-move-out'] > 0 ? 'Notice given, clearance to do' : 'Nobody is moving out'}
                tooltip="Tenants who gave notice; complete their move-out clearance on the day"
                status={kpiStatus}
                onClick={() => setActiveFilter('pending-move-out')}
              />
              <StatCard
                icon={faCalendarPlus}
                showIconBadge={false}
                title="Extension requests"
                value={counts.extension}
                color={counts.extension > 0 ? 'violet' : 'slate'}
                subtext={counts.extension > 0 ? 'Waiting for your decision' : 'None waiting'}
                tooltip="Tenants asking to extend their rent; approve or reject them here"
                status={kpiStatus}
                onClick={() => setActiveFilter('extension')}
              />
              <StatCard
                icon={faExclamationTriangle}
                showIconBadge={false}
                title="Overdue"
                value={counts.overdue}
                color={counts.overdue > 0 ? 'red' : 'slate'}
                subtext={counts.overdue > 0 ? `${peso(overdueTotal)} past due` : 'Nobody is overdue'}
                tooltip="Current tenants with a bill past its due date"
                status={kpiStatus}
                onClick={() => setActiveFilter('overdue')}
              />
            </section>

            {/* The list */}
            <section aria-label="Tenant list" className={PANEL}>
              <div className={PANEL_HEADER}>
                <FilterTabs
                  label="Filter tenants by status"
                  value={activeFilter}
                  onChange={setActiveFilter}
                  options={filters.map(f => ({ value: f.key, label: f.label, count: tenantsState.isReady ? f.count : null, dot: !!f.dot }))}
                />
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px] lg:w-64 h-9 bg-white border border-slate-300 rounded-control px-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" aria-hidden="true" />
                    <input aria-label="Search tenants" maxLength={LIMITS.search} type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search name, unit or email" className="flex-1 min-w-0 bg-transparent text-label text-slate-700 outline-none p-0 border-0 placeholder-slate-400" />
                  </div>
                  <select
                    aria-label="Sort tenants"
                    value={sortValue}
                    onChange={e => { const [by, order] = e.target.value.split('-'); setSortBy(by); setSortOrder(order); }}
                    className="h-9 px-3 text-label font-medium border border-slate-300 rounded-control outline-none bg-white text-slate-700 focus:border-indigo-500 cursor-pointer"
                  >
                    {SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Table (md and up) */}
              <div className="hidden md:block table-scroll-x">
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Tenant</th>
                      <th className={TH}>Unit</th>
                      <th className={TH}>Status</th>
                      <th className={TH}>Details</th>
                      <th className={TH}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantsState.isLoading && <SkeletonRows cols={5} label="Loading tenants…" />}
                    {tenantsState.isError && <LoadErrorRow cols={5} title="Couldn't load tenants" onRetry={retryTenants} />}
                    {tenantsState.isReady && displayed.length === 0 && (
                      <tr><td colSpan="5" className="text-center py-12 text-slate-500 text-body">{emptyText}</td></tr>
                    )}
                    {tenantsState.isReady && displayed.map((t, idx) => (
                      <tr key={t.id || idx} className={TR}>
                        <td className={TD}>
                          <button type="button" onClick={() => openProfile(t)} className="flex items-center gap-3 border-0 bg-transparent p-0 text-left cursor-pointer group">
                            <PersonAvatar name={t.name} src={t.avatar} size="md" tone={t.status === 'archived' ? 'slate' : 'soft'} />
                            <span className="min-w-0">
                              <span className="block font-medium text-slate-800 group-hover:text-indigo-700">{t.name}</span>
                              <span className="block text-caption text-slate-500">{t.email}</span>
                            </span>
                          </button>
                        </td>
                        <td className={TD}>
                          <span className="font-semibold text-indigo-700">Unit {t.unit}</span>
                          {renderPaymentStanding(t)}
                        </td>
                        <td className={TD}>
                          <div className="flex flex-col items-start gap-1">
                            {getOccupancyBadge(t.status)}
                            {renderExtensionChip(t)}
                          </div>
                        </td>
                        <td className={`${TD} text-label text-slate-500`}>{renderTenantDetails(t)}</td>
                        <td className={TD}>{renderTenantActions(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards (phones) */}
              <div className="md:hidden divide-y divide-slate-100">
                {tenantsState.isLoading && <div className="p-4"><SkeletonCards count={3} className="space-y-3" label="Loading tenants…" /></div>}
                {tenantsState.isError && <LoadError title="Couldn't load tenants" onRetry={retryTenants} />}
                {tenantsState.isReady && displayed.length === 0 && (
                  <div className="text-center py-12 text-slate-500 text-body">{emptyText}</div>
                )}
                {tenantsState.isReady && displayed.map((t, idx) => (
                  <div key={t.id || idx} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => openProfile(t)} className="flex items-center gap-3 min-w-0 border-0 bg-transparent p-0 text-left cursor-pointer">
                        <PersonAvatar name={t.name} src={t.avatar} size="md" tone={t.status === 'archived' ? 'slate' : 'soft'} />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800 truncate">{t.name}</span>
                          <span className="block text-caption text-slate-500 truncate">{t.email}</span>
                        </span>
                      </button>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {getOccupancyBadge(t.status)}
                        {renderExtensionChip(t)}
                      </div>
                    </div>
                    <div className="space-y-2 text-body">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Unit</span>
                        <div className="text-right">
                          <span className="font-semibold text-indigo-700">Unit {t.unit}</span>
                          {renderPaymentStanding(t)}
                        </div>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Details</span>
                        <div className="text-right text-label text-slate-500">{renderTenantDetails(t)}</div>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100">{renderTenantActions(t)}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* ─── TENANT PROFILE MODAL ─── */}
      {showProfileModal && selectedTenant && (
        <Modal title={`${selectedTenant.name}`} onClose={() => setShowProfileModal(false)} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            
            {/* Modal Header: picture (or initials), name, unit, status, contact */}
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <PersonAvatar name={selectedTenant.name} src={selectedTenant.avatar} size="lg" tone={selectedTenant.status === 'archived' ? 'slate' : 'soft'} />
                  <div className="min-w-0">
                    <h3 className="m-0 text-title font-semibold text-slate-900 truncate">{selectedTenant.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-label font-semibold text-indigo-700">Unit {selectedTenant.unit}</span>
                      {getOccupancyBadge(selectedTenant.status)}
                      {selectedTenant.status === 'archived' && <span className={badge('violet')}>Read-only</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-label text-slate-600">
                      {selectedTenant.email && (
                        <a href={`mailto:${selectedTenant.email}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-indigo-700 no-underline min-w-0">
                          <FontAwesomeIcon icon={faEnvelope} className="text-slate-400 text-xs" aria-hidden="true" />
                          <span className="truncate">{selectedTenant.email}</span>
                        </a>
                      )}
                      {selectedTenant.phone && (
                        <a href={`tel:${selectedTenant.phone}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-indigo-700 no-underline">
                          <FontAwesomeIcon icon={faPhone} className="text-slate-400 text-xs" aria-hidden="true" />
                          {selectedTenant.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <button aria-label="Close" onClick={() => setShowProfileModal(false)} className="shrink-0 text-slate-500 hover:text-slate-700 w-8 h-8 rounded-control hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                  <FontAwesomeIcon icon={faTimes} className="text-base" />
                </button>
              </div>

              {/* At a glance */}
              <dl className="m-0 mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-control bg-slate-50 border border-slate-100 px-3 py-2">
                  <dt className="text-caption text-slate-500">Monthly rent</dt>
                  <dd className="m-0 text-body font-semibold text-slate-900">{selectedTenant.rent || '—'}</dd>
                </div>
                <div className="rounded-control bg-slate-50 border border-slate-100 px-3 py-2">
                  <dt className="text-caption text-slate-500">Moved in</dt>
                  <dd className="m-0 text-body font-semibold text-slate-900">{selectedTenant.status === 'Approved' ? 'Not yet' : (String(selectedTenant.moveIn || '').slice(0, 10) || '—')}</dd>
                </div>
                <div className="rounded-control bg-slate-50 border border-slate-100 px-3 py-2">
                  <dt className="text-caption text-slate-500">Rent ends</dt>
                  <dd className="m-0 text-body font-semibold text-slate-900">
                    {selectedTenant.leaseEnd || '—'}
                    {CURRENT_STATUSES.includes(selectedTenant.status) && selectedTenant.leaseEnd && daysRemaining(selectedTenant.leaseEnd) > 0 && (
                      <span className={`block text-caption font-medium ${daysRemaining(selectedTenant.leaseEnd) <= 30 ? 'text-red-600' : 'text-slate-500'}`}>{daysRemaining(selectedTenant.leaseEnd)} days left</span>
                    )}
                  </dd>
                </div>
                <div className="rounded-control bg-slate-50 border border-slate-100 px-3 py-2">
                  <dt className="text-caption text-slate-500">Balance</dt>
                  <dd className={`m-0 text-body font-semibold ${selectedTenant.paymentStatus === 'overdue' ? 'text-red-700' : selectedTenant.paymentStatus === 'due' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {selectedTenant.status === 'archived' || !selectedTenant.paymentStatus ? '—'
                      : selectedTenant.paymentStatus === 'overdue' ? `${peso(selectedTenant.overdueBalance)} overdue`
                      : selectedTenant.paymentStatus === 'due' ? `${peso(selectedTenant.outstandingBalance)} due`
                      : 'Paid up'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 px-3 sm:px-6 shrink-0 bg-white overflow-x-auto">
              {[
                { key: 'overview', label: 'Overview', icon: faUser },
                { key: 'lease', label: 'Rent Timeline', icon: faCalendarAlt },
                { key: 'payments', label: 'Payment History', icon: faDollarSign },
                { key: 'maintenance', label: 'Maintenance', icon: faWrench },
              ].map(tab => (
                <button
                  key={tab.key} onClick={() => setProfileTab(tab.key)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-3 text-label font-medium whitespace-nowrap border-b-2 transition-all -mb-px border-t-0 border-x-0 bg-transparent cursor-pointer ${
                    profileTab === tab.key ? 'text-indigo-700 border-b-indigo-600 font-semibold' : 'text-slate-500 border-b-transparent hover:text-slate-700'
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
                  {/* Rent extension request waiting for a decision */}
                  {selectedTenant.extensionRequest && (() => {
                    const req = selectedTenant.extensionRequest;
                    const newEnd = addMonthsYmd(selectedTenant.leaseEnd, req.months);
                    const blocked = Number(selectedTenant.overdueBalance) > 0;
                    return (
                      <div className="rounded-card border border-violet-200 bg-violet-50 p-4">
                        <div className="flex items-start gap-3">
                          <span className="w-9 h-9 shrink-0 rounded-control bg-white text-violet-700 flex items-center justify-center border border-violet-200" aria-hidden="true">
                            <FontAwesomeIcon icon={faCalendarPlus} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-body font-semibold text-violet-900">Asked to extend the rent by {req.months} month{req.months === 1 ? '' : 's'}</p>
                            <p className="m-0 mt-0.5 text-label text-violet-800">
                              Requested {String(req.requestedAt || '').slice(0, 10)}.
                              {newEnd ? ` The rent would end on ${newEnd} instead of ${selectedTenant.leaseEnd}.` : ''}
                            </p>
                            {blocked && (
                              <p className="m-0 mt-2 text-label font-semibold text-red-700">
                                {peso(selectedTenant.overdueBalance)} is overdue: approval is refused until it is paid.
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={() => decideExtension(selectedTenant, 'approve')} disabled={deciding === req.id} className={btn('success', 'sm')}>
                                <FontAwesomeIcon icon={faCheckCircle} /> {deciding === req.id ? 'Working…' : 'Approve extension'}
                              </button>
                              <button type="button" onClick={() => decideExtension(selectedTenant, 'reject')} disabled={deciding === req.id} className={btn('danger-outline', 'sm')}>
                                <FontAwesomeIcon icon={faTimesCircle} /> Reject
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Details */}
                  <dl className="m-0 rounded-card border border-slate-200 divide-y divide-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-4 py-3">
                      <dt className="text-label font-medium text-slate-500">Previous address</dt>
                      <dd className="m-0 sm:col-span-2 text-body text-slate-800 wrap-break-word">{selectedTenant.previousAddress || '—'}</dd>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-4 py-3">
                      <dt className="text-label font-medium text-slate-500">Emergency contact</dt>
                      <dd className="m-0 sm:col-span-2 text-body text-slate-800 wrap-break-word">
                        {selectedTenant.emergencyContact ? (
                          <>
                            {selectedTenant.emergencyContact.name} ({selectedTenant.emergencyContact.relationship}) ·{' '}
                            <a href={`tel:${selectedTenant.emergencyContact.phone}`} className="text-indigo-700 font-semibold hover:underline">{selectedTenant.emergencyContact.phone}</a>
                          </>
                        ) : (
                          <span className="text-slate-500">Not given yet. Ask the tenant to add one in Profile Settings.</span>
                        )}
                      </dd>
                    </div>
                    {selectedTenant.contractStatus && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-4 py-3">
                        <dt className="text-label font-medium text-slate-500">Contract</dt>
                        <dd className="m-0 sm:col-span-2 text-body text-slate-800 capitalize">{String(selectedTenant.contractStatus).replace(/-/g, ' ')}</dd>
                      </div>
                    )}
                  </dl>

                  {CURRENT_STATUSES.includes(selectedTenant.status) && (
                    <AdminHouseholdList userId={selectedTenant.user_id} />
                  )}

                  {/* Verification Documents (Settings → Application Requirements) */}
                  {((selectedTenant.documents || []).length > 0 || (selectedTenant.missingDocuments || []).length > 0 || selectedTenant.documentsVerifiedAt) && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                       <p className="text-label font-medium text-slate-600 mb-2 m-0">Verification Documents</p>
                       {selectedTenant.documentsVerifiedAt && !(selectedTenant.documents || []).length && (
                         <p className="m-0 mb-2 text-label font-semibold text-emerald-700">Verified in person by the office on {String(selectedTenant.documentsVerifiedAt).slice(0, 10)}.</p>
                       )}
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         {(selectedTenant.documents || []).map((doc) => (
                           <a key={doc.id} href={fileUrl(doc.file_path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 text-body hover:underline p-2 bg-indigo-50 rounded-control"><FontAwesomeIcon icon={faFileAlt} /> {doc.label}</a>
                         ))}
                         {!selectedTenant.documentsVerifiedAt && (selectedTenant.missingDocuments || []).map((label) => (
                           <span key={`missing-${label}`} className="flex items-center gap-2 text-slate-500 text-body p-2 bg-slate-50 border border-dashed border-slate-200 rounded-control"><FontAwesomeIcon icon={faFileAlt} /> {label} <span className="ml-auto text-label font-medium">Missing</span></span>
                         ))}
                       </div>
                    </div>
                  )}

                  {/* Archived Tenant Info */}
                  {selectedTenant.status === 'archived' && (
                    <div className="bg-violet-50 border border-violet-200 rounded-card p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faArchive} className="text-violet-600" />
                        <span className="text-body font-bold text-violet-800">Archived Tenant Record</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-label">
                        <div><span className="text-violet-500">Archive Date:</span> <span className="font-semibold text-slate-700">{selectedTenant.archiveDate}</span></div>
                        <div><span className="text-violet-500">Moved Out:</span> <span className="font-semibold text-slate-700">{selectedTenant.movedOutDate}</span></div>
                        <div><span className="text-violet-500">Reason:</span> <span className="font-semibold text-slate-700">{selectedTenant.archiveReason}</span></div>
                        {selectedTenant.archiveNotes && (
                          <div className="col-span-2"><span className="text-violet-500">Notes:</span> <span className="font-semibold text-slate-700">{selectedTenant.archiveNotes}</span></div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Deposit outcome of a moved-out/archived tenant (get_tenants.php, admin only) */}
                  {['moved-out', 'archived'].includes(selectedTenant.status) && selectedTenant.depositOutcome && (
                    <DepositOutcome deposit={selectedTenant.depositOutcome} className="" />
                  )}

                  {/* Actions for non-archived tenants. Pending Review applications are
                      handled on the Applications page (AdminApplications.jsx) — this
                      page's tenant list already excludes that status (see the filter
                      above), so no approve/reject action exists here. */}
                  {selectedTenant.status !== 'archived' && (selectedTenant.status === 'active' || selectedTenant.status === 'Approved') && (
                    <button 
                      onClick={() => handleInitiateMoveOutClick(selectedTenant)} 
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-amber-500 text-white p-2.5 rounded-control border-0 cursor-pointer text-body font-semibold hover:bg-amber-600 transition-colors"
                    >
                      <FontAwesomeIcon icon={faSignOutAlt} /> Initiate Move Out
                    </button>
                  )}
                  {selectedTenant.status === 'pending-move-out' && (
                    <button 
                      onClick={() => openClearanceModal(selectedTenant)} 
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-600 text-white p-2.5 rounded-control border-0 cursor-pointer text-body font-semibold hover:bg-slate-700 transition-colors"
                    >
                      <FontAwesomeIcon icon={faCheckCircle} /> Complete Move Out
                    </button>
                  )}
                  {selectedTenant.status === 'moved-out' && (
                    <button
                      onClick={() => { setShowProfileModal(false); openArchiveModal(selectedTenant); }}
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-violet-600 text-white p-2.5 rounded-control border-0 cursor-pointer text-body font-semibold hover:bg-violet-700 transition-colors"
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
                          <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white shadow-card ${
                            entry.event.includes('End') || entry.event.includes('Moved') ? 'bg-red-500' : 
                            entry.event.includes('Contract') ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}></div>
                          <div className="bg-slate-50 rounded-control p-3 border border-slate-100 ml-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-label font-bold text-slate-800">{entry.event}</span>
                              <span className="text-caption text-slate-500 font-semibold">{entry.date}</span>
                            </div>
                            <p className="text-caption text-slate-500 m-0">{entry.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-300 text-3xl mb-3 block mx-auto" />
                      <p className="text-body text-slate-500 m-0">No rent timeline data available for this tenant.</p>
                      {selectedTenant.moveIn && (
                        <div className="mt-4 bg-slate-50 rounded-control p-3 border border-slate-100 text-label text-slate-500 inline-block">
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
                    <div className="card-interactive bg-emerald-50 border border-emerald-100 rounded-control p-3 text-center">
                      <p className="text-title font-bold text-emerald-700 m-0">₱{totalPaid.toLocaleString()}</p>
                      <p className="text-caption text-emerald-700 font-semibold m-0 mt-0.5">Total Paid</p>
                    </div>
                    <div className="card-interactive bg-indigo-50 border border-indigo-100 rounded-control p-3 text-center">
                      <p className="text-title font-bold text-indigo-700 m-0">{monthsPaid}</p>
                      <p className="text-caption text-indigo-600 font-semibold m-0 mt-0.5">Invoices Paid</p>
                    </div>
                    <div className="card-interactive bg-red-50 border border-red-100 rounded-control p-3 text-center">
                      <p className="text-title font-bold text-red-700 m-0">{overdueCount}</p>
                      <p className="text-caption text-red-600 font-semibold m-0 mt-0.5">Overdue Invoices</p>
                    </div>
                    <div className="card-interactive bg-slate-50 border border-slate-200 rounded-control p-3 text-center">
                      <p className="text-body font-bold text-slate-700 m-0 truncate">{lastPayment}</p>
                      <p className="text-caption text-slate-500 font-semibold m-0 mt-0.5">Last Payment</p>
                    </div>
                  </div>

                  {tenantInvoices.length > 0 ? (
                    <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-1">
                      <p className="text-label font-medium text-slate-600">Invoices list</p>
                      {tenantInvoices.map((entry, idx) => (
                        <div key={idx} className="flex items-start justify-between p-3 bg-slate-50 rounded-control border border-slate-100">
                          <div className="flex items-start gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-label font-bold shrink-0 mt-0.5 ${
                              entry.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                            }`}>
                              ₱
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="text-body font-bold text-slate-800 m-0">₱{Number(entry.total_amount).toLocaleString()}</p>
                                <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${
                                  entry.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {entry.status.toUpperCase()}
                                </span>
                              </div>
                              <p className="text-caption text-slate-500 m-0 mt-0.5">
                                {entry.billing_period || 'Initial Rent Payment'} · Due: {entry.due_date}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-caption text-slate-500">
                            <div className="font-mono text-indigo-600">{entry.invoice_number}</div>
                            {entry.paid_at && <div className="mt-0.5">Paid: {entry.paid_at.split(' ')[0]}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-body">No payments recorded.</div>
                  )}
                </div>
              )}

              {/* Maintenance Tab */}
              {profileTab === 'maintenance' && (
                <div className="space-y-3">
                  {tenantMaintenance.length > 0 ? (
                    tenantMaintenance.map((req, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-control border border-slate-100">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-label ${
                          req.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          <FontAwesomeIcon icon={faWrench} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-body font-medium text-slate-800 m-0">{req.category} - {req.description}</p>
                          <p className="text-caption text-slate-500 m-0 mt-0.5">
                            Status: {req.status} {req.estimatedCost ? `· Cost: ₱${req.estimatedCost.toLocaleString()}` : ''}
                          </p>
                        </div>
                        <span className="text-caption text-slate-500 shrink-0">{req.dateSubmitted}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <FontAwesomeIcon icon={faWrench} className="text-slate-300 text-3xl mb-3 block mx-auto" />
                      <p className="text-body text-slate-500 m-0">No maintenance requests recorded for this tenant.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Modal>
      )}

      {/* ─── ARCHIVE CONFIRMATION MODAL ─── */}
      {showArchiveModal && archiveTarget && (
        <Modal busy={!!savingAction} title="Archive Tenant" onClose={() => setShowArchiveModal(false)} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-card bg-violet-100 text-violet-600 flex items-center justify-center">
                  <FontAwesomeIcon icon={faArchive} />
                </div>
                <div>
                  <h3 className="text-title font-bold text-slate-800 m-0">Archive Tenant</h3>
                  <p className="text-label text-slate-500 m-0 mt-0.5">Preserve tenant history and remove from active list</p>
                </div>
              </div>
              <button aria-label="Close" onClick={() => setShowArchiveModal(false)} className="text-slate-500 hover:text-slate-600 p-1 rounded-control hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} className="text-base" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Tenant Info Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-control p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    {(archiveTarget.name || '').charAt(0)}
                  </div>
                  <div>
                    <p className="text-body font-bold text-slate-800 m-0">{archiveTarget.name}</p>
                    <p className="text-caption text-slate-500 m-0">Unit {archiveTarget.unit} · {archiveTarget.rent}</p>
                  </div>
                </div>
              </div>

              {/* Archive Reason */}
              <div>
                <label htmlFor="tenant-archiveReason" className="block text-label font-medium text-slate-600 mb-1">Archive Reason *</label>
                <select
                  {...tenantForms.fieldA11y('archiveReason')}
                  value={archiveReason}
                  onChange={(e) => { setArchiveReason(e.target.value); tenantForms.clearError('archiveReason'); }}
                  className={`w-full px-3 py-2.5 text-body border border-slate-200 rounded-control outline-none focus:border-violet-500 bg-white text-slate-800${invalidCls(tenantForms.errors.archiveReason)}`}
                >
                  {archiveReasons.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <FieldError id="tenant-archiveReason" error={tenantForms.errors.archiveReason} />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="tenant-archiveNotes" className="block text-label font-medium text-slate-600 mb-1">Additional Notes</label>
                <textarea
                  {...tenantForms.fieldA11y('archiveNotes')}
                  value={archiveNotes}
                  maxLength={LIMITS.notes}
                  onChange={(e) => { setArchiveNotes(e.target.value); tenantForms.clearError('archiveNotes'); }}
                  onBlur={() => { const v = archiveNotes.trim(); setArchiveNotes(v); tenantForms.validateField('archiveNotes', { ...tenantValues, archiveNotes: v }); }}
                  rows={3}
                  placeholder="Optional notes about this archival..."
                  className={`w-full px-3 py-2 text-body border border-slate-200 rounded-control outline-none focus:border-violet-500 bg-white text-slate-700 resize-y${invalidCls(tenantForms.errors.archiveNotes)}`}
                />
                <FieldError id="tenant-archiveNotes" error={tenantForms.errors.archiveNotes} />
                <CharCount value={archiveNotes} max={LIMITS.notes} />
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-control p-3 flex items-start gap-2">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-700 mt-0.5 text-xs" />
                <p className="text-caption text-amber-700 m-0">
                  This will archive the tenant's record. Their rent history, payment records, and maintenance requests will be preserved for reference. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-card">
              <button onClick={() => setShowArchiveModal(false)} className="px-4 py-2 text-body text-slate-600 font-medium hover:bg-slate-100 rounded-control border-0 bg-transparent cursor-pointer">Cancel</button>
              <button type="button" onClick={handleArchiveTenant} disabled={!!savingAction} className="px-5 py-2 bg-violet-600 text-white rounded-control text-body font-semibold hover:bg-violet-700 shadow-card border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <FontAwesomeIcon icon={faArchive} className="mr-1.5" /> Confirm Archive
              </button>
            </div>
          </Modal>
      )}
        {/* ─── ADMIN MOVE OUT SCHEDULING MODAL ─── */}
        {showMoveOutModal && moveOutTarget && (
          <Modal busy={!!savingAction} title="Schedule Move-Out" onClose={() => setShowMoveOutModal(false)} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-card bg-amber-100 text-amber-700 flex items-center justify-center">
                    <FontAwesomeIcon icon={faSignOutAlt} />
                  </div>
                  <div>
                    <h3 className="text-title font-bold text-slate-800 m-0">Schedule Move-Out</h3>
                    <p className="text-label text-slate-500 m-0 mt-0.5">Set planned move-out date for tenant</p>
                  </div>
                </div>
                <button aria-label="Close" onClick={() => setShowMoveOutModal(false)} className="text-slate-500 hover:text-slate-600 p-1 rounded-control hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                  <FontAwesomeIcon icon={faTimes} className="text-base" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Tenant Summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-control p-3 text-left">
                  <p className="text-body font-bold text-slate-800 m-0">{moveOutTarget.name}</p>
                  <p className="text-label text-slate-500 m-0 mt-0.5">Unit {moveOutTarget.unit} · {moveOutTarget.rent}</p>
                </div>

                {/* Policy alert */}
                <div className="bg-amber-50 border border-amber-200 rounded-control p-3 flex items-start gap-2 text-left">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-700 mt-0.5 text-xs shrink-0" />
                  <p className="text-caption text-amber-700 m-0">
                    Prior notice of at least <strong>15 days</strong> but less than <strong>30 days</strong> is required before the Tenant's actual move-out date.
                  </p>
                </div>

                {/* Date Picker */}
                <div className="text-left">
                  <label htmlFor="tenant-requested_move_out_date" className="block text-label font-medium text-slate-600 mb-1">Planned Move-Out Date *</label>
                  <input
                    type="date"
                    {...tenantForms.fieldA11y('requested_move_out_date')}
                    value={moveOutDate}
                    min={addDays(moveOutWindow.min)}
                    max={addDays(moveOutWindow.max)}
                    onChange={(e) => { setMoveOutDate(e.target.value); tenantForms.clearError('requested_move_out_date'); }}
                    onBlur={() => blurTenantField('requested_move_out_date')}
                    className={`w-full px-3 py-2.5 text-body border border-slate-200 rounded-control outline-none focus:border-indigo-500 bg-white text-slate-800${invalidCls(tenantForms.errors.requested_move_out_date)}`}
                    required
                  />
                  <FieldError id="tenant-requested_move_out_date" error={tenantForms.errors.requested_move_out_date} />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-card">
                <button type="button" onClick={() => setShowMoveOutModal(false)} className="px-4 py-2 text-body text-slate-600 font-medium hover:bg-slate-100 rounded-control border-0 bg-transparent cursor-pointer">Cancel</button>
                <button type="button" onClick={handleConfirmMoveOut} disabled={!!savingAction} className="px-5 py-2 bg-amber-600 text-white rounded-control text-body font-semibold hover:bg-amber-700 shadow-card border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {savingAction === 'moveout' ? 'Saving…' : 'Confirm Schedule'}
                </button>
              </div>
            </Modal>
        )}
        {/* ─── MOVE-OUT INSPECTION & CLEARANCE MODAL ─── */}
        {showClearanceModal && clearanceTarget && (
          <Modal busy={!!savingAction} title="Move-Out Inspection & Clearance" onClose={() => setShowClearanceModal(false)} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-lg mx-4 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-card bg-slate-800 text-white flex items-center justify-center font-bold">
                    <FontAwesomeIcon icon={faClipboardCheck} />
                  </div>
                  <div>
                    <h3 className="text-title font-bold text-slate-800 m-0">Move-Out Inspection & Clearance</h3>
                    <p className="text-label text-slate-500 m-0 mt-0.5">Physical inspection, deposit deductions, & utility settlement</p>
                  </div>
                </div>
                <button aria-label="Close" onClick={() => setShowClearanceModal(false)} className="text-slate-500 hover:text-slate-600 p-1 rounded-control hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                  <FontAwesomeIcon icon={faTimes} className="text-base" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-left max-h-[75vh] overflow-y-auto">
                {/* Tenant Summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-card p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-body font-bold text-slate-800 m-0">{clearanceTarget.name}</p>
                    <p className="text-label text-slate-500 m-0 mt-0.5">Unit {clearanceTarget.unit} · {clearanceTarget.rent}/mo</p>
                  </div>
                  <span className="text-label font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                    Pending Clearance
                  </span>
                </div>

                {/* Section 1: Itemized deductions (deposit_deductions): category, reason, amount per line */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-label font-medium text-slate-700">
                    1. Deductions from the deposit
                  </label>
                  <p className="m-0 text-caption text-slate-500">One line per deduction: damage found at inspection, unpaid electricity or water, unpaid rent. The tenant sees each line.</p>
                  {deductionLines.length === 0 && (
                    <p className="m-0 rounded-control bg-slate-50 px-3 py-2 text-label text-slate-500">No deductions. The deposit is applied in full.</p>
                  )}
                  {deductionLines.map((line, i) => {
                    const err = deductionErrors[i] || {};
                    return (
                      <div key={line.key} className="grid grid-cols-12 gap-2 rounded-card border border-slate-200 p-2.5">
                        <label className="col-span-12 sm:col-span-4 text-label font-medium text-slate-600 capitalize">Category
                          <select value={line.category} onChange={(e) => editDeduction(i, { category: e.target.value })}
                            className={`mt-1 w-full px-2 py-2 text-body border rounded-control outline-none focus:border-indigo-500 text-slate-800 normal-case font-normal ${err.category ? 'border-red-400' : 'border-slate-200'}`}>
                            {DEDUCTION_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <label className="col-span-12 sm:col-span-8 text-label font-medium text-slate-600 capitalize">Reason
                          <input type="text" value={line.reason} maxLength={255} autoComplete="off" aria-invalid={!!err.reason}
                            onChange={(e) => editDeduction(i, { reason: e.target.value })}
                            onBlur={() => editDeduction(i, { reason: line.reason.trim() }, true)}
                            placeholder="e.g. Broken window, final Meralco bill"
                            className={`mt-1 w-full px-3 py-2 text-body border rounded-control outline-none focus:border-indigo-500 text-slate-800 normal-case font-normal ${err.reason ? 'border-red-400' : 'border-slate-200'}`} />
                        </label>
                        <label className="col-span-8 sm:col-span-5 text-label font-medium text-slate-600 capitalize">Amount (₱)
                          <input type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" value={line.amount} aria-invalid={!!err.amount}
                            onKeyDown={blockNonNumericKeys}
                            onChange={(e) => editDeduction(i, { amount: e.target.value })}
                            onBlur={() => editDeduction(i, {}, true)}
                            placeholder="0.00"
                            className={`mt-1 w-full px-3 py-2 text-body border rounded-control outline-none focus:border-indigo-500 font-bold text-slate-800 ${err.amount ? 'border-red-400' : 'border-slate-200'}`} />
                        </label>
                        <div className="col-span-4 sm:col-span-7 flex items-end justify-end">
                          <button type="button" onClick={() => removeDeduction(i)} className="cursor-pointer border-0 bg-transparent p-1 text-label font-bold text-red-600 hover:underline">Remove</button>
                        </div>
                        {(err.category || err.reason || err.amount) && (
                          <p role="alert" className="col-span-12 m-0 text-label font-semibold text-red-600">{err.category || err.reason || err.amount}</p>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" onClick={addDeduction} disabled={deductionLines.length >= MAX_DEDUCTION_LINES}
                    className={btn('secondary', 'sm')}>
                    + Add deduction
                  </button>
                </div>

                {/* Section 2: Inspection notes */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label htmlFor="tenant-damage_notes" className="block text-label font-medium text-slate-700">2. Inspection notes (optional)</label>
                  <input
                    type="text"
                    {...tenantForms.fieldA11y('damage_notes')}
                    autoComplete="off"
                    value={damageNotes}
                    maxLength={LIMITS.reason}
                    onChange={(e) => { setDamageNotes(e.target.value); tenantForms.clearError('damage_notes'); }}
                    onBlur={() => { const v = damageNotes.trim(); setDamageNotes(v); tenantForms.validateField('damage_notes', { ...tenantValues, damage_notes: v }); }}
                    className={`w-full px-3 py-2 text-body border border-slate-200 rounded-control outline-none focus:border-indigo-500 text-slate-800${invalidCls(tenantForms.errors.damage_notes)}`}
                    placeholder="e.g., Keys returned, unit cleaned"
                  />
                  <FieldError id="tenant-damage_notes" error={tenantForms.errors.damage_notes} />
                </div>

                {/* Section 3: Security deposit calculation */}
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-card p-4 space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-label font-medium text-indigo-900 m-0">
                    3. Security Deposit Settlement Calculation
                  </label>
                  <div className="space-y-1.5 text-label text-slate-600 pt-1">
                    <div className="flex justify-between">
                      <span>Initial Security Deposit:</span>
                      <span className="font-semibold text-slate-800">₱{clearanceDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {deductionLines.filter((l) => money(l.amount) > 0).map((l) => (
                      <div key={l.key} className="flex justify-between text-red-600">
                        <span>Less: {deductionLabel(l.category)}{l.reason.trim() ? ` – ${l.reason.trim()}` : ''}</span>
                        <span className="font-semibold">-₱{money(l.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold text-red-700">
                      <span>Total deductions:</span>
                      <span>-₱{deductionTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t border-indigo-200 pt-2 flex justify-between font-bold text-body text-indigo-950">
                      <span>{deductionTotal + clearanceOwed > clearanceDeposit ? 'Balance still due from the tenant:' : 'Deposit left after deductions:'}</span>
                      <span className={deductionTotal + clearanceOwed > clearanceDeposit ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}>
                        ₱{Math.abs(clearanceDeposit - deductionTotal - clearanceOwed).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {clearanceOwed > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Less: unpaid invoices</span>
                        <span className="font-semibold">-₱{clearanceOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {clearanceOwed > 0 && clearanceDeposit > 0 && (
                      <p className="m-0 text-label text-slate-600">Unpaid invoices are marked paid from the deposit, oldest first. Any the deposit does not reach stay owed.</p>
                    )}
                    {clearanceBilled > 0 && (
                      <p className="m-0 text-label font-semibold text-red-600">₱{clearanceBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })} of the deductions will be billed to the tenant as a Move-out balance invoice.</p>
                    )}
                    {clearanceDeposit > 0 && (
                      <div className="rounded-control bg-white border border-indigo-100 p-3 space-y-1.5 mt-1">
                        <p className="m-0 text-caption text-slate-600">The deposit covers only unpaid bills and the itemized deductions above; the rest is returned to the tenant (RA 9653 Sec. 7).</p>
                        <label htmlFor="deposit-interest" className="block text-caption text-slate-600">Bank interest earned on the deposit (returned with it, optional):</label>
                        <input id="deposit-interest" type="number" inputMode="decimal" min={0} step="0.01" value={depositInterest} onChange={(e) => setDepositInterest(e.target.value)}
                          className="w-40 rounded-control border border-slate-300 px-3 py-2 text-body" />
                        <div className="flex justify-between font-bold text-body text-emerald-700">
                          <span>To be refunded to the tenant:</span>
                          <span>₱{clearanceRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                <button onClick={() => setShowClearanceModal(false)} className="px-4 py-2 text-body text-slate-600 font-medium hover:bg-slate-100 rounded-control border-0 bg-transparent cursor-pointer">Cancel</button>
                <button type="button" onClick={handleConfirmClearance} disabled={!!savingAction} className="px-5 py-2.5 bg-slate-800 text-white rounded-control text-body font-semibold hover:bg-slate-900 shadow-card border-0 cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <FontAwesomeIcon icon={faCheckCircle} /> Confirm Clearance & Complete Move Out
                </button>
              </div>
            </Modal>
        )}
    </div>
  );
};

export default AdminTenants;