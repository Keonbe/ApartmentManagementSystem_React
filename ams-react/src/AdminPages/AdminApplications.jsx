import { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { useSearchParams } from 'react-router-dom';
import { getSystemSettings } from '../config/systemSettings';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faTimes, faCalendarAlt, faPhone, faEnvelope,
  faCheckCircle, faClock, faUsers, faVenusMars,
  faFileAlt, faExclamationTriangle, faHome,
  faList, faColumns, faEye, faFilter, faChevronDown,
  faFilePdf, faPaperclip, faSpinner, faBolt
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import ReasonModal from '../Components/form/ReasonModal';
import { fileUrl } from '../api/fileUrl';
import { formatFileSize } from '../Components/form/formHelpers';
import { LIMITS } from '../utils/validation';
import { clickable } from '../utils/clickable';
import Modal from '../Components/admin/Modal';
import { TH, btn } from '../Components/admin/ui/styles';
import { SkeletonList } from '../Components/admin/ui/Skeleton';
import LoadError from '../Components/admin/ui/LoadError';

const STATUS_OPTIONS = [
  { 
    id: 'pending', 
    label: 'Pending Review', 
    statuses: ['Pending Review', 'Pending Deposit'], 
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    countBadge: 'bg-indigo-100 text-indigo-700',
    icon: faClock,
    iconColor: 'text-indigo-500',
    borderCol: 'border-indigo-500',
    emptyText: 'No pending applications'
  },
  { 
    id: 'approved', 
    label: 'Approved · Not Moved In', 
    statuses: ['Approved'], 
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    countBadge: 'bg-emerald-100 text-emerald-700',
    icon: faCheckCircle,
    iconColor: 'text-emerald-700',
    borderCol: 'border-emerald-500',
    emptyText: 'No approved applications'
  },
  { 
    id: 'moved_in', 
    label: 'Approved · Moved In', 
    statuses: ['active'], 
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    countBadge: 'bg-teal-100 text-teal-700',
    icon: faHome,
    iconColor: 'text-teal-500',
    borderCol: 'border-teal-500',
    emptyText: 'No moved-in tenants'
  },
  { 
    id: 'rejected', 
    label: 'Rejected', 
    statuses: ['Rejected', 'Declined'], 
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    countBadge: 'bg-red-100 text-red-700',
    icon: faTimes,
    iconColor: 'text-red-500',
    borderCol: 'border-red-500',
    emptyText: 'No rejected applications'
  },
  { 
    id: 'cancelled', 
    label: 'Cancelled', 
    statuses: ['Cancelled'], 
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    countBadge: 'bg-slate-200 text-slate-700',
    icon: faTimes,
    iconColor: 'text-slate-500',
    borderCol: 'border-slate-400',
    emptyText: 'No cancelled applications'
  },
];
const ALL_STATUS_GROUPS = STATUS_OPTIONS.map(s => s.id);

const AdminApplications = () => {
  const [applications, setApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  // Nothing loaded at all: the list area shows the error, not an empty table.
  const appsFailed = !!errorMsg && applications.length === 0;
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState(null);
  // "Request documents": the application the admin is asking more documents of, and the result notice.
  const [docRequestTarget, setDocRequestTarget] = useState(null);
  const [docRequestNotice, setDocRequestNotice] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [moveInTarget, setMoveInTarget] = useState(null);
  const [isConfirmingMoveIn, setIsConfirmingMoveIn] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleAttachment, setScheduleAttachment] = useState(null);
  const [scheduling, setScheduling] = useState(false);

  // The selected status groups live in the URL, so a Dashboard link works even while
  // this page is already open, and a refresh or bookmark keeps the filter:
  // no ?status = all groups, ?status=none = none, else a comma list (?status=pending,approved).
  const [urlParams, setUrlParams] = useSearchParams();
  const rawStatus = urlParams.get('status');
  const selectedStatuses = useMemo(() => {
    if (rawStatus === null) return ALL_STATUS_GROUPS;
    if (rawStatus === 'none') return [];
    const picked = rawStatus.split(',').filter(g => ALL_STATUS_GROUPS.includes(g));
    return picked.length ? picked : ALL_STATUS_GROUPS;
  }, [rawStatus]);
  const setSelectedStatuses = (next) => {
    const list = typeof next === 'function' ? next(selectedStatuses) : next;
    setUrlParams((prev) => {
      const p = new URLSearchParams(prev);
      if (list.length === ALL_STATUS_GROUPS.length) p.delete('status');
      else if (list.length === 0) p.set('status', 'none');
      else p.set('status', ALL_STATUS_GROUPS.filter(g => list.includes(g)).join(','));
      return p;
    }, { replace: true });
  };
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('ams_admin_app_view') || 'table');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const filterDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setShowStatusFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('ams_admin_app_view', mode);
  };

  const isAllStatusesSelected = selectedStatuses.length === STATUS_OPTIONS.length;
  const isNoStatusSelected = selectedStatuses.length === 0;

  const getFilterButtonLabel = () => {
    if (isNoStatusSelected) return 'No Status Selected';
    if (isAllStatusesSelected) return 'All Statuses';
    if (selectedStatuses.length === 1) {
      const match = STATUS_OPTIONS.find(s => s.id === selectedStatuses[0]);
      return match ? match.label : '1 Status Selected';
    }
    return `${selectedStatuses.length} Statuses Selected`;
  };

  const toggleAllStatuses = () => {
    if (selectedStatuses.length === STATUS_OPTIONS.length) {
      setSelectedStatuses([]);
    } else {
      setSelectedStatuses(STATUS_OPTIONS.map(s => s.id));
    }
  };

  const toggleStatus = (id) => {
    setSelectedStatuses(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const getMoveInDisplay = (app) => {
    if (!app || !app.preferred_move_in_date) return 'Any time';
    const appCreated = app.created_at ? new Date(app.created_at).toISOString().slice(0, 10) : '';
    const prefDate = String(app.preferred_move_in_date).slice(0, 10);
    if (appCreated && prefDate === appCreated) return 'Any time';
    return new Date(app.preferred_move_in_date).toLocaleDateString();
  };

  const getCategoryCount = (categoryId) => {
    const category = STATUS_OPTIONS.find(c => c.id === categoryId);
    if (!category) return 0;
    return applications.filter(a => category.statuses.includes(a.status)).length;
  };

  const loadApplications = async () => {
    try {
      const res = await api.get('/get_applications.php');
      if (res.data.success) {
        setApplications(res.data.data);
      } else {
        setErrorMsg("API returned success=false");
      }
    } catch (err) {
      console.error("Error fetching applications:", err);
      setErrorMsg(err.message || "Failed to fetch applications");
    } finally {
      setLoading(false);
    }
  };

  const fetchApplications = () => {
    setLoading(true);
    setErrorMsg(null);
    return loadApplications();
  };

  useEffect(() => {
    const load = async () => { await loadApplications(); };
    load();
  }, []);

  const updateStatus = async (id, status, rejectionReason = null) => {
    try {
      const res = await api.post('/update_tenant_status.php', { 
        id, 
        status, 
        rejection_reason: rejectionReason 
      });
      if (!res.data.success) {
        alert(apiErrorMessage(res, 'Failed to update the application.'));
        return false;
      }
      fetchApplications();
      return true;
    } catch (err) {
      console.error("Error updating status:", err);
      alert(apiErrorMessage(err, 'Failed to update the application.'));
      return false;
    }
  };

  const [rejectTarget, setRejectTarget] = useState(null);
  // Revoking an approval at the tenant's request keeps the cancellation fee (Settings → Rental).
  const [cancellationFee, setCancellationFee] = useState(0);
  const [tenantRequestId, setTenantRequestId] = useState(null); // application the box is ticked for
  useEffect(() => {
    getSystemSettings().then((s) => setCancellationFee(Number(s.cancellationFee) || 0)).catch(() => {});
  }, []);
  const [preview, setPreview] = useState(null);
  
  const openPreview = (e, target, title) => {
    e?.preventDefault();
    if (!target) return;
    if (typeof target === 'object' && target instanceof File) {
      const isImage = target.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(target.name);
      setPreview({ url: URL.createObjectURL(target), title: title || target.name, isImage, isLocalBlob: true });
      return;
    }
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(String(target));
    setPreview({ url: String(target).startsWith('blob:') || String(target).startsWith('http') ? target : fileUrl(target), title: title || 'Document Preview', isImage, isLocalBlob: false });
  };

  const closePreview = () => {
    if (preview?.isLocalBlob && preview?.url) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  };

  const confirmReject = async (reason, file) => {
    let res;
    try {
      const formData = new FormData();
      formData.append('id', rejectTarget.id);
      const byTenant = tenantRequestId === rejectTarget.id && rejectTarget.status === 'Approved';
      formData.append('status', byTenant ? 'Cancelled' : 'Rejected');
      if (byTenant) formData.append('at_tenant_request', '1');
      formData.append('rejection_reason', reason);
      if (file) {
        formData.append('attachment', file);
      }
      res = await api.post('/update_tenant_status.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } catch (err) {
      console.error("Error rejecting application:", err);
      throw new Error(apiErrorMessage(err, 'Failed to update the application.'), { cause: err });
    }
    if (!res.data.success) throw new Error(apiErrorMessage(res, 'Failed to update the application.'));
    if (res.data.refunds_raised) alert(`${res.data.refunds_raised} refund request(s) were opened for payments this applicant already made. Review them under Refunds.`);
    if (res.data.cancellation_fee_kept) alert(`A cancellation fee of ₱${Number(res.data.cancellation_fee_kept).toLocaleString()} was kept${res.data.refunds_raised ? ' from the refund' : ' (nothing was left to refund)'}.`);
    setTenantRequestId(null);
    setRejectTarget(null);
    setShowProfileModal(false);
    fetchApplications();
  };

  const confirmApprove = async () => {
    if (!approveTarget || isApproving) return;
    setIsApproving(true);
    try {
      const res = await api.post('/update_tenant_status.php', { id: approveTarget.id, status: 'Approved' });
      if (!res.data.success) throw new Error(apiErrorMessage(res, 'Failed to approve the application.'));
      setApproveTarget(null);
      setShowProfileModal(false);
      await fetchApplications();
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to approve the application.'));
    } finally {
      setIsApproving(false);
    }
  };

  const scheduleMoveIn = async (e) => {
    e.preventDefault();
    if (!scheduleTarget || !scheduleDate) return;
    setScheduling(true);
    try {
      const body = new FormData();
      body.append('id', scheduleTarget.id);
      body.append('move_in_date', scheduleDate);
      body.append('message', scheduleMessage);
      if (scheduleAttachment) body.append('attachment', scheduleAttachment);
      const res = await api.post('/schedule_move_in.php', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!res.data.success) throw new Error(apiErrorMessage(res, 'Could not send the move-in notice.'));
      setScheduleTarget(null); setScheduleDate(''); setScheduleMessage(''); setScheduleAttachment(null);
      setShowProfileModal(false); fetchApplications();
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not send the move-in notice.'));
    } finally { setScheduling(false); }
  };

  const handleConfirmMoveIn = async () => {
    if (!moveInTarget) return;
    setIsConfirmingMoveIn(true);
    try {
      // Stay on the profile when the server refuses, so the reason can be acted on.
      if (await updateStatus(moveInTarget.id, 'active')) {
        setMoveInTarget(null);
        setShowProfileModal(false);
      } else {
        setMoveInTarget(null);
      }
    } finally {
      setIsConfirmingMoveIn(false);
    }
  };

  const openProfile = (app) => {
    setSelectedApp(app);
    setShowProfileModal(true);
  };

  const filteredApps = applications.filter(app => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = 
      (app.name || '').toLowerCase().includes(q) || 
      (app.unit || '').toLowerCase().includes(q) || 
      (app.email || '').toLowerCase().includes(q) ||
      (app.phone || '').toLowerCase().includes(q);

    const matchingCategory = STATUS_OPTIONS.find(opt => opt.statuses.includes(app.status));
    // A status outside every group (e.g. archived) shows in the full list only, so a narrowed filter shows exactly its groups.
    const matchesStatus = matchingCategory ? selectedStatuses.includes(matchingCategory.id) : isAllStatusesSelected;

    return matchesSearch && matchesStatus;
  });

  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  // Shared by the table row (md and up) and the phone card.
  const renderApplicantAvatar = (app) => (
    app.avatar_url ? (
      <img
        src={fileUrl(app.avatar_url)}
        alt="Avatar"
        className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0 shadow-inner"
      />
    ) : (
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0 shadow-inner ${
        app.status === 'Pending Review' || app.status === 'Pending Deposit' ? 'bg-indigo-600' :
        app.status === 'active' || app.status === 'Approved' ? 'bg-emerald-700' : 'bg-red-600'
      }`}>
        {getInitials(app.name)}
      </div>
    )
  );

  const renderStatusBadge = (status) => {
    const norm = String(status || '').toLowerCase();
    if (norm === 'pending review' || norm === 'pending deposit') {
      return (
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 ring-indigo-200 ring-1 ring-inset">
          <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Pending Review
        </span>
      );
    }
    if (norm === 'approved') {
      return (
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 ring-emerald-200 ring-1 ring-inset">
          <FontAwesomeIcon icon={faCheckCircle} className="text-[10px]" /> Approved · Not Moved In
        </span>
      );
    }
    if (norm === 'active') {
      return (
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 ring-teal-200 ring-1 ring-inset">
          <FontAwesomeIcon icon={faHome} className="text-[10px]" /> Approved · Moved In
        </span>
      );
    }
    if (norm === 'rejected' || norm === 'declined') {
      return (
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1.5 bg-red-50 text-red-700 ring-red-200 ring-1 ring-inset">
          <FontAwesomeIcon icon={faTimes} className="text-[10px]" /> Rejected
        </span>
      );
    }
    if (norm === 'cancelled') {
      return (
        <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 ring-slate-200 ring-1 ring-inset">
          <FontAwesomeIcon icon={faTimes} className="text-[10px]" /> Cancelled
        </span>
      );
    }
    return (
      <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 ring-slate-200 ring-1 ring-inset">
        {status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : 'Unknown'}
      </span>
    );
  };

  const ApplicationCard = ({ app, isPending }) => (
    <div 
      onClick={() => openProfile(app)}
      className="card-interactive bg-white border border-slate-200 rounded-card p-4 shadow-card hover:shadow-raised transition-all cursor-pointer group flex flex-col justify-between min-h-[148px]"
    >
      <div>
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {app.avatar_url ? (
              <img 
                src={fileUrl(app.avatar_url)} 
                alt="Applicant Avatar" 
                className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0 shadow-inner"
              />
            ) : (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0 shadow-inner ${
                isPending ? 'bg-indigo-600' : app.status === 'active' || app.status === 'Approved' ? 'bg-emerald-700' : 'bg-red-600'
              }`}>
                {getInitials(app.name)}
              </div>
            )}

            <div className="min-w-0">
              <h4 className="m-0 text-body font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{app.name}</h4>
              <p className="m-0 text-caption text-slate-500">{new Date(app.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-slate-100 text-slate-600 ring-slate-200 shrink-0 ring-1 ring-inset">
            Unit {app.unit}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mt-2 text-label">
          <div className="flex items-center gap-1.5 text-slate-500">
            <FontAwesomeIcon icon={faUsers} className="text-[10px] shrink-0 text-slate-500" /> 
            <span className="truncate">{app.occupants} Occupant(s)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <FontAwesomeIcon icon={faCalendarAlt} className="text-[10px] shrink-0 text-slate-500" /> 
            <span className="truncate">{app.months_of_rent} Months</span>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-label">
        <span className="text-slate-500 text-caption truncate mr-2">
          Move in: <strong className="text-slate-700 font-semibold">{getMoveInDisplay(app)}</strong>
        </span>
        <span className="font-bold text-indigo-600 shrink-0">{app.rent}</span>
      </div>
    </div>
  );

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Rent Applications Tracker" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header Area */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-section font-bold text-slate-800 m-0">Application Pipeline</h2>
                <p className="text-body text-slate-500 m-0 mt-1">Manage and track incoming rent applications</p>
              </div>
              <div className="flex items-center gap-3 w-full max-w-sm bg-white border border-slate-200 rounded-control px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-card">
                <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-sm" />
                <input maxLength={LIMITS.search} type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search applicants..." className="focus-glow flex-1 bg-transparent text-body text-slate-700 outline-none p-0 border-0 placeholder-slate-400" />
              </div>
            </div>

            {/* Filter Bar & View Toggle */}
            <div className="bg-white border border-slate-200 rounded-card p-3 sm:p-4 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                
                {/* Status Filter Dropdown & Reset */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative" ref={filterDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowStatusFilter(prev => !prev)}
                      className={`inline-flex items-center justify-between sm:justify-start gap-2.5 px-3.5 py-2 rounded-card border text-label sm:text-body font-semibold transition-all shadow-xs cursor-pointer select-none ${
                        !isAllStatusesSelected && !isNoStatusSelected
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 ring-2 ring-indigo-100'
                          : isNoStatusSelected
                          ? 'bg-red-50 border-red-300 text-red-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                      aria-expanded={showStatusFilter}
                      aria-haspopup="true"
                    >
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon 
                          icon={faFilter} 
                          className={!isAllStatusesSelected ? 'text-indigo-600' : 'text-slate-500'} 
                        />
                        <span className="text-slate-600 font-normal hidden sm:inline">Status:</span>
                        <span className="font-bold">{getFilterButtonLabel()}</span>
                      </div>

                      <div className="flex items-center gap-2 ml-1">
                        <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${
                          !isAllStatusesSelected && !isNoStatusSelected
                            ? 'bg-indigo-600 text-white'
                            : isNoStatusSelected
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {selectedStatuses.length}/{STATUS_OPTIONS.length}
                        </span>
                        <FontAwesomeIcon 
                          icon={faChevronDown} 
                          className={`text-xs text-slate-500 transition-transform duration-200 ${
                            showStatusFilter ? 'rotate-180 text-indigo-600' : ''
                          }`} 
                        />
                      </div>
                    </button>

                    {/* Dropdown Menu */}
                    {showStatusFilter && (
                      <div className="absolute left-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] bg-white rounded-card shadow-raised border border-slate-200 z-50 p-3 space-y-2">
                        {/* Dropdown Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                          <span className="text-label font-medium text-slate-700 flex items-center gap-1.5 capitalize">
                            <FontAwesomeIcon icon={faFilter} className="text-slate-500 text-[10px]" />
                            Filter by Status
                          </span>
                          <button
                            type="button"
                            onClick={toggleAllStatuses}
                            className="text-label font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer p-0"
                          >
                            {isAllStatusesSelected ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>

                        {/* Checkbox Items */}
                        <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
                          {STATUS_OPTIONS.map(opt => {
                            const isChecked = selectedStatuses.includes(opt.id);
                            const count = getCategoryCount(opt.id);
                            return (
                              <label
                                key={opt.id}
                                className={`flex items-center justify-between p-2 rounded-card cursor-pointer select-none transition-all ${
                                  isChecked 
                                    ? 'bg-indigo-50/50 hover:bg-indigo-50 text-slate-900 font-semibold' 
                                    : 'hover:bg-slate-50 text-slate-500 opacity-75 hover:opacity-100'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleStatus(opt.id)}
                                    className="w-4 h-4 rounded-control text-indigo-600 accent-indigo-600 cursor-pointer shrink-0"
                                  />
                                  <FontAwesomeIcon 
                                    icon={opt.icon} 
                                    className={`text-xs shrink-0 ${isChecked ? opt.iconColor : 'text-slate-500'}`} 
                                  />
                                  <span className="text-label truncate">
                                    {opt.label}
                                  </span>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap shrink-0 ${
                                  isChecked ? opt.countBadge : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {count}
                                </span>
                              </label>
                            );
                          })}
                        </div>

                        {/* Dropdown Footer */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between px-1 text-label">
                          <span className="text-slate-500 font-medium">
                            {filteredApps.length} matching application{filteredApps.length !== 1 ? 's' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowStatusFilter(false)}
                            className="text-label font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-control border-0 cursor-pointer transition-colors"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reset Button (shows if filtered) */}
                  {!isAllStatusesSelected && (
                    <button
                      type="button"
                      onClick={() => setSelectedStatuses(STATUS_OPTIONS.map(s => s.id))}
                      className="inline-flex items-center gap-1.5 text-label font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-200/80 rounded-card px-3 py-2 transition-all cursor-pointer"
                      title="Reset filters to show all statuses"
                    >
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                {/* View Switcher & Counter */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <span className="text-label text-slate-500 font-medium">
                    Showing <span className="font-bold text-slate-700">{filteredApps.length}</span> of {applications.length}
                  </span>
                  
                  <div className="flex items-center bg-slate-100 p-1 rounded-card border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('table')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label font-bold transition-all border-0 cursor-pointer ${
                        viewMode === 'table' ? 'bg-white text-indigo-600 shadow-card' : 'bg-transparent text-slate-600 hover:text-slate-800'
                      }`}
                      title="Horizontal Table View"
                    >
                      <FontAwesomeIcon icon={faList} />
                      <span>Table</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('kanban')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label font-bold transition-all border-0 cursor-pointer ${
                        viewMode === 'kanban' ? 'bg-white text-indigo-600 shadow-card' : 'bg-transparent text-slate-600 hover:text-slate-800'
                      }`}
                      title="Kanban Board View"
                    >
                      <FontAwesomeIcon icon={faColumns} />
                      <span>Board</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {errorMsg && !appsFailed && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-control text-body">
                <strong>Error loading applications:</strong> {errorMsg}
              </div>
            )}
            
            {loading && (
              <div className="bg-white border border-slate-200 rounded-card shadow-card overflow-hidden">
                <SkeletonList rows={6} label="Loading applications…" />
              </div>
            )}

            {/* Table View (Horizontal Orientation) */}
            {!loading && appsFailed && (
              <div className="bg-white border border-slate-200 rounded-card shadow-card">
                <LoadError title="Couldn't load applications" detail={errorMsg} onRetry={fetchApplications} />
              </div>
            )}

            {!loading && !appsFailed && viewMode === 'table' && (
              <div className="bg-white border border-slate-200 rounded-card overflow-hidden shadow-card table-scroll-x">
                <table className="hidden md:table w-full text-body">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className={TH}>Applicant</th>
                      <th className={TH}>Requested Unit</th>
                      <th className={TH}>Tenancy Terms</th>
                      <th className={TH}>Move In By</th>
                      <th className={TH}>Applied On</th>
                      <th className={TH}>Status</th>
                      <th className={`${TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredApps.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center py-12 text-slate-500 text-body">
                          <FontAwesomeIcon icon={faSearch} className="text-slate-300 text-2xl mb-2 block mx-auto" />
                          No applications found matching your criteria.
                          {selectedStatuses.length < STATUS_OPTIONS.length && (
                            <button
                              type="button"
                              onClick={() => setSelectedStatuses(STATUS_OPTIONS.map(s => s.id))}
                              className="block mx-auto mt-2 text-label font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer"
                            >
                              Reset status filters
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredApps.map((app) => (
                        <tr 
                          key={app.id} 
                          {...clickable(() => openProfile(app), { role: null })}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                        >
                          {/* Applicant */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {renderApplicantAvatar(app)}
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                                  <span className="truncate">{app.name}</span>
                                  {app.gender && app.gender !== 'Not Specified' && (
                                    <span className="text-caption font-semibold px-1.5 py-0.2 rounded-control bg-slate-100 text-slate-600 shrink-0">
                                      {app.gender}
                                    </span>
                                  )}
                                </div>
                                <div className="text-label text-slate-500 mt-0.5 flex items-center gap-2">
                                  <span className="truncate max-w-[180px]">{app.email || '—'}</span>
                                  {app.phone && <span>• {app.phone}</span>}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Unit & Rent */}
                          <td className="px-4 py-4">
                            <div className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-block bg-slate-100 text-slate-700 ring-slate-200 mb-1 ring-1 ring-inset">
                              Unit {app.unit}
                            </div>
                            <div className="text-label font-bold text-indigo-600">{app.rent}</div>
                          </td>

                          {/* Tenancy Terms */}
                          <td className="px-4 py-4 text-label text-slate-600">
                            <div className="flex items-center gap-1.5 font-medium">
                              <FontAwesomeIcon icon={faUsers} className="text-slate-500 text-[10px]" />
                              <span>{app.occupants} Person(s)</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-medium mt-1">
                              <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-500 text-[10px]" />
                              <span>{app.months_of_rent} Months Term</span>
                            </div>
                          </td>

                          {/* Move In By */}
                          <td className="px-4 py-4 text-label">
                            <span className={`font-semibold ${
                              getMoveInDisplay(app) === 'Any time' ? 'text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-control' : 'text-slate-700'
                            }`}>
                              {getMoveInDisplay(app)}
                            </span>
                          </td>

                          {/* Applied On */}
                          <td className="px-4 py-4 text-label text-slate-500">
                            {app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4">
                            {renderStatusBadge(app.status)}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openProfile(app); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-label transition-all border border-indigo-200 hover:border-indigo-600 cursor-pointer shadow-xs"
                            >
                              <FontAwesomeIcon icon={faEye} />
                              <span>Review</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Cards (phones) */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredApps.length === 0 ? (
                    <div className="text-center py-12 px-4 text-slate-500 text-body">
                      <FontAwesomeIcon icon={faSearch} className="text-slate-300 text-2xl mb-2 block mx-auto" />
                      No applications found matching your criteria.
                      {selectedStatuses.length < STATUS_OPTIONS.length && (
                        <button
                          type="button"
                          onClick={() => setSelectedStatuses(STATUS_OPTIONS.map(s => s.id))}
                          className="block mx-auto mt-2 text-label font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer"
                        >
                          Reset status filters
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredApps.map((app) => (
                      <div key={app.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {renderApplicantAvatar(app)}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 truncate">{app.name}</div>
                              <div className="text-label text-slate-500 truncate">{app.email || '—'}</div>
                            </div>
                          </div>
                          <div className="shrink-0">{renderStatusBadge(app.status)}</div>
                        </div>
                        <dl className="space-y-1.5 text-body m-0">
                          {[
                            ['Unit', <span className="font-bold text-slate-700">Unit {app.unit} · <span className="text-indigo-600">{app.rent}</span></span>],
                            ['Terms', `${app.occupants} Person(s) · ${app.months_of_rent} Months`],
                            ['Move in by', getMoveInDisplay(app)],
                            ['Applied on', app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'],
                            ...(app.phone ? [['Phone', app.phone]] : []),
                          ].map(([label, value]) => (
                            <div key={label} className="flex justify-between gap-3">
                              <dt className="text-slate-500 shrink-0">{label}</dt>
                              <dd className="m-0 text-slate-700 text-right">{value}</dd>
                            </div>
                          ))}
                        </dl>
                        <button
                          type="button"
                          onClick={() => openProfile(app)}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-control bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-body transition-all border border-indigo-200 hover:border-indigo-600 cursor-pointer"
                        >
                          <FontAwesomeIcon icon={faEye} />
                          <span>Review</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Kanban Board View */}
            {!loading && !appsFailed && viewMode === 'kanban' && (
              selectedStatuses.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-body bg-white border border-slate-200 rounded-card shadow-card">
                  <FontAwesomeIcon icon={faFilter} className="text-slate-300 text-2xl mb-2 block mx-auto" />
                  No status columns selected. Please check one or more filters above.
                  <button
                    type="button"
                    onClick={() => setSelectedStatuses(STATUS_OPTIONS.map(s => s.id))}
                    className="block mx-auto mt-2 text-label font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer"
                  >
                    Select All
                  </button>
                </div>
              ) : (
                <div className={`grid gap-4 items-start ${
                  selectedStatuses.length === 1 ? 'grid-cols-1 max-w-md' :
                  selectedStatuses.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-4xl' :
                  selectedStatuses.length === 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' :
                  selectedStatuses.length === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' :
                  'grid-cols-1 md:grid-cols-2 xl:grid-cols-5'
                }`}>
                  {STATUS_OPTIONS.filter(cat => selectedStatuses.includes(cat.id)).map(cat => {
                    const colApps = filteredApps.filter(a => cat.statuses.includes(a.status));
                    return (
                      <div key={cat.id} className="flex flex-col gap-3 min-w-0">
                        {/* Header: Fixed height h-12 ensures all 5 border lines are at the exact same horizontal position */}
                        <div className={`flex items-center justify-between border-b-2 ${cat.borderCol} pb-2.5 h-12 shrink-0`}>
                          <div className="flex items-center gap-1.5 min-w-0 pr-1">
                            <FontAwesomeIcon icon={cat.icon} className={`${cat.iconColor} text-xs shrink-0`} />
                            <h3 
                              className="font-medium text-slate-700 m-0 text-label leading-tight truncate capitalize" 
                              title={cat.label}
                            >
                              {cat.label}
                            </h3>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap shrink-0 ${cat.countBadge}`}>
                            {colApps.length}
                          </span>
                        </div>

                        {/* Column body: cards and empty placeholders have matching min-h-[148px] */}
                        <div className="stagger-children space-y-3">
                          {colApps.length === 0 ? (
                            <div className="min-h-[148px] flex flex-col items-center justify-center p-4 border border-dashed border-slate-300 rounded-card text-slate-500 text-label font-medium text-center bg-slate-50/50">
                              <FontAwesomeIcon icon={cat.icon} className="text-slate-300 text-base mb-2" />
                              <span>{cat.emptyText}</span>
                            </div>
                          ) : (
                            colApps.map(app => (
                              <ApplicationCard key={app.id} app={app} isPending={cat.id === 'pending'} />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </main>

      {/* ─── APPLICANT REVIEW MODAL ─── */}
      {showProfileModal && selectedApp && (
        <Modal title={`${selectedApp.name}`} onClose={() => setShowProfileModal(false)} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" className="bg-white rounded-card shadow-dialog w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className={`px-8 py-6 flex items-center justify-between shrink-0 text-white ${
              selectedApp.status === 'Pending Review' || selectedApp.status === 'Pending Deposit' ? 'bg-gradient-to-r from-indigo-600 to-indigo-800' : 
              selectedApp.status === 'active' || selectedApp.status === 'Approved' ? 'bg-gradient-to-r from-emerald-600 to-emerald-800' : 'bg-gradient-to-r from-red-600 to-red-800'
            }`}>
              <div className="flex items-center gap-5">
                
                {/* Modal Window Profile Avatar Display */}
                {selectedApp.avatar_url ? (
                  <img 
                    src={fileUrl(selectedApp.avatar_url)} 
                    alt="Modal Profile Avatar" 
                    className="w-16 h-16 rounded-card object-cover border-2 border-white/20 shadow-raised bg-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-card bg-white/20 flex items-center justify-center text-page font-bold shadow-inner border border-white/20 shrink-0">
                    {getInitials(selectedApp.name)}
                  </div>
                )}

                <div>
                  <h3 className="text-section font-bold m-0 leading-tight flex items-center gap-2">
                    {selectedApp.name}
                    {selectedApp.suffix && <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-white/20">{selectedApp.suffix}</span>}
                  </h3>
                  <div className="flex items-center gap-3 text-label mt-1 opacity-90">
                    <span>Applied on {new Date(selectedApp.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="font-semibold px-2 py-0.5 bg-white/20 rounded-control">Requested Unit {selectedApp.unit}</span>
                  </div>
                </div>
              </div>
              <button aria-label="Close" onClick={() => setShowProfileModal(false)} className="text-white hover:bg-white/20 p-2 rounded-card border-0 bg-transparent cursor-pointer transition-colors">
                <FontAwesomeIcon icon={faTimes} className="text-xl" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50 space-y-6 sm:space-y-8">
              
              {['Rejected', 'Declined', 'Cancelled'].includes(selectedApp.status) && selectedApp.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-card p-4 flex items-start gap-2.5 text-red-800">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <span className="font-medium text-label block capitalize">{selectedApp.status === 'Cancelled' ? 'Cancellation Reason' : 'Rejection Reason'}</span>
                    <p className="text-body m-0 mt-1 font-medium">{selectedApp.rejection_reason}</p>
                    {selectedApp.rejection_attachment_path && (
                      <div className="mt-3 pt-3 border-t border-red-200/60">
                        <span className="text-label font-medium block text-red-700 mb-1.5 flex items-center gap-1.5 capitalize">
                          <FontAwesomeIcon icon={faPaperclip} className="text-xs" /> Attached Supporting Document / Image:
                        </span>
                        {selectedApp.rejection_attachment_path.toLowerCase().endsWith('.pdf') ? (
                          <button
                            type="button"
                            onClick={(e) => openPreview(e, selectedApp.rejection_attachment_path, 'Rejection Document')}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-700 hover:bg-red-100/50 rounded-control text-label font-semibold cursor-pointer transition-colors shadow-xs"
                          >
                            <FontAwesomeIcon icon={faFilePdf} className="text-red-600" />
                            <span>View Attached PDF</span>
                          </button>
                        ) : (
                          <div 
                            onClick={(e) => openPreview(e, selectedApp.rejection_attachment_path, 'Rejection Attachment')}
                            className="relative inline-block cursor-pointer group"
                          >
                            <img 
                              src={fileUrl(selectedApp.rejection_attachment_path)} 
                              alt="Rejection Attachment" 
                              className="max-h-36 max-w-full rounded-control border border-red-200 object-cover shadow-xs group-hover:opacity-90 transition-opacity bg-white" 
                            />
                            <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap absolute bottom-1 right-1 bg-slate-900/70 text-white">Click to enlarge</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="stagger-children grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card-interactive bg-white rounded-card p-4 border border-slate-200 shadow-card flex flex-col justify-between">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faUsers} className="mr-1"/> Occupants</p>
                  <p className="text-body font-semibold text-slate-800 m-0">{selectedApp.occupants} Person(s)</p>
                </div>
                <div className="card-interactive bg-white rounded-card p-4 border border-slate-200 shadow-card flex flex-col justify-between">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faCalendarAlt} className="mr-1"/> Rent Term</p>
                  <p className="text-body font-semibold text-slate-800 m-0">{selectedApp.months_of_rent} Months</p>
                </div>
                <div className="card-interactive bg-white rounded-card p-4 border border-slate-200 shadow-card flex flex-col justify-between">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faCalendarAlt} className="mr-1"/> Move In By</p>
                  <p className="text-body font-semibold text-slate-800 m-0">
                    {getMoveInDisplay(selectedApp)}
                  </p>
                </div>
                <div className="card-interactive bg-white rounded-card p-4 border border-slate-200 shadow-card flex flex-col justify-between">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faHome} className="mr-1"/> Monthly Rent</p>
                  <p className="text-body font-bold text-indigo-600 m-0">{selectedApp.rent}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-card p-4 border border-slate-200 shadow-card flex flex-col justify-between">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faEnvelope} className="mr-1"/> Email Address</p>
                  <p className="text-body font-semibold text-slate-800 m-0 truncate" title={selectedApp.email}>{selectedApp.email || '—'}</p>
                </div>
                <div className="bg-white rounded-card p-4 border border-slate-200 shadow-card flex flex-col justify-between">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faPhone} className="mr-1"/> Contact Number</p>
                  <p className="text-body font-semibold text-slate-800 m-0">{selectedApp.phone || '—'}</p>
                </div>
                <div className="bg-white rounded-card p-4 border border-slate-200 shadow-card flex flex-col justify-between">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faVenusMars} className="mr-1"/> Gender</p>
                  <p className="text-body font-semibold text-slate-800 m-0">{selectedApp.gender || 'Not Specified'}</p>
                </div>
              </div>

              <div className="bg-white rounded-card p-4 border border-slate-200 shadow-card">
                <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faHome} className="mr-1"/> Previous Address</p>
                <p className="text-body font-semibold text-slate-800 m-0 wrap-break-word">{selectedApp.previous_address || '—'}</p>
              </div>

              <div className="bg-white rounded-card p-4 border border-slate-200 shadow-card">
                <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize">Emergency Contact</p>
                <p className="text-body font-semibold text-slate-800 m-0 wrap-break-word">
                  {selectedApp.emergency_contact
                    ? `${selectedApp.emergency_contact.name} (${selectedApp.emergency_contact.relationship}) · ${selectedApp.emergency_contact.phone}`
                    : '—'}
                </p>
              </div>

              {/* Verification Documents */}
              <div>
                 <h4 className="text-sm font-medium text-slate-800 mb-3 border-b border-slate-200 pb-2">Submitted Documents</h4>
                 {/* Uploaded files, then each active required requirement with no file (Settings → Application Requirements). */}
                 {selectedApp.documents_verified_at && !(selectedApp.documents || []).length && (
                   <p className="m-0 mb-3 text-label font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-control p-2.5">Documents verified in person by the office on {String(selectedApp.documents_verified_at).slice(0, 10)}.</p>
                 )}
                 {!(selectedApp.documents || []).length && !(selectedApp.missing_documents || []).length && !selectedApp.documents_verified_at ? (
                   <p className="m-0 text-body text-slate-500">No documents on file.</p>
                 ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   {(selectedApp.documents || []).map((doc) => (
                     <button key={doc.id} type="button" onClick={(e) => openPreview(e, doc.file_path, doc.label)}
                        className={btn('secondary', 'md', 'justify-center')}>
                       <FontAwesomeIcon icon={faFileAlt} className="text-2xl text-indigo-500" />
                       <span className="font-semibold text-center mt-1">{doc.label}</span>
                     </button>
                   ))}
                   {!selectedApp.documents_verified_at && (selectedApp.missing_documents || []).map((label) => (
                     <div key={`missing-${label}`}
                        className="flex flex-col items-center justify-center gap-2 text-body p-4 rounded-card border-2 border-dashed border-slate-200 bg-slate-50 text-slate-500">
                       <FontAwesomeIcon icon={faFileAlt} className="text-2xl text-slate-300" />
                       <span className="font-semibold text-center mt-1">{label}</span>
                       <span className="text-label">Missing</span>
                     </div>
                   ))}
                 </div>
                 )}
              </div>

              {/* Ask the applicant for more documents (a notice; they answer by chat or at the office) */}
              {(selectedApp.status === 'Pending Review' || selectedApp.status === 'Approved') && (
                <div className="mt-6">
                  <button type="button" onClick={() => { setDocRequestNotice(''); setDocRequestTarget(selectedApp); }} className={btn('secondary', 'md', 'w-full justify-center')}>
                    <FontAwesomeIcon icon={faPaperclip} aria-hidden="true" /> Request more documents
                  </button>
                  {docRequestNotice && <p role="status" className="m-0 mt-2 text-label font-semibold text-emerald-700">{docRequestNotice}</p>}
                </div>
              )}

              {/* Actions */}
              {(selectedApp.status === 'Pending Review' || selectedApp.status === 'Pending Deposit') && (
                <div className="flex gap-4 mt-8 pt-6 border-t border-slate-200">
                    <button 
                      type="button"
                      disabled={isApproving}
                      onClick={() => setApproveTarget(selectedApp)} 
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white p-4 rounded-card border-0 cursor-pointer text-body font-bold hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-raised hover:shadow-raised hover:-translate-y-0.5"
                    >
                      <FontAwesomeIcon icon={faCheckCircle} className="text-lg" /> APPROVE
                    </button>
                    <button 
                      type="button"
                      disabled={isApproving}
                      onClick={() => setRejectTarget(selectedApp)}
                    className="flex-1 flex items-center justify-center gap-2 bg-white text-red-600 border-2 border-red-200 p-4 rounded-card cursor-pointer text-body font-bold hover:bg-red-50 hover:border-red-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-card"
                  >
                    <FontAwesomeIcon icon={faTimes} className="text-lg" /> REJECT
                  </button>
                </div>
              )}

              {selectedApp.status === 'Approved' && (
                <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
                  {!selectedApp.initial_payment_paid ? (
                    <p className="m-0 text-body text-amber-700 bg-amber-50 border border-amber-200 rounded-card p-4">Awaiting confirmed initial payment. The applicant can still cancel before moving in.</p>
                  ) : !selectedApp.move_in_date ? (
                    <button onClick={() => setScheduleTarget(selectedApp)} className={btn('primary', 'md', 'w-full justify-center')}>
                      <FontAwesomeIcon icon={faCalendarAlt} /> Send move-in date
                    </button>
                  ) : (
                    <div className="flex gap-3">
                      <div className="flex-1 rounded-card border border-indigo-200 bg-indigo-50 p-4 text-body text-indigo-800">Move-in date sent: <strong>{new Date(selectedApp.move_in_date).toLocaleDateString()}</strong></div>
                      <button onClick={() => setMoveInTarget(selectedApp)} className="rounded-card bg-teal-600 px-4 text-body font-bold text-white border-0 cursor-pointer hover:bg-teal-700 transition-colors">Confirm moved in</button>
                    </div>
                  )}
                  <button onClick={() => setRejectTarget(selectedApp)} className="w-full bg-white text-red-600 border border-red-200 p-3 rounded-card cursor-pointer text-label font-bold hover:bg-red-50">Revoke approval / reject</button>
                </div>
              )}
            </div>
          </Modal>
      )}

      {moveInTarget && (
        <Modal
          title="Confirm Physical Move-In"
          onClose={() => !isConfirmingMoveIn && setMoveInTarget(null)}
          busy={isConfirmingMoveIn}
          overlayClassName="flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 shrink-0">
              <FontAwesomeIcon icon={faCheckCircle} className="text-lg" />
            </div>
            <div>
              <h3 className="m-0 text-lg font-black text-slate-800">Confirm Move-In</h3>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                Confirm that <strong className="text-slate-800">{moveInTarget.name}</strong> has physically moved into <strong className="text-slate-800">Unit {moveInTarget.unit}</strong>?
              </p>
              <p className="mt-2 text-xs text-slate-500">
                This will officially activate their tenancy and mark the unit as occupied.
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={isConfirmingMoveIn}
              onClick={() => setMoveInTarget(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isConfirmingMoveIn}
              onClick={handleConfirmMoveIn}
              className="rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-75 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white cursor-pointer transition-all flex items-center gap-2 shadow-sm"
            >
              {isConfirmingMoveIn ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin className="text-xs" />
                  <span>Confirming...</span>
                </>
              ) : (
                'Confirm moved in'
              )}
            </button>
          </div>
        </Modal>
      )}

      {rejectTarget && (
        <ReasonModal
          title={rejectTarget.status === 'Approved' ? (tenantRequestId === rejectTarget.id ? "Revoke Approval & Cancel Application" : "Revoke Approval & Reject Application") : "Reject Application"}
          description={`${rejectTarget.name || 'The applicant'} is notified with this reason.${rejectTarget.status === 'Approved' ? ' Any payment already made is sent to Refunds as a refund request.' : ''}`}
          label={tenantRequestId === rejectTarget.id ? "Reason for cancelling this application" : "Reason for rejecting this application"}
          confirmLabel={rejectTarget.status === 'Approved' ? (tenantRequestId === rejectTarget.id ? "Revoke & Cancel" : "Revoke & Reject") : "Reject Application"}
          suggestions={['Incomplete or unverifiable documents', 'Unit is no longer available', 'Does not meet tenancy requirements', 'Change of mind', 'Other']}
          allowAttachment={true}
          attachmentLabel="Attach Supporting Document / Image (optional)"
          onConfirm={confirmReject}
          onClose={() => { setRejectTarget(null); setTenantRequestId(null); }}
        >
          {rejectTarget.status === 'Approved' && cancellationFee > 0 && (
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={tenantRequestId === rejectTarget.id} onChange={(e) => setTenantRequestId(e.target.checked ? rejectTarget.id : null)} />
              <span>Cancelled at the tenant&apos;s request. A cancellation fee of ₱{cancellationFee.toLocaleString()} is kept from what they already paid (if anything) and the rest goes to Refunds. Leave this off when Management is rejecting the application: the applicant is then refunded in full.</span>
            </label>
          )}
        </ReasonModal>
      )}
      
      {docRequestTarget && (
        <ReasonModal
          title="Request more documents"
          description={`${docRequestTarget.name || 'The applicant'} gets a notice with your message. They can answer through the support chat or at the office.`}
          label="Message"
          placeholder="For example: Please send a clear photo of your NBI clearance."
          confirmLabel="Send request"
          tone="indigo"
          max={500}
          onConfirm={async (message) => {
            const res = await api.post('request_application_documents.php', { id: docRequestTarget.id, message });
            if (!res.data.success) throw new Error(res.data.message || 'Could not send the request.');
            setDocRequestNotice(res.data.message || 'The applicant was notified.');
            setDocRequestTarget(null);
          }}
          onClose={() => setDocRequestTarget(null)}
        />
      )}

      {approveTarget && (
        <Modal title="Approve this application?" onClose={() => setApproveTarget(null)} busy={isApproving} overlayClassName="flex items-center justify-center bg-slate-900/50 p-4" className="w-full max-w-md rounded-card bg-white p-6 shadow-raised">
            <h3 className="m-0 text-title font-bold text-slate-800">Approve this application?</h3>
            <p className="mt-2 text-body text-slate-500">This reserves Unit {approveTarget.unit} for {approveTarget.name} and creates their initial payment request. It does not mark them as moved in.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button 
                type="button"
                disabled={isApproving}
                onClick={() => setApproveTarget(null)} 
                className={btn('secondary', 'md')}
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={isApproving}
                onClick={confirmApprove} 
                className={btn('success', 'md')}
              >
                {isApproving ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin />
                    <span>Approving...</span>
                  </>
                ) : (
                  'Yes, approve'
                )}
              </button>
            </div>
          </Modal>
      )}

      {moveInTarget && (
        <Modal
          title="Confirm Physical Move-In"
          onClose={() => !isConfirmingMoveIn && setMoveInTarget(null)}
          busy={isConfirmingMoveIn}
          overlayClassName="flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          className="w-full max-w-md rounded-card bg-white p-6 shadow-dialog"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-card bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 shrink-0">
              <FontAwesomeIcon icon={faCheckCircle} className="text-lg" />
            </div>
            <div>
              <h3 className="m-0 text-title font-bold text-slate-800">Confirm Move-In</h3>
              <p className="mt-1 text-body text-slate-600 leading-relaxed">
                Confirm that <strong className="text-slate-800">{moveInTarget.name}</strong> has physically moved into <strong className="text-slate-800">Unit {moveInTarget.unit}</strong>?
              </p>
              <p className="mt-2 text-label text-slate-500">
                This will officially activate their tenancy and mark the unit as occupied.
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={isConfirmingMoveIn}
              onClick={() => setMoveInTarget(null)}
              className="rounded-control border border-slate-200 bg-white px-4 py-2 text-body font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isConfirmingMoveIn}
              onClick={handleConfirmMoveIn}
              className="rounded-control bg-teal-600 hover:bg-teal-700 disabled:opacity-75 disabled:cursor-not-allowed px-4 py-2 text-body font-semibold text-white cursor-pointer transition-all flex items-center gap-2 shadow-sm"
            >
              {isConfirmingMoveIn ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin className="text-xs" />
                  <span>Confirming...</span>
                </>
              ) : (
                'Confirm moved in'
              )}
            </button>
          </div>
        </Modal>
      )}

      {scheduleTarget && (
        <Modal
          title="Send move-in date"
          onClose={() => { setScheduleTarget(null); setScheduleAttachment(null); }}
          busy={scheduling}
          as="form"
          overlayClassName="flex items-center justify-center bg-slate-900/50 p-4"
          onSubmit={scheduleMoveIn}
          className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-7 shadow-2xl space-y-5"
        >
          {/* Header */}
          <div className="border-b border-slate-100 pb-3">
            <h3 className="m-0 text-xl font-black text-slate-800">Send Move-In Notice</h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              Initial payment confirmed. Set the official move-in date and send instructions to <strong className="text-slate-700">{scheduleTarget.name}</strong> (Unit {scheduleTarget.unit}).
            </p>
          </div>

          {/* Move-in date with "Move in immediately" option */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="move-in-date-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Move-in Date <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  setScheduleDate(todayStr);
                  if (!scheduleMessage || scheduleMessage.includes('collect your room keys') || scheduleMessage.includes('for your room keys')) {
                    setScheduleMessage('You are cleared to move in immediately starting today! Please stay in touch or contact management for your room keys.');
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  scheduleDate === new Date().toISOString().slice(0, 10)
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}
              >
                <FontAwesomeIcon icon={faBolt} className="text-[11px]" />
                <span>Move in immediately (Today)</span>
              </button>
            </div>

            <input
              id="move-in-date-input"
              required
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
            />

            {scheduleDate === new Date().toISOString().slice(0, 10) ? (
              <p className="m-0 text-xs text-emerald-600 font-bold flex items-center gap-1.5">
                <FontAwesomeIcon icon={faCheckCircle} className="text-xs" />
                Move-in scheduled for immediately today
              </p>
            ) : scheduleDate ? (
              <p className="m-0 text-xs text-slate-500 font-medium">
                Scheduled move-in: <strong className="text-slate-700">{new Date(scheduleDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong>
              </p>
            ) : null}
          </div>

          {/* Message textarea */}
          <div className="space-y-1.5">
            <label htmlFor="move-in-message-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Message <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <textarea
              id="move-in-message-input"
              value={scheduleMessage}
              onChange={e => setScheduleMessage(e.target.value)}
              rows="3"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-400"
              placeholder="Arrival instructions, office hours, key pickup details, etc."
            />
          </div>

          {/* Attachment with File Preview & Actions */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Attachment <span className="text-slate-400 font-normal lowercase">(optional PDF, PNG, JPG up to 10MB)</span>
            </label>

            {scheduleAttachment ? (
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 text-indigo-600 shadow-2xs">
                    {scheduleAttachment.type === 'application/pdf' || scheduleAttachment.name.endsWith('.pdf') ? (
                      <FontAwesomeIcon icon={faFilePdf} className="text-red-500 text-lg" />
                    ) : (
                      <FontAwesomeIcon icon={faPaperclip} className="text-indigo-600 text-base" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate m-0" title={scheduleAttachment.name}>
                      {scheduleAttachment.name}
                    </p>
                    <p className="text-[11px] text-slate-500 m-0 font-medium">
                      {formatFileSize(scheduleAttachment.size)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => openPreview(e, scheduleAttachment, scheduleAttachment.name)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                  >
                    <FontAwesomeIcon icon={faEye} className="text-[11px]" />
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleAttachment(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                    title="Remove file"
                  >
                    <FontAwesomeIcon icon={faTimes} className="text-xs" />
                  </button>
                </div>
              </div>
            ) : (
              <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-4 bg-slate-50/50 hover:bg-indigo-50/20 cursor-pointer transition-colors group">
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setScheduleAttachment(f);
                    e.target.value = '';
                  }}
                  className="sr-only"
                />
                <FontAwesomeIcon icon={faPaperclip} className="text-slate-400 group-hover:text-indigo-600 text-lg mb-1 transition-colors" />
                <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">
                  Click to attach file <span className="font-normal text-slate-400">(PDF, JPG, PNG)</span>
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">Maximum size 10 MB</span>
              </label>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { setScheduleTarget(null); setScheduleAttachment(null); }}
              disabled={scheduling}
              className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scheduling || !scheduleDate}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2 text-sm font-bold text-white transition-colors cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {scheduling ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <span>Send notice</span>
              )}
            </button>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal title={`${preview.title}`} onClose={closePreview} overlayClassName="flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in" className="bg-white rounded-card w-full max-w-4xl max-h-[90vh] shadow-dialog flex flex-col overflow-hidden animate-scale-in">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-title font-bold text-slate-800 m-0">{preview.title}</h3>
              <button aria-label="Close" onClick={closePreview} className="text-slate-500 hover:text-slate-600 bg-white hover:bg-slate-100 rounded-control p-2 transition-colors border border-slate-200 cursor-pointer flex items-center justify-center">
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-900/5 p-4 flex items-center justify-center min-h-[50vh]">
              {preview.isImage ? (
                <img src={preview.url} alt="Preview" className="max-w-full max-h-[75vh] object-contain rounded-control shadow-card" />
              ) : (
                <iframe src={preview.url} className="w-full h-[75vh] rounded-control shadow-card border-0 bg-white" title="Document Preview" />
              )}
            </div>
          </Modal>
      )}
    </div>
  );
};

export default AdminApplications;
