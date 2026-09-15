import React, { useState, useEffect, useCallback } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCar, faCheck, faTimes, faSearch, faSync,
  faClock, faTimesCircle, faBuilding, faEye, faReceipt, faParking, faUnlock, faFileInvoiceDollar
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';

const STATUS_BADGE = {
  Pending: 'bg-amber-100 text-amber-700',
  Assigned: 'bg-emerald-100 text-emerald-700',
  Released: 'bg-slate-100 text-slate-600',
  Rejected: 'bg-red-100 text-red-700',
  Cancelled: 'bg-slate-100 text-slate-500',
};

const TABS = ['all', 'Pending', 'Assigned', 'Released', 'Rejected', 'Cancelled'];

const peso = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const monthLabel = (period) => {
  const d = new Date(`${period}-01T00:00:00`);
  return isNaN(d) ? period : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export default function AdminParking() {
  const [reservations, setReservations] = useState([]);
  const [capacity, setCapacity] = useState({ max_slots: 0, taken_slots: [], occupied_count: 0, available_slots: 0 });
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [billingMode, setBillingMode] = useState('manual');
  const [currentPeriod, setCurrentPeriod] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);

  // { mode: 'assign' | 'reject' | 'release', reservation, slot, reason }
  const [dialog, setDialog] = useState(null);

  const fetchParkingReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('get_parking_reservations.php');
      if (res.data.success) {
        setReservations(res.data.reservations || []);
        setCapacity(res.data.capacity);
        setMonthlyFee(res.data.monthly_fee);
        setBillingMode(res.data.billing_mode);
        setCurrentPeriod(res.data.current_period);
      } else {
        setError(res.data.message || 'Failed to fetch parking reservations.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load parking reservations. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchParkingReservations(); }, [fetchParkingReservations]);

  const freeSlots = Array.from({ length: capacity.max_slots }, (_, i) => i + 1)
    .filter(n => !capacity.taken_slots.includes(n));

  const openDialog = (mode, reservation) => {
    setNotice(null);
    setDialog({ mode, reservation, slot: mode === 'assign' ? (freeSlots[0] ?? '') : '', reason: '' });
  };

  // The server's message is shown as-is: it explains a full lot, a taken slot or
  // an invalid transition. A 409 used to surface as "Server error updating status."
  const submitDialog = async () => {
    const { mode, reservation, slot, reason } = dialog;
    const status = { assign: 'Assigned', reject: 'Rejected', release: 'Released' }[mode];
    setBusyId(reservation.id);
    try {
      const res = await api.post('update_parking_status.php', {
        id: reservation.id,
        status,
        slotNumber: mode === 'assign' ? Number(slot) : undefined,
        reason: mode !== 'assign' ? reason.trim() : undefined,
      });
      const billing = res.data.billing;
      setNotice({
        ok: true,
        text: res.data.message + (billing ? ` ${billing.message}` : ''),
      });
      setDialog(null);
      fetchParkingReservations();
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Could not update the reservation.' });
    } finally {
      setBusyId(null);
    }
  };

  const billThisMonth = async (reservation) => {
    setBusyId(reservation.id);
    setNotice(null);
    try {
      const res = await api.post('sync_parking_to_invoice.php', { reservation_id: reservation.id });
      setNotice({ ok: true, text: res.data.message });
      fetchParkingReservations();
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Could not bill the parking fee.' });
    } finally {
      setBusyId(null);
    }
  };

  const filteredReservations = reservations.filter(r => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q ||
      (r.tenant || '').toLowerCase().includes(q) ||
      (r.unit || '').toLowerCase().includes(q) ||
      (r.vehicleModel || '').toLowerCase().includes(q) ||
      (r.plateNumber || '').toLowerCase().includes(q) ||
      (r.slotNumber !== null && `#${r.slotNumber}` === q);
    return matchesStatus && matchesSearch;
  });

  const countOf = (status) => reservations.filter(r => r.status === status).length;
  const monthlyRevenue = countOf('Assigned') * Number(monthlyFee || 0);

  const dialogValid = dialog && (dialog.mode === 'assign' ? dialog.slot !== '' : dialog.reason.trim().length > 0);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-white text-left font-sans">
        <Header title="Parking Management" />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* Stat cards — all from the database */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Slots In Use</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><FontAwesomeIcon icon={faParking} /></div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-emerald-950 m-0">{capacity.occupied_count} / {capacity.max_slots}</p>
                <p className="mt-1 text-xs text-emerald-600 font-medium m-0">{capacity.available_slots} free{freeSlots.length > 0 ? ` (#${freeSlots.join(', #')})` : ''}</p>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Requests</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><FontAwesomeIcon icon={faClock} /></div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-amber-950 m-0">{countOf('Pending')}</p>
                <p className="mt-1 text-xs text-amber-600 font-medium m-0">Awaiting slot assignment</p>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Monthly Parking Fees</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600"><FontAwesomeIcon icon={faReceipt} /></div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-indigo-950 m-0">{peso(monthlyRevenue)}</p>
                <p className="mt-1 text-xs text-indigo-600 font-medium m-0">{peso(monthlyFee)} per slot · {billingMode === 'auto' ? 'billed automatically' : 'billed manually'}</p>
              </div>

              <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Closed</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><FontAwesomeIcon icon={faTimesCircle} /></div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-rose-950 m-0">{countOf('Rejected') + countOf('Released') + countOf('Cancelled')}</p>
                <p className="mt-1 text-xs text-rose-600 font-medium m-0">{countOf('Rejected')} rejected · {countOf('Released')} released · {countOf('Cancelled')} cancelled</p>
              </div>
            </div>

            {notice && (
              <div className={`rounded-xl border px-4 py-3 text-sm font-semibold flex justify-between gap-3 ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} className="bg-transparent border-0 cursor-pointer text-current" aria-label="Dismiss"><FontAwesomeIcon icon={faTimes} /></button>
              </div>
            )}

            {/* Filter and Search Bar */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative flex-1 w-full">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                  <input
                    type="text"
                    placeholder="Search by tenant, unit, vehicle, plate number or #slot..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
                    {TABS.map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setStatusFilter(tab)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all border-0 cursor-pointer whitespace-nowrap ${statusFilter === tab ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-600 hover:text-slate-900'}`}
                      >
                        {tab}{tab !== 'all' && ` (${countOf(tab)})`}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={fetchParkingReservations}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer shrink-0"
                    title="Refresh"
                    aria-label="Refresh"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Reservations Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Tenant &amp; Unit</th>
                      <th className="px-4 py-3.5">Vehicle</th>
                      <th className="px-4 py-3.5">Plate No.</th>
                      <th className="px-4 py-3.5">Slot &amp; Term</th>
                      <th className="px-4 py-3.5">Billing</th>
                      <th className="px-4 py-3.5 text-center">OR/CR</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan="8" className="px-5 py-12 text-center text-slate-400 font-medium">Loading parking reservations...</td></tr>
                    ) : error ? (
                      <tr><td colSpan="8" className="px-5 py-12 text-center text-rose-500 font-medium">{error}</td></tr>
                    ) : filteredReservations.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-slate-400">
                            <FontAwesomeIcon icon={faCar} className="text-xl text-slate-300 shrink-0" />
                            <span className="text-sm italic">No parking reservations found.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredReservations.map((r) => {
                        const billedThisMonth = r.billedPeriods.includes(currentPeriod);
                        const busy = busyId === r.id;
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/80 transition-colors align-top">
                            <td className="px-5 py-4">
                              <p className="font-bold text-slate-800 m-0">{r.tenant}</p>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                                <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-indigo-500" />
                                Unit {r.unit}
                              </span>
                            </td>

                            <td className="px-4 py-4 text-xs text-slate-700">
                              <p className="m-0 font-bold">{r.vehicleModel}</p>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5 capitalize">{r.vehicleType} • {r.transmission}</p>
                            </td>

                            <td className="px-4 py-4 text-xs">
                              <span className="font-mono uppercase font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{r.plateNumber}</span>
                            </td>

                            <td className="px-4 py-4 text-xs">
                              <p className="m-0 font-bold text-slate-800">{r.slotNumber ? `Slot #${r.slotNumber}` : '—'}</p>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                                {r.durationMonths} month(s){r.termEndsAt ? ` · ends ${new Date(r.termEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                              </p>
                              {(r.rejectionReason || r.releaseReason) && (
                                <p className="text-[11px] text-slate-500 m-0 mt-1 italic">{r.rejectionReason || r.releaseReason}</p>
                              )}
                            </td>

                            <td className="px-4 py-4 text-xs">
                              <p className="m-0 font-bold text-indigo-600">{peso(r.totalCost)} total</p>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                                {r.billedPeriods.length ? `Billed: ${r.billedPeriods.map(monthLabel).join(', ')}` : 'Not billed yet'}
                              </p>
                            </td>

                            <td className="px-4 py-4 text-center">
                              {r.documentPath && r.documentPath !== 'placeholder' ? (
                                <a href={fileUrl(r.documentPath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline">
                                  <FontAwesomeIcon icon={faEye} /><span>View</span>
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400 italic">—</span>
                              )}
                            </td>

                            <td className="px-4 py-4 text-center">
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                            </td>

                            <td className="px-5 py-4 text-right">
                              {r.status === 'Pending' && (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    disabled={busy || capacity.available_slots <= 0}
                                    onClick={() => openDialog('assign', r)}
                                    className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={capacity.available_slots <= 0 ? 'All slots are assigned' : 'Assign a slot'}
                                  >
                                    <FontAwesomeIcon icon={faCheck} className="mr-1" /> Assign
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => openDialog('reject', r)}
                                    className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors border-0 cursor-pointer disabled:opacity-50"
                                    title="Reject request"
                                  >
                                    <FontAwesomeIcon icon={faTimes} className="mr-1" /> Reject
                                  </button>
                                </div>
                              )}
                              {r.status === 'Assigned' && (
                                <div className="flex justify-end gap-1.5 flex-wrap">
                                  {billingMode === 'manual' ? (
                                    <button
                                      type="button"
                                      disabled={busy || billedThisMonth}
                                      onClick={() => billThisMonth(r)}
                                      className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                      title={billedThisMonth ? 'This month is already billed' : "Add this month's parking fee to the tenant's invoice"}
                                    >
                                      <FontAwesomeIcon icon={faFileInvoiceDollar} className="mr-1" /> {billedThisMonth ? 'Billed' : 'Bill this month'}
                                    </button>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-slate-400 self-center">Auto-billed</span>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => openDialog('release', r)}
                                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors border-0 cursor-pointer disabled:opacity-50"
                                    title="Free this slot"
                                  >
                                    <FontAwesomeIcon icon={faUnlock} className="mr-1" /> Release
                                  </button>
                                </div>
                              )}
                              {!['Pending', 'Assigned'].includes(r.status) && (
                                <span className="text-xs font-medium italic text-slate-400">Closed</span>
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

      {/* Assign / Reject / Release dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => busyId === null && setDialog(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 m-0">
              {dialog.mode === 'assign' ? 'Assign a parking slot' : dialog.mode === 'reject' ? 'Reject parking request' : 'Release parking slot'}
            </h3>
            <p className="text-sm text-slate-500 m-0">
              {dialog.reservation.tenant} · {dialog.reservation.vehicleModel} ({dialog.reservation.plateNumber})
              {dialog.reservation.slotNumber ? ` · Slot #${dialog.reservation.slotNumber}` : ''}
            </p>

            {dialog.mode === 'assign' ? (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Free slots</label>
                {freeSlots.length === 0 ? (
                  <p className="text-sm text-rose-600 m-0">All {capacity.max_slots} slots are assigned. Release one first.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {freeSlots.map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setDialog(d => ({ ...d, slot: n }))}
                        className={`h-11 w-14 rounded-xl text-sm font-bold border cursor-pointer transition-colors ${dialog.slot === n ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'}`}
                      >
                        #{n}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 m-0">
                  {billingMode === 'auto'
                    ? `This month's ${peso(monthlyFee)} fee will be added to the tenant's invoice automatically.`
                    : `Bill ${peso(monthlyFee)} per month with "Bill this month" once the slot is assigned.`}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="parking-reason" className="text-xs font-bold uppercase tracking-wide text-slate-500">Reason (sent to the tenant)</label>
                <textarea
                  id="parking-reason"
                  rows={3}
                  maxLength={255}
                  value={dialog.reason}
                  onChange={(e) => setDialog(d => ({ ...d, reason: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white resize-none"
                  placeholder={dialog.mode === 'reject' ? 'e.g. OR/CR is unreadable' : 'e.g. Tenant no longer needs parking'}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDialog(null)} disabled={busyId !== null} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-50">Cancel</button>
              <button
                type="button"
                onClick={submitDialog}
                disabled={!dialogValid || busyId !== null}
                className={`rounded-xl px-4 py-2 text-sm font-bold text-white border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${dialog.mode === 'assign' ? 'bg-emerald-600 hover:bg-emerald-700' : dialog.mode === 'reject' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-700 hover:bg-slate-800'}`}
              >
                {busyId !== null ? 'Saving…' : dialog.mode === 'assign' ? `Assign slot${dialog.slot ? ` #${dialog.slot}` : ''}` : dialog.mode === 'reject' ? 'Reject request' : 'Release slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
