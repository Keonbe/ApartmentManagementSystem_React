import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBolt, faTint, faPlus, faSync, faSearch, faCheckCircle, 
  faReceipt, faFileInvoiceDollar, faClock,
  faTimes, faCalendarAlt, faChartLine, faTrash, faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, MAX_AMOUNT, addDays, checkAmount, checkDate, checkText, localDateString } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import fileUrl from '../api/fileUrl';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';

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

// The reading a new one is computed from: the unit's latest earlier billing period
// (the same rule save_utility_reading.php applies).
function findPreviousReading(readings, roomName, period) {
  if (!roomName || !Array.isArray(readings)) return null;
  return readings
    .filter(r => r.room_name === roomName && (!period || r.billing_period < period))
    .sort((a, b) => b.billing_period.localeCompare(a.billing_period))[0] || null;
}

function ChangeBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const tone = pct > SPIKE_THRESHOLD_PCT ? 'text-rose-600' : 'text-slate-400';
  return (
    <div className={`text-[10px] font-semibold ${tone}`}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '■'} {Math.abs(pct)}% vs previous
    </div>
  );
}

export default function AdminUtilities() {
  const navigate = useNavigate();
  const [readings, setReadings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncingId, setSyncingId] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

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
        } else {
          setReadings([]);
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

  // Dynamic billing periods categorized with metadata & record counts
  const periodData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPeriod = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // Count readings per billing_period
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

    // Recorded periods list (sorted newest first)
    const recordedPeriods = Object.keys(periodCounts)
      .sort((a, b) => b.localeCompare(a))
      .map(p => ({
        value: p,
        label: formatBillingPeriod(p),
        total: periodCounts[p].total,
        roomCount: periodCounts[p].roomCount
      }));

    // Other recent months (past 12 months down to -12, plus next 2)
    const otherRecentMonths = [];
    for (let i = -12; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!periodCounts[val]) {
        otherRecentMonths.push({
          value: val,
          label: formatBillingPeriod(val)
        });
      }
    }
    otherRecentMonths.sort((a, b) => b.value.localeCompare(a.value));

    // Custom selected period check (if user picked something via calendar outside lists)
    const isCustomPeriod = periodFilter && 
      periodFilter !== 'last-3-months' && 
      periodFilter !== 'ytd' && 
      !periodCounts[periodFilter] && 
      !otherRecentMonths.some(m => m.value === periodFilter);

    return {
      currentYear,
      currentPeriod,
      lastMonthPeriod,
      recordedPeriods,
      otherRecentMonths,
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
        alert(res.data.message || "Synced successfully!");
        setSyncTargetId(null);
        reloadData();
      } else {
        alert(res?.data?.message || "Failed to sync.");
      }
    } catch (err) {
      console.error("Sync error:", err);
      alert(apiErrorMessage(err, "Failed to sync utility."));
    } finally {
      setSyncingId(null);
    }
  };

  // Attach / replace the provider's bill on a reading (file = null removes it).
  const handleBillFile = async (reading, file) => {
    if (file) {
      const fileError = checkFile(file, FILE_RULES.document);
      if (fileError) { alert(fileError); return; }
    } else if (!window.confirm('Remove the bill file from this reading?')) {
      return;
    }
    const fd = new FormData();
    fd.append('reading_id', reading.id);
    if (file) fd.append('bill', file); else fd.append('remove', '1');
    setSyncingId(reading.id);
    try {
      const res = await api.post('/upload_utility_bill.php', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res?.data?.success) reloadData(); else alert(res?.data?.message || 'Could not update the bill file.');
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not update the bill file.'));
    } finally {
      setSyncingId(null);
    }
  };

  // Only a unit's latest reading can be deleted — the next reading is computed from it.
  const latestPeriodByRoom = useMemo(() => {
    const latest = {};
    readings.forEach(r => {
      if (!latest[r.room_name] || r.billing_period > latest[r.room_name]) latest[r.room_name] = r.billing_period;
    });
    return latest;
  }, [readings]);

  const handleDelete = async (reading) => {
    if (!window.confirm(`Delete the ${formatBillingPeriod(reading.billing_period)} reading for Unit ${reading.room_name}? You can record it again afterwards.`)) return;
    setSyncingId(reading.id);
    try {
      const res = await api.post('/delete_utility_reading.php', { id: reading.id });
      alert(res?.data?.message || "Reading deleted.");
      if (res?.data?.success) reloadData();
    } catch (err) {
      console.error("Delete reading error:", err);
      alert(err?.response?.data?.message || "Failed to delete the reading.");
    } finally {
      setSyncingId(null);
    }
  };

  // KPI Calculations
  const stats = useMemo(() => {
    if (!Array.isArray(readings)) return { waterM3: '0.0', waterPHP: '0.00', elecKWh: '0.0', elecPHP: '0.00', totalUtilityPHP: '0.00', pendingSyncCount: 0 };
    const totalWaterM3 = readings.reduce((acc, r) => acc + (parseFloat(r.water_consumption) || 0), 0);
    const totalWaterPHP = readings.reduce((acc, r) => acc + (parseFloat(r.water_amount) || 0) + (parseFloat(r.water_other_fees) || 0), 0);
    const totalElecKWh = readings.reduce((acc, r) => acc + (parseFloat(r.electric_consumption) || 0), 0);
    const totalElecPHP = readings.reduce((acc, r) => acc + (parseFloat(r.electric_amount) || 0) + (parseFloat(r.electric_other_fees) || 0), 0);
    const totalUtilityPHP = totalWaterPHP + totalElecPHP;
    const pendingSyncCount = readings.filter(r => !r.is_invoiced || r.is_invoiced == 0).length;

    return {
      waterM3: totalWaterM3.toFixed(1),
      waterPHP: totalWaterPHP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      elecKWh: totalElecKWh.toFixed(1),
      elecPHP: totalElecPHP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalUtilityPHP: totalUtilityPHP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      pendingSyncCount
    };
  }, [readings]);

  // Filtered readings
  const filteredReadings = useMemo(() => {
    if (!Array.isArray(readings)) return [];
    return readings.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        (r.room_name && String(r.room_name).toLowerCase().includes(q)) ||
        (r.billing_period && String(r.billing_period).toLowerCase().includes(q)) ||
        (r.notes && String(r.notes).toLowerCase().includes(q));

      const matchRoom = roomFilter === 'all' || r.room_name === roomFilter;

      let matchPeriod = true;
      if (periodFilter === 'last-3-months') {
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const [rYear, rMonth] = (r.billing_period || '').split('-');
        if (rYear && rMonth) {
          const rDate = new Date(parseInt(rYear, 10), parseInt(rMonth, 10) - 1, 1);
          matchPeriod = rDate >= threeMonthsAgo;
        }
      } else if (periodFilter === 'ytd') {
        const [rYear] = (r.billing_period || '').split('-');
        matchPeriod = parseInt(rYear, 10) === new Date().getFullYear();
      } else if (periodFilter) {
        matchPeriod = r.billing_period === periodFilter;
      }

      let matchStatus = true;
      if (statusFilter === 'pending') matchStatus = !r.is_invoiced || r.is_invoiced == 0;
      else if (statusFilter === 'invoiced') matchStatus = r.is_invoiced == 1;

      return matchSearch && matchRoom && matchPeriod && matchStatus;
    });
  }, [readings, searchQuery, roomFilter, periodFilter, statusFilter]);

  return (
    <div className="admin-shell flex h-screen w-full font-sans" style={{ backgroundColor: '#f8fafc', color: '#0f172a' }}>
      {/* Persistent / Mobile Responsive Admin Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left" style={{ backgroundColor: '#f8fafc' }}>
        <Header title="Utility Tracking & Sub-Meters" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" style={{ backgroundColor: '#f8fafc' }}>
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Top KPI Summary Metric Cards */}
            <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Water Card */}
              <div className="card-interactive bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-xl">
                  <FontAwesomeIcon icon={faTint} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider m-0">Water Consumption</p>
                  <p className="text-xl lg:text-2xl font-black text-slate-800 m-0 mt-0.5">{stats.waterM3} m³</p>
                  <p className="text-xs font-semibold text-blue-600 m-0 mt-0.5">₱{stats.waterPHP} billed</p>
                </div>
              </div>

              {/* Electric Card */}
              <div className="card-interactive bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 text-xl">
                  <FontAwesomeIcon icon={faBolt} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider m-0">Electricity Usage</p>
                  <p className="text-xl lg:text-2xl font-black text-slate-800 m-0 mt-0.5">{stats.elecKWh} kWh</p>
                  <p className="text-xs font-semibold text-amber-600 m-0 mt-0.5">₱{stats.elecPHP} billed</p>
                </div>
              </div>

              {/* Pending Sync Card */}
              <div className="card-interactive bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 text-xl">
                  <FontAwesomeIcon icon={faFileInvoiceDollar} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider m-0">Pending Invoice Sync</p>
                  <p className="text-xl lg:text-2xl font-black text-slate-800 m-0 mt-0.5">{stats.pendingSyncCount}</p>
                  <p className="text-xs font-semibold text-slate-500 m-0 mt-0.5">Ready to invoice</p>
                </div>
              </div>

              {/* Total Utility Card */}
              <div className="card-interactive bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 text-xl">
                  <FontAwesomeIcon icon={faReceipt} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider m-0">Total Utility (₱)</p>
                  <p className="text-xl lg:text-2xl font-black text-slate-800 m-0 mt-0.5">₱{stats.totalUtilityPHP}</p>
                  <p className="text-xs font-semibold text-emerald-600 m-0 mt-0.5">Combined Billed</p>
                </div>
              </div>

            </div>

            {/* Filter & Action Control Toolbar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                
                {/* Search & Unit Filter */}
                <div className="flex flex-1 items-center gap-3 flex-wrap">
                  <div className="relative min-w-[200px] flex-1 max-w-md">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                    <input maxLength={LIMITS.search}
                      type="text"
                      placeholder="Search unit, notes, period..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    />
                  </div>

                  {/* Room Selector */}
                  <select
                    value={roomFilter}
                    onChange={e => setRoomFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Units</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>Unit {r.id}</option>
                    ))}
                  </select>

                  {/* Dynamic Billing Period Dropdown & Calendar Picker */}
                  <div className="relative flex items-center">
                    <button
                      type="button"
                      onClick={handleOpenMonthPicker}
                      className="absolute left-3 text-slate-400 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer p-0 text-xs z-10 flex items-center justify-center"
                      title="Open Calendar Month Picker"
                    >
                      <FontAwesomeIcon icon={faCalendarAlt} />
                    </button>
                    
                    <select
                      value={periodFilter}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          handleOpenMonthPicker();
                        } else {
                          setPeriodFilter(val);
                        }
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-7 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 cursor-pointer appearance-none hover:bg-slate-100 transition-colors max-w-[230px] truncate"
                      title="Filter by Billing Period"
                    >
                      <option value="">All Periods ({readings.length})</option>

                      <optgroup label="⚡ Quick Presets">
                        <option value={periodData.currentPeriod}>
                          This Month ({formatBillingPeriod(periodData.currentPeriod)})
                        </option>
                        <option value={periodData.lastMonthPeriod}>
                          Last Month ({formatBillingPeriod(periodData.lastMonthPeriod)})
                        </option>
                        <option value="last-3-months">Recent (Past 3 Months)</option>
                        <option value="ytd">Year to Date ({periodData.currentYear})</option>
                      </optgroup>

                      {periodData.recordedPeriods.length > 0 && (
                        <optgroup label="📊 Recorded in System">
                          {periodData.recordedPeriods.map(p => {
                            const countLabel = roomFilter !== 'all'
                              ? `${p.roomCount} for Unit ${roomFilter}`
                              : `${p.total} ${p.total === 1 ? 'record' : 'records'}`;
                            return (
                              <option key={p.value} value={p.value}>
                                {p.label} ({countLabel})
                              </option>
                            );
                          })}
                        </optgroup>
                      )}

                      {periodData.isCustomPeriod && (
                        <optgroup label="🎯 Selected Date">
                          <option value={periodFilter}>
                            {formatBillingPeriod(periodFilter)} (Selected)
                          </option>
                        </optgroup>
                      )}

                      <optgroup label="🗓️ Other Monthly Cycles">
                        {periodData.otherRecentMonths.map(m => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>

                      <optgroup label="📅 Custom Date Selection">
                        <option value="__custom__">
                          🗓️ Pick from Calendar Dialog...
                        </option>
                      </optgroup>
                    </select>

                    {periodFilter ? (
                      <button
                        type="button"
                        onClick={() => setPeriodFilter('')}
                        className="absolute right-2 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 text-xs"
                        title="Clear period filter"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    ) : (
                      <span className="absolute right-2.5 text-[10px] text-slate-400 pointer-events-none">▼</span>
                    )}

                    {/* Hidden Native Month Input for visual calendar picking */}
                    <input
                      ref={monthInputRef}
                      type="month"
                      value={periodFilter && periodFilter !== 'last-3-months' && periodFilter !== 'ytd' ? periodFilter : ''}
                      onChange={e => {
                        if (e.target.value) setPeriodFilter(e.target.value);
                      }}
                      className="absolute opacity-0 pointer-events-none w-0 h-0"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={reloadData}
                    title="Refresh data"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-bold text-white transition-all shadow-sm hover:shadow-indigo-200 active:scale-[0.98] border-0 cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    <span>Record Reading</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/admin-reports?tab=utilities')}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition-all shadow-sm hover:shadow-emerald-200 active:scale-[0.98] border-0 cursor-pointer ml-2"
                  >
                    <FontAwesomeIcon icon={faChartLine} />
                    <span>View Analytics</span>
                  </button>
                </div>

              </div>

              {/* Status Pill Filters */}
              <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-100">
                {[
                  { key: 'all', label: 'All Records', count: readings.length },
                  { key: 'pending', label: 'Pending Sync', count: stats.pendingSyncCount },
                  { key: 'invoiced', label: 'Invoiced', count: Math.max(0, readings.length - stats.pendingSyncCount) }
                ].map(pill => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setStatusFilter(pill.key)}
                    className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all border-0 cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      statusFilter === pill.key
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      statusFilter === pill.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {pill.count}
                    </span>
                  </button>
                ))}
              </div>

            </div>

            {/* Utility Records Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Unit / Room</th>
                      <th className="px-4 py-3.5">Billing Period</th>
                      <th className="px-4 py-3.5">Water Sub-Meter (m³)</th>
                      <th className="px-4 py-3.5">Electricity Sub-Meter (kWh)</th>
                      <th className="px-4 py-3.5 text-right">Total Utility (₱)</th>
                      <th className="px-4 py-3.5 text-center">Billing Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-children divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center text-slate-400 font-medium">
                          <FontAwesomeIcon icon={faSync} className="animate-spin text-lg mb-2 text-indigo-500" />
                          <p className="m-0 text-xs">Loading utility readings...</p>
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center text-rose-500 font-medium">
                          <p className="m-0 text-xs">{error}</p>
                        </td>
                      </tr>
                    ) : filteredReadings.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-400 py-6">
                            <FontAwesomeIcon icon={faTint} className="text-3xl text-slate-300 mb-2" />
                            <p className="text-sm font-semibold text-slate-600 m-0">No utility readings found</p>
                            <p className="text-xs text-slate-400 mt-1 m-0">Click "+ Record Reading" to log water and electricity meters.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredReadings.map(r => {
                        const totalCost = parseFloat(r.water_amount || 0) + parseFloat(r.water_other_fees || 0) + parseFloat(r.electric_amount || 0) + parseFloat(r.electric_other_fees || 0) + (r.items || []).reduce((sum, it) => sum + parseFloat(it.amount || 0) + parseFloat(it.other_fees || 0), 0);
                        const isInvoiced = r.is_invoiced == 1;

                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Unit & Tenant */}
                            <td className="px-5 py-4 font-semibold text-slate-900">
                              <div className="flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs">
                                  {r.room_name}
                                </span>
                                <div>
                                  <p className="text-xs font-bold text-slate-900 m-0">Unit {r.room_name}</p>
                                  {r.tenant_first_name ? (
                                    <p className="text-[11px] text-indigo-600 font-medium m-0">
                                      {r.tenant_first_name} {r.tenant_last_name} <span className="text-slate-400 font-normal">(User #{r.user_id})</span>
                                    </p>
                                  ) : r.user_id ? (
                                    <p className="text-[11px] text-indigo-600 font-medium m-0">
                                      Tenant ID: #{r.user_id}
                                    </p>
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic m-0">No tenant assigned</p>
                                  )}
                                  {r.has_spike && (
                                    <p
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5 m-0 mt-0.5"
                                      title={`Usage rose more than ${SPIKE_THRESHOLD_PCT}% over the previous reading`}
                                    >
                                      <FontAwesomeIcon icon={faExclamationTriangle} className="text-[9px]" />
                                      Usage spike
                                    </p>
                                  )}
                                  {r.reading_date && (
                                    <p className="text-[10px] text-slate-400 m-0 font-normal">
                                      Read: {new Date(r.reading_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Period */}
                            <td className="px-4 py-4 text-xs font-semibold text-slate-700">
                              {formatBillingPeriod(r.billing_period)}
                            </td>

                            {/* Water */}
                            <td className="px-4 py-4 text-xs">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                  <FontAwesomeIcon icon={faTint} className="text-blue-500 text-[10px]" />
                                  <span>{r.water_consumption} m³</span>
                                  <span className="text-slate-400 font-normal">(@ ₱{r.water_rate_per_unit}/m³)</span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  ₱{parseFloat(r.water_amount || 0).toFixed(2)}
                                  <span className="text-slate-400 font-normal ml-1">({r.water_prev_reading} → {r.water_curr_reading})</span>
                                </div>
                                <ChangeBadge pct={r.water_change_pct} />
                                {parseFloat(r.water_other_fees || 0) > 0 && (
                                  <div className="text-[10px] text-blue-600 font-semibold">+ ₱{parseFloat(r.water_other_fees).toFixed(2)} fees</div>
                                )}
                              </div>
                            </td>

                            {/* Electric */}
                            <td className="px-4 py-4 text-xs">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                  <FontAwesomeIcon icon={faBolt} className="text-amber-500 text-[10px]" />
                                  <span>{r.electric_consumption} kWh</span>
                                  <span className="text-slate-400 font-normal">(@ ₱{r.electric_rate_per_unit}/kWh)</span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  ₱{parseFloat(r.electric_amount || 0).toFixed(2)}
                                  <span className="text-slate-400 font-normal ml-1">({r.electric_prev_reading} → {r.electric_curr_reading})</span>
                                </div>
                                <ChangeBadge pct={r.electric_change_pct} />
                                {parseFloat(r.electric_other_fees || 0) > 0 && (
                                  <div className="text-[10px] text-amber-600 font-semibold">+ ₱{parseFloat(r.electric_other_fees).toFixed(2)} fees</div>
                                )}
                              </div>
                            </td>

                            {/* Total Cost */}
                            <td className="px-4 py-4 text-right">
                              <span className="text-xs font-extrabold text-slate-900 block">
                                ₱{totalCost.toFixed(2)}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-4 text-center">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                                isInvoiced 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                <FontAwesomeIcon icon={isInvoiced ? faCheckCircle : faClock} className="text-[10px]" />
                                {isInvoiced ? 'Invoiced' : 'Pending Sync'}
                              </span>
                              {isInvoiced && r.invoice_id && (
                                <span className="block text-[10px] text-slate-400 font-medium mt-1">{r.invoice_id}</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-5 py-4 text-right">
                              {!isInvoiced ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSyncTargetId(r.id)}
                                    disabled={syncingId === r.id}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer border border-indigo-200 hover:border-indigo-600 disabled:opacity-50"
                                  >
                                    <FontAwesomeIcon icon={faSync} className={syncingId === r.id ? 'animate-spin' : ''} />
                                    <span>Sync Options</span>
                                  </button>
                                  {latestPeriodByRoom[r.room_name] === r.billing_period && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(r)}
                                      disabled={syncingId === r.id}
                                      title="Delete this reading to correct and re-record it"
                                      className="inline-flex items-center justify-center rounded-lg bg-white text-rose-600 hover:bg-rose-600 hover:text-white w-8 h-8 text-xs transition-colors cursor-pointer border border-rose-200 hover:border-rose-600 disabled:opacity-50"
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs font-medium text-slate-400">Synced</span>
                              )}
                              <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] font-semibold">
                                {r.bill_file_path && (
                                  <a href={fileUrl(r.bill_file_path)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">View bill</a>
                                )}
                                <label className="cursor-pointer text-slate-500 hover:text-indigo-600">
                                  {r.bill_file_path ? 'Replace bill' : 'Attach bill'}
                                  <input type="file" className="hidden" aria-label={`Attach bill file for Unit ${r.room_name}`} accept={acceptFor(FILE_RULES.document)}
                                    disabled={syncingId === r.id}
                                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleBillFile(r, f); }} />
                                </label>
                                {r.bill_file_path && (
                                  <button type="button" onClick={() => handleBillFile(r, null)} className="cursor-pointer border-0 bg-transparent p-0 text-rose-600 hover:underline">Remove</button>
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
            </div>

          </div>
        </div>
      </main>

      {/* Record Reading Modal (Isolated Component for high performance) */}
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
  // Local dates: toISOString() gave the UTC day, which is yesterday before 08:00 in Manila.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 modal-overlay-anim" onClick={onClose}>
      <div className="modal-card-anim bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 m-0 text-sm">Sync Utility to Invoice</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer text-lg">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4" noValidate>
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="radio" name="syncMode" value="merge" checked={syncMode === 'merge'} onChange={() => setSyncMode('merge')} className="mt-1" />
              <div>
                <p className="font-bold text-slate-800 m-0 text-sm">Merge with Monthly Rent</p>
                <p className="text-xs text-slate-500 m-0">Adds the charge to this tenant's open invoice for the same month. If there is none, a utilities-only invoice is created — rent is never billed twice.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="radio" name="syncMode" value="separate" checked={syncMode === 'separate'} onChange={() => setSyncMode('separate')} className="mt-1" />
              <div>
                <p className="font-bold text-slate-800 m-0 text-sm">Issue Separate Invoice</p>
                <p className="text-xs text-slate-500 m-0">Generates a separate pending invoice only for this utility.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="radio" name="syncMode" value="paid" checked={syncMode === 'paid'} onChange={() => setSyncMode('paid')} className="mt-1" />
              <div>
                <p className="font-bold text-slate-800 m-0 text-sm">Mark as Paid (Cash/Direct)</p>
                <p className="text-xs text-slate-500 m-0">Marks utility as fully paid immediately via cash/direct.</p>
              </div>
            </label>
          </div>

          {syncMode === 'separate' && (
            <div className="pt-2 border-t border-slate-100">
              <label htmlFor="sync-due_date" className="block text-xs font-bold text-slate-700 mb-1">Due Date</label>
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
                className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500${invalidCls(dueError)}`}
              />
              <FieldError id="sync-due_date" error={dueError} />
              <p className="text-[10px] text-slate-500 mt-1">Due date cannot exceed {SYNC_DUE_MAX_DAYS} days from today.</p>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg bg-transparent border-0 cursor-pointer">Cancel</button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">{busy ? 'Syncing…' : 'Confirm Sync'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Subcomponent: Isolated modal to prevent whole-page re-renders during typing
// Last metered reading of an extra utility type for a unit, before the given period.
function lastItemReading(readings, room, period, typeId) {
  if (!room || !Array.isArray(readings)) return 0;
  const earlier = readings
    .filter((r) => r.room_name === room && r.billing_period < period)
    .sort((a, b) => (a.billing_period < b.billing_period ? 1 : -1));
  for (const r of earlier) {
    const it = (r.items || []).find((i) => Number(i.type_id) === Number(typeId));
    if (it) return parseFloat(it.curr_reading) || 0;
  }
  return 0;
}

function RecordReadingModal({ show, onClose, onSuccess, rooms, readings }) {
  const [submitting, setSubmitting] = useState(false);
  const [billFile, setBillFile] = useState(null);
  const [formData, setFormData] = useState(() => {
    // #11: Use local date to avoid UTC rollover showing wrong month on the 1st (UTC+8)
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
      notes: ''
    };
  });

  // Extra utility types (internet, gas, ...) set up in Settings. extra[type_id] = { on, curr, rate }.
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

  // Previous reading detection for selected room in modal
  const selectedRoomPrevReading = useMemo(() => {
    if (!formData.room_name || !Array.isArray(readings)) return { water: 0, electric: 0 };
    const prev = findPreviousReading(readings, formData.room_name, formData.billing_period);
    return {
      water: prev ? parseFloat(prev.water_curr_reading || 0) : 0,
      electric: prev ? parseFloat(prev.electric_curr_reading || 0) : 0
    };
  }, [formData.room_name, formData.billing_period, readings]);

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

  // save_utility_reading.php's rules: readings ≥ 0 and never below the last one,
  // rates in (0, 1000], fees ≥ 0, reading date inside the period and not future.
  const readingForm = useFieldErrors({
    room_name: (v) => (rooms.some(r => String(r.id) === String(v)) ? '' : 'Please select a unit.'),
    billing_period: (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? '')) ? '' : 'Billing period is required.'),
    reading_date: (v, all) => checkDate(v, { label: 'Reading date', max: localDateString(), min: all.billing_period ? `${all.billing_period}-01` : undefined }),
    water_curr_reading: (v) => checkAmount(v, { label: 'Water reading', min: selectedRoomPrevReading.water })
      .replace(`at least ${selectedRoomPrevReading.water}`, `at least the previous reading (${selectedRoomPrevReading.water})`),
    electric_curr_reading: (v) => checkAmount(v, { label: 'Electricity reading', min: selectedRoomPrevReading.electric })
      .replace(`at least ${selectedRoomPrevReading.electric}`, `at least the previous reading (${selectedRoomPrevReading.electric})`),
    water_rate_per_unit: (v) => checkAmount(v, { label: 'Water rate', min: 0.01, max: 1000, allowZero: false }),
    electric_rate_per_unit: (v) => checkAmount(v, { label: 'Electricity rate', min: 0.01, max: 1000, allowZero: false }),
    water_other_fees: (v) => checkAmount(v, { label: 'Other water fees', required: false }),
    electric_other_fees: (v) => checkAmount(v, { label: 'Other electricity fees', required: false }),
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
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // Carry the unit's last rates forward instead of resetting them to the defaults.
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
    // Meters don't run backwards: the reading checks use the previous reading as their minimum.
    if (!readingForm.validateAll(clean)) return;
    setSubmitting(true);
    try {
      const items = extraItems.map(({ type, e }) => (type.billing_mode === 'metered'
        ? { type_id: Number(type.id), curr_reading: e.curr, rate: e.rate }
        : { type_id: Number(type.id), rate: e.rate }));
      const res = await api.post('/save_utility_reading.php', { ...clean, items });
      if (res?.data?.success) {
        // The reading is saved first; the bill is attached to it afterwards.
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
        alert([res.data.message || "Utility reading saved successfully!", res.data.warning, billWarning].filter(Boolean).join('\n\n'));
        onSuccess();
      } else if (!readingForm.applyServerErrors(res)) {
        alert(res?.data?.message || "Failed to save reading.");
      }
    } catch (err) {
      console.error("Save reading error:", err);
      if (!readingForm.applyServerErrors(err)) alert(apiErrorMessage(err, "Failed to save reading."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 overflow-y-auto modal-overlay-anim"
      onClick={onClose}
    >
      <div
        className="modal-card-anim bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden my-auto"
        style={{ transform: 'translateZ(0)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
              <FontAwesomeIcon icon={faBolt} />
            </div>
            <h3 className="text-base font-bold text-slate-900 m-0">Record Unit Utility Reading</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 text-base transition-colors"
            title="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden m-0" noValidate>
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4 text-left">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="reading-room_name" className="block text-xs font-bold text-slate-700 mb-1">Target Unit / Room *</label>
                <select
                  {...readingForm.fieldA11y('room_name')}
                  onBlur={handleBlur}
                  value={formData.room_name}
                  onChange={handleInputChange}
                  required
                  className={fieldCls('room_name', "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 cursor-pointer")}
                >
                  <option value="">Select an occupied unit</option>
                  {rooms.filter(room => room.status === 'occupied').map(room => (
                    <option key={room.id} value={room.id}>
                      Unit {room.id} ({room.status}{room.tenant ? ` - ${room.tenant}` : ''})
                    </option>
                  ))}
                </select>
                <FieldError id="reading-room_name" error={readingForm.errors.room_name} />
              </div>

              <div>
                <label htmlFor="reading-billing_period" className="block text-xs font-bold text-slate-700 mb-1">Billing Period (Month) *</label>
                <input
                  type="month"
                  {...readingForm.fieldA11y('billing_period')}
                  onBlur={handleBlur}
                  value={formData.billing_period}
                  onChange={handleInputChange}
                  required
                  className={fieldCls('billing_period', "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500")}
                />
                <FieldError id="reading-billing_period" error={readingForm.errors.billing_period} />
              </div>
            </div>

            <div>
              <label htmlFor="reading-reading_date" className="block text-xs font-bold text-slate-700 mb-1">Reading Date *</label>
              <input
                type="date"
                {...readingForm.fieldA11y('reading_date')}
                onBlur={handleBlur}
                max={localDateString()}
                min={formData.billing_period ? `${formData.billing_period}-01` : undefined}
                value={formData.reading_date}
                onChange={handleInputChange}
                required
                className={fieldCls('reading_date', "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500")}
              />
              <FieldError id="reading-reading_date" error={readingForm.errors.reading_date} />
            </div>

            {/* Water Section */}
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faTint} className="text-blue-500" /> Water Meter
                </span>
                <span className="text-[11px] text-blue-700 font-medium">
                  Prev Reading: <strong>{modalCalculations.waterPrev} m³</strong>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reading-water_curr_reading" className="block text-[11px] font-bold text-slate-600 mb-1">Current Reading (m³)</label>
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
                    className={fieldCls('water_curr_reading', "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500")}
                  />
                  <FieldError id="reading-water_curr_reading" error={readingForm.errors.water_curr_reading} />
                </div>
                <div>
                  <label htmlFor="reading-water_rate_per_unit" className="block text-[11px] font-bold text-slate-600 mb-1">Rate per m³ (₱)</label>
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
                    className={fieldCls('water_rate_per_unit', "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500")}
                  />
                  <FieldError id="reading-water_rate_per_unit" error={readingForm.errors.water_rate_per_unit} />
                </div>
                <div className="col-span-2">
                  <label htmlFor="reading-water_other_fees" className="block text-[11px] font-bold text-slate-600 mb-1">Other Water Fees (₱) <span className="text-slate-400 font-normal italic">- Optional fixed charges</span></label>
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
                    className={fieldCls('water_other_fees', "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500")}
                  />
                  <FieldError id="reading-water_other_fees" error={readingForm.errors.water_other_fees} />
                </div>
              </div>
              <div className="text-[11px] text-blue-800 font-semibold flex justify-between pt-1 border-t border-blue-100">
                <span>Consumption: {modalCalculations.waterCons} m³</span>
                <span className="text-right">Usage: ₱{modalCalculations.waterAmt}<br/>Total w/ Fees: ₱{modalCalculations.totalWater}</span>
              </div>
            </div>

            {/* Electricity Section */}
            <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faBolt} className="text-amber-500" /> Electricity Meter
                </span>
                <span className="text-[11px] text-amber-700 font-medium">
                  Prev Reading: <strong>{modalCalculations.elecPrev} kWh</strong>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reading-electric_curr_reading" className="block text-[11px] font-bold text-slate-600 mb-1">Current Reading (kWh)</label>
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
                    className={fieldCls('electric_curr_reading', "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-amber-500")}
                  />
                  <FieldError id="reading-electric_curr_reading" error={readingForm.errors.electric_curr_reading} />
                </div>
                <div>
                  <label htmlFor="reading-electric_rate_per_unit" className="block text-[11px] font-bold text-slate-600 mb-1">Rate per kWh (₱)</label>
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
                    className={fieldCls('electric_rate_per_unit', "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-amber-500")}
                  />
                  <FieldError id="reading-electric_rate_per_unit" error={readingForm.errors.electric_rate_per_unit} />
                </div>
                <div className="col-span-2">
                  <label htmlFor="reading-electric_other_fees" className="block text-[11px] font-bold text-slate-600 mb-1">Other Electricity Fees (₱) <span className="text-slate-400 font-normal italic">- Optional fixed charges</span></label>
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
                    className={fieldCls('electric_other_fees', "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-amber-500")}
                  />
                  <FieldError id="reading-electric_other_fees" error={readingForm.errors.electric_other_fees} />
                </div>
              </div>
              <div className="text-[11px] text-amber-800 font-semibold flex justify-between pt-1 border-t border-amber-100">
                <span>Consumption: {modalCalculations.elecCons} kWh</span>
                <span className="text-right">Usage: ₱{modalCalculations.elecAmt}<br/>Total w/ Fees: ₱{modalCalculations.totalElec}</span>
              </div>
            </div>

            {/* Extra utility types */}
            {utilityTypes.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="m-0 text-xs font-bold text-slate-700">Other utilities (optional)</p>
                {utilityTypes.map((t) => {
                  const e = extra[t.id] || { on: false, curr: '', rate: String(t.default_rate) };
                  const prev = lastItemReading(readings, formData.room_name, formData.billing_period, t.id);
                  const metered = t.billing_mode === 'metered';
                  return (
                    <div key={t.id} className="grid grid-cols-12 items-center gap-2 text-xs">
                      <label className="col-span-12 flex items-center gap-2 font-semibold text-slate-700 sm:col-span-4">
                        <input type="checkbox" checked={e.on} onChange={(ev) => setExtraField(t, { on: ev.target.checked })} />
                        {t.name}
                      </label>
                      {metered && (
                        <input type="number" min={prev} step="0.01" disabled={!e.on} value={e.curr} onChange={(ev) => setExtraField(t, { curr: ev.target.value })}
                          aria-label={`${t.name} current reading`} placeholder={`Reading (previous ${prev})`} className="col-span-6 rounded-lg border border-slate-200 bg-white px-2 py-1.5 sm:col-span-4" />
                      )}
                      <input type="number" min="0" step="0.01" disabled={!e.on} value={e.rate} onChange={(ev) => setExtraField(t, { rate: ev.target.value })}
                        aria-label={`${t.name} ${metered ? 'rate' : 'fee'}`} placeholder={metered ? `Rate per ${t.unit_label || 'unit'}` : 'Flat fee'}
                        className={`rounded-lg border border-slate-200 bg-white px-2 py-1.5 ${metered ? 'col-span-6 sm:col-span-4' : 'col-span-12 sm:col-span-8'}`} />
                    </div>
                  );
                })}
                {extraTotal > 0 && <p className="m-0 text-right text-[11px] font-semibold text-slate-600">Other utilities: ₱{extraTotal.toFixed(2)}</p>}
              </div>
            )}

            {/* Combined Total Preview */}
            <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-bold">
              <span>Calculated Total Utility Bill:</span>
              <span className="text-base text-emerald-400">₱{(parseFloat(modalCalculations.totalAmt) + extraTotal).toFixed(2)}</span>
            </div>

            {/* Provider bill (optional) */}
            <div>
              <label htmlFor="reading-bill_file" className="block text-xs font-bold text-slate-700 mb-1">Provider Bill (Optional)</label>
              <input
                id="reading-bill_file"
                type="file"
                accept={acceptFor(FILE_RULES.document)}
                onChange={(ev) => {
                  const f = ev.target.files?.[0] || null;
                  const err = f ? checkFile(f, FILE_RULES.document) : null;
                  if (err) { alert(err); ev.target.value = ''; setBillFile(null); return; }
                  setBillFile(f);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800"
              />
              <p className="m-0 mt-1 text-[11px] text-slate-500">Attach the water or electric company's bill for this reading. You can also add or replace it later from the readings list.</p>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="reading-notes" className="block text-xs font-bold text-slate-700 mb-1">Notes (Optional)</label>
              <input
                type="text"
                {...readingForm.fieldA11y('notes')}
                onBlur={handleBlur}
                maxLength={LIMITS.notes}
                autoComplete="off"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="e.g. Verified sub-meter serial, tenant present"
                className={fieldCls('notes', "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500")}
              />
              <FieldError id="reading-notes" error={readingForm.errors.notes} />
            </div>

          </div>

          {/* Fixed Modal Action Footer */}
          <div className="shrink-0 flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50/80 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2 text-xs font-bold text-white transition-all shadow-sm hover:shadow-indigo-200 disabled:opacity-50 cursor-pointer border-0"
            >
              {submitting ? 'Saving...' : 'Save & Calculate'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
