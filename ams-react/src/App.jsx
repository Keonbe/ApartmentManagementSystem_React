import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import api from './api/axiosConfig';

//Components
import TopBar from './Components/TopBar';
import LogInModal from './Components/LogInModal';
import Footer from './Components/Footer';

//User Pages
import Home from './UserPages/Home';
import Preview from './UserPages/Preview';
import Login from './UserPages/Login';
import Registration from './UserPages/Registration';
import Services from './UserPages/Services';
import PayBills from './UserPages/PayBills';
import ParkingReservation from './UserPages/ParkingReservation';
import CctvRequest from './UserPages/CctvRequest'; 
import MaintenanceRequest from './UserPages/MaintenanceRequest'; 
import RentApplication from './UserPages/RentApplication';
import ProfileSettings from './UserPages/ProfileSettings';
import TrackApplication from './UserPages/TrackApplication';
import PaymentUpload from './UserPages/PaymentUpload';
import MyRoom from './UserPages/MyRoom';
import UserNotifications from './UserPages/UserNotifications';
import ViewContract from './UserPages/ViewContract';
import UserMyRequests from './UserPages/UserMyRequests';
import UserAnnouncements from './UserPages/UserAnnouncements';
import UserPaymentHistory from './UserPages/UserPaymentHistory';
//Admin Pages
import AdminDashboard from './AdminPages/AdminDashboard';
import AdminUnits from './AdminPages/AdminUnits';
import AdminTenants from './AdminPages/AdminTenants';
import AdminApplications from './AdminPages/AdminApplications';
import AdminPayments from './AdminPages/AdminPayments';
import AdminMaintenance from './AdminPages/AdminMaintainance';
import AdminAnnouncements from './AdminPages/AdminAnnouncements';
import AdminReports from './AdminPages/AdminReports';
import AdminNotifications from './AdminPages/AdminNotifications';
import AdminContracts from './AdminPages/AdminContracts';
import AdminServicePage from './AdminPages/AdminServicePage';
import AdminAccountSettings from './AdminPages/AdminAccountSettings';
import AdminActivityLogs from './AdminPages/AdminActivityLogs';

