import { useState, useEffect, useCallback } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCar, faCheck, faTimes, faSearch, faSync, faBuilding, faEye, faUnlock, faFileInvoiceDollar,
  faSquareParking, faReceipt, faGear, faPlus, faTrashCan, faIdCard, faHandPointer,
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import StatCard from '../Components/admin/StatCard';
import { apiErrorMessage } from '../utils/apiError';
import { LIMITS } from '../utils/validation';
import CharCount from '../Components/form/CharCount';
import { fileUrl } from '../api/fileUrl';
import Modal from '../Components/admin/Modal';
import useUrlFilter from '../hooks/useUrlFilter';
import { TH, THEAD, btn, badge, PANEL, PANEL_HEADER, PANEL_TITLE } from '../Components/admin/ui/styles';
import FilterTabs from '../Components/admin/ui/FilterTabs';
import { Skeleton, SkeletonRows } from '../Components/admin/ui/Skeleton';
import { LoadErrorRow } from '../Components/admin/ui/LoadError';
import ParkingSlotModal from '../Components/admin/parking/ParkingSlotModal';
import ParkingSettingsModal from '../Components/admin/parking/ParkingSettingsModal';
import { SLOT_ICONS, slotIcon, vehicleIcon, vehicleLabel, typesText, peso } from '../utils/parkingVehicles';

const STATUS_TONE = { Pending: 'warning', Assigned: 'success', Released: 'neutral', Rejected: 'danger', Cancelled: 'neutral' };
const TABS = ['all', 'Pending', 'Assigned', 'Released', 'Rejected', 'Cancelled'];

const monthLabel = (period) => {
  const d = new Date(`${period}-01T00:00:00`);
  return isNaN(d) ? period : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
const dateText = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// One slot tile: free (green), taken (rose), under maintenance (grey).
function SlotTile({ slot, onEdit, onRemove }) {
  const taken = !!slot.occupant;
  const maintenance = slot.status === 'maintenance';
  const tone = maintenance
    ? 'border-slate-200 bg-slate-50 text-slate-600'
    : taken ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onEdit}
        title={`Edit slot ${slot.label}`}
        className={`card-interactive flex w-full flex-col items-center gap-1.5 rounded-card border-2 px-2 pt-3 pb-2.5 text-center cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-raised ${tone}`}
      >
        <FontAwesomeIcon icon={slotIcon(slot.icon)} className="text-2xl" aria-hidden="true" />
        <span className="text-body font-bold text-slate-800">{slot.label}</span>
        <span className="w-full truncate text-caption font-semibold">
          {maintenance ? 'Maintenance' : taken ? slot.occupant.tenant : 'Free'}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500" aria-label={`Takes ${typesText(slot.vehicle_types)}`}>
          {slot.vehicle_types.slice(0, 3).map((t) => <FontAwesomeIcon key={t} icon={vehicleIcon(t)} title={vehicleLabel(t)} />)}
          {slot.vehicle_types.length > 3 && <span>+{slot.vehicle_types.length - 3}</span>}
          {slot.requires_registration && <FontAwesomeIcon icon={faIdCard} title="OR/CR required" className="ml-0.5 text-indigo-400" />}
        </span>
      </button>
      {slot.requests > 0 && !taken && (
        <span className={badge('warning', 'absolute -top-2 left-1/2 -translate-x-1/2 shadow-sm')}>{slot.requests} asked</span>
      )}
      {!taken && (
        <button type="button" onClick={onRemove} aria-label={`Remove slot ${slot.label}`} title="Remove slot"
          className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] text-slate-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer">
          <FontAwesomeIcon icon={faTrashCan} />
        </button>
      )}
    </div>
  );
}

