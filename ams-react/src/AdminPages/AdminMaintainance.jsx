import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { 
  Plus, Search, LayoutGrid, List, Clock, Wrench, 
  CheckCircle, AlertTriangle, X, MapPin, Calendar, 
  Image as ImageIcon, ArrowRight 
} from 'lucide-react';

/* ───────────────────────────────────────────
   SEED DATA
   ─────────────────────────────────────────── */
const initialRequests = [
  {
    id: 'REQ-001', title: 'Leaking faucet in bathroom', issueType: 'Plumbing', unit: 'Unit 7B',
    tenant: 'Pedro Cruz', priority: 'High', status: 'Pending',
    description: 'The sink faucet is dripping continuously, creating a puddle.',
    dateReported: '2024-05-15', timeReported: '09:30 AM',
    dateResolved: null, timeResolved: null, assignee: null,
    photos: []
  },
  {
    id: 'REQ-002', title: 'Busted ceiling light', issueType: 'Electrical', unit: 'Unit 3A',
    tenant: 'Ben Flores', priority: 'Medium', status: 'Pending',
    description: 'Living room light flickered and died. Need bulb replacement or wiring check.',
    dateReported: '2024-05-16', timeReported: '14:20 PM',
    dateResolved: null, timeResolved: null, assignee: null,
    photos: []
  },
  {
    id: 'REQ-003', title: 'Clogged kitchen drain', issueType: 'Plumbing', unit: 'Unit 2C',
    tenant: 'Rosa Dela Cruz', priority: 'High', status: 'In Progress',
    description: 'Water not going down the kitchen sink. Tried plunging but no luck.',
    dateReported: '2024-05-14', timeReported: '08:15 AM',
    dateResolved: null, timeResolved: null, assignee: 'Mang Totoy (Maintenance)',
    photos: [{ url: 'clogged-sink.jpg', name: 'sink_photo.jpg' }]
  },
  {
    id: 'REQ-004', title: 'Electrical short in outlet', issueType: 'Electrical', unit: 'Unit 1C',
    tenant: 'Ana Garcia', priority: 'Urgent', status: 'Completed',
    description: 'Sparks flew when I plugged in the microwave. Smells like burnt plastic.',
    dateReported: '2024-04-20', timeReported: '18:45 PM',
    dateResolved: '2024-04-21', timeResolved: '10:00 AM', assignee: 'Mang Totoy (Maintenance)',
    photos: []
  },
  {
    id: 'REQ-005', title: 'No water supply', issueType: 'Water Supply', unit: 'Unit 5A',
    tenant: 'Carlos Mendoza', priority: 'Urgent', status: 'Completed',
    description: 'Zero water pressure in the whole unit since morning.',
    dateReported: '2024-04-18', timeReported: '07:00 AM',
    dateResolved: '2024-04-18', timeResolved: '11:30 AM', assignee: 'Building Admin',
    photos: []
  }
];

const priorityConfig = {
  'Urgent': { color: 'bg-red-100 text-red-800 border-red-200' },
  'High': { color: 'bg-amber-100 text-amber-800 border-amber-200' },
  'Medium': { color: 'bg-blue-100 text-blue-800 border-blue-200' },
  'Low': { color: 'bg-slate-100 text-slate-700 border-slate-200' }
};

