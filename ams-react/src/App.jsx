import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import api from './api/axiosConfig';
import { ChatProvider } from './context/ChatContext';
import ChatWidget from './Components/ChatWidget';

// Components
import TopBar from './Components/TopBar';
import ServiceRouteGuard from './Components/ServiceRouteGuard';

// User Pages
import Home from './UserPages/Home';
const Preview = lazy(() => import('./UserPages/Preview'));
const InquiryForm = lazy(() => import('./UserPages/InquiryForm'));
import Login from './UserPages/Login';
const Registration = lazy(() => import('./UserPages/Registration'));
const ResetPassword = lazy(() => import('./UserPages/ResetPassword'));
const Services = lazy(() => import('./UserPages/Services'));
const PayBills = lazy(() => import('./UserPages/PayBills'));
const ParkingReservation = lazy(() => import('./UserPages/ParkingReservation'));
const CctvRequest = lazy(() => import('./UserPages/CctvRequest')); 
const MaintenanceRequest = lazy(() => import('./UserPages/MaintenanceRequest')); 
const RentApplication = lazy(() => import('./UserPages/RentApplication'));
const ProfileSettings = lazy(() => import('./UserPages/ProfileSettings'));
const TrackApplication = lazy(() => import('./UserPages/TrackApplication'));
const PaymentUpload = lazy(() => import('./UserPages/PaymentUpload'));
const MyRoom = lazy(() => import('./UserPages/MyRoom'));
const UserNotifications = lazy(() => import('./UserPages/UserNotifications'));
const ViewContract = lazy(() => import('./UserPages/ViewContract'));
const UserMyRequests = lazy(() => import('./UserPages/UserMyRequests'));
const UserAnnouncements = lazy(() => import('./UserPages/UserAnnouncements'));
const UserPaymentHistory = lazy(() => import('./UserPages/UserPaymentHistory'));
const UserRefunds = lazy(() => import('./UserPages/UserRefunds'));
const UserVisitors = lazy(() => import('./UserPages/UserVisitors'));
const UserUtilities = lazy(() => import('./UserPages/UserUtilities'));
const ServiceBooking = lazy(() => import('./UserPages/ServiceBooking'));
const ServiceCatalog = lazy(() => import('./UserPages/ServiceCatalog'));
import NotFound from './UserPages/NotFound';

// Admin Pages
const AdminDashboard = lazy(() => import('./AdminPages/AdminDashboard'));
const AdminUnits = lazy(() => import('./AdminPages/AdminUnits'));
const AdminTenants = lazy(() => import('./AdminPages/AdminTenants'));
const AdminApplications = lazy(() => import('./AdminPages/AdminApplications'));
const AdminPayments = lazy(() => import('./AdminPages/AdminPayments'));
const AdminRefunds = lazy(() => import('./AdminPages/AdminRefunds'));
const AdminMaintenance = lazy(() => import('./AdminPages/AdminMaintainance'));
const AdminAnnouncements = lazy(() => import('./AdminPages/AdminAnnouncements'));
const AdminReports = lazy(() => import('./AdminPages/AdminReports'));
const AdminNotifications = lazy(() => import('./AdminPages/AdminNotifications'));
const AdminContracts = lazy(() => import('./AdminPages/AdminContracts'));
const AdminServicePage = lazy(() => import('./AdminPages/AdminServicePage'));
const AdminAccountSettings = lazy(() => import('./AdminPages/AdminAccountSettings'));
const AdminPaymentOptions = lazy(() => import('./AdminPages/AdminPaymentOptions'));
const AdminDocumentRequirements = lazy(() => import('./AdminPages/AdminDocumentRequirements'));
const AdminOtherSettings = lazy(() => import('./AdminPages/AdminOtherSettings'));
const AdminActivityLogs = lazy(() => import('./AdminPages/AdminActivityLogs'));
const AdminUsers = lazy(() => import('./AdminPages/AdminUsers'));
const AdminVisitors = lazy(() => import('./AdminPages/AdminVisitors'));
const AdminCctv = lazy(() => import('./AdminPages/AdminCctv'));
const AdminParking = lazy(() => import('./AdminPages/AdminParking'));
const AdminUtilities = lazy(() => import('./AdminPages/AdminUtilities'));
const AdminInquiries = lazy(() => import('./AdminPages/AdminInquiries'));
const AdminMessages = lazy(() => import('./AdminPages/AdminMessages'));

