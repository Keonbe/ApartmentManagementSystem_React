import { useState, useEffect } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faIdBadge, faUserPlus, faCheck, faTimes, faSignOutAlt, 
  faExclamationTriangle, faClock, faSearch, faCar,
  faBuilding, faSync, faSlidersH, faPhone, faUserCheck, faUserClock,
  faDoorOpen, faEye
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, addDays, checkDate, checkIntRange, checkPersonName, checkPhMobile, checkText, localDateString, localTimeString, toPhE164 } from '../utils/validation';
import PhoneInput from '../Components/PhoneInput';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import FileChip from '../Components/form/FileChip';
import ReasonModal from '../Components/form/ReasonModal';
import { blockNonIntegerKeys, invalidCls } from '../Components/form/formHelpers';

const PURPOSES = ['Personal Visit', 'Delivery / Courier', 'Maintenance / Contractor', 'Official / Business', 'Short Stay Guest'];
const ID_TYPES = ['National ID', "Driver's License", 'Passport', 'UMID / SSS', 'Company / Student ID'];
const PLATE_PATTERN = /^[A-Z0-9][A-Z0-9 -]*$/;
// update_system_settings.php: 1 to 168 hours.
const MAX_OVERSTAY_HOURS = 168;
// The desk may back-date a visit by up to a day; the expected check-out may be
// up to 30 days out (check_in_visitor.php).
const visitBounds = () => ({ min: addDays(-1), max: localDateString(), outMax: addDays(30) });
const DAY_MS = 24 * 60 * 60 * 1000;
const fmtShort = (d) => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// Preset reasons for declining a pre-registered visitor (ReasonModal adds "Other…").
const DENY_REASON_OPTIONS = [
  'No valid ID presented',
  'Host tenant unavailable / not home',
  'Visitor not expected by tenant',
  'Details do not match registration',
  'Security concern',
];
import { fileUrl } from '../api/fileUrl';
import '../assets/styles/responsive/admin/admin-visitors.responsive.css';

