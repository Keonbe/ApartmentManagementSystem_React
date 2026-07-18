import { useState, useEffect } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBroom,
  faTshirt,
  faCar,
  faWifi,
  faVideo,
  faCheck,
  faTimes,
  faEye,
  faShieldAlt,
  faSquareParking,
  faTools,
  faSync,
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

const initialServices = [
  {
    id: 'cleaning',
    title: 'Cleaning service',
    description: 'Weekly unit cleaning available to tenants. Scheduled every Saturday morning.',
    price: '₱500',
    unit: '/ session',
    icon: faBroom,
    iconColor: 'text-orange-500',
    isActive: true,
  },
  {
    id: 'laundry',
    title: 'Laundry service',
    description: 'Wash and fold service. Tenant drops off laundry at the reception area.',
    price: '₱80',
    unit: '/ kg',
    icon: faTshirt,
    iconColor: 'text-emerald-500',
    isActive: true,
  },
  {
    id: 'cctv',
    title: 'CCTV Request',
    description: 'Provide tenants access to requested CCTV footage logs or dedicated camera monitoring.',
    price: '₱0',
    unit: '/ request',
    icon: faVideo,
    iconColor: 'text-slate-700',
    isActive: true,
  },
  {
    id: 'parking',
    title: 'Parking slot',
    description: 'Reserved parking for one vehicle. Limited slots available on the ground floor.',
    price: '₱1,200',
    unit: '/ month',
    icon: faCar,
    iconColor: 'text-red-500',
    isActive: false,
  },
  {
    id: 'wifi',
    title: 'WiFi billing',
    description: 'Monthly internet add-on billed separately. 50 Mbps shared fiber connection.',
    price: '₱699',
    unit: '/ month',
    icon: faWifi,
    iconColor: 'text-blue-500',
    isActive: true,
  },
];

