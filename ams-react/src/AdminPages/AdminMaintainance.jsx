import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, faSearch, faTableCells, faList, faClock, faWrench, 
  faCheckCircle, faExclamationTriangle, faTimes, faMapPin, 
  faCalendarAlt, faImage, faArrowRight, faHistory
} from '@fortawesome/free-solid-svg-icons';

const initialRequests = [
  { id: 'REQ-001', title: 'Leaking faucet in bathroom', issueType: 'Plumbing', unit: 'Unit 7B', tenant: 'Pedro Cruz', priority: 'High', status: 'Pending', description: 'The sink faucet is dripping continuously, creating a puddle.', dateReported: '2024-05-15', timeReported: '09:30 AM', dateResolved: null, timeResolved: null, assignee: null, photos: [] },
  { id: 'REQ-002', title: 'Busted ceiling light', issueType: 'Electrical', unit: 'Unit 3A', tenant: 'Ben Flores', priority: 'Medium', status: 'Pending', description: 'Living room light flickered and died.', dateReported: '2024-05-16', timeReported: '14:20 PM', dateResolved: null, timeResolved: null, assignee: null, photos: [] },
  { id: 'REQ-003', title: 'Clogged kitchen drain', issueType: 'Plumbing', unit: 'Unit 2C', tenant: 'Rosa Dela Cruz', priority: 'High', status: 'In Progress', description: 'Water not going down the kitchen sink.', dateReported: '2024-05-14', timeReported: '08:15 AM', dateResolved: null, timeResolved: null, assignee: 'Mang Totoy', photos: [{ url: 'clogged-sink.jpg', name: 'sink_photo.jpg' }] },
  { id: 'REQ-004', title: 'Electrical short in outlet', issueType: 'Electrical', unit: 'Unit 1C', tenant: 'Ana Garcia', priority: 'Urgent', status: 'Completed', description: 'Sparks flew when I plugged in the microwave.', dateReported: '2024-04-20', timeReported: '18:45 PM', dateResolved: '2024-04-21', timeResolved: '10:00 AM', assignee: 'Mang Totoy', photos: [] }
];

const priorityConfig = {
  'Urgent': { color: 'bg-red-100 text-red-800 border-red-200' },
  'High': { color: 'bg-amber-100 text-amber-800 border-amber-200' },
  'Medium': { color: 'bg-blue-100 text-blue-800 border-blue-200' },
  'Low': { color: 'bg-slate-100 text-slate-700 border-slate-200' }
};

