import React from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { Plus } from 'lucide-react';

const kanbanData = {
  pending: [
    { title: 'Leaking faucet — bathroom', unit: 'Unit 7B · Pedro Cruz', priority: 'high' },
    { title: 'Busted ceiling light', unit: 'Unit 3A · Ben Flores', priority: 'medium' },
    { title: 'Broken window latch', unit: 'Unit 5B · Nilo Ocampo', priority: 'low' },
  ],
  inProgress: [
    { title: 'Clogged drain in kitchen', unit: 'Unit 2C · Rosa Dela Cruz', priority: 'medium', assignee: 'Mang Totoy' },
  ],
  resolved: [
    { title: 'Electrical short — outlet', unit: 'Unit 1C · Ana Garcia', resolvedDate: 'Resolved Apr 22' },
    { title: 'Roof leak patched', unit: 'Common area', resolvedDate: 'Resolved Apr 19' },
  ],
};

const getPriorityBadge = (priority) => {
  const styles = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-emerald-100 text-emerald-800',
  };
  const labels = {
    high: 'High priority',
    medium: 'Medium',
    low: 'Low',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold mt-2 ${styles[priority]}`}>
      {labels[priority]}
    </span>
  );
};

const AdminMaintainance = () => {
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header title="Maintenance Requests" />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Top Action */}
            <div className="flex items-center justify-end">
              <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
                <Plus size={16} />
                New request
              </button>
            </div>

            {/* Kanban Board */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

              {/* Pending Column */}
              <div className="bg-slate-100 rounded-xl p-4 min-h-[400px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-800">Pending</h3>
                  <span className="bg-white border border-slate-200 rounded-full px-3 py-0.5 text-[11px] text-slate-500 font-semibold">
                    {kanbanData.pending.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {kanbanData.pending.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-slate-200 rounded-lg p-3 cursor-pointer transition-all hover:border-indigo-500 hover:shadow-md hover:-translate-y-0.5 shadow-sm"
                    >
                      <div className="text-xs font-semibold text-slate-800 mb-1">{item.title}</div>
                      <div className="text-[11px] text-slate-500">{item.unit}</div>
                      {getPriorityBadge(item.priority)}
                    </div>
                  ))}
                </div>
              </div>

              {/* In Progress Column */}
              <div className="bg-slate-100 rounded-xl p-4 min-h-[400px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-800">In Progress</h3>
                  <span className="bg-white border border-slate-200 rounded-full px-3 py-0.5 text-[11px] text-slate-500 font-semibold">
                    {kanbanData.inProgress.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {kanbanData.inProgress.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white border-l-2 border-l-amber-400 border border-slate-200 rounded-lg p-3 cursor-pointer transition-all hover:border-indigo-500 hover:shadow-md hover:-translate-y-0.5 shadow-sm"
                    >
                      <div className="text-xs font-semibold text-slate-800 mb-1">{item.title}</div>
                      <div className="text-[11px] text-slate-500">{item.unit}</div>
                      {item.assignee && (
                        <div className="text-[9px] text-slate-400 mt-1">Assigned: {item.assignee}</div>
                      )}
                      {getPriorityBadge(item.priority)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Resolved Column */}
              <div className="bg-slate-100 rounded-xl p-4 min-h-[400px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-800">Resolved</h3>
                  <span className="bg-white border border-slate-200 rounded-full px-3 py-0.5 text-[11px] text-slate-500 font-semibold">
                    {kanbanData.resolved.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {kanbanData.resolved.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-slate-200 rounded-lg p-3 opacity-60 cursor-pointer transition-all hover:opacity-100 hover:border-indigo-500 hover:shadow-md shadow-sm"
                    >
                      <div className="text-xs font-semibold text-slate-800 mb-1">{item.title}</div>
                      <div className="text-[11px] text-slate-500">{item.unit}</div>
                      <div className="text-[9px] text-emerald-500 font-medium mt-2">✓ {item.resolvedDate}</div>
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

export default AdminMaintainance;