// Preset checkout notes; "Other" lets the desk type a short one instead. The
// chosen text is stored as-is in visitor_logs.checkout_notes.
const CHECKOUT_NOTE_OPTIONS = [
  'Left normally',
  'Returned visitor pass / ID',
  'Left together with the tenant',
  'Overstayed – reminded before leaving',
  'Escorted out by security',
];
const CHECKOUT_NOTE_OTHER = '__other__';

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
  const [loadedFilters, setLoadedFilters] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState(null); // { filters, message }

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [selectedVisitorForCheckout, setSelectedVisitorForCheckout] = useState(null);

  // Form States. The visit date/time default to "now" each time the form opens;
  // the desk can back-date it (up to 24 h) for a visitor logged late.
  const emptyCheckInForm = () => ({
    visitorName: '',
    contactNumber: '',
    unit: '',
    purpose: 'Personal Visit',
    idType: 'National ID',
    idNumber: '',
    vehiclePlate: '',
    visitDate: localDateString(),
    visitTime: localTimeString(),
    checkOutDate: localDateString(),
    checkOutTime: '',
    idPhoto: null
  });
  const [checkInForm, setCheckInForm] = useState(emptyCheckInForm);
  const [visitDateBounds, setVisitDateBounds] = useState({ min: '', max: '', outMax: '' });

  const openCheckInModal = () => {
    setCheckInForm(emptyCheckInForm());
    setVisitDateBounds(visitBounds());
    checkIn.setErrors({});
    setShowCheckInModal(true);
  };

  const [checkoutNote, setCheckoutNote] = useState(CHECKOUT_NOTE_OPTIONS[0]);
  const [checkoutOther, setCheckoutOther] = useState('');
  const [thresholdHours, setThresholdHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [denyTarget, setDenyTarget] = useState(null); // visitor id while a decline reason is entered

  // Keys match check_in_visitor.php (visitDate/visitTime make up visitAt,
  // checkOutDate/checkOutTime make up expectedCheckOutAt).
  const checkIn = useFieldErrors({
    visitorName: (v) => checkPersonName(v, { label: 'Visitor name', max: LIMITS.fullName }),
    contactNumber: (v) => checkPhMobile(v),
    unit: (v) => (rooms.some(r => String(r.id) === String(v)) ? '' : 'Select the unit being visited.'),
    visitDate: (v) => checkDate(v, { min: visitDateBounds.min, max: visitDateBounds.max, label: 'Check-in date' }),
    // check_in_visitor.php accepts a visit from 24 hours ago to 5 minutes ahead.
    visitTime: (v, all) => {
      if (!v) return 'Check-in time is required.';
      if (!all.visitDate) return '';
      const visitMs = new Date(`${all.visitDate}T${v}`).getTime();
      if (Number.isNaN(visitMs)) return 'Enter a valid check-in time.';
      if (visitMs > Date.now() + 5 * 60 * 1000) return 'Check-in time cannot be in the future.';
      if (visitMs < Date.now() - DAY_MS) return 'Check-in time can be back-dated by at most 24 hours.';
      return '';
    },
    checkOutDate: (v) => checkDate(v, { min: visitDateBounds.min, max: visitDateBounds.outMax, label: 'Expected check-out date' }),
    // After the check-in, within 30 days of it, and not already past.
    checkOutTime: (v, all) => {
      if (!v) return 'Expected check-out time is required.';
      if (!all.checkOutDate) return '';
      const outMs = new Date(`${all.checkOutDate}T${v}`).getTime();
      if (Number.isNaN(outMs)) return 'Enter a valid check-out time.';
      const visitMs = new Date(`${all.visitDate}T${all.visitTime}`).getTime();
      if (!Number.isNaN(visitMs)) {
        if (outMs <= visitMs) return 'Expected check-out must be after the check-in.';
        if (outMs > visitMs + 30 * DAY_MS) return 'Expected check-out must be within 30 days of check-in.';
      }
      if (outMs < Date.now() - 5 * 60 * 1000) return 'Expected check-out cannot be in the past.';
      return '';
    },
    purpose: (v) => (PURPOSES.includes(v) ? '' : 'Choose the purpose of the visit.'),
    idType: (v) => (ID_TYPES.includes(v) ? '' : 'Choose an ID type.'),
    idNumber: (v) => checkText(v, { label: 'ID number', min: 3, max: LIMITS.idNumber }),
    vehiclePlate: (v) => checkText(v, { label: 'Vehicle plate', max: LIMITS.visitorPlate, required: false })
      || (v && !PLATE_PATTERN.test(String(v).trim()) ? 'Plate can only contain letters, numbers, spaces and hyphens.' : ''),
    idPhoto: (f) => (f ? checkFile(f, FILE_RULES.visitorId) : ''),
    checkoutOther: (v) => checkText(v, { label: 'Checkout note', max: LIMITS.notes }),
    visitor_overstay_hours: (v) => checkIntRange(v === '' ? NaN : v, 1, MAX_OVERSTAY_HOURS, 'Overstay limit'),
  }, { idPrefix: 'checkin-' });
  const setCheckInField = (key, value) => {
    setCheckInForm(f => ({ ...f, [key]: value }));
    checkIn.clearError(key);
  };
  const blurCheckInField = (key) => {
    const raw = checkInForm[key];
    const v = typeof raw === 'string' && key !== 'contactNumber' ? raw.trim() : raw;
    if (v !== raw) setCheckInForm(f => ({ ...f, [key]: v }));
    if (v || key === 'contactNumber') checkIn.validateField(key, { ...checkInForm, [key]: v });
  };
  const clearIdPhoto = () => {
    setCheckInForm(f => ({ ...f, idPhoto: null }));
    setPhotoInputKey(k => k + 1);
    checkIn.clearError('idPhoto');
  };
  const CHECK_IN_FIELDS = ['visitorName', 'contactNumber', 'unit', 'visitDate', 'visitTime', 'checkOutDate', 'checkOutTime', 'purpose', 'idType', 'idNumber', 'vehiclePlate', 'idPhoto'];

  // Loading and error are derived from the filters they belong to, so a filter change
  // shows the spinner without setting state inside the effect.
  const filterKey = `${statusFilter}|${unitFilter}`;
  const loading = refreshing || loadedFilters !== filterKey;
  const error = failure && failure.filters === filterKey ? failure.message : null;

  const loadVisitors = async () => {
    try {
      let url = `get_visitors.php?status=${statusFilter}&unit=${unitFilter}`;
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const res = await api.get(url);
      if (res.data.success) {
        setVisitors(res.data.visitors || []);
        setFailure(null);
        if (res.data.stats) {
          setStats(res.data.stats);
          setThresholdHours(res.data.stats.overstay_threshold_hours || 24);
        }
      } else {
        setFailure({ filters: filterKey, message: res.data.message || 'Failed to fetch visitor records.' });
      }
    } catch (err) {
      console.error('Failed to load visitor data:', err);
      setFailure({ filters: filterKey, message: 'Unable to load visitor logs. Please check connection and try again.' });
    } finally {
      setLoadedFilters(filterKey);
      setRefreshing(false);
    }
  };

  const fetchVisitors = () => {
    setRefreshing(true);
    setFailure(null);
    return loadVisitors();
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

  useEffect(() => {
    const load = async () => { await Promise.all([loadVisitors(), fetchRooms()]); };
    load();
  }, [statusFilter, unitFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchVisitors();
  };

  // Check In / New Visitor Action
  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const clean = {
      ...checkInForm,
      visitorName: checkInForm.visitorName.trim(),
      idNumber: checkInForm.idNumber.trim(),
      vehiclePlate: checkInForm.vehiclePlate.trim().toUpperCase(),
    };
    setCheckInForm(clean);
    if (!checkIn.validateAll(clean, CHECK_IN_FIELDS)) return;
    const visitAt = `${clean.visitDate}T${clean.visitTime}`;
    setSubmitting(true);
    try {
      const fields = {
        visitorName: clean.visitorName,
        contactNumber: toPhE164(clean.contactNumber),
        unit: clean.unit,
        purpose: clean.purpose,
        idType: clean.idType,
        idNumber: clean.idNumber,
        vehiclePlate: clean.vehiclePlate,
        visitAt,
        expectedCheckOutAt: `${clean.checkOutDate}T${clean.checkOutTime}`,
      };
      let payload = fields;
      let headers = {};

      if (checkInForm.idPhoto) {
        payload = new FormData();
        Object.entries(fields).forEach(([key, value]) => payload.append(key, value));
        payload.append('idPhoto', checkInForm.idPhoto);
        headers = { 'Content-Type': 'multipart/form-data' };
      }

      const res = await api.post('check_in_visitor.php', payload, { headers });
      if (res.data.success) {
        setShowCheckInModal(false);
        setCheckInForm(emptyCheckInForm());
        fetchVisitors();
      } else if (!checkIn.applyServerErrors(res)) {
        alert(res.data.message || 'Failed to log visitor.');
      }
    } catch (err) {
      console.error('Failed to check in visitor:', err);
      if (!checkIn.applyServerErrors(err)) alert(apiErrorMessage(err, 'Server error occurred during visitor check-in.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Approve / Deny Action
  const handleReviewAction = async (id, action) => {
    if (action === 'denied') {
      setDenyTarget(id);
      return;
    }
    try {
      await sendReview(id, action, '');
    } catch (err) {
      alert(err.message);
    }
  };

  // Throws on failure so ReasonModal can show it.
  const sendReview = async (id, action, note) => {
    let res;
    try {
      res = await api.post('update_visitor_status.php', { id, action, adminNotes: note || '' });
    } catch (err) {
      console.error('Failed to update visitor status:', err);
      throw new Error(apiErrorMessage(err, 'Server error updating visitor status.'), { cause: err });
    }
    if (!res.data.success) throw new Error(res.data.message || 'Action failed.');
    fetchVisitors();
  };

  const confirmDeny = async (note) => {
    await sendReview(denyTarget, 'denied', note);
    setDenyTarget(null);
  };

  // Check Out Action
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!selectedVisitorForCheckout || submitting) return;
    const other = checkoutOther.trim();
    setCheckoutOther(other);
    if (checkoutNote === CHECKOUT_NOTE_OTHER && !checkIn.validateAll({ checkoutOther: other }, ['checkoutOther'])) return;
    const checkoutNotes = checkoutNote === CHECKOUT_NOTE_OTHER ? other : checkoutNote;
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
        setCheckoutNote(CHECKOUT_NOTE_OPTIONS[0]);
        setCheckoutOther('');
        fetchVisitors();
      } else if (!checkIn.applyServerErrors(res)) {
        alert(res.data.message || 'Failed to checkout visitor.');
      }
    } catch (err) {
      console.error('Failed to checkout visitor:', err);
      alert(apiErrorMessage(err, 'Server error during visitor checkout.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Update Overstay Threshold
  const handleSaveThreshold = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!checkIn.validateAll({ visitor_overstay_hours: thresholdHours }, ['visitor_overstay_hours'])) return;
    setSubmitting(true);
    try {
      const res = await api.post('update_system_settings.php', {
        visitor_overstay_hours: String(thresholdHours)
      });
      if (res.data.success) {
        setShowThresholdModal(false);
        fetchVisitors();
      } else if (!checkIn.applyServerErrors(res)) {
        alert(res.data.message || 'Failed to save threshold setting.');
      }
    } catch (err) {
      console.error('Failed to update overstay threshold:', err);
      alert(apiErrorMessage(err, 'Error updating system setting.'));
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
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-white text-left font-sans">
        <Header title="Visitor Management" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* Top KPI Metrics Banner */}
            <div className="admin-visitors-metrics-grid stagger-children grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {/* Checked In */}
              <div className="card-interactive rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
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
              <div className="card-interactive rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
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
              <div className="card-interactive rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
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
              <div className="card-interactive rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
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
                    className="btn-interactive text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline bg-transparent border-0 cursor-pointer p-0 flex items-center gap-1"
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
                    <input maxLength={LIMITS.search}
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
                    onClick={openCheckInModal}
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
                  <tbody className="stagger-children divide-y divide-slate-100">
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
                        const isCancelled = v.status === 'cancelled';

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
                                        href={fileUrl(v.idPhotoPath)}
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
                                {new Date(v.visitAt || v.checkInAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                                {new Date(v.visitAt || v.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {v.expectedCheckOutAt && (
                                <p className="text-[10px] text-slate-400 m-0 mt-0.5">Out by {fmtShort(v.expectedCheckOutAt)}</p>
                              )}
                            </td>

                            {/* Duration */}
                            <td className="px-4 py-4 text-xs">
                              {isPending ? (
                                <span className="text-slate-400 italic text-[11px]">
                                  {v.expectedAt
                                    ? `Expected ${new Date(v.expectedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                                    : 'Awaiting entry'}
                                </span>
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
                              {isCancelled && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500" title={v.adminNotes || 'Cancelled by tenant'}>
                                  Cancelled
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
                                    // Start clean: a dismissed dialog keeps its note otherwise.
                                    setCheckoutNote(CHECKOUT_NOTE_OPTIONS[0]);
                                    setCheckoutOther('');
                                    checkIn.clearError('checkoutOther');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay-anim" onClick={() => setShowCheckInModal(false)}>
          <div className="admin-visitors-modal modal-card-anim w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

            <form onSubmit={handleCheckInSubmit} className="space-y-4" noValidate>
              
              <div>
                <label htmlFor="checkin-visitorName" className="block text-xs font-bold text-slate-700 mb-1">Visitor Full Name *</label>
                <input
                  type="text"
                  {...checkIn.fieldA11y('visitorName')}
                    onChange={(e) => setCheckInField('visitorName', e.target.value)}
                    onBlur={() => blurCheckInField('visitorName')}
                  autoComplete="off"
                  required
                  placeholder="e.g. Maria Santos"
                  value={checkInForm.visitorName}
                  maxLength={LIMITS.fullName}
                  className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(checkIn.errors.visitorName)}
                />
                <FieldError id="checkin-visitorName" error={checkIn.errors.visitorName} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="checkin-contactNumber" className="block text-xs font-bold text-slate-700 mb-1">Contact Number *</label>
                  <PhoneInput
                    id="checkin-contactNumber"
                    name="contactNumber"
                    required
                    value={checkInForm.contactNumber}
                    onChange={(digits) => setCheckInField('contactNumber', digits)}
                    onBlur={() => blurCheckInField('contactNumber')}
                    error={checkIn.errors.contactNumber}
                  />
                </div>
                <div>
                  <label htmlFor="checkin-unit" className="block text-xs font-bold text-slate-700 mb-1">Target Unit *</label>
                  <select
                    required
                    {...checkIn.fieldA11y('unit')}
                    onChange={(e) => setCheckInField('unit', e.target.value)}
                    onBlur={() => blurCheckInField('unit')}
                    value={checkInForm.unit}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer" + invalidCls(checkIn.errors.unit)}
                  >
                    <option value="" disabled>Select Target Unit</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>
                        Unit {r.id} {r.tenant_name ? `(${r.tenant_name})` : ''}
                      </option>
                    ))}
                  </select>
                  <FieldError id="checkin-unit" error={checkIn.errors.unit} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="checkin-visitDate" className="block text-xs font-bold text-slate-700 mb-1">Check-in Date *</label>
                  <input
                    type="date"
                    required
                    {...checkIn.fieldA11y('visitDate')}
                    onChange={(e) => setCheckInField('visitDate', e.target.value)}
                    onBlur={() => blurCheckInField('visitDate')}
                    min={visitDateBounds.min}
                    max={visitDateBounds.max}
                    value={checkInForm.visitDate}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(checkIn.errors.visitDate)}
                  />
                  <FieldError id="checkin-visitDate" error={checkIn.errors.visitDate} />
                </div>
                <div>
                  <label htmlFor="checkin-visitTime" className="block text-xs font-bold text-slate-700 mb-1">Check-in Time *</label>
                  <input
                    type="time"
                    required
                    {...checkIn.fieldA11y('visitTime')}
                    onChange={(e) => setCheckInField('visitTime', e.target.value)}
                    onBlur={() => blurCheckInField('visitTime')}
                    value={checkInForm.visitTime}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(checkIn.errors.visitTime)}
                  />
                  <FieldError id="checkin-visitTime" error={checkIn.errors.visitTime} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="checkin-checkOutDate" className="block text-xs font-bold text-slate-700 mb-1">Expected Check-out Date *</label>
                  <input
                    type="date"
                    required
                    {...checkIn.fieldA11y('checkOutDate')}
                    onChange={(e) => setCheckInField('checkOutDate', e.target.value)}
                    onBlur={() => blurCheckInField('checkOutDate')}
                    min={visitDateBounds.min}
                    max={visitDateBounds.outMax}
                    value={checkInForm.checkOutDate}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(checkIn.errors.checkOutDate)}
                  />
                  <FieldError id="checkin-checkOutDate" error={checkIn.errors.checkOutDate} />
                </div>
                <div>
                  <label htmlFor="checkin-checkOutTime" className="block text-xs font-bold text-slate-700 mb-1">Expected Check-out Time *</label>
                  <input
                    type="time"
                    required
                    {...checkIn.fieldA11y('checkOutTime')}
                    onChange={(e) => setCheckInField('checkOutTime', e.target.value)}
                    onBlur={() => blurCheckInField('checkOutTime')}
                    value={checkInForm.checkOutTime}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(checkIn.errors.checkOutTime)}
                  />
                  <FieldError id="checkin-checkOutTime" error={checkIn.errors.checkOutTime} />
                </div>
              </div>

              <div>
                <label htmlFor="checkin-purpose" className="block text-xs font-bold text-slate-700 mb-1">Purpose of Visit *</label>
                <select
                  {...checkIn.fieldA11y('purpose')}
                    onChange={(e) => setCheckInField('purpose', e.target.value)}
                    onBlur={() => blurCheckInField('purpose')}
                  value={checkInForm.purpose}
                  className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer" + invalidCls(checkIn.errors.purpose)}
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
                  <label htmlFor="checkin-idType" className="block text-xs font-bold text-slate-700 mb-1">Gov ID Type *</label>
                  <select
                    {...checkIn.fieldA11y('idType')}
                    onChange={(e) => setCheckInField('idType', e.target.value)}
                    onBlur={() => blurCheckInField('idType')}
                    value={checkInForm.idType}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer" + invalidCls(checkIn.errors.idType)}
                  >
                    <option value="National ID">Philippine National ID</option>
                    <option value="Driver's License">Driver's License</option>
                    <option value="Passport">Passport</option>
                    <option value="UMID / SSS">UMID / SSS</option>
                    <option value="Company / Student ID">Company / Student ID</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="checkin-idNumber" className="block text-xs font-bold text-slate-700 mb-1">ID Number *</label>
                  <input
                    type="text"
                    required
                    {...checkIn.fieldA11y('idNumber')}
                    onChange={(e) => setCheckInField('idNumber', e.target.value)}
                    onBlur={() => blurCheckInField('idNumber')}
                    autoComplete="off"
                    placeholder="e.g. N02-18-9382"
                    value={checkInForm.idNumber}
                    maxLength={LIMITS.idNumber}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(checkIn.errors.idNumber)}
                  />
                  <FieldError id="checkin-idNumber" error={checkIn.errors.idNumber} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="checkin-vehiclePlate" className="block text-xs font-bold text-slate-700 mb-1">Vehicle Plate (Optional)</label>
                  <input
                    type="text"
                    {...checkIn.fieldA11y('vehiclePlate')}
                    onChange={(e) => setCheckInField('vehiclePlate', e.target.value.toUpperCase())}
                    onBlur={() => blurCheckInField('vehiclePlate')}
                    autoComplete="off"
                    placeholder="e.g. ABC 1234"
                    value={checkInForm.vehiclePlate}
                    maxLength={LIMITS.visitorPlate}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 uppercase font-mono" + invalidCls(checkIn.errors.vehiclePlate)}
                  />
                  <FieldError id="checkin-vehiclePlate" error={checkIn.errors.vehiclePlate} />
                </div>
                <div>
                  <label htmlFor="checkin-idPhoto" className="block text-xs font-bold text-slate-700 mb-1">Gov ID / Pass Photo (Optional)</label>
                  <input
                    key={photoInputKey}
                    type="file"
                    {...checkIn.fieldA11y('idPhoto')}
                    accept={acceptFor(FILE_RULES.visitorId)}
                    onChange={(e) => {
                      const file = e.target.files[0] || null;
                      const fileError = checkFile(file, FILE_RULES.visitorId);
                      checkIn.setFieldError('idPhoto', fileError);
                      if (fileError) { e.target.value = ''; setCheckInForm(f => ({ ...f, idPhoto: null })); return; }
                      setCheckInForm(f => ({ ...f, idPhoto: file }));
                    }}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                  <FieldError id="checkin-idPhoto" error={checkIn.errors.idPhoto} />
                  <FileChip file={checkInForm.idPhoto} onRemove={clearIdPhoto} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay-anim" onClick={() => setShowCheckoutModal(false)}>
          <div className="admin-visitors-modal modal-card-anim w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
              {selectedVisitorForCheckout.expectedCheckOutAt && (
                <p className="m-0"><strong className="text-slate-800">Expected Check-out:</strong> {new Date(selectedVisitorForCheckout.expectedCheckOutAt).toLocaleString()}</p>
              )}
              <p className="m-0"><strong className="text-slate-800">Elapsed Duration:</strong> <span className="font-bold text-indigo-600">{selectedVisitorForCheckout.duration}</span></p>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="checkout-note" className="block text-xs font-bold text-slate-700 mb-1">Checkout Note *</label>
                <select
                  id="checkout-note"
                  name="checkoutNote"
                  required
                  value={checkoutNote}
                  onChange={(e) => { setCheckoutNote(e.target.value); checkIn.clearError('checkoutOther'); }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
                >
                  {CHECKOUT_NOTE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  <option value={CHECKOUT_NOTE_OTHER}>Other…</option>
                </select>
              </div>
              {checkoutNote === CHECKOUT_NOTE_OTHER && (
                <div>
                  <label htmlFor="checkin-checkoutOther" className="block text-xs font-bold text-slate-700 mb-1">Other Note *</label>
                  {/* update_visitor_status.php allows 1000 characters; the input used to stop at 255. */}
                  <input
                    type="text"
                    {...checkIn.fieldA11y('checkoutOther')}
                    autoComplete="off"
                    required
                    placeholder="e.g. Picked up by a family member"
                    value={checkoutOther}
                    maxLength={LIMITS.notes}
                    onChange={(e) => { setCheckoutOther(e.target.value); checkIn.clearError('checkoutOther'); }}
                    onBlur={() => { const v = checkoutOther.trim(); setCheckoutOther(v); if (v) checkIn.validateField('checkoutOther', { checkoutOther: v }); }}
                    className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(checkIn.errors.checkoutOther)}
                  />
                  <FieldError id="checkin-checkoutOther" error={checkIn.errors.checkoutOther} />
                </div>
              )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay-anim" onClick={() => setShowThresholdModal(false)}>
          <div className="admin-visitors-modal modal-card-anim w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

            <form onSubmit={handleSaveThreshold} className="space-y-4" noValidate>
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
                      onClick={() => { setThresholdHours(preset.h); checkIn.clearError('visitor_overstay_hours'); }}
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

                <label htmlFor="checkin-visitor_overstay_hours" className="block text-xs font-bold text-slate-700 mb-1">Custom Hours (1 to 168 hours)</label>
                {/* Kept as typed and validated; it used to snap to 1 while being cleared. */}
                <input
                  type="number"
                  {...checkIn.fieldA11y('visitor_overstay_hours')}
                  inputMode="numeric"
                  min="1"
                  max={MAX_OVERSTAY_HOURS}
                  step="1"
                  required
                  value={thresholdHours}
                  onKeyDown={blockNonIntegerKeys}
                  onChange={(e) => { setThresholdHours(e.target.value); checkIn.clearError('visitor_overstay_hours'); }}
                  onBlur={() => checkIn.validateField('visitor_overstay_hours', { visitor_overstay_hours: thresholdHours })}
                  className={"w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(checkIn.errors.visitor_overstay_hours)}
                />
                <FieldError id="checkin-visitor_overstay_hours" error={checkIn.errors.visitor_overstay_hours} />
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

      {denyTarget && (
        <ReasonModal
          title="Decline Entry"
          label="Reason for declining entry"
          options={DENY_REASON_OPTIONS}
          confirmLabel="Decline Entry"
          onConfirm={confirmDeny}
          onClose={() => setDenyTarget(null)}
        />
      )}

    </div>
  );
}
