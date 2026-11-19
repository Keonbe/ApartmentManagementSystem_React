import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEnvelopeOpenText, faSearch, faSync, faTimes, faCheckCircle,
  faBuilding, faCalendarAlt, faPhone, faEnvelope, faBookmark, faPlus,
  faUsers, faBan, faArrowRight, faHourglassHalf, faComment, faListOl,
  faArrowDownShortWide, faArrowDownWideShort
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, MAX_AMOUNT, checkAmount, checkEmail, checkIntRange, checkLength, checkPersonName, checkPhMobile, checkText, localDateString, localTimeString, maxFutureDate, normalizeEmail, toPhE164 } from '../utils/validation';
import PhoneInput from '../Components/PhoneInput';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import CharCount from '../Components/form/CharCount';
import ReasonModal from '../Components/form/ReasonModal';
import askConfirm from '../utils/askConfirm';
import { blockNonIntegerKeys, blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';

const MAX_HOLD_DAYS = 90;
const EMPTY_LOG = { full_name: '', contact_no: '', email: '', room_name: '', message: '', source: 'walk-in' };
import { getSystemSettings } from '../config/systemSettings';
import WaitlistPanel from '../Components/WaitlistPanel';
import Modal from '../Components/admin/Modal';
import useUrlFilter from '../hooks/useUrlFilter';
import { useSearchParams } from 'react-router-dom';
import { PANEL, TH, THEAD, btn } from '../Components/admin/ui/styles';
import FilterTabs from '../Components/admin/ui/FilterTabs';
import SelectMenu from '../Components/admin/ui/SelectMenu';
import { SkeletonRows } from '../Components/admin/ui/Skeleton';
import { LoadErrorRow } from '../Components/admin/ui/LoadError';

// "Open" (the default) = still being handled: not yet turned into an application
// and not closed. "All" is last, for looking something up.
const OPEN_STATUSES = ['new', 'contacted', 'scheduled', 'reserved'];
// No separate New tab: Open includes them, and each new (not yet contacted) row is marked.
const INQUIRY_TABS = ['open', 'contacted', 'scheduled', 'reserved', 'converted', 'closed', 'all'];
const RESERVATION_TABS = ['all', 'active', 'converted', 'expired', 'cancelled'];
const TAB_LABELS = { open: 'Open' };
const SORTS = [
  { value: 'oldest', label: 'Oldest first', hint: 'Longest waiting at the top', icon: faArrowDownShortWide },
  { value: 'newest', label: 'Newest first', hint: 'Latest received at the top', icon: faArrowDownWideShort },
];
// Work still to do is shown oldest first (the longest wait gets answered first);
// finished lists (converted, closed, all, past reservations) newest first.
const defaultSortFor = (view, tab) => (
  (view === 'inquiries' ? tab === 'open' || OPEN_STATUSES.includes(tab) : tab === 'active') ? 'oldest' : 'newest'
);
// One-click reasons that fill the reason box (still editable). A prospect with an
// account is sent the reason (update_inquiry_status.php), so they are worded for them.
const CLOSE_REASONS = [
  'No reply after several follow-ups',
  'Found another place',
  'No unit available for the preferred move-in date',
  'The rent is outside their budget',
  'Not ready to rent yet',
  'Duplicate of another inquiry',
  'Contact details could not be reached',
];
const CANCEL_HOLD_REASONS = [
  'The prospect withdrew',
  'Reservation fee was not paid',
  'Moved to a different unit',
  'The unit is no longer available',
];

const statusMatches = (item, filter) => {
  const s = (item.status || '').toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'open') return OPEN_STATUSES.includes(s);
  return s === filter;
};
// MySQL "YYYY-MM-DD HH:MM:SS" as a local date (Safari rejects the space).
const parseDbDate = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);
const daysSince = (v) => {
  const d = parseDbDate(v);
  if (!d || Number.isNaN(d.getTime())) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date();
  return Math.max(0, Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - start) / 86400000));
};
const ageText = (days) => (days === null ? '' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`);
// How long an open inquiry has waited: amber after 3 days, red after a week.
const ageTone = (days) => (days === null ? 'text-slate-500' : days >= 7 ? 'text-red-600 font-semibold' : days >= 3 ? 'text-amber-700 font-semibold' : 'text-slate-500');
const sortByAge = (list, sort) => [...list].sort((a, b) => {
  const ta = parseDbDate(a.createdAt)?.getTime() || 0;
  const tb = parseDbDate(b.createdAt)?.getTime() || 0;
  const diff = ta - tb || (Number(a.rawId ?? a.id) || 0) - (Number(b.rawId ?? b.id) || 0);
  return sort === 'newest' ? -diff : diff;
});

export default function AdminInquiries() {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

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
  const [view] = useUrlFilter('view', 'inquiries', ['inquiries', 'reservations']);
  const [searchQuery, setSearchQuery] = useState('');
  const statusFallback = view === 'inquiries' ? 'open' : 'all';
  const [statusFilter] = useUrlFilter('status', statusFallback, view === 'inquiries' ? INQUIRY_TABS : RESERVATION_TABS);
  const [sort, setSort] = useUrlFilter('sort', defaultSortFor(view, statusFilter), SORTS.map((s) => s.value));
  // A new tab starts with its own default order (one URL update for both keys).
  const setStatusFilter = (tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === statusFallback) next.delete('status'); else next.set('status', tab);
      next.delete('sort');
      return next;
    }, { replace: true });
  };

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

  // The prospect applies from their own account (an admin cannot file a rent
  // application, and the renter form is closed to admins): this records that the
  // inquiry moved on, and update_inquiry_status.php tells a prospect with an account.
  const convertToApplication = async (inquiry) => {
    const ok = await askConfirm(
      `Mark ${inquiry.fullName}'s inquiry as converted? Do this once they have started their rent application. It leaves the Open list.`,
      { title: 'Convert to application', confirmLabel: 'Yes, mark as converted', cancelLabel: 'Not yet', tone: 'primary' },
    );
    if (!ok) return;
    if (!detailErrors.validateAll({ admin_notes: notes }, ['admin_notes'])) return;
    const done = await updateInquiry({ id: inquiry.id, status: 'Converted', admin_notes: notes.trim() });
    if (done) setShowDetail(false);
  };

  // ─── Filtering ───
  const q = searchQuery.toLowerCase().trim();

  const filteredInquiries = sortByAge(inquiries.filter(i => {
    const matchesStatus = statusMatches(i, statusFilter);
    const matchesSearch = !q ||
      (i.fullName && i.fullName.toLowerCase().includes(q)) ||
      (i.email && i.email.toLowerCase().includes(q)) ||
      (i.contactNo && i.contactNo.toLowerCase().includes(q)) ||
      (i.unit && i.unit.toLowerCase().includes(q)) ||
      (i.message && i.message.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  }), sort);

  const filteredReservations = sortByAge(reservations.filter(r => {
    const matchesStatus = statusMatches(r, statusFilter);
    const matchesSearch = !q ||
      (r.reservedFor && r.reservedFor.toLowerCase().includes(q)) ||
      (r.unit && r.unit.toLowerCase().includes(q)) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.contactNo && r.contactNo.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  }), sort);


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
      Cancelled: 'bg-red-100 text-red-700',
    };
    return map[status] || 'bg-slate-100 text-slate-600';
  };

  const fmtDate = (v) => {
    const d = parseDbDate(v);
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  };
  const fmtDateTime = (v) => {
    const d = parseDbDate(v);
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  };

  const tabs = view === 'inquiries' ? INQUIRY_TABS : RESERVATION_TABS;
  // The status tabs carry the counts (a row of count cards used to repeat some of them).
  const tabSource = view === 'inquiries' ? inquiries : reservations;
  const tabCount = (tab) => tabSource.filter((x) => statusMatches(x, tab)).length;
  const tabLabel = (tab) => TAB_LABELS[tab] || tab.charAt(0).toUpperCase() + tab.slice(1);
  const shownCount = view === 'inquiries' ? filteredInquiries.length : filteredReservations.length;
  const noun = view === 'inquiries' ? (shownCount === 1 ? 'inquiry' : 'inquiries') : (shownCount === 1 ? 'reservation' : 'reservations');
  // "Showing 4 open inquiries, oldest first" (follows the tab, search and sort).
  // New = nobody has contacted them yet (marked on the row; was its own tab).
  const isNewInquiry = (inq) => (inq.status || '').toLowerCase() === 'new';
  const newCount = inquiries.filter(isNewInquiry).length;
  const shownNew = view === 'inquiries' ? filteredInquiries.filter(isNewInquiry).length : 0;
  const filterSummary = `${shownCount} ${statusFilter === 'all' ? '' : `${tabLabel(statusFilter).toLowerCase()} `}${noun}${q ? ` matching “${searchQuery.trim()}”` : ''}${shownNew ? ` (${shownNew} not contacted yet)` : ''}, ${sort === 'newest' ? 'newest' : 'oldest'} first`;
  const isOpenInquiry = (inq) => OPEN_STATUSES.includes((inq.status || '').toLowerCase());

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 text-left font-sans">
        <Header title="Inquiries & Reservations" />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* View switch + actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-card w-full sm:w-auto">
                {['inquiries', 'reservations'].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setSearchParams(prev => {
                        const next = new URLSearchParams(prev);
                        if (v === 'inquiries') next.delete('view');
                        else next.set('view', v);
                        next.delete('status');
                        return next;
                      }, { replace: true });
                    }}
                    className={`flex-1 sm:flex-none rounded-control px-4 py-2 text-label font-bold capitalize transition-all border-0 cursor-pointer ${
                      view === v ? 'bg-white text-slate-800 shadow-card' : 'bg-transparent text-slate-600 hover:text-slate-900'
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
                  className={btn('primary', 'sm', 'flex-1 sm:flex-none justify-center')}
                >
                  <FontAwesomeIcon icon={faPlus} /> Log Walk-in Inquiry
                </button>
                <button
                  type="button"
                  onClick={runExpirySweep}
                  className={btn('secondary', 'sm', 'flex-1 sm:flex-none justify-center')}
                  title="Release reservations whose hold period has lapsed"
                >
                  <FontAwesomeIcon icon={faHourglassHalf} /> Release Expired
                </button>
              </div>
            </div>

            {/* Search + status filter */}
            <div className={`${PANEL} p-3 sm:p-4 space-y-3`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-slate-200 bg-white px-3 h-10 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm shrink-0" aria-hidden="true" />
                  <input
                    maxLength={LIMITS.search}
                    type="search"
                    aria-label={view === 'inquiries' ? 'Search inquiries' : 'Search reservations'}
                    placeholder={view === 'inquiries' ? 'Search by name, email, phone, unit or message' : 'Search by name, unit or contact'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-body text-slate-800 placeholder-slate-400 outline-none focus-visible:outline-none focus-visible:ring-0 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {searchQuery && (
                    <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')} className="touch-compact flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-400 hover:text-slate-700 cursor-pointer">
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <SelectMenu
                    label="Sort by date received"
                    value={sort}
                    onChange={setSort}
                    options={SORTS}
                    className="flex-1 sm:w-44 sm:flex-none"
                  />
                  <button
                    type="button"
                    onClick={() => { fetchData(); fetchSupporting(); }}
                    className={btn('secondary', 'md', 'w-10 shrink-0 px-0 text-slate-500 hover:text-indigo-600')}
                    title="Refresh"
                    aria-label="Refresh"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <FilterTabs
                label="Filter by status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={tabs.map(t => ({ value: t, label: tabLabel(t), count: loading || error ? null : tabCount(t), dot: view === 'inquiries' && t === 'open' && newCount > 0 }))}
              />
              {!loading && !error && (
                <p className="m-0 text-caption text-slate-500" aria-live="polite">Showing {filterSummary}.</p>
              )}
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
              <div className="overflow-x-auto">
                {view === 'inquiries' ? (
                  <table className="w-full min-w-[850px] text-left text-body">
                    <thead className={THEAD}>
                      <tr>
                        <th className={TH}>Prospect</th>
                        <th className={TH}>Unit of Interest</th>
                        <th className={TH}>Preferred Move-In</th>
                        <th className={TH}>Source</th>
                        <th className={TH}>Received</th>
                        <th className={`${TH} text-center`}>Status</th>
                        <th className={`${TH} text-right`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="stagger-children divide-y divide-slate-100">
                      {loading ? (
                        <SkeletonRows cols={7} label="Loading inquiries…" />
                      ) : error ? (
                        <LoadErrorRow cols={7} title="Couldn't load inquiries" detail={error} onRetry={fetchData} />
                      ) : filteredInquiries.length === 0 ? (
                        <tr><td colSpan="7" className="px-5 py-12 text-center">
                          <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                            <FontAwesomeIcon icon={statusFilter === 'open' && !q ? faCheckCircle : faEnvelopeOpenText} className={`text-2xl shrink-0 ${statusFilter === 'open' && !q ? 'text-emerald-400' : 'text-slate-300'}`} aria-hidden="true" />
                            <span className="text-body font-medium text-slate-600">
                              {q ? 'No inquiries match your search.' : statusFilter === 'open' ? 'All caught up: no open inquiries.' : `No ${tabLabel(statusFilter).toLowerCase()} inquiries.`}
                            </span>
                            {statusFilter !== 'all' && inquiries.length > 0 && (
                              <button type="button" onClick={() => setStatusFilter('all')} className={btn('link')}>Show all {inquiries.length} inquiries</button>
                            )}
                          </div>
                        </td></tr>
                      ) : (
                        filteredInquiries.map(inq => (
                          <tr key={inq.id} className={`transition-colors ${isNewInquiry(inq) ? 'bg-indigo-50/40 hover:bg-indigo-50/70 shadow-[inset_3px_0_0_var(--color-indigo-500)]' : 'hover:bg-slate-50/70'}`}>
                            <td className="px-5 py-4">
                              <p className="font-bold text-slate-800 m-0 flex items-center gap-2">
                                {isNewInquiry(inq) && <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />}
                                <span className="min-w-0">{inq.fullName}</span>
                                {isNewInquiry(inq) && <span className="sr-only">(not contacted yet)</span>}
                              </p>
                              <span className="flex items-center gap-1 text-label text-slate-500 mt-0.5">
                                <FontAwesomeIcon icon={faEnvelope} className="text-[10px] text-indigo-500" />
                                {inq.email}
                              </span>
                              <span className="flex items-center gap-1 text-label text-slate-500 mt-0.5">
                                <FontAwesomeIcon icon={faPhone} className="text-[10px] text-indigo-500" />
                                {inq.contactNo}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {inq.unit ? (
                                <span className="inline-flex items-center gap-1 text-label font-bold text-slate-700">
                                  <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-indigo-500" />
                                  Unit {inq.unit}
                                </span>
                              ) : (
                                <span className="text-label text-slate-500 italic">Any available</span>
                              )}
                              {inq.occupants && (
                                <p className="text-caption text-slate-500 m-0 mt-0.5">{inq.occupants} occupant(s)</p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-label text-slate-600">{fmtDate(inq.preferredMoveIn)}</td>
                            <td className="px-4 py-4">
                              <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-slate-100 text-slate-600 capitalize">{inq.source}</span>
                              {inq.matchedThreadId && (
                                <span className="mt-1 block rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 w-fit" title={`Same email or phone as conversation #${inq.matchedThreadId}. The sender's identity is not verified.`}>
                                  Sender not verified
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <p className="m-0 text-label text-slate-700">{fmtDate(inq.createdAt)}</p>
                              {/* How long it has waited, only while it is still open. */}
                              {isOpenInquiry(inq) && daysSince(inq.createdAt) !== null && (
                                <p className={`m-0 mt-0.5 text-caption ${ageTone(daysSince(inq.createdAt))}`}>
                                  {ageText(daysSince(inq.createdAt))}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${inquiryBadge(inq.status)}`}>
                                {inq.status}
                              </span>
                              {inq.status === 'Closed' && inq.closedReason && (
                                <p className="m-0 mt-1 mx-auto max-w-[11rem] truncate text-caption text-slate-500" title={inq.closedReason}>{inq.closedReason}</p>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => openDetail(inq)}
                                aria-label={`Manage inquiry from ${inq.fullName}`}
                                className={btn('secondary', 'sm')}
                              >
                                {isOpenInquiry(inq) ? 'Manage' : 'View'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[850px] text-left text-body">
                    <thead className={THEAD}>
                      <tr>
                        <th className={TH}>Unit</th>
                        <th className={TH}>Reserved For</th>
                        <th className={TH}>Reserved On</th>
                        <th className={TH}>Hold Expires</th>
                        <th className={TH}>Fee</th>
                        <th className={`${TH} text-center`}>Status</th>
                        <th className={`${TH} text-right`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="stagger-children divide-y divide-slate-100">
                      {loading ? (
                        <SkeletonRows cols={7} label="Loading reservations…" />
                      ) : error ? (
                        <LoadErrorRow cols={7} title="Couldn't load reservations" detail={error} onRetry={fetchData} />
                      ) : filteredReservations.length === 0 ? (
                        <tr><td colSpan="7" className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-slate-500">
                            <FontAwesomeIcon icon={faBookmark} className="text-xl text-slate-300 shrink-0" />
                            <span className="text-body text-slate-600">{q ? 'No reservations match your search.' : 'No reservations found.'}</span>
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
                              <p className="text-caption text-slate-500 m-0 mt-0.5">{res.roomType || '—'}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-semibold text-slate-700 m-0">{res.reservedFor}</p>
                              <p className="text-caption text-slate-500 m-0 mt-0.5">{res.contactNo || res.email || '—'}</p>
                            </td>
                            <td className="px-4 py-4 text-label text-slate-500">{fmtDate(res.createdAt)}</td>
                            <td className="px-4 py-4">
                              <p className="text-label font-semibold text-slate-700 m-0">{fmtDate(res.holdExpiresAt)}</p>
                              {res.status === 'Active' && (
                                <p className={`text-caption m-0 mt-0.5 font-bold ${Number(res.daysRemaining) <= 2 ? 'text-red-600' : 'text-slate-500'}`}>
                                  {Number(res.daysRemaining) < 0
                                    ? 'Lapsed'
                                    : Number(res.daysRemaining) === 0
                                      ? 'Expires today'
                                      : `${res.daysRemaining} day(s) left`}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-label font-semibold text-slate-700">
                              {Number(res.reservationFee) > 0 ? `₱${Number(res.reservationFee).toLocaleString()}` : '—'}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${reservationBadge(res.status)}`}>
                                {res.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              {res.status === 'Active' ? (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => markReservation(res.id, 'Converted')}
                                    className="rounded-control bg-emerald-50 px-2.5 py-1.5 text-label font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer"
                                    title="Mark as converted to an application"
                                  >
                                    <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Converted
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReasonFor({ kind: 'cancelHold', id: res.id })}
                                    className="rounded-control bg-red-50 px-2.5 py-1.5 text-label font-bold text-red-700 hover:bg-red-100 transition-colors border-0 cursor-pointer"
                                    title="Cancel hold and release the unit"
                                  >
                                    <FontAwesomeIcon icon={faBan} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-label font-medium italic text-slate-500">
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
        <Modal title={`${selected.fullName}`} onClose={() => setShowDetail(false)} overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" className="bg-white rounded-card shadow-dialog w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 bg-slate-50">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-title font-bold text-slate-800 m-0 truncate">{selected.fullName}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${inquiryBadge(selected.status)}`}>{selected.status}</span>
                </div>
                <p className="text-label text-slate-500 m-0 mt-0.5">
                  Received {fmtDate(selected.createdAt)}
                  {isOpenInquiry(selected) && daysSince(selected.createdAt) !== null && (
                    <span className={ageTone(daysSince(selected.createdAt))}> ({ageText(daysSince(selected.createdAt)).toLowerCase()})</span>
                  )}
                  {' · '}{selected.unit ? `Unit ${selected.unit}` : 'Any available unit'}
                  {selected.source ? <span className="capitalize"> · {selected.source}</span> : null}
                </p>
              </div>
              <button aria-label="Close" onClick={() => setShowDetail(false)} className="btn-interactive shrink-0 text-slate-500 hover:text-slate-600 p-1 rounded-control hover:bg-slate-100 border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} className="text-base" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-5">

              {actionError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-card text-body font-medium">
                  {actionError}
                </div>
              )}

              {selected.status === 'Closed' && (
                <div role="note" className="flex items-start gap-3 rounded-card border border-slate-200 bg-white p-3.5">
                  <FontAwesomeIcon icon={faBan} className="mt-0.5 text-slate-400" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="m-0 text-label font-semibold text-slate-700">This inquiry is closed</p>
                    <p className="m-0 mt-0.5 text-label text-slate-600">{selected.closedReason ? `Reason: ${selected.closedReason}` : 'No reason was recorded.'}</p>
                    <p className="m-0 mt-1 text-caption text-slate-500">Mark it contacted or schedule a viewing to reopen it.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white rounded-card p-3.5 border border-slate-200">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faEnvelope} className="mr-1" /> Email</p>
                  {selected.email
                    ? <a href={`mailto:${selected.email}`} className="block text-body font-semibold text-slate-800 m-0 break-all no-underline hover:text-indigo-700">{selected.email}</a>
                    : <p className="text-body font-semibold text-slate-800 m-0">—</p>}
                </div>
                <div className="bg-white rounded-card p-3.5 border border-slate-200">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faPhone} className="mr-1" /> Contact</p>
                  {selected.contactNo
                    ? <a href={`tel:${String(selected.contactNo).replace(/\s+/g, '')}`} className="block text-body font-semibold text-slate-800 m-0 no-underline hover:text-indigo-700">{selected.contactNo}</a>
                    : <p className="text-body font-semibold text-slate-800 m-0">—</p>}
                </div>
                <div className="bg-white rounded-card p-3.5 border border-slate-200">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faCalendarAlt} className="mr-1" /> Preferred Move-In</p>
                  <p className="text-body font-semibold text-slate-800 m-0">{fmtDate(selected.preferredMoveIn)}</p>
                </div>
                <div className="bg-white rounded-card p-3.5 border border-slate-200">
                  <p className="text-label font-medium text-slate-600 mb-1 m-0 capitalize"><FontAwesomeIcon icon={faUsers} className="mr-1" /> Occupants</p>
                  <p className="text-body font-semibold text-slate-800 m-0">{selected.occupants || '—'}</p>
                </div>
              </div>

              {selected.message && (
                <div className="bg-white rounded-card p-4 border border-slate-200">
                  <p className="text-label font-medium text-slate-600 mb-1.5 m-0 capitalize"><FontAwesomeIcon icon={faComment} className="mr-1" /> Message</p>
                  <p className="text-body text-slate-700 m-0 whitespace-pre-wrap">{selected.message}</p>
                </div>
              )}

              {selected.viewingDate && (
                <div className="bg-amber-50 border border-amber-200 rounded-card p-3.5 text-amber-800 text-body font-medium">
                  Viewing scheduled for {fmtDateTime(selected.viewingDate)}
                </div>
              )}

              <div className="bg-white rounded-card p-4 border border-slate-200 space-y-3">
                <label htmlFor="inquiry-detail-admin_notes" className="text-label font-medium text-slate-600 block">Admin Notes</label>
                <textarea
                  rows="3"
                  {...detailErrors.fieldA11y('admin_notes')}
                  value={notes}
                  maxLength={LIMITS.notes}
                  onChange={(e) => { setNotes(e.target.value); detailErrors.clearError('admin_notes'); }}
                  onBlur={() => { const v = notes.trim(); setNotes(v); detailErrors.validateField('admin_notes', { admin_notes: v }); }}
                  placeholder="Record what was discussed, follow-up dates, or screening notes..."
                  className={`w-full rounded-control border border-slate-200 bg-slate-50 p-3 text-body text-slate-800 outline-none focus:border-indigo-500 focus:bg-white resize-y${invalidCls(detailErrors.errors.admin_notes)}`}
                />
                <FieldError id="inquiry-detail-admin_notes" error={detailErrors.errors.admin_notes} />
                <CharCount value={notes} max={LIMITS.notes} />

                <label htmlFor="inquiry-detail-viewing_date" className="text-label font-medium text-slate-600 block">Viewing Schedule</label>
                <input
                  type="datetime-local"
                  {...detailErrors.fieldA11y('viewing_date')}
                  min={`${localDateString()}T${localTimeString()}`}
                  max={`${maxFutureDate()}T23:59`}
                  value={viewingDate}
                  onChange={(e) => { setViewingDate(e.target.value); detailErrors.clearError('viewing_date'); }}
                  onBlur={() => viewingDate && detailErrors.validateField('viewing_date', { viewing_date: viewingDate })}
                  className={`w-full rounded-control border border-slate-200 bg-slate-50 p-3 text-body text-slate-800 outline-none focus:border-indigo-500 focus:bg-white${invalidCls(detailErrors.errors.viewing_date)}`}
                />
                <FieldError id="inquiry-detail-viewing_date" error={detailErrors.errors.viewing_date} />
              </div>

              {selected.matchedThreadId && (
                <p role="note" className="rounded-card border border-amber-200 bg-amber-50 p-3 text-label text-amber-900">
                  Same email or phone as conversation #{selected.matchedThreadId}, but the sender is not verified: anyone can type an email or phone number.
                  It was not added to that conversation. The owner of that conversation was emailed a link to it; do not share their details here.
                </p>
              )}

              {/* Pipeline actions */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate(`/admin-messages?guest_thread_id=${encodeURIComponent(selected.matchedThreadId || selected.rawId || selected.id)}`)}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-card bg-indigo-50 border border-indigo-200 px-4 py-3 text-label font-bold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                  <FontAwesomeIcon icon={faComment} /> Chat / Message
                </button>

                <button
                  type="button"
                  disabled={!!busy}
                  onClick={async () => {
                    if (!detailErrors.validateAll({ admin_notes: notes }, ['admin_notes'])) return;
                    const ok = await updateInquiry({ id: selected.id, status: 'Contacted', admin_notes: notes.trim() });
                    if (ok) setShowDetail(false);
                  }}
                  className="flex items-center justify-center gap-2 rounded-card bg-sky-50 border border-sky-200 px-4 py-3 text-label font-bold text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="flex items-center justify-center gap-2 rounded-card bg-amber-50 border border-amber-200 px-4 py-3 text-label font-bold text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faCalendarAlt} /> Schedule Viewing
                </button>

                <button
                  type="button"
                  onClick={() => { setActionError(null); reserveErrors.setErrors({}); setShowReserveModal(true); }}
                  disabled={selected.status === 'Reserved'}
                  className="flex items-center justify-center gap-2 rounded-card bg-violet-50 border border-violet-200 px-4 py-3 text-label font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <FontAwesomeIcon icon={faBookmark} /> Reserve Unit
                </button>

                <button
                  type="button"
                  onClick={() => convertToApplication(selected)}
                  disabled={!!busy || selected.status === 'Converted'}
                  className="flex items-center justify-center gap-2 rounded-card bg-emerald-50 border border-emerald-200 px-4 py-3 text-label font-bold text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faArrowRight} /> Convert to Application
                </button>
              </div>

              {!['Converted', 'Closed'].includes(selected.status) && (
                <div className="bg-white rounded-card p-4 border border-slate-200 space-y-2">
                  <label className="text-label font-medium text-slate-600 block capitalize">
                    <FontAwesomeIcon icon={faListOl} className="mr-1" /> Waitlist for an occupied unit
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={waitlistRoom}
                      onChange={(e) => setWaitlistRoom(e.target.value)}
                      className="flex-1 rounded-control border border-slate-200 bg-slate-50 p-2.5 text-body text-slate-800 outline-none focus:border-indigo-500"
                    >
                      <option value="">Select a unit…</option>
                      {occupiedRooms.map(r => (
                        <option key={r.id} value={r.id}>Room {r.id} — {r.status}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addToWaitlist}
                      className="rounded-control bg-indigo-50 border border-indigo-200 px-4 py-2 text-label font-bold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                    >
                      Add to waitlist
                    </button>
                  </div>
                  {waitlistMsg && (
                    <p className={`text-label font-semibold m-0 ${waitlistMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{waitlistMsg.text}</p>
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
                  className={btn('primary', 'md', 'flex-1')}
                >
                  {busy === 'inquiry' ? 'Saving…' : 'Save Notes'}
                </button>
                {selected.status !== 'Closed' && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => {
                      if (!detailErrors.validateAll({ admin_notes: notes }, ['admin_notes'])) return;
                      setReasonFor({ kind: 'closeInquiry', id: selected.id });
                    }}
                    className={btn('danger-outline', 'md', 'flex-1')}
                  >
                    <FontAwesomeIcon icon={faBan} /> Close Inquiry
                  </button>
                )}
              </div>
            </div>
          </Modal>
      )}

      {/* ─── RESERVE UNIT MODAL ─── */}
      {showReserveModal && selected && (
        <Modal busy={!!busy} title="Reserve a Unit" onClose={() => setShowReserveModal(false)} as="form" overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" className="bg-white rounded-card shadow-dialog w-full max-w-md overflow-hidden" onSubmit={submitReservation} noValidate>
            <div className="px-6 py-5 flex items-center justify-between text-white bg-gradient-to-r from-violet-600 to-violet-800">
              <h3 className="text-title font-bold m-0">Reserve a Unit</h3>
              <button type="button" aria-label="Close" onClick={() => setShowReserveModal(false)} className="text-white hover:bg-white/20 p-2 rounded-card border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50">
              {actionError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-card text-body font-medium">
                  {actionError}
                </div>
              )}

              <p className="text-body text-slate-600 m-0">
                Holding a unit for <strong className="text-slate-800">{selected.fullName}</strong>. The unit is marked
                <strong className="text-violet-700"> Reserved</strong> and hidden from the public listing until the hold expires.
              </p>

              <div>
                <label htmlFor="reserve-room_name" className="text-label font-medium text-slate-600 block mb-1.5">Unit (vacant only)</label>
                <select
                  {...reserveErrors.fieldA11y('room_name')}
                  value={resRoom}
                  onChange={(e) => { setResRoom(e.target.value); reserveErrors.clearError('room_name'); }}
                  className={`w-full rounded-control border border-slate-200 bg-white p-3 text-body text-slate-800 outline-none focus:border-violet-500${invalidCls(reserveErrors.errors.room_name)}`}
                >
                  <option value="" disabled>Select a unit...</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>Room {r.id} — {r.type} (₱{Number(r.rent).toLocaleString()}/mo)</option>
                  ))}
                </select>
                <FieldError id="reserve-room_name" error={reserveErrors.errors.room_name} />
                {rooms.length === 0 && (
                  <p className="text-label text-amber-700 font-medium mt-1.5 m-0">No vacant units are available to reserve.</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reserve-hold_days" className="text-label font-medium text-slate-600 block mb-1.5">Hold Period (days)</label>
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
                    className={`w-full rounded-control border border-slate-200 bg-white p-3 text-body text-slate-800 outline-none focus:border-violet-500${invalidCls(reserveErrors.errors.hold_days)}`}
                  />
                  <FieldError id="reserve-hold_days" error={reserveErrors.errors.hold_days} />
                </div>
                <div>
                  <label htmlFor="reserve-reservation_fee" className="text-label font-medium text-slate-600 block mb-1.5">Reservation Fee (₱)</label>
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
                    className={`w-full rounded-control border border-slate-200 bg-white p-3 text-body text-slate-800 outline-none focus:border-violet-500${invalidCls(reserveErrors.errors.reservation_fee)}`}
                  />
                  <FieldError id="reserve-reservation_fee" error={reserveErrors.errors.reservation_fee} />
                </div>
              </div>

              <div>
                <label htmlFor="reserve-notes" className="text-label font-medium text-slate-600 block mb-1.5">Notes</label>
                <textarea
                  rows="2"
                  {...reserveErrors.fieldA11y('notes')}
                  value={resNotes}
                  maxLength={LIMITS.notes}
                  onChange={(e) => { setResNotes(e.target.value); reserveErrors.clearError('notes'); }}
                  onBlur={() => { const v = resNotes.trim(); setResNotes(v); reserveErrors.validateField('notes', { ...reserveValues(), notes: v }); }}
                  placeholder="Terms agreed, deposit arrangement, etc."
                  className={`w-full rounded-control border border-slate-200 bg-white p-3 text-body text-slate-800 outline-none focus:border-violet-500 resize-y${invalidCls(reserveErrors.errors.notes)}`}
                />
                <FieldError id="reserve-notes" error={reserveErrors.errors.notes} />
                <CharCount value={resNotes} max={LIMITS.notes} />
              </div>

              <button
                type="submit"
                disabled={!!busy}
                className="w-full rounded-card bg-violet-600 px-4 py-3.5 text-body font-bold text-white hover:bg-violet-700 transition-colors border-0 cursor-pointer shadow-raised disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy === 'reserve' ? 'Placing hold…' : 'Place Hold'}
              </button>
            </div>
          </Modal>
      )}

      {/* ─── LOG WALK-IN / PHONE INQUIRY MODAL ─── */}
      {showLogModal && (
        <Modal busy={!!busy} title="Log an Inquiry" onClose={() => setShowLogModal(false)} as="form" overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" className="bg-white rounded-card shadow-dialog w-full max-w-md overflow-hidden" onSubmit={submitLoggedInquiry} noValidate>
            <div className="px-6 py-5 flex items-center justify-between text-white bg-gradient-to-r from-indigo-600 to-indigo-800">
              <h3 className="text-title font-bold m-0">Log an Inquiry</h3>
              <button type="button" aria-label="Close" onClick={() => setShowLogModal(false)} className="text-white hover:bg-white/20 p-2 rounded-card border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50 max-h-[70vh] overflow-y-auto">
              {actionError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-card text-body font-medium">
                  {actionError}
                </div>
              )}

              <p className="text-body text-slate-600 m-0">Record an inquiry that came in by phone or at the office.</p>

              <div>
                <label className="text-label font-medium text-slate-600 block mb-1.5">Source</label>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-card">
                  {['walk-in', 'phone'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLogForm({ ...logForm, source: s })}
                      className={`flex-1 rounded-control px-3 py-2 text-label font-bold capitalize transition-all border-0 cursor-pointer ${
                        logForm.source === s ? 'bg-white text-slate-800 shadow-card' : 'bg-transparent text-slate-600'
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
                  <label htmlFor={`log-${field.key}`} className="text-label font-medium text-slate-600 block mb-1.5 capitalize">{field.label}</label>
                  {field.type === 'tel' ? (
                    <PhoneInput
                      id="log-contact_no"
                      name="contact_no"
                      value={logForm.contact_no}
                      onChange={(digits) => setLogField('contact_no', digits)}
                      onBlur={() => blurLogField('contact_no')}
                      error={logErrors.errors.contact_no}
                      inputClassName={`w-full rounded-r-control border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-500${invalidCls(logErrors.errors.contact_no)}`}
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
                        className={`w-full rounded-control border border-slate-200 bg-white p-3 text-body text-slate-800 outline-none focus:border-indigo-500${invalidCls(logErrors.errors[field.key])}`}
                      />
                      <FieldError id={`log-${field.key}`} error={logErrors.errors[field.key]} />
                    </>
                  )}
                </div>
              ))}

              <div>
                <label htmlFor="log-room_name" className="text-label font-medium text-slate-600 block mb-1.5">Unit of Interest</label>
                <select
                  {...logErrors.fieldA11y('room_name')}
                  value={logForm.room_name}
                  onChange={(e) => setLogField('room_name', e.target.value)}
                  className={`w-full rounded-control border border-slate-200 bg-white p-3 text-body text-slate-800 outline-none focus:border-indigo-500${invalidCls(logErrors.errors.room_name)}`}
                >
                  <option value="">No specific unit</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>Room {r.id} — {r.type}</option>
                  ))}
                </select>
                <FieldError id="log-room_name" error={logErrors.errors.room_name} />
              </div>

              <div>
                <label htmlFor="log-message" className="text-label font-medium text-slate-600 block mb-1.5">What did they ask?</label>
                <textarea
                  rows="3"
                  {...logErrors.fieldA11y('message')}
                  value={logForm.message}
                  maxLength={LIMITS.message}
                  onChange={(e) => setLogField('message', e.target.value)}
                  onBlur={() => blurLogField('message')}
                  placeholder="Summarize the inquiry..."
                  className={`w-full rounded-control border border-slate-200 bg-white p-3 text-body text-slate-800 outline-none focus:border-indigo-500 resize-y${invalidCls(logErrors.errors.message)}`}
                />
                <FieldError id="log-message" error={logErrors.errors.message} />
                <CharCount value={logForm.message} max={LIMITS.message} />
              </div>

              <button
                type="submit"
                disabled={!!busy}
                className={btn('primary', 'md', 'w-full')}
              >
                {busy === 'log' ? 'Saving…' : 'Save Inquiry'}
              </button>
            </div>
          </Modal>
      )}

      {reasonFor && (
        <ReasonModal
          title={reasonFor.kind === 'cancelHold' ? 'Cancel Hold' : 'Close Inquiry'}
          description={reasonFor.kind === 'cancelHold'
            ? 'The unit is released and becomes available again.'
            : `${selected?.fullName || 'The prospect'}'s inquiry moves to Closed. If they have an account, they are notified with this reason.`}
          label={reasonFor.kind === 'cancelHold' ? 'Reason for cancelling this hold' : 'Reason for closing this inquiry'}
          placeholder="Pick a common reason above, or type your own"
          suggestions={reasonFor.kind === 'cancelHold' ? CANCEL_HOLD_REASONS : CLOSE_REASONS}
          confirmLabel={reasonFor.kind === 'cancelHold' ? 'Cancel Hold' : 'Close Inquiry'}
          onConfirm={confirmReason}
          onClose={() => setReasonFor(null)}
        />
      )}
    </div>
  );
}