const AdminMaintainance = () => {
  const [requests, setRequests] = useState(initialRequests);
  const [viewMode, setViewMode] = useState('kanban');
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);

  const [newReq, setNewReq] = useState({ title: '', issueType: 'Plumbing', unit: '', priority: 'Medium', description: '' });

  const columns = {
    'Pending': requests.filter(r => r.status === 'Pending'),
    'In Progress': requests.filter(r => r.status === 'In Progress'),
    'Completed': requests.filter(r => r.status === 'Completed'),
  };

  const handleCreateRequest = () => {
    if (!newReq.title || !newReq.unit) return;
    const req = {
      id: `REQ-00${requests.length + 1}`, title: newReq.title, issueType: newReq.issueType, unit: newReq.unit, tenant: 'Manual Entry', priority: newReq.priority, status: 'Pending', description: newReq.description,
      dateReported: new Date().toISOString().slice(0, 10), timeReported: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), dateResolved: null, timeResolved: null, assignee: null, photos: []
    };
    setRequests([req, ...requests]);
    setNewReq({ title: '', issueType: 'Plumbing', unit: '', priority: 'Medium', description: '' });
    setShowNewModal(false);
  };

  const advanceStatus = (reqId, currentStatus) => {
    const nextStatus = currentStatus === 'Pending' ? 'In Progress' : 'Completed';
    setRequests(prev => prev.map(r => r.id === reqId ? {
      ...r, status: nextStatus,
      dateResolved: nextStatus === 'Completed' ? new Date().toISOString().slice(0, 10) : null,
      timeResolved: nextStatus === 'Completed' ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
      assignee: nextStatus === 'In Progress' && !r.assignee ? 'Admin Assigned' : r.assignee
    } : r));
    setShowDetailModal(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Maintenance Tasks" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            <div className="flex items-center justify-between">
              <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                <button onClick={() => setViewMode('kanban')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold border-0 cursor-pointer ${viewMode === 'kanban' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 bg-transparent'}`}><FontAwesomeIcon icon={faTableCells} /> Kanban</button>
                <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold border-0 cursor-pointer ${viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 bg-transparent'}`}><FontAwesomeIcon icon={faList} /> List</button>
              </div>
              <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer"><FontAwesomeIcon icon={faPlus} /> New Request</button>
            </div>

            {viewMode === 'kanban' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(columns).map(([status, reqs]) => (
                  <div key={status} className="flex flex-col h-[calc(100vh-16rem)] min-h-[500px] bg-slate-100 rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={status === 'Pending' ? faClock : status === 'In Progress' ? faWrench : faCheckCircle} className={status === 'Pending' ? 'text-amber-500' : status === 'In Progress' ? 'text-indigo-500' : 'text-emerald-500'} />
                        <h3 className="text-sm font-bold text-slate-800 m-0">{status}</h3>
                      </div>
                      <span className="bg-white text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full border border-slate-200">{reqs.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {reqs.map(req => (
                        <div key={req.id} onClick={() => { setSelectedReq(req); setShowDetailModal(true); }} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer">
                          <div className="flex justify-between items-start mb-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityConfig[req.priority].color}`}>{req.priority}</span><span className="text-[10px] text-slate-400 font-mono">{req.id}</span></div>
                          <h4 className="text-sm font-bold text-slate-800 m-0 leading-snug">{req.title}</h4>
                          <div className="text-[11px] text-slate-500 flex flex-col gap-1 mt-3">
                            <span className="flex items-center gap-1.5"><FontAwesomeIcon icon={faMapPin} className="text-[10px]" /> {req.unit} · {req.tenant}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide"><th className="py-3 px-4">ID</th><th className="py-3 px-4">Issue</th><th className="py-3 px-4">Unit</th><th className="py-3 px-4">Priority</th><th className="py-3 px-4">Status</th></tr>
                  </thead>
                  <tbody>
                    {requests.map(req => (
                      <tr key={req.id} onClick={() => { setSelectedReq(req); setShowDetailModal(true); }} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{req.id}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{req.title}</td>
                        <td className="py-3 px-4 text-slate-700">{req.unit}</td>
                        <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityConfig[req.priority].color}`}>{req.priority}</span></td>
                        <td className="py-3 px-4 font-medium text-slate-700">{req.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Detail Inspector Modal Screen Display */}
      {showDetailModal && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-start bg-slate-50">
              <div>
                <div className="flex items-center gap-3 mb-1"><span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">{selectedReq.id}</span><span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-200 text-slate-700">{selectedReq.status}</span></div>
                <h2 className="text-xl font-bold text-slate-800 m-0">{selectedReq.title}</h2>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-1 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-base" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-white">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">{selectedReq.description}</div>
              <div className="space-y-4">
                <div className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs"><FontAwesomeIcon icon={faPlus} /></div><p className="text-sm font-medium text-slate-800 m-0">Reported on {selectedReq.dateReported}</p></div>
                {selectedReq.status !== 'Pending' && <div className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs"><FontAwesomeIcon icon={faWrench} /></div><p className="text-sm font-medium text-slate-800 m-0">In Progress — Assigned to {selectedReq.assignee}</p></div>}
              </div>
            </div>
            {selectedReq.status !== 'Completed' && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button onClick={() => advanceStatus(selectedReq.id, selectedReq.status)} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm border-0 cursor-pointer">Mark as {selectedReq.status === 'Pending' ? 'In Progress' : 'Completed'} <FontAwesomeIcon icon={faArrowRight} /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMaintainance;