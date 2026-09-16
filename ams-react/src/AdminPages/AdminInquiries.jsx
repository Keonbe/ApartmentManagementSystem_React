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
  const [logForm, setLogForm] = useState({ full_name: '', contact_no: '', email: '', room_name: '', message: '', source: 'walk-in' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    fetchData();
    fetchSupporting();
  }, [fetchData, fetchSupporting]);

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

  const updateInquiry = async (payload) => {
    setActionError(null);
    try {
      const res = await api.post('update_inquiry_status.php', payload);
      if (!res.data.success) {
        setActionError(res.data.message || 'Failed to update inquiry.');
        return false;
      }
      await fetchData();
      return true;
    } catch (err) {
      console.error('Error updating inquiry:', err);
      setActionError('Server error updating the inquiry.');
      return false;
    }
  };

  const updateReservation = async (id, status, reason = '') => {
    setActionError(null);
    try {
      const res = await api.post('update_reservation_status.php', { id, status, reason });
      if (!res.data.success) {
        alert(res.data.message || 'Failed to update reservation.');
        return;
      }
      await fetchData();
      await fetchSupporting();
    } catch (err) {
      console.error('Error updating reservation:', err);
      alert('Server error updating the reservation.');
    }
  };

  const submitReservation = async () => {
    setActionError(null);
    if (!resRoom) {
      setActionError('Select a unit to reserve.');
      return;
    }
    try {
      const res = await api.post('create_reservation.php', {
        inquiry_id: selected?.id,
        room_name: resRoom,
        reserved_for_name: selected?.fullName || '',
        contact_no: selected?.contactNo || '',
        email: selected?.email || '',
        hold_days: resHoldDays,
        reservation_fee: resFee,
        notes: resNotes,
      });
      if (!res.data.success) {
        setActionError(res.data.message || 'Failed to create the reservation.');
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
      setActionError('Server error creating the reservation.');
    }
  };

  const submitLoggedInquiry = async () => {
    setActionError(null);
    if (!logForm.full_name.trim() || !logForm.contact_no.trim() || !logForm.email.trim()) {
      setActionError('Name, contact number, and email are required.');
      return;
    }
    try {
      const res = await api.post('submit_inquiry.php', logForm);
      if (!res.data.success) {
        setActionError(res.data.message || 'Failed to log the inquiry.');
        return;
      }
      setShowLogModal(false);
      setLogForm({ full_name: '', contact_no: '', email: '', room_name: '', message: '', source: 'walk-in' });
      fetchData();
    } catch (err) {
      console.error('Error logging inquiry:', err);
      setActionError('Server error logging the inquiry.');
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Total Inquiries</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <FontAwesomeIcon icon={faEnvelopeOpenText} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-indigo-950 m-0">{inquiries.length}</p>
                <p className="mt-1 text-xs text-indigo-600 font-medium m-0">All time</p>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Needs Response</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <FontAwesomeIcon icon={faClock} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-amber-950 m-0">{newCount}</p>
                <p className="mt-1 text-xs text-amber-600 font-medium m-0">Not yet contacted</p>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Units on Hold</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                    <FontAwesomeIcon icon={faBookmark} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-violet-950 m-0">{activeHolds}</p>
                <p className="mt-1 text-xs text-violet-600 font-medium m-0">Active reservations</p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
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
                  onClick={() => { setActionError(null); setShowLogModal(true); }}
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
                  <input
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
                    <tbody className="divide-y divide-slate-100">
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
                    <tbody className="divide-y divide-slate-100">
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
                                    onClick={() => updateReservation(res.id, 'Converted')}
                                    className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer"
                                    title="Mark as converted to an application"
                                  >
                                    <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Converted
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const reason = prompt('Reason for cancelling this hold:');
                                      if (reason === null) return;
                                      updateReservation(res.id, 'Cancelled', reason);
                                    }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowDetail(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

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
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Admin Notes</label>
                <textarea
                  rows="3"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record what was discussed, follow-up dates, or screening notes..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white resize-y"
                />

                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Viewing Schedule</label>
                <input
                  type="datetime-local"
                  value={viewingDate}
                  onChange={(e) => setViewingDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Pipeline actions */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await updateInquiry({ id: selected.id, status: 'Contacted', admin_notes: notes });
                    if (ok) setShowDetail(false);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 text-xs font-bold text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                >
                  <FontAwesomeIcon icon={faPhone} /> Mark Contacted
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!viewingDate) {
                      setActionError('Pick a viewing date and time first.');
                      return;
                    }
                    const ok = await updateInquiry({ id: selected.id, status: 'Scheduled', admin_notes: notes, viewing_date: viewingDate.replace('T', ' ') + ':00' });
                    if (ok) setShowDetail(false);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  <FontAwesomeIcon icon={faCalendarAlt} /> Schedule Viewing
                </button>

                <button
                  type="button"
                  onClick={() => { setActionError(null); setShowReserveModal(true); }}
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
                  onClick={async () => {
                    const ok = await updateInquiry({ id: selected.id, status: selected.status, admin_notes: notes });
                    if (ok) setShowDetail(false);
                  }}
                  className="flex-1 rounded-xl bg-slate-800 px-4 py-3 text-xs font-bold text-white hover:bg-slate-900 transition-colors border-0 cursor-pointer"
                >
                  Save Notes
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const reason = prompt('Reason for closing this inquiry:');
                    if (reason === null) return;
                    const ok = await updateInquiry({ id: selected.id, status: 'Closed', admin_notes: notes, closed_reason: reason });
                    if (ok) setShowDetail(false);
                  }}
                  className="flex-1 rounded-xl bg-white border-2 border-rose-200 px-4 py-3 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowReserveModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-center justify-between text-white bg-gradient-to-r from-violet-600 to-violet-800">
              <h3 className="text-lg font-bold m-0">Reserve a Unit</h3>
              <button onClick={() => setShowReserveModal(false)} className="text-white hover:bg-white/20 p-2 rounded-xl border-0 bg-transparent cursor-pointer">
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
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Unit (vacant only)</label>
                <select
                  value={resRoom}
                  onChange={(e) => setResRoom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500"
                >
                  <option value="">Select a unit...</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>Room {r.id} — {r.type} (₱{Number(r.rent).toLocaleString()}/mo)</option>
                  ))}
                </select>
                {rooms.length === 0 && (
                  <p className="text-xs text-amber-600 font-medium mt-1.5 m-0">No vacant units are available to reserve.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Hold Period (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={resHoldDays}
                    onChange={(e) => setResHoldDays(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Reservation Fee (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={resFee}
                    onChange={(e) => setResFee(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Notes</label>
                <textarea
                  rows="2"
                  value={resNotes}
                  onChange={(e) => setResNotes(e.target.value)}
                  placeholder="Terms agreed, deposit arrangement, etc."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500 resize-y"
                />
              </div>

              <button
                type="button"
                onClick={submitReservation}
                className="w-full rounded-xl bg-violet-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-violet-700 transition-colors border-0 cursor-pointer shadow-md"
              >
                Place Hold
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── LOG WALK-IN / PHONE INQUIRY MODAL ─── */}
      {showLogModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowLogModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-center justify-between text-white bg-gradient-to-r from-indigo-600 to-indigo-800">
              <h3 className="text-lg font-bold m-0">Log an Inquiry</h3>
              <button onClick={() => setShowLogModal(false)} className="text-white hover:bg-white/20 p-2 rounded-xl border-0 bg-transparent cursor-pointer">
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
                { key: 'full_name', label: 'Full Name', type: 'text', placeholder: 'e.g. Juan Dela Cruz' },
                { key: 'contact_no', label: 'Contact Number', type: 'tel', placeholder: 'e.g. 0917 123 4567' },
                { key: 'email', label: 'Email Address', type: 'email', placeholder: 'e.g. juan@email.com' },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{field.label}</label>
                  <input
                    type={field.type}
                    value={logForm[field.key]}
                    onChange={(e) => setLogForm({ ...logForm, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>
              ))}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Unit of Interest</label>
                <select
                  value={logForm.room_name}
                  onChange={(e) => setLogForm({ ...logForm, room_name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-500"
                >
                  <option value="">No specific unit</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>Room {r.id} — {r.type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">What did they ask?</label>
                <textarea
                  rows="3"
                  value={logForm.message}
                  onChange={(e) => setLogForm({ ...logForm, message: e.target.value })}
                  placeholder="Summarize the inquiry..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-500 resize-y"
                />
              </div>

              <button
                type="button"
                onClick={submitLoggedInquiry}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors border-0 cursor-pointer shadow-md"
              >
                Save Inquiry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
