import React from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { Download } from 'lucide-react';

const revenueMonths = [
  { label: 'Nov', height: 55 },
  { label: 'Dec', height: 62 },
  { label: 'Jan', height: 68 },
  { label: 'Feb', height: 63 },
  { label: 'Mar', height: 72 },
  { label: 'Apr', height: 80, active: true },
];

const outstandingBalances = [
  { label: 'Pedro Cruz 2B', width: 85, value: '₱6,500', color: 'bg-red-500', textColor: 'text-red-500' },
  { label: 'Rosa D.C. 2C', width: 97, value: '₱7,500', color: 'bg-amber-500', textColor: 'text-amber-500' },
  { label: 'Ben Flores 3A', width: 85, value: '₱6,500', color: 'bg-red-500', textColor: 'text-red-500' },
];

const utilityData = [
  { label: 'Water', width: 45, value: '₱320/mo', color: 'bg-blue-400' },
  { label: 'Electricity', width: 70, value: '₱760/mo', color: 'bg-amber-400' },
];

const occupancyTrend = [
  { label: '80%', height: 50, color: 'bg-emerald-100' },
  { label: '82%', height: 55, color: 'bg-emerald-100' },
  { label: '82%', height: 55, color: 'bg-emerald-100' },
  { label: '85%', height: 60, color: 'bg-emerald-100' },
  { label: '85%', height: 60, color: 'bg-emerald-100' },
  { label: '86%', height: 62, color: 'bg-emerald-500', active: true },
];

const AdminReports = () => {
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header title="Reports & Analytics" />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Top Action */}
            <div className="flex items-center justify-end">
              <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
                <Download size={14} />
                Export PDF
              </button>
            </div>

            {/* KPI Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Total collected</div>
                <div className="text-2xl font-bold text-slate-800">₱84,000</div>
                <div className="text-xs text-slate-400 mt-1">April 2025</div>
              </div>
              <div className="bg-white border-l-4 border-l-red-500 border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Outstanding</div>
                <div className="text-2xl font-bold text-red-500">₱13,500</div>
                <div className="text-xs text-slate-400 mt-1">3 tenants</div>
              </div>
              <div className="bg-white border-l-4 border-l-emerald-500 border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Occupancy rate</div>
                <div className="text-2xl font-bold text-slate-800">86%</div>
                <div className="text-xs text-slate-400 mt-1">12 of 14 units</div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Revenue Chart */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Revenue — last 6 months</h3>
                <div className="h-24 flex items-end gap-2">
                  {revenueMonths.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t transition-all cursor-pointer ${
                          m.active
                            ? 'bg-gradient-to-t from-indigo-700 to-indigo-500'
                            : 'bg-blue-100 hover:bg-blue-200'
                        }`}
                        style={{ height: `${m.height}px` }}
                      />
                      <span className="text-[9px] text-slate-400 font-medium">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Outstanding Balances */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Outstanding balances</h3>
                <div className="space-y-4">
                  {outstandingBalances.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="text-xs text-slate-500 min-w-[90px] font-medium">{item.label}</div>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.width}%` }} />
                      </div>
                      <div className={`text-xs font-bold min-w-[60px] text-right ${item.textColor}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Utility Consumption */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Utility consumption (avg per unit)</h3>
                <div className="space-y-4">
                  {utilityData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="text-xs text-slate-500 min-w-[80px] font-medium">{item.label}</div>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.width}%` }} />
                      </div>
                      <div className="text-xs font-bold text-slate-800 min-w-[70px] text-right">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Occupancy Trend */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Occupancy trend</h3>
                <div className="h-20 flex items-end gap-2">
                  {occupancyTrend.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t transition-all ${m.color}`}
                        style={{ height: `${m.height}px` }}
                      />
                      <span className="text-[8px] text-slate-400 font-medium">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminReports;
