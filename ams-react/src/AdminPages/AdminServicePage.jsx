import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBroom,
  faTshirt,
  faCar,
  faVideo,
  faCheck,
  faTimes,
  faEye,
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
  faPlay,
  faPalette
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { fileUrl } from '../api/fileUrl';
import ServiceCatalogModal from '../Components/ServiceCatalogModal';
import CctvDetailsModal from '../Components/CctvDetailsModal';
import { CCTV_DEFAULTS, incidentTypeLabel, loadCctvConfig } from '../config/cctvConfig';
import ServiceAppearanceModal from '../Components/ServiceAppearanceModal';
import { getServiceAppearance, parseServiceAppearance } from '../config/serviceAppearance';
import useUrlFilter from '../hooks/useUrlFilter';
import { TH, THEAD, btn } from '../Components/admin/ui/styles';
import { SkeletonList } from '../Components/admin/ui/Skeleton';
import LoadError from '../Components/admin/ui/LoadError';
import { isServiceSwitchOn } from '../config/settingsSchema';

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
    iconColor: 'text-emerald-700',
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
    iconColor: 'text-amber-700',
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
    description: 'Turns visitor registration on or off: tenants self-register expected guests, delivery drop-offs and visiting contractors. While off, the visitor house rule is hidden from tenants and applicants.',
    price: 'Free',
    unit: '/ guest',
    icon: faIdBadge,
    iconColor: 'text-indigo-500',
    isActive: true,
  },
];

