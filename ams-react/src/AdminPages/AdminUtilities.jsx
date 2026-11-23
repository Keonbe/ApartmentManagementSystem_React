import toast from '../utils/toast';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBolt, faTint, faPlus, faSync, faSearch, faCheckCircle, 
  faReceipt, faClock, faTimes, faChartLine, 
  faTrash, faExclamationTriangle, faChevronLeft, 
  faChevronRight, faChevronDown, faCheck, faLayerGroup
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import StatCard from '../Components/admin/StatCard';
import { LIMITS, MAX_AMOUNT, addDays, checkAmount, checkDate, checkText, localDateString } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import fileUrl from '../api/fileUrl';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';
import Modal from '../Components/admin/Modal';
import useUrlFilter from '../hooks/useUrlFilter';
import { PANEL, PANEL_HEADER, TABLE, THEAD, TH, TR, TD, btn, badge } from '../Components/admin/ui/styles';
import { SkeletonRows } from '../Components/admin/ui/Skeleton';
import { LoadErrorRow } from '../Components/admin/ui/LoadError';
import FilterTabs from '../Components/admin/ui/FilterTabs';
import { personName } from '../utils/personName';
import askConfirm from '../utils/askConfirm';

// sync_utility_to_invoice.php: a separate invoice's due date is today to +10 days.
const SYNC_DUE_MAX_DAYS = 10;

// Mirrors UTILITY_SPIKE_THRESHOLD_PCT in backend/config.php.
const SPIKE_THRESHOLD_PCT = 30;

function formatBillingPeriod(periodStr) {
  if (!periodStr) return '';
  const [year, month] = periodStr.split('-');
  if (!year || !month) return periodStr;
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// The unit's latest earlier metered reading, whose rates a new metered reading carries forward.
function findPreviousReading(readings, roomName, period) {
  if (!roomName || !Array.isArray(readings)) return null;
  return readings
    .filter(r => r.room_name === roomName && (r.entry_mode ?? 'metered') === 'metered' && (!period || r.billing_period < period))
    .sort((a, b) => b.billing_period.localeCompare(a.billing_period))[0] || null;
}

// The latest earlier meter value for one utility, skipping rows that have none.
function previousMeterValue(readings, roomName, period, key) {
  if (!roomName || !Array.isArray(readings)) return null;
  const row = readings
    .filter(r => r.room_name === roomName && r.entry_mode !== 'total' && r[key] !== null && r[key] !== undefined && (!period || r.billing_period < period))
    .sort((a, b) => b.billing_period.localeCompare(a.billing_period))[0];
  return row ? parseFloat(row[key]) : null;
}

const peso = (v) => `₱${(parseFloat(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hasValue = (v) => v !== null && v !== undefined && v !== '';

function ChangeBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const isSpike = pct > SPIKE_THRESHOLD_PCT;
  const tone = isSpike ? 'text-red-600 bg-red-50 border-red-200' : pct > 0 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-600 bg-slate-50 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${tone}`}>
      {pct > 0 ? `+${pct}%` : `${pct}%`} vs prev
    </span>
  );
}

