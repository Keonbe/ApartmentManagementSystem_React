import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faSearch, faTimes, faEye, faDownload,
  faCheckCircle, faClock, faExclamationTriangle, faFileSignature,
  faArrowRight, faArrowLeft, faPrint, faEdit, faUpload, faShieldAlt,
  faGavel, faFileUpload, faFile, faTimesCircle, faInfoCircle,
  faFileContract, faExternalLinkAlt
} from '@fortawesome/free-solid-svg-icons';
import ContractDocument from '../Components/contract/ContractDocument';
import AdminContractEditor from './AdminContractEditor';
import { fetchContractTemplate } from '../Components/contract/contractTemplate';
import { getSystemSettings } from '../config/systemSettings';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { LIMITS, MAX_AMOUNT, checkAmount, checkDate, checkDateRange, maxFutureDate } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import { printElement } from '../utils/print';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import ReasonModal from '../Components/form/ReasonModal';
import { blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';
import Modal from '../Components/admin/Modal';
import useUrlFilter from '../hooks/useUrlFilter';
import { TH, THEAD, btn } from '../Components/admin/ui/styles';
import { LoadErrorRow } from '../Components/admin/ui/LoadError';
import { SkeletonRows } from '../Components/admin/ui/Skeleton';
import useLoadState from '../hooks/useLoadState';
import { personName } from '../utils/personName';

const MAX_LEASE_MONTHS = 24;
const DATE_INPUT = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-control outline-none text-slate-800 bg-white focus:border-indigo-500';

// Lease end: a real date after the start, at most 24 months later.
const checkLeaseEnd = (start, end) => {
  const base = checkDate(end, { label: 'Rent end', max: maxFutureDate() })
    || checkDateRange(start, end, { startLabel: 'Rent start', endLabel: 'Rent end' });
  if (base || !start) return base;
  if (end === start) return 'Rent end must be after the rent start.';
  const maxEnd = new Date(`${start}T00:00:00`);
  maxEnd.setMonth(maxEnd.getMonth() + MAX_LEASE_MONTHS);
  return new Date(`${end}T00:00:00`) > maxEnd ? `The maximum rent period is ${MAX_LEASE_MONTHS} months.` : '';
};
const LEASE_VALIDATORS = {
  leaseStart: (v) => checkDate(v, { label: 'Rent start', max: maxFutureDate() }),
  leaseEnd: (v, all) => checkLeaseEnd(all.leaseStart, v),
};

const statusConfig = {
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-700 border-red-200' },
  draft: { label: 'Draft', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  terminated: { label: 'Terminated', color: 'bg-slate-200 text-slate-700 border-slate-300' },
  'eviction-pending': { label: 'Eviction Pending', color: 'bg-red-200 text-red-900 border-red-300' },
};

// Unknown/blank statuses must not borrow the green "Active" styling.
const UNKNOWN_STATUS = { label: 'Unknown', color: 'bg-slate-100 text-slate-600 border-slate-200' };
const statusOf = (s) => statusConfig[String(s || '').toLowerCase()] || UNKNOWN_STATUS;

const formatCurrency = (n) => (Number.isFinite(Number(n)) ? `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');

// A contract still in force that lacks its signed or notarised copy (same rule as
// the Dashboard's "missing documents" count in dashboard_stats.php).
const IN_FORCE = ['draft', 'active', 'eviction-pending'];
const missingDocs = (c) => IN_FORCE.includes(String(c.status || '').toLowerCase()) && (!c.signedLease?.uploaded || !c.notarizedLease?.uploaded);
// An active contract whose rent term ends within `days` (from today).
const endingSoon = (c, days) => {
  if (String(c.status || '').toLowerCase() !== 'active' || !c.leaseEnd) return false;
  const end = new Date(c.leaseEnd + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = (end - today) / 86400000;
  return diff >= 0 && diff <= days;
};

const AdminContracts = ({ defaultTab = 'contracts' }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || defaultTab;
  // Keeps the other params (the status filter from a Dashboard link) when the tab changes.
  const setActiveTab = (tab) => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('tab', tab); return p; });

  const [contracts, setContracts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useUrlFilter('status', 'all', ['all', 'active', 'expired', 'draft', 'eviction-pending', 'docs-missing', 'ending']);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [previewLang, setPreviewLang] = useState('en');
  const [modalSubTab, setModalSubTab] = useState('contract'); // 'contract' | 'files'
  const contractDocRef = useRef(null);
  // The document is only mounted on the Contract sub-tab, so switch there first.
  const handlePrintAgreement = () => {
    setModalSubTab('contract');
    setTimeout(() => printElement(contractDocRef.current, { variant: 'document' }), 50);
  };

  const [createStep, setCreateStep] = useState(1);
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [editForm, setEditForm] = useState({ leaseStart: '', leaseEnd: '' });

  const [form, setForm] = useState({ tenantId: '', tenant: '', unit: '', type: '', rent: '', deposit: '', leaseStart: '', leaseEnd: '' });

  // loading | error | ready: until ready the table shows a skeleton or the error
  // and the counts are hidden, never "No contracts found" and 0.
  const contractsState = useLoadState();
  const shownCount = (n) => (contractsState.isReady ? ` (${n})` : '');

  const fetchContracts = async () => {
    try {
      const res = await api.get('/get_contracts.php');
      if (res.data.success) {
        const fetched = res.data.contracts.map(c => ({
          id: c.id,
          rentApplicationId: c.rent_application_id,
          tenant: personName(c),
          tenantPhone: c.contact_no || '',
          tenantPreviousAddress: c.previous_address || '',
          tenantEmail: c.email,
          unit: c.room_name,
          type: c.type || 'Unit',
          rent: c.monthly_rent,
          deposit: c.deposit_amount,
          depositRefundable: Number(c.deposit_refundable) === 1,
          depositStatus: c.deposit_status,
          leaseStart: c.lease_start,
          leaseEnd: c.lease_end,
          status: c.status,
          templateVersionId: c.template_version_id,
          generatedDate: c.generated_at ? c.generated_at.split(' ')[0] : '',
          signedLease: { uploaded: !!c.signed_lease_path, fileName: c.signed_lease_path ? c.signed_lease_path.split('/').pop() : null, uploadDate: null, filePath: c.signed_lease_path },
          notarizedLease: { uploaded: !!c.notarized_lease_path, fileName: c.notarized_lease_path ? c.notarized_lease_path.split('/').pop() : null, uploadDate: null, filePath: c.notarized_lease_path },
          tenantSignature: { uploaded: !!c.tenant_signature_path, filePath: c.tenant_signature_path },
          ownerSignature: { uploaded: !!c.owner_signature_path, filePath: c.owner_signature_path },
          evictionStatus: c.eviction_status,
          terminationReason: c.termination_reason,
          overdueInfo: c.overdueInfo ? {
            daysOverdue: c.overdueInfo.daysOverdue,
            oldestDueDate: c.overdueInfo.oldestDueDate,
            outstandingAmount: Number(c.overdueInfo.outstandingAmount),
            invoiceCount: c.overdueInfo.invoiceCount,
            lastPaymentDate: c.overdueInfo.lastPaymentDate
          } : null
        }));
        setContracts(fetched);
        contractsState.ready();
        return fetched;
      }
      contractsState.fail();
    } catch(err) {
      console.error(err);
      // A failed refresh after an action keeps the table already shown.
      contractsState.fail();
    }
    return null;
  };

  // Raw tenant applications from get_tenants.php, before the "already has a
  // contract" / eligible-status filtering below (which also depends on
  // `contracts`, fetched separately).
  const [tenantApplications, setTenantApplications] = useState([]);

  const fetchTenants = async () => {
    try {
      const res = await api.get('/get_tenants.php');
      // get_tenants.php returns { success, data: [...] } with name/unit/rent
      // already composed; rent arrives pre-formatted as "₱4,000".
      if (res.data.success && Array.isArray(res.data.data)) {
        setTenantApplications(res.data.data);
      }
    } catch(err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const load = async () => { await Promise.all([fetchContracts(), fetchTenants()]); };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; the loaders only call stable useLoadState callbacks
  }, []);

  // Only an application the tenant has actually moved into can have a
  // contract generated for it, and only if one doesn't already exist —
  // create_contract.php now refuses both server-side (409/422), but the
  // picker should not offer choices that will just fail.
  const tenantOptions = useMemo(() => {
    const contractedAppIds = new Set(contracts.map(c => c.rentApplicationId).filter(Boolean));
    const eligible = tenantApplications.filter(t => {
      const s = String(t.status || '').toLowerCase();
      return (s === 'active' || s === 'approved') && !contractedAppIds.has(t.id);
    });
    return eligible.map(t => ({
      id: t.id,
      name: t.name,
      unit: t.unit,
      type: 'Unit',
      rent: Number(String(t.rent ?? '').replace(/[^\d.]/g, '')) || 0
    }));
  }, [tenantApplications, contracts]);

  // getSystemSettings() is async — awaiting it once on mount instead of calling
  // it in the render body (which fired an un-awaited request per render and left
  // the threshold permanently undefined).
  const [overdueThresholdDays, setOverdueThresholdDays] = useState(15);
  const [endingDays, setEndingDays] = useState(30);
  useEffect(() => {
    getSystemSettings().then(s => { setOverdueThresholdDays(s.overdueThresholdDays); setEndingDays(s.leaseEndReminderDays ?? 30); });
  }, []);

  // Count overdue contracts exceeding threshold. Only an 'active' contract
  // can actually be flagged (CONTRACT_TRANSITIONS) — an expired or
  // terminated lease's tenant can still show overdue invoices, but flagging
  // that contract would just 422.
  const evictionAlertContracts = useMemo(() => {
    return contracts.filter(c => c.overdueInfo && c.overdueInfo.daysOverdue >= overdueThresholdDays && c.status === 'active');
  }, [contracts, overdueThresholdDays]);

  const filtered = useMemo(() => {
    return contracts.filter(c => {
      const q = searchQuery.toLowerCase();
      const matchSearch = (c.tenant || '').toLowerCase().includes(q) ||
                          (c.unit || '').toLowerCase().includes(q) ||
                          (c.id || '').toLowerCase().includes(q);
      const matchStatus = filterStatus === 'all'
        || (filterStatus === 'docs-missing' ? missingDocs(c)
          : filterStatus === 'ending' ? endingSoon(c, endingDays)
          : String(c.status || '').toLowerCase() === filterStatus);
      return matchSearch && matchStatus;
    });
  }, [contracts, searchQuery, filterStatus, endingDays]);

  const handleTenantSelect = (e) => {
    const selected = tenantOptions.find(t => t.id == e.target.value);
    if (selected) {
      // Security deposit is one month's rent — matches the move-in invoice and
      // the contract row created on approval.
      setForm(prev => ({ ...prev, tenantId: selected.id, tenant: selected.name, unit: selected.unit, type: selected.type, rent: selected.rent, deposit: selected.rent }));
    }
  };

  // Keys match create_contract.php where they exist (depositAmount → deposit here).
  const contractErrors = useFieldErrors({
    tenantId: (v) => (tenantOptions.some(t => String(t.id) === String(v)) ? '' : 'Please select a tenant.'),
    deposit: (v) => checkAmount(v, { label: 'Security deposit' }),
    ...LEASE_VALIDATORS,
  }, { idPrefix: 'contract-' });
  const editErrors = useFieldErrors(LEASE_VALIDATORS, { idPrefix: 'contract-edit-' });
  const [generating, setGenerating] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState(null);
  // Reason for keeping a refundable deposit refundable when the contract is terminated (per contract id).
  const [terminateWaive, setTerminateWaive] = useState({});

  const setContractField = (key, value) => {
    setForm(p => {
      const next = { ...p, [key]: value };
      // A lease end now before the start is cleared rather than kept invalid.
      if (key === 'leaseStart' && next.leaseEnd && value && next.leaseEnd <= value) next.leaseEnd = '';
      return next;
    });
    contractErrors.clearError(key);
  };

  const handleGenerate = async () => {
    if (generating) return;
    if (!contractErrors.validateAll(form)) return;
    setGenerating(true);
    try {
      const payload = {
        rentApplicationId: form.tenantId,
        depositAmount: form.deposit,
        leaseStart: form.leaseStart,
        leaseEnd: form.leaseEnd
      };
      const res = await api.post('/create_contract.php', payload);
      if (res.data.success) {
        fetchContracts();
        setShowCreateModal(false);
        setCreateStep(1);
        setForm({ tenantId: '', tenant: '', unit: '', type: '', rent: '', deposit: '', leaseStart: '', leaseEnd: '' });
      } else if (!contractErrors.applyServerErrors(res)) {
        alert(apiErrorMessage(res, 'Failed to create contract.'));
      }
    } catch (err) {
      console.error(err);
      if (!contractErrors.applyServerErrors(err)) alert(apiErrorMessage(err, 'Failed to create contract.'));
    } finally {
      setGenerating(false);
    }
  };

  const openPreview = async (contract) => {
    setSelectedContract(contract);
    setEditForm({ leaseStart: contract.leaseStart || '', leaseEnd: contract.leaseEnd || '' });
    setIsEditingDates(false);
    setModalSubTab('contract');
    setShowPreviewModal(true);
    try {
      const res = await fetchContractTemplate(contract.templateVersionId);
      setPreviewTemplate(res.template);
      return true;
    } catch (e) {
      console.error('Failed to load contract template for preview:', e);
      return false;
    }
  };

  // Row "download": opens the preview (the document only renders there) and hands
  // the agreement to the print dialog, where it can be saved as a PDF.
  const handleDownloadContract = async (contract) => {
    if (!(await openPreview(contract))) {
      alert('Could not load the contract template. Try again.');
      return;
    }
    setTimeout(() => {
      if (contractDocRef.current) printElement(contractDocRef.current, { variant: 'document' });
    }, 100);
  };

  const handleSignatureUpload = async (contractId, docType, file) => {
    const formData = new FormData();
    formData.append('contractId', contractId);
    formData.append('docType', docType);
    formData.append('action', 'upload');
    formData.append('file', file);
    try {
      const res = await api.post('/upload_lease_document.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        await fetchContracts();
        if (selectedContract && selectedContract.id === contractId) {
          setSelectedContract(prev => ({
            ...prev,
            [docType]: { uploaded: true, filePath: res.data.filePath }
          }));
        }
      } else {
        alert(apiErrorMessage(res, 'Failed to upload signature.'));
      }
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to upload signature.'));
    }
  };

  const handleSignatureRemove = async (contractId, docType) => {
    const formData = new FormData();
    formData.append('contractId', contractId);
    formData.append('docType', docType);
    formData.append('action', 'remove');
    try {
      const res = await api.post('/upload_lease_document.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        await fetchContracts();
        if (selectedContract && selectedContract.id === contractId) {
          setSelectedContract(prev => ({
            ...prev,
            [docType]: { uploaded: false, filePath: null }
          }));
        }
      } else {
        alert(apiErrorMessage(res, 'Failed to remove signature.'));
      }
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to remove signature.'));
    }
  };

  const handleSaveDates = async () => {
    if (savingDates) return;
    // End after start, at most 24 months later (checkLeaseEnd).
    if (!editErrors.validateAll(editForm)) return;

    setSavingDates(true);
    try {
      const res = await api.post('/update_contract_status.php', {
        contractId: selectedContract.id,
        action: 'edit',
        leaseStart: editForm.leaseStart,
        leaseEnd: editForm.leaseEnd
      });
      if (res.data.success) {
        fetchContracts();
        setSelectedContract(prev => ({
          ...prev,
          leaseStart: editForm.leaseStart,
          leaseEnd: editForm.leaseEnd
        }));
        setIsEditingDates(false);
      } else if (!editErrors.applyServerErrors(res)) {
        alert(apiErrorMessage(res, 'Failed to update rent dates.'));
      }
    } catch (err) {
      console.error(err);
      if (!editErrors.applyServerErrors(err)) alert(apiErrorMessage(err, 'Failed to update rent dates.'));
    } finally {
      setSavingDates(false);
    }
  };

  const handleUploadFile = async (contractId, docType) => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = acceptFor(FILE_RULES.document);
    fileInput.onchange = async (e) => {
      if (e.target.files && e.target.files[0]) {
        const fileError = checkFile(e.target.files[0], FILE_RULES.document);
        if (fileError) {
          alert(fileError);
          return;
        }
        const formData = new FormData();
        formData.append('contractId', contractId);
        formData.append('docType', docType);
        formData.append('action', 'upload');
        formData.append('file', e.target.files[0]);

        try {
          const res = await api.post('/upload_lease_document.php', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          if (res.data.success) {
            fetchContracts();
            if (selectedContract && selectedContract.id === contractId) {
               setSelectedContract(prev => ({
                 ...prev,
                 [docType]: { uploaded: true, fileName: e.target.files[0].name, uploadDate: new Date().toISOString().slice(0, 10), filePath: res.data.filePath }
               }));
            }
          } else {
            alert(apiErrorMessage(res, 'Failed to upload the document.'));
          }
        } catch(err) {
          console.error(err);
          alert(apiErrorMessage(err, 'Failed to upload the document.'));
        }
      }
    };
    fileInput.click();
  };

  const handleRemoveFile = async (contractId, docType) => {
    try {
      const res = await api.post('/upload_lease_document.php', new URLSearchParams({
        contractId: contractId,
        docType: docType,
        action: 'remove'
      }));
      if (res.data.success) {
        fetchContracts();
        if (selectedContract && selectedContract.id === contractId) {
           setSelectedContract(prev => ({ ...prev, [docType]: { uploaded: false, fileName: null, uploadDate: null } }));
        }
      } else {
        alert(apiErrorMessage(res, 'Failed to remove the document.'));
      }
    } catch(err) {
      console.error(err);
      alert(apiErrorMessage(err, 'Failed to remove the document.'));
    }
  };

  // Re-fetches the contract list and, if the preview modal has this contract
  // open, syncs it to whatever the server actually did — rather than
  // guessing the new status client-side (clear's target status is
  // date-derived server-side, and terminate changes several fields at once).
  const refreshContract = async (contractId) => {
    const fetched = await fetchContracts();
    if (fetched && selectedContract && selectedContract.id === contractId) {
      const match = fetched.find(c => c.id === contractId);
      if (match) setSelectedContract(match);
    }
  };

  const handleToggleDepositRefundable = async (contractId, depositRefundable) => {
    try {
      const res = await api.post('/update_contract_status.php', { contractId, action: 'set_deposit_refundable', depositRefundable });
      if (res.data.success) {
        await refreshContract(contractId);
      } else {
        alert(res.data.message || 'Failed to change the deposit terms.');
      }
    } catch (err) {
      console.error(err);
      alert(apiErrorMessage(err, 'Failed to change the deposit terms.'));
    }
  };

  const handleActivateContract = async (contractId) => {
    try {
      const res = await api.post('/update_contract_status.php', { contractId, action: 'activate' });
      if (res.data.success) {
        await refreshContract(contractId);
      } else {
        alert(res.data.message || 'Failed to activate contract.');
      }
    } catch (err) {
      console.error(err);
      alert(apiErrorMessage(err, 'Failed to activate contract.'));
    }
  };

  const handleFlagEviction = async (contractId) => {
    try {
      const res = await api.post('/update_contract_status.php', { contractId, action: 'flag' });
      if (res.data.success) {
        await refreshContract(contractId);
      } else {
        alert(res.data.message || 'Failed to flag contract for eviction.');
      }
    } catch(err) {
      console.error(err);
      alert(apiErrorMessage(err, 'Failed to flag contract for eviction.'));
    }
  };

  const handleClearEviction = async (contractId) => {
    try {
      const res = await api.post('/update_contract_status.php', { contractId, action: 'clear' });
      if (res.data.success) {
        await refreshContract(contractId);
      } else {
        alert(res.data.message || 'Failed to clear eviction flag.');
      }
    } catch(err) {
      console.error(err);
      alert(apiErrorMessage(err, 'Failed to clear eviction flag.'));
    }
  };

  // Terminating a lease ends the tenancy — the backend vacates the room,
  // cancels pending invoices, releases parking and cancels the tenant's
  // pending visitor pre-registrations. Confirmed separately from the reason
  // prompt since it isn't reversible from this page.
  // The reason comes from ReasonModal (it used to be window.prompt()); a
  // failure is thrown so the modal shows it under the reason.
  const handleTerminateContract = (contractId) => setTerminateTarget(contractId);
  const confirmTerminate = async (reason) => {
    const contractId = terminateTarget;
    const target = contracts.find(c => c.id === contractId);
    const depositAtStake = !!target?.depositRefundable && target?.depositStatus === 'Held';
    const waive = (terminateWaive[contractId] || '').trim();
    if (!window.confirm('This will end the tenancy: the unit will be marked vacant, pending invoices cancelled, and parking/visitor requests released.'
      + (depositAtStake ? (waive ? ' What is left of the security deposit stays refundable.' : ' What is left of the security deposit is withheld.') : '')
      + ' Continue?')) {
      return;
    }
    let res;
    try {
      res = await api.post('/update_contract_status.php', { contractId, action: 'terminate', reason, waive_forfeiture_reason: (terminateWaive[contractId] || '').trim() });
    } catch (err) {
      console.error(err);
      throw new Error(apiErrorMessage(err, 'Failed to terminate contract.'), { cause: err });
    }
    if (!res.data.success) throw new Error(res.data.message || 'Failed to terminate contract.');
    setTerminateTarget(null);
    await refreshContract(contractId);
  };

  // Lease completeness checker
  // The status filter shows each count and the documents notice says how many are
  // incomplete (a row of count cards used to repeat them).
  const statusCount = (status) => contracts.filter(c => c.status === status).length;
  const docsIncompleteCount = contracts.filter(missingDocs).length;

  const getDocumentStatus = (contract) => {
    const signed = contract.signedLease?.uploaded || false;
    const notarized = contract.notarizedLease?.uploaded || false;
    if (signed && notarized) return { label: 'Complete', color: 'text-emerald-700', icon: faCheckCircle };
    if (signed || notarized) return { label: 'Partial', color: 'text-amber-700', icon: faClock };
    return { label: 'Missing', color: 'text-red-600', icon: faExclamationTriangle };
  };

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900 print:h-auto print:block print:bg-white print:overflow-visible">
      <div className="print:hidden">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50 print:h-auto print:block print:bg-white print:overflow-visible print:p-0">
        <div className="print:hidden">
          <Header title="Contracts" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 print:p-0 print:overflow-visible print:block">
          <div className="max-w-6xl mx-auto space-y-6 print:space-y-0 print:max-w-none print:m-0 print:p-0">

            {/* Top Navigation Tabs: Contracts Management vs Contract Template Editor */}
            <div className="print:hidden flex gap-2 bg-slate-200/70 p-1.5 rounded-card border border-slate-300/80 max-w-fit shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab('contracts')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-card text-label font-bold border-0 cursor-pointer transition-all ${
                  activeTab !== 'editor'
                    ? 'bg-white text-indigo-700 shadow-card'
                    : 'bg-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <FontAwesomeIcon icon={faFileContract} />
                <span>Contracts Management</span>
                <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ml-1 ${activeTab !== 'editor' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-300/80 text-slate-600'}`}>
                  {contractsState.isReady ? contracts.length : '—'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-card text-label font-bold border-0 cursor-pointer transition-all ${
                  activeTab === 'editor'
                    ? 'bg-white text-indigo-700 shadow-card'
                    : 'bg-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <FontAwesomeIcon icon={faFileSignature} />
                <span>Contract Template Editor</span>
              </button>
            </div>

            {activeTab === 'editor' ? (
              <AdminContractEditor embedded={true} />
            ) : (
              <>
            {/* ─── EVICTION MONITORING BANNER ─── */}
            {evictionAlertContracts.length > 0 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-card p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-card bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faGavel} className="text-lg" />
                  </div>
                  <div>
                    <h3 className="text-body font-bold text-red-800 m-0">⚠ Eviction Threshold Exceeded</h3>
                    <p className="text-label text-red-700 m-0 mt-0.5">{evictionAlertContracts.length} tenant(s) have exceeded the {overdueThresholdDays}-day overdue payment threshold. Review and take action.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {evictionAlertContracts.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white rounded-control border border-red-200 p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-label font-bold">{c.tenant.charAt(0)}</div>
                        <div>
                          <p className="text-body font-semibold text-slate-800 m-0">{c.tenant} · Unit {c.unit}</p>
                          <p className="text-caption text-red-600 m-0 mt-0.5">{c.overdueInfo.daysOverdue} days overdue · Outstanding: {formatCurrency(c.overdueInfo.outstandingAmount)}</p>
                        </div>
                      </div>
                      <button onClick={() => handleFlagEviction(c.id)} className={btn('danger', 'sm')}>
                        <FontAwesomeIcon icon={faGavel} /> Flag for Eviction
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Doc completeness notice */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-control px-4 py-2.5 flex items-center gap-2 text-label text-indigo-700">
              <FontAwesomeIcon icon={faInfoCircle} className="text-indigo-400" />
              <span>All contracts require <strong>signed rent agreement</strong> and <strong>notarized copy</strong> to be uploaded. Eviction threshold: <strong>{overdueThresholdDays} days</strong> overdue.{docsIncompleteCount > 0 && <> <strong>{docsIncompleteCount} contract{docsIncompleteCount === 1 ? ' is' : 's are'} still missing documents.</strong></>}</span>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-control px-3 py-2 shadow-card focus-within:border-indigo-500 transition-all max-w-xs w-full">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" />
                  <input aria-label="Search contracts" maxLength={LIMITS.search} type="text" placeholder="Search contracts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="focus-glow flex-1 bg-transparent text-body outline-none border-0 p-0 text-slate-800" />
                </div>
                <select aria-label="Filter by status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="focus-glow px-3 py-2 text-body border border-slate-200 rounded-control bg-white text-slate-700 outline-none cursor-pointer shadow-card">
                  <option value="all">All Status{shownCount(contracts.length)}</option><option value="active">Active{shownCount(statusCount('active'))}</option><option value="expired">Expired{shownCount(statusCount('expired'))}</option><option value="draft">Draft{shownCount(statusCount('draft'))}</option><option value="eviction-pending">Eviction Pending{shownCount(statusCount('eviction-pending'))}</option><option value="docs-missing">Missing documents{shownCount(docsIncompleteCount)}</option><option value="ending">Ending in {endingDays} days{shownCount(contracts.filter(c => endingSoon(c, endingDays)).length)}</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('editor')}
                  className={btn('secondary', 'md', 'btn-interactive')}
                >
                  <FontAwesomeIcon icon={faEdit} className="text-indigo-600" />
                  <span>Edit Template</span>
                </button>
                <button onClick={() => { setShowCreateModal(true); setCreateStep(1); contractErrors.setErrors({}); }} className={btn('primary', 'md', 'btn-interactive')}>
                  <FontAwesomeIcon icon={faPlus} /> New Contract
                </button>
              </div>
            </div>

            {/* Contract Table */}
            <div className="bg-white border border-slate-200 rounded-card overflow-hidden shadow-card table-scroll-x">
              <table className="w-full text-left text-body">
                <thead className={THEAD}>
                  <tr className="text-label font-medium text-slate-600">
                    <th className={TH}>Contract ID</th><th className={TH}>Tenant</th><th className={TH}>Unit</th><th className={TH}>Rent Period</th><th className={TH}>Rent</th><th className={TH}>Documents</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="stagger-children">
                  {contractsState.isLoading && <SkeletonRows cols={8} label="Loading contracts…" />}
                  {contractsState.isError && <LoadErrorRow cols={8} title="Couldn't load contracts" onRetry={() => { contractsState.retry(); fetchContracts(); }} />}
                  {contractsState.isReady && filtered.map(c => {
                    const docStatus = getDocumentStatus(c);
                    return (
                      <tr key={c.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${c.status === 'eviction-pending' ? 'bg-red-50/30' : ''}`}>
                        <td className="py-3 px-4 font-mono text-label font-bold text-indigo-600">{c.id}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{c.tenant}</span>
                            {c.evictionStatus === 'flagged' && <FontAwesomeIcon icon={faGavel} className="text-red-600 text-[10px]" title="Eviction Pending" />}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{c.unit} <span className="text-slate-500 text-label">({c.type})</span></td>
                        <td className="py-3 px-4 text-label text-slate-600">{c.leaseStart} → {c.leaseEnd}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{formatCurrency(c.rent)}/mo</td>
                        <td className="py-3 px-4">
                          <span className={`flex items-center gap-1.5 text-caption font-semibold ${docStatus.color}`}>
                            <FontAwesomeIcon icon={docStatus.icon} className="text-[10px]" /> {docStatus.label}
                          </span>
                        </td>
                        <td className="py-3 px-4"><span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${statusOf(c.status).color}`}>{statusOf(c.status).label}</span></td>
                        <td className="py-3 px-4 text-right">
                          <button type="button" aria-label={`View contract ${c.id} for ${c.tenant}`} title="View contract" onClick={() => openPreview(c)} className="w-7 h-7 rounded-control text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faEye} className="text-xs" /></button>
                          <button type="button" aria-label={`Download contract ${c.id} for ${c.tenant} as PDF`} title="Download as PDF" onClick={() => handleDownloadContract(c)} className="w-7 h-7 rounded-control text-slate-500 hover:text-slate-700 hover:bg-slate-100 bg-transparent border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faDownload} className="text-xs" /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {contractsState.isReady && filtered.length === 0 && (
                    <tr><td colSpan="8" className="py-10 text-center text-slate-500 text-body">No contracts found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

          </div>
        </div>
      </main>

      {/* Create Contract Modal — Multi-Step */}
      {showCreateModal && (
        <Modal busy={generating} title="Create New Contract" onClose={() => setShowCreateModal(false)} overlayClassName="flex items-center justify-center bg-black/50 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-title font-bold text-slate-800 m-0">Create New Contract</h2>
                <p className="text-label text-slate-500 m-0 mt-0.5">Step {createStep} of 3</p>
              </div>
              <button aria-label="Close" onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
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
                    <label htmlFor="contract-tenantId" className="block text-label font-medium text-slate-600 mb-1">Select Tenant *</label>
                    <select {...contractErrors.fieldA11y('tenantId')} value={form.tenantId} onChange={(e) => { handleTenantSelect(e); contractErrors.clearError('tenantId'); }} className={DATE_INPUT + invalidCls(contractErrors.errors.tenantId)}>
                      <option value="" disabled>Choose a tenant...</option>
                      {tenantOptions.map(t => <option key={t.id} value={t.id}>{t.name} — Unit {t.unit}</option>)}
                    </select>
                    <FieldError id="contract-tenantId" error={contractErrors.errors.tenantId} />
                  </div>
                  {form.tenant && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-control p-3 text-label text-indigo-800">
                      <span className="font-semibold">Auto-filled:</span> Unit {form.unit} ({form.type}) · {formatCurrency(form.rent)}/mo
                    </div>
                  )}
                </>
              )}

              {createStep === 2 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contract-rent" className="block text-label font-medium text-slate-600 mb-1">Monthly Rent *</label>
                      {/* Read-only: rent is the application's; create_contract.php takes no rent. */}
                      <input type="text" id="contract-rent" name="rent" readOnly aria-describedby="contract-rent-hint" value={formatCurrency(form.rent)} className={`${DATE_INPUT} bg-slate-50 text-slate-600 cursor-default`} />
                      <p id="contract-rent-hint" className="m-0 mt-1 text-caption text-slate-500">Rent comes from the tenant's application.</p>
                    </div>
                    <div>
                      <label htmlFor="contract-deposit" className="block text-label font-medium text-slate-600 mb-1">Security Deposit *</label>
                      <input type="number" {...contractErrors.fieldA11y('deposit')} inputMode="decimal" min="0" max={MAX_AMOUNT} step="0.01" value={form.deposit}
                        onKeyDown={blockNonNumericKeys}
                        onChange={e => setContractField('deposit', e.target.value)}
                        onBlur={() => contractErrors.validateField('deposit', form)}
                        className={DATE_INPUT + invalidCls(contractErrors.errors.deposit)} />
                      <FieldError id="contract-deposit" error={contractErrors.errors.deposit} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contract-leaseStart" className="block text-label font-medium text-slate-600 mb-1">Rent Start *</label>
                      <input type="date" {...contractErrors.fieldA11y('leaseStart')} max={maxFutureDate()} value={form.leaseStart}
                        onChange={e => setContractField('leaseStart', e.target.value)}
                        onBlur={() => form.leaseStart && contractErrors.validateField('leaseStart', form)}
                        className={DATE_INPUT + invalidCls(contractErrors.errors.leaseStart)} />
                      <FieldError id="contract-leaseStart" error={contractErrors.errors.leaseStart} />
                    </div>
                    <div>
                      <label htmlFor="contract-leaseEnd" className="block text-label font-medium text-slate-600 mb-1">Rent End *</label>
                      <input type="date" {...contractErrors.fieldA11y('leaseEnd')} min={form.leaseStart || undefined} max={maxFutureDate()} value={form.leaseEnd}
                        onChange={e => setContractField('leaseEnd', e.target.value)}
                        onBlur={() => form.leaseEnd && contractErrors.validateField('leaseEnd', form)}
                        className={DATE_INPUT + invalidCls(contractErrors.errors.leaseEnd)} />
                      <FieldError id="contract-leaseEnd" error={contractErrors.errors.leaseEnd} />
                    </div>
                  </div>
                </>
              )}

              {createStep === 3 && (
                <div className="bg-slate-50 border border-slate-200 rounded-card p-5 space-y-4">
                  <div className="text-center border-b border-slate-200 pb-4">
                    <h3 className="text-title font-bold text-slate-800 italic font-serif m-0">APARTMENT AMS</h3>
                    <p className="text-label text-slate-600 m-0 mt-1">Rent Agreement</p>
                  </div>
                  <div className="space-y-2 text-label text-slate-700">
                    <div className="flex justify-between"><span className="text-slate-500">Tenant:</span><span className="font-semibold">{form.tenant}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Unit:</span><span className="font-semibold">{form.unit} ({form.type})</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Monthly Rent:</span><span className="font-semibold">{formatCurrency(form.rent)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Security Deposit:</span><span className="font-semibold">{formatCurrency(form.deposit)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Rent Period:</span><span className="font-semibold">{form.leaseStart} → {form.leaseEnd}</span></div>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-caption text-slate-500 leading-relaxed m-0">
                      This Rent Agreement is entered into between Apartment AMS ("Landlord") and the Tenant named above. 
                      The Tenant agrees to pay the monthly rent on or before the 5th of each month. A late fee of ₱500 
                      will be charged for payments made after the due date. Whether the security deposit is refunded at move-out
                      is set in the contract's deposit terms (Settings, then changeable while the contract is a draft). Both parties agree to the terms herein.
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-control p-3 text-label text-amber-800">
                    <FontAwesomeIcon icon={faInfoCircle} className="mr-1.5" />
                    <strong>Note:</strong> After generating the contract, upload signed and notarized rent documents via the contract details page.
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between">
              {createStep > 1 ? (
                <button onClick={() => setCreateStep(s => s - 1)} className={btn('secondary', 'md')}>
                  <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
              ) : <div></div>}
              {createStep < 3 ? (
                <button 
                  onClick={() => {
                    // Each step checks its own fields before moving on.
                    if (createStep === 1 && !contractErrors.validateAll(form, ['tenantId'])) return;
                    if (createStep === 2 && !contractErrors.validateAll(form, ['deposit', 'leaseStart', 'leaseEnd'])) return;
                    setCreateStep(s => s + 1);
                  }}
                  type="button"
                  className={btn('primary', 'md')}
                >
                  Next <FontAwesomeIcon icon={faArrowRight} />
                </button>
              ) : (
                <button type="button" onClick={handleGenerate} disabled={generating} className={btn('success', 'md')}>
                  <FontAwesomeIcon icon={faFileSignature} /> {generating ? 'Generating…' : 'Generate Contract'}
                </button>
              )}
            </div>
          </Modal>
      )}

      {terminateTarget && (
        <ReasonModal
          title="Terminate Rent Contract"
          description="This also marks the tenant as moved out and vacates their unit."
          label="Reason for terminating this rent contract"
          confirmLabel="Terminate Rent Contract"
          onConfirm={confirmTerminate}
          onClose={() => setTerminateTarget(null)}
        >
          {(() => {
            const target = contracts.find(c => c.id === terminateTarget);
            if (!target?.depositRefundable || target?.depositStatus !== 'Held') return null;
            return (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="m-0 font-semibold">This contract&apos;s security deposit is refundable.</p>
                <p className="m-0 mt-1">Terminating for cause withholds what is left of it after unpaid rent and bills. To keep it refundable anyway, give a reason (leave empty to withhold):</p>
                <input type="text" maxLength={200} value={terminateWaive[terminateTarget] || ''} aria-label="Reason to keep the deposit refundable"
                  onChange={(e) => setTerminateWaive((p) => ({ ...p, [terminateTarget]: e.target.value }))}
                  className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />
              </div>
            );
          })()}
        </ReasonModal>
      )}

      {/* Preview Modal — Enhanced with Official Contract Document & File Tracking */}
      {showPreviewModal && selectedContract && (
        <Modal title={`Contract ${selectedContract.id}, ${selectedContract.tenant}`} onClose={() => setShowPreviewModal(false)} overlayClassName="flex items-center justify-center bg-black/50 backdrop-blur-sm" className="bg-white rounded-card shadow-dialog w-full max-w-4xl mx-4 overflow-hidden max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap font-mono text-indigo-600 bg-indigo-100">{selectedContract.id}</span>
                <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${statusOf(selectedContract.status).color}`}>{statusOf(selectedContract.status).label}</span>
                {selectedContract.evictionStatus === 'flagged' && (
                  <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-red-200 text-red-900 ring-red-300 ring-1 ring-inset">🚨 Eviction Flagged</span>
                )}
                <span className="text-label font-semibold text-slate-700 hidden sm:inline ml-1">
                  {selectedContract.tenant} · Unit {selectedContract.unit}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Modal Sub-Tabs */}
                <div className="flex bg-slate-200/80 p-0.5 rounded-control text-label font-semibold">
                  <button
                    type="button"
                    onClick={() => setModalSubTab('contract')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control border-0 cursor-pointer transition-colors ${
                      modalSubTab === 'contract' ? 'bg-white text-indigo-700 shadow-card font-bold' : 'bg-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FontAwesomeIcon icon={faFileContract} />
                    <span>Official Agreement</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalSubTab('files')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control border-0 cursor-pointer transition-colors ${
                      modalSubTab === 'files' ? 'bg-white text-indigo-700 shadow-card font-bold' : 'bg-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FontAwesomeIcon icon={faFileUpload} />
                    <span>Files & Eviction</span>
                  </button>
                </div>

                {/* Bi-lingual Switcher (Active on Agreement tab) */}
                {modalSubTab === 'contract' && (
                  <div className="flex items-center bg-white border border-slate-200 rounded-control p-0.5 text-label shadow-card">
                    <button
                      type="button"
                      onClick={() => setPreviewLang('en')}
                      className={`px-2 py-1 rounded-control font-bold border-0 cursor-pointer transition-colors ${
                        previewLang === 'en' ? 'bg-indigo-600 text-white' : 'bg-transparent text-slate-600 hover:text-slate-900'
                      }`}
                      title="English"
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewLang('tl')}
                      className={`px-2 py-1 rounded-control font-bold border-0 cursor-pointer transition-colors ${
                        previewLang === 'tl' ? 'bg-indigo-600 text-white' : 'bg-transparent text-slate-600 hover:text-slate-900'
                      }`}
                      title="Tagalog"
                    >
                      TL
                    </button>
                  </div>
                )}

                <button aria-label="Close" onClick={() => setShowPreviewModal(false)} className="text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1">
                  <FontAwesomeIcon icon={faTimes} className="text-lg" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Draft contracts banner */}
              {String(selectedContract.status).toLowerCase() === 'draft' && (
                <div className="bg-amber-50 border border-amber-200 rounded-card p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-body font-bold text-amber-900 m-0">This contract is still a draft.</p>
                    <p className="text-caption text-amber-700 m-0 mt-0.5">Review the rent contract details below, then activate it to make it binding.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleActivateContract(selectedContract.id)}
                    className={btn('success', 'sm', 'shrink-0')}
                  >
                    <FontAwesomeIcon icon={faCheckCircle} className="mr-1.5" /> Activate Contract
                  </button>
                </div>
              )}

              {/* Deposit terms: editable on a draft, fixed once the tenant has signed */}
              <div className="bg-slate-50 border border-slate-200 rounded-card p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-body font-bold text-slate-800 m-0">Security deposit: {selectedContract.depositRefundable ? 'refundable' : 'not refunded in cash'}</p>
                  <p className="text-caption text-slate-500 m-0 mt-0.5">
                    {selectedContract.depositRefundable
                      ? 'What is left after deductions is returned at move-out, unless it is withheld (no notice, early exit, or termination for a breach).'
                      : 'The deposit is applied to unpaid rent, bills and damage, and any remainder to the last month.'}
                  </p>
                </div>
                {String(selectedContract.status).toLowerCase() === 'draft' && (
                  <label className="flex items-center gap-2 text-label font-medium text-slate-700 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!selectedContract.depositRefundable}
                      onChange={(e) => handleToggleDepositRefundable(selectedContract.id, e.target.checked)}
                    />
                    Refundable
                  </label>
                )}
              </div>

              {/* Terminated contract banner */}
              {selectedContract.status === 'terminated' && (
                <div className="bg-slate-100 border border-slate-300 rounded-card p-4">
                  <p className="text-body font-bold text-slate-700 m-0">This rent contract was terminated.</p>
                  {selectedContract.terminationReason && (
                    <p className="text-caption text-slate-500 m-0 mt-0.5">Reason: {selectedContract.terminationReason}</p>
                  )}
                </div>
              )}

              {/* SUB-TAB 1: OFFICIAL LEASE AGREEMENT */}
              {modalSubTab === 'contract' && (
                <div className="space-y-4">
                  {/* Quick Dates & Management Bar */}
                  <div className="bg-slate-50 border border-slate-200 rounded-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {isEditingDates ? (
                      <div className="w-full space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="contract-edit-leaseStart" className="block text-label font-medium text-slate-600 mb-1">Rent Start *</label>
                            <input
                              type="date"
                              {...editErrors.fieldA11y('leaseStart')}
                              max={maxFutureDate()}
                              value={editForm.leaseStart}
                              onChange={e => {
                                const leaseStart = e.target.value;
                                setEditForm(p => ({ ...p, leaseStart, leaseEnd: p.leaseEnd && leaseStart && p.leaseEnd <= leaseStart ? '' : p.leaseEnd }));
                                editErrors.clearError('leaseStart');
                              }}
                              onBlur={() => editErrors.validateField('leaseStart', editForm)}
                              className={DATE_INPUT + invalidCls(editErrors.errors.leaseStart)}
                            />
                            <FieldError id="contract-edit-leaseStart" error={editErrors.errors.leaseStart} />
                          </div>
                          <div>
                            <label htmlFor="contract-edit-leaseEnd" className="block text-label font-medium text-slate-600 mb-1">Rent End *</label>
                            <input
                              type="date"
                              {...editErrors.fieldA11y('leaseEnd')}
                              min={editForm.leaseStart || undefined}
                              max={maxFutureDate()}
                              value={editForm.leaseEnd}
                              onChange={e => { setEditForm(p => ({...p, leaseEnd: e.target.value})); editErrors.clearError('leaseEnd'); }}
                              onBlur={() => editErrors.validateField('leaseEnd', editForm)}
                              className={DATE_INPUT + invalidCls(editErrors.errors.leaseEnd)}
                            />
                            <FieldError id="contract-edit-leaseEnd" error={editErrors.errors.leaseEnd} />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button type="button" onClick={() => { setIsEditingDates(false); editErrors.setErrors({}); }} className={btn('secondary', 'sm')}>Cancel</button>
                          <button type="button" onClick={handleSaveDates} disabled={savingDates} className={btn('success', 'sm')}>{savingDates ? 'Saving…' : 'Save Dates'}</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-4 text-label text-slate-600">
                          <div>
                            <span className="text-slate-500">Tenant:</span> <strong className="text-slate-800">{selectedContract.tenant}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Unit:</span> <strong className="text-slate-800">{selectedContract.unit} ({selectedContract.type})</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Rent:</span> <strong className="text-slate-800">{formatCurrency(selectedContract.rent)}/mo</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Period:</span> <strong className="text-slate-800">{selectedContract.leaseStart} → {selectedContract.leaseEnd}</strong>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setIsEditingDates(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-indigo-600 rounded-control text-label font-bold hover:bg-indigo-50 cursor-pointer transition-colors shadow-card"
                          >
                            <FontAwesomeIcon icon={faEdit} className="text-[10px]" />
                            <span>Edit Dates</span>
                          </button>
                          {['active', 'expired', 'eviction-pending'].includes(selectedContract.status) && (
                            <button
                              type="button"
                              onClick={() => handleTerminateContract(selectedContract.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-600 text-label font-semibold rounded-control hover:bg-red-50 cursor-pointer transition-colors"
                            >
                              <FontAwesomeIcon icon={faGavel} /> Terminate Rent Contract
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Document Render with Uploadable E-Signatures */}
                  <div ref={contractDocRef} className="rounded-card border border-slate-200 bg-slate-100/50 p-2 sm:p-4 print:border-none print:bg-white print:p-0">
                    <ContractDocument
                      template={previewTemplate || {}}
                      lang={previewLang}
                      data={{
                        tenantName: selectedContract.tenant,
                        tenantPhone: selectedContract.tenantPhone,
                        tenantPreviousAddress: selectedContract.tenantPreviousAddress,
                        tenantEmail: selectedContract.tenantEmail,
                        roomName: selectedContract.unit,
                        unitType: selectedContract.type,
                        monthlyRent: formatCurrency(selectedContract.rent),
                        securityDeposit: formatCurrency(selectedContract.deposit),
                        depositAmount: formatCurrency(selectedContract.deposit),
                        depositRefundable: selectedContract.depositRefundable,
                        advanceRent: formatCurrency(selectedContract.rent),
                        leaseStartDate: selectedContract.leaseStart,
                        leaseEndDate: selectedContract.leaseEnd,
                        entryDate: selectedContract.leaseStart,
                        tenantSignature: selectedContract.tenantSignature?.filePath || null,
                        ownerSignature: selectedContract.ownerSignature?.filePath || null,
                      }}
                      allowUploadSignature={true}
                      onUploadSignature={(docType, file) => handleSignatureUpload(selectedContract.id, docType, file)}
                      onRemoveSignature={(docType) => handleSignatureRemove(selectedContract.id, docType)}
                    />
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: DOCUMENT FILES & EVICTION TRACKING */}
              {modalSubTab === 'files' && (
                <div className="space-y-6">
                  {/* Early termination button */}
                  {['active', 'expired', 'eviction-pending'].includes(selectedContract.status) && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleTerminateContract(selectedContract.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-600 text-label font-semibold rounded-control hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <FontAwesomeIcon icon={faGavel} /> Terminate Rent Contract
                      </button>
                    </div>
                  )}

                  {/* Document Upload Tracking */}
                  <div className="bg-white border border-slate-200 rounded-card overflow-hidden shadow-card">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                      <FontAwesomeIcon icon={faFileUpload} className="text-indigo-500" />
                      <h4 className="text-body font-bold text-slate-800 m-0">Uploaded Physical / Notarized Documents</h4>
                    </div>
                    <div className="p-5 space-y-4">
                      {/* Signed Lease */}
                      <div className={`rounded-control border p-4 ${selectedContract.signedLease?.uploaded ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-control flex items-center justify-center ${selectedContract.signedLease?.uploaded ? 'bg-emerald-200 text-emerald-700' : 'bg-amber-200 text-amber-700'}`}>
                              <FontAwesomeIcon icon={selectedContract.signedLease?.uploaded ? faCheckCircle : faFileSignature} />
                            </div>
                            <div>
                              <p className="text-body font-semibold text-slate-800 m-0">Signed Rent Agreement (Physical Scan / PDF)</p>
                              {selectedContract.signedLease?.uploaded ? (
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-caption text-slate-500 m-0 font-sans">
                                    <FontAwesomeIcon icon={faFile} className="mr-1 text-slate-500" />
                                    {selectedContract.signedLease.fileName}
                                  </p>
                                  <a 
                                    href={fileUrl(selectedContract.signedLease.filePath) || '#'}
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-caption text-indigo-600 hover:text-indigo-800 font-semibold no-underline"
                                  >
                                    View / Download File
                                  </a>
                                </div>
                              ) : (
                                <p className="text-caption text-amber-700 m-0 mt-0.5">Not yet uploaded</p>
                              )}
                            </div>
                          </div>
                          {selectedContract.signedLease?.uploaded ? (
                            <button onClick={() => handleRemoveFile(selectedContract.id, 'signedLease')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-red-600 text-label font-semibold rounded-control hover:bg-red-50 cursor-pointer transition-colors">
                              <FontAwesomeIcon icon={faTimesCircle} /> Remove
                            </button>
                          ) : (
                            <button onClick={() => handleUploadFile(selectedContract.id, 'signedLease')} className={btn('primary', 'sm')}>
                              <FontAwesomeIcon icon={faUpload} /> Upload File
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Notarized Lease */}
                      <div className={`rounded-control border p-4 ${selectedContract.notarizedLease?.uploaded ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-control flex items-center justify-center ${selectedContract.notarizedLease?.uploaded ? 'bg-emerald-200 text-emerald-700' : 'bg-amber-200 text-amber-700'}`}>
                              <FontAwesomeIcon icon={selectedContract.notarizedLease?.uploaded ? faCheckCircle : faShieldAlt} />
                            </div>
                            <div>
                              <p className="text-body font-semibold text-slate-800 m-0">Notarized Rent Agreement Copy</p>
                              {selectedContract.notarizedLease?.uploaded ? (
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-caption text-slate-500 m-0 font-sans">
                                    <FontAwesomeIcon icon={faFile} className="mr-1 text-slate-500" />
                                    {selectedContract.notarizedLease.fileName}
                                  </p>
                                  <a 
                                    href={fileUrl(selectedContract.notarizedLease.filePath) || '#'}
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-caption text-indigo-600 hover:text-indigo-800 font-semibold no-underline"
                                  >
                                    View / Download File
                                  </a>
                                </div>
                              ) : (
                                <p className="text-caption text-amber-700 m-0 mt-0.5">Not yet uploaded</p>
                              )}
                            </div>
                          </div>
                          {selectedContract.notarizedLease?.uploaded ? (
                            <button onClick={() => handleRemoveFile(selectedContract.id, 'notarizedLease')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-red-600 text-label font-semibold rounded-control hover:bg-red-50 cursor-pointer transition-colors">
                              <FontAwesomeIcon icon={faTimesCircle} /> Remove
                            </button>
                          ) : (
                            <button onClick={() => handleUploadFile(selectedContract.id, 'notarizedLease')} className={btn('primary', 'sm')}>
                              <FontAwesomeIcon icon={faUpload} /> Upload File
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Document status summary */}
                      {(() => {
                        const ds = getDocumentStatus(selectedContract);
                        return (
                          <div className={`flex items-center gap-2 text-label font-semibold ${ds.color} bg-slate-50 border border-slate-100 rounded-control p-2.5`}>
                            <FontAwesomeIcon icon={ds.icon} />
                            Document Status: {ds.label}
                            {ds.label !== 'Complete' && <span className="text-slate-500 font-normal ml-1">— Please upload all required physical/notarized documents.</span>}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Eviction Action Panel */}
                  {selectedContract.overdueInfo && (
                    <div className={`rounded-card border-2 p-5 space-y-3 ${selectedContract.status === 'eviction-pending' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                      <div className="flex items-center gap-3">
                        <FontAwesomeIcon icon={faGavel} className={`text-xl ${selectedContract.status === 'eviction-pending' ? 'text-red-600' : 'text-amber-700'}`} />
                        <div>
                          <h4 className="text-body font-bold text-slate-800 m-0">
                            {selectedContract.status === 'eviction-pending' ? '🚨 Eviction Flagged' : '⚠ Overdue Payment Detected'}
                          </h4>
                          <p className="text-caption text-slate-500 m-0 mt-0.5">
                            {selectedContract.overdueInfo.daysOverdue} days overdue · Outstanding: {formatCurrency(selectedContract.overdueInfo.outstandingAmount)} · Last payment: {selectedContract.overdueInfo.lastPaymentDate}
                          </p>
                        </div>
                      </div>
                      {selectedContract.overdueInfo.daysOverdue >= overdueThresholdDays && (
                        <div className="bg-white border border-red-200 rounded-control p-3 text-label text-red-700">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1.5" />
                          This tenant has exceeded the <strong>{overdueThresholdDays}-day</strong> overdue payment threshold configured in System Settings.
                        </div>
                      )}
                      <div className="flex gap-2">
                        {selectedContract.status !== 'eviction-pending' ? (
                          <button onClick={() => handleFlagEviction(selectedContract.id)} className={btn('danger', 'sm')}>
                            <FontAwesomeIcon icon={faGavel} /> Flag for Eviction
                          </button>
                        ) : (
                          <button onClick={() => handleClearEviction(selectedContract.id)} className={btn('success', 'sm')}>
                            <FontAwesomeIcon icon={faCheckCircle} /> Clear Eviction Flag
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintAgreement}
                  className={btn('secondary', 'sm', 'btn-interactive')}
                >
                  <FontAwesomeIcon icon={faPrint} /> Print Agreement
                </button>
                {selectedContract.tenantEmail && (
                  <button
                    type="button"
                    onClick={() => window.open('/view-contract?email=' + encodeURIComponent(selectedContract.tenantEmail), '_blank')}
                    className="btn-interactive inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-control text-label font-bold hover:bg-indigo-100 cursor-pointer transition-colors"
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} /> Open Tenant View
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewModal(false);
                    setActiveTab('editor');
                  }}
                  className="btn-interactive inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-control text-label font-semibold hover:bg-slate-200 cursor-pointer transition-colors"
                >
                  <FontAwesomeIcon icon={faEdit} /> Edit Master Template
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="btn-interactive px-4 py-2 bg-slate-800 text-white rounded-control text-label font-bold hover:bg-slate-900 border-0 cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
      )}
    </div>
  );
};

export default AdminContracts;
