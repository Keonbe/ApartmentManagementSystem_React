import { useState, useEffect } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faVideo, faCheck, faTimes, faSearch, faSync, 
  faBuilding, faCalendarAlt
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { LIMITS } from '../utils/validation';
import useUrlFilter from '../hooks/useUrlFilter';
import { TH, THEAD } from '../Components/admin/ui/styles';
import FilterTabs from '../Components/admin/ui/FilterTabs';

export default function AdminCctv() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useUrlFilter('tab', 'all', ['all', 'pending', 'approved', 'rejected']);

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
  // The tabs carry the counts (a row of count cards used to repeat them).
  const tabCounts = { all: requests.length, pending: pendingCount, approved: approvedCount, rejected: rejectedCount };

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 text-left font-sans">
        <Header title="CCTV Footage Requests" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* Filter and Search Bar */}
            <div className="rounded-card border border-slate-200 bg-white p-4 sm:p-6 shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative flex-1 w-full">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
                  <input maxLength={LIMITS.search}
                    type="text"
                    placeholder="Search by tenant, unit, incident location, or reason..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-card border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-body text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                  <FilterTabs
                    label="Filter CCTV requests by status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={['all', 'pending', 'approved', 'rejected'].map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1), count: loading || error ? null : tabCounts[t] }))}
                  />

                  <button
                    type="button"
                    onClick={fetchCctvRequests}
                    className="flex h-9 w-9 items-center justify-center rounded-card border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                    title="Refresh"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Requests Table */}
            <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-left text-body">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Tenant &amp; Unit</th>
                      <th className={TH}>Incident Date &amp; Time</th>
                      <th className={TH}>Location</th>
                      <th className={TH}>Reason</th>
                      <th className={`${TH} text-center`}>Status</th>
                      <th className={`${TH} text-right`}>Actions</th>
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
                            <span className="text-body italic">No CCTV footage requests found.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-bold text-slate-800 m-0">{req.tenant}</p>
                            <span className="inline-flex items-center gap-1 text-label text-slate-500 mt-0.5">
                              <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-indigo-500" />
                              Unit {req.unit}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-label text-slate-600">
                            <p className="m-0 font-medium flex items-center gap-1">
                              <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-500 text-[10px]" />
                              {req.incidentDate}
                            </p>
                            <p className="text-caption text-slate-500 m-0 mt-0.5">{req.time}</p>
                          </td>

                          <td className="px-4 py-4 text-label font-medium text-slate-700">
                            {req.location}
                          </td>

                          <td className="px-4 py-4 text-label text-slate-500 max-w-xs truncate" title={req.reason}>
                            {req.reason}
                          </td>

                          <td className="px-4 py-4 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${
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
                                  className="btn-interactive rounded-control bg-emerald-50 px-2.5 py-1.5 text-label font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer"
                                  title="Approve Request"
                                >
                                  <FontAwesomeIcon icon={faCheck} className="mr-1" /> Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(req.id, 'Rejected')}
                                  className="btn-interactive rounded-control bg-red-50 px-2.5 py-1.5 text-label font-bold text-red-700 hover:bg-red-100 transition-colors border-0 cursor-pointer"
                                  title="Reject Request"
                                >
                                  <FontAwesomeIcon icon={faTimes} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-label font-medium italic text-slate-500">Resolved</span>
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
