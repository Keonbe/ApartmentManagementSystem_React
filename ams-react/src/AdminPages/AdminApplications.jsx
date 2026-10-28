import { useState, useEffect, useRef } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faTimes, faCalendarAlt, faPhone, faEnvelope,
  faCheckCircle, faClock, faUsers, faVenusMars,
  faFileAlt, faExclamationTriangle, faHome,
  faList, faColumns, faEye, faFilter, faChevronDown,
  faFilePdf, faPaperclip, faSpinner
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import ReasonModal from '../Components/form/ReasonModal';
import { fileUrl } from '../api/fileUrl';
import { LIMITS } from '../utils/validation';
import { clickable } from '../utils/clickable';

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
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    countBadge: 'bg-rose-100 text-rose-700',
    icon: faTimes,
    iconColor: 'text-rose-500',
    borderCol: 'border-rose-500',
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

const AdminApplications = () => {
  const [applications, setApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleAttachment, setScheduleAttachment] = useState(null);
  const [scheduling, setScheduling] = useState(false);

  const [selectedStatuses, setSelectedStatuses] = useState(['pending', 'approved', 'moved_in', 'rejected', 'cancelled']);
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
  const [preview, setPreview] = useState(null);
  
  const openPreview = (e, path, title) => {
    e.preventDefault();
    if (!path) return;
    const isImage = /\.(jpe?g|png|gif)$/i.test(path);
    setPreview({ url: fileUrl(path), title, isImage });
  };

  const confirmReject = async (reason, file) => {
    let res;
    try {
      const formData = new FormData();
      formData.append('id', rejectTarget.id);
      formData.append('status', 'Rejected');
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

  const confirmMoveIn = async (app) => {
    if (!window.confirm(`Confirm that ${app.name} has physically moved into Unit ${app.unit}?`)) return;
    // Stay on the profile when the server refuses, so the reason can be acted on.
    if (await updateStatus(app.id, 'active')) setShowProfileModal(false);
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
    const matchesStatus = matchingCategory ? selectedStatuses.includes(matchingCategory.id) : true;

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
        app.status === 'Pending Review' || app.status === 'Pending Deposit' ? 'bg-indigo-500' :
        app.status === 'active' || app.status === 'Approved' ? 'bg-emerald-500' : 'bg-red-500'
      }`}>
        {getInitials(app.name)}
      </div>
    )
  );

  const renderStatusBadge = (status) => {
    const norm = String(status || '').toLowerCase();
    if (norm === 'pending review' || norm === 'pending deposit') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Pending Review
        </span>
      );
    }
    if (norm === 'approved') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <FontAwesomeIcon icon={faCheckCircle} className="text-[10px]" /> Approved · Not Moved In
        </span>
      );
    }
    if (norm === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
          <FontAwesomeIcon icon={faHome} className="text-[10px]" /> Approved · Moved In
        </span>
      );
    }
    if (norm === 'rejected' || norm === 'declined') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <FontAwesomeIcon icon={faTimes} className="text-[10px]" /> Rejected
        </span>
      );
    }
    if (norm === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
          <FontAwesomeIcon icon={faTimes} className="text-[10px]" /> Cancelled
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
        {status || 'Unknown'}
      </span>
    );
  };

  const ApplicationCard = ({ app, isPending }) => (
    <div 
      onClick={() => openProfile(app)}
      className="card-interactive bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-h-[148px]"
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
                isPending ? 'bg-indigo-500' : app.status === 'active' || app.status === 'Approved' ? 'bg-emerald-500' : 'bg-red-500'
              }`}>
                {getInitials(app.name)}
              </div>
            )}

            <div className="min-w-0">
              <h4 className="m-0 text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{app.name}</h4>
              <p className="m-0 text-[11px] text-slate-500">{new Date(app.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200 shrink-0">
            Unit {app.unit}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
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

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500 text-[11px] truncate mr-2">
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
                <h2 className="text-xl font-bold text-slate-800 m-0">Application Pipeline</h2>
                <p className="text-sm text-slate-500 m-0 mt-1">Manage and track incoming rent applications</p>
              </div>
              <div className="flex items-center gap-3 w-full max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
                <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-sm" />
                <input maxLength={LIMITS.search} type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search applicants..." className="focus-glow flex-1 bg-transparent text-sm text-slate-700 outline-none p-0 border-0 placeholder-slate-400" />
              </div>
            </div>

            {/* Filter Bar & View Toggle */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                
                {/* Status Filter Dropdown & Reset */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative" ref={filterDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowStatusFilter(prev => !prev)}
                      className={`inline-flex items-center justify-between sm:justify-start gap-2.5 px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer select-none ${
                        !isAllStatusesSelected && !isNoStatusSelected
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 ring-2 ring-indigo-100'
                          : isNoStatusSelected
                          ? 'bg-rose-50 border-rose-300 text-rose-800'
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
                        <span className="text-slate-500 font-normal hidden sm:inline">Status:</span>
                        <span className="font-bold">{getFilterButtonLabel()}</span>
                      </div>

                      <div className="flex items-center gap-2 ml-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          !isAllStatusesSelected && !isNoStatusSelected
                            ? 'bg-indigo-600 text-white'
                            : isNoStatusSelected
                            ? 'bg-rose-600 text-white'
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
                      <div className="absolute left-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-3 space-y-2">
                        {/* Dropdown Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faFilter} className="text-slate-500 text-[10px]" />
                            Filter by Status
                          </span>
                          <button
                            type="button"
                            onClick={toggleAllStatuses}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer p-0"
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
                                className={`flex items-center justify-between p-2 rounded-xl cursor-pointer select-none transition-all ${
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
                                    className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer shrink-0"
                                  />
                                  <FontAwesomeIcon 
                                    icon={opt.icon} 
                                    className={`text-xs shrink-0 ${isChecked ? opt.iconColor : 'text-slate-500'}`} 
                                  />
                                  <span className="text-xs truncate">
                                    {opt.label}
                                  </span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                  isChecked ? opt.countBadge : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {count}
                                </span>
                              </label>
                            );
                          })}
                        </div>

                        {/* Dropdown Footer */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between px-1 text-xs">
                          <span className="text-slate-500 font-medium">
                            {filteredApps.length} matching application{filteredApps.length !== 1 ? 's' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowStatusFilter(false)}
                            className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-lg border-0 cursor-pointer transition-colors"
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
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-200/80 rounded-xl px-3 py-2 transition-all cursor-pointer"
                      title="Reset filters to show all statuses"
                    >
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                {/* View Switcher & Counter */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">
                    Showing <span className="font-bold text-slate-700">{filteredApps.length}</span> of {applications.length}
                  </span>
                  
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('table')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                        viewMode === 'table' ? 'bg-white text-indigo-600 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800'
                      }`}
                      title="Horizontal Table View"
                    >
                      <FontAwesomeIcon icon={faList} />
                      <span>Table</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('kanban')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                        viewMode === 'kanban' ? 'bg-white text-indigo-600 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800'
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

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                <strong>Error loading applications:</strong> {errorMsg}
              </div>
            )}
            
            {loading && (
              <div className="text-center py-12 text-slate-500 text-sm bg-white border border-slate-200 rounded-xl shadow-sm">
                <FontAwesomeIcon icon={faClock} className="animate-spin text-slate-300 text-3xl mb-3 block mx-auto" />
                Loading applications pipeline...
              </div>
            )}

            {/* Table View (Horizontal Orientation) */}
            {!loading && viewMode === 'table' && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm table-scroll-x">
                <table className="hidden md:table w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left">
                      <th className="px-5 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Applicant</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Requested Unit</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tenancy Terms</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Move In By</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Applied On</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredApps.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center py-12 text-slate-500 text-sm">
                          <FontAwesomeIcon icon={faSearch} className="text-slate-300 text-2xl mb-2 block mx-auto" />
                          No applications found matching your criteria.
                          {selectedStatuses.length < STATUS_OPTIONS.length && (
                            <button
                              type="button"
                              onClick={() => setSelectedStatuses(STATUS_OPTIONS.map(s => s.id))}
                              className="block mx-auto mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer"
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
                                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 shrink-0">
                                      {app.gender}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                  <span className="truncate max-w-[180px]">{app.email || '—'}</span>
                                  {app.phone && <span>• {app.phone}</span>}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Unit & Rent */}
                          <td className="px-4 py-4">
                            <div className="inline-block bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-md border border-slate-200 mb-1">
                              Unit {app.unit}
                            </div>
                            <div className="text-xs font-bold text-indigo-600">{app.rent}</div>
                          </td>

                          {/* Tenancy Terms */}
                          <td className="px-4 py-4 text-xs text-slate-600">
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
                          <td className="px-4 py-4 text-xs">
                            <span className={`font-semibold ${
                              getMoveInDisplay(app) === 'Any time' ? 'text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md' : 'text-slate-700'
                            }`}>
                              {getMoveInDisplay(app)}
                            </span>
                          </td>

                          {/* Applied On */}
                          <td className="px-4 py-4 text-xs text-slate-500">
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
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-xs transition-all border border-indigo-200 hover:border-indigo-600 cursor-pointer shadow-xs"
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
                    <div className="text-center py-12 px-4 text-slate-500 text-sm">
                      <FontAwesomeIcon icon={faSearch} className="text-slate-300 text-2xl mb-2 block mx-auto" />
                      No applications found matching your criteria.
                      {selectedStatuses.length < STATUS_OPTIONS.length && (
                        <button
                          type="button"
                          onClick={() => setSelectedStatuses(STATUS_OPTIONS.map(s => s.id))}
                          className="block mx-auto mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer"
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
                              <div className="text-xs text-slate-500 truncate">{app.email || '—'}</div>
                            </div>
                          </div>
                          <div className="shrink-0">{renderStatusBadge(app.status)}</div>
                        </div>
                        <dl className="space-y-1.5 text-sm m-0">
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
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-sm transition-all border border-indigo-200 hover:border-indigo-600 cursor-pointer"
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
            {!loading && viewMode === 'kanban' && (
              selectedStatuses.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm bg-white border border-slate-200 rounded-2xl shadow-sm">
                  <FontAwesomeIcon icon={faFilter} className="text-slate-300 text-2xl mb-2 block mx-auto" />
                  No status columns selected. Please check one or more filters above.
                  <button
                    type="button"
                    onClick={() => setSelectedStatuses(STATUS_OPTIONS.map(s => s.id))}
                    className="block mx-auto mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer"
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
                              className="font-bold text-slate-700 m-0 text-xs uppercase tracking-wide leading-tight truncate" 
                              title={cat.label}
                            >
                              {cat.label}
                            </h3>
                          </div>
                          <span className={`font-bold px-2 py-0.5 rounded-full text-xs shrink-0 ${cat.countBadge}`}>
                            {colApps.length}
                          </span>
                        </div>

                        {/* Column body: cards and empty placeholders have matching min-h-[148px] */}
                        <div className="stagger-children space-y-3">
                          {colApps.length === 0 ? (
                            <div className="min-h-[148px] flex flex-col items-center justify-center p-4 border border-dashed border-slate-300 rounded-xl text-slate-500 text-xs font-medium text-center bg-slate-50/50">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 modal-overlay-anim" onClick={() => setShowProfileModal(false)}>
          <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            
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
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20 shadow-md bg-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-bold shadow-inner border border-white/20 shrink-0">
                    {getInitials(selectedApp.name)}
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold m-0 leading-tight flex items-center gap-2">
                    {selectedApp.name}
                    {selectedApp.suffix && <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">{selectedApp.suffix}</span>}
                  </h3>
                  <div className="flex items-center gap-3 text-xs mt-1 opacity-90">
                    <span>Applied on {new Date(selectedApp.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="font-semibold px-2 py-0.5 bg-white/20 rounded-md">Requested Unit {selectedApp.unit}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="text-white hover:bg-white/20 p-2 rounded-xl border-0 bg-transparent cursor-pointer transition-colors">
                <FontAwesomeIcon icon={faTimes} className="text-xl" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50 space-y-6 sm:space-y-8">
              
              {['Rejected', 'Declined', 'Cancelled'].includes(selectedApp.status) && selectedApp.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2.5 text-red-800">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <span className="font-bold text-xs uppercase tracking-wider block">{selectedApp.status === 'Cancelled' ? 'Cancellation Reason' : 'Rejection Reason'}</span>
                    <p className="text-sm m-0 mt-1 font-medium">{selectedApp.rejection_reason}</p>
                    {selectedApp.rejection_attachment_path && (
                      <div className="mt-3 pt-3 border-t border-red-200/60">
                        <span className="text-[11px] font-bold uppercase tracking-wider block text-red-700 mb-1.5 flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faPaperclip} className="text-xs" /> Attached Supporting Document / Image:
                        </span>
                        {selectedApp.rejection_attachment_path.toLowerCase().endsWith('.pdf') ? (
                          <button
                            type="button"
                            onClick={(e) => openPreview(e, selectedApp.rejection_attachment_path, 'Rejection Document')}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-700 hover:bg-red-100/50 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs"
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
                              className="max-h-36 max-w-full rounded-lg border border-red-200 object-cover shadow-xs group-hover:opacity-90 transition-opacity bg-white" 
                            />
                            <span className="absolute bottom-1 right-1 bg-slate-900/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">Click to enlarge</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="stagger-children grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card-interactive bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faUsers} className="mr-1"/> Occupants</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.occupants} Person(s)</p>
                </div>
                <div className="card-interactive bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faCalendarAlt} className="mr-1"/> Rent Term</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.months_of_rent} Months</p>
                </div>
                <div className="card-interactive bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faCalendarAlt} className="mr-1"/> Move In By</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">
                    {getMoveInDisplay(selectedApp)}
                  </p>
                </div>
                <div className="card-interactive bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faHome} className="mr-1"/> Monthly Rent</p>
                  <p className="text-sm font-bold text-indigo-600 m-0">{selectedApp.rent}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faEnvelope} className="mr-1"/> Email Address</p>
                  <p className="text-sm font-semibold text-slate-800 m-0 truncate" title={selectedApp.email}>{selectedApp.email || '—'}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faPhone} className="mr-1"/> Contact Number</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.phone || '—'}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faVenusMars} className="mr-1"/> Gender</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.gender || 'Not Specified'}</p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faHome} className="mr-1"/> Previous Address</p>
                <p className="text-sm font-semibold text-slate-800 m-0 wrap-break-word">{selectedApp.previous_address || '—'}</p>
              </div>

              {/* Verification Documents */}
              <div>
                 <h4 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wide border-b border-slate-200 pb-2">Submitted Documents</h4>
                 {/* Uploaded files, then each active required requirement with no file (Settings → Application Requirements). */}
                 {selectedApp.documents_verified_at && !(selectedApp.documents || []).length && (
                   <p className="m-0 mb-3 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">Documents verified in person by the office on {String(selectedApp.documents_verified_at).slice(0, 10)}.</p>
                 )}
                 {!(selectedApp.documents || []).length && !(selectedApp.missing_documents || []).length && !selectedApp.documents_verified_at ? (
                   <p className="m-0 text-sm text-slate-500">No documents on file.</p>
                 ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   {(selectedApp.documents || []).map((doc) => (
                     <button key={doc.id} type="button" onClick={(e) => openPreview(e, doc.file_path, doc.label)}
                        className="flex flex-col items-center justify-center gap-2 text-sm p-4 rounded-xl border-2 cursor-pointer transition-all border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md text-slate-700">
                       <FontAwesomeIcon icon={faFileAlt} className="text-2xl text-indigo-500" />
                       <span className="font-semibold text-center mt-1">{doc.label}</span>
                     </button>
                   ))}
                   {!selectedApp.documents_verified_at && (selectedApp.missing_documents || []).map((label) => (
                     <div key={`missing-${label}`}
                        className="flex flex-col items-center justify-center gap-2 text-sm p-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-500">
                       <FontAwesomeIcon icon={faFileAlt} className="text-2xl text-slate-300" />
                       <span className="font-semibold text-center mt-1">{label}</span>
                       <span className="text-[10px] uppercase">Missing</span>
                     </div>
                   ))}
                 </div>
                 )}
              </div>

              {/* Actions */}
              {(selectedApp.status === 'Pending Review' || selectedApp.status === 'Pending Deposit') && (
                <div className="flex gap-4 mt-8 pt-6 border-t border-slate-200">
                    <button 
                      type="button"
                      disabled={isApproving}
                      onClick={() => setApproveTarget(selectedApp)} 
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white p-4 rounded-xl border-0 cursor-pointer text-sm font-bold hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                      <FontAwesomeIcon icon={faCheckCircle} className="text-lg" /> APPROVE
                    </button>
                    <button 
                      type="button"
                      disabled={isApproving}
                      onClick={() => setRejectTarget(selectedApp)}
                    className="flex-1 flex items-center justify-center gap-2 bg-white text-red-600 border-2 border-red-200 p-4 rounded-xl cursor-pointer text-sm font-bold hover:bg-red-50 hover:border-red-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <FontAwesomeIcon icon={faTimes} className="text-lg" /> REJECT
                  </button>
                </div>
              )}

              {selectedApp.status === 'Approved' && (
                <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
                  {!selectedApp.initial_payment_paid ? (
                    <p className="m-0 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">Awaiting confirmed initial payment. The applicant can still cancel before moving in.</p>
                  ) : !selectedApp.move_in_date ? (
                    <button onClick={() => setScheduleTarget(selectedApp)} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white p-4 rounded-xl border-0 cursor-pointer text-sm font-bold hover:bg-indigo-700 transition-colors">
                      <FontAwesomeIcon icon={faCalendarAlt} /> Send move-in date
                    </button>
                  ) : (
                    <div className="flex gap-3">
                      <div className="flex-1 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">Move-in date sent: <strong>{new Date(selectedApp.move_in_date).toLocaleDateString()}</strong></div>
                      <button onClick={() => confirmMoveIn(selectedApp)} className="rounded-xl bg-teal-600 px-4 text-sm font-bold text-white border-0 cursor-pointer hover:bg-teal-700">Confirm moved in</button>
                    </div>
                  )}
                  <button onClick={() => setRejectTarget(selectedApp)} className="w-full bg-white text-rose-600 border border-rose-200 p-3 rounded-xl cursor-pointer text-xs font-bold hover:bg-rose-50">Revoke approval / reject</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <ReasonModal
          title={rejectTarget.status === 'Approved' ? "Revoke Approval & Reject Application" : "Reject Application"}
          description={`${rejectTarget.name || 'The applicant'} is notified with this reason.${rejectTarget.status === 'Approved' ? ' Any payment already made is sent to Refunds as a refund request.' : ''}`}
          label="Reason for rejecting this application"
          confirmLabel={rejectTarget.status === 'Approved' ? "Revoke & Reject" : "Reject Application"}
          suggestions={['Incomplete or unverifiable documents', 'Unit is no longer available', 'Does not meet tenancy requirements', 'Change of mind', 'Other']}
          allowAttachment={true}
          attachmentLabel="Attach Supporting Document / Image (optional)"
          onConfirm={confirmReject}
          onClose={() => setRejectTarget(null)}
        />
      )}
      
      {approveTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !isApproving && setApproveTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="m-0 text-lg font-bold text-slate-800">Approve this application?</h3>
            <p className="mt-2 text-sm text-slate-500">This reserves Unit {approveTarget.unit} for {approveTarget.name} and creates their initial payment request. It does not mark them as moved in.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button 
                type="button"
                disabled={isApproving}
                onClick={() => setApproveTarget(null)} 
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={isApproving}
                onClick={confirmApprove} 
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white cursor-pointer transition-all flex items-center gap-2 shadow-sm"
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
          </div>
        </div>
      )}

      {scheduleTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !scheduling && setScheduleTarget(null)}>
          <form onSubmit={scheduleMoveIn} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div><h3 className="m-0 text-lg font-bold text-slate-800">Send move-in date</h3><p className="mt-1 text-sm text-slate-500">Payment is confirmed. Tell {scheduleTarget.name} when they can move in.</p></div>
            <label className="block text-sm font-semibold text-slate-700">Move-in date<input required type="date" min={new Date().toISOString().slice(0, 10)} value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
            <label className="block text-sm font-semibold text-slate-700">Message (optional)<textarea value={scheduleMessage} onChange={e => setScheduleMessage(e.target.value)} rows="3" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Arrival instructions, office hours, etc." /></label>
            <label className="block text-sm font-semibold text-slate-700">Attachment (optional)<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setScheduleAttachment(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs" /></label>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setScheduleTarget(null)} disabled={scheduling} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={scheduling} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{scheduling ? 'Sending…' : 'Send notice'}</button></div>
          </form>
        </div>
      )}


      {preview && (
        <div onClick={() => setPreview(null)} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 m-0">{preview.title}</h3>
              <button onClick={() => setPreview(null)} className="text-slate-500 hover:text-slate-600 bg-white hover:bg-slate-100 rounded-lg p-2 transition-colors border border-slate-200 cursor-pointer flex items-center justify-center">
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-900/5 p-4 flex items-center justify-center min-h-[50vh]">
              {preview.isImage ? (
                <img src={preview.url} alt="Preview" className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm" />
              ) : (
                <iframe src={preview.url} className="w-full h-[75vh] rounded-lg shadow-sm border-0 bg-white" title="Document Preview" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminApplications;