//Client-side access controller middleware component block
function ProtectedRoute({ children }) {
  const loggedInUser = sessionStorage.getItem("loggedInUser");
  
  if (!loggedInUser) {
    {/*Redirect unauthenticated users immediately back to login window path*/}
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Admin-only protection layer
function AdminProtectedRoute({ children }) {
  const loggedInUserStr = sessionStorage.getItem("loggedInUser");
  
  if (!loggedInUserStr) {
    return <Navigate to="/login" replace />;
  }
  
  const loggedInUser = JSON.parse(loggedInUserStr);
  if (loggedInUser.role !== 'admin') {
    return <Navigate to="/home" replace />;
  }
  
  return children;
}

// Tenant-only protection layer
function TenantProtectedRoute({ children, hasRentedRoom }) {
  const loggedInUserStr = sessionStorage.getItem("loggedInUser");
  
  if (!loggedInUserStr) {
    return <Navigate to="/login" replace />;
  }
  
  const loggedInUser = JSON.parse(loggedInUserStr);
  if (loggedInUser.role === 'admin') {
    return children;
  }
  
  if (!hasRentedRoom) {
    return <Navigate to="/home" replace />;
  }
  
  return children;
}

//Conditional Layout Wrapper Framework Component containing universal global Footer injection
function BaseAppLayout({ children, hasRentedRoom }) {
  const navigate = useNavigate();
  const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
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
      {/*Flex container expands to push footer to bottom flawlessly on shorter page view nodes*/}
      <main className="w-full flex-grow flex flex-col justify-start">
        {children}
      </main>
      <Footer /> {/*Enforces structural blue uniform layout footer area block tracking element rules universally*/}
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [hasRentedRoom, setHasRentedRoom] = useState(false);

  useEffect(() => {
    const checkRoomStatus = async () => {
      const loggedInUserStr = sessionStorage.getItem("loggedInUser");
      if (!loggedInUserStr) {
        setHasRentedRoom(false);
        return;
      }
      const loggedInUser = JSON.parse(loggedInUserStr);
      if (loggedInUser.role === 'admin') {
        setHasRentedRoom(true);
        return;
      }
      try {
        const res = await api.get('/my_room.php');
        if (res.data.success && res.data.data && res.data.data.status === 'Approved' && !res.data.data.has_pending_first_payment) {
          setHasRentedRoom(true);
        } else {
          setHasRentedRoom(false);
        }
      } catch (err) {
        console.error("Error checking room status:", err);
        setHasRentedRoom(false);
      }
    };
    checkRoomStatus();
  }, [location.pathname]);

  //Global Route Action Protection Layer
  const handleRentActionTrigger = (roomId) => {
    const loggedInUser = sessionStorage.getItem("loggedInUser");
    
    if (!loggedInUser) {
      setIsModalOpen(true);
    } else {
      navigate('/rent-application', { state: { selectedRoomId: roomId } });
    }
  };

  return (
    <>
      <Routes>
        {/*UNIFIED PUBLIC PATHWAYS*/}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><Home onCardClick={() => navigate('/preview')} username={JSON.parse(sessionStorage.getItem("loggedInUser") || "{}").first_name} /></BaseAppLayout>} />
        <Route path="/preview" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><Preview onRentClick={handleRentActionTrigger} /></BaseAppLayout>} />
        
        {/*SECURED TENANT DASHBOARDS SERVICES (WRAPPED IN PROTECTED ROUTE CONTROLLERS)*/}
        <Route path="/services" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><Services /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/pay-bills" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><PayBills /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/parking-reservation" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><ParkingReservation /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/cctv-request" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><CctvRequest /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/maintenance-request" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><MaintenanceRequest /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/rent-application" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><RentApplication /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/track-application" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><TrackApplication /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/upload-payment" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><PaymentUpload /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/profile-settings" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><ProfileSettings /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/my-room" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><MyRoom /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/view-contract" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><ViewContract /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserNotifications /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/my-requests" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserMyRequests /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/announcements" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserAnnouncements /></BaseAppLayout></TenantProtectedRoute>} />
        <Route path="/payment-history" element={<TenantProtectedRoute hasRentedRoom={hasRentedRoom}><BaseAppLayout hasRentedRoom={hasRentedRoom}><UserPaymentHistory /></BaseAppLayout></TenantProtectedRoute>} />
        {/*SECURITY AUTH TARGET SCHEMAS*/}
        <Route path="/login" element={<Login onRegisterRedirect={() => navigate('/register')} onAdminRedirect={() => navigate('/admin-dashboard')} onHomeRedirect={() => navigate('/home')}/>} />
        <Route path="/register" element={<Registration onLoginRedirect={() => navigate('/login')} />} />

        {/*ADMIN OPERATION PANEL WORKSPACES*/}
        <Route path="/admin-dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
        <Route path="/admin-applications" element={<AdminProtectedRoute><AdminApplications /></AdminProtectedRoute>} />
        <Route path="/admin-units" element={<AdminProtectedRoute><AdminUnits /></AdminProtectedRoute>} />
        <Route path="/admin-tenants" element={<AdminProtectedRoute><AdminTenants /></AdminProtectedRoute>} />
        <Route path="/admin-payments" element={<AdminProtectedRoute><AdminPayments /></AdminProtectedRoute>} />
        <Route path="/admin-maintenance" element={<AdminProtectedRoute><AdminMaintenance /></AdminProtectedRoute>} />
        <Route path="/admin-announcements" element={<AdminProtectedRoute><AdminAnnouncements /></AdminProtectedRoute>} />
        <Route path="/admin-reports" element={<AdminProtectedRoute><AdminReports /></AdminProtectedRoute>} />
        <Route path="/admin-notifications" element={<AdminProtectedRoute><AdminNotifications /></AdminProtectedRoute>} />
        <Route path="/admin-contracts" element={<AdminProtectedRoute><AdminContracts /></AdminProtectedRoute>} />
        <Route path="/admin-services" element={<AdminProtectedRoute><AdminServicePage /></AdminProtectedRoute>} />
        <Route path="/admin-settings" element={<AdminProtectedRoute><AdminAccountSettings /></AdminProtectedRoute>} />
        <Route path="/admin-activity-logs" element={<AdminProtectedRoute><AdminActivityLogs /></AdminProtectedRoute>} />
      </Routes>

      <LogInModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onLoginRedirect={() => {
          setIsModalOpen(false);
          navigate('/login');
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}