export default function AdminUtilities() {
  const navigate = useNavigate();
  const [readings, setReadings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncingId, setSyncingId] = useState(null);

  // Time range presets and filters
  const [periodFilter, setPeriodFilter] = useState('this-month');
  const [roomFilter, setRoomFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useUrlFilter('tab', 'all', ['all', 'pending', 'invoiced']);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const handleSearchChange = (val) => { setSearchQuery(val); setCurrentPage(1); };
  const handleRoomChange = (val) => { setRoomFilter(val); setCurrentPage(1); };
  const handlePeriodChange = (val) => { setPeriodFilter(val); setCurrentPage(1); };
  const handleStatusChange = (val) => { setStatusFilter(val); setCurrentPage(1); };

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [syncTargetId, setSyncTargetId] = useState(null);

  // Hidden month picker ref for calendar dialog
  const monthInputRef = useRef(null);
  const handleOpenMonthPicker = () => {
    if (monthInputRef.current) {
      if (typeof monthInputRef.current.showPicker === 'function') {
        monthInputRef.current.showPicker();
      } else {
        monthInputRef.current.focus();
      }
    }
  };

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadData = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let isSubscribed = true;
    const fetchData = async () => {
      try {
        const [readingsRes, roomsRes] = await Promise.all([
          api.get('/get_utility_readings.php'),
          api.get('/get_rooms.php')
        ]);
        if (!isSubscribed) return;
        if (readingsRes?.data?.success && Array.isArray(readingsRes?.data?.data)) {
          setReadings(readingsRes.data.data);
          setError(null);
        } else {
          setError(readingsRes?.data?.message || 'The utility readings did not load.');
        }
        if (roomsRes?.data?.success) {
          const roomList = Array.isArray(roomsRes.data.rooms) 
            ? roomsRes.data.rooms 
            : (Array.isArray(roomsRes.data.data) ? roomsRes.data.data : []);
          setRooms(roomList);
        }
      } catch (err) {
        if (!isSubscribed) return;
        console.error("Failed to load utilities:", err);
        setError("Unable to connect to utility backend. Verify XAMPP Apache/MySQL is running.");
      } finally {
        if (isSubscribed) setLoading(false);
      }
    };
    fetchData();
    return () => { isSubscribed = false; };
  }, [refreshKey]);

  // Dynamic billing periods with record counts
  const periodData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPeriod = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const periodCounts = {};
    if (Array.isArray(readings)) {
      readings.forEach(r => {
        if (!r.billing_period) return;
        const roomMatches = roomFilter === 'all' || r.room_name === roomFilter;
        if (!periodCounts[r.billing_period]) {
          periodCounts[r.billing_period] = { total: 0, roomCount: 0 };
        }
        periodCounts[r.billing_period].total += 1;
        if (roomMatches) {
          periodCounts[r.billing_period].roomCount += 1;
        }
      });
    }

    const recordedPeriods = Object.keys(periodCounts)
      .sort((a, b) => b.localeCompare(a))
      .map(p => ({
        value: p,
        label: formatBillingPeriod(p),
        total: periodCounts[p].total,
        roomCount: periodCounts[p].roomCount
      }));

    const isCustomPeriod = periodFilter && 
      !['this-month', 'last-month', 'past-3-months', 'ytd', 'all'].includes(periodFilter) && 
      !periodCounts[periodFilter];

    return {
      currentYear,
      currentPeriod,
      lastMonthPeriod,
      recordedPeriods,
      isCustomPeriod
    };
  }, [readings, roomFilter, periodFilter]);

  const handleSync = async (id, mode, dueDate) => {
    setSyncingId(id);
    try {
      const payload = { id, sync_mode: mode };
      if (mode === 'separate' && dueDate) {
        payload.due_date = dueDate;
      }
      const res = await api.post('/sync_utility_to_invoice.php', payload);
      if (res?.data?.success) {
        toast.success(res.data.message || "Synced successfully!");
        setSyncTargetId(null);
        reloadData();
      } else {
        toast.error(res?.data?.message || "Failed to sync.");
      }
    } catch (err) {
      console.error("Sync error:", err);
      toast.error(apiErrorMessage(err, "Failed to sync utility."));
    } finally {
      setSyncingId(null);
    }
  };

  const handleBillFile = async (reading, file) => {
    if (file) {
      const fileError = checkFile(file, FILE_RULES.document);
      if (fileError) { toast.error(fileError); return; }
    } else if (!(await askConfirm('Remove the bill file from this reading?'))) {
      return;
    }
    const fd = new FormData();
    fd.append('reading_id', reading.id);
    if (file) fd.append('bill', file); else fd.append('remove', '1');
    setSyncingId(reading.id);
    try {
      const res = await api.post('/upload_utility_bill.php', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res?.data?.success) reloadData(); else toast.error(res?.data?.message || 'Could not update the bill file.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update the bill file.'));
    } finally {
      setSyncingId(null);
    }
  };

  const latestPeriodByRoom = useMemo(() => {
    const latest = {};
    readings.forEach(r => {
      if (!latest[r.room_name] || r.billing_period > latest[r.room_name]) latest[r.room_name] = r.billing_period;
    });
    return latest;
  }, [readings]);

  const handleDelete = async (reading) => {
    if (!(await askConfirm(`Delete the ${formatBillingPeriod(reading.billing_period)} reading for Unit ${reading.room_name}? You can record it again afterwards.`))) return;
    setSyncingId(reading.id);
    try {
      const res = await api.post('/delete_utility_reading.php', { id: reading.id });
      toast.success(res?.data?.message || "Reading deleted.");
      if (res?.data?.success) reloadData();
    } catch (err) {
      console.error("Delete reading error:", err);
      toast.error(err?.response?.data?.message || "Failed to delete the reading.");
    } finally {
      setSyncingId(null);
    }
  };

  // Filtered readings based on time range, room, search and status
  const filteredReadings = useMemo(() => {
    if (!Array.isArray(readings)) return [];
    return readings.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        (r.room_name && String(r.room_name).toLowerCase().includes(q)) ||
        (r.billing_period && String(r.billing_period).toLowerCase().includes(q)) ||
        (r.notes && String(r.notes).toLowerCase().includes(q)) ||
        (r.tenant_first_name && `${r.tenant_first_name} ${r.tenant_last_name || ''}`.toLowerCase().includes(q));

      const matchRoom = roomFilter === 'all' || r.room_name === roomFilter;

      let matchPeriod = true;
      if (periodFilter === 'this-month') {
        matchPeriod = r.billing_period === periodData.currentPeriod;
      } else if (periodFilter === 'last-month') {
        matchPeriod = r.billing_period === periodData.lastMonthPeriod;
      } else if (periodFilter === 'past-3-months') {
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const [rYear, rMonth] = (r.billing_period || '').split('-');
        if (rYear && rMonth) {
          const rDate = new Date(parseInt(rYear, 10), parseInt(rMonth, 10) - 1, 1);
          matchPeriod = rDate >= threeMonthsAgo;
        }
      } else if (periodFilter === 'ytd') {
        const [rYear] = (r.billing_period || '').split('-');
        matchPeriod = parseInt(rYear, 10) === periodData.currentYear;
      } else if (periodFilter && periodFilter !== 'all') {
        matchPeriod = r.billing_period === periodFilter;
      }

      let matchStatus = true;
      if (statusFilter === 'pending') matchStatus = !r.is_invoiced || r.is_invoiced == 0;
      else if (statusFilter === 'invoiced') matchStatus = r.is_invoiced == 1;

      return matchSearch && matchRoom && matchPeriod && matchStatus;
    });
  }, [readings, searchQuery, roomFilter, periodFilter, statusFilter, periodData]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredReadings.length / (pageSize || 1)));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedReadings = useMemo(() => {
    if (pageSize === 0) return filteredReadings;
    const start = (safePage - 1) * pageSize;
    return filteredReadings.slice(start, start + pageSize);
  }, [filteredReadings, safePage, pageSize]);

  // Dynamic KPI Stats calculated for the current active range/filter
  const rangeStats = useMemo(() => {
    if (!Array.isArray(filteredReadings)) {
      return { waterM3: '0.0', waterPHP: '0.00', elecKWh: '0.0', elecPHP: '0.00', totalUtilityPHP: '0.00', pendingSyncCount: 0 };
    }
    const totalWaterM3 = filteredReadings.reduce((acc, r) => acc + (parseFloat(r.water_consumption) || 0), 0);
    const totalWaterPHP = filteredReadings.reduce((acc, r) => acc + (parseFloat(r.water_amount) || 0) + (parseFloat(r.water_other_fees) || 0), 0);
    const totalElecKWh = filteredReadings.reduce((acc, r) => acc + (parseFloat(r.electric_consumption) || 0), 0);
    const totalElecPHP = filteredReadings.reduce((acc, r) => acc + (parseFloat(r.electric_amount) || 0) + (parseFloat(r.electric_other_fees) || 0), 0);
    const totalUtilityPHP = totalWaterPHP + totalElecPHP;
    const pendingSyncCount = filteredReadings.filter(r => !r.is_invoiced || r.is_invoiced == 0).length;

    return {
      waterM3: totalWaterM3.toFixed(1),
      waterPHP: totalWaterPHP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      elecKWh: totalElecKWh.toFixed(1),
      elecPHP: totalElecPHP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalUtilityPHP: totalUtilityPHP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      pendingSyncCount
    };
  }, [filteredReadings]);

  const kpiStatus = loading ? 'loading' : error ? 'error' : undefined;

  // Active period display label
  const activePeriodLabel = useMemo(() => {
    if (periodFilter === 'this-month') return `This Month (${formatBillingPeriod(periodData.currentPeriod)})`;
    if (periodFilter === 'last-month') return `Last Month (${formatBillingPeriod(periodData.lastMonthPeriod)})`;
    if (periodFilter === 'past-3-months') return 'Past 3 Months';
    if (periodFilter === 'ytd') return `This Year (${periodData.currentYear})`;
    if (periodFilter === 'all') return 'All Time';
    return formatBillingPeriod(periodFilter);
  }, [periodFilter, periodData]);

  return (
    <div className="admin-shell flex h-screen w-full font-sans bg-slate-50 text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50 min-w-0">
        <Header title="Utility Tracking & Sub-Meters" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Page Header matching Dashboard and Reports style */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="m-0 text-section font-semibold text-slate-900">Utility Tracking & Sub-Meters</h1>
                <p className="m-0 mt-0.5 text-label text-slate-500">Record water and electricity meter readings, bill provider invoices, and sync charges.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={reloadData}
                  title="Refresh data"
                  className="flex h-9 w-9 items-center justify-center rounded-control border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin-reports?report=utilities')}
                  className={btn('secondary', 'sm')}
                >
                  <FontAwesomeIcon icon={faChartLine} />
                  <span>View Analytics</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className={btn('primary', 'sm')}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>Record Reading</span>
                </button>
              </div>
            </div>

            {/* Stat Cards in Dashboard Style (Responsive to selected range) */}
            <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard 
                icon={faTint} 
                showIconBadge={false}
                color="blue" 
                title="Water consumption" 
                value={`${rangeStats.waterM3} m³`} 
                subtext={`₱${rangeStats.waterPHP} billed`}
                tooltip="Total water volume and amount in the selected period"
                status={kpiStatus}
              />
              <StatCard 
                icon={faBolt} 
                showIconBadge={false}
                color="amber" 
                title="Electricity usage" 
                value={`${rangeStats.elecKWh} kWh`} 
                subtext={`₱${rangeStats.elecPHP} billed`}
                tooltip="Total electricity power and amount in the selected period"
                status={kpiStatus}
              />
              <StatCard 
                icon={faReceipt} 
                showIconBadge={false}
                color="emerald" 
                title="Total utility billed" 
                value={`₱${rangeStats.totalUtilityPHP}`} 
                subtext={`${filteredReadings.length} reading(s) in view`}
                tooltip="Combined water and electricity charges in the active view"
                status={kpiStatus}
              />
              <StatCard 
                icon={faClock} 
                showIconBadge={false}
                color={rangeStats.pendingSyncCount > 0 ? 'amber' : 'slate'} 
                title="Pending sync" 
                value={rangeStats.pendingSyncCount} 
                subtext={rangeStats.pendingSyncCount > 0 ? `${rangeStats.pendingSyncCount} reading(s) to sync` : 'All synced to invoices'}
                tooltip="Readings not yet billed or attached to a tenant invoice"
                status={kpiStatus}
                onClick={() => handleStatusChange('pending')}
              />
            </div>

            {/* List and Filter Section in the Reports/Dashboard style */}
            <section aria-label="Utility readings" className={PANEL}>
              {/* Header with status tabs and search/controls */}
              <div className={PANEL_HEADER}>
                <div className="flex flex-wrap items-center gap-3">
                  <FilterTabs
                    label="Filter readings by status"
                    value={statusFilter}
                    onChange={handleStatusChange}
                    options={[
                      { value: 'all', label: 'All Records', count: loading || error ? null : readings.length },
                      { value: 'pending', label: 'Pending Sync', count: loading || error ? null : readings.filter(r => !r.is_invoiced || r.is_invoiced == 0).length },
                      { value: 'invoiced', label: 'Invoiced', count: loading || error ? null : readings.filter(r => r.is_invoiced == 1).length },
                    ]}
                  />
                </div>

                {/* Search, Unit selector & Time Range Dropdown */}
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                  {/* Search box */}
                  <div className="flex items-center gap-2 flex-1 min-w-[180px] lg:w-56 h-9 bg-white border border-slate-300 rounded-control px-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs shrink-0" aria-hidden="true" />
                    <input 
                      aria-label="Search utility bills" 
                      maxLength={LIMITS.search}
                      type="text"
                      placeholder="Search unit or tenant"
                      value={searchQuery}
                      onChange={e => handleSearchChange(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-label text-slate-700 outline-none p-0 border-0 placeholder-slate-400 no-focus-outline focus:outline-none"
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => handleSearchChange('')} className="p-0.5 text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer">
                        <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                      </button>
                    )}
                  </div>

                  {/* Room Selector */}
                  <select 
                    aria-label="Filter by unit"
                    value={roomFilter}
                    onChange={e => handleRoomChange(e.target.value)}
                    className="h-9 px-3 text-label font-medium border border-slate-300 rounded-control outline-none bg-white text-slate-700 focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Units</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>Unit {r.id}</option>
                    ))}
                  </select>

                  {/* Clean Billing Period Dropdown */}
                  <div className="relative flex items-center">
                    <select 
                      aria-label="Filter by billing period"
                      value={periodFilter}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          handleOpenMonthPicker();
                        } else {
                          handlePeriodChange(val);
                        }
                      }}
                      className="h-9 pl-3 pr-7 text-label font-medium border border-slate-300 rounded-control outline-none bg-white text-slate-700 focus:border-indigo-500 cursor-pointer appearance-none"
                    >
                      <optgroup label="Preset Ranges">
                        <option value="this-month">This Month ({formatBillingPeriod(periodData.currentPeriod)})</option>
                        <option value="last-month">Last Month ({formatBillingPeriod(periodData.lastMonthPeriod)})</option>
                        <option value="past-3-months">Past 3 Months</option>
                        <option value="ytd">Year to Date ({periodData.currentYear})</option>
                        <option value="all">All Time Records ({readings.length})</option>
                      </optgroup>

                      {periodData.recordedPeriods.length > 0 && (
                        <optgroup label="Specific Billing Months">
                          {periodData.recordedPeriods.map(p => (
                            <option key={p.value} value={p.value}>
                              {p.label} ({p.total} {p.total === 1 ? 'record' : 'records'})
                            </option>
                          ))}
                        </optgroup>
                      )}

                      <optgroup label="Custom Range">
                        <option value="__custom__">Pick Month from Calendar...</option>
                      </optgroup>
                    </select>

                    <div className="pointer-events-none absolute right-2.5 text-slate-400">
                      <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
                    </div>

                    {/* Hidden Native Month Input for visual calendar picking */}
                    <input 
                      aria-label="Pick a billing month"
                      ref={monthInputRef}
                      type="month"
                      value={!['this-month', 'last-month', 'past-3-months', 'ytd', 'all'].includes(periodFilter) ? periodFilter : ''}
                      onChange={e => {
                        if (e.target.value) handlePeriodChange(e.target.value);
                      }}
                      className="absolute opacity-0 pointer-events-none w-0 h-0"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>

              {/* Time Range Quick Filter Chips */}
              <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-label">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-caption font-semibold uppercase tracking-wider text-slate-400 mr-1">Range:</span>
                  {[
                    ['this-month', 'This Month'],
                    ['last-month', 'Last Month'],
                    ['past-3-months', 'Past 3 Months'],
                    ['ytd', 'This Year'],
                    ['all', 'All Time'],
                  ].map(([presetKey, presetLabel]) => (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => handlePeriodChange(presetKey)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        periodFilter === presetKey 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {presetLabel}
                    </button>
                  ))}
                </div>

                <div className="text-caption text-slate-500 font-medium">
                  Viewing: <strong className="text-slate-700">{activePeriodLabel}</strong>
                  {filteredReadings.length > 0 && ` · ${filteredReadings.length} reading${filteredReadings.length === 1 ? '' : 's'}`}
                </div>
              </div>

              {/* Utility Records Table */}
              <div className="overflow-x-auto">
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Unit & Tenant</th>
                      <th className={TH}>Billing Period</th>
                      <th className={TH}>Water (m³)</th>
                      <th className={TH}>Electricity (kWh)</th>
                      <th className={`${TH} text-right`}>Total Billed</th>
                      <th className={`${TH} text-center`}>Status</th>
                      <th className={`${TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <SkeletonRows cols={7} label="Loading utility readings…" />
                    ) : error ? (
                      <LoadErrorRow cols={7} title="Couldn't load utility readings" detail={error} onRetry={() => { setError(null); setLoading(true); reloadData(); }} />
                    ) : filteredReadings.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-500 py-6">
                            <FontAwesomeIcon icon={faTint} className="text-3xl text-slate-300 mb-2" />
                            <p className="text-body font-semibold text-slate-700 m-0">No utility readings found</p>
                            <p className="text-label text-slate-500 mt-1 m-0">
                              {periodFilter === 'this-month' 
                                ? `No readings recorded for ${formatBillingPeriod(periodData.currentPeriod)} yet. Click "+ Record Reading" or choose a past period.`
                                : 'No readings match your selected filter criteria.'}
                            </p>
                            {periodFilter === 'this-month' && periodData.recordedPeriods.length > 0 && (
                              <button 
                                type="button" 
                                onClick={() => handlePeriodChange(periodData.recordedPeriods[0].value)}
                                className={btn('secondary', 'sm', 'mt-3')}
                              >
                                View {periodData.recordedPeriods[0].label}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedReadings.map(r => {
                        const totalCost = (r.entry_mode === 'total' ? parseFloat(r.total_amount || 0) : 0) + 
                          parseFloat(r.water_amount || 0) + parseFloat(r.water_other_fees || 0) + 
                          parseFloat(r.electric_amount || 0) + parseFloat(r.electric_other_fees || 0) + 
                          (r.items || []).reduce((sum, it) => sum + parseFloat(it.amount || 0) + parseFloat(it.other_fees || 0), 0);
                        const isInvoiced = r.is_invoiced == 1;

                        return (
                          <tr key={r.id} className={TR}>
                            {/* Unit & Tenant */}
                            <td className={TD}>
                              <div className="flex items-center gap-2.5">
                                <span className="w-8 h-8 rounded-control bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-label shrink-0">
                                  {r.room_name}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-label font-bold text-slate-900 m-0">Unit {r.room_name}</p>
                                  {r.tenant_first_name ? (
                                    <p className="text-caption text-indigo-600 font-medium m-0 truncate">
                                      {personName(r, 'tenant_')}
                                    </p>
                                  ) : r.user_id ? (
                                    <p className="text-caption text-indigo-600 font-medium m-0">
                                      Tenant ID #{r.user_id}
                                    </p>
                                  ) : (
                                    <p className="text-caption text-slate-400 italic m-0">No tenant</p>
                                  )}
                                  {r.has_spike && (
                                    <span
                                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap inline-flex items-center gap-1 text-red-700 bg-red-50 ring-1 ring-red-200 mt-0.5 ring-inset"
                                      title={`Usage rose more than ${SPIKE_THRESHOLD_PCT}% over the previous reading`}
                                    >
                                      <FontAwesomeIcon icon={faExclamationTriangle} className="text-[8px]" />
                                      Usage spike
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Billing Period */}
                            <td className={TD}>
                              <div className="space-y-0.5">
                                <div className="text-label font-semibold text-slate-800">
                                  {formatBillingPeriod(r.billing_period)}
                                </div>
                                {r.reading_date && (
                                  <div className="text-caption text-slate-500 font-normal">
                                    Read: {new Date(r.reading_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Water and Electricity Columns */}
                            {r.entry_mode === 'total' ? (
                              <td colSpan={2} className={TD}>
                                <span className="rounded-full px-2 py-0.5 text-caption font-semibold bg-indigo-50 text-indigo-700">Total only</span>
                                <span className="ml-2 text-slate-600 text-caption">{r.notes || 'No meter readings recorded; total charged directly.'}</span>
                              </td>
                            ) : r.entry_mode === 'bill' ? (<>
                              {/* Provider bill display */}
                              {[
                                { key: 'water', icon: faTint, tone: 'text-blue-500', unit: 'm³', label: 'Water' },
                                { key: 'electric', icon: faBolt, tone: 'text-amber-700', unit: 'kWh', label: 'Electricity' },
                              ].map(({ key, icon, tone, unit, label }) => (
                                <td key={key} className={TD}>
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-label">
                                      <FontAwesomeIcon icon={icon} className={`${tone} text-xs`} />
                                      <span>{peso(r[`${key}_amount`])}</span>
                                    </div>
                                    <div className="text-[11px] font-medium text-slate-500">Provider {label} bill</div>
                                    {hasValue(r[`${key}_consumption`]) ? (
                                      <div className="text-caption text-slate-600">
                                        {r[`${key}_consumption`]} {unit}
                                        <span className="text-slate-400 font-normal ml-1">({r[`${key}_prev_reading`]} → {r[`${key}_curr_reading`]})</span>
                                      </div>
                                    ) : hasValue(r[`${key}_curr_reading`]) ? (
                                      <div className="text-caption text-slate-500">Meter: {r[`${key}_curr_reading`]} {unit}</div>
                                    ) : null}
                                    <ChangeBadge pct={r[`${key}_change_pct`]} />
                                  </div>
                                </td>
                              ))}
                            </>) : (<>
                              {/* Metered reading calculation */}
                              <td className={TD}>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-label">
                                    <FontAwesomeIcon icon={faTint} className="text-blue-500 text-xs" />
                                    <span>{r.water_consumption} m³</span>
                                    <span className="text-slate-400 font-normal text-caption">(@ ₱{r.water_rate_per_unit})</span>
                                  </div>
                                  <div className="text-caption text-slate-600 font-medium">
                                    ₱{parseFloat(r.water_amount || 0).toFixed(2)}
                                    <span className="text-slate-400 font-normal ml-1">({r.water_prev_reading} → {r.water_curr_reading})</span>
                                  </div>
                                  <ChangeBadge pct={r.water_change_pct} />
                                  {parseFloat(r.water_other_fees || 0) > 0 && (
                                    <div className="text-[11px] text-blue-600 font-semibold">+ ₱{parseFloat(r.water_other_fees).toFixed(2)} fees</div>
                                  )}
                                </div>
                              </td>

                              <td className={TD}>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-label">
                                    <FontAwesomeIcon icon={faBolt} className="text-amber-700 text-xs" />
                                    <span>{r.electric_consumption} kWh</span>
                                    <span className="text-slate-400 font-normal text-caption">(@ ₱{r.electric_rate_per_unit})</span>
                                  </div>
                                  <div className="text-caption text-slate-600 font-medium">
                                    ₱{parseFloat(r.electric_amount || 0).toFixed(2)}
                                    <span className="text-slate-400 font-normal ml-1">({r.electric_prev_reading} → {r.electric_curr_reading})</span>
                                  </div>
                                  <ChangeBadge pct={r.electric_change_pct} />
                                  {parseFloat(r.electric_other_fees || 0) > 0 && (
                                    <div className="text-[11px] text-amber-700 font-semibold">+ ₱{parseFloat(r.electric_other_fees).toFixed(2)} fees</div>
                                  )}
                                </div>
                              </td>
                            </>)}

                            {/* Total Cost */}
                            <td className={`${TD} text-right`}>
                              <span className="text-body font-bold text-slate-900 block">
                                ₱{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>

                            {/* Billing Status */}
                            <td className={`${TD} text-center`}>
                              <span className={badge(isInvoiced ? 'success' : 'warning')}>
                                <FontAwesomeIcon icon={isInvoiced ? faCheckCircle : faClock} className="text-[9px]" />
                                {isInvoiced ? 'Invoiced' : 'Pending Sync'}
                              </span>
                              {isInvoiced && r.invoice_id && (
                                <span className="block text-[11px] text-slate-500 font-medium mt-1 font-mono">{r.invoice_id}</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className={`${TD} text-right`}>
                              {!isInvoiced ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSyncTargetId(r.id)}
                                    disabled={syncingId === r.id}
                                    className="inline-flex items-center gap-1 rounded-control bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white px-2.5 py-1 text-label font-bold transition-colors cursor-pointer border border-indigo-200 hover:border-indigo-600 disabled:opacity-50"
                                  >
                                    <FontAwesomeIcon icon={faSync} className={syncingId === r.id ? 'animate-spin' : ''} />
                                    <span>Sync</span>
                                  </button>
                                  {latestPeriodByRoom[r.room_name] === r.billing_period && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(r)}
                                      disabled={syncingId === r.id}
                                      title="Delete this reading to re-record"
                                      className="inline-flex items-center justify-center rounded-control bg-white text-red-600 hover:bg-red-50 w-7 h-7 text-label transition-colors cursor-pointer border border-red-200 disabled:opacity-50"
                                    >
                                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-label font-medium text-slate-400">Synced</span>
                              )}
                              <div className="mt-1 flex items-center justify-end gap-2 text-caption">
                                {r.bill_file_path && (
                                  <a href={fileUrl(r.bill_file_path)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-semibold">View bill</a>
                                )}
                                <label className="cursor-pointer text-slate-500 hover:text-indigo-600 font-medium">
                                  {r.bill_file_path ? 'Replace' : 'Attach bill'}
                                  <input type="file" className="hidden" aria-label={`Attach bill file for Unit ${r.room_name}`} accept={acceptFor(FILE_RULES.document)}
                                    disabled={syncingId === r.id}
                                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleBillFile(r, f); }} />
                                </label>
                                {r.bill_file_path && (
                                  <button type="button" onClick={() => handleBillFile(r, null)} className="cursor-pointer border-0 bg-transparent p-0 text-red-600 hover:underline">Remove</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Clean Pagination Footer */}
              {filteredReadings.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 text-label text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>
                      Showing <strong className="text-slate-800">{filteredReadings.length === 0 ? 0 : (safePage - 1) * pageSize + 1}</strong> to <strong className="text-slate-800">{Math.min(safePage * pageSize, filteredReadings.length)}</strong> of <strong className="text-slate-800">{filteredReadings.length}</strong> readings
                    </span>
                    <span className="text-slate-300">|</span>
                    <label className="flex items-center gap-1.5 text-caption">
                      <span>Per page:</span>
                      <select
                        aria-label="Records per page"
                        value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 outline-none cursor-pointer"
                      >
                        <option value={15}>15</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </label>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-control border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        <FontAwesomeIcon icon={faChevronLeft} className="mr-1 text-[10px]" /> Previous
                      </button>
                      <span className="px-2 text-xs font-medium text-slate-600">
                        Page {safePage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1 rounded-control border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        Next <FontAwesomeIcon icon={faChevronRight} className="ml-1 text-[10px]" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

          </div>
        </div>
      </main>

      {/* Record Reading Modal */}
      <RecordReadingModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          setShowModal(false);
          reloadData();
        }}
        rooms={rooms}
        readings={readings}
      />

      {/* Sync Options Modal */}
      {syncTargetId && (
        <SyncOptionsModal
          readingId={syncTargetId}
          onClose={() => setSyncTargetId(null)}
          onSync={handleSync}
          busy={syncingId === syncTargetId}
        />
      )}
    </div>
  );
}

// Subcomponent: Sync Options Modal
function SyncOptionsModal({ readingId, onClose, onSync, busy = false }) {
  const [syncMode, setSyncMode] = useState('merge');
  const [dueDate, setDueDate] = useState(() => addDays(SYNC_DUE_MAX_DAYS));
  const [minDateStr] = useState(() => localDateString());
  const [maxDateStr] = useState(() => addDays(SYNC_DUE_MAX_DAYS));
  const [dueError, setDueError] = useState('');

  const validateDue = (v) => (syncMode === 'separate'
    ? checkDate(v, { min: minDateStr, max: maxDateStr, label: 'Due date' })
    : '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (busy) return;
    const error = validateDue(dueDate);
    setDueError(error);
    if (error) return;
    onSync(readingId, syncMode, dueDate);
  };

  return (
    <Modal busy={busy} title="Sync Utility to Invoice" onClose={onClose} overlayClassName="flex items-center justify-center p-4 bg-slate-900/60" className="bg-white rounded-card w-full max-w-md overflow-hidden shadow-dialog">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-control bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-body">
            <FontAwesomeIcon icon={faSync} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 m-0 text-body">Sync Utility to Invoice</h3>
            <p className="m-0 text-caption text-slate-500">Choose how to bill this utility charge to the tenant.</p>
          </div>
        </div>
        <button aria-label="Close" type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer text-title p-1">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-3.5" noValidate>
        <div className="space-y-2.5">
          <label className={`flex items-start gap-3 p-3.5 border rounded-card cursor-pointer transition-all ${syncMode === 'merge' ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <input type="radio" name="syncMode" value="merge" checked={syncMode === 'merge'} onChange={() => setSyncMode('merge')} className="mt-1" />
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-800 m-0 text-body">Merge with Monthly Rent</p>
                <span className="rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5">Recommended</span>
              </div>
              <p className="text-caption text-slate-500 m-0 mt-0.5">Appends the charge to the tenant's open invoice for the same month. If none exists, an invoice is generated automatically.</p>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3.5 border rounded-card cursor-pointer transition-all ${syncMode === 'separate' ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <input type="radio" name="syncMode" value="separate" checked={syncMode === 'separate'} onChange={() => setSyncMode('separate')} className="mt-1" />
            <div>
              <p className="font-bold text-slate-800 m-0 text-body">Issue Separate Invoice</p>
              <p className="text-caption text-slate-500 m-0 mt-0.5">Generates a standalone pending invoice strictly for this utility charge.</p>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3.5 border rounded-card cursor-pointer transition-all ${syncMode === 'paid' ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <input type="radio" name="syncMode" value="paid" checked={syncMode === 'paid'} onChange={() => setSyncMode('paid')} className="mt-1" />
            <div>
              <p className="font-bold text-slate-800 m-0 text-body">Mark as Paid (Direct / Cash)</p>
              <p className="text-caption text-slate-500 m-0 mt-0.5">Marks the utility as collected offline without issuing an online invoice.</p>
            </div>
          </label>
        </div>

        {syncMode === 'separate' && (
          <div className="pt-3 border-t border-slate-100">
            <label htmlFor="sync-due_date" className="block text-label font-bold text-slate-700 mb-1">Invoice Due Date</label>
            <input
              type="date"
              id="sync-due_date"
              name="due_date"
              value={dueDate}
              min={minDateStr}
              max={maxDateStr}
              onChange={e => { setDueDate(e.target.value); setDueError(''); }}
              onBlur={() => setDueError(validateDue(dueDate))}
              required
              aria-invalid={dueError ? true : undefined}
              aria-describedby={dueError ? 'sync-due_date-error' : undefined}
              className={`w-full px-3 py-2 text-body border border-slate-300 rounded-control outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${invalidCls(dueError)}`}
            />
            <FieldError id="sync-due_date" error={dueError} />
            <p className="text-caption text-slate-400 mt-1">Due date must be within {SYNC_DUE_MAX_DAYS} days from today.</p>
          </div>
        )}

        <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className={btn('secondary', 'sm')}>Cancel</button>
          <button type="submit" disabled={busy} className={btn('primary', 'sm')}>
            {busy ? 'Syncing…' : 'Confirm Sync'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Subcomponent: Isolated modal to prevent whole-page re-renders during typing
function lastItemReading(readings, room, period, typeId) {
  if (!room || !Array.isArray(readings)) return 0;
  const earlier = readings
    .filter((r) => r.room_name === room && r.entry_mode !== 'total' && r.billing_period < period)
    .sort((a, b) => (a.billing_period < b.billing_period ? 1 : -1));
  for (const r of earlier) {
    const it = (r.items || []).find((i) => Number(i.type_id) === Number(typeId));
    if (it) return parseFloat(it.curr_reading) || 0;
  }
  return 0;
}

// Subcomponent: Record Reading Modal (Redesigned with Modern UI/UX)
function RecordReadingModal({ show, onClose, onSuccess, rooms, readings }) {
  const [submitting, setSubmitting] = useState(false);
  const [billFile, setBillFile] = useState(null);
  const [formData, setFormData] = useState(() => {
    const now = new Date();
    const localMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return {
      room_name: '',
      billing_period: localMonth,
      reading_date: localDate,
      water_curr_reading: '',
      water_other_fees: 0.00,
      electric_curr_reading: '',
      electric_other_fees: 0.00,
      water_rate_per_unit: 40.00,
      electric_rate_per_unit: 12.00,
      entry_mode: 'bill', // 'bill' | 'metered' | 'total'
      water_bill_amount: '',
      electric_bill_amount: '',
      total_amount: '',
      notes: ''
    };
  });
  const [showOptionalMeter, setShowOptionalMeter] = useState(false);

  // Extra utility types (internet, gas, ...) set up in Settings
  const [utilityTypes, setUtilityTypes] = useState([]);
  const [extra, setExtra] = useState({});
  useEffect(() => {
    if (!show) return;
    api.get('/manage_utility_types.php').then((res) => setUtilityTypes(res.data?.types || [])).catch(() => {});
  }, [show]);

  const setExtraField = (type, patch) => setExtra((prev) => ({
    ...prev,
    [type.id]: { on: false, curr: '', rate: String(type.default_rate), ...prev[type.id], ...patch },
  }));

  const extraItems = utilityTypes.filter((t) => extra[t.id]?.on).map((t) => {
    const e = extra[t.id];
    const rate = parseFloat(e.rate) || 0;
    const prev = lastItemReading(readings, formData.room_name, formData.billing_period, t.id);
    const cons = t.billing_mode === 'metered' ? Math.max(0, (parseFloat(e.curr) || 0) - prev) : null;
    return { type: t, prev, e, amount: t.billing_mode === 'metered' ? cons * rate : rate };
  });
  const extraTotal = extraItems.reduce((sum, i) => sum + i.amount, 0);

  const meterPrev = useMemo(() => ({
    water: previousMeterValue(readings, formData.room_name, formData.billing_period, 'water_curr_reading'),
    electric: previousMeterValue(readings, formData.room_name, formData.billing_period, 'electric_curr_reading'),
  }), [formData.room_name, formData.billing_period, readings]);

  const selectedRoomPrevReading = useMemo(() => ({ water: meterPrev.water ?? 0, electric: meterPrev.electric ?? 0 }), [meterPrev]);

  // Live calculation in modal
  const modalCalculations = useMemo(() => {
    const waterCurr = parseFloat(formData.water_curr_reading) || 0;
    const waterPrev = selectedRoomPrevReading.water;
    const waterCons = Math.max(0, waterCurr - waterPrev);
    const waterAmt = waterCons * (parseFloat(formData.water_rate_per_unit) || 40);
    const waterOther = parseFloat(formData.water_other_fees) || 0;
    const totalWater = waterAmt + waterOther;

    const elecCurr = parseFloat(formData.electric_curr_reading) || 0;
    const elecPrev = selectedRoomPrevReading.electric;
    const elecCons = Math.max(0, elecCurr - elecPrev);
    const elecAmt = elecCons * (parseFloat(formData.electric_rate_per_unit) || 12);
    const elecOther = parseFloat(formData.electric_other_fees) || 0;
    const totalElec = elecAmt + elecOther;

    return {
      waterPrev,
      waterCons: waterCons.toFixed(2),
      waterAmt: waterAmt.toFixed(2),
      waterOther: waterOther.toFixed(2),
      totalWater: totalWater.toFixed(2),
      elecPrev,
      elecCons: elecCons.toFixed(2),
      elecAmt: elecAmt.toFixed(2),
      elecOther: elecOther.toFixed(2),
      totalElec: totalElec.toFixed(2),
      totalAmt: (totalWater + totalElec).toFixed(2)
    };
  }, [formData, selectedRoomPrevReading]);

  const meterCheck = (v, label, prev, required) => checkAmount(v, { label, min: prev, required })
    .replace(`at least ${prev}`, `at least the previous reading (${prev})`);

  const readingForm = useFieldErrors({
    room_name: (v) => (rooms.some(r => String(r.id) === String(v)) ? '' : 'Please select a unit.'),
    billing_period: (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? '')) ? '' : 'Billing period is required.'),
    reading_date: (v, all) => checkDate(v, { label: 'Reading date', max: localDateString(), min: all.billing_period ? `${all.billing_period}-01` : undefined }),
    water_curr_reading: (v, all) => (all.entry_mode === 'total' ? ''
      : all.entry_mode === 'bill' ? meterCheck(v, 'Water reading', meterPrev.water ?? 0, false)
      : meterCheck(v, 'Water reading', selectedRoomPrevReading.water, true)),
    electric_curr_reading: (v, all) => (all.entry_mode === 'total' ? ''
      : all.entry_mode === 'bill' ? meterCheck(v, 'Electricity reading', meterPrev.electric ?? 0, false)
      : meterCheck(v, 'Electricity reading', selectedRoomPrevReading.electric, true)),
    water_bill_amount: (v, all) => (all.entry_mode !== 'bill' ? ''
      : checkAmount(v, { label: 'Water bill amount', max: 1000000, required: false })
        || (!(Number(v) > 0) && !(Number(all.electric_bill_amount) > 0) ? 'Enter the water or electricity bill amount.' : '')),
    electric_bill_amount: (v, all) => (all.entry_mode !== 'bill' ? ''
      : checkAmount(v, { label: 'Electricity bill amount', max: 1000000, required: false })),
    water_rate_per_unit: (v, all) => all.entry_mode !== 'metered' ? '' : checkAmount(v, { label: 'Water rate', min: 0.01, max: 1000, allowZero: false }),
    electric_rate_per_unit: (v, all) => all.entry_mode !== 'metered' ? '' : checkAmount(v, { label: 'Electricity rate', min: 0.01, max: 1000, allowZero: false }),
    water_other_fees: (v, all) => all.entry_mode !== 'metered' ? '' : checkAmount(v, { label: 'Other water fees', required: false }),
    electric_other_fees: (v, all) => all.entry_mode !== 'metered' ? '' : checkAmount(v, { label: 'Other electricity fees', required: false }),
    total_amount: (v, all) => (all.entry_mode === 'total' ? checkAmount(v, { label: 'Total amount', min: 0.01, allowZero: false }) : ''),
    notes: (v) => checkText(v, { label: 'Notes', max: LIMITS.notes, required: false }),
  }, { idPrefix: 'reading-' });

  if (!show) return null;

  const fieldCls = (name, base) => base + invalidCls(readingForm.errors[name]);

  const handleBlur = (e) => {
    const { name, value } = e.target;
    const v = name === 'notes' ? value.trim() : value;
    if (v !== value) setFormData(prev => ({ ...prev, [name]: v }));
    readingForm.validateField(name, { ...formData, [name]: v });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    readingForm.clearError(name);
    if (name === 'electric_bill_amount') readingForm.clearError('water_bill_amount');
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'room_name' || name === 'billing_period') {
        const last = findPreviousReading(readings, next.room_name, next.billing_period);
        if (last) {
          next.water_rate_per_unit = parseFloat(last.water_rate_per_unit) || next.water_rate_per_unit;
          next.electric_rate_per_unit = parseFloat(last.electric_rate_per_unit) || next.electric_rate_per_unit;
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const clean = { ...formData, notes: String(formData.notes ?? '').trim() };
    setFormData(clean);
    if (!readingForm.validateAll(clean)) return;
    setSubmitting(true);
    try {
      const items = extraItems.map(({ type, e }) => (type.billing_mode === 'metered'
        ? { type_id: Number(type.id), curr_reading: e.curr, rate: e.rate }
        : { type_id: Number(type.id), rate: e.rate }));
      const base = { room_name: clean.room_name, billing_period: clean.billing_period, reading_date: clean.reading_date, notes: clean.notes };
      const res = await api.post('/save_utility_reading.php', clean.entry_mode === 'total'
        ? { ...base, entry_mode: 'total', total_amount: clean.total_amount }
        : clean.entry_mode === 'bill'
          ? {
            ...base, entry_mode: 'bill', items,
            water_bill_amount: clean.water_bill_amount === '' ? 0 : clean.water_bill_amount,
            electric_bill_amount: clean.electric_bill_amount === '' ? 0 : clean.electric_bill_amount,
            ...(hasValue(clean.water_curr_reading) ? { water_curr_reading: clean.water_curr_reading } : {}),
            ...(hasValue(clean.electric_curr_reading) ? { electric_curr_reading: clean.electric_curr_reading } : {}),
          }
          : { ...clean, items });
      if (res?.data?.success) {
        let billWarning = null;
        if (billFile) {
          try {
            const fd = new FormData();
            fd.append('reading_id', res.data.id);
            fd.append('bill', billFile);
            const up = await api.post('/upload_utility_bill.php', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (!up?.data?.success) billWarning = up?.data?.message || 'The reading was saved, but the bill could not be attached.';
          } catch (upErr) {
            billWarning = `The reading was saved, but the bill could not be attached: ${apiErrorMessage(upErr, 'upload failed.')} Use "Attach bill" on the reading to retry.`;
          }
        }
        toast.success([res.data.message || "Utility reading saved successfully!", res.data.warning, billWarning].filter(Boolean).join('\n\n'));
        onSuccess();
      } else if (!readingForm.applyServerErrors(res)) {
        toast.error(res?.data?.message || "Failed to save reading.");
      }
    } catch (err) {
      console.error("Save reading error:", err);
      if (!readingForm.applyServerErrors(err)) toast.error(apiErrorMessage(err, "Failed to save reading."));
    } finally {
      setSubmitting(false);
    }
  };

  const calculatedTotal = (formData.entry_mode === 'bill'
    ? (parseFloat(formData.water_bill_amount) || 0) + (parseFloat(formData.electric_bill_amount) || 0)
    : formData.entry_mode === 'total'
      ? (parseFloat(formData.total_amount) || 0)
      : parseFloat(modalCalculations.totalAmt)) + extraTotal;

  return (
    <Modal busy={submitting} title="Record Unit Utility Bill" onClose={onClose} overlayClassName="flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 overflow-y-auto" className="bg-white rounded-dialog border border-slate-100 shadow-dialog w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto" style={{ transform: 'translateZ(0)' }}>
      {/* Modal Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-body shrink-0">
            <FontAwesomeIcon icon={faBolt} />
          </div>
          <div>
            <h3 className="text-title font-bold text-slate-900 m-0">Record Unit Utility Bill</h3>
            <p className="m-0 text-caption text-slate-500">Record provider bill amounts or sub-meter readings for an occupied unit.</p>
          </div>
        </div>
        <button aria-label="Close" type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1.5 transition-colors">
          <FontAwesomeIcon icon={faTimes} className="text-base" />
        </button>
      </div>

      {/* Modal Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden m-0" noValidate>
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-5 text-left">
          
          {/* Unit, Period and Reading Date Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div>
              <label htmlFor="reading-room_name" className="block text-label font-bold text-slate-700 mb-1">Target Unit *</label>
              <select
                {...readingForm.fieldA11y('room_name')}
                onBlur={handleBlur}
                value={formData.room_name}
                onChange={handleInputChange}
                required
                className={fieldCls('room_name', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label font-medium text-slate-800 outline-none focus:border-indigo-500 cursor-pointer")}
              >
                <option value="">Select occupied unit</option>
                {rooms.filter(room => room.status === 'occupied').map(room => (
                  <option key={room.id} value={room.id}>
                    Unit {room.id} {room.tenant ? `(${room.tenant})` : ''}
                  </option>
                ))}
              </select>
              <FieldError id="reading-room_name" error={readingForm.errors.room_name} />
            </div>

            <div>
              <label htmlFor="reading-billing_period" className="block text-label font-bold text-slate-700 mb-1">Billing Month *</label>
              <input
                type="month"
                {...readingForm.fieldA11y('billing_period')}
                onBlur={handleBlur}
                value={formData.billing_period}
                onChange={handleInputChange}
                required
                className={fieldCls('billing_period', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label font-medium text-slate-800 outline-none focus:border-indigo-500")}
              />
              <FieldError id="reading-billing_period" error={readingForm.errors.billing_period} />
            </div>

            <div>
              <label htmlFor="reading-reading_date" className="block text-label font-bold text-slate-700 mb-1">Reading Date *</label>
              <input
                type="date"
                {...readingForm.fieldA11y('reading_date')}
                onBlur={handleBlur}
                max={localDateString()}
                min={formData.billing_period ? `${formData.billing_period}-01` : undefined}
                value={formData.reading_date}
                onChange={handleInputChange}
                required
                className={fieldCls('reading_date', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label font-medium text-slate-800 outline-none focus:border-indigo-500")}
              />
              <FieldError id="reading-reading_date" error={readingForm.errors.reading_date} />
            </div>
          </div>

          {/* Mode Selector Segmented Tabs */}
          <div>
            <label className="block text-caption font-bold text-slate-500 uppercase tracking-wider mb-2">Recording Method</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="How to record">
              {[
                ['bill', 'Provider Bill', 'Exact Meralco / water bill amounts'],
                ['metered', 'Sub-Meter Readings', 'Meter reading × unit consumption rate'],
                ['total', 'Total Amount Only', 'Single lump-sum charge without meter readings'],
              ].map(([mode, title, desc]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={formData.entry_mode === mode}
                  onClick={() => setFormData(prev => ({ ...prev, entry_mode: mode }))}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    formData.entry_mode === mode
                      ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-label font-bold ${formData.entry_mode === mode ? 'text-indigo-900' : 'text-slate-800'}`}>{title}</span>
                    {formData.entry_mode === mode && <FontAwesomeIcon icon={faCheck} className="text-indigo-600 text-xs" />}
                  </div>
                  <span className="block text-caption text-slate-500 mt-1 leading-snug">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Provider Bill Inputs */}
          {formData.entry_mode === 'bill' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Water bill */}
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="reading-water_bill_amount" className="text-label font-bold text-slate-800 flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faTint} className="text-blue-500" /> Water Bill Amount
                    </label>
                    <span className="text-caption text-blue-700 font-semibold">PrimeWater</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-label">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      {...readingForm.fieldA11y('water_bill_amount')}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      onKeyDown={blockNonNumericKeys}
                      min="0"
                      max="1000000"
                      value={formData.water_bill_amount}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      className={fieldCls('water_bill_amount', "w-full rounded-control border border-slate-300 bg-white pl-8 pr-3 py-2 text-body font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100")}
                    />
                  </div>
                  <FieldError id="reading-water_bill_amount" error={readingForm.errors.water_bill_amount} />
                </div>

                {/* Electric bill */}
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="reading-electric_bill_amount" className="text-label font-bold text-slate-800 flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faBolt} className="text-amber-700" /> Electricity Bill Amount
                    </label>
                    <span className="text-caption text-amber-800 font-semibold">Meralco</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-label">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      {...readingForm.fieldA11y('electric_bill_amount')}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      onKeyDown={blockNonNumericKeys}
                      min="0"
                      max="1000000"
                      value={formData.electric_bill_amount}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      className={fieldCls('electric_bill_amount', "w-full rounded-control border border-slate-300 bg-white pl-8 pr-3 py-2 text-body font-semibold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100")}
                    />
                  </div>
                  <FieldError id="reading-electric_bill_amount" error={readingForm.errors.electric_bill_amount} />
                </div>
              </div>

              {/* Optional Meter Reading Accordion in Bill Mode */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                <button 
                  type="button" 
                  aria-expanded={showOptionalMeter} 
                  onClick={() => setShowOptionalMeter(v => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 border-0 bg-transparent text-left text-label font-bold text-slate-700 cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faLayerGroup} className="text-slate-400 text-xs" />
                    <span>Include Sub-Meter Readings (Optional, for records)</span>
                  </div>
                  <span className="text-xs text-indigo-600 font-semibold">{showOptionalMeter ? 'Hide readings' : 'Add readings'}</span>
                </button>
                {showOptionalMeter && (
                  <div className="p-4 border-t border-slate-200 bg-white space-y-3">
                    <p className="m-0 text-caption text-slate-500">Record the sub-meter numbers alongside the provider invoice for tenant reference.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label htmlFor="reading-water_curr_reading" className="text-caption font-bold text-slate-700">Water Meter (m³)</label>
                          {meterPrev.water !== null && <span className="text-[11px] text-slate-500">Prev: {meterPrev.water} m³</span>}
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          {...readingForm.fieldA11y('water_curr_reading')}
                          onBlur={handleBlur}
                          inputMode="decimal"
                          onKeyDown={blockNonNumericKeys}
                          min={meterPrev.water ?? 0}
                          value={formData.water_curr_reading}
                          onChange={handleInputChange}
                          placeholder={meterPrev.water === null ? 'Initial reading' : `Previous was ${meterPrev.water}`}
                          className={fieldCls('water_curr_reading', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-blue-500")}
                        />
                        <FieldError id="reading-water_curr_reading" error={readingForm.errors.water_curr_reading} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label htmlFor="reading-electric_curr_reading" className="text-caption font-bold text-slate-700">Electricity Meter (kWh)</label>
                          {meterPrev.electric !== null && <span className="text-[11px] text-slate-500">Prev: {meterPrev.electric} kWh</span>}
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          {...readingForm.fieldA11y('electric_curr_reading')}
                          onBlur={handleBlur}
                          inputMode="decimal"
                          onKeyDown={blockNonNumericKeys}
                          min={meterPrev.electric ?? 0}
                          value={formData.electric_curr_reading}
                          onChange={handleInputChange}
                          placeholder={meterPrev.electric === null ? 'Initial reading' : `Previous was ${meterPrev.electric}`}
                          className={fieldCls('electric_curr_reading', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-amber-500")}
                        />
                        <FieldError id="reading-electric_curr_reading" error={readingForm.errors.electric_curr_reading} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sub-Meter Readings Mode */}
          {formData.entry_mode === 'metered' && (
            <div className="space-y-4">
              {/* Water Sub-Meter Section */}
              <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-200 space-y-3">
                <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                  <span className="text-label font-bold text-blue-900 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faTint} className="text-blue-500" /> Water Sub-Meter
                  </span>
                  <span className="text-caption text-blue-700 font-semibold bg-blue-100/70 px-2 py-0.5 rounded-full">
                    Previous: <strong>{modalCalculations.waterPrev} m³</strong>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="reading-water_curr_reading" className="block text-caption font-bold text-slate-700 mb-1">Current Reading (m³)</label>
                    <input
                      type="number"
                      step="0.01"
                      {...readingForm.fieldA11y('water_curr_reading')}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      onKeyDown={blockNonNumericKeys}
                      min={modalCalculations.waterPrev}
                      max={MAX_AMOUNT}
                      value={formData.water_curr_reading}
                      onChange={handleInputChange}
                      placeholder={modalCalculations.waterPrev.toString()}
                      required
                      className={fieldCls('water_curr_reading', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-blue-500")}
                    />
                    <FieldError id="reading-water_curr_reading" error={readingForm.errors.water_curr_reading} />
                  </div>
                  <div>
                    <label htmlFor="reading-water_rate_per_unit" className="block text-caption font-bold text-slate-700 mb-1">Rate per m³ (₱)</label>
                    <input
                      type="number"
                      step="0.01"
                      {...readingForm.fieldA11y('water_rate_per_unit')}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      onKeyDown={blockNonNumericKeys}
                      min="0.01"
                      max="1000"
                      value={formData.water_rate_per_unit}
                      onChange={handleInputChange}
                      required
                      className={fieldCls('water_rate_per_unit', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-blue-500")}
                    />
                    <FieldError id="reading-water_rate_per_unit" error={readingForm.errors.water_rate_per_unit} />
                  </div>
                  <div>
                    <label htmlFor="reading-water_other_fees" className="block text-caption font-bold text-slate-700 mb-1">Fixed Fees (₱)</label>
                    <input
                      type="number"
                      step="0.01"
                      {...readingForm.fieldA11y('water_other_fees')}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      onKeyDown={blockNonNumericKeys}
                      min="0"
                      max={MAX_AMOUNT}
                      value={formData.water_other_fees}
                      onChange={handleInputChange}
                      className={fieldCls('water_other_fees', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-blue-500")}
                    />
                    <FieldError id="reading-water_other_fees" error={readingForm.errors.water_other_fees} />
                  </div>
                </div>
                <div className="text-caption text-blue-900 font-semibold flex justify-between pt-2 border-t border-blue-100">
                  <span>Consumption: <strong>{modalCalculations.waterCons} m³</strong></span>
                  <span>Water Total: <strong>₱{modalCalculations.totalWater}</strong></span>
                </div>
              </div>

              {/* Electricity Sub-Meter Section */}
              <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-200 space-y-3">
                <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                  <span className="text-label font-bold text-amber-900 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faBolt} className="text-amber-700" /> Electricity Sub-Meter
                  </span>
                  <span className="text-caption text-amber-800 font-semibold bg-amber-100/70 px-2 py-0.5 rounded-full">
                    Previous: <strong>{modalCalculations.elecPrev} kWh</strong>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="reading-electric_curr_reading" className="block text-caption font-bold text-slate-700 mb-1">Current Reading (kWh)</label>
                    <input
                      type="number"
                      step="0.01"
                      {...readingForm.fieldA11y('electric_curr_reading')}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      onKeyDown={blockNonNumericKeys}
                      min={modalCalculations.elecPrev}
                      max={MAX_AMOUNT}
                      value={formData.electric_curr_reading}
                      onChange={handleInputChange}
                      placeholder={modalCalculations.elecPrev.toString()}
                      required
                      className={fieldCls('electric_curr_reading', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-amber-500")}
                    />
                    <FieldError id="reading-electric_curr_reading" error={readingForm.errors.electric_curr_reading} />
                  </div>
                  <div>
                    <label htmlFor="reading-electric_rate_per_unit" className="block text-caption font-bold text-slate-700 mb-1">Rate per kWh (₱)</label>
                    <input
                      type="number"
                      step="0.01"
                      {...readingForm.fieldA11y('electric_rate_per_unit')}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      onKeyDown={blockNonNumericKeys}
                      min="0.01"
                      max="1000"
                      value={formData.electric_rate_per_unit}
                      onChange={handleInputChange}
                      required
                      className={fieldCls('electric_rate_per_unit', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-amber-500")}
                    />
                    <FieldError id="reading-electric_rate_per_unit" error={readingForm.errors.electric_rate_per_unit} />
                  </div>
                  <div>
                    <label htmlFor="reading-electric_other_fees" className="block text-caption font-bold text-slate-700 mb-1">Fixed Fees (₱)</label>
                    <input
                      type="number"
                      step="0.01"
                      {...readingForm.fieldA11y('electric_other_fees')}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      onKeyDown={blockNonNumericKeys}
                      min="0"
                      max={MAX_AMOUNT}
                      value={formData.electric_other_fees}
                      onChange={handleInputChange}
                      className={fieldCls('electric_other_fees', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-amber-500")}
                    />
                    <FieldError id="reading-electric_other_fees" error={readingForm.errors.electric_other_fees} />
                  </div>
                </div>
                <div className="text-caption text-amber-900 font-semibold flex justify-between pt-2 border-t border-amber-100">
                  <span>Consumption: <strong>{modalCalculations.elecCons} kWh</strong></span>
                  <span>Electricity Total: <strong>₱{modalCalculations.totalElec}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* Total Only Mode */}
          {formData.entry_mode === 'total' && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <label htmlFor="reading-total_amount" className="block text-label font-bold text-slate-800 mb-1">Total Utilities Amount (₱) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-label">₱</span>
                <input
                  type="number"
                  step="0.01"
                  {...readingForm.fieldA11y('total_amount')}
                  onBlur={handleBlur}
                  inputMode="decimal"
                  onKeyDown={blockNonNumericKeys}
                  min="0.01"
                  max={MAX_AMOUNT}
                  value={formData.total_amount}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className={fieldCls('total_amount', "w-full rounded-control border border-slate-300 bg-white pl-8 pr-3 py-2 text-body font-bold text-slate-800 outline-none focus:border-indigo-500")}
                />
              </div>
              <FieldError id="reading-total_amount" error={readingForm.errors.total_amount} />
              <p className="m-0 mt-1.5 text-caption text-slate-500">A fixed total amount is charged. Use the notes field below to document what this charge covers.</p>
            </div>
          )}

          {/* Extra utility types */}
          {formData.entry_mode !== 'total' && utilityTypes.length > 0 && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="m-0 text-label font-bold text-slate-700">Other Utility Types (Optional)</p>
              {utilityTypes.map((t) => {
                const e = extra[t.id] || { on: false, curr: '', rate: String(t.default_rate) };
                const prev = lastItemReading(readings, formData.room_name, formData.billing_period, t.id);
                const metered = t.billing_mode === 'metered';
                return (
                  <div key={t.id} className="grid grid-cols-12 items-center gap-2 text-label pt-1">
                    <label className="col-span-12 sm:col-span-4 flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={e.on} onChange={(ev) => setExtraField(t, { on: ev.target.checked })} />
                      {t.name}
                    </label>
                    {metered && (
                      <input type="number" min={prev} step="0.01" disabled={!e.on} value={e.curr} onChange={(ev) => setExtraField(t, { curr: ev.target.value })}
                        aria-label={`${t.name} current reading`} placeholder={`Reading (prev ${prev})`} className="col-span-6 sm:col-span-4 rounded-control border border-slate-300 bg-white px-2 py-1.5 text-label" />
                    )}
                    <input type="number" min="0" step="0.01" disabled={!e.on} value={e.rate} onChange={(ev) => setExtraField(t, { rate: ev.target.value })}
                      aria-label={`${t.name} ${metered ? 'rate' : 'fee'}`} placeholder={metered ? `Rate per ${t.unit_label || 'unit'}` : 'Flat fee'}
                      className={`rounded-control border border-slate-300 bg-white px-2 py-1.5 text-label ${metered ? 'col-span-6 sm:col-span-4' : 'col-span-12 sm:col-span-8'}`} />
                  </div>
                );
              })}
              {extraTotal > 0 && <p className="m-0 text-right text-caption font-semibold text-slate-600">Other utilities total: ₱{extraTotal.toFixed(2)}</p>}
            </div>
          )}

          {/* Combined Total Preview Box */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-sm">
            <div>
              <p className="m-0 text-caption uppercase tracking-wider text-slate-400 font-semibold">Total to Bill Tenant</p>
              <p className="m-0 text-xs text-slate-300">
                {formData.entry_mode === 'bill' ? 'Water + Electricity Provider Bills' : formData.entry_mode === 'metered' ? 'Metered Consumption + Fees' : 'Fixed Total Amount'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-emerald-400">
                ₱{calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Provider Bill File & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reading-bill_file" className="block text-label font-bold text-slate-700 mb-1">Attach Provider Bill (PDF/Photo)</label>
              <div className="flex items-center gap-2">
                <input
                  id="reading-bill_file"
                  type="file"
                  accept={acceptFor(FILE_RULES.document)}
                  onChange={(ev) => {
                    const f = ev.target.files?.[0] || null;
                    const err = f ? checkFile(f, FILE_RULES.document) : null;
                    if (err) { toast.error(err); ev.target.value = ''; setBillFile(null); return; }
                    setBillFile(f);
                  }}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-control file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>
              <p className="m-0 mt-1 text-caption text-slate-400">Optional: Attached PDF or image bill will be viewable by the tenant.</p>
            </div>

            <div>
              <label htmlFor="reading-notes" className="block text-label font-bold text-slate-700 mb-1">Notes (Optional)</label>
              <input
                type="text"
                {...readingForm.fieldA11y('notes')}
                onBlur={handleBlur}
                maxLength={LIMITS.notes}
                autoComplete="off"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="e.g. Sub-meter verified, tenant present"
                className={fieldCls('notes', "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-800 outline-none focus:border-indigo-500")}
              />
              <FieldError id="reading-notes" error={readingForm.errors.notes} />
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50/80 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className={btn('secondary', 'sm')}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={btn('primary', 'sm')}
          >
            {submitting ? 'Saving...' : formData.entry_mode === 'metered' ? 'Save & Calculate' : 'Save Reading'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
