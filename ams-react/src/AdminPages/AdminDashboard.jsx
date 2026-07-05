import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDollarSign, faUsers, faBuilding, faExclamationTriangle, 
  faCheckCircle, faClock, faChartLine, faChartPie, faWrench, faKey,
  faChartBar, faTable, faArrowUp, faArrowDown, faEllipsisV, faUserPlus, faInfoCircle,
  faFileContract, faFileAlt, faDownload, faHistory, faFileInvoiceDollar, faCogs, faFileSignature
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';

const incomeData = [
  { month: 'Dec', value: 38000, expenses: 12000 },
  { month: 'Jan', value: 40000, expenses: 14000 },
  { month: 'Feb', value: 39500, expenses: 13500 },
  { month: 'Mar', value: 41000, expenses: 15000 },
  { month: 'Apr', value: 41500, expenses: 12500 },
  { month: 'May', value: 42500, expenses: 16000 },
];

const newTenants = [
  { name: 'Miguel Santos', unit: '3B', date: 'May 12, 2024' },
  { name: 'Elena Gomez', unit: '4A', date: 'May 05, 2024' },
  { name: 'Carlos Diaz', unit: '1D', date: 'Apr 28, 2024' },
];

const activityLogs = [
  { id: 1, action: 'Payment Received', details: '₱12,500 from Unit 3B', time: '10 mins ago', type: 'payment' },
  { id: 2, action: 'Maintenance Updated', details: 'REQ-003 marked as In Progress', time: '1 hour ago', type: 'maintenance' },
  { id: 3, action: 'New Tenant Onboarded', details: 'Miguel Santos added to Unit 3B', time: '2 hours ago', type: 'tenant' },
  { id: 4, action: 'Contract Generated', details: 'Lease Agreement for Unit 4A', time: 'Yesterday', type: 'document' },
  { id: 5, action: 'System Login', details: 'Admin logged in', time: 'Yesterday', type: 'system' },
];

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [chartView, setChartView] = useState('bar'); 
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Dynamically calculate the highest value in the dataset for chart scaling (adding 10% padding at the top)
  const maxValue = Math.max(...incomeData.map(d => d.value)) * 1.1 || 1;

  // Dynamically generate SVG path coordinates for the Line Chart
  const linePoints = incomeData.map((d, i) => {
    const x = (i / (incomeData.length - 1)) * 100;
    const y = 100 - (d.value / maxValue) * 100;
    return `${x},${y}`;
  });
  const expensesPoints = incomeData.map((d, i) => {
    const x = (i / (incomeData.length - 1)) * 100;
    const y = 100 - (d.expenses / maxValue) * 100;
    return `${x},${y}`;
  });
  const pathD = `M ${linePoints.join(' L ')}`;
  const areaD = `M ${linePoints.join(' L ')} L 100,100 L 0,100 Z`;
  const expensesPathD = `M ${expensesPoints.join(' L ')}`;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Admin Dashboard" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* Statistics Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard icon={faDollarSign} title="Total Revenue" value="₱42,500" trend="+12%" color="emerald" tooltip="Revenue for the current month" />
              <StatCard icon={faExclamationTriangle} title="Pending Dues" value="₱15,000" trend="-5%" color="red" isBadTrend tooltip="Total outstanding balance across all tenants" />
              <StatCard icon={faUsers} title="Total Tenants" value="24" trend="+2" color="indigo" tooltip="Number of active tenants" />
              <StatCard icon={faChartPie} title="Occupancy" value="85%" subtext="24 / 28 Units" color="blue" showProgress progress="85" />
              <StatCard icon={faWrench} title="Maintenance" value="3" subtext="Open Requests" color="amber" onClick={() => navigate('/admin-maintenance')} hoverable />
              <StatCard icon={faKey} title="Vacant" value="4" subtext="Units Available" color="slate" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Income Report Chart block */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faChartLine} className="text-indigo-600" /> Income Overview
                    </h3>
                    <p className="text-xs text-slate-500 m-0 mt-1">Last 6 months revenue vs expenses</p>
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setChartView('bar')} className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer border-0 transition-colors ${chartView === 'bar' ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}><FontAwesomeIcon icon={faChartBar} /></button>
                    <button onClick={() => setChartView('line')} className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer border-0 transition-colors ${chartView === 'line' ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}><FontAwesomeIcon icon={faChartLine} /></button>
                    <button onClick={() => setChartView('table')} className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer border-0 transition-colors ${chartView === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}><FontAwesomeIcon icon={faTable} /></button>
                  </div>
                </div>
                
                <div className="p-6 flex-1 flex flex-col justify-end min-h-[300px]">
                  {chartView === 'bar' && (
                    <div className="h-48 flex items-end justify-between gap-2 sm:gap-4 px-1 sm:px-2 pb-2">
                      {incomeData.map(d => {
                        const dynamicHeight = `${(d.value / maxValue) * 100}%`;
                        const netIncomePercent = `${((d.value - d.expenses) / d.value) * 100}%`;

                        return (
                          <div key={d.month} className="flex flex-col items-center flex-1 gap-1 sm:gap-2 group relative cursor-pointer" onClick={() => setSelectedMonth(selectedMonth === d.month ? null : d.month)}>
                            
                            {/* Tooltip positioned perfectly above the bar */}
                            <div className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 transition-all z-50 w-28 pointer-events-none ${selectedMonth === d.month ? 'opacity-100 translate-y-0' : 'group-hover:opacity-100 group-hover:-translate-y-1 translate-y-2'}`}>
                              <div className="flex justify-between mb-1"><span className="text-slate-400">Income</span><span className="font-bold text-emerald-400">{formatCurrency(d.value)}</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">Expense</span><span className="font-bold text-red-400">{formatCurrency(d.expenses)}</span></div>
                            </div>
                            
                            <div className="w-full max-w-[3rem] bg-indigo-100 rounded-t-md relative overflow-hidden flex flex-col justify-end transition-all group-hover:opacity-90" style={{ height: dynamicHeight }}>
                              <div className={`w-full bg-indigo-500 absolute bottom-0 left-0 transition-all ${selectedMonth === d.month ? 'opacity-100' : 'opacity-60 group-hover:opacity-80'}`} style={{ height: '100%' }}></div>
                              <div className="w-full bg-emerald-400 absolute bottom-0 left-0 opacity-80" style={{ height: netIncomePercent }}></div>
                            </div>
                            <span className={`text-[10px] sm:text-xs font-semibold transition-colors ${selectedMonth === d.month ? 'text-indigo-600' : 'text-slate-500 group-hover:text-slate-800'}`}>{d.month}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {chartView === 'line' && (
                    <div className="h-48 relative flex flex-col justify-between pb-6 px-4">
                      {/* Fully Dynamic SVG Line Generation */}
                      <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                        <defs>
                          <linearGradient id="indigo-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="transparent" />
                          </linearGradient>
                        </defs>
                        <path d={areaD} fill="url(#indigo-grad)" className="opacity-20" />
                        <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="3" vectorEffect="non-scaling-stroke" className="drop-shadow-md opacity-70" />
                        <path d={expensesPathD} fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray="5,5" vectorEffect="non-scaling-stroke" className="drop-shadow-md opacity-70" />
                      </svg>
                      
                      {/* Properly Calculated Data Dots */}
                      <div className="absolute inset-0 w-full h-full pointer-events-none pb-6 px-4">
                        {incomeData.map((d, i) => {
                          const x = (i / (incomeData.length - 1)) * 100;
                          const y = 100 - (d.value / maxValue) * 100;
                          const ey = 100 - (d.expenses / maxValue) * 100;
                          return (
                            <React.Fragment key={d.month}>
                              <div 
                                className={`absolute w-3 h-3 rounded-full bg-white border-2 border-indigo-500 shadow-sm cursor-pointer hover:scale-150 transition-transform pointer-events-auto z-10 group ${selectedMonth === d.month ? 'scale-150 bg-indigo-100' : ''}`}
                                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                                onClick={() => setSelectedMonth(selectedMonth === d.month ? null : d.month)}
                              >
                                 {/* Re-using tooltip for line chart context */}
                                <div className={`absolute -top-14 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 transition-all z-20 w-28 pointer-events-none ${selectedMonth === d.month ? 'opacity-100' : 'group-hover:opacity-100'}`}>
                                  <div className="flex justify-between mb-1"><span className="text-slate-400">Income</span><span className="font-bold text-emerald-400">{formatCurrency(d.value)}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-400">Expense</span><span className="font-bold text-red-400">{formatCurrency(d.expenses)}</span></div>
                                </div>
                              </div>
                              <div 
                                className={`absolute w-3 h-3 rounded-full bg-white border-2 border-red-500 shadow-sm cursor-pointer hover:scale-150 transition-transform pointer-events-auto z-10 group ${selectedMonth === d.month ? 'scale-150 bg-red-100' : ''}`}
                                style={{ left: `${x}%`, top: `${ey}%`, transform: 'translate(-50%, -50%)' }}
                                onClick={() => setSelectedMonth(selectedMonth === d.month ? null : d.month)}
                              >
                                 <div className={`absolute -top-14 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 transition-all z-20 w-28 pointer-events-none ${selectedMonth === d.month ? 'opacity-100' : 'group-hover:opacity-100'}`}>
                                  <div className="flex justify-between mb-1"><span className="text-slate-400">Income</span><span className="font-bold text-emerald-400">{formatCurrency(d.value)}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-400">Expense</span><span className="font-bold text-red-400">{formatCurrency(d.expenses)}</span></div>
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {/* X Axis Labels aligned properly beneath points */}
                      <div className="absolute bottom-0 left-0 w-full h-0 px-4 mt-2">
                        {incomeData.map((d, i) => {
                          const x = (i / (incomeData.length - 1)) * 100;
                          return (
                            <span key={`label-${d.month}`} className={`absolute text-xs font-semibold transform -translate-x-1/2 ${selectedMonth === d.month ? 'text-indigo-600' : 'text-slate-500'}`} style={{ left: `${x}%`, top: '100%' }}>{d.month}</span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {chartView === 'table' && (
                    <div className="h-48 overflow-y-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                            <th className="py-2 px-3">Month</th><th className="py-2 px-3 text-right">Revenue</th><th className="py-2 px-3 text-right">Expenses</th><th className="py-2 px-3 text-right">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {incomeData.slice().reverse().map(d => (
                            <tr key={d.month} className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedMonth(d.month)}>
                              <td className="py-3 px-3 font-medium text-slate-800">{d.month}</td>
                              <td className="py-3 px-3 text-right text-slate-600">{formatCurrency(d.value)}</td>
                              <td className="py-3 px-3 text-right text-red-500">{formatCurrency(d.expenses)}</td>
                              <td className="py-3 px-3 text-right font-bold text-emerald-600">{formatCurrency(d.value - d.expenses)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {selectedMonth && chartView !== 'table' && (
                    <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-sm text-indigo-900 flex justify-between items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div>
                        <span className="font-bold mr-2">{selectedMonth} Detailed Breakdown</span>
                        <span className="text-xs opacity-75">Click month again to dismiss</span>
                      </div>
                      <button className="text-xs font-semibold text-indigo-700 bg-white px-3 py-1.5 rounded shadow-sm border-0 cursor-pointer hover:bg-indigo-100 transition-colors">View Full Report</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Summaries */}
              <div className="flex flex-col gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faBuilding} className="text-blue-600" /> Building Status
                    </h3>
                    <button className="text-slate-400 hover:text-indigo-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faEllipsisV} /></button>
                  </div>
                  
                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-medium text-slate-600">Occupancy Rate</span>
                        <span className="font-bold text-slate-800">85%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: '85%' }}></div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 m-0">24 occupied out of 28 total units</p>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-medium text-slate-600">Rent Collection</span>
                        <span className="font-bold text-slate-800">72%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '72%' }}></div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 m-0">17 out of 24 tenants paid for May</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faUserPlus} className="text-emerald-600" /> Newest Tenants
                    </h3>
                    <button className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-transparent border-0 cursor-pointer p-0">View All</button>
                  </div>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                    {newTenants.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-100">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                          {t.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 m-0 truncate">{t.name}</p>
                          <p className="text-[10px] text-slate-500 m-0 flex items-center gap-1"><FontAwesomeIcon icon={faBuilding} className="text-[9px]" /> Unit {t.unit}</p>
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

            {/* Third Row: Activity & Tools */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* System Activity Logs */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[22rem]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faHistory} className="text-slate-500" /> System Activity Log
                  </h3>
                  <button className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-transparent border-0 cursor-pointer p-0">View All</button>
                </div>
                <div className="p-0 flex-1 overflow-y-auto">
                  <div className="divide-y divide-slate-100">
                    {activityLogs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${log.type === 'payment' ? 'bg-emerald-100 text-emerald-600' : log.type === 'maintenance' ? 'bg-amber-100 text-amber-600' : log.type === 'tenant' ? 'bg-blue-100 text-blue-600' : log.type === 'document' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                          <FontAwesomeIcon icon={log.type === 'payment' ? faDollarSign : log.type === 'maintenance' ? faWrench : log.type === 'tenant' ? faUserPlus : log.type === 'document' ? faFileContract : faCogs} className="text-xs" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-sm font-semibold text-slate-800 m-0">{log.action}</p>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{log.time}</span>
                          </div>
                          <p className="text-xs text-slate-500 m-0">{log.details}</p>
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
                    <button className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:shadow-sm transition-all bg-white cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <FontAwesomeIcon icon={faFileInvoiceDollar} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-slate-800 m-0">Financial Report</p>
                          <p className="text-[10px] text-slate-500 m-0">Income & Expenses</p>
                        </div>
                      </div>
                      <FontAwesomeIcon icon={faDownload} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    </button>
                    
                    <button className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:shadow-sm transition-all bg-white cursor-pointer group">
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
                    <button className="w-full py-2.5 bg-white text-indigo-700 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-50 transition-colors border-0 cursor-pointer">
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
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal w-40 text-center pointer-events-none z-50 flex items-center justify-center gap-1">
          <FontAwesomeIcon icon={faInfoCircle} className="shrink-0" /> 
          <span>{tooltip}</span>
        </div>
      )}
      <div className="flex justify-between items-start mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${colorMap[color]} group-hover:scale-110 transition-transform`}>
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
        {showProgress && progress && (
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div className={`h-1.5 rounded-full ${colorMap[color].split(' ')[0].replace('50', '500')}`} style={{ width: `${progress}%` }}></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;