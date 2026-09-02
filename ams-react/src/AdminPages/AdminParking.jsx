import React, { useState, useEffect } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCar, faCheck, faTimes, faSearch, faSync, 
  faClock, faCheckCircle, faTimesCircle, faBuilding, faEye, faReceipt
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

export default function AdminParking() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchParkingReservations();
  }, []);

  const fetchParkingReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('get_parking_reservations.php');
      if (res.data.success) {
        setReservations(res.data.reservations || []);
      } else {
        setError(res.data.message || 'Failed to fetch parking reservations.');
      }
    } catch (err) {
      console.error('Failed to load parking reservations:', err);
      setError('Unable to load parking reservations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      const res = await api.post('update_parking_status.php', {
        id,
        status: newStatus
      });
      if (res.data.success) {
        fetchParkingReservations();
      } else {
        alert(res.data.message || 'Failed to update reservation status.');
      }
    } catch (err) {
      console.error('Error updating parking status:', err);
      alert('Server error updating status.');
    }
  };

  const filteredReservations = reservations.filter(res => {
    const matchesStatus = statusFilter === 'all' || (res.status && res.status.toLowerCase() === statusFilter.toLowerCase());
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      (res.tenant && res.tenant.toLowerCase().includes(q)) ||
      (res.unit && res.unit.toLowerCase().includes(q)) ||
      (res.vehicleModel && res.vehicleModel.toLowerCase().includes(q)) ||
      (res.plateNumber && res.plateNumber.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const pendingCount = reservations.filter(r => r.status === 'Pending').length;
  const assignedCount = reservations.filter(r => r.status === 'Assigned' || r.status === 'Approved').length;
  const rejectedCount = reservations.filter(r => r.status === 'Rejected').length;
  const totalMonthlyVal = reservations
    .filter(r => r.status === 'Assigned' || r.status === 'Approved')
    .reduce((sum, r) => sum + (parseFloat(r.totalCost) || 0), 0);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-white text-left font-sans">
        <Header title="Parking Management" />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl space-y-6">

            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Active Slots</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <FontAwesomeIcon icon={faCar} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-emerald-950 m-0">{assignedCount}</p>
                <p className="mt-1 text-xs text-emerald-600 font-medium m-0">Assigned parking permits</p>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Requests</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <FontAwesomeIcon icon={faClock} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-amber-950 m-0">{pendingCount}</p>
                <p className="mt-1 text-xs text-amber-600 font-medium m-0">Awaiting slot allocation</p>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Total Value</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <FontAwesomeIcon icon={faReceipt} />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-indigo-950 m-0">₱{totalMonthlyVal.toLocaleString()}</p>
                <p className="mt-1 text-xs text-indigo-600 font-medium m-0">Active permit value</p>
              </div>

              <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
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
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                  <input
                    type="text"
                    placeholder="Search by tenant, unit, vehicle model, or plate number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                    {['all', 'pending', 'assigned', 'rejected'].map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setStatusFilter(tab)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all border-0 cursor-pointer ${
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
                    onClick={fetchParkingReservations}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                    title="Refresh"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Reservations Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Tenant &amp; Unit</th>
                      <th className="px-4 py-3.5">Vehicle Details</th>
                      <th className="px-4 py-3.5">Plate No.</th>
                      <th className="px-4 py-3.5">Duration &amp; Cost</th>
                      <th className="px-4 py-3.5 text-center">OR/CR Doc</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center text-slate-400 font-medium">
                          Loading parking reservations...
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center text-rose-500 font-medium">
                          {error}
                        </td>
                      </tr>
                    ) : filteredReservations.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-slate-400">
                            <FontAwesomeIcon icon={faCar} className="text-xl text-slate-300 shrink-0" />
                            <span className="text-sm italic">No parking reservations found.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredReservations.map((res) => {
                        const isPending = res.status === 'Pending';
                        const isAssigned = res.status === 'Assigned' || res.status === 'Approved';

                        return (
                          <tr key={res.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-5 py-4">
                              <p className="font-bold text-slate-800 m-0">{res.tenant}</p>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                                <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-indigo-500" />
                                Unit {res.unit}
                              </span>
                            </td>

                            <td className="px-4 py-4 text-xs text-slate-700">
                              <p className="m-0 font-bold">{res.vehicleModel}</p>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5">{res.vehicleType} • {res.transmission}</p>
                            </td>

                            <td className="px-4 py-4 text-xs">
                              <span className="font-mono uppercase font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                {res.plateNumber}
                              </span>
                            </td>

                            <td className="px-4 py-4 text-xs">
                              <p className="m-0 font-bold text-indigo-600">₱{parseFloat(res.totalCost || 0).toLocaleString()}</p>
                              <p className="text-[11px] text-slate-400 m-0 mt-0.5">{res.durationMonths} months</p>
                            </td>

                            <td className="px-4 py-4 text-center">
                              {res.documentPath ? (
                                <a
                                  href={`http://localhost:8080/ApartmentManagementSystem_React/backend/${res.documentPath.replace(/^(\.\.\/)+/, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                                >
                                  <FontAwesomeIcon icon={faEye} />
                                  <span>View OR/CR</span>
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400 italic">—</span>
                              )}
                            </td>

                            <td className="px-4 py-4 text-center">
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                isPending ? 'bg-amber-100 text-amber-700' :
                                isAssigned ? 'bg-emerald-100 text-emerald-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {res.status}
                              </span>
                            </td>

                            <td className="px-5 py-4 text-right">
                              {isPending ? (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleStatusUpdate(res.id, 'Assigned')}
                                    className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors border-0 cursor-pointer"
                                    title="Assign Slot"
                                  >
                                    <FontAwesomeIcon icon={faCheck} className="mr-1" /> Assign
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleStatusUpdate(res.id, 'Rejected')}
                                    className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors border-0 cursor-pointer"
                                    title="Reject Request"
                                  >
                                    <FontAwesomeIcon icon={faTimes} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs font-medium italic text-slate-400">Resolved</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
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
