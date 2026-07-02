import React from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { 
  Plus, DollarSign, AlertCircle, AlertTriangle, 
  Info, CheckCircle2, User, Megaphone 
} from 'lucide-react';

const AdminDashboard = () => {
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* Import the Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Import the Header */}
        <Header title="Admin Dashboard" />

        {/* Scrollable Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            
            {/* Top Alerts */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg shadow-sm font-medium">
                <AlertCircle size={18} />
                2 overdue payments
              </div>
              <div className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-lg shadow-sm font-medium">
                <AlertTriangle size={18} />
                1 urgent maintenance
              </div>
              <div className="flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded-lg shadow-sm font-medium">
                <Info size={18} />
                1 vacant unit
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-emerald-50 rounded-full z-0 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                  <h3 className="text-sm font-semibold text-slate-500 mb-1">Monthly Revenue</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-emerald-600">₱24,000</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-red-50 rounded-full z-0 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                  <h3 className="text-sm font-semibold text-slate-500 mb-1">Pending Dues</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-red-600">₱11,000</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-2 font-medium">4 Tenants</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-amber-50 rounded-full z-0 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                  <h3 className="text-sm font-semibold text-slate-500 mb-1">Occupied Ratio / Total Units</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-amber-500">10 / 14</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts & Bottom Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Monthly Revenue Trend */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-6">Monthly Revenue Trend</h3>
                <div className="h-48 flex items-end justify-between gap-2 px-2">
                  {['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'].map((month, i) => {
                    const heights = [60, 65, 80, 85, 95, 90, 100];
                    return (
                      <div key={month} className="flex flex-col items-center flex-1 gap-2 group">
                        <div 
                          className="w-full max-w-[2.5rem] bg-indigo-100 group-hover:bg-indigo-500 rounded-t-sm transition-colors relative"
                          style={{ height: `${heights[i]}%` }}
                        ></div>
                        <span className="text-xs text-slate-500 font-medium">{month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Occupancy Rate */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-6">Occupancy Rate</h3>
                <div className="flex items-center justify-center gap-12 h-48">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-slate-100"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-indigo-600"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeDasharray="86, 100"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-xl font-bold text-slate-800">86%</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full bg-indigo-600"></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Occupied - 12</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full bg-slate-200"></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Vacant - 2</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-6">Recent Activity</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <DollarSign size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-800"><span className="font-semibold">John Doe</span> paid ₱5,500</p>
                      <p className="text-xs text-slate-500 mt-0.5">2 hours ago · Unit 3A</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-800"><span className="font-semibold">Unit 3A</span> became occupied</p>
                      <p className="text-xs text-slate-500 mt-0.5">3 days ago</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-800"><span className="font-semibold">Unit 3A</span> became vacant</p>
                      <p className="text-xs text-slate-500 mt-0.5">1 week ago</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-6">Quick Actions</h3>
                <div className="space-y-3">
                  <button className="w-full flex items-center gap-3 p-4 rounded-lg border border-slate-100 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-700 transition-all group text-left">
                    <div className="bg-white p-2 rounded-md shadow-sm text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Plus size={20} />
                    </div>
                    <span className="font-medium text-slate-700 group-hover:text-indigo-700">Add new tenant</span>
                  </button>
                  <button className="w-full flex items-center gap-3 p-4 rounded-lg border border-slate-100 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-100 hover:text-emerald-700 transition-all group text-left">
                    <div className="bg-white p-2 rounded-md shadow-sm text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <DollarSign size={20} />
                    </div>
                    <span className="font-medium text-slate-700 group-hover:text-emerald-700">Record Payment</span>
                  </button>
                  <button className="w-full flex items-center gap-3 p-4 rounded-lg border border-slate-100 bg-slate-50 hover:bg-amber-50 hover:border-amber-100 hover:text-amber-700 transition-all group text-left">
                    <div className="bg-white p-2 rounded-md shadow-sm text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                      <Megaphone size={20} />
                    </div>
                    <span className="font-medium text-slate-700 group-hover:text-amber-700">Send notice</span>
                  </button>
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