function ProtectedRoute({ children }) {
  useLocation();
  const loggedInUser = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
  
  if (!loggedInUser) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminProtectedRoute({ children }) {
  useLocation();
  const loggedInUserStr = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
  
  if (!loggedInUserStr) {
    return <Navigate to="/login" replace />;
  }
  
  const loggedInUser = JSON.parse(loggedInUserStr);
  if (loggedInUser.role !== 'admin') {
    return <Navigate to="/home" replace />;
  }
  
  return children;
}

// FIXED: Added isCheckingRoom check to prevent premature redirecting on refresh
function TenantProtectedRoute({ children, hasRentedRoom, isCheckingRoom }) {
  const loggedInUserStr = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
  
  if (!loggedInUserStr) {
    return <Navigate to="/login" replace />;
  }
  
  const loggedInUser = JSON.parse(loggedInUserStr);
  if (loggedInUser.role === 'admin') {
    return children;
  }

  // Hold off on redirecting until the backend room check completes!
  if (isCheckingRoom) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-slate-900 text-white font-bold">
        Loading session...
      </div>
    );
  }
  
  if (!hasRentedRoom) {
    return <Navigate to="/home" replace />;
  }
  
  return children;
}

function AdminSettingsRedirect() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  if (tab === 'payments' || tab === 'payment-options') {
    return <Navigate to="/admin-payment-options" replace />;
  }
  if (tab === 'requirements') {
    return <Navigate to="/admin-requirements" replace />;
  }
  if (tab && tab !== 'account') {
    return <Navigate to={`/admin-other-settings?tab=${encodeURIComponent(tab)}`} replace />;
  }
  return <Navigate to="/admin-account-settings" replace />;
}