const tenantUtilityServices = [
  {
    id: 'addons',
    title: 'Add-On Services (Portal Hub)',
    description: 'The front-facing bookable card for cleaning, laundry, and other unit services in the tenant portal.',
    price: 'Catalog',
    unit: 'based',
    isLocked: false,
    isActive: true,
  },
  {
    id: 'my-requests',
    title: 'My Requests',
    description: 'Tenant dashboard utility to review active and past tickets, permits, and CCTV requests.',
    price: 'Always',
    unit: 'enabled',
    isLocked: true,
    isActive: true,
  },
  {
    id: 'announcements',
    title: 'Announcements',
    description: 'Building notice board and memorandum center for active tenants.',
    price: 'Always',
    unit: 'enabled',
    isLocked: true,
    isActive: true,
  },
  {
    id: 'payment-history',
    title: 'Payment History',
    description: 'Ledger and official receipt download center for past monthly rental settlements.',
    price: 'Always',
    unit: 'enabled',
    isLocked: true,
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

const CATALOG_CATEGORY_BY_CARD ={ cleaning: 'cleaning', laundry: 'laundry', 'other-services': 'other' };

const CONFIRM_MESSAGES = {
  Rejected: 'Reject this booking? The tenant will be notified.',
  Cancelled: 'Cancel this booking? If it was already billed, the charge will be reversed from the tenant invoice.',
};

const AdminServicePage = () => {
  const navigate = useNavigate();
  const [services, setServices] = useState(initialServices);
  const [activeTab, setActiveTab] = useUrlFilter('tab', 'services', ['services', 'cctv', 'parking']);
  const [cctvRequests, setCctvRequests] = useState([]);
  const [cctvDetailId, setCctvDetailId] = useState(null);
  const [cctvDetailAction, setCctvDetailAction] = useState(null);
  const [cctvIncidentTypes, setCctvIncidentTypes] = useState(CCTV_DEFAULTS.incidentTypes);
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

  // Service Appearance Customization State
  const [customAppearanceMap, setCustomAppearanceMap] = useState({});
  const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);
  const [appearanceTarget, setAppearanceTarget] = useState(null);

  const loadData = async () => {
    try {
      //1.FetchActiveServicesStatusFromSystemSettings
      const settingsRes = await api.get('get_system_settings.php');
      if (settingsRes.data.success && settingsRes.data.settings) {
        const sysSettings = settingsRes.data.settings;
        if (sysSettings.service_appearance) {
          setCustomAppearanceMap(parseServiceAppearance(sysSettings.service_appearance));
        }
        setServices(prev =>
          prev.map(s => {
            if (s.isLocked) return { ...s, isActive: true };
            if (sysSettings[s.key] !== undefined) {
              return { ...s, isActive: isServiceSwitchOn(sysSettings[s.key]) };
            }
            return s;
          })
        );
      }

      //2.FetchCCTV,Parking,ServiceBookingsAndTheServiceCatalog
      const [cctvRes, parkingRes, serviceRes, catalogRes, cctvConfig] = await Promise.all([
        api.get('get_cctv_requests.php'),
        api.get('get_parking_reservations.php'),
        api.get('get_service_requests.php'),
        api.get('get_service_catalog.php'),
        loadCctvConfig(),
      ]);
      setCctvIncidentTypes(cctvConfig.incidentTypes);

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
          incidentType: r.incidentType || null,
          privacyConsentAt: r.privacyConsentAt || null,
          createdAt: r.createdAt || null,
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
        // Slot assignment, rejection/release and billing now live only on the
        // dedicated Parking page (/admin-parking), which enforces the transition
        // rules and numbered-slot capacity. This tab is a read-only summary.
        setParkingReservations(parkingRes.data.reservations.map(r => ({
          id: r.id,
          tenant: r.tenant || 'Unknown',
          unit: r.unit || '—',
          vehicleType: r.vehicleType,
          model: r.vehicleModel,
          plate: r.plateNumber,
          transmission: r.transmission,
          duration: r.durationMonths,
          totalCost: parseFloat(r.totalCost || 0),
          status: r.status,
          slotNumber: r.slotNumber,
          documentPath: r.documentPath,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch service data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = () => {
    setLoading(true);
    setError(null);
    return loadData();
  };

  useEffect(() => {
    const load = async () => { await loadData(); };
    load();
  }, []);

  // Listen for live system settings sync
  useEffect(() => {
    const handleSync = (e) => {
      if (e?.detail?.service_appearance) {
        setCustomAppearanceMap(parseServiceAppearance(e.detail.service_appearance));
      }
    };
    window.addEventListener('system-settings-updated', handleSync);
    return () => window.removeEventListener('system-settings-updated', handleSync);
  }, []);

  const openAppearanceModal = (service) => {
    setAppearanceTarget(service);
    setAppearanceModalOpen(true);
  };

  const handleSaveAppearance = async ({ serviceId, color, icon }) => {
    const updated = {
      ...customAppearanceMap,
      [serviceId]: { color, icon },
    };
    setCustomAppearanceMap(updated);

    const payload = {
      service_appearance: JSON.stringify(updated),
    };
    try {
      const res = await api.post('update_system_settings.php', payload);
      if (res.data.success) {
        window.dispatchEvent(new CustomEvent('system-settings-updated', { detail: payload }));
      } else {
        alert('Failed to save appearance: ' + (res.data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Failed to save service appearance:', err);
      alert(err.response?.data?.message || 'Failed to save appearance. Please try again.');
    }
  };

  const activeServiceCount = services.filter(s => s.isActive).length;
  const pendingCctvCount = cctvRequests.filter(r => r.status === 'Pending').length;
  const pendingParkingCount = parkingReservations.filter(r => r.status === 'Pending').length;
  const pendingServiceCount = serviceRequests.filter(r => r.status === 'Pending').length;
  // ?status=Pending (from the Dashboard) narrows the bookings list; a note says so and undoes it.
  const [bookingStatus, setBookingStatus] = useUrlFilter('status', 'all', ['all', 'Pending']);
  const visibleServiceRequests = bookingStatus === 'Pending' ? serviceRequests.filter(r => r.status === 'Pending') : serviceRequests;
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

  const openCctvDetail = (id, action = null) => { setCctvDetailAction(action); setCctvDetailId(id); };
  const closeCctvDetail = () => { setCctvDetailId(null); setCctvDetailAction(null); };

  const handleCctvStatus = async (item, newStatus, note) => {
    const rawId = typeof item === 'object' ? (item.rawId || item.id) : item;
    const targetId = typeof item === 'object' ? item.id : item;
    setCctvRequests(prev => prev.map(r => r.id === targetId ? { ...r, status: newStatus } : r));
    try {
      const res = await api.post('update_cctv_status.php', { rawId, status: newStatus, note });
      if (!res.data.success) {
        fetchData();
        alert('Failed to update CCTV status: ' + (res.data.message || 'Unknown error'));
      }
    } catch (err) {
      fetchData();
      console.error('CCTV status update failed:', err);
      alert(apiErrorMessage(err, 'Failed to update CCTV status.'));
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
      alert(apiErrorMessage(err, 'Failed to save service. Please try again.'));
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
      alert(apiErrorMessage(err, 'Failed to update service.'));
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
      alert(apiErrorMessage(err, 'Failed to remove service. Please try again.'));
    }
  };

  //=== ServiceBookingLifecycle ===
  const handleServiceStatus = async (request, newStatus) => {
    if (CONFIRM_MESSAGES[newStatus] && !window.confirm(CONFIRM_MESSAGES[newStatus])) return;
    // Rejecting or cancelling a booking that was already approved needs a reason
    // (a charge the tenant already paid becomes a refund request).
    let reason;
    if (['Rejected', 'Cancelled'].includes(newStatus) && request.status !== 'Pending') {
      reason = (window.prompt('Reason for ' + (newStatus === 'Rejected' ? 'rejecting' : 'cancelling') + ' this booking (required):') || '').trim();
      if (!reason) return;
    }
    try {
      const res = await api.post('update_service_status.php', {
        rawId: request.rawId || request.id,
        status: newStatus,
        ...(reason ? { adminNotes: reason } : {}),
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

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 text-left font-sans">
        <Header title="Service Management" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">

            {/*HeroBanner*/}
            <section className="rounded-card border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 p-6 text-white shadow-card">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="mb-2 text-sm font-medium text-indigo-100">Admin Control Center</p>
                  <h2 className="text-section md:text-page font-semibold">Manage optional tenant modules and review incoming requests.</h2>
                  <p className="mt-2 text-body text-indigo-100">
                    Enable or disable modular features for tenant portals in real-time. {loading ? '' : `${activeCatalogCount} catalog item${activeCatalogCount === 1 ? '' : 's'} bookable.`}
                  </p>
                </div>
              </div>
            </section>

            {/*ErrorBanner*/}
            {error && (
              <div className="rounded-card border border-slate-200 bg-white shadow-card">
                <LoadError title="Couldn't load services" message="This is not an empty list: the service data did not load." detail={error} onRetry={fetchData} />
              </div>
            )}

            {/*AvailableServicesGrid*/}
            <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-title font-semibold text-slate-800 m-0">Modular Service Controls</h3>
                  <p className="text-body text-slate-500 m-0 mt-1">Enable or disable modules that should be accessible in tenant portals.</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-body text-slate-600">
                  <FontAwesomeIcon icon={faTools} className="text-indigo-500" />
                  {activeServiceCount} Active Modules
                </div>
              </div>
              <div className="stagger-children grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                {services.map(service => (
                  <ServiceCard
                    key={service.id}
                    service={withCatalogPrice(service)}
                    onToggle={() => toggleService(service.id)}
                    onCustomize={openAppearanceModal}
                    customAppearanceMap={customAppearanceMap}
                  />
                ))}
              </div>
            </section>

            {/* Tenant Portal Utilities & Records Appearance */}
            <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-title font-semibold text-slate-800 m-0">Tenant Portal Utilities & Navigation</h3>
                  <p className="text-body text-slate-500 m-0 mt-1">
                    Customize preset colors and icons for standard tenant account services and records.
                  </p>
                </div>
              </div>
              <div className="stagger-children grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                {tenantUtilityServices.map(service => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isUtility
                    onCustomize={openAppearanceModal}
                    customAppearanceMap={customAppearanceMap}
                  />
                ))}
              </div>
            </section>


            {/*ServiceCatalogCRUD*/}
            <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
              <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-title font-semibold text-slate-800 m-0">Service Catalog</h3>
                  <p className="text-body text-slate-500 m-0 mt-1">
                    Priced cleaning, laundry and other add-ons tenants can book. The matching category
                    must also be enabled above before these appear in the tenant portal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className={btn('primary', 'md', 'self-start')}
                >
                  <FontAwesomeIcon icon={faPlus} /> Add Service
                </button>
              </div>

              <div className="p-4">
                {loading ? (
                  <SkeletonList rows={5} label="Loading service catalog…" />
                ) : error ? null : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left text-body">
                      <thead className={THEAD}>
                        <tr>
                          <th className={TH}>Service</th>
                          <th className={TH}>Category</th>
                          <th className={TH}>Price</th>
                          <th className={TH}>Quantity Range</th>
                          <th className={TH}>Lead Time</th>
                          <th className={`${TH} text-center`}>Bookable</th>
                          <th className={`${TH} text-right`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="stagger-children divide-y divide-slate-100">
                        {catalog.length > 0 ? (
                          catalog.map(item => (
                            <tr key={item.id} className={`transition-colors hover:bg-slate-50 ${item.isActive ? '' : 'opacity-60'}`}>
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-800 m-0">{item.name}</p>
                                <p className="max-w-md truncate text-caption text-slate-500 m-0 mt-0.5" title={item.description}>{item.description}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-slate-100 text-slate-600 capitalize">{item.category}</span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-indigo-600">
                                ₱{Number(item.price || 0).toLocaleString()}
                                <span className="ml-1 text-caption font-medium text-slate-500">/ {item.pricingUnit}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {item.pricingUnit === 'session'
                                  ? <span className="text-slate-500 italic">Single visit</span>
                                  : `${item.minQuantity} – ${item.maxQuantity ?? '∞'}`}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{item.leadTimeDays} day(s)</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCatalogItem(item)}
                                  role="switch"
                                  aria-checked={!!item.isActive}
                                  aria-label={`${item.name} bookable`}
                                  title={item.isActive ? 'Hide from tenants' : 'Make bookable'}
                                  className={`touch-compact relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${item.isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                >
                                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-card ring-0 transition duration-200 ease-in-out ${item.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={() => openEditModal(item)} className="rounded-control p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 border-0 cursor-pointer" title="Edit">
                                    <FontAwesomeIcon icon={faPen} />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteService(item)} className="rounded-control p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title="Remove">
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
            <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
              <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-title font-semibold text-slate-800 m-0">Incoming Requests Queue</h3>
                  <p className="text-body text-slate-500 m-0 mt-1">Review service bookings, CCTV footage filings and vehicle parking permit applications.</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('services')}
                    className={`rounded-full px-4 py-2 text-body font-semibold transition-colors border-0 cursor-pointer ${activeTab === 'services' ? 'bg-indigo-600 text-white shadow-card' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  >
                    Service Bookings
                    {pendingServiceCount > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ml-2 bg-amber-400 text-amber-900">{pendingServiceCount}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('cctv')}
                    className={`rounded-full px-4 py-2 text-body font-semibold transition-colors border-0 cursor-pointer ${activeTab === 'cctv' ? 'bg-indigo-600 text-white shadow-card' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  >
                    CCTV Requests
                    {pendingCctvCount > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ml-2 bg-amber-400 text-amber-900">{pendingCctvCount}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('parking')}
                    className={`rounded-full px-4 py-2 text-body font-semibold transition-colors border-0 cursor-pointer ${activeTab === 'parking' ? 'bg-indigo-600 text-white shadow-card' : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  >
                    Parking Reservations
                    {pendingParkingCount > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ml-2 bg-amber-400 text-amber-900">{pendingParkingCount}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={fetchData}
                    title="Refresh data"
                    className="rounded-full px-3 py-2 text-body bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors border-0 cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="p-4">
                {loading ? (
                  <SkeletonList rows={5} label="Loading request queue…" />
                ) : error ? null : (
                  <>
                    {/*ServiceBookingsTable*/}
                    {activeTab === 'services' && (
                      <>
                        {bookingStatus === 'Pending' && (
                          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-slate-200 bg-slate-50 px-4 py-2.5 text-body text-slate-700">
                            <span>Showing pending bookings only ({visibleServiceRequests.length}).</span>
                            <button type="button" onClick={() => setBookingStatus('all')} className="cursor-pointer border-0 bg-transparent p-0 text-body font-semibold text-indigo-700 underline">Show all</button>
                          </div>
                        )}
                        {unbilledCount > 0 && (
                          <div className="mb-4 flex items-center gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3">
                            <FontAwesomeIcon icon={faReceipt} className="text-amber-700" />
                            <p className="m-0 text-label text-amber-800">
                              {unbilledCount} completed booking(s) have not been billed yet. Use the
                              <strong> Post charge </strong> action to add them to the tenant invoice.
                            </p>
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1040px] text-left text-body">
                            <thead className={THEAD}>
                              <tr>
                                <th className={TH}>Tenant</th>
                                <th className={TH}>Unit</th>
                                <th className={TH}>Service</th>
                                <th className={TH}>Qty</th>
                                <th className={TH}>Total</th>
                                <th className={TH}>Scheduled</th>
                                <th className={`${TH} text-center`}>Ref</th>
                                <th className={`${TH} text-center`}>Billing</th>
                                <th className={`${TH} text-center`}>Status</th>
                                <th className={`${TH} text-right`}>Actions</th>
                              </tr>
                            </thead>
                            <tbody className="stagger-children divide-y divide-slate-100">
                              {visibleServiceRequests.length > 0 ? (
                                visibleServiceRequests.map(req => (
                                  <tr key={req.id} className="transition-colors hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{req.tenant || 'Unknown'}</td>
                                    <td className="px-4 py-3 text-slate-600">{req.unit}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {req.serviceName}
                                      <br />
                                      <span className="text-label text-slate-600 capitalize">{req.category}</span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {req.pricingUnit === 'session' ? '—' : `${req.quantity} ${req.pricingUnit}`}
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-indigo-600">₱{Number(req.totalCost || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {req.preferredDate}
                                      <br />
                                      <span className="text-caption text-slate-500">{req.preferredTimeSlot}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {req.attachmentPath ? (
                                        <a
                                          href={fileUrl(req.attachmentPath)}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mx-auto flex items-center justify-center gap-1 text-label text-blue-600 hover:underline no-underline"
                                        >
                                          <FontAwesomeIcon icon={faEye} /> View
                                        </a>
                                      ) : (
                                        <span className="text-label text-slate-500 italic">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {req.isInvoiced ? (
                                        <span className="text-caption font-semibold text-emerald-700" title={`Billed to ${req.invoiceId}`}>
                                          {req.invoiceId}
                                          <br />
                                          <span className="font-medium text-slate-500">{req.billingPeriod}</span>
                                        </span>
                                      ) : req.status === 'Completed' ? (
                                        <button
                                          type="button"
                                          onClick={() => handlePostCharge(req)}
                                          className="rounded-control border-0 bg-amber-100 px-2.5 py-1.5 text-caption font-bold text-amber-800 transition-colors hover:bg-amber-200 cursor-pointer"
                                        >
                                          Post charge
                                        </button>
                                      ) : (
                                        <span className="text-label text-slate-500 italic">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${
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
                                          <button type="button" onClick={() => handleServiceStatus(req, 'Approved')} className="rounded-control p-1.5 text-emerald-700 transition-colors hover:bg-emerald-50 border-0 cursor-pointer" title="Approve">
                                            <FontAwesomeIcon icon={faCheck} />
                                          </button>
                                        )}
                                        {canMove(req.status, 'In Progress') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'In Progress')} className="rounded-control p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 border-0 cursor-pointer" title="Start work">
                                            <FontAwesomeIcon icon={faPlay} />
                                          </button>
                                        )}
                                        {req.status === 'In Progress' && canMove(req.status, 'Completed') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'Completed')} className="rounded-control p-1.5 text-emerald-700 transition-colors hover:bg-emerald-50 border-0 cursor-pointer" title="Mark completed and bill">
                                            <FontAwesomeIcon icon={faCheck} />
                                          </button>
                                        )}
                                        {canMove(req.status, 'Rejected') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'Rejected')} className="rounded-control p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title="Reject">
                                            <FontAwesomeIcon icon={faTimes} />
                                          </button>
                                        )}
                                        {req.status !== 'Pending' && canMove(req.status, 'Cancelled') && (
                                          <button type="button" onClick={() => handleServiceStatus(req, 'Cancelled')} className="rounded-control p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title={req.status === 'Completed' ? 'Reverse charge and cancel' : 'Cancel booking'}>
                                            <FontAwesomeIcon icon={faTrash} />
                                          </button>
                                        )}
                                        {(SERVICE_TRANSITIONS[req.status] || []).length === 0 && (
                                          <span className="text-label font-medium italic text-slate-500">Closed</span>
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
                        <table className="w-full min-w-[760px] text-left text-body">
                          <thead className={THEAD}>
                            <tr>
                              <th className={TH}>Tenant</th>
                              <th className={TH}>Unit</th>
                              <th className={TH}>Incident Date</th>
                              <th className={TH}>Location</th>
                              <th className={TH}>Incident &amp; Reason</th>
                              <th className={`${TH} text-center`}>Status</th>
                              <th className={`${TH} text-right`}>Actions</th>
                            </tr>
                          </thead>
                          <tbody className="stagger-children divide-y divide-slate-100">
                            {cctvRequests.length > 0 ? (
                              cctvRequests.map(req => (
                                <tr key={req.id} className="transition-colors hover:bg-slate-50">
                                  <td className="px-4 py-3 font-medium text-slate-800">{req.tenant}</td>
                                  <td className="px-4 py-3 text-slate-600">{req.unit}</td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {req.incidentDate}
                                    <br />
                                    <span className="text-caption text-slate-500">{req.time}</span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">{req.location}</td>
                                  <td className="max-w-xs px-4 py-3 text-slate-500">
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-caption font-semibold text-indigo-700 whitespace-nowrap">{incidentTypeLabel(cctvIncidentTypes, req.incidentType)}</span>
                                    <div className="truncate mt-1" title={req.reason}>{req.reason}</div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${req.status === 'Pending' ? 'bg-amber-100 text-amber-700' : req.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                    <button type="button" onClick={() => openCctvDetail(req.id)} className="rounded-control p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 border-0 cursor-pointer" title="View details" aria-label={`View details of CCTV request ${req.rawId}`}>
                                      <FontAwesomeIcon icon={faEye} />
                                    </button>
                                    {req.status === 'Pending' ? (
                                      <div className="flex justify-end gap-2">
                                        <button type="button" onClick={() => openCctvDetail(req.id, 'Approved')} className="rounded-control p-1.5 text-emerald-700 transition-colors hover:bg-emerald-50 border-0 cursor-pointer" title="Approve">
                                          <FontAwesomeIcon icon={faCheck} />
                                        </button>
                                        <button type="button" onClick={() => openCctvDetail(req.id, 'Rejected')} className="rounded-control p-1.5 text-red-600 transition-colors hover:bg-red-50 border-0 cursor-pointer" title="Reject">
                                          <FontAwesomeIcon icon={faTimes} />
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-label font-medium italic text-slate-500">Resolved</span>
                                    )}
                                    </div>
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

                    {/*ParkingTable — read-only summary; slot assignment, rejection, release and
                        billing are one workflow on /admin-parking, which owns the transition
                        rules and numbered-slot capacity. This used to duplicate those actions
                        here with no rules at all (any status could go to any status).*/}
                    {activeTab === 'parking' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-label text-slate-500 m-0">Assign, reject, release or bill parking on the dedicated Parking page.</p>
                          <button
                            type="button"
                            onClick={() => navigate('/admin-parking')}
                            className={btn('primary', 'sm')}
                          >
                            <FontAwesomeIcon icon={faSquareParking} /> Manage in Parking
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[860px] text-left text-body">
                            <thead className={THEAD}>
                              <tr>
                                <th className={TH}>Tenant</th>
                                <th className={TH}>Unit</th>
                                <th className={TH}>Vehicle</th>
                                <th className={TH}>Plate No.</th>
                                <th className={TH}>Slot</th>
                                <th className={TH}>Total Cost</th>
                                <th className={`${TH} text-center`}>OR/CR</th>
                                <th className={`${TH} text-center`}>Status</th>
                              </tr>
                            </thead>
                            <tbody className="stagger-children divide-y divide-slate-100">
                              {parkingReservations.length > 0 ? (
                                parkingReservations.map(req => (
                                  <tr key={req.id} className="transition-colors hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{req.tenant}</td>
                                    <td className="px-4 py-3 text-slate-600">{req.unit}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {req.model}
                                      <br />
                                      <span className="text-caption text-slate-500 capitalize">{req.vehicleType} • {req.transmission}</span>
                                    </td>
                                    <td className="px-4 py-3 uppercase font-mono text-label text-slate-600">{req.plate}</td>
                                    <td className="px-4 py-3 text-slate-600">{req.slotNumber ? `#${req.slotNumber}` : '—'}</td>
                                    <td className="px-4 py-3 font-semibold text-indigo-600">₱{Number(req.totalCost || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-center">
                                      {req.documentPath && req.documentPath !== 'placeholder' ? (
                                        <a
                                          href={fileUrl(req.documentPath)}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mx-auto flex items-center justify-center gap-1 text-label text-blue-600 hover:underline no-underline"
                                        >
                                          <FontAwesomeIcon icon={faEye} /> View
                                        </a>
                                      ) : (
                                        <span className="text-label text-slate-500 italic">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {/* Assigned is the only slot-holding status — shown green, same as elsewhere.
                                          Released is grey; only Pending, awaiting a decision, is amber. */}
                                      <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${
                                        req.status === 'Pending' ? 'bg-amber-100 text-amber-700'
                                        : req.status === 'Assigned' ? 'bg-emerald-100 text-emerald-700'
                                        : req.status === 'Released' ? 'bg-slate-100 text-slate-600'
                                        : 'bg-red-100 text-red-700'
                                      }`}>
                                        {req.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan="8" className="px-4 py-8 text-center italic text-slate-500">No parking reservations found.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

          </div>
        </main>
      </div>

      {/*CctvRequestDetailsModal: everything the tenant entered. Looked up by id so an
          approve/reject from inside it shows the new status straight away.*/}
      {cctvDetailId !== null && (() => {
        const detail = cctvRequests.find(r => r.id === cctvDetailId);
        return detail ? (
          <CctvDetailsModal
            request={detail}
            incidentLabel={incidentTypeLabel(cctvIncidentTypes, detail.incidentType)}
            initialAction={cctvDetailAction}
            onClose={closeCctvDetail}
            onDecide={(status, note) => { handleCctvStatus(detail.id, status, note); closeCctvDetail(); }}
          />
        ) : null;
      })()}

      {/*ServiceCatalogCreateEditModal*/}
      <ServiceCatalogModal
        key={`catalog-modal-${modalSession}`}
        isOpen={modalOpen}
        service={editingService}
        saving={savingService}
        onClose={() => { setModalOpen(false); setEditingService(null); }}
        onSave={handleSaveService}
      />

      {/*ServiceAppearanceCustomizationModal*/}
      <ServiceAppearanceModal
        key={appearanceTarget?.id || 'none'}
        isOpen={appearanceModalOpen}
        service={appearanceTarget}
        currentAppearance={appearanceTarget ? getServiceAppearance(appearanceTarget.id, { service_appearance: customAppearanceMap }) : null}
        onClose={() => { setAppearanceModalOpen(false); setAppearanceTarget(null); }}
        onSave={handleSaveAppearance}
      />
    </div>
  );
};

const ServiceCard = ({
  service,
  onToggle,
  onCustomize,
  customAppearanceMap,
  isUtility = false,
}) => {
  const appearance = getServiceAppearance(service.id, { service_appearance: customAppearanceMap });
  const activeIcon = appearance.icon || service.icon;

  return (
    <div className={`card-interactive flex h-full flex-col rounded-card border p-5 shadow-card transition-all ${service.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-2xs ${appearance.colorConfig.bgLight} ${appearance.colorConfig.borderLight} ${appearance.colorConfig.text}`}>
            <FontAwesomeIcon icon={activeIcon} className="text-xl" />
          </div>
          <div>
            <h4 className="text-body font-semibold text-slate-800 m-0">{service.title}</h4>
            <div className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap mt-1 inline-flex items-center gap-1 ${
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

        {/* Functional/Locked Toggle Switch Button (Hidden for pure utilities) */}
        {!isUtility && (
          service.isLocked ? (
            <button
              type="button"
              disabled
              role="switch"
              aria-checked="true"
              aria-label={`${service.title} (always on)`}
              title="Core module is always enabled"
              className="touch-compact relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center rounded-full border-2 border-transparent bg-indigo-600 opacity-80"
            >
              <span className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-card ring-0 translate-x-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              role="switch"
              aria-checked={!!service.isActive}
              aria-label={`${service.title} enabled`}
              className={`touch-compact relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${service.isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-card ring-0 transition duration-200 ease-in-out ${service.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          )
        )}
      </div>
      <p className="mb-4 flex-1 text-label text-slate-500 leading-relaxed m-0">{service.description}</p>
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
        <p className={`text-label font-semibold m-0 ${service.isActive ? 'text-indigo-600' : 'text-slate-500'}`}>
          {service.price}
          <span className="ml-1 text-caption font-medium">{service.unit}</span>
        </p>

        {/* Customize Appearance Action Button */}
        {onCustomize && (
          <button
            type="button"
            onClick={() => onCustomize(service)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 transition-colors cursor-pointer"
            title="Customize preset color and icon for tenant portal"
          >
            <FontAwesomeIcon icon={faPalette} className="text-xs text-indigo-500" />
            <span>Customize Look</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default AdminServicePage;