import { useState, useEffect } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faVideo, faCheck, faTimes, faSearch, faSync, 
  faClock, faCheckCircle, faTimesCircle, faBuilding, faCalendarAlt
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { LIMITS } from '../utils/validation';

export default function AdminCctv() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadCctvRequests = async () => {
    try {
      const res = await api.get('get_cctv_requests.php');
      if (res.data.success) {
        setRequests(res.data.requests || []);
      } else {
        setError(res.data.message || 'Failed to fetch CCTV requests.');
      }
    } catch (err) {
      console.error('Failed to load CCTV requests:', err);
      setError('Unable to load CCTV requests. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCctvRequests = () => {
    setLoading(true);
    setError(null);
    return loadCctvRequests();
  };

  useEffect(() => {
    const load = async () => { await loadCctvRequests(); };
    load();
  }, []);

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      const res = await api.post('update_cctv_status.php', {
        id,
        status: newStatus
      });
      if (res.data.success) {
        fetchCctvRequests();
      } else {
        alert(res.data.message || 'Failed to update request.');
      }
    } catch (err) {
      console.error('Error updating CCTV status:', err);
      alert(apiErrorMessage(err, 'Server error updating status.'));
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesStatus = statusFilter === 'all' || req.status.toLowerCase() === statusFilter.toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      (req.tenant && req.tenant.toLowerCase().includes(q)) ||
      (req.unit && req.unit.toLowerCase().includes(q)) ||
      (req.location && req.location.toLowerCase().includes(q)) ||
      (req.reason && req.reason.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const approvedCount = requests.filter(r => r.status === 'Approved').length;
  const rejectedCount = requests.filter(r => r.status === 'Rejected').length;

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-white text-left font-sans">
        <Header title="CCTV Footage Requests" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* Top Stat Cards */}
            <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card-interactive rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Total Filings</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <FontAwesomeIcon icon={faVideo} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-indigo-950 m-0">{requests.length}</p>
                <p className="mt-1 text-xs text-indigo-600 font-medium m-0">All submitted requests</p>
              </div>

              <div className="card-interactive rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Review</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <FontAwesomeIcon icon={faClock} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-amber-950 m-0">{pendingCount}</p>
                <p className="mt-1 text-xs text-amber-700 font-medium m-0">Awaiting footage review</p>
              </div>

              <div className="card-interactive rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Approved</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <FontAwesomeIcon icon={faCheckCircle} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-emerald-950 m-0">{approvedCount}</p>
                <p className="mt-1 text-xs text-emerald-700 font-medium m-0">Footage granted</p>
              </div>

              <div className="card-interactive rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Rejected</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                    <FontAwesomeIcon icon={faTimesCircle} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-rose-950 m-0">{rejectedCount}</p>
                <p className="mt-1 text-xs text-rose-600 font-medium m-0">Declined requests</p>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative flex-1 w-full">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
                  <input maxLength={LIMITS.search}
                    type="text"
                    placeholder="Search by tenant, unit, incident location, or reason..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                    {['all', 'pending', 'approved', 'rejected'].map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setStatusFilter(tab)}
                        className={`btn-interactive rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all border-0 cursor-pointer ${
                          statusFilter === tab
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'bg-transparent text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={fetchCctvRequests}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                    title="Refresh"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Requests Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Tenant &amp; Unit</th>
                      <th className="px-4 py-3.5">Incident Date &amp; Time</th>
                      <th className="px-4 py-3.5">Location</th>
                      <th className="px-4 py-3.5">Reason</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-children divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan="6" className="px-5 py-12 text-center text-slate-500 font-medium">
                          Loading CCTV requests...
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan="6" className="px-5 py-12 text-center text-rose-500 font-medium">
                          {error}
                        </td>
                      </tr>
                    ) : filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-slate-500">
                            <FontAwesomeIcon icon={faVideo} className="text-xl text-slate-300 shrink-0" />
                            <span className="text-sm italic">No CCTV footage requests found.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-bold text-slate-800 m-0">{req.tenant}</p>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                              <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-indigo-500" />
                              Unit {req.unit}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-xs text-slate-600">
                            <p className="m-0 font-medium flex items-center gap-1">
                              <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-500 text-[10px]" />
                              {req.incidentDate}
                            </p>
                            <p className="text-[11px] text-slate-500 m-0 mt-0.5">{req.time}</p>
                          </td>

                          <td className="px-4 py-4 text-xs font-medium text-slate-700">
                            {req.location}
                          </td>

                          <td className="px-4 py-4 text-xs text-slate-500 max-w-xs truncate" title={req.reason}>
                            {req.reason}
                          </td>

                          <td className="px-4 py-4 text-center">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              req.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                              req.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {req.status}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right">
                            {req.status === 'Pending' ? (
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(req.id, 'Approved')}
                                  className="btn-interactive rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer"
                                  title="Approve Request"
                                >
                                  <FontAwesomeIcon icon={faCheck} className="mr-1" /> Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(req.id, 'Rejected')}
                                  className="btn-interactive rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors border-0 cursor-pointer"
                                  title="Reject Request"
                                >
                                  <FontAwesomeIcon icon={faTimes} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-medium italic text-slate-500">Resolved</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
