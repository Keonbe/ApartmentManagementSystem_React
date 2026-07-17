import React, { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faTimes, faUser, faBuilding, faCalendarAlt, faPhone, faEnvelope, 
  faCheckCircle, faClock, faUsers, faVenusMars,
  faFileAlt
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

const AdminApplications = () => {
  const [applications, setApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get('/get_applications.php');
      if (res.data.success) {
        setApplications(res.data.data);
      } else {
        setErrorMsg("API returned success=false");
      }
    } catch (err) {
      console.error("Error fetching applications:", err);
      setErrorMsg(err.message || "Failed to fetch applications");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.post('/update_tenant_status.php', { id, status });
      fetchApplications();
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const openProfile = (app) => {
    setSelectedApp(app);
    setShowProfileModal(true);
  };

  const filteredApps = applications.filter(t => 
    (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.unit || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingApps = filteredApps.filter(a => a.status === 'Pending Review');
  const approvedApps = filteredApps.filter(a => a.status === 'Approved' || a.status === 'active'); // Match database status
  const rejectedApps = filteredApps.filter(a => a.status === 'Rejected');

  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  const ApplicationCard = ({ app, isPending }) => (
    <div 
      onClick={() => openProfile(app)}
      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-inner ${isPending ? 'bg-indigo-500' : app.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`}>
            {getInitials(app.name)}
          </div>
          <div>
            <h4 className="m-0 text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{app.name}</h4>
            <p className="m-0 text-[11px] text-slate-400">{new Date(app.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200">
          Unit {app.unit}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500">
          <FontAwesomeIcon icon={faUsers} className="text-[10px]" /> {app.occupants} Occupant(s)
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <FontAwesomeIcon icon={faCalendarAlt} className="text-[10px]" /> {app.months_of_rent} Months
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Rent Applications Tracker" />
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header Area */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-slate-800 m-0">Application Pipeline</h2>
                <p className="text-sm text-slate-500 m-0 mt-1">Manage and track incoming rent applications</p>
              </div>
              <div className="flex items-center gap-3 w-full max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search applicants..." className="flex-1 bg-transparent text-sm text-slate-700 outline-none p-0 border-0 placeholder-slate-400" />
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                <strong>Error loading applications:</strong> {errorMsg}
              </div>
            )}
            
            {loading && (
              <div className="text-center py-12 text-slate-500 text-sm bg-white border border-slate-200 rounded-xl shadow-sm">
                <FontAwesomeIcon icon={faClock} className="animate-spin text-slate-300 text-3xl mb-3 block mx-auto" />
                Loading applications pipeline...
              </div>
            )}

            {/* Kanban Board */}
            {!loading && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* Pending Column */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b-2 border-indigo-500 pb-2">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2 m-0 text-sm uppercase tracking-wide">
                    <FontAwesomeIcon icon={faClock} className="text-indigo-500" /> Pending Review
                  </h3>
                  <span className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full text-xs">{pendingApps.length}</span>
                </div>
                <div className="space-y-3">
                  {pendingApps.length === 0 ? (
                    <div className="text-center p-6 border border-dashed border-slate-300 rounded-xl text-slate-400 text-sm">No pending applications</div>
                  ) : (
                    pendingApps.map(app => <ApplicationCard key={app.id} app={app} isPending={true} />)
                  )}
                </div>
              </div>

              {/* Approved Column */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b-2 border-emerald-500 pb-2">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2 m-0 text-sm uppercase tracking-wide">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-500" /> Approved (Active)
                  </h3>
                  <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-xs">{approvedApps.length}</span>
                </div>
                <div className="space-y-3 opacity-70 hover:opacity-100 transition-opacity">
                  {approvedApps.length === 0 ? (
                    <div className="text-center p-6 border border-dashed border-slate-300 rounded-xl text-slate-400 text-sm">No approved applications</div>
                  ) : (
                    approvedApps.map(app => <ApplicationCard key={app.id} app={app} isPending={false} />)
                  )}
                </div>
              </div>

              {/* Rejected Column */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b-2 border-red-500 pb-2">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2 m-0 text-sm uppercase tracking-wide">
                    <FontAwesomeIcon icon={faTimes} className="text-red-500" /> Rejected
                  </h3>
                  <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full text-xs">{rejectedApps.length}</span>
                </div>
                <div className="space-y-3 opacity-70 hover:opacity-100 transition-opacity">
                  {rejectedApps.length === 0 ? (
                    <div className="text-center p-6 border border-dashed border-slate-300 rounded-xl text-slate-400 text-sm">No rejected applications</div>
                  ) : (
                    rejectedApps.map(app => <ApplicationCard key={app.id} app={app} isPending={false} />)
                  )}
                </div>
              </div>

            </div>
            )}
          </div>
        </div>
      </main>

      {/* ─── APPLICANT REVIEW MODAL ─── */}
      {showProfileModal && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowProfileModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className={`px-8 py-6 flex items-center justify-between shrink-0 text-white ${
              selectedApp.status === 'Pending Review' ? 'bg-gradient-to-r from-indigo-600 to-indigo-800' : 
              selectedApp.status === 'active' ? 'bg-gradient-to-r from-emerald-600 to-emerald-800' : 'bg-gradient-to-r from-red-600 to-red-800'
            }`}>
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold bg-white/20 backdrop-blur shadow-sm">
                  {getInitials(selectedApp.name)}
                </div>
                <div>
                  <h3 className="text-2xl font-bold m-0 tracking-tight">{selectedApp.name}</h3>
                  <div className="flex gap-3 mt-1.5 opacity-90 text-sm">
                    <span>Applied: {new Date(selectedApp.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="font-semibold px-2 py-0.5 bg-white/20 rounded-md">Requested Unit {selectedApp.unit}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="text-white hover:bg-white/20 p-2 rounded-xl border-0 bg-transparent cursor-pointer transition-colors">
                <FontAwesomeIcon icon={faTimes} className="text-xl" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50 space-y-8">
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faVenusMars} className="mr-1"/> Gender</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.gender || 'Not Specified'}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faUsers} className="mr-1"/> Occupants</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.occupants} Person(s)</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faCalendarAlt} className="mr-1"/> Lease Term</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.months_of_rent} Months</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-indigo-200 shadow-sm bg-indigo-50/30">
                  <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1 m-0">Monthly Rent</p>
                  <p className="text-sm font-bold text-indigo-700 m-0">{selectedApp.rent}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faEnvelope} className="mr-1"/> Email Address</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.email || '—'}</p>
                 </div>
                 <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 m-0"><FontAwesomeIcon icon={faPhone} className="mr-1"/> Contact Number</p>
                  <p className="text-sm font-semibold text-slate-800 m-0">{selectedApp.phone || '—'}</p>
                 </div>
              </div>

              {/* Verification Documents */}
              <div>
                 <h4 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wide border-b border-slate-200 pb-2">Submitted Documents</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <a href={`http://localhost/ApartmentManagementSystem_React/backend/uploads/applications/${selectedApp.valid_id_front_path?.split('/').pop()}`} target="_blank" rel="noreferrer" 
                      className={`flex flex-col items-center justify-center gap-2 text-sm p-4 rounded-xl border-2 transition-all ${selectedApp.valid_id_front_path ? 'border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md text-slate-700' : 'border-dashed border-slate-200 bg-slate-50 text-slate-400 pointer-events-none'}`}>
                     <FontAwesomeIcon icon={faFileAlt} className={`text-2xl ${selectedApp.valid_id_front_path ? 'text-indigo-500' : 'text-slate-300'}`} /> 
                     <span className="font-semibold text-center mt-1">Valid ID (Front)</span>
                     {!selectedApp.valid_id_front_path && <span className="text-[10px] uppercase">Missing</span>}
                   </a>
                   
                   <a href={`http://localhost/ApartmentManagementSystem_React/backend/uploads/applications/${selectedApp.valid_id_back_path?.split('/').pop()}`} target="_blank" rel="noreferrer" 
                      className={`flex flex-col items-center justify-center gap-2 text-sm p-4 rounded-xl border-2 transition-all ${selectedApp.valid_id_back_path ? 'border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md text-slate-700' : 'border-dashed border-slate-200 bg-slate-50 text-slate-400 pointer-events-none'}`}>
                     <FontAwesomeIcon icon={faFileAlt} className={`text-2xl ${selectedApp.valid_id_back_path ? 'text-indigo-500' : 'text-slate-300'}`} /> 
                     <span className="font-semibold text-center mt-1">Valid ID (Back)</span>
                     {!selectedApp.valid_id_back_path && <span className="text-[10px] uppercase">Missing</span>}
                   </a>

                   <a href={`http://localhost/ApartmentManagementSystem_React/backend/uploads/applications/${selectedApp.nbi_clearance_path?.split('/').pop()}`} target="_blank" rel="noreferrer" 
                      className={`flex flex-col items-center justify-center gap-2 text-sm p-4 rounded-xl border-2 transition-all ${selectedApp.nbi_clearance_path ? 'border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md text-slate-700' : 'border-dashed border-slate-200 bg-slate-50 text-slate-400 pointer-events-none'}`}>
                     <FontAwesomeIcon icon={faFileAlt} className={`text-2xl ${selectedApp.nbi_clearance_path ? 'text-indigo-500' : 'text-slate-300'}`} /> 
                     <span className="font-semibold text-center mt-1">NBI Clearance</span>
                     {!selectedApp.nbi_clearance_path && <span className="text-[10px] uppercase">Missing</span>}
                   </a>
                 </div>
              </div>

              {/* Actions */}
              {selectedApp.status === 'Pending Review' && (
                <div className="flex gap-4 mt-8 pt-6 border-t border-slate-200">
                  <button 
                    onClick={() => { updateStatus(selectedApp.id, 'Approved'); setShowProfileModal(false); }} 
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white p-4 rounded-xl border-0 cursor-pointer text-sm font-bold hover:bg-emerald-600 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <FontAwesomeIcon icon={faCheckCircle} className="text-lg" /> APPROVE APPLICATION
                  </button>
                  <button 
                    onClick={() => { updateStatus(selectedApp.id, 'Rejected'); setShowProfileModal(false); }} 
                    className="flex-1 flex items-center justify-center gap-2 bg-white text-red-600 border-2 border-red-200 p-4 rounded-xl cursor-pointer text-sm font-bold hover:bg-red-50 hover:border-red-300 transition-all shadow-sm"
                  >
                    <FontAwesomeIcon icon={faTimes} className="text-lg" /> REJECT
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminApplications;