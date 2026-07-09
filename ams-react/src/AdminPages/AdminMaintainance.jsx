import React, { useState, useMemo } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, faSearch, faTableCells, faList, faClock, faWrench, 
  faCheckCircle, faExclamationTriangle, faTimes, faMapPin, 
  faCalendarAlt, faImage, faArrowRight, faHistory, faUser, faFilter, faUpload, faPaperPlane
} from '@fortawesome/free-solid-svg-icons';

const initialRequests = [
  { id: 'REQ-001', title: 'Leaking faucet in bathroom', issueType: 'Plumbing', unit: 'Unit E', tenant: 'Pedro Cruz', priority: 'High', status: 'Pending', description: 'The sink faucet is dripping continuously, creating a puddle.', dateReported: '2024-05-15', timeReported: '09:30 AM', dateResolved: null, timeResolved: null, assignee: null, photos: [], cost: null, statusHistory: [{ status: 'Pending', timestamp: '2024-05-15 09:30 AM' }], notes: [] },
  { id: 'REQ-002', title: 'Busted ceiling light', issueType: 'Electrical', unit: 'Unit G', tenant: 'Ben Flores', priority: 'Medium', status: 'Pending', description: 'Living room light flickered and died.', dateReported: '2024-05-16', timeReported: '14:20 PM', dateResolved: null, timeResolved: null, assignee: null, photos: [], cost: null, statusHistory: [{ status: 'Pending', timestamp: '2024-05-16 14:20 PM' }], notes: [] },
  { id: 'REQ-003', title: 'Clogged kitchen drain', issueType: 'Plumbing', unit: 'Unit F', tenant: 'Rosa Dela Cruz', priority: 'High', status: 'In Progress', description: 'Water not going down the kitchen sink.', dateReported: '2024-05-14', timeReported: '08:15 AM', dateResolved: null, timeResolved: null, assignee: 'Mang Totoy', photos: [{ url: 'clogged-sink.jpg', name: 'sink_photo.jpg' }], cost: null, statusHistory: [{ status: 'Pending', timestamp: '2024-05-14 08:15 AM' }, { status: 'In Progress', timestamp: '2024-05-14 10:00 AM', assignee: 'Mang Totoy' }], notes: [{ text: 'Checked the pipes, need to buy a new p-trap.', author: 'Admin', timestamp: '2024-05-14 11:30 AM' }] },
  { id: 'REQ-004', title: 'Electrical short in outlet', issueType: 'Electrical', unit: 'Unit C', tenant: 'Ana Garcia', priority: 'Urgent', status: 'Completed', description: 'Sparks flew when I plugged in the microwave.', dateReported: '2024-04-20', timeReported: '18:45 PM', dateResolved: '2024-04-21', timeResolved: '10:00 AM', assignee: 'Mang Totoy', photos: [], cost: 1200, statusHistory: [{ status: 'Pending', timestamp: '2024-04-20 18:45 PM' }, { status: 'In Progress', timestamp: '2024-04-20 19:30 PM', assignee: 'Mang Totoy' }, { status: 'Completed', timestamp: '2024-04-21 10:00 AM' }], notes: [] }
];

const priorityConfig = {
  'Urgent': { color: 'bg-red-100 text-red-800 border-red-200' },
  'High': { color: 'bg-amber-100 text-amber-800 border-amber-200' },
  'Medium': { color: 'bg-blue-100 text-blue-800 border-blue-200' },
  'Low': { color: 'bg-slate-100 text-slate-700 border-slate-200' }
};

const getRelativeTime = (dateStr) => {
  const diffInDays = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays > 30) return '1mo+ ago';
  return `${diffInDays}d ago`;
};

