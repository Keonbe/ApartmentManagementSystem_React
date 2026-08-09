import React, { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDollarSign, faUsers, faBuilding, faExclamationTriangle, 
  faCheckCircle, faClock, faChartLine, faChartPie, faWrench, faKey,
  faChartBar, faTable, faArrowUp, faArrowDown, faUserPlus, faInfoCircle,
  faFileContract, faFileAlt, faDownload, faHistory, faFileInvoiceDollar, faCogs, faFileSignature,
  faClipboardList, faArrowRight
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';

const formatCurrency = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [chartView, setChartView] = useState('bar'); 
  const [selectedMonth, setSelectedMonth] = useState(null);

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
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, logsRes] = await Promise.all([
        api.get('dashboard_stats.php'),
        api.get('get_activity_logs.php')
      ]);

      if (statsRes.data && statsRes.data.success) {
        setStats(statsRes.data.stats || {});
        setIncomeData(statsRes.data.income_data || []);
        setNewTenants(statsRes.data.new_tenants || []);
      }
      if (logsRes.data && logsRes.data.success) {
        setActivityLogs((logsRes.data.logs || []).slice(0, 6));
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    }
    setLoading(false);
  };

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
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Admin Dashboard" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* Core KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
                hoverable 
              />
              <StatCard 
                icon={faChartPie} 
                title="Occupancy Rate" 
                value={`${stats.occupancy_rate}%`} 
                subtext={`${stats.occupied_rooms} / ${stats.total_rooms} Units Occupied`} 
                color="blue" 
                showProgress 
                progress={stats.occupancy_rate} 
                tooltip="Percentage of building units currently occupied"
              />
              <StatCard 
                icon={faKey} 
                title="Vacant Units" 
                value={stats.vacant_rooms} 
                subtext="Available to Lease" 
                color="slate" 
                onClick={() => navigate('/admin-units')} 
                hoverable 
                tooltip="Vacant apartment units ready for occupancy"
              />
              <StatCard 
                icon={faClipboardList} 
                title="Applications" 
                value={stats.pending_applications} 
                subtext={stats.pending_applications > 0 ? "Review required" : "All reviewed"} 
                color={stats.pending_applications > 0 ? "amber" : "indigo"} 
                onClick={() => navigate('/admin-applications')} 
                hoverable 
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
                hoverable 
                tooltip="Open maintenance tickets submitted by tenants"
              />
            </div>

            {/* Income Overview Chart & Secondary Status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
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
                <div className="grid grid-cols-3 bg-slate-50/70 border-b border-slate-100 px-6 py-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium">6-Mo Total Collected</span>
                    <p className="font-bold text-emerald-600 text-sm m-0 mt-0.5">{formatCurrency(stats.total_6m_collected)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Monthly Average</span>
                    <p className="font-bold text-slate-700 text-sm m-0 mt-0.5">{formatCurrency(stats.avg_monthly_income)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Collection Efficiency</span>
                    <p className={`font-bold text-sm m-0 mt-0.5 ${rentCollectionRate >= 90 ? 'text-emerald-600' : rentCollectionRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                      {rentCollectionRate}%
                    </p>
                  </div>
                </div>
                
                {/* Chart Canvas Area */}
                <div className="p-6 flex-1 flex flex-col justify-end min-h-[290px]">
                  {loading ? (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                      <FontAwesomeIcon icon={faClock} className="animate-spin mr-2" /> Loading financial data...
                    </div>
                  ) : incomeData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                      No income records found
                    </div>
                  ) : chartView === 'bar' ? (
                    <div>
                      {/* Legend */}
                      <div className="flex justify-end items-center gap-4 text-xs text-slate-500 mb-4">
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
                      <div className="h-44 flex items-end justify-between gap-3 sm:gap-6 px-2 pb-2">
                        {incomeData.map(d => {
                          const totalBilled = Math.max((d.collected || 0) + (d.pending || 0), d.billed || 0);
                          const dynamicHeight = totalBilled > 0 ? `${Math.max((totalBilled / maxValue) * 100, 8)}%` : '4px';
                          const collectedPercent = totalBilled > 0 ? `${((d.collected || 0) / totalBilled) * 100}%` : '0%';
                          const pendingPercent = totalBilled > 0 ? `${((d.pending || 0) / totalBilled) * 100}%` : '0%';
                          const isSelected = selectedMonth === d.month || selectedMonth === d.key;

                          return (
                            <div 
                              key={d.key || d.month} 
                              className="flex flex-col items-center flex-1 gap-2 group relative cursor-pointer" 
                              onClick={() => setSelectedMonth(isSelected ? null : d.month)}
                            >
                              {/* Hover / Active Tooltip */}
                              <div className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[11px] p-2.5 rounded-lg shadow-xl transition-all z-50 w-36 pointer-events-none ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 translate-y-2'}`}>
                                <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1.5">{d.full_month || d.month}</p>
                                <div className="flex justify-between mb-1"><span className="text-slate-400">Collected:</span><span className="font-bold text-emerald-400">{formatCurrency(d.collected)}</span></div>
                                <div className="flex justify-between mb-1"><span className="text-slate-400">Pending:</span><span className="font-bold text-amber-400">{formatCurrency(d.pending)}</span></div>
                                <div className="flex justify-between pt-1 border-t border-slate-700/80 font-semibold"><span className="text-slate-300">Total Billed:</span><span>{formatCurrency(totalBilled)}</span></div>
                              </div>
                              
                              {/* Amount Label above bar */}
                              <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-700 transition-colors">
                                {totalBilled > 0 ? formatCurrency(totalBilled) : '₱0'}
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
                                <div className={`absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 transition-all z-30 w-32 pointer-events-none ${isSelected ? 'opacity-100' : 'group-hover:opacity-100'}`}>
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
                          <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
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
                                <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{formatCurrency(d.collected)}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-amber-600">{formatCurrency(d.pending)}</td>
                                <td className="py-2.5 px-3 text-right">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rate >= 90 ? 'bg-emerald-100 text-emerald-800' : rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
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
                          <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                            {activeMonthData.count || 0} Invoice{activeMonthData.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex gap-4 mt-1 text-slate-600 text-xs">
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
                      <p className="text-[10px] text-slate-400 mt-1.5 m-0">{stats.occupied_rooms} occupied out of {stats.total_rooms} total building units</p>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-medium text-slate-600">Current Month Rent Collection</span>
                        <span className="font-bold text-slate-800">{rentCollectionRate}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-2 rounded-full transition-all ${rentCollectionRate >= 90 ? 'bg-emerald-500' : rentCollectionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${rentCollectionRate}%` }}></div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5 m-0">
                        {stats.pending_dues > 0 ? `${formatCurrency(stats.pending_dues)} remaining balance` : 'All invoices settled'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Newest Approved Tenants */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faUserPlus} className="text-emerald-600" /> Newest Tenants
                    </h3>
                    <button onClick={() => navigate('/admin-tenants')} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-transparent border-0 cursor-pointer p-0">
                      View All
                    </button>
                  </div>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                    {loading ? (
                       <div className="text-xs text-slate-400 text-center py-4">Loading tenants...</div>
                    ) : newTenants.length === 0 ? (
                       <div className="text-xs text-slate-400 text-center py-4">No recent tenants</div>
                    ) : newTenants.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-100">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                          {t.name ? t.name.charAt(0) : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 m-0 truncate">{t.name}</p>
                          <p className="text-[10px] text-slate-500 m-0 flex items-center gap-1">
                            <FontAwesomeIcon icon={faBuilding} className="text-[9px]" /> Unit {t.unit}
                          </p>
                        </div>
                        <div className="text-[10px] font-medium text-slate-400 shrink-0 bg-slate-100 px-2 py-1 rounded">
                          {t.date}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Third Row: Activity Logs & Tools */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* System Activity Logs */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[22rem]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faHistory} className="text-slate-500" /> System Activity Log
                  </h3>
                  <button onClick={() => navigate('/admin-activity-logs')} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-transparent border-0 cursor-pointer p-0">
                    View All
                  </button>
                </div>
                <div className="p-0 flex-1 overflow-y-auto">
                  <div className="divide-y divide-slate-100">
                    {loading ? (
                        <div className="text-sm text-slate-400 text-center py-8">Loading logs...</div>
                    ) : activityLogs.length === 0 ? (
                        <div className="text-sm text-slate-400 text-center py-8">No recent activity</div>
                    ) : activityLogs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${log.entity_type === 'invoice' ? 'bg-emerald-100 text-emerald-600' : log.entity_type === 'maintenance' || log.entity_type === 'room' ? 'bg-amber-100 text-amber-600' : log.entity_type === 'rent_application' ? 'bg-blue-100 text-blue-600' : log.entity_type === 'contract' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                          <FontAwesomeIcon icon={log.entity_type === 'invoice' ? faDollarSign : log.entity_type === 'maintenance' ? faWrench : log.entity_type === 'rent_application' ? faUserPlus : log.entity_type === 'contract' ? faFileContract : faCogs} className="text-xs" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-sm font-semibold text-slate-800 m-0">{log.action}</p>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <p className="text-xs text-slate-500 m-0">Admin #{log.admin_id} modified {log.entity_type} #{log.entity_id}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tools: Reports & Contracts */}
              <div className="flex flex-col gap-6">
                
                {/* Reports Generation */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faFileAlt} className="text-indigo-600" /> Generate Reports
                  </h3>
                  <div className="space-y-3">
                    <button onClick={() => navigate('/admin-reports')} className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:shadow-sm transition-all bg-white cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <FontAwesomeIcon icon={faFileInvoiceDollar} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-slate-800 m-0">Financial Report</p>
                          <p className="text-[10px] text-slate-500 m-0">Income & Collections</p>
                        </div>
                      </div>
                      <FontAwesomeIcon icon={faDownload} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    </button>
                    
                    <button onClick={() => navigate('/admin-reports')} className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:shadow-sm transition-all bg-white cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
                          <FontAwesomeIcon icon={faBuilding} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-slate-800 m-0">Occupancy Report</p>
                          <p className="text-[10px] text-slate-500 m-0">Tenant & Unit Status</p>
                        </div>
                      </div>
                      <FontAwesomeIcon icon={faDownload} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    </button>
                  </div>
                </div>

                {/* Contract Generation */}
                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl shadow-md p-6 text-white relative overflow-hidden">
                  <FontAwesomeIcon icon={faFileSignature} className="absolute -right-4 -bottom-4 text-8xl text-white/10" />
                  <div className="relative z-10">
                    <h3 className="text-sm font-bold flex items-center gap-2 m-0 mb-2">
                      <FontAwesomeIcon icon={faFileContract} /> Contract Generation
                    </h3>
                    <p className="text-xs text-indigo-100 mb-4">Create new lease agreements instantly with pre-filled templates.</p>
                    <button onClick={() => navigate('/admin-contracts')} className="w-full py-2.5 bg-white text-indigo-700 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-50 transition-colors border-0 cursor-pointer">
                      Create New Contract
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

/* --- StatCard Helper --- */
const StatCard = ({ icon, title, value, trend, subtext, color, isBadTrend, showProgress, progress, onClick, hoverable, tooltip }) => {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  const trendColor = isBadTrend ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700';

  return (
    <div 
      className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between relative group ${hoverable || onClick ? 'cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all' : ''}`}
      onClick={onClick}
    >
      {tooltip && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal w-44 text-center pointer-events-none z-50 flex items-center justify-center gap-1">
          <FontAwesomeIcon icon={faInfoCircle} className="shrink-0 text-slate-400" /> 
          <span>{tooltip}</span>
        </div>
      )}
      <div className="flex justify-between items-start mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${colorMap[color] || colorMap.slate} group-hover:scale-110 transition-transform`}>
          <FontAwesomeIcon icon={icon} />
        </div>
        {trend && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${trendColor}`}>
            {trend.includes('+') ? <FontAwesomeIcon icon={faArrowUp} className="text-[8px]" /> : <FontAwesomeIcon icon={faArrowDown} className="text-[8px]" />}
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800 m-0 leading-none">{value}</p>
        {subtext && <p className="text-[10px] text-slate-500 m-0 mt-2 font-medium">{subtext}</p>}
        {showProgress && progress !== undefined && (
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div className={`h-1.5 rounded-full ${(colorMap[color] || '').split(' ')[0].replace('50', '500')}`} style={{ width: `${progress}%` }}></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;