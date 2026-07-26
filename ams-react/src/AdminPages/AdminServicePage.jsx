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
  faFileInvoiceDollar
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

const initialServices = [
  {
    id: 'pay-bills',
    key: 'service_pay_bills_active',
    title: 'Bill Payments',
    description: 'View outstanding apartment utility statement accounts and settle monthly balances securely.',
    price: 'Variable',
    unit: '/ month',
    icon: faFileInvoiceDollar,
    iconColor: 'text-indigo-600',
    isActive: true,
  },
  {
    id: 'parking',
    key: 'service_parking_active',
    title: 'Parking Reservation',
    description: 'Check slot availability charts and reserve motorcycle or vehicle parking spaces.',
    price: '₱300',
    unit: '/ month',
    icon: faCar,
    iconColor: 'text-emerald-500',
    isActive: true,
  },
  {
    id: 'maintenance',
    key: 'service_maintenance_active',
    title: 'Maintenance Request',
    description: 'Submit technical service tickets for unit repairs, electrical fixtures, or plumbing issues.',
    price: 'Variable',
    unit: '/ ticket',
    icon: faTools,
    iconColor: 'text-amber-500',
    isActive: true,
  },
  {
    id: 'cctv',
    key: 'service_cctv_active',
    title: 'CCTV Footage Request',
    description: 'Provide tenants access to requested CCTV footage logs or dedicated camera monitoring.',
    price: 'Free',
    unit: '/ request',
    icon: faVideo,
    iconColor: 'text-[#3b4276]',
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
      //1.FetchActiveServicesStatusFromSystemSettings
      const settingsRes = await api.get('get_system_settings.php');
      if (settingsRes.data.success && settingsRes.data.settings) {
        const sysSettings = settingsRes.data.settings;
        setServices(prev =>
          prev.map(s => {
            if (sysSettings[s.key] !== undefined) {
              return { ...s, isActive: sysSettings[s.key] === 'true' || sysSettings[s.key] === true };
            }
            return s;
          })
        );
      }

      //2.FetchCCTVAndParkingRequestsData
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

  //3.ToggleServiceStateAndSaveToBackend
  const toggleService = async (serviceId) => {
    const targetService = services.find(s => s.id === serviceId);
    if (!targetService) return;

    const newActiveState = !targetService.isActive;

    //OptimisticUIUpdate
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, isActive: newActiveState } : s));

    try {
      const payload = {
        [targetService.key]: newActiveState ? 'true' : 'false'
      };
      const res = await api.post('update_system_settings.php', payload);
      if (!res.data.success) {
        //RevertStateOnFailure
        setServices(prev => prev.map(s => s.id === serviceId ? { ...s, isActive: !newActiveState } : s));
        alert('Failed to update service setting in system configuration.');
      }
    } catch (err) {
      console.error('Failed to save service toggle state:', err);
      setServices(prev => prev.map(s => s.id === serviceId ? { ...s, isActive: !newActiveState } : s));
    }
  };

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

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-white text-left font-sans">
        <Header title="Service Management" />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl space-y-8">

            {/*HeroBanner*/}
            <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 p-6 text-white shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-100">Admin Control Center</p>
                  <h2 className="text-2xl font-semibold">Manage optional tenant modules and review incoming requests.</h2>
                  <p className="mt-2 text-sm text-indigo-100">
                    Enable or disable modular features for tenant portals in real-time.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Active Services</p>
                    <p className="mt-1 text-2xl font-semibold">{activeServiceCount}</p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Pending CCTV</p>
                    <p className="mt-1 text-2xl font-semibold">{loading ? '…' : pendingCctvCount}</p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Pending Parking</p>
                    <p className="mt-1 text-2xl font-semibold">{loading ? '…' : pendingParkingCount}</p>
                  </div>
                </div>
              </div>
            </section>

            {/*ErrorBanner*/}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center justify-between">
                <p className="text-sm font-medium text-red-700">{error}</p>
                <button onClick={fetchData} className="flex items-center gap-2 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 transition-colors">
                  <FontAwesomeIcon icon={faSync} /> Retry
                </button>
              </div>
            )}

            {/*AvailableServicesGrid*/}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 m-0">Modular Service Controls</h3>
                  <p className="text-sm text-slate-500 m-0 mt-1">Enable or disable modules that should be accessible in tenant portals.</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                  <FontAwesomeIcon icon={faTools} className="text-indigo-500" />
                  {activeServiceCount} Active Modules
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                {services.map(service => (
                  <ServiceCard key={service.id} service={service} onToggle={() => toggleService(service.id)} />
                ))}
              </div>
            </section>

            {/*ServiceRequestsTables*/}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 m-0">Incoming Requests Queue</h3>
                  <p className="text-sm text-slate-500 m-0 mt-1">Review CCTV footage filings and vehicle parking permit applications.</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('cctv')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors border-0 cursor-pointer ${activeTab === 'cctv' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  >
                    CCTV Requests
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('parking')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors border-0 cursor-pointer ${activeTab === 'parking' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  >
                    Parking Reservations
                  </button>
                  <button
                    type="button"
                    onClick={fetchData}
                    title="Refresh data"
                    className="rounded-full px-3 py-2 text-sm bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors border-0 cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="p-4">
                {loading ? (
                  <div className="py-12 text-center text-slate-400 text-sm font-medium">Loading request queue...</div>
                ) : (
                  <>
                    {/*CCTVTable*/}
                    {activeTab === 'cctv' && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Tenant</th>
                              <th className="px-4 py-3">Unit</th>
                              <th className="px-4 py-3">Incident Date</th>
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
                                        <button type="button" onClick={() => handleCctvStatus(req.id, 'Approved')} className="rounded p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 border-0 cursor-pointer" title="Approve">
                                          <FontAwesomeIcon icon={faCheck} />
                                        </button>
                                        <button type="button" onClick={() => handleCctvStatus(req.id, 'Rejected')} className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title="Reject">
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

                    {/*ParkingTable*/}
                    {activeTab === 'parking' && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[940px] text-left text-sm">
                          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Tenant</th>
                              <th className="px-4 py-3">Unit</th>
                              <th className="px-4 py-3">Vehicle</th>
                              <th className="px-4 py-3">Plate No.</th>
                              <th className="px-4 py-3">Duration</th>
                              <th className="px-4 py-3">Total Cost</th>
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
                                        href={`http://localhost/ApartmentManagementSystem_React/backend/${req.documentPath.replace('../', '')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mx-auto flex items-center justify-center gap-1 text-xs text-blue-600 hover:underline no-underline"
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
                                        <button type="button" onClick={() => handleParkingStatus(req.id, 'Assigned')} className="rounded p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 border-0 cursor-pointer" title="Assign Slot">
                                          <FontAwesomeIcon icon={faCheck} />
                                        </button>
                                        <button type="button" onClick={() => handleParkingStatus(req.id, 'Rejected')} className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title="Reject">
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
    <div className={`flex h-full flex-col rounded-2xl border p-5 shadow-sm transition-all ${service.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <FontAwesomeIcon icon={service.icon} className={`text-lg ${service.iconColor}`} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 m-0">{service.title}</h4>
            <div className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${service.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
              {service.isActive ? 'Active' : 'Disabled'}
            </div>
          </div>
        </div>

        {/*FunctionalToggleSwitchButton*/}
        <button
          type="button"
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${service.isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${service.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
      <p className="mb-4 flex-1 text-xs text-slate-500 leading-relaxed m-0">{service.description}</p>
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
        <p className={`text-xs font-semibold m-0 ${service.isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
          {service.price}
          <span className="ml-1 text-[10px] font-medium">{service.unit}</span>
        </p>
      </div>
    </div>
  );
};

export default AdminServicePage;