import { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDollarSign, faUsers, faBuilding, faExclamationTriangle, 
  faCheckCircle, faClock, faChartLine, faChartPie, faWrench, faKey,
  faChartBar, faTable, faUserPlus, faInfoCircle,
  faDownload, faHistory, faFileInvoiceDollar, faCogs, faFileSignature,
  faClipboardList, faArrowRight, faBullhorn, faChevronRight
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { clickable } from '../utils/clickable';
import StatCard from '../Components/admin/StatCard';

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
  communication: { icon: faBullhorn, color: 'bg-rose-100 text-rose-600' },
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
  const [activeLowerTab, setActiveLowerTab] = useState('actions');

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
  const [pendingActions, setPendingActions] = useState({
    applications: [],
    invoices: [],
    maintenance: []
  });
  const [roomsSummary, setRoomsSummary] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const statsRes = await api.get('dashboard_stats.php');
      if (statsRes.data && statsRes.data.success) {
        setStats(statsRes.data.stats || {});
        setIncomeData(statsRes.data.income_data || []);
        setNewTenants(statsRes.data.new_tenants || []);
        
        const actions = statsRes.data.pending_actions || { applications: [], invoices: [], maintenance: [] };
        setPendingActions(actions);
        setRoomsSummary(statsRes.data.rooms_summary || []);
        setActivityLogs(statsRes.data.activity_logs || []);
        
        const totalPending = (actions.applications?.length || 0) + (actions.invoices?.length || 0) + (actions.maintenance?.length || 0);
        if (totalPending === 0) {
          setActiveLowerTab('units');
        }
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
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

  const totalPendingActions = (pendingActions?.applications?.length || 0) + 
                              (pendingActions?.invoices?.length || 0) + 
                              (pendingActions?.maintenance?.length || 0);

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Admin Dashboard" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">

            {/* Core KPI Cards Grid */}
            <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
              <StatCard 
                icon={faDollarSign} 
                title="Monthly Revenue" 
                value={formatCurrency(stats.total_revenue)} 
                color="emerald" 
                trend={stats.revenue_trend}
                subtext={stats.last_month_revenue > 0 ? `vs ${formatCurrency(stats.last_month_revenue)} last mo` : 'Current month collected'}
                tooltip="Total rent and utility payments collected this month" 
              />
              <StatCard 
                icon={faExclamationTriangle} 
                title="Pending Dues" 
                value={formatCurrency(stats.pending_dues)} 
                color={stats.pending_dues > 0 ? "red" : "slate"} 
                isBadTrend={stats.overdue_count > 0}
                subtext={stats.overdue_count > 0 ? `${stats.overdue_count} overdue invoice${stats.overdue_count > 1 ? 's' : ''}` : 'No overdue accounts'}
                tooltip="Outstanding tenant balances across all units" 
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
              />
              <StatCard 
                icon={faKey} 
                title="Vacant Units" 
                value={stats.vacant_rooms} 
                subtext="Available for Rent" 
                color="slate" 
                onClick={() => navigate('/admin-units')} 
                tooltip="Vacant apartment units ready for occupancy"
              />
              <StatCard 
                icon={faClipboardList} 
                title="Applications" 
                value={stats.pending_applications} 
                subtext={stats.pending_applications > 0 ? "Review required" : "All reviewed"} 
                color={stats.pending_applications > 0 ? "amber" : "indigo"} 
                onClick={() => navigate('/admin-applications')} 
                tooltip="Prospective tenant applications awaiting approval"
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
              />
            </div>

            {/* Income Overview Chart & Secondary Status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* Income Overview Chart Block */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                
                {/* Header */}
                <div className="p-5 md:p-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faChartLine} className="text-indigo-600" /> Income & Cash Flow Overview
                    </h3>
                    <p className="text-xs text-slate-500 m-0 mt-1">6-month rolling breakdown: Collected revenue vs Pending dues</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button 
                        onClick={() => setChartView('bar')} 
                        title="Bar Chart"
                        className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer border-0 transition-colors ${chartView === 'bar' ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <FontAwesomeIcon icon={faChartBar} />
                      </button>
                      <button 
                        onClick={() => setChartView('line')} 
                        title="Line Chart"
                        className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer border-0 transition-colors ${chartView === 'line' ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <FontAwesomeIcon icon={faChartLine} />
                      </button>
                      <button 
                        onClick={() => setChartView('table')} 
                        title="Data Table"
                        className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer border-0 transition-colors ${chartView === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <FontAwesomeIcon icon={faTable} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Summary Metrics Ribbon */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50/70 border-b border-slate-100 px-4 md:px-6 py-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium">6-Mo Total Collected</span>
                    <p className="font-bold text-emerald-700 text-sm m-0 mt-0.5">{formatCurrency(stats.total_6m_collected)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Monthly Average</span>
                    <p className="font-bold text-slate-700 text-sm m-0 mt-0.5">{formatCurrency(stats.avg_monthly_income)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Collection Efficiency</span>
                    <p className={`font-bold text-sm m-0 mt-0.5 ${rentCollectionRate >= 90 ? 'text-emerald-700' : rentCollectionRate >= 70 ? 'text-amber-700' : 'text-red-600'}`}>
                      {rentCollectionRate}%
                    </p>
                  </div>
                </div>
                
                {/* Chart Canvas Area */}
                <div className="p-4 md:p-6 flex-1 flex flex-col">
                  {loading ? (
                    <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
                      <FontAwesomeIcon icon={faClock} className="animate-spin mr-2" /> Loading financial data...
                    </div>
                  ) : incomeData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
                      No income records found
                    </div>
                  ) : chartView === 'bar' ? (
                    <div className="flex flex-col">
                      {/* Legend */}
                      <div className="flex justify-end items-center gap-4 text-xs text-slate-500 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span>
                          <span>Collected</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded bg-amber-400 inline-block"></span>
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
                              className="flex flex-col items-center flex-1 min-w-0 gap-2 group relative cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                              {...clickable(() => setSelectedMonth(isSelected ? null : d.month))}
                              aria-pressed={isSelected}
                              aria-label={`${d.full_month || d.month}: collected ${formatCurrency(d.collected)}, pending ${formatCurrency(d.pending)}`}
                            >
                              {/* Hover / Active Tooltip */}
                              <div className={`absolute bottom-full mb-2 ${tooltipAlign(i, incomeData.length)} bg-slate-800 text-white text-[11px] p-2.5 rounded-lg shadow-xl transition-all z-50 w-36 pointer-events-none ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 translate-y-2'}`}>
                                <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1.5">{d.full_month || d.month}</p>
                                <div className="flex justify-between mb-1"><span className="text-slate-400">Collected:</span><span className="font-bold text-emerald-400">{formatCurrency(d.collected)}</span></div>
                                <div className="flex justify-between mb-1"><span className="text-slate-400">Pending:</span><span className="font-bold text-amber-400">{formatCurrency(d.pending)}</span></div>
                                <div className="flex justify-between pt-1 border-t border-slate-700/80 font-semibold"><span className="text-slate-300">Total Billed:</span><span>{formatCurrency(totalBilled)}</span></div>
                              </div>
                              
                              {/* Amount Label above bar */}
                              <span className="text-[11px] font-semibold text-slate-500 group-hover:text-slate-700 transition-colors whitespace-nowrap">
                                <span className="sm:hidden">{formatCompactCurrency(totalBilled)}</span>
                                <span className="hidden sm:inline">{totalBilled > 0 ? formatCurrency(totalBilled) : '₱0'}</span>
                              </span>

                              {/* The Stacked Bar */}
                              <div 
                                className={`w-full max-w-[2.75rem] rounded-t-md relative overflow-hidden flex flex-col justify-end transition-all ${totalBilled === 0 ? 'bg-slate-200' : 'bg-slate-100'} ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : 'group-hover:opacity-90'}`} 
                                style={{ height: dynamicHeight }}
                              >
                                <div className="w-full bg-amber-400 absolute top-0 left-0 transition-all opacity-90" style={{ height: pendingPercent }}></div>
                                <div className="w-full bg-emerald-500 absolute bottom-0 left-0 transition-all opacity-95" style={{ height: collectedPercent }}></div>
                              </div>

                              {/* Month Label */}
                              <span className={`text-xs font-bold transition-colors ${isSelected ? 'text-indigo-600' : 'text-slate-500 group-hover:text-slate-800'}`}>
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
                      <div className="flex justify-end items-center gap-4 text-xs text-slate-500 mb-2">
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
                                className={`absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md cursor-pointer hover:scale-150 transition-transform pointer-events-auto z-10 group ${isSelected ? 'scale-150 bg-indigo-100 ring-2 ring-indigo-400' : ''}`}
                                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                                onClick={() => setSelectedMonth(isSelected ? null : d.month)}
                              >
                                <div className={`absolute -top-16 ${tooltipAlign(i, incomeData.length)} bg-slate-800 text-white text-[11px] p-2 rounded shadow-lg opacity-0 transition-all z-30 w-32 pointer-events-none ${isSelected ? 'opacity-100' : 'group-hover:opacity-100'}`}>
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
                            className={`text-xs font-bold transition-colors cursor-pointer ${selectedMonth === d.month ? 'text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
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
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                            <th className="py-2.5 px-3">Period</th>
                            <th className="py-2.5 px-3 text-right">Invoices</th>
                            <th className="py-2.5 px-3 text-right">Total Billed</th>
                            <th className="py-2.5 px-3 text-right">Collected</th>
                            <th className="py-2.5 px-3 text-right">Pending</th>
                            <th className="py-2.5 px-3 text-right">Collection Rate</th>
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
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${rate >= 90 ? 'bg-emerald-100 text-emerald-800' : rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
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
                    <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 text-xs text-indigo-950 flex flex-wrap justify-between items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-indigo-900">{activeMonthData.full_month || activeMonthData.month} Summary</span>
                          <span className="bg-indigo-100 text-indigo-700 text-[11px] px-2 py-0.5 rounded-full font-semibold">
                            {activeMonthData.count || 0} Invoice{activeMonthData.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-slate-600 text-xs">
                          <span>Collected: <strong className="text-emerald-700">{formatCurrency(activeMonthData.collected)}</strong></span>
                          <span>Pending: <strong className="text-amber-700">{formatCurrency(activeMonthData.pending)}</strong></span>
                          <span>Billed: <strong>{formatCurrency(Math.max((activeMonthData.collected || 0) + (activeMonthData.pending || 0), activeMonthData.billed || 0))}</strong></span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                          onClick={() => setSelectedMonth(null)}
                        >
                          Dismiss
                        </button>
                        <button 
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm border-0 cursor-pointer transition-colors flex items-center gap-1.5"
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

              {/* Status Summaries & Newest Tenants */}
              <div className="flex flex-col gap-6">
                
                {/* Building Status Widget */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faBuilding} className="text-blue-600" /> Building Health
                    </h3>
                  </div>
                  
                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-medium text-slate-600">Occupancy Capacity</span>
                        <span className="font-bold text-slate-800">{stats.occupancy_rate}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${stats.occupancy_rate}%` }}></div>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5 m-0">{stats.occupied_rooms} occupied out of {stats.total_rooms} total building units</p>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-medium text-slate-600">Current Month Rent Collection</span>
                        <span className="font-bold text-slate-800">{rentCollectionRate}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-2 rounded-full transition-all ${rentCollectionRate >= 90 ? 'bg-emerald-500' : rentCollectionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${rentCollectionRate}%` }}></div>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5 m-0">
                        {stats.pending_dues > 0 ? `${formatCurrency(stats.pending_dues)} remaining balance` : 'All invoices settled'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Newest Approved Tenants */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faUserPlus} className="text-emerald-700" /> Newest Tenants
                    </h3>
                    <button onClick={() => navigate('/admin-tenants')} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-transparent border-0 cursor-pointer p-0">
                      View All
                    </button>
                  </div>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                    {loading ? (
                       <div className="text-xs text-slate-500 text-center py-4">Loading tenants...</div>
                    ) : newTenants.length === 0 ? (
                       <div className="text-xs text-slate-500 text-center py-4">No recent tenants</div>
                    ) : newTenants.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-100">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {t.name ? t.name.charAt(0) : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 m-0 truncate">{t.name}</p>
                          <p className="text-[11px] text-slate-500 m-0 flex items-center gap-1">
                            <FontAwesomeIcon icon={faBuilding} className="text-[9px]" /> Unit {t.unit}
                          </p>
                        </div>
                        <div className="text-[11px] font-medium text-slate-500 shrink-0 bg-slate-100 px-2 py-1 rounded">
                          {t.date}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Third Row: Operational Command Center & Management Hub */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left (Col 2): Operations Command Center */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                
                {/* Tab Header */}
                <div className="p-4 md:px-6 md:py-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
                  <h3 className="text-base font-bold text-slate-800 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faCogs} className="text-indigo-600" /> Operational Command
                  </h3>

                  <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                    <button
                      onClick={() => setActiveLowerTab('actions')}
                      className={`px-3 py-1.5 rounded-md cursor-pointer border-0 transition-all flex items-center gap-1.5 ${activeLowerTab === 'actions' ? 'bg-white text-indigo-700 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      <FontAwesomeIcon icon={faClipboardList} />
                      <span>Action Queue</span>
                      {totalPendingActions > 0 && (
                        <span className="bg-amber-500 text-white text-[11px] px-1.5 py-0.2 rounded-full font-bold">
                          {totalPendingActions}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setActiveLowerTab('units')}
                      className={`px-3 py-1.5 rounded-md cursor-pointer border-0 transition-all flex items-center gap-1.5 ${activeLowerTab === 'units' ? 'bg-white text-indigo-700 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      <FontAwesomeIcon icon={faBuilding} />
                      <span>Unit Matrix</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        ({roomsSummary.length})
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveLowerTab('activity')}
                      className={`px-3 py-1.5 rounded-md cursor-pointer border-0 transition-all flex items-center gap-1.5 ${activeLowerTab === 'activity' ? 'bg-white text-indigo-700 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      <FontAwesomeIcon icon={faHistory} />
                      <span>Activity Log</span>
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                <div className="p-5 md:p-6 flex-1 overflow-y-auto max-h-[22rem]">
                  
                  {/* TAB 1: ACTION QUEUE */}
                  {activeLowerTab === 'actions' && (
                    <div className="space-y-4">
                      {totalPendingActions === 0 ? (
                        <div className="py-8 text-center flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl mb-3">
                            <FontAwesomeIcon icon={faCheckCircle} />
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 m-0">All Operational Queues Clear</h4>
                          <p className="text-xs text-slate-500 mt-1 max-w-sm">No pending applications, unverified payments, or active maintenance bottlenecks at this time.</p>
                          <div className="flex gap-2 mt-4">
                            <button onClick={() => navigate('/admin-units')} className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border-0 cursor-pointer transition-colors">
                              View Unit Inventory
                            </button>
                            <button onClick={() => navigate('/admin-announcements')} className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-0 cursor-pointer transition-colors">
                              Post Announcement
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Pending Applications */}
                          {(pendingActions?.applications || []).map(app => (
                            <div key={`app-${app.id}`} className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/70 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-xs shrink-0">
                                  <FontAwesomeIcon icon={faUserPlus} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold text-slate-800 m-0">{app.name}</p>
                                    <span className="bg-amber-100 text-amber-800 text-[11px] px-1.5 py-0.2 rounded font-semibold">Rent Application</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                                    Requested Unit <strong>{app.unit}</strong> • {formatCurrency(app.rent)}/mo • {app.date}
                                  </p>
                                </div>
                              </div>
                              <button 
                                onClick={() => navigate('/admin-applications')}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold border-0 cursor-pointer shadow-sm transition-colors whitespace-nowrap"
                              >
                                Review
                              </button>
                            </div>
                          ))}

                          {/* Pending Invoices / Payments */}
                          {(pendingActions?.invoices || []).map(inv => (
                            <div key={`inv-${inv.id}`} className="p-3.5 bg-rose-50/60 rounded-xl border border-rose-200/70 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center text-xs shrink-0">
                                  <FontAwesomeIcon icon={faDollarSign} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold text-slate-800 m-0">{inv.tenant || 'Tenant'}</p>
                                    <span className={`text-[11px] px-1.5 py-0.2 rounded font-semibold ${inv.is_overdue ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                                      {inv.is_overdue ? 'Overdue' : 'Pending Payment'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                                    Unit {inv.unit} • <strong>{formatCurrency(inv.amount)}</strong> • Due {inv.due_date}
                                  </p>
                                </div>
                              </div>
                              <button 
                                onClick={() => navigate('/admin-payments')}
                                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold border-0 cursor-pointer shadow-sm transition-colors whitespace-nowrap"
                              >
                                Verify
                              </button>
                            </div>
                          ))}

                          {/* Active Maintenance */}
                          {(pendingActions?.maintenance || []).map(maint => (
                            <div key={`maint-${maint.id}`} className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-200/70 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs shrink-0">
                                  <FontAwesomeIcon icon={faWrench} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold text-slate-800 m-0">{maint.category || 'Maintenance'}</p>
                                    <span className={`text-[11px] px-1.5 py-0.2 rounded font-semibold ${maint.urgency?.toLowerCase() === 'emergency' || maint.urgency?.toLowerCase() === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                                      {maint.urgency || 'Normal'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                                    Unit {maint.unit} ({maint.tenant}) • Submitted {maint.date}
                                  </p>
                                </div>
                              </div>
                              <button 
                                onClick={() => navigate('/admin-maintenance')}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold border-0 cursor-pointer shadow-sm transition-colors whitespace-nowrap"
                              >
                                Open Ticket
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: UNIT MATRIX */}
                  {activeLowerTab === 'units' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-xs text-slate-500 border-b border-slate-100 pb-2">
                        <div className="flex gap-4">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                            <span>Occupied ({stats.occupied_rooms})</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span>
                            <span>Vacant ({stats.vacant_rooms})</span>
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
                              className={`card-interactive p-3 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                                isOccupied 
                                  ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-400' 
                                  : isReserved
                                  ? 'bg-amber-50/40 border-amber-200 hover:border-amber-400'
                                  : 'bg-slate-50 border-slate-200 hover:border-indigo-400'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <span className="font-extrabold text-sm text-slate-800">{room.id}</span>
                                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isOccupied 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : isReserved
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {isOccupied ? 'Occupied' : isReserved ? 'Reserved' : 'Vacant'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 m-0 mt-1">{room.floor} • {room.type}</p>
                              <p className="text-xs font-semibold m-0 mt-2 truncate text-slate-700">
                                {isOccupied || isReserved ? room.tenant || (isReserved ? 'Reserved' : 'Active Tenant') : formatCurrency(room.rent)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: ACTIVITY LOGS */}
                  {activeLowerTab === 'activity' && (
                    <div className="space-y-3">
                      {(activityLogs || []).length === 0 ? (
                        <div className="text-xs text-slate-500 text-center py-8">No recent activity logged</div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {(activityLogs || []).map(log => (
                            <div key={log.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3 hover:bg-slate-50/50 rounded-lg transition-colors">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${(LOG_CATEGORY_STYLE[log.category] || LOG_CATEGORY_STYLE.system).color}`}>
                                <FontAwesomeIcon icon={(LOG_CATEGORY_STYLE[log.category] || LOG_CATEGORY_STYLE.system).icon} className="text-xs" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                  <p className="text-xs font-bold text-slate-800 m-0 truncate">{log.action}</p>
                                  <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap shrink-0">
                                    {formatLogDate(log.created_at)}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 m-0 mt-0.5">
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
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer"
                        >
                          View Full Audit History →
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Right: Quick Tools & Actions Launcher (Col 1) */}
              <div className="flex flex-col gap-5">
                
                {/* 4 Fast Action Shortcuts */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3.5 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faCogs} className="text-indigo-600" /> Management Hub
                  </h3>
                  
                  <div className="space-y-2.5">
                    <button 
                      onClick={() => navigate('/admin-contracts')} 
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:shadow-sm transition-all bg-white cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faFileSignature} className="text-xs" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 m-0">Create Rent Agreement</p>
                          <p className="text-[11px] text-slate-500 m-0">Generate contract for approved tenant</p>
                        </div>
                      </div>
                      <FontAwesomeIcon icon={faChevronRight} className="text-slate-300 group-hover:text-indigo-600 text-xs transition-colors" />
                    </button>

                    <button 
                      onClick={() => navigate('/admin-payments')} 
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-emerald-400 hover:shadow-sm transition-all bg-white cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-xs" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 m-0">Record / Verify Payment</p>
                          <p className="text-[11px] text-slate-500 m-0">Log cash or verify bank transfer</p>
                        </div>
                      </div>
                      <FontAwesomeIcon icon={faChevronRight} className="text-slate-300 group-hover:text-emerald-600 text-xs transition-colors" />
                    </button>

                    <button 
                      onClick={() => navigate('/admin-announcements')} 
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-amber-400 hover:shadow-sm transition-all bg-white cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faBullhorn} className="text-xs" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 m-0">Broadcast Notice</p>
                          <p className="text-[11px] text-slate-500 m-0">Notify all building tenants</p>
                        </div>
                      </div>
                      <FontAwesomeIcon icon={faChevronRight} className="text-slate-300 group-hover:text-amber-600 text-xs transition-colors" />
                    </button>

                    <button 
                      onClick={() => navigate('/admin-reports')} 
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all bg-white cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faDownload} className="text-xs" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 m-0">Financial & Occupancy Reports</p>
                          <p className="text-[11px] text-slate-500 m-0">Export income, billing & tenant data</p>
                        </div>
                      </div>
                      <FontAwesomeIcon icon={faChevronRight} className="text-slate-300 group-hover:text-blue-600 text-xs transition-colors" />
                    </button>
                  </div>
                </div>

                {/* Building Portfolio Quick Card */}
                <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-xl shadow-sm p-5 text-white flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">Property Overview</span>
                      <span className="text-[11px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-semibold">ams_db</span>
                    </div>
                    <h4 className="text-sm font-bold m-0 text-white">Apartment Building Portfolio</h4>
                    <p className="text-xs text-slate-400 mt-1 m-0">13 Total Units • 3 Floors • Studio Layouts</p>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-[11px] text-slate-400">Total Rented</span>
                      <p className="font-bold text-emerald-400 text-sm m-0">{stats.occupied_rooms} / {stats.total_rooms} Units</p>
                    </div>
                    <button 
                      onClick={() => navigate('/admin-reports')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold border-0 cursor-pointer shadow-sm transition-colors"
                    >
                      View Reports
                    </button>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;