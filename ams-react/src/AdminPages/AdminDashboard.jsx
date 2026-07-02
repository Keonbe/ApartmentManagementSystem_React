import React from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDollarSign, faUsers, faBuilding, faExclamationTriangle, 
  faCheckCircle, faClock, faChartLine, faChartPie, faWrench, faKey
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Admin Dashboard" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* Statistics Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard icon={faDollarSign} title="Total Revenue" value="₱42,500" trend="+12%" color="emerald" />
              <StatCard icon={faExclamationTriangle} title="Pending Dues" value="₱15,000" trend="-5%" color="red" />
              <StatCard icon={faUsers} title="Total Tenants" value="24" trend="+2" color="indigo" />
              <StatCard icon={faChartPie} title="Occupancy" value="85%" subtext="24 / 28 Units" color="blue" />
              <StatCard icon={faWrench} title="Maintenance" value="3" subtext="Open Requests" color="amber" />
              <StatCard icon={faKey} title="Vacant" value="4" subtext="Units Available" color="slate" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Income Report Chart block */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faChartLine} className="text-indigo-600" /> Income Report
                  </h3>
                </div>
                
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
                      <div className="absolute -top-8 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        ₱{d.value.toLocaleString()}
                      </div>
                      <div className="w-full max-w-[3rem] bg-indigo-100 group-hover:bg-indigo-500 rounded-t-md transition-colors" style={{ height: d.h }}></div>
                      <span className="text-xs font-semibold text-slate-500">{d.month}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Summaries */}
              <div className="flex flex-col gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faUsers} className="text-blue-600" /> Tenant Monitoring
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                      <span className="text-xs font-medium text-slate-600">Active Leases</span>
                      <span className="text-sm font-bold text-slate-800">22</span>
                    </div>
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
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <FontAwesomeIcon icon={icon} />
        </div>
        {trend && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{trend}</span>}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">{title}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5 m-0">{value}</p>
      </div>
    </div>
  );
};

export default AdminDashboard;