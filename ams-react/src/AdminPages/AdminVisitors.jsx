import React, { useState, useEffect } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faIdBadge, faUserPlus, faCheck, faTimes, faSignOutAlt, 
  faExclamationTriangle, faClock, faSearch, faFilter, faCar, 
  faBuilding, faSync, faSlidersH, faPhone, faUserCheck, faUserClock,
  faDoorOpen, faInfoCircle, faEye
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import '../assets/styles/responsive/admin/admin-visitors.responsive.css';

export default function AdminVisitors() {
  const [visitors, setVisitors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [stats, setStats] = useState({
    active_count: 0,
    pending_count: 0,
    today_count: 0,
    overstay_count: 0,
    total_count: 0,
    overstay_threshold_hours: 24
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [selectedVisitorForCheckout, setSelectedVisitorForCheckout] = useState(null);

  // Form States
  const [checkInForm, setCheckInForm] = useState({
    visitorName: '',
    contactNumber: '',
    unit: '',
    purpose: 'Personal Visit',
    idType: 'National ID',
    idNumber: '',
    vehiclePlate: '',
    idPhoto: null
  });

  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [thresholdHours, setThresholdHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchVisitors();
    fetchRooms();
  }, [statusFilter, unitFilter]);

  const fetchVisitors = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `get_visitors.php?status=${statusFilter}&unit=${unitFilter}`;
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const res = await api.get(url);
      if (res.data.success) {
        setVisitors(res.data.visitors || []);
        if (res.data.stats) {
          setStats(res.data.stats);
          setThresholdHours(res.data.stats.overstay_threshold_hours || 24);
        }
      } else {
        setError(res.data.message || 'Failed to fetch visitor records.');
      }
    } catch (err) {
      console.error('Failed to load visitor data:', err);
      setError('Unable to load visitor logs. Please check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await api.get('get_rooms.php');
      if (res.data.success && res.data.rooms) {
        setRooms(res.data.rooms);
      }
    } catch (err) {
      console.error('Failed to fetch rooms list:', err);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchVisitors();
  };

  // Check In / New Visitor Action
  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    if (!checkInForm.visitorName || !checkInForm.contactNumber || !checkInForm.unit) {
      alert('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      let payload;
      let headers = {};

      if (checkInForm.idPhoto) {
        payload = new FormData();
        payload.append('visitorName', checkInForm.visitorName);
        payload.append('contactNumber', checkInForm.contactNumber);
        payload.append('unit', checkInForm.unit);
        payload.append('purpose', checkInForm.purpose);
        payload.append('idType', checkInForm.idType);
        payload.append('idNumber', checkInForm.idNumber);
        payload.append('vehiclePlate', checkInForm.vehiclePlate);
        payload.append('idPhoto', checkInForm.idPhoto);
        headers = { 'Content-Type': 'multipart/form-data' };
      } else {
        payload = checkInForm;
      }

      const res = await api.post('check_in_visitor.php', payload, { headers });
      if (res.data.success) {
        setShowCheckInModal(false);
        setCheckInForm({
          visitorName: '',
          contactNumber: '',
          unit: '',
          purpose: 'Personal Visit',
          idType: 'National ID',
          idNumber: '',
          vehiclePlate: '',
          idPhoto: null
        });
        fetchVisitors();
      } else {
        alert(res.data.message || 'Failed to log visitor.');
      }
    } catch (err) {
      console.error('Failed to check in visitor:', err);
      alert('Server error occurred during visitor check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  // Approve / Deny Action
  const handleReviewAction = async (id, action) => {
    const note = action === 'denied' ? prompt('Enter reason for declining entry (optional):') : '';
    if (action === 'denied' && note === null) return; // User cancelled prompt

    try {
      const res = await api.post('update_visitor_status.php', {
        id,
        action,
        adminNotes: note || ''
      });
      if (res.data.success) {
        fetchVisitors();
      } else {
        alert(res.data.message || 'Action failed.');
      }
    } catch (err) {
      console.error('Failed to update visitor status:', err);
      alert('Server error updating visitor status.');
    }
  };

  // Check Out Action
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!selectedVisitorForCheckout) return;
    setSubmitting(true);
    try {
      const res = await api.post('update_visitor_status.php', {
        id: selectedVisitorForCheckout.id,
        action: 'checked_out',
        checkoutNotes
      });
      if (res.data.success) {
        setShowCheckoutModal(false);
        setSelectedVisitorForCheckout(null);
        setCheckoutNotes('');
        fetchVisitors();
      } else {
        alert(res.data.message || 'Failed to checkout visitor.');
      }
    } catch (err) {
      console.error('Failed to checkout visitor:', err);
      alert('Server error during visitor checkout.');
    } finally {
      setSubmitting(false);
    }
  };

  // Update Overstay Threshold
  const handleSaveThreshold = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('update_system_settings.php', {
        visitor_overstay_hours: String(thresholdHours)
      });
      if (res.data.success) {
        setShowThresholdModal(false);
        fetchVisitors();
      } else {
        alert('Failed to save threshold setting.');
      }
    } catch (err) {
      console.error('Failed to update overstay threshold:', err);
      alert('Error updating system setting.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusPills = [
    { key: 'all', label: 'All Records', count: stats.total_count },
    { key: 'pending_approval', label: 'Pending Review', count: stats.pending_count, color: 'text-amber-600 bg-amber-50' },
    { key: 'checked_in', label: 'Checked In', count: stats.active_count, color: 'text-emerald-600 bg-emerald-50' },
    { key: 'overstayed', label: 'Overstayed', count: stats.overstay_count, color: 'text-rose-600 bg-rose-50' },
    { key: 'checked_out', label: 'Checked Out' },
    { key: 'denied', label: 'Denied' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-white text-left font-sans">
        <Header title="Visitor Management" />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* Top KPI Metrics Banner */}
            <div className="admin-visitors-metrics-grid grid grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Checked In */}
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Currently On-Premise</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <FontAwesomeIcon icon={faDoorOpen} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-emerald-950 m-0">{stats.active_count}</p>
                <p className="mt-1 text-xs text-emerald-600 font-medium m-0">Active visitor passes</p>
              </div>

              {/* Pending Review */}
              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Review</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <FontAwesomeIcon icon={faUserClock} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-amber-950 m-0">{stats.pending_count}</p>
                <p className="mt-1 text-xs text-amber-600 font-medium m-0">Tenant registered visitors</p>
              </div>

              {/* Today's Check-ins */}
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Today's Check-Ins</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <FontAwesomeIcon icon={faUserCheck} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-indigo-950 m-0">{stats.today_count}</p>
                <p className="mt-1 text-xs text-indigo-600 font-medium m-0">Logged visits today</p>
              </div>

              {/* Overstay Alerts */}
              <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Overstay Alerts</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                  </div>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <p className="text-3xl font-extrabold text-rose-950 m-0">{stats.overstay_count}</p>
                  <button 
                    type="button" 
                    onClick={() => setShowThresholdModal(true)}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline bg-transparent border-0 cursor-pointer p-0 flex items-center gap-1"
                  >
                    <FontAwesomeIcon icon={faSlidersH} className="text-[10px]" />
                    <span>&gt; {stats.overstay_threshold_hours >= 24 ? `${Math.round(stats.overstay_threshold_hours / 24)}d (${stats.overstay_threshold_hours}h)` : `${stats.overstay_threshold_hours}h`}</span>
                  </button>
                </div>
                <p className="mt-1 text-xs text-rose-600 font-medium m-0">Exceeding configured threshold</p>
              </div>

            </div>

            {/* Action & Filter Control Bar */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
              
              <div className="admin-visitors-filter-bar flex flex-col md:flex-row items-center justify-between gap-4">
                
                {/* Search Bar */}
                <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
                  <div className="relative flex-1">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                    <input
                      type="text"
                      placeholder="Search visitor name, phone, unit, plate number..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="admin-visitors-search-input w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-slate-700 border-0 cursor-pointer"
                  >
                    Search
                  </button>
                </form>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                  
                  {/* Unit Select Filter */}
                  <select
                    value={unitFilter}
                    onChange={(e) => setUnitFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Units</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>Unit {r.id}</option>
                    ))}
                  </select>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={fetchVisitors}
                    title="Refresh data"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>

                  {/* Log New Visitor Button */}
                  <button
                    type="button"
                    onClick={() => setShowCheckInModal(true)}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-md hover:shadow-indigo-200 active:scale-[0.98] border-0 cursor-pointer shrink-0"
                  >
                    <FontAwesomeIcon icon={faUserPlus} />
                    <span>Log Visitor</span>
                  </button>

                </div>

              </div>

              {/* Status Filter Pills */}
              <div className="admin-visitors-pill-group flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-100">
                {statusPills.map(pill => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setStatusFilter(pill.key)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all border-0 cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      statusFilter === pill.key
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{pill.label}</span>
                    {pill.count !== undefined && pill.count > 0 && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${statusFilter === pill.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                        {pill.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

            </div>

            {/* Visitor Records Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="admin-visitors-table-container overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Visitor &amp; Contact</th>
                      <th className="px-4 py-3.5">Target Unit / Host</th>
                      <th className="px-4 py-3.5">Purpose &amp; Vehicle</th>
                      <th className="px-4 py-3.5">Check-In Time</th>
                      <th className="px-4 py-3.5">Duration</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center text-slate-400 font-medium">
                          Loading visitor records...
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center text-rose-500 font-medium">
                          {error}
                        </td>
                      </tr>
                    ) : visitors.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-slate-400">
                            <FontAwesomeIcon icon={faIdBadge} className="text-xl text-slate-300 shrink-0" />
                            <span className="text-sm italic">No visitor records found matching current filters.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      visitors.map((v) => {
                        const isPending = v.status === 'pending_approval';
                        const isActive = v.status === 'checked_in';
                        const isOverstay = v.status === 'overstayed';
                        const isCompleted = v.status === 'checked_out';
                        const isDenied = v.status === 'denied';

                        return (
                          <tr key={v.id} className="transition-colors hover:bg-slate-50/80">
                            
                            {/* Visitor Info */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-700 text-xs shrink-0">
                                  {v.visitorName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800 m-0 leading-snug">{v.visitorName}</p>
                                  <p className="text-xs text-slate-500 m-0 mt-0.5 flex flex-wrap items-center gap-1.5">
                                    <FontAwesomeIcon icon={faPhone} className="text-[10px] text-slate-400" />
                                    <span>{v.contactNumber}</span>
                                    {v.idNumber && (
                                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                        {v.idType}: {v.idNumber}
                                      </span>
                                    )}
                                    {v.idPhotoPath && (
                                      <a
                                        href={`http://localhost:8080/ApartmentManagementSystem_React/backend/${v.idPhotoPath}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline inline-flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded"
                                      >
                                        <FontAwesomeIcon icon={faEye} className="text-[9px]" />
                                        <span>View ID</span>
                                      </a>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Unit & Host */}
                            <td className="px-4 py-4">
                              <span className="inline-flex items-center gap-1 font-bold text-slate-800 text-xs bg-slate-100 px-2 py-0.5 rounded-md">
                                <FontAwesomeIcon icon={faBuilding} className="text-indigo-500 text-[10px]" />
                                Unit {v.unit}
                              </span>
                              <p className="text-xs text-slate-500 m-0 mt-1 truncate max-w-[140px]" title={v.hostName}>
                                Host: {v.hostName}
                              </p>
                            </td>

                            {/* Purpose & Vehicle */}
                            <td className="px-4 py-4">
                              <p className="text-xs font-semibold text-slate-700 m-0">{v.purpose}</p>
                              {v.vehiclePlate ? (
                                <p className="text-[11px] text-slate-500 m-0 mt-0.5 flex items-center gap-1">
                                  <FontAwesomeIcon icon={faCar} className="text-[10px] text-slate-400" />
                                  <span className="font-mono uppercase font-bold text-indigo-600">{v.vehiclePlate}</span>
                                </p>
                              ) : (
                                <span className="text-[10px] text-slate-400">Pedestrian / Drop-off</span>
                              )}
                            </td>

                            {/* Check-In Time */}
                            <td className="px-4 py-4 text-xs text-slate-600">
                              <p className="m-0 font-medium">
                                {new Date(v.checkInAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                                {new Date(v.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </td>

                            {/* Duration */}
                            <td className="px-4 py-4 text-xs">
                              {isPending ? (
                                <span className="text-slate-400 italic text-[11px]">Awaiting entry</span>
                              ) : (
                                <span className={`font-mono font-bold text-xs ${isOverstay ? 'text-rose-600' : 'text-slate-700'}`}>
                                  {v.duration}
                                </span>
                              )}
                            </td>

                            {/* Status Badge */}
                            <td className="px-4 py-4 text-center">
                              {isPending && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                                  <FontAwesomeIcon icon={faClock} className="text-[9px]" />
                                  Review
                                </span>
                              )}
                              {isActive && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  Checked In
                                </span>
                              )}
                              {isOverstay && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-[9px]" />
                                  Overstayed
                                </span>
                              )}
                              {isCompleted && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                  Checked Out
                                </span>
                              )}
                              {isDenied && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700" title={v.adminNotes || 'Entry Denied'}>
                                  Denied
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-5 py-4 text-right">
                              {isPending && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleReviewAction(v.id, 'checked_in')}
                                    className="admin-visitors-action-btn rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer"
                                    title="Approve Entry"
                                  >
                                    <FontAwesomeIcon icon={faCheck} className="mr-1" /> Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReviewAction(v.id, 'denied')}
                                    className="admin-visitors-action-btn rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors border-0 cursor-pointer"
                                    title="Deny Entry"
                                  >
                                    <FontAwesomeIcon icon={faTimes} />
                                  </button>
                                </div>
                              )}

                              {(isActive || isOverstay) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVisitorForCheckout(v);
                                    setShowCheckoutModal(true);
                                  }}
                                  className="admin-visitors-action-btn inline-flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors border-0 cursor-pointer"
                                  title="Check Out Visitor"
                                >
                                  <FontAwesomeIcon icon={faSignOutAlt} className="text-slate-500" />
                                  <span>Check Out</span>
                                </button>
                              )}

                              {(isCompleted || isDenied) && (
                                <span className="text-xs font-medium italic text-slate-400">
                                  {v.checkOutAt ? `Departed ${new Date(v.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Archived'}
                                </span>
                              )}
                            </td>

                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* Check-In / Register Visitor Modal */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowCheckInModal(false)}>
          <div className="admin-visitors-modal w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 text-base">
                  <FontAwesomeIcon icon={faUserPlus} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 m-0">Log Visitor Check-In</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckInModal(false)}
                className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 text-lg"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <form onSubmit={handleCheckInSubmit} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Visitor Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maria Santos"
                  value={checkInForm.visitorName}
                  onChange={(e) => setCheckInForm({ ...checkInForm, visitorName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contact Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 0917 123 4567"
                    value={checkInForm.contactNumber}
                    onChange={(e) => setCheckInForm({ ...checkInForm, contactNumber: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Unit *</label>
                  <select
                    required
                    value={checkInForm.unit}
                    onChange={(e) => setCheckInForm({ ...checkInForm, unit: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
                  >
                    <option value="">Select Target Unit</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>
                        Unit {r.id} {r.tenant_name ? `(${r.tenant_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Purpose of Visit *</label>
                <select
                  value={checkInForm.purpose}
                  onChange={(e) => setCheckInForm({ ...checkInForm, purpose: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
                >
                  <option value="Personal Visit">Personal Visit / Family</option>
                  <option value="Delivery / Courier">Delivery / Courier</option>
                  <option value="Maintenance / Contractor">Maintenance / Contractor / Repair</option>
                  <option value="Official / Business">Official / Business</option>
                  <option value="Short Stay Guest">Short Stay Guest</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gov ID Type</label>
                  <select
                    value={checkInForm.idType}
                    onChange={(e) => setCheckInForm({ ...checkInForm, idType: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
                  >
                    <option value="National ID">Philippine National ID</option>
                    <option value="Driver's License">Driver's License</option>
                    <option value="Passport">Passport</option>
                    <option value="UMID / SSS">UMID / SSS</option>
                    <option value="Company / Student ID">Company / Student ID</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ID Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. N02-18-9382"
                    value={checkInForm.idNumber}
                    onChange={(e) => setCheckInForm({ ...checkInForm, idNumber: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Plate (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. ABC 1234"
                    value={checkInForm.vehiclePlate}
                    onChange={(e) => setCheckInForm({ ...checkInForm, vehiclePlate: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gov ID / Pass Photo (Optional)</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setCheckInForm({ ...checkInForm, idPhoto: e.target.files[0] || null })}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCheckInModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors border-solid cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-bold text-white transition-colors border-0 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Checking In...' : 'Log & Check In'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Check Out Modal */}
      {showCheckoutModal && selectedVisitorForCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowCheckoutModal(false)}>
          <div className="admin-visitors-modal w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-lg font-bold text-slate-800 m-0">Confirm Visitor Checkout</h3>
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 mb-4 space-y-1.5 text-xs text-slate-600">
              <p className="m-0"><strong className="text-slate-800">Visitor:</strong> {selectedVisitorForCheckout.visitorName}</p>
              <p className="m-0"><strong className="text-slate-800">Visiting Unit:</strong> Unit {selectedVisitorForCheckout.unit} ({selectedVisitorForCheckout.hostName})</p>
              <p className="m-0"><strong className="text-slate-800">Checked In At:</strong> {new Date(selectedVisitorForCheckout.checkInAt).toLocaleString()}</p>
              <p className="m-0"><strong className="text-slate-800">Elapsed Duration:</strong> <span className="font-bold text-indigo-600">{selectedVisitorForCheckout.duration}</span></p>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Checkout Notes (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Left premises peacefully, returned guest ID pass..."
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors border-solid cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-slate-900 hover:bg-black py-2.5 text-sm font-bold text-white transition-colors border-0 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Complete Checkout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configurable Overstay Threshold Modal */}
      {showThresholdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowThresholdModal(false)}>
          <div className="admin-visitors-modal w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faSlidersH} className="text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-800 m-0">Set Overstay Threshold</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowThresholdModal(false)}
                className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Configure after how many hours/days an active visitor is flagged with an <strong>Overstay Alert</strong>. Configurable from 1 hour up to 7 days (168 hours).
            </p>

            <form onSubmit={handleSaveThreshold} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Overstay Limit Preset</label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { h: 6, label: '6 Hours' },
                    { h: 12, label: '12 Hours' },
                    { h: 24, label: '1 Day (24h)' },
                    { h: 48, label: '2 Days (48h)' },
                    { h: 72, label: '3 Days (72h)' },
                    { h: 168, label: '1 Week (168h)' },
                  ].map(preset => (
                    <button
                      key={preset.h}
                      type="button"
                      onClick={() => setThresholdHours(preset.h)}
                      className={`rounded-xl py-2 px-1 text-xs font-bold transition-all border cursor-pointer ${
                        Number(thresholdHours) === preset.h
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <label className="block text-xs font-bold text-slate-700 mb-1">Custom Hours (1 to 168 hours)</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  required
                  value={thresholdHours}
                  onChange={(e) => setThresholdHours(Math.min(168, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowThresholdModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors border-solid cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-bold text-white transition-colors border-0 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Setting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