const AdminServicePage = () => {
  const [services, setServices] = useState(initialServices);
  const [activeTab, setActiveTab] = useState('cctv');
  const [cctvRequests, setCctvRequests] = useState([]);
  const [parkingReservations, setParkingReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cctvRes, parkingRes] = await Promise.all([
        api.get('get_cctv_requests.php'),
        api.get('get_parking_reservations.php'),
      ]);
      if (cctvRes.data.success) {
        setCctvRequests(cctvRes.data.requests.map(r => ({
          id: r.id,
          tenant: r.tenant_name || 'Unknown',
          unit: r.room_name || '—',
          incidentDate: r.incident_date,
          time: r.incident_time || '',
          location: r.location_details,
          reason: r.reason_request,
          status: r.status,
        })));
      }
      if (parkingRes.data.success) {
        setParkingReservations(parkingRes.data.reservations.map(r => ({
          id: r.id,
          tenant: r.tenant_name || 'Unknown',
          unit: r.room_name || '—',
          vehicleType: r.vehicle_type,
          model: r.vehicle_model,
          plate: r.plate_number,
          transmission: r.transmission,
          duration: r.duration_months,
          totalCost: parseFloat(r.total_cost),
          status: r.status,
          documentPath: r.document_path,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch service data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const activeServiceCount = services.filter(s => s.isActive).length;
  const pendingCctvCount = cctvRequests.filter(r => r.status === 'Pending').length;
  const pendingParkingCount = parkingReservations.filter(r => r.status === 'Pending').length;

  const handleCctvStatus = async (id, newStatus) => {
    setCctvRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    try {
      const res = await api.post('update_cctv_status.php', { id, status: newStatus });
      if (!res.data.success) {
        fetchData();
        alert('Failed to update CCTV status: ' + (res.data.message || 'Unknown error'));
      }
    } catch (err) {
      fetchData();
      console.error('CCTV status update failed:', err);
    }
  };

  const handleParkingStatus = async (id, newStatus) => {
    setParkingReservations(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    try {
      const res = await api.post('update_parking_status.php', { id, status: newStatus });
      if (!res.data.success) {
        fetchData();
        alert('Failed to update parking status: ' + (res.data.message || 'Unknown error'));
      }
    } catch (err) {
      fetchData();
      console.error('Parking status update failed:', err);
    }
  };

  const toggleService = (id) => {
    setServices(prev => prev.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s));
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-white text-left font-sans">
        <Header title="Service management" />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl space-y-8">

            {/* ─── Hero Banner ─── */}
            <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 p-6 text-white shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-100">Admin control center</p>
                  <h2 className="text-2xl font-semibold">Manage optional services, CCTV follow-ups, and parking requests in one place.</h2>
                  <p className="mt-2 text-sm text-indigo-100">
                    Turn services on or off for tenants and monitor incoming requests with a cleaner, more organized workflow.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Active services</p>
                    <p className="mt-1 text-2xl font-semibold">{activeServiceCount}</p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Pending CCTV</p>
                    <p className="mt-1 text-2xl font-semibold">{loading ? '…' : pendingCctvCount}</p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Pending parking</p>
                    <p className="mt-1 text-2xl font-semibold">{loading ? '…' : pendingParkingCount}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* ─── Error Banner ─── */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center justify-between">
                <p className="text-sm font-medium text-red-700">{error}</p>
                <button onClick={fetchData} className="flex items-center gap-2 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 transition-colors">
                  <FontAwesomeIcon icon={faSync} /> Retry
                </button>
              </div>
            )}

            {/* ─── Available Services Grid ─── */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Available services</h3>
                  <p className="text-sm text-slate-500">Enable or disable add-ons that should be visible to your tenants.</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                  <FontAwesomeIcon icon={faTools} className="text-indigo-500" />
                  {activeServiceCount} active modules
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {services.map(service => (
                  <ServiceCard key={service.id} service={service} onToggle={() => toggleService(service.id)} />
                ))}
              </div>
            </section>

            {/* ─── Service Requests ─── */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Service requests</h3>
                  <p className="text-sm text-slate-500">Review CCTV requests and parking reservations without leaving the page.</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('cctv')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${activeTab === 'cctv' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  >
                    CCTV requests
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('parking')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${activeTab === 'parking' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  >
                    Parking reservations
                  </button>
                  <button
                    type="button"
                    onClick={fetchData}
                    title="Refresh data"
                    className="rounded-full px-3 py-2 text-sm bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="p-4">
                {loading ? (
                  <div className="py-12 text-center text-slate-400 text-sm font-medium">Loading requests from database…</div>
                ) : (
                  <>
                    {/* ─── CCTV Table ─── */}
                    {activeTab === 'cctv' && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Tenant</th>
                              <th className="px-4 py-3">Unit</th>
                              <th className="px-4 py-3">Incident date</th>
                              <th className="px-4 py-3">Location</th>
                              <th className="px-4 py-3">Reason</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {cctvRequests.length > 0 ? (
                              cctvRequests.map(req => (
                                <tr key={req.id} className="transition-colors hover:bg-slate-50">
                                  <td className="px-4 py-3 font-medium text-slate-800">{req.tenant}</td>
                                  <td className="px-4 py-3 text-slate-600">{req.unit}</td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {req.incidentDate}
                                    <br />
                                    <span className="text-[10px] text-slate-400">{req.time}</span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">{req.location}</td>
                                  <td className="max-w-xs px-4 py-3 truncate text-slate-500" title={req.reason}>{req.reason}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${req.status === 'Pending' ? 'bg-amber-100 text-amber-700' : req.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {req.status === 'Pending' ? (
                                      <div className="flex justify-end gap-2">
                                        <button type="button" onClick={() => handleCctvStatus(req.id, 'Approved')} className="rounded p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50" title="Approve">
                                          <FontAwesomeIcon icon={faCheck} />
                                        </button>
                                        <button type="button" onClick={() => handleCctvStatus(req.id, 'Rejected')} className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50" title="Reject">
                                          <FontAwesomeIcon icon={faTimes} />
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-xs font-medium italic text-slate-400">Resolved</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="7" className="px-4 py-8 text-center italic text-slate-500">No CCTV requests found.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* ─── Parking Table ─── */}
                    {activeTab === 'parking' && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[940px] text-left text-sm">
                          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Tenant</th>
                              <th className="px-4 py-3">Unit</th>
                              <th className="px-4 py-3">Vehicle</th>
                              <th className="px-4 py-3">Plate no.</th>
                              <th className="px-4 py-3">Duration</th>
                              <th className="px-4 py-3">Total cost</th>
                              <th className="px-4 py-3 text-center">OR/CR</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {parkingReservations.length > 0 ? (
                              parkingReservations.map(req => (
                                <tr key={req.id} className="transition-colors hover:bg-slate-50">
                                  <td className="px-4 py-3 font-medium text-slate-800">{req.tenant}</td>
                                  <td className="px-4 py-3 text-slate-600">{req.unit}</td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {req.model}
                                    <br />
                                    <span className="text-[10px] text-slate-400">{req.vehicleType} • {req.transmission}</span>
                                  </td>
                                  <td className="px-4 py-3 uppercase font-mono text-xs text-slate-600">{req.plate}</td>
                                  <td className="px-4 py-3 text-slate-600">{req.duration} mos</td>
                                  <td className="px-4 py-3 font-semibold text-indigo-600">₱{req.totalCost.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-center">
                                    {req.documentPath ? (
                                      <a
                                        href={`http://localhost:8080/ApartmentManagementSystem_React/backend/${req.documentPath.replace('../', '')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mx-auto flex items-center justify-center gap-1 text-xs text-blue-600 hover:underline"
                                      >
                                        <FontAwesomeIcon icon={faEye} /> View
                                      </a>
                                    ) : (
                                      <span className="text-xs text-slate-400 italic">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${req.status === 'Pending' ? 'bg-amber-100 text-amber-700' : req.status === 'Assigned' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {req.status === 'Pending' ? (
                                      <div className="flex justify-end gap-2">
                                        <button type="button" onClick={() => handleParkingStatus(req.id, 'Assigned')} className="rounded p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50" title="Assign Slot">
                                          <FontAwesomeIcon icon={faCheck} />
                                        </button>
                                        <button type="button" onClick={() => handleParkingStatus(req.id, 'Rejected')} className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50" title="Reject">
                                          <FontAwesomeIcon icon={faTimes} />
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-xs font-medium italic text-slate-400">Resolved</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="9" className="px-4 py-8 text-center italic text-slate-500">No parking reservations found.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

          </div>
        </main>
      </div>
    </div>
  );
};

const ServiceCard = ({ service, onToggle }) => {
  return (
    <div className={`flex h-full flex-col rounded-2xl border p-5 shadow-sm transition-all ${service.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-80'}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <FontAwesomeIcon icon={service.icon} className={`text-lg ${service.iconColor}`} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">{service.title}</h4>
            <div className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${service.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
              {service.isActive ? 'Active' : 'Disabled'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${service.isActive ? 'bg-emerald-400' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${service.isActive ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
      </div>
      <p className="mb-4 flex-1 text-sm text-slate-500">{service.description}</p>
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
        <p className={`text-sm font-semibold ${service.isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
          {service.price}
          <span className="ml-1 text-xs font-medium">{service.unit}</span>
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {service.id === 'cctv' && <FontAwesomeIcon icon={faShieldAlt} />}
          {service.id === 'parking' && <FontAwesomeIcon icon={faSquareParking} />}
          {service.id !== 'cctv' && service.id !== 'parking' && <FontAwesomeIcon icon={faTools} />}
        </div>
      </div>
    </div>
  );
};

export default AdminServicePage;