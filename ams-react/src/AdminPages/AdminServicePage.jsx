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
  faFileInvoiceDollar,
  faIdBadge,
  faLock,
  faConciergeBell,
  faPlus,
  faPen,
  faTrash,
  faReceipt,
  faPlay
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import ServiceCatalogModal from '../Components/ServiceCatalogModal';

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
    isLocked: true, // Core system service: always active
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
  {
    id: 'cleaning',
    key: 'service_cleaning_active',
    title: 'Cleaning Services',
    description: 'Let tenants book standard or deep cleaning sessions for their unit.',
    price: 'From ₱500',
    unit: '/ session',
    icon: faBroom,
    iconColor: 'text-sky-500',
    isActive: true,
  },
  {
    id: 'laundry',
    key: 'service_laundry_active',
    title: 'Laundry Services',
    description: 'Wash and fold or dry cleaning, billed by weight or by garment.',
    price: 'From ₱60',
    unit: '/ kg',
    icon: faTshirt,
    iconColor: 'text-cyan-500',
    isActive: true,
  },
  {
    id: 'other-services',
    key: 'service_other_active',
    title: 'Other Services',
    description: 'Miscellaneous add-ons such as pest control and aircon servicing.',
    price: 'Variable',
    unit: '/ request',
    icon: faConciergeBell,
    iconColor: 'text-violet-500',
    isActive: true,
  },
  {
    id: 'visitor-management',
    key: 'service_visitor_management_active',
    title: 'Visitor Management',
    description: 'Enable tenant self-registration of expected guests, delivery drop-offs, and visiting contractors.',
    price: 'Free',
    unit: '/ guest',
    icon: faIdBadge,
    iconColor: 'text-indigo-500',
    isActive: true,
  },
];

// Mirrors SERVICE_TRANSITIONS in backend/config.php.
const SERVICE_TRANSITIONS = {
  'Pending': ['Approved', 'Rejected', 'Cancelled'],
  'Approved': ['In Progress', 'Completed', 'Rejected', 'Cancelled'],
  'In Progress': ['Completed', 'Cancelled'],
  'Completed': ['Cancelled'],
  'Rejected': [],
  'Cancelled': [],
};
const canMove = (from, to) => (SERVICE_TRANSITIONS[from] || []).includes(to);

const CATALOG_CATEGORY_BY_CARD = { cleaning: 'cleaning', laundry: 'laundry', 'other-services': 'other' };

const CONFIRM_MESSAGES = {
  Rejected: 'Reject this booking? The tenant will be notified.',
  Cancelled: 'Cancel this booking? If it was already billed, the charge will be reversed from the tenant invoice.',
};

