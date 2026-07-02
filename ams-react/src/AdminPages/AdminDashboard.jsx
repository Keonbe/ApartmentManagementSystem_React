import React from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { 
  DollarSign, Users, Building, AlertTriangle, CheckCircle, 
  Clock, Activity, PieChart, TrendingUp, Key, Wrench, XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header title="Admin Dashboard" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* ─── 1. Comprehensive Statistics Cards ─── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard 
                icon={<DollarSign size={20} />} title="Total Revenue" 
                value="₱42,500" trend="+12%" color="emerald" 
              />
              <StatCard 
                icon={<AlertTriangle size={20} />} title="Pending Dues" 
                value="₱15,000" trend="-5%" color="red" 
              />
              <StatCard 
                icon={<Users size={20} />} title="Total Tenants" 
                value="24" trend="+2" color="indigo" 
              />
              <StatCard 
                icon={<PieChart size={20} />} title="Occupancy" 
                value="85%" subtext="24 / 28 Units" color="blue" 
              />
              <StatCard 
                icon={<Wrench size={20} />} title="Maintenance" 
                value="3" subtext="Open Requests" color="amber" 
              />
              <StatCard 
                icon={<Key size={20} />} title="Vacant" 
                value="4" subtext="Units Available" color="slate" 
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* ─── 2. Income Reports (Chart + Table) ─── */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <TrendingUp size={16} className="text-indigo-600" /> Income Report
                  </h3>
                  <select className="text-xs border border-slate-200 rounded px-2 py-1 outline-none">
                    <option>Last 6 Months</option>
                    <option>This Year</option>
                  </select>
                </div>
                
                {/* Simulated Chart */}
                <div className="h-48 flex items-end justify-between gap-2 px-2 border-b border-slate-100 pb-4 mb-4">
                  {[
                    { month: 'Dec', value: 38000, h: '60%' },
                    { month: 'Jan', value: 40000, h: '65%' },
                    { month: 'Feb', value: 39500, h: '62%' },
                    { month: 'Mar', value: 41000, h: '70%' },
                    { month: 'Apr', value: 41500, h: '75%' },
                    { month: 'May', value: 42500, h: '85%' },
                  ].map(d => (
                    <div key={d.month} className="flex flex-col items-center flex-1 gap-2 group relative">
                      <div className="absolute -top-8 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        ₱{d.value.toLocaleString()}
                      </div>
                      <div 
                        className="w-full max-w-[3rem] bg-indigo-100 group-hover:bg-indigo-500 rounded-t-md transition-colors"
                        style={{ height: d.h }}
                      ></div>
                      <span className="text-xs font-semibold text-slate-500">{d.month}</span>
                    </div>
                  ))}
                </div>

                {/* Table Breakdown */}
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="pb-2 font-semibold">Month</th>
                      <th className="pb-2 font-semibold">Rent Collected</th>
                      <th className="pb-2 font-semibold">Utilities</th>
                      <th className="pb-2 font-semibold text-right">Total Income</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-50">
                      <td className="py-2 font-medium">May 2025</td>
                      <td className="py-2 text-slate-600">₱38,500</td>
                      <td className="py-2 text-slate-600">₱4,000</td>
                      <td className="py-2 font-bold text-right text-slate-800">₱42,500</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-medium">Apr 2025</td>
                      <td className="py-2 text-slate-600">₱38,000</td>
                      <td className="py-2 text-slate-600">₱3,500</td>
                      <td className="py-2 font-bold text-right text-slate-800">₱41,500</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ─── 3. Tenant & Maintenance Summaries ─── */}
              <div className="flex flex-col gap-6">
                {/* Tenant Summary */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Users size={16} className="text-blue-600" /> Tenant Monitoring
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                      <span className="text-xs font-medium text-slate-600">Active Leases</span>
                      <span className="text-sm font-bold text-slate-800">22</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-amber-50 border border-amber-100 rounded-lg">
                      <span className="text-xs font-medium text-amber-700">Pending Move-Out</span>
                      <span className="text-sm font-bold text-amber-700">2</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-red-50 border border-red-100 rounded-lg">
                      <span className="text-xs font-medium text-red-700">Leases Expiring (&lt;30 days)</span>
                      <span className="text-sm font-bold text-red-700">3</span>
                    </div>
                  </div>
                </div>

                {/* Maintenance Summary */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Wrench size={16} className="text-amber-600" /> Maintenance Overview
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                      <span className="text-xs font-medium text-slate-600 flex items-center gap-2"><Clock size={14} className="text-amber-500" /> Pending</span>
                      <span className="text-sm font-bold text-slate-800">2</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                      <span className="text-xs font-medium text-slate-600 flex items-center gap-2"><Wrench size={14} className="text-indigo-500" /> In Progress</span>
                      <span className="text-sm font-bold text-slate-800">1</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-red-50 border border-red-100 rounded-lg">
                      <span className="text-xs font-medium text-red-700 flex items-center gap-2"><AlertTriangle size={14} /> Urgent Issues</span>
                      <span className="text-sm font-bold text-red-700">1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ─── 4. Activity Logs ─── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Activity size={16} className="text-indigo-600" /> Activity Logs
                </h3>
                <div className="space-y-5">
                  <LogItem 
                    icon={<DollarSign size={14} />} color="emerald"
                    title="Payment Received" desc="Pedro Cruz (Unit 2B) paid ₱7,570 for May 2025."
                    time="10 mins ago"
                  />
                  <LogItem 
                    icon={<Wrench size={14} />} color="amber"
                    title="Maintenance Request" desc="New plumbing issue reported in Unit 7B by Maria Santos."
                    time="2 hours ago"
                  />
                  <LogItem 
                    icon={<Users size={14} />} color="blue"
                    title="Tenant Assigned" desc="Rosa Dela Cruz assigned to Unit 2C. Move-in scheduled for tomorrow."
                    time="1 day ago"
                  />
                  <LogItem 
                    icon={<CheckCircle size={14} />} color="indigo"
                    title="Maintenance Resolved" desc="Electrical short in Unit 1C marked as completed."
                    time="2 days ago"
                  />
                </div>
              </div>

              {/* ─── 5. Quick Actions ─── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Key size={16} className="text-slate-500" /> Quick Actions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ActionBtn 
                    icon={<DollarSign size={20} />} title="Record Payment" 
                    desc="Log a new payment" color="emerald" 
                    onClick={() => navigate('/admin-payments')}
                  />
                  <ActionBtn 
                    icon={<Users size={20} />} title="Manage Tenants" 
                    desc="Register or move out" color="blue" 
                    onClick={() => navigate('/admin-tenants')}
                  />
                  <ActionBtn 
                    icon={<Wrench size={20} />} title="New Request" 
                    desc="Log maintenance issue" color="amber" 
                    onClick={() => navigate('/admin-maintenance')}
                  />
                  <ActionBtn 
                    icon={<Building size={20} />} title="Unit Details" 
                    desc="Check availability" color="indigo" 
                    onClick={() => navigate('/admin-units')}
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

/* ─── Sub-Components ─── */

const StatCard = ({ icon, title, value, trend, subtext, color }) => {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-2">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>{icon}</div>
        {trend && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${trend.startsWith('+') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
        {subtext && <p className="text-[10px] text-slate-500 mt-1 font-medium">{subtext}</p>}
      </div>
    </div>
  );
};

const LogItem = ({ icon, color, title, desc, time }) => {
  const colorMap = {
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    blue: 'bg-blue-100 text-blue-600',
    indigo: 'bg-indigo-100 text-indigo-600',
  };

  return (
    <div className="flex gap-4 items-start">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${colorMap[color]}`}>
        {icon}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <span className="text-[10px] text-slate-400">• {time}</span>
        </div>
        <p className="text-xs text-slate-600 leading-snug">{desc}</p>
      </div>
    </div>
  );
};

const ActionBtn = ({ icon, title, desc, color, onClick }) => {
  const hoverMap = {
    emerald: 'hover:border-emerald-300 hover:bg-emerald-50 group-hover:bg-emerald-600',
    blue: 'hover:border-blue-300 hover:bg-blue-50 group-hover:bg-blue-600',
    amber: 'hover:border-amber-300 hover:bg-amber-50 group-hover:bg-amber-500',
    indigo: 'hover:border-indigo-300 hover:bg-indigo-50 group-hover:bg-indigo-600',
  };
  
  return (
    <button 
      onClick={onClick}
      className={`text-left p-4 rounded-xl border border-slate-200 bg-white transition-all group ${hoverMap[color].split(' group-hover')[0]}`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 transition-colors mb-3 ${hoverMap[color].split(' ').pop()} group-hover:text-white`}>
        {icon}
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{desc}</p>
    </button>
  );
};

export default AdminDashboard;