export default function AdminParking() {
  const [data, setData] = useState(null); // the get_parking_reservations.php response
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useUrlFilter('tab', 'all', TABS);
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null);       // { mode: 'assign' | 'reject' | 'release', reservation, slot, reason }
  const [slotModal, setSlotModal] = useState(null); // { slot } (null slot = add)
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_parking_reservations.php');
      if (res.data.success) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.data.message || 'Failed to fetch parking reservations.');
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load parking reservations. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { setLoading(true); return load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const reservations = data?.reservations || [];
  const slots = data?.slots || [];
  const capacity = data?.capacity || { max_slots: 0, occupied_count: 0, available_slots: 0, maintenance_slots: 0, free_by_type: {} };
  const firstLoad = loading && !data;

  // Free slots that take this vehicle type, the requested one first.
  const freeSlotsFor = (reservation) => {
    const type = String(reservation.vehicleType || '').toLowerCase();
    return slots
      .filter((s) => !s.occupant && s.status === 'active' && s.vehicle_types.includes(type))
      .sort((a, b) => (b.id === reservation.slotNumber) - (a.id === reservation.slotNumber));
  };

  const openDialog = (mode, reservation) => {
    setNotice(null);
    const first = mode === 'assign' ? freeSlotsFor(reservation)[0] : null;
    setDialog({ mode, reservation, slot: first ? first.id : '', reason: '' });
  };

  // The server's message is shown as-is: a taken slot, a wrong vehicle type, or
  // the requests closed because the lot is now full.
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
      setNotice({ ok: true, text: res.data.message + (billing ? ` ${billing.message}` : '') });
      setDialog(null);
      load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not update the reservation.') });
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
      load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not bill the parking fee.') });
    } finally {
      setBusyId(null);
    }
  };

  const removeSlot = async () => {
    setRemoving(true);
    try {
      const res = await api.post('parking_slots.php', { action: 'remove', id: removeTarget.id });
      setNotice({ ok: true, text: res.data.message });
      setRemoveTarget(null);
      load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not remove the slot.') });
      setRemoveTarget(null);
    } finally {
      setRemoving(false);
    }
  };

  const onModalSaved = (text) => {
    setSlotModal(null);
    setShowSettings(false);
    setNotice({ ok: true, text });
    load();
  };

  const filteredReservations = reservations.filter((r) => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q
      || (r.tenant || '').toLowerCase().includes(q)
      || (r.unit || '').toLowerCase().includes(q)
      || (r.vehicleModel || '').toLowerCase().includes(q)
      || (r.plateNumber || '').toLowerCase().includes(q)
      || (r.slotLabel || '').toLowerCase() === q.replace(/^#/, '');
    return matchesStatus && matchesSearch;
  });
  const countOf = (status) => reservations.filter((r) => r.status === status).length;

  // Free slots by the kind of slot (its icon): "Motorcycle 2 · E-bike 2 · Car 1".
  const freeTypes = SLOT_ICONS.map((i) => [i.label, slots.filter((s) => !s.occupant && s.status === 'active' && s.icon === i.value).length])
    .filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`);
  const kpi = firstLoad ? 'loading' : undefined;
  const dialogValid = dialog && (dialog.mode === 'assign' ? dialog.slot !== '' : dialog.reason.trim().length > 0);
  const occupiedSlot = slotModal?.slot ? !!slots.find((s) => s.id === slotModal.slot.id)?.occupant : false;

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden bg-slate-50 text-left font-sans">
        <Header title="Parking Management" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* Key figures, as on the Dashboard. The fees card opens the settings. */}
            <section aria-label="Parking figures" className="stagger-children grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <StatCard
                icon={faSquareParking}
                showIconBadge={false}
                color="emerald"
                title="Slots in use"
                value={`${capacity.occupied_count} / ${capacity.max_slots}`}
                subtext={`${capacity.available_slots} free${capacity.maintenance_slots ? ` · ${capacity.maintenance_slots} under maintenance` : ''}`}
                progress={capacity.max_slots > 0 ? (capacity.occupied_count / capacity.max_slots) * 100 : 0}
                tooltip="Assigned slots out of the slots open for parking"
                status={kpi}
              />
              <StatCard
                icon={faCar}
                showIconBadge={false}
                color={capacity.available_slots > 0 ? 'blue' : 'red'}
                title="Free slots"
                value={capacity.available_slots}
                subtext={freeTypes.length ? freeTypes.join(' · ') : 'Parking is full'}
                tooltip="Free slots open for parking, by kind of slot"
                status={kpi}
              />
              <StatCard
                icon={faReceipt}
                showIconBadge={false}
                color="indigo"
                title="Monthly parking fees"
                value={data?.free && !data?.monthly_total ? 'Free' : peso(data?.monthly_total)}
                subtext={data?.free
                  ? 'Free parking is on for new requests'
                  : `${peso(data?.monthly_fee)} per slot · ${data?.billing_mode === 'auto' ? 'billed automatically' : 'billed manually'}`}
                tooltip="Open parking settings"
                onClick={() => setShowSettings(true)}
                status={kpi}
              />
            </section>

            {notice && (
              <div role="status" className={`rounded-card border px-4 py-3 text-body font-semibold flex justify-between gap-3 ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} className="bg-transparent border-0 cursor-pointer text-current" aria-label="Dismiss"><FontAwesomeIcon icon={faTimes} /></button>
              </div>
            )}

            {/* Slots */}
            <section className={PANEL} aria-labelledby="parking-slots-title">
              <div className={PANEL_HEADER}>
                <div className="min-w-0">
                  <h2 id="parking-slots-title" className={PANEL_TITLE}>Slots</h2>
                  <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Free</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Taken</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Maintenance</span>
                    <span className="inline-flex items-center gap-1.5"><FontAwesomeIcon icon={faIdCard} className="text-indigo-400" /> OR/CR required</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSlotModal({ slot: null })} className={btn('primary', 'sm')}>
                    <FontAwesomeIcon icon={faPlus} /> Add slots
                  </button>
                  <button type="button" onClick={() => setShowSettings(true)} aria-label="Parking settings" title="Parking settings"
                    className="flex h-8 w-8 items-center justify-center rounded-control border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-indigo-600 cursor-pointer transition-colors">
                    <FontAwesomeIcon icon={faGear} />
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                {firstLoad ? (
                  <div role="status" className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
                    <span className="sr-only">Loading parking slots…</span>
                    {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}
                  </div>
                ) : slots.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <FontAwesomeIcon icon={faSquareParking} className="text-4xl text-slate-300" />
                    <p className="m-0 text-body text-slate-500">No parking slots yet. Add the slots tenants can ask for.</p>
                    <button type="button" onClick={() => setSlotModal({ slot: null })} className={btn('primary', 'sm')}><FontAwesomeIcon icon={faPlus} /> Add slots</button>
                  </div>
                ) : (
                  <div className="stagger-children grid grid-cols-3! gap-3 sm:grid-cols-5! lg:grid-cols-8!">
                    {slots.map((s) => (
                      <SlotTile key={s.id} slot={s} onEdit={() => setSlotModal({ slot: s })} onRemove={() => setRemoveTarget(s)} />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Requests */}
            <div className="rounded-card border border-slate-200 bg-white p-4 sm:p-5 shadow-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="relative flex-1 w-full">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
                  <input maxLength={LIMITS.search} type="text" aria-label="Search parking requests"
                    placeholder="Search tenant, vehicle, plate or slot…"
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-card border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-body text-slate-800 outline-none focus:border-indigo-500 focus:bg-white" />
                </div>
                <div className="flex items-center gap-3 justify-between">
                  <FilterTabs
                    label="Filter parking requests by status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={TABS.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1), count: t === 'all' || firstLoad || error ? undefined : countOf(t) }))}
                  />
                  <button type="button" onClick={refresh} title="Refresh" aria-label="Refresh"
                    className="flex h-9 w-9 items-center justify-center rounded-card border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer shrink-0">
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-body">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Tenant &amp; Unit</th>
                      <th className={TH}>Vehicle</th>
                      <th className={TH}>Plate No.</th>
                      <th className={TH}>Slot &amp; Term</th>
                      <th className={TH}>Billing</th>
                      <th className={`${TH} text-center`}>OR/CR</th>
                      <th className={`${TH} text-center`}>Status</th>
                      <th className={`${TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-children divide-y divide-slate-100">
                    {firstLoad ? (
                      <SkeletonRows cols={8} label="Loading parking reservations…" />
                    ) : error && !data ? (
                      <LoadErrorRow cols={8} title="Couldn't load parking reservations" detail={error} onRetry={refresh} />
                    ) : filteredReservations.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-slate-500">
                            <FontAwesomeIcon icon={faCar} className="text-xl text-slate-300 shrink-0" />
                            <span className="text-body italic">No parking reservations found.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredReservations.map((r) => {
                        const billedThisMonth = r.billedPeriods.includes(data.current_period);
                        const busy = busyId === r.id;
                        const isFree = Number(r.monthlyFee) <= 0;
                        const canAssign = freeSlotsFor(r).length > 0;
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/80 transition-colors align-top">
                            <td className="px-5 py-4">
                              <p className="font-bold text-slate-800 m-0">{r.tenant}</p>
                              <span className="inline-flex items-center gap-1 text-label text-slate-500 mt-0.5">
                                <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-indigo-500" /> Unit {r.unit}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-label text-slate-700">
                              <p className="m-0 font-bold flex items-center gap-1.5"><FontAwesomeIcon icon={vehicleIcon(r.vehicleType)} className="text-slate-400" /> {r.vehicleModel}</p>
                              <p className="text-caption text-slate-500 m-0 mt-0.5">{vehicleLabel(r.vehicleType)}{r.transmission ? ` · ${r.transmission}` : ''}</p>
                            </td>
                            <td className="px-4 py-4 text-label">
                              {r.plateNumber
                                ? <span className="font-mono uppercase font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-control">{r.plateNumber}</span>
                                : <span className="text-caption text-slate-500 italic">No plate</span>}
                            </td>
                            <td className="px-4 py-4 text-label">
                              <p className="m-0 font-bold text-slate-800">
                                {r.status === 'Pending'
                                  ? (r.slotLabel ? <span className="font-semibold text-slate-600">Asked for slot {r.slotLabel}</span> : '—')
                                  : r.slotLabel ? `Slot ${r.slotLabel}` : '—'}
                              </p>
                              <p className="text-caption text-slate-500 m-0 mt-0.5">
                                {r.durationMonths} month(s){r.termEndsAt ? ` · ends ${dateText(r.termEndsAt)}` : ''}
                              </p>
                              {(r.rejectionReason || r.releaseReason) && (
                                <p className="text-caption text-slate-500 m-0 mt-1 italic">{r.rejectionReason || r.releaseReason}</p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-label">
                              {isFree ? (
                                <span className={badge('success')}>Free</span>
                              ) : (
                                <>
                                  <p className="m-0 font-bold text-indigo-600">{peso(r.totalCost)} total</p>
                                  <p className="text-caption text-slate-500 m-0 mt-0.5">
                                    {peso(r.monthlyFee)}/month · {r.billedPeriods.length ? `Billed: ${r.billedPeriods.map(monthLabel).join(', ')}` : 'Not billed yet'}
                                  </p>
                                </>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              {r.documentPath && r.documentPath !== 'placeholder' ? (
                                <a href={fileUrl(r.documentPath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-label text-indigo-600 hover:text-indigo-800 font-bold hover:underline">
                                  <FontAwesomeIcon icon={faEye} /><span>View</span>
                                </a>
                              ) : (
                                <span className="text-caption text-slate-500 italic">{r.documentPath ? '—' : 'Not needed'}</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={badge(STATUS_TONE[r.status] || 'neutral')}>{r.status}</span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              {r.status === 'Pending' && (
                                <div className="flex justify-end gap-1.5">
                                  <button type="button" disabled={busy || !canAssign} onClick={() => openDialog('assign', r)}
                                    title={canAssign ? 'Assign a slot' : `No free slot takes a ${vehicleLabel(r.vehicleType).toLowerCase()}`}
                                    className="rounded-control bg-emerald-50 px-2.5 py-1.5 text-label font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                                    <FontAwesomeIcon icon={faCheck} className="mr-1" /> Assign
                                  </button>
                                  <button type="button" disabled={busy} onClick={() => openDialog('reject', r)} title="Reject request"
                                    className="rounded-control bg-red-50 px-2.5 py-1.5 text-label font-bold text-red-700 hover:bg-red-100 transition-colors border-0 cursor-pointer disabled:opacity-50">
                                    <FontAwesomeIcon icon={faTimes} className="mr-1" /> Reject
                                  </button>
                                </div>
                              )}
                              {r.status === 'Assigned' && (
                                <div className="flex justify-end gap-1.5 flex-wrap">
                                  {isFree ? null : data.billing_mode === 'manual' ? (
                                    <button type="button" disabled={busy || billedThisMonth} onClick={() => billThisMonth(r)}
                                      title={billedThisMonth ? 'This month is already billed' : "Add this month's parking fee to the tenant's invoice"}
                                      className="rounded-control bg-indigo-50 px-2.5 py-1.5 text-label font-bold text-indigo-700 hover:bg-indigo-100 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                                      <FontAwesomeIcon icon={faFileInvoiceDollar} className="mr-1" /> {billedThisMonth ? 'Billed' : 'Bill this month'}
                                    </button>
                                  ) : (
                                    <span className="text-caption font-semibold text-slate-500 self-center">Auto-billed</span>
                                  )}
                                  <button type="button" disabled={busy} onClick={() => openDialog('release', r)} title="Free this slot"
                                    className="rounded-control bg-slate-100 px-2.5 py-1.5 text-label font-bold text-slate-700 hover:bg-slate-200 transition-colors border-0 cursor-pointer disabled:opacity-50">
                                    <FontAwesomeIcon icon={faUnlock} className="mr-1" /> Release
                                  </button>
                                </div>
                              )}
                              {!['Pending', 'Assigned'].includes(r.status) && (
                                <span className="text-label font-medium italic text-slate-500">Closed</span>
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

      {/* Assign / Reject / Release */}
      {dialog && (() => {
        const choices = dialog.mode === 'assign' ? freeSlotsFor(dialog.reservation) : [];
        const title = dialog.mode === 'assign' ? 'Assign a parking slot' : dialog.mode === 'reject' ? 'Reject parking request' : 'Release parking slot';
        const r = dialog.reservation;
        return (
          <Modal labelledBy="parking-dialog-title" onClose={() => setDialog(null)} busy={busyId !== null}
            className="w-full max-w-md mx-4 rounded-dialog bg-white p-6 shadow-dialog flex flex-col gap-4">
            <h2 id="parking-dialog-title" className="text-title font-bold text-slate-800 m-0">{title}</h2>
            <p className="text-body text-slate-500 m-0 flex items-center gap-2">
              <FontAwesomeIcon icon={vehicleIcon(r.vehicleType)} className="text-slate-400" />
              {r.tenant} · {r.vehicleModel}{r.plateNumber ? ` (${r.plateNumber})` : ''}{r.slotLabel && r.status === 'Assigned' ? ` · Slot ${r.slotLabel}` : ''}
            </p>

            {dialog.mode === 'assign' ? (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-label font-medium text-slate-600">Free slots that take a {vehicleLabel(r.vehicleType).toLowerCase()}</p>
                {choices.length === 0 ? (
                  <p className="text-body text-red-600 m-0">No free slot takes this vehicle. Release one or add a slot first.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Free slots">
                    {choices.map((s) => (
                      <button key={s.id} type="button" role="radio" aria-checked={dialog.slot === s.id}
                        onClick={() => setDialog((d) => ({ ...d, slot: s.id }))}
                        className={`relative flex flex-col items-center gap-1 rounded-card border-2 py-2.5 text-body font-bold cursor-pointer transition-colors ${dialog.slot === s.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400'}`}>
                        <FontAwesomeIcon icon={slotIcon(s.icon)} />
                        {s.label}
                        {s.id === r.slotNumber && <FontAwesomeIcon icon={faHandPointer} title="The slot the tenant asked for" className="absolute top-1 right-1.5 text-[10px] opacity-80" />}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-caption text-slate-500 m-0">
                  {Number(r.monthlyFee) <= 0
                    ? 'This permit is free: nothing is billed.'
                    : data.billing_mode === 'auto'
                      ? `This month's ${peso(r.monthlyFee)} fee will be added to the tenant's invoice automatically.`
                      : `Bill ${peso(r.monthlyFee)} per month with "Bill this month" once the slot is assigned.`}
                  {' '}If this fills the last slot for this vehicle type, the other requests waiting for one are closed and their tenants told the parking is full.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="parking-reason" className="text-label font-medium text-slate-600">Reason (sent to the tenant)</label>
                <textarea id="parking-reason" name="reason" rows={3} required maxLength={LIMITS.reason}
                  value={dialog.reason}
                  onChange={(e) => setDialog((d) => ({ ...d, reason: e.target.value }))}
                  onBlur={() => setDialog((d) => ({ ...d, reason: d.reason.trim() }))}
                  className="w-full rounded-card border border-slate-200 bg-slate-50 p-3 text-body text-slate-800 outline-none focus:border-indigo-500 focus:bg-white resize-none"
                  placeholder={dialog.mode === 'reject' ? 'e.g. OR/CR is unreadable' : 'e.g. Tenant no longer needs parking'} />
                <CharCount value={dialog.reason} max={LIMITS.reason} className="m-0" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDialog(null)} disabled={busyId !== null} className={btn('secondary', 'md')}>Cancel</button>
              <button type="button" onClick={submitDialog} disabled={!dialogValid || busyId !== null}
                className={btn(dialog.mode === 'assign' ? 'success' : dialog.mode === 'reject' ? 'danger' : 'primary', 'md')}>
                {busyId !== null ? 'Saving…' : dialog.mode === 'assign'
                  ? `Assign${dialog.slot ? ` slot ${choices.find((s) => s.id === dialog.slot)?.label ?? ''}` : ''}`
                  : dialog.mode === 'reject' ? 'Reject request' : 'Release slot'}
              </button>
            </div>
          </Modal>
        );
      })()}

      {slotModal && (
        <ParkingSlotModal slot={slotModal.slot} occupied={occupiedSlot} onClose={() => setSlotModal(null)} onSaved={onModalSaved} />
      )}

      {removeTarget && (
        <Modal labelledBy="parking-remove-title" onClose={() => setRemoveTarget(null)} busy={removing}
          className="w-full max-w-sm mx-4 rounded-dialog bg-white p-6 shadow-dialog flex flex-col gap-4">
          <h2 id="parking-remove-title" className="m-0 flex items-center gap-2 text-title font-bold text-slate-800">
            <FontAwesomeIcon icon={faTrashCan} className="text-red-500" /> Remove slot {removeTarget.label}?
          </h2>
          <p className="m-0 text-body text-slate-600">
            Tenants can no longer ask for it. Past permits keep its name.
            {removeTarget.requests > 0 && ` ${removeTarget.requests} request(s) asked for this slot: they stay open and you can assign them another slot.`}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRemoveTarget(null)} disabled={removing} className={btn('secondary', 'md')}>Cancel</button>
            <button type="button" onClick={removeSlot} disabled={removing} className={btn('danger', 'md')}>{removing ? 'Removing…' : 'Remove slot'}</button>
          </div>
        </Modal>
      )}

      {showSettings && data && (
        <ParkingSettingsModal initial={data} onClose={() => setShowSettings(false)} onSaved={onModalSaved} />
      )}
    </div>
  );
}

