import { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDollarSign, faUsers, faBuilding, faExclamationTriangle, 
  faChartLine, faChartPie, faWrench, faKey,
  faChartBar, faTable, faUserPlus, faInfoCircle,
  faHistory, faCogs, faFileSignature,
  faClipboardList, faArrowRight, faBullhorn
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { clickable } from '../utils/clickable';
import StatCard from '../Components/admin/StatCard';
import AttentionList from '../Components/admin/AttentionList';
import { TH, THEAD, btn } from '../Components/admin/ui/styles';
import LoadError from '../Components/admin/ui/LoadError';
import { Skeleton, SkeletonBlock, SkeletonList } from '../Components/admin/ui/Skeleton';

// Keyed on the 12 activity-log categories (LOG_CATEGORIES in config.php). The
// widget used to key on legacy names (invoice, payment, rent_application), so
// most entries fell through to the generic icon.
const LOG_CATEGORY_STYLE = {
  billing: { icon: faDollarSign, color: 'bg-emerald-100 text-emerald-700' },
  utilities: { icon: faChartLine, color: 'bg-cyan-100 text-cyan-600' },
  maintenance: { icon: faWrench, color: 'bg-amber-100 text-amber-700' },
  tenant: { icon: faUserPlus, color: 'bg-blue-100 text-blue-600' },
  user: { icon: faUsers, color: 'bg-blue-100 text-blue-600' },
  auth: { icon: faKey, color: 'bg-violet-100 text-violet-600' },
  unit: { icon: faBuilding, color: 'bg-indigo-100 text-indigo-600' },
  contract: { icon: faFileSignature, color: 'bg-indigo-100 text-indigo-600' },
  service: { icon: faClipboardList, color: 'bg-teal-100 text-teal-600' },
  inquiry: { icon: faInfoCircle, color: 'bg-sky-100 text-sky-700' },
  communication: { icon: faBullhorn, color: 'bg-red-100 text-red-600' },
  system: { icon: faCogs, color: 'bg-slate-100 text-slate-600' },
};

const formatCurrency = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
// Short form (₱125K) for the bar labels on phones, where six full amounts don't fit.
const formatCompactCurrency = (n) => `₱${Number(n || 0).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}`;
// Chart tooltips on the first/last month align to the card edge instead of overflowing it.
const tooltipAlign = (i, count) => (i === 0 ? 'left-0' : i === count - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2');

const formatLogDate = (dateStr) => {
  if (!dateStr) return 'Recently';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 'Recently' : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [chartView, setChartView] = useState('bar'); 
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [activeLowerTab, setActiveLowerTab] = useState('units');

  const [stats, setStats] = useState({
    total_revenue: 0,
    last_month_revenue: 0,
    revenue_trend: null,
    pending_dues: 0,
    overdue_dues: 0,
    overdue_count: 0,
    total_tenants: 0,
    pending_applications: 0,
    occupancy_rate: 0,
    occupied_rooms: 0,
    total_rooms: 0,
    vacant_rooms: 0,
    open_maintenance: 0,
    urgent_maintenance: 0,
    collection_rate: 0,
    total_6m_collected: 0,
    avg_monthly_income: 0,
  });
  const [incomeData, setIncomeData] = useState([]);
  const [newTenants, setNewTenants] = useState([]);
  const [attention, setAttention] = useState({});
  const [roomsSummary, setRoomsSummary] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  // True when the stats request failed: one page-level error replaces the whole
  // dashboard, so no card ever reads "₱0" or "All caught up" for data that never loaded.
  const [statsError, setStatsError] = useState(false);

  const kpiStatus = loading ? 'loading' : undefined;
  // A figure from the stats response, or "—" while it is loading.
  const fig = (v) => (kpiStatus ? '—' : v);

  const fetchDashboardData = async () => {
    setLoading(true);
    setStatsError(false);
    try {
      const statsRes = await api.get('dashboard_stats.php');
      if (statsRes.data && statsRes.data.success) {
        setStats(statsRes.data.stats || {});
        setIncomeData(statsRes.data.income_data || []);
        setNewTenants(statsRes.data.new_tenants || []);
        
        setAttention(statsRes.data.attention || {});
        if (!statsRes.data.attention) setStatsError(true);
        setRoomsSummary(statsRes.data.rooms_summary || []);
        setActivityLogs(statsRes.data.activity_logs || []);
      } else {
        setStatsError(true);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
      setStatsError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => { await fetchDashboardData(); };
    load();
  }, []);

  const maxValue = Math.max(
    ...incomeData.map(d => Math.max(d.billed || 0, (d.collected || 0) + (d.pending || 0))),
    1000
  ) * 1.15;

  const pointsCount = Math.max(incomeData.length - 1, 1);
  const linePoints = incomeData.map((d, i) => {
    const x = (i / pointsCount) * 100;
    const y = 92 - ((d.collected || 0) / maxValue) * 80;
    return `${x},${y}`;
  });
  const pendingPoints = incomeData.map((d, i) => {
    const x = (i / pointsCount) * 100;
    const y = 92 - ((d.pending || 0) / maxValue) * 80;
    return `${x},${y}`;
  });
  const pathD = linePoints.length ? `M ${linePoints.join(' L ')}` : '';
  const areaD = linePoints.length ? `M ${linePoints.join(' L ')} L 100,100 L 0,100 Z` : '';
  const pendingPathD = pendingPoints.length ? `M ${pendingPoints.join(' L ')}` : '';

  const rentCollectionRate = stats.collection_rate !== undefined ? stats.collection_rate : 0;
  const activeMonthData = incomeData.find(d => d.month === selectedMonth || d.key === selectedMonth);


  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Admin Dashboard" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">
            {statsError && !loading ? (
              <div className="bg-white rounded-card border border-slate-200 shadow-card">
                <LoadError
                  title="Couldn't load the dashboard"
                  message="This is not an all-clear: the dashboard data did not load, so no figures are shown."
                  onRetry={fetchDashboardData}
                />
              </div>
            ) : (<>

            {/* Income Overview Chart & Secondary Status */}
            {/* Top: KPIs and the money chart on the left, what needs doing on the right */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6 min-w-0">
              {/* Core KPI Cards Grid */}
              <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <StatCard 
                  icon={faDollarSign} 
                  title="Monthly Revenue" 
                  value={formatCurrency(stats.total_revenue)} 
                  color="emerald" 
                  trend={stats.revenue_trend}
                  subtext={stats.last_month_revenue > 0 ? `vs ${formatCurrency(stats.last_month_revenue)} last mo` : 'Current month collected'}
                  tooltip="Total rent and utility payments collected this month" 
                  status={kpiStatus}
                />
                <StatCard 
                  icon={faExclamationTriangle} 
                  title="Pending Dues" 
                  value={formatCurrency(stats.pending_dues)} 
                  color={stats.pending_dues > 0 ? "red" : "slate"} 
                  isBadTrend={stats.overdue_count > 0}
                  subtext={stats.overdue_count > 0 ? `${stats.overdue_count} overdue invoice${stats.overdue_count > 1 ? 's' : ''}` : 'No overdue accounts'}
                  tooltip="Outstanding tenant balances across all units" 
                  status={kpiStatus}
                  onClick={() => navigate('/admin-payments')} 
                />
                <StatCard 
                  icon={faChartPie} 
                  title="Occupancy Rate" 
                  value={`${stats.occupancy_rate}%`} 
                  subtext={`${stats.occupied_rooms} / ${stats.total_rooms} Units Occupied`} 
                  color="blue" 
                  progress={stats.occupancy_rate} 
                  tooltip="Percentage of building units currently occupied"
                  status={kpiStatus}
                />
                <StatCard 
                  icon={faKey} 
                  title="Vacant Units" 
                  value={stats.vacant_rooms} 
                  subtext="Available for Rent" 
                  color="slate" 
                  onClick={() => navigate('/admin-units')} 
                  tooltip="Vacant apartment units ready for occupancy"
                  status={kpiStatus}
                />
                <StatCard 
                  icon={faClipboardList} 
                  title="Applications" 
                  value={stats.pending_applications} 
                  subtext={stats.pending_applications > 0 ? "Review required" : "All reviewed"} 
                  color={stats.pending_applications > 0 ? "amber" : "indigo"} 
                  onClick={() => navigate('/admin-applications')} 
                  tooltip="Prospective tenant applications awaiting approval"
                  status={kpiStatus}
                />
                <StatCard 
                  icon={faWrench} 
                  title="Maintenance" 
                  value={stats.open_maintenance} 
                  subtext={stats.urgent_maintenance > 0 ? `${stats.urgent_maintenance} Urgent request${stats.urgent_maintenance > 1 ? 's' : ''}` : "Active work orders"} 
                  color={stats.urgent_maintenance > 0 ? "red" : "amber"} 
                  isBadTrend={stats.urgent_maintenance > 0}
                  onClick={() => navigate('/admin-maintenance')} 
                  tooltip="Open maintenance tickets submitted by tenants"
                  status={kpiStatus}
                />
              </div>
              
              {/* Income Overview Chart Block */}
              <div className="bg-white rounded-card border border-slate-200 shadow-card flex flex-col">
                
                {/* Header */}
                <div className="p-5 md:p-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h3 className="text-title font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faChartLine} className="text-indigo-600" /> Income & Cash Flow Overview
                    </h3>
                    <p className="text-label text-slate-500 m-0 mt-1">6-month rolling breakdown: Collected revenue vs Pending dues</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex bg-slate-100 p-1 rounded-control">
                      <button 
                        onClick={() => setChartView('bar')} 
                        title="Bar Chart"
                        className={`px-3 py-1 rounded-control text-label font-semibold cursor-pointer border-0 transition-colors ${chartView === 'bar' ? 'bg-white text-slate-800 shadow-card' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <FontAwesomeIcon icon={faChartBar} />
                      </button>
                      <button 
                        onClick={() => setChartView('line')} 
                        title="Line Chart"
                        className={`px-3 py-1 rounded-control text-label font-semibold cursor-pointer border-0 transition-colors ${chartView === 'line' ? 'bg-white text-slate-800 shadow-card' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <FontAwesomeIcon icon={faChartLine} />
                      </button>
                      <button 
                        onClick={() => setChartView('table')} 
                        title="Data Table"
                        className={`px-3 py-1 rounded-control text-label font-semibold cursor-pointer border-0 transition-colors ${chartView === 'table' ? 'bg-white text-slate-800 shadow-card' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <FontAwesomeIcon icon={faTable} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Summary Metrics Ribbon */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50/70 border-b border-slate-100 px-4 md:px-6 py-3 text-label">
                  <div>
                    <span className="text-slate-500 font-medium">6-Mo Total Collected</span>
                    <p className="font-bold text-emerald-700 text-body m-0 mt-0.5">{fig(formatCurrency(stats.total_6m_collected))}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Monthly Average</span>
                    <p className="font-bold text-slate-700 text-body m-0 mt-0.5">{fig(formatCurrency(stats.avg_monthly_income))}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Collection Efficiency</span>
                    <p className={`font-bold text-body m-0 mt-0.5 ${kpiStatus ? 'text-slate-700' : rentCollectionRate >= 90 ? 'text-emerald-700' : rentCollectionRate >= 70 ? 'text-amber-700' : 'text-red-600'}`}>
                      {fig(`${rentCollectionRate}%`)}
                    </p>
                  </div>
                </div>
                
                {/* Chart Canvas Area */}
                <div className="p-4 md:p-6 flex-1 flex flex-col">
                  {loading ? (
                    <SkeletonBlock label="Loading income chart…" className="h-48 flex items-end gap-3 px-2">
                      {['h-1/3', 'h-1/2', 'h-2/5', 'h-3/4', 'h-3/5', 'h-5/6'].map((h) => <Skeleton key={h} className={`flex-1 ${h}`} />)}
                    </SkeletonBlock>
                  ) : incomeData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-500 text-body">
                      No income records found
                    </div>
                  ) : chartView === 'bar' ? (
                    <div className="flex flex-col">
                      {/* Legend */}
                      <div className="flex justify-end items-center gap-4 text-label text-slate-500 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-control bg-emerald-500 inline-block"></span>
                          <span>Collected</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-control bg-amber-400 inline-block"></span>
                          <span>Pending</span>
                        </div>
                      </div>

                      {/* Stacked Bars */}
                      <div className="h-48 flex items-end justify-between gap-2 sm:gap-6 px-0 sm:px-2 pb-2 mt-2">
                        {incomeData.map((d, i) => {
                          const totalBilled = Math.max((d.collected || 0) + (d.pending || 0), d.billed || 0);
                          const barContainerPx = 192; // h-48 = 12rem = 192px
                          const dynamicHeight = totalBilled > 0 ? `${Math.max((totalBilled / maxValue) * barContainerPx, 14)}px` : '4px';
                          const collectedPercent = totalBilled > 0 ? `${((d.collected || 0) / totalBilled) * 100}%` : '0%';
                          const pendingPercent = totalBilled > 0 ? `${((d.pending || 0) / totalBilled) * 100}%` : '0%';
                          const isSelected = selectedMonth === d.month || selectedMonth === d.key;

                          return (
                            <div 
                              key={d.key || d.month} 
                              className="flex flex-col items-center flex-1 min-w-0 gap-2 group relative cursor-pointer rounded-control outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                              {...clickable(() => setSelectedMonth(isSelected ? null : d.month))}
                              aria-pressed={isSelected}
                              aria-label={`${d.full_month || d.month}: collected ${formatCurrency(d.collected)}, pending ${formatCurrency(d.pending)}`}
                            >
                              {/* Hover / Active Tooltip */}
                              <div className={`absolute bottom-full mb-2 ${tooltipAlign(i, incomeData.length)} bg-slate-800 text-white text-caption p-2.5 rounded-control shadow-raised transition-all z-50 w-36 pointer-events-none ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 translate-y-2'}`}>
                                <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1.5">{d.full_month || d.month}</p>
                                <div className="flex justify-between mb-1"><span className="text-slate-400">Collected:</span><span className="font-bold text-emerald-400">{formatCurrency(d.collected)}</span></div>
                                <div className="flex justify-between mb-1"><span className="text-slate-400">Pending:</span><span className="font-bold text-amber-400">{formatCurrency(d.pending)}</span></div>
                                <div className="flex justify-between pt-1 border-t border-slate-700/80 font-semibold"><span className="text-slate-300">Total Billed:</span><span>{formatCurrency(totalBilled)}</span></div>
                              </div>
                              
                              {/* Amount Label above bar */}
                              <span className="text-caption font-semibold text-slate-500 group-hover:text-slate-700 transition-colors whitespace-nowrap">
                                <span className="sm:hidden">{formatCompactCurrency(totalBilled)}</span>
                                <span className="hidden sm:inline">{totalBilled > 0 ? formatCurrency(totalBilled) : '₱0'}</span>
                              </span>

                              {/* The Stacked Bar */}
                              <div 
                                className={`w-full max-w-[2.75rem] rounded-t-control relative overflow-hidden flex flex-col justify-end transition-all ${totalBilled === 0 ? 'bg-slate-200' : 'bg-slate-100'} ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : 'group-hover:opacity-90'}`} 
                                style={{ height: dynamicHeight }}
                              >
                                <div className="w-full bg-amber-400 absolute top-0 left-0 transition-all opacity-90" style={{ height: pendingPercent }}></div>
                                <div className="w-full bg-emerald-500 absolute bottom-0 left-0 transition-all opacity-95" style={{ height: collectedPercent }}></div>
                              </div>

                              {/* Month Label */}
                              <span className={`text-label font-bold transition-colors ${isSelected ? 'text-indigo-600' : 'text-slate-500 group-hover:text-slate-800'}`}>
                                {d.month}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : chartView === 'line' ? (
                    <div className="h-48 relative flex flex-col justify-between pb-6 px-4">
                      {/* Legend */}
                      <div className="flex justify-end items-center gap-4 text-label text-slate-500 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-1.5 rounded-full bg-indigo-500 inline-block"></span>
                          <span>Collected</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-1.5 rounded-full bg-amber-500 inline-block border-t border-dashed"></span>
                          <span>Pending</span>
                        </div>
                      </div>

                      <div className="relative flex-1 w-full">
                        <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                          <defs>
                            <linearGradient id="indigo-grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <path d={areaD} fill="url(#indigo-grad)" />
                          <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="3" vectorEffect="non-scaling-stroke" className="drop-shadow-sm" />
                          <path d={pendingPathD} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="4,4" vectorEffect="non-scaling-stroke" className="drop-shadow-sm" />
                        </svg>
                        
                        {/* Interactive Data Dots */}
                        <div className="absolute inset-0 w-full h-full pointer-events-none">
                          {incomeData.map((d, i) => {
                            const x = (i / pointsCount) * 100;
                            const y = 92 - ((d.collected || 0) / maxValue) * 80;
                            const isSelected = selectedMonth === d.month || selectedMonth === d.key;
                            return (
                              <div 
                                key={d.key || d.month}
                                className={`absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-raised cursor-pointer hover:scale-150 transition-transform pointer-events-auto z-10 group ${isSelected ? 'scale-150 bg-indigo-100 ring-2 ring-indigo-400' : ''}`}
                                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                                onClick={() => setSelectedMonth(isSelected ? null : d.month)}
                              >
                                <div className={`absolute -top-16 ${tooltipAlign(i, incomeData.length)} bg-slate-800 text-white text-caption p-2 rounded-control shadow-raised opacity-0 transition-all z-30 w-32 pointer-events-none ${isSelected ? 'opacity-100' : 'group-hover:opacity-100'}`}>
                                  <p className="font-bold text-slate-200 m-0 mb-1">{d.full_month || d.month}</p>
                                  <div className="flex justify-between"><span className="text-slate-400">Collected</span><span className="font-bold text-emerald-400">{formatCurrency(d.collected)}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-400">Pending</span><span className="font-bold text-amber-400">{formatCurrency(d.pending)}</span></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* X-axis Labels */}
                      <div className="flex justify-between items-center px-1 mt-3">
                        {incomeData.map((d) => (
                          <span 
                            key={`lbl-${d.key || d.month}`} 
                            className={`text-label font-bold transition-colors cursor-pointer ${selectedMonth === d.month ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                            onClick={() => setSelectedMonth(selectedMonth === d.month ? null : d.month)}
                          >
                            {d.month}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Table View */
                    <div className="overflow-x-auto max-h-56">
                      <table className="w-full text-left text-label">
                        <thead className={THEAD}>
                          <tr className="text-label font-medium text-slate-600">
                            <th className={TH}>Period</th>
                            <th className={`${TH} text-right`}>Invoices</th>
                            <th className={`${TH} text-right`}>Total Billed</th>
                            <th className={`${TH} text-right`}>Collected</th>
                            <th className={`${TH} text-right`}>Pending</th>
                            <th className={`${TH} text-right`}>Collection Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {incomeData.slice().reverse().map(d => {
                            const totalBilled = Math.max((d.collected || 0) + (d.pending || 0), d.billed || 0);
                            const rate = totalBilled > 0 ? Math.round(((d.collected || 0) / totalBilled) * 100) : (d.collected > 0 ? 100 : 0);
                            const isSelected = selectedMonth === d.month || selectedMonth === d.key;

                            return (
                              <tr 
                                key={d.key || d.month} 
                                className={`hover:bg-indigo-50/50 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50 font-semibold' : ''}`}
                                onClick={() => setSelectedMonth(isSelected ? null : d.month)}
                              >
                                <td className="py-2.5 px-3 font-semibold text-slate-800">{d.full_month || d.month}</td>
                                <td className="py-2.5 px-3 text-right text-slate-500">{d.count || 0}</td>
                                <td className="py-2.5 px-3 text-right font-medium text-slate-700">{formatCurrency(totalBilled)}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-emerald-700">{formatCurrency(d.collected)}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-amber-700">{formatCurrency(d.pending)}</td>
                                <td className="py-2.5 px-3 text-right">
                                  <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${rate >= 90 ? 'bg-emerald-100 text-emerald-800' : rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                                    {rate}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {/* Selected Month Interactive Drilldown Banner */}
                  {selectedMonth && activeMonthData && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-card border border-indigo-100 text-label text-indigo-950 flex flex-wrap justify-between items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-body text-indigo-900">{activeMonthData.full_month || activeMonthData.month} Summary</span>
                          <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-indigo-100 text-indigo-700">
                            {activeMonthData.count || 0} Invoice{activeMonthData.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-slate-600 text-label">
                          <span>Collected: <strong className="text-emerald-700">{formatCurrency(activeMonthData.collected)}</strong></span>
                          <span>Pending: <strong className="text-amber-700">{formatCurrency(activeMonthData.pending)}</strong></span>
                          <span>Billed: <strong>{formatCurrency(Math.max((activeMonthData.collected || 0) + (activeMonthData.pending || 0), activeMonthData.billed || 0))}</strong></span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          className={btn('secondary', 'sm')}
                          onClick={() => setSelectedMonth(null)}
                        >
                          Dismiss
                        </button>
                        <button 
                          className={btn('primary', 'sm')}
                          onClick={() => navigate('/admin-payments')}
                        >
                          <span>Manage Invoices</span>
                          <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              </div>

              {/* What needs doing: first on phones, beside the KPIs on wider screens */}
              <div className="order-first lg:order-none">
                <AttentionList attention={attention} loading={loading} onRetry={fetchDashboardData} />
              </div>
            </div>

            {/* Third Row: unit matrix / activity, and newest tenants */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left (Col 2): Operations Command Center */}
              <div className="lg:col-span-2 bg-white rounded-card border border-slate-200 shadow-card flex flex-col">
                
                {/* Tab Header */}
                <div className="p-4 md:px-6 md:py-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
                  <h3 className="text-title font-bold text-slate-800 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faCogs} className="text-indigo-600" /> Operational Command
                  </h3>

                  <div className="flex bg-slate-100 p-1 rounded-control text-label font-semibold">
                    <button
                      onClick={() => setActiveLowerTab('units')}
                      className={`px-3 py-1.5 rounded-control cursor-pointer border-0 transition-all flex items-center gap-1.5 ${activeLowerTab === 'units' ? 'bg-white text-indigo-700 shadow-card' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      <FontAwesomeIcon icon={faBuilding} />
                      <span>Unit Matrix</span>
                      <span className="text-caption text-slate-500 font-normal">
                        ({fig(roomsSummary.length)})
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveLowerTab('activity')}
                      className={`px-3 py-1.5 rounded-control cursor-pointer border-0 transition-all flex items-center gap-1.5 ${activeLowerTab === 'activity' ? 'bg-white text-indigo-700 shadow-card' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      <FontAwesomeIcon icon={faHistory} />
                      <span>Activity Log</span>
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                <div className="p-5 md:p-6 flex-1 overflow-y-auto max-h-[22rem]">
                  
                  {loading ? (
                    <SkeletonList rows={5} label="Loading…" />
                  ) : null}

                  {/* TAB 2: UNIT MATRIX */}
                  {!kpiStatus && activeLowerTab === 'units' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-label text-slate-500 border-b border-slate-100 pb-2">
                        <div className="flex gap-4">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                            <span>Occupied ({fig(stats.occupied_rooms)})</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span>
                            <span>Vacant ({fig(stats.vacant_rooms)})</span>
                          </span>
                        </div>
                        <button
                          onClick={() => navigate('/admin-units')}
                          className="btn-interactive text-indigo-600 hover:text-indigo-800 font-semibold bg-transparent border-0 cursor-pointer p-0"
                        >
                          Manage All Units →
                        </button>
                      </div>

                      <div className="stagger-children grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {(roomsSummary || []).map(room => {
                          const isOccupied = room.status === 'occupied';
                          const isReserved = room.status === 'reserved';
                          return (
                            <div
                              key={room.id}
                              onClick={() => navigate('/admin-units')}
                              className={`card-interactive p-3 rounded-card border transition-all cursor-pointer hover:shadow-raised ${
                                isOccupied 
                                  ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-400' 
                                  : isReserved
                                  ? 'bg-amber-50/40 border-amber-200 hover:border-amber-400'
                                  : 'bg-slate-50 border-slate-200 hover:border-indigo-400'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <span className="font-bold text-body text-slate-800">{room.id}</span>
                                <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${
                                  isOccupied 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : isReserved
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {isOccupied ? 'Occupied' : isReserved ? 'Reserved' : 'Vacant'}
                                </span>
                              </div>
                              <p className="text-caption text-slate-500 m-0 mt-1">{room.floor} • {room.type}</p>
                              <p className="text-label font-semibold m-0 mt-2 truncate text-slate-700">
                                {isOccupied || isReserved ? room.tenant || (isReserved ? 'Reserved' : 'Active Tenant') : formatCurrency(room.rent)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: ACTIVITY LOGS */}
                  {!kpiStatus && activeLowerTab === 'activity' && (
                    <div className="space-y-3">
                      {(activityLogs || []).length === 0 ? (
                        <div className="text-label text-slate-500 text-center py-8">No recent activity logged</div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {(activityLogs || []).map(log => (
                            <div key={log.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3 hover:bg-slate-50/50 rounded-control transition-colors">
                              <div className={`w-8 h-8 rounded-control flex items-center justify-center shrink-0 mt-0.5 ${(LOG_CATEGORY_STYLE[log.category] || LOG_CATEGORY_STYLE.system).color}`}>
                                <FontAwesomeIcon icon={(LOG_CATEGORY_STYLE[log.category] || LOG_CATEGORY_STYLE.system).icon} className="text-xs" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                  <p className="text-label font-bold text-slate-800 m-0 truncate">{log.action}</p>
                                  <span className="text-caption text-slate-500 font-medium whitespace-nowrap shrink-0">
                                    {formatLogDate(log.created_at)}
                                  </span>
                                </div>
                                <p className="text-caption text-slate-500 m-0 mt-0.5">
                                  {log.details || `Performed by ${log.first_name ? `${log.first_name} ${log.last_name || ''}`.trim() : 'System'}`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="pt-2 text-center border-t border-slate-100">
                        <button 
                          onClick={() => navigate('/admin-activity-logs')}
                          className="text-label font-semibold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer"
                        >
                          View Full Audit History →
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Right: newest tenants */}
              <div className="flex flex-col">
                {/* Newest Approved Tenants */}
                <div className="bg-white rounded-card border border-slate-200 shadow-card p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-body font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faUserPlus} className="text-emerald-700" /> Newest Tenants
                    </h3>
                    <button onClick={() => navigate('/admin-tenants')} className="text-label text-indigo-600 hover:text-indigo-800 font-semibold bg-transparent border-0 cursor-pointer p-0">
                      View All
                    </button>
                  </div>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                    {loading ? (
                       <SkeletonList rows={3} label="Loading newest tenants…" />
                    ) : newTenants.length === 0 ? (
                       <div className="text-label text-slate-500 text-center py-4">No recent tenants</div>
                    ) : newTenants.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-control transition-colors cursor-pointer border border-transparent hover:border-slate-100">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-label shrink-0">
                          {t.name ? t.name.charAt(0) : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-semibold text-slate-800 m-0 truncate">{t.name}</p>
                          <p className="text-caption text-slate-500 m-0 flex items-center gap-1">
                            <FontAwesomeIcon icon={faBuilding} className="text-[9px]" /> Unit {t.unit}
                          </p>
                        </div>
                        <div className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap text-slate-600 shrink-0 bg-slate-100">
                          {t.date}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </>)}

          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;