function BaseAppLayout({ children, hasRentedRoom }) {
  const navigate = useNavigate();
  const loggedInUserStr = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
  const loggedInUser = JSON.parse(loggedInUserStr || "null");
  const isLoggedIn = loggedInUser !== null;
  const username = isLoggedIn ? `${loggedInUser.first_name || ""} ${loggedInUser.last_name || ""}`.trim() : null;

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col text-slate-600 selection:bg-indigo-500 selection:text-white">
      <TopBar 
        hasRentedRoom={hasRentedRoom} 
        isLoggedIn={isLoggedIn} 
        username={username || "Guest"} 
        onLoginClick={() => navigate('/login')} 
      />
      <main className="w-full flex-grow flex flex-col justify-start overflow-x-hidden">
        {children}
      </main>
      <footer className="w-full bg-[#3b4276] py-5 text-center select-none shrink-0 border-t border-white/10">
        <p className="m-0 text-white/70 text-xs font-medium tracking-wider">
          &copy; 2026 Apartment Management System. All Rights Reserved.
        </p>
      </footer>
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [hasRentedRoom, setHasRentedRoom] = useState(false);
  // NEW: Track status loading to hold route evaluation
  const [isCheckingRoom, setIsCheckingRoom] = useState(true);

  useEffect(() => {
    const checkRoomStatus = async () => {
      setIsCheckingRoom(true); // Begin check
      const loggedInUserStr = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
      
      if (!loggedInUserStr) {
        setHasRentedRoom(false);
        setIsCheckingRoom(false);
        return;
      }
      
      const loggedInUser = JSON.parse(loggedInUserStr);
      if (loggedInUser.role === 'admin') {
        setHasRentedRoom(true);
        setIsCheckingRoom(false);
        return;
      }
      
      try {
        const res = await api.get(`/my_room.php?email=${encodeURIComponent(loggedInUser.email_address || '')}`);
        // Only a confirmed move-in makes the user a tenant. An Approved applicant —
        // even one whose first payment is confirmed — stays on Track Application
        // until the admin confirms occupancy (status 'active').
        if (res.data.success && res.data.data && ['active', 'pending-move-out'].includes(res.data.data.status?.toLowerCase())) {
          setHasRentedRoom(true);
        } else {
          setHasRentedRoom(false);
        }
      } catch (err) {
        console.error("Error checking room status:", err);
        setHasRentedRoom(false);
      } finally {
        setIsCheckingRoom(false); // Complete check
      }
    };
    checkRoomStatus();
  }, [location.pathname]);

  // Inquiries are open to guests, so this needs no login gate — unlike renting.
  const handleInquireTrigger = (roomId) => {
    navigate('/inquire', { state: { selectedRoomId: roomId } });
  };

  const handleRentActionTrigger = (roomId) => {
    const loggedInUser = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
    
    if (!loggedInUser) {
      navigate('/login', { state: { selectedRoomId: roomId } });
    } else {
      navigate('/rent-application', { state: { selectedRoomId: roomId } });
    }
  };

  return (
    <ChatProvider>
      <>
      <Suspense fallback={null}>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><Home onCardClick={() => navigate('/preview')} username={JSON.parse(sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser") || "{}").first_name} /></BaseAppLayout>} />
        <Route path="/preview" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><Preview onRentClick={handleRentActionTrigger} onInquireClick={handleInquireTrigger} /></BaseAppLayout>} />
        <Route path="/inquire" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><InquiryForm /></BaseAppLayout>} />
        
        {/* SECURED TENANT DASHBOARDS */}
        <Route path="/services" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><Services /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/pay-bills" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><ServiceRouteGuard settingKey="service_pay_bills_active"><BaseAppLayout hasRentedRoom={hasRentedRoom}><PayBills /></BaseAppLayout></ServiceRouteGuard></TenantProtectedRoute>} />
        <Route path="/parking-reservation" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><ServiceRouteGuard settingKey="service_parking_active"><BaseAppLayout hasRentedRoom={hasRentedRoom}><ParkingReservation /></BaseAppLayout></ServiceRouteGuard></TenantProtectedRoute>} />
        <Route path="/cctv-request" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><ServiceRouteGuard settingKey="service_cctv_active"><BaseAppLayout hasRentedRoom={hasRentedRoom}><CctvRequest /></BaseAppLayout></ServiceRouteGuard></TenantProtectedRoute>} />
        <Route path="/service-catalog" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><ServiceRouteGuard settingKey={['service_cleaning_active', 'service_laundry_active', 'service_other_active']}><BaseAppLayout hasRentedRoom={hasRentedRoom}><ServiceCatalog /></BaseAppLayout></ServiceRouteGuard></TenantProtectedRoute>} />
        <Route path="/service-booking" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><ServiceRouteGuard settingKey={['service_cleaning_active', 'service_laundry_active', 'service_other_active']}><BaseAppLayout hasRentedRoom={hasRentedRoom}><ServiceBooking /></BaseAppLayout></ServiceRouteGuard></TenantProtectedRoute>} />
        <Route path="/maintenance-request" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><ServiceRouteGuard settingKey="service_maintenance_active"><BaseAppLayout hasRentedRoom={hasRentedRoom}><MaintenanceRequest /></BaseAppLayout></ServiceRouteGuard></TenantProtectedRoute>} />
        <Route path="/rent-application" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><RentApplication /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/track-application" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><TrackApplication /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/upload-payment" element={<ProtectedRoute><ServiceRouteGuard settingKey="service_pay_bills_active" fallbackPath="/pay-bills"><BaseAppLayout hasRentedRoom={hasRentedRoom}><PaymentUpload /></BaseAppLayout></ServiceRouteGuard></ProtectedRoute>} />
        <Route path="/profile-settings" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><ProfileSettings /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/my-room" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><MyRoom /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/view-contract" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><ViewContract /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserNotifications /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/my-refunds" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserRefunds /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/my-requests" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserMyRequests /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/announcements" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserAnnouncements /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/payment-history" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserPaymentHistory /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/visitor-management" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><ServiceRouteGuard settingKey="service_visitor_management_active"><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserVisitors /></BaseAppLayout></ServiceRouteGuard></TenantProtectedRoute>} />
        <Route path="/user-utilities" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom} isCheckingRoom={isCheckingRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserUtilities /></BaseAppLayout></TenantProtectedRoute>} />
        
        {/* AUTH PATHS */}
        <Route path="/login" element={<Login onRegisterRedirect={() => navigate('/register')} onAdminRedirect={() => navigate('/admin-dashboard')} onHomeRedirect={() => navigate('/home')}/>} />
        <Route path="/register" element={<Registration onLoginRedirect={() => navigate('/login')} onHomeRedirect={() => navigate('/home')} />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ADMIN WORKSPACES */}
        <Route path="/admin-dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
        <Route path="/admin-inquiries" element={<AdminProtectedRoute><AdminInquiries /></AdminProtectedRoute>} />
        <Route path="/admin-applications" element={<AdminProtectedRoute><AdminApplications /></AdminProtectedRoute>} />
        <Route path="/admin-units" element={<AdminProtectedRoute><AdminUnits /></AdminProtectedRoute>} />
        <Route path="/admin-tenants" element={<AdminProtectedRoute><AdminTenants /></AdminProtectedRoute>} />
        <Route path="/admin-visitors" element={<AdminProtectedRoute><AdminVisitors /></AdminProtectedRoute>} />
        <Route path="/admin-parking" element={<AdminProtectedRoute><AdminParking /></AdminProtectedRoute>} />
        <Route path="/admin-payments" element={<AdminProtectedRoute><AdminPayments /></AdminProtectedRoute>} />
        <Route path="/admin-refunds" element={<AdminProtectedRoute><AdminRefunds /></AdminProtectedRoute>} />
        <Route path="/admin-maintenance" element={<AdminProtectedRoute><AdminMaintenance /></AdminProtectedRoute>} />
        <Route path="/admin-cctv" element={<AdminProtectedRoute><AdminCctv /></AdminProtectedRoute>} />
        <Route path="/admin-announcements" element={<AdminProtectedRoute><AdminAnnouncements /></AdminProtectedRoute>} />
        <Route path="/admin-reports" element={<AdminProtectedRoute><AdminReports /></AdminProtectedRoute>} />
        <Route path="/admin-notifications" element={<AdminProtectedRoute><AdminNotifications /></AdminProtectedRoute>} />
        <Route path="/admin-contracts" element={<AdminProtectedRoute><AdminContracts /></AdminProtectedRoute>} />
        {/* The template is edited on the Contracts page's Template Editor tab; old links land there. */}
        <Route path="/admin-contract-editor" element={<AdminProtectedRoute><Navigate to="/admin-contracts?tab=editor" replace /></AdminProtectedRoute>} />
        <Route path="/admin-services" element={<AdminProtectedRoute><AdminServicePage /></AdminProtectedRoute>} />
        <Route path="/admin-account-settings" element={<AdminProtectedRoute><AdminAccountSettings /></AdminProtectedRoute>} />
        <Route path="/admin-payment-options" element={<AdminProtectedRoute><AdminPaymentOptions /></AdminProtectedRoute>} />
        <Route path="/admin-requirements" element={<AdminProtectedRoute><AdminDocumentRequirements /></AdminProtectedRoute>} />
        <Route path="/admin-other-settings" element={<AdminProtectedRoute><AdminOtherSettings /></AdminProtectedRoute>} />
        <Route path="/admin-settings" element={<AdminProtectedRoute><AdminSettingsRedirect /></AdminProtectedRoute>} />
        <Route path="/admin-activity-logs" element={<AdminProtectedRoute><AdminActivityLogs /></AdminProtectedRoute>} />
        <Route path="/admin-users" element={<AdminProtectedRoute><AdminUsers /></AdminProtectedRoute>} />
        <Route path="/admin-utilities" element={<AdminProtectedRoute><AdminUtilities /></AdminProtectedRoute>} />
        <Route path="/admin-messages" element={<AdminProtectedRoute><AdminMessages /></AdminProtectedRoute>} />

        {/* Anything else: a 404 page instead of a blank screen */}
        <Route path="*" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><NotFound /></BaseAppLayout>} />
      </Routes>
      </Suspense>
        {!['/login', '/register', '/admin-messages'].includes(location.pathname)
          && ((sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser')) || localStorage.getItem('ams_guest_token'))
          && <ChatWidget />}
      </>
    </ChatProvider>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}