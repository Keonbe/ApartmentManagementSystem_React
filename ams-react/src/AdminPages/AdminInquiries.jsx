import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEnvelopeOpenText, faSearch, faSync, faTimes, faClock, faCheckCircle,
  faBuilding, faCalendarAlt, faPhone, faEnvelope, faBookmark, faPlus,
  faUsers, faBan, faArrowRight, faHourglassHalf, faComment, faListOl
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, MAX_AMOUNT, checkAmount, checkEmail, checkIntRange, checkLength, checkPersonName, checkPhMobile, checkText, localDateString, localTimeString, maxFutureDate, normalizeEmail, toPhE164 } from '../utils/validation';
import PhoneInput from '../Components/PhoneInput';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import CharCount from '../Components/form/CharCount';
import ReasonModal from '../Components/form/ReasonModal';
import { blockNonIntegerKeys, blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';

const MAX_HOLD_DAYS = 90;
const EMPTY_LOG = { full_name: '', contact_no: '', email: '', room_name: '', message: '', source: 'walk-in' };
import { getSystemSettings } from '../config/systemSettings';
import WaitlistPanel from '../Components/WaitlistPanel';

const INQUIRY_TABS = ['all', 'new', 'contacted', 'scheduled', 'reserved', 'converted', 'closed'];
const RESERVATION_TABS = ['all', 'active', 'converted', 'expired', 'cancelled'];

export default function AdminInquiries() {
  const navigate = useNavigate();

  const [inquiries, setInquiries] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [occupiedRooms, setOccupiedRooms] = useState([]);
  const [waitlistRoom, setWaitlistRoom] = useState('');
  const [waitlistMsg, setWaitlistMsg] = useState(null);
  const [waitlistKey, setWaitlistKey] = useState(0);
  const [holdDays, setHoldDays] = useState(7);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('inquiries');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selected, setSelected] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Detail modal working state
  const [notes, setNotes] = useState('');
  const [viewingDate, setViewingDate] = useState('');

  // Reserve modal working state
  const [resRoom, setResRoom] = useState('');
  const [resHoldDays, setResHoldDays] = useState(7);
  const [resFee, setResFee] = useState('');
  const [resNotes, setResNotes] = useState('');

  // Walk-in / phone log modal state
  const [logForm, setLogForm] = useState(EMPTY_LOG);
  const [busy, setBusy] = useState(''); // which action is in flight
  // { kind: 'closeInquiry' | 'cancelHold', id } while a reason is being entered (was window.prompt()).
  const [reasonFor, setReasonFor] = useState(null);

  // Keys match the endpoints' body fields.
  const detailErrors = useFieldErrors({
    admin_notes: (v) => checkText(v, { label: 'Admin notes', max: LIMITS.notes, required: false }),
    viewing_date: (v) => {
      if (!v) return 'Pick a viewing date and time first.';
      const [date] = String(v).split('T');
      if (date < localDateString()) return 'Viewing date cannot be in the past.';
      if (date > maxFutureDate()) return 'Viewing date is too far in the future.';
      return '';
    },
  }, { idPrefix: 'inquiry-detail-' });
  const reserveErrors = useFieldErrors({
    room_name: (v) => (rooms.some(r => String(r.id) === String(v)) ? '' : 'Select a unit to reserve.'),
    hold_days: (v) => checkIntRange(v === '' ? NaN : v, 1, MAX_HOLD_DAYS, 'Hold period'),
    reservation_fee: (v) => checkAmount(v, { label: 'Reservation fee', required: false }),
    notes: (v) => checkText(v, { label: 'Notes', max: LIMITS.notes, required: false }),
  }, { idPrefix: 'reserve-' });
  const logErrors = useFieldErrors({
    full_name: (v) => checkPersonName(v, { label: 'Full name', max: LIMITS.fullName }),
    contact_no: (v) => checkPhMobile(v),
    email: (v) => checkEmail(v, { max: LIMITS.email }),
    room_name: (v) => (!v || rooms.some(r => String(r.id) === String(v)) ? '' : 'Choose a listed unit.'),
    message: (v) => checkText(v, { label: 'Message', max: LIMITS.message, required: false }),
  }, { idPrefix: 'log-' });
  const reserveValues = () => ({ room_name: resRoom, hold_days: resHoldDays, reservation_fee: resFee, notes: resNotes });
  const setLogField = (key, value) => {
    setLogForm(f => ({ ...f, [key]: value }));
    logErrors.clearError(key);
  };
  const blurLogField = (key) => {
    const raw = logForm[key];
    const v = key === 'email' ? normalizeEmail(raw) : (key === 'full_name' || key === 'message') ? String(raw).trim() : raw;
    if (v !== raw) setLogForm(f => ({ ...f, [key]: v }));
    if (key === 'contact_no' || v) logErrors.validateField(key, { ...logForm, [key]: v });
  };

  const loadData = useCallback(async () => {
    try {
      const res = await api.get('get_inquiries.php');
      if (res.data.success) {
        setInquiries(res.data.inquiries || []);
        setReservations(res.data.reservations || []);
      } else {
        setError(res.data.message || 'Failed to fetch inquiries.');
      }
    } catch (err) {
      console.error('Failed to load inquiries:', err);
      setError('Unable to load inquiries. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    return loadData();
  }, [loadData]);

  // Vacant rooms feed the reserve picker; the hold period seeds its default.
  const fetchSupporting = useCallback(async () => {
    try {
      const [roomRes, settings] = await Promise.all([
        api.get('get_rooms.php'),
        getSystemSettings(),
      ]);
      if (roomRes.data.success && Array.isArray(roomRes.data.rooms)) {
        setRooms(roomRes.data.rooms.filter(r => r.status && r.status.toLowerCase() === 'vacant'));
        // The waitlist is for units that aren't free right now.
        setOccupiedRooms(roomRes.data.rooms.filter(r => !r.status || r.status.toLowerCase() !== 'vacant'));
      }
      const days = Number(settings.reservationHoldDays) || 7;
      setHoldDays(days);
      setResHoldDays(days);
    } catch (err) {
      console.error('Failed to load supporting data:', err);
    }
  }, []);

  useEffect(() => {
    const load = async () => { await Promise.all([loadData(), fetchSupporting()]); };
    load();
  }, [loadData, fetchSupporting]);

  const runExpirySweep = async () => {
    try {
      const res = await api.post('expire_reservations.php', {});
      if (res.data.success) {
        alert(res.data.message);
        fetchData();
        fetchSupporting();
      }
    } catch (err) {
      console.error('Expiry sweep failed:', err);
      alert('Failed to run the expiry sweep.');
    }
  };

  // Returns true on success; with `throwOnError` a failure throws instead
  // (ReasonModal shows the message).
  const updateInquiry = async (payload, { throwOnError = false } = {}) => {
    setActionError(null);
    let message = '';
    setBusy('inquiry');
    try {
      const res = await api.post('update_inquiry_status.php', payload);
      if (res.data.success) {
        await fetchData();
        return true;
      }
      if (!detailErrors.applyServerErrors(res)) message = res.data.message || 'Failed to update inquiry.';
    } catch (err) {
      console.error('Error updating inquiry:', err);
      if (!detailErrors.applyServerErrors(err)) message = apiErrorMessage(err, 'Server error updating the inquiry.');
    } finally {
      setBusy('');
    }
    if (message && throwOnError) throw new Error(message);
    if (message) setActionError(message);
    return false;
  };

  // Throws on failure so a reason modal can show it.
  const updateReservation = async (id, status, reason = '') => {
    setActionError(null);
    let res;
    try {
      res = await api.post('update_reservation_status.php', { id, status, reason });
    } catch (err) {
      console.error('Error updating reservation:', err);
      throw new Error(apiErrorMessage(err, 'Server error updating the reservation.'), { cause: err });
    }
    if (!res.data.success) throw new Error(res.data.message || 'Failed to update reservation.');
    await fetchData();
    await fetchSupporting();
  };

  const markReservation = async (id, status) => {
    try {
      await updateReservation(id, status);
    } catch (err) {
      alert(err.message);
    }
  };

  const confirmReason = async (reason) => {
    if (reasonFor.kind === 'cancelHold') {
      await updateReservation(reasonFor.id, 'Cancelled', reason);
    } else {
      const ok = await updateInquiry({ id: selected.id, status: 'Closed', admin_notes: notes.trim(), closed_reason: reason }, { throwOnError: true });
      if (ok) setShowDetail(false);
    }
    setReasonFor(null);
  };

  const submitReservation = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setActionError(null);
    const clean = { ...reserveValues(), notes: resNotes.trim() };
    setResNotes(clean.notes);
    if (!reserveErrors.validateAll(clean)) return;
    // create_reservation.php stores these in columns of 150/30/150 characters;
    // they come from the inquiry, so a bad value is caught here, not truncated.
    const carriedError = checkLength(selected?.fullName, LIMITS.fullName, 'Name')
      || checkLength(selected?.contactNo, 30, 'Contact number')
      || checkLength(selected?.email, LIMITS.email, 'Email');
    if (carriedError) {
      setActionError(carriedError);
      return;
    }
    setBusy('reserve');
    try {
      const res = await api.post('create_reservation.php', {
        inquiry_id: selected?.id,
        room_name: resRoom,
        reserved_for_name: selected?.fullName || '',
        contact_no: selected?.contactNo || '',
        email: selected?.email || '',
        hold_days: Number(clean.hold_days),
        reservation_fee: clean.reservation_fee,
        notes: clean.notes,
      });
      if (!res.data.success) {
        if (!reserveErrors.applyServerErrors(res)) setActionError(res.data.message || 'Failed to create the reservation.');
        return;
      }
      setShowReserveModal(false);
      setShowDetail(false);
      setResFee('');
      setResNotes('');
      await fetchData();
      await fetchSupporting();
    } catch (err) {
      console.error('Error creating reservation:', err);
      if (!reserveErrors.applyServerErrors(err)) setActionError(apiErrorMessage(err, 'Server error creating the reservation.'));
    } finally {
      setBusy('');
    }
  };

  const submitLoggedInquiry = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setActionError(null);
    const clean = { ...logForm, full_name: logForm.full_name.trim(), email: normalizeEmail(logForm.email), message: logForm.message.trim() };
    setLogForm(clean);
    if (!logErrors.validateAll(clean)) return;
    setBusy('log');
    try {
      const res = await api.post('submit_inquiry.php', { ...clean, contact_no: toPhE164(clean.contact_no) });
      if (!res.data.success) {
        if (!logErrors.applyServerErrors(res)) setActionError(res.data.message || 'Failed to log the inquiry.');
        return;
      }
      setShowLogModal(false);
      setLogForm(EMPTY_LOG);
      fetchData();
    } catch (err) {
      console.error('Error logging inquiry:', err);
      if (!logErrors.applyServerErrors(err)) setActionError(apiErrorMessage(err, 'Server error logging the inquiry.'));
    } finally {
      setBusy('');
    }
  };

  const openDetail = (inquiry) => {
    setSelected(inquiry);
    setNotes(inquiry.adminNotes || '');
    setViewingDate(inquiry.viewingDate ? inquiry.viewingDate.replace(' ', 'T').slice(0, 16) : '');
    setResRoom(inquiry.unit || '');
    setWaitlistRoom(inquiry.unit || '');
    setWaitlistMsg(null);
    setResHoldDays(holdDays);
    setActionError(null);
    detailErrors.setErrors({});
    setShowDetail(true);
  };

  const addToWaitlist = async () => {
    setWaitlistMsg(null);
    if (!waitlistRoom) {
      setWaitlistMsg({ ok: false, text: 'Choose the unit they are waiting for.' });
      return;
    }
    try {
      const res = await api.post('manage_waitlist.php', { action: 'add', inquiryId: selected.id, roomName: waitlistRoom });
      setWaitlistMsg({ ok: res.data.success, text: res.data.message });
      if (res.data.success) setWaitlistKey(k => k + 1);
    } catch (err) {
      setWaitlistMsg({ ok: false, text: err.response?.data?.message || 'Could not add to the waitlist.' });
    }
  };

  const openInquiryById = (id) => {
    const inquiry = inquiries.find(i => i.id === id);
    if (inquiry) openDetail(inquiry);
  };

  const convertToApplication = (inquiry) => {
    navigate('/rent-application', { state: { selectedRoomId: inquiry.unit } });
  };

  // ─── Filtering ───
  const q = searchQuery.toLowerCase().trim();

  const filteredInquiries = inquiries.filter(i => {
    const matchesStatus = statusFilter === 'all' || (i.status && i.status.toLowerCase() === statusFilter);
    const matchesSearch = !q ||
      (i.fullName && i.fullName.toLowerCase().includes(q)) ||
      (i.email && i.email.toLowerCase().includes(q)) ||
      (i.contactNo && i.contactNo.toLowerCase().includes(q)) ||
      (i.unit && i.unit.toLowerCase().includes(q)) ||
      (i.message && i.message.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const filteredReservations = reservations.filter(r => {
    const matchesStatus = statusFilter === 'all' || (r.status && r.status.toLowerCase() === statusFilter);
    const matchesSearch = !q ||
      (r.reservedFor && r.reservedFor.toLowerCase().includes(q)) ||
      (r.unit && r.unit.toLowerCase().includes(q)) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.contactNo && r.contactNo.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const newCount = inquiries.filter(i => i.status === 'New').length;
  const activeHolds = reservations.filter(r => r.status === 'Active').length;
  const convertedCount = inquiries.filter(i => i.status === 'Converted').length;

  const inquiryBadge = (status) => {
    const map = {
      New: 'bg-indigo-100 text-indigo-700',
      Contacted: 'bg-sky-100 text-sky-700',
      Scheduled: 'bg-amber-100 text-amber-700',
      Reserved: 'bg-violet-100 text-violet-700',
      Converted: 'bg-emerald-100 text-emerald-700',
      Closed: 'bg-slate-100 text-slate-600',
    };
    return map[status] || 'bg-slate-100 text-slate-600';
  };

  const reservationBadge = (status) => {
    const map = {
      Active: 'bg-violet-100 text-violet-700',
      Converted: 'bg-emerald-100 text-emerald-700',
      Expired: 'bg-amber-100 text-amber-700',
      Cancelled: 'bg-rose-100 text-rose-700',
    };
    return map[status] || 'bg-slate-100 text-slate-600';
  };

  const fmtDate = (v) => v ? new Date(v).toLocaleDateString() : '—';
  const fmtDateTime = (v) => v ? new Date(v).toLocaleString() : '—';

  const tabs = view === 'inquiries' ? INQUIRY_TABS : RESERVATION_TABS;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-white text-left font-sans">
        <Header title="Inquiries & Reservations" />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* Stat Cards */}
            <div className="stagger-children grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card-interactive rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Total Inquiries</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <FontAwesomeIcon icon={faEnvelopeOpenText} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-indigo-950 m-0">{inquiries.length}</p>
                <p className="mt-1 text-xs text-indigo-600 font-medium m-0">All time</p>
              </div>

              <div className="card-interactive rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Needs Response</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <FontAwesomeIcon icon={faClock} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-amber-950 m-0">{newCount}</p>
                <p className="mt-1 text-xs text-amber-600 font-medium m-0">Not yet contacted</p>
              </div>

              <div className="card-interactive rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Units on Hold</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                    <FontAwesomeIcon icon={faBookmark} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-violet-950 m-0">{activeHolds}</p>
                <p className="mt-1 text-xs text-violet-600 font-medium m-0">Active reservations</p>
              </div>

              <div className="card-interactive rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Converted</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <FontAwesomeIcon icon={faCheckCircle} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-emerald-950 m-0">{convertedCount}</p>
                <p className="mt-1 text-xs text-emerald-600 font-medium m-0">Became applications</p>
              </div>
            </div>

            {/* View switch + actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                {['inquiries', 'reservations'].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setView(v); setStatusFilter('all'); }}
                    className={`flex-1 sm:flex-none rounded-lg px-4 py-2 text-xs font-bold capitalize transition-all border-0 cursor-pointer ${
                      view === v ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {v} ({v === 'inquiries' ? inquiries.length : reservations.length})
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => { setActionError(null); logErrors.setErrors({}); setShowLogModal(true); }}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors border-0 cursor-pointer shadow-sm"
                >
                  <FontAwesomeIcon icon={faPlus} /> Log Walk-in Inquiry
                </button>
                <button
                  type="button"
                  onClick={runExpirySweep}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                  title="Release reservations whose hold period has lapsed"
                >
                  <FontAwesomeIcon icon={faHourglassHalf} /> Release Expired
                </button>
              </div>
            </div>

            {/* Search + status filter */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative flex-1 w-full">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                  <input maxLength={LIMITS.search}
                    type="text"
                    placeholder={view === 'inquiries' ? 'Search by name, email, contact, unit, or message...' : 'Search by name, unit, or contact...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl flex-wrap">
                    {tabs.map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setStatusFilter(tab)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all border-0 cursor-pointer ${
                          statusFilter === tab ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { fetchData(); fetchSupporting(); }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer shrink-0"
                    title="Refresh"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                {view === 'inquiries' ? (
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3.5">Prospect</th>
                        <th className="px-4 py-3.5">Unit of Interest</th>
                        <th className="px-4 py-3.5">Preferred Move-In</th>
                        <th className="px-4 py-3.5">Source</th>
                        <th className="px-4 py-3.5">Received</th>
                        <th className="px-4 py-3.5 text-center">Status</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="stagger-children divide-y divide-slate-100">
                      {loading ? (
                        <tr><td colSpan="7" className="px-5 py-12 text-center text-slate-400 font-medium">Loading inquiries...</td></tr>
                      ) : error ? (
                        <tr><td colSpan="7" className="px-5 py-12 text-center text-rose-500 font-medium">{error}</td></tr>
                      ) : filteredInquiries.length === 0 ? (
                        <tr><td colSpan="7" className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-slate-400">
                            <FontAwesomeIcon icon={faEnvelopeOpenText} className="text-xl text-slate-300 shrink-0" />
                            <span className="text-sm italic">No inquiries found.</span>
                          </div>
                        </td></tr>
                      ) : (
                        filteredInquiries.map(inq => (
                          <tr key={inq.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-5 py-4">
                              <p className="font-bold text-slate-800 m-0">{inq.fullName}</p>
                              <span className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                                <FontAwesomeIcon icon={faEnvelope} className="text-[10px] text-indigo-500" />
                                {inq.email}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                                <FontAwesomeIcon icon={faPhone} className="text-[10px] text-indigo-500" />
                                {inq.contactNo}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {inq.unit ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                                  <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-indigo-500" />
                                  Unit {inq.unit}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Any available</span>
                              )}
                              {inq.occupants && (
                                <p className="text-[11px] text-slate-400 m-0 mt-0.5">{inq.occupants} occupant(s)</p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-xs text-slate-600">{fmtDate(inq.preferredMoveIn)}</td>
                            <td className="px-4 py-4">
                              <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 capitalize">{inq.source}</span>
                            </td>
                            <td className="px-4 py-4 text-xs text-slate-500">{fmtDate(inq.createdAt)}</td>
                            <td className="px-4 py-4 text-center">
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${inquiryBadge(inq.status)}`}>
                                {inq.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => openDetail(inq)}
                                className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors border-0 cursor-pointer"
                              >
                                Manage
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3.5">Unit</th>
                        <th className="px-4 py-3.5">Reserved For</th>
                        <th className="px-4 py-3.5">Reserved On</th>
                        <th className="px-4 py-3.5">Hold Expires</th>
                        <th className="px-4 py-3.5">Fee</th>
                        <th className="px-4 py-3.5 text-center">Status</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="stagger-children divide-y divide-slate-100">
                      {loading ? (
                        <tr><td colSpan="7" className="px-5 py-12 text-center text-slate-400 font-medium">Loading reservations...</td></tr>
                      ) : error ? (
                        <tr><td colSpan="7" className="px-5 py-12 text-center text-rose-500 font-medium">{error}</td></tr>
                      ) : filteredReservations.length === 0 ? (
                        <tr><td colSpan="7" className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-slate-400">
                            <FontAwesomeIcon icon={faBookmark} className="text-xl text-slate-300 shrink-0" />
                            <span className="text-sm italic">No reservations found.</span>
                          </div>
                        </td></tr>
                      ) : (
                        filteredReservations.map(res => (
                          <tr key={res.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                                <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-indigo-500" />
                                Unit {res.unit}
                              </span>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5">{res.roomType || '—'}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-semibold text-slate-700 m-0">{res.reservedFor}</p>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5">{res.contactNo || res.email || '—'}</p>
                            </td>
                            <td className="px-4 py-4 text-xs text-slate-500">{fmtDate(res.createdAt)}</td>
                            <td className="px-4 py-4">
                              <p className="text-xs font-semibold text-slate-700 m-0">{fmtDate(res.holdExpiresAt)}</p>
                              {res.status === 'Active' && (
                                <p className={`text-[11px] m-0 mt-0.5 font-bold ${Number(res.daysRemaining) <= 2 ? 'text-rose-600' : 'text-slate-400'}`}>
                                  {Number(res.daysRemaining) < 0
                                    ? 'Lapsed'
                                    : Number(res.daysRemaining) === 0
                                      ? 'Expires today'
                                      : `${res.daysRemaining} day(s) left`}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-xs font-semibold text-slate-700">
                              {Number(res.reservationFee) > 0 ? `₱${Number(res.reservationFee).toLocaleString()}` : '—'}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${reservationBadge(res.status)}`}>
                                {res.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              {res.status === 'Active' ? (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => markReservation(res.id, 'Converted')}
                                    className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer"
                                    title="Mark as converted to an application"
                                  >
                                    <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Converted
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReasonFor({ kind: 'cancelHold', id: res.id })}
                                    className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors border-0 cursor-pointer"
                                    title="Cancel hold and release the unit"
                                  >
                                    <FontAwesomeIcon icon={faBan} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs font-medium italic text-slate-400">
                                  {res.releasedReason || 'Closed'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <WaitlistPanel key={waitlistKey} onOpenInquiry={openInquiryById} />
          </div>
        </main>
      </div>

      {/* ─── INQUIRY DETAIL MODAL ─── */}
      {showDetail && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay-anim" onClick={() => setShowDetail(false)}>
          <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

            <div className="px-6 py-5 flex items-center justify-between shrink-0 text-white bg-gradient-to-r from-indigo-600 to-indigo-800">
              <div>
                <h3 className="text-xl font-bold m-0 tracking-tight">{selected.fullName}</h3>
                <div className="flex gap-3 mt-1 opacity-90 text-xs">
                  <span>Received {fmtDate(selected.createdAt)}</span>
                  <span>•</span>
                  <span className="font-semibold px-2 py-0.5 bg-white/20 rounded-md">
                    {selected.unit ? `Unit ${selected.unit}` : 'No specific unit'}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowDetail(false)} className="text-white hover:bg-white/20 p-2 rounded-xl border-0 bg-transparent cursor-pointer transition-colors">
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-5">

              {actionError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl p-3.5 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faEnvelope} className="mr-1" /> Email</p>
                  <p className="text-sm font-semibold text-slate-800 m-0 break-all">{selected.email}</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faPhone} className="mr-1" /> Contact</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selected.contactNo}</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faCalendarAlt} className="mr-1" /> Preferred Move-In</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{fmtDate(selected.preferredMoveIn)}</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faUsers} className="mr-1" /> Occupants</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selected.occupants || '—'}</p>
                </div>
              </div>

              {selected.message && (
                <div className="bg-white rounded-xl p-4 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 m-0"><FontAwesomeIcon icon={faComment} className="mr-1" /> Message</p>
                  <p className="text-sm text-slate-700 m-0 whitespace-pre-wrap">{selected.message}</p>
                </div>
              )}

              {selected.viewingDate && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-800 text-sm font-medium">
                  Viewing scheduled for {fmtDateTime(selected.viewingDate)}
                </div>
              )}

              <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                <label htmlFor="inquiry-detail-admin_notes" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Admin Notes</label>
                <textarea
                  rows="3"
                  {...detailErrors.fieldA11y('admin_notes')}
                  value={notes}
                  maxLength={LIMITS.notes}
                  onChange={(e) => { setNotes(e.target.value); detailErrors.clearError('admin_notes'); }}
                  onBlur={() => { const v = notes.trim(); setNotes(v); detailErrors.validateField('admin_notes', { admin_notes: v }); }}
                  placeholder="Record what was discussed, follow-up dates, or screening notes..."
                  className={`w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white resize-y${invalidCls(detailErrors.errors.admin_notes)}`}
                />
                <FieldError id="inquiry-detail-admin_notes" error={detailErrors.errors.admin_notes} />
                <CharCount value={notes} max={LIMITS.notes} />

                <label htmlFor="inquiry-detail-viewing_date" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Viewing Schedule</label>
                <input
                  type="datetime-local"
                  {...detailErrors.fieldA11y('viewing_date')}
                  min={`${localDateString()}T${localTimeString()}`}
                  max={`${maxFutureDate()}T23:59`}
                  value={viewingDate}
                  onChange={(e) => { setViewingDate(e.target.value); detailErrors.clearError('viewing_date'); }}
                  onBlur={() => viewingDate && detailErrors.validateField('viewing_date', { viewing_date: viewingDate })}
                  className={`w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white${invalidCls(detailErrors.errors.viewing_date)}`}
                />
                <FieldError id="inquiry-detail-viewing_date" error={detailErrors.errors.viewing_date} />
              </div>

              {/* Pipeline actions */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={async () => {
                    if (!detailErrors.validateAll({ admin_notes: notes }, ['admin_notes'])) return;
                    const ok = await updateInquiry({ id: selected.id, status: 'Contacted', admin_notes: notes.trim() });
                    if (ok) setShowDetail(false);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 text-xs font-bold text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faPhone} /> Mark Contacted
                </button>

                <button
                  type="button"
                  disabled={!!busy}
                  onClick={async () => {
                    if (!detailErrors.validateAll({ admin_notes: notes, viewing_date: viewingDate })) return;
                    const ok = await updateInquiry({ id: selected.id, status: 'Scheduled', admin_notes: notes.trim(), viewing_date: viewingDate.replace('T', ' ') + ':00' });
                    if (ok) setShowDetail(false);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faCalendarAlt} /> Schedule Viewing
                </button>

                <button
                  type="button"
                  onClick={() => { setActionError(null); reserveErrors.setErrors({}); setShowReserveModal(true); }}
                  disabled={selected.status === 'Reserved'}
                  className="flex items-center justify-center gap-2 rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <FontAwesomeIcon icon={faBookmark} /> Reserve Unit
                </button>

                <button
                  type="button"
                  onClick={() => convertToApplication(selected)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  <FontAwesomeIcon icon={faArrowRight} /> Convert to Application
                </button>
              </div>

              {!['Converted', 'Closed'].includes(selected.status) && (
                <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    <FontAwesomeIcon icon={faListOl} className="mr-1" /> Waitlist for an occupied unit
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={waitlistRoom}
                      onChange={(e) => setWaitlistRoom(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500"
                    >
                      <option value="">Select a unit…</option>
                      {occupiedRooms.map(r => (
                        <option key={r.id} value={r.id}>Room {r.id} — {r.status}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addToWaitlist}
                      className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                    >
                      Add to waitlist
                    </button>
                  </div>
                  {waitlistMsg && (
                    <p className={`text-xs font-semibold m-0 ${waitlistMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{waitlistMsg.text}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={async () => {
                    if (!detailErrors.validateAll({ admin_notes: notes }, ['admin_notes'])) return;
                    const ok = await updateInquiry({ id: selected.id, status: selected.status, admin_notes: notes.trim() });
                    if (ok) setShowDetail(false);
                  }}
                  className="flex-1 rounded-xl bg-slate-800 px-4 py-3 text-xs font-bold text-white hover:bg-slate-900 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy === 'inquiry' ? 'Saving…' : 'Save Notes'}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    if (!detailErrors.validateAll({ admin_notes: notes }, ['admin_notes'])) return;
                    setReasonFor({ kind: 'closeInquiry', id: selected.id });
                  }}
                  className="flex-1 rounded-xl bg-white border-2 border-rose-200 px-4 py-3 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Close Inquiry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── RESERVE UNIT MODAL ─── */}
      {showReserveModal && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay-anim" onClick={() => setShowReserveModal(false)}>
          <form className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()} onSubmit={submitReservation} noValidate>
            <div className="px-6 py-5 flex items-center justify-between text-white bg-gradient-to-r from-violet-600 to-violet-800">
              <h3 className="text-lg font-bold m-0">Reserve a Unit</h3>
              <button type="button" aria-label="Close" onClick={() => setShowReserveModal(false)} className="text-white hover:bg-white/20 p-2 rounded-xl border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50">
              {actionError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
                  {actionError}
                </div>
              )}

              <p className="text-sm text-slate-600 m-0">
                Holding a unit for <strong className="text-slate-800">{selected.fullName}</strong>. The unit is marked
                <strong className="text-violet-700"> Reserved</strong> and hidden from the public listing until the hold expires.
              </p>

              <div>
                <label htmlFor="reserve-room_name" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Unit (vacant only)</label>
                <select
                  {...reserveErrors.fieldA11y('room_name')}
                  value={resRoom}
                  onChange={(e) => { setResRoom(e.target.value); reserveErrors.clearError('room_name'); }}
                  className={`w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500${invalidCls(reserveErrors.errors.room_name)}`}
                >
                  <option value="" disabled>Select a unit...</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>Room {r.id} — {r.type} (₱{Number(r.rent).toLocaleString()}/mo)</option>
                  ))}
                </select>
                <FieldError id="reserve-room_name" error={reserveErrors.errors.room_name} />
                {rooms.length === 0 && (
                  <p className="text-xs text-amber-600 font-medium mt-1.5 m-0">No vacant units are available to reserve.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reserve-hold_days" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Hold Period (days)</label>
                  {/* Kept as typed: Number('') used to turn an empty field into 0. */}
                  <input
                    type="number"
                    {...reserveErrors.fieldA11y('hold_days')}
                    inputMode="numeric"
                    min="1"
                    max={MAX_HOLD_DAYS}
                    step="1"
                    value={resHoldDays}
                    onKeyDown={blockNonIntegerKeys}
                    onChange={(e) => { setResHoldDays(e.target.value); reserveErrors.clearError('hold_days'); }}
                    onBlur={() => reserveErrors.validateField('hold_days', reserveValues())}
                    className={`w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500${invalidCls(reserveErrors.errors.hold_days)}`}
                  />
                  <FieldError id="reserve-hold_days" error={reserveErrors.errors.hold_days} />
                </div>
                <div>
                  <label htmlFor="reserve-reservation_fee" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Reservation Fee (₱)</label>
                  <input
                    type="number"
                    {...reserveErrors.fieldA11y('reservation_fee')}
                    inputMode="decimal"
                    min="0"
                    max={MAX_AMOUNT}
                    step="0.01"
                    value={resFee}
                    onKeyDown={blockNonNumericKeys}
                    onChange={(e) => { setResFee(e.target.value); reserveErrors.clearError('reservation_fee'); }}
                    onBlur={() => reserveErrors.validateField('reservation_fee', reserveValues())}
                    placeholder="0.00"
                    className={`w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500${invalidCls(reserveErrors.errors.reservation_fee)}`}
                  />
                  <FieldError id="reserve-reservation_fee" error={reserveErrors.errors.reservation_fee} />
                </div>
              </div>

              <div>
                <label htmlFor="reserve-notes" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Notes</label>
                <textarea
                  rows="2"
                  {...reserveErrors.fieldA11y('notes')}
                  value={resNotes}
                  maxLength={LIMITS.notes}
                  onChange={(e) => { setResNotes(e.target.value); reserveErrors.clearError('notes'); }}
                  onBlur={() => { const v = resNotes.trim(); setResNotes(v); reserveErrors.validateField('notes', { ...reserveValues(), notes: v }); }}
                  placeholder="Terms agreed, deposit arrangement, etc."
                  className={`w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500 resize-y${invalidCls(reserveErrors.errors.notes)}`}
                />
                <FieldError id="reserve-notes" error={reserveErrors.errors.notes} />
                <CharCount value={resNotes} max={LIMITS.notes} />
              </div>

              <button
                type="submit"
                disabled={!!busy}
                className="w-full rounded-xl bg-violet-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-violet-700 transition-colors border-0 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy === 'reserve' ? 'Placing hold…' : 'Place Hold'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── LOG WALK-IN / PHONE INQUIRY MODAL ─── */}
      {showLogModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay-anim" onClick={() => setShowLogModal(false)}>
          <form className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()} onSubmit={submitLoggedInquiry} noValidate>
            <div className="px-6 py-5 flex items-center justify-between text-white bg-gradient-to-r from-indigo-600 to-indigo-800">
              <h3 className="text-lg font-bold m-0">Log an Inquiry</h3>
              <button type="button" aria-label="Close" onClick={() => setShowLogModal(false)} className="text-white hover:bg-white/20 p-2 rounded-xl border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50 max-h-[70vh] overflow-y-auto">
              {actionError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
                  {actionError}
                </div>
              )}

              <p className="text-sm text-slate-600 m-0">Record an inquiry that came in by phone or at the office.</p>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Source</label>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  {['walk-in', 'phone'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLogForm({ ...logForm, source: s })}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold capitalize transition-all border-0 cursor-pointer ${
                        logForm.source === s ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-600'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {[
                { key: 'full_name', label: 'Full Name', type: 'text', placeholder: 'e.g. Juan Dela Cruz', max: LIMITS.fullName },
                { key: 'contact_no', label: 'Contact Number', type: 'tel' },
                { key: 'email', label: 'Email Address', type: 'email', placeholder: 'e.g. juan@email.com', max: LIMITS.email },
              ].map(field => (
                <div key={field.key}>
                  <label htmlFor={`log-${field.key}`} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{field.label}</label>
                  {field.type === 'tel' ? (
                    <PhoneInput
                      id="log-contact_no"
                      name="contact_no"
                      value={logForm.contact_no}
                      onChange={(digits) => setLogField('contact_no', digits)}
                      onBlur={() => blurLogField('contact_no')}
                      error={logErrors.errors.contact_no}
                      inputClassName={`w-full rounded-r-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-500${invalidCls(logErrors.errors.contact_no)}`}
                    />
                  ) : (
                    <>
                      <input
                        type={field.type}
                        {...logErrors.fieldA11y(field.key)}
                        inputMode={field.type === 'email' ? 'email' : undefined}
                        autoComplete="off"
                        maxLength={field.max}
                        value={logForm[field.key]}
                        onChange={(e) => setLogField(field.key, e.target.value)}
                        onBlur={() => blurLogField(field.key)}
                        placeholder={field.placeholder}
                        className={`w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-500${invalidCls(logErrors.errors[field.key])}`}
                      />
                      <FieldError id={`log-${field.key}`} error={logErrors.errors[field.key]} />
                    </>
                  )}
                </div>
              ))}

              <div>
                <label htmlFor="log-room_name" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Unit of Interest</label>
                <select
                  {...logErrors.fieldA11y('room_name')}
                  value={logForm.room_name}
                  onChange={(e) => setLogField('room_name', e.target.value)}
                  className={`w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-500${invalidCls(logErrors.errors.room_name)}`}
                >
                  <option value="">No specific unit</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>Room {r.id} — {r.type}</option>
                  ))}
                </select>
                <FieldError id="log-room_name" error={logErrors.errors.room_name} />
              </div>

              <div>
                <label htmlFor="log-message" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">What did they ask?</label>
                <textarea
                  rows="3"
                  {...logErrors.fieldA11y('message')}
                  value={logForm.message}
                  maxLength={LIMITS.message}
                  onChange={(e) => setLogField('message', e.target.value)}
                  onBlur={() => blurLogField('message')}
                  placeholder="Summarize the inquiry..."
                  className={`w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-500 resize-y${invalidCls(logErrors.errors.message)}`}
                />
                <FieldError id="log-message" error={logErrors.errors.message} />
                <CharCount value={logForm.message} max={LIMITS.message} />
              </div>

              <button
                type="submit"
                disabled={!!busy}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors border-0 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy === 'log' ? 'Saving…' : 'Save Inquiry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {reasonFor && (
        <ReasonModal
          title={reasonFor.kind === 'cancelHold' ? 'Cancel Hold' : 'Close Inquiry'}
          description={reasonFor.kind === 'cancelHold' ? 'The unit is released and becomes available again.' : undefined}
          label={reasonFor.kind === 'cancelHold' ? 'Reason for cancelling this hold' : 'Reason for closing this inquiry'}
          confirmLabel={reasonFor.kind === 'cancelHold' ? 'Cancel Hold' : 'Close Inquiry'}
          onConfirm={confirmReason}
          onClose={() => setReasonFor(null)}
        />
      )}
    </div>
  );
}