const AdminMaintainance = () => {
  const [requests, setRequests] = useState(initialRequests);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'list'
  
  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);

  // New Request Form
  const [newReq, setNewReq] = useState({
    title: '', issueType: 'Plumbing', unit: '', priority: 'Medium', description: ''
  });

  /* ── Group for Kanban ── */
  const columns = {
    'Pending': requests.filter(r => r.status === 'Pending'),
    'In Progress': requests.filter(r => r.status === 'In Progress'),
    'Completed': requests.filter(r => r.status === 'Completed'),
  };

  /* ── Handlers ── */
  const handleCreateRequest = () => {
    if (!newReq.title || !newReq.unit) return;
    
    const req = {
      id: `REQ-00${requests.length + 1}`,
      title: newReq.title,
      issueType: newReq.issueType,
      unit: newReq.unit,
      tenant: 'Manual Entry',
      priority: newReq.priority,
      status: 'Pending',
      description: newReq.description,
      dateReported: new Date().toISOString().slice(0, 10),
      timeReported: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateResolved: null,
      timeResolved: null,
      assignee: null,
      photos: [] // Simulation for now
    };

    setRequests([req, ...requests]);
    setNewReq({ title: '', issueType: 'Plumbing', unit: '', priority: 'Medium', description: '' });
    setShowNewModal(false);
  };

  const advanceStatus = (reqId, currentStatus) => {
    const nextStatus = currentStatus === 'Pending' ? 'In Progress' : 'Completed';
    setRequests(prev => prev.map(r => {
      if (r.id === reqId) {
        return {
          ...r, 
          status: nextStatus,
          dateResolved: nextStatus === 'Completed' ? new Date().toISOString().slice(0, 10) : null,
          timeResolved: nextStatus === 'Completed' ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
          assignee: nextStatus === 'In Progress' && !r.assignee ? 'Admin Assigned' : r.assignee
        };
      }
      return r;
    }));
    if (selectedReq?.id === reqId) {
      setSelectedReq(prev => ({
        ...prev, 
        status: nextStatus,
        dateResolved: nextStatus === 'Completed' ? new Date().toISOString().slice(0, 10) : null,
        timeResolved: nextStatus === 'Completed' ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
      }));
    }
  };

  const openDetail = (req) => {
    setSelectedReq(req);
    setShowDetailModal(true);
  };

  /* ════════════════════════════════════════
     RENDER
     ════════════════════════════════════════ */
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header title="Maintenance & Repairs" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* ─── Header Controls ─── */}
            <div className="flex items-center justify-between">
              <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                <button 
                  onClick={() => setViewMode('kanban')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${viewMode === 'kanban' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <LayoutGrid size={16} /> Kanban
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <List size={16} /> List View
                </button>
              </div>

              <button 
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus size={16} /> New Request
              </button>
            </div>

            {/* ─── Board / List View ─── */}
            {viewMode === 'kanban' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Columns */}
                {Object.entries(columns).map(([status, reqs]) => (
                  <div key={status} className="flex flex-col h-[calc(100vh-16rem)] min-h-[500px] bg-slate-100 rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        {status === 'Pending' && <Clock size={16} className="text-amber-500" />}
                        {status === 'In Progress' && <Wrench size={16} className="text-indigo-500" />}
                        {status === 'Completed' && <CheckCircle size={16} className="text-emerald-500" />}
                        <h3 className="text-sm font-bold text-slate-800">{status}</h3>
                      </div>
                      <span className="bg-white text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full border border-slate-200">{reqs.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {reqs.map(req => (
                        <div 
                          key={req.id} 
                          onClick={() => openDetail(req)}
                          className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityConfig[req.priority].color}`}>
                              {req.priority}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{req.id}</span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 mb-1 leading-snug group-hover:text-indigo-700 transition-colors">{req.title}</h4>
                          <div className="text-[11px] text-slate-500 flex flex-col gap-1 mt-3">
                            <span className="flex items-center gap-1.5"><MapPin size={12} /> {req.unit} · {req.tenant}</span>
                            <span className="flex items-center gap-1.5"><Calendar size={12} /> {req.dateReported}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Issue</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Reported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(req => (
                      <tr key={req.id} onClick={() => openDetail(req)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{req.id}</td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-800">{req.title}</p>
                          <p className="text-[11px] text-slate-500">{req.issueType}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{req.unit}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityConfig[req.priority].color}`}>
                            {req.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">{req.status}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{req.dateReported}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ════════════════════════════════════
          MODAL — Request Detail
         ════════════════════════════════════ */}
      {showDetailModal && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-start bg-slate-50">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">{selectedReq.id}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityConfig[selectedReq.priority].color}`}>{selectedReq.priority} Priority</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-200 text-slate-700">{selectedReq.status}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-800">{selectedReq.title}</h2>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Location & Tenant</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedReq.unit}</p>
                  <p className="text-xs text-slate-500">{selectedReq.tenant}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Issue Category</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedReq.issueType}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-800 mb-2">Description</p>
                <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {selectedReq.description}
                </div>
              </div>

              {selectedReq.photos?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1"><ImageIcon size={14} /> Attached Photos</p>
                  <div className="flex gap-2">
                    {selectedReq.photos.map((photo, i) => (
                      <div key={i} className="w-24 h-24 bg-slate-200 rounded-lg border border-slate-300 flex items-center justify-center overflow-hidden">
                        <span className="text-[10px] text-slate-500 font-mono text-center p-2 break-all">{photo.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-6">
                <p className="text-xs font-bold text-slate-800 mb-4">Resolution Timeline</p>
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                  
                  {/* Reported */}
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-indigo-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10"><Plus size={14} /></div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded border border-slate-200 shadow-sm">
                      <div className="flex justify-between mb-1"><div className="font-bold text-slate-800 text-xs">Request Created</div></div>
                      <div className="text-slate-500 text-[11px]">{selectedReq.dateReported} at {selectedReq.timeReported}</div>
                    </div>
                  </div>

                  {/* In Progress */}
                  {selectedReq.status !== 'Pending' && (
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-amber-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10"><Wrench size={14} /></div>
                      <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded border border-slate-200 shadow-sm">
                        <div className="flex justify-between mb-1"><div className="font-bold text-slate-800 text-xs">Work Started</div></div>
                        <div className="text-slate-500 text-[11px]">Assigned to: {selectedReq.assignee}</div>
                      </div>
                    </div>
                  )}

                  {/* Completed */}
                  {selectedReq.status === 'Completed' && (
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-emerald-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10"><CheckCircle size={14} /></div>
                      <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded border border-slate-200 shadow-sm">
                        <div className="flex justify-between mb-1"><div className="font-bold text-slate-800 text-xs">Resolved</div></div>
                        <div className="text-slate-500 text-[11px]">{selectedReq.dateResolved} at {selectedReq.timeResolved}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedReq.status !== 'Completed' && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button 
                  onClick={() => advanceStatus(selectedReq.id, selectedReq.status)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm"
                >
                  Mark as {selectedReq.status === 'Pending' ? 'In Progress' : 'Completed'} <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          MODAL — New Request Form
         ════════════════════════════════════ */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Create Maintenance Request</h2>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded"><X size={20} /></button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Issue Title</label>
                <input 
                  type="text" 
                  value={newReq.title}
                  onChange={e => setNewReq({...newReq, title: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" 
                  placeholder="e.g. Leaking pipe under sink" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Issue Type</label>
                  <select 
                    value={newReq.issueType}
                    onChange={e => setNewReq({...newReq, issueType: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white"
                  >
                    <option>Plumbing</option>
                    <option>Electrical</option>
                    <option>Water Supply</option>
                    <option>Structural/Physical</option>
                    <option>General</option>
                    <option>Others</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select 
                    value={newReq.priority}
                    onChange={e => setNewReq({...newReq, priority: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Location / Unit</label>
                <input 
                  type="text" 
                  value={newReq.unit}
                  onChange={e => setNewReq({...newReq, unit: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" 
                  placeholder="e.g. Unit 3A" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea 
                  rows={4}
                  value={newReq.description}
                  onChange={e => setNewReq({...newReq, description: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 resize-none" 
                  placeholder="Describe the issue in detail..." 
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Upload Photo (Optional)</label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:bg-slate-50 transition-colors">
                  <ImageIcon size={24} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500">Click to upload or drag and drop</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-slate-700 text-sm font-semibold rounded hover:bg-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateRequest}
                disabled={!newReq.title || !newReq.unit}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                Create Request
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminMaintainance;