const AdminServicePage = () => {
  const [services, setServices] = useState(initialServices);
  const [activeTab, setActiveTab] = useState('services');
  const [cctvRequests, setCctvRequests] = useState([]);
  const [parkingReservations, setParkingReservations] = useState([]);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  //CatalogCRUDModalState
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [savingService, setSavingService] = useState(false);
  const [modalSession, setModalSession] = useState(0);

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
            if (s.isLocked) return { ...s, isActive: true };
            if (sysSettings[s.key] !== undefined) {
              return { ...s, isActive: sysSettings[s.key] === 'true' || sysSettings[s.key] === true };
            }
            return s;
          })
        );
      }

      //2.FetchCCTV,Parking,ServiceBookingsAndTheServiceCatalog
      const [cctvRes, parkingRes, serviceRes, catalogRes] = await Promise.all([
        api.get('get_cctv_requests.php'),
        api.get('get_parking_reservations.php'),
        api.get('get_service_requests.php'),
        api.get('get_service_catalog.php'),
      ]);

      if (cctvRes.data.success) {
        setCctvRequests(cctvRes.data.requests.map(r => ({
          id: r.id,
          rawId: r.rawId || r.id,
          tenant: r.tenant || r.tenant_name || 'Unknown',
          unit: r.unit || r.room_name || '—',
          incidentDate: r.incidentDate || r.incident_date,
          time: r.time || r.incidentTime || r.incident_time || '',
          location: r.location || r.location_details,
          reason: r.reason || r.reason_request,
          status: r.status,
        })));
      }

      if (serviceRes.data.success) {
        setServiceRequests(serviceRes.data.requests || []);
      }

      if (catalogRes.data.success) {
        setCatalog(catalogRes.data.services || []);
      }

      if (parkingRes.data.success) {
        setParkingReservations(parkingRes.data.reservations.map(r => ({
          id: r.id,
          rawId: r.rawId || r.id,
          tenant: r.tenant || r.tenant_name || 'Unknown',
          unit: r.unit || r.room_name || '—',
          vehicleType: r.vehicleType || r.vehicle_type,
          model: r.vehicleModel || r.vehicle_model,
          plate: r.plateNumber || r.plate_number,
          transmission: r.transmission,
          duration: r.durationMonths || r.duration_months,
          totalCost: parseFloat(r.totalCost || r.total_cost || 0),
          status: r.status,
          documentPath: r.documentPath || r.document_path,
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
  const pendingServiceCount = serviceRequests.filter(r => r.status === 'Pending').length;
  const activeCatalogCount = catalog.filter(s => s.isActive).length;
  //Completed work whose charge never reached an invoice (e.g. no active lease at the time)
  const unbilledCount = serviceRequests.filter(r => r.status === 'Completed' && !r.isInvoiced).length;

  //3.ToggleServiceStateAndSaveToBackend
  const toggleService = async (serviceId) => {
    const targetService = services.find(s => s.id === serviceId);
    if (!targetService || targetService.isLocked) return;

    const newActiveState = !targetService.isActive;

    //OptimisticUIUpdate
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, isActive: newActiveState } : s));

    try {
      const payload = {
        [targetService.key]: newActiveState ? 'true' : 'false'
      };
      const res = await api.post('update_system_settings.php', payload);
      if (res.data.success) {
        // Dispatch event for instant sidebar synchronization
        window.dispatchEvent(new CustomEvent('system-settings-updated', { detail: payload }));
      } else {
        //RevertStateOnFailure
        setServices(prev => prev.map(s => s.id === serviceId ? { ...s, isActive: !newActiveState } : s));
        alert('Failed to update service setting in system configuration.');
      }
    } catch (err) {
      setServices(prev => prev.map(s => s.id === serviceId ? { ...s, isActive: !newActiveState } : s));
      alert(err.response?.data?.message || 'Failed to update service setting. Please try again.');
    }
  };

  const handleCctvStatus = async (item, newStatus) => {
    const rawId = typeof item === 'object' ? (item.rawId || item.id) : item;
    const targetId = typeof item === 'object' ? item.id : item;
    setCctvRequests(prev => prev.map(r => r.id === targetId ? { ...r, status: newStatus } : r));
    try {
      const res = await api.post('update_cctv_status.php', { rawId, status: newStatus });
      if (!res.data.success) {
        fetchData();
        alert('Failed to update CCTV status: ' + (res.data.message || 'Unknown error'));
      }
    } catch (err) {
      fetchData();
      console.error('CCTV status update failed:', err);
    }
  };

  //=== ServiceCatalogCRUD ===
  //EachOpenGetsAFreshModalKey,SoAPreviousCreateNeverLeavesStaleFormValues
  const openCreateModal = () => {
    setEditingService(null);
    setModalSession(n => n + 1);
    setModalOpen(true);
  };

  const openEditModal = (service) => {
    setEditingService(service);
    setModalSession(n => n + 1);
    setModalOpen(true);
  };

  const handleSaveService = async (payload) => {
    setSavingService(true);
    try {
      const res = await api.post('manage_service_catalog.php', {
        action: editingService ? 'update' : 'create',
        id: editingService?.id,
        ...payload,
      });

      if (res.data.success) {
        setModalOpen(false);
        setEditingService(null);
        fetchData();
      } else {
        alert(res.data.message || 'Failed to save service.');
      }
    } catch (err) {
      console.error('Failed to save catalog service:', err);
      alert('Failed to save service. Please try again.');
    } finally {
      setSavingService(false);
    }
  };

  const handleToggleCatalogItem = async (service) => {
    const nextState = !Number(service.isActive);
    //OptimisticUIUpdate
    setCatalog(prev => prev.map(s => s.id === service.id ? { ...s, isActive: nextState ? 1 : 0 } : s));
    try {
      const res = await api.post('manage_service_catalog.php', {
        action: 'toggle',
        id: service.id,
        isActive: nextState,
      });
      if (!res.data.success) {
        fetchData();
        alert(res.data.message || 'Failed to update service.');
      }
    } catch (err) {
      fetchData();
      console.error('Catalog toggle failed:', err);
    }
  };

  const handleDeleteService = async (service) => {
    if (!window.confirm(`Remove "${service.name}" from the catalog?`)) return;
    try {
      const res = await api.post('manage_service_catalog.php', { action: 'delete', id: service.id });
      //ASoftDeleteStillReportsSuccess,WithAnExplanation
      if (res.data.message) alert(res.data.message);
      fetchData();
    } catch (err) {
      console.error('Failed to delete catalog service:', err);
      alert('Failed to remove service. Please try again.');
    }
  };

  //=== ServiceBookingLifecycle ===
  const handleServiceStatus = async (request, newStatus) => {
    if (CONFIRM_MESSAGES[newStatus] && !window.confirm(CONFIRM_MESSAGES[newStatus])) return;
    try {
      const res = await api.post('update_service_status.php', {
        rawId: request.rawId || request.id,
        status: newStatus,
      });
      if (!res.data.success) {
        alert(res.data.message || 'Failed to update booking status.');
      } else if (res.data.warning) {
        //TheStatusChangeStuckButTheChargeCouldNotBePosted
        alert(`Marked ${newStatus}, but the charge was not billed: ${res.data.warning}`);
      } else if (res.data.billed && res.data.invoiceId) {
        alert(`Marked ${newStatus}. ₱${Number(request.totalCost || 0).toLocaleString()} was added to invoice ${res.data.invoiceId}.`);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update booking status.');
    } finally {
      fetchData();
    }
  };

  const handlePostCharge = async (request) => {
    try {
      const res = await api.post('sync_service_to_invoice.php', { rawId: request.rawId || request.id });
      alert(res.data.message || (res.data.success ? 'Charge posted.' : 'Failed to post the charge.'));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to post the charge. Please try again.');
    } finally {
      fetchData();
    }
  };

  //ModuleCardsShowTheCheapestActiveCatalogPriceInsteadOfAHardcodedFigure
  const withCatalogPrice = (service) => {
    const category = CATALOG_CATEGORY_BY_CARD[service.id];
    if (!category || loading) return service;
    const items = catalog.filter(c => c.category === category && Number(c.isActive));
    if (items.length === 0) return { ...service, price: 'No active items', unit: '' };
    const cheapest = items.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
    return { ...service, price: `From ₱${Number(cheapest.price).toLocaleString()}`, unit: `/ ${cheapest.pricingUnit}` };
  };

  const handleParkingStatus = async (item, newStatus) => {
    const rawId = typeof item === 'object' ? (item.rawId || item.id) : item;
    const targetId = typeof item === 'object' ? item.id : item;
    setParkingReservations(prev => prev.map(r => r.id === targetId ? { ...r, status: newStatus } : r));
    try {
      const res = await api.post('update_parking_status.php', { rawId, status: newStatus });
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
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Active Modules</p>
                    <p className="mt-1 text-2xl font-semibold">{activeServiceCount}</p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Catalog Items</p>
                    <p className="mt-1 text-2xl font-semibold">{loading ? '…' : activeCatalogCount}</p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Pending Bookings</p>
                    <p className="mt-1 text-2xl font-semibold">{loading ? '…' : pendingServiceCount}</p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-100">Pending CCTV / Parking</p>
                    <p className="mt-1 text-2xl font-semibold">{loading ? '…' : pendingCctvCount + pendingParkingCount}</p>
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
                  <ServiceCard key={service.id} service={withCatalogPrice(service)} onToggle={() => toggleService(service.id)} />
                ))}
              </div>
            </section>


            {/*ServiceCatalogCRUD*/}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 m-0">Service Catalog</h3>
                  <p className="text-sm text-slate-500 m-0 mt-1">
                    Priced cleaning, laundry and other add-ons tenants can book. The matching category
                    must also be enabled above before these appear in the tenant portal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="flex items-center gap-2 self-start rounded-lg border-0 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 cursor-pointer"
                >
                  <FontAwesomeIcon icon={faPlus} /> Add Service
                </button>
              </div>

              <div className="p-4">
                {loading ? (
                  <div className="py-12 text-center text-slate-400 text-sm font-medium">Loading service catalog...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Service</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Price</th>
                          <th className="px-4 py-3">Quantity Range</th>
                          <th className="px-4 py-3">Lead Time</th>
                          <th className="px-4 py-3 text-center">Bookable</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {catalog.length > 0 ? (
                          catalog.map(item => (
                            <tr key={item.id} className={`transition-colors hover:bg-slate-50 ${item.isActive ? '' : 'opacity-60'}`}>
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-800 m-0">{item.name}</p>
                                <p className="max-w-md truncate text-[11px] text-slate-400 m-0 mt-0.5" title={item.description}>{item.description}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{item.category}</span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-indigo-600">
                                ₱{Number(item.price || 0).toLocaleString()}
                                <span className="ml-1 text-[10px] font-medium text-slate-400">/ {item.pricingUnit}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {item.pricingUnit === 'session'
                                  ? <span className="text-slate-400 italic">Single visit</span>
                                  : `${item.minQuantity} – ${item.maxQuantity ?? '∞'}`}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{item.leadTimeDays} day(s)</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCatalogItem(item)}
                                  title={item.isActive ? 'Hide from tenants' : 'Make bookable'}
                                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${item.isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                >
                                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${item.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={() => openEditModal(item)} className="rounded p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 border-0 cursor-pointer" title="Edit">
                                    <FontAwesomeIcon icon={faPen} />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteService(item)} className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title="Remove">
                                    <FontAwesomeIcon icon={faTrash} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" className="px-4 py-8 text-center italic text-slate-500">
                              No services in the catalog yet. Add one to let tenants start booking.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/*ServiceRequestsTables*/}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 m-0">Incoming Requests Queue</h3>
                  <p className="text-sm text-slate-500 m-0 mt-1">Review service bookings, CCTV footage filings and vehicle parking permit applications.</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('services')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors border-0 cursor-pointer ${activeTab === 'services' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  >
                    Service Bookings
                    {pendingServiceCount > 0 && (
                      <span className="ml-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">{pendingServiceCount}</span>
                    )}
                  </button>
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
                    {/*ServiceBookingsTable*/}
                    {activeTab === 'services' && (
                      <>
                        {unbilledCount > 0 && (
                          <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <FontAwesomeIcon icon={faReceipt} className="text-amber-500" />
                            <p className="m-0 text-xs text-amber-800">
                              {unbilledCount} completed booking(s) have not been billed yet. Use the
                              <strong> Post charge </strong> action to add them to the tenant invoice.
                            </p>
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1040px] text-left text-sm">
                            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-4 py-3">Tenant</th>
                                <th className="px-4 py-3">Unit</th>
                                <th className="px-4 py-3">Service</th>
                                <th className="px-4 py-3">Qty</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3">Scheduled</th>
                                <th className="px-4 py-3 text-center">Ref</th>
                                <th className="px-4 py-3 text-center">Billing</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {serviceRequests.length > 0 ? (
                                serviceRequests.map(req => (
                                  <tr key={req.id} className="transition-colors hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{req.tenant || 'Unknown'}</td>
                                    <td className="px-4 py-3 text-slate-600">{req.unit}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {req.serviceName}
                                      <br />
                                      <span className="text-[10px] uppercase text-slate-400">{req.category}</span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {req.pricingUnit === 'session' ? '—' : `${req.quantity} ${req.pricingUnit}`}
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-indigo-600">₱{Number(req.totalCost || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {req.preferredDate}
                                      <br />
                                      <span className="text-[10px] text-slate-400">{req.preferredTimeSlot}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {req.attachmentPath ? (
                                        <a
                                          href={fileUrl(req.attachmentPath)}
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
                                      {req.isInvoiced ? (
                                        <span className="text-[10px] font-semibold text-emerald-600" title={`Billed to ${req.invoiceId}`}>
                                          {req.invoiceId}
                                          <br />
                                          <span className="font-medium text-slate-400">{req.billingPeriod}</span>
                                        </span>
                                      ) : req.status === 'Completed' ? (
                                        <button
                                          type="button"
                                          onClick={() => handlePostCharge(req)}
                                          className="rounded-lg border-0 bg-amber-100 px-2.5 py-1.5 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-200 cursor-pointer"
                                        >
                                          Post charge
                                        </button>
                                      ) : (
                                        <span className="text-xs text-slate-400 italic">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                        req.status === 'Pending' ? 'bg-amber-100 text-amber-700'
                                          : req.status === 'Approved' ? 'bg-blue-100 text-blue-700'
                                          : req.status === 'In Progress' ? 'bg-indigo-100 text-indigo-700'
                                          : req.status === 'Completed' ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}>
                                        {req.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex justify-end gap-2">
                                        {canMove(req.status, 'Approved') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'Approved')} className="rounded p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 border-0 cursor-pointer" title="Approve">
                                            <FontAwesomeIcon icon={faCheck} />
                                          </button>
                                        )}
                                        {canMove(req.status, 'In Progress') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'In Progress')} className="rounded p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 border-0 cursor-pointer" title="Start work">
                                            <FontAwesomeIcon icon={faPlay} />
                                          </button>
                                        )}
                                        {req.status === 'In Progress' && canMove(req.status, 'Completed') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'Completed')} className="rounded p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 border-0 cursor-pointer" title="Mark completed and bill">
                                            <FontAwesomeIcon icon={faCheck} />
                                          </button>
                                        )}
                                        {canMove(req.status, 'Rejected') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'Rejected')} className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title="Reject">
                                            <FontAwesomeIcon icon={faTimes} />
                                          </button>
                                        )}
                                        {req.status !== 'Pending' && canMove(req.status, 'Cancelled') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'Cancelled')} className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title={req.status === 'Completed' ? 'Reverse charge and cancel' : 'Cancel booking'}>
                                            <FontAwesomeIcon icon={faTrash} />
                                          </button>
                                        )}
                                        {(SERVICE_TRANSITIONS[req.status] || []).length === 0 && (
                                          <span className="text-xs font-medium italic text-slate-400">Closed</span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan="10" className="px-4 py-8 text-center italic text-slate-500">No service bookings found.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

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
                                  <td className="px-4 py-3 font-semibold text-indigo-600">₱{Number(req.totalCost || 0).toLocaleString()}</td>
                                  <td className="px-4 py-3 text-center">
                                    {req.documentPath ? (
                                      <a
                                        href={fileUrl(req.documentPath)}
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

      {/*ServiceCatalogCreateEditModal*/}
      <ServiceCatalogModal
        key={`catalog-modal-${modalSession}`}
        isOpen={modalOpen}
        service={editingService}
        saving={savingService}
        onClose={() => { setModalOpen(false); setEditingService(null); }}
        onSave={handleSaveService}
      />
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
            <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
              service.isLocked 
                ? 'bg-indigo-100 text-indigo-700' 
                : service.isActive 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : 'bg-slate-200 text-slate-600'
            }`}>
              {service.isLocked && <FontAwesomeIcon icon={faLock} className="text-[9px]" />}
              {service.isLocked ? 'Always On' : service.isActive ? 'Active' : 'Disabled'}
            </div>
          </div>
        </div>

        {/* Functional/Locked Toggle Switch Button */}
        {service.isLocked ? (
          <button
            type="button"
            disabled
            title="Core module is always enabled"
            className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center rounded-full border-2 border-transparent bg-indigo-600 opacity-80"
          >
            <span className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 translate-x-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${service.isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${service.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        )}
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