const AdminMaintainance = () => {
  const [requests, setRequests] = useState(initialRequests);
  const [viewMode, setViewMode] = useState('kanban');
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [reassignName, setReassignName] = useState('');
  const [completionCost, setCompletionCost] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterType, setFilterType] = useState('All');

  const [newReq, setNewReq] = useState({ title: '', issueType: 'Plumbing', unit: '', tenant: '', priority: 'Medium', description: '', photos: [] });
  const [validationErrors, setValidationErrors] = useState({});
  const [newNote, setNewNote] = useState('');

  // Filtering
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.unit.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.tenant.toLowerCase().includes(searchQuery.toLowerCase());
      const matchPriority = filterPriority === 'All' || r.priority === filterPriority;
      const matchType = filterType === 'All' || r.issueType === filterType;
      return matchSearch && matchPriority && matchType;
    });
  }, [requests, searchQuery, filterPriority, filterType]);

  const columns = {
    'Pending': filteredRequests.filter(r => r.status === 'Pending'),
    'In Progress': filteredRequests.filter(r => r.status === 'In Progress'),
    'Completed': filteredRequests.filter(r => r.status === 'Completed'),
  };

  const handleSimulatePhotoUpload = () => {
    setNewReq(prev => ({
      ...prev,
      photos: [...prev.photos, { url: `simulated-photo-${prev.photos.length + 1}.jpg`, name: `photo_${prev.photos.length + 1}.jpg` }]
    }));
  };

  const handleCreateRequest = () => {
    const errors = {};
    if (!newReq.title) errors.title = true;
    if (!newReq.unit) errors.unit = true;
    if (!newReq.tenant) errors.tenant = true;
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    const timestamp = `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const req = {
      id: `REQ-00${requests.length + 1}`, title: newReq.title, issueType: newReq.issueType, unit: newReq.unit, tenant: newReq.tenant, priority: newReq.priority, status: 'Pending', description: newReq.description,
      dateReported: new Date().toISOString().slice(0, 10), timeReported: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), dateResolved: null, timeResolved: null, assignee: null, photos: newReq.photos, cost: null,
      statusHistory: [{ status: 'Pending', timestamp }], notes: []
    };
    setRequests([req, ...requests]);
    setNewReq({ title: '', issueType: 'Plumbing', unit: '', tenant: '', priority: 'Medium', description: '', photos: [] });
    setValidationErrors({});
    setShowNewModal(false);
  };

  const triggerStatusAdvance = (req) => {
    setSelectedReq(req);
    setReassignName(req.assignee || '');
    setCompletionCost('');
    setShowConfirmModal(true);
  };

  const handleConfirmAdvance = () => {
    const currentStatus = selectedReq.status;
    const nextStatus = currentStatus === 'Pending' ? 'In Progress' : 'Completed';
    const timestampStr = `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const finalAssignee = nextStatus === 'In Progress' ? (reassignName || 'Admin Assigned') : selectedReq.assignee;
    const finalCost = nextStatus === 'Completed' ? Number(completionCost) || 0 : selectedReq.cost;

    setRequests(prev => prev.map(r => r.id === selectedReq.id ? {
      ...r, status: nextStatus,
      dateResolved: nextStatus === 'Completed' ? new Date().toISOString().slice(0, 10) : null,
      timeResolved: nextStatus === 'Completed' ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
      assignee: finalAssignee,
      cost: finalCost,
      statusHistory: [...r.statusHistory, { status: nextStatus, timestamp: timestampStr, assignee: nextStatus === 'In Progress' ? finalAssignee : undefined }]
    } : r));
    
    if (showDetailModal) {
      setSelectedReq(prev => ({
        ...prev, status: nextStatus, assignee: finalAssignee, cost: finalCost,
        statusHistory: [...prev.statusHistory, { status: nextStatus, timestamp: timestampStr, assignee: nextStatus === 'In Progress' ? finalAssignee : undefined }]
      }));
    }
    
    setShowConfirmModal(false);
    setCompletionCost('');
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    const timestampStr = `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const note = { text: newNote, author: 'Admin', timestamp: timestampStr };
    setRequests(prev => prev.map(r => r.id === selectedReq.id ? { ...r, notes: [...r.notes, note] } : r));
    setSelectedReq(prev => ({ ...prev, notes: [...prev.notes, note] }));
    setNewNote('');
  };

  const handleReassignInDetail = (e) => {
    const newAssignee = e.target.value;
    setRequests(prev => prev.map(r => r.id === selectedReq.id ? { ...r, assignee: newAssignee } : r));
    setSelectedReq(prev => ({ ...prev, assignee: newAssignee }));
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Maintenance Tasks" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex bg-white rounded-lg border border-slate-200 p-1 shrink-0">
                <button onClick={() => setViewMode('kanban')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold border-0 cursor-pointer ${viewMode === 'kanban' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 bg-transparent hover:bg-slate-50'}`}><FontAwesomeIcon icon={faTableCells} /> Kanban</button>
                <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold border-0 cursor-pointer ${viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 bg-transparent hover:bg-slate-50'}`}><FontAwesomeIcon icon={faList} /> List</button>
              </div>

              <div className="flex items-center gap-3 flex-1 justify-end">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-all shadow-sm max-w-xs w-full">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                  <input type="text" placeholder="Search title, unit, tenant..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm outline-none border-0 p-0 text-slate-800 bg-white" />
                </div>
                
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-2 shadow-sm">
                  <FontAwesomeIcon icon={faFilter} className="text-slate-400 text-xs ml-2" />
                  <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-transparent text-sm outline-none border-0 text-slate-700 cursor-pointer">
                    <option value="All">All Priorities</option><option value="Urgent">Urgent</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
                  </select>
                  <div className="w-px h-4 bg-slate-200 mx-1"></div>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-transparent text-sm outline-none border-0 text-slate-700 cursor-pointer">
                    <option value="All">All Types</option><option value="Plumbing">Plumbing</option><option value="Electrical">Electrical</option><option value="Carpentry">Carpentry</option><option value="Appliance">Appliance</option>
                  </select>
                </div>
                
                <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faPlus} /> New Request</button>
              </div>
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
                        <div key={req.id} onClick={() => { setSelectedReq(req); setShowDetailModal(true); }} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex gap-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityConfig[req.priority].color}`}>{req.priority}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-200 bg-slate-50 text-slate-600">{req.issueType}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono group-hover:text-indigo-500 transition-colors">{req.id}</span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 m-0 leading-snug mb-3">{req.title}</h4>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span className="flex items-center gap-1.5"><FontAwesomeIcon icon={faUser} className="text-[10px]" /> {req.tenant} · {req.unit}</span>
                              <span className="flex items-center gap-1"><FontAwesomeIcon icon={faClock} className="text-[10px]" /> {getRelativeTime(req.dateReported)}</span>
                            </div>
                            <div className="flex justify-between items-center mt-1 border-t border-slate-100 pt-2">
                              {req.assignee ? (
                                <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">🧑‍🔧 {req.assignee}</span>
                              ) : (
                                <span className="text-[10px] font-medium text-slate-400 italic">Unassigned</span>
                              )}
                              {req.photos.length > 0 && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1"><FontAwesomeIcon icon={faImage} /> {req.photos.length}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Issue</th>
                      <th className="py-3 px-4">Tenant / Unit</th>
                      <th className="py-3 px-4">Priority / Type</th>
                      <th className="py-3 px-4">Assignee</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map(req => (
                      <tr key={req.id} onClick={() => { setSelectedReq(req); setShowDetailModal(true); }} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{req.id}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{req.title}</td>
                        <td className="py-3 px-4 text-slate-700">{req.tenant} <span className="text-slate-400 text-xs ml-1">({req.unit})</span></td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityConfig[req.priority].color}`}>{req.priority}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-200 bg-white text-slate-600">{req.issueType}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-600">{req.assignee || '-'}</td>
                        <td className="py-3 px-4"><span className={`text-xs font-semibold ${req.status === 'Completed' ? 'text-emerald-600' : req.status === 'In Progress' ? 'text-indigo-600' : 'text-amber-600'}`}>{req.status}</span></td>
                      </tr>
                    ))}
                    {filteredRequests.length === 0 && (
                      <tr><td colSpan="6" className="py-8 text-center text-slate-500 text-sm">No maintenance requests found matching criteria.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* New Request Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 m-0">Create New Request</h2>
              <button onClick={() => setShowNewModal(false)} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Title *</label>
                <input type="text" value={newReq.title} onChange={e => setNewReq({...newReq, title: e.target.value})} className={`w-full px-3 py-2 text-sm border ${validationErrors.title ? 'border-red-500' : 'border-slate-200'} rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500`} placeholder="Brief description of the issue" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Tenant Name *</label>
                  <input type="text" value={newReq.tenant} onChange={e => setNewReq({...newReq, tenant: e.target.value})} className={`w-full px-3 py-2 text-sm border ${validationErrors.tenant ? 'border-red-500' : 'border-slate-200'} rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500`} placeholder="Juan Dela Cruz" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Unit *</label>
                  <input type="text" value={newReq.unit} onChange={e => setNewReq({...newReq, unit: e.target.value})} className={`w-full px-3 py-2 text-sm border ${validationErrors.unit ? 'border-red-500' : 'border-slate-200'} rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500`} placeholder="e.g. A" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Issue Type</label>
                  <select value={newReq.issueType} onChange={e => setNewReq({...newReq, issueType: e.target.value})} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500">
                    <option value="Plumbing">Plumbing</option><option value="Electrical">Electrical</option><option value="Carpentry">Carpentry</option><option value="Appliance">Appliance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Priority</label>
                  <select value={newReq.priority} onChange={e => setNewReq({...newReq, priority: e.target.value})} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500">
                    <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Details</label>
                <textarea rows={3} value={newReq.description} onChange={e => setNewReq({...newReq, description: e.target.value})} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-500 resize-none" placeholder="Provide more details about the problem..."></textarea>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Photos</label>
                <div onClick={handleSimulatePhotoUpload} className="w-full border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-colors">
                  <FontAwesomeIcon icon={faUpload} className="text-slate-400 mb-2 text-lg" />
                  <p className="text-xs text-slate-600 m-0">Click to attach photos (simulated)</p>
                </div>
                {newReq.photos.length > 0 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                    {newReq.photos.map((p, idx) => (
                      <div key={idx} className="w-12 h-12 rounded bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                        <FontAwesomeIcon icon={faImage} className="text-indigo-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button onClick={() => setShowNewModal(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100 cursor-pointer transition-colors">Cancel</button>
              <button onClick={handleCreateRequest} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors">Create Request</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedReq && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden flex flex-col md:flex-row max-h-[90vh]" onClick={e => e.stopPropagation()}>
            
            {/* Left side: Detail & Timeline */}
            <div className="flex-1 flex flex-col border-r border-slate-200 max-h-[90vh]">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-start bg-slate-50 shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">{selectedReq.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityConfig[selectedReq.priority].color}`}>{selectedReq.priority}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${selectedReq.status === 'Completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : selectedReq.status === 'In Progress' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>{selectedReq.status}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 m-0 leading-tight">{selectedReq.title}</h2>
                  <p className="text-sm text-slate-500 m-0 mt-1 flex items-center gap-2"><FontAwesomeIcon icon={faMapPin} /> {selectedReq.tenant} · {selectedReq.unit}</p>
                  {selectedReq.cost !== null && selectedReq.status === 'Completed' && (
                    <p className="text-sm font-bold text-emerald-600 m-0 mt-2 flex items-center gap-2">Final Cost: ₱{selectedReq.cost.toLocaleString()}</p>
                  )}
                </div>
                <button onClick={() => setShowDetailModal(false)} className="p-1 md:hidden text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div>
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 m-0">Description</h4>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm text-slate-700 leading-relaxed">{selectedReq.description}</div>
                </div>
                
                {selectedReq.photos.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 m-0">Attached Photos</h4>
                    <div className="flex gap-3">
                      {selectedReq.photos.map((p, idx) => (
                        <div key={idx} className="w-20 h-20 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors" title={p.name}>
                          <FontAwesomeIcon icon={faImage} className="text-slate-400 text-2xl" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3 m-0">Status Timeline</h4>
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-3 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                    {selectedReq.statusHistory.map((sh, i) => (
                      <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-slate-200 text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                          <FontAwesomeIcon icon={sh.status === 'Completed' ? faCheckCircle : sh.status === 'In Progress' ? faWrench : faClock} className={`text-[10px] ${sh.status === 'Completed' ? 'text-emerald-500' : sh.status === 'In Progress' ? 'text-indigo-500' : 'text-amber-500'}`} />
                        </div>
                        <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-slate-100 bg-white shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-bold text-slate-800 text-xs m-0">{sh.status}</h5>
                            <time className="font-mono text-[10px] text-slate-400">{sh.timestamp}</time>
                          </div>
                          {sh.assignee && <p className="text-[10px] text-slate-500 m-0 mt-1">Assigned to: <span className="font-semibold text-indigo-600">{sh.assignee}</span></p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {selectedReq.status !== 'Completed' && (
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                  <button onClick={() => triggerStatusAdvance(selectedReq)} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm border-0 cursor-pointer transition-colors">
                    Mark as {selectedReq.status === 'Pending' ? 'In Progress' : 'Completed'} <FontAwesomeIcon icon={faArrowRight} />
                  </button>
                </div>
              )}
            </div>

            {/* Right side: Notes & Admin Controls */}
            <div className="w-full md:w-80 flex flex-col bg-slate-50 shrink-0">
              <div className="px-6 py-4 border-b border-slate-200 hidden md:flex justify-end bg-slate-50">
                <button onClick={() => setShowDetailModal(false)} className="p-1 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-xl" /></button>
              </div>
              
              <div className="p-6 flex-1 flex flex-col overflow-hidden">
                {selectedReq.status !== 'Completed' && (
                  <div className="mb-6 shrink-0">
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Assigned Personnel</label>
                    <input type="text" value={selectedReq.assignee || ''} onChange={handleReassignInDetail} placeholder="Assign someone..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500" />
                  </div>
                )}
                
                <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3 m-0 shrink-0">Admin Notes</h4>
                <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-1">
                  {selectedReq.notes.map((note, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-700 m-0 leading-relaxed mb-2">{note.text}</p>
                      <div className="flex justify-between items-center text-[9px] text-slate-400 font-medium">
                        <span>{note.author}</span>
                        <span>{note.timestamp}</span>
                      </div>
                    </div>
                  ))}
                  {selectedReq.notes.length === 0 && (
                    <div className="text-center py-4 text-slate-400 text-xs italic">No notes added yet.</div>
                  )}
                </div>
                
                <div className="shrink-0 relative">
                  <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={2} className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500 resize-none shadow-sm" placeholder="Add a note..."></textarea>
                  <button onClick={handleAddNote} disabled={!newNote.trim()} className="absolute right-2 bottom-3 w-7 h-7 rounded bg-indigo-50 flex items-center justify-center text-indigo-600 border-0 cursor-pointer disabled:opacity-50 hover:bg-indigo-100 transition-colors"><FontAwesomeIcon icon={faPaperPlane} className="text-xs" /></button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Confirmation Modal for Status Advance */}
      {showConfirmModal && selectedReq && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-2 mt-0">Confirm Status Update</h3>
            <p className="text-sm text-slate-600 mb-4">
              You are about to change the status of <strong>{selectedReq.id}</strong> to <strong className={selectedReq.status === 'Pending' ? 'text-indigo-600' : 'text-emerald-600'}>{selectedReq.status === 'Pending' ? 'In Progress' : 'Completed'}</strong>.
            </p>
            
            {selectedReq.status === 'Pending' && (
              <div className="mb-6">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Assign To</label>
                <input type="text" value={reassignName} onChange={e => setReassignName(e.target.value)} placeholder="Personnel Name" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-500" />
              </div>
            )}
            
            {selectedReq.status === 'In Progress' && (
              <div className="mb-6">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Final Cost (₱)</label>
                <input type="number" value={completionCost} onChange={e => setCompletionCost(e.target.value)} placeholder="e.g. 1500" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-500" />
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button onClick={handleConfirmAdvance} className="flex-1 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors">Confirm</button>
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminMaintainance;